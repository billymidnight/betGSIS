import random
import statistics
from typing import List


def monte_carlo_probs(values: List[float], thresholds: List[float], trials: int = 10000):
    # simple Monte Carlo assuming normal with mean/std from values
    if not values:
        return {t: {'over': None, 'under': None} for t in thresholds}
    mean = statistics.mean(values)
    stdev = statistics.pstdev(values) if len(values) > 1 else 1.0
    out = {}
    for t in thresholds:
        over = 0
        for _ in range(trials):
            sample = random.gauss(mean, stdev)
            if sample >= t:
                over += 1
        p_over = over / trials
        out[t] = {'over': p_over, 'under': 1 - p_over}
    return out
