-- Create breakingbad_trading table
CREATE TABLE IF NOT EXISTS breakingbad_trading (
  character_id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  img_filename TEXT NOT NULL,
  age INTEGER NOT NULL,
  gender CHARACTER(1) NOT NULL CHECK (gender IN ('M', 'F')),
  was_lawyer BOOLEAN NOT NULL DEFAULT FALSE,
  won_emmy BOOLEAN NOT NULL DEFAULT FALSE,
  family TEXT,
  survived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create index on family for faster crew market queries
CREATE INDEX IF NOT EXISTS idx_breakingbad_family ON breakingbad_trading(family);

-- Create index on common query fields
CREATE INDEX IF NOT EXISTS idx_breakingbad_lawyer ON breakingbad_trading(was_lawyer);
CREATE INDEX IF NOT EXISTS idx_breakingbad_emmy ON breakingbad_trading(won_emmy);
CREATE INDEX IF NOT EXISTS idx_breakingbad_survived ON breakingbad_trading(survived);
