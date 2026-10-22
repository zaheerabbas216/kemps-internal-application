import React, { useState, useEffect, useRef } from 'react';
import { Outlet, useLocation, NavLink, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useAuth } from '../../context/AuthContext';
import { useSSEStatus } from '../../hooks/useSSE';
import { usePushNotification } from '../../hooks/usePushNotification';

const Layout = () => {
  const showInsecurePushBanner = false;
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isSuperAdmin, logout, getFirstPermittedPath } = useAuth();
  const { status: sseStatus, reconnect: reconnectSSE } = useSSEStatus();
  // Manage browser push notifications
  const { supported: pushSupported, secureContextRequired: pushHttpsRequired, permission: pushPermission, subscribed: pushSubscribed, subscribe: subscribePush } = usePushNotification({ autoPrompt: true });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    return localStorage.getItem('kemps_sidebar_collapsed') === 'true';
  });
  const [avatarOpen, setAvatarOpen] = useState(false);
  const avatarRef = useRef(null);

  const fullName = user?.name || user?.username || 'User';
  const roleName = isSuperAdmin ? 'Superadmin' : (user?.role_name || 'User');
  const userInitials = fullName
    .split(' ')
    .map(w => w.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'US';

  useEffect(() => {
    localStorage.setItem('kemps_sidebar_collapsed', isCollapsed);
  }, [isCollapsed]);

  // Close avatar dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (avatarRef.current && !avatarRef.current.contains(e.target)) {
        setAvatarOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    logout();
  };

  // Dynamic page title based on path
  const getPageTitle = () => {
    const path = location.pathname.substring(1);
    if (!path) return 'Dashboard';
    return path.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  const getFormattedDate = () => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const date = new Date();
    return `${days[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]}, ${date.getFullYear()}`;
  };

  // Hook to handle responsive keyboard fields and tables data-labels
  useEffect(() => {
    const optimizeInputsAndTables = () => {
      // 1. Map Table Headers to Data-Labels for Responsive Cards
      const tables = document.querySelectorAll('table:not(.table-no-responsive)');
      tables.forEach(table => {
        const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent.trim());
        if (headers.length === 0) return;
        
        const rows = table.querySelectorAll('tbody tr');
        rows.forEach(row => {
          const cells = row.querySelectorAll('td');
          cells.forEach((cell, index) => {
            const label = headers[index] || '';
            if (label && !cell.getAttribute('data-label')) {
              cell.setAttribute('data-label', label);
            }
          });
        });
      });

      // 2. Optimize Input Fields with proper keyboard layout types
      const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])');
      inputs.forEach(input => {
        const name = (input.getAttribute('name') || '').toLowerCase();
        const id = (input.getAttribute('id') || '').toLowerCase();
        const placeholder = (input.getAttribute('placeholder') || '').toLowerCase();

        // Phone fields
        if (name.includes('phone') || name.includes('mobile') || name.includes('tel') || id.includes('phone') || id.includes('mobile')) {
          if (input.getAttribute('type') !== 'tel') {
            input.setAttribute('type', 'tel');
          }
        }
        // Numeric/Amount fields
        else if (
          name.includes('amount') || name.includes('price') || name.includes('rate') || 
          name.includes('quantity') || name.includes('qty') || name.includes('total') || 
          name.includes('paid') || name.includes('due') || 
          id.includes('amount') || id.includes('price') || id.includes('rate') || 
          id.includes('quantity') || id.includes('qty') || id.includes('total')
        ) {
          if (input.getAttribute('type') !== 'number' && input.getAttribute('type') !== 'date') {
            input.setAttribute('inputmode', 'decimal');
          }
        }
        // Date fields
        else if (name.includes('date') || id.includes('date') || placeholder.includes('date')) {
          if (input.getAttribute('type') === 'text' || !input.getAttribute('type')) {
            input.setAttribute('type', 'date');
          }
        }
      });
    };

    optimizeInputsAndTables();

    const observer = new MutationObserver(() => {
      optimizeInputsAndTables();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    return () => observer.disconnect();
  }, [location.pathname]);

  const cleanHeaderPaths = ['/company-details', '/product-master', '/bank-deposit'];
  const isCleanHeader = cleanHeaderPaths.includes(location.pathname);

  return (
    <div className="flex h-screen max-h-screen w-screen overflow-hidden bg-[#f8fbff] relative">
      {/* Sidebar Drawer Container */}
      <div className={`
        fixed inset-y-0 left-0 z-50 transform lg:translate-x-0 lg:static lg:block
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        transition-all duration-300 ease-in-out shrink-0 h-full
        ${isCollapsed ? 'w-20' : 'w-72'}
      `}>
        <Sidebar 
          onClose={() => setIsSidebarOpen(false)} 
          isCollapsed={isCollapsed}
          onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
        />
      </div>

      {/* Drawer Overlay */}
      {isSidebarOpen && (
        <div 
          onClick={() => setIsSidebarOpen(false)} 
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 lg:hidden"
        ></div>
      )}

      {/* Main Panel */}
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden bg-[#f8fbff]">
        {/* Push Notification Permission Prompt Banner */}
        {/* Case 1: Secure context required (plain HTTP LAN) */}
        {showInsecurePushBanner && pushHttpsRequired && (
          <div className="bg-gradient-to-r from-amber-900 via-amber-800 to-amber-900 text-white px-4 py-2.5 flex items-center justify-between gap-3 text-xs sm:text-sm border-b border-amber-500/40 z-30 shrink-0 shadow-md">
            <div className="flex items-center gap-2">
              <span className="text-base shrink-0">🔒</span>
              <span className="font-medium text-amber-100">
                Push notifications require HTTPS. You&apos;re on a local network — use the
                <a href="https://kmps-fed-fullstack-application.bitwizard.online" className="underline font-bold text-white ml-1 hover:text-amber-200" target="_blank" rel="noreferrer">production URL</a> to enable them.
              </span>
            </div>
          </div>
        )}
        {/* Case 2: Permission denied — guide user to reset */}
        {!pushHttpsRequired && pushSupported && pushPermission === 'denied' && (
          <div className="bg-gradient-to-r from-rose-900 via-rose-800 to-rose-900 text-white px-4 py-2.5 flex items-center justify-between gap-3 text-xs sm:text-sm border-b border-rose-500/40 z-30 shrink-0 shadow-md">
            <div className="flex items-center gap-2">
              <span className="text-base shrink-0">🚫</span>
              <span className="font-medium text-rose-100">
                Notifications are blocked. Click the 🔒 lock icon in your browser address bar → <strong>Notifications</strong> → set to <strong>Allow</strong>, then reload.
              </span>
            </div>
          </div>
        )}
        {/* Case 3: Permission not yet asked — show enable button */}
        {!pushHttpsRequired && pushSupported && pushPermission === 'default' && !pushSubscribed && (
          <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white px-4 py-2.5 flex items-center justify-between gap-3 text-xs sm:text-sm border-b border-indigo-500/30 z-30 shrink-0 shadow-md">
            <div className="flex items-center gap-2.5">
              <span className="text-base animate-bounce">🔔</span>
              <span className="font-semibold text-slate-100">
                Enable Push Notifications for real-time IMP Work task alerts even when your browser is closed.
              </span>
            </div>
            <button
              onClick={() => subscribePush().catch(() => {})}
              className="bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white font-extrabold px-3 py-1.5 rounded-xl text-xs transition-all shadow-sm shrink-0"
            >
              Enable Notifications
            </button>
          </div>
        )}

        <header className="h-20 bg-white/80 backdrop-blur-md border-b border-slate-200/50 flex items-center justify-between px-3 sm:px-6 md:px-10 shrink-0 z-20 flex-nowrap">
          {/* Mobile Hamburg & Logo */}
          <div className="flex items-center gap-2 sm:gap-3 lg:hidden shrink-0">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-700 font-extrabold text-base sm:text-lg active:scale-95 transition-all"
            >
              ☰
            </button>
            <div 
              onClick={() => navigate(getFirstPermittedPath())}
              className="text-sm sm:text-base font-extrabold text-[#0f172a] tracking-tight leading-none italic cursor-pointer flex items-center gap-1.5"
            >
              <div className="w-7 h-7 sm:w-8 sm:h-8 bg-primary rounded-lg flex items-center justify-center text-white font-black text-xs sm:text-sm italic shadow-md shadow-primary/30">
                K
              </div>
              <span className="hidden xs:inline">Kemp's<span className="text-primary">.</span></span>
            </div>
          </div>

          {/* Desktop Title */}
          <div className="hidden lg:block shrink-0">
            {isCleanHeader ? (
              <h2 className="text-[15px] font-bold text-[#0f172a] tracking-tight">{getPageTitle()}</h2>
            ) : (
              <>
                <h2 className="text-xl font-extrabold text-[#0f172a] tracking-tight">{getPageTitle()}</h2>
                <nav className="flex items-center gap-2 text-xs font-medium text-slate-400 mt-0.5">
                  <span>Home</span>
                  <span>/</span>
                  <span className="text-slate-600">{getPageTitle()}</span>
                </nav>
              </>
            )}
          </div>

          {/* Header Right — Server Status & Responsive Profile Dropdown */}
          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            {isCleanHeader ? (
              <div className="text-xs sm:text-[13px] font-semibold text-[#0f172a] hidden sm:block font-medium">
                {getFormattedDate()}
              </div>
            ) : (
              <>
                <div 
                  onClick={reconnectSSE}
                  title="Click to check or reconnect live server connection"
                  className="flex items-center gap-1.5 sm:gap-3 bg-slate-50 px-2 sm:px-4 py-1.5 sm:py-2 rounded-xl border border-slate-100 cursor-pointer hover:bg-slate-100/70 transition-all"
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${
                    sseStatus === 'CONNECTED' 
                      ? 'bg-emerald-500 animate-pulse' 
                      : sseStatus === 'RECONNECTING' 
                        ? 'bg-amber-500 animate-pulse' 
                        : 'bg-slate-400'
                  }`}></span>
                  <span className="text-[10px] sm:text-[11px] font-bold text-slate-600 uppercase tracking-wider hidden sm:inline">
                    {sseStatus === 'CONNECTED' ? 'Server Live' : sseStatus === 'RECONNECTING' ? 'Reconnecting...' : 'Server Offline'}
                  </span>
                </div>
                <button
                  onClick={() => window.location.reload()}
                  className="hidden md:inline-flex btn-premium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs px-4 h-10 min-h-0"
                >
                  Refresh Data
                </button>
              </>
            )}

            {/* Avatar dropdown (Interactive on all screen sizes) */}
            <div className="relative" ref={avatarRef}>
              <button
                onClick={() => setAvatarOpen(v => !v)}
                className="flex items-center gap-1.5 sm:gap-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 p-1.5 sm:px-3 sm:py-2 rounded-xl transition-all duration-200 active:scale-95"
                aria-label="User Profile Menu"
              >
                <div className="w-7 h-7 sm:w-7 sm:h-7 bg-primary/10 rounded-full flex items-center justify-center text-primary font-bold text-xs shrink-0">
                  {userInitials}
                </div>
                <div className="text-left hidden sm:block">
                  <p className="text-xs font-bold text-slate-700 leading-none">{fullName}</p>
                  <p className="text-[10px] text-slate-400 font-medium mt-0.5">{roleName}</p>
                </div>
                <span className={`text-slate-400 text-[10px] transition-transform duration-200 ${avatarOpen ? 'rotate-180' : ''}`}>▼</span>
              </button>

              {avatarOpen && (
                <div className="absolute right-0 top-[calc(100%+8px)] w-56 sm:w-52 bg-white border border-slate-200 rounded-2xl shadow-xl p-1.5 z-50 animate-fade-in">
                  <div className="px-3 py-2.5 border-b border-slate-100 mb-1">
                    <p className="text-xs font-bold text-slate-800 truncate">{fullName}</p>
                    <p className="text-[10px] text-slate-400 font-medium truncate mt-0.5">{roleName}</p>
                  </div>
                  <button
                    onClick={() => { setAvatarOpen(false); navigate('/change-password'); }}
                    className="w-full text-left px-3 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 rounded-xl transition-all flex items-center gap-2 active:bg-slate-100"
                  >
                    <span>🔑</span> Change Password
                  </button>
                  <button
                    onClick={() => { setAvatarOpen(false); handleLogout(); }}
                    className="w-full text-left px-3 py-2.5 text-xs font-semibold text-red-500 hover:bg-red-50 rounded-xl transition-all flex items-center gap-2 active:bg-red-100"
                  >
                    <span>➔</span> Log Out
                  </button>
                </div>
              )}
            </div>
          </div>

        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-10 pb-24 md:pb-10 w-full min-w-0">
          <Outlet />
        </main>
      </div>

      {/* Bottom Navigation for Mobile */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-white/95 backdrop-blur-md border-t border-slate-200/60 z-30 flex items-center justify-around px-2 shadow-[0_-4px_12px_rgba(0,0,0,0.03)] pb-safe">
        <NavLink 
          to="/dashboard" 
          className={({ isActive }) => `flex flex-col items-center justify-center text-[10px] font-extrabold transition-all ${isActive ? 'text-primary' : 'text-slate-400'}`}
        >
          <span className="text-xl">🏠</span>
          <span className="mt-0.5">Home</span>
        </NavLink>
        <NavLink 
          to="/billing" 
          className={({ isActive }) => `flex flex-col items-center justify-center text-[10px] font-extrabold transition-all ${isActive ? 'text-primary' : 'text-slate-400'}`}
        >
          <span className="text-xl">🧾</span>
          <span className="mt-0.5">Bill</span>
        </NavLink>
        <NavLink 
          to="/total-sales" 
          className={({ isActive }) => `flex flex-col items-center justify-center text-[10px] font-extrabold transition-all ${isActive ? 'text-primary' : 'text-slate-400'}`}
        >
          <span className="text-xl">📊</span>
          <span className="mt-0.5">Reports</span>
        </NavLink>
      </div>
    </div>
  );
};

export default Layout;
