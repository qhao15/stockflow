// Product field rules, shared by the API (create / edit / inline edit) and the Excel import,
// so a row that imports is exactly a row the form would accept.
export const UNITS = ['pcs', 'box', 'set', 'roll', 'pack'];

const MAX_MONEY = 9_999_999_999.99;

// API field -> database column
export const PRODUCT_COLUMNS = {
  sku: 'sku',
  name: 'name',
  categoryId: 'category_id',
  brand: 'brand',
  unit: 'unit',
  costPrice: 'cost_price',
  salePrice: 'sale_price',
  minStock: 'min_stock',
  imageUrl: 'image_url',
  description: 'description',
  isActive: 'is_active',
};

const blank = (v) => v === undefined || v === null || String(v).trim() === '';

function money(value, label) {
  const text = String(value).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return { error: `${label} must be a number with up to 2 decimals, 0 or more` };
  const n = Number(text);
  if (n > MAX_MONEY) return { error: `${label} is too large` };
  return { value: n };
}

function optionalText(value, max, label) {
  if (blank(value)) return { value: null };
  const text = String(value).trim();
  return text.length > max ? { error: `${label} can be at most ${max} characters` } : { value: text };
}

// Returns { values, errors }. With partial: true only the fields present are checked
// (used for edits); otherwise required fields must be there and defaults are filled in.
export function validateProduct(input, { partial = false } = {}) {
  const values = {};
  const errors = {};
  const check = (field) => !partial || input[field] !== undefined;
  const set = (field, result) => {
    if (result.error) errors[field] = result.error;
    else values[field] = result.value;
  };

  if (check('sku')) {
    const sku = String(input.sku ?? '').trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9._-]{1,63}$/.test(sku)) errors.sku = 'SKU must be 2-64 characters: letters, numbers, - _ .';
    else values.sku = sku;
  }

  if (check('name')) {
    const name = String(input.name ?? '').trim();
    if (!name) errors.name = 'Name is required';
    else if (name.length > 200) errors.name = 'Name can be at most 200 characters';
    else values.name = name;
  }

  if (check('categoryId')) {
    const id = Number(input.categoryId);
    if (!Number.isInteger(id) || id < 1) errors.categoryId = 'Category is required';
    else values.categoryId = id;
  }

  if (check('brand')) set('brand', optionalText(input.brand, 50, 'Brand'));

  if (check('unit')) {
    const unit = String(input.unit ?? '').trim().toLowerCase();
    if (!UNITS.includes(unit)) errors.unit = `Unit must be one of: ${UNITS.join(', ')}`;
    else values.unit = unit;
  }

  if (check('salePrice')) {
    if (blank(input.salePrice)) errors.salePrice = 'Sale price is required';
    else set('salePrice', money(input.salePrice, 'Sale price'));
  }

  if (check('costPrice')) set('costPrice', blank(input.costPrice) ? { value: 0 } : money(input.costPrice, 'Cost price'));

  if (check('minStock')) {
    if (blank(input.minStock)) values.minStock = 0;
    else {
      const n = Number(String(input.minStock).trim());
      if (!Number.isInteger(n) || n < 0 || n > 1_000_000) errors.minStock = 'Min stock must be a whole number, 0 or more';
      else values.minStock = n;
    }
  }

  if (check('imageUrl')) {
    const result = optionalText(input.imageUrl, 500, 'Image URL');
    if (!result.error && result.value && !/^https?:\/\/\S+$/i.test(result.value)) {
      errors.imageUrl = 'Image URL must start with http:// or https://';
    } else set('imageUrl', result);
  }

  if (check('description')) set('description', optionalText(input.description, 2000, 'Description'));

  if (check('isActive')) {
    if (input.isActive === undefined) values.isActive = true;
    else if (typeof input.isActive !== 'boolean') errors.isActive = 'Active must be true or false';
    else values.isActive = input.isActive;
  }

  return { values, errors };
}

export function firstError(errors) {
  return Object.values(errors)[0];
}
