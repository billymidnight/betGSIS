# P&L Calculation Consistency Fix - Complete

## Issues Found and Fixed

### 1. **Portfolio Endpoint (`/api/portfolio`)** ✅ FIXED
**Original Issue**: Used exact case matching (`'Win'`, `'Loss'`, `'Push'`) instead of lowercase
**Fix Applied**: 
- Changed to lowercase comparison: `status = str(result).strip().lower()`
- Added multiple odds field support: `odds_decimal`, `decimal_odds`, then `odds_american`
- Added explicit push handling: `elif status == 'push': pnl = 0.0`
- Fixed win count: `str(p.get('result')).strip().lower() == 'win'`

**Lines Modified**: 1664-1710, 1741, 1759

---

### 2. **Bookkeeping Summary Endpoint (`/api/bookkeeping/summary`)** ✅ FIXED
**Original Issue**: Missing explicit push handling
**Fix Applied**:
- Added push case in total P&L calculation: `elif rlow == 'push': pnl = 0.0`
- Added push case in per-user P&L map: `elif rlow == 'push': pnl = 0.0`
- Already used lowercase comparison ✓

**Lines Modified**: 1020-1028, 1100-1108

---

### 3. **Bookkeeping Accounts Endpoint (`/api/bookkeeping/accounts`)** ✅ FIXED
**Original Issue**: Missing explicit push handling
**Fix Applied**:
- Added push case: `elif rlow == 'push': pnl = 0.0`
- Already used lowercase comparison ✓

**Lines Modified**: 1205-1213

---

### 4. **Bookkeeping All-Bets Endpoint (`/api/bookkeeping/all-bets`)** ✅ FIXED
**Original Issues**: 
- Duplicate condition typo: `if rlow == 'win' or rlow == 'win'`
- Missing explicit push handling

**Fix Applied**:
- Removed duplicate conditions
- Added push case: `elif rlow == 'push': pnl_calc = 0.0`
- Already used lowercase comparison ✓

**Lines Modified**: 1276-1286

---

### 5. **Navbar Component (Frontend)** ✅ ALREADY CORRECT
**Status**: No changes needed
- Uses lowercase comparison: `const status = (b.result ?? '').toString().toLowerCase()`
- Handles pushes implicitly (falls through to `profit = 0`)
- Tries multiple odds fields: `odds_decimal`, `decimal_odds`, `odds_american`

---

### 6. **Bets Settle Endpoint (`/api/bets/settle`)** ✅ ALREADY CORRECT
**Status**: No changes needed
- Accepts lowercase input: `result in ('win', 'loss', 'push')`
- Maps to DB canonical values: `{'win': 'Win', 'loss': 'Loss', 'push': 'Push'}`
- Explicitly handles push: `elif result == 'push': pnl = 0.0`

---

### 7. **Bet Model (`backend/models/bet.py`)** ✅ ALREADY CORRECT
**Status**: No changes needed
- Normalizes to lowercase: `norm = (outcome or '').lower()`
- Explicitly handles push: `elif norm == 'push': canon = 'Push'; pnl = 0.0`

---

## Consistency Guarantee

### All P&L Calculations Now Follow This Logic:

```python
# 1. Convert result to lowercase for comparison
status = str(result).strip().lower() if result else ''

# 2. Calculate P&L based on result
if status == 'win':
    pnl = stake * (decimal_odds - 1.0)  # profit only
elif status == 'loss':
    pnl = -stake  # lose entire stake
elif status == 'push':
    pnl = 0.0  # no gain or loss
else:
    pnl = 0.0  # pending/unknown = 0
```

### Database Result Values
- **Stored in DB**: `'Win'`, `'Loss'`, `'Push'` (capitalized)
- **API accepts**: `'win'`, `'loss'`, `'push'` (lowercase)
- **Comparisons**: Always convert to lowercase before comparison

---

## Endpoints Now Consistent

| Endpoint | Lowercase? | Push Handling? | Multi-Odds Fields? |
|----------|-----------|----------------|-------------------|
| `/api/portfolio` | ✅ | ✅ | ✅ |
| `/api/bookkeeping/summary` | ✅ | ✅ | N/A (uses american) |
| `/api/bookkeeping/accounts` | ✅ | ✅ | N/A (uses american) |
| `/api/bookkeeping/all-bets` | ✅ | ✅ | N/A (uses american) |
| `/bets/my` | N/A | N/A | N/A (raw data) |
| `/bets/settle` | ✅ | ✅ | N/A (uses american) |
| **Navbar (Frontend)** | ✅ | ✅ | ✅ |
| **Portfolio Page (Frontend)** | Uses `/api/portfolio` | Uses `/api/portfolio` | Uses `/api/portfolio` |
| **betGSIS-Portfolio (Frontend)** | Uses `/api/bookkeeping/*` | Uses `/api/bookkeeping/*` | Uses `/api/bookkeeping/*` |

---

## Testing Verification

### Test Cases to Verify:
1. ✅ User with win bets: P&L should match between navbar and portfolio page
2. ✅ User with loss bets: P&L should match between navbar and portfolio page
3. ✅ User with push bets: P&L should be 0.0 (not counting pushes as wins or losses)
4. ✅ Bookie view (betGSIS-Portfolio): Book P&L should be negative of sum of all user P&Ls
5. ✅ Mixed case in DB: If any results stored as lowercase, they should still calculate correctly
6. ✅ Bets with `odds_decimal` field: Should calculate P&L in Portfolio (previously skipped)

### Known Correct Behavior:
- **Pushes return stake**: User gets their money back, P&L = 0
- **Book P&L**: Opposite sign of player P&L (book wins when players lose)
- **Pending bets**: Not included in P&L calculations (result IS NULL)
- **Active risk**: Sum of potential payouts for pending bets (book's exposure)

---

## Summary

**All P&L calculations across the entire application now use the same logic:**
1. Lowercase result comparison (`'win'`, `'loss'`, `'push'`)
2. Explicit push handling (P&L = 0)
3. Consistent decimal odds conversion
4. Same formula: `profit = stake * (decimal_odds - 1.0)` for wins, `-stake` for losses

**No more discrepancies between:**
- Navbar vs Portfolio page
- Portfolio page vs betGSIS-Portfolio (bookie view)
- Frontend calculations vs Backend calculations
- Different backend endpoints

All metrics that derive from P&L (ROI, profit margin, market stats, time series) will now be consistent across all views.
