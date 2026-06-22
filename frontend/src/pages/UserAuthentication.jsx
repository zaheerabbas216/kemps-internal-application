import React, { useState, useEffect } from 'react';
import api from '../api/axios';

const UserAuthentication = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modal states
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  
  const [editingUser, setEditingUser] = useState(null);
  const [deletingUser, setDeletingUser] = useState(null);

  // Form states
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    password: ''
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
    password: ''
  };

  const handleOpenForm = (user = null) => {
    setFormError('');
    setFormSuccess('');
    setShowPassword(true);
    if (user) {
      setEditingUser(user);
      setFormData({
        name: user.name || '',
        username: user.username || '',
        password: '' // empty by default for security, only updated if filled
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
      const payload = {
        name: nameTrimmed,
        username: usernameTrimmed,
        password: passwordRaw || undefined
      };

      if (editingUser) {
        response = await api.put(`/auth/users/${editingUser.id}`, payload);
      } else {
        response = await api.post('/auth/users', payload);
      }

      if (response.data.ok) {
        setFormSuccess(editingUser ? 'User credentials updated successfully!' : 'New user account registered successfully!');
        
        // If editing the currently logged-in user, keep localStorage in sync
        if (editingUser && editingUser.username === currentLoggedUser) {
          localStorage.setItem('kemps_username', usernameTrimmed);
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

  const formatDateDDMMYYYY = (dateStr) => {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '—';
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  const filteredUsers = users.filter(user => {
    const term = searchQuery.toLowerCase();
    return (
      String(user.id).includes(term) ||
      (user.name || '').toLowerCase().includes(term) ||
      (user.username || '').toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* HEADER & TOP ACTIONS */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">USER AUTHENTICATION</h1>
          <p className="text-slate-500 text-sm font-medium mt-1">Manage system administrators, operator logins, and passwords.</p>
        </div>
        <button 
          onClick={() => handleOpenForm()}
          className="btn-premium btn-primary-premium h-12"
        >
          <span className="text-xl">+</span> Add New User
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
                <th className="py-4 px-6 text-left">Password</th>
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
                      <td className="py-4 px-6 text-[14px] font-medium text-slate-600">{user.username}</td>
                      <td className="py-4 px-6 text-[14px] font-mono text-slate-600">
                        {user.password && (user.password.startsWith('$2a$') || user.password.startsWith('$2b$')) ? (
                          <span className="text-slate-400 italic">••••••••</span>
                        ) : (
                          user.password || '—'
                        )}
                      </td>
                      <td className="py-4 px-6 text-[13px] text-slate-400">{formatDateDDMMYYYY(user.created_at)}</td>
                      <td className="py-4 px-6">
                        <div className="flex items-center justify-center gap-2">
                          <button 
                            onClick={() => handleOpenForm(user)}
                            className="btn btn-ghost btn-xs text-primary hover:bg-primary/10 rounded-lg px-2"
                          >
                            Edit
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

      {/* FORM MODAL */}
      {isFormModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm pointer-events-auto">
          <div className="bg-white rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.2)] border border-slate-200 w-[550px] max-h-[90vh] flex flex-col overflow-hidden animate-fade-in pointer-events-auto">
            
            {/* Header - Fixed at top */}
            <div className="bg-[#0b1324] p-7 text-white shrink-0 relative">
              <h3 className="text-2xl font-black italic tracking-tight uppercase">
                {editingUser ? 'Edit User Credentials' : 'Add New User'}
              </h3>
              <p className="text-slate-400 text-xs mt-1 font-medium italic">
                {editingUser ? `Editing profile for user ID: ${editingUser.id}` : 'Create a fresh system administrator login'}
              </p>
              <button 
                onClick={handleCloseForm}
                className="absolute right-7 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-all font-bold"
              >
                ✕
              </button>
            </div>

            {/* Scrollable Form Content */}
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-5">
              <form id="userForm" onSubmit={handleSave} className="space-y-5">
                
                {/* User Information Area */}
                <div className="border border-slate-200/80 rounded-2xl bg-white overflow-hidden">
                  <div className="bg-slate-50/40 px-5 py-3 border-b border-slate-200/80 flex items-center justify-between">
                    <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                      <span>👤</span> ACCOUNT IDENTITY & CREDENTIALS
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
                      <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                        Full Name
                      </label>
                      <input 
                        type="text" 
                        name="name"
                        value={formData.name}
                        onChange={handleInputChange}
                        placeholder="Enter full name of the user" 
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 placeholder-slate-400/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all duration-200 outline-none text-sm font-medium"
                      />
                    </div>

                    {/* Username */}
                    <div className="space-y-1.5">
                      <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                        Username (Login ID) <span className="text-red-500">*</span>
                      </label>
                      <input 
                        type="text" 
                        name="username"
                        value={formData.username}
                        onChange={handleInputChange}
                        placeholder="Enter username" 
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 placeholder-slate-400/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all duration-200 outline-none text-sm font-medium"
                        required
                      />
                    </div>

                    {/* Password */}
                    <div className="space-y-1.5">
                      <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                        Password {editingUser ? '' : <span className="text-red-500">*</span>}
                      </label>
                      <div className="relative">
                        <input 
                          type={showPassword ? "text" : "password"} 
                          name="password"
                          value={formData.password}
                          onChange={handleInputChange}
                          placeholder={editingUser ? "Leave blank to keep current password" : "Enter secure password"} 
                          className="w-full h-11 pl-4 pr-16 rounded-xl border border-slate-200 bg-white text-slate-700 placeholder-slate-400/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all duration-200 outline-none text-sm font-medium"
                          required={!editingUser}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 text-[11px] font-bold uppercase tracking-wider transition-all duration-200 select-none"
                        >
                          {showPassword ? "Hide" : "Show"}
                        </button>
                      </div>
                      {editingUser && (
                        <span className="text-[10px] text-slate-450 font-medium block pl-1 italic">
                          Password change is optional. Only fill this field if you wish to reset their password.
                        </span>
                      )}
                    </div>

                  </div>
                </div>

                {/* Feedback Messages inside Scroll */}
                {formError && (
                  <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-xs font-semibold flex items-center gap-2 border border-red-100">
                    <span>⚠️</span>
                    <span>{formError}</span>
                  </div>
                )}
                {formSuccess && (
                  <div className="bg-emerald-50 text-emerald-600 px-4 py-3 rounded-xl text-xs font-semibold flex items-center gap-2 border border-emerald-100 animate-fade-in">
                    <span>✅</span>
                    <span>{formSuccess}</span>
                  </div>
                )}
              </form>
            </div>

            {/* Sticky Footer - Fixed at bottom */}
            <div className="p-8 border-t border-slate-100 bg-white flex gap-4 shrink-0 shadow-[0_-10px_30px_rgba(0,0,0,0.02)]">
              <button 
                type="submit" 
                form="userForm"
                disabled={isSaving}
                className="btn-premium btn-primary-premium flex-[2] h-14 text-sm uppercase tracking-wider"
              >
                {isSaving ? <span className="loading loading-spinner"></span> : (editingUser ? 'Update Credentials' : 'Register User')}
              </button>
              <button 
                type="button" 
                onClick={handleCloseForm}
                className="btn-premium bg-slate-50 text-slate-500 hover:bg-slate-100 border border-slate-200 flex-1 h-14 text-sm font-bold uppercase tracking-wider"
              >
                Cancel
              </button>
            </div>

          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {isDeleteModalOpen && (
        <div className="modal modal-open">
          <div className="modal-box rounded-2xl p-8 max-w-sm border border-slate-200 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="w-14 h-14 bg-red-50 text-red-500 rounded-full flex items-center justify-center text-2xl mx-auto mb-4">
              ⚠️
            </div>
            <h3 className="text-xl font-black text-center text-slate-800">Confirm Account Deletion</h3>
            <p className="text-center text-slate-500 mt-2 text-sm">
              Are you sure you want to delete the administrator account <b>{deletingUser?.username}</b>?
              <br/>The user will immediately lose system access. This action cannot be undone.
            </p>
            <div className="flex flex-col gap-2 mt-8">
              <button 
                onClick={handleDelete}
                className="btn-premium bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-200"
              >
                Yes, Delete User
              </button>
              <button 
                onClick={() => setIsDeleteModalOpen(false)}
                className="btn-premium bg-slate-100 text-slate-600 hover:bg-slate-200"
              >
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
