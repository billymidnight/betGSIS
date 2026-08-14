import axios from 'axios';
import { useAuthStore } from '../state/authStore';
import supabase from '../supabaseClient';

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
const api = axios.create({
  baseURL,
  timeout: 10000,
});

// yaya pam naresh, machadam palladam

// Attach headers for user context (if authenticated)
api.interceptors.request.use((config) => {
  try {
    const user = useAuthStore.getState().user;
    if (user && user.role) {
      const headers = (config.headers as Record<string, any>) || {};
      if (user.email) headers['X-User-Email'] = user.email;
      if (user.username) headers['X-User-Name'] = user.username;
      if (user.role) headers['X-User-Role'] = user.role;
      config.headers = headers as any;
    }
  } catch (e) {
    // ignore
  }
  return config;
});

export async function fetchPlayers(): Promise<any[]> {
  const r = await api.get('/analytics/players');
  return r.data.players || r.data || [];
}

export async function fetchThresholds(): Promise<number[]> {
  // fixed thresholds
  return Array.from({ length: (23000 - 7500) / 500 + 1 }, (_, i) => 7500 + i * 500);
}

export async function fetchGeoTotals(): Promise<any> {
  const r = await api.get('/geoguessr/totals');
  return r.data;
}

export async function fetchGeoPrice(playerId: number, threshold: number, marginBps?: number) {
  const r = await api.post('/geoguessr/price', { playerId, threshold, marginBps });
  return r.data;
}

export async function fetchOddsLinesForThreshold(threshold: number): Promise<any[]> {
  const players = await fetchPlayers();
  const playerIds = players.map((p: any) => p.id);
  const r = await api.post('/pricing/lines', { playerIds, thresholds: [threshold], model: 'normal', marginBps: 0 });
  const results = r.data.results || {};
  // Map to array of lines per player
  const lines: any[] = [];
  for (const pid of Object.keys(results)) {
    const byThreshold = results[pid];
    const entry = byThreshold[String(threshold)];
    if (!entry) continue;
    const player = players.find((p: any) => String(p.id) === String(pid));
    lines.push({
      id: `line_${pid}_${threshold}`,
      playerId: Number(pid),
      playerName: player ? player.name : `player_${pid}`,
      threshold,
      over: { odds: Number(entry.odds_over_decimal), american: entry.odds_over_american },
      under: { odds: Number(entry.odds_under_decimal), american: entry.odds_under_american },
      probability: { over: Number(entry.prob_over), under: Number(entry.prob_under) },
    });
  }
  return lines;
}

export async function fetchPricingLines(playerIds: number[], thresholds: number[], model = 'normal', marginBps = 500) {
  // Include a book role header for pricing requests (dev-only header used by backend mock auth)
  const headers = { 'Content-Type': 'application/json', 'x-user-role': 'book' } as Record<string, string>;
  const r = await api.post('/pricing/lines', { playerIds, thresholds, model, marginBps }, { headers });
  return r.data;
}

export async function fetchPricingFirstGuess(playerIds: number[], thresholds: number[] | null = null, model = 'normal', marginBps = 700) {
  const headers = { 'Content-Type': 'application/json', 'x-user-role': 'book' } as Record<string, string>;
  const payload: any = { playerIds, model, marginBps };
  if (thresholds) payload.thresholds = thresholds;
  const r = await api.post('/pricing/first-guess', payload, { headers });
  return r.data;
}

export async function fetchPricingCountryProps(rounds = 5, marginBps = 700) {
  const headers = { 'Content-Type': 'application/json', 'x-user-role': 'book' } as Record<string, string>;
  const r = await api.post('/pricing/country-props', { rounds, marginBps }, { headers });
  return r.data;
}

export async function fetchContinentMarkets(rounds = 5) {
  const headers = { 'Content-Type': 'application/json', 'x-user-role': 'book' } as Record<string, string>;
  const r = await api.get(`/markets/continents?rounds=${rounds}`, { headers });
  return r.data;
}

export async function fetchFirstContinentRows() {
  // Fetch FRC table rows ordered by continent_id
  const headers = { 'Content-Type': 'application/json' } as Record<string, string>;
  const r = await api.get('/frc/continents', { headers });
  return r.data || [];
}

export async function fetchAntes() {
  const headers = { 'Content-Type': 'application/json' } as Record<string, string>;
  const r = await api.get('/antes', { headers });
  return r.data || { rows: [] };
}

export async function fetchZetamacTotals(playerIds?: number[], hooks?: number[], marginBps = 700) {
  const headers = { 'Content-Type': 'application/json' } as Record<string, string>;
  const params: Record<string, string> = {};
  if (playerIds && playerIds.length > 0) params.player_ids = playerIds.join(',');
  if (hooks && hooks.length > 0) params.hooks = hooks.join(',');
  if (marginBps) params.margin_bps = String(marginBps);
  const r = await api.get('/zetamac/totals', { headers, params });
  return r.data || { players: [] };
}

export async function fetchZetamacMoneylines(marginBps = 700) {
  const headers = { 'Content-Type': 'application/json' } as Record<string, string>;
  const params: Record<string, string> = {};
  if (marginBps) params.margin_bps = String(marginBps);
  const r = await api.get('/zetamac/moneylines', { headers, params });
  const data = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
  return data || { matchups: [] };
}

export async function fetchFifaBoard() {
  const headers = { 'Content-Type': 'application/json' } as Record<string, string>;
  const r = await api.get('/fifa/board', { headers });
  const data = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
  return data || { games: [] };
}

export async function fetchPricingContinentProps(rounds = 5) {
  const headers = { 'Content-Type': 'application/json', 'x-user-role': 'book' } as Record<string, string>;
  const r = await api.get(`/pricing/continent-props?rounds=${rounds}`, { headers });
  return r.data;
}

export async function fetchMoneylinesPrices() {
  const headers = { 'Content-Type': 'application/json', 'x-user-role': 'book' } as Record<string, string>;
  const r = await api.get('/moneylines/prices', { headers });
  return r.data;
}

export async function fetchSpecialsPrices() {
  const headers = { 'Content-Type': 'application/json', 'x-user-role': 'book' } as Record<string, string>;
  const r = await api.get('/specials/prices', { headers });
  return r.data;
}

export async function fetchLocks() {
  // Return the full axios response so callers can log status and data similarly to fetchGeoTotals usage
  const r = await api.get('/locks');
  return r;
}

export async function updateLock(lockid: number, locked: boolean) {
  const r = await api.post('/locks/update', { lockid, locked });
  return r.data;
}

export async function fetchTradingLocks() {
  const r = await api.get('/trading/locks');
  return r.data;
}

export async function updateTradingLock(lock_id: number, locked: boolean) {
  const r = await api.post('/trading-locks/update', { lock_id, locked });
  return r.data;
}

export interface RacingLock {
  lock_id: number;
  lock_name: string;
  locked: boolean;
}

export async function fetchRacingLocks(): Promise<{ locks: RacingLock[] }> {
  const r = await api.get('/racing-locks');
  return r.data;
}

export async function updateRacingLock(lock_id: number, locked: boolean) {
  const r = await api.post('/racing-locks/update', { lock_id, locked });
  return r.data;
}

export async function fetchBookkeepingSummary() {
  const r = await api.get('/bookkeeping/summary');
  return r.data;
}

export async function fetchBookkeepingAccounts() {
  const r = await api.get('/bookkeeping/accounts');
  return r.data;
}

export async function fetchBookkeepingAccounting() {
  const r = await api.get('/bookkeeping/accounting');
  return r.data;
}

export async function fetchAllBets(layeur: string = 'betgsis') {
  const r = await api.get(`/bookkeeping/all-bets?layeur=${layeur}`);
  return r.data;
}

export async function editBetResult(betId: number, result: 'win' | 'loss' | 'push') {
  const r = await api.post('/bookkeeping/edit-bet', { bet_id: betId, result });
  return r.data;
}

export async function editBetFull(betId: number, fields: { result?: string; odds_american?: string; bet_size?: number; outcome?: string }) {
  const r = await api.post('/bookkeeping/edit-bet', { bet_id: betId, ...fields });
  return r.data;
}

export async function deleteBet(betId: number) {
  const r = await api.post('/bookkeeping/delete-bet', { bet_id: betId });
  return r.data;
}

export async function fetchBetGSISUsers() {
  const r = await api.get('/bookkeeping/users');
  return r.data;
}

export async function fetchPokerPlayers() {
  const r = await api.get('/poker/players');
  return r.data;
}

export async function addBet(fields: {
  user_id: string;
  market?: string;
  outcome?: string;
  bet_size: number;
  odds_american: string;
  game_id?: number;
  placed_at?: string;
  result?: string;
}) {
  const r = await api.post('/bookkeeping/add-bet', fields);
  return r.data;
}

export async function fetchGeoGameCounter() {
  const r = await api.get('/geo/game-counter');
  return r.data;
}

export async function incrementGeoGameCounter() {
  const r = await api.post('/geo/game-counter/increment');
  return r.data;
}

export async function uploadCSV(file: File) {
  const fd = new FormData();
  fd.append('file', file, file.name);
  const r = await api.post('/ingest/csv', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  return r.data;
}

export async function recomputeAll(thresholds?: number[]) {
  const r = await api.post('/pricing/recompute-all', { thresholds: thresholds });
  return r.data;
}

export async function placeBet(userId: number, lineId: number | string, side: 'over' | 'under', stake: number) {
  // legacy endpoint (kept for backward compatibility)
  const r = await api.post('/bets/place', { userId, lineId, side, stake });
  return r.data;
}

export async function placeBetServer(betPayload: Record<string, any>) {
  const session = await supabase.auth.getSession();
  let token = (session as any)?.data?.session?.access_token;
  // fallback to token from auth store if supabase session is not available
  if (!token) token = useAuthStore.getState().accessToken ?? null;
  if (import.meta.env.DEV) console.log('placeBetServer token present?', !!token);
  if (!token) throw new Error('Not authenticated');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const r = await api.post('/bets/place', betPayload, { headers });
  return r.data;
}

export async function fetchMyBets(mode: 'bettor' | 'layeur' = 'bettor') {
  const session = await supabase.auth.getSession();
  let token = (session as any)?.data?.session?.access_token;
  if (!token) token = useAuthStore.getState().accessToken ?? null;
  // token debug log removed to reduce console noise
  if (!token) return [];
  const headers = { Authorization: `Bearer ${token}` };
  const r = await api.get(`/bets/my?mode=${mode}`, { headers });
  return r.data.bets || [];
}

export async function fetchCurrentGame() {
  const r = await api.get('/games/current');
  return (r.data && r.data.game_id) ? r.data.game_id : null;
}

export async function fetchActiveBets(mode: 'bettor' | 'layeur' = 'bettor') {
  const session = await supabase.auth.getSession();
  let token = (session as any)?.data?.session?.access_token;
  if (!token) token = useAuthStore.getState().accessToken ?? null;
  // token debug log removed to reduce console noise
  if (!token) return [];
  const headers = { Authorization: `Bearer ${token}` };
  const r = await api.get(`/bets/active?mode=${mode}`, { headers });
  return r.data.bets || [];
}

export async function settleBet(betId: number, result: 'win' | 'loss' | 'push') {
  const session = await supabase.auth.getSession();
  let token = (session as any)?.data?.session?.access_token;
  if (!token) token = useAuthStore.getState().accessToken ?? null;
  if (!token) throw new Error('Not authenticated');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const r = await api.post('/bets/settle', { bet_id: betId, result }, { headers });
  return r.data;
}

export async function fetchMonopolyPlayers() {
  const r = await api.get('/monopoly/players');
  return r.data.players || [];
}

// Sopranos Trading API functions
export async function fetchSopranosReference() {
  const r = await api.get('/trading/sopranos/reference');
  return r.data;
}

export async function fetchSopranosCharacters() {
  const r = await api.get('/trading/sopranos/characters');
  return r.data;
}

export async function fetchSopranosStats() {
  const r = await api.get('/trading/sopranos/stats');
  return r.data;
}

export async function drawSopranosCards(numCards: number) {
  const r = await api.post('/trading/sopranos/draw', { num_cards: numCards });
  return r.data;
}

export async function fetchSopranosGeneralMarkets(numCards: number) {
  const r = await api.post('/trading/sopranos/markets', { num_cards: numCards });
  return r.data;
}

export async function fetchSopranosCharacterMarkets(numCards: number) {
  const r = await api.post('/trading/sopranos/character-markets', { num_cards: numCards });
  return r.data;
}

export async function fetchSopranosCrewMarkets(numCards: number) {
  const r = await api.post('/trading/sopranos/crew-markets', { num_cards: numCards });
  return r.data;
}

export async function fetchSopranosSpecialMarkets(numCards: number) {
  const r = await api.post('/trading/sopranos/special-markets', { num_cards: numCards });
  return r.data;
}

export async function settleSopranosBets(drawnCharacters: any[], bets: any[]) {
  const r = await api.post('/trading/sopranos/settle', { drawn_characters: drawnCharacters, bets });
  return r.data;
}

// ─── Chop (session P&L splitting) ──────────────────────────────────────────
export interface ChopPayload {
  user_id: string;
  percentage: number;
}

export interface EndSessionPayload {
  num_bets: number;
  net_pnl: number;
  player_chops?: ChopPayload[];
  house_chops?: ChopPayload[];
  player_screenname?: string;
}

export interface ChopUser {
  user_id: string;
  screenname: string;
  display_name: string;
}

export async function fetchChopUsers(): Promise<{ users: ChopUser[] }> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  const r = await api.get('/trading/chop-users', {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  return r.data;
}

export async function endSopranosSession(sessionData: EndSessionPayload) {
  // Get JWT token from Supabase session
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  if (!token) {
    throw new Error('No authentication token found');
  }

  const r = await api.post('/trading/sopranos/end-session', sessionData, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  return r.data;
}

// Breaking Bad Trading API functions
export async function fetchBreakingBadCharacters() {
  const r = await api.get('/trading/breakingbad/characters');
  return r.data;
}

export async function fetchBreakingBadStats() {
  const r = await api.get('/trading/breakingbad/stats');
  return r.data;
}

export async function drawBreakingBadCards(numCards: number) {
  const r = await api.post('/trading/breakingbad/draw', { num_cards: numCards });
  return r.data;
}

export async function fetchBreakingBadGeneralMarkets(numCards: number) {
  const r = await api.post('/trading/breakingbad/markets', { num_cards: numCards });
  return r.data;
}

export async function fetchBreakingBadCharacterMarkets(numCards: number) {
  const r = await api.post('/trading/breakingbad/character-markets', { num_cards: numCards });
  return r.data;
}

export async function fetchBreakingBadCrewMarkets(numCards: number) {
  const r = await api.post('/trading/breakingbad/crew-markets', { num_cards: numCards });
  return r.data;
}

export async function fetchBreakingBadSpecialMarkets(numCards: number) {
  const r = await api.post('/trading/breakingbad/special-markets', { num_cards: numCards });
  return r.data;
}

export async function settleBreakingBadBets(drawnCharacters: any[], bets: any[]) {
  const r = await api.post('/trading/breakingbad/settle', {
    drawn_characters: drawnCharacters,
    bets: bets
  });
  return r.data;
}

export async function endBreakingBadSession(data: EndSessionPayload) {
  // Get JWT token from Supabase session
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  
  if (!token) {
    throw new Error('No authentication token found');
  }
  
  const r = await api.post('/trading/breakingbad/end-session', data, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  return r.data;
}

// ====== Harry Potter Trading API ======
export async function fetchHarryPotterCharacters() {
  const r = await api.get('/trading/harrypotter/characters');
  return r.data;
}

export async function fetchHarryPotterStats() {
  const r = await api.get('/trading/harrypotter/stats');
  return r.data;
}

export async function drawHarryPotterCards(numCards: number) {
  const r = await api.post('/trading/harrypotter/draw', { num_cards: numCards });
  return r.data;
}

export async function fetchHarryPotterGeneralMarkets(numCards: number) {
  const r = await api.post('/trading/harrypotter/markets', { num_cards: numCards });
  return r.data;
}

export async function fetchHarryPotterCharacterMarkets(numCards: number) {
  const r = await api.post('/trading/harrypotter/character-markets', { num_cards: numCards });
  return r.data;
}

export async function fetchHarryPotterHouseMarkets(numCards: number) {
  const r = await api.post('/trading/harrypotter/house-markets', { num_cards: numCards });
  return r.data;
}

export async function fetchHarryPotterSpecialMarkets(numCards: number) {
  const r = await api.post('/trading/harrypotter/special-markets', { num_cards: numCards });
  return r.data;
}

export async function settleHarryPotterBets(drawnCharacters: any[], bets: any[]) {
  const r = await api.post('/trading/harrypotter/settle', {
    drawn_characters: drawnCharacters,
    bets: bets
  });
  return r.data;
}

export async function endHarryPotterSession(data: EndSessionPayload) {
  // Get JWT token from Supabase session
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  if (!token) {
    throw new Error('No authentication token found');
  }

  const r = await api.post('/trading/harrypotter/end-session', data, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  return r.data;
}

// ====== Game of Thrones Trading API ======
export async function fetchGameOfThronesCharacters() {
  const r = await api.get('/trading/gameofthrones/characters');
  return r.data;
}

export async function fetchGameOfThronesStats() {
  const r = await api.get('/trading/gameofthrones/stats');
  return r.data;
}

export async function drawGameOfThronesCards(numCards: number) {
  const r = await api.post('/trading/gameofthrones/draw', { num_cards: numCards });
  return r.data;
}

export async function fetchGameOfThronesGeneralMarkets(numCards: number) {
  const r = await api.post('/trading/gameofthrones/markets', { num_cards: numCards });
  return r.data;
}

export async function fetchGameOfThronesCharacterMarkets(numCards: number) {
  const r = await api.post('/trading/gameofthrones/character-markets', { num_cards: numCards });
  return r.data;
}

export async function fetchGameOfThronesHouseMarkets(numCards: number) {
  const r = await api.post('/trading/gameofthrones/house-markets', { num_cards: numCards });
  return r.data;
}

export async function fetchGameOfThronesSpecialMarkets(numCards: number) {
  const r = await api.post('/trading/gameofthrones/special-markets', { num_cards: numCards });
  return r.data;
}

export async function settleGameOfThronesBets(drawnCharacters: any[], bets: any[]) {
  const r = await api.post('/trading/gameofthrones/settle', {
    drawn_characters: drawnCharacters,
    bets: bets
  });
  return r.data;
}

export async function endGameOfThronesSession(data: EndSessionPayload) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) {
    throw new Error('No authentication token found');
  }
  const r = await api.post('/trading/gameofthrones/end-session', data, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return r.data;
}

// Good Shepherd Trading API
export async function fetchGoodShepherdCharacters() {
  const r = await api.get('/trading/goodshepherd/characters');
  return r.data;
}

export async function drawGoodShepherdStudents() {
  const r = await api.post('/trading/goodshepherd/draw');
  return r.data;
}

export async function fetchGoodShepherdCharacterMarkets(numCards: number) {
  const r = await api.post('/trading/goodshepherd/character-markets', { num_cards: numCards });
  return r.data;
}

export async function fetchGoodShepherdHouseMarkets(numCards: number, drawNumber: number = 1) {
  const r = await api.post('/trading/goodshepherd/house-markets', { num_cards: numCards, draw_number: drawNumber });
  return r.data;
}

export async function fetchGoodShepherdSpecialMarkets(numCards: number) {
  const r = await api.post('/trading/goodshepherd/special-markets', { num_cards: numCards });
  return r.data;
}

export async function settleGoodShepherdBets(drawnCharacters: any[], bets: any[]) {
  const r = await api.post('/trading/goodshepherd/settle', {
    drawn_characters: drawnCharacters,
    bets: bets
  });
  return r.data;
}

export async function endGoodShepherdSession(data: EndSessionPayload) {
  // Get JWT token from Supabase session
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  
  if (!token) {
    throw new Error('No authentication token found');
  }
  
  const r = await api.post('/trading/goodshepherd/end-session', data, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  return r.data;
}

// ═══════════════════════════════════════════════════════════════════
// Horse Racing — Churchill Downs (offline)
// ═══════════════════════════════════════════════════════════════════

export interface HorseRaceResultRow {
  year: number;
  finish_position: number;
  finish_seconds: number;
}

export interface HorseCareerStats {
  participations: number;
  wins: number;
  places: number;             // top-2 finishes
  shows: number;              // top-3 finishes
  best_seconds:  number | null;
  worst_seconds?: number | null;
  best_year?:     number | null;
  worst_year?:    number | null;
  // Most-recent-first slices of the result history. The fancy single-
  // horse card in the catalogue uses last_5_results + all_results; the
  // pre-/post-race commentary path still leans on last_3_results.
  last_3_results?: HorseRaceResultRow[];
  last_5_results?: HorseRaceResultRow[];
  all_results?:    HorseRaceResultRow[];
  // Optional separate arrays preserved for back-compat (commentary still
  // reads these). Frontend should prefer last_3_results.
  last_3_years?:     number[];
  last_3_positions?: number[];
  last_3_seconds?:   number[];
}

export interface Horse {
  horse_id: number;
  full_name: string;
  saddle_name: string;
  description: string | null;
  country: string | null;        // ISO 3166-1 alpha-2 code (e.g. 'US', 'GB')
  mean_speed: number;
  speed_volatility: number;
  pace_stickiness: number;
  early_pace: number;
  late_kick: number;
  silks_color: string;
  stats?: HorseCareerStats;      // present on /horses response (decorated server-side)
}

export interface HorseInField extends Horse {
  post_position: number;
}

export interface OddsQuote {
  probability: number;
  decimal: number | null;       // null when the market is locked
  american: number | null;      // null when the market is locked
  locked: boolean;              // true → market won't be offered (too short, or absurd longshot)
}

export interface OverUnderPick {
  horse_id: number;
  line_seconds: number;       // the over/under line, set to the rounded mean
  mean_seconds: number;       // raw mean across sims, useful for tooltip / dev
  over: OddsQuote;            // pays if horse finishes in > line_seconds
  under: OddsQuote;           // pays if horse finishes in < line_seconds
}

export interface RaceParlays {
  midpoint_distance: number;          // N/2 — same units as race distance
  // Favorite (most-likely-winner from this field) needs to lead at N/2 AND win
  favorite_id: number;
  favorite_p_lead_half: number;       // info only — prob favorite leads at midpoint
  favorite_p_win: number;             // info only — prob favorite wins
  favorite_quote: OddsQuote;          // priced parlay (joint prob with vig)
  // Underdog (most-likely-back-marker from this field) needs to be last at N/2 AND finish last
  underdog_id: number;
  underdog_p_back_half: number;
  underdog_p_last: number;
  underdog_quote: OddsQuote;
}

export interface RaceOdds {
  placeholder: boolean;
  note: string;
  distance: number;
  year_counter: number;            // year of THIS race (also passed through on RaceTrajectory)
  win: Record<string, OddsQuote>;
  place: Record<string, OddsQuote>;
  show: Record<string, OddsQuote>;
  duel: Record<string, OddsQuote>;        // key = `${a_id}_before_${b_id}`
  top2_exact: Record<string, OddsQuote>;  // key = `${a_id}_${b_id}` (a=1st, b=2nd)
  finish_last: Record<string, OddsQuote>;
  bottom_3: Record<string, OddsQuote>;
  // Time-based prop markets — keys are stable, but the *threshold values* used
  // to compute each probability scale linearly with race distance. Read the
  // actual seconds-thresholds out of `prop_thresholds` to render labels.
  props: {
    first_place_margin: OddsQuote;        // winner ahead of 2nd by > winby_seconds
    last_place_margin: OddsQuote;         // last behind 2nd-last by > loseby_seconds
    any_under_threshold: OddsQuote;       // any horse finishes in < fast_seconds
    any_over_threshold: OddsQuote;        // any horse finishes in > slow_seconds
  };
  prop_thresholds: {
    winby_seconds: number;
    loseby_seconds: number;
    fast_seconds: number;
    slow_seconds: number;
  };
  // Three random horses get an over/under finish-time market each, line set
  // at the rounded mean of their simulated finish time. The trio is re-rolled
  // every /odds call.
  over_under_picks: OverUnderPick[];
  // Parlay-style markets pinned to the field's favorite / underdog.
  parlays: RaceParlays;
}

export async function fetchHorses(): Promise<Horse[]> {
  const r = await api.get('/racing/horses');
  return r.data?.horses || [];
}

export async function setupRace(
  numHorses: 3 | 5 | 7,
  opts?: { mode?: 'random' | 'manual'; horse_ids?: number[] },
): Promise<HorseInField[]> {
  const body: Record<string, any> = { num_horses: numHorses };
  if (opts?.mode)       body.mode       = opts.mode;
  if (opts?.horse_ids)  body.horse_ids  = opts.horse_ids;
  const r = await api.post('/racing/setup-race', body);
  return r.data?.field || [];
}

export async function fetchRaceOdds(field: HorseInField[]): Promise<RaceOdds> {
  // 25k Monte Carlo sims + midpoint tracking + parlay computation can run
  // ~3-5 s on a warm path, more on first call. The default 10 s axios timeout
  // is too aggressive for this endpoint specifically — bump per-call.
  const r = await api.post('/racing/odds', { field }, { timeout: 60000 });
  return r.data?.odds;
}

// ─── Race playback (one seeded realisation) ──────────────────────────────

export interface RaceFinish {
  horse_id: number;
  finish_ms: number;       // wall-clock time to cross the wire (race start = 0)
  finish_position: number; // 1 = winner, N = back-marker
  dq?: boolean;            // true = horse didn't actually cross by the 60s deadline
}

export interface RaceTrajectory {
  duration_ms: number;             // last horse's finish time
  sample_dt_ms: number;            // cadence between samples
  sample_times_ms: number[];       // length S — absolute t for each sample
  horse_ids: number[];             // length N — column order in `positions`
  positions: number[][];           // shape [S][N] — normalised 0..1 (1 == finish line)
  finishes: RaceFinish[];          // one per horse, ordered by finish_ms
  finish_order: number[];          // horse_ids 1st..Nth
  distance: number;
  year_counter: number;
  midpoint_distance: number;
  midpoint_leader_id: number;          // who hit N/2 first in THIS run — used to grade favorite parlay
  midpoint_backmarker_id: number;      // who hit N/2 last in THIS run — used to grade underdog parlay
  thresholds: {
    winby_ms: number;              // 1st-2nd gap threshold for prop_first_margin
    loseby_ms: number;             // last vs 2nd-last gap threshold for prop_last_margin
    fast_ms: number;               // any-horse-under threshold for prop_any_under
    slow_ms: number;               // any-horse-over threshold for prop_any_over
  };
  seed: number;
}

export async function runRace(field: HorseInField[], seed?: number): Promise<RaceTrajectory> {
  const payload: any = { field };
  if (seed != null) payload.seed = seed;
  // Single seeded race — fast, but matches /odds timeout for safety.
  const r = await api.post('/racing/run-race', payload, { timeout: 60000 });
  return r.data?.race;
}

export interface RaceFinishPayload {
  field_size: number;
  distance: number;
  finishes: { horse_id: number; finish_position: number; finish_seconds: number }[];
}

/** Persist the official result to horse_results + bump year_counter. Idempotent
 *  on the backend (uniq-on-(year, horse_id)), so re-submitting is harmless. */
export async function finishRace(payload: RaceFinishPayload): Promise<{ year: number; next_year: number }> {
  const r = await api.post('/racing/finish-race', payload, { timeout: 30000 });
  return { year: r.data?.year, next_year: r.data?.next_year };
}

// ─── AI Commentary ────────────────────────────────────────────────────────

export type CommentaryPhase = 'pre' | 'post' | 'fan';
export type FanAccent = 'indian' | 'american' | 'chinese' | 'japanese';

export interface CommentaryClip {
  phase: CommentaryPhase;
  text: string;
  audio_b64: string;
  audio_mime: string;            // 'audio/mpeg'
  tts_voice?: string;
  tts_speed?: number;
  text_model?: string;
  tts_model?: string;
  // Only populated for phase === 'fan' — used by the CC bar to label
  // the speaker ("Fan in the stands — Vikram (Indian)") instead of the
  // default "Track Announcer".
  fan_accent?: FanAccent | null;
  fan_name?:   string  | null;
}

export async function fetchCommentary(args: {
  phase: CommentaryPhase;
  field: HorseInField[];
  odds?: RaceOdds | null;
  trajectory?: RaceTrajectory | null;
  year_counter?: number;
  distance?: number;
  is_continuation?: boolean;     // true → backend skips the greeting intro
  accent?: FanAccent;            // fan-phase override; otherwise backend rolls 33/33/33
}): Promise<CommentaryClip> {
  const r = await api.post('/racing/commentary', args, { timeout: 90000 });
  return r.data as CommentaryClip;
}

// ─── Bookie multi-user betting ────────────────────────────────────────────

export interface BettorOption {
  user_id:     string;
  // The canonical column on the `users` table is `screenname` (one word).
  // The backend mirrors it under `screen_name` for back-compat — UIs
  // should prefer `screenname`.
  screenname:  string;
  screen_name?: string;
  role:        string | null;
  email?:      string | null;
  avatar_url?: string | null;
}

async function _authHeader(): Promise<{ Authorization: string }> {
  const session = await supabase.auth.getSession();
  let token = (session as any)?.data?.session?.access_token;
  if (!token) token = useAuthStore.getState().accessToken ?? null;
  if (!token) throw new Error('Not authenticated');
  return { Authorization: `Bearer ${token}` };
}

/** List candidate bettors a BOOKIE-role user can place bets on behalf of.
 *  Returns 403 if the caller isn't a bookie. */
export async function fetchBettors(): Promise<BettorOption[]> {
  const headers = await _authHeader();
  const r = await api.get('/racing/bettors', { headers });
  return (r.data?.bettors ?? []) as BettorOption[];
}

export interface PersistMultiBet {
  selection:     string;     // human-readable bet selection (becomes outcome)
  market_kind:   string;     // 'win' | 'place' | 'show' | 'duel' | 'top2_exact' | etc.
  stake:         number;
  odds_american: string;     // already-formatted ('+222' / '-180')
  decimal:       number;
  won?:          boolean;    // optional — pre-settled
  pnl?:          number;     // optional — pre-settled
}

export interface PersistMultiSession {
  user_id:       string;
  screen_name?:  string | null;
  bets:          PersistMultiBet[];
}

export async function persistMultiBets(args: {
  year:     number;
  sessions: PersistMultiSession[];
}): Promise<{ rows_inserted: number }> {
  const headers = await _authHeader();
  const r = await api.post('/racing/persist-multi-bets', args, { headers });
  return { rows_inserted: r.data?.rows_inserted ?? 0 };
}

// ─── Cheltenham — pari-mutuel sessions ───────────────────────────────────

export type CheltenhamSessionStatus = 'lobby' | 'active' | 'concluded';
export type CheltenhamRaceStatus    = 'drafting' | 'betting' | 'closed' | 'racing' | 'settled';
export type CheltenhamPoolStatus    = 'betting' | 'closed' | 'settled';
export type CheltenhamPoolKind =
  | 'winner'
  | 'bridesmaid'
  | 'backer'
  | 'winner_nationality'
  | 'time_bucket_horse';

export interface CheltenhamSession {
  session_id:        number;
  name:              string;
  host_id:           string;
  host_screenname?:  string;
  status:            CheltenhamSessionStatus;
  starting_balance:  number;
  min_bet:           number;
  max_bet:           number;
  enable_time_pools: boolean;
  default_distance:  number;
  default_dilation:  number;
  created_at:        string;
  concluded_at?:     string | null;
}

export interface CheltenhamParticipant {
  id:                  number;
  session_id:          number;
  user_id:             string;
  screenname?:         string;
  balance:             number;
  joined_at:           string;
  has_bet_all_pools?:  boolean;
  pools_bet_count?:    number;
  pools_total?:        number;
  computed_pnl?:       number;
}

export interface CheltenhamRace {
  race_id:           number;
  session_id:        number;
  race_number:       number;
  status:            CheltenhamRaceStatus;
  field_size:        number;
  distance:          number;
  dilation:          number;
  field_json:        HorseInField[];
  trajectory_json?:  RaceTrajectory | null;
  enabled_pools?:    string[] | null;
  created_at:        string;
  sent_off_at?:      string | null;
  settled_at?:       string | null;
}

export interface CheltenhamWager {
  wager_id:       number;
  pool_id:        number;
  user_id:        string;
  screenname?:    string;
  selection_key:  string;
  stake:          number;
  implied_odds?:  number | null;
  payout?:        number | null;
  pnl?:           number | null;
  created_at:     string;
}

export interface CheltenhamPool {
  pool_id:        number;
  race_id:        number;
  pool_kind:      CheltenhamPoolKind;
  status:         CheltenhamPoolStatus;
  payload_json:   any;
  winner_key?:    string | null;
  wagers?:        CheltenhamWager[];
  wager_count?:   number;
  created_at:     string;
}

export interface CheltenhamSessionState {
  session:        CheltenhamSession;
  participants:   CheltenhamParticipant[];
  is_host:        boolean;
  current_race?:  CheltenhamRace | null;
  pools:          CheltenhamPool[];
}

export async function chelCreateSession(args: {
  name:               string;
  starting_balance?:  number;
  min_bet?:           number;
  max_bet?:           number;
  enable_time_pools?: boolean;
  default_distance?:  number;
  default_dilation?:  number;
}): Promise<{ session: CheltenhamSession }> {
  const headers = await _authHeader();
  const r = await api.post('/cheltenham/session/create', args, { headers });
  return r.data;
}

export async function chelListSessions(status: 'lobby' | 'active' | 'all' = 'lobby'):
  Promise<{ sessions: CheltenhamSession[]; enrolled_session_ids: number[] }>
{
  const headers = await _authHeader();
  const r = await api.get(`/cheltenham/sessions?status=${status}`, { headers });
  return r.data;
}

export async function chelSessionDetail(sessionId: number): Promise<CheltenhamSessionState> {
  const headers = await _authHeader();
  const r = await api.get(`/cheltenham/session/${sessionId}`, { headers });
  return r.data;
}

export async function chelJoinSession(sessionId: number) {
  const headers = await _authHeader();
  const r = await api.post(`/cheltenham/session/${sessionId}/join`, {}, { headers });
  return r.data;
}

export async function chelBeginSession(sessionId: number) {
  const headers = await _authHeader();
  const r = await api.post(`/cheltenham/session/${sessionId}/begin`, {}, { headers });
  return r.data;
}

export async function chelConcludeSession(sessionId: number) {
  const headers = await _authHeader();
  const r = await api.post(`/cheltenham/session/${sessionId}/conclude`, {}, { headers });
  return r.data;
}

export async function chelDeleteAllSessions(): Promise<{ deleted: number }> {
  const headers = await _authHeader();
  const r = await api.post('/cheltenham/sessions/delete-all', {}, { headers });
  return r.data;
}

export async function chelCommentary(field: HorseInField[]): Promise<{
  text: string; audio_b64: string; audio_mime: string;
}> {
  const headers = await _authHeader();
  const r = await api.post('/cheltenham/commentary', { field }, {
    headers, timeout: 90000,
  });
  return r.data;
}

export async function chelDraftRace(args: {
  session_id:    number;
  field_size:    3 | 5 | 7;
  mode:          'random' | 'manual';
  horse_ids?:    number[];
  distance?:     number;
  dilation?:     number;
  enabled_pools?: string[];
}): Promise<{ race: CheltenhamRace }> {
  const headers = await _authHeader();
  const { session_id, ...body } = args;
  const r = await api.post(`/cheltenham/session/${session_id}/race/draft`, body, { headers });
  return r.data;
}

export async function chelReleasePools(raceId: number, enabled_pools?: string[]) {
  const headers = await _authHeader();
  const body = enabled_pools && enabled_pools.length > 0 ? { enabled_pools } : {};
  const r = await api.post(`/cheltenham/race/${raceId}/release-pools`, body, { headers });
  return r.data;
}

export async function chelWager(args: {
  pool_id:       number;
  selection_key: string;
  stake:         number;
}) {
  const headers = await _authHeader();
  const { pool_id, ...body } = args;
  const r = await api.post(`/cheltenham/pool/${pool_id}/wager`, body, { headers });
  return r.data;
}

export async function chelCloseWagering(raceId: number) {
  const headers = await _authHeader();
  const r = await api.post(`/cheltenham/race/${raceId}/close-wagering`, {}, { headers });
  return r.data;
}

export async function chelSendOff(raceId: number): Promise<{ trajectory: RaceTrajectory }> {
  const headers = await _authHeader();
  const r = await api.post(`/cheltenham/race/${raceId}/send-off`, {}, { headers });
  return r.data;
}

export async function chelSettleRace(raceId: number) {
  const headers = await _authHeader();
  const r = await api.post(`/cheltenham/race/${raceId}/settle`, {}, { headers });
  return r.data;
}

// ─── Stats menu ───────────────────────────────────────────────────────────

export interface StatsLeaderEntry {
  horse_id: number;
  full_name: string;
  saddle_name?: string;
  country?: string;
  value: number;
}

export interface StatsRecordEntry {
  distance: number;
  finish_seconds: number;
  horse_id: number;
  full_name: string;
  saddle_name?: string;
  country?: string;
  year: number;
}

export interface StatsYearResultRow {
  horse_id: number;
  full_name: string;
  saddle_name?: string;
  country?: string;
  finish_position: number;
  finish_seconds: number;
}

export interface StatsYearSlot {
  year: number;
  distance: number;
  field_size: number;
  results: StatsYearResultRow[];
}

export interface StatsCountryEntry {
  country:         string;       // ISO-2
  participations:  number;
  wins:            number;
  places:          number;
  shows:           number;
  win_rate:        number;       // 0..1
  place_rate:      number;
  show_rate:       number;
  win_rate_pct:    number;       // 0..100 rounded
  place_rate_pct:  number;
  show_rate_pct:   number;
}

export interface StatsYearTimeEntry {
  year:           number;
  distance:       number;
  field_size:     number;
  avg_seconds:    number;
  min_seconds:    number;
  max_seconds:    number;
  winner_seconds: number;
}

export interface StatsResponse {
  current_year: number;
  total_races: number;
  leaderboards: {
    most_wins:          StatsLeaderEntry[];
    most_places:        StatsLeaderEntry[];
    most_shows:         StatsLeaderEntry[];
    most_participations:StatsLeaderEntry[];
    best_time_per_distance: StatsRecordEntry[];
  };
  countries?: {
    participations_by_country:  StatsCountryEntry[];
    wins_by_country:            StatsCountryEntry[];
    best_win_rate_by_country:   StatsCountryEntry[];
  };
  year_analysis?: {
    fastest_avg_years: StatsYearTimeEntry[];
    slowest_avg_years: StatsYearTimeEntry[];
  };
  per_year: StatsYearSlot[];
}

export async function fetchRacingStats(): Promise<StatsResponse> {
  const r = await api.get('/racing/stats');
  return r.data as StatsResponse;
}

// ═══════════════════════════════════════════════════════════════════
// Leaderboard (access-key gated)
// ═══════════════════════════════════════════════════════════════════

export interface LeaderboardStats {
  net_wagered: number;
  total_bets: number;
  betgsis_pnl: number;
  top_market: { market: string; volume: number; bet_count: number } | null;
}

export interface LeaderboardPlayer {
  user_id: string;
  screenname: string;
  avatar_url?: string | null;
  pnl: number;
  cash_pnl: number;
  tournament_pnl: number;
  bets: number;
  stake: number;
}

export async function verifyLeaderboardKey(key: string): Promise<boolean> {
  try {
    const r = await api.post('/leaderboard/verify-key', { key });
    return !!r.data?.valid;
  } catch {
    return false;
  }
}

function _leaderboardHeaders(key: string): Record<string, string> {
  return { 'X-Access-Key': key };
}

export async function fetchLeaderboardStats(key: string): Promise<LeaderboardStats> {
  const r = await api.get('/leaderboard/stats', { headers: _leaderboardHeaders(key) });
  return r.data;
}

export async function fetchPokerLeaderboard(key: string): Promise<LeaderboardPlayer[]> {
  const r = await api.get('/leaderboard/poker', { headers: _leaderboardHeaders(key) });
  return r.data?.players || [];
}

export async function fetchGsPokerLeaderboard(key: string): Promise<LeaderboardPlayer[]> {
  const r = await api.get('/leaderboard/gs-poker', { headers: _leaderboardHeaders(key) });
  return r.data?.players || [];
}

export async function fetchTradingLeaderboard(key: string): Promise<LeaderboardPlayer[]> {
  const r = await api.get('/leaderboard/trading', { headers: _leaderboardHeaders(key) });
  return r.data?.players || [];
}

export async function fetchSpecialsLeaderboard(key: string): Promise<LeaderboardPlayer[]> {
  const r = await api.get('/leaderboard/specials', { headers: _leaderboardHeaders(key) });
  return r.data?.players || [];
}

// ═══════════════════════════════════════════════════════════════════
// Dammox Birthday Tribute API
// ═══════════════════════════════════════════════════════════════════

export interface DammoxBet {
  bet_id: number;
  market: string;
  outcome: string;
  bet_size: number;
  odds_american: string;
  result: string | null;
  placed_at: string;
  est_date: string | null;
  pnl: number;
  point: number | null;
}

export interface DammoxDay {
  date: string;
  pnl: number;
}

export interface DammoxMarketAgg {
  market: string;
  volume: number;
  bets: number;
}

export interface DammoxMarketBreakdown {
  market: string;
  days_bet: number;
  volume: number;
  bets: number;
  pnl: number;
}

export interface DammoxStats {
  user_id: string;
  total_bets: number;
  total_volume: number;
  most_wagered_market: DammoxMarketAgg | null;
  least_wagered_market: DammoxMarketAgg | null;
  top_winning_days: DammoxDay[];
  top_losing_days: DammoxDay[];
  top_winning_bets: DammoxBet[];
  top_losing_bets: DammoxBet[];
  markets_breakdown: DammoxMarketBreakdown[];
}

export async function fetchDammoxStats(): Promise<DammoxStats> {
  const r = await api.get('/dammox/stats');
  return r.data;
}

export async function fetchDammoxMemes(): Promise<string[]> {
  const r = await api.get('/dammox/memes');
  return r.data?.files || [];
}

// ═══════════════════════════════════════════════════════════════════
// Exchange / P2P Offerings API
// ═══════════════════════════════════════════════════════════════════

async function _getAuthHeaders(): Promise<Record<string, string>> {
  const session = await supabase.auth.getSession();
  let token = (session as any)?.data?.session?.access_token;
  if (!token) token = useAuthStore.getState().accessToken ?? null;
  if (!token) throw new Error('Not authenticated');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

export async function fetchOfferings(): Promise<any[]> {
  const r = await api.get('/exchange/offerings');
  return r.data.offerings || [];
}

export async function createOffering(payload: {
  bet_name: string;
  bet_description?: string;
  odds: string | number;
  odds_format?: 'american' | 'decimal' | 'probability';
  max_bet: number;
}): Promise<any> {
  const headers = await _getAuthHeaders();
  const r = await api.post('/exchange/create', payload, { headers });
  return r.data;
}

export async function editOffering(payload: {
  offering_id: number;
  odds?: string | number;
  odds_format?: string;
  max_bet?: number;
  bet_name?: string;
  bet_description?: string;
}): Promise<any> {
  const headers = await _getAuthHeaders();
  const r = await api.post('/exchange/edit', payload, { headers });
  return r.data;
}

export async function cancelOffering(offeringId: number): Promise<any> {
  const headers = await _getAuthHeaders();
  const r = await api.post('/exchange/cancel', { offering_id: offeringId }, { headers });
  return r.data;
}

export async function lockOffering(offeringId: number): Promise<any> {
  const headers = await _getAuthHeaders();
  const r = await api.post('/exchange/lock', { offering_id: offeringId }, { headers });
  return r.data;
}

export async function unlockOffering(offeringId: number): Promise<any> {
  const headers = await _getAuthHeaders();
  const r = await api.post('/exchange/unlock', { offering_id: offeringId }, { headers });
  return r.data;
}

export async function deleteOffering(offeringId: number): Promise<any> {
  const headers = await _getAuthHeaders();
  const r = await api.post('/exchange/delete', { offering_id: offeringId }, { headers });
  return r.data;
}

export async function takeOffering(offeringId: number, stake: number): Promise<any> {
  const headers = await _getAuthHeaders();
  const r = await api.post('/exchange/take', { offering_id: offeringId, stake }, { headers });
  return r.data;
}

export async function deleteP2PBet(betId: number): Promise<any> {
  const headers = await _getAuthHeaders();
  const r = await api.post('/exchange/delete-bet', { bet_id: betId }, { headers });
  return r.data;
}

export async function fetchExchangePortfolio(): Promise<any> {
  const headers = await _getAuthHeaders();
  const r = await api.get('/exchange/portfolio', { headers });
  return r.data;
}

// ═══════════════════════════════════════════════════════════
// PARIMUTUEL API
// ═══════════════════════════════════════════════════════════

export async function pariCreateSession(payload: {
  name: string;
  starting_balance?: number;
  min_bet?: number;
  max_bet?: number;
  mode?: string;
  game_type?: string;
}): Promise<any> {
  const headers = await _getAuthHeaders();
  const r = await api.post('/pari/session/create', payload, { headers });
  return r.data;
}

export async function pariListSessions(status = 'lobby'): Promise<any> {
  const headers = await _getAuthHeaders();
  const t = Date.now();
  const r = await api.get(`/pari/sessions?status=${status}&_t=${t}`, { headers });
  return r.data;
}

export async function pariSessionDetail(sessionId: number): Promise<any> {
  const headers = await _getAuthHeaders();
  const t = Date.now();
  const r = await api.get(`/pari/session/${sessionId}?_t=${t}`, { headers });
  return r.data;
}

export async function pariJoinSession(sessionId: number): Promise<any> {
  const headers = await _getAuthHeaders();
  const r = await api.post(`/pari/session/${sessionId}/join`, {}, { headers });
  return r.data;
}

export async function pariBeginSession(sessionId: number): Promise<any> {
  const headers = await _getAuthHeaders();
  const r = await api.post(`/pari/session/${sessionId}/begin`, {}, { headers });
  return r.data;
}

export async function pariConcludeSession(sessionId: number): Promise<any> {
  const headers = await _getAuthHeaders();
  const r = await api.post(`/pari/session/${sessionId}/conclude`, {}, { headers });
  return r.data;
}

export async function pariDeleteSession(sessionId: number): Promise<any> {
  const headers = await _getAuthHeaders();
  const r = await api.post(`/pari/session/${sessionId}/delete`, {}, { headers });
  return r.data;
}

export async function pariCreatePool(sessionId: number, payload: {
  num_sides?: number;
  labels?: string[];
  question?: string;
}): Promise<any> {
  const headers = await _getAuthHeaders();
  const r = await api.post(`/pari/session/${sessionId}/pool/create`, payload, { headers });
  return r.data;
}

export async function pariPlaceWager(poolId: number, sideNumber: number, stake: number, answer?: string): Promise<any> {
  const headers = await _getAuthHeaders();
  const body: any = { side_number: sideNumber, stake };
  if (answer !== undefined) body.answer = answer;
  const r = await api.post(`/pari/pool/${poolId}/wager`, body, { headers });
  return r.data;
}

export async function pariClosePool(poolId: number): Promise<any> {
  const headers = await _getAuthHeaders();
  const r = await api.post(`/pari/pool/${poolId}/close`, {}, { headers });
  return r.data;
}

export async function pariSettlePool(poolId: number, winnerSide: number): Promise<any> {
  const headers = await _getAuthHeaders();
  const r = await api.post(`/pari/pool/${poolId}/settle`, { winner_side: winnerSide }, { headers });
  return r.data;
}

export async function pariSettleFermiPool(poolId: number, winnerWagerIds: number[]): Promise<any> {
  const headers = await _getAuthHeaders();
  const r = await api.post(`/pari/pool/${poolId}/settle-fermi`, { winner_wager_ids: winnerWagerIds }, { headers });
  return r.data;
}

// ═══════════════════════════════════════════════════════════════
//  GS POKER
// ═══════════════════════════════════════════════════════════════

export async function gsPokerListSessions(): Promise<any> {
  const headers = await _getAuthHeaders();
  const t = Date.now();
  const r = await api.get(`/gs-poker/sessions?_t=${t}`, { headers });
  return r.data;
}

export async function gsPokerCreateSession(payload: {
  name: string;
  starting_stack?: number;
  small_blind?: number;
  big_blind?: number;
  max_players?: number;
}): Promise<any> {
  const headers = await _getAuthHeaders();
  const r = await api.post('/gs-poker/session/create', payload, { headers });
  return r.data;
}

export async function gsPokerJoinSession(sessionId: number): Promise<any> {
  const headers = await _getAuthHeaders();
  const r = await api.post(`/gs-poker/session/${sessionId}/join`, {}, { headers });
  return r.data;
}

export async function gsPokerDeleteSession(sessionId: number): Promise<any> {
  const headers = await _getAuthHeaders();
  const r = await api.post(`/gs-poker/session/${sessionId}/delete`, {}, { headers });
  return r.data;
}

export async function gsPokerRebuyRequest(sessionId: number, amount: number): Promise<any> {
  const headers = await _getAuthHeaders();
  const r = await api.post(`/gs-poker/session/${sessionId}/rebuy-request`, { amount }, { headers });
  return r.data;
}

export async function gsPokerRebuyApprove(sessionId: number, userId: string): Promise<any> {
  const headers = await _getAuthHeaders();
  const r = await api.post(`/gs-poker/session/${sessionId}/rebuy-approve`, { user_id: userId }, { headers });
  return r.data;
}

export async function gsPokerReveal(sessionId: number, seat?: number): Promise<any> {
  const headers = await _getAuthHeaders();
  const body: any = {};
  if (seat !== undefined) body.seat = seat;
  const r = await api.post(`/gs-poker/game/${sessionId}/reveal`, body, { headers });
  return r.data;
}

export async function gsPokerChangeBlinds(sessionId: number, smallBlind: number, bigBlind: number): Promise<any> {
  const headers = await _getAuthHeaders();
  const r = await api.post(`/gs-poker/session/${sessionId}/blinds`, { small_blind: smallBlind, big_blind: bigBlind }, { headers });
  return r.data;
}

export async function gsPokerConclude(sessionId: number): Promise<any> {
  const headers = await _getAuthHeaders();
  const r = await api.post(`/gs-poker/session/${sessionId}/conclude`, {}, { headers });
  return r.data;
}

export async function gsPokerLedger(sessionId: number): Promise<any> {
  const headers = await _getAuthHeaders();
  const r = await api.get(`/gs-poker/session/${sessionId}/ledger`, { headers });
  return r.data;
}

export async function gsPokerBotCreate(payload: { starting_stack?: number; small_blind?: number; big_blind?: number }): Promise<any> {
  const headers = await _getAuthHeaders();
  const r = await api.post('/gs-poker/bot/create', payload, { headers });
  return r.data;
}

export async function gsPokerStartGame(sessionId: number): Promise<any> {
  const headers = await _getAuthHeaders();
  const r = await api.post(`/gs-poker/session/${sessionId}/start`, {}, { headers });
  return r.data;
}

export async function gsPokerGetState(sessionId: number): Promise<any> {
  const headers = await _getAuthHeaders();
  const t = Date.now();
  const r = await api.get(`/gs-poker/game/${sessionId}/state?_t=${t}`, { headers });
  return r.data;
}

export async function gsPokerAction(sessionId: number, actionType: string, amount?: number): Promise<any> {
  const headers = await _getAuthHeaders();
  const body: any = { action_type: actionType };
  if (amount !== undefined) body.amount = amount;
  const r = await api.post(`/gs-poker/game/${sessionId}/action`, body, { headers });
  return r.data;
}

export async function gsPokerNextHand(sessionId: number): Promise<any> {
  const headers = await _getAuthHeaders();
  const r = await api.post(`/gs-poker/game/${sessionId}/next-hand`, {}, { headers });
  return r.data;
}

export async function pariVoidPool(poolId: number): Promise<any> {
  const headers = await _getAuthHeaders();
  const r = await api.post(`/pari/pool/${poolId}/void`, {}, { headers });
  return r.data;
}


// ═══════════════════════════════════════════════════════════════
//  PROFILE / AVATAR
// ═══════════════════════════════════════════════════════════════

export async function uploadAvatar(file: File): Promise<{ avatar_url: string }> {
  const headers = await _getAuthHeaders();
  delete (headers as any)['Content-Type'];
  const form = new FormData();
  form.append('avatar', file);
  const r = await api.post('/profile/avatar', form, {
    headers,
    timeout: 30000,
  });
  return r.data;
}

export async function adminUploadAvatar(userId: string, file: File): Promise<{ avatar_url: string }> {
  const headers = await _getAuthHeaders();
  delete (headers as any)['Content-Type'];
  const form = new FormData();
  form.append('avatar', file);
  const r = await api.post(`/profile/avatar/${userId}`, form, {
    headers,
    timeout: 30000,
  });
  return r.data;
}

export async function updateProfile(screenname: string): Promise<any> {
  const headers = await _getAuthHeaders();
  const r = await api.post('/profile/update', { screenname }, { headers });
  return r.data;
}

export async function listAllUsers(): Promise<any[]> {
  const headers = await _getAuthHeaders();
  const r = await api.get('/profile/users', { headers });
  return r.data.users || [];
}

// ═══════════════════════════════════════════════════════════════
//  BET TICKER
// ═══════════════════════════════════════════════════════════════

export interface RecentBet {
  bet_id: number;
  screenname: string;
  avatar_url: string;
  market: string;
  outcome: string;
  result: string;
  pnl: number;
  odds_american: string;
}

export async function fetchRecentBets(limit = 15): Promise<RecentBet[]> {
  const r = await api.get(`/bets/recent?limit=${limit}`);
  return r.data.bets || [];
}

// ── The Mel Brooks Game ──
export async function mbCreateSession(payload: {
  name: string;
  bids_visible: boolean;
  liquidity_provider: 'players' | 'host';
  starting_balance?: number;
}): Promise<any> {
  const headers = await _getAuthHeaders();
  const r = await api.post('/melbrooks/session/create', payload, { headers });
  return r.data;
}

export async function mbListSessions(): Promise<any> {
  const headers = await _getAuthHeaders();
  const r = await api.get(`/melbrooks/sessions?_t=${Date.now()}`, { headers });
  return r.data;
}

export async function mbSessionDetail(sessionId: number): Promise<any> {
  const headers = await _getAuthHeaders();
  const r = await api.get(`/melbrooks/session/${sessionId}?_t=${Date.now()}`, { headers });
  return r.data;
}

export async function mbJoin(sessionId: number): Promise<any> {
  const headers = await _getAuthHeaders();
  const r = await api.post(`/melbrooks/session/${sessionId}/join`, {}, { headers });
  return r.data;
}

export async function mbBegin(sessionId: number): Promise<any> {
  const headers = await _getAuthHeaders();
  const r = await api.post(`/melbrooks/session/${sessionId}/begin`, {}, { headers });
  return r.data;
}

export async function mbCreateRound(sessionId: number, description: string, prize: number): Promise<any> {
  const headers = await _getAuthHeaders();
  const r = await api.post(`/melbrooks/session/${sessionId}/round/create`, { description, prize }, { headers });
  return r.data;
}

export async function mbBid(roundId: number, amount: number): Promise<any> {
  const headers = await _getAuthHeaders();
  const r = await api.post(`/melbrooks/round/${roundId}/bid`, { amount }, { headers });
  return r.data;
}

export async function mbCloseRound(roundId: number): Promise<any> {
  const headers = await _getAuthHeaders();
  const r = await api.post(`/melbrooks/round/${roundId}/close`, {}, { headers });
  return r.data;
}

export async function mbDraw(roundId: number, kind: string, payload: any): Promise<any> {
  const headers = await _getAuthHeaders();
  const r = await api.post(`/melbrooks/round/${roundId}/draw`, { kind, payload }, { headers });
  return r.data;
}

export async function mbSettle(roundId: number, result: 'bidder_win' | 'bidder_lose'): Promise<any> {
  const headers = await _getAuthHeaders();
  const r = await api.post(`/melbrooks/round/${roundId}/settle`, { result }, { headers });
  return r.data;
}

export async function mbVoidRound(roundId: number): Promise<any> {
  const headers = await _getAuthHeaders();
  const r = await api.post(`/melbrooks/round/${roundId}/void`, {}, { headers });
  return r.data;
}

export async function mbConclude(sessionId: number): Promise<any> {
  const headers = await _getAuthHeaders();
  const r = await api.post(`/melbrooks/session/${sessionId}/conclude`, {}, { headers });
  return r.data;
}

export async function mbDeleteSession(sessionId: number): Promise<any> {
  const headers = await _getAuthHeaders();
  const r = await api.post(`/melbrooks/session/${sessionId}/delete`, {}, { headers });
  return r.data;
}

export async function mbDeleteAllSessions(): Promise<any> {
  const headers = await _getAuthHeaders();
  const r = await api.post('/melbrooks/sessions/delete-all', {}, { headers });
  return r.data;
}

export async function mbGsPokerDeck(): Promise<any> {
  const headers = await _getAuthHeaders();
  const r = await api.get('/melbrooks/gspoker-deck', { headers });
  return r.data;
}

export default api;

