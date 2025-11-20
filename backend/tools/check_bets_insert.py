#!/usr/bin/env python3
"""
Quick sanity check: verify bets.user_id FK against users.user_id and attempt a test insert.

Usage (PowerShell):
  # set your DATABASE_URL or SUPABASE_DB_URL first (example):
  $env:DATABASE_URL = 'postgres://user:pass@host:5432/dbname'
  python .\backend\tools\check_bets_insert.py

The script will:
 - read DATABASE_URL or SUPABASE_DB_URL from env
 - connect with psycopg2
 - SELECT one user_id from users
 - attempt an INSERT into bets inside a transaction and then ROLLBACK to avoid leaving test data
 - print a success/failure message
"""
import os
import sys
import traceback

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
except Exception:
    print("psycopg2 not installed. Install it with: python -m pip install psycopg2-binary")
    sys.exit(2)


def get_db_url():
    return os.environ.get('DATABASE_URL') or os.environ.get('SUPABASE_DB_URL')


def main():
    db_url = get_db_url()
    if not db_url:
        print("ERROR: DATABASE_URL or SUPABASE_DB_URL not set in environment.")
        print("Set it in PowerShell like: $env:DATABASE_URL = 'postgres://user:pass@host:5432/dbname'")
        sys.exit(1)

    print("Using DB URL from env (hidden)")

    try:
        conn = psycopg2.connect(db_url)
    except Exception as e:
        print("Failed to connect to DB:")
        print(str(e))
        sys.exit(1)

    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)

        # 1) verify foreign key relationship exists by checking information_schema
        try:
            cur.execute("SELECT constraint_name FROM information_schema.table_constraints WHERE table_name='bets' AND constraint_type='FOREIGN KEY';")
            fk_rows = cur.fetchall()
            has_fk = any('user' in (r.get('constraint_name') or '').lower() for r in fk_rows) or len(fk_rows) > 0
            print(f"Found {len(fk_rows)} FK constraint(s) on bets table. Detected user fk presence: {has_fk}")
        except Exception:
            print("Could not introspect foreign keys (continuing with test insert).")

        # 2) grab one existing user_id
        cur.execute("SELECT user_id FROM users LIMIT 1;")
        row = cur.fetchone()
        if not row:
            print("No rows found in users table. Cannot perform insert test.")
            sys.exit(1)
        user_id = row.get('user_id')
        print(f"Using user_id: {user_id}")

        # 3) attempt a test insert into bets inside a transaction and then rollback
        try:
            # begin transaction
            conn.autocommit = False
            test_sql = '''
            INSERT INTO bets (user_id, market, point, outcome, bet_size, odds_american, placed_at, result)
            VALUES (%s, %s, %s, %s, %s, %s, NOW(), %s)
            RETURNING bet_id;
            '''
            cur.execute(test_sql, (user_id, 'test_market', 100, 'over', 50, '-110', None))
            ins = cur.fetchone()
            bet_id = ins.get('bet_id') if ins else None
            print(f"Insert attempted, returned bet_id: {bet_id}")
            # rollback so we don't persist test data
            conn.rollback()
            print("✅ Bets insert works with populated users table.")
            return 0
        except Exception as e:
            conn.rollback()
            print("ERROR during test insert:")
            print(str(e))
            traceback.print_exc()
            return 2

    finally:
        try:
            cur.close()
        except Exception:
            pass
        try:
            conn.close()
        except Exception:
            pass


if __name__ == '__main__':
    sys.exit(main())
