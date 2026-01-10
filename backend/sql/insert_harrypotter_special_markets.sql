-- Insert special markets for Harry Potter
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
