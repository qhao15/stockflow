export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_PASSWORD_LENGTH = 8;

// Cancelling an order (purchase or sales) needs a short reason.
export function validateCancel(body) {
  const reason = String(body.reason ?? '').trim();
  if (!reason) return { error: 'Give a reason for cancelling' };
  if (reason.length > 255) return { error: 'Reason can be at most 255 characters' };
  return { values: { reason } };
}
