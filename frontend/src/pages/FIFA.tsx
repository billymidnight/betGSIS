import React, { useEffect, useState } from 'react';
import BetSlip from '../components/GeoGuessr/BetSlip';
import { fetchFifaBoard } from '../lib/api/api';
import { useBetsStore } from '../lib/state/betsStore';
import './GeoGuessr.css';
import './FIFA.css';

interface Price {
  key: string;
  top: string;      // big bold betslip line, e.g. "Pam ML"
  label: string;    // button label, e.g. "Pam" / "Draw" / "Pam -1.5"
  prob: number;
  decimal: number;
  american: string;
  lock?: boolean;
}

interface PropMarket {
  key: string;
  title: string;
  kind: 'ou' | 'spread';
  over?: Price;
  under?: Price;
  rows?: { line: number; home?: Price; away?: Price }[];
}

interface Game {
  game_id: number;
  home: { player_id: number; name: string; screenname?: string };
  away: { player_id: number; name: string; screenname?: string };
  matchup: string;    // "Pam vs. Sohan FIFA"
  tab_label: string;  // "Pam vs. Sohan"
  moneyline: Price[];
  double_chance: Price[];
  draw_no_bet: Price[];
  prop_markets?: PropMarket[];
}

export default function FIFA() {
  const [games, setGames] = useState<Game[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const addSelection = useBetsStore((s) => s.addSelection);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetchFifaBoard();
        setGames(Array.isArray(res?.games) ? res.games : []);
      } catch (err) {
        console.error('Failed to load FIFA board', err);
        setError('Failed to load FIFA odds');
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const game = games[activeIdx];

  const pick = (g: Game, p: Price) => {
    if (p.lock) return;               // locked market — not bettable
    const sel = {
      playerId: g.game_id,          // game_id keeps betslip ids unique per game
      playerName: p.top,            // BIG BOLD line: "Pam ML" / "Pam -1.5"
      threshold: g.matchup,         // sub line: "Pam vs. Sohan FIFA"
      side: p.key,                  // unique per selection
      decimalOdds: Number(p.decimal) || 1.0,
      stake: 0,
      market: 'fifa',
      odds_american: p.american || '',
    };
    addSelection(sel as any);
  };

  // One price box (lock-aware). Optional custom label shown instead of p.label.
  const box = (g: Game, p?: Price, labelOverride?: string) => {
    if (!p) return <div className="fifa-price-btn fifa-price-empty" />;
    if (p.lock) {
      return (
        <button className="fifa-price-btn fifa-locked" disabled>
          <div className="fifa-price-label">{labelOverride ?? p.label}</div>
          <div className="fifa-lock">🔒</div>
        </button>
      );
    }
    return (
      <button className="fifa-price-btn" onClick={() => pick(g, p)}>
        <div className="fifa-price-label">{labelOverride ?? p.label}</div>
        <div className="fifa-price-american">{p.american || '—'}</div>
        <div className="fifa-price-decimal">({(Number(p.decimal) || 1.0).toFixed(2)})</div>
      </button>
    );
  };

  // Horizontal boxes (Moneyline, Draw No Bet, Over/Under props)
  const renderRow = (g: Game, prices: Price[]) => (
    <div className="fifa-price-row">{prices.map((p) => <React.Fragment key={p.key}>{box(g, p)}</React.Fragment>)}</div>
  );

  // Rowwise (Double Chance): outcome label left, price right, one per line
  const renderRowwise = (g: Game, prices: Price[]) => (
    <div className="fifa-rowwise">
      {prices.map((p) => (
        <div key={p.key} className={`fifa-line-row ${p.lock ? 'fifa-locked-row' : ''}`}
             onClick={() => pick(g, p)} role="button">
          <div className="fifa-line-label">{p.label}</div>
          {p.lock ? (
            <div className="fifa-line-price fifa-lock">🔒</div>
          ) : (
            <div className="fifa-line-price">
              <span className="fifa-line-american">{p.american || '—'}</span>
              <span className="fifa-line-decimal">({(Number(p.decimal) || 1.0).toFixed(2)})</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );

  const renderProp = (g: Game, m: PropMarket) => {
    if (m.kind === 'ou') {
      return (
        <div className="fifa-market" key={m.key}>
          <div className="fifa-market-title">{m.title}</div>
          <div className="fifa-price-row">
            {box(g, m.over)}
            {box(g, m.under)}
          </div>
        </div>
      );
    }
    // spread: each line is a row with home + away boxes
    return (
      <div className="fifa-market" key={m.key}>
        <div className="fifa-market-title">{m.title}</div>
        <div className="fifa-spread">
          {(m.rows || []).map((r, i) => (
            <div className="fifa-price-row" key={i}>
              {box(g, r.home)}
              {box(g, r.away)}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="geoguessr-main">
      <div className="geoguessr-header">
        <div className="geoguessr-title-section">
          <h1 className="geoguessr-title">Esports: FIFA</h1>
          <p className="geoguessr-subtitle">Head-to-head FIFA markets — Moneyline, Double Chance, Draw No Bet</p>
        </div>
      </div>

      <div className="geoguessr-layout">
          {/* Ribbon of active games */}
          <div className="market-ribbon">
            {games.map((g, i) => (
              <button
                key={g.game_id}
                className={`market-tab ${i === activeIdx ? 'active' : ''}`}
                onClick={() => setActiveIdx(i)}
              >
                {g.tab_label}
              </button>
            ))}
          </div>

          <div className="geoguessr-content">
            {error && <div className="geoguessr-error">{error}</div>}

            {isLoading ? (
              <div className="geoguessr-loading">
                <div className="spinner" />
                <p>Loading odds...</p>
              </div>
            ) : !game ? (
              <div className="fifa-empty">
                <span className="fifa-empty-emoji">⚽</span>
                <div className="fifa-empty-text">No active games.</div>
                <div className="muted">Mark a game active in fifa_games to see it here.</div>
              </div>
            ) : (
              <div className="fifa-board">
                <div className="fifa-matchup-title">
                  <span className="fifa-mt-name">{game.home.name}</span>
                  {game.home.screenname && <span className="fifa-mt-screen"> ({game.home.screenname})</span>}
                  <span className="fifa-mt-vs"> vs. </span>
                  <span className="fifa-mt-name">{game.away.name}</span>
                  {game.away.screenname && <span className="fifa-mt-screen"> ({game.away.screenname})</span>}
                </div>

                <div className="fifa-market">
                  <div className="fifa-market-title">Moneyline</div>
                  {renderRow(game, game.moneyline)}
                </div>

                <div className="fifa-market">
                  <div className="fifa-market-title">Double Chance</div>
                  {renderRowwise(game, game.double_chance)}
                </div>

                <div className="fifa-market">
                  <div className="fifa-market-title">Draw No Bet</div>
                  {renderRow(game, game.draw_no_bet)}
                </div>

                {(game.prop_markets || []).map((m) => renderProp(game, m))}
              </div>
            )}
          </div>

          <div className="geoguessr-betslip">
            <BetSlip />
          </div>
        </div>
    </div>
  );
}
