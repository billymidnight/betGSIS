-- Create poker_players table
CREATE TABLE IF NOT EXISTS poker_players (
  player_id   SERIAL PRIMARY KEY,
  player_name TEXT NOT NULL,
  player_screenname TEXT
);

-- Seed with some initial players (adjust as needed)
-- INSERT INTO poker_players (player_name, player_screenname) VALUES
--   ('Player One', 'p1_screen'),
--   ('Player Two', 'p2_screen');
