// Fills the database with demo data by simulating a year of business day by day:
// opening stock, daily sales, cancellations, transfers between warehouses and
// purchase orders that restock low items. Every stock change writes a
// stock_movements row, so stock.quantity always equals the sum of its movements.
// The random generator is seeded, so the same options always give the same data.
//
// Usage: npm run seed -- [--products N] [--orders N] [--days N] [--force]
//   default: the base catalog (190 products) and 10,000 sales orders over 365 days
//   large:   npm run seed -- --products 50000 --orders 100000 --force
//
// Replaces all business data (products, stock, orders, ...). User accounts are
// kept; the demo accounts are created or reset.
import bcrypt from 'bcryptjs';
import { ensureDatabase, pool } from '../src/db/pool.js';
import { ensureSchema } from '../src/db/schema.js';
import {
  DEMO_PASSWORD, brandCodes, cancelReasons, catalog, customerNames, demoUsers, people, streets,
  suppliers as supplierDefs, warehouses as warehouseDefs,
} from './seed-data.js';

// ---------- options ----------

function parseArgs(argv) {
  const opts = { products: 0, orders: 10000, days: 365, force: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--force') opts.force = true;
    else if (['--products', '--orders', '--days'].includes(arg)) {
      const value = Number(argv[++i]);
      if (!Number.isInteger(value) || value < 1) throw new Error(`${arg} needs a positive whole number`);
      opts[arg.slice(2)] = value;
    } else throw new Error(`Unknown option: ${arg}`);
  }
  return opts;
}

let opts;
try {
  opts = parseArgs(process.argv.slice(2));
} catch (err) {
  console.error(err.message);
  console.error('Usage: npm run seed -- [--products N] [--orders N] [--days N] [--force]');
  process.exit(1);
}

// ---------- random helpers (seeded, mulberry32) ----------

let rngState = 20261027;
function rand() {
  rngState = (rngState + 0x6d2b79f5) | 0;
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const int = (min, max) => min + Math.floor(rand() * (max - min + 1));
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const chance = (p) => rand() < p;
const round2 = (n) => Math.round(n * 100) / 100;
// Low values more likely: used for quantities and "busier" customers.
const skewedInt = (min, max, power = 2) => min + Math.floor(rand() ** power * (max - min + 1));

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Picks an index with probability proportional to its weight (cumulative + binary search).
function weightedPicker(weights) {
  const cumulative = new Float64Array(weights.length);
  let total = 0;
  weights.forEach((w, i) => { total += w; cumulative[i] = total; });
  return () => {
    const target = rand() * total;
    let lo = 0;
    let hi = cumulative.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cumulative[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
}

// ---------- time helpers ----------

const MINUTE = 60_000;
const now = new Date();
const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
const dayStart = (day) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - opts.days + 1 + day);
const at = (day, minutes) => new Date(dayStart(day).getTime() + minutes * MINUTE);
const dateOnly = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const pad = (n, width) => String(n).padStart(width, '0');

const SALES_OPEN = 9 * 60; // sales happen 09:00-20:00
const SALES_CLOSE = 20 * 60;
const RESTOCK_TIME = 21 * 60; // low-stock check at the end of each day

// ---------- master data ----------

async function upsertDemoUsers() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  for (const u of demoUsers) {
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), password_hash = VALUES(password_hash),
         role = VALUES(role), is_active = 1`,
      [u.name, u.email, passwordHash, u.role]
    );
  }
  const [rows] = await pool.query('SELECT id, email, role FROM users WHERE email IN (?)', [demoUsers.map((u) => u.email)]);
  const byRole = (role) => rows.filter((r) => r.role === role).map((r) => r.id);
  return { admin: byRole('admin')[0], manager: byRole('manager')[0], staff: byRole('staff') };
}

function personName() {
  return `${pick(people.family)} ${pick(people.middle)} ${pick(people.given)}`;
}
function phone() {
  return `0${pick(['9', '8', '3', '7'])}${pad(int(0, 99_999_999), 8)}`;
}
function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
function address(city) {
  return `${int(1, 350)} ${pick(streets)}, ${city}`;
}
// Prices under $100 end in .99, larger ones are whole dollars.
const retailPrice = (p) => (p < 100 ? Math.ceil(p) - 0.01 : Math.round(p));

function buildMasterData() {
  const createdAt = dayStart(-30);

  const categories = catalog.map((c, i) => ({ id: i + 1, ...c }));
  const warehouses = warehouseDefs.map((w, i) => ({ id: i + 1, ...w }));

  const suppliers = supplierDefs.map((s, i) => {
    const contact = personName();
    return {
      id: i + 1, code: `SUP-${pad(i + 1, 3)}`, name: s.name, brands: s.brands, contact,
      email: `sales@${slug(s.name)}.example`, phone: phone(), address: address(pick(warehouseDefs).city),
    };
  });
  const supplierByBrand = new Map();
  suppliers.forEach((s) => s.brands.forEach((b) => supplierByBrand.set(b, s.id)));

  // Base catalog: every brand x model x variant.
  const base = [];
  for (const cat of categories) {
    for (const [brand, models] of Object.entries(cat.brands)) {
      for (const [model, price, modelCode, modelOpts = {}] of models) {
        const variants = modelOpts.single || !cat.variants ? [null] : cat.variants;
        for (const v of variants) {
          const sku = [cat.code, brandCodes[brand], modelCode, v && v[1]].filter(Boolean).join('-');
          base.push({
            sku,
            name: v ? `${brand} ${model} ${v[0]}` : `${brand} ${model}`,
            category: cat,
            brand,
            unit: modelOpts.unit || cat.unit,
            basePrice: v ? (price + v[2]) * v[3] : price,
          });
        }
      }
    }
  }

  // --products larger than the catalog adds synthetic revisions ("Rev 2", "Rev 3", ...)
  // for performance testing; smaller takes the first N.
  const target = opts.products || base.length;
  const productDefs = base.slice(0, target);
  for (let rev = 2; productDefs.length < target; rev++) {
    for (const p of base) {
      if (productDefs.length >= target) break;
      productDefs.push({ ...p, sku: `${p.sku}-R${rev}`, name: `${p.name} Rev ${rev}`, basePrice: p.basePrice * (0.9 + rand() * 0.2) });
    }
  }

  const products = productDefs.map((p, i) => {
    const salePrice = retailPrice(p.basePrice);
    return {
      id: i + 1, sku: p.sku, name: p.name, categoryId: p.category.id, category: p.category, brand: p.brand,
      unit: p.unit, salePrice, costPrice: round2(salePrice * (0.68 + rand() * 0.17)),
      supplierId: supplierByBrand.get(p.brand) ?? 1,
    };
  });

  // Customers are spread over the warehouse cities and buy from the nearest warehouse.
  const customerCount = Math.max(60, Math.round(opts.orders / 15));
  const names = shuffle(customerNames.prefixes.flatMap((pre) => customerNames.kinds.map((k) => `${pre} ${k}`)));
  const cityPicker = weightedPicker(warehouses.map((w) => w.share));
  const customers = Array.from({ length: customerCount }, (_, i) => {
    const warehouse = warehouses[cityPicker()];
    const branch = Math.floor(i / names.length);
    const name = branch ? `${names[i % names.length]} (Branch ${branch + 1})` : names[i];
    return {
      id: i + 1, code: `CUS-${pad(i + 1, 5)}`, name, contact: personName(),
      email: `${slug(name)}@mail.example`, phone: phone(), city: warehouse.city, warehouseId: warehouse.id,
      address: address(warehouse.city), createdAt,
    };
  });

  return { categories, warehouses, suppliers, products, customers, createdAt };
}

// ---------- simulation ----------

function simulate({ warehouses, products, customers }, users) {
  const W = warehouses.length;
  const P = products.length;
  const key = (p, w) => p * W + w; // p and w are 0-based indexes
  const stock = new Int32Array(P * W);
  const version = new Int32Array(P * W);
  const pending = new Uint8Array(P * W); // a transfer or purchase order is on its way

  const movements = [];
  const salesOrders = [];
  const salesItems = [];
  const purchaseOrders = [];
  const transfers = [];
  let movementId = 0;
  let salesItemId = 0;

  const move = (p, w, type, change, refType, refId, userId, time, note = null) => {
    const k = key(p, w);
    stock[k] += change;
    version[k] += 1;
    movements.push([++movementId, p + 1, w + 1, type, change, stock[k], refType, refId, note, userId, time]);
  };

  // Product popularity: category share x a long-tail curve, so there are clear best sellers.
  const order = shuffle(products.map((_, i) => i));
  const weights = new Array(P);
  order.forEach((p, rank) => { weights[p] = products[p].category.popularity / (rank + 5) ** 0.9; });
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const pickProduct = weightedPicker(weights);

  // Expected daily units per product per warehouse decides the reorder level and stock target.
  const ordersPerDay = opts.orders / opts.days;
  for (let p = 0; p < P; p++) {
    const { qty, minStock } = products[p].category;
    const daily = ordersPerDay * 2.6 * (weights[p] / totalWeight) * ((qty[0] + qty[1]) / 2) * 0.45;
    products[p].minStock = Math.max(minStock, Math.ceil(daily * 7));
    products[p].target = products[p].minStock * 3 + Math.ceil(daily * 14);
    products[p].daily = daily;
  }

  // Opening balance the day before the simulation starts.
  const openingTime = at(-1, 8 * 60);
  for (let p = 0; p < P; p++) {
    for (let w = 0; w < W; w++) {
      const qty = Math.round(products[p].target * (0.6 + rand() * 0.4));
      if (qty > 0) move(p, w, 'opening', qty, null, null, users.admin, openingTime, 'Opening balance');
    }
  }

  // Spread the orders over the days: weekday pattern, growth over the year, busier
  // at the end of the year, and only the part of today that has already happened.
  const weekday = [0.5, 1.1, 1.1, 1.05, 1.05, 1.15, 0.8]; // Sun..Sat
  const month = [1, 0.85, 0.95, 1, 1, 0.95, 0.95, 1, 1.1, 1, 1.2, 1.3]; // Jan..Dec
  const dayWeights = Array.from({ length: opts.days }, (_, d) => {
    const date = dayStart(d);
    let w = weekday[date.getDay()] * month[date.getMonth()] * (0.75 + 0.5 * (d / opts.days));
    if (d === opts.days - 1) {
      const elapsed = (now - at(d, SALES_OPEN)) / ((SALES_CLOSE - SALES_OPEN) * MINUTE);
      w *= Math.min(1, Math.max(0, elapsed));
    }
    return w;
  });
  const weightSum = dayWeights.reduce((a, b) => a + b, 0);
  let carry = 0;
  const ordersPerDayList = dayWeights.map((w) => {
    const exact = (opts.orders * w) / weightSum + carry;
    const n = Math.floor(exact);
    carry = exact - n;
    return n;
  });

  const productsBySupplier = new Map();
  products.forEach((product, p) => {
    if (!productsBySupplier.has(product.supplierId)) productsBySupplier.set(product.supplierId, []);
    productsBySupplier.get(product.supplierId).push(p);
  });
  // Order enough to get back to the target plus a few days of sales, in round numbers.
  const reorderLine = (p, w) => {
    const product = products[p];
    let qty = product.target - stock[key(p, w)] + Math.ceil(product.daily * 4);
    qty = qty >= 20 ? Math.ceil(qty / 10) * 10 : qty >= 5 ? Math.ceil(qty / 5) * 5 : qty;
    pending[key(p, w)] = 1;
    return { p, qty, cost: product.costPrice };
  };

  const receiveByDay = new Map(); // day -> purchase orders arriving that morning
  const sellers = [...users.staff, ...users.staff, ...users.staff, users.manager]; // staff take most orders
  const pickCustomer = () => customers[skewedInt(0, customers.length - 1, 1.6)];

  for (let day = 0; day < opts.days; day++) {
    // 1. Purchase orders arriving today (only if that time has already passed).
    for (const po of receiveByDay.get(day) ?? []) {
      if (po.receivedAt > now) continue;
      for (const item of po.items) {
        move(item.p, po.w, 'purchase_receipt', item.qty, 'purchase_order', po.id, po.receivedBy, po.receivedAt);
        pending[key(item.p, po.w)] = 0;
      }
    }

    // 2. Sales orders, in time order.
    const latest = day === opts.days - 1 ? Math.min(SALES_CLOSE, (now - dayStart(day)) / MINUTE) : SALES_CLOSE;
    const times = Array.from({ length: ordersPerDayList[day] }, () => SALES_OPEN + rand() * (latest - SALES_OPEN)).sort((a, b) => a - b);
    const touched = new Set();

    times.forEach((minute, i) => {
      const customer = pickCustomer();
      const w = customer.warehouseId - 1;
      const orderDate = at(day, minute);
      const lineCount = skewedInt(1, 5);
      const lines = new Map();
      for (let attempt = 0; attempt < lineCount * 3 && lines.size < lineCount; attempt++) {
        const p = pickProduct();
        const available = stock[key(p, w)];
        if (lines.has(p) || available === 0) continue; // out of stock here: lost sale
        const [lo, hi] = products[p].category.qty;
        lines.set(p, Math.min(available, skewedInt(lo, hi)));
      }
      if (lines.size === 0) return;

      const id = salesOrders.length + 1;
      const createdBy = pick(sellers);
      let subtotal = 0;
      for (const [p, qty] of lines) {
        const price = products[p].salePrice;
        const lineTotal = round2(price * qty);
        subtotal += lineTotal;
        salesItems.push([++salesItemId, id, p + 1, qty, price, products[p].costPrice, lineTotal]);
        move(p, w, 'sale', -qty, 'sales_order', id, createdBy, orderDate);
        touched.add(key(p, w));
      }
      subtotal = round2(subtotal);
      const discount = subtotal > 2000 && chance(0.3) ? round2(subtotal * 0.05) : 0;
      const so = {
        id, customerId: customer.id, w, status: 'completed', orderDate, subtotal, discount,
        total: round2(subtotal - discount), createdBy, cancelledBy: null, cancelledAt: null, cancelReason: null,
      };
      salesOrders.push(so);

      // ~3% are cancelled shortly after, before the next order comes in; the stock goes back.
      if (chance(0.03)) {
        const next = times[i + 1] ?? Math.min(minute + 60, latest);
        const cancelledAt = at(day, (minute + next) / 2);
        if (cancelledAt <= now) {
          Object.assign(so, { status: 'cancelled', cancelledBy: users.manager, cancelledAt, cancelReason: pick(cancelReasons) });
          for (const [p, qty] of lines) {
            move(p, w, 'sale_cancel', qty, 'sales_order', id, users.manager, cancelledAt, so.cancelReason);
          }
        }
      }
    });

    // 3. End of day: restock what fell to or below its minimum.
    let restockMinute = RESTOCK_TIME;
    if (at(day, restockMinute) > now) continue;
    const reorders = new Map(); // "supplier:warehouse" -> items
    for (const k of touched) {
      const p = Math.floor(k / W);
      const w = k % W;
      const product = products[p];
      if (pending[k] || stock[k] > product.minStock) continue;
      const needed = product.target - stock[k];

      // Sometimes move stock from a warehouse that can spare at least half of what's needed,
      // instead of buying more. The donor keeps 1.5x its minimum.
      const spare = (w2) => stock[key(p, w2)] - Math.ceil(product.minStock * 1.5);
      const donor = [...Array(W).keys()].find((w2) => w2 !== w && spare(w2) >= Math.ceil(needed / 2));
      if (donor !== undefined && chance(0.3)) {
        const qty = Math.min(needed, spare(donor));
        const id = transfers.length + 1;
        const time = at(day, restockMinute++);
        transfers.push([id, `TR-${pad(id, 6)}`, p + 1, donor + 1, w + 1, qty, 'Rebalancing low stock', users.manager, time]);
        move(p, donor, 'transfer_out', -qty, 'stock_transfer', id, users.manager, time);
        move(p, w, 'transfer_in', qty, 'stock_transfer', id, users.manager, time);
        continue;
      }

      const group = `${product.supplierId}:${w}`;
      if (!reorders.has(group)) reorders.set(group, []);
      reorders.get(group).push(reorderLine(p, w));
    }

    // While ordering from a supplier anyway, also top up its other items that are getting low.
    for (const [group, items] of reorders) {
      const [supplierId, w] = group.split(':').map(Number);
      for (const p of productsBySupplier.get(supplierId)) {
        const k = key(p, w);
        if (!pending[k] && stock[k] <= products[p].minStock * 1.5) items.push(reorderLine(p, w));
      }
    }

    // One purchase order per supplier and warehouse; approved 1-4 days later (so the
    // newest are still drafts waiting for a manager) and received 2-4 days after that.
    for (const [group, items] of reorders) {
      const [supplierId, w] = group.split(':').map(Number);
      const id = purchaseOrders.length + 1;
      const approveDay = day + int(1, 4);
      const receiveDay = approveDay + int(2, 4);
      const po = {
        id, supplierId, w, items,
        orderDate: at(day, restockMinute++),
        createdBy: users.manager,
        approvedAt: at(approveDay, int(9 * 60, 11 * 60)),
        approvedBy: users.manager,
        receivedAt: at(receiveDay, int(7 * 60 + 30, 8 * 60 + 30)),
        receivedBy: users.manager,
        expectedDate: dateOnly(dayStart(receiveDay)),
      };
      purchaseOrders.push(po);
      if (!receiveByDay.has(receiveDay)) receiveByDay.set(receiveDay, []);
      receiveByDay.get(receiveDay).push(po);
    }
  }

  // Orders not yet approved/received by now stay in the earlier status.
  for (const po of purchaseOrders) {
    if (po.approvedAt > now) Object.assign(po, { status: 'draft', approvedAt: null, approvedBy: null, receivedAt: null, receivedBy: null });
    else if (po.receivedAt > now) Object.assign(po, { status: 'approved', receivedAt: null, receivedBy: null });
    else po.status = 'received';
  }

  const stockRows = [];
  for (let p = 0; p < P; p++) {
    for (let w = 0; w < W; w++) stockRows.push([p + 1, w + 1, stock[key(p, w)], version[key(p, w)]]);
  }

  return { movements, salesOrders, salesItems, purchaseOrders, transfers, stockRows };
}

// ---------- database ----------

const BUSINESS_TABLES = [
  'audit_logs', 'stock_movements', 'stock_transfers', 'sales_order_items', 'sales_orders',
  'purchase_order_items', 'purchase_orders', 'stock', 'products', 'customers', 'suppliers',
  'warehouses', 'categories',
];

async function insert(conn, table, columns, rows, chunkSize = 2000) {
  const start = Date.now();
  for (let i = 0; i < rows.length; i += chunkSize) {
    await conn.query(`INSERT INTO ${table} (${columns.join(', ')}) VALUES ?`, [rows.slice(i, i + chunkSize)]);
  }
  console.log(`  ${table.padEnd(22)} ${rows.length.toLocaleString().padStart(9)} rows  ${((Date.now() - start) / 1000).toFixed(1)}s`);
}

async function write(data, sim) {
  const conn = await pool.getConnection();
  try {
    // Standard bulk-load settings for this connection only: the generated data is
    // consistent by construction (and verified afterwards), so skipping per-row
    // foreign-key and unique lookups makes the large seed many times faster.
    // CHECK constraints still apply.
    await conn.query('SET FOREIGN_KEY_CHECKS = 0, UNIQUE_CHECKS = 0');
    for (const table of BUSINESS_TABLES) await conn.query(`TRUNCATE TABLE ${table}`);

    await conn.beginTransaction();
    const { categories, warehouses, suppliers, products, customers, createdAt } = data;
    await insert(conn, 'categories', ['id', 'code', 'name', 'description', 'created_at'],
      categories.map((c) => [c.id, c.code, c.name, c.description, createdAt]));
    await insert(conn, 'warehouses', ['id', 'code', 'name', 'city', 'address', 'created_at'],
      warehouses.map((w) => [w.id, w.code, w.name, w.city, w.address, createdAt]));
    await insert(conn, 'suppliers', ['id', 'code', 'name', 'contact_name', 'email', 'phone', 'city', 'address', 'created_at'],
      suppliers.map((s) => [s.id, s.code, s.name, s.contact, s.email, s.phone, s.address.split(',').pop().trim(), s.address, createdAt]));
    await insert(conn, 'customers', ['id', 'code', 'name', 'contact_name', 'email', 'phone', 'city', 'address', 'created_at'],
      customers.map((c) => [c.id, c.code, c.name, c.contact, c.email, c.phone, c.city, c.address, c.createdAt]));
    await insert(conn, 'products',
      ['id', 'sku', 'name', 'category_id', 'brand', 'unit', 'cost_price', 'sale_price', 'min_stock', 'created_at'],
      products.map((p) => [p.id, p.sku, p.name, p.categoryId, p.brand, p.unit, p.costPrice, p.salePrice, p.minStock, createdAt]));
    await insert(conn, 'stock', ['product_id', 'warehouse_id', 'quantity', 'version'], sim.stockRows);

    await insert(conn, 'purchase_orders',
      ['id', 'po_number', 'supplier_id', 'warehouse_id', 'status', 'order_date', 'expected_date', 'total_amount',
        'created_by', 'approved_by', 'approved_at', 'received_by', 'received_at', 'created_at'],
      sim.purchaseOrders.map((po) => [
        po.id, `PO-${pad(po.id, 6)}`, po.supplierId, po.w + 1, po.status, po.orderDate, po.expectedDate,
        round2(po.items.reduce((sum, i) => sum + i.qty * i.cost, 0)),
        po.createdBy, po.approvedBy, po.approvedAt, po.receivedBy, po.receivedAt, po.orderDate,
      ]));
    await insert(conn, 'purchase_order_items',
      ['purchase_order_id', 'product_id', 'quantity', 'unit_cost', 'line_total'],
      sim.purchaseOrders.flatMap((po) => po.items.map((i) => [po.id, i.p + 1, i.qty, i.cost, round2(i.qty * i.cost)])));

    await insert(conn, 'sales_orders',
      ['id', 'order_number', 'customer_id', 'warehouse_id', 'status', 'order_date', 'subtotal', 'discount',
        'total_amount', 'created_by', 'cancelled_by', 'cancelled_at', 'cancel_reason', 'created_at'],
      sim.salesOrders.map((so) => [
        so.id, `SO-${pad(so.id, 6)}`, so.customerId, so.w + 1, so.status, so.orderDate, so.subtotal, so.discount,
        so.total, so.createdBy, so.cancelledBy, so.cancelledAt, so.cancelReason, so.orderDate,
      ]));
    await insert(conn, 'sales_order_items',
      ['id', 'sales_order_id', 'product_id', 'quantity', 'unit_price', 'unit_cost', 'line_total'], sim.salesItems);
    await insert(conn, 'stock_transfers',
      ['id', 'transfer_number', 'product_id', 'from_warehouse_id', 'to_warehouse_id', 'quantity', 'note', 'created_by', 'created_at'],
      sim.transfers);
    await insert(conn, 'stock_movements',
      ['id', 'product_id', 'warehouse_id', 'type', 'quantity_change', 'balance_after', 'reference_type',
        'reference_id', 'note', 'user_id', 'created_at'],
      sim.movements);

    await conn.commit();
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    await conn.query('SET FOREIGN_KEY_CHECKS = 1, UNIQUE_CHECKS = 1').catch(() => {});
    conn.release();
  }
}

// Proves the ledger and the stock table agree, and (since foreign keys were skipped
// during the load) that no row points to a missing parent.
async function verify() {
  const [[{ orphans }]] = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM sales_order_items i LEFT JOIN sales_orders o ON o.id = i.sales_order_id LEFT JOIN products p ON p.id = i.product_id WHERE o.id IS NULL OR p.id IS NULL)
    + (SELECT COUNT(*) FROM purchase_order_items i LEFT JOIN purchase_orders o ON o.id = i.purchase_order_id LEFT JOIN products p ON p.id = i.product_id WHERE o.id IS NULL OR p.id IS NULL)
    + (SELECT COUNT(*) FROM stock_movements m LEFT JOIN stock s ON s.product_id = m.product_id AND s.warehouse_id = m.warehouse_id WHERE s.product_id IS NULL)
    + (SELECT COUNT(*) FROM sales_orders o LEFT JOIN customers c ON c.id = o.customer_id WHERE c.id IS NULL)
    AS orphans`);
  const [[{ mismatched }]] = await pool.query(`
    SELECT COUNT(*) AS mismatched
    FROM stock s
    LEFT JOIN (
      SELECT product_id, warehouse_id, SUM(quantity_change) AS total
      FROM stock_movements GROUP BY product_id, warehouse_id
    ) m ON m.product_id = s.product_id AND m.warehouse_id = s.warehouse_id
    WHERE s.quantity <> COALESCE(m.total, 0)`);
  const [[summary]] = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM stock s JOIN products p ON p.id = s.product_id WHERE s.quantity <= p.min_stock) AS low_stock,
      (SELECT COALESCE(SUM(total_amount), 0) FROM sales_orders WHERE status = 'completed') AS revenue,
      (SELECT COUNT(*) FROM purchase_orders WHERE status = 'draft') AS draft_pos,
      (SELECT COUNT(*) FROM purchase_orders WHERE status = 'approved') AS approved_pos`);
  return { mismatched, orphans, ...summary };
}

// ---------- main ----------

const started = Date.now();
try {
  await ensureDatabase();
  await ensureSchema();

  const [[{ count }]] = await pool.query('SELECT COUNT(*) AS count FROM products');
  if (count > 0 && !opts.force) {
    console.error(`The database already has ${count} products. Run with --force to replace all business data.`);
    process.exitCode = 1;
  } else {
    const users = await upsertDemoUsers();
    const data = buildMasterData();
    console.log(`Simulating ${opts.days} days: ${data.products.length.toLocaleString()} products, ~${opts.orders.toLocaleString()} sales orders...`);
    const sim = simulate(data, users);
    console.log(`Simulated in ${((Date.now() - started) / 1000).toFixed(1)}s. Writing:`);
    await write(data, sim);

    const result = await verify();
    console.log(`\nStock matches the movement ledger: ${result.mismatched === 0 ? 'yes' : `NO (${result.mismatched} rows differ)`}`);
    console.log(`Rows pointing to a missing parent: ${result.orphans}`);
    console.log(`Revenue: $${Number(result.revenue).toLocaleString()} | low-stock rows: ${result.low_stock} | purchase orders waiting: ${result.draft_pos} draft, ${result.approved_pos} approved`);
    console.log(`Demo accounts (password ${DEMO_PASSWORD}): ${demoUsers.map((u) => u.email).join(', ')}`);
    console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    if (result.mismatched || result.orphans) process.exitCode = 1;
  }
} catch (err) {
  console.error('Seeding failed:', err.message || err.code);
  process.exitCode = 1;
} finally {
  await pool.end();
}
