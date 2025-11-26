import React, { useEffect, useState } from 'react';
import Navbar from '../components/Layout/Navbar';
import Footer from '../components/Layout/Footer';
import BetSlip from '../components/GeoGuessr/BetSlip';
import ToastContainer from '../components/Shared/ToastContainer';
import { fetchZetamacTotals } from '../lib/api/api';
import './GeoGuessr.css';
import { useBetsStore } from '../lib/state/betsStore';

export default function Zetamac() {
  const [zetamacPlayers, setZetamacPlayers] = useState<any[]>([]);
  const [market, setMarket] = useState<'totals' | 'spreads' | 'time-handicaps' | 'moneyline'>('totals');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUpdatingOdds, setIsUpdatingOdds] = useState<Record<number, boolean>>({});
  const addSelection = useBetsStore((s) => s.addSelection);

  // Load players on mount
  useEffect(() => {
    const loadPlayers = async () => {
      try {
        const res = await fetchZetamacTotals();
        const pls = (res.players || []).map((p: any) => ({
          ...p,
          current_threshold: p.default_hook || p.center_hook || 0,
          hooks: p.hooks || [],
        }));
        setZetamacPlayers(pls);
        setIsLoading(false);
      } catch (err) {
        setError('Failed to load Zetamac players');
        console.error(err);
        setIsLoading(false);
      }
    };
    loadPlayers();
  }, []);

  // Helper to update a single player's price (debounced per player)
  const debounceTimers = React.useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const updatePlayerPrice = (playerId: number, threshold: number) => {
    if (debounceTimers.current[playerId]) clearTimeout(debounceTimers.current[playerId]);
    debounceTimers.current[playerId] = setTimeout(async () => {
      setIsUpdatingOdds((s) => ({ ...(s || {}), [playerId]: true }));
      try {
        // Fetch updated odds for this specific threshold
        const res = await fetchZetamacTotals([playerId], [threshold]);
        const results = res.players || [];
        const playerData = results.find((p: any) => p.player_id === playerId);
        if (playerData && playerData.hooks) {
          const hookEntry = playerData.hooks.find((h: any) => h.hook === threshold);
          setZetamacPlayers((prev) => prev.map((p) => {
            if (p.player_id === playerId) {
              // Update the hooks array with new data
              const updatedHooks = p.hooks.map((h: any) => h.hook === threshold && hookEntry ? hookEntry : h);
              return { ...p, current_threshold: threshold, hooks: updatedHooks };
            }
            return p;
          }));
        }
      } catch (e) {
        console.error(e);
      } finally {
        setIsUpdatingOdds((s) => ({ ...(s || {}), [playerId]: false }));
      }
    }, 200);
  };

  return (
    <div className="geoguessr-page">
      <Navbar />

      <main className="geoguessr-main">
        <div className="geoguessr-header">
          <div className="geoguessr-title-section">
            <h1 className="geoguessr-title">Zetamac Odds</h1>
            <p className="geoguessr-subtitle">Bet on Zetamac player performance</p>
          </div>
        </div>

        <div className="geoguessr-layout">
          {/* Market Ribbon at Top */}
          <div className="market-ribbon">
            <button className={`market-tab ${market === 'totals' ? 'active' : ''}`} onClick={() => setMarket('totals')}>Totals</button>
            <button className="market-tab" disabled>Spreads (coming)</button>
            <button className="market-tab" disabled>Time Handicaps (coming)</button>
            <button className="market-tab" disabled>Moneyline (coming)</button>
          </div>

          {/* Main Content Area - Scrollable Player Cards */}
          <div className="geoguessr-content">
            {error && <div className="geoguessr-error">{error}</div>}

            {isLoading ? (
              <div className="geoguessr-loading">
                <div className="spinner" />
                <p>Loading odds...</p>
              </div>
            ) : (
              <div className="totals-market">
                <div className="players-list">
                  {zetamacPlayers.map((p: any) => {
                    // Get the current hook entry
                    const currentHook = p.hooks.find((h: any) => h.hook === p.current_threshold) || p.hooks[0] || {};
                    const isUpdating = isUpdatingOdds[p.player_id];
                    const isLocked = p.lock;

                    // Get min/max for slider
                    const minHook = p.hooks.length > 0 ? p.hooks[0].hook : 0;
                    const maxHook = p.hooks.length > 0 ? p.hooks[p.hooks.length - 1].hook : 0;

                    return (
                      <div key={p.player_id} className="player-card">
                        <div className="player-top">
                          <div className="player-name" style={{fontSize: '1.6rem', fontWeight:600}}>{p.name}</div>
                          <div className="player-mean" style={{fontSize:'1.1rem',color:'#666'}}>μ {p.mean?.toFixed(1) || 0}</div>
                        </div>

                        <div className="player-slider">
                          <input
                            type="range"
                            min={minHook}
                            max={maxHook}
                            step={0.5}
                            value={p.current_threshold}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              setZetamacPlayers((prev) => prev.map((pl) => (pl.player_id === p.player_id ? { ...pl, current_threshold: v } : pl)));
                              updatePlayerPrice(p.player_id, v);
                            }}
                            className="threshold-slider"
                            disabled={isLocked}
                          />
                          <div className="slider-label">{p.current_threshold}</div>
                        </div>

                        <div className="player-prices">
                          <button
                            className="price-btn over"
                            onClick={() => {
                              if (isLocked || isUpdating) return;
                              const sel = {
                                playerId: p.player_id,
                                playerName: p.name,
                                threshold: p.current_threshold,
                                side: 'over' as const,
                                decimalOdds: Number(currentHook.over_decimal) || 1.0,
                                stake: 0,
                                market: 'zetamac-totals' as const,
                                odds_american: currentHook.over_american || ''
                              };
                              addSelection(sel as any);
                            }}
                            disabled={isLocked || isUpdating}
                          >
                            <div className="odds-box">
                              {isLocked ? (
                                <div style={{fontSize:'1.4rem'}}>🔒</div>
                              ) : isUpdating ? (
                                <div style={{fontSize:'0.8rem'}}>...</div>
                              ) : (
                                <>
                                  <div className="price-large">{currentHook.over_american || '—'}</div>
                                  <div className="price-small">{(Number(currentHook.over_decimal) || 1.0).toFixed(2)}</div>
                                </>
                              )}
                            </div>
                            <div className="price-label">OVER</div>
                          </button>

                          <button
                            className="price-btn under"
                            onClick={() => {
                              if (isLocked || isUpdating) return;
                              const sel = {
                                playerId: p.player_id,
                                playerName: p.name,
                                threshold: p.current_threshold,
                                side: 'under' as const,
                                decimalOdds: Number(currentHook.under_decimal) || 1.0,
                                stake: 0,
                                market: 'zetamac-totals' as const,
                                odds_american: currentHook.under_american || ''
                              };
                              addSelection(sel as any);
                            }}
                            disabled={isLocked || isUpdating}
                          >
                            <div className="odds-box">
                              {isLocked ? (
                                <div style={{fontSize:'1.4rem'}}>🔒</div>
                              ) : isUpdating ? (
                                <div style={{fontSize:'0.8rem'}}>...</div>
                              ) : (
                                <>
                                  <div className="price-large">{currentHook.under_american || '—'}</div>
                                  <div className="price-small">{(Number(currentHook.under_decimal) || 1.0).toFixed(2)}</div>
                                </>
                              )}
                            </div>
                            <div className="price-label">UNDER</div>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Bet Slip */}
          <div className="geoguessr-betslip">
            <BetSlip />
          </div>
        </div>
      </main>

      <Footer />
      <ToastContainer />
    </div>
  );
}
