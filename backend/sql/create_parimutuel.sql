-- ═══════════════════════════════════════════════════════════════════
-- Parimutuel System — 5 tables, fully independent
-- ═══════════════════════════════════════════════════════════════════

-- 1. Sessions
CREATE TABLE IF NOT EXISTS pari_sessions (
    session_id   SERIAL PRIMARY KEY,
    name         TEXT NOT NULL,
    host_id      UUID NOT NULL REFERENCES auth.users(id),
    status       TEXT NOT NULL DEFAULT 'lobby'
                   CHECK (status IN ('lobby', 'active', 'concluded')),
    starting_balance NUMERIC NOT NULL DEFAULT 100,
    min_bet      NUMERIC NOT NULL DEFAULT 1,
    max_bet      NUMERIC NOT NULL DEFAULT 50,
    mode         TEXT NOT NULL DEFAULT 'vibe'
                   CHECK (mode IN ('vibe', 'preset')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    concluded_at TIMESTAMPTZ
);

-- 2. Participants
CREATE TABLE IF NOT EXISTS pari_participants (
    id           SERIAL PRIMARY KEY,
    session_id   INT NOT NULL REFERENCES pari_sessions(session_id) ON DELETE CASCADE,
    user_id      UUID NOT NULL REFERENCES auth.users(id),
    balance      NUMERIC NOT NULL DEFAULT 0,
    joined_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (session_id, user_id)
);

-- 3. Pools (rounds within a session)
CREATE TABLE IF NOT EXISTS pari_pools (
    pool_id      SERIAL PRIMARY KEY,
    session_id   INT NOT NULL REFERENCES pari_sessions(session_id) ON DELETE CASCADE,
    pool_number  INT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'betting'
                   CHECK (status IN ('betting', 'closed', 'settled')),
    num_sides    INT NOT NULL DEFAULT 2 CHECK (num_sides BETWEEN 2 AND 4),
    winner_side  INT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_at    TIMESTAMPTZ,
    settled_at   TIMESTAMPTZ
);

-- 4. Pool Sides (color/label per side)
CREATE TABLE IF NOT EXISTS pari_pool_sides (
    id           SERIAL PRIMARY KEY,
    pool_id      INT NOT NULL REFERENCES pari_pools(pool_id) ON DELETE CASCADE,
    side_number  INT NOT NULL CHECK (side_number BETWEEN 1 AND 4),
    color        TEXT NOT NULL,
    label        TEXT DEFAULT '',
    UNIQUE (pool_id, side_number)
);

-- 5. Wagers
CREATE TABLE IF NOT EXISTS pari_wagers (
    wager_id     SERIAL PRIMARY KEY,
    pool_id      INT NOT NULL REFERENCES pari_pools(pool_id) ON DELETE CASCADE,
    user_id      UUID NOT NULL REFERENCES auth.users(id),
    side_number  INT NOT NULL,
    stake        NUMERIC NOT NULL CHECK (stake > 0),
    implied_odds NUMERIC,
    payout       NUMERIC,
    pnl          NUMERIC,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (pool_id, user_id)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_pari_participants_session ON pari_participants(session_id);
CREATE INDEX IF NOT EXISTS idx_pari_pools_session ON pari_pools(session_id);
CREATE INDEX IF NOT EXISTS idx_pari_wagers_pool ON pari_wagers(pool_id);
CREATE INDEX IF NOT EXISTS idx_pari_wagers_user ON pari_wagers(user_id);

-- Enable Supabase Realtime on these tables (run in Supabase SQL editor)
ALTER PUBLICATION supabase_realtime ADD TABLE pari_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE pari_pools;
ALTER PUBLICATION supabase_realtime ADD TABLE pari_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE pari_wagers;
