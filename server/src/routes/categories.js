import { Router } from 'express';
import { pool, withTransaction } from '../db/pool.js';
import { audit, auditContext } from '../services/audit.js';
import { requireAuth, requirePermission } from '../auth/middleware.js';
import { apiLimiter } from '../auth/rateLimit.js';

const router = Router();

router.use(apiLimiter);
router.use(requireAuth);

function validateCategory(body, { partial = false } = {}) {
  const values = {};
  if (!partial || body.code !== undefined) {
    const code = String(body.code ?? '').trim().toUpperCase();
    if (!/^[A-Z0-9]{2,10}$/.test(code)) return { error: 'Code must be 2-10 letters or numbers' };
    values.code = code;
  }
  if (!partial || body.name !== undefined) {
    const name = String(body.name ?? '').trim();
    if (!name || name.length > 100) return { error: 'Name is required (max 100 characters)' };
    values.name = name;
  }
  if (!partial || body.description !== undefined) {
    const description = String(body.description ?? '').trim();
    if (description.length > 255) return { error: 'Description can be at most 255 characters' };
    values.description = description || null;
  }
  return { values };
}

const duplicate = (res) => res.status(409).json({ message: 'Another category already uses this code or name' });

async function findCategory(id, conn = pool) {
  const [rows] = await conn.query(
    `SELECT c.id, c.code, c.name, c.description, COUNT(p.id) AS productCount
     FROM categories c LEFT JOIN products p ON p.category_id = c.id
     WHERE c.id = ? GROUP BY c.id`,
    [id]
  );
  return rows[0];
}

// GET /api/categories - with the number of products in each.
router.get('/', requirePermission('products.view'), async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT c.id, c.code, c.name, c.description, COUNT(p.id) AS productCount
       FROM categories c LEFT JOIN products p ON p.category_id = c.id
       GROUP BY c.id ORDER BY c.name`
    );
    res.json({ categories: rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/categories
router.post('/', requirePermission('products.manage'), async (req, res, next) => {
  const { values, error } = validateCategory(req.body);
  if (error) return res.status(400).json({ message: error });
  try {
    const category = await withTransaction(async (conn) => {
      const [result] = await conn.query('INSERT INTO categories (code, name, description) VALUES (?, ?, ?)', [
        values.code, values.name, values.description,
      ]);
      const saved = await findCategory(result.insertId, conn);
      await audit(conn, auditContext(req), { action: 'create', entity: 'category', entityId: saved.id, label: saved.name, after: saved });
      return saved;
    });
    res.status(201).json({ category });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return duplicate(res);
    next(err);
  }
});

// PATCH /api/categories/:id
router.patch('/:id', requirePermission('products.manage'), async (req, res, next) => {
  const { values, error } = validateCategory(req.body, { partial: true });
  if (error) return res.status(400).json({ message: error });
  const fields = Object.keys(values);
  if (fields.length === 0) return res.status(400).json({ message: 'Nothing to update' });
  try {
    const id = Number(req.params.id);
    const category = await withTransaction(async (conn) => {
      const before = await findCategory(id, conn);
      if (!before) return null;
      await conn.query(`UPDATE categories SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`, [
        ...fields.map((f) => values[f]), id,
      ]);
      const after = await findCategory(id, conn);
      await audit(conn, auditContext(req), { action: 'update', entity: 'category', entityId: id, label: after.name, before, after });
      return after;
    });
    if (!category) return res.status(404).json({ message: 'Category not found' });
    res.json({ category });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return duplicate(res);
    next(err);
  }
});

// DELETE /api/categories/:id - only when no product uses it.
router.delete('/:id', requirePermission('products.manage'), async (req, res, next) => {
  try {
    const category = await findCategory(Number(req.params.id));
    if (!category) return res.status(404).json({ message: 'Category not found' });
    if (category.productCount > 0) {
      return res.status(409).json({
        message: `"${category.name}" still has ${category.productCount} product(s). Move them to another category first.`,
      });
    }
    await withTransaction(async (conn) => {
      await conn.query('DELETE FROM categories WHERE id = ?', [category.id]);
      await audit(conn, auditContext(req), { action: 'delete', entity: 'category', entityId: category.id, label: category.name, before: category });
    });
    res.status(204).end();
  } catch (err) {
    // A product was added to it between the check and the delete; the foreign key refuses.
    if (err.code === 'ER_ROW_IS_REFERENCED_2') return res.status(409).json({ message: 'This category is in use' });
    next(err);
  }
});

export default router;
