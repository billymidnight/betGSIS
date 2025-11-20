# # import numpy as np
# # import random

# # # Player distributions: mean and std dev
# # players = {
# #     "Sohan": (3100, 600),
# #     "Pritesh": (3050, 750),
# #     "Naresh": (2400, 800),
# #     "Pam": (2600, 750)
# # }

# # # Function to sample a player's score with cap at 5000
# # def sample_score(name, mu, sigma):
# #     score = np.random.normal(mu, sigma)
# #     if score > 5000:
# #         # Cap: replace with uniform between 4950 and 5000
# #         score = random.uniform(4950, 5000)
# #     print(f"Sampled score for {name}: {score:.2f}")
# #     return score

# # # Simulation parameters
# # iterations = 10000
# # starting_health = 6000

# # # Track wins
# # wins = {"Team1 (Pritesh+Pam)": 0, "Team2 (Sohan+Naresh)": 0}

# # for game in range(iterations):
# #     print(f"\n=== Starting Game {game+1} ===")
# #     health1 = starting_health
# #     health2 = starting_health
# #     round_num = 0

# #     # Play until one team dies
# #     while health1 > 0 and health2 > 0:
# #         round_num += 1
# #         print(f"\n-- Round {round_num} --")

# #         # Sample scores
# #         pritesh_score = sample_score("Pritesh", *players["Pritesh"])
# #         pam_score = sample_score("Pam", *players["Pam"])
# #         sohan_score = sample_score("Sohan", *players["Sohan"])
# #         naresh_score = sample_score("Naresh", *players["Naresh"])

# #         # Team maxes
# #         team1_points = max(pritesh_score, pam_score)
# #         team2_points = max(sohan_score, naresh_score)
# #         print(f"Team1 max points: {team1_points:.2f}")
# #         print(f"Team2 max points: {team2_points:.2f}")

# #         # Damage calculation
# #         damage = abs(team1_points - team2_points)
# #         multiplier = 1.0
# #         if round_num > 3:
# #             multiplier = 1.0 + 0.5 * (round_num - 3)
# #         damage *= multiplier
# #         print(f"Damage this round (with multiplier {multiplier}): {damage:.2f}")

# #         # Apply damage
# #         if team1_points > team2_points:
# #             health2 -= damage
# #             print(f"Team1 wins round, Team2 loses {damage:.2f} health → {health2:.2f} left")
# #         elif team2_points > team1_points:
# #             health1 -= damage
# #             print(f"Team2 wins round, Team1 loses {damage:.2f} health → {health1:.2f} left")
# #         else:
# #             print("Round tied, no damage applied.")

# #     # Determine winner
# #     if health1 <= 0 and health2 <= 0:
# #         # Rare case: both die same round → count as tie (optional)
# #         print("Both teams died simultaneously! No win counted.")
# #     elif health1 <= 0:
# #         wins["Team2 (Sohan+Naresh)"] += 1
# #         print("Team2 wins this game!")
# #     else:
# #         wins["Team1 (Pritesh+Pam)"] += 1
# #         print("Team1 wins this game!")

# # # Final results
# # print("\n=== Simulation Results ===")
# # for team, count in wins.items():
# #     pct = (count / iterations) * 100
# #     print(f"{team}: {count} wins ({pct:.2f}%)")


# import numpy as np
# import random

# # Player distributions: mean and std dev
# players = {
#     "Sohan": (3100, 600),
#     "Pritesh": (3050, 750),
#     "Naresh": (2400, 800),
#     "Pam": (2600, 750)
# }

# # Function to sample a player's score with cap at 5000
# def sample_score(name, mu, sigma):
#     score = np.random.normal(mu, sigma)
#     if score > 5000:
#         # Cap: replace with uniform between 4950 and 5000
#         score = random.uniform(4950, 5000)
#     print(f"Sampled score for {name}: {score:.2f}")
#     return score

# # Simulation parameters
# iterations = 10000
# starting_health = 6000

# # Track wins
# wins = {"Team1 (Pritesh+Naresh)": 0, "Team2 (Pam+Sohan)": 0}

# for game in range(iterations):
#     print(f"\n=== Starting Game {game+1} ===")
#     health1 = starting_health
#     health2 = starting_health
#     round_num = 0

#     # Play until one team dies
#     while health1 > 0 and health2 > 0:
#         round_num += 1
#         print(f"\n-- Round {round_num} --")

#         # Sample scores
#         pritesh_score = sample_score("Pritesh", *players["Pritesh"])
#         naresh_score = sample_score("Naresh", *players["Naresh"])
#         pam_score = sample_score("Pam", *players["Pam"])
#         sohan_score = sample_score("Sohan", *players["Sohan"])

#         # Team maxes
#         team1_points = max(pritesh_score, naresh_score)
#         team2_points = max(pam_score, sohan_score)
#         print(f"Team1 max points: {team1_points:.2f}")
#         print(f"Team2 max points: {team2_points:.2f}")

#         # Damage calculation
#         damage = abs(team1_points - team2_points)
#         multiplier = 1.0
#         if round_num > 3:
#             multiplier = 1.0 + 0.5 * (round_num - 3)
#         damage *= multiplier
#         print(f"Damage this round (with multiplier {multiplier}): {damage:.2f}")

#         # Apply damage
#         if team1_points > team2_points:
#             health2 -= damage
#             print(f"Team1 wins round, Team2 loses {damage:.2f} health → {health2:.2f} left")
#         elif team2_points > team1_points:
#             health1 -= damage
#             print(f"Team2 wins round, Team1 loses {damage:.2f} health → {health1:.2f} left")
#         else:
#             print("Round tied, no damage applied.")

#     # Determine winner
#     if health1 <= 0 and health2 <= 0:
#         print("Both teams died simultaneously! No win counted.")
#     elif health1 <= 0:
#         wins["Team2 (Pam+Sohan)"] += 1
#         print("Team2 wins this game!")
#     else:
#         wins["Team1 (Pritesh+Naresh)"] += 1
#         print("Team1 wins this game!")

# # Final results
# print("\n=== Simulation Results ===")
# for team, count in wins.items():
#     pct = (count / iterations) * 100
#     print(f"{team}: {count} wins ({pct:.2f}%)")


import numpy as np
import random

# Player distributions: mean and std dev
players = {
    "Sohan": (3100, 600),
    "Pritesh": (3050, 750),
    "Naresh": (2400, 800),
    "Pam": (2600, 750)
}

# Function to sample a player's score with cap at 5000
def sample_score(name, mu, sigma):
    score = np.random.normal(mu, sigma)
    if score > 5000:
        # Cap: replace with uniform between 4950 and 5000
        score = random.uniform(4950, 5000)
    print(f"Sampled score for {name}: {score:.2f}")
    return score

# Simulation parameters
iterations = 10000
starting_health = 6000

# Track wins
wins = {"Team1 (Pam+Naresh)": 0, "Team2 (Sohan+Pritesh)": 0}

for game in range(iterations):
    print(f"\n=== Starting Game {game+1} ===")
    health1 = starting_health
    health2 = starting_health
    round_num = 0

    # Play until one team dies
    while health1 > 0 and health2 > 0:
        round_num += 1
        print(f"\n-- Round {round_num} --")

        # Sample scores
        pam_score = sample_score("Pam", *players["Pam"])
        naresh_score = sample_score("Naresh", *players["Naresh"])
        sohan_score = sample_score("Sohan", *players["Sohan"])
        pritesh_score = sample_score("Pritesh", *players["Pritesh"])

        # Team maxes
        team1_points = max(pam_score, naresh_score)
        team2_points = max(sohan_score, pritesh_score)
        print(f"Team1 max points: {team1_points:.2f}")
        print(f"Team2 max points: {team2_points:.2f}")

        # Damage calculation
        damage = abs(team1_points - team2_points)
        multiplier = 1.0
        if round_num > 3:
            multiplier = 1.0 + 0.5 * (round_num - 3)
        damage *= multiplier
        print(f"Damage this round (with multiplier {multiplier}): {damage:.2f}")

        # Apply damage
        if team1_points > team2_points:
            health2 -= damage
            print(f"Team1 wins round, Team2 loses {damage:.2f} health → {health2:.2f} left")
        elif team2_points > team1_points:
            health1 -= damage
            print(f"Team2 wins round, Team1 loses {damage:.2f} health → {health1:.2f} left")
        else:
            print("Round tied, no damage applied.")

    # Determine winner
    if health1 <= 0 and health2 <= 0:
        print("Both teams died simultaneously! No win counted.")
    elif health1 <= 0:
        wins["Team2 (Sohan+Pritesh)"] += 1
        print("Team2 wins this game!")
    else:
        wins["Team1 (Pam+Naresh)"] += 1
        print("Team1 wins this game!")

# Final results
print("\n=== Simulation Results ===")
for team, count in wins.items():
    pct = (count / iterations) * 100
    print(f"{team}: {count} wins ({pct:.2f}%)")
