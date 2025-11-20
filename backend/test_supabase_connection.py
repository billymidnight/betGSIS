#!/usr/bin/env python3
"""
Quick test script to validate Supabase connection and geo_players table access.
Run this before starting the Flask app to confirm DB is reachable.

Usage:
    python test_supabase_connection.py
"""

import os
import sys
from dotenv import load_dotenv

# Load .env vars
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

print("=" * 70)
print("SUPABASE CONNECTION TEST")
print("=" * 70)
print(f"\nEnvironment Variables:")
print(f"  SUPABASE_URL:  {'✓' if SUPABASE_URL else '✗'} {SUPABASE_URL[:40] if SUPABASE_URL else 'NOT SET'}...")
print(f"  SUPABASE_KEY:  {'✓' if SUPABASE_KEY else '✗'} {SUPABASE_KEY[:20] if SUPABASE_KEY else 'NOT SET'}...")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("\n✗ CRITICAL: SUPABASE_URL and SUPABASE_KEY must be set in .env")
    sys.exit(1)

print("\n" + "-" * 70)
print("Attempting to initialize Supabase client...")
print("-" * 70)

try:
    # Adjust sys.path to allow imports from within backend
    sys.path.insert(0, os.getcwd())
    from database.supabase_client import get_supabase_client
    client = get_supabase_client()
    print("✓ Supabase client initialized successfully")
except Exception as e:
    print(f"✗ Failed to initialize Supabase client: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

print("\n" + "-" * 70)
print("Testing geo_players table query...")
print("-" * 70)

try:
    from database.geo_repo import get_geo_players
    players = get_geo_players()
    print(f"✓ Successfully fetched geo_players table")
    print(f"  Total rows: {len(players)}")
    if players:
        print(f"\n  First 3 rows:")
        for i, p in enumerate(players[:3], 1):
            print(f"    {i}. {p}")
    else:
        print("  ⚠ Table exists but is empty")
except Exception as e:
    print(f"✗ Failed to fetch geo_players: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

print("\n" + "-" * 70)
print("Testing geo_repo.get_games() query...")
print("-" * 70)

try:
    from database.geo_repo import get_games
    games = get_games()
    print(f"✓ Successfully fetched games table")
    print(f"  Total rows: {len(games)}")
    if games:
        print(f"\n  First 2 rows:")
        for i, g in enumerate(games[:2], 1):
            print(f"    {i}. {g}")
    else:
        print("  ⚠ Table exists but is empty")
except Exception as e:
    print(f"✗ Failed to fetch games: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

print("\n" + "=" * 70)
print("✓ ALL TESTS PASSED - Supabase connection is working!")
print("=" * 70)
print("\nYou can now start the Flask app: python app.py")
print()
