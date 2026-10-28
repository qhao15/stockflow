import ExcelJS from 'exceljs';
import { UNITS } from '../validators/product.js';

// The import and export use the same columns, so an exported file can be edited and
// imported again. "Total stock" is only in the export and ignored on import.
const COLUMNS = [
  { key: 'sku', header: 'SKU', required: true, width: 26, note: '2-64 characters: letters, numbers, - _ . Existing SKU = update, new SKU = create.' },
  { key: 'name', header: 'Name', required: true, width: 44 },
  { key: 'category', header: 'Category', required: true, width: 20, note: 'Category name or code, see the Categories sheet.' },
  { key: 'brand', header: 'Brand', width: 14 },
  { key: 'unit', header: 'Unit', required: true, width: 8, note: `One of: ${UNITS.join(', ')}` },
  { key: 'costPrice', header: 'Cost price', width: 12, numFmt: '#,##0.00' },
  { key: 'salePrice', header: 'Sale price', required: true, width: 12, numFmt: '#,##0.00' },
  { key: 'minStock', header: 'Min stock', width: 10, note: 'Low-stock alert level per warehouse. Blank = 0.' },
  { key: 'description', header: 'Description', width: 40 },
  { key: 'isActive', header: 'Active', width: 8, note: 'yes or no. Blank = yes.' },
];

export const MAX_IMPORT_ROWS = 20_000;
export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function styleHeader(sheet) {
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E5EFF' } };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

function addProductSheet(workbook, { markRequired, withStock }) {
  const sheet = workbook.addWorksheet('Products');
  const columns = [...COLUMNS, ...(withStock ? [{ key: 'stock', header: 'Total stock', width: 12 }] : [])];
  sheet.columns = columns.map((c) => ({
    key: c.key,
    header: markRequired && c.required ? `${c.header} *` : c.header,
    width: c.width,
    style: c.numFmt ? { numFmt: c.numFmt } : undefined,
  }));
  styleHeader(sheet);
  return sheet;
}

export async function buildTemplate(categories) {
  const workbook = new ExcelJS.Workbook();
  const sheet = addProductSheet(workbook, { markRequired: true });
  COLUMNS.forEach((c, i) => {
    if (c.note) sheet.getCell(1, i + 1).note = c.note;
  });

  const help = workbook.addWorksheet('How to fill');
  help.columns = [{ header: 'Column', key: 'col', width: 16 }, { header: 'Rules', key: 'rule', width: 90 }];
  styleHeader(help);
  help.addRows([
    { col: '', rule: 'Fill one product per row on the Products sheet. Columns marked * are required.' },
    { col: '', rule: 'The whole file is checked first. If any row has a problem, nothing is imported and you get a list of errors.' },
    ...COLUMNS.map((c) => ({ col: c.header, rule: `${c.required ? 'Required. ' : 'Optional. '}${c.note ?? ''}` })),
  ]);

  const list = workbook.addWorksheet('Categories');
  list.columns = [{ header: 'Code', key: 'code', width: 10 }, { header: 'Name', key: 'name', width: 30 }];
  styleHeader(list);
  list.addRows(categories.map((c) => ({ code: c.code, name: c.name })));

  return workbook.xlsx.writeBuffer();
}

export async function buildExport(products) {
  const workbook = new ExcelJS.Workbook();
  const sheet = addProductSheet(workbook, { withStock: true });
  sheet.addRows(products.map((p) => ({ ...p, category: p.categoryName, isActive: p.isActive ? 'yes' : 'no' })));
  sheet.autoFilter = { from: 'A1', to: { row: 1, column: sheet.columnCount } };
  return workbook.xlsx.writeBuffer();
}

// Excel cells can hold rich text, formulas, hyperlinks or dates; reduce them to plain values.
function cellValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'object') return value;
  if (value instanceof Date) return value.toISOString();
  if ('result' in value) return cellValue(value.result);
  if ('richText' in value) return value.richText.map((r) => r.text).join('');
  if ('text' in value) return cellValue(value.text);
  return String(value);
}

const normalizeHeader = (text) => String(text).toLowerCase().replace(/\*/g, '').replace(/\s+/g, '');

// Reads the Products sheet (or the first sheet) into { rows: [{ rowNumber, values }], error }.
export async function readProductFile(buffer) {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    return { error: 'This is not a valid .xlsx file' };
  }
  const sheet = workbook.getWorksheet('Products') ?? workbook.worksheets[0];
  if (!sheet) return { error: 'The file has no sheets' };

  // Map header text to column numbers, so column order doesn't matter.
  const positions = {};
  sheet.getRow(1).eachCell((cell, col) => {
    const header = normalizeHeader(cellValue(cell.value));
    const column = COLUMNS.find((c) => normalizeHeader(c.header) === header);
    if (column) positions[column.key] = col;
  });
  const missing = COLUMNS.filter((c) => c.required && !positions[c.key]).map((c) => c.header);
  if (missing.length) return { error: `Missing required column(s): ${missing.join(', ')}. Use the template.` };

  const rows = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const values = {};
    for (const [key, col] of Object.entries(positions)) {
      const v = cellValue(row.getCell(col).value);
      values[key] = typeof v === 'string' ? v.trim() : v;
    }
    if (Object.values(values).every((v) => v === '')) continue; // skip empty rows
    rows.push({ rowNumber: r, values });
    if (rows.length > MAX_IMPORT_ROWS) return { error: `Too many rows: at most ${MAX_IMPORT_ROWS.toLocaleString()} per file` };
  }
  if (rows.length === 0) return { error: 'The Products sheet has no rows to import' };
  return { rows };
}

export const columnHeader = (key) => COLUMNS.find((c) => c.key === key)?.header ?? key;
