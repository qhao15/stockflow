// Small helpers shared by the services.

// Document numbers from ids: 42 -> '000042' (PO-000042, SO-000042, TR-000042).
export const pad = (n) => String(n).padStart(6, '0');

// Escapes LIKE wildcards so a search for "50%" matches the text "50%".
export const escapeLike = (text) => text.replace(/[\\%_]/g, (ch) => `\\${ch}`);

// Money in cents, so line totals and order totals add up exactly.
export const cents = (amount) => Math.round(amount * 100);
export const fromCents = (value) => (value / 100).toFixed(2);
