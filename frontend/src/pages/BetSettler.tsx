import React, { useEffect, useState } from 'react';
import { fetchActiveBets, settleBet } from '../lib/api/api';
import './BetSettler.css';

export default function BetSettler() {
  const [bets, setBets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any | null>(null);
  const [choice, setChoice] = useState<'win'|'loss'|'push'>('win');

  async function load() {
    setLoading(true);
    try {
      const rows = await fetchActiveBets();
      setBets(rows || []);
    } catch (e) {
      console.error('fetchActiveBets failed', e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openSettle(bet: any) {
    setEditing(bet);
    setChoice('win');
  }

  function closeModal() {
    setEditing(null);
  }

  async function doSettle() {
    if (!editing) return;
    try {
      await settleBet(editing.bet_id || editing.id || editing.betId, choice);
      // refresh
      await load();
      closeModal();
    } catch (e) {
      console.error('settle failed', e);
      alert('Settle failed: ' + (e as any).message);
    }
  }

  function fmtUTC(ts: string | null) {
    if (!ts) return '';
    try {
      const d = new Date(ts);
      const opts: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' };
      return d.toLocaleString('en-US', opts) + ' UTC';
    } catch (e) { return String(ts); }
  }

  return (
    <div className="bet-settler-page">
      <h1 className="page-title">Bet Settler</h1>
      <p className="muted">Only active bets (not yet settled) are listed here.</p>
        {loading ? <div>Loading…</div> : (
          <table className="settler-table">
            <thead>
              <tr>
                <th>Time Placed (UTC)</th>
                <th>Game No</th>
                <th>Outcome</th>
                <th>Bet Amount</th>
                <th>Odds</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {bets.map((b) => (
                <tr key={b.bet_id || b.id}>
                  <td>{fmtUTC(b.placed_at || b.created_at || null)}</td>
                  <td>{b.game_id ?? b.game}</td>
                  <td className="mono">{String(b.outcome || b.market || '')}</td>
                  <td>{Number(b.bet_size || b.stake || 0).toFixed(2)}</td>
                  <td>{String(b.odds_american || b.odds || '')}</td>
                  <td><button className="icon-btn" onClick={() => openSettle(b)} title="Settle"><span>✎</span></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {editing && (
          <div className="modal-overlay">
            <div className="modal-card">
              <h2>Settle Bet</h2>
              <div className="modal-row"><strong>Time:</strong> {fmtUTC(editing.placed_at || editing.created_at || null)}</div>
              <div className="modal-row"><strong>Game:</strong> {editing.game_id}</div>
              <div className="modal-row"><strong>Outcome:</strong> <span className="mono">{editing.outcome}</span></div>
              <div className="modal-row"><strong>Bet Amount:</strong> ${Number(editing.bet_size || editing.stake || 0).toFixed(2)}</div>
              <div className="modal-row"><strong>Odds:</strong> {String(editing.odds_american || editing.odds || '')}</div>

              <div className="modal-row">
                <label>Result:</label>
                <select value={choice} onChange={(e) => setChoice(e.target.value as any)}>
                  <option value="win">Win</option>
                  <option value="loss">Loss</option>
                  <option value="push">Push</option>
                </select>
              </div>

              <div className="modal-actions">
                <button className="btn btn-secondary" onClick={closeModal}>Discard</button>
                <button className="btn btn-primary" onClick={doSettle}>Settle</button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}
