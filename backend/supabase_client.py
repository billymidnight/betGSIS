import os
import logging

try:
    from supabase import create_client  # supabase-py
except Exception:
    create_client = None

SUPABASE_URL = os.getenv('SUPABASE_URL')
# Prefer explicit service role key for server-side operations; fall back to SUPABASE_KEY if needed
SUPABASE_SERVICE_ROLE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY') or os.getenv('SUPABASE_KEY') or os.getenv('SUPABASE_SERVICE_KEY')


def get_admin_client():
    """Return a Supabase client using the service role key for privileged server-side operations.

    Ensure you set SUPABASE_SERVICE_ROLE_KEY in env for production.
    """
    if create_client is None:
        logging.warning('supabase-py not installed; supabase client unavailable')
        return None
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        logging.warning('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set')
        return None
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def get_user_from_access_token(access_token: str):
    """Return user dict from access token using admin client.

    Returns None if token invalid or client unavailable.
    """
    client = get_admin_client()
    if not client:
        return None
    try:
        # Try newer / older client interfaces. Prefer client.auth.get_user if available.
        # Normalize returned value to a dict containing at least 'id' (user id).
        user = None
        try:
            # new-style: client.auth.get_user(access_token)
            if hasattr(client.auth, 'get_user'):
                res = client.auth.get_user(access_token)
                # some versions return dict {'data': {'user': {...}}}
                if isinstance(res, dict) and res.get('data') and res['data'].get('user'):
                    user = res['data']['user']
                elif isinstance(res, dict) and res.get('user'):
                    user = res.get('user')
                else:
                    # if response is a user-like object
                    user = res
            else:
                # fallback: older supabase-py exposes auth.api.get_user
                user = client.auth.api.get_user(access_token)

        except Exception:
            # last-resort: try auth.api.get_user
            try:
                user = client.auth.api.get_user(access_token)
            except Exception as e:
                logging.debug('get_user_from_access_token final fallback error: %s', e)
                user = None

        # Normalize user object
        if not user:
            return None
        # If wrapper with data.user
        if isinstance(user, dict) and user.get('data') and isinstance(user['data'], dict) and user['data'].get('user'):
            return user['data']['user']
        return user
    except Exception as e:
        logging.debug('get_user_from_access_token error: %s', e)
        return None
