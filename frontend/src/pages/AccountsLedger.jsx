import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import SearchableSelect from '../components/SearchableSelect';

const AccountsLedger = () => {
  // Navigation & Tabs
  const [activeTab, setActiveTab] = useState('ledger'); // 'ledger' | 'analytics'

  // Dropdown options
  const [customers, setCustomers] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [custSearch, setCustSearch] = useState('');

  // Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [branch, setBranch] = useState('All');
  const [transactionType, setTransactionType] = useState('All');
  const [referenceNoFilter, setReferenceNoFilter] = useState('');

  // Data states
  const [summary, setSummary] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Document details view modal
  const [viewingBill, setViewingBill] = useState(null);
  const [viewingBillItems, setViewingBillItems] = useState([]);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [editForm, setEditForm] = useState({ date: '', particular: '', debit: '', credit: '' });
  const [savingEdit, setSavingEdit] = useState(false);

  // Advance Payment Modal States
  const [isAdvanceModalOpen, setIsAdvanceModalOpen] = useState(false);
  const [advanceForm, setAdvanceForm] = useState({
    customerId: '',
    company: '',
    paymentDate: '',
    cashAmount: '',
    bankAmount: '',
    upiAmount: '',
    remarks: ''
  });
  const [advanceError, setAdvanceError] = useState('');
  const [advanceSuccess, setAdvanceSuccess] = useState('');
  const [isSavingAdvance, setIsSavingAdvance] = useState(false);

  const renderLineChart = (data, key, strokeColor, gradId) => {
    if (!data || data.length === 0) return null;
    const values = data.map(d => parseFloat(d[key]) || 0);
    const maxVal = Math.max(...values, 1000);
    const height = 120;
    const width = 300;
    const padding = 15;
    const chartHeight = height - padding * 2;
    const chartWidth = width - padding * 2;

    const points = data.map((d, i) => {
      const x = padding + i * (chartWidth / (data.length - 1));
      const val = parseFloat(d[key]) || 0;
      const y = padding + chartHeight - (val / maxVal) * chartHeight;
      return { x, y, val, month: d.month };
    });

    const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const areaD = `${pathD} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`;

    return (
      <div className="relative group">
        <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={strokeColor} stopOpacity="0.25"/>
              <stop offset="100%" stopColor={strokeColor} stopOpacity="0.00"/>
            </linearGradient>
          </defs>
          <line x1={padding} y1={padding} x2={width - padding} y2={padding} stroke="#e2e8f0" strokeDasharray="3 3"/>
          <line x1={padding} y1={padding + chartHeight / 2} x2={width - padding} y2={padding + chartHeight / 2} stroke="#e2e8f0" strokeDasharray="3 3"/>
          <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#cbd5e1" strokeWidth="1"/>
          <path d={areaD} fill={`url(#${gradId})`} />
          <path d={pathD} fill="none" stroke={strokeColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          {points.map((p, i) => (
            <g key={i} className="cursor-pointer">
              <circle cx={p.x} cy={p.y} r="3" fill="#ffffff" stroke={strokeColor} strokeWidth="2" className="transition-all hover:r-5 hover:stroke-width-3" />
              <title>{`${p.month}: ₹${p.val.toLocaleString('en-IN')}`}</title>
            </g>
          ))}
        </svg>
      </div>
    );
  };

  const renderBarChart = (data, key, barColor) => {
    if (!data || data.length === 0) return null;
    const values = data.map(d => parseFloat(d[key]) || 0);
    const maxVal = Math.max(...values, 1000);
    const height = 120;
    const width = 300;
    const padding = 15;
    const chartHeight = height - padding * 2;
    const chartWidth = width - padding * 2;

    const colWidth = chartWidth / data.length;
    const barWidth = colWidth * 0.6;

    const bars = data.map((d, i) => {
      const val = parseFloat(d[key]) || 0;
      const h = (val / maxVal) * chartHeight;
      const x = padding + i * colWidth + (colWidth - barWidth) / 2;
      const y = padding + chartHeight - h;
      return { x, y, width: barWidth, height: h, val, month: d.month };
    });

    return (
      <div className="relative group">
        <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
          <line x1={padding} y1={padding} x2={width - padding} y2={padding} stroke="#e2e8f0" strokeDasharray="3 3"/>
          <line x1={padding} y1={padding + chartHeight / 2} x2={width - padding} y2={padding + chartHeight / 2} stroke="#e2e8f0" strokeDasharray="3 3"/>
          <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#cbd5e1" strokeWidth="1"/>
          {bars.map((b, i) => (
            <g key={i} className="cursor-pointer">
              <rect x={b.x} y={b.y} width={b.width} height={Math.max(b.height, 1)} fill={barColor} rx="1.5" className="transition-all hover:opacity-85" />
              <title>{`${b.month}: ₹${b.val.toLocaleString('en-IN')}`}</title>
            </g>
          ))}
        </svg>
      </div>
    );
  };

  // Fetch customer list on mount
  useEffect(() => {
    fetchCustomers();
  }, []);

  // Re-fetch data when customer changes
  useEffect(() => {
    if (selectedCustomerId) {
      fetchSummary();
      fetchTransactions();
      fetchAnalytics();
    } else {
      setSummary(null);
      setTransactions([]);
      setOpeningBalance(0);
      setAnalytics(null);
    }
  }, [selectedCustomerId]);

  const fetchCustomers = async () => {
    try {
      const res = await api.get('/accounts-ledger/customers');
      if (res.data.ok) {
        setCustomers(res.data.customers || []);
      }
    } catch (err) {
      console.error('Failed to load customers:', err);
    }
  };

  const handleOpenAdvanceModal = () => {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const istDate = new Date(now.getTime() + (330 + offset) * 60000);
    const yyyy = istDate.getFullYear();
    const mm = String(istDate.getMonth() + 1).padStart(2, '0');
    const dd = String(istDate.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;

    setAdvanceForm({
      customerId: selectedCustomerId || (customers.length > 0 ? customers[0].id : ''),
      company: '',
      paymentDate: todayStr,
      cashAmount: '',
      bankAmount: '',
      upiAmount: '',
      remarks: ''
    });
    setAdvanceError('');
    setAdvanceSuccess('');
    setIsAdvanceModalOpen(true);
  };

  const handleAdvanceQuickFill = (mode, amountVal) => {
    const amtStr = String(amountVal || 0);
    if (mode === 'cash') setAdvanceForm(prev => ({ ...prev, cashAmount: amtStr, bankAmount: '0', upiAmount: '0' }));
    if (mode === 'bank') setAdvanceForm(prev => ({ ...prev, cashAmount: '0', bankAmount: amtStr, upiAmount: '0' }));
    if (mode === 'upi') setAdvanceForm(prev => ({ ...prev, cashAmount: '0', bankAmount: '0', upiAmount: amtStr }));
  };

  const handleSaveAdvancePayment = async (e) => {
    e.preventDefault();
    setAdvanceError('');
    setAdvanceSuccess('');

    const cash = parseFloat(advanceForm.cashAmount) || 0;
    const bank = parseFloat(advanceForm.bankAmount) || 0;
    const upi = parseFloat(advanceForm.upiAmount) || 0;
    const total = cash + bank + upi;

    if (!advanceForm.customerId) return setAdvanceError('Please select a customer.');
    if (!advanceForm.company) return setAdvanceError('Company selection is mandatory. Please select a company from the dropdown.');
    if (!advanceForm.paymentDate) return setAdvanceError('Payment date is required.');
    if (total <= 0) return setAdvanceError('Please enter at least one payment amount (Cash, Bank, or UPI).');

    setIsSavingAdvance(true);
    try {
      const res = await api.post('/accounts-ledger/advance-payment', {
        customerId: advanceForm.customerId,
        company: advanceForm.company,
        paymentDate: advanceForm.paymentDate,
        cashAmount: cash,
        bankAmount: bank,
        upiAmount: upi,
        remarks: advanceForm.remarks
      });

      if (res.data.ok) {
        setAdvanceSuccess(res.data.message || 'Advance payment recorded successfully!');
        setTimeout(() => {
          setIsAdvanceModalOpen(false);
          if (advanceForm.customerId === selectedCustomerId) {
            fetchSummary();
            fetchTransactions();
            fetchAnalytics();
          } else {
            setSelectedCustomerId(advanceForm.customerId);
          }
        }, 1200);
      } else {
        setAdvanceError(res.data.error || 'Failed to record advance payment.');
      }
    } catch (err) {
      setAdvanceError(err.response?.data?.error || err.message || 'An error occurred.');
    } finally {
      setIsSavingAdvance(false);
    }
  };

  const fetchSummary = async () => {
    try {
      const res = await api.get(`/accounts-ledger/summary/${selectedCustomerId}`, {
        params: {
          startDate,
          endDate,
          branch,
          transactionType
        }
      });
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
      fetchSummary();
      const res = await api.get(`/accounts-ledger/transactions/${selectedCustomerId}`, {
        params: { 
          startDate, 
          endDate,
          branch,
          transactionType,
          referenceNo: referenceNoFilter
        }
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
      const res = await api.get(`/accounts-ledger/analytics/${selectedCustomerId}`);
      if (res.data.ok) {
        setAnalytics(res.data);
      }
    } catch (err) {
      console.error('Failed to load analytics:', err);
    }
  };

  const handleDrillDown = (type) => {
    setTransactionType(type);
    setTimeout(() => {
      fetchTransactions();
      const journalCard = document.getElementById('transaction-journal-card');
      if (journalCard) {
        journalCard.scrollIntoView({ behavior: 'smooth' });
      }
    }, 50);
  };

  const handleFilterSubmit = (e) => {
    if (e) e.preventDefault();
    if (selectedCustomerId) {
      fetchTransactions();
    }
  };

  const handleClearFilters = () => {
    setStartDate('');
    setEndDate('');
    setBranch('All');
    setTransactionType('All');
    setReferenceNoFilter('');
    if (selectedCustomerId) {
      setTimeout(() => {
        api.get(`/accounts-ledger/transactions/${selectedCustomerId}`, {
          params: {
            branch: 'All',
            transactionType: 'All',
            referenceNo: ''
          }
        })
        .then(res => {
          if (res.data.ok) {
            setTransactions(res.data.transactions || []);
            setOpeningBalance(res.data.openingBalance || 0);
          }
        });
      }, 50);
    }
  };

  // Helper to open document preview
  const handleOpenDocument = async (referenceNo) => {
    if (!referenceNo) return;
    
    // Resolve clean bill ID if reference starts with SR-
    let cleanRef = referenceNo;
    if (referenceNo.startsWith('SR-')) {
      try {
        const response = await api.get(`/sales-return/${referenceNo}`);
        if (response.data.ok && response.data.salesReturn) {
          cleanRef = response.data.salesReturn.bill_id;
        }
      } catch (e) {
        console.error('Failed to resolve sales return reference:', e);
      }
    }

    if (cleanRef.startsWith('BILL-')) {
      try {
        const res = await api.get(`/billing/${cleanRef}`);
        if (res.data.ok) {
          setViewingBill(res.data.bill);
          setViewingBillItems(res.data.items || []);
          setIsViewModalOpen(true);
        } else {
          alert('Could not find original invoice details.');
        }
      } catch (err) {
        console.error('Failed to fetch invoice details:', err);
        alert('Failed to retrieve invoice document.');
      }
    } else {
      alert(`Original document view is not supported for reference format: ${referenceNo}`);
    }
  };

  const handleEditTransaction = (transaction) => {
    setEditingTransaction(transaction);
    setEditForm({
      date: transaction.date || '',
      particular: transaction.particular || '',
      debit: transaction.debit > 0 ? String(transaction.debit) : '',
      credit: transaction.credit > 0 ? String(transaction.credit) : ''
    });
  };

  const handleSaveTransaction = async (event) => {
    event.preventDefault();
    const debit = Number(editForm.debit || 0);
    const credit = Number(editForm.credit || 0);
    if ((debit <= 0 && credit <= 0) || (debit > 0 && credit > 0)) {
      alert('Enter an amount in either Debit or Credit, but not both.');
      return;
    }
    setSavingEdit(true);
    try {
      const res = await api.put(`/accounts-ledger/transactions/${editingTransaction.id}`, {
        customerId: selectedCustomerId,
        date: editForm.date,
        particular: editForm.particular,
        debit,
        credit
      });
      if (res.data.ok) {
        setEditingTransaction(null);
        await Promise.all([fetchTransactions(), fetchSummary(), fetchAnalytics()]);
      }
    } catch (err) {
      console.error('Failed to update journal entry:', err);
      alert(err.response?.data?.error || 'Failed to update journal entry.');
    } finally {
      setSavingEdit(false);
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

  /**
   * Formats a ledger balance.
   * Convention: positive value = Debit (customer owes money)
   *             negative value = Credit (customer has excess / overpaid)
   */
  const formatBalance = (bal) => {
    const amount = parseFloat(bal);
    if (isNaN(amount)) return '₹ 0.00';
    if (amount > 0.004) {
      return `₹ ${formatCurrency(amount)} Dr`;
    } else if (amount < -0.004) {
      return `₹ ${formatCurrency(Math.abs(amount))} Cr`;
    }
    return `₹ 0.00`;
  };

  const handlePrint = () => {
    window.print();
  };

  const handleRefresh = async () => {
    if (!selectedCustomerId || refreshing) return;
    setRefreshing(true);
    try {
      await Promise.all([
        fetchCustomers(),
        fetchTransactions(),
        fetchAnalytics()
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  /**
   * Export the ledger as an Excel-compatible CSV file.
   * Uses UTF-8 BOM so Excel auto-detects encoding correctly.
   */
  const handleExportExcel = () => {
    if (!summary || transactions.length === 0) {
      alert('No transactions to export. Please select a customer and load data first.');
      return;
    }

    const customerName = summary.customerName || 'Customer';
    const now = new Date();
    const dateStr = `${now.getDate().toString().padStart(2,'0')}-${(now.getMonth()+1).toString().padStart(2,'0')}-${now.getFullYear()}`;
    const periodLabel = (startDate || endDate)
      ? `${formatDateDDMMYYYY(startDate) || 'Beginning'} to ${formatDateDDMMYYYY(endDate) || 'Today'}`
      : 'All Time';

    // Helper to escape a CSV cell value
    const cell = (val) => {
      const s = String(val ?? '');
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const rows = [];

    // Header
    rows.push([cell("KEMP'S ERP — STATEMENT OF ACCOUNT")]);
    rows.push([cell(`Generated On:`), cell(dateStr)]);
    rows.push([cell(`Period:`), cell(periodLabel)]);
    rows.push([]);

    // Customer details
    rows.push([cell('CUSTOMER DETAILS')]);
    rows.push([cell('Name:'),    cell(summary.customerName)]);
    rows.push([cell('Phone:'),   cell(summary.customerPhone)]);
    rows.push([cell('GSTIN:'),   cell(summary.customerGstin)]);
    rows.push([cell('Address:'), cell(summary.customerAddress)]);
    rows.push([]);

    // Account summary KPIs
    rows.push([cell('ACCOUNT SUMMARY')]);
    rows.push([cell('Gross Sales'),       cell(`Rs ${formatCurrency(summary.grossSales)}`)]);
    rows.push([cell('Sales Return'),      cell(`Rs ${formatCurrency(summary.salesReturn)}`)]);
    rows.push([cell('Net Sales'),         cell(`Rs ${formatCurrency(summary.netSales)}`)]);
    rows.push([cell('Payments Received'), cell(`Rs ${formatCurrency(summary.paymentsReceived)}`)]);
    rows.push([cell('Outstanding Due'),  cell(`Rs ${formatCurrency(summary.outstandingDue)} Dr`)]);
    rows.push([cell('Credit/Advance Balance'), cell(`Rs ${formatCurrency(summary.creditBalance)} Cr`)]);
    rows.push([cell('Monthly Sales'),     cell(`Rs ${formatCurrency(summary.salesMonth)}`)]);
    rows.push([cell('Yearly Sales'),      cell(`Rs ${formatCurrency(summary.salesYear)}`)]);
    rows.push([]);

    // Transactions Table
    rows.push([cell('TRANSACTION JOURNAL')]);
    rows.push([
      cell('Date'),
      cell('Transaction Type'),
      cell('Reference No'),
      cell('Particulars/Description'),
      cell('Debit (Rs)'),
      cell('Credit (Rs)'),
      cell('Balance (Rs)'),
      cell('Branch'),
      cell('Remarks')
    ]);

    // Opening balance row
    if (startDate) {
      const ob = parseFloat(openingBalance);
      const obLabel = ob > 0.004 ? `${formatCurrency(ob)} Dr` : ob < -0.004 ? `${formatCurrency(Math.abs(ob))} Cr` : '0.00';
      rows.push([
        cell('—'),
        cell('Opening Balance'),
        cell('—'),
        cell(`Opening Balance (Before ${formatDateDDMMYYYY(startDate)})`),
        cell('—'),
        cell('—'),
        cell(obLabel),
        cell('—'),
        cell('—')
      ]);
    }

    transactions.forEach(t => {
      const bal = parseFloat(t.runningBalance);
      const balLabel = bal > 0.004 ? `${formatCurrency(bal)} Dr` : bal < -0.004 ? `${formatCurrency(Math.abs(bal))} Cr` : '0.00';
      rows.push([
        cell(formatDateDDMMYYYY(t.date)),
        cell(t.entryType),
        cell(t.referenceNo),
        cell(t.particular),
        cell(t.debit > 0 ? t.debit.toFixed(2) : ''),
        cell(t.credit > 0 ? t.credit.toFixed(2) : ''),
        cell(balLabel),
        cell(t.branch || 'Main Branch'),
        cell(t.remarks || '')
      ]);
    });

    // Totals row
    const totalDr = transactions.reduce((s, t) => s + t.debit, 0);
    const totalCr = transactions.reduce((s, t) => s + t.credit, 0);
    rows.push([
      cell(''),
      cell('TOTAL'),
      cell(''),
      cell(''),
      cell(totalDr > 0 ? totalDr.toFixed(2) : '0.00'),
      cell(totalCr > 0 ? totalCr.toFixed(2) : '0.00'),
      cell(''),
      cell(''),
      cell('')
    ]);

    const csvContent = '\uFEFF' + rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `AccountsLedger_${customerName.replace(/\s+/g, '_')}_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Filter dropdown customers list
  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(custSearch.toLowerCase()) ||
    c.phone.includes(custSearch)
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
          <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase">📒 ACCOUNTS LEDGER</h1>
          <p className="text-slate-500 text-xs font-semibold mt-1">Chronological customer ledger balances and sales metrics dashboard</p>
        </div>
        {selectedCustomerId && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="btn-premium bg-slate-700 hover:bg-slate-800 text-white text-xs h-11 px-4 flex items-center gap-1.5 shadow-md shadow-slate-700/15 disabled:opacity-60 disabled:cursor-not-allowed"
              title="Refresh account ledger data"
            >
              <span className={refreshing ? 'inline-block animate-spin' : ''}>↻</span>
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
            <button 
              onClick={handlePrint}
              className="btn-premium bg-primary hover:bg-blue-700 text-white text-xs h-11 px-4 flex items-center gap-1.5 shadow-md shadow-primary/15"
            >
              <span>🖨️</span> Print Statement
            </button>
            <button 
              onClick={handleExportExcel}
              className="btn-premium bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-11 px-4 flex items-center gap-1.5 shadow-md shadow-emerald-600/20"
              title="Download as Excel-compatible CSV file"
            >
              <span>📊</span> Export Excel
            </button>
          </div>
        )}
      </div>

      {/* FILTERS PANEL (NO PRINT) */}
      <div className="card-premium space-y-4 no-print">
        <div className="text-[11px] font-black text-slate-450 uppercase tracking-widest border-b border-slate-100 pb-2">
          <span>🔍 CUSTOMER ACCOUNT SELECTOR &amp; FILTERS</span>
        </div>

        <div className="space-y-4">
          {/* Selected Customer dropdown */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
            <div className="md:col-span-12 space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 block uppercase tracking-wider">
                Select Customer
              </label>
              <SearchableSelect
                options={customers.map(c => ({ value: c.id, label: `${c.name} (${c.phone})` }))}
                value={selectedCustomerId}
                onChange={(val) => setSelectedCustomerId(val)}
                placeholder="-- Click to Search or Select Customer --"
                searchPlaceholder="Search by customer name or phone number..."
              />
            </div>
          </div>

          {/* Search filters row */}
          {selectedCustomerId && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end pt-2 border-t border-slate-100">
              {/* Branch/Company Filter */}
              <div className="md:col-span-3 space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 block uppercase tracking-wider">
                  Branch / Company
                </label>
                <select
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-slate-850 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-xs font-bold"
                >
                  <option value="All">All Branches</option>
                  <option value="Kemps Pet">Kemps Pet</option>
                  <option value="Kempannavar">Kempannavar</option>
                  <option value="Main Branch">Main Branch</option>
                </select>
              </div>

              {/* Transaction Type Filter */}
              <div className="md:col-span-3 space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 block uppercase tracking-wider">
                  Transaction Type
                </label>
                <select
                  value={transactionType}
                  onChange={(e) => setTransactionType(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-slate-850 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-xs font-bold"
                >
                  <option value="All">All Types</option>
                  <option value="Sale Invoice">Sale Invoice</option>
                  <option value="Payment">Payment</option>
                  <option value="Sales Return">Sales Return</option>
                  <option value="Credit Note">Credit Note</option>
                  <option value="Debit Note">Debit Note</option>
                  <option value="Advance Payment">Advance Payment</option>
                  <option value="Refund">Refund</option>
                </select>
              </div>

              {/* Reference Search */}
              <div className="md:col-span-3 space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 block uppercase tracking-wider">
                  Ref / Invoice / Payment No
                </label>
                <input
                  type="text"
                  placeholder="Enter reference No..."
                  value={referenceNoFilter}
                  onChange={(e) => setReferenceNoFilter(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-slate-50/20 text-slate-700 focus:bg-white focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-xs font-semibold"
                />
              </div>

              {/* Date Filters */}
              <div className="md:col-span-3 grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-500 block uppercase tracking-wider">
                    From
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
                    To
                  </label>
                  <input 
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-slate-50/20 text-slate-700 focus:bg-white focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-xs font-semibold"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Action buttons */}
          {selectedCustomerId && (
            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={handleFilterSubmit}
                disabled={loading}
                className="w-32 h-11 bg-primary hover:bg-blue-700 text-white rounded-xl text-xs font-extrabold transition-all shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center uppercase"
              >
                {loading ? '...' : 'Search'}
              </button>
              {(startDate || endDate || branch !== 'All' || transactionType !== 'All' || referenceNoFilter) && (
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="h-11 px-4 bg-white border border-slate-200 text-red-500 hover:bg-red-50 hover:border-red-100 rounded-xl text-xs font-bold transition-all flex items-center justify-center"
                >
                  Clear Filters
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {selectedCustomerId ? (
        <>
          {/* SUMMARY FINANCIAL DASHBOARD (NO PRINT) */}
          {summary && (
            <div className="space-y-6 no-print">
              
              {/* ROW 1: FINANCIAL SUMMARY CARDS */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
                {/* 1. Gross Sales (Blue) */}
                <div 
                  onClick={() => handleDrillDown('Sale Invoice')}
                  className="card-premium flex flex-col items-center text-center gap-2.5 p-4 bg-white border-t-4 border-blue-500 hover:scale-[1.02] cursor-pointer transition-all shadow-sm hover:shadow-md"
                  title="Click to filter ledger by Sale Invoices"
                >
                  <div className="w-9 h-9 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center text-base border border-blue-100 shrink-0">
                    🧾
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-slate-455 uppercase tracking-wider">Gross Sales</p>
                    <h3 className="text-lg font-black text-blue-600 mt-1 flex items-center justify-center gap-1">
                      <span>₹</span>
                      <span>{formatCurrency(summary.grossSales)}</span>
                    </h3>
                    <span className="text-[9px] text-slate-400 font-bold block mt-0.5">Total Invoice Value</span>
                  </div>
                </div>

                {/* 2. Sales Return (Orange) */}
                <div 
                  onClick={() => handleDrillDown('Sales Return')}
                  className="card-premium flex flex-col items-center text-center gap-2.5 p-4 bg-white border-t-4 border-orange-500 hover:scale-[1.02] cursor-pointer transition-all shadow-sm hover:shadow-md"
                  title="Click to filter ledger by Sales Returns"
                >
                  <div className="w-9 h-9 bg-orange-50 text-orange-600 rounded-lg flex items-center justify-center text-base border border-orange-100 shrink-0">
                    🔄
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-slate-450 uppercase tracking-wider">Sales Return</p>
                    <h3 className="text-lg font-black text-orange-600 mt-1 flex items-center justify-center gap-1">
                      <span>₹</span>
                      <span>{formatCurrency(summary.salesReturn)}</span>
                    </h3>
                    <span className="text-[9px] text-slate-400 font-bold block mt-0.5">Total Credit Notes</span>
                  </div>
                </div>

                {/* 3. Net Sales (Green) */}
                <div 
                  className="card-premium flex flex-col items-center text-center gap-2.5 p-4 bg-white border-t-4 border-emerald-500 hover:scale-[1.02] transition-all shadow-sm"
                >
                  <div className="w-9 h-9 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center text-base border border-emerald-100 shrink-0">
                    📈
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-slate-455 uppercase tracking-wider">Net Sales</p>
                    <h3 className="text-lg font-black text-emerald-600 mt-1 flex items-center justify-center gap-1">
                      <span>₹</span>
                      <span>{formatCurrency(summary.netSales)}</span>
                    </h3>
                    <span className="text-[9px] text-slate-400 font-bold block mt-0.5">Gross Sales − Returns</span>
                  </div>
                </div>

                {/* 4. Payments Received (Emerald Green) */}
                <div 
                  onClick={() => handleDrillDown('Payment')}
                  className="card-premium flex flex-col items-center text-center gap-2.5 p-4 bg-white border-t-4 border-teal-500 hover:scale-[1.02] cursor-pointer transition-all shadow-sm hover:shadow-md"
                  title="Click to filter ledger by Payments Received"
                >
                  <div className="w-9 h-9 bg-teal-50 text-teal-600 rounded-lg flex items-center justify-center text-base border border-teal-100 shrink-0">
                    💵
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-slate-455 uppercase tracking-wider">Payments Received</p>
                    <h3 className="text-lg font-black text-teal-600 mt-1 flex items-center justify-center gap-1">
                      <span>₹</span>
                      <span>{formatCurrency(summary.paymentsReceived)}</span>
                    </h3>
                    <span className="text-[9px] text-slate-400 font-bold block mt-0.5">Actual Money Inflows</span>
                  </div>
                </div>

                {/* 5. Refunds Paid (Red) */}
                <div 
                  onClick={() => handleDrillDown('Refund')}
                  className="card-premium flex flex-col items-center text-center gap-2.5 p-4 bg-white border-t-4 border-rose-500 hover:scale-[1.02] cursor-pointer transition-all shadow-sm hover:shadow-md"
                  title="Click to filter ledger by Refunds Paid"
                >
                  <div className="w-9 h-9 bg-rose-50 text-rose-600 rounded-lg flex items-center justify-center text-base border border-rose-100 shrink-0">
                    💸
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-slate-455 uppercase tracking-wider">Refunds Paid</p>
                    <h3 className="text-lg font-black text-rose-600 mt-1 flex items-center justify-center gap-1">
                      <span>₹</span>
                      <span>{formatCurrency(summary.refundsPaid?.total || 0)}</span>
                    </h3>
                    <span className="text-[9px] text-slate-400 font-bold block mt-0.5">Actual Cash/UPI Out</span>
                  </div>
                </div>

                {/* 6. Outstanding Balance (Red when > 0, otherwise Slate) */}
                <div 
                  className={`card-premium flex flex-col items-center text-center gap-2.5 p-4 bg-white border-t-4 hover:scale-[1.02] transition-all shadow-sm ${
                    summary.outstandingDue > 0.004 ? 'border-red-500' : 'border-slate-300'
                  }`}
                >
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-base border shrink-0 ${
                    summary.outstandingDue > 0.004
                      ? 'bg-red-50 text-red-600 border-red-100' 
                      : 'bg-slate-50 text-slate-400 border-slate-200'
                  }`}>
                    ⚖️
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-slate-455 uppercase tracking-wider">Outstanding Due</p>
                    <h3 className={`text-lg font-black mt-1 flex items-center justify-center gap-1 ${
                      summary.outstandingDue > 0.004 ? 'text-red-600' : 'text-slate-800'
                    }`}>
                      <span>₹</span>
                      <span>{formatCurrency(summary.outstandingDue)}</span>
                    </h3>
                    <span className="text-[9px] text-slate-400 font-bold block mt-0.5">
                      {summary.outstandingDue > 0.004 ? 'Dues Outstanding' : 'Account Settled'}
                    </span>
                  </div>
                </div>

                {/* 7. Customer Credit Balance (Purple) */}
                <div 
                  onClick={() => handleDrillDown('Credit Note')}
                  className="card-premium flex flex-col items-center text-center gap-2.5 p-4 bg-white border-t-4 border-purple-500 hover:scale-[1.02] cursor-pointer transition-all shadow-sm hover:shadow-md"
                  title="Click to filter ledger by Credit Notes"
                >
                  <div className="w-9 h-9 bg-purple-50 text-purple-600 rounded-lg flex items-center justify-center text-base border border-purple-100 shrink-0">
                    🪙
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-slate-455 uppercase tracking-wider">Credit Balance</p>
                    <h3 className={`text-lg font-black mt-1 flex items-center justify-center gap-1 ${
                      summary.creditBalance > 0.004 ? 'text-purple-600' : 'text-slate-800'
                    }`}>
                      <span>₹</span>
                      <span>{formatCurrency(summary.creditBalance)}</span>
                    </h3>
                    <span className="text-[9px] text-slate-400 font-bold block mt-0.5">Unused Credits</span>
                  </div>
                </div>
              </div>

              {/* ADVANCE PAYMENT ACTION BAR */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-gradient-to-r from-emerald-50 via-teal-50 to-indigo-50 border border-teal-200/80 rounded-2xl shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-teal-600 text-white rounded-xl flex items-center justify-center text-lg shadow-sm font-bold shrink-0">
                    💳
                  </div>
                  <div>
                    <span className="text-[11px] font-black text-teal-800 uppercase tracking-widest block">Customer Advance Collection</span>
                    <span className="text-xs font-semibold text-slate-600 block mt-0.5">Collect advance payments directly into customer account ledger with multi-payment mode support.</span>
                  </div>
                </div>
                <button
                  onClick={handleOpenAdvanceModal}
                  className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all flex items-center gap-2 shadow-md hover:shadow-lg shrink-0 cursor-pointer"
                >
                  <span>⚡</span> Advance Payment
                </button>
              </div>

              {/* ROW 2: BUSINESS INSIGHTS STATS PANEL */}
              <div className="card-premium p-4 bg-slate-50/50 border border-slate-200/50 rounded-2xl">
                <span className="text-[10px] font-black text-slate-455 uppercase tracking-widest block mb-3 border-b border-slate-200 pb-1.5">💼 CUSTOMER INSIGHTS &amp; AGILITY</span>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                  <div className="flex flex-col">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Total Invoices</span>
                    <span className="text-xs font-black text-slate-800 mt-1">{summary.businessInsights?.totalInvoices || 0}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Total Payments</span>
                    <span className="text-xs font-black text-slate-850 mt-1">{summary.businessInsights?.totalPayments || 0}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Total Returns</span>
                    <span className="text-xs font-black text-slate-850 mt-1">{summary.businessInsights?.totalReturns || 0}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Avg Collection Lag</span>
                    <span className="text-xs font-black text-slate-850 mt-1">{summary.businessInsights?.avgCollectionDays || 0} Days</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Last Invoice Date</span>
                    <span className="text-xs font-black text-slate-850 mt-1">{formatDateDDMMYYYY(summary.businessInsights?.lastInvoiceDate)}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Last Payment Date</span>
                    <span className="text-xs font-black text-emerald-600 mt-1">{formatDateDDMMYYYY(summary.businessInsights?.lastPaymentDate)}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Last Return Date</span>
                    <span className="text-xs font-black text-orange-500 mt-1">{formatDateDDMMYYYY(summary.businessInsights?.lastReturnDate)}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Customer Since</span>
                    <span className="text-xs font-black text-slate-850 mt-1">{formatDateDDMMYYYY(summary.businessInsights?.customerSince)}</span>
                  </div>
                </div>
              </div>

              {/* ROW 3: PAYMENT BREAKDOWN Stacked Bar */}
              <div className="card-premium p-4 bg-white shadow-sm border border-slate-200/40 rounded-2xl space-y-3">
                <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                  <span className="text-[10px] font-black text-slate-455 uppercase tracking-widest block">💳 PAYMENT BREAKDOWN</span>
                  <span className="text-xs font-black text-slate-650">
                    Total Received: ₹ {formatCurrency((summary.paymentBreakdown?.cash || 0) + (summary.paymentBreakdown?.bank || 0) + (summary.paymentBreakdown?.upi || 0) + (summary.paymentBreakdown?.cheque || 0) + (summary.paymentBreakdown?.online || 0))}
                  </span>
                </div>
                
                {/* Horizontal Segmented Progress Bar */}
                {(() => {
                  const cash = summary.paymentBreakdown?.cash || 0;
                  const bank = summary.paymentBreakdown?.bank || 0;
                  const upi = summary.paymentBreakdown?.upi || 0;
                  const cheque = summary.paymentBreakdown?.cheque || 0;
                  const online = summary.paymentBreakdown?.online || 0;
                  const total = cash + bank + upi + cheque + online || 1;

                  return (
                    <div className="space-y-3">
                      <div className="w-full h-4 bg-slate-100 rounded-lg overflow-hidden flex shadow-inner">
                        {cash > 0 && <div className="h-full bg-teal-500 transition-all" style={{ width: `${(cash/total)*100}%` }} title={`Cash: ${((cash/total)*100).toFixed(1)}%`} />}
                        {bank > 0 && <div className="h-full bg-blue-500 transition-all" style={{ width: `${(bank/total)*100}%` }} title={`Bank: ${((bank/total)*100).toFixed(1)}%`} />}
                        {upi > 0 && <div className="h-full bg-indigo-500 transition-all" style={{ width: `${(upi/total)*100}%` }} title={`UPI: ${((upi/total)*100).toFixed(1)}%`} />}
                        {cheque > 0 && <div className="h-full bg-orange-500 transition-all" style={{ width: `${(cheque/total)*100}%` }} title={`Cheque: ${((cheque/total)*100).toFixed(1)}%`} />}
                        {online > 0 && <div className="h-full bg-purple-500 transition-all" style={{ width: `${(online/total)*100}%` }} title={`Online: ${((online/total)*100).toFixed(1)}%`} />}
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs font-bold pt-1 text-slate-750">
                        <div className="flex items-center gap-1.5">
                          <span className="w-3 h-3 rounded-full bg-teal-500 block shrink-0" />
                          <span>Cash: <span className="font-extrabold text-slate-900">₹ {formatCurrency(cash)}</span></span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-3 h-3 rounded-full bg-blue-500 block shrink-0" />
                          <span>Bank: <span className="font-extrabold text-slate-900">₹ {formatCurrency(bank)}</span></span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-3 h-3 rounded-full bg-indigo-500 block shrink-0" />
                          <span>UPI: <span className="font-extrabold text-slate-900">₹ {formatCurrency(upi)}</span></span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-3 h-3 rounded-full bg-orange-500 block shrink-0" />
                          <span>Cheque: <span className="font-extrabold text-slate-900">₹ {formatCurrency(cheque)}</span></span>
                        </div>
                        {online > 0 && (
                          <div className="flex items-center gap-1.5">
                            <span className="w-3 h-3 rounded-full bg-purple-500 block shrink-0" />
                            <span>Online: <span className="font-extrabold text-slate-900">₹ {formatCurrency(online)}</span></span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* RECENT ACTIVITY TIMELINE */}
              <div className="card-premium p-4 bg-white shadow-sm border border-slate-200/40 rounded-2xl flex flex-col space-y-3">
                <span className="text-[10px] font-black text-slate-455 uppercase tracking-widest block border-b border-slate-100 pb-1.5">⚡ RECENT ACTIVITY TIMELINE</span>
                <div className="relative border-l border-slate-200/80 ml-3.5 pl-5 space-y-4">
                  {summary.recentActivity?.map((act, i) => {
                    let colorClass = 'bg-primary';
                    let labelEmoji = '✔';
                    if (act.type.includes('Invoice')) {
                      colorClass = 'bg-blue-500';
                      labelEmoji = '🧾';
                    } else if (act.type.includes('Payment')) {
                      colorClass = 'bg-emerald-500';
                      labelEmoji = '💵';
                    } else if (act.type.includes('Return')) {
                      colorClass = 'bg-orange-500';
                      labelEmoji = '🔄';
                    } else if (act.type.includes('Refund')) {
                      colorClass = 'bg-rose-500';
                      labelEmoji = '💸';
                    } else if (act.type.includes('Adjusted')) {
                      colorClass = 'bg-purple-500';
                      labelEmoji = '🪙';
                    }

                    return (
                      <div key={i} className="relative flex flex-col sm:flex-row sm:items-center justify-between text-xs font-semibold gap-1 text-slate-700">
                        {/* Circle on Timeline */}
                        <div className={`absolute -left-[27px] top-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[8px] text-white ${colorClass}`}>
                          {labelEmoji}
                        </div>
                        <div>
                          <div className="font-extrabold text-slate-850 flex items-center gap-1.5">
                            {act.type} 
                            <span className="text-[9px] font-black text-slate-400 font-mono">
                              ({formatDateDDMMYYYY(act.date)})
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-455 mt-0.5 italic">{act.particular}</div>
                        </div>
                        <div className="text-xs font-black text-slate-800 self-start sm:self-center">
                          ₹ {formatCurrency(act.amount)}
                        </div>
                      </div>
                    );
                  })}

                  {(!summary.recentActivity || summary.recentActivity.length === 0) && (
                    <div className="py-4 text-slate-400 text-center font-bold">No recent activities.</div>
                  )}
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
                <span>📖 Customer Journal Entries</span>
                {summary && (
                  <span className="text-[10px] font-extrabold text-slate-500 lowercase bg-slate-100 px-3 py-1 rounded-full border border-slate-200/50">
                    {summary.customerName}
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
                      <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black text-slate-450 uppercase tracking-wider">
                        <th className="py-4 px-5">Date</th>
                        <th className="py-4 px-5">Transaction Type</th>
                        <th className="py-4 px-5">Reference No</th>
                        <th className="py-4 px-5">Description/Particulars</th>
                        <th className="py-4 px-5 text-right">Debit (₹)</th>
                        <th className="py-4 px-5 text-right">Credit (₹)</th>
                        <th className="py-4 px-5 text-right">Balance (₹)</th>
                        <th className="py-4 px-5">Branch</th>
                        <th className="py-4 px-5">Created By</th>
                        <th className="py-4 px-5">Remarks</th>
                        <th className="py-4 px-5 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700 text-xs font-semibold">
                      {/* Opening Balance Row */}
                      {startDate && (
                        <tr className="bg-slate-50/50 font-bold text-slate-500 italic">
                          <td className="py-3.5 px-5">—</td>
                          <td className="py-3.5 px-5 uppercase text-[10px] tracking-wider font-extrabold">Opening Balance</td>
                          <td className="py-3.5 px-5">—</td>
                          <td className="py-3.5 px-5 text-slate-500">Opening Balance (Before {formatDateDDMMYYYY(startDate)})</td>
                          <td className="py-3.5 px-5 text-right">—</td>
                          <td className="py-3.5 px-5 text-right">—</td>
                          <td className="py-3.5 px-5 text-right font-black">
                            {formatBalance(openingBalance)}
                          </td>
                          <td className="py-3.5 px-5">—</td>
                          <td className="py-3.5 px-5">—</td>
                          <td className="py-3.5 px-5">—</td>
                          <td className="py-3.5 px-5">—</td>
                        </tr>
                      )}

                      {/* Transactions rows */}
                      {transactions.map(t => (
                        <tr key={t.id} className="hover:bg-slate-50/40 transition-colors">
                          <td className="py-3.5 px-5">{formatDateDDMMYYYY(t.date)}</td>
                          <td className="py-3.5 px-5">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                              t.entryType === 'Sale Invoice' ? 'bg-blue-100 text-blue-800' :
                              t.entryType === 'Sales Return' ? 'bg-orange-100 text-orange-850' :
                              t.entryType === 'Payment' ? 'bg-emerald-100 text-emerald-800' :
                              t.entryType === 'Advance Payment' ? 'bg-emerald-100 text-emerald-800' :
                              t.entryType === 'Debit Note' ? 'bg-rose-100 text-rose-800' :
                              t.entryType === 'Credit Note' ? 'bg-orange-100 text-orange-850' :
                              t.entryType === 'Refund' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-800'
                            }`}>
                              {t.entryType}
                            </span>
                          </td>
                          <td className="py-3.5 px-5 font-mono text-[11px] font-bold">
                            <button
                              onClick={() => handleOpenDocument(t.referenceNo)}
                              className="text-primary hover:underline hover:text-blue-700 font-extrabold cursor-pointer"
                              title="Click to view original document details"
                            >
                              {t.referenceNo}
                            </button>
                          </td>
                          <td className="py-3.5 px-5 font-bold text-slate-800">{t.particular}</td>
                          <td className="py-3.5 px-5 text-right font-bold text-slate-700">
                            {t.debit > 0 ? `₹ ${formatCurrency(t.debit)}` : '—'}
                          </td>
                          <td className="py-3.5 px-5 text-right font-extrabold text-emerald-600">
                            {t.credit > 0 ? `₹ ${formatCurrency(t.credit)}` : '—'}
                          </td>
                          <td className="py-3.5 px-5 text-right font-black text-slate-800">
                            {formatBalance(t.runningBalance)}
                          </td>
                          <td className="py-3.5 px-5 text-slate-500 font-medium">{t.branch || '—'}</td>
                          <td className="py-3.5 px-5 text-slate-500 font-medium">{t.createdBy || '—'}</td>
                          <td className="py-3.5 px-5 text-slate-450 italic text-[11px] truncate max-w-[120px]" title={t.remarks}>{t.remarks || '—'}</td>
                          <td className="py-3.5 px-5 text-center">
                            <button type="button" onClick={() => handleEditTransaction(t)} className="px-3 py-1.5 rounded-lg bg-blue-50 text-primary hover:bg-blue-100 border border-blue-100 text-[10px] font-black uppercase tracking-wide transition-colors" title="Edit journal entry">
                              Edit
                            </button>
                          </td>
                        </tr>
                      ))}

                      {transactions.length === 0 && (
                        <tr>
                          <td colSpan="11" className="py-12 text-center text-slate-400 font-bold bg-slate-50/10">
                            No ledger entries found for the selected period / filters.
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
                <div className="text-[11px] font-black text-slate-450 uppercase tracking-widest border-b border-slate-100 pb-2.5">
                  🛡️ Receivables Ageing Buckets (FIFO)
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
                <div className="text-[11px] font-black text-slate-450 uppercase tracking-widest border-b border-slate-100 pb-2.5 flex justify-between items-center">
                  <span>📉 Monthly Sales Velocity</span>
                  <span className="text-[9px] font-black text-slate-400 bg-slate-50 px-2 py-0.5 rounded border">LAST 6 MONTHS</span>
                </div>

                {analytics.velocity && analytics.velocity.length > 0 ? (
                  <div className="flex items-end justify-around h-44 pb-2 pt-6 px-2">
                    {(() => {
                      const maxVal = Math.max(...analytics.velocity.map(v => parseFloat(v.total_sales)), 1000);
                      return analytics.velocity.map(v => {
                        const hPct = (parseFloat(v.total_sales) / maxVal) * 100;
                        return (
                          <div key={v.month} className="flex flex-col items-center flex-1 group relative">
                            {/* Hover tooltip */}
                            <div className="absolute bottom-full mb-1 bg-slate-900 text-white text-[9px] font-black py-1 px-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-md z-10">
                              ₹ {formatCurrency(v.total_sales)}
                            </div>
                            {/* Bar */}
                            <div 
                              style={{ height: `${Math.max(hPct, 5)}%` }}
                              className="w-8 bg-gradient-to-t from-primary/80 to-primary rounded-t-md hover:from-blue-600 hover:to-blue-700 transition-all duration-200 cursor-pointer shadow-sm"
                            ></div>
                            {/* Label */}
                            <span className="text-[9px] font-bold text-slate-500 mt-2">{v.month}</span>
                          </div>
                        );
                      });
                    })()}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-44 text-slate-400 text-xs font-semibold">
                    No sales data logged in the last 6 months.
                  </div>
                )}
              </div>

              {/* STATS & BEHAVIOR */}
              <div className="card-premium space-y-4 md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Invoice aggregates */}
                <div className="space-y-4.5 border-r border-slate-100 pr-6">
                  <div className="text-[11px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 pb-2">
                    📑 Invoice Aggregates
                  </div>
                  <div className="space-y-3 font-semibold text-xs text-slate-650">
                    <div className="flex justify-between">
                      <span>Total Invoice count:</span>
                      <span className="font-extrabold text-slate-800">{analytics.invoiceStats.totalInvoices} Invoices</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Average Invoice size:</span>
                      <span className="font-extrabold text-slate-800">₹ {formatCurrency(analytics.invoiceStats.avgValue)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Max single invoice:</span>
                      <span className="font-extrabold text-slate-800">₹ {formatCurrency(analytics.invoiceStats.maxValue)}</span>
                    </div>
                  </div>
                </div>

                {/* Payment delay behaviour */}
                <div className="space-y-3">
                  <div className="text-[11px] font-black text-slate-450 uppercase tracking-widest border-b border-slate-50 pb-2">
                    ⚡ Collection Performance
                  </div>
                  <div className="flex items-center gap-4 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                    <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center font-black text-lg border border-amber-100 shrink-0">
                      📅
                    </div>
                    <div>
                      <div className="text-xs font-black text-slate-800">
                        {analytics.avgPaymentDays === 0 ? 'Same Day (Cash/Direct)' : `${analytics.avgPaymentDays} Days Collection Lag`}
                      </div>
                      <p className="text-[10px] text-slate-450 mt-0.5 leading-normal">
                        Average duration from sale invoice generation to collection payment approval
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
                  <div className="print-title">KEMP'S ERP — STATEMENT OF ACCOUNT</div>
                  <div style={{ fontSize: '10px', color: '#555', marginTop: '2px', fontWeight: 'bold' }}>
                    Generated on: {new Date().toLocaleDateString('en-IN')}
                  </div>
                </div>
                <div style={{ textAlign: 'right', fontSize: '10px', fontWeight: 'bold' }}>
                  {startDate || endDate ? `Period: ${formatDateDDMMYYYY(startDate) || 'Beginning'} to ${formatDateDDMMYYYY(endDate) || 'Today'}` : 'All-time Statement'}
                </div>
              </div>

              {/* Customer information grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px', fontSize: '11px', fontWeight: '600' }}>
                <div style={{ border: '1px solid #ddd', padding: '12px', borderRadius: '6px' }}>
                  <div style={{ textTransform: 'uppercase', color: '#777', fontSize: '9px', fontWeight: '800', marginBottom: '5px' }}>Customer Details:</div>
                  <div style={{ fontSize: '13px', fontWeight: '800', color: '#000' }}>{summary.customerName}</div>
                  <div>Phone: {summary.customerPhone}</div>
                  <div>GSTIN: {summary.customerGstin}</div>
                  <div style={{ marginTop: '5px', whiteSpace: 'pre-wrap' }}>Address: {summary.customerAddress}</div>
                </div>
                
                <div style={{ border: '1px solid #ddd', padding: '12px', borderRadius: '6px' }}>
                  <div style={{ textTransform: 'uppercase', color: '#777', fontSize: '9px', fontWeight: '800', marginBottom: '5px' }}>Accounting Summary:</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                    <span>Opening Balance:</span>
                    <span style={{ marginLeft: 'auto', fontWeight: 'bold' }}>{formatBalance(openingBalance)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                    <span>Gross Sales:</span>
                    <span style={{ marginLeft: 'auto', fontWeight: 'bold' }}>₹ {formatCurrency(summary.grossSales)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                    <span>Sales Returns:</span>
                    <span style={{ marginLeft: 'auto', fontWeight: 'bold', color: 'orange' }}>₹ {formatCurrency(summary.salesReturn)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                    <span>Payments Received:</span>
                    <span style={{ marginLeft: 'auto', fontWeight: 'bold', color: 'green' }}>₹ {formatCurrency(summary.paymentsReceived)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #ccc', marginTop: '6px', paddingTop: '4px', fontSize: '12px', fontWeight: '800' }}>
                    <span>Outstanding Due:</span>
                    <span style={{ marginLeft: 'auto', color: summary.outstandingDue > 0.004 ? 'red' : 'black' }}>
                      {formatBalance(summary.outstandingDue)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Transactions journal */}
              <table className="print-table">
                <thead>
                  <tr>
                    <th style={{ width: '12%' }}>Date</th>
                    <th style={{ width: '15%' }}>Type</th>
                    <th style={{ width: '15%' }}>Reference</th>
                    <th style={{ width: '30%' }}>Particulars</th>
                    <th className="text-right" style={{ width: '12%' }}>Debit (₹)</th>
                    <th className="text-right" style={{ width: '12%' }}>Credit (₹)</th>
                    <th className="text-right" style={{ width: '14%' }}>Balance (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {startDate && (
                    <tr style={{ fontStyle: 'italic', fontWeight: 'bold', backgroundColor: '#fafafa' }}>
                      <td>—</td>
                      <td>Opening</td>
                      <td>—</td>
                      <td>OPENING BALANCE (PREVIOUS ENTRIES)</td>
                      <td className="text-right">—</td>
                      <td className="text-right">—</td>
                      <td className="text-right">{formatBalance(openingBalance)}</td>
                    </tr>
                  )}
                  {transactions.map(t => (
                    <tr key={t.id}>
                      <td>{formatDateDDMMYYYY(t.date)}</td>
                      <td>{t.entryType}</td>
                      <td style={{ fontFamily: 'monospace' }}>{t.referenceNo}</td>
                      <td style={{ fontWeight: 'bold' }}>{t.particular}</td>
                      <td className="text-right">{t.debit > 0 ? formatCurrency(t.debit) : '—'}</td>
                      <td className="text-right" style={{ color: 'green' }}>{t.credit > 0 ? formatCurrency(t.credit) : '—'}</td>
                      <td className="text-right" style={{ fontWeight: 'bold' }}>{formatBalance(t.runningBalance)}</td>
                    </tr>
                  ))}
                  {transactions.length === 0 && (
                    <tr>
                      <td colSpan="7" style={{ textAlign: 'center', padding: '20px 0', color: '#666' }}>
                        No ledger transactions found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* Footer authorization details */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '80px', fontSize: '10px', fontWeight: 'bold' }}>
                <div style={{ borderTop: '1px solid #000', width: '200px', textAlign: 'center', paddingTop: '5px' }}>
                  Customer Signature
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
            📒
          </div>
          <div>
            <h3 className="text-slate-700 text-sm font-extrabold">No Customer Selected</h3>
            <p className="text-slate-400 text-xs font-semibold mt-1">Select a customer above to view their journal ledger statements and performance analysis.</p>
          </div>
        </div>
      )}

      {/* Journal Entry Edit Modal */}
      {editingTransaction && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 no-print">
          <form onSubmit={handleSaveTransaction} className="bg-white rounded-3xl shadow-2xl max-w-xl w-full overflow-hidden border border-slate-100">
            <div className="p-6 bg-slate-50 border-b border-slate-200/60 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Edit Journal Entry</h3>
                <p className="text-xs font-semibold text-slate-500 mt-1">{editingTransaction.referenceNo} · {editingTransaction.entryType}</p>
              </div>
              <button type="button" onClick={() => setEditingTransaction(null)} className="w-8 h-8 rounded-full bg-white border border-slate-200 text-slate-500 hover:text-red-500 font-bold">×</button>
            </div>
            <div className="p-6 space-y-5">
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider">
                Date
                <input type="date" required value={editForm.date} onChange={(e) => setEditForm({ ...editForm, date: e.target.value })} className="input input-bordered w-full mt-1.5 text-sm" />
              </label>
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider">
                Description / Particulars
                <textarea required rows="3" value={editForm.particular} onChange={(e) => setEditForm({ ...editForm, particular: e.target.value })} className="textarea textarea-bordered w-full mt-1.5 text-sm" />
              </label>
              <div className="grid grid-cols-2 gap-4">
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider">
                  Debit (₹)
                  <input type="number" min="0" step="0.01" value={editForm.debit} onChange={(e) => setEditForm({ ...editForm, debit: e.target.value, credit: e.target.value ? '' : editForm.credit })} className="input input-bordered w-full mt-1.5 text-sm" placeholder="0.00" />
                </label>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider">
                  Credit (₹)
                  <input type="number" min="0" step="0.01" value={editForm.credit} onChange={(e) => setEditForm({ ...editForm, credit: e.target.value, debit: e.target.value ? '' : editForm.debit })} className="input input-bordered w-full mt-1.5 text-sm" placeholder="0.00" />
                </label>
              </div>
            </div>
            <div className="p-5 bg-slate-50 border-t border-slate-200/60 flex justify-end gap-3">
              <button type="button" onClick={() => setEditingTransaction(null)} disabled={savingEdit} className="px-4 py-2 rounded-xl text-xs font-black text-slate-600 hover:bg-slate-200">Cancel</button>
              <button type="submit" disabled={savingEdit} className="px-5 py-2 rounded-xl text-xs font-black bg-primary text-white hover:bg-blue-700 disabled:opacity-50">
                {savingEdit ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Invoice Details View Modal */}
      {isViewModalOpen && viewingBill && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col animate-fade-in border border-slate-100">
            {/* Modal Header */}
            <div className="p-6 bg-slate-50 border-b border-slate-200/60 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Invoice Details — {viewingBill.id}</h3>
                <p className="text-xs font-semibold text-slate-500 mt-1">Company: {viewingBill.company} | Customer: {viewingBill.customer_name}</p>
              </div>
              <button 
                onClick={() => setIsViewModalOpen(false)}
                className="w-8 h-8 rounded-full bg-white border border-slate-200 text-slate-500 hover:text-red-500 hover:bg-red-50 flex items-center justify-center font-bold text-xs transition-all active:scale-95 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-bold text-slate-650">
                <div className="bg-slate-50 p-3 rounded-xl">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1">Billing Date</span>
                  <span className="text-slate-800">{formatDateDDMMYYYY(viewingBill.billing_date)}</span>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1">Payment Mode</span>
                  <span className="text-slate-800">{viewingBill.payment_mode}</span>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1">Amount Paid</span>
                  <span className="text-emerald-600">₹ {formatCurrency(viewingBill.amount_paid)}</span>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1">Due Amount</span>
                  <span className={viewingBill.due_amount > 0 ? "text-rose-600" : "text-slate-800"}>
                    ₹ {formatCurrency(viewingBill.due_amount)}
                  </span>
                </div>
              </div>

              {/* Items Table */}
              <div className="border border-slate-200/60 rounded-2xl overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black text-slate-450 uppercase tracking-wider">
                      <th className="p-3">Product Name</th>
                      <th className="p-3 text-right">Qty</th>
                      <th className="p-3 text-right">Rate with Tax</th>
                      <th className="p-3 text-right">Tax %</th>
                      <th className="p-3 text-right">Basic Rate</th>
                      <th className="p-3 text-right font-extrabold text-slate-700">Total (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                    {viewingBillItems.map((item, idx) => (
                      <tr key={idx}>
                        <td className="p-3 font-bold text-slate-800">{item.product_name}</td>
                        <td className="p-3 text-right">{item.quantity}</td>
                        <td className="p-3 text-right">₹ {formatCurrency(item.rate_with_tax)}</td>
                        <td className="p-3 text-right">{item.tax_percent}%</td>
                        <td className="p-3 text-right">₹ {formatCurrency(item.basic_rate)}</td>
                        <td className="p-3 text-right font-black text-slate-800">₹ {formatCurrency(item.total_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Summary Block */}
              <div className="flex justify-end font-bold text-xs text-slate-650">
                <div className="w-64 space-y-2.5 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <div className="flex justify-between">
                    <span>Grand Total:</span>
                    <span className="font-black text-slate-800 text-sm">₹ {formatCurrency(viewingBill.grand_total)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200/60 flex justify-end">
              <button 
                onClick={() => setIsViewModalOpen(false)}
                className="btn bg-slate-200 hover:bg-slate-350 text-slate-800 text-xs px-5 rounded-xl transition-all cursor-pointer font-bold py-2.5"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Advance Payment Modal */}
      {isAdvanceModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto flex flex-col border border-slate-100">
            {/* Modal Header */}
            <div className="p-6 bg-gradient-to-r from-teal-600 to-emerald-600 text-white flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black uppercase tracking-wider flex items-center gap-2">
                  <span>💳</span> Record Advance Payment
                </h3>
                <p className="text-xs font-semibold text-teal-100 mt-1">
                  Collect advance money directly into customer account ledger
                </p>
              </div>
              <button
                onClick={() => setIsAdvanceModalOpen(false)}
                className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center font-bold transition-all cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveAdvancePayment} className="p-6 space-y-4">
              {/* Customer Selection */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest block flex items-center justify-between">
                  <span>Select Customer *</span>
                  <span className="text-[10px] text-rose-500 font-extrabold uppercase">Required</span>
                </label>
                <select
                  value={advanceForm.customerId}
                  onChange={(e) => setAdvanceForm(prev => ({ ...prev, customerId: e.target.value }))}
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-800 font-bold text-xs focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 outline-none transition-all cursor-pointer"
                  required
                >
                  <option value="">-- Select Customer --</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.phone})
                    </option>
                  ))}
                </select>
              </div>

              {/* Company Selection (Mandatory) */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest block flex items-center justify-between">
                  <span>Select Company *</span>
                  {advanceForm.company ? (
                    <span className="text-[10px] text-emerald-600 font-extrabold uppercase bg-emerald-50 px-2 py-0.5 rounded">
                      ✓ Selected
                    </span>
                  ) : (
                    <span className="text-[10px] text-rose-500 font-extrabold uppercase bg-rose-50 px-2 py-0.5 rounded">
                      Required
                    </span>
                  )}
                </label>
                <select
                  value={advanceForm.company}
                  onChange={(e) => setAdvanceForm(prev => ({ ...prev, company: e.target.value }))}
                  className={`w-full h-11 px-4 rounded-xl border bg-white font-black text-xs outline-none transition-all cursor-pointer ${
                    !advanceForm.company ? 'border-amber-300 text-amber-700' : 'border-slate-200 text-slate-800 focus:border-teal-500'
                  }`}
                  required
                >
                  <option value="">-- Select Company --</option>
                  <option value="Kempannavar Industries">KEMPANNAVAR INDUSTRIES</option>
                  <option value="Kemps Pet Industries">KEMPS PET INDUSTRIES</option>
                </select>
              </div>

              {/* Payment Date */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest block">
                  Payment Date *
                </label>
                <input
                  type="date"
                  value={advanceForm.paymentDate}
                  onChange={(e) => setAdvanceForm(prev => ({ ...prev, paymentDate: e.target.value }))}
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-800 font-bold text-xs focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 outline-none transition-all"
                  required
                />
              </div>

              {/* Payment Option - Multi-Mode Breakdown */}
              <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/50 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="text-[11px] font-black text-slate-700 uppercase tracking-wider">
                    💳 Multiple Payment Options
                  </span>
                  <span className="text-[10px] font-black text-teal-700 bg-teal-50 border border-teal-200 px-2.5 py-0.5 rounded-lg">
                    Total: ₹ {( (parseFloat(advanceForm.cashAmount) || 0) + (parseFloat(advanceForm.bankAmount) || 0) + (parseFloat(advanceForm.upiAmount) || 0) ).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* CASH */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-600 uppercase tracking-wider block">
                      💵 Cash
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={advanceForm.cashAmount}
                      onChange={(e) => setAdvanceForm(prev => ({ ...prev, cashAmount: e.target.value }))}
                      placeholder="0.00"
                      className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-slate-800 font-black text-sm outline-none focus:border-teal-500"
                    />
                  </div>

                  {/* BANK */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-600 uppercase tracking-wider block">
                      🏦 Bank
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={advanceForm.bankAmount}
                      onChange={(e) => setAdvanceForm(prev => ({ ...prev, bankAmount: e.target.value }))}
                      placeholder="0.00"
                      className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-slate-800 font-black text-sm outline-none focus:border-teal-500"
                    />
                  </div>

                  {/* UPI */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-600 uppercase tracking-wider block">
                      📱 UPI
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={advanceForm.upiAmount}
                      onChange={(e) => setAdvanceForm(prev => ({ ...prev, upiAmount: e.target.value }))}
                      placeholder="0.00"
                      className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-slate-800 font-black text-sm outline-none focus:border-teal-500"
                    />
                  </div>
                </div>
              </div>

              {/* Remarks */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest block">
                  Remarks / Notes (Optional)
                </label>
                <textarea
                  rows="2"
                  value={advanceForm.remarks}
                  onChange={(e) => setAdvanceForm(prev => ({ ...prev, remarks: e.target.value }))}
                  placeholder="Add optional notes or advance reference..."
                  className="w-full p-3 rounded-xl border border-slate-200 bg-white text-slate-800 font-medium text-xs focus:border-teal-500 outline-none resize-none"
                />
              </div>

              {/* Feedback Error / Success */}
              {advanceError && (
                <div className="bg-red-50 text-red-600 p-3 rounded-xl text-xs font-bold border border-red-100">
                  ⚠️ {advanceError}
                </div>
              )}
              {advanceSuccess && (
                <div className="bg-emerald-50 text-emerald-600 p-3 rounded-xl text-xs font-bold border border-emerald-100">
                  ✅ {advanceSuccess}
                </div>
              )}

              {/* Modal Actions */}
              <div className="pt-2 flex justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAdvanceModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingAdvance}
                  className="px-6 py-2.5 rounded-xl text-xs font-extrabold bg-teal-600 hover:bg-teal-700 text-white shadow-md transition-all cursor-pointer uppercase tracking-wider disabled:opacity-50"
                >
                  {isSavingAdvance ? 'Saving…' : 'Save Advance Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AccountsLedger;
