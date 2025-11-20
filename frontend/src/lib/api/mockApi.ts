/**
 * Mock API layer for development/testing
 * Simulates backend endpoints with realistic data
 */

export interface Player {
  id: string;
  name: string;
  sport: string;
  team: string;
  position: string;
  recentAverage: number;
}

export interface PlayerPoints {
  playerId: string;
  date: string;
  points: number;
  gameId: string;
}

export interface OddsLine {
  id: string;
  playerId: string;
  playerName: string;
  threshold: number;
  over: {
    odds: number;
    american: string;
  };
  under: {
    odds: number;
    american: string;
  };
  probability: {
    over: number;
    under: number;
  };
}

export interface BetSelection {
  lineId: string;
  playerName: string;
  threshold: number;
  side: 'over' | 'under';
  odds: number;
  americanOdds: string;
}

export interface PlacedBet {
  id: string;
  selections: BetSelection[];
  stake: number;
  potentialPayout: number;
  timestamp: string;
  status: 'pending' | 'won' | 'lost' | 'push';
}

// Mock player data
const MOCK_PLAYERS: Player[] = [
  {
    id: 'player_1',
    name: 'Brad',
    sport: 'NBA',
    team: 'LAL',
    position: 'PG',
    recentAverage: 24.5,
  },
  {
    id: 'player_2',
    name: 'Janice',
    sport: 'NBA',
    team: 'BOS',
    position: 'SG',
    recentAverage: 18.3,
  },
  {
    id: 'player_3',
    name: 'Tony',
    sport: 'NBA',
    team: 'MIA',
    position: 'SF',
    recentAverage: 21.7,
  },
  {
    id: 'player_4',
    name: 'Scorpio',
    sport: 'NBA',
    team: 'NYK',
    position: 'PF',
    recentAverage: 19.2,
  },
  {
    id: 'player_5',
    name: 'Nathan',
    sport: 'NBA',
    team: 'GSW',
    position: 'C',
    recentAverage: 12.8,
  },
];

// Threshold levels: 7500 to 23000 by increments
const THRESHOLDS = [
  7500, 8000, 8500, 9000, 9500, 10000, 10500, 11000, 11500, 12000, 12500, 13000, 13500, 14000,
  14500, 15000, 15500, 16000, 16500, 17000, 17500, 18000, 18500, 19000, 19500, 20000, 20500,
  21000, 21500, 22000, 22500, 23000,
];

// Mock historical points data
const generateMockPointsHistory = (playerId: string): PlayerPoints[] => {
  const points: PlayerPoints[] = [];
  const now = new Date();

  for (let i = 0; i < 30; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    points.push({
      playerId,
      date: date.toISOString().split('T')[0],
      points: Math.floor(Math.random() * 50) + 5,
      gameId: `game_${i}`,
    });
  }

  return points.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};

// Generate mock odds for a player at different thresholds
const generateMockOdds = (player: Player, threshold: number): Omit<OddsLine, 'id'> => {
  const adjustedThreshold = threshold / 2000; // Scale threshold to usable value
  const baseOver = Math.random() * 0.6 + 0.4; // 40-100% over probability
  const under = 1 - baseOver;

  // Convert probability to decimal odds (with 5% margin built in)
  const overOdds = Math.round((1 / baseOver) * 1.05 * 100) / 100;
  const underOdds = Math.round((1 / under) * 1.05 * 100) / 100;

  const americanOver = overOdds < 2 ? -Math.round(100 / (overOdds - 1)) : Math.round((overOdds - 1) * 100);
  const americanUnder = underOdds < 2 ? -Math.round(100 / (underOdds - 1)) : Math.round((underOdds - 1) * 100);

  return {
    playerName: player.name,
    playerId: player.id,
    threshold,
    over: {
      odds: overOdds,
      american: americanOver > 0 ? `+${americanOver}` : `${americanOver}`,
    },
    under: {
      odds: underOdds,
      american: americanUnder > 0 ? `+${americanUnder}` : `${americanUnder}`,
    },
    probability: {
      over: Math.round(baseOver * 100),
      under: Math.round(under * 100),
    },
  };
};

// In-memory bet history storage
let betHistory: PlacedBet[] = [];
let betIdCounter = 1000;

/**
 * Fetches all available players
 */
export async function fetchPlayers(): Promise<Player[]> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(MOCK_PLAYERS), 200);
  });
}

/**
 * Fetches historical points for a specific player
 */
export async function fetchPlayerHistory(playerId: string): Promise<PlayerPoints[]> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(generateMockPointsHistory(playerId));
    }, 300);
  });
}

/**
 * Fetches odds lines for all players at a specific threshold
 */
export async function fetchOddsLines(threshold: number): Promise<OddsLine[]> {
  return new Promise((resolve) => {
    setTimeout(() => {
      const lines = MOCK_PLAYERS.map((player) => ({
        id: `line_${player.id}_${threshold}`,
        ...generateMockOdds(player, threshold),
      }));
      resolve(lines);
    }, 250);
  });
}

/**
 * Fetches available thresholds
 */
export async function fetchThresholds(): Promise<number[]> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(THRESHOLDS), 100);
  });
}

/**
 * Places a bet and returns the confirmation
 */
export async function placeBet(
  selections: BetSelection[],
  stake: number
): Promise<PlacedBet> {
  return new Promise((resolve) => {
    setTimeout(() => {
      const totalOdds = selections.reduce((acc, sel) => acc * sel.odds, 1);
      const potentialPayout = Math.round(stake * totalOdds * 100) / 100;

      const bet: PlacedBet = {
        id: `bet_${++betIdCounter}`,
        selections,
        stake,
        potentialPayout,
        timestamp: new Date().toISOString(),
        status: 'pending',
      };

      betHistory.push(bet);
      resolve(bet);
    }, 400);
  });
}

/**
 * Fetches recent bets
 */
export async function fetchRecentBets(limit: number = 10): Promise<PlacedBet[]> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(betHistory.slice(-limit).reverse());
    }, 200);
  });
}

/**
 * Fetches P&L summary
 */
export async function fetchPnLSummary(): Promise<{
  totalBets: number;
  totalStaked: number;
  totalWon: number;
  netProfit: number;
  winRate: number;
}> {
  return new Promise((resolve) => {
    setTimeout(() => {
      const totalBets = betHistory.length;
      const totalStaked = betHistory.reduce((acc, b) => acc + b.stake, 0);
      const wonBets = betHistory.filter((b) => b.status === 'won');
      const totalWon = wonBets.reduce((acc, b) => acc + b.potentialPayout, 0);
      const netProfit = totalWon - totalStaked;
      const winRate = totalBets > 0 ? (wonBets.length / totalBets) * 100 : 0;

      resolve({
        totalBets,
        totalStaked: Math.round(totalStaked * 100) / 100,
        totalWon: Math.round(totalWon * 100) / 100,
        netProfit: Math.round(netProfit * 100) / 100,
        winRate: Math.round(winRate * 100) / 100,
      });
    }, 200);
  });
}

/**
 * Uploads and parses CSV file
 * Mock implementation - just returns success
 */
export async function uploadCSV(file: File): Promise<{ success: boolean; message: string }> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        success: true,
        message: `Processed ${file.name}: 150 rows imported, 12 new players added`,
      });
    }, 600);
  });
}
