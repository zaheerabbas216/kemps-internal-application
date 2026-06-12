import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';

const CreditHistory = () => {
  const navigate = useNavigate();

  // Filters and listings
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [company, setCompany] = useState('All Companies');
  const [customerType, setCustomerType] = useState('All Types');

  // Pagination
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [total, setTotal] = useState(0);

  // Dropdown options
  const CUSTOMER_TYPES = [
    { value: 'All Types', label: 'All Types' },
    { value: 'General Customer', label: 'General' },
    { value: 'Distributor', label: 'Distributor' },
    { value: 'Function Order', label: 'Function' },
    { value: 'Corporate Customer', label: 'Corporate' },
    { value: 'Wholesale Customer', label: 'Wholesale' }
  ];

  useEffect(() => {
    fetchPaymentsHistory();
  }, [page, search, startDate, endDate, company, customerType]);

  const fetchPaymentsHistory = async () => {
    try {
      setLoading(true);
      const res = await api.get('/credit-balance/history', {
        params: {
          page,
          limit,
          search,
          startDate,
          endDate,
          company,
          customerType
        }
      });
      if (res.data.ok) {
        setPayments(res.data.payments || []);
        setTotal(res.data.total || 0);
      }
    } catch (err) {
      console.error('Failed to fetch credit payments history:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatDateDDMMYYYY = (dateStr) => {
    if (!dateStr) return '—';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  const handlePrintHistory = async () => {
    try {
      // Fetch all payment logs matching filters
      const res = await api.get('/credit-balance/history', {
        params: {
          page: 1,
          limit: 1000,
          search,
          startDate,
          endDate,
          company,
          customerType
        }
      });

      if (!res.data.ok) return alert('Failed to retrieve list for printing.');
      const allPayments = res.data.payments || [];

      const printWindow = window.open('', '_blank');
      const html = `
        <html>
          <head>
            <title>Credit Payment History Report</title>
            <style>
              body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; color: #1e293b; }
              .header { text-align: center; margin-bottom: 25px; border-bottom: 2px solid #e2e8f0; padding-bottom: 15px; }
              .header h2 { margin: 0; text-transform: uppercase; letter-spacing: 1px; color: #0f172a; }
              .header p { margin: 5px 0 0 0; font-size: 12px; color: #64748b; font-weight: bold; }
              .filter-info { font-size: 11px; margin-bottom: 15px; color: #475569; }
              table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
              th { background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 10px; text-align: left; font-weight: 800; text-transform: uppercase; color: #475569; font-size: 10px; }
              td { border: 1px solid #e2e8f0; padding: 8px 10px; font-weight: 500; }
              .mono { font-family: monospace; font-size: 12px; font-weight: bold; color: #0f172a; }
              .amount { text-align: right; }
              .status-badge { font-weight: bold; color: #16a34a; text-transform: uppercase; font-size: 10px; }
              .summary-box { margin-top: 25px; border-top: 2px solid #e2e8f0; padding-top: 15px; display: flex; justify-content: space-between; font-size: 12px; font-weight: bold; color: #0f172a; }
            </style>
          </head>
          <body>
            <div class="header">
              <h2>Credit Payment History Report</h2>
              <p>Kemp's Beverages & Bottling Plants</p>
            </div>
            <div class="filter-info">
              Generated On: ${new Date().toLocaleString('en-IN')}<br/>
              Filters: Company "${company}" | Customer Type "${customerType}" | Search "${search || 'N/A'}" | Dates: ${startDate ? formatDateDDMMYYYY(startDate) : 'Beginning'} to ${endDate ? formatDateDDMMYYYY(endDate) : 'Today'}
            </div>
            <table>
              <thead>
                <tr>
                  <th>Payment ID</th>
                  <th>Payment Date</th>
                  <th>Invoice No</th>
                  <th>Customer Name</th>
                  <th>Company</th>
                  <th>Customer Type</th>
                  <th>Payment Method</th>
                  <th class="amount">Invoice Amount</th>
                  <th class="amount">Total Received</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${allPayments.map(p => `
                  <tr>
                    <td class="mono">${p.payment_id}</td>
                    <td>${formatDateDDMMYYYY(p.payment_date)}</td>
                    <td class="mono">${p.invoice_no}</td>
                    <td style="font-weight: 700;">${p.customer_name}</td>
                    <td>${p.company.includes('Pet') ? "Kemps Pet" : "Kempannavar"}</td>
                    <td style="text-transform: uppercase; font-size: 10px;">${p.customer_type}</td>
                    <td>${p.payment_method}</td>
                    <td class="amount">₹ ${parseFloat(p.invoice_amount).toFixed(2)}</td>
                    <td class="amount" style="font-weight: 800; color: #16a34a;">₹ ${parseFloat(p.amount_received).toFixed(2)}</td>
                    <td class="status-badge">${parseFloat(p.due_amount) === 0 ? 'Fully Paid' : 'Partial'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            <div class="summary-box">
              <span>Total Transactions: ${allPayments.length}</span>
              <span>Total Collections: ₹ ${allPayments.reduce((sum, p) => sum + parseFloat(p.amount_received), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
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
    } catch (err) {
      alert('Error printing report: ' + err.message);
    }
  };

  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto pb-12">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <button 
            onClick={() => navigate('/credit-balance')}
            className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-650 hover:bg-slate-50 transition-all font-bold text-sm shadow-sm flex items-center gap-1.5 mb-2"
          >
            <span>←</span> Back to credit ledger
          </button>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase">Credit Payment History</h1>
          <p className="text-slate-500 text-xs font-semibold mt-1">View all completed credit payment transactions</p>
        </div>
        <div>
          <button 
            onClick={handlePrintHistory}
            className="btn-premium bg-slate-900 text-white hover:bg-slate-800 text-xs h-12 flex items-center gap-1.5 shadow-sm"
          >
            🖨 Print Payment History
          </button>
        </div>
      </div>

      {/* FILTER PANEL */}
      <div className="border border-slate-200/80 bg-white rounded-2xl p-5 shadow-sm space-y-4">
        
        {/* Company Separator Tabs */}
        <div className="border-b border-slate-100 pb-3 flex flex-wrap gap-2 items-center justify-between">
          <div className="text-[10px] font-black text-slate-450 uppercase tracking-widest flex items-center gap-1.5">
            <span>🏢</span> OUTSTANDING COMPANY SEPARATION
          </div>
          <div className="flex bg-slate-100 p-1 rounded-xl w-fit border border-slate-200/40">
            {['All Companies', 'Kempannavar Industries', 'Kemps Pet Industries'].map(comp => (
              <button
                key={comp}
                type="button"
                onClick={() => { setCompany(comp); setPage(1); }}
                className={`px-3.5 py-1.5 rounded-lg text-[10px] font-black tracking-wider transition-all ${
                  company === comp 
                    ? 'bg-white text-slate-800 shadow-sm font-extrabold'
                    : 'text-slate-500 hover:text-slate-750'
                }`}
              >
                {comp === 'All Companies' ? 'ALL COMPANIES' : comp.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="text-[10px] font-black text-slate-450 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-50 pb-2.5">
          <span>🔍</span> FILTER AND AUDIT SEARCH
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Text Search */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-450 uppercase tracking-wider block">
              Search Text
            </label>
            <input 
              type="text"
              placeholder="Cust Name, Phone, Invoice No..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-slate-50/20 text-slate-700 placeholder:text-slate-400 focus:bg-white focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
            />
          </div>

          {/* Customer Type Filter */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-450 uppercase tracking-wider block">
              Customer Type
            </label>
            <select
              value={customerType}
              onChange={(e) => { setCustomerType(e.target.value); setPage(1); }}
              className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-slate-50/20 text-slate-700 focus:bg-white focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
            >
              {CUSTOMER_TYPES.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Start Date */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-450 uppercase tracking-wider block">
              Start Payment Date
            </label>
            <input 
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
              className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-slate-50/20 text-slate-700 focus:bg-white focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
            />
          </div>

          {/* End Date */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-450 uppercase tracking-wider block">
              End Payment Date
            </label>
            <input 
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
              className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-slate-50/20 text-slate-700 focus:bg-white focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
            />
          </div>
        </div>
      </div>

      {/* COMPLETED PAYMENTS TABLE LIST */}
      <div className="border border-slate-200/60 bg-white rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <span className="loading loading-spinner text-primary"></span>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/75 border-b border-slate-200/80 text-[10px] font-black text-slate-450 uppercase tracking-wider">
                    <th className="py-4 px-5">Payment ID</th>
                    <th className="py-4 px-5">Date</th>
                    <th className="py-4 px-5">Invoice No</th>
                    <th className="py-4 px-5">Customer Name</th>
                    <th className="py-4 px-5">Company</th>
                    <th className="py-4 px-5">Customer Type</th>
                    <th className="py-4 px-5 text-right">Invoice Amount</th>
                    <th className="py-4 px-5 text-right">Total Received</th>
                    <th className="py-4 px-5 text-center">Payment Method</th>
                    <th className="py-4 px-5 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-750 text-xs font-semibold">
                  {payments.map(p => (
                    <tr key={p.payment_id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3.5 px-5 font-mono text-[11px] text-slate-400">{p.payment_id}</td>
                      <td className="py-3.5 px-5">{formatDateDDMMYYYY(p.payment_date)}</td>
                      <td className="py-3.5 px-5 font-bold text-primary">{p.invoice_no}</td>
                      <td className="py-3.5 px-5">
                        <div className="font-extrabold text-slate-800">{p.customer_name}</div>
                      </td>
                      <td className="py-3.5 px-5">
                        <span className={`px-2.5 py-1 rounded-lg text-[9px] font-extrabold ${p.company.includes('Pet') ? 'bg-indigo-50 text-indigo-600' : 'bg-sky-50 text-sky-600'}`}>
                          {p.company.includes('Pet') ? 'Kemps Pet' : 'Kempannavar'}
                        </span>
                      </td>
                      <td className="py-3.5 px-5 uppercase text-[9px] tracking-wider text-slate-500 font-bold">
                        {p.customer_type}
                      </td>
                      <td className="py-3.5 px-5 text-right font-bold text-slate-700">
                        ₹ {parseFloat(p.invoice_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3.5 px-5 text-right text-emerald-600 font-black text-sm">
                        ₹ {parseFloat(p.amount_received).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3.5 px-5 text-center text-slate-550 font-bold uppercase text-[10px]">
                        {p.payment_method}
                      </td>
                      <td className="py-3.5 px-5 text-center">
                        <span className={`px-2.5 py-1 rounded text-[9px] font-black uppercase ${
                          p.payment_status === 'Approved' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                          p.payment_status === 'Pending Approval' ? 'bg-amber-50 text-amber-600 border border-amber-100' :
                          p.payment_status === 'Rejected' ? 'bg-rose-50 text-rose-600 border border-rose-100' :
                          'bg-slate-50 text-slate-500 border border-slate-200'
                        }`}>
                          {p.payment_status || 'Approved'}
                        </span>
                      </td>
                    </tr>
                  ))}

                  {payments.length === 0 && (
                    <tr>
                      <td colSpan="10" className="py-12 text-center text-slate-400 font-semibold text-xs bg-slate-50/20">
                        No credit payment transaction records found matching filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 bg-slate-50/50 border-t border-slate-100">
                <span className="text-xs text-slate-450 font-bold">
                  Showing Page {page} of {totalPages} ({total} entries total)
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(prev => Math.max(prev - 1, 1))}
                    disabled={page === 1}
                    className="px-3.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    ← Previous
                  </button>
                  <button
                    onClick={() => setPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={page === totalPages}
                    className="px-3.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

    </div>
  );
};

export default CreditHistory;
