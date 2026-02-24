import React, { useEffect, useState, useMemo } from 'react';
import { fetchBookkeepingSummary, fetchAllBets, fetchBetGSISUsers, deleteBet, addBet } from '../lib/api/api';
import BetEditModal from '../components/Bookie/BetEditModal';
import './BetGSISPortfolio.css';

// ── helpers ──
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmtTime(raw: string | null | undefined): string {
  if (!raw) return '—';
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw;
    const mon = MONTHS[d.getMonth()];
    const day = d.getDate();
    const yr = String(d.getFullYear()).slice(2);
    let hr = d.getHours();
    const min = String(d.getMinutes()).padStart(2, '0');
    const ampm = hr >= 12 ? 'pm' : 'am';
    hr = hr % 12 || 12;
    return `${mon} ${day} '${yr}  ${hr}:${min}${ampm}`;
  } catch { return raw || '—'; }
}

function americanToDecimal(amer: string | number | null): number | null {
  try {
    if (amer == null) return null;
    const a = parseFloat(String(amer).replace('+', ''));
    if (isNaN(a)) return null;
    return a > 0 ? (a / 100) + 1 : (100 / Math.abs(a)) + 1;
  } catch { return null; }
}

function calcPnl(stake: number, oddsAmer: string | number | null, result: string | null): number {
  const res = (result || '').trim().toLowerCase();
  if (res === 'loss') return -stake;
  if (res === 'push') return 0;
  if (res === 'win') {
    const dec = americanToDecimal(oddsAmer);
    return dec ? (dec - 1) * stake : 0;
  }
  return 0;
}

// ── types ──
type UserOption = { user_id: string; screenname: string; bet_count: number };

// ── row limit options ──
const LIMIT_OPTIONS = [10, 50, 100, 200, 500] as const;

export default function BetGSISPortfolio() {
  const [summary, setSummary] = useState<any>(null);
  const [allBets, setAllBets] = useState<any[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  // filters
  const [rowLimit, setRowLimit] = useState<number>(50);
  const [playerFilter, setPlayerFilter] = useState<string>('all');
  const [playerSearch, setPlayerSearch] = useState('');
  const [activeOnly, setActiveOnly] = useState(false);

  // toggle
  const [viewMode, setViewMode] = useState<'bets' | 'stats'>('bets');

  // user-specific comparison
  const [compareA, setCompareA] = useState<string>('');
  const [compareB, setCompareB] = useState<string>('');

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [s, b, u] = await Promise.all([
        fetchBookkeepingSummary(),
        fetchAllBets(),
        fetchBetGSISUsers(),
      ]);
      setSummary(s);
      setAllBets(b.bets || []);
      setUsers(u.users || []);
    } catch (e) {
      console.error('Failed to load portfolio', e);
    } finally {
      setLoading(false);
    }
  };

  // ── derived key stats ──
  const total_wagers_accepted = allBets.length;
  const total_wagers_active = allBets.filter((x) => !x.result).length;
  const net_book_profit = summary ? Number(summary.book_pnl) : 0;
  const active_risk = summary ? Number(summary.live_risk) : 0;

  // ── market-wise breakdown (book perspective) ──
  const marketBreakdown = useMemo(() => {
    const byMkt: Record<string, { wagers: number; wagered: number; pnl: number }> = {};
    for (const b of allBets) {
      const mkt = b.market || 'Unknown';
      if (!byMkt[mkt]) byMkt[mkt] = { wagers: 0, wagered: 0, pnl: 0 };
      byMkt[mkt].wagers += 1;
      const stake = Number(b.bet_size || 0);
      byMkt[mkt].wagered += stake;
      // only count pnl on settled
      if (b.result) {
        const bettorPnl = calcPnl(stake, b.odds_american, b.result);
        byMkt[mkt].pnl += -bettorPnl; // book perspective = flip
      }
    }
    return Object.entries(byMkt)
      .map(([market, d]) => ({ market, ...d, roi: d.wagered > 0 ? (d.pnl / d.wagered) * 100 : 0 }))
      .sort((a, b) => b.wagered - a.wagered);
  }, [allBets]);

  // ── add bet modal state ──
  const [showAddBet, setShowAddBet] = useState(false);
  const [abUser, setAbUser] = useState('');
  const [abMarket, setAbMarket] = useState('');
  const [abOutcome, setAbOutcome] = useState('');
  const [abStake, setAbStake] = useState('');
  const [abOdds, setAbOdds] = useState('');
  const [abGameId, setAbGameId] = useState('');
  const [abResult, setAbResult] = useState('pending');
  const [abSaving, setAbSaving] = useState(false);

  const abPayout = useMemo(() => {
    const stake = parseFloat(abStake);
    if (isNaN(stake) || !abOdds) return null;
    const dec = americanToDecimal(abOdds);
    if (!dec) return null;
    return (dec * stake).toFixed(2);
  }, [abStake, abOdds]);

  const handleAddBet = async () => {
    if (!abUser || !abStake || !abOdds) { alert('User, stake, and odds are required'); return; }
    setAbSaving(true);
    try {
      await addBet({
        user_id: abUser,
        market: abMarket || 'default',
        outcome: abOutcome,
        bet_size: parseFloat(abStake),
        odds_american: abOdds,
        game_id: abGameId ? parseInt(abGameId) : undefined,
        result: abResult === 'pending' ? undefined : abResult,
      });
      setShowAddBet(false);
      setAbUser(''); setAbMarket(''); setAbOutcome(''); setAbStake(''); setAbOdds(''); setAbGameId(''); setAbResult('pending');
      loadAll();
    } catch (e) {
      console.error('Failed to add bet', e);
      alert('Failed to add bet');
    } finally {
      setAbSaving(false);
    }
  };
  const displayBets = useMemo(() => {
    let filtered = allBets;
    if (activeOnly) {
      filtered = filtered.filter((b) => !b.result || b.result.toLowerCase() === 'pending');
    }
    if (playerFilter !== 'all') {
      filtered = filtered.filter((b) => String(b.user_id) === playerFilter);
    }
    return filtered.slice(0, rowLimit);
  }, [allBets, playerFilter, rowLimit, activeOnly]);

  // ── timeseries for chart ──
  const parsedTimes = useMemo(() => {
    const settled = allBets.filter((b) => b.result != null);
    const mapped = settled.map((b) => {
      let dt: Date | null = null;
      const tstr = b.placed_at_utc || b.placed_at || b.placed_at_edt || null;
      try { if (tstr) { const c = new Date(tstr); if (!isNaN(c.getTime())) dt = c; } } catch {}
      const bettorPnl = Number(b.pnl_calc || 0);
      return { ts: dt ? dt.getTime() : null, pnl: -bettorPnl };
    }).filter((x) => x.ts !== null) as Array<{ts:number,pnl:number}>;
    mapped.sort((a,b) => a.ts - b.ts);
    const out: Array<{ts:number,cum:number}> = [];
    let cum = 0;
    for (const m of mapped) { cum += m.pnl; out.push({ts: m.ts, cum}); }
    return out;
  }, [allBets]);

  const [chartRange, setChartRange] = useState<'1d'|'7d'|'30d'|'all'>('7d');

  const timesForRange = useMemo(() => {
    if (!parsedTimes.length) return [];
    const now = Date.now();
    let since = 0;
    if (chartRange === '1d') since = now - 86400000;
    else if (chartRange === '7d') since = now - 604800000;
    else if (chartRange === '30d') since = now - 2592000000;
    return chartRange === 'all' ? parsedTimes : parsedTimes.filter(p => p.ts >= since);
  }, [parsedTimes, chartRange]);

  const chartData = useMemo(() => {
    const data = timesForRange.length ? timesForRange : parsedTimes.slice(-40);
    if (!data.length) return {points:[], min:0, max:0};
    const vals = data.map(d => d.cum);
    return { points: data, min: Math.min(...vals), max: Math.max(...vals) };
  }, [timesForRange, parsedTimes]);

  // ── delete handler ──
  const handleDelete = async (betId: number) => {
    if (!window.confirm(`Delete Bet #${betId}?\n\nThis will permanently remove it from the database.`)) return;
    try {
      await deleteBet(betId);
      loadAll();
    } catch (e) {
      console.error('Failed to delete bet', e);
      alert('Failed to delete bet');
    }
  };

  // ── player dropdown filtered by search ──
  const filteredUsers = useMemo(() => {
    if (!playerSearch.trim()) return users;
    const q = playerSearch.toLowerCase();
    return users.filter(u => u.screenname.toLowerCase().includes(q));
  }, [users, playerSearch]);

  // ── user-specific stats computation ──
  const computeUserStats = (userId: string) => {
    const userBets = allBets.filter((b) => String(b.user_id) === userId);
    const settled = userBets.filter((b) => b.result != null);
    let netPnl = 0;
    let totalWagered = 0;
    for (const b of settled) {
      const stake = Number(b.bet_size || 0);
      totalWagered += stake;
      netPnl += calcPnl(stake, b.odds_american, b.result);
    }
    // also add unsettled to wagered
    const unsettled = userBets.filter(b => !b.result);
    for (const b of unsettled) totalWagered += Number(b.bet_size || 0);

    const roi = totalWagered > 0 ? (netPnl / totalWagered) * 100 : 0;

    // market breakdown
    const byMarket: Record<string, { wagered: number; pnl: number }> = {};
    for (const b of settled) {
      const mkt = b.outcome?.split(' - ')[0] || b.market || 'Unknown';
      // actually use the `market` field from the bet, not outcome
      const market = b.market || 'Unknown';
      if (!byMarket[market]) byMarket[market] = { wagered: 0, pnl: 0 };
      const stake = Number(b.bet_size || 0);
      byMarket[market].wagered += stake;
      byMarket[market].pnl += calcPnl(stake, b.odds_american, b.result);
    }

    return {
      netPnl,
      totalWagers: userBets.length,
      totalWagered,
      roi,
      byMarket,
    };
  };

  const statsA = compareA ? computeUserStats(compareA) : null;
  const statsB = compareB ? computeUserStats(compareB) : null;
  const nameA = users.find(u => u.user_id === compareA)?.screenname || '—';
  const nameB = users.find(u => u.user_id === compareB)?.screenname || '—';

  // ── Chart renderer ──
  const renderChart = () => {
    if (!chartData.points.length) return <div style={{color:'#94a3b8'}}>No settled bets to render P&L chart</div>;
    const w = 600; const h = 200; const pts = chartData.points;
    const mL = 72, mR = 16, mT = 12, mB = 32;
    const iW = w - mL - mR, iH = h - mT - mB;
    const min = chartData.min, max = chartData.max, rng = (max - min) || 1;
    const xs = pts.map((_,i) => pts.length===1 ? mL+iW/2 : mL+(i/(pts.length-1))*iW);
    const ys = pts.map(p => mT+(iH-((p.cum-min)/rng)*iH));
    const path = pts.map((_,i) => `${i===0?'M':'L'} ${xs[i].toFixed(2)} ${ys[i].toFixed(2)}`).join(' ');
    const fillPath = `${path} L ${mL+iW} ${mT+iH} L ${mL} ${mT+iH} Z`;
    const lastCum = pts[pts.length-1].cum, firstCum = pts[0].cum;
    const color = lastCum >= firstCum ? '#28a745' : '#e55353';

    const yTicks = 5;
    const yTickVals = Array.from({length:yTicks},(_,i) => min+(i/(yTicks-1))*(max-min));
    const firstTs = pts[0].ts, lastTs = pts[pts.length-1].ts;
    const xTicks = Math.min(5, pts.length);
    const span = lastTs - firstTs;
    const fmtShort = (ms:number) => {
      const d = new Date(ms);
      return span <= 172800000 ? d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : d.toLocaleDateString([],{month:'short',day:'numeric'});
    };

    return (
      <svg width="100%" height={200} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        <g>
          {yTickVals.map((v,i) => {
            const y = mT+(iH-((v-min)/rng)*iH);
            return (<g key={i}><line x1={mL} y1={y} x2={mL+iW} y2={y} stroke="#1f2937" strokeWidth={1}/><text x={8} y={y+4} fill="#94a3b8" fontSize={11}>${v.toFixed(0)}</text></g>);
          })}
          <line x1={mL} y1={mT+iH} x2={mL+iW} y2={mT+iH} stroke="#24303f" strokeWidth={1}/>
          {Array.from({length:xTicks},(_,i) => {
            const t = firstTs+(i/(xTicks-1||1))*(lastTs-firstTs);
            const x = mL+((t-firstTs)/(lastTs-firstTs||1))*iW;
            return (<g key={i}><line x1={x} y1={mT+iH} x2={x} y2={mT+iH+6} stroke="#334155" strokeWidth={1}/><text x={x} y={mT+iH+20} fill="#94a3b8" fontSize={11} textAnchor="middle">{fmtShort(t)}</text></g>);
          })}
          <path d={fillPath} fill={lastCum>=firstCum?'rgba(40,167,69,0.08)':'rgba(229,83,83,0.06)'} stroke="none"/>
          <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
        </g>
      </svg>
    );
  };

  // ── Stat card helper ──
  const StatCard = ({ label, value, color }: { label: string; value: string; color?: string }) => (
    <div className="bgp-stat-card">
      <div className="bgp-stat-value" style={color ? { color } : {}}>{value}</div>
      <div className="bgp-stat-label">{label}</div>
    </div>
  );

  return (
    <div className="bgp-page">
      <h1 className="bgp-title">betGSIS-Portfolio (Bookmaker)</h1>

      {/* ── Key Stats Row ── */}
      <div className="bgp-key-stats">
        <StatCard label="Net Book Profit" value={`$${net_book_profit.toFixed(2)}`} color={net_book_profit >= 0 ? '#28a745' : '#e55353'} />
        <StatCard label="Active Risk" value={`$${Number(active_risk).toFixed(2)}`} />
        <StatCard label="Total Wagers" value={String(total_wagers_accepted)} />
        <StatCard label="Active Wagers" value={String(total_wagers_active)} />
      </div>

      {/* ── P&L Chart ── */}
      <div className="bgp-card">
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
          <h3 style={{margin:0}}>Book P&L Over Time</h3>
          <div style={{display:'flex',gap:6}}>
            {(['1d','7d','30d','all'] as const).map(r => (
              <button key={r} onClick={() => setChartRange(r)} className={`bgp-range-btn ${r===chartRange?'active':''}`}>{r.toUpperCase()}</button>
            ))}
          </div>
        </div>
        <div style={{height:220,display:'flex',alignItems:'center',justifyContent:'center'}}>
          {renderChart()}
        </div>
      </div>

      {/* ── View Mode Toggle + Add Bet ── */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16,flexWrap:'wrap',gap:12}}>
        <div className="bgp-toggle-row" style={{marginBottom:0}}>
          <button className={`bgp-toggle-btn ${viewMode==='bets'?'active':''}`} onClick={() => setViewMode('bets')}>Bets</button>
          <button className={`bgp-toggle-btn ${viewMode==='stats'?'active':''}`} onClick={() => setViewMode('stats')}>User-Specific Stats</button>
        </div>
        <button className="bgp-add-bet-btn" onClick={() => setShowAddBet(true)}>＋ Add Bet</button>
      </div>

      {viewMode === 'bets' ? (
        <>
          {/* ── Filters Row ── */}
          <div className="bgp-filters-row">
            {/* Active Only */}
            <div className="bgp-filter-group">
              <button
                className={`bgp-active-toggle ${activeOnly ? 'active' : ''}`}
                onClick={() => setActiveOnly(!activeOnly)}
              >{activeOnly ? 'Active Only' : 'All Bets'}</button>
            </div>

            {/* Row Limit */}
            <div className="bgp-filter-group">
              <label>Show:</label>
              <select value={rowLimit} onChange={(e) => setRowLimit(Number(e.target.value))}>
                {LIMIT_OPTIONS.map(n => <option key={n} value={n}>Last {n}</option>)}
              </select>
            </div>

            {/* Player Filter */}
            <div className="bgp-filter-group">
              <label>Player:</label>
              <div className="bgp-player-dropdown">
                <input
                  type="text"
                  placeholder="Search player..."
                  value={playerSearch}
                  onChange={(e) => setPlayerSearch(e.target.value)}
                  className="bgp-player-search"
                />
                <select value={playerFilter} onChange={(e) => { setPlayerFilter(e.target.value); setPlayerSearch(''); }}>
                  <option value="all">All Players</option>
                  {filteredUsers.map(u => (
                    <option key={u.user_id} value={u.user_id}>{u.screenname || u.user_id} ({u.bet_count})</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* ── Bets Table ── */}
          <div className="bgp-card bgp-table-card">
            <h3 style={{margin:'0 0 12px 0'}}>
              {playerFilter === 'all' ? 'All Bets' : `Bets — ${users.find(u => u.user_id === playerFilter)?.screenname || 'User'}`}
              <span style={{color:'#94a3b8',fontWeight:400,fontSize:'0.9rem',marginLeft:8}}>
                (showing {displayBets.length} of {playerFilter === 'all' ? allBets.length : allBets.filter(b => String(b.user_id) === playerFilter).length})
              </span>
            </h3>
            <div style={{overflowX:'auto'}}>
              <table className="bgp-bets-table">
                <thead>
                  <tr>
                    <th>BetID</th>
                    <th>Time Placed</th>
                    <th>Game No</th>
                    <th>Bettor</th>
                    <th>Outcome</th>
                    <th>Bet Amount</th>
                    <th>Odds</th>
                    <th>Result</th>
                    <th>P&L</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {displayBets.map((r) => {
                    const pnl = Number(r.pnl_calc || 0);
                    return (
                      <tr key={r.bet_id}>
                        <td style={{fontFamily:'monospace'}}>{r.bet_id}</td>
                        <td style={{whiteSpace:'nowrap'}}>{fmtTime(r.placed_at_edt || r.placed_at_utc)}</td>
                        <td>{r.game_id}</td>
                        <td>{r.screenname || '—'}</td>
                        <td style={{maxWidth:220,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.outcome}</td>
                        <td style={{fontFamily:'monospace'}}>${Number(r.bet_size).toFixed(2)}</td>
                        <td style={{fontFamily:'monospace'}}>{r.odds_american}</td>
                        <td>
                          {r.result ? (
                            <span className={`bgp-result-badge ${r.result.toLowerCase()}`}>{r.result}</span>
                          ) : (
                            <span className="bgp-result-badge pending">Pending</span>
                          )}
                        </td>
                        <td style={{fontFamily:'monospace',color: pnl >= 0 ? '#28a745' : '#e55353'}}>
                          {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}
                        </td>
                        <td style={{whiteSpace:'nowrap'}}>
                          <button onClick={() => setEditing(r)} className="bgp-action-btn" title="Edit">✏️</button>
                          <button onClick={() => handleDelete(r.bet_id)} className="bgp-action-btn" title="Delete">🗑️</button>
                        </td>
                      </tr>
                    );
                  })}
                  {displayBets.length === 0 && (
                    <tr><td colSpan={10} style={{textAlign:'center',padding:24,color:'#94a3b8'}}>No bets found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        /* ── User-Specific Stats ── */
        <div className="bgp-stats-view">
          <div className="bgp-compare-selectors">
            <div className="bgp-compare-select">
              <label>Player A:</label>
              <select value={compareA} onChange={(e) => setCompareA(e.target.value)}>
                <option value="">Select player...</option>
                {users.map(u => <option key={u.user_id} value={u.user_id}>{u.screenname || u.user_id} ({u.bet_count})</option>)}
              </select>
            </div>
            <div className="bgp-vs">VS</div>
            <div className="bgp-compare-select">
              <label>Player B:</label>
              <select value={compareB} onChange={(e) => setCompareB(e.target.value)}>
                <option value="">Select player...</option>
                {users.map(u => <option key={u.user_id} value={u.user_id}>{u.screenname || u.user_id} ({u.bet_count})</option>)}
              </select>
            </div>
          </div>

          {(statsA || statsB) && (
            <>
              {/* Summary comparison table */}
              <div className="bgp-card" style={{marginBottom:16}}>
                <table className="bgp-compare-table">
                  <thead>
                    <tr>
                      <th>Stat</th>
                      <th style={{textAlign:'right'}}>{nameA}</th>
                      <th style={{textAlign:'right'}}>{nameB}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Net P&L</td>
                      <td style={{textAlign:'right',fontFamily:'monospace',color:(statsA?.netPnl||0)>=0?'#28a745':'#e55353'}}>{(statsA?.netPnl||0)>=0?'+':''}{(statsA?.netPnl||0).toFixed(2)}</td>
                      <td style={{textAlign:'right',fontFamily:'monospace',color:(statsB?.netPnl||0)>=0?'#28a745':'#e55353'}}>{(statsB?.netPnl||0)>=0?'+':''}{(statsB?.netPnl||0).toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td>Total Wagers</td>
                      <td style={{textAlign:'right',fontFamily:'monospace'}}>{statsA?.totalWagers||0}</td>
                      <td style={{textAlign:'right',fontFamily:'monospace'}}>{statsB?.totalWagers||0}</td>
                    </tr>
                    <tr>
                      <td>Total Wagered</td>
                      <td style={{textAlign:'right',fontFamily:'monospace'}}>${(statsA?.totalWagered||0).toFixed(2)}</td>
                      <td style={{textAlign:'right',fontFamily:'monospace'}}>${(statsB?.totalWagered||0).toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td>ROI</td>
                      <td style={{textAlign:'right',fontFamily:'monospace',color:(statsA?.roi||0)>=0?'#28a745':'#e55353'}}>{(statsA?.roi||0)>=0?'+':''}{(statsA?.roi||0).toFixed(1)}%</td>
                      <td style={{textAlign:'right',fontFamily:'monospace',color:(statsB?.roi||0)>=0?'#28a745':'#e55353'}}>{(statsB?.roi||0)>=0?'+':''}{(statsB?.roi||0).toFixed(1)}%</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Market breakdown comparison table */}
              {(() => {
                const allMarkets = new Set<string>();
                if (statsA) Object.keys(statsA.byMarket).forEach(m => allMarkets.add(m));
                if (statsB) Object.keys(statsB.byMarket).forEach(m => allMarkets.add(m));
                const sorted = Array.from(allMarkets).sort((a,b) => {
                  const aw = (statsA?.byMarket[a]?.wagered||0) + (statsB?.byMarket[a]?.wagered||0);
                  const bw = (statsA?.byMarket[b]?.wagered||0) + (statsB?.byMarket[b]?.wagered||0);
                  return bw - aw;
                });
                if (sorted.length === 0) return null;
                return (
                  <div className="bgp-card">
                    <h3 style={{margin:'0 0 12px 0'}}>Market Breakdown</h3>
                    <div style={{overflowX:'auto'}}>
                      <table className="bgp-compare-table">
                        <thead>
                          <tr>
                            <th>Market</th>
                            <th style={{textAlign:'right'}}>{nameA} Wagered</th>
                            <th style={{textAlign:'right'}}>{nameA} P&L</th>
                            <th style={{textAlign:'right'}}>{nameB} Wagered</th>
                            <th style={{textAlign:'right'}}>{nameB} P&L</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sorted.map(mkt => {
                            const da = statsA?.byMarket[mkt];
                            const db = statsB?.byMarket[mkt];
                            return (
                              <tr key={mkt}>
                                <td>{mkt}</td>
                                <td style={{textAlign:'right',fontFamily:'monospace'}}>${(da?.wagered||0).toFixed(2)}</td>
                                <td style={{textAlign:'right',fontFamily:'monospace',color:(da?.pnl||0)>=0?'#28a745':'#e55353'}}>{(da?.pnl||0)>=0?'+':''}{(da?.pnl||0).toFixed(2)}</td>
                                <td style={{textAlign:'right',fontFamily:'monospace'}}>${(db?.wagered||0).toFixed(2)}</td>
                                <td style={{textAlign:'right',fontFamily:'monospace',color:(db?.pnl||0)>=0?'#28a745':'#e55353'}}>{(db?.pnl||0)>=0?'+':''}{(db?.pnl||0).toFixed(2)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </>
          )}

          {!compareA && !compareB && (
            <div style={{textAlign:'center',padding:40,color:'#94a3b8'}}>Select two players above to compare stats</div>
          )}
        </div>
      )}

      {editing && <BetEditModal bet={editing} onClose={() => setEditing(null)} onSaved={() => loadAll()} />}

      {/* ── Add Bet Modal ── */}
      {showAddBet && (
        <div className="bgp-modal-overlay" onClick={() => setShowAddBet(false)}>
          <div className="bgp-modal" onClick={(e) => e.stopPropagation()}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
              <h3 style={{margin:0}}>Add Bet</h3>
              <button onClick={() => setShowAddBet(false)} style={{background:'none',border:'none',color:'#94a3b8',fontSize:'1.4rem',cursor:'pointer'}}>✕</button>
            </div>

            <div className="bgp-modal-fields">
              <div className="bgp-modal-field">
                <label>User *</label>
                <select value={abUser} onChange={(e) => setAbUser(e.target.value)}>
                  <option value="">Select user...</option>
                  {users.map(u => <option key={u.user_id} value={u.user_id}>{u.screenname || u.user_id}</option>)}
                </select>
              </div>

              <div className="bgp-modal-field">
                <label>Market</label>
                <input type="text" placeholder="e.g. totals, first-guess..." value={abMarket} onChange={(e) => setAbMarket(e.target.value)} />
              </div>

              <div className="bgp-modal-field">
                <label>Outcome</label>
                <input type="text" placeholder="e.g. Player: Over 5000 Points" value={abOutcome} onChange={(e) => setAbOutcome(e.target.value)} />
              </div>

              <div className="bgp-modal-field">
                <label>Game ID</label>
                <input type="number" placeholder="Game #" value={abGameId} onChange={(e) => setAbGameId(e.target.value)} />
              </div>

              <div className="bgp-modal-field">
                <label>Stake *</label>
                <input type="number" step="0.01" placeholder="100" value={abStake} onChange={(e) => setAbStake(e.target.value)} />
              </div>

              <div className="bgp-modal-field">
                <label>Odds (American) *</label>
                <input type="text" placeholder="-110" value={abOdds} onChange={(e) => setAbOdds(e.target.value)} />
              </div>

              {abPayout && (
                <div className="bgp-modal-field">
                  <label>Payout (if win)</label>
                  <div className="bgp-payout-display">${abPayout}</div>
                </div>
              )}

              <div className="bgp-modal-field">
                <label>Result</label>
                <select value={abResult} onChange={(e) => setAbResult(e.target.value)}>
                  <option value="pending">Pending</option>
                  <option value="win">Win</option>
                  <option value="loss">Loss</option>
                  <option value="push">Push</option>
                </select>
              </div>
            </div>

            <div style={{display:'flex',gap:10,marginTop:18,justifyContent:'flex-end'}}>
              <button onClick={() => setShowAddBet(false)} className="bgp-modal-cancel-btn">Cancel</button>
              <button onClick={handleAddBet} disabled={abSaving} className="bgp-modal-save-btn">{abSaving ? 'Adding...' : 'Add Bet'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
