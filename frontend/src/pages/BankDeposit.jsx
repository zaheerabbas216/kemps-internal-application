import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';

const BankDeposit = () => {
  const navigate = useNavigate();

  // Data states
  const [deposits, setDeposits] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [summary, setSummary] = useState({ totalAmount: 0, totalCount: 0 });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [todayDateStr, setTodayDateStr] = useState('');

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
    fetchTodayDeposits();
    fetchBankAccounts();
  }, [searchQuery]);

  const fetchTodayDeposits = async () => {
    try {
      setLoading(true);
      const res = await api.get('/bank-deposits/today', {
        params: { search: searchQuery }
      });
      if (res.data.ok) {
        setDeposits(res.data.deposits || []);
        setSummary(res.data.summary || { totalAmount: 0, totalCount: 0 });
        if (res.data.todayStr) {
          setTodayDateStr(res.data.todayStr);
        }
      }
    } catch (err) {
      console.error('Failed to fetch today\'s deposits:', err);
    } finally {
      setLoading(false);
    }
  };
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
        setBankAccounts(res.data.accounts || []);
        setDbAccounts(res.data.accounts || []);
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
      const todayFormatted = todayDateStr || new Date().toISOString().split('T')[0];
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
          fetchTodayDeposits();
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
        fetchTodayDeposits();
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
            onClick={() => navigate('/bank-deposit-history')}
            className="btn-premium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs px-4 h-12"
          >
            History
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
        {/* Total Deposits Card */}
        <div className="card-premium flex items-center justify-between">
          <div>
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Today's Total Deposits</p>
            <h3 className="text-2xl font-extrabold text-[#0f172a] mt-1.5">
              ₹ {summary.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h3>
          </div>
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center text-xl font-bold border border-emerald-100">
            ₹
          </div>
        </div>

        {/* Total Entries Card */}
        <div className="card-premium flex items-center justify-between">
          <div>
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Number of Entries</p>
            <h3 className="text-2xl font-extrabold text-[#0f172a] mt-1.5">
              {summary.totalCount} {summary.totalCount === 1 ? 'Entry' : 'Entries'}
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
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="relative flex-1 max-w-md">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
            <input 
              type="text" 
              placeholder="Search today's deposits..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-premium pl-11 h-10 w-full"
            />
          </div>
          <div className="text-[12px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-3.5 py-1.5 rounded-lg border border-slate-100">
            Today's Deposits — {todayDateStr ? formatDateDDMMYYYY(todayDateStr) : formatDateDDMMYYYY(new Date().toISOString().split('T')[0])}
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
                       <span className="text-slate-400 text-sm font-medium">Loading today's deposits...</span>
                    </div>
                  </td>
                </tr>
              ) : deposits.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-20 text-center text-slate-400 font-medium italic">
                    {searchQuery ? 'No matching deposits found for today.' : 'No deposits recorded today.'}
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

            {/* Content */}
            <div className="p-6 space-y-4">
              <form id="bankAccountForm" onSubmit={handleSaveBankAccount} className="space-y-4">
            {/* Scrollable Form Content */}
            <div className="p-6 space-y-6">
              <form id="addBankForm" onSubmit={handleAddBank} className="space-y-4">
                
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
                    Account Number *
                  </label>
                  <input 
                    type="text"
                    name="accountNumber"
                    value={accountFormData.accountNumber}
                    onChange={handleAccountInputChange}
                    placeholder="e.g. 5010023456789" 
                    className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
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
        </div>
      )}

    </div>
  );
};

export default BankDeposit;
