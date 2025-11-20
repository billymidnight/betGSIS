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

def simulate_game():
    # Sample 5 rounds
    rounds = random.choices(continents, weights=weights, k=5)
    # Check for back-to-back Asia (pairs or triples)
    for i in range(4):
        if rounds[i] == "Asia" and rounds[i+1] == "Asia":
            return True
    for i in range(3):
        if rounds[i] == "Asia" and rounds[i+1] == "Asia" and rounds[i+2] == "Asia":
            return True
    return False

if __name__ == "__main__":
    iterations = 10000
    count = sum(simulate_game() for _ in range(iterations))
    prob = count / iterations
    print(f"Back-to-back Asia probability: {prob:.4%} ({count}/{iterations})")
