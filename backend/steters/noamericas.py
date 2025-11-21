import random

# Updated continent probabilities
continent_probs = {
    "Europe": 0.558,
    "Asia": 0.162,
    "South America": 0.09,
    "Africa": 0.067,
    "North America": 0.06,
    "Oceania": 0.04766,
}

# Normalize probabilities
total = sum(continent_probs.values())
continents = list(continent_probs.keys())
weights = [p / total for p in continent_probs.values()]

def simulate_game(rounds=5):
    picks = random.choices(continents, weights=weights, k=rounds)
    # Condition: no Europe and no Asia in all rounds
    return all(c not in ("Europe", "Asia") for c in picks)

if __name__ == "__main__":
    iterations = 100000
    count = sum(simulate_game() for _ in range(iterations))
    prob = count / iterations

    print("=== Summary ===")
    print(f"No Europe/Asia (all 5 rounds neither Europe nor Asia): "
          f"{count}/{iterations} ({prob:.4%})")
