from flask import jsonify
from . import api_bp


@api_bp.route('/markets/sports', methods=['GET'])
def sports():
    return jsonify({'sports': ['GeoGuessr', 'Chess', 'Poker', 'Monopoly']})


@api_bp.route('/markets/geoguessr', methods=['GET'])
def geoguessr():
    # For now return static players list; analytics should supply real data
    players = [
        {'id': 1, 'name': 'Brad'},
        {'id': 2, 'name': 'Janice'},
    ]
    return jsonify({'players': players})


@api_bp.route('/markets/geoguessr/player/<int:player_id>/lines', methods=['GET'])
def player_lines(player_id):
    # stub: return empty for now
    return jsonify({'lines': []})
