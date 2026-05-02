import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchCommentary,
  fetchHorses,
  fetchRaceOdds,
  fetchRacingStats,
  fetchRacingLocks,
  finishRace,
  runRace,
  setupRace,
  fetchBettors,
  persistMultiBets,
  BettorOption,
  CommentaryClip,
  Horse,
  HorseInField,
  OddsQuote,
  RaceOdds,
  RaceTrajectory,
  StatsResponse,
} from '../lib/api/api';
import { useAuthStore } from '../lib/state/authStore';
import './HorseRacing.css';

type View = 'venue' | 'setup' | 'racebook' | 'preRace' | 'race' | 'settlement' | 'stats';
type OddsFormat = 'american' | 'decimal';

// One bettor's view of the upcoming race — bankroll, the bets they've
// confirmed, and identity (so the bookie can run for many people in one
// race). The first session is always the logged-in user themself; bookies
// can stack additional sessions for other users via "Run for Another".
interface BettorSession {
  user_id:     string;            // supabase user_id (UUID) or 'guest' for unauthed
  screen_name: string;            // for display in tabs / pills
  bankroll:    number;            // starting bankroll for THIS session
  bets:        any[];             // LiveBet[] — typed `any` here because LiveBet is declared further down the file
  confirmed:   boolean;           // true once the bettor has reviewed + confirmed
}

const STARTING_BANKROLL = 100;

// Backend base URL (strip /api suffix) — used for static image references.
const getBackendBaseUrl = () => {
  const apiUrl = import.meta.env.VITE_API_URL;
  if (apiUrl) return apiUrl.replace(/\/api$/, '');
  return 'http://localhost:4000';
};
const API_BASE = getBackendBaseUrl();

// Background imagery (lives in backend/horses/)
const MAIN_BG_URL = `${API_BASE}/horses/mainbg.jpg`;
const CHURCHILL_THUMB_URL = `${API_BASE}/horses/churchilldowns_thumbnail.jpg`;
const CHELTENHAM_THUMB_URL = `${API_BASE}/horses/cheltenham_thumbnail.jpg`;
const RACEBOOK_BG_URL = `${API_BASE}/horses/racebookbg.jpg`;
// Empty by design — every horse renders the inline-SVG sprite. If we ever
// wire per-post PNG overrides again, drop entries in here keyed by post #.
const SIDE_HORSE_URLS: Record<number, string> = {};

// ── Audio choreography ──
//   Lobby (venue + setup) → Indiana Jones at medium volume.
//   Racebook                → Glory to Rome (low, music) + Crowd (medium, SFX).
//   Race countdown (3-2-1) → Glory fades out over the countdown; Crowd swells
//                            from medium to loud. By "GO!" only Crowd is left.
//   Race + finish modal     → Crowd stays loud.
//   Settlement              → Crowd fades out.
//
// All three filenames have spaces so we encodeURIComponent the path segment.
const INDY_FILENAME  = 'Indiana Jones  Main Theme  John Williams.mp3';
const GLORY_FILENAME = 'Glory to Rome.mp3';
const CROWD_FILENAME = 'Stadium Crowd Sound Effects _ One Hour _ HQ [-FLgShtdxQ8].mp3';
const INDY_URL  = `${API_BASE}/horses/${encodeURIComponent(INDY_FILENAME)}`;
const GLORY_URL = `${API_BASE}/horses/${encodeURIComponent(GLORY_FILENAME)}`;
const CROWD_URL = `${API_BASE}/horses/${encodeURIComponent(CROWD_FILENAME)}`;

// Volume targets per track per state. Floats in [0, 1].
const VOL_INDY_LOBBY     = 0.50;   // medium
const VOL_GLORY_RACEBOOK = 0.015;  // borderline-inaudible — bed for the announcer
const VOL_CROWD_RACEBOOK = 0.015;  // same — barely-there ambience
const VOL_CROWD_RACE     = 0.55;   // race itself — punchy but not blowing out the commentary
const VOL_CROWD_DUCKED   = 0.06;   // ducked under post-race commentary

// Fade durations
const FADE_QUICK_MS  = 800;        // small panel transitions
const FADE_NORMAL_MS = 1500;       // entering / leaving the lobby
const FADE_COUNTDOWN_MS = 2200;    // matches RaceView's COUNTDOWN_MS exactly

const PAGE_BG_STYLE: React.CSSProperties = {
  backgroundImage:
    `linear-gradient(180deg, rgba(7,21,14,0.72), rgba(7,21,14,0.82)), url(${MAIN_BG_URL})`,
  backgroundSize: 'cover',
  backgroundPosition: 'center',
  backgroundAttachment: 'fixed',
};

const RACEBOOK_BG_STYLE: React.CSSProperties = {
  backgroundImage:
    `linear-gradient(180deg, rgba(7,21,14,0.78), rgba(7,21,14,0.88)), url(${RACEBOOK_BG_URL})`,
  backgroundSize: 'cover',
  backgroundPosition: 'center',
  backgroundAttachment: 'fixed',
};

// ─── Commentary audio helpers ────────────────────────────────────────────

const COMMENTARY_VOLUME = 1.0;       // max — relies on Glory/crowd being WAY
                                     // quieter (~0.015) so the announcer
                                     // dominates the mix without needing
                                     // Web Audio gain. Routing the audio
                                     // element through a MediaElementSource
                                     // suspended the context and produced
                                     // silent playback in Chrome — so we
                                     // stay on the plain audio path.

function b64ToBlobUrl(b64: string, mime: string): string {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}

// Module-level holder for the post-race commentary audio so it survives
// RaceView unmounting (user clicks "Proceed to Settle Bets" before the TTS
// fetch resolves). The Audio object isn't bound to any React DOM element,
// so the announcer plays cleanly over the settlement view. We expose
// stop/teardown so the next race / new session can silence it.
let _postCommentaryAudio: HTMLAudioElement | null = null;
let _postCommentaryUrl: string | null = null;
function stopPostCommentary() {
  if (_postCommentaryAudio) {
    try { _postCommentaryAudio.pause(); } catch { /* noop */ }
    _postCommentaryAudio.src = '';
    _postCommentaryAudio = null;
  }
  if (_postCommentaryUrl) {
    URL.revokeObjectURL(_postCommentaryUrl);
    _postCommentaryUrl = null;
  }
}

// ─── Year / edition helpers ──────────────────────────────────────────────
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
/** "39th Edition · 1745" — used in headers across the racebook / race / settlement. */
function fmtEdition(year: number): string {
  const ed = year - EDITION_BASE_YEAR + 1;
  return `${ed}${ordinalSuffix(ed)} Edition · ${year}`;
}

// ─── Formatting ──────────────────────────────────────────────────────────
function fmtOdds(quote: OddsQuote | undefined, format: OddsFormat): string {
  if (!quote) return '—';
  if (quote.locked) return '🔒';
  if (format === 'decimal') return (quote.decimal ?? 0).toFixed(2);
  const a = quote.american ?? 0;
  if (a >= 0) return `+${a}`;
  return `${a}`;
}

function fmtUsd(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  return `${sign}$${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** ISO 3166-1 alpha-2 → flag image.
 *
 *  Resolution order:
 *    1. Local SVG in `backend/horses/flags/Flag_of_<Name>.svg` (we control these,
 *       crisp at any size, no third-party dependency).
 *    2. Fallback to flagcdn.com PNG for codes we haven't dropped a local SVG
 *       for yet — keeps the catalogue working as you expand the local set.
 *
 *  Why we don't use the emoji: Windows ships Segoe UI Emoji which deliberately
 *  omits national flag glyphs and falls back to the "US"/"GB" letter-pair box.
 *  Image-based flags are the only cross-platform-consistent option.
 *
 *  Add a new local flag → drop the SVG into `flags/`, then add an
 *  `XX: 'Country_Name'` entry to LOCAL_FLAGS below.
 */
const LOCAL_FLAGS: Record<string, string> = {
  AL: 'Albania',
  CO: 'Colombia',
  FR: 'France',
  DE: 'Germany',
  IS: 'Iceland',
  IN: 'India',
  IL: 'Israel',
  IT: 'Italy',
  JP: 'Japan',
  MX: 'Mexico',
  RO: 'Romania',
  GB: 'United_Kingdom',
  US: 'United_States',
};

function CountryFlag({
  iso, height = 12, className,
}: {
  iso: string | null | undefined;
  height?: number;
  className?: string;
}) {
  if (!iso) return null;
  const code = iso.trim().toUpperCase();
  if (code.length !== 2 || !/^[A-Z]{2}$/.test(code)) return null;

  const localName = LOCAL_FLAGS[code];
  let src: string;
  if (localName) {
    src = `${API_BASE}/horses/flags/Flag_of_${localName}.svg`;
  } else {
    // Remote PNG fallback at ~1.5× width (flag aspect ≈ 3:2).
    const w = Math.round(height * 1.5);
    src = `https://flagcdn.com/w${w}/${code.toLowerCase()}.png`;
  }
  return (
    <img
      className={className ? `hr-flag-img ${className}` : 'hr-flag-img'}
      src={src}
      height={height}
      alt={code}
      title={code}
      loading="lazy"
    />
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Help modal — Rules + Horses tabs
// ═══════════════════════════════════════════════════════════════════════

function HelpModal({ isOpen, onClose, horses }: { isOpen: boolean; onClose: () => void; horses: Horse[] }) {
  const [tab, setTab] = useState<'rules' | 'horses'>('rules');

  if (!isOpen) return null;

  return (
    <div className="hr-modal-root">
      <div className="hr-modal-backdrop" onClick={onClose} />
      <div className="hr-modal-panel">
        <header className="hr-modal-head">
          <h2>Racebook Guide</h2>
          <button className="hr-modal-close" onClick={onClose}>✕</button>
        </header>

        <div className="hr-modal-tabs">
          <button className={`hr-tab ${tab === 'rules' ? 'is-active' : ''}`} onClick={() => setTab('rules')}>Rules &amp; Markets</button>
          <button className={`hr-tab ${tab === 'horses' ? 'is-active' : ''}`} onClick={() => setTab('horses')}>Horses Catalogue</button>
        </div>

        <div className="hr-modal-body">
          {tab === 'rules' ? <RulesContent /> : <CatalogueContent horses={horses} />}
        </div>
      </div>
    </div>
  );
}

function RulesContent() {
  return (
    <div className="hr-rules">
      <section>
        <h3>How a session works</h3>
        <p>You start every session with <strong>$100</strong>. Pick 5 or 7 horses, study the racebook, place as many bets as you like across any markets, then send them off. Settlement is instant. P&amp;L resets when you start a new session.</p>
      </section>

      <section>
        <h3>Markets</h3>
        <ul className="hr-rules-list">
          <li><strong>Win</strong> — your horse finishes first.</li>
          <li><strong>Place</strong> — your horse finishes top 2.</li>
          <li><strong>Show</strong> — your horse finishes top 3.</li>
          <li><strong>Top 2 Exact Order</strong> — pick the 1st and 2nd finisher in order. Long odds, big payouts.</li>
          <li><strong>Finish Last</strong> — pick the back-marker.</li>
          <li><strong>Two-Horse Duel</strong> — Horse A finishes ahead of Horse B. Position-agnostic.</li>
          <li><strong>Finish Bottom 3</strong> — your horse comes in 5th, 6th, or 7th.</li>
          <li><strong>Props</strong> — margin bets on the leader and back-marker.</li>
        </ul>
      </section>

      <section>
        <h3>How prices are set (in plain English)</h3>
        <p>Each horse has a personality: an average speed, a degree of mood swings, and a level of composure. Bet wisely. Some are volatile. Others are not.</p>
      </section>
    </div>
  );
}

// ─── Catalogue (2-per-row, expandable) ────────────────────────────────────

function CatalogueContent({ horses }: { horses: Horse[] }) {
  // ALL hooks declared up-front — React's rules-of-hooks require the
  // same number of hook calls every render, so an early return MUST come
  // after the hook calls (not before).
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [sortBy, setSortBy] = useState<'name' | 'speed'>('name');
  const [country, setCountry] = useState<string>('');         // '' = all
  // When non-null, the catalogue body switches to the fancy single-horse
  // card view for that horse. Set by the "Open Card" button on each
  // catalogue card; cleared by the back button on the card view.
  const [cardHorse, setCardHorse] = useState<Horse | null>(null);

  // Build the country filter options once per horses list change.
  const countryOptions = useMemo(() => {
    const set = new Set<string>();
    for (const h of horses) if (h.country) set.add(h.country);
    return Array.from(set).sort();
  }, [horses]);

  const visible = useMemo(() => {
    let arr = horses;
    if (country) arr = arr.filter((h) => h.country === country);
    arr = [...arr].sort((a, b) => {
      if (sortBy === 'speed') return b.mean_speed - a.mean_speed;     // fastest first
      return a.full_name.localeCompare(b.full_name);
    });
    return arr;
  }, [horses, country, sortBy]);

  // ── End of hooks ── early return is now safe.

  // Fancy single-horse card takes over the entire catalogue body — no
  // grid, no toolbar, just the focused detail view + a back action.
  if (cardHorse) {
    return <HorseFancyCard horse={cardHorse} onBack={() => setCardHorse(null)} />;
  }

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

  return (
    <div className="hr-catalogue">
      <div className="hr-catalogue-toolbar">
        <div className="hr-cat-tools-group">
          <span className="hr-cat-tools-label">Sort</span>
          <button
            className={`hr-cat-pill ${sortBy === 'name' ? 'is-active' : ''}`}
            onClick={() => setSortBy('name')}
          >Alphabetical</button>
          <button
            className={`hr-cat-pill ${sortBy === 'speed' ? 'is-active' : ''}`}
            onClick={() => setSortBy('speed')}
          >By Speed</button>
        </div>
        <div className="hr-cat-tools-group">
          <span className="hr-cat-tools-label">Country</span>
          <select
            className="hr-cat-country-select"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
          >
            <option value="">All countries ({horses.length})</option>
            {countryOptions.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="hr-catalogue-grid">
        {visible.map((h) => {
          const isOpen = !!expanded[h.horse_id];
          return (
            <article key={h.horse_id} className={`hr-card ${isOpen ? 'is-open' : ''}`}>
              <button
                className="hr-card-toggle"
                onClick={() => setExpanded((e) => ({ ...e, [h.horse_id]: !e[h.horse_id] }))}
                aria-expanded={isOpen}
              >
                <header className="hr-card-head">
                  <CountryFlag iso={h.country} height={28} className="hr-card-flag" />
                  <div className="hr-card-titles">
                    <h4>{h.full_name}</h4>
                    <span className="hr-card-nickname">&ldquo;{h.saddle_name}&rdquo;</span>
                  </div>
                  <div className="hr-card-speed-pill">
                    <span>Speed</span>
                    <strong>{h.mean_speed.toFixed(2)}</strong>
                  </div>
                  <span className={`hr-card-chevron ${isOpen ? 'is-open' : ''}`} aria-hidden>▾</span>
                </header>
              </button>
              {isOpen && (
                <div className="hr-card-detail">
                  <div className="hr-card-stats">
                    <div>
                      <span>Composure</span>
                      <strong>{composureLabel(h.pace_stickiness)}</strong>
                    </div>
                    <div>
                      <span>Mood Swings</span>
                      <strong>{moodLabel(h.speed_volatility)}</strong>
                    </div>
                  </div>
                  <div className="hr-card-career">
                    <div>
                      <span>Races</span>
                      <strong>{h.stats?.participations ?? 0}</strong>
                    </div>
                    <div>
                      <span>Wins</span>
                      <strong>{h.stats?.wins ?? 0}</strong>
                    </div>
                    <div>
                      <span>Places</span>
                      <strong>{h.stats?.places ?? 0}</strong>
                    </div>
                    <div>
                      <span>Shows</span>
                      <strong>{h.stats?.shows ?? 0}</strong>
                    </div>
                  </div>
                  {h.description && <p className="hr-card-desc">{h.description}</p>}
                  <button
                    className="hr-card-open-btn"
                    onClick={(e) => { e.stopPropagation(); setCardHorse(h); }}
                  >
                    Open Card →
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}

// ─── Fancy single-horse card (catalogue → "Open Card") ───────────────────
function HorseFancyCard({ horse, onBack }: { horse: Horse; onBack: () => void }) {
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
  // Wins per Participation + Shows per Participation, both as ratio + %.
  // Guarded against zero divides — if no races, show "—".
  const winRate  = participations > 0 ? wins  / participations : null;
  const showRate = participations > 0 ? shows / participations : null;
  const fmtPct = (r: number | null) =>
    r === null ? '—' : `${(r * 100).toFixed(1)}%`;
  const fmtRatio = (top: number, bottom: number) =>
    bottom === 0 ? '—' : `${top}/${bottom} = ${(top / bottom).toFixed(3)}`;

  return (
    <div className="hr-fancy-card">
      <button className="hr-link-back" onClick={onBack}>← Back to catalogue</button>

      {/* Header — saddle/silks block on the left with the NICKNAME inside,
          full name + country flag to the right. */}
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

      {/* Simulator personality strip */}
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

      {/* Key stats row */}
      <section className="hr-fancy-block">
        <h3>Key Stats</h3>
        <div className="hr-fancy-keystats">
          <div><span>Participations</span><strong>{participations}</strong></div>
          <div><span>Wins</span><strong>{wins}</strong></div>
          <div><span>Places</span><strong>{stats?.places ?? 0}</strong></div>
          <div><span>Shows</span><strong>{shows}</strong></div>
        </div>
      </section>

      {/* Bio / description */}
      {horse.description && (
        <section className="hr-fancy-block">
          <h3>Bio</h3>
          <p className="hr-fancy-bio">{horse.description}</p>
        </section>
      )}

      {/* Hit-rate row */}
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

      {/* Last 5 years performance */}
      <section className="hr-fancy-block">
        <h3>Last {last5.length} Race{last5.length === 1 ? '' : 's'}</h3>
        {last5.length === 0 ? (
          <p className="hr-fancy-empty">No prior race results on record yet.</p>
        ) : (
          <table className="hr-stats-table hr-fancy-table">
            <thead>
              <tr>
                <th>Edition</th>
                <th>Finish</th>
                <th className="hr-stats-num">Time</th>
              </tr>
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

      {/* Best / worst time */}
      <section className="hr-fancy-block">
        <h3>Personal Records</h3>
        <div className="hr-fancy-records">
          <div className="is-best">
            <span>Best Time Ever</span>
            <strong>
              {stats?.best_seconds != null ? `${stats.best_seconds.toFixed(2)}s` : '—'}
            </strong>
            <em>{stats?.best_year != null ? fmtEdition(stats.best_year) : '—'}</em>
          </div>
          <div className="is-worst">
            <span>Worst Time Ever</span>
            <strong>
              {stats?.worst_seconds != null ? `${stats.worst_seconds.toFixed(2)}s` : '—'}
            </strong>
            <em>{stats?.worst_year != null ? fmtEdition(stats.worst_year) : '—'}</em>
          </div>
        </div>
      </section>

      {/* Full per-year history — collapsed to the latest 3 by default,
          expand to see all. Most-recent first. */}
      <section className="hr-fancy-block">
        <h3>All Races on Record ({allResults.length})</h3>
        {allResults.length === 0 ? (
          <p className="hr-fancy-empty">No race history recorded yet.</p>
        ) : (
          <>
            <table className="hr-stats-table hr-fancy-table">
              <thead>
                <tr>
                  <th>Edition</th>
                  <th>Finish</th>
                  <th className="hr-stats-num">Time</th>
                </tr>
              </thead>
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
              <button
                className="hr-stats-expand"
                onClick={() => setAllExpanded((v) => !v)}
              >
                {allExpanded
                  ? 'Show latest 3 only'
                  : `Show all ${allResults.length} races`}
              </button>
            )}
          </>
        )}
      </section>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// View 1 — Venue picker (Churchill Downs / Cheltenham)
// ═══════════════════════════════════════════════════════════════════════

function VenueView({
  onChurchill, onCheltenham, onHelp, onStats, churchillLocked,
}: {
  onChurchill: () => void;
  onCheltenham: () => void;
  onHelp: () => void;
  onStats: () => void;
  churchillLocked?: boolean;
}) {
  const churchillStyle: React.CSSProperties = {
    backgroundImage:
      `linear-gradient(180deg, rgba(14,36,24,0.55) 0%, rgba(14,36,24,0.92) 100%), url(${CHURCHILL_THUMB_URL})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  };
  const cheltenhamStyle: React.CSSProperties = {
    backgroundImage:
      `linear-gradient(180deg, rgba(14,36,24,0.7) 0%, rgba(14,36,24,0.95) 100%), url(${CHELTENHAM_THUMB_URL})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  };

  return (
    <div className="hr-venue">
      <header className="hr-venue-head">
        <div>
          <div className="hr-eyebrow">Racing</div>
          <h1>Horse Racing</h1>
          <p className="hr-venue-sub">Pick your card.</p>
        </div>
        <div className="hr-venue-head-actions">
          <button className="hr-venue-stats-btn" onClick={onStats}>📊 Stats</button>
          <button className="hr-help-btn" onClick={onHelp} aria-label="Help">?</button>
        </div>
      </header>

      <div className="hr-venue-grid">
        <button
          className={`hr-venue-card ${churchillLocked ? 'is-locked' : ''}`}
          onClick={onChurchill}
          style={churchillStyle}
          title={churchillLocked ? 'Locked — bookies only' : undefined}
        >
          <span className="hr-venue-flag" aria-hidden>🇺🇸</span>
          <div className="hr-venue-card-title">
            Churchill Downs
            {churchillLocked && <span className="hr-venue-lock-icon" aria-hidden> 🔒</span>}
          </div>
          <div className="hr-venue-card-meta">Offline · Solo · Instant settle</div>
          <div className={`hr-venue-card-tag ${churchillLocked ? 'hr-tag-locked' : 'hr-tag-open'}`}>
            {churchillLocked ? '🔒 Locked' : 'Open'}
          </div>
          {churchillLocked && (
            <div className="hr-venue-lock-overlay" aria-hidden>
              <span className="hr-venue-lock-overlay-icon">🔒</span>
              <span className="hr-venue-lock-overlay-text">LOCKED</span>
            </div>
          )}
        </button>

        <button className="hr-venue-card" onClick={onCheltenham} style={cheltenhamStyle}>
          <span className="hr-venue-flag" aria-hidden>🇬🇧</span>
          <div className="hr-venue-card-title">Cheltenham, Gloucestershire</div>
          <div className="hr-venue-card-meta">Online · Multiplayer · Parimutuel</div>
          <div className="hr-venue-card-tag hr-tag-open">Open</div>
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// View 2 — Race setup (pick 5 or 7, draw the field)
// ═══════════════════════════════════════════════════════════════════════

function SetupView({
  onProceed, onBack, onHelp, horses,
}: {
  onProceed: (field: HorseInField[]) => void;
  onBack: () => void;
  onHelp: () => void;
  horses: Horse[];
}) {
  const [count, setCount] = useState<5 | 7>(5);
  const [field, setField] = useState<HorseInField[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const drawField = async () => {
    setLoading(true);
    setErr(null);
    try {
      const f = await setupRace(count);
      setField(f);
    } catch (e: any) {
      setErr(e?.response?.data?.error || e?.message || 'Failed to draw field');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="hr-setup">
      <header className="hr-setup-head">
        <button className="hr-link-back" onClick={onBack}>← Back to venues</button>
        <button className="hr-help-btn" onClick={onHelp} aria-label="Help">?</button>
      </header>

      <div className="hr-setup-banner">
        <span className="hr-eyebrow">Churchill Downs</span>
        <h1>Set Up the Race</h1>
        <p>Catalogue: {horses.length} horses available.</p>
      </div>

      <div className="hr-setup-controls">
        <div className="hr-count-toggle">
          <span className="hr-count-toggle-label">Field size</span>
          <button
            className={`hr-count-pill ${count === 5 ? 'is-active' : ''}`}
            onClick={() => setCount(5)}
            disabled={loading}
          >5 horses</button>
          <button
            className={`hr-count-pill ${count === 7 ? 'is-active' : ''}`}
            onClick={() => setCount(7)}
            disabled={loading}
          >7 horses</button>
        </div>
        <button className="hr-btn-primary" onClick={drawField} disabled={loading}>
          {loading ? 'Drawing field…' : field.length ? 'Re-draw field' : 'Set Up Race'}
        </button>
      </div>

      {err && <div className="hr-error">{err}</div>}

      {field.length > 0 && (
        <>
          <div className="hr-field-list">
            {field.map((h) => (
              <div key={h.horse_id} className="hr-field-row">
                <span className="hr-post-num" style={{ background: h.silks_color }}>{h.post_position}</span>
                <div className="hr-field-name">
                  <strong>
                    {h.full_name}
                    <CountryFlag iso={h.country} />
                  </strong>
                  <span className="hr-saddle-tag">{h.saddle_name}</span>
                </div>
                <div className="hr-field-stats">
                  <span>μ {h.mean_speed.toFixed(2)}</span>
                  <span>σ {h.speed_volatility.toFixed(2)}</span>
                  <span>α {h.pace_stickiness.toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="hr-setup-cta">
            <button className="hr-btn-primary hr-btn-large" onClick={() => onProceed(field)}>
              Proceed to betGSIS Racebook →
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// View 3 — The Racebook
// ═══════════════════════════════════════════════════════════════════════

type Market =
  | 'win'
  | 'place'
  | 'show'
  | 'top2_exact'
  | 'finish_last'
  | 'duel'
  | 'bottom_3'
  | 'prop_first_margin'    // winner wins by > winby_seconds
  | 'prop_last_margin'     // last loses by > loseby_seconds
  | 'prop_any_under'       // any horse finishes in < fast_seconds
  | 'prop_any_over'        // any horse finishes in > slow_seconds
  | 'prop_finish_over'     // specific horse finishes in > line_seconds
  | 'prop_finish_under'    // specific horse finishes in < line_seconds
  | 'parlay_fav'           // favorite leads at N/2 AND wins
  | 'parlay_underdog';     // underdog is last at N/2 AND finishes last

interface LiveBet {
  key: string;
  market: Market;
  selection_ids: number[];        // single id, or [first, second] for ordered/pair markets, or [] for non-horse props
  market_label: string;
  selection_label: string;
  decimal: number;
  american: number;
  stake: number;
  meta?: {                        // market-specific extras the evaluator needs to grade the bet
    line_seconds?: number;        // for prop_finish_over / prop_finish_under
  };
}

function RacebookView({
  field, odds, oddsFormat, setOddsFormat, onBack, onHelp, onSendOff,
  activeBettor, isBookieMode,
}: {
  field: HorseInField[];
  odds: RaceOdds;
  oddsFormat: OddsFormat;
  setOddsFormat: (f: OddsFormat) => void;
  onBack: () => void;
  onHelp: () => void;
  onSendOff: (bets: LiveBet[]) => void;
  activeBettor: BettorSession;
  isBookieMode: boolean;        // true when the bookie has stacked >1 session
}) {
  const [bankroll] = useState(activeBettor.bankroll);

  // EDIT-MODE PRE-FILL — when this RacebookView mounts for a bettor whose
  // session already has bets (i.e. they're being edited via the pencil
  // button), seed the local stake inputs + template dropdowns from those
  // existing bets so the user can adjust rather than starting fresh.
  // Each LiveBet's `key` is the exact stake-input key it was placed
  // against; selection_ids carry the dropdown values for templates.
  // Lazy initialisers ONLY — runs once per mount, which is correct
  // because the parent re-mounts RacebookView with `key={activeBettorIdx}`
  // every time the active bettor changes.
  const initialBets = (activeBettor.bets || []) as LiveBet[];
  const findInitial = (k: string) => initialBets.find((b) => b.key === k);

  const [stakes, setStakes] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const b of initialBets) m[b.key] = String(b.stake);
    return m;
  });
  const [showReview, setShowReview] = useState(false);
  const [horseDetail, setHorseDetail] = useState<HorseInField | null>(null);

  // Template-market dropdown selections — seeded from the matching bets
  // when present so the racebook re-renders with the user's prior picks.
  const [t2First, setT2First] = useState<number | null>(() => {
    const b = findInitial('tpl_top2');  return b ? b.selection_ids[0] ?? null : null;
  });
  const [t2Second, setT2Second] = useState<number | null>(() => {
    const b = findInitial('tpl_top2');  return b ? b.selection_ids[1] ?? null : null;
  });
  const [lastPick, setLastPick] = useState<number | null>(() => {
    const b = findInitial('tpl_last');  return b ? b.selection_ids[0] ?? null : null;
  });
  const [duelA, setDuelA] = useState<number | null>(() => {
    const b = findInitial('tpl_duel');  return b ? b.selection_ids[0] ?? null : null;
  });
  const [duelB, setDuelB] = useState<number | null>(() => {
    const b = findInitial('tpl_duel');  return b ? b.selection_ids[1] ?? null : null;
  });
  const [bottom3Pick, setBottom3Pick] = useState<number | null>(() => {
    const b = findInitial('tpl_bottom3');  return b ? b.selection_ids[0] ?? null : null;
  });

  // Pre-race commentary lives at the parent (HorseRacing) so the
  // announcer keeps talking through racebook → preRace transitions
  // and only cuts when the race actually fires.

  const horseById = useMemo(() => {
    const m: Record<number, HorseInField> = {};
    for (const h of field) m[h.horse_id] = h;
    return m;
  }, [field]);

  const setStake = (key: string, value: string) => {
    setStakes((s) => ({ ...s, [key]: value }));
  };

  // Live bet derivation — collects every non-empty stake against current selections
  const liveBets: LiveBet[] = useMemo(() => {
    const out: LiveBet[] = [];

    const push = (
      key: string,
      market: Market,
      market_label: string,
      selection_ids: number[],
      selection_label: string,
      quote: OddsQuote | undefined,
      meta?: LiveBet['meta'],
    ) => {
      const stake = parseFloat(stakes[key] || '');
      // Locked quotes have no usable price; skip even if a stale stake string
      // is sitting in state.
      if (!quote || quote.locked || quote.decimal == null || quote.american == null) return;
      if (!Number.isFinite(stake) || stake <= 0) return;
      out.push({
        key, market, market_label, selection_ids, selection_label,
        decimal: quote.decimal, american: quote.american, stake, meta,
      });
    };

    // Win/Place/Show
    for (const h of field) {
      push(`win_${h.horse_id}`, 'win', 'Win', [h.horse_id], h.full_name, odds.win[String(h.horse_id)]);
      push(`place_${h.horse_id}`, 'place', 'Place', [h.horse_id], h.full_name, odds.place[String(h.horse_id)]);
      push(`show_${h.horse_id}`, 'show', 'Show', [h.horse_id], h.full_name, odds.show[String(h.horse_id)]);
    }

    // Templates
    if (t2First && t2Second && t2First !== t2Second) {
      const q = odds.top2_exact[`${t2First}_${t2Second}`];
      const sel = `${horseById[t2First]?.full_name} → ${horseById[t2Second]?.full_name}`;
      push('tpl_top2', 'top2_exact', 'Top 2 Exact', [t2First, t2Second], sel, q);
    }
    if (lastPick) {
      const q = odds.finish_last[String(lastPick)];
      push('tpl_last', 'finish_last', 'Finish Last', [lastPick], horseById[lastPick]?.full_name || '', q);
    }
    if (duelA && duelB && duelA !== duelB) {
      const q = odds.duel[`${duelA}_before_${duelB}`];
      const sel = `${horseById[duelA]?.full_name} ahead of ${horseById[duelB]?.full_name}`;
      push('tpl_duel', 'duel', 'Two-Horse Duel', [duelA, duelB], sel, q);
    }
    if (bottom3Pick) {
      const q = odds.bottom_3[String(bottom3Pick)];
      push('tpl_bottom3', 'bottom_3', 'Finish Bottom 3', [bottom3Pick], horseById[bottom3Pick]?.full_name || '', q);
    }

    // Props — labels embed the actual seconds-threshold (which scales with race
    // distance, so the same key carries different copy at different lengths).
    const pt = odds.prop_thresholds;
    push('prop_winby',  'prop_first_margin', 'Prop', [],
      `Winner by > ${pt.winby_seconds.toFixed(1)} sec`,  odds.props.first_place_margin);
    push('prop_loseby', 'prop_last_margin',  'Prop', [],
      `Last by > ${pt.loseby_seconds.toFixed(1)} sec`,    odds.props.last_place_margin);
    push('prop_fast',   'prop_any_under',    'Prop', [],
      `Any horse under ${pt.fast_seconds.toFixed(1)} sec`, odds.props.any_under_threshold);
    push('prop_slow',   'prop_any_over',     'Prop', [],
      `Any horse over ${pt.slow_seconds.toFixed(1)} sec`,  odds.props.any_over_threshold);

    // ── Favorite + underdog parlays (lead at half AND finish first / last) ──
    const par = odds.parlays;
    const halfDist = par.midpoint_distance.toLocaleString();
    const favHorse = horseById[par.favorite_id];
    const dogHorse = horseById[par.underdog_id];
    push(
      'parlay_fav',
      'parlay_fav',
      'Parlay',
      [par.favorite_id],
      `${favHorse?.full_name ?? `#${par.favorite_id}`} 1st to ${halfDist} AND wins`,
      par.favorite_quote,
    );
    push(
      'parlay_underdog',
      'parlay_underdog',
      'Parlay',
      [par.underdog_id],
      `${dogHorse?.full_name ?? `#${par.underdog_id}`} last at ${halfDist} AND finishes last`,
      par.underdog_quote,
    );

    // ── Over/Under finish-time on the 3 randomly-picked horses ──
    for (const ou of odds.over_under_picks) {
      const horse = horseById[ou.horse_id];
      const horseName = horse?.full_name ?? `#${ou.horse_id}`;
      push(
        `prop_ou_over_${ou.horse_id}`,
        'prop_finish_over',
        'O/U Time',
        [ou.horse_id],
        `${horseName} OVER ${ou.line_seconds}s`,
        ou.over,
        { line_seconds: ou.line_seconds },
      );
      push(
        `prop_ou_under_${ou.horse_id}`,
        'prop_finish_under',
        'O/U Time',
        [ou.horse_id],
        `${horseName} UNDER ${ou.line_seconds}s`,
        ou.under,
        { line_seconds: ou.line_seconds },
      );
    }

    return out;
  }, [stakes, t2First, t2Second, lastPick, duelA, duelB, bottom3Pick, field, odds, horseById]);

  const totalStaked = liveBets.reduce((s, b) => s + b.stake, 0);
  const remaining = bankroll - totalStaked;
  const overBudget = totalStaked > bankroll + 0.0001;
  const stakedOver = overBudget; // cells go red when total over budget
  const canReview = liveBets.length > 0 && !overBudget;

  const totalPayout = liveBets.reduce((s, b) => s + b.stake * b.decimal, 0);

  // Adaptive grid ratio: 5-horse → 45/55 (more space for templates),
  // 7-horse → 60/40 (W/P/S table is taller).
  const gridStyle: React.CSSProperties = field.length === 5
    ? { gridTemplateRows: '45fr 55fr' }
    : { gridTemplateRows: '60fr 40fr' };

  const oddsCellProps = {
    format: oddsFormat,
    stakes, setStake, overBudget: stakedOver,
  };

  return (
    <div className="hr-racebook" style={RACEBOOK_BG_STYLE}>
      {/* Pre-race AI commentary audio + "On Air" banner are owned by the
          parent (HorseRacing) — same pre-race loop runs across racebook
          AND preRace views without re-mounting. */}
      <div className="hr-track-bg" aria-hidden>
        <div className="hr-track-lanes">
          {field.map((h) => (
            <div key={h.horse_id} className="hr-track-lane">
              <span className="hr-track-runner" style={{ background: h.silks_color }}>{h.post_position}</span>
            </div>
          ))}
        </div>
        <div className="hr-track-finish" />
      </div>

      <header className="hr-rb-head">
        <button className="hr-link-back" onClick={onBack}>← Back</button>
        <div className="hr-rb-title">
          <span className="hr-eyebrow">
            Churchill Downs · {fmtEdition(odds.year_counter)} · {field.length}-horse · {odds.distance.toLocaleString()} lengths
          </span>
          <h1>betGSIS Racebook</h1>
          {isBookieMode && (
            <span className="hr-rb-betting-for">
              <span className="hr-rb-betting-for-label">Betting for</span>
              <strong>{activeBettor.screen_name}</strong>
            </span>
          )}
        </div>
        <div className="hr-rb-controls">
          <div className={`hr-bankroll ${overBudget ? 'is-over' : ''}`}>
            <span>Remaining</span>
            <strong>{fmtUsd(remaining)}</strong>
            {totalStaked > 0 && <span className="hr-bankroll-staked">{fmtUsd(totalStaked)} staked</span>}
          </div>
          <div className="hr-format-toggle" role="group" aria-label="Odds format">
            <button className={oddsFormat === 'american' ? 'is-active' : ''} onClick={() => setOddsFormat('american')}>American</button>
            <button className={oddsFormat === 'decimal' ? 'is-active' : ''} onClick={() => setOddsFormat('decimal')}>Decimal</button>
          </div>
          <button
            className="hr-btn-review"
            onClick={() => setShowReview(true)}
            disabled={!canReview}
            title={overBudget ? 'Stakes exceed bankroll' : ''}
          >
            Review Bets
            {liveBets.length > 0 && <span className="hr-review-count">{liveBets.length}</span>}
          </button>
          <button className="hr-help-btn" onClick={onHelp} aria-label="Help">?</button>
        </div>
      </header>

      {overBudget && (
        <div className="hr-rb-over-banner">
          ⚠ Total stakes ({fmtUsd(totalStaked)}) exceed your $100 bankroll. Reduce a stake to continue.
        </div>
      )}

      <div className="hr-rb-grid" style={gridStyle}>
        {/* Left column — W/P/S stacked above Templates+TimeO/U.
            Wrapped in its own flex column so the W/P/S section hugs its
            row count instead of being stretched by the right column. */}
        <div className="hr-rb-col-left">
        {/* ─── Top-Left: Win / Place / Show ─── */}
        <section className="hr-q-tl">
          <header className="hr-q-head">
            <h2>Win · Place · Show</h2>
            <span className="hr-q-sub">All horses</span>
          </header>
          <div className="hr-wps-table">
            <div className="hr-wps-row hr-wps-row-head">
              <span>Horse</span>
              <span>Win</span>
              <span>Place</span>
              <span>Show</span>
            </div>
            {field.map((h) => (
              <div key={h.horse_id} className="hr-wps-row">
                <span className="hr-wps-horse">
                  <span className="hr-post-num hr-post-num-sm" style={{ background: h.silks_color }}>{h.post_position}</span>
                  <span className="hr-wps-name-wrap">
                    <button
                      type="button"
                      className="hr-wps-name hr-wps-name-btn"
                      onClick={() => setHorseDetail(h)}
                      title="Click for full bio"
                    >
                      {h.full_name} <span className="hr-wps-nickname">({h.saddle_name})</span>
                      <CountryFlag iso={h.country} />
                    </button>
                    <HorseTooltip horse={h} />
                    {/* TODO: remove .hr-debug-stats line on deploy — exposes simulator params to bettors. */}
                    <span className="hr-debug-stats">
                      μ {h.mean_speed.toFixed(2)} · σ {h.speed_volatility.toFixed(2)} · α {h.pace_stickiness.toFixed(2)}
                    </span>
                  </span>
                </span>
                <OddsCell quote={odds.win[String(h.horse_id)]} stakeKey={`win_${h.horse_id}`} {...oddsCellProps} />
                <OddsCell quote={odds.place[String(h.horse_id)]} stakeKey={`place_${h.horse_id}`} {...oddsCellProps} />
                <OddsCell quote={odds.show[String(h.horse_id)]} stakeKey={`show_${h.horse_id}`} {...oddsCellProps} />
              </div>
            ))}
          </div>
        </section>

        {/* ─── Bottom-Left: Templates ─── */}
        <section className="hr-q-bl">
          <header className="hr-q-head">
            <h2>Template Markets</h2>
            <span className="hr-q-sub">One bet per template</span>
          </header>

          <div className="hr-tpl-grid">
            <TemplateCard
              title="Top 2 Exact Order"
              subtitle="1st and 2nd, in order"
              quote={(t2First && t2Second && t2First !== t2Second) ? odds.top2_exact[`${t2First}_${t2Second}`] : undefined}
              format={oddsFormat}
              dropdowns={[
                { label: 'Pick winner', persistentLabel: '1st', value: t2First, onChange: setT2First, field, exclude: t2Second },
                { label: 'Pick runner-up', persistentLabel: '2nd', value: t2Second, onChange: setT2Second, field, exclude: t2First },
              ]}
              stakeKey="tpl_top2"
              stakes={stakes}
              setStake={setStake}
              overBudget={stakedOver}
            />

            <TemplateCard
              title="Finish Last"
              subtitle="Back-marker pick"
              quote={lastPick ? odds.finish_last[String(lastPick)] : undefined}
              format={oddsFormat}
              dropdowns={[
                { label: 'Last', value: lastPick, onChange: setLastPick, field },
              ]}
              stakeKey="tpl_last"
              stakes={stakes}
              setStake={setStake}
              overBudget={stakedOver}
            />

            <TemplateCard
              title="Two-Horse Duel"
              subtitle="A finishes ahead of B"
              quote={(duelA && duelB && duelA !== duelB) ? odds.duel[`${duelA}_before_${duelB}`] : undefined}
              format={oddsFormat}
              dropdowns={[
                { label: 'Ahead', value: duelA, onChange: setDuelA, field, exclude: duelB },
                { label: 'Behind', value: duelB, onChange: setDuelB, field, exclude: duelA },
              ]}
              stakeKey="tpl_duel"
              stakes={stakes}
              setStake={setStake}
              overBudget={stakedOver}
            />

            <TemplateCard
              title="Finish Bottom 3"
              subtitle="Last three, any order"
              quote={bottom3Pick ? odds.bottom_3[String(bottom3Pick)] : undefined}
              format={oddsFormat}
              dropdowns={[
                { label: 'Horse', value: bottom3Pick, onChange: setBottom3Pick, field },
              ]}
              stakeKey="tpl_bottom3"
              stakes={stakes}
              setStake={setStake}
              overBudget={stakedOver}
            />
          </div>

          {odds.over_under_picks.length > 0 && (
            <div className="hr-ou-section">
              <div className="hr-ou-section-head">
                Time O/U Markets
                <span>3 random runners · line at rounded mean of finish time</span>
              </div>
              {odds.over_under_picks.map((ou) => (
                <OverUnderRow
                  key={ou.horse_id}
                  ou={ou}
                  horse={horseById[ou.horse_id]}
                  format={oddsFormat}
                  stakes={stakes}
                  setStake={setStake}
                  overBudget={stakedOver}
                />
              ))}
            </div>
          )}
        </section>
        </div>{/* /.hr-rb-col-left */}

        {/* ─── Right: Props ─── */}
        <section className="hr-q-r">
          <header className="hr-q-head">
            <h2>Props</h2>
            <span className="hr-q-sub">Specials</span>
          </header>

          <PropRow
            label={`First Place wins by > ${odds.prop_thresholds.winby_seconds.toFixed(1)} seconds`}
            quote={odds.props.first_place_margin}
            format={oddsFormat}
            stakeKey="prop_winby"
            stakes={stakes}
            setStake={setStake}
            overBudget={stakedOver}
          />
          <PropRow
            label={`Last Place loses by > ${odds.prop_thresholds.loseby_seconds.toFixed(1)} seconds`}
            quote={odds.props.last_place_margin}
            format={oddsFormat}
            stakeKey="prop_loseby"
            stakes={stakes}
            setStake={setStake}
            overBudget={stakedOver}
          />
          <PropRow
            label={`Any horse finishes in under ${odds.prop_thresholds.fast_seconds.toFixed(1)} seconds`}
            quote={odds.props.any_under_threshold}
            format={oddsFormat}
            stakeKey="prop_fast"
            stakes={stakes}
            setStake={setStake}
            overBudget={stakedOver}
          />
          <PropRow
            label={`Any horse finishes in over ${odds.prop_thresholds.slow_seconds.toFixed(1)} seconds`}
            quote={odds.props.any_over_threshold}
            format={oddsFormat}
            stakeKey="prop_slow"
            stakes={stakes}
            setStake={setStake}
            overBudget={stakedOver}
          />

          {odds.parlays && (
            <div className="hr-parlay-section">
              <div className="hr-ou-section-head">
                Checkpoint Parlays
                <span>Two legs · midpoint then finish · pinned to fav / underdog</span>
              </div>
              <ParlayRow
                flavor="favorite"
                horse={horseById[odds.parlays.favorite_id]}
                legs={[
                  `Leading at the midpoint (${odds.parlays.midpoint_distance.toLocaleString()} lengths)`,
                  `Finishes 1st across the wire (${odds.distance.toLocaleString()} lengths)`,
                ]}
                quote={odds.parlays.favorite_quote}
                infoLine={`P(lead@half) ${(odds.parlays.favorite_p_lead_half * 100).toFixed(0)}% · P(win) ${(odds.parlays.favorite_p_win * 100).toFixed(0)}%`}
                format={oddsFormat}
                stakeKey="parlay_fav"
                stakes={stakes}
                setStake={setStake}
                overBudget={stakedOver}
              />
              <ParlayRow
                flavor="underdog"
                horse={horseById[odds.parlays.underdog_id]}
                legs={[
                  `Last at the midpoint (${odds.parlays.midpoint_distance.toLocaleString()} lengths)`,
                  `Finishes last across the wire (${odds.distance.toLocaleString()} lengths)`,
                ]}
                quote={odds.parlays.underdog_quote}
                infoLine={`P(last@half) ${(odds.parlays.underdog_p_back_half * 100).toFixed(0)}% · P(last) ${(odds.parlays.underdog_p_last * 100).toFixed(0)}%`}
                format={oddsFormat}
                stakeKey="parlay_underdog"
                stakes={stakes}
                setStake={setStake}
                overBudget={stakedOver}
              />
            </div>
          )}
        </section>
      </div>

      <HorseDetailsModal horse={horseDetail} onClose={() => setHorseDetail(null)} />

      <ReviewModal
        isOpen={showReview}
        onClose={() => setShowReview(false)}
        bets={liveBets}
        field={field}
        oddsFormat={oddsFormat}
        totalStake={totalStaked}
        totalPayout={totalPayout}
        bankroll={bankroll}
        onConfirm={() => {
          setShowReview(false);
          onSendOff(liveBets);
        }}
      />
    </div>
  );
}

// ─── Horse sprite (inline SVG, side profile, recolorable saddle) ─────────

/** Side-profile horse, running rightward. Body / mane / legs are a fixed
 *  bay-brown for every horse; only the saddle blanket and the post-number
 *  text recolor per runner. ViewBox is 110×70 — the sprite scales to fill
 *  whatever box its `.hr-race-runner-wrap` container gives it.
 *
 *  Authored as paths so we don't ship a PNG; later we can swap the body
 *  group for a real horse image without changing the saddle / number layer. */
function HorseSprite({
  silksColor, postNumber, racing, imageUrl,
}: {
  silksColor: string;
  postNumber: number;
  racing: boolean;
  imageUrl?: string;             // when provided, render this PNG as the body and keep the saddle/number SVG overlay on top
}) {
  // If a PNG is provided, use it as the body and overlay the saddle + number
  // so saddle recolouring still works the same way.
  if (imageUrl) {
    return (
      <svg
        viewBox="0 0 120 75"
        className={`hr-svg-horse hr-svg-horse-png ${racing ? 'is-racing' : ''}`}
        xmlns="http://www.w3.org/2000/svg"
        aria-label={`Post ${postNumber}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <image
          href={imageUrl}
          x="0" y="0" width="120" height="75"
          preserveAspectRatio="xMidYMid meet"
        />
        {/* Saddle blanket overlay — silks color recolours per horse */}
        <rect
          className="hr-svg-saddle"
          x="42" y="22" width="28" height="9.5" rx="2.2"
          fill={silksColor}
          opacity="0.92"
        />
        <rect
          x="42" y="22" width="28" height="9.5" rx="2.2"
          fill="none" stroke="#1a1208" strokeWidth="0.7"
        />
        <ellipse cx="44.5" cy="22" rx="1.4" ry="1.1" fill="#1a1208" />
        <ellipse cx="68" cy="22" rx="1.1" ry="0.9" fill="#1a1208" />
        <text
          className="hr-svg-num"
          x="56" y="29.5"
          fontSize="8.5" fontWeight={900}
          fill="#1a1208" textAnchor="middle"
          fontFamily="Inter, Arial, sans-serif"
        >
          {postNumber}
        </text>
      </svg>
    );
  }

  // ── HorseSprite v3 — Thoroughbred silhouette ──
  //  Tuned to read as a *racehorse*, not a donkey:
  //    • Body 3.5 : 1 length-to-height (donkey is ~2 : 1)
  //    • Long arched neck dropping forward, with visible withers bump
  //    • Small refined head with extended muzzle, two short alert ears
  //    • Legs reach 30 viewBox-units below the body (≈ same as body length÷2),
  //      with a subtle knee-tuck via a bezier on each leg
  //    • Tail flows back with two trailing wisps for motion
  //  Saddle blanket + post number sit on top so silks recolour per-horse.
  return (
    <svg
      viewBox="0 0 130 80"
      className={`hr-svg-horse ${racing ? 'is-racing' : ''}`}
      xmlns="http://www.w3.org/2000/svg"
      aria-label={`Post ${postNumber}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        {/* Subtle vertical gradient gives the body shading without a hard outline. */}
        <linearGradient id={`hr-body-${postNumber}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#6f4528" />
          <stop offset="55%"  stopColor="#5a3820" />
          <stop offset="100%" stopColor="#3f2716" />
        </linearGradient>
      </defs>

      {/* ─── Far-side legs (drawn first, partially hidden behind body) ─── */}
      <g className="hr-svg-legs hr-svg-legs-rear">
        {/* Far hind leg — gathered, slight knee tuck */}
        <path d="M 32,42 Q 30,50 28,60 L 26,72 L 30,73 L 33,72 Q 34,62 35,52 L 37,42 Z"
              fill="#22150a" />
        {/* Far foreleg — extended forward, knee bend at mid-leg */}
        <path d="M 86,44 Q 89,52 91,62 L 92,73 L 88,73 L 85,72 Q 84,62 83,52 L 82,44 Z"
              fill="#22150a" />
      </g>

      {/* ─── Tail (long, flowing back, with wisps) ─── */}
      <path
        className="hr-svg-tail"
        d="M 24,32 Q 12,28 4,34 Q 1,42 5,48 Q 10,46 16,42 Q 22,38 26,34 Q 28,32 26,30 Z"
        fill="#1a1006"
      />
      <path d="M 6,42 Q 1,42 1,48 Q 5,49 8,45 Z" fill="#1a1006" opacity="0.7" />
      <path d="M 12,38 Q 6,38 5,44 Q 9,44 13,41 Z" fill="#1a1006" opacity="0.55" />

      {/* ─── Hindquarters bulge (powerful muscular rump) ─── */}
      <ellipse cx="34" cy="32" rx="13" ry="13" fill="#5a3820" />

      {/* ─── Main body — long sleek torso, slight back-arch ─── */}
      <path
        d="M 26,30 Q 22,24 32,21 L 60,20 Q 80,20 86,22 Q 92,25 94,30 Q 95,36 90,40 Q 60,42 38,42 Q 28,40 26,30 Z"
        fill={`url(#hr-body-${postNumber})`}
        stroke="#22150a"
        strokeWidth="0.4"
      />

      {/* Withers — small bump where neck meets back, helps read as horse */}
      <path d="M 80,21 Q 84,17 88,20 Q 88,22 86,22 Q 82,22 80,22 Z" fill="#5a3820" />

      {/* ─── Chest bulge (deep chest meeting forelegs) ─── */}
      <ellipse cx="91" cy="34" rx="9" ry="11" fill="#5a3820" />

      {/* Belly highlight (lighter underside) */}
      <ellipse cx="58" cy="40" rx="22" ry="3" fill="#7a4f30" opacity="0.4" />

      {/* ─── Near-side legs (drawn on top of body, slightly different shade) ─── */}
      <g className="hr-svg-legs hr-svg-legs-front">
        {/* Near hind leg — gathered forward in stride (powering off) */}
        <path d="M 40,42 Q 42,52 44,62 L 46,73 L 42,74 L 38,72 Q 37,62 37,52 L 35,42 Z"
              fill="#3a2412" />
        {/* Near foreleg — extended forward, the leading leg */}
        <path d="M 92,44 Q 94,52 96,62 L 96,73 L 92,74 L 88,72 Q 88,62 89,52 L 88,44 Z"
              fill="#3a2412" />
      </g>

      {/* ─── Saddle blanket (silks color — the only piece that recolours) ─── */}
      <rect
        className="hr-svg-saddle"
        x="46" y="22" width="30" height="10" rx="2.4"
        fill={silksColor}
      />
      <rect
        x="46" y="22" width="30" height="10" rx="2.4"
        fill="none" stroke="#1a1208" strokeWidth="0.7"
      />
      {/* Pommel + cantle */}
      <ellipse cx="48.5" cy="22" rx="1.4" ry="1.1" fill="#1a1208" />
      <ellipse cx="73" cy="22" rx="1.1" ry="0.9" fill="#1a1208" />

      {/* ─── Post number on saddle ─── */}
      <text
        className="hr-svg-num"
        x="61" y="29.5"
        fontSize="8.8" fontWeight={900}
        fill="#1a1208" textAnchor="middle"
        fontFamily="Inter, Arial, sans-serif"
      >
        {postNumber}
      </text>

      {/* ─── Neck (long, arched gracefully forward and down) ─── */}
      <path
        d="M 86,22 Q 96,12 110,7 L 116,8 Q 118,12 116,17 L 110,18 Q 102,24 95,30 L 86,30 Z"
        fill="#5a3820"
        stroke="#22150a" strokeWidth="0.4"
      />

      {/* ─── Mane (along top of neck, dark, flowing into wind) ─── */}
      <path d="M 84,20 Q 96,8 112,3 L 110,0.5 Q 96,4 80,18 Q 81,19 84,20 Z" fill="#1a1006" />
      {/* A wisp at the base of the neck (motion) */}
      <path d="M 86,18 Q 84,14 86,10 Q 89,14 89,18 Z" fill="#1a1006" opacity="0.85" />
      {/* Forelock between the ears */}
      <path d="M 113,4 Q 116,2 119,4 L 117,7 Q 115,6 113,7 Z" fill="#1a1006" />

      {/* ─── Head (small, refined, slightly down-tilted in racing posture) ─── */}
      <path
        d="M 113,6 Q 122,7 124,12 L 124,17 Q 122,20 117,20 Q 113,15 113,6 Z"
        fill="#5a3820"
        stroke="#22150a" strokeWidth="0.4"
      />

      {/* Two short alert ears (don't extend above viewBox) */}
      <path d="M 115,3 L 116,1 L 118,3 Z" fill="#22150a" />
      <path d="M 119,2 L 120.5,1 L 122,2 Z" fill="#22150a" />

      {/* Eye + tiny catchlight */}
      <circle cx="119" cy="12" r="0.7" fill="#0d0805" />
      <circle cx="119.2" cy="11.8" r="0.22" fill="#a37a52" />

      {/* Nostril + soft mouth line */}
      <ellipse cx="123" cy="15" rx="0.6" ry="0.4" fill="#0d0805" />
      <path d="M 121,18 Q 123,18.5 124,17.5"
            stroke="#1a1208" strokeWidth="0.4" fill="none" strokeLinecap="round" />

      {/* Muzzle highlight (lighter shade at front of nose) */}
      <ellipse cx="122" cy="17" rx="2" ry="1.3" fill="#7a4f30" opacity="0.35" />
    </svg>
  );
}

// ─── Selection display helpers (badge + name pairs) ─────────────────────

function HorseBadge({ horse, size = 'md' }: { horse: HorseInField | undefined; size?: 'sm' | 'md' }) {
  if (!horse) return null;
  return (
    <span
      className={`hr-sel-badge hr-sel-badge-${size}`}
      style={{ background: horse.silks_color }}
      title={horse.full_name}
    >
      {horse.post_position}
    </span>
  );
}

/** Renders the bet's selection cell with colored post-number badges next to
 *  any horse names. Falls back to the plain selection_label for non-horse
 *  props (where `selection_ids` is empty). */
function BetSelectionLabel({
  bet, horseById,
}: {
  bet: LiveBet;
  horseById: Record<number, HorseInField>;
}) {
  if (bet.selection_ids.length === 0) {
    return <span className="hr-sel-label">{bet.selection_label}</span>;
  }
  if (bet.selection_ids.length === 1) {
    const h = horseById[bet.selection_ids[0]];
    // O/U time markets need the side + line shown explicitly so the review
    // table tells the user *exactly* what they bet on, not just the horse.
    if (bet.market === 'prop_finish_over' || bet.market === 'prop_finish_under') {
      const side = bet.market === 'prop_finish_over' ? 'OVER' : 'UNDER';
      const line = bet.meta?.line_seconds ?? '?';
      return (
        <span className="hr-sel-label">
          <HorseBadge horse={h} />
          <span>{h?.full_name ?? `#${bet.selection_ids[0]}`}</span>
          <span className={`hr-sel-side hr-sel-side-${side.toLowerCase()}`}>{side} {line}s</span>
        </span>
      );
    }
    // Spell out the win-style markets in plain English on the selection cell.
    const explicitVerb: Partial<Record<Market, string>> = {
      win:         'to finish 1st',
      place:       'top 2',
      show:        'top 3',
      finish_last: 'to finish last',
      bottom_3:    'bottom 3',
    };
    const verb = explicitVerb[bet.market];
    return (
      <span className="hr-sel-label">
        <HorseBadge horse={h} />
        <span>{h?.full_name ?? bet.selection_label}</span>
        {verb && <span className="hr-sel-verb">{verb}</span>}
      </span>
    );
  }
  // Two-horse markets — top2_exact (ordered) and duel (A ahead of B).
  const [aId, bId] = bet.selection_ids;
  const ha = horseById[aId];
  const hb = horseById[bId];
  const sep = bet.market === 'top2_exact' ? '→' : 'ahead of';
  return (
    <span className="hr-sel-label">
      <HorseBadge horse={ha} />
      <span>{ha?.full_name}</span>
      <span className="hr-sel-sep">{sep}</span>
      <HorseBadge horse={hb} />
      <span>{hb?.full_name}</span>
    </span>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────

/** Centered modal showing the full horse bio — bigger and more readable
 *  than the hover tooltip. Triggered by clicking the horse name on the
 *  W/P/S table. Hover tooltip stays for quick stat peeks. */
function HorseDetailsModal({
  horse, onClose,
}: {
  horse: HorseInField | null;
  onClose: () => void;
}) {
  // Lock body scroll + ESC to close while open.
  useEffect(() => {
    if (!horse) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [horse, onClose]);

  if (!horse) return null;

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

  return (
    <div className="hr-modal-root">
      <div className="hr-modal-backdrop" onClick={onClose} />
      <div className="hr-modal-panel hr-horse-detail-panel">
        <header className="hr-modal-head">
          <div className="hr-horse-detail-head">
            <span
              className="hr-horse-detail-saddle"
              style={{ background: horse.silks_color }}
            >
              {horse.post_position}
            </span>
            <div className="hr-horse-detail-titles">
              <h2>
                {horse.full_name}
                <CountryFlag iso={horse.country} />
              </h2>
              <span className="hr-horse-detail-saddle-label">"{horse.saddle_name}"</span>
            </div>
          </div>
          <button className="hr-modal-close" onClick={onClose}>✕</button>
        </header>

        <div className="hr-modal-body">
          <div className="hr-horse-detail-stats">
            <div>
              <span>Speed</span>
              <strong>{horse.mean_speed.toFixed(2)}</strong>
              <em>μ</em>
            </div>
            <div>
              <span>Mood Swings</span>
              <strong>{moodLabel(horse.speed_volatility)}</strong>
              <em>σ {horse.speed_volatility.toFixed(2)}</em>
            </div>
            <div>
              <span>Composure</span>
              <strong>{composureLabel(horse.pace_stickiness)}</strong>
              <em>α {horse.pace_stickiness.toFixed(2)}</em>
            </div>
          </div>

          {horse.stats && (
            <div className="hr-horse-detail-career">
              <h3>Career</h3>
              <div className="hr-horse-detail-career-grid">
                <div><span>Participations</span><strong>{horse.stats.participations}</strong></div>
                <div><span>Wins</span><strong>{horse.stats.wins}</strong></div>
                <div><span>Places</span><strong>{horse.stats.places}</strong></div>
                <div><span>Shows</span><strong>{horse.stats.shows}</strong></div>
                <div>
                  <span>Best Time</span>
                  <strong>
                    {horse.stats.best_seconds != null ? `${horse.stats.best_seconds.toFixed(2)}s` : '—'}
                  </strong>
                </div>
              </div>

              {horse.stats.last_3_results && horse.stats.last_3_results.length > 0 ? (
                <div className="hr-horse-detail-recent">
                  <h4>Last {horse.stats.last_3_results.length} Race{horse.stats.last_3_results.length === 1 ? '' : 's'}</h4>
                  <table className="hr-stats-table hr-horse-detail-table">
                    <thead>
                      <tr>
                        <th>Edition</th>
                        <th>Finish</th>
                        <th className="hr-stats-num">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {horse.stats.last_3_results.map((r) => (
                        <tr key={r.year} className={r.finish_position === 1 ? 'is-winner' : ''}>
                          <td>{fmtEdition(r.year)}</td>
                          <td>P{r.finish_position}</td>
                          <td className="hr-stats-num">{r.finish_seconds.toFixed(2)}s</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="hr-horse-detail-no-races">
                  No prior race results on record yet.
                </p>
              )}
            </div>
          )}

          {horse.description && (
            <div className="hr-horse-detail-bio">
              <h3>Bio</h3>
              <p>{horse.description}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function HorseTooltip({ horse }: { horse: HorseInField }) {
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
  return (
    <div className="hr-wps-tooltip" role="tooltip">
      <div className="hr-wps-tooltip-head">
        <span className="hr-card-saddle" style={{ background: horse.silks_color }}>{horse.saddle_name}</span>
        <span className="hr-wps-tooltip-name">
          {horse.full_name}
          <CountryFlag iso={horse.country} />
        </span>
      </div>
      <div className="hr-wps-tooltip-stats">
        <div><span>Speed</span><strong>{horse.mean_speed.toFixed(2)}</strong></div>
        <div><span>Mood Swings</span><strong>{moodLabel(horse.speed_volatility)}</strong></div>
        <div><span>Composure</span><strong>{composureLabel(horse.pace_stickiness)}</strong></div>
      </div>
      {horse.description && <p className="hr-wps-tooltip-desc">{horse.description}</p>}
    </div>
  );
}

interface OddsCellProps {
  quote: OddsQuote | undefined;
  format: OddsFormat;
  stakeKey: string;
  stakes: Record<string, string>;
  setStake: (k: string, v: string) => void;
  overBudget: boolean;
}

function OddsCell({ quote, format, stakeKey, stakes, setStake, overBudget }: OddsCellProps) {
  const value = stakes[stakeKey] || '';
  const stake = parseFloat(value);
  const hasStake = Number.isFinite(stake) && stake > 0;
  const locked = !!quote?.locked;
  const profit = hasStake && quote && quote.decimal != null ? stake * (quote.decimal - 1) : 0;
  return (
    <span className="hr-odds-cell">
      <div className="hr-odds-cell-row">
        <span className={`hr-odds-pill ${locked ? 'is-locked' : ''}`} title={locked ? 'Market locked' : undefined}>
          {fmtOdds(quote, format)}
        </span>
        {locked ? (
          <span className="hr-lock-pill" title="Too short — book won’t price">LOCKED</span>
        ) : (
          <input
            className={`hr-stake-inline ${hasStake ? 'is-stake-active' : ''} ${hasStake && overBudget ? 'is-over' : ''}`}
            type="number"
            min={0}
            step="0.5"
            placeholder="$"
            value={value}
            onChange={(e) => setStake(stakeKey, e.target.value)}
            disabled={!quote}
          />
        )}
      </div>
      {hasStake && quote && !locked && (
        <span className="hr-towin">To win {fmtUsd(profit)}</span>
      )}
    </span>
  );
}

interface DropdownDef {
  label: string;                      // placeholder shown when nothing picked
  persistentLabel?: string;           // small chip kept visible alongside the dropdown (e.g. "1st", "2nd")
  value: number | null;
  onChange: (v: number | null) => void;
  field: HorseInField[];
  exclude?: number | null;
}

/** Custom horse picker — native <select> can't render colored badges,
 *  so we roll our own. Closes on outside click / Esc. */
function HorseSelect({
  value, onChange, field, exclude, placeholder,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  field: HorseInField[];
  exclude?: number | null;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = React.useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const selected = field.find((h) => h.horse_id === value) || null;
  const options = field.filter((h) => h.horse_id !== exclude);

  return (
    <div className={`hr-hsel ${open ? 'is-open' : ''}`} ref={wrapRef}>
      <button
        type="button"
        className={`hr-hsel-trigger ${selected ? 'is-picked' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {selected ? (
          <>
            <span className="hr-hsel-badge" style={{ background: selected.silks_color }}>
              {selected.post_position}
            </span>
            <span className="hr-hsel-name">{selected.saddle_name}</span>
          </>
        ) : (
          <span className="hr-hsel-placeholder">{placeholder}</span>
        )}
        <span className="hr-hsel-caret" aria-hidden>▾</span>
      </button>
      {open && (
        <ul className="hr-hsel-menu" role="listbox">
          <li
            className="hr-hsel-opt hr-hsel-opt-clear"
            role="option"
            aria-selected={value == null}
            onClick={() => { onChange(null); setOpen(false); }}
          >
            <span className="hr-hsel-name hr-hsel-name-dim">{placeholder}</span>
          </li>
          {options.map((h) => (
            <li
              key={h.horse_id}
              className={`hr-hsel-opt ${h.horse_id === value ? 'is-selected' : ''}`}
              role="option"
              aria-selected={h.horse_id === value}
              onClick={() => { onChange(h.horse_id); setOpen(false); }}
            >
              <span className="hr-hsel-badge" style={{ background: h.silks_color }}>
                {h.post_position}
              </span>
              <span className="hr-hsel-name">{h.saddle_name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TemplateCard({
  title, subtitle, quote, format, dropdowns, stakeKey, stakes, setStake, overBudget,
}: {
  title: string;
  subtitle: string;
  quote: OddsQuote | undefined;
  format: OddsFormat;
  dropdowns: DropdownDef[];
  stakeKey: string;
  stakes: Record<string, string>;
  setStake: (k: string, v: string) => void;
  overBudget: boolean;
}) {
  const value = stakes[stakeKey] || '';
  const hasStake = parseFloat(value) > 0;
  return (
    <div className="hr-tpl-card">
      <header className="hr-tpl-head">
        <h3>{title}</h3>
        <span>{subtitle}</span>
      </header>
      <div className="hr-tpl-pickers">
        {dropdowns.map((d, i) => (
          <div key={i} className="hr-tpl-picker-row">
            {d.persistentLabel && (
              <span className="hr-tpl-picker-tag">{d.persistentLabel}</span>
            )}
            <HorseSelect
              value={d.value}
              onChange={d.onChange}
              field={d.field}
              exclude={d.exclude ?? null}
              placeholder={d.label}
            />
          </div>
        ))}
      </div>
      <div className="hr-tpl-quote-row">
        <span className={`hr-tpl-quote ${quote?.locked ? 'is-locked' : ''}`}>{fmtOdds(quote, format)}</span>
        {quote?.locked ? (
          <span className="hr-lock-pill" title="Too short — book won’t price">LOCKED</span>
        ) : (
          <input
            className={`hr-tpl-stake ${hasStake ? 'is-stake-active' : ''} ${hasStake && overBudget ? 'is-over' : ''}`}
            type="number"
            min={0}
            step="0.5"
            placeholder="Stake"
            value={value}
            onChange={(e) => setStake(stakeKey, e.target.value)}
            disabled={!quote}
          />
        )}
      </div>
      {hasStake && quote && !quote.locked && quote.decimal != null && (
        <div className="hr-towin hr-towin-tpl">To win {fmtUsd(parseFloat(value) * (quote.decimal - 1))}</div>
      )}
    </div>
  );
}

/** Parlay row — one horse (favorite OR underdog), two legs, single quote. */
function ParlayRow({
  flavor, horse, legs, quote, infoLine, format, stakeKey, stakes, setStake, overBudget,
}: {
  flavor: 'favorite' | 'underdog';
  horse: HorseInField | undefined;
  legs: [string, string];                // ["1st to 1500", "Wins (1st to 3000)"]
  quote: OddsQuote | undefined;
  infoLine?: string;                     // small print, e.g. raw probabilities
  format: OddsFormat;
  stakeKey: string;
  stakes: Record<string, string>;
  setStake: (k: string, v: string) => void;
  overBudget: boolean;
}) {
  const value = stakes[stakeKey] || '';
  const hasStake = parseFloat(value) > 0;
  const locked = !!quote?.locked;
  const profit = hasStake && quote && quote.decimal != null ? parseFloat(value) * (quote.decimal - 1) : 0;
  return (
    <div className={`hr-parlay-row hr-parlay-${flavor}`}>
      <div className="hr-parlay-head">
        <span className={`hr-parlay-tag hr-parlay-tag-${flavor}`}>
          {flavor === 'favorite' ? 'FAVORITE' : 'UNDERDOG'}
        </span>
        <HorseBadge horse={horse} size="sm" />
        <span className="hr-parlay-name">{horse?.full_name ?? '—'}</span>
      </div>
      <div className="hr-parlay-legs">
        <div className="hr-parlay-leg">
          <span className="hr-parlay-leg-num">1</span>
          <span>{legs[0]}</span>
        </div>
        <div className="hr-parlay-leg">
          <span className="hr-parlay-leg-num">2</span>
          <span>{legs[1]}</span>
        </div>
      </div>
      <div className="hr-parlay-quote-row">
        <span className={`hr-tpl-quote ${locked ? 'is-locked' : ''}`}>{fmtOdds(quote, format)}</span>
        {locked ? (
          <span className="hr-lock-pill" title="Too short — book won’t price">LOCKED</span>
        ) : (
          <input
            className={`hr-tpl-stake ${hasStake ? 'is-stake-active' : ''} ${hasStake && overBudget ? 'is-over' : ''}`}
            type="number" min={0} step="0.5" placeholder="Stake"
            value={value}
            onChange={(e) => setStake(stakeKey, e.target.value)}
            disabled={!quote}
          />
        )}
      </div>
      {hasStake && quote && !locked && (
        <div className="hr-towin hr-towin-tpl">to win {fmtUsd(profit)}</div>
      )}
      {infoLine && <div className="hr-parlay-info">{infoLine}</div>}
    </div>
  );
}

/** Over/Under finish-time row — one horse, one line, two priced sides. */
function OverUnderRow({
  ou, horse, format, stakes, setStake, overBudget,
}: {
  ou: { horse_id: number; line_seconds: number; mean_seconds: number; over: OddsQuote; under: OddsQuote };
  horse: HorseInField | undefined;
  format: OddsFormat;
  stakes: Record<string, string>;
  setStake: (k: string, v: string) => void;
  overBudget: boolean;
}) {
  const overKey = `prop_ou_over_${ou.horse_id}`;
  const underKey = `prop_ou_under_${ou.horse_id}`;
  const overVal = stakes[overKey] || '';
  const underVal = stakes[underKey] || '';
  const overActive = parseFloat(overVal) > 0;
  const underActive = parseFloat(underVal) > 0;
  const overLocked = !!ou.over?.locked;
  const underLocked = !!ou.under?.locked;
  const overProfit  = overActive  && ou.over.decimal  != null ? parseFloat(overVal)  * (ou.over.decimal  - 1) : 0;
  const underProfit = underActive && ou.under.decimal != null ? parseFloat(underVal) * (ou.under.decimal - 1) : 0;

  return (
    <div className="hr-ou-row">
      <div className="hr-ou-head">
        <HorseBadge horse={horse} size="sm" />
        <span className="hr-ou-name">{horse?.full_name ?? `#${ou.horse_id}`}</span>
        <span className="hr-ou-line">
          Line <strong>{ou.line_seconds}s</strong>
          <em>μ {ou.mean_seconds.toFixed(2)}s</em>
        </span>
      </div>
      <div className="hr-ou-sides">
        <div className="hr-ou-side">
          <span className="hr-ou-tag hr-ou-tag-over">OVER {ou.line_seconds}s</span>
          <span className={`hr-tpl-quote ${overLocked ? 'is-locked' : ''}`}>{fmtOdds(ou.over, format)}</span>
          {overLocked ? (
            <span className="hr-lock-pill">LOCKED</span>
          ) : (
            <input
              className={`hr-tpl-stake ${overActive ? 'is-stake-active' : ''} ${overActive && overBudget ? 'is-over' : ''}`}
              type="number" min={0} step="0.5" placeholder="$"
              value={overVal}
              onChange={(e) => setStake(overKey, e.target.value)}
            />
          )}
          {overActive && !overLocked && <span className="hr-towin hr-towin-tpl">to win {fmtUsd(overProfit)}</span>}
        </div>
        <div className="hr-ou-side">
          <span className="hr-ou-tag hr-ou-tag-under">UNDER {ou.line_seconds}s</span>
          <span className={`hr-tpl-quote ${underLocked ? 'is-locked' : ''}`}>{fmtOdds(ou.under, format)}</span>
          {underLocked ? (
            <span className="hr-lock-pill">LOCKED</span>
          ) : (
            <input
              className={`hr-tpl-stake ${underActive ? 'is-stake-active' : ''} ${underActive && overBudget ? 'is-over' : ''}`}
              type="number" min={0} step="0.5" placeholder="$"
              value={underVal}
              onChange={(e) => setStake(underKey, e.target.value)}
            />
          )}
          {underActive && !underLocked && <span className="hr-towin hr-towin-tpl">to win {fmtUsd(underProfit)}</span>}
        </div>
      </div>
    </div>
  );
}

function PropRow({
  label, quote, format, stakeKey, stakes, setStake, overBudget,
}: {
  label: string;
  quote: OddsQuote | undefined;
  format: OddsFormat;
  stakeKey: string;
  stakes: Record<string, string>;
  setStake: (k: string, v: string) => void;
  overBudget: boolean;
}) {
  const value = stakes[stakeKey] || '';
  const hasStake = parseFloat(value) > 0;
  const locked = !!quote?.locked;
  return (
    <div className="hr-prop-row">
      <div className="hr-prop-label" dangerouslySetInnerHTML={{ __html: label }} />
      <div className="hr-prop-quote-row">
        <span className={`hr-tpl-quote ${locked ? 'is-locked' : ''}`}>{fmtOdds(quote, format)}</span>
        {locked ? (
          <span className="hr-lock-pill" title="Too short — book won’t price">LOCKED</span>
        ) : (
          <input
            className={`hr-tpl-stake ${hasStake ? 'is-stake-active' : ''} ${hasStake && overBudget ? 'is-over' : ''}`}
            type="number"
            min={0}
            step="0.5"
            placeholder="Stake"
            value={value}
            onChange={(e) => setStake(stakeKey, e.target.value)}
            disabled={!quote}
          />
        )}
      </div>
      {hasStake && quote && !locked && quote.decimal != null && (
        <div className="hr-towin hr-towin-tpl">To win {fmtUsd(parseFloat(value) * (quote.decimal - 1))}</div>
      )}
    </div>
  );
}

// ─── Review Bets modal ────────────────────────────────────────────────────

function ReviewModal({
  isOpen, onClose, bets, field, oddsFormat, totalStake, totalPayout, bankroll, onConfirm,
}: {
  isOpen: boolean;
  onClose: () => void;
  bets: LiveBet[];
  field: HorseInField[];
  oddsFormat: OddsFormat;
  totalStake: number;
  totalPayout: number;
  bankroll: number;
  onConfirm: () => void;
}) {
  if (!isOpen) return null;
  const horseById: Record<number, HorseInField> = {};
  for (const h of field) horseById[h.horse_id] = h;

  return (
    <div className="hr-modal-root">
      <div className="hr-modal-backdrop" onClick={onClose} />
      <div className="hr-modal-panel hr-review-panel">
        <header className="hr-modal-head">
          <h2>Review Your Bets</h2>
          <button className="hr-modal-close" onClick={onClose}>✕</button>
        </header>

        <div className="hr-modal-body">
          <table className="hr-review-table">
            <thead>
              <tr>
                <th>Market</th>
                <th>Selection</th>
                <th className="hr-review-num">Odds</th>
                <th className="hr-review-num">Stake</th>
                <th className="hr-review-num">Potential Payout</th>
              </tr>
            </thead>
            <tbody>
              {bets.map((b) => {
                const oddsStr = oddsFormat === 'decimal'
                  ? b.decimal.toFixed(2)
                  : (b.american >= 0 ? `+${b.american}` : `${b.american}`);
                const payout = b.stake * b.decimal;
                return (
                  <tr key={b.key}>
                    <td>{b.market_label}</td>
                    <td><BetSelectionLabel bet={b} horseById={horseById} /></td>
                    <td className="hr-review-num">{oddsStr}</td>
                    <td className="hr-review-num">{fmtUsd(b.stake)}</td>
                    <td className="hr-review-num hr-review-payout">{fmtUsd(payout)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} className="hr-review-total-label">Totals</td>
                <td className="hr-review-num"><strong>{fmtUsd(totalStake)}</strong></td>
                <td className="hr-review-num"><strong>{fmtUsd(totalPayout)}</strong></td>
              </tr>
              <tr>
                <td colSpan={3} className="hr-review-meta">
                  Bankroll exposure: {fmtUsd(totalStake)} of {fmtUsd(bankroll)}
                </td>
                <td colSpan={2} className="hr-review-meta hr-review-num">
                  Max profit if all hit: {fmtUsd(totalPayout - totalStake)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <footer className="hr-modal-footer">
          <button className="hr-btn-secondary" onClick={onClose}>Edit</button>
          <button className="hr-btn-primary" onClick={onConfirm}>Confirm &amp; Race →</button>
        </footer>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Bet evaluation — pure function, called once after the race is over
// ═══════════════════════════════════════════════════════════════════════

interface SettledBet extends LiveBet {
  won: boolean;
  pnl: number;                   // -stake on a loss, stake*(decimal-1) on a win
  reason: string;                // human-readable reason ("1st place", "missed top 2", ...)
}

function fmtSec(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`;
}

function evaluateBet(bet: LiveBet, t: RaceTrajectory): { won: boolean; reason: string } {
  const order = t.finish_order;
  const first = order[0];
  const second = order[1];
  const last = order[order.length - 1];
  const finishMsById: Record<number, number> = {};
  for (const f of t.finishes) finishMsById[f.horse_id] = f.finish_ms;

  const sel = bet.selection_ids;
  const inOrder = (n: number) => order.slice(0, n);
  const fromEnd = (n: number) => order.slice(-n);

  switch (bet.market) {
    case 'win': {
      const won = first === sel[0];
      return { won, reason: won ? 'Finished 1st' : `Finished ${order.indexOf(sel[0]) + 1}` };
    }
    case 'place': {
      const won = inOrder(2).includes(sel[0]);
      return { won, reason: won ? 'Top 2 finish' : `Finished ${order.indexOf(sel[0]) + 1}` };
    }
    case 'show': {
      const won = inOrder(3).includes(sel[0]);
      return { won, reason: won ? 'Top 3 finish' : `Finished ${order.indexOf(sel[0]) + 1}` };
    }
    case 'top2_exact': {
      const won = first === sel[0] && second === sel[1];
      let reason: string;
      if (won) reason = 'Hit 1st & 2nd in order';
      else if (first === sel[0]) reason = '1st correct, 2nd missed';
      else if (second === sel[1]) reason = '2nd correct, 1st missed';
      else reason = 'Both legs missed';
      return { won, reason };
    }
    case 'finish_last': {
      const won = last === sel[0];
      const place = order.indexOf(sel[0]) + 1;
      return { won, reason: won ? 'Back-marker as called' : `Finished ${place}, not last` };
    }
    case 'duel': {
      const a = sel[0], b = sel[1];
      const won = (finishMsById[a] ?? Infinity) < (finishMsById[b] ?? Infinity);
      return {
        won,
        reason: won
          ? `Finished ${order.indexOf(a) + 1} vs. ${order.indexOf(b) + 1}`
          : `Finished ${order.indexOf(a) + 1} vs. ${order.indexOf(b) + 1}`,
      };
    }
    case 'bottom_3': {
      const won = fromEnd(3).includes(sel[0]);
      const place = order.indexOf(sel[0]) + 1;
      return { won, reason: won ? `Bottom 3 (P${place})` : `Finished ${place}` };
    }
    case 'prop_first_margin': {
      const margin = (finishMsById[second] ?? 0) - (finishMsById[first] ?? 0);
      const thresh = t.thresholds.winby_ms;
      const won = margin > thresh;
      return {
        won,
        reason: `1st – 2nd margin ${(margin / 1000).toFixed(2)}s (need >${(thresh / 1000).toFixed(1)}s)`,
      };
    }
    case 'prop_last_margin': {
      const secondLast = order[order.length - 2];
      const margin = (finishMsById[last] ?? 0) - (finishMsById[secondLast] ?? 0);
      const thresh = t.thresholds.loseby_ms;
      const won = margin > thresh;
      return {
        won,
        reason: `Last margin ${(margin / 1000).toFixed(2)}s (need >${(thresh / 1000).toFixed(1)}s)`,
      };
    }
    case 'prop_any_under': {
      const fastestMs = Math.min(...t.finishes.map((f) => f.finish_ms));
      const thresh = t.thresholds.fast_ms;
      const won = fastestMs < thresh;
      const winnerId = t.finishes.find((f) => f.finish_ms === fastestMs)?.horse_id;
      return {
        won,
        reason: `Fastest ${(fastestMs / 1000).toFixed(2)}s${winnerId ? ` (P${order.indexOf(winnerId) + 1})` : ''} vs <${(thresh / 1000).toFixed(1)}s`,
      };
    }
    case 'prop_any_over': {
      const slowestMs = Math.max(...t.finishes.map((f) => f.finish_ms));
      const thresh = t.thresholds.slow_ms;
      const won = slowestMs > thresh;
      return {
        won,
        reason: `Slowest ${(slowestMs / 1000).toFixed(2)}s vs >${(thresh / 1000).toFixed(1)}s`,
      };
    }
    case 'prop_finish_over': {
      const id = sel[0];
      const lineMs = (bet.meta?.line_seconds ?? 0) * 1000;
      const finishMs = finishMsById[id] ?? 0;
      const won = finishMs > lineMs;
      return {
        won,
        reason: `Finished ${(finishMs / 1000).toFixed(2)}s vs OVER ${(lineMs / 1000).toFixed(0)}s line`,
      };
    }
    case 'prop_finish_under': {
      const id = sel[0];
      const lineMs = (bet.meta?.line_seconds ?? 0) * 1000;
      const finishMs = finishMsById[id] ?? 0;
      const won = finishMs < lineMs;
      return {
        won,
        reason: `Finished ${(finishMs / 1000).toFixed(2)}s vs UNDER ${(lineMs / 1000).toFixed(0)}s line`,
      };
    }
    case 'parlay_fav': {
      const favId = sel[0];
      const wonHalf = t.midpoint_leader_id === favId;
      const wonRace = first === favId;
      const won = wonHalf && wonRace;
      let reason: string;
      if (won) reason = `Led at ${t.midpoint_distance.toLocaleString()} AND won`;
      else if (!wonHalf && !wonRace) reason = 'Missed both legs';
      else if (!wonHalf) reason = 'Wasn’t 1st at midpoint';
      else reason = 'Led at midpoint but didn’t win';
      return { won, reason };
    }
    case 'parlay_underdog': {
      const dogId = sel[0];
      const lastHalf = t.midpoint_backmarker_id === dogId;
      const finishedLast = last === dogId;
      const won = lastHalf && finishedLast;
      let reason: string;
      if (won) reason = `Last at ${t.midpoint_distance.toLocaleString()} AND last at end`;
      else if (!lastHalf && !finishedLast) reason = 'Missed both legs';
      else if (!lastHalf) reason = 'Wasn’t last at midpoint';
      else reason = 'Last at midpoint but didn’t finish last';
      return { won, reason };
    }
  }
}

function settleBets(bets: LiveBet[], trajectory: RaceTrajectory): SettledBet[] {
  return bets.map((b) => {
    const { won, reason } = evaluateBet(b, trajectory);
    const pnl = won ? b.stake * (b.decimal - 1) : -b.stake;
    return { ...b, won, pnl, reason };
  });
}

// ═══════════════════════════════════════════════════════════════════════
// View 4 — Race (animated)
// ═══════════════════════════════════════════════════════════════════════

const COUNTDOWN_MS = 2200;            // gates-closed phase before the bell
const POST_FINISH_LINGER_MS = 1500;   // beat between last finish and the popup

function RaceView({
  field, trajectory, odds, bets, oddsFormat, onSettle, onCommentaryActiveChange,
  onCommentaryCCChange, bettorSessions,
}: {
  field: HorseInField[];
  trajectory: RaceTrajectory;
  odds: RaceOdds;            // pre-race odds — used to build post-race commentary context (upset framing)
  bets: LiveBet[];
  oddsFormat: OddsFormat;
  onSettle: () => void;
  onCommentaryActiveChange: (active: boolean) => void;  // duck the crowd at top-level
  onCommentaryCCChange: (cc: CommentaryCCState | null) => void;
  // Optional — when provided and length>1, the in-race bets panel can
  // tab between bettors. The aggregate `bets` prop above is still the
  // source of truth for race-time evaluation/animation.
  bettorSessions?: BettorSession[];
}) {
  // phase: 'countdown' (gates closed, ticking down) → 'racing' → 'finished'
  const [phase, setPhase] = useState<'countdown' | 'racing' | 'finished'>('countdown');
  const [countdown, setCountdown] = useState(Math.ceil(COUNTDOWN_MS / 1000));
  const [clockMs, setClockMs] = useState(0);
  const [liveFinishes, setLiveFinishes] = useState<{ horse_id: number; finish_ms: number; place: number }[]>([]);
  const [liveTop3, setLiveTop3] = useState<number[]>([]);   // horse_ids in current order, mid-race
  const [showResults, setShowResults] = useState(false);
  // Goes true the instant the LAST horse crosses (or hits the DQ siren).
  // We trigger the post-race commentary fetch on this — gives the API call
  // a 1.5+ second head start before the official-result modal opens, so the
  // announcer is queued and ready instead of loading after the user already
  // sees the result. ── essential because each fetch+TTS takes 3-5s.
  const [allFinished, setAllFinished] = useState(false);

  // Per-horse direct DOM refs — updating transform in RAF avoids re-render thrash.
  const runnerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const startedAtRef = useRef<number | null>(null);
  const racingStartedRef = useRef<number | null>(null);
  const finishedSetRef = useRef<Set<number>>(new Set());
  const lastTop3SyncRef = useRef(0);
  const liveTop3Ref = useRef<number[]>([]);
  const resultsPersistedRef = useRef(false);  // ensure /finish-race fires exactly once
  const postCommentaryFetchedRef = useRef(false);

  // Persist the official result + bump year_counter the moment all horses
  // have crossed the wire. Idempotent on the backend, but we also gate here
  // with a ref so a re-render can't double-submit.
  useEffect(() => {
    if (!showResults || resultsPersistedRef.current) return;
    resultsPersistedRef.current = true;
    const payload = {
      field_size: field.length,
      distance: trajectory.distance,
      finishes: trajectory.finishes.map((f) => ({
        horse_id: f.horse_id,
        finish_position: f.finish_position,
        finish_seconds: f.finish_ms / 1000,
      })),
    };
    finishRace(payload).catch((err) => {
      // Non-fatal — race still settles client-side. Log for visibility.
      // eslint-disable-next-line no-console
      console.warn('[finishRace] failed to persist result:', err?.message ?? err);
    });
  }, [showResults, field, trajectory]);

  // Post-race AI commentary — fires the SECOND the last horse crosses
  // (allFinished), NOT when the modal pops. The TTS fetch takes ~25s, so
  // we trigger it 1.5s+ before the modal opens to get a head start.
  //
  // CRITICAL: We use a module-level `new Audio()` (NOT a JSX-bound ref)
  // because the user can click "Proceed to Settle Bets" before the TTS
  // download finishes, which unmounts RaceView and would null out a
  // ref-bound audio element. The Audio JS object lives outside React, so
  // the announcer plays cleanly over the settlement screen. The audio is
  // explicitly stopped on next-race/new-session via stopPostCommentary().
  useEffect(() => {
    /* eslint-disable no-console */
    console.info('[commentary post] effect ran', {
      allFinished, already_fetched: postCommentaryFetchedRef.current,
    });
    /* eslint-enable no-console */
    if (!allFinished || postCommentaryFetchedRef.current) return;
    postCommentaryFetchedRef.current = true;
    // Tell the top-level audio mixer to duck the crowd.
    onCommentaryActiveChange(true);

    // eslint-disable-next-line no-console
    console.info('[commentary post] fetching for race finish');
    fetchCommentary({
      phase: 'post',
      field,
      trajectory,
      odds,                                   // pre-race odds for upset framing
      year_counter: trajectory.year_counter,
      distance: trajectory.distance,
    }).then((clip) => {
      const url = b64ToBlobUrl(clip.audio_b64, clip.audio_mime || 'audio/mpeg');
      // Tear down any previous post-race clip (e.g., from a prior race
      // that still hadn't finished playing) so we never stack announcers.
      stopPostCommentary();
      const audio = new Audio(url);
      audio.volume = COMMENTARY_VOLUME;
      audio.preload = 'auto';
      // When the announcer finishes naturally, restore the crowd level,
      // clear the CC bar, and free the blob URL.
      audio.addEventListener('ended', () => {
        // eslint-disable-next-line no-console
        console.info('[commentary post] ended — un-ducking crowd');
        onCommentaryActiveChange(false);
        onCommentaryCCChange(null);
        stopPostCommentary();
      });
      _postCommentaryAudio = audio;
      _postCommentaryUrl = url;
      // eslint-disable-next-line no-console
      console.info('[commentary post] calling play() on detached Audio()', {
        text_chars: clip.text?.length ?? 0,
        audio_chars: clip.audio_b64?.length ?? 0,
      });
      audio.play()
        // eslint-disable-next-line no-console
        .then(() => console.info('[commentary post] play() succeeded — audio rolling'))
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.warn('[commentary post] play() rejected (autoplay?):', err?.name, err?.message ?? err);
          onCommentaryActiveChange(false);
          onCommentaryCCChange(null);
        });
      // Push CC state for the post-race call. The CC bar is at the parent
      // level so this keeps rendering even after RaceView unmounts (when
      // the user clicks Proceed to Settle Bets mid-call).
      onCommentaryCCChange({
        text:  clip.text || '',
        audio,
        phase: 'post',
      });
    }).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn('[commentary post] fetch failed:', err?.response?.data ?? err?.message ?? err);
      onCommentaryActiveChange(false);
      onCommentaryCCChange(null);
    });

    // No teardown on RaceView unmount — we explicitly WANT the announcer
    // to keep playing over the settlement screen. The next race or a
    // return-to-venue will call stopPostCommentary() to cut it.
    return undefined;
  }, [allFinished, field, trajectory, odds, onCommentaryActiveChange, onCommentaryCCChange]);

  // Map field index → trajectory index (so we can render in post-position order
  // but read positions by horse_id from the trajectory).
  const trajIdxByHorseId = useMemo(() => {
    const m: Record<number, number> = {};
    trajectory.horse_ids.forEach((id, i) => { m[id] = i; });
    return m;
  }, [trajectory]);

  const finishMsById = useMemo(() => {
    const m: Record<number, number> = {};
    for (const f of trajectory.finishes) m[f.horse_id] = f.finish_ms;
    return m;
  }, [trajectory]);

  // Linear interp between samples — given absolute race-time t (ms after gates open).
  const positionAt = (horseId: number, tMs: number): number => {
    const idx = trajIdxByHorseId[horseId];
    const times = trajectory.sample_times_ms;
    if (tMs <= times[0]) return trajectory.positions[0][idx];
    if (tMs >= times[times.length - 1]) return trajectory.positions[times.length - 1][idx];
    // Binary search.
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

  // Drive the animation with a single RAF loop.
  useEffect(() => {
    let rafId = 0;
    const tick = (now: number) => {
      if (startedAtRef.current == null) startedAtRef.current = now;
      const since = now - startedAtRef.current;

      if (since < COUNTDOWN_MS) {
        // Countdown phase — gates closed, big number ticking.
        const remain = Math.max(0, COUNTDOWN_MS - since);
        setCountdown(Math.ceil(remain / 1000));
      } else {
        if (racingStartedRef.current == null) {
          racingStartedRef.current = now;
          setPhase('racing');
        }
        const raceMs = now - racingStartedRef.current;
        setClockMs(raceMs);

        // Move every runner. We use `left` (% of lane track) for the horizontal
        // position so the % refers to the parent's width — `transform: translateX(%)`
        // would be relative to the runner's own width and read wrong.
        const livePositions: { id: number; pos: number }[] = [];
        for (const h of field) {
          const el = runnerRefs.current[h.post_position - 1];
          const pos = Math.min(positionAt(h.horse_id, raceMs), 1.02);
          if (el) el.style.left = `${pos * 100}%`;
          livePositions.push({ id: h.horse_id, pos });
        }

        // Throttled live-top-3 update — re-sort, only setState when the order
        // changes AND ≥120 ms has elapsed since the last sync.
        if (now - lastTop3SyncRef.current > 120) {
          livePositions.sort((a, b) => b.pos - a.pos);
          const top3 = livePositions.slice(0, 3).map((x) => x.id);
          const same =
            top3.length === liveTop3Ref.current.length &&
            top3.every((id, idx) => id === liveTop3Ref.current[idx]);
          if (!same) {
            liveTop3Ref.current = top3;
            setLiveTop3(top3);
          }
          lastTop3SyncRef.current = now;
        }

        // Detect new finishes.
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
          // All home — let the trailing horse coast a beat, then surface results.
          // setState is idempotent so we don't bother gating on the prior phase.
          setPhase('finished');
          setAllFinished(true);   // trigger post-race commentary fetch immediately
          if (raceMs >= trajectory.duration_ms + POST_FINISH_LINGER_MS) {
            setShowResults(true);
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

  // Map post_position → corresponding HorseInField (already by index, but for clarity).
  const horsesByPost = [...field].sort((a, b) => a.post_position - b.post_position);

  return (
    <div className="hr-race" style={RACEBOOK_BG_STYLE}>
      {/* Post-race AI commentary uses a module-level new Audio() owned by
          the post-race effect — it survives this view unmounting so the
          announcer continues to play over the settlement screen. */}
      {/* Crowd silhouette band along the very top */}
      <div className="hr-race-crowd" aria-hidden>
        <div className="hr-race-crowd-row hr-race-crowd-row-back" />
        <div className="hr-race-crowd-row hr-race-crowd-row-mid" />
        <div className="hr-race-crowd-row hr-race-crowd-row-front" />
        <div className="hr-race-stadium-rail" />
      </div>

      <header className="hr-race-head">
        <div className="hr-race-banner">
          <span className="hr-eyebrow">
            Churchill Downs · {fmtEdition(trajectory.year_counter)} · {trajectory.distance.toLocaleString()} lengths
          </span>
          <h1>{phase === 'countdown' ? 'At the gate' : phase === 'racing' ? 'And they’re off!' : 'Across the wire'}</h1>
        </div>
        <div className={`hr-race-clock ${phase === 'racing' ? 'is-running' : ''}`}>
          <span className="hr-race-clock-label">Race clock</span>
          <span className="hr-race-clock-value">{(clockMs / 1000).toFixed(2)}s</span>
        </div>
      </header>

      {/* The track */}
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
                      imageUrl={SIDE_HORSE_URLS[h.post_position]}
                    />
                    <div className="hr-race-runner-shadow" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom strip — active bets (left) + live top 3 + photo finish (right) */}
      <div className="hr-race-bottom">
        <ActiveBetsPanel bets={bets} field={field} oddsFormat={oddsFormat} finishedSet={finishedSetRef.current} trajectory={trajectory} phase={phase} bettorSessions={bettorSessions} />
        <LiveTop3Panel top3={liveTop3} field={field} phase={phase} />
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

      {/* Big countdown number when phase==='countdown' */}
      {phase === 'countdown' && (
        <div className="hr-race-countdown" aria-hidden>
          <span>{countdown > 0 ? countdown : 'GO!'}</span>
        </div>
      )}

      {/* Final results popup */}
      {showResults && (
        <RaceFinishModal
          field={field}
          trajectory={trajectory}
          finishMsById={finishMsById}
          onSettle={onSettle}
        />
      )}
    </div>
  );
}

// ─── Final-results popup (between race and settlement) ────────────────────

function RaceFinishModal({
  field, trajectory, finishMsById, onSettle,
}: {
  field: HorseInField[];
  trajectory: RaceTrajectory;
  finishMsById: Record<number, number>;
  onSettle: () => void;
}) {
  return (
    <div className="hr-modal-root">
      <div className="hr-modal-backdrop" />
      <div className="hr-modal-panel hr-finish-panel">
        <header className="hr-modal-head">
          <h2>Official Result</h2>
        </header>
        <div className="hr-modal-body">
          <table className="hr-finish-table">
            <thead>
              <tr>
                <th>Place</th>
                <th>Horse</th>
                <th className="hr-review-num">Time</th>
              </tr>
            </thead>
            <tbody>
              {trajectory.finish_order.map((id, i) => {
                const horse = field.find((h) => h.horse_id === id);
                if (!horse) return null;
                return (
                  <tr key={id} className={i === 0 ? 'is-winner' : ''}>
                    <td className="hr-finish-place">P{i + 1}</td>
                    <td>
                      <span className="hr-card-saddle" style={{ background: horse.silks_color }}>
                        {horse.post_position}
                      </span>
                      <span className="hr-finish-name">
                        {horse.full_name}
                        <CountryFlag iso={horse.country} />
                      </span>
                    </td>
                    <td className="hr-review-num">{fmtSec(finishMsById[id] ?? 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <footer className="hr-modal-footer">
          <button className="hr-btn-primary" onClick={onSettle}>Proceed to Settle Bets →</button>
        </footer>
      </div>
    </div>
  );
}

// ─── In-race side panels (bottom strip) ──────────────────────────────────

/** Live "who's in front right now" board — updates a few times a second
 *  while horses are moving, freezes once everyone's home. */
function LiveTop3Panel({
  top3, field, phase,
}: {
  top3: number[];
  field: HorseInField[];
  phase: 'countdown' | 'racing' | 'finished';
}) {
  const horseById = useMemo(() => {
    const m: Record<number, HorseInField> = {};
    for (const h of field) m[h.horse_id] = h;
    return m;
  }, [field]);

  return (
    <aside className="hr-race-top3">
      <header>
        <h3>Live Top 3</h3>
        <span className={phase === 'racing' ? 'is-running' : ''}>
          {phase === 'countdown' ? 'At the gate' : phase === 'racing' ? 'Live' : 'Final'}
        </span>
      </header>
      <ol className="hr-race-top3-list">
        {top3.length === 0 && <li className="hr-race-top3-empty">Waiting for the bell…</li>}
        {top3.map((id, i) => {
          const h = horseById[id];
          if (!h) return null;
          return (
            <li key={id} className={`hr-race-top3-row hr-race-top3-row-${i + 1}`}>
              <span className="hr-race-top3-place">{i === 0 ? '1st' : i === 1 ? '2nd' : '3rd'}</span>
              <span className="hr-race-top3-saddle" style={{ background: h.silks_color }}>{h.post_position}</span>
              <span className="hr-race-top3-name">{h.full_name}</span>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

/** Compact list of every bet placed this round — visible alongside the race
 *  so the user can monitor what they're rooting for. Once a horse finishes
 *  and the relevant market is decidable, we tag the bet WIN/LOSS in real time
 *  (e.g. a Win bet is decided as soon as ANY horse crosses the line). */
function ActiveBetsPanel({
  bets, field, oddsFormat, finishedSet, trajectory, phase, bettorSessions,
}: {
  bets: LiveBet[];                 // aggregate (all sessions). Used as the 'all' tab.
  field: HorseInField[];
  oddsFormat: OddsFormat;
  finishedSet: Set<number>;
  trajectory: RaceTrajectory;     // full trajectory — needed to grade prop bets (uses thresholds)
  phase: 'countdown' | 'racing' | 'finished';
  bettorSessions?: BettorSession[];  // when length > 1 we render a tab strip
}) {
  const horseById = useMemo(() => {
    const m: Record<number, HorseInField> = {};
    for (const h of field) m[h.horse_id] = h;
    return m;
  }, [field]);

  // Tier 1: only resolve at the end of the race, once every horse has crossed.
  const liveStatus = (bet: LiveBet): 'pending' | 'won' | 'lost' => {
    if (phase !== 'finished' && finishedSet.size < field.length) return 'pending';
    return evaluateBet(bet, trajectory).won ? 'won' : 'lost';
  };

  // Bettor tab logic — only surface tabs when more than ONE confirmed
  // session has bets. The 'all' tab shows the aggregate; per-session
  // tabs filter to that bettor's bets only.
  const tabSessions = (bettorSessions || []).filter((s) => s.confirmed && s.bets.length > 0);
  const showTabs = tabSessions.length > 1;
  type Tab = 'all' | number;
  const [activeTab, setActiveTab] = useState<Tab>(showTabs ? 0 : 'all');

  const visibleBets: LiveBet[] = (() => {
    if (!showTabs || activeTab === 'all') return bets;
    const sess = tabSessions[activeTab as number];
    return (sess?.bets ?? []) as LiveBet[];
  })();

  const activeName =
    showTabs && activeTab !== 'all' && tabSessions[activeTab as number]
      ? tabSessions[activeTab as number].screen_name
      : null;

  const totalStaked = visibleBets.reduce((s, b) => s + b.stake, 0);

  return (
    <aside className="hr-race-active">
      <header>
        <h3>
          {activeName ? `${activeName}'s Bets` : 'Your Bets'} ({visibleBets.length})
        </h3>
        <span>Total staked {fmtUsd(totalStaked)}</span>
      </header>

      {showTabs && (
        <div className="hr-race-active-tabs" role="tablist">
          <button
            role="tab" aria-selected={activeTab === 'all'}
            className={`hr-race-active-tab ${activeTab === 'all' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('all')}
          >
            All ({bets.length})
          </button>
          {tabSessions.map((s, i) => (
            <button
              key={`${s.user_id}-${i}`}
              role="tab" aria-selected={activeTab === i}
              className={`hr-race-active-tab ${activeTab === i ? 'is-active' : ''}`}
              onClick={() => setActiveTab(i)}
              title={`${s.screen_name} — ${s.bets.length} bet${s.bets.length === 1 ? '' : 's'}`}
            >
              {s.screen_name} ({s.bets.length})
            </button>
          ))}
        </div>
      )}

      {visibleBets.length === 0 ? (
        <div className="hr-race-active-empty">
          {activeName ? `No bets from ${activeName}.` : 'No bets placed this round.'}
        </div>
      ) : (
        <ul className="hr-race-active-list">
          {visibleBets.map((b) => {
            const oddsStr = oddsFormat === 'decimal'
              ? b.decimal.toFixed(2)
              : (b.american >= 0 ? `+${b.american}` : `${b.american}`);
            const status = liveStatus(b);
            const profit = b.stake * (b.decimal - 1);
            return (
              <li key={b.key} className={`hr-race-active-row hr-race-active-${status}`}>
                <span className="hr-race-active-mkt">{b.market_label}</span>
                <span className="hr-race-active-sel">
                  <BetSelectionLabel bet={b} horseById={horseById} />
                </span>
                <span className="hr-race-active-odds">{oddsStr}</span>
                <span className="hr-race-active-stake">{fmtUsd(b.stake)}</span>
                <span className={`hr-race-active-status hr-race-active-status-${status}`}>
                  {status === 'pending' ? `to win ${fmtUsd(profit)}` : status === 'won' ? 'WON' : 'LOST'}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// View 5 — Settlement
// ═══════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════
// Pre-race confirmation — between racebook and the actual race.
// Shows track + finishes placeholder + bets per bettor (tabbed when more
// than one) + "Run for Another" (bookie only) + the big "Send Them Off"
// start button.
// ═══════════════════════════════════════════════════════════════════════

function PreRaceConfirmView({
  field, odds, oddsFormat, sessions, activeBettorIdx, setActiveBettorIdx,
  isBookie, bettorOptions, onRunForBettor, onEditBettor, onSendOff, onBackToRacebook,
}: {
  field: HorseInField[];
  odds: RaceOdds;
  oddsFormat: OddsFormat;
  sessions: BettorSession[];
  activeBettorIdx: number;
  setActiveBettorIdx: (i: number) => void;
  isBookie: boolean;
  bettorOptions: BettorOption[];
  onRunForBettor: (b: BettorOption) => void;
  onEditBettor: (idx: number) => void;
  onSendOff: () => void;
  onBackToRacebook: () => void;
}) {
  const [showRunForDropdown, setShowRunForDropdown] = useState(false);
  const horseById = useMemo(() => {
    const m: Record<number, HorseInField> = {};
    for (const h of field) m[h.horse_id] = h;
    return m;
  }, [field]);

  const visibleSession = sessions[activeBettorIdx] ?? sessions[0];
  const totalBets   = sessions.reduce((s, sess) => s + sess.bets.length, 0);
  const totalStaked = sessions.reduce((s, sess) =>
    s + sess.bets.reduce((t, b) => t + (b as LiveBet).stake, 0), 0);

  // Filter the bookie dropdown to only bettors not already stacked.
  const stackedIds = new Set(sessions.map((s) => s.user_id));
  const availableBettors = bettorOptions.filter((b) => !stackedIds.has(b.user_id));

  return (
    <div className="hr-prerace" style={RACEBOOK_BG_STYLE}>
      <header className="hr-prerace-head">
        <button className="hr-link-back" onClick={onBackToRacebook}>← Back to racebook</button>
        <div>
          <span className="hr-eyebrow">
            Pre-Race · {fmtEdition(odds.year_counter)} · {odds.distance.toLocaleString()} lengths
          </span>
          <h1>Final review before the gates open</h1>
        </div>
        <div className="hr-prerace-summary">
          <span>{sessions.filter((s) => s.confirmed).length} bettor{sessions.filter((s) => s.confirmed).length === 1 ? '' : 's'}</span>
          <strong>{totalBets} bets · {fmtUsd(totalStaked)} staked</strong>
        </div>
      </header>

      {/* Track placeholder — visual cue that the race hasn't started yet. */}
      <section className="hr-prerace-track">
        <div className="hr-prerace-track-art" aria-hidden>
          <div className="hr-prerace-track-overlay">
            <span className="hr-prerace-track-label">AT THE GATE</span>
            <span className="hr-prerace-track-sub">{field.length}-horse field · {odds.distance.toLocaleString()} lengths</span>
          </div>
        </div>
        <div className="hr-prerace-finishes">
          <h3>Final Finishing Order</h3>
          <div className="hr-prerace-finishes-placeholder">
            {Array.from({ length: field.length }).map((_, i) => (
              <div key={i} className="hr-prerace-finish-row">
                <span className="hr-prerace-finish-place">P{i + 1}</span>
                <span className="hr-prerace-finish-name">— pending —</span>
                <span className="hr-prerace-finish-time">— : —</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bet review with bettor tabs */}
      <section className="hr-prerace-bets">
        <div className="hr-prerace-tabs" role="tablist">
          {sessions.map((s, i) => (
            <button
              key={`${s.user_id}-${i}`}
              role="tab"
              aria-selected={i === activeBettorIdx}
              className={`hr-prerace-tab ${i === activeBettorIdx ? 'is-active' : ''}`}
              onClick={() => setActiveBettorIdx(i)}
            >
              <span className="hr-prerace-tab-name">{s.screen_name}</span>
              <span className="hr-prerace-tab-meta">
                {s.bets.length} bet{s.bets.length === 1 ? '' : 's'} · {fmtUsd(s.bets.reduce((t, b) => t + (b as LiveBet).stake, 0))}
              </span>
              {!s.confirmed && <span className="hr-prerace-tab-flag">unconfirmed</span>}
            </button>
          ))}
        </div>

        {/* Edit bar — pencil button next to the active bettor's name.
            Click → racebook re-mounts with their existing stakes pre-filled.
            Works for ANY session, including the bookie's own slot 0. */}
        {visibleSession && (
          <div className="hr-prerace-edit-bar">
            <span className="hr-prerace-edit-name">
              Showing bets for <strong>{visibleSession.screen_name}</strong>
            </span>
            <button
              className="hr-prerace-edit-btn"
              onClick={() => onEditBettor(activeBettorIdx)}
              title={`Edit ${visibleSession.screen_name}'s bets`}
              aria-label={`Edit ${visibleSession.screen_name}'s bets`}
            >
              <span aria-hidden>✏️</span>
              <span>Edit bets</span>
            </button>
          </div>
        )}

        <div className="hr-prerace-bets-body">
          {visibleSession && visibleSession.bets.length === 0 ? (
            <div className="hr-prerace-empty">No bets placed for {visibleSession.screen_name}.</div>
          ) : (
            <table className="hr-review-table">
              <thead>
                <tr>
                  <th>Market</th>
                  <th>Selection</th>
                  <th className="hr-review-num">Odds</th>
                  <th className="hr-review-num">Stake</th>
                  <th className="hr-review-num">To win</th>
                </tr>
              </thead>
              <tbody>
                {visibleSession?.bets.map((b: LiveBet) => {
                  const oddsStr = oddsFormat === 'decimal'
                    ? b.decimal.toFixed(2)
                    : (b.american >= 0 ? `+${b.american}` : `${b.american}`);
                  const toWin = b.stake * (b.decimal - 1);
                  return (
                    <tr key={b.key}>
                      <td>{b.market_label}</td>
                      <td><BetSelectionLabel bet={b} horseById={horseById} /></td>
                      <td className="hr-review-num">{oddsStr}</td>
                      <td className="hr-review-num">{fmtUsd(b.stake)}</td>
                      <td className="hr-review-num">{fmtUsd(toWin)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Run-for-another (bookie only) + the start button */}
      <section className="hr-prerace-actions">
        {isBookie && (
          <div className="hr-prerace-runfor">
            {showRunForDropdown ? (
              <div className="hr-prerace-runfor-dropdown">
                <div className="hr-prerace-runfor-head">
                  <span>Run for another bettor</span>
                  <button onClick={() => setShowRunForDropdown(false)}>✕</button>
                </div>
                {availableBettors.length === 0 ? (
                  <div className="hr-prerace-runfor-empty">No more bettors available.</div>
                ) : (
                  <ul>
                    {availableBettors.map((b) => (
                      <li key={b.user_id}>
                        <button onClick={() => { setShowRunForDropdown(false); onRunForBettor(b); }}>
                          <strong>{b.screenname || b.screen_name || '(no name)'}</strong>
                          <span>{b.role || 'BETTOR'}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <button
                className="hr-btn-secondary"
                onClick={() => setShowRunForDropdown(true)}
                disabled={availableBettors.length === 0}
                title={availableBettors.length === 0 ? 'No additional bettors to run for' : 'Open the bettor list'}
              >
                + Run for Another Bettor
              </button>
            )}
          </div>
        )}

        <button
          className="hr-btn-primary hr-prerace-start"
          onClick={onSendOff}
          disabled={totalBets === 0}
          title={totalBets === 0 ? 'Place at least one bet first' : 'Send the field to the post'}
        >
          Send Them Off →
        </button>
      </section>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Settlement
// ═══════════════════════════════════════════════════════════════════════

function SettlementView({
  field, trajectory, bets, oddsFormat, onNewSession, onBackToVenue,
  bettorSessions, isBookie, persistError, setPersistError,
}: {
  field: HorseInField[];
  trajectory: RaceTrajectory;
  bets: LiveBet[];
  oddsFormat: OddsFormat;
  onNewSession: () => void;
  onBackToVenue: () => void;
  bettorSessions: BettorSession[];
  isBookie: boolean;
  persistError: string | null;
  setPersistError: (msg: string | null) => void;
}) {
  const settled = useMemo(() => settleBets(bets, trajectory), [bets, trajectory]);
  const finishMsById = useMemo(() => {
    const m: Record<number, number> = {};
    for (const f of trajectory.finishes) m[f.horse_id] = f.finish_ms;
    return m;
  }, [trajectory]);

  const horseById = useMemo(() => {
    const m: Record<number, HorseInField> = {};
    for (const h of field) m[h.horse_id] = h;
    return m;
  }, [field]);

  // Per-session settlement — used when more than one bettor is in the
  // pool. The 'all' tab shows the aggregate; per-bettor tabs show only
  // that session's bets and PnL.
  const sessionsForView = bettorSessions.filter((s) => s.confirmed && s.bets.length > 0);
  const showTabs = sessionsForView.length > 1;

  type Tab = 'all' | number;   // 'all' or a session index
  const [activeTab, setActiveTab] = useState<Tab>(showTabs ? 0 : 'all');

  const settledBySession = useMemo(() =>
    sessionsForView.map((s) => settleBets(s.bets as LiveBet[], trajectory)),
    [sessionsForView, trajectory],
  );

  const visibleSettled = (() => {
    if (activeTab === 'all' || !showTabs) return settled;
    return settledBySession[activeTab as number] ?? [];
  })();

  const totalStake = visibleSettled.reduce((s, b) => s + b.stake, 0);
  const netPnl = visibleSettled.reduce((s, b) => s + b.pnl, 0);
  const winningCount = visibleSettled.filter((b) => b.won).length;

  // Persist multi-user bets to the bets table when the settlement view
  // mounts. Only fires when the caller is a BOOKIE — for solo races we
  // leave persistence to the existing single-user /bets/place flow (or
  // skip it entirely for guest play).
  const persistedRef = useRef(false);
  useEffect(() => {
    if (persistedRef.current) return;
    if (!isBookie) return;
    if (sessionsForView.length === 0) return;
    persistedRef.current = true;
    // Build payload — one PersistMultiSession per bettor, each bet pre-
    // settled with won/pnl so the row stores the final result.
    const payload = sessionsForView.map((sess, i) => {
      const sets = settledBySession[i] || [];
      return {
        user_id:     sess.user_id,
        screen_name: sess.screen_name,
        bets: sets.map((b) => ({
          selection:     `${b.market_label} · ${b.selection_label}`,
          market_kind:   b.market,
          stake:         b.stake,
          odds_american: b.american >= 0 ? `+${b.american}` : `${b.american}`,
          decimal:       b.decimal,
          won:           b.won,
          pnl:           b.pnl,
        })),
      };
    }).filter((s) => s.bets.length > 0);
    if (payload.length === 0) return;
    persistMultiBets({ year: trajectory.year_counter, sessions: payload })
      .then(() => setPersistError(null))
      .catch((err: any) => {
        const msg = err?.response?.data?.error || err?.message || 'Failed to persist bets';
        setPersistError(msg);
        // Allow retry on remount — the user can navigate away and back.
        persistedRef.current = false;
      });
    // Intentionally only run when the settlement first appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="hr-settle" style={RACEBOOK_BG_STYLE}>
      <header className="hr-settle-head">
        <div>
          <span className="hr-eyebrow">
            Settlement · {fmtEdition(trajectory.year_counter)} · {trajectory.distance.toLocaleString()} lengths
          </span>
          <h1>Round Results</h1>
        </div>
        <div className={`hr-settle-pnl ${netPnl >= 0 ? 'is-pos' : 'is-neg'}`}>
          <span>Net P&amp;L</span>
          <strong>{netPnl >= 0 ? '+' : ''}{fmtUsd(netPnl)}</strong>
          <span className="hr-settle-pnl-meta">
            {winningCount} of {settled.length} bets won · {fmtUsd(totalStake)} risked
          </span>
        </div>
      </header>

      {showTabs && (
        <div className="hr-prerace-tabs hr-settle-tabs" role="tablist">
          <button
            role="tab" aria-selected={activeTab === 'all'}
            className={`hr-prerace-tab ${activeTab === 'all' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('all')}
          >
            <span className="hr-prerace-tab-name">All Bettors</span>
            <span className="hr-prerace-tab-meta">{settled.length} bets · net {fmtUsd(settled.reduce((s, b) => s + b.pnl, 0))}</span>
          </button>
          {sessionsForView.map((s, i) => {
            const sets = settledBySession[i] || [];
            const sessNet = sets.reduce((sm, b) => sm + b.pnl, 0);
            return (
              <button
                key={`${s.user_id}-${i}`}
                role="tab" aria-selected={activeTab === i}
                className={`hr-prerace-tab ${activeTab === i ? 'is-active' : ''}`}
                onClick={() => setActiveTab(i)}
              >
                <span className="hr-prerace-tab-name">{s.screen_name}</span>
                <span className="hr-prerace-tab-meta">{sets.length} bets · net {sessNet >= 0 ? '+' : ''}{fmtUsd(sessNet)}</span>
              </button>
            );
          })}
        </div>
      )}

      {persistError && (
        <div className="hr-settle-persist-warn">
          Bet persistence warning: {persistError}
        </div>
      )}

      <div className="hr-settle-grid">
        {/* Finish board */}
        <section className="hr-settle-board">
          <h3>Final Finishing Order</h3>
          <table className="hr-finish-table">
            <thead>
              <tr>
                <th>Place</th>
                <th>Horse</th>
                <th className="hr-review-num">Time</th>
              </tr>
            </thead>
            <tbody>
              {trajectory.finish_order.map((id, i) => {
                const horse = field.find((h) => h.horse_id === id);
                if (!horse) return null;
                return (
                  <tr key={id} className={i === 0 ? 'is-winner' : ''}>
                    <td className="hr-finish-place">P{i + 1}</td>
                    <td>
                      <span className="hr-card-saddle" style={{ background: horse.silks_color }}>
                        {horse.post_position}
                      </span>
                      <span className="hr-finish-name">{horse.full_name}</span>
                    </td>
                    <td className="hr-review-num">{fmtSec(finishMsById[id] ?? 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        {/* Bet-by-bet settlement */}
        <section className="hr-settle-bets">
          <h3>
            Bets Settled ({visibleSettled.length})
            {showTabs && activeTab !== 'all' && sessionsForView[activeTab as number] && (
              <span className="hr-settle-active-bettor"> · {sessionsForView[activeTab as number].screen_name}</span>
            )}
          </h3>
          {visibleSettled.length === 0 ? (
            <div className="hr-settle-empty">No bets to settle for this view.</div>
          ) : (
            <table className="hr-settle-table">
              <thead>
                <tr>
                  <th>Market</th>
                  <th>Selection</th>
                  <th className="hr-review-num">Odds</th>
                  <th className="hr-review-num">Stake</th>
                  <th>Outcome</th>
                  <th className="hr-review-num">P&amp;L</th>
                </tr>
              </thead>
              <tbody>
                {visibleSettled.map((b) => {
                  const oddsStr = oddsFormat === 'decimal'
                    ? b.decimal.toFixed(2)
                    : (b.american >= 0 ? `+${b.american}` : `${b.american}`);
                  return (
                    <tr key={b.key} className={b.won ? 'is-won' : 'is-lost'}>
                      <td>{b.market_label}</td>
                      <td><BetSelectionLabel bet={b} horseById={horseById} /></td>
                      <td className="hr-review-num">{oddsStr}</td>
                      <td className="hr-review-num">{fmtUsd(b.stake)}</td>
                      <td>
                        <span className={`hr-settle-pill ${b.won ? 'is-won' : 'is-lost'}`}>
                          {b.won ? 'Won' : 'Lost'}
                        </span>
                        <span className="hr-settle-reason">{b.reason}</span>
                      </td>
                      <td className={`hr-review-num ${b.won ? 'hr-pnl-pos' : 'hr-pnl-neg'}`}>
                        {b.pnl >= 0 ? '+' : ''}{fmtUsd(b.pnl)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} className="hr-review-total-label">Net</td>
                  <td className="hr-review-num"><strong>{fmtUsd(totalStake)}</strong></td>
                  <td />
                  <td className={`hr-review-num ${netPnl >= 0 ? 'hr-pnl-pos' : 'hr-pnl-neg'}`}>
                    <strong>{netPnl >= 0 ? '+' : ''}{fmtUsd(netPnl)}</strong>
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </section>
      </div>

      <footer className="hr-settle-foot">
        <button className="hr-btn-secondary" onClick={onBackToVenue}>← Back to venues</button>
        <button className="hr-btn-primary" onClick={onNewSession}>Run another race →</button>
      </footer>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Top-level component
// ═══════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════
// Stats menu — historical results, leaderboards, per-year tables
// ═══════════════════════════════════════════════════════════════════════

type StatsTab = 'records' | 'countries' | 'years';

function StatsView({ onBack }: { onBack: () => void }) {
  const [data, setData] = useState<StatsResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [openYear, setOpenYear] = useState<number | null>(null);
  const [tab, setTab] = useState<StatsTab>('records');
  // Race-by-Race History pagination — show 10 entries per page, with
  // optional year-search override (when a query is present we filter
  // and disable paging).
  const [historyPage, setHistoryPage] = useState(0);
  const [historySearch, setHistorySearch] = useState('');

  useEffect(() => {
    setLoading(true);
    fetchRacingStats()
      .then((r) => { setData(r); setErr(null); })
      .catch((e) => setErr(e?.message || 'Failed to load stats'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="hr-stats">
      <header className="hr-stats-head">
        <button className="hr-link-back" onClick={onBack}>← Back to venues</button>
        <div>
          <span className="hr-eyebrow">Hall of Records</span>
          <h1>Churchill Downs Stats</h1>
        </div>
      </header>

      {loading && <div className="hr-stats-loading">Loading the books…</div>}
      {err && <div className="hr-error">{err}</div>}

      {data && (
        <>
          <section className="hr-stats-summary">
            <div className="hr-stats-stat">
              <span>Current season</span>
              <strong>{fmtEdition(data.current_year)}</strong>
            </div>
            <div className="hr-stats-stat">
              <span>Total races on record</span>
              <strong>{data.total_races}</strong>
            </div>
          </section>

          <nav className="hr-stats-tabs" role="tablist">
            <button
              role="tab" aria-selected={tab === 'records'}
              className={`hr-stats-tab ${tab === 'records' ? 'is-active' : ''}`}
              onClick={() => setTab('records')}
            >
              Hall of Records
            </button>
            <button
              role="tab" aria-selected={tab === 'countries'}
              className={`hr-stats-tab ${tab === 'countries' ? 'is-active' : ''}`}
              onClick={() => setTab('countries')}
            >
              By Country
            </button>
            <button
              role="tab" aria-selected={tab === 'years'}
              className={`hr-stats-tab ${tab === 'years' ? 'is-active' : ''}`}
              onClick={() => setTab('years')}
            >
              By Year
            </button>
          </nav>

          {tab === 'records' && (
            <>
              <section className="hr-stats-leaderboards">
                <h2>Leaderboards</h2>
                <div className="hr-stats-board-grid">
                  <LeaderCard title="Most Wins"           rows={data.leaderboards.most_wins} />
                  <LeaderCard title="Most Places (Top 2)" rows={data.leaderboards.most_places} />
                  <LeaderCard title="Most Shows (Top 3)"  rows={data.leaderboards.most_shows} />
                  <LeaderCard title="Most Participations" rows={data.leaderboards.most_participations} />
                </div>
              </section>

              {data.leaderboards.best_time_per_distance.length > 0 && (
                <section className="hr-stats-records">
                  <h2>Track Records · Best Time per Distance</h2>
                  <table className="hr-stats-table">
                    <thead>
                      <tr>
                        <th>Distance</th>
                        <th>Time</th>
                        <th>Horse</th>
                        <th>Year</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.leaderboards.best_time_per_distance.map((r) => (
                        <tr key={r.distance}>
                          <td>{r.distance.toLocaleString()} lengths</td>
                          <td className="hr-stats-num">{r.finish_seconds.toFixed(2)}s</td>
                          <td>
                            <CountryFlag iso={r.country} />
                            <span className="hr-stats-horse-name">{r.full_name}</span>
                            {r.saddle_name && <span className="hr-stats-saddle"> "{r.saddle_name}"</span>}
                          </td>
                          <td>{fmtEdition(r.year)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              )}

              <HistorySection
                perYear={data.per_year}
                openYear={openYear}
                setOpenYear={setOpenYear}
                page={historyPage}
                setPage={setHistoryPage}
                search={historySearch}
                setSearch={setHistorySearch}
              />
            </>
          )}

          {tab === 'countries' && (
            <section className="hr-stats-countries">
              <h2>By Country</h2>
              {!data.countries || (
                data.countries.participations_by_country.length === 0 &&
                data.countries.wins_by_country.length === 0
              ) ? (
                <div className="hr-stats-empty">No country data yet — run a few races first.</div>
              ) : (
                <>
                  {data.countries.wins_by_country.length > 0 && (
                    <div className="hr-stats-board hr-stats-pie-card">
                      <header><h3>Wins · Distribution by Country</h3></header>
                      <CountryWinsPie rows={data.countries.wins_by_country} />
                    </div>
                  )}
                  <div className="hr-stats-board-grid">
                    <CountryCard
                      title="Participations by Country"
                      rows={data.countries.participations_by_country}
                      valueKey="participations"
                      valueLabel="starts"
                    />
                    <CountryCard
                      title="Wins by Country"
                      rows={data.countries.wins_by_country}
                      valueKey="wins"
                      valueLabel="wins"
                    />
                    <CountryCard
                      title="Best Wins-per-Participation"
                      rows={data.countries.best_win_rate_by_country}
                      valueKey="win_rate_pct"
                      valueLabel="%"
                      secondary={(c) => `${c.wins}/${c.participations}`}
                    />
                  </div>
                </>
              )}
            </section>
          )}

          {tab === 'years' && (
            <section className="hr-stats-years">
              <h2>Year-by-Year Time Analysis</h2>
              {!data.year_analysis || data.year_analysis.fastest_avg_years.length === 0 ? (
                <div className="hr-stats-empty">No race times recorded yet.</div>
              ) : (
                <div className="hr-stats-board-grid">
                  <YearTimeCard
                    title="Fastest Average Times"
                    subtitle="Lowest mean finish time across the field"
                    rows={data.year_analysis.fastest_avg_years}
                  />
                  <YearTimeCard
                    title="Slowest Average Times"
                    subtitle="Highest mean finish time across the field"
                    rows={data.year_analysis.slowest_avg_years}
                  />
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}

// ─── Race-by-race history section — paginated 10 at a time + year search ──
const HISTORY_PAGE_SIZE = 10;

function HistorySection({
  perYear, openYear, setOpenYear, page, setPage, search, setSearch,
}: {
  perYear: StatsResponse['per_year'];
  openYear: number | null;
  setOpenYear: (y: number | null) => void;
  page: number;
  setPage: (n: number) => void;
  search: string;
  setSearch: (s: string) => void;
}) {
  // Derive the visible slice. When a search query is present, filter by
  // either the raw year OR the edition number / label that fmtEdition
  // produces. Pagination disengages while a query is active.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return perYear;
    const digitsOnly = q.replace(/\D+/g, '');
    return perYear.filter((y) => {
      const yearStr = String(y.year);
      const editionLabel = fmtEdition(y.year).toLowerCase();
      const matchesYear = digitsOnly && yearStr.includes(digitsOnly);
      const matchesEdition = editionLabel.includes(q);
      return matchesYear || matchesEdition;
    });
  }, [perYear, search]);

  const isSearching = search.trim().length > 0;
  const totalPages = isSearching
    ? 1
    : Math.max(1, Math.ceil(filtered.length / HISTORY_PAGE_SIZE));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  const startIdx = isSearching ? 0 : safePage * HISTORY_PAGE_SIZE;
  const endIdx   = isSearching ? filtered.length : startIdx + HISTORY_PAGE_SIZE;
  const visible  = filtered.slice(startIdx, endIdx);

  return (
    <section className="hr-stats-history">
      <header className="hr-stats-history-head">
        <h2>Race-by-Race History</h2>
        <input
          type="text"
          className="hr-stats-history-search"
          placeholder="Search year (e.g. 1716, 1722, or '8th')"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          aria-label="Search races by year"
        />
      </header>

      {perYear.length === 0 && (
        <div className="hr-stats-empty">No races recorded yet — run one and it'll show up here.</div>
      )}

      {perYear.length > 0 && filtered.length === 0 && (
        <div className="hr-stats-empty">
          No races match <strong>{search}</strong>.
          <button
            className="hr-stats-history-clear"
            onClick={() => setSearch('')}
          >
            Clear search
          </button>
        </div>
      )}

      <div className="hr-stats-year-list">
        {visible.map((y) => {
          const isOpen = openYear === y.year;
          const winner = y.results.find((r) => r.finish_position === 1);
          return (
            <article key={y.year} className={`hr-stats-year ${isOpen ? 'is-open' : ''}`}>
              <button
                className="hr-stats-year-head"
                onClick={() => setOpenYear(isOpen ? null : y.year)}
                aria-expanded={isOpen}
              >
                <span className="hr-stats-year-label">{fmtEdition(y.year)}</span>
                <span className="hr-stats-year-meta">{y.field_size}-horse · {y.distance.toLocaleString()} lengths</span>
                {winner && (
                  <span className="hr-stats-year-winner">
                    <CountryFlag iso={winner.country} />
                    <span>Winner: <strong>{winner.full_name}</strong></span>
                    <span className="hr-stats-num">{winner.finish_seconds.toFixed(2)}s</span>
                  </span>
                )}
                <span className={`hr-card-chevron ${isOpen ? 'is-open' : ''}`} aria-hidden>▾</span>
              </button>
              {isOpen && (
                <div className="hr-stats-year-body">
                  <table className="hr-stats-table">
                    <thead>
                      <tr>
                        <th>P</th>
                        <th>Horse</th>
                        <th>Country</th>
                        <th>Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {y.results.map((r) => (
                        <tr key={r.horse_id} className={r.finish_position === 1 ? 'is-winner' : ''}>
                          <td className="hr-stats-pos">P{r.finish_position}</td>
                          <td>
                            <span className="hr-stats-horse-name">{r.full_name}</span>
                            {r.saddle_name && <span className="hr-stats-saddle"> "{r.saddle_name}"</span>}
                          </td>
                          <td><CountryFlag iso={r.country} /> {r.country || '—'}</td>
                          <td className="hr-stats-num">{r.finish_seconds.toFixed(2)}s</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {/* Pager — hidden while searching since we show all matches at once. */}
      {!isSearching && filtered.length > HISTORY_PAGE_SIZE && (
        <nav className="hr-stats-history-pager" aria-label="Race history pagination">
          <button
            className="hr-stats-history-pager-btn"
            onClick={() => setPage(Math.max(0, safePage - 1))}
            disabled={safePage === 0}
            aria-label="Previous page"
          >
            ← Older
          </button>
          <span className="hr-stats-history-pager-meta">
            Page <strong>{safePage + 1}</strong> of {totalPages} ·
            showing {startIdx + 1}–{Math.min(endIdx, filtered.length)} of {filtered.length}
          </span>
          <button
            className="hr-stats-history-pager-btn"
            onClick={() => setPage(Math.min(totalPages - 1, safePage + 1))}
            disabled={safePage >= totalPages - 1}
            aria-label="Next page"
          >
            Newer →
          </button>
        </nav>
      )}
    </section>
  );
}

// ─── Generic top-N-with-expand leader card ──────────────────────────────
function LeaderCard({ title, rows }: { title: string; rows: StatsResponse['leaderboards']['most_wins'] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? rows : rows.slice(0, 3);
  const hasMore = rows.length > 3;
  return (
    <div className="hr-stats-board">
      <header><h3>{title}</h3></header>
      {rows.length === 0 ? (
        <div className="hr-stats-board-empty">No data yet.</div>
      ) : (
        <>
          <ol>
            {visible.map((row, i) => (
              <li key={row.horse_id} className={i < 3 ? `hr-stats-rank-${i + 1}` : ''}>
                <span className="hr-stats-rank-num">{i + 1}</span>
                <CountryFlag iso={row.country} />
                <span className="hr-stats-horse-name">{row.full_name}</span>
                <strong>{row.value}</strong>
              </li>
            ))}
          </ol>
          {hasMore && (
            <button
              className="hr-stats-expand"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? 'Show top 3' : `Show all ${rows.length}`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ─── Top-5-with-expand country card ─────────────────────────────────────
function CountryCard({
  title, rows, valueKey, valueLabel, secondary,
}: {
  title:      string;
  rows:       Array<{
    country: string; participations: number; wins: number; places: number;
    shows: number; win_rate_pct: number; place_rate_pct: number; show_rate_pct: number;
  }>;
  valueKey:   'participations' | 'wins' | 'places' | 'shows' | 'win_rate_pct' | 'place_rate_pct' | 'show_rate_pct';
  valueLabel: string;
  secondary?: (c: { participations: number; wins: number; places: number; shows: number }) => string;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? rows : rows.slice(0, 5);
  const hasMore = rows.length > 5;
  return (
    <div className="hr-stats-board">
      <header><h3>{title}</h3></header>
      {rows.length === 0 ? (
        <div className="hr-stats-board-empty">No data yet.</div>
      ) : (
        <>
          <ol>
            {visible.map((c, i) => (
              <li key={c.country} className={i < 3 ? `hr-stats-rank-${i + 1}` : ''}>
                <span className="hr-stats-rank-num">{i + 1}</span>
                <CountryFlag iso={c.country} />
                <span className="hr-stats-horse-name">{c.country}</span>
                {secondary && <span className="hr-stats-saddle"> {secondary(c)}</span>}
                <strong>{c[valueKey]}{valueLabel === '%' ? '%' : ''}{valueLabel !== '%' ? ` ${valueLabel}` : ''}</strong>
              </li>
            ))}
          </ol>
          {hasMore && (
            <button
              className="hr-stats-expand"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? 'Show top 5' : `Show all ${rows.length}`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ─── Wins-by-country pie chart ──────────────────────────────────────────
// Pure-SVG, no chart library. Slices coloured deterministically by ISO so
// the same country keeps the same wedge colour across re-renders. We cap
// the slice list at 8; any longer tail collapses into "Others" so the pie
// stays legible.
function CountryWinsPie({
  rows,
}: {
  rows: Array<{ country: string; wins: number }>;
}) {
  const top = useMemo(() => {
    const positive = rows.filter((r) => r.wins > 0);
    if (positive.length === 0) return [];
    const sorted = [...positive].sort((a, b) => b.wins - a.wins);
    if (sorted.length <= 8) return sorted;
    const head = sorted.slice(0, 7);
    const tailWins = sorted.slice(7).reduce((s, r) => s + r.wins, 0);
    return [...head, { country: 'Others', wins: tailWins }];
  }, [rows]);

  const total = top.reduce((s, r) => s + r.wins, 0);
  if (total <= 0) return null;

  // Deterministic colour by ISO — hash → HSL.
  const colourFor = (iso: string) => {
    let h = 0;
    for (let i = 0; i < iso.length; i++) h = (h * 31 + iso.charCodeAt(i)) >>> 0;
    return `hsl(${h % 360} 65% 52%)`;
  };

  // Build SVG arc paths.
  const cx = 110, cy = 110, r = 95;
  let cumAngle = -Math.PI / 2; // start at 12 o'clock
  const arcs = top.map((row) => {
    const slice = (row.wins / total) * Math.PI * 2;
    const a0 = cumAngle;
    const a1 = cumAngle + slice;
    cumAngle = a1;

    const x0 = cx + r * Math.cos(a0);
    const y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    const large = slice > Math.PI ? 1 : 0;
    // Full-circle (single country) needs special handling — draw a circle
    // instead of a degenerate arc.
    const isFull = top.length === 1;
    const d = isFull
      ? `M ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy} Z`
      : `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`;

    // Label position: 0.7 r along the bisector.
    const aMid = (a0 + a1) / 2;
    const labelR = r * 0.62;
    const lx = cx + labelR * Math.cos(aMid);
    const ly = cy + labelR * Math.sin(aMid);

    const pct = Math.round(100 * row.wins / total);
    return {
      country: row.country,
      colour:  colourFor(row.country),
      d,
      lx, ly, pct, wins: row.wins,
      slicePct: row.wins / total,
    };
  });

  return (
    <div className="hr-stats-pie">
      <svg viewBox="0 0 220 220" className="hr-stats-pie-svg" role="img" aria-label="Wins by country pie chart">
        {arcs.map((a) => (
          <path key={a.country} d={a.d} fill={a.colour} stroke="rgba(0,0,0,0.45)" strokeWidth="1.2" />
        ))}
        {/* Inline labels — only on slices >= 6% to avoid crowding. */}
        {arcs.filter((a) => a.slicePct >= 0.06).map((a) => (
          <text
            key={`l-${a.country}`}
            x={a.lx} y={a.ly}
            fontSize="11"
            fontWeight="800"
            textAnchor="middle"
            dominantBaseline="central"
            fill="rgba(255,255,255,0.95)"
            stroke="rgba(0,0,0,0.55)"
            strokeWidth="0.6"
            paintOrder="stroke"
          >
            {a.country}
          </text>
        ))}
      </svg>
      <ul className="hr-stats-pie-legend">
        {arcs.map((a) => (
          <li key={a.country}>
            <span className="hr-stats-pie-swatch" style={{ background: a.colour }} />
            <span className="hr-stats-pie-country">{a.country}</span>
            <span className="hr-stats-pie-value">{a.wins} · {a.pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Top-5-with-expand year-time card ───────────────────────────────────
function YearTimeCard({
  title, subtitle, rows,
}: {
  title:    string;
  subtitle: string;
  rows:     Array<{
    year: number; distance: number; field_size: number;
    avg_seconds: number; min_seconds: number; max_seconds: number;
  }>;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? rows : rows.slice(0, 5);
  const hasMore = rows.length > 5;
  return (
    <div className="hr-stats-board">
      <header>
        <h3>{title}</h3>
        <p className="hr-stats-board-subtitle">{subtitle}</p>
      </header>
      {rows.length === 0 ? (
        <div className="hr-stats-board-empty">No data yet.</div>
      ) : (
        <>
          <ol>
            {visible.map((y, i) => (
              <li key={y.year} className={i < 3 ? `hr-stats-rank-${i + 1}` : ''}>
                <span className="hr-stats-rank-num">{i + 1}</span>
                <span className="hr-stats-horse-name">{fmtEdition(y.year)}</span>
                <span className="hr-stats-saddle">
                  {y.distance.toLocaleString()} lengths · {y.field_size}-horse
                </span>
                <strong>{y.avg_seconds.toFixed(2)}s avg</strong>
              </li>
            ))}
          </ol>
          {hasMore && (
            <button
              className="hr-stats-expand"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? 'Show top 5' : `Show all ${rows.length}`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ─── Closed-captions overlay ───────────────────────────────────────────
// Subtle bottom-of-screen CC bar that mirrors the playing commentary.
// We split the text into sentences and advance proportionally to the
// audio's currentTime / duration. Polled via RAF for smooth updates
// without spamming React re-renders on every timeupdate.

type CommentaryCCState = {
  // Full text of the clip currently playing.
  text:   string;
  // Audio element driving playback. Source of truth for sync.
  audio:  HTMLAudioElement | null;
  // 'pre' | 'post' | 'fan' — used to label the speaker.
  phase:  'pre' | 'post' | 'fan';
  // Only set when phase === 'fan'. Drives the speaker label.
  fanName?:   string | null;
  fanAccent?: 'indian' | 'american' | 'chinese' | 'japanese' | null;
};

function CommentaryCC({ cc }: { cc: CommentaryCCState | null }) {
  const [activeIdx, setActiveIdx] = useState(0);

  // Split into sentence-ish chunks. Falling back to a length-based split
  // if there's no natural punctuation (rare).
  const sentences = useMemo(() => {
    if (!cc?.text) return [];
    const raw = cc.text
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (raw.length === 0) return [cc.text];
    return raw;
  }, [cc?.text]);

  // RAF-driven sync — read currentTime/duration each frame, compute the
  // index into `sentences`, only commit to state on changes. We avoid
  // attaching a `timeupdate` listener because it fires inconsistently
  // across browsers and pauses unnecessarily under tab throttling.
  useEffect(() => {
    if (!cc || !cc.audio || sentences.length === 0) {
      setActiveIdx(0);
      return;
    }
    const audio = cc.audio;
    let rafId = 0;
    let lastIdx = -1;
    const tick = () => {
      const dur = audio.duration;
      if (Number.isFinite(dur) && dur > 0) {
        const ratio = Math.min(0.999, Math.max(0, audio.currentTime / dur));
        const idx = Math.min(sentences.length - 1, Math.floor(ratio * sentences.length));
        if (idx !== lastIdx) {
          lastIdx = idx;
          setActiveIdx(idx);
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [cc, sentences]);

  if (!cc) return null;
  const current = sentences[activeIdx] ?? cc.text;

  const speakerLabel =
    cc.phase === 'fan'
      ? `Fan in the stands${cc.fanName ? ` — ${cc.fanName}` : ''}${cc.fanAccent ? ` (${cc.fanAccent})` : ''}`
      : cc.phase === 'post'
      ? 'Track Announcer · Final Call'
      : 'Track Announcer';

  return (
    <div className="hr-cc-bar" role="status" aria-live="polite">
      <div className="hr-cc-inner">
        <span className="hr-cc-speaker">{speakerLabel}</span>
        <span className="hr-cc-text">{current}</span>
      </div>
    </div>
  );
}

export default function HorseRacing() {
  const navigate = useNavigate();
  const [view, setView] = useState<View>('venue');
  const [horses, setHorses] = useState<Horse[]>([]);
  const [field, setField] = useState<HorseInField[]>([]);
  const [odds, setOdds] = useState<RaceOdds | null>(null);
  const [bets, setBets] = useState<LiveBet[]>([]);
  const [trajectory, setTrajectory] = useState<RaceTrajectory | null>(null);
  const [oddsFormat, setOddsFormat] = useState<OddsFormat>('american');
  const [loadingOdds, setLoadingOdds] = useState(false);
  const [loadingRace, setLoadingRace] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [globalErr, setGlobalErr] = useState<string | null>(null);

  useEffect(() => {
    fetchHorses().then(setHorses).catch((e) => {
      setGlobalErr(e?.message || 'Failed to load horses');
    });
  }, []);

  // ── Churchill Downs lock — bookies always bypass; bettor-role users
  //    get a lock screen the moment racing_locks.churchill_downs flips on.
  //    Poll every 8s so a bookie toggle is reflected in <10s for everyone.
  const [churchillLocked, setChurchillLocked] = useState(false);
  useEffect(() => {
    let alive = true;
    const pull = async () => {
      try {
        const r = await fetchRacingLocks();
        if (!alive) return;
        const row = (r.locks || []).find((l) => l.lock_name === 'churchill_downs');
        setChurchillLocked(!!row?.locked);
      } catch { /* keep last known */ }
    };
    pull();
    const id = setInterval(pull, 8000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  // ── Sound preferences persisted to localStorage ──
  const [musicOn, setMusicOn] = useState<boolean>(() => localStorage.getItem('hr.musicOn') !== '0');
  const [sfxOn, setSfxOn]     = useState<boolean>(() => localStorage.getItem('hr.sfxOn')   !== '0');
  useEffect(() => { localStorage.setItem('hr.musicOn', musicOn ? '1' : '0'); }, [musicOn]);
  useEffect(() => { localStorage.setItem('hr.sfxOn',   sfxOn   ? '1' : '0'); }, [sfxOn]);

  // True from the moment the post-race commentary starts loading until the
  // user leaves the race view. Drives crowd-noise ducking so the announcer
  // dominates the post-race mix.
  const [commentaryActive, setCommentaryActive] = useState(false);

  // Closed-captions state — surfaced from whichever view currently has a
  // commentary clip playing. Children call setCommentaryCC({...}) when they
  // start a clip and setCommentaryCC(null) when it stops. The CC bar is a
  // single top-level fixture so it persists across view transitions
  // (e.g. post-race commentary continues to render captions over the
  // settlement screen).
  const [commentaryCC, setCommentaryCC] = useState<CommentaryCCState | null>(null);

  // ─── Multi-bettor state ───────────────────────────────────────────────
  // Default session is always the logged-in user (= user[0]). When the
  // current user is a BOOKIE, additional sessions can be stacked via
  // "Run for Another" — each new bettor gets a fresh $100 bankroll and
  // can place their own bets on the same field/odds.
  const authUser     = useAuthStore((s) => s.user);
  const isBookie     = (authUser?.role || '').toUpperCase() === 'BOOKIE';
  const [bettorSessions, setBettorSessions] = useState<BettorSession[]>([]);
  const [activeBettorIdx, setActiveBettorIdx] = useState(0);
  const [bettorOptions, setBettorOptions] = useState<BettorOption[]>([]);
  const [persistError, setPersistError] = useState<string | null>(null);

  // Fetch the bettor roster (callers the bookie can run for) once, when
  // the current user is confirmed to be a BOOKIE. Silently swallows 403
  // for non-bookies so the network doesn't keep retrying.
  useEffect(() => {
    if (!isBookie) {
      setBettorOptions([]);
      return;
    }
    fetchBettors()
      .then((rows) => setBettorOptions(rows))
      .catch(() => setBettorOptions([]));
  }, [isBookie]);

  // Initialise the first session for the logged-in user (or a 'guest'
  // placeholder when nobody is signed in). Refreshed whenever auth state
  // flips so a sign-in mid-session updates the attribution.
  useEffect(() => {
    setBettorSessions((prev) => {
      if (prev.length > 0) return prev;
      const me: BettorSession = {
        user_id:     authUser?.user_id || 'guest',
        screen_name: authUser?.screen_name || authUser?.username || authUser?.email || 'Me',
        bankroll:    STARTING_BANKROLL,
        bets:        [],
        confirmed:   false,
      };
      return [me];
    });
  }, [authUser?.user_id, authUser?.screen_name, authUser?.username, authUser?.email]);

  // Convenience derived values — surface the active session's bankroll +
  // existing bets to RacebookView so a bookie running for another bettor
  // sees the correct $100 / empty-bets state.
  const activeSession = bettorSessions[activeBettorIdx] ?? null;

  // ─── Pre-race commentary — owned at PARENT level ──────────────────
  // Hosted here (not inside RacebookView) so the announcer keeps talking
  // through the racebook → preRace transition. Cuts the second the race
  // fires (trajectory becomes non-null) or the user returns to setup
  // (odds becomes null).
  const preCommentaryAudioRef = useRef<HTMLAudioElement | null>(null);
  const preCommentaryUrlRef   = useRef<string | null>(null);
  const preCommentaryFetchedRef = useRef(false);
  const [preCommentaryOnAir, setPreCommentaryOnAir] = useState(false);

  // ── 3-track audio controller ──
  // Each track has its own <audio> ref + fade-interval ref. A single effect
  // computes desired play/volume per track from (view, musicOn, sfxOn) and
  // calls `transitionTrack` for each. Browsers block autoplay until the user
  // has interacted; play() rejection is silently swallowed and the next
  // navigation click will catch us up.
  const indyRef  = useRef<HTMLAudioElement | null>(null);
  const gloryRef = useRef<HTMLAudioElement | null>(null);
  const crowdRef = useRef<HTMLAudioElement | null>(null);
  const indyFadeRef  = useRef<number | null>(null);
  const gloryFadeRef = useRef<number | null>(null);
  const crowdFadeRef = useRef<number | null>(null);

  useEffect(() => {
    const transitionTrack = (
      audio: HTMLAudioElement | null,
      fadeRef: React.MutableRefObject<number | null>,
      shouldPlay: boolean,
      targetVol: number,
      fadeMs: number,
    ) => {
      if (!audio) return;
      if (fadeRef.current != null) {
        window.clearInterval(fadeRef.current);
        fadeRef.current = null;
      }
      const startVol = audio.volume;
      const endVol = shouldPlay ? targetVol : 0;

      if (shouldPlay && audio.paused) {
        audio.volume = 0;
        audio.play().catch(() => {});
      }

      const startedAt = Date.now();
      fadeRef.current = window.setInterval(() => {
        const t = Math.min((Date.now() - startedAt) / fadeMs, 1);
        audio.volume = Math.max(0, Math.min(1, startVol + (endVol - startVol) * t));
        if (t >= 1) {
          if (fadeRef.current != null) {
            window.clearInterval(fadeRef.current);
            fadeRef.current = null;
          }
          if (!shouldPlay && !audio.paused) {
            audio.pause();
            audio.currentTime = 0;
          }
        }
      }, 40);
    };

    const inLobby    = view === 'venue' || view === 'setup';
    const inRacebook = view === 'racebook';
    const inRace     = view === 'race';

    // Indy → lobby only.
    transitionTrack(
      indyRef.current,
      indyFadeRef,
      inLobby && musicOn,
      VOL_INDY_LOBBY,
      FADE_NORMAL_MS,
    );

    // Glory → racebook only. When transitioning to race, fade out exactly over
    // the countdown so it ends right when "GO!" hits.
    transitionTrack(
      gloryRef.current,
      gloryFadeRef,
      inRacebook && musicOn,
      VOL_GLORY_RACEBOOK,
      inRace ? FADE_COUNTDOWN_MS : FADE_QUICK_MS,
    );

    // Crowd → racebook + race. Volume target shifts loud during race; the
    // fade-in length matches the countdown so the swell tracks 3-2-1-GO.
    // Once post-race commentary is firing, duck the crowd hard so the
    // announcer reads cleanly over the celebration.
    let crowdTarget: number;
    if (commentaryActive)        crowdTarget = VOL_CROWD_DUCKED;
    else if (inRace)             crowdTarget = VOL_CROWD_RACE;
    else                         crowdTarget = VOL_CROWD_RACEBOOK;
    transitionTrack(
      crowdRef.current,
      crowdFadeRef,
      (inRacebook || inRace) && sfxOn,
      crowdTarget,
      // Snappy duck (800ms) when commentary kicks in so we hear the announcer
      // immediately, otherwise the regular fade times.
      commentaryActive ? FADE_QUICK_MS : (inRace ? FADE_COUNTDOWN_MS : FADE_NORMAL_MS),
    );
  }, [view, musicOn, sfxOn, commentaryActive]);

  // ─── Pre-race commentary loop (lives at parent so racebook → preRace
  // transitions don't kill the announcer mid-clip) ─────────────────────
  // Active while we have odds for a field that hasn't been raced yet.
  // The loop fetches one clip after another, prefetching the next at 70%
  // playback. Phase rolls between 'pre' and 'fan' (with Light-Yagami-gated
  // Japanese accent). Cuts hard when trajectory becomes non-null
  // (handleSendOff fired) or odds is cleared (handleNewSession).
  useEffect(() => {
    /* eslint-disable no-console */
    if (!odds || !field.length || trajectory) {
      console.info('[commentary pre/parent] gate not satisfied, skip', {
        has_odds: !!odds, field_size: field.length, trajectory: !!trajectory,
      });
      return;
    }
    if (preCommentaryFetchedRef.current) {
      console.info('[commentary pre/parent] already fetched — skipping');
      return;
    }
    preCommentaryFetchedRef.current = true;

    let cancelled = false;
    type Queued = { url: string; clip: CommentaryClip };
    let nextQueued: Queued | null = null;
    let prefetchInFlight = false;
    let clipsPlayed = 0;
    let prevPhase: 'pre' | 'fan' = 'pre';

    const rollNextPhase = (): 'pre' | 'fan' => {
      if (clipsPlayed < 2)     return 'pre';
      if (prevPhase === 'fan') return 'pre';
      return Math.random() < 0.28 ? 'fan' : 'pre';
    };

    const hasLightYagami = field.some((h) => {
      const blob = `${h.full_name ?? ''} ${h.saddle_name ?? ''}`.toLowerCase();
      return blob.includes('light yagami') || blob.includes('yagami');
    });
    const rollFanAccent = (): 'indian' | 'american' | 'chinese' | 'japanese' => {
      if (hasLightYagami) {
        const n = Math.random();
        if (n < 0.25) return 'japanese';
        if (n < 0.50) return 'indian';
        if (n < 0.75) return 'american';
        return 'chinese';
      }
      const n = Math.random();
      if (n < 0.34) return 'indian';
      if (n < 0.67) return 'american';
      return 'chinese';
    };

    const fetchClip = async (
      phase: 'pre' | 'fan', isContinuation: boolean,
    ): Promise<Queued | null> => {
      try {
        const accent = phase === 'fan' ? rollFanAccent() : undefined;
        console.info('[commentary pre/parent] fetching', { phase, accent, is_continuation: isContinuation });
        const t0 = Date.now();
        const clip = await fetchCommentary({
          phase, field, odds,
          year_counter: odds.year_counter,
          distance: odds.distance,
          is_continuation: isContinuation,
          accent,
        });
        console.info('[commentary pre/parent] clip received', {
          phase, ms: Date.now() - t0,
          text_chars: clip.text?.length ?? 0,
          fan_accent: clip.fan_accent ?? null,
          fan_name:   clip.fan_name   ?? null,
        });
        const url = b64ToBlobUrl(clip.audio_b64, clip.audio_mime || 'audio/mpeg');
        return { url, clip };
      } catch (e: any) {
        console.error('[commentary pre/parent] fetch failed:', e?.response?.status, e?.response?.data ?? e?.message ?? e);
        return null;
      }
    };

    const playQueued = (q: Queued) => {
      const audio = preCommentaryAudioRef.current;
      if (!audio || cancelled) {
        console.warn('[commentary pre/parent] play skipped', { audio_exists: !!audio, cancelled });
        URL.revokeObjectURL(q.url);
        return;
      }
      if (preCommentaryUrlRef.current) URL.revokeObjectURL(preCommentaryUrlRef.current);
      preCommentaryUrlRef.current = q.url;
      audio.src = q.url;
      audio.volume = COMMENTARY_VOLUME;
      audio.play()
        .then(() => console.info('[commentary pre/parent] play() succeeded'))
        .catch((err) => console.error('[commentary pre/parent] play() rejected:', err?.name, err?.message ?? err));
      const ccPhase = q.clip.phase === 'fan' ? 'fan' : 'pre';
      setCommentaryCC({
        text:      q.clip.text || '',
        audio,
        phase:     ccPhase,
        fanName:   q.clip.fan_name   ?? null,
        fanAccent: (q.clip.fan_accent as ('indian' | 'american' | 'chinese' | 'japanese' | null | undefined)) ?? null,
      });
      setPreCommentaryOnAir(true);
      clipsPlayed += 1;
      prevPhase = q.clip.phase === 'fan' ? 'fan' : 'pre';
    };
    /* eslint-enable no-console */

    const prefetchNext = async () => {
      if (prefetchInFlight || nextQueued || cancelled) return;
      prefetchInFlight = true;
      try {
        const phase = rollNextPhase();
        const q = await fetchClip(phase, /* is_continuation */ true);
        if (cancelled) {
          if (q) URL.revokeObjectURL(q.url);
          return;
        }
        nextQueued = q;
      } finally {
        prefetchInFlight = false;
      }
    };

    const onTimeUpdate = () => {
      const audio = preCommentaryAudioRef.current;
      if (!audio) return;
      const dur = audio.duration;
      if (!Number.isFinite(dur) || dur <= 0) return;
      if (audio.currentTime / dur > 0.70) prefetchNext();
    };
    const onEnded = async () => {
      if (cancelled) return;
      if (nextQueued) {
        const q = nextQueued; nextQueued = null;
        playQueued(q);
      } else {
        const phase = rollNextPhase();
        const q = await fetchClip(phase, /* is_continuation */ true);
        if (q && !cancelled) playQueued(q);
      }
    };

    // ── Boot the loop ──
    fetchClip('pre', /* is_continuation */ false).then((q) => {
      if (cancelled) {
        if (q) URL.revokeObjectURL(q.url);
        return;
      }
      if (!q) return;
      playQueued(q);
      const audio = preCommentaryAudioRef.current;
      if (audio) {
        audio.addEventListener('timeupdate', onTimeUpdate);
        audio.addEventListener('ended', onEnded);
      }
    });

    return () => {
      cancelled = true;
      const audio = preCommentaryAudioRef.current;
      if (audio) {
        audio.removeEventListener('timeupdate', onTimeUpdate);
        audio.removeEventListener('ended', onEnded);
        audio.pause();
        audio.currentTime = 0;
      }
      if (preCommentaryUrlRef.current) {
        URL.revokeObjectURL(preCommentaryUrlRef.current);
        preCommentaryUrlRef.current = null;
      }
      if (nextQueued) {
        URL.revokeObjectURL(nextQueued.url);
        nextQueued = null;
      }
      setPreCommentaryOnAir(false);
      setCommentaryCC(null);
      // Allow re-mount (StrictMode dev double-invoke + the next race) to
      // fire a fresh loop. Without resetting this the StrictMode unmount
      // would block the remount's first fetch.
      preCommentaryFetchedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [odds, trajectory, field]);

  const handleProceed = async (chosen: HorseInField[]) => {
    setLoadingOdds(true);
    setGlobalErr(null);
    try {
      const o = await fetchRaceOdds(chosen);
      setField(chosen);
      setOdds(o);
      setView('racebook');
    } catch (e: any) {
      setGlobalErr(e?.message || 'Failed to load odds');
    } finally {
      setLoadingOdds(false);
    }
  };

  // RacebookView calls this on review-confirm. We fold the placed bets
  // into the active bettor session and route to the pre-race
  // confirmation view (NOT directly to the race) so the user can verify
  // bets, optionally stack another bettor, and start the race when ready.
  const handleConfirmActiveSession = (placed: LiveBet[]) => {
    setBettorSessions((prev) => {
      const next = prev.slice();
      const idx = activeBettorIdx;
      if (next[idx]) {
        next[idx] = { ...next[idx], bets: placed, confirmed: true };
      }
      return next;
    });
    setView('preRace');
  };

  // Edit an EXISTING session's bets (any bettor — the bookie's own slot
  // counts). Flips that session's confirmed flag back to false, points
  // the active idx at it, and re-routes to the racebook. The remount
  // (key={activeBettorIdx}) seeds the racebook's local stake inputs +
  // dropdowns from the session's existing bets.
  const handleEditBettor = (idx: number) => {
    setBettorSessions((prev) => {
      if (!prev[idx]) return prev;
      const next = prev.slice();
      next[idx] = { ...next[idx], confirmed: false };
      return next;
    });
    setActiveBettorIdx(idx);
    setView('racebook');
  };

  // Bookie picks a different bettor to run a fresh racebook for. Adds a
  // new session if the bettor isn't already in the stack, then switches
  // active to that session and re-mounts RacebookView (key={activeBettorIdx}).
  const handleRunForBettor = (b: BettorOption) => {
    setBettorSessions((prev) => {
      const existing = prev.findIndex((s) => s.user_id === b.user_id);
      if (existing >= 0) {
        // Already stacked — just reactivate that session for editing.
        setActiveBettorIdx(existing);
        // Mark un-confirmed so they can edit again from racebook.
        const next = prev.slice();
        next[existing] = { ...next[existing], confirmed: false };
        return next;
      }
      const newSess: BettorSession = {
        user_id:     b.user_id,
        screen_name: b.screenname || b.screen_name || 'bettor',
        bankroll:    STARTING_BANKROLL,
        bets:        [],
        confirmed:   false,
      };
      const next = [...prev, newSess];
      setActiveBettorIdx(next.length - 1);
      return next;
    });
    setView('racebook');
  };

  // From the pre-race confirmation view: actually fire the race. Persist
  // bets later (post-settlement) via /persist-multi-bets, when we have
  // results to attach.
  const handleSendOff = async () => {
    setLoadingRace(true);
    setGlobalErr(null);
    stopPostCommentary();
    setCommentaryActive(false);
    setCommentaryCC(null);
    try {
      const t = await runRace(field);
      // Aggregate ALL confirmed sessions' bets into the legacy `bets` state
      // so existing race / settlement code continues to render. The
      // multi-bettor breakdown lives in `bettorSessions`.
      const allBets: LiveBet[] = bettorSessions
        .filter((s) => s.confirmed)
        .flatMap((s) => s.bets as LiveBet[]);
      setBets(allBets);
      setTrajectory(t);
      setView('race');
    } catch (e: any) {
      setGlobalErr(e?.message || 'Failed to run race');
    } finally {
      setLoadingRace(false);
    }
  };

  const handleNewSession = () => {
    // Silence any lingering post-race commentary before returning to setup.
    stopPostCommentary();
    setCommentaryActive(false);
    setCommentaryCC(null);
    setBets([]);
    setTrajectory(null);
    setOdds(null);
    setField([]);
    // Reset the bettor stack to just the logged-in user with a fresh bankroll.
    setBettorSessions([{
      user_id:     authUser?.user_id || 'guest',
      screen_name: authUser?.screen_name || authUser?.username || authUser?.email || 'Me',
      bankroll:    STARTING_BANKROLL,
      bets:        [],
      confirmed:   false,
    }]);
    setActiveBettorIdx(0);
    setPersistError(null);
    setView('setup');
  };

  // The Churchill Downs lock applies to every view EXCEPT 'venue' (the
  // venue picker stays open so Cheltenham is still reachable) and 'stats'
  // (read-only). Bookies bypass entirely. If a bettor is mid-flow when
  // the lock flips on, snap them back to the lock screen — they can
  // still go back to the venue picker from there.
  const churchillBlocksThisView =
    churchillLocked
    && !isBookie
    && view !== 'venue'
    && view !== 'stats';

  if (churchillBlocksThisView) {
    return (
      <div className="hr-page" style={PAGE_BG_STYLE}>
        <div className="hr-locked">
          <div className="hr-locked-badge">🔒</div>
          <h1>Churchill Downs is locked</h1>
          <p>The Churchill Downs racebook is temporarily closed for bettors. Please check back later.</p>
          <span className="hr-locked-hint">(Bookies retain access regardless of the lock.)</span>
          <button className="hr-locked-back" onClick={() => setView('venue')}>← Back to venues</button>
        </div>
      </div>
    );
  }

  return (
    <div className="hr-page" style={PAGE_BG_STYLE}>
      {view === 'venue' && (
        <VenueView
          onChurchill={() => {
            if (churchillLocked && !isBookie) {
              setGlobalErr('Churchill Downs is currently locked. Please check back later.');
              return;
            }
            setView('setup');
          }}
          onCheltenham={() => navigate('/racing/cheltenham')}
          onHelp={() => setHelpOpen(true)}
          onStats={() => setView('stats')}
          churchillLocked={churchillLocked && !isBookie}
        />
      )}
      {view === 'stats' && (
        <StatsView onBack={() => setView('venue')} />
      )}
      {view === 'setup' && (
        <SetupView
          horses={horses}
          onProceed={handleProceed}
          onBack={() => setView('venue')}
          onHelp={() => setHelpOpen(true)}
        />
      )}
      {view === 'racebook' && odds && activeSession && (
        <RacebookView
          // Force-remount when switching active bettor so the racebook's
          // local stake-input state is freshly initialised.
          key={`book-${activeBettorIdx}`}
          field={field}
          odds={odds}
          oddsFormat={oddsFormat}
          setOddsFormat={setOddsFormat}
          onBack={() => setView('setup')}
          onHelp={() => setHelpOpen(true)}
          onSendOff={handleConfirmActiveSession}
          activeBettor={activeSession}
          isBookieMode={isBookie && bettorSessions.length > 1}
        />
      )}
      {view === 'preRace' && odds && (
        <PreRaceConfirmView
          field={field}
          odds={odds}
          oddsFormat={oddsFormat}
          sessions={bettorSessions}
          activeBettorIdx={activeBettorIdx}
          setActiveBettorIdx={setActiveBettorIdx}
          isBookie={isBookie}
          bettorOptions={bettorOptions}
          onRunForBettor={handleRunForBettor}
          onEditBettor={handleEditBettor}
          onSendOff={handleSendOff}
          onBackToRacebook={() => setView('racebook')}
        />
      )}
      {view === 'race' && trajectory && odds && (
        <RaceView
          field={field}
          trajectory={trajectory}
          odds={odds}
          bets={bets}
          oddsFormat={oddsFormat}
          onSettle={() => setView('settlement')}
          onCommentaryActiveChange={setCommentaryActive}
          onCommentaryCCChange={setCommentaryCC}
          bettorSessions={bettorSessions}
        />
      )}
      {view === 'settlement' && trajectory && (
        <SettlementView
          field={field}
          trajectory={trajectory}
          bets={bets}
          oddsFormat={oddsFormat}
          onNewSession={handleNewSession}
          onBackToVenue={() => setView('venue')}
          bettorSessions={bettorSessions}
          isBookie={isBookie}
          persistError={persistError}
          setPersistError={setPersistError}
        />
      )}
      {loadingOdds && (
        <div className="hr-loading-overlay">
          <span className="hr-loading-text">Pricing every market — Monte Carlo running…</span>
        </div>
      )}
      {loadingRace && (
        <div className="hr-loading-overlay">
          <span className="hr-loading-text">Sending the field to the gate…</span>
        </div>
      )}
      {globalErr && <div className="hr-global-err" onClick={() => setGlobalErr(null)}>{globalErr}</div>}

      {/* Floating sound preferences — persists to localStorage. */}
      <div className="hr-sound-controls" role="group" aria-label="Sound preferences">
        <button
          className={`hr-sound-toggle ${musicOn ? 'is-on' : ''}`}
          onClick={() => setMusicOn((v) => !v)}
          title={musicOn ? 'Mute music' : 'Unmute music'}
        >
          <span aria-hidden>♪</span>
          <span className="hr-sound-label">Music{musicOn ? '' : ' off'}</span>
        </button>
        <button
          className={`hr-sound-toggle ${sfxOn ? 'is-on' : ''}`}
          onClick={() => setSfxOn((v) => !v)}
          title={sfxOn ? 'Mute sound FX' : 'Unmute sound FX'}
        >
          <span aria-hidden>🔊</span>
          <span className="hr-sound-label">FX{sfxOn ? '' : ' off'}</span>
        </button>
      </div>

      <HelpModal isOpen={helpOpen} onClose={() => setHelpOpen(false)} horses={horses} />
      {/* Audio tracks — controlled imperatively from the view-change effect above.
          preload="none" on all three so the static-asset queue (especially the
          58 MB crowd file) doesn't compete with the /odds Monte Carlo call.
          Each track loops; volume + play state driven entirely by `view`. */}
      <audio ref={indyRef}  src={INDY_URL}  loop preload="none" />
      <audio ref={gloryRef} src={GLORY_URL} loop preload="none" />
      <audio ref={crowdRef} src={CROWD_URL} loop preload="none" />

      {/* Pre-race commentary audio — driven imperatively by the parent's
          commentary loop. Lives at this level so it persists through
          racebook → preRace transitions; never re-mounted between them. */}
      <audio ref={preCommentaryAudioRef} preload="auto" />

      {/* "On Air" pill — visible while the announcer's loop is active in
          racebook OR preRace. Hidden during the race + settlement. */}
      {preCommentaryOnAir && (view === 'racebook' || view === 'preRace') && (
        <div className="hr-commentary-banner" title="Pre-race call (AI)">
          <span className="hr-commentary-mic" aria-hidden>🎙️</span>
          <span className="hr-commentary-label">On Air · Track Announcer</span>
        </div>
      )}

      {/* Subtle bottom CC bar — mirrors the playing commentary clip text.
          Top-level so post-race captions persist over the settlement view. */}
      <CommentaryCC cc={commentaryCC} />
    </div>
  );
}
