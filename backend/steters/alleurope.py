import random

# Continent probabilities
continent_probs = {
    "Europe": 0.588,
    "Asia": 0.132,
    "South America": 0.09,
    "Africa": 0.067,
    "North America": 0.06,
    "Oceania": 0.04766
}

# Normalize probabilities
total = sum(continent_probs.values())
continents = list(continent_probs.keys())
weights = [p / total for p in continent_probs.values()]

def simulate_game(rounds=5):
    picks = random.choices(continents, weights=weights, k=rounds)
    return all(c == "Europe" for c in picks)

if __name__ == "__main__":
    iterations = 100000
    count = sum(simulate_game() for _ in range(iterations))
    prob = count / iterations
    print("=== Summary ===")
    print(f"All 5 rounds Europe: {count}/{iterations} ({prob:.4%})")
