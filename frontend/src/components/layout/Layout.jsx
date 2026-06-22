import React, { useState, useEffect } from 'react';
import { Outlet, useLocation, NavLink, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import api from '../../api/axios';

const Layout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

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

  useEffect(() => {
    const fetchPendingCount = async () => {
      const isLoggedIn = localStorage.getItem('kemps_logged_in') === 'true';
      if (!isLoggedIn) return;
      try {
        const res = await api.get('/payment-approval/summary');
        if (res.data.ok && res.data.summary) {
          setPendingCount(res.data.summary.totalPending || 0);
        }
      } catch (err) {
        console.error('Failed to fetch pending approval summary in layout header:', err);
      }
    };
    fetchPendingCount();
    const interval = setInterval(fetchPendingCount, 60000);
    return () => clearInterval(interval);
  }, [location.pathname]);

  useEffect(() => {
    const optimizeInputsAndTables = () => {
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

      const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])');
      inputs.forEach(input => {
        const name = (input.getAttribute('name') || '').toLowerCase();
        const id = (input.getAttribute('id') || '').toLowerCase();
        const placeholder = (input.getAttribute('placeholder') || '').toLowerCase();

        if (name.includes('phone') || name.includes('mobile') || name.includes('tel') || id.includes('phone') || id.includes('mobile')) {
          if (input.getAttribute('type') !== 'tel') {
            input.setAttribute('type', 'tel');
          }
        } else if (
          name.includes('amount') || name.includes('price') || name.includes('rate') ||
          name.includes('quantity') || name.includes('qty') || name.includes('total') ||
          name.includes('paid') || name.includes('due') ||
          id.includes('amount') || id.includes('price') || id.includes('rate') ||
          id.includes('quantity') || id.includes('qty') || id.includes('total')
        ) {
          if (input.getAttribute('type') !== 'number' && input.getAttribute('type') !== 'date') {
            input.setAttribute('inputmode', 'decimal');
          }
        } else if (name.includes('date') || id.includes('date') || placeholder.includes('date')) {
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
    <div className="flex min-h-screen relative overflow-x-hidden">
      <div className={`fixed inset-y-0 left-0 z-50 transform lg:translate-x-0 lg:static lg:block ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} transition-transform duration-300 ease-in-out w-72 shrink-0`}>
        <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      </div>

      {isSidebarOpen && (
        <div onClick={() => setIsSidebarOpen(false)} className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 lg:hidden"></div>
      )}

      <div className="flex-1 flex flex-col bg-[#f8fbff] min-w-0">
        <header className="h-20 bg-white/80 backdrop-blur-md border-b border-slate-200/50 flex items-center justify-between px-4 sm:px-6 md:px-10 sticky top-0 z-20">
          <div className="flex items-center gap-3 lg:hidden">
            <button onClick={() => setIsSidebarOpen(true)} className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-700 font-extrabold text-lg active:scale-95 transition-all">☰</button>
            <div onClick={() => navigate('/dashboard')} className="text-base font-extrabold text-[#0f172a] tracking-tight leading-none italic cursor-pointer flex items-center gap-1.5">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-white font-black text-sm italic shadow-md shadow-primary/30">K</div>
              <span>Kemp&apos;s<span className="text-primary">.</span></span>
            </div>
          </div>

          <div className="hidden lg:block">
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

          <div className="hidden md:flex items-center gap-4">
            {isCleanHeader ? (
              <div className="text-[13px] font-semibold text-slate-400">{getFormattedDate()}</div>
            ) : (
              <div className="flex items-center gap-4">
                <div className="text-[13px] font-semibold text-slate-400">{getFormattedDate()}</div>
                <div className="flex items-center gap-2">
                  <button onClick={() => navigate('/payment-approval')} className="relative btn btn-ghost btn-xs text-slate-500 hover:bg-slate-100 rounded-xl px-3 py-2">
                    <span className="text-base">🔔</span>
                    {pendingCount > 0 && <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">{pendingCount}</span>}
                  </button>
                </div>
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;
