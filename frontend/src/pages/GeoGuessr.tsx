import React, { useEffect, useState } from 'react';
import supabase from '../lib/supabaseClient';
import Navbar from '../components/Layout/Navbar';
import Footer from '../components/Layout/Footer';
// ThresholdSelector and OddsTable replaced by new Totals UI
import BetSlip from '../components/GeoGuessr/BetSlip';
import ContinentPropsList from '../components/GeoGuessr/ContinentPropsList';
import ToastContainer from '../components/Shared/ToastContainer';
import { fetchGeoTotals, fetchPricingLines, fetchPricingFirstGuess, fetchPricingCountryProps, fetchMoneylinesPrices, fetchSpecialsPrices } from '../lib/api/api';
import { americanToDecimal } from '../lib/format';
import './GeoGuessr.css';
import { useBetsStore } from '../lib/state/betsStore';

export default function GeoGuessr() {
  const [geoPlayers, setGeoPlayers] = useState<any[]>([]);
  const [thresholdList, setThresholdList] = useState<number[]>([]);
  const [market, setMarket] = useState<'totals' | 'first-guess' | 'last-guess' | 'country-props' | 'moneyline' | 'specials'>('totals');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUpdatingOdds, setIsUpdatingOdds] = useState<Record<number, boolean>>({});
  const addSelection = useBetsStore((s) => s.addSelection);

  // Load players on mount
  useEffect(() => {
    // Log logged-in user UUID immediately when GeoGuessr tab loads
    (async () => {
      try {
        const userRes = await supabase.auth.getUser();
        const supUser = (userRes as any)?.data?.user ?? (userRes as any)?.user;
        if (supUser && supUser.id) {
          console.log(`Brudda, your uid is ${supUser.id}`);
        } else {
          console.log('Brudda, your uid is not available');
        }
      } catch (err) {
        console.warn('Failed to fetch supabase user for logging:', err);
      }
    })();
    const loadPlayers = async () => {
      try {
        const res = await fetchGeoTotals();
        const tlist = res.thresholds || [];
        setThresholdList(tlist);

        const pls = (res.players || []).map((p: any) => {
          const mu = p.mean_score || 0;
          // default first-guess threshold: nearest 300 to mean/5, clamped to 2100..3900
          const defaultFGThreshold = Math.max(2100, Math.min(3900, Math.round((mu / 5.0) / 300.0) * 300));
          return {
            ...p,
            // keep totals/current_threshold behavior unchanged; store computed FG default separately
            current_threshold: p.default_threshold || (tlist.find((x: number) => x >= 10000) || tlist[0]),
            line: p.initial || null,
            // keep placeholder default value for quick reference; actual pricing entry will replace this when fetch completes
            first_guess_line: p.first_guess_line ?? null,
            default_first_guess_threshold: defaultFGThreshold,
          };
        });
        setGeoPlayers(pls);
        setIsLoading(false);

        // Compute default first-guess thresholds and eagerly fetch their prices so initial render is correct
        try {
          const playerIds = pls.map((pp: any) => pp.player_id);
          const fgThresholdsPerPlayer = pls.map((pp: any) => ({
            playerId: pp.player_id,
            threshold: pp.default_first_guess_threshold,
          }));

          const uniqueThresholds = Array.from(new Set(fgThresholdsPerPlayer.map((x) => x.threshold))) as number[];
          const fgRes = await fetchPricingFirstGuess(playerIds, uniqueThresholds, 'normal', 700);
          const fgResults = fgRes.results || fgRes || {};

          console.log('✓ Prefetched first-guess odds:', fgResults);

          // Map results back to each player's chosen threshold
          setGeoPlayers((prev) => prev.map((p) => {
            const byPlayer = fgResults[String(p.player_id)] || {};
            const entry = byPlayer[String(p.default_first_guess_threshold)] || null;
            console.log(`Player ${p.player_id} threshold ${p.default_first_guess_threshold} first_guess_line:`, entry);
            return { ...p, first_guess_line: entry };
          }));
        } catch (err) {
          console.error('Failed to prefetch first-guess lines', err);
        }
      } catch (err) {
        setError('Failed to load players');
        console.error(err);
        setIsLoading(false);
      }
    };
    loadPlayers();
  }, []);

  // helper to update a single player's price (debounced per player)
  const debounceTimers = React.useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const updatePlayerPrice = (playerId: number, threshold: number) => {
    // debounce per-player to avoid spamming backend while sliding
    if (debounceTimers.current[playerId]) clearTimeout(debounceTimers.current[playerId]);
    debounceTimers.current[playerId] = setTimeout(async () => {
      // mark this player's odds as updating to disable bet buttons
      setIsUpdatingOdds((s) => ({ ...(s || {}), [playerId]: true }));
      try {
        let res: any = null;
        if (market === 'totals') {
          // totals: use existing pricing lines endpoint
          res = await fetchPricingLines([playerId], [threshold], 'normal', 300);
          const results = res.results || res || {};
          const pidKey = String(playerId);
          const byPlayer = results[pidKey] || {};
          const entry = byPlayer[String(threshold)] || null;
          setGeoPlayers((prev) => prev.map((p) => (p.player_id === playerId ? { ...p, current_threshold: threshold, line: entry } : p)));
        } else if (market === 'first-guess' || market === 'last-guess') {
           // first-guess market: call new endpoint with 700 bps default
           res = await fetchPricingFirstGuess([playerId], [threshold], 'normal', 700);
           const results = res.results || res || {};
           const pidKey = String(playerId);
           const byPlayer = results[pidKey] || {};
           const entry = byPlayer[String(threshold)] || null;
           setGeoPlayers((prev) => prev.map((p) => (p.player_id === playerId ? { ...p, current_threshold: threshold, first_guess_line: entry } : p)));
         }
      } catch (e) {
        console.error(e);
      } finally {
        setIsUpdatingOdds((s) => ({ ...(s || {}), [playerId]: false }));
      }
    }, 200);
  };

  // First-guess thresholds: 2100 .. 3900 step 300
  const FG_THRESHOLDS = Array.from({ length: Math.floor((3900 - 2100) / 300) + 1 }, (_, i) => 2100 + i * 300);

  function CountryPropsList() {
    const [countries, setCountries] = useState<any[]>([]);
    const [expanded, setExpanded] = useState(false);
    const [loadingCountries, setLoadingCountries] = useState(false);
    const addSelection = useBetsStore((s) => s.addSelection);

    useEffect(() => {
      let mounted = true;
      const load = async () => {
        setLoadingCountries(true);
        try {
          const res = await fetchPricingCountryProps(5, 700);
          const list = (res.results || []).map((r: any) => ({
            country_id: r.country_id || r.id,
            // ensure we provide `country` property used by the renderer (fall back to name)
            country: r.country || r.name || r.country_name || null,
            freq_pct: r.freq_pct ?? r.freq ?? 0,
            odds_yes_decimal: r.odds_yes_decimal ?? r.odds_yes ?? 0,
            odds_no_decimal: r.odds_no_decimal ?? r.odds_no ?? 0,
            odds_yes_american: r.odds_yes_american ?? r.odds_yes_american ?? '',
            odds_no_american: r.odds_no_american ?? r.odds_no_american ?? '',
            prob_yes: r.prob_yes ?? 0,
            prob_no: r.prob_no ?? 0,
          }));
          // sort by freq descending
          list.sort((a: any, b: any) => (b.freq_pct || 0) - (a.freq_pct || 0));
          if (mounted) setCountries(list);
        } catch (err) {
          console.error('Failed to load country props', err);
        } finally {
          if (mounted) setLoadingCountries(false);
        }
      };
      load();
      return () => { mounted = false; };
    }, []);

    const visible = expanded ? countries : countries.slice(0, 5);

    return (
      <div className="country-props-list-inner">
        {loadingCountries ? (
          <div>Loading countries...</div>
        ) : (
          <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem'}}>
            {visible.map((c) => (
              <div key={c.country_id} className="country-row player-card" style={{padding: '0.5rem', borderRadius: 8}}>
                <div className="player-top" style={{marginBottom: 6}}>
                  <div className="player-name" style={{fontSize: '1.05rem', fontWeight: 900, color: '#28a745', textTransform: 'uppercase', letterSpacing: '0.6px'}}>
                    {c.country}
                  </div>
                </div>

                <div className="player-prices" style={{display: 'flex', gap: '0.5rem'}}>
                  <button
                    className="price-btn over"
                    onClick={() => {
                      const sel = { playerId: c.country_id, playerName: c.country, threshold: 0, side: 'over' as const, decimalOdds: Number(c.odds_yes_decimal) || 1.0, stake: 0, market: 'country-props' };
                      addSelection(sel as any);
                    }}
                    style={{flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0.35rem', cursor: 'pointer', borderRadius: '8px', border: '2px solid #28a745', backgroundColor: 'rgba(40, 167, 69, 0.03)'}}
                  >
                    <div style={{fontSize: '1.15rem', color: '#0ff', fontWeight: 800, textTransform: 'uppercase'}}>YES</div>
                    <div style={{fontSize: '1.25rem', fontWeight: 900, color: '#fff'}}>{c.odds_yes_american}</div>
                    <div style={{fontSize: '0.75rem', color: '#999', marginTop: '0.15rem'}}>{(c.odds_yes_decimal || 0).toFixed(2)}</div>
                  </button>

                  <button
                    className="price-btn under"
                    onClick={() => {
                      const sel = { playerId: c.country_id, playerName: c.country, threshold: 0, side: 'under' as const, decimalOdds: Number(c.odds_no_decimal) || 1.0, stake: 0, market: 'country-props' };
                      addSelection(sel as any);
                    }}
                    style={{flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0.35rem', cursor: 'pointer', borderRadius: '8px', border: '2px solid #d97706', backgroundColor: 'rgba(217, 119, 6, 0.03)'}}
                  >
                    <div style={{fontSize: '1.15rem', color: '#d97706', fontWeight: 800, textTransform: 'uppercase'}}>NO</div>
                    <div style={{fontSize: '1.25rem', fontWeight: 900, color: '#fff'}}>{c.odds_no_american}</div>
                    <div style={{fontSize: '0.75rem', color: '#999', marginTop: '0.15rem'}}>{(c.odds_no_decimal || 0).toFixed(2)}</div>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {countries.length > 5 && (
          <div style={{textAlign: 'center', marginTop: '1.0rem'}}>
            <button className="market-tab" onClick={() => setExpanded(!expanded)}>{expanded ? 'Show less' : 'Show all'}</button>
          </div>
        )}
      </div>
    );
  }

  function MoneylineList() {
    const [data, setData] = useState<any | null>(null);
    const [loading, setLoading] = useState(false);
    const addSelection = useBetsStore((s) => s.addSelection);

    useEffect(() => {
      let mounted = true;
      const load = async () => {
        setLoading(true);
        try {
          const res = await fetchMoneylinesPrices();
          if (mounted) setData(res || null);
        } catch (e) {
          console.error('Failed to load moneylines', e);
          if (mounted) setData(null);
        } finally {
          if (mounted) setLoading(false);
        }
      };
      load();
      return () => { mounted = false; };
    }, []);

    if (loading) return <div style={{padding:8,color:'#999'}}>Loading moneylines...</div>;
    if (!data) return <div style={{padding:8,color:'#999'}}>Moneylines unavailable</div>;

    const sections = [
      { key: 'classic', label: 'Overall Winner', prefix: 'Overall Winner: ' },
      { key: 'firstRound', label: 'First Round Winner', prefix: 'First Round Winner: ' },
      { key: 'lastRound', label: 'Last Round Winner', prefix: 'Last Round Winner: ' },
    ];

    return (
      <div className="moneyline-list">
        {sections.map((sec) => {
          const list = data[sec.key] || [];
          return (
            <div key={sec.key} style={{marginBottom:12}}>
              <div style={{fontWeight:800, marginBottom:6, fontSize: '1.08rem', color: '#2b6cb0'}}>{sec.label}</div>
              <div style={{display:'grid', gridTemplateColumns: '1fr 1fr', gap:8}}>
                {list.map((entry: any) => (
                  <div key={`${sec.key}-${entry.player_id}`} className="player-card" style={{padding:'0.5rem', borderRadius:8}}>
                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                      <div style={{fontWeight:700}}>{entry.player}</div>
                      <button className="price-btn over" onClick={() => {
                        // For display in the betslip we set outcome to include the player name
                        // followed by the human-readable moneyline label (this is what the
                        // BetslipItem renders beneath the player name). The DB outcome is
                        // generated when placing the bet and uses the short "ML" suffix
                        // for first/last round (see BetSlip.tsx).
                        let displayOutcome = '';
                        // Build market string per user preference
                        let marketStr = 'Moneyline';
                        if (sec.key === 'classic') {
                          marketStr = `${entry.player} - Moneyline`;
                          displayOutcome = `${entry.player}: Moneyline`;
                        } else if (sec.key === 'firstRound') {
                          marketStr = `${entry.player}: First Round Moneyline`;
                          displayOutcome = `${entry.player}: First Round Moneyline`;
                        } else if (sec.key === 'lastRound') {
                          marketStr = `${entry.player}: Last Round Moneyline`;
                          displayOutcome = `${entry.player}: Last Round Moneyline`;
                        }
                        const sel = { playerId: entry.player_id, playerName: entry.player, threshold: null, side: 'win' as const, decimalOdds: Number(entry.decimal) || 1.0, stake: 0, market: marketStr, outcome: displayOutcome, odds_american: entry.american };
                        addSelection(sel as any);
                      }} style={{display:'flex', alignItems:'center', justifyContent:'center', padding:'0.35rem'}}>
                        <div className="odds-box">
                          <div className="price-large">{entry.american}</div>
                          <div className="price-small">{(Number(entry.decimal) || 1.0).toFixed(2)}</div>
                        </div>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  function SpecialsList() {
    const [rows, setRows] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const addSelection = useBetsStore((s) => s.addSelection);

    useEffect(() => {
      let mounted = true;
      const load = async () => {
        setLoading(true);
        try {
          const res = await fetchSpecialsPrices();
          const markets = (res && res.markets) || [];
          if (mounted) setRows(markets);
        } catch (e) {
          console.error('Failed to load specials', e);
          if (mounted) setRows([]);
        } finally {
          if (mounted) setLoading(false);
        }
      };
      load();
      return () => { mounted = false; };
    }, []);

    if (loading) return <div style={{padding:8,color:'#999'}}>Loading specials...</div>;
    if (!rows || rows.length === 0) return <div style={{padding:8,color:'#999'}}>No specials available</div>;

    return (
      <div style={{display:'grid', gap:8}}>
        {rows.map((r: any) => {
          // parse American odds string to decimal for betslip
          let amerRaw = r.odds;
          let amerInt: number | null = null;
          let dec = 1.0;
          try {
            const s = String(amerRaw || '').replace('+', '').trim();
            amerInt = s === '' ? null : parseInt(s, 10);
            if (amerInt !== null && !isNaN(amerInt)) dec = americanToDecimal(amerInt);
          } catch (e) {
            dec = 1.0;
          }

          return (
            <div key={`spec-${r.betid || r.betId || r.id || r.outcome}`} className="player-card" style={{padding: '0.5rem', borderRadius:8}}>
              <div style={{display:'grid', gridTemplateColumns: '1fr 140px', alignItems: 'center', gap: 8}}>
                <div style={{fontSize: '1.8rem', fontWeight: 900}}>{r.outcome}</div>
                <div style={{display:'flex', justifyContent:'flex-end'}}>
                      <button className="price-btn over" onClick={() => {
                        const sel = { playerId: null, playerName: null, threshold: null, side: 'special' as const, decimalOdds: dec, stake: 0, market: 'Specials', outcome: r.outcome, odds_american: (r.odds || '').toString() };
                        addSelection(sel as any);
                      }} style={{minWidth:140, display:'flex', alignItems:'center', justifyContent:'center'}}>
                    <div className="odds-box">
                      <div className="price-large">{r.odds}</div>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  const handleMarketChange = (m: 'totals' | 'first-guess' | 'last-guess' | 'country-props') => {
    if (m === market) return;
    setMarket(m);

    // when switching to first-guess, compute default per-player threshold (nearest 300 to mean/5)
    if (m === 'first-guess' || m === 'last-guess') {
      // compute per-player default FG threshold (nearest 300, clamped to FG_THRESHOLDS)
      setGeoPlayers((prev) => prev.map((p) => {
        const mu = p.mean_score || 0;
        const defaultThresh = Math.max(FG_THRESHOLDS[0], Math.min(FG_THRESHOLDS[FG_THRESHOLDS.length - 1], Math.round((mu / 5.0) / 300.0) * 300));
        // set the slider position for first-guess to the computed default (do not null out first_guess_line)
        return { ...p, current_threshold: defaultThresh, /* keep or will be replaced by updatePlayerPrice */ };
      }));

      // immediately request first-guess prices for each player using the computed FG range
      {
        const snapshot = geoPlayers || [];
        snapshot.forEach((p) => {
          const mu = p.mean_score || 0;
          const defaultThresh = Math.max(FG_THRESHOLDS[0], Math.min(FG_THRESHOLDS[FG_THRESHOLDS.length - 1], Math.round((mu / 5.0) / 300.0) * 300));
          updatePlayerPrice(p.player_id, defaultThresh);
        });
      }
    } else {
      // switching back to totals: restore each player's default threshold from server-initialized default if available
      setGeoPlayers((prev) => prev.map((p) => ({ ...p, current_threshold: p.default_threshold || p.current_threshold, line: p.initial || p.line })));
    }
  };

  return (
    <div className="geoguessr-page">
      <Navbar />

      <main className="geoguessr-main">
        <div className="geoguessr-header">
          <div className="geoguessr-title-section">
            <h1 className="geoguessr-title">GeoGuessr Odds</h1>
            <p className="geoguessr-subtitle">Select thresholds and place bets on player performance</p>
          </div>
        </div>

        <div className="geoguessr-layout">
          {/* Market Ribbon at Top */}
          <div className="market-ribbon">
            <button className={`market-tab ${market === 'totals' ? 'active' : ''}`} onClick={() => handleMarketChange('totals')}>Totals</button>
            <button className="market-tab" disabled>Spreads (coming)</button>
            <button className={`market-tab ${market === 'first-guess' ? 'active' : ''}`} onClick={() => handleMarketChange('first-guess')}>First Guess Points</button>
            <button className={`market-tab ${market === 'last-guess' ? 'active' : ''}`} onClick={() => handleMarketChange('last-guess')}>Last Guess Points</button>
            <button className={`market-tab ${market === 'country-props' ? 'active' : ''}`} onClick={() => handleMarketChange('country-props')}>Country Props</button>
            <button className={`market-tab ${market === 'moneyline' ? 'active' : ''}`} onClick={() => setMarket('moneyline')}>Moneyline</button>
            <button className={`market-tab ${market === 'specials' ? 'active' : ''}`} onClick={() => setMarket('specials')}>Specials</button>
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
                {market === 'country-props' ? (
                  <div className="country-props">
                    <h3 className="country-props-heading">To Appear</h3>
                    <div className="country-props-list">
                      {/* show top 5, expandable */}
                      <CountryPropsList />
                    </div>

                    <div style={{marginTop:12}}>
                      <h3 className="country-props-heading">Continent Totals</h3>
                      <div style={{marginTop:8}}>
                        <ContinentPropsList />
                      </div>
                    </div>
                  </div>
                ) : market === 'moneyline' ? (
                  <div className="moneyline-panel">
                    <MoneylineList />
                  </div>
                ) : market === 'specials' ? (
                  <div className="specials-panel">
                    <SpecialsList />
                  </div>
                ) : (
                <div className="players-list">
                  {market === 'first-guess' && (
                    <h3 className="country-props-heading">First Round Totals</h3>
                  )}
                  {market === 'last-guess' && (
                    <h3 className="country-props-heading">Last Round Totals</h3>
                  )}
                  {geoPlayers.map((p: any) => (
                    <div key={p.player_id} className="player-card">
                      <div className="player-top">
                        <div className="player-name" style={{fontSize: '1.6rem', fontWeight:600}}>{p.name} <span style={{fontSize:'1rem',color:'#999'}}>({p.screenname})</span></div>
                        <div className="player-mean" style={{fontSize:'1.1rem',color:'#666'}}>μ {Math.round(p.mean_score || 0)}</div>
                      </div>

                            <div className="player-slider">
                              <input
                                type="range"
                                min={market === 'totals' ? (thresholdList[0] || 7500) : FG_THRESHOLDS[0]}
                                max={market === 'totals' ? (thresholdList[thresholdList.length - 1] || 23000) : FG_THRESHOLDS[FG_THRESHOLDS.length - 1]}
                                step={market === 'totals' ? 500 : 300}
                                value={p.current_threshold}
                                onChange={(e) => {
                                  const v = Number(e.target.value);
                                  setGeoPlayers((prev) => prev.map((x) => (x.player_id === p.player_id ? { ...x, current_threshold: v } : x)));
                                  updatePlayerPrice(p.player_id, v);
                                }}
                              />
                              <div className="slider-value" style={{fontSize:'1.5rem',fontWeight:700}}>{p.current_threshold}</div>
                            </div>

                      <div className="player-prices">
                        {(() => {
                          const displayedLine = (market === 'first-guess' || market === 'last-guess') ? (p.first_guess_line || p.line) : p.line;
                          return (
                            <>
                              <button className="price-btn over" disabled={!!isUpdatingOdds[p.player_id]} onClick={() => {
                                if (isUpdatingOdds[p.player_id]) return;
                                const sel = { playerId: p.player_id, playerName: p.name, threshold: p.current_threshold, side: 'over' as const, decimalOdds: Number(displayedLine?.odds_over_decimal) || 1.0, stake: 0, market };
                                addSelection(sel as any);
                              }}>
                                <div className="odds-box">
                                  <div className="price-large">{displayedLine ? displayedLine.odds_over_american : '—'}</div>
                                  <div className="price-small">{displayedLine ? (Number(displayedLine.odds_over_decimal || displayedLine.odds_over || 0)).toFixed(2) : ''}</div>
                                </div>
                              </button>

                              <button className="price-btn under" disabled={!!isUpdatingOdds[p.player_id]} onClick={() => {
                                if (isUpdatingOdds[p.player_id]) return;
                                const sel = { playerId: p.player_id, playerName: p.name, threshold: p.current_threshold, side: 'under' as const, decimalOdds: Number(displayedLine?.odds_under_decimal) || 1.0, stake: 0, market };
                                addSelection(sel as any);
                              }}>
                                <div className="odds-box">
                                  <div className="price-large">{displayedLine ? displayedLine.odds_under_american : '—'}</div>
                                  <div className="price-small">{displayedLine ? (Number(displayedLine.odds_under_decimal || displayedLine.odds_under || 0)).toFixed(2) : ''}</div>
                                </div>
                              </button>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  ))}
                </div>
                )}
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
      <Footer />
    </div>
  );
}
