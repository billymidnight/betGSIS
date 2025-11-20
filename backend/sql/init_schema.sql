-- init_schema.sql
-- Creates tables for betGSIS Sportsbook (Supabase/Postgres)

CREATE TABLE IF NOT EXISTS sports (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS players (
  id SERIAL PRIMARY KEY,
  sport_id INTEGER REFERENCES sports(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  handle TEXT UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS games (
  id SERIAL PRIMARY KEY,
  sport_id INTEGER REFERENCES sports(id) ON DELETE CASCADE,
  game_no INTEGER NOT NULL,
  played_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE (sport_id, game_no)
);

CREATE TABLE IF NOT EXISTS player_points (
  id SERIAL PRIMARY KEY,
  game_id INTEGER REFERENCES games(id) ON DELETE CASCADE,
  player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  points INTEGER NOT NULL,
  inserted_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS markets (
  id SERIAL PRIMARY KEY,
  sport_id INTEGER REFERENCES sports(id) ON DELETE CASCADE,
  name TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lines (
  id SERIAL PRIMARY KEY,
  market_id INTEGER REFERENCES markets(id) ON DELETE CASCADE,
  player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  line_type TEXT DEFAULT 'OU',
  threshold INTEGER NOT NULL,
  price_model TEXT DEFAULT 'normal',
  margin_bps INTEGER DEFAULT 300,
  prob_over NUMERIC,
  prob_under NUMERIC,
  odds_over_decimal NUMERIC,
  odds_under_decimal NUMERIC,
  odds_over_american INTEGER,
  odds_under_american INTEGER,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE (market_id, player_id, threshold)
);

CREATE TABLE IF NOT EXISTS bets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER,
  line_id INTEGER REFERENCES lines(id) ON DELETE CASCADE,
  side TEXT CHECK (side IN ('over','under')),
  stake NUMERIC NOT NULL,
  price_decimal NUMERIC,
  placed_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pnl_ledger (
  id SERIAL PRIMARY KEY,
  user_id INTEGER,
  bet_id INTEGER REFERENCES bets(id) ON DELETE CASCADE,
  outcome TEXT,
  pnl_amount NUMERIC,
  settled_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- users table (minimal)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'guest',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
