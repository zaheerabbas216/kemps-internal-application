import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import { SYSTEM_MODULE_CATEGORIES, ALL_MODULE_PATHS, ROLE_PRESETS } from '../constants/modules';

const UserAuthentication = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modal states
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isPreviewPermsModalOpen, setIsPreviewPermsModalOpen] = useState(false);
  const [previewUser, setPreviewUser] = useState(null);
  
  const [editingUser, setEditingUser] = useState(null);
  const [deletingUser, setDeletingUser] = useState(null);

  // Form states
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    password: '',
    permissions: ALL_MODULE_PATHS
  });
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(true);

  const currentLoggedUser = localStorage.getItem('kemps_username') || '';

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await api.get('/auth/users');
      if (res.data.ok) {
        setUsers(res.data.users || []);
      }
    } catch (err) {
      console.error('Failed to fetch users:', err);
    } finally {
      setLoading(false);
    }
  };

  const emptyForm = {
    name: '',
    username: '',
    password: '',
    permissions: ALL_MODULE_PATHS
  };

  const handleOpenForm = (user = null) => {
    setFormError('');
    setFormSuccess('');
    setShowPassword(true);
    if (user) {
      setEditingUser(user);
      const userPerms = Array.isArray(user.permissions)
        ? user.permissions
        : (user.permissions === null ? ALL_MODULE_PATHS : []);

      setFormData({
        name: user.name || '',
        username: user.username || '',
        password: '', // empty by default for security, only updated if filled
        permissions: userPerms
      });
    } else {
      setEditingUser(null);
      setFormData({
        ...emptyForm,
        permissions: ALL_MODULE_PATHS
      });
    }
    setIsFormModalOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormModalOpen(false);
    setEditingUser(null);
    setFormData(emptyForm);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Toggle single module permission
  const handleToggleModule = (path) => {
    setFormData(prev => {
      const current = prev.permissions || [];
      if (current.includes(path)) {
        return { ...prev, permissions: current.filter(p => p !== path) };
      } else {
        return { ...prev, permissions: [...current, path] };
      }
    });
  };

  // Toggle entire category
  const handleToggleCategory = (category) => {
    const catPaths = category.modules.map(m => m.path);
    const allSelected = catPaths.every(p => (formData.permissions || []).includes(p));

    setFormData(prev => {
      const current = prev.permissions || [];
      if (allSelected) {
        // Deselect category
        return { ...prev, permissions: current.filter(p => !catPaths.includes(p)) };
      } else {
        // Select all in category
        const combined = Array.from(new Set([...current, ...catPaths]));
        return { ...prev, permissions: combined };
      }
    });
  };

  // Apply Role Preset
  const handleApplyPreset = (preset) => {
    setFormData(prev => ({
      ...prev,
      permissions: preset.paths
    }));
  };

  const handleSelectAll = () => {
    setFormData(prev => ({ ...prev, permissions: ALL_MODULE_PATHS }));
  };

  const handleDeselectAll = () => {
    setFormData(prev => ({ ...prev, permissions: [] }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    const nameTrimmed = formData.name.trim();
    const usernameTrimmed = formData.username.trim();
    const passwordRaw = formData.password;

    if (!usernameTrimmed) {
      setFormError('Username is required.');
      return;
    }

    if (!editingUser && !passwordRaw) {
      setFormError('Password is required for new accounts.');
      return;
    }

    setIsSaving(true);

    try {
      let response;
      const isTargetAdmin = usernameTrimmed.toLowerCase() === 'admin';
      const permsToSave = isTargetAdmin ? null : (formData.permissions || []);

      const payload = {
        name: nameTrimmed,
        username: usernameTrimmed,
        password: passwordRaw || undefined,
        permissions: permsToSave
      };

      if (editingUser) {
        response = await api.put(`/auth/users/${editingUser.id}`, payload);
      } else {
        response = await api.post('/auth/users', payload);
      }

      if (response.data.ok) {
        setFormSuccess(editingUser ? 'User credentials and permissions updated!' : 'New user account registered with permissions!');
        
        // If editing the currently logged-in user, keep localStorage in sync
        if (editingUser && editingUser.username === currentLoggedUser) {
          localStorage.setItem('kemps_username', usernameTrimmed);
          localStorage.setItem('kemps_permissions', JSON.stringify(permsToSave));
        }

        setTimeout(() => {
          handleCloseForm();
          fetchUsers();
        }, 1000);
      } else {
        setFormError(response.data.error || 'Failed to save user credentials.');
      }
    } catch (err) {
      setFormError(err.response?.data?.error || err.message || 'An error occurred while saving.');
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = (user) => {
    if (user.username === currentLoggedUser) {
      alert('You cannot delete your own logged-in user account.');
      return;
    }
    setDeletingUser(user);
    setIsDeleteModalOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingUser) return;
    try {
      const response = await api.delete(`/auth/users/${deletingUser.id}`);
      if (response.data.ok) {
        setIsDeleteModalOpen(false);
        setDeletingUser(null);
        fetchUsers();
      } else {
        alert(response.data.error || 'Failed to delete user.');
      }
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  const handleOpenPreviewPerms = (user) => {
    setPreviewUser(user);
    setIsPreviewPermsModalOpen(true);
  };

  const formatDateDDMMYYYY = (dateStr) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const filteredUsers = users.filter(user => {
    const q = searchQuery.toLowerCase();
    return (
      (user.name && user.name.toLowerCase().includes(q)) ||
      (user.username && user.username.toLowerCase().includes(q)) ||
      String(user.id).includes(q)
    );
  });

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto pb-12">
      {/* PAGE HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase">User Authentication & Permissions</h1>
          <p className="text-slate-500 text-sm font-medium mt-1">Manage system operators, login credentials, and tick-mark module access rights</p>
        </div>
        <button 
          onClick={() => handleOpenForm()}
          className="btn-premium btn-primary-premium shadow-md shadow-primary/20 shrink-0"
        >
          <span>➕</span> Add New User
        </button>
      </div>

      {/* SEARCH AND TABLE CONTAINER */}
      <div className="card-premium">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="relative flex-1 max-w-md">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
            <input 
              type="text" 
              placeholder="Search by name, username, or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-premium pl-11 h-10 w-full"
            />
          </div>
          <div className="text-[12px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
            {filteredUsers.length} Users Listed
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="table table-zebra w-full overflow-hidden">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr className="text-slate-500 text-[11px] font-black uppercase tracking-wider">
                <th className="py-4 px-6 text-left">User ID</th>
                <th className="py-4 px-6 text-left">Full Name</th>
                <th className="py-4 px-6 text-left">Username (Login ID)</th>
                <th className="py-4 px-6 text-left">Module Permissions</th>
                <th className="py-4 px-6 text-left">Registered Date</th>
                <th className="py-4 px-6 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr>
                  <td colSpan="6" className="py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                       <span className="loading loading-spinner text-primary"></span>
                       <span className="text-slate-400 text-sm font-medium">Fetching users...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-20 text-center text-slate-400 font-medium italic">
                    {searchQuery ? 'No users found matching your search.' : 'No users registered yet.'}
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => {
                  const isSelf = user.username === currentLoggedUser;
                  const isMasterAdmin = user.username.toLowerCase() === 'admin';
                  const hasFullAccess = isMasterAdmin || user.permissions === null || (Array.isArray(user.permissions) && user.permissions.length === ALL_MODULE_PATHS.length);
                  const permsCount = Array.isArray(user.permissions) ? user.permissions.length : ALL_MODULE_PATHS.length;

                  return (
                    <tr key={user.id} className="hover:bg-blue-50/30 transition-colors group">
                      <td className="py-4 px-6 text-[13px] font-mono font-bold text-primary">{user.id}</td>
                      <td className="py-4 px-6 text-[14px] font-bold text-slate-700">
                        <div className="flex items-center gap-2">
                          <span>{user.name || '—'}</span>
                          {isSelf && (
                            <span className="text-[10px] font-extrabold bg-blue-100 text-primary px-2 py-0.5 rounded-full uppercase tracking-wider">
                              You
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-6 text-[14px] font-medium text-slate-600 font-mono">
                        {user.username}
                      </td>
                      <td className="py-4 px-6">
                        {hasFullAccess ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                            Full Access (All Modules)
                          </span>
                        ) : (
                          <button
                            onClick={() => handleOpenPreviewPerms(user)}
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors"
                          >
                            <span>🔒</span>
                            <span>{permsCount} Modules Allowed</span>
                          </button>
                        )}
                      </td>
                      <td className="py-4 px-6 text-[13px] text-slate-400">{formatDateDDMMYYYY(user.created_at)}</td>
                      <td className="py-4 px-6">
                        <div className="flex items-center justify-center gap-2">
                          <button 
                            onClick={() => handleOpenForm(user)}
                            className="btn btn-ghost btn-xs text-primary hover:bg-primary/10 rounded-lg px-2.5 font-bold"
                          >
                            Edit Access
                          </button>
                          {isSelf ? (
                            <span 
                              className="text-[11px] text-slate-450 italic px-2 py-1 select-none"
                              title="Prevented self-lockout"
                            >
                              Current Session
                            </span>
                          ) : (
                            <button 
                              onClick={() => confirmDelete(user)}
                              className="btn btn-ghost btn-xs text-red-500 hover:bg-red-50 rounded-lg px-2"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* FORM MODAL - ADD / EDIT USER WITH PERMISSIONS */}
      {isFormModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 pointer-events-auto">
          <div className="bg-white rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.25)] border border-slate-200 w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden animate-scaleIn pointer-events-auto">
            
            {/* Header - Fixed at top */}
            <div className="bg-[#0b1324] p-6 text-white shrink-0 relative flex items-center justify-between border-b border-slate-800">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-primary">
                  {editingUser ? '🔐 USER PERMISSION CONTROL' : '➕ CREATE OPERATOR ACCOUNT'}
                </span>
                <h3 className="text-xl font-black italic tracking-tight uppercase mt-0.5">
                  {editingUser ? `Edit User: ${editingUser.username}` : 'Add New User'}
                </h3>
              </div>
              <button 
                onClick={handleCloseForm}
                className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-all font-bold"
              >
                ✕
              </button>
            </div>

            {/* Scrollable Form Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
              <form id="userForm" onSubmit={handleSave} className="space-y-6">
                
                {/* 1. User Credentials Area */}
                <div className="border border-slate-200/80 rounded-2xl bg-white overflow-hidden shadow-xs">
                  <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 flex items-center justify-between">
                    <span className="text-[11px] font-black text-slate-700 uppercase tracking-widest flex items-center gap-1.5">
                      <span>👤</span> 1. ACCOUNT IDENTITY & LOGIN CREDENTIALS
                    </span>
                    {editingUser && (
                      <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2.5 py-0.5 rounded-full">
                        ID: {editingUser.id}
                      </span>
                    )}
                  </div>
                  
                  <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Full Name */}
                    <div>
                      <label className="text-[12px] font-bold text-slate-600 block uppercase tracking-wider mb-1.5">
                        Full Name
                      </label>
                      <input 
                        type="text" 
                        name="name"
                        placeholder="Enter full name of the user"
                        value={formData.name}
                        onChange={handleInputChange}
                        className="input-premium h-10 font-medium"
                      />
                    </div>

                    {/* Username */}
                    <div>
                      <label className="text-[12px] font-bold text-slate-600 block uppercase tracking-wider mb-1.5">
                        Username (Login ID) *
                      </label>
                      <input 
                        type="text" 
                        name="username"
                        required
                        disabled={editingUser?.username === 'admin'}
                        placeholder="Enter username for login"
                        value={formData.username}
                        onChange={handleInputChange}
                        className="input-premium h-10 font-medium disabled:bg-slate-100 disabled:text-slate-400"
                      />
                    </div>

                    {/* Password */}
                    <div className="sm:col-span-2">
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[12px] font-bold text-slate-600 uppercase tracking-wider">
                          Password {editingUser ? '(Leave blank to keep current)' : '*'}
                        </label>
                        <button 
                          type="button" 
                          onClick={() => setShowPassword(!showPassword)}
                          className="text-[11px] font-bold text-primary hover:underline"
                        >
                          {showPassword ? 'Hide Password' : 'Show Password'}
                        </button>
                      </div>
                      <input 
                        type={showPassword ? 'text' : 'password'} 
                        name="password"
                        required={!editingUser}
                        placeholder={editingUser ? 'Enter new password only if changing' : 'Enter secure login password'}
                        value={formData.password}
                        onChange={handleInputChange}
                        className="input-premium h-10 font-medium"
                      />
                    </div>
                  </div>
                </div>

                {/* 2. Module Access & Permissions Area */}
                <div className="border border-slate-200/80 rounded-2xl bg-white overflow-hidden shadow-xs">
                  <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-black text-slate-700 uppercase tracking-widest flex items-center gap-1.5">
                        <span>🔒</span> 2. MODULE ACCESS & RESTRICTION CONTROLS
                      </span>
                      <span className="text-[11px] font-extrabold bg-blue-100 text-blue-800 px-2 py-0.5 rounded-md">
                        {formData.permissions?.length || 0} / {ALL_MODULE_PATHS.length} Selected
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSelectAll}
                        className="px-2.5 py-1 text-xs font-bold text-primary hover:bg-primary/10 rounded-lg transition-colors"
                      >
                        ✓ Select All
                      </button>
                      <button
                        type="button"
                        onClick={handleDeselectAll}
                        className="px-2.5 py-1 text-xs font-bold text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        ✕ Clear All
                      </button>
                    </div>
                  </div>

                  <div className="p-5 space-y-5">
                    {/* Role Presets */}
                    <div>
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                        Quick Role Presets:
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {ROLE_PRESETS.map((preset, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => handleApplyPreset(preset)}
                            className="px-3 py-1.5 rounded-xl text-xs font-extrabold border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 transition-all"
                          >
                            {preset.name}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Categories Checkbox Grid */}
                    <div className="space-y-4 pt-2">
                      {SYSTEM_MODULE_CATEGORIES.map((cat) => {
                        const catPaths = cat.modules.map(m => m.path);
                        const isAllCatSelected = catPaths.every(p => (formData.permissions || []).includes(p));
                        const isSomeCatSelected = catPaths.some(p => (formData.permissions || []).includes(p));

                        return (
                          <div key={cat.id} className="border border-slate-200/90 rounded-2xl p-4 bg-slate-50/40">
                            {/* Category Header */}
                            <div className="flex items-center justify-between pb-3 border-b border-slate-200/80 mb-3">
                              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={isAllCatSelected}
                                  ref={el => {
                                    if (el) el.indeterminate = isSomeCatSelected && !isAllCatSelected;
                                  }}
                                  onChange={() => handleToggleCategory(cat)}
                                  className="checkbox checkbox-primary checkbox-sm rounded-md"
                                />
                                <span className="font-extrabold text-sm text-slate-800 flex items-center gap-2">
                                  <span>{cat.icon}</span>
                                  <span>{cat.name}</span>
                                </span>
                              </label>
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                {cat.modules.filter(m => (formData.permissions || []).includes(m.path)).length} / {cat.modules.length} Enabled
                              </span>
                            </div>

                            {/* Modules in this category */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                              {cat.modules.map((m) => {
                                const isChecked = (formData.permissions || []).includes(m.path);
                                return (
                                  <label
                                    key={m.path}
                                    className={`flex items-center gap-2.5 p-2.5 rounded-xl border transition-all cursor-pointer select-none ${
                                      isChecked
                                        ? 'bg-white border-blue-300 shadow-xs ring-1 ring-blue-200'
                                        : 'bg-white/60 border-slate-200 text-slate-500 hover:bg-white hover:border-slate-300'
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => handleToggleModule(m.path)}
                                      className="checkbox checkbox-primary checkbox-xs rounded"
                                    />
                                    <span className="text-sm">{m.icon}</span>
                                    <span className={`text-xs font-bold ${isChecked ? 'text-slate-900' : 'text-slate-600'}`}>
                                      {m.label}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Notifications in Modal */}
                {formError && (
                  <div className="bg-red-50 text-red-600 p-4 rounded-xl text-xs font-bold border border-red-200 flex items-center gap-2">
                    <span>⚠️</span> {formError}
                  </div>
                )}
                {formSuccess && (
                  <div className="bg-emerald-50 text-emerald-600 p-4 rounded-xl text-xs font-bold border border-emerald-200 flex items-center gap-2">
                    <span>✓</span> {formSuccess}
                  </div>
                )}

                {/* Footer Buttons */}
                <div className="flex items-center justify-end gap-3 pt-2">
                  <button 
                    type="button" 
                    onClick={handleCloseForm}
                    className="px-5 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition-colors text-sm"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    disabled={isSaving}
                    className="btn-premium btn-primary-premium text-sm px-7"
                  >
                    {isSaving ? 'Saving User...' : editingUser ? 'Update Credentials & Access' : 'Register User'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* PREVIEW PERMISSIONS MODAL */}
      {isPreviewPermsModalOpen && previewUser && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 pointer-events-auto">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-xl max-h-[85vh] flex flex-col overflow-hidden animate-scaleIn">
            <div className="bg-[#0b1324] p-5 text-white flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">ACCESS PERMISSIONS</span>
                <h3 className="text-lg font-black text-white">{previewUser.name} ({previewUser.username})</h3>
              </div>
              <button
                onClick={() => setIsPreviewPermsModalOpen(false)}
                className="w-8 h-8 rounded-full bg-white/10 text-white flex items-center justify-center font-bold hover:bg-white/20"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              {SYSTEM_MODULE_CATEGORIES.map(cat => {
                const allowedModules = cat.modules.filter(m => (previewUser.permissions || []).includes(m.path));
                if (allowedModules.length === 0) return null;

                return (
                  <div key={cat.id} className="border border-slate-100 rounded-2xl p-3.5 bg-slate-50/70">
                    <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <span>{cat.icon}</span> {cat.name}
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {allowedModules.map(m => (
                        <span key={m.path} className="px-2.5 py-1 bg-white text-slate-700 font-bold text-xs rounded-lg border border-slate-200 shadow-2xs flex items-center gap-1">
                          <span>{m.icon}</span> {m.label}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {isDeleteModalOpen && deletingUser && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 pointer-events-auto">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-md p-6 space-y-4 animate-scaleIn text-center">
            <div className="w-14 h-14 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center text-2xl mx-auto border border-red-100">
              ⚠️
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 font-heading">Delete User Account?</h3>
              <p className="text-xs text-slate-500 mt-1">
                Are you sure you want to delete user <span className="font-bold text-slate-800 font-mono">{deletingUser.username}</span>? They will permanently lose access to the system.
              </p>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsDeleteModalOpen(false);
                  setDeletingUser(null);
                }}
                className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs rounded-xl shadow-md shadow-red-500/20"
              >
                Delete Account
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserAuthentication;
