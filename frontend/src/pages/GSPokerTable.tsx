import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuthStore } from '../lib/state/authStore';
import {
  gsPokerGetState,
  gsPokerAction,
  gsPokerNextHand,
  gsPokerStartGame,
  gsPokerRebuyRequest,
  gsPokerRebuyApprove,
  gsPokerConclude,
  gsPokerLedger,
} from '../lib/api/api';
import supabase from '../lib/supabaseClient';
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
  sport: string;
  was_404: boolean;
  year_joined: number;
  was_prefect?: boolean;
  expelled?: boolean;
}

interface SeatData {
  user_id: string;
  screenname: string;
  avatar_url: string;
  hole_cards: GSCard[] | null;
  stack: number;
  status: 'active' | 'folded' | 'all_in';
  current_street_bet: number;
  total_hand_bet: number;
}

interface ActionEntry {
  seat: number;
  type: string;
  amount: number;
  street: string;
}

interface GameState {
  hand_id: number;
  hand_number: number;
  street: 'preflop' | 'flop' | 'river' | 'showdown' | 'complete';
  pot: number;
  community: GSCard[];
  community_cards: GSCard[];
  community_revealed: number;
  dealer_seat: number;
  current_actor_seat: number | null;
  current_bet: number;
  min_raise: number;
  small_blind: number;
  big_blind: number;
  all_in_showdown: boolean;
  winner_seats: number[];
  winner_hand_name: string;
  seats: Record<string, SeatData>;
  my_seat: number;
  is_my_turn: boolean;
  is_host: boolean;
  actions: ActionEntry[];
}

// ═══════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

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

const FELT_PRESETS = [
  { label: 'Classic', color: '#1a6b3c' },
  { label: 'Navy', color: '#1e3a5f' },
  { label: 'Purple', color: '#4a1942' },
  { label: 'Mahogany', color: '#3d0c02' },
];

// Seat layout positions: maps seat index (relative to my seat) to CSS class
// Bottom = me, then clockwise: left, top, right
const SEAT_POSITIONS = ['bottom', 'left', 'top', 'right'] as const;

// ═══════════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════════

function TableCard({ card, small }: { card: GSCard; small?: boolean }) {
  const houseColor = HOUSE_COLORS[card.house] || '#64748b';
  const sportLetter = SPORT_EMOJI[card.sport || ''] || (card.sport || '?')[0]?.toUpperCase() || '?';
  const imgUrl = `${API_BASE.replace('/api', '')}/goodshepherd/${card.img_filename}`;

  return (
    <div className={`gsp-card gsp-table-card ${small ? 'gsp-table-card-sm' : ''} ${card.was_404 ? 'gsp-card-404' : ''}`}>
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
          (e.target as HTMLImageElement).src =
            'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150"><rect width="200" height="150" fill="%23222"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="16" fill="%23666">No Image</text></svg>';
        }}
      />
      <div className="gsp-card-name">{card.name}</div>
      <div className="gsp-card-year-chip">{card.year_joined}</div>
    </div>
  );
}

function CardBack() {
  return (
    <div className="gsp-card gsp-table-card gsp-card-back">
      <div className="gsp-card-back-inner">
        <div className="gsp-card-back-pattern" />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════

interface GSPokerTableProps {
  sessionId: number;
  onLeave: () => void;
}

export default function GSPokerTable({ sessionId, onLeave }: GSPokerTableProps) {


  // Game state
  const [gs, setGs] = useState<GameState | null>(null);
  const [error, setError] = useState('');

  // All-in slow reveal: how many community cards to show (staggered)
  const [revealedCount, setRevealedCount] = useState(99); // 99 = show all (normal)
  const [peelDone, setPeelDone] = useState(true); // false during slow peel + flip animation
  const revealTimerRef = useRef<any>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Raise controls
  const [raiseAmount, setRaiseAmount] = useState('');
  const [showRaiseSlider, setShowRaiseSlider] = useState(false);

  // Settings
  const [feltColor, setFeltColor] = useState(FELT_PRESETS[0].color);
  const [showSettings, setShowSettings] = useState(false);

  // Winner animation
  const [winnerPot, setWinnerPot] = useState<number | null>(null);
  const [showWinFloat, setShowWinFloat] = useState(false);
  const [waitingForStart, setWaitingForStart] = useState(false);
  const [starting, setStarting] = useState(false);

  // Ledger
  const [showLedger, setShowLedger] = useState(false);
  const [ledgerData, setLedgerData] = useState<{seat_number: number; screenname: string; stack: number; total_buy_in: number; pnl: number}[]>([]);

  // Rebuy
  const [rebuyAmount, setRebuyAmount] = useState('');
  const [rebuyLoading, setRebuyLoading] = useState(false);

  // Hand rankings modal
  const [showRankings, setShowRankings] = useState(false);

  // Polling sequence guard
  const seqRef = useRef(0);
  const channelRef = useRef<any>(null);

  // Auto-clear errors
  useEffect(() => {
    if (error) {
      const t = setTimeout(() => setError(''), 4000);
      return () => clearTimeout(t);
    }
  }, [error]);

  // ── Load game state ──
  const loadState = useCallback(async () => {
    const seq = ++seqRef.current;
    try {
      const res = await gsPokerGetState(sessionId);
      if (seq !== seqRef.current) return;
      const newState: GameState = res.state || res;

      // Detect winner transition for animation
      setGs((prev) => {
        const isNewWinner = prev && newState.winner_seats.length > 0 && prev.winner_seats.length === 0;
        const isNewAllIn = newState.all_in_showdown && (!prev || !prev.all_in_showdown);

        // Detect all-in showdown transition → slow reveal
        if (isNewAllIn) {
          const alreadyRevealed = prev ? (prev.community_cards || prev.community || []).length : 0;
          setRevealedCount(alreadyRevealed);
          setPeelDone(false);
          if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
          const totalCards = (newState.community_cards || newState.community || []).length;
          const cardsToReveal = totalCards - alreadyRevealed;
          // Stagger cards with 5s gap, then show winner after all revealed
          for (let i = alreadyRevealed; i < totalCards; i++) {
            const delay = (i - alreadyRevealed + 1) * 5000;
            setTimeout(() => setRevealedCount(i + 1), delay);
          }
          // Mark peel done AFTER final card flip completes (5s per card + 1.5s flip)
          const peelDoneDelay = cardsToReveal * 5000 + 1500;
          setTimeout(() => setPeelDone(true), peelDoneDelay);
          // Delay winner animation until after all cards revealed + 1.5s for flip
          if (isNewWinner) {
            setTimeout(() => {
              setWinnerPot((newState as any).pot_won || newState.pot || 0);
              setShowWinFloat(true);
              setTimeout(() => setShowWinFloat(false), 3000);
            }, peelDoneDelay);
          }
        } else if (isNewWinner) {
          // Normal (non all-in) showdown: show winner immediately
          setWinnerPot((newState as any).pot_won || newState.pot || 0);
          setShowWinFloat(true);
          setTimeout(() => setShowWinFloat(false), 2500);
        }

        // Reset reveal count on new hand
        if (prev && newState.hand_number !== prev.hand_number) {
          setRevealedCount(99);
          setPeelDone(true);
        }
        return newState;
      });
    } catch (err: any) {
      if (seq === seqRef.current) {
        const status = err?.response?.status;
        const msg = err?.response?.data?.error || '';
        if (status === 404 && msg.includes('no active hand')) {
          setWaitingForStart(true);
        } else if (msg) {
          setError(msg);
        }
      }
    }
  }, [sessionId]);

  // Initial load
  useEffect(() => {
    loadState();
  }, [loadState]);

  // Polling every 1.5s
  useEffect(() => {
    const id = setInterval(loadState, 1500);
    return () => clearInterval(id);
  }, [loadState]);

  // Supabase realtime
  useEffect(() => {
    const channel = supabase
      .channel(`gs-poker-${sessionId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'gs_poker_hands' },
        () => { loadState(); }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, loadState]);

  // ── Actions ──

  const sendAction = useCallback(
    async (actionType: string, amount?: number) => {
      setActionLoading(true);
      setShowRaiseSlider(false);
      try {
        await gsPokerAction(sessionId, actionType, amount);
        loadState();
      } catch (err: any) {
        setError(err?.response?.data?.error || 'Action failed');
      }
      setActionLoading(false);
    },
    [sessionId, loadState]
  );

  const handleFold = () => sendAction('fold');
  const handleCheck = () => sendAction('check');
  const handleCall = () => sendAction('call');
  const handleAllIn = () => sendAction('all_in');
  const handleRaise = () => {
    const amt = parseFloat(raiseAmount);
    if (!amt || amt <= 0) {
      setError('Enter a valid raise amount');
      return;
    }
    sendAction('raise', amt);
    setRaiseAmount('');
  };

  const handleNextHand = async () => {
    setActionLoading(true);
    try {
      await gsPokerNextHand(sessionId);
      loadState();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Next hand failed');
    }
    setActionLoading(false);
  };

  // ── Derived values ──

  // These must be declared before the early return so they're available everywhere
  const currentUser = useAuthStore.getState().user;
  const isBookie = (currentUser?.role || '').toUpperCase() === 'BOOKIE';
  const seats = gs ? (gs.seats || {}) : {};

  const handleStart = async () => {
    setStarting(true);
    try {
      await gsPokerStartGame(sessionId);
      setWaitingForStart(false);
      loadState();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Start failed');
    }
    setStarting(false);
  };

  if (!gs) {
    return (
      <div className="gsp-table-page">
        <div className="gsp-table-topbar">
          <button className="gsp-back-btn" onClick={onLeave}>← Back</button>
          <span className="gsp-table-title">{waitingForStart ? 'Table Lobby' : 'Loading...'}</span>
        </div>
        {error && <div className="pari-toast pari-toast-error">{error}</div>}
        <div className="gsp-felt" style={{ background: feltColor }}>
          {waitingForStart ? (
            <div className="gsp-loading-msg" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.2rem', color: '#e2e8f0', marginBottom: 16 }}>Waiting for host to start the game...</div>
              {isBookie && (
                <button
                  className="pari-btn pari-btn-green pari-btn-lg"
                  onClick={handleStart}
                  disabled={starting}
                  style={{ marginTop: 8 }}
                >
                  {starting ? 'Starting...' : 'Start Game'}
                </button>
              )}
            </div>
          ) : (
            <div className="gsp-loading-msg">Connecting to table...</div>
          )}
        </div>
      </div>
    );
  }

  // Order seats so my seat is always at bottom
  const seatNumbers = Object.keys(seats).map(Number).sort((a, b) => a - b);
  const myIdx = seatNumbers.indexOf(gs.my_seat);
  const orderedSeats: { seatNum: number; data: SeatData; position: string }[] = [];

  for (let i = 0; i < seatNumbers.length; i++) {
    const idx = myIdx >= 0 ? myIdx : 0;
    const offset = (i - idx + seatNumbers.length) % seatNumbers.length;
    const pos = SEAT_POSITIONS[offset] || SEAT_POSITIONS[0];
    orderedSeats.push({
      seatNum: seatNumbers[i],
      data: seats[seatNumbers[i]],
      position: pos,
    });
  }

  // Fill empty positions for 4 seats max
  const filledPositions = new Set(orderedSeats.map((s) => s.position));

  const isShowdown = gs.street === 'showdown' || gs.street === 'complete';
  const isComplete = gs.street === 'complete' || gs.street === 'showdown';

  // Calculate call amount for current player
  const mySeat = seats[gs.my_seat];
  const callAmount = mySeat ? (gs.current_bet || 0) - (mySeat.current_street_bet || 0) : 0;
  const canCheck = callAmount <= 0;
  // min raise TO = current_bet + min_raise_increment, capped by stack
  const myStreetBet = mySeat ? mySeat.current_street_bet || 0 : 0;
  const minRaiseToIncrement = gs.min_raise || gs.big_blind || 2;
  const minRaiseTo = Math.min((gs.current_bet || 0) + minRaiseToIncrement, myStreetBet + (mySeat?.stack || 0));
  const maxRaiseTo = myStreetBet + (mySeat?.stack || 0);
  // "Bet" only when no bet exists on this street (post-flop with no action). Preflop always "Raise" (blinds count as a bet).
  const isBetNotRaise = gs.street === 'preflop' ? false : (gs.current_bet || 0) === 0;

  // Community cards: show only revealed ones
  // Backend sends community_cards already sliced to revealed count
  // For all-in showdown, further limit by slow reveal counter
  const allCommunityCards = gs.community_cards || gs.community || [];
  const communityCards = gs.all_in_showdown ? allCommunityCards.slice(0, revealedCount) : allCommunityCards;
  // During all-in slow peel, hide hand ranks until all cards are out AND flip animation finished
  const peelInProgress = gs.all_in_showdown && !peelDone;


  return (
    <div className="gsp-table-page">
      {/* ── Top bar ── */}
      <div className="gsp-table-topbar">
        <button className="gsp-back-btn" onClick={onLeave}>Back</button>
        <span className="gsp-table-title">
          Hand #{gs.hand_number} — {gs.street.toUpperCase()}
        </span>
        <div className="gsp-topbar-right">
          <span className="gsp-blinds-label" style={{ background: 'rgba(251,191,36,0.12)', color: '#fbbf24', padding: '4px 10px', borderRadius: 6, marginRight: 8 }}>
            {gs.hand_number} hands
          </span>
          <span className="gsp-blinds-label">
            Blinds {gs.small_blind}/{gs.big_blind}
          </span>
          <div className="gsp-settings-wrap">
            <button
              className="gsp-settings-btn"
              onClick={() => setShowSettings(!showSettings)}
              title="Settings"
            >
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                <path d="M10 13a3 3 0 100-6 3 3 0 000 6z" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M17.4 12.2a1.4 1.4 0 00.28 1.55l.05.05a1.7 1.7 0 11-2.4 2.4l-.05-.05a1.4 1.4 0 00-1.55-.28 1.4 1.4 0 00-.85 1.28v.15a1.7 1.7 0 11-3.4 0v-.08a1.4 1.4 0 00-.92-1.28 1.4 1.4 0 00-1.55.28l-.05.05a1.7 1.7 0 11-2.4-2.4l.05-.05a1.4 1.4 0 00.28-1.55 1.4 1.4 0 00-1.28-.85h-.15a1.7 1.7 0 110-3.4h.08a1.4 1.4 0 001.28-.92 1.4 1.4 0 00-.28-1.55l-.05-.05a1.7 1.7 0 112.4-2.4l.05.05a1.4 1.4 0 001.55.28h.07a1.4 1.4 0 00.85-1.28v-.15a1.7 1.7 0 013.4 0v.08a1.4 1.4 0 00.85 1.28 1.4 1.4 0 001.55-.28l.05-.05a1.7 1.7 0 112.4 2.4l-.05.05a1.4 1.4 0 00-.28 1.55v.07a1.4 1.4 0 001.28.85h.15a1.7 1.7 0 010 3.4h-.08a1.4 1.4 0 00-1.28.85z" stroke="currentColor" strokeWidth="1.5"/>
              </svg>
            </button>
            {showSettings && (
              <div className="gsp-settings-dropdown">
                <div className="gsp-settings-label">Felt Color</div>
                <div className="gsp-felt-picker">
                  {FELT_PRESETS.map((fp) => (
                    <button
                      key={fp.color}
                      className={`gsp-felt-swatch ${feltColor === fp.color ? 'gsp-felt-swatch-active' : ''}`}
                      style={{ background: fp.color }}
                      onClick={() => { setFeltColor(fp.color); setShowSettings(false); }}
                      title={fp.label}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
          <button
            className="gsp-settings-btn"
            onClick={async () => {
              try {
                const res = await gsPokerLedger(sessionId);
                setLedgerData(res.ledger || []);
                setShowLedger(true);
              } catch {}
            }}
            title="Ledger"
          >
            📒
          </button>
          <button
            className="gsp-settings-btn"
            onClick={() => setShowRankings(!showRankings)}
            title="Hand Rankings"
          >
            🃏
          </button>
          {isComplete && gs.is_host && (
            <button
              className="gsp-action-btn gsp-action-fold"
              style={{ padding: '5px 12px', fontSize: '0.75rem' }}
              onClick={async () => {
                if (!window.confirm('Conclude session? P&L will be written to the book.')) return;
                try {
                  await gsPokerConclude(sessionId);
                  onLeave();
                } catch (err: any) {
                  setError(err?.response?.data?.error || 'Conclude failed');
                }
              }}
            >
              End Session
            </button>
          )}
        </div>
      </div>

      {/* Pending rebuy requests (host only) */}
      {gs.is_host && (gs as any).pending_rebuys && (gs as any).pending_rebuys.length > 0 && (
        <div className="gsp-rebuy-requests">
          <span className="gsp-rebuy-icon">🔔 {(gs as any).pending_rebuys.length}</span>
          <div className="gsp-rebuy-list">
            {(gs as any).pending_rebuys.map((req: any) => (
              <div key={req.user_id} className="gsp-rebuy-item">
                <span>{req.screenname} wants to rebuy for <strong>{req.amount}</strong></span>
                <button
                  className="pari-btn pari-btn-green pari-btn-sm"
                  onClick={async () => {
                    try {
                      await gsPokerRebuyApprove(sessionId, req.user_id);
                      loadState();
                    } catch (err: any) {
                      setError(err?.response?.data?.error || 'Approve failed');
                    }
                  }}
                >
                  Approve
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ledger modal */}
      {showLedger && (
        <div className="gsp-ledger-overlay" onClick={() => setShowLedger(false)}>
          <div className="gsp-ledger-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Ledger</h3>
            <table className="pari-wagers-table" style={{ fontSize: '0.85rem' }}>
              <thead><tr><th>Player</th><th>Stack</th><th>Buy-in</th><th>P&L</th></tr></thead>
              <tbody>
                {ledgerData.map((p) => (
                  <tr key={p.seat_number}>
                    <td>{p.screenname}</td>
                    <td style={{ fontWeight: 700 }}>{p.stack}</td>
                    <td>{p.total_buy_in}</td>
                    <td style={{ fontWeight: 700, color: p.pnl >= 0 ? '#22c55e' : '#f87171' }}>
                      {p.pnl >= 0 ? '+' : ''}{p.pnl}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="pari-btn pari-btn-outline" style={{ marginTop: 12 }} onClick={() => setShowLedger(false)}>Close</button>
          </div>
        </div>
      )}

      {/* Hand Rankings modal */}
      {showRankings && (
        <div className="gsp-ledger-overlay" onClick={() => setShowRankings(false)}>
          <div className="gsp-ledger-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 550 }}>
            <h3>Hand Rankings (Low to High)</h3>
            <table className="pari-wagers-table" style={{ fontSize: '0.82rem' }}>
              <thead><tr><th>#</th><th>Hand</th><th>Description</th><th>Combos</th><th>Odds</th></tr></thead>
              <tbody>
                {[
                  { r: 1, n: 'One Pair', d: '2 same sport', c: 831, p: 45.66 },
                  { r: 2, n: 'Trips', d: '3 same sport', c: 386, p: 21.21 },
                  { r: 3, n: 'Boat', d: '2 pairs of sports', c: 190, p: 10.44 },
                  { r: 4, n: 'Straight', d: '4 consecutive years', c: 108, p: 5.93 },
                  { r: 5, n: 'Quads', d: '4 same sport', c: 34, p: 1.87 },
                  { r: 6, n: 'Flush', d: '4 same house', c: 16, p: 0.88 },
                  { r: 7, n: 'The 404', d: 'All 4 are 404 members', c: 5, p: 0.27 },
                ].map(h => (
                  <tr key={h.r} style={h.r === 8 ? { background: 'rgba(167,139,250,0.1)' } : {}}>
                    <td style={{ fontWeight: 800, color: '#64748b' }}>{h.r}</td>
                    <td style={{ fontWeight: 700 }}>{h.n}</td>
                    <td>{h.d}</td>
                    <td style={{ fontFamily: 'monospace', color: '#94a3b8' }}>{h.c}</td>
                    <td style={{ color: '#fbbf24', fontWeight: 700 }}>{h.p}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 10 }}>Tiebreaker: Height (cm), tallest wins. Total combos: 16C4 = 1,820.</p>
            <button className="pari-btn pari-btn-outline" style={{ marginTop: 8 }} onClick={() => setShowRankings(false)}>Close</button>
          </div>
        </div>
      )}

      {/* Error toast */}
      {error && <div className="pari-toast pari-toast-error">{error}</div>}

      {/* ── Felt ── */}
      <div
        className="gsp-felt"
        style={{
          background: `radial-gradient(ellipse at center, ${feltColor} 0%, ${adjustColor(feltColor, -30)} 100%)`,
        }}
      >
        {/* Community area */}
        <div className="gsp-community-area">
          <div className="gsp-pot">
            <span className="gsp-pot-label">POT</span>
            <span className="gsp-pot-amount">{gs.pot}</span>
          </div>
          <div className="gsp-community-cards">
            {communityCards.map((card: GSCard, i: number) => (
              <div
                key={card.character_id}
                className={`gsp-community-card-wrap ${gs.all_in_showdown ? 'gsp-card-flip-slow' : 'gsp-card-flip-in'}`}
                style={{ animationDelay: gs.all_in_showdown ? '0s' : `${i * 0.15}s` }}
              >
                <TableCard card={card} />
              </div>
            ))}
            {/* Placeholder slots for unrevealed community cards */}
            {Array.from({ length: 2 - communityCards.length }).map((_, i) => (
              <div key={`empty-${i}`} className="gsp-community-card-placeholder" />
            ))}
          </div>
        </div>

        {/* Seats */}
        {orderedSeats.map(({ seatNum, data, position }) => {
          const isDealer = seatNum === gs.dealer_seat;
          const isCurrentActor = seatNum === gs.current_actor_seat;
          const isWinner = (gs.winner_seats || []).includes(seatNum);
          const isFolded = data.status === 'folded';
          const isAllIn = data.status === 'all_in';

          // Last action this street for this seat
          const actions = gs.actions || [];
          const streetActions = actions.filter((a: any) => a.street === gs.street && a.seat === seatNum && a.type !== 'post_sb' && a.type !== 'post_bb');
          const lastAction = streetActions.length > 0 ? streetActions[streetActions.length - 1] : null;
          let actionLabel: string | null = null;
          if (lastAction) {
            const t = lastAction.type;
            if (t === 'raise') {
              // "Bet" if it's the first raise on this street (no prior raise/bet)
              const priorRaises = actions.filter((a: any) => a.street === gs.street && a.type === 'raise' && a.seat !== seatNum);
              actionLabel = priorRaises.length === 0 ? 'Bet' : 'Raise';
            } else {
              actionLabel = t.charAt(0).toUpperCase() + t.slice(1).replace('_', ' ');
            }
          }

          return (
            <div
              key={seatNum}
              className={[
                'gsp-seat',
                `gsp-seat-${position}`,
                isCurrentActor ? 'gsp-seat-active' : '',
                isWinner ? 'gsp-seat-winner' : '',
                isFolded ? 'gsp-seat-folded' : '',
                isAllIn ? 'gsp-seat-allin' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {/* Name + Stack + Avatar row */}
              <div className="gsp-seat-header">
                <div className="gsp-seat-info">
                  <span className="gsp-seat-name">{data.screenname}{isDealer && <span className="gsp-dealer-btn">D</span>}</span>
                  <span className="gsp-seat-stack">{data.stack}</span>
                </div>
                <div className="gsp-seat-avatar">
                  {data.avatar_url ? (
                    <img src={data.avatar_url} alt={data.screenname} className="gsp-avatar-img" />
                  ) : (
                    <div className="gsp-avatar-initial">
                      {(data.screenname || '?')[0].toUpperCase()}
                    </div>
                  )}
                </div>
              </div>


              {/* Street bet chips + last action label (hide at showdown) */}
              {!isShowdown && (data.current_street_bet > 0 || actionLabel) && (
                <div className="gsp-street-bet">
                  {data.current_street_bet > 0 && (
                    <>
                      <span className="gsp-chip-icon" />
                      <span className="gsp-chip-amount">{data.current_street_bet}</span>
                    </>
                  )}
                  {actionLabel && <span className="gsp-action-label">{actionLabel}</span>}
                </div>
              )}

              {/* Hole cards */}
              <div className="gsp-hole-cards">
                {data.hole_cards
                  ? data.hole_cards.map((card, ci) => (
                      <div
                        key={card.character_id}
                        className="gsp-hole-card-wrap gsp-card-deal-in"
                        style={{ animationDelay: `${ci * 0.15}s` }}
                      >
                        <TableCard card={card} small />
                      </div>
                    ))
                  : !isFolded &&
                    [0, 1].map((ci) => (
                      <div
                        key={ci}
                        className="gsp-hole-card-wrap gsp-card-deal-in"
                        style={{ animationDelay: `${ci * 0.15}s` }}
                      >
                        <CardBack />
                      </div>
                    ))}
              </div>

              {/* Hero hand rank on river (only visible to self) */}
              {!isShowdown && !peelInProgress && seatNum === gs.my_seat && (data as any).my_hand_name && (
                <div className="gsp-hand-rank gsp-hand-rank-hero">{(data as any).my_hand_name}</div>
              )}

              {/* Showdown hand rank — show for all non-folded players (hide during slow peel) */}
              {isShowdown && !peelInProgress && !isFolded && (data as any).hand_name && (
                <div className={`gsp-hand-rank ${isWinner ? 'gsp-hand-rank-winner' : ''}`}>{(data as any).hand_name}</div>
              )}

              {/* Winner float */}
              {isWinner && showWinFloat && winnerPot !== null && (
                <div className="gsp-win-float">+{winnerPot}</div>
              )}
            </div>
          );
        })}

        {/* Empty seat placeholders */}
        {SEAT_POSITIONS.filter((p) => !filledPositions.has(p)).map((pos) => (
          <div key={pos} className={`gsp-seat gsp-seat-${pos} gsp-seat-empty`}>
            <div className="gsp-empty-chair">Empty</div>
          </div>
        ))}
      </div>

      {/* ── Action bar ── */}
      <div className="gsp-action-bar">
        {/* Rebuy option when busted */}
        {mySeat && mySeat.stack === 0 && isComplete && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="number"
              className="gsp-raise-input"
              placeholder="Rebuy amount"
              value={rebuyAmount}
              onChange={(e) => setRebuyAmount(e.target.value)}
              style={{ width: 90 }}
            />
            <button
              className="gsp-action-btn gsp-action-next"
              disabled={rebuyLoading || !rebuyAmount}
              onClick={async () => {
                setRebuyLoading(true);
                try {
                  await gsPokerRebuyRequest(sessionId, parseFloat(rebuyAmount));
                  setRebuyAmount('');
                  loadState();
                } catch (err: any) {
                  setError(err?.response?.data?.error || 'Rebuy failed');
                }
                setRebuyLoading(false);
              }}
            >
              Request Rebuy
            </button>
          </div>
        )}

        {isComplete && gs.is_host ? (
          <button
            className="gsp-action-btn gsp-action-next"
            onClick={handleNextHand}
            disabled={actionLoading}
          >
            Next Hand
          </button>
        ) : (
          <>
            <button
              className="gsp-action-btn gsp-action-fold"
              onClick={handleFold}
              disabled={!gs.is_my_turn || actionLoading}
            >
              Fold
            </button>

            {canCheck ? (
              <button
                className="gsp-action-btn gsp-action-check"
                onClick={handleCheck}
                disabled={!gs.is_my_turn || actionLoading}
              >
                Check
              </button>
            ) : (
              <button
                className="gsp-action-btn gsp-action-call"
                onClick={handleCall}
                disabled={!gs.is_my_turn || actionLoading}
              >
                Call {Math.min(callAmount, mySeat?.stack || callAmount)}
              </button>
            )}

            <div className="gsp-raise-group">
              {showRaiseSlider && (
                <div className="gsp-raise-controls">
                  {isBetNotRaise && gs.pot > 0 && (
                    <div className="gsp-pot-presets">
                      {[{label: '¼', frac: 0.25}, {label: '½', frac: 0.5}, {label: '¾', frac: 0.75}, {label: 'Pot', frac: 1}].map(p => {
                        const amt = Math.max(Math.round(gs.pot * p.frac), minRaiseTo);
                        return (
                          <button key={p.label} className="gsp-pot-preset-btn" onClick={() => setRaiseAmount(String(Math.min(amt, maxRaiseTo)))}>
                            {p.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <input
                    type="range"
                    className="gsp-raise-slider"
                    min={minRaiseTo}
                    max={maxRaiseTo}
                    step={1}
                    value={raiseAmount || minRaiseTo}
                    onChange={(e) => setRaiseAmount(e.target.value)}
                  />
                  <input
                    type="number"
                    className="gsp-raise-input"
                    value={raiseAmount}
                    onChange={(e) => setRaiseAmount(e.target.value)}
                    placeholder={String(minRaiseTo)}
                    min={minRaiseTo}
                    max={maxRaiseTo}
                  />
                  <button
                    className="gsp-action-btn gsp-action-raise-confirm"
                    onClick={handleRaise}
                    disabled={!gs.is_my_turn || actionLoading}
                  >
                    {isBetNotRaise ? 'Bet' : 'Raise'}
                  </button>
                </div>
              )}
              <button
                className="gsp-action-btn gsp-action-raise"
                onClick={() => {
                  setShowRaiseSlider(!showRaiseSlider);
                  if (!raiseAmount) setRaiseAmount(String(Math.max(minRaiseTo, gs.big_blind * 2)));
                }}
                disabled={!gs.is_my_turn || actionLoading}
              >
                {isBetNotRaise ? 'Bet' : 'Raise'}
              </button>
            </div>

            <button
              className="gsp-action-btn gsp-action-allin"
              onClick={handleAllIn}
              disabled={!gs.is_my_turn || actionLoading}
            >
              All-In
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Utility
// ═══════════════════════════════════════════════════════════════════

function adjustColor(hex: string, amount: number): string {
  let c = hex.replace('#', '');
  if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
  const num = parseInt(c, 16);
  let r = Math.max(0, Math.min(255, ((num >> 16) & 0xff) + amount));
  let g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + amount));
  let b = Math.max(0, Math.min(255, (num & 0xff) + amount));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}
