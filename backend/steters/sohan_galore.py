import random
import numpy as np
from scipy.stats import beta
from dataclasses import dataclass

MAX_SCORE = 5000.0

def fit_beta_params(mean: float, var: float, L: float = MAX_SCORE):
    m = mean / L
    v = var / (L**2)
    if v <= 0 or m <= 0 or m >= 1:
        return 2.0, 2.0
    t = m * (1 - m) / v - 1.0
    a = max(1e-3, m * t)
    b = max(1e-3, (1 - m) * t)
    return a, b

@dataclass
class PlayerModel:
    name: str
    mean: float
    std: float
    p_easy: float = 0.07
    p_cat: float = 0.09
    a: float = 2.0
    b: float = 2.0

    @classmethod
    def from_mean_std(cls, name: str, mean: float, std: float, p_easy=0.07, p_cat=0.09):
        a, b = fit_beta_params(mean, std**2, L=MAX_SCORE)
        return cls(name=name, mean=mean, std=std, p_easy=p_easy, p_cat=p_cat, a=a, b=b)

    def sample_round(self) -> float:
        r = random.random()
        if r < self.p_easy:
            return random.uniform(4950, 5000)
        elif r < self.p_easy + self.p_cat:
            return random.uniform(0, 2000)
        else:
            y = beta.rvs(self.a, self.b)
            x = float(y * MAX_SCORE)
            if x > MAX_SCORE:
                x = random.uniform(4950, 5000)
            return max(0.0, min(MAX_SCORE, x))

def simulate_game(players, rounds=5):
    totals = {p.name: 0.0 for p in players}
    round_scores = []

    for _ in range(rounds):
        scores = {}
        for p in players:
            score = p.sample_round()
            totals[p.name] += score
            scores[p.name] = score
        round_scores.append(scores)

    # Overall winner(s)
    max_total = max(totals.values())
    overall_winners = [n for n, t in totals.items() if abs(t - max_total) < 1e-9]

    # First round winner(s)
    first_scores = round_scores[0]
    max_first = max(first_scores.values())
    first_winners = [n for n, s in first_scores.items() if abs(s - max_first) < 1e-9]

    # Last round winner(s)
    last_scores = round_scores[-1]
    max_last = max(last_scores.values())
    last_winners = [n for n, s in last_scores.items() if abs(s - max_last) < 1e-9]

    return overall_winners, first_winners, last_winners

if __name__ == "__main__":
    players = [
        PlayerModel.from_mean_std("Pam", 2630, 1000),
        PlayerModel.from_mean_std("Sohan", 3100, 1000),
        PlayerModel.from_mean_std("Pritesh", 3000, 1000),
        PlayerModel.from_mean_std("Naresh", 2250, 1500),
    ]

    iterations = 100000
    success_count = 0

    for _ in range(iterations):
        overall_winners, first_winners, last_winners = simulate_game(players)

        # Condition: Sohan wins first, last, and overall
        if ("Sohan" in first_winners) and ("Sohan" in last_winners) and ("Sohan" in overall_winners):
            success_count += 1

    print("\n=== Summary ===")
    print(f"Sohan triple-win successes: {success_count}/{iterations} ({success_count/iterations:.4%})")
