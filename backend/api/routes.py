from flask import Blueprint, jsonify, request
from flask import current_app as app
import csv
import io
import time
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from decimal import Decimal
import os
import logging

# Supabase helpers
from supabase_client import get_admin_client, get_user_from_access_token  # type: ignore
# Odds formatting utilities
from utils.odds import format_american_odds, decimal_to_american_rounded, american_to_decimal  # type: ignore

api_bp = Blueprint('api', __name__, url_prefix='/api')


def _is_market_locked(market_name: str) -> dict:
    """Helper: returns dict { master: bool, market_locked: bool, locks: dict }

    market_name may be None to only check master.
    """
    try:
        from database.geo_repo import get_locks  # type: ignore
        res = get_locks(market=market_name)
        return { 'master': bool(res.get('master')), 'market_locked': bool(res.get('market_locked')), 'locks': res.get('locks', {}) }
    except Exception:
        app.logger.exception('_is_market_locked failed')
        return { 'master': False, 'market_locked': False, 'locks': {} }


def _get_user_from_header(req):
    """Validate Authorization header and return the supabase user id (UUID string) or None.

    This helper always returns a primitive string (UUID) to avoid passing complex objects
    into DB queries which cause 'invalid input syntax for type uuid' errors.
    """
    auth = req.headers.get('Authorization') or req.headers.get('authorization')
    if not auth:
        return None
    if auth.lower().startswith('bearer '):
        token = auth.split(' ', 1)[1].strip()
    else:
        token = auth.strip()

    # Use admin/service-role client to decode token
    client = _get_admin_client()
    if not client:
        # fallback: try helper
        user_obj = get_user_from_access_token(token)
        if not user_obj:
            return None
        # normalize id and log to server console
        try:
            if isinstance(user_obj, dict):
                uid = user_obj.get('id') or user_obj.get('user', {}).get('id')
            else:
                uid = getattr(user_obj, 'id', None) or (getattr(user_obj, 'user', None) and getattr(user_obj.user, 'id', None))
            if uid is None:
                return None
            uid_str = str(uid)
            try:
                app.logger.info(f"Brudda, your uid is {uid_str}")
            except Exception:
                # fallback to print if logger unavailable
                print(f"Brudda, your uid is {uid_str}")
            return uid_str
        except Exception:
            return None

    try:
        # Prefer client.auth.get_user(token) (newer supabase-py)
        try:
            if hasattr(client.auth, 'get_user'):
                r = client.auth.get_user(token)
                # r may be dict-like with data.user or user
                if isinstance(r, dict):
                    user_candidate = r.get('data') and r['data'].get('user') or r.get('user') or r.get('data')
                else:
                    user_candidate = getattr(r, 'user', None) or getattr(r, 'data', None) or r
            else:
                # older interface
                user_candidate = client.auth.api.get_user(token)
        except Exception:
            user_candidate = get_user_from_access_token(token)

        if not user_candidate:
            return None

        # Extract id from candidate and log
        try:
            if isinstance(user_candidate, dict):
                uid = user_candidate.get('id') or (user_candidate.get('user') and user_candidate['user'].get('id'))
            else:
                uid = getattr(user_candidate, 'id', None) or (getattr(user_candidate, 'user', None) and getattr(user_candidate.user, 'id', None))
            if uid is None:
                return None
            uid_str = str(uid)
            try:
                app.logger.info(f"Brudda, your uid is {uid_str}")
            except Exception:
                print(f"Brudda, your uid is {uid_str}")
            return uid_str
        except Exception:
            return None
    except Exception:
        return None


def _get_admin_client():
    return get_admin_client()


def _mock_players():
    # simple mock player list
    return [
        {"id": 1, "name": "marc", "screenname": "marc_gg"},
        {"id": 2, "name": "aditya", "screenname": "aditya_gg"},
        {"id": 3, "name": "joshuar", "screenname": "joshuar_gg"},
        {"id": 4, "name": "kyle", "screenname": "kyle_gg"},
    ]


@api_bp.route('/health', methods=['GET', 'OPTIONS'])
def health():
    return jsonify({"status": "ok"})


@api_bp.route('/analytics/players', methods=['GET', 'OPTIONS'])
def analytics_players():
    # Try to load from DB models if available, otherwise return mock
    try:
        from db import get_session  # type: ignore
        from models.player import Player  # type: ignore
        from models.sport import Sport  # type: ignore
        session = get_session()
        try:
            rows = session.query(Player).join(Sport).filter(Sport.name == 'GeoGuessr').order_by(Player.id).all()
            out = []
            for p in rows:
                out.append({"id": int(p.id), "name": p.name, "screenname": getattr(p, 'handle', None) or ''})
            return jsonify({"players": out})
        finally:
            session.close()
    except Exception:
        return jsonify({"players": _mock_players()})


@api_bp.route('/pricing/recompute-all', methods=['POST', 'OPTIONS'])
def pricing_recompute_all():
    # Respond to preflight quickly
    if request.method == 'OPTIONS':
        return ('', 200)

    data = request.get_json(force=True) or {}
    thresholds = data.get('thresholds') or []
    margin_bps = data.get('marginBps', 0)
    if not thresholds:
        thresholds = list(range(7500, 23001, 500))

    # Use Supabase-backed recompute
    try:
        from services.pricing_service import recompute_all_lines_supabase  # type: ignore
        result = recompute_all_lines_supabase(thresholds=thresholds, margin_bps=margin_bps)
        print(f"✓ pricing_recompute_all: computed {result.get('inserted')} lines for {len(result.get('results', {}))} players")
        return jsonify({"result": result, "thresholds": thresholds})
    except Exception as e:
        print(f"✗ pricing_recompute_all ERROR: {e}")
        return jsonify({"error": str(e), "thresholds": thresholds}), 500


@api_bp.route('/bets/place', methods=['POST', 'OPTIONS'])
def bets_place():
    if request.method == 'OPTIONS':
        return ('', 200)
    # New secure endpoint: expects Authorization: Bearer <access_token>
    payload = request.get_json(force=True) or {}
    explicit_game_id = payload.get('game_id')

    # Log incoming auth header for debugging
    auth_header = request.headers.get('Authorization') or request.headers.get('authorization')
    app.logger.debug(f"bets_place: Authorization header present? {bool(auth_header)}")

    # If client provided manual user_id + line_id + stake, use server-side DB insert path (models.create_bet_for_user)
    manual_user_id = payload.get('user_id')
    manual_line_id = payload.get('line_id') or payload.get('market')
    manual_stake = payload.get('stake') or payload.get('bet_size') or payload.get('stake')
    manual_side = payload.get('side') or payload.get('over_under') or payload.get('side')

    try:
        # Normalize market early so we can enforce locks for both manual and standard paths
        payload_market = payload.get('market') or payload.get('bet_name') or payload.get('market_name') or None
        # Use normalized human-friendly market label when checking DB (e.g., 'Totals', 'First Guess')
        # We'll pass payload_market as-is to DB helper which lowercases internally

        # Check locks before any insertion (both manual internal insert and supabase path)
        try:
            from database.geo_repo import get_locks  # type: ignore
            lock_state = get_locks(market=payload_market)
            master_locked = bool(lock_state.get('master'))
            market_locked = bool(lock_state.get('market_locked'))
            if master_locked or market_locked:
                return jsonify({"code": "MARKET_LOCKED", "message": "Sorry, betGSIS traders have locked this market for now."}), 403
        except Exception:
            # If lock check fails, fail-open here to avoid accidental blocking; log and continue
            app.logger.exception('Failed to check locks before placing bet; proceeding')

        if manual_user_id and manual_line_id and manual_stake is not None:
            # Use internal model helper to create bet (uses direct DB connection)
            from models.bet import create_bet_for_user  # type: ignore
            created = create_bet_for_user(manual_user_id, manual_line_id, manual_side or 'over', manual_stake)
            return jsonify({'bet': created}), 200

        # Fallback: require Authorization token and use Supabase admin client to insert into bets
        uid = _get_user_from_header(request)
        if not uid:
            return jsonify({"error": "unauthorized"}), 401
        user_id = uid

        # Validate required payload fields for standard bet insertion
        # Expecting primitive fields from frontend: market, point (optional), outcome, bet_size, odds_american
        market = payload.get('market') or payload.get('bet_name') or 'default'
        point = payload.get('point') if payload.get('point') is not None else payload.get('threshold') if payload.get('threshold') is not None else None
        outcome = payload.get('outcome') or payload.get('side') or None
        bet_size_val = payload.get('bet_size') if payload.get('bet_size') is not None else None
        odds_amer = payload.get('odds_american') or payload.get('odds') or None

        # Required: bet_size and odds_american
        if bet_size_val is None or odds_amer is None:
            return jsonify({"error": "invalid payload, bet_size and odds_american are required"}), 400

        

        # determine current game id using geo_game_counter or games table
        client = _get_admin_client()
        if not client:
            return jsonify({"error": "server misconfiguration: supabase client not available"}), 500

        game_id = None
        if explicit_game_id:
            try:
                game_id = int(explicit_game_id)
            except Exception:
                game_id = None
        if game_id is None:
            # Strictly query geo_game_counter for counter_id=1 and pull ONLY current_game_id.
            # Requirements: do not query without counter_id filter; if current_game_id is NULL or
            # no row exists, fallback to game 1. Log the fetched value for debugging.
            try:
                rc = client.table('geo_game_counter').select('current_game_id').eq('counter_id', 1).limit(1).execute()
                rrows = rc.data if hasattr(rc, 'data') else (rc.get('data') if isinstance(rc, dict) else None)
                if rrows and len(rrows) > 0:
                    cg = rrows[0].get('current_game_id')
                    if cg is not None:
                        try:
                            game_id = int(cg)
                        except Exception:
                            game_id = 1
                    else:
                        # explicit NULL in current_game_id -> fallback to game 1
                        game_id = 1
                else:
                    # no row for counter_id=1 -> fallback to game 1
                    game_id = 1
                app.logger.debug(f"geo_game_counter: fetched current_game_id -> game_id={game_id}")
            except Exception:
                # On any error, fallback to game 1 (do not attempt other table fallbacks here)
                game_id = 1

        if game_id is None:
            # fallback: latest game in games table
            try:
                res = client.table('games').select('game_id').order('game_id', desc=True).limit(1).execute()
                rows = res.data if hasattr(res, 'data') else (res.get('data') if isinstance(res, dict) else None)
                if rows and len(rows) > 0:
                    game_id = int(rows[0].get('game_id'))
                else:
                    # create a new game placeholder
                    ins = client.table('games').insert({'game_name': 'auto-created'}).execute()
                    ins_rows = ins.data if hasattr(ins, 'data') else (ins.get('data') if isinstance(ins, dict) else None)
                    if ins_rows and len(ins_rows) > 0:
                        game_id = int(ins_rows[0].get('game_id'))
            except Exception:
                game_id = None

        # Build strict outcome naming according to market rules
        player_name = payload.get('playerName') or payload.get('player_name') or payload.get('player') or None
        # Normalize market string for matching
        mnorm = (market or '').lower()

        # Log incoming payload outcome for debugging
        try:
            app.logger.debug(f"[bets_place] incoming payload.market={market!r} mnorm={mnorm!r} payload.outcome={payload.get('outcome')!r} playerName={player_name!r} point={point!r} outcome_field={outcome!r}")
        except Exception:
            pass

        # Strict handling: prefer the frontend-provided `payload['outcome']` only for
        # the markets explicitly listed below. This prevents broad substring matches
        # from altering other markets while fixing Last Round/First Round/totals behavior.
        outcome_str = None

        # Helper formatters (used as safe fallbacks when payload['outcome'] missing)
        def fmt_totals(name, side, pt):
            side_word = 'Over' if (side and str(side).lower() in ['over', 'yes', 'true']) else 'Under'
            return f"{name}: {side_word} {int(pt) if pt is not None else ''} Points"

        def fmt_first_last(name, side, pt, round_label='First Round'):
            side_word = 'Over' if (side and str(side).lower() in ['over', 'yes', 'true']) else 'Under'
            return f"{name}: {round_label} - {side_word} {int(pt) if pt is not None else ''} Points"

        def fmt_country(name, side):
            yesno = 'YES' if (side and str(side).lower() in ['over', 'yes', 'true']) else 'NO'
            return f"{name}: To Appear - {yesno}"

        # Normalize payload market token for exact matching
        pm = (str(payload_market or '').strip().lower())
        # Strict: First Round guesses
        if pm == 'first-guess' or mnorm == 'first-guess':
            if payload.get('outcome') and isinstance(payload.get('outcome'), str) and payload.get('outcome').strip() != '':
                outcome_str = payload.get('outcome')
            else:
                outcome_str = fmt_first_last(player_name or 'Unknown', outcome, point, round_label='First Round')

        # Strict: Last Round guesses
        elif pm == 'last-guess' or mnorm == 'last-guess':
            if payload.get('outcome') and isinstance(payload.get('outcome'), str) and payload.get('outcome').strip() != '':
                outcome_str = payload.get('outcome')
            else:
                outcome_str = fmt_first_last(player_name or 'Unknown', outcome, point, round_label='Last Round')

        # Strict: Totals market (exact match)
        elif pm == 'totals' or mnorm == 'totals':
            if payload.get('outcome') and isinstance(payload.get('outcome'), str) and payload.get('outcome').strip() != '':
                outcome_str = payload.get('outcome')
            else:
                outcome_str = fmt_totals(player_name or 'Unknown', outcome, point)

        # Strict: Country props / Continent totals
        elif pm == 'country-props' or mnorm == 'country-props' or pm in ('continent totals', 'continent-totals', 'continent totals'):
            # If playerId indicates continent-style (-1) treat as continent totals; else treat as country to appear
            p_id = payload.get('playerId') if 'playerId' in payload else payload.get('player_id') if 'player_id' in payload else payload.get('playerId')
            try:
                p_id_int = int(p_id) if p_id is not None else None
            except Exception:
                p_id_int = None
            # Continent totals (playerId === -1)
            if p_id_int == -1:
                if payload.get('outcome') and isinstance(payload.get('outcome'), str) and payload.get('outcome').strip() != '':
                    outcome_str = payload.get('outcome')
                else:
                    outcome_str = f"{player_name or 'Unknown'}: {('Over' if (outcome and str(outcome).lower() == 'over') else 'Under')} {int(point) if point is not None else ''}"
            else:
                # Country to appear -> prefer verbatim
                if payload.get('outcome') and isinstance(payload.get('outcome'), str) and payload.get('outcome').strip() != '':
                    outcome_str = payload.get('outcome')
                else:
                    outcome_str = fmt_country(player_name or 'Unknown', outcome)

        # Specials: still respect verbatim outcome
        elif pm == 'specials' or mnorm == 'specials':
            outcome_str = payload.get('outcome') or None
        # Ante markets: respect verbatim outcome and use canonical market 'Ante'
        elif pm == 'ante' or mnorm == 'ante':
            outcome_str = payload.get('outcome') or None
        # Moneyline markets: use verbatim outcome from frontend
        elif pm == 'moneyline' or mnorm == 'moneyline':
            outcome_str = payload.get('outcome') or None
        # First Round Continent: use verbatim outcome from frontend
        elif pm == 'first round continent' or mnorm == 'frc' or pm == 'frc':
            outcome_str = payload.get('outcome') or None
        # Zetamac Totals: use verbatim outcome from frontend (includes 0.5 increments)
        elif pm == 'zetamac_totals' or mnorm == 'zetamac_totals' or pm == 'zetamac-totals' or mnorm == 'zetamac-totals':
            outcome_str = payload.get('outcome') or None
        else:
            # Fallback: keep previous behavior but constructed safely. This covers other markets.
            try:
                if 'country' in mnorm or 'appear' in mnorm or 'country-props' in mnorm:
                    outcome_str = fmt_country(player_name or 'Unknown', outcome)
                elif 'first' in mnorm or 'first-guess' in mnorm:
                    outcome_str = fmt_first_last(player_name or 'Unknown', outcome, point, round_label='First Round')
                elif 'last' in mnorm or 'last-guess' in mnorm:
                    outcome_str = fmt_first_last(player_name or 'Unknown', outcome, point, round_label='Last Round')
                else:
                    outcome_str = fmt_totals(player_name or 'Unknown', outcome, point)
            except Exception:
                outcome_str = str(outcome) if outcome is not None else None

        # determine current game id using geo_game_counter counter_id=1 first
        # NOTE: be tolerant of different column names in the counter table. Prefer fields in this order:
        # 'current_game_id', 'game_id', 'current_game', 'current', 'current_id'
        game_id = None
        try:
            # Strictly fetch current_game_id for counter_id=1 and respect NULL -> fallback to 1
            rc = client.table('geo_game_counter').select('current_game_id').eq('counter_id', 1).limit(1).execute()
            rrows = rc.data if hasattr(rc, 'data') else (rc.get('data') if isinstance(rc, dict) else None)
            if rrows and len(rrows) > 0:
                cg = rrows[0].get('current_game_id')
                if cg is not None:
                    try:
                        game_id = int(cg)
                    except Exception:
                        game_id = 1
                else:
                    game_id = 1
            else:
                # no row for counter_id=1 -> fallback to game 1
                game_id = 1
            app.logger.debug(f"geo_game_counter: fetched current_game_id -> game_id={game_id}")
        except Exception:
            game_id = 1

        # insert bet row into canonical bets table using exact schema (primitive values only)
        # Normalize and round provided American odds to book-favoring rules before storing
        rounded_amer_int = None
        rounded_amer_str = None
        try:
            if odds_amer is not None:
                # parse incoming value like '+480' or '480' or -400
                if isinstance(odds_amer, str):
                    tmp = odds_amer.replace('+', '')
                    rounded_amer_int = int(float(tmp))
                else:
                    rounded_amer_int = int(float(odds_amer))
                # apply book-favoring rounding
                rounded_amer_int = format_american_odds(rounded_amer_int) or rounded_amer_int
                rounded_amer_str = f"+{rounded_amer_int}" if rounded_amer_int > 0 else str(int(rounded_amer_int))
        except Exception:
            rounded_amer_int = None
            rounded_amer_str = None

        # For point: try to convert to float, but for moneyline markets keep as string
        point_value = None
        if point is not None:
            try:
                point_value = float(point)
            except (ValueError, TypeError):
                # Keep as string for non-numeric points (e.g., "Naresh vs. Sohan")
                point_value = str(point)
        
        insert_payload = {
            'user_id': str(user_id),
            'market': str(market) if market is not None else None,
            'point': point_value,
            'outcome': str(outcome_str) if outcome_str is not None else None,
            'bet_size': float(bet_size_val),
            'odds_american': str(rounded_amer_str if rounded_amer_str is not None else odds_amer),
            # placed_at left to DB default if possible; supply ISO timestamp for clarity
            'placed_at': None,
            'result': None,
            'bet_pnl': None,
            'game_id': int(game_id),
            'layeur': 'betgsis',
        }

        # set placed_at to current time so DB gets a timestamp value
        try:
            from datetime import datetime
            insert_payload['placed_at'] = datetime.utcnow().isoformat()
        except Exception:
            pass
        # perform insert
        ins = client.table('bets').insert(insert_payload).execute()
        ins_rows = ins.data if hasattr(ins, 'data') else (ins.get('data') if isinstance(ins, dict) else None)
        return jsonify({"bet": ins_rows[0] if ins_rows else insert_payload}), 200
    except Exception as e:
        logging.exception('bets_place error')
        return jsonify({"error": str(e)}), 500


@api_bp.route('/ingest/csv', methods=['POST', 'OPTIONS'])
def ingest_csv():
    if request.method == 'OPTIONS':
        return ('', 200)

    # Accepts multipart/form-data file upload
    if 'file' not in request.files:
        return jsonify({"error": "no file provided"}), 400

    f = request.files['file']
    if f.filename == '':
        return jsonify({"error": "empty filename"}), 400

    try:
        content = f.read().decode('utf-8')
    except Exception:
        # if binary, try streaming
        try:
            content = io.TextIOWrapper(f.stream, encoding='utf-8').read()
        except Exception:
            return jsonify({"error": "failed to read file"}), 400

    reader = csv.DictReader(io.StringIO(content))
    rows = list(reader)
    summary = {
        "filename": f.filename,
        "rows": len(rows),
        "columns": reader.fieldnames or [],
        "sample": rows[:5],
    }

    # best-effort: persist player_points if model exists (non-blocking)
    try:
        from backend.services.ingest_service import persist_player_points_from_rows  # type: ignore
        try:
            persisted = persist_player_points_from_rows(rows)
            summary['persisted'] = persisted
        except Exception:
            pass
    except Exception:
        pass

    return jsonify({"summary": summary})



@api_bp.route('/analytics/player/<int:player_id>/lines', methods=['GET', 'OPTIONS'])
def player_lines(player_id: int):
    # Return lines for a given player from DB if available, else compute mock lines
    try:
        from db import get_session  # type: ignore
        from models.line import Line  # type: ignore
        # optional: try to get player name
        from models.player import get_player_by_id  # type: ignore
        session = get_session()
        try:
            rows = session.query(Line).filter_by(player_id=player_id).all()
            player_name = None
            try:
                p = get_player_by_id(session, player_id)
                if p:
                    player_name = getattr(p, 'name', None) or getattr(p, 'screenname', None)
            except Exception:
                pass

            out = []
            for r in rows:
                out.append({
                    "id": f"line_{r.player_id}_{r.threshold}",
                    "playerId": r.player_id,
                    "playerName": player_name,
                    "threshold": int(r.threshold),
                    "over": {"odds": float(r.odds_over_decimal) if r.odds_over_decimal is not None else None, "american": int(r.odds_over_american) if r.odds_over_american is not None else None},
                    "under": {"odds": float(r.odds_under_decimal) if r.odds_under_decimal is not None else None, "american": int(r.odds_under_american) if r.odds_under_american is not None else None},
                    "probability": {"over": float(r.prob_over) if r.prob_over is not None else None, "under": float(r.prob_under) if r.prob_under is not None else None},
                })
            return jsonify({"lines": out})
        finally:
            session.close()
    except Exception:
        # fallback: compute from pricing_service.price_for_thresholds
        try:
            from services.pricing_service import price_for_thresholds  # type: ignore
            thresholds = list(range(7500, 23001, 500))
            res = price_for_thresholds([player_id], thresholds, model='normal', margin_bps=0)
            lines = []
            # price_for_thresholds returns dict keyed by player id (int) -> {threshold: entry}
            byth = res.get(player_id) or res.get(str(player_id)) or {}
            for t, entry in byth.items():
                lines.append({
                    "id": f"line_{player_id}_{t}",
                    "playerId": player_id,
                    "playerName": None,
                    "threshold": int(t),
                    "over": {"odds": float(entry.get('odds_over_decimal')), "american": int(entry.get('odds_over_american'))},
                    "under": {"odds": float(entry.get('odds_under_decimal')), "american": int(entry.get('odds_under_american'))},
                    "probability": {"over": float(entry.get('prob_over')), "under": float(entry.get('prob_under'))},
                })
            return jsonify({"lines": lines})
        except Exception:
            return jsonify({"lines": []})



@api_bp.route('/pricing/lines', methods=['POST', 'OPTIONS'])
def pricing_lines():
    if request.method == 'OPTIONS':
        return ('', 200)

    data = request.get_json(force=True) or {}
    player_ids = data.get('playerIds') or []
    thresholds = data.get('thresholds') or []
    model = data.get('model', 'normal')
    margin_bps = int(data.get('marginBps', 0) or 0)
    
    print(f"DEBUG pricing_lines: playerIds={player_ids}, thresholds={thresholds}")

    if not player_ids or not thresholds:
        print(f"DEBUG pricing_lines: Empty lists, returning empty results")
        return jsonify({"results": {}})

    try:
        from services.pricing_service import price_for_thresholds  # type: ignorp
        print(f"The margin bps here is: {margin_bps}")
        results = price_for_thresholds(player_ids, thresholds, model=model, margin_bps=margin_bps+200)
        print(f"✓ pricing_lines: computed prices for {len(player_ids)} players x {len(thresholds)} thresholds")
        
        # normalize keys to strings for frontend
        out = {}
        for pid, byth in results.items():
            key = str(pid)
            out[key] = {}
            for t, entry in byth.items():
                out[key][str(t)] = {
                    'prob_over': float(entry.get('prob_over')),
                    'prob_under': float(entry.get('prob_under')),
                    'odds_over_decimal': float(entry.get('odds_over_decimal')),
                    'odds_under_decimal': float(entry.get('odds_under_decimal')),
                    'odds_over_american': str(entry.get('odds_over_american')),
                    'odds_under_american': str(entry.get('odds_under_american')),
                }
        return jsonify({"results": out})
    except Exception as e:
        print(f"✗ pricing_lines ERROR: {e}")
        return jsonify({"error": str(e), "results": {}}), 500



@api_bp.route('/pricing/first-guess', methods=['POST', 'OPTIONS'])
def pricing_first_guess():
    if request.method == 'OPTIONS':
        return ('', 200)

    data = request.get_json(force=True) or {}
    player_ids = data.get('playerIds') or []
    thresholds = data.get('thresholds') or None
    margin_bps = int(data.get('marginBps', 700) or 700)

    print(f"DEBUG pricing_first_guess: playerIds={player_ids}, thresholds={thresholds}")

    if not player_ids:
        print(f"DEBUG pricing_first_guess: empty player_ids")
        return jsonify({"results": {}})

    try:
        from services.pricing_service import price_first_guess_thresholds  # type: ignore
        results = price_first_guess_thresholds(player_ids, thresholds=thresholds, model='normal', margin_bps=margin_bps)

        # normalize keys to strings for frontend
        out = {}
        for pid, byth in results.items():
            key = str(pid)
            out[key] = {}
            for t, entry in byth.items():
                out[key][str(t)] = {
                    'prob_over': float(entry.get('prob_over')),
                    'prob_under': float(entry.get('prob_under')),
                    'odds_over_decimal': float(entry.get('odds_over_decimal')),
                    'odds_under_decimal': float(entry.get('odds_under_decimal')),
                    'odds_over_american': str(entry.get('odds_over_american')),
                    'odds_under_american': str(entry.get('odds_under_american')),
                }
        return jsonify({"results": out})
    except Exception as e:
        print(f"✗ pricing_first_guess ERROR: {e}")
        return jsonify({"error": str(e), "results": {}}), 500


@api_bp.route('/pricing/country-props', methods=['GET', 'POST', 'OPTIONS'])
def pricing_country_props():
    if request.method == 'OPTIONS':
        return ('', 200)

    # Accept optional JSON body for rounds/margin, otherwise use defaults
    try:
        data = request.get_json(force=False) or {}
    except Exception:
        data = {}

    rounds = int(data.get('rounds', 5) or 5)
    margin_bps = int(data.get('marginBps', 700) or 700)

    try:
        from services.pricing_service import price_country_props  # type: ignore
        results = price_country_props(threshold_rounds=rounds, margin_bps=margin_bps) or {}

        # normalize to list for frontend convenience
        out_list = []
        for cid, entry in results.items():
            try:
                out_list.append({
                    'country_id': cid,
                    'country': entry.get('country') or entry.get('name') or None,
                    'freq_pct': float(entry.get('freq_pct') or 0.0),
                    'prob_yes': float(entry.get('prob_yes') or 0.0),
                    'prob_no': float(entry.get('prob_no') or 0.0),
                    'odds_yes_decimal': float(entry.get('odds_yes_decimal') or 0.0),
                    'odds_no_decimal': float(entry.get('odds_no_decimal') or 0.0),
                    'odds_yes_american': str(entry.get('odds_yes_american') or ''),
                    'odds_no_american': str(entry.get('odds_no_american') or ''),
                    'lock': entry.get('lock') or False,
                })
            except Exception:
                # skip malformed entries
                continue
        
        # Sort by freq descending
        out_list.sort(key=lambda x: x.get('freq_pct', 0.0), reverse=True)

        return jsonify({'results': out_list}), 200
    except Exception as e:
        # log error and return JSON with error key but HTTP 200 for frontend compatibility
        print(f"✗ pricing_country_props ERROR: {e}")
        return jsonify({'error': str(e), 'results': []}), 200


@api_bp.route('/pricing/continent-props', methods=['GET', 'OPTIONS'])
def pricing_continent_props():
    if request.method == 'OPTIONS':
        return ('', 200)
    try:
        rounds = int(request.args.get('rounds', 5) or 5)
        from services.pricing_service import continent_markets  # type: ignore
        res = continent_markets(rounds=rounds)
        # Ensure we return a stable JSON shape expected by frontend: { config, continents }
        return jsonify(res), 200
    except Exception as e:
        logging.exception('pricing_continent_props error')
        return jsonify({'error': str(e), 'config': {'rounds': 5}, 'continents': []}), 500


@api_bp.route('/pricing/moneyline', methods=['GET', 'OPTIONS'])
def pricing_moneyline():
    if request.method == 'OPTIONS':
        return ('', 200)
    try:
        rounds = int(request.args.get('rounds', 5) or 5)
        # reuse existing service helper price_moneylines
        from services.pricing_service import price_moneylines  # type: ignore
        res = price_moneylines(simulations=5000, margin_bps=800)
        return jsonify(res), 200
    except Exception as e:
        logging.exception('pricing_moneyline error')
        return jsonify({'error': str(e), 'classic': [], 'firstRound': [], 'lastRound': []}), 500


@api_bp.route('/pricing/specials', methods=['GET', 'OPTIONS'])
def pricing_specials():
    if request.method == 'OPTIONS':
        return ('', 200)
    try:
        # read specials table and return rows
        client = _get_admin_client()
        markets = []
        if client:
            try:
                rc = client.table('specials').select('betid,outcome,odds').order('betid').execute()
                rows = rc.data if hasattr(rc, 'data') else (rc.get('data') if isinstance(rc, dict) else None)
                markets = rows or []
            except Exception:
                app.logger.exception('pricing_specials: failed to read specials table')
                markets = []
        return jsonify({'markets': markets}), 200
    except Exception as e:
        logging.exception('pricing_specials error')
        return jsonify({'error': str(e), 'markets': []}), 500


@api_bp.route('/markets/continents', methods=['GET', 'OPTIONS'])
def markets_continents():
    """Return continent-level Over/Under markets priced by binomial model."""
    if request.method == 'OPTIONS':
        return ('', 200)
    try:
        from services.pricing_service import continent_markets  # type: ignore
        rounds = int(request.args.get('rounds', 5) or 5)
        res = continent_markets(rounds=rounds)
        return jsonify(res), 200
    except Exception as e:
        logging.exception('markets_continents error')
        return jsonify({'error': str(e), 'config': {'rounds': 5}, 'continents': []}), 500


@api_bp.route('/frc/continents', methods=['GET', 'OPTIONS'])
def frc_continents():
    """Endpoint used by frontend First Continent (FRC) list.

    Returns JSON with `rows`: an array of objects containing minimal fields
    the frontend expects: `continent_id`, `continent_name`,
    `probability_first_round` (per-round probability of appearance).
    """
    if request.method == 'OPTIONS':
        return ('', 200)
    try:
        # Query frc table directly from Supabase
        client = _get_admin_client()
        if not client:
            return jsonify({'rows': [], 'error': 'supabase client not available'}), 500
        
        res = client.table('frc').select('continent_id,continent_name,probability_first_round').order('continent_id').execute()
        rows = res.data if hasattr(res, 'data') else (res.get('data') if isinstance(res, dict) else [])
        
        # Return rows directly from DB
        return jsonify({'rows': rows or []}), 200
    except Exception as e:
        logging.exception('frc_continents error')
        return jsonify({'rows': [], 'error': str(e)}), 500


@api_bp.route('/zetamac/totals', methods=['GET', 'OPTIONS'])
def zetamac_totals():
    """Price Zetamac totals using normal CDF from zetamac_players table.
    
    Query params:
    - player_ids: comma-separated list of player IDs (optional)
    - hooks: comma-separated list of hook values (optional)
    - margin_bps: margin in basis points (default 700)
    
    Returns: { players: [ { player_id, name, mean, std_dev, lock, center_hook, default_hook, hooks: [...] } ] }
    """
    if request.method == 'OPTIONS':
        return ('', 200)
    try:
        # Parse query params
        player_ids_str = request.args.get('player_ids')
        hooks_str = request.args.get('hooks')
        margin_bps = int(request.args.get('margin_bps', 700))
        
        player_ids = None
        if player_ids_str:
            try:
                player_ids = [int(x.strip()) for x in player_ids_str.split(',') if x.strip()]
            except Exception:
                player_ids = None
        
        hooks = None
        if hooks_str:
            try:
                hooks = [int(x.strip()) for x in hooks_str.split(',') if x.strip()]
            except Exception:
                hooks = None
        
        # Call pricing service
        from services.pricing_service import price_zetamac_totals  # type: ignore
        result = price_zetamac_totals(player_ids=player_ids, hooks=hooks, margin_bps=margin_bps)
        
        return jsonify(result), 200
    except Exception as e:
        logging.exception('zetamac_totals error')
        return jsonify({'players': [], 'error': str(e)}), 500


@api_bp.route('/zetamac/moneylines', methods=['GET', 'OPTIONS'])
def zetamac_moneylines():
    """Price Zetamac moneylines (head-to-head matchups).
    
    Query params:
    - margin_bps: margin in basis points (default 700)
    
    Returns: { matchups: [ { player1_id, player1_name, player2_id, player2_name, 
                             player1_prob, player2_prob, player1_decimal, player2_decimal,
                             player1_american, player2_american } ] }
    """
    if request.method == 'OPTIONS':
        return ('', 200)
    try:
        margin_bps = int(request.args.get('margin_bps', 700))
        
        # Call pricing service
        from services.pricing_service import price_zetamac_moneylines  # type: ignore
        result = price_zetamac_moneylines(margin_bps=margin_bps)
        
        return jsonify(result), 200
    except Exception as e:
        logging.exception('zetamac_moneylines error')
        return jsonify({'matchups': [], 'error': str(e)}), 500


@api_bp.route('/locks', methods=['GET', 'OPTIONS'])
def locks_status():
    """Return current lock status for master and markets.

    Returns JSON: { master: bool, locks: { lock_name: bool }, market_locked?: bool }
    """
    if request.method == 'OPTIONS':
        return ('', 200)
    if request.method == 'OPTIONS':
        return ('', 200)
    try:
        # Use DB helper to fetch full lock rows including lockid
        from database.geo_repo import fetch_locks_rows  # type: ignore
        rows = fetch_locks_rows()
        markets = []
        master_flag = False
        for r in rows:
            lid = r.get('lockid') if r.get('lockid') is not None else r.get('id') if r.get('id') is not None else None
            market_name = r.get('market') or ''
            locked_val = bool(r.get('locked'))
            markets.append({"lockid": int(lid) if lid is not None else None, "market": market_name, "locked": locked_val})
            if (str(market_name).strip().lower() == 'master'):
                master_flag = master_flag or locked_val

        # Ensure markets are ordered by lockid (stable)
        markets_sorted = sorted(markets, key=lambda x: (x.get('lockid') is None, x.get('lockid') or 0))
        return jsonify({"master": bool(master_flag), "markets": markets_sorted}), 200
    except Exception as e:
        logging.exception('locks_status error')
        return jsonify({'master': False, 'markets': [], 'error': str(e)}), 500


@api_bp.route('/auth/upsert-user', methods=['POST', 'OPTIONS'])
def auth_upsert_user():
    if request.method == 'OPTIONS':
        return ('', 200)

    data = request.get_json(force=True) or {}
    # Support two modes:
    # 1) If caller provides user_id/email/password in body (manual upsert after Supabase signUp), insert into users table directly.
    # 2) If caller sends Authorization: Bearer <token>, use Supabase admin client to upsert screen_name (existing behavior).
    user_id = data.get('user_id')
    email = data.get('email')
    password = data.get('password')

    # Mode 1: manual upsert using provided values (password optional)
    # Accepts { user_id, email, screen_name, password } where password is optional (defaults to 'oauth')
    # Accept either 'screenname' (canonical) or legacy 'screen_name' keys from callers
    screen_name = data.get('screenname') or data.get('screen_name') or data.get('username') or data.get('screenName') or data.get('screen')

    if user_id and email and screen_name:
        try:
            # Normalize password fallback for OAuth-created users
            pw = password if password else 'oauth'
            # Use direct DB connection for manual upsert
            from db import get_conn
            conn = get_conn()
            try:
                with conn.cursor() as cur:
                    # Include role (NOT NULL) and use canonical 'screenname' column
                    sql = '''
                        INSERT INTO users (user_id, email, password, screenname, role, created_at, net_pnl)
                        VALUES (%s, %s, %s, %s, %s, NOW(), 0)
                        ON CONFLICT (user_id) DO UPDATE
                          SET screenname = EXCLUDED.screenname,
                              email = COALESCE(EXCLUDED.email, users.email),
                              password = COALESCE(EXCLUDED.password, users.password)
                    '''
                    cur.execute(sql, (user_id, email, pw, screen_name, 'BETTOR'))
                    conn.commit()
                return jsonify({'success': True}), 200
            finally:
                conn.close()
        except Exception as e:
            logging.exception('auth_upsert_user manual error')
            return jsonify({'error': str(e)}), 500

    # For any other usage, return helpful message
    return jsonify({'error': 'provide at least { user_id, email, screen_name } in request body'}), 400


@api_bp.route('/locks/update', methods=['POST', 'OPTIONS'])
def locks_update():
    if request.method == 'OPTIONS':
        return ('', 200)
    data = request.get_json(force=True) or {}
    lockid = data.get('lockid')
    locked = data.get('locked')
    if lockid is None or locked is None:
        return jsonify({'error': 'lockid and locked required'}), 400
    try:
        from database.geo_repo import update_lock_by_id  # type: ignore
        updated = update_lock_by_id(int(lockid), bool(locked))
        return jsonify({'lock': updated}), 200
    except Exception as e:
        logging.exception('locks_update error')
        return jsonify({'error': str(e)}), 500


@api_bp.route('/trading-locks', methods=['GET', 'OPTIONS'])
def trading_locks_status():
    """Return current lock status for trading games.
    
    Returns JSON: { master: bool, locks: [{ lock_id, lock_name, locked }] }
    """
    if request.method == 'OPTIONS':
        return ('', 200)
    try:
        from database.geo_repo import fetch_trading_locks_rows  # type: ignore
        rows = fetch_trading_locks_rows()
        locks = []
        master_flag = False
        for r in rows:
            lid = r.get('lock_id')
            lock_name = r.get('lock_name') or ''
            locked_val = bool(r.get('locked'))
            locks.append({"lock_id": int(lid) if lid is not None else None, "lock_name": lock_name, "locked": locked_val})
            if (str(lock_name).strip().lower() == 'master'):
                master_flag = master_flag or locked_val
        
        # Ensure locks are ordered by lock_id (stable)
        locks_sorted = sorted(locks, key=lambda x: (x.get('lock_id') is None, x.get('lock_id') or 0))
        return jsonify({"master": bool(master_flag), "locks": locks_sorted}), 200
    except Exception as e:
        logging.exception('trading_locks_status error')
        return jsonify({'master': False, 'locks': [], 'error': str(e)}), 500


@api_bp.route('/trading-locks/update', methods=['POST', 'OPTIONS'])
def trading_locks_update():
    if request.method == 'OPTIONS':
        return ('', 200)
    data = request.get_json(force=True) or {}
    lock_id = data.get('lock_id')
    locked = data.get('locked')
    if lock_id is None or locked is None:
        return jsonify({'error': 'lock_id and locked required'}), 400
    try:
        from database.geo_repo import update_trading_lock_by_id  # type: ignore
        updated = update_trading_lock_by_id(int(lock_id), bool(locked))
        return jsonify({'lock': updated}), 200
    except Exception as e:
        logging.exception('trading_locks_update error')
        return jsonify({'error': str(e)}), 500


@api_bp.route('/bookkeeping/summary', methods=['GET', 'OPTIONS'])
def bookkeeping_summary():
    if request.method == 'OPTIONS':
        return ('', 200)
    client = _get_admin_client()
    if not client:
        return jsonify({'error': 'supabase client missing'}), 500
    try:
        # Fetch relevant bets rows. The bets table uses columns: bet_id, user_id, market, point, outcome,
        # bet_size, odds_american, placed_at, result, game_id
        # NOTE: Do NOT rely on persisted `bet_pnl` column. Compute P&L on the fly from bet_size, odds_american and result.
        rc = client.table('bets').select('user_id,bet_size,odds_american,placed_at,result,layeur').execute()
        rows = rc.data if hasattr(rc, 'data') else (rc.get('data') if isinstance(rc, dict) else None)
        # CRITICAL: only count house bets (layeur = 'betgsis') for bookmaker stats
        all_bets = [r for r in (rows or []) if (r.get('layeur') or 'betgsis') == 'betgsis']

        # settled == result IS NOT NULL
        settled = [r for r in all_bets if r.get('result') is not None]
        # live/active == result IS NULL
        live = [r for r in all_bets if r.get('result') is None]

        # Compute book_pnl as negation of sum of individual bettors' P&L (computed on the fly)
        def american_to_decimal_val(amer):
            try:
                if amer is None:
                    return None
                a = int(str(amer).replace('+', ''))
                if a > 0:
                    return (a / 100.0) + 1.0
                else:
                    return (100.0 / abs(a)) + 1.0
            except Exception:
                return None

        total_players_pnl = 0.0
        settled_wager_volume = 0.0
        for r in settled:
            try:
                stake = float(r.get('bet_size') or 0.0)
            except Exception:
                stake = 0.0
            try:
                odds_raw = r.get('odds_american')
                dec = american_to_decimal_val(odds_raw)
            except Exception:
                dec = None
            try:
                res = r.get('result')
                rlow = str(res).strip().lower() if res is not None else ''
                if rlow == 'win':
                    pnl = (dec - 1.0) * stake if dec is not None else 0.0
                elif rlow == 'loss':
                    pnl = -stake
                elif rlow == 'push':
                    pnl = 0.0
                else:
                    pnl = 0.0
                total_players_pnl += float(pnl)
            except Exception:
                # ignore malformed rows
                continue
            try:
                settled_wager_volume += float(stake or 0.0)
            except Exception:
                continue

        book_pnl = -float(total_players_pnl or 0.0)

        # Counts (only count accepted/bets with placed_at set)
        settled_count = len([r for r in settled if r.get('placed_at')])
        live_count = len([r for r in live if r.get('placed_at')])

        # Live risk calculation
        def american_to_decimal(amer):
            try:
                if amer is None:
                    return None
                a = int(str(amer).replace('+', ''))
                if a > 0:
                    return (a / 100.0) + 1.0
                else:
                    return (100.0 / abs(a)) + 1.0
            except Exception:
                return None

        total_live_risk = 0.0
        live_wager_volume = 0.0
        for r in live:
            try:
                stake = float(r.get('bet_size') or 0.0)
                # accumulate live wager volume
                live_wager_volume += float(stake or 0.0)
                odds_raw = r.get('odds_american')
                amer_int = None
                try:
                    if odds_raw is not None:
                        amer_int = int(str(odds_raw).replace('+', ''))
                except Exception:
                    amer_int = None
                dec = american_to_decimal(amer_int) if amer_int is not None else None
                if dec is not None:
                    net_liability = stake * (dec - 1.0)
                else:
                    # fallback: assume max loss equals stake
                    net_liability = stake
                total_live_risk += float(net_liability)
            except Exception:
                continue

        profit_margin = (book_pnl / settled_wager_volume) if settled_wager_volume > 0 else 0.0

        # Per-user summary: net_pnl per user (sum computed from each settled bet)
        user_map = {}
        for r in settled:
            uid = r.get('user_id')
            if uid is None:
                continue
            try:
                stake = float(r.get('bet_size') or 0.0)
            except Exception:
                stake = 0.0
            try:
                odds_raw = r.get('odds_american')
                dec = american_to_decimal_val(odds_raw)
            except Exception:
                dec = None
            try:
                res = r.get('result')
                rlow = str(res).strip().lower() if res is not None else ''
                if rlow == 'win':
                    pnl = (dec - 1.0) * stake if dec is not None else 0.0
                elif rlow == 'loss':
                    pnl = -stake
                elif rlow == 'push':
                    pnl = 0.0
                else:
                    pnl = 0.0
            except Exception:
                pnl = 0.0
            try:
                key = str(uid)
                user_map.setdefault(key, 0.0)
                user_map[key] += float(pnl)
            except Exception:
                continue

        # Fetch screen names for these users from users table
        users_list = []
        if user_map:
            try:
                uids = list(user_map.keys())
                # supabase expects list types for .in_ queries
                uc = client.table('users').select('user_id,screenname').in_('user_id', uids).execute()
                urows = uc.data if hasattr(uc, 'data') else (uc.get('data') if isinstance(uc, dict) else None)
                urows = urows or []
                screen_map = {str(u.get('user_id')): (u.get('screenname') or '') for u in urows}
                for uid, pnl in sorted(user_map.items(), key=lambda x: x[0]):
                    users_list.append({'user_id': uid, 'screenname': screen_map.get(uid, ''), 'net_pnl': float(pnl)})
            except Exception:
                # fallback: include users without screenname
                for uid, pnl in sorted(user_map.items(), key=lambda x: x[0]):
                    users_list.append({'user_id': uid, 'screenname': '', 'net_pnl': float(pnl)})

        return jsonify({
            'book_pnl': float(book_pnl),
            'settled_count': int(settled_count),
            'live_count': int(live_count),
            'live_risk': float(total_live_risk),
            'live_wager_volume': float(live_wager_volume),
            'settled_wager_volume': float(settled_wager_volume),
            'profit_margin': float(profit_margin),
            'users': users_list,
        }), 200
    except Exception as e:
        logging.exception('bookkeeping_summary error')
        return jsonify({'error': str(e)}), 500


@api_bp.route('/bookkeeping/accounts', methods=['GET', 'OPTIONS'])
def bookkeeping_accounts():
    if request.method == 'OPTIONS':
        return ('', 200)
    client = _get_admin_client()
    if not client:
        return jsonify({'error': 'supabase client missing'}), 500
    try:
        # Fetch users list
        uc = client.table('users').select('user_id,screenname').order('screenname').execute()
        urows = uc.data if hasattr(uc, 'data') else (uc.get('data') if isinstance(uc, dict) else None)
        urows = urows or []

        # Fetch bets to compute unsettled counts and net_pnl on the fly (do not trust users.net_pnl)
        # CRITICAL: only count house bets (layeur = 'betgsis') for bookmaker stats
        brc = client.table('bets').select('user_id,bet_size,odds_american,result,layeur').execute()
        brows_raw = brc.data if hasattr(brc, 'data') else (brc.get('data') if isinstance(brc, dict) else None)
        brows = [b for b in (brows_raw or []) if (b.get('layeur') or 'betgsis') == 'betgsis']

        unsettled = {}
        pnl_map = {}

        def american_to_decimal_val(amer):
            try:
                if amer is None:
                    return None
                a = int(str(amer).replace('+', ''))
                if a > 0:
                    return (a / 100.0) + 1.0
                else:
                    return (100.0 / abs(a)) + 1.0
            except Exception:
                return None

        for b in brows:
            uid = b.get('user_id')
            if uid is None:
                continue
            key = str(uid)
            res = b.get('result')
            # unsettled count
            if res is None:
                unsettled[key] = unsettled.get(key, 0) + 1
            # compute pnl for settled bets only
            if res is not None:
                try:
                    stake = float(b.get('bet_size') or 0.0)
                except Exception:
                    stake = 0.0
                odds_raw = b.get('odds_american')
                dec = american_to_decimal_val(odds_raw)
                rlow = str(res).strip().lower() if res is not None else ''
                pnl = 0.0
                if rlow == 'win':
                    pnl = (dec - 1.0) * stake if dec is not None else 0.0
                elif rlow == 'loss':
                    pnl = -stake
                elif rlow == 'push':
                    pnl = 0.0
                else:
                    pnl = 0.0
                pnl_map[key] = pnl_map.get(key, 0.0) + float(pnl)

        out = []
        for u in urows:
            uid = u.get('user_id')
            key = str(uid) if uid is not None else None
            out.append({'user_id': key, 'screenname': u.get('screenname') or '', 'net_pnl': float(pnl_map.get(key, 0.0)), 'live_unsettled_count': int(unsettled.get(key, 0))})
        return jsonify({'accounts': out}), 200
    except Exception as e:
        logging.exception('bookkeeping_accounts error')
        return jsonify({'error': str(e)}), 500


@api_bp.route('/bookkeeping/all-bets', methods=['GET', 'OPTIONS'])
def bookkeeping_all_bets():
    if request.method == 'OPTIONS':
        return ('', 200)
    client = _get_admin_client()
    if not client:
        return jsonify({'error': 'supabase client missing'}), 500
    try:
        # Order by bet_id descending so newest bets appear first for the bookie view
        rc = client.table('bets').select('bet_id,user_id,market,placed_at,game_id,outcome,bet_size,odds_american,result,layeur').order('bet_id', desc=True).execute()
        rows = rc.data if hasattr(rc, 'data') else (rc.get('data') if isinstance(rc, dict) else None)
        rows = rows or []

        # CRITICAL: filter by layeur for bookmaker stats isolation
        # Default to betgsis-only; pass ?layeur=all to get everything
        layeur_filter = request.args.get('layeur', 'betgsis')
        if layeur_filter != 'all':
            rows = [r for r in rows if (r.get('layeur') or 'betgsis') == layeur_filter]

        def american_to_decimal_val(amer):
            try:
                if amer is None:
                    return None
                a = int(str(amer).replace('+', ''))
                if a > 0:
                    return (a / 100.0) + 1.0
                else:
                    return (100.0 / abs(a)) + 1.0
            except Exception:
                return None

        ny = ZoneInfo('America/New_York')
        out = []
        # Build a mapping of user_id -> screenname for display
        user_ids = list({str(r.get('user_id')) for r in rows if r.get('user_id') is not None})
        user_map = {}
        if user_ids:
            try:
                uc = client.table('users').select('user_id,screenname').in_('user_id', user_ids).execute()
                urows = uc.data if hasattr(uc, 'data') else (uc.get('data') if isinstance(uc, dict) else None)
                urows = urows or []
                for u in urows:
                    if u.get('user_id') is not None:
                        user_map[str(u.get('user_id'))] = u.get('screenname') or ''
            except Exception:
                user_map = {}

        for r in rows:
            stake = float(r.get('bet_size') or 0.0)
            odds_raw = r.get('odds_american')
            dec = american_to_decimal_val(odds_raw)
            res = r.get('result')
            rlow = str(res).strip().lower() if res is not None else ''
            pnl_calc = 0.0
            if rlow == 'win':
                pnl_calc = (dec - 1.0) * stake if dec is not None else 0.0
            elif rlow == 'loss':
                pnl_calc = -stake
            elif rlow == 'push':
                pnl_calc = 0.0
            else:
                pnl_calc = 0.0

            placed_at = r.get('placed_at')
            placed_at_edt = None
            placed_at_utc = None
            try:
                if isinstance(placed_at, str):
                    dt = datetime.fromisoformat(placed_at.replace('Z', '+00:00'))
                elif isinstance(placed_at, datetime):
                    dt = placed_at
                else:
                    dt = None
                if dt is not None:
                    if dt.tzinfo is None:
                        dt = dt.replace(tzinfo=timezone.utc)
                    placed_at_edt = dt.astimezone(ny).strftime('%Y-%m-%d %H:%M:%S %Z')
                    placed_at_utc = dt.astimezone(timezone.utc).isoformat()
            except Exception:
                placed_at_edt = None
                placed_at_utc = None

            out.append({'bet_id': r.get('bet_id'), 'user_id': r.get('user_id'), 'screenname': user_map.get(str(r.get('user_id')), ''), 'placed_at_utc': placed_at_utc or r.get('placed_at'), 'placed_at_edt': placed_at_edt, 'game_id': r.get('game_id'), 'market': r.get('market') or '', 'outcome': r.get('outcome'), 'bet_size': stake, 'odds_american': r.get('odds_american'), 'result': res, 'pnl_calc': float(pnl_calc), 'layeur': r.get('layeur') or 'betgsis'})

        return jsonify({'bets': out}), 200
    except Exception as e:
        logging.exception('bookkeeping_all_bets error')
        return jsonify({'error': str(e)}), 500


@api_bp.route('/bookkeeping/edit-bet', methods=['POST', 'OPTIONS'])
def bookkeeping_edit_bet():
    if request.method == 'OPTIONS':
        return ('', 200)
    data = request.get_json(force=True) or {}
    bet_id = data.get('bet_id')
    if bet_id is None:
        return jsonify({'error': 'bet_id required'}), 400
    client = _get_admin_client()
    if not client:
        return jsonify({'error': 'supabase client missing'}), 500
    try:
        update_fields = {}
        # result
        result = data.get('result')
        if result is not None:
            db_map = {'win': 'Win', 'loss': 'Loss', 'push': 'Push'}
            db_val = db_map.get(result.lower() if isinstance(result, str) else result, result)
            update_fields['result'] = db_val
        # odds_american
        odds = data.get('odds_american')
        if odds is not None:
            update_fields['odds_american'] = str(odds)
        # bet_size
        bet_size = data.get('bet_size')
        if bet_size is not None:
            update_fields['bet_size'] = float(bet_size)
        # outcome
        outcome = data.get('outcome')
        if outcome is not None:
            update_fields['outcome'] = str(outcome)

        if not update_fields:
            return jsonify({'error': 'No fields to update'}), 400

        upd = client.table('bets').update(update_fields).eq('bet_id', int(bet_id)).execute()
        upd_rows = upd.data if hasattr(upd, 'data') else (upd.get('data') if isinstance(upd, dict) else None)
        if upd_rows and len(upd_rows) > 0:
            return jsonify({'success': True, 'bet': upd_rows[0]}), 200
        # fallback: fetch and return
        fetched = client.table('bets').select('*').eq('bet_id', int(bet_id)).limit(1).execute()
        frows = fetched.data if hasattr(fetched, 'data') else (fetched.get('data') if isinstance(fetched, dict) else None)
        if frows and len(frows) > 0:
            return jsonify({'success': True, 'bet': frows[0]}), 200
        return jsonify({'error': 'bet not found'}), 404
    except Exception as e:
        logging.exception('bookkeeping_edit_bet error')
        return jsonify({'error': str(e)}), 500


@api_bp.route('/bookkeeping/add-bet', methods=['POST', 'OPTIONS'])
def bookkeeping_add_bet():
    """Manually add a bet from the bookmaker dashboard."""
    if request.method == 'OPTIONS':
        return ('', 200)
    data = request.get_json(force=True) or {}
    user_id = data.get('user_id')
    market = data.get('market') or 'default'
    outcome = data.get('outcome') or ''
    bet_size = data.get('bet_size')
    odds_american = data.get('odds_american')
    game_id = data.get('game_id')
    placed_at = data.get('placed_at')  # ISO string or None (defaults to now)
    result = data.get('result')  # default None / Pending

    if not user_id or bet_size is None or odds_american is None:
        return jsonify({'error': 'user_id, bet_size, and odds_american are required'}), 400

    client = _get_admin_client()
    if not client:
        return jsonify({'error': 'supabase client missing'}), 500
    try:
        row = {
            'user_id': user_id,
            'market': market,
            'outcome': outcome,
            'bet_size': float(bet_size),
            'odds_american': str(odds_american),
            'layeur': 'betgsis',
        }
        if game_id is not None:
            row['game_id'] = int(game_id)
        if placed_at:
            row['placed_at'] = placed_at
        if result and str(result).strip().lower() not in ('', 'pending'):
            db_map = {'win': 'Win', 'loss': 'Loss', 'push': 'Push'}
            row['result'] = db_map.get(str(result).lower(), result)
        else:
            row['result'] = None

        ins = client.table('bets').insert(row).execute()
        ins_rows = ins.data if hasattr(ins, 'data') else (ins.get('data') if isinstance(ins, dict) else None)
        if ins_rows and len(ins_rows) > 0:
            return jsonify({'success': True, 'bet': ins_rows[0]}), 200
        return jsonify({'success': True}), 200
    except Exception as e:
        logging.exception('bookkeeping_add_bet error')
        return jsonify({'error': str(e)}), 500


@api_bp.route('/bookkeeping/delete-bet', methods=['POST', 'OPTIONS'])
def bookkeeping_delete_bet():
    if request.method == 'OPTIONS':
        return ('', 200)
    data = request.get_json(force=True) or {}
    bet_id = data.get('bet_id')
    if bet_id is None:
        return jsonify({'error': 'bet_id required'}), 400
    client = _get_admin_client()
    if not client:
        return jsonify({'error': 'supabase client missing'}), 500
    try:
        client.table('bets').delete().eq('bet_id', int(bet_id)).execute()
        return jsonify({'success': True}), 200
    except Exception as e:
        logging.exception('bookkeeping_delete_bet error')
        return jsonify({'error': str(e)}), 500


@api_bp.route('/bookkeeping/users', methods=['GET', 'OPTIONS'])
def bookkeeping_users():
    """Return list of users with their bet counts, ordered by bet count descending."""
    if request.method == 'OPTIONS':
        return ('', 200)
    client = _get_admin_client()
    if not client:
        return jsonify({'error': 'supabase client missing'}), 500
    try:
        # Get all users
        uc = client.table('users').select('user_id,screenname').execute()
        urows = uc.data if hasattr(uc, 'data') else (uc.get('data') if isinstance(uc, dict) else None)
        urows = urows or []

        # Get bet counts per user
        bc = client.table('bets').select('user_id').execute()
        brows = bc.data if hasattr(bc, 'data') else (bc.get('data') if isinstance(bc, dict) else None)
        brows = brows or []
        bet_counts = {}
        for b in brows:
            uid = str(b.get('user_id')) if b.get('user_id') else None
            if uid:
                bet_counts[uid] = bet_counts.get(uid, 0) + 1

        out = []
        for u in urows:
            uid = str(u.get('user_id')) if u.get('user_id') else None
            out.append({
                'user_id': uid,
                'screenname': u.get('screenname') or '',
                'bet_count': bet_counts.get(uid, 0)
            })
        out.sort(key=lambda x: x['bet_count'], reverse=True)
        return jsonify({'users': out}), 200
    except Exception as e:
        logging.exception('bookkeeping_users error')
        return jsonify({'error': str(e)}), 500


@api_bp.route('/poker/players', methods=['GET', 'OPTIONS'])
def poker_players():
    """Return all poker players from poker_players table."""
    if request.method == 'OPTIONS':
        return ('', 200)
    client = _get_admin_client()
    if not client:
        return jsonify({'error': 'supabase client missing'}), 500
    try:
        rc = client.table('poker_players').select('player_id,player_name,player_screenname').order('player_name').execute()
        rows = rc.data if hasattr(rc, 'data') else (rc.get('data') if isinstance(rc, dict) else None)
        rows = rows or []
        return jsonify({'players': rows}), 200
    except Exception as e:
        logging.exception('poker_players error')
        return jsonify({'error': str(e)}), 500


# ═══════════════════════════════════════════════════════════════════
# ██  Exchange / P2P Offerings endpoints                          ██
# ═══════════════════════════════════════════════════════════════════

def _convert_odds_to_american(odds_str, odds_format='american'):
    """Convert odds from decimal/probability/american string to canonical american string."""
    try:
        val = float(odds_str)
        fmt = (odds_format or 'american').lower().strip()
        if fmt == 'decimal':
            # decimal 2.5 -> american +150
            if val >= 2.0:
                amer = int(round((val - 1.0) * 100))
                return f'+{amer}'
            else:
                amer = int(round(-100.0 / (val - 1.0)))
                return str(amer)
        elif fmt in ('probability', 'prob', 'implied'):
            # probability 0.4 -> decimal 2.5 -> american +150
            if val <= 0 or val >= 1:
                return str(odds_str)
            dec = 1.0 / val
            if dec >= 2.0:
                amer = int(round((dec - 1.0) * 100))
                return f'+{amer}'
            else:
                amer = int(round(-100.0 / (dec - 1.0)))
                return str(amer)
        else:
            # already american – normalize
            s = str(odds_str).strip()
            a = int(float(s.replace('+', '')))
            return f'+{a}' if a > 0 else str(a)
    except Exception:
        return str(odds_str)


@api_bp.route('/exchange/offerings', methods=['GET', 'OPTIONS'])
def exchange_offerings():
    """List all open offerings with layeur screennames and remaining liquidity."""
    if request.method == 'OPTIONS':
        return ('', 200)
    client = _get_admin_client()
    if not client:
        return jsonify({'error': 'supabase client missing'}), 500
    try:
        rc = client.table('offerings').select('*').order('created_at', desc=True).execute()
        rows = rc.data if hasattr(rc, 'data') else (rc.get('data') if isinstance(rc, dict) else None)
        rows = rows or []

        # Resolve layeur screennames
        layeur_ids = list({str(r.get('layeur_id')) for r in rows if r.get('layeur_id')})
        name_map = {}
        if layeur_ids:
            try:
                uc = client.table('users').select('user_id,screenname').in_('user_id', layeur_ids).execute()
                urows = uc.data if hasattr(uc, 'data') else (uc.get('data') if isinstance(uc, dict) else None)
                for u in (urows or []):
                    if u.get('user_id'):
                        name_map[str(u['user_id'])] = u.get('screenname') or str(u['user_id'])
            except Exception:
                pass

        out = []
        for r in rows:
            lid = str(r.get('layeur_id') or '')
            max_bet = float(r.get('max_bet') or 0)
            filled = float(r.get('filled') or 0)
            out.append({
                'offering_id': r.get('offering_id'),
                'layeur_id': lid,
                'layeur_screenname': name_map.get(lid, lid),
                'bet_name': r.get('market') or '',
                'bet_description': r.get('bet_description') or '',
                'odds_american': r.get('odds_american') or '',
                'max_bet': max_bet,
                'filled': filled,
                'remaining': max(0, max_bet - filled),
                'status': r.get('status') or 'open',
                'created_at': r.get('created_at'),
                'updated_at': r.get('updated_at'),
            })
        return jsonify({'offerings': out}), 200
    except Exception as e:
        logging.exception('exchange_offerings error')
        return jsonify({'error': str(e)}), 500


@api_bp.route('/exchange/create', methods=['POST', 'OPTIONS'])
def exchange_create():
    """Create a new offering. Requires auth. Body: { bet_name, bet_description?, odds, odds_format?, max_bet }"""
    if request.method == 'OPTIONS':
        return ('', 200)
    user = _get_user_from_header(request)
    if not user:
        return jsonify({'error': 'unauthorized'}), 401
    data = request.get_json(force=True) or {}
    bet_name = data.get('bet_name')
    if not bet_name:
        return jsonify({'error': 'bet_name is required'}), 400
    odds_raw = data.get('odds')
    if odds_raw is None:
        return jsonify({'error': 'odds is required'}), 400
    max_bet = data.get('max_bet')
    if max_bet is None or float(max_bet) <= 0:
        return jsonify({'error': 'max_bet must be > 0'}), 400

    odds_format = data.get('odds_format', 'american')
    odds_american = _convert_odds_to_american(odds_raw, odds_format)

    client = _get_admin_client()
    if not client:
        return jsonify({'error': 'supabase client missing'}), 500
    try:
        row = {
            'layeur_id': str(user),
            'market': str(bet_name),
            'outcome': str(bet_name),
            'bet_description': str(data.get('bet_description') or ''),
            'odds_american': odds_american,
            'max_bet': float(max_bet),
            'filled': 0,
            'status': 'open',
        }
        ins = client.table('offerings').insert(row).execute()
        ins_rows = ins.data if hasattr(ins, 'data') else (ins.get('data') if isinstance(ins, dict) else None)
        return jsonify({'success': True, 'offering': ins_rows[0] if ins_rows else row}), 200
    except Exception as e:
        logging.exception('exchange_create error')
        return jsonify({'error': str(e)}), 500


@api_bp.route('/exchange/edit', methods=['POST', 'OPTIONS'])
def exchange_edit():
    """Edit an offering (only by the layeur). Body: { offering_id, odds?, odds_format?, max_bet?, bet_name?, bet_description?, status? }"""
    if request.method == 'OPTIONS':
        return ('', 200)
    user = _get_user_from_header(request)
    if not user:
        return jsonify({'error': 'unauthorized'}), 401
    data = request.get_json(force=True) or {}
    offering_id = data.get('offering_id')
    if not offering_id:
        return jsonify({'error': 'offering_id required'}), 400

    client = _get_admin_client()
    if not client:
        return jsonify({'error': 'supabase client missing'}), 500
    try:
        # Verify ownership
        rc = client.table('offerings').select('*').eq('offering_id', int(offering_id)).limit(1).execute()
        rows = rc.data if hasattr(rc, 'data') else (rc.get('data') if isinstance(rc, dict) else None)
        if not rows or len(rows) == 0:
            return jsonify({'error': 'offering not found'}), 404
        off = rows[0]
        if str(off.get('layeur_id')) != str(user):
            return jsonify({'error': 'forbidden: not your offering'}), 403

        update = {}
        if 'odds' in data and data['odds'] is not None:
            odds_format = data.get('odds_format', 'american')
            update['odds_american'] = _convert_odds_to_american(data['odds'], odds_format)
        if 'max_bet' in data and data['max_bet'] is not None:
            new_max = float(data['max_bet'])
            current_filled = float(off.get('filled') or 0)
            if new_max < current_filled:
                return jsonify({'error': f'max_bet cannot be less than already filled ({current_filled})'}), 400
            update['max_bet'] = new_max
            # Auto-reopen a filled offering when layeur adds more liquidity
            if off.get('status') == 'filled' and new_max > current_filled:
                update['status'] = 'open'
        if 'bet_name' in data:
            update['market'] = str(data['bet_name'])
            update['outcome'] = str(data['bet_name'])
        if 'bet_description' in data:
            update['bet_description'] = str(data.get('bet_description') or '')
        if 'status' in data:
            update['status'] = str(data['status'])

        if not update:
            return jsonify({'error': 'no fields to update'}), 400

        from datetime import datetime, timezone
        update['updated_at'] = datetime.now(timezone.utc).isoformat()
        upd = client.table('offerings').update(update).eq('offering_id', int(offering_id)).execute()
        upd_rows = upd.data if hasattr(upd, 'data') else (upd.get('data') if isinstance(upd, dict) else None)
        return jsonify({'success': True, 'offering': upd_rows[0] if upd_rows else {**off, **update}}), 200
    except Exception as e:
        logging.exception('exchange_edit error')
        return jsonify({'error': str(e)}), 500


@api_bp.route('/exchange/cancel', methods=['POST', 'OPTIONS'])
def exchange_cancel():
    """Cancel an offering (only by the layeur). Body: { offering_id }"""
    if request.method == 'OPTIONS':
        return ('', 200)
    user = _get_user_from_header(request)
    if not user:
        return jsonify({'error': 'unauthorized'}), 401
    data = request.get_json(force=True) or {}
    offering_id = data.get('offering_id')
    if not offering_id:
        return jsonify({'error': 'offering_id required'}), 400

    client = _get_admin_client()
    if not client:
        return jsonify({'error': 'supabase client missing'}), 500
    try:
        rc = client.table('offerings').select('*').eq('offering_id', int(offering_id)).limit(1).execute()
        rows = rc.data if hasattr(rc, 'data') else (rc.get('data') if isinstance(rc, dict) else None)
        if not rows or len(rows) == 0:
            return jsonify({'error': 'offering not found'}), 404
        off = rows[0]
        if str(off.get('layeur_id')) != str(user):
            return jsonify({'error': 'forbidden: not your offering'}), 403

        from datetime import datetime, timezone
        client.table('offerings').update({
            'status': 'cancelled',
            'updated_at': datetime.now(timezone.utc).isoformat()
        }).eq('offering_id', int(offering_id)).execute()
        return jsonify({'success': True}), 200
    except Exception as e:
        logging.exception('exchange_cancel error')
        return jsonify({'error': str(e)}), 500


@api_bp.route('/exchange/lock', methods=['POST', 'OPTIONS'])
def exchange_lock():
    """Lock an offering (only by the layeur). Sets status to 'locked'. Body: { offering_id }"""
    if request.method == 'OPTIONS':
        return ('', 200)
    user = _get_user_from_header(request)
    if not user:
        return jsonify({'error': 'unauthorized'}), 401
    data = request.get_json(force=True) or {}
    offering_id = data.get('offering_id')
    if not offering_id:
        return jsonify({'error': 'offering_id required'}), 400

    client = _get_admin_client()
    if not client:
        return jsonify({'error': 'supabase client missing'}), 500
    try:
        rc = client.table('offerings').select('*').eq('offering_id', int(offering_id)).limit(1).execute()
        rows = rc.data if hasattr(rc, 'data') else (rc.get('data') if isinstance(rc, dict) else None)
        if not rows or len(rows) == 0:
            return jsonify({'error': 'offering not found'}), 404
        off = rows[0]
        if str(off.get('layeur_id')) != str(user):
            return jsonify({'error': 'forbidden: not your offering'}), 403
        if off.get('status') != 'open':
            return jsonify({'error': 'can only lock an open offering'}), 400

        from datetime import datetime, timezone
        client.table('offerings').update({
            'status': 'locked',
            'updated_at': datetime.now(timezone.utc).isoformat()
        }).eq('offering_id', int(offering_id)).execute()
        return jsonify({'success': True}), 200
    except Exception as e:
        logging.exception('exchange_lock error')
        return jsonify({'error': str(e)}), 500


@api_bp.route('/exchange/unlock', methods=['POST', 'OPTIONS'])
def exchange_unlock():
    """Unlock an offering (only by the layeur). Sets status back to 'open'. Body: { offering_id }"""
    if request.method == 'OPTIONS':
        return ('', 200)
    user = _get_user_from_header(request)
    if not user:
        return jsonify({'error': 'unauthorized'}), 401
    data = request.get_json(force=True) or {}
    offering_id = data.get('offering_id')
    if not offering_id:
        return jsonify({'error': 'offering_id required'}), 400

    client = _get_admin_client()
    if not client:
        return jsonify({'error': 'supabase client missing'}), 500
    try:
        rc = client.table('offerings').select('*').eq('offering_id', int(offering_id)).limit(1).execute()
        rows = rc.data if hasattr(rc, 'data') else (rc.get('data') if isinstance(rc, dict) else None)
        if not rows or len(rows) == 0:
            return jsonify({'error': 'offering not found'}), 404
        off = rows[0]
        if str(off.get('layeur_id')) != str(user):
            return jsonify({'error': 'forbidden: not your offering'}), 403
        if off.get('status') != 'locked':
            return jsonify({'error': 'can only unlock a locked offering'}), 400

        from datetime import datetime, timezone
        client.table('offerings').update({
            'status': 'open',
            'updated_at': datetime.now(timezone.utc).isoformat()
        }).eq('offering_id', int(offering_id)).execute()
        return jsonify({'success': True}), 200
    except Exception as e:
        logging.exception('exchange_unlock error')
        return jsonify({'error': str(e)}), 500


@api_bp.route('/exchange/delete', methods=['POST', 'OPTIONS'])
def exchange_delete():
    """Permanently delete an offering (only by the layeur). Body: { offering_id }"""
    if request.method == 'OPTIONS':
        return ('', 200)
    user = _get_user_from_header(request)
    if not user:
        return jsonify({'error': 'unauthorized'}), 401
    data = request.get_json(force=True) or {}
    offering_id = data.get('offering_id')
    if not offering_id:
        return jsonify({'error': 'offering_id required'}), 400

    client = _get_admin_client()
    if not client:
        return jsonify({'error': 'supabase client missing'}), 500
    try:
        rc = client.table('offerings').select('*').eq('offering_id', int(offering_id)).limit(1).execute()
        rows = rc.data if hasattr(rc, 'data') else (rc.get('data') if isinstance(rc, dict) else None)
        if not rows or len(rows) == 0:
            return jsonify({'error': 'offering not found'}), 404
        off = rows[0]
        if str(off.get('layeur_id')) != str(user):
            return jsonify({'error': 'forbidden: not your offering'}), 403

        client.table('offerings').delete().eq('offering_id', int(offering_id)).execute()
        return jsonify({'success': True}), 200
    except Exception as e:
        logging.exception('exchange_delete error')
        return jsonify({'error': str(e)}), 500


@api_bp.route('/exchange/take', methods=['POST', 'OPTIONS'])
def exchange_take():
    """Take (fill) an offering. Body: { offering_id, stake }. Creates a bet in the bets table with layeur = offering owner."""
    if request.method == 'OPTIONS':
        return ('', 200)
    user = _get_user_from_header(request)
    if not user:
        return jsonify({'error': 'unauthorized'}), 401
    data = request.get_json(force=True) or {}
    offering_id = data.get('offering_id')
    stake = data.get('stake')
    if not offering_id or stake is None:
        return jsonify({'error': 'offering_id and stake required'}), 400
    stake = float(stake)
    if stake <= 0:
        return jsonify({'error': 'stake must be > 0'}), 400

    client = _get_admin_client()
    if not client:
        return jsonify({'error': 'supabase client missing'}), 500
    try:
        # Fetch offering
        rc = client.table('offerings').select('*').eq('offering_id', int(offering_id)).limit(1).execute()
        rows = rc.data if hasattr(rc, 'data') else (rc.get('data') if isinstance(rc, dict) else None)
        if not rows or len(rows) == 0:
            return jsonify({'error': 'offering not found'}), 404
        off = rows[0]

        if off.get('status') != 'open':
            return jsonify({'error': 'offering is not open'}), 400

        # Prevent self-betting
        if str(off.get('layeur_id')) == str(user):
            return jsonify({'error': 'cannot bet on your own offering'}), 400

        max_bet = float(off.get('max_bet') or 0)
        filled = float(off.get('filled') or 0)
        remaining = max_bet - filled
        if stake > remaining + 0.001:  # small tolerance for floating point
            return jsonify({'error': f'stake exceeds remaining liquidity ({remaining:.2f})'}), 400

        # Insert bet into bets table with the layeur being the offering creator
        from datetime import datetime, timezone
        bet_row = {
            'user_id': str(user),
            'market': 'Exchange',
            'outcome': off.get('market') or '',
            'bet_size': stake,
            'odds_american': off.get('odds_american') or '+100',
            'placed_at': datetime.now(timezone.utc).isoformat(),
            'result': None,
            'layeur': str(off.get('layeur_id')),
            'game_id': 0,
            'point': '0',
            'bet_pnl': None,
        }
        ins = client.table('bets').insert(bet_row).execute()
        ins_rows = ins.data if hasattr(ins, 'data') else (ins.get('data') if isinstance(ins, dict) else None)

        # Update offering filled amount
        new_filled = filled + stake
        update_data = {
            'filled': new_filled,
            'updated_at': datetime.now(timezone.utc).isoformat()
        }
        if new_filled >= max_bet:
            update_data['status'] = 'filled'
        client.table('offerings').update(update_data).eq('offering_id', int(offering_id)).execute()

        return jsonify({'success': True, 'bet': ins_rows[0] if ins_rows else bet_row, 'remaining': max(0, max_bet - new_filled)}), 200
    except Exception as e:
        logging.exception('exchange_take error')
        return jsonify({'error': str(e)}), 500


@api_bp.route('/exchange/portfolio', methods=['GET', 'OPTIONS'])
def exchange_portfolio():
    """Return all exchange bets + stats for the BOOKIE Exchange Portfolio page."""
    if request.method == 'OPTIONS':
        return ('', 200)
    user = _get_user_from_header(request)
    if not user:
        return jsonify({'error': 'unauthorized'}), 401

    client = _get_admin_client()
    if not client:
        return jsonify({'error': 'supabase client missing'}), 500
    try:
        # Fetch all exchange bets (market = 'Exchange')
        rc = client.table('bets').select('*').eq('market', 'Exchange').order('bet_id', desc=True).execute()
        rows = rc.data if hasattr(rc, 'data') else (rc.get('data') if isinstance(rc, dict) else None)
        bets_list = rows or []

        # Fetch all offerings for stats
        oc = client.table('offerings').select('offering_id,layeur_id,status,filled,max_bet,created_at').execute()
        off_rows = oc.data if hasattr(oc, 'data') else (oc.get('data') if isinstance(oc, dict) else None)
        off_rows = off_rows or []

        # Resolve screennames
        all_uids = list({str(b.get('user_id')) for b in bets_list if b.get('user_id')} |
                        {str(b.get('layeur')) for b in bets_list if b.get('layeur') and b.get('layeur') != 'betgsis'} |
                        {str(o.get('layeur_id')) for o in off_rows if o.get('layeur_id')})
        name_map = {'betgsis': 'betGSIS'}
        if all_uids:
            try:
                uc = client.table('users').select('user_id,screenname').in_('user_id', all_uids).execute()
                urows = uc.data if hasattr(uc, 'data') else (uc.get('data') if isinstance(uc, dict) else None)
                for u in (urows or []):
                    if u.get('user_id'):
                        name_map[str(u['user_id'])] = u.get('screenname') or str(u['user_id'])
            except Exception:
                pass

        # Enrich bets with screennames
        for b in bets_list:
            lay = b.get('layeur') or 'betgsis'
            b['layeur_screenname'] = name_map.get(str(lay), str(lay))
            b['bettor_screenname'] = name_map.get(str(b.get('user_id', '')), '')

        # Stats
        from datetime import datetime, timezone
        today_str = datetime.now(timezone.utc).strftime('%Y-%m-%d')
        total_volume = sum(float(b.get('bet_size') or 0) for b in bets_list)
        volume_today = sum(float(b.get('bet_size') or 0) for b in bets_list
                          if (b.get('placed_at') or '').startswith(today_str))
        open_offerings = sum(1 for o in off_rows if o.get('status') == 'open')
        distinct_layeurs = len({str(o.get('layeur_id')) for o in off_rows if o.get('layeur_id')})
        total_offerings = len(off_rows)

        stats = {
            'total_volume': total_volume,
            'volume_today': volume_today,
            'open_offerings': open_offerings,
            'distinct_layeurs': distinct_layeurs,
            'total_bets': len(bets_list),
            'total_offerings': total_offerings,
        }

        return jsonify({'bets': bets_list, 'stats': stats}), 200
    except Exception as e:
        logging.exception('exchange_portfolio error')
        return jsonify({'error': str(e)}), 500


@api_bp.route('/exchange/delete-bet', methods=['POST', 'OPTIONS'])
def exchange_delete_bet():
    """Delete a P2P bet (only by bettor, only if layeur is NOT betgsis). Body: { bet_id }"""
    if request.method == 'OPTIONS':
        return ('', 200)
    user = _get_user_from_header(request)
    if not user:
        return jsonify({'error': 'unauthorized'}), 401
    data = request.get_json(force=True) or {}
    bet_id = data.get('bet_id')
    if not bet_id:
        return jsonify({'error': 'bet_id required'}), 400

    client = _get_admin_client()
    if not client:
        return jsonify({'error': 'supabase client missing'}), 500
    try:
        # Fetch bet
        rc = client.table('bets').select('*').eq('bet_id', int(bet_id)).limit(1).execute()
        rows = rc.data if hasattr(rc, 'data') else (rc.get('data') if isinstance(rc, dict) else None)
        if not rows or len(rows) == 0:
            return jsonify({'error': 'bet not found'}), 404
        bet = rows[0]

        # Only the bettor can delete
        if str(bet.get('user_id')) != str(user):
            return jsonify({'error': 'forbidden: not your bet'}), 403

        # CRITICAL: cannot delete bets against betGSIS (house bets)
        if (bet.get('layeur') or 'betgsis') == 'betgsis':
            return jsonify({'error': 'cannot delete house bets (layeur: betGSIS)'}), 403

        # Refund liquidity on the offering if bet is unsettled
        if bet.get('result') is None:
            # Try to find and update the offering
            try:
                bet_outcome = bet.get('outcome') or ''
                lay_id = bet.get('layeur') or ''
                # Find matching offering by layeur + market
                orc = client.table('offerings').select('*').eq('layeur_id', lay_id).eq('market', bet_outcome).limit(1).execute()
                orows = orc.data if hasattr(orc, 'data') else (orc.get('data') if isinstance(orc, dict) else None)
                if orows and len(orows) > 0:
                    off = orows[0]
                    new_filled = max(0, float(off.get('filled') or 0) - float(bet.get('bet_size') or 0))
                    from datetime import datetime, timezone
                    upd_data = {'filled': new_filled, 'updated_at': datetime.now(timezone.utc).isoformat()}
                    if off.get('status') == 'closed' and new_filled < float(off.get('max_bet') or 0):
                        upd_data['status'] = 'open'
                    client.table('offerings').update(upd_data).eq('offering_id', off.get('offering_id')).execute()
            except Exception:
                logging.exception('exchange_delete_bet: failed to refund liquidity')

        client.table('bets').delete().eq('bet_id', int(bet_id)).execute()
        return jsonify({'success': True}), 200
    except Exception as e:
        logging.exception('exchange_delete_bet error')
        return jsonify({'error': str(e)}), 500


@api_bp.route('/geo/game-counter', methods=['GET', 'OPTIONS'])
def geo_game_counter_get():
    if request.method == 'OPTIONS':
        return ('', 200)
    client = _get_admin_client()
    if not client:
        return jsonify({'error': 'supabase client missing'}), 500
    try:
        # Prefer counter_id = 1 row
        rc = client.table('geo_game_counter').select('*').eq('counter_id', 1).limit(1).execute()
        rows = rc.data if hasattr(rc, 'data') else (rc.get('data') if isinstance(rc, dict) else None)
        if rows and len(rows) > 0:
            r = rows[0]
            return jsonify({'counter_id': int(r.get('counter_id')), 'current_game_id': int(r.get('current_game_id') or 0), 'updated_at': r.get('updated_at')}), 200
        # fallback to first row ordered
        rc2 = client.table('geo_game_counter').select('*').order('counter_id').limit(1).execute()
        rows2 = rc2.data if hasattr(rc2, 'data') else (rc2.get('data') if isinstance(rc2, dict) else None)
        if rows2 and len(rows2) > 0:
            r2 = rows2[0]
            return jsonify({'counter_id': int(r2.get('counter_id')), 'current_game_id': int(r2.get('current_game_id') or 0), 'updated_at': r2.get('updated_at')}), 200
        return jsonify({'counter_id': None, 'current_game_id': 0, 'updated_at': None}), 200
    except Exception as e:
        logging.exception('geo_game_counter_get error')
        return jsonify({'error': str(e)}), 500


@api_bp.route('/geo/game-counter/increment', methods=['POST', 'OPTIONS'])
def geo_game_counter_increment():
    if request.method == 'OPTIONS':
        return ('', 200)
    client = _get_admin_client()
    if not client:
        return jsonify({'error': 'supabase client missing'}), 500
    try:
        # Fetch row for counter_id=1 or first row
        rc = client.table('geo_game_counter').select('*').eq('counter_id', 1).limit(1).execute()
        rows = rc.data if hasattr(rc, 'data') else (rc.get('data') if isinstance(rc, dict) else None)
        if rows and len(rows) > 0:
            row = rows[0]
            curr = int(row.get('current_game_id') or 0)
            newv = curr + 1
            ts = datetime.now(timezone.utc).isoformat()
            upd = client.table('geo_game_counter').update({'current_game_id': newv, 'updated_at': ts}).eq('counter_id', int(row.get('counter_id'))).execute()
            upd_rows = upd.data if hasattr(upd, 'data') else (upd.get('data') if isinstance(upd, dict) else None)
            if upd_rows and len(upd_rows) > 0:
                row = upd_rows[0]
            else:
                refreshed = client.table('geo_game_counter').select('*').eq('counter_id', int(row.get('counter_id'))).limit(1).execute()
                ref_rows = refreshed.data if hasattr(refreshed, 'data') else (refreshed.get('data') if isinstance(refreshed, dict) else None)
                row = ref_rows[0] if ref_rows else {'counter_id': row.get('counter_id'), 'current_game_id': newv, 'updated_at': ts}
            return jsonify({'counter_id': int(row.get('counter_id')), 'current_game_id': int(row.get('current_game_id') or newv), 'updated_at': row.get('updated_at')}), 200
        # No row for counter_id=1: try to update first row ordered
        rc2 = client.table('geo_game_counter').select('*').order('counter_id').limit(1).execute()
        rows2 = rc2.data if hasattr(rc2, 'data') else (rc2.get('data') if isinstance(rc2, dict) else None)
        if rows2 and len(rows2) > 0:
            row2 = rows2[0]
            curr2 = int(row2.get('current_game_id') or 0)
            newv2 = curr2 + 1
            ts2 = datetime.now(timezone.utc).isoformat()
            upd2 = client.table('geo_game_counter').update({'current_game_id': newv2, 'updated_at': ts2}).eq('counter_id', int(row2.get('counter_id'))).execute()
            upd_rows2 = upd2.data if hasattr(upd2, 'data') else (upd2.get('data') if isinstance(upd2, dict) else None)
            if upd_rows2 and len(upd_rows2) > 0:
                row2 = upd_rows2[0]
            else:
                refreshed2 = client.table('geo_game_counter').select('*').eq('counter_id', int(row2.get('counter_id'))).limit(1).execute()
                ref_rows2 = refreshed2.data if hasattr(refreshed2, 'data') else (refreshed2.get('data') if isinstance(refreshed2, dict) else None)
                row2 = ref_rows2[0] if ref_rows2 else {'counter_id': row2.get('counter_id'), 'current_game_id': newv2, 'updated_at': ts2}
            return jsonify({'counter_id': int(row2.get('counter_id')), 'current_game_id': int(row2.get('current_game_id') or newv2), 'updated_at': row2.get('updated_at')}), 200
        # If no rows exist, create one starting at 1
        ts_new = datetime.now(timezone.utc).isoformat()
        ins = client.table('geo_game_counter').insert({'current_game_id': 1, 'updated_at': ts_new}).execute()
        ins_rows = ins.data if hasattr(ins, 'data') else (ins.get('data') if isinstance(ins, dict) else None)
        if ins_rows and len(ins_rows) > 0:
            r = ins_rows[0]
            return jsonify({'counter_id': int(r.get('counter_id')), 'current_game_id': int(r.get('current_game_id') or 1), 'updated_at': r.get('updated_at')}), 200
        return jsonify({'error': 'failed to increment counter'}), 500
    except Exception as e:
        logging.exception('geo_game_counter_increment error')
        return jsonify({'error': str(e)}), 500


@api_bp.route('/auth/create_user', methods=['POST', 'OPTIONS'])
def auth_create_user():
    """Idempotent endpoint: ensure a row exists in the custom `users` table for the
    authenticated Supabase user. Expects Authorization: Bearer <token> and optional
    JSON body { email?: string, screenname?: string }.

    Inserts a row with schema fields (user_id, email, password, created_at, net_pnl, screenname, role)
    where password is set to 'oauth' and role is set to 'BETTOR'. If a row already exists for the
    user_id or email, the call is a no-op (returns success).
    """
    if request.method == 'OPTIONS':
        return ('', 200)
    try:
        payload = request.get_json(force=True) or {}
        email = payload.get('email')
        # accept 'screenname' in body; if missing derive from email local-part
        screenname = payload.get('screenname') or (email.split('@')[0] if isinstance(email, str) and '@' in email else None)

        uid = _get_user_from_header(request)
        if not uid:
            return jsonify({'error': 'unauthorized'}), 401

        client = _get_admin_client()
        if not client:
            return jsonify({'error': 'supabase client missing'}), 500

        # If a row already exists for this user_id, do nothing
        try:
            rc = client.table('users').select('user_id,email').eq('user_id', uid).limit(1).execute()
            rows = rc.data if hasattr(rc, 'data') else (rc.get('data') if isinstance(rc, dict) else None)
            if rows and len(rows) > 0:
                return jsonify({'success': True, 'user_id': uid, 'was_inaugural_login': False}), 200
        except Exception:
            pass

        # Also avoid duplicate by email
        if email:
            try:
                rc2 = client.table('users').select('user_id,email').eq('email', email).limit(1).execute()
                r2 = rc2.data if hasattr(rc2, 'data') else (rc2.get('data') if isinstance(rc2, dict) else None)
                if r2 and len(r2) > 0:
                    return jsonify({'success': True, 'user_id': r2[0].get('user_id'), 'was_inaugural_login': False}), 200
            except Exception:
                pass

        resolved_screen = screenname or (email.split('@')[0] if email and '@' in email else str(uid))
        insert_payload = {
            'user_id': uid,
            'email': email or None,
            'password': 'oauth',
            'screenname': resolved_screen,
            'role': 'BETTOR',
            'net_pnl': 0,
        }

        try:
            ins = client.table('users').insert(insert_payload).execute()
            return jsonify({'success': True, 'user_id': uid, 'was_inaugural_login': True}), 200
        except Exception as e:
            logging.exception('auth_create_user insert error')
            # If a race created the row already, treat as success
            try:
                rc3 = client.table('users').select('user_id').eq('user_id', uid).limit(1).execute()
                r3 = rc3.data if hasattr(rc3, 'data') else (rc3.get('data') if isinstance(rc3, dict) else None)
                if r3 and len(r3) > 0:
                    return jsonify({'success': True, 'user_id': uid, 'was_inaugural_login': False}), 200
            except Exception:
                pass
            return jsonify({'error': str(e), 'was_inaugural_login': False}), 500
    except Exception as exc:
        logging.exception('auth_create_user error')
        return jsonify({'error': str(exc)}), 500


@api_bp.route('/auth/me', methods=['GET', 'OPTIONS'])
def auth_me():
    if request.method == 'OPTIONS':
        return ('', 200)
    user = _get_user_from_header(request)
    if not user:
        return jsonify({'error': 'unauthorized'}), 401
    client = _get_admin_client()
    if not client:
        return jsonify({'error': 'supabase client missing'}), 500
    try:
        uid = user
        res = client.table('users').select('*').eq('user_id', uid).limit(1).execute()
        rows = res.data if hasattr(res, 'data') else (res.get('data') if isinstance(res, dict) else None)
        if rows and len(rows) > 0:
            return jsonify({'user': rows[0]}), 200
        return jsonify({'user': None}), 200
    except Exception as e:
        logging.exception('auth_me error')
        return jsonify({'error': str(e)}), 500


@api_bp.route('/debug/echo-auth', methods=['GET', 'OPTIONS'])
def debug_echo_auth():
    """Simple debug endpoint that echoes the Authorization header and request headers.
    Use this from the frontend to confirm that requests reach the backend and include the Authorization header.
    """
    if request.method == 'OPTIONS':
        return ('', 200)
    auth = request.headers.get('Authorization') or request.headers.get('authorization')
    headers = {k: v for k, v in request.headers.items()}
    return jsonify({'authorization': auth, 'headers': headers}), 200


@api_bp.route('/games/create', methods=['POST', 'OPTIONS'])
def games_create():
    if request.method == 'OPTIONS':
        return ('', 200)
    client = _get_admin_client()
    if not client:
        return jsonify({'error': 'supabase client missing'}), 500
    try:
        ins = client.table('games').insert({'game_name': 'created-via-api'}).execute()
        rows = ins.data if hasattr(ins, 'data') else (ins.get('data') if isinstance(ins, dict) else None)
        return jsonify({'game': rows[0] if rows else None}), 200
    except Exception as e:
        logging.exception('games_create error')
        return jsonify({'error': str(e)}), 500


@api_bp.route('/games/current', methods=['GET', 'OPTIONS'])
def games_current():
    if request.method == 'OPTIONS':
        return ('', 200)
    client = _get_admin_client()
    if not client:
        return jsonify({'error': 'supabase client missing'}), 500
    try:
        # Prefer geo_game_counter.current_game_id if available
        try:
            rc = client.table('geo_game_counter').select('current_game_id').limit(1).execute()
            rrows = rc.data if hasattr(rc, 'data') else (rc.get('data') if isinstance(rc, dict) else None)
            if rrows and len(rrows) > 0 and rrows[0].get('current_game_id') is not None:
                return jsonify({'game_id': int(rrows[0].get('current_game_id'))}), 200
        except Exception:
            pass

        res = client.table('games').select('game_id').order('game_id', desc=True).limit(1).execute()
        rows = res.data if hasattr(res, 'data') else (res.get('data') if isinstance(res, dict) else None)
        if rows and len(rows) > 0:
            return jsonify({'game_id': int(rows[0].get('game_id'))}), 200
        # create one
        ins = client.table('games').insert({'game_name': 'created-via-api'}).execute()
        ins_rows = ins.data if hasattr(ins, 'data') else (ins.get('data') if isinstance(ins, dict) else None)
        if ins_rows and len(ins_rows) > 0:
            return jsonify({'game_id': int(ins_rows[0].get('game_id'))}), 200
        return jsonify({'game_id': None}), 200
    except Exception as e:
        logging.exception('games_current error')
        return jsonify({'error': str(e)}), 500


@api_bp.route('/portfolio', methods=['GET', 'OPTIONS'])
def portfolio():
    """Compute portfolio statistics for the authenticated user.

    Query params:
      - range: one of '7d', '30d', 'ytd', 'all' (default 'all')

    Returns JSON with: summary, markets (bucketed), time_series (cumulative pnl points)
    """
    if request.method == 'OPTIONS':
        return ('', 200)
    uid = _get_user_from_header(request)
    if not uid:
        return jsonify({'error': 'unauthorized'}), 401

    client = _get_admin_client()
    if not client:
        return jsonify({'error': 'supabase client missing'}), 500

    rng = (request.args.get('range') or 'all').lower()
    from datetime import datetime, timedelta, timezone
    # use timezone-aware UTC datetimes everywhere to avoid naive/aware comparison errors
    now = datetime.now(timezone.utc)
    since = None
    if rng == '7d':
        since = now - timedelta(days=7)
    elif rng == '30d':
        since = now - timedelta(days=30)
    elif rng == 'ytd':
        # start of year as UTC-aware
        since = datetime(now.year, 1, 1, tzinfo=timezone.utc)
    else:
        since = None

    try:
        # fetch bets for this user AS BETTOR (order ascending by placed_at)
        res = client.table('bets').select('*').eq('user_id', uid).order('placed_at').execute()
        rows = res.data if hasattr(res, 'data') else (res.get('data') if isinstance(res, dict) else None)
        bets = rows or []

        # fetch bets where this user is the LAYEUR
        lay_res = client.table('bets').select('*').eq('layeur', str(uid)).order('placed_at').execute()
        lay_rows = lay_res.data if hasattr(lay_res, 'data') else (lay_res.get('data') if isinstance(lay_res, dict) else None)
        lay_bets = lay_rows or []

        # helper to convert american odds to decimal
        def american_to_decimal(amer):
            try:
                if amer is None:
                    return None
                a = int(str(amer).replace('+', ''))
                if a > 0:
                    return (a / 100.0) + 1.0
                else:
                    return (100.0 / abs(a)) + 1.0
            except Exception:
                return None

        # compute per-bet pnl and payout and filter by since
        processed = []
        for b in bets:
            placed_at_raw = b.get('placed_at') or b.get('placedAt')
            placed_at = None
            try:
                if placed_at_raw is None:
                    placed_at = None
                elif isinstance(placed_at_raw, (int, float)):
                    placed_at = datetime.fromtimestamp(float(placed_at_raw), tz=timezone.utc)
                elif isinstance(placed_at_raw, str):
                    # Try ISO first (handles trailing Z)
                    try:
                        placed_at = datetime.fromisoformat(placed_at_raw.replace('Z', '+00:00'))
                    except Exception:
                        # fallback: numeric string timestamp
                        try:
                            placed_at = datetime.fromtimestamp(float(placed_at_raw), tz=timezone.utc)
                        except Exception:
                            placed_at = None
                else:
                    placed_at = None

                # normalize parsed placed_at to timezone-aware UTC
                if placed_at is not None:
                    if placed_at.tzinfo is None:
                        placed_at = placed_at.replace(tzinfo=timezone.utc)
                    else:
                        placed_at = placed_at.astimezone(timezone.utc)
            except Exception:
                placed_at = None

            # filter by range (both sides are timezone-aware UTC)
            if since and placed_at and placed_at < since:
                continue

            stake = float(b.get('bet_size') or b.get('stake') or 0)
            result = b.get('result')
            
            # Match Navbar logic: try multiple odds field names
            dec = None
            if b.get('odds_decimal') or b.get('odds_decimal') == 0:
                dec = float(b.get('odds_decimal'))
            elif b.get('decimal_odds') or b.get('decimal_odds') == 0:
                dec = float(b.get('decimal_odds'))
            else:
                # fallback to american odds conversion
                odds_raw = b.get('odds_american') or b.get('odds') or None
                if odds_raw is not None:
                    try:
                        amer_int = int(str(odds_raw).replace('+', ''))
                        dec = american_to_decimal(amer_int)
                    except Exception:
                        dec = None

            pnl = 0.0
            payout = 0.0
            if result is None:
                pnl = 0.0
                payout = 0.0
            else:
                # Match Navbar logic: convert to lowercase for comparison
                status = str(result).strip().lower()
                if status == 'loss':
                    pnl = -stake
                    payout = 0.0
                elif status == 'win':
                    if dec is not None:
                        payout = stake * dec
                        pnl = payout - stake
                    else:
                        payout = 0.0
                        pnl = 0.0
                elif status == 'push':
                    pnl = 0.0
                    payout = stake
                else:
                    # unknown result treat as active
                    pnl = 0.0
                    payout = 0.0

            # Store original odds for response
            odds_raw = b.get('odds_american') or b.get('odds') or None
            amer_int = None
            if odds_raw is not None:
                try:
                    amer_int = int(str(odds_raw).replace('+', ''))
                except Exception:
                    amer_int = None
            
            processed.append({
                'bet_id': b.get('bet_id') or b.get('id') or None,
                'placed_at': placed_at.isoformat() if placed_at else None,
                'placed_at_dt': placed_at,
                'market': b.get('market'),
                'stake': stake,
                'result': result,
                'odds_american': amer_int,
                'decimal_odds': dec,
                'pnl': float(pnl),
                'payout': float(payout),
            })

        # summary stats - compute financial stats only from settled bets
        total_bets = len(processed)
        settled = [p for p in processed if p.get('result') is not None]
        active = [p for p in processed if p.get('result') is None]

        total_won = sum(1 for p in settled if p.get('result') and str(p.get('result')).strip().lower() == 'win')
        # net pnl should reflect settled bets only
        net_pnl = sum(p.get('pnl', 0.0) for p in settled)
        total_wagered = sum(p.get('stake', 0.0) for p in settled)
        total_winnings = sum(p.get('payout', 0.0) for p in settled)
        # ROI should be net P&L divided by total settled wager volume
        roi = (net_pnl / total_wagered) if total_wagered > 0 else None

        # active wager risk (sum of stakes for active bets)
        active_wager_risk = sum(p.get('stake', 0.0) for p in active)

        # bucket by market (only settled bets)
        markets = {}
        for p in settled:
            m = p.get('market') or 'unknown'
            entry = markets.get(m) or {'market': m, 'bets': 0, 'wins': 0, 'pnl': 0.0}
            entry['bets'] += 1
            # Match lowercase comparison for consistency
            if p.get('result') and str(p.get('result')).strip().lower() == 'win':
                entry['wins'] += 1
            entry['pnl'] += p.get('pnl', 0.0)
            markets[m] = entry

        market_list = []
        for m, v in markets.items():
            win_rate = (v['wins'] / v['bets']) if v['bets'] > 0 else 0.0
            # market-level ROI: use pnl and wagered (we don't track wager per-market separately here; approximate ROI as pnl / wagered if available)
            market_list.append({'market': m, 'bets': v['bets'], 'wins': v['wins'], 'win_rate': win_rate, 'pnl': v['pnl']})

        # time series cumulative pnl (settled bets only)
        ts = []
        cum = 0.0
        # sort settled by placed_at
        processed_sorted = sorted([p for p in settled if p.get('placed_at')], key=lambda x: x.get('placed_at'))
        for p in processed_sorted:
            try:
                t = p.get('placed_at')
                cum += p.get('pnl', 0.0)
                ts.append({'ts': t, 'cum_pnl': cum})
            except Exception:
                continue

        # today's P&L (last 24 hours) from settled bets only
        from datetime import timedelta
        # last 24 hours relative to aware UTC now
        last_24 = now - timedelta(days=1)
        pnl_today = 0.0
        for p in settled:
            padt = p.get('placed_at_dt')
            # padt should be timezone-aware UTC; compare safely
            if padt and padt >= last_24:
                pnl_today += p.get('pnl', 0.0)

        # ── Layeur stats (bets where this user laid the odds) ──
        # Process lay_bets the same way but invert the P&L (layeur wins when bettor loses)
        lay_processed = []
        for b in lay_bets:
            placed_at_raw = b.get('placed_at') or b.get('placedAt')
            placed_at = None
            try:
                if placed_at_raw is None:
                    placed_at = None
                elif isinstance(placed_at_raw, (int, float)):
                    placed_at = datetime.fromtimestamp(float(placed_at_raw), tz=timezone.utc)
                elif isinstance(placed_at_raw, str):
                    try:
                        placed_at = datetime.fromisoformat(placed_at_raw.replace('Z', '+00:00'))
                    except Exception:
                        try:
                            placed_at = datetime.fromtimestamp(float(placed_at_raw), tz=timezone.utc)
                        except Exception:
                            placed_at = None
                if placed_at is not None:
                    if placed_at.tzinfo is None:
                        placed_at = placed_at.replace(tzinfo=timezone.utc)
                    else:
                        placed_at = placed_at.astimezone(timezone.utc)
            except Exception:
                placed_at = None

            if since and placed_at and placed_at < since:
                continue

            stake = float(b.get('bet_size') or b.get('stake') or 0)
            result = b.get('result')
            odds_raw = b.get('odds_american') or b.get('odds') or None
            dec = None
            if odds_raw is not None:
                try:
                    dec = american_to_decimal(int(str(odds_raw).replace('+', '')))
                except Exception:
                    dec = None

            # Bettor's P&L
            bettor_pnl = 0.0
            if result is not None:
                status = str(result).strip().lower()
                if status == 'loss':
                    bettor_pnl = -stake
                elif status == 'win':
                    bettor_pnl = (stake * dec - stake) if dec else 0.0
                elif status == 'push':
                    bettor_pnl = 0.0
            # Layeur's P&L is the inverse
            layeur_pnl = -bettor_pnl

            lay_processed.append({
                'placed_at_dt': placed_at,
                'stake': stake,
                'result': result,
                'pnl': layeur_pnl,
                'market': b.get('market'),
            })

        lay_settled = [p for p in lay_processed if p.get('result') is not None]
        lay_active = [p for p in lay_processed if p.get('result') is None]

        lay_total_bets = len(lay_processed)
        lay_total_won = sum(1 for p in lay_settled if p.get('pnl', 0) > 0)
        lay_net_pnl = sum(p.get('pnl', 0.0) for p in lay_settled)
        lay_total_wagered = sum(p.get('stake', 0.0) for p in lay_settled)
        lay_active_risk = sum(p.get('stake', 0.0) for p in lay_active)
        lay_roi = (lay_net_pnl / lay_total_wagered) if lay_total_wagered > 0 else None

        lay_pnl_today = 0.0
        for p in lay_settled:
            padt = p.get('placed_at_dt')
            if padt and padt >= last_24:
                lay_pnl_today += p.get('pnl', 0.0)

        # Combined NET stats (bettor P&L + layeur P&L)
        combined_net_pnl = net_pnl + lay_net_pnl
        combined_pnl_today = pnl_today + lay_pnl_today

        return jsonify({
            'summary': {
                'total_bets': total_bets,
                'total_won': total_won,
                'net_pnl': net_pnl,
                'total_wagered': total_wagered,
                'total_winnings': total_winnings,
                'roi': roi,
                'active_wager_risk': active_wager_risk,
                'pnl_today': pnl_today,
                # new combined fields
                'combined_net_pnl': combined_net_pnl,
                'combined_pnl_today': combined_pnl_today,
            },
            'layeur_summary': {
                'total_bets_accepted': lay_total_bets,
                'total_won': lay_total_won,
                'net_pnl': lay_net_pnl,
                'total_wagered_accepted': lay_total_wagered,
                'active_risk': lay_active_risk,
                'roi': lay_roi,
                'pnl_today': lay_pnl_today,
            },
            'markets': market_list,
            'time_series': ts,
        }), 200
    except Exception as e:
        logging.exception('portfolio error')
        return jsonify({'error': str(e)}), 500


@api_bp.route('/bets/my', methods=['GET', 'OPTIONS'])
def bets_my():
    if request.method == 'OPTIONS':
        return ('', 200)
    user = _get_user_from_header(request)
    if not user:
        return jsonify({'error': 'unauthorized'}), 401
    client = _get_admin_client()
    if not client:
        return jsonify({'error': 'supabase client missing'}), 500
    try:
        uid = user
        mode = request.args.get('mode', 'bettor')  # 'bettor' or 'layeur'
        # Query canonical bets table, order by placed_at (newer first)
        if mode == 'layeur':
            res = client.table('bets').select('*').eq('layeur', uid).order('placed_at', desc=True).execute()
        else:
            res = client.table('bets').select('*').eq('user_id', uid).order('placed_at', desc=True).execute()
        rows = res.data if hasattr(res, 'data') else (res.get('data') if isinstance(res, dict) else None)
        bets_list = rows or []

        # Resolve layeur and bettor UUIDs to screennames
        all_uids = list({str(b.get('layeur')) for b in bets_list if b.get('layeur') and b.get('layeur') != 'betgsis'} |
                        {str(b.get('user_id')) for b in bets_list if b.get('user_id')})
        name_map = {'betgsis': 'betGSIS'}
        if all_uids:
            try:
                lc = client.table('users').select('user_id,screenname').in_('user_id', all_uids).execute()
                lrows = lc.data if hasattr(lc, 'data') else (lc.get('data') if isinstance(lc, dict) else None)
                for u in (lrows or []):
                    if u.get('user_id'):
                        name_map[str(u['user_id'])] = u.get('screenname') or str(u['user_id'])
            except Exception:
                pass

        for b in bets_list:
            lay = b.get('layeur') or 'betgsis'
            b['layeur'] = lay
            b['layeur_screenname'] = name_map.get(lay, lay)
            b['bettor_screenname'] = name_map.get(str(b.get('user_id', '')), '')

        return jsonify({'bets': bets_list}), 200
    except Exception as e:
        logging.exception('bets_my error')
        return jsonify({'error': str(e)}), 500


@api_bp.route('/bets/active', methods=['GET', 'OPTIONS'])
def bets_active():
    """Return active bets (result IS NULL) for bettor or layeur mode."""
    if request.method == 'OPTIONS':
        return ('', 200)
    user = _get_user_from_header(request)
    if not user:
        return jsonify({'error': 'unauthorized'}), 401
    client = _get_admin_client()
    if not client:
        return jsonify({'error': 'supabase client missing'}), 500
    try:
        uid = user
        mode = request.args.get('mode', 'bettor')  # 'bettor' or 'layeur'
        if mode == 'layeur':
            # Bets where this user is the layeur and not yet settled
            res = client.table('bets').select('*').eq('layeur', uid).is_('result', None).order('bet_id', desc=True).execute()
        else:
            res = client.table('bets').select('*').eq('user_id', uid).is_('result', None).order('bet_id', desc=True).execute()
        rows = res.data if hasattr(res, 'data') else (res.get('data') if isinstance(res, dict) else None)
        bets_list = rows or []

        # Resolve user screennames for display
        all_uids = list({str(b.get('user_id')) for b in bets_list if b.get('user_id')} |
                        {str(b.get('layeur')) for b in bets_list if b.get('layeur') and b.get('layeur') != 'betgsis'})
        name_map = {'betgsis': 'betGSIS'}
        if all_uids:
            try:
                uc = client.table('users').select('user_id,screenname').in_('user_id', all_uids).execute()
                urows = uc.data if hasattr(uc, 'data') else (uc.get('data') if isinstance(uc, dict) else None)
                for u in (urows or []):
                    if u.get('user_id'):
                        name_map[str(u['user_id'])] = u.get('screenname') or str(u['user_id'])
            except Exception:
                pass

        for b in bets_list:
            lay = b.get('layeur') or 'betgsis'
            b['layeur'] = lay
            b['layeur_screenname'] = name_map.get(lay, lay)
            b['bettor_screenname'] = name_map.get(str(b.get('user_id', '')), '')

        return jsonify({'bets': bets_list}), 200
    except Exception as e:
        logging.exception('bets_active error')
        return jsonify({'error': str(e)}), 500


@api_bp.route('/bets/settle', methods=['POST', 'OPTIONS'])
def bets_settle():
    """Settle a bet for the authenticated user. Expects JSON { bet_id, result } where result in ['win','loss','push']"""
    if request.method == 'OPTIONS':
        return ('', 200)
    data = request.get_json(force=True) or {}
    bet_id = data.get('bet_id')
    result = data.get('result')
    if not bet_id or result not in ('win', 'loss', 'push'):
        return jsonify({'error': 'invalid payload'}), 400
    # Map internal result tokens to canonical DB values (DB enforces 'Win'|'Loss'|'Push')
    result_map = {'win': 'Win', 'loss': 'Loss', 'push': 'Push'}
    db_result = result_map.get(result)
    user = _get_user_from_header(request)
    if not user:
        return jsonify({'error': 'unauthorized'}), 401
    client = _get_admin_client()
    if not client:
        return jsonify({'error': 'supabase client missing'}), 500
    try:
        # fetch bet row
        r = client.table('bets').select('*').eq('bet_id', int(bet_id)).limit(1).execute()
        rows = r.data if hasattr(r, 'data') else (r.get('data') if isinstance(r, dict) else None)
        if not rows or len(rows) == 0:
            return jsonify({'error': 'bet not found'}), 404
        bet = rows[0]
        # ensure ownership: bettor OR layeur can settle P2P bets
        bet_owner = str(bet.get('user_id'))
        bet_layeur = str(bet.get('layeur') or 'betgsis')
        is_bettor = bet_owner == str(user)
        is_layeur = bet_layeur == str(user)
        if not is_bettor and not is_layeur:
            return jsonify({'error': 'forbidden'}), 403

        stake = float(bet.get('bet_size') or bet.get('stake') or 0)
        odds_amer_raw = bet.get('odds_american') or bet.get('odds') or None
        # parse american odds to int
        amer_int = None
        if odds_amer_raw is not None:
            try:
                amer_int = int(str(odds_amer_raw).replace('+', ''))
            except Exception:
                amer_int = None

        pnl = 0.0
        if result == 'win':
            if amer_int is not None:
                dec = american_to_decimal(amer_int)
                pnl = stake * (float(dec) - 1.0)
            else:
                # fallback: no american odds -> zero pnl
                pnl = 0.0
        elif result == 'loss':
            pnl = -stake
        elif result == 'push':
            pnl = 0.0

        # update bet row - use canonical DB values
        # Persist only the canonical 'result' field. Do NOT persist bet_pnl (we compute P&L on the fly).
        upd = client.table('bets').update({'result': db_result}).eq('bet_id', int(bet_id)).execute()
        upd_rows = upd.data if hasattr(upd, 'data') else (upd.get('data') if isinstance(upd, dict) else None)
        resp_bet = (upd_rows[0] if upd_rows and len(upd_rows) > 0 else {'bet_id': bet_id, 'result': db_result})
        return jsonify({'bet': resp_bet, 'computed_pnl': float(pnl)}), 200
    except Exception as e:
        logging.exception('bets_settle error')
        return jsonify({'error': str(e)}), 500



@api_bp.route('/analytics/player/<int:player_id>/stats', methods=['GET', 'OPTIONS'])
def player_stats(player_id: int):
    try:
        from db import get_session  # type: ignore
        from models.player_stats import get_player_stats  # type: ignore
        session = get_session()
        try:
            ps = get_player_stats(session, player_id)
            if not ps:
                return jsonify({"stats": None})
            return jsonify({"stats": {"mean": float(ps.mean_points) if ps.mean_points is not None else None, "stddev": float(ps.stddev_points) if ps.stddev_points is not None else None, "sample_size": int(ps.sample_size) if ps.sample_size is not None else None}})
        finally:
            session.close()
    except Exception:
        return jsonify({"stats": None})


@api_bp.route('/geoguessr/totals', methods=['GET', 'OPTIONS'])
def geoguessr_totals():
    """
    Returns list of players from geo_players table and their default threshold (closest 500)
    and an initial pricing for that threshold (over/under odds and probabilities).
    Uses Supabase client (supabase-py) to fetch from geo_players.
    """
    thresholds = list(range(7500, 23001, 500))

    # Strictly use the Supabase geo_players table. Do not fall back to hardcoded
    # mock players so frontend always sees the real DB players and their stats.
    from database.geo_repo import get_geo_players  # type: ignore
    rows = get_geo_players()
    # Log DB access for debugging
    app.logger.info(f"geoguessr_totals: fetched {len(rows)} rows from geo_players")

    players = []
    # import pricing helpers
    from services.pricing_service import normal_cdf, apply_margin, prob_to_decimal, decimal_to_american

    for r in rows:
        pid = int(r.get('player_id') or 0)
        name = r.get('name', '')
        screen = r.get('screenname', '')
        mu = float(r.get('mean_score') or 0) if r.get('mean_score') is not None else None
        sigma = float(r.get('stddev_score') or 0) if r.get('stddev_score') is not None else 0.0

        # Guard against degenerate sigma (0 or very small) which causes step-function CDFs
        if sigma <= 0:
            sigma = max(1.0, abs(mu or 0) * 0.05) if mu else 1.0

        # default threshold = nearest multiple of 500 to mean
        if mu is None:
            default_thresh = 10000
        else:
            default_thresh = int(round(mu / 500.0) * 500)
            default_thresh = max(min(default_thresh, thresholds[-1]), thresholds[0])

        # compute pricing for default threshold using the same math as before
        if mu is None:
            p_over = 0.5
        else:
            cdf = normal_cdf(default_thresh, mu, sigma)
            p_over = max(0.0, 1.0 - cdf)
        p_under = 1.0 - p_over
        p_over_adj, p_under_adj = apply_margin(p_over, p_under, margin_bps=500)
        d_over = prob_to_decimal(p_over_adj)
        d_under = prob_to_decimal(p_under_adj)
        a_over = decimal_to_american(d_over, prob=p_over_adj)
        a_under = decimal_to_american(d_under, prob=p_under_adj)

        players.append({
            'player_id': pid,
            'name': name,
            'screenname': screen,
            'mean_score': mu,
            'stddev_score': sigma,
            'default_threshold': default_thresh,
            'initial': {
                'threshold': default_thresh,
                'prob_over': float(p_over_adj),
                'prob_under': float(p_under_adj),
                'odds_over_decimal': float(d_over),
                'odds_under_decimal': float(d_under),
                'odds_over_american': str(a_over),
                'odds_under_american': str(a_under),
            }
        })

    # include raw_rows for debugging so frontend can show DB contents
    return jsonify({'thresholds': thresholds, 'players': players, 'raw_rows': rows, 'db_ok': True})


@api_bp.route('/geoguessr/price', methods=['POST', 'OPTIONS'])
def geoguessr_price():
    """
    Compute price for a single player and threshold. POST JSON: { playerId: int, threshold: int, marginBps?: int }
    Returns over/under odds and probabilities.
    Uses Supabase client to fetch player data.
    """
    if request.method == 'OPTIONS':
        return ('', 200)

    data = request.get_json(force=True) or {}
    player_id = int(data.get('playerId') or 0)
    threshold = int(data.get('threshold') or 0)
    margin_bps = int(data.get('marginBps') or 700)

    if not player_id or not threshold:
        return jsonify({'error': 'playerId and threshold required'}), 400

    try:
        from database.geo_repo import get_geo_players  # type: ignore
        all_players = get_geo_players()
        # find player by player_id
        player_row = next((p for p in all_players if p.get('player_id') == player_id), None)
        if not player_row:
            print(f"⚠ geoguessr_price: player {player_id} not found in geo_players")
            return jsonify({'error': 'player not found'}), 404
        
        r = player_row
        mu = float(r.get('mean_score') or 0) if r.get('mean_score') is not None else None
        sigma = float(r.get('stddev_score') or 0) if r.get('stddev_score') is not None else 0.0

        from services.pricing_service import normal_cdf, apply_margin, prob_to_decimal, decimal_to_american

        if mu is None:
            p_over = 0.5
        else:
            cdf = normal_cdf(threshold, mu, sigma)
            p_over = max(0.0, 1.0 - cdf)
        p_under = 1.0 - p_over
        p_over_adj, p_under_adj = apply_margin(p_over, p_under, margin_bps=margin_bps)
        d_over = prob_to_decimal(p_over_adj)
        d_under = prob_to_decimal(p_under_adj)
        a_over = decimal_to_american(d_over, prob=p_over_adj)
        a_under = decimal_to_american(d_under, prob=p_under_adj)

        print(f"✓ geoguessr_price: player {player_id} ({r.get('name')}) threshold {threshold} => O:{a_over} U:{a_under}")

        return jsonify({
            'playerId': player_id,
            'threshold': threshold,
            'prob_over': float(p_over_adj),
            'prob_under': float(p_under_adj),
            'odds_over_decimal': float(d_over),
            'odds_under_decimal': float(d_under),
            'odds_over_american': str(a_over),
            'odds_under_american': str(a_under),
        })
    except Exception:
        import traceback
        err = traceback.format_exc()
        print(f"✗ geoguessr_price ERROR: {err}")
        return jsonify({'error': 'internal error', 'trace': err}), 500


@api_bp.route('/moneylines/prices', methods=['GET', 'OPTIONS'])
def moneylines_prices():
    if request.method == 'OPTIONS':
        return ('', 200)
    try:
        from services.pricing_service import price_moneylines  # type: ignore
        app.logger.info('[BOOKIE-HUB] moneylines pricing: starting simulation')
        res = price_moneylines(simulations=5000, margin_bps=850)
        app.logger.info('[BOOKIE-HUB] moneylines pricing: finished simulation')
        return jsonify(res), 200
    except Exception as e:
        logging.exception('moneylines_prices error')
        return jsonify({'error': str(e)}), 500


@api_bp.route('/specials/prices', methods=['GET', 'OPTIONS'])
def specials_prices():
    if request.method == 'OPTIONS':
        return ('', 200)
    try:
        from services.specials_pricing import get_specials_prices  # type: ignore
        app.logger.info('[BOOKIE-HUB] specials pricing: starting')

        # Compute and log combined freq/p for canonical World Cup winners so maintainers can eyeball-check
        try:
            from database.geo_repo import get_geo_countries  # type: ignore
            countries = get_geo_countries() or []
            winners = {'germany', 'france', 'italy', 'united kingdom', 'spain', 'argentina', 'uruguay', 'brazil'}
            combined_pct = 0.0
            for c in countries:
                name = (c.get('country') or '').strip().lower()
                freq = c.get('freq')
                try:
                    f = float(freq) if freq is not None else 0.0
                except Exception:
                    f = 0.0
                if name in winners:
                    combined_pct += max(0.0, f)
            # combined_pct is percent (e.g. 2.4 + ...). Convert to per-round p
            per_round_p = max(0.0, min(1.0, combined_pct / 100.0))
            app.logger.info(f"[BOOKIE-HUB] specials debug: world-cup-winners combined freq_pct={combined_pct} -> per_round_p={per_round_p}")
        except Exception:
            combined_pct = None
            per_round_p = None

        # Instead of running simulations, read the `specials` table (betid, outcome, odds)
        client = _get_admin_client()
        if client:
            try:
                rc = client.table('specials').select('betid,outcome,odds').order('betid').execute()
                rows = rc.data if hasattr(rc, 'data') else (rc.get('data') if isinstance(rc, dict) else None)
                markets = rows or []
            except Exception:
                app.logger.exception('failed to read specials table, falling back to computed markets')
                markets = []
        else:
            markets = []

        app.logger.info('[BOOKIE-HUB] specials pricing: finished (db-backed)')
        resp = {'markets': markets, 'debug': {'worldcup_combined_freq_pct': combined_pct, 'worldcup_per_round_p': per_round_p, 'source': 'db'}}
        return jsonify(resp), 200
    except Exception as e:
        logging.exception('specials_prices error')
        return jsonify({'error': str(e)}), 500


@api_bp.route('/antes', methods=['GET', 'OPTIONS'])
def antes_list():
    """Return rows from Geo_Antes table ordered by ante_id.

    Shape: { rows: [ { ante_id, outcome, odds } ] }
    """
    if request.method == 'OPTIONS':
        return ('', 200)
    try:
        client = _get_admin_client()
        rows = []
        if client:
            try:
                rc = client.table('geo_antes').select('ante_id,outcome,odds').order('ante_id').execute()
                rows = rc.data if hasattr(rc, 'data') else (rc.get('data') if isinstance(rc, dict) else None) or []
            except Exception:
                app.logger.exception('antes_list: failed to read Geo_Antes')
                rows = []
        return jsonify({'rows': rows}), 200
    except Exception as e:
        logging.exception('antes_list error')
        return jsonify({'rows': [], 'error': str(e)}), 500


@api_bp.route('/monopoly/players', methods=['GET', 'OPTIONS'])
def monopoly_players():
    """Fetch all players from monopoly_players table with computed odds.
    
    Returns: { players: [ { player_id, player_name, implied_prob, odds_american } ] }
    """
    if request.method == 'OPTIONS':
        return ('', 200)
    try:
        client = _get_admin_client()
        if not client:
            return jsonify({'error': 'supabase client missing'}), 500
        
        # Fetch all players
        rc = client.table('monopoly_players').select('player_id,player_name').order('player_id').execute()
        rows = rc.data if hasattr(rc, 'data') else (rc.get('data') if isinstance(rc, dict) else None)
        players = rows or []
        
        if not players:
            return jsonify({'players': []}), 200
        
        n = len(players)
        # Implied prob = 1/n, then multiply by 1.03 to apply 3% vig
        base_prob = 1.0 / n
        boosted_prob = base_prob * 1.03
        
        # Convert to decimal odds then to american
        decimal_odds = 1.0 / boosted_prob
        american_odds = decimal_to_american_rounded(decimal_odds)
        
        # Add odds to each player
        result = []
        for p in players:
            result.append({
                'player_id': p.get('player_id'),
                'player_name': p.get('player_name'),
                'implied_prob': round(boosted_prob, 4),
                'decimal_odds': round(decimal_odds, 2),
                'odds_american': american_odds
            })
        
        return jsonify({'players': result}), 200
    except Exception as e:
        logging.exception('monopoly_players error')
        return jsonify({'error': str(e)}), 500


# ═══════════════════════════════════════════════════════════════════
# PARIMUTUEL SYSTEM — Fully independent session-based totalisator
# ═══════════════════════════════════════════════════════════════════

SIDE_COLORS = {
    2: ['#3b82f6', '#ef4444'],
    3: ['#3b82f6', '#ef4444', '#f59e0b'],
    4: ['#3b82f6', '#ef4444', '#f59e0b', '#10b981'],
    5: ['#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6'],
}

def _is_bookie(user_id):
    """Check if user has BOOKIE role."""
    client = _get_admin_client()
    if not client:
        return False
    try:
        rc = client.table('users').select('role').eq('user_id', str(user_id)).limit(1).execute()
        rows = rc.data if hasattr(rc, 'data') else (rc.get('data') if isinstance(rc, dict) else None)
        if rows and len(rows) > 0:
            return (rows[0].get('role') or '').upper() == 'BOOKIE'
    except Exception:
        pass
    return False


def _resolve_screennames(client, user_ids):
    """Resolve a list of user UUIDs to a {uid: screenname} map."""
    name_map = {}
    if not user_ids:
        return name_map
    try:
        uc = client.table('users').select('user_id,screenname').in_('user_id', list(user_ids)).execute()
        urows = uc.data if hasattr(uc, 'data') else (uc.get('data') if isinstance(uc, dict) else None)
        for u in (urows or []):
            if u.get('user_id'):
                name_map[str(u['user_id'])] = u.get('screenname') or str(u['user_id'])
    except Exception:
        pass
    return name_map


# ── Session CRUD ──

@api_bp.route('/pari/session/create', methods=['POST', 'OPTIONS'])
def pari_session_create():
    """Create a new parimutuel session. Body: { name, starting_balance?, min_bet?, max_bet?, mode? }"""
    if request.method == 'OPTIONS':
        return ('', 200)
    user = _get_user_from_header(request)
    if not user:
        return jsonify({'error': 'unauthorized'}), 401
    if not _is_bookie(user):
        return jsonify({'error': 'only BOOKIE can create sessions'}), 403
    data = request.get_json(force=True) or {}
    name = data.get('name', '').strip()
    if not name:
        return jsonify({'error': 'name is required'}), 400
    client = _get_admin_client()
    if not client:
        return jsonify({'error': 'supabase client missing'}), 500
    try:
        row = {
            'name': name,
            'host_id': str(user),
            'status': 'lobby',
            'starting_balance': float(data.get('starting_balance', 100)),
            'min_bet': float(data.get('min_bet', 1)),
            'max_bet': float(data.get('max_bet', 50)),
            'mode': data.get('mode', 'vibe'),
        }
        rc = client.table('pari_sessions').insert(row).execute()
        rows = rc.data if hasattr(rc, 'data') else (rc.get('data') if isinstance(rc, dict) else None)
        return jsonify({'success': True, 'session': rows[0] if rows else row}), 200
    except Exception as e:
        logging.exception('pari_session_create error')
        return jsonify({'error': str(e)}), 500


@api_bp.route('/pari/sessions', methods=['GET', 'OPTIONS'])
def pari_sessions_list():
    """List sessions. ?status=lobby (default) or ?status=all. Lobby sessions visible to everyone."""
    if request.method == 'OPTIONS':
        return ('', 200)
    user = _get_user_from_header(request)
    if not user:
        return jsonify({'error': 'unauthorized'}), 401
    client = _get_admin_client()
    if not client:
        return jsonify({'error': 'supabase client missing'}), 500
    try:
        status_filter = request.args.get('status', 'lobby')
        q = client.table('pari_sessions').select('*').order('created_at', desc=True)
        if status_filter != 'all':
            q = q.eq('status', status_filter)
        rc = q.execute()
        rows = rc.data if hasattr(rc, 'data') else (rc.get('data') if isinstance(rc, dict) else None)
        sessions = rows or []
        # Resolve host screennames
        host_ids = list({str(s.get('host_id')) for s in sessions if s.get('host_id')})
        name_map = _resolve_screennames(client, host_ids)
        for s in sessions:
            s['host_screenname'] = name_map.get(str(s.get('host_id', '')), '')

        # Find which sessions this user is enrolled in
        enrolled_ids = []
        try:
            ec = client.table('pari_participants').select('session_id').eq('user_id', str(user)).execute()
            e_rows = ec.data if hasattr(ec, 'data') else (ec.get('data') if isinstance(ec, dict) else None)
            enrolled_ids = [r['session_id'] for r in (e_rows or [])]
        except Exception:
            pass

        resp = jsonify({'sessions': sessions, 'enrolled_session_ids': enrolled_ids})
        resp.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
        resp.headers['Pragma'] = 'no-cache'
        return resp, 200
    except Exception as e:
        logging.exception('pari_sessions_list error')
        return jsonify({'error': str(e)}), 500


@api_bp.route('/pari/session/<int:session_id>', methods=['GET', 'OPTIONS'])
def pari_session_detail(session_id):
    """Get full session details: session info, participants, current pool, pool history."""
    if request.method == 'OPTIONS':
        return ('', 200)
    user = _get_user_from_header(request)
    if not user:
        return jsonify({'error': 'unauthorized'}), 401
    client = _get_admin_client()
    if not client:
        return jsonify({'error': 'supabase client missing'}), 500
    try:
        # Session
        rc = client.table('pari_sessions').select('*').eq('session_id', session_id).limit(1).execute()
        rows = rc.data if hasattr(rc, 'data') else (rc.get('data') if isinstance(rc, dict) else None)
        if not rows:
            return jsonify({'error': 'session not found'}), 404
        session = rows[0]

        # Participants
        pc = client.table('pari_participants').select('*').eq('session_id', session_id).order('joined_at').execute()
        parts = (pc.data if hasattr(pc, 'data') else (pc.get('data') if isinstance(pc, dict) else None)) or []
        part_uids = [str(p.get('user_id')) for p in parts]
        name_map = _resolve_screennames(client, part_uids + [str(session.get('host_id', ''))])
        for p in parts:
            p['screenname'] = name_map.get(str(p.get('user_id', '')), '')
        session['host_screenname'] = name_map.get(str(session.get('host_id', '')), '')

        # Pools
        plc = client.table('pari_pools').select('*').eq('session_id', session_id).order('pool_number').execute()
        pools = (plc.data if hasattr(plc, 'data') else (plc.get('data') if isinstance(plc, dict) else None)) or []

        # Pool sides for all pools
        pool_ids = [p['pool_id'] for p in pools]
        sides_map = {}
        if pool_ids:
            sc = client.table('pari_pool_sides').select('*').in_('pool_id', pool_ids).execute()
            sides = (sc.data if hasattr(sc, 'data') else (sc.get('data') if isinstance(sc, dict) else None)) or []
            for s in sides:
                sides_map.setdefault(s['pool_id'], []).append(s)

        # Determine if requester is host
        is_host = str(user) == str(session.get('host_id', ''))

        # Wagers — batch fetch all wagers for all pools in ONE query
        all_wagers = []
        if pool_ids:
            wc = client.table('pari_wagers').select('*').in_('pool_id', pool_ids).execute()
            all_wagers = (wc.data if hasattr(wc, 'data') else (wc.get('data') if isinstance(wc, dict) else None)) or []

        # Index wagers by pool_id
        wagers_by_pool = {}
        for w in all_wagers:
            wagers_by_pool.setdefault(w['pool_id'], []).append(w)

        for pool in pools:
            pool['sides'] = sorted(sides_map.get(pool['pool_id'], []), key=lambda x: x.get('side_number', 0))
            pool_wagers = wagers_by_pool.get(pool['pool_id'], [])
            if pool['status'] != 'betting' or is_host:
                for w in pool_wagers:
                    w['screenname'] = name_map.get(str(w.get('user_id', '')), '')
                pool['wagers'] = pool_wagers
            else:
                # During betting, non-host: only return own wager + total count
                own = [w for w in pool_wagers if str(w.get('user_id', '')) == str(user)]
                pool['wagers'] = own
                pool['wager_count'] = len(pool_wagers)

        resp = jsonify({
            'session': session,
            'participants': parts,
            'pools': pools,
            'is_host': is_host,
        })
        resp.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
        resp.headers['Pragma'] = 'no-cache'
        return resp, 200
    except Exception as e:
        logging.exception('pari_session_detail error')
        return jsonify({'error': str(e)}), 500


@api_bp.route('/pari/session/<int:session_id>/join', methods=['POST', 'OPTIONS'])
def pari_session_join(session_id):
    """Join a session. Only works if status=lobby."""
    if request.method == 'OPTIONS':
        return ('', 200)
    user = _get_user_from_header(request)
    if not user:
        return jsonify({'error': 'unauthorized'}), 401
    client = _get_admin_client()
    if not client:
        return jsonify({'error': 'supabase client missing'}), 500
    try:
        rc = client.table('pari_sessions').select('*').eq('session_id', session_id).limit(1).execute()
        rows = rc.data if hasattr(rc, 'data') else (rc.get('data') if isinstance(rc, dict) else None)
        if not rows:
            return jsonify({'error': 'session not found'}), 404
        sess = rows[0]
        if sess.get('status') != 'lobby':
            return jsonify({'error': 'session is no longer accepting players'}), 400
        starting = float(sess.get('starting_balance', 100))
        row = {'session_id': session_id, 'user_id': str(user), 'balance': starting}
        client.table('pari_participants').insert(row).execute()
        return jsonify({'success': True}), 200
    except Exception as e:
        err = str(e)
        if 'duplicate' in err.lower() or '23505' in err:
            return jsonify({'error': 'already joined'}), 409
        logging.exception('pari_session_join error')
        return jsonify({'error': err}), 500


@api_bp.route('/pari/session/<int:session_id>/begin', methods=['POST', 'OPTIONS'])
def pari_session_begin(session_id):
    """Host begins the session — locks registration."""
    if request.method == 'OPTIONS':
        return ('', 200)
    user = _get_user_from_header(request)
    if not user:
        return jsonify({'error': 'unauthorized'}), 401
    if not _is_bookie(user):
        return jsonify({'error': 'only host can begin session'}), 403
    client = _get_admin_client()
    if not client:
        return jsonify({'error': 'supabase client missing'}), 500
    try:
        rc = client.table('pari_sessions').select('*').eq('session_id', session_id).limit(1).execute()
        rows = rc.data if hasattr(rc, 'data') else (rc.get('data') if isinstance(rc, dict) else None)
        if not rows:
            return jsonify({'error': 'session not found'}), 404
        sess = rows[0]
        if str(sess.get('host_id')) != str(user):
            return jsonify({'error': 'not your session'}), 403
        if sess.get('status') != 'lobby':
            return jsonify({'error': 'session already started or concluded'}), 400
        client.table('pari_sessions').update({'status': 'active'}).eq('session_id', session_id).execute()
        return jsonify({'success': True}), 200
    except Exception as e:
        logging.exception('pari_session_begin error')
        return jsonify({'error': str(e)}), 500


@api_bp.route('/pari/session/<int:session_id>/conclude', methods=['POST', 'OPTIONS'])
def pari_session_conclude(session_id):
    """Host concludes the session. Writes net P&L to bets table."""
    if request.method == 'OPTIONS':
        return ('', 200)
    user = _get_user_from_header(request)
    if not user:
        return jsonify({'error': 'unauthorized'}), 401
    if not _is_bookie(user):
        return jsonify({'error': 'only host can conclude'}), 403
    client = _get_admin_client()
    if not client:
        return jsonify({'error': 'supabase client missing'}), 500
    try:
        rc = client.table('pari_sessions').select('*').eq('session_id', session_id).limit(1).execute()
        rows = rc.data if hasattr(rc, 'data') else (rc.get('data') if isinstance(rc, dict) else None)
        if not rows:
            return jsonify({'error': 'session not found'}), 404
        sess = rows[0]
        if str(sess.get('host_id')) != str(user):
            return jsonify({'error': 'not your session'}), 403
        if sess.get('status') != 'active':
            return jsonify({'error': 'session not active'}), 400

        starting = float(sess.get('starting_balance', 100))
        session_name = sess.get('name', f'Pari #{session_id}')

        # Get all participants
        pc = client.table('pari_participants').select('*').eq('session_id', session_id).execute()
        parts = (pc.data if hasattr(pc, 'data') else (pc.get('data') if isinstance(pc, dict) else None)) or []

        # For each participant, compute net and write to bets table
        now_str = datetime.now(timezone.utc).isoformat()
        for p in parts:
            uid = str(p.get('user_id'))
            ending_balance = float(p.get('balance', starting))
            net = ending_balance - starting
            if net > 0:
                result = 'Win'
            elif net < 0:
                result = 'Loss'
            else:
                result = 'Push'
            bet_row = {
                'user_id': uid,
                'market': 'Parimutuel',
                'outcome': session_name,
                'bet_size': round(abs(net), 2) if net != 0 else 0,
                'odds_american': '+100',
                'result': result,
                'game_id': 0,
                'layeur': 'betgsis',
                'placed_at': now_str,
            }
            client.table('bets').insert(bet_row).execute()

        # Mark session concluded
        client.table('pari_sessions').update({
            'status': 'concluded',
            'concluded_at': now_str,
        }).eq('session_id', session_id).execute()

        return jsonify({'success': True}), 200
    except Exception as e:
        logging.exception('pari_session_conclude error')
        return jsonify({'error': str(e)}), 500


@api_bp.route('/pari/session/<int:session_id>/delete', methods=['POST', 'OPTIONS'])
def pari_session_delete(session_id):
    """Delete a session. Only removes from pari tables, never touches bets."""
    if request.method == 'OPTIONS':
        return ('', 200)
    user = _get_user_from_header(request)
    if not user:
        return jsonify({'error': 'unauthorized'}), 401
    if not _is_bookie(user):
        return jsonify({'error': 'only host can delete'}), 403
    client = _get_admin_client()
    if not client:
        return jsonify({'error': 'supabase client missing'}), 500
    try:
        rc = client.table('pari_sessions').select('host_id').eq('session_id', session_id).limit(1).execute()
        rows = rc.data if hasattr(rc, 'data') else (rc.get('data') if isinstance(rc, dict) else None)
        if not rows:
            return jsonify({'error': 'session not found'}), 404
        if str(rows[0].get('host_id')) != str(user):
            return jsonify({'error': 'not your session'}), 403
        # CASCADE deletes participants, pools, sides, wagers
        client.table('pari_sessions').delete().eq('session_id', session_id).execute()
        return jsonify({'success': True}), 200
    except Exception as e:
        logging.exception('pari_session_delete error')
        return jsonify({'error': str(e)}), 500


# ── Pool Management ──

@api_bp.route('/pari/session/<int:session_id>/pool/create', methods=['POST', 'OPTIONS'])
def pari_pool_create(session_id):
    """Host creates a new pool. Body: { num_sides, labels? (array of strings, one per side) }"""
    if request.method == 'OPTIONS':
        return ('', 200)
    user = _get_user_from_header(request)
    if not user:
        return jsonify({'error': 'unauthorized'}), 401
    if not _is_bookie(user):
        return jsonify({'error': 'only host can create pools'}), 403
    client = _get_admin_client()
    if not client:
        return jsonify({'error': 'supabase client missing'}), 500
    try:
        # Verify session
        rc = client.table('pari_sessions').select('*').eq('session_id', session_id).limit(1).execute()
        rows = rc.data if hasattr(rc, 'data') else (rc.get('data') if isinstance(rc, dict) else None)
        if not rows:
            return jsonify({'error': 'session not found'}), 404
        sess = rows[0]
        if str(sess.get('host_id')) != str(user):
            return jsonify({'error': 'not your session'}), 403
        if sess.get('status') != 'active':
            return jsonify({'error': 'session not active'}), 400

        # Check no pool is currently in 'betting' status
        pc = client.table('pari_pools').select('pool_id,status').eq('session_id', session_id).eq('status', 'betting').execute()
        betting_pools = (pc.data if hasattr(pc, 'data') else (pc.get('data') if isinstance(pc, dict) else None)) or []
        if len(betting_pools) > 0:
            return jsonify({'error': 'close current pool before creating a new one'}), 400

        data = request.get_json(force=True) or {}
        num_sides = int(data.get('num_sides', 2))
        if num_sides < 2 or num_sides > 5:
            return jsonify({'error': 'num_sides must be 2-5'}), 400
        labels = data.get('labels', [])

        # Determine pool number
        existing = client.table('pari_pools').select('pool_number').eq('session_id', session_id).order('pool_number', desc=True).limit(1).execute()
        ex_rows = (existing.data if hasattr(existing, 'data') else (existing.get('data') if isinstance(existing, dict) else None)) or []
        next_num = (ex_rows[0]['pool_number'] + 1) if ex_rows else 1

        # Create pool
        pool_row = {
            'session_id': session_id,
            'pool_number': next_num,
            'status': 'betting',
            'num_sides': num_sides,
        }
        prc = client.table('pari_pools').insert(pool_row).execute()
        p_rows = (prc.data if hasattr(prc, 'data') else (prc.get('data') if isinstance(prc, dict) else None)) or []
        pool = p_rows[0]
        pool_id = pool['pool_id']

        # Create sides
        colors = SIDE_COLORS.get(num_sides, SIDE_COLORS[2])
        for i in range(num_sides):
            side_row = {
                'pool_id': pool_id,
                'side_number': i + 1,
                'color': colors[i],
                'label': labels[i] if i < len(labels) else '',
            }
            client.table('pari_pool_sides').insert(side_row).execute()

        return jsonify({'success': True, 'pool': pool}), 200
    except Exception as e:
        logging.exception('pari_pool_create error')
        return jsonify({'error': str(e)}), 500


@api_bp.route('/pari/pool/<int:pool_id>/wager', methods=['POST', 'OPTIONS'])
def pari_pool_wager(pool_id):
    """Place a wager. Body: { side_number, stake }"""
    if request.method == 'OPTIONS':
        return ('', 200)
    user = _get_user_from_header(request)
    if not user:
        return jsonify({'error': 'unauthorized'}), 401
    client = _get_admin_client()
    if not client:
        return jsonify({'error': 'supabase client missing'}), 500
    try:
        # Fetch pool + session
        pc = client.table('pari_pools').select('*').eq('pool_id', pool_id).limit(1).execute()
        p_rows = (pc.data if hasattr(pc, 'data') else (pc.get('data') if isinstance(pc, dict) else None)) or []
        if not p_rows:
            return jsonify({'error': 'pool not found'}), 404
        pool = p_rows[0]
        if pool.get('status') != 'betting':
            return jsonify({'error': 'wagering is closed for this pool'}), 400
        session_id = pool['session_id']

        # Verify participant
        pp = client.table('pari_participants').select('*').eq('session_id', session_id).eq('user_id', str(user)).limit(1).execute()
        pp_rows = (pp.data if hasattr(pp, 'data') else (pp.get('data') if isinstance(pp, dict) else None)) or []
        if not pp_rows:
            return jsonify({'error': 'you are not in this session'}), 403
        participant = pp_rows[0]
        balance = float(participant.get('balance', 0))

        # Session limits
        sc = client.table('pari_sessions').select('min_bet,max_bet').eq('session_id', session_id).limit(1).execute()
        s_rows = (sc.data if hasattr(sc, 'data') else (sc.get('data') if isinstance(sc, dict) else None)) or []
        min_bet = float(s_rows[0].get('min_bet', 1)) if s_rows else 1
        max_bet = float(s_rows[0].get('max_bet', 50)) if s_rows else 50

        data = request.get_json(force=True) or {}
        side_number = int(data.get('side_number', 0))
        stake = float(data.get('stake', 0))

        if side_number < 1 or side_number > pool.get('num_sides', 2):
            return jsonify({'error': f'invalid side_number (1-{pool.get("num_sides", 2)})'}), 400
        if stake < min_bet:
            return jsonify({'error': f'minimum bet is {min_bet}'}), 400
        if stake > max_bet:
            return jsonify({'error': f'maximum bet is {max_bet}'}), 400
        if stake > balance:
            return jsonify({'error': f'insufficient balance ({balance})'}), 400

        wager_row = {
            'pool_id': pool_id,
            'user_id': str(user),
            'side_number': side_number,
            'stake': stake,
        }
        client.table('pari_wagers').insert(wager_row).execute()
        return jsonify({'success': True}), 200
    except Exception as e:
        err = str(e)
        if 'duplicate' in err.lower() or '23505' in err:
            return jsonify({'error': 'you already wagered on this pool'}), 409
        logging.exception('pari_pool_wager error')
        return jsonify({'error': err}), 500


@api_bp.route('/pari/pool/<int:pool_id>/close', methods=['POST', 'OPTIONS'])
def pari_pool_close(pool_id):
    """Host closes wagering. Computes implied odds for each wager."""
    if request.method == 'OPTIONS':
        return ('', 200)
    user = _get_user_from_header(request)
    if not user:
        return jsonify({'error': 'unauthorized'}), 401
    if not _is_bookie(user):
        return jsonify({'error': 'only host can close pools'}), 403
    client = _get_admin_client()
    if not client:
        return jsonify({'error': 'supabase client missing'}), 500
    try:
        pc = client.table('pari_pools').select('*').eq('pool_id', pool_id).limit(1).execute()
        p_rows = (pc.data if hasattr(pc, 'data') else (pc.get('data') if isinstance(pc, dict) else None)) or []
        if not p_rows:
            return jsonify({'error': 'pool not found'}), 404
        pool = p_rows[0]
        if pool.get('status') != 'betting':
            return jsonify({'error': 'pool is not in betting status'}), 400

        # Verify host
        session_id = pool['session_id']
        sc = client.table('pari_sessions').select('host_id').eq('session_id', session_id).limit(1).execute()
        s_rows = (sc.data if hasattr(sc, 'data') else (sc.get('data') if isinstance(sc, dict) else None)) or []
        if not s_rows or str(s_rows[0].get('host_id')) != str(user):
            return jsonify({'error': 'not your session'}), 403

        # Fetch all wagers
        wc = client.table('pari_wagers').select('*').eq('pool_id', pool_id).execute()
        wagers = (wc.data if hasattr(wc, 'data') else (wc.get('data') if isinstance(wc, dict) else None)) or []

        # Compute totalisator
        total_pool = sum(float(w.get('stake', 0)) for w in wagers)
        side_totals = {}
        for w in wagers:
            sn = w.get('side_number')
            side_totals[sn] = side_totals.get(sn, 0) + float(w.get('stake', 0))

        # Update implied odds per wager
        for w in wagers:
            sn = w.get('side_number')
            st = side_totals.get(sn, 0)
            if st > 0 and total_pool > 0:
                implied_decimal = total_pool / st
            else:
                implied_decimal = 1.0
            client.table('pari_wagers').update({
                'implied_odds': round(implied_decimal, 4),
            }).eq('wager_id', w['wager_id']).execute()

        # Close pool
        now_str = datetime.now(timezone.utc).isoformat()
        client.table('pari_pools').update({
            'status': 'closed',
            'closed_at': now_str,
        }).eq('pool_id', pool_id).execute()

        return jsonify({'success': True, 'total_pool': total_pool, 'side_totals': side_totals}), 200
    except Exception as e:
        logging.exception('pari_pool_close error')
        return jsonify({'error': str(e)}), 500


@api_bp.route('/pari/pool/<int:pool_id>/settle', methods=['POST', 'OPTIONS'])
def pari_pool_settle(pool_id):
    """Host settles a pool. Body: { winner_side }. Computes payouts and updates balances."""
    if request.method == 'OPTIONS':
        return ('', 200)
    user = _get_user_from_header(request)
    if not user:
        return jsonify({'error': 'unauthorized'}), 401
    if not _is_bookie(user):
        return jsonify({'error': 'only host can settle'}), 403
    client = _get_admin_client()
    if not client:
        return jsonify({'error': 'supabase client missing'}), 500
    try:
        data = request.get_json(force=True) or {}
        winner_side = int(data.get('winner_side', 0))
        if winner_side < 1:
            return jsonify({'error': 'winner_side is required'}), 400

        pc = client.table('pari_pools').select('*').eq('pool_id', pool_id).limit(1).execute()
        p_rows = (pc.data if hasattr(pc, 'data') else (pc.get('data') if isinstance(pc, dict) else None)) or []
        if not p_rows:
            return jsonify({'error': 'pool not found'}), 404
        pool = p_rows[0]
        if pool.get('status') != 'closed':
            return jsonify({'error': 'pool must be closed before settling'}), 400
        session_id = pool['session_id']

        # Verify host
        sc = client.table('pari_sessions').select('host_id').eq('session_id', session_id).limit(1).execute()
        s_rows = (sc.data if hasattr(sc, 'data') else (sc.get('data') if isinstance(sc, dict) else None)) or []
        if not s_rows or str(s_rows[0].get('host_id')) != str(user):
            return jsonify({'error': 'not your session'}), 403

        # Fetch all wagers
        wc = client.table('pari_wagers').select('*').eq('pool_id', pool_id).execute()
        wagers = (wc.data if hasattr(wc, 'data') else (wc.get('data') if isinstance(wc, dict) else None)) or []

        total_pool = sum(float(w.get('stake', 0)) for w in wagers)
        winning_side_total = sum(float(w.get('stake', 0)) for w in wagers if w.get('side_number') == winner_side)

        # Edge case: if no bets on winning side, or ALL bets on winning side → push everyone
        is_push = (winning_side_total == 0) or (total_pool > 0 and winning_side_total == total_pool)

        # Compute payouts
        for w in wagers:
            stake = float(w.get('stake', 0))
            if is_push:
                # Push: everyone gets their stake back, P&L = 0
                payout = stake
                pnl = 0.0
            elif w.get('side_number') == winner_side:
                payout = (stake / winning_side_total) * total_pool
                pnl = payout - stake
            else:
                payout = 0
                pnl = -stake

            client.table('pari_wagers').update({
                'payout': round(payout, 2),
                'pnl': round(pnl, 2),
            }).eq('wager_id', w['wager_id']).execute()

            # Update participant balance
            pp = client.table('pari_participants').select('balance').eq('session_id', session_id).eq('user_id', str(w.get('user_id'))).limit(1).execute()
            pp_rows = (pp.data if hasattr(pp, 'data') else (pp.get('data') if isinstance(pp, dict) else None)) or []
            if pp_rows:
                old_bal = float(pp_rows[0].get('balance', 0))
                new_bal = round(old_bal + pnl, 2)
                client.table('pari_participants').update({'balance': new_bal}).eq('session_id', session_id).eq('user_id', str(w.get('user_id'))).execute()

        # Mark pool settled
        now_str = datetime.now(timezone.utc).isoformat()
        client.table('pari_pools').update({
            'status': 'settled',
            'winner_side': winner_side,
            'settled_at': now_str,
        }).eq('pool_id', pool_id).execute()

        return jsonify({'success': True}), 200
    except Exception as e:
        logging.exception('pari_pool_settle error')
        return jsonify({'error': str(e)}), 500

