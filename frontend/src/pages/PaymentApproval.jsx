import React, { useState, useEffect, useCallback } from 'react';
import api from '../api/axios';

// ─── Helpers ────────────────────────────────
const fmt = (n) =>
  `₹${parseFloat(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

const fmtDate = (d) => {
  if (!d) return '—';
  const parts = String(d).split('T')[0].split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return d;
};

const fmtDateTime = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const yyyy = dt.getFullYear();
  const hh = String(dt.getHours()).padStart(2, '0');
  const min = String(dt.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
};

const istToday = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const ist = new Date(now.getTime() + (330 + offset) * 60000);
  return ist.toISOString().split('T')[0];
};

const MODULE_LABELS = {
  Billing: { label: 'Billing', icon: '🧾', color: 'bg-sky-50 text-sky-700 border-sky-200' },
  Expense: { label: 'Expense', icon: '💸', color: 'bg-orange-50 text-orange-700 border-orange-200' },
  CanDeposit: { label: 'Can Deposit', icon: '🥤', color: 'bg-teal-50 text-teal-700 border-teal-200' },
  CreditBalance: { label: 'Credit Collection', icon: '🏷️', color: 'bg-violet-50 text-violet-700 border-violet-200' },
  SupplierPayment: { label: 'Supplier Payment', icon: '💳', color: 'bg-rose-50 text-rose-700 border-rose-200' },
};

const STATUS_STYLES = {
  Pending: 'bg-amber-50 text-amber-700 border-amber-200',
  Approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Rejected: 'bg-red-50 text-red-700 border-red-200',
};

const TYPE_STYLES = {
  'Cash In': 'text-emerald-600',
  'Cash Out': 'text-red-500',
};

// ─── Summary Card ────────────────────────────
const SummaryCard = ({ icon, label, value, subValue, colorClass, badgeBg }) => (
  <div className={`rounded-2xl border p-5 flex items-center gap-4 bg-white shadow-sm ${colorClass || 'border-slate-200'}`}>
    <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0 ${badgeBg}`}>
      {icon}
    </div>
    <div className="min-w-0">
      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-tight">{label}</p>
      <h3 className="text-lg font-extrabold text-slate-800 mt-0.5 leading-tight truncate">{value}</h3>
      {subValue && <p className="text-[10px] text-slate-400 font-semibold mt-0.5">{subValue}</p>}
    </div>
  </div>
);

// ─── Transaction Card ────────────────────────
const TransactionCard = ({ entry, onApprove, onReject, onView }) => {
  const mod = MODULE_LABELS[entry.source_module] || { label: entry.source_module, icon: '💰', color: 'bg-slate-50 text-slate-700 border-slate-200' };
  const isIn = entry.transaction_type === 'Cash In';
  const isPending = entry.status === 'Pending';

  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all duration-200 hover:shadow-md ${
      isPending ? 'border-amber-200' : entry.status === 'Approved' ? 'border-emerald-200' : 'border-red-200'
    }`}>
      {/* Card Header */}
      <div className={`flex items-center justify-between px-5 py-3 border-b ${
        isPending ? 'bg-amber-50/60 border-amber-100' :
        entry.status === 'Approved' ? 'bg-emerald-50/60 border-emerald-100' :
        'bg-red-50/60 border-red-100'
      }`}>
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-extrabold ${mod.color}`}>
            <span>{mod.icon}</span> {mod.label}
          </span>
          <span className={`text-xs font-black tracking-wider uppercase ${TYPE_STYLES[entry.transaction_type]}`}>
            {isIn ? '▲' : '▼'} {entry.transaction_type}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-1 rounded-lg border text-[10px] font-extrabold uppercase tracking-wider ${STATUS_STYLES[entry.status]}`}>
            {entry.status === 'Pending' ? '⏳' : entry.status === 'Approved' ? '✔' : '✕'} {entry.status}
          </span>
        </div>
      </div>

      {/* Card Body */}
      <div className="px-5 py-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-3 text-xs">
        <div>
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Transaction ID</p>
          <p className="font-bold text-primary mt-0.5">{entry.approval_id}</p>
        </div>
        <div>
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Reference No</p>
          <p className="font-bold text-slate-700 mt-0.5">{entry.reference_no || '—'}</p>
        </div>
        <div>
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
            {entry.transaction_type === 'Cash In' ? 'Customer' : 'Vendor / By'}
          </p>
          <p className="font-bold text-slate-800 mt-0.5 truncate">{entry.party_name || '—'}</p>
        </div>
        <div>
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Payment Method</p>
          <p className="font-bold text-slate-700 mt-0.5">{entry.payment_method || '—'}</p>
        </div>
        {(parseFloat(entry.cash_amount) > 0 || parseFloat(entry.upi_amount) > 0 || parseFloat(entry.bank_amount) > 0) && (
          <div className="col-span-2 md:col-span-1">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Payment Breakdown</p>
            <div className="flex flex-wrap gap-1.5 mt-0.5">
              {parseFloat(entry.cash_amount) > 0 && (
                <span className="px-1.5 py-0.5 bg-green-50 border border-green-200 rounded text-[10px] font-bold text-green-700">
                  Cash: {fmt(entry.cash_amount)}
                </span>
              )}
              {parseFloat(entry.upi_amount) > 0 && (
                <span className="px-1.5 py-0.5 bg-blue-50 border border-blue-200 rounded text-[10px] font-bold text-blue-700">
                  UPI: {fmt(entry.upi_amount)}
                </span>
              )}
              {parseFloat(entry.bank_amount) > 0 && (
                <span className="px-1.5 py-0.5 bg-indigo-50 border border-indigo-200 rounded text-[10px] font-bold text-indigo-700">
                  Bank: {fmt(entry.bank_amount)}
                </span>
              )}
            </div>
          </div>
        )}
        <div>
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Date</p>
          <p className="font-bold text-slate-700 mt-0.5">{fmtDate(entry.transaction_date)}</p>
        </div>
        <div>
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Entered By</p>
          <p className="font-bold text-slate-700 mt-0.5">{entry.entered_by || '—'}</p>
        </div>
        {entry.description && (
          <div className="col-span-2 md:col-span-3 lg:col-span-4">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Description</p>
            <p className="font-semibold text-slate-600 mt-0.5 text-[11px]">{entry.description}</p>
          </div>
        )}
        {entry.status === 'Rejected' && entry.rejection_reason && (
          <div className="col-span-2 md:col-span-3 lg:col-span-4">
            <p className="text-[9px] font-black text-red-400 uppercase tracking-widest">Rejection Reason</p>
            <p className="font-bold text-red-600 mt-0.5 text-[11px]">{entry.rejection_reason}</p>
            <p className="text-[9px] text-slate-400 mt-0.5">By {entry.rejected_by} at {fmtDateTime(entry.rejected_at)}</p>
          </div>
        )}
        {entry.status === 'Approved' && (
          <div className="col-span-2 md:col-span-3 lg:col-span-4">
            <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Approved By</p>
            <p className="font-bold text-emerald-700 mt-0.5 text-[11px]">{entry.approved_by} at {fmtDateTime(entry.approved_at)}</p>
          </div>
        )}
      </div>

      {/* Amount & Actions Footer */}
      <div className="px-5 py-3 bg-slate-50/60 border-t border-slate-100 flex items-center justify-between gap-4">
        <div>
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total Amount</p>
          <p className={`text-xl font-black mt-0.5 ${isIn ? 'text-emerald-600' : 'text-red-500'}`}>
            {isIn ? '+' : '-'}{fmt(entry.amount)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onView(entry)}
            className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 text-xs font-bold transition-all"
          >
            👁 Details
          </button>
          {isPending && (
            <>
              <button
                onClick={() => onApprove(entry)}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-sm shadow-emerald-200 active:scale-95"
              >
                ✔ Approve
              </button>
              <button
                onClick={() => onReject(entry)}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-all shadow-sm shadow-red-200 active:scale-95"
              >
                ✕ Reject
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Main Component ──────────────────────────
const PaymentApproval = () => {
  // Summary
  const [summary, setSummary] = useState({
    totalPending: 0, pendingCashIn: 0, pendingCashOut: 0,
    approvedCashIn: 0, approvedCashOut: 0, currentBalance: 0, totalRejected: 0
  });

  // List
  const [approvals, setApprovals] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState('Pending');
  const [typeFilter, setTypeFilter] = useState('All');
  const [moduleFilter, setModuleFilter] = useState('All');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [search, setSearch] = useState('');

  // Daily summary tab
  const [activeTab, setActiveTab] = useState('approvals'); // 'approvals' | 'cashLedger' | 'dailySummary'
  const [dailyDate, setDailyDate] = useState(istToday());
  const [dailySummary, setDailySummary] = useState(null);
  const [dailyLoading, setDailyLoading] = useState(false);

  // Cash ledger tab
  const [ledger, setLedger] = useState([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerStart, setLedgerStart] = useState('');
  const [ledgerEnd, setLedgerEnd] = useState('');

  // Modals
  const [viewEntry, setViewEntry] = useState(null);
  const [approveEntry, setApproveEntry] = useState(null);
  const [rejectEntry, setRejectEntry] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchSummary = useCallback(async () => {
    try {
      const res = await api.get('/payment-approval/summary');
      if (res.data.ok) setSummary(res.data.summary);
    } catch (e) { console.error(e); }
  }, []);

  const fetchApprovals = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/payment-approval', {
        params: {
          status: statusFilter,
          transactionType: typeFilter,
          sourceModule: moduleFilter,
          startDate,
          endDate,
          search,
          page: 1,
          limit: 100
        }
      });
      if (res.data.ok) {
        setApprovals(res.data.approvals || []);
        setTotal(res.data.total || 0);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [statusFilter, typeFilter, moduleFilter, startDate, endDate, search]);

  const fetchDailySummary = useCallback(async () => {
    setDailyLoading(true);
    try {
      const res = await api.get('/payment-approval/daily-summary', { params: { date: dailyDate } });
      if (res.data.ok) setDailySummary(res.data);
    } catch (e) { console.error(e); }
    finally { setDailyLoading(false); }
  }, [dailyDate]);

  const fetchLedger = useCallback(async () => {
    setLedgerLoading(true);
    try {
      const res = await api.get('/payment-approval/cash-ledger', {
        params: { startDate: ledgerStart, endDate: ledgerEnd, page: 1, limit: 200 }
      });
      if (res.data.ok) setLedger(res.data.ledger || []);
    } catch (e) { console.error(e); }
    finally { setLedgerLoading(false); }
  }, [ledgerStart, ledgerEnd]);

  useEffect(() => { fetchSummary(); fetchApprovals(); }, [fetchSummary, fetchApprovals]);
  useEffect(() => { if (activeTab === 'dailySummary') fetchDailySummary(); }, [activeTab, fetchDailySummary]);
  useEffect(() => { if (activeTab === 'cashLedger') fetchLedger(); }, [activeTab, fetchLedger]);

  const handleApprove = async () => {
    if (!approveEntry) return;
    setActionLoading(true);
    try {
      const res = await api.put(`/payment-approval/${approveEntry.approval_id}/approve`);
      if (res.data.ok) {
        showToast(`✔ Approved! New cash balance: ${fmt(res.data.closingBalance)}`);
        setApproveEntry(null);
        fetchSummary(); fetchApprovals();
      } else {
        showToast(res.data.error || 'Approval failed.', 'error');
      }
    } catch (e) {
      showToast(e.response?.data?.error || 'Approval failed.', 'error');
    } finally { setActionLoading(false); }
  };

  const handleReject = async () => {
    if (!rejectEntry || !rejectReason.trim()) { showToast('Please enter a rejection reason.', 'error'); return; }
    setActionLoading(true);
    try {
      const res = await api.put(`/payment-approval/${rejectEntry.approval_id}/reject`, { rejectionReason: rejectReason });
      if (res.data.ok) {
        showToast('✕ Transaction rejected.');
        setRejectEntry(null);
        setRejectReason('');
        fetchSummary(); fetchApprovals();
      } else {
        showToast(res.data.error || 'Rejection failed.', 'error');
      }
    } catch (e) {
      showToast(e.response?.data?.error || 'Rejection failed.', 'error');
    } finally { setActionLoading(false); }
  };

  const handlePrintDailySummary = () => {
    window.print();
  };

  const clearFilters = () => {
    setStatusFilter('Pending'); setTypeFilter('All'); setModuleFilter('All');
    setStartDate(''); setEndDate(''); setSearch('');
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto pb-16 pt-8">
      
      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 px-5 py-3 rounded-2xl shadow-2xl border text-sm font-bold animate-fade-in ${
          toast.type === 'error' ? 'bg-red-600 text-white border-red-500' : 'bg-emerald-600 text-white border-emerald-500'
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase flex items-center gap-3">
            💰 Payment Approval
            {summary.totalPending > 0 && (
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-500 text-white text-xs font-black shadow-md shadow-amber-200">
                {summary.totalPending}
              </span>
            )}
          </h1>
          <p className="text-slate-500 text-sm font-medium mt-1">
            Approve or reject all financial transactions before they affect the cash ledger
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('approvals')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all border ${activeTab === 'approvals' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
          >
            📋 Transactions
          </button>
          <button
            onClick={() => setActiveTab('cashLedger')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all border ${activeTab === 'cashLedger' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
          >
            📒 Cash Ledger
          </button>
          <button
            onClick={() => setActiveTab('dailySummary')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all border ${activeTab === 'dailySummary' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
          >
            📅 Daily Summary
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <SummaryCard icon="⏳" label="Total Pending" value={summary.totalPending} badgeBg="bg-amber-50" colorClass="border-amber-200" />
        <SummaryCard icon="▲" label="Pending Cash In" value={fmt(summary.pendingCashIn)} badgeBg="bg-emerald-50" colorClass="border-emerald-200" />
        <SummaryCard icon="▼" label="Pending Cash Out" value={fmt(summary.pendingCashOut)} badgeBg="bg-red-50" colorClass="border-red-200" />
        <SummaryCard icon="✔" label="Today's Approved In" value={fmt(summary.approvedCashIn)} badgeBg="bg-green-50" colorClass="border-green-200" />
        <SummaryCard icon="✔" label="Today's Approved Out" value={fmt(summary.approvedCashOut)} badgeBg="bg-rose-50" colorClass="border-rose-200" />
        <SummaryCard icon="💵" label="Cash Balance" value={fmt(summary.currentBalance)} badgeBg="bg-blue-50" colorClass="border-blue-300" />
        <SummaryCard icon="✕" label="Total Rejected" value={summary.totalRejected} badgeBg="bg-slate-100" colorClass="border-slate-200" />
      </div>

      {/* ── APPROVALS TAB ── */}
      {activeTab === 'approvals' && (
        <>
          {/* Filters */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-4 shadow-sm">
            {/* Status + Type + Module */}
            <div className="flex flex-wrap gap-2">
              {/* Status */}
              {['All', 'Pending', 'Approved', 'Rejected'].map(s => (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${statusFilter === s ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                  {s === 'Pending' ? '⏳' : s === 'Approved' ? '✔' : s === 'Rejected' ? '✕' : '📋'} {s}
                </button>
              ))}
              <div className="h-6 border-l border-slate-200 mx-1 self-center" />
              {/* Type */}
              {['All', 'Cash In', 'Cash Out'].map(t => (
                <button key={t} onClick={() => setTypeFilter(t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${typeFilter === t ? (t === 'Cash In' ? 'bg-emerald-600 text-white border-emerald-600' : t === 'Cash Out' ? 'bg-red-600 text-white border-red-600' : 'bg-slate-900 text-white border-slate-900') : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                  {t === 'Cash In' ? '▲' : t === 'Cash Out' ? '▼' : ''} {t}
                </button>
              ))}
              <div className="h-6 border-l border-slate-200 mx-1 self-center" />
              {/* Module */}
              {['All', 'Billing', 'Expense', 'CanDeposit', 'CreditBalance', 'SupplierPayment'].map(m => {
                const mod = MODULE_LABELS[m];
                return (
                  <button key={m} onClick={() => setModuleFilter(m)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${moduleFilter === m ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                    {mod?.icon || '📋'} {mod?.label || m}
                  </button>
                );
              })}
            </div>

            {/* Date + Search */}
            <div className="flex flex-wrap gap-3 items-center">
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">From</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                  className="h-9 px-3 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-slate-50 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">To</label>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                  className="h-9 px-3 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-slate-50 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" />
              </div>
              <div className="relative flex-1 min-w-52">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
                <input type="text" placeholder="Search by ID, reference, customer, vendor..."
                  value={search} onChange={e => setSearch(e.target.value)}
                  className="w-full h-9 pl-9 pr-4 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-slate-50/50 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" />
              </div>
              <button onClick={clearFilters}
                className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all">
                Clear
              </button>
              <div className="ml-auto text-[11px] font-bold text-slate-500">
                {total} transaction{total !== 1 ? 's' : ''}
              </div>
            </div>
          </div>

          {/* Transaction Cards */}
          {loading ? (
            <div className="flex items-center justify-center h-40 text-slate-400 font-semibold">
              Loading transactions...
            </div>
          ) : approvals.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center shadow-sm">
              <div className="text-5xl mb-4">💰</div>
              <h3 className="text-lg font-black text-slate-700">No Transactions Found</h3>
              <p className="text-slate-400 text-sm font-medium mt-1">
                {statusFilter === 'Pending'
                  ? 'No pending transactions. All caught up! ✔'
                  : 'Try adjusting your filters to see more results.'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {approvals.map(entry => (
                <TransactionCard
                  key={entry.approval_id}
                  entry={entry}
                  onApprove={setApproveEntry}
                  onReject={(e) => { setRejectEntry(e); setRejectReason(''); }}
                  onView={setViewEntry}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── CASH LEDGER TAB ── */}
      {activeTab === 'cashLedger' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-wrap gap-3 items-center shadow-sm">
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">From</label>
              <input type="date" value={ledgerStart} onChange={e => setLedgerStart(e.target.value)}
                className="h-9 px-3 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-slate-50 focus:outline-none focus:border-primary" />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">To</label>
              <input type="date" value={ledgerEnd} onChange={e => setLedgerEnd(e.target.value)}
                className="h-9 px-3 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-slate-50 focus:outline-none focus:border-primary" />
            </div>
            <button onClick={fetchLedger}
              className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold transition-all hover:bg-slate-800">
              🔄 Refresh
            </button>
            <div className="ml-auto text-[11px] font-bold text-slate-500">{ledger.length} entries</div>
          </div>

          {ledgerLoading ? (
            <div className="h-40 flex items-center justify-center text-slate-400 font-semibold">Loading...</div>
          ) : ledger.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center shadow-sm">
              <div className="text-4xl mb-3">📒</div>
              <p className="font-bold text-slate-500">No ledger entries found.</p>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black text-slate-500 uppercase tracking-wider">
                      <th className="py-3.5 px-4">Approval ID</th>
                      <th className="py-3.5 px-4">Reference</th>
                      <th className="py-3.5 px-4">Source</th>
                      <th className="py-3.5 px-4">Type</th>
                      <th className="py-3.5 px-4">Description</th>
                      <th className="py-3.5 px-4 text-right">Amount</th>
                      <th className="py-3.5 px-4 text-right">Opening</th>
                      <th className="py-3.5 px-4 text-right">Closing</th>
                      <th className="py-3.5 px-4">Approved By</th>
                      <th className="py-3.5 px-4">Date & Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs font-semibold text-slate-700">
                    {ledger.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-3 px-4 font-bold text-primary">{row.approval_id}</td>
                        <td className="py-3 px-4">{row.reference_no || '—'}</td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded border text-[10px] font-extrabold ${MODULE_LABELS[row.source_module]?.color || 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                            {MODULE_LABELS[row.source_module]?.icon} {MODULE_LABELS[row.source_module]?.label || row.source_module}
                          </span>
                        </td>
                        <td className={`py-3 px-4 font-extrabold ${TYPE_STYLES[row.type]}`}>{row.type}</td>
                        <td className="py-3 px-4 text-slate-500 text-[11px] max-w-48 truncate">{row.description}</td>
                        <td className={`py-3 px-4 text-right font-black ${row.type === 'Cash In' ? 'text-emerald-600' : 'text-red-500'}`}>
                          {row.type === 'Cash In' ? '+' : '-'}{fmt(row.amount)}
                        </td>
                        <td className="py-3 px-4 text-right text-slate-600">{fmt(row.opening_balance)}</td>
                        <td className="py-3 px-4 text-right font-black text-slate-800">{fmt(row.closing_balance)}</td>
                        <td className="py-3 px-4">{row.approved_by}</td>
                        <td className="py-3 px-4 text-slate-500">{fmtDateTime(row.approved_at_fmt || row.approved_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── DAILY SUMMARY TAB ── */}
      {activeTab === 'dailySummary' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-wrap gap-3 items-center shadow-sm">
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Date</label>
              <input type="date" value={dailyDate} onChange={e => setDailyDate(e.target.value)}
                className="h-9 px-3 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-slate-50 focus:outline-none focus:border-primary" />
            </div>
            <button onClick={fetchDailySummary}
              className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-all">
              📅 Load
            </button>
            <button onClick={handlePrintDailySummary}
              className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 transition-all">
              🖨 Print
            </button>
          </div>

          {dailyLoading ? (
            <div className="h-40 flex items-center justify-center text-slate-400 font-semibold">Loading...</div>
          ) : dailySummary ? (
            <div className="space-y-4">
              {/* Summary Box */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <h2 className="text-sm font-black text-slate-700 uppercase tracking-widest mb-5">
                  Daily Cash Report — {fmtDate(dailySummary.date)}
                </h2>
                <div className="max-w-sm space-y-2 font-mono text-sm">
                  <div className="flex justify-between items-center py-2 border-b border-dashed border-slate-200">
                    <span className="font-bold text-slate-600">Opening Balance</span>
                    <span className="font-black text-slate-800">{fmt(dailySummary.openingBalance)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="font-bold text-emerald-600">+ Approved Cash In</span>
                    <span className="font-black text-emerald-600">{fmt(dailySummary.cashIn)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="font-bold text-red-500">- Approved Cash Out</span>
                    <span className="font-black text-red-500">{fmt(dailySummary.cashOut)}</span>
                  </div>
                  <div className="flex justify-between items-center py-3 border-t-2 border-slate-800">
                    <span className="font-black text-slate-800 uppercase tracking-wider text-base">Closing Balance</span>
                    <span className="font-black text-slate-900 text-lg">{fmt(dailySummary.closingBalance)}</span>
                  </div>
                </div>
              </div>

              {/* Day's Entries */}
              {dailySummary.entries && dailySummary.entries.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100">
                    <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest">
                      Transactions on {fmtDate(dailySummary.date)} ({dailySummary.entries.length})
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black text-slate-500 uppercase tracking-wider">
                          <th className="py-3 px-4">#</th>
                          <th className="py-3 px-4">Approval ID</th>
                          <th className="py-3 px-4">Reference</th>
                          <th className="py-3 px-4">Source</th>
                          <th className="py-3 px-4">Type</th>
                          <th className="py-3 px-4 text-right">Amount</th>
                          <th className="py-3 px-4 text-right">Balance After</th>
                          <th className="py-3 px-4">Time</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs font-semibold">
                        {dailySummary.entries.map((e, i) => (
                          <tr key={e.id} className="hover:bg-slate-50/40">
                            <td className="py-2.5 px-4 text-slate-400 font-bold">{i + 1}</td>
                            <td className="py-2.5 px-4 font-bold text-primary">{e.approval_id}</td>
                            <td className="py-2.5 px-4">{e.reference_no || '—'}</td>
                            <td className="py-2.5 px-4">
                              <span className={`px-2 py-0.5 rounded border text-[10px] font-extrabold ${MODULE_LABELS[e.source_module]?.color || 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                                {MODULE_LABELS[e.source_module]?.icon} {MODULE_LABELS[e.source_module]?.label || e.source_module}
                              </span>
                            </td>
                            <td className={`py-2.5 px-4 font-extrabold ${TYPE_STYLES[e.type]}`}>{e.type}</td>
                            <td className={`py-2.5 px-4 text-right font-black ${e.type === 'Cash In' ? 'text-emerald-600' : 'text-red-500'}`}>
                              {e.type === 'Cash In' ? '+' : '-'}{fmt(e.amount)}
                            </td>
                            <td className="py-2.5 px-4 text-right font-black text-slate-800">{fmt(e.closing_balance)}</td>
                            <td className="py-2.5 px-4 text-slate-500">
                              {e.approved_at_fmt ? e.approved_at_fmt.split(' ')[1] : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {dailySummary.entries && dailySummary.entries.length === 0 && (
                <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center shadow-sm">
                  <p className="font-bold text-slate-500">No approved transactions on this date.</p>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* ── VIEW DETAILS MODAL ── */}
      {viewEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-fade-in p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto relative">
            <div className="p-7">
              <button onClick={() => setViewEntry(null)}
                className="absolute top-4 right-4 w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 text-slate-500 hover:bg-slate-100 flex items-center justify-center font-bold text-sm transition-all">
                ✕
              </button>
              <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                💰 Payment Transaction Details
              </h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">{viewEntry.approval_id}</p>

              <div className="mt-6 border border-slate-200 rounded-2xl overflow-hidden">
                {[
                  ['Transaction ID', viewEntry.approval_id],
                  ['Type', viewEntry.transaction_type],
                  ['Source Module', MODULE_LABELS[viewEntry.source_module]?.label || viewEntry.source_module],
                  ['Reference No', viewEntry.reference_no || '—'],
                  ['Party Name', viewEntry.party_name || '—'],
                  ['Description', viewEntry.description || '—'],
                  ['Payment Method', viewEntry.payment_method || '—'],
                  ['Cash Amount', fmt(viewEntry.cash_amount)],
                  ['UPI Amount', fmt(viewEntry.upi_amount)],
                  ['Bank Amount', fmt(viewEntry.bank_amount)],
                  ['Total Amount', fmt(viewEntry.amount)],
                  ['Date', fmtDate(viewEntry.transaction_date)],
                  ['Entered By', viewEntry.entered_by || '—'],
                  ['Remarks', viewEntry.remarks || '—'],
                  ['Status', viewEntry.status],
                  ...(viewEntry.approved_by ? [['Approved By', `${viewEntry.approved_by} at ${fmtDateTime(viewEntry.approved_at)}`]] : []),
                  ...(viewEntry.rejected_by ? [['Rejected By', `${viewEntry.rejected_by} at ${fmtDateTime(viewEntry.rejected_at)}`]] : []),
                  ...(viewEntry.rejection_reason ? [['Rejection Reason', viewEntry.rejection_reason]] : []),
                ].map(([label, value], i) => (
                  <div key={i} className={`flex text-xs ${i % 2 === 0 ? 'bg-slate-50/50' : 'bg-white'} border-b last:border-b-0 border-slate-100`}>
                    <div className="w-40 px-4 py-2.5 font-black text-slate-500 uppercase text-[9px] tracking-widest shrink-0 border-r border-slate-100">
                      {label}
                    </div>
                    <div className="px-4 py-2.5 font-bold text-slate-800 flex-1">{value}</div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end mt-6">
                <button onClick={() => setViewEntry(null)}
                  className="px-6 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-all">
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── APPROVE MODAL ── */}
      {approveEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-fade-in p-4">
          <div className="bg-white rounded-3xl border border-emerald-200 shadow-2xl w-full max-w-md p-7">
            <div className="w-14 h-14 bg-emerald-100 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4">✔</div>
            <h3 className="text-lg font-black text-slate-800 text-center uppercase">Approve Transaction?</h3>
            <p className="text-slate-500 text-sm font-medium text-center mt-2">
              This will update the cash ledger and cannot be undone.
            </p>
            <div className="mt-5 p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="font-bold text-slate-500">Reference</span>
                <span className="font-bold text-slate-800">{approveEntry.reference_no || approveEntry.approval_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-bold text-slate-500">Party</span>
                <span className="font-bold text-slate-800">{approveEntry.party_name || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-bold text-slate-500">Amount</span>
                <span className={`font-black text-base ${approveEntry.transaction_type === 'Cash In' ? 'text-emerald-600' : 'text-red-500'}`}>
                  {approveEntry.transaction_type === 'Cash In' ? '+' : '-'}{fmt(approveEntry.amount)}
                </span>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setApproveEntry(null)} disabled={actionLoading}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 transition-all">
                Cancel
              </button>
              <button onClick={handleApprove} disabled={actionLoading}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm transition-all active:scale-95 shadow-sm shadow-emerald-200">
                {actionLoading ? 'Approving...' : '✔ Yes, Approve'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── REJECT MODAL ── */}
      {rejectEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-fade-in p-4">
          <div className="bg-white rounded-3xl border border-red-200 shadow-2xl w-full max-w-md p-7">
            <div className="w-14 h-14 bg-red-100 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4">✕</div>
            <h3 className="text-lg font-black text-slate-800 text-center uppercase">Reject Transaction?</h3>
            <p className="text-slate-500 text-sm font-medium text-center mt-2">
              Please provide a reason. This transaction will not affect the cash balance.
            </p>
            <div className="mt-5 p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="font-bold text-slate-500">Reference</span>
                <span className="font-bold text-slate-800">{rejectEntry.reference_no || rejectEntry.approval_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-bold text-slate-500">Amount</span>
                <span className="font-black text-red-500">{fmt(rejectEntry.amount)}</span>
              </div>
            </div>
            <div className="mt-4">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">
                Rejection Reason *
              </label>
              <textarea
                rows={3}
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="Enter reason for rejection..."
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 bg-slate-50 focus:outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 resize-none"
              />
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => { setRejectEntry(null); setRejectReason(''); }} disabled={actionLoading}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 transition-all">
                Cancel
              </button>
              <button onClick={handleReject} disabled={actionLoading || !rejectReason.trim()}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold text-sm transition-all active:scale-95 shadow-sm shadow-red-200">
                {actionLoading ? 'Rejecting...' : '✕ Yes, Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default PaymentApproval;
