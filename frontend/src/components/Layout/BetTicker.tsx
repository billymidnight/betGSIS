import React, { useEffect, useState } from 'react';
import { fetchRecentBets, RecentBet } from '../../lib/api/api';
import './BetTicker.css';

export default function BetTicker() {
  const [bets, setBets] = useState<RecentBet[]>([]);

  useEffect(() => {
    let alive = true;
    const load = () => {
      fetchRecentBets(15).then((b) => { if (alive) setBets(b); }).catch(() => {});
    };
    load();
    const iv = setInterval(load, 30000); // refresh every 30s
    return () => { alive = false; clearInterval(iv); };
  }, []);

  if (bets.length === 0) return null; // don't render empty strip

  // Duplicate the list so the scroll loops seamlessly
  const items = [...bets, ...bets];

  return (
    <div className="bet-ticker">
      <div className="bet-ticker-track">
        {items.map((b, i) => {
          const pnlClass = b.pnl > 0 ? 'win' : b.pnl < 0 ? 'loss' : 'push';
          const arrow = b.pnl > 0 ? '▲' : b.pnl < 0 ? '▼' : '–';
          const pnlStr = b.pnl > 0 ? `+$${b.pnl.toFixed(2)}` : b.pnl < 0 ? `-$${Math.abs(b.pnl).toFixed(2)}` : '$0';
          const initial = (b.screenname || '?')[0].toUpperCase();

          return (
            <div className="ticker-chip" key={`${b.bet_id}-${i}`}>
              {b.avatar_url ? (
                <img className="ticker-avatar" src={b.avatar_url} alt="" />
              ) : (
                <span className="ticker-avatar-placeholder">{initial}</span>
              )}
              <span className="ticker-name">{b.screenname}</span>
              <span className="ticker-detail">{b.outcome || b.market}</span>
              <span className={`ticker-pnl ${pnlClass}`}>
                <span className="ticker-arrow">{arrow}</span>
                {pnlStr}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
