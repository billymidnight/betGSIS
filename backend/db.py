import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv('SUPABASE_DB_URL') or os.getenv('DATABASE_URL')

if DATABASE_URL:
    # SQLAlchemy engine; psycopg2 driver used via connection string
    engine = create_engine(DATABASE_URL, future=True)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
else:
    engine = None
    SessionLocal = None

def get_session():
    if SessionLocal is None:
        raise RuntimeError('DATABASE_URL not configured')
    return SessionLocal()

def test_connection():
    if engine is None:
        raise RuntimeError('DATABASE_URL not configured')
    with engine.connect() as conn:
        r = conn.execute(text('SELECT 1'))
        return r.scalar()
"""Simple DB helper using psycopg2. Exposes get_conn() and a convenience query() helper.
"""
import os
from dotenv import load_dotenv
import psycopg2
from psycopg2.extras import RealDictCursor

load_dotenv()

DATABASE_URL = os.getenv('SUPABASE_DB_URL') or os.getenv('DATABASE_URL')

def get_conn():
    if not DATABASE_URL:
        raise RuntimeError('DATABASE_URL / SUPABASE_DB_URL not set')
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)

def query(sql, params=None):
    conn = None
    try:
        conn = get_conn()
        with conn.cursor() as cur:
            cur.execute(sql, params or [])
            try:
                return cur.fetchall()
            except psycopg2.ProgrammingError:
                return None
    finally:
        if conn:
            conn.close()
