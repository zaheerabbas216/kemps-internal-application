import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';

const BankDeposit = () => {
  const navigate = useNavigate();

  const [deposits, setDeposits] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [summary, setSummary] = useState({ totalAmount: 0, totalCount: 0 });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [todayDateStr, setTodayDateStr] = useState('');

  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [isSavingDeposit, setIsSavingDeposit] = useState(false);
  const [isSavingAccount, setIsSavingAccount] = useState(false);

  const [depositFormData, setDepositFormData] = useState({
    depositDate: '',
    bankAccountId: '',
    amount: '',
    enteredBy: '',
    notes: ''
  });

  const [accountFormData, setAccountFormData] = useState({
    bankName: '',
    accountNumber: '',
    ifscCode: '',
    branch: ''
  });

  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    fetchTodayDeposits();
    fetchBankAccounts();
  }, [searchQuery]);

  const setNotification = (type, text) => {
    setMessage({ type, text });
    window.setTimeout(() => {
      setMessage({ type: '', text: '' });
    }, 4000);
  };

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
      console.error('Failed to fetch today deposits:', err);
      setNotification('error', 'Unable to load deposits right now.');
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

  const getTodayDate = () => {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const istDate = new Date(now.getTime() + (330 + offset) * 60000);
    const yyyy = istDate.getFullYear();
    const mm = String(istDate.getMonth() + 1).padStart(2, '0');
    const dd = String(istDate.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const openDepositForm = () => {
    setDepositFormData({
      depositDate: getTodayDate(),
      bankAccountId: '',
      amount: '',
      enteredBy: localStorage.getItem('kemps_username') || '',
      notes: ''
    });
    setIsDepositModalOpen(true);
  };

  const closeDepositForm = () => {
    setIsDepositModalOpen(false);
  };

  const handleDepositInputChange = (e) => {
    const { name, value } = e.target;
    setDepositFormData((prev) => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSaveDeposit = async (e) => {
    e.preventDefault();

    const parsedAmount = parseFloat(depositFormData.amount);

    if (!depositFormData.depositDate) {
      setNotification('error', 'Please select a deposit date.');
      return;
    }
    if (!depositFormData.bankAccountId) {
      setNotification('error', 'Please select a bank account.');
      return;
    }
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setNotification('error', 'Please enter a valid amount greater than 0.');
      return;
    }
    if (!depositFormData.enteredBy.trim()) {
      setNotification('error', 'Please enter the name of the person who recorded this deposit.');
      return;
    }

    try {
      setIsSavingDeposit(true);
      const res = await api.post('/bank-deposits', {
        depositDate: depositFormData.depositDate,
        bankAccountId: Number(depositFormData.bankAccountId),
        amount: parsedAmount,
        enteredBy: depositFormData.enteredBy.trim(),
        notes: depositFormData.notes.trim()
      });

      if (res.data.ok) {
        setNotification('success', 'Deposit recorded successfully.');
        closeDepositForm();
        fetchTodayDeposits();
      } else {
        setNotification('error', res.data.error || 'Failed to save deposit.');
      }
    } catch (err) {
      setNotification('error', err.response?.data?.error || err.message || 'Failed to save deposit.');
    } finally {
      setIsSavingDeposit(false);
    }
  };

  const openAccountForm = () => {
    setAccountFormData({
      bankName: '',
      accountNumber: '',
      ifscCode: '',
      branch: ''
    });
    setIsAccountModalOpen(true);
  };

  const closeAccountForm = () => {
    setIsAccountModalOpen(false);
  };

  const handleAccountInputChange = (e) => {
    const { name, value } = e.target;
    setAccountFormData((prev) => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSaveBankAccount = async (e) => {
    e.preventDefault();

    if (!accountFormData.bankName.trim()) {
      setNotification('error', 'Bank name is required.');
      return;
    }
    if (!accountFormData.accountNumber.trim()) {
      setNotification('error', 'Account number is required.');
      return;
    }

    try {
      setIsSavingAccount(true);
      const res = await api.post('/bank-deposits/accounts', {
        bankName: accountFormData.bankName.trim(),
        accountNumber: accountFormData.accountNumber.trim(),
        ifscCode: accountFormData.ifscCode.trim(),
        branch: accountFormData.branch.trim()
      });

      if (res.data.ok) {
        setNotification('success', 'Bank account added successfully.');
        closeAccountForm();
        fetchBankAccounts();
      } else {
        setNotification('error', res.data.error || 'Failed to add bank account.');
      }
    } catch (err) {
      setNotification('error', err.response?.data?.error || err.message || 'Failed to add bank account.');
    } finally {
      setIsSavingAccount(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    const parts = String(dateStr).split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  const formatCurrency = (value) => {
    const num = Number(value || 0);
    return num.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      {message.text && (
        <div className={`fixed right-6 top-6 z-[9999] rounded-2xl border px-4 py-3 shadow-lg ${
          message.type === 'success'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border-red-200 bg-red-50 text-red-700'
        }`}>
          <span className="text-sm font-semibold">{message.text}</span>
        </div>
      )}

      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">BANK DEPOSITS</h1>
          <p className="text-sm text-slate-500">Manage deposits for your bank accounts</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={openDepositForm}
            className="btn-premium btn-primary-premium h-12"
          >
            + Record Deposit
          </button>
          <button
            onClick={() => navigate('/bank-deposit-history')}
            className="btn-premium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 h-12"
          >
            History
          </button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="card-premium">
          <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Today&apos;s Total Deposits</p>
          <h3 className="mt-2 text-2xl font-extrabold text-slate-900">₹ {formatCurrency(summary.totalAmount)}</h3>
        </div>
        <div className="card-premium">
          <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Number of Entries</p>
          <h3 className="mt-2 text-2xl font-extrabold text-slate-900">{summary.totalCount}</h3>
        </div>
      </div>

      <div className="card-premium">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative max-w-md flex-1">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search deposits..."
              className="input-premium h-10 w-full pl-11"
            />
          </div>
          <div className="text-[12px] font-bold uppercase tracking-widest text-slate-400">
            {todayDateStr ? formatDate(todayDateStr) : 'Today'}
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="table table-zebra w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-4 text-left">Deposit ID</th>
                <th className="px-6 py-4 text-left">Date</th>
                <th className="px-6 py-4 text-left">Bank Details</th>
                <th className="px-6 py-4 text-left">Amount</th>
                <th className="px-6 py-4 text-left">Entered By</th>
                <th className="px-6 py-4 text-left">Notes</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="6" className="py-16 text-center text-slate-400">
                    Loading deposits...
                  </td>
                </tr>
              ) : deposits.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-16 text-center text-slate-400">
                    No deposits found.
                  </td>
                </tr>
              ) : (
                deposits.map((dep) => (
                  <tr key={dep.id}>
                    <td className="px-6 py-4 font-mono text-sm font-bold text-primary">{dep.id}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{formatDate(dep.deposit_date)}</td>
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-700">{dep.bank_name}</div>
                      <div className="text-xs text-slate-400">A/C: {dep.account_number}</div>
                    </td>
                    <td className="px-6 py-4 font-semibold text-slate-800">₹ {formatCurrency(dep.amount)}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{dep.entered_by || '—'}</td>
                    <td className="px-6 py-4 text-sm text-slate-500">{dep.notes || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isDepositModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
          <div className="w-[600px] max-w-[90vw] rounded-3xl bg-white shadow-2xl">
            <div className="border-b border-slate-100 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-black uppercase tracking-tight text-slate-900">Record Deposit</h3>
                  <p className="text-sm text-slate-500">Enter deposit details</p>
                </div>
                <button
                  onClick={closeDepositForm}
                  className="h-8 w-8 rounded-full bg-slate-100 text-slate-600"
                >
                  ✕
                </button>
              </div>
            </div>

            <form onSubmit={handleSaveDeposit} className="space-y-5 p-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[12px] font-bold uppercase tracking-wider text-slate-500">Date *</label>
                  <input
                    type="date"
                    name="depositDate"
                    value={depositFormData.depositDate}
                    onChange={handleDepositInputChange}
                    className="h-11 w-full rounded-xl border border-slate-200 px-4"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[12px] font-bold uppercase tracking-wider text-slate-500">Bank Account *</label>
                  <select
                    name="bankAccountId"
                    value={depositFormData.bankAccountId}
                    onChange={handleDepositInputChange}
                    className="h-11 w-full rounded-xl border border-slate-200 px-4"
                    required
                  >
                    <option value="">Select account</option>
                    {bankAccounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.bank_name} - {acc.account_number}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-[12px] font-bold uppercase tracking-wider text-slate-500">Amount *</label>
                  <input
                    type="number"
                    name="amount"
                    step="0.01"
                    min="0"
                    value={depositFormData.amount}
                    onChange={handleDepositInputChange}
                    className="h-11 w-full rounded-xl border border-slate-200 px-4"
                    required
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-[12px] font-bold uppercase tracking-wider text-slate-500">Entered By *</label>
                  <input
                    type="text"
                    name="enteredBy"
                    value={depositFormData.enteredBy}
                    onChange={handleDepositInputChange}
                    className="h-11 w-full rounded-xl border border-slate-200 px-4"
                    required
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-[12px] font-bold uppercase tracking-wider text-slate-500">Notes</label>
                  <input
                    type="text"
                    name="notes"
                    value={depositFormData.notes}
                    onChange={handleDepositInputChange}
                    className="h-11 w-full rounded-xl border border-slate-200 px-4"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isSavingDeposit}
                  className="h-12 flex-1 rounded-xl bg-emerald-600 text-sm font-bold text-white"
                >
                  {isSavingDeposit ? 'Saving...' : 'Save Deposit'}
                </button>
                <button
                  type="button"
                  onClick={closeDepositForm}
                  className="h-12 flex-1 rounded-xl border border-slate-200 bg-slate-50 text-sm font-bold text-slate-600"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isAccountModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
          <div className="w-[500px] max-w-[90vw] rounded-3xl bg-white shadow-2xl">
            <div className="border-b border-slate-100 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-black uppercase tracking-tight text-slate-900">Add Bank Account</h3>
                  <p className="text-sm text-slate-500">Register a new bank account</p>
                </div>
                <button
                  onClick={closeAccountForm}
                  className="h-8 w-8 rounded-full bg-slate-100 text-slate-600"
                >
                  ✕
                </button>
              </div>
            </div>

            <form onSubmit={handleSaveBankAccount} className="space-y-4 p-6">
              <div>
                <label className="mb-1 block text-[12px] font-bold uppercase tracking-wider text-slate-500">Bank Name *</label>
                <input
                  type="text"
                  name="bankName"
                  value={accountFormData.bankName}
                  onChange={handleAccountInputChange}
                  className="h-11 w-full rounded-xl border border-slate-200 px-4"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-bold uppercase tracking-wider text-slate-500">Account Number *</label>
                <input
                  type="text"
                  name="accountNumber"
                  value={accountFormData.accountNumber}
                  onChange={handleAccountInputChange}
                  className="h-11 w-full rounded-xl border border-slate-200 px-4"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-bold uppercase tracking-wider text-slate-500">IFSC Code</label>
                <input
                  type="text"
                  name="ifscCode"
                  value={accountFormData.ifscCode}
                  onChange={handleAccountInputChange}
                  className="h-11 w-full rounded-xl border border-slate-200 px-4"
                />
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-bold uppercase tracking-wider text-slate-500">Branch</label>
                <input
                  type="text"
                  name="branch"
                  value={accountFormData.branch}
                  onChange={handleAccountInputChange}
                  className="h-11 w-full rounded-xl border border-slate-200 px-4"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isSavingAccount}
                  className="h-12 flex-1 rounded-xl bg-primary text-sm font-bold text-white"
                >
                  {isSavingAccount ? 'Saving...' : 'Save Account'}
                </button>
                <button
                  type="button"
                  onClick={closeAccountForm}
                  className="h-12 flex-1 rounded-xl border border-slate-200 bg-slate-50 text-sm font-bold text-slate-600"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default BankDeposit;
