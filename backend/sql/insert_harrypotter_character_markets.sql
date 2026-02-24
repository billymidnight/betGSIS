-- Insert character markets for Harry Potter (drawn and not drawn)
INSERT INTO harrypotter_markets (market_type, character_id, count, category, text_on_screen, point)
SELECT 'character', character_id, 'drawn', name, name || ' Drawn', NULL
FROM harrypotter_trading
UNION ALL
SELECT 'character', character_id, 'not_drawn', name, name || ' Not Drawn', NULL
FROM harrypotter_trading
ON CONFLICT DO NOTHING;
