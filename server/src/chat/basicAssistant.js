// The assistant without an AI model: it recognises a few kinds of question, calls the matching
// tool and writes the answer from the result. An AI model will replace this file and use the
// same tools (tools.js) and the same reply shape. Links are [label](/path) to pages in the app.
import { hasPermission } from '../auth/permissions.js';
import { runTool } from './tools.js';

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const count = (n) => Number(n).toLocaleString('en-US');
const day = (value) => new Date(value).toISOString().slice(0, 10);
const productLink = (p) => `[${p.sku}](/products?search=${encodeURIComponent(p.sku)})`;
const NO_ACCESS = "Your role doesn't have access to that, so I can't show it.";

// What each kind of question looks like, the tool it needs, and how to answer it. The first match wins.
const INTENTS = [
  {
    match: /\bSO-?\d+\b/i,
    tool: 'find_sales_order',
    args: (q) => ({ query: q.match(/\bSO-?\d+\b/i)[0].toUpperCase().replace(/^SO(\d)/, 'SO-$1') }),
    answer: ({ orders }) => (orders.length
      ? orders.map((o) => `- [${o.orderNumber}](/sales-orders/${o.id}): ${o.status}, ${money.format(o.totalAmount)}, ${o.customer}, ${day(o.orderDate)}`).join('\n')
      : "I couldn't find that sales order."),
  },
  {
    match: /\bPO-?\d+\b/i,
    tool: 'find_purchase_order',
    args: (q) => ({ query: q.match(/\bPO-?\d+\b/i)[0].toUpperCase().replace(/^PO(\d)/, 'PO-$1') }),
    answer: ({ orders }) => (orders.length
      ? orders.map((o) => `- [${o.poNumber}](/purchase-orders/${o.id}): ${o.status}, ${money.format(o.totalAmount)}, ${o.supplier}, ${day(o.orderDate)}`).join('\n')
      : "I couldn't find that purchase order."),
  },
  {
    match: /\b(low|running out|reorder|below minimum)\b/i,
    tool: 'low_stock',
    answer: ({ rows, total }) => (rows.length
      ? [`${count(total)} product and warehouse pairs are at or below their minimum. Furthest below first:`,
        ...rows.map((r) => `- ${productLink(r)} ${r.name}: ${count(r.quantity)} in ${r.warehouseCode}, minimum ${count(r.minStock)}`),
        '[See them all](/stock?lowStock=1)'].join('\n')
      : 'Nothing is below its minimum right now.'),
  },
  {
    match: /\b(top|best[- ]?sell\w*|selling)\b/i,
    tool: 'top_products',
    args: (q) => ({ days: Number(q.match(/\b(7|30|90)\b/)?.[1] ?? 30), by: /revenue|money|\$/i.test(q) ? 'revenue' : 'quantity' }),
    answer: ({ products, by, from, to }) => (products.length
      ? [`Best sellers by ${by} from ${from} to ${to}:`,
        ...products.map((p, i) => `${i + 1}. ${productLink(p)} ${p.name}: ${count(p.quantity)} units, ${money.format(p.revenue)}`)].join('\n')
      : 'No sales in that period.'),
  },
  {
    match: /\b(revenue|sales|orders this month|how many orders|summary|overview|kpi)\b/i,
    tool: 'sales_summary',
    answer: (s) => [
      'This month so far:',
      `- Sales orders: ${count(s.ordersThisMonth)} (${count(s.ordersLastMonth)} last month)`,
      ...(s.revenueThisMonth === undefined ? [] : [`- Revenue: ${money.format(s.revenueThisMonth)} (${money.format(s.revenueLastMonthToDate)} by this day last month)`]),
      `- Active products: ${count(s.activeProducts)}`,
      `- Products low on stock: ${count(s.lowStockProducts)}`,
    ].join('\n'),
  },
  {
    match: /\bcustomers?\b\s*:?\s*(.+)/i,
    tool: 'find_customer',
    args: (q) => ({ query: q.match(/\bcustomers?\b\s*:?\s*(.+)/i)[1].trim() }),
    answer: ({ customers }) => (customers.length
      ? customers.map((c) => `- [${c.code}](/customers/${c.id}) ${c.name}${c.city ? `, ${c.city}` : ''}: ${count(c.orderCount)} orders${c.isActive ? '' : ' (inactive)'}`).join('\n')
      : 'No customer matches that.'),
  },
  {
    match: /\bsuppliers?\b\s*:?\s*(.+)/i,
    tool: 'find_supplier',
    args: (q) => ({ query: q.match(/\bsuppliers?\b\s*:?\s*(.+)/i)[1].trim() }),
    answer: ({ suppliers }) => (suppliers.length
      ? suppliers.map((s) => `- [${s.code}](/suppliers/${s.id}) ${s.name}: ${count(s.receivedCount)} received POs, ${money.format(s.spend)} spent, ${count(s.openCount)} open`).join('\n')
      : 'No supplier matches that.'),
  },
  {
    match: /\b(stock|in stock|how many|left|available)\b/i,
    tool: 'stock_levels',
    args: (q) => ({ query: subject(q) }),
    answer: ({ products }) => (products.length
      ? products.map((p) => `- ${productLink(p)} ${p.name}: ${count(p.total)} in total (${p.warehouses.map((w) => `${w.code} ${count(w.quantity)}`).join(', ')})`).join('\n')
      : 'No product matches that.'),
  },
  {
    match: /\b(find|search|price|product|sku)\b/i,
    tool: 'search_products',
    args: (q) => ({ query: subject(q) }),
    answer: ({ products }) => (products.length
      ? products.map((p) => `- ${productLink(p)} ${p.name}: ${money.format(p.salePrice)}${p.costPrice === undefined ? '' : `, cost ${money.format(p.costPrice)}`}, ${count(p.stock)} in stock${p.isActive ? '' : ' (inactive)'}`).join('\n')
      : 'No product matches that.'),
  },
];

// What's left of a question after the words that only say what kind of question it is.
const FILLER = /\b(how|many|much|is|are|the|of|for|in|stock|left|available|do|we|have|find|search|show|me|price|product|products|sku|what|please|a|an)\b|[?!.,]/gi;
const subject = (q) => q.replace(FILLER, ' ').replace(/\s+/g, ' ').trim();

// The examples offered for help, only those this role can use.
function help(user) {
  const examples = [
    ['stock.view', 'Which products are low on stock?'],
    ['stock.view', 'How many USB-C cables are in stock?'],
    ['products.view', 'Find product mouse'],
    ['sales_orders.view', 'Show SO-000123'],
    ['purchase_orders.view', 'Show PO-000045'],
    ['customers.view', 'Customer Minh Phat'],
    ['suppliers.view', 'Supplier Anker'],
    [null, 'Summary of this month'],
    ['reports.view', 'Top products by revenue for 90 days'],
  ].filter(([permission]) => !permission || hasPermission(user.role, permission));
  return ["I'm a basic assistant for now: I answer a few kinds of question about StockFlow, using what your role can see. Try:",
    ...examples.map(([, example]) => `- ${example}`)].join('\n');
}

// Answers the latest question. Yields the reply in parts, like a model's streamed answer.
export async function* reply({ question, user }) {
  const intent = INTENTS.find((i) => i.match.test(question));
  if (!intent) {
    yield help(user);
    return;
  }
  const args = intent.args?.(question) ?? {};
  if (Object.hasOwn(args, 'query') && !args.query) {
    yield 'What should I look for? Add a name or SKU, for example "How many USB-C cables are in stock?".';
    return;
  }
  let result;
  try {
    result = await runTool(intent.tool, args, user);
  } catch (err) {
    if (err.status === 403) {
      yield NO_ACCESS;
      return;
    }
    throw err;
  }
  for (const line of intent.answer(result).split('\n')) yield `${line}\n`;
}
