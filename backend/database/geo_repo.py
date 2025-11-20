# backend/database/geo_repo.py
from typing import List, Dict
from .supabase_client import get_supabase_client

def get_geo_players() -> List[Dict]:
    client = get_supabase_client()
    res = client.table("geo_players")\
        .select("player_id,name,screenname,mean_score,stddev_score")\
        .order("player_id")\
        .execute()
    return res.data or []

def get_games() -> List[Dict]:
    client = get_supabase_client()
    res = client.table("games").select("*").order("game_id").execute()
    return res.data or []


def get_geo_countries() -> List[Dict]:
    """Return rows from geo_countries table with at least: id, country, freq, continent"""
    client = get_supabase_client()
    res = client.table("geo_countries").select("id,country,freq,continent").order("id").execute()
    return res.data or []


def get_locks(market: str = None) -> Dict:
    """Fetch lock rows from the existing `locks` table and return a mapping.

    The existing table uses columns: lockid, market, locked

    Returns a dict with keys:
      - 'master': bool (True if Master lock is set)
      - 'locks': dict mapping normalized market -> bool
      - 'market_locked': bool (only present when market param is provided)
    """
    client = get_supabase_client()
    try:
        # select market and locked (existing schema)
        rc = client.table('locks').select('market,locked').execute()
        rows = rc.data if hasattr(rc, 'data') else (rc.get('data') if isinstance(rc, dict) else None)
        mapping = {}
        if rows:
            for r in rows:
                raw_market = r.get('market') or ''
                # normalize market labels to lowercase for matching
                name = str(raw_market).strip().lower()
                val = bool(r.get('locked'))
                mapping[name] = val

        # master lock key may be stored as 'master' or 'Master' in the market column
        master = mapping.get('master', False)
        out = {'master': master, 'locks': mapping}
        if market is not None:
            mnorm = (market or '').strip().lower()
            out['market_locked'] = bool(mapping.get(mnorm, False))
        return out
    except Exception:
        # On any error, default to unlocked state to avoid accidental wide blocking.
        return {'master': False, 'locks': {}, 'market_locked': False}


def fetch_locks_rows() -> List[Dict]:
    """Return list of lock rows with fields: lockid, market, locked ordered by lockid."""
    client = get_supabase_client()
    try:
        rc = client.table('locks').select('lockid,market,locked').order('lockid').execute()
        rows = rc.data if hasattr(rc, 'data') else (rc.get('data') if isinstance(rc, dict) else None)
        return rows or []
    except Exception:
        return []


def update_lock_by_id(lockid: int, locked: bool) -> Dict:
    """Update a lock row by lockid and return the updated row or raise Exception."""
    client = get_supabase_client()
    try:
        upd = client.table('locks').update({'locked': bool(locked)}).eq('lockid', int(lockid)).execute()
        rows = upd.data if hasattr(upd, 'data') else (upd.get('data') if isinstance(upd, dict) else None)
        if rows and len(rows) > 0:
            return rows[0]
        # If the update succeeded but no representation was returned, fetch the row explicitly.
        refreshed = client.table('locks').select('lockid,market,locked').eq('lockid', int(lockid)).limit(1).execute()
        ref_rows = refreshed.data if hasattr(refreshed, 'data') else (refreshed.get('data') if isinstance(refreshed, dict) else None)
        if ref_rows and len(ref_rows) > 0:
            return ref_rows[0]
        raise Exception('lock not found')
    except Exception:
        raise
