import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getISTDateStr() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const ist = new Date(now.getTime() + (330 + offset) * 60000);
  const yyyy = ist.getFullYear();
  const mm = String(ist.getMonth() + 1).padStart(2, '0');
  const dd = String(ist.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatINR(val) {
  const n = parseFloat(val) || 0;
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function getGreeting() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const ist = new Date(now.getTime() + (330 + offset) * 60000);
  const h = ist.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatFullDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function formatTime(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

function formatDateDDMMYYYY(s) {
  if (!s) return '—';
  const p = String(s).split('-');
  if (p.length === 3) return `${p[2]}/${p[1]}/${p[0]}`;
  return s;
}

function formatDateTime(s) {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d)) return s;
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const PRIORITY_STYLES = {
  Low:    'bg-slate-100 text-slate-600 border-slate-200',
  Normal: 'bg-blue-50 text-blue-600 border-blue-100',
  High:   'bg-amber-50 text-amber-600 border-amber-100',
  Urgent: 'bg-red-50 text-red-600 border-red-100',
};

const PRIORITY_DOT = {
  Low:    'bg-slate-400',
  Normal: 'bg-blue-500',
  High:   'bg-amber-500',
  Urgent: 'bg-red-500',
};

// ─── Quick Access tiles ────────────────────────────────────────────────────────

const quickTiles = [
  { label: 'Billing',       sub: 'Create invoices',    icon: '🧾', path: '/billing',             bg: 'bg-blue-50',    iconBg: 'bg-blue-100 text-blue-600' },
  { label: 'Expense',       sub: 'Track expenses',      icon: '💸', path: '/expense',             bg: 'bg-red-50',     iconBg: 'bg-red-100 text-red-600' },
  { label: 'Inventory',     sub: 'Stock entry',         icon: '📦', path: '/inventory',           bg: 'bg-purple-50',  iconBg: 'bg-purple-100 text-purple-600' },
  { label: 'Loading',       sub: "Today's loading",     icon: '🏪', path: '/loading',             bg: 'bg-sky-50',     iconBg: 'bg-sky-100 text-sky-600' },
  { label: 'Goods Ledger',  sub: 'Live stock',          icon: '📊', path: '/goods-ledger',        bg: 'bg-emerald-50', iconBg: 'bg-emerald-100 text-emerald-600' },
  { label: 'RM Ledger',     sub: 'Raw material stock',  icon: '🪨', path: '/raw-material-ledger', bg: 'bg-amber-50',   iconBg: 'bg-amber-100 text-amber-600' },
  { label: 'Return Stock',  sub: 'Sales returns',       icon: '↩️', path: '/sales-return',        bg: 'bg-rose-50',    iconBg: 'bg-rose-100 text-rose-600' },
  { label: 'Production',    sub: 'Record production',   icon: '🏭', path: '/production-form',     bg: 'bg-cyan-50',    iconBg: 'bg-cyan-100 text-cyan-600' },
  { label: 'Customers',     sub: 'Manage customers',    icon: '👥', path: '/customer',            bg: 'bg-indigo-50',  iconBg: 'bg-indigo-100 text-indigo-600' },
  { label: 'Orders',        sub: 'Function orders',     icon: '🛒', path: '/orders',              bg: 'bg-orange-50',  iconBg: 'bg-orange-100 text-orange-600' },
  { label: 'Can Deposit',   sub: 'Deposit ledger',      icon: '🥤', path: '/can-deposit',         bg: 'bg-teal-50',    iconBg: 'bg-teal-100 text-teal-600' },
  { label: 'Bank Deposit',  sub: 'Bank deposits',       icon: '🏦', path: '/bank-deposit',        bg: 'bg-slate-50',   iconBg: 'bg-slate-100 text-slate-600' },
  { label: 'Maintenance',   sub: 'Service log',         icon: '🔧', path: '/maintenance-form',    bg: 'bg-lime-50',    iconBg: 'bg-lime-100 text-lime-600' },
  { label: 'Supplier Pmts', sub: 'Settle payments',     icon: '💳', path: '/supplier-payments',   bg: 'bg-violet-50',  iconBg: 'bg-violet-100 text-violet-600' },
];

// ─── Main Component ────────────────────────────────────────────────────────────

const Dashboard = () => {
  const navigate = useNavigate();
  const todayStr = getISTDateStr();

  // ── Summary ──────────────────────────────────────────────────────────────────
  const [billingSummary, setBillingSummary] = useState(null);
  const [expenseSummary, setExpenseSummary] = useState(null);
  const [orderWidgets, setOrderWidgets]     = useState(null);
  const [loadingMeta, setLoadingMeta]       = useState(true);

  // ── Today's orders ────────────────────────────────────────────────────────────
  const [todayOrders, setTodayOrders]   = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true);

  // ── Maintenance Due Dates ───────────────────────────────────────────────────
  const [maintenanceDue, setMaintenanceDue] = useState([]);
  const [loadingDue, setLoadingDue] = useState(true);

  // ── Task panel ────────────────────────────────────────────────────────────────
  const [tasks, setTasks]             = useState([]);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [taskForm, setTaskForm]       = useState({ taskText: '', assignedTo: '', createdBy: '', priority: 'Normal' });
  const [taskSaving, setTaskSaving]   = useState(false);
  const [taskError, setTaskError]     = useState('');
  const [completingId, setCompletingId] = useState(null);

  // ── History modal ─────────────────────────────────────────────────────────────
  const [showHistory, setShowHistory]       = useState(false);
  const [historyTasks, setHistoryTasks]     = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // ── Sales & Expense History Modal state ──────────────────────────────────────
  const [showSalesHistory, setShowSalesHistory] = useState(false);
  const [salesHistoryStartDate, setSalesHistoryStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    const offset = d.getTimezoneOffset();
    const ist = new Date(d.getTime() + (330 + offset) * 60000);
    const yyyy = ist.getFullYear();
    const mm = String(ist.getMonth() + 1).padStart(2, '0');
    const dd = String(ist.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });
  const [salesHistoryEndDate, setSalesHistoryEndDate] = useState(todayStr);
  const [salesHistoryData, setSalesHistoryData] = useState([]);
  const [loadingSalesHistory, setLoadingSalesHistory] = useState(false);

  // ── Cash Ledger History Modal state (kept for state compat, data is not fetched) ───────
  const [showCashHistory, setShowCashHistory] = useState(false);
  const [cashHistoryStartDate, setCashHistoryStartDate] = useState(todayStr);
  const [cashHistoryEndDate, setCashHistoryEndDate] = useState(todayStr);
  const [cashHistoryData, setCashHistoryData] = useState([]);
  const [loadingCashHistory, setLoadingCashHistory] = useState(false);

  const username    = localStorage.getItem('kemps_username') || 'Admin';
  const displayName = username.charAt(0).toUpperCase() + username.slice(1);

  // ── Fetchers ──────────────────────────────────────────────────────────────────

  const fetchMeta = useCallback(async () => {
    setLoadingMeta(true);
    const [billRes, expRes, ordRes] = await Promise.allSettled([
      api.get('/billing/today'),
      api.get('/expenses/today'),
      api.get('/orders/dashboard-widgets', { params: { excludeCustomerType: 'Distributor' } }),
    ]);
    if (billRes.status === 'fulfilled' && billRes.value.data.ok) setBillingSummary(billRes.value.data.summary);
    if (expRes.status  === 'fulfilled' && expRes.value.data.ok)  setExpenseSummary(expRes.value.data.summary);
    if (ordRes.status  === 'fulfilled' && ordRes.value.data.ok)  setOrderWidgets(ordRes.value.data.widgets);
    setLoadingMeta(false);
  }, []);

  const fetchTodayOrders = useCallback(async () => {
    setLoadingOrders(true);
    try {
      const res = await api.get('/orders', { params: { status: 'PENDING', startDate: todayStr, endDate: todayStr, limit: 10, excludeCustomerType: 'Distributor' } });
      if (res.data.ok) setTodayOrders(res.data.orders || []);
    } catch (_) {}
    setLoadingOrders(false);
  }, [todayStr]);

  const fetchTodayCash = useCallback(async () => {}, []);

  const fetchTasks = useCallback(async () => {
    setLoadingTasks(true);
    try {
      const res = await api.get('/tasks');
      if (res.data.ok) setTasks(res.data.tasks || []);
    } catch (_) {}
    setLoadingTasks(false);
  }, []);

  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await api.get('/tasks/history', { params: { limit: 50 } });
      if (res.data.ok) setHistoryTasks(res.data.tasks || []);
    } catch (_) {}
    setLoadingHistory(false);
  };

  const fetchSalesHistory = useCallback(async (start = salesHistoryStartDate, end = salesHistoryEndDate) => {
    setLoadingSalesHistory(true);
    try {
      const res = await api.get('/billing/dashboard-history', { params: { startDate: start, endDate: end } });
      if (res.data.ok) {
        setSalesHistoryData(res.data.history || []);
      }
    } catch (_) {}
    setLoadingSalesHistory(false);
  }, [salesHistoryStartDate, salesHistoryEndDate]);

  const fetchCashHistory = useCallback(async () => {}, []);

  const fetchMaintenanceDue = useCallback(async () => {
    setLoadingDue(true);
    try {
      const res = await api.get('/maintenance/due-tracker');
      if (res.data.ok) {
        setMaintenanceDue(res.data.perMachineList || []);
      }
    } catch (_) {}
    setLoadingDue(false);
  }, []);

  useEffect(() => {
    fetchMeta();
    fetchTodayOrders();
    fetchTodayCash();
    fetchTasks();
    fetchMaintenanceDue();
  }, [fetchMeta, fetchTodayOrders, fetchTodayCash, fetchTasks, fetchMaintenanceDue]);

  // ── Task handlers ─────────────────────────────────────────────────────────────

  const handleAddTask = async (e) => {
    e.preventDefault();
    setTaskError('');
    if (!taskForm.taskText.trim())   return setTaskError('Task description is required.');
    if (!taskForm.assignedTo.trim()) return setTaskError('Assigned to is required.');
    if (!taskForm.createdBy.trim())  return setTaskError('Your name is required.');

    setTaskSaving(true);
    try {
      const res = await api.post('/tasks', taskForm);
      if (res.data.ok) {
        setTaskForm({ taskText: '', assignedTo: '', createdBy: displayName, priority: 'Normal' });
        setShowAddForm(false);
        fetchTasks();
      } else {
        setTaskError(res.data.error || 'Failed to add task.');
      }
    } catch (err) {
      setTaskError(err.response?.data?.error || 'Failed to add task.');
    }
    setTaskSaving(false);
  };

  const handleComplete = async (taskId) => {
    setCompletingId(taskId);
    try {
      const res = await api.patch(`/tasks/${taskId}/complete`, { completedBy: displayName });
      if (res.data.ok) fetchTasks();
    } catch (_) {}
    setCompletingId(null);
  };

  const handleDeleteTask = async (taskId) => {
    if (!window.confirm('Delete this task?')) return;
    try {
      await api.delete(`/tasks/${taskId}`);
      fetchTasks();
    } catch (_) {}
  };

  const handleOpenHistory = () => {
    setShowHistory(true);
    fetchHistory();
  };

  const handleOpenSalesHistory = () => {
    setShowSalesHistory(true);
    fetchSalesHistory();
  };

  const handleOpenAddForm = () => {
    setTaskForm(prev => ({ ...prev, createdBy: displayName }));
    setShowAddForm(true);
    setTaskError('');
  };

  // ── Derived numbers ────────────────────────────────────────────────────────────
  const totalSales    = billingSummary ? billingSummary.totalBilled   : 0;
  const totalExpenses = expenseSummary ? expenseSummary.totalAmount   : 0;
  const netForToday   = totalSales - totalExpenses;

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 animate-fade-in pb-12">

      {/* ── TOP: Greeting ────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-2">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            {getGreeting()} <span>👋</span>
          </h1>
          <p className="text-slate-500 text-sm font-medium mt-0.5">
            Kemp's Inventory Management &mdash;&nbsp;
            <span className="text-primary font-semibold">{formatFullDate(todayStr)}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleOpenSalesHistory}
            className="text-[11px] font-bold text-primary bg-blue-50 border border-blue-100 rounded-xl px-4 py-2 hover:text-blue-700 hover:bg-blue-100 transition-all flex items-center gap-1.5 h-11 shadow-sm"
          >
            📈 Sales & Expense History
          </button>
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-4 py-2 shadow-sm h-11">
            <div className="w-8 h-8 rounded-full bg-primary text-white text-sm font-black flex items-center justify-center">
              {displayName.charAt(0)}
            </div>
            <span className="text-sm font-bold text-slate-700">{displayName}</span>
          </div>
        </div>
      </div>

      {/* ── SUMMARY CARDS + TASK PANEL (side by side) ────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

        {/* Summary Cards — left 2/3 */}
        <div className="xl:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* Today's Total Sales */}
          <div className="card-premium relative overflow-hidden">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Today's Total Sales</p>
            </div>
            <p className="text-3xl font-black text-emerald-600 mt-1">{loadingMeta ? '—' : formatINR(totalSales)}</p>
            <p className="text-[11px] text-slate-400 font-medium mt-1.5">Billing + FO + Can Deposit + FCS</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="bg-slate-50 rounded-lg px-2.5 py-1.5 border border-slate-100">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Invoices</p>
                <p className="text-base font-black text-slate-700">{billingSummary ? billingSummary.totalInvoices : '—'}</p>
              </div>
              <div className="bg-slate-50 rounded-lg px-2.5 py-1.5 border border-slate-100">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Credit Due</p>
                <p className="text-base font-black text-red-500">{billingSummary ? formatINR(billingSummary.creditDue) : '—'}</p>
              </div>
            </div>
          </div>

          {/* Today's Total Expense */}
          <div className="card-premium relative overflow-hidden">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></span>
              <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Today's Total Expense</p>
            </div>
            <p className="text-3xl font-black text-red-500 mt-1">{loadingMeta ? '—' : formatINR(totalExpenses)}</p>
            <p className="text-[11px] text-slate-400 font-medium mt-1.5">Expenses + Refunds (RG + TRS)</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="bg-slate-50 rounded-lg px-2.5 py-1.5 border border-slate-100">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Entries</p>
                <p className="text-base font-black text-slate-700">{expenseSummary ? expenseSummary.totalCount : '—'}</p>
              </div>
              <div className="bg-slate-50 rounded-lg px-2.5 py-1.5 border border-slate-100">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Net Cash</p>
                <p className="text-base font-black text-emerald-600">{billingSummary ? formatINR(billingSummary.cashCollected) : '—'}</p>
              </div>
            </div>
          </div>

          {/* Net for Today */}
          <div className="card-premium relative overflow-hidden">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse"></span>
              <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Net for Today</p>
            </div>
            <p className={`text-3xl font-black mt-1 ${loadingMeta ? 'text-slate-400' : netForToday >= 0 ? 'text-primary' : 'text-red-500'}`}>
              {loadingMeta ? '—' : formatINR(netForToday)}
            </p>
            <p className="text-[11px] text-slate-400 font-medium mt-1.5">Sales minus Expenses</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="bg-slate-50 rounded-lg px-2.5 py-1.5 border border-slate-100">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Pending Orders</p>
                <p className="text-base font-black text-amber-600">{orderWidgets ? orderWidgets.pendingCount : '—'}</p>
              </div>
              <div className="bg-slate-50 rounded-lg px-2.5 py-1.5 border border-slate-100">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Supplied Today</p>
                <p className="text-base font-black text-emerald-600">{orderWidgets ? orderWidgets.suppliedToday : '—'}</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── TASK PANEL — right 1/3 ─────────────────────────────────────────── */}
        <div className="xl:col-span-1 flex flex-col rounded-2xl border border-slate-200 shadow-sm overflow-hidden bg-white">
          {/* Dark header */}
          <div className="bg-[#0b1324] px-5 py-3.5 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-base">📋</span>
              <span className="text-white font-black text-sm tracking-wider uppercase">Tasks</span>
              <span className="w-5 h-0.5 bg-blue-400 rounded-full ml-1"></span>
              <span className="text-[11px] font-bold text-slate-400 bg-slate-700 px-2 py-0.5 rounded-full">
                {tasks.length}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleOpenHistory}
                className="text-[10px] font-bold text-slate-400 hover:text-white transition-colors px-2 py-1 rounded-lg hover:bg-white/10"
              >
                History
              </button>
              <button
                onClick={handleOpenAddForm}
                className="bg-primary text-white text-[11px] font-black px-3 py-1.5 rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-1"
              >
                + Add
              </button>
            </div>
          </div>

          {/* Add Task Form */}
          {showAddForm && (
            <div className="border-b border-slate-100 bg-slate-50 p-4 space-y-3">
              <form onSubmit={handleAddTask} className="space-y-2.5">
                <input
                  type="text"
                  placeholder="What needs to be done?"
                  value={taskForm.taskText}
                  onChange={e => setTaskForm(p => ({ ...p, taskText: e.target.value }))}
                  className="w-full h-10 px-3.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all font-medium"
                  autoFocus
                />
                <input
                  type="text"
                  placeholder="Assign to (person's name)"
                  value={taskForm.assignedTo}
                  onChange={e => setTaskForm(p => ({ ...p, assignedTo: e.target.value }))}
                  className="w-full h-10 px-3.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all font-medium"
                />
                <input
                  type="text"
                  placeholder="Your name"
                  value={taskForm.createdBy}
                  onChange={e => setTaskForm(p => ({ ...p, createdBy: e.target.value }))}
                  className="w-full h-10 px-3.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all font-medium"
                />
                {/* Priority */}
                <div className="flex gap-1.5">
                  {['Low', 'Normal', 'High', 'Urgent'].map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setTaskForm(prev => ({ ...prev, priority: p }))}
                      className={`flex-1 text-[10px] font-black py-1.5 rounded-lg border transition-all ${
                        taskForm.priority === p ? PRIORITY_STYLES[p] + ' ring-2 ring-offset-1 ring-current' : 'border-slate-200 text-slate-500 bg-white hover:bg-slate-50'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
                {taskError && (
                  <p className="text-red-500 text-[11px] font-semibold flex items-center gap-1">
                    <span>⚠️</span> {taskError}
                  </p>
                )}
                <div className="flex gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={taskSaving}
                    className="flex-1 h-9 bg-primary text-white text-xs font-black rounded-xl hover:bg-blue-600 transition-colors disabled:opacity-60"
                  >
                    {taskSaving ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowAddForm(false); setTaskError(''); }}
                    className="flex-1 h-9 bg-white border border-slate-200 text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Task List */}
          <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-slate-50 max-h-[340px]">
            {loadingTasks ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <span className="loading loading-spinner text-primary loading-sm"></span>
                <span className="text-xs text-slate-400 font-medium">Loading tasks...</span>
              </div>
            ) : tasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-slate-400">
                <span className="text-2xl">✅</span>
                <span className="text-xs font-medium italic">All tasks completed!</span>
                <button
                  onClick={handleOpenAddForm}
                  className="mt-1 text-[11px] font-bold text-primary hover:underline"
                >
                  + Add a task
                </button>
              </div>
            ) : (
              tasks.map(task => (
                <div key={task.id} className="px-4 py-3 hover:bg-slate-50 transition-colors group">
                  <div className="flex items-start gap-2.5">
                    {/* Priority dot */}
                    <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${PRIORITY_DOT[task.priority] || 'bg-slate-400'}`}></span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-slate-800 leading-snug">{task.task_text}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full border ${PRIORITY_STYLES[task.priority] || ''}`}>
                          {task.priority}
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium">
                          → <span className="font-bold text-slate-600">{task.assigned_to}</span>
                        </span>
                        <span className="text-[10px] text-slate-400 italic">by {task.created_by}</span>
                      </div>
                    </div>
                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleComplete(task.id)}
                        disabled={completingId === task.id}
                        title="Mark complete"
                        className="w-7 h-7 flex items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors text-sm disabled:opacity-50"
                      >
                        {completingId === task.id ? '…' : '✓'}
                      </button>
                      <button
                        onClick={() => handleDeleteTask(task.id)}
                        title="Delete task"
                        className="w-7 h-7 flex items-center justify-center rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors text-xs font-black"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── MIDDLE ROW: Today's Orders + Quick Access ─────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* Today's Function Orders */}
        <div className="lg:col-span-2 card-premium flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-black text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                <span>🛒</span> Today's Function Orders
              </h2>
              <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                Party name &amp; supply timing &mdash; {todayOrders.length} order{todayOrders.length !== 1 ? 's' : ''} today
              </p>
            </div>
            <button
              onClick={() => navigate('/orders')}
              className="text-[11px] font-bold text-primary hover:text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-1.5 transition-colors"
            >
              View All →
            </button>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto max-h-[260px] custom-scrollbar pr-0.5">
            {loadingOrders ? (
              <div className="flex flex-col items-center justify-center h-24 gap-2">
                <span className="loading loading-spinner text-primary loading-sm"></span>
                <span className="text-xs text-slate-400 font-medium">Loading orders...</span>
              </div>
            ) : todayOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-24 text-slate-400 gap-1">
                <span className="text-2xl">📋</span>
                <span className="text-xs font-medium italic">No function orders for today</span>
              </div>
            ) : (
              todayOrders.map(ord => (
                <div key={ord.id} className="flex items-start justify-between gap-3 bg-slate-50 border border-slate-100 rounded-xl px-3.5 py-2.5 hover:border-primary/30 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800 truncate">{ord.customer_name}</p>
                    <p className="text-[11px] text-slate-500 font-medium truncate">{ord.delivery_address || ord.customer_address || '—'}</p>
                    <p className="text-[11px] text-primary font-bold mt-0.5">{ord.customer_type}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-black text-slate-700">{formatTime(ord.supply_time)}</p>
                    <p className="text-[11px] text-emerald-600 font-bold">{formatINR(ord.grand_total)}</p>
                    <span className="text-[9px] bg-amber-100 text-amber-700 font-black px-1.5 py-0.5 rounded-full uppercase">PENDING</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Quick Access Grid */}
        <div className="lg:col-span-3 card-premium">
          <h2 className="text-sm font-black text-slate-800 uppercase tracking-wide flex items-center gap-1.5 mb-4">
            <span>⚡</span> Quick Access
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
            {quickTiles.map(tile => (
              <button
                key={tile.label}
                onClick={() => navigate(tile.path)}
                className={`${tile.bg} rounded-2xl p-3 flex flex-col items-center text-center gap-1.5 hover:shadow-md border border-white hover:border-slate-200 transition-all active:scale-95`}
              >
                <div className={`${tile.iconBg} w-9 h-9 rounded-xl flex items-center justify-center text-lg`}>
                  {tile.icon}
                </div>
                <div>
                  <p className="text-[12px] font-black text-slate-800 leading-tight">{tile.label}</p>
                  <p className="text-[10px] text-slate-500 font-medium leading-tight mt-0.5">{tile.sub}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Upcoming Maintenance Due Dates ────────────────────────────────────── */}
      <div className="card-premium">
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-black text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
              <span>🔧</span> Upcoming Maintenance Due Dates
            </h2>
            <p className="text-[11px] text-slate-400 font-medium mt-0.5">
              Scheduled services and machine maintenance due dates
            </p>
          </div>
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-2.5 py-1 rounded-md border border-slate-100">
            {maintenanceDue.length} {maintenanceDue.length === 1 ? 'Machine' : 'Machines'}
          </span>
        </div>

        {loadingDue ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <span className="loading loading-spinner text-primary loading-sm"></span>
            <span className="text-xs text-slate-400 font-medium">Loading upcoming maintenance...</span>
          </div>
        ) : maintenanceDue.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-xs italic font-semibold">
            No upcoming maintenance due dates
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-3 pt-1 scrollbar-thin snap-x">
            {maintenanceDue.map((item) => (
              <div
                key={item.id}
                className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm min-w-[260px] max-w-[280px] flex-1 flex flex-col justify-between hover:shadow-md transition-shadow snap-start"
              >
                <div className="space-y-3">
                  {/* Service Date */}
                  <div>
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Service Date</span>
                    <span className="text-xs font-semibold text-slate-700">{formatDateDDMMYYYY(item.service_date)}</span>
                  </div>

                  {/* Particular Type */}
                  <div>
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Particular Type</span>
                    <span className="text-sm font-extrabold text-slate-800">{item.particular}</span>
                  </div>

                  {/* Sub Detail / Company */}
                  <div>
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Sub Detail / Company</span>
                    <span className="text-xs text-slate-500 font-medium truncate block" title={`${item.sub_detail || ''} ${item.company ? `+ ${item.company}` : ''}`}>
                      {item.sub_detail || '—'} {item.company ? `+ ${item.company}` : ''}
                    </span>
                  </div>

                  {/* Next Due Date */}
                  <div className="pt-2 border-t border-slate-100">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Next Due Date</span>
                    <span className="text-xs font-black text-red-500">{formatDateDDMMYYYY(item.next_due_date)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── TASK HISTORY MODAL ───────────────────────────────────────────────── */}
      {showHistory && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.2)] border border-slate-200 w-[680px] max-h-[80vh] flex flex-col overflow-hidden animate-fade-in">
            {/* Header */}
            <div className="bg-[#0b1324] px-7 py-5 text-white flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-xl font-black uppercase tracking-tight">✅ Task History</h3>
                <p className="text-slate-400 text-xs mt-0.5 font-medium">All completed tasks — most recent first</p>
              </div>
              <button
                onClick={() => setShowHistory(false)}
                className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-all font-bold"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {loadingHistory ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <span className="loading loading-spinner text-primary"></span>
                  <span className="text-sm text-slate-400 font-medium">Loading history...</span>
                </div>
              ) : historyTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
                  <span className="text-4xl">📋</span>
                  <span className="text-sm font-medium italic">No completed tasks yet</span>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {historyTasks.map(task => (
                    <div key={task.id} className="px-7 py-4 hover:bg-slate-50 transition-colors">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs font-black shrink-0 mt-0.5">
                            ✓
                          </div>
                          <div>
                            <p className="text-[14px] font-semibold text-slate-800">{task.task_text}</p>
                            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                              <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full border ${PRIORITY_STYLES[task.priority] || ''}`}>{task.priority}</span>
                              <span className="text-[11px] text-slate-500 font-medium">Assigned to: <span className="font-bold text-slate-700">{task.assigned_to}</span></span>
                              <span className="text-[11px] text-slate-400 italic">by {task.created_by}</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[10px] text-emerald-600 font-bold">Completed by {task.completed_by}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">{formatDateTime(task.completed_at)}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">Created: {formatDateTime(task.created_at)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-5 border-t border-slate-100 shrink-0">
              <button
                onClick={() => setShowHistory(false)}
                className="w-full h-11 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── SALES & EXPENSE HISTORY MODAL ────────────────────────────────────── */}
      {showSalesHistory && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.2)] border border-slate-200 w-[720px] max-h-[85vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="bg-[#0b1324] px-7 py-5 text-white flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-xl font-black uppercase tracking-tight">📈 Sales & Expense History</h3>
                <p className="text-slate-400 text-xs mt-0.5 font-medium">Daily aggregated billing and expense totals</p>
              </div>
              <button
                onClick={() => setShowSalesHistory(false)}
                className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-all font-bold"
              >
                ✕
              </button>
            </div>

            {/* Date Filters */}
            <div className="grid grid-cols-2 gap-4 p-5 bg-slate-50 border-b border-slate-100 shrink-0">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Start Date</label>
                <input
                  type="date"
                  value={salesHistoryStartDate}
                  onChange={(e) => {
                    setSalesHistoryStartDate(e.target.value);
                    fetchSalesHistory(e.target.value, salesHistoryEndDate);
                  }}
                  className="w-full h-10 px-3.5 border border-slate-200 rounded-xl text-xs bg-white font-semibold outline-none focus:border-primary transition-all"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">End Date</label>
                <input
                  type="date"
                  value={salesHistoryEndDate}
                  onChange={(e) => {
                    setSalesHistoryEndDate(e.target.value);
                    fetchSalesHistory(salesHistoryStartDate, e.target.value);
                  }}
                  className="w-full h-10 px-3.5 border border-slate-200 rounded-xl text-xs bg-white font-semibold outline-none focus:border-primary transition-all"
                />
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
              {loadingSalesHistory ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <span className="loading loading-spinner text-primary"></span>
                  <span className="text-sm text-slate-400 font-medium">Loading sales history...</span>
                </div>
              ) : salesHistoryData.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-2">
                  <span className="text-4xl">📊</span>
                  <span className="text-sm font-medium italic">No sales or expenses found for this range</span>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-150">
                  <table className="table table-zebra w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-150 text-[10px] font-black uppercase tracking-wider text-slate-550">
                      <tr>
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-4 text-right">Total Sales</th>
                        <th className="py-3 px-4 text-right">Total Expenses</th>
                        <th className="py-3 px-4 text-right">Net Profit/Sales</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs font-semibold text-slate-700">
                      {salesHistoryData.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/40 transition-colors">
                          <td className="py-3 px-4 font-bold text-slate-600">{formatDateDDMMYYYY(row.date)}</td>
                          <td className="py-3 px-4 text-right text-emerald-600 font-extrabold">{formatINR(row.totalSales)}</td>
                          <td className="py-3 px-4 text-right text-red-500 font-extrabold">{formatINR(row.totalExpenses)}</td>
                          <td className={`py-3 px-4 text-right font-black ${row.netSales >= 0 ? 'text-primary' : 'text-red-550'}`}>
                            {formatINR(row.netSales)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-5 border-t border-slate-100 shrink-0">
              <button
                onClick={() => setShowSalesHistory(false)}
                className="w-full h-11 bg-slate-100 text-slate-655 font-bold rounded-xl hover:bg-slate-200 transition-colors text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Dashboard;
