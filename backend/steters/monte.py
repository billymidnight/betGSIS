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
        PlayerModel.from_mean_std("Pam", 2600, 1000),
        PlayerModel.from_mean_std("Sohan", 3100, 750),
        PlayerModel.from_mean_std("Pritesh", 3000, 1000),
        PlayerModel.from_mean_std("Naresh", 2200, 1500),
    ]

    iterations = 10000
    overall_counts = {p.name: 0 for p in players}
    first_counts = {p.name: 0 for p in players}
    last_counts = {p.name: 0 for p in players}

    for _ in range(iterations):
        overall_winners, first_winners, last_winners = simulate_game(players)
        for w in overall_winners:
            overall_counts[w] += 1
        for w in first_winners:
            first_counts[w] += 1
        for w in last_winners:
            last_counts[w] += 1

    print("=== Monte Carlo Summary (10,000 games) ===")
    print(f"{'Player':<10} | {'Game Win %':>10} | {'First Round Win %':>18} | {'Last Round Win %':>17}")
    print("-" * 65)
    for p in players:
        name = p.name
        print(f"{name:<10} | {overall_counts[name]/iterations:10.2%} | "
              f"{first_counts[name]/iterations:18.2%} | {last_counts[name]/iterations:17.2%}")
