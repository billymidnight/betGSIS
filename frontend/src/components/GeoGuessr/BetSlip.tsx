import React, { useState } from 'react';
import { useBetsStore } from '../../lib/state/betsStore';
import { useUIStore } from '../../lib/state/uiStore';
import { Button } from '../Shared/Button';
import BetslipItem from './BetslipItem';
import { placeBet as apiPlaceBet, placeBetServer } from '../../lib/api/api';
import { decimalToAmerican } from '../../lib/format';
import { useAuthStore } from '../../lib/state/authStore';
import './BetSlip.css';

export default function BetSlip() {
  const selections = useBetsStore((state) => state.selections);
  const clearSelections = useBetsStore((state) => state.clearSelections);
  const placeBetAction = useBetsStore((state) => state.placeBet);
  const addToast = useUIStore((state) => state.addToast);

  const [isPlacing, setIsPlacing] = useState(false);

  // No parlaying: render each selection as its own betslip card
  const handlePlaceAll = async () => {
    if (selections.length === 0) {
      addToast({ message: 'Please add selections to place', type: 'error' });
      return;
    }

    const authState = useAuthStore.getState();
    if (!authState.isAuthenticated) {
      addToast({ message: 'Please sign in to place bets', type: 'error' });
      return;
    }

    setIsPlacing(true);
    try {
      // Use server endpoint with Supabase JWT; compose bet_name per market
    for (const sel of selections) {
        let bet_name = '';
        if (sel.market === 'country-props' || String(sel.market) === 'Continent Totals') {
          // continent markets may be represented as `country-props` with playerId === -1
          // or as a separate 'Continent Totals' market (see ContinentPropsList).
          // Use `threshold` or `point` when available to build a concise Over/Under label.
          const pointVal = sel.threshold ?? (sel as any).point ?? null;
          if (sel.playerId === -1 || (pointVal && Number(pointVal) > 0) || String(sel.market) === 'Continent Totals') {
            // Continent totals / continent-style props
            bet_name = `${sel.playerName}: ${sel.side === 'over' ? 'Over' : 'Under'} ${pointVal ?? ''}`;
          } else {
            // Country To Appear
            bet_name = `${sel.playerName}: To Appear - ${sel.side === 'over' ? 'Yes' : 'No'}`;
          }
        } else if (sel.market === 'first-guess') {
          bet_name = `${sel.playerName}: First Round - ${sel.side === 'over' ? 'Over' : 'Under'} ${sel.threshold}`;
        } else if (String(sel.market) === 'last-guess') {
          bet_name = `${sel.playerName}: Last Round - ${sel.side === 'over' ? 'Over' : 'Under'} ${sel.threshold}`;
        } else if (sel.market === 'frc' || String(sel.market) === 'frc') {
          // First Continent (FRC) selections: these should be sent to the server
          // with market = 'First Round Continent' and the outcome verbatim
          // matching the betslip (e.g. "Europe: First Round Appearance").
          bet_name = `${sel.playerName}: First Round Appearance`;
        } else if (sel.market === 'zetamac-totals') {
          bet_name = `${sel.playerName} Zetamac: ${sel.side === 'over' ? 'Over' : 'Under'} ${sel.threshold}`;
        } else {
          bet_name = `${sel.playerName}: ${sel.side === 'over' ? 'Over' : 'Under'} ${sel.threshold} Points`;
        }

        const oddsAmerican = decimalToAmerican(Number(sel.decimalOdds || 1));
        // Build payload matching backend 'bets' schema. Include playerName/playerId so backend
        // can construct a strict outcome string per market rules.
        // Default payload values
        let payloadMarket = (sel.playerId === -1 && sel.market === 'country-props') ? bet_name : (sel.market || bet_name);
        let payloadOutcome: any = null;

        // Specials: store exact outcome string
        if (sel.market === 'Specials') {
          payloadOutcome = sel.outcome || sel.playerName || null;
        } else if (typeof (sel.market || '') === 'string' && (sel.market || '').toLowerCase().includes('moneyline')) {
          // Moneyline selections: always use sel.outcome (guaranteed to be set in GeoGuessr.tsx)
          payloadMarket = 'Moneyline';
          payloadOutcome = sel.outcome || `${sel.playerName}: Moneyline`;
        } else if (sel.market === 'first-guess') {
          payloadOutcome = `${sel.playerName}: First Round - ${sel.side === 'over' ? 'Over' : 'Under'} ${sel.threshold}`;
        } else if (String(sel.market) === 'last-guess') {
          payloadOutcome = `${sel.playerName}: Last Round - ${String((sel as any).side).toLowerCase() === 'over' ? 'Over' : 'Under'} ${sel.threshold}`;
        } else if (sel.market === 'frc' || String(sel.market) === 'frc') {
          // For First Round Continent, keep the canonical market name but
          // store the outcome including the continent name so DB outcome
          // becomes e.g. "Europe: First Round Appearance".
          payloadMarket = 'First Round Continent';
          // Prefer the selection's playerName to include the continent; fall
          // back to the literal if missing.
          payloadOutcome = sel.playerName && String(sel.playerName).trim() !== ''
            ? `${sel.playerName}: First Round Appearance`
            : (sel.outcome && typeof sel.outcome === 'string' ? sel.outcome : 'First Round Continent');
        } else if (sel.market === 'zetamac-totals') {
          payloadMarket = 'zetamac_totals';
          payloadOutcome = `${sel.playerName} Zetamac Totals ${sel.side === 'over' ? 'Over' : 'Under'} ${sel.threshold}`;
        } else if (sel.market === 'country-props' || String(sel.market) === 'Continent Totals') {
          // continent markets: if playerId === -1 use human-readable bet_name
          const pt = sel.threshold ?? (sel as any).point ?? null;
          if (sel.playerId === -1 || (pt && Number(pt) > 0) || String(sel.market) === 'Continent Totals') {
            // For continent totals, include the numeric threshold/point value
            payloadOutcome = `${sel.playerName}: ${sel.side === 'over' ? 'Over' : 'Under'} ${pt ?? ''}`;
          } else {
            // For To Appear bets prefer the human-readable outcome provided
            // on the selection (sel.outcome) so DB matches the betslip exactly.
            // Fallback to constructing "<Country>: To Appear - Yes/No" only
            // if sel.outcome is missing.
            if (sel.outcome && typeof sel.outcome === 'string' && sel.outcome.trim() !== '') {
              // Use the exact human-readable outcome when available (matches betslip)
              payloadOutcome = sel.outcome;
            } else {
              // Try to infer Yes/No from available selection fields (robust normalization)
              let yn: string | null = null;
              try {
                const candidate = String((sel as any).side ?? (sel as any).choice ?? (sel as any).selected ?? '').trim().toLowerCase();
                if (/\b(?:yes|y|true|over|1)\b/.test(candidate)) yn = 'Yes';
                else if (/\b(?:no|n|false|under|0)\b/.test(candidate)) yn = 'No';
                // As a last resort, default to 'Yes' (do NOT hardcode 'No')
                if (!yn) yn = 'Yes';
              } catch (e) {
                yn = 'Yes';
              }
              payloadOutcome = `${sel.playerName}: To Appear - ${yn}`;
            }
          }
        } else {
          // default totals-like naming
          payloadOutcome = `${sel.playerName}: ${sel.side === 'over' ? 'Over' : 'Under'} ${sel.threshold} Points`;
        }

        // Ante market: prefer verbatim outcome and canonical market name 'Ante'
        if (sel.market === 'ante' || String(sel.market).toLowerCase() === 'ante') {
          payloadMarket = 'Ante';
          payloadOutcome = sel.outcome || sel.playerName || null;
        }

        const payload = {
          market: payloadMarket,
          point: sel.threshold || null,
          outcome: payloadOutcome,
          bet_size: Number(sel.stake || 0),
          odds_american: oddsAmerican,
          playerName: sel.playerName || null,
          playerId: sel.playerId || null,
        };
        // Debugging: log payload for country-props to verify outcome value
        try {
          if (payload.market === 'country-props') {
            // eslint-disable-next-line no-console
            console.debug('[BetSlip] placing country-props payload:', payload);
          }
          // Log ALL bets to debug moneyline issue
          console.log('[BetSlip] Placing bet with payload:', JSON.stringify(payload, null, 2));
          const resp = await placeBetServer(payload);
          placeBetAction(sel);
        } catch (e: any) {
          console.error('Place bet server error:', e?.response?.data ?? e?.message ?? e);
          throw e;
        }
      }

      // don't auto-refresh or display historical bets here (UI simplified)

      addToast({ message: `Placed ${selections.length} bet(s)`, type: 'success' });
      clearSelections();
    } catch (err) {
      console.error('Place bets error', err);
      addToast({ message: 'Failed to place bets', type: 'error' });
    } finally {
      setIsPlacing(false);
    }
  };

  return (
    <div className="bet-slip">
      <div className="bet-slip-header">
        <h3 className="bet-slip-title">Bet Slip</h3>
        {selections.length > 0 && (
          <button className="bet-slip-clear" onClick={clearSelections}>
            Clear All
          </button>
        )}
      </div>

      {selections.length === 0 ? (
        <div className="bet-slip-empty">
          <p>No selections yet</p>
          <p className="bet-slip-empty-hint">Click odds to add to your bet slip</p>
        </div>
      ) : (
        <>
          <div className="bet-slip-selections">
            {selections.map((s) => (
              <BetslipItem key={s.id} selection={s} />
            ))}
          </div>

          <div className="bet-slip-actions">
            <Button variant="primary" size="lg" onClick={handlePlaceAll} isLoading={isPlacing} className="place-bet-btn">
              {isPlacing ? 'Placing Bets...' : `Place ${selections.length} Bet(s)`}
            </Button>
          </div>

          {/* historical bets hidden per user request */}
        </>
      )}
    </div>
  );
}
