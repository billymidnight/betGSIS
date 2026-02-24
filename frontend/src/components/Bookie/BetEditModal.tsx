import React, { useState, useEffect } from 'react';
import './BetEditModal.css';
import { editBetFull } from '../../lib/api/api';

export default function BetEditModal({ bet, onClose, onSaved }: { bet: any | null; onClose: () => void; onSaved: () => void }) {
  const [result, setResult] = useState<string>('');
  const [oddsAmerican, setOddsAmerican] = useState<string>('');
  const [betSize, setBetSize] = useState<string>('');
  const [outcome, setOutcome] = useState<string>('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (bet) {
      setResult(bet.result || '');
      setOddsAmerican(bet.odds_american || '');
      setBetSize(String(bet.bet_size || ''));
      setOutcome(bet.outcome || '');
    }
  }, [bet]);

  if (!bet) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      const fields: any = {};
      if (result !== (bet.result || '')) fields.result = result ? result.toLowerCase() : null;
      if (oddsAmerican && oddsAmerican !== (bet.odds_american || '')) fields.odds_american = oddsAmerican;
      if (betSize && Number(betSize) !== Number(bet.bet_size)) fields.bet_size = Number(betSize);
      if (outcome && outcome !== (bet.outcome || '')) fields.outcome = outcome;

      if (Object.keys(fields).length === 0) {
        onClose();
        return;
      }

      await editBetFull(Number(bet.bet_id), fields);
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
    <div className="bem-overlay" onClick={onClose}>
      <div className="bem-modal" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>Edit Bet #{bet.bet_id}</h3>

        <div className="bem-row">
          <label style={{ display: 'block', color: '#94a3b8', marginBottom: 4 }}>Outcome:</label>
          <input
            type="text"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #334155', background: '#071025', color: '#fff', fontSize: '0.95rem' }}
          />
        </div>

        <div className="bem-row">
          <label style={{ display: 'block', color: '#94a3b8', marginBottom: 4 }}>Bet Amount ($):</label>
          <input
            type="number"
            value={betSize}
            onChange={(e) => setBetSize(e.target.value)}
            step="0.01"
            style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #334155', background: '#071025', color: '#fff', fontSize: '0.95rem' }}
          />
        </div>

        <div className="bem-row">
          <label style={{ display: 'block', color: '#94a3b8', marginBottom: 4 }}>Odds (American):</label>
          <input
            type="text"
            value={oddsAmerican}
            onChange={(e) => setOddsAmerican(e.target.value)}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #334155', background: '#071025', color: '#fff', fontSize: '0.95rem' }}
          />
        </div>

        <div className="bem-row">
          <label style={{ display: 'block', color: '#94a3b8', marginBottom: 4 }}>Result:</label>
          <select
            value={result}
            onChange={(e) => setResult(e.target.value)}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #334155', background: '#071025', color: '#fff', fontSize: '0.95rem' }}
          >
            <option value="">(unsettled)</option>
            <option value="Win">Win</option>
            <option value="Loss">Loss</option>
            <option value="Push">Push</option>
          </select>
        </div>

        <div className="bem-actions">
          <button onClick={onClose} className="bem-btn">Cancel</button>
          <button onClick={handleSave} className="bem-btn primary" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}
