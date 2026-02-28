-- ═══════════════════════════════════════════════════════════════════
-- DELETE ALL PARIMUTUEL DATA (rows only — tables are preserved)
-- Run in Supabase SQL Editor to wipe all pari data for a fresh start.
-- Order respects foreign key constraints (children first).
-- ═══════════════════════════════════════════════════════════════════

DELETE FROM pari_wagers;
DELETE FROM pari_pool_sides;
DELETE FROM pari_pools;
DELETE FROM pari_participants;
DELETE FROM pari_sessions;
