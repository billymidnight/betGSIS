-- SQL Script 2: Find countries from the list that are NOT in geo_countries table
-- This helps identify missing countries or spelling mismatches

-- Create a temporary table with the desired country list
WITH desired_countries AS (
    SELECT 'France' AS country_name
    UNION ALL SELECT 'Switzerland'
    UNION ALL SELECT 'UK'
    UNION ALL SELECT 'Ireland'
    UNION ALL SELECT 'Turkey'
    UNION ALL SELECT 'UAE'
    UNION ALL SELECT 'New Zealand'
    UNION ALL SELECT 'Austria'
    UNION ALL SELECT 'Germany'
    UNION ALL SELECT 'Hungary'
    UNION ALL SELECT 'USA'
    UNION ALL SELECT 'Canada'
    UNION ALL SELECT 'South Korea'
    UNION ALL SELECT 'Singapore'
    UNION ALL SELECT 'Malaysia'
    UNION ALL SELECT 'Pindia'
    UNION ALL SELECT 'Indonesia'
    UNION ALL SELECT 'Japan'
    UNION ALL SELECT 'Czechia'
    UNION ALL SELECT 'Norway'
    UNION ALL SELECT 'Spain'
    UNION ALL SELECT 'Denmark'
    UNION ALL SELECT 'Belgium'
    UNION ALL SELECT 'Thailand'
    UNION ALL SELECT 'Srilanka'
    UNION ALL SELECT 'Qatar'
    UNION ALL SELECT 'Greece'
)
-- Find countries in the desired list that are NOT in geo_countries table
SELECT 
    dc.country_name AS missing_country
FROM desired_countries dc
LEFT JOIN geo_countries gc ON dc.country_name = gc.country
WHERE gc.country IS NULL
ORDER BY dc.country_name;

-- Alternative: Case-insensitive search (in case of capitalization differences)
-- Uncomment if you want to check for case-insensitive matches
/*
WITH desired_countries AS (
    SELECT 'France' AS country_name
    UNION ALL SELECT 'Switzerland'
    UNION ALL SELECT 'UK'
    UNION ALL SELECT 'Ireland'
    UNION ALL SELECT 'Turkey'
    UNION ALL SELECT 'UAE'
    UNION ALL SELECT 'New Zealand'
    UNION ALL SELECT 'Austria'
    UNION ALL SELECT 'Germany'
    UNION ALL SELECT 'Hungary'
    UNION ALL SELECT 'USA'
    UNION ALL SELECT 'Canada'
    UNION ALL SELECT 'South Korea'
    UNION ALL SELECT 'Singapore'
    UNION ALL SELECT 'Malaysia'
    UNION ALL SELECT 'Pindia'
    UNION ALL SELECT 'Indonesia'
    UNION ALL SELECT 'Japan'
    UNION ALL SELECT 'Czechia'
    UNION ALL SELECT 'Norway'
    UNION ALL SELECT 'Spain'
    UNION ALL SELECT 'Denmark'
    UNION ALL SELECT 'Belgium'
    UNION ALL SELECT 'Thailand'
    UNION ALL SELECT 'Srilanka'
    UNION ALL SELECT 'Qatar'
    UNION ALL SELECT 'Greece'
)
SELECT 
    dc.country_name AS missing_country,
    'Not found (case-insensitive)' AS status
FROM desired_countries dc
LEFT JOIN geo_countries gc ON LOWER(dc.country_name) = LOWER(gc.country)
WHERE gc.country IS NULL
ORDER BY dc.country_name;
*/

-- Optional: Find similar country names in the table (for typo detection)
-- Uncomment to see countries in geo_countries that might match your list
/*
SELECT DISTINCT country
FROM geo_countries
WHERE 
    country ILIKE '%france%' OR
    country ILIKE '%switz%' OR
    country ILIKE '%kingdom%' OR
    country ILIKE '%ireland%' OR
    country ILIKE '%turk%' OR
    country ILIKE '%emirates%' OR
    country ILIKE '%zealand%' OR
    country ILIKE '%austria%' OR
    country ILIKE '%german%' OR
    country ILIKE '%hungar%' OR
    country ILIKE '%united states%' OR
    country ILIKE '%america%' OR
    country ILIKE '%canada%' OR
    country ILIKE '%korea%' OR
    country ILIKE '%singapore%' OR
    country ILIKE '%malaysia%' OR
    country ILIKE '%india%' OR
    country ILIKE '%indonesia%' OR
    country ILIKE '%japan%' OR
    country ILIKE '%czech%' OR
    country ILIKE '%norway%' OR
    country ILIKE '%spain%' OR
    country ILIKE '%denmark%' OR
    country ILIKE '%belgium%' OR
    country ILIKE '%thailand%' OR
    country ILIKE '%lanka%' OR
    country ILIKE '%qatar%' OR
    country ILIKE '%greece%'
ORDER BY country;
*/
