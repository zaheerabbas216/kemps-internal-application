import React, { useState, useEffect, useCallback } from 'react';
import api from '../api/axios';

// ── colour maps ────────────────────────────────────────────────────────────
const MODULE_BADGE = {
  'Opening Balance':    'bg-amber-50 text-amber-700 border-amber-200',
  'Cash Submitted':     'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Billing':            'bg-blue-50 text-blue-700 border-blue-200',
  'Credit Payment':     'bg-purple-50 text-purple-700 border-purple-200',
  'Can Supply':         'bg-cyan-50 text-cyan-700 border-cyan-200',
  'Can Deposit':        'bg-teal-50 text-teal-700 border-teal-200',
  'Expense':            'bg-rose-50 text-rose-700 border-rose-200',
  'Can Deposit Return': 'bg-orange-50 text-orange-700 border-orange-200',
};

const METHOD_BADGE = {
  cash:             'bg-emerald-50 text-emerald-700 border-emerald-200',
  upi:              'bg-indigo-50 text-indigo-700 border-indigo-200',
  bank:             'bg-sky-50 text-sky-700 border-sky-200',
  'credit balance': 'bg-purple-50 text-purple-700 border-purple-200',
  'credit adjust':  'bg-purple-50 text-purple-700 border-purple-200',
  'credit adjustment': 'bg-purple-50 text-purple-700 border-purple-200',
};

// ── helpers ────────────────────────────────────────────────────────────────
const formatINR = (val) =>
  `₹${parseFloat(val || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`;

const formatINRShort = (val) =>
  `₹${parseFloat(val || 0).toLocaleString('en-IN', {
    maximumFractionDigits: 2,
  })}`;

const fmt = (dateStr) => {
  if (!dateStr) return '—';
  const [y, m, d] = String(dateStr).split('T')[0].split('-');
  return `${d}/${m}/${y}`;
};

const formatHeaderDate = (dateStr) => {
  if (!dateStr) return '';
  try {
    const parts = String(dateStr).split('T')[0].split('-');
    if (parts.length === 3) {
      const [y, m, d] = parts;
      const date = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
      return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    }
    return dateStr;
  } catch {
    return dateStr;
  }
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
  const [selectedSource, setSelectedSource] = useState('All');
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

  const displayedEntries = selectedSource === 'All'
    ? entries
    : entries.filter(e => e.source_module === selectedSource);

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-fade-in pb-12">

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            Cash Ledger
          </h1>
          <p className="text-sm text-gray-500 mt-1 font-normal">
            Daily cash, opening balance and history · {formatHeaderDate(startDate || today)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={activeTab === 'ledger' ? fetchLedger : fetchHistory}
            className="px-4 py-2 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-xl text-sm font-medium shadow-xs transition-colors flex items-center gap-1.5"
          >
            Refresh
          </button>
          {activeTab === 'ledger' && (
            <button
              onClick={handleOpenOpeningModal}
              className="px-4 py-2 bg-[#0F5A47] hover:bg-[#0c4a3a] text-white rounded-xl text-sm font-medium shadow-xs transition-colors flex items-center gap-1.5"
            >
              Set opening cash
            </button>
          )}
        </div>
      </div>

      {/* ── TAB SWITCHER ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setActiveTab('ledger')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'ledger'
              ? 'bg-[#E6F4EA] text-[#0F5A47]'
              : 'text-gray-500 hover:text-gray-900'
          }`}
        >
          Daily ledger
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'history'
              ? 'bg-[#E6F4EA] text-[#0F5A47]'
              : 'text-gray-500 hover:text-gray-900'
          }`}
        >
          Saved reports ({historyTotal})
        </button>
      </div>

      {/* ── TAB 1: DAILY CASH LEDGER ──────────────────────────────────────── */}
      {activeTab === 'ledger' && (
        <>
          {/* TOP 2 HIGHLIGHT CARDS (Row 1) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Card 1: Net closing balance */}
            <div className="bg-[#0F5A47] text-white rounded-2xl p-6 shadow-xs flex flex-col justify-between">
              <div>
                <p className="text-xs font-medium text-emerald-100/90">Net closing balance</p>
                <p className="text-3xl md:text-4xl font-bold tracking-tight text-white mt-2">
                  {loading ? '—' : formatINR(netTotal)}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2.5 mt-6">
                <div className="bg-white/10 rounded-xl p-2.5 backdrop-blur-xs">
                  <p className="text-xs text-emerald-100/80 font-normal">Cash</p>
                  <p className="text-sm font-semibold text-white mt-0.5">
                    {summary ? formatINR(summary.netCash) : '₹0.00'}
                  </p>
                </div>
                <div className="bg-white/10 rounded-xl p-2.5 backdrop-blur-xs">
                  <p className="text-xs text-emerald-100/80 font-normal">UPI</p>
                  <p className="text-sm font-semibold text-white mt-0.5">
                    {summary ? formatINR(summary.netUpi) : '₹0.00'}
                  </p>
                </div>
                <div className="bg-white/10 rounded-xl p-2.5 backdrop-blur-xs">
                  <p className="text-xs text-emerald-100/80 font-normal">Bank</p>
                  <p className="text-sm font-semibold text-white mt-0.5">
                    {summary ? formatINR(summary.netBank) : '₹0.00'}
                  </p>
                </div>
              </div>
            </div>

            {/* Card 2: Credit balance (adjusted from customer credit) */}
            <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-xs flex flex-col justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500">Credit balance (adjusted from customer credit)</p>
                <p className="text-3xl md:text-4xl font-bold tracking-tight text-[#6D28D9] mt-2">
                  {loading ? '—' : formatINR(summary?.creditAdjusted || 0)}
                </p>
              </div>
              <p className="text-xs text-gray-400 mt-6 leading-relaxed font-normal">
                This is not cash on hand. It is credit owed to customers, already adjusted in billing.
              </p>
            </div>

          </div>

          {/* ROW 2 STATS (3 Cards) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

            {/* 1. Opening Balance */}
            <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-xs">
              <div className="flex items-center">
                <span className="text-xs font-medium text-gray-500">Opening balance</span>
                <button
                  onClick={handleOpenOpeningModal}
                  className="text-xs text-amber-600 hover:text-amber-700 font-medium ml-1.5 hover:underline"
                  title="Edit opening balance"
                >
                  Edit
                </button>
              </div>
              <p className="text-2xl font-bold tracking-tight text-amber-600 mt-1.5">
                {loading ? '—' : formatINR(totalOpening)}
              </p>
              <p className="text-xs text-gray-400 mt-1.5 font-normal truncate">
                Cash {formatINRShort(summary?.openingCash || 0)} · UPI {formatINRShort(summary?.openingUpi || 0)} · Bank {formatINRShort(summary?.openingBank || 0)}
              </p>
            </div>

            {/* 2. Total Cash In */}
            <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-xs">
              <p className="text-xs font-medium text-gray-500">Total cash in</p>
              <p className="text-2xl font-bold tracking-tight text-emerald-600 mt-1.5">
                {loading ? '—' : `+ ${formatINR(totalIn)}`}
              </p>
              <p className="text-xs text-gray-400 mt-1.5 font-normal truncate">
                Cash {formatINRShort(summary?.cashIn || 0)} · UPI {formatINRShort(summary?.upiIn || 0)} · Bank {formatINRShort(summary?.bankIn || 0)}
              </p>
            </div>

            {/* 3. Total Cash Out */}
            <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-xs">
              <p className="text-xs font-medium text-gray-500">Total cash out</p>
              <p className="text-2xl font-bold tracking-tight text-red-500 mt-1.5">
                {loading ? '—' : `− ${formatINR(totalOut)}`}
              </p>
              <p className="text-xs text-gray-400 mt-1.5 font-normal truncate">
                Cash {formatINRShort(summary?.cashOut || 0)} · UPI {formatINRShort(summary?.upiOut || 0)} · Bank {formatINRShort(summary?.bankOut || 0)}
              </p>
            </div>

          </div>

          {/* ROW 3: RECTANGULAR COUNTER CASH CARD */}
          <div className="bg-[#E6F4EA] border border-[#C6E7D2] rounded-2xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-6">
            
            {/* Left: Counter Cash Info */}
            <div>
              <p className="text-sm font-medium text-[#0F5A47]">
                Counter cash (in your drawer)
              </p>
              <p className="text-3xl md:text-4xl font-bold tracking-tight text-[#0F5A47] mt-1.5">
                {loading ? '—' : formatINR(counterCash)}
              </p>
              <p className="text-xs text-gray-600 mt-1 font-normal">
                Available net cash {formatINR(summary?.netCash || 0)} − cash submitted {formatINR(summary?.cashSubmitted || 0)}
              </p>
            </div>

            {/* Right: Cash Submitted Input Box */}
            <div className="flex flex-col sm:items-end">
              <label className="text-xs font-medium text-gray-600 mb-1.5 block">
                Cash submitted / deposited
              </label>

              <div className="flex items-center gap-3">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">₹</span>
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
                    className="w-40 sm:w-48 h-10 pl-7 pr-3 rounded-xl border border-gray-200 bg-white text-gray-900 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#0F5A47]/20 focus:border-[#0F5A47] transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>

                <button
                  type="button"
                  disabled={submittingCash}
                  onClick={handleApproveCashSubmitted}
                  className="h-10 px-6 rounded-xl bg-[#0F5A47] hover:bg-[#0c4a3a] text-white font-medium text-sm transition-all shadow-xs disabled:opacity-50 flex items-center justify-center gap-1.5 shrink-0"
                >
                  {submittingCash ? (
                    <span className="loading loading-spinner loading-xs"></span>
                  ) : (
                    'Approve'
                  )}
                </button>
              </div>

              {submitFeedback.message && (
                <p className={`text-xs font-medium mt-1.5 ${
                  submitFeedback.type === 'success' ? 'text-emerald-700' : 'text-red-500'
                }`}>
                  {submitFeedback.message}
                </p>
              )}
            </div>

          </div>


          {/* ROW 4: FILTERS + TABLE CARD */}
          <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-xs space-y-4">

            {/* Filters Row 1 */}
            <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">

              {/* Search */}
              <div className="relative flex-1 min-w-[240px]">
                <input
                  type="text"
                  placeholder="Search party, reference or description"
                  value={search}
                  onChange={handleFilterChange(setSearch)}
                  className="w-full h-10 pl-3.5 pr-3.5 rounded-xl border border-gray-200 bg-white text-gray-800 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F5A47]/20 focus:border-[#0F5A47] transition-all"
                />
              </div>

              {/* From date */}
              <input
                type="date"
                value={startDate}
                onChange={handleFilterChange(setStartDate)}
                className="h-10 px-3.5 rounded-xl border border-gray-200 bg-white text-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F5A47]/20 focus:border-[#0F5A47] transition-all"
              />

              {/* To date */}
              <input
                type="date"
                value={endDate}
                onChange={handleFilterChange(setEndDate)}
                className="h-10 px-3.5 rounded-xl border border-gray-200 bg-white text-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F5A47]/20 focus:border-[#0F5A47] transition-all"
              />

              {/* Method */}
              <select
                value={method}
                onChange={handleFilterChange(setMethod)}
                className="h-10 px-3.5 rounded-xl border border-gray-200 bg-white text-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F5A47]/20 focus:border-[#0F5A47] transition-all"
              >
                <option value="All">All methods</option>
                <option value="Cash">Cash</option>
                <option value="UPI">UPI</option>
                <option value="Bank">Bank</option>
                <option value="Credit Balance">Credit Balance</option>
              </select>

              {/* Flow type */}
              <select
                value={flowType}
                onChange={handleFilterChange(setFlowType)}
                className="h-10 px-3.5 rounded-xl border border-gray-200 bg-white text-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F5A47]/20 focus:border-[#0F5A47] transition-all"
              >
                <option value="all">All transactions</option>
                <option value="in">Cash In Only</option>
                <option value="out">Cash Out Only</option>
              </select>
            </div>

            {/* Filters Row 2: Source filter pills & record count */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-gray-50">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium text-gray-500 mr-1 shrink-0">Source</span>
                {Object.keys(MODULE_BADGE).map(mod => {
                  const isSelected = selectedSource === mod;
                  return (
                    <button
                      key={mod}
                      type="button"
                      onClick={() => setSelectedSource(prev => prev === mod ? 'All' : mod)}
                      className={`text-xs px-3.5 py-1 rounded-full border transition-all font-medium ${
                        isSelected
                          ? 'bg-[#0F5A47] text-white border-[#0F5A47] shadow-xs'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {mod}
                    </button>
                  );
                })}
              </div>

              {/* Record count badge */}
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider bg-gray-50 px-3 py-1 rounded-lg border border-gray-100">
                {selectedSource !== 'All' ? `${displayedEntries.length} of ${total} RECORDS` : `${total} RECORDS`}
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-xl border border-gray-100">
              <table className="w-full border-collapse">
                <thead className="bg-gray-50/70 border-b border-gray-100">
                  <tr className="text-gray-500 text-xs font-medium">
                    <th className="py-3 px-4 text-left font-medium">Date</th>
                    <th className="py-3 px-4 text-left font-medium">Reference</th>
                    <th className="py-3 px-4 text-left font-medium">Source</th>
                    <th className="py-3 px-4 text-left font-medium">Party</th>
                    <th className="py-3 px-4 text-left font-medium">Method</th>
                    <th className="py-3 px-4 text-center font-medium">Type</th>
                    <th className="py-3 px-4 text-right font-medium">Amount</th>
                    <th className="py-3 px-4 text-center font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                  {loading ? (
                    <tr>
                      <td colSpan="8" className="py-20 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <span className="loading loading-spinner text-[#0F5A47]"></span>
                          <span className="text-gray-400 text-sm font-normal">Aggregating cash flows…</span>
                        </div>
                      </td>
                    </tr>
                  ) : displayedEntries.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="py-16 text-center text-gray-400 font-normal italic text-sm">
                        No transactions found for the selected filters.
                      </td>
                    </tr>
                  ) : (
                    displayedEntries.map((e, idx) => {
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
                      const modBg       = MODULE_BADGE[e.source_module] || 'bg-gray-50 text-gray-600 border-gray-200';
                      const methBg      = METHOD_BADGE[mKey] || 'bg-amber-50 text-amber-700 border-amber-200';
                      return (
                        <tr
                          key={idx}
                          className={
                            isOpening
                              ? 'bg-amber-50/30 border-b border-amber-100/60'
                              : isSubmitted
                              ? 'bg-emerald-50/30 border-b border-emerald-100/60'
                              : 'hover:bg-gray-50/60 transition-colors'
                          }
                        >
                          <td className="py-3 px-4 text-xs font-normal text-gray-600 whitespace-nowrap">
                            {fmt(e.txn_date)}
                          </td>
                          <td className="py-3 px-4 font-mono text-xs font-medium text-blue-600 max-w-[130px] truncate" title={e.ref_id}>
                            {e.ref_id}
                          </td>
                          <td className="py-3 px-4">
                            <span className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full border ${modBg}`}>
                              {e.source_module}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-xs text-gray-800 max-w-[260px]">
                            <p className="font-semibold text-gray-900 truncate">{e.party || '—'}</p>
                            {e.description && (
                              <p className="text-[11px] text-gray-400 truncate mt-0.5">{e.description}</p>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <span className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full border ${methBg}`}>
                              {e.method || '—'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                              isOpening
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : isSubmitted
                                ? (e.status === 'Pending' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200')
                                : isIn
                                ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                                : 'bg-rose-50 text-rose-500 border-rose-100'
                            }`}>
                              {isOpening
                                ? 'OPENING'
                                : isSubmitted
                                ? (e.status === 'Pending' ? 'PENDING APPROVAL' : 'APPROVED')
                                : isIn ? '▲ IN' : '▼ OUT'}
                            </span>
                          </td>
                          <td className={`py-3 px-4 text-right text-sm font-semibold whitespace-nowrap ${
                            isOpening ? 'text-amber-700' : isSubmitted ? 'text-emerald-700' : isIn ? 'text-emerald-600' : 'text-rose-500'
                          }`}>
                            <div className="flex items-center justify-end gap-2">
                              <span>{isOpening ? '' : isSubmitted ? '−' : isIn ? '+' : '−'} {formatINR(Math.abs(e.amount))}</span>
                              {isSubmitted && e.status === 'Pending' && isAdmin && (
                                <button
                                  type="button"
                                  onClick={() => handleApprovePendingSubmission(e.id)}
                                  className="px-2 py-0.5 rounded-md bg-[#0F5A47] hover:bg-[#0c4a3a] text-white font-medium text-[10px] uppercase tracking-wider transition-all shadow-xs"
                                  title="Approve this cash deposit"
                                >
                                  Approve
                                </button>
                              )}
                              {isSubmitted && e.id && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteCashSubmitted(e.id)}
                                  className="text-gray-400 hover:text-red-500 text-xs transition-colors p-1 rounded-md hover:bg-red-50"
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
                              className="px-3 py-1 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 rounded-lg text-xs font-medium shadow-xs transition-colors mx-auto"
                              title="View entry details"
                            >
                              View
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
              <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                <div className="text-xs font-medium text-gray-400">
                  Page {currentPage} of {totalPages} &nbsp;·&nbsp; {total} records
                </div>
                <div className="flex gap-2">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    className="px-3 py-1.5 rounded-xl border border-gray-200 text-gray-600 bg-white hover:bg-gray-50 disabled:opacity-40 text-xs font-medium shadow-xs transition-all"
                  >
                    ← Prev
                  </button>
                  <button
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    className="px-3 py-1.5 rounded-xl border border-gray-200 text-gray-600 bg-white hover:bg-gray-50 disabled:opacity-40 text-xs font-medium shadow-xs transition-all"
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
        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-xs space-y-4">
          {/* History Filters */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="relative">
              <input
                type="text"
                placeholder="Search history date, user…"
                value={historySearch}
                onChange={(e) => { setHistorySearch(e.target.value); setHistoryPage(1); }}
                className="w-full h-10 px-3.5 rounded-xl border border-gray-200 bg-white text-gray-800 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F5A47]/20 focus:border-[#0F5A47] transition-all"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-400 shrink-0">From</span>
              <input
                type="date"
                value={historyStart}
                onChange={(e) => { setHistoryStart(e.target.value); setHistoryPage(1); }}
                className="w-full h-10 px-3.5 rounded-xl border border-gray-200 bg-white text-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F5A47]/20 focus:border-[#0F5A47] transition-all"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-400 shrink-0">To</span>
              <input
                type="date"
                value={historyEnd}
                onChange={(e) => { setHistoryEnd(e.target.value); setHistoryPage(1); }}
                className="w-full h-10 px-3.5 rounded-xl border border-gray-200 bg-white text-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F5A47]/20 focus:border-[#0F5A47] transition-all"
              />
            </div>
            <div className="flex justify-end items-center">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100">
                {historyTotal} Saved Daily Reports
              </div>
            </div>
          </div>

          {/* History Table */}
          <div className="overflow-x-auto rounded-xl border border-gray-100">
            <table className="w-full border-collapse">
              <thead className="bg-gray-50/70 border-b border-gray-100">
                <tr className="text-gray-500 text-xs font-medium">
                  <th className="py-3 px-3 text-left font-medium">Ledger Date</th>
                  <th className="py-3 px-3 text-right font-medium">Opening</th>
                  <th className="py-3 px-3 text-right font-medium text-emerald-600">Cash In</th>
                  <th className="py-3 px-3 text-right font-medium text-indigo-600">UPI In</th>
                  <th className="py-3 px-3 text-right font-medium text-sky-600">Bank In</th>
                  <th className="py-3 px-3 text-right font-medium text-purple-600">Credit Adj</th>
                  <th className="py-3 px-3 text-right font-medium">Total In</th>
                  <th className="py-3 px-3 text-right font-medium">Total Out</th>
                  <th className="py-3 px-3 text-right font-medium">Net Closing</th>
                  <th className="py-3 px-3 text-right font-medium">Submitted</th>
                  <th className="py-3 px-3 text-right font-medium">Counter Cash</th>
                  <th className="py-3 px-3 text-center font-medium">Txns</th>
                  <th className="py-3 px-3 text-center font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {loadingHistory ? (
                  <tr>
                    <td colSpan="13" className="py-20 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <span className="loading loading-spinner text-[#0F5A47]"></span>
                        <span className="text-gray-400 text-sm font-normal">Fetching saved reports…</span>
                      </div>
                    </td>
                  </tr>
                ) : historyList.length === 0 ? (
                  <tr>
                    <td colSpan="13" className="py-16 text-center text-gray-400 font-normal italic text-sm">
                      No saved daily history reports found.
                    </td>
                  </tr>
                ) : (
                  historyList.map((row) => (
                    <tr key={row.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="py-3 px-3 text-xs font-semibold text-gray-800">
                        {fmt(row.ledgerDate)}
                      </td>
                      <td className="py-3 px-3 text-right font-medium text-amber-700">
                        {formatINR(row.totalOpening)}
                      </td>
                      <td className="py-3 px-3 text-right font-medium text-emerald-600">
                        +{formatINR(row.cashIn)}
                      </td>
                      <td className="py-3 px-3 text-right font-medium text-indigo-600">
                        +{formatINR(row.upiIn)}
                      </td>
                      <td className="py-3 px-3 text-right font-medium text-sky-600">
                        +{formatINR(row.bankIn)}
                      </td>
                      <td className="py-3 px-3 text-right font-medium text-purple-600">
                        {formatINR(row.creditAdjusted || 0)}
                      </td>
                      <td className="py-3 px-3 text-right font-semibold text-emerald-700">
                        +{formatINR(row.totalIn)}
                      </td>
                      <td className="py-3 px-3 text-right font-medium text-red-500">
                        −{formatINR(row.totalOut)}
                      </td>
                      <td className="py-3 px-3 text-right font-semibold text-gray-900">
                        {formatINR(row.netClosing)}
                      </td>
                      <td className="py-3 px-3 text-right font-medium text-gray-600">
                        {formatINR(row.cashSubmitted)}
                      </td>
                      <td className="py-3 px-3 text-right font-semibold text-emerald-700">
                        {formatINR(row.counterCash)}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                          {row.totalTransactions} txns
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <button
                          onClick={() => handleViewDayReport(row.ledgerDate)}
                          className="px-2.5 py-1 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 rounded-lg text-xs font-medium shadow-xs transition-colors"
                        >
                          View
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
            <div className="flex items-center justify-between pt-3 border-t border-gray-100">
              <div className="text-xs font-medium text-gray-400">
                Page {historyPage} of {historyPages} &nbsp;·&nbsp; {historyTotal} saved reports
              </div>
              <div className="flex gap-2">
                <button
                  disabled={historyPage === 1}
                  onClick={() => setHistoryPage(p => Math.max(1, p - 1))}
                  className="px-3 py-1.5 rounded-xl border border-gray-200 text-gray-600 bg-white hover:bg-gray-50 disabled:opacity-40 text-xs font-medium shadow-xs transition-all"
                >
                  ← Prev
                </button>
                <button
                  disabled={historyPage === historyPages}
                  onClick={() => setHistoryPage(p => Math.min(historyPages, p + 1))}
                  className="px-3 py-1.5 rounded-xl border border-gray-200 text-gray-600 bg-white hover:bg-gray-50 disabled:opacity-40 text-xs font-medium shadow-xs transition-all"
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
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-gray-900/40 backdrop-blur-xs pointer-events-auto">
          <div className="bg-white rounded-3xl shadow-xl border border-gray-100 w-[500px] overflow-hidden animate-fade-in pointer-events-auto">
            {/* Header */}
            <div className="bg-[#0F5A47] p-6 text-white shrink-0 relative">
              <h3 className="text-xl font-bold tracking-tight">
                Set Opening Cash Balance
              </h3>
              <p className="text-emerald-100/80 text-xs mt-1 font-normal">
                Manually input starting cash balance for the selected date
              </p>
              <button
                onClick={() => setIsOpeningModalOpen(false)}
                className="absolute right-6 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-all font-medium text-sm"
              >
                ✕
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveOpening} className="p-6 space-y-4">
              {openingError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-medium">
                  {openingError}
                </div>
              )}
              {openingSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-xs font-medium">
                  {openingSuccess}
                </div>
              )}

              {/* Date */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Entry Date
                </label>
                <input
                  type="date"
                  required
                  value={openingForm.entryDate}
                  onChange={(e) => setOpeningForm({ ...openingForm, entryDate: e.target.value })}
                  className="w-full h-10 px-3.5 rounded-xl border border-gray-200 bg-gray-50 text-gray-800 font-medium focus:border-[#0F5A47] focus:ring-2 focus:ring-[#0F5A47]/20 transition-all outline-none text-sm"
                />
              </div>

              {/* Cash Amount */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Opening Cash Amount (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="e.g. 5000.00"
                  value={openingForm.cashAmount}
                  onChange={(e) => setOpeningForm({ ...openingForm, cashAmount: e.target.value })}
                  className="w-full h-10 px-3.5 rounded-xl border border-gray-200 bg-white text-gray-900 font-bold focus:border-[#0F5A47] focus:ring-2 focus:ring-[#0F5A47]/20 transition-all outline-none text-base"
                />
              </div>

              {/* UPI Amount (optional) */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Opening UPI Amount (₹) <span className="text-gray-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={openingForm.upiAmount}
                  onChange={(e) => setOpeningForm({ ...openingForm, upiAmount: e.target.value })}
                  className="w-full h-10 px-3.5 rounded-xl border border-gray-200 bg-white text-gray-800 font-medium focus:border-[#0F5A47] focus:ring-2 focus:ring-[#0F5A47]/20 transition-all outline-none text-sm"
                />
              </div>

              {/* Bank Amount (optional) */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Opening Bank Amount (₹) <span className="text-gray-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={openingForm.bankAmount}
                  onChange={(e) => setOpeningForm({ ...openingForm, bankAmount: e.target.value })}
                  className="w-full h-10 px-3.5 rounded-xl border border-gray-200 bg-white text-gray-800 font-medium focus:border-[#0F5A47] focus:ring-2 focus:ring-[#0F5A47]/20 transition-all outline-none text-sm"
                />
              </div>

              {/* Remarks */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Remarks / Notes
                </label>
                <input
                  type="text"
                  placeholder="e.g. Starting cash counter balance"
                  value={openingForm.remarks}
                  onChange={(e) => setOpeningForm({ ...openingForm, remarks: e.target.value })}
                  className="w-full h-10 px-3.5 rounded-xl border border-gray-200 bg-white text-gray-800 font-normal focus:border-[#0F5A47] focus:ring-2 focus:ring-[#0F5A47]/20 transition-all outline-none text-sm"
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsOpeningModalOpen(false)}
                  className="px-4 h-10 rounded-xl border border-gray-200 text-gray-600 bg-white hover:bg-gray-50 font-medium text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={openingSaving}
                  className="px-5 h-10 rounded-xl bg-[#0F5A47] hover:bg-[#0c4a3a] text-white font-medium text-sm disabled:opacity-50 transition-colors shadow-xs"
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
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-gray-900/40 backdrop-blur-xs pointer-events-auto">
          <div className="bg-white rounded-3xl shadow-xl border border-gray-100 w-[740px] max-h-[85vh] flex flex-col overflow-hidden animate-fade-in pointer-events-auto">
            <div className="bg-[#0F5A47] p-6 text-white shrink-0 relative flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold tracking-tight">
                  Daily Cash Report: {selectedReport ? fmt(selectedReport.ledgerDate) : '…'}
                </h3>
                <p className="text-emerald-100/80 text-xs font-normal mt-0.5">
                  Complete daily summary and itemized transactions
                </p>
              </div>
              <button
                onClick={() => setIsViewReportModalOpen(false)}
                className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-all font-medium text-sm"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5">
              {loadingReport || !selectedReport ? (
                <div className="py-16 text-center">
                  <span className="loading loading-spinner text-[#0F5A47]"></span>
                  <p className="text-gray-400 text-sm mt-2">Loading detailed report…</p>
                </div>
              ) : (
                <>
                  {/* Summary Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2 bg-gray-50 border border-gray-100 p-4 rounded-2xl text-center text-xs">
                    <div>
                      <p className="text-[10px] font-medium text-gray-400 uppercase">Opening</p>
                      <p className="text-sm font-semibold text-amber-700">{formatINR(selectedReport.totalOpening)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-medium text-emerald-600 uppercase">Cash In</p>
                      <p className="text-xs font-semibold text-emerald-600">+{formatINR(selectedReport.cashIn)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-medium text-indigo-600 uppercase">UPI In</p>
                      <p className="text-xs font-semibold text-indigo-600">+{formatINR(selectedReport.upiIn)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-medium text-sky-600 uppercase">Bank In</p>
                      <p className="text-xs font-semibold text-sky-600">+{formatINR(selectedReport.bankIn)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-medium text-purple-600 uppercase">Credit Adj</p>
                      <p className="text-xs font-semibold text-purple-600">{formatINR(selectedReport.creditAdjusted || 0)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-medium text-gray-400 uppercase">Total In</p>
                      <p className="text-sm font-semibold text-emerald-600">+{formatINR(selectedReport.totalIn)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-medium text-gray-400 uppercase">Net Closing</p>
                      <p className="text-sm font-semibold text-gray-900">{formatINR(selectedReport.netClosing)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-medium text-gray-400 uppercase">Counter Cash</p>
                      <p className="text-sm font-semibold text-emerald-700">{formatINR(selectedReport.counterCash)}</p>
                    </div>
                  </div>

                  {/* Transactions Table */}
                  <div className="overflow-x-auto rounded-xl border border-gray-100">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50/70 border-b border-gray-100">
                        <tr className="text-gray-500 text-[11px] font-medium">
                          <th className="py-2.5 px-3 text-left">Ref</th>
                          <th className="py-2.5 px-3 text-left">Module</th>
                          <th className="py-2.5 px-3 text-left">Party</th>
                          <th className="py-2.5 px-3 text-left">Method</th>
                          <th className="py-2.5 px-3 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {selectedReport.transactions.map((t, i) => (
                          <tr key={i} className="hover:bg-gray-50/50">
                            <td className="py-2.5 px-3 font-mono font-medium text-blue-600">{t.ref_id}</td>
                            <td className="py-2.5 px-3 text-gray-600">{t.source_module}</td>
                            <td className="py-2.5 px-3 text-gray-800 font-medium">{t.party}</td>
                            <td className="py-2.5 px-3 text-gray-600">{t.method}</td>
                            <td className={`py-2.5 px-3 text-right font-semibold ${t.flow === 'in' ? 'text-emerald-600' : 'text-red-500'}`}>
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

            <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={() => window.print()}
                className="px-4 h-9 rounded-xl border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 text-xs font-medium"
              >
                🖨️ Print Report
              </button>
              <button
                onClick={() => setIsViewReportModalOpen(false)}
                className="px-4 h-9 rounded-xl bg-gray-800 text-white hover:bg-gray-900 text-xs font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TRANSACTION ENTRY DETAILS MODAL ──────────────────────────────── */}
      {selectedTxn && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-gray-900/40 backdrop-blur-xs pointer-events-auto">
          <div className="bg-white rounded-3xl shadow-xl border border-gray-100 w-[640px] max-h-[85vh] flex flex-col overflow-hidden animate-fade-in pointer-events-auto">
            
            {/* Modal Header */}
            <div className="bg-[#0F5A47] p-5 text-white flex items-center justify-between shrink-0">
              <div>
                <span className={`text-[10px] font-medium px-2.5 py-0.5 rounded-full border ${
                  MODULE_BADGE[selectedTxn.source_module] || 'bg-white/10 text-white border-white/20'
                }`}>
                  {selectedTxn.source_module}
                </span>
                <h3 className="text-lg font-bold tracking-tight mt-1 text-white">
                  Entry Details — <span className="text-amber-200 font-mono">{selectedTxn.ref_id}</span>
                </h3>
              </div>
              <button
                type="button"
                onClick={() => { setSelectedTxn(null); setTxnDetailsData(null); }}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center font-medium text-sm transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-4 text-xs font-medium text-gray-600">
              
              {/* Core Metadata */}
              <div className="grid grid-cols-2 gap-3 bg-gray-50 p-4 rounded-2xl border border-gray-100">
                <div>
                  <p className="text-[10px] font-medium text-gray-400 uppercase">Party / Customer</p>
                  <p className="text-sm font-semibold text-gray-900">{selectedTxn.party || '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-medium text-gray-400 uppercase">Date &amp; Type</p>
                  <p className="text-xs font-semibold text-gray-800">{fmt(selectedTxn.txn_date)}</p>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full inline-block mt-0.5 ${
                    selectedTxn.flow === 'in' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {selectedTxn.flow === 'in' ? '▲ CASH IN' : '▼ CASH OUT'}
                  </span>
                </div>
                <div>
                  <p className="text-[10px] font-medium text-gray-400 uppercase">Payment Method</p>
                  <p className="text-xs font-semibold text-gray-900">{selectedTxn.method || '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-medium text-gray-400 uppercase">Amount</p>
                  <p className={`text-base font-bold ${selectedTxn.flow === 'in' ? 'text-emerald-600' : 'text-red-500'}`}>
                    {selectedTxn.flow === 'in' ? '+' : '−'}{formatINR(Math.abs(selectedTxn.amount))}
                  </p>
                </div>
                <div className="col-span-2 border-t border-gray-200/60 pt-2">
                  <p className="text-[10px] font-medium text-gray-400 uppercase">Description / Particulars</p>
                  <p className="text-xs text-gray-700 font-normal">{selectedTxn.description || '—'}</p>
                </div>
              </div>

              {/* SPECIFIC ITEMIZATION FOR BILLING MODULE */}
              {selectedTxn.source_module === 'Billing' && (
                <div className="space-y-3 pt-1">
                  <h4 className="text-xs font-semibold uppercase text-gray-400 tracking-wider">
                    Sales Invoice Itemization
                  </h4>

                  {loadingTxnDetails ? (
                    <div className="py-8 text-center text-gray-400 font-normal">
                      <span className="loading loading-spinner text-[#0F5A47]"></span>
                      <p className="mt-1 text-xs">Loading invoice items…</p>
                    </div>
                  ) : txnDetailsData?.bill ? (
                    <>
                      {/* Billed Items Table */}
                      <div className="overflow-x-auto rounded-xl border border-gray-200">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead className="bg-gray-100 border-b border-gray-200 text-[10px] font-semibold text-gray-500 uppercase">
                            <tr>
                              <th className="py-2.5 px-3">Product Item</th>
                              <th className="py-2.5 px-3 text-center">Qty</th>
                              <th className="py-2.5 px-3 text-right">Rate</th>
                              <th className="py-2.5 px-3 text-right">Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 text-gray-700">
                            {txnDetailsData.items?.map((item, idx) => (
                              <tr key={idx}>
                                <td className="py-2 px-3 font-semibold text-gray-800">{item.product_name}</td>
                                <td className="py-2 px-3 text-center font-medium">{item.quantity}</td>
                                <td className="py-2 px-3 text-right">{formatINR(item.rate_with_tax)}</td>
                                <td className="py-2 px-3 text-right font-semibold text-gray-900">{formatINR(item.total_amount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Invoice Summary */}
                      <div className="bg-blue-50/60 border border-blue-200 p-3.5 rounded-xl space-y-1.5 text-xs">
                        <div className="flex justify-between font-medium text-gray-700">
                          <span>Grand Total:</span>
                          <span className="text-gray-900 font-bold">{formatINR(txnDetailsData.bill.grand_total)}</span>
                        </div>
                        <div className="flex justify-between font-semibold text-emerald-700 border-t border-blue-200/60 pt-1">
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
                            <div className={`grid ${creditAmt > 0 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'} gap-1 text-[11px] text-gray-600 font-medium pt-1 border-t border-blue-200/40`}>
                              <div>Cash: <strong className="text-emerald-700">{formatINR(txnDetailsData.bill.cash_paid)}</strong></div>
                              <div>UPI: <strong className="text-indigo-700">{formatINR(txnDetailsData.bill.upi_paid)}</strong></div>
                              <div>Bank: <strong className="text-sky-700">{formatINR(txnDetailsData.bill.bank_paid)}</strong></div>
                              {creditAmt > 0 && (
                                <div>Credit Adj: <strong className="text-purple-700">{formatINR(creditAmt)}</strong></div>
                              )}
                            </div>
                          );
                        })()}
                        {txnDetailsData.bill.due_amount > 0 && (
                          <div className="flex justify-between font-semibold text-amber-700 border-t border-blue-200/60 pt-1">
                            <span>Remaining Due:</span>
                            <span>{formatINR(txnDetailsData.bill.due_amount)}</span>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="p-3 bg-gray-50 rounded-xl text-gray-500 italic text-center">
                      Invoice details summary loaded.
                    </div>
                  )}
                </div>
              )}

              {/* SPECIFIC VIEW FOR CREDIT PAYMENT MODULE */}
              {selectedTxn.source_module === 'Credit Payment' && (
                <div className="bg-emerald-50/60 border border-emerald-200 p-4 rounded-xl space-y-2 text-xs">
                  <h4 className="text-xs font-semibold uppercase text-emerald-800 tracking-wider">
                    Credit Collection Details
                  </h4>
                  <div className="flex justify-between font-medium text-gray-700">
                    <span>Invoice Reference:</span>
                    <span className="font-mono text-blue-600">{selectedTxn.invoice_no || selectedTxn.ref_id}</span>
                  </div>
                  <div className="flex justify-between font-medium text-gray-700">
                    <span>Amount Received:</span>
                    <span className="font-semibold text-emerald-700">{formatINR(selectedTxn.amount)}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-[11px] text-gray-600 font-medium pt-1.5 border-t border-emerald-200/60">
                    <div>Cash: <strong className="text-emerald-700">{formatINR(selectedTxn.cash_amt)}</strong></div>
                    <div>UPI: <strong className="text-indigo-700">{formatINR(selectedTxn.upi_amt)}</strong></div>
                    <div>Bank: <strong className="text-sky-700">{formatINR(selectedTxn.bank_amt)}</strong></div>
                  </div>
                  {selectedTxn.notes && (
                    <div className="pt-1.5 border-t border-emerald-200/60">
                      <span className="text-[10px] font-medium text-gray-400 uppercase">Remarks / Notes:</span>
                      <p className="text-gray-700 font-normal">{selectedTxn.notes}</p>
                    </div>
                  )}
                </div>
              )}

            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => { setSelectedTxn(null); setTxnDetailsData(null); }}
                className="px-4 h-9 rounded-xl bg-gray-800 text-white hover:bg-gray-900 text-xs font-medium"
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
