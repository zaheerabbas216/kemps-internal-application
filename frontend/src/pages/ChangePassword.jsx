import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

const ChangePassword = () => {
  const navigate = useNavigate();
  const { logout, user } = useAuth();

  const [formData, setFormData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const toggleShow = (field) => {
    setShowPasswords(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!formData.currentPassword || !formData.newPassword || !formData.confirmPassword) {
      setError('All fields are required.');
      return;
    }
    if (formData.newPassword !== formData.confirmPassword) {
      setError('New password and confirm password do not match.');
      return;
    }
    if (formData.newPassword.length < 4) {
      setError('New password must be at least 4 characters.');
      return;
    }
    if (formData.currentPassword === formData.newPassword) {
      setError('New password must be different from the current password.');
      return;
    }

    setIsSaving(true);
    try {
      const response = await api.post('/auth/change-password', {
        currentPassword: formData.currentPassword,
        newPassword: formData.newPassword,
      });

      if (response.data.ok) {
        setSuccess('Password changed successfully! You will be logged out in 3 seconds...');
        setTimeout(() => {
          logout();
          navigate('/login');
        }, 3000);
      } else {
        setError(response.data.error || 'Failed to change password.');
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'An error occurred.');
    } finally {
      setIsSaving(false);
    }
  };

  const PasswordField = ({ label, name, showKey, required }) => (
    <div className="space-y-1.5">
      <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <div className="relative">
        <input
          type={showPasswords[showKey] ? 'text' : 'password'}
          name={name}
          value={formData[name]}
          onChange={handleChange}
          placeholder={`Enter ${label.toLowerCase()}`}
          className="w-full h-11 pl-4 pr-16 rounded-xl border border-slate-200 bg-white text-slate-700 placeholder-slate-400/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all duration-200 outline-none text-sm font-medium"
          required={required}
        />
        <button
          type="button"
          onClick={() => toggleShow(showKey)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 text-[11px] font-bold uppercase tracking-wider transition-all duration-200 select-none"
        >
          {showPasswords[showKey] ? 'Hide' : 'Show'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in max-w-lg mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-slate-800 tracking-tight">CHANGE PASSWORD</h1>
        <p className="text-slate-500 text-sm font-medium mt-1">
          Update your login password for account <span className="font-bold text-slate-700">{user.username}</span>.
        </p>
      </div>

      {/* Form Card */}
      <div className="card-premium">
        <div className="border border-slate-200/80 rounded-2xl bg-white overflow-hidden">
          {/* Card header */}
          <div className="bg-slate-50/40 px-5 py-3 border-b border-slate-200/80 flex items-center gap-1.5">
            <span>🔑</span>
            <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Password Update</span>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <PasswordField label="Current Password"  name="currentPassword"  showKey="current" required />
            <PasswordField label="New Password"      name="newPassword"      showKey="new"     required />
            <PasswordField label="Confirm Password"  name="confirmPassword"  showKey="confirm" required />

            {/* Strength hint */}
            {formData.newPassword && (
              <div className="text-[11px] text-slate-400 font-medium pl-1">
                {formData.newPassword.length < 4
                  ? '⚠️ Too short — minimum 4 characters'
                  : formData.newPassword.length < 8
                  ? '🟡 Acceptable — consider using a longer password'
                  : '✅ Strong password'}
              </div>
            )}

            {/* Feedback */}
            {error && (
              <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-xs font-semibold flex items-center gap-2 border border-red-100">
                <span>⚠️</span><span>{error}</span>
              </div>
            )}
            {success && (
              <div className="bg-emerald-50 text-emerald-600 px-4 py-3 rounded-xl text-xs font-semibold flex items-center gap-2 border border-emerald-100 animate-fade-in">
                <span>✅</span><span>{success}</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={isSaving || !!success}
                className="btn-premium btn-primary-premium flex-[2] h-12 text-sm uppercase tracking-wider"
              >
                {isSaving ? <span className="loading loading-spinner"></span> : 'Update Password'}
              </button>
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="btn-premium bg-slate-50 text-slate-500 hover:bg-slate-100 border border-slate-200 flex-1 h-12 text-sm font-bold uppercase tracking-wider"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ChangePassword;
