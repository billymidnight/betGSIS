#!/usr/bin/env python3
"""
One-time script to copy all users from Supabase `auth.users` into `public.users`.

Behavior:
- For each row in auth.users (id, email, created_at) insert into public.users:
    user_id = id
    email = email
    password = 'oauth'
    created_at = created_at
  using ON CONFLICT (user_id) DO NOTHING to avoid duplicates.

- Prints a summary on completion.

Run once:
    python backend/tools/sync_supabase_users.py

Do NOT re-run automatically; treat this as a one-time migration helper.
"""
import os
import sys
import logging

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
except Exception as e:
    print("psycopg2 is required to run this script. Install it first (e.g. pip install psycopg2-binary).", file=sys.stderr)
    print("Import error:", e, file=sys.stderr)
    sys.exit(1)


def get_db_conn():
    # Prefer common env vars used by Supabase and apps
    db_url = (
        os.getenv("DATABASE_URL")
        or os.getenv("SUPABASE_DB_URL")
        or os.getenv("SUPABASE_DATABASE_URL")
        or os.getenv("POSTGRES_URL")
    )
    if not db_url:
        raise RuntimeError("Database connection URL not found. Set DATABASE_URL or SUPABASE_DB_URL in the environment.")
    return psycopg2.connect(db_url)


def main():
    conn = None
    total = 0
    inserted = 0
    skipped_no_email = 0
    try:
        conn = get_db_conn()
        # Use autocommit = False and commit at end
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Fetch from auth.users
            cur.execute("SELECT id, email, created_at FROM auth.users")
            rows = cur.fetchall()
            total = len(rows or [])
            if total == 0:
                print("No users found in auth.users; nothing to do.")
                return

            for r in rows:
                uid = r.get("id")
                email = r.get("email")
                created_at = r.get("created_at")  # may be None

                if not email:
                    skipped_no_email += 1
                    print(f"Skipping user {uid} because email is NULL.")
                    continue

                # Insert into public.users with placeholder password 'oauth'
                cur.execute(
                    """
                    INSERT INTO public.users (user_id, email, password, created_at)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (user_id) DO NOTHING
                    """,
                    (str(uid), email, "oauth", created_at),
                )

                # Some adapters don't set rowcount reliably for inserts with ON CONFLICT DO NOTHING.
                # We can count inserts by checking if the row exists now (but to avoid extra queries we
                # rely on rowcount when available).
                try:
                    if cur.rowcount and cur.rowcount > 0:
                        inserted += 1
                except Exception:
                    pass

        conn.commit()

        # A conservative check for inserted count: if rowcount wasn't reliable, do a post-check by
        # counting how many of the processed user_ids exist in public.users. This is optional and
        # only executed if inserted==0 to avoid extra DB work on large installs.
        if inserted == 0 and total > 0:
            try:
                with conn.cursor() as cur2:
                    cur2.execute(
                        "SELECT count(*) FROM public.users WHERE user_id IN (SELECT id FROM auth.users)"
                    )
                    cnt = cur2.fetchone()[0]
                    print(f"public.users now contains {cnt} users whose ids exist in auth.users (may include prior entries).")
            except Exception:
                pass

        print(f"Sync completed: processed {total} users from auth.users.")
        print(f"Inserted (new) users into public.users (best-effort count): {inserted}")
        if skipped_no_email:
            print(f"Skipped {skipped_no_email} users with NULL email (public.users.email is NOT NULL).")
        print("One-time sync finished successfully.")
    except Exception as e:
        logging.exception("Error during supabase -> public.users sync")
        print("Failed to sync users:", str(e), file=sys.stderr)
        if conn:
            try:
                conn.rollback()
            except Exception:
                pass
        sys.exit(1)
    finally:
        if conn:
            try:
                conn.close()
            except Exception:
                pass


if __name__ == "__main__":
    main()