# betGSIS Frontend

A modern React + TypeScript sportsbook odds and pricing platform with a Bloomberg terminal aesthetic.

## 🎨 Design Philosophy

- **Bloomberg Terminal Aesthetic**: Black background (#0A0A0A) with neon green accents (#00FF84)
- **Monospace Typography**: JetBrains Mono for headers and codes, Inter for body text
- **Smooth Animations**: Fade-in, slide-in, neon glow, pulse effects on all interactive elements
- **Responsive Design**: Works seamlessly on desktop, tablet, and mobile

## 📁 Project Structure

```
frontend/src/
├── components/              # Reusable React components
│   ├── Auth/               # Authentication components
│   │   └── LoginForm.tsx   # Login form with mock auth
│   ├── Dashboard/          # Dashboard-specific components
│   │   └── QuoteBanner.tsx # Landing page banner (Boobalan quote)
│   ├── GeoGuessr/          # GeoGuessr page components
│   │   ├── BetSlip.tsx     # Bet placement interface
│   │   ├── OddsTable.tsx   # Odds display grid
│   │   └── ThresholdSelector.tsx # Threshold selection UI
│   ├── Layout/             # Layout components
│   │   ├── Navbar.tsx      # Top navigation bar
│   │   └── Footer.tsx      # Footer component
│   └── Shared/             # Shared reusable components
│       ├── Badge.tsx       # Badge component
│       ├── Button.tsx      # Button component with variants
│       ├── Card.tsx        # Card container
│       ├── Input.tsx       # Form input component
│       ├── Modal.tsx       # Modal dialog
│       ├── Table.tsx       # Data table
│       ├── Toast.tsx       # Toast notification
│       └── ToastContainer.tsx # Toast notification container
├── pages/                  # Page-level components (routes)
│   ├── Dashboard.tsx       # Dashboard with P&L stats
│   ├── GeoGuessr.tsx       # GeoGuessr betting interface
│   ├── Login.tsx           # Login page
│   ├── Bets.tsx            # Bets history page
│   └── Profile.tsx         # User profile page
├── lib/                    # Utility libraries
│   ├── api/mockApi.ts      # Mock API layer with all endpoints
│   ├── format.ts           # Formatting utilities
│   └── state/              # Zustand state management stores
│       ├── authStore.ts    # Authentication state
│       ├── betsStore.ts    # Bets and selections state
│       └── uiStore.ts      # UI state (toasts, modals)
├── styles/                 # Global styles
│   ├── theme.ts           # Theme tokens
│   └── index.css          # Global CSS with animations
├── App.tsx                # Main app component with routing
├── main.tsx               # React entry point
└── vite-env.d.ts          # Vite type definitions
```

## 🚀 Features

### Core Features
- **🔐 Authentication**: Mock login with Zustand state management
- **📊 Dashboard**: Real-time P&L summary, bet statistics, recent bets
- **🎲 GeoGuessr Odds**: Browse player odds at multiple thresholds (7500-23000)
- **💰 Bet Placement**: Select odds, set stakes, calculate payouts in real-time
- **📈 Analytics**: Win rate tracking, P&L calculations
- **🎨 Bloomberg Theme**: Professional dark mode with neon green accents
- **📱 Responsive**: Full mobile, tablet, and desktop support

### UI Components
- **Button**: Primary, secondary, danger variants
- **Card**: Default, interactive, elevated variants
- **Input**: Text inputs with labels and errors
- **Modal**: Dialog boxes
- **Toast**: Success, error, info, warning notifications
- **Badge**: Status indicators and tags
- **Table**: Flexible data table
- **Navbar**: Sticky navigation with P&L display
- **Footer**: Static footer with links

## 🔌 Mock API

All endpoints in `lib/api/mockApi.ts`:

```typescript
fetchPlayers()                    // Get all available players
fetchPlayerHistory(playerId)      // Get historical points
fetchThresholds()                 // Get all thresholds (7500-23000)
fetchOddsLines(threshold)         // Get odds at threshold
placeBet(selections, stake)       // Place a bet
fetchRecentBets(limit)            // Get recent bets
fetchPnLSummary()                 // Get P&L statistics
uploadCSV(file)                   // Upload and parse CSV
```

## 🎯 State Management (Zustand)

### authStore
- `isAuthenticated`: boolean
- `login(email, password)`: Authenticate
- `logout()`: Clear authentication

### betsStore
- `selections`: Array of selected bets
- `addSelection(bet)`: Add bet to slip
- `removeSelection(id)`: Remove bet
- `updateStake(id, stake)`: Update stake
- `placeBet(bet)`: Place bet

### uiStore
- `toasts`: Array of notifications
- `addToast(toast)`: Show notification
- `removeToast(id)`: Hide notification

## 🎨 Colors & Theming

- **Background**: #0A0A0A
- **Accent (Green)**: #00FF84
- **Text Primary**: #F0F0F0
- **Border**: #1A1A1A

## 📦 Dependencies

```json
{
  "react": "^18.2.0",
  "react-dom": "^18.2.0",
  "react-router-dom": "^6.8.0",
  "zustand": "^4.3.0"
}
```

## 🚀 Getting Started

### 1. Install Dependencies
```bash
cd frontend
npm install
```

### 2. Start Development Server
```bash
npm run dev
```
Available at `http://localhost:5173`

### 3. Build for Production
```bash
npm run build
```

## 🔑 Default Credentials

Mock auth (any credentials work):
- Email: `user@example.com`
- Password: `password`

## 📋 Routes

| Route | Page | Auth Required |
|-------|------|---------------|
| `/` | Landing (QuoteBanner) | No |
| `/login` | Login Form | No |
| `/dashboard` | Dashboard | Yes |
| `/geoguessr` | Odds & Betting | Yes |
| `/bets` | Bet History | Yes |
| `/profile` | User Settings | Yes |

## 📖 Environment Variables

Create `.env` in frontend directory:
```
VITE_API_URL=http://localhost:4000
```

---

**Built with ❤️ for betGSIS** | Bloomberg Terminal Aesthetic
