-- Boss Markets (similar to captain markets)
INSERT INTO sopranos_markets (market_type, character_id, count, category, text_on_screen, point)
VALUES
('boss', NULL, 'none', NULL, 'No Bosses', NULL),
('boss', NULL, 'atleast_1', NULL, 'At Least 1 Boss', NULL);

-- Additional Combined Age Markets
INSERT INTO sopranos_markets (market_type, character_id, count, category, text_on_screen, point)
VALUES
('combined_age', NULL, 'over', NULL, 'Combined Age Over 125.5', 125.5),
('combined_age', NULL, 'under', NULL, 'Combined Age Under 125.5', 125.5),
('combined_age', NULL, 'over', NULL, 'Combined Age Over 155.5', 155.5),
('combined_age', NULL, 'under', NULL, 'Combined Age Under 155.5', 155.5);
