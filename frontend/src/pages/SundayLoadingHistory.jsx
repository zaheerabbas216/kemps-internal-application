import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import SearchableSelect from '../components/SearchableSelect';

// Helper for formatting INR Currency
const formatINR = (val) =>
  `₹ ${parseFloat(val || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const fmtDate = (dateStr) => {
  if (!dateStr) return '—';
  const [y, m, d] = String(dateStr).split('T')[0].split('-');
  return `${d}/${m}/${y}`;
};

const SundayLoadingHistory = () => {
  const navigate = useNavigate();

  // Filter States
  const [search, setSearch] = useState('');
  const [productId, setProductId] = useState('All');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const limit = 15;

  // Data States
  const [records, setRecords] = useState([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [summary, setSummary] = useState({
    totalAmount: 0,
    totalPaid: 0,
    totalDue: 0,
    totalQuantity: 0,
    totalCash: 0,
    totalUpi: 0,
    totalBank: 0,
    recordCount: 0
  });
  const [loading, setLoading] = useState(true);

  // Dropdowns for filters
  const [finishedProducts, setFinishedProducts] = useState([]);

  // Modal States
  const [viewRecord, setViewRecord] = useState(null);
  const [editRecord, setEditRecord] = useState(null);
  const [deleteRecord, setDeleteRecord] = useState(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editFeedback, setEditFeedback] = useState({ type: '', message: '' });

  // Fetch finished products for dropdown filter
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const res = await api.get('/finished-products?limit=1000');
        if (res.data.products) {
          setFinishedProducts(res.data.products);
        }
      } catch (err) {
        console.error('Failed to load products for filter:', err);
      }
    };
    fetchProducts();
  }, []);

  // Fetch History Records
  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/sunday-loading', {
        params: {
          page: currentPage,
          limit,
          search,
          productId: productId !== 'All' ? productId : '',
          startDate,
          endDate
        }
      });

      if (res.data.ok) {
        setRecords(res.data.records || []);
        setTotalRecords(res.data.total || 0);
        setTotalPages(res.data.totalPages || 1);
        setSummary(res.data.summary || {});
      }
    } catch (err) {
      console.error('Failed to fetch Sunday Loading history:', err);
    } finally {
      setLoading(false);
    }
  }, [currentPage, search, productId, startDate, endDate]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleFilterChange = (setter) => (e) => {
    setter(e.target.value);
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setSearch('');
    setProductId('All');
    setStartDate('');
    setEndDate('');
    setCurrentPage(1);
  };

  // Edit Modal Submission
  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editRecord) return;

    const qty = parseFloat(editRecord.quantity);
    const rate = parseFloat(editRecord.rate);
    const cash = Math.max(0, parseFloat(editRecord.cash_amount) || 0);
    const upi = Math.max(0, parseFloat(editRecord.upi_amount) || 0);
    const bank = Math.max(0, parseFloat(editRecord.bank_amount) || 0);

    const totalAmt = Math.round(qty * rate * 100) / 100;
    const totalPd = Math.round((cash + upi + bank) * 100) / 100;

    if (totalPd > totalAmt) {
      setEditFeedback({
        type: 'error',
        message: `Total payment (${formatINR(totalPd)}) cannot exceed Total Amount (${formatINR(totalAmt)}).`
      });
      return;
    }

    setIsSavingEdit(true);
    setEditFeedback({ type: '', message: '' });
    try {
      const res = await api.put(`/sunday-loading/${editRecord.id}`, {
        loadingDate: editRecord.loading_date,
        customerId: editRecord.customer_id,
        customerName: editRecord.customer_name,
        customerPhone: editRecord.customer_phone,
        customerAddress: editRecord.customer_address,
        customerType: editRecord.customer_type,
        productId: editRecord.product_id,
        productName: editRecord.product_name,
        quantity: qty,
        rate: rate,
        cashAmount: cash,
        upiAmount: upi,
        bankAmount: bank,
        notes: editRecord.notes
      });

      if (res.data.ok) {
        setEditRecord(null);
        fetchHistory();
      }
    } catch (err) {
      console.error('Failed to update record:', err);
      setEditFeedback({
        type: 'error',
        message: err.response?.data?.error || err.message || 'Failed to update record.'
      });
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Delete Handler
  const handleConfirmDelete = async () => {
    if (!deleteRecord) return;
    setIsDeleting(true);
    try {
      const res = await api.delete(`/sunday-loading/${deleteRecord.id}`);
      if (res.data.ok) {
        setDeleteRecord(null);
        fetchHistory();
      }
    } catch (err) {
      console.error('Failed to delete Sunday Loading record:', err);
      alert(err.response?.data?.error || err.message || 'Failed to delete record.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* ── HEADER CARD ─────────────────────────────────────────────────────────── */}
      <div className="card-premium p-6 sm:p-8 relative overflow-hidden bg-gradient-to-r from-slate-900 via-[#1e1b4b] to-[#0f172a] text-white">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-amber-500/10 to-transparent pointer-events-none"></div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-amber-500/20 text-amber-300 text-[10px] font-black tracking-widest uppercase px-3 py-1 rounded-full border border-amber-500/30">
                HISTORY &amp; AUDIT LOG
              </span>
              <span className="text-slate-400 text-xs font-semibold">Isolated Sunday Records</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-3">
              <span>📜</span> Sunday Loading History
            </h1>
            <p className="text-slate-300 text-xs sm:text-sm font-medium mt-1.5 max-w-2xl leading-relaxed">
              Complete searchable archive of all past Sunday vehicle loadings, individual receipts, and due balance tracking.
            </p>
          </div>

          <div className="flex items-center gap-3 self-start sm:self-center flex-wrap">
            <button
              type="button"
              onClick={() => navigate('/sunday-loading')}
              className="h-11 px-5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs transition-all shadow-md flex items-center gap-2 active:scale-95"
            >
              <span>+</span> New Sunday Loading
            </button>
            <button
              type="button"
              onClick={() => navigate('/sunday-dashboard')}
              className="h-11 px-4 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition-all border border-white/10 flex items-center gap-1.5 active:scale-95"
            >
              <span>☀️</span> Sunday Hub
            </button>
          </div>
        </div>
      </div>

      {/* ── SUMMARY KPI METRIC CARDS ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {/* Total Quantity */}
        <div className="card-premium p-4 border-amber-200 bg-amber-50/40">
          <span className="text-[10px] font-black text-amber-800 uppercase tracking-widest block">Total Loaded Qty</span>
          <p className="text-2xl font-black text-amber-900 mt-1">
            {loading ? '—' : summary.totalQuantity?.toLocaleString('en-IN')}{' '}
            <span className="text-xs font-semibold text-amber-700">Units</span>
          </p>
          <p className="text-[11px] text-slate-400 font-semibold mt-0.5">
            Across {summary.recordCount || 0} loading records
          </p>
        </div>

        {/* Total Amount */}
        <div className="card-premium p-4 border-blue-200 bg-blue-50/40">
          <span className="text-[10px] font-black text-blue-800 uppercase tracking-widest block">Total Loading Value</span>
          <p className="text-2xl font-black text-blue-900 mt-1">
            {loading ? '—' : formatINR(summary.totalAmount)}
          </p>
          <p className="text-[11px] text-slate-400 font-semibold mt-0.5">
            Sum of all transaction totals
          </p>
        </div>

        {/* Total Paid */}
        <div className="card-premium p-4 border-emerald-200 bg-emerald-50/40">
          <span className="text-[10px] font-black text-emerald-800 uppercase tracking-widest block">Total Collected</span>
          <p className="text-2xl font-black text-emerald-900 mt-1">
            {loading ? '—' : formatINR(summary.totalPaid)}
          </p>
          <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
            Cash: {formatINR(summary.totalCash)} | UPI: {formatINR(summary.totalUpi)}
          </p>
        </div>

        {/* Total Due */}
        <div className="card-premium p-4 border-red-200 bg-red-50/40">
          <span className="text-[10px] font-black text-red-800 uppercase tracking-widest block">Total Due Balance</span>
          <p className="text-2xl font-black text-red-900 mt-1">
            {loading ? '—' : formatINR(summary.totalDue)}
          </p>
          <p className="text-[11px] text-slate-400 font-semibold mt-0.5">
            Pending receivable balance
          </p>
        </div>
      </div>

      {/* ── FILTER BAR CARD ─────────────────────────────────────────────────── */}
      <div className="card-premium bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Search Box */}
          <div className="lg:col-span-2">
            <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
              Search Reference
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
              <input
                type="text"
                placeholder="Search by customer, phone, SL ref, or product..."
                value={search}
                onChange={handleFilterChange(setSearch)}
                className="w-full h-11 pl-9 pr-3 rounded-xl border border-slate-200 bg-white text-slate-800 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-xs font-semibold"
              />
            </div>
          </div>

          {/* Product Filter */}
          <div>
            <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
              Product Filter
            </label>
            <select
              value={productId}
              onChange={handleFilterChange(setProductId)}
              className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-slate-800 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-xs font-bold"
            >
              <option value="All">All Products</option>
              {finishedProducts.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* From Date */}
          <div>
            <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
              From Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={handleFilterChange(setStartDate)}
              className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-slate-800 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-xs font-semibold"
            />
          </div>

          {/* To Date */}
          <div>
            <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
              To Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={handleFilterChange(setEndDate)}
              className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-slate-800 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-xs font-semibold"
            />
          </div>
        </div>

        {(search || productId !== 'All' || startDate || endDate) && (
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={handleClearFilters}
              className="text-xs font-bold text-slate-500 hover:text-red-600 transition-colors flex items-center gap-1"
            >
              ✕ Clear All Filters
            </button>
          </div>
        )}
      </div>

      {/* ── HISTORY DATA TABLE ───────────────────────────────────────────────── */}
      <div className="card-premium bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-base font-black text-slate-800 tracking-tight flex items-center gap-2">
              <span>📋</span> Transaction Archive Records
            </h3>
            <p className="text-xs text-slate-400 font-semibold mt-0.5">
              Showing {records.length} of {totalRecords} records
            </p>
          </div>
          <button
            type="button"
            onClick={fetchHistory}
            className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold transition-colors flex items-center gap-1"
          >
            🔄 Refresh
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-[10px] font-black uppercase text-slate-500 tracking-wider">
                <th className="py-3 px-3">Txn No</th>
                <th className="py-3 px-3">Date</th>
                <th className="py-3 px-3">Customer</th>
                <th className="py-3 px-3">Product</th>
                <th className="py-3 px-2 text-center">Qty</th>
                <th className="py-3 px-3 text-right">Rate</th>
                <th className="py-3 px-3 text-right">Total (₹)</th>
                <th className="py-3 px-2 text-right">Cash</th>
                <th className="py-3 px-2 text-right">UPI</th>
                <th className="py-3 px-2 text-right">Bank</th>
                <th className="py-3 px-3 text-right">Paid (₹)</th>
                <th className="py-3 px-3 text-right">Due (₹)</th>
                <th className="py-3 px-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan="13" className="py-12 text-center text-slate-400">
                    <span className="loading loading-spinner text-primary"></span>
                    <p className="mt-2 text-xs font-semibold">Loading archive...</p>
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan="13" className="py-12 text-center text-slate-400 italic">
                    No Sunday Loading records found matching the filters.
                  </td>
                </tr>
              ) : (
                records.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                    {/* Txn No */}
                    <td className="py-3 px-3 font-mono font-bold text-primary whitespace-nowrap">
                      {r.transaction_number}
                    </td>

                    {/* Date */}
                    <td className="py-3 px-3 font-semibold text-slate-600 whitespace-nowrap">
                      {fmtDate(r.loading_date)}
                    </td>

                    {/* Customer */}
                    <td className="py-3 px-3 max-w-[170px]">
                      <p className="font-bold text-slate-800 truncate" title={r.customer_name}>
                        {r.customer_name}
                      </p>
                      {r.customer_phone && (
                        <p className="text-[11px] text-slate-400 font-mono truncate">{r.customer_phone}</p>
                      )}
                    </td>

                    {/* Product */}
                    <td className="py-3 px-3 font-semibold text-slate-800 max-w-[150px] truncate" title={r.product_name}>
                      {r.product_name}
                    </td>

                    {/* Quantity */}
                    <td className="py-3 px-2 text-center font-bold text-slate-900">
                      {r.quantity}
                    </td>

                    {/* Rate */}
                    <td className="py-3 px-3 text-right font-medium text-slate-600">
                      {formatINR(r.rate)}
                    </td>

                    {/* Total Amount */}
                    <td className="py-3 px-3 text-right font-black text-slate-900">
                      {formatINR(r.total_amount)}
                    </td>

                    {/* Cash */}
                    <td className="py-3 px-2 text-right font-semibold text-emerald-700">
                      {r.cash_amount > 0 ? formatINR(r.cash_amount) : '—'}
                    </td>

                    {/* UPI */}
                    <td className="py-3 px-2 text-right font-semibold text-indigo-700">
                      {r.upi_amount > 0 ? formatINR(r.upi_amount) : '—'}
                    </td>

                    {/* Bank */}
                    <td className="py-3 px-2 text-right font-semibold text-sky-700">
                      {r.bank_amount > 0 ? formatINR(r.bank_amount) : '—'}
                    </td>

                    {/* Total Paid */}
                    <td className="py-3 px-3 text-right font-black text-emerald-600">
                      {formatINR(r.total_paid)}
                    </td>

                    {/* Due */}
                    <td className={`py-3 px-3 text-right font-black ${r.due_amount > 0 ? 'text-amber-700' : 'text-slate-400'}`}>
                      {formatINR(r.due_amount)}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-3 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setViewRecord(r)}
                          className="px-2 py-1 rounded-lg bg-primary/10 text-primary hover:bg-primary hover:text-white transition-all font-bold text-[11px] shadow-xs"
                          title="View Details"
                        >
                          👁️
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditRecord({ ...r });
                            setEditFeedback({ type: '', message: '' });
                          }}
                          className="px-2 py-1 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-600 hover:text-white transition-all font-bold text-[11px] border border-amber-200"
                          title="Edit Record"
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteRecord(r)}
                          className="px-2 py-1 rounded-lg bg-red-50 text-red-600 hover:bg-red-600 hover:text-white transition-all font-bold text-[11px] border border-red-200"
                          title="Delete Record"
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && totalRecords > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-100">
            <span className="text-xs font-bold text-slate-400 uppercase">
              Page {currentPage} of {totalPages} &nbsp;·&nbsp; {totalRecords} total records
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-40 text-xs font-bold shadow-xs transition-all"
              >
                ← Prev
              </button>
              <span className="text-xs font-black text-slate-700 px-2">{currentPage}</span>
              <button
                type="button"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-40 text-xs font-bold shadow-xs transition-all"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── VIEW MODAL ───────────────────────────────────────────────────────── */}
      {viewRecord && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm pointer-events-auto p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-fade-in pointer-events-auto">
            {/* Modal Header */}
            <div className="bg-[#0b1324] p-5 text-white flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  SUNDAY LOADING RECORD
                </span>
                <h3 className="text-lg font-black tracking-tight mt-1 text-white">
                  {viewRecord.transaction_number}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setViewRecord(null)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center font-bold text-sm transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 text-xs font-semibold text-slate-700 max-h-[75vh] overflow-y-auto">
              <div className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-100">
                <div>
                  <span className="text-[10px] font-black text-slate-400 uppercase block">Transaction Date</span>
                  <span className="font-bold text-slate-800">{fmtDate(viewRecord.loading_date)}</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-black text-slate-400 uppercase block">Logged By</span>
                  <span className="font-bold text-slate-600">{viewRecord.created_by || 'Admin'}</span>
                </div>
              </div>

              {/* Customer Box */}
              <div className="border border-slate-200 rounded-2xl p-4 space-y-2">
                <span className="text-[10px] font-black text-primary uppercase tracking-wider block">
                  CUSTOMER DETAILS
                </span>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-black text-slate-800">{viewRecord.customer_name}</span>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                    {viewRecord.customer_type || 'General'}
                  </span>
                </div>
                {viewRecord.customer_phone && (
                  <p className="text-slate-500 text-xs">📞 {viewRecord.customer_phone}</p>
                )}
                {viewRecord.customer_address && (
                  <p className="text-slate-500 text-xs">📍 {viewRecord.customer_address}</p>
                )}
              </div>

              {/* Product Box */}
              <div className="border border-slate-200 rounded-2xl p-4 space-y-3">
                <span className="text-[10px] font-black text-indigo-700 uppercase tracking-wider block">
                  PRODUCT &amp; LOAD QUANTITY
                </span>
                <div className="flex justify-between items-center">
                  <span className="font-bold text-slate-800 text-sm">{viewRecord.product_name}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-center">
                  <div className="p-2 rounded-lg bg-slate-50">
                    <span className="text-[10px] font-black text-slate-400 uppercase block">Quantity</span>
                    <span className="font-black text-slate-800">{viewRecord.quantity}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-50">
                    <span className="text-[10px] font-black text-slate-400 uppercase block">Rate</span>
                    <span className="font-black text-slate-800">{formatINR(viewRecord.rate)}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-blue-50 text-blue-900">
                    <span className="text-[10px] font-black text-blue-600 uppercase block">Total</span>
                    <span className="font-black">{formatINR(viewRecord.total_amount)}</span>
                  </div>
                </div>
              </div>

              {/* Payment Box */}
              <div className="border border-slate-200 rounded-2xl p-4 space-y-3 bg-gradient-to-br from-white to-slate-50">
                <span className="text-[10px] font-black text-emerald-800 uppercase tracking-wider block">
                  PAYMENT DETAILS
                </span>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="p-2 rounded-lg bg-emerald-50 text-emerald-900">
                    <span className="text-[10px] font-black text-emerald-700 uppercase block">Cash</span>
                    <span className="font-bold">{formatINR(viewRecord.cash_amount)}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-indigo-50 text-indigo-900">
                    <span className="text-[10px] font-black text-indigo-700 uppercase block">UPI</span>
                    <span className="font-bold">{formatINR(viewRecord.upi_amount)}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-sky-50 text-sky-900">
                    <span className="text-[10px] font-black text-sky-700 uppercase block">Bank</span>
                    <span className="font-bold">{formatINR(viewRecord.bank_amount)}</span>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-slate-200 text-xs font-bold">
                  <span>Total Paid:</span>
                  <span className="text-emerald-700 font-black">{formatINR(viewRecord.total_paid)}</span>
                </div>
                <div className="flex justify-between items-center text-xs font-bold">
                  <span>Due Balance:</span>
                  <span className={`font-black ${viewRecord.due_amount > 0 ? 'text-amber-700' : 'text-slate-500'}`}>
                    {formatINR(viewRecord.due_amount)}
                  </span>
                </div>
              </div>

              {viewRecord.notes && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-[10px] font-black uppercase text-slate-400 block mb-1">Remarks</span>
                  <p className="text-slate-600 font-medium">{viewRecord.notes}</p>
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setViewRecord(null)}
                className="btn-premium bg-slate-900 text-white hover:bg-slate-800 text-xs px-6 h-10 font-bold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── EDIT MODAL ───────────────────────────────────────────────────────── */}
      {editRecord && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm pointer-events-auto p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-fade-in pointer-events-auto">
            <div className="bg-[#0b1324] p-5 text-white flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  EDIT SUNDAY LOADING
                </span>
                <h3 className="text-lg font-black tracking-tight mt-1 text-white">
                  {editRecord.transaction_number}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditRecord(null)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center font-bold text-sm transition-colors"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-6 space-y-4 text-xs font-semibold text-slate-700 max-h-[75vh] overflow-y-auto">
              {editFeedback.message && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs font-bold">
                  {editFeedback.message}
                </div>
              )}

              {/* Date & Customer Name */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                    Loading Date
                  </label>
                  <input
                    type="date"
                    required
                    value={editRecord.loading_date}
                    onChange={(e) => setEditRecord(prev => ({ ...prev, loading_date: e.target.value }))}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-slate-800 font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                    Customer Name
                  </label>
                  <input
                    type="text"
                    required
                    value={editRecord.customer_name}
                    onChange={(e) => setEditRecord(prev => ({ ...prev, customer_name: e.target.value }))}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-slate-800 font-bold"
                  />
                </div>
              </div>

              {/* Product */}
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                  Product Name
                </label>
                <input
                  type="text"
                  required
                  value={editRecord.product_name}
                  onChange={(e) => setEditRecord(prev => ({ ...prev, product_name: e.target.value }))}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-slate-800 font-bold"
                />
              </div>

              {/* Qty & Rate */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                    Quantity
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    required
                    value={editRecord.quantity}
                    onChange={(e) => setEditRecord(prev => ({ ...prev, quantity: e.target.value }))}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-slate-800 font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                    Rate (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={editRecord.rate}
                    onChange={(e) => setEditRecord(prev => ({ ...prev, rate: e.target.value }))}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-slate-800 font-bold"
                  />
                </div>
              </div>

              {/* Total Amount Preview */}
              <div className="p-3 bg-slate-100 rounded-xl flex justify-between items-center font-bold">
                <span className="text-slate-500">Calculated Total:</span>
                <span className="text-slate-900 font-black text-sm">
                  {formatINR((parseFloat(editRecord.quantity) || 0) * (parseFloat(editRecord.rate) || 0))}
                </span>
              </div>

              {/* Payment Fields */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                <span className="text-[10px] font-black uppercase text-slate-400 block">Payment Breakdown</span>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-emerald-800 mb-1">Cash</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editRecord.cash_amount}
                      onChange={(e) => setEditRecord(prev => ({ ...prev, cash_amount: e.target.value }))}
                      className="w-full h-9 px-2 rounded-lg border border-slate-200 bg-white text-slate-800 font-bold text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-indigo-800 mb-1">UPI</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editRecord.upi_amount}
                      onChange={(e) => setEditRecord(prev => ({ ...prev, upi_amount: e.target.value }))}
                      className="w-full h-9 px-2 rounded-lg border border-slate-200 bg-white text-slate-800 font-bold text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-sky-800 mb-1">Bank</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editRecord.bank_amount}
                      onChange={(e) => setEditRecord(prev => ({ ...prev, bank_amount: e.target.value }))}
                      className="w-full h-9 px-2 rounded-lg border border-slate-200 bg-white text-slate-800 font-bold text-xs"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Remarks</label>
                <textarea
                  rows="2"
                  value={editRecord.notes || ''}
                  onChange={(e) => setEditRecord(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full p-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 font-medium text-xs"
                />
              </div>

              <div className="p-4 bg-slate-50 border-t border-slate-100 -mx-6 -mb-6 mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditRecord(null)}
                  className="px-4 h-10 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="px-6 h-10 rounded-xl bg-primary hover:bg-primary-focus text-white font-black text-xs shadow-md disabled:opacity-50"
                >
                  {isSavingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── DELETE MODAL ─────────────────────────────────────────────────────── */}
      {deleteRecord && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm pointer-events-auto p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-fade-in pointer-events-auto p-6 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center text-2xl mx-auto shadow-xs">
              ⚠️
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-lg font-black text-slate-800 tracking-tight">
                Delete Sunday Loading Record?
              </h3>
              <p className="text-xs text-slate-500 font-medium leading-relaxed">
                Are you sure you want to delete transaction{' '}
                <strong className="text-slate-800 font-mono">{deleteRecord.transaction_number}</strong> ({deleteRecord.customer_name})?
              </p>
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 p-2 rounded-xl mt-2 font-semibold">
                ℹ️ Sunday Loading is completely isolated. Deleting this will only remove the Sunday Loading record and has zero effect on regular sales, stock, or ledgers.
              </p>
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeleteRecord(null)}
                className="px-4 h-10 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold text-xs flex-1"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="px-5 h-10 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black text-xs shadow-md disabled:opacity-50 flex-1 flex items-center justify-center gap-1.5"
              >
                {isDeleting ? 'Deleting...' : 'Delete Record'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SundayLoadingHistory;
