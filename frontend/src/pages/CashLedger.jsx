import React, { useState, useEffect, useCallback } from 'react';
import api from '../api/axios';

// ── colour maps ────────────────────────────────────────────────────────────
const MODULE_BADGE = {
  'Opening Balance':    'bg-amber-50 text-amber-700 border-amber-200 font-black',
  'Cash Submitted':     'bg-emerald-100 text-emerald-800 border-emerald-300 font-black',
  'Billing':            'bg-blue-50 text-blue-700 border-blue-100',
  'Credit Payment':     'bg-violet-50 text-violet-700 border-violet-100',
  'Can Supply':         'bg-cyan-50 text-cyan-700 border-cyan-100',
  'Can Deposit':        'bg-teal-50 text-teal-700 border-teal-100',
  'Expense':            'bg-red-50 text-red-600 border-red-100',
  'Can Deposit Return': 'bg-orange-50 text-orange-700 border-orange-100',
};

const METHOD_BADGE = {
  cash:             'bg-emerald-50 text-emerald-700 border-emerald-100',
  upi:              'bg-indigo-50 text-indigo-700 border-indigo-100',
  bank:             'bg-sky-50 text-sky-700 border-sky-100',
  'credit balance': 'bg-violet-100 text-violet-800 border-violet-300 font-black',
  'credit adjust':  'bg-violet-100 text-violet-800 border-violet-300 font-black',
  'credit adjustment': 'bg-violet-100 text-violet-800 border-violet-300 font-black',
};

// ── helpers ────────────────────────────────────────────────────────────────
const formatINR = (val) =>
  `₹ ${parseFloat(val || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`;

const fmt = (dateStr) => {
  if (!dateStr) return '—';
  const [y, m, d] = String(dateStr).split('T')[0].split('-');
  return `${d}/${m}/${y}`;
};

const todayIST = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const ist = new Date(now.getTime() + (330 + offset) * 60000);
  return `${ist.getFullYear()}-${String(ist.getMonth()+1).padStart(2,'0')}-${String(ist.getDate()).padStart(2,'0')}`;
};

// ── component ──────────────────────────────────────────────────────────────
const CashLedger = () => {
  const today = todayIST();
  const isAdmin = (localStorage.getItem('kemps_username') || '').toLowerCase() === 'admin';

  // Active view tab: 'ledger' | 'history'
  const [activeTab, setActiveTab] = useState('ledger');

  // Daily Ledger state
  const [startDate, setStartDate]     = useState(today);
  const [endDate, setEndDate]         = useState(today);
  const [search, setSearch]           = useState('');
  const [method, setMethod]           = useState('All');   // All | Cash | UPI | Bank
  const [flowType, setFlowType]       = useState('all');   // all | in | out
  const [currentPage, setCurrentPage] = useState(1);
  const limit = 20;

  const [entries, setEntries]   = useState([]);
  const [total, setTotal]       = useState(0);
  const [summary, setSummary]   = useState(null);
  const [loading, setLoading]   = useState(false);

  // Counter Cash Submitted input & feedback state
  const [cashSubmittedInput, setCashSubmittedInput] = useState('');
  const [submittingCash, setSubmittingCash]         = useState(false);
  const [submitFeedback, setSubmitFeedback]         = useState({ type: '', message: '' });

  // History Tab state
  const [historyList, setHistoryList]         = useState([]);
  const [historyTotal, setHistoryTotal]       = useState(0);
  const [historyPage, setHistoryPage]         = useState(1);
  const [historySearch, setHistorySearch]     = useState('');
  const [historyStart, setHistoryStart]       = useState('');
  const [historyEnd, setHistoryEnd]           = useState('');
  const [loadingHistory, setLoadingHistory]   = useState(false);

  // Modals
  const [isOpeningModalOpen, setIsOpeningModalOpen] = useState(false);
  const [openingForm, setOpeningForm] = useState({
    entryDate: today,
    cashAmount: '',
    upiAmount: '',
    bankAmount: '',
    remarks: ''
  });
  const [openingSaving, setOpeningSaving]   = useState(false);
  const [openingError, setOpeningError]     = useState('');
  const [openingSuccess, setOpeningSuccess] = useState('');

  // Close Day Confirmation Modal
  const [isCloseDayModalOpen, setIsCloseDayModalOpen] = useState(false);
  const [closingDay, setClosingDay]                   = useState(false);
  const [closeDayMessage, setCloseDayMessage]         = useState('');

  // View Detailed Day Report Modal
  const [isViewReportModalOpen, setIsViewReportModalOpen] = useState(false);
  const [selectedReport, setSelectedReport]               = useState(null);
  const [loadingReport, setLoadingReport]                 = useState(false);

  // Transaction Entry View Modal
  const [selectedTxn, setSelectedTxn]             = useState(null);
  const [txnDetailsData, setTxnDetailsData]       = useState(null);
  const [loadingTxnDetails, setLoadingTxnDetails] = useState(false);

  const handleViewTxnDetails = async (txn) => {
    setSelectedTxn(txn);
    setTxnDetailsData(null);
    if (txn.source_module === 'Billing' && txn.ref_id) {
      setLoadingTxnDetails(true);
      try {
        const res = await api.get(`/billing/${txn.ref_id}`);
        if (res.data.ok) {
          setTxnDetailsData(res.data);
        }
      } catch (err) {
        console.error('Failed to fetch bill details:', err);
      } finally {
        setLoadingTxnDetails(false);
      }
    }
  };

  // ── Fetch Daily Ledger ────────────────────────────────────────────────────
  const fetchLedger = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/cash-ledger', {
        params: { startDate, endDate, search, method, type: flowType, page: currentPage, limit }
      });
      if (res.data.ok) {
        setEntries(res.data.entries || []);
        setTotal(res.data.total || 0);
        const sum = res.data.summary || null;
        setSummary(sum);
      }
    } catch (err) {
      console.error('Cash ledger fetch failed:', err);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, search, method, flowType, currentPage]);

  // ── Fetch Saved History Reports ───────────────────────────────────────────
  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await api.get('/cash-ledger/daily-history', {
        params: {
          page: historyPage,
          limit: 10,
          search: historySearch,
          startDate: historyStart,
          endDate: historyEnd
        }
      });
      if (res.data.ok) {
        setHistoryList(res.data.history || []);
        setHistoryTotal(res.data.total || 0);
      }
    } catch (err) {
      console.error('Failed to fetch daily history:', err);
    } finally {
      setLoadingHistory(false);
    }
  }, [historyPage, historySearch, historyStart, historyEnd]);

  useEffect(() => {
    if (activeTab === 'ledger') {
      fetchLedger();
    } else {
      fetchHistory();
    }
  }, [activeTab, fetchLedger, fetchHistory]);

  const handleFilterChange = (setter) => (e) => {
    setter(e.target.value);
    setCurrentPage(1);
    setSubmitFeedback({ type: '', message: '' });
  };

  // Approve Cash Submitted
  const handleApproveCashSubmitted = async () => {
    setSubmitFeedback({ type: '', message: '' });

    const val = parseFloat(cashSubmittedInput) || 0;
    if (isNaN(val) || val < 0) {
      setSubmitFeedback({ type: 'error', message: 'Cash Submitted cannot be negative.' });
      return;
    }

    const availableNetCash = summary?.netCash || 0;
    if (val > availableNetCash) {
      setSubmitFeedback({
        type: 'error',
        message: 'Cash Submitted cannot be greater than available Net Cash.'
      });
      return;
    }

    setSubmittingCash(true);
    try {
      const payload = {
        ledgerDate: startDate || today,
        cashSubmitted: val,
        submittedBy: localStorage.getItem('kemps_username') || 'admin'
      };

      const res = await api.post('/cash-ledger/cash-submitted', payload);
      if (res.data.ok) {
        setSubmitFeedback({ type: 'success', message: 'Cash submitted successfully.' });
        setCashSubmittedInput('');
        fetchLedger();
      }
    } catch (err) {
      setSubmitFeedback({
        type: 'error',
        message: err.response?.data?.error || err.message || 'Failed to submit cash.'
      });
    } finally {
      setSubmittingCash(false);
    }
  };

  // Delete an individual Cash Submitted entry
  const handleDeleteCashSubmitted = async (id) => {
    if (!window.confirm('Are you sure you want to delete this cash submission entry?')) return;
    try {
      const res = await api.delete(`/cash-ledger/cash-submitted/${id}`);
      if (res.data.ok) {
        fetchLedger();
      }
    } catch (err) {
      console.error('Failed to delete cash submission:', err);
    }
  };

  // Approve a pending Cash Submitted entry (Admin action)
  const handleApprovePendingSubmission = async (id) => {
    try {
      const res = await api.put(`/cash-ledger/cash-submitted/${id}/approve`, {
        approvedBy: localStorage.getItem('kemps_username') || 'admin'
      });
      if (res.data.ok) {
        fetchLedger();
      }
    } catch (err) {
      console.error('Failed to approve cash submission:', err);
      alert(err.response?.data?.error || err.message);
    }
  };

  // Open opening modal and load existing opening data for current startDate
  const handleOpenOpeningModal = async () => {
    setOpeningError('');
    setOpeningSuccess('');
    setOpeningForm({
      entryDate: startDate || today,
      cashAmount: summary?.openingCash ? String(summary.openingCash) : '',
      upiAmount: summary?.openingUpi ? String(summary.openingUpi) : '',
      bankAmount: summary?.openingBank ? String(summary.openingBank) : '',
      remarks: ''
    });

    try {
      const res = await api.get('/cash-ledger/opening', { params: { date: startDate || today } });
      if (res.data.ok && res.data.opening) {
        setOpeningForm({
          entryDate: res.data.opening.entryDate,
          cashAmount: String(res.data.opening.cashAmount || ''),
          upiAmount: String(res.data.opening.upiAmount || ''),
          bankAmount: String(res.data.opening.bankAmount || ''),
          remarks: res.data.opening.remarks || ''
        });
      }
    } catch (err) {
      console.error('Failed to fetch existing opening:', err);
    }

    setIsOpeningModalOpen(true);
  };

  const handleSaveOpening = async (e) => {
    e.preventDefault();
    setOpeningError('');
    setOpeningSuccess('');
    setOpeningSaving(true);

    try {
      const payload = {
        entryDate: openingForm.entryDate,
        cashAmount: parseFloat(openingForm.cashAmount) || 0,
        upiAmount: parseFloat(openingForm.upiAmount) || 0,
        bankAmount: parseFloat(openingForm.bankAmount) || 0,
        remarks: openingForm.remarks,
        createdBy: localStorage.getItem('kemps_username') || 'admin'
      };

      const res = await api.post('/cash-ledger/opening', payload);
      if (res.data.ok) {
        setOpeningSuccess('Opening cash balance saved successfully!');
        setTimeout(() => {
          setIsOpeningModalOpen(false);
          setOpeningSuccess('');
          fetchLedger();
        }, 800);
      }
    } catch (err) {
      setOpeningError(err.response?.data?.error || err.message || 'Failed to save opening balance.');
    } finally {
      setOpeningSaving(false);
    }
  };

  // Close Day Execution
  const handleConfirmCloseDay = async () => {
    setClosingDay(true);
    setCloseDayMessage('');
    try {
      const targetDate = startDate || today;
      const res = await api.post('/cash-ledger/close-day', {
        ledgerDate: targetDate,
        closedBy: localStorage.getItem('kemps_username') || 'admin'
      });

      if (res.data.ok) {
        setCloseDayMessage(res.data.message);
        setTimeout(() => {
          setIsCloseDayModalOpen(false);
          setCloseDayMessage('');
          fetchLedger();
        }, 1500);
      }
    } catch (err) {
      console.error('Close day failed:', err);
    } finally {
      setClosingDay(false);
    }
  };

  // View full detailed report for a specific date
  const handleViewDayReport = async (dateStr) => {
    setLoadingReport(true);
    setIsViewReportModalOpen(true);
    try {
      const res = await api.get(`/cash-ledger/daily-report/${dateStr}`);
      if (res.data.ok) {
        setSelectedReport(res.data.report);
      }
    } catch (err) {
      console.error('Failed to fetch detailed day report:', err);
    } finally {
      setLoadingReport(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const historyPages = Math.max(1, Math.ceil(historyTotal / 10));

  const totalOpening = summary ? summary.totalOpening : 0;
  const totalIn      = summary ? (summary.cashIn + summary.upiIn + summary.bankIn) : 0;
  const totalOut     = summary ? (summary.cashOut + summary.upiOut + summary.bankOut) : 0;
  const netTotal     = summary ? summary.netTotal : 0;
  const counterCash  = summary ? summary.counterCash : 0;

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-fade-in pb-12">

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase flex items-center gap-2">
            <span>💰</span> Cash Ledger
          </h1>
          <p className="text-slate-500 text-sm font-medium mt-1">
            Daily cash ledger, opening management &amp; history reports
          </p>
        </div>
        <div className="flex items-center gap-3">
          {activeTab === 'ledger' && (
            <button
              onClick={handleOpenOpeningModal}
              className="btn-premium bg-amber-500 text-white hover:bg-amber-600 border border-amber-600 text-xs px-4 h-11 font-black flex items-center gap-1.5 shadow-sm"
            >
              <span>💵</span> Set Opening Cash
            </button>
          )}
          <button
            onClick={activeTab === 'ledger' ? fetchLedger : fetchHistory}
            className="btn-premium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs px-4 h-11 font-bold"
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* ── TAB SWITCHER ──────────────────────────────────────────────────── */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('ledger')}
          className={`px-5 py-2.5 rounded-lg text-xs font-black transition-all ${
            activeTab === 'ledger'
              ? 'bg-white text-slate-800 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          📋 Daily Cash Ledger
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-5 py-2.5 rounded-lg text-xs font-black transition-all ${
            activeTab === 'history'
              ? 'bg-white text-slate-800 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          📜 Saved History Reports ({historyTotal})
        </button>
      </div>

      {/* ── TAB 1: DAILY CASH LEDGER ──────────────────────────────────────── */}
      {activeTab === 'ledger' && (
        <>
          {/* TOP 5 SUMMARY CARDS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">

            {/* 1. Opening Balance */}
            <div className="card-premium relative overflow-hidden bg-gradient-to-br from-amber-50/50 to-orange-50/30 border-amber-200">
              <span className="absolute top-3 right-3 text-xl opacity-20">🏦</span>
              <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest flex items-center gap-1">
                <span>Opening Balance</span>
                <button
                  onClick={handleOpenOpeningModal}
                  className="text-[10px] text-amber-600 underline font-bold hover:text-amber-800 ml-1"
                  title="Edit opening balance"
                >
                  (Edit)
                </button>
              </p>
              <p className="text-2xl font-black text-amber-700 mt-1">
                {loading ? '—' : formatINR(totalOpening)}
              </p>
              {summary && (
                <div className="mt-2 space-y-0.5">
                  <p className="text-[10px] text-slate-500 font-semibold">Cash: <span className="text-amber-700 font-bold">{formatINR(summary.openingCash)}</span></p>
                  <p className="text-[10px] text-slate-500 font-semibold">UPI: <span className="text-indigo-600 font-bold">{formatINR(summary.openingUpi)}</span></p>
                  <p className="text-[10px] text-slate-500 font-semibold">Bank: <span className="text-sky-600 font-bold">{formatINR(summary.openingBank)}</span></p>
                </div>
              )}
            </div>

            {/* 2. Total Cash In */}
            <div className="card-premium relative overflow-hidden">
              <span className="absolute top-3 right-3 text-xl opacity-10">⬆️</span>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Cash In</p>
              <p className="text-2xl font-black text-emerald-600 mt-1">
                {loading ? '—' : formatINR(totalIn)}
              </p>
              {summary && (
                <div className="mt-2 space-y-0.5">
                  <p className="text-[10px] text-slate-400 font-semibold">Cash: <span className="text-emerald-600 font-bold">{formatINR(summary.cashIn)}</span></p>
                  <p className="text-[10px] text-slate-400 font-semibold">UPI: <span className="text-indigo-600 font-bold">{formatINR(summary.upiIn)}</span></p>
                  <p className="text-[10px] text-slate-400 font-semibold">Bank: <span className="text-sky-600 font-bold">{formatINR(summary.bankIn)}</span></p>
                </div>
              )}
            </div>

            {/* 3. Total Cash Out */}
            <div className="card-premium relative overflow-hidden">
              <span className="absolute top-3 right-3 text-xl opacity-10">⬇️</span>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Cash Out</p>
              <p className="text-2xl font-black text-red-500 mt-1">
                {loading ? '—' : formatINR(totalOut)}
              </p>
              {summary && (
                <div className="mt-2 space-y-0.5">
                  <p className="text-[10px] text-slate-400 font-semibold">Cash: <span className="text-red-500 font-bold">{formatINR(summary.cashOut)}</span></p>
                  <p className="text-[10px] text-slate-400 font-semibold">UPI: <span className="text-red-400 font-bold">{formatINR(summary.upiOut)}</span></p>
                  <p className="text-[10px] text-slate-400 font-semibold">Bank: <span className="text-red-400 font-bold">{formatINR(summary.bankOut)}</span></p>
                </div>
              )}
            </div>

            {/* 4. Net Closing Balance */}
            <div className="card-premium relative overflow-hidden border-primary/20 bg-blue-50/20">
              <span className="absolute top-3 right-3 text-2xl opacity-10">⚖️</span>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Net Closing Balance</p>
              <p className={`text-2xl font-black mt-1 ${netTotal >= 0 ? 'text-primary' : 'text-red-500'}`}>
                {loading ? '—' : formatINR(netTotal)}
              </p>
              {summary && (
                <div className="mt-2 space-y-0.5">
                  <p className="text-[10px] text-slate-500 font-semibold">Net Cash: <span className={`font-bold ${summary.netCash >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{formatINR(summary.netCash)}</span></p>
                  <p className="text-[10px] text-slate-500 font-semibold">Net UPI: <span className={`font-bold ${summary.netUpi >= 0 ? 'text-indigo-600' : 'text-red-500'}`}>{formatINR(summary.netUpi)}</span></p>
                  <p className="text-[10px] text-slate-500 font-semibold">Bank: <span className={`font-bold ${summary.netBank >= 0 ? 'text-sky-600' : 'text-red-500'}`}>{formatINR(summary.netBank)}</span></p>
                </div>
              )}
            </div>

            {/* 5. Credit Balance Adjusted */}
            <div className="card-premium relative overflow-hidden border-violet-200 bg-violet-50/30">
              <span className="absolute top-3 right-3 text-2xl opacity-20">💳</span>
              <p className="text-[10px] font-black text-violet-700 uppercase tracking-widest">Credit Balance Adjusted</p>
              <p className="text-2xl font-black text-violet-700 mt-1">
                {loading ? '—' : formatINR(summary?.creditAdjusted || 0)}
              </p>
              <div className="mt-2 space-y-0.5">
                <p className="text-[10px] text-slate-500 font-semibold">
                  Adjusted from customer credit balance
                </p>
              </div>
            </div>

          </div>

          {/* FULL-WIDTH RECTANGULAR COUNTER CASH CARD BELOW */}
          <div className="card-premium relative overflow-hidden bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-emerald-500/10 border-2 border-emerald-500/30 p-5 shadow-sm rounded-2xl">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              
              {/* Left: Counter Cash Info */}
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-emerald-500 text-white flex items-center justify-center text-2xl shadow-md shrink-0">
                  🏧
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-emerald-800 uppercase tracking-widest bg-emerald-100/80 px-2.5 py-0.5 rounded-md">
                      COUNTER CASH
                    </span>
                    {summary?.cashSubmitted > 0 && (
                      <span className="text-xs font-black text-emerald-700 bg-emerald-200/60 px-2 py-0.5 rounded-md flex items-center gap-1">
                        ✓ Submitted: {formatINR(summary.cashSubmitted)}
                      </span>
                    )}
                  </div>
                  <div className="text-3xl md:text-4xl font-black text-emerald-700 mt-1 tracking-tight">
                    {loading ? '—' : formatINR(counterCash)}
                  </div>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Counter Cash = Available Net Cash ({formatINR(summary?.netCash || 0)}) − Cash Submitted ({formatINR(summary?.cashSubmitted || 0)})
                  </p>
                </div>
              </div>

              {/* Right: Cash Submitted Input Box */}
              <div className="w-full md:w-auto min-w-[320px] bg-white/90 backdrop-blur-sm p-4 rounded-xl border border-emerald-200 shadow-sm space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                  Cash Submitted / Deposited
                </label>

                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">₹</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max={summary?.netCash || 0}
                      placeholder="0"
                      value={cashSubmittedInput}
                      onWheel={(e) => e.target.blur()}
                      onChange={(e) => {
                        setCashSubmittedInput(e.target.value);
                        setSubmitFeedback({ type: '', message: '' });
                      }}
                      className="w-full h-10 pl-7 pr-3 rounded-lg border border-slate-300 bg-white text-slate-900 text-sm font-bold focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>

                  <button
                    type="button"
                    disabled={submittingCash}
                    onClick={handleApproveCashSubmitted}
                    className={`h-10 px-5 rounded-lg text-white font-black text-xs uppercase tracking-wider transition-all disabled:opacity-50 shrink-0 shadow-md flex items-center gap-1.5 ${
                      isAdmin
                        ? 'bg-emerald-600 hover:bg-emerald-700 active:scale-95'
                        : 'bg-blue-600 hover:bg-blue-700 active:scale-95'
                    }`}
                  >
                    {submittingCash ? (
                      <span className="loading loading-spinner loading-xs"></span>
                    ) : isAdmin ? (
                      'APPROVED'
                    ) : (
                      'SUBMIT CASH'
                    )}
                  </button>
                </div>

                {submitFeedback.message && (
                  <p className={`text-xs font-bold ${
                    submitFeedback.type === 'success' ? 'text-emerald-700' : 'text-red-500'
                  }`}>
                    {submitFeedback.message}
                  </p>
                )}
              </div>

            </div>
          </div>


          {/* FILTERS + TABLE CARD */}
          <div className="card-premium">

            {/* Filters */}
            <div className="grid grid-cols-1 md:grid-cols-6 gap-3 mb-5">

              {/* Search */}
              <div className="md:col-span-2 relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
                <input
                  type="text"
                  placeholder="Search party, ref, description…"
                  value={search}
                  onChange={handleFilterChange(setSearch)}
                  className="input-premium pl-10 h-11 w-full text-sm"
                />
              </div>

              {/* From date */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-slate-400 uppercase shrink-0">From</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={handleFilterChange(setStartDate)}
                  className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                />
              </div>

              {/* To date */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-slate-400 uppercase shrink-0">To</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={handleFilterChange(setEndDate)}
                  className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                />
              </div>

              {/* Method */}
              <div>
                <select
                  value={method}
                  onChange={handleFilterChange(setMethod)}
                  className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-bold"
                >
                  <option value="All">All Methods</option>
                  <option value="Cash">💵 Cash</option>
                  <option value="UPI">📱 UPI</option>
                  <option value="Bank">🏦 Bank</option>
                  <option value="Credit Balance">💳 Credit Balance</option>
                </select>
              </div>

              {/* Flow type */}
              <div>
                <select
                  value={flowType}
                  onChange={handleFilterChange(setFlowType)}
                  className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-bold"
                >
                  <option value="all">All Transactions</option>
                  <option value="in">⬆️ Cash In Only</option>
                  <option value="out">⬇️ Cash Out Only</option>
                </select>
              </div>
            </div>

            {/* Module filter pills */}
            <div className="flex items-center gap-2 mb-5 flex-wrap">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sources:</span>
              {Object.keys(MODULE_BADGE).map(mod => (
                <span key={mod} className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${MODULE_BADGE[mod]}`}>
                  {mod}
                </span>
              ))}
            </div>

            {/* Record count */}
            <div className="flex justify-end mb-3">
              <div className="text-[12px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
                {total} Records
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-100">
              <table className="table table-zebra w-full">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr className="text-slate-500 text-[11px] font-black uppercase tracking-wider">
                    <th className="py-3 px-4 text-left">Date</th>
                    <th className="py-3 px-4 text-left">Ref</th>
                    <th className="py-3 px-4 text-left">Source</th>
                    <th className="py-3 px-4 text-left">Party / Description</th>
                    <th className="py-3 px-4 text-left">Method</th>
                    <th className="py-3 px-4 text-center">Type</th>
                    <th className="py-3 px-4 text-right">Amount (₹)</th>
                    <th className="py-3 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {loading ? (
                    <tr>
                      <td colSpan="8" className="py-20 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <span className="loading loading-spinner text-primary"></span>
                          <span className="text-slate-400 text-sm font-medium">Aggregating cash flows…</span>
                        </div>
                      </td>
                    </tr>
                  ) : entries.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="py-20 text-center text-slate-400 font-medium italic text-sm">
                        No transactions found for the selected filters.
                      </td>
                    </tr>
                  ) : (
                    entries.map((e, idx) => {
                      const isOpening   = e.source_module === 'Opening Balance';
                      const isSubmitted = e.source_module === 'Cash Submitted';
                      const isIn        = e.flow === 'in';
                      const meth        = String(e.method || '').toLowerCase();
                      const mKey        = (meth.includes('credit balance') || meth.includes('credit adjust'))
                        ? 'credit balance'
                        : meth.includes('cash')
                        ? 'cash'
                        : meth.includes('upi')
                        ? 'upi'
                        : 'bank';
                      const modBg       = MODULE_BADGE[e.source_module] || 'bg-slate-50 text-slate-500 border-slate-100';
                      const methBg      = METHOD_BADGE[mKey] || 'bg-amber-50 text-amber-700 border-amber-200';
                      return (
                        <tr
                          key={idx}
                          className={
                            isOpening
                              ? 'bg-amber-50/40 border-b border-amber-100 font-semibold'
                              : isSubmitted
                              ? 'bg-emerald-50/40 border-b border-emerald-100 font-semibold'
                              : 'hover:bg-blue-50/20 transition-colors'
                          }
                        >
                          <td className="py-3 px-4 text-[13px] font-semibold text-slate-600 whitespace-nowrap">
                            {fmt(e.txn_date)}
                          </td>
                          <td className={`py-3 px-4 font-mono text-[12px] font-bold ${
                            isOpening ? 'text-amber-700' : isSubmitted ? 'text-emerald-700 font-black' : 'text-primary'
                          } max-w-[130px] truncate`} title={e.ref_id}>
                            {e.ref_id}
                          </td>
                          <td className="py-3 px-4">
                            <span className={`text-[10px] font-black px-2.5 py-1 rounded-full border ${modBg}`}>
                              {e.source_module}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-[13px] font-medium text-slate-700 max-w-[260px]">
                            <p className="font-bold text-slate-800 truncate">{e.party || '—'}</p>
                            <p className="text-[11px] text-slate-400 truncate">{e.description}</p>
                          </td>
                          <td className="py-3 px-4">
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${methBg}`}>
                              {e.method || '—'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                              isOpening
                                ? 'bg-amber-100 text-amber-800 border-amber-300'
                                : isSubmitted
                                ? (e.status === 'Pending' ? 'bg-amber-100 text-amber-800 border-amber-300 font-bold' : 'bg-emerald-100 text-emerald-800 border-emerald-300 font-bold')
                                : isIn
                                ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                                : 'bg-red-50 text-red-500 border-red-100'
                            }`}>
                              {isOpening
                                ? '⚡ OPENING'
                                : isSubmitted
                                ? (e.status === 'Pending' ? '⏳ PENDING APPROVAL' : '✓ APPROVED')
                                : isIn ? '▲ IN' : '▼ OUT'}
                            </span>
                          </td>
                          <td className={`py-3 px-4 text-right text-[15px] font-black whitespace-nowrap ${
                            isOpening ? 'text-amber-700' : isSubmitted ? 'text-emerald-700' : isIn ? 'text-emerald-600' : 'text-red-500'
                          }`}>
                            <div className="flex items-center justify-end gap-2">
                              <span>{isOpening ? '' : isSubmitted ? '−' : isIn ? '+' : '−'}{formatINR(Math.abs(e.amount))}</span>
                              {isSubmitted && e.status === 'Pending' && isAdmin && (
                                <button
                                  type="button"
                                  onClick={() => handleApprovePendingSubmission(e.id)}
                                  className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] uppercase tracking-wider transition-all shadow-xs"
                                  title="Approve this cash deposit"
                                >
                                  ✓ Approve
                                </button>
                              )}
                              {isSubmitted && e.id && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteCashSubmitted(e.id)}
                                  className="text-slate-400 hover:text-red-500 text-xs transition-colors p-1 rounded hover:bg-red-50"
                                  title="Delete this cash submission entry"
                                >
                                  🗑️
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => handleViewTxnDetails(e)}
                              className="px-2.5 py-1 rounded-lg bg-primary/10 text-primary hover:bg-primary hover:text-white transition-all font-bold text-xs flex items-center justify-center gap-1 mx-auto shadow-xs"
                              title="View entry details"
                            >
                              👁️ View
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {!loading && total > 0 && (
              <div className="flex items-center justify-between mt-5 pt-4 border-t border-slate-100">
                <div className="text-[12px] font-bold text-slate-400 uppercase">
                  Page {currentPage} of {totalPages} &nbsp;·&nbsp; {total} records
                </div>
                <div className="flex gap-2">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-40 text-[12px] font-bold shadow-sm transition-all"
                  >
                    ← Prev
                  </button>
                  <button
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-40 text-[12px] font-bold shadow-sm transition-all"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── TAB 2: SAVED DAILY HISTORY REPORTS ────────────────────────────── */}
      {activeTab === 'history' && (
        <div className="card-premium">
          {/* History Filters */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-5">
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
              <input
                type="text"
                placeholder="Search history date, user…"
                value={historySearch}
                onChange={(e) => { setHistorySearch(e.target.value); setHistoryPage(1); }}
                className="input-premium pl-10 h-11 w-full text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-slate-400 uppercase shrink-0">From</span>
              <input
                type="date"
                value={historyStart}
                onChange={(e) => { setHistoryStart(e.target.value); setHistoryPage(1); }}
                className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-slate-400 uppercase shrink-0">To</span>
              <input
                type="date"
                value={historyEnd}
                onChange={(e) => { setHistoryEnd(e.target.value); setHistoryPage(1); }}
                className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
              />
            </div>
            <div className="flex justify-end items-center">
              <div className="text-[12px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
                {historyTotal} Saved Daily Reports
              </div>
            </div>
          </div>

          {/* History Table */}
          <div className="overflow-x-auto rounded-xl border border-slate-100">
            <table className="table table-zebra w-full">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr className="text-slate-500 text-[11px] font-black uppercase tracking-wider">
                  <th className="py-3 px-3 text-left">Ledger Date</th>
                  <th className="py-3 px-3 text-right">Opening (₹)</th>
                  <th className="py-3 px-3 text-right text-emerald-600">Cash In (₹)</th>
                  <th className="py-3 px-3 text-right text-indigo-600">UPI In (₹)</th>
                  <th className="py-3 px-3 text-right text-sky-600">Bank In (₹)</th>
                  <th className="py-3 px-3 text-right text-violet-600">Credit Adj (₹)</th>
                  <th className="py-3 px-3 text-right">Total In (₹)</th>
                  <th className="py-3 px-3 text-right">Total Out (₹)</th>
                  <th className="py-3 px-3 text-right">Net Closing (₹)</th>
                  <th className="py-3 px-3 text-right">Submitted (₹)</th>
                  <th className="py-3 px-3 text-right">Counter Cash (₹)</th>
                  <th className="py-3 px-3 text-center">Txns</th>
                  <th className="py-3 px-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loadingHistory ? (
                  <tr>
                    <td colSpan="13" className="py-20 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <span className="loading loading-spinner text-primary"></span>
                        <span className="text-slate-400 text-sm font-medium">Fetching saved reports…</span>
                      </div>
                    </td>
                  </tr>
                ) : historyList.length === 0 ? (
                  <tr>
                    <td colSpan="13" className="py-20 text-center text-slate-400 font-medium italic text-sm">
                      No saved daily history reports found.
                    </td>
                  </tr>
                ) : (
                  historyList.map((row) => (
                    <tr key={row.id} className="hover:bg-blue-50/20 transition-colors">
                      <td className="py-3 px-3 text-[13px] font-black text-slate-800">
                        {fmt(row.ledgerDate)}
                      </td>
                      <td className="py-3 px-3 text-right text-[12px] font-bold text-amber-700">
                        {formatINR(row.totalOpening)}
                      </td>
                      <td className="py-3 px-3 text-right text-[12px] font-bold text-emerald-600">
                        +{formatINR(row.cashIn)}
                      </td>
                      <td className="py-3 px-3 text-right text-[12px] font-bold text-indigo-600">
                        +{formatINR(row.upiIn)}
                      </td>
                      <td className="py-3 px-3 text-right text-[12px] font-bold text-sky-600">
                        +{formatINR(row.bankIn)}
                      </td>
                      <td className="py-3 px-3 text-right text-[12px] font-bold text-violet-600">
                        {formatINR(row.creditAdjusted || 0)}
                      </td>
                      <td className="py-3 px-3 text-right text-[13px] font-black text-emerald-700">
                        +{formatINR(row.totalIn)}
                      </td>
                      <td className="py-3 px-3 text-right text-[12px] font-bold text-red-500">
                        −{formatINR(row.totalOut)}
                      </td>
                      <td className="py-3 px-3 text-right text-[13px] font-black text-primary">
                        {formatINR(row.netClosing)}
                      </td>
                      <td className="py-3 px-3 text-right text-[12px] font-bold text-slate-700">
                        {formatINR(row.cashSubmitted)}
                      </td>
                      <td className="py-3 px-3 text-right text-[13px] font-black text-emerald-700">
                        {formatINR(row.counterCash)}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-700">
                          {row.totalTransactions} txns
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <button
                          onClick={() => handleViewDayReport(row.ledgerDate)}
                          className="btn btn-ghost btn-xs text-primary hover:bg-primary/10 rounded-lg px-1.5 font-bold"
                        >
                          👁️ View
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* History Pagination */}
          {!loadingHistory && historyTotal > 0 && (
            <div className="flex items-center justify-between mt-5 pt-4 border-t border-slate-100">
              <div className="text-[12px] font-bold text-slate-400 uppercase">
                Page {historyPage} of {historyPages} &nbsp;·&nbsp; {historyTotal} saved reports
              </div>
              <div className="flex gap-2">
                <button
                  disabled={historyPage === 1}
                  onClick={() => setHistoryPage(p => Math.max(1, p - 1))}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-40 text-[12px] font-bold shadow-sm transition-all"
                >
                  ← Prev
                </button>
                <button
                  disabled={historyPage === historyPages}
                  onClick={() => setHistoryPage(p => Math.min(historyPages, p + 1))}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-40 text-[12px] font-bold shadow-sm transition-all"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── SET OPENING CASH MODAL ────────────────────────────────────────── */}
      {isOpeningModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm pointer-events-auto">
          <div className="bg-white rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.2)] border border-slate-200 w-[500px] overflow-hidden animate-fade-in pointer-events-auto">
            {/* Header */}
            <div className="bg-[#0b1324] p-6 text-white shrink-0 relative">
              <h3 className="text-xl font-black italic tracking-tight uppercase flex items-center gap-2">
                <span>💵</span> Set Opening Cash Balance
              </h3>
              <p className="text-slate-400 text-xs mt-1 font-medium">
                Manually input starting cash balance for the selected date
              </p>
              <button
                onClick={() => setIsOpeningModalOpen(false)}
                className="absolute right-6 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-all font-bold"
              >
                ✕
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveOpening} className="p-6 space-y-4">
              {openingError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-bold">
                  ⚠️ {openingError}
                </div>
              )}
              {openingSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-xs font-bold">
                  ✓ {openingSuccess}
                </div>
              )}

              {/* Date */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
                  Entry Date
                </label>
                <input
                  type="date"
                  required
                  value={openingForm.entryDate}
                  onChange={(e) => setOpeningForm({ ...openingForm, entryDate: e.target.value })}
                  className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 font-bold focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm"
                />
              </div>

              {/* Cash Amount */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
                  Opening Cash Amount (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="e.g. 5000.00"
                  value={openingForm.cashAmount}
                  onChange={(e) => setOpeningForm({ ...openingForm, cashAmount: e.target.value })}
                  className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-slate-800 font-black focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-base"
                />
              </div>

              {/* UPI Amount (optional) */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
                  Opening UPI Amount (₹) <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={openingForm.upiAmount}
                  onChange={(e) => setOpeningForm({ ...openingForm, upiAmount: e.target.value })}
                  className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-slate-800 font-bold focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm"
                />
              </div>

              {/* Bank Amount (optional) */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
                  Opening Bank Amount (₹) <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={openingForm.bankAmount}
                  onChange={(e) => setOpeningForm({ ...openingForm, bankAmount: e.target.value })}
                  className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-slate-800 font-bold focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm"
                />
              </div>

              {/* Remarks */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
                  Remarks / Notes
                </label>
                <input
                  type="text"
                  placeholder="e.g. Starting cash counter balance"
                  value={openingForm.remarks}
                  onChange={(e) => setOpeningForm({ ...openingForm, remarks: e.target.value })}
                  className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-slate-800 font-medium focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm"
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsOpeningModalOpen(false)}
                  className="px-5 h-11 rounded-xl border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 font-bold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={openingSaving}
                  className="btn-premium bg-amber-500 text-white hover:bg-amber-600 border border-amber-600 px-6 h-11 font-black text-xs disabled:opacity-50"
                >
                  {openingSaving ? 'Saving…' : 'Save Opening Cash'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}



      {/* ── VIEW DETAILED REPORT MODAL ────────────────────────────────────── */}
      {isViewReportModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm pointer-events-auto">
          <div className="bg-white rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.2)] border border-slate-200 w-[740px] max-h-[85vh] flex flex-col overflow-hidden animate-fade-in pointer-events-auto">
            <div className="bg-[#0b1324] p-6 text-white shrink-0 relative flex items-center justify-between">
              <div>
                <h3 className="text-xl font-black italic tracking-tight uppercase">
                  Daily Cash Report: {selectedReport ? fmt(selectedReport.ledgerDate) : '…'}
                </h3>
                <p className="text-slate-400 text-xs font-medium mt-0.5">
                  Complete daily summary and itemized transactions
                </p>
              </div>
              <button
                onClick={() => setIsViewReportModalOpen(false)}
                className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-all font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5">
              {loadingReport || !selectedReport ? (
                <div className="py-16 text-center">
                  <span className="loading loading-spinner text-primary"></span>
                  <p className="text-slate-400 text-sm mt-2">Loading detailed report…</p>
                </div>
              ) : (
                <>
                  {/* Summary Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2 bg-slate-50 border border-slate-100 p-4 rounded-2xl text-center text-xs">
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase">Opening</p>
                      <p className="text-sm font-black text-amber-700">{formatINR(selectedReport.totalOpening)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-emerald-600 uppercase">Cash In</p>
                      <p className="text-xs font-bold text-emerald-600">+{formatINR(selectedReport.cashIn)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-indigo-600 uppercase">UPI In</p>
                      <p className="text-xs font-bold text-indigo-600">+{formatINR(selectedReport.upiIn)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-sky-600 uppercase">Bank In</p>
                      <p className="text-xs font-bold text-sky-600">+{formatINR(selectedReport.bankIn)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-violet-600 uppercase">Credit Adj</p>
                      <p className="text-xs font-bold text-violet-600">{formatINR(selectedReport.creditAdjusted || 0)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase">Total In</p>
                      <p className="text-sm font-black text-emerald-600">+{formatINR(selectedReport.totalIn)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase">Net Closing</p>
                      <p className="text-sm font-black text-primary">{formatINR(selectedReport.netClosing)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase">Counter Cash</p>
                      <p className="text-sm font-black text-emerald-700">{formatINR(selectedReport.counterCash)}</p>
                    </div>
                  </div>

                  {/* Transactions Table */}
                  <div className="overflow-x-auto rounded-xl border border-slate-100">
                    <table className="table table-zebra w-full text-xs">
                      <thead className="bg-slate-50 border-b border-slate-100">
                        <tr className="text-slate-500 text-[10px] font-black uppercase">
                          <th className="py-2.5 px-3 text-left">Ref</th>
                          <th className="py-2.5 px-3 text-left">Module</th>
                          <th className="py-2.5 px-3 text-left">Party</th>
                          <th className="py-2.5 px-3 text-left">Method</th>
                          <th className="py-2.5 px-3 text-right">Amount (₹)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {selectedReport.transactions.map((t, i) => (
                          <tr key={i}>
                            <td className="py-2.5 px-3 font-mono font-bold text-primary">{t.ref_id}</td>
                            <td className="py-2.5 px-3 font-semibold text-slate-600">{t.source_module}</td>
                            <td className="py-2.5 px-3 text-slate-800 font-bold">{t.party}</td>
                            <td className="py-2.5 px-3 text-slate-600">{t.method}</td>
                            <td className={`py-2.5 px-3 text-right font-black ${t.flow === 'in' ? 'text-emerald-600' : 'text-red-500'}`}>
                              {t.flow === 'in' ? '+' : '−'}{formatINR(t.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button
                onClick={() => window.print()}
                className="btn-premium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs px-4 h-10 font-bold"
              >
                🖨️ Print Report
              </button>
              <button
                onClick={() => setIsViewReportModalOpen(false)}
                className="btn-premium bg-slate-800 text-white hover:bg-slate-900 text-xs px-5 h-10 font-bold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TRANSACTION ENTRY DETAILS MODAL ──────────────────────────────── */}
      {selectedTxn && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm pointer-events-auto">
          <div className="bg-white rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.2)] border border-slate-200 w-[640px] max-h-[85vh] flex flex-col overflow-hidden animate-fade-in pointer-events-auto">
            
            {/* Modal Header */}
            <div className="bg-[#0b1324] p-5 text-white flex items-center justify-between shrink-0">
              <div>
                <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full border ${
                  MODULE_BADGE[selectedTxn.source_module] || 'bg-slate-700 text-white border-slate-600'
                }`}>
                  {selectedTxn.source_module}
                </span>
                <h3 className="text-lg font-black tracking-tight mt-1 text-white">
                  Entry Details — <span className="text-amber-400 font-mono">{selectedTxn.ref_id}</span>
                </h3>
              </div>
              <button
                type="button"
                onClick={() => { setSelectedTxn(null); setTxnDetailsData(null); }}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center font-bold text-sm transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-4 text-xs font-semibold text-slate-600">
              
              {/* Core Metadata */}
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase">Party / Customer</p>
                  <p className="text-sm font-black text-slate-800">{selectedTxn.party || '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase">Date &amp; Type</p>
                  <p className="text-xs font-bold text-slate-800">{fmt(selectedTxn.txn_date)}</p>
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full inline-block mt-0.5 ${
                    selectedTxn.flow === 'in' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {selectedTxn.flow === 'in' ? '▲ CASH IN' : '▼ CASH OUT'}
                  </span>
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase">Payment Method</p>
                  <p className="text-xs font-bold text-primary">{selectedTxn.method || '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase">Amount</p>
                  <p className={`text-base font-black ${selectedTxn.flow === 'in' ? 'text-emerald-600' : 'text-red-500'}`}>
                    {selectedTxn.flow === 'in' ? '+' : '−'}{formatINR(Math.abs(selectedTxn.amount))}
                  </p>
                </div>
                <div className="col-span-2 border-t border-slate-200/60 pt-2">
                  <p className="text-[10px] font-black text-slate-400 uppercase">Description / Particulars</p>
                  <p className="text-xs text-slate-700 font-medium">{selectedTxn.description || '—'}</p>
                </div>
              </div>

              {/* SPECIFIC ITEMIZATION FOR BILLING MODULE */}
              {selectedTxn.source_module === 'Billing' && (
                <div className="space-y-3 pt-1">
                  <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider">
                    Sales Invoice Itemization
                  </h4>

                  {loadingTxnDetails ? (
                    <div className="py-8 text-center text-slate-400 font-medium">
                      <span className="loading loading-spinner text-primary"></span>
                      <p className="mt-1 text-xs">Loading invoice items…</p>
                    </div>
                  ) : txnDetailsData?.bill ? (
                    <>
                      {/* Billed Items Table */}
                      <div className="overflow-x-auto rounded-xl border border-slate-200">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead className="bg-slate-100 border-b border-slate-200 text-[10px] font-black text-slate-500 uppercase">
                            <tr>
                              <th className="py-2.5 px-3">Product Item</th>
                              <th className="py-2.5 px-3 text-center">Qty</th>
                              <th className="py-2.5 px-3 text-right">Rate</th>
                              <th className="py-2.5 px-3 text-right">Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-slate-700">
                            {txnDetailsData.items?.map((item, idx) => (
                              <tr key={idx}>
                                <td className="py-2 px-3 font-bold text-slate-800">{item.product_name}</td>
                                <td className="py-2 px-3 text-center font-bold">{item.quantity}</td>
                                <td className="py-2 px-3 text-right font-medium">{formatINR(item.rate_with_tax)}</td>
                                <td className="py-2 px-3 text-right font-bold text-slate-800">{formatINR(item.total_amount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Invoice Summary */}
                      <div className="bg-blue-50/60 border border-blue-200 p-3.5 rounded-xl space-y-1.5 text-xs">
                        <div className="flex justify-between font-bold text-slate-700">
                          <span>Grand Total:</span>
                          <span className="text-slate-900 font-black">{formatINR(txnDetailsData.bill.grand_total)}</span>
                        </div>
                        <div className="flex justify-between font-black text-emerald-700 border-t border-blue-200/60 pt-1">
                          <span>Amount Paid:</span>
                          <span>{formatINR(txnDetailsData.bill.amount_paid)}</span>
                        </div>
                        {(() => {
                          const creditAmt = Math.max(0, parseFloat(txnDetailsData.bill.amount_paid || 0) - (
                            parseFloat(txnDetailsData.bill.cash_paid || 0) +
                            parseFloat(txnDetailsData.bill.upi_paid || 0) +
                            parseFloat(txnDetailsData.bill.bank_paid || 0)
                          ));
                          return (
                            <div className={`grid ${creditAmt > 0 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'} gap-1 text-[11px] text-slate-600 font-semibold pt-1 border-t border-blue-200/40`}>
                              <div>Cash: <strong className="text-emerald-700">{formatINR(txnDetailsData.bill.cash_paid)}</strong></div>
                              <div>UPI: <strong className="text-indigo-700">{formatINR(txnDetailsData.bill.upi_paid)}</strong></div>
                              <div>Bank: <strong className="text-sky-700">{formatINR(txnDetailsData.bill.bank_paid)}</strong></div>
                              {creditAmt > 0 && (
                                <div>Credit Adj: <strong className="text-violet-700">{formatINR(creditAmt)}</strong></div>
                              )}
                            </div>
                          );
                        })()}
                        {txnDetailsData.bill.due_amount > 0 && (
                          <div className="flex justify-between font-bold text-amber-700 border-t border-blue-200/60 pt-1">
                            <span>Remaining Due:</span>
                            <span>{formatINR(txnDetailsData.bill.due_amount)}</span>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="p-3 bg-slate-50 rounded-xl text-slate-500 italic text-center">
                      Invoice details summary loaded.
                    </div>
                  )}
                </div>
              )}

              {/* SPECIFIC VIEW FOR CREDIT PAYMENT MODULE */}
              {selectedTxn.source_module === 'Credit Payment' && (
                <div className="bg-emerald-50/60 border border-emerald-200 p-4 rounded-xl space-y-2 text-xs">
                  <h4 className="text-xs font-black uppercase text-emerald-800 tracking-wider">
                    Credit Collection Details
                  </h4>
                  <div className="flex justify-between font-bold text-slate-700">
                    <span>Invoice Reference:</span>
                    <span className="font-mono text-primary">{selectedTxn.invoice_no || selectedTxn.ref_id}</span>
                  </div>
                  <div className="flex justify-between font-bold text-slate-700">
                    <span>Amount Received:</span>
                    <span className="font-black text-emerald-700">{formatINR(selectedTxn.amount)}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-[11px] text-slate-600 font-semibold pt-1.5 border-t border-emerald-200/60">
                    <div>Cash: <strong className="text-emerald-700">{formatINR(selectedTxn.cash_amt)}</strong></div>
                    <div>UPI: <strong className="text-indigo-700">{formatINR(selectedTxn.upi_amt)}</strong></div>
                    <div>Bank: <strong className="text-sky-700">{formatINR(selectedTxn.bank_amt)}</strong></div>
                  </div>
                  {selectedTxn.notes && (
                    <div className="pt-1.5 border-t border-emerald-200/60">
                      <span className="text-[10px] font-black text-slate-400 uppercase">Remarks / Notes:</span>
                      <p className="text-slate-700 font-medium">{selectedTxn.notes}</p>
                    </div>
                  )}
                </div>
              )}

            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => { setSelectedTxn(null); setTxnDetailsData(null); }}
                className="btn-premium bg-slate-800 text-white hover:bg-slate-900 text-xs px-5 h-10 font-bold"
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

export default CashLedger;
