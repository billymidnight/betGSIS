"""One-time migration to add a non-null `screen_name` column to `users`.

Steps performed:
 - Adds `screen_name` text column with default 'unknown' if missing
 - Backfills provided known users with their screen names
 - Sets the column NOT NULL and removes the default
 - Writes a marker file to avoid re-running

Run once from repo root:
    python backend/tools/migrate_add_screen_name.py

Do not re-run unless you delete the marker file.
"""
import os
import sys
import logging

try:
    from db import get_conn
except Exception as e:
    print('Failed to import get_conn from db.py:', e)
    sys.exit(1)

MARKER = os.path.join(os.path.dirname(__file__), '..', '.migrate_add_screen_name_done')

backfill = {
    'f07ab392-2d93-41a6-9126-8ebc274fc6a4': 'JohnnySack',
    'dbf95db8-4c38-4e0f-a1ab-a29730d8e628': 'PaulieWalnuts',
}


def main():
    if os.path.exists(MARKER):
        print('Migration marker found; skipping migration.')
        return

    conn = None
    try:
        conn = get_conn()
        with conn.cursor() as cur:
            print('Adding column screen_name if not exists (with default)')
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS screen_name text DEFAULT 'unknown'")
            # Backfill known users
            for uid, name in backfill.items():
                print(f'Backfilling {uid} -> {name}')
                cur.execute('UPDATE users SET screen_name = %s WHERE user_id = %s', (name, uid))
            conn.commit()

            print('Setting screen_name NOT NULL')
            cur.execute("ALTER TABLE users ALTER COLUMN screen_name SET NOT NULL")
            print('Dropping default for screen_name')
            cur.execute("ALTER TABLE users ALTER COLUMN screen_name DROP DEFAULT")
            conn.commit()

        try:
            with open(MARKER, 'w') as f:
                f.write('migrated')
        except Exception as e:
            print('Warning: failed to write migration marker:', e)

        print('Migration completed successfully.')
    except Exception:
        logging.exception('migrate_add_screen_name error')
        print('Migration failed; check logs')
    finally:
        if conn:
            conn.close()


if __name__ == '__main__':
    main()
