from db import get_conn
from datetime import datetime


def create_bet_for_user(user_id, line_id, side, stake):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            # support line_id as numeric or string like 'line_<playerId>_<threshold>'
            if isinstance(line_id, str) and line_id.startswith('line_'):
                parts = line_id.split('_')
                # line_{playerId}_{threshold} or line_{playerId}
                player_id = parts[1] if len(parts) > 1 else None
                threshold = parts[2] if len(parts) > 2 else None
                if player_id and threshold:
                    cur.execute('SELECT id, odds_over_decimal, odds_under_decimal FROM lines WHERE player_id = %s AND threshold = %s', (player_id, threshold))
                else:
                    cur.execute('SELECT id, odds_over_decimal, odds_under_decimal FROM lines WHERE player_id = %s ORDER BY updated_at DESC LIMIT 1', (player_id,))
                row = cur.fetchone()
            else:
                # fetch line pricing by numeric id
                cur.execute('SELECT id, odds_over_decimal, odds_under_decimal FROM lines WHERE id = %s', (line_id,))
                row = cur.fetchone()

            if not row:
                raise ValueError('line not found')
            odds_over, odds_under = row['odds_over_decimal'], row['odds_under_decimal']
            resolved_line_id = row.get('id') if isinstance(row, dict) and 'id' in row else None
            if resolved_line_id is None:
                # Some cursor implementations return tuples
                try:
                    resolved_line_id = row[0]
                except Exception:
                    resolved_line_id = line_id
            price = odds_over if side == 'over' else odds_under
            # insert bet
            cur.execute(
                'INSERT INTO bets (user_id, line_id, side, stake, price_decimal, placed_at) VALUES (%s,%s,%s,%s,%s,%s) RETURNING id, placed_at',
                (user_id, resolved_line_id or line_id, side, stake, price, datetime.utcnow())
            )
            inserted = cur.fetchone()
            conn.commit()
            return {'id': inserted['id'], 'user_id': user_id, 'line_id': line_id, 'side': side, 'stake': float(stake), 'price_decimal': float(price), 'placed_at': inserted['placed_at']}
    finally:
        conn.close()


def get_bets_for_user(user_id):
    rows = None
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute('''
                SELECT b.id, b.user_id, b.line_id, b.side, b.stake, b.price_decimal, b.placed_at, b.status
                FROM bets b
                WHERE b.user_id = %s
                ORDER BY b.placed_at DESC
            ''', (user_id,))
            rows = cur.fetchall()
    finally:
        conn.close()
    return rows or []


def get_all_bets():
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute('SELECT * FROM bets ORDER BY placed_at DESC')
            return cur.fetchall()
    finally:
        conn.close()


def settle_bet(bet_id: int, outcome: str):
    # outcome may be 'win'|'lose'|'loss'|'push' from callers; normalize to canonical DB values
    # canonical values expected by DB check constraint: 'Win', 'Loss', 'Push'
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute('SELECT id, user_id, stake, price_decimal FROM bets WHERE id = %s', (bet_id,))
            b = cur.fetchone()
            if not b:
                raise ValueError('bet not found')
            # compute pnl
            stake = float(b['stake'])
            price = float(b['price_decimal']) if b['price_decimal'] is not None else 0.0
            pnl = 0.0
            norm = (outcome or '').lower()
            # map to canonical
            if norm in ('win',):
                canon = 'Win'
                pnl = stake * (price - 1.0)
            elif norm in ('lose', 'loss'):
                canon = 'Loss'
                pnl = -stake
            elif norm == 'push':
                canon = 'Push'
                pnl = 0.0
            else:
                raise ValueError('invalid outcome')

            cur.execute('UPDATE bets SET status = %s WHERE id = %s', (canon, bet_id))
            cur.execute('INSERT INTO pnl_ledger (user_id, bet_id, outcome, pnl_amount, settled_at) VALUES (%s,%s,%s,%s,%s) RETURNING id',
                        (b['user_id'], bet_id, canon, pnl, datetime.utcnow()))
            conn.commit()
            return {'bet_id': bet_id, 'outcome': outcome, 'pnl': pnl}
    finally:
        conn.close()
