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

export async function fetchBookkeepingSummary() {
  const r = await api.get('/bookkeeping/summary');
  return r.data;
}

export async function fetchBookkeepingAccounts() {
  const r = await api.get('/bookkeeping/accounts');
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

export async function endSopranosSession(sessionData: any) {
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

export async function endBreakingBadSession(data: { num_bets: number; net_pnl: number }) {
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

export async function endHarryPotterSession(data: { num_bets: number; net_pnl: number }) {
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

export async function endGoodShepherdSession(data: { num_bets: number; net_pnl: number }) {
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

export default api;

