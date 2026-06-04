import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';

const Layout = () => {
  const location = useLocation();

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

  const cleanHeaderPaths = ['/company-details', '/product-master'];
  const isCleanHeader = cleanHeaderPaths.includes(location.pathname);

  return (
    <div className="flex min-h-screen">
      <Sidebar />

      <div className="flex-1 flex flex-col bg-[#f8fbff]">
        <header className="h-20 bg-white/80 backdrop-blur-md border-b border-slate-200/50 flex items-center justify-between px-10 sticky top-0 z-20">
          {isCleanHeader ? (
            <>
              <div>
                <h2 className="text-[15px] font-bold text-[#0f172a] tracking-tight">{getPageTitle()}</h2>
              </div>
              <div className="text-[13px] font-semibold text-slate-400">
                {getFormattedDate()}
              </div>
            </>
          ) : (
            <>
              <div>
                <h2 className="text-xl font-extrabold text-[#0f172a] tracking-tight">{getPageTitle()}</h2>
                <nav className="flex items-center gap-2 text-xs font-medium text-slate-400 mt-0.5">
                  <span>Home</span>
                  <span>/</span>
                  <span className="text-slate-600">{getPageTitle()}</span>
                </nav>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-3 bg-slate-50 px-4 py-2 rounded-xl border border-slate-100">
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                  <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Server Online</span>
                </div>
                <button className="btn-premium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs px-4 h-10 min-h-0">
                  Refresh Data
                </button>
              </div>
            </>
          )}
        </header>

        <main className="p-10 max-w-[1200px]">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;
