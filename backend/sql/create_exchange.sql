-- ================================================================
-- betGSIS Exchange: schema changes for P2P / Exchange betting
-- ================================================================

-- 1) Add `layeur` column to existing `bets` table
--    Default 'betgsis' so all historical bets are attributed to the house
ALTER TABLE bets ADD COLUMN IF NOT EXISTS layeur TEXT DEFAULT 'betgsis';

-- Backfill any NULLs (safety net)
UPDATE bets SET layeur = 'betgsis' WHERE layeur IS NULL;

-- 2) Create `offerings` table for the Exchange
CREATE TABLE IF NOT EXISTS offerings (
  offering_id     SERIAL PRIMARY KEY,
  layeur_id       UUID NOT NULL,                  -- references auth.users(id)
  bet_name        TEXT NOT NULL,                   -- e.g. "Lebron scores 30+"
  bet_description TEXT,                            -- optional longer description
  odds_american   TEXT NOT NULL,                   -- stored as american odds string e.g. '+150'
  max_bet         NUMERIC NOT NULL DEFAULT 0,      -- max total stake (liquidity cap)
  filled          NUMERIC NOT NULL DEFAULT 0,      -- how much stake already taken
  status          TEXT NOT NULL DEFAULT 'open',    -- 'open' | 'closed' | 'cancelled'
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_offerings_status ON offerings(status);
CREATE INDEX IF NOT EXISTS idx_offerings_layeur ON offerings(layeur_id);
CREATE INDEX IF NOT EXISTS idx_bets_layeur ON bets(layeur);
