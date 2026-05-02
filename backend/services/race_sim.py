"""Horse Racing — vectorized Monte Carlo simulator.

Runs n_sims races over a field of n_horses using an AR(1)-on-velocity
process per horse, plus optional front-runner / closer bonuses. Returns
empirical probabilities for every racebook market, vigged for the house.

Tick conventions:
    1 tick      = 10 ms (real time)
    Race target = ~10 sec → ~1000 ticks
    Race length = 1500 abstract "lengths"
    Avg μ = 1.5 lengths/tick → covers track in ~1000 ticks

Style overlays (currently always 0 in seed data, here for completeness):
    early_pace[t] = E * exp(-t / EARLY_TAU)      # decays out of the gate
    late_kick[t]  = L * (t / N_TICKS_MAX)**2     # ramps in toward the wire
"""
from typing import Dict, List, Optional

import numpy as np


DEFAULT_RACE_DISTANCE = 1500.0
MS_PER_TICK = 10                 # 1 tick = 10 ms (real time)
DEFAULT_N_SIMS = 25000

# 60 seconds wall-clock — anyone still on track at this point is DQ'd and
# auto-assigned last place. Prevents stuck horses (high-α + bad luck → v ≈ 0)
# from extrapolating to multi-thousand-second finish times that pollute stats
# AND drag race playback past anyone's patience.
MAX_RACE_WALL_MS = 60_000

# All distance-dependent constants are derived in `_race_constants(distance)`.
# Reasoning:
#   • Avg horse μ ≈ 1.5 lengths/tick, so race_time_seconds ≈ distance / 150.
#   • Time-based prop thresholds scale linearly with distance — at 2× the
#     distance the race takes 2× as long, so a "winner by > 2s" market would
#     trigger near-never; instead it becomes "winner by > 4s".
#   • EARLY_TAU and the late_kick formula scale with distance so the early /
#     late shaping covers the SAME FRACTION of the race, not a fixed clock
#     interval. (Matters once a horse has a non-zero `early_pace`/`late_kick`.)


def _race_constants(distance: float, dilation: float = 1.0) -> Dict[str, float]:
    """All knobs derived from a configured race distance + playback dilation.

    `dilation` only affects WALL-CLOCK outputs (seconds labels). The simulator
    runs in TICK space — n_ticks_max, early_tau, and all `*_ticks` thresholds
    are independent of dilation, which means probabilities are byte-identical
    at any dilation. Only the displayed seconds-labels scale.

    Defaults:
      distance=1500, dilation=1.0 → ~10 s race, "winby > 2 sec" labels.
      distance=1500, dilation=2.0 → ~20 s race, "winby > 4 sec" labels.
                                    SAME probabilities as distance=1500/dilation=1.

    Notes
    -----
    `n_ticks_max` is sized for the slowest plausible horse (μ ≈ 1.0) plus 20 %
    headroom — anyone unfinished at that point gets extrapolated.
    """
    # Effective wall-clock per simulation tick, in seconds, after applying
    # the dilation. This is the ONLY place dilation influences the math.
    sec_per_tick = (MS_PER_TICK * dilation) / 1000.0          # 0.01 at d=1, 0.02 at d=2
    expected_ticks = distance / 1.5                            # avg horse finishes here

    # 60-second DQ cutoff in TICKS — depends on dilation (since dilation sets
    # how many ms one tick represents). Anyone still on track past this many
    # ticks is auto-DQ'd to last place. Loop runs to at least this point so
    # DQs are evaluated against the actual cutoff rather than extrapolated.
    dq_ticks = max(int(MAX_RACE_WALL_MS / (MS_PER_TICK * dilation)), int(distance * 1.2))

    # Tick thresholds — pure tick-space, dilation-independent. Probabilities
    # for the four time-margin props depend ONLY on these.
    winby_ticks  = int(round(expected_ticks * 0.20))          # 200 at d=1500 (any dilation)
    loseby_ticks = winby_ticks
    fast_ticks   = int(round(expected_ticks * 0.90))          # 900 at d=1500
    slow_ticks   = int(round(expected_ticks * 1.25))          # 1250 at d=1500

    return {
        'distance':       distance,
        'dilation':       dilation,
        'sec_per_tick':   sec_per_tick,
        'dq_ticks':       dq_ticks,
        'n_ticks_max':    max(dq_ticks, int(distance * 1.2), 1500),
        'early_tau':      distance / 7.5,                     # in TICKS, dilation-independent
        # Display-side seconds — scale with dilation. Probabilities are tick-based, unchanged.
        'winby_seconds':  winby_ticks  * sec_per_tick,
        'winby_ticks':    winby_ticks,
        'loseby_seconds': loseby_ticks * sec_per_tick,
        'loseby_ticks':   loseby_ticks,
        'fast_seconds':   fast_ticks   * sec_per_tick,
        'fast_ticks':     fast_ticks,
        'slow_seconds':   slow_ticks   * sec_per_tick,
        'slow_ticks':     slow_ticks,
    }


def _vig_for(prob: float) -> float:
    """Sliding vig — heavier the rarer the event.

    The 4 % band corresponds roughly to American odds in [-10 000, +10 000].
    Beyond that we punish longshots progressively so they aren't cosmetically
    embarrassing AND the book stays comfortable on the rare ones that hit.
    """
    if prob >= 0.01:
        return 0.04        # ≤ ±10 000 territory
    if prob >= 0.005:
        return 0.08        # ≈ +10 000 to +20 000 — bumped (was 6 %)
    if prob >= 0.001:
        return 0.12        # ≈ +20 000 to +100 000 — bumped (was 8.5 %)
    return 0.18            # very long shots — keeps +250 000 nonsense out of the slate


def _round_american_bookie_favor(american: int) -> int:
    """Round American odds to clean significant figures, always in the bookie's favor.

    Magnitude tiers:
        |odds| < 1 000        → no rounding (already 3 sig figs)
        |odds| 1 000 –  9 999 → nearest 10        (3 sig figs)
        |odds| 10 000 – 99 999 → nearest 1 000     (2 sig figs)
        |odds| 100 000 – 999 999 → nearest 10 000   (2 sig figs)
        |odds| ≥ 1 000 000     → nearest 100 000   (2 sig figs)

    Direction:
        Positive odds round DOWN (player wins less).
        Negative odds round AWAY FROM ZERO (player must risk more).
    """
    abs_o = abs(american)
    if abs_o < 1000:
        return american
    if abs_o < 10000:
        step = 10
    elif abs_o < 100000:
        step = 1000
    elif abs_o < 1000000:
        step = 10000
    else:
        step = 100000

    if american > 0:
        return (abs_o // step) * step                     # floor
    return -((abs_o + step - 1) // step) * step           # ceil-away-from-zero


_LOCK_THRESHOLD_AMERICAN = -10000   # tighter than this and we pull the market
_HARD_CAP_AMERICAN       = 100000   # never show worse than this longshot price

def _locked_quote(prob: float) -> Dict:
    """Sentinel for markets the book won't offer (event too likely for vig math
    to support, or stupidly long after the longshot vig)."""
    return {
        'probability': round(prob, 4),
        'decimal':  None,
        'american': None,
        'locked':   True,
    }


def _quote(prob: float, n_sims: int = DEFAULT_N_SIMS) -> Dict:
    """Probability → quote dict matching the frontend OddsQuote interface.

    Pricing pipeline:
      1. Apply sliding vig from `_vig_for(p)`.
      2. If the post-vig decimal would be ≤ 1.01 (i.e. event so likely the
         book has no profitable price), LOCK the market — return null odds
         with `locked: true`. The frontend hides the bet input for these.
      3. Convert to American, round to clean sig figs in the bookie's favor.
      4. Hard-cap longshots at +100 000 (no more +250 000 cosmetics).
      5. If the rounded American comes out worse than -10 000 (e.g. raw was
         -9 999 → rounded to -10 000 then crossed), still LOCK rather than
         show absurd shorts that are +EV against the rounding error.
      6. Reconcile decimal from the final American so display is consistent.
    """
    p = max(prob, 1.0 / (n_sims + 1.0))
    vig = _vig_for(p)
    raw_decimal = (1.0 - vig) / p

    # Step 2 — too-likely lock
    if raw_decimal <= 1.01:
        return _locked_quote(prob)

    # Step 3 — convert + sig-fig round
    if raw_decimal >= 2.0:
        raw_american = int(round((raw_decimal - 1.0) * 100.0))
    else:
        raw_american = int(round(-100.0 / (raw_decimal - 1.0)))
    american = _round_american_bookie_favor(raw_american)

    # Step 5 — short-side lock (after rounding may have crossed the threshold)
    if american < _LOCK_THRESHOLD_AMERICAN:
        return _locked_quote(prob)

    # Step 4 — hard longshot cap
    if american > _HARD_CAP_AMERICAN:
        american = _HARD_CAP_AMERICAN

    # Step 6 — reconcile decimal
    if american >= 100:
        decimal = (american / 100.0) + 1.0
    elif american <= -100:
        decimal = (100.0 / abs(american)) + 1.0
    else:
        decimal = raw_decimal

    return {
        'probability': round(prob, 4),
        'decimal':  round(decimal, 2),
        'american': american,
        'locked':   False,
    }


def simulate_race_field(
    field: List[Dict],
    n_sims: int = DEFAULT_N_SIMS,
    distance: float = DEFAULT_RACE_DISTANCE,
    dilation: float = 1.0,
    seed: Optional[int] = None,
) -> Dict:
    """Run n_sims Monte Carlo races over the given field, return all market odds.

    Parameters
    ----------
    field : list of horse dicts. Required keys:
        horse_id, mean_speed, speed_volatility, pace_stickiness,
        early_pace, late_kick.
    n_sims : how many parallel race sims to run (default 10,000).
    n_ticks : hard cap on simulation length per race.
    seed : optional RNG seed for reproducibility.

    Returns
    -------
    dict matching the frontend RaceOdds interface (win/place/show/duel/...).
    """
    n_horses = len(field)
    if n_horses < 2:
        raise ValueError(f'Need at least 2 horses, got {n_horses}')

    c = _race_constants(distance, dilation)
    n_ticks = c['n_ticks_max']
    early_tau = c['early_tau']
    sec_per_tick = c['sec_per_tick']        # for O/U display + line conversion

    rng = np.random.default_rng(seed)

    # Per-horse params, shape (1, n_horses) for broadcasting with (n_sims, n_horses)
    mu = np.array([float(h['mean_speed']) for h in field], dtype=np.float32)[None, :]
    sigma = np.array([float(h['speed_volatility']) for h in field], dtype=np.float32)[None, :]
    alpha = np.array([float(h['pace_stickiness']) for h in field], dtype=np.float32)[None, :]
    early = np.array([float(h.get('early_pace', 0.0)) for h in field], dtype=np.float32)[None, :]
    late = np.array([float(h.get('late_kick', 0.0)) for h in field], dtype=np.float32)[None, :]
    horse_ids = [str(h['horse_id']) for h in field]

    positions = np.zeros((n_sims, n_horses), dtype=np.float32)
    velocities = np.broadcast_to(mu, (n_sims, n_horses)).astype(np.float32).copy()
    finish_times = np.full((n_sims, n_horses), np.nan, dtype=np.float32)
    # When each horse first crosses the half-distance mark — used to compute
    # the favorite/underdog parlay probabilities ("leads at half AND wins" /
    # "last at half AND last at end"). Same sub-tick precision as finish_times.
    half_distance = distance / 2.0
    midpoint_times = np.full((n_sims, n_horses), np.nan, dtype=np.float32)

    # Earliest tick we should bother checking for early-exit. No horse can
    # finish before ~distance/max_mu ticks, so don't waste any().
    earliest_finish = int(distance / max(float(mu.max()), 0.5))
    for t in range(n_ticks):
        shocks = rng.normal(loc=0.0, scale=sigma, size=(n_sims, n_horses)).astype(np.float32)
        early_bonus = early * np.exp(-t / early_tau)
        late_bonus = late * (t / float(n_ticks)) ** 2
        velocities = alpha * velocities + (1.0 - alpha) * mu + shocks + early_bonus + late_bonus

        prev_positions = positions
        positions = positions + velocities

        # Mid-distance crossings (halfway through the race) — first to cross
        # is the leader at N/2, last to cross is the back-marker at N/2.
        not_mid = np.isnan(midpoint_times)
        crossed_mid = not_mid & (prev_positions < half_distance) & (positions >= half_distance)
        if crossed_mid.any():
            v = velocities[crossed_mid]
            v = np.where(v > 1e-6, v, 1e-6)
            mid_t = t + (half_distance - prev_positions[crossed_mid]) / v
            midpoint_times[crossed_mid] = mid_t

        not_finished = np.isnan(finish_times)
        crossed_now = not_finished & (prev_positions < distance) & (positions >= distance)
        if crossed_now.any():
            v = velocities[crossed_now]
            v = np.where(v > 1e-6, v, 1e-6)  # guard against zero/negative
            crossing_t = t + (distance - prev_positions[crossed_now]) / v
            finish_times[crossed_now] = crossing_t

        # Early exit when every horse in every sim has finished. Cheap check
        # but called on every tick adds up at long distances — throttle to
        # every 25 ticks, and skip entirely until any finish is even possible.
        if t >= earliest_finish and (t % 25 == 0) and not np.isnan(finish_times).any():
            break

    # Anyone still unfinished — extrapolate at current velocity, then HARD CAP
    # at the DQ deadline. Stuck horses (v ≈ 0 from extreme α + bad shocks)
    # would otherwise extrapolate to thousands of ticks and pollute downstream
    # stats. Capping at dq_ticks puts them at the back of the finish_order
    # while preserving their relative ordering by current position.
    unfinished_mask = np.isnan(finish_times)
    if unfinished_mask.any():
        remaining = distance - positions[unfinished_mask]
        v = velocities[unfinished_mask]
        v = np.where(v > 1e-6, v, 1e-6)
        extrapolated = float(n_ticks) + remaining / v
        finish_times[unfinished_mask] = np.minimum(extrapolated, float(c['dq_ticks']))

    # Midpoint fallback — anyone who somehow didn't cross half by the end of
    # the loop (extremely rare; would need to be unfinished too) gets half
    # of their finish time as a reasonable proxy.
    midpoint_times = np.where(np.isnan(midpoint_times), finish_times * 0.5, midpoint_times)

    # Per-sim finish order: indexes of horses sorted by finish_time ascending.
    finish_order = np.argsort(finish_times, axis=1)  # (n_sims, n_horses)

    # ─── Tally markets ────────────────────────────────────────────────

    first_idx = finish_order[:, 0]
    second_idx = finish_order[:, 1]
    last_idx = finish_order[:, -1]

    win_prob = np.bincount(first_idx, minlength=n_horses) / n_sims
    last_prob = np.bincount(last_idx, minlength=n_horses) / n_sims

    place_prob = np.zeros(n_horses, dtype=np.float64)
    show_prob = np.zeros(n_horses, dtype=np.float64)
    bottom3_prob = np.zeros(n_horses, dtype=np.float64)
    for h in range(n_horses):
        place_prob[h] = np.any(finish_order[:, :2] == h, axis=1).mean()
        show_prob[h] = np.any(finish_order[:, :3] == h, axis=1).mean()
        bottom3_prob[h] = np.any(finish_order[:, -3:] == h, axis=1).mean()

    # Pairwise: who beats whom
    duel_prob = np.zeros((n_horses, n_horses), dtype=np.float64)
    top2_exact_prob = np.zeros((n_horses, n_horses), dtype=np.float64)
    for i in range(n_horses):
        for j in range(n_horses):
            if i == j:
                continue
            duel_prob[i, j] = (finish_times[:, i] < finish_times[:, j]).mean()
            top2_exact_prob[i, j] = ((first_idx == i) & (second_idx == j)).mean()

    # ── Time-based prop markets — all thresholds scale with `distance` ──
    sorted_times = np.sort(finish_times, axis=1)
    gap_first_second = sorted_times[:, 1] - sorted_times[:, 0]
    gap_last_two = sorted_times[:, -1] - sorted_times[:, -2]
    fastest_finish = sorted_times[:, 0]
    slowest_finish = sorted_times[:, -1]
    prop_first_margin = float((gap_first_second > c['winby_ticks']).mean())
    prop_last_margin = float((gap_last_two > c['loseby_ticks']).mean())
    prop_any_under = float((fastest_finish < c['fast_ticks']).mean())
    prop_any_over = float((slowest_finish > c['slow_ticks']).mean())

    # ─── Build response (matches frontend RaceOdds shape) ─────────────

    win, place, show, finish_last, bottom_3 = {}, {}, {}, {}, {}
    for i, hid in enumerate(horse_ids):
        win[hid] = _quote(float(win_prob[i]))
        place[hid] = _quote(float(place_prob[i]))
        show[hid] = _quote(float(show_prob[i]))
        finish_last[hid] = _quote(float(last_prob[i]))
        bottom_3[hid] = _quote(float(bottom3_prob[i]))

    duel = {}
    top2_exact = {}
    for i, hi in enumerate(horse_ids):
        for j, hj in enumerate(horse_ids):
            if i == j:
                continue
            duel[f'{hi}_before_{hj}'] = _quote(float(duel_prob[i, j]))
            top2_exact[f'{hi}_{hj}'] = _quote(float(top2_exact_prob[i, j]))

    props = {
        'first_place_margin':  _quote(prop_first_margin),
        'last_place_margin':   _quote(prop_last_margin),
        'any_under_threshold': _quote(prop_any_under),
        'any_over_threshold':  _quote(prop_any_over),
    }

    prop_thresholds = {
        'winby_seconds':  c['winby_seconds'],
        'loseby_seconds': c['loseby_seconds'],
        'fast_seconds':   c['fast_seconds'],
        'slow_seconds':   c['slow_seconds'],
    }

    # ── Favorite + underdog parlays (lead-at-half AND win / last-at-half AND last) ──
    # Per-sim midpoint leader and back-marker.
    mid_leader_idx = np.argmin(midpoint_times, axis=1)        # (n_sims,)
    mid_back_idx   = np.argmax(midpoint_times, axis=1)        # (n_sims,)

    # The "favorite" is the field's most likely winner (highest win prob)
    # and the "underdog" is the field's most likely back-marker (highest
    # finish-last prob). Both are drawn from THIS field, not the catalogue.
    favorite_idx = int(np.argmax(win_prob))
    underdog_idx = int(np.argmax(last_prob))

    prob_fav_lead_half  = float((mid_leader_idx == favorite_idx).mean())
    prob_fav_parlay     = float(((mid_leader_idx == favorite_idx) & (first_idx == favorite_idx)).mean())
    prob_dog_back_half  = float((mid_back_idx == underdog_idx).mean())
    prob_dog_parlay     = float(((mid_back_idx == underdog_idx) & (last_idx == underdog_idx)).mean())

    parlays = {
        'midpoint_distance': float(half_distance),

        'favorite_id':           int(horse_ids[favorite_idx]),
        'favorite_p_lead_half':  round(prob_fav_lead_half, 4),
        'favorite_p_win':        round(float(win_prob[favorite_idx]), 4),
        'favorite_quote':        _quote(prob_fav_parlay),

        'underdog_id':           int(horse_ids[underdog_idx]),
        'underdog_p_back_half':  round(prob_dog_back_half, 4),
        'underdog_p_last':       round(float(last_prob[underdog_idx]), 4),
        'underdog_quote':        _quote(prob_dog_parlay),
    }

    # ── Over/Under finish-time market on 3 random runners ─────────────────
    # Pick 3 random horses (or all of them if the field is < 3), set the line
    # at the rounded mean of their simulated finish time, and price each side.
    # We deliberately pick fresh per /odds call so the racebook surfaces a
    # different trio every time the user sets up a race.
    n_ou = min(3, n_horses)
    rng_pick = np.random.default_rng()         # fresh entropy — independent of `seed`
    chosen_idx = rng_pick.choice(n_horses, size=n_ou, replace=False) if n_ou > 0 else []
    over_under_picks: List[Dict] = []
    # Cap finish_times for the O/U mean calc — the `unfinished_mask` extrapolation
    # divides by a 1e-6-floored velocity, so a single horse with v ≈ 0 at the
    # tick limit can balloon to 1e9 ticks and drag the mean into the tens of
    # thousands of seconds. Clamp to n_ticks (= 1.2 × distance) which is the
    # maximum *physically meaningful* finish time at this distance.
    finish_for_ou = np.clip(finish_times, 1.0, float(n_ticks))
    for idx in chosen_idx:
        col = finish_for_ou[:, int(idx)]
        # Convert ticks → seconds via the dilated yardstick. The display value
        # users see (and bet against) is in this scaled frame; the line is
        # rounded to a whole second of THIS frame, then converted back to
        # ticks for the actual probability comparison.
        finish_secs_col = col * sec_per_tick
        mean_sec = float(finish_secs_col.mean())
        line_sec = int(round(mean_sec))
        line_ticks = line_sec / sec_per_tick if sec_per_tick > 0 else 0.0
        prob_over  = float((col > line_ticks).mean())
        prob_under = float((col < line_ticks).mean())
        over_under_picks.append({
            'horse_id':     int(horse_ids[int(idx)]),
            'line_seconds': line_sec,
            'mean_seconds': round(mean_sec, 2),
            'over':         _quote(prob_over),
            'under':        _quote(prob_under),
        })

    return {
        'placeholder': False,
        'note': f'Monte Carlo n_sims={n_sims}, AR(1) on velocity, sliding vig 4–8.5 %, distance={distance}, dilation={dilation}.',
        'distance': distance,
        'dilation': dilation,
        'win': win,
        'place': place,
        'show': show,
        'duel': duel,
        'top2_exact': top2_exact,
        'finish_last': finish_last,
        'bottom_3': bottom_3,
        'props': props,
        'prop_thresholds': prop_thresholds,
        'over_under_picks': over_under_picks,
        'parlays': parlays,
    }


def run_single_race(
    field: List[Dict],
    distance: float = DEFAULT_RACE_DISTANCE,
    dilation: float = 1.0,
    seed: Optional[int] = None,
    sample_every: int = 5,
) -> Dict:
    """Run ONE seeded race and return per-horse position trajectories.

    Used by the /run-race endpoint to drive the live race animation. Same
    AR(1)-on-velocity dynamics as `simulate_race_field`, but only one
    realisation, with positions sampled every `sample_every` ticks so the
    payload is compact (≈100 samples for a 10 s race at 50 ms cadence).

    Returns
    -------
    dict shaped like:
        {
          'duration_ms':   int,                       # last horse's finish time
          'sample_dt_ms':  int,                       # time between samples
          'sample_times_ms': [int, ...],              # absolute t for each sample
          'horse_ids':     [int, ...],                # field order (==input order)
          'positions':     [[float, ...], ...],       # samples × horses, normalised 0..1
          'finishes': [
            { 'horse_id', 'finish_ms', 'finish_position' },  # finish_position 1..N
            ...
          ],
          'finish_order':  [int, ...],                # horse_ids 1st..Nth
        }
    """
    n_horses = len(field)
    if n_horses < 2:
        raise ValueError(f'Need at least 2 horses, got {n_horses}')

    c = _race_constants(distance, dilation)
    n_ticks = c['n_ticks_max']
    early_tau = c['early_tau']
    # Effective ms-per-tick after applying dilation. Probabilities are
    # tick-based (unchanged), but every ms output below uses this so the
    # frontend animates and reports times in the dilated wall-clock frame.
    ms_per_tick_eff = MS_PER_TICK * dilation

    rng = np.random.default_rng(seed)

    mu = np.array([float(h['mean_speed']) for h in field], dtype=np.float64)
    sigma = np.array([float(h['speed_volatility']) for h in field], dtype=np.float64)
    alpha = np.array([float(h['pace_stickiness']) for h in field], dtype=np.float64)
    early = np.array([float(h.get('early_pace', 0.0)) for h in field], dtype=np.float64)
    late = np.array([float(h.get('late_kick', 0.0)) for h in field], dtype=np.float64)
    horse_ids = [int(h['horse_id']) for h in field]

    positions = np.zeros(n_horses, dtype=np.float64)
    velocities = mu.copy()
    finish_ticks = np.full(n_horses, np.nan, dtype=np.float64)
    # Midpoint crossing per horse — used to settle the favorite/underdog
    # parlay bets ("led at N/2 AND won" / "last at N/2 AND last at end").
    half_distance = distance / 2.0
    midpoint_ticks = np.full(n_horses, np.nan, dtype=np.float64)

    # Pre-allocate samples. We always include t=0 and one final sample at the
    # very last tick we actually simulate, regardless of cadence.
    sampled_t: List[int] = [0]
    sampled_positions: List[np.ndarray] = [positions.copy()]

    last_t = 0
    for t in range(1, n_ticks + 1):
        shocks = rng.normal(loc=0.0, scale=sigma, size=n_horses)
        early_bonus = early * np.exp(-(t - 1) / early_tau)
        late_bonus = late * ((t - 1) / float(n_ticks)) ** 2
        velocities = alpha * velocities + (1.0 - alpha) * mu + shocks + early_bonus + late_bonus

        prev_positions = positions.copy()
        positions = positions + velocities

        # Detect finish-line crossings (sub-tick precision).
        not_finished = np.isnan(finish_ticks)
        crossed = not_finished & (prev_positions < distance) & (positions >= distance)
        if crossed.any():
            v = np.where(velocities > 1e-6, velocities, 1e-6)
            crossing = (t - 1) + (distance - prev_positions) / v
            finish_ticks = np.where(crossed, crossing, finish_ticks)

        # Midpoint crossings (parlay grading).
        not_mid = np.isnan(midpoint_ticks)
        crossed_mid = not_mid & (prev_positions < half_distance) & (positions >= half_distance)
        if crossed_mid.any():
            v = np.where(velocities > 1e-6, velocities, 1e-6)
            mid_t = (t - 1) + (half_distance - prev_positions) / v
            midpoint_ticks = np.where(crossed_mid, mid_t, midpoint_ticks)

        last_t = t
        if t % sample_every == 0:
            sampled_t.append(t)
            sampled_positions.append(positions.copy())

        if not np.isnan(finish_ticks).any():
            break

    # Anyone still unfinished — extrapolate at current velocity, then HARD CAP
    # at dq_ticks. The boolean `dq_mask` gets used below to keep DQ'd horses
    # at their actual track position in the trajectory's final sample (instead
    # of being clipped past the wire like a real finisher).
    dq_mask = np.isnan(finish_ticks)
    if dq_mask.any():
        remaining = distance - positions
        v = np.where(velocities > 1e-6, velocities, 1e-6)
        extrapolated = last_t + remaining / v
        capped = np.minimum(extrapolated, float(c['dq_ticks']))
        finish_ticks = np.where(dq_mask, capped, finish_ticks)
    # Anyone capped exactly at dq_ticks counts as DQ'd (didn't finish in time).
    dq_mask = finish_ticks >= float(c['dq_ticks']) - 1e-3

    # Midpoint fallback (rare).
    midpoint_ticks = np.where(np.isnan(midpoint_ticks), finish_ticks * 0.5, midpoint_ticks)

    # Make sure the last sample lands exactly on the slowest finisher so the
    # frontend doesn't have to extrapolate beyond the data. Cap the playback
    # length at dq_ticks so the animation never runs past the 60 s deadline.
    final_t = int(np.ceil(min(float(np.max(finish_ticks)), float(c['dq_ticks']))))
    if sampled_t[-1] != final_t:
        sampled_t.append(final_t)
        # Project every horse forward to final_t.
        delta_t = max(0, final_t - last_t)
        projected = positions + velocities * delta_t

        # Real finishers: snap to slightly past the wire so the sprite clears.
        # DQs: keep their last actual track position (capped at the line so
        # they don't appear to magically finish). The result is that DQ'd
        # horses freeze somewhere in the lane while the official finishers
        # pile up past the wire.
        finished_normally = ~dq_mask & (finish_ticks <= final_t)
        final_positions = np.where(
            finished_normally,
            distance * 1.02,
            np.minimum(projected, distance),     # DQs capped AT the wire, not past
        )
        sampled_positions.append(final_positions)

    # ── Normalise positions to [0, 1] for transport ──
    # 1.0 == finish line. Anything past it gets clipped to 1.02 so the sprite
    # visually clears the line in the animation. Frontend renders 0..1 only,
    # so increasing `distance` keeps the lane width unchanged on screen — the
    # sprite just takes longer to traverse it.
    norm_positions = [
        (p / distance).tolist() for p in sampled_positions
    ]
    sample_times_ms = [int(round(t * ms_per_tick_eff)) for t in sampled_t]

    # ── Finishing order ──
    finish_order_idx = list(np.argsort(finish_ticks))    # indexes into field
    finishes = []
    for rank, idx in enumerate(finish_order_idx):
        finishes.append({
            'horse_id': horse_ids[idx],
            'finish_ms': float(finish_ticks[idx] * ms_per_tick_eff),
            'finish_position': rank + 1,
            'dq': bool(dq_mask[idx]),
        })
    finish_order = [horse_ids[i] for i in finish_order_idx]
    duration_ms = int(round(min(float(np.max(finish_ticks)), float(c['dq_ticks'])) * ms_per_tick_eff))

    # Midpoint leader / back-marker for THIS specific run — frontend grades
    # the parlay bets against these (favorite needs to be midpoint_leader_id
    # AND finish 1st; underdog needs to be midpoint_backmarker_id AND finish
    # last).
    midpoint_leader_idx     = int(np.argmin(midpoint_ticks))
    midpoint_backmarker_idx = int(np.argmax(midpoint_ticks))

    return {
        'duration_ms': duration_ms,
        'sample_dt_ms': int(round(sample_every * ms_per_tick_eff)),
        'sample_times_ms': sample_times_ms,
        'horse_ids': horse_ids,
        'positions': norm_positions,
        'finishes': finishes,
        'finish_order': finish_order,
        'distance': distance,
        'dilation': dilation,
        'midpoint_distance': float(half_distance),
        'midpoint_leader_id': horse_ids[midpoint_leader_idx],
        'midpoint_backmarker_id': horse_ids[midpoint_backmarker_idx],
        # ms thresholds for the four time-based prop markets — frontend uses
        # these to grade `prop_first_margin`, `prop_last_margin`,
        # `prop_any_under`, `prop_any_over` after the race finishes. They
        # honour dilation so they match the wall-clock the user just watched.
        'thresholds': {
            'winby_ms':  int(round(c['winby_ticks']  * ms_per_tick_eff)),
            'loseby_ms': int(round(c['loseby_ticks'] * ms_per_tick_eff)),
            'fast_ms':   int(round(c['fast_ticks']   * ms_per_tick_eff)),
            'slow_ms':   int(round(c['slow_ticks']   * ms_per_tick_eff)),
        },
    }
