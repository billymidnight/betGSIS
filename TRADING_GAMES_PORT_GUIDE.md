# Trading Games — Port Guide for New App

This guide is for porting **3 of the 4** trading games (`Sopranos`, `Breaking Bad`, `Harry Potter` — **NOT Good Shepherd**) from this repo (`geo_book`) into a separate web app that shares the **same Supabase project**.

The shared Supabase project means every `*_trading`, `*_markets`, and `*_settings` table in the schema is already populated and queryable from the new app with the same credentials. Card images, however, are served as static files from this repo's backend and need to be copied to the new app.

---

## Part 1 — High-level differences in the new app

| Aspect | This repo (`geo_book`) | New app |
|---|---|---|
| Auth | Supabase JWT via `Authorization: Bearer <token>` header | Use the new app's existing auth |
| Session-end persistence | Writes a synthetic row to `bets` table | **Drop entirely** — show a P&L modal, offer "Restart" / "Quit" |
| Locks | Reads `trading_locks` table to gate entry | **Drop entirely** unless you have a similar concept |
| Chop feature | Sends `player_chops` / `house_chops` to backend | **Drop** (depends on the `bets` table) |
| Stats / leaderboard | Per-game `/stats` endpoint reads from `bets` | **Drop** |
| Everything else | — | Port verbatim |

**Net effect**: keep the **draw → markets → bet UI → settle → next round → bust/end** loop. Throw away the `end-session` endpoint, the `/stats` endpoint, the locks check, and the bets-table dependency.

---

## Part 2 — Files to copy (tag list)

### Backend (Python / Flask)

| File | What it does | Port action |
|---|---|---|
| [backend/routes/trading.py](backend/routes/trading.py) | **Sopranos** routes (legacy: lives in the generic `trading_bp` blueprint) | Copy. Strip the `/end-session`, `/stats`, `/locks` endpoints. |
| [backend/routes/breakingbad.py](backend/routes/breakingbad.py) | Breaking Bad routes | Copy. Strip same endpoints. |
| [backend/routes/harrypotter.py](backend/routes/harrypotter.py) | Harry Potter routes | Copy. Strip same endpoints. |
| [backend/utils/odds.py](backend/utils/odds.py) | Shared odds-conversion helpers (used by `services/`, not by trading directly — **trading.py uses inline helpers, see Part 5**) | Optional |
| [backend/database/supabase_client.py](backend/database/supabase_client.py) | Supabase client factory | Use your new app's equivalent |
| [backend/sopranos/](backend/sopranos/) | 38 Sopranos card JPGs + `facedown.png` + `sopranosbg.jpg` | **Copy folder** |
| [backend/breakingbad/](backend/breakingbad/) | 36 Breaking Bad images + face-down | **Copy folder** |
| [backend/harrypotter/](backend/harrypotter/) | 43 Harry Potter images + face-down | **Copy folder** |

### Frontend (React / TypeScript)

| File | What it does | Port action |
|---|---|---|
| [frontend/src/pages/Trading.tsx](frontend/src/pages/Trading.tsx) | Landing page with 3 game cards | Copy and adapt to new "Games" page; drop the locks check + Good Shepherd card |
| [frontend/src/pages/Trading.css](frontend/src/pages/Trading.css) | Landing-page styles | Copy |
| [frontend/src/pages/SopranosTrading.tsx](frontend/src/pages/SopranosTrading.tsx) | Full Sopranos session UI | Copy. Strip chop modal + `endSopranosSession` call. |
| [frontend/src/pages/SopranosTrading.css](frontend/src/pages/SopranosTrading.css) | Sopranos session styles | Copy |
| [frontend/src/pages/BreakingBadTrading.tsx](frontend/src/pages/BreakingBadTrading.tsx) | Breaking Bad session UI | Copy. Strip same. |
| [frontend/src/pages/BreakingBadTrading.css](frontend/src/pages/BreakingBadTrading.css) | BB styles | Copy |
| [frontend/src/pages/HarryPotterTrading.tsx](frontend/src/pages/HarryPotterTrading.tsx) | Harry Potter session UI | Copy. Strip same. |
| [frontend/src/pages/HarryPotterTrading.css](frontend/src/pages/HarryPotterTrading.css) | HP styles | Copy |

The relevant API helpers are inline in [frontend/src/lib/api/api.ts](frontend/src/lib/api/api.ts). Search the file for the function names listed in **Part 6** below — those are the only ones you need.

### Don't bother copying

- [frontend/src/pages/GoodShepherdTrading.tsx](frontend/src/pages/GoodShepherdTrading.tsx) and CSS
- [backend/routes/goodshepherd.py](backend/routes/goodshepherd.py)
- [backend/utils/chop.py](backend/utils/chop.py) (chop feature drops with the bets table)
- [frontend/src/components/Shared/ChopModal.tsx](frontend/src/components/Shared/ChopModal.tsx) and CSS
- Any locks files (`BookieMasterLocker`, `MarketLocker`, the `trading_locks` table read code)

---

## Part 3 — The shared Supabase tables (already populated)

You don't need to create these. Just `select` from them.

### Sopranos

`sopranos_trading` — 23 rows, one per character.

| Column | Type | Notes |
|---|---|---|
| `character_id` | int | PK |
| `name` | varchar | e.g. `Tony Soprano` |
| `img_filename` | varchar | e.g. `soprano_tony.jpg` (lives in `backend/sopranos/`) |
| `gender` | char(1) | `M` or `F` (whitespace-padded — strip on read) |
| `season_died` | int | `0` if survived |
| `crew` | varchar nullable | e.g. `Soprano`, `Aprile`, `DiMeo Crime Family` |
| `s3_position` | varchar nullable | `Boss`, `Captain`, etc. |
| `age_s3` | int | Age during season 3 |
| `ever_captain` | bool | |
| `married_s1` | bool | Married during season 1 |

`sopranos_markets` — defines the special markets (gender, captain, married, combined_age, boss). Columns: `market_type`, `count`, `category`, `text_on_screen`, `point` (numeric, used for over/under combined-age lines).

`sopranos_settings` — keys: `card_count` (default `'3'`), `time` (seconds, default `'120'`), `card_nature` (`'static'` or `'random'`).

### Breaking Bad

`breakingbad_trading` — 27 rows.

| Column | Type | Notes |
|---|---|---|
| `character_id` | int | PK |
| `name` | text | e.g. `Walter White` |
| `img_filename` | text | lives in `backend/breakingbad/` |
| `age` | int | |
| `gender` | char(1) | `M` / `F` |
| `was_lawyer` | bool | |
| `won_emmy` | bool | |
| `family` | text nullable | e.g. `White`, `Salamanca`, `Cartel` |
| `survived` | bool | |

`breakingbad_markets` — same shape as sopranos_markets.

`breakingbad_settings` — same shape.

### Harry Potter

`harrypotter_trading` — 38 rows.

| Column | Type | Notes |
|---|---|---|
| `character_id` | int | PK |
| `name` | text | |
| `img_filename` | text | lives in `backend/harrypotter/` |
| `age` | int | |
| `gender` | char(1) | |
| `survived` | bool | |
| `house` | text nullable | `Gryffindor` / `Slytherin` / `Hufflepuff` / `Ravenclaw` |
| `is_muggle` | bool | |
| `is_potter` | bool | |
| `is_weasley` | bool | |
| `is_death_eater` | bool | |
| `is_was_teacher` | bool | |

`harrypotter_markets` — adds an extra `house` column on top of the standard markets shape.

`harrypotter_settings` — same shape.

---

## Part 4 — The unified game loop (what to build in the UI)

```
┌──────────────────────────────────────────────────────────┐
│ 1. Landing page                                          │
│    - Show "Sessions Played" / "Total P&L" stats          │
│      (in the new app, these come from in-memory state    │
│       since there's no bets table — start at 0)          │
│    - "Start New Session" → opens bankroll picker         │
│      ($25 / $50 / $100 / $200)                           │
│                                                          │
│ 2. Pick bankroll → enter session view                   │
│    - balance := bankroll                                 │
│    - draw() → cards face-down, markets fetched          │
│    - 2-min betting timer starts                          │
│                                                          │
│ 3. Place bets (no submit → settle on timer expiry)      │
│    OR user clicks SUBMIT before timer ends              │
│                                                          │
│ 4. Cards flip → /settle endpoint evaluates each bet     │
│    - balance += round_pnl                                │
│    - if balance > 0: show NEXT DRAW button              │
│    - if balance <= 0: 1.5s delay → endSession (busted)  │
│                                                          │
│ 5. End session                                           │
│    - Compute final pnl = balance - bankroll              │
│    - Show "Session Concluded" / "Bankroll Busted" modal │
│    - In old app: write synthetic bet row → bets table   │
│    - In NEW app: just display modal with pnl, offer     │
│      "Restart" / "Back to Menu"                          │
└──────────────────────────────────────────────────────────┘
```

Key state shape (per game session, in React component):

```ts
view: 'landing' | 'session'
bankroll: number              // chosen at start
balance: number               // current chips
sessionBetsPlaced: number
sessionAmountWagered: number
cards: Character[]            // current draw
cardsRevealed: boolean        // false until SUBMIT or timer-zero
markets, characterMarkets, crewMarkets, specialMarkets   // current odds
betAmounts: { [market_id]: string }   // per-market stake in $
timer: number                 // counts down from 120
showNextDrawButton: boolean   // appears after settle if balance > 0
showEndSessionModal: boolean
```

---

## Part 5 — The odds engine (port verbatim)

These three functions are inlined into each route file. The same code lives in `trading.py`, `breakingbad.py`, and `harrypotter.py`. Lift this once into a shared `utils/trading_odds.py` in the new app.

```python
import math, random
from typing import Callable, Dict, List

VIG_MARGIN = 0.03           # 3% base vig (general & character & crew/family/house markets)
SPECIALS_VIG_MARGIN = 0.045 # 4.5% on specials


def calculate_probability(deck: List[Dict], condition_func: Callable, num_cards: int) -> float:
    """Probability that a random `num_cards`-subset of `deck` satisfies `condition_func`.

    Exact enumeration for small decks (≤30 cards), Monte Carlo with 10k samples otherwise.
    Bounded to [0.01, 0.99] so we never quote 1:1 or impossible odds.
    """
    total = math.comb(len(deck), num_cards)
    favorable = 0
    if len(deck) > 30:
        for _ in range(10_000):
            if condition_func(random.sample(deck, num_cards)):
                favorable += 1
        probability = favorable / 10_000
    else:
        from itertools import combinations
        for combo in combinations(deck, num_cards):
            if condition_func(list(combo)):
                favorable += 1
        probability = favorable / total
    return max(0.01, min(0.99, probability))


def apply_vig(probability: float, margin: float = VIG_MARGIN) -> float:
    """Asymmetric vig — heavier on underdogs. Returns DECIMAL odds.

    Underdogs (prob < 0.5) get extra margin proportional to distance from 50%.
    Favorites keep base margin.
    """
    distance_from_evens = abs(probability - 0.5)
    if probability < 0.5:
        extra = distance_from_evens * 0.4
        adjusted = margin + extra
    else:
        adjusted = margin
    adjusted = max(0.01, min(0.08, adjusted))    # clamp 1%–8%
    vigged = probability / (1.0 - adjusted)
    vigged = min(vigged, 0.9999)
    return 1.0 / vigged if vigged > 0 else 100.0


def decimal_to_american(decimal_odds: float) -> int:
    """Decimal → American with bookie-favorable rounding.

    Magnitude-based rounding tiers:
    - |odds| 300–999  → round to nearest 10  (positive: floor; negative: ceil-abs)
    - |odds| 1000–9999 → round to nearest 100 (same direction)
    """
    if decimal_odds >= 2.0:
        american = int((decimal_odds - 1) * 100)
    else:
        american = int(-100 / (decimal_odds - 1))

    abs_odds = abs(american)
    if 300 <= abs_odds < 1000:
        if american > 0:
            american = (american // 10) * 10
        else:
            american = -((abs(american) + 9) // 10) * 10
    elif 1000 <= abs_odds < 10000:
        if american > 0:
            american = (american // 100) * 100
        else:
            american = -((abs(american) + 99) // 100) * 100
    return american
```

Decimal-to-american conversion **on the frontend** (used in `api.ts` calls but not strictly required since backend returns both):

```ts
// JS equivalent if you ever need to compute on frontend
function americanToDecimal(amer: number): number {
  return amer > 0 ? amer / 100 + 1 : 100 / Math.abs(amer) + 1;
}
```

---

## Part 6 — Backend API reference (per game)

Each game exposes the same endpoint shape under its own `url_prefix`:

| Game | Prefix |
|---|---|
| Sopranos | `/api/trading/sopranos` |
| Breaking Bad | `/api/trading/breakingbad` |
| Harry Potter | `/api/trading/harrypotter` |

### `GET /characters`

Returns the full deck.

```json
{ "success": true, "characters": [ /* every row from <game>_trading */ ] }
```

### `POST /draw`

Body: `{}` (or `{ "num_cards": 3 }`)

Reads `<game>_settings.card_count` and `card_nature`. If nature is `random`, picks N from `{2, 3, 4}` randomly; if `static`, uses `card_count`.

```json
{
  "success": true,
  "draw": [ /* num_cards Character objects */ ],
  "num_cards": 3,
  "draw_id": "draw_482917"
}
```

### `POST /markets` — General markets

Body: `{ "num_cards": <int> }`

These are **hardcoded per-game** (3 sample markets each). Sopranos: `All Married`, `No Bosses`, `All Men`. BB and HP have their own. Look at the source:

- Sopranos: [trading.py:198-270](backend/routes/trading.py#L198-L270)
- Breaking Bad: [breakingbad.py:152-163](backend/routes/breakingbad.py#L152-L163)
- Harry Potter: [harrypotter.py:153-164](backend/routes/harrypotter.py#L153-L164)

```json
{
  "success": true,
  "markets": [
    {
      "market_id": "all_married",
      "name": "All Married",
      "description": "All 3 characters were married in Season 3",
      "odds_decimal": 18.97,
      "odds_american": 1797,
      "probability": 5.1
    }
  ]
}
```

### `POST /character-markets`

Returns drawn / not-drawn markets for **4 randomly sampled** characters per round.

```json
{
  "success": true,
  "character_markets": [
    {
      "character_id": 5,
      "character_name": "Tony Soprano",
      "drawn": {
        "market_id": "char_5_drawn",
        "market_type": "character_drawn",
        "text_on_screen": "Tony Soprano - Drawn",
        "odds_decimal": 7.42,
        "odds_american": 642,
        "probability": 13.0
      },
      "not_drawn": { "market_id": "char_5_not_drawn", "...": "..." }
    }
  ],
  "num_sampled": 4,
  "total_characters": 23
}
```

Probability formula: `prob_drawn = num_cards / n` where `n = total characters`.

### `POST /crew-markets` (Sopranos, BB)  /  `POST /house-markets` (Harry Potter)

Sopranos: `crew_markets` keyed off `crew` column, samples 3 random crews.
Breaking Bad: `crew_markets` (legacy name) keyed off `family` column, returns ALL families.
Harry Potter: `house_markets`, fixed list `['Gryffindor', 'Slytherin', 'Hufflepuff', 'Ravenclaw']`.

Probability formula:
```
prob_at_least_one_drawn = 1 - C(n - k, num_cards) / C(n, num_cards)
                          where k = group size, n = total deck
```

Sopranos response shape (BB nearly identical, but `family_*` market_ids):

```json
{
  "success": true,
  "crew_markets": [
    {
      "crew_name": "Soprano",
      "crew_size": 5,
      "drawn": { "market_id": "crew_soprano_drawn", "...": "..." },
      "not_drawn": { "market_id": "crew_soprano_not_drawn", "...": "..." }
    }
  ]
}
```

HP response shape:

```json
{
  "success": true,
  "house_markets": [
    {
      "house_name": "Gryffindor",
      "house_size": 12,
      "drawn": { "market_id": "house_gryffindor_drawn", "...": "..." },
      "not_drawn": { "market_id": "house_gryffindor_not_drawn", "...": "..." }
    }
  ]
}
```

### `POST /special-markets`

Theme-specific. The market_id strings are the contract that `/settle` later parses.

**Sopranos** (DB-driven from `sopranos_markets`):
- `gender_men_all`, `gender_men_atleast_1`, `gender_women_all`, `gender_women_atleast_1`
- `captain_captain_all`, `captain_captain_none`, `captain_captain_atleast_1`
- `boss_none`, `boss_atleast_1`
- `married_married_none`, `married_married_atleast_1`
- `combined_age_over_<X>`, `combined_age_under_<X>` (e.g. `combined_age_over_105_5` means line at 105.5)

**Breaking Bad** (hardcoded):
- `men_all`, `women_atleast_1`
- `lawyer_none`, `lawyer_atleast_1`
- `emmy_none`, `emmy_atleast_1`
- `dead_over_1_5`, `dead_under_1_5`
- `age_over_<X>` (combined-age over/under markets — values vary)

**Harry Potter** (hardcoded):
- `men_all`, `women_atleast_1`
- `gender_more_men`, `gender_more_women`
- `teacher_none`, `teacher_atleast_1`
- `survivor_none`, `survivor_atleast_1`
- `weasley_atleast_1`
- `potter_atleast_1`

Response shape (all 3 games):

```json
{
  "success": true,
  "special_markets": [
    {
      "market_id": "lawyer_atleast_1",
      "name": "At Least One Lawyer",
      "description": "At least 1 of 3 characters is a lawyer",
      "odds_decimal": 2.11,
      "odds_american": 111,
      "probability": 47.4
    }
  ]
}
```

### `POST /settle`

Body:
```json
{
  "drawn_characters": [ /* array from /draw response */ ],
  "bets": [
    { "market_id": "all_men", "stake": 5, "odds_decimal": 2.5, "odds_american": 150, "market_name": "All Men" }
  ]
}
```

Server walks through each bet, parses the `market_id` against the patterns above, evaluates against `drawn_characters`, and returns:

```json
{
  "success": true,
  "results": [
    {
      "market_id": "all_men",
      "market_name": "All Men",
      "stake": 5,
      "odds_decimal": 2.5,
      "odds_american": 150,
      "won": true,
      "push": false,
      "payout": 12.5,
      "pnl": 7.5
    }
  ],
  "total_pnl": 7.5,
  "drawn_characters": [ /* same array, echoed back */ ]
}
```

PnL math (in settle):
```python
if won:
    payout = stake * odds_decimal
    pnl = payout - stake
else:
    pnl = -stake
```

### Endpoints to **NOT port**:

- `GET /characters/<id>` (image-serving `/sopranos/<filename>` etc. — keep these but mount them as static file routes; in Flask you do `app.route('/sopranos/<path:filename>') @ send_from_directory(...)`)
- `POST /end-session` — drop entirely
- `GET /stats` — drop or stub returning `{sessions_played: 0, total_pnl: 0}`
- `GET /reference` (Sopranos only — for the Help page) — drop unless you want it
- `GET /api/trading/locks` — drop
- `GET /api/trading/chop-users` — drop

---

## Part 7 — Frontend session-page structure

Each `*Trading.tsx` is ~1100 lines but mostly JSX. The skeleton:

```tsx
export default function SopranosTrading() {
  const [view, setView] = useState<'landing' | 'session'>('landing');

  // bankroll / balance state
  const [bankroll, setBankroll] = useState(0);
  const [balance, setBalance] = useState(0);
  const [sessionBetsPlaced, setSessionBetsPlaced] = useState(0);
  const [sessionAmountWagered, setSessionAmountWagered] = useState(0);

  // round state
  const [cards, setCards] = useState<Character[]>([]);
  const [cardsRevealed, setCardsRevealed] = useState(false);
  const [numCards, setNumCards] = useState(3);

  // markets state (4 categories)
  const [markets, setMarkets] = useState<Market[]>([]);
  const [characterMarkets, setCharacterMarkets] = useState<CharacterMarket[]>([]);
  const [crewMarkets, setCrewMarkets] = useState<CrewMarket[]>([]);   // or houseMarkets for HP
  const [specialMarkets, setSpecialMarkets] = useState<Market[]>([]);

  // betting state
  const [betAmounts, setBetAmounts] = useState<{[k: string]: string}>({});
  const [betResults, setBetResults] = useState<BetResult[]>([]);
  const [roundNetPnl, setRoundNetPnl] = useState(0);

  // timer
  const [timer, setTimer] = useState(120);
  const [timerActive, setTimerActive] = useState(false);

  const startSession = async (selectedBankroll: number) => {
    setBankroll(selectedBankroll);
    setBalance(selectedBankroll);
    setSessionBetsPlaced(0);
    setSessionAmountWagered(0);
    setView('session');
    await startNewDraw();
  };

  const startNewDraw = async () => {
    const drawResp = await drawSopranosCards(3);
    setCards(drawResp.draw);
    setCardsRevealed(false);
    setNumCards(drawResp.num_cards);
    setMarkets((await fetchSopranosGeneralMarkets(drawResp.num_cards)).markets);
    setCharacterMarkets((await fetchSopranosCharacterMarkets(drawResp.num_cards)).character_markets);
    setCrewMarkets((await fetchSopranosCrewMarkets(drawResp.num_cards)).crew_markets);
    setSpecialMarkets((await fetchSopranosSpecialMarkets(drawResp.num_cards)).special_markets);
    setBetAmounts({});
    setBetResults([]);
    setTimer(120);
    setTimerActive(true);
  };

  // when timer hits 0 OR user clicks SUBMIT
  const placeAllBets = async () => {
    setTimerActive(false);
    setCardsRevealed(true);
    const bets = Object.entries(betAmounts)
      .filter(([_, v]) => parseFloat(v || '0') > 0)
      .map(([market_id, v]) => {
        const stake = parseFloat(v);
        const allMarkets = [
          ...markets,
          ...characterMarkets.flatMap(cm => [cm.drawn, cm.not_drawn]),
          ...crewMarkets.flatMap(cm => [cm.drawn, cm.not_drawn]),
          ...specialMarkets,
        ];
        const m = allMarkets.find(x => x.market_id === market_id);
        return {
          market_id,
          stake,
          odds_decimal: m.odds_decimal,
          odds_american: m.odds_american,
          market_name: m.name || m.text_on_screen,
        };
      });
    setSessionBetsPlaced(prev => prev + bets.length);
    setSessionAmountWagered(prev => prev + bets.reduce((s, b) => s + b.stake, 0));
    const settleResp = await settleSopranosBets(cards, bets);
    setBetResults(settleResp.results);
    setRoundNetPnl(settleResp.total_pnl);
    const newBalance = balance + settleResp.total_pnl;
    setBalance(newBalance);
    if (newBalance > 0) {
      setShowNextDrawButton(true);
    } else {
      setTimeout(() => endSession(newBalance - bankroll), 1500);
    }
  };

  const endSession = async (explicitFinalPnl?: number) => {
    const useExplicit = typeof explicitFinalPnl === 'number' && !Number.isNaN(explicitFinalPnl);
    const finalPnl = useExplicit ? (explicitFinalPnl as number) : (balance - bankroll);

    // ⚠️ IN THE NEW APP: skip the API call entirely. Just open the modal:
    setShowEndSessionModal(true);

    // (Old behaviour was: await endSopranosSession({ num_bets, net_pnl: finalPnl, ... }))
  };

  // ... JSX renders the whole UI ...
}
```

### ⚠️ Critical bug to preserve when porting

The `endSession(newBalance - bankroll)` call inside the bust-path `setTimeout` **must pass the explicit pnl as an argument** — not rely on closure-captured `balance`. The `balance` state inside the `setTimeout` closure is the **pre-settlement** value (the captured-render-snapshot). Without the explicit arg, a $70 bust would record `+$45` instead of `-$25`.

Same reason all `<button onClick>` handlers must be `onClick={() => endSession()}` (wrapped) — never `onClick={endSession}` — because otherwise React passes the `MouseEvent` as `explicitFinalPnl`, NaN-poisoning the math.

---

## Part 8 — Card UI (per theme)

All three games use the same overall card layout (face-down JPG until reveal, then a stat panel under the image). The stat fields shown on each card differ per theme:

### Sopranos card stats
- Gender (Male / Female)
- Age (S3)
- Crew (or "Civilian" if null)
- Married (S1) (✓ / ✗)
- Position (Boss / Captain / Soldier / etc.) — bottom of card

### Breaking Bad card stats
- Gender
- Age
- Family (or "—")
- Lawyer (✓ / ✗)
- Emmy Winner (✓ / ✗)
- Survived (✓ / ✗)

### Harry Potter card stats
- Gender
- Age
- House (Gryffindor / Slytherin / Hufflepuff / Ravenclaw)
- Teacher (✓ / ✗)
- Survived (✓ / ✗)
- Family flags (Potter / Weasley / Death Eater) shown as small badges

The exact JSX for each card lives in the `Card` sub-component at the top of each `*Trading.tsx`.

---

## Part 9 — Image serving

The backend serves card JPGs as static files. In `app.py`:

```python
from flask import send_from_directory
import os

@app.route('/sopranos/<path:filename>')
def serve_sopranos_image(filename):
    return send_from_directory(os.path.join(os.path.dirname(__file__), 'sopranos'), filename)

@app.route('/breakingbad/<path:filename>')
def serve_breakingbad_image(filename):
    return send_from_directory(os.path.join(os.path.dirname(__file__), 'breakingbad'), filename)

@app.route('/harrypotter/<path:filename>')
def serve_harrypotter_image(filename):
    return send_from_directory(os.path.join(os.path.dirname(__file__), 'harrypotter'), filename)
```

Frontend builds the URL as `${API_BASE}/sopranos/${character.img_filename}` where `API_BASE` is the backend root (NOT the `/api` root).

---

## Part 10 — Step-by-step port checklist for the new app

### Backend
1. [ ] Verify the new app's Supabase client can `select * from sopranos_trading limit 1`. If yes, you're done with DB setup.
2. [ ] Copy the 3 image folders ([backend/sopranos/](backend/sopranos/), [backend/breakingbad/](backend/breakingbad/), [backend/harrypotter/](backend/harrypotter/)) into the new backend.
3. [ ] Wire the static-file routes (Part 9 snippet).
4. [ ] Create `routes/trading_<game>.py` for each of the 3 games. Copy the route file from this repo, then **delete**:
   - `@*.route('/end-session', ...)` handler
   - `@*.route('/stats', ...)` handler
   - The `from utils.chop import build_session_bet_rows` import (if present)
   - The locks-check imports (if present)
5. [ ] Lift the odds engine (Part 5) into `utils/trading_odds.py` and import from each route file (or just leave inline — the original code does).
6. [ ] Register the 3 blueprints in your new app's `app.py` / FastAPI router.
7. [ ] CORS: ensure your CORS config allows `Content-Type` + your auth header on `/api/trading/*`.

### Frontend
1. [ ] Copy [Trading.tsx](frontend/src/pages/Trading.tsx) + [Trading.css](frontend/src/pages/Trading.css). Strip the locks-fetch logic and the Good Shepherd card.
2. [ ] Copy the 3 `*Trading.tsx` + their CSS files. In each:
   - Remove the `import { useAuthStore }`-based screenname lookup if you don't need it.
   - Remove the `import ChopModal` line and all chop-related state + JSX.
   - Replace the `endXxxSession({ num_bets, net_pnl, ... })` call inside `endSession` with **just `setShowEndSessionModal(true)`**. Don't hit any backend.
3. [ ] Copy the relevant fetch helpers from [api.ts](frontend/src/lib/api/api.ts) (search the file for `fetchSopranos`, `fetchBreakingBad`, `fetchHarryPotter`):
   - `fetchSopranosCharacters`, `drawSopranosCards`, `fetchSopranosGeneralMarkets`, `fetchSopranosCharacterMarkets`, `fetchSopranosCrewMarkets`, `fetchSopranosSpecialMarkets`, `settleSopranosBets`
   - Same suite for `BreakingBad` (uses `CrewMarkets` even though it returns family markets — legacy naming)
   - Same suite for `HarryPotter` (uses `HouseMarkets` instead of `CrewMarkets`)
   - **DO NOT copy** any `endXxxSession` / `fetchXxxStats` / `fetchTradingLocks` / `fetchSopranosReference` helpers
4. [ ] Wire 3 routes in your new app's router: `/games/sopranos`, `/games/breaking-bad`, `/games/harry-potter` (or whatever path scheme you use).
5. [ ] Add a "Games" page to your app's nav, with the Trading landing component as its content.

### Smoke test per game
- [ ] Landing → click "Start New Session" → bankroll modal appears
- [ ] Pick $25 → cards face-down, 3 markets each in 4 categories, timer counting down
- [ ] Place a bet on at least one market in each category (general, character, crew/family/house, specials)
- [ ] Click SUBMIT → cards flip, results shown, balance updates
- [ ] If balance > 0 → "NEXT DRAW" button works
- [ ] Lose enough to bust → modal appears with correct `-$bankroll` pnl (NOT `+something`)
- [ ] Win and click "End Session" manually → modal shows correct pnl
- [ ] No 500 errors in the network tab; no entries written to the `bets` table

---

## Part 11 — Quick reference: market_id format cheat sheet

The frontend never constructs `market_id` strings — it just echoes back whatever the backend returned in `bets[].market_id`. Settle parses these on the way back. Here's the canonical shape:

| Game | Type | Pattern | Examples |
|---|---|---|---|
| All | Character | `char_<id>_drawn`, `char_<id>_not_drawn` | `char_5_drawn` |
| Sopranos | Crew | `crew_<slug>_drawn`, `crew_<slug>_not_drawn` | `crew_soprano_drawn`, `crew_dimeo_crime_family_not_drawn` |
| BB | Family | `family_<slug>_drawn`, `family_<slug>_not_drawn` | `family_white_drawn`, `family_salamanca_not_drawn` |
| HP | House | `house_<slug>_drawn`, `house_<slug>_not_drawn` | `house_gryffindor_drawn` |
| Sopranos | Specials | see Part 6 list | `combined_age_over_125_5`, `boss_atleast_1` |
| BB | Specials | see Part 6 list | `lawyer_none`, `dead_over_1_5` |
| HP | Specials | see Part 6 list | `weasley_atleast_1`, `gender_more_men` |
| All | Hardcoded general | game-specific | Sopranos: `all_married`, `no_bosses`, `all_men` |

`<slug>` is the lowercase string with spaces replaced by underscores (`"DiMeo Crime Family"` → `"dimeo_crime_family"`).

---

## Part 12 — Things you'll inevitably hit

- **`gender` column has trailing whitespace** — it's `character(1)` in postgres but Supabase sometimes returns `'M '`. Always do `str(gender).strip().upper()` before comparing.
- **`crew` / `family` / `house` columns are nullable** — civilians / muggles have NULL. Filter these out before computing crew probability.
- **`combined_age` markets** use Monte Carlo (10k samples) on Sopranos but exact enumeration on BB. Either works.
- **The 30-card deck cutoff** in `calculate_probability` is arbitrary; HP has 38 cards so its general-markets probabilities are sampled, not exact. This is fine.
- **Settle relies on the `drawn_characters` payload from the client** — the client sends back the same array `/draw` originally returned. There's no server-side draw cache. This is by design (stateless settle) but means a malicious client could lie about what was drawn. If you care about that, generate a `draw_id`, cache `drawn_characters` server-side keyed by `draw_id`, and have the client send back only the `draw_id`.

---

## Part 13 — File map summary (one-page version)

```
backend/
├── routes/
│   ├── trading.py          # ← Sopranos + the trading_bp blueprint
│   ├── breakingbad.py      # ← BB
│   └── harrypotter.py      # ← HP
├── sopranos/               # ← copy folder, ~38 jpgs + facedown.png + sopranosbg.jpg
├── breakingbad/            # ← copy folder, ~36 jpgs + facedown.png
├── harrypotter/            # ← copy folder, ~43 jpgs + facedown.png
├── database/
│   └── supabase_client.py  # ← reference; use new app's equivalent
└── app.py                  # ← register blueprints + image static routes here

frontend/src/
├── pages/
│   ├── Trading.tsx         # ← landing page (3-card grid)
│   ├── Trading.css
│   ├── SopranosTrading.tsx + .css
│   ├── BreakingBadTrading.tsx + .css
│   └── HarryPotterTrading.tsx + .css
└── lib/api/api.ts          # ← grep for fetchSopranos*, fetchBreakingBad*, fetchHarryPotter*
```

That's it. If the receiving Claude has questions, the first thing to check is whether their Supabase client is configured correctly — every other piece of this is just code copy.
