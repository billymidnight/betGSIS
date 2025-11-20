import React, { useEffect, useState } from 'react';
import { fetchBookkeepingAccounts } from '../../lib/api/api';
import './AccountsOverview.css';

export default function AccountsOverview() {
  const [accounts, setAccounts] = useState<Array<any>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetchBookkeepingAccounts();
      setAccounts(r.accounts || []);
    } catch (e) {
      console.error('Failed to load accounts', e);
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="accounts-panel">
      <h4 className="accounts-title">Accounts Overview</h4>
      <div className="accounts-table">
        <div className="accounts-row accounts-head">
          <div>Screenname</div>
          <div>P&L</div>
          <div>Unsettled</div>
        </div>
        {accounts.map((a) => (
          <div key={String(a.user_id)} className="accounts-row">
            <div className="acc-name">{a.screenname || String(a.user_id)}</div>
            <div className={`acc-pnl ${a.net_pnl >= 0 ? 'positive' : 'negative'}`}>{Number(a.net_pnl || 0).toLocaleString(undefined, {style:'currency',currency:'USD'})}</div>
            <div className="acc-unsettled">{a.live_unsettled_count}</div>
          </div>
        ))}
        {accounts.length === 0 && !loading && <div className="accounts-empty">No accounts</div>}
      </div>
    </div>
  );
}
