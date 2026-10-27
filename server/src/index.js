import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { ensureDatabase } from './config/db.js';
import { ensureSchema } from './db/schema.js';
import healthRouter from './routes/health.js';
import authRouter from './routes/auth.js';
import usersRouter from './routes/users.js';
import accountRouter from './routes/account.js';

dotenv.config();

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is missing - add it to server/.env (see .env.example)');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));
app.use(express.json());

app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/account', accountRouter);

app.use((req, res) => res.status(404).json({ message: 'Not found' }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: 'Internal server error' });
});

try {
  await ensureDatabase();
  await ensureSchema();
  console.log(`Database "${process.env.DB_NAME}" is ready`);
} catch (err) {
  console.error('Could not connect to MySQL - check server/.env:', err.message || err.code);
}

app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
