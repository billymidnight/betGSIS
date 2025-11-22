from math import isfinite
from typing import List, Dict
import math
import random
import numpy as np


# Use shared odds formatting so decimal <-> american remain consistent with book-favoring rounding
from utils.odds import decimal_to_american_rounded, format_american_odds, american_to_decimal  # type: ignore


def normal_cdf(x: float, mu: float, sigma: float) -> float:
    """Calculate the cumulative distribution function of a normal distribution."""
    if sigma <= 0:
        return 1.0 if x >= mu else 0.0
    z = (x - mu) / (sigma * math.sqrt(2))
    return 0.5 * (1 + math.erf(z))

def fit_beta_params(mean: float, var: float, L: float = 5000.0):
    """Fit Beta(a,b) on [0,L] given mean and variance on original scale.

    mean: mean on original [0,L]
    var: variance on original scale
    Returns a,b
    """
    m = mean / L
    v = var / (L ** 2)
    if v <= 0 or m <= 0 or m >= 1:
        return 2.0, 2.0
    t = m * (1 - m) / v - 1.0
    a = max(1e-3, m * t)
    b = max(1e-3, (1 - m) * t)
    return a, b


def price_moneylines(simulations: int = 5000, margin_bps: int = 800):
    """Monte Carlo price Moneyline markets (classic, first round, last round).

    Returns dict with keys 'classic','firstRound','lastRound' each a list of entries
    { player: name, prob: adjusted_prob, american: string, decimal: decimal }
    """
    from database.geo_repo import get_geo_players

    sims = int(simulations or 5000)
    players = get_geo_players() or []
    if not players:
        return {'classic': [], 'firstRound': [], 'lastRound': []}

    # build player models
    models = []
    for p in players:
        name = p.get('name') or p.get('screenname') or str(p.get('player_id'))
        mu = float(p.get('mean_score') or 0.0)
        sigma = float(p.get('stddev_score') or 0.0)
        models.append({'player_id': p.get('player_id'), 'name': name, 'mu': mu, 'sigma': sigma})

    n = len(models)
    classic_wins = {m['player_id']: 0 for m in models}
    first_wins = {m['player_id']: 0 for m in models}
    last_wins = {m['player_id']: 0 for m in models}

    # Precompute beta params per-player per-round
    per_round_params = {}
    for m in models:
        mu = m['mu']
        sigma = m['sigma']
        # per-round mean and std: follow existing first-guess convention: mu/5, sigma/sqrt(5)
        round_mu = mu / 5.0
        round_sigma = sigma / (np.sqrt(5.0) if sigma > 0 else 1.0)
        var = (round_sigma ** 2) if round_sigma is not None else 0.0
        a, b = fit_beta_params(round_mu, var, L=5000.0)
        per_round_params[m['player_id']] = {'a': a, 'b': b, 'p_easy': 0.07, 'p_cat': 0.09}

    # Monte Carlo
    for it in range(sims):
        # sample 5 rounds
        round_scores = [dict() for _ in range(5)]
        totals = {m['player_id']: 0.0 for m in models}
        for r in range(5):
            for m in models:
                pid = m['player_id']
                params = per_round_params.get(pid)
                # categorical draw
                rr = random.random()
                if rr < params['p_easy']:
                    score = random.uniform(4950, 5000)
                elif rr < params['p_easy'] + params['p_cat']:
                    score = random.uniform(0, 2000)
                else:
                    # normal beta-based sample on [0,5000]
                    try:
                        y = np.random.beta(params['a'], params['b'])
                        score = float(y * 5000.0)
                        if score > 5000.0:
                            score = random.uniform(4950, 5000)
                        score = max(0.0, min(5000.0, score))
                    except Exception:
                        score = float(random.uniform(0, 5000))
                round_scores[r][pid] = score
                totals[pid] += score

        # determine classic winners (highest total)
        max_tot = max(totals.values())
        for pid, val in totals.items():
            if abs(val - max_tot) < 1e-9:
                classic_wins[pid] += 1

        # first round winners
        first_round = round_scores[0]
        max_first = max(first_round.values())
        for pid, val in first_round.items():
            if abs(val - max_first) < 1e-9:
                first_wins[pid] += 1

        # last round winners
        last_round = round_scores[-1]
        max_last = max(last_round.values())
        for pid, val in last_round.items():
            if abs(val - max_last) < 1e-9:
                last_wins[pid] += 1

    # compute raw probs
    classic_raw = {pid: classic_wins[pid] / sims for pid in classic_wins}
    first_raw = {pid: first_wins[pid] / sims for pid in first_wins}
    last_raw = {pid: last_wins[pid] / sims for pid in last_wins}

    def apply_multi_vig(raw_probs: dict):
        total = sum(raw_probs.values())
        if total <= 0:
            return {k: 1.0 / len(raw_probs) for k in raw_probs}
        scale = (1.0 + (margin_bps / 10000.0)) / total
        return {k: float(v * scale) for k, v in raw_probs.items()}

    classic_adj = apply_multi_vig(classic_raw)
    first_adj = apply_multi_vig(first_raw)
    last_adj = apply_multi_vig(last_raw)

    def to_list(adj_probs: dict):
        out = []
        for m in models:
            pid = m['player_id']
            p = float(adj_probs.get(pid, 0.0))
            d = prob_to_decimal(p)
            a = decimal_to_american_rounded(d, prob=p)
            out.append({'player_id': pid, 'player': m['name'], 'prob': p, 'decimal': round(d, 4), 'american': a})
        # sort desc prob
        out.sort(key=lambda x: x['prob'], reverse=True)
        return out

    return {
        'classic': to_list(classic_adj),
        'firstRound': to_list(first_adj),
        'lastRound': to_list(last_adj),
    }

def prob_to_decimal(p: float, floor: float = 1.01, cap: float = None) -> float:
    """Convert probability to decimal odds.

    Behavior notes (probability-aware):
    - For underdog-side probabilities (p < 0.5) we keep the conservative
      visible floor of 1.01 to avoid decimals below that.
    - For favorite-side probabilities (p > 0.5) we do NOT force a 1.01 floor;
      instead we allow decimals to approach 1.0 naturally so favorites can
      scale to large negative American odds. If a caller provided an explicit
      floor parameter it is respected; otherwise we choose a dynamic floor:
        * p > 0.9995 -> use floor = 1.0005 (maps to approx -200000)
        * 0.5 < p <= 0.9995 -> use floor = 1.0 (no artificial bump)

    The `cap` parameter, if provided, still clamps the returned decimal.
    """
    if p is None or p <= 0:
        return float('inf')

    odds = 1.0 / p
    if not isfinite(odds):
        return float('inf')

    # determine the effective floor: if caller passed non-default floor keep it,
    # otherwise choose a floor based on the probability side
    effective_floor = floor
    # If caller left the default (1.01), compute a probability-aware floor
    if floor == 1.01:
        try:
            p_val = float(p)
        except Exception:
            p_val = None
        if p_val is None:
            effective_floor = 1.01
        else:
            if p_val > 0.5:
                # favorite side: allow natural scaling; only enforce a tiny
                # floor when extremely close to certain to map to the -200k cap
                if p_val > 0.9995:
                    effective_floor = 1.0005
                else:
                    effective_floor = 1.0
            else:
                # underdog side: keep the visible floor to avoid decimals < 1.01
                effective_floor = 1.01

    val = max(effective_floor, odds)
    if cap is not None:
        val = min(val, cap)
    return val


def decimal_to_american(d: float, prob: float = None) -> str:
    """Wrapper that delegates to utils.decimal_to_american_rounded and accepts an optional prob
    so callers can apply probability-aware guardrails without changing call sites widely.
    """
    try:
        return decimal_to_american_rounded(d, prob=prob)
    except Exception:
        # fallback
        return decimal_to_american_rounded(d)


def apply_margin(prob_over: float, prob_under: float, margin_bps: int = 400):
    """Apply margin (vigorish) by bumping true probabilities proportionally.

    For a 2-way market (over/under) where prob_over + prob_under == 1.0, this
    will multiply each probability by (1 + margin) so the implied total > 1.0
    (i.e. includes the book's vig). This follows the requested behavior of
    "bumping" probabilities instead of shrinking them.

    We cap adjusted probabilities at a sensible upper bound to avoid producing
    decimal odds below 1.0 in extreme edge cases.
    """
    # defensive defaults
    if prob_over is None or prob_under is None:
        return prob_over, prob_under

    if prob_over < 0.05 or prob_under < 0.05:
        margin_bps = margin_bps + 125
    margin = margin_bps / 10000.0
    # bump each true probability by (1 + margin)
    p_over_adj = prob_over * (1.0 + margin)
    p_under_adj = prob_under * (1.0 + margin)

    # cap to avoid p > 1 which would create decimal odds < 1
    cap = 0.9999
    p_over_adj = min(p_over_adj, cap)
    p_under_adj = min(p_under_adj, cap)

    return p_over_adj, p_under_adj


def price_for_thresholds(player_ids: List[int], thresholds: List[int], model: str = 'normal', margin_bps: int = 440) -> Dict:
    """
    Compute pricing for given player IDs and thresholds using Supabase geo_players table.
    
    Returns dict structure:
      {
        player_id: {
          threshold: {
            'prob_over': float,
            'prob_under': float,
            'odds_over_decimal': float,
            'odds_under_decimal': float,
            'odds_over_american': str,
            'odds_under_american': str,
          }
        }
      }
    """
    from database.geo_repo import get_geo_players
    margin_bps = margin_bps + 200
    
    results = {}
    all_players = get_geo_players()
    player_map = {p.get('player_id'): p for p in all_players}
    
    for pid in player_ids:
        results[pid] = {}
        player_data = player_map.get(pid)
        
        for t in thresholds:
            if not player_data or player_data.get('mean_score') is None:
                # No stats available, default to 50/50
                p_over = 0.5
            else:
                mu = float(player_data.get('mean_score', 0))
                sigma = float(player_data.get('stddev_score', 0)) or 0.0
                # P(score >= threshold) = 1 - CDF(threshold)
                cdf = normal_cdf(t, mu, sigma)
                p_over = max(0.0, 1.0 - cdf)
            
            p_under = 1.0 - p_over
            p_over_adj, p_under_adj = apply_margin(p_over, p_under, margin_bps)
            # compute raw decimal from prob, then convert -> american -> round -> recompute decimal
            d_over_raw = prob_to_decimal(p_over_adj)
            d_under_raw = prob_to_decimal(p_under_adj)

            # compute rounded american and decimal consistent with rounded american
            odds_over_american_str = decimal_to_american_rounded(d_over_raw, prob=p_over_adj)
            # parse rounded american to int and compute decimal from rounded american
            try:
                over_a_int = int(str(odds_over_american_str).replace('+', ''))
            except Exception:
                over_a_int = None
            odds_over_decimal = american_to_decimal(over_a_int) if over_a_int is not None else d_over_raw

            odds_under_american_str = decimal_to_american_rounded(d_under_raw, prob=p_under_adj)
            try:
                under_a_int = int(str(odds_under_american_str).replace('+', ''))
            except Exception:
                under_a_int = None
            odds_under_decimal = american_to_decimal(under_a_int) if under_a_int is not None else d_under_raw

            results[pid][t] = {
                'prob_over': p_over_adj,
                'prob_under': p_under_adj,
                'odds_over_decimal': odds_over_decimal,
                'odds_under_decimal': odds_under_decimal,
                'odds_over_american': odds_over_american_str,
                'odds_under_american': odds_under_american_str,
            }
    
    return results


def price_first_guess_thresholds(player_ids: List[int], thresholds: List[int] = None, model: str = 'normal', margin_bps: int = 700) -> Dict:
    """
    Price the "First Guess" market (first round points) for given players.

    The first-guess distribution is approximated by scaling the player's
    season/game mean and standard deviation to the first round sample:
      mu_fg = mean / 5
      sigma_fg = stddev / sqrt(5)

    Thresholds default to multiples of 300 from 1700 to 4700 inclusive.
    Applies a default 7% (700 bps) vig bump to probabilities.
    Returns the same dict shape as price_for_thresholds.
    """
    from database.geo_repo import get_geo_players

    if thresholds is None:
        thresholds = list(range(1700, 4701, 300))

    results = {}
    all_players = get_geo_players()
    player_map = {p.get('player_id'): p for p in all_players}

    for pid in player_ids:
        results[pid] = {}
        player_data = player_map.get(pid)

        for t in thresholds:
            if not player_data or player_data.get('mean_score') is None:
                p_over = 0.5
            else:
                mu = float(player_data.get('mean_score', 0))
                sigma = float(player_data.get('stddev_score', 0)) or 0.0
                # scale to first-round: assume 5 samples -> mean/5, sd/sqrt(5)
                mu_fg = mu / 5.0
                sigma_fg = sigma / math.sqrt(5.0) if sigma > 0 else 0.0
                # avoid degenerate zero-variance which produces step-function CDFs
                if sigma_fg <= 0.0:
                    # fallback to a small but reasonable sigma relative to the mean
                    sigma_fg = max(1.0, abs(mu_fg) * 0.05)
                cdf = normal_cdf(t, mu_fg, sigma_fg)
                p_over = max(0.0, 1.0 - cdf)

            p_under = 1.0 - p_over
            p_over_adj, p_under_adj = apply_margin(p_over, p_under, margin_bps)
            d_over_raw = prob_to_decimal(p_over_adj)
            d_under_raw = prob_to_decimal(p_under_adj)

            odds_over_american_str = decimal_to_american_rounded(d_over_raw, prob=p_over_adj)
            try:
                over_a_int = int(str(odds_over_american_str).replace('+', ''))
            except Exception:
                over_a_int = None
            odds_over_decimal = american_to_decimal(over_a_int) if over_a_int is not None else d_over_raw

            odds_under_american_str = decimal_to_american_rounded(d_under_raw, prob=p_under_adj)
            try:
                under_a_int = int(str(odds_under_american_str).replace('+', ''))
            except Exception:
                under_a_int = None
            odds_under_decimal = american_to_decimal(under_a_int) if under_a_int is not None else d_under_raw

            results[pid][t] = {
                'prob_over': p_over_adj,
                'prob_under': p_under_adj,
                'odds_over_decimal': odds_over_decimal,
                'odds_under_decimal': odds_under_decimal,
                'odds_over_american': odds_over_american_str,
                'odds_under_american': odds_under_american_str,
            }

    return results


def price_country_props(threshold_rounds: int = 5, margin_bps: int = 700) -> Dict:
    """
    Price the Country Props 'To Appear' market.

    Reads the `geo_countries` table which has a `freq` column representing
    the percent chance (e.g., 2.4 means 2.4%) of that country appearing in a
    single round. For a game of `threshold_rounds` rounds, the probability that
    the country appears at least once (YES) is: 1 - (1 - p)^threshold_rounds.
    NO = (1 - p)^threshold_rounds.

    Applies margin by bumping probabilities by (1 + margin_bps/10000).
    Returns dict keyed by country_id -> entry with prob_yes, prob_no, decimal and american odds.
    """
    from database.geo_repo import get_geo_countries

    results: Dict = {}
    try:
        countries = get_geo_countries() or []
        print(f"✓ Retrieved {len(countries)} countries from DB: {[c.get('country') for c in countries]}")
    except Exception as e:
        # If DB/Supabase call fails, return empty results (caller/route will decide error handling)
        print(f"✗ Failed to retrieve countries from DB: {e}")
        return {}

    for c in countries:
        try:
            cid = c.get('id')
            name = c.get('country')
            freq_pct = c.get('freq')

            # parse freq as float percent (e.g., 2.4 -> 0.024)
            if freq_pct is None:
                p = 0.0
            else:
                try:
                    p = float(freq_pct) / 100.0
                except Exception:
                    # malformed freq value, skip this row
                    p = 0.0

            # guard p range
            p = max(0.0, min(1.0, p))

            # per-game probabilities for 'appears at least once in threshold_rounds rounds'
            prob_no = (1.0 - p) ** threshold_rounds
            prob_yes = 1.0 - prob_no

            # apply vig (bump probabilities)
            prob_yes_adj, prob_no_adj = apply_margin(prob_yes, prob_no, margin_bps)

            # ensure numeric
            prob_yes_adj = float(prob_yes_adj or 0.0)
            prob_no_adj = float(prob_no_adj or 0.0)

            d_yes_raw = prob_to_decimal(prob_yes_adj)
            d_no_raw = prob_to_decimal(prob_no_adj)

            odds_yes_american_str = decimal_to_american_rounded(d_yes_raw, prob=prob_yes_adj)
            try:
                yes_a_int = int(str(odds_yes_american_str).replace('+', ''))
            except Exception:
                yes_a_int = None
            odds_yes_decimal = american_to_decimal(yes_a_int) if yes_a_int is not None else d_yes_raw

            odds_no_american_str = decimal_to_american_rounded(d_no_raw, prob=prob_no_adj)
            try:
                no_a_int = int(str(odds_no_american_str).replace('+', ''))
            except Exception:
                no_a_int = None
            odds_no_decimal = american_to_decimal(no_a_int) if no_a_int is not None else d_no_raw

            results[cid] = {
                'country_id': cid,
                'country': name,
                'freq_pct': freq_pct,
                'prob_yes': prob_yes_adj,
                'prob_no': prob_no_adj,
                'odds_yes_decimal': odds_yes_decimal,
                'odds_no_decimal': odds_no_decimal,
                'odds_yes_american': odds_yes_american_str,
                'odds_no_american': odds_no_american_str,
            }
        except Exception:
            # skip problematic country row but continue processing others
            continue

    return results


def recompute_all_lines_supabase(thresholds: List[int] = None, margin_bps: int = 0):
    """
    Recompute lines for all players using Supabase geo_players table.
    
    Returns dict with inserted/updated counts:
      {
        'inserted': count,
        'updated': count,
        'results': {player_id: {threshold: pricing_data}}
      }
    """
    from database.geo_repo import get_geo_players
    
    if thresholds is None:
        thresholds = list(range(7500, 23001, 500))
    
    all_players = get_geo_players()
    results = {}
    
    for player in all_players:
        pid = player.get('player_id')
        mu = float(player.get('mean_score')) if player.get('mean_score') is not None else None
        sigma = float(player.get('stddev_score')) if player.get('stddev_score') is not None else 0.0
        
        results[pid] = {}
        
        for t in thresholds:
            if mu is None:
                p_over = 0.5
            else:
                cdf = normal_cdf(t, mu, sigma)
                p_over = max(0.0, 1.0 - cdf)
            
            p_under = 1.0 - p_over
            p_over_adj, p_under_adj = apply_margin(p_over, p_under, margin_bps)
            d_over_raw = prob_to_decimal(p_over_adj)
            d_under_raw = prob_to_decimal(p_under_adj)
            a_over = decimal_to_american_rounded(d_over_raw, prob=p_over_adj)
            try:
                a_over_int = int(str(a_over).replace('+', ''))
            except Exception:
                a_over_int = None
            odds_over_decimal = american_to_decimal(a_over_int) if a_over_int is not None else d_over_raw

            a_under = decimal_to_american_rounded(d_under_raw, prob=p_under_adj)
            try:
                a_under_int = int(str(a_under).replace('+', ''))
            except Exception:
                a_under_int = None
            odds_under_decimal = american_to_decimal(a_under_int) if a_under_int is not None else d_under_raw

            results[pid][t] = {
                'prob_over': p_over_adj,
                'prob_under': p_under_adj,
                'odds_over_decimal': odds_over_decimal,
                'odds_under_decimal': odds_under_decimal,
                'odds_over_american': a_over,
                'odds_under_american': a_under,
            }
    
    # Note: Persistence to Supabase lines table would require creating that table first.
    # For now, we return the computed results without persisting.
    # To persist, you would need to create a `lines` table in Supabase with columns:
    # (id, player_id, threshold, prob_over, prob_under, odds_over_decimal, odds_under_decimal, 
    #  odds_over_american, odds_under_american, price_model, margin_bps, created_at, updated_at)
    
    return {
        'inserted': len(all_players) * len(thresholds),  # Mock count; actual persistence not implemented
        'updated': 0,
        'results': results
    }


### Continent-level markets (binomial pricing) ###


def _binomial_pmf(n: int, k: int, p: float) -> float:
    """Binomial PMF: P(X == k) for X ~ Binomial(n, p)."""
    if p is None:
        return 0.0
    if p <= 0.0:
        return 1.0 if k == 0 else 0.0
    if p >= 1.0:
        return 1.0 if k == n else 0.0
    try:
        c = math.comb(n, k)
    except Exception:
        # fallback to math.factorial-based comb
        c = math.factorial(n) // (math.factorial(k) * math.factorial(n - k))
    return c * (p ** k) * ((1.0 - p) ** (n - k))


def binomial_tail_probs(n: int, p: float, hook: float) -> Dict[str, float]:
    """Compute over/under tail probabilities for a given hook.

    hook: one of 0.5, 1.5, 2.5, 3.5 → interpreted such that
      k = floor(hook)  (e.g., 0.5 -> k=0, 1.5 -> k=1)
    OverProb = P(X >= k+1)
    UnderProb = P(X <= k)
    Returns: {'over': overProb, 'under': underProb}
    """
    if p is None:
        return {'over': 0.0, 'under': 0.0}
    # clamp p
    p = max(0.0, min(1.0, float(p)))
    if n <= 0:
        return {'over': 0.0, 'under': 1.0}

    k = int(math.floor(hook))
    # ensure k in [0, n]
    k = max(0, min(n, k))

    over = 0.0
    under = 0.0
    # under: sum_{j=0..k} pmf(j)
    for j in range(0, k + 1):
        under += _binomial_pmf(n, j, p)
    # over: sum_{j=k+1..n} pmf(j)
    for j in range(k + 1, n + 1):
        over += _binomial_pmf(n, j, p)

    # clamp tiny floating drift
    over = max(0.0, min(1.0, over))
    under = max(0.0, min(1.0, under))
    return {'over': over, 'under': under}


def get_continent_probs(rounds: int = 5) -> List[Dict]:
    """Aggregate geo_countries by continent and return normalized probabilities per continent.

    Returns list of { 'continent': name, 'freq': F_c, 'p': normalized_probability }
    """
    from database.geo_repo import get_geo_countries

    try:
        rows = get_geo_countries() or []
    except Exception:
        rows = []

    # aggregate
    by_cont = {}
    for r in rows:
        cont = (r.get('continent') or '').strip()
        if not cont:
            continue
        try:
            freq_raw = r.get('freq')
            f = float(freq_raw) if freq_raw is not None else 0.0
        except Exception:
            f = 0.0
        if f < 0:
            f = 0.0
        by_cont[cont] = by_cont.get(cont, 0.0) + f

    total = sum(by_cont.values())
    if total <= 0:
        return []

    out = []
    for cont, f in by_cont.items():
        p = f / total
        out.append({'continent': cont, 'freq': f, 'p': p})

    # sort by probability desc
    out.sort(key=lambda x: x['p'], reverse=True)
    return out


def continent_markets(rounds: int = 5, hooks: List[float] = None, margin_bps: int = 850, max_decimal_odds: float = 100.0) -> Dict:
    """Build continent over/under markets priced by binomial model.

    Returns dict: { 'config': { rounds }, 'continents': [ { name, p, hooks: [ {hook, overProb, underProb, overDecimal, underDecimal, overAmerican, underAmerican} ] } ] }
    """
    if hooks is None:
        hooks = [0.5, 1.5, 2.5, 3.5]

    conts = get_continent_probs(rounds=rounds)
    if not conts:
        return {'config': {'rounds': rounds}, 'continents': []}

    continents_out = []
    for entry in conts:
        name = entry.get('continent')
        p = float(entry.get('p', 0.0))
        hooks_out = []
        for h in hooks:
            probs = binomial_tail_probs(rounds, p, h)
            over = float(probs.get('over', 0.0))
            under = float(probs.get('under', 0.0))
            # apply margin bump consistently (re-use apply_margin)
            over_adj, under_adj = apply_margin(over, under, margin_bps)

            # compute decimals
            dol = prob_to_decimal(over_adj)
            dul = prob_to_decimal(under_adj)
            # cap decimal odds
            dol = min(dol, max_decimal_odds)
            dul = min(dul, max_decimal_odds)

            # convert to american using existing helper
            a_over = decimal_to_american_rounded(dol, prob=over_adj)
            a_under = decimal_to_american_rounded(dul, prob=under_adj)

            hooks_out.append({
                'hook': h,
                'overProb': over_adj,
                'underProb': under_adj,
                'overOddsDecimal': round(dol, 4),
                'underOddsDecimal': round(dul, 4),
                'overOddsAmerican': a_over,
                'underOddsAmerican': a_under,
            })

        continents_out.append({'name': name, 'p': p, 'freq': entry.get('freq'), 'hooks': hooks_out})

    return {'config': {'rounds': rounds}, 'continents': continents_out}
