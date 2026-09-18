export const SYSTEM_MODULE_CATEGORIES = [
  {
    id: 'dashboards',
    name: 'Dashboards',
    icon: '⊞',
    description: 'Executive overviews and operations dashboards',
    modules: [
      { path: '/dashboard', label: 'Main Dashboard', icon: '⊞' },
      { path: '/stock-dashboard', label: 'Stock Dashboard', icon: '📦' },
      { path: '/production-dashboard', label: 'Production Dashboard', icon: '🏭' },
      { path: '/sunday-dashboard', label: 'Sunday Dashboard', icon: '☀️' }
    ]
  },
  {
    id: 'urgent',
    name: 'Important Work',
    icon: '🚨',
    description: 'Urgent task manager and historical records',
    modules: [
      { path: '/imp-work', label: 'IMP Work (Task Manager)', icon: '🚨' }
    ]
  },
  {
    id: 'sales',
    name: 'Sales & Ledgers',
    icon: '🧾',
    description: 'Invoicing, customer management, and sales accounting',
    modules: [
      { path: '/customer', label: 'Customer Data', icon: '👤' },
      { path: '/accounts-ledger', label: 'Accounts Ledger', icon: '📒' },
      { path: '/cash-ledger', label: 'Cash Ledger', icon: '💰' },
      { path: '/billing', label: 'Billing / Invoices', icon: '🧾' },
      { path: '/billing-form', label: 'Billing Form', icon: '📝' },
      { path: '/billing-history', label: 'Billing History', icon: '📜' },
      { path: '/credit-balance', label: 'Credit Balance', icon: '💳' },
      { path: '/credit-history', label: 'Credit History', icon: '📜' },
      { path: '/orders', label: 'Function Orders', icon: '🛍️' },
      { path: '/order-details', label: 'Order Details', icon: '📋' },
      { path: '/total-sales', label: 'Total Sales', icon: '📊' },
      { path: '/sales-return', label: 'Sales Return / Credit Note', icon: '↩️' }
    ]
  },
  {
    id: 'inventory',
    name: 'Inventory & Stock Operations',
    icon: '📦',
    description: 'Raw materials, spare parts, and stock tracking',
    modules: [
      { path: '/inventory', label: 'Inventory (Raw Materials)', icon: '📦' },
      { path: '/inventory-history', label: 'Inventory History', icon: '📜' },
      { path: '/pet-bottle', label: 'PET Bottle Stock', icon: '🍼' },
      { path: '/pet-bottle-history', label: 'PET Bottle History', icon: '📜' },
      { path: '/stock-correction', label: 'Stock Correction', icon: '⚙️' },
      { path: '/stock-correction-history', label: 'Stock Correction History', icon: '📜' },
      { path: '/wastage', label: 'Wastage Loss Tracker', icon: '🗑️' },
      { path: '/weight-measurement', label: 'Weight Measurement', icon: '⚖️' },
      { path: '/tools-inventory', label: 'Tools Inventory', icon: '🔧' }
    ]
  },
  {
    id: 'production',
    name: 'Production & Machine Timers',
    icon: '🏭',
    description: 'Bottling operations, finished goods, and timers',
    modules: [
      { path: '/production-form', label: 'Production Form', icon: '🏭' },
      { path: '/production-history', label: 'Production History', icon: '📜' },
      { path: '/goods-ledger', label: 'Goods Ledger', icon: '📊' },
      { path: '/goods-history', label: 'Goods History', icon: '📜' },
      { path: '/timer', label: 'Machine Timer', icon: '⏱️' },
      { path: '/timer-history', label: 'Timer History', icon: '⏳' }
    ]
  },
  {
    id: 'warehouse',
    name: 'Warehouse & Logistics',
    icon: '🚚',
    description: 'Dispatches, loadings, and can supply',
    modules: [
      { path: '/raw-material-ledger', label: 'Raw Material Ledger', icon: '🪨' },
      { path: '/raw-material-history', label: 'Raw Material History', icon: '📜' },
      { path: '/distribution-order', label: 'Distribution Order', icon: '🚚' },
      { path: '/loading', label: 'Loading Operations', icon: '🏪' },
      { path: '/sunday-loading', label: 'Sunday Loading', icon: '☀️' },
      { path: '/sunday-loading-history', label: 'Sunday Loading History', icon: '📜' },
      { path: '/can-supply', label: 'Can Supply', icon: '🥤' },
      { path: '/can-deposit', label: 'Can Deposit Ledger', icon: '📥' }
    ]
  },
  {
    id: 'office',
    name: 'Office & Finance',
    icon: '🏢',
    description: 'Maintenance, expenses, and banking',
    modules: [
      { path: '/maintenance-form', label: 'Maintenance Form', icon: '🛠️' },
      { path: '/maintenance-history', label: 'Maintenance History', icon: '📜' },
      { path: '/maintenance-master', label: 'Maintenance Master', icon: '⚙️' },
      { path: '/expense', label: 'Expense Tracking', icon: '💸' },
      { path: '/expense-history', label: 'Expense History', icon: '📜' },
      { path: '/bank-deposit', label: 'Bank Deposit', icon: '🏦' },
      { path: '/bank-deposit-history', label: 'Bank Deposit History', icon: '📜' },
      { path: '/company-details', label: 'Company Details', icon: '🏢' },
      { path: '/supplier-payments', label: 'Supplier Payments', icon: '💳' },
      { path: '/supplier-ledger', label: 'Supplier Ledger', icon: '📓' },
      { path: '/product-master', label: 'Product Master', icon: '📦' }
    ]
  }
];

// Helper to get flat array of all paths
export const ALL_MODULE_PATHS = SYSTEM_MODULE_CATEGORIES.flatMap(cat => cat.modules.map(m => m.path));

// Role Presets
export const ROLE_PRESETS = [
  {
    name: 'Full Access (All Modules)',
    paths: ALL_MODULE_PATHS
  },
  {
    name: 'Sales & Billing Operator',
    paths: [
      '/dashboard',
      '/imp-work',
      '/customer',
      '/accounts-ledger',
      '/cash-ledger',
      '/billing',
      '/billing-form',
      '/billing-history',
      '/credit-balance',
      '/credit-history',
      '/orders',
      '/order-details',
      '/total-sales',
      '/sales-return',
      '/distribution-order',
      '/can-supply',
      '/can-deposit'
    ]
  },
  {
    name: 'Production & Machine Line',
    paths: [
      '/dashboard',
      '/production-dashboard',
      '/imp-work',
      '/production-form',
      '/production-history',
      '/pet-bottle',
      '/pet-bottle-history',
      '/goods-ledger',
      '/goods-history',
      '/raw-material-ledger',
      '/timer',
      '/timer-history',
      '/weight-measurement'
    ]
  },
  {
    name: 'Warehouse & Inventory Team',
    paths: [
      '/dashboard',
      '/stock-dashboard',
      '/imp-work',
      '/inventory',
      '/inventory-history',
      '/stock-correction',
      '/stock-correction-history',
      '/wastage',
      '/raw-material-ledger',
      '/raw-material-history',
      '/goods-ledger',
      '/goods-history',
      '/loading',
      '/sunday-loading',
      '/sunday-loading-history',
      '/tools-inventory'
    ]
  },
  {
    name: 'Office & Maintenance',
    paths: [
      '/dashboard',
      '/imp-work',
      '/maintenance-form',
      '/maintenance-history',
      '/maintenance-master',
      '/tools-inventory',
      '/expense',
      '/expense-history',
      '/bank-deposit',
      '/bank-deposit-history'
    ]
  }
];
