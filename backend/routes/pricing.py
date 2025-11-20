from flask import request, jsonify
from . import api_bp
from services.stats_service import stats_for_player
from services.pricing_service import price_for_thresholds
from db import get_session
from services.pricing_service import recompute_all_lines
from .auth_utils import require_book



@api_bp.route('/pricing/lines', methods=['POST'])
def pricing_lines():
    payload = request.get_json() or {}
    player_ids = payload.get('playerIds', [])
    thresholds = payload.get('thresholds', [])
    model = payload.get('model', 'normal')
    margin = payload.get('marginBps', 300)

    results = price_for_thresholds(player_ids, thresholds, model=model, margin_bps=margin)
    return jsonify({'results': results})


@api_bp.route('/pricing/recompute-all', methods=['POST'])
@require_book
def pricing_recompute_all():
    payload = request.get_json() or {}
    thresholds = payload.get('thresholds')
    margin = payload.get('marginBps', 0)

    session = get_session()
    try:
        res = recompute_all_lines(session, thresholds=thresholds, margin_bps=margin)
        session.commit()
        return jsonify(res)
    except Exception as e:
        session.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        session.close()
