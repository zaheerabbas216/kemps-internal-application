import React, { useState, useEffect, useMemo } from 'react';
import api from '../api/axios';

const ToolsInventory = () => {
  // Active Tab: 'STOCK_IN', 'STOCK_OUT', 'LEDGER', 'HISTORY'
  const [activeTab, setActiveTab] = useState('STOCK_IN');

  // Master Dropdowns & Stock Cache
  const [dropdowns, setDropdowns] = useState({
    products: [],
    machines: [],
    companies: []
  });
  const [loadingDropdowns, setLoadingDropdowns] = useState(false);

  // Overall Dashboard Metrics
  const [dashboardStats, setDashboardStats] = useState({
    totalTools: 0,
    totalStockQty: 0,
    totalInventoryValue: 0,
    totalInQty: 0,
    totalInValue: 0,
    totalOutQty: 0,
    totalOutValue: 0,
    inStockCount: 0,
    lowStockCount: 0,
    outOfStockCount: 0,
    today: {
      stockInCount: 0,
      stockInQty: 0,
      stockInValue: 0,
      stockOutCount: 0,
      stockOutQty: 0,
      stockOutValue: 0
    }
  });
  const [loadingStats, setLoadingStats] = useState(false);

  // Today's Live Data Entries
  const [todayEntries, setTodayEntries] = useState([]);
  const [loadingTodayEntries, setLoadingTodayEntries] = useState(false);

  // General helpers for dates
  const getTodayISTStr = () => {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const istDate = new Date(now.getTime() + (330 + offset) * 60000);
    const yyyy = istDate.getFullYear();
    const mm = String(istDate.getMonth() + 1).padStart(2, '0');
    const dd = String(istDate.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const getCurrentISTTimeStr = () => {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const istDate = new Date(now.getTime() + (330 + offset) * 60000);
    const hh = String(istDate.getHours()).padStart(2, '0');
    const mi = String(istDate.getMinutes()).padStart(2, '0');
    return `${hh}:${mi}`;
  };

  const formatCurrency = (val) => {
    const num = parseFloat(val) || 0;
    return '₹ ' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Filter today's in and out entries
  const todayInEntries = useMemo(
    () => todayEntries.filter(e => e.transaction_type === 'STOCK_IN'),
    [todayEntries]
  );
  const todayOutEntries = useMemo(
    () => todayEntries.filter(e => e.transaction_type === 'STOCK_OUT'),
    [todayEntries]
  );

  // ─────────────────────────────────────────────────────────────
  // 1. STOCK IN STATE
  // ─────────────────────────────────────────────────────────────
  const initialStockInForm = {
    productName: '',
    machineName: '',
    companyName: '',
    billNo: '',
    quantity: '',
    unit: 'PCS',
    ratePerUnit: '',
    totalRate: '',
    date: getTodayISTStr(),
    time: getCurrentISTTimeStr(),
    notes: ''
  };
  const [stockInForm, setStockInForm] = useState(initialStockInForm);
  const [isSavingIn, setIsSavingIn] = useState(false);
  const [stockInMsg, setStockInMsg] = useState({ type: '', text: '' });

  // Handle live calculation for Stock IN
  const handleStockInQtyChange = (val) => {
    const qty = val;
    const rate = stockInForm.ratePerUnit;
    const computedTotal = (qty && rate && !isNaN(parseFloat(qty)) && !isNaN(parseFloat(rate)))
      ? (parseFloat(qty) * parseFloat(rate)).toFixed(2)
      : '';
    setStockInForm(prev => ({
      ...prev,
      quantity: qty,
      totalRate: computedTotal
    }));
  };

  const handleStockInRateChange = (val) => {
    const rate = val;
    const qty = stockInForm.quantity;
    const computedTotal = (qty && rate && !isNaN(parseFloat(qty)) && !isNaN(parseFloat(rate)))
      ? (parseFloat(qty) * parseFloat(rate)).toFixed(2)
      : '';
    setStockInForm(prev => ({
      ...prev,
      ratePerUnit: rate,
      totalRate: computedTotal
    }));
  };

  const handleStockInTotalChange = (val) => {
    const total = val;
    const qty = parseFloat(stockInForm.quantity);
    let computedRate = stockInForm.ratePerUnit;
    if (qty > 0 && total && !isNaN(parseFloat(total))) {
      computedRate = (parseFloat(total) / qty).toFixed(2);
    }
    setStockInForm(prev => ({
      ...prev,
      totalRate: total,
      ratePerUnit: computedRate
    }));
  };

  // ─────────────────────────────────────────────────────────────
  // 2. STOCK OUT STATE
  // ─────────────────────────────────────────────────────────────
  const initialStockOutForm = {
    productName: '',
    machineName: '',
    companyName: '',
    quantity: '',
    unit: 'PCS',
    ratePerUnit: '',
    totalRate: '',
    date: getTodayISTStr(),
    time: getCurrentISTTimeStr(),
    notes: ''
  };
  const [stockOutForm, setStockOutForm] = useState(initialStockOutForm);
  const [isSavingOut, setIsSavingOut] = useState(false);
  const [stockOutMsg, setStockOutMsg] = useState({ type: '', text: '' });

  // Selected product stock details for Stock Out
  const selectedOutProductStock = useMemo(() => {
    if (!stockOutForm.productName) return null;
    const found = dropdowns.products.find(p => p.product_name === stockOutForm.productName);
    return found || null;
  }, [stockOutForm.productName, dropdowns.products]);

  const remainingAfterOut = useMemo(() => {
    if (!selectedOutProductStock) return 0;
    const current = parseFloat(selectedOutProductStock.current_stock || 0);
    const out = parseFloat(stockOutForm.quantity || 0);
    return current - out;
  }, [selectedOutProductStock, stockOutForm.quantity]);

  const handleStockOutQtyChange = (val) => {
    const qty = val;
    const rate = stockOutForm.ratePerUnit;
    const computedTotal = (qty && rate && !isNaN(parseFloat(qty)) && !isNaN(parseFloat(rate)))
      ? (parseFloat(qty) * parseFloat(rate)).toFixed(2)
      : '';
    setStockOutForm(prev => ({
      ...prev,
      quantity: qty,
      totalRate: computedTotal
    }));
  };

  // ─────────────────────────────────────────────────────────────
  // 3. INVENTORY LEDGER STATE
  // ─────────────────────────────────────────────────────────────
  const [ledgerDate, setLedgerDate] = useState(getTodayISTStr());
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [ledgerData, setLedgerData] = useState([]);
  const [ledgerAllProducts, setLedgerAllProducts] = useState([]);
  const [ledgerSummary, setLedgerSummary] = useState({
    totalOpening: 0,
    totalIn: 0,
    totalOut: 0,
    totalClosing: 0,
    totalOpeningValue: 0,
    totalInValue: 0,
    totalOutValue: 0,
    totalClosingValue: 0,
    itemCount: 0
  });
  const [isLedgerClosed, setIsLedgerClosed] = useState(false);
  const [loadingLedger, setLoadingLedger] = useState(false);

  // ─────────────────────────────────────────────────────────────
  // 4. HISTORY STATE
  // ─────────────────────────────────────────────────────────────
  const [historyType, setHistoryType] = useState('ALL'); // 'ALL', 'STOCK_IN', 'STOCK_OUT'
  const [historyDatePreset, setHistoryDatePreset] = useState('ALL');
  const [historyStartDate, setHistoryStartDate] = useState('');
  const [historyEndDate, setHistoryEndDate] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const [historyLimit] = useState(20);
  const [historyData, setHistoryData] = useState([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);
  const [historySummary, setHistorySummary] = useState({
    totalCount: 0,
    totalIn: 0,
    totalOut: 0,
    totalInValue: 0,
    totalOutValue: 0
  });
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Edit Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [isUpdating, setIsUpdating] = useState(false);
  const [editError, setEditError] = useState('');

  // ─────────────────────────────────────────────────────────────
  // LIFECYCLE HOOKS
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchDropdowns();
    fetchSummary();
    fetchTodayEntries();
  }, []);

  useEffect(() => {
    if (activeTab === 'LEDGER') {
      fetchLedger();
    } else if (activeTab === 'HISTORY') {
      fetchHistory();
    }
  }, [activeTab, ledgerDate, ledgerSearch, historyType, historyStartDate, historyEndDate, historySearch, historyPage]);

  const fetchSummary = async () => {
    try {
      setLoadingStats(true);
      const res = await api.get('/tools-inventory/summary');
      if (res.data.ok) {
        setDashboardStats(res.data);
      }
    } catch (err) {
      console.error('Failed to load tools summary stats:', err);
    } finally {
      setLoadingStats(false);
    }
  };

  const fetchTodayEntries = async () => {
    try {
      setLoadingTodayEntries(true);
      const res = await api.get('/tools-inventory/today-entries');
      if (res.data.ok) {
        setTodayEntries(res.data.entries || []);
      }
    } catch (err) {
      console.error('Failed to load today entries:', err);
    } finally {
      setLoadingTodayEntries(false);
    }
  };

  const fetchDropdowns = async () => {
    try {
      setLoadingDropdowns(true);
      const res = await api.get('/tools-inventory/dropdowns');
      if (res.data.ok) {
        setDropdowns({
          products: res.data.products || [],
          machines: res.data.machines || [],
          companies: res.data.companies || []
        });
      }
    } catch (err) {
      console.error('Failed to load tools dropdowns:', err);
    } finally {
      setLoadingDropdowns(false);
    }
  };

  const fetchLedger = async () => {
    try {
      setLoadingLedger(true);
      const res = await api.get('/tools-inventory/ledger', {
        params: { date: ledgerDate, search: ledgerSearch }
      });
      if (res.data.ok) {
        setLedgerData(res.data.ledger || []);
        setLedgerAllProducts(res.data.allProducts || []);
        setLedgerSummary(res.data.summary || {
          totalOpening: 0,
          totalIn: 0,
          totalOut: 0,
          totalClosing: 0,
          totalOpeningValue: 0,
          totalInValue: 0,
          totalOutValue: 0,
          totalClosingValue: 0,
          itemCount: 0
        });
        setIsLedgerClosed(res.data.isClosed || false);
      }
    } catch (err) {
      console.error('Failed to load tools ledger:', err);
    } finally {
      setLoadingLedger(false);
    }
  };

  const fetchHistory = async () => {
    try {
      setLoadingHistory(true);
      const params = {
        page: historyPage,
        limit: historyLimit,
        type: historyType,
        search: historySearch
      };
      if (historyStartDate) params.startDate = historyStartDate;
      if (historyEndDate) params.endDate = historyEndDate;

      const res = await api.get('/tools-inventory/history', { params });
      if (res.data.ok) {
        setHistoryData(res.data.transactions || []);
        setHistoryTotal(res.data.total || 0);
        setHistoryTotalPages(res.data.totalPages || 1);
        setHistorySummary(res.data.summary || {
          totalCount: 0,
          totalIn: 0,
          totalOut: 0,
          totalInValue: 0,
          totalOutValue: 0
        });
      }
    } catch (err) {
      console.error('Failed to load tools history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // STOCK IN HANDLERS
  // ─────────────────────────────────────────────────────────────
  const handleStockInSubmit = async (e) => {
    e.preventDefault();
    setStockInMsg({ type: '', text: '' });

    if (!stockInForm.productName.trim()) {
      setStockInMsg({ type: 'error', text: 'Product / Spare Part Name is required.' });
      return;
    }
    if (parseFloat(stockInForm.quantity) <= 0 || isNaN(parseFloat(stockInForm.quantity))) {
      setStockInMsg({ type: 'error', text: 'Quantity must be greater than 0.' });
      return;
    }

    try {
      setIsSavingIn(true);
      const res = await api.post('/tools-inventory/stock-in', stockInForm);
      if (res.data.ok) {
        setStockInMsg({ type: 'success', text: `Stock IN recorded successfully! (ID: ${res.data.id})` });
        setStockInForm({
          ...initialStockInForm,
          date: getTodayISTStr(),
          time: getCurrentISTTimeStr()
        });
        fetchDropdowns();
        fetchSummary();
        fetchTodayEntries();
        setTimeout(() => setStockInMsg({ type: '', text: '' }), 4000);
      }
    } catch (err) {
      console.error('Stock in save error:', err);
      setStockInMsg({ type: 'error', text: err.response?.data?.error || 'Failed to record Stock In.' });
    } finally {
      setIsSavingIn(false);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // STOCK OUT HANDLERS
  // ─────────────────────────────────────────────────────────────
  const handleStockOutProductChange = (e) => {
    const prodName = e.target.value;
    const found = dropdowns.products.find(p => p.product_name === prodName);
    const unitRate = found?.rate_per_unit || '';
    const qty = stockOutForm.quantity;
    const computedTotal = (qty && unitRate && !isNaN(parseFloat(qty)) && !isNaN(parseFloat(unitRate)))
      ? (parseFloat(qty) * parseFloat(unitRate)).toFixed(2)
      : '';

    setStockOutForm(prev => ({
      ...prev,
      productName: prodName,
      machineName: found ? found.machine_name : prev.machineName,
      companyName: found ? found.company_name : prev.companyName,
      unit: found ? found.unit : 'PCS',
      ratePerUnit: unitRate,
      totalRate: computedTotal
    }));
  };

  const handleStockOutSubmit = async (e) => {
    e.preventDefault();
    setStockOutMsg({ type: '', text: '' });

    if (!stockOutForm.productName.trim()) {
      setStockOutMsg({ type: 'error', text: 'Please select a Product from dropdown.' });
      return;
    }
    const qty = parseFloat(stockOutForm.quantity);
    if (isNaN(qty) || qty <= 0) {
      setStockOutMsg({ type: 'error', text: 'Quantity must be greater than 0.' });
      return;
    }

    if (selectedOutProductStock && qty > selectedOutProductStock.current_stock) {
      setStockOutMsg({
        type: 'error',
        text: `Cannot issue ${qty} ${stockOutForm.unit}. Current available stock is only ${selectedOutProductStock.current_stock} ${stockOutForm.unit}.`
      });
      return;
    }

    try {
      setIsSavingOut(true);
      const res = await api.post('/tools-inventory/stock-out', stockOutForm);
      if (res.data.ok) {
        setStockOutMsg({ type: 'success', text: `Stock OUT recorded successfully! (ID: ${res.data.id})` });
        setStockOutForm({
          ...initialStockOutForm,
          date: getTodayISTStr(),
          time: getCurrentISTTimeStr()
        });
        fetchDropdowns();
        fetchSummary();
        fetchTodayEntries();
        setTimeout(() => setStockOutMsg({ type: '', text: '' }), 4000);
      }
    } catch (err) {
      console.error('Stock out save error:', err);
      setStockOutMsg({ type: 'error', text: err.response?.data?.error || 'Failed to record Stock Out.' });
    } finally {
      setIsSavingOut(false);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // HISTORY FILTERS & ACTIONS
  // ─────────────────────────────────────────────────────────────
  const applyHistoryDatePreset = (preset) => {
    setHistoryDatePreset(preset);
    setHistoryPage(1);
    const today = getTodayISTStr();

    if (preset === 'TODAY') {
      setHistoryStartDate(today);
      setHistoryEndDate(today);
    } else if (preset === 'YESTERDAY') {
      const now = new Date();
      now.setDate(now.getDate() - 1);
      const y = now.toISOString().split('T')[0];
      setHistoryStartDate(y);
      setHistoryEndDate(y);
    } else if (preset === 'WEEK') {
      const now = new Date();
      now.setDate(now.getDate() - 7);
      const w = now.toISOString().split('T')[0];
      setHistoryStartDate(w);
      setHistoryEndDate(today);
    } else if (preset === 'MONTH') {
      const now = new Date();
      const first = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      setHistoryStartDate(first);
      setHistoryEndDate(today);
    } else if (preset === 'ALL') {
      setHistoryStartDate('');
      setHistoryEndDate('');
    }
  };

  const handleOpenEdit = (item) => {
    const today = getTodayISTStr();
    if (item.transaction_date !== today) {
      alert(`Editing is locked for past date records (${item.transaction_date}). Only today's records (${today}) can be modified.`);
      return;
    }

    setEditingItem(item);
    setEditFormData({
      productName: item.product_name,
      machineName: item.machine_name || '',
      companyName: item.company_name || '',
      billNo: item.bill_no || '',
      quantity: String(item.quantity),
      unit: item.unit || 'PCS',
      ratePerUnit: item.rate_per_unit !== undefined ? String(item.rate_per_unit) : '0',
      totalRate: item.total_rate !== undefined ? String(item.total_rate) : '0',
      date: item.transaction_date,
      time: item.transaction_time ? item.transaction_time.substring(0, 5) : '00:00',
      notes: item.notes || ''
    });
    setEditError('');
    setIsEditModalOpen(true);
  };

  const handleEditQtyOrRateChange = (field, val) => {
    setEditFormData(prev => {
      const next = { ...prev, [field]: val };
      const q = parseFloat(field === 'quantity' ? val : next.quantity);
      const r = parseFloat(field === 'ratePerUnit' ? val : next.ratePerUnit);
      if (!isNaN(q) && !isNaN(r)) {
        next.totalRate = (q * r).toFixed(2);
      }
      return next;
    });
  };

  const handleUpdateTransaction = async (e) => {
    e.preventDefault();
    setEditError('');

    try {
      setIsUpdating(true);
      const res = await api.put(`/tools-inventory/transaction/${editingItem.id}`, editFormData);
      if (res.data.ok) {
        setIsEditModalOpen(false);
        setEditingItem(null);
        fetchHistory();
        fetchDropdowns();
        fetchSummary();
        fetchTodayEntries();
      }
    } catch (err) {
      console.error('Update error:', err);
      setEditError(err.response?.data?.error || 'Failed to update transaction.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteTransaction = async (id, itemDate = getTodayISTStr()) => {
    const today = getTodayISTStr();
    if (itemDate !== today) {
      alert(`Deletion is locked for past records (${itemDate}). Only today's records (${today}) can be deleted.`);
      return;
    }

    if (!window.confirm('Are you sure you want to delete this inventory record? (Only permitted for today\'s entries)')) {
      return;
    }
    try {
      const res = await api.delete(`/tools-inventory/transaction/${id}`);
      if (res.data.ok) {
        fetchHistory();
        fetchDropdowns();
        fetchSummary();
        fetchTodayEntries();
      }
    } catch (err) {
      console.error('Delete error:', err);
      alert(err.response?.data?.error || 'Failed to delete transaction.');
    }
  };

  const handleExportCSV = () => {
    if (!historyData.length) {
      alert('No history records to export.');
      return;
    }

    const headers = ['ID', 'Type', 'Date', 'Time', 'Product / Spare Part', 'Machine', 'Company / Vendor', 'Bill No', 'Quantity', 'Unit', 'Rate Per Unit (Rs)', 'Total Value (Rs)', 'Notes', 'Created By'];
    const csvRows = [
      headers.join(','),
      ...historyData.map(r => [
        `"${r.id}"`,
        `"${r.transaction_type}"`,
        `"${r.transaction_date}"`,
        `"${r.transaction_time || ''}"`,
        `"${(r.product_name || '').replace(/"/g, '""')}"`,
        `"${(r.machine_name || '').replace(/"/g, '""')}"`,
        `"${(r.company_name || '').replace(/"/g, '""')}"`,
        `"${(r.bill_no || '').replace(/"/g, '""')}"`,
        r.quantity.toFixed(2),
        `"${r.unit}"`,
        (r.rate_per_unit || 0).toFixed(2),
        (r.total_rate || 0).toFixed(2),
        `"${(r.notes || '').replace(/"/g, '""')}"`,
        `"${r.created_by || ''}"`
      ].join(','))
    ];

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Tools_Inventory_History_${getTodayISTStr()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatDateDisplay = (d) => {
    if (!d) return '—';
    const parts = d.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return d;
  };

  return (
    <div className="space-y-6 animate-fade-in p-2 md:p-6 pb-20 max-w-[1600px] mx-auto">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <span className="p-3 bg-amber-50 text-amber-600 rounded-2xl text-2xl shadow-inner border border-amber-100">🔧</span>
            <div>
              <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase">
                Tools & Spare Parts Inventory
              </h1>
              <p className="text-xs text-slate-500 font-semibold mt-0.5">
                Dynamic pricing, stock valuation, Stock IN/OUT & live closing ledger
              </p>
            </div>
          </div>
        </div>

        {/* 4 MAIN NAVIGATION BUTTONS */}
        <div className="flex flex-wrap items-center gap-2">
          {[
            { id: 'STOCK_IN', label: '📥 Stock In', color: 'bg-emerald-600' },
            { id: 'STOCK_OUT', label: '📤 Stock Out', color: 'bg-rose-600' },
            { id: 'LEDGER', label: '📒 Inventory Ledger', color: 'bg-blue-600' },
            { id: 'HISTORY', label: '📜 History', color: 'bg-indigo-600' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-sm ${
                activeTab === tab.id
                  ? `${tab.color} text-white shadow-md scale-[1.02]`
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* DYNAMIC TOP VALUATION & INVENTORY DASHBOARD */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Cataloged Tools */}
        <div className="card-premium p-5 bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-2xl shadow-md flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute right-3 -bottom-3 text-7xl font-black text-white/5 pointer-events-none select-none">
            🛠️
          </div>
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-300">
                Total Tools Catalog
              </span>
              <span className="p-1.5 bg-white/10 text-amber-400 rounded-lg text-xs">📦</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-black tracking-tight text-white">
                {dashboardStats.overall?.totalTools || 0}
              </span>
              <span className="text-xs text-slate-300 font-bold uppercase">Unique Items</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-700/60 flex items-center justify-between text-[11px] text-slate-300">
            <span>In-Stock: <strong className="text-emerald-400">{dashboardStats.overall?.inStockCount || 0}</strong></span>
            <span>Low: <strong className="text-amber-400">{dashboardStats.overall?.lowStockCount || 0}</strong></span>
            <span>Out: <strong className="text-rose-400">{dashboardStats.overall?.outOfStockCount || 0}</strong></span>
          </div>
        </div>

        {/* Card 2: Total Inventory Valuation */}
        <div className="card-premium p-5 bg-gradient-to-br from-blue-700 to-indigo-800 text-white rounded-2xl shadow-md flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute right-3 -bottom-3 text-7xl font-black text-white/5 pointer-events-none select-none">
            💰
          </div>
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase tracking-widest text-blue-200">
                Total Inventory Valuation
              </span>
              <span className="p-1.5 bg-white/10 text-emerald-300 rounded-lg text-xs">₹</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-black tracking-tight text-white">
                {formatCurrency(dashboardStats.overall?.totalInventoryValue || 0)}
              </span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-white/15 flex items-center justify-between text-[11px] text-blue-100">
            <span>Net In-Stock Qty:</span>
            <strong className="text-white font-mono">{dashboardStats.overall?.totalStockQty || 0} Units</strong>
          </div>
        </div>

        {/* Card 3: Total Stock In Valuation */}
        <div className="card-premium p-5 bg-gradient-to-br from-emerald-600 to-teal-700 text-white rounded-2xl shadow-md flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute right-3 -bottom-3 text-7xl font-black text-white/5 pointer-events-none select-none">
            📥
          </div>
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase tracking-widest text-emerald-100">
                Total Stock IN (Purchased)
              </span>
              <span className="p-1.5 bg-white/10 text-emerald-200 rounded-lg text-xs">📥</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-black tracking-tight text-white">
                {formatCurrency(dashboardStats.overall?.totalInValue || 0)}
              </span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-white/15 flex items-center justify-between text-[11px] text-emerald-100">
            <span>Total Inward Qty:</span>
            <strong className="text-white font-mono">{dashboardStats.overall?.totalInQty || 0} Units</strong>
          </div>
        </div>

        {/* Card 4: Total Stock Out Valuation */}
        <div className="card-premium p-5 bg-gradient-to-br from-rose-600 to-red-700 text-white rounded-2xl shadow-md flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute right-3 -bottom-3 text-7xl font-black text-white/5 pointer-events-none select-none">
            📤
          </div>
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase tracking-widest text-rose-100">
                Total Stock OUT (Issued)
              </span>
              <span className="p-1.5 bg-white/10 text-rose-200 rounded-lg text-xs">📤</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-black tracking-tight text-white">
                {formatCurrency(dashboardStats.overall?.totalOutValue || 0)}
              </span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-white/15 flex items-center justify-between text-[11px] text-rose-100">
            <span>Total Issued Qty:</span>
            <strong className="text-white font-mono">{dashboardStats.overall?.totalOutQty || 0} Units</strong>
          </div>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* TAB 1: STOCK IN */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'STOCK_IN' && (
        <div className="space-y-6 animate-fade-in">
          {/* Top Row: Form + In-Stock Catalog */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Form Card */}
            <div className="lg:col-span-2 card-premium bg-white p-6 md:p-8 space-y-6 rounded-2xl border border-slate-100 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="p-2 bg-emerald-50 text-emerald-600 rounded-lg text-sm">📥</span>
                  <h3 className="text-base font-black text-slate-800 uppercase tracking-wider">
                    Record Spare Part (Stock IN)
                  </h3>
                </div>
                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100">
                  Live Valuation Enabled
                </span>
              </div>

              <form onSubmit={handleStockInSubmit} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Product Name */}
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                      Product / Spare Part Name *
                    </label>
                    <input
                      type="text"
                      list="tinProductList"
                      value={stockInForm.productName}
                      onChange={(e) => setStockInForm({ ...stockInForm, productName: e.target.value })}
                      placeholder="e.g. Bearing 6204, Heater Band 45mm, Solenoid Valve..."
                      className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-slate-800 font-bold text-sm focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none"
                      required
                    />
                    <datalist id="tinProductList">
                      {dropdowns.products.map((p, i) => (
                        <option key={i} value={p.product_name} />
                      ))}
                    </datalist>
                  </div>

                  {/* Machine Name */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                      Machine Name / Section
                    </label>
                    <input
                      type="text"
                      list="tinMachineList"
                      value={stockInForm.machineName}
                      onChange={(e) => setStockInForm({ ...stockInForm, machineName: e.target.value })}
                      placeholder="e.g. Blowing Machine 1, Filler Unit..."
                      className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-medium focus:border-primary outline-none"
                    />
                    <datalist id="tinMachineList">
                      {dropdowns.machines.map((m, i) => (
                        <option key={i} value={m} />
                      ))}
                    </datalist>
                  </div>

                  {/* Company Name */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                      Company / Vendor Name
                    </label>
                    <input
                      type="text"
                      list="tinCompanyList"
                      value={stockInForm.companyName}
                      onChange={(e) => setStockInForm({ ...stockInForm, companyName: e.target.value })}
                      placeholder="e.g. SKF Bearing Co, Omkar Electricals..."
                      className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-medium focus:border-primary outline-none"
                    />
                    <datalist id="tinCompanyList">
                      {dropdowns.companies.map((c, i) => (
                        <option key={i} value={c} />
                      ))}
                    </datalist>
                  </div>

                  {/* Quantity + Unit */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                      Quantity *
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.01"
                        value={stockInForm.quantity}
                        onChange={(e) => handleStockInQtyChange(e.target.value)}
                        placeholder="0.00"
                        className="w-full h-11 px-3.5 pr-20 rounded-xl border border-slate-200 bg-white text-slate-800 font-bold text-sm focus:border-primary outline-none"
                        required
                      />
                      <select
                        value={stockInForm.unit}
                        onChange={(e) => setStockInForm({ ...stockInForm, unit: e.target.value })}
                        className="absolute right-2 top-2 h-7 bg-slate-100 rounded-lg text-xs font-bold text-slate-700 px-2 border border-slate-200 outline-none cursor-pointer"
                      >
                        <option value="PCS">PCS</option>
                        <option value="BOX">BOX</option>
                        <option value="KG">KG</option>
                        <option value="SETS">SETS</option>
                        <option value="MTR">MTR</option>
                      </select>
                    </div>
                  </div>

                  {/* Rate Per Unit */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                      Rate Per Unit (₹ / {stockInForm.unit})
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-3 text-xs font-bold text-slate-400">₹</span>
                      <input
                        type="number"
                        step="0.01"
                        value={stockInForm.ratePerUnit}
                        onChange={(e) => handleStockInRateChange(e.target.value)}
                        placeholder="e.g. 100.00"
                        className="w-full h-11 pl-8 pr-16 rounded-xl border border-slate-200 bg-white text-slate-800 font-bold text-sm focus:border-primary outline-none"
                      />
                      <span className="absolute right-3.5 top-3 text-xs font-bold text-slate-400">
                        /{stockInForm.unit}
                      </span>
                    </div>
                  </div>

                  {/* Total Rate / Valuation (Auto-Calculated) */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block flex items-center justify-between">
                      <span>Total Value (₹)</span>
                      <span className="text-[10px] text-emerald-600 font-bold">Qty × Rate</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-3 text-xs font-bold text-emerald-600">₹</span>
                      <input
                        type="number"
                        step="0.01"
                        value={stockInForm.totalRate}
                        onChange={(e) => handleStockInTotalChange(e.target.value)}
                        placeholder="0.00"
                        className="w-full h-11 pl-8 pr-3.5 rounded-xl border border-emerald-200 bg-emerald-50/40 text-emerald-800 font-black text-sm focus:border-emerald-500 outline-none"
                      />
                    </div>
                  </div>

                  {/* Bill No */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                      Bill / Invoice Number
                    </label>
                    <input
                      type="text"
                      value={stockInForm.billNo}
                      onChange={(e) => setStockInForm({ ...stockInForm, billNo: e.target.value })}
                      placeholder="e.g. INV-2026-901"
                      className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-medium focus:border-primary outline-none"
                    />
                  </div>

                  {/* Date (Defaults to Today) */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                      Date (Today) *
                    </label>
                    <input
                      type="date"
                      value={stockInForm.date}
                      onChange={(e) => setStockInForm({ ...stockInForm, date: e.target.value })}
                      className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-medium outline-none"
                      required
                    />
                  </div>

                  {/* Time */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                      Time
                    </label>
                    <input
                      type="time"
                      value={stockInForm.time}
                      onChange={(e) => setStockInForm({ ...stockInForm, time: e.target.value })}
                      className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-medium outline-none"
                    />
                  </div>

                  {/* Notes */}
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                      Notes / Location / Specification
                    </label>
                    <input
                      type="text"
                      value={stockInForm.notes}
                      onChange={(e) => setStockInForm({ ...stockInForm, notes: e.target.value })}
                      placeholder="e.g. Rack A-3, stainless steel grade 304, spare backup..."
                      className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-medium outline-none"
                    />
                  </div>
                </div>

                {/* Dynamic Calculation Live Breakdown Box */}
                {stockInForm.quantity && stockInForm.ratePerUnit ? (
                  <div className="p-3.5 bg-slate-900 rounded-xl text-white flex items-center justify-between text-xs">
                    <span className="text-slate-400">
                      Calculation Summary: <strong className="text-white">{stockInForm.quantity} {stockInForm.unit}</strong> × <strong className="text-amber-300">₹{stockInForm.ratePerUnit}/{stockInForm.unit}</strong>
                    </span>
                    <span className="text-sm font-black text-emerald-400">
                      = {formatCurrency(stockInForm.totalRate || 0)}
                    </span>
                  </div>
                ) : null}

                {stockInMsg.text && (
                  <div className={`p-4 rounded-xl text-xs font-bold border ${
                    stockInMsg.type === 'success'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                      : 'bg-red-50 text-red-600 border-red-100'
                  }`}>
                    {stockInMsg.type === 'success' ? '✅' : '⚠️'} {stockInMsg.text}
                  </div>
                )}

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isSavingIn}
                    className="btn-premium bg-emerald-600 hover:bg-emerald-700 text-white w-full h-12 flex items-center justify-center gap-2 uppercase font-bold text-xs tracking-wider shadow-sm disabled:opacity-50 cursor-pointer"
                  >
                    {isSavingIn ? (
                      <>
                        <span className="loading loading-spinner loading-xs"></span>
                        Saving Stock IN...
                      </>
                    ) : (
                      <>
                        <span>📥</span> Save Stock IN Record
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>

            {/* In-Stock Catalog */}
            <div className="card-premium bg-white p-6 space-y-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <span className="text-xs font-black text-slate-800 uppercase tracking-wider">
                    📦 In-Stock Catalog ({dropdowns.products.length})
                  </span>
                  <button
                    onClick={() => { fetchDropdowns(); fetchSummary(); fetchTodayEntries(); }}
                    className="text-[10px] font-bold text-blue-600 hover:underline cursor-pointer"
                  >
                    Refresh
                  </button>
                </div>

                <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                  {dropdowns.products.length === 0 ? (
                    <p className="text-xs text-slate-400 italic py-6 text-center">
                      No spare parts entered yet. Use the form to record your first Stock In.
                    </p>
                  ) : (
                    dropdowns.products.map((p, idx) => (
                      <div key={idx} className="p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors border border-slate-100 flex items-center justify-between">
                        <div>
                          <span className="text-xs font-bold text-slate-800 block">
                            {p.product_name}
                          </span>
                          <span className="text-[10px] text-slate-400 font-medium block">
                            {p.machine_name || 'General'} • {p.company_name || 'Direct'}
                          </span>
                          {p.rate_per_unit > 0 && (
                            <span className="text-[10px] text-emerald-600 font-bold block mt-0.5">
                              ₹{p.rate_per_unit}/{p.unit}
                            </span>
                          )}
                        </div>
                        <div className="text-right">
                          <span className={`text-xs font-black px-2.5 py-1 rounded-lg border block ${
                            p.current_stock > 0
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}>
                            {p.current_stock} {p.unit}
                          </span>
                          {p.total_value > 0 && (
                            <span className="text-[10px] font-mono font-bold text-slate-500 block mt-1">
                              {formatCurrency(p.total_value)}
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="bg-amber-50/70 p-3.5 rounded-xl border border-amber-200/60 text-amber-900 text-xs">
                <span className="font-bold block">💡 Live Pricing Auto-Calc:</span>
                <span className="text-[11px] text-amber-800/90 leading-relaxed block mt-0.5">
                  Every unit rate entered dynamically calculates the item's total monetary valuation in the inventory ledger.
                </span>
              </div>
            </div>
          </div>

          {/* ───────────────────────────────────────────────────────────── */}
          {/* BELOW FORM: TODAY'S DATA ENTRY (EDITABLE FOR TODAY ONLY) */}
          {/* ───────────────────────────────────────────────────────────── */}
          <div className="card-premium bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="p-2 bg-emerald-50 text-emerald-600 rounded-lg text-base">📅</span>
                <div>
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">
                    Today's Stock IN Entries ({todayInEntries.length})
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Entries recorded today ({formatDateDisplay(getTodayISTStr())}) can be edited or deleted during today's shift. Once the date changes to tomorrow, entries are locked automatically.
                  </p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                ⚡ Editable Today Only
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="table table-zebra w-full">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr className="text-slate-500 text-[11px] font-black uppercase tracking-wider">
                    <th className="py-3 px-4 text-left">Time</th>
                    <th className="py-3 px-4 text-left">Product / Spare Part</th>
                    <th className="py-3 px-4 text-left">Machine</th>
                    <th className="py-3 px-4 text-left">Company</th>
                    <th className="py-3 px-4 text-left">Bill No</th>
                    <th className="py-3 px-4 text-right">Quantity</th>
                    <th className="py-3 px-4 text-right">Rate / Unit</th>
                    <th className="py-3 px-4 text-right">Total Value</th>
                    <th className="py-3 px-4 text-left">Notes</th>
                    <th className="py-3 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {loadingTodayEntries ? (
                    <tr>
                      <td colSpan="10" className="py-8 text-center text-slate-400 text-xs">
                        <span className="loading loading-spinner text-primary block mx-auto mb-2"></span>
                        Loading today's stock entries...
                      </td>
                    </tr>
                  ) : todayInEntries.length === 0 ? (
                    <tr>
                      <td colSpan="10" className="py-8 text-center text-slate-400 font-medium italic text-xs">
                        No Stock IN records entered yet today ({formatDateDisplay(getTodayISTStr())}). Use the form above to record.
                      </td>
                    </tr>
                  ) : (
                    todayInEntries.map((item) => (
                      <tr key={item.id} className="hover:bg-emerald-50/20 transition-colors">
                        <td className="py-3 px-4 font-mono text-xs text-slate-600 font-bold">
                          {item.transaction_time || '—'}
                        </td>
                        <td className="py-3 px-4 font-black text-slate-800 text-xs uppercase tracking-tight">
                          {item.product_name}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-600 font-medium">
                          {item.machine_name || '—'}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-600 font-medium">
                          {item.company_name || '—'}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-600 font-mono font-semibold">
                          {item.bill_no || '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-black text-xs text-emerald-600">
                          +{item.quantity.toFixed(2)} {item.unit}
                        </td>
                        <td className="py-3 px-4 text-right text-xs font-bold text-slate-700">
                          {item.rate_per_unit > 0 ? `₹${item.rate_per_unit.toFixed(2)}/${item.unit}` : '—'}
                        </td>
                        <td className="py-3 px-4 text-right text-xs font-black text-emerald-700">
                          {formatCurrency(item.total_rate || 0)}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-500 max-w-[140px] truncate" title={item.notes || ''}>
                          {item.notes || '—'}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(item)}
                              className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-bold border border-blue-200 cursor-pointer"
                              title="Edit Today's Record"
                            >
                              ✏️ Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteTransaction(item.id, item.transaction_date)}
                              className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-xs font-bold border border-red-200 cursor-pointer"
                              title="Delete Today's Record"
                            >
                              🗑️ Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* TAB 2: STOCK OUT */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'STOCK_OUT' && (
        <div className="space-y-6 animate-fade-in">
          {/* Top Row: Stock Out Form + Help Card */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Stock Out Form */}
            <div className="lg:col-span-2 card-premium bg-white p-6 md:p-8 space-y-6 rounded-2xl border border-slate-100 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="p-2 bg-rose-50 text-rose-600 rounded-lg text-sm">📤</span>
                  <h3 className="text-base font-black text-slate-800 uppercase tracking-wider">
                    Issue Spare Part (Stock OUT)
                  </h3>
                </div>
                <span className="text-[11px] font-bold text-rose-700 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-100">
                  Auto Stock Deduction
                </span>
              </div>

              <form onSubmit={handleStockOutSubmit} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Product Name Dropdown (Populated from Stock In) */}
                  <div className="space-y-1.5 md:col-span-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                        Product Name (From Stock In) *
                      </label>
                      {selectedOutProductStock && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                            Available: {selectedOutProductStock.current_stock} {selectedOutProductStock.unit}
                          </span>
                          {selectedOutProductStock.rate_per_unit > 0 && (
                            <span className="text-xs font-black text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                              ₹{selectedOutProductStock.rate_per_unit}/{selectedOutProductStock.unit}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <select
                      value={stockOutForm.productName}
                      onChange={handleStockOutProductChange}
                      className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-slate-800 font-bold text-sm focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none cursor-pointer"
                      required
                    >
                      <option value="">-- Select Product From Stock In --</option>
                      {dropdowns.products.map((p, idx) => (
                        <option key={idx} value={p.product_name}>
                          {p.product_name} (Current: {p.current_stock} {p.unit} • ₹{p.rate_per_unit || 0}/{p.unit})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Machine Name */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                      Machine Name / Assigned To
                    </label>
                    <input
                      type="text"
                      list="toutMachineList"
                      value={stockOutForm.machineName}
                      onChange={(e) => setStockOutForm({ ...stockOutForm, machineName: e.target.value })}
                      placeholder="e.g. Blowing Machine 1"
                      className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-medium focus:border-primary outline-none"
                    />
                    <datalist id="toutMachineList">
                      {dropdowns.machines.map((m, i) => (
                        <option key={i} value={m} />
                      ))}
                    </datalist>
                  </div>

                  {/* Company Name */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                      Company / Vendor Reference
                    </label>
                    <input
                      type="text"
                      list="toutCompanyList"
                      value={stockOutForm.companyName}
                      onChange={(e) => setStockOutForm({ ...stockOutForm, companyName: e.target.value })}
                      placeholder="e.g. SKF Bearing Co"
                      className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-medium focus:border-primary outline-none"
                    />
                    <datalist id="toutCompanyList">
                      {dropdowns.companies.map((c, i) => (
                        <option key={i} value={c} />
                      ))}
                    </datalist>
                  </div>

                  {/* Quantity */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                      Quantity to Issue *
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.01"
                        value={stockOutForm.quantity}
                        onChange={(e) => handleStockOutQtyChange(e.target.value)}
                        placeholder="0.00"
                        className="w-full h-11 px-3.5 pr-14 rounded-xl border border-slate-200 bg-white text-slate-800 font-bold text-sm focus:border-primary outline-none"
                        required
                      />
                      <span className="absolute right-3.5 top-3 text-xs font-bold text-slate-400">
                        {stockOutForm.unit}
                      </span>
                    </div>
                  </div>

                  {/* Rate Per Unit */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                      Rate Per Unit (₹ / {stockOutForm.unit})
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-3 text-xs font-bold text-slate-400">₹</span>
                      <input
                        type="number"
                        step="0.01"
                        value={stockOutForm.ratePerUnit}
                        onChange={(e) => {
                          const r = e.target.value;
                          const q = stockOutForm.quantity;
                          setStockOutForm(prev => ({
                            ...prev,
                            ratePerUnit: r,
                            totalRate: (q && r) ? (parseFloat(q) * parseFloat(r)).toFixed(2) : ''
                          }));
                        }}
                        placeholder="0.00"
                        className="w-full h-11 pl-8 pr-16 rounded-xl border border-slate-200 bg-white text-slate-800 font-bold text-sm outline-none"
                      />
                      <span className="absolute right-3.5 top-3 text-xs font-bold text-slate-400">
                        /{stockOutForm.unit}
                      </span>
                    </div>
                  </div>

                  {/* Total Value */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                      Total Issue Valuation (₹)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-3 text-xs font-bold text-rose-600">₹</span>
                      <input
                        type="number"
                        step="0.01"
                        value={stockOutForm.totalRate}
                        readOnly
                        placeholder="0.00"
                        className="w-full h-11 pl-8 pr-3.5 rounded-xl border border-rose-200 bg-rose-50/40 text-rose-800 font-black text-sm outline-none"
                      />
                    </div>
                  </div>

                  {/* Date */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                      Date (Today) *
                    </label>
                    <input
                      type="date"
                      value={stockOutForm.date}
                      onChange={(e) => setStockOutForm({ ...stockOutForm, date: e.target.value })}
                      className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-medium outline-none"
                      required
                    />
                  </div>

                  {/* Notes / Reason */}
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                      Reason for Issue / Maintenance Task
                    </label>
                    <input
                      type="text"
                      value={stockOutForm.notes}
                      onChange={(e) => setStockOutForm({ ...stockOutForm, notes: e.target.value })}
                      placeholder="e.g. Replaced worn bearing during shift 2 overhaul..."
                      className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-medium outline-none"
                    />
                  </div>
                </div>

                {/* Real-time remaining stock banner */}
                {selectedOutProductStock && (
                  <div className="bg-[#0b1324] rounded-xl p-4 text-white flex flex-col sm:flex-row items-center justify-between gap-3 shadow-inner">
                    <div className="text-xs font-medium text-slate-300">
                      <span>Available: <strong>{selectedOutProductStock.current_stock} {selectedOutProductStock.unit}</strong></span>
                      <span className="mx-2">•</span>
                      <span>Issue: <strong>{stockOutForm.quantity || '0'} {selectedOutProductStock.unit}</strong></span>
                      {stockOutForm.totalRate > 0 && (
                        <>
                          <span className="mx-2">•</span>
                          <span>Issue Value: <strong className="text-rose-400">{formatCurrency(stockOutForm.totalRate)}</strong></span>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs uppercase tracking-widest text-slate-400 font-bold">Remaining:</span>
                      <span className={`text-base font-black px-2.5 py-0.5 rounded-md ${
                        remainingAfterOut >= 0
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse'
                      }`}>
                        {remainingAfterOut.toFixed(2)} {selectedOutProductStock.unit}
                      </span>
                    </div>
                  </div>
                )}

                {stockOutMsg.text && (
                  <div className={`p-4 rounded-xl text-xs font-bold border ${
                    stockOutMsg.type === 'success'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                      : 'bg-red-50 text-red-600 border-red-100'
                  }`}>
                    {stockOutMsg.type === 'success' ? '✅' : '⚠️'} {stockOutMsg.text}
                  </div>
                )}

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isSavingOut || (selectedOutProductStock && remainingAfterOut < 0)}
                    className="btn-premium bg-rose-600 hover:bg-rose-700 text-white w-full h-12 flex items-center justify-center gap-2 uppercase font-bold text-xs tracking-wider shadow-sm disabled:opacity-50 cursor-pointer"
                  >
                    {isSavingOut ? (
                      <>
                        <span className="loading loading-spinner loading-xs"></span>
                        Recording Stock OUT...
                      </>
                    ) : (
                      <>
                        <span>📤</span> Issue Stock OUT Record
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>

            {/* Quick Help Card */}
            <div className="card-premium bg-white p-6 space-y-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between">
              <div className="space-y-3">
                <span className="text-xs font-black text-slate-800 uppercase tracking-wider block border-b border-slate-100 pb-2.5">
                  ⚡ Stock Out Workflow
                </span>
                <ul className="space-y-3 text-xs text-slate-600">
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 font-black">1.</span>
                    <span>Select any spare part already entered in <strong>Stock In</strong>.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 font-black">2.</span>
                    <span>The unit rate and available balance are loaded automatically.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 font-black">3.</span>
                    <span>Every issue logs the valuation and automatically reduces the daily <strong>Inventory Ledger</strong> closing stock.</span>
                  </li>
                </ul>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-slate-600 text-xs text-center">
                <span className="font-bold block text-slate-700">Need a new spare part?</span>
                <button
                  onClick={() => setActiveTab('STOCK_IN')}
                  className="mt-2 btn-premium bg-primary text-white text-xs px-4 h-9 w-full font-bold"
                >
                  Go to Stock In Form
                </button>
              </div>
            </div>
          </div>

          {/* ───────────────────────────────────────────────────────────── */}
          {/* BELOW FORM: TODAY'S STOCK OUT DATA ENTRIES (EDITABLE TODAY ONLY) */}
          {/* ───────────────────────────────────────────────────────────── */}
          <div className="card-premium bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="p-2 bg-rose-50 text-rose-600 rounded-lg text-base">📅</span>
                <div>
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">
                    Today's Stock OUT Entries ({todayOutEntries.length})
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Entries recorded today ({formatDateDisplay(getTodayISTStr())}) can be edited or deleted during today's shift. Once the date changes to tomorrow, entries are locked automatically.
                  </p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200 shrink-0">
                ⚡ Editable Today Only
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="table table-zebra w-full">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr className="text-slate-500 text-[11px] font-black uppercase tracking-wider">
                    <th className="py-3 px-4 text-left">Time</th>
                    <th className="py-3 px-4 text-left">Product / Spare Part</th>
                    <th className="py-3 px-4 text-left">Machine / Section</th>
                    <th className="py-3 px-4 text-left">Company / Ref</th>
                    <th className="py-3 px-4 text-right">Quantity</th>
                    <th className="py-3 px-4 text-right">Rate / Unit</th>
                    <th className="py-3 px-4 text-right">Total Value</th>
                    <th className="py-3 px-4 text-left">Notes / Reason</th>
                    <th className="py-3 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {loadingTodayEntries ? (
                    <tr>
                      <td colSpan="9" className="py-8 text-center text-slate-400 text-xs">
                        <span className="loading loading-spinner text-primary block mx-auto mb-2"></span>
                        Loading today's stock entries...
                      </td>
                    </tr>
                  ) : todayOutEntries.length === 0 ? (
                    <tr>
                      <td colSpan="9" className="py-8 text-center text-slate-400 font-medium italic text-xs">
                        No Stock OUT records issued yet today ({formatDateDisplay(getTodayISTStr())}).
                      </td>
                    </tr>
                  ) : (
                    todayOutEntries.map((item) => (
                      <tr key={item.id} className="hover:bg-rose-50/20 transition-colors">
                        <td className="py-3 px-4 font-mono text-xs text-slate-600 font-bold">
                          {item.transaction_time || '—'}
                        </td>
                        <td className="py-3 px-4 font-black text-slate-800 text-xs uppercase tracking-tight">
                          {item.product_name}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-600 font-medium">
                          {item.machine_name || '—'}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-600 font-medium">
                          {item.company_name || '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-black text-xs text-rose-600">
                          -{item.quantity.toFixed(2)} {item.unit}
                        </td>
                        <td className="py-3 px-4 text-right text-xs font-bold text-slate-700">
                          {item.rate_per_unit > 0 ? `₹${item.rate_per_unit.toFixed(2)}/${item.unit}` : '—'}
                        </td>
                        <td className="py-3 px-4 text-right text-xs font-black text-rose-700">
                          {formatCurrency(item.total_rate || 0)}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-500 max-w-[140px] truncate" title={item.notes || ''}>
                          {item.notes || '—'}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(item)}
                              className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-bold border border-blue-200 cursor-pointer"
                              title="Edit Today's Record"
                            >
                              ✏️ Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteTransaction(item.id, item.transaction_date)}
                              className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-xs font-bold border border-red-200 cursor-pointer"
                              title="Delete Today's Record"
                            >
                              🗑️ Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* TAB 3: INVENTORY LEDGER */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'LEDGER' && (
        <div className="space-y-6 animate-fade-in">
          {/* LEDGER DATE & DYNAMIC ITEM FILTER TOOLBAR */}
          <div className="card-premium p-4 bg-white border border-slate-100 shadow-sm rounded-2xl flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Ledger Date:</span>
              <input
                type="date"
                value={ledgerDate}
                onChange={(e) => setLedgerDate(e.target.value)}
                className="h-10 px-3.5 rounded-xl border border-slate-200 bg-white text-slate-800 font-bold text-xs outline-none focus:border-primary"
              />
              <button
                onClick={() => setLedgerDate(getTodayISTStr())}
                className="text-xs font-bold text-primary hover:underline cursor-pointer"
              >
                Today
              </button>
              {isLedgerClosed ? (
                <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
                  🔒 Closed Snapshot
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-600 border border-emerald-200">
                  ⚡ Live Dynamic
                </span>
              )}
            </div>

            {/* Item Quick Filter Dropdown + Search Box */}
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <div className="w-full sm:w-56">
                <select
                  value={ledgerSearch}
                  onChange={(e) => setLedgerSearch(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 text-xs outline-none focus:border-primary font-bold cursor-pointer"
                >
                  <option value="">🔍 Filter by Item...</option>
                  {ledgerAllProducts.map((p, i) => (
                    <option key={i} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              <div className="w-full sm:w-64 relative">
                <input
                  type="text"
                  value={ledgerSearch}
                  onChange={(e) => setLedgerSearch(e.target.value)}
                  placeholder="Type to search part, machine..."
                  className="w-full h-10 pl-8 pr-8 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs outline-none focus:border-primary font-medium"
                />
                <span className="absolute left-2.5 top-3 text-xs text-slate-400">🔍</span>
                {ledgerSearch && (
                  <button
                    onClick={() => setLedgerSearch('')}
                    className="absolute right-2.5 top-2.5 text-xs text-slate-400 hover:text-slate-600 font-bold cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* DYNAMIC FILTERED VALUATION BANNER */}
          {ledgerSearch ? (
            <div className="p-4 bg-gradient-to-r from-blue-900 to-indigo-900 rounded-2xl text-white shadow-md flex flex-col md:flex-row items-center justify-between gap-4 animate-fade-in border border-blue-800">
              <div className="flex items-center gap-3">
                <span className="p-2.5 bg-blue-800/80 rounded-xl text-lg">🎯</span>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-blue-200 block">
                    Filtered Item Valuation Analysis ({ledgerSummary.itemCount} item matched)
                  </span>
                  <span className="text-base font-bold text-white block">
                    Filter: "<strong className="text-amber-300">{ledgerSearch}</strong>"
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs font-bold">
                <div className="bg-white/10 px-3.5 py-2 rounded-xl border border-white/15">
                  <span className="text-[10px] text-blue-200 uppercase block">Selected Closing Stock</span>
                  <span className="text-sm font-black text-white">
                    {ledgerSummary.totalClosing.toFixed(2)} Units
                  </span>
                </div>
                <div className="bg-emerald-500/20 px-4 py-2 rounded-xl border border-emerald-400/30">
                  <span className="text-[10px] text-emerald-300 uppercase block">Selected Item Valuation</span>
                  <span className="text-base font-black text-emerald-300">
                    {formatCurrency(ledgerSummary.totalClosingValue)}
                  </span>
                </div>
                <button
                  onClick={() => setLedgerSearch('')}
                  className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold uppercase transition-all cursor-pointer"
                >
                  Clear Filter
                </button>
              </div>
            </div>
          ) : null}

          {/* LEDGER KPI SUMMARY */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card-premium p-5 border-l-4 border-slate-400 bg-white shadow-sm">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">TOTAL OPENING</span>
              <span className="text-2xl font-black text-slate-700 mt-1 block">
                {ledgerSummary.totalOpening.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
              <span className="text-[11px] font-bold text-slate-400 block mt-0.5">
                Valuation: {formatCurrency(ledgerSummary.totalOpeningValue || 0)}
              </span>
            </div>

            <div className="card-premium p-5 border-l-4 border-emerald-500 bg-white shadow-sm">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">TOTAL STOCK IN</span>
              <span className="text-2xl font-black text-emerald-600 mt-1 block">
                +{ledgerSummary.totalIn.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
              <span className="text-[11px] font-bold text-emerald-600 block mt-0.5">
                Valuation: {formatCurrency(ledgerSummary.totalInValue || 0)}
              </span>
            </div>

            <div className="card-premium p-5 border-l-4 border-rose-500 bg-white shadow-sm">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">TOTAL STOCK OUT</span>
              <span className="text-2xl font-black text-rose-600 mt-1 block">
                -{ledgerSummary.totalOut.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
              <span className="text-[11px] font-bold text-rose-600 block mt-0.5">
                Valuation: {formatCurrency(ledgerSummary.totalOutValue || 0)}
              </span>
            </div>

            <div className="card-premium p-5 border-l-4 border-blue-600 bg-white shadow-sm">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">CLOSING VALUATION</span>
              <span className="text-2xl font-black text-blue-600 mt-1 block">
                {formatCurrency(ledgerSummary.totalClosingValue || 0)}
              </span>
              <span className="text-[11px] font-bold text-blue-500 block mt-0.5">
                Total Units: {ledgerSummary.totalClosing.toFixed(2)}
              </span>
            </div>
          </div>

          {/* LEDGER TABLE */}
          <div className="card-premium overflow-hidden bg-white border border-slate-100 shadow-sm rounded-2xl">
            <div className="overflow-x-auto">
              <table className="table table-zebra w-full">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr className="text-slate-500 text-[11px] font-black uppercase tracking-wider">
                    <th className="py-4 px-5 text-left">Spare Part / Tool Name</th>
                    <th className="py-4 px-5 text-left">Machine</th>
                    <th className="py-4 px-5 text-left">Company</th>
                    <th className="py-4 px-5 text-right">Opening Stock</th>
                    <th className="py-4 px-5 text-right">Stock IN</th>
                    <th className="py-4 px-5 text-right">Stock OUT</th>
                    <th className="py-4 px-5 text-right">Closing Stock</th>
                    <th className="py-4 px-5 text-right">Rate / Unit</th>
                    <th className="py-4 px-5 text-right">Total Valuation</th>
                    <th className="py-4 px-5 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {loadingLedger ? (
                    <tr>
                      <td colSpan="10" className="py-20 text-center text-slate-400">
                        <span className="loading loading-spinner text-primary block mx-auto mb-2"></span>
                        Loading inventory ledger...
                      </td>
                    </tr>
                  ) : ledgerData.length === 0 ? (
                    <tr>
                      <td colSpan="10" className="py-20 text-center text-slate-400 font-medium italic">
                        No spare parts found for this date / search.
                      </td>
                    </tr>
                  ) : (
                    ledgerData.map((row, idx) => (
                      <tr key={idx} className="hover:bg-blue-50/20 transition-colors">
                        <td className="py-3.5 px-5">
                          <span className="text-sm font-black text-slate-800 block uppercase tracking-tight">
                            {row.product_name}
                          </span>
                        </td>
                        <td className="py-3.5 px-5 text-xs text-slate-600 font-medium">
                          {row.machine_name}
                        </td>
                        <td className="py-3.5 px-5 text-xs text-slate-600 font-medium">
                          {row.company_name}
                        </td>
                        <td className="py-3.5 px-5 text-right font-bold text-slate-600 text-xs">
                          {row.opening_stock.toFixed(2)} {row.unit}
                        </td>
                        <td className="py-3.5 px-5 text-right font-bold text-emerald-600 text-xs">
                          {row.stock_in > 0 ? `+${row.stock_in.toFixed(2)}` : '0.00'} {row.unit}
                        </td>
                        <td className="py-3.5 px-5 text-right font-bold text-rose-600 text-xs">
                          {row.stock_out > 0 ? `-${row.stock_out.toFixed(2)}` : '0.00'} {row.unit}
                        </td>
                        <td className="py-3.5 px-5 text-right">
                          <span className="text-xs font-black text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-100">
                            {row.closing_stock.toFixed(2)} {row.unit}
                          </span>
                        </td>
                        <td className="py-3.5 px-5 text-right text-xs font-bold text-slate-700">
                          {row.rate_per_unit > 0 ? (
                            <span>₹ {row.rate_per_unit.toFixed(2)} <span className="text-[10px] text-slate-400">/{row.unit}</span></span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-3.5 px-5 text-right text-xs font-black text-emerald-700">
                          {row.total_value > 0 ? (
                            <span className="bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                              {formatCurrency(row.total_value)}
                            </span>
                          ) : (
                            <span className="text-slate-400">₹ 0.00</span>
                          )}
                        </td>
                        <td className="py-3.5 px-5 text-center">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                            row.closing_stock > 2
                              ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                              : row.closing_stock > 0
                              ? 'bg-amber-50 text-amber-600 border border-amber-100'
                              : 'bg-rose-50 text-rose-600 border border-rose-100'
                          }`}>
                            {row.closing_stock > 2 ? 'In Stock' : row.closing_stock > 0 ? 'Low Stock' : 'Out of Stock'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* TAB 4: HISTORY */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'HISTORY' && (
        <div className="space-y-6 animate-fade-in">
          {/* TOOLBAR */}
          <div className="card-premium p-4 space-y-4 bg-white border border-slate-100 shadow-sm rounded-2xl">
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
              {/* Type selector & Date Presets */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center rounded-xl bg-slate-100 p-1 border border-slate-200">
                  {['ALL', 'STOCK_IN', 'STOCK_OUT'].map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => { setHistoryType(t); setHistoryPage(1); }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        historyType === t
                          ? 'bg-white text-slate-800 shadow-sm'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      {t === 'ALL' ? 'All Transactions' : t === 'STOCK_IN' ? 'Stock In Only' : 'Stock Out Only'}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-1">
                  {[
                    { id: 'ALL', label: 'All' },
                    { id: 'TODAY', label: 'Today' },
                    { id: 'YESTERDAY', label: 'Yesterday' },
                    { id: 'WEEK', label: '7 Days' },
                    { id: 'MONTH', label: 'This Month' }
                  ].map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => applyHistoryDatePreset(p.id)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        historyDatePreset === p.id
                          ? 'bg-primary text-white shadow-sm'
                          : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Search & Export */}
              <div className="flex items-center gap-2.5">
                <input
                  type="text"
                  value={historySearch}
                  onChange={(e) => { setHistorySearch(e.target.value); setHistoryPage(1); }}
                  placeholder="Search spare part, machine, company, bill..."
                  className="h-10 px-3.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs outline-none focus:border-primary w-64 font-medium"
                />
                <button
                  onClick={handleExportCSV}
                  className="btn-premium bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs px-3.5 h-10 flex items-center gap-1 font-bold cursor-pointer"
                >
                  📥 Export CSV
                </button>
              </div>
            </div>

            {/* History Value Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-100 text-xs">
              <div className="p-2.5 bg-slate-50 rounded-xl">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Records</span>
                <span className="text-sm font-black text-slate-700">{historySummary.totalCount}</span>
              </div>
              <div className="p-2.5 bg-emerald-50/60 rounded-xl">
                <span className="text-[10px] uppercase font-bold text-emerald-700 block">Inward Quantity</span>
                <span className="text-sm font-black text-emerald-700">{historySummary.totalIn} Units</span>
              </div>
              <div className="p-2.5 bg-emerald-50/60 rounded-xl">
                <span className="text-[10px] uppercase font-bold text-emerald-700 block">Inward Valuation</span>
                <span className="text-sm font-black text-emerald-700">{formatCurrency(historySummary.totalInValue)}</span>
              </div>
              <div className="p-2.5 bg-rose-50/60 rounded-xl">
                <span className="text-[10px] uppercase font-bold text-rose-700 block">Outward Valuation</span>
                <span className="text-sm font-black text-rose-700">{formatCurrency(historySummary.totalOutValue)}</span>
              </div>
            </div>
          </div>

          {/* HISTORY TABLE */}
          <div className="card-premium overflow-hidden bg-white border border-slate-100 shadow-sm rounded-2xl">
            <div className="overflow-x-auto">
              <table className="table table-zebra w-full">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr className="text-slate-500 text-[11px] font-black uppercase tracking-wider">
                    <th className="py-4 px-5 text-left">Date & Time</th>
                    <th className="py-4 px-5 text-left">ID</th>
                    <th className="py-4 px-5 text-left">Type</th>
                    <th className="py-4 px-5 text-left">Product / Spare Part</th>
                    <th className="py-4 px-5 text-left">Machine</th>
                    <th className="py-4 px-5 text-left">Company / Vendor</th>
                    <th className="py-4 px-5 text-left">Bill No</th>
                    <th className="py-4 px-5 text-right">Quantity</th>
                    <th className="py-4 px-5 text-right">Rate / Unit</th>
                    <th className="py-4 px-5 text-right">Total Value</th>
                    <th className="py-4 px-5 text-left">Notes</th>
                    <th className="py-4 px-5 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {loadingHistory ? (
                    <tr>
                      <td colSpan="12" className="py-20 text-center text-slate-400">
                        <span className="loading loading-spinner text-primary block mx-auto mb-2"></span>
                        Loading transactions...
                      </td>
                    </tr>
                  ) : historyData.length === 0 ? (
                    <tr>
                      <td colSpan="12" className="py-20 text-center text-slate-400 font-medium italic">
                        No transactions found.
                      </td>
                    </tr>
                  ) : (
                    historyData.map((item) => {
                      const isToday = item.transaction_date === getTodayISTStr();
                      return (
                        <tr key={item.id} className="hover:bg-blue-50/20 transition-colors">
                          <td className="py-3.5 px-5">
                            <div className="font-bold text-slate-700 text-xs">{formatDateDisplay(item.transaction_date)}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{item.transaction_time || ''}</div>
                          </td>
                          <td className="py-3.5 px-5">
                            <span className="text-[11px] font-mono font-black text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">
                              {item.id}
                            </span>
                          </td>
                          <td className="py-3.5 px-5">
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${
                              item.transaction_type === 'STOCK_IN'
                                ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                                : 'bg-rose-50 text-rose-600 border border-rose-100'
                            }`}>
                              {item.transaction_type === 'STOCK_IN' ? '📥 Stock IN' : '📤 Stock OUT'}
                            </span>
                          </td>
                          <td className="py-3.5 px-5 font-black text-slate-800 text-xs uppercase tracking-tight">
                            {item.product_name}
                          </td>
                          <td className="py-3.5 px-5 text-xs text-slate-600 font-medium">
                            {item.machine_name || '—'}
                          </td>
                          <td className="py-3.5 px-5 text-xs text-slate-600 font-medium">
                            {item.company_name || '—'}
                          </td>
                          <td className="py-3.5 px-5 text-xs text-slate-600 font-mono font-semibold">
                            {item.bill_no || '—'}
                          </td>
                          <td className="py-3.5 px-5 text-right font-black text-xs">
                            <span className={item.transaction_type === 'STOCK_IN' ? 'text-emerald-600' : 'text-rose-600'}>
                              {item.transaction_type === 'STOCK_IN' ? '+' : '-'}{item.quantity.toFixed(2)} {item.unit}
                            </span>
                          </td>
                          <td className="py-3.5 px-5 text-right text-xs font-bold text-slate-700">
                            {item.rate_per_unit > 0 ? `₹${item.rate_per_unit.toFixed(2)}` : '—'}
                          </td>
                          <td className="py-3.5 px-5 text-right text-xs font-black">
                            <span className={item.transaction_type === 'STOCK_IN' ? 'text-emerald-700' : 'text-rose-700'}>
                              {formatCurrency(item.total_rate || 0)}
                            </span>
                          </td>
                          <td className="py-3.5 px-5 text-xs text-slate-500 max-w-[150px] truncate" title={item.notes || ''}>
                            {item.notes || '—'}
                          </td>
                          <td className="py-3.5 px-5 text-center">
                            {isToday ? (
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleOpenEdit(item)}
                                  className="px-2 py-1 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded text-xs font-bold border border-slate-200 cursor-pointer"
                                  title="Edit Today's Record"
                                >
                                  ✏️
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteTransaction(item.id, item.transaction_date)}
                                  className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-600 rounded text-xs font-bold border border-red-100 cursor-pointer"
                                  title="Delete Today's Record"
                                >
                                  🗑️
                                </button>
                              </div>
                            ) : (
                              <span
                                className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-400 border border-slate-200 select-none cursor-not-allowed"
                                title="Past records cannot be edited or deleted"
                              >
                                🔒 Locked
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* PAGINATION */}
            <div className="flex items-center justify-between p-4 bg-slate-50 border-t border-slate-100">
              <div className="text-xs text-slate-500 font-medium">
                Total <span className="font-bold text-slate-800">{historyTotal}</span> transactions
              </div>
              <div className="flex items-center gap-2">
                <button
                  disabled={historyPage <= 1}
                  onClick={() => setHistoryPage(p => Math.max(1, p - 1))}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                >
                  ◀ Prev
                </button>
                <span className="text-xs font-black text-slate-700">
                  Page {historyPage} of {historyTotalPages}
                </span>
                <button
                  disabled={historyPage >= historyTotalPages}
                  onClick={() => setHistoryPage(p => Math.min(historyTotalPages, p + 1))}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                >
                  Next ▶
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* EDIT MODAL (FOR TODAY'S RECORDS ONLY) */}
      {isEditModalOpen && editingItem && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm pointer-events-auto p-4">
          <div className="bg-white rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.2)] border border-slate-200 w-full max-w-[580px] max-h-[90vh] overflow-y-auto flex flex-col overflow-hidden animate-fade-in">
            <div className="bg-primary p-6 text-white shrink-0 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-black uppercase tracking-tight">
                  Edit {editingItem.transaction_type === 'STOCK_IN' ? 'Stock IN' : 'Stock OUT'} Record
                </h3>
                <p className="text-xs text-blue-100 font-mono mt-0.5">
                  ID: {editingItem.id} • Date: {formatDateDisplay(editingItem.transaction_date)} (Today's Shift)
                </p>
              </div>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="text-white hover:text-red-200 text-lg font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateTransaction} className="p-6 space-y-4">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-xs font-medium">
                ⚡ <strong>Today Only Edit:</strong> This entry can be edited during today's shift ({formatDateDisplay(editingItem.transaction_date)}). Once tomorrow arrives, the entry is locked permanently.
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  Product / Spare Part Name *
                </label>
                <input
                  type="text"
                  value={editFormData.productName}
                  onChange={(e) => setEditFormData({ ...editFormData, productName: e.target.value })}
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-slate-800 font-bold text-sm outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                    Machine Name
                  </label>
                  <input
                    type="text"
                    value={editFormData.machineName}
                    onChange={(e) => setEditFormData({ ...editFormData, machineName: e.target.value })}
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-medium outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                    Company / Vendor
                  </label>
                  <input
                    type="text"
                    value={editFormData.companyName}
                    onChange={(e) => setEditFormData({ ...editFormData, companyName: e.target.value })}
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-medium outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                    Quantity *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={editFormData.quantity}
                    onChange={(e) => handleEditQtyOrRateChange('quantity', e.target.value)}
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-slate-800 font-bold text-sm outline-none"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                    Unit
                  </label>
                  <select
                    value={editFormData.unit}
                    onChange={(e) => setEditFormData({ ...editFormData, unit: e.target.value })}
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-slate-700 font-bold text-sm outline-none"
                  >
                    <option value="PCS">PCS</option>
                    <option value="BOX">BOX</option>
                    <option value="KG">KG</option>
                    <option value="SETS">SETS</option>
                    <option value="MTR">MTR</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                    Rate Per Unit (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={editFormData.ratePerUnit}
                    onChange={(e) => handleEditQtyOrRateChange('ratePerUnit', e.target.value)}
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-slate-800 font-bold text-sm outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                    Total Value (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={editFormData.totalRate}
                    onChange={(e) => setEditFormData({ ...editFormData, totalRate: e.target.value })}
                    className="w-full h-11 px-3.5 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 font-bold text-sm outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                    Date *
                  </label>
                  <input
                    type="date"
                    value={editFormData.date}
                    onChange={(e) => setEditFormData({ ...editFormData, date: e.target.value })}
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-medium outline-none"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                    Bill No
                  </label>
                  <input
                    type="text"
                    value={editFormData.billNo}
                    onChange={(e) => setEditFormData({ ...editFormData, billNo: e.target.value })}
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-medium outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  Notes
                </label>
                <input
                  type="text"
                  value={editFormData.notes}
                  onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-medium outline-none"
                />
              </div>

              {editError && (
                <div className="p-3 bg-red-50 text-red-600 rounded-xl text-xs font-bold border border-red-100">
                  ⚠️ {editError}
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isUpdating}
                  className="btn-premium bg-blue-600 hover:bg-blue-700 text-white flex-1 h-11 uppercase font-bold text-xs tracking-wider shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {isUpdating ? 'Updating...' : '💾 Update Record'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="btn-premium bg-slate-100 text-slate-600 hover:bg-slate-200 px-5 h-11 uppercase font-bold text-xs tracking-wider cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ToolsInventory;

