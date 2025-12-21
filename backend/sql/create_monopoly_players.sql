-- Create monopoly_players table for Monopoly market odds

CREATE TABLE IF NOT EXISTS monopoly_players (
  player_id SERIAL PRIMARY KEY,
  player_name TEXT NOT NULL,
  rating NUMERIC,
  player_house TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
