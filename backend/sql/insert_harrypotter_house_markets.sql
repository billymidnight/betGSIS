-- Insert house markets for Harry Potter
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
