# GS POKER — Good Shepherd Poker
## Complete Game Specification v2

---

## 1. OVERVIEW

GS Poker is a custom poker variant played with the 16-card Good Shepherd trading card deck. It combines NLH-style betting mechanics with a completely original hand ranking system derived from student attributes: **sport** (pairing), **house** (flushes), **height** (tiebreaking), and **was_404** (the ultimate hand).

- **Deck size:** 16 cards (from `goodshepherd_trading` table)
- **Players:** 3-4 per table
- **Hand size:** 4 cards total (2 hole + 2 community)
- **Streets:** 3 (Pre-flop, Flop, Final Card)
- **Game mode:** Cash game (tournament later)
- **Host:** BOOKIE role only
- **Players:** betGSIS registered users (multiplayer, each on own device)

---

## 2. THE DECK — Card Anatomy

Each card is a Good Shepherd student with these game-critical attributes:

| Attribute | Poker Analogy | Role in GS Poker |
|-----------|---------------|------------------|
| **Sport** (text) | Card Value (2-A) | Determines pairs, trips, quads |
| **House** (Spring/Summer/Autumn/Winter) | Suit | Determines flushes |
| **Height** (numeric, cm) | Kicker rank | **Universal tiebreaker** — always the final decider |
| **was_404** (boolean) | Royal flush flag | All 4 true = "The 404" (unbeatable) |
| **year_joined** (integer) | Sequential value | Determines straights (4 consecutive years) |
| **Name** | Card face | Display on card |
| **Roll Number** | Jersey number | Display on card |
| **img_filename** | Card art | Card image |

### Card Visual Layout (Top to Bottom)

```
┌──────────────────────────┐
│ F        #42        🟢   │  ← Sport letter | Roll# | House color dot
│                          │
│                          │
│       [STUDENT           │
│        PHOTO]            │  ← img from DB
│                          │
│                          │
│     Rahul Sharma         │  ← Name from DB
│                          │
│  📏 172cm    404: ✓      │  ← Height | was_404 (tick/cross)
│                          │
│      JOINED 2013         │  ← year_joined
└──────────────────────────┘
```

- **Top-left:** First letter of sport (F=Football, B=Basketball, C=Cricket, H=Hockey, etc.)
- **Top-center:** `#` + roll_number
- **Top-right:** House color dot (Spring=🟢, Summer=🟡, Autumn=🔴, Winter=🔵)
- **Center:** Student photo (same dimensions as current trading game)
- **Below photo:** Student name (clean font, centered)
- **Stats row:** Height in cm + was_404 tick/cross (side by side)
- **Bottom:** "JOINED" + year_joined integer (centered, prominent)
- **Face-down:** Same facedown.png as current Good Shepherd trading game

---

## 3. HAND RANKINGS (Worst to Best)

| Rank | Name | Description | Odds | Tiebreaker |
|------|------|-------------|------|------------|
| 1 | **High Card** | No matching sports, no flush, no straight, no 404 | ~0.15 | Tallest card height, then 2nd, 3rd, 4th |
| 2 | **One Pair** | 2 cards same sport | ~0.487 | Max height of paired cards → other pair card → kickers by height |
| 3 | **Trips** | 3 cards same sport | ~0.23 | Max height among trips → 2nd → 3rd → kicker |
| 4 | **Boat (2-Pair)** | 2 distinct sports, each appearing exactly 2x (e.g., FF+BB) | ~0.115 | max(max_height_pair_1, max_height_pair_2) → next → next → next |
| 5 | **Quads** | All 4 cards same sport | ~0.0217 | Tallest → 2nd → 3rd → 4th |
| 6 | **Flush** | All 4 cards same house | ~0.00879 | Tallest → 2nd → 3rd → 4th |
| 7 | **Straight** | 4 consecutive year_joined values (e.g., 2012-2013-2014-2015) | ~0.06 | Higher ending year wins → if same, tallest card |
| 8 | **The 404** | All 4 cards have was_404 = true | ~0.0027 | Tallest → 2nd → 3rd → 4th |

### Key Rules:
- **The 404 is checked FIRST** — it trumps everything, always
- A hand CAN be both a flush + pair/trips (e.g., all Spring and 2 share Football) — play the flush since it's higher
- A hand CANNOT be both a straight and a flush (confirmed)
- Height is ALWAYS the final tiebreaker at every rank level
- Straight tiebreaker: highest ending year_joined wins first, then tallest card

### Hand Evaluation Order:
```
1. The 404?  → all 4 was_404 == true
2. Straight? → 4 consecutive year_joined
3. Flush?    → all 4 same house
4. Quads?    → all 4 same sport
5. Boat?     → exactly 2 sports, each 2x
6. Trips?    → exactly 1 sport 3x
7. Pair?     → exactly 1 sport 2x
8. High Card → fallback
```

---

## 4. DEALING STRUCTURE

### 3-Player Game
- 6 cards dealt as hole cards (2 per player)
- 2 community cards (revealed across streets)
- 8 cards used, 8 unused (dead cards)

### 4-Player Game
- 8 cards dealt as hole cards (2 per player)
- 2 community cards
- 10 cards used, 6 unused

### No Burn Cards
- Digital deck — shuffle once, deal sequentially, no burns needed

### Each Player's Final Hand
- Exactly their 2 hole cards + the 2 community cards = 4 cards
- **No selection** — you play all 4. No "best X of Y."

---

## 5. BETTING STREETS

### Positions

**3-handed:** SB, BB, BTN (BTN = UTG pre-flop, acts first pre, last post)
**4-handed:** SB, BB, UTG, BTN

### Street 1: PRE-FLOP
- Hole cards dealt (2 per player, face-down, only visible to owner)
- No community cards visible
- Action: UTG first (left of BB), clockwise
- Options: Fold, Call, Raise (min raise = 1 BB, max = all-in)
- BB can check or raise if no raise before them

### Street 2: FLOP (1 Community Card)
- 1st community card revealed face-up
- Players see 3 of their 4 final cards
- Action: SB first (first active player left of BTN), clockwise
- Options: Check, Bet (min = 1 BB), Raise, Fold, All-in

### Street 3: FINAL CARD (The River)
- 2nd community card revealed face-up
- Players see all 4 final cards — hand is complete
- Final betting round, same action order as flop
- After action closes → showdown (if 2+ players remain)

### Showdown
- All remaining players' cards revealed
- Hand rank + rank name displayed clearly for each player (learning curve)
- Winner determined by ranking → tiebreaker
- Pot awarded to winner
- **Game pauses infinitely** at showdown until host (BOOKIE) clicks "Next Hand"

### Early Win (Fold-out)
- If all but one player fold at any point → remaining player wins pot
- No showdown, no card reveal needed

---

## 6. BETTING RULES (NLH-Standard)

- **No-Limit:** Any player can bet up to their entire stack at any time
- **Min bet:** 1 BB
- **Min raise:** Must be at least the size of the previous raise
  - Example: BB=10, UTG raises to 30 (raise of 20), next player must raise to at least 50
- **All-in:** Allowed at any time for any amount ≤ stack
- **Side pots:** Created when a short-stacked player is all-in and others continue
- **Re-raises:** Unlimited per street (no cap)
- **No timer (v1):** Players have infinite time to act, host can nudge verbally

---

## 7. SESSION & TABLE STRUCTURE

### Creating a Table (BOOKIE only)
- Table name
- Starting stack (e.g., 100, 200, 500)
- Small blind / Big blind (e.g., 1/2, 5/10)
- Max players: 3 or 4

### Game Flow
1. Host (BOOKIE) creates table with settings
2. Players join (lobby phase, similar to parimutuel)
3. Host clicks "Start Game"
4. Dealer button assigned randomly for hand #1
5. Blinds posted, hole cards dealt
6. Play 3 streets
7. Showdown → hand result displayed with ranks
8. **Host clicks "Next Hand"** to continue (infinite pause)
9. Button rotates clockwise
10. Repeat from step 5
11. Players can "Stand Up" (leave with current stack, P&L recorded)
12. Host can "End Session" → all P&L written to bets table (like parimutuel conclude)

### Cash Game Rules
- Buy-in = starting_stack (everyone starts equal)
- No re-buys (v1 — keep it simple)
- Player leaves → seat empty, game continues if 2+ remain (or 3+ for min)
- Net P&L = final_stack - starting_stack

---

## 8. REAL-TIME SYNC ARCHITECTURE

### The Challenge
4 players need to see the same game state in real-time. Each action (bet, fold, raise) must propagate instantly. This is harder than parimutuel because:
- Parimutuel: players submit independently, host controls flow
- Poker: strict turn order, each action changes what others see/can do

### Solution: Server-Authoritative State + Supabase Realtime + Polling Hybrid

**Same proven pattern as parimutuel, but tighter polling interval:**

1. **Single source of truth:** All game state lives in Supabase tables
   - `gs_poker_hands` row = current hand state (street, pot, community cards, whose turn, etc.)
   - `gs_poker_actions` = action log (append-only)
   - `gs_poker_seats` = player stacks, hole cards, status (active/folded/all-in)

2. **Server-authoritative actions:**
   - Player clicks "Raise 50" → POST to backend
   - Backend validates (is it their turn? enough chips? legal raise size?)
   - Backend updates DB state (pot, stack, next player, etc.)
   - Returns success

3. **Client sync (dual mechanism — same as parimutuel):**
   - **Supabase Realtime:** Subscribe to `gs_poker_hands` and `gs_poker_actions` changes → instant refresh
   - **Polling fallback:** Poll every 1-2 seconds (tighter than parimutuel's 4s) for guaranteed freshness
   - Sequence guards to prevent stale overwrites (same pattern as parimutuel)

4. **Hole card security:**
   - Backend NEVER returns other players' hole cards until showdown
   - Session detail endpoint filters: you see YOUR hole cards + community + stacks + pot + action log
   - At showdown: backend releases all active players' hole cards

5. **Turn enforcement:**
   - Backend tracks `current_actor` (user_id of whose turn it is)
   - Action endpoint rejects if `request.user != current_actor`
   - Frontend greys out action buttons when it's not your turn

### Why This Works (No WebSocket Server Needed)
- Supabase Realtime already provides WebSocket pub/sub on table changes
- We're already using it successfully for parimutuel
- 1-2s polling as fallback means worst case latency is 2s
- For a friend group playing in person, this is more than fast enough
- No separate WebSocket server to deploy/maintain

### Performance
- Each action = 1 POST + 1-2 DB writes (action log + hand state update)
- Each poll = 1 GET (hand detail with joins)
- 4 players polling every 1.5s = ~2.7 requests/sec total — trivial load
- Supabase Realtime handles the instant-feel layer on top

---

## 9. GAME STATE MODEL

### What the server tracks per hand:
```
{
  hand_id, table_id, hand_number,
  street: "preflop" | "flop" | "river" | "showdown",
  pot: number,
  community_cards: [card_id, card_id],  // revealed progressively
  community_revealed: 0 | 1 | 2,
  current_actor: user_id,
  dealer_seat: number,
  current_bet: number,          // current bet to call
  min_raise: number,            // minimum raise amount
  last_raiser: user_id | null,
  deck_order: [card_id x 16],  // shuffled deck (server-only, never sent to client)
  status: "playing" | "showdown" | "complete"
}
```

### What the server tracks per seat:
```
{
  seat_number, user_id, screenname, avatar_url,
  stack: number,
  hole_cards: [card_id, card_id],  // only sent to the owning player
  status: "active" | "folded" | "all_in",
  current_street_bet: number,      // how much they've put in this street
  total_hand_bet: number,          // total invested this hand
}
```

### What each client receives:
- Their own hole cards (always)
- Community cards (as revealed)
- All players' stack sizes, statuses, seat positions
- Pot size, current bet, min raise
- Whose turn it is
- Action history for this hand
- Other players' hole cards: ONLY at showdown for non-folded players

---

## 10. HELP PAGE — Hand Rankings Chart

Displayed on the GS Poker landing page. Clean, visual reference:

| Rank | Hand | Description | Example | Odds |
|------|------|-------------|---------|------|
| 8 | **THE 404** | All 4 cards are was_404 students | 🔥🔥🔥🔥 | 0.27% |
| 7 | **Straight** | 4 consecutive year_joined | 2012→2013→2014→2015 | 6% |
| 6 | **Flush** | All 4 cards same house | 🟢🟢🟢🟢 (all Spring) | 0.88% |
| 5 | **Quads** | All 4 cards same sport | FFFF (all Football) | 2.17% |
| 4 | **Boat** | Two pairs of sports | FF + BB | 11.5% |
| 3 | **Trips** | 3 cards same sport | FFF + B | 23% |
| 2 | **One Pair** | 2 cards same sport | FF + B + C | 48.7% |
| 1 | **High Card** | Nothing matches | F + B + C + H | ~15% |

**Tiebreaker:** Always height (cm). Tallest card wins. Compare descending until broken.

---

## 11. P&L INTEGRATION

When host ends session (same as parimutuel conclude):
- Calculate net P&L per player: `final_stack - starting_stack`
- Write to `bets` table:
  - `market`: "GS Poker"
  - `outcome`: session name
  - `bet_size`: abs(net)
  - `result`: Win/Loss/Push
  - `odds_american`: "+100"
  - `game_id`: 0
  - `layeur`: "betgsis"
- Integrated into portfolio, My Bets, bet ticker, everything
