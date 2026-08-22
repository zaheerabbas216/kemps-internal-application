import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import api from '../api/axios';

const SalesReturn = () => {
  // Tabs: 'new', 'history', 'reports'
  const [activeTab, setActiveTab] = useState('new');

  // Customer & Invoice States
  const [customers, setCustomers] = useState([]);
  const [nameSearch, setNameSearch] = useState('');
  const [phoneSearch, setPhoneSearch] = useState('');
  const [showNameSuggestions, setShowNameSuggestions] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [invoices, setInvoices] = useState([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);

  // Return Entry Form Modal States
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [invoiceItems, setInvoiceItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [returnItems, setReturnItems] = useState({}); // { productId: { qty: 0, reason: 'Damage' } }
  const [returnDate, setReturnDate] = useState('');
  const [returnReasonGlobal, setReturnReasonGlobal] = useState('Damage');
  
  const [settlementMethod, setSettlementMethod] = useState('CREDIT');
  const [refundAmount, setRefundAmount] = useState('');
  const [refundDate, setRefundDate] = useState('');
  const [refundMode, setRefundMode] = useState('Cash');
  const [refundRefNo, setRefundRefNo] = useState('');
  const [refundRemarks, setRefundRemarks] = useState('');

  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Invoice Details Modal States
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [detailInvoice, setDetailInvoice] = useState(null);
  const [detailItems, setDetailItems] = useState([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Return History States
  const [historyList, setHistoryList] = useState([]);
  const [historySearch, setHistorySearch] = useState('');
  const [historyStart, setHistoryStart] = useState('');
  const [historyEnd, setHistoryEnd] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const [historyLimit] = useState(10);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);

  // Reports States
  const [reportsData, setReportsData] = useState({
    customerReturnReport: [],
    productReturnReport: [],
    salesReturnRegister: [],
    returnExpenseReport: []
  });
  const [loadingReports, setLoadingReports] = useState(false);
  const [reportSubTab, setReportSubTab] = useState('customer'); // 'customer', 'product', 'register', 'expense'

  // Reason Options
  const REASONS = ['Damage', 'Leakage', 'Expired', 'Wrong Supply', 'Customer Rejection', 'Other'];

  // Today's Returns Home View State
  const [todayReturns, setTodayReturns] = useState([]);
  const [loadingTodayReturns, setLoadingTodayReturns] = useState(false);

  const fetchTodayReturns = async () => {
    try {
      setLoadingTodayReturns(true);
      const now = new Date();
      const offset = now.getTimezoneOffset();
      const istDate = new Date(now.getTime() + (330 + offset) * 60000);
      const yyyy = istDate.getFullYear();
      const mm = String(istDate.getMonth() + 1).padStart(2, '0');
      const dd = String(istDate.getDate()).padStart(2, '0');
      const todayStr = `${yyyy}-${mm}-${dd}`;

      const res = await api.get('/sales-return/history', {
        params: {
          page: 1,
          limit: 50,
          startDate: todayStr,
          endDate: todayStr
        }
      });
      if (res.data.ok) {
        setTodayReturns(res.data.returns || []);
      }
    } catch (err) {
      console.error('Failed to fetch today returns:', err);
    } finally {
      setLoadingTodayReturns(false);
    }
  };

  // 1. Initial Load of Customer Autocomplete list & Today Returns
  useEffect(() => {
    fetchCustomers();
    fetchTodayReturns();
    // Default return date to today in IST
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const istDate = new Date(now.getTime() + (330 + offset) * 60000);
    const yyyy = istDate.getFullYear();
    const mm = String(istDate.getMonth() + 1).padStart(2, '0');
    const dd = String(istDate.getDate()).padStart(2, '0');
    setReturnDate(`${yyyy}-${mm}-${dd}`);
  }, []);

  // 2. Fetch history and reports when tabs change
  useEffect(() => {
    if (activeTab === 'history') {
      fetchReturnHistory();
    } else if (activeTab === 'reports') {
      fetchReports();
    }
  }, [activeTab, historyPage, historySearch, historyStart, historyEnd]);

  const fetchCustomers = async () => {
    try {
      const res = await api.get('/customers');
      if (res.data.customers) {
        setCustomers(res.data.customers || []);
      }
    } catch (err) {
      console.error('Failed to load customers:', err);
    }
  };

  const fetchInvoices = async (cId) => {
    try {
      setLoadingInvoices(true);
      const res = await api.get('/sales-return/invoices', {
        params: {
          customerId: cId,
          startDate,
          endDate
        }
      });
      if (res.data.ok) {
        setInvoices(res.data.invoices || []);
      }
    } catch (err) {
      console.error('Failed to fetch customer invoices:', err);
    } finally {
      setLoadingInvoices(false);
    }
  };

  const handleSelectCustomer = (cust) => {
    setSelectedCustomer(cust);
    setNameSearch(cust.name);
    setPhoneSearch(cust.phone);
    setShowNameSuggestions(false);
    fetchInvoices(cust.id);
  };

  const handleClearCustomer = () => {
    setSelectedCustomer(null);
    setNameSearch('');
    setPhoneSearch('');
    setInvoices([]);
  };

  const handlePhoneSearch = async () => {
    if (!phoneSearch.trim()) return;
    try {
      const res = await api.get('/customers', { params: { phone: phoneSearch } });
      if (res.data.exists) {
        const c = res.data.customer;
        setSelectedCustomer(c);
        setNameSearch(c.name);
        setPhoneSearch(c.phone);
        fetchInvoices(c.id);
      } else {
        alert('Customer phone number not found.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenReturnModal = async (invoice) => {
    setSelectedInvoice(invoice);
    setIsReturnModalOpen(true);
    setLoadingItems(true);
    setReturnItems({});
    setSubmitError('');
    setSubmitSuccess('');
    setSettlementMethod('CREDIT');
    setRefundAmount('');
    setRefundDate(returnDate);
    setRefundMode('Cash');
    setRefundRefNo('');
    setRefundRemarks('');

    try {
      const res = await api.get(`/sales-return/invoice/${invoice.id}`);
      if (res.data.ok) {
        setInvoiceItems(res.data.items || []);
        // Initialize return item state
        const initialReturn = {};
        res.data.items.forEach(item => {
          initialReturn[item.finishedProductId] = {
            qty: '0',
            reason: 'Damage'
          };
        });
        setReturnItems(initialReturn);
      }
    } catch (err) {
      console.error(err);
      alert('Error fetching invoice items.');
      setIsReturnModalOpen(false);
    } finally {
      setLoadingItems(false);
    }
  };

  const handleOpenDetailModal = async (invoice) => {
    setDetailInvoice(invoice);
    setIsDetailModalOpen(true);
    setLoadingDetails(true);
    setDetailItems([]);

    try {
      const res = await api.get(`/billing/${invoice.id}`);
      if (res.data.ok) {
        setDetailItems(res.data.items || []);
      }
    } catch (err) {
      console.error(err);
      alert('Error loading invoice details.');
      setIsDetailModalOpen(false);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleReturnQtyChange = (productId, val, maxVal) => {
    const qty = parseInt(val, 10) || 0;
    const finalQty = qty > maxVal ? maxVal : (qty < 0 ? 0 : qty);

    setReturnItems(prev => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        qty: String(finalQty)
      }
    }));
  };

  const handleReturnReasonChange = (productId, val) => {
    setReturnItems(prev => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        reason: val
      }
    }));
  };

  // Calculations for Refund and Dues Adjustments
  const computedRefundTotal = invoiceItems.reduce((sum, item) => {
    const rQty = parseInt(returnItems[item.finishedProductId]?.qty || 0, 10);
    return sum + (rQty * parseFloat(item.rateWithTax));
  }, 0);

  const calculateDuesAdjustment = () => {
    if (!selectedInvoice) return { newDue: 0, creditCreated: 0 };
    const due = parseFloat(selectedInvoice.due_amount);
    if (computedRefundTotal <= due) {
      return {
        newDue: due - computedRefundTotal,
        creditCreated: 0
      };
    } else {
      return {
        newDue: 0,
        creditCreated: computedRefundTotal - due
      };
    }
  };

  const duesInfo = calculateDuesAdjustment();

  useEffect(() => {
    if (isReturnModalOpen) {
      setRefundAmount(String(computedRefundTotal));
    }
  }, [computedRefundTotal, isReturnModalOpen]);

  const handleSaveReturn = async (e) => {
    e.preventDefault();
    setSubmitError('');
    setSubmitSuccess('');

    const payloadItems = [];
    Object.keys(returnItems).forEach(prodId => {
      const qty = parseInt(returnItems[prodId].qty, 10);
      if (qty > 0) {
        payloadItems.push({
          finishedProductId: parseInt(prodId, 10),
          quantity: qty
        });
      }
    });

    if (payloadItems.length === 0) {
      return setSubmitError('Please enter return quantity > 0 for at least one item.');
    }
    if (!returnDate) {
      return setSubmitError('Return Date is required.');
    }

    setIsSubmitting(true);
    try {
      const res = await api.post('/sales-return', {
        billId: selectedInvoice.id,
        returnDate,
        reason: returnReasonGlobal,
        items: payloadItems,
        settlementMethod,
        refundAmount: parseFloat(refundAmount) || 0.00,
        refundDate: settlementMethod === 'REFUND' ? refundDate : null,
        refundMode: settlementMethod === 'REFUND' ? refundMode : null,
        refundRefNo: settlementMethod === 'REFUND' ? refundRefNo : null,
        refundRemarks: settlementMethod === 'REFUND' ? refundRemarks : null
      });

      if (res.data.ok) {
        setSubmitSuccess(res.data.message || 'Sales Return recorded successfully!');
        fetchTodayReturns();
        // Refresh customer details (to show updated credit balance)
        if (selectedCustomer) {
          const custRes = await api.get('/customers', { params: { phone: selectedCustomer.phone } });
          if (custRes.data.exists) {
            setSelectedCustomer(custRes.data.customer);
          }
        }
        setTimeout(() => {
          setIsReturnModalOpen(false);
          setSelectedInvoice(null);
          if (selectedCustomer) {
            fetchInvoices(selectedCustomer.id);
          }
        }, 1200);
      } else {
        setSubmitError(res.data.error || 'Failed to submit sales return.');
      }
    } catch (err) {
      setSubmitError(err.response?.data?.error || err.message || 'An error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const fetchReturnHistory = async () => {
    try {
      setLoadingHistory(true);
      const res = await api.get('/sales-return/history', {
        params: {
          page: historyPage,
          limit: historyLimit,
          search: historySearch,
          startDate: historyStart,
          endDate: historyEnd
        }
      });
      if (res.data.ok) {
        setHistoryList(res.data.returns || []);
        setHistoryTotal(res.data.total || 0);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleExportHistoryExcel = async () => {
    try {
      setExportingExcel(true);
      const res = await api.get('/sales-return/history', {
        params: {
          page: 1,
          limit: Math.max(1000, historyTotal),
          search: historySearch,
          startDate: historyStart,
          endDate: historyEnd
        }
      });

      if (!res.data.ok) return alert('Failed to retrieve return history for Excel export.');
      const allReturns = res.data.returns || [];

      // CSV columns mapping
      const headers = [
        'Return Number',
        'Date',
        'Customer Name',
        'Customer Phone',
        'Invoice Ref',
        'Returned Items',
        'Reason',
        'Return Amount (INR)',
        'Settlement Method',
        'Refunded Amount (INR)',
        'Credit Balance Created (INR)',
        'Refund Mode',
        'Refund Reference Number',
        'Refund Date',
        'Status'
      ];

      const csvRows = [
        headers.map(h => `"${h.replace(/"/g, '""')}"`).join(','),
        ...allReturns.map(r => [
          r.returnNumber,
          r.returnDate,
          r.customerName,
          r.customerPhone,
          r.invoiceNumber,
          r.productsReturned,
          r.reason,
          r.returnAmount,
          r.settlementMethod,
          r.refundAmount,
          r.creditBalanceCreated,
          r.refundMode || '—',
          r.refundRefNo || '—',
          r.refundDate || '—',
          r.status
        ].map(val => `"${String(val ?? '').replace(/"/g, '""')}"`).join(','))
      ];

      // Add UTF-8 BOM so Excel reads it perfectly
      const csvContent = "\uFEFF" + csvRows.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `Sales_Returns_History_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      alert('Error exporting Excel report: ' + err.message);
    } finally {
      setExportingExcel(false);
    }
  };

  const fetchReports = async () => {
    try {
      setLoadingReports(true);
      const res = await api.get('/sales-return/reports');
      if (res.data.ok) {
        setReportsData(res.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingReports(false);
    }
  };

  const formatDateDDMMYYYY = (dateStr) => {
    if (!dateStr) return '—';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  const filteredSuggestions = nameSearch.trim().length > 0
    ? customers.filter(c => c.name.toLowerCase().includes(nameSearch.toLowerCase()))
    : [];

  return (
    <div className="space-y-6 animate-fade-in max-w-6xl mx-auto pb-12">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase">Sales Return / Credit Note</h1>
          <p className="text-slate-500 text-sm font-medium mt-1">Manage product returns, generate credit notes, and adjust ledgers</p>
        </div>

        {/* WORKSPACE NAVIGATION TABS */}
        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200/40 w-fit">
          <button
            onClick={() => setActiveTab('new')}
            className={`px-4 py-2 rounded-lg text-xs font-black tracking-wider transition-all ${
              activeTab === 'new' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            ↩ NEW RETURN
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 rounded-lg text-xs font-black tracking-wider transition-all ${
              activeTab === 'history' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            📋 RETURN HISTORY
          </button>
          <button
            onClick={() => setActiveTab('reports')}
            className={`px-4 py-2 rounded-lg text-xs font-black tracking-wider transition-all ${
              activeTab === 'reports' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            📊 REPORTS
          </button>
        </div>
      </div>

      {/* NEW RETURN TAB VIEW */}
      {activeTab === 'new' && (
        <div className="space-y-6">
          {/* Customer Selection Card */}
          <div className="border border-slate-200/80 bg-white rounded-2xl p-5 shadow-sm space-y-4">
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 pb-2.5">
              👤 SELECT CUSTOMER
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
              {/* Search by Name */}
              <div className="md:col-span-5 relative space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">Customer Name</label>
                <input
                  type="text"
                  placeholder="Type customer name..."
                  value={nameSearch}
                  onChange={(e) => {
                    setNameSearch(e.target.value);
                    setShowNameSuggestions(true);
                  }}
                  onFocus={() => setShowNameSuggestions(true)}
                  disabled={!!selectedCustomer}
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-slate-50/20 text-slate-700 placeholder:text-slate-400 focus:bg-white focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-semibold"
                />

                {showNameSuggestions && filteredSuggestions.length > 0 && (
                  <ul className="absolute z-20 w-full left-0 mt-1.5 bg-white border border-slate-200 rounded-xl max-h-48 overflow-y-auto shadow-lg divide-y divide-slate-100">
                    {filteredSuggestions.map(c => (
                      <li
                        key={c.id}
                        onClick={() => handleSelectCustomer(c)}
                        className="px-4 py-2.5 text-xs text-slate-750 hover:bg-slate-50 cursor-pointer flex justify-between font-bold"
                      >
                        <span>{c.name}</span>
                        <span className="text-[10px] text-slate-400">{c.phone}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="md:col-span-1 text-center text-[10px] font-black text-slate-400 uppercase py-2">
                OR
              </div>

              {/* Search by Phone */}
              <div className="md:col-span-6 flex gap-2 items-end">
                <div className="space-y-1 flex-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">Phone Number</label>
                  <input
                    type="text"
                    placeholder="Enter phone..."
                    value={phoneSearch}
                    onChange={(e) => setPhoneSearch(e.target.value)}
                    disabled={!!selectedCustomer}
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-slate-50/20 text-slate-700 placeholder:text-slate-400 focus:bg-white focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-semibold"
                  />
                </div>
                {!selectedCustomer ? (
                  <button
                    onClick={handlePhoneSearch}
                    className="px-4 h-11 bg-primary text-white hover:bg-primary-hover font-bold text-xs rounded-xl shadow-md shadow-primary/10"
                  >
                    🔎 Find Customer
                  </button>
                ) : (
                  <button
                    onClick={handleClearCustomer}
                    className="px-4 h-11 bg-slate-100 border border-slate-200 text-slate-650 hover:bg-slate-200 font-bold text-xs rounded-xl"
                  >
                    Clear Customer
                  </button>
                )}
              </div>
            </div>

            {/* Selected Customer Profile */}
            {selectedCustomer && (
              <div className="border border-dashed border-primary/20 bg-primary/5 p-4 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4 mt-2">
                <div className="space-y-1 text-xs text-slate-650 font-semibold">
                  <div>Customer ID: <span className="font-extrabold text-slate-800 font-mono">{selectedCustomer.id}</span></div>
                  <div>Name: <span className="font-extrabold text-slate-850">{selectedCustomer.name}</span></div>
                  <div>Phone: <span className="font-bold">{selectedCustomer.phone}</span></div>
                  {selectedCustomer.gst && <div>GSTIN: <span className="font-bold">{selectedCustomer.gst}</span></div>}
                  {selectedCustomer.address && <div>Address: <span>{selectedCustomer.address}</span></div>}
                </div>
                
                {/* Credit Balance Display */}
                <div className="bg-white border border-primary/25 rounded-2xl p-4 flex items-center gap-4 shadow-sm text-right">
                  <div>
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Ledger Credit Balance</span>
                    <span className="text-lg font-black text-emerald-600 mt-1 block">
                      ₹ {(parseFloat(selectedCustomer.creditBalance) || 0.00).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="w-9 h-9 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center text-sm font-bold border border-emerald-100 shrink-0">
                    💳
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Customer Invoices Panel */}
          {selectedCustomer && (
            <div className="border border-slate-200/80 bg-white rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex justify-between items-center border-b border-slate-50 pb-2.5">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                  📄 CUSTOMER INVOICES
                </span>
                
                {/* Date Filters */}
                <div className="flex gap-2 items-center">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="h-8 px-2 rounded-lg border border-slate-200 text-xs font-semibold"
                  />
                  <span className="text-slate-400 text-[10px] font-bold">TO</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="h-8 px-2 rounded-lg border border-slate-200 text-xs font-semibold"
                  />
                  <button
                    onClick={() => fetchInvoices(selectedCustomer.id)}
                    className="h-8 px-3 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800"
                  >
                    Filter
                  </button>
                </div>
              </div>

              {loadingInvoices ? (
                <div className="flex items-center justify-center py-12">
                  <span className="loading loading-spinner text-primary"></span>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/75 border-b border-slate-200/85 text-[10px] font-black text-slate-450 uppercase tracking-wider">
                        <th className="py-3 px-4">Invoice Number</th>
                        <th className="py-3 px-4">Billing Date</th>
                        <th className="py-3 px-4 text-right">Invoice Amount</th>
                        <th className="py-3 px-4 text-right">Paid Amount</th>
                        <th className="py-3 px-4 text-right">Dues Outstanding</th>
                        <th className="py-3 px-4 text-center">Payment Status</th>
                        <th className="py-3 px-4 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs font-semibold text-slate-700">
                      {invoices.map(invoice => (
                        <tr key={invoice.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="py-3 px-4 font-black text-primary font-mono">{invoice.id}</td>
                          <td className="py-3 px-4">{formatDateDDMMYYYY(invoice.billing_date)}</td>
                          <td className="py-3 px-4 text-right font-bold">
                            ₹ {parseFloat(invoice.grand_total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-3 px-4 text-right text-emerald-600">
                            ₹ {parseFloat(invoice.amount_paid).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-3 px-4 text-right text-rose-500">
                            ₹ {parseFloat(invoice.due_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black tracking-wider uppercase border ${
                              invoice.payment_status === 'Paid'
                                ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                                : invoice.payment_status === 'Partially Paid'
                                ? 'bg-amber-50 text-amber-600 border-amber-100'
                                : 'bg-red-50 text-red-600 border-red-100'
                            }`}>
                              {invoice.payment_status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="flex gap-1.5 justify-center">
                              <button
                                onClick={() => handleOpenReturnModal(invoice)}
                                className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] hover:bg-slate-800 transition-all font-bold"
                              >
                                ↩ Return Goods
                              </button>
                              <button
                                onClick={() => handleOpenDetailModal(invoice)}
                                className="px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-650 hover:bg-slate-100 hover:text-slate-800 transition-all font-semibold"
                              >
                                View Items
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}

                      {invoices.length === 0 && (
                        <tr>
                          <td colSpan="7" className="py-12 text-center text-slate-400 font-semibold bg-slate-50/20">
                            No bills found for this customer.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TODAY'S SALES RETURN / CREDIT NOTES CARD */}
          <div className="border border-slate-200/80 bg-white rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <span>📋 TODAY'S SALES RETURNS / CREDIT NOTES</span>
                  <span className="bg-indigo-50 border border-indigo-100 text-indigo-600 rounded-lg px-2.5 py-0.5 text-[10px] font-black font-mono">
                    {todayReturns.length} ENTRIES TODAY
                  </span>
                </h4>
              </div>
              <button
                type="button"
                onClick={fetchTodayReturns}
                className="px-3.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-650 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 self-start sm:self-auto"
              >
                🔄 Refresh Today's Entries
              </button>
            </div>

            {loadingTodayReturns ? (
              <div className="flex items-center justify-center py-8">
                <span className="loading loading-spinner text-primary"></span>
              </div>
            ) : todayReturns.length === 0 ? (
              <div className="py-8 text-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                <div className="text-slate-400 font-bold text-xs">No sales returns recorded today.</div>
                <div className="text-slate-400 text-[11px] mt-0.5">Search a customer above to select an invoice and process a new return.</div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50/75 border-b border-slate-200/85 text-[10px] font-black text-slate-450 uppercase tracking-wider">
                      <th className="py-3 px-4">Credit Note #</th>
                      <th className="py-3 px-4">Customer Name & Phone</th>
                      <th className="py-3 px-4">Bill Ref</th>
                      <th className="py-3 px-4">Returned Products</th>
                      <th className="py-3 px-4">Reason</th>
                      <th className="py-3 px-4 text-right">Return Amount</th>
                      <th className="py-3 px-4 text-right">Credit Balance</th>
                      <th className="py-3 px-4 text-right">Cash Refunded</th>
                      <th className="py-3 px-4">Processed By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                    {todayReturns.map(ret => (
                      <tr key={ret.returnNumber} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-3 px-4 font-black text-primary font-mono">{ret.returnNumber}</td>
                        <td className="py-3 px-4">
                          <div className="font-extrabold text-slate-850">{ret.customerName}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{ret.customerPhone}</div>
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-slate-600">{ret.invoiceNumber || '—'}</td>
                        <td className="py-3 px-4 max-w-xs truncate text-slate-600" title={ret.productsReturned}>
                          {ret.productsReturned || 'Return Goods'}
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-[10px] text-slate-600 font-extrabold uppercase">
                            {ret.reason || 'Damage'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-black text-slate-850">
                          ₹{(parseFloat(ret.returnAmount) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-4 text-right font-black text-indigo-600">
                          ₹{(parseFloat(ret.creditBalanceCreated) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-emerald-600">
                          {(parseFloat(ret.refundAmount) || 0) > 0 ? `₹${parseFloat(ret.refundAmount).toFixed(2)}` : '—'}
                        </td>
                        <td className="py-3 px-4 text-slate-500">{ret.createdBy || 'Admin'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* RETURN HISTORY TAB VIEW */}
      {activeTab === 'history' && (
        <div className="border border-slate-200/80 bg-white rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-50 pb-2.5">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
              📋 COMPLETED SALES RETURNS / CREDIT NOTES
            </span>
            
            {/* History Filters */}
            <div className="flex flex-wrap gap-2 items-center">
              <input
                type="text"
                placeholder="Search Return No, Inv, Cust..."
                value={historySearch}
                onChange={(e) => { setHistorySearch(e.target.value); setHistoryPage(1); }}
                className="h-8 px-2 rounded-lg border border-slate-200 text-xs font-semibold w-48"
              />
              <input
                type="date"
                value={historyStart}
                onChange={(e) => { setHistoryStart(e.target.value); setHistoryPage(1); }}
                className="h-8 px-2 rounded-lg border border-slate-200 text-xs font-semibold"
              />
              <span className="text-slate-400 text-[10px] font-bold">TO</span>
              <input
                type="date"
                value={historyEnd}
                onChange={(e) => { setHistoryEnd(e.target.value); setHistoryPage(1); }}
                className="h-8 px-2 rounded-lg border border-slate-200 text-xs font-semibold"
              />
              <button
                onClick={handleExportHistoryExcel}
                disabled={exportingExcel}
                className="h-8 px-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                title="Export Filtered Return History to Excel"
              >
                {exportingExcel ? (
                  <span className="loading loading-spinner text-white text-[10px] w-3 h-3"></span>
                ) : (
                  <span>📥</span>
                )}
                Export Excel
              </button>
            </div>
          </div>

          {loadingHistory ? (
            <div className="flex items-center justify-center py-20">
              <span className="loading loading-spinner text-primary"></span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/75 border-b border-slate-200/85 text-[10px] font-black text-slate-450 uppercase tracking-wider">
                    <th className="py-3 px-4">Return Number</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Customer Details</th>
                    <th className="py-3 px-4">Invoice Ref</th>
                    <th className="py-3 px-4">Returned Items</th>
                    <th className="py-3 px-4">Reason</th>
                    <th className="py-3 px-4 text-right">Return Value</th>
                    <th className="py-3 px-4">Settlement</th>
                    <th className="py-3 px-4 text-right">Refund Paid</th>
                    <th className="py-3 px-4 text-right">Credit Balance</th>
                    <th className="py-3 px-4">Refund Mode</th>
                    <th className="py-3 px-4">Date/Ref No</th>
                    <th className="py-3 px-4">Created By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-semibold text-slate-700">
                  {historyList.map(item => (
                    <tr key={item.returnNumber} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3.5 px-4 font-black text-slate-800 font-mono">{item.returnNumber}</td>
                      <td className="py-3.5 px-4">{formatDateDDMMYYYY(item.returnDate)}</td>
                      <td className="py-3.5 px-4">
                        <div className="font-extrabold text-slate-850">{item.customerName}</div>
                        <div className="text-[10px] text-slate-400">{item.customerPhone}</div>
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-primary">{item.invoiceNumber}</td>
                      <td className="py-3.5 px-4 font-medium text-slate-550 max-w-xs truncate" title={item.productsReturned}>
                        {item.productsReturned || 'No items'}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-[10px] text-slate-600 font-bold">
                          {item.reason}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-black text-slate-800">
                        ₹ {parseFloat(item.returnAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black tracking-wider uppercase border ${
                          item.status === 'Refunded'
                            ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                            : 'bg-amber-50 text-amber-600 border-amber-100'
                        }`}>
                          {item.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right text-rose-500 font-bold">
                        {item.settlementMethod === 'REFUND' ? `₹ ${parseFloat(item.refundAmount).toFixed(2)}` : '—'}
                      </td>
                      <td className="py-3.5 px-4 text-right text-indigo-600 font-bold">
                        ₹ {parseFloat(item.creditBalanceCreated).toFixed(2)}
                      </td>
                      <td className="py-3.5 px-4 text-slate-500 uppercase">{item.refundMode || '—'}</td>
                      <td className="py-3.5 px-4 text-slate-400">
                        {item.refundDate ? `${formatDateDDMMYYYY(item.refundDate)}` : ''}
                        {item.refundRefNo ? ` (${item.refundRefNo})` : ''}
                        {!item.refundDate && '—'}
                      </td>
                      <td className="py-3.5 px-4 text-slate-500">{item.createdBy}</td>
                    </tr>
                  ))}

                  {historyList.length === 0 && (
                    <tr>
                      <td colSpan="8" className="py-12 text-center text-slate-400 font-semibold bg-slate-50/20">
                        No return records found matching search filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* Pagination */}
              {Math.ceil(historyTotal / historyLimit) > 1 && (
                <div className="flex items-center justify-between px-4 py-3 bg-slate-50/50 border-t border-slate-100 mt-4 rounded-xl">
                  <span className="text-xs text-slate-450 font-bold">
                    Page {historyPage} of {Math.ceil(historyTotal / historyLimit)} ({historyTotal} returns total)
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setHistoryPage(prev => Math.max(prev - 1, 1))}
                      disabled={historyPage === 1}
                      className="px-3 py-1 rounded border border-slate-200 bg-white text-xs font-bold disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setHistoryPage(prev => Math.min(prev + 1, Math.ceil(historyTotal / historyLimit)))}
                      disabled={historyPage === Math.ceil(historyTotal / historyLimit)}
                      className="px-3 py-1 rounded border border-slate-200 bg-white text-xs font-bold disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* RETURN REPORTS TAB VIEW */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          {/* Report Sub-Tabs */}
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-250/30 w-fit">
            <button
              onClick={() => setReportSubTab('customer')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                reportSubTab === 'customer' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              👥 Customer Returns
            </button>
            <button
              onClick={() => setReportSubTab('product')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                reportSubTab === 'product' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              📦 Product Returns
            </button>
            <button
              onClick={() => setReportSubTab('register')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                reportSubTab === 'register' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              📑 Return Register
            </button>
            <button
              onClick={() => setReportSubTab('expense')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                reportSubTab === 'expense' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              💸 Return Expenses
            </button>
          </div>

          <div className="border border-slate-200/80 bg-white rounded-2xl p-5 shadow-sm">
            {loadingReports ? (
              <div className="flex items-center justify-center py-20">
                <span className="loading loading-spinner text-primary"></span>
              </div>
            ) : (
              <>
                {/* SUB TAB: Customer Returns */}
                {reportSubTab === 'customer' && (
                  <div className="space-y-4">
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 pb-2">
                      Customer Return Report
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50/75 border-b border-slate-200/85 text-[10px] font-black text-slate-450 uppercase tracking-wider">
                            <th className="py-2.5 px-4">Customer ID</th>
                            <th className="py-2.5 px-4">Customer Name</th>
                            <th className="py-2.5 px-4">Phone Number</th>
                            <th className="py-2.5 px-4 text-center">Returns Logged</th>
                            <th className="py-2.5 px-4 text-right">Total Refund Value</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs font-semibold text-slate-700">
                          {reportsData.customerReturnReport?.map(item => (
                            <tr key={item.customerId}>
                              <td className="py-2.5 px-4 font-mono font-bold">{item.customerId}</td>
                              <td className="py-2.5 px-4 font-extrabold text-slate-850">{item.customerName}</td>
                              <td className="py-2.5 px-4">{item.customerPhone}</td>
                              <td className="py-2.5 px-4 text-center">{item.returnCount}</td>
                              <td className="py-2.5 px-4 text-right text-emerald-600 font-bold">
                                ₹ {parseFloat(item.totalReturned).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </td>
                            </tr>
                          ))}
                          {(!reportsData.customerReturnReport || reportsData.customerReturnReport.length === 0) && (
                            <tr>
                              <td colSpan="5" className="py-12 text-center text-slate-400">No returns data recorded yet.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* SUB TAB: Product Returns */}
                {reportSubTab === 'product' && (
                  <div className="space-y-4">
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 pb-2">
                      Product Return Report
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50/75 border-b border-slate-200/85 text-[10px] font-black text-slate-450 uppercase tracking-wider">
                            <th className="py-2.5 px-4">Product ID</th>
                            <th className="py-2.5 px-4">Product Name</th>
                            <th className="py-2.5 px-4 text-center">Total Quantity Returned</th>
                            <th className="py-2.5 px-4 text-right">Total Value Returned</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs font-semibold text-slate-700">
                          {reportsData.productReturnReport?.map(item => (
                            <tr key={item.productId}>
                              <td className="py-2.5 px-4 font-mono font-bold">#{item.productId}</td>
                              <td className="py-2.5 px-4 font-extrabold text-slate-850">{item.productName}</td>
                              <td className="py-2.5 px-4 text-center font-bold text-slate-800">{item.totalQtyReturned} Pcs</td>
                              <td className="py-2.5 px-4 text-right text-emerald-600 font-bold">
                                ₹ {parseFloat(item.totalReturnedVal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </td>
                            </tr>
                          ))}
                          {(!reportsData.productReturnReport || reportsData.productReturnReport.length === 0) && (
                            <tr>
                              <td colSpan="4" className="py-12 text-center text-slate-400">No product returns recorded.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* SUB TAB: Return Register (Credit Notes) */}
                {reportSubTab === 'register' && (
                  <div className="space-y-4">
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 pb-2">
                      Sales Return Register (Credit Notes)
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50/75 border-b border-slate-200/85 text-[10px] font-black text-slate-450 uppercase tracking-wider">
                            <th className="py-2.5 px-4">Credit Note No.</th>
                            <th className="py-2.5 px-4">Date</th>
                            <th className="py-2.5 px-4">Customer</th>
                            <th className="py-2.5 px-4">Original Invoice</th>
                            <th className="py-2.5 px-4 text-right">Return Value</th>
                            <th className="py-2.5 px-4 text-center">Settlement</th>
                            <th className="py-2.5 px-4 text-right">Refund Paid</th>
                            <th className="py-2.5 px-4 text-right">Credit Balance</th>
                            <th className="py-2.5 px-4">Refund Mode</th>
                            <th className="py-2.5 px-4">Reason</th>
                            <th className="py-2.5 px-4">Issued By</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs font-semibold text-slate-700">
                          {reportsData.salesReturnRegister?.map(item => (
                            <tr key={item.returnNumber}>
                              <td className="py-2.5 px-4 font-black font-mono">{item.returnNumber}</td>
                              <td className="py-2.5 px-4">{formatDateDDMMYYYY(item.returnDate)}</td>
                              <td className="py-2.5 px-4 font-extrabold text-slate-850">{item.customerName}</td>
                              <td className="py-2.5 px-4 font-mono text-primary font-bold">{item.invoiceNumber}</td>
                              <td className="py-2.5 px-4 text-right text-slate-850 font-bold">
                                ₹ {parseFloat(item.returnAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="py-2.5 px-4 text-center">
                                <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black tracking-wider uppercase border ${
                                  item.status === 'Refunded'
                                    ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                                    : 'bg-amber-50 text-amber-600 border-amber-100'
                                }`}>
                                  {item.status}
                                </span>
                              </td>
                              <td className="py-2.5 px-4 text-right text-rose-500 font-bold">
                                {item.settlementMethod === 'REFUND' ? `₹ ${parseFloat(item.refundAmount).toFixed(2)}` : '—'}
                              </td>
                              <td className="py-2.5 px-4 text-right text-indigo-600 font-bold">
                                ₹ {parseFloat(item.creditBalanceCreated).toFixed(2)}
                              </td>
                              <td className="py-2.5 px-4 text-slate-500 uppercase">{item.refundMode || '—'}</td>
                              <td className="py-2.5 px-4">
                                <span className="px-1.5 py-0.5 bg-slate-50 text-[10px] text-slate-600 font-bold border border-slate-100 rounded">
                                  {item.reason}
                                </span>
                              </td>
                              <td className="py-2.5 px-4 text-slate-500">{item.createdBy}</td>
                            </tr>
                          ))}
                          {(!reportsData.salesReturnRegister || reportsData.salesReturnRegister.length === 0) && (
                            <tr>
                              <td colSpan="7" className="py-12 text-center text-slate-400">No credit notes issued.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* SUB TAB: Return Expenses */}
                {reportSubTab === 'expense' && (
                  <div className="space-y-4">
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 pb-2">
                      Sales Return Expenses
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50/75 border-b border-slate-200/85 text-[10px] font-black text-slate-450 uppercase tracking-wider">
                            <th className="py-2.5 px-4">Expense ID</th>
                            <th className="py-2.5 px-4">Date</th>
                            <th className="py-2.5 px-4">Particulars</th>
                            <th className="py-2.5 px-4 text-right">Expense Amount</th>
                            <th className="py-2.5 px-4">Recorded By</th>
                            <th className="py-2.5 px-4">Notes</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs font-semibold text-slate-700">
                          {reportsData.returnExpenseReport?.map(item => (
                            <tr key={item.expenseId}>
                              <td className="py-2.5 px-4 font-mono font-bold">{item.expenseId}</td>
                              <td className="py-2.5 px-4">{formatDateDDMMYYYY(item.expenseDate)}</td>
                              <td className="py-2.5 px-4 font-extrabold text-indigo-600">{item.particulars}</td>
                              <td className="py-2.5 px-4 text-right text-rose-500 font-extrabold">
                                ₹ {parseFloat(item.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="py-2.5 px-4 text-slate-500">{item.enteredBy}</td>
                              <td className="py-2.5 px-4 text-slate-450 italic truncate max-w-xs">{item.remarks}</td>
                            </tr>
                          ))}
                          {(!reportsData.returnExpenseReport || reportsData.returnExpenseReport.length === 0) && (
                            <tr>
                              <td colSpan="6" className="py-12 text-center text-slate-400">No return expense transactions recorded.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* NEW SALES RETURN FORM MODAL */}
      {isReturnModalOpen && selectedInvoice && createPortal(
        <div className="modal modal-open animate-fade-in z-50">
          <div className="modal-box bg-white border border-slate-200/80 rounded-3xl p-7 max-w-4xl shadow-2xl relative max-h-[90vh] overflow-y-auto z-10">
            <button
              onClick={() => setIsReturnModalOpen(false)}
              className="absolute top-4 right-4 w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 text-slate-450 hover:bg-slate-100 hover:text-slate-800 flex items-center justify-center font-bold transition-all"
            >
              ✕
            </button>

            <h3 className="text-lg font-black text-slate-800 tracking-tight uppercase">RETURN GOODS</h3>
            <p className="text-slate-450 text-[11px] font-bold mt-0.5">Generate Sales Return Credit Note against Invoice reference</p>

            <div className="border border-slate-150 p-4 rounded-2xl bg-slate-50/50 mt-4 text-xs font-semibold text-slate-650 grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>Invoice Number: <span className="font-mono font-bold text-primary">{selectedInvoice.id}</span></div>
              <div>Billing Date: <span className="text-slate-800">{formatDateDDMMYYYY(selectedInvoice.billing_date)}</span></div>
              <div>Customer: <span className="text-slate-800 font-extrabold">{selectedCustomer?.name}</span></div>
              <div>Invoice Amount: <span className="text-slate-850">₹ {parseFloat(selectedInvoice.grand_total).toFixed(2)}</span></div>
              <div className="text-emerald-600">Amount Already Paid: <span>₹ {parseFloat(selectedInvoice.amount_paid).toFixed(2)}</span></div>
              <div className="text-rose-500 font-extrabold">Dues Outstanding: <span>₹ {parseFloat(selectedInvoice.due_amount).toFixed(2)}</span></div>
            </div>

            <form onSubmit={handleSaveReturn} className="space-y-6 mt-6">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Return Date */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">Return Date *</label>
                  <input
                    type="date"
                    value={returnDate}
                    onChange={(e) => setReturnDate(e.target.value)}
                    className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-semibold"
                    required
                  />
                </div>

                {/* Return Reason Global */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">Default Return Reason *</label>
                  <select
                    value={returnReasonGlobal}
                    onChange={(e) => setReturnReasonGlobal(e.target.value)}
                    className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-semibold"
                    required
                  >
                    {REASONS.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Items Table */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200/80 text-[10px] font-black text-slate-500 uppercase tracking-wider">
                      <th className="py-2.5 px-4">Product Name</th>
                      <th className="py-2.5 px-4 text-center">Billed Qty</th>
                      <th className="py-2.5 px-4 text-center">Returned Qty</th>
                      <th className="py-2.5 px-4 text-center">Available Return Limit</th>
                      <th className="py-2.5 px-4 text-center w-28">Return Qty</th>
                      <th className="py-2.5 px-4 text-right">Rate with Tax</th>
                      <th className="py-2.5 px-4 text-right">Refund Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                    {loadingItems ? (
                      <tr>
                        <td colSpan="7" className="py-8 text-center"><span className="loading loading-spinner text-primary"></span></td>
                      </tr>
                    ) : (
                      invoiceItems.map(item => {
                        const stateItem = returnItems[item.finishedProductId] || { qty: '0' };
                        const returnQty = parseInt(stateItem.qty, 10) || 0;
                        const rowTotal = returnQty * parseFloat(item.rateWithTax);

                        return (
                          <tr key={item.finishedProductId} className="hover:bg-slate-50/30 transition-colors">
                            <td className="py-2.5 px-4 font-extrabold text-slate-850">{item.productName}</td>
                            <td className="py-2.5 px-4 text-center">{item.billedQty} Pcs</td>
                            <td className="py-2.5 px-4 text-center text-slate-450">{item.previouslyReturnedQty} Pcs</td>
                            <td className="py-2.5 px-4 text-center text-slate-500 font-bold">{item.availableReturnQty} Pcs</td>
                            <td className="py-2.5 px-4 text-center">
                              <input
                                type="number"
                                min="0"
                                max={item.availableReturnQty}
                                value={stateItem.qty}
                                onChange={(e) => handleReturnQtyChange(item.finishedProductId, e.target.value, item.availableReturnQty)}
                                disabled={item.availableReturnQty === 0}
                                className="w-20 text-center h-8 rounded-lg border border-slate-200 bg-white font-bold outline-none text-xs focus:border-primary disabled:bg-slate-100 disabled:cursor-not-allowed text-slate-800"
                              />
                            </td>
                            <td className="py-2.5 px-4 text-right">₹ {parseFloat(item.rateWithTax).toFixed(2)}</td>
                            <td className="py-2.5 px-4 text-right font-bold text-slate-800">₹ {rowTotal.toFixed(2)}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Settlement Method Form Section */}
              <div className="border border-slate-200 rounded-2xl p-5 bg-white space-y-4">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">Settlement Method *</label>
                <div className="flex gap-6 text-xs font-bold text-slate-700">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="settlementMethod"
                      value="CREDIT"
                      checked={settlementMethod === 'CREDIT'}
                      onChange={() => setSettlementMethod('CREDIT')}
                      className="radio radio-primary radio-sm text-primary"
                    />
                    Add as Customer Credit
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="settlementMethod"
                      value="REFUND"
                      checked={settlementMethod === 'REFUND'}
                      onChange={() => setSettlementMethod('REFUND')}
                      className="radio radio-primary radio-sm text-primary"
                    />
                    Refund Immediately
                  </label>
                </div>

                {settlementMethod === 'REFUND' && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-slate-100 animate-fade-in">
                    {/* Refund Amount */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">Refund Amount *</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max={computedRefundTotal}
                        value={refundAmount}
                        onChange={(e) => setRefundAmount(e.target.value)}
                        className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-slate-700 focus:border-primary outline-none text-xs font-bold"
                        required
                      />
                    </div>
                    {/* Refund Date */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">Refund Date *</label>
                      <input
                        type="date"
                        value={refundDate}
                        onChange={(e) => setRefundDate(e.target.value)}
                        className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-slate-700 focus:border-primary outline-none text-xs font-bold"
                        required
                      />
                    </div>
                    {/* Refund Mode */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">Refund Mode *</label>
                      <select
                        value={refundMode}
                        onChange={(e) => setRefundMode(e.target.value)}
                        className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-slate-700 focus:border-primary outline-none text-xs font-bold"
                        required
                      >
                        <option value="Cash">Cash</option>
                        <option value="Bank">Bank</option>
                        <option value="UPI">UPI</option>
                        <option value="Cheque">Cheque</option>
                      </select>
                    </div>
                    {/* Reference Number */}
                    <div className="space-y-1 md:col-span-1">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">Reference Number</label>
                      <input
                        type="text"
                        placeholder="Ref transaction ID"
                        value={refundRefNo}
                        onChange={(e) => setRefundRefNo(e.target.value)}
                        className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-slate-700 focus:border-primary outline-none text-xs font-semibold"
                      />
                    </div>
                    {/* Remarks */}
                    <div className="space-y-1 md:col-span-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">Refund Remarks</label>
                      <input
                        type="text"
                        placeholder="Refund notes..."
                        value={refundRemarks}
                        onChange={(e) => setRefundRemarks(e.target.value)}
                        className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-slate-700 focus:border-primary outline-none text-xs font-semibold"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Summary calculations card */}
              <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs font-semibold text-slate-650">
                <div className="space-y-1">
                  <div>Sub-total Returned Goods: <span className="font-extrabold text-slate-800">₹ {computedRefundTotal.toFixed(2)}</span></div>
                  <div>Outstanding Invoice Due: <span className="text-rose-500 font-bold">₹ {parseFloat(selectedInvoice.due_amount).toFixed(2)}</span></div>
                </div>
                
                <div className="flex flex-col md:flex-row gap-4">
                  {/* Dues adjustment info */}
                  <div className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-right">
                    <span className="text-[9px] font-black text-slate-450 uppercase tracking-widest block">Adjusted Dues Balance</span>
                    <span className="text-sm font-extrabold text-slate-800 mt-0.5 block">
                      ₹ {duesInfo.newDue.toFixed(2)}
                    </span>
                  </div>
                  
                  {/* Credit Balance Addition */}
                  <div className="bg-white border border-emerald-200/50 rounded-xl px-4 py-2 text-right">
                    <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest block">Credit Balance Added</span>
                    <span className="text-sm font-black text-emerald-600 mt-0.5 block">
                      ₹ {duesInfo.creditCreated.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Feedback messages */}
              {submitError && (
                <div className="bg-red-50 text-red-650 p-3 rounded-xl border border-red-100 text-xs font-bold">
                  ⚠️ {submitError}
                </div>
              )}
              {submitSuccess && (
                <div className="bg-emerald-50 text-emerald-650 p-3 rounded-xl border border-emerald-100 text-xs font-bold">
                  ✅ {submitSuccess}
                </div>
              )}

              {/* Form Buttons */}
              <div className="flex gap-4">
                <button
                  type="submit"
                  disabled={isSubmitting || loadingItems}
                  className="px-5 py-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs uppercase tracking-wider flex-1 transition-all"
                >
                  {isSubmitting ? <span className="loading loading-spinner text-white text-xs"></span> : 'Save Sales Return'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsReturnModalOpen(false)}
                  className="px-5 py-3.5 rounded-xl bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 font-bold text-xs uppercase tracking-wider"
                >
                  Cancel
                </button>
              </div>

            </form>
          </div>
          <div className="modal-backdrop bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsReturnModalOpen(false)}></div>
        </div>,
        document.body
      )}

      {/* VIEW DETAILS MODAL */}
      {isDetailModalOpen && detailInvoice && createPortal(
        <div className="modal modal-open animate-fade-in z-50">
          <div className="modal-box bg-white border border-slate-200/80 rounded-3xl p-7 max-w-xl shadow-2xl relative max-h-[90vh] overflow-y-auto z-10">
            <button
              onClick={() => setIsDetailModalOpen(false)}
              className="absolute top-4 right-4 w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 text-slate-450 hover:bg-slate-100 hover:text-slate-800 flex items-center justify-center font-bold transition-all"
            >
              ✕
            </button>

            <h3 className="text-lg font-black text-slate-800 tracking-tight uppercase">INVOICE ITEMS LIST</h3>
            <p className="text-slate-450 text-[11px] font-bold mt-0.5">Billed finished goods and quantities</p>

            <div className="border border-slate-150 p-3 rounded-xl bg-slate-50/50 mt-4 text-xs font-semibold text-slate-650 flex justify-between">
              <span>Invoice: <strong className="font-mono text-slate-800">{detailInvoice.id}</strong></span>
              <span>Date: {formatDateDDMMYYYY(detailInvoice.billing_date)}</span>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white mt-4">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200/60 text-[9px] font-black text-slate-500 uppercase tracking-wider">
                    <th className="py-2 px-3">Product Name</th>
                    <th className="py-2 px-3 text-center">Billed Quantity</th>
                    <th className="py-2 px-3 text-right">Rate with Tax</th>
                    <th className="py-2 px-3 text-right">Total Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150 font-semibold text-slate-700">
                  {loadingDetails ? (
                    <tr>
                      <td colSpan="4" className="py-6 text-center"><span className="loading loading-spinner text-primary text-xs"></span></td>
                    </tr>
                  ) : (
                    detailItems.map(item => (
                      <tr key={item.id}>
                        <td className="py-2 px-3 font-extrabold text-slate-850">{item.product_name}</td>
                        <td className="py-2 px-3 text-center">{item.quantity} Pcs</td>
                        <td className="py-2 px-3 text-right">₹ {parseFloat(item.rate_with_tax).toFixed(2)}</td>
                        <td className="py-2 px-3 text-right text-slate-800">₹ {parseFloat(item.total_amount).toFixed(2)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-4">
              <button
                onClick={() => setIsDetailModalOpen(false)}
                className="px-5 py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-650 hover:bg-slate-200 font-bold text-xs"
              >
                Close
              </button>
            </div>
          </div>
          <div className="modal-backdrop bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsDetailModalOpen(false)}></div>
        </div>,
        document.body
      )}

    </div>
  );
};

export default SalesReturn;
