-- Horse Racing — fourth batch of seed horses (13 runners).
--
-- Notes:
--   • Several entries use NEGATIVE values for early_pace / late_kick. The
--     simulator math handles these correctly out of the box:
--       early_bonus[t] = E * exp(-t / EARLY_TAU)     (E < 0  ⇒  slow start)
--       late_bonus[t]  = L * (t / N_TICKS) ** 2      (L < 0  ⇒  fades late)
--     Used here to encode "starts slow" (Romanian Pocketer) and
--     "explodes out, fades late" (La Cigarette).
--   • country is the ISO 3166-1 alpha-2 code; the racebook resolves the
--     flag emoji from this code (no joins needed).
--   • silks_color hand-picked across the wheel for max visual separation
--     against the eight horses already in the catalogue.
--
-- Apply after seed_horses_batch_3.sql.

INSERT INTO horses
  (full_name, saddle_name, description,
   mean_speed, speed_volatility, pace_stickiness, early_pace, late_kick,
   silks_color, country)
VALUES

  -- ─── 1. Pie-O-My ── fast starter + fast finisher, low vol ──────────────
  (
    'Pie-O-My',
    'Pie',
    'A bay filly raced under the joint silks of Hesh Rabkin and Ralphie Cifaretto, who have decided between them that she runs the season at Churchill Downs. Claimed off a maiden card at Aqueduct on the cheap and turned over for a tidy profit on her stakes debut.',
    1.4000, 0.2000, 0.9300,  0.1500,  0.2000,
    '#c97064', 'US'
  ),

  -- ─── 2. Secretariat ── speed god, low alpha (fast reversion), big finish ─
  (
    'Secretariat',
    'Big Red',
    'The greatest racehorse ever to set hoof on a racetrack. Foaled at The Meadow in Doswell, Virginia. Thirty-one lengths at the Belmont. There is no second.',
    1.9000, 0.2500, 0.7500,  0.0000,  0.4000,
    '#6b4226', 'US'
  ),

  -- ─── 3. Romanian Pocketer ── starts slow, very high alpha, very volatile ─
  (
    'Romanian Pocketer',
    'Pickpocketer',
    'A bay colt trained by local pickpocket Dragomir Fatmir Bă. Notoriously slow out of the gate: handlers say he''d rather case the rail before deciding whether to run. Once he commits, his pace locks in and rarely drifts back.',
    1.5000, 0.3400, 0.9700, -0.2500,  0.0000,
    '#2d4f3a', 'RO'
  ),

  -- ─── 4. Charles De Gaulle ── steady mid-tier, low vol, medium alpha ─────
  (
    'Charles De Gaulle',
    'CDG',
    'A liver-chestnut gelding foaled in a hamlet outside Caen, Normandy. Lean, rangy, deep through the heart girth. His regular jockey, before he turned to the saddle, was a Pyrenees gunslinger working out of Andorra la Vella.',
    1.5500, 0.1800, 0.9200,  0.0000,  0.0000,
    '#0072ce', 'FR'
  ),

  -- ─── 5. La Cigarette ── explodes out the gate, fades late ──────────────
  (
    'La Cigarette',
    'Cigarette',
    'A grey filly bred in a Parisian yard near Vincennes. Patted as a foal by Premier Édouard Daladier on a visit to the stables. Explosive out of the gate; her engine weakens noticeably through the final furlong.',
    1.6500, 0.1800, 0.9200,  0.2500, -0.1800,
    '#f8e1a8', 'FR'
  ),

  -- ─── 6. Volkswagen Ganesh ── fast starter, medium finisher, high alpha ─
  (
    'Volkswagen Ganesh',
    'Volkswagen G',
    'A bay gelding bred in Dortmund. Punctual to a fault and out of the gate in stride, metronomic for the first three-quarters of the race. Remember: Just like its local club, Borussia Dortmund, Ganesh is prone to bottling.',
    1.6200, 0.2400, 0.9600,  0.2000,  0.0500,
    '#fbbf24', 'DE'
  ),

  -- ─── 7. Bugatti Soprano ── fast, balanced ──────────────────────────────
  (
    'Bugatti Soprano',
    'Gubatti Soprano',
    'A dark bay colt bred jointly by Peter Paul Gualtieri and Silvio Dante and trained out of Bayonne by Beppy Sasso. Survived a near-fatal poisoning when Artie Bucco sent over a malformed batch of osso buco that the stable lad fed him by mistake.',
    1.7000, 0.2200, 0.9400,  0.0000,  0.0000,
    '#6e1f2a', 'IT'
  ),

  -- ─── 8. Dollar Goldstein ── highest vol on the card ────────────────────
  (
    'Dollar Goldstein',
    'Goldstein',
    'A flaxen chestnut bred in the Negev by Sephardic Jewish cattlemen of Yemenite origin. Legend believes that, "Moses himself commissioned the creation of this horse." Wildly volatile — wins by ten or finishes a furlong off.',
    1.4600, 0.3600, 0.9000,  0.0000,  0.0000,
    '#d4af37', 'IL'
  ),

  -- ─── 9. Prep Duty Veeramani ── slowish, locked-in alpha ────────────────
  (
    'Prep Duty Veeramani',
    'Prep Duty',
    'A grey gelding who wanders the corridors of Palada House at Good Shepherd International School, Ooty. Favorite meal: biscuits from the non-veg dining hall. His pace, once set, is so locked-in that even Krishnamoorthy can not stop him.',
    1.3800, 0.2400, 0.9850,  0.0000,  0.0000,
    '#be185d', 'IN'
  ),

  -- ─── 10. Mister Speaker ── honest, machine-cut, no overlays ────────────
  (
    'Mister Speaker',
    'Mr. Speaker',
    'A bay gelding foaled outside Baton Rouge, Louisiana. Stands 16.1 hands, weighs 1,180 pounds, and is maintained on a strict diet of crawfish-shell-supplemented oats and wild Spanish moss. Honest, machine-cut fractions throughout.',
    1.5000, 0.2200, 0.9200,  0.0000,  0.0000,
    '#14b8a6', 'US'
  ),

  -- ─── 11. Ms. Eleanor ── regal, finishes well ──────────────────────────
  (
    'Ms. Eleanor',
    'Ms. Nell',
    'A bay filly bred in Kent — the Garden of England — and broken in at the Goodwood training yard. Carries herself like landed gentry on the gallop. Reliable cruiser through the middle of a race; tends to find a length or two when asked at the head of the stretch.',
    1.5500, 0.1600, 0.9100,  0.0000,  0.1800,
    '#7c3aed', 'GB'
  ),

  -- ─── 12. Queen of Spades ── high vol, high alpha (long streaks) ─────────
  (
    'Queen of Spades',
    'The Spade',
    'A coal-black mare bred by the Duke of Warwick at his Warwickshire estate. Notorious for streaks: when she runs hot she dismantles fields, and when she''s off she''s well off. Once locked into a mood, however hot or cold, she rarely drifts.',
    1.6800, 0.3200, 0.9700,  0.0000,  0.0000,
    '#1a1a1a', 'GB'
  ),

  -- ─── 13. Light Yagami ── surgical, low vol, very high alpha ────────────
  (
    'Light Yagami',
    'Light',
    'A grey colt bred in Hiroshima Prefecture by the personal stablesman of Admiral Isoroku Yamamoto. Quiet, pristine, surgical — the kind of horse that leads from start to wire without ever appearing to break a sweat.',
    1.5300, 0.1600, 0.9700,  0.0000,  0.0000,
    '#ffffff', 'JP'
  );
