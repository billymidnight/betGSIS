import numpy as np

# Player distributions
players = {
    "Naresh": {"mean": 18.5, "std_dev": 7.0},
    "Pritesh": {"mean": 87.5, "std_dev": 7.0},
    "Sohan": {"mean": 20.5, "std_dev": 6.0},
    "Pam": {"mean": 17.5, "std_dev": 9.0},
}

def simulate_matchup(player1, player2, iterations=10000):
    p1 = players[player1]
    p2 = players[player2]

    wins_p1 = 0
    wins_p2 = 0

    for _ in range(iterations):
        score1 = np.random.normal(p1["mean"], p1["std_dev"])
        score2 = np.random.normal(p2["mean"], p2["std_dev"])
        if score1 > score2:
            wins_p1 += 1
        elif score2 > score1:
            wins_p2 += 1
        # ties are ignored

    total = wins_p1 + wins_p2
    prob_p1 = wins_p1 / total if total > 0 else 0
    prob_p2 = wins_p2 / total if total > 0 else 0

    print(f"{player1} vs {player2}:")
    print(f"  {player1} win probability: {prob_p1:.3f}")
    print(f"  {player2} win probability: {prob_p2:.3f}")
    print()

# Run simulations
simulate_matchup("Naresh", "Sohan")
simulate_matchup("Sohan", "Pam")
simulate_matchup("Pam", "Sohan")
