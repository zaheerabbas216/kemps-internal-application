import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';

const BillingHistory = () => {
  const navigate = useNavigate();

  // Filters and listings
  const [bills, setBills] = useState([]);
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [company, setCompany] = useState('All');

  // Pagination
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  // Modals & deletes
  const [viewingBill, setViewingBill] = useState(null);
  const [viewingBillItems, setViewingBillItems] = useState([]);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);

  const [deletingBillId, setDeletingBillId] = useState(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  // Date constants for restriction checks (IST today)
  const [todayStr, setTodayStr] = useState('');

  useEffect(() => {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const istDate = new Date(now.getTime() + (330 + offset) * 60000);
    const yyyy = istDate.getFullYear();
    const mm = String(istDate.getMonth() + 1).padStart(2, '0');
    const dd = String(istDate.getDate()).padStart(2, '0');
    setTodayStr(`${yyyy}-${mm}-${dd}`);
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [page, search, startDate, endDate, company]);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const res = await api.get('/billing', {
        params: {
          page,
          limit,
          search,
          startDate,
          endDate,
          company
        }
      });
      if (res.data.ok) {
        setBills(res.data.bills || []);
        setTotal(res.data.total || 0);
      }
    } catch (err) {
      console.error('Failed to load billing history:', err);
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
        fetchHistory();
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

  const isToday = (dateStr) => {
    if (!dateStr) return false;
    // Format YYYY-MM-DD
    const invoiceDate = dateStr.split('T')[0];
    return invoiceDate === todayStr;
  };

  // 1. Export Current Filtered Table List (Ledger) to PDF
  const handlePrintLedger = async () => {
    try {
      // Fetch all bills for current filter without pagination limits
      const res = await api.get('/billing', {
        params: {
          page: 1,
          limit: 1000,
          search,
          startDate,
          endDate,
          company
        }
      });

      if (!res.data.ok) return alert('Failed to retrieve list for printing.');
      const allBills = res.data.bills || [];

      const printWindow = window.open('', '_blank');
      const html = `
        <html>
          <head>
            <title>Billing History Ledger</title>
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
              .summary-box { margin-top: 25px; border-top: 2px solid #e2e8f0; padding-top: 15px; display: flex; justify-content: space-between; font-size: 12px; font-weight: bold; color: #0f172a; }
            </style>
          </head>
          <body>
            <div class="header">
              <h2>Billing Ledger Report</h2>
              <p>Kemp's Beverages & Bottling Plants</p>
            </div>
            <div class="filter-info">
              Generated On: ${new Date().toLocaleString('en-IN')}<br/>
              Filters: Company "${company}" | Search "${search || 'N/A'}" | Date Range: ${startDate ? formatDateDDMMYYYY(startDate) : 'Beginning'} to ${endDate ? formatDateDDMMYYYY(endDate) : 'Today'}
            </div>
            <table>
              <thead>
                <tr>
                  <th>Invoice No</th>
                  <th>Date</th>
                  <th>Company</th>
                  <th>Customer Name</th>
                  <th>Phone</th>
                  <th>Payment Mode</th>
                  <th class="amount">Grand Total</th>
                  <th class="amount">Amt Paid</th>
                  <th class="amount">Due Amount</th>
                </tr>
              </thead>
              <tbody>
                ${allBills.map(b => `
                  <tr>
                    <td class="mono">${b.id}</td>
                    <td>${formatDateDDMMYYYY(b.billing_date)}</td>
                    <td>${b.company.includes('Pet') ? "Kemps Pet" : "Kempannavar"}</td>
                    <td style="font-weight: 700;">${b.customer_name}</td>
                    <td>${b.customer_phone}</td>
                    <td style="text-align: center; text-transform: uppercase;">${b.payment_mode}</td>
                    <td class="amount">₹ ${parseFloat(b.grand_total).toFixed(2)}</td>
                    <td class="amount" style="color: #16a34a;">₹ ${parseFloat(b.amount_paid).toFixed(2)}</td>
                    <td class="amount" style="color: ${parseFloat(b.due_amount) > 0 ? '#e11d48' : '#64748b'}; font-weight: bold;">
                      ₹ ${parseFloat(b.due_amount).toFixed(2)}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            <div class="summary-box">
              <span>Total Invoices Printed: ${allBills.length}</span>
              <span>Total Collections: ₹ ${allBills.reduce((sum, b) => sum + parseFloat(b.amount_paid), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              <span>Total Billed: ₹ ${allBills.reduce((sum, b) => sum + parseFloat(b.grand_total), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
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
      alert('Error building print report: ' + err.message);
    }
  };

  // 2. Export Individual Customer POS Receipt to PDF
  const handlePrintReceipt = (bill, itemsList) => {
    const printWindow = window.open('', '_blank');
    const html = `
      <html>
        <head>
          <title>Invoice - ${bill.id}</title>
          <style>
            body { font-family: 'Courier New', Courier, monospace; padding: 15px; color: #000; width: 320px; font-size: 12px; line-height: 1.4; }
            .receipt { width: 100%; }
            .center { text-align: center; }
            .bold { font-weight: bold; }
            .divider { border-bottom: 1px dashed #000; margin: 8px 0; }
            .header h3 { margin: 0; text-transform: uppercase; font-size: 14px; }
            .header p { margin: 2px 0; font-size: 10px; }
            .meta-table, .items-table { width: 100%; border-collapse: collapse; font-size: 11px; }
            .meta-table td { padding: 1px 0; }
            .items-table th { border-bottom: 1px dashed #000; padding: 4px 0; text-align: left; font-size: 10px; }
            .items-table td { padding: 4px 0; vertical-align: top; }
            .right { text-align: right; }
            .total-section { margin-top: 10px; font-size: 11px; }
            .total-row { display: flex; justify-content: space-between; padding: 2px 0; }
            .footer-msg { margin-top: 20px; text-align: center; font-size: 10px; }
            @media print {
              body { padding: 0; margin: 0; }
            }
          </style>
        </head>
        <body>
          <div class="receipt">
            <div class="header center">
              <h3 class="bold">${bill.company.toUpperCase()}</h3>
              <p>Beverages & Bottling Plants</p>
              <p>GSTIN: ${bill.customer_gstin || 'N/A'}</p>
            </div>
            
            <div class="divider"></div>
            
            <table class="meta-table">
              <tr>
                <td class="bold">Invoice No:</td>
                <td class="right mono">${bill.id}</td>
              </tr>
              <tr>
                <td class="bold">Date:</td>
                <td class="right">${formatDateDDMMYYYY(bill.billing_date)}</td>
              </tr>
              <tr>
                <td class="bold">Cust Name:</td>
                <td class="right">${bill.customer_name}</td>
              </tr>
              <tr>
                <td class="bold">Phone:</td>
                <td class="right">${bill.customer_phone}</td>
              </tr>
              <tr>
                <td class="bold">Cust Type:</td>
                <td class="right uppercase">${bill.customer_type}</td>
              </tr>
            </table>

            <div class="divider"></div>

            <table class="items-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th class="right">Qty</th>
                  <th class="right">Rate</th>
                  <th class="right">Total</th>
                </tr>
              </thead>
              <tbody>
                ${itemsList.map(item => `
                  <tr>
                    <td>${item.product_name}<br/><span style="font-size: 9px; color: #333;">Tax: ${parseFloat(item.tax_percent)}%</span></td>
                    <td class="right">${item.quantity}</td>
                    <td class="right">${parseFloat(item.rate_with_tax).toFixed(2)}</td>
                    <td class="right bold">${parseFloat(item.total_amount).toFixed(2)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>

            <div class="divider"></div>

            <div class="total-section">
              <div class="total-row">
                <span>Total Items:</span>
                <span class="bold">${itemsList.reduce((sum, i) => sum + i.quantity, 0)}</span>
              </div>
              <div class="total-row">
                <span class="bold">Grand Total:</span>
                <span class="bold">₹ ${parseFloat(bill.grand_total).toFixed(2)}</span>
              </div>
              <div class="total-row">
                <span>Amount Paid (${bill.payment_mode}):</span>
                <span>₹ ${parseFloat(bill.amount_paid).toFixed(2)}</span>
              </div>
              <div class="total-row">
                <span class="bold">Balance Due:</span>
                <span class="bold">₹ ${parseFloat(bill.due_amount).toFixed(2)}</span>
              </div>
            </div>

            <div class="divider"></div>

            <div class="footer-msg">
              <p class="bold">Thank You for Your Business!</p>
              <p>Powered by Kemp's Inventory System</p>
            </div>
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

  // 3. Export Filtered Ledger to Excel (CSV)
  const handleExportExcel = async () => {
    try {
      setLoading(true);
      const res = await api.get('/billing', {
        params: {
          page: 1,
          limit: 1000,
          search,
          startDate,
          endDate,
          company
        }
      });

      if (!res.data.ok) return alert('Failed to retrieve list for Excel export.');
      const allBills = res.data.bills || [];

      // CSV columns mapping
      const headers = [
        'Invoice No', 
        'Billing Date', 
        'Company', 
        'Customer Name', 
        'Phone Number', 
        'Customer Type', 
        'Grand Total (INR)', 
        'Payment Mode', 
        'Amount Paid (INR)', 
        'Due Amount (INR)'
      ];

      const csvRows = [
        headers.join(','),
        ...allBills.map(b => [
          b.id,
          b.billing_date,
          b.company,
          b.customer_name,
          b.customer_phone,
          b.customer_type,
          b.grand_total,
          b.payment_mode,
          b.amount_paid,
          b.due_amount
        ].map(val => `"${String(val || '').replace(/"/g, '""')}"`).join(','))
      ];

      // Add UTF-8 BOM so Excel reads it perfectly
      const csvContent = "\uFEFF" + csvRows.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `Billing_Ledger_${company.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      alert('Error exporting Excel report: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto pb-12">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <button 
            onClick={() => navigate('/billing')}
            className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-650 hover:bg-slate-50 transition-all font-bold text-sm shadow-sm flex items-center gap-1.5 mb-2"
          >
            <span>←</span> Back to Dashboard
          </button>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase">Billing History</h1>
          <p className="text-slate-500 text-xs font-semibold mt-1">Audit customer purchase transactions and download reports</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={handlePrintLedger}
            className="btn-premium bg-slate-900 text-white hover:bg-slate-800 text-xs h-12 flex items-center gap-1.5 shadow-sm"
          >
            🖨 Print Ledger
          </button>
          <button 
            onClick={handleExportExcel}
            className="btn-premium bg-emerald-600 text-white hover:bg-emerald-700 text-xs h-12 flex items-center gap-1.5 shadow-sm"
          >
            📊 Export Excel
          </button>
        </div>
      </div>

      {/* FILTER PANEL */}
      <div className="border border-slate-200/80 bg-white rounded-2xl p-5 shadow-sm space-y-4">
        
        {/* Company Separator Tabs */}
        <div className="border-b border-slate-100 pb-3 flex flex-wrap gap-2 items-center justify-between">
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
            <span>🏢</span> Separate by Company
          </div>
          <div className="flex bg-slate-100 p-1 rounded-xl w-fit border border-slate-200/40">
            {['All', 'Kempannavar Industries', 'Kemps Pet Industries'].map(comp => (
              <button
                key={comp}
                type="button"
                onClick={() => { setCompany(comp); setPage(1); }}
                className={`px-3.5 py-1.5 rounded-lg text-[10px] font-black tracking-wider transition-all ${
                  company === comp 
                    ? 'bg-white text-slate-800 shadow-sm font-extrabold'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {comp === 'All' ? 'ALL COMPANIES' : comp.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="text-[10px] font-black text-slate-450 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-50 pb-2.5">
          <span>🔍</span> FILTER AND QUERY
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Text Search */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-450 uppercase tracking-wider block">
              Search Text
            </label>
            <input 
              type="text"
              placeholder="Customer name, phone, invoice..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-slate-50/20 text-slate-700 placeholder:text-slate-400 focus:bg-white focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
            />
          </div>

          {/* Start Date */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-450 uppercase tracking-wider block">
              Start Date
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
              End Date
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

      {/* HISTORICAL RECORDS LIST */}
      <div className="border border-slate-200/60 bg-white rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <span className="loading loading-spinner text-primary"></span>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/75 border-b border-slate-200/80 text-[10px] font-black text-slate-450 uppercase tracking-wider">
                    <th className="py-4 px-5">Invoice No</th>
                    <th className="py-4 px-5">Billing Date</th>
                    <th className="py-4 px-5">Company</th>
                    <th className="py-4 px-5">Customer details</th>
                    <th className="py-4 px-5">Customer Type</th>
                    <th className="py-4 px-5 text-right">Grand Total</th>
                    <th className="py-4 px-5 text-center">Payment Mode</th>
                    <th className="py-4 px-5 text-right">Amt Paid</th>
                    <th className="py-4 px-5 text-right">Amt Due</th>
                    <th className="py-4 px-5 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-750 text-xs font-semibold">
                  {bills.map(b => {
                    const editable = isToday(b.billing_date);

                    return (
                      <tr key={b.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-3.5 px-5 font-black text-primary">{b.id}</td>
                        <td className="py-3.5 px-5">{formatDateDDMMYYYY(b.billing_date)}</td>
                        <td className="py-3.5 px-5">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold ${b.company.includes('Pet') ? 'bg-indigo-50 text-indigo-600' : 'bg-sky-50 text-sky-600'}`}>
                            {b.company.includes('Pet') ? 'Kemps Pet' : 'Kempannavar'}
                          </span>
                        </td>
                        <td className="py-3.5 px-5">
                          <div className="font-extrabold text-slate-800">{b.customer_name}</div>
                          <div className="text-[10px] font-bold text-slate-400 mt-0.5">{b.customer_phone}</div>
                        </td>
                        <td className="py-3.5 px-5 uppercase text-[9px] tracking-wider text-slate-500 font-bold">
                          {b.customer_type}
                        </td>
                        <td className="py-3.5 px-5 text-right font-black text-slate-800">
                          ₹ {parseFloat(b.grand_total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3.5 px-5 text-center text-slate-550 font-bold uppercase text-[10px]">
                          {b.payment_mode}
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
                            <span className="text-slate-400 font-semibold">Settled</span>
                          )}
                        </td>
                        <td className="py-3.5 px-5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button 
                              onClick={() => handleOpenView(b)}
                              className="px-2 py-1 rounded bg-slate-50 border border-slate-200 text-slate-650 hover:bg-slate-100 hover:text-slate-850 font-bold transition-all"
                              title="View Details"
                            >
                              👁 View
                            </button>
                            {editable ? (
                              <>
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
                              </>
                            ) : (
                              <>
                                <button 
                                  disabled
                                  className="px-2 py-1 rounded bg-slate-100 border border-slate-100 text-slate-400 font-bold cursor-not-allowed"
                                  title="Cannot edit past records"
                                >
                                  ✎ Edit
                                </button>
                                <button 
                                  disabled
                                  className="px-2 py-1 rounded bg-slate-100 border border-slate-100 text-slate-400 font-bold cursor-not-allowed"
                                  title="Cannot delete past records"
                                >
                                  ✕ Delete
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {bills.length === 0 && (
                    <tr>
                      <td colSpan="10" className="py-12 text-center text-slate-400 font-semibold text-xs bg-slate-50/20">
                        No billing history entries found for the selected query filters.
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

      {/* VIEW MODAL (WITH POS PRINT TRIGGER) */}
      {isViewModalOpen && viewingBill && (
        <div className="modal modal-open animate-fade-in">
          <div className="modal-box max-w-3xl bg-white border border-slate-200 rounded-3xl p-8 relative shadow-2xl">
            <button 
              onClick={() => setIsViewModalOpen(false)}
              className="absolute top-4 right-4 w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-800 flex items-center justify-center font-bold transition-all"
            >
              ✕
            </button>

            {/* Receipt Preview */}
            <div className="border border-slate-200 p-6 rounded-2xl space-y-6 bg-slate-50/30 text-slate-800">
              <div className="flex justify-between items-start border-b border-slate-200 pb-4">
                <div>
                  <h3 className="text-lg font-black tracking-tight text-slate-850 uppercase italic">
                    {viewingBill.company}
                  </h3>
                  <p className="text-[10px] text-slate-500 font-bold mt-0.5">INVOICE TRANSACTION RECEIPT</p>
                </div>
                <div className="text-right">
                  <div className="text-sm font-black text-primary">{viewingBill.id}</div>
                  <div className="text-[10px] text-slate-400 font-bold mt-0.5">
                    Date: {formatDateDDMMYYYY(viewingBill.billing_date)}
                  </div>
                </div>
              </div>

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

              <div className="flex flex-col items-end gap-1.5 border-t border-slate-200 pt-4">
                <div className="flex items-center gap-16 text-xs">
                  <span className="font-bold text-slate-500">Grand Total:</span>
                  <span className="font-black text-slate-800 text-sm">
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
                  <span className="font-bold text-slate-600">Balance Due:</span>
                  <span className={`font-black ${parseFloat(viewingBill.due_amount) > 0 ? 'text-rose-500' : 'text-slate-450'}`}>
                    ₹ {parseFloat(viewingBill.due_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex justify-between mt-6">
              <button 
                onClick={() => handlePrintReceipt(viewingBill, viewingBillItems)}
                className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white font-bold text-xs transition-all uppercase tracking-wider flex items-center gap-1.5 shadow-md shadow-primary/10"
              >
                🖨 Print POS Receipt
              </button>
              <button 
                onClick={() => setIsViewModalOpen(false)}
                className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-all uppercase tracking-wider"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {isDeleteModalOpen && (
        <div className="modal modal-open animate-fade-in">
          <div className="modal-box bg-white border border-slate-200 rounded-3xl p-6 shadow-xl">
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

export default BillingHistory;
