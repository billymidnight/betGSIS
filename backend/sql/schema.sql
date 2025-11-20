-- SQL schema for application using supplied table definitions

-- 1) users
CREATE TABLE IF NOT EXISTS users (
  user_id UUID PRIMARY KEY,
  email TEXT NOT NULL,
  password TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  net_pnl NUMERIC DEFAULT 0
);

-- 2) bets (reference users.user_id)
CREATE TABLE IF NOT EXISTS bets (
  bet_id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
  market TEXT NOT NULL,
  stake NUMERIC NOT NULL,
  odds_decimal NUMERIC,
  odds_american TEXT,
  bet_name TEXT,
  line_id TEXT,
  status TEXT DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bets_user ON bets (user_id);

-- 3) games
CREATE TABLE IF NOT EXISTS games (
  game_id SERIAL PRIMARY KEY,
  game_name TEXT
);

-- 4) geo_countries
CREATE TABLE IF NOT EXISTS geo_countries (
  country_id SERIAL PRIMARY KEY,
  country_name TEXT,
  freq_pct NUMERIC,
  odds NUMERIC
);

-- 5) geo_players
CREATE TABLE IF NOT EXISTS geo_players (
  player_id SERIAL PRIMARY KEY,
  player_name TEXT,
  mean_score NUMERIC,
  default_threshold INT,
  variance NUMERIC
);

-- 6) geo_game_counter
CREATE TABLE IF NOT EXISTS geo_game_counter (
  counter_id INT PRIMARY KEY,
  current_game_id INT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS policies are intentionally omitted here; apply via Supabase SQL editor and ensure
-- service role is used for server-side privileged operations.
