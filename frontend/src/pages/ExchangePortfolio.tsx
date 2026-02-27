import React, { useEffect, useState, useMemo } from 'react';
import { fetchExchangePortfolio, deleteP2PBet, settleBet } from '../lib/api/api';
import './ExchangePortfolio.css';

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

// ── row limit options ──
const LIMIT_OPTIONS = [50, 100, 200, 500] as const;

export default function ExchangePortfolio() {
  const [allBets, setAllBets] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // filters
  const [rowLimit, setRowLimit] = useState<number>(50);
  const [bettorFilter, setBettorFilter] = useState<string>('all');
  const [layeurFilter, setLayeurFilter] = useState<string>('all');
  const [activeOnly, setActiveOnly] = useState(false);
  const [bettorSearch, setBettorSearch] = useState('');
  const [layeurSearch, setLayeurSearch] = useState('');

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const data = await fetchExchangePortfolio();
      setAllBets(data.bets || []);
      setStats(data.stats || null);
    } catch (e) {
      console.error('Failed to load exchange portfolio', e);
    } finally {
      setLoading(false);
    }
  };

  // ── derived lists of unique bettors/layeurs ──
  const bettors = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of allBets) {
      const uid = String(b.user_id || '');
      const name = b.bettor_screenname || uid;
      if (uid && !map.has(uid)) map.set(uid, name);
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allBets]);

  const layeurs = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of allBets) {
      const uid = String(b.layeur || '');
      const name = b.layeur_screenname || uid;
      if (uid && !map.has(uid)) map.set(uid, name);
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allBets]);

  // ── filtered bettors/layeurs by search ──
  const filteredBettors = useMemo(() => {
    if (!bettorSearch.trim()) return bettors;
    const q = bettorSearch.toLowerCase();
    return bettors.filter(u => u.name.toLowerCase().includes(q));
  }, [bettors, bettorSearch]);

  const filteredLayeurs = useMemo(() => {
    if (!layeurSearch.trim()) return layeurs;
    const q = layeurSearch.toLowerCase();
    return layeurs.filter(u => u.name.toLowerCase().includes(q));
  }, [layeurs, layeurSearch]);

  // ── display bets ──
  const displayBets = useMemo(() => {
    let filtered = allBets;
    if (activeOnly) {
      filtered = filtered.filter((b) => !b.result || b.result.toLowerCase() === 'pending');
    }
    if (bettorFilter !== 'all') {
      filtered = filtered.filter((b) => String(b.user_id) === bettorFilter);
    }
    if (layeurFilter !== 'all') {
      filtered = filtered.filter((b) => String(b.layeur) === layeurFilter);
    }
    return filtered.slice(0, rowLimit);
  }, [allBets, bettorFilter, layeurFilter, rowLimit, activeOnly]);

  // ── total count for display ──
  const totalFiltered = useMemo(() => {
    let filtered = allBets;
    if (activeOnly) {
      filtered = filtered.filter((b) => !b.result || b.result.toLowerCase() === 'pending');
    }
    if (bettorFilter !== 'all') {
      filtered = filtered.filter((b) => String(b.user_id) === bettorFilter);
    }
    if (layeurFilter !== 'all') {
      filtered = filtered.filter((b) => String(b.layeur) === layeurFilter);
    }
    return filtered.length;
  }, [allBets, bettorFilter, layeurFilter, activeOnly]);

  // ── delete handler ──
  const handleDelete = async (betId: number) => {
    if (!window.confirm(`Delete Exchange Bet #${betId}?\n\nThis will permanently remove it from the database.`)) return;
    try {
      await deleteP2PBet(betId);
      loadAll();
    } catch (e) {
      console.error('Failed to delete bet', e);
      alert('Failed to delete bet');
    }
  };

  // ── settle handler ──
  const [settleModal, setSettleModal] = useState<any | null>(null);
  const [settleChoice, setSettleChoice] = useState<'win'|'loss'|'push'>('win');

  const handleSettle = async () => {
    if (!settleModal) return;
    const betId = settleModal.bet_id || settleModal.id;
    try {
      await settleBet(betId, settleChoice);
      setSettleModal(null);
      loadAll();
    } catch (e: any) {
      alert('Settle failed: ' + (e?.response?.data?.error || e.message));
    }
  };

  // ── stat card helper ──
  const StatCard = ({ label, value, color }: { label: string; value: string; color?: string }) => (
    <div className="exp-stat-card">
      <div className="exp-stat-value" style={color ? { color } : {}}>{value}</div>
      <div className="exp-stat-label">{label}</div>
    </div>
  );

  return (
    <div className="exp-page">
      <h1 className="exp-title">Exchange Portfolio</h1>

      {/* ── Key Stats Row ── */}
      <div className="exp-key-stats">
        <StatCard label="Total Volume (All Time)" value={`$${(stats?.total_volume ?? 0).toFixed(2)}`} />
        <StatCard label="Volume Today" value={`$${(stats?.volume_today ?? 0).toFixed(2)}`} />
        <StatCard label="Open Offerings" value={String(stats?.open_offerings ?? 0)} />
        <StatCard label="Distinct Layeurs" value={String(stats?.distinct_layeurs ?? 0)} />
      </div>

      <div className="exp-key-stats" style={{ marginBottom: 20 }}>
        <StatCard label="Total Exchange Bets" value={String(stats?.total_bets ?? 0)} />
        <StatCard label="Total Offerings Created" value={String(stats?.total_offerings ?? 0)} />
      </div>

      {/* ── Filters Row ── */}
      <div className="exp-filters-row">
        {/* Active Only */}
        <div className="exp-filter-group">
          <button
            className={`exp-active-toggle ${activeOnly ? 'active' : ''}`}
            onClick={() => setActiveOnly(!activeOnly)}
          >{activeOnly ? 'Active Only' : 'All Bets'}</button>
        </div>

        {/* Row Limit */}
        <div className="exp-filter-group">
          <label>Show:</label>
          <select value={rowLimit} onChange={(e) => setRowLimit(Number(e.target.value))}>
            {LIMIT_OPTIONS.map(n => <option key={n} value={n}>Last {n}</option>)}
            <option value={99999}>All</option>
          </select>
        </div>

        {/* Bettor Filter */}
        <div className="exp-filter-group">
          <label>Bettor:</label>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Search bettor..."
              value={bettorSearch}
              onChange={(e) => setBettorSearch(e.target.value)}
              className="exp-player-search"
            />
            <select value={bettorFilter} onChange={(e) => { setBettorFilter(e.target.value); setBettorSearch(''); }}>
              <option value="all">All Bettors</option>
              {filteredBettors.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Layeur Filter */}
        <div className="exp-filter-group">
          <label>Layeur:</label>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Search layeur..."
              value={layeurSearch}
              onChange={(e) => setLayeurSearch(e.target.value)}
              className="exp-player-search"
            />
            <select value={layeurFilter} onChange={(e) => { setLayeurFilter(e.target.value); setLayeurSearch(''); }}>
              <option value="all">All Layeurs</option>
              {filteredLayeurs.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── Bets Table ── */}
      <div className="exp-card exp-table-card">
        <h3 style={{ margin: '0 0 12px 0' }}>
          Exchange Bets
          <span style={{ color: '#94a3b8', fontWeight: 400, fontSize: '0.9rem', marginLeft: 8 }}>
            (showing {displayBets.length} of {totalFiltered})
          </span>
        </h3>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Loading…</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="exp-bets-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Bettor</th>
                  <th>Layeur</th>
                  <th>Outcome</th>
                  <th>Odds</th>
                  <th>Stake</th>
                  <th>Result</th>
                  <th>P&L (Bettor)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {displayBets.map((r) => {
                  const stake = Number(r.bet_size || 0);
                  const pnl = calcPnl(stake, r.odds_american, r.result);
                  return (
                    <tr key={r.bet_id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{fmtTime(r.placed_at || r.created_at)}</td>
                      <td>{r.bettor_screenname || '—'}</td>
                      <td>{r.layeur_screenname || '—'}</td>
                      <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.outcome}</td>
                      <td style={{ fontFamily: 'monospace' }}>{r.odds_american}</td>
                      <td style={{ fontFamily: 'monospace' }}>${stake.toFixed(2)}</td>
                      <td>
                        {r.result ? (
                          <span className={`exp-result-badge ${r.result.toLowerCase()}`}>{r.result}</span>
                        ) : (
                          <span className="exp-result-badge pending">Pending</span>
                        )}
                      </td>
                      <td style={{ fontFamily: 'monospace', color: r.result ? (pnl >= 0 ? '#28a745' : '#e55353') : '#94a3b8' }}>
                        {r.result ? ((pnl >= 0 ? '+' : '') + pnl.toFixed(2)) : '—'}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {!r.result && (
                          <button onClick={() => { setSettleModal(r); setSettleChoice('win'); }} className="exp-action-btn" title="Settle">✎</button>
                        )}
                        <button onClick={() => handleDelete(r.bet_id)} className="exp-action-btn" title="Delete">🗑️</button>
                      </td>
                    </tr>
                  );
                })}
                {displayBets.length === 0 && (
                  <tr><td colSpan={9} style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>No exchange bets found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Settle Modal ── */}
      {settleModal && (
        <div className="exp-modal-overlay" onClick={() => setSettleModal(null)}>
          <div className="exp-modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>Settle Exchange Bet</h3>
              <button onClick={() => setSettleModal(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.4rem', cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ marginBottom: 10 }}>
              <strong>Bettor:</strong> {settleModal.bettor_screenname}<br />
              <strong>Layeur:</strong> {settleModal.layeur_screenname}<br />
              <strong>Outcome:</strong> {settleModal.outcome}<br />
              <strong>Stake:</strong> ${Number(settleModal.bet_size || 0).toFixed(2)}<br />
              <strong>Odds:</strong> {settleModal.odds_american}
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ color: '#94a3b8', fontSize: '0.82rem', fontWeight: 600, textTransform: 'uppercase' }}>Result:</label>
              <select
                value={settleChoice}
                onChange={(e) => setSettleChoice(e.target.value as any)}
                style={{ marginLeft: 8, background: '#071025', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 6, padding: '6px 10px', fontSize: '0.9rem', outline: 'none' }}
              >
                <option value="win">Win</option>
                <option value="loss">Loss</option>
                <option value="push">Push</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setSettleModal(null)} style={{ padding: '9px 18px', borderRadius: 6, background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', cursor: 'pointer', fontSize: '0.9rem' }}>Cancel</button>
              <button onClick={handleSettle} style={{ padding: '9px 22px', borderRadius: 6, background: '#1e40af', border: 'none', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem' }}>Settle</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
