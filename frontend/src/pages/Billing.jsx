import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';

const Billing = () => {
  const navigate = useNavigate();

  // Data states
  const [bills, setBills] = useState([]);
  const [summary, setSummary] = useState({
    totalBilled: 0,
    cashCollected: 0,
    creditDue: 0,
    creditApplied: 0,
    totalInvoices: 0
  });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [todayDateStr, setTodayDateStr] = useState('');

  // Modals & deletes
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [deletingBillId, setDeletingBillId] = useState(null);
  const [viewingBill, setViewingBill] = useState(null);
  const [viewingBillItems, setViewingBillItems] = useState([]);

  useEffect(() => {
    fetchTodayBills();
  }, [searchQuery]);

  const fetchTodayBills = async () => {
    try {
      setLoading(true);
      const res = await api.get('/billing/today', {
        params: { search: searchQuery }
      });
      if (res.data.ok) {
        setBills(res.data.bills || []);
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

  return (
    <div className="space-y-6 animate-fade-in max-w-6xl mx-auto pb-12">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase">Billing</h1>
          <p className="text-slate-500 text-sm font-medium mt-1">Manage customer invoices and live transaction receipts</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate('/billing-form')}
            className="btn-premium btn-primary-premium h-12"
          >
            <span className="text-xl">+</span> Billing
          </button>
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
        <div className="relative w-full md:w-80">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
          <input 
            type="text"
            placeholder="Search by customer name, phone, invoice..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-11 pl-10 pr-4 rounded-xl border border-slate-200 bg-slate-50/30 text-slate-700 placeholder:text-slate-400 focus:bg-white focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
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
              <tr className="bg-slate-50/75 border-b border-slate-200/80 text-[10px] font-black text-slate-450 uppercase tracking-wider">
                <th className="py-4 px-5">Invoice No</th>
                <th className="py-4 px-5">Company</th>
                <th className="py-4 px-5">Customer Details</th>
                <th className="py-4 px-5">Customer Type</th>
                <th className="py-4 px-5 text-right">Grand Total</th>
                <th className="py-4 px-5 text-center">Payment Mode</th>
                <th className="py-4 px-5 text-right">Amt Paid</th>
                <th className="py-4 px-5 text-right">Amt Due</th>
                <th className="py-4 px-5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 text-xs font-semibold">
              {bills.map(b => (
                <tr key={b.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="py-3.5 px-5 font-bold text-primary">{b.id}</td>
                  <td className="py-3.5 px-5">
                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold ${b.company.includes('Pet') ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' : 'bg-sky-50 text-sky-600 border border-sky-100'}`}>
                      {b.company.includes('Pet') ? 'Kemps Pet' : 'Kempannavar'}
                    </span>
                  </td>
                  <td className="py-3.5 px-5">
                    <div className="font-extrabold text-slate-800">{b.customer_name}</div>
                    <div className="text-[10px] font-bold text-slate-450 mt-0.5">{b.customer_phone}</div>
                  </td>
                  <td className="py-3.5 px-5 font-bold uppercase tracking-wider text-[10px] text-slate-500">
                    {b.customer_type}
                  </td>
                  <td className="py-3.5 px-5 text-right font-black text-slate-800">
                    ₹ {parseFloat(b.grand_total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-3.5 px-5 text-center font-bold text-slate-600">
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] uppercase">
                      {b.payment_mode}
                    </span>
                  </td>
                  <td className="py-3.5 px-5 text-right text-emerald-600 font-extrabold">
                    ₹ {parseFloat(b.amount_paid).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-3.5 px-5 text-right">
                    {parseFloat(b.due_amount) > 0 ? (
                      <span className="text-rose-500 font-black">
                        ₹ {parseFloat(b.due_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    ) : (
                      <span className="text-slate-400 font-bold">Settled</span>
                    )}
                  </td>
                  <td className="py-3.5 px-5 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <button 
                        onClick={() => handleOpenView(b)}
                        className="px-2 py-1 rounded bg-slate-50 border border-slate-200 text-slate-650 hover:bg-slate-100 hover:text-slate-800 font-bold transition-all"
                        title="View Details"
                      >
                        👁 View
                      </button>
                      <button 
                        onClick={() => navigate('/billing-form', { state: { editBillId: b.id } })}
                        className="px-2 py-1 rounded bg-blue-50 border border-blue-100 text-blue-600 hover:bg-blue-100 hover:text-blue-700 font-bold transition-all"
                        title="Edit Invoice"
                      >
                        ✎ Edit
                      </button>
                      <button 
                        onClick={() => confirmDelete(b.id)}
                        className="px-2 py-1 rounded bg-red-50 border border-red-100 text-red-500 hover:bg-red-100 hover:text-red-700 font-bold transition-all"
                        title="Delete Invoice"
                      >
                        ✕ Delete
                      </button>
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
      </div>

      {/* VIEW MODAL */}
      {isViewModalOpen && viewingBill && (
        <div className="modal modal-open animate-fade-in">
          <div className="modal-box max-w-3xl bg-white border border-slate-200/80 rounded-3xl p-8 relative shadow-2xl max-h-[90vh] overflow-y-auto">
            <button 
              onClick={() => setIsViewModalOpen(false)}
              className="absolute top-4 right-4 w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-850 flex items-center justify-center font-bold transition-all"
            >
              ✕
            </button>

            {/* Simulated Receipt Invoice Visual Mockup */}
            <div className="border border-slate-200 p-6 rounded-2xl space-y-6 bg-slate-50/30 text-slate-800">
              
              {/* Receipt Header */}
              <div className="flex justify-between items-start border-b border-slate-200 pb-4">
                <div>
                  <h3 className="text-lg font-black tracking-tight text-slate-850 uppercase italic">
                    {viewingBill.company}
                  </h3>
                  <p className="text-[10px] text-slate-500 font-bold mt-0.5">INVOICE TRANSACTION</p>
                </div>
                <div className="text-right">
                  <div className="text-sm font-black text-primary">{viewingBill.id}</div>
                  <div className="text-[10px] text-slate-400 font-bold mt-0.5">
                    Date: {formatDateDDMMYYYY(viewingBill.billing_date)}
                  </div>
                </div>
              </div>

              {/* Customer Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-semibold">
                <div>
                  <div className="text-[10px] font-black text-slate-450 uppercase tracking-wider">Billed To:</div>
                  <div className="font-extrabold text-slate-800 mt-1">{viewingBill.customer_name}</div>
                  <div className="text-slate-500 mt-0.5">Phone: {viewingBill.customer_phone}</div>
                  {viewingBill.customer_address && (
                    <div className="text-slate-500 mt-1 leading-relaxed">
                      Address: {viewingBill.customer_address}
                    </div>
                  )}
                </div>
                <div className="md:text-right">
                  <div className="text-[10px] font-black text-slate-450 uppercase tracking-wider">Billing Context:</div>
                  <div className="text-slate-700 mt-1">
                    Customer Type: <span className="font-extrabold uppercase">{viewingBill.customer_type}</span>
                  </div>
                  {viewingBill.customer_gstin && (
                    <div className="text-slate-600 mt-0.5">
                      GSTIN: <span className="font-mono font-bold text-slate-800">{viewingBill.customer_gstin}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Items Grid */}
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 text-[9px] font-black text-slate-500 uppercase tracking-wider">
                      <th className="py-2.5 px-3">Product Name</th>
                      <th className="py-2.5 px-3 text-center">Qty</th>
                      <th className="py-2.5 px-3 text-right">Rate (With Tax)</th>
                      <th className="py-2.5 px-3 text-center">Tax %</th>
                      <th className="py-2.5 px-3 text-right">Basic Rate</th>
                      <th className="py-2.5 px-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-150 font-bold text-slate-700">
                    {viewingBillItems.map(item => (
                      <tr key={item.id}>
                        <td className="py-2 px-3 text-slate-850 font-extrabold">{item.product_name}</td>
                        <td className="py-2 px-3 text-center">{item.quantity}</td>
                        <td className="py-2 px-3 text-right">₹ {parseFloat(item.rate_with_tax).toFixed(2)}</td>
                        <td className="py-2 px-3 text-center">{parseFloat(item.tax_percent)}%</td>
                        <td className="py-2 px-3 text-right text-slate-500">₹ {parseFloat(item.basic_rate).toFixed(2)}</td>
                        <td className="py-2 px-3 text-right text-slate-850">₹ {parseFloat(item.total_amount).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals Summary */}
              <div className="flex flex-col items-end gap-1.5 border-t border-slate-200 pt-4">
                <div className="flex items-center gap-16 text-xs">
                  <span className="font-bold text-slate-500">Grand Total:</span>
                  <span className="font-black text-slate-850 text-sm">
                    ₹ {parseFloat(viewingBill.grand_total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex items-center gap-16 text-xs">
                  <span className="font-bold text-slate-500">Amount Paid ({viewingBill.payment_mode}):</span>
                  <span className="font-extrabold text-emerald-600">
                    ₹ {parseFloat(viewingBill.amount_paid).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex items-center gap-16 text-xs border-t border-dashed border-slate-200 pt-1.5 w-64 justify-end">
                  <span className="font-bold text-slate-650">Balance Due:</span>
                  <span className={`font-black ${parseFloat(viewingBill.due_amount) > 0 ? 'text-rose-500' : 'text-slate-450'}`}>
                    ₹ {parseFloat(viewingBill.due_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

            </div>

            <div className="flex justify-end mt-6">
              <button 
                onClick={() => setIsViewModalOpen(false)}
                className="px-6 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-all uppercase tracking-wider"
              >
                Close Receipt
              </button>
            </div>
          </div>
        </div>
      )}

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
