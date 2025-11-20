from flask import request, jsonify
from . import api_bp
from .auth_utils import require_book
from models.bet import create_bet_for_user, get_bets_for_user, get_all_bets, settle_bet


@api_bp.route('/bets/place', methods=['POST'])
def place_bet():
    payload = request.get_json() or {}
    user_id = payload.get('userId')
    line_id = payload.get('lineId')
    side = payload.get('side')
    stake = payload.get('stake')
    if not line_id or side not in ('over', 'under') or stake is None:
        return jsonify({'error': 'invalid payload'}), 400

    bet = create_bet_for_user(user_id, line_id, side, stake)
    return jsonify({'bet': bet}), 201


@api_bp.route('/bets/user/<int:user_id>', methods=['GET'])
def bets_for_user(user_id):
    bets = get_bets_for_user(user_id)
    return jsonify({'bets': bets})


@api_bp.route('/bets/all', methods=['GET'])
@require_book
def bets_all():
    bets = get_all_bets()
    return jsonify({'bets': bets})


@api_bp.route('/settle/bet/<int:bet_id>', methods=['POST'])
@require_book
def settle(bet_id):
    payload = request.get_json() or {}
    outcome = payload.get('outcome')
    if outcome not in ('win', 'lose', 'push'):
        return jsonify({'error': 'invalid outcome'}), 400
    try:
        r = settle_bet(bet_id, outcome)
        return jsonify(r)
    except Exception as e:
        return jsonify({'error': str(e)}), 400


@api_bp.route('/pnl/user/<int:user_id>', methods=['GET'])
def pnl_for_user(user_id):
    # For now return mock P&L
    return jsonify({'pnl': {'realized': 0, 'unrealized': 0}})
