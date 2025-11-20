# backend/api/routes.py (excerpt)
from flask import jsonify
from backend.database.geo_repo import get_geo_players

@app.route("/api/geoguessr/totals", methods=["GET"])
def geoguessr_totals():
    try:
        rows = get_geo_players()
        return jsonify({"ok": True, "players": rows})
    except Exception as e:
        app.logger.error(f"geoguessr_totals: {e}")
        return jsonify({"ok": False, "error": str(e)}), 500
