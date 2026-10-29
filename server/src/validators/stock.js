import { ADJUSTMENT_REASONS } from '../services/stockLedger.js';

const MAX_QUANTITY = 1_000_000;

const positiveId = (value) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const text = (value) => String(value ?? '').trim();

// Returns { values } or { error }. partial: only validate the fields that were sent (PATCH).
export function validateWarehouse(body, { partial = false } = {}) {
  const values = {};
  const has = (field) => !partial || body[field] !== undefined;
  if (has('code')) {
    const code = text(body.code).toUpperCase();
    if (!/^[A-Z0-9]{2,10}$/.test(code)) return { error: 'Code must be 2-10 letters or numbers' };
    values.code = code;
  }
  if (has('name')) {
    const name = text(body.name);
    if (!name || name.length > 100) return { error: 'Name is required (max 100 characters)' };
    values.name = name;
  }
  if (has('city')) {
    const city = text(body.city);
    if (!city || city.length > 100) return { error: 'City is required (max 100 characters)' };
    values.city = city;
  }
  if (has('address')) {
    const address = text(body.address);
    if (address.length > 255) return { error: 'Address can be at most 255 characters' };
    values.address = address || null;
  }
  if (body.isActive !== undefined) {
    if (typeof body.isActive !== 'boolean') return { error: 'isActive must be true or false' };
    values.is_active = body.isActive ? 1 : 0;
  }
  return { values };
}

function validateNote(body, max) {
  const note = text(body.note);
  if (note.length > max) return { error: `Note can be at most ${max} characters` };
  return { note: note || null };
}

export function validateTransfer(body) {
  const productId = positiveId(body.productId);
  const fromWarehouseId = positiveId(body.fromWarehouseId);
  const toWarehouseId = positiveId(body.toWarehouseId);
  const quantity = Number(body.quantity);
  if (!productId) return { error: 'Choose a product' };
  if (!fromWarehouseId || !toWarehouseId) return { error: 'Choose the source and destination warehouses' };
  if (fromWarehouseId === toWarehouseId) return { error: 'Source and destination must be different warehouses' };
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
    return { error: 'Quantity must be a whole number of at least 1' };
  }
  const { note, error } = validateNote(body, 500);
  if (error) return { error };
  return { values: { productId, fromWarehouseId, toWarehouseId, quantity, note } };
}

export function validateAdjustment(body) {
  const productId = positiveId(body.productId);
  const warehouseId = positiveId(body.warehouseId);
  const countedQuantity = Number(body.countedQuantity);
  if (!productId) return { error: 'Choose a product' };
  if (!warehouseId) return { error: 'Choose a warehouse' };
  if (!Number.isInteger(countedQuantity) || countedQuantity < 0 || countedQuantity > MAX_QUANTITY) {
    return { error: 'Counted quantity must be a whole number, 0 or more' };
  }
  let expectedQuantity;
  if (body.expectedQuantity !== undefined && body.expectedQuantity !== null) {
    expectedQuantity = Number(body.expectedQuantity);
    if (!Number.isInteger(expectedQuantity) || expectedQuantity < 0) return { error: 'Invalid expected quantity' };
  }
  if (!Object.hasOwn(ADJUSTMENT_REASONS, body.reason)) {
    return { error: `Reason must be one of: ${Object.keys(ADJUSTMENT_REASONS).join(', ')}` };
  }
  // The movement note is "<Reason>: <note>" and the column holds 255 characters.
  const { note, error } = validateNote(body, 200);
  if (error) return { error };
  if (body.reason === 'other' && !note) return { error: 'Describe the reason in the note' };
  return { values: { productId, warehouseId, countedQuantity, expectedQuantity, reason: body.reason, note } };
}
