import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { ensureDatabase } from './config/db.js';
import healthRouter from './routes/health.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));
app.use(express.json());

app.use('/api/health', healthRouter);

app.use((req, res) => res.status(404).json({ message: 'Not found' }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: 'Internal server error' });
});

try {
  await ensureDatabase();
  console.log(`Database "${process.env.DB_NAME}" is ready`);
} catch (err) {
  console.error('Could not connect to MySQL - check server/.env:', err.message || err.code);
}

app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
