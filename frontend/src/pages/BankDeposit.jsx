import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';

const BankDeposit = () => {
  const navigate = useNavigate();

  // Data states
  const [deposits, setDeposits] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [thisMonthTotal, setThisMonthTotal] = useState(0);
  const [rangeTotal, setRangeTotal] = useState(0);

  // Modals states
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);

  // Editing / Deleting / Viewing details
  const [editingDeposit, setEditingDeposit] = useState(null); // null = Create
  const [deletingDeposit, setDeletingDeposit] = useState(null);
  const [viewingDeposit, setViewingDeposit] = useState(null);

  // Bank Deposit Form states
  const [depositFormData, setDepositFormData] = useState({
    depositDate: '',
    bankName: '',
    bankAccountId: '',
    notes: '',
    amount: '0.00',
    enteredBy: ''
  });

  // Bank Account Form states
  const [accountFormData, setAccountFormData] = useState({
    bankName: '',
    accountNumber: '',
    ifscCode: '',
    branch: ''
  });

  const [depositFormError, setDepositFormError] = useState('');
  const [depositFormSuccess, setDepositFormSuccess] = useState('');
  const [accountFormError, setAccountFormError] = useState('');
  const [accountFormSuccess, setAccountFormSuccess] = useState('');

  const [isSavingDeposit, setIsSavingDeposit] = useState(false);
  const [isSavingAccount, setIsSavingAccount] = useState(false);

  // Fetch all initial data
  useEffect(() => {
    fetchDeposits();
    fetchBankAccounts();
  }, [searchQuery, startDate, endDate, selectedAccountId]);

  const fetchDeposits = async () => {
    try {
      setLoading(true);
      const res = await api.get('/bank-deposits', {
        params: { 
          search: searchQuery,
          startDate,
          endDate,
          bankAccountId: selectedAccountId
        }
      });
      if (res.data.ok) {
        setDeposits(res.data.deposits || []);
        setThisMonthTotal(res.data.thisMonthTotal || 0);
        setRangeTotal(res.data.rangeTotal || 0);
      }
    } catch (err) {
      console.error('Failed to fetch deposits:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchBankAccounts = async () => {
    try {
      const res = await api.get('/bank-deposits/accounts');
      if (res.data.ok) {
        setBankAccounts(res.data.accounts || []);
      }
    } catch (err) {
      console.error('Failed to fetch bank accounts:', err);
    }
  };

  // Setup Deposit Form
  const handleOpenDepositForm = (deposit = null) => {
    setDepositFormError('');
    setDepositFormSuccess('');

    const currentAdminUser = localStorage.getItem('kemps_username') || 'admin';
    const formattedAdminName = currentAdminUser.charAt(0).toUpperCase() + currentAdminUser.slice(1);

    if (deposit) {
      setEditingDeposit(deposit);
      setDepositFormData({
        depositDate: deposit.deposit_date,
        bankName: deposit.bank_name,
        bankAccountId: deposit.bank_account_id,
        notes: deposit.notes || '',
        amount: parseFloat(deposit.amount).toFixed(2),
        enteredBy: deposit.entered_by
      });
    } else {
      setEditingDeposit(null);
      // Initialize with today's date in YYYY-MM-DD
      const now = new Date();
      const offset = now.getTimezoneOffset();
      const istDate = new Date(now.getTime() + (330 + offset) * 60000);
      const yyyy = istDate.getFullYear();
      const mm = String(istDate.getMonth() + 1).padStart(2, '0');
      const dd = String(istDate.getDate()).padStart(2, '0');
      const todayFormatted = `${yyyy}-${mm}-${dd}`;

      setDepositFormData({
        depositDate: todayFormatted,
        bankName: '',
        bankAccountId: '',
        notes: '',
        amount: '0.00',
        enteredBy: formattedAdminName
      });
    }
    setIsDepositModalOpen(true);
  };

  const handleCloseDepositForm = () => {
    setIsDepositModalOpen(false);
    setEditingDeposit(null);
    setDepositFormData({
      depositDate: '',
      bankName: '',
      bankAccountId: '',
      notes: '',
      amount: '0.00',
      enteredBy: ''
    });
  };

  // Setup Bank Account Form
  const handleOpenAccountForm = () => {
    setAccountFormError('');
    setAccountFormSuccess('');
    setAccountFormData({
      bankName: '',
      accountNumber: '',
      ifscCode: '',
      branch: ''
    });
    setIsAccountModalOpen(true);
  };

  const handleCloseAccountForm = () => {
    setIsAccountModalOpen(false);
  };

  // Form input changes
  const handleDepositInputChange = (e) => {
    const { name, value } = e.target;
    if (name === 'bankName') {
      // Clear bank account selection when bank name changes
      setDepositFormData(prev => ({
        ...prev,
        bankName: value,
        bankAccountId: ''
      }));
    } else {
      setDepositFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  // Format and handle Amount directly inside the dark panel input
  const handleAmountChange = (e) => {
    const val = e.target.value.replace(/[^0-9.]/g, '');
    
    // Prevent typing multiple dots
    const parts = val.split('.');
    if (parts.length > 2) return;

    setDepositFormData(prev => ({ ...prev, amount: val }));
  };

  const handleAmountBlur = () => {
    const parsed = parseFloat(depositFormData.amount);
    if (!isNaN(parsed)) {
      setDepositFormData(prev => ({ ...prev, amount: parsed.toFixed(2) }));
    } else {
      setDepositFormData(prev => ({ ...prev, amount: '0.00' }));
    }
  };

  const handleAccountInputChange = (e) => {
    const { name, value } = e.target;
    setAccountFormData(prev => ({ ...prev, [name]: value }));
  };

  // Reset Deposit form fields
  const handleResetDepositForm = () => {
    const currentAdminUser = localStorage.getItem('kemps_username') || 'admin';
    const formattedAdminName = currentAdminUser.charAt(0).toUpperCase() + currentAdminUser.slice(1);
    
    if (editingDeposit) {
      setDepositFormData({
        depositDate: editingDeposit.deposit_date,
        bankName: editingDeposit.bank_name,
        bankAccountId: editingDeposit.bank_account_id,
        notes: editingDeposit.notes || '',
        amount: parseFloat(editingDeposit.amount).toFixed(2),
        enteredBy: editingDeposit.entered_by
      });
    } else {
      const todayFormatted = new Date().toISOString().split('T')[0];
      setDepositFormData({
        depositDate: todayFormatted,
        bankName: '',
        bankAccountId: '',
        notes: '',
        amount: '0.00',
        enteredBy: formattedAdminName
      });
    }
    setDepositFormError('');
    setDepositFormSuccess('');
  };

  // Save Deposit API
  const handleSaveDeposit = async (e) => {
    e.preventDefault();
    setDepositFormError('');
    setDepositFormSuccess('');

    const { depositDate, bankAccountId, amount, enteredBy, notes } = depositFormData;

    if (!depositDate) return setDepositFormError('Date is required.');
    if (!bankAccountId) return setDepositFormError('Bank account is required.');
    
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return setDepositFormError('Amount must be a positive number greater than 0.');
    }
    if (!enteredBy.trim()) return setDepositFormError('Name (Entered By) is required.');

    setIsSavingDeposit(true);
    try {
      let res;
      const payload = {
        depositDate,
        bankAccountId,
        amount: parsedAmount,
        enteredBy: enteredBy.trim(),
        notes: notes.trim()
      };

      if (editingDeposit) {
        res = await api.put(`/bank-deposits/${editingDeposit.id}`, payload);
      } else {
        res = await api.post('/bank-deposits', payload);
      }

      if (res.data.ok) {
        setDepositFormSuccess(editingDeposit ? 'Bank deposit updated successfully!' : 'Bank deposit recorded successfully!');
        setTimeout(() => {
          handleCloseDepositForm();
          fetchDeposits();
        }, 1000);
      } else {
        setDepositFormError(res.data.error || 'Failed to save deposit.');
      }
    } catch (err) {
      setDepositFormError(err.response?.data?.error || err.message || 'An error occurred.');
    } finally {
      setIsSavingDeposit(false);
    }
  };

  // Add Bank Account API
  const handleSaveBankAccount = async (e) => {
    e.preventDefault();
    setAccountFormError('');
    setAccountFormSuccess('');

    const { bankName, accountNumber, ifscCode, branch } = accountFormData;

    if (!bankName.trim()) return setAccountFormError('Bank Name is required.');
    if (!accountNumber.trim()) return setAccountFormError('Account Number is required.');

    setIsSavingAccount(true);
    try {
      const res = await api.post('/bank-deposits/accounts', {
        bankName: bankName.trim(),
        accountNumber: accountNumber.trim(),
        ifscCode: ifscCode.trim(),
        branch: branch.trim()
      });

      if (res.data.ok) {
        setAccountFormSuccess('Bank account added successfully!');
        fetchBankAccounts(); // Refresh list
        setTimeout(() => {
          handleCloseAccountForm();
        }, 1000);
      } else {
        setAccountFormError(res.data.error || 'Failed to add bank account.');
      }
    } catch (err) {
      setAccountFormError(err.response?.data?.error || err.message || 'An error occurred.');
    } finally {
      setIsSavingAccount(false);
    }
  };

  // Confirm Delete
  const confirmDelete = (deposit) => {
    setDeletingDeposit(deposit);
    setIsDeleteModalOpen(true);
  };

  // Delete Deposit API
  const handleDeleteDeposit = async () => {
    if (!deletingDeposit) return;
    try {
      const res = await api.delete(`/bank-deposits/${deletingDeposit.id}`);
      if (res.data.ok) {
        setIsDeleteModalOpen(false);
        setDeletingDeposit(null);
        fetchDeposits();
      } else {
        alert(res.data.error || 'Failed to delete deposit record.');
      }
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  // View Modal
  const handleOpenView = (deposit) => {
    setViewingDeposit(deposit);
    setIsViewModalOpen(true);
  };

  // Helper formats
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

  // Get unique bank names registered
  const uniqueBanks = Array.from(new Set(bankAccounts.map(acc => acc.bank_name)));

  // Filter accounts belonging to selected bank in form
  const filteredAccounts = bankAccounts.filter(acc => acc.bank_name === depositFormData.bankName);

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* HEADER & TOP ACTIONS */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">BANK DEPOSIT</h1>
          <p className="text-slate-500 text-sm font-medium mt-1">Record and manage bank cash deposits</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => handleOpenDepositForm()}
            className="btn-premium btn-primary-premium h-12"
          >
            <span className="text-xl">+</span> Record Deposit
          </button>
          <button 
            onClick={handleOpenAccountForm}
            className="btn-premium bg-blue-50 border border-blue-200 text-primary hover:bg-blue-100 text-xs px-4 h-12"
          >
            + Add Bank Account
          </button>
        </div>
      </div>

      {/* SUMMARY CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Total Month Deposits Card */}
        <div className="card-premium flex items-center justify-between">
          <div>
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">This Month's Deposits</p>
            <h3 className="text-2xl font-extrabold text-[#0f172a] mt-1.5">
              ₹ {thisMonthTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h3>
          </div>
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center text-xl font-bold border border-emerald-100">
            ₹
          </div>
        </div>

        {/* Selected Period / Range Deposits Card */}
        <div className="card-premium flex items-center justify-between">
          <div>
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">
              {startDate || endDate ? 'Selected Period Total' : 'All-time Total Deposits'}
            </p>
            <h3 className="text-2xl font-extrabold text-[#0f172a] mt-1.5">
              ₹ {rangeTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h3>
          </div>
          <div className="w-12 h-12 bg-blue-50 text-primary rounded-xl flex items-center justify-center text-xl border border-blue-100">
            📊
          </div>
        </div>
      </div>

      {/* SEARCH AND TODAY'S DATA TABLE CARD */}
      <div className="card-premium">
        
        {/* Search header container */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-50/50 p-4 rounded-2xl border border-slate-150/60 mb-6">
          <div className="relative flex-1 max-w-xs">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
            <input 
              type="text" 
              placeholder="Search deposits..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-premium pl-11 h-10 w-full"
            />
          </div>

          {/* Date range and bank filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-black text-slate-450 uppercase tracking-wider">Bank</label>
              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="input-premium h-10 px-3 text-xs font-semibold w-48 bg-white"
              >
                <option value="">All Banks</option>
                {bankAccounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.bank_name} ({acc.account_number.slice(-4)})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-black text-slate-455 uppercase tracking-wider">From</label>
              <input 
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="input-premium h-10 px-3.5 text-xs font-semibold w-40"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-black text-slate-455 uppercase tracking-wider">To</label>
              <input 
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="input-premium h-10 px-3.5 text-xs font-semibold w-40"
              />
            </div>
            {(startDate || endDate || selectedAccountId || searchQuery) && (
              <button
                type="button"
                onClick={() => { setStartDate(''); setEndDate(''); setSelectedAccountId(''); setSearchQuery(''); }}
                className="h-10 px-3.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-550 font-bold text-xs rounded-xl transition-all"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>

        {/* Table Listing */}
        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="table table-zebra w-full overflow-hidden">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr className="text-slate-500 text-[11px] font-black uppercase tracking-wider">
                <th className="py-4 px-6 text-left">Deposit ID</th>
                <th className="py-4 px-6 text-left">Date</th>
                <th className="py-4 px-6 text-left">Bank Details</th>
                <th className="py-4 px-6 text-left">Amount (₹)</th>
                <th className="py-4 px-6 text-left">Entered By</th>
                <th className="py-4 px-6 text-left">Notes</th>
                <th className="py-4 px-6 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr>
                  <td colSpan="7" className="py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                       <span className="loading loading-spinner text-primary"></span>
                       <span className="text-slate-400 text-sm font-medium">Loading deposits...</span>
                    </div>
                  </td>
                </tr>
              ) : deposits.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-20 text-center text-slate-400 font-medium italic">
                    {searchQuery || startDate || endDate ? 'No matching deposits found.' : 'No deposits recorded.'}
                  </td>
                </tr>
              ) : (
                deposits.map((dep) => (
                  <tr key={dep.id} className="hover:bg-blue-50/30 transition-colors group">
                    <td className="py-4 px-6 text-[13px] font-mono font-bold text-primary">{dep.id}</td>
                    <td className="py-4 px-6 text-[13px] font-medium text-slate-550">{formatDateDDMMYYYY(dep.deposit_date)}</td>
                    <td className="py-4 px-6 text-[14px] text-slate-700">
                      <div className="font-bold">{dep.bank_name}</div>
                      <div className="text-xs text-slate-400 font-mono">A/C: {dep.account_number}</div>
                    </td>
                    <td className="py-4 px-6 text-[14px] font-black text-slate-800">
                      ₹ {parseFloat(dep.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-4 px-6 text-[14px] font-semibold text-slate-650">{dep.entered_by}</td>
                    <td className="py-4 px-6 text-[13px] text-slate-400 max-w-[150px] truncate" title={dep.notes || ''}>
                      {dep.notes || '—'}
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center justify-center gap-2">
                        <button 
                          onClick={() => handleOpenView(dep)}
                          className="btn btn-ghost btn-xs text-slate-500 hover:bg-slate-100 rounded-lg px-2"
                        >
                          View
                        </button>
                        <button 
                          onClick={() => handleOpenDepositForm(dep)}
                          className="btn btn-ghost btn-xs text-primary hover:bg-primary/10 rounded-lg px-2"
                        >
                          Edit
                        </button>
                        <button 
                          onClick={() => confirmDelete(dep)}
                          className="btn btn-ghost btn-xs text-red-500 hover:bg-red-50 rounded-lg px-2"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* RECORD DEPOSIT MODAL (MATCHING SCREENSHOT) */}
      {isDepositModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm pointer-events-auto">
          <div className="bg-white rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.2)] border border-slate-200 w-[600px] max-h-[90vh] h-[670px] flex flex-col overflow-hidden animate-fade-in pointer-events-auto">
            {/* Form Header */}
            <div className="p-7 bg-white border-b border-slate-100 flex items-center justify-between shrink-0 relative">
              <div>
                <button 
                  onClick={handleCloseDepositForm}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-100 transition-all font-bold text-xs flex items-center gap-1.5 mb-2.5"
                >
                  ← Back
                </button>
                <h3 className="text-2xl font-black text-[#0f172a] uppercase tracking-tight">
                  BANK DEPOSIT
                </h3>
                <p className="text-slate-500 text-xs mt-0.5 font-medium">
                  Record cash deposits into bank accounts
                </p>
              </div>
              <button 
                onClick={handleOpenAccountForm}
                className="btn btn-outline border-blue-500 hover:bg-blue-600 hover:border-blue-600 text-blue-500 hover:text-white rounded-xl text-[12px] font-extrabold py-2 px-4 flex items-center gap-1 h-10 tracking-wide"
              >
                + Add Bank Account
              </button>
            </div>

            {/* Scrollable Form Content */}
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
              <form id="bankDepositForm" onSubmit={handleSaveDeposit} className="space-y-6">
                
                {/* Visual Frame styled like the screenshot */}
                <div className="border border-slate-200/80 rounded-2xl bg-white p-6 space-y-4">
                  <div className="text-[11px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 pb-2 flex items-center gap-1.5">
                    <span>🗓️</span> DEPOSIT DETAILS
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {/* Date */}
                    <div className="space-y-1.5">
                      <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                        Date *
                      </label>
                      <input 
                        type="date" 
                        name="depositDate"
                        value={depositFormData.depositDate}
                        onChange={handleDepositInputChange}
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                        required
                      />
                    </div>

                    {/* Bank Name */}
                    <div className="space-y-1.5">
                      <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                        Bank Name *
                      </label>
                      <select 
                        name="bankName"
                        value={depositFormData.bankName}
                        onChange={handleDepositInputChange}
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                        required
                      >
                        <option value="">— Select Bank —</option>
                        {uniqueBanks.map((bName) => (
                          <option key={bName} value={bName}>{bName}</option>
                        ))}
                      </select>
                    </div>

                    {/* Account Number */}
                    <div className="md:col-span-2 space-y-1.5">
                      <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                        Account Number *
                      </label>
                      <select 
                        name="bankAccountId"
                        value={depositFormData.bankAccountId}
                        onChange={handleDepositInputChange}
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                        required
                        disabled={!depositFormData.bankName}
                      >
                        <option value="">— Select account —</option>
                        {filteredAccounts.map((acc) => (
                          <option key={acc.id} value={acc.id}>
                            {acc.account_number} {acc.branch ? `(${acc.branch})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Notes */}
                    <div className="md:col-span-2 space-y-1.5">
                      <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                        Notes (optional)
                      </label>
                      <input 
                        type="text" 
                        name="notes"
                        value={depositFormData.notes}
                        onChange={handleDepositInputChange}
                        placeholder="Reference, cheque no., reason..." 
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                      />
                    </div>

                    {/* Entered By (Name) */}
                    <div className="md:col-span-2 space-y-1.5">
                      <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                        Name (Entered By) *
                      </label>
                      <input 
                        type="text" 
                        name="enteredBy"
                        value={depositFormData.enteredBy}
                        onChange={handleDepositInputChange}
                        placeholder="Who recorded this deposit?" 
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                        required
                      />
                    </div>
                  </div>
                </div>

                {/* Amount Deposited Display (Identical to Screenshot dark container) */}
                <div className="bg-[#0b1324] text-white p-6 rounded-3xl text-center shadow-lg border border-slate-800 relative group transition-all duration-300">
                  <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest flex items-center justify-center gap-1.5 mb-1">
                    💰 AMOUNT DEPOSITED (₹)
                  </p>
                  <div className="relative inline-block w-full max-w-[300px] mx-auto">
                    <input 
                      type="text" 
                      name="amount"
                      value={depositFormData.amount}
                      onChange={handleAmountChange}
                      onBlur={handleAmountBlur}
                      placeholder="0.00"
                      className="bg-transparent border-none outline-none text-center text-4xl font-extrabold text-blue-500 w-full placeholder-blue-900 tracking-tight"
                    />
                  </div>
                </div>

                {/* Feedback Messages */}
                {depositFormError && (
                  <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-xs font-semibold flex items-center gap-2 border border-red-100">
                    <span>⚠️</span>
                    <span>{depositFormError}</span>
                  </div>
                )}
                {depositFormSuccess && (
                  <div className="bg-emerald-50 text-emerald-600 px-4 py-3 rounded-xl text-xs font-semibold flex items-center gap-2 border border-emerald-100">
                    <span>✅</span>
                    <span>{depositFormSuccess}</span>
                  </div>
                )}
              </form>
            </div>

            {/* Modal Sticky Footer */}
            <div className="p-8 border-t border-slate-100 bg-white flex gap-4 shrink-0 shadow-[0_-10px_30px_rgba(0,0,0,0.02)]">
              <button 
                type="submit" 
                form="bankDepositForm"
                disabled={isSavingDeposit}
                className="btn-premium bg-emerald-600 hover:bg-emerald-700 text-white flex-[2] h-14 text-sm uppercase tracking-wider font-extrabold flex items-center justify-center gap-2 border border-emerald-500 hover:border-emerald-600"
              >
                {isSavingDeposit ? <span className="loading loading-spinner"></span> : <>💾 Save Deposit</>}
              </button>
              <button 
                type="button" 
                onClick={handleResetDepositForm}
                className="btn-premium bg-slate-50 text-slate-500 hover:bg-slate-100 border border-slate-200 flex-1 h-14 text-sm font-bold uppercase tracking-wider flex items-center justify-center gap-1.5"
              >
                ↻ Reset
              </button>
              <button 
                type="button" 
                onClick={handleCloseDepositForm}
                className="btn-premium bg-white text-slate-500 hover:bg-slate-50 border border-slate-200 flex-1 h-14 text-sm font-bold uppercase tracking-wider"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD BANK ACCOUNT MODAL */}
      {isAccountModalOpen && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm pointer-events-auto">
          <div className="bg-white rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.25)] border border-slate-200 w-[500px] max-h-[90vh] overflow-y-auto flex flex-col overflow-hidden animate-fade-in pointer-events-auto">
            {/* Header */}
            <div className="bg-primary p-6 text-white shrink-0 relative">
              <h3 className="text-xl font-black uppercase tracking-tight">
                Add Bank Account
              </h3>
              <p className="text-blue-100 text-xs mt-1 font-medium italic">
                Register a new bank account to accept cash deposits
              </p>
              <button 
                onClick={handleCloseAccountForm}
                className="absolute right-6 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-all font-bold"
              >
                ✕
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              <form id="bankAccountForm" onSubmit={handleSaveBankAccount} className="space-y-4">
                
                {/* Bank Name */}
                <div className="space-y-1.5">
                  <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                    Bank Name *
                  </label>
                  <input 
                    type="text"
                    name="bankName"
                    value={accountFormData.bankName}
                    onChange={handleAccountInputChange}
                    placeholder="e.g. HDFC Bank, SBI" 
                    className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                    required
                  />
                </div>

                {/* Account Number */}
                <div className="space-y-1.5">
                  <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                    Account Number *
                  </label>
                  <input 
                    type="text"
                    name="accountNumber"
                    value={accountFormData.accountNumber}
                    onChange={handleAccountInputChange}
                    placeholder="e.g. 5010023456789" 
                    className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                    required
                  />
                </div>

                {/* IFSC Code */}
                <div className="space-y-1.5">
                  <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                    IFSC Code
                  </label>
                  <input 
                    type="text"
                    name="ifscCode"
                    value={accountFormData.ifscCode}
                    onChange={handleAccountInputChange}
                    placeholder="e.g. HDFC0000045" 
                    className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                  />
                </div>

                {/* Branch */}
                <div className="space-y-1.5">
                  <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                    Branch Name
                  </label>
                  <input 
                    type="text"
                    name="branch"
                    value={accountFormData.branch}
                    onChange={handleAccountInputChange}
                    placeholder="e.g. K.R. Market Branch" 
                    className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                  />
                </div>

                {/* Feedback */}
                {accountFormError && (
                  <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-xs font-semibold flex items-center gap-2 border border-red-100">
                    <span>⚠️</span>
                    <span>{accountFormError}</span>
                  </div>
                )}
                {accountFormSuccess && (
                  <div className="bg-emerald-50 text-emerald-600 px-4 py-3 rounded-xl text-xs font-semibold flex items-center gap-2 border border-emerald-100">
                    <span>✅</span>
                    <span>{accountFormSuccess}</span>
                  </div>
                )}
              </form>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-slate-100 bg-white flex gap-3 shrink-0 shadow-[0_-10px_30px_rgba(0,0,0,0.02)]">
              <button 
                type="submit" 
                form="bankAccountForm"
                disabled={isSavingAccount}
                className="btn-premium btn-primary-premium flex-[2] h-12 text-xs uppercase"
              >
                {isSavingAccount ? <span className="loading loading-spinner"></span> : 'Save Bank Account'}
              </button>
              <button 
                type="button" 
                onClick={handleCloseAccountForm}
                className="btn-premium bg-white text-slate-500 hover:bg-slate-50 border border-slate-200 flex-1 h-12 text-xs uppercase"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VIEW DEPOSIT DETAILS MODAL */}
      {isViewModalOpen && viewingDeposit && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm pointer-events-auto">
          <div className="bg-white rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.2)] border border-slate-200 w-[500px] p-8 flex flex-col gap-6 max-h-[90vh] overflow-y-auto animate-fade-in pointer-events-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-150">
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-1.5">
                <span>📋</span> Deposit Details
              </h3>
              <button 
                onClick={() => setIsViewModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-505 hover:bg-slate-100 transition-all font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-sm font-medium">
              <div className="grid grid-cols-3 gap-2 py-2 border-b border-slate-50">
                <span className="text-slate-400 font-bold text-xs uppercase tracking-wider">Deposit ID</span>
                <span className="col-span-2 font-mono font-bold text-primary text-xs">{viewingDeposit.id}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-2 border-b border-slate-50">
                <span className="text-slate-400 font-bold text-xs uppercase tracking-wider">Date</span>
                <span className="col-span-2 text-slate-800">{formatDateDDMMYYYY(viewingDeposit.deposit_date)}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-2 border-b border-slate-50">
                <span className="text-slate-400 font-bold text-xs uppercase tracking-wider">Bank Name</span>
                <span className="col-span-2 text-slate-800 font-bold">{viewingDeposit.bank_name}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-2 border-b border-slate-50">
                <span className="text-slate-400 font-bold text-xs uppercase tracking-wider">Account Number</span>
                <span className="col-span-2 font-mono text-slate-700">{viewingDeposit.account_number}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-2 border-b border-slate-50">
                <span className="text-slate-400 font-bold text-xs uppercase tracking-wider">Amount</span>
                <span className="col-span-2 font-black text-slate-800">
                  ₹ {parseFloat(viewingDeposit.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-2 border-b border-slate-50">
                <span className="text-slate-400 font-bold text-xs uppercase tracking-wider">Entered By</span>
                <span className="col-span-2 text-slate-700">{viewingDeposit.entered_by}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-2">
                <span className="text-slate-400 font-bold text-xs uppercase tracking-wider">Notes</span>
                <span className="col-span-2 text-slate-500 italic whitespace-pre-wrap">{viewingDeposit.notes || '—'}</span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex gap-2">
              <button 
                onClick={() => {
                  setIsViewModalOpen(false);
                  handleOpenDepositForm(viewingDeposit);
                }}
                className="btn-premium btn-primary-premium flex-1 h-11 text-xs uppercase"
              >
                Edit Record
              </button>
              <button 
                onClick={() => setIsViewModalOpen(false)}
                className="btn-premium bg-slate-50 hover:bg-slate-100 text-slate-650 border border-slate-200 flex-1 h-11 text-xs uppercase"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {isDeleteModalOpen && (
        <div className="modal modal-open">
          <div className="modal-box rounded-2xl p-8 max-w-sm border border-slate-200 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="w-14 h-14 bg-red-50 text-red-500 rounded-full flex items-center justify-center text-2xl mx-auto mb-4">
              ⚠️
            </div>
            <h3 className="text-xl font-black text-center text-slate-800">Confirm Deletion</h3>
            <p className="text-center text-slate-505 mt-2 text-sm">
              Are you sure you want to delete bank deposit record <b>{deletingDeposit?.id}</b>?
              <br/>This action cannot be undone.
            </p>
            <div className="flex flex-col gap-2 mt-8">
              <button 
                onClick={handleDeleteDeposit}
                className="btn-premium bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-200"
              >
                Yes, Delete Record
              </button>
              <button 
                onClick={() => setIsDeleteModalOpen(false)}
                className="btn-premium bg-slate-100 text-slate-600 hover:bg-slate-200"
              >
                No, Keep Record
              </button>
            </div>
          </div>
          <div className="modal-backdrop bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsDeleteModalOpen(false)}></div>
        </div>
      )}

    </div>
  );
};

export default BankDeposit;
