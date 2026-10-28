import { pool } from './pool.js';

// Tables are created on startup until a proper migration tool is added.
// Order matters: a table is listed after the tables its foreign keys point to.
//
// Stock rules:
// - `stock` holds the current quantity per product per warehouse and is only
//   changed together with a `stock_movements` row in the same transaction, so the
//   quantity always equals the sum of its movements.
// - Prices are copied onto order items, so changing a product's price never
//   rewrites old orders or invoices.
//
// Only primary, unique and foreign-key indexes (plus a few obvious lookups) are
// defined here; reporting indexes are added in the performance step, measured
// before and after on the large seed.
const tables = [
  `CREATE TABLE IF NOT EXISTS users (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    password_changed_at TIMESTAMP NULL,
    role ENUM('admin', 'manager', 'staff') NOT NULL DEFAULT 'staff',
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`,

  // Per-user UI settings that follow the user across browsers (e.g. grid columns).
  `CREATE TABLE IF NOT EXISTS user_preferences (
    user_id INT UNSIGNED NOT NULL,
    pref_key VARCHAR(100) NOT NULL,
    value JSON NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, pref_key),
    CONSTRAINT fk_preferences_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,

  `CREATE TABLE IF NOT EXISTS categories (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(10) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL UNIQUE,
    description VARCHAR(255) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`,

  `CREATE TABLE IF NOT EXISTS warehouses (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(10) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    city VARCHAR(100) NOT NULL,
    address VARCHAR(255) NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`,

  `CREATE TABLE IF NOT EXISTS suppliers (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    contact_name VARCHAR(100) NULL,
    email VARCHAR(255) NULL,
    phone VARCHAR(30) NULL,
    address VARCHAR(255) NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`,

  `CREATE TABLE IF NOT EXISTS customers (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    contact_name VARCHAR(100) NULL,
    email VARCHAR(255) NULL,
    phone VARCHAR(30) NULL,
    city VARCHAR(100) NULL,
    address VARCHAR(255) NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_customers_name (name)
  ) ENGINE=InnoDB`,

  // version: optimistic locking for inline edits (two people editing the same price).
  `CREATE TABLE IF NOT EXISTS products (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    sku VARCHAR(64) NOT NULL UNIQUE,
    name VARCHAR(200) NOT NULL,
    category_id INT UNSIGNED NOT NULL,
    brand VARCHAR(50) NULL,
    unit VARCHAR(20) NOT NULL DEFAULT 'pcs',
    cost_price DECIMAL(12, 2) NOT NULL DEFAULT 0,
    sale_price DECIMAL(12, 2) NOT NULL,
    min_stock INT UNSIGNED NOT NULL DEFAULT 0,
    image_url VARCHAR(500) NULL,
    description TEXT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    version INT UNSIGNED NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_products_name (name),
    CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES categories (id),
    CONSTRAINT chk_products_prices CHECK (cost_price >= 0 AND sale_price >= 0)
  ) ENGINE=InnoDB`,

  // The CHECK is a last line of defence: even a buggy code path can't oversell.
  // version supports optimistic locking as an alternative to SELECT ... FOR UPDATE.
  `CREATE TABLE IF NOT EXISTS stock (
    product_id INT UNSIGNED NOT NULL,
    warehouse_id INT UNSIGNED NOT NULL,
    quantity INT NOT NULL DEFAULT 0,
    version INT UNSIGNED NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (product_id, warehouse_id),
    CONSTRAINT fk_stock_product FOREIGN KEY (product_id) REFERENCES products (id),
    CONSTRAINT fk_stock_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses (id),
    CONSTRAINT chk_stock_quantity CHECK (quantity >= 0)
  ) ENGINE=InnoDB`,

  `CREATE TABLE IF NOT EXISTS purchase_orders (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    po_number VARCHAR(20) NOT NULL UNIQUE,
    supplier_id INT UNSIGNED NOT NULL,
    warehouse_id INT UNSIGNED NOT NULL,
    status ENUM('draft', 'approved', 'received', 'cancelled') NOT NULL DEFAULT 'draft',
    order_date DATETIME NOT NULL,
    expected_date DATE NULL,
    total_amount DECIMAL(14, 2) NOT NULL DEFAULT 0,
    note VARCHAR(500) NULL,
    created_by INT UNSIGNED NOT NULL,
    approved_by INT UNSIGNED NULL,
    approved_at DATETIME NULL,
    received_by INT UNSIGNED NULL,
    received_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_po_status (status),
    CONSTRAINT fk_po_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers (id),
    CONSTRAINT fk_po_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses (id),
    CONSTRAINT fk_po_created_by FOREIGN KEY (created_by) REFERENCES users (id),
    CONSTRAINT fk_po_approved_by FOREIGN KEY (approved_by) REFERENCES users (id),
    CONSTRAINT fk_po_received_by FOREIGN KEY (received_by) REFERENCES users (id)
  ) ENGINE=InnoDB`,

  `CREATE TABLE IF NOT EXISTS purchase_order_items (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    purchase_order_id INT UNSIGNED NOT NULL,
    product_id INT UNSIGNED NOT NULL,
    quantity INT UNSIGNED NOT NULL,
    unit_cost DECIMAL(12, 2) NOT NULL,
    line_total DECIMAL(14, 2) NOT NULL,
    UNIQUE KEY uq_po_item (purchase_order_id, product_id),
    CONSTRAINT fk_po_items_order FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders (id) ON DELETE CASCADE,
    CONSTRAINT fk_po_items_product FOREIGN KEY (product_id) REFERENCES products (id),
    CONSTRAINT chk_po_items_quantity CHECK (quantity > 0)
  ) ENGINE=InnoDB`,

  // A sale deducts stock when it is created; cancelling puts it back.
  `CREATE TABLE IF NOT EXISTS sales_orders (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_number VARCHAR(20) NOT NULL UNIQUE,
    customer_id INT UNSIGNED NOT NULL,
    warehouse_id INT UNSIGNED NOT NULL,
    status ENUM('completed', 'cancelled') NOT NULL DEFAULT 'completed',
    order_date DATETIME NOT NULL,
    subtotal DECIMAL(14, 2) NOT NULL DEFAULT 0,
    discount DECIMAL(14, 2) NOT NULL DEFAULT 0,
    total_amount DECIMAL(14, 2) NOT NULL DEFAULT 0,
    note VARCHAR(500) NULL,
    created_by INT UNSIGNED NOT NULL,
    cancelled_by INT UNSIGNED NULL,
    cancelled_at DATETIME NULL,
    cancel_reason VARCHAR(255) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_so_customer FOREIGN KEY (customer_id) REFERENCES customers (id),
    CONSTRAINT fk_so_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses (id),
    CONSTRAINT fk_so_created_by FOREIGN KEY (created_by) REFERENCES users (id),
    CONSTRAINT fk_so_cancelled_by FOREIGN KEY (cancelled_by) REFERENCES users (id)
  ) ENGINE=InnoDB`,

  `CREATE TABLE IF NOT EXISTS sales_order_items (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    sales_order_id INT UNSIGNED NOT NULL,
    product_id INT UNSIGNED NOT NULL,
    quantity INT UNSIGNED NOT NULL,
    unit_price DECIMAL(12, 2) NOT NULL,
    line_total DECIMAL(14, 2) NOT NULL,
    UNIQUE KEY uq_so_item (sales_order_id, product_id),
    CONSTRAINT fk_so_items_order FOREIGN KEY (sales_order_id) REFERENCES sales_orders (id) ON DELETE CASCADE,
    CONSTRAINT fk_so_items_product FOREIGN KEY (product_id) REFERENCES products (id),
    CONSTRAINT chk_so_items_quantity CHECK (quantity > 0)
  ) ENGINE=InnoDB`,

  `CREATE TABLE IF NOT EXISTS stock_transfers (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    transfer_number VARCHAR(20) NOT NULL UNIQUE,
    product_id INT UNSIGNED NOT NULL,
    from_warehouse_id INT UNSIGNED NOT NULL,
    to_warehouse_id INT UNSIGNED NOT NULL,
    quantity INT UNSIGNED NOT NULL,
    note VARCHAR(500) NULL,
    created_by INT UNSIGNED NOT NULL,
    created_at DATETIME NOT NULL,
    CONSTRAINT fk_transfer_product FOREIGN KEY (product_id) REFERENCES products (id),
    CONSTRAINT fk_transfer_from FOREIGN KEY (from_warehouse_id) REFERENCES warehouses (id),
    CONSTRAINT fk_transfer_to FOREIGN KEY (to_warehouse_id) REFERENCES warehouses (id),
    CONSTRAINT fk_transfer_created_by FOREIGN KEY (created_by) REFERENCES users (id),
    CONSTRAINT chk_transfer CHECK (quantity > 0 AND from_warehouse_id <> to_warehouse_id)
  ) ENGINE=InnoDB`,

  // The stock ledger. Every change to `stock` writes one row here: a signed
  // quantity_change, the resulting balance, and what caused it (reference_type/id
  // points to the purchase order, sales order or transfer).
  `CREATE TABLE IF NOT EXISTS stock_movements (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    product_id INT UNSIGNED NOT NULL,
    warehouse_id INT UNSIGNED NOT NULL,
    type ENUM('opening', 'purchase_receipt', 'sale', 'sale_cancel', 'transfer_in', 'transfer_out', 'adjustment') NOT NULL,
    quantity_change INT NOT NULL,
    balance_after INT NOT NULL,
    reference_type ENUM('purchase_order', 'sales_order', 'stock_transfer') NULL,
    reference_id INT UNSIGNED NULL,
    note VARCHAR(255) NULL,
    user_id INT UNSIGNED NOT NULL,
    created_at DATETIME NOT NULL,
    KEY idx_movements_stock (product_id, warehouse_id, id),
    KEY idx_movements_reference (reference_type, reference_id),
    CONSTRAINT fk_movements_product FOREIGN KEY (product_id) REFERENCES products (id),
    CONSTRAINT fk_movements_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses (id),
    CONSTRAINT fk_movements_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT chk_movements_change CHECK (quantity_change <> 0 AND balance_after >= 0)
  ) ENGINE=InnoDB`,

  // changes holds { field: [old, new] } for updates, or the created/deleted record.
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NULL,
    action VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id INT UNSIGNED NULL,
    changes JSON NULL,
    ip_address VARCHAR(45) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_audit_entity (entity_type, entity_id),
    KEY idx_audit_created (created_at),
    CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
  ) ENGINE=InnoDB`,
];

// Columns added after their table was first released. CREATE TABLE IF NOT EXISTS
// skips existing tables, so these are added to older databases here.
const addedColumns = [
  ['users', 'password_changed_at', 'TIMESTAMP NULL AFTER password_hash'],
];

export async function ensureSchema() {
  for (const sql of tables) {
    await pool.query(sql);
  }
  for (const [table, column, definition] of addedColumns) {
    const [rows] = await pool.query(
      'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
      [table, column]
    );
    if (rows.length === 0) await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
