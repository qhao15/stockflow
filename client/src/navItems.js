import DashboardIcon from '@mui/icons-material/Dashboard';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import WarehouseIcon from '@mui/icons-material/Warehouse';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import PointOfSaleIcon from '@mui/icons-material/PointOfSale';
import PeopleIcon from '@mui/icons-material/People';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import HistoryIcon from '@mui/icons-material/History';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';

// permission: needed to see the module (see server/src/auth/permissions.js).
export const navItems = [
  { label: 'Dashboard', path: '/', icon: DashboardIcon },
  { label: 'Products', path: '/products', icon: Inventory2Icon, permission: 'products.view', description: 'Catalog, SKUs, categories, Excel import' },
  { label: 'Warehouses & Stock', path: '/stock', icon: WarehouseIcon, permission: 'stock.view', description: 'Stock per warehouse, transfers, low-stock alerts' },
  { label: 'Purchase Orders', path: '/purchase-orders', icon: ShoppingCartIcon, permission: 'purchase_orders.view', description: 'Draft → approved → received' },
  { label: 'Sales Orders', path: '/sales-orders', icon: PointOfSaleIcon, permission: 'sales_orders.view', description: 'Orders, cancellations, PDF invoices' },
  { label: 'Customers', path: '/customers', icon: PeopleIcon, permission: 'customers.view', description: 'Contacts and order history' },
  { label: 'Suppliers', path: '/suppliers', icon: LocalShippingIcon, permission: 'suppliers.view', description: 'Contacts and purchase history' },
  { label: 'Audit Log', path: '/audit-log', icon: HistoryIcon, permission: 'audit_log.view', description: 'Who changed what and when' },
  { label: 'Users & Settings', path: '/admin', icon: AdminPanelSettingsIcon, permission: 'users.manage', description: 'Users, roles, warehouses' },
];
