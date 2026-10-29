import { AppError } from './errors.js';

// The only code that changes stock. Every change locks the stock row, updates the
// quantity and writes its stock_movements row in the caller's transaction, so `stock`
// always equals the sum of its movements - even when a request fails half-way.
// Purchase and sales orders reuse changeStock for receiving, selling and cancelling.

export const ADJUSTMENT_REASONS = {
  stock_take: 'Stock take',
  damaged: 'Damaged',
  lost: 'Lost',
  found: 'Found',
  other: 'Other',
};

// Stock-specific failures (not enough stock, inactive warehouse...).
export class StockError extends AppError {}

const pad = (n) => String(n).padStart(6, '0');

// Locks the stock rows of one product in the given warehouses, creating missing rows
// with quantity 0. Rows are always locked in ascending warehouse order, so two
// transfers in opposite directions wait for each other instead of deadlocking.
// Returns { [warehouseId]: quantity }.
export async function lockStock(conn, productId, warehouseIds) {
  const ids = [...new Set(warehouseIds)].sort((a, b) => a - b);
  const quantities = {};
  for (const warehouseId of ids) {
    await conn.query(
      `INSERT INTO stock (product_id, warehouse_id, quantity) VALUES (?, ?, 0)
       ON DUPLICATE KEY UPDATE quantity = quantity`,
      [productId, warehouseId]
    );
    const [[row]] = await conn.query(
      'SELECT quantity FROM stock WHERE product_id = ? AND warehouse_id = ? FOR UPDATE',
      [productId, warehouseId]
    );
    quantities[warehouseId] = row.quantity;
  }
  return quantities;
}

// Adds `change` (negative to remove) to one product in one warehouse and records why.
// Must run inside a transaction. Throws StockError if stock would go below 0.
export async function changeStock(conn, {
  productId, warehouseId, change, type, referenceType = null, referenceId = null, note = null, userId,
}) {
  if (!Number.isInteger(change) || change === 0) throw new Error(`Invalid stock change: ${change}`);
  const { [warehouseId]: quantity } = await lockStock(conn, productId, [warehouseId]);
  const balance = quantity + change;
  if (balance < 0) {
    throw new StockError(`Not enough stock: ${quantity} available, ${-change} needed`, 409, {
      reason: 'insufficient_stock', productId, warehouseId, available: quantity,
    });
  }
  await conn.query(
    'UPDATE stock SET quantity = ?, version = version + 1 WHERE product_id = ? AND warehouse_id = ?',
    [balance, productId, warehouseId]
  );
  await conn.query(
    `INSERT INTO stock_movements
       (product_id, warehouse_id, type, quantity_change, balance_after, reference_type, reference_id, note, user_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [productId, warehouseId, type, change, balance, referenceType, referenceId, note, userId]
  );
  return balance;
}

async function loadProduct(conn, productId) {
  const [[product]] = await conn.query('SELECT id, sku, name FROM products WHERE id = ?', [productId]);
  if (!product) throw new StockError('Product not found', 404);
  return product;
}

// Warehouses keyed by id; inactive ones can't receive stock or be adjusted. The share
// lock makes deactivating a warehouse (which locks its row) wait for this transaction.
// LOCK IN SHARE MODE rather than FOR SHARE, which MariaDB 10.4 doesn't support.
async function loadWarehouses(conn, ids) {
  const [rows] = await conn.query(
    'SELECT id, code, name, is_active FROM warehouses WHERE id IN (?) LOCK IN SHARE MODE',
    [ids]
  );
  const byId = Object.fromEntries(rows.map((w) => [w.id, w]));
  for (const id of ids) {
    if (!byId[id]) throw new StockError('Warehouse not found', 404);
  }
  return byId;
}

// Moves units of one product between two warehouses: transfer_out at the source and
// transfer_in at the destination, in one transaction.
export async function transferStock(conn, { productId, fromWarehouseId, toWarehouseId, quantity, note = null, userId }) {
  const product = await loadProduct(conn, productId);
  const warehouses = await loadWarehouses(conn, [fromWarehouseId, toWarehouseId]);
  if (!warehouses[toWarehouseId].is_active) {
    throw new StockError(`${warehouses[toWarehouseId].name} is inactive and can't receive stock`, 400);
  }

  // Lock both rows up front (in a fixed order) before checking anything.
  const before = await lockStock(conn, productId, [fromWarehouseId, toWarehouseId]);
  if (before[fromWarehouseId] < quantity) {
    throw new StockError(
      `Not enough stock in ${warehouses[fromWarehouseId].name}: ${before[fromWarehouseId]} available, ${quantity} requested`,
      409,
      { reason: 'insufficient_stock', productId, warehouseId: fromWarehouseId, available: before[fromWarehouseId] }
    );
  }

  // The number comes from the id, so insert with a unique placeholder first.
  const [result] = await conn.query(
    `INSERT INTO stock_transfers (transfer_number, product_id, from_warehouse_id, to_warehouse_id, quantity, note, created_by, created_at)
     VALUES (UUID_SHORT(), ?, ?, ?, ?, ?, ?, NOW())`,
    [productId, fromWarehouseId, toWarehouseId, quantity, note, userId]
  );
  const id = result.insertId;
  const transferNumber = `TR-${pad(id)}`;
  await conn.query('UPDATE stock_transfers SET transfer_number = ? WHERE id = ?', [transferNumber, id]);

  const ref = { referenceType: 'stock_transfer', referenceId: id, note, userId, productId };
  const fromQuantity = await changeStock(conn, { ...ref, warehouseId: fromWarehouseId, change: -quantity, type: 'transfer_out' });
  const toQuantity = await changeStock(conn, { ...ref, warehouseId: toWarehouseId, change: quantity, type: 'transfer_in' });

  return {
    id, transferNumber, quantity,
    product: { id: product.id, sku: product.sku, name: product.name },
    from: { warehouseId: fromWarehouseId, code: warehouses[fromWarehouseId].code, quantity: fromQuantity },
    to: { warehouseId: toWarehouseId, code: warehouses[toWarehouseId].code, quantity: toQuantity },
  };
}

// Sets one product's quantity in one warehouse to what was counted, writing the
// difference as an adjustment. expectedQuantity is what the user saw: if stock changed
// since then (e.g. a sale), the adjustment is refused instead of overwriting it.
export async function adjustStock(conn, { productId, warehouseId, countedQuantity, expectedQuantity, reason, note = null, userId }) {
  const product = await loadProduct(conn, productId);
  const warehouses = await loadWarehouses(conn, [warehouseId]);
  if (!warehouses[warehouseId].is_active) {
    throw new StockError(`${warehouses[warehouseId].name} is inactive`, 400);
  }

  const { [warehouseId]: current } = await lockStock(conn, productId, [warehouseId]);
  if (expectedQuantity !== undefined && expectedQuantity !== current) {
    throw new StockError(
      `Stock changed while you were counting: it is now ${current}, not ${expectedQuantity}. Check the count and try again.`,
      409,
      { reason: 'stock_changed', productId, warehouseId, available: current }
    );
  }
  const change = countedQuantity - current;
  if (change === 0) throw new StockError(`The quantity is already ${current}`, 400);

  const label = ADJUSTMENT_REASONS[reason];
  const quantity = await changeStock(conn, {
    productId, warehouseId, change, type: 'adjustment', note: note ? `${label}: ${note}` : label, userId,
  });
  return {
    product: { id: product.id, sku: product.sku, name: product.name },
    warehouseId, change, quantity,
  };
}
