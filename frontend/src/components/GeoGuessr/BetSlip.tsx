import React, { useState } from 'react';
import { useBetsStore } from '../../lib/state/betsStore';
import { useUIStore } from '../../lib/state/uiStore';
import { Button } from '../Shared/Button';
import BetslipItem from './BetslipItem';
import { placeBet as apiPlaceBet, placeBetServer, fetchMyBets } from '../../lib/api/api';
import { decimalToAmerican } from '../../lib/format';
import { useAuthStore } from '../../lib/state/authStore';
import './BetSlip.css';

export default function BetSlip() {
  const selections = useBetsStore((state) => state.selections);
  const clearSelections = useBetsStore((state) => state.clearSelections);
  const placeBetAction = useBetsStore((state) => state.placeBet);
  const addToast = useUIStore((state) => state.addToast);

  const [isPlacing, setIsPlacing] = useState(false);
  const [myBets, setMyBets] = useState<any[]>([]);
  const initAuth = useAuthStore((s) => s.init);

  React.useEffect(() => {
    // load my bets on mount if authenticated
    (async () => {
      try {
        await initAuth();
        const bets = await fetchMyBets();
        setMyBets(bets || []);
      } catch (e) {
        // ignore
      }
    })();
  }, []);

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
        if (sel.market === 'country-props') {
          // continent markets are represented with playerId === -1 and a non-zero threshold
          if (sel.playerId === -1 || (sel.threshold && Number(sel.threshold) > 0)) {
            bet_name = `${sel.playerName}: ${sel.side === 'over' ? 'Over' : 'Under'} ${sel.threshold} Appearances`;
          } else {
            bet_name = `${sel.playerName}: To Appear - ${sel.side === 'over' ? 'Yes' : 'No'}`;
          }
        } else if (sel.market === 'first-guess') {
          bet_name = `${sel.playerName}: First Round - ${sel.side === 'over' ? 'Over' : 'Under'} ${sel.threshold}`;
        } else {
          bet_name = `${sel.playerName}: ${sel.side === 'over' ? 'Over' : 'Under'} ${sel.threshold} Points`;
        }

  const oddsAmerican = decimalToAmerican(Number(sel.decimalOdds || 1));
        // Build payload matching backend 'bets' schema. Include playerName/playerId so backend
        // can construct a strict outcome string per market rules.
        const payload = {
          // For continent markets we prefer sending the human-readable bet_name so backend
          // stores the outcome like "Europe: Under 2.5 Appearances". For normal markets
          // send the market code to let backend construct its canonical name.
          market: (sel.playerId === -1 && sel.market === 'country-props') ? bet_name : (sel.market || bet_name),
          point: sel.threshold || null,
          outcome: sel.side || null,
          bet_size: Number(sel.stake || 0),
          odds_american: oddsAmerican,
          playerName: sel.playerName || sel.playerName || null,
          playerId: sel.playerId || sel.playerId || null,
        };
        try {
          const resp = await placeBetServer(payload);
          placeBetAction(sel);
        } catch (e: any) {
          console.error('Place bet server error:', e?.response?.data ?? e?.message ?? e);
          throw e;
        }
      }

      // refresh user's bets
      try {
        const bets = await fetchMyBets();
        setMyBets(bets || []);
      } catch (e) {
        // ignore
      }

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

          {/* User's placed bets from server */}
          <div style={{marginTop: 18}}>
            <h4 style={{margin: '8px 0'}}>My Bets</h4>
            {myBets.length === 0 ? (
              <div style={{color: '#999'}}>No placed bets yet</div>
            ) : (
              <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
                {myBets.map((b) => (
                  <div key={b.bet_id} style={{padding: 8, border: '1px solid var(--color-border)', borderRadius: 6, background: 'var(--color-bg)'}}>
                    <div style={{fontWeight: 700}}>{b.market ?? `${b.outcome} ${b.point ?? ''}`}</div>
                    <div style={{fontSize: '0.9rem', color: '#777'}}>${b.bet_size} • {b.odds_american} • {new Date(b.placed_at || b.created_at || b.bet_placed_time).toLocaleString()}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
