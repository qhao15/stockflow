// Measures the dashboard reports: the time of each (with a cap per query), and the EXPLAIN of
// the slow queries. For the large seed, in its own database so demo data isn't touched:
//   DB_NAME=stockflow_perf node scripts/seed.js --products 50000 --orders 100000 --force
//   DB_NAME=stockflow_perf npm run measure-reports --prefix server
import { pool } from '../src/db/pool.js';
import { getLowStock, getRevenue, getSummary, getTopProducts } from '../src/services/reports.js';

const CAP_SECONDS = 120; // per query; MariaDB stops a statement after this long
const QUICK_MS = 60_000; // a report this quick is run twice more, for a median

pool.on('connection', (conn) => conn.query(`SET SESSION max_statement_time = ${CAP_SECONDS}`));

const day = (daysAgo) => {
  const date = new Date(Date.now() - daysAgo * 86_400_000);
  return date.toISOString().slice(0, 10);
};
const last30 = { from: day(29), to: day(0) };
const lastYear = { from: day(364), to: day(0) };

const reports = [
  ['Summary (KPI cards)', () => getSummary({ includeRevenue: true })],
  ['Revenue per day, 30 days', () => getRevenue({ group: 'day', ...last30 })],
  ['Revenue per month, 1 year', () => getRevenue({ group: 'month', ...lastYear })],
  ['Top products, 30 days', () => getTopProducts({ by: 'quantity', ...last30 })],
  ['Top products, 1 year', () => getTopProducts({ by: 'revenue', ...lastYear })],
  ['Low stock', () => getLowStock({ limit: 10 })],
];

// The same SQL the reports run, for EXPLAIN.
const explained = [
  ['Revenue totals, 30 days', `SELECT DATE_FORMAT(order_date, '%Y-%m-%d') AS period, COUNT(*), SUM(total_amount)
    FROM sales_orders WHERE status = 'completed' AND order_date >= '${last30.from}' AND order_date < '${last30.to}' + INTERVAL 1 DAY GROUP BY period`],
  ['Revenue costs, 30 days', `SELECT DATE_FORMAT(o.order_date, '%Y-%m-%d') AS period, SUM(i.quantity * i.unit_cost)
    FROM sales_orders o JOIN sales_order_items i ON i.sales_order_id = o.id
    WHERE o.status = 'completed' AND o.order_date >= '${last30.from}' AND o.order_date < '${last30.to}' + INTERVAL 1 DAY GROUP BY period`],
  ['Top products, 30 days', `SELECT p.id, SUM(i.quantity) AS quantity
    FROM sales_orders o JOIN sales_order_items i ON i.sales_order_id = o.id JOIN products p ON p.id = i.product_id
    WHERE o.status = 'completed' AND o.order_date >= '${last30.from}' AND o.order_date < '${last30.to}' + INTERVAL 1 DAY
    GROUP BY p.id ORDER BY quantity DESC LIMIT 10`],
];

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

const [[size]] = await pool.query(`SELECT (SELECT COUNT(*) FROM sales_orders) AS orders,
  (SELECT COUNT(*) FROM sales_order_items) AS items, (SELECT COUNT(*) FROM products) AS products,
  @@innodb_buffer_pool_size / 1024 / 1024 AS buffer_mb, DATABASE() AS db, VERSION() AS version`);
console.log(`${size.db} on ${size.version}: ${size.orders} orders, ${size.items} lines, ${size.products} products, buffer pool ${Number(size.buffer_mb)} MB`);
const [indexes] = await pool.query("SELECT DISTINCT INDEX_NAME AS name FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sales_orders'");
console.log(`sales_orders indexes: ${indexes.map((i) => i.name).join(', ')}\n`);

console.log(`Capped at ${CAP_SECONDS} s per query. Median of 3 runs if quick; first run in brackets (colder cache)`);
for (const [name, run] of reports) {
  const times = [];
  try {
    do {
      const start = process.hrtime.bigint();
      await run();
      times.push(Number(process.hrtime.bigint() - start) / 1e6);
    } while (times.length < 3 && times[0] < QUICK_MS);
    console.log(`  ${name.padEnd(28)} ${median(times).toFixed(0).padStart(7)} ms  (${times[0].toFixed(0)} ms)`);
  } catch (err) {
    if (err.errno !== 1969) throw err; // 1969: stopped by max_statement_time
    console.log(`  ${name.padEnd(28)} over ${CAP_SECONDS} s (stopped at the cap)`);
  }
}

console.log('\nEXPLAIN');
for (const [name, sql] of explained) {
  const [plan] = await pool.query(`EXPLAIN ${sql}`);
  console.log(`  ${name}`);
  for (const row of plan) {
    console.log(`    ${String(row.table).padEnd(4)} type=${String(row.type).padEnd(7)} key=${String(row.key).padEnd(22)} rows=${String(row.rows).padEnd(8)} ${row.Extra ?? ''}`);
  }
}

await pool.end();
