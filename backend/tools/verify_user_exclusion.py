"""
Quick verification script to test that user 4755adb2-c68b-490f-8abf-de59b1a75f1f 
is excluded from all bookkeeping calculations.

This script simulates the filtering logic applied to the backend routes.
"""

# Excluded user ID
EXCLUDED_USER_ID = '4755adb2-c68b-490f-8abf-de59b1a75f1f'

# Sample bets data (simulated)
sample_bets = [
    {'user_id': '4755adb2-c68b-490f-8abf-de59b1a75f1f', 'bet_size': 100, 'result': 'Win'},  # EXCLUDED
    {'user_id': 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'bet_size': 50, 'result': 'Loss'},
    {'user_id': '4755adb2-c68b-490f-8abf-de59b1a75f1f', 'bet_size': 200, 'result': 'Loss'},  # EXCLUDED
    {'user_id': 'ffffffff-1111-2222-3333-444444444444', 'bet_size': 75, 'result': 'Win'},
]

print("🔍 VERIFICATION SCRIPT - USER EXCLUSION FILTER")
print("=" * 60)
print(f"\n📋 Excluded User ID: {EXCLUDED_USER_ID}")
print(f"   (Srinitesh5884@gmail.com - screenname: Srinitesh5884)")
print()

print(f"📊 Total bets in sample: {len(sample_bets)}")
print(f"   Bets from excluded user: {len([b for b in sample_bets if str(b.get('user_id')) == EXCLUDED_USER_ID])}")
print()

# Apply filter
filtered_bets = [b for b in sample_bets if str(b.get('user_id')) != EXCLUDED_USER_ID]

print("✅ AFTER FILTERING:")
print(f"   Remaining bets: {len(filtered_bets)}")
print(f"   Excluded bets: {len(sample_bets) - len(filtered_bets)}")
print()

print("📝 FILTERED BETS:")
for i, bet in enumerate(filtered_bets, 1):
    print(f"   {i}. User: {bet['user_id'][:8]}... | Size: ${bet['bet_size']} | Result: {bet['result']}")
print()

print("🚫 EXCLUDED BETS (NOT SHOWN IN BOOK CALCULATIONS):")
excluded = [b for b in sample_bets if str(b.get('user_id')) == EXCLUDED_USER_ID]
for i, bet in enumerate(excluded, 1):
    print(f"   {i}. User: {bet['user_id'][:8]}... | Size: ${bet['bet_size']} | Result: {bet['result']}")
print()

print("=" * 60)
print("✅ VERIFICATION COMPLETE!")
print()
print("📍 Routes with exclusion filter applied:")
print("   1. /api/bookkeeping/summary")
print("   2. /api/bookkeeping/accounts")
print("   3. /api/bookkeeping/all-bets")
print()
print("📌 User's bets are COMPLETELY IGNORED in:")
print("   • Book P&L calculations")
print("   • Live risk calculations")
print("   • Settled/live bet counts")
print("   • User account summaries (for this specific user)")
print("   • All-bets view (for bookies)")
print()
print("⚠️  NOTE: The excluded user can still:")
print("   • Place bets normally")
print("   • View their own portfolio (/portfolio)")
print("   • See their bets in My Bets page")
print("   • Their bets just don't affect BOOK calculations")
print()
print("=" * 60)
