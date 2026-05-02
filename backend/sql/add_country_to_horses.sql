-- Adds a nullable `country` column to the `horses` table.
-- Convention: store the ISO 3166-1 alpha-2 country code (e.g. 'US', 'GB',
-- 'IS', 'JP'). The frontend renders the flag emoji directly from the code.
-- Use NULL for "country unknown / unassigned".

ALTER TABLE horses
  ADD COLUMN IF NOT EXISTS country TEXT;
