-- Create trading_locks table for trading games
CREATE TABLE IF NOT EXISTS trading_locks (
  lock_id SERIAL PRIMARY KEY,
  lock_name TEXT UNIQUE NOT NULL,
  locked BOOLEAN NOT NULL DEFAULT FALSE,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Insert master lock and individual game locks (all unlocked initially)
INSERT INTO trading_locks (lock_name, locked, description)
VALUES
  ('master', FALSE, 'Master switch to lock all trading games'),
  ('sopranos', FALSE, 'Lock for The Sopranos trading game'),
  ('breaking_bad', FALSE, 'Lock for Breaking Bad trading game')
ON CONFLICT (lock_name) DO NOTHING;
