// Format utilities for odds, currency, and percentages

export function formatOdds(decimal: number, format: 'decimal' | 'american' = 'decimal'): string {
  if (format === 'american') {
    return decimalToAmerican(decimal);
  }
  return decimal.toFixed(2);
}

export function decimalToAmerican(decimal: number, prob?: number): string {
  // Compute raw american then apply book-favoring rounding rules
  if (decimal == null || Number.isNaN(decimal) || decimal <= 0) {
    return '0';
  }

  let raw: number;
  try {
    if (!Number.isFinite(decimal)) {
      // infinite decimal (prob->0) -> huge positive american; cap later
      raw = 1e9;
    } else if (decimal >= 2.0) {
      raw = Math.round((decimal - 1.0) * 100);
    } else {
      // avoid division by zero when decimal is extremely close to 1.0
      if (decimal <= 1.0 + 1e-12) {
        // extremely heavy favorite (prob ~1.0) -> produce a very large negative value
        raw = -1e9;
      } else {
        raw = Math.round(-100.0 / (decimal - 1.0));
      }
    }
  } catch (e) {
    return '0';
  }

  // Apply asymmetric guardrails
  const UNDERDOG_MAX = 5000; // hard cap for underdogs (+5000)
  // Absolute cap for the magnitude of American odds on the minus (favorite) side
  // per new policy: -500000 is the absolute lower bound for favorites.
  const MAX_AMERICAN = 500000; // absolute cap for favorites

  // If probability is supplied, use it to decide side and apply the stricter
  // favorite/overshoot guardrails. Note: do NOT clamp prob to 1.0 here —
  // vig/margin can push probabilities >1.0 and those must be handled.
  if (typeof prob === 'number' && !Number.isNaN(prob)) {
    const pRaw = prob;

    // FAVORITE overshoot handling: if vig/margin bumped prob over 1.0
    //  - 1.0 < prob <= 1.08  -> -100000
    //  - 1.08 < prob <= 1.15 -> -200000
    //  - prob > 1.15         -> -500000 (absolute minus-side cap)
    if (pRaw > 1.0) {
      if (pRaw <= 1.08) return '-100000';
      if (pRaw <= 1.15) return '-200000';
      return '-500000';
    }

    const p = Math.max(0, Math.min(1, pRaw));
    if (p < 0.5) {
      // underdog side: enforce +5000 cap
      if (raw > UNDERDOG_MAX) raw = UNDERDOG_MAX;
    } else {
  // favorite side: allow scaling but enforce absolute MAX; if extremely
  // certain, enforce -200000 cap by ensuring raw not less than -MAX_AMERICAN
  if (p > 0.9995 && raw < -MAX_AMERICAN) raw = -MAX_AMERICAN;
  // also ensure we never exceed absolute cap
  if (raw < -MAX_AMERICAN) raw = -MAX_AMERICAN;
    }
  } else {
    // No probability supplied: apply conservative caps
    if (raw > UNDERDOG_MAX) raw = UNDERDOG_MAX;
    if (Math.abs(raw) > MAX_AMERICAN) raw = Math.sign(raw) * MAX_AMERICAN;
  }

  const rounded = formatAmericanFromInt(raw);
  if (!Number.isFinite(rounded)) return String(raw);
  return rounded >= 0 ? `+${rounded}` : `${rounded}`;
}


function _floorTo(x: number, base: number): number {
  return Math.floor(x / base) * base;
}

export function formatAmericanFromInt(o: number): number {
  const oi = Math.trunc(o);
  const sign = oi >= 0 ? 1 : -1;
  const mag = Math.abs(oi);
  let rounded: number;
  if (mag >= 100 && mag < 400) {
    rounded = mag;
  } else if (mag >= 400 && mag < 1000) {
    rounded = _floorTo(mag, 5);
  } else if (mag >= 1000 && mag < 3000) {
    rounded = _floorTo(mag, 10);
  } else if (mag >= 3000) {
    rounded = _floorTo(mag, 100);
  } else {
    rounded = mag;
  }
  return rounded * sign;
}

export function americanToDecimal(american: number): number {
  if (!Number.isFinite(american)) return 1.0;
  const a = Math.trunc(american);
  if (a > 0) return 1 + a / 100.0;
  if (a < 0) return 1 + 100.0 / Math.abs(a);
  return 1.0;
}

export function formatCurrency(value: number, symbol = '$', decimals = 2): string {
  const formatted = value.toFixed(decimals);
  return `${symbol}${formatted}`;
}

export function formatPercent(value: number, decimals = 2): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

export function computePayout(stake: number, decimalOdds: number): number {
  return stake * decimalOdds;
}

export function computeProfit(stake: number, decimalOdds: number): number {
  return computePayout(stake, decimalOdds) - stake;
}

export function clampStake(stake: number, min = 1, max = 100000): number {
  return Math.max(min, Math.min(max, stake));
}

export function generatePlausibleOdds(seed: number): { decimal: number; american: string } {
  // Simple deterministic odds based on seed for mock data
  const odds = [1.6, 1.7, 1.8, 1.9, 2.0, 2.1, 2.2, 2.3, 2.5, 2.7, 3.0, 3.5];
  const decimal = odds[seed % odds.length];
  return { decimal, american: formatOdds(decimal, 'american') };
}
