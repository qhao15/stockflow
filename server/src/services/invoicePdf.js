import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';

// Builds the PDF invoice for a sales order (from getSalesOrder) and returns it as a Buffer.
// Noto Sans is embedded because PDF's built-in fonts can't show Vietnamese accents.

const font = (file) => fileURLToPath(new URL(`../../assets/fonts/${file}`, import.meta.url));
const FONTS = { regular: font('NotoSans-Regular.ttf'), bold: font('NotoSans-Bold.ttf') };

// The seller shown in the header. Fictional defaults; override them in server/.env.
const company = () => ({
  name: process.env.COMPANY_NAME || 'StockFlow Distribution Co., Ltd.',
  address: process.env.COMPANY_ADDRESS || '25 Duy Tan, Cau Giay, Hanoi, Vietnam',
  phone: process.env.COMPANY_PHONE || '+84 24 3999 0000',
  email: process.env.COMPANY_EMAIL || 'sales@stockflow.example',
  taxId: process.env.COMPANY_TAX_ID || '0109999999',
});

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const date = (value) => new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

const COLORS = { text: '#1d2939', muted: '#667085', line: '#e4e7ec', accent: '#1e5eff', header: '#f8f9fc', danger: '#d92d20' };
const MARGIN = 48;

// Table columns: x offset from the left margin, width and alignment. Text is drawn 4pt
// in from x, so the last column ends exactly at the right margin (A4 width - 2 × 48 = 499).
const COLUMNS = [
  { key: 'no', label: '#', x: 0, width: 22, align: 'left' },
  { key: 'item', label: 'Item', x: 26, width: 243, align: 'left' },
  { key: 'qty', label: 'Qty', x: 273, width: 52, align: 'right' },
  { key: 'price', label: 'Unit price', x: 329, width: 82, align: 'right' },
  { key: 'amount', label: 'Amount', x: 415, width: 80, align: 'right' },
];

export function buildInvoicePdf(order) {
  const doc = new PDFDocument({ size: 'A4', margin: MARGIN, bufferPages: true, info: { Title: `Invoice ${order.orderNumber}` } });
  doc.registerFont('regular', FONTS.regular);
  doc.registerFont('bold', FONTS.bold);
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const done = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const seller = company();
  const left = MARGIN;
  const right = doc.page.width - MARGIN;
  const width = right - left;

  // ---------- header: seller on the left, invoice details on the right ----------
  doc.font('bold').fontSize(16).fillColor(COLORS.accent).text(seller.name, left, MARGIN, { width: 300 });
  doc.font('regular').fontSize(9).fillColor(COLORS.muted)
    .text(seller.address, { width: 300 })
    .text(`${seller.phone} · ${seller.email}`, { width: 300 })
    .text(`Tax ID: ${seller.taxId}`, { width: 300 });

  doc.font('bold').fontSize(22).fillColor(COLORS.text).text('INVOICE', right - 200, MARGIN, { width: 200, align: 'right' });
  const cancelled = order.status === 'cancelled';
  const meta = [['Invoice no.', order.orderNumber], ['Date', date(order.orderDate)], ['Sold by', order.createdBy.name]];
  if (cancelled) meta.push(['Status', 'CANCELLED']);
  let y = MARGIN + 34;
  for (const [label, value] of meta) {
    doc.font('regular').fontSize(9).fillColor(COLORS.muted).text(label, right - 200, y, { width: 90 });
    doc.font('bold').fillColor(label === 'Status' ? COLORS.danger : COLORS.text).text(value, right - 110, y, { width: 110, align: 'right' });
    y += 14;
  }

  // ---------- bill to / ship from ----------
  y = Math.max(doc.y, y) + 24;
  const { customer } = order;
  const block = (title, lines, x) => {
    doc.font('bold').fontSize(8).fillColor(COLORS.muted).text(title.toUpperCase(), x, y, { width: 240, characterSpacing: 0.5 });
    doc.font('bold').fontSize(11).fillColor(COLORS.text).text(lines[0], x, doc.y + 4, { width: 240 });
    doc.font('regular').fontSize(9).fillColor(COLORS.text);
    for (const line of lines.slice(1).filter(Boolean)) doc.text(line, x, doc.y + 1, { width: 240 });
    return doc.y;
  };
  const billEnd = block('Bill to', [
    customer.name,
    customer.contactName && `Attn: ${customer.contactName}`,
    // Add the city unless the address already ends with it.
    customer.city && !customer.address?.endsWith(customer.city) ? [customer.address, customer.city].filter(Boolean).join(', ') : customer.address,
    [customer.phone, customer.email].filter(Boolean).join(' · '),
    `Customer code: ${customer.code}`,
  ], left);
  const shipEnd = block('Ship from', [order.warehouse.name, `Warehouse ${order.warehouse.code}`], left + width / 2 + 10);
  y = Math.max(billEnd, shipEnd) + 24;

  // ---------- lines ----------
  const header = () => {
    doc.rect(left, y, width, 22).fill(COLORS.header);
    doc.font('bold').fontSize(9).fillColor(COLORS.muted);
    for (const c of COLUMNS) doc.text(c.label, left + c.x + 4, y + 6, { width: c.width, align: c.align });
    y += 26;
  };
  header();

  order.items.forEach((item, index) => {
    doc.font('regular').fontSize(9.5);
    const nameHeight = doc.heightOfString(item.name, { width: COLUMNS[1].width });
    const rowHeight = nameHeight + 16;
    if (y + rowHeight > doc.page.height - MARGIN - 40) {
      doc.addPage();
      y = MARGIN;
      header();
    }
    const cell = (key, text, opts = {}) => {
      const c = COLUMNS.find((col) => col.key === key);
      doc.text(text, left + c.x + 4, opts.y ?? y, { width: c.width, align: c.align });
    };
    doc.fillColor(COLORS.text).font('regular').fontSize(9.5);
    cell('no', String(index + 1));
    cell('item', item.name);
    doc.font('regular').fontSize(8).fillColor(COLORS.muted);
    cell('item', item.sku, { y: y + nameHeight + 1 });
    doc.font('regular').fontSize(9.5).fillColor(COLORS.text);
    cell('qty', `${item.quantity.toLocaleString('en-US')} ${item.unit}`);
    cell('price', money.format(item.unitPrice));
    cell('amount', money.format(item.lineTotal));
    y += rowHeight;
    doc.moveTo(left, y - 4).lineTo(right, y - 4).lineWidth(0.5).strokeColor(COLORS.line).stroke();
  });

  // ---------- totals ----------
  if (y + 90 > doc.page.height - MARGIN - 40) {
    doc.addPage();
    y = MARGIN;
  }
  y += 8;
  const totals = [['Subtotal', money.format(order.subtotal)]];
  if (order.discount > 0) totals.push(['Discount', `-${money.format(order.discount)}`]);
  for (const [label, value] of totals) {
    doc.font('regular').fontSize(10).fillColor(COLORS.muted).text(label, right - 220, y, { width: 120 });
    doc.fillColor(COLORS.text).text(value, right - 100, y, { width: 100, align: 'right' });
    y += 18;
  }
  doc.moveTo(right - 220, y).lineTo(right, y).lineWidth(1).strokeColor(COLORS.text).stroke();
  y += 8;
  doc.font('bold').fontSize(13).fillColor(COLORS.text).text('Total', right - 220, y, { width: 120 });
  doc.text(money.format(order.totalAmount), right - 120, y, { width: 120, align: 'right' });
  y += 30;

  if (order.note) {
    doc.font('bold').fontSize(8).fillColor(COLORS.muted).text('NOTE', left, y, { width: 300 });
    doc.font('regular').fontSize(9).fillColor(COLORS.text).text(order.note, left, doc.y + 2, { width: 300 });
    y = doc.y + 12;
  }
  if (cancelled) {
    doc.font('bold').fontSize(8).fillColor(COLORS.danger).text('CANCELLED', left, y, { width: 300 });
    doc.font('regular').fontSize(9).fillColor(COLORS.text)
      .text(`${date(order.cancelledBy.at)} by ${order.cancelledBy.name}: ${order.cancelReason}`, left, doc.y + 2, { width: 300 });
  }

  // ---------- cancelled stamp, footer and page numbers on every page ----------
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    if (cancelled) {
      doc.save();
      doc.rotate(-30, { origin: [doc.page.width / 2, doc.page.height / 2] });
      doc.font('bold').fontSize(80).fillColor(COLORS.danger).opacity(0.15)
        .text('CANCELLED', 0, doc.page.height / 2 - 50, { width: doc.page.width, align: 'center', lineBreak: false });
      doc.restore();
    }
    // The footer sits in the bottom margin; without lifting it PDFKit would start a new page.
    const { bottom } = doc.page.margins;
    doc.page.margins.bottom = 0;
    const footerY = doc.page.height - MARGIN + 10;
    doc.opacity(1).font('regular').fontSize(8).fillColor(COLORS.muted)
      .text('Thank you for your business.', left, footerY, { width: width / 2, lineBreak: false })
      .text(`Page ${i - range.start + 1} of ${range.count}`, left + width / 2, footerY, { width: width / 2, align: 'right', lineBreak: false });
    doc.page.margins.bottom = bottom;
  }

  doc.end();
  return done;
}
