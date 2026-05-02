-- Horse Racing — historical race results storage.
--
-- Design:
--   • A "season" is identified by an integer year_counter, kept in the
--     horse_settings KV table. Starts at 1707 and increments by 1 at the
--     conclusion of every race (handled by the backend on race finish).
--   • Each horse that ran in a given race gets one row in horse_results
--     keyed by (year, horse_id). field_size + distance live alongside so
--     the stats UI can filter / aggregate properly without re-joining.
--   • finish_seconds is stored as the literal wall-clock time (e.g. 9.42
--     for a 9.42 s finish) so the stats page can show times directly.
--
-- Stats this schema supports cleanly:
--   • Most wins per horse:       SELECT horse_id, COUNT(*) ... WHERE finish_position=1
--   • Most places (top-2):       ... WHERE finish_position <= 2
--   • Most shows (top-3):        ... WHERE finish_position <= 3
--   • Total participations:      ... GROUP BY horse_id
--   • Country leaderboard:       JOIN horses USING (horse_id) GROUP BY country
--   • Per-year results table:    ... WHERE year = ?  ORDER BY year, finish_position
--   • Best ever finish time:     MIN(finish_seconds) at a given distance
--
-- Apply once. The INSERT for year_counter is idempotent (ON CONFLICT skip).

-- ─── 1. Bootstrap year_counter into horse_settings ─────────────────────
INSERT INTO horse_settings (setting_key, setting_value, description)
VALUES (
  'year_counter',
  1707,
  'Current "season" year. Starts at 1707; the backend increments this by 1 at the conclusion of every race so that horse_results rows can be keyed by year.'
)
ON CONFLICT (setting_key) DO NOTHING;

-- ─── 2. horse_results table ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS horse_results (
    result_id        BIGSERIAL PRIMARY KEY,
    -- Race identity
    year             INTEGER     NOT NULL,                   -- snapshot of horse_settings.year_counter at race conclusion
    -- Per-horse outcome
    horse_id         INTEGER     NOT NULL REFERENCES horses(horse_id) ON DELETE CASCADE,
    finish_position  INTEGER     NOT NULL CHECK (finish_position >= 1),  -- 1=winner, N=last
    finish_seconds   NUMERIC(10, 3) NOT NULL CHECK (finish_seconds > 0), -- wall-clock seconds (3 dp)
    -- Race context (denormalised for fast stats queries)
    field_size       INTEGER     NOT NULL CHECK (field_size BETWEEN 2 AND 30),
    distance         INTEGER     NOT NULL,                   -- snapshot of race distance (lengths)
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per (year, horse) — a horse can only run once per "season" in this schema
CREATE UNIQUE INDEX IF NOT EXISTS horse_results_year_horse_uq
  ON horse_results (year, horse_id);

-- Hot-path indexes for the stats UI
CREATE INDEX IF NOT EXISTS horse_results_horse_idx
  ON horse_results (horse_id);
CREATE INDEX IF NOT EXISTS horse_results_year_idx
  ON horse_results (year DESC);
CREATE INDEX IF NOT EXISTS horse_results_position_idx
  ON horse_results (finish_position);
