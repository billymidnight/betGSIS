import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  pariCreateSession,
  pariListSessions,
  pariSessionDetail,
  pariJoinSession,
  pariBeginSession,
  pariConcludeSession,
  pariDeleteSession,
  pariCreatePool,
  pariPlaceWager,
  pariClosePool,
  pariSettlePool,
} from '../lib/api/api';
import { useAuthStore } from '../lib/state/authStore';
import supabase from '../lib/supabaseClient';
import './Parimutuel.css';

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

interface PariSession {
  session_id: number;
  name: string;
  host_id: string;
  host_screenname?: string;
  status: 'lobby' | 'active' | 'concluded';
  starting_balance: number;
  min_bet: number;
  max_bet: number;
  mode: string;
  created_at: string;
  concluded_at?: string;
}

interface PariParticipant {
  session_id: number;
  user_id: string;
  screenname?: string;
  balance: number;
  joined_at: string;
}

interface PariSide {
  pool_id: number;
  side_number: number;
  color: string;
  label: string;
}

interface PariWager {
  wager_id: number;
  pool_id: number;
  user_id: string;
  screenname?: string;
  side_number: number;
  stake: number;
  implied_odds?: number;
  payout?: number;
  pnl?: number;
}

interface PariPool {
  pool_id: number;
  session_id: number;
  pool_number: number;
  status: 'betting' | 'closed' | 'settled';
  num_sides: number;
  winner_side?: number;
  sides: PariSide[];
  wagers: PariWager[];
  wager_count?: number;
  created_at: string;
  closed_at?: string;
  settled_at?: string;
}

// ═══════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════

function fmtMoney(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDecimal(n: number): string {
  return n.toFixed(2);
}

function decimalToAmerican(dec: number): string {
  if (dec <= 1) return '+100';
  if (dec >= 2) return `+${Math.round((dec - 1) * 100)}`;
  return `${Math.round(-100 / (dec - 1))}`;
}

function fmtOdds(impliedOdds: number): string {
  if (impliedOdds <= 0) return '—';
  const american = decimalToAmerican(impliedOdds);
  return `${american} (${fmtDecimal(impliedOdds)})`;
}

function sideName(side: PariSide, idx: number): string {
  return side.label || `Side ${idx + 1}`;
}

// ═══════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════

export default function Parimutuel() {
  const user = useAuthStore((s) => s.user);
  const isBookie = (user?.role || '').toUpperCase() === 'BOOKIE';
  const myUserId = user?.user_id || '';

  // View state: 'browser' or a session_id number
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [lobbySessions, setLobbySessions] = useState<PariSession[]>([]);
  const [mySessions, setMySessions] = useState<PariSession[]>([]);
  const [enrolledIds, setEnrolledIds] = useState<Set<number>>(new Set());

  // Session detail state
  const [session, setSession] = useState<PariSession | null>(null);
  const [participants, setParticipants] = useState<PariParticipant[]>([]);
  const [pools, setPools] = useState<PariPool[]>([]);
  const [isHost, setIsHost] = useState(false);

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // Create session form
  const [showCreate, setShowCreate] = useState(false);
  const [cName, setCName] = useState('');
  const [cBalance, setCBalance] = useState('100');
  const [cMinBet, setCMinBet] = useState('1');
  const [cMaxBet, setCMaxBet] = useState('50');

  // Pool create form
  const [showPoolCreate, setShowPoolCreate] = useState(false);
  const [pNumSides, setPNumSides] = useState(2);
  const [pLabels, setPLabels] = useState<string[]>(['', '', '', '', '']);

  // Wager form
  const [wagerSide, setWagerSide] = useState<number | null>(null);
  const [wagerStake, setWagerStake] = useState('');

  // Settle form
  const [settleWinner, setSettleWinner] = useState<number | null>(null);

  // Realtime subscription ref
  const channelRef = useRef<any>(null);
  // Track latest poll to avoid stale overwrites (no blocking)
  const lobbySeqRef = useRef(0);
  const sessionSeqRef = useRef(0);

  // Auto-clear messages
  useEffect(() => {
    if (error || successMsg) {
      const t = setTimeout(() => { setError(''); setSuccessMsg(''); }, 4000);
      return () => clearTimeout(t);
    }
  }, [error, successMsg]);

  // ── Load lobby browser ──
  const loadLobby = useCallback(async () => {
    const seq = ++lobbySeqRef.current;
    try {
      const [lobbyRes, allRes] = await Promise.all([
        pariListSessions('lobby'),
        pariListSessions('all'),
      ]);
      if (seq !== lobbySeqRef.current) return; // stale
      const enrolled = new Set<number>(lobbyRes.enrolled_session_ids || allRes.enrolled_session_ids || []);
      setEnrolledIds(enrolled);
      setLobbySessions(lobbyRes.sessions || []);
      const all = allRes.sessions || [];
      // My sessions: host, or enrolled, or non-lobby status
      setMySessions(all.filter((s: PariSession) =>
        s.host_id === myUserId || enrolled.has(s.session_id) || s.status !== 'lobby'
      ));
    } catch {
      // silently fail on lobby load
    }
  }, [myUserId]);

  // Load session detail
  const loadSession = useCallback(async (sid: number) => {
    const seq = ++sessionSeqRef.current;
    try {
      const res = await pariSessionDetail(sid);
      if (seq !== sessionSeqRef.current) return; // stale
      setSession(res.session);
      setParticipants(res.participants || []);
      setPools(res.pools || []);
      setIsHost(res.is_host === true);
    } catch (err: any) {
      if (seq === sessionSeqRef.current) {
        setError(err?.response?.data?.error || 'Failed to load session');
      }
    }
  }, []);

  // ── On mount / view change ──
  useEffect(() => {
    if (activeSessionId === null) {
      loadLobby();
    } else {
      loadSession(activeSessionId);
    }
  }, [activeSessionId, loadLobby, loadSession]);

  // ── POLLING: the reliable backbone ──
  // Professionals use polling + realtime together. Polling guarantees
  // freshness even when Realtime filters/RLS/publication are flaky.
  useEffect(() => {
    if (activeSessionId === null) {
      // Poll lobby every 6s
      const id = setInterval(() => { loadLobby(); }, 6000);
      return () => clearInterval(id);
    } else {
      // Poll session every 4s — balanced for live game feel vs server load
      const id = setInterval(() => { loadSession(activeSessionId); }, 4000);
      return () => clearInterval(id);
    }
  }, [activeSessionId, loadLobby, loadSession]);

  // ── Supabase Realtime (bonus: instant trigger on top of polling) ──
  useEffect(() => {
    if (activeSessionId === null) return;

    // Subscribe to changes on all pari tables — triggers immediate refresh
    const channel = supabase
      .channel(`pari-session-${activeSessionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pari_sessions', filter: `session_id=eq.${activeSessionId}` }, () => {
        loadSession(activeSessionId);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pari_participants', filter: `session_id=eq.${activeSessionId}` }, () => {
        loadSession(activeSessionId);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pari_pools', filter: `session_id=eq.${activeSessionId}` }, () => {
        loadSession(activeSessionId);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pari_wagers' }, () => {
        loadSession(activeSessionId);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pari_pool_sides' }, () => {
        loadSession(activeSessionId);
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeSessionId, loadSession]);

  // ── Actions ──

  const handleCreateSession = async () => {
    if (!cName.trim()) { setError('Session name is required'); return; }
    setLoading(true);
    try {
      const res = await pariCreateSession({
        name: cName.trim(),
        starting_balance: parseFloat(cBalance) || 100,
        min_bet: parseFloat(cMinBet) || 1,
        max_bet: parseFloat(cMaxBet) || 50,
        mode: 'vibe',
      });
      setShowCreate(false);
      setCName('');
      setActiveSessionId(res.session.session_id);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Create failed');
    }
    setLoading(false);
  };

  const handleJoin = async (sid: number) => {
    setLoading(true);
    try {
      await pariJoinSession(sid);
      setActiveSessionId(sid);
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Join failed';
      // If already joined, just enter the session
      if (msg.toLowerCase().includes('already joined') || err?.response?.status === 409) {
        setActiveSessionId(sid);
      } else {
        setError(msg);
      }
    }
    setLoading(false);
  };

  const handleBegin = async () => {
    if (!activeSessionId) return;
    setLoading(true);
    try {
      await pariBeginSession(activeSessionId);
      setSuccessMsg('Session started!');
      loadSession(activeSessionId);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Begin failed');
    }
    setLoading(false);
  };

  const handleCreatePool = async () => {
    if (!activeSessionId) return;
    setLoading(true);
    try {
      const labels = pLabels.slice(0, pNumSides).filter(l => l.trim());
      await pariCreatePool(activeSessionId, {
        num_sides: pNumSides,
        labels: labels.length > 0 ? pLabels.slice(0, pNumSides) : undefined,
      });
      setShowPoolCreate(false);
      setPLabels(['', '', '', '', '']);
      setSuccessMsg('Pool created — wagering open!');
      loadSession(activeSessionId);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Pool create failed');
    }
    setLoading(false);
  };

  const handlePlaceWager = async (poolId: number) => {
    if (wagerSide === null) { setError('Pick a side'); return; }
    const stake = parseFloat(wagerStake);
    if (!stake || stake <= 0) { setError('Enter a valid stake'); return; }
    setLoading(true);
    try {
      await pariPlaceWager(poolId, wagerSide, stake);
      setWagerSide(null);
      setWagerStake('');
      setSuccessMsg('Wager placed!');
      loadSession(activeSessionId!);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Wager failed');
    }
    setLoading(false);
  };

  const handleClosePool = async (poolId: number) => {
    setLoading(true);
    try {
      await pariClosePool(poolId);
      setSuccessMsg('Pool closed — revealing wagers!');
      loadSession(activeSessionId!);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Close failed');
    }
    setLoading(false);
  };

  const handleSettlePool = async (poolId: number) => {
    if (settleWinner === null) { setError('Pick a winning side'); return; }
    setLoading(true);
    try {
      await pariSettlePool(poolId, settleWinner);
      setSettleWinner(null);
      setSuccessMsg('Pool settled!');
      loadSession(activeSessionId!);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Settle failed');
    }
    setLoading(false);
  };

  const handleConclude = async () => {
    if (!activeSessionId) return;
    setLoading(true);
    try {
      await pariConcludeSession(activeSessionId);
      setSuccessMsg('Session concluded! P&L written to book.');
      loadSession(activeSessionId);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Conclude failed');
    }
    setLoading(false);
  };

  const handleDelete = async () => {
    if (!activeSessionId) return;
    if (!window.confirm('Delete this session? (Does not affect settled bets)')) return;
    setLoading(true);
    try {
      await pariDeleteSession(activeSessionId);
      setSuccessMsg('Session deleted');
      setActiveSessionId(null);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Delete failed');
    }
    setLoading(false);
  };

  // ── Manual Refresh (guaranteed fresh, no stale) ──
  // Bumps seq refs TWICE so in-flight polls are guaranteed stale,
  // then loads fresh, so the manual pull always wins.
  const handleRefreshLobby = async () => {
    setRefreshing(true);
    lobbySeqRef.current += 10;          // nuke in-flight polls
    try { await loadLobby(); } catch {}
    setRefreshing(false);
  };

  const handleRefreshSession = async () => {
    if (!activeSessionId) return;
    setRefreshing(true);
    sessionSeqRef.current += 10;        // nuke in-flight polls
    try { await loadSession(activeSessionId); } catch {}
    setRefreshing(false);
  };

  // ── Computed values ──
  const currentPool = pools.find(p => p.status === 'betting') || null;
  const lastClosedPool = [...pools].reverse().find(p => p.status === 'closed') || null;
  const settledPools = pools.filter(p => p.status === 'settled');
  const displayPool = currentPool || lastClosedPool || null;
  const myParticipant = participants.find(p => p.user_id === myUserId);
  const isInSession = !!myParticipant;

  // My wager on the current betting pool
  const myWagerOnCurrent = currentPool?.wagers?.find(w => w.user_id === myUserId) || null;

  // Sorted leaderboard
  const leaderboard = [...participants].sort((a, b) => b.balance - a.balance);

  // ═══════════════════════════════════════════════════════════════════
  // RENDER: Lobby Browser
  // ═══════════════════════════════════════════════════════════════════

  if (activeSessionId === null) {
    return (
      <div className="pari-page">
        <div className="pari-header">
          <h1>Parimutuel: Play</h1>
          <p className="pari-subtitle">Multi-player totalisator betting sessions</p>
          <button className="pari-refresh-btn" onClick={handleRefreshLobby} disabled={refreshing}>
            {refreshing ? (<><span className="pari-refresh-spin">⟳</span> Pulling Latest…</>) : (<>🔄 Refresh</>)}
          </button>
        </div>

        {error && <div className="pari-toast pari-toast-error">{error}</div>}
        {successMsg && <div className="pari-toast pari-toast-success">{successMsg}</div>}

        {/* Available Sessions */}
        <section className="pari-section">
          <h2>Open Sessions</h2>
          {lobbySessions.length === 0 ? (
            <p className="pari-muted">No sessions available right now.</p>
          ) : (
            <div className="pari-session-grid">
              {lobbySessions.map(s => {
                const amEnrolled = enrolledIds.has(s.session_id);
                const amHost = s.host_id === myUserId;
                return (
                  <div className="pari-session-card" key={s.session_id}>
                    <div className="pari-session-card-header">
                      <span className="pari-session-name">{s.name}</span>
                      <span className="pari-badge pari-badge-lobby">LOBBY</span>
                      {amEnrolled && <span className="pari-badge pari-badge-enrolled">ENROLLED</span>}
                    </div>
                    <div className="pari-session-meta">
                      <span>Host: <strong>{s.host_screenname || '—'}</strong></span>
                      <span>Buy-in: <strong>{fmtMoney(s.starting_balance)}</strong></span>
                      <span>Bet range: <strong>{fmtMoney(s.min_bet)} – {fmtMoney(s.max_bet)}</strong></span>
                    </div>
                    {amEnrolled || amHost ? (
                      <button className="pari-btn pari-btn-green" onClick={() => setActiveSessionId(s.session_id)} disabled={loading}>
                        Re-enter Session
                      </button>
                    ) : (
                      <button className="pari-btn pari-btn-blue" onClick={() => handleJoin(s.session_id)} disabled={loading}>
                        Join Session
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* My Sessions (active / concluded) */}
        {mySessions.filter(s => s.status !== 'lobby' || s.host_id === myUserId).length > 0 && (
          <section className="pari-section">
            <h2>My Sessions</h2>
            <div className="pari-session-grid">
              {mySessions
                .filter(s => s.status !== 'lobby' || s.host_id === myUserId)
                .map(s => (
                  <div className="pari-session-card" key={s.session_id}>
                    <div className="pari-session-card-header">
                      <span className="pari-session-name">{s.name}</span>
                      <span className={`pari-badge ${s.status === 'active' ? 'pari-badge-active' : s.status === 'concluded' ? 'pari-badge-concluded' : 'pari-badge-lobby'}`}>
                        {s.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="pari-session-meta">
                      <span>Host: <strong>{s.host_screenname || '—'}</strong></span>
                    </div>
                    <button className="pari-btn pari-btn-outline" onClick={() => setActiveSessionId(s.session_id)}>
                      {s.status === 'concluded' ? 'View Results' : 'Enter'}
                    </button>
                  </div>
                ))}
            </div>
          </section>
        )}

        {/* Create Session (BOOKIE only) */}
        {isBookie && (
          <section className="pari-section">
            {!showCreate ? (
              <button className="pari-btn pari-btn-green" onClick={() => setShowCreate(true)}>+ Create Session</button>
            ) : (
              <div className="pari-create-form">
                <h3>New Session</h3>
                <div className="pari-form-row">
                  <label>Name</label>
                  <input value={cName} onChange={e => setCName(e.target.value)} placeholder="Session name..." />
                </div>
                <div className="pari-form-row">
                  <label>Starting Balance</label>
                  <input type="number" value={cBalance} onChange={e => setCBalance(e.target.value)} />
                </div>
                <div className="pari-form-row">
                  <label>Min Bet</label>
                  <input type="number" value={cMinBet} onChange={e => setCMinBet(e.target.value)} />
                </div>
                <div className="pari-form-row">
                  <label>Max Bet</label>
                  <input type="number" value={cMaxBet} onChange={e => setCMaxBet(e.target.value)} />
                </div>
                <div className="pari-form-actions">
                  <button className="pari-btn pari-btn-green" onClick={handleCreateSession} disabled={loading}>Create</button>
                  <button className="pari-btn pari-btn-outline" onClick={() => setShowCreate(false)}>Cancel</button>
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // RENDER: Session View
  // ═══════════════════════════════════════════════════════════════════

  if (!session) {
    return (
      <div className="pari-page">
        <button className="pari-btn pari-btn-outline pari-back-btn" onClick={() => setActiveSessionId(null)}>← Back</button>
        <p className="pari-muted">Loading session...</p>
      </div>
    );
  }

  return (
    <div className="pari-page">
      {/* Top bar */}
      <div className="pari-topbar">
        <button className="pari-btn pari-btn-outline pari-back-btn" onClick={() => setActiveSessionId(null)}>← Back</button>
        <div className="pari-topbar-info">
          <h1>{session.name}</h1>
          <span className={`pari-badge ${session.status === 'active' ? 'pari-badge-active' : session.status === 'concluded' ? 'pari-badge-concluded' : 'pari-badge-lobby'}`}>
            {session.status.toUpperCase()}
          </span>
        </div>
        <button className="pari-refresh-btn pari-refresh-btn-topbar" onClick={handleRefreshSession} disabled={refreshing}>
          {refreshing ? (<><span className="pari-refresh-spin">⟳</span> Refreshing…</>) : (<>🔄 Refresh</>)}
        </button>
        {isHost && session.status !== 'concluded' && (
          <button className="pari-btn pari-btn-red pari-btn-sm" onClick={handleDelete} disabled={loading}>Delete</button>
        )}
      </div>

      {error && <div className="pari-toast pari-toast-error">{error}</div>}
      {successMsg && <div className="pari-toast pari-toast-success">{successMsg}</div>}

      {/* Session info banner */}
      <div className="pari-info-banner">
        <div className="pari-info-item">
          <span className="pari-info-label">Host</span>
          <span className="pari-info-value">{session.host_screenname || '—'}</span>
        </div>
        <div className="pari-info-item">
          <span className="pari-info-label">Buy-in</span>
          <span className="pari-info-value">{fmtMoney(session.starting_balance)}</span>
        </div>
        <div className="pari-info-item">
          <span className="pari-info-label">Bet Range</span>
          <span className="pari-info-value">{fmtMoney(session.min_bet)} – {fmtMoney(session.max_bet)}</span>
        </div>
        <div className="pari-info-item">
          <span className="pari-info-label">Players</span>
          <span className="pari-info-value">{participants.length}</span>
        </div>
        {myParticipant && (() => {
          const myPnl = myParticipant.balance - session.starting_balance;
          const myTotalWagered = pools.reduce((sum, pool) =>
            sum + (pool.wagers || []).filter(w => w.user_id === myUserId).reduce((s, w) => s + (w.stake || 0), 0), 0);
          return (
            <>
              <div className="pari-info-item pari-info-balance">
                <span className="pari-info-label">My Balance</span>
                <span className="pari-info-value">{fmtMoney(myParticipant.balance)}</span>
              </div>
              <div className="pari-info-item">
                <span className="pari-info-label">P&L</span>
                <span className={`pari-info-value ${myPnl >= 0 ? 'pari-pnl-pos' : 'pari-pnl-neg'}`}>
                  {myPnl >= 0 ? '+' : ''}{fmtMoney(myPnl)}
                </span>
              </div>
              <div className="pari-info-item">
                <span className="pari-info-label">Net Wagered (All Pools)</span>
                <span className="pari-info-value">{fmtMoney(myTotalWagered)}</span>
              </div>
            </>
          );
        })()}
      </div>

      <div className="pari-body">
        {/* Left: Main area */}
        <div className="pari-main">
          {/* ── LOBBY PHASE ── */}
          {session.status === 'lobby' && (
            <section className="pari-section">
              <h2>Waiting Room</h2>
              <div className="pari-player-list">
                {participants.map(p => (
                  <div className="pari-player-chip" key={p.user_id}>
                    {p.screenname || p.user_id.slice(0, 8)}
                  </div>
                ))}
                {participants.length === 0 && <p className="pari-muted">No players yet...</p>}
              </div>
              {!isInSession && !isHost && (
                <button className="pari-btn pari-btn-blue" onClick={() => handleJoin(session.session_id)} disabled={loading}>
                  Join Session
                </button>
              )}
              {isHost && (
                <button className="pari-btn pari-btn-green pari-btn-lg" onClick={handleBegin} disabled={loading || participants.length === 0}>
                  Begin Session ({participants.length} players)
                </button>
              )}
            </section>
          )}

          {/* ── ACTIVE PHASE ── */}
          {session.status === 'active' && (
            <>
              {/* Current Pool */}
              {displayPool ? (
                <section className="pari-section pari-pool-section">
                  <div className="pari-pool-header">
                    <h2>
                      Pool #{displayPool.pool_number}
                      <span className={`pari-badge pari-badge-${displayPool.status}`}>
                        {displayPool.status.toUpperCase()}
                      </span>
                    </h2>
                  </div>

                  {/* Sides display */}
                  <div className="pari-sides-row">
                    {displayPool.sides.map((side, idx) => {
                      const sideWagers = displayPool.wagers?.filter(w => w.side_number === side.side_number) || [];
                      const sideTotal = sideWagers.reduce((sum, w) => sum + (w.stake || 0), 0);
                      const totalPool = displayPool.wagers?.reduce((sum, w) => sum + (w.stake || 0), 0) || 0;
                      const isWinner = displayPool.winner_side === side.side_number;
                      const impliedOdds = sideTotal > 0 && totalPool > 0 ? totalPool / sideTotal : 0;

                      return (
                        <div
                          key={side.side_number}
                          className={`pari-side-card ${wagerSide === side.side_number ? 'pari-side-selected' : ''} ${isWinner ? 'pari-side-winner' : ''} ${displayPool.status === 'settled' && !isWinner ? 'pari-side-loser' : ''}`}
                          style={{ borderColor: side.color }}
                          onClick={() => {
                            if (displayPool.status === 'betting' && !myWagerOnCurrent) {
                              setWagerSide(side.side_number);
                            }
                          }}
                        >
                          <div className="pari-side-color-bar" style={{ backgroundColor: side.color }} />
                          <div className="pari-side-name">{sideName(side, idx)}</div>

                          {/* During betting: hide all stats from non-host */}

                          {/* Host during betting: show full details */}
                          {displayPool.status === 'betting' && isHost && (
                            <>
                              <div className="pari-side-stat">
                                <span className="pari-stat-label">Wagers</span>
                                <span className="pari-stat-value">{sideWagers.length}</span>
                              </div>
                              <div className="pari-side-stat">
                                <span className="pari-stat-label">Total</span>
                                <span className="pari-stat-value">{fmtMoney(sideTotal)}</span>
                              </div>
                            </>
                          )}

                          {/* After close/settle: show full details to everyone */}
                          {displayPool.status !== 'betting' && (
                            <>
                              <div className="pari-side-stat">
                                <span className="pari-stat-label">Pool</span>
                                <span className="pari-stat-value">{fmtMoney(sideTotal)}</span>
                              </div>
                              <div className="pari-side-stat">
                                <span className="pari-stat-label">Odds</span>
                                <span className="pari-stat-value">{fmtOdds(impliedOdds)}</span>
                              </div>
                              {isWinner && <div className="pari-winner-badge">WINNER</div>}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Betting form (only during betting, for participants who haven't wagered) */}
                  {displayPool.status === 'betting' && isInSession && !myWagerOnCurrent && (
                    <div className="pari-wager-form">
                      <div className="pari-wager-selected">
                        {wagerSide
                          ? <>Selected: <span style={{ color: displayPool.sides.find(s => s.side_number === wagerSide)?.color }}>
                              {sideName(displayPool.sides.find(s => s.side_number === wagerSide)!, wagerSide - 1)}
                            </span></>
                          : <span className="pari-muted">← Click a side to select</span>
                        }
                      </div>
                      <div className="pari-wager-input-row">
                        <input
                          type="number"
                          placeholder={`Stake (${session.min_bet}–${session.max_bet})`}
                          value={wagerStake}
                          onChange={e => setWagerStake(e.target.value)}
                          min={session.min_bet}
                          max={Math.min(session.max_bet, myParticipant?.balance || 0)}
                          step="0.01"
                        />
                        <button
                          className="pari-btn pari-btn-blue pari-btn-lg"
                          onClick={() => handlePlaceWager(displayPool.pool_id)}
                          disabled={loading || wagerSide === null || !wagerStake}
                        >
                          Place Wager
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Own wager confirmation (during betting) */}
                  {displayPool.status === 'betting' && myWagerOnCurrent && (
                    <div className="pari-wager-confirmed">
                      Wager locked: <strong>{fmtMoney(myWagerOnCurrent.stake)}</strong> on{' '}
                      <span style={{ color: displayPool.sides.find(s => s.side_number === myWagerOnCurrent.side_number)?.color }}>
                        {sideName(displayPool.sides.find(s => s.side_number === myWagerOnCurrent.side_number)!, myWagerOnCurrent.side_number - 1)}
                      </span>
                    </div>
                  )}

                  {/* Wager table (visible after close/settle, or host during betting) */}
                  {(displayPool.status !== 'betting' || isHost) && displayPool.wagers && displayPool.wagers.length > 0 && (
                    <div className="pari-wagers-table-wrap">
                      <table className="pari-wagers-table">
                        <thead>
                          <tr>
                            <th>Player</th>
                            <th>Side</th>
                            <th>Stake</th>
                            {displayPool.status !== 'betting' && <th>Odds</th>}
                            {displayPool.status === 'settled' && <th>Payout</th>}
                            {displayPool.status === 'settled' && <th>P&L</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {displayPool.wagers.map(w => {
                            const wSide = displayPool.sides.find(s => s.side_number === w.side_number);
                            return (
                              <tr key={w.wager_id}>
                                <td>
                                  {w.screenname || w.user_id.slice(0, 8)}
                                  {w.user_id === myUserId && <span className="pari-you-tag">YOU</span>}
                                </td>
                                <td>
                                  <span className="pari-side-dot" style={{ backgroundColor: wSide?.color || '#888' }} />
                                  {wSide ? sideName(wSide, w.side_number - 1) : `Side ${w.side_number}`}
                                </td>
                                <td>{fmtMoney(w.stake)}</td>
                                {displayPool.status !== 'betting' && (
                                  <td>{w.implied_odds ? fmtOdds(w.implied_odds) : '—'}</td>
                                )}
                                {displayPool.status === 'settled' && (
                                  <td>{w.payout != null ? fmtMoney(w.payout) : '—'}</td>
                                )}
                                {displayPool.status === 'settled' && (
                                  <td className={`pari-pnl ${(w.pnl || 0) >= 0 ? 'pari-pnl-pos' : 'pari-pnl-neg'}`}>
                                    {w.pnl != null ? (w.pnl >= 0 ? '+' : '') + fmtMoney(w.pnl) : '—'}
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Host controls */}
                  {isHost && displayPool.status === 'betting' && (
                    <div className="pari-host-actions">
                      <button className="pari-btn pari-btn-amber" onClick={() => handleClosePool(displayPool.pool_id)} disabled={loading}>
                        Close Wagering
                      </button>
                    </div>
                  )}

                  {isHost && displayPool.status === 'closed' && (
                    <div className="pari-host-actions">
                      <h3>Pick the Winner</h3>
                      <div className="pari-settle-row">
                        {displayPool.sides.map((side, idx) => (
                          <button
                            key={side.side_number}
                            className={`pari-settle-btn ${settleWinner === side.side_number ? 'pari-settle-selected' : ''}`}
                            style={{ borderColor: side.color, color: settleWinner === side.side_number ? '#fff' : side.color, backgroundColor: settleWinner === side.side_number ? side.color : 'transparent' }}
                            onClick={() => setSettleWinner(side.side_number)}
                          >
                            {sideName(side, idx)}
                          </button>
                        ))}
                      </div>
                      <button className="pari-btn pari-btn-green pari-btn-lg" onClick={() => handleSettlePool(displayPool.pool_id)} disabled={loading || settleWinner === null}>
                        Settle Pool
                      </button>
                    </div>
                  )}
                </section>
              ) : (
                <section className="pari-section">
                  <p className="pari-muted pari-waiting-msg">Waiting for host to create Pool #{settledPools.length + 1}...</p>
                  {isHost && !showPoolCreate && (
                    <button className="pari-btn pari-btn-green" onClick={() => setShowPoolCreate(true)}>+ Create Pool</button>
                  )}
                </section>
              )}

              {/* Host: Create new pool (only when no open pool) */}
              {isHost && !currentPool && !lastClosedPool && showPoolCreate && (
                <section className="pari-section pari-create-pool-section">
                  <h3>New Pool</h3>
                  <div className="pari-form-row">
                    <label>Sides</label>
                    <div className="pari-sides-picker">
                      {[2, 3, 4, 5].map(n => (
                        <button
                          key={n}
                          className={`pari-sides-btn ${pNumSides === n ? 'pari-sides-btn-active' : ''}`}
                          onClick={() => setPNumSides(n)}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                  {Array.from({ length: pNumSides }).map((_, i) => (
                    <div className="pari-form-row" key={i}>
                      <label style={{ color: (['#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6'])[i] }}>
                        Side {i + 1} label (optional)
                      </label>
                      <input
                        value={pLabels[i]}
                        onChange={e => {
                          const next = [...pLabels];
                          next[i] = e.target.value;
                          setPLabels(next);
                        }}
                        placeholder={`Side ${i + 1}`}
                      />
                    </div>
                  ))}
                  <div className="pari-form-actions">
                    <button className="pari-btn pari-btn-green" onClick={handleCreatePool} disabled={loading}>Create Pool</button>
                    <button className="pari-btn pari-btn-outline" onClick={() => setShowPoolCreate(false)}>Cancel</button>
                  </div>
                </section>
              )}

              {/* After a pool is settled, host can create a new one */}
              {isHost && !currentPool && !lastClosedPool && !showPoolCreate && settledPools.length > 0 && (
                <div className="pari-host-actions">
                  <button className="pari-btn pari-btn-green" onClick={() => setShowPoolCreate(true)}>+ Next Pool</button>
                  <button className="pari-btn pari-btn-amber" onClick={handleConclude} disabled={loading}>Conclude Session</button>
                </div>
              )}
            </>
          )}

          {/* ── CONCLUDED PHASE ── */}
          {session.status === 'concluded' && (
            <section className="pari-section">
              <h2>Session Concluded</h2>
              <p className="pari-muted">Final standings and P&L have been recorded.</p>
            </section>
          )}

          {/* Pool History */}
          {settledPools.length > 0 && (
            <section className="pari-section pari-history-section">
              <h2>Pool History</h2>
              {settledPools.map(pool => {
                const totalPool = pool.wagers?.reduce((s, w) => s + (w.stake || 0), 0) || 0;
                const winnerSide = pool.sides.find(s => s.side_number === pool.winner_side);
                return (
                  <div className="pari-history-pool" key={pool.pool_id}>
                    <div className="pari-history-pool-header">
                      <span>Pool #{pool.pool_number}</span>
                      <span className="pari-history-total">Total Pool: {fmtMoney(totalPool)}</span>
                      {winnerSide && (
                        <span className="pari-history-winner" style={{ color: winnerSide.color }}>
                          Winner: {sideName(winnerSide, pool.winner_side! - 1)}
                        </span>
                      )}
                    </div>
                    <table className="pari-wagers-table pari-wagers-table-sm">
                      <thead>
                        <tr>
                          <th>Player</th>
                          <th>Side</th>
                          <th>Stake</th>
                          <th>Odds</th>
                          <th>Payout</th>
                          <th>P&L</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(pool.wagers || []).map(w => {
                          const wSide = pool.sides.find(s => s.side_number === w.side_number);
                          return (
                            <tr key={w.wager_id}>
                              <td>
                                {w.screenname || w.user_id.slice(0, 8)}
                                {w.user_id === myUserId && <span className="pari-you-tag">YOU</span>}
                              </td>
                              <td>
                                <span className="pari-side-dot" style={{ backgroundColor: wSide?.color || '#888' }} />
                                {wSide ? sideName(wSide, w.side_number - 1) : `Side ${w.side_number}`}
                              </td>
                              <td>{fmtMoney(w.stake)}</td>
                              <td>{w.implied_odds ? fmtOdds(w.implied_odds) : '—'}</td>
                              <td>{w.payout != null ? fmtMoney(w.payout) : '—'}</td>
                              <td className={`pari-pnl ${(w.pnl || 0) >= 0 ? 'pari-pnl-pos' : 'pari-pnl-neg'}`}>
                                {w.pnl != null ? (w.pnl >= 0 ? '+' : '') + fmtMoney(w.pnl) : '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </section>
          )}
        </div>

        {/* Right sidebar: Leaderboard */}
        <aside className="pari-sidebar">
          <h3>Leaderboard</h3>
          <div className="pari-leaderboard">
            {leaderboard.map((p, idx) => {
              const netPnl = p.balance - (session?.starting_balance || 100);
              return (
                <div className={`pari-lb-row ${p.user_id === myUserId ? 'pari-lb-me' : ''}`} key={p.user_id}>
                  <span className="pari-lb-rank">{idx + 1}</span>
                  <span className="pari-lb-name">{p.screenname || p.user_id.slice(0, 8)}</span>
                  <span className="pari-lb-bal">{fmtMoney(p.balance)}</span>
                  <span className={`pari-lb-pnl ${netPnl >= 0 ? 'pari-pnl-pos' : 'pari-pnl-neg'}`}>
                    {netPnl >= 0 ? '+' : ''}{fmtMoney(netPnl)}
                  </span>
                </div>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
}
