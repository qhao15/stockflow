import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = process.env;

// Create the database on first run so no manual SQL step is needed.
export async function ensureDatabase() {
  const conn = await mysql.createConnection({
    host: DB_HOST,
    port: Number(DB_PORT),
    user: DB_USER,
    password: DB_PASSWORD,
  });
  await conn.query(
    `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await conn.end();
}

export const pool = mysql.createPool({
  host: DB_HOST,
  port: Number(DB_PORT),
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  // DATE columns (e.g. a PO's expected date) stay 'YYYY-MM-DD' text: as JS Dates they'd
  // become midnight in the server's time zone and could show as the previous day elsewhere.
  dateStrings: ['DATE'],
});

const RETRYABLE = new Set(['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT']);

// Runs fn(conn) in a transaction: commit if it resolves, roll back if it throws.
// A deadlock rolls the whole transaction back in MySQL, so it is safe to run it again.
export async function withTransaction(fn, { retries = 2 } = {}) {
  for (let attempt = 0; ; attempt += 1) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const result = await fn(conn);
      await conn.commit();
      return result;
    } catch (err) {
      await conn.rollback().catch(() => {});
      if (!RETRYABLE.has(err.code) || attempt >= retries) throw err;
    } finally {
      conn.release();
    }
  }
}
