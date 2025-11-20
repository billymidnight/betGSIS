Geo-Book — Sportsbook-style Task Tracker (scaffold)

This repository is a starter scaffold for a sportsbook-style task tracker (P&L, odds/pricing, bet tracking).

High-level:
- Frontend: React + Vite + TypeScript (green-on-black Bloomberg-like theme)
- Backend: Node.js + Express + TypeScript with JWT auth stubs
- Database: Supabase Postgres (use DATABASE_URL / SUPABASE_* envs)
- Docker: Dockerfiles + optional docker-compose for local Postgres
- CI: GitHub Actions to run tests for frontend and backend

This scaffold creates the minimal files and wiring to get started. It intentionally keeps business logic minimal — fill in domain models (bets, markets, odds, P&L) and secure behavior as you go.

Next steps (developer):
1. Provide Supabase credentials in backend/.env or in CI secrets (SUPABASE_URL, SUPABASE_KEY, DATABASE_URL, JWT_SECRET).
2. From project root run locally:

  - Backend: cd backend && npm install && npm run dev
  - Frontend: cd frontend && npm install && npm run dev

3. Or use docker-compose for an optional local Postgres: docker-compose up --build

Files added:
- `backend/` — Express + TypeScript starter with JWT auth stubs and tasks routes
- `frontend/` — Vite + React + TypeScript starter with a green/black theme
- `docker-compose.yml` — optional local Postgres for development
- `.github/workflows/ci.yml` — CI to run tests

If you want, I can now:
- wire real DB schemas for bets, users, and P&L
- implement the bets CRUD and pricing endpoints
- add Supabase auth integration

Tell me which of those you want next and provide Supabase credentials when ready.
