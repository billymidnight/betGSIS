import axios from 'axios';
import { useAuthStore } from '../state/authStore';
import supabase from '../supabaseClient';

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
// import.meta.env.VITE_API_URL ||
const api = axios.create({
  baseURL,
  timeout: 10000,
});

// yaya pam naresh

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

export async function fetchBookkeepingSummary() {
  const r = await api.get('/bookkeeping/summary');
  return r.data;
}

export async function fetchBookkeepingAccounts() {
  const r = await api.get('/bookkeeping/accounts');
  return r.data;
}

export async function fetchAllBets() {
  const r = await api.get('/bookkeeping/all-bets');
  return r.data;
}

export async function editBetResult(betId: number, result: 'win' | 'loss' | 'push') {
  const r = await api.post('/bookkeeping/edit-bet', { bet_id: betId, result });
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

export async function fetchMyBets() {
  const session = await supabase.auth.getSession();
  let token = (session as any)?.data?.session?.access_token;
  if (!token) token = useAuthStore.getState().accessToken ?? null;
  if (import.meta.env.DEV) console.log('fetchMyBets token present?', !!token);
  if (!token) return [];
  const headers = { Authorization: `Bearer ${token}` };
  const r = await api.get('/bets/my', { headers });
  return r.data.bets || [];
}

export async function fetchCurrentGame() {
  const r = await api.get('/games/current');
  return (r.data && r.data.game_id) ? r.data.game_id : null;
}

export async function fetchActiveBets() {
  const session = await supabase.auth.getSession();
  let token = (session as any)?.data?.session?.access_token;
  if (!token) token = useAuthStore.getState().accessToken ?? null;
  if (import.meta.env.DEV) console.log('fetchActiveBets token present?', !!token);
  if (!token) return [];
  const headers = { Authorization: `Bearer ${token}` };
  const r = await api.get('/bets/active', { headers });
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

export default api;

