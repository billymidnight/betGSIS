-- Migration: create racing_locks table.
-- Used to lock down racing games (Churchill Downs ONLY — Cheltenham is
-- never locked) for regular bettor-role users. BOOKIE-role users are
-- NEVER locked out — they bypass this check entirely.
CREATE TABLE IF NOT EXISTS racing_locks (
  lock_id     SERIAL PRIMARY KEY,
  lock_name   TEXT UNIQUE NOT NULL,
  locked      BOOLEAN NOT NULL DEFAULT FALSE,
  description TEXT,
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Drop the legacy cheltenham row if it exists from an earlier migration —
-- Cheltenham is explicitly never locked.
DELETE FROM racing_locks WHERE lock_name = 'cheltenham';

INSERT INTO racing_locks (lock_name, locked, description)
VALUES
  ('churchill_downs', FALSE, 'Lock for Churchill Downs (offline horse racing). Bettor-role users only — bookies always pass.')
ON CONFLICT (lock_name) DO NOTHING;
