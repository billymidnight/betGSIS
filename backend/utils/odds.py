from typing import Optional
import math


def _floor_to(x: int, base: int) -> int:
    """Floor x to nearest multiple of base toward -infinity (works for negatives)."""
    if base <= 0:
        return x
    # For positive numbers: floor to nearest multiple <= x
    # For negative numbers: floor toward -infinity -> more negative
    return int(math.floor(x / base) * base)


def format_american_odds(o: Optional[int]) -> Optional[int]:
    """
    Apply book-favoring rounding rules to an American odds integer.

    Rules (absolute value):
    - 100 <= abs(o) < 400: no rounding (show exact integer)
    - 400 <= abs(o) < 1000: floor to nearest 5
    - 1000 <= abs(o) < 3000: floor to nearest 10
    - abs(o) >= 3000: floor to nearest 100

    Returns rounded int with sign preserved, or None if input is None/invalid.
    """
    if o is None:
        return None
    try:
        oi = int(float(o))
    except Exception:
        return None

    sign = 1 if oi >= 0 else -1
    mag = abs(oi)

    # no rounding for small odds <100 or between 100-399 (show exact ints)
    if 100 <= mag < 400:
        rounded = mag
    elif 400 <= mag < 1000:
        rounded = _floor_to(mag, 5)
    elif 1000 <= mag < 3000:
        rounded = _floor_to(mag, 10)
    elif mag >= 3000:
        rounded = _floor_to(mag, 100)
    else:
        # For magnitudes below 100, return as-is (no rounding rule defined)
        rounded = mag

    return int(rounded * sign)


def american_to_decimal(american: int) -> float:
    """Convert an American odds integer to decimal odds."""
    try:
        a = int(american)
    except Exception:
        return 1.0
    if a > 0:
        return 1.0 + (a / 100.0)
    if a < 0:
        return 1.0 + (100.0 / abs(a))
    return 1.0


def decimal_to_american_rounded(d: float, prob: Optional[float] = None) -> str:
    """Convert decimal odds to rounded American odds string (e.g., '+480' or '-1290').

    This computes the raw American value from decimal odds, applies
    book-favoring rounding, and returns a signed string. When the originating
    probability is provided via `prob`, apply asymmetric guardrails:

    - Underdog side (prob < 0.5): hard cap at +5000 (decimal cap = 51.0).
      Do not allow american > +5000 under any circumstance.
    - Favorite side (prob > 0.5): allow scaling naturally up to -200000, but
      if prob > 0.9995 clamp to produce -200000 (decimal floor = 1.0005).

    If `prob` is not provided we fall back to a generous symmetric cap at
    ±200000 to avoid unbounded values.
    """
    if d is None or d <= 0:
        return "0"

    # If prob is supplied, enforce asymmetric caps by adjusting decimal odds
    dec = d
    try:
        if prob is not None:
            # do not blindly clamp probabilities >1.0 here — overshoot from
            # margin/vig is meaningful and must be handled specially.
            try:
                p = float(prob)
            except Exception:
                p = None

            if p is not None:
                # UNDERSHOOT/UNDERDOG: if adjusted probability is very small,
                # enforce the +5000 cap
                if p < 0.02:
                    DECIMAL_CAP_UNDERDOG = 51.0  # +5000 -> decimal = 50 + 1
                    if dec > DECIMAL_CAP_UNDERDOG:
                        dec = DECIMAL_CAP_UNDERDOG

                # FAVORITE overshoot handling: if vig/margin bumped prob over 1.0
                # we redirect to hard-coded American values as follows:
                #  - 1.0 < prob <= 1.08  -> -100000
                #  - 1.08 < prob <= 1.15 -> -200000
                #  - prob > 1.15         -> -500000 (absolute minus-side cap)
                # Note: we intentionally handle prob > 1.0 here and return early
                # with the appropriate hard-coded American value (string),
                # bypassing decimal math which would otherwise produce extreme
                # integers.
                if p > 1.0:
                    if p <= 1.08:
                        return "-100000"
                    if p <= 1.15:
                        return "-200000"
                    return "-500000"

                # For favorite-side probabilities within [0.5, 1.0], keep the
                # previous tiny-floor behavior to map extremely close certainties
                # to the -200000 cap when appropriate.
                if p >= 0.5:
                    if p > 0.9995:
                        DECIMAL_FLOOR_FAVORITE = 1.0005  # corresponds to -200000
                        if dec < DECIMAL_FLOOR_FAVORITE:
                            dec = DECIMAL_FLOOR_FAVORITE

        # compute raw american using standard conversion on the (possibly adjusted) decimal
        if math.isinf(dec):
            raw = 10 ** 9
        elif dec >= 2.0:
            raw = int(round((dec - 1.0) * 100.0))
        else:
            # avoid division by zero when dec is extremely close to 1.0
            if dec <= 1.0 + 1e-12:
                raw = -10 ** 9
            else:
                raw = int(round(-100.0 / (dec - 1.0)))
    except Exception:
        return "0"

    # Enforce absolute caps as a final safeguard
    # Absolute cap for the magnitude of American odds on the minus (favorite) side
    # per new policy: -500000 is the absolute lower bound for favorites.
    MAX_AMERICAN = 500000
    # Underdog hard cap (+5000) must be enforced regardless of prob when raw is positive
    UNDERDOG_MAX = 5000
    if raw > 0 and abs(raw) > UNDERDOG_MAX:
        raw = int(math.copysign(UNDERDOG_MAX, raw))

    if abs(raw) > MAX_AMERICAN:
        raw = int(math.copysign(MAX_AMERICAN, raw))

    rounded = format_american_odds(raw)
    if rounded is None:
        return str(raw)

    if rounded >= 0:
        return f"+{rounded}"
    return str(int(rounded))
