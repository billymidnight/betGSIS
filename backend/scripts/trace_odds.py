"""Trace odds conversion steps for specific test probabilities.

Run this from the backend folder:
  python -u scripts\trace_odds.py

This prints each step: probability before/after margin, decimal, american string, and reverse-decimal when applicable.
"""
import os
import sys
from importlib import util

# Ensure backend root is on sys.path
ROOT = os.path.dirname(os.path.dirname(__file__))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

# Attempt to import services.pricing_service and utils.odds; fall back to loading by path
try:
    from services import pricing_service
except Exception:
    spec = util.spec_from_file_location("pricing_service", os.path.join(ROOT, "services", "pricing_service.py"))
    pricing_service = util.module_from_spec(spec)
    spec.loader.exec_module(pricing_service)

try:
    from utils import odds as odds_utils
except Exception:
    spec2 = util.spec_from_file_location("odds", os.path.join(ROOT, "utils", "odds.py"))
    odds_utils = util.module_from_spec(spec2)
    spec2.loader.exec_module(odds_utils)

def trace(prob, side_label=""):
    print(f"--- TRACE {side_label} p={prob} ---")
    # No margin applied here; caller may choose to apply.
    p_adj = prob
    print(f"prob (input) = {prob}")

    d_raw = pricing_service.prob_to_decimal(p_adj)
    print(f"decimal raw from prob_to_decimal = {d_raw}")

    american = odds_utils.decimal_to_american_rounded(d_raw, prob=p_adj)
    print(f"decimal_to_american_rounded(decimal={d_raw}, prob={p_adj}) -> {american}")

    # parse american to int if possible and convert back
    try:
        a_int = int(str(american).replace('+', ''))
    except Exception:
        a_int = None
    back_decimal = odds_utils.american_to_decimal(a_int) if a_int is not None else None
    print(f"american_to_decimal({a_int}) -> {back_decimal}")
    print()

def main():
    # Test vectors as requested
    favorites = [0.999, 0.9995, 0.9996]
    underdogs = [0.01, 0.02]

    for p in favorites:
        trace(p, side_label="FAVORITE")

    for p in underdogs:
        trace(p, side_label="UNDERDOG")

if __name__ == "__main__":
    main()
