Dev notes / next steps for backend

- Install dependencies: npm ci (backend)
- Add DATABASE_URL from Supabase or local Postgres
- Create DB schemas (users, tasks/bets, positions, pnl)
- Implement auth /register and /login to persist users (or integrate Supabase auth)
- Implement tasks CRUD using parameterized SQL in `backend/src/routes/tasks.ts`
