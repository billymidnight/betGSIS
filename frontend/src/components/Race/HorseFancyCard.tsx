import React, { useState } from 'react';
import { Horse } from '../../lib/api/api';
import { CountryFlag } from './CountryFlag';

const EDITION_BASE_YEAR = 1707;
function ordinalSuffix(n: number): string {
  const v = Math.abs(n) % 100;
  if (v >= 11 && v <= 13) return 'th';
  switch (v % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}
function fmtEdition(year: number): string {
  const ed = year - EDITION_BASE_YEAR + 1;
  return `${ed}${ordinalSuffix(ed)} Edition · ${year}`;
}

/** The fancy single-horse card lifted from the HorseRacing catalogue.
 *  Used by Cheltenham's "Show Card" buttons on the field strip. */
export function HorseFancyCard({ horse, onBack }: { horse: Horse; onBack: () => void }) {
  const stats = horse.stats;
  const allResults = stats?.all_results ?? [];
  const last5 = stats?.last_5_results ?? allResults.slice(0, 5);

  const [allExpanded, setAllExpanded] = useState(false);
  const visibleAll = allExpanded ? allResults : allResults.slice(0, 3);

  const moodLabel = (sigma: number) => {
    if (sigma < 0.18) return 'Steady';
    if (sigma < 0.26) return 'Honest';
    if (sigma < 0.32) return 'Streaky';
    return 'Volatile';
  };
  const composureLabel = (alpha: number) => {
    if (alpha < 0.88) return 'Restless';
    if (alpha < 0.93) return 'Even';
    if (alpha < 0.97) return 'Composed';
    return 'Locked-in';
  };

  const participations = stats?.participations ?? 0;
  const wins  = stats?.wins  ?? 0;
  const shows = stats?.shows ?? 0;
  const winRate  = participations > 0 ? wins  / participations : null;
  const showRate = participations > 0 ? shows / participations : null;
  const fmtPct = (r: number | null) => r === null ? '—' : `${(r * 100).toFixed(1)}%`;
  const fmtRatio = (top: number, bottom: number) =>
    bottom === 0 ? '—' : `${top}/${bottom} = ${(top / bottom).toFixed(3)}`;

  return (
    <div className="hr-fancy-card">
      <button className="hr-link-back" onClick={onBack}>← Back</button>

      <header className="hr-fancy-head">
        <div
          className="hr-fancy-saddle"
          style={{ background: horse.silks_color }}
          title={`Silks · ${horse.silks_color}`}
        >
          <span className="hr-fancy-saddle-nick">{horse.saddle_name}</span>
        </div>
        <div className="hr-fancy-head-titles">
          <h2>
            {horse.full_name}
            <CountryFlag iso={horse.country} />
          </h2>
          <p className="hr-fancy-head-sub">
            {horse.country ? `Representing ${horse.country}` : 'Catalogue Profile'}
          </p>
        </div>
      </header>

      <section className="hr-fancy-strip">
        <div>
          <span>Speed</span>
          <strong>{horse.mean_speed.toFixed(2)}</strong>
          <em>μ</em>
        </div>
        <div>
          <span>Volatility</span>
          <strong>{moodLabel(horse.speed_volatility)}</strong>
          <em>σ {horse.speed_volatility.toFixed(2)}</em>
        </div>
        <div>
          <span>Composure</span>
          <strong>{composureLabel(horse.pace_stickiness)}</strong>
          <em>α {horse.pace_stickiness.toFixed(2)}</em>
        </div>
      </section>

      <section className="hr-fancy-block">
        <h3>Key Stats</h3>
        <div className="hr-fancy-keystats">
          <div><span>Participations</span><strong>{participations}</strong></div>
          <div><span>Wins</span><strong>{wins}</strong></div>
          <div><span>Places</span><strong>{stats?.places ?? 0}</strong></div>
          <div><span>Shows</span><strong>{shows}</strong></div>
        </div>
      </section>

      {horse.description && (
        <section className="hr-fancy-block">
          <h3>Bio</h3>
          <p className="hr-fancy-bio">{horse.description}</p>
        </section>
      )}

      <section className="hr-fancy-block">
        <h3>Conversion Rates</h3>
        <div className="hr-fancy-rates">
          <div>
            <span>Wins per Participation</span>
            <strong>{fmtRatio(wins, participations)}</strong>
            <em>{fmtPct(winRate)}</em>
          </div>
          <div>
            <span>Shows per Participation</span>
            <strong>{fmtRatio(shows, participations)}</strong>
            <em>{fmtPct(showRate)}</em>
          </div>
        </div>
      </section>

      <section className="hr-fancy-block">
        <h3>Last {last5.length} Race{last5.length === 1 ? '' : 's'}</h3>
        {last5.length === 0 ? (
          <p className="hr-fancy-empty">No prior race results on record yet.</p>
        ) : (
          <table className="hr-stats-table hr-fancy-table">
            <thead>
              <tr><th>Edition</th><th>Finish</th><th className="hr-stats-num">Time</th></tr>
            </thead>
            <tbody>
              {last5.map((r) => (
                <tr key={`l5-${r.year}`} className={r.finish_position === 1 ? 'is-winner' : ''}>
                  <td>{fmtEdition(r.year)}</td>
                  <td>P{r.finish_position}</td>
                  <td className="hr-stats-num">{r.finish_seconds.toFixed(2)}s</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="hr-fancy-block">
        <h3>Personal Records</h3>
        <div className="hr-fancy-records">
          <div className="is-best">
            <span>Best Time Ever</span>
            <strong>{stats?.best_seconds != null ? `${stats.best_seconds.toFixed(2)}s` : '—'}</strong>
            <em>{stats?.best_year != null ? fmtEdition(stats.best_year) : '—'}</em>
          </div>
          <div className="is-worst">
            <span>Worst Time Ever</span>
            <strong>{stats?.worst_seconds != null ? `${stats.worst_seconds.toFixed(2)}s` : '—'}</strong>
            <em>{stats?.worst_year != null ? fmtEdition(stats.worst_year) : '—'}</em>
          </div>
        </div>
      </section>

      <section className="hr-fancy-block">
        <h3>All Races on Record ({allResults.length})</h3>
        {allResults.length === 0 ? (
          <p className="hr-fancy-empty">No race history recorded yet.</p>
        ) : (
          <>
            <table className="hr-stats-table hr-fancy-table">
              <thead><tr><th>Edition</th><th>Finish</th><th className="hr-stats-num">Time</th></tr></thead>
              <tbody>
                {visibleAll.map((r) => (
                  <tr key={`all-${r.year}`} className={r.finish_position === 1 ? 'is-winner' : ''}>
                    <td>{fmtEdition(r.year)}</td>
                    <td>P{r.finish_position}</td>
                    <td className="hr-stats-num">{r.finish_seconds.toFixed(2)}s</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {allResults.length > 3 && (
              <button className="hr-stats-expand" onClick={() => setAllExpanded((v) => !v)}>
                {allExpanded ? 'Show latest 3 only' : `Show all ${allResults.length} races`}
              </button>
            )}
          </>
        )}
      </section>
    </div>
  );
}
