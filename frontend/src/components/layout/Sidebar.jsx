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
      { name: 'Order Management', path: '/orders' },
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
      { name: 'Stock Correction', path: '/stock-correction' }
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
        className={({ isActive }) =>
          `sidebar-item ${isActive ? 'sidebar-item-active' : 'sidebar-item-inactive'}`
        }
      >
        <span className="text-lg opacity-80 w-6 flex items-center justify-center">{item.icon}</span>
        {item.name}
      </NavLink>
    );
  }

  if (item.type === 'group') {
    const [isOpen, setIsOpen] = useState(false);
    
    return (
      <div className="space-y-1">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`sidebar-item w-full flex items-center justify-between ${isOpen ? 'text-slate-900 bg-slate-50/50' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}
        >
          <div className="flex items-center gap-3">
            <span className="text-lg opacity-80 w-6 flex items-center justify-center">{item.icon}</span>
            {item.title}
          </div>
          <span className={`text-[10px] transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}>
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

const Sidebar = ({ isOpen, onClose }) => {
  const navigate = useNavigate();

  const currentLoggedUser = localStorage.getItem('kemps_username') || '';
  const isAdmin = currentLoggedUser.toLowerCase() === 'admin';
  const fullName = localStorage.getItem('kemps_name') || (currentLoggedUser ? currentLoggedUser.charAt(0).toUpperCase() + currentLoggedUser.slice(1) : 'User');
  const userInitials = fullName
    .split(' ')
    .map(word => word.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'US';

  const handleLogout = () => {
    localStorage.removeItem('kemps_logged_in');
    localStorage.removeItem('kemps_username');
    localStorage.removeItem('kemps_name');
    localStorage.removeItem('kemps_auth_token');
    navigate('/login');
  };

  const handleItemClick = () => {
    if (onClose) {
      onClose();
    }
  };

  const filteredNavGroups = navGroups.filter(item => {
    if (item.type === 'button') {
      if (item.path === '/user-authentication') {
        return isAdmin;
      }
    }
    return true;
  });

  return (
    <aside className="w-72 bg-white border-r border-slate-200/60 h-screen flex flex-col shrink-0 sticky top-0 overflow-hidden">
      <div className="p-8 shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-white font-black text-xl shadow-lg shadow-primary/30 italic">
            K
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-[#0f172a] tracking-tight leading-none italic">
              Kemp's<span className="text-primary">.</span>
            </h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Inventory Management</p>
          </div>
        </div>
        
        {/* Mobile Close Button */}
        <button 
          onClick={onClose}
          className="lg:hidden w-8 h-8 rounded-lg bg-slate-50 border border-slate-200 text-slate-500 hover:bg-slate-100 flex items-center justify-center font-bold text-xs active:scale-95 transition-all ml-auto"
        >
          ✕
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-4 pb-12 space-y-1 scrollbar-hide">
        {filteredNavGroups.map((item, idx) => (
          <SidebarItem key={idx} item={item} onClickItem={handleItemClick} />
        ))}
      </nav>
      
      <div className="p-6 border-t border-slate-100 shrink-0">
        <div className="bg-slate-50/80 p-4 rounded-2xl flex items-center justify-between border border-slate-100">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-9 h-9 bg-primary/10 rounded-full flex items-center justify-center text-primary font-bold text-xs ring-2 ring-white shrink-0">
              {userInitials}
            </div>
            <div className="overflow-hidden">
              <p className="text-xs font-bold text-slate-800 truncate">{fullName}</p>
              <p className="text-[10px] text-slate-500 font-medium">
                {isAdmin ? 'Administrator' : 'Operator'}
              </p>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            title="Log Out"
            className="w-8 h-8 rounded-xl bg-white border border-slate-200 text-slate-450 hover:text-red-500 hover:bg-red-50 hover:border-red-100 transition-all duration-200 flex items-center justify-center text-sm shadow-sm active:scale-95 shrink-0 ml-1"
          >
            ➔
          </button>
        </div>
      </div>
    </aside>
  );
};


export default Sidebar;
