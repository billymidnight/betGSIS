-- Horse Racing — third batch of seed horses.
-- Adds two new runners with distinct simulator personalities:
--   Gopal              — slow mean speed, medium volatility, very high alpha (rhythm + plodder)
--   Ian "Check-Raise" Stu — moderate-fast speed, high volatility, low alpha  (firebrand)
--
-- Apply after seed_horses_batch_2.sql.
-- Assumes the `country` column exists (see add_country_to_horses.sql).

INSERT INTO horses
  (full_name, saddle_name, description,
   mean_speed, speed_volatility, pace_stickiness, early_pace, late_kick,
   silks_color, country)
VALUES
  (
    'Gopal',
    'Gopal',
    'A deliberate Marwari gelding out of a Pune sport-horse barn. Slow off the bridle, but his cadence almost never wavers — handlers say he treats every furlong the same. Quietly fancied for the long, even-paced trips.',
    1.3400, 0.2500, 0.9750, 0.0000, 0.0000,
    '#d97706', 'IN'
  ),
  (
    'Ian "Check-Raise" Stu',
    'Stu',
    'A fiery bay colt out of a Cluj-Napoca yard with a long-running rivalry against the neighbouring Chisinau circuit. Quick out of the gate but spectacularly inconsistent — the only horse on the card with a pace chart that looks like a poker bluff. Fast, mood swings galore, no rhythm.',
    1.5500, 0.3300, 0.8400, 0.0000, 0.0000,
    '#1f3a8a', 'RO'
  );
