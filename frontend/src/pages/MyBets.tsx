import React, { useEffect, useState } from 'react';
import { fetchMyBets } from '../lib/api/api';
import { parseOutcome } from '../lib/utils/bets';
import { americanToDecimal, formatOdds, formatCurrency } from '../lib/format';
import './MyBets.css';

export default function MyBets() {
  const [bets, setBets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<'bettor' | 'layeur'>('bettor');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const myBets = await fetchMyBets(role);
        setBets(myBets || []);
      } catch (e) {
        console.error('Failed to fetch bets or game:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [role]);

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
            <div className="role-toggle">
              <button className={`role-btn ${role === 'bettor' ? 'active' : ''}`} onClick={() => setRole('bettor')}>As Bettor</button>
              <button className={`role-btn ${role === 'layeur' ? 'active' : ''}`} onClick={() => setRole('layeur')}>As Layeur</button>
            </div>
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
              // Special handling for Monopoly market
              let player = '';
              let market = '';
              
              if (b.market === 'Monopoly') {
                // Outcome format: "PlayerName - MarketName"
                const monopolyMatch = (b.outcome || '').match(/^(.+?)\s*-\s*(.+)$/);
                if (monopolyMatch) {
                  player = monopolyMatch[1].trim();
                  market = monopolyMatch[2].trim();
                } else {
                  player = b.outcome || '';
                  market = 'Monopoly';
                }
              } else {
                const parsed = parseOutcome(b.outcome || b.market || '');
                player = parsed.playerName || parsed.countryName || '';
                market = parsed.marketDisplay || b.market || '';
                
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
              }
              
              const placed = formatPlacedUTC(b.placed_at || b.created_at || b.bet_placed_time || null);

              // odds: backend stores odds_american as string
              const oddsAmerRaw = b.odds_american || b.odds; // may be string like '+480'
              const oddsAmerInt = oddsAmerRaw ? parseInt(String(oddsAmerRaw).replace('+', '')) : null;
              const decimalOdds = oddsAmerInt ? americanToDecimal(oddsAmerInt) : (b.odds_decimal || 1);
              const payout = (Number(b.bet_size) || 0) * Number(decimalOdds || 1);

              // Normalize status to lowercase for consistent CSS class names (DB may store 'Win'/'Loss'/'Push')
              const rawStatus = b.result === null || b.result === undefined ? 'active' : String(b.result).toLowerCase();
              // For layeur perspective: flip win/loss (bettor's win = layeur's loss)
              const status = role === 'layeur'
                ? (rawStatus === 'win' ? 'loss' : rawStatus === 'loss' ? 'win' : rawStatus)
                : rawStatus;
              const isActive = status === 'active';
              const isWin = status === 'win';
              const isLoss = status === 'loss';

              // Layeur P&L: +stake if bettor lost, -(profit) if bettor won
              let layeurPnl: number | null = null;
              if (role === 'layeur' && rawStatus !== 'active') {
                if (rawStatus === 'loss') {
                  // Bettor lost → layeur keeps the stake
                  layeurPnl = Number(b.bet_size || 0);
                } else if (rawStatus === 'win') {
                  // Bettor won → layeur pays the profit payout
                  layeurPnl = -(Number(b.bet_size || 0) * (Number(decimalOdds) - 1));
                }
              }

              return (
                <div className={`bet-card bet-card--${status}`} key={b.bet_id || `${b.user_id}_${b.placed_at}` }>
                  <div className="bet-card-top">
                    <div className="bet-card-time">{placed}</div>
                    <div className="bet-card-tags">
                      <div className={`bet-tag bet-tag--${status}`}>{status === 'active' ? 'Active' : status.charAt(0).toUpperCase() + status.slice(1)}</div>
                      {b.layeur && b.layeur !== 'betgsis' && (
                        <div className="layeur-tag-p2p layeur-tag-lg">
                          {role === 'layeur' ? `bettor: ${b.bettor_screenname || b.user_id}` : `vs ${b.layeur_screenname || b.layeur}`}
                        </div>
                      )}
                      {b.layeur === 'betgsis' && (
                        <div className="layeur-tag-house layeur-tag-lg"><img src="/assets/logo/—Pngtree—unicorn horse glitter copper_4221660.png" alt="" className="betgsis-mini-logo" />betGSIS</div>
                      )}
                    </div>
                  </div>

                  <div className="bet-card-body">
                    <div className="bet-left">
                      <div className="bet-player">{player}</div>
                      <div className="bet-outcome">{market}</div>
                      <div className="bet-bottom-left">
                        <div className="bet-stake-label">Stake:</div>
                        <div className="bet-stake-val">{formatCurrency(Number(b.bet_size || 0))}</div>
                        {role === 'layeur' && layeurPnl !== null ? (
                          <>
                            <div className="bet-payout-label">P&L:</div>
                            <div className={`bet-pnl-val ${layeurPnl >= 0 ? 'pnl-positive' : 'pnl-negative'}`}>
                              {layeurPnl >= 0 ? '+' : ''}{formatCurrency(layeurPnl)}
                            </div>
                          </>
                        ) : (
                          !isLoss && (
                            <>
                              <div className="bet-payout-label">{isWin ? 'Payout:' : 'Potential Payout:'}</div>
                              <div className="bet-payout-val">{formatCurrency(Number(payout || 0))}</div>
                            </>
                          )
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
