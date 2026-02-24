-- Run this entire file in your Supabase SQL editor to set up Breaking Bad Trading

-- 1. Create breakingbad_trading table
CREATE TABLE IF NOT EXISTS breakingbad_trading (
  character_id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  img_filename TEXT NOT NULL,
  age INTEGER NOT NULL,
  gender CHAR(1) NOT NULL CHECK (gender IN ('M', 'F')),
  was_lawyer BOOLEAN NOT NULL DEFAULT FALSE,
  won_emmy BOOLEAN NOT NULL DEFAULT FALSE,
  family TEXT,
  survived BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_breakingbad_family ON breakingbad_trading(family);
CREATE INDEX IF NOT EXISTS idx_breakingbad_was_lawyer ON breakingbad_trading(was_lawyer);
CREATE INDEX IF NOT EXISTS idx_breakingbad_won_emmy ON breakingbad_trading(won_emmy);
CREATE INDEX IF NOT EXISTS idx_breakingbad_survived ON breakingbad_trading(survived);

-- 2. Create breakingbad_settings table
CREATE TABLE IF NOT EXISTS breakingbad_settings (
  settingid SERIAL PRIMARY KEY,
  setting TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL,
  CHECK (
    (setting != 'card_nature' OR value IN ('static', 'random'))
  )
);

INSERT INTO breakingbad_settings (setting, value) VALUES
  ('card_count', '3'),
  ('time', '120'),
  ('card_nature', 'static')
ON CONFLICT (setting) DO NOTHING;

-- 3. Create breakingbad_markets table
CREATE TABLE IF NOT EXISTS breakingbad_markets (
  market_id SERIAL PRIMARY KEY,
  market_type TEXT NOT NULL,
  character_id INTEGER REFERENCES breakingbad_trading(character_id),
  count TEXT,
  category TEXT,
  text_on_screen TEXT NOT NULL,
  point INTEGER
);

CREATE INDEX IF NOT EXISTS idx_breakingbad_markets_type ON breakingbad_markets(market_type);
CREATE INDEX IF NOT EXISTS idx_breakingbad_markets_character ON breakingbad_markets(character_id);

-- 4. Insert Breaking Bad characters
INSERT INTO breakingbad_trading (name, img_filename, age, gender, was_lawyer, won_emmy, family, survived) VALUES
  ('Walter White', 'white_walter.jpg', 52, 'M', FALSE, TRUE, 'White', FALSE),
  ('Jesse Pinkman', 'pinkman_jesse.jpg', 27, 'M', FALSE, TRUE, NULL, TRUE),
  ('Skyler White', 'white_skyler.jpg', 42, 'F', FALSE, TRUE, 'White', TRUE),
  ('Hank Schrader', 'schrader_hank.jpg', 46, 'M', FALSE, TRUE, 'Schrader', FALSE),
  ('Marie Schrader', 'schrader_marie.jpg', 40, 'F', FALSE, FALSE, 'Schrader', TRUE),
  ('Walter White Jr.', 'white_waltjr.jpg', 17, 'M', FALSE, FALSE, 'White', TRUE),
  ('Holly White', 'white_holly.jpg', 1, 'F', FALSE, FALSE, 'White', TRUE),
  ('Saul Goodman', 'goodman_saul.jpg', 45, 'M', TRUE, FALSE, NULL, TRUE),
  ('Mike Ehrmantraut', 'ehrmantraut_mike.jpg', 64, 'M', FALSE, TRUE, NULL, FALSE),
  ('Gustavo Fring', 'fring_gustavo.jpg', 52, 'M', FALSE, TRUE, NULL, FALSE),
  ('Hector Salamanca', 'salamanca_hector.jpg', 75, 'M', FALSE, FALSE, 'Salamanca', FALSE),
  ('Tuco Salamanca', 'salamanca_tuco.jpg', 34, 'M', FALSE, FALSE, 'Salamanca', FALSE),
  ('Lalo Salamanca', 'salamanca_lalo.jpg', 38, 'M', FALSE, FALSE, 'Salamanca', FALSE),
  ('Marco Salamanca', 'salamanca_marco.jpg', 29, 'M', FALSE, FALSE, 'Salamanca', FALSE),
  ('Leonel Salamanca', 'salamanca_leonel.jpg', 28, 'M', FALSE, FALSE, 'Salamanca', FALSE),
  ('Lydia Rodarte-Quayle', 'quayle_lydia.jpg', 38, 'F', FALSE, FALSE, NULL, FALSE),
  ('Jane Margolis', 'margolis_jane.jpg', 26, 'F', FALSE, FALSE, NULL, FALSE),
  ('Huell Babineaux', 'babineaux_huell.jpg', 43, 'M', FALSE, FALSE, NULL, TRUE),
  ('Chuck McGill', 'mcgill_chuck.jpg', 58, 'M', TRUE, TRUE, NULL, FALSE),
  ('Kim Wexler', 'wexler_kim.jpg', 35, 'F', TRUE, TRUE, NULL, TRUE),
  ('Howard Hamlin', 'hamlin_howard.jpg', 44, 'M', TRUE, FALSE, NULL, FALSE),
  ('Juan Bolsa', 'bolsa_juan.jpg', 48, 'M', FALSE, FALSE, NULL, FALSE),
  ('Don Eladio', 'eladio_don.jpg', 62, 'M', FALSE, FALSE, NULL, FALSE),
  ('Tyrus Kitt', 'tyrus.jpg', 39, 'M', FALSE, FALSE, NULL, FALSE),
  ('Victor', 'victor.jpg', 32, 'M', FALSE, FALSE, NULL, FALSE),
  ('Jack Welker', 'welker_jack.jpg', 52, 'M', FALSE, FALSE, NULL, FALSE),
  ('Stacey Ehrmantraut', 'ehrmantraut_stacey.jpg', 32, 'F', FALSE, FALSE, NULL, TRUE)
ON CONFLICT (name) DO NOTHING;

-- 5. Insert character drawn/not drawn markets
INSERT INTO breakingbad_markets (market_type, character_id, count, category, text_on_screen, point) VALUES
  ('character', 1, 'drawn', NULL, 'Walter White - Drawn', NULL),
  ('character', 2, 'drawn', NULL, 'Jesse Pinkman - Drawn', NULL),
  ('character', 3, 'drawn', NULL, 'Skyler White - Drawn', NULL),
  ('character', 4, 'drawn', NULL, 'Hank Schrader - Drawn', NULL),
  ('character', 5, 'drawn', NULL, 'Marie Schrader - Drawn', NULL),
  ('character', 6, 'drawn', NULL, 'Walter White Jr. - Drawn', NULL),
  ('character', 7, 'drawn', NULL, 'Holly White - Drawn', NULL),
  ('character', 8, 'drawn', NULL, 'Saul Goodman - Drawn', NULL),
  ('character', 9, 'drawn', NULL, 'Mike Ehrmantraut - Drawn', NULL),
  ('character', 10, 'drawn', NULL, 'Gustavo Fring - Drawn', NULL),
  ('character', 11, 'drawn', NULL, 'Hector Salamanca - Drawn', NULL),
  ('character', 12, 'drawn', NULL, 'Tuco Salamanca - Drawn', NULL),
  ('character', 13, 'drawn', NULL, 'Lalo Salamanca - Drawn', NULL),
  ('character', 14, 'drawn', NULL, 'Marco Salamanca - Drawn', NULL),
  ('character', 15, 'drawn', NULL, 'Leonel Salamanca - Drawn', NULL),
  ('character', 16, 'drawn', NULL, 'Lydia Rodarte-Quayle - Drawn', NULL),
  ('character', 17, 'drawn', NULL, 'Jane Margolis - Drawn', NULL),
  ('character', 18, 'drawn', NULL, 'Huell Babineaux - Drawn', NULL),
  ('character', 19, 'drawn', NULL, 'Chuck McGill - Drawn', NULL),
  ('character', 20, 'drawn', NULL, 'Kim Wexler - Drawn', NULL),
  ('character', 21, 'drawn', NULL, 'Howard Hamlin - Drawn', NULL),
  ('character', 22, 'drawn', NULL, 'Juan Bolsa - Drawn', NULL),
  ('character', 23, 'drawn', NULL, 'Don Eladio - Drawn', NULL),
  ('character', 24, 'drawn', NULL, 'Tyrus Kitt - Drawn', NULL),
  ('character', 25, 'drawn', NULL, 'Victor - Drawn', NULL),
  ('character', 26, 'drawn', NULL, 'Jack Welker - Drawn', NULL),
  ('character', 27, 'drawn', NULL, 'Stacey Ehrmantraut - Drawn', NULL),
  ('character', 1, 'not_drawn', NULL, 'Walter White - Not Drawn', NULL),
  ('character', 2, 'not_drawn', NULL, 'Jesse Pinkman - Not Drawn', NULL),
  ('character', 3, 'not_drawn', NULL, 'Skyler White - Not Drawn', NULL),
  ('character', 4, 'not_drawn', NULL, 'Hank Schrader - Not Drawn', NULL),
  ('character', 5, 'not_drawn', NULL, 'Marie Schrader - Not Drawn', NULL),
  ('character', 6, 'not_drawn', NULL, 'Walter White Jr. - Not Drawn', NULL),
  ('character', 7, 'not_drawn', NULL, 'Holly White - Not Drawn', NULL),
  ('character', 8, 'not_drawn', NULL, 'Saul Goodman - Not Drawn', NULL),
  ('character', 9, 'not_drawn', NULL, 'Mike Ehrmantraut - Not Drawn', NULL),
  ('character', 10, 'not_drawn', NULL, 'Gustavo Fring - Not Drawn', NULL),
  ('character', 11, 'not_drawn', NULL, 'Hector Salamanca - Not Drawn', NULL),
  ('character', 12, 'not_drawn', NULL, 'Tuco Salamanca - Not Drawn', NULL),
  ('character', 13, 'not_drawn', NULL, 'Lalo Salamanca - Not Drawn', NULL),
  ('character', 14, 'not_drawn', NULL, 'Marco Salamanca - Not Drawn', NULL),
  ('character', 15, 'not_drawn', NULL, 'Leonel Salamanca - Not Drawn', NULL),
  ('character', 16, 'not_drawn', NULL, 'Lydia Rodarte-Quayle - Not Drawn', NULL),
  ('character', 17, 'not_drawn', NULL, 'Jane Margolis - Not Drawn', NULL),
  ('character', 18, 'not_drawn', NULL, 'Huell Babineaux - Not Drawn', NULL),
  ('character', 19, 'not_drawn', NULL, 'Chuck McGill - Not Drawn', NULL),
  ('character', 20, 'not_drawn', NULL, 'Kim Wexler - Not Drawn', NULL),
  ('character', 21, 'not_drawn', NULL, 'Howard Hamlin - Not Drawn', NULL),
  ('character', 22, 'not_drawn', NULL, 'Juan Bolsa - Not Drawn', NULL),
  ('character', 23, 'not_drawn', NULL, 'Don Eladio - Not Drawn', NULL),
  ('character', 24, 'not_drawn', NULL, 'Tyrus Kitt - Not Drawn', NULL),
  ('character', 25, 'not_drawn', NULL, 'Victor - Not Drawn', NULL),
  ('character', 26, 'not_drawn', NULL, 'Jack Welker - Not Drawn', NULL),
  ('character', 27, 'not_drawn', NULL, 'Stacey Ehrmantraut - Not Drawn', NULL)
ON CONFLICT DO NOTHING;
