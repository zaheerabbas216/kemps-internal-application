import React, { useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

// ─────────────────────────────────────────────
// Full nav definition with module keys for RBAC
// ─────────────────────────────────────────────
const navGroups = [
  { type: 'button', name: 'Dashboard',           path: '/dashboard',            icon: '⊞',  module: 'dashboard' },
  { type: 'button', name: 'Stock Dashboard',     path: '/stock-dashboard',      icon: '📦', module: 'stock-dashboard' },
  { type: 'button', name: 'Production Dashboard',path: '/production-dashboard', icon: '🏭', module: 'production-dashboard' },
  { type: 'button', name: 'Sunday Dashboard',    path: '/sunday-dashboard',     icon: '☀️', module: 'sunday-dashboard' },

  { type: 'section', title: 'Sales' },
  { type: 'button', name: 'Customer Data',    path: '/customer',        icon: '👤', module: 'customer' },
  { type: 'button', name: 'Accounts Ledger', path: '/accounts-ledger', icon: '📒', module: 'accounts-ledger' },
  { type: 'button', name: 'Cash Ledger',     path: '/cash-ledger',     icon: '💰', module: 'cash-ledger' },
  {
    type: 'group', title: 'Sales', id: 'grpSales', icon: '🧾',
    items: [
      { name: 'Billing',                    path: '/billing',        module: 'billing' },
      { name: 'Credit Balance',             path: '/credit-balance', module: 'credit-balance' },
      { name: 'Order Management',           path: '/orders',         module: 'orders' },
      { name: 'Order Details',              path: '/order-details',  module: 'order-details' },
      { name: 'Total Sales',                path: '/total-sales',    module: 'total-sales' },
      { name: 'Sales Return / Credit Note', path: '/sales-return',   module: 'sales-return' },
      { name: 'Payment Approval',           path: '/payment-approval', module: 'payment-approval' },
    ]
  },

  { type: 'section', title: 'Production' },
  {
    type: 'group', title: 'Inventory Stock', id: 'grpStock', icon: '📦',
    items: [
      { name: 'Inventory',        path: '/inventory',        module: 'inventory' },
      { name: 'Pet Bottle',       path: '/pet-bottle',       module: 'pet-bottle' },
      { name: 'Stock Correction', path: '/stock-correction', module: 'stock-correction' },
    ]
  },
  {
    type: 'group', title: 'Production', id: 'grpProd', icon: '🏭',
    items: [
      { name: 'Production Form', path: '/production-form', module: 'production' },
      { name: 'Goods Ledger',    path: '/goods-ledger',    module: 'goods-ledger' },
      { name: 'Goods History',   path: '/goods-history',   module: 'goods-history' },
    ]
  },
  {
    type: 'group', title: 'Machine Timer', id: 'grpTimer', icon: '⏱️',
    items: [
      { name: 'Timer Dashboard', path: '/timer',         module: 'timer' },
      { name: 'Timer History',   path: '/timer-history', module: 'timer' },
    ]
  },
  { type: 'button', name: 'Raw Material Ledger', path: '/raw-material-ledger', icon: '🪨', module: 'raw-material-ledger' },

  { type: 'section', title: 'Orders' },
  { type: 'button', name: 'Order Details', path: '/order-details', icon: '📋', module: 'order-details' },
  {
    type: 'group', title: 'Distribution', id: 'grpDO', icon: '🚚',
    items: [
      { name: 'Distribution Order', path: '/distribution-order', module: 'distribution-order' },
    ]
  },

  { type: 'section', title: 'Warehouse' },
  {
    type: 'group', title: 'Loading', id: 'grpWH', icon: '🏪',
    items: [
      { name: 'Loading',                  path: '/loading',                  module: 'loading' },
      { name: 'Sunday Loading',           path: '/sunday-loading',           module: 'sunday-loading' },
      { name: 'Sunday Loading History',   path: '/sunday-loading-history',   module: 'sunday-loading-history' },
    ]
  },
  {
    type: 'group', title: 'Can Supply', id: 'grpCan', icon: '🥤',
    items: [
      { name: 'Can Supply',  path: '/can-supply',  module: 'can-supply' },
      { name: 'Can Deposit', path: '/can-deposit', module: 'can-deposit' },
    ]
  },

  { type: 'section', title: 'Office' },
  {
    type: 'group', title: 'Office Work', id: 'grpOff', icon: '🗂️',
    items: [
      { name: 'Maintenance Form',    path: '/maintenance-form',    module: 'maintenance-form' },
      { name: 'Maintenance Master',  path: '/maintenance-master',  module: 'maintenance-master' },
      { name: 'Maintenance History', path: '/maintenance-history', module: 'maintenance-history' },
    ]
  },
  { type: 'button', name: 'Expense',           path: '/expense',           icon: '💸', module: 'expense' },
  { type: 'button', name: 'Bank Deposit',      path: '/bank-deposit',      icon: '🏦', module: 'bank-deposit' },
  { type: 'button', name: 'Company Details',   path: '/company-details',   icon: '🏢', module: 'company-details' },
  { type: 'button', name: 'Supplier Payments', path: '/supplier-payments', icon: '💳', module: 'supplier-payments' },
  { type: 'button', name: 'Supplier Ledger',   path: '/supplier-ledger',   icon: '📓', module: 'supplier-ledger' },
  { type: 'button', name: 'Product Master',    path: '/product-master',    icon: '📦', module: 'product-master' },

  // Admin Console — filtered separately, shown only to superadmin
  { type: 'section', title: 'Admin Console', adminOnly: true },
  {
    type: 'group', title: 'Admin Console', id: 'grpAdmin', icon: '⚙️', adminOnly: true,
    items: [
      { name: 'User Management',    path: '/user-authentication', module: null },
      { name: 'Roles & Permissions', path: '/admin/roles',        module: null },
    ]
  },
];

// ─────────────────────────────────────────────
// SidebarItem component
// ─────────────────────────────────────────────
const SidebarItem = ({ item, onClickItem, isCollapsed }) => {
  const location = useLocation();

  if (item.type === 'section') {
    if (isCollapsed) {
      return <div className="my-3 border-t border-slate-200/80 mx-2" title={item.title} />;
    }
    return (
      <h3 className="px-4 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-8 mb-3">
        {item.title}
      </h3>
    );
  }

  if (item.type === 'button') {
    return (
      <NavLink
        to={item.path}
        onClick={onClickItem}
        title={item.name}
        className={({ isActive }) =>
          `sidebar-item ${isCollapsed ? 'justify-center px-0 h-11 w-11 mx-auto' : ''} ${
            isActive ? 'sidebar-item-active' : 'sidebar-item-inactive'
          }`
        }
      >
        <span className="text-lg opacity-80 w-6 flex items-center justify-center shrink-0">{item.icon}</span>
        {!isCollapsed && <span className="truncate">{item.name}</span>}
      </NavLink>
    );
  }

  if (item.type === 'group') {
    const [isOpen, setIsOpen] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const [flyoutTop, setFlyoutTop] = useState(0);
    const buttonRef = React.useRef(null);

    const isChildActive = item.items.some(sub => sub.path === location.pathname);

    const handleMouseEnter = () => {
      if (buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        setFlyoutTop(rect.top);
      }
      setIsHovered(true);
    };

    if (isCollapsed) {
      return (
        <div
          className="relative group/flyout"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={() => setIsHovered(false)}
        >
          <button
            ref={buttonRef}
            onClick={() => {
              if (buttonRef.current) {
                const rect = buttonRef.current.getBoundingClientRect();
                setFlyoutTop(rect.top);
              }
              setIsOpen(!isOpen);
            }}
            title={item.title}
            className={`sidebar-item justify-center px-0 h-11 w-11 mx-auto ${
              isChildActive || isOpen ? 'sidebar-item-active' : 'sidebar-item-inactive'
            }`}
          >
            <span className="text-lg opacity-80 w-6 flex items-center justify-center shrink-0">{item.icon}</span>
          </button>

          {(isHovered || isOpen) && (
            <div
              style={{ top: `${Math.max(10, Math.min(window.innerHeight - 300, flyoutTop))}px` }}
              className="fixed left-[84px] z-[9999] bg-white border border-slate-200/90 rounded-2xl shadow-2xl p-2.5 min-w-[210px] animate-fade-in"
            >
              <div className="px-3 py-1.5 text-xs font-black text-slate-800 uppercase tracking-wider border-b border-slate-100 mb-1 flex items-center gap-2">
                <span>{item.icon}</span>
                <span>{item.title}</span>
              </div>
              <div className="space-y-1 max-h-[70vh] overflow-y-auto scrollbar-hide">
                {item.items.map((sub, idx) => (
                  <NavLink
                    key={idx}
                    to={sub.path}
                    onClick={() => {
                      setIsOpen(false);
                      setIsHovered(false);
                      if (onClickItem) onClickItem();
                    }}
                    className={({ isActive }) =>
                      `block px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                        isActive ? 'text-primary bg-primary/10 font-bold' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                      }`
                    }
                  >
                    {sub.name}
                  </NavLink>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="space-y-1">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`sidebar-item w-full flex items-center justify-between ${isOpen || isChildActive ? 'text-slate-900 bg-slate-50/50 font-semibold' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}
        >
          <div className="flex items-center gap-3 overflow-hidden">
            <span className="text-lg opacity-80 w-6 flex items-center justify-center shrink-0">{item.icon}</span>
            <span className="truncate">{item.title}</span>
          </div>
          <span className={`text-[10px] transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-90' : ''}`}>
            ▶
          </span>
        </button>
        {isOpen && (
          <div className="pl-9 space-y-1 mt-1 border-l-2 border-slate-100 ml-7">
            {item.items.map((sub, idx) => (
              <NavLink
                key={idx}
                to={sub.path}
                onClick={onClickItem}
                className={({ isActive }) =>
                  `block px-4 py-2 rounded-lg text-[13px] font-medium transition-all duration-200 ${
                    isActive ? 'text-primary bg-primary/5 font-bold' : 'text-slate-500 hover:text-slate-900'
                  }`
                }
              >
                {sub.name}
              </NavLink>
            ))}
          </div>
        )}
      </div>
    );
  }

  return null;
};

// ─────────────────────────────────────────────
// Sidebar component
// ─────────────────────────────────────────────
const Sidebar = ({ isOpen, onClose, isCollapsed, onToggleCollapse }) => {
  const navigate = useNavigate();
  const { user, isSuperAdmin, canRead } = useAuth();

  const fullName    = user.name || user.username || 'User';
  const roleName    = isSuperAdmin ? 'Superadmin' : (user.role_name || 'User');
  const userInitials = fullName
    .split(' ')
    .map(word => word.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'US';

  const handleItemClick = () => {
    if (onClose) onClose();
  };

  // ── Filter navGroups based on permissions ──
  const filteredNavGroups = navGroups.filter(item => {
    if (item.adminOnly) return isSuperAdmin;

    if (item.type === 'button') {
      // Dashboards always visible
      if (['dashboard', 'stock-dashboard', 'production-dashboard', 'sunday-dashboard'].includes(item.module)) {
        return true;
      }
      return isSuperAdmin || canRead(item.module);
    }

    if (item.type === 'group') {
      // Keep group if at least one child is accessible
      const visibleChildren = item.items.filter(sub =>
        sub.module === null || isSuperAdmin || canRead(sub.module)
      );
      return visibleChildren.length > 0;
    }

    if (item.type === 'section') {
      return true; // sections are cleaned up below
    }

    return true;
  });

  // Build final list with groups having filtered children
  const visibleNav = filteredNavGroups.map(item => {
    if (item.type === 'group') {
      return {
        ...item,
        items: item.items.filter(sub =>
          sub.module === null || isSuperAdmin || canRead(sub.module)
        ),
      };
    }
    return item;
  });

  return (
    <aside className={`${isCollapsed ? 'w-20' : 'w-72'} bg-white border-r border-slate-200/60 h-full flex flex-col shrink-0 overflow-visible transition-all duration-300 ease-in-out relative z-30`}>
      <div className={`shrink-0 h-20 flex items-center border-b border-slate-100/60 relative ${isCollapsed ? 'justify-center px-2' : 'px-6 justify-between'}`}>
        <div
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-3 cursor-pointer overflow-hidden"
        >
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-white font-black text-xl shadow-lg shadow-primary/30 italic shrink-0">
            K
          </div>
          {!isCollapsed && (
            <div className="overflow-hidden">
              <h1 className="text-xl font-extrabold text-[#0f172a] tracking-tight leading-none italic">
                Kemp's<span className="text-primary">.</span>
              </h1>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1 truncate">Inventory Management</p>
            </div>
          )}
        </div>

        {/* Toggle Icon */}
        <button
          onClick={onToggleCollapse}
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="hidden cursor-e-resize lg:flex absolute -right-3.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg bg-white border border-slate-200/90 text-slate-500 hover:text-slate-900 hover:bg-slate-50 hover:border-slate-300 hover:shadow-md items-center justify-center transition-all duration-200 active:scale-90 z-40 shadow-sm"
        >
          <svg className={`w-4 h-4 transition-transform duration-300 ${isCollapsed ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line x1="9" y1="3" x2="9" y2="21" />
          </svg>
        </button>

        {/* Mobile Close Button */}
        <button
          onClick={onClose}
          className="lg:hidden w-8 h-8 rounded-lg bg-slate-50 border border-slate-200 text-slate-500 hover:bg-slate-100 flex items-center justify-center font-bold text-xs active:scale-95 transition-all ml-auto cursor-pointer"
        >
          ✕
        </button>
      </div>

      <nav className={`flex-1 overflow-y-auto pb-12 space-y-1 scrollbar-hide ${isCollapsed ? 'px-2' : 'px-4'}`}>
        {visibleNav.map((item, idx) => (
          <SidebarItem key={idx} item={item} onClickItem={handleItemClick} isCollapsed={isCollapsed} />
        ))}
      </nav>

      <div className={`border-t border-slate-100 shrink-0 ${isCollapsed ? 'p-3' : 'p-6'}`}>
        {isCollapsed ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-9 h-9 bg-primary/10 rounded-full flex items-center justify-center text-primary font-bold text-xs ring-2 ring-white shrink-0" title={fullName}>
              {userInitials}
            </div>
          </div>
        ) : (
          <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-100">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-9 h-9 bg-primary/10 rounded-full flex items-center justify-center text-primary font-bold text-xs ring-2 ring-white shrink-0">
                {userInitials}
              </div>
              <div className="overflow-hidden flex-1">
                <p className="text-xs font-bold text-slate-800 truncate">{fullName}</p>
                <p className="text-[10px] text-slate-500 font-medium truncate">{roleName}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};

export default Sidebar;
