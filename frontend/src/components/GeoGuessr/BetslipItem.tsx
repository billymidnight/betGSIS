import React from 'react';
import Input from '../Shared/Input';
import { Badge } from '../Shared/Badge';
import { BetSelection, useBetsStore } from '../../lib/state/betsStore';
import { computePayout } from '../../lib/format';

interface Props {
  selection: BetSelection;
}

export default function BetslipItem({ selection }: Props) {
  const updateStake = useBetsStore((s) => s.updateStake);
  const removeSelection = useBetsStore((s) => s.removeSelection);

  const handleStakeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Math.max(0, parseFloat(e.target.value) || 0);
    updateStake(selection.id, v);
  };

  const payout = Math.round((selection.stake || 0) * (selection.decimalOdds || 1) * 100) / 100;

  return (
    <div className="betslip-item">
      <div className="betslip-item-header">
        <div className={`betslip-player ${selection.market === 'first-guess' ? 'fg-player' : selection.market === 'country-props' ? 'cp-player' : ''}`}>
          {selection.market === 'Specials' ? 'Specials' : selection.playerName}
        </div>
        <button className="betslip-remove" onClick={() => removeSelection(selection.id)} aria-label="Remove">
          ✕
        </button>
      </div>

      <div className="betslip-item-body">
        <div className={`betslip-market ${selection.market === 'first-guess' ? 'fg-market' : selection.market === 'country-props' ? 'cp-market' : ''}`}>
          {selection.market === 'Specials' ? (
              <div style={{fontWeight:700}}>{selection.outcome || selection.playerName}</div>
            ) : (selection.outcome && String(selection.outcome).toLowerCase().includes('moneyline')) ? (
              // Show Moneyline label (text after colon) when outcome is like "Name: Moneyline"
              <div style={{fontWeight:700}}>{String(selection.outcome).split(':').slice(1).join(':').trim() || 'Moneyline'}</div>
            ) : selection.market === 'first-guess' ? (
              <>{selection.side.toUpperCase()} {`${selection.threshold} - First Round`}</>
                ) : selection.market === 'country-props' ? (
            // Distinguish continent-style props (playerId === -1 and threshold > 0)
            (selection.playerId === -1 || (selection.threshold && Number(selection.threshold) > 0)) ? (
              <>
                {(() => {
                  const hook = selection.threshold ?? (selection as any).point ?? '';
                  return (
                    <span style={{color: selection.side === 'over' ? '#28a745' : '#d97706', fontWeight: 800, fontSize: '0.95rem'}}>
                      {selection.side === 'over' ? 'Over' : 'Under'} {hook}
                    </span>
                  );
                })()}
              </>
            ) : (
              <>
                <span style={{color: '#28a745', fontWeight: 700}}>To Appear</span>
                <span style={{color: '#999', margin: '0 0.5rem'}}>•</span>
                <span style={{color: selection.side === 'over' ? '#28a745' : '#d97706', fontWeight: 700}}>
                  {selection.side === 'over' ? 'YES' : 'NO'}
                </span>
              </>
            )
          ) : selection.market === 'frc' ? (
            <div style={{fontWeight:700}}>First Round Appearance</div>
          ) : (
            <>{selection.side.toUpperCase()} @ {selection.threshold}</>
          )}
        </div>

        <div className="betslip-odds">
          <div className="betslip-odds-american" aria-hidden>
            {typeof selection.decimalOdds === 'number'
              ? (() => {
                  // compute american from decimal odds (no extra rounding)
                  let a = 0;
                  try {
                    a = selection.decimalOdds >= 2 ? Math.round((selection.decimalOdds - 1) * 100) : Math.round(-100 / (selection.decimalOdds - 1));
                    return (a >= 0 ? `+${a}` : `${a}`);
                  } catch (e) {
                    return '—';
                  }
                })()
              : '—'}
          </div>
          <div className="betslip-odds-dec" aria-hidden>{(selection.decimalOdds || 1).toFixed(2)}</div>
        </div>

        <div className="betslip-stake">
          <label className="betslip-label">Stake</label>
          <Input type="number" min="0" step="1" value={selection.stake || ''} onChange={handleStakeChange} className={`betslip-stake-input ${selection.market === 'first-guess' ? 'fg-stake' : selection.market === 'country-props' ? 'cp-stake' : ''}`} />
        </div>

        <div className="betslip-payout">
          <label className="betslip-label">Payout</label>
          <div className={`betslip-payout-value ${selection.market === 'first-guess' ? 'fg-payout' : selection.market === 'country-props' ? 'cp-payout' : ''}`}>${payout.toFixed(2)}</div>
        </div>
      </div>
    </div>
  );
}
