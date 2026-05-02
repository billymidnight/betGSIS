import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  chelBeginSession, chelCloseWagering, chelConcludeSession, chelCreateSession,
  chelDraftRace, chelJoinSession, chelListSessions, chelReleasePools,
  chelSendOff, chelSessionDetail, chelSettleRace, chelWager,
  fetchHorses, chelDeleteAllSessions,
  CheltenhamSession, CheltenhamSessionState, CheltenhamPool, CheltenhamRace,
  Horse, HorseInField,
} from '../lib/api/api';
import { useAuthStore } from '../lib/state/authStore';
import supabase from '../lib/supabaseClient';
import { CountryFlag } from '../components/Race/CountryFlag';
import { HorseFancyCard } from '../components/Race/HorseFancyCard';
import { RaceAnimation } from '../components/Race/RaceAnimation';
import './Cheltenham.css';
import './HorseRacing.css';

// ═══════════════════════════════════════════════════════════════════════
// Cheltenham — pari-mutuel sessions on the same horse simulator.
// Lobby → join → host begins → host drafts a race → host releases pools
// → bettors wager (no prices visible) → host closes wagering → reveal
// (everyone sees all bets + implied odds) → host sends off → race
// animation → host settles → balance updates → next race.
// ═══════════════════════════════════════════════════════════════════════

const POOL_KIND_LABELS: Record<string, string> = {
  winner:             'Race Winner',
  bridesmaid:         'Bridesmaid (P2)',
  backer:             'Backer (Last)',
  winner_nationality: 'Winning Nationality',
  time_bucket_horse:  'Finish-Time Bucket',
};

const fmtUsd = (n: number): string => {
  const s = `$${Math.abs(n).toFixed(2)}`;
  return n < 0 ? `-${s}` : s;
};

// Decimal odds → American odds string. <=1.0 collapses to +100 (push).
function decimalToAmerican(dec: number | null | undefined): string {
  if (dec == null || !Number.isFinite(dec) || dec <= 1) return '+100';
  if (dec >= 2) return `+${Math.round((dec - 1) * 100)}`;
  return `${Math.round(-100 / (dec - 1))}`;
}

// Renders the implied-odds cell as American on top, decimal on the
// bottom, no "x" trailing the decimal (it was visually ugly).
function ImpliedOdds({ value }: { value: number | null | undefined }) {
  if (value == null || !Number.isFinite(Number(value))) return <>—</>;
  const dec = Number(value);
  return (
    <span className="chel-impodds">
      <strong>{decimalToAmerican(dec)}</strong>
      <em>({dec.toFixed(2)})</em>
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════
export default function Cheltenham() {
  const user = useAuthStore((s) => s.user);
  const isBookie = (user?.role || '').toUpperCase() === 'BOOKIE';
  const myUid = user?.user_id || '';

  const [activeId, setActiveId] = useState<number | null>(null);
  const [sessions, setSessions] = useState<CheltenhamSession[]>([]);
  const [enrolledIds, setEnrolledIds] = useState<number[]>([]);
  const [state, setState] = useState<CheltenhamSessionState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [horses, setHorses] = useState<Horse[]>([]);

  const channelRef = useRef<any>(null);

  // ── Lobby create form state ──
  const [showCreate, setShowCreate] = useState(false);
  const [cName, setCName] = useState('');
  const [cBalance, setCBalance] = useState('100');
  const [cMin, setCMin] = useState('3');
  const [cMax, setCMax] = useState('8');
  const [cTimePools, setCTimePools] = useState(false);
  const [cDistance, setCDistance] = useState('1500');

  const reloadSessions = useCallback(async () => {
    try {
      const r = await chelListSessions('lobby');
      setSessions(r.sessions);
      setEnrolledIds(r.enrolled_session_ids);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Failed to load sessions');
    }
  }, []);

  const reloadState = useCallback(async (sid: number) => {
    try {
      const s = await chelSessionDetail(sid);
      setState(s);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Failed to load session');
    }
  }, []);

  // Load catalogue once for the manual-draft picker.
  useEffect(() => {
    fetchHorses().then((h) => setHorses(h)).catch(() => {});
  }, []);

  // Initial sessions list.
  useEffect(() => {
    reloadSessions();
  }, [reloadSessions]);

  // Realtime subscriptions — mirror the parimutuel pattern.
  useEffect(() => {
    if (activeId === null) return;
    const ch = supabase
      .channel(`cheltenham-session-${activeId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cheltenham_sessions',     filter: `session_id=eq.${activeId}` }, () => reloadState(activeId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cheltenham_participants', filter: `session_id=eq.${activeId}` }, () => reloadState(activeId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cheltenham_races',        filter: `session_id=eq.${activeId}` }, () => reloadState(activeId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cheltenham_pools'         }, () => reloadState(activeId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cheltenham_wagers'        }, () => reloadState(activeId))
      .subscribe();
    channelRef.current = ch;
    reloadState(activeId);
    // Polling backstop in case Realtime isn't enabled on the project.
    const id = setInterval(() => reloadState(activeId), 4000);
    return () => {
      supabase.removeChannel(ch);
      clearInterval(id);
    };
  }, [activeId, reloadState]);

  // ── Actions ──
  const handleCreate = async () => {
    if (!cName.trim()) { setError('Session name is required'); return; }
    setLoading(true);
    try {
      const res = await chelCreateSession({
        name:              cName.trim(),
        starting_balance:  parseFloat(cBalance) || 100,
        min_bet:           parseFloat(cMin)     || 3,
        max_bet:           parseFloat(cMax)     || 8,
        enable_time_pools: cTimePools,
        default_distance:  parseInt(cDistance, 10) || 1500,
      });
      setShowCreate(false);
      setCName('');
      setActiveId(res.session.session_id);
      await reloadSessions();
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Create failed');
    }
    setLoading(false);
  };

  const handleJoin = async (sid: number) => {
    setLoading(true);
    try {
      await chelJoinSession(sid);
      setActiveId(sid);
      await reloadSessions();
    } catch (e: any) {
      const msg = e?.response?.data?.error || 'Join failed';
      if (msg.toLowerCase().includes('already')) setActiveId(sid);
      else setError(msg);
    }
    setLoading(false);
  };

  // ─── Render ───────────────────────────────────────────────────────
  // Cheltenham is intentionally NEVER locked — racing-locks only apply to
  // Churchill Downs (see HorseRacing.tsx).
  if (activeId === null) {
    return (
      <Lobby
        sessions={sessions}
        enrolledIds={enrolledIds}
        onJoin={handleJoin}
        onOpen={(sid) => setActiveId(sid)}
        canHost={isBookie}
        showCreate={showCreate}
        setShowCreate={setShowCreate}
        cName={cName} setCName={setCName}
        cBalance={cBalance} setCBalance={setCBalance}
        cMin={cMin} setCMin={setCMin}
        cMax={cMax} setCMax={setCMax}
        cTimePools={cTimePools} setCTimePools={setCTimePools}
        cDistance={cDistance} setCDistance={setCDistance}
        onCreate={handleCreate}
        loading={loading}
        error={error}
        onRefresh={reloadSessions}
        onDeleteAll={async () => {
          if (!window.confirm(
            'Delete ALL Cheltenham sessions, races, pools, and wagers? Bets already written to the book stay. This cannot be undone.'
          )) return;
          try {
            const r = await chelDeleteAllSessions();
            await reloadSessions();
            window.alert(`Wiped ${r.deleted} session(s).`);
          } catch (e: any) {
            setError(e?.response?.data?.error || 'Delete-all failed');
          }
        }}
      />
    );
  }

  if (!state) {
    return <div className="chel-loading">Loading session…</div>;
  }

  return (
    <SessionView
      state={state}
      myUid={myUid}
      horses={horses}
      onLeave={() => { setActiveId(null); setState(null); reloadSessions(); }}
      onAction={() => reloadState(activeId)}
      setError={setError}
      error={error}
    />
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Lobby
// ═══════════════════════════════════════════════════════════════════════
function Lobby(p: any) {
  return (
    <div className="chel-lobby">
      <header className="chel-lobby-head">
        <div>
          <span className="chel-eyebrow">Cheltenham · Pari-mutuel Racing</span>
          <h1>Sessions</h1>
        </div>
        <div className="chel-lobby-actions">
          <button className="chel-btn-secondary" onClick={p.onRefresh}>Refresh</button>
          {p.canHost && (
            <button className="chel-btn-conclude" onClick={p.onDeleteAll}>Delete All Sessions</button>
          )}
          {p.canHost && !p.showCreate && (
            <button className="chel-btn-primary" onClick={() => p.setShowCreate(true)}>+ Host a Session</button>
          )}
        </div>
      </header>

      {p.error && <div className="chel-error" onClick={() => p.setError?.(null)}>{p.error}</div>}

      {p.showCreate && (
        <div className="chel-create-card">
          <h3>Host a new Cheltenham session</h3>
          <div className="chel-create-grid">
            <label>
              <span>Session name</span>
              <input value={p.cName} onChange={(e) => p.setCName(e.target.value)} placeholder="e.g. Epsom Derby" />
            </label>
            <label>
              <span>Starting balance ($)</span>
              <input value={p.cBalance} onChange={(e) => p.setCBalance(e.target.value)} type="number" />
            </label>
            <label>
              <span>Min bet</span>
              <input value={p.cMin} onChange={(e) => p.setCMin(e.target.value)} type="number" />
            </label>
            <label>
              <span>Max bet</span>
              <input value={p.cMax} onChange={(e) => p.setCMax(e.target.value)} type="number" />
            </label>
            <label>
              <span>Default distance</span>
              <input value={p.cDistance} onChange={(e) => p.setCDistance(e.target.value)} type="number" />
            </label>
            <label className="chel-toggle">
              <input type="checkbox" checked={p.cTimePools} onChange={(e) => p.setCTimePools(e.target.checked)} />
              <span>Enable time-bucket pools</span>
            </label>
          </div>
          <div className="chel-create-foot">
            <button className="chel-btn-secondary" onClick={() => p.setShowCreate(false)}>Cancel</button>
            <button className="chel-btn-primary" disabled={p.loading} onClick={p.onCreate}>
              {p.loading ? 'Creating…' : 'Create session'}
            </button>
          </div>
        </div>
      )}

      <div className="chel-session-list">
        {p.sessions.length === 0 && !p.showCreate && (
          <div className="chel-empty">No open sessions. {p.canHost ? 'Click "Host a Session" to start one.' : 'Wait for a bookie to host one.'}</div>
        )}
        {p.sessions.map((s: CheltenhamSession) => {
          const enrolled = p.enrolledIds.includes(s.session_id);
          return (
            <article key={s.session_id} className="chel-session-card">
              <header>
                <h3>{s.name}</h3>
                <span className="chel-session-host">Hosted by {s.host_screenname || '—'}</span>
              </header>
              <div className="chel-session-stats">
                <div><span>Balance</span><strong>${s.starting_balance}</strong></div>
                <div><span>Bet range</span><strong>${s.min_bet} – ${s.max_bet}</strong></div>
                <div><span>Distance</span><strong>{s.default_distance}</strong></div>
                <div>
                  <span>Time pools</span>
                  <strong>{s.enable_time_pools ? 'On' : 'Off'}</strong>
                </div>
              </div>
              <footer>
                {enrolled ? (
                  <button className="chel-btn-primary" onClick={() => p.onOpen(s.session_id)}>Re-enter →</button>
                ) : (
                  <button className="chel-btn-primary" onClick={() => p.onJoin(s.session_id)}>Join →</button>
                )}
              </footer>
            </article>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Session (host + bettor share this shell, sub-views diverge by role + status)
// ═══════════════════════════════════════════════════════════════════════
function SessionView({
  state, myUid, horses, onLeave, onAction, setError, error,
}: {
  state: CheltenhamSessionState;
  myUid: string;
  horses: Horse[];
  onLeave: () => void;
  onAction: () => void;
  setError: (e: string | null) => void;
  error: string | null;
}) {
  const { session, participants, is_host, current_race, pools } = state;
  const meBalance = participants.find((p) => p.user_id === myUid)?.balance ?? session.starting_balance;
  const meEntry   = participants.find((p) => p.user_id === myUid);

  return (
    <div className="chel-session">
      <header className="chel-session-head">
        <button className="chel-link-back" onClick={onLeave}>← Back to lobby</button>
        <div>
          <span className="chel-eyebrow">Cheltenham · {session.name}</span>
          <h1>{session.status === 'lobby' ? 'Pre-game lobby' : `Race ${current_race?.race_number ?? '—'}`}</h1>
        </div>
        <div className="chel-session-balance">
          <span>Balance</span>
          <strong>{fmtUsd(meBalance)}</strong>
          {meEntry?.computed_pnl != null && (
            <em className={meEntry.computed_pnl >= 0 ? 'is-pos' : 'is-neg'}>
              {meEntry.computed_pnl >= 0 ? '+' : ''}{fmtUsd(meEntry.computed_pnl)}
            </em>
          )}
        </div>
      </header>

      {error && <div className="chel-error" onClick={() => setError(null)}>{error}</div>}

      <ParticipantList
        participants={participants}
        myUid={myUid}
        hostId={session.host_id}
      />

      {session.status === 'lobby' && (
        <LobbyState session={session} isHost={is_host} onAction={onAction} setError={setError} />
      )}

      {session.status === 'active' && !current_race && is_host && (
        <RaceDraft session={session} horses={horses} onAction={onAction} setError={setError} />
      )}

      {session.status === 'active' && !current_race && !is_host && (
        <div className="chel-waiting">Waiting for the host to draft a race…</div>
      )}

      {current_race && (
        <CurrentRace
          state={state}
          myUid={myUid}
          horses={horses}
          onAction={onAction}
          setError={setError}
        />
      )}
    </div>
  );
}

function ParticipantList({
  participants, myUid, hostId,
}: { participants: any[]; myUid: string; hostId: string }) {
  return (
    <section className="chel-participants">
      <h3>Participants ({participants.length})</h3>
      <ul>
        {participants.map((p) => {
          const isMe = p.user_id === myUid;
          const isHost = p.user_id === hostId;
          return (
            <li key={p.user_id} className={isMe ? 'is-me' : ''}>
              <span className="chel-part-name">
                {p.screenname || '—'}
                {isHost && <span className="chel-part-host-tag">HOST</span>}
                {isMe && <span className="chel-part-you-tag">YOU</span>}
              </span>
              <span className="chel-part-balance">{fmtUsd(p.balance ?? 0)}</span>
              {p.pools_total ? (
                <span className={`chel-part-bets ${p.has_bet_all_pools ? 'is-done' : ''}`}>
                  {p.has_bet_all_pools ? '✓ all pools' : `${p.pools_bet_count}/${p.pools_total} pools`}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function LobbyState({ session, isHost, onAction, setError }: any) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="chel-lobby-state">
      <p>Waiting for participants. Bets open at <strong>${session.min_bet} – ${session.max_bet}</strong> per pool. Each player starts with <strong>${session.starting_balance}</strong>.</p>
      {isHost && (
        <button className="chel-btn-primary" disabled={busy} onClick={async () => {
          setBusy(true);
          try { await chelBeginSession(session.session_id); onAction(); }
          catch (e: any) { setError(e?.response?.data?.error || 'Begin failed'); }
          setBusy(false);
        }}>Begin session →</button>
      )}
      {!isHost && <div className="chel-waiting">Waiting for the host to begin the session…</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Race draft (host only) — random or manual field selection
// ═══════════════════════════════════════════════════════════════════════
const DEFAULT_POOL_KINDS = ['winner', 'bridesmaid', 'backer', 'winner_nationality'] as const;
type DefaultPoolKind = typeof DEFAULT_POOL_KINDS[number];

function RaceDraft({
  session, horses, onAction, setError,
}: { session: CheltenhamSession; horses: Horse[]; onAction: () => void; setError: (m: string | null) => void; }) {
  const [fieldSize, setFieldSize] = useState<3 | 5 | 7>(5);
  const [mode, setMode] = useState<'random' | 'manual'>('random');
  const [selected, setSelected] = useState<number[]>([]);
  const [distance, setDistance] = useState(String(session.default_distance));
  const [busy, setBusy] = useState(false);
  // Per-race pool toggles. At least one must remain checked at draft time.
  const [enabledPools, setEnabledPools] = useState<Set<DefaultPoolKind>>(
    new Set(DEFAULT_POOL_KINDS)
  );

  const togglePool = (k: DefaultPoolKind) => {
    setEnabledPools((prev) => {
      const next = new Set(prev);
      if (next.has(k)) {
        if (next.size <= 1) return prev;     // never let them turn off the last one
        next.delete(k);
      } else {
        next.add(k);
      }
      return next;
    });
  };

  const toggleHorse = (hid: number) => {
    setSelected((prev) => {
      if (prev.includes(hid)) return prev.filter((x) => x !== hid);
      if (prev.length >= fieldSize) return prev;
      return [...prev, hid];
    });
  };

  const handleDraft = async () => {
    if (enabledPools.size === 0) { setError('At least one pool must be enabled'); return; }
    setBusy(true);
    try {
      const args: any = {
        session_id: session.session_id,
        field_size: fieldSize,
        mode,
        distance: parseInt(distance, 10) || session.default_distance,
        enabled_pools: Array.from(enabledPools),
      };
      if (mode === 'manual') {
        if (selected.length !== fieldSize) {
          setError(`Pick exactly ${fieldSize} horses`);
          setBusy(false);
          return;
        }
        args.horse_ids = selected;
      }
      await chelDraftRace(args);
      onAction();
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Draft failed');
    }
    setBusy(false);
  };

  return (
    <section className="chel-draft">
      <h2>Draft a race</h2>
      <div className="chel-draft-controls">
        <div className="chel-draft-group">
          <span>Field size</span>
          <div className="chel-pillrow">
            {[3, 5, 7].map((n) => (
              <button key={n} className={fieldSize === n ? 'is-active' : ''}
                      onClick={() => { setFieldSize(n as 3 | 5 | 7); setSelected([]); }}>{n}</button>
            ))}
          </div>
        </div>
        <div className="chel-draft-group">
          <span>Selection</span>
          <div className="chel-pillrow">
            <button className={mode === 'random' ? 'is-active' : ''} onClick={() => setMode('random')}>Random</button>
            <button className={mode === 'manual' ? 'is-active' : ''} onClick={() => setMode('manual')}>Manual</button>
          </div>
        </div>
        <div className="chel-draft-group">
          <span>Distance</span>
          <input type="number" value={distance} onChange={(e) => setDistance(e.target.value)} />
        </div>
      </div>

      <div className="chel-draft-pools">
        <span className="chel-draft-pools-label">Pools for this race</span>
        <div className="chel-draft-pools-row">
          {DEFAULT_POOL_KINDS.map((k) => {
            const on = enabledPools.has(k);
            return (
              <label key={k} className={`chel-pool-toggle ${on ? 'is-on' : ''}`}>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => togglePool(k)}
                />
                <span>{POOL_KIND_LABELS[k] || k}</span>
              </label>
            );
          })}
        </div>
        <p className="chel-draft-hint">
          At least one pool must be enabled. Winning-nationality is auto-skipped if the field has &lt; 2 distinct countries.
        </p>
      </div>

      {mode === 'manual' && (
        <div className="chel-draft-picker">
          <p className="chel-draft-hint">
            Click {fieldSize} horses. Selected: <strong>{selected.length}/{fieldSize}</strong>
          </p>
          <div className="chel-horse-grid">
            {horses.map((h) => {
              const idx = selected.indexOf(h.horse_id);
              const sel = idx >= 0;
              return (
                <button
                  key={h.horse_id}
                  className={`chel-horse-tile ${sel ? 'is-selected' : ''}`}
                  onClick={() => toggleHorse(h.horse_id)}
                >
                  <span className="chel-horse-tile-saddle" style={{ background: h.silks_color }}>
                    {sel ? idx + 1 : '·'}
                  </span>
                  <span className="chel-horse-tile-name">
                    {h.full_name}
                    {h.country && <em>({h.country})</em>}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="chel-draft-foot">
        <button className="chel-btn-primary" disabled={busy} onClick={handleDraft}>
          {busy ? 'Drafting…' : 'Draw the field →'}
        </button>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Current race — branches on status
// ═══════════════════════════════════════════════════════════════════════
function CurrentRace({
  state, myUid, horses, onAction, setError,
}: {
  state: CheltenhamSessionState;
  myUid: string;
  horses: Horse[];
  onAction: () => void;
  setError: (m: string | null) => void;
}) {
  const { session, current_race, is_host, pools } = state;
  if (!current_race) return null;

  const fieldByHorseId = useMemo(() => {
    const m: Record<number, HorseInField> = {};
    for (const h of (current_race.field_json || [])) m[h.horse_id] = h;
    return m;
  }, [current_race]);

  // Build a lookup from the catalogue too — the FieldStrip's "Show Card"
  // buttons need the FULL Horse (with stats) which the field_json lacks.
  const catalogueByHorseId = useMemo(() => {
    const m: Record<number, Horse> = {};
    for (const h of horses) m[h.horse_id] = h;
    return m;
  }, [horses]);

  // "Confirm Field" is a host-only intermediate state between drafting →
  // release-pools so bettors get a moment to study the line-up first.
  // Local-only — no backend round-trip needed.
  const [fieldConfirmed, setFieldConfirmed] = useState(false);

  // "Show Card" modal — opens the full catalogue card for one horse.
  const [cardHorse, setCardHorse] = useState<Horse | null>(null);

  return (
    <section className="chel-race">
      <RaceHeader race={current_race} />

      <FieldStrip
        field={current_race.field_json || []}
        catalogueByHorseId={catalogueByHorseId}
        onShowCard={(h) => setCardHorse(h)}
      />

      {cardHorse && (
        <div className="chel-card-modal-root" role="dialog" aria-modal="true">
          <div className="chel-card-modal-backdrop" onClick={() => setCardHorse(null)} />
          <div className="chel-card-modal-panel">
            <HorseFancyCard horse={cardHorse} onBack={() => setCardHorse(null)} />
          </div>
        </div>
      )}

      {/* DRAFTING — 2-step for the host: Confirm Field → Release Pools.
          Bettors see the field strip above and a waiting line below. */}
      {current_race.status === 'drafting' && (
        <div className="chel-action-bar">
          {is_host ? (
            !fieldConfirmed ? (
              <>
                <p className="chel-waiting" style={{ margin: 0 }}>
                  Field is drawn. Players can study the line-up — confirm to enable the Release Pools button.
                </p>
                <button className="chel-btn-secondary" onClick={() => setFieldConfirmed(true)}>
                  Confirm Field ✓
                </button>
              </>
            ) : (
              <>
                <p className="chel-waiting" style={{ margin: 0 }}>
                  Field confirmed. Release the pools to open wagering.
                </p>
                <button className="chel-btn-primary" onClick={async () => {
                  try {
                    // Re-send the host's pool selection — the backend
                    // echoes it back on /draft even when the migration
                    // for the enabled_pools column hasn't run yet, so
                    // this round-trips cleanly without a DB schema dep.
                    await chelReleasePools(current_race.race_id, current_race.enabled_pools || undefined);
                    onAction();
                  }
                  catch (e: any) { setError(e?.response?.data?.error || 'Release failed'); }
                }}>Release the pools →</button>
              </>
            )
          ) : (
            <div className="chel-waiting">
              Field is drawn — study the line-up. Waiting for the host to release the pools…
            </div>
          )}
        </div>
      )}

      {/* BETTING — show pool list with wager UI per pool. */}
      {current_race.status === 'betting' && (
        <BetEntry
          session={session}
          pools={pools}
          fieldByHorseId={fieldByHorseId}
          myUid={myUid}
          isHost={is_host}
          onAction={onAction}
          setError={setError}
        />
      )}

      {/* CLOSED — reveal everyone's bets + implied odds. */}
      {current_race.status === 'closed' && (
        <RevealView
          pools={pools}
          fieldByHorseId={fieldByHorseId}
          myUid={myUid}
          isHost={is_host}
          raceId={current_race.race_id}
          onAction={onAction}
          setError={setError}
        />
      )}

      {/* RACING — Churchill-Downs visual track now plays on BOTH host and
          bettor screens (trajectory is deterministic, so playback is
          independent + identical). The host's RAF callback also fires
          chelSettleRace when the last horse crosses, which flips race
          status → 'settled' and lands the SettleView for everyone. */}
      {current_race.status === 'racing' && current_race.trajectory_json && (
        <>
          <RaceAnimation
            field={current_race.field_json || []}
            trajectory={current_race.trajectory_json}
            eyebrow={`Cheltenham · Race ${current_race.race_number} · ${current_race.distance.toLocaleString()} lengths`}
            onFinished={async () => {
              if (!is_host) return;          // bettors don't fire settle
              try { await chelSettleRace(current_race.race_id); onAction(); }
              catch (e: any) { setError(e?.response?.data?.error || 'Settle failed'); }
            }}
          />
          <LiveRacePoolsPanel
            pools={pools}
            fieldByHorseId={fieldByHorseId}
            myUid={myUid}
          />
        </>
      )}

      {/* SETTLED — settlement view. */}
      {current_race.status === 'settled' && current_race.trajectory_json && (
        <SettleView
          race={current_race}
          pools={pools}
          fieldByHorseId={fieldByHorseId}
          myUid={myUid}
          isHost={is_host}
          onAction={onAction}
          setError={setError}
        />
      )}
    </section>
  );
}

function RaceHeader({ race }: { race: CheltenhamRace }) {
  return (
    <div className="chel-race-header">
      <span className="chel-eyebrow">
        Race {race.race_number} · {race.field_size}-horse · {race.distance.toLocaleString()} lengths
      </span>
      <span className={`chel-race-status is-${race.status}`}>{race.status.toUpperCase()}</span>
    </div>
  );
}

function FieldStrip({
  field, catalogueByHorseId, onShowCard,
}: {
  field: HorseInField[];
  catalogueByHorseId?: Record<number, Horse>;
  onShowCard?: (horse: Horse) => void;
}) {
  return (
    <div className="chel-field-strip">
      {field.map((h) => {
        const catalogueHorse = catalogueByHorseId?.[h.horse_id];
        return (
          <div key={h.horse_id} className="chel-field-card" title={h.full_name}>
            <span className="chel-field-saddle" style={{ background: h.silks_color }}>{h.post_position}</span>
            <span className="chel-field-name">
              <strong>{h.full_name}</strong>
              <span className="chel-field-nick">({h.saddle_name})</span>
            </span>
            {h.country && (
              <span className="chel-field-flag">
                <CountryFlag iso={h.country} height={14} />
              </span>
            )}
            {catalogueHorse && onShowCard && (
              <button
                className="chel-field-card-btn"
                onClick={(e) => { e.stopPropagation(); onShowCard(catalogueHorse); }}
              >
                Show Card →
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Bet entry — no prices visible. One picker + stake input per pool.
// ═══════════════════════════════════════════════════════════════════════
function BetEntry({
  session, pools, fieldByHorseId, myUid, isHost, onAction, setError,
}: {
  session: CheltenhamSession;
  pools: CheltenhamPool[];
  fieldByHorseId: Record<number, HorseInField>;
  myUid: string;
  isHost: boolean;
  onAction: () => void;
  setError: (m: string | null) => void;
}) {
  // Build initial selection state from existing wagers (so re-loading
  // shows what the user already bet).
  const initial = useMemo(() => {
    const sel: Record<number, string> = {};
    const stk: Record<number, string> = {};
    for (const p of pools) {
      const own = (p.wagers || []).find((w) => w.user_id === myUid);
      if (own) {
        sel[p.pool_id] = own.selection_key;
        stk[p.pool_id] = String(own.stake);
      }
    }
    return { sel, stk };
  }, [pools, myUid]);

  const [picks, setPicks]   = useState<Record<number, string>>(initial.sel);
  const [stakes, setStakes] = useState<Record<number, string>>(initial.stk);
  const [busyPool, setBusyPool] = useState<number | null>(null);

  const placeWager = async (poolId: number) => {
    const sel = picks[poolId];
    const stake = parseFloat(stakes[poolId] || '');
    if (!sel) { setError('Pick a horse / country / bucket first'); return; }
    if (!Number.isFinite(stake) || stake <= 0) { setError('Enter a stake'); return; }
    if (stake < session.min_bet || stake > session.max_bet) {
      setError(`Stake must be between $${session.min_bet} and $${session.max_bet}`); return;
    }
    setBusyPool(poolId);
    try {
      await chelWager({ pool_id: poolId, selection_key: sel, stake });
      onAction();
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Wager failed');
    }
    setBusyPool(null);
  };

  const allBet = pools.every((p) => (p.wagers || []).some((w) => w.user_id === myUid));

  return (
    <div className="chel-bet-entry">
      <div className="chel-bet-banner">
        <span>Place your wagers — <strong>${session.min_bet} – ${session.max_bet}</strong> per pool.</span>
        {allBet && <span className="chel-bet-banner-done">✓ You've bet all {pools.length} pools.</span>}
      </div>

      {pools.map((p) => (
        <div key={p.pool_id} className="chel-pool-card">
          <header>
            <h3>{POOL_KIND_LABELS[p.pool_kind] || p.pool_kind}</h3>
            <span className="chel-pool-meta">{p.payload_json?.horse_full_name ? `for ${p.payload_json.horse_full_name}` : ''}</span>
          </header>

          <PoolPicker
            pool={p}
            fieldByHorseId={fieldByHorseId}
            value={picks[p.pool_id] || ''}
            onChange={(v) => setPicks({ ...picks, [p.pool_id]: v })}
          />

          <div className="chel-pool-stake">
            <input
              type="number"
              min={session.min_bet}
              max={session.max_bet}
              step="1"
              value={stakes[p.pool_id] || ''}
              onChange={(e) => setStakes({ ...stakes, [p.pool_id]: e.target.value })}
              placeholder={`$${session.min_bet}-${session.max_bet}`}
            />
            <button
              className="chel-btn-primary"
              disabled={busyPool === p.pool_id}
              onClick={() => placeWager(p.pool_id)}
            >
              {(p.wagers || []).some((w) => w.user_id === myUid) ? 'Update bet' : 'Place bet'}
            </button>
          </div>
        </div>
      ))}

      {isHost && (
        <div className="chel-action-bar">
          <button className="chel-btn-primary" onClick={async () => {
            try {
              await chelCloseWagering(pools[0]?.race_id ?? -1);
              onAction();
            } catch (e: any) { setError(e?.response?.data?.error || 'Close failed'); }
          }}>Close wagering →</button>
        </div>
      )}
    </div>
  );
}

function PoolPicker({
  pool, fieldByHorseId, value, onChange,
}: {
  pool: CheltenhamPool;
  fieldByHorseId: Record<number, HorseInField>;
  value: string;
  onChange: (v: string) => void;
}) {
  if (pool.pool_kind === 'winner_nationality') {
    const codes: string[] = pool.payload_json?.countries || [];
    return (
      <div className="chel-pool-options">
        {codes.map((c) => (
          <button key={c} className={`chel-pool-opt ${value === c ? 'is-selected' : ''}`} onClick={() => onChange(c)}>
            <CountryFlag iso={c} height={18} />
            <span>{c}</span>
          </button>
        ))}
      </div>
    );
  }
  if (pool.pool_kind === 'time_bucket_horse') {
    const buckets = pool.payload_json?.buckets || [];
    return (
      <div className="chel-pool-options">
        {buckets.map((b: any) => (
          <button key={b.id} className={`chel-pool-opt ${value === b.id ? 'is-selected' : ''}`} onClick={() => onChange(b.id)}>
            {b.label}
          </button>
        ))}
      </div>
    );
  }
  // winner / bridesmaid / backer all pick from horse_ids.
  const ids: number[] = pool.payload_json?.horse_ids || [];
  return (
    <div className="chel-pool-options">
      {ids.map((hid) => {
        const h = fieldByHorseId[hid];
        if (!h) return null;
        return (
          <button
            key={hid}
            className={`chel-pool-opt ${value === String(hid) ? 'is-selected' : ''}`}
            onClick={() => onChange(String(hid))}
          >
            <span className="chel-pool-opt-saddle" style={{ background: h.silks_color }}>{h.post_position}</span>
            <span className="chel-pool-opt-name">{h.full_name}</span>
          </button>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Reveal view (status === 'closed') — show all bets per pool with implied odds
// ═══════════════════════════════════════════════════════════════════════
function RevealView({
  pools, fieldByHorseId, myUid, isHost, raceId, onAction, setError,
}: {
  pools: CheltenhamPool[];
  fieldByHorseId: Record<number, HorseInField>;
  myUid: string;
  isHost: boolean;
  raceId: number;
  onAction: () => void;
  setError: (m: string | null) => void;
}) {
  return (
    <div className="chel-reveal">
      <div className="chel-reveal-banner">Wagering closed — implied odds revealed below. Host sends to the gates next.</div>

      {pools.map((p) => {
        const wagers = p.wagers || [];
        const total = wagers.reduce((s, w) => s + Number(w.stake), 0);
        return (
          <div key={p.pool_id} className="chel-pool-card chel-pool-card-reveal">
            <header>
              <h3>{POOL_KIND_LABELS[p.pool_kind] || p.pool_kind}</h3>
              <span className="chel-pool-total">Pool total: <strong>{fmtUsd(total)}</strong> · {wagers.length} bettor{wagers.length === 1 ? '' : 's'}</span>
            </header>
            {wagers.length === 0 ? (
              <div className="chel-reveal-empty">No bets placed in this pool.</div>
            ) : (
              <table className="chel-reveal-table">
                <thead>
                  <tr>
                    <th>Bettor</th>
                    <th>Pick</th>
                    <th className="chel-num">Stake</th>
                    <th className="chel-num">Implied Odds</th>
                  </tr>
                </thead>
                <tbody>
                  {wagers.map((w) => (
                    <tr key={w.wager_id} className={w.user_id === myUid ? 'is-me' : ''}>
                      <td>
                        {w.screenname || '—'}
                        {w.user_id === myUid && <span className="chel-you-tag">YOU</span>}
                      </td>
                      <td><PickLabel pool={p} selKey={w.selection_key} fieldByHorseId={fieldByHorseId} /></td>
                      <td className="chel-num">{fmtUsd(Number(w.stake))}</td>
                      <td className="chel-num"><ImpliedOdds value={w.implied_odds} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })}

      {isHost && (
        <div className="chel-action-bar">
          <button className="chel-btn-primary" onClick={async () => {
            try { await chelSendOff(raceId); onAction(); }
            catch (e: any) { setError(e?.response?.data?.error || 'Send-off failed'); }
          }}>SEND TO THE GATES →</button>
        </div>
      )}
    </div>
  );
}

function PickLabel({
  pool, selKey, fieldByHorseId,
}: { pool: CheltenhamPool; selKey: string; fieldByHorseId: Record<number, HorseInField>; }) {
  if (pool.pool_kind === 'winner_nationality') {
    return (
      <span className="chel-pick">
        <CountryFlag iso={selKey} height={14} /> {selKey}
      </span>
    );
  }
  if (pool.pool_kind === 'time_bucket_horse') {
    const b = (pool.payload_json?.buckets || []).find((x: any) => x.id === selKey);
    return <span className="chel-pick">{b?.label || selKey}</span>;
  }
  const h = fieldByHorseId[parseInt(selKey, 10)];
  if (!h) return <span className="chel-pick">#{selKey}</span>;
  return (
    <span className="chel-pick">
      <span className="chel-pick-saddle" style={{ background: h.silks_color }}>{h.post_position}</span>
      {h.full_name}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Race playback now uses the shared Churchill-Downs RaceAnimation
// component on both host and bettor screens. Below it during a 'racing'
// status we render LiveRacePoolsPanel so everyone can flip through the
// pools and re-read the wagers (own + others, since the reveal phase
// already happened) while the horses run.
// ═══════════════════════════════════════════════════════════════════════
function LiveRacePoolsPanel({
  pools, fieldByHorseId, myUid,
}: {
  pools: CheltenhamPool[];
  fieldByHorseId: Record<number, HorseInField>;
  myUid: string;
}) {
  const [activeTab, setActiveTab] = useState<number>(pools[0]?.pool_id ?? -1);
  const activePool = pools.find((p) => p.pool_id === activeTab) || pools[0];
  if (!activePool) return null;
  const wagers = activePool.wagers || [];
  const total = wagers.reduce((s, w) => s + Number(w.stake), 0);

  return (
    <div className="chel-live-pools">
      <div className="chel-live-pools-tabs">
        {pools.map((p) => (
          <button
            key={p.pool_id}
            className={`chel-live-pools-tab ${activeTab === p.pool_id ? 'is-active' : ''}`}
            onClick={() => setActiveTab(p.pool_id)}
          >
            {POOL_KIND_LABELS[p.pool_kind] || p.pool_kind}
            <em>({(p.wagers || []).length})</em>
          </button>
        ))}
      </div>
      <div className="chel-live-pools-meta">
        Pool total <strong>{fmtUsd(total)}</strong> · {wagers.length} bettor{wagers.length === 1 ? '' : 's'}
      </div>
      {wagers.length === 0 ? (
        <div className="chel-reveal-empty">No bets in this pool.</div>
      ) : (
        <table className="chel-reveal-table">
          <thead>
            <tr>
              <th>Bettor</th>
              <th>Pick</th>
              <th className="chel-num">Stake</th>
              <th className="chel-num">Implied Odds</th>
            </tr>
          </thead>
          <tbody>
            {wagers.map((w) => (
              <tr key={w.wager_id} className={w.user_id === myUid ? 'is-me' : ''}>
                <td>
                  {w.screenname || '—'}
                  {w.user_id === myUid && <span className="chel-you-tag">YOU</span>}
                </td>
                <td><PickLabel pool={activePool} selKey={w.selection_key} fieldByHorseId={fieldByHorseId} /></td>
                <td className="chel-num">{fmtUsd(Number(w.stake))}</td>
                <td className="chel-num"><ImpliedOdds value={w.implied_odds} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Settle view (status === 'settled')
// ═══════════════════════════════════════════════════════════════════════
function SettleView({
  race, pools, fieldByHorseId, myUid, isHost, onAction, setError,
}: {
  race: CheltenhamRace;
  pools: CheltenhamPool[];
  fieldByHorseId: Record<number, HorseInField>;
  myUid: string;
  isHost: boolean;
  onAction: () => void;
  setError: (m: string | null) => void;
}) {
  const traj = race.trajectory_json!;
  const finishOrder: number[] = traj.finish_order || [];
  const finishMs: Record<number, number> = {};
  for (const f of (traj.finishes || [])) finishMs[f.horse_id] = f.finish_ms;

  // Aggregate: per-bettor PnL across all this race's pools.
  const pnlByUser: Record<string, { name: string; pnl: number; payout: number }> = {};
  for (const p of pools) {
    for (const w of (p.wagers || [])) {
      const uid = w.user_id;
      const cur = pnlByUser[uid] || { name: w.screenname || '—', pnl: 0, payout: 0 };
      cur.pnl    += Number(w.pnl ?? 0);
      cur.payout += Number(w.payout ?? 0);
      cur.name    = w.screenname || cur.name;
      pnlByUser[uid] = cur;
    }
  }

  return (
    <div className="chel-settle">
      <h2>Race {race.race_number} · settled</h2>

      <section className="chel-settle-board">
        <h3>Finish order</h3>
        <ol>
          {finishOrder.map((hid, i) => {
            const h = fieldByHorseId[hid];
            if (!h) return null;
            return (
              <li key={hid} className={i === 0 ? 'is-winner' : ''}>
                <span className="chel-finish-place">P{i + 1}</span>
                <span className="chel-finish-saddle" style={{ background: h.silks_color }}>{h.post_position}</span>
                <span className="chel-finish-name">{h.full_name}</span>
                <span className="chel-finish-time">{((finishMs[hid] || 0) / 1000).toFixed(2)}s</span>
              </li>
            );
          })}
        </ol>
      </section>

      <section>
        <h3>Pool settlements</h3>
        {pools.map((p) => (
          <div key={p.pool_id} className="chel-pool-card chel-pool-card-settle">
            <header>
              <h4>{POOL_KIND_LABELS[p.pool_kind] || p.pool_kind}</h4>
              <span>Winner: <strong>{p.winner_key ? <PickLabel pool={p} selKey={p.winner_key} fieldByHorseId={fieldByHorseId} /> : '—'}</strong></span>
            </header>
            <table className="chel-reveal-table">
              <thead>
                <tr>
                  <th>Bettor</th><th>Pick</th>
                  <th className="chel-num">Stake</th><th className="chel-num">Payout</th><th className="chel-num">P&amp;L</th>
                </tr>
              </thead>
              <tbody>
                {(p.wagers || []).map((w) => {
                  const won = w.pnl != null && Number(w.pnl) > 0;
                  return (
                    <tr key={w.wager_id} className={`${w.user_id === myUid ? 'is-me' : ''} ${won ? 'is-won' : 'is-lost'}`}>
                      <td>
                        {w.screenname || '—'}
                        {w.user_id === myUid && <span className="chel-you-tag">YOU</span>}
                      </td>
                      <td><PickLabel pool={p} selKey={w.selection_key} fieldByHorseId={fieldByHorseId} /></td>
                      <td className="chel-num">{fmtUsd(Number(w.stake))}</td>
                      <td className="chel-num">{fmtUsd(Number(w.payout ?? 0))}</td>
                      <td className={`chel-num ${won ? 'is-pos' : 'is-neg'}`}>
                        {(w.pnl ?? 0) >= 0 ? '+' : ''}{fmtUsd(Number(w.pnl ?? 0))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </section>

      <section className="chel-settle-summary">
        <h3>Net P&amp;L this race</h3>
        <table className="chel-reveal-table">
          <thead>
            <tr><th>Bettor</th><th className="chel-num">Total payout</th><th className="chel-num">Net P&amp;L</th></tr>
          </thead>
          <tbody>
            {Object.entries(pnlByUser).sort((a, b) => b[1].pnl - a[1].pnl).map(([uid, e]) => (
              <tr key={uid} className={uid === myUid ? 'is-me' : ''}>
                <td>{e.name}{uid === myUid && <span className="chel-you-tag">YOU</span>}</td>
                <td className="chel-num">{fmtUsd(e.payout)}</td>
                <td className={`chel-num ${e.pnl >= 0 ? 'is-pos' : 'is-neg'}`}>{e.pnl >= 0 ? '+' : ''}{fmtUsd(e.pnl)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {isHost && (
        <div className="chel-action-bar">
          <button className="chel-btn-primary" onClick={onAction}>Refresh</button>
          <DraftAnotherInline sessionId={race.session_id} onAction={onAction} setError={setError} />
          <ConcludeAndWriteInline sessionId={race.session_id} onAction={onAction} setError={setError} />
        </div>
      )}
    </div>
  );
}

function ConcludeAndWriteInline({
  sessionId, onAction, setError,
}: { sessionId: number; onAction: () => void; setError: (m: string | null) => void; }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="chel-btn-conclude"
      disabled={busy}
      onClick={async () => {
        if (!window.confirm(
          'End this session and write each player\'s net P&L to the bets table? This cannot be undone.'
        )) return;
        setBusy(true);
        try {
          const r = await chelConcludeSession(sessionId);
          onAction();
          window.alert(
            r?.bets_written != null
              ? `Session concluded. ${r.bets_written} P&L row(s) written to the book.`
              : 'Session concluded.'
          );
        } catch (e: any) {
          setError(e?.response?.data?.error || 'Conclude failed');
        }
        setBusy(false);
      }}
    >
      {busy ? 'Concluding…' : 'Conclude & Write P&L to Book'}
    </button>
  );
}

function DraftAnotherInline({
  sessionId, onAction, setError,
}: { sessionId: number; onAction: () => void; setError: (m: string | null) => void; }) {
  const [busy, setBusy] = useState(false);
  return (
    <button className="chel-btn-secondary" disabled={busy} onClick={async () => {
      setBusy(true);
      try {
        await chelDraftRace({ session_id: sessionId, field_size: 5, mode: 'random' });
        onAction();
      } catch (e: any) { setError(e?.response?.data?.error || 'Draft failed'); }
      setBusy(false);
    }}>+ Draft another race (random 5)</button>
  );
}

// (legacy flagEmoji helper deleted — every flag now uses the shared
// CountryFlag SVG component imported from components/Race/CountryFlag.)
