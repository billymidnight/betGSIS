"""Esports: FIFA odds screen.

Only fair probabilities live in `fifa_games` (home_prob / draw_prob / away_prob).
Every market on the board is DERIVED from those three numbers with a flat 6% vig,
then converted to decimal + American via the shared book-favoring conversion
(utils.odds). Markets, always in this order per game:

  1. Moneyline      — home / draw / away
  2. Double Chance  — (home or draw) / (away or draw) / (home or away)
  3. Draw No Bet    — home / away  (draw discounted out of the denominator)
"""
from flask import Blueprint, jsonify

from database.supabase_client import get_supabase_client
from utils.odds import decimal_to_american_rounded


fifa_bp = Blueprint('fifa', __name__, url_prefix='/api/fifa')

supabase = get_supabase_client()

VIG = 0.06  # flat 6% on every FIFA market


def _price(fair_prob: float) -> dict:
    """Fair probability -> {prob, decimal, american} with 6% vig bumped on top."""
    try:
        p = float(fair_prob)
    except Exception:
        p = 0.0
    p_adj = p * (1.0 + VIG)
    if p_adj <= 0:
        p_adj = 1e-9
    dec = 1.0 / p_adj
    amer = decimal_to_american_rounded(dec, prob=p_adj)
    return {'prob': round(p, 4), 'decimal': round(dec, 4), 'american': amer}


def _num(x) -> str:
    """Trim trailing zeros: 6.5 -> '6.5', 21.0 -> '21'."""
    try:
        return '%g' % float(x)
    except Exception:
        return str(x)


def _signed(x) -> str:
    """Signed point label: -1.5 -> '-1.5', 1.5 -> '+1.5'."""
    try:
        v = float(x)
    except Exception:
        return str(x)
    s = _num(v)
    return s if v < 0 else f"+{s}"


def _build_prop_markets(rows, hn, an):
    """Turn fifa_game_pricing rows for one game into renderable market groups.

    Over/Under markets (total goals, corners, shots) -> kind 'ou'.
    Spread -> kind 'spread' with home/away paired per line.
    """
    def group(mkt):
        return [r for r in rows if r.get('market') == mkt]

    props = []

    # --- Over/Under style markets ---
    for key, title, noun in [
        ('total_goals', 'Total Goals', 'Goals'),
        ('corners', 'Corners', 'Corners'),
        ('shots', 'Shots', 'Shots'),
    ]:
        grp = group(key)
        over = next((r for r in grp if r.get('selection') == 'over'), None)
        under = next((r for r in grp if r.get('selection') == 'under'), None)
        if not over or not under:
            continue
        ln = over.get('line')
        lbl = _num(ln)
        props.append({
            'key': key,
            'title': title,
            'kind': 'ou',
            'over': {
                'key': f'{key}_over', 'top': f"Over {lbl} {noun}", 'label': f"Over {lbl}",
                'lock': bool(over.get('lock')), **_price(over.get('prob')),
            },
            'under': {
                'key': f'{key}_under', 'top': f"Under {lbl} {noun}", 'label': f"Under {lbl}",
                'lock': bool(under.get('lock')), **_price(under.get('prob')),
            },
        })

    # --- Spread (home/away paired by opposite line) ---
    sp = group('spread')
    if sp:
        aways = {}
        for r in sp:
            if r.get('selection') == 'away':
                try:
                    aways[float(r.get('line'))] = r
                except Exception:
                    pass
        rows_out = []
        homes = [r for r in sp if r.get('selection') == 'home']
        for hr in sorted(homes, key=lambda r: float(r.get('line') or 0)):
            hl = float(hr.get('line') or 0)
            row = {
                'line': hl,
                'home': {
                    'key': f'spread_home_{_num(hl)}', 'top': f"{hn} {_signed(hl)}",
                    'label': f"{hn} {_signed(hl)}", 'lock': bool(hr.get('lock')),
                    **_price(hr.get('prob')),
                },
            }
            ar = aways.get(-hl)
            if ar is not None:
                al = float(ar.get('line') or 0)
                row['away'] = {
                    'key': f'spread_away_{_num(al)}', 'top': f"{an} {_signed(al)}",
                    'label': f"{an} {_signed(al)}", 'lock': bool(ar.get('lock')),
                    **_price(ar.get('prob')),
                }
            rows_out.append(row)
        if rows_out:
            props.append({'key': 'spread', 'title': 'Spread', 'kind': 'spread', 'rows': rows_out})

    return props


@fifa_bp.route('/board', methods=['GET'])
def board():
    """Active FIFA games with ML / Double Chance / Draw No Bet fully priced.

    Fails soft: if the DB read blows up (e.g. table missing / stale PostgREST
    schema cache) we return an empty board + error string with a 200 so CORS
    headers still attach and the UI degrades gracefully instead of hard-crashing.
    """
    client = supabase

    try:
        games_res = (
            client.table('fifa_games')
            .select('*')
            .eq('is_active', True)
            .order('game_id')
            .execute()
        )
        games = games_res.data or []

        players_res = (
            client.table('fifa_players')
            .select('player_id,player_name,player_screenname')
            .execute()
        )
        pmap = {p['player_id']: p for p in (players_res.data or [])}

        # Prop pricing for all active games in one query, grouped by game_id
        active_ids = [g['game_id'] for g in games]
        pricing_by_game = {}
        if active_ids:
            pricing_res = (
                client.table('fifa_game_pricing')
                .select('*')
                .in_('game_id', active_ids)
                .order('pricing_id')
                .execute()
            )
            for r in (pricing_res.data or []):
                pricing_by_game.setdefault(r['game_id'], []).append(r)
    except Exception as e:
        return jsonify({'games': [], 'error': str(e)}), 200

    out = []
    for g in games:
        home = pmap.get(g['home_playerid']) or {}
        away = pmap.get(g['away_playerid']) or {}
        hn = home.get('player_name') or f"Player {g['home_playerid']}"
        an = away.get('player_name') or f"Player {g['away_playerid']}"

        hp = float(g.get('home_prob') or 0.0)
        dp = float(g.get('draw_prob') or 0.0)
        ap = float(g.get('away_prob') or 0.0)
        total = hp + dp + ap
        if total <= 0:
            total = 1.0
        # normalize so probs sum to 1 before vig (robust to loose inputs)
        hpn, dpn, apn = hp / total, dp / total, ap / total

        matchup = f"{hn} vs. {an} FIFA"  # sub-line on the betslip / stored suffix

        moneyline = [
            {'key': 'ml_home', 'top': f"{hn} ML", 'label': hn, **_price(hpn)},
            {'key': 'ml_draw', 'top': "Draw ML", 'label': 'Draw', **_price(dpn)},
            {'key': 'ml_away', 'top': f"{an} ML", 'label': an, **_price(apn)},
        ]

        # Double chance = prob over 2 of the 3 outcomes
        double_chance = [
            {'key': 'dc_home_draw', 'top': f"{hn} or Draw", 'label': f"{hn} or Draw", **_price(hpn + dpn)},
            {'key': 'dc_away_draw', 'top': f"{an} or Draw", 'label': f"{an} or Draw", **_price(apn + dpn)},
            {'key': 'dc_home_away', 'top': f"{hn} or {an}", 'label': f"{hn} or {an}", **_price(hpn + apn)},
        ]

        # Draw no bet = discount the draw out of the denominator, renormalize home vs away
        ha = hpn + apn
        if ha <= 0:
            ha = 1.0
        draw_no_bet = [
            {'key': 'dnb_home', 'top': f"{hn} DNB", 'label': hn, **_price(hpn / ha)},
            {'key': 'dnb_away', 'top': f"{an} DNB", 'label': an, **_price(apn / ha)},
        ]

        out.append({
            'game_id': g['game_id'],
            'home': {'player_id': g['home_playerid'], 'name': hn, 'screenname': home.get('player_screenname')},
            'away': {'player_id': g['away_playerid'], 'name': an, 'screenname': away.get('player_screenname')},
            'matchup': matchup,
            'tab_label': f"{hn} vs. {an}",
            'moneyline': moneyline,
            'double_chance': double_chance,
            'draw_no_bet': draw_no_bet,
            'prop_markets': _build_prop_markets(pricing_by_game.get(g['game_id'], []), hn, an),
        })

    return jsonify({'games': out})
