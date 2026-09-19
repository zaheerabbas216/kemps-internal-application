import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import TaxInvoiceModal from '../components/billing/TaxInvoiceModal';
import TablePagination from '../components/common/TablePagination';
import SearchInput from '../components/common/SearchInput';
import { useAuth } from '../context/AuthContext';

const Billing = () => {
  const navigate = useNavigate();
  const { canCreate, canUpdate, canDelete } = useAuth();

  // Data states
  const [bills, setBills] = useState([]);
  const [summary, setSummary] = useState({
    totalBilled: 0,
    cashCollected: 0,
    creditDue: 0,
    creditApplied: 0,
    totalInvoices: 0
  });
  // Pagination & View Mode
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [total, setTotal] = useState(0);
  const [density, setDensity] = useState('medium');

  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [todayDateStr, setTodayDateStr] = useState('');

  // Modals & deletes
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [deletingBillId, setDeletingBillId] = useState(null);
  const [viewingBill, setViewingBill] = useState(null);
  const [viewingBillItems, setViewingBillItems] = useState([]);
  const [viewingCompanyDetails, setViewingCompanyDetails] = useState(null);

  useEffect(() => {
    fetchTodayBills();
  }, [page, limit, searchQuery]);

  const fetchTodayBills = async () => {
    try {
      setLoading(true);
      const res = await api.get('/billing/today', {
        params: { page, limit, search: searchQuery }
      });
      if (res.data.ok) {
        setBills(res.data.bills || []);
        setTotal(res.data.total || 0);
        setSummary(res.data.summary || { totalBilled: 0, cashCollected: 0, creditDue: 0, creditApplied: 0, totalInvoices: 0 });
        if (res.data.todayStr) {
          setTodayDateStr(res.data.todayStr);
        }
      }
    } catch (err) {
      console.error('Failed to fetch today\'s invoices:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenView = async (bill) => {
    try {
      const res = await api.get(`/billing/${bill.id}`);
      if (res.data.ok) {
        setViewingBill(res.data.bill);
        setViewingBillItems(res.data.items || []);
        setViewingCompanyDetails(res.data.companyDetails || null);
        setIsViewModalOpen(true);
      } else {
        alert(res.data.error || 'Failed to fetch invoice details.');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to retrieve invoice details.');
    }
  };

  const confirmDelete = (billId) => {
    setDeletingBillId(billId);
    setIsDeleteModalOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingBillId) return;
    try {
      const res = await api.delete(`/billing/${deletingBillId}`);
      if (res.data.ok) {
        setIsDeleteModalOpen(false);
        setDeletingBillId(null);
        fetchTodayBills();
      } else {
        alert(res.data.error || 'Failed to delete record.');
      }
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
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

  const cellPaddingClass = density === 'compact' ? 'py-1.5 px-3 text-[11px]' : density === 'relaxed' ? 'py-5 px-6 text-sm' : 'py-3.5 px-5 text-xs';
  const headerPaddingClass = density === 'compact' ? 'py-2 px-3 text-[9px]' : density === 'relaxed' ? 'py-4.5 px-6 text-xs' : 'py-4 px-5 text-[10px]';

  return (
    <div className="space-y-6 animate-fade-in w-full pb-12">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase">Billing</h1>
          <p className="text-slate-500 text-sm font-medium mt-1">Manage customer invoices and live transaction receipts</p>
        </div>
        <div className="flex items-center gap-3">
          {canCreate('billing') && (
            <button 
              onClick={() => navigate('/billing-form')}
              className="btn-premium btn-primary-premium text-xs px-4 h-12"
            >
              <span className="text-xl">+</span> Billing
            </button>
          )}
          <button 
            onClick={() => navigate('/billing-history')}
            className="btn-premium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs px-4 h-12"
          >
            Billing History
          </button>
        </div>
      </div>

      {/* STATISTICS CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Total Billed */}
        <div className="card-premium flex items-center justify-between p-5 bg-white border border-slate-200/60 shadow-sm rounded-2xl">
          <div>
            <p className="text-[10px] font-black text-slate-450 uppercase tracking-widest">Total Billed Today</p>
            <h3 className="text-xl font-extrabold text-slate-850 mt-1.5">
              ₹ {summary.totalBilled.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </h3>
          </div>
          <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center text-lg border border-indigo-100 shrink-0">
            📊
          </div>
        </div>

        {/* Cash Collected */}
        <div className="card-premium flex items-center justify-between p-5 bg-white border border-slate-200/60 shadow-sm rounded-2xl">
          <div>
            <p className="text-[10px] font-black text-slate-450 uppercase tracking-widest">Cash / UPI Collected</p>
            <h3 className="text-xl font-extrabold text-emerald-600 mt-1.5">
              ₹ {summary.cashCollected.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </h3>
            {summary.creditApplied > 0 && (
              <p className="text-[10px] text-orange-500 font-bold mt-1">
                + 💳 ₹{summary.creditApplied.toLocaleString('en-IN', { minimumFractionDigits: 2 })} credit used
              </p>
            )}
          </div>
          <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center text-lg border border-emerald-100 shrink-0">
            💵
          </div>
        </div>

        {/* Credit Due */}
        <div className="card-premium flex items-center justify-between p-5 bg-white border border-slate-200/60 shadow-sm rounded-2xl">
          <div>
            <p className="text-[10px] font-black text-slate-450 uppercase tracking-widest">Credit / Balance Due</p>
            <h3 className="text-xl font-extrabold text-rose-500 mt-1.5">
              ₹ {summary.creditDue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </h3>
          </div>
          <div className="w-10 h-10 bg-rose-50 text-rose-600 rounded-xl flex items-center justify-center text-lg border border-rose-100 shrink-0">
            ⏳
          </div>
        </div>

        {/* Total Invoices */}
        <div className="card-premium flex items-center justify-between p-5 bg-white border border-slate-200/60 shadow-sm rounded-2xl">
          <div>
            <p className="text-[10px] font-black text-slate-450 uppercase tracking-widest">Total Invoices</p>
            <h3 className="text-xl font-extrabold text-slate-800 mt-1.5">
              {summary.totalInvoices} bills
            </h3>
          </div>
          <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center text-lg border border-amber-100 shrink-0">
            🧾
          </div>
        </div>
      </div>

      {/* FILTER & SEARCH */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white border border-slate-200/60 p-4 rounded-2xl shadow-sm">
        <div className="w-full md:w-80">
          <SearchInput
            placeholder="Search by customer name, phone, invoice..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
          />
        </div>
        <div className="text-[11px] font-bold text-slate-450 uppercase tracking-wider">
          TODAY: <span className="text-slate-750 font-black">{formatDateDDMMYYYY(todayDateStr)}</span>
        </div>
      </div>

      {/* LIST OF TODAY'S BILLS */}
      <div className="border border-slate-200/60 bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className={`bg-slate-50/75 border-b border-slate-200/80 font-black text-slate-450 uppercase tracking-wider ${headerPaddingClass}`}>
                <th className={headerPaddingClass}>Invoice No</th>
                <th className={headerPaddingClass}>Company</th>
                <th className={headerPaddingClass}>Customer Details</th>
                <th className={headerPaddingClass}>Customer Type</th>
                <th className={`text-right ${headerPaddingClass}`}>Grand Total</th>
                <th className={`text-center ${headerPaddingClass}`}>Payment Mode</th>
                <th className={`text-right ${headerPaddingClass}`}>Amt Paid</th>
                <th className={`text-right ${headerPaddingClass}`}>Amt Due</th>
                <th className={`text-center ${headerPaddingClass}`}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 font-semibold">
              {bills.map(b => (
                <tr key={b.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className={`font-bold text-primary ${cellPaddingClass}`}>{b.id}</td>
                  <td className={cellPaddingClass}>
                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold ${b.company.includes('Pet') ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' : 'bg-sky-50 text-sky-600 border border-sky-100'}`}>
                      {b.company.includes('Pet') ? 'Kemps Pet' : 'Kempannavar'}
                    </span>
                  </td>
                  <td className={cellPaddingClass}>
                    <div className="font-extrabold text-slate-800">{b.customer_name}</div>
                    <div className="text-[10px] font-bold text-slate-450 mt-0.5">{b.customer_phone}</div>
                  </td>
                  <td className={`font-bold uppercase tracking-wider text-[10px] text-slate-500 ${cellPaddingClass}`}>
                    {b.customer_type}
                  </td>
                  <td className={`text-right font-black text-slate-800 ${cellPaddingClass}`}>
                    ₹ {parseFloat(b.grand_total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td className={`text-center font-bold text-slate-600 ${cellPaddingClass}`}>
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] uppercase">
                      {b.payment_mode}
                    </span>
                  </td>
                  <td className={`text-right text-emerald-600 font-extrabold ${cellPaddingClass}`}>
                    ₹ {parseFloat(b.amount_paid).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td className={`text-right ${cellPaddingClass}`}>
                    {parseFloat(b.due_amount) > 0 ? (
                      <span className="text-rose-500 font-black">
                        ₹ {parseFloat(b.due_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    ) : (
                      <span className="text-slate-400 font-bold">Settled</span>
                    )}
                  </td>
                  <td className={`text-center ${cellPaddingClass}`}>
                    <div className="flex items-center justify-center gap-1.5">
                      <button 
                        onClick={() => handleOpenView(b)}
                        className="px-2 py-1 rounded bg-slate-50 border border-slate-200 text-slate-650 hover:bg-slate-100 hover:text-slate-800 font-bold transition-all text-xs"
                        title="View Details"
                      >
                        👁 View
                      </button>
                      {canUpdate('billing') && (
                        <button 
                          onClick={() => navigate('/billing-form', { state: { editBillId: b.id } })}
                          className="px-2 py-1 rounded bg-blue-50 border border-blue-100 text-blue-600 hover:bg-blue-100 hover:text-blue-700 font-bold transition-all text-xs"
                          title="Edit Invoice"
                        >
                          ✎ Edit
                        </button>
                      )}
                      {canDelete('billing') && (
                        <button 
                          onClick={() => confirmDelete(b.id)}
                          className="px-2 py-1 rounded bg-red-50 border border-red-100 text-red-500 hover:bg-red-100 hover:text-red-700 font-bold transition-all text-xs"
                          title="Delete Invoice"
                        >
                          ✕ Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}

              {bills.length === 0 && (
                <tr>
                  <td colSpan="9" className="py-12 text-center text-slate-400 font-semibold text-xs bg-slate-50/20">
                    No billing records found for today. Click "+ Billing" to log a customer invoice.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Reusable Table Pagination Controls */}
        <TablePagination
          page={page}
          limit={limit}
          total={total}
          onPageChange={setPage}
          onLimitChange={setLimit}
          density={density}
          onDensityChange={setDensity}
        />
      </div>

      {/* VIEW MODAL (PROFESSIONAL GST TAX INVOICE) */}
      <TaxInvoiceModal
        isOpen={isViewModalOpen}
        onClose={() => setIsViewModalOpen(false)}
        bill={viewingBill}
        items={viewingBillItems}
        companyDetails={viewingCompanyDetails}
      />

      {/* DELETE MODAL */}
      {isDeleteModalOpen && (
        <div className="modal modal-open animate-fade-in">
          <div className="modal-box bg-white border border-slate-200 rounded-3xl p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-black text-slate-850 uppercase">Delete Invoice?</h3>
            <p className="text-slate-500 text-xs font-semibold mt-2">
              Are you sure you want to delete invoice <span className="font-mono text-rose-500 font-bold">{deletingBillId}</span>? This will revert finished product stock levels in the stock registry.
            </p>
            <div className="flex justify-end gap-3 mt-6">
              <button 
                onClick={handleDelete}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all"
              >
                Yes, Delete
              </button>
              <button 
                onClick={() => {
                  setIsDeleteModalOpen(false);
                  setDeletingBillId(null);
                }}
                className="px-5 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-550 hover:bg-slate-50 text-xs font-bold transition-all"
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

export default Billing;
