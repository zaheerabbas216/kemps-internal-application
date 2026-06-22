import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';

const Login = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');

    if (!username.trim() || !password.trim()) {
      setError('Please enter both username and password.');
      return;
    }

    setLoading(true);

    try {
      const response = await api.post('/auth/login', {
        username: username.trim(),
        password: password
      });

      if (response.data.ok) {
        localStorage.setItem('kemps_logged_in', 'true');
        localStorage.setItem('kemps_username', response.data.user.username);
        localStorage.setItem('kemps_name', response.data.user.name || response.data.user.username);
        localStorage.setItem('kemps_auth_token', response.data.token);
        navigate('/customer');
      } else {
        setError(response.data.error || 'Invalid username or password.');
      }
    } catch (err) {
      console.error('Login error details:', err);
      setError(err.response?.data?.error || err.message || 'An error occurred during sign in.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-screen flex items-center justify-center bg-[#090f1d] relative overflow-hidden font-['Inter',_sans-serif]">
      {/* Background blobs for premium glow effect */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-blue-500/10 rounded-full blur-[140px] pointer-events-none"></div>

      <div className="w-full max-w-[440px] px-6 z-10">
        {/* Brand Logo & Header */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 bg-primary rounded-2xl flex items-center justify-center text-white font-black text-2xl shadow-xl shadow-primary/30 italic mb-4">
            K
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight leading-none italic">
            Kemp's<span className="text-primary">.</span>
          </h1>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-2">
            Inventory Management System
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-[#111827]/80 backdrop-blur-xl border border-slate-800/80 rounded-3xl p-8 shadow-[0_25px_60px_rgba(0,0,0,0.4)]">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-slate-100">Welcome Back</h2>
            <p className="text-xs text-slate-400 mt-1">Please sign in to access your administrative dashboard.</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            {/* Username Input */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-400 block uppercase tracking-wider">
                Username
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-sm">👤</span>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter username"
                  className="w-full h-12 pl-11 pr-4 rounded-xl border border-slate-800 bg-[#161d2a]/80 text-slate-100 placeholder-slate-500 focus:bg-[#161d2a] focus:border-primary/80 focus:ring-4 focus:ring-primary/10 transition-all duration-200 outline-none text-sm font-medium"
                  required
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-400 block uppercase tracking-wider">
                Password
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-sm">🔒</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className="w-full h-12 pl-11 pr-4 rounded-xl border border-slate-800 bg-[#161d2a]/80 text-slate-100 placeholder-slate-500 focus:bg-[#161d2a] focus:border-primary/80 focus:ring-4 focus:ring-primary/10 transition-all duration-200 outline-none text-sm font-medium"
                  required
                />
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-500/10 text-red-400 px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 border border-red-500/20 animate-fade-in">
                <span>⚠️</span>
                <span>{error}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-xl bg-primary hover:bg-blue-600 text-white font-bold text-sm shadow-lg shadow-primary/20 flex items-center justify-center gap-2 transition-all duration-300 active:scale-95"
            >
              {loading ? (
                <span className="loading loading-spinner text-white"></span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>
        </div>

        {/* Bottom footer credit */}
        <p className="text-center text-slate-500 text-[10px] font-semibold uppercase tracking-widest mt-8">
          Authorized Personnel Only
        </p>
      </div>
    </div>
  );
};

export default Login;
