-- Horse Racing — `horses` table
--
-- Each horse is parameterised for the AR(1)-on-velocity simulator with optional
-- front-runner / closer overlays. The race tick loop is roughly:
--
--     v[t+1] = α · v[t] + (1 − α) · μ
--              + ε_t                                  (ε_t ~ Normal(0, σ²))
--              + E · exp(−t / τ_early)                 (early-pace bonus, decays)
--              + L · (t / T_total)²                    (late-kick bonus, grows)
--
--     x[t+1] = x[t] + v[t+1] · Δt
--
-- See backend/services/race_sim.py (TBD) for the canonical implementation.

CREATE TABLE IF NOT EXISTS horses (
    horse_id      SERIAL PRIMARY KEY,
    full_name     TEXT NOT NULL,
    saddle_name   TEXT NOT NULL,                              -- short label shown on saddle / leaderboard
    description   TEXT,                                        -- pedigree, lore, trivia

    -- ───── Simulator knobs ─────
    mean_speed       NUMERIC(8,4) NOT NULL                     -- μ: long-run target speed (units / tick)
                     CHECK (mean_speed > 0),
    speed_volatility NUMERIC(8,4) NOT NULL                     -- σ: per-tick shock magnitude
                     CHECK (speed_volatility >= 0),
    pace_stickiness  NUMERIC(6,4) NOT NULL                     -- α: AR(1) coefficient ∈ [0, 1)
                     CHECK (pace_stickiness >= 0 AND pace_stickiness < 1),
    early_pace       NUMERIC(6,4) NOT NULL DEFAULT 0,          -- E: front-runner bonus magnitude (≥ 0)
    late_kick        NUMERIC(6,4) NOT NULL DEFAULT 0,          -- L: closer's bonus magnitude    (≥ 0)

    -- ───── Display ─────
    silks_color      TEXT NOT NULL DEFAULT '#888',             -- hex colour for the saddle / silks in UI

    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ───── Seed: two vanilla horses ─────
-- Similar mean speed, materially different volatility, no front-runner / closer styling.
-- Good baseline for sanity-checking the simulator's variance feels right.

INSERT INTO horses
  (full_name, saddle_name, description,
   mean_speed, speed_volatility, pace_stickiness, early_pace, late_kick,
   silks_color)
VALUES
  (
    'Vanilla Sergeant',
    'V. Sgt',
    'A bay gelding by Steady Hand (USA) out of Plain Saturday, foaled in 2018 at Belmont Stables in Lexington, Kentucky. Bred for the Mid-Atlantic claiming circuit, the Sergeant is renowned among handicappers for an unflappable temperament and metronomic, machine-like fractions. In 17 career starts on synthetic and dirt, he has never finished worse than fourth, including back-to-back wins in the Allowance Optional Claiming at Aqueduct (2022, 2023). Trainer Liam O''Donovan describes him as "the horse you set your watch by".',
    1.5000, 0.2000, 0.9200, 0.0000, 0.0000,
    '#c9b88c'
  ),
  (
    'Sand Bullet',
    'Bullet',
    'A chestnut colt by Quicksilver Gambit (USA) out of Dune Witch (IRE), bred at Bridlespur Farm in Ocala, Florida and currently campaigning out of trainer Carlos Romero''s barn at Saratoga. Earned his name for explosive turn-of-foot on a fast track at Belmont, though the colt is known to be moody at the gate. Closed from five lengths back in deep stretch to take the 2023 Riva Ridge Stakes (G3) at Belmont Park. Pedigree experts have noted a strong A.P. Indy line two generations back through his damsire, Tapit''s Heir.',
    1.5200, 0.3000, 0.8800, 0.0000, 0.0000,
    '#a25b3a'
  );
