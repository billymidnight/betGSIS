"""Dammox birthday tribute page — aggregates all bet stats for a specific user.

P&L is computed on the fly from bet_size + odds_american + result (mirrors
leaderboard.py). Never trust the persisted bet_pnl column.
"""
import os
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Tuple

from flask import Blueprint, jsonify, request, send_from_directory

from database.supabase_client import get_supabase_client


dammox_bp = Blueprint('dammox', __name__, url_prefix='/api/dammox')

DAMMOX_USER_ID = 'cc4bdc68-4621-4ce3-ac20-b14f0f0779ff'

supabase = get_supabase_client()


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
    """P&L from bet_size, odds_american, result. Unsettled → 0."""
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


def _to_est_date(ts: Optional[str]) -> Optional[str]:
    """Convert a UTC timestamp string to an EST (UTC-5) YYYY-MM-DD date."""
    if not ts:
        return None
    try:
        # Supabase returns ISO strings; handle 'Z' suffix
        s = ts.replace('Z', '+00:00') if isinstance(ts, str) else ts
        dt = datetime.fromisoformat(s) if isinstance(s, str) else s
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        est = dt.astimezone(timezone(timedelta(hours=-5)))
        return est.strftime('%Y-%m-%d')
    except Exception:
        return None


@dammox_bp.route('/stats', methods=['GET', 'OPTIONS'])
def get_dammox_stats():
    if request.method == 'OPTIONS':
        return ('', 200)
    try:
        resp = (
            supabase.table('bets')
            .select('bet_id,user_id,market,outcome,bet_size,odds_american,result,placed_at,point,layeur')
            .eq('user_id', DAMMOX_USER_ID)
            .execute()
        )
        rows = resp.data or []

        total_bets = len(rows)
        total_volume = 0.0
        market_volume: Dict[str, float] = {}
        market_bets: Dict[str, int] = {}
        market_pnl: Dict[str, float] = {}
        market_days: Dict[str, set] = {}
        day_pnl: Dict[str, float] = {}

        enriched: List[Dict] = []
        for r in rows:
            try:
                stake = float(r.get('bet_size') or 0.0)
            except Exception:
                stake = 0.0
            total_volume += stake
            mk = (r.get('market') or 'Unknown').strip() or 'Unknown'
            pnl = _row_pnl(r)
            market_volume[mk] = market_volume.get(mk, 0.0) + stake
            market_bets[mk] = market_bets.get(mk, 0) + 1
            market_pnl[mk] = market_pnl.get(mk, 0.0) + pnl

            est_date = _to_est_date(r.get('placed_at'))
            if est_date:
                market_days.setdefault(mk, set()).add(est_date)
                day_pnl[est_date] = day_pnl.get(est_date, 0.0) + pnl

            enriched.append({
                'bet_id': r.get('bet_id'),
                'market': mk,
                'outcome': r.get('outcome'),
                'bet_size': stake,
                'odds_american': r.get('odds_american'),
                'result': r.get('result'),
                'placed_at': r.get('placed_at'),
                'est_date': est_date,
                'pnl': round(pnl, 2),
                'point': r.get('point'),
            })

        most_wagered_market = None
        least_wagered_market = None
        if market_volume:
            mw = max(market_volume, key=lambda k: market_volume[k])
            lw = min(market_volume, key=lambda k: market_volume[k])
            most_wagered_market = {'market': mw, 'volume': round(market_volume[mw], 2), 'bets': market_bets.get(mw, 0)}
            least_wagered_market = {'market': lw, 'volume': round(market_volume[lw], 2), 'bets': market_bets.get(lw, 0)}

        day_pnl_list = [{'date': d, 'pnl': round(v, 2)} for d, v in day_pnl.items()]
        top_days = sorted(day_pnl_list, key=lambda x: x['pnl'], reverse=True)[:3]
        bot_days = sorted(day_pnl_list, key=lambda x: x['pnl'])[:3]

        settled = [b for b in enriched if b['result'] is not None]
        top_bets = sorted(settled, key=lambda b: b['pnl'], reverse=True)[:3]
        worst_bets = sorted(settled, key=lambda b: b['pnl'])[:3]

        markets_breakdown = []
        for mk, vol in market_volume.items():
            markets_breakdown.append({
                'market': mk,
                'days_bet': len(market_days.get(mk, set())),
                'volume': round(vol, 2),
                'bets': market_bets.get(mk, 0),
                'pnl': round(market_pnl.get(mk, 0.0), 2),
            })
        markets_breakdown.sort(key=lambda m: m['pnl'], reverse=True)

        return jsonify({
            'success': True,
            'user_id': DAMMOX_USER_ID,
            'total_bets': total_bets,
            'total_volume': round(total_volume, 2),
            'most_wagered_market': most_wagered_market,
            'least_wagered_market': least_wagered_market,
            'top_winning_days': top_days,
            'top_losing_days': bot_days,
            'top_winning_bets': top_bets,
            'top_losing_bets': worst_bets,
            'markets_breakdown': markets_breakdown,
        }), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@dammox_bp.route('/memes', methods=['GET', 'OPTIONS'])
def list_memes():
    if request.method == 'OPTIONS':
        return ('', 200)
    try:
        folder = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'yayabday')
        if not os.path.isdir(folder):
            return jsonify({'success': True, 'files': []}), 200
        exts = ('.jpg', '.jpeg', '.png', '.webp', '.gif')
        files = sorted([f for f in os.listdir(folder) if f.lower().endswith(exts)])
        return jsonify({'success': True, 'files': files}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
