-- Complete Game of Thrones Trading Setup — run in Supabase SQL Editor.
-- Mirror of setup_harrypotter_all.sql, themed for GoT.

-- 1. Create gameofthrones_trading table
CREATE TABLE IF NOT EXISTS gameofthrones_trading (
  character_id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  img_filename TEXT NOT NULL,
  age INTEGER NOT NULL,                    -- as of S8 if alive, else age at death
  gender CHAR(1) NOT NULL CHECK (gender IN ('M', 'F')),
  survivor BOOLEAN NOT NULL DEFAULT FALSE, -- alive at end of S8
  house TEXT,                              -- 'Stark', 'Lannister', etc. or NULL when no proper house
  king BOOLEAN NOT NULL DEFAULT FALSE,     -- ever ruled (incl. rebellious kings like Robb, King in the North, etc.)
  bastard BOOLEAN NOT NULL DEFAULT FALSE   -- bastard / illegitimate (operator updates to TRUE for whoever qualifies)
);

CREATE INDEX IF NOT EXISTS idx_gameofthrones_house     ON gameofthrones_trading(house);
CREATE INDEX IF NOT EXISTS idx_gameofthrones_survivor  ON gameofthrones_trading(survivor);
CREATE INDEX IF NOT EXISTS idx_gameofthrones_king      ON gameofthrones_trading(king);
CREATE INDEX IF NOT EXISTS idx_gameofthrones_gender    ON gameofthrones_trading(gender);
CREATE INDEX IF NOT EXISTS idx_gameofthrones_bastard   ON gameofthrones_trading(bastard);

-- 2. Create gameofthrones_settings table
CREATE TABLE IF NOT EXISTS gameofthrones_settings (
  settingid SERIAL PRIMARY KEY,
  setting TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL,
  CHECK (
    (setting != 'card_nature' OR value IN ('static', 'random'))
  )
);

INSERT INTO gameofthrones_settings (setting, value) VALUES
  ('card_nature', 'static'),
  ('card_count', '3')
ON CONFLICT (setting) DO NOTHING;

-- 3. Create gameofthrones_markets table
CREATE TABLE IF NOT EXISTS gameofthrones_markets (
  market_id SERIAL PRIMARY KEY,
  market_type TEXT NOT NULL CHECK (market_type IN ('character', 'house', 'special')),
  character_id INTEGER REFERENCES gameofthrones_trading(character_id) ON DELETE CASCADE,
  house TEXT,
  count TEXT,
  category TEXT,
  text_on_screen TEXT NOT NULL,
  point INTEGER
);

CREATE INDEX IF NOT EXISTS idx_gameofthrones_markets_type      ON gameofthrones_markets(market_type);
CREATE INDEX IF NOT EXISTS idx_gameofthrones_markets_character ON gameofthrones_markets(character_id);
CREATE INDEX IF NOT EXISTS idx_gameofthrones_markets_house     ON gameofthrones_markets(house);
CREATE INDEX IF NOT EXISTS idx_gameofthrones_markets_category  ON gameofthrones_markets(category);

-- 4. Insert characters
-- img_filename placeholders follow the HP convention (last_first.png) —
-- the operator (you) will replace them via UPDATE statements once the
-- real artwork lands in backend/gameofthrones/.
INSERT INTO gameofthrones_trading (name, img_filename, age, gender, survivor, house, king) VALUES
  ('Ned Stark',            'stark_ned.png',           41, 'M', FALSE, 'Stark',      FALSE),
  ('Catelyn Stark',        'stark_catelyn.png',       40, 'F', FALSE, 'Stark',      FALSE),
  ('Arya Stark',           'stark_arya.png',          18, 'F', TRUE,  'Stark',      FALSE),
  ('Sansa Stark',          'stark_sansa.png',         21, 'F', TRUE,  'Stark',      TRUE),   -- Queen in the North
  ('Robb Stark',           'stark_robb.png',          19, 'M', FALSE, 'Stark',      TRUE),   -- King in the North
  ('Jon Snow',             'snow_jon.png',            25, 'M', TRUE,  'Stark',      TRUE),   -- briefly King in the North
  ('Olenna Tyrell',        'tyrell_olenna.png',       75, 'F', FALSE, 'Tyrell',     FALSE),
  ('Margaery Tyrell',      'tyrell_margaery.png',     22, 'F', FALSE, 'Tyrell',     FALSE),  -- queen consort, not a ruling monarch
  ('Tywin Lannister',      'lannister_tywin.png',     67, 'M', FALSE, 'Lannister',  FALSE),
  ('Jaime Lannister',      'lannister_jaime.png',     41, 'M', FALSE, 'Lannister',  FALSE),
  ('Cersei Lannister',     'lannister_cersei.png',    41, 'F', FALSE, 'Lannister',  TRUE),   -- Queen of the Andals
  ('Tyrion Lannister',     'lannister_tyrion.png',    39, 'M', TRUE,  'Lannister',  FALSE),
  ('Daenerys Targaryen',   'targaryen_daenerys.png',  23, 'F', FALSE, 'Targaryen',  TRUE),   -- briefly took the Iron Throne
  ('Varys',                'varys.png',               65, 'M', FALSE, NULL,         FALSE),
  ('Petyr Baelish',        'baelish_petyr.png',       42, 'M', FALSE, 'Baelish',    FALSE),
  ('Robert Baratheon',     'baratheon_robert.png',    41, 'M', FALSE, 'Baratheon',  TRUE),   -- King of the Seven Kingdoms
  ('Lysa Arryn',           'arryn_lysa.png',          38, 'F', FALSE, 'Arryn',      FALSE),
  ('Walder Frey',          'frey_walder.png',         92, 'M', FALSE, 'Frey',       FALSE),
  ('Roose Bolton',         'bolton_roose.png',        50, 'M', FALSE, 'Bolton',     FALSE),
  ('Ramsay Bolton',        'bolton_ramsay.png',       24, 'M', FALSE, 'Bolton',     FALSE),
  ('Ygritte',              'ygritte.png',             22, 'F', FALSE, NULL,         FALSE),  -- Free Folk
  ('Tyene Sand',           'sand_tyene.png',          21, 'F', FALSE, 'Martell',    FALSE),
  ('Ellaria Sand',         'sand_ellaria.png',        40, 'F', FALSE, 'Martell',    FALSE),
  ('Lady Melisandre',      'melisandre.png',         400, 'F', FALSE, NULL,         FALSE),  -- centuries old (Red Priestess)
  ('Grey Worm',            'grey_worm.png',           25, 'M', TRUE,  NULL,         FALSE),  -- Unsullied
  ('Missandei',            'missandei.png',           24, 'F', FALSE, NULL,         FALSE),
  ('Oberyn Martell',       'martell_oberyn.png',      42, 'M', FALSE, 'Martell',    FALSE),
  ('Hodor',                'hodor.png',               47, 'M', FALSE, NULL,         FALSE)
ON CONFLICT (name) DO NOTHING;

-- 5. Character markets (drawn / not drawn — one of each per character)
INSERT INTO gameofthrones_markets (market_type, character_id, house, count, category, text_on_screen, point)
SELECT 'character', character_id, NULL::text, 'drawn',     name, name || ' Drawn',     NULL::integer
FROM gameofthrones_trading
UNION ALL
SELECT 'character', character_id, NULL::text, 'not_drawn', name, name || ' Not Drawn', NULL::integer
FROM gameofthrones_trading
ON CONFLICT DO NOTHING;

-- 6. House markets — Westeros' great houses + Baelish (a "house of one")
INSERT INTO gameofthrones_markets (market_type, character_id, house, count, category, text_on_screen, point) VALUES
  ('house', NULL, 'Stark',     'drawn',     'stark_drawn',         'Stark Drawn',         NULL),
  ('house', NULL, 'Stark',     'not_drawn', 'stark_not_drawn',     'Stark Not Drawn',     NULL),

  ('house', NULL, 'Lannister', 'drawn',     'lannister_drawn',     'Lannister Drawn',     NULL),
  ('house', NULL, 'Lannister', 'not_drawn', 'lannister_not_drawn', 'Lannister Not Drawn', NULL),

  ('house', NULL, 'Targaryen', 'drawn',     'targaryen_drawn',     'Targaryen Drawn',     NULL),
  ('house', NULL, 'Targaryen', 'not_drawn', 'targaryen_not_drawn', 'Targaryen Not Drawn', NULL),

  ('house', NULL, 'Baratheon', 'drawn',     'baratheon_drawn',     'Baratheon Drawn',     NULL),
  ('house', NULL, 'Baratheon', 'not_drawn', 'baratheon_not_drawn', 'Baratheon Not Drawn', NULL),

  ('house', NULL, 'Tyrell',    'drawn',     'tyrell_drawn',        'Tyrell Drawn',        NULL),
  ('house', NULL, 'Tyrell',    'not_drawn', 'tyrell_not_drawn',    'Tyrell Not Drawn',    NULL),

  ('house', NULL, 'Martell',   'drawn',     'martell_drawn',       'Martell Drawn',       NULL),
  ('house', NULL, 'Martell',   'not_drawn', 'martell_not_drawn',   'Martell Not Drawn',   NULL),

  ('house', NULL, 'Bolton',    'drawn',     'bolton_drawn',        'Bolton Drawn',        NULL),
  ('house', NULL, 'Bolton',    'not_drawn', 'bolton_not_drawn',    'Bolton Not Drawn',    NULL),

  ('house', NULL, 'Frey',      'drawn',     'frey_drawn',          'Frey Drawn',          NULL),
  ('house', NULL, 'Frey',      'not_drawn', 'frey_not_drawn',      'Frey Not Drawn',      NULL),

  ('house', NULL, 'Arryn',     'drawn',     'arryn_drawn',         'Arryn Drawn',         NULL),
  ('house', NULL, 'Arryn',     'not_drawn', 'arryn_not_drawn',     'Arryn Not Drawn',     NULL),

  ('house', NULL, 'Baelish',   'drawn',     'baelish_drawn',       'Baelish Drawn',       NULL),
  ('house', NULL, 'Baelish',   'not_drawn', 'baelish_not_drawn',   'Baelish Not Drawn',   NULL),

  ('house', NULL, 'Greyjoy',   'drawn',     'greyjoy_drawn',       'Greyjoy Drawn',       NULL),
  ('house', NULL, 'Greyjoy',   'not_drawn', 'greyjoy_not_drawn',   'Greyjoy Not Drawn',   NULL)
ON CONFLICT DO NOTHING;

-- 7. Special markets — final 10 the operator chose
INSERT INTO gameofthrones_markets (market_type, character_id, count, category, text_on_screen, point) VALUES
  -- Gender
  ('special', NULL, NULL, 'more_men_than_women',    'More Men Than Women',      NULL),
  ('special', NULL, NULL, 'more_women_than_men',    'More Women Than Men',      NULL),
  ('special', NULL, NULL, 'over_1_5_men',           'Over 1.5 Men',             NULL),
  ('special', NULL, NULL, 'over_1_5_women',         'Over 1.5 Women',           NULL),
  ('special', NULL, NULL, 'all_men',                'All Men',                  NULL),
  ('special', NULL, NULL, 'all_women',              'All Women',                NULL),

  -- Kings (anyone who ever ruled, incl. rebellious kings/queens)
  ('special', NULL, NULL, 'no_kings',               'No Kings',                 NULL),
  ('special', NULL, NULL, 'atleast_one_king',       'At Least One King',        NULL),

  -- Bastards (uses the new `bastard` boolean column)
  ('special', NULL, NULL, 'no_bastards',            'No Bastards',              NULL),
  ('special', NULL, NULL, 'atleast_one_bastard',    'At Least One Bastard',     NULL)
ON CONFLICT DO NOTHING;
