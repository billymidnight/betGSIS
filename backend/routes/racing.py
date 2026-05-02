"""Horse Racing — Churchill Downs (offline) endpoints.

Pricing is via the AR(1) Monte Carlo simulator in services.race_sim.
"""
from __future__ import annotations

import logging
import random
import re
import traceback
from typing import Dict, List, Optional

from flask import Blueprint, jsonify, request

from database.supabase_client import get_supabase_client
from services.commentary import (
    build_fan_context,
    build_post_race_context,
    build_pre_race_context,
    generate_commentary,
)
from services.race_sim import run_single_race, simulate_race_field

# Pre-compiled UUID matcher — Supabase's `bets.user_id` column is uuid,
# so non-UUID strings (like the 'guest' placeholder used for unauthed
# play) trigger 22P02 constraint violations on insert. We use this to
# skip those sessions silently in /persist-multi-bets.
_UUID_RE = re.compile(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
    re.IGNORECASE,
)


racing_bp = Blueprint('racing', __name__, url_prefix='/api/racing')

supabase = get_supabase_client()


def _get_race_distance(default: float = 1500.0) -> float:
    """Read the configured `race_distance` from `horse_settings`.

    Falls back to 1500 if the table or row is missing — keeps everything
    working while a fresh deploy is mid-migration. Cheap enough to call
    per-request (one indexed PK lookup); we'll revisit caching if it shows
    up in traces.
    """
    try:
        resp = (
            supabase.table('horse_settings')
            .select('setting_value')
            .eq('setting_key', 'race_distance')
            .limit(1)
            .execute()
        )
        if resp.data:
            return float(resp.data[0]['setting_value'])
    except Exception:
        pass
    return default


def _get_playback_dilation(default: float = 2.0) -> float:
    """Read the configured `playback_dilation` from `horse_settings`.

    Default is 2.0 (= ~20-second race for distance=1500, vs the natural
    ~10s at dilation=1.0). Independent of `race_distance`. Falls back if
    the row is absent so older DBs still get the desired-default behaviour.
    """
    try:
        resp = (
            supabase.table('horse_settings')
            .select('setting_value')
            .eq('setting_key', 'playback_dilation')
            .limit(1)
            .execute()
        )
        if resp.data:
            return float(resp.data[0]['setting_value'])
    except Exception:
        pass
    return default


YEAR_BASE = 1707         # the 1st Edition year — used to derive edition number


def _get_year_counter(default: int = YEAR_BASE) -> int:
    """Read the current `year_counter` from horse_settings (=year for the
    NEXT race we're about to run). Increments at the conclusion of each race.
    """
    try:
        resp = (
            supabase.table('horse_settings')
            .select('setting_value')
            .eq('setting_key', 'year_counter')
            .limit(1)
            .execute()
        )
        if resp.data:
            return int(float(resp.data[0]['setting_value']))
    except Exception:
        pass
    return default


@racing_bp.route('/horses', methods=['GET'])
def list_horses():
    """Full catalogue of horses with their simulator params + display info,
    decorated with each horse's career stats (participations / wins / places /
    shows / best finish time). Used by the catalogue tab on the home page.
    """
    try:
        resp = supabase.table('horses').select('*').order('horse_id').execute()
        horses = resp.data or []
        if horses:
            horse_ids = [int(h['horse_id']) for h in horses]
            current_year = _get_year_counter()
            stats = _fetch_per_horse_history(horse_ids, current_year=current_year)

            # Fetch ALL results in ONE round-trip, group by horse for the
            # `all_results` array used by the fancy per-horse catalogue card.
            try:
                all_resp = (
                    supabase.table('horse_results')
                    .select('horse_id, year, finish_position, finish_seconds')
                    .in_('horse_id', horse_ids)
                    .order('year', desc=True)
                    .execute()
                )
                all_rows = all_resp.data or []
            except Exception:
                all_rows = []
            all_by_horse: Dict[int, List[Dict]] = {hid: [] for hid in horse_ids}
            for r in all_rows:
                hid = int(r['horse_id'])
                all_by_horse.setdefault(hid, []).append({
                    'year':            int(r['year']),
                    'finish_position': int(r['finish_position']),
                    'finish_seconds':  round(float(r['finish_seconds']), 2),
                })

            empty = {
                'participations': 0, 'wins': 0, 'places': 0, 'shows': 0,
                'best_seconds': None, 'last_3_seconds': [], 'last_3_positions': [],
                'last_3_years': [], 'last_3_results': [],
                'last_5_results': [], 'all_results': [],
                'worst_seconds': None, 'best_year': None, 'worst_year': None,
            }
            for h in horses:
                hid = int(h['horse_id'])
                s = stats.get(hid)
                full_results = all_by_horse.get(hid, [])
                if s:
                    # Pair the parallel last_3 arrays into objects so the
                    # frontend can render them directly as table rows
                    # (year / position / seconds), most-recent first.
                    years = s.get('last_3_years') or []
                    poses = s.get('last_3_positions') or []
                    secs  = s.get('last_3_seconds') or []
                    last_3_results = []
                    for i in range(min(len(years), len(poses), len(secs))):
                        last_3_results.append({
                            'year':            int(years[i]),
                            'finish_position': int(poses[i]),
                            'finish_seconds':  float(secs[i]),
                        })
                    s = dict(s)
                    s['last_3_results']  = last_3_results
                    # Extra fields for the fancy single-horse catalogue card.
                    s['last_5_results']  = full_results[:5]
                    s['all_results']     = full_results
                    if full_results:
                        # full_results is sorted year-desc; min/max by seconds.
                        best  = min(full_results, key=lambda r: r['finish_seconds'])
                        worst = max(full_results, key=lambda r: r['finish_seconds'])
                        s['best_seconds']  = best['finish_seconds']
                        s['best_year']     = best['year']
                        s['worst_seconds'] = worst['finish_seconds']
                        s['worst_year']    = worst['year']
                    else:
                        s.setdefault('worst_seconds', None)
                        s.setdefault('best_year',     None)
                        s.setdefault('worst_year',    None)
                    h['stats'] = s
                else:
                    h['stats'] = dict(empty)
        return jsonify({'success': True, 'horses': horses}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@racing_bp.route('/setup-race', methods=['POST'])
def setup_race():
    """Pick N horses at random from the catalogue and assign post positions 1..N."""
    try:
        data = request.json or {}
        num_horses = int(data.get('num_horses', 5))
        if num_horses not in (5, 7):
            return jsonify({'success': False, 'error': 'num_horses must be 5 or 7'}), 400

        resp = supabase.table('horses').select('*').execute()
        all_horses = resp.data or []
        if len(all_horses) < num_horses:
            return jsonify({
                'success': False,
                'error': f'Need {num_horses} horses in catalogue, have {len(all_horses)}'
            }), 400

        chosen = random.sample(all_horses, num_horses)
        random.shuffle(chosen)
        field: List[Dict] = []
        for i, h in enumerate(chosen):
            field.append({**h, 'post_position': i + 1})
        return jsonify({'success': True, 'field': field}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@racing_bp.route('/odds', methods=['POST'])
def race_odds():
    """Run the AR(1) Monte Carlo simulator on the field, return all market odds."""
    try:
        data = request.json or {}
        field = data.get('field') or []
        if not field:
            return jsonify({'success': False, 'error': 'field is required'}), 400
        distance = _get_race_distance()
        dilation = _get_playback_dilation()
        # Auto-scale n_sims with distance so wall-clock stays roughly constant
        # across race lengths. Standard error of a probability estimate is
        # ~1/sqrt(n_sims), so 12.5k sims is still well under 1 % — visually
        # indistinguishable odds. Floor at 8 k for very long races.
        if data.get('n_sims') is not None:
            n_sims = int(data['n_sims'])               # explicit override (testing / pricing-quality bumps)
        else:
            n_sims = max(8000, int(25000 * 1500.0 / max(distance, 1.0)))
        odds = simulate_race_field(field, n_sims=n_sims, distance=distance, dilation=dilation)
        odds['n_sims'] = n_sims                          # surface to frontend for the loading text
        odds['year_counter'] = _get_year_counter()       # year of THIS race (for headers + commentary)
        return jsonify({'success': True, 'odds': odds}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@racing_bp.route('/run-race', methods=['POST'])
def run_race():
    """Run ONE seeded race and return per-horse position trajectories.

    The frontend feeds these into a requestAnimationFrame loop to drive the
    live race animation, then settles bets locally against `finish_order`.
    A fresh random seed is drawn each call so the displayed result is a real
    sample from the prior, not a deterministic re-run of pricing.
    """
    try:
        data = request.json or {}
        field = data.get('field') or []
        if not field:
            return jsonify({'success': False, 'error': 'field is required'}), 400
        seed = data.get('seed')                  # optional, for reproducibility / testing
        if seed is not None:
            seed = int(seed)
        else:
            seed = int(random.SystemRandom().randint(0, 2**31 - 1))
        distance = _get_race_distance()
        dilation = _get_playback_dilation()
        race = run_single_race(field, distance=distance, dilation=dilation, seed=seed)
        race['seed'] = seed
        race['year_counter'] = _get_year_counter()       # so the race + settlement views can show it
        return jsonify({'success': True, 'race': race}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@racing_bp.route('/finish-race', methods=['POST'])
def finish_race():
    """Persist the official result of a race + bump year_counter.

    Frontend calls this exactly once when a race plays out (between race-end
    modal popping and the user reaching the settlement view). Idempotency is
    handled by the unique (year, horse_id) constraint on horse_results — a
    duplicate submission for the same year is silently absorbed.

    Body
    ----
    {
      "field_size":   int,                        # 5 or 7
      "distance":     int,                        # snapshot of race_distance
      "finishes":     [
        {"horse_id": int, "finish_position": int, "finish_seconds": float},
        ...                                        # one per horse, all positions 1..N
      ]
    }

    Response
    --------
    { "success": true, "year": <year_just_recorded>, "next_year": <bumped> }
    """
    try:
        data = request.json or {}
        finishes = data.get('finishes') or []
        if not finishes:
            return jsonify({'success': False, 'error': 'finishes is required'}), 400

        year = _get_year_counter()
        field_size = int(data.get('field_size') or len(finishes))
        distance = int(data.get('distance') or _get_race_distance())

        # Build the rows. We deliberately don't bulk-upsert in a single call so
        # that one bad row (constraint violation) doesn't drop the rest.
        rows = []
        for f in finishes:
            rows.append({
                'year': year,
                'horse_id': int(f['horse_id']),
                'finish_position': int(f['finish_position']),
                'finish_seconds': round(float(f['finish_seconds']), 3),
                'field_size': field_size,
                'distance': distance,
            })

        # Insert with explicit ignore-on-conflict so re-submitting a race
        # (e.g. user clicks settle, navigates back, hits it again) is a no-op.
        try:
            supabase.table('horse_results').insert(rows).execute()
        except Exception as insert_err:
            # If the only error is the unique-key conflict, treat as success
            # (race for this year was already recorded).
            msg = str(insert_err).lower()
            if 'duplicate' not in msg and '23505' not in msg and 'unique' not in msg:
                raise

        # Bump year_counter to mark the race as concluded.
        next_year = year + 1
        supabase.table('horse_settings') \
            .update({'setting_value': next_year}) \
            .eq('setting_key', 'year_counter') \
            .execute()

        return jsonify({
            'success': True,
            'year': year,
            'next_year': next_year,
        }), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ─── DB stats helpers (used by /commentary + /stats) ──────────────────────

def _fetch_last_race_results(before_year: int) -> List[Dict]:
    """Top finishers from the most recent year STRICTLY BEFORE `before_year`.

    Returns up to 5 rows ordered by finish_position. Used by commentary to
    reference "last year's winner" and by the stats menu.
    """
    try:
        most_recent = (
            supabase.table('horse_results')
            .select('year')
            .lt('year', before_year)
            .order('year', desc=True)
            .limit(1)
            .execute()
        )
        if not most_recent.data:
            return []
        last_year = int(most_recent.data[0]['year'])
        rows = (
            supabase.table('horse_results')
            .select('year, horse_id, finish_position, finish_seconds, field_size, distance')
            .eq('year', last_year)
            .order('finish_position')
            .limit(8)
            .execute()
        )
        return rows.data or []
    except Exception:
        return []


def _fetch_per_horse_history(horse_ids: List[int], current_year: Optional[int] = None) -> Dict[int, Dict]:
    """For each horse_id, return aggregated stats: participations, wins,
    places (top 2), shows (top 3), best finish_seconds, last-3 races,
    AND the most-recent year a horse hit each podium tier (last_win_year,
    last_place_year, last_show_year) plus how many years ago that was.

    The "years since last win/place/show" stats let the announcer say
    things like "her last win was 8 years ago" or "last show was the
    1714 edition — five years now without sniffing the trifecta".
    """
    if not horse_ids:
        return {}
    try:
        rows = (
            supabase.table('horse_results')
            .select('horse_id, year, finish_position, finish_seconds')
            .in_('horse_id', list(horse_ids))
            .execute()
        )
    except Exception:
        return {}
    base = {
        'participations':       0,
        'wins':                 0,
        'places':               0,
        'shows':                0,
        'best_seconds':         None,
        # Filled below after we sort by year desc.
        'last_3_seconds':       [],
        'last_3_positions':     [],
        'last_3_years':         [],
        # Most recent year each podium tier was hit, with seconds_ago / years_ago.
        'last_win_year':        None,
        'last_win_seconds':     None,
        'last_win_years_ago':   None,
        'last_place_year':      None,
        'last_place_position':  None,
        'last_place_years_ago': None,
        'last_show_year':       None,
        'last_show_position':   None,
        'last_show_years_ago':  None,
    }
    out: Dict[int, Dict] = {hid: dict(base) for hid in horse_ids}
    by_horse: Dict[int, List[Dict]] = {hid: [] for hid in horse_ids}
    for r in rows.data or []:
        hid = int(r['horse_id'])
        s = out.setdefault(hid, dict(base))
        s['participations'] += 1
        pos = int(r['finish_position'])
        if pos == 1: s['wins']   += 1
        if pos <= 2: s['places'] += 1
        if pos <= 3: s['shows']  += 1
        sec = float(r['finish_seconds'])
        if s['best_seconds'] is None or sec < s['best_seconds']:
            s['best_seconds'] = round(sec, 2)
        by_horse.setdefault(hid, []).append(r)

    for hid, recs in by_horse.items():
        recs.sort(key=lambda r: int(r.get('year') or 0), reverse=True)
        last_3 = recs[:3]
        out[hid]['last_3_seconds']   = [round(float(r['finish_seconds']), 2) for r in last_3]
        out[hid]['last_3_positions'] = [int(r['finish_position'])           for r in last_3]
        out[hid]['last_3_years']     = [int(r['year'])                      for r in last_3]

        # Walk recs (already year-desc) to find the most recent at each tier.
        for r in recs:
            pos = int(r['finish_position'])
            yr  = int(r['year'])
            sec = round(float(r['finish_seconds']), 2)
            if pos == 1 and out[hid]['last_win_year'] is None:
                out[hid]['last_win_year']    = yr
                out[hid]['last_win_seconds'] = sec
            if pos <= 2 and out[hid]['last_place_year'] is None:
                out[hid]['last_place_year']     = yr
                out[hid]['last_place_position'] = pos
            if pos <= 3 and out[hid]['last_show_year'] is None:
                out[hid]['last_show_year']     = yr
                out[hid]['last_show_position'] = pos

        if current_year is not None:
            for k_year, k_ago in (
                ('last_win_year',   'last_win_years_ago'),
                ('last_place_year', 'last_place_years_ago'),
                ('last_show_year',  'last_show_years_ago'),
            ):
                yv = out[hid][k_year]
                if yv is not None:
                    out[hid][k_ago] = max(0, int(current_year) - int(yv))
    return out


def _fetch_full_catalogue() -> List[Dict]:
    """All horses in the catalogue — used by commentary so the announcer can
    riff on horses NOT drafted into today's field.
    """
    try:
        rows = (
            supabase.table('horses')
            .select('horse_id, full_name, saddle_name, description, country, mean_speed, speed_volatility, pace_stickiness')
            .execute()
        )
        return rows.data or []
    except Exception:
        return []


def _fetch_countries_seeking_first_win() -> List[str]:
    """ISO codes that have at least one horse in the catalogue but have
    NEVER won a recorded race (no finish_position=1 in horse_results for
    any of their horses).
    """
    try:
        catalogue = (
            supabase.table('horses')
            .select('horse_id, country')
            .execute()
        )
        country_by_horse = {
            int(h['horse_id']): h['country']
            for h in (catalogue.data or [])
            if h.get('country')
        }
        all_countries = set(country_by_horse.values())

        # Countries that HAVE won.
        winners = (
            supabase.table('horse_results')
            .select('horse_id')
            .eq('finish_position', 1)
            .execute()
        )
        winner_horse_ids = {int(r['horse_id']) for r in (winners.data or [])}
        winner_countries = {country_by_horse[h] for h in winner_horse_ids if h in country_by_horse}

        return sorted(list(all_countries - winner_countries))
    except Exception:
        return []


def _fetch_last_n_year_winners(n: int, before_year: int) -> List[Dict]:
    """Winners of the most-recent N distinct years strictly before
    `before_year`, ordered most-recent-first.

    Returns rows with year, finish_seconds, distance, field_size, and
    the winner's full_name + saddle_name. Used by commentary so the
    announcer can drop "the winner of three years ago" type lines.
    """
    if n <= 0:
        return []
    try:
        winner_rows = (
            supabase.table('horse_results')
            .select('year, horse_id, finish_seconds, distance, field_size')
            .eq('finish_position', 1)
            .lt('year', int(before_year))
            .order('year', desc=True)
            .limit(int(n))
            .execute()
        )
        rows = winner_rows.data or []
        if not rows:
            return []
        winner_ids = list({int(r['horse_id']) for r in rows})
        names_resp = (
            supabase.table('horses')
            .select('horse_id, full_name, saddle_name, country')
            .in_('horse_id', winner_ids)
            .execute()
        )
        meta = {int(h['horse_id']): h for h in (names_resp.data or [])}
        out: List[Dict] = []
        for r in rows:
            hid = int(r['horse_id'])
            m = meta.get(hid) or {}
            out.append({
                'year':            int(r['year']),
                'horse_id':        hid,
                'horse_full_name': m.get('full_name'),
                'horse_saddle':    m.get('saddle_name'),
                'horse_country':   m.get('country'),
                'finish_seconds':  round(float(r['finish_seconds']), 2),
                'distance':        int(r.get('distance') or 0),
                'field_size':      int(r.get('field_size') or 0),
            })
        return out
    except Exception:
        return []


def _fetch_spotlight_horse(before_year: int) -> Optional[Dict]:
    """Pick a random horse from the catalogue and surface their FIRST-EVER
    recorded race + the winner of that race.

    The commentary service uses this for the "deep-history-first" intro
    style — the announcer paints the spotlight horse's debut, who beat
    them, and how their career has progressed since (best time, total
    wins, current race count).

    Returns None if there's no recorded race history yet (fresh DB).
    """
    try:
        cat_resp = (
            supabase.table('horses')
            .select('horse_id, full_name, saddle_name, country, description')
            .execute()
        )
        catalogue = cat_resp.data or []
        if not catalogue:
            return None

        # We try up to 8 random picks before giving up — handles the case
        # where the random pick is a horse with no recorded race yet.
        random.shuffle(catalogue)
        for cand in catalogue[:8]:
            hid = int(cand['horse_id'])
            history_rows = (
                supabase.table('horse_results')
                .select('year, finish_position, finish_seconds, distance, field_size')
                .eq('horse_id', hid)
                .lt('year', int(before_year))
                .order('year')
                .execute()
            )
            history = history_rows.data or []
            if not history:
                continue

            # Use the EARLIEST recorded race as the debut.
            debut = history[0]
            debut_year = int(debut['year'])

            # Who won that year's race? (At their distance.)
            try:
                winner_resp = (
                    supabase.table('horse_results')
                    .select('horse_id, finish_seconds')
                    .eq('year', debut_year)
                    .eq('finish_position', 1)
                    .limit(1)
                    .execute()
                )
                w_row = (winner_resp.data or [None])[0]
            except Exception:
                w_row = None
            winner_meta: Dict = {}
            if w_row:
                wid = int(w_row['horse_id'])
                wm_resp = (
                    supabase.table('horses')
                    .select('full_name, saddle_name')
                    .eq('horse_id', wid)
                    .limit(1)
                    .execute()
                )
                if wm_resp.data:
                    winner_meta = {
                        'horse_id':        wid,
                        'horse_full_name': wm_resp.data[0].get('full_name'),
                        'horse_saddle':    wm_resp.data[0].get('saddle_name'),
                        'finish_seconds':  round(float(w_row['finish_seconds']), 2),
                    }

            # Career-since stats (within history).
            participations = len(history)
            wins   = sum(1 for r in history if int(r['finish_position']) == 1)
            places = sum(1 for r in history if int(r['finish_position']) <= 2)
            shows  = sum(1 for r in history if int(r['finish_position']) <= 3)
            best   = min((float(r['finish_seconds']) for r in history), default=None)
            return {
                'horse_id':        hid,
                'full_name':       cand.get('full_name'),
                'saddle_name':     cand.get('saddle_name'),
                'country':         cand.get('country'),
                'description':     (cand.get('description') or '')[:240],
                'debut': {
                    'year':            debut_year,
                    'finish_position': int(debut['finish_position']),
                    'finish_seconds':  round(float(debut['finish_seconds']), 2),
                    'distance':        int(debut.get('distance') or 0),
                    'field_size':      int(debut.get('field_size') or 0),
                },
                'debut_year_winner': winner_meta or None,
                'career_since': {
                    'participations': participations,
                    'wins':           wins,
                    'places':         places,
                    'shows':          shows,
                    'best_seconds':   round(best, 2) if best is not None else None,
                },
            }
        return None
    except Exception:
        return None


def _fetch_field_records_held(field_horse_ids: List[int]) -> List[Dict]:
    """Return record-book entries for any horse in `field_horse_ids` that
    HOLDS (or co-holds) one of the major leaderboard records:

        • most_participations
        • most_wins
        • most_places          (finishes in the top-2)
        • most_shows           (finishes in the top-3)
        • fastest_finish       (lowest finish_seconds ever across all races)

    Empty list if no record intersects this field — the commentary system
    is told to mention records ONLY when this list is non-empty, so the
    announcer never invents or stretches a record claim.

    Each entry shape:
        {
          'record_type':     'most_wins' | 'most_participations' | ...
          'horse_id':        int,
          'horse_full_name': str,
          'horse_saddle':    str | None,
          'value':           int | float,    # the record value (count or seconds)
          'value_label':     'wins' | 'participations' | 'places' | 'shows' | 'seconds',
          'is_co_holder':    bool,           # True if multiple horses share this
          'co_holder_count': int,            # how many horses hold the record total
        }
    """
    if not field_horse_ids:
        return []
    field_set = {int(h) for h in field_horse_ids}

    try:
        rows_resp = (
            supabase.table('horse_results')
            .select('horse_id, finish_position, finish_seconds')
            .execute()
        )
    except Exception:
        return []
    rows = rows_resp.data or []
    if not rows:
        return []

    # Per-horse aggregates over the FULL DB, not just today's field — we
    # need the global leaderboard to identify true record-holders.
    from collections import defaultdict
    agg: Dict[int, Dict[str, float]] = defaultdict(lambda: {
        'participations': 0, 'wins': 0, 'places': 0, 'shows': 0,
        'best_seconds': float('inf'),
    })
    for r in rows:
        hid = int(r['horse_id'])
        pos = int(r['finish_position'])
        a = agg[hid]
        a['participations'] += 1
        if pos == 1: a['wins']   += 1
        if pos <= 2: a['places'] += 1
        if pos <= 3: a['shows']  += 1
        sec = float(r['finish_seconds'])
        if sec < a['best_seconds']:
            a['best_seconds'] = sec

    if not agg:
        return []

    def _leaders(field_name: str, *, lower_is_better: bool = False):
        """Return (best_value, list_of_horse_ids_holding_it). Skips zero
        values for count fields so a 0-win horse isn't reported as a
        record-holder when no horse has ever won."""
        entries = [(hid, a[field_name]) for hid, a in agg.items()
                   if a[field_name] not in (float('inf'), float('-inf'))]
        if not entries:
            return None, []
        if lower_is_better:
            best = min(e[1] for e in entries)
        else:
            best = max(e[1] for e in entries)
        # For count fields, ignore best == 0 (no record to speak of).
        if not lower_is_better and best <= 0:
            return None, []
        holders = [hid for hid, v in entries if v == best]
        return best, holders

    record_specs = [
        # (record_type,           agg_field,         value_label,        lower_is_better)
        ('most_participations',   'participations',  'participations',   False),
        ('most_wins',             'wins',            'wins',             False),
        ('most_places',           'places',          'places',           False),
        ('most_shows',            'shows',           'shows',            False),
        ('fastest_finish',        'best_seconds',    'seconds',          True),
    ]

    out: List[Dict] = []
    holder_ids_to_lookup: List[int] = []
    pending: List[tuple] = []
    for record_type, agg_field, value_label, low_is_best in record_specs:
        best, holders = _leaders(agg_field, lower_is_better=low_is_best)
        if best is None or not holders:
            continue
        intersect = [h for h in holders if h in field_set]
        if not intersect:
            continue
        for hid in intersect:
            pending.append({
                'record_type':     record_type,
                'horse_id':        int(hid),
                'value':           round(best, 2) if low_is_best else int(best),
                'value_label':     value_label,
                'is_co_holder':    len(holders) > 1,
                'co_holder_count': len(holders),
            })
            holder_ids_to_lookup.append(int(hid))

    if not pending:
        return []

    # Decorate with horse names in one round-trip.
    try:
        names_resp = (
            supabase.table('horses')
            .select('horse_id, full_name, saddle_name')
            .in_('horse_id', list(set(holder_ids_to_lookup)))
            .execute()
        )
        meta = {int(h['horse_id']): h for h in (names_resp.data or [])}
    except Exception:
        meta = {}

    for entry in pending:
        m = meta.get(entry['horse_id']) or {}
        entry['horse_full_name'] = m.get('full_name')
        entry['horse_saddle']    = m.get('saddle_name')
        out.append(entry)
    return out


def _fetch_record_at_distance(distance: int, before_year: int) -> Optional[Dict]:
    """Best (lowest) finish_seconds at this distance across all prior races.
    Returns dict with horse_id, year, finish_seconds — or None if no data.
    """
    try:
        rows = (
            supabase.table('horse_results')
            .select('horse_id, year, finish_seconds')
            .eq('distance', int(distance))
            .lt('year', before_year)
            .order('finish_seconds')
            .limit(1)
            .execute()
        )
        if not rows.data:
            return None
        row = rows.data[0]
        # Decorate with horse name.
        h = (
            supabase.table('horses')
            .select('full_name, saddle_name')
            .eq('horse_id', int(row['horse_id']))
            .limit(1)
            .execute()
        )
        name = h.data[0]['full_name'] if h.data else None
        saddle = h.data[0]['saddle_name'] if h.data else None
        return {
            'horse_id':       int(row['horse_id']),
            'year':           int(row['year']),
            'finish_seconds': float(row['finish_seconds']),
            'horse_full_name': name,
            'horse_saddle':    saddle,
        }
    except Exception:
        return None


# ─── Commentary endpoint ──────────────────────────────────────────────────

@racing_bp.route('/commentary', methods=['POST'])
def commentary():
    """Generate AI race commentary — pre-race patter or post-race call.

    Body
    ----
    {
      "phase": "pre" | "post",
      "field": [...],                 # required for both phases
      "odds":  { ... },               # /odds response (required for pre)
      "trajectory": { ... },          # /run-race response (required for post)
      "year_counter": int,            # optional override; falls back to DB
      "distance":     int             # optional override; falls back to DB
    }

    Response
    --------
    {
      "success": true,
      "phase": "pre" | "post",
      "text":  "...",                 # the spoken copy (display optional)
      "audio_b64": "...",             # base64 mp3
      "audio_mime": "audio/mpeg",
      ...
    }
    """
    try:
        data = request.json or {}
        phase = (data.get('phase') or '').lower()
        print(f'[commentary] === /commentary called  phase={phase}  is_continuation={bool(data.get("is_continuation"))}')
        if phase not in ('pre', 'post', 'fan'):
            return jsonify({'success': False, 'error': 'phase must be "pre" | "post" | "fan"'}), 400

        field = data.get('field') or []
        if not field:
            return jsonify({'success': False, 'error': 'field is required'}), 400

        year     = int(data.get('year_counter') or _get_year_counter())
        distance = int(data.get('distance')     or _get_race_distance())
        print(f'[commentary]   field_size={len(field)}  year={year}  distance={distance}')

        # Common DB context — pulled once and shared.
        horse_ids = [int(h['horse_id']) for h in field]
        per_horse_history = _fetch_per_horse_history(horse_ids, current_year=year)
        last_race_results = _fetch_last_race_results(before_year=year)

        if phase == 'pre':
            odds = data.get('odds') or {}
            full_catalogue = _fetch_full_catalogue()
            countries_seeking = _fetch_countries_seeking_first_win()
            last_n_winners = _fetch_last_n_year_winners(n=3, before_year=year)
            spotlight = _fetch_spotlight_horse(before_year=year)
            field_records = _fetch_field_records_held(horse_ids)
            is_continuation = bool(data.get('is_continuation'))
            ctx = build_pre_race_context(
                field=field,
                odds=odds,
                year=year,
                distance=distance,
                last_race_results=last_race_results,
                per_horse_history=per_horse_history,
                full_catalogue=full_catalogue,
                countries_seeking_first_win=countries_seeking,
                last_n_year_winners=last_n_winners,
                spotlight_horse=spotlight,
                field_records=field_records,
                is_continuation=is_continuation,
            )
        elif phase == 'fan':
            odds = data.get('odds') or {}
            # Optional accent override from frontend (testing); otherwise the
            # context builder rolls 33/33/33.
            accent = (data.get('accent') or None)
            ctx = build_fan_context(
                field=field,
                odds=odds,
                year=year,
                distance=distance,
                per_horse_history=per_horse_history,
                accent=accent,
            )
        else:
            traj = data.get('trajectory') or {}
            pre_odds = data.get('odds') or {}
            record_at_distance = _fetch_record_at_distance(distance, before_year=year)
            ctx = build_post_race_context(
                field=field,
                trajectory=traj,
                pre_race_odds=pre_odds,
                year=year,
                distance=distance,
                last_race_results=last_race_results,
                per_horse_history=per_horse_history,
                record_at_distance=record_at_distance,
            )

        import time as _time
        t0 = _time.time()
        result = generate_commentary(phase=phase, context=ctx)
        dt = _time.time() - t0
        from base64 import b64decode as _b64d
        audio_kb = len(_b64d(result.get('audio_b64', ''))) // 1024
        print(f'[commentary]   OK  text_chars={len(result.get("text", ""))}  audio_kb={audio_kb}  total={dt:.1f}s')
        return jsonify({'success': True, **result}), 200
    except Exception as e:
        # Loud log so commentary failures don't go silent — pre-race + post-race
        # share this handler, and a busted TTS request was making both vanish
        # without explanation.
        import traceback
        print(f'[commentary] {phase} FAILED: {type(e).__name__}: {e}')
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e), 'phase': phase}), 500


# ─── Bookie multi-user betting endpoints ──────────────────────────────────
#
# Conventions copied from the rest of the API surface (see api/routes.py):
#   • The `users` table column is `screenname` (one word), NOT screen_name.
#   • Use the admin client (_get_admin_client) for cross-user reads — the
#     anon/RLS-scoped client returns 0 rows for any user_id ≠ caller's.
#   • Role check via the canonical `_is_bookie(user_id)` helper.

def _bookie_user_id_from_request(req) -> Optional[str]:
    """Validate the Authorization header AND require role='BOOKIE' on the
    `users` row for the bearer subject. Returns the bookie's user_id
    (UUID string) on success, or None if missing/insufficient privileges.
    """
    try:
        from api.routes import _get_user_from_header, _is_bookie  # type: ignore
    except Exception:
        return None
    uid = _get_user_from_header(req)
    if not uid:
        return None
    if not _is_bookie(uid):
        return None
    return str(uid)


@racing_bp.route('/bettors', methods=['GET', 'OPTIONS'])
def list_bettors():
    """List candidate bettors a BOOKIE can place bets on behalf of.

    Returns every user in the `users` table EXCEPT the calling bookie
    themself. Available only to authenticated users with role='BOOKIE'.
    Uses the admin client because the `users` table is RLS-restricted —
    the anon client only returns the caller's own row.
    """
    if request.method == 'OPTIONS':
        return ('', 200)

    print('[bettors] === /bettors called ===')
    bookie_uid = _bookie_user_id_from_request(request)
    print(f'[bettors] bookie_uid resolved: {bookie_uid!r}')
    if not bookie_uid:
        return jsonify({'success': False, 'error': 'forbidden — bookie role required'}), 403

    try:
        from api.routes import _get_admin_client  # type: ignore
    except Exception as imp_e:
        print(f'[bettors] admin client import FAILED: {imp_e!r}')
        traceback.print_exc()
        return jsonify({'success': False, 'error': f'admin import failed: {imp_e}'}), 500

    client = _get_admin_client()
    if client is None:
        print('[bettors] admin client is None — SUPABASE_SERVICE_ROLE_KEY likely missing')
        return jsonify({'success': False, 'error': 'supabase admin client unavailable (check SUPABASE_SERVICE_ROLE_KEY env var)'}), 500

    try:
        # Mirrors the canonical /api/profile/users query. No spaces in
        # select string, * gets everything, then we project on the way out.
        resp = client.table('users').select('*').order('screenname').execute()
        rows = resp.data or []
        print(f'[bettors] users table returned {len(rows)} rows')

        bettors: List[Dict] = []
        for r in rows:
            uid = str(r.get('user_id') or '')
            if not uid or uid == bookie_uid:
                continue
            sn = r.get('screenname')
            if not sn:
                continue
            bettors.append({
                'user_id':     uid,
                'screenname':  sn,
                'screen_name': sn,                  # back-compat alias
                'role':        r.get('role') or 'BETTOR',
                'avatar_url':  r.get('avatar_url'),
                'email':       r.get('email'),
            })
        print(f'[bettors] returning {len(bettors)} bettors after filtering')
        return jsonify({'success': True, 'bettors': bettors}), 200
    except Exception as e:
        print(f'[bettors] query FAILED: {type(e).__name__}: {e}')
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@racing_bp.route('/persist-multi-bets', methods=['POST', 'OPTIONS'])
def persist_multi_bets():
    """Bookie writes a batch of horse-racing bets on behalf of multiple
    users. Each session in the body is a {user_id, screen_name, bets[]}
    triple. Each bet becomes one row in `bets` with:
        market   = 'Horse Racing'
        layeur   = 'betgsis'
        game_id  = the year_counter at race time
        outcome  = the bet's selection text (e.g. "Symphony Elizabeth · WIN")
        bet_size = stake
        odds_american = stored as a string ("+222" / "-180")
        result/bet_pnl = pre-filled if the caller supplies (post-race
                         settlement); else null (settles later).

    Body
    ----
    {
      "year": 1722,                               # race's year_counter
      "sessions": [
        {
          "user_id":     "<uuid>",
          "screen_name": "...",                    # display only, not stored
          "bets": [
            {
              "selection":     "Symphony Elizabeth · WIN",
              "market_kind":   "win",              # for our internal logging
              "stake":         12.50,
              "odds_american": "+222",             # already-formatted string
              "decimal":       3.22,
              "won":           true,               # optional — settles immediately
              "pnl":           27.75,              # optional — same
            },
            ...
          ]
        },
        ...
      ]
    }

    Response
    --------
    { "success": true, "rows_inserted": int }
    """
    if request.method == 'OPTIONS':
        return ('', 200)

    print('[persist-multi-bets] === /persist-multi-bets called ===')
    bookie_uid = _bookie_user_id_from_request(request)
    print(f'[persist-multi-bets] bookie_uid: {bookie_uid!r}')
    if not bookie_uid:
        return jsonify({'success': False, 'error': 'forbidden — bookie role required'}), 403

    # MUST use the admin client — RLS will reject inserts where user_id
    # doesn't match the caller's auth.uid(), but bookies write rows for
    # OTHER users on purpose.
    try:
        from api.routes import _get_admin_client   # type: ignore
    except Exception as imp_e:
        print(f'[persist-multi-bets] admin client import FAILED: {imp_e!r}')
        traceback.print_exc()
        return jsonify({'success': False, 'error': f'admin import failed: {imp_e}'}), 500
    client = _get_admin_client()
    if client is None:
        print('[persist-multi-bets] admin client is None')
        return jsonify({'success': False, 'error': 'supabase admin client unavailable (check SUPABASE_SERVICE_ROLE_KEY env var)'}), 500

    payload = request.json or {}
    sessions = payload.get('sessions') or []
    year = int(payload.get('year') or _get_year_counter())
    print(f'[persist-multi-bets] year={year}  sessions_count={len(sessions) if isinstance(sessions, list) else "n/a"}')
    if not isinstance(sessions, list) or not sessions:
        return jsonify({'success': False, 'error': 'sessions must be a non-empty list'}), 400

    from datetime import datetime
    now_iso = datetime.utcnow().isoformat()

    rows: List[Dict] = []
    skipped: List[str] = []
    for sess in sessions:
        if not isinstance(sess, dict):
            continue
        sess_uid = str(sess.get('user_id') or '').strip()
        if not sess_uid:
            skipped.append('empty user_id')
            continue
        # The `bets.user_id` column is uuid — non-UUID placeholders like
        # 'guest' would 22P02 the entire batch. Skip them silently.
        if not _UUID_RE.match(sess_uid):
            skipped.append(f'not-a-uuid: {sess_uid!r}')
            continue
        bets = sess.get('bets') or []
        for b in bets:
            try:
                stake = float(b.get('stake') or 0.0)
            except Exception:
                stake = 0.0
            if stake <= 0:
                continue
            odds_str = b.get('odds_american')
            if odds_str is None:
                odds_str = ''
            else:
                odds_str = str(odds_str)
            outcome = str(b.get('selection') or b.get('outcome') or 'Horse Racing bet')
            row = {
                'user_id':       sess_uid,
                'market':        'Horse Racing',
                'point':         None,
                'outcome':       outcome,
                'bet_size':      stake,
                'odds_american': odds_str,
                'placed_at':     now_iso,
                'result':        None,
                'bet_pnl':       None,
                'game_id':       year,
                'layeur':        'betgsis',
            }
            # CRITICAL — `bets.result` has a CHECK constraint:
            #     result IN ('Win', 'Loss', 'Push')  OR  IS NULL
            # Lower-case 'win'/'lose' (which I used initially) violates
            # the constraint and 22P05s the whole insert. Capitalised
            # 'Win'/'Loss' is the canonical value.
            if 'won' in b and b['won'] is not None:
                row['result']  = 'Win' if bool(b['won']) else 'Loss'
            if 'pnl' in b and b['pnl'] is not None:
                try:
                    row['bet_pnl'] = float(b['pnl'])
                except Exception:
                    pass
            rows.append(row)

    if skipped:
        print(f'[persist-multi-bets] skipped {len(skipped)} sessions: {skipped}')
    print(f'[persist-multi-bets] preparing to insert {len(rows)} rows')

    if not rows:
        return jsonify({
            'success': True,
            'rows_inserted': 0,
            'skipped_sessions': skipped,
        }), 200

    try:
        ins = client.table('bets').insert(rows).execute()
        ins_rows = ins.data if hasattr(ins, 'data') else (ins.get('data') if isinstance(ins, dict) else None)
        n_inserted = len(ins_rows or rows)
        print(f'[persist-multi-bets] inserted {n_inserted} rows into bets')
        return jsonify({
            'success':       True,
            'rows_inserted': n_inserted,
            'skipped_sessions': skipped,
        }), 200
    except Exception as e:
        print(f'[persist-multi-bets] insert FAILED: {type(e).__name__}: {e}')
        traceback.print_exc()
        # Surface the first row so the frontend / logs can see what tripped
        # the constraint on a 500.
        sample = rows[0] if rows else None
        return jsonify({
            'success': False,
            'error': str(e),
            'sample_row': sample,
        }), 500


# ─── Stats endpoint (drives the Stats menu on the home page) ──────────────

@racing_bp.route('/stats', methods=['GET'])
def stats_summary():
    """Aggregated historical stats across every recorded race.

    Returns
    -------
    {
      "current_year": int,             # year_counter (= year of NEXT race)
      "total_races":  int,             # count of distinct years recorded
      "leaderboards": {
        "most_wins":          [{horse_id, full_name, saddle_name, country, value}, ...],
        "most_places":        [...],
        "most_shows":         [...],
        "most_participations":[...],
        "best_time_per_distance": [{distance, finish_seconds, horse_id, full_name, year}, ...],
      },
      "per_year": [
        {"year": 1707, "distance": 1500, "field_size": 5, "results":
            [{horse_id, full_name, saddle_name, finish_position, finish_seconds}, ...]
        },
        ...                            # ordered most-recent-first
      ]
    }
    """
    try:
        current_year = _get_year_counter()

        # All results joined with the horses table (one query).
        rows_resp = (
            supabase.table('horse_results')
            .select('year, horse_id, finish_position, finish_seconds, field_size, distance')
            .order('year', desc=True)
            .execute()
        )
        rows = rows_resp.data or []

        # Catalogue lookup for horse names + countries.
        horses_resp = supabase.table('horses').select('horse_id, full_name, saddle_name, country').execute()
        horse_meta = {int(h['horse_id']): h for h in (horses_resp.data or [])}

        def _decorate(hid: int) -> Dict:
            m = horse_meta.get(int(hid)) or {}
            return {
                'horse_id':    int(hid),
                'full_name':   m.get('full_name', f'#{hid}'),
                'saddle_name': m.get('saddle_name'),
                'country':     m.get('country'),
            }

        # Per-horse aggregates.
        from collections import defaultdict
        agg = defaultdict(lambda: {
            'participations': 0, 'wins': 0, 'places': 0, 'shows': 0,
            'best_seconds':   None,
        })
        for r in rows:
            hid = int(r['horse_id']);  pos = int(r['finish_position'])
            a = agg[hid]
            a['participations'] += 1
            if pos == 1: a['wins']   += 1
            if pos <= 2: a['places'] += 1
            if pos <= 3: a['shows']  += 1
            sec = float(r['finish_seconds'])
            if a['best_seconds'] is None or sec < a['best_seconds']:
                a['best_seconds'] = round(sec, 2)

        def _top(field: str, n: int = 10) -> List[Dict]:
            ranked = sorted(agg.items(), key=lambda kv: kv[1].get(field, 0), reverse=True)[:n]
            return [{**_decorate(hid), 'value': stats[field]} for hid, stats in ranked if stats[field] > 0]

        # Best time per distance (record board).
        best_per_distance: Dict[int, Dict] = {}
        for r in rows:
            d = int(r['distance']); s = float(r['finish_seconds'])
            cur = best_per_distance.get(d)
            if cur is None or s < cur['finish_seconds']:
                best_per_distance[d] = {
                    'distance':       d,
                    'finish_seconds': round(s, 2),
                    'horse_id':       int(r['horse_id']),
                    'year':           int(r['year']),
                    **{k: _decorate(int(r['horse_id']))[k] for k in ('full_name', 'saddle_name', 'country')},
                }

        # Per-year aggregation.
        per_year_map: Dict[int, Dict] = {}
        for r in rows:
            y = int(r['year'])
            slot = per_year_map.setdefault(y, {
                'year':       y,
                'distance':   int(r['distance']),
                'field_size': int(r['field_size']),
                'results':    [],
            })
            slot['results'].append({
                **_decorate(int(r['horse_id'])),
                'finish_position': int(r['finish_position']),
                'finish_seconds':  round(float(r['finish_seconds']), 2),
            })
        per_year = sorted(per_year_map.values(), key=lambda d: d['year'], reverse=True)
        for yslot in per_year:
            yslot['results'].sort(key=lambda r: r['finish_position'])

        # ─── By-country aggregates ────────────────────────────────
        # Computed by mapping each result row to the horse's country.
        # Win-rate = wins / participations for the country (only when
        # participations >= 3 to avoid noisy "100 % from 1 race" cases).
        country_agg: Dict[str, Dict] = defaultdict(lambda: {
            'country': '',
            'participations': 0,
            'wins': 0,
            'places': 0,
            'shows': 0,
        })
        for r in rows:
            hid = int(r['horse_id'])
            m = horse_meta.get(hid) or {}
            iso = (m.get('country') or '').upper()
            if not iso:
                continue
            c = country_agg[iso]
            c['country']         = iso
            c['participations'] += 1
            pos = int(r['finish_position'])
            if pos == 1: c['wins']   += 1
            if pos <= 2: c['places'] += 1
            if pos <= 3: c['shows']  += 1

        country_list = list(country_agg.values())
        for c in country_list:
            p = c['participations']
            c['win_rate']   = round(c['wins']   / p, 4) if p else 0.0
            c['place_rate'] = round(c['places'] / p, 4) if p else 0.0
            c['show_rate']  = round(c['shows']  / p, 4) if p else 0.0
            c['win_rate_pct']  = int(round(100 * c['win_rate']))
            c['place_rate_pct'] = int(round(100 * c['place_rate']))
            c['show_rate_pct']  = int(round(100 * c['show_rate']))

        countries = {
            'participations_by_country': sorted(
                country_list, key=lambda c: c['participations'], reverse=True,
            ),
            'wins_by_country': [c for c in sorted(
                country_list, key=lambda c: c['wins'], reverse=True,
            ) if c['wins'] > 0],
            # Best win-rate ranking — only countries with >= 3 starts so
            # one-race fluke 100 %s don't dominate.
            'best_win_rate_by_country': sorted(
                [c for c in country_list if c['participations'] >= 3 and c['wins'] > 0],
                key=lambda c: (c['win_rate'], c['wins']),
                reverse=True,
            ),
        }

        # ─── Year time analysis ───────────────────────────────────
        # Per-year average finish time (raw, ungrouped by distance — note
        # this in the field name so the UI labels it correctly). Distance
        # is also surfaced so users can read context.
        year_times: List[Dict] = []
        for slot in per_year_map.values():
            results = slot.get('results') or []
            if not results:
                continue
            secs = [float(r['finish_seconds']) for r in results]
            year_times.append({
                'year':            int(slot['year']),
                'distance':        int(slot['distance']),
                'field_size':      int(slot['field_size']),
                'avg_seconds':     round(sum(secs) / len(secs), 2),
                'min_seconds':     round(min(secs), 2),
                'max_seconds':     round(max(secs), 2),
                'winner_seconds':  round(min(secs), 2),
            })
        year_analysis = {
            'fastest_avg_years': sorted(year_times, key=lambda y: y['avg_seconds'])[:25],
            'slowest_avg_years': sorted(year_times, key=lambda y: y['avg_seconds'], reverse=True)[:25],
        }

        return jsonify({
            'success':       True,
            'current_year':  current_year,
            'total_races':   len(per_year_map),
            'leaderboards': {
                'most_wins':          _top('wins'),
                'most_places':        _top('places'),
                'most_shows':         _top('shows'),
                'most_participations':_top('participations'),
                'best_time_per_distance': sorted(best_per_distance.values(), key=lambda d: d['distance']),
            },
            'countries':     countries,
            'year_analysis': year_analysis,
            'per_year':      per_year,
        }), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
