import dotenv from 'dotenv';
import { ensureDatabase } from './db/pool.js';
import { ensureSchema } from './db/schema.js';
import app from './app.js';

dotenv.config();

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is missing - add it to server/.env (see .env.example)');
  process.exit(1);
}

const PORT = process.env.PORT || 5000;

try {
  await ensureDatabase();
  await ensureSchema();
  console.log(`Database "${process.env.DB_NAME}" is ready`);
} catch (err) {
  console.error('Could not connect to MySQL - check server/.env:', err.message || err.code);
}

app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
