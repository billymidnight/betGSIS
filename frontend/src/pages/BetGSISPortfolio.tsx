import React, { useEffect, useState, useMemo } from 'react';
import { fetchBookkeepingSummary, fetchAllBets } from '../lib/api/api';
import BetEditModal from '../components/Bookie/BetEditModal';
import './BetGSISPortfolio.css';

export default function BetGSISPortfolio() {
  const [summary, setSummary] = useState<any>(null);
  const [bets, setBets] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const s = await fetchBookkeepingSummary();
      setSummary(s);
      const b = await fetchAllBets();
      setBets(b.bets || []);
    } catch (e) {
      console.error('Failed to load portfolio', e);
    } finally {
      setLoading(false);
    }
  };

  // Derived values
  const total_wagers_accepted = bets.length;
  const total_wagers_active = bets.filter((x) => !x.result).length;
  const net_book_profit = summary ? Number(summary.book_pnl) : 0;
  const active_risk = summary ? Number(summary.live_risk) : 0;

  // Timeseries for BOOK P&L: compute cumulative pnl over time from bets (settled bets only)
  const parsedTimes = useMemo(() => {
    const settled = bets.filter((b) => (b.result !== null && b.result !== undefined));
    const mapped = settled.map((b) => {
      // Prefer ISO UTC timestamp provided by backend
      let dt: Date | null = null;
      const tstr = b.placed_at_utc || b.placed_at || b.placed_at_edt || null;
      try {
        if (tstr) {
          const cand = new Date(tstr as string);
          if (!isNaN(cand.getTime())) dt = cand;
        }
      } catch (e) {
        dt = null;
      }
      // BOOK perspective: flip bettor P&L sign
      const bettorPnl = Number(b.pnl_calc || 0);
      const bookPnl = -1 * bettorPnl;
      return { ts: dt ? dt.getTime() : null, pnl: bookPnl };
    }).filter((x) => x.ts !== null) as Array<{ts:number,pnl:number}>;
    mapped.sort((a,b) => a.ts - b.ts);
    // build cumulative
    const out: Array<{ts:number,cum:number}> = [];
    let cum = 0;
    for (const m of mapped) { cum += m.pnl; out.push({ts: m.ts, cum}); }
    return out;
  }, [bets]);

  const [range, setRange] = useState<'1d'|'7d'|'30d'|'all'>('7d');

  const timesForRange = useMemo(() => {
    if (!parsedTimes || parsedTimes.length === 0) return [];
    const now = Date.now();
    let since = 0;
    if (range === '1d') since = now - 24*60*60*1000;
    else if (range === '7d') since = now - 7*24*60*60*1000;
    else if (range === '30d') since = now - 30*24*60*60*1000;
    else since = 0;
    return parsedTimes.filter(p => p.ts >= since || range === 'all');
  }, [parsedTimes, range]);

  // compute chart bounds
  const chartData = useMemo(() => {
    const data = timesForRange.length ? timesForRange : parsedTimes.slice(-40);
    if (!data || data.length === 0) return {points:[], min:0, max:0};
    const vals = data.map(d => d.cum);
    return { points: data, min: Math.min(...vals), max: Math.max(...vals) };
  }, [timesForRange, parsedTimes]);

  return (
    <div style={{ padding: 24 }}>
      <h1>betGSIS-Portfolio (Bookmaker)</h1>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginTop:12}}>
        <div style={{background:'#071025',color:'#fff',padding:12,borderRadius:8}}>
          <h3 style={{fontSize: '1.25rem', marginBottom: 8}}>All P&L related stats</h3>
          <div style={{marginBottom:6}}><strong style={{fontSize:'1rem'}}>Net Book Profit:</strong> <span style={{color: net_book_profit>=0? '#28a745':'#e55353', fontSize: '1.15rem', fontWeight:700}}>{net_book_profit.toLocaleString(undefined,{style:'currency',currency:'USD'})}</span></div>
          <div style={{marginBottom:6}}><strong style={{fontSize:'1rem'}}>Active Risk:</strong> <span style={{fontSize:'1.05rem'}}>{Number(active_risk).toLocaleString(undefined,{style:'currency',currency:'USD'})}</span></div>
          <div style={{marginBottom:6}}><strong style={{fontSize:'1rem'}}>Total wagers accepted:</strong> <span style={{fontSize:'1.05rem'}}>{total_wagers_accepted}</span></div>
          <div style={{marginBottom:6}}><strong style={{fontSize:'1rem'}}>Total wagers active:</strong> <span style={{fontSize:'1.05rem'}}>{total_wagers_active}</span></div>
        </div>

        <div style={{background:'#071025',color:'#fff',padding:12,borderRadius:8}}>
          <h3>Active Best Case PnL</h3>
          <div>Calculated per active bets; showing current active exposure: {Number(active_risk).toLocaleString(undefined,{style:'currency',currency:'USD'})}</div>
        </div>
      </div>

      <div style={{height:16}} />

      <div style={{background:'#071025',color:'#fff',padding:16,borderRadius:8}}>
        <h3 style={{margin:0,fontSize:'1.05rem'}}>Book P&L Over Time</h3>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:8,marginBottom:8}}>
          <div style={{color:'#94a3b8'}}>Range:</div>
          <div style={{display:'flex',gap:8}}>
            {(['1d','7d','30d','all'] as const).map(r => (
              <button key={r} onClick={() => setRange(r)} style={{padding:'6px 10px',borderRadius:6,background: r===range? '#1f2937':'#071025',border:'1px solid #334155',color:'#fff',cursor:'pointer'}}>{r.toUpperCase()}</button>
            ))}
          </div>
        </div>

        <div style={{height:220,display:'flex',alignItems:'center',justifyContent:'center'}}>
          {chartData.points && chartData.points.length > 0 ? (
            <svg width="100%" height={200} viewBox={`0 0 600 200`} preserveAspectRatio="none">
              {(() => {
                const w = 600; const h = 200; const pts = chartData.points;
                // layout margins for axis labels
                const marginLeft = 72;
                const marginRight = 16;
                const marginTop = 12;
                const marginBottom = 32;
                const innerW = w - marginLeft - marginRight;
                const innerH = h - marginTop - marginBottom;
                const min = chartData.min; const max = chartData.max; const rangev = (max - min) || 1;

                // map points to inner coordinates
                const xs = pts.map((p,i) => {
                  // use timestamp ordering; evenly position by index if single point
                  if (pts.length === 1) return marginLeft + innerW / 2;
                  return marginLeft + (i / (pts.length - 1)) * innerW;
                });
                const ys = pts.map(p => marginTop + (innerH - ((p.cum - min) / rangev) * innerH));

                const path = pts.map((p,i) => `${i===0?'M':'L'} ${xs[i].toFixed(2)} ${ys[i].toFixed(2)}`).join(' ');
                const fillPath = `${path} L ${marginLeft + innerW} ${marginTop + innerH} L ${marginLeft} ${marginTop + innerH} Z`;

                // y-axis ticks
                const yTicks = 5;
                const yTickVals = [] as number[];
                for (let i=0;i<yTicks;i++) {
                  const v = min + (i/(yTicks-1))*(max - min);
                  yTickVals.push(v);
                }

                // x-axis ticks: use up to 5 ticks based on timestamps
                const xTicks = Math.min(5, pts.length);
                const firstTs = pts[0].ts;
                const lastTs = pts[pts.length-1].ts;
                const xTickTs: number[] = [];
                for (let i=0;i<xTicks;i++) {
                  const t = firstTs + (i/(xTicks-1))*(lastTs - firstTs || 0);
                  xTickTs.push(t);
                }

                // time formatter
                const fmtShort = (ms:number) => {
                  const d = new Date(ms);
                  // if range is 1d show hour:minute, else show month/day
                  // simple heuristic: if span < 48 hours -> show time
                  const span = lastTs - firstTs;
                  if (span <= 48*60*60*1000) {
                    return d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
                  }
                  return d.toLocaleDateString([], {month:'short',day:'numeric'});
                };

                const lastCum = chartData.points[chartData.points.length-1].cum || 0;
                const firstCum = chartData.points[0]?.cum || 0;

                return (
                  <g>
                    {/* background grid lines + y labels */}
                    {yTickVals.map((v, i) => {
                      const y = marginTop + (innerH - ((v - min) / rangev) * innerH);
                      return (
                        <g key={`y-${i}`}>
                          <line x1={marginLeft} y1={y} x2={marginLeft + innerW} y2={y} stroke="#1f2937" strokeWidth={1} />
                          <text x={8} y={y+4} fill="#94a3b8" fontSize={11}>{Number(v).toLocaleString(undefined,{style:'currency',currency:'USD'})}</text>
                        </g>
                      );
                    })}

                    {/* x axis ticks and labels */}
                    <line x1={marginLeft} y1={marginTop + innerH} x2={marginLeft + innerW} y2={marginTop + innerH} stroke="#24303f" strokeWidth={1} />
                    {xTickTs.map((t, i) => {
                      const frac = (t - firstTs) / (lastTs - firstTs || 1);
                      const x = marginLeft + frac * innerW;
                      return (
                        <g key={`x-${i}`}>
                          <line x1={x} y1={marginTop + innerH} x2={x} y2={marginTop + innerH + 6} stroke="#334155" strokeWidth={1} />
                          <text x={x} y={marginTop + innerH + 20} fill="#94a3b8" fontSize={11} textAnchor="middle">{fmtShort(t)}</text>
                        </g>
                      );
                    })}

                    {/* filled area and line */}
                    <path d={fillPath} fill={ lastCum >= firstCum ? 'rgba(40,167,69,0.08)' : 'rgba(229,83,83,0.06)'} stroke="none" />
                    <path d={path} fill="none" stroke={ lastCum >= firstCum ? '#28a745' : '#e55353' } strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  </g>
                );
              })()}
            </svg>
          ) : (
            <div style={{color:'#94a3b8'}}>No settled bets to render P&L chart</div>
          )}
        </div>
      </div>

      <div style={{height:16}} />

        <div style={{background:'#071025',color:'#fff',padding:16,borderRadius:8,overflow:'auto'}}>
        <h3>All Bets</h3>
        <table style={{width:'100%',borderCollapse:'collapse', fontSize: '1rem'}}>
          <thead>
            <tr style={{textAlign:'left',borderBottom:'1px solid #24303f'}}>
              <th>BetID</th>
              <th>Bettor</th>
              <th>Time Placed (EDT)</th>
              <th>Game No</th>
              <th>Outcome</th>
              <th>Bet Amount</th>
              <th>Odds</th>
              <th>Result</th>
              <th>P&L</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {bets.map((r) => (
              <tr key={r.bet_id} style={{borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                <td>{r.bet_id}</td>
                <td>{r.screenname || r.user_id || '—'}</td>
                <td>{r.placed_at_edt || r.placed_at_utc}</td>
                <td>{r.game_id}</td>
                <td>{r.outcome}</td>
                <td>{Number(r.bet_size).toLocaleString(undefined,{style:'currency',currency:'USD'})}</td>
                <td>{r.odds_american}</td>
                <td>{r.result || '—'}</td>
                <td style={{color: (r.pnl_calc||0) >=0 ? '#28a745' : '#e55353'}}>{Number(r.pnl_calc||0).toLocaleString(undefined,{style:'currency',currency:'USD'})}</td>
                <td><button onClick={() => setEditing(r)} style={{background:'none',border:'none',cursor:'pointer'}}>✏️</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && <BetEditModal bet={editing} onClose={() => setEditing(null)} onSaved={() => loadAll()} />}
    </div>
  );
}
