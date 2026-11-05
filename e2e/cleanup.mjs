// Deletes everything the browser tests create, recognised by its E2E name or code. Runs before
// the tests, in case an earlier run was stopped, and after them. Run from server/, so it finds
// server/.env.
import { ensureDatabase, pool } from '../server/src/db/pool.js';
import { ensureSchema } from '../server/src/db/schema.js';

const USERS = "SELECT id FROM users WHERE email LIKE 'e2e-%@test.invalid'";
const PRODUCTS = "SELECT id FROM products WHERE sku LIKE 'E2E-%'";
const WAREHOUSES = "SELECT id FROM warehouses WHERE code LIKE 'E2E%'";
const CUSTOMERS = "SELECT id FROM customers WHERE name LIKE 'E2E %'";
const SUPPLIERS = "SELECT id FROM suppliers WHERE name LIKE 'E2E %'";

// In the order the foreign keys need. Order lines go with their orders.
const STATEMENTS = [
  `DELETE FROM stock_movements WHERE product_id IN (${PRODUCTS}) OR warehouse_id IN (${WAREHOUSES}) OR user_id IN (${USERS})`,
  `DELETE FROM stock_transfers WHERE product_id IN (${PRODUCTS}) OR from_warehouse_id IN (${WAREHOUSES}) OR to_warehouse_id IN (${WAREHOUSES}) OR created_by IN (${USERS})`,
  `DELETE FROM stock WHERE product_id IN (${PRODUCTS}) OR warehouse_id IN (${WAREHOUSES})`,
  `DELETE FROM sales_orders WHERE customer_id IN (${CUSTOMERS}) OR warehouse_id IN (${WAREHOUSES}) OR created_by IN (${USERS}) OR cancelled_by IN (${USERS})`,
  `DELETE FROM purchase_orders WHERE supplier_id IN (${SUPPLIERS}) OR warehouse_id IN (${WAREHOUSES}) OR created_by IN (${USERS})`,
  `DELETE FROM audit_logs WHERE user_id IN (${USERS})`,
  "DELETE FROM products WHERE sku LIKE 'E2E-%'",
  "DELETE FROM categories WHERE code LIKE 'E2E%'",
  "DELETE FROM warehouses WHERE code LIKE 'E2E%'",
  "DELETE FROM customers WHERE name LIKE 'E2E %'",
  "DELETE FROM suppliers WHERE name LIKE 'E2E %'",
  "DELETE FROM users WHERE email LIKE 'e2e-%@test.invalid'",
];

try {
  await ensureDatabase();
  await ensureSchema();
  for (const sql of STATEMENTS) await pool.query(sql);
} finally {
  await pool.end();
}
