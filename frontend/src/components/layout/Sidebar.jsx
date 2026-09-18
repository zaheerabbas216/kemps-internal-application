import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';

const navGroups = [
  {
    type: 'button',
    name: 'Dashboard',
    path: '/dashboard',
    icon: '⊞'
  },
  {
    type: 'button',
    name: 'Stock Dashboard',
    path: '/stock-dashboard',
    icon: '📦'
  },
  {
    type: 'button',
    name: 'Production Dashboard',
    path: '/production-dashboard',
    icon: '🏭'
  },
  {
    type: 'button',
    name: 'Sunday Dashboard',
    path: '/sunday-dashboard',
    icon: '☀️'
  },
  {
    type: 'button',
    name: 'IMP Work',
    path: '/imp-work',
    icon: '🚨',
    highlight: 'red-box'
  },
  {
    type: 'section',
    title: 'Sales'
  },
  {
    type: 'button',
    name: 'Customer Data',
    path: '/customer',
    icon: '👤'
  },
  {
    type: 'button',
    name: 'Accounts Ledger',
    path: '/accounts-ledger',
    icon: '📒'
  },
  {
    type: 'button',
    name: 'Cash Ledger',
    path: '/cash-ledger',
    icon: '💰'
  },
  {
    type: 'group',
    title: 'Sales',
    id: 'grpSales',
    icon: '🧾',
    items: [
      { name: 'Billing', path: '/billing' },
      { name: 'Credit Balance', path: '/credit-balance' },
      { name: 'Function Orders', path: '/orders' },
      { name: 'Order Details', path: '/order-details' },
      { name: 'Total Sales', path: '/total-sales' },
      { name: 'Sales Return / Credit Note', path: '/sales-return' },
    ]
  },
  {
    type: 'section',
    title: 'Production'
  },
  {
    type: 'group',
    title: 'Inventory Stock',
    id: 'grpStock',
    icon: '📦',
    items: [
      { name: 'Inventory', path: '/inventory' },
      { name: 'Pet Bottle', path: '/pet-bottle' },
      { name: 'Stock Correction', path: '/stock-correction' },
      { name: 'Wastage', path: '/wastage' }
    ]
  },
  {
    type: 'group',
    title: 'Production',
    id: 'grpProd',
    icon: '🏭',
    items: [
      { name: 'Production Form', path: '/production-form' },
      { name: 'Goods Ledger', path: '/goods-ledger' },
      { name: 'Goods History', path: '/goods-history' },
    ]
  },
  {
    type: 'group',
    title: 'Machine Timer',
    id: 'grpTimer',
    icon: '⏱️',
    items: [
      { name: 'Timer Dashboard', path: '/timer' },
      { name: 'Timer History', path: '/timer-history' },
    ]
  },
  {
    type: 'button',
    name: 'Raw Material Ledger',
    path: '/raw-material-ledger',
    icon: '🪨'
  },
  {
    type: 'button',
    name: 'Weight Measurement',
    path: '/weight-measurement',
    icon: '⚖️'
  },
  {
    type: 'button',
    name: 'Tools Inventory',
    path: '/tools-inventory',
    icon: '🔧'
  },
  {
    type: 'section',
    title: 'Orders'
  },
  {
    type: 'button',
    name: 'Order Details',
    path: '/order-details',
    icon: '📋'
  },
  {
    type: 'group',
    title: 'Distribution',
    id: 'grpDO',
    icon: '🚚',
    items: [
      { name: 'Distribution Order', path: '/distribution-order' },
    ]
  },
  {
    type: 'section',
    title: 'Warehouse'
  },
  {
    type: 'group',
    title: 'Loading',
    id: 'grpWH',
    icon: '🏪',
    items: [
      { name: 'Loading', path: '/loading' },
      { name: 'Sunday Loading', path: '/sunday-loading' },
      { name: 'Sunday Loading History', path: '/sunday-loading-history' },
    ]
  },
  {
    type: 'group',
    title: 'Can Supply',
    id: 'grpCan',
    icon: '🥤',
    items: [
      { name: 'Can Supply', path: '/can-supply' },
      { name: 'Can Deposit', path: '/can-deposit' },
    ]
  },
  {
    type: 'section',
    title: 'Office'
  },
  {
    type: 'group',
    title: 'Office Work',
    id: 'grpOff',
    icon: '🗂️',
    items: [
      { name: 'Maintenance Form', path: '/maintenance-form' },
      { name: 'Maintenance Master', path: '/maintenance-master' },
      { name: 'Maintenance History', path: '/maintenance-history' },
    ]
  },
  {
    type: 'button',
    name: 'User Authentication',
    path: '/user-authentication',
    icon: '🔑'
  },
  {
    type: 'button',
    name: 'Expense',
    path: '/expense',
    icon: '💸'
  },
  {
    type: 'button',
    name: 'Bank Deposit',
    path: '/bank-deposit',
    icon: '🏦'
  },
  {
    type: 'button',
    name: 'Company Details',
    path: '/company-details',
    icon: '🏢'
  },
  {
    type: 'button',
    name: 'Supplier Payments',
    path: '/supplier-payments',
    icon: '💳'
  },
  {
    type: 'button',
    name: 'Supplier Ledger',
    path: '/supplier-ledger',
    icon: '📓'
  },
  {
    type: 'button',
    name: 'Product Master',
    path: '/product-master',
    icon: '📦'
  }
];

const SidebarItem = ({ item, onClickItem }) => {
  if (item.type === 'section') {
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
              isActive
                ? 'bg-red-600 text-white border-red-500 shadow-lg shadow-red-600/40 ring-2 ring-red-400'
                : 'bg-red-950/40 text-red-100 border-red-500 hover:bg-red-900/60 hover:text-white hover:border-red-400'
            }`
          }
        >
          <div className="flex items-center gap-3">
            <span className="text-lg w-6 flex items-center justify-center animate-pulse">{item.icon}</span>
            <span className="tracking-wide font-black text-white">{item.name}</span>
          </div>
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-red-600 text-white shadow-xs">
            URGENT
          </span>
        </NavLink>
      );
    }

    return (
      <NavLink
        to={item.path}
        onClick={onClickItem}
        className={({ isActive }) =>
          `flex items-center gap-3 px-4 py-2.5 rounded-xl text-[14px] font-bold transition-all duration-200 ${
            isActive
              ? 'bg-primary text-white shadow-md shadow-primary/30 font-black'
              : 'text-white hover:bg-slate-800/80 hover:text-white font-bold'
          }`
        }
      >
        <span className="text-lg opacity-90 w-6 flex items-center justify-center">{item.icon}</span>
        <span className="font-bold text-white tracking-wide">{item.name}</span>
      </NavLink>
    );
  }

  if (item.type === 'group') {
    const [isOpen, setIsOpen] = useState(false);
    
    return (
      <div className="space-y-1">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-[14px] font-bold transition-all duration-200 ${
            isOpen ? 'text-white bg-slate-800/90' : 'text-white hover:bg-slate-800/80'
          }`}
        >
          <div className="flex items-center gap-3">
            <span className="text-lg opacity-90 w-6 flex items-center justify-center">{item.icon}</span>
            <span className="font-bold text-white tracking-wide">{item.title}</span>
          </div>
          <span className={`text-[10px] font-black transition-transform duration-200 ${isOpen ? 'rotate-90 text-white' : 'text-slate-400'}`}>
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
                  `block px-4 py-2 rounded-lg text-[13px] font-bold transition-all duration-200 ${
                    isActive
                      ? 'text-white bg-primary font-black shadow-sm'
                      : 'text-slate-200 hover:text-white hover:bg-slate-800/70'
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

const Sidebar = ({ isOpen, onClose }) => {
  const navigate = useNavigate();

  const currentLoggedUser = localStorage.getItem('kemps_username') || '';
  const isAdmin = currentLoggedUser.toLowerCase() === 'admin' || localStorage.getItem('kemps_is_admin') === 'true';
  const fullName = localStorage.getItem('kemps_name') || (currentLoggedUser ? currentLoggedUser.charAt(0).toUpperCase() + currentLoggedUser.slice(1) : 'User');
  const userInitials = fullName
    .split(' ')
    .map(word => word.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'US';

  // Load and parse user permissions
  let userPermissions = null;
  try {
    const rawPerms = localStorage.getItem('kemps_permissions');
    if (rawPerms && rawPerms !== 'null') {
      userPermissions = JSON.parse(rawPerms);
    }
  } catch (_) {
    userPermissions = null;
  }

  const isPathAllowed = (path) => {
    if (path === '/user-authentication') {
      return isAdmin;
    }
    if (isAdmin || userPermissions === null) {
      return true;
    }
    if (Array.isArray(userPermissions)) {
      return userPermissions.includes(path);
    }
    return true;
  };

  const handleLogout = () => {
    localStorage.removeItem('kemps_logged_in');
    localStorage.removeItem('kemps_username');
    localStorage.removeItem('kemps_name');
    localStorage.removeItem('kemps_auth_token');
    localStorage.removeItem('kemps_is_admin');
    localStorage.removeItem('kemps_permissions');
    navigate('/login');
  };

  const handleItemClick = () => {
    if (onClose) {
      onClose();
    }
  };

  // Filter navigation items and groups based on permissions
  const filteredNavGroups = [];
  let currentSection = null;
  let sectionHasVisibleItems = false;

  navGroups.forEach(item => {
    if (item.type === 'section') {
      currentSection = item;
      sectionHasVisibleItems = false;
      return;
    }

    if (item.type === 'button') {
      if (isPathAllowed(item.path)) {
        if (currentSection && !sectionHasVisibleItems) {
          filteredNavGroups.push(currentSection);
          sectionHasVisibleItems = true;
        }
        filteredNavGroups.push(item);
      }
    } else if (item.type === 'group') {
      const allowedSubItems = item.items.filter(sub => isPathAllowed(sub.path));
      if (allowedSubItems.length > 0) {
        if (currentSection && !sectionHasVisibleItems) {
          filteredNavGroups.push(currentSection);
          sectionHasVisibleItems = true;
        }
        filteredNavGroups.push({
          ...item,
          items: allowedSubItems
        });
      }
    }
  });

  return (
    <aside className="w-72 bg-[#0b132b] text-white border-r border-slate-800/80 h-screen flex flex-col shrink-0 sticky top-0 overflow-hidden shadow-2xl">
      <div className="p-6 shrink-0 flex items-center justify-between border-b border-slate-800/60">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-white font-black text-xl shadow-lg shadow-primary/40 italic ring-2 ring-white/10">
            K
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-white tracking-tight leading-none italic">
              Kemp's<span className="text-primary">.</span>
            </h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Inventory Management</p>
          </div>
        </div>
        
        {/* Mobile Close Button */}
        <button 
          onClick={onClose}
          className="lg:hidden w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white flex items-center justify-center font-bold text-xs active:scale-95 transition-all ml-auto"
        >
          ✕
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-4 py-4 space-y-1 scrollbar-hide">
        {filteredNavGroups.map((item, idx) => (
          <SidebarItem key={idx} item={item} onClickItem={handleItemClick} />
        ))}
      </nav>
      
      <div className="p-4 border-t border-slate-800/80 shrink-0 bg-[#080e21]">
        <div className="bg-slate-800/80 p-3.5 rounded-2xl flex items-center justify-between border border-slate-700/60">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-9 h-9 bg-primary text-white rounded-full flex items-center justify-center font-black text-xs ring-2 ring-slate-700 shrink-0 shadow-sm">
              {userInitials}
            </div>
            <div className="overflow-hidden">
              <p className="text-xs font-black text-white truncate">{fullName}</p>
              <p className="text-[10px] text-slate-400 font-semibold">
                {isAdmin ? 'Administrator' : 'Operator'}
              </p>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            title="Log Out"
            className="w-8 h-8 rounded-xl bg-slate-700/80 border border-slate-600 text-slate-300 hover:text-white hover:bg-red-600 hover:border-red-500 transition-all duration-200 flex items-center justify-center text-sm shadow-sm active:scale-95 shrink-0 ml-1"
          >
            ➔
          </button>
        </div>
      </div>
    </aside>
  );
};


export default Sidebar;
