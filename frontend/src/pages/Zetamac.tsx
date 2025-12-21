import React, { useEffect, useState } from 'react';
import Navbar from '../components/Layout/Navbar';
import Footer from '../components/Layout/Footer';
import BetSlip from '../components/GeoGuessr/BetSlip';
import ToastContainer from '../components/Shared/ToastContainer';
import { fetchZetamacTotals, fetchZetamacMoneylines } from '../lib/api/api';
import './GeoGuessr.css';
import { useBetsStore } from '../lib/state/betsStore';

export default function Zetamac() {
  const [zetamacPlayers, setZetamacPlayers] = useState<any[]>([]);
  const [moneylineMatchups, setMoneylineMatchups] = useState<any[]>([]);
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

  // Load moneylines when market switches to moneyline
  useEffect(() => {
    if (market === 'moneyline') {
      const loadMoneylines = async () => {
        try {
          const res = await fetchZetamacMoneylines();
          console.log('🔍 Raw response:', res);
          console.log('🔍 Response type:', typeof res);
          console.log('🔍 Response keys:', Object.keys(res || {}));
          console.log('🔍 res.matchups:', res?.matchups);
          console.log('🔍 Is matchups array?:', Array.isArray(res?.matchups));
          const matchups = Array.isArray(res?.matchups) ? res.matchups : [];
          console.log('✅ Setting moneyline matchups, count:', matchups.length);
          setMoneylineMatchups(matchups);
        } catch (err) {
          console.error('❌ Failed to load moneylines:', err);
        }
      };
      loadMoneylines();
    }
  }, [market]);

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
            <button className={`market-tab ${market === 'moneyline' ? 'active' : ''}`} onClick={() => setMarket('moneyline')}>Moneyline</button>
          </div>

          {/* Main Content Area - Scrollable Player Cards */}
          <div className="geoguessr-content">
            {error && <div className="geoguessr-error">{error}</div>}

            {isLoading ? (
              <div className="geoguessr-loading">
                <div className="spinner" />
                <p>Loading odds...</p>
              </div>
            ) : market === 'moneyline' ? (
              <div className="moneyline-market">
                {moneylineMatchups.length === 0 && <div style={{padding: '20px', textAlign: 'center'}}>No matchups available. Check console for errors.</div>}
                <div className="matchups-list" style={{display: 'flex', flexDirection: 'column', gap: '16px', padding: '20px'}}>
                  {moneylineMatchups.map((matchup: any, idx: number) => (
                    <div key={idx} className="matchup-card" style={{display: 'flex', flexDirection: 'column', gap: '12px', background: '#1a1a1a', borderRadius: '12px', padding: '20px', border: '1px solid #333'}}>
                      <div className="matchup-title" style={{fontSize: '1.1rem', fontWeight: 600, color: '#999', textAlign: 'center', marginBottom: '8px'}}>{matchup.player1_name} vs. {matchup.player2_name}</div>
                      <div className="matchup-odds" style={{display: 'flex', gap: '12px', justifyContent: 'space-between'}}>
                        <button
                          className="price-btn player1"
                          onClick={() => {
                            const sel = {
                              playerId: matchup.player1_id,
                              playerName: `${matchup.player1_name} Zetamac ML`,
                              threshold: `${matchup.player1_name} vs. ${matchup.player2_name}`,
                              side: 'player1' as const,
                              decimalOdds: Number(matchup.player1_decimal) || 1.0,
                              stake: 0,
                              market: 'zetamac_moneyline' as const,
                              odds_american: matchup.player1_american || ''
                            };
                            addSelection(sel as any);
                          }}
                          style={{flex: 1, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', border: 'none', borderRadius: '8px', padding: '16px', cursor: 'pointer', transition: 'all 0.2s'}}
                          onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
                          onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                        >
                          <div className="odds-box" style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
                            <div className="player-name-odds" style={{fontSize: '1.2rem', fontWeight: 700, color: '#fff'}}>{matchup.player1_name}</div>
                            <div className="price-large" style={{fontSize: '1.8rem', fontWeight: 800, color: '#fff'}}>{matchup.player1_american || '—'}</div>
                            <div className="price-small" style={{fontSize: '0.9rem', color: '#e0e0e0'}}>({(Number(matchup.player1_decimal) || 1.0).toFixed(2)})</div>
                          </div>
                        </button>
                        <button
                          className="price-btn player2"
                          onClick={() => {
                            const sel = {
                              playerId: matchup.player2_id,
                              playerName: `${matchup.player2_name} Zetamac ML`,
                              threshold: `${matchup.player1_name} vs. ${matchup.player2_name}`,
                              side: 'player2' as const,
                              decimalOdds: Number(matchup.player2_decimal) || 1.0,
                              stake: 0,
                              market: 'zetamac_moneyline' as const,
                              odds_american: matchup.player2_american || ''
                            };
                            addSelection(sel as any);
                          }}
                          style={{flex: 1, background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', border: 'none', borderRadius: '8px', padding: '16px', cursor: 'pointer', transition: 'all 0.2s'}}
                          onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
                          onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                        >
                          <div className="odds-box" style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
                            <div className="player-name-odds" style={{fontSize: '1.2rem', fontWeight: 700, color: '#fff'}}>{matchup.player2_name}</div>
                            <div className="price-large" style={{fontSize: '1.8rem', fontWeight: 800, color: '#fff'}}>{matchup.player2_american || '—'}</div>
                            <div className="price-small" style={{fontSize: '0.9rem', color: '#e0e0e0'}}>({(Number(matchup.player2_decimal) || 1.0).toFixed(2)})</div>
                          </div>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
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
