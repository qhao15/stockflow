import DashboardIcon from '@mui/icons-material/Dashboard';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import WarehouseIcon from '@mui/icons-material/Warehouse';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import PointOfSaleIcon from '@mui/icons-material/PointOfSale';
import PeopleIcon from '@mui/icons-material/People';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import HistoryIcon from '@mui/icons-material/History';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';

export const navItems = [
  { label: 'Dashboard', path: '/', icon: DashboardIcon },
  { label: 'Products', path: '/products', icon: Inventory2Icon, description: 'Catalog, SKUs, categories, Excel import' },
  { label: 'Warehouses & Stock', path: '/stock', icon: WarehouseIcon, description: 'Stock per warehouse, transfers, low-stock alerts' },
  { label: 'Purchase Orders', path: '/purchase-orders', icon: ShoppingCartIcon, description: 'Draft → approved → received' },
  { label: 'Sales Orders', path: '/sales-orders', icon: PointOfSaleIcon, description: 'Orders, cancellations, PDF invoices' },
  { label: 'Customers', path: '/customers', icon: PeopleIcon, description: 'Contacts and order history' },
  { label: 'Suppliers', path: '/suppliers', icon: LocalShippingIcon, description: 'Contacts and purchase history' },
  { label: 'Audit Log', path: '/audit-log', icon: HistoryIcon, description: 'Who changed what and when' },
  { label: 'Users & Settings', path: '/admin', icon: AdminPanelSettingsIcon, description: 'Users, roles, warehouses' },
];
