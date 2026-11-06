import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, DB_SSL_CA } = process.env;

// The business's time zone, for every date: what "today" and "this month" mean in reports, the
// date on an invoice, and how times travel between Node and MySQL. Set once here, for both Node
// and each database session, so it no longer depends on where the code runs (a laptop in
// Vietnam, a server in UTC). A whole-hour offset, because MySQL may not know zone names.
export const TIME_ZONE = process.env.TIME_ZONE || '+07:00';
const offset = /^([+-])(\d{2}):00$/.exec(TIME_ZONE);
if (!offset) throw new Error(`TIME_ZONE must be a whole-hour offset like +07:00, not "${TIME_ZONE}"`);
// Etc/GMT names have the opposite sign: Etc/GMT-7 is UTC+7.
process.env.TZ = `Etc/GMT${offset[1] === '+' ? '-' : '+'}${Number(offset[2])}`;

// Hosted MySQL (Aiven) needs an encrypted connection; local XAMPP doesn't use one.
const ssl = DB_SSL_CA ? { ca: DB_SSL_CA } : undefined;

// Create the database on first run so no manual SQL step is needed.
export async function ensureDatabase() {
  const conn = await mysql.createConnection({
    host: DB_HOST,
    port: Number(DB_PORT),
    user: DB_USER,
    password: DB_PASSWORD,
    ssl,
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
  ssl,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  // DATE columns (e.g. a PO's expected date) stay 'YYYY-MM-DD' text: as JS Dates they'd
  // become midnight in the server's time zone and could show as the previous day elsewhere.
  dateStrings: ['DATE'],
});

// NOW(), DATE_FORMAT and TIMESTAMP columns follow the session's time zone.
pool.pool.on('connection', (conn) => conn.query(`SET time_zone = '${TIME_ZONE}'`));

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
