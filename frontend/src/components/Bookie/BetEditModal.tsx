import React, { useState, useEffect } from 'react';
import './BetEditModal.css';
import { editBetResult } from '../../lib/api/api';

export default function BetEditModal({ bet, onClose, onSaved }: { bet: any | null; onClose: () => void; onSaved: () => void }) {
  const [result, setResult] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setResult(bet?.result ?? null);
  }, [bet]);

  if (!bet) return null;

  const handleSave = async () => {
    if (!result) return;
    setSaving(true);
    try {
      await editBetResult(Number(bet.bet_id), result as any);
      onSaved();
      onClose();
    } catch (e) {
      console.error('Failed to save bet', e);
      alert('Failed to save bet');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bem-overlay">
      <div className="bem-modal">
        <h3>Edit Bet #{bet.bet_id}</h3>
        <div className="bem-row"><strong>Placed:</strong> {bet.placed_at_edt || bet.placed_at_utc}</div>
        <div className="bem-row"><strong>Game:</strong> {bet.game_id}</div>
        <div className="bem-row"><strong>Outcome:</strong> {bet.outcome}</div>
        <div className="bem-row"><strong>Bet Amount:</strong> {Number(bet.bet_size).toLocaleString(undefined,{style:'currency',currency:'USD'})}</div>
        <div className="bem-row"><strong>Odds:</strong> {bet.odds_american}</div>
        <div className="bem-row"><strong>P&L Calc:</strong> {Number(bet.pnl_calc).toLocaleString(undefined,{style:'currency',currency:'USD'})}</div>

        <div className="bem-row">
          <label>Result:</label>
          <select value={result || ''} onChange={(e) => setResult(e.target.value)}>
            <option value="">(select)</option>
            <option value="win">Win</option>
            <option value="loss">Loss</option>
            <option value="push">Push</option>
          </select>
        </div>

        <div className="bem-actions">
          <button onClick={onClose} className="bem-btn">Cancel</button>
          <button onClick={handleSave} className="bem-btn primary" disabled={saving || !result}>{saving ? 'Saving...' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}
