-- Insert special markets into sopranos_markets table

-- Gender Markets
INSERT INTO sopranos_markets (market_type, character_id, count, category, text_on_screen)
VALUES ('gender', NULL, 'all', 'men', 'All Men');

INSERT INTO sopranos_markets (market_type, character_id, count, category, text_on_screen)
VALUES ('gender', NULL, 'all', 'women', 'All Women');

INSERT INTO sopranos_markets (market_type, character_id, count, category, text_on_screen)
VALUES ('gender', NULL, 'atleast_1', 'men', 'At least 1 Man');

INSERT INTO sopranos_markets (market_type, character_id, count, category, text_on_screen)
VALUES ('gender', NULL, 'atleast_1', 'women', 'At least 1 Woman');

-- Captain Markets
INSERT INTO sopranos_markets (market_type, character_id, count, category, text_on_screen)
VALUES ('captain', NULL, 'all', 'captain', 'All Captains');

INSERT INTO sopranos_markets (market_type, character_id, count, category, text_on_screen)
VALUES ('captain', NULL, 'none', 'captain', 'No Captains');

INSERT INTO sopranos_markets (market_type, character_id, count, category, text_on_screen)
VALUES ('captain', NULL, 'atleast_1', 'captain', 'At Least One Captain');
