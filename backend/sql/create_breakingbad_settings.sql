-- Create breakingbad_settings table
CREATE TABLE IF NOT EXISTS breakingbad_settings (
  settingid SERIAL PRIMARY KEY,
  setting TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT check_card_nature CHECK (
    setting != 'card_nature' OR value IN ('static', 'random')
  )
);

-- Insert initial settings
INSERT INTO breakingbad_settings (setting, value)
VALUES
  ('card_count', '3'),
  ('time', '120'),
  ('card_nature', 'static')
ON CONFLICT (setting) DO NOTHING;
