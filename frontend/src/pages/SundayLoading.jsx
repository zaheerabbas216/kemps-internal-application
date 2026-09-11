import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import SearchableSelect from '../components/SearchableSelect';

// Currency formatting helper
const formatINR = (val) =>
  `₹ ${parseFloat(val || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const fmtDate = (dateStr) => {
  if (!dateStr) return '—';
  const [y, m, d] = String(dateStr).split('T')[0].split('-');
  return `${d}/${m}/${y}`;
};

const getTodayIST = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const ist = new Date(now.getTime() + (330 + offset) * 60000);
  return `${ist.getFullYear()}-${String(ist.getMonth() + 1).padStart(2, '0')}-${String(ist.getDate()).padStart(2, '0')}`;
};

const SundayLoading = () => {
  const navigate = useNavigate();
  const today = getTodayIST();

  // Dropdown lists
  const [customers, setCustomers] = useState([]);
  const [finishedProducts, setFinishedProducts] = useState([]);
  const [loadingDropdowns, setLoadingDropdowns] = useState(true);

  // Selected customer details preview
  const [selectedCustomerObj, setSelectedCustomerObj] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    loadingDate: today,
    customerId: '',
    customerName: '',
    customerPhone: '',
    customerAddress: '',
    customerType: '',
    productId: '',
    productName: '',
    quantity: '',
    rate: '',
    cashAmount: '',
    upiAmount: '',
    bankAmount: '',
    notes: ''
  });

  // Today's recent records & summary
  const [todayRecords, setTodayRecords] = useState([]);
  const [todaySummary, setTodaySummary] = useState(null);
  const [loadingToday, setLoadingToday] = useState(false);

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', message: '' });
  const [selectedRecordForModal, setSelectedRecordForModal] = useState(null);

  // Computed Values
  const quantityNum = parseFloat(formData.quantity) || 0;
  const rateNum = parseFloat(formData.rate) || 0;
  const totalAmount = Math.round(quantityNum * rateNum * 100) / 100;

  const cashNum = Math.max(0, parseFloat(formData.cashAmount) || 0);
  const upiNum = Math.max(0, parseFloat(formData.upiAmount) || 0);
  const bankNum = Math.max(0, parseFloat(formData.bankAmount) || 0);
  const totalPaid = Math.round((cashNum + upiNum + bankNum) * 100) / 100;
  const dueAmount = Math.max(0, Math.round((totalAmount - totalPaid) * 100) / 100);

  const isOverpaid = totalPaid > totalAmount && totalAmount > 0;

  // 1. Fetch Customers and Finished Products from Master
  useEffect(() => {
    const fetchMasterData = async () => {
      setLoadingDropdowns(true);
      try {
        const [custRes, prodRes] = await Promise.all([
          api.get('/customers'),
          api.get('/finished-products?limit=1000&activeOnly=true')
        ]);

        if (custRes.data.customers) {
          setCustomers(custRes.data.customers);
        }

        if (prodRes.data.products) {
          setFinishedProducts(prodRes.data.products);
        }
      } catch (err) {
        console.error('Failed to load master dropdown data:', err);
      } finally {
        setLoadingDropdowns(false);
      }
    };

    fetchMasterData();
  }, []);

  // 2. Fetch Today's Sunday Loading Records
  const fetchTodayRecords = useCallback(async () => {
    setLoadingToday(true);
    try {
      const res = await api.get('/sunday-loading/today');
      if (res.data.ok) {
        setTodayRecords(res.data.records || []);
        setTodaySummary(res.data.summary || null);
      }
    } catch (err) {
      console.error("Failed to fetch today's records:", err);
    } finally {
      setLoadingToday(false);
    }
  }, []);

  useEffect(() => {
    fetchTodayRecords();
  }, [fetchTodayRecords]);

  // Customer selection handler
  const handleCustomerSelect = (val, opt) => {
    if (!val) {
      setSelectedCustomerObj(null);
      setFormData(prev => ({
        ...prev,
        customerId: '',
        customerName: '',
        customerPhone: '',
        customerAddress: '',
        customerType: ''
      }));
      return;
    }

    const cust = customers.find(c => String(c.id) === String(val) || c.name === val);
    if (cust) {
      setSelectedCustomerObj(cust);
      setFormData(prev => ({
        ...prev,
        customerId: cust.id || '',
        customerName: cust.name || '',
        customerPhone: cust.phone || '',
        customerAddress: cust.address || '',
        customerType: cust.customerType || cust.customer_type || 'General Customer'
      }));
    } else {
      setSelectedCustomerObj(null);
      setFormData(prev => ({
        ...prev,
        customerId: '',
        customerName: val,
        customerPhone: '',
        customerAddress: '',
        customerType: 'General Customer'
      }));
    }
  };

  // Product selection handler
  const handleProductSelect = (val, opt) => {
    if (!val) {
      setFormData(prev => ({ ...prev, productId: '', productName: '' }));
      return;
    }

    const prod = finishedProducts.find(p => String(p.id) === String(val));
    if (prod) {
      setFormData(prev => ({
        ...prev,
        productId: prod.id,
        productName: prod.name
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        productId: val,
        productName: opt?.label || val
      }));
    }
  };

  // Reset form
  const handleResetForm = () => {
    setSelectedCustomerObj(null);
    setFormData({
      loadingDate: today,
      customerId: '',
      customerName: '',
      customerPhone: '',
      customerAddress: '',
      customerType: '',
      productId: '',
      productName: '',
      quantity: '',
      rate: '',
      cashAmount: '',
      upiAmount: '',
      bankAmount: '',
      notes: ''
    });
    setFeedback({ type: '', message: '' });
  };

  // Submit Handler
  const handleSubmit = async (e) => {
    e.preventDefault();
    setFeedback({ type: '', message: '' });

    if (!formData.customerName.trim()) {
      setFeedback({ type: 'error', message: 'Please select or enter a customer name.' });
      return;
    }

    if (!formData.productName.trim()) {
      setFeedback({ type: 'error', message: 'Please select a finished product.' });
      return;
    }

    if (isNaN(quantityNum) || quantityNum <= 0) {
      setFeedback({ type: 'error', message: 'Please enter a valid quantity greater than 0.' });
      return;
    }

    if (isNaN(rateNum) || rateNum < 0) {
      setFeedback({ type: 'error', message: 'Please enter a valid rate.' });
      return;
    }

    if (totalPaid > totalAmount) {
      setFeedback({
        type: 'error',
        message: `Total payment (${formatINR(totalPaid)}) cannot exceed Total Amount (${formatINR(totalAmount)}).`
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        loadingDate: formData.loadingDate || today,
        customerId: formData.customerId || null,
        customerName: formData.customerName.trim(),
        customerPhone: formData.customerPhone || null,
        customerAddress: formData.customerAddress || null,
        customerType: formData.customerType || 'General Customer',
        productId: formData.productId ? parseInt(formData.productId, 10) : null,
        productName: formData.productName.trim(),
        quantity: quantityNum,
        rate: rateNum,
        cashAmount: cashNum,
        upiAmount: upiNum,
        bankAmount: bankNum,
        notes: formData.notes ? formData.notes.trim() : null
      };

      const res = await api.post('/sunday-loading', payload);
      if (res.data.ok) {
        setFeedback({
          type: 'success',
          message: `Sunday Loading recorded successfully! (Ref: ${res.data.transactionNumber})`
        });
        handleResetForm();
        fetchTodayRecords();
      }
    } catch (err) {
      console.error('Failed to submit Sunday Loading:', err);
      setFeedback({
        type: 'error',
        message: err.response?.data?.error || err.message || 'Failed to submit Sunday Loading.'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Prepare searchable select options
  const customerOptions = customers.map(c => ({
    value: String(c.id),
    label: `${c.name} ${c.phone ? `(${c.phone})` : ''}`,
    rawName: c.name,
    badge: c.customerType || c.customer_type || 'General'
  }));

  const productOptions = finishedProducts.map(p => ({
    value: String(p.id),
    label: p.name,
    rawName: p.name
  }));

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* ── HEADER CARD ─────────────────────────────────────────────────────────── */}
      <div className="card-premium p-6 sm:p-8 relative overflow-hidden bg-gradient-to-r from-slate-900 via-[#1e1b4b] to-[#0f172a] text-white">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-amber-500/10 to-transparent pointer-events-none"></div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-amber-500/20 text-amber-300 text-[10px] font-black tracking-widest uppercase px-3 py-1 rounded-full border border-amber-500/30">
                INDEPENDENT MODULE
              </span>
              <span className="text-slate-400 text-xs font-semibold">Separate Sunday Ledger &amp; Rates</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-3">
              <span>☀️</span> Sunday Loading
            </h1>
            <p className="text-slate-300 text-xs sm:text-sm font-medium mt-1.5 max-w-2xl leading-relaxed">
              Record isolated Sunday vehicle and customer loading dispatches. This module operates completely independently from regular sales, stock ledgers, and billing.
            </p>
          </div>

          <div className="flex items-center gap-3 self-start sm:self-center flex-wrap">
            <button
              type="button"
              onClick={() => navigate('/sunday-loading-history')}
              className="h-11 px-5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs transition-all shadow-md flex items-center gap-2 active:scale-95"
            >
              <span>📜</span> View History
            </button>
            <button
              type="button"
              onClick={() => navigate('/sunday-dashboard')}
              className="h-11 px-4 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition-all border border-white/10 flex items-center gap-1.5 active:scale-95"
            >
              <span>☀️</span> Sunday Hub
            </button>
          </div>
        </div>
      </div>

      {/* ── TODAY SUMMARY METRICS (OPTIONAL BANNER) ─────────────────────────── */}
      {todaySummary && todaySummary.totalCount > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="card-premium p-4 border-amber-200 bg-amber-50/30">
            <p className="text-[10px] font-black text-amber-800 uppercase tracking-widest">Today's Loaded Qty</p>
            <p className="text-2xl font-black text-amber-900 mt-1">
              {todaySummary.totalQuantity.toLocaleString('en-IN')} <span className="text-xs font-semibold text-amber-700">Units</span>
            </p>
          </div>
          <div className="card-premium p-4 border-blue-200 bg-blue-50/30">
            <p className="text-[10px] font-black text-blue-800 uppercase tracking-widest">Today's Total Amount</p>
            <p className="text-2xl font-black text-blue-900 mt-1">
              {formatINR(todaySummary.totalAmount)}
            </p>
          </div>
          <div className="card-premium p-4 border-emerald-200 bg-emerald-50/30">
            <p className="text-[10px] font-black text-emerald-800 uppercase tracking-widest">Today's Paid Amount</p>
            <p className="text-2xl font-black text-emerald-900 mt-1">
              {formatINR(todaySummary.totalPaid)}
            </p>
          </div>
          <div className="card-premium p-4 border-red-200 bg-red-50/30">
            <p className="text-[10px] font-black text-red-800 uppercase tracking-widest">Today's Due Amount</p>
            <p className="text-2xl font-black text-red-900 mt-1">
              {formatINR(todaySummary.totalDue)}
            </p>
          </div>
        </div>
      )}

      {/* ── MAIN ENTRY FORM CARD ────────────────────────────────────────────── */}
      <div className="card-premium bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-lg font-black text-slate-800 tracking-tight flex items-center gap-2">
              <span>📝</span> New Sunday Loading Transaction
            </h2>
            <p className="text-xs font-medium text-slate-400 mt-0.5">
              Select customer, choose product, specify quantity and rate, then record payment breakdown.
            </p>
          </div>
          <button
            type="button"
            onClick={handleResetForm}
            className="text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50"
          >
            Clear Form
          </button>
        </div>

        {/* Feedback Alert */}
        {feedback.message && (
          <div
            className={`p-4 rounded-2xl border text-sm font-semibold flex items-center justify-between animate-fade-in ${
              feedback.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-red-50 text-red-800 border-red-200'
            }`}
          >
            <div className="flex items-center gap-2">
              <span>{feedback.type === 'success' ? '✅' : '⚠️'}</span>
              <span>{feedback.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setFeedback({ type: '', message: '' })}
              className="text-slate-400 hover:text-slate-700 text-xs font-bold ml-4"
            >
              ✕
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Row 1: Date & Customer Selection */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Loading Date */}
            <div>
              <label className="block text-xs font-black text-slate-600 uppercase tracking-wider mb-2">
                Loading Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                required
                value={formData.loadingDate}
                onChange={(e) => setFormData(prev => ({ ...prev, loadingDate: e.target.value }))}
                className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-slate-800 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-bold"
              />
            </div>

            {/* Customer Search / Select */}
            <div className="md:col-span-2">
              <label className="block text-xs font-black text-slate-600 uppercase tracking-wider mb-2">
                Customer Name <span className="text-red-500">*</span>
              </label>
              <SearchableSelect
                options={customerOptions}
                value={formData.customerId || formData.customerName}
                onChange={handleCustomerSelect}
                placeholder={loadingDropdowns ? "Loading customers..." : "Search / Select Customer from Master..."}
                searchPlaceholder="Type customer name or phone..."
                className="w-full h-11"
              />
            </div>
          </div>

          {/* Customer Details Preview Card (if selected) */}
          {formData.customerName && (
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <span className="text-[10px] font-black uppercase text-slate-400 block">Customer Name</span>
                <span className="font-bold text-slate-800 text-sm">{formData.customerName}</span>
              </div>
              <div>
                <span className="text-[10px] font-black uppercase text-slate-400 block">Phone Number</span>
                <span className="font-semibold text-slate-700">{formData.customerPhone || '—'}</span>
              </div>
              <div>
                <span className="text-[10px] font-black uppercase text-slate-400 block">Customer Type / Address</span>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-blue-100 text-blue-800 border border-blue-200">
                    {formData.customerType || 'General Customer'}
                  </span>
                  <span className="text-slate-500 truncate max-w-[180px]" title={formData.customerAddress}>
                    {formData.customerAddress || '—'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Row 2: Product, Quantity, Rate, Total Amount */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {/* Product */}
            <div className="sm:col-span-2 lg:col-span-1">
              <label className="block text-xs font-black text-slate-600 uppercase tracking-wider mb-2">
                Finished Product <span className="text-red-500">*</span>
              </label>
              <SearchableSelect
                options={productOptions}
                value={formData.productId || formData.productName}
                onChange={handleProductSelect}
                placeholder={loadingDropdowns ? "Loading products..." : "Select Finished Product..."}
                searchPlaceholder="Search product name..."
                className="w-full h-11"
              />
            </div>

            {/* Quantity */}
            <div>
              <label className="block text-xs font-black text-slate-600 uppercase tracking-wider mb-2">
                Quantity <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="any"
                min="0.01"
                required
                placeholder="e.g. 100"
                value={formData.quantity}
                onWheel={(e) => e.target.blur()}
                onChange={(e) => setFormData(prev => ({ ...prev, quantity: e.target.value }))}
                className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-slate-800 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-bold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>

            {/* Rate */}
            <div>
              <label className="block text-xs font-black text-slate-600 uppercase tracking-wider mb-2">
                Rate (₹) <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">₹</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  placeholder="e.g. 50"
                  value={formData.rate}
                  onWheel={(e) => e.target.blur()}
                  onChange={(e) => setFormData(prev => ({ ...prev, rate: e.target.value }))}
                  className="w-full h-11 pl-8 pr-3.5 rounded-xl border border-slate-200 bg-white text-slate-800 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-bold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
            </div>

            {/* Calculated Total Amount (Read-only) */}
            <div>
              <label className="block text-xs font-black text-slate-600 uppercase tracking-wider mb-2">
                Total Amount
              </label>
              <div className="h-11 px-3.5 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase">Qty × Rate</span>
                <span className="text-base font-black text-slate-900 tracking-tight">
                  {formatINR(totalAmount)}
                </span>
              </div>
            </div>
          </div>

          {/* ── PAYMENT DETAILS SECTION ────────────────────────────────────────── */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-50 to-indigo-50/30 border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200/60 pb-3">
              <h3 className="text-xs font-black uppercase text-slate-700 tracking-wider flex items-center gap-1.5">
                <span>💳</span> Payment Details Breakdown
              </h3>
              <span className="text-[11px] font-semibold text-slate-400">
                Record receipts for Cash, UPI, and Bank separately
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Cash Amount */}
              <div>
                <label className="block text-xs font-bold text-emerald-800 uppercase tracking-wider mb-1.5">
                  💵 Cash Amount
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-emerald-600 text-sm font-bold">₹</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={formData.cashAmount}
                    onWheel={(e) => e.target.blur()}
                    onChange={(e) => setFormData(prev => ({ ...prev, cashAmount: e.target.value }))}
                    className="w-full h-11 pl-8 pr-3 rounded-xl border border-emerald-200 bg-white text-slate-900 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all outline-none text-sm font-bold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
              </div>

              {/* UPI Amount */}
              <div>
                <label className="block text-xs font-bold text-indigo-800 uppercase tracking-wider mb-1.5">
                  📱 UPI Amount
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-indigo-600 text-sm font-bold">₹</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={formData.upiAmount}
                    onWheel={(e) => e.target.blur()}
                    onChange={(e) => setFormData(prev => ({ ...prev, upiAmount: e.target.value }))}
                    className="w-full h-11 pl-8 pr-3 rounded-xl border border-indigo-200 bg-white text-slate-900 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none text-sm font-bold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
              </div>

              {/* Bank Amount */}
              <div>
                <label className="block text-xs font-bold text-sky-800 uppercase tracking-wider mb-1.5">
                  🏦 Bank Transfer
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sky-600 text-sm font-bold">₹</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={formData.bankAmount}
                    onWheel={(e) => e.target.blur()}
                    onChange={(e) => setFormData(prev => ({ ...prev, bankAmount: e.target.value }))}
                    className="w-full h-11 pl-8 pr-3 rounded-xl border border-sky-200 bg-white text-slate-900 focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10 transition-all outline-none text-sm font-bold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
              </div>
            </div>

            {/* Payment Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="p-3.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between shadow-xs">
                <div>
                  <span className="text-[10px] font-black uppercase text-slate-400 block tracking-wider">Total Paid</span>
                  <span className="text-xs text-slate-500 font-semibold">Cash + UPI + Bank</span>
                </div>
                <span className="text-lg font-black text-emerald-600">
                  {formatINR(totalPaid)}
                </span>
              </div>

              <div className={`p-3.5 rounded-xl bg-white border flex items-center justify-between shadow-xs ${
                dueAmount > 0 ? 'border-amber-300' : 'border-slate-200'
              }`}>
                <div>
                  <span className="text-[10px] font-black uppercase text-slate-400 block tracking-wider">Due Amount</span>
                  <span className="text-xs text-slate-500 font-semibold">Total Amount − Total Paid</span>
                </div>
                <span className={`text-lg font-black ${dueAmount > 0 ? 'text-amber-700' : 'text-slate-400'}`}>
                  {formatINR(dueAmount)}
                </span>
              </div>
            </div>

            {/* Overpayment Warning */}
            {isOverpaid && (
              <div className="p-3 rounded-xl bg-red-100 border border-red-300 text-red-800 text-xs font-bold flex items-center gap-2">
                <span>⚠️</span>
                <span>Payment amount ({formatINR(totalPaid)}) cannot exceed the Total Amount ({formatINR(totalAmount)}). Please adjust the payment values.</span>
              </div>
            )}
          </div>

          {/* Notes / Remarks */}
          <div>
            <label className="block text-xs font-black text-slate-600 uppercase tracking-wider mb-2">
              Remarks / Notes (Optional)
            </label>
            <textarea
              rows="2"
              placeholder="Enter any driver, vehicle number, or Sunday loading dispatch notes..."
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              className="w-full p-3.5 rounded-xl border border-slate-200 bg-white text-slate-800 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-xs font-medium"
            />
          </div>

          {/* Submit Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={handleResetForm}
              className="px-5 h-12 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold transition-all"
            >
              Reset
            </button>
            <button
              type="submit"
              disabled={isSubmitting || isOverpaid}
              className="px-8 h-12 rounded-xl bg-primary hover:bg-primary-focus text-white text-xs font-black shadow-lg shadow-primary/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 active:scale-95"
            >
              {isSubmitting ? (
                <>
                  <span className="loading loading-spinner loading-xs"></span>
                  <span>Saving Record...</span>
                </>
              ) : (
                <>
                  <span>✓</span>
                  <span>SUBMIT SUNDAY LOADING</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* ── TODAY'S RECENT RECORDS TABLE ────────────────────────────────────────── */}
      <div className="card-premium bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-base font-black text-slate-800 tracking-tight flex items-center gap-2">
              <span>📋</span> Today's Sunday Loading Transactions
            </h3>
            <p className="text-xs font-semibold text-slate-400 mt-0.5">
              Entries recorded for today ({fmtDate(today)})
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchTodayRecords}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold transition-colors flex items-center gap-1"
            >
              🔄 Refresh
            </button>
            <button
              type="button"
              onClick={() => navigate('/sunday-loading-history')}
              className="px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-xs"
            >
              Full History →
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-[10px] font-black uppercase text-slate-500 tracking-wider">
                <th className="py-3 px-4">Transaction No</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Product</th>
                <th className="py-3 px-4 text-center">Qty</th>
                <th className="py-3 px-4 text-right">Rate</th>
                <th className="py-3 px-4 text-right">Total Amount</th>
                <th className="py-3 px-4 text-right">Total Paid</th>
                <th className="py-3 px-4 text-right">Due</th>
                <th className="py-3 px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {loadingToday ? (
                <tr>
                  <td colSpan="9" className="py-10 text-center text-slate-400">
                    <span className="loading loading-spinner text-primary"></span>
                    <p className="mt-2 text-xs font-semibold">Loading records...</p>
                  </td>
                </tr>
              ) : todayRecords.length === 0 ? (
                <tr>
                  <td colSpan="9" className="py-10 text-center text-slate-400 italic">
                    No Sunday Loading transactions recorded for today yet. Use the form above to add an entry.
                  </td>
                </tr>
              ) : (
                todayRecords.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-primary whitespace-nowrap">
                      {r.transaction_number}
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-bold text-slate-800">{r.customer_name}</p>
                      {r.customer_phone && <p className="text-[11px] text-slate-400">{r.customer_phone}</p>}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-800">
                      {r.product_name}
                    </td>
                    <td className="py-3 px-4 text-center font-bold">
                      {r.quantity}
                    </td>
                    <td className="py-3 px-4 text-right font-medium">
                      {formatINR(r.rate)}
                    </td>
                    <td className="py-3 px-4 text-right font-black text-slate-900">
                      {formatINR(r.total_amount)}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-emerald-600">
                      {formatINR(r.total_paid)}
                    </td>
                    <td className={`py-3 px-4 text-right font-bold ${r.due_amount > 0 ? 'text-amber-700' : 'text-slate-400'}`}>
                      {formatINR(r.due_amount)}
                    </td>
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setSelectedRecordForModal(r)}
                        className="px-2.5 py-1 rounded-lg bg-primary/10 text-primary hover:bg-primary hover:text-white transition-all font-bold text-xs shadow-xs"
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
      </div>

      {/* ── TRANSACTION DETAILS MODAL ─────────────────────────────────────── */}
      {selectedRecordForModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm pointer-events-auto p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-fade-in pointer-events-auto">
            {/* Modal Header */}
            <div className="bg-[#0b1324] p-5 text-white flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  SUNDAY LOADING RECORD
                </span>
                <h3 className="text-lg font-black tracking-tight mt-1 text-white">
                  {selectedRecordForModal.transaction_number}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRecordForModal(null)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center font-bold text-sm transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 text-xs font-semibold text-slate-700 max-h-[75vh] overflow-y-auto">
              {/* Date & Ref */}
              <div className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-100">
                <div>
                  <span className="text-[10px] font-black text-slate-400 uppercase block">Transaction Date</span>
                  <span className="font-bold text-slate-800">{fmtDate(selectedRecordForModal.loading_date)}</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-black text-slate-400 uppercase block">Created By</span>
                  <span className="font-bold text-slate-600">{selectedRecordForModal.created_by || 'Admin'}</span>
                </div>
              </div>

              {/* Customer Box */}
              <div className="border border-slate-200 rounded-2xl p-4 space-y-2">
                <span className="text-[10px] font-black text-primary uppercase tracking-wider block">
                  CUSTOMER DETAILS
                </span>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-black text-slate-800">{selectedRecordForModal.customer_name}</span>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                    {selectedRecordForModal.customer_type || 'General'}
                  </span>
                </div>
                {selectedRecordForModal.customer_phone && (
                  <p className="text-slate-500 text-xs">📞 {selectedRecordForModal.customer_phone}</p>
                )}
                {selectedRecordForModal.customer_address && (
                  <p className="text-slate-500 text-xs">📍 {selectedRecordForModal.customer_address}</p>
                )}
              </div>

              {/* Product Box */}
              <div className="border border-slate-200 rounded-2xl p-4 space-y-3">
                <span className="text-[10px] font-black text-indigo-700 uppercase tracking-wider block">
                  PRODUCT &amp; LOAD QUANTITY
                </span>
                <div className="flex justify-between items-center">
                  <span className="font-bold text-slate-800 text-sm">{selectedRecordForModal.product_name}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-center">
                  <div className="p-2 rounded-lg bg-slate-50">
                    <span className="text-[10px] font-black text-slate-400 uppercase block">Quantity</span>
                    <span className="font-black text-slate-800">{selectedRecordForModal.quantity}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-50">
                    <span className="text-[10px] font-black text-slate-400 uppercase block">Rate</span>
                    <span className="font-black text-slate-800">{formatINR(selectedRecordForModal.rate)}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-blue-50 text-blue-900">
                    <span className="text-[10px] font-black text-blue-600 uppercase block">Total</span>
                    <span className="font-black">{formatINR(selectedRecordForModal.total_amount)}</span>
                  </div>
                </div>
              </div>

              {/* Payment Details Box */}
              <div className="border border-slate-200 rounded-2xl p-4 space-y-3 bg-gradient-to-br from-white to-slate-50">
                <span className="text-[10px] font-black text-emerald-800 uppercase tracking-wider block">
                  PAYMENT BREAKDOWN
                </span>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="p-2 rounded-lg bg-emerald-50 text-emerald-900">
                    <span className="text-[10px] font-black text-emerald-700 uppercase block">Cash</span>
                    <span className="font-bold">{formatINR(selectedRecordForModal.cash_amount)}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-indigo-50 text-indigo-900">
                    <span className="text-[10px] font-black text-indigo-700 uppercase block">UPI</span>
                    <span className="font-bold">{formatINR(selectedRecordForModal.upi_amount)}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-sky-50 text-sky-900">
                    <span className="text-[10px] font-black text-sky-700 uppercase block">Bank</span>
                    <span className="font-bold">{formatINR(selectedRecordForModal.bank_amount)}</span>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-slate-200 text-xs font-bold">
                  <span>Total Paid:</span>
                  <span className="text-emerald-700 font-black">{formatINR(selectedRecordForModal.total_paid)}</span>
                </div>
                <div className="flex justify-between items-center text-xs font-bold">
                  <span>Due Balance:</span>
                  <span className={`font-black ${selectedRecordForModal.due_amount > 0 ? 'text-amber-700' : 'text-slate-500'}`}>
                    {formatINR(selectedRecordForModal.due_amount)}
                  </span>
                </div>
              </div>

              {selectedRecordForModal.notes && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-[10px] font-black uppercase text-slate-400 block mb-1">Remarks</span>
                  <p className="text-slate-600 font-medium">{selectedRecordForModal.notes}</p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedRecordForModal(null)}
                className="btn-premium bg-slate-900 text-white hover:bg-slate-800 text-xs px-6 h-10 font-bold"
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

export default SundayLoading;
