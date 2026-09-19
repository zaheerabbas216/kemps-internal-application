import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import TablePagination, { getDensityClass } from '../components/common/TablePagination';
import SearchInput from '../components/common/SearchInput';

const UserAuthentication = () => {
  const [users, setUsers]   = useState([]);
  const [roles, setRoles]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage]   = useState(1);
  const [limit, setLimit] = useState(25);
  const [density, setDensity] = useState('medium');

  // Modal states
  const [isFormModalOpen,   setIsFormModalOpen]   = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isResetModalOpen,  setIsResetModalOpen]  = useState(false);

  const [editingUser,   setEditingUser]   = useState(null);
  const [deletingUser,  setDeletingUser]  = useState(null);
  const [resettingUser, setResettingUser] = useState(null);

  // Form states
  const emptyForm = { name: '', username: '', password: '', role_id: '' };
  const [formData,     setFormData]     = useState(emptyForm);
  const [formError,    setFormError]    = useState('');
  const [formSuccess,  setFormSuccess]  = useState('');
  const [isSaving,     setIsSaving]     = useState(false);
  const [showPassword, setShowPassword] = useState(true);

  // Reset password state
  const [resetPassword,    setResetPassword]    = useState('');
  const [showResetPass,    setShowResetPass]    = useState(false);
  const [resetError,       setResetError]       = useState('');
  const [resetSuccess,     setResetSuccess]     = useState('');
  const [isResetting,      setIsResetting]      = useState(false);

  const currentLoggedUser = localStorage.getItem('kemps_username') || '';

  useEffect(() => {
    fetchUsers();
    fetchRoles();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await api.get('/auth/users');
      if (res.data.ok) setUsers(res.data.users || []);
    } catch (err) {
      console.error('Failed to fetch users:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchRoles = async () => {
    try {
      const res = await api.get('/auth/roles');
      if (res.data.ok) setRoles(res.data.roles || []);
    } catch (err) {
      console.error('Failed to fetch roles:', err);
    }
  };

  const handleOpenForm = (user = null) => {
    setFormError('');
    setFormSuccess('');
    setShowPassword(true);
    if (user) {
      setEditingUser(user);
      setFormData({
        name:     user.name     || '',
        username: user.username || '',
        password: '',
        role_id:  user.role_id  || '',
      });
    } else {
      setEditingUser(null);
      setFormData(emptyForm);
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

  const handleSave = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    const nameTrimmed     = formData.name.trim();
    const usernameTrimmed = formData.username.trim();
    const passwordRaw     = formData.password;
    const roleId          = formData.role_id || null;

    if (!usernameTrimmed) { setFormError('Username is required.'); return; }
    if (!editingUser && !passwordRaw) { setFormError('Password is required for new accounts.'); return; }
    if (!editingUser && !roleId) { setFormError('Role is required for new users.'); return; }

    setIsSaving(true);
    try {
      let response;
      const payload = {
        name:     nameTrimmed,
        username: usernameTrimmed,
        role_id:  roleId || undefined,
        password: passwordRaw || undefined,
      };

      if (editingUser) {
        response = await api.put(`/auth/users/${editingUser.id}`, payload);
      } else {
        response = await api.post('/auth/users', payload);
      }

      if (response.data.ok) {
        setFormSuccess(editingUser ? 'User updated successfully!' : 'New user registered successfully!');
        if (editingUser && editingUser.username === currentLoggedUser) {
          localStorage.setItem('kemps_username', usernameTrimmed);
        }
        setTimeout(() => { handleCloseForm(); fetchUsers(); }, 1000);
      } else {
        setFormError(response.data.error || 'Failed to save user.');
      }
    } catch (err) {
      setFormError(err.response?.data?.error || err.message || 'An error occurred.');
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

  const openResetModal = (user) => {
    setResettingUser(user);
    setResetPassword('');
    setResetError('');
    setResetSuccess('');
    setShowResetPass(false);
    setIsResetModalOpen(true);
  };

  const handleResetPassword = async () => {
    if (!resetPassword.trim()) { setResetError('Please enter a new password.'); return; }
    setIsResetting(true);
    setResetError('');
    setResetSuccess('');
    try {
      const response = await api.post(`/auth/users/${resettingUser.id}/reset-password`, {
        newPassword: resetPassword,
      });
      if (response.data.ok) {
        setResetSuccess('Password reset successfully!');
        setTimeout(() => {
          setIsResetModalOpen(false);
          setResettingUser(null);
        }, 1200);
      } else {
        setResetError(response.data.error || 'Failed to reset password.');
      }
    } catch (err) {
      setResetError(err.response?.data?.error || err.message || 'An error occurred.');
    } finally {
      setIsResetting(false);
    }
  };

  const formatDateDDMMYYYY = (dateStr) => {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '—';
    const dd   = String(date.getDate()).padStart(2, '0');
    const mm   = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  const filteredUsers = users.filter(user => {
    const term = searchQuery.toLowerCase();
    return (
      String(user.id).includes(term) ||
      (user.name      || '').toLowerCase().includes(term) ||
      (user.username  || '').toLowerCase().includes(term) ||
      (user.role_name || '').toLowerCase().includes(term)
    );
  });

  const densityCls = (base) =>
    density === 'compact' ? `py-2 ${base}` : density === 'high' ? `py-5 ${base}` : `py-4 ${base}`;

  const RoleBadge = ({ user }) => {
    if (!user.role_id) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-extrabold bg-purple-100 text-purple-700 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
          ⚡ Superadmin
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-blue-50 text-blue-700 px-2.5 py-0.5 rounded-full border border-blue-100">
        {user.role_name || 'Unknown Role'}
      </span>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">

      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">ADMIN CONSOLE — USER MANAGEMENT</h1>
          <p className="text-slate-500 text-sm font-medium mt-1">Manage system users, roles, and access credentials.</p>
        </div>
        <button onClick={() => handleOpenForm()} className="btn-premium btn-primary-premium h-12">
          <span className="text-xl">+</span> Add New User
        </button>
      </div>

      {/* TABLE CARD */}
      <div className="card-premium">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex-1 max-w-md">
            <SearchInput
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, username, role, or ID..."
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
                <th className={densityCls('px-6 text-left')}>User ID</th>
                <th className={densityCls('px-6 text-left')}>Full Name</th>
                <th className={densityCls('px-6 text-left')}>Username (Login ID)</th>
                <th className={densityCls('px-6 text-left')}>Role</th>
                <th className={densityCls('px-6 text-left')}>Registered Date</th>
                <th className={densityCls('px-6 text-center')}>Actions</th>
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
                filteredUsers.slice((page - 1) * limit, page * limit).map((user) => {
                  const isSelf = user.username === currentLoggedUser;
                  return (
                    <tr key={user.id} className="hover:bg-blue-50/30 transition-colors group">
                      <td className={`${densityCls('px-6')} font-mono font-bold text-primary text-[13px]`}>{user.id}</td>
                      <td className={`${densityCls('px-6')} font-bold text-slate-700 text-[14px]`}>
                        <div className="flex items-center gap-2">
                          <span>{user.name || '—'}</span>
                          {isSelf && (
                            <span className="text-[10px] font-extrabold bg-blue-100 text-primary px-2 py-0.5 rounded-full uppercase tracking-wider">
                              You
                            </span>
                          )}
                        </div>
                      </td>
                      <td className={`${densityCls('px-6')} font-medium text-slate-600 text-[14px]`}>{user.username}</td>
                      <td className={densityCls('px-6')}>
                        <RoleBadge user={user} />
                      </td>
                      <td className={`${densityCls('px-6')} text-slate-400 text-[13px]`}>{formatDateDDMMYYYY(user.created_at)}</td>
                      <td className={densityCls('px-6')}>
                        <div className="flex items-center justify-center gap-1.5 flex-wrap">
                          <button
                            onClick={() => handleOpenForm(user)}
                            className="btn btn-ghost btn-xs text-primary hover:bg-primary/10 rounded-lg px-2"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => openResetModal(user)}
                            className="btn btn-ghost btn-xs text-amber-600 hover:bg-amber-50 rounded-lg px-2"
                          >
                            Reset PW
                          </button>
                          {isSelf ? (
                            <span className="text-[11px] text-slate-400 italic px-2 py-1 select-none" title="Cannot delete your own account">
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
        <TablePagination
          page={page} setPage={setPage}
          limit={limit} setLimit={setLimit}
          totalItems={filteredUsers.length}
          density={density} setDensity={setDensity}
        />
      </div>

      {/* ── ADD / EDIT USER MODAL ── */}
      {isFormModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm pointer-events-auto">
          <div className="bg-white rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.2)] border border-slate-200 w-[550px] max-h-[90vh] flex flex-col overflow-hidden animate-fade-in pointer-events-auto">

            <div className="bg-[#0b1324] p-7 text-white shrink-0 relative">
              <h3 className="text-2xl font-black italic tracking-tight uppercase">
                {editingUser ? 'Edit User' : 'Add New User'}
              </h3>
              <p className="text-slate-400 text-xs mt-1 font-medium italic">
                {editingUser ? `Editing user ID: ${editingUser.id}` : 'Create a new system user account'}
              </p>
              <button
                onClick={handleCloseForm}
                className="absolute right-7 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-all font-bold"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-5">
              <form id="userForm" onSubmit={handleSave} className="space-y-5">
                <div className="border border-slate-200/80 rounded-2xl bg-white overflow-hidden">
                  <div className="bg-slate-50/40 px-5 py-3 border-b border-slate-200/80 flex items-center justify-between">
                    <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                      <span>👤</span> Account Identity & Credentials
                    </span>
                    {editingUser && (
                      <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2.5 py-0.5 rounded-full">
                        ID: {editingUser.id}
                      </span>
                    )}
                  </div>

                  <div className="p-6 space-y-4">
                    {/* Full Name */}
                    <div className="space-y-1.5">
                      <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">Full Name</label>
                      <input
                        type="text" name="name" value={formData.name} onChange={handleInputChange}
                        placeholder="Enter full name"
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 placeholder-slate-400/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all duration-200 outline-none text-sm font-medium"
                      />
                    </div>

                    {/* Username */}
                    <div className="space-y-1.5">
                      <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                        Username (Login ID) <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text" name="username" value={formData.username} onChange={handleInputChange}
                        placeholder="Enter username"
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 placeholder-slate-400/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all duration-200 outline-none text-sm font-medium"
                        required
                      />
                    </div>

                    {/* Role */}
                    <div className="space-y-1.5">
                      <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                        Role {!editingUser && <span className="text-red-500">*</span>}
                      </label>
                      <select
                        name="role_id" value={formData.role_id} onChange={handleInputChange}
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all duration-200 outline-none text-sm font-medium"
                        required={!editingUser}
                      >
                        <option value="">— Select a role —</option>
                        {roles.map(r => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                      </select>
                      {roles.length === 0 && (
                        <p className="text-[11px] text-amber-600 font-medium pl-1">
                          ⚠️ No roles found. Please create roles first in <strong>Roles &amp; Permissions</strong>.
                        </p>
                      )}
                    </div>

                    {/* Password */}
                    <div className="space-y-1.5">
                      <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                        Password {!editingUser && <span className="text-red-500">*</span>}
                      </label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          name="password" value={formData.password} onChange={handleInputChange}
                          placeholder={editingUser ? 'Leave blank to keep current password' : 'Enter secure password'}
                          className="w-full h-11 pl-4 pr-16 rounded-xl border border-slate-200 bg-white text-slate-700 placeholder-slate-400/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all duration-200 outline-none text-sm font-medium"
                          required={!editingUser}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 text-[11px] font-bold uppercase tracking-wider transition-all duration-200 select-none"
                        >
                          {showPassword ? 'Hide' : 'Show'}
                        </button>
                      </div>
                      {editingUser && (
                        <span className="text-[10px] text-slate-400 font-medium block pl-1 italic">
                          Leave blank to keep the current password. Use "Reset PW" for admin password resets.
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {formError   && <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-xs font-semibold flex items-center gap-2 border border-red-100"><span>⚠️</span><span>{formError}</span></div>}
                {formSuccess && <div className="bg-emerald-50 text-emerald-600 px-4 py-3 rounded-xl text-xs font-semibold flex items-center gap-2 border border-emerald-100 animate-fade-in"><span>✅</span><span>{formSuccess}</span></div>}
              </form>
            </div>

            <div className="p-8 border-t border-slate-100 bg-white flex gap-4 shrink-0 shadow-[0_-10px_30px_rgba(0,0,0,0.02)]">
              <button type="submit" form="userForm" disabled={isSaving} className="btn-premium btn-primary-premium flex-[2] h-14 text-sm uppercase tracking-wider">
                {isSaving ? <span className="loading loading-spinner"></span> : (editingUser ? 'Update User' : 'Register User')}
              </button>
              <button type="button" onClick={handleCloseForm} className="btn-premium bg-slate-50 text-slate-500 hover:bg-slate-100 border border-slate-200 flex-1 h-14 text-sm font-bold uppercase tracking-wider">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── RESET PASSWORD MODAL ── */}
      {isResetModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm pointer-events-auto">
          <div className="bg-white rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.2)] border border-slate-200 w-[430px] flex flex-col overflow-hidden animate-fade-in pointer-events-auto">

            <div className="bg-[#0b1324] p-6 text-white relative">
              <h3 className="text-xl font-black italic tracking-tight uppercase">Reset Password</h3>
              <p className="text-slate-400 text-xs mt-1 font-medium italic">
                Setting new password for <strong className="text-white">{resettingUser?.username}</strong>
              </p>
              <button
                onClick={() => setIsResetModalOpen(false)}
                className="absolute right-6 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-all font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <div className="p-7 space-y-4">
              <div className="bg-amber-50 border border-amber-100 text-amber-700 text-xs font-semibold px-4 py-3 rounded-xl flex items-start gap-2">
                <span className="mt-0.5">⚠️</span>
                <span>This will immediately override the user's current password. They will need to log in again.</span>
              </div>

              <div className="space-y-1.5">
                <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                  New Password <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showResetPass ? 'text' : 'password'}
                    value={resetPassword}
                    onChange={e => setResetPassword(e.target.value)}
                    placeholder="Enter new password"
                    className="w-full h-11 pl-4 pr-16 rounded-xl border border-slate-200 bg-white text-slate-700 placeholder-slate-400/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all duration-200 outline-none text-sm font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetPass(!showResetPass)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 text-[11px] font-bold uppercase tracking-wider transition-all"
                  >
                    {showResetPass ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              {resetError   && <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-xs font-semibold flex items-center gap-2 border border-red-100"><span>⚠️</span><span>{resetError}</span></div>}
              {resetSuccess && <div className="bg-emerald-50 text-emerald-600 px-4 py-3 rounded-xl text-xs font-semibold flex items-center gap-2 border border-emerald-100"><span>✅</span><span>{resetSuccess}</span></div>}

              <div className="flex gap-3 pt-1">
                <button
                  onClick={handleResetPassword}
                  disabled={isResetting || !!resetSuccess}
                  className="btn-premium btn-primary-premium flex-[2] h-12 text-sm uppercase tracking-wider"
                >
                  {isResetting ? <span className="loading loading-spinner"></span> : 'Reset Password'}
                </button>
                <button
                  onClick={() => setIsResetModalOpen(false)}
                  className="btn-premium bg-slate-50 text-slate-500 hover:bg-slate-100 border border-slate-200 flex-1 h-12 text-sm font-bold"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── DELETE CONFIRMATION MODAL ── */}
      {isDeleteModalOpen && (
        <div className="modal modal-open">
          <div className="modal-box rounded-2xl p-8 max-w-sm border border-slate-200 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="w-14 h-14 bg-red-50 text-red-500 rounded-full flex items-center justify-center text-2xl mx-auto mb-4">⚠️</div>
            <h3 className="text-xl font-black text-center text-slate-800">Confirm Account Deletion</h3>
            <p className="text-center text-slate-500 mt-2 text-sm">
              Are you sure you want to delete the account <b>{deletingUser?.username}</b>?
              <br />The user will immediately lose system access. This action cannot be undone.
            </p>
            <div className="flex flex-col gap-2 mt-8">
              <button onClick={handleDelete} className="btn-premium bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-200">
                Yes, Delete User
              </button>
              <button onClick={() => setIsDeleteModalOpen(false)} className="btn-premium bg-slate-100 text-slate-600 hover:bg-slate-200">
                No, Keep Account
              </button>
            </div>
          </div>
          <div className="modal-backdrop bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsDeleteModalOpen(false)}></div>
        </div>
      )}
    </div>
  );
};

export default UserAuthentication;
