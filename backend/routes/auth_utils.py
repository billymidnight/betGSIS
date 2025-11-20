from functools import wraps
from flask import request, jsonify

BOOK_EMAILS = {'pritesmk@umich.edu', 'pritesh82tobayern@gmail.com'}
BOOK_USERNAMES = {'billymidnight'}


def _is_book_request(req):
    # Check headers for mock auth info
    email = req.headers.get('X-User-Email', '').lower()
    username = req.headers.get('X-User-Name', '').lower()
    role = req.headers.get('X-User-Role', '').lower()
    if role == 'book':
        return True
    if email and email in BOOK_EMAILS:
        return True
    if username and username in BOOK_USERNAMES:
        return True
    return False


def require_book(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        if not _is_book_request(request):
            return jsonify({'error': 'forbidden'}), 403
        return func(*args, **kwargs)

    return wrapper
