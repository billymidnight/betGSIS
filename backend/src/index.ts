import express from 'express';
import dotenv from 'dotenv';
import authRouter from './routes/auth';
import tasksRouter from './routes/tasks';
import { pool } from './db';

dotenv.config();

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/auth', authRouter);
app.use('/tasks', tasksRouter);

const port = process.env.PORT || 4000;
app.listen(port, () => {
	console.log(`Backend listening on ${port}`);
	// Test DB connectivity
	pool.query('SELECT 1').then(() => {
		console.log('Database connection successful');
	}).catch((err) => {
		console.error('Database connection error:', err.message || err);
	});
});

export default app;
