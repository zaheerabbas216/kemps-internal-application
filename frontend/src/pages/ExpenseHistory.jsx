import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';

const ExpenseHistory = () => {
  const navigate = useNavigate();

  // Data states
  const [expenses, setExpenses] = useState([]);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const limit = 10;

  // Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Modal states
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [deletingExpense, setDeletingExpense] = useState(null);
  const [viewingExpense, setViewingExpense] = useState(null);

  // Form states
  const [formData, setFormData] = useState({
    expenseDate: '',
    particulars: '',
    amount: '',
    enteredBy: '',
    remarks: ''
  });
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchExpenseHistory();
  }, [currentPage, searchQuery, startDate, endDate]);

  const fetchExpenseHistory = async () => {
    try {
      setLoading(true);
      const res = await api.get('/expenses/history', {
        params: {
          page: currentPage,
          limit,
          search: searchQuery,
          startDate,
          endDate
        }
      });
      if (res.data.ok) {
        setExpenses(res.data.expenses || []);
        setTotalExpenses(res.data.total || 0);
      }
    } catch (err) {
      console.error('Failed to fetch expense history:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1);
  };

  const handleDateFilterChange = (e) => {
    const { name, value } = e.target;
    if (name === 'startDate') setStartDate(value);
    if (name === 'endDate') setEndDate(value);
    setCurrentPage(1);
  };

  const handleOpenForm = (expense) => {
    setFormError('');
    setFormSuccess('');
    setEditingExpense(expense);
    setFormData({
      expenseDate: expense.expense_date,
      particulars: expense.particulars,
      amount: expense.amount,
      enteredBy: expense.entered_by,
      remarks: expense.remarks || ''
    });
    setIsFormModalOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormModalOpen(false);
    setEditingExpense(null);
    setFormData({
      expenseDate: '',
      particulars: '',
      amount: '',
      enteredBy: '',
      remarks: ''
    });
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name === 'amount') {
      const val = value.replace(/[^0-9.]/g, '');
      setFormData(prev => ({ ...prev, [name]: val }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    const { expenseDate, particulars, amount, enteredBy } = formData;
    if (!expenseDate) return setFormError('Date is required.');
    if (!particulars.trim()) return setFormError('Particulars description is required.');

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return setFormError('Amount must be a positive number greater than 0.');
    }
    if (!enteredBy.trim()) return setFormError('Name is required.');

    setIsSaving(true);
    try {
      const res = await api.put(`/expenses/${editingExpense.id}`, formData);
      if (res.data.ok) {
        setFormSuccess('Expense record updated successfully!');
        setTimeout(() => {
          handleCloseForm();
          fetchExpenseHistory();
        }, 1000);
      } else {
        setFormError(res.data.error || 'Failed to update expense.');
      }
    } catch (err) {
      setFormError(err.response?.data?.error || err.message || 'An error occurred.');
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = (expense) => {
    setDeletingExpense(expense);
    setIsDeleteModalOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingExpense) return;
    try {
      const res = await api.delete(`/expenses/${deletingExpense.id}`);
      if (res.data.ok) {
        setIsDeleteModalOpen(false);
        setDeletingExpense(null);
        fetchExpenseHistory();
      } else {
        alert(res.data.error || 'Failed to delete expense.');
      }
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  const handleOpenView = (expense) => {
    setViewingExpense(expense);
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



  // PDF EXPORT / PRINT LEDGER
  const handleExportPDF = () => {
    if (expenses.length === 0) {
      alert('No data available to print.');
      return;
    }

    const printWindow = window.open('', '_blank');
    const html = `
      <html>
        <head>
          <title>Expense Ledger Report</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; color: #334155; }
            .header-container { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 30px; }
            h1 { font-size: 22px; font-weight: 800; color: #0f172a; margin: 0; }
            p { font-size: 13px; color: #64748b; margin: 5px 0 0 0; }
            .date-badge { font-size: 11px; font-weight: 700; color: #475569; background: #f1f5f9; padding: 6px 12px; rounded: 8px; border: 1px solid #e2e8f0; text-transform: uppercase; }
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
              <p>Expense Registry History Ledger</p>
            </div>
            <div class="date-badge">Generated: ${new Date().toLocaleDateString('en-GB')}</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Expense ID</th>
                <th>Date</th>
                <th>Particulars</th>
                <th>Amount (₹)</th>
                <th>Entered By</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              ${expenses.map(e => `
                <tr>
                  <td class="mono">${e.id}</td>
                  <td>${formatDateDDMMYYYY(e.expense_date)}</td>
                  <td style="font-weight: 600;">${e.particulars}</td>
                  <td class="amount">₹ ${parseFloat(e.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td>${e.entered_by}</td>
                  <td style="color: #64748b; font-style: italic;">${e.remarks || '—'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="total-box">
            Summary Total: ₹ ${expenses.reduce((sum, e) => sum + parseFloat(e.amount), 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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

  const totalPages = Math.ceil(totalExpenses / limit) || 1;

  return (
    <div className="space-y-6 animate-fade-in">

      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <button 
            onClick={() => navigate('/expense')}
            className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-650 hover:bg-slate-50 transition-all font-bold text-sm shadow-sm flex items-center gap-1.5 mb-2"
          >
            ← Back
          </button>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase">EXPENSE HISTORY</h1>
          <p className="text-slate-500 text-sm font-medium mt-1">View and manage all expense records</p>
        </div>
        
        {/* EXPORT OPTIONS */}
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
        
        {/* Date Range & Search Inputs */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          {/* Search Box */}
          <div className="relative md:col-span-2">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
            <input 
              type="text" 
              placeholder="Search by ID, particulars, amount, creator..."
              value={searchQuery}
              onChange={handleSearchChange}
              className="input-premium pl-11 h-11 w-full"
            />
          </div>

          {/* Start Date */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400 uppercase shrink-0">From</span>
            <input 
              type="date"
              name="startDate"
              value={startDate}
              onChange={handleDateFilterChange}
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
              onChange={handleDateFilterChange}
              className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
            />
          </div>
        </div>

        {/* Records Count Badge */}
        <div className="flex justify-end mb-4">
          <div className="text-[12px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
            {totalExpenses} Total Records
          </div>
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="table table-zebra w-full overflow-hidden">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr className="text-slate-500 text-[11px] font-black uppercase tracking-wider">
                <th className="py-4 px-6 text-left">Expense ID</th>
                <th className="py-4 px-6 text-left">Date</th>
                <th className="py-4 px-6 text-left">Particulars</th>
                <th className="py-4 px-6 text-left">Amount (₹)</th>
                <th className="py-4 px-6 text-left">Entered By</th>
                <th className="py-4 px-6 text-left">Remarks</th>
                <th className="py-4 px-6 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr>
                  <td colSpan="7" className="py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                       <span className="loading loading-spinner text-primary"></span>
                       <span className="text-slate-400 text-sm font-medium">Fetching history ledger...</span>
                    </div>
                  </td>
                </tr>
              ) : expenses.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-20 text-center text-slate-400 font-medium italic">
                    No expense records matching the criteria.
                  </td>
                </tr>
              ) : (
                expenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-blue-50/30 transition-colors group">
                    <td className="py-4 px-6 text-[13px] font-mono font-bold text-primary">{exp.id}</td>
                    <td className="py-4 px-6 text-[13px] font-medium text-slate-550">{formatDateDDMMYYYY(exp.expense_date)}</td>
                    <td className="py-4 px-6 text-[14px] font-bold text-slate-700 max-w-[200px] truncate" title={exp.particulars}>{exp.particulars}</td>
                    <td className="py-4 px-6 text-[14px] font-black text-slate-800">
                      ₹ {parseFloat(exp.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-4 px-6 text-[14px] font-semibold text-slate-650">{exp.entered_by}</td>
                    <td className="py-4 px-6 text-[13px] text-slate-400 max-w-[150px] truncate" title={exp.remarks || ''}>
                      {exp.remarks || '—'}
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center justify-center gap-2">
                        <button 
                          onClick={() => handleOpenView(exp)}
                          className="btn btn-ghost btn-xs text-slate-505 hover:bg-slate-100 rounded-lg px-2"
                        >
                          View
                        </button>
                        <button 
                          onClick={() => handleOpenForm(exp)}
                          className="btn btn-ghost btn-xs text-primary hover:bg-primary/10 rounded-lg px-2"
                        >
                          Edit
                        </button>
                        <button 
                          onClick={() => confirmDelete(exp)}
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
        {!loading && totalExpenses > 0 && (
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
      {isFormModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm pointer-events-auto">
          <div className="bg-white rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.2)] border border-slate-200 w-[600px] h-[580px] flex flex-col overflow-hidden animate-fade-in pointer-events-auto">
            {/* Header */}
            <div className="bg-[#0b1324] p-7 text-white shrink-0 relative">
              <h3 className="text-2xl font-black italic tracking-tight uppercase">
                Edit Expense Record
              </h3>
              <p className="text-slate-400 text-xs mt-1 font-medium italic">
                Modifying history record: {editingExpense.id}
              </p>
              <button 
                onClick={handleCloseForm}
                className="absolute right-7 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-all font-bold"
              >
                ✕
              </button>
            </div>

            {/* Scrollable Form Content */}
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
              <form id="expenseFormHistory" onSubmit={handleSave} className="space-y-6">
                
                {/* Form fields frame */}
                <div className="border border-slate-200/80 rounded-2xl bg-white p-6 space-y-4">
                  <div className="text-[11px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 pb-2 flex items-center gap-1.5">
                    <span>💸</span> EXPENSE DETAILS
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {/* Date */}
                    <div className="space-y-1.5">
                      <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                        Date *
                      </label>
                      <input 
                        type="date" 
                        name="expenseDate"
                        value={formData.expenseDate}
                        onChange={handleInputChange}
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                        required
                      />
                    </div>

                    {/* Amount */}
                    <div className="space-y-1.5">
                      <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                        Amount (₹) *
                      </label>
                      <input 
                        type="text" 
                        name="amount"
                        value={formData.amount}
                        onChange={handleInputChange}
                        placeholder="0.00" 
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                        required
                      />
                    </div>

                    {/* Particulars */}
                    <div className="md:col-span-2 space-y-1.5">
                      <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                        Particulars *
                      </label>
                      <input 
                        type="text" 
                        name="particulars"
                        value={formData.particulars}
                        onChange={handleInputChange}
                        placeholder="What was the expense for?" 
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                        required
                      />
                    </div>

                    {/* Entered By */}
                    <div className="space-y-1.5">
                      <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                        Name (Entered By) *
                      </label>
                      <input 
                        type="text" 
                        name="enteredBy"
                        value={formData.enteredBy}
                        onChange={handleInputChange}
                        placeholder="Who recorded this?" 
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                        required
                      />
                    </div>

                    {/* Remarks */}
                    <div className="space-y-1.5">
                      <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                        Remarks
                      </label>
                      <input 
                        type="text" 
                        name="remarks"
                        value={formData.remarks}
                        onChange={handleInputChange}
                        placeholder="Optional remarks or notes..." 
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                      />
                    </div>
                  </div>
                </div>

                {/* Feedback */}
                {formError && (
                  <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-xs font-semibold flex items-center gap-2 border border-red-100">
                    <span>⚠️</span>
                    <span>{formError}</span>
                  </div>
                )}
                {formSuccess && (
                  <div className="bg-emerald-50 text-emerald-600 px-4 py-3 rounded-xl text-xs font-semibold flex items-center gap-2 border border-emerald-100">
                    <span>✅</span>
                    <span>{formSuccess}</span>
                  </div>
                )}
              </form>
            </div>

            {/* Modal Footer */}
            <div className="p-8 border-t border-slate-100 bg-white flex gap-4 shrink-0 shadow-[0_-10px_30px_rgba(0,0,0,0.02)]">
              <button 
                type="submit" 
                form="expenseFormHistory"
                disabled={isSaving}
                className="btn-premium btn-primary-premium flex-[2] h-14 text-sm uppercase tracking-wider"
              >
                {isSaving ? <span className="loading loading-spinner"></span> : 'Update Expense'}
              </button>
              <button 
                type="button" 
                onClick={() => {
                  setFormData({
                    expenseDate: editingExpense.expense_date,
                    particulars: editingExpense.particulars,
                    amount: editingExpense.amount,
                    enteredBy: editingExpense.entered_by,
                    remarks: editingExpense.remarks || ''
                  });
                  setFormError('');
                  setFormSuccess('');
                }}
                className="btn-premium bg-slate-50 text-slate-550 hover:bg-slate-100 border border-slate-200 flex-1 h-14 text-sm font-bold uppercase tracking-wider"
              >
                Reset
              </button>
              <button 
                type="button" 
                onClick={handleCloseForm}
                className="btn-premium bg-white text-slate-500 hover:bg-slate-50 border border-slate-200 flex-1 h-14 text-sm font-bold uppercase tracking-wider"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VIEW DETAILS MODAL */}
      {isViewModalOpen && viewingExpense && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm pointer-events-auto">
          <div className="bg-white rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.2)] border border-slate-200 w-[500px] p-8 flex flex-col gap-6 animate-fade-in pointer-events-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-150">
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-1.5">
                <span>📋</span> Expense Details
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
                <span className="text-slate-400 font-bold text-xs uppercase tracking-wider">Expense ID</span>
                <span className="col-span-2 font-mono font-bold text-primary text-xs">{viewingExpense.id}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-2 border-b border-slate-50">
                <span className="text-slate-400 font-bold text-xs uppercase tracking-wider">Date</span>
                <span className="col-span-2 text-slate-800">{formatDateDDMMYYYY(viewingExpense.expense_date)}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-2 border-b border-slate-50">
                <span className="text-slate-400 font-bold text-xs uppercase tracking-wider">Amount</span>
                <span className="col-span-2 font-black text-slate-800">
                  ₹ {parseFloat(viewingExpense.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-2 border-b border-slate-50">
                <span className="text-slate-400 font-bold text-xs uppercase tracking-wider">Particulars</span>
                <span className="col-span-2 text-slate-700 whitespace-pre-wrap">{viewingExpense.particulars}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-2 border-b border-slate-50">
                <span className="text-slate-400 font-bold text-xs uppercase tracking-wider">Entered By</span>
                <span className="col-span-2 text-slate-700">{viewingExpense.entered_by}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-2">
                <span className="text-slate-400 font-bold text-xs uppercase tracking-wider">Remarks</span>
                <span className="col-span-2 text-slate-500 italic whitespace-pre-wrap">{viewingExpense.remarks || '—'}</span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex gap-2">
              <button 
                onClick={() => {
                  setIsViewModalOpen(false);
                  handleOpenForm(viewingExpense);
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
              Are you sure you want to delete expense record <b>{deletingExpense?.id}</b>?
              <br/>This action cannot be undone.
            </p>
            <div className="flex flex-col gap-2 mt-8">
              <button 
                onClick={handleDelete}
                className="btn-premium bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-200"
              >
                Yes, Delete Expense
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

export default ExpenseHistory;
