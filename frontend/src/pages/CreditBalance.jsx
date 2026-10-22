import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import SearchableSelect from '../components/SearchableSelect';
import TablePagination, { getDensityClass } from '../components/common/TablePagination';
import { useAuth } from '../context/AuthContext';

const CreditBalance = () => {
  const navigate = useNavigate();
  const { canCreate, canUpdate } = useAuth();

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
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [company, setCompany] = useState('All Companies');
  const [customerType, setCustomerType] = useState('All Types');

  // Pagination & Density
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [density, setDensity] = useState('medium');
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

  // Fetch stats, customers, and table list on filter changes
  useEffect(() => {
    fetchStats();
    fetchCustomers();
  }, []);

  useEffect(() => {
    fetchOutstandingBills();
  }, [page, search, startDate, endDate, company, customerType]);

  const fetchCustomers = async () => {
    try {
      const res = await api.get('/customers');
      const list = res.data?.customers || (Array.isArray(res.data) ? res.data : []);
      setCustomers(list);
    } catch (err) {
      console.error('Failed to load customer list:', err);
    }
  };

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
    <div className="space-y-6 animate-fade-in w-full pb-12">
      
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
          {/* Customer Search Dropdown */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-black text-slate-450 uppercase tracking-wider block">
                Search Customer
              </label>
              {search && (
                <button
                  type="button"
                  onClick={() => { setSearch(''); setPage(1); }}
                  className="text-[10px] font-bold text-rose-500 hover:text-rose-700 transition-colors"
                >
                  ✕ Clear
                </button>
              )}
            </div>
            <SearchableSelect
              options={[
                { value: '', label: '-- All Customers --' },
                ...customers.map(c => ({
                  value: c.name,
                  label: `${c.name}${c.phone ? ` (${c.phone})` : ''}`,
                  badge: c.customerType || undefined,
                  rawName: c.name,
                  phone: c.phone
                }))
              ]}
              value={search}
              onChange={(val) => {
                setSearch(val || '');
                setPage(1);
              }}
              placeholder="Select or search customer..."
              searchPlaceholder="Type customer name or phone..."
              className="w-full h-11"
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
                    <th className={getDensityClass(density, true)}>Due ID</th>
                    <th className={getDensityClass(density, true)}>Invoice No</th>
                    <th className={getDensityClass(density, true)}>Date</th>
                    <th className={getDensityClass(density, true)}>Customer Name</th>
                    <th className={getDensityClass(density, true)}>Company</th>
                    <th className={getDensityClass(density, true)}>Customer Type</th>
                    <th className={`${getDensityClass(density, true)} text-right`}>Invoice Amount</th>
                    <th className={`${getDensityClass(density, true)} text-right`}>Amount Paid</th>
                    <th className={`${getDensityClass(density, true)} text-right`}>Outstanding Balance</th>
                    <th className={`${getDensityClass(density, true)} text-center`}>Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-750 text-xs font-semibold">
                  {bills.map(b => (
                    <tr key={b.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className={`${getDensityClass(density)} font-mono text-[10px] text-slate-400`}>DUE-{b.id.split('-').pop()}</td>
                      <td className={`${getDensityClass(density)} font-black text-primary`}>{b.id}</td>
                      <td className={getDensityClass(density)}>{formatDateDDMMYYYY(b.billing_date)}</td>
                      <td className={getDensityClass(density)}>
                        <div className="font-extrabold text-slate-800">{b.customer_name}</div>
                        <div className="text-[10px] font-bold text-slate-400 mt-0.5">{b.customer_phone}</div>
                      </td>
                      <td className={getDensityClass(density)}>
                        <span className={`px-2.5 py-1 rounded-lg text-[9px] font-extrabold ${b.company.includes('Pet') ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' : 'bg-sky-50 text-sky-600 border border-sky-100'}`}>
                          {b.company.includes('Pet') ? 'Kemps Pet' : 'Kempannavar'}
                        </span>
                      </td>
                      <td className={`${getDensityClass(density)} uppercase text-[9px] tracking-wider text-slate-500 font-bold`}>
                        {b.customer_type}
                      </td>
                      <td className={`${getDensityClass(density)} text-right font-bold text-slate-700`}>
                        ₹ {parseFloat(b.grand_total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className={`${getDensityClass(density)} text-right text-emerald-600 font-extrabold`}>
                        ₹ {parseFloat(b.amount_paid).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className={`${getDensityClass(density)} text-right text-rose-500 font-black text-sm`}>
                        <div>₹ {parseFloat(b.due_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                        {b.has_pending_payment ? (
                          <div className="text-[9px] text-amber-600 font-black bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100 mt-1 w-max ml-auto uppercase tracking-wider">
                            Verification Pending
                          </div>
                        ) : null}
                      </td>
                      <td className={`${getDensityClass(density)} text-center`}>
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
                            (canCreate('credit-balance') || canUpdate('credit-balance')) && (
                              <button 
                                onClick={() => handleOpenPay(b)}
                                className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[11px] transition-all flex items-center gap-1"
                                title="Collect Outstanding Payment"
                              >
                                <span>💵</span> Receive Payment
                              </button>
                            )
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
            <TablePagination 
              page={page}
              limit={limit}
              total={total}
              onPageChange={setPage}
              onLimitChange={setLimit}
              density={density}
              onDensityChange={setDensity}
            />
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
          <div 
            className="modal-box w-11/12 max-w-6xl !max-w-6xl bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-2xl relative flex flex-col max-h-[92vh] overflow-y-auto z-10"
            style={{ maxWidth: '1150px', width: '95vw' }}
          >
            {/* Modal Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 border-b border-slate-150 gap-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-blue-50 border border-blue-100/80 flex items-center justify-center text-blue-600 text-xl shadow-sm shrink-0">
                  📄
                </div>
                <div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                      Invoice Details & Payment History
                    </h2>
                    {timelineBill && (
                      <span className="font-mono text-xs font-black bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-0.5 rounded-lg">
                        {timelineBill.id}
                      </span>
                    )}
                    {timelineBill && (
                      <span className={`text-[11px] font-black uppercase px-2.5 py-0.5 rounded-full border ${
                        parseFloat(timelineBill.due_amount) === 0
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-rose-50 text-rose-600 border-rose-200'
                      }`}>
                        {parseFloat(timelineBill.due_amount) === 0 ? '✓ Paid & Settled' : '● Due Pending'}
                      </span>
                    )}
                  </div>
                  {timelineBill && (
                    <p className="text-xs text-slate-400 font-semibold mt-0.5">
                      Billed on {formatDateDDMMYYYY(timelineBill.billing_date)} • {timelineBill.company}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                {timelineBill && parseFloat(timelineBill.due_amount) > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsTimelineModalOpen(false);
                      handleOpenPay(timelineBill);
                    }}
                    className="h-9 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs shadow-md shadow-emerald-100 flex items-center gap-1.5 transition-all"
                  >
                    <span>💳</span>
                    <span>Receive Payment</span>
                  </button>
                )}
                <button 
                  onClick={() => setIsTimelineModalOpen(false)}
                  className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 text-slate-400 hover:bg-slate-100 hover:text-slate-800 flex items-center justify-center font-bold transition-all"
                >
                  ✕
                </button>
              </div>
            </div>

            {loadingTimeline ? (
              <div className="flex flex-col items-center justify-center w-full py-28 gap-3">
                <span className="loading loading-spinner text-primary loading-lg"></span>
                <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Loading invoice & payment timeline...</span>
              </div>
            ) : (
              <div className="flex flex-col lg:flex-row gap-8 pt-6">
                {/* Left side: Invoice Details (Spacious 60%) */}
                <div className="flex-1 lg:w-7/12 space-y-6 min-w-0">
                  {timelineBill && (
                    <>
                      {/* Customer & Company Details Header Box */}
                      <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-5">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Customer Details</span>
                            <div className="text-base font-extrabold text-slate-800 flex items-center gap-1.5">
                              <span>👤</span> {timelineBill.customer_name}
                            </div>
                            <div className="text-xs font-semibold text-slate-600 flex items-center gap-1.5 pt-0.5">
                              <span>📞</span> {timelineBill.customer_phone || 'No phone recorded'}
                            </div>
                          </div>
                          <div className="space-y-1 sm:text-right">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Billing Context</span>
                            <div className="text-sm font-extrabold text-slate-800 uppercase">{timelineBill.company}</div>
                            <div className="inline-flex items-center px-2.5 py-0.5 rounded-lg bg-blue-50 text-blue-700 text-xs font-bold border border-blue-100 mt-0.5">
                              {timelineBill.customer_type || 'General Customer'}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Products list table */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-slate-500 uppercase tracking-wider">
                            📦 Billed Products ({invoiceItems.length})
                          </span>
                        </div>
                        <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-slate-100/90 border-b border-slate-200 text-[11px] font-black text-slate-600 uppercase tracking-wider">
                                <th className="py-3 px-4 w-12 text-center">#</th>
                                <th className="py-3 px-4">Product Name</th>
                                <th className="py-3 px-3 text-center w-20">Qty</th>
                                <th className="py-3 px-4 text-right w-28">Rate</th>
                                <th className="py-3 px-4 text-right w-32">Total Amount</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-sm">
                              {invoiceItems.length === 0 ? (
                                <tr>
                                  <td colSpan="5" className="py-10 text-center text-slate-400 font-medium italic">
                                    No item line details available.
                                  </td>
                                </tr>
                              ) : (
                                invoiceItems.map((item, idx) => (
                                  <tr key={item.id || idx} className="hover:bg-blue-50/20 transition-colors">
                                    <td className="py-3 px-4 text-center font-mono text-xs font-bold text-slate-400">{idx + 1}</td>
                                    <td className="py-3 px-4">
                                      <div className="font-extrabold text-slate-800">{item.product_name}</div>
                                      {parseFloat(item.tax_percent) > 0 && (
                                        <span className="text-[10px] text-slate-400 font-semibold">Includes {item.tax_percent}% GST</span>
                                      )}
                                    </td>
                                    <td className="py-3 px-3 text-center">
                                      <span className="inline-block px-2.5 py-0.5 rounded-lg bg-slate-100 text-slate-800 font-mono font-black text-xs">
                                        {item.quantity}
                                      </span>
                                    </td>
                                    <td className="py-3 px-4 text-right font-mono font-semibold text-slate-600">
                                      ₹ {parseFloat(item.rate_with_tax || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                    <td className="py-3 px-4 text-right font-mono font-black text-slate-900">
                                      ₹ {parseFloat(item.total_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Financial summary tiles */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 flex flex-col justify-between">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Invoice Total</span>
                          <div className="text-lg font-black text-slate-900 font-mono mt-1">
                            ₹ {parseFloat(timelineBill.grand_total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                          <span className="text-[10px] text-slate-450 font-semibold mt-1">Gross billed amount</span>
                        </div>

                        <div className="bg-emerald-50/60 border border-emerald-100 rounded-2xl p-4 flex flex-col justify-between">
                          <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Total Collected</span>
                          <div className="text-lg font-black text-emerald-700 font-mono mt-1">
                            ₹ {parseFloat(timelineBill.amount_paid || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                          <span className="text-[10px] text-emerald-600/80 font-semibold mt-1">Paid to date</span>
                        </div>

                        <div className={`rounded-2xl p-4 flex flex-col justify-between border ${
                          parseFloat(timelineBill.due_amount) === 0 
                            ? 'bg-blue-50/60 border-blue-100 text-blue-700' 
                            : 'bg-rose-50/70 border-rose-100 text-rose-600'
                        }`}>
                          <span className="text-[10px] font-black uppercase tracking-widest">
                            {parseFloat(timelineBill.due_amount) === 0 ? 'Settlement Status' : 'Remaining Due'}
                          </span>
                          <div className="text-lg font-black font-mono mt-1">
                            {parseFloat(timelineBill.due_amount) === 0 ? '₹ 0.00' : `₹ ${parseFloat(timelineBill.due_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                          </div>
                          <span className="text-[10px] font-semibold mt-1">
                            {parseFloat(timelineBill.due_amount) === 0 ? 'Fully Cleared' : 'Pending Payment'}
                          </span>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Right side: Payment Timeline (Spacious 40%) */}
                <div className="flex-1 lg:w-5/12 space-y-4 min-w-0 border-t lg:border-t-0 lg:border-l border-slate-200/80 pt-6 lg:pt-0 lg:pl-8">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-150">
                    <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider">
                      ⏳ PAYMENT TIMELINE & ACTIVITY
                    </h3>
                    <span className="text-[11px] font-bold text-slate-400 bg-slate-100 px-2.5 py-0.5 rounded-lg">
                      {getMergedTimelineEvents().length} Event{getMergedTimelineEvents().length === 1 ? '' : 's'}
                    </span>
                  </div>

                  {timelineBill && (
                    <>
                      {/* Settlement progress meter */}
                      {(() => {
                        const grandTotal = parseFloat(timelineBill.grand_total) || 1;
                        const paidTotal = parseFloat(timelineBill.amount_paid) || 0;
                        const pct = Math.min(100, Math.max(0, Math.round((paidTotal / grandTotal) * 100)));
                        return (
                          <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-4 space-y-2">
                            <div className="flex justify-between text-xs font-bold text-slate-700">
                              <span>Settlement Progress</span>
                              <span className={pct === 100 ? 'text-emerald-600 font-black' : 'text-slate-600 font-mono font-bold'}>
                                {pct}% Cleared
                              </span>
                            </div>
                            <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                              <div 
                                className={`h-full rounded-full transition-all duration-500 ${
                                  pct === 100 ? 'bg-emerald-500' : 'bg-primary'
                                }`}
                                style={{ width: `${pct}%` }}
                              ></div>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Timeline stream */}
                      <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-[2px] before:bg-slate-200 mt-4">
                        {/* 1. Invoice Created Node */}
                        <div className="relative">
                          <div className="absolute -left-6 top-1 w-4 h-4 bg-blue-500 border-4 border-white rounded-full shadow-sm"></div>
                          <div className="text-xs">
                            <div className="font-extrabold text-slate-800">Invoice Created on Credit</div>
                            <div className="text-[10px] text-slate-400 font-bold mt-0.5">{formatDateDDMMYYYY(timelineBill.billing_date)}</div>
                            <div className="bg-blue-50/50 border border-blue-100/70 p-3 rounded-xl mt-1.5 font-medium text-slate-650">
                              Total invoice credit amount: <span className="text-slate-800 font-extrabold font-mono">₹ {parseFloat(timelineBill.grand_total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
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
                                  <div className={`absolute -left-6 top-1 w-4 h-4 border-4 border-white rounded-full shadow-sm ${
                                    evt.type === 'payment' ? 'bg-emerald-500' : 'bg-orange-500'
                                  }`}></div>
                                  <div className="text-xs">
                                    <div className="font-extrabold text-slate-800">
                                      {evt.type === 'payment' 
                                        ? `Partial Payment Received (Receipt #${idx + 1})` 
                                        : 'Sales Return / Credit Note'
                                      }
                                    </div>
                                    <div className="text-[10px] text-slate-400 font-bold mt-0.5">{formatDateDDMMYYYY(evt.date)}</div>
                                    <div className={`p-3 rounded-xl border mt-1.5 space-y-1.5 text-xs ${
                                      evt.type === 'payment' 
                                        ? 'bg-emerald-50/50 border-emerald-100 text-slate-700' 
                                        : 'bg-orange-50/50 border-orange-100 text-slate-700'
                                    }`}>
                                      <div className="flex justify-between items-center">
                                        <span className="text-[11px] font-semibold text-slate-500">
                                          {evt.type === 'payment' ? 'Receipt No:' : 'Credit Note No:'}
                                        </span>
                                        <span className="font-mono font-bold text-slate-800 text-xs bg-white px-2 py-0.5 rounded border border-slate-200/60">
                                          {evt.id}
                                        </span>
                                      </div>
                                      <div className="flex justify-between items-center">
                                        <span className="text-[11px] font-semibold text-slate-500">
                                          {evt.type === 'payment' ? 'Amount Received:' : 'Adjusted Value:'}
                                        </span>
                                        <span className={`font-mono font-black text-sm ${evt.type === 'payment' ? 'text-emerald-600' : 'text-orange-600'}`}>
                                          ₹ {evt.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                        </span>
                                      </div>
                                      {evt.type === 'payment' && (
                                        <div className="flex justify-between items-center">
                                          <span className="text-[11px] font-semibold text-slate-500">Payment Mode:</span>
                                          <span className="inline-block px-2 py-0.5 rounded bg-white text-slate-800 font-bold text-[11px] border border-slate-200/60">
                                            {evt.method}
                                          </span>
                                        </div>
                                      )}
                                      {evt.remarks && (
                                        <div className={`text-[11px] border-t pt-1.5 text-slate-500 italic ${
                                          evt.type === 'payment' ? 'border-emerald-100' : 'border-orange-100'
                                        }`}>
                                          Note: "{evt.remarks}"
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))}

                              {/* Empty state if no payments recorded */}
                              {mergedEvents.length === 0 && parseFloat(timelineBill.due_amount) > 0 && (
                                <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200/70 text-amber-800 space-y-2.5">
                                  <div className="flex items-center gap-1.5 text-xs font-black">
                                    <span>⚠️</span> No Payments Recorded Yet
                                  </div>
                                  <p className="text-xs text-amber-700/90 leading-relaxed font-medium">
                                    This invoice has a pending outstanding balance of <strong className="font-mono">₹ {parseFloat(timelineBill.due_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>.
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setIsTimelineModalOpen(false);
                                      handleOpenPay(timelineBill);
                                    }}
                                    className="w-full py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs shadow-sm flex items-center justify-center gap-1.5 transition-all"
                                  >
                                    <span>💳</span> Collect Payment Now
                                  </button>
                                </div>
                              )}

                              {/* 3. Fully Cleared node */}
                              {parseFloat(timelineBill.due_amount) === 0 && (
                                <div className="relative">
                                  <div className="absolute -left-6 top-1 w-4 h-4 bg-emerald-600 border-4 border-white rounded-full shadow-sm"></div>
                                  <div className="text-xs">
                                    <div className="font-black text-emerald-600 uppercase tracking-wider text-[11px]">
                                      ✓ Fully Paid & Settled
                                    </div>
                                    <div className="text-[10px] text-slate-400 font-bold mt-0.5">
                                      {mergedEvents.length > 0 ? formatDateDDMMYYYY(mergedEvents[mergedEvents.length - 1].date) : formatDateDDMMYYYY(timelineBill.billing_date)}
                                    </div>
                                    <div className="bg-emerald-50/60 border border-emerald-100 p-3 rounded-xl mt-1.5 text-slate-600 font-medium">
                                      Outstanding balance is completely cleared (₹ 0.00). Invoice is fully settled.
                                    </div>
                                  </div>
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </>
                  )}
                </div>
              </div>
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
