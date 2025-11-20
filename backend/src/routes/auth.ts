import { Router } from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();
const router = Router();

// Guest login: returns a signed JWT for quick access
router.post('/guest', (_req, res) => {
  const secret = process.env.JWT_SECRET || 'dev_secret';
  const token = jwt.sign({ role: 'guest' }, secret, { expiresIn: '30d' });
  res.json({ token });
});

// TODO: implement /register and /login using users table in Postgres (Supabase)

export default router;
