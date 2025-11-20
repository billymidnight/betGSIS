from flask import request, jsonify
from . import api_bp
from services.csv_parser import parse_geoguessr_csv
from models.player import get_or_create_player_by_name
from models.game import get_or_create_game_by_gameno
from models.player_points import insert_player_points_bulk
from db import get_session
from services.stats_service import compute_player_stats
from .auth_utils import require_book


@api_bp.route('/ingest/csv', methods=['POST'])
@require_book
def ingest_csv():
    if 'file' not in request.files:
        return jsonify({'error': 'file missing'}), 400
    f = request.files['file']
    try:
        rows = parse_geoguessr_csv(f.stream)
    except Exception as e:
        return jsonify({'error': 'parse_error', 'details': str(e)}), 400

    inserted = 0
    skipped = 0
    errors = []

    session = get_session()
    try:
        for row in rows:
            gameno = row.get('gameno')
            if gameno is None:
                skipped += 1
                continue
            game = get_or_create_game_by_gameno(session, gameno)
            for player_name, pts in row.get('players', {}).items():
                player = get_or_create_player_by_name(session, player_name)
                insert_player_points_bulk(session, game.id, player.id, pts)
                inserted += 1
                # recompute and persist stats for this player
                try:
                    compute_player_stats(player.id)
                except Exception:
                    pass
        session.commit()
    except Exception as e:
        session.rollback()
        errors.append(str(e))
    finally:
        session.close()

    return jsonify({'inserted': inserted, 'skipped': skipped, 'errors': errors})
