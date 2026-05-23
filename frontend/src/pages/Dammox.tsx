import React, { useEffect, useState } from 'react';
import { fetchDammoxStats, fetchDammoxMemes, DammoxStats, DammoxBet } from '../lib/api/api';
import './Dammox.css';

const getBackendBaseUrl = () => {
  const apiUrl = (import.meta as any).env?.VITE_API_URL;
  if (apiUrl) return apiUrl.replace(/\/api$/, '');
  return 'http://localhost:4000';
};
const API_BASE = getBackendBaseUrl();

const DEGEN_LEVELS = [
  { label: 'Ultra Low', color: '#6bd47b' },
  { label: 'Low', color: '#b6e36a' },
  { label: 'Medium', color: '#f5d76e' },
  { label: 'High', color: '#f29c4d' },
  { label: 'Ultra High', color: '#e84545' },
  { label: 'Tony G', color: '#b026ff' },
];

const FUN_FACTS = [
  { label: 'Favorite Horse', value: 'Queen of Spades' },
  { label: 'Sexual Addiction', value: 'Vito Spatafore' },
  { label: 'Favorite Trading Market', value: 'At least 1 404' },
  { label: 'Favorite Game to Watch', value: 'Chess 15 | 10' },
  { label: 'Favorite Card in betGSIS', value: 'Vito Spatafore' },
];

function formatUsd(n: number): string {
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  return `${sign}$${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPnl(n: number): string {
  if (n > 0) return `+${formatUsd(n)}`;
  return formatUsd(n);
}

function pnlClass(n: number): string {
  if (n > 0) return 'dx-pnl-pos';
  if (n < 0) return 'dx-pnl-neg';
  return 'dx-pnl-zero';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function ordinalSuffix(d: number): string {
  if (d >= 11 && d <= 13) return 'th';
  const last = d % 10;
  if (last === 1) return 'st';
  if (last === 2) return 'nd';
  if (last === 3) return 'rd';
  return 'th';
}

function formatPrettyDate(ymd: string | null | undefined): string {
  if (!ymd) return '—';
  const [y, m, d] = ymd.split('-').map((p) => parseInt(p, 10));
  if (!y || !m || !d) return ymd;
  return `${MONTHS[m - 1]} ${d}${ordinalSuffix(d)}, ${y}`;
}

function formatPrettyDateFromTs(ts: string | null | undefined): string {
  if (!ts) return '—';
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts;
    const month = MONTHS[d.getUTCMonth()];
    const day = d.getUTCDate();
    return `${month} ${day}${ordinalSuffix(day)}, ${d.getUTCFullYear()}`;
  } catch {
    return ts || '—';
  }
}

function BetRow({ bet }: { bet: DammoxBet }) {
  return (
    <tr>
      <td>{formatPrettyDateFromTs(bet.placed_at)}</td>
      <td className="dx-cell-market">{bet.market}</td>
      <td className="dx-cell-outcome">{bet.outcome}</td>
      <td className="dx-cell-num">{formatUsd(bet.bet_size)}</td>
      <td className="dx-cell-num">{bet.odds_american}</td>
      <td className={`dx-cell-num ${pnlClass(bet.pnl)}`}>{formatPnl(bet.pnl)}</td>
      <td>
        <span className={`dx-result-pill dx-result-${(bet.result || '').toLowerCase()}`}>
          {bet.result || '—'}
        </span>
      </td>
    </tr>
  );
}

export default function Dammox() {
  const [stats, setStats] = useState<DammoxStats | null>(null);
  const [memes, setMemes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchDammoxStats(), fetchDammoxMemes()])
      .then(([s, m]) => {
        if (cancelled) return;
        setStats(s);
        setMemes(m);
      })
      .catch((e) => {
        if (cancelled) return;
        setErr(e?.message || 'Failed to load Dammox stats');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const heroImg = `${API_BASE}/yayabday/yayabday1.png`;

  // Filter out the hero image and any "meme1/meme2" used inline so we don't duplicate.
  const heroNames = new Set(['yayabday.jpg', 'yayabday1.png', 'yayabday1.jpg']);
  const extraMemes = memes.filter((f) => !heroNames.has(f.toLowerCase()));

  return (
    <div className="dx-page">
      <div className="dx-confetti" aria-hidden>
        {Array.from({ length: 30 }).map((_, i) => (
          <span key={i} className={`dx-confetti-piece dx-cp-${(i % 6) + 1}`} style={{ left: `${(i * 97) % 100}%`, animationDelay: `${(i % 10) * 0.3}s` }} />
        ))}
      </div>

      <header className="dx-hero">
        <div className="dx-hero-banner">
          <div className="dx-balloon dx-balloon-1">🎈</div>
          <div className="dx-balloon dx-balloon-2">🎈</div>
          <div className="dx-balloon dx-balloon-3">🎈</div>
          <div className="dx-cake">🎂</div>
        </div>

        <div className="dx-hero-eyebrow">🎉 Happy Birthday 🎉</div>
        <h1 className="dx-hero-title">
          <span className="dx-hero-title-glow">DAMMOX</span>
        </h1>

        <div className="dx-slogan dx-slogan-1">
          <span className="dx-quote-open">"</span>
          Meet USDT man. Will I use bitcoin to transfer money. NO amigo. I'll buy USDT and send entire thing on
          ethereum network
          <span className="dx-quote-close">"</span>
        </div>

        <div className="dx-slogan dx-slogan-2">
          <span className="dx-quote-open">"</span>
          Give me freedom. Give me fire. Give me bomb pots or I retire
          <span className="dx-quote-close">"</span>
        </div>

        <div className="dx-hero-photo-wrap">
          <img className="dx-hero-photo" src={heroImg} alt="Dammox" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        </div>
      </header>

      {loading && <div className="dx-loading">Loading the legend…</div>}
      {err && <div className="dx-error">{err}</div>}

      {stats && (
        <>
          {/* Top KPIs */}
          <section className="dx-kpi-grid">
            <div className="dx-kpi-card">
              <div className="dx-kpi-label">Total Bets</div>
              <div className="dx-kpi-value">{stats.total_bets.toLocaleString('en-US')}</div>
            </div>
            <div className="dx-kpi-card">
              <div className="dx-kpi-label">Total Volume Wagered</div>
              <div className="dx-kpi-value">{formatUsd(stats.total_volume)}</div>
            </div>
            <div className="dx-kpi-card dx-kpi-degen">
              <div className="dx-kpi-label">Degen Level</div>
              <div className="dx-kpi-value dx-degen-ultra-high">ULTRA HIGH</div>
              <div className="dx-degen-legend">
                {DEGEN_LEVELS.map((d) => (
                  <span key={d.label} className="dx-degen-chip" style={{ background: d.color, color: d.label === 'Tony G' ? '#fff' : '#0a0a0a' }}>
                    {d.label}
                  </span>
                ))}
              </div>
            </div>
          </section>

          {/* Most / least wagered market */}
          <section className="dx-kpi-grid dx-kpi-grid-2">
            <div className="dx-kpi-card dx-kpi-soft">
              <div className="dx-kpi-label">Most Wagered Market</div>
              {stats.most_wagered_market ? (
                <>
                  <div className="dx-kpi-value-sm">{stats.most_wagered_market.market}</div>
                  <div className="dx-kpi-sub">{formatUsd(stats.most_wagered_market.volume)} · {stats.most_wagered_market.bets} bets</div>
                </>
              ) : <div className="dx-kpi-value">—</div>}
            </div>
            <div className="dx-kpi-card dx-kpi-soft">
              <div className="dx-kpi-label">Least Wagered Market</div>
              {stats.least_wagered_market ? (
                <>
                  <div className="dx-kpi-value-sm">{stats.least_wagered_market.market}</div>
                  <div className="dx-kpi-sub">{formatUsd(stats.least_wagered_market.volume)} · {stats.least_wagered_market.bets} bets</div>
                </>
              ) : <div className="dx-kpi-value">—</div>}
            </div>
          </section>

          {/* Top winning / losing days */}
          <section className="dx-twin">
            <div className="dx-panel">
              <h2 className="dx-panel-title">🏆 Top 3 Winningest Days <span className="dx-panel-sub">(EST)</span></h2>
              {stats.top_winning_days.length === 0 ? (
                <div className="dx-empty">No data yet.</div>
              ) : (
                <table className="dx-table dx-day-table">
                  <thead><tr><th>#</th><th>Date</th><th className="dx-th-num">P&L</th></tr></thead>
                  <tbody>
                    {stats.top_winning_days.map((d, i) => (
                      <tr key={d.date}>
                        <td className="dx-rank">{i + 1}</td>
                        <td>{formatPrettyDate(d.date)}</td>
                        <td className={`dx-cell-num ${pnlClass(d.pnl)}`}>{formatPnl(d.pnl)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="dx-panel">
              <h2 className="dx-panel-title">💀 Top 3 Losingest Days <span className="dx-panel-sub">(EST)</span></h2>
              {stats.top_losing_days.length === 0 ? (
                <div className="dx-empty">No data yet.</div>
              ) : (
                <table className="dx-table dx-day-table">
                  <thead><tr><th>#</th><th>Date</th><th className="dx-th-num">P&L</th></tr></thead>
                  <tbody>
                    {stats.top_losing_days.map((d, i) => (
                      <tr key={d.date}>
                        <td className="dx-rank">{i + 1}</td>
                        <td>{formatPrettyDate(d.date)}</td>
                        <td className={`dx-cell-num ${pnlClass(d.pnl)}`}>{formatPnl(d.pnl)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          {/* Top winning / losing single bets */}
          <section className="dx-panel">
            <h2 className="dx-panel-title">💎 Top 3 Winning Single Bets</h2>
            {stats.top_winning_bets.length === 0 ? (
              <div className="dx-empty">No settled bets yet.</div>
            ) : (
              <div className="dx-table-wrap">
                <table className="dx-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Market</th>
                      <th>Outcome</th>
                      <th className="dx-th-num">Stake</th>
                      <th className="dx-th-num">Odds</th>
                      <th className="dx-th-num">P&L</th>
                      <th>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.top_winning_bets.map((b) => <BetRow key={b.bet_id} bet={b} />)}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="dx-panel">
            <h2 className="dx-panel-title">🩸 Top 3 Losing Single Bets</h2>
            {stats.top_losing_bets.length === 0 ? (
              <div className="dx-empty">No settled bets yet.</div>
            ) : (
              <div className="dx-table-wrap">
                <table className="dx-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Market</th>
                      <th>Outcome</th>
                      <th className="dx-th-num">Stake</th>
                      <th className="dx-th-num">Odds</th>
                      <th className="dx-th-num">P&L</th>
                      <th>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.top_losing_bets.map((b) => <BetRow key={b.bet_id} bet={b} />)}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Fun facts */}
          <section className="dx-panel dx-fun-panel">
            <h2 className="dx-panel-title">✨ Fun Facts</h2>
            <div className="dx-fun-grid">
              {FUN_FACTS.map((f) => (
                <div key={f.label} className="dx-fun-card">
                  <div className="dx-fun-label">{f.label}</div>
                  <div className="dx-fun-value">{f.value}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Markets breakdown */}
          <section className="dx-panel">
            <h2 className="dx-panel-title">📊 Markets Breakdown <span className="dx-panel-sub">(sorted by P&L)</span></h2>
            {stats.markets_breakdown.length === 0 ? (
              <div className="dx-empty">No data yet.</div>
            ) : (
              <div className="dx-table-wrap">
                <table className="dx-table">
                  <thead>
                    <tr>
                      <th>Market</th>
                      <th className="dx-th-num">Days Bet</th>
                      <th className="dx-th-num">Bets</th>
                      <th className="dx-th-num">Volume</th>
                      <th className="dx-th-num">P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.markets_breakdown.map((m) => (
                      <tr key={m.market}>
                        <td className="dx-cell-market">{m.market}</td>
                        <td className="dx-cell-num">{m.days_bet}</td>
                        <td className="dx-cell-num">{m.bets}</td>
                        <td className="dx-cell-num">{formatUsd(m.volume)}</td>
                        <td className={`dx-cell-num ${pnlClass(m.pnl)}`}>{formatPnl(m.pnl)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {/* All meme/celebration images from the yayabday folder */}
      {extraMemes.length > 0 && (
        <section className="dx-panel">
          <h2 className="dx-panel-title">🎁 The Dammox Gallery</h2>
          <div className="dx-meme-grid">
            {extraMemes.map((file) => (
              <div className="dx-meme-card" key={file}>
                <img src={`${API_BASE}/yayabday/${file}`} alt={file} />
              </div>
            ))}
          </div>
        </section>
      )}

      <footer className="dx-footer">
        <div>🎂 Happy Birthday Dammox · From the entire betGSIS family 🎂</div>
      </footer>
    </div>
  );
}
