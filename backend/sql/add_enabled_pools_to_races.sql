-- Migration: cheltenham_races.enabled_pools
-- Optional list of default-pool kinds the host enabled when drafting THIS
-- race. NULL = legacy/default (all four). release-pools honors this column
-- when building the per-pool rows so the host can drop e.g. winner-nationality
-- for a single-country field, or run a one-pool "winner only" race.
ALTER TABLE cheltenham_races
  ADD COLUMN IF NOT EXISTS enabled_pools TEXT[];
