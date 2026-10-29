import { Router } from 'express';
import multer from 'multer';
import { pool } from '../db/pool.js';
import { requireAuth, requirePermission } from '../auth/middleware.js';
import { PRODUCT_COLUMNS, UNITS, firstError, validateProduct } from '../validators/product.js';
import { categoryExists, getProduct, listProducts } from '../services/products.js';
import { XLSX_TYPE, buildExport, buildTemplate, columnHeader, readProductFile } from '../services/productExcel.js';
import { apiLimiter } from '../auth/rateLimit.js';

const router = Router();
const canView = requirePermission('products.view');
const canManage = requirePermission('products.manage');

router.use(apiLimiter);

const MAX_EXPORT_ROWS = 100_000;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

router.use(requireAuth);

const parseId = (value) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

function sendXlsx(res, buffer, filename) {
  res.setHeader('Content-Type', XLSX_TYPE);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(Buffer.from(buffer));
}

// GET /api/products/options - what the filters and the product form need.
router.get('/options', canView, async (req, res, next) => {
  try {
    const [categories] = await pool.query('SELECT id, code, name FROM categories ORDER BY name');
    const [brands] = await pool.query(
      'SELECT DISTINCT brand FROM products WHERE brand IS NOT NULL ORDER BY brand LIMIT 500'
    );
    res.json({ categories, units: UNITS, brands: brands.map((b) => b.brand) });
  } catch (err) {
    next(err);
  }
});

// GET /api/products?offset=&limit=&sort=&dir=&search=&categoryId=&brand=&status=&lowStock=
// Paging, sorting and filtering all happen in the database.
router.get('/', canView, async (req, res, next) => {
  const offset = Math.max(0, Number.parseInt(req.query.offset, 10) || 0);
  const limit = Math.min(500, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
  try {
    res.json(await listProducts(req.query, { offset, limit }));
  } catch (err) {
    next(err);
  }
});

// GET /api/products/export - same filters and sort as the list, as an Excel file.
router.get('/export', canView, async (req, res, next) => {
  try {
    const { rows } = await listProducts(req.query, { limit: MAX_EXPORT_ROWS });
    const date = new Date().toISOString().slice(0, 10);
    sendXlsx(res, await buildExport(rows), `products-${date}.xlsx`);
  } catch (err) {
    next(err);
  }
});

// GET /api/products/import-template
router.get('/import-template', canManage, async (req, res, next) => {
  try {
    const [categories] = await pool.query('SELECT code, name FROM categories ORDER BY name');
    sendXlsx(res, await buildTemplate(categories), 'product-import-template.xlsx');
  } catch (err) {
    next(err);
  }
});

// POST /api/products/import (multipart, field "file") - all or nothing: every row is
// validated first; if any row is wrong nothing is saved and the errors are returned.
// Rows with an existing SKU update that product, new SKUs create products.
router.post('/import', canManage, (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err?.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ message: 'The file is larger than 5 MB' });
    if (err) return next(err);
    importProducts(req, res).catch(next);
  });
});

async function importProducts(req, res) {
  if (!req.file) return res.status(400).json({ message: 'Choose an .xlsx file to import' });

  const parsed = await readProductFile(req.file.buffer);
  if (parsed.error) return res.status(400).json({ message: parsed.error });

  const [categoryRows] = await pool.query('SELECT id, code, name FROM categories');
  const categories = new Map();
  categoryRows.forEach((c) => {
    categories.set(c.code.toLowerCase(), c.id);
    categories.set(c.name.toLowerCase(), c.id);
  });

  const errors = [];
  const products = [];
  const seenSkus = new Map();
  for (const { rowNumber, values } of parsed.rows) {
    const rowErrors = [];
    const categoryId = categories.get(String(values.category ?? '').toLowerCase());
    if (!categoryId) rowErrors.push({ column: 'Category', message: values.category ? `Unknown category "${values.category}"` : 'Category is required' });

    const active = String(values.isActive ?? '').toLowerCase();
    let isActive = true;
    if (['no', 'false', '0', 'n'].includes(active)) isActive = false;
    else if (active && !['yes', 'true', '1', 'y'].includes(active)) rowErrors.push({ column: 'Active', message: 'Active must be yes or no' });

    const { values: product, errors: fieldErrors } = validateProduct({ ...values, categoryId: categoryId ?? 1, isActive });
    for (const [field, message] of Object.entries(fieldErrors)) {
      if (field !== 'categoryId') rowErrors.push({ column: columnHeader(field), message });
    }
    if (product.sku) {
      if (seenSkus.has(product.sku)) rowErrors.push({ column: 'SKU', message: `Same SKU as row ${seenSkus.get(product.sku)}` });
      else seenSkus.set(product.sku, rowNumber);
    }

    rowErrors.forEach((e) => errors.push({ row: rowNumber, ...e }));
    if (rowErrors.length === 0) products.push(product);
  }

  if (errors.length) {
    return res.status(422).json({
      message: `Nothing was imported: ${errors.length} problem(s) found. Fix them and upload the file again.`,
      errorCount: errors.length,
      errors: errors.slice(0, 200),
    });
  }

  const columns = Object.values(PRODUCT_COLUMNS).filter((c) => c !== 'image_url');
  const fields = Object.keys(PRODUCT_COLUMNS).filter((f) => f !== 'imageUrl');
  const updates = columns.filter((c) => c !== 'sku').map((c) => `${c} = VALUES(${c})`).join(', ');

  const conn = await pool.getConnection();
  let created = 0;
  let updated = 0;
  try {
    await conn.beginTransaction();
    for (let i = 0; i < products.length; i += 1000) {
      const chunk = products.slice(i, i + 1000);
      const [existing] = await conn.query('SELECT sku FROM products WHERE sku IN (?)', [chunk.map((p) => p.sku)]);
      updated += existing.length;
      created += chunk.length - existing.length;
      await conn.query(
        `INSERT INTO products (${columns.join(', ')}) VALUES ?
         ON DUPLICATE KEY UPDATE ${updates}, version = version + 1`,
        [chunk.map((p) => fields.map((f) => p[f]))]
      );
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  res.json({ message: `Imported ${products.length} product(s): ${created} created, ${updated} updated.`, created, updated });
}

// GET /api/products/:id
router.get('/:id', canView, async (req, res, next) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(404).json({ message: 'Product not found' });
  try {
    const product = await getProduct(id);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json({ product });
  } catch (err) {
    next(err);
  }
});

// POST /api/products
router.post('/', canManage, async (req, res, next) => {
  const { values, errors } = validateProduct(req.body);
  if (Object.keys(errors).length) return res.status(400).json({ message: firstError(errors), errors });

  try {
    if (!(await categoryExists(values.categoryId))) return res.status(400).json({ message: 'Category not found' });
    const fields = Object.keys(values);
    const [result] = await pool.query(
      `INSERT INTO products (${fields.map((f) => PRODUCT_COLUMNS[f]).join(', ')}) VALUES (?)`,
      [fields.map((f) => values[f])]
    );
    res.status(201).json({ product: await getProduct(result.insertId) });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'A product with this SKU already exists' });
    next(err);
  }
});

// PATCH /api/products/:id - change any fields. The client sends the version it loaded;
// if someone else saved in between, the version no longer matches and nothing is
// overwritten (optimistic locking). The response then carries the current product.
router.patch('/:id', canManage, async (req, res, next) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(404).json({ message: 'Product not found' });
  const version = Number(req.body.version);
  if (!Number.isInteger(version) || version < 0) return res.status(400).json({ message: 'version is required' });

  const { values, errors } = validateProduct(req.body, { partial: true });
  if (Object.keys(errors).length) return res.status(400).json({ message: firstError(errors), errors });
  const fields = Object.keys(values);
  if (fields.length === 0) return res.status(400).json({ message: 'Nothing to update' });

  try {
    if (values.categoryId && !(await categoryExists(values.categoryId))) {
      return res.status(400).json({ message: 'Category not found' });
    }
    const [result] = await pool.query(
      `UPDATE products SET ${fields.map((f) => `${PRODUCT_COLUMNS[f]} = ?`).join(', ')}, version = version + 1
       WHERE id = ? AND version = ?`,
      [...fields.map((f) => values[f]), id, version]
    );
    const product = await getProduct(id);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    if (result.affectedRows === 0) {
      return res.status(409).json({
        message: 'Someone else changed this product while you were editing. The latest version has been loaded.',
        product,
      });
    }
    res.json({ product });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'A product with this SKU already exists' });
    next(err);
  }
});

// DELETE /api/products/:id - only products that were never used. A product with sales,
// purchase or stock history is kept so orders, invoices and the stock ledger stay
// complete; it can be set inactive instead (409 with reason "in_use").
router.delete('/:id', canManage, async (req, res, next) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(404).json({ message: 'Product not found' });

  const inUse = (name) => res.status(409).json({
    reason: 'in_use',
    message: `"${name}" has sales, purchase or stock history, so it can't be deleted. Set it to inactive instead to hide it from new orders.`,
  });

  let product;
  try {
    // Same in_use flag the list shows, so the disabled button and this check agree.
    product = await getProduct(id);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    if (product.inUse) return inUse(product.name);

    await pool.query('DELETE FROM products WHERE id = ?', [id]);
    res.json({ message: `${product.sku} deleted` });
  } catch (err) {
    // Used between the check and the delete: the foreign keys refuse it.
    if (err.code === 'ER_ROW_IS_REFERENCED_2') return inUse(product.name);
    next(err);
  }
});

export default router;
