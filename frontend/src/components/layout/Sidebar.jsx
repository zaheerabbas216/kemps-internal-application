import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';

const navGroups = [
  {
    type: 'button',
    name: 'Dashboard',
    path: '/dashboard',
    icon: '⊞'
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
    type: 'group',
    title: 'Sales',
    id: 'grpSales',
    icon: '🧾',
    items: [
      { name: 'Billing', path: '/billing' },
      { name: 'Credit Balance', path: '/credit-balance' },
      { name: 'Total Sales', path: '/total-sales' },
      { name: 'Return Goods', path: '/return-goods' },
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
    ]
  },
  {
    type: 'group',
    title: 'Production',
    id: 'grpProd',
    icon: '🏭',
    items: [
      { name: 'Production Form', path: '/production-form' },
      { name: 'Present Stock', path: '/present-stock' },
      { name: 'Goods Ledger', path: '/goods-ledger' },
    ]
  },
  {
    type: 'button',
    name: 'Raw Material Stock',
    path: '/raw-material-stock',
    icon: '🪨'
  },
  {
    type: 'section',
    title: 'Orders'
  },
  {
    type: 'group',
    title: 'Function Order',
    id: 'grpFO',
    icon: '🎯',
    items: [
      { name: 'Function Order', path: '/function-order' },
      { name: 'FO Order View', path: '/fo-order-view' },
    ]
  },
  {
    type: 'group',
    title: 'Distribution',
    id: 'grpDO',
    icon: '🚚',
    items: [
      { name: 'Distribution Order', path: '/distribution-order' },
      { name: 'DO Order View', path: '/do-order-view' },
    ]
  },
  {
    type: 'group',
    title: 'Local Orders',
    id: 'grpLO',
    icon: '📍',
    items: [
      { name: 'Local Orders', path: '/local-order' },
      { name: 'LO Order View', path: '/lo-order-view' },
    ]
  },
  {
    type: 'section',
    title: 'Warehouse'
  },
  {
    type: 'group',
    title: 'Loading / Return',
    id: 'grpWH',
    icon: '🏪',
    items: [
      { name: 'Loading', path: '/loading' },
      { name: 'Return Stock', path: '/return-stock' },
      { name: 'Godown Transfer', path: '/godown-transfer' },
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
    type: 'button',
    name: 'Function Can Supply',
    path: '/function-can-supply',
    icon: '🚚'
  },
  {
    type: 'button',
    name: 'Function Return Stock',
    path: '/function-return-stock',
    icon: '↩'
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
      { name: 'Courier Parcel', path: '/courier-parcel' },
      { name: 'Warranty Details', path: '/warranty-details' },
      { name: 'Maintenance Form', path: '/maintenance-form' },
    ]
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
    name: 'Payment Approval',
    path: '/payment-approval',
    icon: '✅'
  },
  {
    type: 'button',
    name: 'Supplier Payments',
    path: '/supplier-payments',
    icon: '💳'
  },
  {
    type: 'button',
    name: 'Product Master',
    path: '/product-master',
    icon: '📦'
  },
  {
    type: 'button',
    name: 'Company Details',
    path: '/company-details',
    icon: '🏢'
  }
];

const SidebarItem = ({ item }) => {
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

const Sidebar = () => {
  return (
    <aside className="w-72 bg-white border-r border-slate-200/60 h-screen flex flex-col shrink-0 sticky top-0 overflow-hidden">
      <div className="p-8 shrink-0">
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
      </div>

      <nav className="flex-1 overflow-y-auto px-4 pb-12 space-y-1 scrollbar-hide">
        {navGroups.map((item, idx) => (
          <SidebarItem key={idx} item={item} />
        ))}
      </nav>
      
      <div className="p-6 border-t border-slate-100 shrink-0">
        <div className="bg-slate-50/80 p-4 rounded-2xl flex items-center gap-3 border border-slate-100">
          <div className="w-9 h-9 bg-primary/10 rounded-full flex items-center justify-center text-primary font-bold text-xs ring-2 ring-white">
            ZA
          </div>
          <div className="overflow-hidden">
            <p className="text-xs font-bold text-slate-800 truncate">Zaheer Abbas</p>
            <p className="text-[10px] text-slate-500 font-medium">Administrator</p>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
