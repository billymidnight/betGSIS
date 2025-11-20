import { Router } from 'express';
import { query } from '../db';

const router = Router();

// List tasks (bets, positions). Placeholder implementation — replace with real SQL.
router.get('/', async (_req, res) => {
  // Example: SELECT * FROM tasks ORDER BY created_at DESC
  // For now return a sample payload
  res.json({ tasks: [] });
});

// Create task
router.post('/', async (req, res) => {
  const payload = req.body;
  // TODO: insert into db
  res.status(201).json({ created: true, payload });
});

// Update task
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const payload = req.body;
  // TODO: update db
  res.json({ updated: true, id, payload });
});

// Delete task
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  // TODO: delete from db
  res.json({ deleted: true, id });
});

export default router;
