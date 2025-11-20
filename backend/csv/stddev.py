import pandas as pd

# Load CSV (same directory)
df = pd.read_csv("data.csv")

# Compute standard deviation for each column
std_devs = df.std(numeric_only=True)

# Print results
print("Standard Deviations:")
for col, val in std_devs.items():
    print(f"{col}: {val}")
