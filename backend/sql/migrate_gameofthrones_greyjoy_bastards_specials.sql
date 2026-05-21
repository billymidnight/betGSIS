-- Migration: GoT trading game — add House Greyjoy, add bastard column,
-- swap the special markets list to the final 10 the operator wants.
-- Safe to re-run.

-- ────────────────────────────────────────────────────────────────────
-- 1. NEW COLUMN: bastard (defaults FALSE — update each bastard manually)
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE gameofthrones_trading
  ADD COLUMN IF NOT EXISTS bastard BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_gameofthrones_bastard
  ON gameofthrones_trading(bastard);

-- Example UPDATE for the operator (commented out — flip the ones you
-- actually want):
--   UPDATE gameofthrones_trading SET bastard = TRUE
--   WHERE name IN ('Jon Snow', 'Tyene Sand', 'Ellaria Sand', 'Ramsay Bolton');


-- ────────────────────────────────────────────────────────────────────
-- 2. HOUSE GREYJOY MARKETS — register Drawn / Not Drawn
-- ────────────────────────────────────────────────────────────────────
INSERT INTO gameofthrones_markets (market_type, character_id, house, count, category, text_on_screen, point) VALUES
  ('house', NULL, 'Greyjoy', 'drawn',     'greyjoy_drawn',     'Greyjoy Drawn',     NULL),
  ('house', NULL, 'Greyjoy', 'not_drawn', 'greyjoy_not_drawn', 'Greyjoy Not Drawn', NULL)
ON CONFLICT DO NOTHING;


-- ────────────────────────────────────────────────────────────────────
-- 3. SPECIAL MARKETS — drop the old set, install the final 10
-- ────────────────────────────────────────────────────────────────────
-- Drop the ones the operator no longer wants. Safe even on a fresh
-- DB where these rows don't exist (DELETE is a no-op).
DELETE FROM gameofthrones_markets
WHERE market_type = 'special'
  AND category IN (
    'atleast_one_woman',
    'no_survivors',
    'atleast_one_survivor',
    'atleast_one_stark',
    'atleast_one_lannister',
    'atleast_one_targaryen',
    'atleast_one_houseless'
  );

-- Install the new 10. ON CONFLICT can't help us here (no unique key on
-- category) so guard each insert with a NOT EXISTS to make this re-runnable.
INSERT INTO gameofthrones_markets (market_type, character_id, count, category, text_on_screen, point)
SELECT 'special', NULL, NULL, v.category, v.text_on_screen, NULL
FROM (VALUES
  -- Gender
  ('more_men_than_women', 'More Men Than Women'),
  ('more_women_than_men', 'More Women Than Men'),
  ('over_1_5_men',        'Over 1.5 Men'),
  ('over_1_5_women',      'Over 1.5 Women'),
  ('all_men',             'All Men'),
  ('all_women',           'All Women'),
  -- Kings (king column)
  ('no_kings',            'No Kings'),
  ('atleast_one_king',    'At Least One King'),
  -- Bastards (new bastard column)
  ('no_bastards',         'No Bastards'),
  ('atleast_one_bastard', 'At Least One Bastard')
) AS v(category, text_on_screen)
WHERE NOT EXISTS (
  SELECT 1 FROM gameofthrones_markets m
  WHERE m.market_type = 'special' AND m.category = v.category
);
