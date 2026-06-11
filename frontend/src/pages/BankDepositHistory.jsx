import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';

const BankDepositHistory = () => {
  const navigate = useNavigate();

  // Data states
  const [deposits, setDeposits] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [totalDeposits, setTotalDeposits] = useState(0);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const limit = 10;

  // Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [filterBankAccountId, setFilterBankAccountId] = useState('');

  // Edit / Delete / View modals
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [editingDeposit, setEditingDeposit] = useState(null);
  const [deletingDeposit, setDeletingDeposit] = useState(null);
  const [viewingDeposit, setViewingDeposit] = useState(null);

  // Deposit Form state
  const [depositFormData, setDepositFormData] = useState({
    depositDate: '',
    bankName: '',
    bankAccountId: '',
    notes: '',
    amount: '0.00',
    enteredBy: ''
  });

  const [depositFormError, setDepositFormError] = useState('');
  const [depositFormSuccess, setDepositFormSuccess] = useState('');
  const [isSavingDeposit, setIsSavingDeposit] = useState(false);

  useEffect(() => {
    fetchDepositHistory();
  }, [currentPage, searchQuery, startDate, endDate, filterBankAccountId]);

  useEffect(() => {
    fetchBankAccounts();
  }, []);

  const fetchDepositHistory = async () => {
    try {
      setLoading(true);
      const res = await api.get('/bank-deposits/history', {
        params: {
          page: currentPage,
          limit,
          search: searchQuery,
          startDate,
          endDate,
          bankAccountId: filterBankAccountId
        }
      });
      if (res.data.ok) {
        setDeposits(res.data.deposits || []);
        setTotalDeposits(res.data.total || 0);
      }
    } catch (err) {
      console.error('Failed to fetch deposit history:', err);
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

  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1);
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    if (name === 'startDate') setStartDate(value);
    if (name === 'endDate') setEndDate(value);
    if (name === 'filterBankAccountId') setFilterBankAccountId(value);
    setCurrentPage(1);
  };

  const handleOpenDepositForm = (deposit) => {
    setDepositFormError('');
    setDepositFormSuccess('');
    setEditingDeposit(deposit);
    setDepositFormData({
      depositDate: deposit.deposit_date,
      bankName: deposit.bank_name,
      bankAccountId: deposit.bank_account_id,
      notes: deposit.notes || '',
      amount: parseFloat(deposit.amount).toFixed(2),
      enteredBy: deposit.entered_by
    });
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

  const handleDepositInputChange = (e) => {
    const { name, value } = e.target;
    if (name === 'bankName') {
      setDepositFormData(prev => ({
        ...prev,
        bankName: value,
        bankAccountId: ''
      }));
    } else {
      setDepositFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleAmountChange = (e) => {
    const val = e.target.value.replace(/[^0-9.]/g, '');
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
    if (!enteredBy.trim()) return setDepositFormError('Name is required.');

    setIsSavingDeposit(true);
    try {
      const res = await api.put(`/bank-deposits/${editingDeposit.id}`, {
        depositDate,
        bankAccountId,
        amount: parsedAmount,
        enteredBy: enteredBy.trim(),
        notes: notes.trim()
      });

      if (res.data.ok) {
        setDepositFormSuccess('Deposit record updated successfully!');
        setTimeout(() => {
          handleCloseDepositForm();
          fetchDepositHistory();
        }, 1000);
      } else {
        setDepositFormError(res.data.error || 'Failed to update deposit.');
      }
    } catch (err) {
      setDepositFormError(err.response?.data?.error || err.message || 'An error occurred.');
    } finally {
      setIsSavingDeposit(false);
    }
  };

  const confirmDelete = (deposit) => {
    setDeletingDeposit(deposit);
    setIsDeleteModalOpen(true);
  };

  const handleDeleteDeposit = async () => {
    if (!deletingDeposit) return;
    try {
      const res = await api.delete(`/bank-deposits/${deletingDeposit.id}`);
      if (res.data.ok) {
        setIsDeleteModalOpen(false);
        setDeletingDeposit(null);
        fetchDepositHistory();
      } else {
        alert(res.data.error || 'Failed to delete deposit.');
      }
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  const handleOpenView = (deposit) => {
    setViewingDeposit(deposit);
    setIsViewModalOpen(true);
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

  // PDF Export
  const handleExportPDF = () => {
    if (deposits.length === 0) {
      alert('No data available to print.');
      return;
    }

    const printWindow = window.open('', '_blank');
    const html = `
      <html>
        <head>
          <title>Bank Deposit History Report</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; color: #334155; }
            .header-container { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 30px; }
            h1 { font-size: 22px; font-weight: 800; color: #0f172a; margin: 0; }
            p { font-size: 13px; color: #64748b; margin: 5px 0 0 0; }
            .date-badge { font-size: 11px; font-weight: 700; color: #475569; background: #f1f5f9; padding: 6px 12px; border-radius: 8px; border: 1px solid #e2e8f0; text-transform: uppercase; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th { background-color: #f8fafc; border-bottom: 2px solid #cbd5e1; color: #475569; font-size: 10px; font-weight: 800; text-transform: uppercase; padding: 12px 14px; text-align: left; }
            td { border-bottom: 1px solid #e2e8f0; padding: 12px 14px; font-size: 12px; color: #334155; }
            .mono { font-family: monospace; font-weight: bold; color: #1a56db; }
            .amount { font-weight: bold; }
            .total-box { margin-top: 40px; text-align: right; font-size: 15px; font-weight: 800; color: #0f172a; padding-right: 14px; }
          </style>
        </head>
        <body>
          <div class="header-container">
            <div>
              <h1>KEMP'S INVENTORY SYSTEM</h1>
              <p>Bank Deposits Ledger Register</p>
            </div>
            <div class="date-badge">Generated: ${new Date().toLocaleDateString('en-GB')}</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Deposit ID</th>
                <th>Date</th>
                <th>Bank Name</th>
                <th>Account Number</th>
                <th>Amount (₹)</th>
                <th>Entered By</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              ${deposits.map(d => `
                <tr>
                  <td class="mono">${d.id}</td>
                  <td>${formatDateDDMMYYYY(d.deposit_date)}</td>
                  <td style="font-weight: 600;">${d.bank_name}</td>
                  <td class="mono">${d.account_number}</td>
                  <td class="amount">₹ ${parseFloat(d.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td>${d.entered_by}</td>
                  <td style="color: #64748b; font-style: italic;">${d.notes || '—'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="total-box">
            Summary Total: ₹ ${deposits.reduce((sum, d) => sum + parseFloat(d.amount), 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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

  const totalPages = Math.ceil(totalDeposits / limit) || 1;
  const uniqueBanks = Array.from(new Set(bankAccounts.map(acc => acc.bank_name)));
  const filteredAccounts = bankAccounts.filter(acc => acc.bank_name === depositFormData.bankName);

  return (
    <div className="space-y-6 animate-fade-in">

      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <button 
            onClick={() => navigate('/bank-deposit')}
            className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-650 hover:bg-slate-50 transition-all font-bold text-sm shadow-sm flex items-center gap-1.5 mb-2"
          >
            ← Back
          </button>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase">Bank Deposit History</h1>
          <p className="text-slate-500 text-sm font-medium mt-1">View and audit all recorded bank deposits</p>
        </div>
        
        <div className="flex gap-3">
          <button 
            onClick={handleExportPDF}
            className="btn-premium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs px-4 h-12"
          >
            🖨️ Export to PDF
          </button>
        </div>
      </div>

      {/* FILTER CONTROLS & TABLE CARD */}
      <div className="card-premium">
        
        {/* Filters Grid */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          {/* Search Box */}
          <div className="relative md:col-span-2">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
            <input 
              type="text" 
              placeholder="Search by ID, Creator, Notes, Bank..."
              value={searchQuery}
              onChange={handleSearchChange}
              className="input-premium pl-11 h-11 w-full"
            />
          </div>

          {/* Account Filter */}
          <div>
            <select
              name="filterBankAccountId"
              value={filterBankAccountId}
              onChange={handleFilterChange}
              className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
            >
              <option value="">All Accounts</option>
              {bankAccounts.map(acc => (
                <option key={acc.id} value={acc.id}>{acc.bank_name} - {acc.account_number}</option>
              ))}
            </select>
          </div>

          {/* Start Date */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400 uppercase shrink-0">From</span>
            <input 
              type="date"
              name="startDate"
              value={startDate}
              onChange={handleFilterChange}
              className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
            />
          </div>

          {/* End Date */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400 uppercase shrink-0">To</span>
            <input 
              type="date"
              name="endDate"
              value={endDate}
              onChange={handleFilterChange}
              className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
            />
          </div>
        </div>

        {/* Records Count Badge */}
        <div className="flex justify-end mb-4">
          <div className="text-[12px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
            {totalDeposits} Total Records
          </div>
        </div>

        {/* Data Table */}
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
                       <span className="text-slate-400 text-sm font-medium">Fetching deposit logs...</span>
                    </div>
                  </td>
                </tr>
              ) : deposits.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-20 text-center text-slate-400 font-medium italic">
                    No deposit records matching the filter criteria.
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
                          className="btn btn-ghost btn-xs text-slate-505 hover:bg-slate-100 rounded-lg px-2"
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

        {/* PAGINATION CONTROLS */}
        {!loading && totalDeposits > 0 && (
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-100">
            <div className="text-[12px] font-bold text-slate-400 uppercase">
              Page {currentPage} of {totalPages}
            </div>
            <div className="flex gap-2">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-50 text-[12px] font-bold shadow-sm transition-all duration-200"
              >
                Previous
              </button>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-50 text-[12px] font-bold shadow-sm transition-all duration-200"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* EDIT MODAL DIALOG */}
      {isDepositModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm pointer-events-auto">
          <div className="bg-white rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.2)] border border-slate-200 w-[600px] h-[670px] flex flex-col overflow-hidden animate-fade-in pointer-events-auto">
            {/* Header */}
            <div className="bg-[#0b1324] p-7 text-white shrink-0 relative">
              <h3 className="text-2xl font-black italic tracking-tight uppercase">
                Edit Deposit Record
              </h3>
              <p className="text-slate-400 text-xs mt-1 font-medium italic">
                Modifying history record: {editingDeposit.id}
              </p>
              <button 
                onClick={handleCloseDepositForm}
                className="absolute right-7 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-all font-bold"
              >
                ✕
              </button>
            </div>

            {/* Scrollable Form Content */}
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
              <form id="bankDepositFormHistory" onSubmit={handleSaveDeposit} className="space-y-6">
                
                {/* Form fields frame */}
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
                        Notes
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

                    {/* Entered By */}
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

                {/* Amount Display */}
                <div className="bg-[#0b1324] text-white p-6 rounded-3xl text-center shadow-lg border border-slate-800">
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

                {/* Feedback */}
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

            {/* Modal Footer */}
            <div className="p-8 border-t border-slate-100 bg-white flex gap-4 shrink-0 shadow-[0_-10px_30px_rgba(0,0,0,0.02)]">
              <button 
                type="submit" 
                form="bankDepositFormHistory"
                disabled={isSavingDeposit}
                className="btn-premium btn-primary-premium flex-[2] h-14 text-sm uppercase tracking-wider"
              >
                {isSavingDeposit ? <span className="loading loading-spinner"></span> : 'Update Deposit'}
              </button>
              <button 
                type="button" 
                onClick={() => {
                  setDepositFormData({
                    depositDate: editingDeposit.deposit_date,
                    bankName: editingDeposit.bank_name,
                    bankAccountId: editingDeposit.bank_account_id,
                    notes: editingDeposit.notes || '',
                    amount: parseFloat(editingDeposit.amount).toFixed(2),
                    enteredBy: editingDeposit.entered_by
                  });
                  setDepositFormError('');
                  setDepositFormSuccess('');
                }}
                className="btn-premium bg-slate-50 text-slate-550 hover:bg-slate-100 border border-slate-200 flex-1 h-14 text-sm font-bold uppercase tracking-wider"
              >
                Reset
              </button>
              <button 
                type="button" 
                onClick={handleCloseDepositForm}
                className="btn-premium bg-white text-slate-550 hover:bg-slate-50 border border-slate-200 flex-1 h-14 text-sm font-bold uppercase tracking-wider"
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
          <div className="bg-white rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.2)] border border-slate-200 w-[500px] p-8 flex flex-col gap-6 animate-fade-in pointer-events-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-150">
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-1.5">
                <span>📋</span> Deposit Details
              </h3>
              <button 
                onClick={() => setIsViewModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-55 flex items-center justify-center text-slate-505 hover:bg-slate-100 transition-all font-bold"
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
          <div className="modal-box rounded-2xl p-8 max-w-sm border border-slate-200 shadow-2xl">
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

export default BankDepositHistory;
