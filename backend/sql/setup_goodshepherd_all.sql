-- Complete Good Shepherd Trading Setup - Run this entire file in Supabase SQL Editor

-- 1. Create goodshepherd_trading table
CREATE TABLE IF NOT EXISTS goodshepherd_trading (
  character_id SERIAL PRIMARY KEY,
  roll_number INTEGER UNIQUE NOT NULL,
  name TEXT UNIQUE NOT NULL,
  img_filename TEXT NOT NULL,
  dob DATE NOT NULL,
  height DECIMAL(5,2) NOT NULL,
  house TEXT NOT NULL CHECK (house IN ('Spring', 'Summer', 'Autumn', 'Winter')),
  was_prefect BOOLEAN NOT NULL DEFAULT FALSE,
  expelled BOOLEAN NOT NULL DEFAULT FALSE,
  was_404 BOOLEAN NOT NULL DEFAULT FALSE,
  year_joined INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_goodshepherd_roll_number ON goodshepherd_trading(roll_number);
CREATE INDEX IF NOT EXISTS idx_goodshepherd_house ON goodshepherd_trading(house);
CREATE INDEX IF NOT EXISTS idx_goodshepherd_was_prefect ON goodshepherd_trading(was_prefect);
CREATE INDEX IF NOT EXISTS idx_goodshepherd_expelled ON goodshepherd_trading(expelled);
CREATE INDEX IF NOT EXISTS idx_goodshepherd_was_404 ON goodshepherd_trading(was_404);
CREATE INDEX IF NOT EXISTS idx_goodshepherd_year_joined ON goodshepherd_trading(year_joined);

-- 2. Create goodshepherd_settings table
CREATE TABLE IF NOT EXISTS goodshepherd_settings (
  settingid SERIAL PRIMARY KEY,
  setting TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL,
  CHECK (
    (setting != 'card_nature' OR value IN ('static', 'random'))
  )
);

-- Insert default settings
INSERT INTO goodshepherd_settings (setting, value) VALUES
  ('card_nature', 'static'),
  ('card_count', '3')
ON CONFLICT (setting) DO NOTHING;

-- 3. Create goodshepherd_markets table
CREATE TABLE IF NOT EXISTS goodshepherd_markets (
  market_id SERIAL PRIMARY KEY,
  market_type TEXT NOT NULL CHECK (market_type IN ('character', 'house', 'special')),
  character_id INTEGER REFERENCES goodshepherd_trading(character_id) ON DELETE CASCADE,
  house TEXT,
  count TEXT,
  category TEXT,
  text_on_screen TEXT NOT NULL,
  point INTEGER
);

CREATE INDEX IF NOT EXISTS idx_goodshepherd_markets_type ON goodshepherd_markets(market_type);
CREATE INDEX IF NOT EXISTS idx_goodshepherd_markets_character ON goodshepherd_markets(character_id);
CREATE INDEX IF NOT EXISTS idx_goodshepherd_markets_house ON goodshepherd_markets(house);
CREATE INDEX IF NOT EXISTS idx_goodshepherd_markets_category ON goodshepherd_markets(category);
