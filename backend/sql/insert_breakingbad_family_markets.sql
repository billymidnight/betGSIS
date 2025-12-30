-- Insert family drawn/not drawn markets for Breaking Bad
-- Families: White, Schrader, Salamanca

INSERT INTO breakingbad_markets (market_type, character_id, count, category, text_on_screen, point) VALUES
  -- Family Drawn Markets
  ('family', NULL, 'drawn', 'White', 'White Family - Drawn', NULL),
  ('family', NULL, 'drawn', 'Schrader', 'Schrader Family - Drawn', NULL),
  ('family', NULL, 'drawn', 'Salamanca', 'Salamanca Family - Drawn', NULL),
  
  -- Family Not Drawn Markets
  ('family', NULL, 'not_drawn', 'White', 'White Family - Not Drawn', NULL),
  ('family', NULL, 'not_drawn', 'Schrader', 'Schrader Family - Not Drawn', NULL),
  ('family', NULL, 'not_drawn', 'Salamanca', 'Salamanca Family - Not Drawn', NULL)
ON CONFLICT DO NOTHING;
