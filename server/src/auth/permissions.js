// Single source of truth for who can do what. Routes check permissions (not role
// names), and /api/auth/me sends the user's list to the client so the UI can hide
// what the API would refuse anyway. Admin is granted every permission.
export const ROLES = ['admin', 'manager', 'staff'];

const ALL = ['admin', 'manager', 'staff'];
const MANAGEMENT = ['admin', 'manager'];

export const PERMISSIONS = {
  'products.view': ALL,
  'products.manage': MANAGEMENT,

  'stock.view': ALL,
  'stock.transfer': MANAGEMENT,
  'stock.adjust': MANAGEMENT,

  'purchase_orders.view': MANAGEMENT,
  'purchase_orders.create': MANAGEMENT,
  'purchase_orders.approve': MANAGEMENT,
  'purchase_orders.receive': MANAGEMENT,

  'sales_orders.view': ALL,
  'sales_orders.create': ALL,
  'sales_orders.cancel': MANAGEMENT,

  // Staff need to add customers while taking an order.
  'customers.view': ALL,
  'customers.manage': ALL,

  'suppliers.view': MANAGEMENT,
  'suppliers.manage': MANAGEMENT,

  'reports.view': MANAGEMENT,
  'audit_log.view': ['admin'],
  'users.manage': ['admin'],
  'warehouses.manage': ['admin'],
  'settings.manage': ['admin'],
};

export function hasPermission(role, permission) {
  return PERMISSIONS[permission]?.includes(role) ?? false;
}

export function permissionsFor(role) {
  return Object.keys(PERMISSIONS).filter((p) => hasPermission(role, p));
}
