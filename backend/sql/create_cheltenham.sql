-- ═══════════════════════════════════════════════════════════════════
-- Cheltenham — pari-mutuel horse racing sessions
-- ═══════════════════════════════════════════════════════════════════
-- Mirrors the pari_* schema (same lobby → join → active flow) but the
-- pool engine is race-driven: each session can host MANY races, each
-- race has its own field of horses + its own auto-generated set of
-- pools (winner / bridesmaid / backer / winner-nationality / optional
-- per-horse time buckets). Settlement is totalisator-style (all
-- losing stakes get redistributed pro-rata to winning-side stakes).

-- 1. Sessions ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cheltenham_sessions (
    session_id          SERIAL PRIMARY KEY,
    name                TEXT NOT NULL,
    host_id             UUID NOT NULL REFERENCES auth.users(id),
    status              TEXT NOT NULL DEFAULT 'lobby'
                          CHECK (status IN ('lobby', 'active', 'concluded')),
    starting_balance    NUMERIC NOT NULL DEFAULT 100,
    min_bet             NUMERIC NOT NULL DEFAULT 3,
    max_bet             NUMERIC NOT NULL DEFAULT 8,
    enable_time_pools   BOOLEAN NOT NULL DEFAULT false,
    default_distance    INTEGER NOT NULL DEFAULT 1500,
    default_dilation    NUMERIC NOT NULL DEFAULT 2.0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    concluded_at        TIMESTAMPTZ
);

-- 2. Participants ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cheltenham_participants (
    id            SERIAL PRIMARY KEY,
    session_id    INTEGER NOT NULL REFERENCES cheltenham_sessions(session_id) ON DELETE CASCADE,
    user_id       UUID NOT NULL REFERENCES auth.users(id),
    balance       NUMERIC NOT NULL DEFAULT 0,
    joined_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (session_id, user_id)
);

-- 3. Races ────────────────────────────────────────────────────────────
-- One session can host many races. Status timeline:
--   drafting  → host has drawn the field, has NOT yet released pools
--   betting   → pools are open, participants can wager
--   closed    → wagering closed, implied odds revealed, host hasn't sent off
--   racing    → trajectory sampled, animation playing
--   settled   → all pools resolved, balances updated
CREATE TABLE IF NOT EXISTS cheltenham_races (
    race_id           SERIAL PRIMARY KEY,
    session_id        INTEGER NOT NULL REFERENCES cheltenham_sessions(session_id) ON DELETE CASCADE,
    race_number       INTEGER NOT NULL,
    status            TEXT NOT NULL DEFAULT 'drafting'
                        CHECK (status IN ('drafting', 'betting', 'closed', 'racing', 'settled')),
    field_size        INTEGER NOT NULL CHECK (field_size IN (3, 5, 7)),
    distance          INTEGER NOT NULL DEFAULT 1500,
    dilation          NUMERIC NOT NULL DEFAULT 2.0,
    -- Snapshot of the horses + post positions for THIS race.
    field_json        JSONB NOT NULL,
    -- Result of run_single_race() once /send-off fires.
    trajectory_json   JSONB,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_off_at       TIMESTAMPTZ,
    settled_at        TIMESTAMPTZ,
    UNIQUE (session_id, race_number)
);

-- 4. Pools ────────────────────────────────────────────────────────────
-- One race can have many pools. `payload_json` carries pool-kind-specific
-- metadata (which horses are options, which countries, which time
-- buckets). `winner_key` is filled at settle time and is matched against
-- each wager's `selection_key` for grading.
CREATE TABLE IF NOT EXISTS cheltenham_pools (
    pool_id        SERIAL PRIMARY KEY,
    race_id        INTEGER NOT NULL REFERENCES cheltenham_races(race_id) ON DELETE CASCADE,
    pool_kind      TEXT NOT NULL
                     CHECK (pool_kind IN (
                       'winner', 'bridesmaid', 'backer',
                       'winner_nationality', 'time_bucket_horse'
                     )),
    status         TEXT NOT NULL DEFAULT 'betting'
                     CHECK (status IN ('betting', 'closed', 'settled')),
    payload_json   JSONB NOT NULL,
    winner_key     TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_at      TIMESTAMPTZ,
    settled_at     TIMESTAMPTZ
);

-- 5. Wagers ───────────────────────────────────────────────────────────
-- One row per (pool, user) — UNIQUE prevents a participant from
-- splitting their stake across multiple sides of the same pool.
CREATE TABLE IF NOT EXISTS cheltenham_wagers (
    wager_id       SERIAL PRIMARY KEY,
    pool_id        INTEGER NOT NULL REFERENCES cheltenham_pools(pool_id) ON DELETE CASCADE,
    user_id        UUID NOT NULL REFERENCES auth.users(id),
    -- horse_id (as text) for winner/bridesmaid/backer/time_bucket;
    -- ISO country code for winner_nationality.
    selection_key  TEXT NOT NULL,
    stake          NUMERIC NOT NULL CHECK (stake > 0),
    implied_odds   NUMERIC,
    payout         NUMERIC,
    pnl            NUMERIC,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (pool_id, user_id)
);

-- Indexes for hot lookups
CREATE INDEX IF NOT EXISTS idx_cheltenham_participants_session ON cheltenham_participants(session_id);
CREATE INDEX IF NOT EXISTS idx_cheltenham_races_session       ON cheltenham_races(session_id);
CREATE INDEX IF NOT EXISTS idx_cheltenham_pools_race          ON cheltenham_pools(race_id);
CREATE INDEX IF NOT EXISTS idx_cheltenham_wagers_pool         ON cheltenham_wagers(pool_id);
CREATE INDEX IF NOT EXISTS idx_cheltenham_wagers_user         ON cheltenham_wagers(user_id);

-- Realtime — same pattern as pari_*
ALTER PUBLICATION supabase_realtime ADD TABLE cheltenham_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE cheltenham_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE cheltenham_races;
ALTER PUBLICATION supabase_realtime ADD TABLE cheltenham_pools;
ALTER PUBLICATION supabase_realtime ADD TABLE cheltenham_wagers;
