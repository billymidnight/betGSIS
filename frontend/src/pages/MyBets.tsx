import React, { useEffect, useState } from 'react';
import { fetchMyBets, fetchCurrentGame } from '../lib/api/api';
import { parseOutcome } from '../lib/utils/bets';
import { americanToDecimal, formatOdds, formatCurrency } from '../lib/format';
import './MyBets.css';

export default function MyBets() {
  const [bets, setBets] = useState<any[]>([]);
  const [gameNo, setGameNo] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [myBets, g] = await Promise.all([fetchMyBets(), fetchCurrentGame()]);
        setBets(myBets || []);
        setGameNo(g ?? null);
      } catch (e) {
        console.error('Failed to fetch bets or game:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const totalBets = bets.length;

  function formatPlacedUTC(ts: string | number | null) {
    if (!ts) return '';
    try {
      const d = new Date(ts);
      if (isNaN(d.getTime())) return '';
      const opts: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' };
      return d.toLocaleString('en-US', opts) + ' UTC';
    } catch (e) {
      return String(ts);
    }
  }

  const [filter, setFilter] = useState<'all' | 'active' | 'settled'>('all');

  const filtered = bets.filter((b) => {
    const isActive = b.result === null || b.result === undefined;
    if (filter === 'active') return isActive;
    if (filter === 'settled') return !isActive;
    return true;
  });

  return (
    <div className="my-bets-page">
        <div className="my-bets-header">
          <div>
            <h1 className="page-title">My Bets</h1>
            <div className="my-bets-sub">Total Bets: <strong>{totalBets}</strong></div>
          </div>
          <div className="my-bets-controls">
            <div className="my-bets-game">Geo Game #: <strong>{gameNo ?? '—'}</strong></div>
            <div className="filter-bar">
              <button className={`filter-btn ${filter==='all'?'active':''}`} onClick={() => setFilter('all')}>All</button>
              <button className={`filter-btn ${filter==='active'?'active':''}`} onClick={() => setFilter('active')}>Active</button>
              <button className={`filter-btn ${filter==='settled'?'active':''}`} onClick={() => setFilter('settled')}>Settled</button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="my-bets-empty">Loading bets…</div>
        ) : filtered.length === 0 ? (
          <div className="my-bets-empty">You have no bets yet.</div>
        ) : (
          <div className="my-bets-grid">
            {filtered.map((b) => {
              const parsed = parseOutcome(b.outcome || b.market || '');
              let player = parsed.playerName || parsed.countryName || '';
              let market = parsed.marketDisplay || b.market || '';
              
              // Special handling for zetamac_totals: append ' Zetamac' and use point column
              if (b.market === 'zetamac_totals') {
                // Extract player name from outcome (format: "Name Zetamac Totals Over/Under X.X")
                const zetamacMatch = (b.outcome || '').match(/^(.+?)\s+Zetamac\s+Totals\s+(Over|Under)\s+([\d.]+)$/i);
                if (zetamacMatch) {
                  player = zetamacMatch[1].trim() + ' Zetamac';
                  market = `${zetamacMatch[2]} ${b.point || zetamacMatch[3]}`;
                } else {
                  // Fallback: append Zetamac to player
                  player = player ? player + ' Zetamac' : 'Zetamac';
                }
              }
              const placed = formatPlacedUTC(b.placed_at || b.created_at || b.bet_placed_time || null);

              // odds: backend stores odds_american as string
              const oddsAmerRaw = b.odds_american || b.odds; // may be string like '+480'
              const oddsAmerInt = oddsAmerRaw ? parseInt(String(oddsAmerRaw).replace('+', '')) : null;
              const decimalOdds = oddsAmerInt ? americanToDecimal(oddsAmerInt) : (b.odds_decimal || 1);
              const payout = (Number(b.bet_size) || 0) * Number(decimalOdds || 1);

              // Normalize status to lowercase for consistent CSS class names (DB may store 'Win'/'Loss'/'Push')
              const status = b.result === null || b.result === undefined ? 'active' : String(b.result).toLowerCase();
              const isActive = status === 'active';
              const isWin = status === 'win';
              const isLoss = status === 'loss';

              return (
                <div className={`bet-card bet-card--${status}`} key={b.bet_id || `${b.user_id}_${b.placed_at}` }>
                  <div className="bet-card-top">
                    <div className="bet-card-time">{placed}</div>
                    <div className={`bet-tag bet-tag--${status}`}>{status === 'active' ? 'Active' : status.charAt(0).toUpperCase() + status.slice(1)}</div>
                  </div>

                  <div className="bet-card-body">
                    <div className="bet-left">
                      <div className="bet-player">{player}</div>
                      <div className="bet-outcome">{market}</div>
                      <div className="bet-bottom-left">
                        <div className="bet-stake-label">Stake:</div>
                        <div className="bet-stake-val">{formatCurrency(Number(b.bet_size || 0))}</div>
                        {/* Payout label: show 'Potential Payout' for active, 'Payout' for wins, hide for losses */}
                        {!isLoss && (
                          <>
                            <div className="bet-payout-label">{isWin ? 'Payout:' : 'Potential Payout:'}</div>
                            <div className="bet-payout-val">{formatCurrency(Number(payout || 0))}</div>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="bet-right">
                      <div className="bet-odds">
                        <div className="bet-odds-amer">{oddsAmerRaw ?? formatOdds(Number(decimalOdds || 1), 'american')}</div>
                        <div className="bet-odds-dec">{Number(decimalOdds || 1).toFixed(2)}</div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
    </div>
  );
}
