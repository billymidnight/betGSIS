-- Insert special markets for Breaking Bad
-- These markets are for gender, lawyers, and Emmy winners

INSERT INTO breakingbad_markets (market_type, character_id, count, category, text_on_screen, point) VALUES
  -- Gender Markets
  ('special', NULL, NULL, 'all_men', 'All Men', NULL),
  ('special', NULL, NULL, 'atleast_one_woman', 'At Least One Woman', NULL),
  
  -- Lawyer Markets
  ('special', NULL, NULL, 'no_lawyers', 'No Lawyers', NULL),
  ('special', NULL, NULL, 'atleast_one_lawyer', 'At Least One Lawyer', NULL),
  
  -- Emmy Winner Markets
  ('special', NULL, NULL, 'no_emmy_winners', 'No Emmy Winners', NULL),
  ('special', NULL, NULL, 'atleast_one_emmy_winner', 'At Least One Emmy Winner', NULL),
  
  -- Dead/Survived Markets
  ('special', NULL, 'atleast_2', 'over_1_5_dead', 'Over 1.5 Dead', NULL),
  ('special', NULL, 'atleast_2', 'under_1_5_dead', 'Under 1.5 Dead', NULL),
  
  -- Combined Age Markets
  ('special', NULL, '121.5', 'over_121_5_age', 'Over 121.5 Combined Age', NULL),
  ('special', NULL, '121.5', 'under_121_5_age', 'Under 121.5 Combined Age', NULL),
  ('special', NULL, '140.5', 'over_140_5_age', 'Over 140.5 Combined Age', NULL),
  ('special', NULL, '140.5', 'under_140_5_age', 'Under 140.5 Combined Age', NULL)
ON CONFLICT DO NOTHING;
