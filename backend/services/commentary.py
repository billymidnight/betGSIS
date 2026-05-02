"""AI-driven race commentary — pre-race hype + post-race call.

Architecture
------------
Two phases:
  • PRE_RACE  — fires when the racebook view loads. ~30-50 s of caller patter
                introducing the field, the favorite, side-market value, side
                bets, country call-outs, and last year's winner. Cuts when
                the user clicks "Confirm & Race".
  • POST_RACE — fires when the official-result modal pops. ~25-40 s call of
                the finishing order with times, upset/chalk framing, record
                comparisons, country shoutouts.

Pipeline per call:
  1. `build_*_context()` aggregates a rich JSON payload from the field +
     odds + recent horse_results query.
  2. `generate_text()` calls GPT (default `gpt-4o`) with a heavy system
     prompt that teaches the caller cadence and required phrases.
  3. `generate_audio()` calls OpenAI TTS (default `tts-1-hd` at voice
     `onyx`, speed `1.15`) and returns mp3 bytes.

Caller-conditional inserts (rolled by us, not the LLM, then woven in):
  • 30 % chance: a "Yaya Merchant / betGSIS / sharpest bettors" line.
  • 20 % chance: a "Naresh A bet his life savings" line.
"""
from __future__ import annotations

import os
import random
import re
from typing import Any, Dict, List, Optional

from openai import OpenAI

# ───── Tunables ──────────────────────────────────────────────────────
# gpt-4o-mini is dramatically faster than gpt-4o for this task (1-2 s vs
# 4-8 s) and just as good at horse-race patter — the bottleneck is TTS
# anyway. Override via env if you want to upgrade quality at the cost of
# first-audio latency.
TEXT_MODEL          = os.environ.get('OPENAI_COMMENTARY_TEXT_MODEL',  'gpt-4o-mini')
# gpt-4o-mini-tts supports `instructions` for tone/pace direction — use it
# to push the voice deeper + faster than the legacy tts-1-hd default.
TTS_MODEL           = os.environ.get('OPENAI_COMMENTARY_TTS_MODEL',   'gpt-4o-mini-tts')
# `fable` is the British male voice in OpenAI's catalogue. Combined with
# the `instructions` below it produces a Cheltenham/Aintree caller feel
# — refined, projecting, with the rolling cadence British race-callers use.
TTS_VOICE           = os.environ.get('OPENAI_COMMENTARY_TTS_VOICE',   'fable')
TTS_SPEED           = float(os.environ.get('OPENAI_COMMENTARY_TTS_SPEED', '1.18'))
TTS_INSTRUCTIONS    = os.environ.get(
    'OPENAI_COMMENTARY_TTS_INSTRUCTIONS',
    'Speak with a refined, projecting BRITISH male voice — the cadence of a '
    'legendary Cheltenham or Aintree horse-racing announcer. Crisp received '
    'pronunciation, classic UK race-caller delivery. Pace is FAST and '
    'rhythmic — punchy short bursts alternating with sweeping rolling builds, '
    'with the tell-tale British uptick on the favourite reveal. Drop into a '
    'lower register on dramatic upset moments. NEVER sound American — always '
    'British. Project loudly. Sound like the audience is on the edge of their '
    'seats at a major UK racing carnival.'
)
PRE_RACE_TEMPERATURE  = 1.05         # was 1.30; high temp was occasionally
                                     # collapsing the LLM into word-salad
                                     # gibberish. 1.05 keeps the riff lively
                                     # without destabilising the head.
POST_RACE_TEMPERATURE = 1.0
# OpenAI frequency_penalty — small positive value discourages the loops
# of repeated tokens that show up when the model goes off the rails. Too
# high makes the prose feel choppy; 0.45 hits the sweet spot for callers.
PRE_RACE_FREQ_PENALTY  = 0.45
POST_RACE_FREQ_PENALTY = 0.30
FAN_FREQ_PENALTY       = 0.40
# IMPORTANT — gpt-4o-mini-tts caps INPUT at 2000 tokens (~7-8k chars). And
# longer text means SLOWER TTS (linear in length). We deliberately keep
# clips short so first-audio latency stays low; the frontend loop keeps
# fetching new clips so aggregate duration is unbounded.
#   • 700 GPT tokens  ≈ 2800 chars output
#   • TTS on 2800 chars ≈ 7-10 s server time
#   • 30-40 s of audio per clip, then loop pulls the next one
PRE_RACE_MAX_TOKENS   = 700
POST_RACE_MAX_TOKENS  = 600
TTS_INPUT_CHAR_CAP    = 6500         # belt-and-braces: hard truncate before TTS

# Probability gates for the user's specific phrase inserts.
P_INSERT_YAYA          = 0.30
P_INSERT_NARESH        = 0.20
P_INSERT_CONGRESS      = 0.18    # speculative US-Congressmen rumor line
P_INSERT_PAMMIE        = 0.32    # Pam Merchant going round telling people to bet
P_INSERT_OOTACAMUND    = 0.28    # Justin & Praveen Ootacamund stochastics line
P_INSERT_CELEB_SHIP    = 0.32    # "X just shipped $25M on Y" + Billy Walters tag
P_INSERT_FIVE_FAMILIES = 0.20    # NY Five Families fix-rumor line

# Reusable conditional phrases (kept verbatim — the prompt asks the LLM to
# weave them in word-for-word at a natural moment in the patter).
PHRASE_YAYA = (
    "Major sportsbooks like betGSIS are waiting for the sharpest bettors "
    "like Yaya Merchant to get their volume in on this race."
)
PHRASE_NARESH = (
    "Commotion by the brick and mortar betting stalls! It looks like Naresh A "
    "has just bet his entire life savings on some horse. Spokespersons are "
    "desperate to find out what horse he just bet."
)
PHRASE_BILLY_WALTERS = (
    "Is he a liquidation merchant or is he an EV-hunting vulture? "
    "Is he the future Billy Walters?"
)
# Verbatim US-Congress fix-rumor line. The placeholder {horse} is filled in
# with a random horse from the field by code (so the LLM doesn't have to
# pick — keeps it stable and unpredictable for the listener).
PHRASE_US_CONGRESS_TEMPLATE = (
    "There have been speculative rumors about US Congressmen having fixed "
    "this race and paying {horse}'s jockey to lose by ten lengths at least. "
    "Do we trust our US reps enough to continue wagering into this pool?"
)

# Pam Merchant — recreational bettor moonlighting as a self-appointed
# tipster. The {horse} is a random horse from THIS field. Filled in code
# so the LLM has nothing to guess.
PHRASE_PAMMIE_TEMPLATE = (
    "Recreational bettor Pam Merchant Pammie Boy has been going around the "
    "stands telling people to bet on horse {horse}. His reasoning is that "
    "he just knows this is going to happen. Cautious noticers are worried "
    "Pam will tell them \"told you so\" anyway even if {horse} does not win."
)

# Ootacamund Physicists — analytical line. The placeholders are picked
# server-side from the live odds:
#   {winby_seconds} = pre-race winby_seconds threshold
#   {horse_y}, {horse_z} = two horses with finish-last odds AT MOST +400
#                          (i.e. they're priced as legitimately likely to
#                          finish far back). When fewer than 2 horses
#                          qualify, the phrase is left null and skipped.
PHRASE_OOTACAMUND_TEMPLATE = (
    "Renowned Ootacamund Physicists Justin and Praveen are locking in "
    "studying the acceleration stochastics of this race. They think there "
    "is good value on the First Place wins by greater than {winby_seconds} "
    "seconds, given that horses like {horse_y} and {horse_z} are prone to "
    "finishing last by some distance."
)

# Celebrity ship — verbatim with a random celebrity name + a random
# horse from THIS field substituted in. Includes its own Billy Walters
# tag, so when this fires we suppress the standalone billy_walters
# insert to avoid the LLM saying it twice.
PHRASE_CELEB_SHIP_TEMPLATE = (
    "Word from the betting window. {celebrity} has just shipped "
    "twenty-five million dollars on {horse}. Is he a liquidation "
    "merchant or an EV-hunting vulture. Is he the new Billy Walters."
)

# NY Five Families fix rumor — picks TWO random different horses A and
# B from the field. Skipped when the field has fewer than 2 horses
# (impossible in practice; defensive guard).
PHRASE_FIVE_FAMILIES_TEMPLATE = (
    "The Jewish betting elite are suspecting targeted scandals from the "
    "New York Five Families who are suspected to have fixed this race "
    "threatening the families of the jockeys of {horse_a} and {horse_b} "
    "in asking them to finish dead last."
)

# Premier-League pundit roster. Pre-race context picks ONE per call and
# attaches them to a random horse — the system prompt requires the LLM to
# attribute that pick verbatim ("Roy Keane is on Symphony Elizabeth to win").
FOOTBALL_PUNDITS: List[str] = [
    'Jamie Carragher', 'Micah Richards', 'Gary Neville', 'Roy Keane',
]

# ── betGSIS in-house special celebrities ──────────────────────────────
# These get sampled into celebrity_bets at a ELEVATED rate so the
# announcer namedrops the local in-jokes regularly. Spelt VERBATIM with
# their full descriptor; the prompt enforces that they're never abbreviated.
GSIS_CELEBRITIES: List[str] = [
    'Muthumanickam of the Math Department',
    'Bellie Raj of the Chemistry Department',
    "Dominic Jude Hurst of the Boxing Department South of the Dhobi Bag Near St. Bernard's dorm",
]
# Weight per celebrity_bets pairing: probability that THIS pairing's celeb
# is drawn from the GSIS specials rather than the broad CELEBRITIES roster.
P_PICK_GSIS_CELEB = 0.45

# ── Fan-in-the-stands phase config ────────────────────────────────────
# The frontend pre-race loop occasionally fetches a 'fan' clip instead of
# a regular announcer continuation. The fan is a degenerate gambler in
# the stands talking up his own bet. We rotate through three accent
# personas evenly. Each persona has a TTS voice + a persona-specific
# `instructions` direction.
FAN_PERSONAS = {
    'indian': {
        'name_pool':    ['Rajesh', 'Vikram', 'Suresh', 'Arjun', 'Pradeep', 'Kiran', 'Manoj', 'Ramesh', 'Anil'],
        'tts_voice':    'shimmer',
        'instructions': (
            'CRITICAL: Speak with a HEAVY, EXAGGERATED Indian English accent — '
            'thick South Indian / Tamil-Telugu inflection, prominent retroflex '
            'consonants, sing-song pitch with every sentence rising and falling '
            'in the classic head-wobble cadence. Pronounce "v" closer to "w" '
            'and "w" closer to "v" — say "wery" for "very" and "vorld" for '
            '"world". Pronounce "th" as "d" or "t" — "this" sounds like "dis", '
            '"think" sounds like "tink". Roll the R\'s lightly. STRESS the '
            'wrong syllables — say de-VEL-op-ment, in-FOR-ma-tion. End MANY '
            'sentences with rising intonation tags: "no?", "isn\'t it?", '
            '"only", "yaar", "boss", "no-no-no". Sprinkle filler like '
            '"actually-actually", "what to say", "I am telling you", "you '
            'see-you see". The character is an utterly degenerate punter who '
            'is far too excitable about this race. Speak FAST, with energetic '
            'theatrical bursts — picture a kurta-clad uncle yelling at the TV '
            'during an India-Pakistan cricket match. Make the accent so '
            'unmistakably Indian that a listener identifies it within the '
            'first three words.'
        ),
    },
    'american': {
        'name_pool':    ['Jimmy', 'Tony', 'Vince', 'Hank', 'Carl', 'Dwight', 'Ray'],
        'tts_voice':    'ash',
        'instructions': (
            'Speak with a heavy New York / New Jersey blue-collar American '
            'accent — gravelly, working-class, like a Tony Soprano regular '
            'at the OTB window. The character is a degenerate gambler who '
            "swears he's got the winner. Slightly slurred, leaning loud."
        ),
    },
    'chinese': {
        'name_pool':    ['Wei', 'Chen', 'Liu', 'Zhang', 'Mister Wong', 'Old Lin', 'Big Zhou'],
        'tts_voice':    'echo',
        'instructions': (
            'Speak with a thick Chinese English accent — Cantonese/Mandarin '
            'inflection, broken English. The character is a degenerate '
            'baccarat-veteran-now-on-horses gambler. Excited, slightly '
            'frantic. Drop English articles ("a", "the") naturally as a '
            'second-language speaker would. Medium pace.'
        ),
    },
    # GATED: only ever rolled when Light Yagami is in today's field. The
    # frontend enforces this gate before sending accent="japanese". The
    # commentator-handoff intro is baked into the FAN_SYSTEM prompt for
    # Japanese specifically (see "JAPANESE INTRO REQUIREMENT" below).
    'japanese': {
        'name_pool':    ['Hiroshi', 'Takeshi', 'Yuki', 'Kenji', 'Daisuke', 'Akira', 'Ryo'],
        'tts_voice':    'onyx',
        'instructions': (
            'Speak with a clear Japanese English accent — typical Japanese '
            'phonetic patterns: drop final consonant clusters, soften "L" '
            'and "R" so they sound similar, lengthen vowels at the end of '
            'borrowed English words ("Light Yagami-san"). Polite cadence, '
            'measured tempo — slower than the Indian/Chinese fans. Sprinkle '
            '"ne?", "desu", "hai", and the occasional "Yagami-san" / '
            '"-sensei". The character is an extremely composed-yet-superfan '
            'follower of Light Yagami who has flown in from Tokyo for this '
            'race. Open in announcer-handoff mode, clearly labelled as a '
            'crowd interview because Light Yagami fans are a NOTABLE event '
            'this is the first English Japanese fan we are hearing from at '
            'Churchill Downs.'
        ),
    },
}

# Big, intentionally chaotic celebrity roster — sport, music, screen, politics,
# tech, internet. The LLM picks pairings; we give it a deep bench so each race
# samples something fresh.
CELEBRITIES: List[str] = [
    # NBA / NFL / soccer / tennis / golf / boxing
    'LeBron James', 'Stephen Curry', 'Patrick Mahomes', 'Tom Brady',
    'Cristiano Ronaldo', 'Lionel Messi', 'Erling Haaland', 'Kylian Mbappé',
    'Serena Williams', 'Roger Federer', 'Rafael Nadal', 'Novak Djokovic',
    'Tiger Woods', 'Rory McIlroy', 'Floyd Mayweather', 'Mike Tyson',
    # Music
    'Drake', 'Taylor Swift', 'The Weeknd', 'Beyoncé', 'Rihanna',
    'Travis Scott', 'Bad Bunny', 'Bruno Mars', 'Kanye West', 'Kendrick Lamar',
    'Ed Sheeran', 'Adele', 'Post Malone', 'Snoop Dogg', '50 Cent',
    # Screen — actors
    'Leonardo DiCaprio', 'Tom Cruise', 'Margot Robbie', 'Brad Pitt',
    'Will Smith', 'Denzel Washington', 'Robert Downey Jr.', 'Scarlett Johansson',
    'Ryan Reynolds', 'Dwayne Johnson', 'Keanu Reeves', 'Jennifer Lawrence',
    'Christian Bale', 'Cillian Murphy', 'Joaquin Phoenix', 'Anya Taylor-Joy',
    # Screen — directors
    'Martin Scorsese', 'Quentin Tarantino', 'Christopher Nolan',
    'Steven Spielberg', 'Greta Gerwig', 'Denis Villeneuve',
    # Politics / world figures
    'Barack Obama', 'Donald Trump', 'Joe Biden', 'Vladimir Putin',
    'Emmanuel Macron', 'Narendra Modi', 'Kim Jong-un', 'Xi Jinping',
    'Volodymyr Zelensky', 'Angela Merkel', 'Justin Trudeau', 'Rishi Sunak',
    'Benjamin Netanyahu', 'Mohammed bin Salman', 'Recep Tayyip Erdoğan',
    # Tech
    'Elon Musk', 'Jeff Bezos', 'Mark Zuckerberg', 'Bill Gates', 'Sam Altman',
    'Tim Cook', 'Sundar Pichai', 'Satya Nadella',
    # Internet / influencer
    'Jake Paul', 'Logan Paul', 'MrBeast', 'Andrew Tate', 'PewDiePie',
    'Ninja', 'Dream', 'KSI', 'iShowSpeed',
    # Royalty / business / culture
    'Warren Buffett', 'Oprah Winfrey', 'Mark Cuban', 'Jay-Z',
    'King Charles III', 'Prince William', 'Pope Francis', 'Dalai Lama',
    # NOTE: betGSIS specials live in GSIS_CELEBRITIES and are sampled
    # separately (45 % per slot) so they surface on most clips, not as a
    # rare 1-in-80 event from this broad pool.
]


# ───── Odds → speech-friendly phrase ────────────────────────────────
def _odds_to_speech(american: Optional[int]) -> Optional[str]:
    """Render American odds as the EXACT WORDS we want the announcer to say.

    The TTS engine mispronounces literal "+222" / "-180" — sometimes flipping
    the sign or saying nothing for the symbol. We solve it by emitting the
    odds as fully-spelled English so the LLM has no excuse to invent a sign.

    Examples
    --------
        +222    → "plus two-hundred and twenty-two"
        -180    → "minus one-hundred and eighty"
        +22000  → "plus twenty-two thousand to one — a true longshot"
        -10000  → "minus ten thousand — chalk-of-chalks"
    """
    if american is None:
        return None
    sign = 'plus' if american > 0 else 'minus'
    abs_o = abs(int(american))
    if abs_o >= 10000:
        # Spell out millions/thousands as round numbers.
        thou = abs_o // 1000
        if abs_o >= 100000:
            return f'{sign} {thou} thousand — a six-figure number'
        return f'{sign} {thou} thousand — a true longshot'
    if abs_o >= 1000:
        thou = abs_o // 1000
        rem = abs_o % 1000
        if rem == 0:
            return f'{sign} {thou} thousand'
        return f'{sign} {thou} thousand {rem}'
    # Sub-thousand — natural English.
    if abs_o == 0:
        return 'even money'
    return f'{sign} {abs_o}'


# ───── OpenAI client (lazy singleton) ────────────────────────────────
_client: Optional[OpenAI] = None
def _get_client() -> OpenAI:
    global _client
    if _client is None:
        api_key = os.environ.get('OPENAI_API_KEY')
        if not api_key:
            raise RuntimeError(
                'OPENAI_API_KEY missing — set it in backend/.env to enable commentary.'
            )
        _client = OpenAI(api_key=api_key)
    return _client


# ───── Edition / formatting helpers ──────────────────────────────────
EDITION_BASE_YEAR = 1707


def _ordinal(n: int) -> str:
    v = abs(n) % 100
    if 11 <= v <= 13:
        return f'{n}th'
    return f'{n}{ {1:"st",2:"nd",3:"rd"}.get(v % 10, "th") }'


def _edition_label(year: int) -> str:
    return f'{_ordinal(year - EDITION_BASE_YEAR + 1)} Edition'


def _country_full_name(iso: Optional[str]) -> Optional[str]:
    if not iso:
        return None
    table = {
        'US': 'American', 'GB': 'British', 'FR': 'French', 'DE': 'German',
        'IT': 'Italian',  'IN': 'Indian',  'JP': 'Japanese', 'IL': 'Israeli',
        'IS': 'Icelandic', 'RO': 'Romanian', 'CO': 'Colombian', 'AL': 'Albanian',
        'MX': 'Mexican',
    }
    return table.get(iso.upper(), iso.upper())


# ───── Context builders — pull everything we have from the DB ────────
def build_pre_race_context(
    *,
    field: List[Dict[str, Any]],
    odds: Dict[str, Any],
    year: int,
    distance: int,
    last_race_results: Optional[List[Dict[str, Any]]] = None,
    per_horse_history: Optional[Dict[int, Dict[str, Any]]] = None,
    full_catalogue: Optional[List[Dict[str, Any]]] = None,
    countries_seeking_first_win: Optional[List[str]] = None,
    last_n_year_winners: Optional[List[Dict[str, Any]]] = None,
    spotlight_horse: Optional[Dict[str, Any]] = None,
    field_records: Optional[List[Dict[str, Any]]] = None,
    is_continuation: bool = False,
) -> Dict[str, Any]:
    """Build the JSON-ish payload the GPT system prompt operates on.

    Parameters
    ----------
    field : list of horses with their post_position + bio.
    odds  : the /odds response (we read win odds + favorite/underdog).
    year  : current year_counter (= year of THIS race).
    last_race_results : top finishers from the previous year, if any.
    per_horse_history : per-horse summary keyed by horse_id.
    full_catalogue : every horse in the catalogue — used to derive who's
                     NOT racing today, so the announcer can riff on absences
                     ("they're lucky Secretariat skipped this one").
    countries_seeking_first_win : ISO codes that have horses in the
                     catalogue but have NEVER won a recorded race.
    """
    win = odds.get('win', {})
    place_odds = odds.get('place', {}) or {}
    show_odds  = odds.get('show', {})  or {}
    finish_last_odds = odds.get('finish_last', {}) or {}

    # Resolve per-horse win odds + flag favorite / longshot.
    enriched: List[Dict[str, Any]] = []
    for h in field:
        hid = str(h['horse_id'])
        q  = win.get(hid)         or {}
        qp = place_odds.get(hid)  or {}
        qs = show_odds.get(hid)   or {}
        ql = finish_last_odds.get(hid) or {}
        american = q.get('american')
        history = (per_horse_history or {}).get(int(h['horse_id'])) or {}
        enriched.append({
            'horse_id':       int(h['horse_id']),
            'post_position':  h.get('post_position'),
            'full_name':      h['full_name'],
            'saddle_name':    h.get('saddle_name'),
            'description':    h.get('description'),
            'country_code':   h.get('country'),
            'country_demonym': _country_full_name(h.get('country')),
            'mean_speed':     float(h.get('mean_speed', 0) or 0),
            'volatility':     float(h.get('speed_volatility', 0) or 0),
            'composure':      float(h.get('pace_stickiness', 0) or 0),
            'win_american':   american,
            'win_decimal':    q.get('decimal'),
            'win_probability': q.get('probability'),
            # CRITICAL: spell odds out as words. The TTS misreads literal
            # "+222" — this is the canonical phrase the announcer should use.
            'win_odds_speech':         _odds_to_speech(american),
            'place_odds_speech':       _odds_to_speech(qp.get('american')),
            'show_odds_speech':        _odds_to_speech(qs.get('american')),
            'finish_last_odds_speech': _odds_to_speech(ql.get('american')),
            'history': {
                'participations':   history.get('participations', 0),
                'wins':             history.get('wins', 0),
                'places':           history.get('places', 0),
                'shows':            history.get('shows', 0),
                'best_seconds':     history.get('best_seconds'),
                # Last up-to-3 finish times + positions + years (most-recent first).
                # The announcer is required to namedrop these for at least
                # one horse per clip ("their last three over this trip:
                # 9.4, 9.7, 9.1 — sharp form, 1722, 1721, 1720").
                'last_3_seconds':   history.get('last_3_seconds') or [],
                'last_3_positions': history.get('last_3_positions') or [],
                'last_3_years':     history.get('last_3_years') or [],
                # Most-recent podium tier hits + years_ago for each.
                # Lets the announcer say "her last win was 8 years ago" or
                # "hasn't shown in the trifecta in 5 years".
                'last_win_year':         history.get('last_win_year'),
                'last_win_seconds':      history.get('last_win_seconds'),
                'last_win_years_ago':    history.get('last_win_years_ago'),
                'last_place_year':       history.get('last_place_year'),
                'last_place_position':   history.get('last_place_position'),
                'last_place_years_ago':  history.get('last_place_years_ago'),
                'last_show_year':        history.get('last_show_year'),
                'last_show_position':    history.get('last_show_position'),
                'last_show_years_ago':   history.get('last_show_years_ago'),
            },
        })

    by_prob = sorted(enriched, key=lambda h: (h['win_probability'] or 0), reverse=True)
    favorite = by_prob[0] if by_prob else None
    longshot = by_prob[-1] if by_prob else None
    value_pick = by_prob[2] if len(by_prob) >= 3 else None

    # Country uniqueness within THIS field.
    country_counts: Dict[str, int] = {}
    for h in enriched:
        c = h['country_code']
        if c:
            country_counts[c] = country_counts.get(c, 0) + 1
    sole_country_horses = [
        h for h in enriched
        if h['country_code'] and country_counts.get(h['country_code']) == 1
    ]

    # Horses NOT in this field — fodder for "lucky he skipped today" patter.
    field_ids = {int(h['horse_id']) for h in field}
    undrafted: List[Dict[str, Any]] = []
    if full_catalogue:
        for h in full_catalogue:
            if int(h['horse_id']) in field_ids:
                continue
            undrafted.append({
                'horse_id':       int(h['horse_id']),
                'full_name':      h['full_name'],
                'saddle_name':    h.get('saddle_name'),
                'country_code':   h.get('country'),
                'country_demonym': _country_full_name(h.get('country')),
                'mean_speed':     float(h.get('mean_speed', 0) or 0),
                'description':    (h.get('description') or '')[:240],   # trim — context-only
            })
        # Surface the FASTEST undrafted horse most prominently for "lucky for
        # this field that X isn't here" framing.
        undrafted.sort(key=lambda h: h['mean_speed'], reverse=True)

    # Roll celebrity bet pairings — 1 to 3 celebs paired with random horses
    # from the field. EACH SLOT has P_PICK_GSIS_CELEB chance of being a
    # betGSIS in-house special instead of a broad-pool celebrity, so the
    # local in-jokes (Muthumanickam, Bellie Raj, Dominic Jude Hurst…)
    # surface on most clips rather than as a 1-in-80 lottery.
    n_celebs = random.choices([1, 2, 3], weights=[3, 6, 4])[0]
    celebrity_bets: List[Dict[str, Any]] = []
    if enriched:
        used_celebs: List[str] = []
        for _ in range(n_celebs):
            if random.random() < P_PICK_GSIS_CELEB:
                pool = [c for c in GSIS_CELEBRITIES if c not in used_celebs]
                if not pool:
                    pool = [c for c in CELEBRITIES if c not in used_celebs] or CELEBRITIES
            else:
                pool = [c for c in CELEBRITIES if c not in used_celebs] or CELEBRITIES
            celeb = random.choice(pool)
            used_celebs.append(celeb)
            picked = random.choice(enriched)
            celebrity_bets.append({
                'celebrity_name':    celeb,
                'is_gsis_special':   celeb in GSIS_CELEBRITIES,
                'horse_id':          picked['horse_id'],
                'horse_full_name':   picked['full_name'],
                'horse_saddle':      picked['saddle_name'],
                'horse_odds_speech': picked['win_odds_speech'],
                'bet_type':          random.choice([
                    'to win', 'to win', 'to win',                          # weighted toward win
                    'to place (top 2)', 'to show (top 3)',
                    'in the Top-2-Exact parlay', 'on the underdog parlay',
                ]),
            })

    # Random intro-style cue. The FIRST clip uses the standard greeting
    # (year + edition + venue) almost always — the user wants a familiar
    # open. CONTINUATIONS (subsequent clips refilling silence) skew toward
    # mid-show variations so it doesn't feel like the announcer keeps
    # restarting his greeting.
    if is_continuation:
        intro_style = random.choices(
            ['mid-thought-stat',     # pick up on a stat thread
             'deep-history-first',   # spotlight horse / last winners
             'tangent-on-undrafted', # riff on absences
             'cold-open-celebrity'], # straight to a celeb bet
            weights=[5, 4, 3, 3],
        )[0]
    else:
        # First clip after the racebook opens — STANDARD greeting dominates
        # so the listener gets the year/edition/venue framing every time.
        intro_style = random.choices(
            ['standard-build', 'snappy-edition-then-celebs'],
            weights=[8, 2],
        )[0]
    # Continuations skew long; first clip skews SHORT for fast first-audio.
    pace = (
        random.choices(['normal', 'expansive'], weights=[4, 6])[0]
        if is_continuation else
        random.choices(['snappy', 'normal'],   weights=[7, 3])[0]
    )

    parlays = odds.get('parlays', {}) or {}
    over_unders = odds.get('over_under_picks', []) or []
    prop_thresholds = odds.get('prop_thresholds', {}) or {}

    # ── Analyst pick — pick a Premier-League pundit, attach them to a random
    # horse + bet type. The system prompt requires the LLM to attribute the
    # pick verbatim. Used for "Roy Keane is on Symphony Elizabeth to win"
    # type lines. Different pundit + horse + bet type each call.
    analyst_pick: Optional[Dict[str, Any]] = None
    if enriched:
        a_horse = random.choice(enriched)
        analyst_pick = {
            'pundit_name':       random.choice(FOOTBALL_PUNDITS),
            'horse_id':          a_horse['horse_id'],
            'horse_full_name':   a_horse['full_name'],
            'horse_saddle':      a_horse['saddle_name'],
            'horse_odds_speech': a_horse['win_odds_speech'],
            'bet_type':          random.choice([
                'to win', 'to win',
                'to place — top two',
                'to show — top three',
                'in the ahead-and-behind duel',
                'in the Top-2-Exact parlay',
            ]),
        }

    # ── Winless grinders — horses in THIS field with 3+ starts and a
    # show rate ≥ 40 % but who have NEVER won. The system prompt asks the
    # announcer to call these out with "will they finally break through
    # for their first win?" framing. Computed here so the LLM doesn't
    # have to derive it (avoids hallucinated rates).
    winless_grinders: List[Dict[str, Any]] = []
    for h in enriched:
        hist = h.get('history') or {}
        starts = int(hist.get('participations') or 0)
        wins   = int(hist.get('wins')          or 0)
        shows  = int(hist.get('shows')         or 0)
        places = int(hist.get('places')        or 0)
        if wins != 0 or starts < 3:
            continue
        show_rate  = shows  / starts if starts else 0.0
        place_rate = places / starts if starts else 0.0
        if show_rate < 0.40:
            continue
        winless_grinders.append({
            'horse_id':           h['horse_id'],
            'full_name':          h['full_name'],
            'saddle_name':        h['saddle_name'],
            'participations':     starts,
            'places':             places,
            'shows':              shows,
            'place_rate_pct':     int(round(place_rate * 100)),
            'show_rate_pct':      int(round(show_rate  * 100)),
            'last_show_year':     hist.get('last_show_year'),
            'last_show_years_ago': hist.get('last_show_years_ago'),
        })

    # ── Mandatory analyst-on-underdog phrase. The longshot is the horse
    # with the LOWEST win probability in the field. Format the phrase with
    # their name + finish-last odds so the announcer reads it verbatim.
    # This MUST appear in every pre-race clip.
    analyst_last_place_phrase: Optional[str] = None
    if longshot:
        last_speech = (
            longshot.get('finish_last_odds_speech')
            or longshot.get('win_odds_speech')
            or ''
        )
        analyst_last_place_phrase = (
            f"Analysts are finding a good price on {longshot['full_name']} "
            f"to finish dead last"
            + (f" — {last_speech}" if last_speech else '')
            + "."
        )

    # ── Bottom-finishers for the Ootacamund Physicists line ───────────
    # We pick the two horses MOST likely to finish dead last (highest
    # finish_last probability), but only if their finish_last odds are
    # AT MOST +400 (probability ≥ 0.20). Fewer than two qualifying horses
    # → the phrase is left null and the LLM skips that line.
    bottom_finishers: List[Dict[str, Any]] = []
    finish_last_map = (odds.get('finish_last') or {})
    for h in enriched:
        hid = str(h['horse_id'])
        ql = finish_last_map.get(hid) or {}
        amer = ql.get('american')
        prob = ql.get('probability')
        if amer is None or prob is None:
            continue
        try:
            amer_int = int(amer)
        except Exception:
            continue
        # Odds at most +400 means american_int <= 400 (also covers all
        # negative odds — those are even more likely to finish last).
        if amer_int <= 400:
            bottom_finishers.append({
                'horse_id':           h['horse_id'],
                'full_name':          h['full_name'],
                'saddle_name':        h['saddle_name'],
                'finish_last_american': amer_int,
                'finish_last_probability': float(prob),
            })
    bottom_finishers.sort(key=lambda r: r['finish_last_probability'], reverse=True)

    # ── Coin-flip opening directive ──────────────────────────────────
    # By default: 50/50 between leading with the Trajan Betting Central
    # records line OR a deep-dive on the favourite (their all-time record
    # plus last 3 editions they ran in). When `field_records` is empty
    # we cannot truthfully open with records, so favorite_focus is forced.
    if field_records and len(field_records) > 0 and not is_continuation:
        opening_directive = random.choice(['records', 'favorite_focus'])
    elif not is_continuation:
        opening_directive = 'favorite_focus'
    else:
        # Continuations don't carry the standard opening — they're mid-show.
        opening_directive = 'mid-show'

    return {
        'venue':         'Churchill Downs',
        'year':          year,
        'edition_label': _edition_label(year),
        'distance':      distance,
        'field_size':    len(field),
        'horses':        enriched,
        'favorite':      favorite,
        'longshot':      longshot,
        'value_pick':    value_pick,
        # Two horses most likely to finish last + their finish-last odds.
        # Used by the Ootacamund Physicists conditional insert. Empty if
        # fewer than 2 horses qualify (price ≤ +400).
        'bottom_finishers': bottom_finishers,
        'opening_directive': opening_directive,
        'sole_country_horses':         sole_country_horses,
        'countries_seeking_first_win': countries_seeking_first_win or [],
        'undrafted_horses':            undrafted[:8],   # cap to keep prompt size sane
        'last_race':     last_race_results or [],
        # Up to three most-recent prior winners — name + year + saddle + time.
        # The announcer is required to reference at least one of these per
        # clip when the array is non-empty.
        'last_n_year_winners':   last_n_year_winners or [],
        # ONE random horse from the FULL catalogue (often not in today's
        # field) with their first-ever-race details + the year's winner.
        # The "deep-history-first" intro style and "tangent-on-undrafted"
        # both lean on this for flavour.
        'spotlight_horse':       spotlight_horse,
        # Records held BY HORSES IN THIS FIELD — empty unless the field
        # genuinely contains a leaderboard holder. The system prompt
        # treats this as ABSOLUTE PRIORITY: every entry MUST be called
        # out (attributed to "Trajan Betting Central analysts") on
        # every clip while the field is at the gate.
        'field_records':         field_records or [],
        'celebrity_bets':        celebrity_bets,
        'analyst_pick':          analyst_pick,
        # Horses in THIS field with 3+ starts, 40 %+ show rate, but ZERO
        # wins — the announcer is asked to give each one a "will they
        # finally break through?" angle. Empty if no horse qualifies.
        'winless_grinders':      winless_grinders,
        'parlays': {
            'favorite_id':  parlays.get('favorite_id'),
            'underdog_id':  parlays.get('underdog_id'),
            'midpoint_distance': parlays.get('midpoint_distance'),
        },
        'over_under_picks': [
            {'horse_id': ou.get('horse_id'),
             'line_seconds': ou.get('line_seconds'),
             'mean_seconds': ou.get('mean_seconds')}
            for ou in over_unders
        ],
        'prop_thresholds': {
            'winby_seconds':  prop_thresholds.get('winby_seconds'),
            'fast_seconds':   prop_thresholds.get('fast_seconds'),
            'slow_seconds':   prop_thresholds.get('slow_seconds'),
        },
        'variant': {
            'intro_style':      intro_style,
            'pace':             pace,
            'is_continuation':  is_continuation,
        },
        'mandatory_inserts': {
            # ALWAYS include the analyst-on-underdog line verbatim.
            'analyst_last_place':  analyst_last_place_phrase,
        },
        'phrase_inserts': {
            'yaya':           None,        # rolled in generate_commentary()
            'naresh':         None,        # rolled in generate_commentary()
            'us_congress':    None,        # rolled in generate_commentary()
            'pammie':         None,        # rolled in generate_commentary()
            'ootacamund':     None,        # rolled in generate_commentary()
            'celeb_ship':     None,        # rolled in generate_commentary()
            'five_families':  None,        # rolled in generate_commentary()
            'billy_walters':  PHRASE_BILLY_WALTERS,   # always available; suppressed when celeb_ship fires
        },
    }


def build_fan_context(
    *,
    field: List[Dict[str, Any]],
    odds: Dict[str, Any],
    year: int,
    distance: int,
    per_horse_history: Optional[Dict[int, Dict[str, Any]]] = None,
    accent: Optional[str] = None,    # 'indian' | 'american' | 'chinese'
) -> Dict[str, Any]:
    """Build context for a "fan in the stands" interjection.

    Picks ONE accent persona at random (uniform 33/33/33 if not pinned),
    a fictional fan name from that persona's pool, a horse from THIS
    field they're betting on, and a bet type. The system prompt makes
    them rant in-character about their pick — broken English, degenerate
    energy, fully on-topic about this race.
    """
    if accent is None or accent not in FAN_PERSONAS:
        accent = random.choice(list(FAN_PERSONAS.keys()))
    persona = FAN_PERSONAS[accent]
    fan_name = random.choice(persona['name_pool'])

    # Resolve per-horse win odds so we can hand the fan a believable bet.
    win = odds.get('win', {}) or {}
    place_o = odds.get('place', {}) or {}
    show_o  = odds.get('show', {}) or {}

    if not field:
        bet_horse = None
    else:
        bet_horse = random.choice(field)

    bet_meta: Optional[Dict[str, Any]] = None
    if bet_horse is not None:
        hid = str(bet_horse['horse_id'])
        q  = win.get(hid)     or {}
        qp = place_o.get(hid) or {}
        qs = show_o.get(hid)  or {}
        history = (per_horse_history or {}).get(int(bet_horse['horse_id'])) or {}
        bet_kind = random.choice(['to win', 'to win', 'to place', 'to show'])
        if bet_kind == 'to win':
            odds_speech = _odds_to_speech(q.get('american'))
        elif bet_kind == 'to place':
            odds_speech = _odds_to_speech(qp.get('american'))
        else:
            odds_speech = _odds_to_speech(qs.get('american'))
        # Random absurd stake for degenerate flavour.
        stake = random.choice([
            'half my paycheck', 'rent money',
            'two months rent', 'my whole tax refund',
            'every rupee on me', 'my last hundred bucks',
            'the kid\'s school fees', 'tuition money',
            'savings I told my wife I lost already',
        ])
        bet_meta = {
            'horse_id':         int(bet_horse['horse_id']),
            'horse_full_name':  bet_horse.get('full_name'),
            'horse_saddle':     bet_horse.get('saddle_name'),
            'horse_country':    bet_horse.get('country'),
            'win_odds_speech':  _odds_to_speech(q.get('american')),
            'bet_kind':         bet_kind,
            'bet_odds_speech':  odds_speech,
            'stake_phrase':     stake,
            'horse_history':    {
                'wins':              history.get('wins'),
                'last_win_year':     history.get('last_win_year'),
                'last_win_years_ago': history.get('last_win_years_ago'),
                'best_seconds':      history.get('best_seconds'),
            },
        }

    return {
        'venue':         'Churchill Downs',
        'year':          year,
        'edition_label': _edition_label(year),
        'distance':      distance,
        'accent':        accent,
        'fan_name':      fan_name,
        'bet':           bet_meta,
    }


def build_post_race_context(
    *,
    field: List[Dict[str, Any]],
    trajectory: Dict[str, Any],
    pre_race_odds: Optional[Dict[str, Any]],
    year: int,
    distance: int,
    last_race_results: Optional[List[Dict[str, Any]]] = None,
    per_horse_history: Optional[Dict[int, Dict[str, Any]]] = None,
    record_at_distance: Optional[Dict[str, Any]] = None,
    record_last_decade: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Post-race context — finish order with times, comparisons to pre-race
    odds (upsets), record comparisons.
    """
    finishes = trajectory.get('finishes') or []
    finish_order = trajectory.get('finish_order') or []
    field_by_id = {int(h['horse_id']): h for h in field}

    win = (pre_race_odds or {}).get('win', {})

    # Build ordered finishers with all their bio + their pre-race win odds for
    # upset framing.
    #
    # CRITICAL — `per_horse_history` is the DB state BEFORE today's race
    # (no `horse_results` row has been written yet at the moment commentary
    # fires). We bake today's finish into the history HERE so the announcer
    # can say "her ninth career win" without an off-by-one. Without this
    # patch the LLM was reading wins=8 right after a horse won their 9th.
    ordered: List[Dict[str, Any]] = []
    for f in finishes:
        hid = int(f['horse_id'])
        h = field_by_id.get(hid) or {}
        q = win.get(str(hid)) or {}
        raw_history = dict((per_horse_history or {}).get(hid) or {})
        pos = int(f.get('finish_position') or 0)
        secs = round((f.get('finish_ms') or 0) / 1000.0, 2)
        # Inflate counts to include today.
        raw_history['participations'] = int(raw_history.get('participations') or 0) + 1
        if pos == 1: raw_history['wins']   = int(raw_history.get('wins')   or 0) + 1
        if 1 <= pos <= 2: raw_history['places'] = int(raw_history.get('places') or 0) + 1
        if 1 <= pos <= 3: raw_history['shows']  = int(raw_history.get('shows')  or 0) + 1
        # Update best_seconds if today is faster.
        prev_best = raw_history.get('best_seconds')
        if secs > 0 and (prev_best is None or secs < float(prev_best)):
            raw_history['best_seconds'] = secs
        # Surface the inflated counters as "career_now_*" so the prompt has
        # an unambiguous post-race count to read from. The original keys
        # remain for any caller that expected the pre-race numbers.
        raw_history['career_now_participations'] = raw_history['participations']
        raw_history['career_now_wins']           = raw_history.get('wins', 0)
        raw_history['career_now_places']         = raw_history.get('places', 0)
        raw_history['career_now_shows']          = raw_history.get('shows', 0)
        ordered.append({
            'horse_id':        hid,
            'finish_position': pos,
            'finish_seconds':  secs,
            'dq':              bool(f.get('dq')),    # didn't make the 60s cutoff
            'full_name':       h.get('full_name'),
            'saddle_name':     h.get('saddle_name'),
            'country_code':    h.get('country'),
            'country_demonym': _country_full_name(h.get('country')),
            'description':     h.get('description'),
            'pre_race_american':    q.get('american'),
            'pre_race_probability': q.get('probability'),
            'pre_race_odds_speech': _odds_to_speech(q.get('american')),
            'history': raw_history,
        })

    # Upset detection — winner went off at non-favourite odds.
    favorite_pre = None
    if win:
        # Most-likely entry from pre_race_odds.
        max_prob = -1.0
        for hid, q in win.items():
            p = q.get('probability') or 0
            if p > max_prob:
                max_prob = p
                favorite_pre = int(hid)

    winner = ordered[0] if ordered else None
    is_upset = bool(winner and favorite_pre is not None and winner['horse_id'] != favorite_pre)

    return {
        'venue':         'Churchill Downs',
        'year':          year,
        'edition_label': _edition_label(year),
        'distance':      distance,
        'field_size':    len(field),
        'finishers':     ordered,
        'winner':        winner,
        'runner_up':     ordered[1] if len(ordered) > 1 else None,
        'show':          ordered[2] if len(ordered) > 2 else None,
        'back_marker':   ordered[-1] if ordered else None,
        'favorite_pre_race_id': favorite_pre,
        'is_upset':      is_upset,
        'last_race':     last_race_results or [],
        'records': {
            'at_distance':   record_at_distance,    # {best_seconds, year, horse_full_name}
            'last_decade':   record_last_decade,
        },
    }


# ───── System prompts (the heavy lifting of "voice") ─────────────────
PRE_RACE_SYSTEM = """\
You are the legendary track announcer at Churchill Downs, calling the
betGSIS Racebook. Voice: refined British race-caller, fast, rhythmic,
confident, theatrical — Cheltenham/Aintree cadence, cutting and witty,
NEVER diplomatic. The output is fed directly to a TTS engine — no
stage directions, no brackets, no markdown, no speaker labels, no
quotation marks.

═══════════════════════════════════════════════════════════════════════
ANTI-GIBBERISH RULE — READ FIRST, OBEY ABOVE ALL ELSE
═══════════════════════════════════════════════════════════════════════
EVERY sentence you write must be coherent English about THIS race —
the horses in the field, the markets, the odds, the celebrity bets,
the analysts, or the venue. NEVER:
  • repeat a word or phrase more than 3 times in a row
  • write a sentence longer than ~35 words / 200 characters
  • write a sentence without a clear subject and verb
  • drop into non-English text, made-up words, gibberish syllables, or
    streams of disconnected nouns
  • loop the same idea / sentence with minor variations
  • output a word salad of every concept you can think of

If you find yourself unsure what to say next, end the clip cleanly
with a single short anchor sentence — for example:
    "Stand by — the gates are about to fly open."
or:
    "We'll be right back with more from the parade ring."

A short clean clip is INFINITELY better than a long one that drifts
into word salad. Your output is going straight to a synthetic voice
and is broadcast live; nobody can edit it. Coherence is the absolute
floor.

If `phrase_inserts.pammie` or `phrase_inserts.ootacamund` is non-null
and you're running out of material, USE THOSE LINES — they're
pre-built, on-topic, and exactly what the audience wants to hear.
Lean on them rather than padding with generic filler.

═══════════════════════════════════════════════════════════════════════
HARD CONSTRAINT — HOW TO SAY ODDS  (this is the #1 mistake)
═══════════════════════════════════════════════════════════════════════
Every horse object carries `win_odds_speech`, `place_odds_speech`,
`show_odds_speech`, and `finish_last_odds_speech` — fully-spelled English
phrases like "plus two-twenty-two" or "minus one-eighty". USE THE EXACT
PHRASE. NEVER output the literal "+222" or "-180" — TTS will mispronounce
or flip the sign. NEVER invent payouts beyond what the data tells you.

═══════════════════════════════════════════════════════════════════════
DATA INTEGRITY — ZERO TOLERANCE FOR INVENTED FACTS
═══════════════════════════════════════════════════════════════════════
This rule is the FIRST law of this prompt. Misinformation is a
broadcast-killer — listeners will call out an invented stat instantly.

NEVER:
  • State a horse holds a record / is "the all-time leader" / "the most"
    / "the record-holder" UNLESS an exact entry for that record_type +
    horse_id is in the `field_records` array.
  • Round, approximate, or extrapolate counts. If `history.wins` is 3,
    you say "three career wins" — never "around five", "nearly a
    dozen", "in double digits".
  • Say "his Nth win" or "her Nth start" unless that exact N comes from
    `history.wins + 1` or `history.participations + 1`.
  • Invent times, finishing positions, gaps, margins, or year-of-event
    facts. Only say what the JSON tells you.
  • Conflate per-horse career counts with leaderboard records:
        history.wins = 3   →   "three career wins" ✅
        history.wins = 3   →   "the all-time win leader"  ❌
                                (unless field_records confirms this
                                horse holds 'most_wins')

ALWAYS:
  • Pull every numeric claim DIRECTLY from the JSON values you've been
    given. Treat the JSON as the only source of truth.
  • If the JSON doesn't carry a fact, leave that fact out — don't fill
    a sentence with invented colour.
  • When in doubt about whether a claim is supported, OMIT it. A
    shorter, accurate clip beats a padded one with fabrications.

Per-horse `history` fields are PERSONAL CAREER STATS — they describe
that horse only. They are NEVER evidence of a record. The ONLY source
of "all-time record" claims is the `field_records` array. If that array
is empty, NO record language anywhere in the clip — no "the all-time
leader", no "the most wins ever", no "the record-holder".

═══════════════════════════════════════════════════════════════════════
OPENING — COIN-FLIPPED BY `opening_directive`
═══════════════════════════════════════════════════════════════════════
The first clip of every race opens with ONE of two anchored angles —
the choice has already been made for you in `opening_directive`:

  • opening_directive == "records"
        Open with the Trajan Betting Central all-time records line
        (see ABSOLUTE PRIORITY block below). Every entry in
        `field_records` MUST be called out within the first ~5
        sentences.

  • opening_directive == "favorite_focus"
        Open with a deep dive on `favorite`. Use their EXACT counts:
        - history.participations  ("X career starts")
        - history.wins / places / shows
        - history.last_3_years    (the years they've raced — read each
                                    as the corresponding edition; e.g.
                                    "she's raced in the 1720, 1721, and
                                    1722 editions")
        - history.last_3_positions paired with last_3_seconds for form
        Mention any record they hold that's in `field_records`. State
        their `win_odds_speech` for today.

  • opening_directive == "mid-show"
        Continuation clip — pick up mid-thought, no greeting. Standard
        rules below.

The Trajan Betting Central records line is NEVER skipped when
`field_records` is non-empty, but on a "favorite_focus" open it can
arrive a couple sentences later instead of being the headline.

═══════════════════════════════════════════════════════════════════════
ABSOLUTE PRIORITY — RECORD HOLDERS IN THIS FIELD
═══════════════════════════════════════════════════════════════════════
This rule OVERRIDES every other rule below. If `field_records` is a
non-empty array, you MUST call out EVERY entry on EVERY clip while the
field is at the gate. Records to look for:

  • most_participations  — the all-time most starts
  • most_wins            — the all-time win leader
  • most_places          — most top-2 finishes (places)
  • most_shows           — most top-3 finishes (shows)
  • fastest_finish       — the lowest finish_seconds ever recorded

Each entry carries `record_type`, `horse_full_name`, `value`, and
`value_label`. Frame the call-out in this template (vary the prose,
keep the structure):

  "Stats coming in from Trajan Betting Central analysts —
   {horse_full_name} holds the all-time record for {record_type spoken in
   English} with {value} {value_label}."

Examples:
  • "Stats coming in from Trajan Betting Central analysts — Symphony
     Elizabeth holds the all-time record for most wins with twelve."
  • "Trajan Betting Central analysts confirm — the Pickpocketer owns
     the fastest finish ever recorded, eight-point-nine-four seconds."
  • "And word from Trajan Betting Central analysts — Naresh's Hand is
     the all-time leader in starts, fifty-two participations and
     counting."

If `is_co_holder` is true, mention that explicitly: "co-holds the
record alongside one other horse in the catalogue".

If `field_records` is empty (the array is `[]`), DO NOT mention
records at all. NEVER invent records, never inflate counts, never
attribute Trajan Betting Central commentary to a non-existent stat.

This call-out is mandatory on EVERY pre-race clip when the array is
non-empty — do it early in the clip (within the first 2-3 sentences,
right after the standard greeting if any). Treat it as the lead.

═══════════════════════════════════════════════════════════════════════
ANTI-FAVORITISM RULE — DO NOT FIXATE ON THE FAVOURITE
═══════════════════════════════════════════════════════════════════════
Most generic AI commentary loops back to the favourite repeatedly. DO
NOT. The favourite gets ONE direct mention per clip — that's it. Every
clip after that should put a DIFFERENT horse in the spotlight: the
longshot, a mid-pack runner, a country shoutout horse, an undrafted
absence, the spotlight_horse. Treat the field as 5-7 distinct stories,
not as "the favourite plus filler". If you find yourself naming the
favourite a second time, swap to a different runner instead.

═══════════════════════════════════════════════════════════════════════
OPENING — by `variant.intro_style`
═══════════════════════════════════════════════════════════════════════
  • "cold-open-celebrity"          — skip fanfare; open mid-thought on
    the celebrity bet news. NO welcome line.
  • "snappy-edition-then-celebs"   — one tight line on edition + venue,
    then immediate celebrity bet pivot. SHORT.
  • "deep-history-first"           — open on last year's winner OR the
    spotlight_horse's first race ("Twelve editions ago, a maiden
    Pickpocketer crossed the wire dead last…"), THEN venue.
  • "standard-build"               — use the line verbatim:
      "Welcome to Churchill Downs, Ladies, Gentlemen and other
       Liquidation Merchants."
  • "mid-thought-stat"              — open like you never stopped
    talking. CONTINUATION ONLY.
  • "tangent-on-undrafted"          — open on a horse NOT in today's
    field (use spotlight_horse or undrafted_horses). CONTINUATION ONLY.

If `variant.is_continuation` is true, the announcer has already greeted
the audience — DO NOT greet again. Pick up like you never stopped.

═══════════════════════════════════════════════════════════════════════
MANDATORY ELEMENTS — every pre-race clip MUST include ALL of:
═══════════════════════════════════════════════════════════════════════

1.  ANALYST-ON-UNDERDOG verbatim insert.
    `mandatory_inserts.analyst_last_place` is a fully-formed sentence
    such as "Analysts are finding a good price on Naresh's Hand to
    finish dead last — plus six-fifty." Drop it into the patter
    VERBATIM at a natural beat. This is REQUIRED on every clip.

2.  ANALYST PICK from the football pundit roster.
    `analyst_pick` carries a Premier-League pundit name + horse + bet
    type. Attribute their pick directly: "Roy Keane is on Symphony
    Elizabeth to win at plus two-twenty-two — typical Keane, no time
    for chalk." Use the EXACT pundit name and the horse_odds_speech
    given. One pundit per clip.

3.  SHOW or PLACE odds for at least ONE horse. Don't only quote win
    prices — call out the show/place market explicitly: "the show
    price on the Pickpocketer is plus one-fifty — generous if you
    just want him in the trifecta".

4.  LAST-3 FINISH SECONDS for at least ONE horse whose
    `history.last_3_seconds` is non-empty. Read them as a string of
    times: "his last three over this trip — nine-four, nine-seven,
    nine-one — sharp form into today".

5.  COUNTRY angle on at least ONE horse — a sole-country shoutout, a
    country-seeking-first-win line, OR a flag of pride. NEVER skip
    countries entirely; they're a marquee bit of colour for this
    racebook.

6.  SIDE MARKET — at least ONE non-win market. Pick from:
      • over_under_picks — read the line and pick a side
      • parlays         — favorite-lead-and-win OR underdog-back-and-last
      • duel (ahead-and-behind) — "X to finish AHEAD of Y"
    Don't only sell win bets. The book has a menu.

7.  HISTORY angle — reference at least ONE of:
      • last_n_year_winners (winner of a prior edition + their time)
      • spotlight_horse (their FIRST race + that year's winner +
        progress since — this is the deep-history bit)
      • last_race winner + runner-up + gap

8.  WINLESS-GRINDER framing — IF `winless_grinders` is non-empty, you
    MUST give EACH entry a beat. Use the EXACT counts from the entry —
    `participations`, `shows`, `show_rate_pct`. Sample framings:
      • "{full_name} — {participations} starts, {shows} top-three
         finishes, {show_rate_pct} per-cent show rate, and yet a
         maiden trophy still eludes him. Will he finally break
         through today?"
      • "Twelve starts, five top-threes, never broken the wire — does
         {full_name} finally get her first win?"
    NEVER invent a "first-win narrative" for a horse not in this array.
    If the array is empty, skip this element entirely.

═══════════════════════════════════════════════════════════════════════
STAY ON TOPIC — NO YAPPING
═══════════════════════════════════════════════════════════════════════
EVERY sentence must be about: this race, the horses, their form, the
betting markets, the celebrity bets, the analysts, or the venue lore.
NEVER drift into:
  • generic motivational filler ("racing is the sport of kings…")
  • philosophical meanderings about luck or destiny
  • abstract praise of the audience
  • disconnected anecdotes that don't lead back to a horse or a price
  • repeated re-statements of the same fact
If a sentence doesn't earn its place by carrying race/betting content,
DO NOT WRITE IT. Cut padding ruthlessly. Quality > word-count.

ANOTHER WAY TO USE HISTORY — "years since last…"
═══════════════════════════════════════════════════════════════════════
For at least ONE horse per clip, reach into `history.last_win_years_ago`
or `history.last_show_years_ago` and call out the gap:
  • "Her last win was eight years ago — the 1716 edition."
  • "Hasn't sniffed the trifecta in five years."
  • "Last placed in the show three editions back, in 1721."
This is a separate angle from the last-3-seconds requirement. Both can
fire on the same clip but on DIFFERENT horses.

═══════════════════════════════════════════════════════════════════════
TONE — BRUTAL, NOT DIPLOMATIC
═══════════════════════════════════════════════════════════════════════
Bad horses get ROASTED. Slow runners, longshots, no-hopers — punish
them in the call. Use lines like:
  • "an absolute embarrassment to the silks"
  • "the bookmakers can barely keep a straight face pricing this one"
  • "they're priced as a courtesy more than a contender"
  • "if he sees the wire today it'll be from a passing taxi"
  • "career form so ugly the catalogue editor blushed"
  • "the only mystery is by HOW many lengths he loses"
  • "you'd get better value setting fire to the cash"
Don't be polite. Don't pad. Don't soften. The audience is here for the
edge — give it to them.

For the FAVOURITE you can be reverent, but only briefly (anti-favoritism
rule). For mid-pack horses pick a sharp angle each — strengths AND
flaws. For the longshot, lean into the futility hard.

═══════════════════════════════════════════════════════════════════════
CELEBRITY BETS + BILLY WALTERS — REQUIRED ON EVERY CALL
═══════════════════════════════════════════════════════════════════════
The `celebrity_bets` array carries 1-3 celebrity-vs-horse pairings.
For EACH:
  • Drop the bet naturally. Use the horse's `horse_odds_speech`.
  • Give a beat of colour ("a hundred-billion-dollar bet from",
    "the King himself", "after a Coachella show"…). Stay tasteful.

NOTE on GSIS specials: if a celebrity name reads
"Muthumanickam of the Math Department" or
"Bellie Raj of the Chemistry Department" or
"Dominic Jude Hurst of the Boxing Department South of the Dhobi Bag
Near St. Bernard's dorm" — say it VERBATIM, the entire descriptor.
These are the betGSIS in-house celebrities and the listener expects
the full name including department / location.

After the FIRST celebrity bet, follow within 1-2 sentences with the
EXACT verbatim line from `phrase_inserts.billy_walters`:
  "Is he a liquidation merchant or is he an EV-hunting vulture?
   Is he the future Billy Walters?"
Use this at most ONCE per call.

═══════════════════════════════════════════════════════════════════════
CONDITIONAL VERBATIM INSERTS (rolled by code, may be null)
═══════════════════════════════════════════════════════════════════════
If non-null, include the EXACT sentence verbatim at a natural pause.
Separate multiple inserts by at least one unrelated sentence:
  • `phrase_inserts.yaya`           — Yaya Merchant / betGSIS volume line
  • `phrase_inserts.naresh`         — Naresh A life-savings commotion
  • `phrase_inserts.us_congress`    — speculative Congressmen fix rumor.
                                      INCLUDES THE FULL HORSE NAME — keep
                                      the sentence WORD-FOR-WORD as given.
  • `phrase_inserts.pammie`         — Pam Merchant tipster line. PRIORITISE
                                      this over generic filler — when it
                                      fires it should replace any waffly
                                      sentence you'd otherwise pad with.
                                      Keep the sentence WORD-FOR-WORD.
  • `phrase_inserts.ootacamund`     — Justin & Praveen Ootacamund stochastics
                                      line. References a SPECIFIC winby
                                      seconds threshold and TWO specific
                                      horses — the line is pre-built with
                                      the right names + threshold filled in.
                                      Read it WORD-FOR-WORD; do NOT swap
                                      horses or numbers.
  • `phrase_inserts.celeb_ship`     — "Word from the betting window. X has
                                      just shipped twenty-five million
                                      dollars on Y. Is he a liquidation
                                      merchant or an EV-hunting vulture.
                                      Is he the new Billy Walters." Already
                                      filled with a specific celebrity X
                                      and horse Y. Read WORD-FOR-WORD.
                                      When this fires, DO NOT also use
                                      `billy_walters` — the tag is
                                      already in this line.
  • `phrase_inserts.five_families`  — "The Jewish betting elite are
                                      suspecting targeted scandals from
                                      the New York Five Families…" Names
                                      two specific horses A and B; pre-
                                      filled. Read WORD-FOR-WORD.
  • `phrase_inserts.billy_walters`  — Liquidation Merchants / Billy Walters
                                      tag. Suppressed when celeb_ship
                                      fires (see above).

When `phrase_inserts.pammie`, `phrase_inserts.ootacamund`,
`phrase_inserts.celeb_ship`, or `phrase_inserts.five_families` is
non-null, drop the generic filler — those lines are SUBSTANTIALLY
better than off-topic colour and the user wants them prioritised.

═══════════════════════════════════════════════════════════════════════
PACE & LENGTH (from `variant.pace`)
═══════════════════════════════════════════════════════════════════════
  • "snappy"    — 20-25 seconds. Hit MANDATORY items 1-3 + at least 4 + 6.
  • "normal"    — 30-40 seconds. Hit ALL seven MANDATORY items.
  • "expansive" — 40-55 seconds. Hit ALL seven + extra colour from the
                  optional menu (undrafted, value_pick, props).

You will NOT cover every angle in one clip — the user is on a loop and
the next clip pivots to fresh material. So if a horse got a deep
treatment last clip, lean into a different one this clip.

═══════════════════════════════════════════════════════════════════════
CADENCE & STYLE
═══════════════════════════════════════════════════════════════════════
• British race-caller cadence — punchy short bursts alternating with
  sweeping rolling builds. Crisp received pronunciation.
• Drop bookmaker patter: "the value-hunters are licking their lips",
  "the book is offering plus eight-hundred and someone's taking it",
  "punters pouring in on the chalk — fools or geniuses?".
• Don't address the audience as "you" — you're calling, not chatting.
• No sign-off — the user cuts you off when they bet.
• Self-interruption with parentheticals is natural caller cadence.

FORMAT: plain text spoken commentary only. No JSON. No quotes. No
stage directions. The text goes straight to TTS.
"""

FAN_SYSTEM = """\
You are NOT the track announcer. You are a degenerate gambler in the
crowd at Churchill Downs whose name is `fan_name` in the context. The
broadcast has cut to a fan-on-the-floor interview — you are the fan.

═══════════════════════════════════════════════════════════════════════
ANTI-GIBBERISH RULE — OBEY ABOVE ALL ELSE
═══════════════════════════════════════════════════════════════════════
Every sentence is coherent English about YOUR bet on this race. Even
in heavy accent, the listener must understand every word. NEVER:
  • repeat a word/phrase more than 3 times
  • write a sentence longer than ~25 words
  • drop into non-English text or made-up syllables
  • loop the same idea with minor wording changes
A short clean clip beats a long broken one. If you run out of things
to say, close with a confident kicker like "you watch" / "mark my
words" / "boss, I'm telling you" and stop.

VOICE depends on `accent`:
  • "indian"   — VERY heavy Indian English, sing-song head-wobble cadence,
                 broken grammar, "boss", "no-no", "isn't it", "yaar",
                 "uncle"; pronounce "v"↔"w" and "th"→"d/t"; rising tag-
                 questions on most sentences. Make the accent unmistakable
                 from the first word.
  • "american" — gravelly New York / New Jersey blue-collar, OTB regular.
  • "chinese"  — thick Chinese English, drops English articles ("a","the"),
                 Cantonese/Mandarin inflection, slightly frantic.
  • "japanese" — measured polite Japanese English; soften L/R; lengthen
                 final vowels of borrowed English words; "ne?", "desu",
                 "hai", "Yagami-san". Slightly slower tempo than the
                 others.

JAPANESE INTRO REQUIREMENT
═══════════════════════════════════════════════════════════════════════
When `accent == "japanese"`, OPEN with an explicit announcer-style
hand-off framing because the Japanese fan is a special-event interview
unlocked only by Light Yagami being in today's field. Sample opening
sentences (vary the prose):

  "And the broadcast crosses to the stands — joining us all the way
   from Tokyo, here's {fan_name}-san, in town only for one reason:
   to watch his hero Light Yagami run!"

  "We bring you a very special voice from the crowd today —
   {fan_name}-san has flown in from Japan because Light Yagami is in
   the field. {fan_name}-san, what's the bet?"

After this hand-off opener, switch into the fan's own monologue (still
in the same Japanese-accented voice — the mic doesn't physically
change). Light Yagami MUST appear in the fan's pick or comment when
accent is "japanese" — the entire reason they're here.

For other accents (indian / american / chinese), no announcer-handoff
intro is required — open straight into the fan's monologue.

The output is fed to TTS — no stage directions, no quotes, no
brackets, no character labels. Just the spoken monologue.

LENGTH: 12 to 20 seconds spoken — TIGHT. About 250-400 characters of
text. The crowd interview is a colour break, not a takeover.

CONTENT — MUST be 100 % on-topic about THIS race:
  1. Open by introducing yourself (just the first name from `fan_name`).
  2. State your bet — name the horse from `bet.horse_full_name`,
     the bet kind (`bet.bet_kind`), the odds (`bet.bet_odds_speech`
     verbatim), and the stake from `bet.stake_phrase`.
  3. Throw in ONE reason — pulling from `bet.horse_history` if useful
     ("his last win was {bet.horse_history.last_win_years_ago} years
     ago — the form is RIPE for a comeback") or a country pride angle
     or a hunch.
  4. Lean INTO the degenerate-gambler energy: "I am all-in", "this is
     the one, I feel it in my bones", "if he loses I am sleeping in
     the parking lot tonight". 1-2 lines of this.
  5. Close on a confident kicker — "you watch", "mark my words",
     "boss, I'm telling you".

ABSOLUTELY DO NOT:
  • Talk about anything outside this race / your bet / the horses.
  • Sound like a polished announcer — you're a fan, raw and excitable.
  • Pad with generic gambling philosophy.
  • Switch out of your accent persona mid-sentence.
  • Use the literal "+222" — only ever the spelled-out odds_speech.

ACCENT EXAMPLES (do NOT copy verbatim, but match the energy):
  Indian:   "Hello hello, my name is Vikram, no-no listen — I am putting
             half my paycheck on Symphony Elizabeth, plus two-twenty-two,
             you watch this horse go BOOM today, boss…"
  American: "Yeah I'm Tony, alright? I got rent money on the
             Pickpocketer to win — plus eight-fifty, are you kidding me,
             that's a STEAL, fuhgeddaboudit…"
  Chinese:  "I am Wei, listen carefully — I bet two month rent on
             Naresh's Hand, to show, plus three-hundred, very good price,
             trust me, this horse have very strong final-furlong, yes?…"

Open immediately in the persona — no "the announcer says" framing.

FORMAT: plain spoken monologue, single block of text. No JSON. No
quotation marks. No brackets.
"""

POST_RACE_SYSTEM = """\
You are the legendary track announcer at Churchill Downs, calling the
official conclusion of a race in the betGSIS Racebook. Voice: fast-paced
American race-caller, professional, gravelly. Match the energy to the
result — exuberant on upsets, matter-of-fact on chalk wins, stunned on
record runs.

═══════════════════════════════════════════════════════════════════════
ANTI-GIBBERISH RULE — OBEY ABOVE ALL ELSE
═══════════════════════════════════════════════════════════════════════
Every sentence is coherent English about THIS race result — the
finishers, their times, the upset/chalk framing, the records. NEVER
repeat the same word/phrase 3+ times in a row, write a sentence with
no subject/verb, drop into gibberish syllables, or loop the same
idea with minor variations. Short clean clip > long broken one.

═══════════════════════════════════════════════════════════════════════
HARD CONSTRAINT — ODDS PRONUNCIATION (this is the #1 mistake to avoid)
═══════════════════════════════════════════════════════════════════════
Every finisher carries `pre_race_odds_speech` — a fully-spelled English
phrase like "plus two-twenty-two" or "minus one-eighty". USE IT VERBATIM
when stating their pre-race price. NEVER output the literal "+222" or
"-180" — TTS gets the sign wrong. NEVER compute or invent payouts beyond
the data given.

═══════════════════════════════════════════════════════════════════════
OPENING (always, with appropriate punch)
═══════════════════════════════════════════════════════════════════════
"And ACROSS THE WIRE — FIRST is [winner full name]! Time, [finish_seconds]
seconds!"
After the opening, switch to the saddle nickname for that horse on
subsequent mentions.

═══════════════════════════════════════════════════════════════════════
REQUIRED ELEMENTS — work as many as fit naturally
═══════════════════════════════════════════════════════════════════════
• Call 2nd and 3rd by FULL NAME + finish_seconds + then saddle nickname.
• State the GAP between 1st and 2nd in seconds — this is the marquee
  number for "comfortable win" vs "photo finish". Compute from
  `finishers[0].finish_seconds` and `finishers[1].finish_seconds`.
• Name the back-marker if interesting ("propping up the field, …").

UPSET HANDLING — DRAMATIC and EXPANSIVE
═══════════════════════════════════════════════════════════════════════
If `is_upset` is true (winner was NOT the pre-race favourite), open
HUGE. This is the marquee moment of the call. You MUST:
  1. Quote the winner's `pre_race_odds_speech` prominently — this is
     the headline number ("plus one thousand and ten — A WHOPPING
     longshot just took the lid off this thing!").
  2. Name the pre-race favourite (find them in `finishers` by matching
     `horse_id == favorite_pre_race_id`) and frame how badly they
     fell short — what position did the favourite end up in? How many
     seconds behind the winner?
  3. Use brutal, dramatic language for the favourite: "the chalk is
     CHOKED", "the book got it wrong", "the favourite has BOTTLED it",
     "the punters who piled on are absolutely STUNG", "every sportsbook
     just had a very good day", "the value-hunters are smiling tonight".
  4. Reference the winner's bio — pull a punchy line from their
     `description` to explain the surprise ("they said the Pickpocketer
     would never see the wire — well, the wire saw HIM").
  5. Country trophy framing if applicable: if the winner is from a
     country represented sparsely, lean into "first ever for the
     [demonym]" type angles.

If `is_upset` is false: chalk holds. Brief acknowledgement: "The book
had it right" / "favourite delivers as priced". Keep it short — chalk
wins are not the highlight.

RECORD HANDLING
═══════════════════════════════════════════════════════════════════════
If `records.at_distance` exists and the winner's finish_seconds is
LESS than `records.at_distance.finish_seconds`, lead with RECORD
framing — name the previous record holder + year, state the new time
and the margin of improvement.

CAREER COUNTS — POST-RACE NUMBERS ALREADY INCLUDE TODAY
═══════════════════════════════════════════════════════════════════════
EVERY finisher's `history` is the AS-OF-NOW count INCLUDING this race
that just finished. So `history.wins` for the winner = their NEW total
including today. NEVER add one to it — the math is already done.

  • Winner whose history.wins = 9    →    "her ninth career win"     ✅
  • Winner whose history.wins = 9    →    "her tenth career win"     ❌
  • Winner whose history.wins = 1    →    "a maiden-breaking debut!" ✅
                                          ("her first career win")
  • Winner whose history.wins = 1    →    "her zero career wins"     ❌

If `history.wins` for the winner is 1, frame it explicitly as breaking
their maiden — they had ZERO career wins coming into today.

The mirror keys `career_now_wins`, `career_now_places`,
`career_now_shows`, `career_now_participations` carry the same numbers
under unambiguous names. Use whichever reads cleaner; both are correct
post-race totals.

OTHER COLOUR
═══════════════════════════════════════════════════════════════════════
• Country shoutout if the winner's country is uniquely theirs in this
  race.
• Reference winner's `history.wins` count for "[their N]th career win"
  or "maiden breaker" — already includes today, see CAREER COUNTS rule.
• If `last_race` non-empty, compare to last year's winner. Were they in
  this race? Did they finish ahead of or behind today's top three?
• If any finisher has `dq: true` (didn't make the 60-second cutoff),
  give them a beat of black-comedy — "Prep Duty Veeramani is, as we
  speak, still contemplating the meaning of life — disqualified at the
  60-second siren". This MUST be acknowledged when present.

═══════════════════════════════════════════════════════════════════════
CADENCE & STYLE
═══════════════════════════════════════════════════════════════════════
• Open hot, then ride the rhythm down to a wrap-up.
• Don't list times in monotonous succession — mix in colour around them.
• Length: 30-60 seconds depending on how much material the result
  affords (record run + upset = expansive; chalk-with-no-history = brief).

END WITH: "The {edition_label} race is officially in the books."

FORMAT: plain text spoken commentary only. No markdown, no stage
directions, no quotes, no JSON.
"""


# ───── Top-level orchestration ───────────────────────────────────────
def _maybe_attach_phrase_inserts(context: Dict[str, Any]) -> None:
    """Roll the dice for the conditional verbatim inserts. Mutates `context`
    in place so the LLM sees the resolved values.

    30 % chance the Yaya line is included; 20 % chance the Naresh line;
    18 % chance the US-Congress fix-rumor line. Independent rolls.
    """
    inserts = context.setdefault('phrase_inserts', {})
    inserts['yaya']   = PHRASE_YAYA   if random.random() < P_INSERT_YAYA   else None
    inserts['naresh'] = PHRASE_NARESH if random.random() < P_INSERT_NARESH else None

    # US-Congress rumor — pick a random horse from THIS field as the
    # subject. Falls back silently if context has no horses (shouldn't
    # happen, but keeps the call safe).
    horses = context.get('horses') or []
    if random.random() < P_INSERT_CONGRESS and horses:
        target = random.choice(horses)
        target_name = target.get('full_name') or target.get('saddle_name') or 'this runner'
        inserts['us_congress'] = PHRASE_US_CONGRESS_TEMPLATE.format(horse=target_name)
    else:
        inserts['us_congress'] = None

    # Pam Merchant — also picks a random horse from the field. Higher
    # probability than US-Congress because the user wants this firing
    # often as a replacement for the announcer's off-topic waffling.
    if random.random() < P_INSERT_PAMMIE and horses:
        pamhorse = random.choice(horses)
        pam_name = pamhorse.get('full_name') or pamhorse.get('saddle_name') or 'a runner'
        inserts['pammie'] = PHRASE_PAMMIE_TEMPLATE.format(horse=pam_name)
    else:
        inserts['pammie'] = None

    # Ootacamund Physicists — only fires when bottom_finishers has ≥ 2
    # qualifying horses AND prop_thresholds.winby_seconds is set.
    bottom_finishers = context.get('bottom_finishers') or []
    winby_secs = (context.get('prop_thresholds') or {}).get('winby_seconds')
    if (
        random.random() < P_INSERT_OOTACAMUND
        and len(bottom_finishers) >= 2
        and winby_secs is not None
    ):
        # Pick TWO different horses from the qualifying bottom-finishers.
        pair = random.sample(bottom_finishers, k=2)
        inserts['ootacamund'] = PHRASE_OOTACAMUND_TEMPLATE.format(
            winby_seconds=winby_secs,
            horse_y=pair[0].get('full_name') or pair[0].get('saddle_name') or 'one runner',
            horse_z=pair[1].get('full_name') or pair[1].get('saddle_name') or 'another',
        )
    else:
        inserts['ootacamund'] = None

    # Celebrity ship — pick a random celebrity (70 % broad pool, 30 %
    # GSIS in-house specials for chaotic flavour) + a random horse from
    # this field. The line ships its own Billy Walters tag, so when it
    # fires we NULL OUT the standalone billy_walters insert below to
    # prevent the LLM saying the tag twice.
    if random.random() < P_INSERT_CELEB_SHIP and horses:
        if random.random() < 0.30 and GSIS_CELEBRITIES:
            celeb = random.choice(GSIS_CELEBRITIES)
        else:
            celeb = random.choice(CELEBRITIES)
        ship_horse = random.choice(horses)
        ship_name = ship_horse.get('full_name') or ship_horse.get('saddle_name') or 'a runner'
        inserts['celeb_ship'] = PHRASE_CELEB_SHIP_TEMPLATE.format(
            celebrity=celeb,
            horse=ship_name,
        )
        # Suppress the standalone Billy Walters tag so it isn't said
        # twice in the same clip.
        inserts['billy_walters'] = None
    else:
        inserts['celeb_ship'] = None

    # NY Five Families — picks TWO different random horses from the field.
    if random.random() < P_INSERT_FIVE_FAMILIES and len(horses) >= 2:
        a, b = random.sample(horses, k=2)
        a_name = a.get('full_name') or a.get('saddle_name') or 'one runner'
        b_name = b.get('full_name') or b.get('saddle_name') or 'another'
        inserts['five_families'] = PHRASE_FIVE_FAMILIES_TEMPLATE.format(
            horse_a=a_name,
            horse_b=b_name,
        )
    else:
        inserts['five_families'] = None


# ───── Gibberish guardrail ───────────────────────────────────────────
# The LLM very occasionally collapses into word-salad — the same word
# repeated dozens of times, sentences that never end, or off-topic jargon
# that has nothing to do with the race. Sending that to TTS produces a
# minute of unintelligible audio. This guardrail screens the output
# BEFORE TTS and, on detection, swaps in a deterministic fallback clip
# built from the always-true field facts plus whichever conditional
# phrases were rolled this call.
_WORD_RE = re.compile(r"[A-Za-z][A-Za-z'-]+")


def _detect_gibberish(text: str, context: Optional[Dict[str, Any]] = None) -> Optional[str]:
    """Return a short reason string if `text` looks like LLM word-salad,
    else None. Conservative — only trips on clearly-broken output. False
    positives are worse than false negatives because they replace a good
    clip with the canned fallback.

    Trip conditions (any one fires):
      • Empty / near-empty (< 60 chars) — failed generation.
      • Insanely long (> 8000 chars) — model didn't stop.
      • Same word repeated 5+ times in a row anywhere ("the the the …").
      • Same word ≥ 12 % of total tokens (single-word loop).
      • Unique-word ratio < 0.30 — heavy repetition.
      • A single sentence > 600 chars with no internal period — runaway.
      • None of the field's horses are named in the output (only when
        context is provided and field had ≥ 3 horses).
    """
    if not text or len(text) < 60:
        return f'too short ({len(text) if text else 0} chars)'
    if len(text) > 8000:
        return f'too long ({len(text)} chars — model didn\'t stop)'

    tokens = _WORD_RE.findall(text.lower())
    if len(tokens) < 12:
        return 'too few words'

    # Same word 5x in a row.
    run = 1
    for i in range(1, len(tokens)):
        if tokens[i] == tokens[i - 1]:
            run += 1
            if run >= 5:
                return f'word "{tokens[i]}" repeated {run}x in a row'
        else:
            run = 1

    # Single-word frequency dominance — bail if any non-stopword exceeds
    # 12 % of all tokens (real prose tops out around 5 % even for "the").
    stop = {'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'at',
            'is', 'it', 'this', 'that', 'with', 'for', 'as', 'by', 'his',
            'her', 'its', 'their', 'they', 'we', 'are', 'be', 'has', 'have'}
    counts: Dict[str, int] = {}
    for t in tokens:
        counts[t] = counts.get(t, 0) + 1
    top_word, top_n = max(counts.items(), key=lambda kv: kv[1])
    if top_word not in stop and top_n / max(1, len(tokens)) > 0.12:
        return f'word "{top_word}" dominates ({top_n}/{len(tokens)})'

    # Unique-word ratio.
    unique_ratio = len(set(tokens)) / max(1, len(tokens))
    if unique_ratio < 0.30:
        return f'unique-word ratio {unique_ratio:.2f} (< 0.30 = heavy repetition)'

    # Runaway sentence (no period for ages).
    longest_no_period = max(
        (len(seg) for seg in re.split(r'[.!?]\s+', text)),
        default=0,
    )
    if longest_no_period > 600:
        return f'unbroken sentence of {longest_no_period} chars (no terminal punct)'

    # Field-name presence — is the model even talking about THIS race?
    if context:
        horses = context.get('horses') or []
        if len(horses) >= 3:
            text_lower = text.lower()
            mentions = sum(
                1 for h in horses
                if (h.get('full_name') and h['full_name'].lower() in text_lower)
                or (h.get('saddle_name') and str(h['saddle_name']).lower() in text_lower)
            )
            if mentions == 0:
                return 'no field-horse name appears anywhere in output'

    return None


def _build_fallback_clip(context: Dict[str, Any], phase: str) -> str:
    """Deterministic fallback when the LLM produces gibberish. Uses
    field facts + whichever conditional phrases were rolled, so the
    listener gets a coherent ~20-30s clip instead of word-salad audio.

    For pre-race we lead with edition + field size + favorite + longshot
    odds, then fold in any rolled phrase inserts.

    For post-race we report the actual finish order from the context.
    """
    parts: List[str] = []

    if phase == 'post':
        finishers = context.get('finishers') or []
        winner = context.get('winner')
        runner_up = context.get('runner_up')
        edition = context.get('edition_label') or 'this edition'
        if winner:
            parts.append(
                f"And across the wire — first is {winner.get('full_name', 'the winner')}! "
                f"Time, {winner.get('finish_seconds', 0):.2f} seconds."
            )
        if runner_up:
            parts.append(
                f"In second, {runner_up.get('full_name', 'second')} at "
                f"{runner_up.get('finish_seconds', 0):.2f}."
            )
        show = context.get('show')
        if show:
            parts.append(
                f"Rounding out the trifecta, {show.get('full_name', 'third')} "
                f"in {show.get('finish_seconds', 0):.2f}."
            )
        parts.append(f"The {edition} race is officially in the books.")
        return ' '.join(p for p in parts if p)

    # ── Pre-race ──
    edition = context.get('edition_label') or 'this edition'
    field_size = context.get('field_size') or 0
    distance = context.get('distance') or 0
    fav = context.get('favorite')
    long_ = context.get('longshot')

    parts.append(
        f"Welcome to Churchill Downs — the {edition} of the betGSIS Cup, "
        f"{field_size} runners over {distance} lengths."
    )
    if fav and fav.get('full_name'):
        odds = fav.get('win_odds_speech') or 'the chalk'
        parts.append(f"The favourite tonight is {fav['full_name']} — {odds}.")
    if long_ and long_.get('full_name'):
        odds = long_.get('finish_last_odds_speech') or long_.get('win_odds_speech') or 'a longshot'
        parts.append(f"At the back, {long_['full_name']} — {odds}.")

    inserts = (context.get('mandatory_inserts') or {})
    if inserts.get('analyst_last_place'):
        parts.append(inserts['analyst_last_place'])

    phr = context.get('phrase_inserts') or {}
    # Drop in whichever rolled-phrases are non-null. Order them so the
    # most-anchored facts come first, the colour bits at the end. The
    # celeb_ship line carries its own Billy Walters tag, so we skip the
    # standalone billy_walters when celeb_ship fired.
    for key in (
        'pammie', 'ootacamund', 'celeb_ship', 'five_families',
        'yaya', 'naresh', 'us_congress',
    ):
        if phr.get(key):
            parts.append(phr[key])
    if phr.get('billy_walters') and not phr.get('celeb_ship'):
        parts.append(phr['billy_walters'])

    parts.append("Stand by — the gates are about to fly open.")
    return ' '.join(p for p in parts if p)


def generate_commentary(
    *,
    phase: str,                       # 'pre' | 'post' | 'fan'
    context: Dict[str, Any],
) -> Dict[str, Any]:
    """One-shot: text → audio. Returns dict with text + base64 mp3.

    Phase-specific:
      • 'pre'  uses PRE_RACE_SYSTEM   + rolls conditional inserts
      • 'post' uses POST_RACE_SYSTEM
      • 'fan'  uses FAN_SYSTEM        + persona voice + persona instructions
    """
    if phase not in ('pre', 'post', 'fan'):
        raise ValueError(f'phase must be "pre" | "post" | "fan", got {phase!r}')

    # Per-phase voice / instructions defaults — overridden below for fan.
    tts_voice         = TTS_VOICE
    tts_instructions  = TTS_INSTRUCTIONS

    if phase == 'pre':
        _maybe_attach_phrase_inserts(context)
        system_prompt = PRE_RACE_SYSTEM
        temperature   = PRE_RACE_TEMPERATURE
        max_tokens    = PRE_RACE_MAX_TOKENS
        freq_penalty  = PRE_RACE_FREQ_PENALTY
    elif phase == 'post':
        system_prompt = POST_RACE_SYSTEM
        temperature   = POST_RACE_TEMPERATURE
        max_tokens    = POST_RACE_MAX_TOKENS
        freq_penalty  = POST_RACE_FREQ_PENALTY
    else:  # fan
        accent = context.get('accent') or 'american'
        persona = FAN_PERSONAS.get(accent) or FAN_PERSONAS['american']
        tts_voice        = persona['tts_voice']
        tts_instructions = persona['instructions']
        system_prompt    = FAN_SYSTEM
        temperature      = 0.95
        # Fan clips are intentionally short — keeps the broadcast moving
        # and TTS latency low.
        max_tokens       = 320
        freq_penalty     = FAN_FREQ_PENALTY

    client = _get_client()

    # ── Text ──
    import json as _json
    user_prompt = (
        'CONTEXT (JSON):\n' + _json.dumps(context, ensure_ascii=False, indent=2)
    )
    chat = client.chat.completions.create(
        model=TEXT_MODEL,
        temperature=temperature,
        max_tokens=max_tokens,
        # Discourages the runaway-token loops that produce word-salad.
        # Pairs with the post-LLM gibberish detector below.
        frequency_penalty=freq_penalty,
        presence_penalty=0.10,
        messages=[
            {'role': 'system', 'content': system_prompt},
            {'role': 'user',   'content': user_prompt},
        ],
    )
    text = (chat.choices[0].message.content or '').strip()

    # ── Gibberish guardrail ─────────────────────────────────────────
    # If the LLM collapsed into word-salad, swap in the deterministic
    # fallback script (built from field facts + rolled phrase inserts).
    # Logged loudly so we can monitor how often it trips.
    fallback_phase = 'post' if phase == 'post' else ('fan' if phase == 'fan' else 'pre')
    gib_reason = _detect_gibberish(text, context if phase != 'fan' else None)
    if gib_reason:
        print(f'[commentary] !!! GIBBERISH DETECTED ({phase}): {gib_reason}')
        print(f'[commentary]    first 300 chars: {text[:300]!r}')
        if phase == 'fan':
            # Fan personas use their own data shape — fall back to a
            # short single-sentence shrug rather than the announcer
            # script, so the voice/persona stays roughly consistent.
            fan_name = context.get('fan_name') or 'a fan'
            bet = (context.get('bet') or {})
            horse = bet.get('horse_full_name') or 'this runner'
            kind  = bet.get('bet_kind') or 'to win'
            odds  = bet.get('bet_odds_speech') or 'good price'
            text = (
                f"This is {fan_name} from the stands — putting it on "
                f"{horse} {kind} at {odds}. You watch."
            )
        else:
            text = _build_fallback_clip(context, fallback_phase)
        print(f'[commentary]    fallback length: {len(text)} chars')

    # ── Safety truncation ──
    # gpt-4o-mini-tts rejects inputs over 2000 tokens. We size GPT's
    # max_tokens conservatively, but high-temp output occasionally goes
    # long. Trim at the last sentence boundary under the cap so TTS never
    # 400s on us.
    if len(text) > TTS_INPUT_CHAR_CAP:
        cut = text[:TTS_INPUT_CHAR_CAP]
        # Prefer a sentence-ending punct as the trim point.
        for sep in ('. ', '! ', '? ', '; ', ', ', ' '):
            idx = cut.rfind(sep)
            if idx > TTS_INPUT_CHAR_CAP * 0.6:
                cut = cut[:idx + 1]
                break
        print(f'[commentary] truncated text {len(text)} -> {len(cut)} chars for TTS')
        text = cut

    # ── Audio ──
    # `instructions` is only honoured by gpt-4o-mini-tts (the newer model);
    # legacy tts-1 / tts-1-hd ignore the kwarg, but we send it conditionally
    # to avoid an SDK validation error if a future SDK gets stricter.
    # Fan phases override voice + instructions to drive the persona accents;
    # pre/post fall back to the announcer defaults.
    speech_kwargs = {
        'model': TTS_MODEL,
        'voice': tts_voice,
        'input': text,
        'speed': TTS_SPEED,
        'response_format': 'mp3',
    }
    if 'gpt-4o' in TTS_MODEL and tts_instructions:
        speech_kwargs['instructions'] = tts_instructions
    audio_resp = client.audio.speech.create(**speech_kwargs)
    # The SDK returns a streaming object. .read() pulls the full mp3 bytes.
    if hasattr(audio_resp, 'read'):
        audio_bytes = audio_resp.read()
    else:
        # Fallback for older SDK shapes.
        audio_bytes = audio_resp.content

    import base64 as _b64
    return {
        'phase':         phase,
        'text':          text,
        'audio_b64':     _b64.b64encode(audio_bytes).decode('ascii'),
        'audio_mime':    'audio/mpeg',
        'tts_voice':     tts_voice,
        'tts_speed':     TTS_SPEED,
        'text_model':    TEXT_MODEL,
        'tts_model':     TTS_MODEL,
        # For fan clips — surface the accent + fan name to the frontend
        # so the CC bar can label the speaker ("Fan in the stands —
        # Vikram"). For pre/post these stay None.
        'fan_accent':    context.get('accent') if phase == 'fan' else None,
        'fan_name':      context.get('fan_name') if phase == 'fan' else None,
    }
