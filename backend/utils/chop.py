"""Split a concluded trading session's net P&L across chop partners.

Chop semantics:
- Player chop: other users share the PLAYER side of the session P&L. The
  main player's implicit share is ``100 - sum(partner percentages)``. Same
  sign as ``net_pnl``.
- House chop: other users share the HOUSE side of the session P&L.
  betgsis's implicit share is ``100 - sum(partner percentages)`` and no row
  is written for betgsis (betgsis is the default house and keeps its share
  off-book, matching current behaviour). Sign is reversed vs ``net_pnl``.

Row labelling:
- Main player row: ``market`` stays as the trading market (e.g. "Trading"),
  ``outcome`` stays as the session summary string.
- Every chop partner row: ``market = "Stocks"``. Player-side choppers get
  ``outcome = "Pro-{screenname} Stocks"``; house-side choppers get
  ``outcome = "Anti-{screenname}"``.
"""
from typing import Dict, List, Optional


def _coerce_pct(value) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def build_session_bet_rows(
    *,
    player_user_id: str,
    player_screenname: Optional[str],
    player_market: str,
    outcome: str,
    game_id: int,
    net_pnl: float,
    player_chops: Optional[List[Dict]] = None,
    house_chops: Optional[List[Dict]] = None,
) -> List[Dict]:
    """Return the list of bet rows to insert for a concluded trading session."""
    player_chops = player_chops or []
    house_chops = house_chops or []

    screen = (player_screenname or '').strip() or 'Unknown'
    pro_outcome = f"Pro-{screen} Stocks"
    anti_outcome = f"Anti-{screen}"

    def mk_row(user_id: str, market: str, outcome_str: str, pct: float, reverse: bool) -> Dict:
        fraction = pct / 100.0
        signed_pnl = net_pnl * (-1.0 if reverse else 1.0) * fraction
        return {
            'user_id': user_id,
            'market': market,
            'outcome': outcome_str,
            'point': None,
            'bet_size': abs(signed_pnl),
            'odds_american': '+100',
            'result': 'Win' if signed_pnl >= 0 else 'Loss',
            'bet_pnl': signed_pnl,
            'game_id': game_id,
        }

    partner_pct_sum = sum(_coerce_pct(c.get('percentage')) for c in player_chops)
    player_pct = max(0.0, 100.0 - partner_pct_sum)

    rows: List[Dict] = [
        mk_row(player_user_id, player_market, outcome, player_pct, reverse=False)
    ]

    for chop in player_chops:
        uid = chop.get('user_id')
        pct = _coerce_pct(chop.get('percentage'))
        if not uid or pct <= 0:
            continue
        rows.append(mk_row(uid, 'Stocks', pro_outcome, pct, reverse=False))

    for chop in house_chops:
        uid = chop.get('user_id')
        pct = _coerce_pct(chop.get('percentage'))
        if not uid or pct <= 0:
            continue
        rows.append(mk_row(uid, 'Stocks', anti_outcome, pct, reverse=True))

    return rows
