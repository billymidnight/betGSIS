import React, { useEffect, useRef, useState } from 'react';
import {
  mbCreateSession, mbListSessions, mbSessionDetail, mbJoin, mbBegin,
  mbCreateRound, mbBid, mbCloseRound, mbSettle, mbVoidRound, mbConclude, mbDeleteSession,
  mbDeleteAllSessions,
} from '../lib/api/api';
import { useAuthStore } from '../lib/state/authStore';
import NativeGames from '../components/MelBrooks/NativeGames';
import './MelBrooks.css';

interface Bid { bid_id: number; user_id: string; screenname?: string; avatar_url?: string; amount: number; is_winner?: boolean; pnl?: number | null; }
interface Round {
  round_id: number; round_number: number; description: string; prize: number;
  status: 'bidding' | 'closed' | 'settled' | 'voided';
  winner_id?: string | null; result?: string | null;
  draw_kind?: string | null; draw_state?: any; bids: Bid[]; bid_count?: number;
  recent_bids?: { user_id: string; amount: number; screenname?: string; avatar_url?: string }[];
}
interface Participant { user_id: string; screenname?: string; avatar_url?: string; balance: number; computed_pnl?: number; }
interface Session {
  session_id: number; name: string; host_id: string; host_screenname?: string;
  status: 'lobby' | 'active' | 'concluded'; starting_balance: number;
  bids_visible: boolean; liquidity_provider: string; player_count?: number;
}

const money = (v: number) => `$${Number(v || 0).toFixed(2)}`;

const AV_COLORS = ['#d4af37', '#5b8def', '#e0655b', '#3fb27f', '#a06cd5', '#e08a3c', '#4bb1c9'];
function Avatar({ name, url, size = 26 }: { name?: string; url?: string; size?: number }) {
  const label = (name || '?').trim();
  const initials = label.slice(0, 2).toUpperCase();
  const color = AV_COLORS[Math.abs([...label].reduce((a, c) => a + c.charCodeAt(0), 0)) % AV_COLORS.length];
  const style: React.CSSProperties = { width: size, height: size, fontSize: size * 0.42 };
  if (url) return <img className="mb-av" style={style} src={url} alt={label} />;
  return <span className="mb-av mb-av-fallback" style={{ ...style, background: color }}>{initials}</span>;
}

export default function MelBrooks() {
  const user = useAuthStore((s) => s.user);
  const myUserId = user?.user_id || '';
  const isBookie = (user?.role || '').toUpperCase() === 'BOOKIE';

  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [isHost, setIsHost] = useState(false);

  // forms
  const [newName, setNewName] = useState('');
  const [bidsVisible, setBidsVisible] = useState(false);
  const [roundDesc, setRoundDesc] = useState('');
  const [roundPrize, setRoundPrize] = useState('');
  const [bidAmt, setBidAmt] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const pollRef = useRef<any>(null);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2500); };

  const loadList = async () => {
    try { const r = await mbListSessions(); setSessions(r.sessions || []); } catch (e) { /* ignore */ }
  };
  const loadSession = async (id: number) => {
    try {
      const r = await mbSessionDetail(id);
      setSession(r.session); setParticipants(r.participants || []);
      setRounds(r.rounds || []); setIsHost(!!r.is_host);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { loadList(); }, []);

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (activeId == null) {
      pollRef.current = setInterval(loadList, 6000);
    } else {
      loadSession(activeId);
      pollRef.current = setInterval(() => loadSession(activeId), 3000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  // ── actions ──
  const createSession = async () => {
    if (!newName.trim()) return flash('Name required');
    try {
      const r = await mbCreateSession({ name: newName.trim(), bids_visible: bidsVisible, liquidity_provider: 'players' });
      setNewName('');
      await loadList();
      if (r.session_id) setActiveId(r.session_id);
    } catch (e: any) { flash(e?.response?.data?.error || 'Create failed'); }
  };
  const join = async (id: number) => {
    try { await mbJoin(id); setActiveId(id); } catch (e: any) {
      if (e?.response?.status === 409) setActiveId(id); else flash(e?.response?.data?.error || 'Join failed');
    }
  };
  const begin = async () => { try { await mbBegin(activeId!); loadSession(activeId!); } catch (e: any) { flash(e?.response?.data?.error || 'Failed'); } };
  const postRound = async () => {
    if (!roundDesc.trim() || roundPrize === '') return flash('Event + prize required');
    try {
      await mbCreateRound(activeId!, roundDesc.trim(), parseFloat(roundPrize));
      setRoundDesc(''); setRoundPrize(''); loadSession(activeId!);
    } catch (e: any) { flash(e?.response?.data?.error || 'Failed'); }
  };
  const submitBid = async (roundId: number) => {
    if (bidAmt === '') return flash('Enter a bid');
    try { await mbBid(roundId, parseFloat(parseFloat(bidAmt).toFixed(2))); setBidAmt(''); loadSession(activeId!); }
    catch (e: any) { flash(e?.response?.data?.error || 'Bid failed'); }
  };
  const closeRound = async (rid: number) => { try { await mbCloseRound(rid); loadSession(activeId!); } catch (e: any) { flash(e?.response?.data?.error || 'Failed'); } };
  const settle = async (rid: number, result: 'bidder_win' | 'bidder_lose') => {
    try { await mbSettle(rid, result); loadSession(activeId!); flash(result === 'bidder_win' ? 'Bidder won' : 'Bidder lost'); }
    catch (e: any) { flash(e?.response?.data?.error || 'Failed'); }
  };
  const voidRound = async (rid: number) => { try { await mbVoidRound(rid); loadSession(activeId!); } catch (e: any) { flash(e?.response?.data?.error || 'Failed'); } };
  const conclude = async () => {
    if (!confirm('Conclude session and write P&L to the book?')) return;
    try { await mbConclude(activeId!); loadSession(activeId!); flash('Concluded — booked'); }
    catch (e: any) { flash(e?.response?.data?.error || 'Failed'); }
  };
  const del = async (id: number) => {
    if (!confirm('Delete this session? (does not touch the book)')) return;
    try { await mbDeleteSession(id); if (activeId === id) setActiveId(null); loadList(); }
    catch (e: any) { flash(e?.response?.data?.error || 'Failed'); }
  };
  const delAll = async () => {
    if (!confirm('Delete ALL sessions you host? (does not touch the book)')) return;
    try { const r = await mbDeleteAllSessions(); setActiveId(null); loadList(); flash(`Deleted ${r.deleted ?? 0} session(s)`); }
    catch (e: any) { flash(e?.response?.data?.error || 'Failed'); }
  };

  const leaderboard = [...participants].sort((a, b) => b.balance - a.balance);
  const activeRound = rounds.find((r) => r.status === 'bidding' || r.status === 'closed') || null;
  const settledRounds = rounds.filter((r) => r.status === 'settled');
  const nextRoundNum = rounds.reduce((m, r) => Math.max(m, r.round_number), 0) + 1;
  const iAmIn = participants.some((p) => p.user_id === myUserId);

  // ── stake math for display (mirrors backend) ──
  const stakeLines = (r: Round) => {
    const winner = r.bids.find((b) => b.is_winner);
    if (!winner) return null;
    const B = Number(winner.amount);
    const P = Number(r.prize);
    const others = r.bids.filter((b) => !b.is_winner);
    const k = others.length || 1;
    return { B, P, winnerRisk: B, winnerWin: P - B, otherRisk: (P - B) / k, otherWin: B / k, k: others.length };
  };

  // ═══════════════ LANDING ═══════════════
  if (activeId == null) {
    return (
      <div className="mb-page">
        <div className="mb-hero">
          <h1 className="mb-title">The Mel Brooks Game</h1>
          <p className="mb-sub">Live first-price auction betting. Bid for the right to play — the rest lay you off.</p>
        </div>

        {isBookie && (
          <div className="mb-create">
            <input className="mb-input" placeholder="Session name" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <label className="mb-check">
              <input type="checkbox" checked={bidsVisible} onChange={(e) => setBidsVisible(e.target.checked)} />
              Bids visible live
            </label>
            <button className="mb-btn mb-btn-gold" onClick={createSession}>Host a Game</button>
          </div>
        )}

        <div className="mb-list-head">
          <div className="mb-section-title">Available Games</div>
          {isBookie && sessions.length > 0 && (
            <button className="mb-btn mb-btn-danger sm" onClick={delAll}>Delete All Sessions</button>
          )}
        </div>
        <div className="mb-session-list">
          {sessions.length === 0 && <div className="mb-empty">No games yet.</div>}
          {sessions.map((s) => (
            <div className="mb-session-card" key={s.session_id}>
              <div className="mb-session-main">
                <div className="mb-session-name">{s.name}</div>
                <div className="mb-session-meta">
                  Host {s.host_screenname || '—'} · {s.player_count ?? 0} players
                  <span className={`mb-badge mb-badge-${s.status}`}>{s.status}</span>
                </div>
              </div>
              <div className="mb-session-actions">
                {s.status === 'lobby' && s.host_id !== myUserId && (
                  <button className="mb-btn" onClick={() => join(s.session_id)}>Join</button>
                )}
                {(s.status !== 'lobby' || s.host_id === myUserId) && (
                  <button className="mb-btn" onClick={() => setActiveId(s.session_id)}>Enter</button>
                )}
                {s.host_id === myUserId && (
                  <button className="mb-btn mb-btn-danger" onClick={() => del(s.session_id)}>✕</button>
                )}
              </div>
            </div>
          ))}
        </div>
        {toast && <div className="mb-toast">{toast}</div>}
      </div>
    );
  }

  // ═══════════════ IN A SESSION ═══════════════
  return (
    <div className="mb-page">
      <div className="mb-topbar">
        <button className="mb-back" onClick={() => setActiveId(null)}>← Games</button>
        <div className="mb-topbar-name">{session?.name}</div>
        <span className={`mb-badge mb-badge-${session?.status}`}>{session?.status}</span>
      </div>

      <div className="mb-layout">
        <div className="mb-main">
          {/* LOBBY */}
          {session?.status === 'lobby' && (
            <div className="mb-card">
              <div className="mb-card-title">Waiting Room</div>
              <div className="mb-players">
                {participants.map((p) => (
                  <span className="mb-chip" key={p.user_id}>
                    <Avatar name={p.screenname} url={p.avatar_url} size={22} />
                    {p.screenname || p.user_id.slice(0, 6)}
                  </span>
                ))}
                {participants.length === 0 && <span className="mb-empty">No players yet</span>}
              </div>
              {!iAmIn && !isHost && <button className="mb-btn mb-btn-gold" onClick={() => join(activeId)}>Join Game</button>}
              {isHost && <button className="mb-btn mb-btn-gold" onClick={begin} disabled={participants.length < 1}>Begin Game</button>}
              {!isHost && iAmIn && <div className="mb-wait">Waiting for the host to begin…</div>}
            </div>
          )}

          {/* ACTIVE */}
          {session?.status === 'active' && (
            <>
              {/* Host: post a new round when none active */}
              {isHost && !activeRound && (
                <div className="mb-card">
                  <div className="mb-card-title">Post a Round</div>
                  <textarea className="mb-input mb-textarea" placeholder="Event — e.g. Draw 3 cards, no clubs" value={roundDesc} onChange={(e) => setRoundDesc(e.target.value)} />
                  <div className="mb-row">
                    <input className="mb-input" type="number" step="0.01" placeholder="Prize $" value={roundPrize} onChange={(e) => setRoundPrize(e.target.value)} />
                    <button className="mb-btn mb-btn-gold" onClick={postRound}>Release Round</button>
                  </div>
                </div>
              )}

              {!activeRound && !isHost && (
                <div className="mb-card mb-waiting-round">
                  <div className="mb-waiting-dots"><span/><span/><span/></div>
                  <div className="mb-waiting-text">Waiting for round {nextRoundNum}…</div>
                  <div className="mb-wait">The host is preparing the next event.</div>
                </div>
              )}

              {activeRound && (
                <div className="mb-card mb-round">
                  <div className="mb-round-head">
                    <div className="mb-round-num">Round {activeRound.round_number}</div>
                    {isHost && <button className="mb-btn mb-btn-danger sm" onClick={() => voidRound(activeRound.round_id)}>Delete</button>}
                  </div>
                  <div className="mb-round-desc">{activeRound.description}</div>
                  <div className="mb-prize-bubble"><span className="mb-prize-label">PAYS</span>{money(activeRound.prize)}</div>

                  {/* BIDDING */}
                  {activeRound.status === 'bidding' && (() => {
                    const live = !!session.bids_visible;
                    const standings = [...activeRound.bids].sort((a, b) => Number(b.amount) - Number(a.amount));
                    const high = standings.length ? Number(standings[0].amount) : 0;
                    const leader = standings.length ? standings[0] : null;
                    const myBid = activeRound.bids.find((b) => b.user_id === myUserId);
                    const feed = activeRound.recent_bids || [];
                    const prize = Number(activeRound.prize);
                    const iAmLeader = !!(leader && leader.user_id === myUserId);
                    const quickBid = (inc: number) => {
                      const v = Math.min(prize, Math.round((high + inc) * 100) / 100);
                      setBidAmt(v.toFixed(2));
                    };
                    return (
                      <>
                        {live ? (
                          <>
                            <div className="mb-auction-high">
                              <span className="mb-auction-high-label">CURRENT HIGH</span>
                              <span className="mb-auction-high-val">{money(high)}</span>
                              {leader && (
                                <span className="mb-auction-leader">
                                  <Avatar name={leader.screenname} url={leader.avatar_url} size={20} />
                                  {leader.screenname || leader.user_id.slice(0, 6)}{iAmLeader ? ' (you)' : ''} leading
                                </span>
                              )}
                            </div>
                            <div className="mb-ladder-label">Last 7 bids</div>
                            <div className="mb-ladder">
                              {feed.map((b, i) => (
                                <div className={`mb-ladder-row ${Number(b.amount) === high && i === 0 ? 'lead' : ''} ${b.user_id === myUserId ? 'me' : ''}`} key={i}>
                                  <span className="mb-ladder-rank">{Number(b.amount) === high && i === 0 ? '👑' : ''}</span>
                                  <Avatar name={b.screenname} url={b.avatar_url} size={24} />
                                  <span className="mb-ladder-name">
                                    {b.screenname || b.user_id.slice(0, 6)}
                                    {b.user_id === myUserId ? <span className="mb-you-tag">YOU</span> : null}
                                  </span>
                                  <span className="mb-ladder-amt">{money(Number(b.amount))}</span>
                                </div>
                              ))}
                              {feed.length === 0 && <div className="mb-empty">No bids yet — open the bidding.</div>}
                            </div>
                            {iAmIn && !isHost && (
                              <>
                                <div className="mb-quick-row">
                                  <button className="mb-quick" onClick={() => quickBid(0.20)}>+20¢</button>
                                  <button className="mb-quick" onClick={() => quickBid(0.40)}>+40¢</button>
                                  <button className="mb-quick" onClick={() => quickBid(1.00)}>+$1</button>
                                </div>
                                <div className="mb-row mb-bid-box">
                                  <input className="mb-input" type="number" step="0.01" min={0} max={prize}
                                    placeholder={standings.length ? `Outbid — more than ${money(high)} (max ${money(prize)})` : `Opening bid $ (max ${money(prize)})`}
                                    value={bidAmt} onChange={(e) => setBidAmt(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') submitBid(activeRound.round_id); }} />
                                  <button className="mb-btn mb-btn-gold" onClick={() => submitBid(activeRound.round_id)}>
                                    {iAmLeader ? 'Raise' : 'Outbid'}
                                  </button>
                                </div>
                              </>
                            )}
                          </>
                        ) : (
                          <>
                            {iAmIn && !isHost && (
                              <div className="mb-bid-box">
                                {myBid ? (
                                  <div className="mb-bid-done">
                                    Your bid: <b>{money(myBid.amount)}</b>
                                    <span className="mb-bid-edit"> — resubmit to change</span>
                                  </div>
                                ) : null}
                                <div className="mb-row">
                                  <input className="mb-input" type="number" step="0.01" placeholder="Your sealed bid $" value={bidAmt} onChange={(e) => setBidAmt(e.target.value)} />
                                  <button className="mb-btn mb-btn-gold" onClick={() => submitBid(activeRound.round_id)}>Submit Bid</button>
                                </div>
                              </div>
                            )}
                            <div className="mb-bids-live">
                              {isHost ? (
                                activeRound.bids.map((b) => (
                                  <div className="mb-bid-row" key={b.bid_id}>
                                    <span className="mb-bid-who">
                                      <Avatar name={b.screenname} url={b.avatar_url} size={24} />
                                      {b.screenname || b.user_id.slice(0, 6)}
                                    </span>
                                    <span>{money(b.amount)}</span>
                                  </div>
                                ))
                              ) : (
                                <div className="mb-sealed">{activeRound.bid_count ?? activeRound.bids.length} sealed bid(s) in</div>
                              )}
                            </div>
                          </>
                        )}
                        {isHost && <button className="mb-btn mb-btn-gold" onClick={() => closeRound(activeRound.round_id)}>Close Auction — Highest Wins</button>}
                      </>
                    );
                  })()}

                  {/* CLOSED — reveal, crown, stakes, native settle */}
                  {activeRound.status === 'closed' && (() => {
                    const st = stakeLines(activeRound);
                    const uniqueTop = activeRound.bids.filter((b) => b.is_winner).length === 1;
                    const winnerBid = activeRound.bids.find((b) => b.is_winner);
                    const otherBids = activeRound.bids.filter((b) => !b.is_winner);
                    const winnerName = winnerBid?.screenname || winnerBid?.user_id.slice(0, 6) || 'Bidder';
                    const myBid = activeRound.bids.find((b) => b.user_id === myUserId);
                    return (
                      <>
                        <div className="mb-reveal">
                          {activeRound.bids.map((b) => {
                            const mine = b.user_id === myUserId;
                            return (
                              <div className={`mb-bid-row ${b.is_winner ? 'winner' : ''}`} key={b.bid_id}>
                                <span className="mb-bid-who">
                                  {uniqueTop && b.is_winner ? <span className="mb-crown">👑</span> : null}
                                  <Avatar name={b.screenname} url={b.avatar_url} size={24} />
                                  {b.screenname || b.user_id.slice(0, 6)}{mine ? <span className="mb-you-tag">YOU</span> : null}
                                </span>
                                <span>{money(b.amount)}</span>
                              </div>
                            );
                          })}
                        </div>

                        {st && (
                          <div className="mb-stakes">
                            <div className="mb-stake-line">
                              <span className="mb-crown">👑</span> <b>{winnerName}</b> risks <b className="risk">{money(st.winnerRisk)}</b> to win <b className="win">{money(st.winnerWin)}</b> <span className="mb-collect">(collects {money(st.P)})</span>
                            </div>
                            {st.k > 0 && (
                              <div className="mb-stake-line">
                                {otherBids.map((b, i) => (
                                  <span key={b.bid_id}>{i > 0 ? ', ' : ''}<b>{b.screenname || b.user_id.slice(0, 6)}</b></span>
                                ))}
                                {' '}each risk <b className="risk">{money(st.otherRisk)}</b> to win <b className="win">{money(st.otherWin)}</b>
                              </div>
                            )}
                          </div>
                        )}

                        {myBid && (
                          <div className={`mb-you-summary ${myBid.is_winner ? 'is-winner' : ''}`}>
                            {myBid.is_winner ? (
                              <>
                                <div className="mb-you-headline">🏆 Your bid won.</div>
                                <div className="mb-you-body">
                                  You're staking <b className="risk">{money(st!.winnerRisk)}</b> to win <b className="win">{money(st!.winnerWin)}</b> if this happens:
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="mb-you-headline">You're laying off the bidder.</div>
                                <div className="mb-you-body">
                                  You're staking <b className="risk">{money(st!.otherRisk)}</b> to win <b className="win">{money(st!.otherWin)}</b> if this does <u>not</u> happen:
                                </div>
                              </>
                            )}
                            <div className="mb-you-desc">“{activeRound.description}”</div>
                          </div>
                        )}

                        <NativeGames roundId={activeRound.round_id} isHost={isHost} drawKind={activeRound.draw_kind} drawState={activeRound.draw_state} />

                        {isHost && (
                          <div className="mb-settle-row">
                            <button className="mb-btn mb-btn-win" onClick={() => settle(activeRound.round_id, 'bidder_win')}>Bidder Win</button>
                            <button className="mb-btn mb-btn-lose" onClick={() => settle(activeRound.round_id, 'bidder_lose')}>Bidder Lose</button>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}

              {/* Settled history */}
              {settledRounds.length > 0 && (
                <div className="mb-card">
                  <div className="mb-card-title">Settled Rounds</div>
                  {settledRounds.slice().reverse().map((r) => (
                    <div className="mb-hist" key={r.round_id}>
                      <div className="mb-hist-top">
                        <span>#{r.round_number} · {r.description}</span>
                        <span className={`mb-res ${r.result === 'bidder_win' ? 'win' : 'lose'}`}>{r.result === 'bidder_win' ? 'Bidder won' : 'Bidder lost'}</span>
                      </div>
                      <div className="mb-hist-bids">
                        {r.bids.map((b) => (
                          <span key={b.bid_id} className="mb-hist-bid">
                            {b.is_winner ? '👑 ' : ''}{b.screenname || b.user_id.slice(0, 6)} {money(b.amount)}
                            <b className={Number(b.pnl) >= 0 ? 'pos' : 'neg'}> {Number(b.pnl) >= 0 ? '+' : ''}{money(Number(b.pnl))}</b>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {isHost && (
                <div className="mb-host-footer">
                  <button className="mb-btn mb-btn-gold" onClick={conclude}>Conclude & Book P&L</button>
                </div>
              )}
            </>
          )}

          {session?.status === 'concluded' && (
            <div className="mb-card">
              <div className="mb-card-title">Session Concluded</div>
              <div className="mb-wait">Final standings on the right. P&L written to the book.</div>
            </div>
          )}
        </div>

        {/* LEADERBOARD — always visible */}
        <div className="mb-leaderboard">
          <div className="mb-lb-title">Leaderboard</div>
          {leaderboard.map((p, i) => (
            <div className={`mb-lb-row ${p.user_id === myUserId ? 'me' : ''}`} key={p.user_id}>
              <span className="mb-lb-rank">{i + 1}</span>
              <Avatar name={p.screenname} url={p.avatar_url} size={26} />
              <span className="mb-lb-name">{p.screenname || p.user_id.slice(0, 6)}</span>
              <span className="mb-lb-bal">{money(p.balance)}</span>
              <span className={`mb-lb-pnl ${(p.computed_pnl || 0) >= 0 ? 'pos' : 'neg'}`}>
                {(p.computed_pnl || 0) >= 0 ? '+' : ''}{money(p.computed_pnl || 0)}
              </span>
            </div>
          ))}
          {leaderboard.length === 0 && <div className="mb-empty">No players</div>}
        </div>
      </div>
      {toast && <div className="mb-toast">{toast}</div>}
    </div>
  );
}
