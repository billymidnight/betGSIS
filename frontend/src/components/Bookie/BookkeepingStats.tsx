import React, { useEffect, useState } from 'react';
import { fetchBookkeepingSummary } from '../../lib/api/api';
import './BookkeepingStats.css';

export default function BookkeepingStats() {
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    console.log('[BOOKIE-HUB] BookkeepingStats mounted');
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetchBookkeepingSummary();
      setSummary(r);
      console.log('[BOOKIE-HUB] bookkeeping summary', r);
    } catch (e) {
      console.error('[BOOKIE-HUB] failed to fetch bookkeeping', e);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  };

  const fmt = (n: number) => (n ?? 0).toLocaleString?.() ?? String(n ?? 0);

  if (!summary) return <div className="bk-panel">Loading bookkeeping...</div>;

  const { book_pnl, settled_count, live_count, live_risk, settled_wager_volume, live_wager_volume, profit_margin } = summary;

  return (
    <div className="bk-panel">
      <h3 className="bk-title">betGSIS Bookkeeping</h3>

      <div className="bk-section-header">Bets</div>
      <div className="bk-row"><div className="bk-label">Settled bets</div><div className="bk-value">{settled_count}</div></div>
      <div className="bk-row"><div className="bk-label">Live bets</div><div className="bk-value">{live_count}</div></div>

      <div style={{height: '0.5rem'}} />
      <div className="bk-section-header">Wager Volume</div>
      <div className="bk-row"><div className="bk-label">Settled wager volume</div><div className="bk-value">{Number(settled_wager_volume).toLocaleString(undefined, {style:'currency',currency:'USD'})}</div></div>
      <div className="bk-row"><div className="bk-label">Live wager volume</div><div className="bk-value">{Number(live_wager_volume || 0).toLocaleString(undefined, {style:'currency',currency:'USD'})}</div></div>

      <div style={{height: '0.5rem'}} />
      <div className="bk-row"><div className="bk-label">Total BOOK P&L</div>
        <div className={`bk-value ${Number(book_pnl) >= 0 ? 'positive' : 'negative'}`}>{Number(book_pnl).toLocaleString(undefined, {style:'currency',currency:'USD'})}</div>
      </div>

      <div className="bk-row"><div className="bk-label">Total live risk</div><div className="bk-value">{Number(live_risk).toLocaleString(undefined, {style:'currency',currency:'USD'})}</div></div>
      <div className="bk-row"><div className="bk-label">Profit margin</div><div className={`bk-value ${Number(profit_margin) >= 0 ? 'positive' : 'negative'}`}>{(Number(profit_margin) * 100).toFixed(2)}%</div></div>
    </div>
  );
}
