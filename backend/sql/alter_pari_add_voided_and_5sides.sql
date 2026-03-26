-- ═══════════════════════════════════════════════════════════════════
-- Add 'voided' pool status + support 5 sides
-- Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- 1. Allow 'voided' as a pool status
ALTER TABLE pari_pools DROP CONSTRAINT IF EXISTS pari_pools_status_check;
ALTER TABLE pari_pools ADD CONSTRAINT pari_pools_status_check
  CHECK (status IN ('betting', 'closed', 'settled', 'voided'));

-- 2. Allow up to 5 sides per pool
ALTER TABLE pari_pools DROP CONSTRAINT IF EXISTS pari_pools_num_sides_check;
ALTER TABLE pari_pools ADD CONSTRAINT pari_pools_num_sides_check
  CHECK (num_sides BETWEEN 2 AND 5);

-- 3. Allow side_number up to 5
ALTER TABLE pari_pool_sides DROP CONSTRAINT IF EXISTS pari_pool_sides_side_number_check;
ALTER TABLE pari_pool_sides ADD CONSTRAINT pari_pool_sides_side_number_check
  CHECK (side_number BETWEEN 1 AND 5);
