import React, { useEffect, useState } from 'react';
import { fetchBookkeepingAccounting } from '../../lib/api/api';
import './AccountingPanel.css';

interface Row {
  user_id: string;
  screenname: string;
  net_pnl_all: number;
  pnl_vs_betgsis: number;
  pnl_bets: number;
  pnl_lays: number;
}

const money = (v: number) =>
  Number(v || 0).toLocaleString(undefined, { style: 'currency', currency: 'USD' });

const cls = (v: number) => (Number(v || 0) >= 0 ? 'positive' : 'negative');

export default function AccountingPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetchBookkeepingAccounting();
      setRows(r.accounting || []);
    } catch (e) {
      console.error('Failed to load accounting', e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="accounting-panel">
      <div className="accounting-header">
        <h4 className="accounting-title">Accounting</h4>
        <button className="accounting-refresh" onClick={load} disabled={loading}>
          {loading ? '...' : 'Refresh'}
        </button>
      </div>

      <div className="accounting-table">
        <div className="accounting-row accounting-head">
          <div>Player</div>
          <div title="All bets + all lays — matches their navbar P&L">Net P&L</div>
          <div title="Bets placed against the house only">vs betGSIS</div>
          <div title="P&L across all bets they placed">All Bets</div>
          <div title="P&L across everything they laid">All Lays</div>
        </div>

        {rows.map((r) => (
          <div key={r.user_id} className="accounting-row">
            <div className="acct-name">{r.screenname}</div>
            <div className={`acct-val ${cls(r.net_pnl_all)}`}>{money(r.net_pnl_all)}</div>
            <div className={`acct-val ${cls(r.pnl_vs_betgsis)}`}>{money(r.pnl_vs_betgsis)}</div>
            <div className={`acct-val ${cls(r.pnl_bets)}`}>{money(r.pnl_bets)}</div>
            <div className={`acct-val ${cls(r.pnl_lays)}`}>{money(r.pnl_lays)}</div>
          </div>
        ))}

        {rows.length === 0 && !loading && <div className="accounting-empty">No accounts</div>}
      </div>
    </div>
  );
}
