const MAX_ITEMS = 200;
const MAX_QUANTITY = 1_000_000;
const MAX_COST = 9_999_999_999.99;

const positiveId = (value) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

// YYYY-MM-DD that is a real calendar date.
function parseDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value) ? value : null;
}

// A draft PO: supplier, destination warehouse, optional expected date and note, and
// 1-200 lines with a product (each at most once), a quantity and a unit cost.
// Returns { values } or { error }.
export function validatePurchaseOrder(body) {
  const supplierId = positiveId(body.supplierId);
  const warehouseId = positiveId(body.warehouseId);
  if (!supplierId) return { error: 'Choose a supplier' };
  if (!warehouseId) return { error: 'Choose the warehouse that receives the goods' };

  let expectedDate = null;
  if (body.expectedDate) {
    expectedDate = parseDate(String(body.expectedDate));
    if (!expectedDate) return { error: 'Expected date must be a valid date (YYYY-MM-DD)' };
  }

  const note = String(body.note ?? '').trim();
  if (note.length > 500) return { error: 'Note can be at most 500 characters' };

  if (!Array.isArray(body.items) || body.items.length === 0) return { error: 'Add at least one product' };
  if (body.items.length > MAX_ITEMS) return { error: `A purchase order can have at most ${MAX_ITEMS} lines` };

  const items = [];
  const seen = new Set();
  for (const [i, item] of body.items.entries()) {
    const line = `Line ${i + 1}`;
    const productId = positiveId(item?.productId);
    const quantity = Number(item?.quantity);
    const costText = String(item?.unitCost ?? '').trim();
    const unitCost = Number(costText);
    if (!productId) return { error: `${line}: choose a product` };
    if (seen.has(productId)) return { error: `${line}: this product is already on the order` };
    seen.add(productId);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
      return { error: `${line}: quantity must be a whole number of at least 1` };
    }
    // Checked as text, like product prices: 0.29 * 100 isn't exactly 29 in floating point.
    if (!/^\d+(\.\d{1,2})?$/.test(costText) || unitCost > MAX_COST) {
      return { error: `${line}: unit cost must be 0 or more, with at most 2 decimals` };
    }
    items.push({ productId, quantity, unitCost });
  }

  return { values: { supplierId, warehouseId, expectedDate, note: note || null, items } };
}
