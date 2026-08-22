import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';

const Expense = () => {
  const navigate = useNavigate();
  
  // Data states
  const [expenses, setExpenses] = useState([]);
  const [summary, setSummary] = useState({ totalAmount: 0, totalCount: 0 });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [todayDateStr, setTodayDateStr] = useState('');

  // Modal states
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null); // null = Create
  const [deletingExpense, setDeletingExpense] = useState(null);
  const [viewingExpense, setViewingExpense] = useState(null);

  // Form states
  const [formData, setFormData] = useState({
    expenseDate: '',
    particulars: '',
    amount: '',
    enteredBy: '',
    remarks: '',
    category: 'General',
    paymentMethod: 'Cash'
  });
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchTodayExpenses();
  }, [searchQuery]);

  const fetchTodayExpenses = async () => {
    try {
      setLoading(true);
      const res = await api.get('/expenses/today', {
        params: { search: searchQuery }
      });
      if (res.data.ok) {
        setExpenses(res.data.expenses || []);
        setSummary(res.data.summary || { totalAmount: 0, totalCount: 0 });
        if (res.data.todayStr) {
          setTodayDateStr(res.data.todayStr);
        }
      }
    } catch (err) {
      console.error('Failed to fetch today\'s expenses:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenForm = (expense = null) => {
    setFormError('');
    setFormSuccess('');
    
    // Default Name field to the logged-in administrator name
    const currentAdminUser = localStorage.getItem('kemps_username') || 'admin';
    const formattedAdminName = currentAdminUser.charAt(0).toUpperCase() + currentAdminUser.slice(1);

    if (expense) {
      setEditingExpense(expense);
      setFormData({
        expenseDate: expense.expense_date,
        particulars: expense.particulars,
        amount: expense.amount,
        enteredBy: expense.entered_by,
        remarks: expense.remarks || '',
        category: expense.category || 'General',
        paymentMethod: expense.payment_method || 'Cash'
      });
    } else {
      setEditingExpense(null);
      // Initialize with today's date in YYYY-MM-DD
      const now = new Date();
      const offset = now.getTimezoneOffset();
      const istDate = new Date(now.getTime() + (330 + offset) * 60000);
      const yyyy = istDate.getFullYear();
      const mm = String(istDate.getMonth() + 1).padStart(2, '0');
      const dd = String(istDate.getDate()).padStart(2, '0');
      const todayFormatted = `${yyyy}-${mm}-${dd}`;

      setFormData({
        expenseDate: todayFormatted,
        particulars: '',
        amount: '',
        enteredBy: formattedAdminName,
        remarks: '',
        category: 'General',
        paymentMethod: 'Cash'
      });
    }
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
      remarks: '',
      category: 'General',
      paymentMethod: 'Cash'
    });
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name === 'amount') {
      // Prevent negative amounts in input typing
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
    if (!enteredBy.trim()) return setFormError('Name (Entered By) is required.');

    setIsSaving(true);
    try {
      let res;
      if (editingExpense) {
        res = await api.put(`/expenses/${editingExpense.id}`, formData);
      } else {
        res = await api.post('/expenses', formData);
      }

      if (res.data.ok) {
        setFormSuccess(editingExpense ? 'Expense updated successfully!' : 'Expense recorded successfully!');
        setTimeout(() => {
          handleCloseForm();
          fetchTodayExpenses();
        }, 1000);
      } else {
        setFormError(res.data.error || 'Failed to save expense.');
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
        fetchTodayExpenses();
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

  // Date formatter to convert YYYY-MM-DD into DD/MM/YYYY
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

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* HEADER & TOP ACTIONS */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">EXPENSE MANAGEMENT</h1>
          <p className="text-slate-500 text-sm font-medium mt-1">Manage and track daily business expenses</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => handleOpenForm()}
            className="btn-premium btn-primary-premium h-12"
          >
            <span className="text-xl">+</span> Add Expense
          </button>
          <button 
            onClick={() => navigate('/expense-history')}
            className="btn-premium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs px-4 h-12"
          >
            Expense History
          </button>
        </div>
      </div>

      {/* SUMMARY CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Total Expense Card */}
        <div className="card-premium flex items-center justify-between">
          <div>
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Today's Total Expense</p>
            <h3 className="text-2xl font-extrabold text-[#0f172a] mt-1.5">
              ₹ {summary.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h3>
          </div>
          <div className="w-12 h-12 bg-red-50 text-red-500 rounded-xl flex items-center justify-center text-xl font-bold border border-red-100">
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
              placeholder="Search today's expenses..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-premium pl-11 h-10 w-full"
            />
          </div>
          <div className="text-[12px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-3.5 py-1.5 rounded-lg border border-slate-100">
            Today's Expenses — {todayDateStr ? formatDateDDMMYYYY(todayDateStr) : formatDateDDMMYYYY(new Date().toISOString().split('T')[0])}
          </div>
        </div>

        {/* Table Listing */}
        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="table table-zebra w-full overflow-hidden">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr className="text-slate-500 text-[11px] font-black uppercase tracking-wider">
                <th className="py-4 px-6 text-left">Expense ID</th>
                <th className="py-4 px-6 text-left">Date</th>
                <th className="py-4 px-6 text-left">Category</th>
                <th className="py-4 px-6 text-left">Particulars</th>
                <th className="py-4 px-6 text-left">Amount (₹)</th>
                <th className="py-4 px-6 text-left">Method</th>
                <th className="py-4 px-6 text-center">Status</th>
                <th className="py-4 px-6 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr>
                  <td colSpan="8" className="py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                       <span className="loading loading-spinner text-primary"></span>
                       <span className="text-slate-400 text-sm font-medium">Loading today's expenses...</span>
                    </div>
                  </td>
                </tr>
              ) : expenses.length === 0 ? (
                <tr>
                  <td colSpan="8" className="py-20 text-center text-slate-400 font-medium italic">
                    {searchQuery ? 'No matching expenses found for today.' : 'No expenses recorded today.'}
                  </td>
                </tr>
              ) : (
                expenses.map((exp) => {
                  const editable = exp.payment_status === 'Pending Approval';
                  const lockMsg = "This expense has already been approved and posted to accounts. Please create an adjustment or reversal entry.";
                  return (
                    <tr key={exp.id} className="hover:bg-blue-50/30 transition-colors group">
                      <td className="py-4 px-6 text-[13px] font-mono font-bold text-primary">{exp.id}</td>
                      <td className="py-4 px-6 text-[13px] font-medium text-slate-550">{formatDateDDMMYYYY(exp.expense_date)}</td>
                      <td className="py-4 px-6 text-[13px] font-semibold text-slate-600">{exp.category || 'General'}</td>
                      <td className="py-4 px-6 text-[14px] font-bold text-slate-700 max-w-[200px] truncate" title={exp.particulars}>{exp.particulars}</td>
                      <td className="py-4 px-6 text-[14px] font-black text-slate-800">
                        ₹ {parseFloat(exp.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-4 px-6 text-[13px] font-semibold text-slate-600">{exp.payment_method || 'Cash'}</td>
                      <td className="py-4 px-6 text-center">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold ${
                          exp.payment_status === 'Approved' ? 'bg-emerald-50 text-emerald-600' :
                          exp.payment_status === 'Pending Approval' ? 'bg-amber-50 text-amber-600' :
                          exp.payment_status === 'Rejected' ? 'bg-rose-50 text-rose-600' :
                          'bg-slate-50 text-slate-500'
                        }`}>
                          {(exp.payment_status || 'Pending Approval').toUpperCase()}
                        </span>
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
                            disabled={!editable}
                            className="btn btn-ghost btn-xs text-primary hover:bg-primary/10 rounded-lg px-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            title={!editable ? lockMsg : "Edit record"}
                          >
                            Edit
                          </button>
                          <button 
                            onClick={() => confirmDelete(exp)}
                            disabled={!editable}
                            className="btn btn-ghost btn-xs text-red-500 hover:bg-red-50 rounded-lg px-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            title={!editable ? lockMsg : "Delete record"}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ADD / EDIT EXPENSE MODAL */}
      {isFormModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm pointer-events-auto">
          <div className="bg-white rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.2)] border border-slate-200 w-[600px] max-h-[90vh] h-[580px] flex flex-col overflow-hidden animate-fade-in pointer-events-auto">
            {/* Header */}
            <div className="bg-primary p-7 text-white shrink-0 relative">
              <h3 className="text-2xl font-black italic tracking-tight uppercase">
                {editingExpense ? 'Edit Expense Record' : 'Add Expense Entry'}
              </h3>
              <p className="text-blue-100 text-xs mt-1 font-medium italic opacity-85">
                {editingExpense ? `Modifying record: ${editingExpense.id}` : 'Fill in the details to record a new business expense'}
              </p>
              <button 
                onClick={handleCloseForm}
                className="absolute right-7 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-all font-bold"
              >
                ✕
              </button>
            </div>

            {/* Scrollable Form Content */}
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
              <form id="expenseForm" onSubmit={handleSave} className="space-y-6">
                
                {/* Visual Frame styled like the requested design language */}
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

                    {/* Category */}
                    <div className="space-y-1.5">
                      <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                        Category *
                      </label>
                      <select 
                        name="category"
                        value={formData.category}
                        onChange={handleInputChange}
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                        required
                      >
                        <option value="General">General</option>
                        <option value="Raw Material">Raw Material</option>
                        <option value="Transport">Transport</option>
                        <option value="Maintenance">Maintenance</option>
                        <option value="Office Supplies">Office Supplies</option>
                        <option value="Printing & Stationery">Printing & Stationery</option>
                        <option value="Salary/Wages">Salary/Wages</option>
                        <option value="Rent">Rent</option>
                        <option value="Electricity">Electricity</option>
                        <option value="Others">Others</option>
                      </select>
                    </div>

                    {/* Payment Method */}
                    <div className="space-y-1.5">
                      <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                        Payment Method *
                      </label>
                      <select 
                        name="paymentMethod"
                        value={formData.paymentMethod}
                        onChange={handleInputChange}
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                        required
                      >
                        <option value="Cash">Cash</option>
                        <option value="UPI">UPI</option>
                        <option value="Bank">Bank</option>
                      </select>
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

                {/* Feedback Messages */}
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

            {/* Modal Sticky Footer */}
            <div className="p-8 border-t border-slate-100 bg-white flex gap-4 shrink-0 shadow-[0_-10px_30px_rgba(0,0,0,0.02)]">
              <button 
                type="submit" 
                form="expenseForm"
                disabled={isSaving}
                className="btn-premium btn-primary-premium flex-[2] h-14 text-sm uppercase tracking-wider"
              >
                {isSaving ? <span className="loading loading-spinner"></span> : 'Save Expense'}
              </button>
              <button 
                type="button" 
                onClick={() => {
                  if (editingExpense) {
                    setFormData({
                      expenseDate: editingExpense.expense_date,
                      particulars: editingExpense.particulars,
                      amount: editingExpense.amount,
                      enteredBy: editingExpense.entered_by,
                      remarks: editingExpense.remarks || ''
                    });
                  } else {
                    const currentAdminUser = localStorage.getItem('kemps_username') || 'admin';
                    const formattedAdminName = currentAdminUser.charAt(0).toUpperCase() + currentAdminUser.slice(1);
                    setFormData({
                      expenseDate: new Date().toISOString().split('T')[0],
                      particulars: '',
                      amount: '',
                      enteredBy: formattedAdminName,
                      remarks: ''
                    });
                  }
                  setFormError('');
                  setFormSuccess('');
                }}
                className="btn-premium bg-slate-50 text-slate-500 hover:bg-slate-100 border border-slate-200 flex-1 h-14 text-sm font-bold uppercase tracking-wider"
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
          <div className="bg-white rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.2)] border border-slate-200 w-[500px] p-8 flex flex-col gap-6 max-h-[90vh] overflow-y-auto animate-fade-in pointer-events-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-150">
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-1.5">
                <span>📋</span> Expense Details
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
                <span className="text-slate-400 font-bold text-xs uppercase tracking-wider">Expense ID</span>
                <span className="col-span-2 font-mono font-bold text-primary text-xs">{viewingExpense.id}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-2 border-b border-slate-50">
                <span className="text-slate-400 font-bold text-xs uppercase tracking-wider">Category</span>
                <span className="col-span-2 text-slate-800">{viewingExpense.category || 'General'}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-2 border-b border-slate-50">
                <span className="text-slate-400 font-bold text-xs uppercase tracking-wider">Amount</span>
                <span className="col-span-2 font-black text-slate-800">
                  ₹ {parseFloat(viewingExpense.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-2 border-b border-slate-50">
                <span className="text-slate-400 font-bold text-xs uppercase tracking-wider">Payment Method</span>
                <span className="col-span-2 text-slate-800">{viewingExpense.payment_method || 'Cash'}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-2 border-b border-slate-50">
                <span className="text-slate-400 font-bold text-xs uppercase tracking-wider">Status</span>
                <span className={`col-span-2 px-2 py-0.5 rounded text-[9px] font-extrabold w-fit ${
                  viewingExpense.payment_status === 'Approved' ? 'bg-emerald-50 text-emerald-600' :
                  viewingExpense.payment_status === 'Pending Approval' ? 'bg-amber-50 text-amber-600' :
                  viewingExpense.payment_status === 'Rejected' ? 'bg-rose-50 text-rose-600' :
                  'bg-slate-50 text-slate-500'
                }`}>
                  {(viewingExpense.payment_status || 'Pending Approval').toUpperCase()}
                </span>
              </div>
              
              {viewingExpense.payment_status === 'Rejected' && (
                <>
                  <div className="grid grid-cols-3 gap-2 py-2 border-b border-slate-50">
                    <span className="text-slate-400 font-bold text-xs uppercase tracking-wider">Reason</span>
                    <span className="col-span-2 text-rose-600 font-semibold">{viewingExpense.rejection_reason || 'No reason provided'}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 py-2 border-b border-slate-50">
                    <span className="text-slate-400 font-bold text-xs uppercase tracking-wider">Rejected By</span>
                    <span className="col-span-2 text-slate-700">{viewingExpense.rejected_by || 'Admin'}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 py-2 border-b border-slate-50">
                    <span className="text-slate-400 font-bold text-xs uppercase tracking-wider">Rejected Date</span>
                    <span className="col-span-2 text-slate-700">{viewingExpense.rejected_date || '—'}</span>
                  </div>
                </>
              )}

              <div className="grid grid-cols-3 gap-2 py-2 border-b border-slate-50">
                <span className="text-slate-400 font-bold text-xs uppercase tracking-wider">Date</span>
                <span className="col-span-2 text-slate-800">{formatDateDDMMYYYY(viewingExpense.expense_date)}</span>
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
                disabled={viewingExpense.payment_status !== 'Pending Approval'}
                onClick={() => {
                  setIsViewModalOpen(false);
                  handleOpenForm(viewingExpense);
                }}
                className="btn-premium btn-primary-premium flex-1 h-11 text-xs uppercase disabled:opacity-50 disabled:cursor-not-allowed"
                title={viewingExpense.payment_status !== 'Pending Approval' ? "Approved or Rejected records are locked" : "Edit record"}
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

export default Expense;
