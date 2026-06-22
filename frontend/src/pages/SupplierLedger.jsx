import React, { useState, useEffect } from 'react';
import api from '../api/axios';

const SupplierLedger = () => {
  // Navigation & Tabs
  const [activeTab, setActiveTab] = useState('ledger'); // 'ledger' | 'analytics'

  // Dropdown options
  const [suppliers, setSuppliers] = useState([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [supSearch, setSupSearch] = useState('');

  // Date filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Data states
  const [summary, setSummary] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(false);

  // Fetch supplier list on mount
  useEffect(() => {
    fetchSuppliers();
  }, []);

  // Re-fetch data when supplier changes
  useEffect(() => {
    if (selectedSupplierId) {
      fetchSummary();
      fetchTransactions();
      fetchAnalytics();
    } else {
      setSummary(null);
      setTransactions([]);
      setOpeningBalance(0);
      setAnalytics(null);
    }
  }, [selectedSupplierId]);

  const fetchSuppliers = async () => {
    try {
      const res = await api.get('/supplier-ledger/suppliers');
      if (res.data.ok) {
        setSuppliers(res.data.suppliers || []);
      }
    } catch (err) {
      console.error('Failed to load suppliers:', err);
    }
  };

  const fetchSummary = async () => {
    try {
      const res = await api.get(`/supplier-ledger/summary/${selectedSupplierId}`);
      if (res.data.ok) {
        setSummary(res.data.summary);
      }
    } catch (err) {
      console.error('Failed to load summary:', err);
    }
  };

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/supplier-ledger/transactions/${selectedSupplierId}`, {
        params: { startDate, endDate }
      });
      if (res.data.ok) {
        setTransactions(res.data.transactions || []);
        setOpeningBalance(res.data.openingBalance || 0);
      }
    } catch (err) {
      console.error('Failed to load transactions:', err);
      alert('Failed to load ledger transactions.');
    } finally {
      setLoading(false);
    }
  };

  const fetchAnalytics = async () => {
    try {
      const res = await api.get(`/supplier-ledger/analytics/${selectedSupplierId}`);
      if (res.data.ok) {
        setAnalytics(res.data);
      }
    } catch (err) {
      console.error('Failed to load analytics:', err);
    }
  };

  const handleFilterSubmit = (e) => {
    e.preventDefault();
    if (selectedSupplierId) {
      fetchTransactions();
    }
  };

  const handleClearFilters = () => {
    setStartDate('');
    setEndDate('');
    if (selectedSupplierId) {
      setTimeout(() => {
        api.get(`/supplier-ledger/transactions/${selectedSupplierId}`)
          .then(res => {
            if (res.data.ok) {
              setTransactions(res.data.transactions || []);
              setOpeningBalance(res.data.openingBalance || 0);
            }
          });
      }, 50);
    }
  };

  const formatCurrency = (amt) => {
    return parseFloat(amt || 0).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  const formatDateDDMMYYYY = (dateStr) => {
    if (!dateStr) return '—';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  const formatBalance = (bal) => {
    const amount = parseFloat(bal);
    if (amount > 0) {
      return `₹ ${formatCurrency(amount)} Cr`; // Credit balance, we owe supplier
    } else if (amount < 0) {
      return `₹ ${formatCurrency(Math.abs(amount))} Dr`; // Debit balance, supplier owes us (advance paid)
    }
    return `₹ 0.00`;
  };

  const handlePrint = () => {
    window.print();
  };

  // Filter dropdown suppliers list
  const filteredSuppliers = suppliers.filter(s =>
    s.name.toLowerCase().includes(supSearch.toLowerCase()) ||
    (s.phone && s.phone.includes(supSearch))
  );

  // Print-specific style block
  const printStyles = `
    @media print {
      body {
        background: white !important;
        color: black !important;
        font-family: "Inter", sans-serif !important;
        padding: 0 !important;
        margin: 0 !important;
      }
      .no-print {
        display: none !important;
      }
      .print-layout {
        display: block !important;
        width: 100% !important;
        padding: 1.5in !important;
      }
      .print-header {
        border-bottom: 2px solid #000;
        padding-bottom: 15px;
        margin-bottom: 20px;
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
      }
      .print-title {
        font-size: 20px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 1px;
      }
      .print-summary-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 15px;
        border: 1px solid #ddd;
        border-radius: 8px;
        padding: 15px;
        background: #fdfdfd;
        margin-bottom: 25px;
      }
      .print-summary-card {
        display: flex;
        flex-direction: column;
      }
      .print-summary-label {
        font-size: 9px;
        text-transform: uppercase;
        color: #555;
        font-weight: bold;
      }
      .print-summary-value {
        font-size: 14px;
        font-weight: bold;
        margin-top: 4px;
      }
      .print-table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 10px;
      }
      .print-table th, .print-table td {
        border: 1px solid #e2e8f0;
        padding: 8px 10px;
        font-size: 11px;
        text-align: left;
      }
      .print-table th {
        background-color: #f8fafc !important;
        font-weight: bold;
        text-transform: uppercase;
      }
      .print-table td.text-right, .print-table th.text-right {
        text-align: right;
      }
    }
    @media screen {
      .print-layout {
        display: none;
      }
    }
  `;

  return (
    <div className="space-y-6 animate-fade-in max-w-6xl mx-auto pb-12">
      <style>{printStyles}</style>

      {/* HEADER SECTION (NO PRINT) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 no-print">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase">📓 SUPPLIER LEDGER</h1>
          <p className="text-slate-500 text-xs font-semibold mt-1">Chronological supplier ledger payables and purchase stats dashboard</p>
        </div>
        {selectedSupplierId && (
          <div className="flex gap-2">
            <button 
              onClick={handlePrint}
              className="btn-premium bg-primary hover:bg-blue-700 text-white text-xs h-11 px-4 flex items-center gap-1.5 shadow-md shadow-primary/15"
            >
              <span>🖨️</span> Print Statement
            </button>
            <button 
              onClick={handlePrint}
              className="btn-premium bg-white border border-slate-250 text-slate-700 hover:bg-slate-50 text-xs h-11 px-4 flex items-center gap-1.5 shadow-sm"
              title="Prints standard browser print-to-PDF format"
            >
              <span>📄</span> Export PDF
            </button>
          </div>
        )}
      </div>

      {/* FILTERS PANEL (NO PRINT) */}
      <div className="card-premium space-y-4 no-print">
        <div className="text-[11px] font-black text-slate-455 uppercase tracking-widest border-b border-slate-100 pb-2">
          <span>🔍 SUPPLIER ACCOUNT SELECTOR</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
          {/* Supplier Search & Filter Dropdown */}
          <div className="md:col-span-6 space-y-1.5">
            <label className="text-[11px] font-bold text-slate-500 block uppercase tracking-wider">
              Select Supplier
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Search..."
                value={supSearch}
                onChange={(e) => setSupSearch(e.target.value)}
                className="w-1/3 h-11 px-3 rounded-xl border border-slate-200 bg-slate-50/20 text-slate-700 placeholder:text-slate-400 focus:bg-white focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-xs font-semibold"
              />
              <select
                value={selectedSupplierId}
                onChange={(e) => setSelectedSupplierId(e.target.value)}
                className="w-2/3 h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-slate-800 font-extrabold focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm"
              >
                <option value="">-- Click to Select Supplier --</option>
                {filteredSuppliers.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.phone ? `(${s.phone})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Date Range Fields */}
          <div className="md:col-span-4 grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 block uppercase tracking-wider">
                From Date
              </label>
              <input 
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-slate-50/20 text-slate-700 focus:bg-white focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-xs font-semibold"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 block uppercase tracking-wider">
                To Date
              </label>
              <input 
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-slate-50/20 text-slate-700 focus:bg-white focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-xs font-semibold"
              />
            </div>
          </div>

          {/* Buttons */}
          <div className="md:col-span-2 flex gap-2">
            <button
              onClick={handleFilterSubmit}
              disabled={!selectedSupplierId || loading}
              className="flex-1 h-11 bg-primary hover:bg-blue-700 text-white rounded-xl text-xs font-extrabold transition-all shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center uppercase"
            >
              {loading ? '...' : 'Search'}
            </button>
            {(startDate || endDate) && (
              <button
                type="button"
                onClick={handleClearFilters}
                className="h-11 px-3 bg-white border border-slate-200 text-red-500 hover:bg-red-50 hover:border-red-100 rounded-xl text-xs font-bold transition-all flex items-center justify-center"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {selectedSupplierId ? (
        <>
          {/* SUMMARY KPI METRICS (NO PRINT) */}
          {summary && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 no-print">
              {/* Monthly Purchases */}
              <div className="card-premium flex items-center justify-between p-5 bg-white hover:scale-[1.02] transition-transform">
                <div>
                  <p className="text-[10px] font-black text-slate-450 uppercase tracking-widest">Monthly Purchases</p>
                  <h3 className="text-xl font-extrabold text-slate-850 mt-1.5">
                    ₹ {formatCurrency(summary.purchaseMonth)}
                  </h3>
                  <span className="text-[10px] text-slate-400 font-bold block mt-1">This Calendar Month</span>
                </div>
                <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center text-lg border border-blue-100 shrink-0">
                  📈
                </div>
              </div>

              {/* Yearly Purchases */}
              <div className="card-premium flex items-center justify-between p-5 bg-white hover:scale-[1.02] transition-transform">
                <div>
                  <p className="text-[10px] font-black text-slate-450 uppercase tracking-widest">Yearly Purchases</p>
                  <h3 className="text-xl font-extrabold text-slate-850 mt-1.5">
                    ₹ {formatCurrency(summary.purchaseYear)}
                  </h3>
                  <span className="text-[10px] text-slate-400 font-bold block mt-1">This Calendar Year</span>
                </div>
                <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center text-lg border border-indigo-100 shrink-0">
                  📊
                </div>
              </div>

              {/* Payments Made */}
              <div className="card-premium flex items-center justify-between p-5 bg-white hover:scale-[1.02] transition-transform">
                <div>
                  <p className="text-[10px] font-black text-slate-455 uppercase tracking-widest">Payments Made</p>
                  <h3 className="text-xl font-extrabold text-emerald-600 mt-1.5">
                    ₹ {formatCurrency(summary.paymentsMade)}
                  </h3>
                  <span className="text-[10px] text-slate-400 font-bold block mt-1">Total Debits Logged</span>
                </div>
                <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center text-lg border border-emerald-100 shrink-0">
                  💵
                </div>
              </div>

              {/* Net Outstanding Balance */}
              <div className="card-premium flex items-center justify-between p-5 bg-white hover:scale-[1.02] transition-transform">
                <div>
                  <p className="text-[10px] font-black text-slate-455 uppercase tracking-widest">Outstanding Balance</p>
                  <h3 className={`text-xl font-black mt-1.5 ${summary.outstandingDue > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {formatBalance(summary.outstandingDue)}
                  </h3>
                  <span className="text-[10px] text-slate-400 font-bold block mt-1">
                    Balance Type: <span className="font-extrabold text-slate-500">{summary.outstandingDue > 0 ? 'Credit (We Owe)' : 'Debit (Advance)'}</span>
                  </span>
                </div>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg border shrink-0 ${
                  summary.outstandingDue > 0 
                    ? 'bg-rose-50 text-rose-600 border-rose-100' 
                    : 'bg-emerald-50 text-emerald-600 border-emerald-100'
                }`}>
                  ⚖️
                </div>
              </div>
            </div>
          )}

          {/* DUAL VIEW TAB SELECTORS (NO PRINT) */}
          <div className="flex bg-slate-100 p-1.5 rounded-2xl w-fit border border-slate-200/40 no-print">
            <button
              onClick={() => setActiveTab('ledger')}
              className={`px-5 py-2.5 rounded-xl text-xs font-black tracking-wider transition-all flex items-center gap-2 ${
                activeTab === 'ledger' 
                  ? 'bg-white text-slate-800 shadow-sm font-extrabold'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <span>📒</span> TRANSACTION JOURNAL
            </button>
            <button
              onClick={() => setActiveTab('analytics')}
              className={`px-5 py-2.5 rounded-xl text-xs font-black tracking-wider transition-all flex items-center gap-2 ${
                activeTab === 'analytics' 
                  ? 'bg-white text-slate-800 shadow-sm font-extrabold'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <span>📊</span> PERFORMANCE ANALYTICS
            </button>
          </div>

          {/* TAB CONTENT 1: LEDGER TABLE */}
          {activeTab === 'ledger' && (
            <div className="card-premium space-y-4 no-print overflow-hidden">
              <div className="text-[11px] font-black text-slate-450 uppercase tracking-widest border-b border-slate-100 pb-3 flex justify-between items-center">
                <span>📖 Supplier Journal Entries</span>
                {summary && (
                  <span className="text-[10px] font-extrabold text-slate-500 lowercase bg-slate-100 px-3 py-1 rounded-full border border-slate-200/50">
                    {summary.supplierName}
                  </span>
                )}
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <span className="loading loading-spinner text-primary"></span>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black text-slate-455 uppercase tracking-wider">
                        <th className="py-4 px-5">Date</th>
                        <th className="py-4 px-5">Particulars</th>
                        <th className="py-4 px-5">Reference No</th>
                        <th className="py-4 px-5 text-right">Debit (₹) [Paid]</th>
                        <th className="py-4 px-5 text-right">Credit (₹) [Purchased]</th>
                        <th className="py-4 px-5 text-right">Balance (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700 text-xs font-semibold">
                      {/* Opening Balance Row */}
                      {startDate && (
                        <tr className="bg-slate-50/50 font-bold text-slate-500 italic">
                          <td>—</td>
                          <td className="py-3.5 px-5 uppercase text-[10px] tracking-wider font-extrabold">Opening Balance (Before {formatDateDDMMYYYY(startDate)})</td>
                          <td>—</td>
                          <td className="text-right">—</td>
                          <td className="text-right">—</td>
                          <td className="text-right font-black">
                            {formatBalance(openingBalance)}
                          </td>
                        </tr>
                      )}

                      {/* Transactions rows */}
                      {transactions.map(t => (
                        <tr key={t.id} className="hover:bg-slate-50/40 transition-colors">
                          <td className="py-3.5 px-5">{formatDateDDMMYYYY(t.date)}</td>
                          <td className="py-3.5 px-5 font-bold text-slate-800">{t.particular}</td>
                          <td className="py-3.5 px-5 font-mono text-[11px] text-slate-500 font-bold">
                            {t.referenceNo}
                          </td>
                          <td className="py-3.5 px-5 text-right font-extrabold text-emerald-600">
                            {t.debit > 0 ? `₹ ${formatCurrency(t.debit)}` : '—'}
                          </td>
                          <td className="py-3.5 px-5 text-right font-bold text-slate-700">
                            {t.credit > 0 ? `₹ ${formatCurrency(t.credit)}` : '—'}
                          </td>
                          <td className="py-3.5 px-5 text-right font-black text-slate-800">
                            {formatBalance(t.runningBalance)}
                          </td>
                        </tr>
                      ))}

                      {transactions.length === 0 && (
                        <tr>
                          <td colSpan="6" className="py-12 text-center text-slate-400 font-bold bg-slate-50/10">
                            No ledger entries found for the selected period.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB CONTENT 2: ANALYTICS */}
          {activeTab === 'analytics' && analytics && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 no-print">
              
              {/* AGEING REPORT CARD */}
              <div className="card-premium space-y-5">
                <div className="text-[11px] font-black text-slate-455 uppercase tracking-widest border-b border-slate-100 pb-2.5">
                  🛡️ Payables Ageing Buckets (FIFO)
                </div>
                
                <div className="space-y-4 pt-2">
                  {(() => {
                    const aging = summary?.aging || { bucket0_30: 0, bucket31_60: 0, bucket61_90: 0, bucket91_plus: 0 };
                    const total = Object.values(aging).reduce((a, b) => a + b, 0) || 1;
                    
                    const renderBar = (label, val, color) => {
                      const pct = Math.round((val / total) * 100);
                      return (
                        <div key={label} className="space-y-1.5">
                          <div className="flex justify-between text-xs font-bold text-slate-700">
                            <span>{label}</span>
                            <span className="font-extrabold text-slate-800">
                              ₹ {formatCurrency(val)} <span className="text-slate-400">({pct}%)</span>
                            </span>
                          </div>
                          <div className="w-full h-2.5 bg-slate-150 rounded-full overflow-hidden">
                            <div 
                              style={{ width: `${Math.max(pct, val > 0 ? 3 : 0)}%` }} 
                              className={`h-full ${color} rounded-full transition-all duration-500`}
                            ></div>
                          </div>
                        </div>
                      );
                    };

                    return [
                      renderBar('0 - 30 Days (Current)', aging.bucket0_30, 'bg-blue-500'),
                      renderBar('31 - 60 Days', aging.bucket31_60, 'bg-amber-500'),
                      renderBar('61 - 90 Days', aging.bucket61_90, 'bg-orange-500'),
                      renderBar('91+ Days (Overdue)', aging.bucket91_plus, 'bg-rose-500')
                    ];
                  })()}
                </div>
              </div>

              {/* MONTHLY VELOCITY CARD */}
              <div className="card-premium space-y-4">
                <div className="text-[11px] font-black text-slate-455 uppercase tracking-widest border-b border-slate-100 pb-2.5 flex justify-between items-center">
                  <span>📉 Monthly Purchases Velocity</span>
                  <span className="text-[9px] font-black text-slate-400 bg-slate-50 px-2 py-0.5 rounded border">LAST 6 MONTHS</span>
                </div>

                {analytics.velocity && analytics.velocity.length > 0 ? (
                  <div className="flex items-end justify-around h-44 pb-2 pt-6 px-2">
                    {(() => {
                      const maxVal = Math.max(...analytics.velocity.map(v => parseFloat(v.total_purchases)), 1000);
                      return analytics.velocity.map(v => {
                        const hPct = (parseFloat(v.total_purchases) / maxVal) * 100;
                        return (
                          <div key={v.month} className="flex flex-col items-center flex-1 group relative">
                            <div className="absolute bottom-full mb-1 bg-slate-900 text-white text-[9px] font-black py-1 px-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-md z-10">
                              ₹ {formatCurrency(v.total_purchases)}
                            </div>
                            <div 
                              style={{ height: `${Math.max(hPct, 5)}%` }}
                              className="w-8 bg-gradient-to-t from-primary/80 to-primary rounded-t-md hover:from-blue-600 hover:to-blue-700 transition-all duration-200 cursor-pointer shadow-sm"
                            ></div>
                            <span className="text-[9px] font-bold text-slate-500 mt-2">{v.month}</span>
                          </div>
                        );
                      });
                    })()}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-44 text-slate-400 text-xs font-semibold">
                    No purchase data logged in the last 6 months.
                  </div>
                )}
              </div>

              {/* STATS & BEHAVIOR */}
              <div className="card-premium space-y-4 md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Invoice aggregates */}
                <div className="space-y-4.5 border-r border-slate-100 pr-6">
                  <div className="text-[11px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 pb-2">
                    📑 Purchase Bills Aggregates
                  </div>
                  <div className="space-y-3 font-semibold text-xs text-slate-650">
                    <div className="flex justify-between">
                      <span>Total Purchase Bills:</span>
                      <span className="font-extrabold text-slate-800">{analytics.invoiceStats.totalInvoices} Bills</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Average Bill size:</span>
                      <span className="font-extrabold text-slate-800">₹ {formatCurrency(analytics.invoiceStats.avgValue)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Max single bill:</span>
                      <span className="font-extrabold text-slate-800">₹ {formatCurrency(analytics.invoiceStats.maxValue)}</span>
                    </div>
                  </div>
                </div>

                {/* Payment delay behaviour */}
                <div className="space-y-3">
                  <div className="text-[11px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 pb-2">
                    ⚡ Payment Performance
                  </div>
                  <div className="flex items-center gap-4 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                    <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center font-black text-lg border border-amber-100 shrink-0">
                      📅
                    </div>
                    <div>
                      <div className="text-xs font-black text-slate-800">
                        {analytics.avgPaymentDays === 0 ? 'Same Day (Cash/Direct)' : `${analytics.avgPaymentDays} Days Payment Lag`}
                      </div>
                      <p className="text-[10px] text-slate-450 mt-0.5 leading-normal">
                        Average duration from purchase bill generation to our payment approval
                      </p>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* ────────────────────────────────────────────────────────────────── */}
          {/*   PRINT STATEMENT CONTAINER LAYOUT (A4 PAGE SIZE STYLING)        */}
          {/* ────────────────────────────────────────────────────────────────── */}
          {summary && (
            <div className="print-layout">
              {/* Header details */}
              <div className="print-header">
                <div>
                  <div className="print-title">KEMP'S ERP — STATEMENT OF ACCOUNT (SUPPLIER)</div>
                  <div style={{ fontSize: '10px', color: '#555', marginTop: '2px', fontWeight: 'bold' }}>
                    Generated on: {new Date().toLocaleDateString('en-IN')}
                  </div>
                </div>
                <div style={{ textAlign: 'right', fontSize: '10px', fontWeight: 'bold' }}>
                  {startDate || endDate ? `Period: ${formatDateDDMMYYYY(startDate) || 'Beginning'} to ${formatDateDDMMYYYY(endDate) || 'Today'}` : 'All-time Statement'}
                </div>
              </div>

              {/* Supplier information grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px', fontSize: '11px', fontWeight: '600' }}>
                <div style={{ border: '1px solid #ddd', padding: '12px', borderRadius: '6px' }}>
                  <div style={{ textTransform: 'uppercase', color: '#777', fontSize: '9px', fontWeight: '800', marginBottom: '5px' }}>Supplier Details:</div>
                  <div style={{ fontSize: '13px', fontWeight: '800', color: '#000' }}>{summary.supplierName}</div>
                  <div>Phone: {summary.supplierPhone}</div>
                  <div>GSTIN: {summary.supplierGstin}</div>
                  <div style={{ marginTop: '5px', whiteSpace: 'pre-wrap' }}>Address: {summary.supplierAddress}</div>
                </div>
                
                <div style={{ border: '1px solid #ddd', padding: '12px', borderRadius: '6px' }}>
                  <div style={{ textTransform: 'uppercase', color: '#777', fontSize: '9px', fontWeight: '800', marginBottom: '5px' }}>Payables Summary:</div>
                  <div style={{ display: 'flex', justifyValues: 'space-between', marginBottom: '3px' }}>
                    <span>Opening Balance:</span>
                    <span style={{ marginLeft: 'auto', fontWeight: 'bold' }}>{formatBalance(openingBalance)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyValues: 'space-between', marginBottom: '3px' }}>
                    <span>Total Purchases (Credits):</span>
                    <span style={{ marginLeft: 'auto', fontWeight: 'bold' }}>₹ {formatCurrency(transactions.reduce((acc, c) => acc + c.credit, 0))}</span>
                  </div>
                  <div style={{ display: 'flex', justifyValues: 'space-between', marginBottom: '3px' }}>
                    <span>Total Payments (Debits):</span>
                    <span style={{ marginLeft: 'auto', fontWeight: 'bold', color: 'green' }}>₹ {formatCurrency(transactions.reduce((acc, c) => acc + c.debit, 0))}</span>
                  </div>
                  <div style={{ display: 'flex', justifyValues: 'space-between', borderTop: '1px dashed #ccc', marginTop: '6px', paddingTop: '4px', fontSize: '12px', fontWeight: '800' }}>
                    <span>Outstanding Payables:</span>
                    <span style={{ marginLeft: 'auto' }}>{formatBalance(summary.outstandingDue)}</span>
                  </div>
                </div>
              </div>

              {/* Transactions journal */}
              <table className="print-table">
                <thead>
                  <tr>
                    <th style={{ width: '15%' }}>Date</th>
                    <th style={{ width: '45%' }}>Particulars</th>
                    <th style={{ width: '15%' }}>Reference</th>
                    <th className="text-right" style={{ width: '12%' }}>Debit (₹) [Paid]</th>
                    <th className="text-right" style={{ width: '12%' }}>Credit (₹) [Billed]</th>
                    <th className="text-right" style={{ width: '16%' }}>Balance (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {startDate && (
                    <tr style={{ fontStyle: 'italic', fontWeight: 'bold', backgroundColor: '#fafafa' }}>
                      <td>—</td>
                      <td>OPENING BALANCE (PREVIOUS ENTRIES)</td>
                      <td>—</td>
                      <td className="text-right">—</td>
                      <td className="text-right">—</td>
                      <td className="text-right">{formatBalance(openingBalance)}</td>
                    </tr>
                  )}
                  {transactions.map(t => (
                    <tr key={t.id}>
                      <td>{formatDateDDMMYYYY(t.date)}</td>
                      <td style={{ fontWeight: 'bold' }}>{t.particular}</td>
                      <td style={{ fontFamily: 'monospace' }}>{t.referenceNo}</td>
                      <td className="text-right" style={{ color: 'green' }}>{t.debit > 0 ? formatCurrency(t.debit) : '—'}</td>
                      <td className="text-right">{t.credit > 0 ? formatCurrency(t.credit) : '—'}</td>
                      <td className="text-right" style={{ fontWeight: 'bold' }}>{formatBalance(t.runningBalance)}</td>
                    </tr>
                  ))}
                  {transactions.length === 0 && (
                    <tr>
                      <td colSpan="6" style={{ textAlign: 'center', padding: '20px 0', color: '#666' }}>
                        No ledger transactions found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* Footer authorization details */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '80px', fontSize: '10px', fontWeight: 'bold' }}>
                <div style={{ borderTop: '1px solid #000', width: '200px', textAlign: 'center', paddingTop: '5px' }}>
                  Supplier Signature
                </div>
                <div style={{ borderTop: '1px solid #000', width: '200px', textAlign: 'center', paddingTop: '5px' }}>
                  Authorized Signatory
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        /* EMPTY SELECTION PLACEHOLDER (NO PRINT) */
        <div className="card-premium py-20 text-center text-slate-400 font-bold flex flex-col items-center justify-center gap-3 no-print bg-white border border-slate-200/50">
          <div className="w-16 h-16 bg-slate-50 text-slate-400 rounded-3xl flex items-center justify-center text-3xl border border-slate-100 shadow-inner">
            📓
          </div>
          <div>
            <h3 className="text-slate-700 text-sm font-extrabold">No Supplier Selected</h3>
            <p className="text-slate-400 text-xs font-semibold mt-1">Select a supplier above to view their payables ledger statements and statistics analysis.</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default SupplierLedger;
