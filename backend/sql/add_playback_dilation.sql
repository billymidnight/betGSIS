-- Horse Racing — playback_dilation setting.
--
-- Decouples wall-clock playback from simulation-tick count so we can keep the
-- 1500-length pricing calibration (closer field, more upsets) while still
-- giving the race a 20-second visual length.
--
-- How it works:
--   • The simulator runs in TICK SPACE — variance, alpha, sigma, all
--     probabilities live there. Number of ticks per race depends only on
--     race_distance and per-horse μ.
--   • playback_dilation multiplies MS_PER_TICK (the conversion factor from
--     tick → ms) for every TIME-FLAVOURED output: sample_times_ms,
--     finish_ms, prop_thresholds in seconds, etc.
--   • Probabilities are byte-identical at any dilation. Only the displayed
--     wall-clock and seconds-labels move together.
--
-- Defaults:
--   distance        = 1500   → tighter pricing (less variance averaging)
--   dilation        = 2.0    → 20-second visual race
--   → sim runs ~1000 ticks; each tick rendered as 20ms instead of 10ms.

INSERT INTO horse_settings (setting_key, setting_value, description)
VALUES (
  'playback_dilation',
  2.0,
  'Wall-clock per simulation tick, as a multiplier of the base 10ms. dilation=1.0 → standard ~10s race for distance 1500; dilation=2.0 → ~20s race. Probabilities are unaffected by this setting; only the displayed times scale. Use it to lengthen the perceived race without retuning horse parameters.'
)
ON CONFLICT (setting_key) DO NOTHING;
