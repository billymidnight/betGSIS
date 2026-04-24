import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuthStore } from '../lib/state/authStore';
import {
  gsPokerListSessions,
  gsPokerCreateSession,
  gsPokerJoinSession,
  gsPokerDeleteSession,
  gsPokerStartGame,
  gsPokerBotCreate,
} from '../lib/api/api';
import GSPokerTable from './GSPokerTable';
import './GSPoker.css';

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

interface GSCard {
  character_id: number;
  roll_number: number;
  name: string;
  img_filename: string;
  height: number;
  house: string;
  sport: string | null;
  was_404: boolean;
  year_joined: number;
  was_prefect: boolean;
  expelled: boolean;
}

interface GSPokerSession {
  session_id: number;
  name: string;
  host_id: string;
  host_screenname?: string;
  status: 'lobby' | 'playing' | 'ended';
  starting_stack: number;
  small_blind: number;
  big_blind: number;
  max_players: number;
  created_at: string;
}

// ═══════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════

const HOUSE_COLORS: Record<string, string> = {
  Spring: '#22c55e',
  Summer: '#eab308',
  Autumn: '#ef4444',
  Winter: '#3b82f6',
};

const SPORT_EMOJI: Record<string, string> = {
  Football: '⚽',
  Basketball: '🏀',
  Cricket: '🏏',
  Hockey: '🏑',
  Tennis: '🎾',
  'Triple Jump': '🐸',
};

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

function GSPokerCard({ card }: { card: GSCard }) {
  const houseColor = HOUSE_COLORS[card.house] || '#64748b';
  const sportLetter = SPORT_EMOJI[card.sport || ''] || (card.sport || '?')[0]?.toUpperCase() || '?';
  const imgUrl = `${API_BASE.replace('/api', '')}/goodshepherd/${card.img_filename}`;

  return (
    <div className={`gsp-card ${card.was_404 ? 'gsp-card-404' : ''}`}>
      <div className="gsp-card-strip">
        <span className="gsp-card-sport">{sportLetter}</span>
        <span className="gsp-card-height">{Math.round(card.height)} cm</span>
        <span className="gsp-card-house-dot" style={{ backgroundColor: houseColor }} />
      </div>
      <img
        className="gsp-card-img"
        src={imgUrl}
        alt={card.name}
        onError={(e) => {
          (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150"><rect width="200" height="150" fill="%23222"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="16" fill="%23666">No Image</text></svg>';
        }}
      />
      <div className="gsp-card-name">{card.name}</div>
      <div className="gsp-card-year-chip">{card.year_joined}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Hand ranking data
// ═══════════════════════════════════════════════════════════════════

// True counts from running all 1820 (16C4) combos through the evaluator
// Ordered by # ways descending (most common → rarest)
const HAND_RANKINGS = [
  { rank: 1, name: 'One Pair', desc: 'Two cards share the same sport', count: 831, pct: 45.66, exampleRolls: [6014, 6573, 7055, 6249] },
  { rank: 2, name: 'Trips', desc: 'Three cards share the same sport', count: 386, pct: 21.21, exampleRolls: [6470, 6738, 6353, 6064] },
  { rank: 3, name: 'Boat', desc: 'Two pairs of sports (e.g., ⚽⚽ + 🏀🏀)', count: 190, pct: 10.44, exampleRolls: [6885, 6521, 6262, 7078] },
  { rank: 4, name: 'Straight', desc: 'Four consecutive year-joined values', count: 108, pct: 5.93, exampleRolls: [6081, 6249, 6438, 6521] },
  { rank: 5, name: 'Quads', desc: 'All four cards share the same sport', count: 34, pct: 1.87, exampleRolls: [6353, 6898, 6470, 6885] },
  { rank: 6, name: 'Flush', desc: 'All four cards share the same house', count: 16, pct: 0.88, exampleRolls: [7078, 6014, 6470, 6898] },
  { rank: 7, name: 'The 404', desc: 'All four cards are Error 404 band members', count: 5, pct: 0.27, exampleRolls: [6014, 6521, 6885, 6908] },
];

// ═══════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════

export default function GSPoker() {
  const user = useAuthStore((s) => s.user);
  const isBookie = (user?.role || '').toUpperCase() === 'BOOKIE';
  const myUserId = user?.user_id || '';

  const [tab, setTab] = useState<'play' | 'help' | 'trainer'>('play');
  const [allCards, setAllCards] = useState<GSCard[]>([]);
  const [sessions, setSessions] = useState<GSPokerSession[]>([]);
  const [enrolledIds, setEnrolledIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Active game — when set, renders the poker table
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);

  // Create session form
  const [showCreate, setShowCreate] = useState(false);
  const [cName, setCName] = useState('');
  const [cStack, setCStack] = useState('200');
  const [cSB, setCSB] = useState('1');
  const [cBB, setCBB] = useState('2');
  const [cMaxPlayers, setCMaxPlayers] = useState(3);

  // Sort for hand rankings
  const [rankSort, setRankSort] = useState<'asc' | 'desc'>('asc');

  // Trainer state
  const [trainerCards, setTrainerCards] = useState<GSCard[]>([]);
  const [trainerGuess, setTrainerGuess] = useState<string | null>(null);
  const [trainerAnswer, setTrainerAnswer] = useState<string | null>(null);
  const [trainerCorrect, setTrainerCorrect] = useState<boolean | null>(null);
  const [trainerScore, setTrainerScore] = useState({ correct: 0, total: 0 });

  // Client-side hand evaluator (mirrors backend gs_poker_engine.py)
  const evaluateHand = (cards: GSCard[]): string => {
    if (cards.length !== 4) return 'High Card';
    // The 404
    if (cards.every(c => c.was_404)) return 'The 404';
    // Sport counts (needed for Quads check first)
    const sportCounts: Record<string, number> = {};
    cards.forEach(c => { sportCounts[c.sport || ''] = (sportCounts[c.sport || ''] || 0) + 1; });
    const counts = Object.values(sportCounts).sort((a, b) => b - a);
    // Quads (checked BEFORE straight — quads beats straight)
    if (counts[0] === 4) return 'Quads';
    // Flush: all same house
    if (new Set(cards.map(c => c.house)).size === 1) return 'Flush';
    // Straight: 4 consecutive year_joined
    const years = cards.map(c => c.year_joined).sort((a, b) => a - b);
    const isStraight = years[3] - years[0] === 3 && new Set(years).size === 4;
    if (isStraight) return 'Straight';
    if (counts[0] === 2 && counts[1] === 2) return 'Boat';
    if (counts[0] === 3) return 'Trips';
    if (counts[0] === 2) return 'One Pair';
    return 'High Card';
  };

  const trainerDraw = () => {
    if (allCards.length < 4) return;
    const shuffled = [...allCards].sort(() => Math.random() - 0.5);
    setTrainerCards(shuffled.slice(0, 4));
    setTrainerGuess(null);
    setTrainerAnswer(null);
    setTrainerCorrect(null);
  };

  const trainerCheck = () => {
    if (!trainerGuess || trainerCards.length !== 4) return;
    const answer = evaluateHand(trainerCards);
    setTrainerAnswer(answer);
    const correct = trainerGuess === answer;
    setTrainerCorrect(correct);
    setTrainerScore(prev => ({ correct: prev.correct + (correct ? 1 : 0), total: prev.total + 1 }));
  };

  const RANK_OPTIONS = ['High Card', 'One Pair', 'Trips', 'Boat', 'Straight', 'Flush', 'Quads', 'The 404'];
  const RANK_NUM: Record<string, number> = { 'High Card': 1, 'One Pair': 2, 'Trips': 3, 'Boat': 4, 'Straight': 5, 'Flush': 6, 'Quads': 7, 'The 404': 8 };

  // Full evaluator returning [rank, tiebreaker] — mirrors backend gs_poker_engine.py exactly
  const evalFull = (cards: GSCard[]): [number, number[]] => {
    const name = evaluateHand(cards);
    const rank = RANK_NUM[name] || 1;
    const heights = cards.map(c => c.height).sort((a, b) => b - a);

    if (name === 'Straight') {
      const maxYear = Math.max(...cards.map(c => c.year_joined));
      return [rank, [maxYear, ...heights]];
    }
    if (name === 'One Pair') {
      // Pair heights first, then kicker heights — must match backend
      const sportCounts: Record<string, number> = {};
      cards.forEach(c => { sportCounts[c.sport || ''] = (sportCounts[c.sport || ''] || 0) + 1; });
      const pairedSport = Object.entries(sportCounts).find(([, ct]) => ct === 2)?.[0] || '';
      const pairH = cards.filter(c => c.sport === pairedSport).map(c => c.height).sort((a, b) => b - a);
      const kickerH = cards.filter(c => c.sport !== pairedSport).map(c => c.height).sort((a, b) => b - a);
      return [rank, [...pairH, ...kickerH]];
    }
    if (name === 'Trips') {
      const sportCounts: Record<string, number> = {};
      cards.forEach(c => { sportCounts[c.sport || ''] = (sportCounts[c.sport || ''] || 0) + 1; });
      const tripSport = Object.entries(sportCounts).find(([, ct]) => ct === 3)?.[0] || '';
      const tripH = cards.filter(c => c.sport === tripSport).map(c => c.height).sort((a, b) => b - a);
      const kickerH = cards.filter(c => c.sport !== tripSport).map(c => c.height).sort((a, b) => b - a);
      return [rank, [...tripH, ...kickerH]];
    }
    return [rank, heights];
  };

  // Compare two evaluated hands: 1 = a wins, -1 = b wins, 0 = tie
  const compareHands = (a: [number, number[]], b: [number, number[]]): number => {
    if (a[0] !== b[0]) return a[0] > b[0] ? 1 : -1;
    for (let i = 0; i < Math.max(a[1].length, b[1].length); i++) {
      const va = a[1][i] ?? 0, vb = b[1][i] ?? 0;
      if (va !== vb) return va > vb ? 1 : -1;
    }
    return 0;
  };

  // Hand Calculator state
  const [calcMode, setCalcMode] = useState<'trainer' | 'calculator' | 'stats'>('trainer');
  const [calcHandA, setCalcHandA] = useState<GSCard[]>([]);
  const [calcHandB, setCalcHandB] = useState<GSCard[]>([]);
  const [calcPicking, setCalcPicking] = useState<'A' | 'B' | null>('A');
  const [calcResult, setCalcResult] = useState<{ aWins: number; bWins: number; ties: number; total: number; boards: { card1: GSCard; card2: GSCard; rankA: string; rankB: string; winner: string }[] } | null>(null);
  const [calcShowBoards, setCalcShowBoards] = useState(false);
  const [calcSwapping, setCalcSwapping] = useState<{ hand: 'A' | 'B'; idx: number } | null>(null);

  const calcPickCard = (card: GSCard) => {
    const usedIds = new Set([...calcHandA, ...calcHandB].map(c => c.character_id));
    if (usedIds.has(card.character_id)) return;
    if (calcPicking === 'A' && calcHandA.length < 2) {
      const next = [...calcHandA, card];
      setCalcHandA(next);
      if (next.length === 2) setCalcPicking('B');
    } else if (calcPicking === 'B' && calcHandB.length < 2) {
      const next = [...calcHandB, card];
      setCalcHandB(next);
      if (next.length === 2) setCalcPicking(null);
    }
  };

  const calcReset = () => {
    setCalcHandA([]); setCalcHandB([]); setCalcPicking('A'); setCalcResult(null); setCalcSwapping(null); setCalcShowBoards(false);
  };

  const calcSwapCard = (card: GSCard) => {
    if (!calcSwapping) return;
    const usedIds = new Set([...calcHandA, ...calcHandB].map(c => c.character_id));
    if (usedIds.has(card.character_id)) return;
    if (calcSwapping.hand === 'A') {
      const next = [...calcHandA];
      next[calcSwapping.idx] = card;
      setCalcHandA(next);
    } else {
      const next = [...calcHandB];
      next[calcSwapping.idx] = card;
      setCalcHandB(next);
    }
    setCalcSwapping(null);
    setCalcResult(null);
  };

  const calcRun = () => {
    if (calcHandA.length !== 2 || calcHandB.length !== 2) return;
    const usedIds = new Set([...calcHandA, ...calcHandB].map(c => c.character_id));
    const remaining = allCards.filter(c => !usedIds.has(c.character_id));
    let aWins = 0, bWins = 0, ties = 0, total = 0;
    // All 14C2 community card combos
    for (let i = 0; i < remaining.length; i++) {
      for (let j = i + 1; j < remaining.length; j++) {
        const community = [remaining[i], remaining[j]];
        const handA = evalFull([...calcHandA, ...community]);
        const handB = evalFull([...calcHandB, ...community]);
        const cmp = compareHands(handA, handB);
        if (cmp > 0) aWins++;
        else if (cmp < 0) bWins++;
        else ties++;
        total++;
      }
    }
    const boards: { card1: GSCard; card2: GSCard; rankA: string; rankB: string; winner: string }[] = [];
    const usedIds2 = new Set([...calcHandA, ...calcHandB].map(c => c.character_id));
    const remaining2 = allCards.filter(c => !usedIds2.has(c.character_id));
    aWins = 0; bWins = 0; ties = 0; total = 0;
    for (let i = 0; i < remaining2.length; i++) {
      for (let j = i + 1; j < remaining2.length; j++) {
        const community = [remaining2[i], remaining2[j]];
        const handA = evalFull([...calcHandA, ...community]);
        const handB = evalFull([...calcHandB, ...community]);
        const cmp = compareHands(handA, handB);
        const w = cmp > 0 ? 'A' : cmp < 0 ? 'B' : 'Tie';
        if (cmp > 0) aWins++; else if (cmp < 0) bWins++; else ties++;
        total++;
        const rankNames: Record<number, string> = { 1: 'High Card', 2: 'One Pair', 3: 'Trips', 4: 'Boat', 5: 'Straight', 6: 'Flush', 7: 'Quads', 8: 'The 404' };
        boards.push({ card1: remaining2[i], card2: remaining2[j], rankA: rankNames[handA[0]] || '?', rankB: rankNames[handB[0]] || '?', winner: w });
      }
    }
    setCalcResult({ aWins, bWins, ties, total, boards });
    setCalcShowBoards(false);
  };

  // Auto-clear messages
  useEffect(() => {
    if (error || successMsg) {
      const t = setTimeout(() => { setError(''); setSuccessMsg(''); }, 4000);
      return () => clearTimeout(t);
    }
  }, [error, successMsg]);

  // Load cards on mount
  useEffect(() => {
    (async () => {
      try {
        const base = API_BASE.replace('/api', '');
        const r = await fetch(`${API_BASE}/trading/goodshepherd/characters`);
        const data = await r.json();
        setAllCards(data.characters || []);
      } catch {
        // silently fail — cards are just for display
      }
    })();
  }, []);

  // Load sessions
  const loadSessions = useCallback(async () => {
    try {
      const res = await gsPokerListSessions();
      setSessions(res.sessions || []);
      setEnrolledIds(new Set(res.enrolled_session_ids || []));
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    loadSessions();
    const iv = setInterval(loadSessions, 8000);
    return () => clearInterval(iv);
  }, [loadSessions]);

  const handleCreateSession = async () => {
    if (!cName.trim()) { setError('Session name is required'); return; }
    setLoading(true);
    try {
      await gsPokerCreateSession({
        name: cName.trim(),
        starting_stack: parseFloat(cStack) || 200,
        small_blind: parseFloat(cSB) || 1,
        big_blind: parseFloat(cBB) || 2,
        max_players: cMaxPlayers,
      });
      setShowCreate(false);
      setCName('');
      setSuccessMsg('Table created!');
      loadSessions();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Create failed');
    }
    setLoading(false);
  };

  const handleJoin = async (sid: number) => {
    setLoading(true);
    try {
      await gsPokerJoinSession(sid);
      setSuccessMsg('Joined table!');
      loadSessions();
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Join failed';
      if (msg.toLowerCase().includes('already')) {
        setSuccessMsg('Already at this table');
      } else {
        setError(msg);
      }
    }
    setLoading(false);
  };

  const handleDelete = async (sid: number) => {
    if (!window.confirm('Delete this table?')) return;
    setLoading(true);
    try {
      await gsPokerDeleteSession(sid);
      setSuccessMsg('Table deleted');
      loadSessions();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Delete failed');
    }
    setLoading(false);
  };

  const handleStartGame = async (sid: number) => {
    setLoading(true);
    try {
      await gsPokerStartGame(sid);
      setActiveSessionId(sid);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Start failed');
    }
    setLoading(false);
  };

  const handleEnterTable = (sid: number) => {
    setActiveSessionId(sid);
  };

  // Build card lookup by roll_number
  const cardsByRoll: Record<number, GSCard> = {};
  for (const c of allCards) cardsByRoll[c.roll_number] = c;

  const sortedRankings = rankSort === 'asc'
    ? [...HAND_RANKINGS]
    : [...HAND_RANKINGS].reverse();

  // ═══════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════

  // If in an active game, render the poker table
  if (activeSessionId !== null) {
    return <GSPokerTable sessionId={activeSessionId} onLeave={() => { setActiveSessionId(null); loadSessions(); }} />;
  }

  return (
    <div className="gsp-page">
      <div className="gsp-header">
        <h1>Good Shepherd Poker</h1>
        <p className="gsp-subtitle">Custom 4-card poker with GS trading cards. 16-card deck. 3 streets. No mercy.</p>
      </div>

      {/* Tabs */}
      <div className="gsp-tabs">
        <button className={`gsp-tab ${tab === 'play' ? 'gsp-tab-active' : ''}`} onClick={() => setTab('play')}>Play</button>
        <button className={`gsp-tab ${tab === 'help' ? 'gsp-tab-active' : ''}`} onClick={() => setTab('help')}>Rules &amp; Rankings</button>
        <button className={`gsp-tab ${tab === 'trainer' ? 'gsp-tab-active' : ''}`} onClick={() => setTab('trainer')}>Trainer</button>
      </div>

      {error && <div className="pari-toast pari-toast-error">{error}</div>}
      {successMsg && <div className="pari-toast pari-toast-success">{successMsg}</div>}

      {/* ════════ PLAY TAB ════════ */}
      {tab === 'play' && (
        <>
          {/* Play vs Bot (BOOKIE only) */}
          {isBookie && (
            <section className="gsp-section">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <h2 style={{ margin: 0 }}>Play vs Bot</h2>
                <span style={{ fontSize: '0.75rem', color: '#64748b', background: '#1e293b', padding: '2px 8px', borderRadius: 6 }}>Heads-Up</span>
              </div>
              <p className="gsp-muted" style={{ marginBottom: 12 }}>
                Practice heads-up against the GS Bot. It computes exact equity on every decision.
              </p>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  className="pari-btn pari-btn-green"
                  disabled={loading}
                  onClick={async () => {
                    setLoading(true);
                    try {
                      const res = await gsPokerBotCreate({
                        starting_stack: parseFloat(cStack) || 200,
                        small_blind: parseFloat(cSB) || 1,
                        big_blind: parseFloat(cBB) || 2,
                      });
                      setActiveSessionId(res.session_id);
                    } catch (err: any) {
                      setError(err?.response?.data?.error || 'Failed to create bot game');
                    }
                    setLoading(false);
                  }}
                >
                  Start vs Bot
                </button>
                <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                  Stack: {cStack} · Blinds: {cSB}/{cBB}
                </span>
              </div>
            </section>
          )}

          <section className="gsp-section">
            <h2>Open Tables</h2>
            {sessions.filter(s => s.status === 'lobby').length === 0 ? (
              <p className="gsp-muted">No tables open right now.</p>
            ) : (
              <div className="gsp-session-grid">
                {sessions.filter(s => s.status === 'lobby').map(s => {
                  const amHost = s.host_id === myUserId;
                  const amIn = enrolledIds.has(s.session_id);
                  return (
                    <div className="gsp-session-card" key={s.session_id}>
                      <div className="gsp-session-card-header">
                        <span className="gsp-session-name">{s.name}</span>
                        <span className="pari-badge pari-badge-lobby">LOBBY</span>
                        {amHost && <button onClick={() => handleDelete(s.session_id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', opacity: 0.5, marginLeft: 'auto' }} title="Delete">🗑️</button>}
                      </div>
                      <div className="gsp-session-meta">
                        <span>Host: <strong>{s.host_screenname || '—'}</strong></span>
                        <span>Stack: <strong>{s.starting_stack}</strong></span>
                        <span>Blinds: <strong>{s.small_blind}/{s.big_blind}</strong></span>
                        <span>Players: <strong>{s.max_players}-max</strong></span>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {!amIn && (
                          <button className="pari-btn pari-btn-green" onClick={() => handleJoin(s.session_id)} disabled={loading}>Take Seat</button>
                        )}
                        {amIn && <span className="pari-badge pari-badge-enrolled" style={{ alignSelf: 'center' }}>SEATED</span>}
                        {amHost && (
                          <button className="pari-btn pari-btn-green" onClick={() => handleStartGame(s.session_id)} disabled={loading}>Start Game</button>
                        )}
                        <button className="pari-btn pari-btn-blue" onClick={() => handleEnterTable(s.session_id)} disabled={loading}>
                          {amIn ? 'Enter Table' : 'Watch'}
                        </button>
                        {amHost && (
                          <button className="pari-btn pari-btn-void" onClick={() => handleDelete(s.session_id)} disabled={loading}>Delete</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Past / Active sessions */}
          {sessions.filter(s => s.status !== 'lobby').length > 0 && (
            <section className="gsp-section">
              <h2>My Tables</h2>
              <div className="gsp-session-grid">
                {sessions.filter(s => s.status !== 'lobby').map(s => (
                  <div className="gsp-session-card" key={s.session_id}>
                    <div className="gsp-session-card-header">
                      <span className="gsp-session-name">{s.name}</span>
                      <span className={`pari-badge ${s.status === 'playing' ? 'pari-badge-active' : 'pari-badge-concluded'}`}>
                        {s.status.toUpperCase()}
                      </span>
                      {s.host_id === myUserId && <button onClick={() => handleDelete(s.session_id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', opacity: 0.5, marginLeft: 'auto' }} title="Delete">🗑️</button>}
                    </div>
                    <div className="gsp-session-meta">
                      <span>Host: <strong>{s.host_screenname || '—'}</strong></span>
                      <span>Blinds: <strong>{s.small_blind}/{s.big_blind}</strong></span>
                    </div>
                    <button className="pari-btn pari-btn-outline" onClick={() => handleEnterTable(s.session_id)}>
                      {s.status === 'ended' ? 'View Results' : 'Enter'}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Create Session (BOOKIE only) */}
          {isBookie && (
            <section className="gsp-section">
              {!showCreate ? (
                <button className="pari-btn pari-btn-green" onClick={() => setShowCreate(true)}>+ Create Table</button>
              ) : (
                <div className="gsp-create-form">
                  <h3 style={{ color: '#f1f5f9', margin: '0 0 12px' }}>New Table</h3>
                  <div className="pari-form-row">
                    <label>Table Name</label>
                    <input value={cName} onChange={e => setCName(e.target.value)} placeholder="Friday Night GS Poker..." />
                  </div>
                  <div className="pari-form-row">
                    <label>Starting Stack</label>
                    <input type="number" value={cStack} onChange={e => setCStack(e.target.value)} />
                  </div>
                  <div className="pari-form-row">
                    <label>Small Blind</label>
                    <input type="number" value={cSB} onChange={e => setCSB(e.target.value)} />
                  </div>
                  <div className="pari-form-row">
                    <label>Big Blind</label>
                    <input type="number" value={cBB} onChange={e => setCBB(e.target.value)} />
                  </div>
                  <div className="pari-form-row">
                    <label>Max Players</label>
                    <div className="pari-sides-picker">
                      {[3, 4].map(n => (
                        <button
                          key={n}
                          className={`pari-sides-btn ${cMaxPlayers === n ? 'pari-sides-btn-active' : ''}`}
                          onClick={() => setCMaxPlayers(n)}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="pari-form-actions">
                    <button className="pari-btn pari-btn-green" onClick={handleCreateSession} disabled={loading}>Create Table</button>
                    <button className="pari-btn pari-btn-outline" onClick={() => setShowCreate(false)}>Cancel</button>
                  </div>
                </div>
              )}
            </section>
          )}
        </>
      )}

      {/* ════════ HELP TAB ════════ */}
      {tab === 'help' && (
        <div className="gsp-help">
          <h2>How to Play</h2>
          <p>
            Good Shepherd Poker plays like No-Limit Hold'em, but with a 16-card deck of GS trading cards
            and 4-card hands. Each player is dealt 2 hole cards, then 2 community cards are revealed across
            2 streets of betting. You make your best 4-card hand from all 4 cards — no selection, you play them all.
          </p>
          <p>
            <strong>Pairing</strong> is done with <strong>sports</strong> — two Football cards make a pair.{' '}
            <strong>Flushes</strong> use <strong>houses</strong> — four Spring cards is a flush.{' '}
            <strong>Straights</strong> use <strong>year joined</strong> — four consecutive years.{' '}
            <strong>Tiebreaking</strong> always comes down to <strong>height</strong> — tallest card wins.
          </p>

          <h3>Hand Rankings</h3>
          <div className="gsp-sort-toggle">
            <button className={`gsp-sort-btn ${rankSort === 'asc' ? 'gsp-sort-btn-active' : ''}`} onClick={() => setRankSort('asc')}>Lowest First</button>
            <button className={`gsp-sort-btn ${rankSort === 'desc' ? 'gsp-sort-btn-active' : ''}`} onClick={() => setRankSort('desc')}>Highest First</button>
          </div>

          <table className="gsp-rank-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Hand</th>
                <th>Description</th>
                <th>Combos</th>
                <th>Odds</th>
                <th>Example</th>
              </tr>
            </thead>
            <tbody>
              {sortedRankings.map(r => (
                <tr key={r.rank} className={r.rank === 8 ? 'gsp-rank-404' : ''}>
                  <td className="gsp-rank-num">{r.rank}</td>
                  <td className="gsp-rank-name">{r.name}</td>
                  <td>{r.desc}</td>
                  <td className="gsp-rank-odds">{r.count}</td>
                  <td className="gsp-rank-odds">{r.pct}%</td>
                  <td>
                    {r.exampleRolls.length > 0 && allCards.length > 0 ? (
                      <div className="gsp-example-cards">
                        {r.exampleRolls.map(roll => {
                          const c = cardsByRoll[roll];
                          return c ? <GSPokerCard key={roll} card={c} /> : null;
                        })}
                      </div>
                    ) : r.rank === 1 ? (
                      <span style={{ color: '#64748b', fontSize: '0.8rem' }}>Any non-matching hand</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3>Tiebreaking</h3>
          <p>
            When two or more players share the same hand rank, ties are broken by <strong>height (cm)</strong>.
            Compare the tallest card in the relevant group first (e.g., tallest card in the pair for One Pair),
            then proceed downward. Height is always the final arbiter; upon height tie on best hand, pots will be chopped akin to NLH.
          </p>
          <p>
            For <strong>Straights</strong>, the straight ending on a higher year wins first. If both straights
            end on the same year, compare by tallest card height.
          </p>
          <p>
            For <strong>Boat (Two Pair)</strong>, compare the maximum height across both pairs: take the
            single tallest card among all 4 paired cards for each player, and the taller one wins.
          </p>

          <h3>Betting Streets</h3>
          <p>
            <strong>Pre-flop:</strong> 2 hole cards dealt. Action opens UTG (left of BB). Fold, call, or raise.
          </p>
          <p>
            <strong>Flop:</strong> 1 community card revealed. Action opens at SB. Check, bet, raise, or fold.
          </p>
          <p>
            <strong>Final Card:</strong> Last community card revealed — hand is complete. Final round of action,
            then showdown.
          </p>
          <p>
            At any point, if all but one player folds, the remaining player wins the pot without a showdown.
            When a player goes all-in, all remaining hands are shown face-up and the remaining community
            cards are revealed with a slow animation.
          </p>

          <h3>Deck Distribution</h3>
          <div className="gsp-dist-grid">
            <table className="gsp-dist-table">
              <thead><tr><th>Sport</th><th>Count</th></tr></thead>
              <tbody>
                <tr><td>Football</td><td>7</td></tr>
                <tr><td>Basketball</td><td>5</td></tr>
                <tr><td>Hockey</td><td>1</td></tr>
                <tr><td>Cricket</td><td>1</td></tr>
                <tr><td>Tennis</td><td>1</td></tr>
                <tr><td>Triple Jump</td><td>1</td></tr>
              </tbody>
            </table>
            <table className="gsp-dist-table">
              <thead><tr><th>House</th><th>Count</th></tr></thead>
              <tbody>
                <tr><td><span style={{ color: '#ef4444' }}>Autumn</span></td><td>6</td></tr>
                <tr><td><span style={{ color: '#22c55e' }}>Spring</span></td><td>4</td></tr>
                <tr><td><span style={{ color: '#3b82f6' }}>Winter</span></td><td>3</td></tr>
                <tr><td><span style={{ color: '#eab308' }}>Summer</span></td><td>3</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ════════ TRAINER TAB ════════ */}
      {tab === 'trainer' && (
        <div className="gsp-help" style={{ maxWidth: 800 }}>
          {/* Sub-tabs */}
          <div className="gsp-sort-toggle" style={{ marginBottom: 20 }}>
            <button className={`gsp-sort-btn ${calcMode === 'trainer' ? 'gsp-sort-btn-active' : ''}`} onClick={() => setCalcMode('trainer')}>Trainer</button>
            <button className={`gsp-sort-btn ${calcMode === 'calculator' ? 'gsp-sort-btn-active' : ''}`} onClick={() => setCalcMode('calculator')}>Hand Calculator</button>
            <button className={`gsp-sort-btn ${calcMode === 'stats' ? 'gsp-sort-btn-active' : ''}`} onClick={() => setCalcMode('stats')}>Stats {!isBookie && '🔒'}</button>
          </div>

          {/* ── Trainer ── */}
          {calcMode === 'trainer' && (
            <>
              <h2>Hand Trainer</h2>
              <p style={{ color: '#94a3b8', marginBottom: 16 }}>
                Draw 4 random cards, guess the hand rank, and check your answer. Score: <strong style={{ color: '#fbbf24' }}>{trainerScore.correct}/{trainerScore.total}</strong>
                {trainerScore.total > 0 && <span style={{ color: '#64748b' }}> ({Math.round(trainerScore.correct / trainerScore.total * 100)}%)</span>}
              </p>

              <button className="pari-btn pari-btn-green" onClick={trainerDraw} style={{ marginBottom: 20 }}>
                {trainerCards.length > 0 ? 'Draw Again' : 'Draw 4 Cards'}
              </button>

              {trainerCards.length === 4 && (
                <>
                  <div className="gsp-example-cards" style={{ marginBottom: 20 }}>
                    {trainerCards.map(c => <GSPokerCard key={c.character_id} card={c} />)}
                  </div>

                  {trainerAnswer === null ? (
                    <div>
                      <p style={{ color: '#e2e8f0', fontWeight: 600, marginBottom: 10 }}>What rank is this hand?</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                        {RANK_OPTIONS.map(r => (
                          <button
                            key={r}
                            className={`pari-sides-btn ${trainerGuess === r ? 'pari-sides-btn-active' : ''}`}
                            onClick={() => setTrainerGuess(r)}
                            style={{ padding: '8px 16px', minWidth: 'auto', width: 'auto', height: 'auto' }}
                          >
                            {r}
                          </button>
                        ))}
                      </div>
                      <button className="pari-btn pari-btn-blue" onClick={trainerCheck} disabled={!trainerGuess}>
                        Check Answer
                      </button>
                    </div>
                  ) : (
                    <div style={{
                      padding: '16px 20px', borderRadius: 12,
                      background: trainerCorrect ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                      border: `1px solid ${trainerCorrect ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                      marginBottom: 16,
                    }}>
                      <div style={{ fontSize: '1.2rem', fontWeight: 800, color: trainerCorrect ? '#22c55e' : '#f87171', marginBottom: 4 }}>
                        {trainerCorrect ? 'Correct!' : 'Wrong!'}
                      </div>
                      <div style={{ color: '#e2e8f0' }}>
                        The hand is <strong style={{ color: '#fbbf24' }}>{trainerAnswer}</strong>
                        {!trainerCorrect && <span>. You guessed <strong style={{ color: '#94a3b8' }}>{trainerGuess}</strong>.</span>}
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* ── Hand Calculator ── */}
          {calcMode === 'calculator' && (
            <>
              <h2>Hand Calculator</h2>
              <p style={{ color: '#94a3b8', marginBottom: 16 }}>
                Pick 2 hole cards for each hand. Runs all {allCards.length > 4 ? `${(allCards.length - 4) * (allCards.length - 5) / 2}` : '?'} possible boards to compute win equity.
              </p>

              {/* Picking indicator */}
              <div style={{ marginBottom: 12, fontWeight: 600, color: '#e2e8f0' }}>
                {calcSwapping && `Click a card below to replace ${calcSwapping.hand === 'A' ? 'Hand A' : 'Hand B'} card ${calcSwapping.idx + 1}`}
                {!calcSwapping && calcPicking === 'A' && `Pick card ${calcHandA.length + 1} of 2 for Hand A`}
                {!calcSwapping && calcPicking === 'B' && `Pick card ${calcHandB.length + 1} of 2 for Hand B`}
                {!calcSwapping && calcPicking === null && !calcResult && 'Both hands selected — click Calculate'}
                {!calcSwapping && calcPicking === null && calcResult && 'Click any card to swap it'}
              </div>

              {/* Selected hands — clickable for swapping */}
              <div style={{ display: 'flex', gap: 24, marginBottom: 16, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Hand A</div>
                  <div className="gsp-example-cards">
                    {calcHandA.map((c, idx) => (
                      <div key={c.character_id} onClick={() => { setCalcSwapping({ hand: 'A', idx }); setCalcPicking(null); }}
                        style={{ cursor: 'pointer', border: calcSwapping?.hand === 'A' && calcSwapping?.idx === idx ? '2px solid #3b82f6' : '2px solid transparent', borderRadius: 12 }}>
                        <GSPokerCard card={c} />
                      </div>
                    ))}
                    {calcHandA.length < 2 && <div style={{ width: 140, height: 180, border: '2px dashed #334155', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontSize: '0.8rem' }}>?</div>}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', fontWeight: 800, color: '#64748b', fontSize: '1.2rem' }}>vs</div>
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Hand B</div>
                  <div className="gsp-example-cards">
                    {calcHandB.map((c, idx) => (
                      <div key={c.character_id} onClick={() => { setCalcSwapping({ hand: 'B', idx }); setCalcPicking(null); }}
                        style={{ cursor: 'pointer', border: calcSwapping?.hand === 'B' && calcSwapping?.idx === idx ? '2px solid #ef4444' : '2px solid transparent', borderRadius: 12 }}>
                        <GSPokerCard card={c} />
                      </div>
                    ))}
                    {calcHandB.length < 2 && <div style={{ width: 140, height: 180, border: '2px dashed #334155', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontSize: '0.8rem' }}>?</div>}
                  </div>
                </div>
              </div>

              {/* Card picker grid — shown during initial pick OR swap */}
              {(calcPicking || calcSwapping) && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                  {allCards.map(c => {
                    const used = new Set([...calcHandA, ...calcHandB].map(x => x.character_id));
                    // When swapping, the card being replaced is available
                    if (calcSwapping) {
                      const swapCard = calcSwapping.hand === 'A' ? calcHandA[calcSwapping.idx] : calcHandB[calcSwapping.idx];
                      if (swapCard) used.delete(swapCard.character_id);
                    }
                    const isUsed = used.has(c.character_id);
                    return (
                      <button
                        key={c.character_id}
                        onClick={() => calcSwapping ? calcSwapCard(c) : calcPickCard(c)}
                        disabled={isUsed}
                        style={{
                          padding: '6px 12px', borderRadius: 8, border: '1px solid #334155',
                          background: isUsed ? '#0f172a' : '#1e293b', color: isUsed ? '#334155' : '#e2e8f0',
                          cursor: isUsed ? 'not-allowed' : 'pointer', fontSize: '0.78rem', fontWeight: 600,
                          opacity: isUsed ? 0.4 : 1, transition: 'all 0.12s',
                        }}
                      >
                        {SPORT_EMOJI[c.sport || ''] || '?'} {c.name.split(' ')[0]} ({c.height}cm)
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
                {calcPicking === null && !calcSwapping && calcHandA.length === 2 && calcHandB.length === 2 && (
                  <button className="pari-btn pari-btn-green" onClick={calcRun}>
                    Calculate Equity
                  </button>
                )}
                {calcSwapping && (
                  <button className="pari-btn pari-btn-outline" onClick={() => setCalcSwapping(null)}>Cancel Swap</button>
                )}
                <button className="pari-btn pari-btn-outline" onClick={calcReset}>Reset All</button>
              </div>

              {/* Results */}
              {calcResult && (
                <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: '16px 20px' }}>
                  <div style={{ display: 'flex', gap: 24, justifyContent: 'center', marginBottom: 12 }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#3b82f6', textTransform: 'uppercase' }}>Hand A</div>
                      <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#f1f5f9' }}>{(calcResult.aWins / calcResult.total * 100).toFixed(1)}%</div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{calcResult.aWins} wins</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Tie</div>
                      <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fbbf24' }}>{(calcResult.ties / calcResult.total * 100).toFixed(1)}%</div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{calcResult.ties} ties</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#ef4444', textTransform: 'uppercase' }}>Hand B</div>
                      <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#f1f5f9' }}>{(calcResult.bWins / calcResult.total * 100).toFixed(1)}%</div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{calcResult.bWins} wins</div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'center', fontSize: '0.72rem', color: '#64748b', marginBottom: 8 }}>
                    {calcResult.total} boards evaluated
                  </div>

                  {/* Expandable board details */}
                  <button
                    className="pari-btn pari-btn-outline"
                    style={{ width: '100%', fontSize: '0.75rem', padding: '6px' }}
                    onClick={() => setCalcShowBoards(!calcShowBoards)}
                  >
                    {calcShowBoards ? 'Hide' : 'Show'} All {calcResult.total} Boards
                  </button>
                  {calcShowBoards && (
                    <div style={{ maxHeight: 600, overflowY: 'auto', marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {calcResult.boards.map((b, i) => (
                        <div key={i} style={{
                          display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10,
                          background: b.winner === 'A' ? 'rgba(59,130,246,0.06)' : b.winner === 'B' ? 'rgba(239,68,68,0.06)' : 'rgba(251,191,36,0.06)',
                          border: '1px solid #1e293b',
                        }}>
                          <span style={{ color: '#64748b', fontWeight: 700, fontSize: '0.72rem', minWidth: 20 }}>{i + 1}</span>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <GSPokerCard card={b.card1} />
                            <GSPokerCard card={b.card2} />
                          </div>
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, marginLeft: 8 }}>
                            <div style={{ fontSize: '0.75rem' }}><span style={{ color: '#3b82f6', fontWeight: 700 }}>A:</span> {b.rankA}</div>
                            <div style={{ fontSize: '0.75rem' }}><span style={{ color: '#ef4444', fontWeight: 700 }}>B:</span> {b.rankB}</div>
                          </div>
                          <span style={{ fontWeight: 800, fontSize: '0.85rem', color: b.winner === 'A' ? '#3b82f6' : b.winner === 'B' ? '#ef4444' : '#fbbf24' }}>
                            {b.winner}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── Stats (BOOKIE only) ── */}
          {calcMode === 'stats' && !isBookie && (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <div style={{ fontSize: '3rem', marginBottom: 12 }}>🔒</div>
              <h3 style={{ color: '#e2e8f0', marginBottom: 8 }}>Locked</h3>
              <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Sorry, betGSIS traders have locked this market for now.</p>
            </div>
          )}
          {calcMode === 'stats' && isBookie && allCards.length > 0 && (() => {
            // Load hole card power rankings and match to actual card objects
            const POWER_DATA: { card1_roll: number; card2_roll: number; win_pct: number }[] = [
              {card1_roll:6521,card2_roll:6438,win_pct:88.78},{card1_roll:6521,card2_roll:6353,win_pct:88.13},
              {card1_roll:6353,card2_roll:6438,win_pct:88.08},{card1_roll:6353,card2_roll:6470,win_pct:87.41},
              {card1_roll:6521,card2_roll:6470,win_pct:85.68},{card1_roll:6521,card2_roll:6885,win_pct:84.95},
              {card1_roll:6885,card2_roll:6353,win_pct:84.68},{card1_roll:6064,card2_roll:6353,win_pct:83.88},
              {card1_roll:6353,card2_roll:6898,win_pct:82.52},{card1_roll:6521,card2_roll:6898,win_pct:80.57},
              {card1_roll:6438,card2_roll:6470,win_pct:80.42},{card1_roll:6064,card2_roll:6521,win_pct:79.68},
              {card1_roll:6064,card2_roll:6438,win_pct:79.58},{card1_roll:6885,card2_roll:6438,win_pct:79.17},
              {card1_roll:6885,card2_roll:6470,win_pct:78.17},
            ];
            const WORST_DATA: { card1_roll: number; card2_roll: number; win_pct: number }[] = [
              {card1_roll:7055,card2_roll:6249,win_pct:2.91},{card1_roll:7055,card2_roll:6081,win_pct:2.93},
              {card1_roll:6081,card2_roll:6249,win_pct:3.33},{card1_roll:6908,card2_roll:6081,win_pct:11.39},
              {card1_roll:6738,card2_roll:6249,win_pct:13.20},{card1_roll:7055,card2_roll:6738,win_pct:13.44},
              {card1_roll:6738,card2_roll:6081,win_pct:14.64},{card1_roll:6262,card2_roll:6249,win_pct:15.97},
              {card1_roll:6908,card2_roll:6249,win_pct:16.57},{card1_roll:6262,card2_roll:6081,win_pct:17.43},
              {card1_roll:6908,card2_roll:6262,win_pct:18.04},{card1_roll:6573,card2_roll:6081,win_pct:19.16},
              {card1_roll:6573,card2_roll:6249,win_pct:19.41},{card1_roll:6014,card2_roll:6081,win_pct:19.48},
              {card1_roll:6573,card2_roll:6738,win_pct:19.57},
            ];

            const renderRanking = (data: typeof POWER_DATA, label: string, color: string) => (
              <div style={{ marginBottom: 28 }}>
                <h3 style={{ color, marginBottom: 12 }}>{label}</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {data.map((d, i) => {
                    const c1 = cardsByRoll[d.card1_roll];
                    const c2 = cardsByRoll[d.card2_roll];
                    if (!c1 || !c2) return null;
                    return (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px',
                        background: '#1e293b', border: '1px solid #334155', borderRadius: 10,
                      }}>
                        <span style={{ fontWeight: 800, color: '#64748b', fontSize: '0.85rem', minWidth: 28 }}>#{i + 1}</span>
                        <GSPokerCard card={c1} />
                        <span style={{ color: '#475569', fontWeight: 700 }}>+</span>
                        <GSPokerCard card={c2} />
                        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                          <div style={{ fontSize: '1.4rem', fontWeight: 800, color }}>{d.win_pct}%</div>
                          <div style={{ fontSize: '0.65rem', color: '#64748b' }}>avg win rate</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );

            return (
              <>
                <h2>Hole Card Power Rankings</h2>
                <p style={{ color: '#94a3b8', marginBottom: 20, fontSize: '0.88rem' }}>
                  Each of the 120 possible hole cards evaluated against all 91 opponent hands across all 66 boards (720,720 total matchups).
                </p>
                {renderRanking(POWER_DATA, 'Top 15 Starting Hands', '#22c55e')}
                {renderRanking(WORST_DATA, 'Bottom 15 Starting Hands', '#f87171')}
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
