"""Leaderboard routes — access-key gated stats pages.

Every handler computes P&L on the fly from bet_size + odds_american + result.
Never trust the persisted bet_pnl column.
"""
import os
from typing import Dict, List, Optional, Tuple

from flask import Blueprint, jsonify, request

from database.supabase_client import get_supabase_client


leaderboard_bp = Blueprint('leaderboard', __name__, url_prefix='/api/leaderboard')

# Access key. Checked against X-Access-Key header. Override via env if needed.
_DEFAULT_ACCESS_KEY = 'fDQ6_iSxT6dDkJkKrN7kVWNB2FtiPHd-'
ACCESS_KEY = os.getenv('LEADERBOARD_ACCESS_KEY', _DEFAULT_ACCESS_KEY)

supabase = get_supabase_client()


def _provided_key(req) -> str:
    return (req.headers.get('X-Access-Key') or req.headers.get('x-access-key') or '').strip()


def _require_key(req) -> Optional[Tuple]:
    """Return an (response, status) tuple if the request should be rejected, else None."""
    provided = _provided_key(req)
    if not provided or provided != ACCESS_KEY:
        return (jsonify({'success': False, 'error': 'invalid access key'}), 401)
    return None


def _american_to_decimal(amer) -> Optional[float]:
    try:
        if amer is None:
            return None
        a = int(str(amer).replace('+', ''))
        if a > 0:
            return (a / 100.0) + 1.0
        return (100.0 / abs(a)) + 1.0
    except Exception:
        return None


def _row_pnl(row: Dict) -> float:
    """Compute P&L from bet_size, odds_american, result. Unsettled → 0."""
    try:
        stake = float(row.get('bet_size') or 0.0)
    except Exception:
        stake = 0.0
    res = row.get('result')
    rlow = str(res).strip().lower() if res is not None else ''
    if rlow in ('win', 'won'):
        dec = _american_to_decimal(row.get('odds_american'))
        return (dec - 1.0) * stake if dec is not None else 0.0
    if rlow in ('loss', 'lost'):
        return -stake
    return 0.0


def _fetch_user_info(user_ids: List[str]) -> Dict[str, Dict]:
    """Return {user_id: {display_name, avatar_url}}."""
    uids = [u for u in user_ids if u]
    if not uids:
        return {}
    try:
        resp = supabase.table('users').select('user_id,screenname,email,avatar_url').in_('user_id', uids).execute()
        rows = resp.data or []
    except Exception:
        return {str(u): {'display_name': str(u)[:8], 'avatar_url': None} for u in uids}
    out: Dict[str, Dict] = {}
    for u in rows:
        uid = str(u.get('user_id'))
        screen = (u.get('screenname') or '').strip()
        email = u.get('email') or ''
        if screen:
            display = screen
        elif '@' in email:
            display = email.split('@', 1)[0]
        else:
            display = uid[:8]
        out[uid] = {
            'display_name': display,
            'avatar_url': u.get('avatar_url'),
        }
    return out


@leaderboard_bp.route('/verify-key', methods=['POST', 'OPTIONS'])
def verify_key():
    if request.method == 'OPTIONS':
        return ('', 200)
    data = request.json or {}
    key = (data.get('key') or '').strip()
    return jsonify({'valid': bool(key) and key == ACCESS_KEY}), 200


@leaderboard_bp.route('/stats', methods=['GET', 'OPTIONS'])
def get_stats():
    """betGSIS aggregate stats — net wagered, total bets, top market."""
    if request.method == 'OPTIONS':
        return ('', 200)
    reject = _require_key(request)
    if reject:
        return reject

    try:
        resp = supabase.table('bets').select('bet_size,market,layeur,odds_american,result').execute()
        rows = resp.data or []
        rows = [r for r in rows if (r.get('layeur') or 'betgsis') == 'betgsis']

        total_bets = len(rows)
        net_wagered = 0.0
        players_pnl_sum = 0.0
        market_volume: Dict[str, float] = {}
        market_count: Dict[str, int] = {}
        for r in rows:
            try:
                stake = float(r.get('bet_size') or 0.0)
            except Exception:
                stake = 0.0
            net_wagered += stake
            players_pnl_sum += _row_pnl(r)
            mk = (r.get('market') or 'Unknown').strip() or 'Unknown'
            market_volume[mk] = market_volume.get(mk, 0.0) + stake
            market_count[mk] = market_count.get(mk, 0) + 1

        betgsis_pnl = -players_pnl_sum

        top_market = None
        if market_volume:
            top_market_name = max(market_volume, key=lambda k: market_volume[k])
            top_market = {
                'market': top_market_name,
                'volume': round(market_volume[top_market_name], 2),
                'bet_count': market_count.get(top_market_name, 0),
            }

        return jsonify({
            'success': True,
            'net_wagered': round(net_wagered, 2),
            'total_bets': total_bets,
            'betgsis_pnl': round(betgsis_pnl, 2),
            'top_market': top_market,
        }), 200

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


def _leaderboard_for_market(markets: List[str]) -> List[Dict]:
    """Per-user P&L across all rows whose market is in the given list.

    Only includes users whose total gross stake across those markets is > 0.
    """
    rows: List[Dict] = []
    for mk in markets:
        try:
            resp = supabase.table('bets').select('user_id,bet_size,odds_american,result,outcome,market').eq('market', mk).execute()
            rows.extend(resp.data or [])
        except Exception:
            continue

    by_user: Dict[str, Dict[str, float]] = {}
    for r in rows:
        uid = r.get('user_id')
        if not uid:
            continue
        uid = str(uid)
        bucket = by_user.setdefault(uid, {'pnl': 0.0, 'stake': 0.0, 'cash_pnl': 0.0, 'tourney_pnl': 0.0, 'bets': 0})
        pnl = _row_pnl(r)
        try:
            stake = float(r.get('bet_size') or 0.0)
        except Exception:
            stake = 0.0
        bucket['pnl'] += pnl
        bucket['stake'] += stake
        bucket['bets'] += 1
        oc = (r.get('outcome') or '').lower()
        if 'cash game' in oc:
            bucket['cash_pnl'] += pnl
        elif 'tournament' in oc:
            bucket['tourney_pnl'] += pnl

    by_user = {uid: b for uid, b in by_user.items() if b['stake'] > 0}
    user_info = _fetch_user_info(list(by_user.keys()))

    out: List[Dict] = []
    for uid, b in by_user.items():
        info = user_info.get(uid, {'display_name': uid[:8], 'avatar_url': None})
        out.append({
            'user_id': uid,
            'screenname': info['display_name'],
            'avatar_url': info.get('avatar_url'),
            'pnl': round(b['pnl'], 2),
            'cash_pnl': round(b['cash_pnl'], 2),
            'tournament_pnl': round(b['tourney_pnl'], 2),
            'bets': b['bets'],
            'stake': round(b['stake'], 2),
        })
    out.sort(key=lambda x: x['screenname'].lower())
    return out


@leaderboard_bp.route('/poker', methods=['GET', 'OPTIONS'])
def get_poker_leaderboard():
    if request.method == 'OPTIONS':
        return ('', 200)
    reject = _require_key(request)
    if reject:
        return reject
    try:
        return jsonify({'success': True, 'players': _leaderboard_for_market(['Poker'])}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@leaderboard_bp.route('/gs-poker', methods=['GET', 'OPTIONS'])
def get_gs_poker_leaderboard():
    if request.method == 'OPTIONS':
        return ('', 200)
    reject = _require_key(request)
    if reject:
        return reject
    try:
        return jsonify({'success': True, 'players': _leaderboard_for_market(['GS Poker'])}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@leaderboard_bp.route('/trading', methods=['GET', 'OPTIONS'])
def get_trading_leaderboard():
    if request.method == 'OPTIONS':
        return ('', 200)
    reject = _require_key(request)
    if reject:
        return reject
    try:
        return jsonify({'success': True, 'players': _leaderboard_for_market(['Trading', 'Stocks'])}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@leaderboard_bp.route('/specials', methods=['GET', 'OPTIONS'])
def get_specials_leaderboard():
    if request.method == 'OPTIONS':
        return ('', 200)
    reject = _require_key(request)
    if reject:
        return reject
    try:
        return jsonify({'success': True, 'players': _leaderboard_for_market(['Specials'])}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
