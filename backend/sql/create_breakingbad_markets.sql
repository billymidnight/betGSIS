-- Create breakingbad_markets table
CREATE TABLE IF NOT EXISTS breakingbad_markets (
  market_id SERIAL PRIMARY KEY,
  market_type TEXT NOT NULL,
  character_id INTEGER REFERENCES breakingbad_trading(character_id),
  count TEXT,
  category TEXT,
  text_on_screen TEXT NOT NULL,
  point DECIMAL(10, 2),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_breakingbad_markets_type ON breakingbad_markets(market_type);
CREATE INDEX IF NOT EXISTS idx_breakingbad_markets_character ON breakingbad_markets(character_id);

-- Market types:
-- 'character_drawn', 'character_not_drawn' - individual character markets
-- 'family_drawn', 'family_not_drawn' - family markets (like crews)
-- 'lawyer' - was_lawyer markets (all, none, atleast_1)
-- 'emmy' - won_emmy markets (all, none, atleast_1)
-- 'survivor' - survived markets (all, none, atleast_1)
-- 'gender' - gender markets (all men, all women, atleast_1)
-- 'combined_age' - over/under age totals
