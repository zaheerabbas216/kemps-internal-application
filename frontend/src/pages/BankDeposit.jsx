import React, { useState, useEffect } from 'react';
import api from '../api/axios';

const BankDeposit = () => {
  // State for database records
  const [dbAccounts, setDbAccounts] = useState([]);
  const [depositsList, setDepositsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Dual view state
  const [isRecordingDeposit, setIsRecordingDeposit] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');

  // Form State
  const [formData, setFormData] = useState({
    date: '2026-06-04', // Pre-fill with today's date from additional metadata
    bankName: '',
    accountNumber: '',
    notes: ''
  });

  const [amount, setAmount] = useState('0.00');
  const [isEditingAmount, setIsEditingAmount] = useState(false);

  // Modal State for adding bank accounts
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newBankData, setNewBankData] = useState({
    bankName: '',
    accountNumber: '',
    ifscCode: ''
  });
  const [modalError, setModalError] = useState('');
  const [isSavingAccount, setIsSavingAccount] = useState(false);

  // Notifications
  const [notification, setNotification] = useState(null);

  // Fetch deposits and bank accounts on mount
  useEffect(() => {
    fetchBankAccounts();
  }, []);

  // Fetch deposits whenever search query changes (or on mount)
  useEffect(() => {
    fetchDeposits();
  }, [searchQuery]);

  const fetchBankAccounts = async () => {
    try {
      const res = await api.get('/bank-deposits/accounts');
      if (res.data.ok) {
        setDbAccounts(res.data.accounts || []);
      }
    } catch (err) {
      console.error('Failed to fetch bank accounts:', err);
    }
  };

  const fetchDeposits = async () => {
    try {
      setLoading(true);
      const res = await api.get('/bank-deposits', {
        params: { search: searchQuery }
      });
      if (res.data.ok) {
        setDepositsList(res.data.deposits || []);
      }
    } catch (err) {
      console.error('Failed to fetch deposits:', err);
    } finally {
      setLoading(false);
    }
  };

  // Derive unique bank names from dbAccounts
  const uniqueBanks = Array.from(new Set(dbAccounts.map(acc => acc.bank_name)));

  // Filter accounts for selected bank name
  const availableAccounts = dbAccounts
    .filter(acc => acc.bank_name === formData.bankName)
    .map(acc => acc.account_number);

  // Input changes
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Format amount input
  const handleAmountChange = (e) => {
    const value = e.target.value;
    if (/^\d*\.?\d*$/.test(value)) {
      setAmount(value);
    }
  };

  const handleAmountBlur = () => {
    setIsEditingAmount(false);
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) {
      setAmount('0.00');
    } else {
      setAmount(parsed.toFixed(2));
    }
  };

  // Open / Close Add Bank Modal
  const openModal = () => {
    setNewBankData({ bankName: '', accountNumber: '', ifscCode: '' });
    setModalError('');
    setIsModalOpen(true);
  };

  const closeModal = () => {
    if (!isSavingAccount) {
      setIsModalOpen(false);
    }
  };

  // Save new bank account to database
  const handleAddBank = async (e) => {
    e.preventDefault();
    setModalError('');

    const { bankName, accountNumber, ifscCode } = newBankData;
    if (!bankName.trim()) {
      setModalError('Bank Name is required.');
      return;
    }
    if (!accountNumber.trim()) {
      setModalError('Account Number is required.');
      return;
    }

    try {
      setIsSavingAccount(true);
      const res = await api.post('/bank-deposits/accounts', {
        bankName: bankName.trim(),
        accountNumber: accountNumber.trim(),
        ifscCode: ifscCode.trim()
      });

      if (res.data.ok) {
        // Refresh bank accounts
        await fetchBankAccounts();
        
        // Auto-select in form
        setFormData(prev => ({
          ...prev,
          bankName: bankName.trim(),
          accountNumber: accountNumber.trim()
        }));

        setIsModalOpen(false);
        showNotification('success', `Bank Account "${bankName}" registered successfully.`);
      }
    } catch (err) {
      setModalError(err.response?.data?.error || err.message || 'Failed to save bank account.');
    } finally {
      setIsSavingAccount(false);
    }
  };

  // Save deposit record to database
  const handleSaveDeposit = async () => {
    if (!formData.bankName) {
      showNotification('error', 'Please select a Bank Name.');
      return;
    }
    if (!formData.accountNumber) {
      showNotification('error', 'Please select an Account Number.');
      return;
    }
    const parsedAmt = parseFloat(amount);
    if (isNaN(parsedAmt) || parsedAmt <= 0) {
      showNotification('error', 'Please enter a valid deposit amount greater than ₹0.00.');
      return;
    }

    try {
      setIsSaving(true);
      const res = await api.post('/bank-deposits', {
        depositDate: formData.date,
        bankName: formData.bankName,
        accountNumber: formData.accountNumber,
        amount: parsedAmt,
        notes: formData.notes
      });

      if (res.data.ok) {
        showNotification('success', `Deposit of ₹${parsedAmt.toFixed(2)} recorded successfully with ID: ${res.data.id}`);
        
        // Refresh deposits list and switch back to list view
        await fetchDeposits();
        handleReset();
        setIsRecordingDeposit(false);
      }
    } catch (err) {
      showNotification('error', err.response?.data?.error || err.message || 'Failed to record deposit.');
    } finally {
      setIsSaving(false);
    }
  };

  // Reset form
  const handleReset = () => {
    setFormData({
      date: '2026-06-04',
      bankName: '',
      accountNumber: '',
      notes: ''
    });
    setAmount('0.00');
  };

  const showNotification = (type, message) => {
    setNotification({ type, message });
    setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  // Format YYYY-MM-DD to DD/MM/YYYY
  const formatDateDisplay = (dateStr) => {
    if (!dateStr) return '—';
    const cleanStr = dateStr.substring(0, 10);
    const [year, month, day] = cleanStr.split('-');
    return `${day}/${month}/${year}`;
  };

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      
      {/* Floating Notifications */}
      {notification && (
        <div className={`fixed top-6 right-6 z-[99999] px-6 py-4 rounded-2xl shadow-xl flex items-center gap-3 border transition-all duration-300 animate-bounce ${
          notification.type === 'success' 
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
            : 'bg-red-50 text-red-700 border-red-200'
        }`}>
          <span className="text-xl">{notification.type === 'success' ? '✅' : '⚠️'}</span>
          <span className="text-sm font-bold">{notification.message}</span>
        </div>
      )}

      {/* VIEW 1: TABLE LIST VIEW (Default) */}
      {!isRecordingDeposit && (
        <div className="space-y-6">
          {/* HEADER & TOP ACTIONS */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-black text-slate-800 tracking-tight">BANK DEPOSITS</h1>
              <p className="text-slate-500 text-sm font-medium mt-1">Manage and track your bank deposit history.</p>
            </div>
            <button 
              onClick={() => setIsRecordingDeposit(true)}
              className="btn-premium btn-primary-premium h-12"
            >
              <span className="text-xl">+</span> Record Bank Deposit
            </button>
          </div>

          {/* SEARCH AND TABLE CONTAINER */}
          <div className="card-premium">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div className="relative flex-1 max-w-md">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
                <input 
                  type="text" 
                  placeholder="Search by bank name, account or ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input-premium pl-11 h-10 w-full"
                />
              </div>
              <div className="text-[12px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
                {depositsList.length} Records Found
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-100">
              <table className="table table-zebra w-full overflow-hidden">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr className="text-slate-500 text-[11px] font-black uppercase tracking-wider">
                    <th className="py-4 px-6 text-left">ID</th>
                    <th className="py-4 px-6 text-left">Deposit Date</th>
                    <th className="py-4 px-6 text-left">Bank Name</th>
                    <th className="py-4 px-6 text-left">Account Number</th>
                    <th className="py-4 px-6 text-left">Notes / Reference</th>
                    <th className="py-4 px-6 text-right">Amount Deposited</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {loading ? (
                    <tr>
                      <td colSpan="6" className="py-20 text-center">
                        <div className="flex flex-col items-center gap-3">
                           <span className="loading loading-spinner text-primary"></span>
                           <span className="text-slate-400 text-sm font-medium">Fetching deposits...</span>
                        </div>
                      </td>
                    </tr>
                  ) : depositsList.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="py-20 text-center text-slate-400 font-medium italic">
                        {searchQuery ? 'No deposits found matching your search.' : 'No deposits recorded yet.'}
                      </td>
                    </tr>
                  ) : (
                    depositsList.map((dep) => (
                      <tr key={dep.id} className="hover:bg-blue-50/30 transition-colors group">
                        <td className="py-4 px-6 text-[13px] font-mono font-bold text-primary">{dep.id}</td>
                        <td className="py-4 px-6 text-[14px] font-medium text-slate-600">{formatDateDisplay(dep.date || dep.deposit_date)}</td>
                        <td className="py-4 px-6 text-[14px] font-bold text-slate-700">{dep.bankName || dep.bank_name}</td>
                        <td className="py-4 px-6 text-[14px] font-mono text-slate-500">{dep.accountNumber || dep.account_number}</td>
                        <td className="py-4 px-6 text-[13px] text-slate-400 max-w-xs truncate" title={dep.notes}>
                          {dep.notes}
                        </td>
                        <td className="py-4 px-6 text-[14px] font-black text-right text-emerald-600">
                          ₹{parseFloat(dep.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: FORM VIEW */}
      {isRecordingDeposit && (
        <div className="max-w-4xl mx-auto">
          {/* Main card */}
          <div className="bg-white border border-slate-200/60 rounded-3xl p-8 shadow-[0_10px_35px_rgba(0,0,0,0.03)] space-y-8 animate-fade-in">
            
            {/* Back Button and Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-4">
                <button 
                  onClick={() => setIsRecordingDeposit(false)}
                  className="px-4 py-2 border border-slate-200 bg-[#f1f5f9] hover:bg-slate-200/80 text-[#334155] rounded-xl text-sm font-bold flex items-center gap-2 transition-all duration-200 shadow-sm"
                >
                  <span>←</span> Back
                </button>
                <div>
                  <h1 className="text-2xl font-black text-[#0f172a] tracking-tight uppercase">BANK DEPOSIT</h1>
                  <p className="text-slate-500 text-[14px] font-medium mt-1">Record cash deposits into bank accounts</p>
                </div>
              </div>
              
              <button 
                onClick={openModal}
                className="border-2 border-[#1a56db] text-[#1a56db] hover:bg-[#1a56db]/5 rounded-xl px-5 py-2.5 text-[14px] font-black transition-all duration-200 self-start md:self-center"
              >
                + Add Bank Account
              </button>
            </div>

            {/* Deposit Details card container */}
            <div className="border border-slate-200/80 rounded-2xl p-6 bg-white space-y-6 shadow-sm">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <span className="text-[12px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                  <span>📅</span> DEPOSIT DETAILS
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Date Input */}
                <div className="space-y-1.5">
                  <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                    Date <span className="text-red-500">*</span>
                  </label>
                  <input 
                    type="date"
                    name="date"
                    value={formData.date}
                    onChange={handleInputChange}
                    className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-[#1a56db] focus:ring-4 focus:ring-[#1a56db]/10 transition-all outline-none text-sm font-medium"
                    required
                  />
                </div>

                {/* Bank Name Dropdown */}
                <div className="space-y-1.5">
                  <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                    Bank Name <span className="text-red-500">*</span>
                  </label>
                  <select 
                    name="bankName"
                    value={formData.bankName}
                    onChange={handleInputChange}
                    className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-750 focus:border-[#1a56db] focus:ring-4 focus:ring-[#1a56db]/10 transition-all outline-none text-sm font-medium"
                  >
                    <option value="">— Select Bank —</option>
                    {uniqueBanks.map((bank, idx) => (
                      <option key={idx} value={bank}>{bank}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Account Number Dropdown */}
              <div className="space-y-1.5">
                <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                  Account Number <span className="text-red-500">*</span>
                </label>
                <select 
                  name="accountNumber"
                  value={formData.accountNumber}
                  onChange={handleInputChange}
                  disabled={!formData.bankName}
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-750 focus:border-[#1a56db] focus:ring-4 focus:ring-[#1a56db]/10 transition-all outline-none text-sm font-medium disabled:bg-slate-50 disabled:text-slate-400"
                >
                  <option value="">— Select account —</option>
                  {availableAccounts.map((acc, idx) => (
                    <option key={idx} value={acc}>{acc}</option>
                  ))}
                </select>
              </div>

              {/* Notes Input */}
              <div className="space-y-1.5">
                <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                  Notes (optional)
                </label>
                <input 
                  type="text"
                  name="notes"
                  value={formData.notes}
                  onChange={handleInputChange}
                  placeholder="Reference, cheque no., reason..."
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-[#1a56db] focus:ring-4 focus:ring-[#1a56db]/10 transition-all outline-none text-sm font-medium"
                />
              </div>
            </div>

            {/* Amount Deposited Navy Box */}
            <div className="bg-[#0b1324] rounded-2xl p-8 text-slate-100 space-y-4 shadow-xl border border-[#1e293b]/30">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                  <span>💰</span> AMOUNT DEPOSITED (₹)
                </span>
              </div>

              <div className="flex items-center justify-center py-4 relative group">
                {isEditingAmount ? (
                  <input 
                    type="text"
                    value={amount}
                    onChange={handleAmountChange}
                    onBlur={handleAmountBlur}
                    autoFocus
                    className="bg-transparent border-none outline-none text-center text-5xl md:text-6xl font-black text-[#3b82f6] tracking-tight py-2 w-full focus:ring-0 focus:border-none focus:outline-none"
                  />
                ) : (
                  <div 
                    onClick={() => setIsEditingAmount(true)}
                    className="cursor-pointer text-center text-5xl md:text-6xl font-black text-[#3b82f6] tracking-tight py-2 hover:opacity-80 transition-all"
                    title="Click to edit amount"
                  >
                    {amount}
                  </div>
                )}
                
                {!isEditingAmount && (
                  <span className="absolute right-4 text-xs font-bold text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    ✏️ Edit
                  </span>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button 
                onClick={handleSaveDeposit}
                disabled={isSaving}
                className="w-full bg-[#10a34a] hover:bg-[#15803d] text-white font-bold rounded-xl flex items-center justify-center gap-2 h-14 shadow-lg shadow-green-200/50 transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? (
                  <span className="loading loading-spinner"></span>
                ) : (
                  <>
                    <span className="text-lg">💾</span> Save Deposit
                  </>
                )}
              </button>
              
              <button 
                onClick={handleReset}
                disabled={isSaving}
                className="w-full bg-[#f8fafc] hover:bg-[#f1f5f9] text-[#475569] font-bold rounded-xl border border-slate-200 flex items-center justify-center gap-2 h-14 transition-all duration-200 active:scale-[0.98] disabled:opacity-50"
              >
                <span className="text-lg">🔄</span> Reset
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Add Bank Account Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm pointer-events-auto">
          <div className="bg-white rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.2)] border border-slate-200 w-[500px] flex flex-col overflow-hidden animate-fade-in pointer-events-auto">
            
            {/* Header - Fixed at top */}
            <div className="bg-[#0b1324] p-6 text-white shrink-0 relative">
              <h3 className="text-xl font-black italic tracking-tight uppercase">
                Add Bank Account
              </h3>
              <p className="text-slate-400 text-xs mt-1 font-medium italic">
                Create a new bank mapping for deposits
              </p>
              <button 
                onClick={closeModal}
                disabled={isSavingAccount}
                className="absolute right-6 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-all font-bold disabled:opacity-30"
              >
                ✕
              </button>
            </div>

            {/* Scrollable Form Content */}
            <div className="p-6 space-y-6">
              <form id="addBankForm" onSubmit={handleAddBank} className="space-y-4">
                
                {/* Bank Name */}
                <div className="space-y-1.5">
                  <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                    Bank Name <span className="text-red-500">*</span>
                  </label>
                  <input 
                    type="text" 
                    value={newBankData.bankName}
                    onChange={(e) => setNewBankData(prev => ({ ...prev, bankName: e.target.value }))}
                    disabled={isSavingAccount}
                    placeholder="e.g. State Bank of India" 
                    className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 placeholder-slate-400/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium disabled:bg-slate-55 disabled:text-slate-400"
                    required
                  />
                </div>

                {/* Account Number */}
                <div className="space-y-1.5">
                  <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                    Account Number <span className="text-red-500">*</span>
                  </label>
                  <input 
                    type="text" 
                    value={newBankData.accountNumber}
                    onChange={(e) => setNewBankData(prev => ({ ...prev, accountNumber: e.target.value }))}
                    disabled={isSavingAccount}
                    placeholder="Enter account number" 
                    className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 placeholder-slate-400/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium disabled:bg-slate-55 disabled:text-slate-400"
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
                    value={newBankData.ifscCode}
                    onChange={(e) => setNewBankData(prev => ({ ...prev, ifscCode: e.target.value.toUpperCase() }))}
                    disabled={isSavingAccount}
                    placeholder="e.g. SBIN0001234" 
                    className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 placeholder-slate-400/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium disabled:bg-slate-55 disabled:text-slate-400"
                  />
                </div>

                {/* Feedback Messages */}
                {modalError && (
                  <div className="bg-red-50 text-red-650 px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 border border-red-100">
                    <span>⚠️</span>
                    <span>{modalError}</span>
                  </div>
                )}
              </form>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex gap-3 shrink-0">
              <button 
                type="submit" 
                form="addBankForm"
                disabled={isSavingAccount}
                className="btn-premium btn-primary-premium flex-1 h-12 text-sm uppercase tracking-wider font-bold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSavingAccount ? <span className="loading loading-spinner"></span> : 'Save Account'}
              </button>
              <button 
                type="button" 
                onClick={closeModal}
                disabled={isSavingAccount}
                className="btn-premium bg-white text-slate-500 hover:bg-slate-100 border border-slate-200 flex-1 h-12 text-sm font-bold uppercase tracking-wider disabled:opacity-50"
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

export default BankDeposit;
