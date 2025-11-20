from typing import Dict, List
import random
from math import isfinite

from services.pricing_service import fit_beta_params, prob_to_decimal  # type: ignore
from utils.odds import decimal_to_american_rounded  # type: ignore


def _apply_single_vig(prob: float, vig_bps: int) -> float:
    if prob is None:
        return 0.0
    margin = float(vig_bps) / 10000.0
    adj = prob * (1.0 + margin)
    return min(max(adj, 0.0), 0.9999)


def _get_continent_weights() -> Dict[str, float]:
    """Fetch continent probabilities from DB and return mapping continent->prob"""
    try:
        from services.pricing_service import get_continent_probs  # type: ignore
        conts = get_continent_probs(rounds=5)
        return {c['continent']: float(c.get('p', 0.0)) for c in conts}
    except Exception:
        return {}


def _sample_continent_event(condition_fn, weights: Dict[str, float], iterations: int = 5000) -> float:
    # normalize weights to list
    if not weights:
        weights = _get_continent_weights()
    conts = list(weights.keys())
    probs = [weights.get(c, 0.0) for c in conts]
    total = sum(probs)
    if total <= 0:
        # fallback uniform
        probs = [1.0 / max(1, len(conts)) for _ in conts]
    else:
        probs = [p / total for p in probs]

    hits = 0
    for _ in range(int(iterations or 5000)):
        draws = random.choices(conts, weights=probs, k=5)
        if condition_fn(draws):
            hits += 1
    return float(hits) / float(iterations or 5000)


def no_europe_and_two_plus_oceania(weights: Dict[str, float] = None, iterations: int = 5000, vig_bps: int = 800) -> Dict:
    def cond(draws: List[str]):
        europe_count = sum(1 for d in draws if d.lower() == 'europe')
        oce_count = sum(1 for d in draws if d.lower() == 'oceania')
        return (europe_count == 0) and (oce_count >= 2)

    fair = _sample_continent_event(cond, weights or _get_continent_weights(), iterations=iterations)
    vig = _apply_single_vig(fair, vig_bps)
    dec = prob_to_decimal(vig) if fair is not None else float('inf')
    amer = decimal_to_american_rounded(dec, prob=vig)
    return {'name': 'No Europe and 2+ Oceania', 'fair_prob': float(fair), 'vig_prob': float(vig), 'american': amer, 'decimal': round(dec, 4)}


def three_europe_one_asia_one_africa(weights: Dict[str, float] = None, iterations: int = 5000, vig_bps: int = 800) -> Dict:
    def cond(draws: List[str]):
        europe_count = sum(1 for d in draws if d.lower() == 'europe')
        asia_count = sum(1 for d in draws if d.lower() == 'asia')
        africa_count = sum(1 for d in draws if d.lower() == 'africa')
        return (europe_count == 3) and (asia_count == 1) and (africa_count == 1)

    fair = _sample_continent_event(cond, weights or _get_continent_weights(), iterations=iterations)
    vig = _apply_single_vig(fair, vig_bps)
    dec = prob_to_decimal(vig) if fair is not None else float('inf')
    amer = decimal_to_american_rounded(dec, prob=vig)
    return {'name': '3 Europe, 1 Asia, 1 Africa', 'fair_prob': float(fair), 'vig_prob': float(vig), 'american': amer, 'decimal': round(dec, 4)}


def no_world_cup_winners(vig_bps: int = 700) -> Dict:
    # exact list of world cup winning countries per spec
    winners = {'germany', 'france', 'italy', 'united kingdom', 'spain', 'argentina', 'uruguay', 'brazil'}
    try:
        from database.geo_repo import get_geo_countries  # type: ignore
        rows = get_geo_countries() or []
    except Exception:
        rows = []

    p_sum = 0.0
    for r in rows:
        name = (r.get('country') or '').strip().lower()
        freq = r.get('freq')
        try:
            f = float(freq) / 100.0 if freq is not None else 0.0
        except Exception:
            f = 0.0
        if name in winners:
            p_sum += max(0.0, min(1.0, f))

    # per-round probability that a world-cup-winner appears is p_sum (may exceed 1 if DB values inconsistent, clamp)
    p = max(0.0, min(1.0, p_sum))
    fair = (1.0 - p) ** 5
    vig = _apply_single_vig(fair, vig_bps)
    dec = prob_to_decimal(vig)
    amer = decimal_to_american_rounded(dec, prob=vig)
    return {'name': 'No World Cup Winners', 'fair_prob': float(fair), 'vig_prob': float(vig), 'american': amer, 'decimal': round(dec, 4)}


# Naresh-specific specials removed per user request. Do not include Naresh markets.


def get_specials_prices(simulations: int = 10000) -> Dict:
    """Return specials prices. Default simulations increased to 10,000 for stability."""
    weights = _get_continent_weights()
    sims = int(simulations or 10000)
    markets = []
    markets.append(no_europe_and_two_plus_oceania(weights=weights, iterations=sims, vig_bps=800))
    markets.append(three_europe_one_asia_one_africa(weights=weights, iterations=sims, vig_bps=800))
    markets.append(no_world_cup_winners(vig_bps=700))
    # Naresh markets intentionally excluded
    return {'markets': markets}
