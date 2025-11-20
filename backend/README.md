# betGSIS Sportsbook — Backend (Flask)

This folder contains a Flask backend for betGSIS Sportsbook. It exposes JSON APIs for ingesting GeoGuessr CSVs, analytics, pricing, markets and bets.

Quick start (Windows PowerShell):

1. Create a virtualenv and activate it:

   python -m venv .venv
   .\.venv\Scripts\Activate.ps1

2. Install dependencies:

   pip install -r requirements.txt

3. Provide environment variables in `backend/.env` (copy `.env.example`):

   SUPABASE_DB_URL=postgresql://postgres:<PASSWORD>@db.<PROJECT_REF>.supabase.co:5432/postgres?sslmode=require
   SUPABASE_KEY=your-supabase-key
   PORT=4000

4. Initialize the database (use psql or Supabase SQL editor) by running the SQL in `backend/sql/init_schema.sql`.

5. Run the server:

   python app.py

Endpoints (examples):
- GET /api/health
- POST /api/ingest/csv  (form-data file upload)
- GET /api/analytics/players
- GET /api/analytics/player/:id/stats
- POST /api/pricing/lines
- POST /api/bets/place

Note: This is a scaffold. Many services and models are stubs and need business logic wired to the database. If you want, I can continue implementing the stats/pricing integration and frontend wiring.
# Backend (Express + TypeScript)


This folder now contains a Python Flask backend (migrated from Node/Express for this scaffold).

Quick start (local):

1. Create a virtual environment (recommended) and install dependencies:

	python -m venv .venv
	.\.venv\Scripts\Activate.ps1  # PowerShell
	pip install -r requirements.txt

2. Provide your Supabase/Postgres connection string in `backend/.env` as `SUPABASE_DB_URL` or set `DATABASE_URL`.

3. Run the app:

	python app.py

Endpoints:

- GET /health — returns {"status":"ok"}
- POST /calculate — accepts JSON {op: 'sum'|'avg'|'mul', values: [numbers]} and returns {result: number}
- GET /users — returns mock users list (for now)

DB:
- `backend/db.py` contains a minimal psycopg2 helper. Schema migrations are not yet provided — we'll add them when you're ready to define tables (users, bets, pnl, markets).

Docker: You can run this app in a container later; for now run locally with python.

