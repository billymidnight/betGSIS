import random
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
    round_scores = []
    for _ in range(rounds):
        scores = {}
        for p in players:
            scores[p.name] = p.sample_round()
        round_scores.append(scores)
    return round_scores

if __name__ == "__main__":
    players = [
        PlayerModel.from_mean_std("Pam", 2630, 1000),
        PlayerModel.from_mean_std("Sohan", 3100, 1000),
        PlayerModel.from_mean_std("Pritesh", 3000, 1000),
        PlayerModel.from_mean_std("Naresh", 2250, 1500)
    ]

    iterations = 20000

    # Variables you can change:
    target_name = "Sohan"       # e.g. "Sam" or "Sohan"
    min_rounds_first = 4      # e.g. 4 or 3

    success_count = 0

    for _ in range(iterations):
        round_scores = simulate_game(players)
        first_places = 0
        for r in round_scores:
            # check if target_name has the highest score in this round
            if r[target_name] == max(r.values()):
                first_places += 1
        if first_places >= min_rounds_first:
            success_count += 1

    print("\n=== Summary ===")
    print(f"{target_name} finished 1st in at least {min_rounds_first} rounds: "
          f"{success_count}/{iterations} ({success_count/iterations:.4%})")
