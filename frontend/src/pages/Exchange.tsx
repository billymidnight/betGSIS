import React, { useEffect, useState, useMemo } from 'react';
import {
  fetchOfferings,
  createOffering,
  editOffering,
  cancelOffering,
  lockOffering,
  unlockOffering,
  deleteOffering,
  takeOffering,
} from '../lib/api/api';
import { useAuthStore } from '../lib/state/authStore';
import './Exchange.css';

// ═══════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════

function americanToDecimal(odds: string | number): number {
  const a = Number(String(odds).replace('+', ''));
  if (isNaN(a) || a === 0) return 2;
  return a > 0 ? a / 100 + 1 : 100 / Math.abs(a) + 1;
}

function americanToImplied(odds: string | number): number {
  const d = americanToDecimal(odds);
  return d > 0 ? 1 / d : 0;
}

function fmtMoney(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtOdds(odds: string): string {
  const a = Number(String(odds).replace('+', ''));
  if (isNaN(a)) return odds;
  return a > 0 ? `+${a}` : `${a}`;
}

function computeExposure(odds: string | number, maxBet: number): number {
  const d = americanToDecimal(odds);
  return maxBet * (d - 1); // layeur exposure = profit bettor would make
}

type OddsFormat = 'american' | 'decimal' | 'probability';

function convertToAmerican(value: string, format: OddsFormat): string {
  const v = parseFloat(value);
  if (isNaN(v)) return '';
  if (format === 'american') {
    return v > 0 ? `+${Math.round(v)}` : `${Math.round(v)}`;
  } else if (format === 'decimal') {
    if (v <= 1) return '';
    if (v >= 2) return `+${Math.round((v - 1) * 100)}`;
    return `${Math.round(-100 / (v - 1))}`;
  } else {
    // probability
    if (v <= 0 || v >= 1) return '';
    const dec = 1 / v;
    if (dec >= 2) return `+${Math.round((dec - 1) * 100)}`;
    return `${Math.round(-100 / (dec - 1))}`;
  }
}

// ═══════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════

export default function Exchange() {
  const user = useAuthStore((s) => s.user);
  const userId = user?.user_id || '';

  const [offerings, setOfferings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'all' | 'mine'>('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'name' | 'odds_desc' | 'odds_asc'>('newest');
  const [layeurFilter, setLayeurFilter] = useState('');

  // Modal states
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState<any | null>(null);
  const [showTake, setShowTake] = useState<any | null>(null);

  async function load() {
    setLoading(true);
    try {
      const rows = await fetchOfferings();
      setOfferings(rows || []);
    } catch (e) {
      console.error('fetchOfferings failed', e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  // ─── Filtering & Sorting ───
  const layeurs = useMemo(() => {
    const names = new Set<string>();
    offerings.forEach((o) => { if (o.layeur_screenname) names.add(o.layeur_screenname); });
    return Array.from(names).sort();
  }, [offerings]);

  const filtered = useMemo(() => {
    let list = offerings;
    if (tab === 'mine') {
      list = list.filter((o) => o.layeur_id === userId);
    } else {
      // In "All" view, show open/locked offerings (+ user's own in any status)
      list = list.filter((o) => o.status === 'open' || o.status === 'locked' || o.layeur_id === userId);
    }
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter((o) =>
        (o.bet_name || '').toLowerCase().includes(s) ||
        (o.bet_description || '').toLowerCase().includes(s)
      );
    }
    if (layeurFilter) {
      list = list.filter((o) => o.layeur_screenname === layeurFilter);
    }
    // Sort
    if (sortBy === 'name') {
      list = [...list].sort((a, b) => (a.bet_name || '').localeCompare(b.bet_name || ''));
    } else if (sortBy === 'odds_desc') {
      list = [...list].sort((a, b) => americanToDecimal(b.odds_american) - americanToDecimal(a.odds_american));
    } else if (sortBy === 'odds_asc') {
      list = [...list].sort((a, b) => americanToDecimal(a.odds_american) - americanToDecimal(b.odds_american));
    } else if (sortBy === 'oldest') {
      list = [...list].sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
    } else {
      // newest first (default)
      list = [...list].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
    }
    return list;
  }, [offerings, tab, search, layeurFilter, sortBy, userId]);

  // ─── Render ───
  return (
    <div className="exchange-page">
      <h1 className="exchange-title">GSIS Bet Exchange</h1>
      <p className="exchange-subtitle">Peer-to-peer wagering — lay or take odds from other users</p>

      {/* Tabs */}
      <div className="exchange-tabs">
        <button className={`exchange-tab ${tab === 'all' ? 'active' : ''}`} onClick={() => setTab('all')}>All Offerings</button>
        <button className={`exchange-tab ${tab === 'mine' ? 'active' : ''}`} onClick={() => setTab('mine')}>My Offerings</button>
      </div>

      {/* Toolbar */}
      <div className="exchange-toolbar">
        <input
          className="search-input"
          placeholder="Search offerings…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={layeurFilter} onChange={(e) => setLayeurFilter(e.target.value)}>
          <option value="">All Layeurs</option>
          {layeurs.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
          <option value="name">Sort by Name</option>
          <option value="odds_desc">Odds: High → Low</option>
          <option value="odds_asc">Odds: Low → High</option>
        </select>
        <span className="toolbar-spacer" />
        <button className="btn-lay" onClick={() => setShowCreate(true)}>+ Lay Odds</button>
      </div>

      {/* Two-column layout: Grid left, Betslip right */}
      <div className="exchange-layout">
        <div className="exchange-content">
          {/* Grid */}
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📋</div>
              <p>{tab === 'mine' ? 'You have no offerings yet.' : 'No offerings available.'}</p>
            </div>
          ) : (
            <div className="offerings-grid">
              {filtered.map((o) => {
                const isOwn = o.layeur_id === userId;
                const isOpen = o.status === 'open';
                const isLocked = o.status === 'locked';
                const isSelected = showTake?.offering_id === o.offering_id;
                return (
                  <div
                    key={o.offering_id}
                    className={`offering-card${!isOpen && !isOwn && !isLocked ? ' closed-card' : ''}${isSelected ? ' selected-card' : ''}${isLocked && !isOwn ? ' locked-card' : ''}`}
                  >
                    {/* Lock overlay for non-owners */}
                    {isLocked && !isOwn && (
                      <div className="lock-overlay">
                        <div className="lock-overlay-icon">
                          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                        </div>
                        <span className="lock-overlay-text">Market Locked</span>
                      </div>
                    )}
                    <div className="card-header">
                      <div className="card-bet-name-wrap">
                        <div className="card-bet-name">{o.bet_name}</div>
                        {o.bet_description && (
                          <span className="info-tooltip-wrap">
                            <span className="info-icon">ⓘ</span>
                            <span className="info-tooltip">{o.bet_description}</span>
                          </span>
                        )}
                      </div>
                      <span className={`card-status status-${o.status}`}>{o.status}</span>
                    </div>
                    <div className="card-stats">
                      <div>
                        <div className="card-stat-label">Odds</div>
                        <div className="card-stat-value odds-value">{fmtOdds(o.odds_american)}</div>
                        <div className="card-stat-decimal">{americanToDecimal(o.odds_american).toFixed(2)}</div>
                      </div>
                      <div>
                        <div className="card-stat-label">Remaining Liquidity</div>
                        <div className="card-stat-value">${fmtMoney(o.remaining)}</div>
                      </div>
                      <div>
                        <div className="card-stat-label">Volume Bet</div>
                        <div className="card-stat-value">${fmtMoney(o.filled)}</div>
                      </div>
                    </div>
                    <div className="card-layeur">Laid by <span>{o.layeur_screenname || 'Unknown'}</span></div>
                    {o.created_at && <div className="card-date-laid">{new Date(o.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>}

                    <div className="card-actions">
                      {isOwn && isOpen && (
                        <>
                          <button className="btn-edit-card" onClick={() => setShowEdit(o)} title="Edit">✎ Edit</button>
                          <button className="btn-lock-card" onClick={async () => {
                            if (!confirm('Lock this market? Others will not be able to take bets until you unlock it.')) return;
                            try { await lockOffering(o.offering_id); load(); } catch (e) { alert('Failed: ' + (e as any).message); }
                          }} title="Lock">🔒 Lock</button>
                          <button className="btn-delete-card" onClick={async () => {
                            if (!confirm('Permanently delete this offering? This cannot be undone.')) return;
                            try { await deleteOffering(o.offering_id); load(); } catch (e) { alert('Failed: ' + (e as any).message); }
                          }} title="Delete">🗑 Delete</button>
                        </>
                      )}
                      {isOwn && isLocked && (
                        <>
                          <button className="btn-unlock-card" onClick={async () => {
                            try { await unlockOffering(o.offering_id); load(); } catch (e) { alert('Failed: ' + (e as any).message); }
                          }} title="Unlock">🔓 Unlock</button>
                          <button className="btn-delete-card" onClick={async () => {
                            if (!confirm('Permanently delete this offering? This cannot be undone.')) return;
                            try { await deleteOffering(o.offering_id); load(); } catch (e) { alert('Failed: ' + (e as any).message); }
                          }} title="Delete">🗑 Delete</button>
                        </>
                      )}
                      {isOwn && o.status === 'closed' && (
                        <button className="btn-delete-card" onClick={async () => {
                          if (!confirm('Remove this closed offering?')) return;
                          try { await deleteOffering(o.offering_id); load(); } catch (e) { alert('Failed: ' + (e as any).message); }
                        }} title="Remove">🗑 Remove</button>
                      )}
                      {!isOwn && isOpen && o.remaining > 0 && (
                        <button className={`btn-take${isSelected ? ' btn-take-active' : ''}`} onClick={() => setShowTake(isSelected ? null : o)}>
                          {isSelected ? '✓ Selected' : 'Take Bet'}
                        </button>
                      )}
                      {!isOwn && isOpen && o.remaining <= 0 && (
                        <button className="btn-take" disabled>Fully Filled</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right-side Betslip */}
        <div className="exchange-sidebar">
          <ExchangeBetSlip offering={showTake} onClear={() => setShowTake(null)} onDone={() => { setShowTake(null); load(); }} />
        </div>
      </div>

      {/* Create Modal */}
      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onDone={() => { setShowCreate(false); load(); }} />}

      {/* Edit Modal */}
      {showEdit && <EditModal offering={showEdit} onClose={() => setShowEdit(null)} onDone={() => { setShowEdit(null); load(); }} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Create Offering Modal
// ═══════════════════════════════════════════════════════════════════

function CreateModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [betName, setBetName] = useState('');
  const [betDesc, setBetDesc] = useState('');
  const [oddsValue, setOddsValue] = useState('');
  const [oddsFormat, setOddsFormat] = useState<OddsFormat>('american');
  const [maxBet, setMaxBet] = useState('');
  const [busy, setBusy] = useState(false);

  const americanPrev = convertToAmerican(oddsValue, oddsFormat);
  const exposure = americanPrev && maxBet ? computeExposure(americanPrev, parseFloat(maxBet) || 0) : 0;

  async function submit() {
    if (!betName.trim() || !oddsValue || !maxBet) return;
    setBusy(true);
    try {
      await createOffering({
        bet_name: betName.trim(),
        bet_description: betDesc.trim() || undefined,
        odds: oddsValue,
        odds_format: oddsFormat,
        max_bet: parseFloat(maxBet),
      });
      onDone();
    } catch (e: any) {
      alert('Error: ' + (e?.response?.data?.error || e.message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="exchange-modal-overlay" onClick={onClose}>
      <div className="exchange-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Lay Odds — Create Offering</h2>

        <div className="form-group">
          <label>Bet Name *</label>
          <input value={betName} onChange={(e) => setBetName(e.target.value)} placeholder="e.g. Over 13.5: Coins picked up by Pam from Trevi Fountain" />
        </div>

        <div className="form-group">
          <label>Description (optional)</label>
          <textarea value={betDesc} onChange={(e) => setBetDesc(e.target.value)} placeholder="Additional details…" />
        </div>

        <div className="odds-row">
          <div className="form-group">
            <label>Odds *</label>
            <input value={oddsValue} onChange={(e) => setOddsValue(e.target.value)} placeholder={oddsFormat === 'american' ? '+150 or -200' : oddsFormat === 'decimal' ? '2.50' : '0.40'} />
          </div>
          <div className="form-group">
            <label>Format</label>
            <select value={oddsFormat} onChange={(e) => setOddsFormat(e.target.value as OddsFormat)}>
              <option value="american">American</option>
              <option value="decimal">Decimal</option>
              <option value="probability">Probability</option>
            </select>
          </div>
        </div>

        {americanPrev && (
          <div style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginBottom: 10 }}>
            Stored as: <strong style={{ color: '#f6c85f' }}>{fmtOdds(americanPrev)}</strong> (American)
          </div>
        )}

        <div className="form-group">
          <label>Max Bet (Stake Cap) *</label>
          <input type="number" min={0} step="any" value={maxBet} onChange={(e) => setMaxBet(e.target.value)} placeholder="100.00" />
        </div>

        {exposure > 0 && (
          <div className="exposure-box">
            <div className="exp-label">Your Maximum Exposure</div>
            <div className="exp-value">${fmtMoney(exposure)}</div>
          </div>
        )}

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || !betName.trim() || !americanPrev || !maxBet} onClick={submit}>
            {busy ? 'Creating…' : 'Create Offering'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Edit Offering Modal
// ═══════════════════════════════════════════════════════════════════

function EditModal({ offering, onClose, onDone }: { offering: any; onClose: () => void; onDone: () => void }) {
  const [oddsValue, setOddsValue] = useState(String(offering.odds_american || ''));
  const [oddsFormat, setOddsFormat] = useState<OddsFormat>('american');
  const [maxBet, setMaxBet] = useState(String(offering.max_bet || ''));
  const [busy, setBusy] = useState(false);

  const americanPrev = convertToAmerican(oddsValue, oddsFormat);
  const exposure = americanPrev && maxBet ? computeExposure(americanPrev, parseFloat(maxBet) || 0) : 0;

  async function submit() {
    setBusy(true);
    try {
      await editOffering({
        offering_id: offering.offering_id,
        odds: oddsValue || undefined,
        odds_format: oddsFormat,
        max_bet: maxBet ? parseFloat(maxBet) : undefined,
      });
      onDone();
    } catch (e: any) {
      alert('Error: ' + (e?.response?.data?.error || e.message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="exchange-modal-overlay" onClick={onClose}>
      <div className="exchange-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Edit Offering</h2>

        <div className="edit-modal-locked-field">
          <label>Bet Name</label>
          <div className="edit-modal-locked-value">{offering.bet_name}</div>
        </div>

        {offering.bet_description && (
          <div className="edit-modal-locked-field">
            <label>Description</label>
            <div className="edit-modal-locked-value desc">{offering.bet_description}</div>
          </div>
        )}

        <div className="odds-row">
          <div className="form-group">
            <label>Odds</label>
            <input value={oddsValue} onChange={(e) => setOddsValue(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Format</label>
            <select value={oddsFormat} onChange={(e) => setOddsFormat(e.target.value as OddsFormat)}>
              <option value="american">American</option>
              <option value="decimal">Decimal</option>
              <option value="probability">Probability</option>
            </select>
          </div>
        </div>

        {americanPrev && (
          <div style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginBottom: 10 }}>
            Stored as: <strong style={{ color: '#f6c85f' }}>{fmtOdds(americanPrev)}</strong>
          </div>
        )}

        <div className="form-group">
          <label>Max Bet (min: ${fmtMoney(offering.filled || 0)} filled)</label>
          <input type="number" min={offering.filled || 0} step="any" value={maxBet} onChange={(e) => setMaxBet(e.target.value)} />
        </div>

        {exposure > 0 && (
          <div className="exposure-box">
            <div className="exp-label">Your Maximum Exposure</div>
            <div className="exp-value">${fmtMoney(exposure)}</div>
          </div>
        )}

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy} onClick={submit}>
            {busy ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Exchange Bet Slip (right-side panel, matches GeoGuessr betslip pattern)
// ═══════════════════════════════════════════════════════════════════

function ExchangeBetSlip({ offering, onClear, onDone }: { offering: any | null; onClear: () => void; onDone: () => void }) {
  const [stake, setStake] = useState('');
  const [busy, setBusy] = useState(false);

  // Reset stake when offering changes
  useEffect(() => { setStake(''); }, [offering?.offering_id]);

  const stakeNum = parseFloat(stake) || 0;
  const dec = offering ? americanToDecimal(offering.odds_american) : 2;
  const payout = stakeNum * dec;
  const profit = payout - stakeNum;
  const remaining = offering?.remaining ?? 0;
  const overLiquidity = stakeNum > remaining && stakeNum > 0;

  async function submit() {
    if (!offering || stakeNum <= 0 || overLiquidity) return;
    setBusy(true);
    try {
      await takeOffering(offering.offering_id, stakeNum);
      onDone();
    } catch (e: any) {
      alert('Error: ' + (e?.response?.data?.error || e.message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="exchange-betslip">
      <div className="betslip-header">
        <h3 className="betslip-title">Bet Slip</h3>
        {offering && <button className="betslip-clear" onClick={onClear}>Clear</button>}
      </div>

      {!offering ? (
        <div className="betslip-empty">
          <p>No selection</p>
          <p className="betslip-empty-hint">Click "Take Bet" on an offering to add it here</p>
        </div>
      ) : (
        <div className="betslip-body">
          {/* Selection card */}
          <div className="betslip-selection">
            <button className="betslip-remove" onClick={onClear} title="Remove">×</button>
            <div className="betslip-sel-name">{offering.bet_name}</div>
            {offering.bet_description && <div className="betslip-sel-desc">{offering.bet_description}</div>}
            <div className="betslip-sel-meta">
              <span>vs <strong>{offering.layeur_screenname}</strong></span>
              <span className="betslip-sel-odds">{fmtOdds(offering.odds_american)}</span>
            </div>
          </div>

          {/* Stake input */}
          <div className="betslip-stake-group">
            <label className="betslip-label">Your Stake</label>
            <div className={`betslip-stake-wrap${overLiquidity ? ' over-limit' : ''}`}>
              <span className="stake-prefix">$</span>
              <input
                type="number"
                className="betslip-stake-input"
                min={0.01}
                step="any"
                value={stake}
                onChange={(e) => setStake(e.target.value)}
                placeholder={`Up to ${fmtMoney(remaining)}`}
              />
            </div>
            {overLiquidity && (
              <div className="betslip-error">
                Exceeds remaining liquidity (${fmtMoney(remaining)})
              </div>
            )}
          </div>

          {/* Payout summary */}
          <div className="betslip-summary">
            <div className="betslip-summary-row">
              <span>Liquidity Available</span>
              <span>${fmtMoney(remaining)}</span>
            </div>
            <div className="betslip-summary-row">
              <span>Odds</span>
              <span className="betslip-odds-val">{fmtOdds(offering.odds_american)}</span>
            </div>
            {stakeNum > 0 && !overLiquidity && (
              <>
                <div className="betslip-summary-row highlight">
                  <span>Potential Payout</span>
                  <span className="betslip-payout">${fmtMoney(payout)}</span>
                </div>
                <div className="betslip-summary-row highlight">
                  <span>Profit</span>
                  <span className="betslip-profit">${fmtMoney(profit)}</span>
                </div>
              </>
            )}
          </div>

          {/* Place bet button */}
          <button
            className="betslip-place-btn"
            disabled={busy || stakeNum <= 0 || overLiquidity}
            onClick={submit}
          >
            {busy ? 'Placing…' : stakeNum > 0 && !overLiquidity ? `Place $${fmtMoney(stakeNum)} Bet` : 'Enter Stake to Place Bet'}
          </button>
        </div>
      )}
    </div>
  );
}
