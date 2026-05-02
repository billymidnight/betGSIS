import React, { useEffect, useMemo, useRef, useState } from 'react';
import { HorseInField, RaceTrajectory } from '../../lib/api/api';
import { CountryFlag } from './CountryFlag';
import { HorseSprite } from './HorseSprite';

const COUNTDOWN_MS = 2200;
const POST_FINISH_LINGER_MS = 1500;

function fmtSec(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`;
}

// ═══════════════════════════════════════════════════════════════════════
// RaceAnimation — the Churchill Downs visual track lifted from
// HorseRacing.RaceView and stripped of Audio + commentary + bets-panel.
// Drives a single requestAnimationFrame loop and absolute-positions each
// runner inside its lane based on the trajectory's normalised positions.
// Calls onFinished() once the last horse has crossed (used by the host
// to auto-fire settle).
// ═══════════════════════════════════════════════════════════════════════
export function RaceAnimation({
  field, trajectory, onFinished, label, eyebrow,
}: {
  field: HorseInField[];
  trajectory: RaceTrajectory;
  onFinished?: () => void;
  label?: string;
  eyebrow?: string;
}) {
  const [phase, setPhase] = useState<'countdown' | 'racing' | 'finished'>('countdown');
  const [countdown, setCountdown] = useState(Math.ceil(COUNTDOWN_MS / 1000));
  const [clockMs, setClockMs] = useState(0);
  const [liveFinishes, setLiveFinishes] = useState<{ horse_id: number; finish_ms: number; place: number }[]>([]);

  const runnerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const startedAtRef = useRef<number | null>(null);
  const racingStartedRef = useRef<number | null>(null);
  const finishedSetRef = useRef<Set<number>>(new Set());
  const finishedFiredRef = useRef(false);

  // Map field index → trajectory column.
  const trajIdxByHorseId = useMemo(() => {
    const m: Record<number, number> = {};
    trajectory.horse_ids.forEach((id, i) => { m[id] = i; });
    return m;
  }, [trajectory]);

  const positionAt = (horseId: number, tMs: number): number => {
    const idx = trajIdxByHorseId[horseId];
    const times = trajectory.sample_times_ms;
    if (!times || times.length === 0) return 0;
    if (tMs <= times[0]) return trajectory.positions[0][idx];
    if (tMs >= times[times.length - 1]) return trajectory.positions[times.length - 1][idx];
    let lo = 0, hi = times.length - 1;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (times[mid] <= tMs) lo = mid;
      else hi = mid;
    }
    const t0 = times[lo], t1 = times[hi];
    const a = (tMs - t0) / (t1 - t0);
    return trajectory.positions[lo][idx] * (1 - a) + trajectory.positions[hi][idx] * a;
  };

  useEffect(() => {
    let rafId = 0;
    const tick = (now: number) => {
      if (startedAtRef.current == null) startedAtRef.current = now;
      const since = now - startedAtRef.current;

      if (since < COUNTDOWN_MS) {
        const remain = Math.max(0, COUNTDOWN_MS - since);
        setCountdown(Math.ceil(remain / 1000));
      } else {
        if (racingStartedRef.current == null) {
          racingStartedRef.current = now;
          setPhase('racing');
        }
        const raceMs = now - racingStartedRef.current;
        setClockMs(raceMs);

        for (const h of field) {
          const el = runnerRefs.current[h.post_position - 1];
          const pos = Math.min(positionAt(h.horse_id, raceMs), 1.02);
          if (el) el.style.left = `${pos * 100}%`;
        }

        for (const f of trajectory.finishes) {
          if (raceMs >= f.finish_ms && !finishedSetRef.current.has(f.horse_id)) {
            finishedSetRef.current.add(f.horse_id);
            setLiveFinishes((cur) => [
              ...cur,
              { horse_id: f.horse_id, finish_ms: f.finish_ms, place: cur.length + 1 },
            ]);
          }
        }

        if (finishedSetRef.current.size === field.length) {
          setPhase('finished');
          if (raceMs >= trajectory.duration_ms + POST_FINISH_LINGER_MS) {
            if (!finishedFiredRef.current) {
              finishedFiredRef.current = true;
              try { onFinished?.(); } catch { /* swallow */ }
            }
            return;          // stop the RAF loop
          }
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const horsesByPost = [...field].sort((a, b) => a.post_position - b.post_position);

  return (
    <div className="hr-race">
      <div className="hr-race-crowd" aria-hidden>
        <div className="hr-race-crowd-row hr-race-crowd-row-back" />
        <div className="hr-race-crowd-row hr-race-crowd-row-mid" />
        <div className="hr-race-crowd-row hr-race-crowd-row-front" />
        <div className="hr-race-stadium-rail" />
      </div>

      <header className="hr-race-head">
        <div className="hr-race-banner">
          {eyebrow && <span className="hr-eyebrow">{eyebrow}</span>}
          <h1>
            {phase === 'countdown' ? 'At the gate'
              : phase === 'racing' ? 'And they’re off!'
              : (label || 'Across the wire')}
          </h1>
        </div>
        <div className={`hr-race-clock ${phase === 'racing' ? 'is-running' : ''}`}>
          <span className="hr-race-clock-label">Race clock</span>
          <span className="hr-race-clock-value">{(clockMs / 1000).toFixed(2)}s</span>
        </div>
      </header>

      <div className="hr-race-track">
        <div className="hr-race-finish" aria-hidden>
          <div className="hr-race-finish-flag" />
          <div className="hr-race-finish-text">FINISH</div>
        </div>
        <div className="hr-race-startline" aria-hidden />

        <div className="hr-race-lanes">
          {horsesByPost.map((h, i) => {
            const isFinished = finishedSetRef.current.has(h.horse_id);
            return (
              <div key={h.horse_id} className={`hr-race-lane ${isFinished ? 'is-finished' : ''}`}>
                <div className="hr-race-lane-info">
                  <div className="hr-race-lane-num" style={{ background: h.silks_color }}>
                    {h.post_position}
                  </div>
                  <div className="hr-race-lane-names">
                    <span className="hr-race-lane-fullname">
                      {h.full_name}
                      <CountryFlag iso={h.country} />
                    </span>
                    <span className="hr-race-lane-nickname">({h.saddle_name})</span>
                  </div>
                </div>
                <div className={`hr-race-gate ${phase === 'countdown' ? 'is-shut' : 'is-open'}`} aria-hidden>
                  <div className="hr-race-gate-bar hr-race-gate-bar-l" />
                  <div className="hr-race-gate-bar hr-race-gate-bar-r" />
                </div>
                <div className="hr-race-lane-track">
                  <div
                    className="hr-race-runner-wrap"
                    ref={(el) => { runnerRefs.current[i] = el; }}
                  >
                    <HorseSprite
                      silksColor={h.silks_color}
                      postNumber={h.post_position}
                      racing={phase === 'racing'}
                    />
                    <div className="hr-race-runner-shadow" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="hr-race-bottom" style={{ justifyContent: 'flex-end' }}>
        <aside className="hr-race-board">
          <header>
            <h3>Photo finish board</h3>
            <span>Live</span>
          </header>
          <ol className="hr-race-board-list">
            {liveFinishes.map((f) => {
              const horse = field.find((h) => h.horse_id === f.horse_id);
              return (
                <li key={f.horse_id} className="hr-race-board-row">
                  <span className="hr-race-board-place">P{f.place}</span>
                  <span className="hr-race-board-saddle" style={{ background: horse?.silks_color }}>
                    {horse?.post_position}
                  </span>
                  <span className="hr-race-board-name">{horse?.full_name}</span>
                  <span className="hr-race-board-time">{fmtSec(f.finish_ms)}</span>
                </li>
              );
            })}
            {liveFinishes.length === 0 && (
              <li className="hr-race-board-empty">Waiting on the first to cross…</li>
            )}
          </ol>
        </aside>
      </div>

      {phase === 'countdown' && (
        <div className="hr-race-countdown" aria-hidden>
          <span>{countdown > 0 ? countdown : 'GO!'}</span>
        </div>
      )}
    </div>
  );
}
