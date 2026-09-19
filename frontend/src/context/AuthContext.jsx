import React, { createContext, useContext, useState, useCallback } from 'react';

// ─────────────────────────────────────────────
// Storage keys
// ─────────────────────────────────────────────
const KEYS = {
  loggedIn:     'kemps_logged_in',
  username:     'kemps_username',
  name:         'kemps_name',
  token:        'kemps_auth_token',
  roleId:       'kemps_role_id',
  roleName:     'kemps_role_name',
  isSuperAdmin: 'kemps_is_super_admin',
  permissions:  'kemps_permissions',
};

// ─────────────────────────────────────────────
// Helpers to read from localStorage
// ─────────────────────────────────────────────
function readAuth() {
  // The signed token is the authoritative source for super-admin status. This
  // also repairs browsers that retained an old/incorrect localStorage flag.
  let tokenClaims = {};
  try {
    const token = localStorage.getItem(KEYS.token);
    if (token) {
      const payload = token.split('.')[1];
      const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
      const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
      tokenClaims = JSON.parse(atob(padded));
    }
  } catch {
    tokenClaims = {};
  }
  const storedSuperAdmin = localStorage.getItem(KEYS.isSuperAdmin) === 'true';
  const isSuperAdmin = typeof tokenClaims.isSuperAdmin === 'boolean'
    ? tokenClaims.isSuperAdmin
    : storedSuperAdmin;
  localStorage.setItem(KEYS.isSuperAdmin, String(isSuperAdmin));
  let permissions = {};
  try {
    permissions = JSON.parse(localStorage.getItem(KEYS.permissions) || '{}');
  } catch {
    permissions = {};
  }
  return {
    user: {
      username:    localStorage.getItem(KEYS.username) || '',
      name:        localStorage.getItem(KEYS.name)     || '',
      role_id:     localStorage.getItem(KEYS.roleId)   || null,
      role_name:   localStorage.getItem(KEYS.roleName) || '',
      isSuperAdmin,
    },
    isSuperAdmin,
    permissions, // { [module]: { read, create, update, delete } }
  };
}

// ─────────────────────────────────────────────
// Module parent-child relationships for permission inheritance
// ─────────────────────────────────────────────
export const MODULE_PARENT_MAP = {
  // Office Work
  'maintenance-form': 'maintenance',
  'maintenance-history': 'maintenance',
  'maintenance-particulars': 'maintenance-master',
  'maintenance-sub-products': 'maintenance-master',
  'expense-history': 'expense',
  'bank-deposit-history': 'bank-deposit',
  'supplier-payments-pending': 'supplier-payments',
  'supplier-payments-history': 'supplier-payments',
  'supplier-ledger-tab': 'supplier-ledger',
  'supplier-ledger-analytics': 'supplier-ledger',
  'product-master-finished': 'product-master',
  'product-master-raw': 'product-master',

  // Sales
  'accounts-ledger-tab': 'accounts-ledger',
  'accounts-ledger-analytics': 'accounts-ledger',
  'billing-form': 'billing',
  'billing-history': 'billing',
  'credit-history': 'credit-balance',
  'orders-upcoming': 'orders',
  'orders-new': 'orders',
  'orders-history': 'orders',
  'total-sales-overview': 'total-sales',
  'total-sales-monthly': 'total-sales',
  'total-sales-products': 'total-sales',
  'total-sales-customers': 'total-sales',
  'total-sales-collection': 'total-sales',
  'total-sales-companies': 'total-sales',
  'total-sales-top': 'total-sales',
  'sales-return-new': 'sales-return',
  'sales-return-history': 'sales-return',
  'sales-return-reports': 'sales-return',
  // Production
  'inventory-history': 'inventory',
  'pet-bottle-history': 'pet-bottle',
  'stock-correction-history': 'stock-correction',
  'production-form': 'production',
  'production-history': 'production',
  'timer-dashboard': 'timer',
  'timer-history': 'timer',
  'raw-material-history': 'raw-material-ledger',

  // Warehouse
  'loading-active': 'loading',
  'loading-history': 'loading',
  'sunday-loading-history': 'sunday-loading',
  'can-supply-balances': 'can-supply',
  'can-supply-workspace': 'can-supply',
  'can-supply-billing': 'can-supply',
  'can-supply-payments': 'can-supply',
  'can-supply-reports': 'can-supply',

  // Orders & Distribution
  'distribution-order-active': 'distribution-order',
  'distribution-order-new': 'distribution-order',
  'distribution-order-history': 'distribution-order',
};

export const PARENT_CHILDREN_MAP = {};
Object.entries(MODULE_PARENT_MAP).forEach(([child, parent]) => {
  if (!PARENT_CHILDREN_MAP[parent]) PARENT_CHILDREN_MAP[parent] = [];
  PARENT_CHILDREN_MAP[parent].push(child);
});

// ─────────────────────────────────────────────
// Route module order for dynamic redirect
// ─────────────────────────────────────────────
export const ROUTE_MODULE_MAP = [
  { path: '/dashboard', module: 'dashboard' },
  { path: '/stock-dashboard', module: 'stock-dashboard' },
  { path: '/production-dashboard', module: 'production-dashboard' },
  { path: '/sunday-dashboard', module: 'sunday-dashboard' },
  { path: '/imp-work', module: 'imp-work' },
  { path: '/billing', module: 'billing' },
  { path: '/orders', module: 'orders' },
  { path: '/loading', module: 'loading' },
  { path: '/sunday-loading', module: 'sunday-loading' },
  { path: '/can-supply', module: 'can-supply' },
  { path: '/inventory', module: 'inventory' },
  { path: '/wastage', module: 'wastage' },
  { path: '/weight-measurement', module: 'weight-measurement' },
  { path: '/tools-inventory', module: 'tools-inventory' },
  { path: '/production-form', module: 'production' },
  { path: '/timer', module: 'timer' },
  { path: '/pet-bottle', module: 'pet-bottle' },
  { path: '/stock-correction', module: 'stock-correction' },
  { path: '/customer', module: 'customer' },
  { path: '/expense', module: 'expense' },
  { path: '/accounts-ledger', module: 'accounts-ledger' },
  { path: '/cash-ledger', module: 'cash-ledger' },
  { path: '/raw-material-ledger', module: 'raw-material-ledger' },
  { path: '/goods-ledger', module: 'goods-ledger' },
  { path: '/distribution-order', module: 'distribution-order' },
  { path: '/can-deposit', module: 'can-deposit' },
  { path: '/maintenance-form', module: 'maintenance-form' },
  { path: '/maintenance-master', module: 'maintenance-master' },
  { path: '/bank-deposit', module: 'bank-deposit' },
  { path: '/company-details', module: 'company-details' },
  { path: '/supplier-payments', module: 'supplier-payments' },
  { path: '/supplier-ledger', module: 'supplier-ledger' },
  { path: '/product-master', module: 'product-master' },
  { path: '/sales-return', module: 'sales-return' },
  { path: '/total-sales', module: 'total-sales' },
];

// ─────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [authState, setAuthState] = useState(readAuth);

  // Called on successful login
  const login = useCallback((userData, permissions) => {
    localStorage.setItem(KEYS.loggedIn,     'true');
    localStorage.setItem(KEYS.username,     userData.username   || '');
    localStorage.setItem(KEYS.name,         userData.name       || '');
    localStorage.setItem(KEYS.token,        userData.token      || '');
    localStorage.setItem(KEYS.roleId,       userData.role_id    ?? '');
    localStorage.setItem(KEYS.roleName,     userData.role_name  || '');
    localStorage.setItem(KEYS.isSuperAdmin, String(!!userData.isSuperAdmin));
    localStorage.setItem(KEYS.permissions,  JSON.stringify(permissions || {}));
    setAuthState(readAuth());
    window.dispatchEvent(new Event('kemps_auth_change'));
  }, []);

  // Called on logout
  const logout = useCallback(() => {
    Object.values(KEYS).forEach(k => localStorage.removeItem(k));
    setAuthState(readAuth());
    window.dispatchEvent(new Event('kemps_auth_change'));
    window.location.href = '/login';
  }, []);

  // ── Permission helpers ──
  // Superadmin bypasses ALL checks
  const checkPerm = useCallback((module, action) => {
    if (authState.isSuperAdmin) return true;
    if (authState.permissions[module]?.[action]) return true;
    const parent = MODULE_PARENT_MAP[module];
    if (parent && authState.permissions[parent]?.[action]) return true;
    const children = PARENT_CHILDREN_MAP[module];
    if (children && children.some(c => authState.permissions[c]?.[action])) return true;
    return false;
  }, [authState]);

  const canRead   = useCallback((module) => checkPerm(module, 'read'),   [checkPerm]);
  const canCreate = useCallback((module) => checkPerm(module, 'create'), [checkPerm]);
  const canUpdate = useCallback((module) => checkPerm(module, 'update'), [checkPerm]);
  const canDelete = useCallback((module) => checkPerm(module, 'delete'), [checkPerm]);

  const getFirstPermittedPath = useCallback((customPerms = null, customIsSuperAdmin = null) => {
    const isLoggedIn = localStorage.getItem(KEYS.loggedIn) === 'true';
    if (!isLoggedIn) return '/login';
    const isSuper = customIsSuperAdmin !== null ? customIsSuperAdmin : authState.isSuperAdmin;
    if (isSuper) return '/dashboard';
    const perms = customPerms || authState.permissions || {};
    for (const item of ROUTE_MODULE_MAP) {
      if (perms[item.module]?.read) return item.path;
      const parent = MODULE_PARENT_MAP[item.module];
      if (parent && perms[parent]?.read) return item.path;
      const children = PARENT_CHILDREN_MAP[item.module];
      if (children && children.some(c => perms[c]?.read)) return item.path;
    }
    return '/access-denied';
  }, [authState.isSuperAdmin, authState.permissions]);

  const value = {
    user:        authState.user,
    isSuperAdmin: authState.isSuperAdmin,
    permissions: authState.permissions,
    login,
    logout,
    canRead,
    canCreate,
    canUpdate,
    canDelete,
    getFirstPermittedPath,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ─────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

export default AuthContext;
