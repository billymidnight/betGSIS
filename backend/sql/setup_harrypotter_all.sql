-- Complete Harry Potter Trading Setup - Run this entire file in Supabase SQL Editor

-- 1. Create harrypotter_trading table
CREATE TABLE IF NOT EXISTS harrypotter_trading (
  character_id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  img_filename TEXT NOT NULL,
  age INTEGER NOT NULL,
  gender CHAR(1) NOT NULL CHECK (gender IN ('M', 'F')),
  survived BOOLEAN NOT NULL DEFAULT FALSE,
  house TEXT,
  is_muggle BOOLEAN NOT NULL DEFAULT FALSE,
  is_potter BOOLEAN NOT NULL DEFAULT FALSE,
  is_weasley BOOLEAN NOT NULL DEFAULT FALSE,
  is_death_eater BOOLEAN NOT NULL DEFAULT FALSE,
  is_was_teacher BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_harrypotter_house ON harrypotter_trading(house);
CREATE INDEX IF NOT EXISTS idx_harrypotter_is_muggle ON harrypotter_trading(is_muggle);
CREATE INDEX IF NOT EXISTS idx_harrypotter_is_potter ON harrypotter_trading(is_potter);
CREATE INDEX IF NOT EXISTS idx_harrypotter_is_weasley ON harrypotter_trading(is_weasley);
CREATE INDEX IF NOT EXISTS idx_harrypotter_is_death_eater ON harrypotter_trading(is_death_eater);
CREATE INDEX IF NOT EXISTS idx_harrypotter_is_was_teacher ON harrypotter_trading(is_was_teacher);
CREATE INDEX IF NOT EXISTS idx_harrypotter_survived ON harrypotter_trading(survived);

-- 2. Create harrypotter_settings table
CREATE TABLE IF NOT EXISTS harrypotter_settings (
  settingid SERIAL PRIMARY KEY,
  setting TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL,
  CHECK (
    (setting != 'card_nature' OR value IN ('static', 'random'))
  )
);

-- Insert default settings
INSERT INTO harrypotter_settings (setting, value) VALUES
  ('card_nature', 'static'),
  ('card_count', '3')
ON CONFLICT (setting) DO NOTHING;

-- 3. Create harrypotter_markets table
CREATE TABLE IF NOT EXISTS harrypotter_markets (
  market_id SERIAL PRIMARY KEY,
  market_type TEXT NOT NULL CHECK (market_type IN ('character', 'house', 'special')),
  character_id INTEGER REFERENCES harrypotter_trading(character_id) ON DELETE CASCADE,
  house TEXT,
  count TEXT,
  category TEXT,
  text_on_screen TEXT NOT NULL,
  point INTEGER
);

CREATE INDEX IF NOT EXISTS idx_harrypotter_markets_type ON harrypotter_markets(market_type);
CREATE INDEX IF NOT EXISTS idx_harrypotter_markets_character ON harrypotter_markets(character_id);
CREATE INDEX IF NOT EXISTS idx_harrypotter_markets_house ON harrypotter_markets(house);
CREATE INDEX IF NOT EXISTS idx_harrypotter_markets_category ON harrypotter_markets(category);

-- 4. Insert Harry Potter characters
INSERT INTO harrypotter_trading (name, img_filename, age, gender, survived, house, is_muggle, is_potter, is_weasley, is_death_eater, is_was_teacher) VALUES
  ('Harry Potter', 'potter_harry.jpg', 37, 'M', TRUE, 'Gryffindor', FALSE, TRUE, FALSE, FALSE, FALSE),
  ('Hermione Granger', 'granger_hermione.jpg', 37, 'F', TRUE, 'Gryffindor', FALSE, FALSE, FALSE, FALSE, FALSE),
  ('Ron Weasley', 'weasley_ron.jpg', 37, 'M', TRUE, 'Gryffindor', FALSE, FALSE, TRUE, FALSE, FALSE),
  ('Ginny Weasley', 'weasley_ginny.png', 36, 'F', TRUE, 'Gryffindor', FALSE, FALSE, TRUE, FALSE, FALSE),
  ('Fred Weasley', 'weasley_fred.jpg', 20, 'M', FALSE, 'Gryffindor', FALSE, FALSE, TRUE, FALSE, FALSE),
  ('George Weasley', 'weasley_george.jpg', 37, 'M', TRUE, 'Gryffindor', FALSE, FALSE, TRUE, FALSE, FALSE),
  ('Molly Weasley', 'weasley_molly.png', 68, 'F', TRUE, 'Gryffindor', FALSE, FALSE, TRUE, FALSE, FALSE),
  ('Neville Longbottom', 'longbottom_neville.jpg', 37, 'M', TRUE, 'Gryffindor', FALSE, FALSE, FALSE, FALSE, TRUE),
  ('Sirius Black', 'black_sirius.jpg', 36, 'M', FALSE, 'Gryffindor', FALSE, FALSE, FALSE, FALSE, FALSE),
  ('Remus Lupin', 'lupin_remus.jpg', 38, 'M', FALSE, 'Gryffindor', FALSE, FALSE, FALSE, FALSE, TRUE),
  ('James Potter', 'potter_james.jpg', 21, 'M', FALSE, 'Gryffindor', FALSE, TRUE, FALSE, FALSE, FALSE),
  ('Lily Potter', 'potter_lily.jpg', 21, 'F', FALSE, 'Gryffindor', FALSE, TRUE, FALSE, FALSE, FALSE),
  ('Rubeus Hagrid', 'hagrid_rubeus.jpg', 67, 'M', TRUE, 'Gryffindor', FALSE, FALSE, FALSE, FALSE, TRUE),
  ('Albus Dumbledore', 'dumbledore_albus.jpg', 115, 'M', FALSE, 'Gryffindor', FALSE, FALSE, FALSE, FALSE, TRUE),
  ('Minerva McGonagall', 'mcgonagall_minerva.jpg', 77, 'F', TRUE, 'Gryffindor', FALSE, FALSE, FALSE, FALSE, TRUE),
  ('Draco Malfoy', 'malfoy_draco.jpg', 37, 'M', TRUE, 'Slytherin', FALSE, FALSE, FALSE, TRUE, FALSE),
  ('Lucius Malfoy', 'malfoy_lucius.jpg', 62, 'M', TRUE, 'Slytherin', FALSE, FALSE, FALSE, TRUE, FALSE),
  ('Narcissa Malfoy', 'malfoy_narcissa.jpg', 60, 'F', TRUE, 'Slytherin', FALSE, FALSE, FALSE, FALSE, FALSE),
  ('Severus Snape', 'snape_severus.png', 38, 'M', FALSE, 'Slytherin', FALSE, FALSE, FALSE, TRUE, TRUE),
  ('Lord Voldemort', 'voldemort_lord.jpg', 71, 'M', FALSE, 'Slytherin', FALSE, FALSE, FALSE, TRUE, FALSE),
  ('Bellatrix Lestrange', 'lestrange_bellatrix.jpg', 47, 'F', FALSE, 'Slytherin', FALSE, FALSE, FALSE, TRUE, FALSE),
  ('Peter Pettigrew', 'pettigrew_peter.jpg', 38, 'M', FALSE, 'Gryffindor', FALSE, FALSE, FALSE, TRUE, FALSE),
  ('Horace Slughorn', 'slughorn_horace.jpg', 85, 'M', TRUE, 'Slytherin', FALSE, FALSE, FALSE, FALSE, TRUE),
  ('Dolores Umbridge', 'umbridge_dolores.jpg', 57, 'F', TRUE, 'Slytherin', FALSE, FALSE, FALSE, FALSE, TRUE),
  ('Cedric Diggory', 'diggory_cedric.jpg', 17, 'M', FALSE, 'Hufflepuff', FALSE, FALSE, FALSE, FALSE, FALSE),
  ('Luna Lovegood', 'lovegood_luna.jpg', 36, 'F', TRUE, 'Ravenclaw', FALSE, FALSE, FALSE, FALSE, FALSE),
  ('Cho Chang', 'chang_cho.jpg', 38, 'F', TRUE, 'Ravenclaw', FALSE, FALSE, FALSE, FALSE, FALSE),
  ('Filius Flitwick', 'flitwick_filius.jpg', 82, 'M', TRUE, 'Ravenclaw', FALSE, FALSE, FALSE, FALSE, TRUE),
  ('Gilderoy Lockhart', 'lockhart_gilderoy.jpg', 54, 'M', TRUE, 'Ravenclaw', FALSE, FALSE, FALSE, FALSE, TRUE),
  ('Alastor Moody', 'moody_alastor.jpg', 68, 'M', FALSE, NULL, FALSE, FALSE, FALSE, FALSE, TRUE),
  ('Kingsley Shacklebolt', 'schacklebolt_kingsley.png', 51, 'M', TRUE, NULL, FALSE, FALSE, FALSE, FALSE, FALSE),
  ('Argus Filch', 'filch_argus.jpg', 72, 'M', TRUE, NULL, FALSE, FALSE, FALSE, FALSE, FALSE),
  ('Vernon Dursley', 'dursley_vernon.jpg', 62, 'M', TRUE, NULL, TRUE, FALSE, FALSE, FALSE, FALSE),
  ('Petunia Dursley', 'dursley_petunia.jpg', 58, 'F', TRUE, NULL, TRUE, FALSE, FALSE, FALSE, FALSE),
  ('Cornelius Fudge', 'fudge_cornelius.jpg', 65, 'M', TRUE, NULL, FALSE, FALSE, FALSE, FALSE, FALSE),
  ('Fenrir Greyback', 'greyback_fenrir.jpg', 53, 'M', TRUE, NULL, FALSE, FALSE, FALSE, TRUE, FALSE),
  ('Victor Krum', 'krum_victor.jpg', 38, 'M', TRUE, NULL, FALSE, FALSE, FALSE, FALSE, FALSE),
  ('Dean Thomas', 'thomas_dean.jpg', 37, 'M', TRUE, 'Gryffindor', FALSE, FALSE, FALSE, FALSE, FALSE)
ON CONFLICT (name) DO NOTHING;

-- 5. Insert character markets (drawn and not drawn)
INSERT INTO harrypotter_markets (market_type, character_id, house, count, category, text_on_screen, point)
SELECT 'character', character_id, NULL::text, 'drawn', name, name || ' Drawn', NULL::integer
FROM harrypotter_trading
UNION ALL
SELECT 'character', character_id, NULL::text, 'not_drawn', name, name || ' Not Drawn', NULL::integer
FROM harrypotter_trading
ON CONFLICT DO NOTHING;

-- 6. Insert house markets
INSERT INTO harrypotter_markets (market_type, character_id, house, count, category, text_on_screen, point) VALUES
  -- Gryffindor Markets
  ('house', NULL, 'Gryffindor', 'drawn', 'gryffindor_drawn', 'Gryffindor Drawn', NULL),
  ('house', NULL, 'Gryffindor', 'not_drawn', 'gryffindor_not_drawn', 'Gryffindor Not Drawn', NULL),
  
  -- Slytherin Markets
  ('house', NULL, 'Slytherin', 'drawn', 'slytherin_drawn', 'Slytherin Drawn', NULL),
  ('house', NULL, 'Slytherin', 'not_drawn', 'slytherin_not_drawn', 'Slytherin Not Drawn', NULL),
  
  -- Hufflepuff Markets
  ('house', NULL, 'Hufflepuff', 'drawn', 'hufflepuff_drawn', 'Hufflepuff Drawn', NULL),
  ('house', NULL, 'Hufflepuff', 'not_drawn', 'hufflepuff_not_drawn', 'Hufflepuff Not Drawn', NULL),
  
  -- Ravenclaw Markets
  ('house', NULL, 'Ravenclaw', 'drawn', 'ravenclaw_drawn', 'Ravenclaw Drawn', NULL),
  ('house', NULL, 'Ravenclaw', 'not_drawn', 'ravenclaw_not_drawn', 'Ravenclaw Not Drawn', NULL)
ON CONFLICT DO NOTHING;

-- 7. Insert special markets
INSERT INTO harrypotter_markets (market_type, character_id, count, category, text_on_screen, point) VALUES
  -- Gender Markets
  ('special', NULL, NULL, 'all_men', 'All Men', NULL),
  ('special', NULL, NULL, 'atleast_one_woman', 'At Least One Woman', NULL),
  ('special', NULL, NULL, 'more_men_than_women', 'More Men Than Women', NULL),
  ('special', NULL, NULL, 'more_women_than_men', 'More Women Than Men', NULL),
  
  -- Teacher Markets
  ('special', NULL, NULL, 'no_teachers', 'No Teachers', NULL),
  ('special', NULL, NULL, 'atleast_one_teacher', 'At Least One Teacher', NULL),
  
  -- Survivor Markets
  ('special', NULL, NULL, 'no_survivors', 'No Survivors', NULL),
  ('special', NULL, NULL, 'atleast_one_survivor', 'At Least One Survivor', NULL),
  
  -- Weasley Markets
  ('special', NULL, NULL, 'atleast_one_weasley', 'At Least One Weasley', NULL),
  
  -- Potter Markets
  ('special', NULL, NULL, 'atleast_one_potter', 'At Least One Potter', NULL)
ON CONFLICT DO NOTHING;
