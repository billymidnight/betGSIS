from flask import jsonify
from . import api_bp
from services.stats_service import compute_player_stats
from models.player import get_players_for_sport


@api_bp.route('/analytics/players', methods=['GET'])
def players():
    players = get_players_for_sport('GeoGuessr')
    return jsonify({'players': players})


@api_bp.route('/analytics/player/<int:player_id>/stats', methods=['GET'])
def player_stats(player_id):
    stats = compute_player_stats(player_id)
    if stats is None:
        return jsonify({'error': 'not found'}), 404
    return jsonify(stats)


@api_bp.route('/analytics/player/<int:player_id>/lines', methods=['GET'])
def player_lines(player_id):
    # For now, return empty lines; pricing endpoint will compute
    return jsonify({'lines': []})
