import React, { useEffect, useState } from 'react';
import { mbDraw, mbGsPokerDeck } from '../../lib/api/api';
import './NativeGames.css';

const API_ORIGIN = (import.meta.env.VITE_API_URL || 'http://localhost:4000/api').replace(/\/api\/?$/, '');

const SUITS = [
  { s: '♠', color: 'black' },
  { s: '♥', color: 'red' },
  { s: '♦', color: 'red' },
  { s: '♣', color: 'black' },
];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function rand(n: number) {
  return Math.floor(Math.random() * n);
}

interface Props {
  roundId: number;
  isHost: boolean;
  drawKind?: string | null;
  drawState?: any;
}

// Renders the current published draw for everyone; host also gets draw controls.
export default function NativeGames({ roundId, isHost, drawKind, drawState }: Props) {
  const [count, setCount] = useState(3);
  const [busy, setBusy] = useState(false);
  const [gsDeck, setGsDeck] = useState<any[]>([]);
  const [kind, setKind] = useState<string>(drawKind || 'cards');

  useEffect(() => {
    if (drawKind) setKind(drawKind);
  }, [drawKind]);

  const loadGs = async () => {
    if (gsDeck.length) return gsDeck;
    try {
      const r = await mbGsPokerDeck();
      const cards = r.cards || [];
      setGsDeck(cards);
      return cards;
    } catch {
      return [];
    }
  };

  const publish = async (k: string, payload: any) => {
    setBusy(true);
    try {
      await mbDraw(roundId, k, { ...payload, nonce: `${Date.now()}-${rand(1e6)}` });
    } catch (e) {
      console.error('draw publish failed', e);
    } finally {
      setBusy(false);
    }
  };

  const drawCoin = () => publish('coin', { result: rand(2) === 0 ? 'H' : 'T' });

  const drawDice = () =>
    publish('dice', { dice: Array.from({ length: count }, () => 1 + rand(6)) });

  const draw52 = () => {
    // sample `count` distinct cards
    const deck: { rank: string; suit: string; color: string }[] = [];
    for (const su of SUITS) for (const r of RANKS) deck.push({ rank: r, suit: su.s, color: su.color });
    const picked: any[] = [];
    const used = new Set<number>();
    while (picked.length < Math.min(count, 52)) {
      const i = rand(deck.length);
      if (used.has(i)) continue;
      used.add(i);
      picked.push(deck[i]);
    }
    publish('cards', { cards: picked });
  };

  const drawGs = async () => {
    const deck = await loadGs();
    if (!deck.length) return;
    const picked: any[] = [];
    const used = new Set<number>();
    while (picked.length < Math.min(count, deck.length)) {
      const i = rand(deck.length);
      if (used.has(i)) continue;
      used.add(i);
      picked.push(deck[i]);
    }
    publish('gspoker', { cards: picked });
  };

  const doDraw = () => {
    if (kind === 'coin') drawCoin();
    else if (kind === 'dice') drawDice();
    else if (kind === 'cards') draw52();
    else if (kind === 'gspoker') drawGs();
  };

  return (
    <div className="ng-wrap">
      {isHost && (
        <div className="ng-controls">
          <div className="ng-kind-tabs">
            {[
              ['coin', '🪙 Coin'],
              ['dice', '🎲 Dice'],
              ['cards', '🂡 52-Card'],
              ['gspoker', '🎓 GS Poker'],
            ].map(([k, label]) => (
              <button
                key={k}
                className={`ng-kind ${kind === k ? 'active' : ''}`}
                onClick={() => setKind(k)}
              >
                {label}
              </button>
            ))}
          </div>
          {(kind === 'dice' || kind === 'cards' || kind === 'gspoker') && (
            <label className="ng-count">
              How many
              <input
                type="number"
                min={1}
                max={kind === 'cards' ? 52 : kind === 'gspoker' ? 16 : 10}
                value={count}
                onChange={(e) => setCount(Math.max(1, parseInt(e.target.value) || 1))}
              />
            </label>
          )}
          <button className="ng-draw-btn" onClick={doDraw} disabled={busy}>
            {drawState ? 'Redraw' : 'Draw'}
          </button>
        </div>
      )}

      <div className="ng-stage" key={drawState?.nonce || 'empty'}>
        {!drawState ? (
          <div className="ng-empty">{isHost ? 'Pick a game and draw.' : 'Waiting for the host to draw…'}</div>
        ) : drawKind === 'coin' ? (
          <div className={`ng-coin ${drawState.result === 'H' ? 'heads' : 'tails'}`}>
            <div className="ng-coin-face ng-coin-h">H</div>
            <div className="ng-coin-face ng-coin-t">T</div>
          </div>
        ) : drawKind === 'dice' ? (
          <div className="ng-dice-block">
            <div className="ng-dice-row">
              {(drawState.dice || []).map((d: number, i: number) => (
                <div className="ng-die" style={{ animationDelay: `${i * 0.08}s` }} key={i}>
                  {'⚀⚁⚂⚃⚄⚅'[d - 1]}
                </div>
              ))}
            </div>
            {(drawState.dice || []).length > 0 && (
              <div className="ng-dice-total">
                <span className="ng-dice-total-label">TOTAL</span>
                <span className="ng-dice-total-val">
                  {(drawState.dice || []).reduce((a: number, b: number) => a + b, 0)}
                </span>
              </div>
            )}
          </div>
        ) : drawKind === 'cards' ? (
          <div className="ng-cards-row">
            {(drawState.cards || []).map((c: any, i: number) => (
              <div className={`ng-card ${c.color}`} style={{ animationDelay: `${i * 0.1}s` }} key={i}>
                <span className="ng-card-rank">{c.rank}</span>
                <span className="ng-card-suit">{c.suit}</span>
              </div>
            ))}
          </div>
        ) : drawKind === 'gspoker' ? (
          <div className="ng-cards-row">
            {(drawState.cards || []).map((c: any, i: number) => (
              <div className="ng-gscard" style={{ animationDelay: `${i * 0.1}s` }} key={i}>
                {c.img_filename ? (
                  <img src={`${API_ORIGIN}/goodshepherd/${c.img_filename}`} alt={c.name} />
                ) : (
                  <div className="ng-gscard-noimg">{c.name}</div>
                )}
                <div className="ng-gscard-name">{c.name}</div>
                <div className="ng-gscard-meta">{c.house} · {c.sport || '—'}</div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
