import React, { useEffect, useState } from 'react';
import BetSlip from '../../components/GeoGuessr/BetSlip';
import ToastContainer from '../../components/Shared/ToastContainer';
import { fetchPokerPlayers } from '../../lib/api/api';
import { useBetsStore } from '../../lib/state/betsStore';
import '../GeoGuessr.css';

interface PokerPlayer {
  player_id: number;
  player_name: string;
  player_screenname: string | null;
}

export default function PokerTemplate() {
  const [players, setPlayers] = useState<PokerPlayer[]>([]);
  const [tab, setTab] = useState<'cash' | 'tournament'>('cash');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const addSelection = useBetsStore((s) => s.addSelection);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetchPokerPlayers();
        if (mounted) setPlayers(res.players || []);
      } catch (e: any) {
        console.error('Failed to load poker players', e);
        if (mounted) setError(e.message || 'Failed to load players');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const tabLabel = tab === 'cash' ? 'Cash Game' : 'Tournament';

  const handleSelect = (p: PokerPlayer) => {
    const outcome = `Poker ${tabLabel}`;
    const sel = {
      playerId: p.player_id,
      playerName: p.player_name,
      threshold: 0,
      side: 'over' as const,
      decimalOdds: 2.0,
      stake: 0,
      market: 'Poker' as any,
      outcome,
      odds_american: '+100',
    };
    addSelection(sel as any);
  };

  return (
    <div className="geoguessr-page">
      <main className="geoguessr-main">
        <div className="geoguessr-header">
          <div className="geoguessr-title-section">
            <h1 className="geoguessr-title">Poker Odds</h1>
            <p className="geoguessr-subtitle">Pick a winner for tonight's {tabLabel.toLowerCase()}</p>
          </div>
        </div>

        <div className="geoguessr-layout">
          {/* Market Ribbon */}
          <div className="market-ribbon">
            <button className={`market-tab ${tab === 'cash' ? 'active' : ''}`} onClick={() => setTab('cash')}>Cash Game</button>
            <button className={`market-tab ${tab === 'tournament' ? 'active' : ''}`} onClick={() => setTab('tournament')}>Tournament</button>
          </div>

          {/* Main Content */}
          <div className="geoguessr-content">
            {error && <div className="geoguessr-error">{error}</div>}

            {loading ? (
              <div className="geoguessr-loading">
                <div className="spinner" />
                <p>Loading players...</p>
              </div>
            ) : players.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>No poker players found. Add players to the <code>poker_players</code> table.</div>
            ) : (
              <div className="players-list">
                {players.map((p) => (
                  <div key={p.player_id} className="player-card">
                    <div className="player-top">
                      <div className="player-name" style={{ fontSize: '1.6rem', fontWeight: 600 }}>
                        {p.player_name}
                        {p.player_screenname && (
                          <span style={{ fontSize: '1rem', color: '#999', marginLeft: 8 }}>({p.player_screenname})</span>
                        )}
                      </div>
                    </div>

                    <div className="player-prices" style={{ justifyContent: 'center' }}>
                      <button
                        className="price-btn over"
                        onClick={() => handleSelect(p)}
                        style={{ minWidth: 120 }}
                      >
                        <div className="odds-box">
                          <div className="price-large">+100</div>
                          <div className="price-small">2.00</div>
                        </div>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bet Slip Sidebar */}
          <div className="geoguessr-sidebar">
            <BetSlip />
          </div>
        </div>
      </main>

      <ToastContainer />
    </div>
  );
}
