import React, { useState, useEffect, useRef } from 'react';
import api from '../api/axios';

const CanDepositLedger = () => {
  // User context
  const currentUser = localStorage.getItem('kemps_username') || 'admin';
  const isAdmin = currentUser === 'admin';

  // Filters & Pagination
  const [isCanDepositActive, setIsCanDepositActive] = useState(true);
  const [transactions, setTransactions] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [filterType, setFilterType] = useState('All');
  const [filterPaymentMode, setFilterPaymentMode] = useState('All');
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  // Modals state
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [selectedTx, setSelectedTx] = useState(null);

  // Autocomplete state (New Deposit Form)
  const [depSearchText, setDepSearchText] = useState('');
  const [depSearchResults, setDepSearchResults] = useState([]);
  const [showDepSuggestions, setShowDepSuggestions] = useState(false);
  const [selectedDepCustomer, setSelectedDepCustomer] = useState(null);

  // Autocomplete state (Return Deposit Form)
  const [retSearchText, setRetSearchText] = useState('');
  const [retSearchResults, setRetSearchResults] = useState([]);
  const [showRetSuggestions, setShowRetSuggestions] = useState(false);
  const [selectedRetCustomer, setSelectedRetCustomer] = useState(null);

  // Form states
  const [depositForm, setDepositForm] = useState({
    qty: '',
    rate: '150',
    paymentMode: 'Cash',
    remarks: ''
  });
  const [depositError, setDepositError] = useState('');
  const [depositSuccess, setDepositSuccess] = useState('');
  const [isSavingDeposit, setIsSavingDeposit] = useState(false);

  const [returnForm, setReturnForm] = useState({
    qty: '',
    rate: '150',
    paymentMode: 'Cash',
    remarks: ''
  });
  const [returnError, setReturnError] = useState('');
  const [returnSuccess, setReturnSuccess] = useState('');
  const [isSavingReturn, setIsSavingReturn] = useState(false);

  // Deletion state
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingTxId, setDeletingTxId] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Refs for click outside suggestions
  const depSuggestionsRef = useRef(null);
  const retSuggestionsRef = useRef(null);

  // Fetch transactions list
  const fetchTransactions = async () => {
    try {
      setLoading(true);
      const res = await api.get('/can-deposit/history', {
        params: {
          page,
          limit,
          search: searchQuery,
          startDate,
          endDate,
          type: filterType,
          paymentMode: filterPaymentMode
        }
      });
      if (res.data.ok) {
        setTransactions(res.data.transactions || []);
        setTotal(res.data.total || 0);
      }
    } catch (err) {
      console.error('Failed to load transaction history:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, [page, searchQuery, startDate, endDate, filterType, filterPaymentMode]);

  useEffect(() => {
    checkCanDepositStatus();
  }, []);

  const checkCanDepositStatus = async () => {
    try {
      const res = await api.get('/finished-products', {
        params: { search: 'Can Deposit', activeOnly: false }
      });
      if (res.data.ok && res.data.products) {
        const canDep = res.data.products.find(p => p.name === 'Can Deposit');
        if (canDep) {
          setIsCanDepositActive(canDep.status === 1);
        }
      }
    } catch (err) {
      console.error('Failed to check Can Deposit status:', err);
    }
  };

  // Click outside to close suggestion boxes
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (depSuggestionsRef.current && !depSuggestionsRef.current.contains(event.target)) {
        setShowDepSuggestions(false);
      }
      if (retSuggestionsRef.current && !retSuggestionsRef.current.contains(event.target)) {
        setShowRetSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Autocomplete searches
  const handleDepCustomerSearch = async (e) => {
    const val = e.target.value;
    setDepSearchText(val);
    if (val.trim().length > 0) {
      try {
        const res = await api.get('/can-deposit/search-customer', { params: { query: val } });
        if (res.data.ok) {
          setDepSearchResults(res.data.customers || []);
          setShowDepSuggestions(true);
        }
      } catch (err) {
        console.error(err);
      }
    } else {
      setDepSearchResults([]);
      setShowDepSuggestions(false);
    }
  };

  const handleRetCustomerSearch = async (e) => {
    const val = e.target.value;
    setRetSearchText(val);
    if (val.trim().length > 0) {
      try {
        const res = await api.get('/can-deposit/search-customer', { params: { query: val } });
        if (res.data.ok) {
          setRetSearchResults(res.data.customers || []);
          setShowRetSuggestions(true);
        }
      } catch (err) {
        console.error(err);
      }
    } else {
      setRetSearchResults([]);
      setShowRetSuggestions(false);
    }
  };

  // Select handlers
  const handleSelectDepCustomer = (customer) => {
    setSelectedDepCustomer(customer);
    setDepSearchText('');
    setShowDepSuggestions(false);
    setDepositError('');
  };

  const handleSelectRetCustomer = (customer) => {
    setSelectedRetCustomer(customer);
    setRetSearchText('');
    setShowRetSuggestions(false);
    setReturnError('');
  };

  // Open Deposit Modal
  const openNewDepositModal = () => {
    setSelectedDepCustomer(null);
    setDepSearchText('');
    setDepositForm({ qty: '', rate: '150', paymentMode: 'Cash', remarks: '' });
    setDepositError('');
    setDepositSuccess('');
    setIsDepositModalOpen(true);
  };

  // Open Return Modal
  const openReturnModal = () => {
    setSelectedRetCustomer(null);
    setRetSearchText('');
    setReturnForm({ qty: '', rate: '150', paymentMode: 'Cash', remarks: '' });
    setReturnError('');
    setReturnSuccess('');
    setIsReturnModalOpen(true);
  };

  // Reset filters
  const resetFilters = () => {
    setSearchQuery('');
    setStartDate('');
    setEndDate('');
    setFilterType('All');
    setFilterPaymentMode('All');
    setPage(1);
  };

  // Save Deposit submission
  const handleSaveDeposit = async (e) => {
    e.preventDefault();
    setDepositError('');
    setDepositSuccess('');

    if (!selectedDepCustomer) {
      setDepositError('Please select a customer first.');
      return;
    }

    const qty = parseInt(depositForm.qty, 10);
    const rate = parseFloat(depositForm.rate);

    if (isNaN(qty) || qty <= 0) {
      setDepositError('Quantity must be a positive number greater than 0.');
      return;
    }
    if (isNaN(rate) || rate < 0) {
      setDepositError('Rate cannot be negative.');
      return;
    }

    setIsSavingDeposit(true);
    try {
      const payload = {
        customerId: selectedDepCustomer.id,
        qty,
        rate,
        paymentMode: depositForm.paymentMode,
        remarks: depositForm.remarks,
        createdBy: currentUser
      };

      const res = await api.post('/can-deposit', payload);
      if (res.data.ok) {
        setDepositSuccess('Deposit logged and recorded as Sales successfully!');
        setTimeout(() => {
          setIsDepositModalOpen(false);
          fetchTransactions();
        }, 1200);
      } else {
        setDepositError(res.data.error || 'Failed to save deposit.');
      }
    } catch (err) {
      setDepositError(err.response?.data?.error || err.message);
    } finally {
      setIsSavingDeposit(false);
    }
  };

  // Save Return submission
  const handleSaveReturn = async (e) => {
    e.preventDefault();
    setReturnError('');
    setReturnSuccess('');

    if (!selectedRetCustomer) {
      setReturnError('Please select a customer first.');
      return;
    }

    const qty = parseInt(returnForm.qty, 10);
    const rate = parseFloat(returnForm.rate);
    const returnAmount = qty * rate;
    const availableBalance = parseFloat(selectedRetCustomer.depositBalance || 0);

    if (isNaN(qty) || qty <= 0) {
      setReturnError('Quantity must be a positive number greater than 0.');
      return;
    }
    if (isNaN(rate) || rate < 0) {
      setReturnError('Rate cannot be negative.');
      return;
    }
    if (returnAmount > availableBalance) {
      setReturnError('Return amount exceeds available deposit balance.');
      return;
    }

    setIsSavingReturn(true);
    try {
      const payload = {
        customerId: selectedRetCustomer.id,
        qty,
        rate,
        returnAmount,
        paymentMode: returnForm.paymentMode,
        remarks: returnForm.remarks,
        createdBy: currentUser
      };

      const res = await api.post('/can-deposit/return', payload);
      if (res.data.ok) {
        setReturnSuccess('Deposit returned and recorded as Expense successfully!');
        setTimeout(() => {
          setIsReturnModalOpen(false);
          fetchTransactions();
        }, 1200);
      } else {
        setReturnError(res.data.error || 'Failed to process return.');
      }
    } catch (err) {
      setReturnError(err.response?.data?.error || err.message);
    } finally {
      setIsSavingReturn(false);
    }
  };

  // Open delete confirmation
  const confirmDeleteTx = (id) => {
    setDeletingTxId(id);
    setIsDeleteModalOpen(true);
  };

  // Handle transaction delete
  const handleDeleteTx = async () => {
    setIsDeleting(true);
    try {
      const res = await api.delete(`/can-deposit/${deletingTxId}`);
      if (res.data.ok) {
        setIsDeleteModalOpen(false);
        setDeletingTxId(null);
        fetchTransactions();
      } else {
        alert(res.data.error || 'Failed to delete transaction.');
      }
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  // View details modal
  const openViewTx = (tx) => {
    setSelectedTx(tx);
    setIsViewModalOpen(true);
  };

  // Print Receipt handlers
  const handlePrintReceipt = (tx) => {
    const isDeposit = tx.transaction_type === 'Deposit Received';
    const printWindow = window.open('', '_blank');
    const title = isDeposit ? 'CAN DEPOSIT RECEIPT' : 'CAN DEPOSIT REFUND RECEIPT';
    const amountLabel = isDeposit ? 'Amount Received' : 'Refund Amount';
    const nameLabel = isDeposit ? 'Received By' : 'Approved By';

    const html = `
      <html>
        <head>
          <title>Receipt - ${tx.transaction_id}</title>
          <style>
            body { font-family: 'Courier New', Courier, monospace; padding: 15px; color: #000; width: 320px; font-size: 12px; line-height: 1.4; }
            .center { text-align: center; }
            .bold { font-weight: bold; }
            .divider { border-bottom: 1px dashed #000; margin: 8px 0; }
            .header h3 { margin: 0; text-transform: uppercase; font-size: 14px; }
            .header p { margin: 2px 0; font-size: 10px; }
            .meta-table { width: 100%; border-collapse: collapse; font-size: 11px; }
            .meta-table td { padding: 3px 0; }
            .right { text-align: right; }
            .footer-msg { margin-top: 25px; text-align: center; font-size: 10px; }
            @media print {
              body { padding: 0; margin: 0; }
            }
          </style>
        </head>
        <body>
          <div class="center header">
            <h3 class="bold">KEMP'S BEVERAGES</h3>
            <p>Water Can Management Systems</p>
            <p class="bold" style="margin-top: 5px; font-size: 11px;">${title}</p>
          </div>
          
          <div class="divider"></div>
          
          <table class="meta-table">
            <tr>
              <td class="bold">Txn ID:</td>
              <td class="right">${tx.transaction_id}</td>
            </tr>
            <tr>
              <td class="bold">Date:</td>
              <td class="right">${tx.created_at}</td>
            </tr>
            <tr>
              <td class="bold">Customer:</td>
              <td class="right">${tx.customer_name}</td>
            </tr>
            <tr>
              <td class="bold">Mobile:</td>
              <td class="right">${tx.mobile_number}</td>
            </tr>
            ${isDeposit ? `
            <tr>
              <td class="bold">Product:</td>
              <td class="right">Can Deposit</td>
            </tr>
            <tr>
              <td class="bold">Qty:</td>
              <td class="right">${tx.qty}</td>
            </tr>
            <tr>
              <td class="bold">Rate:</td>
              <td class="right">₹ ${parseFloat(tx.rate).toFixed(2)}</td>
            </tr>
            ` : ''}
            <tr>
              <td class="bold">${amountLabel}:</td>
              <td class="right bold" style="font-size: 13px;">₹ ${parseFloat(tx.amount).toFixed(2)}</td>
            </tr>
            <tr>
              <td class="bold">Payment Mode:</td>
              <td class="right uppercase">${tx.payment_mode}</td>
            </tr>
            ${tx.remarks ? `
            <tr>
              <td class="bold">Remarks:</td>
              <td class="right" style="word-break: break-all;">${tx.remarks}</td>
            </tr>
            ` : ''}
            <tr>
              <td class="bold">Running Bal:</td>
              <td class="right bold">₹ ${parseFloat(tx.balance_after_transaction).toFixed(2)}</td>
            </tr>
            <tr>
              <td class="bold">${nameLabel}:</td>
              <td class="right">${tx.created_by}</td>
            </tr>
          </table>

          <div class="divider"></div>

          <div class="footer-msg">
            <p class="bold">Thank You for Your Security Deposit!</p>
            <p>Powered by Kemp's ERP Suite</p>
          </div>

          <script>
            window.onload = function() {
              window.print();
              window.onafterprint = function() { window.close(); };
            }
          </script>
        </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
  };

  // Helper date conversions
  const formatDateDDMMYYYY = (dateStr) => {
    if (!dateStr) return '—';
    const parts = dateStr.split(' ');
    const dStr = parts[0];
    const dParts = dStr.split('-');
    if (dParts.length === 3) {
      return `${dParts[2]}/${dParts[1]}/${dParts[0]}${parts[1] ? ' ' + parts[1] : ''}`;
    }
    return dateStr;
  };

  const totalPages = Math.ceil(total / limit) || 1;

  // Real-time Deposit calculation
  const totalDepositAmount = (parseInt(depositForm.qty, 10) || 0) * (parseFloat(depositForm.rate) || 0);
  const totalReturnAmount = (parseInt(returnForm.qty, 10) || 0) * (parseFloat(returnForm.rate) || 0);

  return (
    <div className="space-y-6 animate-fade-in max-w-6xl mx-auto pb-12">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase">Can Deposit Ledger</h1>
          <p className="text-slate-500 text-sm font-medium mt-1">Manage refundable client deposits, returns, and accounting history.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button 
            onClick={openNewDepositModal}
            disabled={!isCanDepositActive}
            className={`btn-premium h-12 ${
              isCanDepositActive 
                ? 'btn-primary-premium' 
                : 'bg-slate-200 text-slate-400 cursor-not-allowed border-slate-300 shadow-none'
            }`}
          >
            <span className="text-xl">+</span> New Deposit
          </button>
          <button 
            onClick={openReturnModal}
            disabled={!isCanDepositActive}
            className={`btn-premium h-12 flex items-center gap-1.5 ${
              isCanDepositActive 
                ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-md shadow-amber-200' 
                : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
            }`}
          >
            ↩ Return Deposit
          </button>
          <button 
            onClick={resetFilters}
            className="btn-premium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs px-4 h-12 flex items-center gap-1.5"
          >
            📜 History
          </button>
        </div>
      </div>

      {!isCanDepositActive && (
        <div className="bg-red-50 border-2 border-red-200 text-red-800 p-4 rounded-2xl flex items-center gap-3 font-semibold text-sm">
          <span>⚠️</span>
          <span>
            <b>"Can Deposit" is currently disabled in the Product Master.</b> New deposit registrations and refunds are locked. Re-enable it in the Product Master to restore deposit functions.
          </span>
        </div>
      )}

      {/* FILTER PANEL */}
      <div className="border border-slate-200/80 bg-white rounded-2xl p-5 shadow-sm space-y-4">
        <div className="text-[10px] font-black text-slate-450 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-50 pb-2.5">
          <span>🔍</span> Query Filters & Filters
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {/* Customer Search */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-450 uppercase tracking-wider block">Customer Search</label>
            <input 
              type="text"
              placeholder="Name, Phone, Txn ID..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
              className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-slate-50/20 text-slate-700 placeholder:text-slate-400 focus:bg-white focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-xs font-medium"
            />
          </div>

          {/* Start Date */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-450 uppercase tracking-wider block">From Date</label>
            <input 
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
              className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-slate-50/20 text-slate-700 focus:bg-white focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-xs font-medium"
            />
          </div>

          {/* End Date */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-450 uppercase tracking-wider block">To Date</label>
            <input 
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
              className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-slate-50/20 text-slate-700 focus:bg-white focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-xs font-medium"
            />
          </div>

          {/* Transaction Type */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-450 uppercase tracking-wider block">Transaction Type</label>
            <select
              value={filterType}
              onChange={(e) => { setFilterType(e.target.value); setPage(1); }}
              className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-slate-50/20 text-slate-700 focus:bg-white focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-xs font-semibold"
            >
              <option value="All">All Types</option>
              <option value="Deposit Received">Deposit Received</option>
              <option value="Deposit Returned">Deposit Returned</option>
            </select>
          </div>

          {/* Payment Mode */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-450 uppercase tracking-wider block">Payment Mode</label>
            <select
              value={filterPaymentMode}
              onChange={(e) => { setFilterPaymentMode(e.target.value); setPage(1); }}
              className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-slate-50/20 text-slate-700 focus:bg-white focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-xs font-semibold"
            >
              <option value="All">All Modes</option>
              <option value="Cash">Cash</option>
              <option value="UPI">UPI</option>
              <option value="Bank Transfer">Bank Transfer</option>
            </select>
          </div>
        </div>
      </div>

      {/* TRANSACTION LIST TABLE */}
      <div className="border border-slate-200/60 bg-white rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <span className="loading loading-spinner text-primary"></span>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/75 border-b border-slate-200/80 text-[10px] font-black text-slate-455 uppercase tracking-wider">
                    <th className="py-4 px-5">Date & Time</th>
                    <th className="py-4 px-5">Transaction ID</th>
                    <th className="py-4 px-5">Customer Name</th>
                    <th className="py-4 px-5">Mobile</th>
                    <th className="py-4 px-5">Type</th>
                    <th className="py-4 px-5 text-center">Qty</th>
                    <th className="py-4 px-5 text-right">Rate</th>
                    <th className="py-4 px-5 text-right">Amount</th>
                    <th className="py-4 px-5 text-center">Mode</th>
                    <th className="py-4 px-5 text-center">Status</th>
                    <th className="py-4 px-5 text-right">Balance After</th>
                    <th className="py-4 px-5">Remarks</th>
                    <th className="py-4 px-5 text-center">Created By</th>
                    <th className="py-4 px-5 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700 text-xs font-semibold">
                  {transactions.map(tx => (
                    <tr key={tx.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3.5 px-5 font-mono text-[11px] text-slate-500">{formatDateDDMMYYYY(tx.created_at)}</td>
                      <td className="py-3.5 px-5 font-black text-primary">{tx.transaction_id}</td>
                      <td className="py-3.5 px-5 font-bold text-slate-800">{tx.customer_name}</td>
                      <td className="py-3.5 px-5 text-slate-500">{tx.mobile_number}</td>
                      <td className="py-3.5 px-5">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold border ${
                          tx.transaction_type === 'Deposit Received' 
                            ? 'bg-emerald-50 border-emerald-100 text-emerald-600' 
                            : 'bg-rose-50 border-rose-100 text-rose-500'
                        }`}>
                          {tx.transaction_type}
                        </span>
                      </td>
                      <td className="py-3.5 px-5 text-center">{tx.qty || '—'}</td>
                      <td className="py-3.5 px-5 text-right">{tx.qty > 0 ? `₹${parseFloat(tx.rate).toFixed(2)}` : '—'}</td>
                      <td className="py-3.5 px-5 text-right font-bold text-slate-800">
                        ₹ {parseFloat(tx.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3.5 px-5 text-center">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] uppercase font-bold">
                          {tx.payment_mode}
                        </span>
                      </td>
                      <td className="py-3.5 px-5 text-center">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold ${
                          tx.payment_status === 'Approved' ? 'bg-emerald-50 text-emerald-600' :
                          tx.payment_status === 'Pending Approval' ? 'bg-amber-50 text-amber-600' :
                          tx.payment_status === 'Rejected' ? 'bg-rose-50 text-rose-600' :
                          'bg-slate-50 text-slate-500'
                        }`}>
                          {(tx.payment_status || 'Pending Approval').toUpperCase()}
                        </span>
                      </td>
                      <td className="py-3.5 px-5 text-right font-black text-slate-800 bg-slate-50/50">
                        ₹ {parseFloat(tx.balance_after_transaction).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3.5 px-5 text-slate-400 max-w-[120px] truncate" title={tx.remarks}>{tx.remarks || '—'}</td>
                      <td className="py-3.5 px-5 text-center text-slate-500">{tx.created_by}</td>
                      <td className="py-3.5 px-5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button 
                            onClick={() => openViewTx(tx)}
                            className="px-2 py-1 rounded bg-slate-50 border border-slate-200 text-slate-650 hover:bg-slate-100 hover:text-slate-850 font-bold transition-all text-[11px]"
                          >
                            👁 View
                          </button>
                          <button 
                            onClick={() => handlePrintReceipt(tx)}
                            className="px-2 py-1 rounded bg-primary/10 text-primary border border-primary/20 hover:bg-primary hover:text-white font-bold transition-all text-[11px]"
                          >
                            🖨 Print
                          </button>
                          {isAdmin ? (
                            <button 
                              onClick={() => confirmDeleteTx(tx.id)}
                              disabled={tx.payment_status !== 'Pending Approval'}
                              className="px-2 py-1 rounded bg-red-50 border border-red-100 text-red-500 hover:bg-red-100 hover:text-red-700 font-bold transition-all text-[11px] disabled:opacity-50 disabled:cursor-not-allowed"
                              title={tx.payment_status !== 'Pending Approval' ? "Processed records are locked to preserve audit trail" : "Delete transaction"}
                            >
                              ✕ Delete
                            </button>
                          ) : (
                            <button 
                              disabled
                              className="px-2 py-1 rounded bg-slate-100 border border-slate-100 text-slate-300 font-bold cursor-not-allowed text-[11px]"
                              title="Administrator only"
                            >
                              ✕ Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}

                  {transactions.length === 0 && (
                    <tr>
                      <td colSpan="14" className="py-16 text-center text-slate-400 font-semibold text-xs bg-slate-50/20">
                        No transactions found in can deposit history ledger matching queries.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 bg-slate-50/50 border-t border-slate-100">
                <span className="text-xs text-slate-450 font-bold">
                  Showing Page {page} of {totalPages} ({total} entries total)
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(prev => Math.max(prev - 1, 1))}
                    disabled={page === 1}
                    className="px-3.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    ← Previous
                  </button>
                  <button
                    onClick={() => setPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={page === totalPages}
                    className="px-3.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* NEW DEPOSIT MODAL */}
      {isDepositModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm pointer-events-auto animate-fade-in">
          <div className="bg-white rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.2)] border border-slate-200 w-[600px] max-h-[90vh] flex flex-col overflow-hidden">
            
            {/* Modal Header */}
            <div className="bg-primary p-6 text-white shrink-0 relative">
              <h3 className="text-xl font-black italic tracking-tight uppercase">New Can Deposit</h3>
              <p className="text-blue-100 text-xs mt-1 font-medium italic opacity-85">Record client refundable security deposits as Sales income</p>
              <button 
                onClick={() => setIsDepositModalOpen(false)}
                className="absolute right-6 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-all font-bold"
              >
                ✕
              </button>
            </div>

            {/* Scrollable Form Body */}
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
              <form id="depositForm" onSubmit={handleSaveDeposit} className="space-y-6">
                
                {/* Customer Autocomplete Dropdown Search */}
                <div className="space-y-2 relative" ref={depSuggestionsRef}>
                  <label className="label-premium block">Select Customer *</label>
                  <input
                    type="text"
                    placeholder="Search customer by name or mobile..."
                    value={depSearchText}
                    onChange={handleDepCustomerSearch}
                    className="input-premium w-full h-11 bg-white"
                    disabled={selectedDepCustomer !== null}
                  />
                  
                  {showDepSuggestions && depSearchResults.length > 0 && (
                    <ul className="absolute z-50 w-full bg-white border border-slate-200 rounded-xl mt-1.5 shadow-lg max-h-48 overflow-y-auto divide-y divide-slate-100">
                      {depSearchResults.map(cust => (
                        <li 
                          key={cust.id} 
                          onClick={() => handleSelectDepCustomer(cust)}
                          className="px-4 py-2.5 hover:bg-slate-50 cursor-pointer flex justify-between items-center text-xs font-bold text-slate-700"
                        >
                          <div>
                            <div>{cust.name}</div>
                            <div className="text-[10px] text-slate-400 font-medium">{cust.phone}</div>
                          </div>
                          <span className="text-[9px] uppercase bg-slate-100 text-slate-500 rounded px-1.5 py-0.5">{cust.customerType}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* Selected Customer Panel */}
                  {selectedDepCustomer && (
                    <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 flex justify-between items-start animate-fade-in">
                      <div className="space-y-1 text-xs text-slate-650 font-semibold">
                        <div className="text-slate-800 font-extrabold text-sm">{selectedDepCustomer.name}</div>
                        <div>Customer ID: <span className="font-mono text-primary font-bold">{selectedDepCustomer.id}</span></div>
                        <div>Mobile: {selectedDepCustomer.phone}</div>
                        {selectedDepCustomer.address && <div>Address: {selectedDepCustomer.address}</div>}
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] font-black text-slate-450 uppercase tracking-wider">Current Deposit Balance</div>
                        <div className="text-sm font-black text-slate-800 mt-1">₹ {parseFloat(selectedDepCustomer.depositBalance || 0).toFixed(2)}</div>
                        <button
                          type="button"
                          onClick={() => setSelectedDepCustomer(null)}
                          className="text-[10px] text-red-500 hover:underline font-bold mt-2 outline-none"
                        >
                          ✕ Clear Selection
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Form fields grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 border border-slate-150 p-5 rounded-2xl bg-[#fcfdff]/50">
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest block border-b border-slate-100 pb-1.5">
                      Deposit Specifications
                    </label>
                  </div>

                  {/* Product (Fixed value) */}
                  <div className="space-y-1.5">
                    <label className="label-premium block">Product (Fixed)</label>
                    <input
                      type="text"
                      value="Can Deposit"
                      readOnly
                      className="input-premium w-full h-11 bg-slate-50 text-slate-500 border-dashed"
                    />
                  </div>

                  {/* Quantity */}
                  <div className="space-y-1.5">
                    <label className="label-premium block">Quantity *</label>
                    <input
                      type="number"
                      placeholder="e.g. 10"
                      value={depositForm.qty}
                      onChange={(e) => setDepositForm(prev => ({ ...prev, qty: e.target.value }))}
                      className="input-premium w-full h-11 bg-white font-black"
                      required
                    />
                  </div>

                  {/* Rate */}
                  <div className="space-y-1.5">
                    <label className="label-premium block">Rate (per Can Deposit) *</label>
                    <input
                      type="number"
                      placeholder="e.g. 150"
                      value={depositForm.rate}
                      onChange={(e) => setDepositForm(prev => ({ ...prev, rate: e.target.value }))}
                      className="input-premium w-full h-11 bg-white font-bold"
                      required
                    />
                  </div>

                  {/* Total (Auto calculate) */}
                  <div className="space-y-1.5">
                    <label className="label-premium block">Total Amount (₹)</label>
                    <input
                      type="text"
                      value={`₹ ${totalDepositAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                      readOnly
                      className="input-premium w-full h-11 bg-slate-100 font-black text-indigo-600"
                    />
                  </div>

                  {/* Payment Mode */}
                  <div className="space-y-1.5">
                    <label className="label-premium block">Payment Mode *</label>
                    <select
                      value={depositForm.paymentMode}
                      onChange={(e) => setDepositForm(prev => ({ ...prev, paymentMode: e.target.value }))}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3.5 h-11 outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 text-sm font-semibold transition-all"
                      required
                    >
                      <option value="Cash">Cash</option>
                      <option value="UPI">UPI</option>
                      <option value="Bank Transfer">Bank Transfer</option>
                    </select>
                  </div>

                  {/* Remarks */}
                  <div className="space-y-1.5">
                    <label className="label-premium block">Remarks</label>
                    <input
                      type="text"
                      placeholder="Add descriptions..."
                      value={depositForm.remarks}
                      onChange={(e) => setDepositForm(prev => ({ ...prev, remarks: e.target.value }))}
                      className="input-premium w-full h-11 bg-white"
                    />
                  </div>
                </div>

                {depositError && (
                  <div className="status-msg status-err flex items-center gap-2 py-3 px-4 rounded-xl text-xs font-semibold">
                    <span>⚠️</span> {depositError}
                  </div>
                )}
                {depositSuccess && (
                  <div className="status-msg status-ok flex items-center gap-2 py-3 px-4 rounded-xl text-xs font-semibold">
                    <span>✅</span> {depositSuccess}
                  </div>
                )}
              </form>
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-slate-100 bg-white flex gap-3 shrink-0 shadow-[0_-10px_30px_rgba(0,0,0,0.02)]">
              <button 
                type="submit" 
                form="depositForm"
                disabled={isSavingDeposit}
                className="btn-premium btn-primary-premium flex-[2] h-13 text-xs uppercase"
              >
                {isSavingDeposit ? <span className="loading loading-spinner"></span> : 'Save Deposit'}
              </button>
              <button 
                type="button" 
                onClick={() => setIsDepositModalOpen(false)}
                className="btn-premium bg-slate-50 text-slate-500 hover:bg-slate-100 border border-slate-200 flex-1 h-13 text-xs font-bold uppercase"
              >
                Cancel
              </button>
            </div>

          </div>
        </div>
      )}

      {/* RETURN DEPOSIT MODAL */}
      {isReturnModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm pointer-events-auto animate-fade-in">
          <div className="bg-white rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.2)] border border-slate-200 w-[600px] max-h-[90vh] flex flex-col overflow-hidden">
            
            {/* Modal Header */}
            <div className="bg-[#1e293b] p-6 text-white shrink-0 relative">
              <h3 className="text-xl font-black italic tracking-tight uppercase">↩ Return Deposit Amount</h3>
              <p className="text-slate-300 text-xs mt-1 font-medium italic opacity-85">Refund customer security deposits and log as Expense</p>
              <button 
                onClick={() => setIsReturnModalOpen(false)}
                className="absolute right-6 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-all font-bold"
              >
                ✕
              </button>
            </div>

            {/* Form Body */}
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
              <form id="returnForm" onSubmit={handleSaveReturn} className="space-y-6">
                
                {/* Customer Autocomplete Dropdown Search */}
                <div className="space-y-2 relative" ref={retSuggestionsRef}>
                  <label className="label-premium block">Select Customer *</label>
                  <input
                    type="text"
                    placeholder="Search customer by name or mobile..."
                    value={retSearchText}
                    onChange={handleRetCustomerSearch}
                    className="input-premium w-full h-11 bg-white"
                    disabled={selectedRetCustomer !== null}
                  />
                  
                  {showRetSuggestions && retSearchResults.length > 0 && (
                    <ul className="absolute z-50 w-full bg-white border border-slate-200 rounded-xl mt-1.5 shadow-lg max-h-48 overflow-y-auto divide-y divide-slate-100">
                      {retSearchResults.map(cust => (
                        <li 
                          key={cust.id} 
                          onClick={() => handleSelectRetCustomer(cust)}
                          className="px-4 py-2.5 hover:bg-slate-50 cursor-pointer flex justify-between items-center text-xs font-bold text-slate-700"
                        >
                          <div>
                            <div>{cust.name}</div>
                            <div className="text-[10px] text-slate-400 font-medium">{cust.phone}</div>
                          </div>
                          <span className="text-[9px] uppercase bg-slate-100 text-slate-500 rounded px-1.5 py-0.5">{cust.customerType}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* Selected Customer Display Panel */}
                  {selectedRetCustomer && (
                    <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 flex justify-between items-start animate-fade-in">
                      <div className="space-y-1 text-xs text-slate-650 font-semibold">
                        <div className="text-slate-800 font-extrabold text-sm">{selectedRetCustomer.name}</div>
                        <div>Customer ID: <span className="font-mono text-primary font-bold">{selectedRetCustomer.id}</span></div>
                        <div>Mobile: {selectedRetCustomer.phone}</div>
                        {selectedRetCustomer.address && <div>Address: {selectedRetCustomer.address}</div>}
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] font-black text-slate-450 uppercase tracking-wider">Available Deposit Balance</div>
                        <div className="text-sm font-black text-rose-600 mt-1">₹ {parseFloat(selectedRetCustomer.depositBalance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                        <button
                          type="button"
                          onClick={() => setSelectedRetCustomer(null)}
                          className="text-[10px] text-red-500 hover:underline font-bold mt-2 outline-none"
                        >
                          ✕ Clear Selection
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Form fields grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 border border-slate-150 p-5 rounded-2xl bg-[#fffdfa]/60">
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest block border-b border-slate-100 pb-1.5">
                      Refund Specifications
                    </label>
                  </div>

                  {/* Available Balance (Display) */}
                  <div className="space-y-1.5">
                    <label className="label-premium block">Available Deposit Balance</label>
                    <input
                      type="text"
                      value={selectedRetCustomer ? `₹ ${parseFloat(selectedRetCustomer.depositBalance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '₹ 0.00'}
                      readOnly
                      className="input-premium w-full h-11 bg-slate-100 font-black text-slate-700 border-dashed"
                    />
                  </div>

                  {/* Quantity */}
                  <div className="space-y-1.5">
                    <label className="label-premium block">Return Quantity *</label>
                    <input
                      type="number"
                      placeholder="e.g. 10"
                      value={returnForm.qty}
                      onChange={(e) => setReturnForm(prev => ({ ...prev, qty: e.target.value }))}
                      className="input-premium w-full h-11 bg-white font-black"
                      required
                    />
                  </div>

                  {/* Rate */}
                  <div className="space-y-1.5">
                    <label className="label-premium block">Rate *</label>
                    <input
                      type="number"
                      placeholder="e.g. 150"
                      value={returnForm.rate}
                      onChange={(e) => setReturnForm(prev => ({ ...prev, rate: e.target.value }))}
                      className="input-premium w-full h-11 bg-white font-bold"
                      required
                    />
                  </div>

                  {/* Return Amount (Auto calculate) */}
                  <div className="space-y-1.5">
                    <label className="label-premium block">Return Amount (₹)</label>
                    <input
                      type="text"
                      value={`₹ ${totalReturnAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                      readOnly
                      className="input-premium w-full h-11 bg-slate-100 font-black text-rose-600"
                    />
                  </div>

                  {/* Payment Mode */}
                  <div className="space-y-1.5">
                    <label className="label-premium block">Payment Mode *</label>
                    <select
                      value={returnForm.paymentMode}
                      onChange={(e) => setReturnForm(prev => ({ ...prev, paymentMode: e.target.value }))}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3.5 h-11 outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 text-sm font-semibold transition-all"
                      required
                    >
                      <option value="Cash">Cash</option>
                      <option value="UPI">UPI</option>
                      <option value="Bank Transfer">Bank Transfer</option>
                    </select>
                  </div>

                  {/* Remarks */}
                  <div className="space-y-1.5">
                    <label className="label-premium block">Remarks</label>
                    <input
                      type="text"
                      placeholder="Add return descriptions..."
                      value={returnForm.remarks}
                      onChange={(e) => setReturnForm(prev => ({ ...prev, remarks: e.target.value }))}
                      className="input-premium w-full h-11 bg-white"
                    />
                  </div>
                </div>

                {returnError && (
                  <div className="status-msg status-err flex items-center gap-2 py-3 px-4 rounded-xl text-xs font-semibold">
                    <span>⚠️</span> {returnError}
                  </div>
                )}
                {returnSuccess && (
                  <div className="status-msg status-ok flex items-center gap-2 py-3 px-4 rounded-xl text-xs font-semibold">
                    <span>✅</span> {returnSuccess}
                  </div>
                )}
              </form>
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-slate-100 bg-white flex gap-3 shrink-0 shadow-[0_-10px_30px_rgba(0,0,0,0.02)]">
              <button 
                type="submit" 
                form="returnForm"
                disabled={isSavingReturn || (selectedRetCustomer && (totalReturnAmount > parseFloat(selectedRetCustomer.depositBalance || 0)))}
                className="btn-premium bg-[#1e293b] hover:bg-slate-800 text-white flex-[2] h-13 text-xs uppercase"
              >
                {isSavingReturn ? <span className="loading loading-spinner"></span> : 'Return Deposit Amount'}
              </button>
              <button 
                type="button" 
                onClick={() => setIsReturnModalOpen(false)}
                className="btn-premium bg-slate-50 text-slate-500 hover:bg-slate-100 border border-slate-200 flex-1 h-13 text-xs font-bold uppercase"
              >
                Cancel
              </button>
            </div>

          </div>
        </div>
      )}

      {/* VIEW DETAIL TRANSACTION MODAL */}
      {isViewModalOpen && selectedTx && (
        <div className="modal modal-open animate-fade-in">
          <div className="modal-box bg-white border border-slate-200 rounded-3xl p-8 relative shadow-2xl max-w-lg max-h-[90vh] overflow-y-auto">
            <button 
              onClick={() => setIsViewModalOpen(false)}
              className="absolute top-4 right-4 w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 text-slate-505 hover:bg-slate-100 flex items-center justify-center font-bold"
            >
              ✕
            </button>

            <div className="border border-slate-200 p-6 rounded-2xl bg-slate-50/50 space-y-4">
              <h3 className="text-base font-black text-slate-850 border-b border-slate-200 pb-2 flex items-center gap-1.5 uppercase">
                <span>📋</span> Transaction Details
              </h3>

              <div className="space-y-3.5 text-xs font-semibold text-slate-700">
                <div className="grid grid-cols-3 gap-2">
                  <span className="text-slate-400 font-bold text-[10px] uppercase">Transaction ID</span>
                  <span className="col-span-2 font-mono font-bold text-primary">{selectedTx.transaction_id}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <span className="text-slate-400 font-bold text-[10px] uppercase">Type</span>
                  <span className="col-span-2 font-black text-slate-800">{selectedTx.transaction_type}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <span className="text-slate-400 font-bold text-[10px] uppercase">Customer</span>
                  <span className="col-span-2 font-extrabold text-slate-800">{selectedTx.customer_name} ({selectedTx.mobile_number})</span>
                </div>
                {selectedTx.qty > 0 && (
                  <>
                    <div className="grid grid-cols-3 gap-2">
                      <span className="text-slate-400 font-bold text-[10px] uppercase">Quantity</span>
                      <span className="col-span-2">{selectedTx.qty} Cans</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <span className="text-slate-400 font-bold text-[10px] uppercase">Rate</span>
                      <span className="col-span-2">₹ {parseFloat(selectedTx.rate).toFixed(2)}</span>
                    </div>
                  </>
                )}
                <div className="grid grid-cols-3 gap-2">
                  <span className="text-slate-400 font-bold text-[10px] uppercase">Total Amount</span>
                  <span className="col-span-2 font-black text-slate-850 text-sm">₹ {parseFloat(selectedTx.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <span className="text-slate-400 font-bold text-[10px] uppercase">Payment Mode</span>
                  <span className="col-span-2 uppercase text-[10px]">{selectedTx.payment_mode}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <span className="text-slate-400 font-bold text-[10px] uppercase">Payment Status</span>
                  <span className="col-span-2">
                    <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold border ${
                      selectedTx.payment_status === 'Approved' ? 'bg-emerald-50 border-emerald-100 text-emerald-600' :
                      selectedTx.payment_status === 'Pending Approval' ? 'bg-amber-50 border-amber-100 text-amber-600' :
                      selectedTx.payment_status === 'Rejected' ? 'bg-rose-50 border-rose-100 text-rose-600' :
                      'bg-slate-50 border-slate-100 text-slate-500'
                    }`}>
                      {(selectedTx.payment_status || 'Pending Approval').toUpperCase()}
                    </span>
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <span className="text-slate-400 font-bold text-[10px] uppercase">Running Balance</span>
                  <span className="col-span-2 font-black text-slate-855">₹ {parseFloat(selectedTx.balance_after_transaction).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <span className="text-slate-400 font-bold text-[10px] uppercase">Date Recorded</span>
                  <span className="col-span-2 font-mono">{formatDateDDMMYYYY(selectedTx.created_at)}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <span className="text-slate-400 font-bold text-[10px] uppercase">Recorded By</span>
                  <span className="col-span-2">{selectedTx.created_by}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <span className="text-slate-400 font-bold text-[10px] uppercase">Remarks</span>
                  <span className="col-span-2 font-normal text-slate-500 italic whitespace-pre-wrap">{selectedTx.remarks || '—'}</span>
                </div>
              </div>
            </div>

            <div className="flex gap-2.5 mt-6">
              <button 
                onClick={() => handlePrintReceipt(selectedTx)}
                className="btn-premium btn-primary-premium flex-1 h-11 text-xs uppercase"
              >
                🖨 Print POS Receipt
              </button>
              <button 
                onClick={() => setIsViewModalOpen(false)}
                className="btn-premium bg-slate-900 text-white hover:bg-slate-800 flex-1 h-11 text-xs uppercase"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {isDeleteModalOpen && (
        <div className="modal modal-open animate-fade-in">
          <div className="modal-box bg-white border border-slate-200 rounded-3xl p-6 shadow-xl max-w-sm max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-black text-slate-850 uppercase">Delete Transaction?</h3>
            <p className="text-slate-500 text-xs font-semibold mt-2">
              Are you sure you want to delete deposit ledger entry <span className="font-mono text-rose-500 font-bold">#{deletingTxId}</span>? This will revert customer deposit balance calculations and delete the programmatically generated invoice or expense record.
            </p>
            <div className="flex justify-end gap-3 mt-6">
              <button 
                onClick={handleDeleteTx}
                disabled={isDeleting}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all"
              >
                {isDeleting ? 'Deleting...' : 'Yes, Delete'}
              </button>
              <button 
                onClick={() => {
                  setIsDeleteModalOpen(false);
                  setDeletingTxId(null);
                }}
                className="px-5 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-550 hover:bg-slate-50 text-xs font-bold transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default CanDepositLedger;
