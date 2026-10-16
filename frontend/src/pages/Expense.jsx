import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';

const Expense = () => {
  const navigate = useNavigate();

  // ── Auth ──────────────────────────────────────────────────────────────────
  const currentUser = localStorage.getItem('kemps_username') || 'admin';
  const isAdmin = currentUser === 'admin';

  // ── Data states ────────────────────────────────────────────────────────────
  const [expenses, setExpenses] = useState([]);
  const [summary, setSummary] = useState({ totalAmount: 0, totalCount: 0 });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [todayDateStr, setTodayDateStr] = useState('');

  // ── Modal states ───────────────────────────────────────────────────────────
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [deletingExpense, setDeletingExpense] = useState(null);
  const [viewingExpense, setViewingExpense] = useState(null);

  // ── Form states ────────────────────────────────────────────────────────────
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
      const res = await api.get('/expenses/today', { params: { search: searchQuery } });
      if (res.data.ok) {
        setExpenses(res.data.expenses || []);
        setSummary(res.data.summary || { totalAmount: 0, totalCount: 0 });
        if (res.data.todayStr) setTodayDateStr(res.data.todayStr);
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
    const rawUser = localStorage.getItem('kemps_username') || 'admin';
    const formattedName = rawUser.charAt(0).toUpperCase() + rawUser.slice(1);

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
      const now = new Date();
      const offset = now.getTimezoneOffset();
      const ist = new Date(now.getTime() + (330 + offset) * 60000);
      const yyyy = ist.getFullYear();
      const mm = String(ist.getMonth() + 1).padStart(2, '0');
      const dd = String(ist.getDate()).padStart(2, '0');
      setFormData({
        expenseDate: `${yyyy}-${mm}-${dd}`,
        particulars: '',
        amount: '',
        enteredBy: formattedName,
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
    setFormData({ expenseDate: '', particulars: '', amount: '', enteredBy: '', remarks: '', category: 'General', paymentMethod: 'Cash' });
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name === 'amount') {
      setFormData(prev => ({ ...prev, [name]: value.replace(/[^0-9.]/g, '') }));
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
    if (isNaN(parsedAmount) || parsedAmount <= 0) return setFormError('Amount must be a positive number greater than 0.');
    if (!enteredBy.trim()) return setFormError('Name (Entered By) is required.');
    setIsSaving(true);
    try {
      const res = editingExpense
        ? await api.put(`/expenses/${editingExpense.id}`, formData)
        : await api.post('/expenses', formData);
      if (res.data.ok) {
        setFormSuccess(editingExpense ? 'Expense updated successfully!' : 'Expense recorded successfully!');
        setTimeout(() => { handleCloseForm(); fetchTodayExpenses(); }, 1000);
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
      if (res.data.ok) { setIsDeleteModalOpen(false); setDeletingExpense(null); fetchTodayExpenses(); }
      else alert(res.data.error || 'Failed to delete expense.');
    } catch (err) { alert(`Delete failed: ${err.message}`); }
  };

  const handleOpenView = (expense) => { setViewingExpense(expense); setIsViewModalOpen(true); };

  const formatDateDDMMYYYY = (dateStr) => {
    if (!dateStr) return '—';
    const parts = dateStr.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    const date = new Date(dateStr);
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
  };

  // ── Status badge helper ────────────────────────────────────────────────────
  const StatusBadge = ({ status }) => {
    const cfg = {
      Approved:          { cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200', dot: 'bg-emerald-500', label: 'APPROVED' },
      'Pending Approval':{ cls: 'bg-amber-50 text-amber-700 border border-amber-200',   dot: 'bg-amber-500',   label: 'PENDING' },
      Rejected:          { cls: 'bg-rose-50 text-rose-700 border border-rose-200',       dot: 'bg-rose-500',   label: 'REJECTED' }
    };
    const s = cfg[status] || cfg['Pending Approval'];
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold tracking-wider ${s.cls}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`}></span>
        {s.label}
      </span>
    );
  };

  // ── Category icon ──────────────────────────────────────────────────────────
  const categoryIcon = (cat) => {
    const m = { General: '📌', 'Raw Material': '🧱', Transport: '🚛', Maintenance: '🔧',
      'Office Supplies': '📎', 'Printing & Stationery': '🖨', 'Salary/Wages': '👷', Rent: '🏢',
      Electricity: '⚡', Others: '📦' };
    return m[cat] || '📌';
  };

  // ── Locked edit message ────────────────────────────────────────────────────
  const LOCK_MSG = 'This expense has been approved and posted. It is now locked for editing.';

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto pb-12">

      {/* ── HEADER ── */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-blue-700 flex items-center justify-center text-white text-sm shadow-md shadow-primary/30">
              💸
            </div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase">Expense Management</h1>
          </div>
          <p className="text-slate-500 text-sm font-medium ml-10">Manage and track daily business expenses</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => handleOpenForm()}
            className="btn-premium btn-primary-premium h-12 text-sm gap-2 shadow-lg shadow-primary/20"
          >
            <span className="text-lg font-bold">+</span> Add Expense
          </button>
          <button
            onClick={() => navigate('/expense-history')}
            className="btn-premium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs px-5 h-12 gap-2"
          >
            <span>📜</span> Expense History
          </button>
        </div>
      </div>

      {/* ── SUMMARY CARDS ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Total Expense */}
        <div className="relative overflow-hidden bg-gradient-to-br from-rose-500 to-rose-600 rounded-2xl p-6 shadow-lg shadow-rose-200">
          <div className="absolute right-4 top-4 w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center text-3xl font-black text-white/70">₹</div>
          <p className="text-[11px] font-black text-rose-100 uppercase tracking-widest mb-2">Today's Total Expense</p>
          <h3 className="text-3xl font-extrabold text-white">
            ₹ {summary.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </h3>
          <p className="text-rose-200 text-xs font-semibold mt-1.5">
            {summary.totalCount} {summary.totalCount === 1 ? 'transaction' : 'transactions'} today
          </p>
        </div>

        {/* Total Entries */}
        <div className="relative overflow-hidden bg-gradient-to-br from-primary to-blue-700 rounded-2xl p-6 shadow-lg shadow-blue-200">
          <div className="absolute right-4 top-4 w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center text-3xl font-black text-white/70">📊</div>
          <p className="text-[11px] font-black text-blue-100 uppercase tracking-widest mb-2">Number of Entries</p>
          <h3 className="text-3xl font-extrabold text-white">
            {summary.totalCount} <span className="text-2xl">{summary.totalCount === 1 ? 'Entry' : 'Entries'}</span>
          </h3>
          <p className="text-blue-200 text-xs font-semibold mt-1.5">
            {todayDateStr ? formatDateDDMMYYYY(todayDateStr) : '—'}
          </p>
        </div>
      </div>

      {/* ── TABLE CARD ── */}
      <div className="bg-white border border-slate-200/60 rounded-2xl shadow-sm overflow-hidden">

        {/* Table header toolbar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-6 py-4 border-b border-slate-100 bg-slate-50/60">
          <div className="relative flex-1 max-w-sm">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
            <input
              type="text"
              placeholder="Search today's expenses..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-10 pl-10 pr-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Today's Expenses</span>
            <span className="px-3 py-1.5 bg-primary/5 border border-primary/15 text-primary rounded-lg text-[11px] font-extrabold">
              {todayDateStr ? formatDateDDMMYYYY(todayDateStr) : formatDateDDMMYYYY(new Date().toISOString().split('T')[0])}
            </span>
            {!isAdmin && (
              <span className="px-2.5 py-1 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg text-[10px] font-extrabold flex items-center gap-1">
                🔒 View only
              </span>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 text-[10px] font-black text-slate-500 uppercase tracking-wider border-b border-slate-100">
                <th className="py-3.5 px-5">Expense ID</th>
                <th className="py-3.5 px-5">Date</th>
                <th className="py-3.5 px-5">Category</th>
                <th className="py-3.5 px-5">Particulars</th>
                <th className="py-3.5 px-5">Amount (₹)</th>
                <th className="py-3.5 px-5">Method</th>
                <th className="py-3.5 px-5 text-center">Status</th>
                <th className="py-3.5 px-5 text-center">Actions</th>
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
                  <td colSpan="8" className="py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center text-2xl">💸</div>
                      <p className="text-slate-400 font-semibold text-sm">{searchQuery ? 'No matching expenses found for today.' : 'No expenses recorded today.'}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                expenses.map((exp) => {
                  return (
                    <tr key={exp.id} className="hover:bg-blue-50/20 transition-colors group">
                      <td className="py-4 px-5">
                        <span className="font-mono font-bold text-primary text-xs bg-primary/5 px-2 py-0.5 rounded border border-primary/15">{exp.id}</span>
                      </td>
                      <td className="py-4 px-5 text-[13px] font-semibold text-slate-500">{formatDateDDMMYYYY(exp.expense_date)}</td>
                      <td className="py-4 px-5">
                        <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-slate-600">
                          <span>{categoryIcon(exp.category)}</span>
                          {exp.category || 'General'}
                        </span>
                      </td>
                      <td className="py-4 px-5 text-[13px] font-bold text-slate-700 max-w-[200px] truncate" title={exp.particulars}>
                        {exp.particulars}
                      </td>
                      <td className="py-4 px-5">
                        <span className="text-[14px] font-black text-slate-800">
                          ₹ {parseFloat(exp.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </td>
                      <td className="py-4 px-5">
                        <span className="text-[12px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                          {exp.payment_method || 'Cash'}
                        </span>
                      </td>
                      <td className="py-4 px-5 text-center">
                        <StatusBadge status={exp.payment_status} />
                      </td>
                      <td className="py-4 px-5">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* View — always visible */}
                          <button
                            onClick={() => handleOpenView(exp)}
                            className="px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 font-bold text-xs transition-all"
                          >
                            👁 View
                          </button>

                          {/* Edit — admin only, always active */}
                          {isAdmin && (
                            <button
                              onClick={() => handleOpenForm(exp)}
                              className="px-3 py-1.5 rounded-lg bg-primary/5 hover:bg-primary/10 border border-primary/20 text-primary font-bold text-xs transition-all"
                              title="Edit record (Admin)"
                            >
                              ✏️ Edit
                            </button>
                          )}

                          {/* Delete — admin only, always active */}
                          {isAdmin && (
                            <button
                              onClick={() => confirmDelete(exp)}
                              className="px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-600 font-bold text-xs transition-all"
                              title="Delete record (Admin)"
                            >
                              🗑 Delete
                            </button>
                          )}
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

      {/* ══════════════════════════════════════════════════════════════════════
          ADD / EDIT EXPENSE MODAL
      ══════════════════════════════════════════════════════════════════════ */}
      {isFormModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-[0_30px_80px_rgba(0,0,0,0.22)] border border-slate-200 w-[620px] max-h-[90vh] flex flex-col overflow-hidden animate-fade-in">
            {/* Header */}
            <div className="relative bg-gradient-to-r from-primary to-blue-700 p-7 text-white shrink-0 overflow-hidden">
              <div className="absolute -right-6 -top-6 w-28 h-28 bg-white/10 rounded-full"></div>
              <div className="absolute -right-2 top-10 w-14 h-14 bg-white/10 rounded-full"></div>
              <div className="relative z-10">
                <div className="flex items-center gap-2.5 mb-1">
                  <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center text-base">💸</div>
                  <h3 className="text-xl font-black tracking-tight uppercase">
                    {editingExpense ? 'Edit Expense Record' : 'Add Expense Entry'}
                  </h3>
                </div>
                <p className="text-blue-100 text-xs font-medium opacity-90 ml-10">
                  {editingExpense ? `Modifying record: ${editingExpense.id}` : 'Fill in the details to record a new business expense'}
                </p>
              </div>
              <button
                onClick={handleCloseForm}
                className="absolute right-6 top-6 w-9 h-9 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center text-white font-bold transition-all"
              >✕</button>
            </div>

            {/* Form body */}
            <div className="flex-1 overflow-y-auto p-7">
              <form id="expenseForm" onSubmit={handleSave} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Date */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-black text-slate-500 block uppercase tracking-wider">Date *</label>
                    <input type="date" name="expenseDate" value={formData.expenseDate} onChange={handleInputChange}
                      className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium" required />
                  </div>

                  {/* Amount */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-black text-slate-500 block uppercase tracking-wider">Amount (₹) *</label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">₹</span>
                      <input type="text" name="amount" value={formData.amount} onChange={handleInputChange} placeholder="0.00"
                        className="w-full h-11 pl-8 pr-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium" required />
                    </div>
                  </div>

                  {/* Category */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-black text-slate-500 block uppercase tracking-wider">Category *</label>
                    <select name="category" value={formData.category} onChange={handleInputChange}
                      className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium" required>
                      <option value="General">📌 General</option>
                      <option value="Raw Material">🧱 Raw Material</option>
                      <option value="Transport">🚛 Transport</option>
                      <option value="Maintenance">🔧 Maintenance</option>
                      <option value="Office Supplies">📎 Office Supplies</option>
                      <option value="Printing & Stationery">🖨 Printing &amp; Stationery</option>
                      <option value="Salary/Wages">👷 Salary/Wages</option>
                      <option value="Rent">🏢 Rent</option>
                      <option value="Electricity">⚡ Electricity</option>
                      <option value="Others">📦 Others</option>
                    </select>
                  </div>

                  {/* Payment Method */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-black text-slate-500 block uppercase tracking-wider">Payment Method *</label>
                    <select name="paymentMethod" value={formData.paymentMethod} onChange={handleInputChange}
                      className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium" required>
                      <option value="Cash">💵 Cash</option>
                      <option value="UPI">📱 UPI</option>
                      <option value="Bank">🏦 Bank</option>
                    </select>
                  </div>

                  {/* Particulars */}
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-[11px] font-black text-slate-500 block uppercase tracking-wider">Particulars *</label>
                    <input type="text" name="particulars" value={formData.particulars} onChange={handleInputChange}
                      placeholder="What was the expense for?"
                      className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium" required />
                  </div>

                  {/* Entered By */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-black text-slate-500 block uppercase tracking-wider">Entered By *</label>
                    <input type="text" name="enteredBy" value={formData.enteredBy} onChange={handleInputChange}
                      placeholder="Who recorded this?"
                      className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium" required />
                  </div>

                  {/* Remarks */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-black text-slate-500 block uppercase tracking-wider">Remarks</label>
                    <input type="text" name="remarks" value={formData.remarks} onChange={handleInputChange}
                      placeholder="Optional notes..."
                      className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium" />
                  </div>
                </div>

                {formError && (
                  <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-xs font-semibold flex items-center gap-2 border border-red-100">
                    <span>⚠️</span><span>{formError}</span>
                  </div>
                )}
                {formSuccess && (
                  <div className="bg-emerald-50 text-emerald-600 px-4 py-3 rounded-xl text-xs font-semibold flex items-center gap-2 border border-emerald-100">
                    <span>✅</span><span>{formSuccess}</span>
                  </div>
                )}
              </form>
            </div>

            {/* Footer */}
            <div className="px-7 py-5 border-t border-slate-100 bg-white flex gap-3 shrink-0">
              <button type="submit" form="expenseForm" disabled={isSaving}
                className="btn-premium btn-primary-premium flex-[2] h-12 text-sm uppercase tracking-wider shadow-md shadow-primary/20">
                {isSaving ? <span className="loading loading-spinner"></span> : '💾 Save Expense'}
              </button>
              <button type="button" onClick={handleCloseForm}
                className="btn-premium bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200 flex-1 h-12 text-sm font-bold uppercase tracking-wider">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          VIEW DETAILS MODAL  (redesigned + admin-gate on Edit Record)
      ══════════════════════════════════════════════════════════════════════ */}
      {isViewModalOpen && viewingExpense && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-[0_30px_80px_rgba(0,0,0,0.22)] border border-slate-200 w-[520px] max-h-[90vh] overflow-y-auto animate-fade-in">

            {/* Modal top accent */}
            <div className="relative bg-gradient-to-r from-slate-800 to-slate-900 rounded-t-3xl p-6 text-white overflow-hidden">
              <div className="absolute -right-4 -top-4 w-20 h-20 bg-white/5 rounded-full"></div>
              <div className="absolute right-8 top-10 w-10 h-10 bg-white/5 rounded-full"></div>
              <div className="flex items-start justify-between relative z-10">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl">📋</span>
                    <h3 className="text-lg font-black uppercase tracking-tight">Expense Details</h3>
                  </div>
                  <span className="font-mono text-xs font-bold text-slate-400 bg-slate-700 px-2.5 py-1 rounded-lg">
                    {viewingExpense.id}
                  </span>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <StatusBadge status={viewingExpense.payment_status} />
                  <button
                    onClick={() => setIsViewModalOpen(false)}
                    className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-300 hover:text-white transition-all text-sm font-bold"
                  >✕</button>
                </div>
              </div>
            </div>

            {/* Details grid */}
            <div className="p-6 space-y-0">

              {/* Amount highlight */}
              <div className="bg-gradient-to-r from-primary/5 to-blue-50 border border-primary/15 rounded-2xl p-4 mb-4 flex justify-between items-center">
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-0.5">Amount</p>
                  <p className="text-2xl font-extrabold text-slate-800">
                    ₹ {parseFloat(viewingExpense.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-0.5">Category</p>
                  <p className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
                    <span>{categoryIcon(viewingExpense.category)}</span>
                    {viewingExpense.category || 'General'}
                  </p>
                </div>
              </div>

              {/* Detail rows */}
              {[
                { label: 'Date', value: formatDateDDMMYYYY(viewingExpense.expense_date) },
                { label: 'Particulars', value: viewingExpense.particulars },
                { label: 'Payment Method', value: viewingExpense.payment_method || 'Cash' },
                { label: 'Entered By', value: viewingExpense.entered_by },
                { label: 'Remarks', value: viewingExpense.remarks || '—', muted: !viewingExpense.remarks }
              ].map(({ label, value, muted }) => (
                <div key={label} className="flex items-start justify-between py-3 border-b border-slate-50 last:border-0">
                  <span className="text-[11px] font-black text-slate-400 uppercase tracking-wider w-32 shrink-0">{label}</span>
                  <span className={`text-sm font-semibold text-right flex-1 ${muted ? 'text-slate-400 italic' : 'text-slate-700'}`}>
                    {value}
                  </span>
                </div>
              ))}

              {/* Rejection detail */}
              {viewingExpense.payment_status === 'Rejected' && (
                <div className="mt-3 bg-rose-50 border border-rose-100 rounded-xl p-4 space-y-2 text-xs font-semibold text-rose-700">
                  <div className="flex justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider">Rejection Reason</span>
                    <span className="text-right">{viewingExpense.rejection_reason || 'No reason provided'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider">Rejected By</span>
                    <span>{viewingExpense.rejected_by || 'Admin'}</span>
                  </div>
                </div>
              )}

              {/* Admin notice if non-admin user */}
              {!isAdmin && (
                <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-2.5 text-amber-700 text-xs font-bold">
                  <span className="text-base">🔒</span>
                  <span>You have view-only access. Contact admin to make changes.</span>
                </div>
              )}
            </div>

            {/* Footer actions */}
            <div className="px-6 pb-6 flex gap-3">
              {/* Edit Record — admin only, always active */}
              {isAdmin && (
                <button
                  onClick={() => { setIsViewModalOpen(false); handleOpenForm(viewingExpense); }}
                  className="flex-1 h-11 px-5 rounded-xl bg-primary hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider shadow-md shadow-primary/20 transition-all flex items-center justify-center gap-2"
                  title="Edit record (Admin)"
                >
                  ✏️ Edit Record
                </button>
              )}

              {/* Delete — admin only, always active */}
              {isAdmin && (
                <button
                  onClick={() => { setIsViewModalOpen(false); confirmDelete(viewingExpense); }}
                  className="h-11 px-4 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-600 font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5"
                  title="Delete record (Admin)"
                >
                  🗑 Delete
                </button>
              )}

              <button
                onClick={() => setIsViewModalOpen(false)}
                className="flex-1 h-11 px-5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          DELETE CONFIRM MODAL
      ══════════════════════════════════════════════════════════════════════ */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.2)] border border-slate-200 w-[400px] p-8 animate-fade-in">
            <div className="w-16 h-16 bg-rose-50 border-2 border-rose-100 text-rose-500 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-5">
              ⚠️
            </div>
            <h3 className="text-xl font-black text-center text-slate-800 mb-2">Confirm Deletion</h3>
            <p className="text-center text-slate-500 text-sm font-medium">
              Are you sure you want to delete expense record{' '}
              <span className="font-mono font-bold text-rose-600">{deletingExpense?.id}</span>?<br/>
              <span className="text-xs text-slate-400 mt-1 block">This action cannot be undone.</span>
            </p>
            <div className="flex gap-3 mt-7">
              <button
                onClick={handleDelete}
                className="flex-1 h-12 bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 text-white font-bold text-sm rounded-xl shadow-lg shadow-rose-200 transition-all uppercase tracking-wider"
              >
                Yes, Delete
              </button>
              <button
                onClick={() => setIsDeleteModalOpen(false)}
                className="flex-1 h-12 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-sm rounded-xl transition-all uppercase tracking-wider"
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

export default Expense;
