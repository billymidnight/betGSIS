# Sopranos Trading Game - Quick Start

## What's Been Added

### Backend (`backend/routes/trading.py`)
- **GET `/api/trading/sopranos/characters`** - Get all characters
- **POST `/api/trading/sopranos/draw`** - Draw 3 random characters
- **POST `/api/trading/sopranos/markets`** - Get odds for current markets
- **POST `/api/trading/sopranos/settle`** - Settle bets and calculate P&L
- **GET `/api/trading/sopranos/stats`** - Get user session stats

### Markets Implemented
1. **All Married** - All 3 cards are married characters
2. **No Bosses** - No Tony, Junior, or Carmine Sr.
3. **All Men** - All 3 cards are male

### Frontend
- **Trading landing page** (`/trading`) - Game selector
- **Sopranos Trading** (`/trading/sopranos`) - Full game interface
- **Card Component** - Sexy cards with character photos and stats
- **Betting UI** - 2-minute timer, real-time odds, bet placement
- **Session Management** - Bankroll selection ($25, $50, $100, $200)

## How to Run

### 1. Start Backend
```bash
cd backend
python app.py
```

### 2. Start Frontend
```bash
cd frontend
npm run dev
```

### 3. Navigate to Trading
- Go to http://localhost:5173
- Click "Trading Games" in the left sidebar
- Click "The Sopranos" card
- Select your bankroll and start trading!

## Game Flow

1. **Select Bankroll** - Choose $25, $50, $100, or $200
2. **3 Cards Face Down** - Random characters hidden
3. **2-Minute Timer Starts** - Place bets on markets
4. **Markets Display** - Odds calculated with 8% vig
5. **Place Bets** - Enter amount and click "Place"
6. **Submit or Wait** - Click SUBMIT or wait for timer
7. **Cards Reveal** - See the characters
8. **Settlement** - Winners paid, losers deducted
9. **Next Draw** - Continue or end session
10. **Final P&L** - Synthetic bet created for tracking

## Card Design

Each card shows:
- **Character Photo** (top)
- **Name** (bold, centered)
- **Stats Grid**:
  - Gender | Age (S3)
  - Crew | Married (S3)
  - Position (if applicable)

## Character Images

Images should be in: `backend/sopranos/`
- Format: `name.jpg` (e.g., `soprano_tony.jpg`)
- 23 characters currently loaded
- Fallback to placeholder if image missing

## Next Steps

### More Markets to Add:
- All Captains
- All Survived Series
- All From Same Crew
- Tony Present/Absent
- Mixed Gender
- Age Range Markets
- Death Season Markets
- Family vs Civilians

### Enhancements:
- Sound effects for wins/losses
- Animated card flips
- Session history tracking
- Leaderboard
- More sophisticated odds calculation
- Kelly Criterion betting suggestions
- Market depth/liquidity indicators

## Database

Uses existing `sopranos_trading` table with 23 characters.

Session P&L will be tracked via synthetic bets in the main `bets` table with:
- `sport`: "Sopranos Trading"
- `market`: "Session P&L"
- `stake`: abs(P&L)
- `odds`: +100
- `result`: "won" or "lost"

## Notes

- Odds calculated using combinatorial probability
- 8% vigorish applied to all markets
- Decimal odds converted to American format
- Balance updates in real-time
- Can't bet more than current balance
- Session ends when busted or user clicks "End Session"
