import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';

const CreditBalance = () => {
  const navigate = useNavigate();

  // Statistics
  const [stats, setStats] = useState({
    totalOutstanding: 0,
    dueCustomers: 0,
    todaysCollections: 0,
    thisMonthsCollections: 0
  });

  // Table listings and filters
  const [bills, setBills] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [company, setCompany] = useState('All Companies');
  const [customerType, setCustomerType] = useState('All Types');

  // Pagination
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [total, setTotal] = useState(0);

  // Modals
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [isTimelineModalOpen, setIsTimelineModalOpen] = useState(false);
  const [selectedBill, setSelectedBill] = useState(null);

  // Receive payment form states
  const [paymentForm, setPaymentForm] = useState({
    paymentDate: '',
    cashAmount: '',
    bankAmount: '',
    upiAmount: '',
    remarks: ''
  });
  const [payError, setPayError] = useState('');
  const [paySuccess, setPaySuccess] = useState('');
  const [isSavingPay, setIsSavingPay] = useState(false);

  // Timeline & invoice details states
  const [timelineBill, setTimelineBill] = useState(null);
  const [timelinePayments, setTimelinePayments] = useState([]);
  const [timelineReturns, setTimelineReturns] = useState([]);
  const [invoiceItems, setInvoiceItems] = useState([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);

  // Customer Type dropdown options
  const CUSTOMER_TYPES = [
    { value: 'All Types', label: 'All Types' },
    { value: 'General Customer', label: 'General' },
    { value: 'Distributor', label: 'Distributor' },
    { value: 'Function Order', label: 'Function' },
    { value: 'Corporate Customer', label: 'Corporate' },
    { value: 'Wholesale Customer', label: 'Wholesale' }
  ];

  // Fetch stats and table list on filter changes
  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    fetchOutstandingBills();
  }, [page, search, startDate, endDate, company, customerType]);

  const fetchStats = async () => {
    try {
      const res = await api.get('/credit-balance/stats');
      if (res.data.ok) {
        setStats(res.data.stats || { totalOutstanding: 0, dueCustomers: 0, todaysCollections: 0, thisMonthsCollections: 0 });
      }
    } catch (err) {
      console.error('Failed to load credit statistics:', err);
    }
  };

  const fetchOutstandingBills = async () => {
    try {
      setLoading(true);
      const res = await api.get('/credit-balance/outstanding', {
        params: {
          page,
          limit,
          search,
          startDate,
          endDate,
          company,
          customerType
        }
      });
      if (res.data.ok) {
        setBills(res.data.bills || []);
        setTotal(res.data.total || 0);
        setSummary(res.data.summary || null);
      }
    } catch (err) {
      console.error('Failed to load active credit invoices:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenPay = (bill) => {
    setSelectedBill(bill);
    setPayError('');
    setPaySuccess('');
    
    // Set default payment date to today in IST
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const istDate = new Date(now.getTime() + (330 + offset) * 60000);
    const yyyy = istDate.getFullYear();
    const mm = String(istDate.getMonth() + 1).padStart(2, '0');
    const dd = String(istDate.getDate()).padStart(2, '0');
    const todayFormatted = `${yyyy}-${mm}-${dd}`;

    setPaymentForm({
      paymentDate: todayFormatted,
      cashAmount: String(bill.due_amount), // prefill full outstanding in cash by default
      bankAmount: '',
      upiAmount: '',
      remarks: ''
    });
    setIsPayModalOpen(true);
  };

  const getPayTotal = () => {
    const cash = parseFloat(paymentForm.cashAmount) || 0;
    const bank = parseFloat(paymentForm.bankAmount) || 0;
    const upi = parseFloat(paymentForm.upiAmount) || 0;
    return cash + bank + upi;
  };

  const handleQuickFill = (mode) => {
    const due = selectedBill ? parseFloat(selectedBill.due_amount) : 0;
    if (mode === 'Cash') {
      setPaymentForm(prev => ({ ...prev, cashAmount: String(due), bankAmount: '', upiAmount: '' }));
    } else if (mode === 'Bank') {
      setPaymentForm(prev => ({ ...prev, cashAmount: '', bankAmount: String(due), upiAmount: '' }));
    } else if (mode === 'UPI') {
      setPaymentForm(prev => ({ ...prev, cashAmount: '', bankAmount: '', upiAmount: String(due) }));
    }
    setPayError('');
  };

  const handleSavePayment = async (e) => {
    e.preventDefault();
    setPayError('');
    setPaySuccess('');

    const cash = parseFloat(paymentForm.cashAmount) || 0;
    const bank = parseFloat(paymentForm.bankAmount) || 0;
    const upi = parseFloat(paymentForm.upiAmount) || 0;
    const totalAmt = cash + bank + upi;

    if (totalAmt <= 0) {
      return setPayError('Please enter an amount in at least one payment mode (Cash, Bank, or UPI).');
    }

    const maxDue = selectedBill ? parseFloat(selectedBill.due_amount) : 0;
    if (totalAmt > maxDue + 0.01) {
      return setPayError(`Total collected (₹${totalAmt.toFixed(2)}) cannot exceed the remaining outstanding balance of ₹${maxDue.toFixed(2)}.`);
    }

    if (!paymentForm.paymentDate) {
      return setPayError('Payment Date is required.');
    }

    setIsSavingPay(true);
    try {
      const res = await api.post('/credit-balance/receive', {
        billId: selectedBill.id,
        paymentDate: paymentForm.paymentDate,
        cashAmount: cash,
        bankAmount: bank,
        upiAmount: upi,
        remarks: paymentForm.remarks
      });

      if (res.data.ok) {
        setPaySuccess(res.data.message || 'Payment successfully processed!');
        setTimeout(() => {
          setIsPayModalOpen(false);
          setSelectedBill(null);
          fetchStats();
          fetchOutstandingBills();
        }, 1200);
      } else {
        setPayError(res.data.error || 'Failed to record payment.');
      }
    } catch (err) {
      setPayError(err.response?.data?.error || err.message || 'An error occurred.');
    } finally {
      setIsSavingPay(false);
    }
  };

  const handleOpenTimeline = async (bill) => {
    setSelectedBill(bill);
    setIsTimelineModalOpen(true);
    setLoadingTimeline(true);
    setTimelineBill(null);
    setTimelinePayments([]);
    setTimelineReturns([]);
    setInvoiceItems([]);

    try {
      // 1. Fetch Timeline details
      const timelineRes = await api.get(`/credit-balance/timeline/${bill.id}`);
      if (timelineRes.data.ok) {
        setTimelineBill(timelineRes.data.bill);
        setTimelinePayments(timelineRes.data.payments || []);
        setTimelineReturns(timelineRes.data.returns || []);
      }

      // 2. Fetch Billing Items details
      const billRes = await api.get(`/billing/${bill.id}`);
      if (billRes.data.ok) {
        setInvoiceItems(billRes.data.items || []);
      }
    } catch (err) {
      console.error(err);
      alert('Error fetching invoice details/timeline.');
      setIsTimelineModalOpen(false);
    } finally {
      setLoadingTimeline(false);
    }
  };

  const getMergedTimelineEvents = () => {
    const events = [];
    timelinePayments.forEach(p => {
      events.push({
        type: 'payment',
        id: p.payment_id,
        date: p.payment_date,
        method: p.payment_method,
        amount: parseFloat(p.amount_received),
        remarks: p.remarks,
        timestamp: new Date(p.created_at || p.payment_date)
      });
    });
    timelineReturns.forEach(r => {
      events.push({
        type: 'return',
        id: r.return_id,
        date: r.return_date,
        method: 'Sales Return',
        amount: parseFloat(r.total_return_amount),
        remarks: `Reason: ${r.reason}`,
        timestamp: new Date(r.created_at || r.return_date)
      });
    });
    events.sort((a, b) => new Date(a.date) - new Date(b.date) || a.timestamp - b.timestamp);
    return events;
  };

  const formatDateDDMMYYYY = (dateStr) => {
    if (!dateStr) return '—';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <div className="space-y-6 animate-fade-in max-w-6xl mx-auto pb-12">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase">Credit Balance</h1>
          <p className="text-slate-500 text-sm font-medium mt-1">Manage customer outstanding payments and credit balances</p>
        </div>
        <div>
          <button 
            onClick={() => navigate('/credit-history')}
            className="btn-premium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs px-4 h-12 flex items-center gap-1.5 shadow-sm"
          >
            📋 Credit History
          </button>
        </div>
      </div>

      {/* STATISTICS CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Total Outstanding */}
        <div className="card-premium flex items-center justify-between p-5 bg-white border border-slate-200/60 shadow-sm rounded-2xl">
          <div>
            <p className="text-[10px] font-black text-slate-455 uppercase tracking-widest">Total Outstanding</p>
            <h3 className="text-xl font-extrabold text-rose-500 mt-1.5">
              ₹ {stats.totalOutstanding.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </h3>
          </div>
          <div className="w-10 h-10 bg-rose-50 text-rose-600 rounded-xl flex items-center justify-center text-lg border border-rose-100 shrink-0">
            ⚖️
          </div>
        </div>

        {/* Due Customers */}
        <div className="card-premium flex items-center justify-between p-5 bg-white border border-slate-200/60 shadow-sm rounded-2xl">
          <div>
            <p className="text-[10px] font-black text-slate-455 uppercase tracking-widest">Due Customers</p>
            <h3 className="text-xl font-extrabold text-slate-850 mt-1.5">
              {stats.dueCustomers} Customers
            </h3>
          </div>
          <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center text-lg border border-amber-100 shrink-0">
            👥
          </div>
        </div>

        {/* Today's Collections */}
        <div className="card-premium flex items-center justify-between p-5 bg-white border border-slate-200/60 shadow-sm rounded-2xl">
          <div>
            <p className="text-[10px] font-black text-slate-455 uppercase tracking-widest">Today's Collections</p>
            <h3 className="text-xl font-extrabold text-emerald-600 mt-1.5">
              ₹ {stats.todaysCollections.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </h3>
          </div>
          <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center text-lg border border-emerald-100 shrink-0">
            💵
          </div>
        </div>

        {/* Monthly Collections */}
        <div className="card-premium flex items-center justify-between p-5 bg-white border border-slate-200/60 shadow-sm rounded-2xl">
          <div>
            <p className="text-[10px] font-black text-slate-455 uppercase tracking-widest">This Month's Collections</p>
            <h3 className="text-xl font-extrabold text-indigo-600 mt-1.5">
              ₹ {stats.thisMonthsCollections.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </h3>
          </div>
          <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center text-lg border border-indigo-100 shrink-0">
            📈
          </div>
        </div>
      </div>

      {/* FILTER PANEL */}
      <div className="border border-slate-200/80 bg-white rounded-2xl p-5 shadow-sm space-y-4">
        
        {/* Company Filter Tabs */}
        <div className="border-b border-slate-100 pb-3 flex flex-wrap gap-2 items-center justify-between">
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
            <span>🏢</span> OUTSTANDING COMPANY SEPARATION
          </div>
          <div className="flex bg-slate-100 p-1 rounded-xl w-fit border border-slate-200/40">
            {['All Companies', 'Kempannavar Industries', 'Kemps Pet Industries'].map(comp => (
              <button
                key={comp}
                type="button"
                onClick={() => { setCompany(comp); setPage(1); }}
                className={`px-3.5 py-1.5 rounded-lg text-[10px] font-black tracking-wider transition-all ${
                  company === comp 
                    ? 'bg-white text-slate-800 shadow-sm font-extrabold'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {comp === 'All Companies' ? 'ALL COMPANIES' : comp.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="text-[10px] font-black text-slate-450 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-50 pb-2.5">
          <span>🔍</span> FILTER BY CRITERIA
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Customer Search */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-450 uppercase tracking-wider block">
              Search Customers
            </label>
            <input 
              type="text"
              placeholder="Name, Phone, Invoice No..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-slate-50/20 text-slate-700 placeholder:text-slate-400 focus:bg-white focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
            />
          </div>

          {/* Customer Type Filter */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-450 uppercase tracking-wider block">
              Customer Type
            </label>
            <select
              value={customerType}
              onChange={(e) => { setCustomerType(e.target.value); setPage(1); }}
              className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-slate-50/20 text-slate-700 focus:bg-white focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
            >
              {CUSTOMER_TYPES.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Invoice From Date */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-450 uppercase tracking-wider block">
              Invoice From Date
            </label>
            <input 
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
              className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-slate-50/20 text-slate-700 focus:bg-white focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
            />
          </div>

          {/* Invoice To Date */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-450 uppercase tracking-wider block">
              Invoice To Date
            </label>
            <input 
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
              className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-slate-50/20 text-slate-700 focus:bg-white focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
            />
          </div>
        </div>
      </div>

      {/* CUSTOMER CONSOLIDATED DUE DASHBOARD */}
      {summary && summary.totalBillsCount > 0 && (
        <div className="border border-rose-200/80 bg-gradient-to-r from-rose-50/80 via-amber-50/40 to-orange-50/60 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-rose-200/60 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500 text-white font-black flex items-center justify-center text-xl shadow-sm shrink-0">
                💳
              </div>
              <div>
                <div className="text-[10px] font-black text-rose-600 uppercase tracking-widest flex items-center gap-1.5">
                  CUSTOMER CONSOLIDATED DUE DASHBOARD
                </div>
                <h2 className="text-lg font-black text-slate-800">
                  {summary.customerName 
                    ? summary.customerName.toUpperCase()
                    : search.trim()
                    ? `Consolidated Balance for "${search.trim()}"`
                    : 'Consolidated Filtered Outstanding Balance'}
                </h2>
              </div>
            </div>

            {/* Metadata Badges */}
            <div className="flex flex-wrap items-center gap-2">
              {summary.customerPhone && (
                <span className="px-3 py-1 rounded-lg bg-white/90 border border-slate-200 text-slate-700 text-xs font-bold shadow-2xs">
                  📞 {summary.customerPhone}
                </span>
              )}
              {summary.customerType && (
                <span className="px-3 py-1 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-black uppercase tracking-wider">
                  {summary.customerType}
                </span>
              )}
              {summary.company && (
                <span className="px-3 py-1 rounded-lg bg-sky-50 border border-sky-100 text-sky-700 text-xs font-bold">
                  🏢 {summary.company}
                </span>
              )}
              <span className="px-3.5 py-1 rounded-lg bg-slate-800 text-white text-xs font-black">
                {summary.totalBillsCount} {summary.totalBillsCount === 1 ? 'Pending Bill' : 'Pending Bills'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
            {/* Total Consolidated Due */}
            <div className="bg-gradient-to-br from-rose-500 via-rose-600 to-red-600 text-white rounded-xl p-4 shadow-md border border-rose-600 flex flex-col justify-between">
              <div className="flex items-center justify-between text-rose-100">
                <span className="text-[11px] font-black uppercase tracking-wider">Total Consolidated Due</span>
                <span className="text-xs font-black bg-white/20 px-2 py-0.5 rounded-full">TOTAL DUE</span>
              </div>
              <div className="mt-3">
                <div className="text-2xl md:text-3xl font-black tracking-tight text-white drop-shadow-xs">
                  ₹ {summary.totalDue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
                <div className="text-[11px] font-medium text-rose-100 mt-1">
                  Combined outstanding due across {summary.totalBillsCount} pending bill{summary.totalBillsCount > 1 ? 's' : ''}
                </div>
              </div>
            </div>

            {/* Total Invoiced Amount */}
            <div className="bg-white/90 border border-slate-200/80 rounded-xl p-4 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-[11px] font-black uppercase tracking-wider">Total Invoiced Amount</span>
                <span className="text-base">📄</span>
              </div>
              <div className="mt-3">
                <div className="text-xl font-extrabold text-slate-800">
                  ₹ {summary.totalGrandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
                <div className="text-[11px] font-medium text-slate-500 mt-1">
                  Total cumulative invoice amounts
                </div>
              </div>
            </div>

            {/* Total Amount Paid */}
            <div className="bg-white/90 border border-slate-200/80 rounded-xl p-4 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-[11px] font-black uppercase tracking-wider">Total Amount Paid</span>
                <span className="text-base">💵</span>
              </div>
              <div className="mt-3">
                <div className="text-xl font-extrabold text-emerald-600">
                  ₹ {summary.totalAmountPaid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
                <div className="text-[11px] font-medium text-slate-500 mt-1">
                  Total payments received against invoices
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ACTIVE CREDIT TABLE LIST */}
      <div className="border border-slate-200/60 bg-white rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <span className="loading loading-spinner text-primary"></span>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/75 border-b border-slate-200/80 text-[10px] font-black text-slate-450 uppercase tracking-wider">
                    <th className="py-4 px-5">Due ID</th>
                    <th className="py-4 px-5">Invoice No</th>
                    <th className="py-4 px-5">Date</th>
                    <th className="py-4 px-5">Customer Name</th>
                    <th className="py-4 px-5">Company</th>
                    <th className="py-4 px-5">Customer Type</th>
                    <th className="py-4 px-5 text-right">Invoice Amount</th>
                    <th className="py-4 px-5 text-right">Amount Paid</th>
                    <th className="py-4 px-5 text-right">Outstanding Balance</th>
                    <th className="py-4 px-5 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-750 text-xs font-semibold">
                  {bills.map(b => (
                    <tr key={b.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3.5 px-5 font-mono text-[10px] text-slate-400">DUE-{b.id.split('-').pop()}</td>
                      <td className="py-3.5 px-5 font-black text-primary">{b.id}</td>
                      <td className="py-3.5 px-5">{formatDateDDMMYYYY(b.billing_date)}</td>
                      <td className="py-3.5 px-5">
                        <div className="font-extrabold text-slate-800">{b.customer_name}</div>
                        <div className="text-[10px] font-bold text-slate-400 mt-0.5">{b.customer_phone}</div>
                      </td>
                      <td className="py-3.5 px-5">
                        <span className={`px-2.5 py-1 rounded-lg text-[9px] font-extrabold ${b.company.includes('Pet') ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' : 'bg-sky-50 text-sky-600 border border-sky-100'}`}>
                          {b.company.includes('Pet') ? 'Kemps Pet' : 'Kempannavar'}
                        </span>
                      </td>
                      <td className="py-3.5 px-5 uppercase text-[9px] tracking-wider text-slate-500 font-bold">
                        {b.customer_type}
                      </td>
                      <td className="py-3.5 px-5 text-right font-bold text-slate-700">
                        ₹ {parseFloat(b.grand_total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3.5 px-5 text-right text-emerald-600 font-extrabold">
                        ₹ {parseFloat(b.amount_paid).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3.5 px-5 text-right text-rose-500 font-black text-sm">
                        <div>₹ {parseFloat(b.due_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                        {b.has_pending_payment ? (
                          <div className="text-[9px] text-amber-600 font-black bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100 mt-1 w-max ml-auto uppercase tracking-wider">
                            Verification Pending
                          </div>
                        ) : null}
                      </td>
                      <td className="py-3.5 px-5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {b.has_pending_payment ? (
                            <button 
                              disabled
                              className="px-3.5 py-1.5 rounded-xl bg-slate-100 text-slate-400 font-extrabold text-[11px] cursor-not-allowed border border-slate-200"
                              title="A payment collection is currently awaiting admin verification."
                            >
                              <span>⏳</span> Pending Verify
                            </button>
                          ) : (
                            <button 
                              onClick={() => handleOpenPay(b)}
                              className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[11px] transition-all flex items-center gap-1"
                              title="Collect Outstanding Payment"
                            >
                              <span>💵</span> Receive Payment
                            </button>
                          )}
                          <button 
                            onClick={() => handleOpenTimeline(b)}
                            className="px-2.5 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-650 hover:bg-slate-100 hover:text-slate-800 font-bold transition-all text-[11px]"
                            title="View Invoice & Payments Progress"
                          >
                            👁 View Invoice
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {bills.length === 0 && (
                    <tr>
                      <td colSpan="10" className="py-12 text-center text-slate-400 font-semibold text-xs bg-slate-50/20">
                        No active outstanding balances found matching filters.
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
                  Showing Page {page} of {totalPages} ({total} active dues total)
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

      {/* RECEIVE PAYMENT MODAL */}
      {isPayModalOpen && selectedBill && createPortal(
        <div className="modal modal-open animate-fade-in z-50">
          <div className="modal-box bg-white border border-slate-200/80 rounded-3xl p-7 max-w-lg shadow-2xl relative max-h-[90vh] overflow-y-auto z-10">
            <button 
              onClick={() => setIsPayModalOpen(false)}
              className="absolute top-4 right-4 w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 text-slate-450 hover:bg-slate-100 hover:text-slate-805 flex items-center justify-center font-bold transition-all"
            >
              ✕
            </button>

            <h3 className="text-lg font-black text-slate-800 tracking-tight uppercase">RECEIVE PAYMENT</h3>
            <p className="text-slate-450 text-[11px] font-bold mt-0.5">Log collected outstanding amount for the invoice</p>

            <div className="border border-slate-150 p-4 rounded-2xl space-y-2.5 bg-slate-50/50 mt-4 text-xs font-semibold text-slate-700">
              <div className="flex justify-between">
                <span className="text-slate-450">Customer Name:</span>
                <span className="font-extrabold text-slate-800">{selectedBill.customer_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-450">Invoice Number:</span>
                <span className="font-mono font-bold text-primary">{selectedBill.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-450">Invoice Date:</span>
                <span>{formatDateDDMMYYYY(selectedBill.billing_date)}</span>
              </div>
              <div className="border-t border-slate-200/60 my-1 pt-1.5 flex justify-between">
                <span className="text-slate-450">Total Invoice Amount:</span>
                <span className="text-slate-800">₹ {parseFloat(selectedBill.grand_total).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-emerald-600">
                <span>Amount Already Paid:</span>
                <span>₹ {parseFloat(selectedBill.amount_paid).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-rose-500 font-extrabold text-sm border-t border-dashed border-slate-200 pt-1.5">
                <span>Outstanding Balance:</span>
                <span>₹ {parseFloat(selectedBill.due_amount).toFixed(2)}</span>
              </div>
            </div>

            <form onSubmit={handleSavePayment} className="space-y-4 mt-5">
              {/* Payment Date */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">
                  Payment Date *
                </label>
                <input 
                  type="date"
                  value={paymentForm.paymentDate}
                  onChange={(e) => setPaymentForm(prev => ({ ...prev, paymentDate: e.target.value }))}
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                  required
                />
              </div>

              {/* Multiple Payment Modes Breakdown Header & Quick Fill */}
              <div className="pt-2 border-t border-slate-100 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black text-slate-600 uppercase tracking-wider block">
                    Payment Breakdown (Enter Amount in Respective Modes) *
                  </label>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => handleQuickFill('Cash')}
                      className="px-2 py-0.5 text-[9px] font-black bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200/60 rounded-md transition-all"
                    >
                      Full Cash
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickFill('Bank')}
                      className="px-2 py-0.5 text-[9px] font-black bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200/60 rounded-md transition-all"
                    >
                      Full Bank
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickFill('UPI')}
                      className="px-2 py-0.5 text-[9px] font-black bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200/60 rounded-md transition-all"
                    >
                      Full UPI
                    </button>
                  </div>
                </div>

                {/* 3 Payment Mode Input Fields */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Cash Amount */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-extrabold text-amber-700 flex items-center gap-1">
                      <span>💵</span> Cash (₹)
                    </label>
                    <input 
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={paymentForm.cashAmount}
                      onChange={(e) => {
                        setPaymentForm(prev => ({ ...prev, cashAmount: e.target.value }));
                        setPayError('');
                      }}
                      className="w-full h-10 px-3 rounded-xl border border-amber-200 bg-amber-50/20 text-slate-800 focus:bg-white focus:border-amber-500 focus:ring-2 focus:ring-amber-200 transition-all outline-none text-sm font-bold"
                    />
                  </div>

                  {/* Bank Amount */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-extrabold text-sky-700 flex items-center gap-1">
                      <span>🏦</span> Bank Transfer (₹)
                    </label>
                    <input 
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={paymentForm.bankAmount}
                      onChange={(e) => {
                        setPaymentForm(prev => ({ ...prev, bankAmount: e.target.value }));
                        setPayError('');
                      }}
                      className="w-full h-10 px-3 rounded-xl border border-sky-200 bg-sky-50/20 text-slate-800 focus:bg-white focus:border-sky-500 focus:ring-2 focus:ring-sky-200 transition-all outline-none text-sm font-bold"
                    />
                  </div>

                  {/* UPI Amount */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-extrabold text-purple-700 flex items-center gap-1">
                      <span>📱</span> UPI / Online (₹)
                    </label>
                    <input 
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={paymentForm.upiAmount}
                      onChange={(e) => {
                        setPaymentForm(prev => ({ ...prev, upiAmount: e.target.value }));
                        setPayError('');
                      }}
                      className="w-full h-10 px-3 rounded-xl border border-purple-200 bg-purple-50/20 text-slate-800 focus:bg-white focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all outline-none text-sm font-bold"
                    />
                  </div>
                </div>

                {/* Live Total Calculation Summary Box */}
                <div className={`p-3 rounded-xl border flex items-center justify-between text-xs font-black transition-all ${
                  getPayTotal() > (selectedBill ? parseFloat(selectedBill.due_amount) + 0.01 : 0)
                    ? 'bg-rose-50 border-rose-200 text-rose-700'
                    : getPayTotal() > 0
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-slate-50 border-slate-200 text-slate-500'
                }`}>
                  <div className="flex items-center gap-1.5">
                    <span>💳</span>
                    <span>TOTAL COLLECTED:</span>
                  </div>
                  <div className="text-sm">
                    ₹ {getPayTotal().toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>

              {/* Remarks */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">
                  Remarks (Optional)
                </label>
                <input 
                  type="text"
                  placeholder="Payment notes..."
                  value={paymentForm.remarks}
                  onChange={(e) => setPaymentForm(prev => ({ ...prev, remarks: e.target.value }))}
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                />
              </div>

              {/* Error and Success Feedbacks */}
              {payError && (
                <div className="bg-red-50 text-red-650 p-3 rounded-xl border border-red-100 text-[11px] font-bold">
                  ⚠️ {payError}
                </div>
              )}
              {paySuccess && (
                <div className="bg-emerald-50 text-emerald-650 p-3 rounded-xl border border-emerald-100 text-[11px] font-bold">
                  ✅ {paySuccess}
                </div>
              )}

              {/* Modal Buttons */}
              <div className="flex gap-3 pt-3">
                <button
                  type="submit"
                  disabled={isSavingPay}
                  className="px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider flex-1 transition-all"
                >
                  {isSavingPay ? <span className="loading loading-spinner text-white text-xs"></span> : 'Receive Payment'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsPayModalOpen(false)}
                  className="px-5 py-3 rounded-xl bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 font-bold text-xs uppercase tracking-wider"
                >
                  Cancel
                </button>
              </div>
            </form>

          </div>
          <div className="modal-backdrop bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsPayModalOpen(false)}></div>
        </div>,
        document.body
      )}

      {/* VIEW DETAILS & PAYMENT TIMELINE MODAL */}
      {isTimelineModalOpen && selectedBill && createPortal(
        <div className="modal modal-open animate-fade-in z-50">
          <div className="modal-box max-w-5xl bg-white border border-slate-200/80 rounded-3xl p-8 shadow-2xl relative flex flex-col md:flex-row gap-6 max-h-[85vh] overflow-y-auto z-10">
            <button 
              onClick={() => setIsTimelineModalOpen(false)}
              className="absolute top-4 right-4 w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 text-slate-450 hover:bg-slate-100 hover:text-slate-800 flex items-center justify-center font-bold transition-all"
            >
              ✕
            </button>

            {loadingTimeline ? (
              <div className="flex items-center justify-center w-full py-24">
                <span className="loading loading-spinner text-primary"></span>
              </div>
            ) : (
              <>
                {/* Left side: Invoice Details Mockup */}
                <div className="flex-1 space-y-4 min-w-0">
                  <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 pb-2">
                    📄 INVOICE DETAILS
                  </h3>
                  
                  {timelineBill && (
                    <div className="border border-slate-200 p-5 rounded-2xl bg-slate-50/25 space-y-4 text-xs font-semibold text-slate-700">
                      <div className="flex justify-between border-b border-slate-200 pb-2.5">
                        <div>
                          <div className="font-extrabold text-slate-800 uppercase">{timelineBill.company}</div>
                          <div className="text-[10px] text-slate-450 mt-0.5">Billed context: {timelineBill.customer_type}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-black text-primary font-mono">{timelineBill.id}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">{formatDateDDMMYYYY(timelineBill.billing_date)}</div>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <div className="text-[10px] text-slate-400 uppercase font-black">Customer Details:</div>
                        <div className="font-extrabold text-slate-800 text-sm">{timelineBill.customer_name}</div>
                        <div>Phone: {timelineBill.customer_phone}</div>
                      </div>

                      {/* Products list */}
                      <div className="border border-slate-200 rounded-xl overflow-hidden bg-white mt-4">
                        <table className="w-full text-left border-collapse text-[11px]">
                          <thead>
                            <tr className="bg-slate-100 border-b border-slate-200 text-[9px] font-black text-slate-500 uppercase tracking-wider">
                              <th className="py-2 px-2.5">Product</th>
                              <th className="py-2 px-2.5 text-center">Qty</th>
                              <th className="py-2 px-2.5 text-right">Rate</th>
                              <th className="py-2 px-2.5 text-right">Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-150 font-bold text-slate-700">
                            {invoiceItems.map(item => (
                              <tr key={item.id}>
                                <td className="py-1.5 px-2.5 text-slate-850 font-extrabold">{item.product_name}</td>
                                <td className="py-1.5 px-2.5 text-center">{item.quantity}</td>
                                <td className="py-1.5 px-2.5 text-right">₹ {parseFloat(item.rate_with_tax).toFixed(2)}</td>
                                <td className="py-1.5 px-2.5 text-right text-slate-800">₹ {parseFloat(item.total_amount).toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Financial summary */}
                      <div className="border-t border-slate-200 pt-3 flex flex-col items-end gap-1">
                        <div>Invoice Total: <span className="font-extrabold">₹ {parseFloat(timelineBill.grand_total).toFixed(2)}</span></div>
                        <div className="text-emerald-600">Total Paid: <span className="font-extrabold">₹ {parseFloat(timelineBill.amount_paid).toFixed(2)}</span></div>
                        <div className="text-rose-500 font-black border-t border-dashed border-slate-200 pt-1 mt-1 w-44 text-right">
                          Remaining Due: ₹ {parseFloat(timelineBill.due_amount).toFixed(2)}
                        </div>
                      </div>

                    </div>
                  )}
                </div>

                {/* Right side: Payment Timeline */}
                <div className="flex-1 space-y-4 min-w-0 border-t md:border-t-0 md:border-l border-slate-200 pt-4 md:pt-0 md:pl-6">
                  <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 pb-2">
                    ⏳ PAYMENT TIMELINE
                  </h3>

                  {timelineBill && (
                    <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-[2px] before:bg-slate-200">
                      
                      {/* 1. Invoice Created Node */}
                      <div className="relative">
                        {/* Node circle */}
                        <div className="absolute -left-6 top-1 w-4.5 h-4.5 bg-blue-500 border-4 border-white rounded-full shadow-sm"></div>
                        <div className="text-xs">
                          <div className="font-extrabold text-slate-800">Invoice Created</div>
                          <div className="text-[10px] text-slate-400 font-bold mt-0.5">{formatDateDDMMYYYY(timelineBill.billing_date)}</div>
                          <div className="text-slate-500 mt-1 font-bold">
                            Total invoice amount generated on credit: <span className="text-slate-800 font-extrabold">₹ {parseFloat(timelineBill.grand_total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                          </div>
                        </div>
                      </div>

                      {/* 2. Timeline Events (Payments & Returns) */}
                      {(() => {
                        const mergedEvents = getMergedTimelineEvents();
                        return (
                          <>
                            {mergedEvents.map((evt, idx) => (
                              <div key={evt.id} className="relative">
                                {/* Node circle: emerald for payment, orange for return */}
                                <div className={`absolute -left-6 top-1 w-4.5 h-4.5 border-4 border-white rounded-full shadow-sm ${
                                  evt.type === 'payment' ? 'bg-emerald-500' : 'bg-orange-500'
                                }`}></div>
                                <div className="text-xs">
                                  <div className="font-extrabold text-slate-800">
                                    {evt.type === 'payment' 
                                      ? `Partial Payment received (Receipt #${idx + 1})` 
                                      : 'Sales Return / Credit Note'
                                    }
                                  </div>
                                  <div className="text-[10px] text-slate-400 font-bold mt-0.5">{formatDateDDMMYYYY(evt.date)}</div>
                                  <div className={`p-2.5 rounded-xl border mt-1.5 space-y-1 font-medium text-[11px] ${
                                    evt.type === 'payment' 
                                      ? 'bg-emerald-50/50 border-emerald-100/60 text-slate-650' 
                                      : 'bg-orange-50/50 border-orange-100/60 text-slate-650'
                                  }`}>
                                    <div className="flex justify-between">
                                      <span>{evt.type === 'payment' ? 'Receipt No:' : 'Credit Note No:'}</span>
                                      <span className="font-mono font-bold text-slate-800">{evt.id}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span>{evt.type === 'payment' ? 'Received Amount:' : 'Adjusted Value:'}</span>
                                      <span className={`font-black ${evt.type === 'payment' ? 'text-emerald-600' : 'text-orange-600'}`}>
                                        ₹ {evt.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                      </span>
                                    </div>
                                    {evt.type === 'payment' && (
                                      <div className="flex justify-between">
                                        <span>Payment Mode:</span>
                                        <span className="font-bold text-slate-800">{evt.method}</span>
                                      </div>
                                    )}
                                    {evt.remarks && (
                                      <div className={`text-[10px] border-t pt-1 text-slate-400 italic ${
                                        evt.type === 'payment' ? 'border-emerald-100' : 'border-orange-100'
                                      }`}>
                                        {evt.type === 'payment' ? `Notes: "${evt.remarks}"` : evt.remarks}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}

                            {/* 3. Fully Cleared node */}
                            {parseFloat(timelineBill.due_amount) === 0 && (
                              <div className="relative">
                                <div className="absolute -left-6 top-1 w-4.5 h-4.5 bg-indigo-600 border-4 border-white rounded-full shadow-sm"></div>
                                <div className="text-xs">
                                  <div className="font-black text-indigo-600 uppercase tracking-wider text-[11px]">Fully Paid & Settle Completed</div>
                                  <div className="text-[10px] text-slate-400 font-bold mt-0.5">
                                    {mergedEvents.length > 0 ? formatDateDDMMYYYY(mergedEvents[mergedEvents.length - 1].date) : formatDateDDMMYYYY(timelineBill.billing_date)}
                                  </div>
                                  <p className="text-slate-500 mt-1">Outstanding balance is fully cleared (₹ 0.00). Invoice is fully settled.</p>
                                </div>
                              </div>
                            )}
                          </>
                        );
                      })()}

                    </div>
                  )}
                </div>
              </>
            )}

          </div>
          <div className="modal-backdrop bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsTimelineModalOpen(false)}></div>
        </div>,
        document.body
      )}

    </div>
  );
};

export default CreditBalance;
