import React, { useState, useEffect, useRef } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

// ─────────────────────────────────────────────
// Full nav definition with module keys for RBAC
// ─────────────────────────────────────────────
const navGroups = [
  { type: 'button', name: 'Dashboard',            path: '/dashboard',            icon: '⊞',  module: 'dashboard' },
  { type: 'button', name: 'Stock Dashboard',      path: '/stock-dashboard',      icon: '📦', module: 'stock-dashboard' },
  { type: 'button', name: 'Production Dashboard', path: '/production-dashboard', icon: '🏭', module: 'production-dashboard' },
  { type: 'button', name: 'Sunday Dashboard',     path: '/sunday-dashboard',     icon: '☀️', module: 'sunday-dashboard' },
  { type: 'button', name: 'IMP Work',             path: '/imp-work',             icon: '🚨', module: 'imp-work', highlight: 'red-box' },

  { type: 'section', title: 'Sales' },
  { type: 'button', name: 'Customer Data',    path: '/customer',        icon: '👤', module: 'customer' },
  { type: 'button', name: 'Accounts Ledger', path: '/accounts-ledger', icon: '📒', module: 'accounts-ledger' },
  { type: 'button', name: 'Cash Ledger',     path: '/cash-ledger',     icon: '💰', module: 'cash-ledger' },
  {
    type: 'group', title: 'Sales', id: 'grpSales', icon: '🧾',
    items: [
      { name: 'Billing',                    path: '/billing',          module: 'billing' },
      { name: 'Credit Balance',             path: '/credit-balance',   module: 'credit-balance' },
      { name: 'Function Order',             path: '/orders',           module: 'orders' },
      { name: 'Order Details',              path: '/order-details',    module: 'order-details' },
      { name: 'Total Sales',                path: '/total-sales',      module: 'total-sales' },
      { name: 'Sales Return / Credit Note', path: '/sales-return',     module: 'sales-return' },
    ]
  },

  { type: 'section', title: 'Production' },
  {
    type: 'group', title: 'Inventory Stock', id: 'grpStock', icon: '📦',
    items: [
      { name: 'Inventory',        path: '/inventory',        module: 'inventory' },
      { name: 'Pet Bottle',       path: '/pet-bottle',       module: 'pet-bottle' },
      { name: 'Stock Correction', path: '/stock-correction', module: 'stock-correction' },
      { name: 'Wastage',          path: '/wastage',          module: 'wastage' },
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
      { name: 'Loading',                path: '/loading',                module: 'loading' },
      { name: 'Sunday Loading',         path: '/sunday-loading',         module: 'sunday-loading' },
      { name: 'Sunday Loading History', path: '/sunday-loading-history', module: 'sunday-loading-history' },
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
  { type: 'button', name: 'Weight Measurement', path: '/weight-measurement', icon: '⚖️', module: 'weight-measurement' },
  { type: 'button', name: 'Tools Inventory',    path: '/tools-inventory',    icon: '🔧', module: 'tools-inventory' },
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
      { name: 'User Management',     path: '/user-authentication', module: null },
      { name: 'Roles & Permissions', path: '/admin/roles',        module: null },
    ]
  },
];

// ─────────────────────────────────────────────
// SidebarItem component
// ─────────────────────────────────────────────
const SidebarItem = ({ item, onClickItem, isCollapsed }) => {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [flyoutTop, setFlyoutTop] = useState(0);
  const buttonRef = useRef(null);
  const wrapperRef = useRef(null);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setIsOpen(false);
        setIsHovered(false);
      }
    };
    if (item.type === 'group' && (isOpen || isHovered)) {
      document.addEventListener('mousedown', handleOutsideClick);
      document.addEventListener('touchstart', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [item.type, isOpen, isHovered]);

  if (item.type === 'section') {
    if (isCollapsed) {
      return <div className="my-3 border-t border-slate-200/80 mx-2" title={item.title} />;
    }
    return (
      <h3 className="px-4 text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mt-7 mb-2.5">
        {item.title}
      </h3>
    );
  }

  if (item.type === 'button') {
    if (item.highlight === 'red-box') {
      return (
        <NavLink
          to={item.path}
          onClick={onClickItem}
          className={({ isActive }) =>
            `flex items-center justify-between px-3.5 py-2.5 rounded-xl text-[14px] font-extrabold transition-all duration-200 border-2 my-1.5 shadow-sm ${
              isCollapsed ? 'justify-center px-0 h-11 w-11 mx-auto' : ''
            } ${
              isActive
                ? 'bg-red-600 text-white border-red-500 shadow-lg shadow-red-600/40 ring-2 ring-red-400'
                : 'bg-red-950/40 text-red-100 border-red-500 hover:bg-red-900/60 hover:text-white hover:border-red-400'
            }`
          }
        >
          <div className="flex items-center gap-3">
            <span className="text-lg w-6 flex items-center justify-center animate-pulse">{item.icon}</span>
            {!isCollapsed && <span className="tracking-wide font-black text-white">{item.name}</span>}
          </div>
          {!isCollapsed && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-red-600 text-white shadow-xs">
              URGENT
            </span>
          )}
        </NavLink>
      );
    }

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
    const isChildActive = item.items.some(sub => sub.path === location.pathname);

    const handleMouseEnter = () => {
      if (buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        setFlyoutTop(rect.top);
      }
      setIsHovered(true);
    };

    const handleMouseLeave = () => {
      setIsHovered(false);
      setIsOpen(false);
    };

    if (isCollapsed) {
      return (
        <div
          ref={wrapperRef}
          className="relative group/flyout"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <button
            ref={buttonRef}
            onClick={(e) => {
              e.stopPropagation();
              if (buttonRef.current) {
                const rect = buttonRef.current.getBoundingClientRect();
                setFlyoutTop(rect.top);
              }
              setIsOpen(prev => !prev);
            }}
            title={item.title}
            className={`sidebar-item justify-center px-0 h-11 w-11 mx-auto ${
              isChildActive || isOpen || isHovered ? 'sidebar-item-active' : 'sidebar-item-inactive'
            }`}
          >
            <span className="text-lg opacity-80 w-6 flex items-center justify-center shrink-0">{item.icon}</span>
          </button>

          {(isHovered || isOpen) && (
            <div
              style={{ top: `${Math.max(10, Math.min(window.innerHeight - 300, flyoutTop))}px` }}
              className="fixed left-[76px] z-[9999] bg-[#0b132b] border border-slate-700/90 rounded-2xl shadow-2xl p-2.5 min-w-[210px] animate-fade-in"
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={handleMouseLeave}
            >
              <div className="px-3 py-1.5 text-xs font-black text-white uppercase tracking-wider border-b border-slate-800 mb-1 flex items-center gap-2">
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
                        isActive ? 'text-white bg-primary font-bold shadow-sm' : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
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
          className={`sidebar-item w-full flex items-center justify-between ${isOpen || isChildActive ? 'text-white bg-slate-800/90 font-bold' : 'text-white/80 hover:bg-slate-800/80 hover:text-white'}`}
        >
          <div className="flex items-center gap-3 overflow-hidden">
            <span className="text-lg opacity-80 w-6 flex items-center justify-center shrink-0">{item.icon}</span>
            <span className="truncate">{item.title}</span>
          </div>
          <span className={`text-[10px] transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-90 text-white' : 'text-slate-400'}`}>
            ▶
          </span>
        </button>
        {isOpen && (
          <div className="pl-9 space-y-1 mt-1 border-l-2 border-slate-700/80 ml-7">
            {item.items.map((sub, idx) => (
              <NavLink
                key={idx}
                to={sub.path}
                onClick={onClickItem}
                className={({ isActive }) =>
                  `block px-4 py-2 rounded-lg text-[13px] font-medium transition-all duration-200 ${
                    isActive
                      ? 'text-white bg-primary font-black shadow-sm'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
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
const Sidebar = ({ onClose, isCollapsed, onToggleCollapse }) => {
  const navigate = useNavigate();
  const { user, isSuperAdmin, canRead, getFirstPermittedPath } = useAuth();

  const fullName = user?.name || user?.username || 'User';
  const roleName = isSuperAdmin ? 'Superadmin' : (user?.role_name || 'User');
  const userInitials = fullName
    .split(' ')
    .map(word => word.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'US';

  const handleItemClick = () => {
    if (onClose) onClose();
  };

  // Filter items based on permissions
  const rawFiltered = navGroups.filter(item => {
    if (item.adminOnly) return isSuperAdmin;
    if (item.type === 'button') {
      return isSuperAdmin || (item.module ? canRead(item.module) : true);
    }
    if (item.type === 'group') {
      const visibleChildren = item.items.filter(sub =>
        sub.module === null || isSuperAdmin || (sub.module ? canRead(sub.module) : true)
      );
      return visibleChildren.length > 0;
    }
    return true; // section markers
  });

  // Attach filtered sub-items to groups and strip out empty section headers
  const visibleNav = [];
  let currentSection = null;
  let sectionHasContent = false;

  for (const item of rawFiltered) {
    if (item.type === 'section') {
      currentSection = item;
      sectionHasContent = false;
      continue;
    }

    if (item.type === 'group') {
      const filteredChildren = item.items.filter(sub =>
        sub.module === null || isSuperAdmin || canRead(sub.module)
      );
      if (filteredChildren.length > 0) {
        if (currentSection && !sectionHasContent) {
          visibleNav.push(currentSection);
          sectionHasContent = true;
        }
        visibleNav.push({ ...item, items: filteredChildren });
      }
    } else if (item.type === 'button') {
      if (currentSection && !sectionHasContent) {
        visibleNav.push(currentSection);
        sectionHasContent = true;
      }
      visibleNav.push(item);
    }
  }

  return (
    <aside className={`${isCollapsed ? 'w-20' : 'w-72'} bg-[#0b132b] text-white border-r border-slate-800/80 h-full flex flex-col shrink-0 overflow-visible transition-all duration-300 ease-in-out relative z-30`}>
      <div className={`shrink-0 h-20 flex items-center border-b border-slate-800/60 relative ${isCollapsed ? 'justify-center px-2' : 'px-6 justify-between'}`}>
        <div
          onClick={() => navigate(getFirstPermittedPath ? getFirstPermittedPath() : '/dashboard')}
          className="flex items-center gap-3 cursor-pointer overflow-hidden"
        >
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-white font-black text-xl shadow-lg shadow-primary/40 italic shrink-0">
            K
          </div>
          {!isCollapsed && (
            <div className="overflow-hidden">
              <h1 className="text-xl font-extrabold text-white tracking-tight leading-none italic">
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
          className="hidden cursor-e-resize lg:flex absolute -right-3.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700 hover:border-slate-600 hover:shadow-md items-center justify-center transition-all duration-200 active:scale-90 z-40 shadow-sm"
        >
          <svg className={`w-4 h-4 transition-transform duration-300 ${isCollapsed ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line x1="9" y1="3" x2="9" y2="21" />
          </svg>
        </button>

        {/* Mobile Close Button */}
        <button
          onClick={onClose}
          className="lg:hidden w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white flex items-center justify-center font-bold text-xs active:scale-95 transition-all ml-auto cursor-pointer"
        >
          ✕
        </button>
      </div>

      <nav className={`flex-1 overflow-y-auto pb-12 space-y-1 scrollbar-hide ${isCollapsed ? 'px-2' : 'px-4'}`}>
        {visibleNav.map((item, idx) => (
          <SidebarItem key={idx} item={item} onClickItem={handleItemClick} isCollapsed={isCollapsed} />
        ))}
      </nav>

      <div className={`border-t border-slate-800/80 shrink-0 bg-[#080e21] ${isCollapsed ? 'p-3' : 'p-4'}`}>
        {isCollapsed ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-9 h-9 bg-primary text-white rounded-full flex items-center justify-center font-bold text-xs ring-2 ring-slate-700 shrink-0" title={fullName}>
              {userInitials}
            </div>
          </div>
        ) : (
          <div className="bg-slate-800/80 p-3.5 rounded-2xl border border-slate-700/60">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-9 h-9 bg-primary text-white rounded-full flex items-center justify-center font-bold text-xs ring-2 ring-slate-700 shrink-0">
                {userInitials}
              </div>
              <div className="overflow-hidden flex-1">
                <p className="text-xs font-bold text-white truncate">{fullName}</p>
                <p className="text-[10px] text-slate-400 font-medium truncate">{roleName}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};

export default Sidebar;
