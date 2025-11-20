from flask import jsonify
from . import api_bp


@api_bp.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok'})
