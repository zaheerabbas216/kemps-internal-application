import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';

const SupplierPayments = () => {
  const navigate = useNavigate();

  // Navigation and Filter States
  const [selectedBilledTo, setSelectedBilledTo] = useState('ALL'); // 'ALL', 'KEMPANNAVAR INDUSTRIES', 'KEMPS PET INDUSTRIES'
  const [activeTab, setActiveTab] = useState('pending'); // 'pending', 'history'
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL', 'PENDING', 'SETTLED', 'CANCELLED'

  // Master Data
  const [suppliers, setSuppliers] = useState([]);
  const [bills, setBills] = useState([]);
  const [payments, setPayments] = useState([]);
  const [summary, setSummary] = useState({
    pendingCount: 0,
    totalCredit: 0,
    totalAdvance: 0,
    totalPaid: 0,
    totalBalance: 0
  });
  const [historySummary, setHistorySummary] = useState({
    totalPaymentsCount: 0,
    totalPaidSum: 0
  });

  // Accordion/Collapse Form States
  const [isManualFormOpen, setIsManualFormOpen] = useState(false);
  const [manualBillData, setManualBillData] = useState({
    billDate: '',
    supplierId: '',
    billedTo: '',
    billNumber: '',
    grandTotal: '',
    advancePaid: '0',
    creditNote: '0',
    remarks: ''
  });

  // Modal States
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingBill, setEditingBill] = useState(null);
  const [editFormData, setEditFormData] = useState({
    grandTotal: '',
    advancePaid: '',
    creditNote: '',
    remarks: ''
  });

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [payingBill, setPayingBill] = useState(null);
  const [paymentFormData, setPaymentFormData] = useState({
    paymentDate: '',
    amount: '',
    paymentMode: 'Bank Transfer',
    notes: ''
  });

  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Constants
  const billedToCompanies = [
    'KEMPANNAVAR INDUSTRIES',
    'KEMPS PET INDUSTRIES'
  ];

  const paymentModes = [
    'Bank Transfer',
    'Cash',
    'UPI',
    'Credit Card'
  ];

  useEffect(() => {
    fetchSuppliers();
  }, []);

  useEffect(() => {
    if (activeTab === 'pending') {
      fetchBills();
    } else {
      fetchPayments();
    }
  }, [selectedBilledTo, activeTab, searchQuery, statusFilter]);

  const fetchSuppliers = async () => {
    try {
      const res = await api.get('/company-details', { params: { limit: 100 } });
      if (res.data.ok) {
        setSuppliers(res.data.companies || []);
      }
    } catch (err) {
      console.error('Failed to fetch suppliers:', err);
    }
  };

  const fetchBills = async () => {
    try {
      setLoading(true);
      const res = await api.get('/supplier-payments/bills', {
        params: {
          status: statusFilter,
          billedTo: selectedBilledTo,
          search: searchQuery
        }
      });
      if (res.data.ok) {
        setBills(res.data.bills || []);
        setSummary(res.data.summary);
      }
    } catch (err) {
      console.error('Failed to fetch bills:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchPayments = async () => {
    try {
      setLoading(true);
      const res = await api.get('/supplier-payments/payments', {
        params: {
          billedTo: selectedBilledTo,
          search: searchQuery
        }
      });
      if (res.data.ok) {
        setPayments(res.data.payments || []);
        setHistorySummary(res.data.summary);
      }
    } catch (err) {
      console.error('Failed to fetch payments:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenManualForm = () => {
    setFormError('');
    setFormSuccess('');

    // Default to today's date
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const istDate = new Date(now.getTime() + (330 + offset) * 60000);
    const yyyy = istDate.getFullYear();
    const mm = String(istDate.getMonth() + 1).padStart(2, '0');
    const dd = String(istDate.getDate()).padStart(2, '0');
    const todayFormatted = `${yyyy}-${mm}-${dd}`;

    setManualBillData({
      billDate: todayFormatted,
      supplierId: '',
      billedTo: selectedBilledTo !== 'ALL' ? selectedBilledTo : '',
      billNumber: '',
      grandTotal: '',
      advancePaid: '0',
      creditNote: '0',
      remarks: ''
    });
    setIsManualFormOpen(true);
  };

  const handleCloseManualForm = () => {
    setIsManualFormOpen(false);
    setFormError('');
    setFormSuccess('');
  };

  const handleManualInputChange = (e) => {
    const { name, value } = e.target;
    setManualBillData(prev => ({ ...prev, [name]: value }));
  };

  const handleSaveManualBill = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    const { billDate, supplierId, billedTo, billNumber, grandTotal, advancePaid, creditNote, remarks } = manualBillData;

    if (!billDate) return setFormError('Billing Date is required.');
    if (!supplierId) return setFormError('Supplier Company Name is required.');
    if (!billedTo) return setFormError('Billed To Company is required.');
    
    const parsedTotal = parseFloat(grandTotal);
    if (isNaN(parsedTotal) || parsedTotal <= 0) {
      return setFormError('Total Bill Amount must be a positive number greater than 0.');
    }

    setIsSaving(true);
    try {
      const res = await api.post('/supplier-payments/manual-bill', {
        billDate,
        supplierId,
        billedTo,
        billNumber,
        grandTotal: parsedTotal,
        advancePaid: parseFloat(advancePaid) || 0,
        creditNote: parseFloat(creditNote) || 0,
        remarks
      });

      if (res.data.ok) {
        setFormSuccess('Manual credit bill saved successfully!');
        setTimeout(() => {
          handleCloseManualForm();
          fetchBills();
        }, 1000);
      } else {
        setFormError(res.data.error || 'Failed to save bill.');
      }
    } catch (err) {
      setFormError(err.response?.data?.error || err.message || 'An error occurred.');
    } finally {
      setIsSaving(false);
    }
  };

  // Edit Bill handlers
  const handleOpenEdit = (bill) => {
    setFormError('');
    setFormSuccess('');
    setEditingBill(bill);
    setEditFormData({
      grandTotal: bill.grand_total,
      advancePaid: bill.advance_paid,
      creditNote: bill.credit_note,
      remarks: bill.remarks || ''
    });
    setIsEditModalOpen(true);
  };

  const handleCloseEdit = () => {
    setIsEditModalOpen(false);
    setEditingBill(null);
  };

  const handleEditSave = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    const { grandTotal, advancePaid, creditNote, remarks } = editFormData;

    const parsedTotal = parseFloat(grandTotal);
    if (isNaN(parsedTotal) || parsedTotal <= 0) {
      return setFormError('Total Bill Amount must be greater than 0.');
    }

    setIsSaving(true);
    try {
      const res = await api.put(`/supplier-payments/bill/${editingBill.id}`, {
        grandTotal: parsedTotal,
        advancePaid: parseFloat(advancePaid) || 0,
        creditNote: parseFloat(creditNote) || 0,
        remarks
      });

      if (res.data.ok) {
        setFormSuccess('Bill updated successfully!');
        setTimeout(() => {
          handleCloseEdit();
          fetchBills();
        }, 1000);
      } else {
        setFormError(res.data.error || 'Failed to update bill.');
      }
    } catch (err) {
      setFormError(err.response?.data?.error || err.message || 'An error occurred.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelBill = async (billId) => {
    if (!window.confirm('Are you sure you want to cancel this bill?')) return;
    try {
      const res = await api.put(`/supplier-payments/bill/${billId}/cancel`);
      if (res.data.ok) {
        alert('Bill cancelled successfully.');
        fetchBills();
      } else {
        alert(res.data.error || 'Failed to cancel bill.');
      }
    } catch (err) {
      alert(err.message || 'An error occurred.');
    }
  };

  // Make Payment handlers
  const handleOpenPayment = (bill) => {
    setFormError('');
    setFormSuccess('');
    setPayingBill(bill);

    const now = new Date();
    const offset = now.getTimezoneOffset();
    const istDate = new Date(now.getTime() + (330 + offset) * 60000);
    const yyyy = istDate.getFullYear();
    const mm = String(istDate.getMonth() + 1).padStart(2, '0');
    const dd = String(istDate.getDate()).padStart(2, '0');
    const todayFormatted = `${yyyy}-${mm}-${dd}`;

    setPaymentFormData({
      paymentDate: todayFormatted,
      amount: bill.balance_due,
      paymentMode: 'Bank Transfer',
      notes: ''
    });
    setIsPaymentModalOpen(true);
  };

  const handleClosePayment = () => {
    setIsPaymentModalOpen(false);
    setPayingBill(null);
  };

  const handlePaymentSave = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    const { paymentDate, amount, paymentMode, notes } = paymentFormData;
    const parsedAmount = parseFloat(amount);

    if (!paymentDate) return setFormError('Payment Date is required.');
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return setFormError('Payment Amount must be a positive number greater than 0.');
    }
    if (parsedAmount > payingBill.balance_due) {
      return setFormError(`Payment Amount exceeds the remaining balance due (₹${payingBill.balance_due.toFixed(2)}).`);
    }

    setIsSaving(true);
    try {
      const res = await api.post('/supplier-payments/pay', {
        billId: payingBill.id,
        paymentDate,
        amount: parsedAmount,
        paymentMode,
        notes
      });

      if (res.data.ok) {
        setFormSuccess('Payment registered successfully!');
        setTimeout(() => {
          handleClosePayment();
          fetchBills();
        }, 1000);
      } else {
        setFormError(res.data.error || 'Failed to save payment.');
      }
    } catch (err) {
      setFormError(err.response?.data?.error || err.message || 'An error occurred.');
    } finally {
      setIsSaving(false);
    }
  };

  const formatDateDDMMYYYY = (dateStr) => {
    if (!dateStr) return '—';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    const date = new Date(dateStr);
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  const calculatedManualBalance = 
    (parseFloat(manualBillData.grandTotal) || 0) - 
    (parseFloat(manualBillData.advancePaid) || 0) - 
    (parseFloat(manualBillData.creditNote) || 0);

  const calculatedEditBalance = 
    (parseFloat(editFormData.grandTotal) || 0) - 
    (parseFloat(editFormData.advancePaid) || 0) - 
    (parseFloat(editFormData.creditNote) || 0) - 
    (editingBill ? parseFloat(editingBill.total_paid) : 0);

  return (
    <div className="space-y-6 animate-fade-in">

      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <button 
            onClick={() => navigate(-1)}
            className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-650 hover:bg-slate-50 transition-all font-bold text-sm shadow-sm flex items-center gap-1.5 mb-2"
          >
            ← Back
          </button>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase">SUPPLIER PAYMENTS</h1>
          <p className="text-slate-500 text-xs font-semibold mt-1">Pay outstanding credit bills and view full payment history</p>
        </div>
      </div>

      {/* COMPANY FILTER TABS */}
      <div className="flex gap-2 border-b border-slate-200 pb-3">
        <button
          onClick={() => setSelectedBilledTo('ALL')}
          className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all ${
            selectedBilledTo === 'ALL' 
              ? 'bg-primary text-white shadow-md shadow-primary/20' 
              : 'bg-white hover:bg-slate-50 border border-slate-200 text-slate-650'
          }`}
        >
          All Bills
        </button>
        {billedToCompanies.map(co => (
          <button
            key={co}
            onClick={() => setSelectedBilledTo(co)}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all ${
              selectedBilledTo === co 
                ? 'bg-primary text-white shadow-md shadow-primary/20' 
                : 'bg-white hover:bg-slate-50 border border-slate-200 text-slate-650'
            }`}
          >
            {co === 'KEMPANNAVAR INDUSTRIES' ? 'Kempannavar Industries' : 'Kemps Pet Industries'}
          </button>
        ))}
      </div>

      {/* VIEW TABS */}
      <div className="flex gap-6 border-b border-slate-200">
        <button
          onClick={() => { setActiveTab('pending'); handleCloseManualForm(); }}
          className={`pb-4 text-sm font-bold flex items-center gap-2 border-b-2 transition-all ${
            activeTab === 'pending'
              ? 'border-primary text-primary'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          ⏳ Pending Bills
        </button>
        <button
          onClick={() => { setActiveTab('history'); handleCloseManualForm(); }}
          className={`pb-4 text-sm font-bold flex items-center gap-2 border-b-2 transition-all ${
            activeTab === 'history'
              ? 'border-primary text-primary'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          📋 Payment History
        </button>
      </div>

      {/* SUMMARY BANNER */}
      {activeTab === 'pending' ? (
        <div className="bg-[#0b1324] rounded-2xl p-6 text-white grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
          <div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">PENDING BILLS</span>
            <span className="text-xl md:text-2xl font-black text-yellow-400 mt-1 block">{summary.pendingCount}</span>
          </div>
          <div className="hidden md:block w-[1px] h-10 bg-slate-800 self-center justify-self-center"></div>
          <div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">TOTAL CREDIT</span>
            <span className="text-xl md:text-2xl font-black text-white mt-1 block">₹{summary.totalCredit.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <div className="hidden md:block w-[1px] h-10 bg-slate-800 self-center justify-self-center"></div>
          <div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">ADVANCE PAID</span>
            <span className="text-xl md:text-2xl font-black text-emerald-400 mt-1 block">₹{summary.totalAdvance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <div className="hidden md:block w-[1px] h-10 bg-slate-800 self-center justify-self-center"></div>
          <div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">INSTALMENTS PAID</span>
            <span className="text-xl md:text-2xl font-black text-emerald-400 mt-1 block">₹{summary.totalPaid.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <div className="hidden md:block w-[1px] h-10 bg-slate-800 self-center justify-self-center"></div>
          <div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">BALANCE DUE</span>
            <span className="text-xl md:text-2xl font-black text-rose-500 mt-1 block">₹{summary.totalBalance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        </div>
      ) : (
        <div className="bg-[#0b1324] rounded-2xl p-6 text-white grid grid-cols-2 gap-4 text-center">
          <div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">TOTAL PAYMENTS</span>
            <span className="text-xl md:text-2xl font-black text-yellow-400 mt-1 block">{historySummary.totalPaymentsCount}</span>
          </div>
          <div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">TOTAL PAID</span>
            <span className="text-xl md:text-2xl font-black text-emerald-400 mt-1 block">₹{historySummary.totalPaidSum.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        </div>
      )}

      {/* FILTER & ACTIONS BAR */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <button
            onClick={activeTab === 'pending' ? fetchBills : fetchPayments}
            className="btn-premium bg-blue-600 hover:bg-blue-700 text-white text-xs px-4 h-11 flex items-center gap-1.5"
          >
            🔄 Refresh
          </button>

          {activeTab === 'pending' && (
            <button
              onClick={handleOpenManualForm}
              className="btn-premium bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-4 h-11 flex items-center gap-1.5"
            >
              ➕ Add Manual Bill
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto flex-1 max-w-lg justify-end">
          <input 
            type="text" 
            placeholder={activeTab === 'pending' ? "Search company or bill no..." : "Search..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-premium h-11 flex-1 text-sm bg-white"
          />

          {activeTab === 'pending' && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-40 h-11 px-3 rounded-xl border border-slate-200 bg-white text-slate-700 outline-none text-xs font-bold"
            >
              <option value="ALL">All pending</option>
              <option value="PENDING">Pending Only</option>
              <option value="SETTLED">Settled Only</option>
              <option value="CANCELLED">Cancelled Only</option>
            </select>
          )}
        </div>
      </div>

      {/* ADD MANUAL BILL ACCORDION */}
      {isManualFormOpen && (
        <div className="card-premium bg-amber-50/15 border border-amber-200/50 p-6 space-y-4 animate-fade-in">
          <div className="text-[12px] font-black text-amber-800 uppercase tracking-widest pb-2 border-b border-amber-100 flex items-center gap-1.5">
            <span>➕</span> Add Manual Bill
          </div>

          <form onSubmit={handleSaveManualBill} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Date */}
              <div className="space-y-1.5">
                <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                  Billing Date *
                </label>
                <input 
                  type="date"
                  name="billDate"
                  value={manualBillData.billDate}
                  onChange={handleManualInputChange}
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                  required
                />
              </div>

              {/* Billed To Company */}
              <div className="space-y-1.5">
                <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                  Billed To Company *
                </label>
                <select
                  name="billedTo"
                  value={manualBillData.billedTo}
                  onChange={handleManualInputChange}
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                  required
                >
                  <option value="">-- Select Company --</option>
                  {billedToCompanies.map(co => (
                    <option key={co} value={co}>{co}</option>
                  ))}
                </select>
              </div>

              {/* Company / Supplier Name */}
              <div className="space-y-1.5">
                <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                  Company Name *
                </label>
                <select
                  name="supplierId"
                  value={manualBillData.supplierId}
                  onChange={handleManualInputChange}
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                  required
                >
                  <option value="">-- Select Company --</option>
                  {suppliers.map(sup => (
                    <option key={sup.id} value={sup.id}>{sup.company_name}</option>
                  ))}
                </select>
              </div>

              {/* Bill Number */}
              <div className="space-y-1.5">
                <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                  Bill Number
                </label>
                <input 
                  type="text"
                  name="billNumber"
                  value={manualBillData.billNumber}
                  onChange={handleManualInputChange}
                  placeholder="e.g. INV-001"
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                />
              </div>

              {/* Payment Mode */}
              <div className="space-y-1.5">
                <label className="text-[12px] font-bold text-slate-550 block uppercase tracking-wider">
                  Payment Mode
                </label>
                <input 
                  type="text"
                  value="Credit"
                  readOnly
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-slate-50 text-slate-500 outline-none text-sm font-bold cursor-not-allowed"
                />
              </div>

              {/* Total Bill Amount */}
              <div className="space-y-1.5">
                <label className="text-[12px] font-bold text-slate-550 block uppercase tracking-wider">
                  Total Bill Amount (₹) *
                </label>
                <input 
                  type="number"
                  step="any"
                  name="grandTotal"
                  value={manualBillData.grandTotal}
                  onChange={handleManualInputChange}
                  placeholder="0.00"
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                  required
                />
              </div>

              {/* Advance Paid */}
              <div className="space-y-1.5">
                <label className="text-[12px] font-bold text-slate-550 block uppercase tracking-wider">
                  Advance Paid (₹)
                </label>
                <input 
                  type="number"
                  step="any"
                  name="advancePaid"
                  value={manualBillData.advancePaid}
                  onChange={handleManualInputChange}
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                />
              </div>

              {/* Credit Note */}
              <div className="space-y-1.5">
                <label className="text-[12px] font-bold text-slate-550 block uppercase tracking-wider">
                  Credit Note (₹)
                </label>
                <input 
                  type="number"
                  step="any"
                  name="creditNote"
                  value={manualBillData.creditNote}
                  onChange={handleManualInputChange}
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                />
              </div>

              {/* Notes */}
              <div className="md:col-span-2 space-y-1.5">
                <label className="text-[12px] font-bold text-slate-550 block uppercase tracking-wider">
                  Notes
                </label>
                <input 
                  type="text"
                  name="remarks"
                  value={manualBillData.remarks}
                  onChange={handleManualInputChange}
                  placeholder="Optional notes..."
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                />
              </div>
            </div>

            {/* Calculated balance preview banner */}
            <div className="bg-slate-900 rounded-xl p-4 text-white flex items-center justify-between text-xs font-bold tracking-wide">
              <span>Balance = Total — Advance — Credit Note</span>
              <span className="text-lg font-black text-amber-400">
                ₹{calculatedManualBalance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            {/* Feedback messages */}
            {formError && (
              <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-xs font-semibold border border-red-100">
                ⚠️ {formError}
              </div>
            )}
            {formSuccess && (
              <div className="bg-emerald-50 text-emerald-600 px-4 py-3 rounded-xl text-xs font-semibold border border-emerald-100">
                ✅ {formSuccess}
              </div>
            )}

            {/* Form actions */}
            <div className="flex gap-4">
              <button 
                type="submit"
                disabled={isSaving}
                className="btn-premium bg-emerald-600 hover:bg-emerald-700 text-white flex-1 h-12 flex items-center justify-center gap-1.5 uppercase font-bold tracking-wider text-xs"
              >
                💾 Save Bill
              </button>
              <button 
                type="button"
                onClick={handleCloseManualForm}
                className="btn-premium bg-white border border-slate-200 text-slate-650 hover:bg-slate-550/10 flex-1 h-12 uppercase font-bold tracking-wider text-xs"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* PENDING BILLS LIST VIEW */}
      {activeTab === 'pending' ? (
        <div className="space-y-4">
          {loading ? (
            <div className="card-premium py-20 text-center text-slate-400">
              <span className="loading loading-spinner text-primary block mx-auto mb-2"></span>
              Loading credit bills...
            </div>
          ) : bills.length === 0 ? (
            <div className="card-premium py-20 text-center text-slate-400 italic font-medium">
              No pending credit bills found.
            </div>
          ) : (
            bills.map((bill) => {
              const settledPct = bill.grand_total > 0 
                ? Math.min(100, Math.max(0, ((parseFloat(bill.advance_paid) + parseFloat(bill.credit_note) + parseFloat(bill.total_paid)) / parseFloat(bill.grand_total)) * 100))
                : 0;

              return (
                <div key={bill.id} className="card-premium border-l-4 border-red-500 space-y-4 shadow-sm hover:shadow-md transition-shadow">
                  {/* Card Header */}
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-base font-black text-slate-800 tracking-tight uppercase">
                        {bill.supplier_name}
                      </h4>
                      <p className="text-xs text-slate-500 font-semibold mt-1">
                        Bill #{bill.bill_number || bill.id} • {formatDateDDMMYYYY(bill.bill_date)} • <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${bill.is_manual ? 'bg-amber-50 text-amber-700 border border-amber-100' : 'bg-blue-50 text-blue-700 border border-blue-100'}`}>{bill.is_manual ? 'Manual' : 'Inventory'}</span>
                      </p>
                    </div>
                    <div>
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase ${
                        bill.status === 'PENDING' ? 'bg-red-50 text-red-600 border border-red-100' :
                        bill.status === 'SETTLED' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                        'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}>
                        {bill.status}
                      </span>
                    </div>
                  </div>

                  {/* Summary Blocks Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                    <div className="text-center md:text-left">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">BILL TOTAL</span>
                      <span className="text-sm font-black text-slate-800 block mt-1">₹{parseFloat(bill.grand_total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="text-center md:text-left">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">ADVANCE</span>
                      <span className="text-sm font-bold text-orange-600 block mt-1">₹{parseFloat(bill.advance_paid).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="text-center md:text-left">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">CREDIT NOTE</span>
                      <span className="text-sm font-bold text-orange-600 block mt-1">₹{parseFloat(bill.credit_note).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="text-center md:text-left">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">PAID (INST.)</span>
                      <span className="text-sm font-bold text-emerald-600 block mt-1">₹{parseFloat(bill.total_paid).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="text-center md:text-left col-span-2 md:col-span-1">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">BALANCE DUE</span>
                      <span className="text-sm font-black text-red-600 block mt-1">₹{parseFloat(bill.balance_due).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>

                  {/* Settled progress bar */}
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-slate-450 block">{Math.round(settledPct)}% settled</span>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full transition-all duration-300" style={{ width: `${settledPct}%` }}></div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex justify-end gap-2 pt-2 border-t border-slate-50">
                    {bill.status === 'PENDING' && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleCancelBill(bill.id)}
                          className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-100 rounded-xl text-xs font-bold transition-all"
                        >
                          🚫 Cancel Bill
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(bill)}
                          className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-655 border border-slate-200 rounded-xl text-xs font-bold transition-all"
                        >
                          ✏️ Edit
                        </button>
                        {bill.has_pending_payment ? (
                          <span className="px-4 py-2 bg-amber-50 text-amber-600 border border-amber-200 rounded-xl text-xs font-black flex items-center gap-1.5 cursor-not-allowed">
                            ⏳ Pending Verification
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleOpenPayment(bill)}
                            className="px-4 py-2 bg-white hover:bg-blue-50/50 text-blue-655 border-2 border-blue-550 rounded-xl text-xs font-black transition-all flex items-center gap-1.5"
                          >
                            💳 Make Payment
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* PAYMENT HISTORY TABLE VIEW */
        <div className="card-premium">
          <div className="overflow-x-auto rounded-xl border border-slate-100">
            <table className="table table-zebra w-full overflow-hidden">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr className="text-slate-550 text-[11px] font-black uppercase tracking-wider">
                  <th className="py-4 px-6 text-left">Date</th>
                  <th className="py-4 px-6 text-left">Company</th>
                  <th className="py-4 px-6 text-left">Bill No</th>
                  <th className="py-4 px-6 text-left">Amount (₹)</th>
                  <th className="py-4 px-6 text-left">Mode</th>
                  <th className="py-4 px-6 text-center">Status</th>
                  <th className="py-4 px-6 text-left">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loading ? (
                  <tr>
                    <td colSpan="7" className="py-20 text-center">
                      <span className="loading loading-spinner text-primary block mx-auto mb-2"></span>
                      Loading payment history...
                    </td>
                  </tr>
                ) : payments.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="py-20 text-center text-slate-400 font-medium italic">
                      No payments found.
                    </td>
                  </tr>
                ) : (
                  payments.map((p) => (
                    <tr key={p.id} className="hover:bg-blue-50/30 transition-colors">
                      <td className="py-4 px-6 text-[13px] font-medium text-slate-550">{formatDateDDMMYYYY(p.payment_date)}</td>
                      <td className="py-4 px-6 text-[14px] font-bold text-slate-700 max-w-[220px] truncate" title={p.supplier_name}>{p.supplier_name}</td>
                      <td className="py-4 px-6 text-[13px] font-mono font-bold text-primary">{p.bill_number || p.bill_id}</td>
                      <td className="py-4 px-6 text-[14px] font-black text-slate-800">
                        ₹ {parseFloat(p.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-4 px-6">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${
                          p.payment_mode === 'Bank Transfer' ? 'bg-blue-50 text-blue-600 border border-blue-100' :
                          p.payment_mode === 'Cash' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                          p.payment_mode === 'UPI' ? 'bg-purple-50 text-purple-600 border border-purple-100' :
                          'bg-amber-50 text-amber-600 border border-amber-100'
                        }`}>
                          {p.payment_mode}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-center">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold ${
                          p.payment_status === 'Approved' ? 'bg-emerald-50 text-emerald-600' :
                          p.payment_status === 'Pending Approval' ? 'bg-amber-50 text-amber-600' :
                          p.payment_status === 'Rejected' ? 'bg-rose-50 text-rose-600' :
                          'bg-slate-50 text-slate-500'
                        }`}>
                          {(p.payment_status || 'Pending Approval').toUpperCase()}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-[13px] text-slate-400 max-w-[200px] truncate" title={p.notes || ''}>
                        {p.notes || '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* EDIT CREDIT BILL MODAL */}
      {isEditModalOpen && editingBill && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm pointer-events-auto">
          <div className="bg-white rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.2)] border border-slate-200 w-[550px] max-h-[90vh] overflow-y-auto flex flex-col overflow-hidden animate-fade-in">
            {/* Modal Header */}
            <div className="bg-primary p-7 text-white shrink-0 relative">
              <h3 className="text-2xl font-black italic tracking-tight uppercase">
                Edit Bill
              </h3>
              <p className="text-blue-100 text-xs mt-1 font-medium italic opacity-85">
                {editingBill.supplier_name} — Bill #{editingBill.bill_number || editingBill.id}
              </p>
              <button 
                onClick={handleCloseEdit}
                className="absolute right-7 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-all font-bold"
              >
                ✕
              </button>
            </div>

            {/* Modal Form Content */}
            <div className="flex-1 p-8">
              <form onSubmit={handleEditSave} className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  {/* Total Bill */}
                  <div className="space-y-1.5">
                    <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                      Total Bill (₹) *
                    </label>
                    <input 
                      type="number"
                      step="any"
                      value={editFormData.grandTotal}
                      onChange={(e) => setEditFormData(prev => ({ ...prev, grandTotal: e.target.value }))}
                      className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                      required
                    />
                  </div>

                  {/* Advance Paid */}
                  <div className="space-y-1.5">
                    <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                      Advance Paid (₹)
                    </label>
                    <input 
                      type="number"
                      step="any"
                      value={editFormData.advancePaid}
                      onChange={(e) => setEditFormData(prev => ({ ...prev, advancePaid: e.target.value }))}
                      className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                    />
                  </div>

                  {/* Credit Note */}
                  <div className="space-y-1.5">
                    <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                      Credit Note (₹)
                    </label>
                    <input 
                      type="number"
                      step="any"
                      value={editFormData.creditNote}
                      onChange={(e) => setEditFormData(prev => ({ ...prev, creditNote: e.target.value }))}
                      className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                    />
                  </div>

                  {/* Notes */}
                  <div className="space-y-1.5">
                    <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                      Notes
                    </label>
                    <input 
                      type="text"
                      value={editFormData.remarks}
                      onChange={(e) => setEditFormData(prev => ({ ...prev, remarks: e.target.value }))}
                      placeholder="Optional notes..."
                      className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                    />
                  </div>
                </div>

                {/* Calculated new balance due banner */}
                <div className="bg-slate-900 rounded-xl p-4 text-white flex items-center justify-between text-xs font-bold tracking-wide">
                  <span>New Balance Due</span>
                  <span className="text-lg font-black text-rose-450">
                    ₹{calculatedEditBalance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>

                {/* Feedback messages */}
                {formError && (
                  <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-xs font-semibold border border-red-100">
                    ⚠️ {formError}
                  </div>
                )}
                {formSuccess && (
                  <div className="bg-emerald-50 text-emerald-600 px-4 py-3 rounded-xl text-xs font-semibold border border-emerald-100">
                    ✅ {formSuccess}
                  </div>
                )}

                {/* Modal Footer Actions */}
                <div className="flex gap-4 pt-2">
                  <button 
                    type="submit"
                    disabled={isSaving}
                    className="btn-premium bg-blue-600 hover:bg-blue-700 text-white flex-1 h-12 flex items-center justify-center gap-1.5 uppercase font-bold tracking-wider text-xs"
                  >
                    💾 Save Changes
                  </button>
                  <button 
                    type="button"
                    onClick={handleCloseEdit}
                    className="btn-premium bg-white border border-slate-200 text-slate-650 hover:bg-slate-50 flex-1 h-12 uppercase font-bold tracking-wider text-xs"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* MAKE PAYMENT MODAL */}
      {isPaymentModalOpen && payingBill && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm pointer-events-auto">
          <div className="bg-white rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.2)] border border-slate-200 w-[550px] max-h-[90vh] overflow-y-auto flex flex-col overflow-hidden animate-fade-in">
            {/* Modal Header */}
            <div className="bg-primary p-7 text-white shrink-0 relative">
              <h3 className="text-2xl font-black italic tracking-tight uppercase">
                Make Payment
              </h3>
              <p className="text-blue-100 text-xs mt-1 font-medium italic opacity-85">
                Register instalment payment for {payingBill.supplier_name} — Bill #{payingBill.bill_number || payingBill.id}
              </p>
              <button 
                onClick={handleClosePayment}
                className="absolute right-7 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-all font-bold"
              >
                ✕
              </button>
            </div>

            {/* Modal Form Content */}
            <div className="flex-1 p-8">
              <form onSubmit={handlePaymentSave} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Payment Date */}
                  <div className="space-y-1.5">
                    <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                      Payment Date *
                    </label>
                    <input 
                      type="date"
                      value={paymentFormData.paymentDate}
                      onChange={(e) => setPaymentFormData(prev => ({ ...prev, paymentDate: e.target.value }))}
                      className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                      required
                    />
                  </div>

                  {/* Payment Amount */}
                  <div className="space-y-1.5">
                    <label className="text-[12px] font-bold text-slate-550 block uppercase tracking-wider">
                      Payment Amount (₹) *
                    </label>
                    <input 
                      type="number"
                      step="any"
                      value={paymentFormData.amount}
                      onChange={(e) => setPaymentFormData(prev => ({ ...prev, amount: e.target.value }))}
                      placeholder="0.00"
                      className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                      required
                    />
                    <span className="text-[10px] font-bold text-rose-500 mt-1 block">
                      Max allowed: ₹{payingBill.balance_due.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  {/* Payment Mode */}
                  <div className="space-y-1.5">
                    <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                      Payment Mode *
                    </label>
                    <select
                      value={paymentFormData.paymentMode}
                      onChange={(e) => setPaymentFormData(prev => ({ ...prev, paymentMode: e.target.value }))}
                      className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                      required
                    >
                      {paymentModes.map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>

                  {/* Notes / References */}
                  <div className="space-y-1.5">
                    <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                      Notes / Reference
                    </label>
                    <input 
                      type="text"
                      value={paymentFormData.notes}
                      onChange={(e) => setPaymentFormData(prev => ({ ...prev, notes: e.target.value }))}
                      placeholder="e.g. UPI Ref / Bank Txn ID"
                      className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                    />
                  </div>
                </div>

                {/* Feedback messages */}
                {formError && (
                  <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-xs font-semibold border border-red-100">
                    ⚠️ {formError}
                  </div>
                )}
                {formSuccess && (
                  <div className="bg-emerald-50 text-emerald-600 px-4 py-3 rounded-xl text-xs font-semibold border border-emerald-100">
                    ✅ {formSuccess}
                  </div>
                )}

                {/* Modal Footer Actions */}
                <div className="flex gap-4 pt-2">
                  <button 
                    type="submit"
                    disabled={isSaving}
                    className="btn-premium bg-blue-650 hover:bg-blue-750 text-white flex-1 h-12 flex items-center justify-center gap-1.5 uppercase font-bold tracking-wider text-xs"
                  >
                    💾 Save Payment
                  </button>
                  <button 
                    type="button"
                    onClick={handleClosePayment}
                    className="btn-premium bg-white border border-slate-200 text-slate-655 hover:bg-slate-50 flex-1 h-12 uppercase font-bold tracking-wider text-xs"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default SupplierPayments;
