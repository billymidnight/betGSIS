import random
import numpy as np
from dataclasses import dataclass

MAX_SCORE = 5000.0

@dataclass
class PlayerModel:
    name: str
    mean: float
    std: float

    def sample_round(self) -> float:
        # sample from normal, clamp between 0 and MAX_SCORE
        x = np.random.normal(self.mean, self.std)
        return max(0.0, min(MAX_SCORE, x))

def multiplier(round_num: int) -> float:
    # 1x for rounds 1–3, then M(n) = 0.5*n - 0.5 for n >= 4
    if round_num <= 3:
        return 1.0
    else:
        return 0.5 * round_num - 0.5

def simulate_duel(p1: PlayerModel, p2: PlayerModel, log: bool = False):
    health = {p1.name: 6000.0, p2.name: 6000.0}
    round_num = 1

    # if log:
    #     print(f"\n=== New Duel: {p1.name} vs {p2.name} ===")
    #     print(f"Starting health: {p1.name}=6000, {p2.name}=6000")

    while health[p1.name] > 0 and health[p2.name] > 0:
        score1 = p1.sample_round()
        score2 = p2.sample_round()
        diff = score1 - score2
        m = multiplier(round_num)

        if diff > 0:
            health[p2.name] -= diff * m
        elif diff < 0:
            health[p1.name] -= (-diff) * m

        # if log:
        #     print(f"Round {round_num:>2} | Mult={m:.2f} | "
        #           f"{p1.name} score={score1:7.2f}, {p2.name} score={score2:7.2f} | "
        #           f"Health: {p1.name}={health[p1.name]:7.2f}, {p2.name}={health[p2.name]:7.2f}")

        round_num += 1

    # Decide winner
    if health[p1.name] <= 0 and health[p2.name] <= 0:
        winner = None
    elif health[p1.name] <= 0:
        winner = p2.name
    else:
        winner = p1.name

    # if log:
    #     result_str = "Tie" if winner is None else f"{winner} wins"
    #     print(f"Result after {round_num-1} rounds: {result_str}")
    #     input("Press Enter to continue to next duel...")

    return winner, round_num - 1

if __name__ == "__main__":
    # Single-round stats: mean/5, std/√5
    sohan_mean = 16750 / 5.0
    sohan_std = 4700 / np.sqrt(5.0)
    pam_mean = 14550 / 5.0
    pam_std = 4950 / np.sqrt(5.0)

    sohan = PlayerModel("Sohan", sohan_mean, sohan_std)
    pam = PlayerModel("Pam", pam_mean, pam_std)

    iterations = 10000
    wins = {sohan.name: 0, pam.name: 0, "Tie": 0}

    for i in range(iterations):
        winner, rounds_played = simulate_duel(sohan, pam, log=False)
        if winner is None:
            wins["Tie"] += 1
        else:
            wins[winner] += 1

    print("\n=== Duel Simulation Summary (10,000 games) ===")
    for name, count in wins.items():
        print(f"{name:<6} : {count/iterations:6.2%}")
