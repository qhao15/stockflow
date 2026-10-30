const MAX_ITEMS = 200;
const MAX_QUANTITY = 1_000_000;

const positiveId = (value) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

// A sales order: customer, warehouse it ships from, 1-200 lines (each product at most
// once), an optional discount amount and note. Prices are not taken from the request:
// the server uses each product's current sale price. Returns { values } or { error }.
export function validateSalesOrder(body) {
  const customerId = positiveId(body.customerId);
  const warehouseId = positiveId(body.warehouseId);
  if (!customerId) return { error: 'Choose a customer' };
  if (!warehouseId) return { error: 'Choose the warehouse the goods ship from' };

  const note = String(body.note ?? '').trim();
  if (note.length > 500) return { error: 'Note can be at most 500 characters' };

  // Checked as text so 0.29 stays exactly 29 cents.
  const discountText = String(body.discount ?? '').trim() || '0';
  if (!/^\d+(\.\d{1,2})?$/.test(discountText)) return { error: 'Discount must be an amount of 0 or more, with at most 2 decimals' };
  const discount = Number(discountText);

  if (!Array.isArray(body.items) || body.items.length === 0) return { error: 'Add at least one product' };
  if (body.items.length > MAX_ITEMS) return { error: `An order can have at most ${MAX_ITEMS} lines` };

  const items = [];
  const seen = new Set();
  for (const [i, item] of body.items.entries()) {
    const line = `Line ${i + 1}`;
    const productId = positiveId(item?.productId);
    const quantity = Number(item?.quantity);
    if (!productId) return { error: `${line}: choose a product` };
    if (seen.has(productId)) return { error: `${line}: this product is already on the order` };
    seen.add(productId);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
      return { error: `${line}: quantity must be a whole number of at least 1` };
    }
    items.push({ productId, quantity });
  }

  return { values: { customerId, warehouseId, discount, note: note || null, items } };
}
