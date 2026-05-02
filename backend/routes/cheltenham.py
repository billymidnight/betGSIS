"""Cheltenham — pari-mutuel horse-racing sessions.

Architecture mirrors `/api/pari/*` (the parimutuel quiz blueprint) but the
pool engine is race-driven: each session can host many sequential races,
each race has its own field of horses + its own auto-generated set of
pools (winner / bridesmaid / backer / winner-nationality / optional
per-horse time buckets). Settlement is totalisator — winning-side
stakes share the entire pool pro-rata.

Race simulation reuses `services.race_sim.run_single_race` exactly as
Churchill Downs does — same numbers, same animation, same physics.
"""
from __future__ import annotations

import logging
import random
import traceback
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from flask import Blueprint, jsonify, request

from database.supabase_client import get_supabase_client
from services.race_sim import run_single_race


cheltenham_bp = Blueprint('cheltenham', __name__, url_prefix='/api/cheltenham')

# Lightweight singleton — used for read-only queries that don't need to
# bypass RLS. Cross-user reads / inserts use the admin client lazy-imported
# from api.routes.
supabase = get_supabase_client()

# Process-local fallback when the cheltenham_races.enabled_pools column
# hasn't been migrated in yet. The host's selection still takes effect on
# release-pools as long as the same backend process is alive between
# /race/draft and /race/.../release-pools (which is always the case in
# the same request batch). Lost on process restart — apply
# `add_enabled_pools_to_races.sql` to make this persistent.
_ENABLED_POOLS_FALLBACK: Dict[int, List[str]] = {}


def _is_missing_column_error(err: Exception) -> bool:
    """Detect the PostgREST 'column not found in schema cache' / 42703 cases.
    Either kicks in when the migration hasn't been applied yet."""
    s = str(err).lower()
    return (
        'pgrst204' in s
        or 'enabled_pools' in s and ('schema cache' in s or 'could not find' in s or 'does not exist' in s or '42703' in s)
    )


# ─── Auth + role helpers ──────────────────────────────────────────────

def _auth_uid(req) -> Optional[str]:
    try:
        from api.routes import _get_user_from_header   # type: ignore
    except Exception:
        return None
    return _get_user_from_header(req)


def _admin_client():
    try:
        from api.routes import _get_admin_client       # type: ignore
        return _get_admin_client()
    except Exception:
        return None


def _is_bookie(user_id: str) -> bool:
    try:
        from api.routes import _is_bookie as _check    # type: ignore
        return bool(_check(user_id))
    except Exception:
        return False


def _resolve_screennames(client, uids: List[str]) -> Dict[str, str]:
    """{user_id: screenname} for a list of uids. Empty dict on error."""
    if not uids:
        return {}
    try:
        unique = list({str(u) for u in uids if u})
        if not unique:
            return {}
        rc = client.table('users').select('user_id, screenname').in_('user_id', unique).execute()
        rows = rc.data if hasattr(rc, 'data') else None
        out: Dict[str, str] = {}
        for r in (rows or []):
            uid = str(r.get('user_id') or '')
            sn  = r.get('screenname')
            if uid and sn:
                out[uid] = sn
        return out
    except Exception:
        logging.exception('_resolve_screennames failed')
        return {}


# ─── Pool engine ──────────────────────────────────────────────────────

def _build_pools_for_field(
    field: List[Dict],
    enable_time_pools: bool = False,
    enabled_pools: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    """Produce the standard set of pari-mutuel pools given a drawn field.

    Default pools (toggle on/off via `enabled_pools` — at least one MUST
    be enabled):
      • winner               — pick the P1 horse
      • bridesmaid           — pick the P2 horse
      • backer               — pick the back-marker
      • winner_nationality   — only listed when the field has ≥ 2 distinct
                                ISO country codes

    Always-conditional:
      • time_bucket_horse    — fires for 2 random horses when the host
                                enabled `enable_time_pools` on the session
    """
    horse_ids = [int(h['horse_id']) for h in field]
    horse_ids_str = [str(h) for h in horse_ids]

    enabled = set(
        enabled_pools
        if enabled_pools is not None
        else ['winner', 'bridesmaid', 'backer', 'winner_nationality']
    )

    pools: List[Dict[str, Any]] = []

    if 'winner' in enabled:
        pools.append({'pool_kind': 'winner',     'payload_json': {'horse_ids': horse_ids}})
    if 'bridesmaid' in enabled:
        pools.append({'pool_kind': 'bridesmaid', 'payload_json': {'horse_ids': horse_ids}})
    if 'backer' in enabled:
        pools.append({'pool_kind': 'backer',     'payload_json': {'horse_ids': horse_ids}})

    countries = sorted({str(h.get('country') or '').upper() for h in field if h.get('country')})
    countries = [c for c in countries if c]
    if 'winner_nationality' in enabled and len(countries) >= 2:
        pools.append({
            'pool_kind': 'winner_nationality',
            'payload_json': {'countries': countries},
        })

    if enable_time_pools and len(horse_ids) >= 1:
        # Pick 2 random horses (or 1 if the field is small).
        n = min(2, len(horse_ids))
        pick_idx = random.sample(range(len(horse_ids)), k=n)
        # Buckets in seconds — spans the natural finish-time band for a
        # 1500-length race at dilation 2 (≈9-14s baseline). Larger / longer
        # races may have different bands, but bucket boundaries are
        # absolute seconds, so the engine doesn't need to scale them.
        buckets = [
            {'id': 'b1', 'lo': 0.0,  'hi': 10.0, 'label': 'under 10s'},
            {'id': 'b2', 'lo': 10.0, 'hi': 12.0, 'label': '10 – 12s'},
            {'id': 'b3', 'lo': 12.0, 'hi': 14.0, 'label': '12 – 14s'},
            {'id': 'b4', 'lo': 14.0, 'hi': 9999, 'label': 'over 14s'},
        ]
        for idx in pick_idx:
            h = field[idx]
            pools.append({
                'pool_kind': 'time_bucket_horse',
                'payload_json': {
                    'horse_id':       int(h['horse_id']),
                    'horse_full_name': h.get('full_name'),
                    'horse_saddle':    h.get('saddle_name'),
                    'horse_country':   h.get('country'),
                    'silks_color':     h.get('silks_color'),
                    'buckets':         buckets,
                },
            })

    # Avoid the (n=0) Python error of horse_ids_str being unused — used
    # downstream by selection_key validation in /wager.
    _ = horse_ids_str
    return pools


def _settle_pool(pool: Dict, wagers: List[Dict], trajectory: Dict) -> List[Dict]:
    """Compute payout/pnl/implied_odds for every wager in a pool given
    today's trajectory. Returns the updated wager rows (ready to upsert).
    Sets `pool['winner_key']` to the resolved canonical winner.
    """
    finishes = trajectory.get('finishes') or []
    finish_order = trajectory.get('finish_order') or []
    field_by_id = {int(f['horse_id']): f for f in finishes}

    kind = pool['pool_kind']
    payload = pool.get('payload_json') or {}

    if kind == 'winner':
        winner_key = str(finish_order[0]) if finish_order else None

    elif kind == 'bridesmaid':
        winner_key = str(finish_order[1]) if len(finish_order) > 1 else None

    elif kind == 'backer':
        # Last place — finish_order is sorted P1..PN.
        winner_key = str(finish_order[-1]) if finish_order else None

    elif kind == 'winner_nationality':
        win_id = finish_order[0] if finish_order else None
        win_country = None
        if win_id is not None:
            for h_full in (payload.get('field') or []):  # ignore — field comes from race
                pass
            # Country lives on the wagers' selection_key options; we
            # need to look it up from the race's field_json. The pool
            # row carries it indirectly — settler passes it in a
            # slightly different shape. Caller resolves win_country
            # before invoking this function, so for safety derive from
            # the field embedded in payload if present.
            field_meta = payload.get('field_meta') or []
            for fm in field_meta:
                if int(fm.get('horse_id', -1)) == int(win_id):
                    c = (fm.get('country') or '').upper()
                    if c:
                        win_country = c
                    break
        winner_key = win_country

    elif kind == 'time_bucket_horse':
        target_hid = int(payload.get('horse_id') or 0)
        finish = field_by_id.get(target_hid)
        if not finish:
            winner_key = None
        else:
            secs = float(finish.get('finish_ms') or 0) / 1000.0
            chosen = None
            for b in (payload.get('buckets') or []):
                lo = float(b.get('lo', 0))
                hi = float(b.get('hi', 9999))
                if lo <= secs < hi:
                    chosen = b.get('id')
                    break
            winner_key = chosen

    else:
        winner_key = None

    pool['winner_key'] = winner_key

    pool_total = sum(float(w.get('stake') or 0) for w in wagers)
    winning_side_total = sum(
        float(w.get('stake') or 0) for w in wagers
        if str(w.get('selection_key') or '') == str(winner_key)
    )

    out: List[Dict] = []
    for w in wagers:
        stake = float(w.get('stake') or 0)
        won = (winner_key is not None) and (str(w.get('selection_key')) == str(winner_key))

        if winning_side_total <= 0 or winner_key is None:
            # No one bet on the winning side, or the pool can't resolve —
            # treat as a push, refund stakes.
            payout = stake
            pnl    = 0.0
            implied = None
        elif won:
            payout = stake * (pool_total / winning_side_total)
            pnl    = round(payout - stake, 2)
            payout = round(payout, 2)
            # Implied decimal odds (book-style) for the listing UI.
            implied = round(pool_total / winning_side_total, 3)
        else:
            payout = 0.0
            pnl    = -stake
            implied = round(pool_total / winning_side_total, 3) if winning_side_total else None

        out.append({
            'wager_id':     w['wager_id'],
            'payout':       payout,
            'pnl':          pnl,
            'implied_odds': implied,
        })
    return out


# ─── Session lifecycle ───────────────────────────────────────────────

@cheltenham_bp.route('/session/create', methods=['POST', 'OPTIONS'])
def create_session():
    """BOOKIE only. Body:
        { name, starting_balance?, min_bet?, max_bet?,
          enable_time_pools?, default_distance?, default_dilation? }
    """
    if request.method == 'OPTIONS':
        return ('', 200)
    user = _auth_uid(request)
    if not user:
        return jsonify({'error': 'unauthorized'}), 401
    if not _is_bookie(user):
        return jsonify({'error': 'only BOOKIE can host Cheltenham sessions'}), 403

    client = _admin_client()
    if client is None:
        return jsonify({'error': 'supabase admin client unavailable'}), 500

    data = request.get_json(force=True) or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'name is required'}), 400

    row = {
        'name':              name,
        'host_id':           str(user),
        'status':            'lobby',
        'starting_balance':  float(data.get('starting_balance', 100)),
        'min_bet':           float(data.get('min_bet', 3)),
        'max_bet':           float(data.get('max_bet', 8)),
        'enable_time_pools': bool(data.get('enable_time_pools', False)),
        'default_distance':  int(data.get('default_distance', 1500)),
        'default_dilation':  float(data.get('default_dilation', 2.0)),
    }
    try:
        rc = client.table('cheltenham_sessions').insert(row).execute()
        rows = rc.data if hasattr(rc, 'data') else None
        sess = (rows or [row])[0]
        # Auto-add the host as a participant so they show up in the
        # bettors list (they can place bets too if they want).
        try:
            client.table('cheltenham_participants').insert({
                'session_id': sess['session_id'],
                'user_id':    str(user),
                'balance':    row['starting_balance'],
            }).execute()
        except Exception:
            pass
        return jsonify({'success': True, 'session': sess}), 200
    except Exception as e:
        logging.exception('cheltenham create_session error')
        return jsonify({'error': str(e)}), 500


@cheltenham_bp.route('/sessions', methods=['GET', 'OPTIONS'])
def list_sessions():
    """List sessions. ?status=lobby|active|all (default: lobby)."""
    if request.method == 'OPTIONS':
        return ('', 200)
    user = _auth_uid(request)
    if not user:
        return jsonify({'error': 'unauthorized'}), 401
    client = _admin_client()
    if client is None:
        return jsonify({'error': 'supabase admin client unavailable'}), 500
    try:
        status_filter = request.args.get('status', 'lobby')
        q = client.table('cheltenham_sessions').select('*').order('created_at', desc=True)
        if status_filter != 'all':
            q = q.eq('status', status_filter)
        rc = q.execute()
        sessions = rc.data or []

        host_ids = [str(s.get('host_id')) for s in sessions if s.get('host_id')]
        names = _resolve_screennames(client, host_ids)
        for s in sessions:
            s['host_screenname'] = names.get(str(s.get('host_id', '')), '')

        # Sessions this user has joined.
        enrolled_ids: List[int] = []
        try:
            ec = client.table('cheltenham_participants').select('session_id').eq('user_id', str(user)).execute()
            enrolled_ids = [r['session_id'] for r in (ec.data or [])]
        except Exception:
            pass

        return jsonify({'sessions': sessions, 'enrolled_session_ids': enrolled_ids}), 200
    except Exception as e:
        logging.exception('cheltenham list_sessions error')
        return jsonify({'error': str(e)}), 500


@cheltenham_bp.route('/session/<int:session_id>', methods=['GET', 'OPTIONS'])
def session_detail(session_id: int):
    """Full session state — session, participants, current race + pools +
    wagers. Wagers visibility is controlled per status:

      • betting   — non-host bettors see ONLY their own wagers (no peeking)
      • closed    — everyone sees every wager (the reveal phase)
      • racing/settled — everyone sees every wager
    """
    if request.method == 'OPTIONS':
        return ('', 200)
    user = _auth_uid(request)
    if not user:
        return jsonify({'error': 'unauthorized'}), 401
    client = _admin_client()
    if client is None:
        return jsonify({'error': 'supabase admin client unavailable'}), 500
    try:
        # Session
        rc = client.table('cheltenham_sessions').select('*').eq('session_id', session_id).limit(1).execute()
        rows = rc.data or []
        if not rows:
            return jsonify({'error': 'session not found'}), 404
        sess = rows[0]
        is_host = str(user) == str(sess.get('host_id', ''))

        # Participants
        pc = client.table('cheltenham_participants').select('*').eq('session_id', session_id).order('joined_at').execute()
        parts = pc.data or []
        all_uids = [str(p.get('user_id')) for p in parts] + [str(sess.get('host_id', ''))]
        names = _resolve_screennames(client, all_uids)
        for p in parts:
            p['screenname'] = names.get(str(p.get('user_id', '')), '')
        sess['host_screenname'] = names.get(str(sess.get('host_id', '')), '')

        # Latest race (the one you'd act on right now). When the session has
        # never run a race, this is null and the host is in "draft a race"
        # mode.
        rrc = (
            client.table('cheltenham_races')
            .select('*')
            .eq('session_id', session_id)
            .order('race_number', desc=True)
            .limit(1)
            .execute()
        )
        rrows = rrc.data or []
        current_race = rrows[0] if rrows else None

        pools: List[Dict] = []
        wagers_by_pool: Dict[int, List[Dict]] = {}
        if current_race:
            plc = (
                client.table('cheltenham_pools')
                .select('*')
                .eq('race_id', current_race['race_id'])
                .order('pool_id')
                .execute()
            )
            pools = plc.data or []
            pool_ids = [p['pool_id'] for p in pools]
            if pool_ids:
                wc = client.table('cheltenham_wagers').select('*').in_('pool_id', pool_ids).execute()
                for w in (wc.data or []):
                    wagers_by_pool.setdefault(w['pool_id'], []).append(w)

            # Visibility filter — see docstring up top.
            race_status = current_race.get('status')
            for pool in pools:
                bucket = wagers_by_pool.get(pool['pool_id'], [])
                if race_status == 'betting' and not is_host:
                    own = [w for w in bucket if str(w.get('user_id', '')) == str(user)]
                    for w in own:
                        w['screenname'] = names.get(str(w.get('user_id', '')), '')
                    pool['wagers'] = own
                    pool['wager_count'] = len(bucket)
                else:
                    for w in bucket:
                        w['screenname'] = names.get(str(w.get('user_id', '')), '')
                    pool['wagers'] = bucket
                    pool['wager_count'] = len(bucket)

            # `has_bet_all_pools` indicator per participant — host's
            # ✓-board uses this.
            if pools:
                pool_ids_set = {p['pool_id'] for p in pools}
                user_to_pools_bet: Dict[str, set] = {}
                for plist in wagers_by_pool.values():
                    for w in plist:
                        uid = str(w.get('user_id', ''))
                        user_to_pools_bet.setdefault(uid, set()).add(w.get('pool_id'))
                for p in parts:
                    bets_for_user = user_to_pools_bet.get(str(p.get('user_id', '')), set())
                    p['has_bet_all_pools'] = len(bets_for_user & pool_ids_set) == len(pool_ids_set)
                    p['pools_bet_count']   = len(bets_for_user & pool_ids_set)
                    p['pools_total']       = len(pool_ids_set)
            else:
                for p in parts:
                    p['has_bet_all_pools'] = False
                    p['pools_bet_count']   = 0
                    p['pools_total']       = 0

        # Update participant balance from wager pnl history (single-source-
        # of-truth — same pattern as the parimutuel detail endpoint).
        starting = float(sess.get('starting_balance', 100))
        # Pull all settled wagers for this user list across the session's
        # races (we already have current_race wagers; for prior races we
        # need a wider query).
        all_pool_ids: List[int] = []
        if current_race:
            # Prior races' pools too.
            try:
                prc = (
                    client.table('cheltenham_races')
                    .select('race_id')
                    .eq('session_id', session_id)
                    .execute()
                )
                race_ids = [r['race_id'] for r in (prc.data or [])]
                if race_ids:
                    plc_all = (
                        client.table('cheltenham_pools')
                        .select('pool_id')
                        .in_('race_id', race_ids)
                        .execute()
                    )
                    all_pool_ids = [p['pool_id'] for p in (plc_all.data or [])]
            except Exception:
                logging.exception('cheltenham aggregate pool fetch failed')

        pnl_by_user: Dict[str, float] = {}
        if all_pool_ids:
            try:
                wc_all = (
                    client.table('cheltenham_wagers')
                    .select('user_id, pnl')
                    .in_('pool_id', all_pool_ids)
                    .execute()
                )
                for w in (wc_all.data or []):
                    if w.get('pnl') is None:
                        continue
                    uid = str(w.get('user_id', ''))
                    pnl_by_user[uid] = pnl_by_user.get(uid, 0.0) + float(w['pnl'])
            except Exception:
                logging.exception('cheltenham wager pnl aggregate failed')

        for p in parts:
            uid = str(p.get('user_id', ''))
            pnl = pnl_by_user.get(uid, 0.0)
            p['balance']      = round(starting + pnl, 2)
            p['computed_pnl'] = round(pnl, 2)

        return jsonify({
            'session':       sess,
            'participants':  parts,
            'is_host':       is_host,
            'current_race':  current_race,
            'pools':         pools,
        }), 200
    except Exception as e:
        logging.exception('cheltenham session_detail error')
        return jsonify({'error': str(e)}), 500


@cheltenham_bp.route('/session/<int:session_id>/join', methods=['POST', 'OPTIONS'])
def join_session(session_id: int):
    if request.method == 'OPTIONS':
        return ('', 200)
    user = _auth_uid(request)
    if not user:
        return jsonify({'error': 'unauthorized'}), 401
    client = _admin_client()
    if client is None:
        return jsonify({'error': 'supabase admin client unavailable'}), 500
    try:
        rc = client.table('cheltenham_sessions').select('*').eq('session_id', session_id).limit(1).execute()
        rows = rc.data or []
        if not rows:
            return jsonify({'error': 'session not found'}), 404
        sess = rows[0]
        if sess.get('status') == 'concluded':
            return jsonify({'error': 'session has ended'}), 400
        starting = float(sess.get('starting_balance', 100))
        client.table('cheltenham_participants').insert({
            'session_id': session_id,
            'user_id':    str(user),
            'balance':    starting,
        }).execute()
        return jsonify({'success': True}), 200
    except Exception as e:
        err = str(e)
        if 'duplicate' in err.lower() or '23505' in err:
            return jsonify({'error': 'already joined'}), 409
        logging.exception('cheltenham join_session error')
        return jsonify({'error': err}), 500


@cheltenham_bp.route('/sessions/delete-all', methods=['POST', 'OPTIONS'])
def delete_all_sessions():
    """BOOKIE-only nuke. Deletes every cheltenham session (and via the
    ON DELETE CASCADE FKs, every participant / race / pool / wager too).
    Does NOT touch the canonical `bets` table — concluded P&L stays on
    the book."""
    if request.method == 'OPTIONS':
        return ('', 200)
    user = _auth_uid(request)
    if not user:
        return jsonify({'error': 'unauthorized'}), 401
    if not _is_bookie(user):
        return jsonify({'error': 'only BOOKIE can wipe Cheltenham sessions'}), 403
    client = _admin_client()
    if client is None:
        return jsonify({'error': 'supabase admin client unavailable'}), 500
    try:
        rc = client.table('cheltenham_sessions').select('session_id').execute()
        rows = rc.data or []
        ids = [r['session_id'] for r in rows]
        if not ids:
            return jsonify({'success': True, 'deleted': 0}), 200
        # Cascading deletes handle participants/races/pools/wagers.
        client.table('cheltenham_sessions').delete().in_('session_id', ids).execute()
        # Drop the in-memory enabled_pools fallback for those races too.
        for rid in list(_ENABLED_POOLS_FALLBACK.keys()):
            _ENABLED_POOLS_FALLBACK.pop(rid, None)
        return jsonify({'success': True, 'deleted': len(ids)}), 200
    except Exception as e:
        logging.exception('cheltenham delete_all_sessions error')
        return jsonify({'error': str(e)}), 500


@cheltenham_bp.route('/session/<int:session_id>/begin', methods=['POST', 'OPTIONS'])
def begin_session(session_id: int):
    if request.method == 'OPTIONS':
        return ('', 200)
    user = _auth_uid(request)
    if not user:
        return jsonify({'error': 'unauthorized'}), 401
    client = _admin_client()
    if client is None:
        return jsonify({'error': 'supabase admin client unavailable'}), 500
    try:
        rc = client.table('cheltenham_sessions').select('host_id, status').eq('session_id', session_id).limit(1).execute()
        rows = rc.data or []
        if not rows:
            return jsonify({'error': 'session not found'}), 404
        if str(rows[0].get('host_id')) != str(user):
            return jsonify({'error': 'only the host can begin the session'}), 403
        client.table('cheltenham_sessions').update({'status': 'active'}).eq('session_id', session_id).execute()
        return jsonify({'success': True}), 200
    except Exception as e:
        logging.exception('cheltenham begin_session error')
        return jsonify({'error': str(e)}), 500


@cheltenham_bp.route('/session/<int:session_id>/conclude', methods=['POST', 'OPTIONS'])
def conclude_session(session_id: int):
    """Host concludes the Cheltenham session.

    Per-race PnL is now auto-written to the `bets` table at race-settle time
    (see race_settle), so this endpoint only:
      1. Sweeps any race that somehow didn't get its bets row (defence in
         depth — shouldn't happen but cheap to check).
      2. Marks the session 'concluded'.
    """
    if request.method == 'OPTIONS':
        return ('', 200)
    user = _auth_uid(request)
    if not user:
        return jsonify({'error': 'unauthorized'}), 401
    client = _admin_client()
    if client is None:
        return jsonify({'error': 'supabase admin client unavailable'}), 500
    try:
        rc = client.table('cheltenham_sessions').select('*').eq('session_id', session_id).limit(1).execute()
        rows = rc.data or []
        if not rows:
            return jsonify({'error': 'session not found'}), 404
        sess = rows[0]
        if str(sess.get('host_id')) != str(user):
            return jsonify({'error': 'only the host can end the session'}), 403
        if sess.get('status') == 'concluded':
            return jsonify({'success': True, 'note': 'already concluded'}), 200

        session_name = sess.get('name') or f'Cheltenham #{session_id}'

        # Sweep: for every settled race, ensure each participant with a
        # non-zero settled-wager pnl has a `bets` row. Idempotent — keyed
        # on (market='Cheltenham', outcome='<session> · Race <n>', user_id).
        races_rc = (
            client.table('cheltenham_races')
            .select('race_id, race_number, status')
            .eq('session_id', session_id)
            .execute()
        )
        races = races_rc.data or []
        now_str = datetime.now(timezone.utc).isoformat()
        bets_written = 0

        for race in races:
            if race.get('status') != 'settled':
                continue
            race_outcome = f'{session_name} · Race {race.get("race_number")}'

            # Who already has a bets row for this race?
            already_written: set = set()
            try:
                existing_rc = (
                    client.table('bets')
                    .select('user_id')
                    .eq('market', 'Cheltenham')
                    .eq('outcome', race_outcome)
                    .execute()
                )
                for r in (existing_rc.data or []):
                    already_written.add(str(r.get('user_id') or ''))
            except Exception:
                logging.exception('cheltenham conclude sweep: read existing bets failed')

            # Sum each user's wager-pnl across all pools in this race.
            pools_rc = client.table('cheltenham_pools').select('pool_id').eq('race_id', race['race_id']).execute()
            pool_ids = [p['pool_id'] for p in (pools_rc.data or [])]
            if not pool_ids:
                continue
            wc = client.table('cheltenham_wagers').select('user_id, pnl').in_('pool_id', pool_ids).execute()
            pnl_by_user: Dict[str, float] = {}
            for w in (wc.data or []):
                if w.get('pnl') is None:
                    continue
                uid = str(w.get('user_id') or '')
                if not uid:
                    continue
                pnl_by_user[uid] = pnl_by_user.get(uid, 0.0) + float(w['pnl'])

            for uid, net in pnl_by_user.items():
                if uid in already_written:
                    continue
                net = round(net, 2)
                if net > 0:
                    result = 'Win'
                elif net < 0:
                    result = 'Loss'
                else:
                    result = 'Push'
                # Schema mirrors pari_session_conclude exactly — no bet_pnl
                # (column may not exist on every deployed bets table).
                bet_row = {
                    'user_id':       uid,
                    'market':        'Cheltenham',
                    'outcome':       race_outcome,
                    'bet_size':      round(abs(net), 2) if net != 0 else 0,
                    'odds_american': '+100',
                    'result':        result,
                    'game_id':       int(race.get('race_number') or 0),
                    'layeur':        'betgsis',
                    'placed_at':     now_str,
                }
                try:
                    client.table('bets').insert(bet_row).execute()
                    bets_written += 1
                except Exception:
                    logging.exception('cheltenham conclude sweep: failed to write bets row for %s', uid)

        # Always mark the session concluded — even if every bets-write
        # above failed, the host's intent was to end the session.
        try:
            client.table('cheltenham_sessions').update({
                'status':       'concluded',
                'concluded_at': now_str,
            }).eq('session_id', session_id).execute()
        except Exception:
            logging.exception('cheltenham conclude: session status update failed')
        return jsonify({'success': True, 'bets_written': bets_written}), 200
    except Exception as e:
        logging.exception('cheltenham conclude_session error')
        return jsonify({'error': str(e)}), 500


# ─── Race lifecycle ───────────────────────────────────────────────────

@cheltenham_bp.route('/session/<int:session_id>/race/draft', methods=['POST', 'OPTIONS'])
def race_draft(session_id: int):
    """Host draws a new race. Body:
        { field_size: 3|5|7, mode: 'random'|'manual',
          horse_ids?: [int],   # required for manual
          distance?, dilation? }
    Creates a `cheltenham_races` row in `drafting` status. Pools are NOT
    yet released — host calls /release-pools to broadcast them.
    """
    if request.method == 'OPTIONS':
        return ('', 200)
    user = _auth_uid(request)
    if not user:
        return jsonify({'error': 'unauthorized'}), 401
    client = _admin_client()
    if client is None:
        return jsonify({'error': 'supabase admin client unavailable'}), 500

    try:
        sc = client.table('cheltenham_sessions').select('*').eq('session_id', session_id).limit(1).execute()
        srows = sc.data or []
        if not srows:
            return jsonify({'error': 'session not found'}), 404
        sess = srows[0]
        if str(sess.get('host_id')) != str(user):
            return jsonify({'error': 'only the host can draft races'}), 403
        if sess.get('status') == 'concluded':
            return jsonify({'error': 'session has ended'}), 400

        data = request.get_json(force=True) or {}
        field_size = int(data.get('field_size') or 5)
        if field_size not in (3, 5, 7):
            return jsonify({'error': 'field_size must be 3, 5, or 7'}), 400
        mode = (data.get('mode') or 'random').lower()
        if mode not in ('random', 'manual'):
            return jsonify({'error': 'mode must be random or manual'}), 400

        # Block creating a new race while the previous one is mid-flight.
        # Try to fetch enabled_pools too so subsequent races can inherit
        # the host's prior selection. Falls back to the slim columns when
        # the migration hasn't been applied (PostgREST 42703 / PGRST204).
        try:
            prev_rc = (
                client.table('cheltenham_races')
                .select('race_id, status, race_number, enabled_pools')
                .eq('session_id', session_id)
                .order('race_number', desc=True)
                .limit(1)
                .execute()
            )
        except Exception as fetch_err:
            if not _is_missing_column_error(fetch_err):
                raise
            prev_rc = (
                client.table('cheltenham_races')
                .select('race_id, status, race_number')
                .eq('session_id', session_id)
                .order('race_number', desc=True)
                .limit(1)
                .execute()
            )
        prev_rows = prev_rc.data or []
        if prev_rows and prev_rows[0].get('status') not in ('settled',):
            return jsonify({
                'error': f'finish settling race #{prev_rows[0].get("race_number")} before drafting another'
            }), 400
        next_number = (prev_rows[0]['race_number'] + 1) if prev_rows else 1

        # Resolve the field — random pull from `horses` or honor manual ids.
        all_resp = client.table('horses').select('*').execute()
        all_horses = all_resp.data or []
        if not all_horses:
            return jsonify({'error': 'no horses in catalogue'}), 500
        horse_by_id = {int(h['horse_id']): h for h in all_horses}

        if mode == 'manual':
            ids = data.get('horse_ids') or []
            if len(ids) != field_size:
                return jsonify({'error': f'manual mode requires exactly {field_size} horse_ids'}), 400
            chosen = []
            for hid in ids:
                h = horse_by_id.get(int(hid))
                if not h:
                    return jsonify({'error': f'unknown horse_id {hid}'}), 400
                chosen.append(h)
        else:
            if len(all_horses) < field_size:
                return jsonify({'error': f'catalogue has only {len(all_horses)} horses'}), 400
            chosen = random.sample(all_horses, field_size)

        random.shuffle(chosen)
        field = []
        for i, h in enumerate(chosen):
            field.append({**h, 'post_position': i + 1})

        # Optional pool selector — at least one default pool must remain on.
        # When the host doesn't pass enabled_pools we INHERIT from the latest
        # prior race in this session (so a session-wide choice carries over to
        # every subsequent race). Falls back to all four if there's no prior
        # race or the prior row predates the column.
        DEFAULT_KINDS = ['winner', 'bridesmaid', 'backer', 'winner_nationality']
        raw_enabled = data.get('enabled_pools')
        if raw_enabled is None:
            inherited: Optional[List[str]] = None
            if prev_rows:
                prev_row = prev_rows[0]
                cand = prev_row.get('enabled_pools')
                if not cand:
                    cand = _ENABLED_POOLS_FALLBACK.get(int(prev_row.get('race_id') or -1))
                if cand:
                    inherited = [k for k in cand if k in DEFAULT_KINDS]
            enabled_pools = inherited if inherited else DEFAULT_KINDS[:]
        else:
            enabled_pools = [k for k in raw_enabled if k in DEFAULT_KINDS]
            if not enabled_pools:
                return jsonify({'error': 'at least one default pool must be enabled'}), 400

        race_row = {
            'session_id':    session_id,
            'race_number':   next_number,
            'status':        'drafting',
            'field_size':    field_size,
            'distance':      int(data.get('distance')  or sess.get('default_distance', 1500)),
            'dilation':      float(data.get('dilation') or sess.get('default_dilation', 2.0)),
            'field_json':    field,
            'enabled_pools': enabled_pools,
        }
        # Try the insert with `enabled_pools`. If the migration hasn't been
        # applied yet (PGRST204 / column missing), retry without and stash
        # the host's selection in a process-local cache so release-pools
        # can still find it.
        try:
            rc = client.table('cheltenham_races').insert(race_row).execute()
            race = (rc.data or [race_row])[0]
        except Exception as insert_err:
            if not _is_missing_column_error(insert_err):
                raise
            logging.warning(
                'cheltenham_races.enabled_pools column missing — '
                'retrying insert without it. Apply add_enabled_pools_to_races.sql '
                'to persist the choice across process restarts.'
            )
            fallback_row = {k: v for k, v in race_row.items() if k != 'enabled_pools'}
            rc = client.table('cheltenham_races').insert(fallback_row).execute()
            race = (rc.data or [fallback_row])[0]
            race_id = race.get('race_id')
            if race_id is not None:
                _ENABLED_POOLS_FALLBACK[int(race_id)] = list(enabled_pools)
                race['enabled_pools'] = enabled_pools  # echo back to client
        return jsonify({'success': True, 'race': race}), 200
    except Exception as e:
        logging.exception('cheltenham race_draft error')
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@cheltenham_bp.route('/race/<int:race_id>/release-pools', methods=['POST', 'OPTIONS'])
def race_release_pools(race_id: int):
    if request.method == 'OPTIONS':
        return ('', 200)
    user = _auth_uid(request)
    if not user:
        return jsonify({'error': 'unauthorized'}), 401
    client = _admin_client()
    if client is None:
        return jsonify({'error': 'supabase admin client unavailable'}), 500
    try:
        rc = client.table('cheltenham_races').select('*').eq('race_id', race_id).limit(1).execute()
        rrows = rc.data or []
        if not rrows:
            return jsonify({'error': 'race not found'}), 404
        race = rrows[0]
        sc = client.table('cheltenham_sessions').select('host_id, enable_time_pools').eq('session_id', race['session_id']).limit(1).execute()
        srows = sc.data or []
        if not srows:
            return jsonify({'error': 'session not found'}), 404
        sess = srows[0]
        if str(sess.get('host_id')) != str(user):
            return jsonify({'error': 'only the host can release pools'}), 403
        if race.get('status') != 'drafting':
            return jsonify({'error': f'race already in {race.get("status")} — pools cannot be re-released'}), 400

        # Resolve enabled_pools from (in order): the race row, the
        # process-local fallback cache (set by /race/draft when the
        # column hadn't been migrated yet), or the request body
        # (idempotent retry). Defaults to None → all four pools.
        ep_from_row = race.get('enabled_pools')
        ep_from_cache = _ENABLED_POOLS_FALLBACK.get(int(race_id))
        ep_from_body = (request.get_json(silent=True) or {}).get('enabled_pools')
        resolved_enabled_pools = ep_from_row or ep_from_cache or ep_from_body

        pools = _build_pools_for_field(
            field=race['field_json'] or [],
            enable_time_pools=bool(sess.get('enable_time_pools')),
            enabled_pools=resolved_enabled_pools,
        )
        # Stash the field-meta inside winner_nationality payload so settle
        # has the country lookup it needs.
        for p in pools:
            if p['pool_kind'] == 'winner_nationality':
                p['payload_json']['field_meta'] = [
                    {'horse_id': int(h['horse_id']),
                     'country':  (h.get('country') or '').upper(),
                     'full_name': h.get('full_name')}
                    for h in race['field_json']
                ]

        for p in pools:
            client.table('cheltenham_pools').insert({
                'race_id':      race_id,
                'pool_kind':    p['pool_kind'],
                'status':       'betting',
                'payload_json': p['payload_json'],
            }).execute()

        client.table('cheltenham_races').update({'status': 'betting'}).eq('race_id', race_id).execute()
        return jsonify({'success': True, 'pool_count': len(pools)}), 200
    except Exception as e:
        logging.exception('cheltenham release_pools error')
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@cheltenham_bp.route('/pool/<int:pool_id>/wager', methods=['POST', 'OPTIONS'])
def pool_wager(pool_id: int):
    """Body: { selection_key: str, stake: number }."""
    if request.method == 'OPTIONS':
        return ('', 200)
    user = _auth_uid(request)
    if not user:
        return jsonify({'error': 'unauthorized'}), 401
    client = _admin_client()
    if client is None:
        return jsonify({'error': 'supabase admin client unavailable'}), 500
    try:
        # Pool + race + session for validation
        pc = client.table('cheltenham_pools').select('*').eq('pool_id', pool_id).limit(1).execute()
        prows = pc.data or []
        if not prows:
            return jsonify({'error': 'pool not found'}), 404
        pool = prows[0]
        if pool.get('status') != 'betting':
            return jsonify({'error': f'pool is {pool.get("status")} — cannot wager'}), 400

        rc = client.table('cheltenham_races').select('session_id, status').eq('race_id', pool['race_id']).limit(1).execute()
        rrows = rc.data or []
        if not rrows or rrows[0].get('status') != 'betting':
            return jsonify({'error': 'race not in betting state'}), 400
        session_id = rrows[0]['session_id']

        sc = client.table('cheltenham_sessions').select('min_bet, max_bet, status').eq('session_id', session_id).limit(1).execute()
        srows = sc.data or []
        if not srows:
            return jsonify({'error': 'session not found'}), 404
        sess = srows[0]
        if sess.get('status') == 'concluded':
            return jsonify({'error': 'session ended'}), 400

        # Caller must be a participant
        ec = client.table('cheltenham_participants').select('id').eq('session_id', session_id).eq('user_id', str(user)).limit(1).execute()
        if not (ec.data or []):
            return jsonify({'error': 'join the session first'}), 403

        data = request.get_json(force=True) or {}
        selection_key = str(data.get('selection_key') or '').strip()
        if not selection_key:
            return jsonify({'error': 'selection_key is required'}), 400
        try:
            stake = float(data.get('stake'))
        except Exception:
            return jsonify({'error': 'stake must be a number'}), 400
        min_bet = float(sess.get('min_bet') or 0)
        max_bet = float(sess.get('max_bet') or 0)
        if stake < min_bet or stake > max_bet:
            return jsonify({'error': f'stake must be between {min_bet} and {max_bet}'}), 400

        # Validate selection_key against the pool's payload
        payload = pool.get('payload_json') or {}
        kind = pool.get('pool_kind')
        valid = False
        if kind in ('winner', 'bridesmaid', 'backer'):
            valid_ids = {str(x) for x in (payload.get('horse_ids') or [])}
            valid = selection_key in valid_ids
        elif kind == 'winner_nationality':
            valid_codes = {str(x).upper() for x in (payload.get('countries') or [])}
            valid = selection_key.upper() in valid_codes
            selection_key = selection_key.upper()
        elif kind == 'time_bucket_horse':
            valid_ids = {str(b.get('id')) for b in (payload.get('buckets') or [])}
            valid = selection_key in valid_ids
        if not valid:
            return jsonify({'error': f'selection_key not valid for pool kind {kind}'}), 400

        # Upsert (one wager per pool per user).
        existing_rc = client.table('cheltenham_wagers').select('wager_id').eq('pool_id', pool_id).eq('user_id', str(user)).limit(1).execute()
        existing = existing_rc.data or []
        row = {
            'pool_id':       pool_id,
            'user_id':       str(user),
            'selection_key': selection_key,
            'stake':         stake,
        }
        if existing:
            client.table('cheltenham_wagers').update(row).eq('wager_id', existing[0]['wager_id']).execute()
        else:
            client.table('cheltenham_wagers').insert(row).execute()
        return jsonify({'success': True}), 200
    except Exception as e:
        logging.exception('cheltenham pool_wager error')
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@cheltenham_bp.route('/race/<int:race_id>/close-wagering', methods=['POST', 'OPTIONS'])
def race_close_wagering(race_id: int):
    if request.method == 'OPTIONS':
        return ('', 200)
    user = _auth_uid(request)
    if not user:
        return jsonify({'error': 'unauthorized'}), 401
    client = _admin_client()
    if client is None:
        return jsonify({'error': 'supabase admin client unavailable'}), 500
    try:
        rc = client.table('cheltenham_races').select('*').eq('race_id', race_id).limit(1).execute()
        rrows = rc.data or []
        if not rrows:
            return jsonify({'error': 'race not found'}), 404
        race = rrows[0]
        sc = client.table('cheltenham_sessions').select('host_id').eq('session_id', race['session_id']).limit(1).execute()
        srows = sc.data or []
        if not srows or str(srows[0].get('host_id')) != str(user):
            return jsonify({'error': 'only the host can close wagering'}), 403
        if race.get('status') != 'betting':
            return jsonify({'error': f'race is {race.get("status")} — cannot close'}), 400

        # Compute implied odds for every wager (visible after close).
        plc = client.table('cheltenham_pools').select('*').eq('race_id', race_id).execute()
        pools = plc.data or []
        pool_ids = [p['pool_id'] for p in pools]
        wagers_by_pool: Dict[int, List[Dict]] = {}
        if pool_ids:
            wc = client.table('cheltenham_wagers').select('*').in_('pool_id', pool_ids).execute()
            for w in (wc.data or []):
                wagers_by_pool.setdefault(w['pool_id'], []).append(w)

        for pool in pools:
            wagers = wagers_by_pool.get(pool['pool_id'], [])
            pool_total = sum(float(w.get('stake') or 0) for w in wagers)
            if pool_total <= 0:
                continue
            # Side-aggregate totals (one number per selection_key).
            side_totals: Dict[str, float] = {}
            for w in wagers:
                k = str(w.get('selection_key') or '')
                side_totals[k] = side_totals.get(k, 0.0) + float(w.get('stake') or 0)
            # Implied odds for each wager — pool_total / side_total.
            for w in wagers:
                k = str(w.get('selection_key') or '')
                side = side_totals.get(k, 0.0)
                if side <= 0:
                    continue
                implied = round(pool_total / side, 3)
                client.table('cheltenham_wagers').update({'implied_odds': implied}).eq('wager_id', w['wager_id']).execute()
            client.table('cheltenham_pools').update({
                'status':    'closed',
                'closed_at': datetime.utcnow().isoformat(),
            }).eq('pool_id', pool['pool_id']).execute()

        client.table('cheltenham_races').update({'status': 'closed'}).eq('race_id', race_id).execute()
        return jsonify({'success': True}), 200
    except Exception as e:
        logging.exception('cheltenham close_wagering error')
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@cheltenham_bp.route('/race/<int:race_id>/send-off', methods=['POST', 'OPTIONS'])
def race_send_off(race_id: int):
    """Run the simulator + persist the trajectory; flip status to racing."""
    if request.method == 'OPTIONS':
        return ('', 200)
    user = _auth_uid(request)
    if not user:
        return jsonify({'error': 'unauthorized'}), 401
    client = _admin_client()
    if client is None:
        return jsonify({'error': 'supabase admin client unavailable'}), 500
    try:
        rc = client.table('cheltenham_races').select('*').eq('race_id', race_id).limit(1).execute()
        rrows = rc.data or []
        if not rrows:
            return jsonify({'error': 'race not found'}), 404
        race = rrows[0]
        sc = client.table('cheltenham_sessions').select('host_id').eq('session_id', race['session_id']).limit(1).execute()
        srows = sc.data or []
        if not srows or str(srows[0].get('host_id')) != str(user):
            return jsonify({'error': 'only the host can send off'}), 403
        if race.get('status') != 'closed':
            return jsonify({'error': f'race is {race.get("status")} — close wagering first'}), 400

        seed = int(random.SystemRandom().randint(0, 2**31 - 1))
        trajectory = run_single_race(
            race['field_json'],
            distance=int(race.get('distance') or 1500),
            dilation=float(race.get('dilation') or 2.0),
            seed=seed,
        )
        trajectory['seed'] = seed
        # Year-counter not used by Cheltenham; keep field for the
        # frontend's fmtEdition helper (defaults to a sentinel year).
        trajectory.setdefault('year_counter', race.get('race_number') or 1)

        client.table('cheltenham_races').update({
            'status':          'racing',
            'trajectory_json': trajectory,
            'sent_off_at':     datetime.utcnow().isoformat(),
        }).eq('race_id', race_id).execute()
        return jsonify({'success': True, 'trajectory': trajectory}), 200
    except Exception as e:
        logging.exception('cheltenham send_off error')
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@cheltenham_bp.route('/race/<int:race_id>/settle', methods=['POST', 'OPTIONS'])
def race_settle(race_id: int):
    """Resolve every pool against the trajectory, write payout/pnl/
    implied_odds onto each wager, mark race + pools settled.
    Idempotent — re-running on a settled race is a no-op."""
    if request.method == 'OPTIONS':
        return ('', 200)
    user = _auth_uid(request)
    if not user:
        return jsonify({'error': 'unauthorized'}), 401
    client = _admin_client()
    if client is None:
        return jsonify({'error': 'supabase admin client unavailable'}), 500
    try:
        rc = client.table('cheltenham_races').select('*').eq('race_id', race_id).limit(1).execute()
        rrows = rc.data or []
        if not rrows:
            return jsonify({'error': 'race not found'}), 404
        race = rrows[0]
        sc = client.table('cheltenham_sessions').select('host_id').eq('session_id', race['session_id']).limit(1).execute()
        srows = sc.data or []
        if not srows or str(srows[0].get('host_id')) != str(user):
            return jsonify({'error': 'only the host can settle'}), 403
        if race.get('status') == 'settled':
            return jsonify({'success': True, 'note': 'already settled'}), 200
        if race.get('status') != 'racing':
            return jsonify({'error': f'race is {race.get("status")} — send off first'}), 400

        trajectory = race.get('trajectory_json') or {}
        plc = client.table('cheltenham_pools').select('*').eq('race_id', race_id).execute()
        pools = plc.data or []
        pool_ids = [p['pool_id'] for p in pools]
        wagers_by_pool: Dict[int, List[Dict]] = {}
        if pool_ids:
            wc = client.table('cheltenham_wagers').select('*').in_('pool_id', pool_ids).execute()
            for w in (wc.data or []):
                wagers_by_pool.setdefault(w['pool_id'], []).append(w)

        # ── PHASE 1 (CRITICAL): persist per-wager pnl/payout/implied_odds,
        # mark every pool settled, mark the race settled. If anything in
        # this phase throws we surface 500 — the race state must not be
        # left in 'racing' limbo.
        pnl_by_user: Dict[str, float] = {}
        for pool in pools:
            wagers = wagers_by_pool.get(pool['pool_id'], [])
            updates = _settle_pool(pool, wagers, trajectory)
            updates_by_id = {u['wager_id']: u for u in updates}
            for w in wagers:
                u = updates_by_id.get(w.get('wager_id'))
                if not u:
                    continue
                client.table('cheltenham_wagers').update({
                    'payout':       u['payout'],
                    'pnl':          u['pnl'],
                    'implied_odds': u['implied_odds'],
                }).eq('wager_id', w['wager_id']).execute()
                uid = str(w.get('user_id') or '')
                if uid:
                    pnl_by_user[uid] = pnl_by_user.get(uid, 0.0) + float(u['pnl'] or 0.0)
            client.table('cheltenham_pools').update({
                'status':     'settled',
                'winner_key': pool.get('winner_key'),
                'settled_at': datetime.utcnow().isoformat(),
            }).eq('pool_id', pool['pool_id']).execute()

        # Flip the race to settled IMMEDIATELY — bets-table write is best-
        # effort and must not block the SettleView from rendering for the
        # host + bettors.
        client.table('cheltenham_races').update({
            'status':     'settled',
            'settled_at': datetime.utcnow().isoformat(),
        }).eq('race_id', race_id).execute()

        # ── PHASE 2 (BEST-EFFORT): mirror per-participant net pnl into the
        # canonical `bets` table so other users' results land in the book
        # the moment a race settles. ANY failure here is swallowed —
        # session_detail / SettleView still work.
        bets_written = 0
        try:
            sess_full_rc = (
                client.table('cheltenham_sessions')
                .select('name')
                .eq('session_id', race['session_id'])
                .limit(1)
                .execute()
            )
            sess_name = ((sess_full_rc.data or [{}])[0]).get('name') or f'Cheltenham #{race["session_id"]}'
            race_outcome = f'{sess_name} · Race {race.get("race_number")}'
            now_iso = datetime.now(timezone.utc).isoformat()

            already_written: set = set()
            try:
                existing_rc = (
                    client.table('bets')
                    .select('user_id')
                    .eq('market', 'Cheltenham')
                    .eq('outcome', race_outcome)
                    .execute()
                )
                for r in (existing_rc.data or []):
                    already_written.add(str(r.get('user_id') or ''))
            except Exception:
                logging.exception('cheltenham settle: idempotency read failed (continuing)')

            for uid, net in pnl_by_user.items():
                if not uid or uid in already_written:
                    continue
                net = round(net, 2)
                if net > 0:
                    result = 'Win'
                elif net < 0:
                    result = 'Loss'
                else:
                    result = 'Push'
                # Schema mirrors pari_session_conclude exactly — only
                # columns guaranteed to exist on the deployed `bets`
                # table. Do NOT add `bet_pnl` (column may be absent).
                bet_row = {
                    'user_id':       uid,
                    'market':        'Cheltenham',
                    'outcome':       race_outcome,
                    'bet_size':      round(abs(net), 2) if net != 0 else 0,
                    'odds_american': '+100',
                    'result':        result,
                    'game_id':       int(race.get('race_number') or 0),
                    'layeur':        'betgsis',
                    'placed_at':     now_iso,
                }
                try:
                    client.table('bets').insert(bet_row).execute()
                    bets_written += 1
                except Exception:
                    logging.exception('cheltenham settle: bets insert failed for user %s', uid)
        except Exception:
            # The race is already settled in the DB at this point — never
            # re-raise from the bets mirror block.
            logging.exception('cheltenham settle: bets-mirror phase failed (race still settled)')

        return jsonify({'success': True, 'bets_written': bets_written}), 200
    except Exception as e:
        logging.exception('cheltenham race_settle error')
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500
