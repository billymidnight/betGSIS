# P&L Calculation Discrepancy Analysis

## Executive Summary
**CRITICAL DISCREPANCY FOUND**: The Navbar and Portfolio page calculate P&L differently, leading to inconsistent values displayed to users.

---

## The Discrepancy

### 1. **Case Sensitivity in Result Status**

**Navbar (Frontend - Lines 64-73):**
```typescript
const status = (b.result ?? '').toString().toLowerCase();  // ← CONVERTS TO LOWERCASE
let profit = 0;
if (status === 'win') {        // ← checks lowercase 'win'
  if (dec && !Number.isNaN(Number(dec))) profit = stake * (Number(dec) - 1.0);
  else profit = 0;
} else if (status === 'loss') { // ← checks lowercase 'loss'
  profit = -stake;
} else {
  profit = 0;  // pending / other -> ignore
}
```

**Portfolio Endpoint (Backend - Lines 1677-1690):**
```python
rr = str(result).strip()  # ← NO CASE CONVERSION
if rr == 'Loss':          # ← checks EXACT string 'Loss' (capital L)
    pnl = -stake
elif rr == 'Win':         # ← checks EXACT string 'Win' (capital W)
    payout = stake * dec
    pnl = payout - stake
elif rr == 'Push':        # ← checks EXACT string 'Push' (capital P)
    pnl = 0.0
```

**Impact**: If the database stores results as `'win'`, `'loss'`, `'push'` (lowercase), the Portfolio endpoint will NOT match them and default to `pnl = 0.0`, while Navbar correctly calculates the P&L.

**Database Evidence** (from `/bets/settle` endpoint - Lines 1842-1843):
```python
# Map internal result tokens to canonical DB values (DB enforces 'Win'|'Loss'|'Push')
result_map = {'win': 'Win', 'loss': 'Loss', 'push': 'Push'}
db_result = result_map.get(result)
```

This suggests the DB **should** store capitalized values (`'Win'`, `'Loss'`, `'Push'`), but if any bets were settled through other means or older code, they may have lowercase values.

---

### 2. **Inclusion of Pending Bets**

**Navbar (Frontend - Lines 64-76):**
```typescript
if (status === 'win') {
  // ... calculate profit
} else if (status === 'loss') {
  profit = -stake;
} else {
  // pending / other -> ignore
  profit = 0;  // ← Pending bets contribute 0 to P&L
}
total += Number(profit || 0);  // ← ALL bets summed (including pending with profit=0)
```

**Portfolio Endpoint (Backend - Lines 1638-1648):**
```python
settled = []
for row in rows:
    result = row.get('result')
    if result is None:
        continue  # ← SKIPS PENDING BETS ENTIRELY
    # ... only settled bets added to `settled` list
```

Then later (Line 1713):
```python
net_pnl = sum(p.get('pnl', 0.0) for p in settled)  # ← Only settled bets
```

**Impact**: While both exclude pending bets from P&L calculation (Navbar adds 0, Portfolio skips), the Navbar fetches ALL bets via `/bets/my` (Line 231 in api.ts), while Portfolio only processes settled bets. This shouldn't cause numerical differences but could cause confusion if the bet lists differ.

---

### 3. **P&L Formula Differences (Minor)**

**Navbar Win Calculation (Line 67):**
```typescript
profit = stake * (Number(dec) - 1.0);  // ← dec is decimal odds
```

**Portfolio Win Calculation (Lines 1685-1687):**
```python
payout = stake * dec  # ← dec is decimal odds
pnl = payout - stake
```

**Math Equivalence**:
- Navbar: `stake * (dec - 1.0)` = `stake * dec - stake * 1.0` = `stake * dec - stake`
- Portfolio: `payout - stake` = `stake * dec - stake`

**Conclusion**: These are mathematically identical. No discrepancy here.

---

### 4. **Decimal Odds Conversion Robustness**

**Navbar (Lines 54-63):**
```typescript
let dec = null;
if (b.odds_decimal || b.odds_decimal === 0) dec = Number(b.odds_decimal);
else if (b.decimal_odds || b.odds_decimal) dec = Number(b.decimal_odds || b.odds_decimal);
else if (b.odds_american || b.odds) {
  // parse american like '+480' or '-150'
  const raw = String(b.odds_american ?? b.odds ?? '');
  const num = parseInt(raw.replace('+', ''), 10);
  if (!Number.isNaN(num)) dec = americanToDecimal(num);
}
```

**Portfolio (Lines 1664-1673):**
```python
a_raw = row.get('odds_american') or row.get('odds') or None
if a_raw is None:
    pnl = 0.0
    settled.append(...)
    continue  # ← Skips bet if no odds_american field
a_int = None
try:
    s = str(a_raw).strip()
    # remove '+' prefix if present
    a_int = int(s.replace('+', ''))
except Exception:
    pnl = 0.0
    settled.append(...)
    continue  # ← Skips bet if can't parse american odds
```

**Impact**: 
- Navbar tries 3 different field names (`odds_decimal`, `decimal_odds`, `odds_american`) and falls back to 0 profit if none exist
- Portfolio **only** looks for `odds_american` or `odds`, and skips the bet entirely if missing

If bets have `odds_decimal` but not `odds_american`, Portfolio will skip them (contributing 0 to P&L), while Navbar will use the decimal odds directly and calculate P&L correctly.

---

## Root Causes Summary

| Issue | Navbar Behavior | Portfolio Behavior | Impact |
|-------|----------------|-------------------|---------|
| **Case Sensitivity** | Converts to lowercase: `'win'`, `'loss'`, `'push'` | Exact match: `'Win'`, `'Loss'`, `'Push'` | **HIGH**: Mismatched results default to 0 in Portfolio |
| **Pending Bets** | Adds 0 to total | Skips entirely | **LOW**: Both exclude from P&L |
| **Odds Field Names** | Tries `odds_decimal`, `decimal_odds`, `odds_american` | **Only** tries `odds_american`, `odds` | **MEDIUM**: Bets with only decimal odds excluded from Portfolio |
| **Missing Odds Handling** | Calculates 0 profit, includes bet | Skips bet entirely | **LOW**: Both result in 0 P&L contribution |

---

## Most Likely Culprit

**The case sensitivity issue is almost certainly the primary discrepancy.** 

If the database contains result values like:
- `'win'` (lowercase)
- `'loss'` (lowercase)  
- `'push'` (lowercase)

Then:
- **Navbar**: Correctly calculates P&L (converts to lowercase for comparison)
- **Portfolio**: Fails to match, defaults all bets to `pnl = 0.0`

### Evidence Supporting This Theory:

1. The `/bets/settle` endpoint (Lines 1842-1843) **maps** lowercase input to capitalized DB values, suggesting older code or manual DB entries may have used lowercase
2. The Portfolio endpoint has **no case normalization** before comparison (Line 1679)
3. The Navbar explicitly converts to lowercase (Line 64)

---

## Secondary Issue: Odds Field Inconsistency

If some bets have `odds_decimal` but not `odds_american`:
- **Navbar**: Uses `odds_decimal` directly → calculates P&L
- **Portfolio**: Skips bet (no `odds_american` found) → P&L = 0

This would cause Portfolio to show a **lower** P&L than Navbar.

---

## Recommended Verification Steps (DO NOT FIX YET)

1. **Check actual data in bets table**:
   ```sql
   SELECT DISTINCT result FROM bets WHERE result IS NOT NULL;
   ```
   - If you see lowercase values (`'win'`, `'loss'`, `'push'`), that's the smoking gun

2. **Check odds field population**:
   ```sql
   SELECT 
     COUNT(*) as total_settled,
     COUNT(odds_american) as has_odds_american,
     COUNT(odds_decimal) as has_odds_decimal
   FROM bets 
   WHERE result IS NOT NULL;
   ```
   - If `has_odds_american` < `total_settled`, Portfolio is skipping bets

3. **Test with a sample user**:
   - Compare `/api/portfolio` response to `/bets/my` response
   - Manually calculate P&L from `/bets/my` data using Navbar logic
   - See which matches the user's actual experience

---

## End of Analysis

**DO NOT FIX YET** per user instruction. This analysis identifies:
1. **Primary discrepancy**: Case sensitivity in result status matching
2. **Secondary discrepancy**: Odds field name differences
3. **Verification steps** to confirm which issue is causing the user-visible problem
