"""One-time manual seed for two known users.

This script inserts two manual users into the `users` table if they do not already exist.
It writes a marker file `backend/.seed_manual_users_done` after running successfully so it won't run again.

Run once from the repository root via:
    python backend/tools/seed_manual_users.py

Do NOT re-run after it completes.
"""
import os
import sys
import logging

# Import DB helper - expects backend/db.py to expose get_conn()
try:
    from db import get_conn
except Exception as e:
    print("Failed to import get_conn from db.py:", e)
    sys.exit(1)

MARKER = os.path.join(os.path.dirname(__file__), '..', '.seed_manual_users_done')

users_to_insert = [
    {
        'user_id': 'f07ab392-2d93-41a6-9126-8ebc274fc6a4',
        'email': 'paulhubbly7418@gmail.com',
        'password': 'manual',
        'screen_name': 'JohnnySack',
    },
    {
        'user_id': 'dbf95db8-4c38-4e0f-a1ab-a29730d8e628',
        'email': 'jessicabishop@gmail.com',
        'password': 'manual',
        'screen_name': 'PaulieWalnuts',
    }
]


def main():
    # Prevent accidental reruns
    if os.path.exists(MARKER):
        print('Seed marker found; aborting to avoid duplicate/manual re-run.')
        return

    conn = None
    try:
        conn = get_conn()
        with conn.cursor() as cur:
            for u in users_to_insert:
                print(f"Upserting user {u['email']} ({u['user_id']})")
                # Ensure role is populated (schema requires role NOT NULL)
                cur.execute(
                    '''
                    INSERT INTO users (user_id, email, password, screen_name, role, created_at, net_pnl)
                    VALUES (%s, %s, %s, %s, %s, NOW(), 0)
                    ON CONFLICT (user_id) DO NOTHING
                    ''',
                    (u['user_id'], u['email'], u['password'], u['screen_name'], 'BETTOR')
                )
        conn.commit()
        # Write marker so script won't run again
        try:
            with open(MARKER, 'w') as f:
                f.write('seeded')
        except Exception as e:
            print('Warning: failed to write marker file:', e)

        print('Seed completed successfully.')
    except Exception as e:
        logging.exception('seed_manual_users error')
        print('Error while seeding users:', e)
    finally:
        if conn:
            conn.close()


if __name__ == '__main__':
    main()
