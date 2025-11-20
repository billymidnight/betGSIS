-- Migration: create locks table
CREATE TABLE IF NOT EXISTS locks (
  lock_id SERIAL PRIMARY KEY,
  lock_name TEXT UNIQUE NOT NULL,
  locked BOOLEAN NOT NULL DEFAULT FALSE,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed a master lock row and some common market rows (defaults unlocked)
INSERT INTO locks (lock_name, locked, description)
VALUES
  ('master', FALSE, 'Master switch to lock all markets'),
  ('totals', FALSE, 'Per-market toggle for totals/over-under markets'),
  ('first-guess', FALSE, 'Per-market toggle for first guess markets'),
  ('last-guess', FALSE, 'Per-market toggle for last guess markets')
ON CONFLICT (lock_name) DO NOTHING;
