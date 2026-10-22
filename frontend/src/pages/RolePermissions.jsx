import React, { useState, useEffect } from 'react';
import api from '../api/axios';

// ─────────────────────────────────────────────
// Complete Module Registry (matches plan + backend)
// ─────────────────────────────────────────────
const MODULE_GROUPS = [
  {
    section: 'Dashboards & Tasks',
    modules: [
      { key: 'dashboard',            label: 'Dashboard',             actions: ['read'] },
      { key: 'stock-dashboard',      label: 'Stock Dashboard',        actions: ['read'] },
      { key: 'production-dashboard', label: 'Production Dashboard',   actions: ['read'] },
      { key: 'sunday-dashboard',     label: 'Sunday Dashboard',       actions: ['read'] },
      { key: 'imp-work',             label: 'IMP Work (Urgent Tasks)',actions: ['read', 'create', 'update', 'delete'] },
    ],
  },
  {
    section: 'Sales',
    modules: [
      { key: 'customer',                  label: 'Customer Data',                     actions: ['read', 'create', 'update', 'delete'] },
      { key: 'accounts-ledger',           label: 'Accounts Ledger (All)',             actions: ['read', 'create', 'update', 'delete'] },
      { key: 'accounts-ledger-tab',       label: '  ↳ Accounts Ledger Tab',          actions: ['read', 'create', 'update', 'delete'] },
      { key: 'accounts-ledger-analytics', label: '  ↳ Accounts Ledger Analytics Tab',    actions: ['read'] },
      { key: 'cash-ledger',               label: 'Cash Ledger',                       actions: ['read'] },
      { key: 'billing',                   label: 'Billing (All)',                     actions: ['read', 'create', 'update', 'delete'] },
      { key: 'billing-form',              label: '  ↳ Billing Form Page',            actions: ['read', 'create', 'update'] },
      { key: 'billing-history',           label: '  ↳ Billing History Page',         actions: ['read'] },
      { key: 'credit-balance',            label: 'Credit Balance (All)',              actions: ['read', 'create', 'update', 'delete'] },
      { key: 'credit-history',            label: '  ↳ Credit History Page',          actions: ['read'] },
      { key: 'orders',                    label: 'Function Order (All)',            actions: ['read', 'create', 'update', 'delete'] },
      { key: 'orders-upcoming',           label: '  ↳ Upcoming Orders Tab',          actions: ['read'] },
      { key: 'orders-new',                label: '  ↳ New Order Tab',                actions: ['read', 'create'] },
      { key: 'orders-history',            label: '  ↳ Order History Tab',            actions: ['read'] },
      { key: 'order-details',             label: 'Order Details',                     actions: ['read', 'update'] },
      { key: 'total-sales',               label: 'Total Sales (All)',                 actions: ['read'] },
      { key: 'total-sales-overview',      label: '  ↳ Overview Tab',                 actions: ['read'] },
      { key: 'total-sales-monthly',       label: '  ↳ Monthly Trend Tab',            actions: ['read'] },
      { key: 'total-sales-products',      label: '  ↳ Product-wise Tab',             actions: ['read'] },
      { key: 'total-sales-customers',     label: '  ↳ Customer-wise Tab',            actions: ['read'] },
      { key: 'total-sales-collection',    label: '  ↳ Collection Tab',               actions: ['read'] },
      { key: 'total-sales-companies',     label: '  ↳ Company-wise Tab',             actions: ['read'] },
      { key: 'total-sales-top',           label: '  ↳ Top Customers Tab',            actions: ['read'] },
      { key: 'sales-return',              label: 'Sales Return (All)',                actions: ['read', 'create', 'update', 'delete'] },
      { key: 'sales-return-new',          label: '  ↳ New Return Tab',               actions: ['read', 'create'] },
      { key: 'sales-return-history',      label: '  ↳ Return History Tab',           actions: ['read'] },
      { key: 'sales-return-reports',      label: '  ↳ Return Reports Tab',           actions: ['read'] },
    ],
  },
  {
    section: 'Production',
    modules: [
      { key: 'inventory',                 label: 'Inventory Stock (All)',              actions: ['read', 'create', 'update', 'delete'] },
      { key: 'inventory-history',         label: '  ↳ Inventory History Page',         actions: ['read'] },
      { key: 'pet-bottle',                label: 'Pet Bottle (All)',                   actions: ['read', 'create', 'update', 'delete'] },
      { key: 'pet-bottle-history',        label: '  ↳ Pet Bottle History Page',        actions: ['read'] },
      { key: 'stock-correction',          label: 'Stock Correction (All)',             actions: ['read', 'create', 'update', 'delete'] },
      { key: 'stock-correction-history',  label: '  ↳ Stock Correction History Page',  actions: ['read'] },
      { key: 'wastage',                   label: 'Wastage Loss Tracker',               actions: ['read', 'create', 'update', 'delete'] },
      { key: 'production',                label: 'Production Form (All)',              actions: ['read', 'create', 'update', 'delete'] },
      { key: 'production-form',           label: '  ↳ Production Form Page',         actions: ['read', 'create'] },
      { key: 'production-history',        label: '  ↳ Production History Page',      actions: ['read'] },
      { key: 'goods-ledger',              label: 'Goods Ledger',                       actions: ['read'] },
      { key: 'goods-history',             label: 'Goods History',                      actions: ['read'] },
      { key: 'timer',                     label: 'Machine Timer (All)',                actions: ['read', 'create', 'update', 'delete'] },
      { key: 'timer-dashboard',           label: '  ↳ Machine Timer Dashboard',        actions: ['read', 'create', 'update'] },
      { key: 'timer-history',             label: '  ↳ Machine Timer History Page',     actions: ['read'] },
      { key: 'raw-material-ledger',       label: 'Raw Material Ledger (All)',          actions: ['read', 'create', 'update', 'delete'] },
      { key: 'raw-material-history',      label: '  ↳ Raw Material History Page',      actions: ['read'] },
    ],
  },
  {
    section: 'Orders & Distribution',
    modules: [
      { key: 'distribution-order',          label: 'Distribution Order (All)', actions: ['read', 'create', 'update', 'delete'] },
      { key: 'distribution-order-active',   label: '  ↳ Active Orders Tab',   actions: ['read'] },
      { key: 'distribution-order-new',      label: '  ↳ New Order Tab',      actions: ['read', 'create'] },
      { key: 'distribution-order-history',  label: '  ↳ History Tab',        actions: ['read'] },
    ],
  },
  {
    section: 'Warehouse',
    modules: [
      { key: 'loading',                label: 'Loading (All)',             actions: ['read', 'create', 'update', 'delete'] },
      { key: 'loading-active',         label: '  ↳ Active Today Tab',     actions: ['read'] },
      { key: 'loading-history',        label: '  ↳ History Tab',          actions: ['read'] },
      { key: 'sunday-loading',         label: 'Sunday Loading (All)',    actions: ['read', 'create', 'update', 'delete'] },
      { key: 'sunday-loading-history', label: '  ↳ Sunday Loading History',actions: ['read'] },
      { key: 'can-supply',             label: 'Can Supply (All)',        actions: ['read', 'create', 'update', 'delete'] },
      { key: 'can-supply-balances',    label: '  ↳ Active Balances Tab', actions: ['read'] },
      { key: 'can-supply-workspace',   label: '  ↳ Supply Workspace Tab',actions: ['read', 'create', 'update'] },
      { key: 'can-supply-billing',     label: '  ↳ Billing Workspace Tab',actions: ['read', 'create'] },
      { key: 'can-supply-payments',    label: '  ↳ Outstanding Payments Tab', actions: ['read'] },
      { key: 'can-supply-reports',     label: '  ↳ Reports Tab',          actions: ['read'] },
      { key: 'can-deposit',            label: 'Can Deposit Ledger',      actions: ['read', 'create', 'update', 'delete'] },
    ],
  },
  {
    section: 'Office',
    modules: [
      { key: 'weight-measurement',     label: 'Weight Measurement',           actions: ['read', 'create', 'update', 'delete'] },
      { key: 'tools-inventory',        label: 'Tools Inventory',              actions: ['read', 'create', 'update', 'delete'] },
      { key: 'maintenance',            label: 'Maintenance (All)',            actions: ['read', 'create', 'update', 'delete'] },
      { key: 'maintenance-form',       label: '  ↳ Maintenance Form Page',    actions: ['read', 'create', 'update', 'delete'] },
      { key: 'maintenance-history',    label: '  ↳ Maintenance History Page', actions: ['read'] },
      { key: 'maintenance-master',     label: 'Maintenance Master (All)',     actions: ['read', 'create', 'update', 'delete'] },
      { key: 'maintenance-particulars',label: '  ↳ Maintenance Particulars Tab', actions: ['read', 'create', 'update', 'delete'] },
      { key: 'maintenance-sub-products',label: '  ↳ Sub Products Tab',        actions: ['read', 'create', 'update', 'delete'] },
      { key: 'expense',                label: 'Expense (All)',                actions: ['read', 'create', 'update', 'delete'] },
      { key: 'expense-history',        label: '  ↳ Expense History Page',     actions: ['read'] },
      { key: 'bank-deposit',           label: 'Bank Deposit (All)',           actions: ['read', 'create', 'update', 'delete'] },
      { key: 'bank-deposit-history',   label: '  ↳ Bank Deposit History Page',actions: ['read'] },
      { key: 'company-details',        label: 'Company Details',              actions: ['read', 'update'] },
      { key: 'supplier-payments',      label: 'Supplier Payments (All)',      actions: ['read', 'create', 'update', 'delete'] },
      { key: 'supplier-payments-pending',label: '  ↳ Pending Payments Tab',   actions: ['read', 'create', 'update'] },
      { key: 'supplier-payments-history',label: '  ↳ Payment History Tab',    actions: ['read'] },
      { key: 'supplier-ledger',        label: 'Supplier Ledger (All)',        actions: ['read'] },
      { key: 'supplier-ledger-tab',    label: '  ↳ Supplier Ledger Tab',    actions: ['read'] },
      { key: 'supplier-ledger-analytics',label: '  ↳ Supplier Analytics Tab',  actions: ['read'] },
      { key: 'product-master',         label: 'Product Master (All)',         actions: ['read', 'create', 'update', 'delete'] },
      { key: 'product-master-finished',label: '  ↳ Finished Products Tab',    actions: ['read', 'create', 'update', 'delete'] },
      { key: 'product-master-raw',     label: '  ↳ Raw Materials Tab',        actions: ['read', 'create', 'update', 'delete'] },
    ],
  },
];

const ALL_ACTIONS = ['read', 'create', 'update', 'delete'];
const ACTION_LABELS = { read: 'Read', create: 'Create', update: 'Update', delete: 'Delete' };
const ACTION_COLORS = {
  read:   'text-blue-600   bg-blue-50   border-blue-200',
  create: 'text-green-600  bg-green-50  border-green-200',
  update: 'text-amber-600  bg-amber-50  border-amber-200',
  delete: 'text-red-600    bg-red-50    border-red-200',
};

// Empty permissions for a new role — all false
function emptyPermissions() {
  const perms = {};
  MODULE_GROUPS.forEach(g => g.modules.forEach(m => {
    perms[m.key] = { read: false, create: false, update: false, delete: false };
  }));
  return perms;
}

function mergeApiPermissions(apiPerms) {
  const perms = emptyPermissions();
  Object.keys(apiPerms).forEach(mod => {
    if (perms[mod]) {
      perms[mod] = {
        read:   !!apiPerms[mod].read,
        create: !!apiPerms[mod].create,
        update: !!apiPerms[mod].update,
        delete: !!apiPerms[mod].delete,
      };
    }
  });
  return perms;
}

function permissionsToPayload(perms) {
  return Object.entries(perms)
    .filter(([, v]) => v.read || v.create || v.update || v.delete)
    .map(([module, v]) => ({
      module,
      can_read:   v.read   ? 1 : 0,
      can_create: v.create ? 1 : 0,
      can_update: v.update ? 1 : 0,
      can_delete: v.delete ? 1 : 0,
    }));
}

// ─────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────
const RolePermissions = () => {
  const [roles,          setRoles]         = useState([]);
  const [selectedRole,   setSelectedRole]  = useState(null);
  const [permissions,    setPermissions]   = useState(emptyPermissions());
  const [loadingRoles,   setLoadingRoles]  = useState(true);
  const [loadingPerms,   setLoadingPerms]  = useState(false);
  const [savingPerms,    setSavingPerms]   = useState(false);
  const [saveMsg,        setSaveMsg]       = useState('');

  // Role form modal
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [editingRole,     setEditingRole]     = useState(null);
  const [roleForm,        setRoleForm]        = useState({ name: '', description: '' });
  const [roleFormErr,     setRoleFormErr]     = useState('');
  const [roleFormOk,      setRoleFormOk]      = useState('');
  const [savingRole,      setSavingRole]      = useState(false);

  // Delete role confirm
  const [deletingRole,    setDeletingRole]    = useState(null);
  const [isDeleteOpen,    setIsDeleteOpen]    = useState(false);

  useEffect(() => { fetchRoles(); }, []);

  const fetchRoles = async () => {
    try {
      setLoadingRoles(true);
      const res = await api.get('/auth/roles');
      if (res.data.ok) setRoles(res.data.roles || []);
    } catch (e) { console.error(e); }
    finally { setLoadingRoles(false); }
  };

  const selectRole = async (role) => {
    setSelectedRole(role);
    setSaveMsg('');
    setLoadingPerms(true);
    try {
      const res = await api.get(`/auth/roles/${role.id}/permissions`);
      if (res.data.ok) {
        setPermissions(mergeApiPermissions(res.data.permissions));
      }
    } catch (e) { console.error(e); }
    finally { setLoadingPerms(false); }
  };

  const togglePerm = (moduleKey, action, moduleDef) => {
    setPermissions(prev => {
      const cur = { ...prev[moduleKey] };
      cur[action] = !cur[action];

      // If read is unchecked, uncheck all others
      if (action === 'read' && !cur.read) {
        cur.create = false;
        cur.update = false;
        cur.delete = false;
      }
      // If any non-read action is checked, auto-enable read
      if (action !== 'read' && cur[action]) {
        cur.read = true;
      }

      return { ...prev, [moduleKey]: cur };
    });
  };

  const setAllForModule = (moduleKey, value) => {
    const moduleDef = MODULE_GROUPS.flatMap(g => g.modules).find(m => m.key === moduleKey);
    setPermissions(prev => {
      const updated = {};
      moduleDef.actions.forEach(a => { updated[a] = value; });
      // If turning off, clear all
      if (!value) updated.read = false;
      return { ...prev, [moduleKey]: { ...prev[moduleKey], ...updated } };
    });
  };

  const setAllForAction = (action, value) => {
    setPermissions(prev => {
      const updated = { ...prev };
      MODULE_GROUPS.forEach(g => g.modules.forEach(m => {
        if (m.actions.includes(action)) {
          updated[m.key] = { ...updated[m.key], [action]: value };
          // If enabling a non-read action, auto-enable read
          if (action !== 'read' && value) {
            updated[m.key].read = true;
          }
          // If disabling read, clear all
          if (action === 'read' && !value) {
            updated[m.key] = { read: false, create: false, update: false, delete: false };
          }
        }
      }));
      return updated;
    });
  };

  const savePermissions = async () => {
    if (!selectedRole) return;
    setSavingPerms(true);
    setSaveMsg('');
    try {
      const res = await api.put(`/auth/roles/${selectedRole.id}`, {
        name:        selectedRole.name,
        description: selectedRole.description,
        permissions: permissionsToPayload(permissions),
      });
      if (res.data.ok) {
        setSaveMsg('✅ Permissions saved successfully!');
        fetchRoles();
        setTimeout(() => setSaveMsg(''), 3000);
      } else {
        setSaveMsg(`⚠️ ${res.data.error}`);
      }
    } catch (e) {
      setSaveMsg(`⚠️ ${e.message}`);
    } finally {
      setSavingPerms(false);
    }
  };

  const openRoleModal = (role = null) => {
    setEditingRole(role);
    setRoleForm({ name: role?.name || '', description: role?.description || '' });
    setRoleFormErr('');
    setRoleFormOk('');
    setIsRoleModalOpen(true);
  };

  const handleSaveRole = async (e) => {
    e.preventDefault();
    setRoleFormErr('');
    setRoleFormOk('');
    if (!roleForm.name.trim()) { setRoleFormErr('Role name is required.'); return; }
    setSavingRole(true);
    try {
      let res;
      if (editingRole) {
        res = await api.put(`/auth/roles/${editingRole.id}`, { name: roleForm.name.trim(), description: roleForm.description });
      } else {
        res = await api.post('/auth/roles', { name: roleForm.name.trim(), description: roleForm.description });
      }
      if (res.data.ok) {
        setRoleFormOk(editingRole ? 'Role updated!' : 'Role created!');
        fetchRoles();
        setTimeout(() => setIsRoleModalOpen(false), 900);
      } else {
        setRoleFormErr(res.data.error || 'Failed.');
      }
    } catch (e) {
      setRoleFormErr(e.response?.data?.error || e.message);
    } finally {
      setSavingRole(false);
    }
  };

  const confirmDeleteRole = (role) => {
    setDeletingRole(role);
    setIsDeleteOpen(true);
  };

  const handleDeleteRole = async () => {
    if (!deletingRole) return;
    try {
      const res = await api.delete(`/auth/roles/${deletingRole.id}`);
      if (res.data.ok) {
        setIsDeleteOpen(false);
        if (selectedRole?.id === deletingRole.id) { setSelectedRole(null); setPermissions(emptyPermissions()); }
        fetchRoles();
      } else {
        alert(res.data.error || 'Failed to delete role.');
        setIsDeleteOpen(false);
      }
    } catch (e) {
      alert(e.response?.data?.error || e.message);
      setIsDeleteOpen(false);
    }
  };

  const isColumnChecked = (action) =>
    MODULE_GROUPS.flatMap(g => g.modules)
      .filter(m => m.actions.includes(action))
      .every(m => permissions[m.key]?.[action]);

  const isRowChecked = (moduleKey) => {
    const m = MODULE_GROUPS.flatMap(g => g.modules).find(mod => mod.key === moduleKey);
    return m.actions.every(a => permissions[moduleKey]?.[a]);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">ROLES & PERMISSIONS</h1>
          <p className="text-slate-500 text-sm font-medium mt-1">Define roles and configure granular CRUD access per module.</p>
        </div>
        <button onClick={() => openRoleModal()} className="btn-premium btn-primary-premium h-12">
          <span className="text-xl">+</span> Create New Role
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">

        {/* ── LEFT: Role List ── */}
        <div className="card-premium flex flex-col">
          <div className="border-b border-slate-100 px-5 py-3 flex items-center justify-between">
            <h2 className="text-[11px] font-black text-slate-500 uppercase tracking-widest">All Roles</h2>
            <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{roles.length} roles</span>
          </div>

          <div className="flex-1 overflow-y-auto max-h-[65vh] divide-y divide-slate-50">
            {loadingRoles ? (
              <div className="py-10 flex justify-center"><span className="loading loading-spinner text-primary"></span></div>
            ) : roles.length === 0 ? (
              <div className="py-10 text-center text-slate-400 text-sm italic">No roles yet. Create one to get started.</div>
            ) : (
              roles.map(role => {
                const isSelected = selectedRole?.id === role.id;
                return (
                  <div
                    key={role.id}
                    className={`p-4 cursor-pointer transition-all group hover:bg-blue-50/60 ${isSelected ? 'bg-primary/5 border-l-4 border-primary' : 'border-l-4 border-transparent'}`}
                    onClick={() => selectRole(role)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="overflow-hidden">
                        <p className={`text-sm font-bold truncate ${isSelected ? 'text-primary' : 'text-slate-700'}`}>{role.name}</p>
                        {role.description && <p className="text-[11px] text-slate-400 font-medium mt-0.5 truncate">{role.description}</p>}
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{role.user_count} users</span>
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => { e.stopPropagation(); openRoleModal(role); }}
                          title="Edit Role"
                          className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-blue-100 hover:text-primary flex items-center justify-center text-slate-500 text-xs transition-all"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); confirmDeleteRole(role); }}
                          title="Delete Role"
                          className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-red-100 hover:text-red-500 flex items-center justify-center text-slate-500 text-xs transition-all"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ── RIGHT: Permission Matrix ── */}
        <div className="card-premium">
          {!selectedRole ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-3">
              <span className="text-5xl opacity-40">🔐</span>
              <p className="text-sm font-medium">Select a role on the left to configure its permissions</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-lg font-black text-slate-800">{selectedRole.name}</h2>
                  {selectedRole.description && <p className="text-sm text-slate-400 font-medium mt-0.5">{selectedRole.description}</p>}
                </div>
                <div className="flex items-center gap-3">
                  {saveMsg && (
                    <span className={`text-xs font-semibold px-3 py-1.5 rounded-xl animate-fade-in ${saveMsg.startsWith('✅') ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>
                      {saveMsg}
                    </span>
                  )}
                  {loadingPerms ? (
                    <span className="loading loading-spinner text-primary"></span>
                  ) : (
                    <button
                      onClick={savePermissions}
                      disabled={savingPerms}
                      className="btn-premium btn-primary-premium h-10 px-6 text-sm uppercase tracking-wider"
                    >
                      {savingPerms ? <span className="loading loading-spinner"></span> : 'Save Permissions'}
                    </button>
                  )}
                </div>
              </div>

              {/* Legend */}
              <div className="flex items-center gap-2 mb-4 flex-wrap">
                <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Legend:</span>
                {ALL_ACTIONS.map(a => (
                  <span key={a} className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${ACTION_COLORS[a]}`}>
                    {ACTION_LABELS[a]}
                  </span>
                ))}
                <span className="text-[10px] text-slate-400 font-medium ml-1">— = not applicable</span>
              </div>

              {/* Permission Table */}
              <div className="overflow-x-auto rounded-xl border border-slate-200/80 max-h-[55vh] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50 z-10">
                    <tr>
                      <th className="text-left px-5 py-3 text-[11px] font-black text-slate-500 uppercase tracking-wider min-w-[200px]">Module</th>
                      {ALL_ACTIONS.map(action => (
                        <th key={action} className={`px-3 py-3 text-center text-[11px] font-black uppercase tracking-wider ${ACTION_COLORS[action]} min-w-[80px]`}>
                          <div className="flex flex-col items-center gap-1">
                            <span>{ACTION_LABELS[action]}</span>
                            <input
                              type="checkbox"
                              className="checkbox checkbox-xs"
                              checked={isColumnChecked(action)}
                              onChange={e => setAllForAction(action, e.target.checked)}
                              title={`Toggle ${action} for all applicable modules`}
                            />
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {MODULE_GROUPS.map((group, gi) => (
                      <React.Fragment key={gi}>
                        <tr className="bg-slate-100/60">
                          <td colSpan={5} className="px-5 py-2 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">
                            {group.section}
                          </td>
                        </tr>
                        {group.modules.map((mod) => {
                          const permsRow = permissions[mod.key] || {};
                          const allSet = mod.actions.every(a => permsRow[a]);
                          return (
                            <tr key={mod.key} className="border-t border-slate-100 hover:bg-blue-50/40 transition-colors group">
                              <td className="px-5 py-3">
                                <div className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    className="checkbox checkbox-xs checkbox-primary"
                                    checked={allSet}
                                    onChange={e => setAllForModule(mod.key, e.target.checked)}
                                    title="Toggle all actions for this module"
                                  />
                                  <span className="text-[13px] font-semibold text-slate-700">{mod.label}</span>
                                </div>
                              </td>
                              {ALL_ACTIONS.map(action => {
                                const supported = mod.actions.includes(action);
                                const checked   = !!permsRow[action];
                                return (
                                  <td key={action} className="px-3 py-3 text-center">
                                    {supported ? (
                                      <input
                                        type="checkbox"
                                        className={`checkbox checkbox-sm ${
                                          action === 'read'   ? 'checkbox-info'    :
                                          action === 'create' ? 'checkbox-success' :
                                          action === 'update' ? 'checkbox-warning' :
                                          'checkbox-error'
                                        }`}
                                        checked={checked}
                                        onChange={() => togglePerm(mod.key, action, mod)}
                                      />
                                    ) : (
                                      <span className="text-slate-200 select-none text-lg leading-none">—</span>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── ROLE CREATE/EDIT MODAL ── */}
      {isRoleModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-[440px] overflow-hidden animate-fade-in">
            <div className="bg-[#0b1324] p-7 text-white">
              <h3 className="text-xl font-black italic tracking-tight uppercase">
                {editingRole ? 'Edit Role' : 'Create New Role'}
              </h3>
              <p className="text-slate-400 text-xs mt-1 font-medium italic">
                {editingRole ? `Editing: ${editingRole.name}` : 'Define a new access role for the system'}
              </p>
            </div>
            <form onSubmit={handleSaveRole} className="p-7 space-y-4">
              <div className="space-y-1.5">
                <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                  Role Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={roleForm.name}
                  onChange={e => setRoleForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Warehouse Staff, Accountant..."
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 placeholder-slate-400/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                  required
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">Description</label>
                <textarea
                  value={roleForm.description}
                  onChange={e => setRoleForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="Optional: describe what this role is for..."
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-700 placeholder-slate-400/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium resize-none"
                />
              </div>

              {roleFormErr && <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-xs font-semibold flex items-center gap-2 border border-red-100"><span>⚠️</span><span>{roleFormErr}</span></div>}
              {roleFormOk  && <div className="bg-emerald-50 text-emerald-600 px-4 py-3 rounded-xl text-xs font-semibold flex items-center gap-2 border border-emerald-100"><span>✅</span><span>{roleFormOk}</span></div>}

              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={savingRole} className="btn-premium btn-primary-premium flex-[2] h-12 text-sm uppercase tracking-wider">
                  {savingRole ? <span className="loading loading-spinner"></span> : (editingRole ? 'Update Role' : 'Create Role')}
                </button>
                <button type="button" onClick={() => setIsRoleModalOpen(false)} className="btn-premium bg-slate-50 text-slate-500 hover:bg-slate-100 border border-slate-200 flex-1 h-12 text-sm font-bold">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── DELETE ROLE CONFIRM ── */}
      {isDeleteOpen && (
        <div className="modal modal-open">
          <div className="modal-box rounded-2xl p-8 max-w-sm border border-slate-200 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="w-14 h-14 bg-red-50 text-red-500 rounded-full flex items-center justify-center text-2xl mx-auto mb-4">⚠️</div>
            <h3 className="text-xl font-black text-center text-slate-800">Delete Role</h3>
            <p className="text-center text-slate-500 mt-2 text-sm">
              Delete role <b>{deletingRole?.name}</b>?
              {deletingRole?.user_count > 0 && (
                <span className="block mt-2 text-red-500 font-semibold">
                  ⚠️ This role has {deletingRole.user_count} user(s) assigned. Reassign them first.
                </span>
              )}
            </p>
            {(!deletingRole?.user_count || deletingRole.user_count === 0) && (
              <div className="flex flex-col gap-2 mt-8">
                <button onClick={handleDeleteRole} className="btn-premium bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-200">
                  Yes, Delete Role
                </button>
              </div>
            )}
            <button onClick={() => setIsDeleteOpen(false)} className="btn-premium bg-slate-100 text-slate-600 hover:bg-slate-200 w-full mt-2">
              {deletingRole?.user_count > 0 ? 'Close' : 'Cancel'}
            </button>
          </div>
          <div className="modal-backdrop bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsDeleteOpen(false)}></div>
        </div>
      )}
    </div>
  );
};

export default RolePermissions;
