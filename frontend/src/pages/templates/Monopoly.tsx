import React, { useEffect, useState } from 'react';
import { fetchMonopolyPlayers } from '../../lib/api/api';
import { useBetsStore } from '../../lib/state/betsStore';
import './Monopoly.css';

type TabType = 'first-to-land' | 'rent';

interface MonopolyPlayer {
  player_id: number;
  player_name: string;
  implied_prob: number;
  decimal_odds: number;
  odds_american: string;
}

export default function MonopolyTemplate() {
  const [activeTab, setActiveTab] = useState<TabType>('first-to-land');
  const [players, setPlayers] = useState<MonopolyPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const addSelection = useBetsStore((s) => s.addSelection);

  useEffect(() => {
    loadPlayers();
  }, []);

  const loadPlayers = async () => {
    try {
      const data = await fetchMonopolyPlayers();
      setPlayers(data);
    } catch (e) {
      console.error('Failed to load monopoly players', e);
    } finally {
      setLoading(false);
    }
  };

  const handleBet = (market: string, playerName: string, odds: string) => {
    addSelection({
      market: 'Monopoly',
      outcome: `${playerName} - ${market}`,
      odds_american: odds,
      point: null,
    });
  };

  const renderMarket = (marketName: string) => {
    if (loading) {
      return <div className="monopoly-loading">Loading players...</div>;
    }

    if (players.length === 0) {
      return <div className="monopoly-empty">No players available</div>;
    }

    return (
      <div className="monopoly-market">
        <h3 className="monopoly-market-title">{marketName}</h3>
        <div className="monopoly-odds-grid">
          {players.map((player) => (
            <div
              key={player.player_id}
              className="monopoly-odds-box"
              onClick={() => handleBet(marketName, player.player_name, player.odds_american)}
            >
              <div className="monopoly-player-name">{player.player_name}</div>
              <div className="monopoly-odds">{player.odds_american}</div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="monopoly-container">
      <h1 className="monopoly-header">Monopoly Markets</h1>

      {/* Tabs */}
      <div className="monopoly-tabs">
        <button
          className={`monopoly-tab ${activeTab === 'first-to-land' ? 'active' : ''}`}
          onClick={() => setActiveTab('first-to-land')}
        >
          First To Land
        </button>
        <button
          className={`monopoly-tab ${activeTab === 'rent' ? 'active' : ''}`}
          onClick={() => setActiveTab('rent')}
        >
          Rent
        </button>
      </div>

      {/* Content */}
      <div className="monopoly-content">
        {activeTab === 'first-to-land' && (
          <div className="monopoly-tab-content">
            {renderMarket('First to Roll Dice')}
            {renderMarket('First to go to Jail')}
            {renderMarket('First to Land in NYC')}
            {renderMarket('First to Land in Munich')}
            {renderMarket('First to Pick Up Chance')}
            {renderMarket('First to Land in France')}
          </div>
        )}

        {activeTab === 'rent' && (
          <div className="monopoly-tab-content">
            <div className="monopoly-placeholder">
              <p>Rent markets coming soon...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

