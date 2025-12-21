-- SQL Script 1: Sum all freq values for specified countries
-- geo_countries table schema: id, country, freq, continent

-- Sum the freq column for all specified countries
SELECT 
    SUM(freq) AS total_freq,
    COUNT(*) AS countries_found
FROM geo_countries
WHERE country IN (
    'France',
    'Switzerland',
    'UK',
    'Ireland',
    'Turkey',
    'UAE',
    'New Zealand',
    'Austria',
    'Germany',
    'Hungary',
    'USA',
    'Canada',
    'South Korea',
    'Singapore',
    'Malaysia',
    'Pindia',
    'Indonesia',
    'Japan',
    'Czechia',
    'Norway',
    'Spain',
    'Denmark',
    'Belgium',
    'Thailand',
    'Srilanka',
    'Qatar',
    'Greece'
);

-- Optional: See individual country frequencies
-- Uncomment the query below to see breakdown by country
/*
SELECT 
    country,
    freq,
    continent
FROM geo_countries
WHERE country IN (
    'France',
    'Switzerland',
    'UK',
    'Ireland',
    'Turkey',
    'UAE',
    'New Zealand',
    'Austria',
    'Germany',
    'Hungary',
    'USA',
    'Canada',
    'South Korea',
    'Singapore',
    'Malaysia',
    'Pindia',
    'Indonesia',
    'Japan',
    'Czechia',
    'Norway',
    'Spain',
    'Denmark',
    'Belgium',
    'Thailand',
    'Srilanka',
    'Qatar',
    'Greece'
)
ORDER BY freq DESC;
*/
