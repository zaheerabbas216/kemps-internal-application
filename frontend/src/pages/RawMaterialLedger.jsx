import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';

const RawMaterialLedger = () => {
  const navigate = useNavigate();

  // Date state (default to today in IST)
  const getTodayISTStr = () => {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const istDate = new Date(now.getTime() + (330 + offset) * 60000);
    return istDate.toISOString().split('T')[0];
  };

  const [ledgerDate, setLedgerDate] = useState(getTodayISTStr());
  const [ledgerData, setLedgerData] = useState({ items: [], summary: {} });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState('');

  // Lock status
  const [isClosed, setIsClosed] = useState(false);
  const [closedBy, setClosedBy] = useState(null);
  const [closedAt, setClosedAt] = useState(null);

  // Set Opening states
  const [isEditingOpening, setIsEditingOpening] = useState(false);
  const [openingStocks, setOpeningStocks] = useState({});
  const [savingOpening, setSavingOpening] = useState(false);
  const [openingError, setOpeningError] = useState('');

  // Drill Down Modal states
  const [isDrillOpen, setIsDrillOpen] = useState(false);
  const [drillData, setDrillData] = useState({
    productName: '',
    categoryName: '',
    unit: '',
    type: '',
    transactions: []
  });
  const [loadingDrill, setLoadingDrill] = useState(false);

  useEffect(() => {
    fetchLedger();
  }, [ledgerDate]);

  const fetchLedger = async () => {
    if (!ledgerDate) {
      setLedgerData({ items: [], summary: {} });
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const res = await api.get('/raw-material-ledger/day', {
        params: { date: ledgerDate }
      });
      if (res.data.ok) {
        setLedgerData(res.data);
        setIsClosed(res.data.isClosed);
        setClosedBy(res.data.closedBy);
        setClosedAt(res.data.closedAt);
        
        // Update last refreshed time
        const now = new Date();
        const timeStr = now.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true
        });
        setLastRefreshed(timeStr);
      }
    } catch (err) {
      console.error('Failed to fetch ledger:', err);
      alert(err.response?.data?.error || 'Failed to load ledger data.');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchLedger();
    setRefreshing(false);
  };

  // Group items by category for rendering
  const getGroupedItems = () => {
    const groups = {};
    const items = ledgerData.items || [];
    items.forEach(item => {
      const cat = item.category_name.toUpperCase();
      if (!groups[cat]) {
        groups[cat] = [];
      }
      groups[cat].push(item);
    });
    return groups;
  };

  // Close Day operation
  const handleCloseDay = async () => {
    if (!ledgerDate) {
      alert('Please select a valid date first.');
      return;
    }
    if (window.confirm(`Are you sure you want to CLOSE and LOCK the ledger for ${formatDateDDMMYYYY(ledgerDate)}?\nOnce locked, Opening, IN, OUT, and Closing quantities cannot be modified.`)) {
      try {
        setLoading(true);
        const res = await api.post('/raw-material-ledger/close', { date: ledgerDate });
        if (res.data.ok) {
          alert(res.data.message);
          fetchLedger();
        }
      } catch (err) {
        alert(err.response?.data?.error || 'Failed to close day.');
        setLoading(false);
      }
    }
  };

  // Set Opening handlers
  const handleStartEditOpening = () => {
    setOpeningError('');
    const initialStocks = {};
    (ledgerData.items || []).forEach(item => {
      initialStocks[`${item.raw_material_id}-${item.unit}`] = item.opening_stock ?? 0;
    });
    setOpeningStocks(initialStocks);
    setIsEditingOpening(true);
  };

  const handleStockChange = (item, value) => {
    const key = `${item.raw_material_id}-${item.unit}`;
    setOpeningStocks(prev => {
      const next = { ...prev, [key]: value };
      
      // Synchronize preforms if category is Preforms
      if (item.category_name.toLowerCase() === 'preforms') {
        const weight = parseFloat(item.sub_product_name) || 0;
        if (weight > 0) {
          const numValue = parseFloat(value) || 0;
          if (item.unit === 'BAGS') {
            const pcsKey = `${item.raw_material_id}-PCS`;
            const calculatedPcs = (numValue * 25000) / weight;
            next[pcsKey] = parseFloat(calculatedPcs.toFixed(2)).toString();
          } else if (item.unit === 'PCS') {
            const bagsKey = `${item.raw_material_id}-BAGS`;
            const calculatedBags = (numValue * weight) / 25000;
            next[bagsKey] = parseFloat(calculatedBags.toFixed(2)).toString();
          }
        }
      }
      
      return next;
    });
  };

  const handleSaveOpening = async (e) => {
    e.preventDefault();
    setOpeningError('');
    if (!ledgerDate) {
      setOpeningError('Please select a valid date first.');
      return;
    }

    setSavingOpening(true);
    try {
      const items = (ledgerData.items || []).map(item => {
        const key = `${item.raw_material_id}-${item.unit}`;
        const val = openingStocks[key];
        return {
          rawMaterialId: item.raw_material_id,
          unit: item.unit,
          quantity: val === '' || val === undefined ? 0 : parseFloat(val)
        };
      });

      const res = await api.post('/raw-material-ledger/set-opening', {
        date: ledgerDate,
        items
      });

      if (res.data.ok) {
        setIsEditingOpening(false);
        fetchLedger();
      }
    } catch (err) {
      setOpeningError(err.response?.data?.error || 'Failed to save opening stock.');
    } finally {
      setSavingOpening(false);
    }
  };

  const getCategoryEmoji = (categoryName) => {
    const name = String(categoryName || '').toLowerCase();
    if (name.includes('preform')) return '🫙';
    if (name.includes('label')) return '🏷️';
    if (name.includes('box')) return '📦';
    if (name.includes('shrink roll')) return '🌀';
    if (name.includes('handle')) return '💛';
    if (name.includes('cap')) return '🧢';
    if (name.includes('bottle')) return '🍼';
    return '📁';
  };

  // Open drilldown details modal
  const handleDrilldown = async (item, type) => {
    setLoadingDrill(true);
    setIsDrillOpen(true);
    setDrillData({
      productName: item.sub_product_name,
      categoryName: item.category_name,
      unit: item.unit,
      type,
      transactions: []
    });

    try {
      const res = await api.get('/raw-material-ledger/drilldown', {
        params: {
          date: ledgerDate,
          rawMaterialId: item.raw_material_id,
          unit: item.unit,
          type
        }
      });
      if (res.data.ok) {
        setDrillData(prev => ({
          ...prev,
          transactions: res.data.transactions || []
        }));
      }
    } catch (err) {
      console.error('Failed to load drilldown audit:', err);
    } finally {
      setLoadingDrill(false);
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

  // Dynamic lists of unique materials for the "Set Opening" dropdown
  const getUniqueMaterialsForDropdown = () => {
    const list = [];
    const ids = new Set();
    (ledgerData.items || []).forEach(item => {
      if (!ids.has(item.raw_material_id)) {
        ids.add(item.raw_material_id);
        list.push({
          id: item.raw_material_id,
          name: item.sub_product_name,
          category: item.category_name,
          defaultUnit: item.unit
        });
      }
    });
    return list;
  };

  const uniqueMaterials = getUniqueMaterialsForDropdown();

  // Helper: calculate totals for a specific group
  const calculateGroupTotals = (groupItems) => {
    let opening = 0;
    let stockIn = 0;
    let stockOut = 0;
    let closing = 0;
    groupItems.forEach(item => {
      opening += item.opening_stock || 0;
      stockIn += item.stock_in || 0;
      stockOut += item.stock_out || 0;
      closing += item.closing_stock || 0;
    });
    return { opening, stockIn, stockOut, closing };
  };

  // Helper: calculate grand totals for table
  const calculateGrandTotals = () => {
    let opening = 0;
    let stockIn = 0;
    let stockOut = 0;
    let closing = 0;
    (ledgerData.items || []).forEach(item => {
      opening += item.opening_stock || 0;
      stockIn += item.stock_in || 0;
      stockOut += item.stock_out || 0;
      closing += item.closing_stock || 0;
    });
    return { opening, stockIn, stockOut, closing };
  };

  const grandTotals = calculateGrandTotals();
  const groupedItems = getGroupedItems();

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto pb-12">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/dashboard')}
            className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all shadow-sm"
          >
            ← Back
          </button>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase">
            RAW MATERIAL LEDGER
          </h1>
        </div>
        <div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
          >
            {refreshing ? (
              <span className="loading loading-spinner loading-xs"></span>
            ) : (
              '🔄'
            )}{' '}
            Refresh
          </button>
        </div>
      </div>

      {/* FORMULA BAR */}
      {!isEditingOpening && (
        <div className="bg-[#0b1329] text-white py-3.5 px-6 rounded-2xl font-heading font-bold flex justify-center text-center items-center gap-2 text-sm shadow-md animate-fade-in">
          <span>Closing Stock</span>
          <span className="text-blue-400">=</span>
          <span>Opening Stock</span>
          <span className="text-emerald-400">+</span>
          <span className="text-emerald-400">Stock IN</span>
          <span className="text-rose-400">-</span>
          <span className="text-rose-400">Stock OUT</span>
        </div>
      )}

      {/* DATE & ACTIONS CONTROLS CARD */}
      <div className="card-premium space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          {/* Ledger Date Picker */}
          <div className="md:col-span-1 space-y-1.5">
            <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
              Ledger Date
            </label>
            <input
              type="date"
              value={ledgerDate}
              onChange={(e) => setLedgerDate(e.target.value)}
              className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-750 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-semibold"
            />
          </div>

          {/* Action Buttons Row */}
          <div className="md:col-span-2 flex flex-wrap gap-3">
            <button
              onClick={handleRefresh}
              className="btn-premium bg-blue-600 hover:bg-blue-700 text-white font-bold h-11 px-5 rounded-xl transition-all shadow-md flex items-center gap-1.5 text-xs"
            >
              🔄 Refresh
            </button>
            <button
              onClick={handleStartEditOpening}
              disabled={isClosed}
              className={`btn-premium font-bold h-11 px-5 rounded-xl transition-all text-xs flex items-center gap-1.5 shadow-md ${
                isClosed
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  : 'bg-amber-600 hover:bg-amber-700 text-white'
              }`}
            >
              ✏️ Set Opening
            </button>
            <button
              onClick={handleCloseDay}
              disabled={isClosed}
              className={`btn-premium font-bold h-11 px-5 rounded-xl transition-all text-xs flex items-center gap-1.5 shadow-md ${
                isClosed
                  ? 'bg-emerald-100 text-emerald-600 cursor-not-allowed font-black'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
              }`}
            >
              {isClosed ? '🔒 DAY CLOSED' : '🔒 Close Day'}
            </button>
          </div>
        </div>

        {/* Closed Date Audit Detail */}
        {isClosed && (
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3.5 flex items-center gap-2 text-xs font-semibold text-emerald-800">
            <span>🔒</span>
            <span>
              This day's ledger has been locked and snapshot by <b>{closedBy}</b> on <b>{closedAt}</b>. Quantities cannot be modified.
            </span>
          </div>
        )}
      </div>

      {isEditingOpening ? (
        /* =======================================================
           INLINE BULK SET OPENING STOCK EDITOR
           ======================================================= */
        <div className="card-premium border-2 border-amber-200 bg-[#fffdf6] p-6 space-y-6 shadow-md rounded-3xl animate-fade-in">
          <div className="border-b border-amber-100 pb-4">
            <h3 className="text-lg font-black text-amber-800 uppercase tracking-tight flex items-center gap-1.5">
              <span>✏️</span> SET OPENING STOCK — {formatDateDDMMYYYY(ledgerDate)}
            </h3>
            <p className="text-amber-700/80 text-xs font-semibold mt-1">
              Enter opening stock for each item. Leave 0 if not holding that item.
            </p>
          </div>

          <div className="max-h-[480px] overflow-y-auto pr-2 space-y-6">
            {Object.keys(groupedItems).map(catName => {
              const items = groupedItems[catName];
              return (
                <div key={catName} className="space-y-3">
                  <h4 className="font-heading font-black text-[12px] tracking-wider uppercase text-slate-800 flex items-center gap-1.5 pt-2 border-t border-slate-100/50 first:border-0 first:pt-0">
                    <span>{getCategoryEmoji(catName)}</span> {catName}
                  </h4>
                  <div className="space-y-1.5">
                    {items.map(item => (
                      <div key={`${item.raw_material_id}-${item.unit}`} className="grid grid-cols-[1fr_180px_130px] items-center gap-4 py-2 border-b border-amber-100/10 hover:bg-amber-50/10 px-2 rounded-lg transition-colors">
                        <div className="text-slate-700 font-bold text-sm">
                          {item.sub_product_name} ({item.unit})
                        </div>
                        <div className="flex justify-center">
                          <span className="bg-blue-50/70 text-slate-500 rounded-lg px-2.5 py-1 text-[11px] font-bold border border-slate-200/40">
                            {item.category_name}
                          </span>
                        </div>
                        <div>
                          <input
                            type="number"
                            step="any"
                            value={openingStocks[`${item.raw_material_id}-${item.unit}`] ?? '0'}
                            onChange={(e) => handleStockChange(item, e.target.value)}
                            className="w-full h-10 border border-amber-300 bg-white text-center font-black rounded-xl text-slate-700 focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 transition-all outline-none text-sm"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {openingError && (
            <div className="bg-red-50 text-red-650 p-3.5 rounded-xl text-xs font-semibold border border-red-100">
              ⚠️ {openingError}
            </div>
          )}

          <div className="flex gap-4 pt-4 border-t border-slate-100 mt-6">
            <button
              onClick={handleSaveOpening}
              disabled={savingOpening}
              className="h-12 px-6 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm shadow-md shadow-amber-100 flex items-center justify-center gap-2 transition-all flex-[2] active:scale-95 duration-150"
            >
              <span>💾</span> {savingOpening ? 'Saving...' : 'Save Opening'}
            </button>
            <button
              onClick={() => setIsEditingOpening(false)}
              className="h-12 px-6 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm transition-all flex-1 active:scale-95 duration-150"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        /* =======================================================
           NORMAL LEDGER VIEW (CARDS & TABLE)
           ======================================================= */
        <>
          {/* DASHBOARD SUMMARY CARDS */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {/* Total Categories */}
            <div className="card-premium flex items-center justify-between p-5">
              <div>
                <p className="text-[10px] font-black text-slate-450 uppercase tracking-widest">
                  Total Categories
                </p>
                <h3 className="text-lg font-extrabold text-slate-800 mt-1">
                  {ledgerData.summary?.totalCategories || 0}
                </h3>
              </div>
              <div className="text-xl">🗂️</div>
            </div>

            {/* Total Stock Value */}
            <div className="card-premium flex items-center justify-between p-5">
              <div>
                <p className="text-[10px] font-black text-slate-450 uppercase tracking-widest">
                  Opening Value
                </p>
                <h3 className="text-lg font-extrabold text-slate-800 mt-1">
                  ₹{(ledgerData.summary?.totalRawMaterialValue || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </h3>
              </div>
              <div className="text-xl">💰</div>
            </div>

            {/* Total IN */}
            <div className="card-premium flex items-center justify-between p-5">
              <div>
                <p className="text-[10px] font-black text-slate-450 uppercase tracking-widest">
                  Total Stock IN
                </p>
                <h3 className="text-lg font-extrabold text-emerald-600 mt-1">
                  +{(ledgerData.summary?.totalStockInToday || 0).toLocaleString('en-IN')}
                </h3>
              </div>
              <div className="text-xl text-emerald-500">📈</div>
            </div>

            {/* Total OUT */}
            <div className="card-premium flex items-center justify-between p-5">
              <div>
                <p className="text-[10px] font-black text-slate-450 uppercase tracking-widest">
                  Total Stock OUT
                </p>
                <h3 className="text-lg font-extrabold text-rose-500 mt-1">
                  -{(ledgerData.summary?.totalStockOutToday || 0).toLocaleString('en-IN')}
                </h3>
              </div>
              <div className="text-xl text-rose-500">📉</div>
            </div>

            {/* Closing Value */}
            <div className="card-premium flex items-center justify-between p-5">
              <div>
                <p className="text-[10px] font-black text-slate-450 uppercase tracking-widest">
                  Closing Value
                </p>
                <h3 className="text-lg font-extrabold text-[#0066cc] mt-1">
                  ₹{(ledgerData.summary?.closingStockValue || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </h3>
              </div>
              <div className="text-xl">🏦</div>
            </div>
          </div>

          {/* Grouped Lists */}
          {loading ? (
            <div className="card-premium py-20 text-center text-slate-400">
              <span className="loading loading-spinner text-primary block mx-auto mb-2"></span>
              Calculating ledger stocks for {formatDateDDMMYYYY(ledgerDate)}...
            </div>
          ) : Object.keys(groupedItems).length === 0 ? (
            <div className="card-premium py-20 text-center text-slate-400 italic">
              No raw materials found. Add raw materials to the Product Master first.
            </div>
          ) : (
            <div className="space-y-6">
              {Object.keys(groupedItems).map(categoryName => {
                const groupItems = groupedItems[categoryName];
                const groupTotals = calculateGroupTotals(groupItems);

                return (
                  <div key={categoryName} className="border border-slate-200/80 rounded-2xl bg-white overflow-hidden shadow-sm">
                    {/* Category Header */}
                    <div className="bg-[#1e293b] text-white px-5 py-3.5 flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className="font-heading font-black text-[13px] tracking-widest uppercase">
                          📁 {categoryName}
                        </span>
                        <span className="bg-slate-700 text-slate-200 text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase">
                          {groupItems.length} {groupItems.length === 1 ? 'Item' : 'Items'}
                        </span>
                      </div>
                    </div>

                    {/* Table list */}
                    <div className="overflow-x-auto">
                      <table className="table w-full">
                        <thead>
                          <tr className="bg-slate-50/50 text-slate-500 text-[11px] font-extrabold uppercase tracking-wider border-b border-slate-100">
                            <th className="py-3 px-5 text-left w-2/5">Sub Product</th>
                            <th className="py-3 px-5 text-center w-1/12">Unit</th>
                            <th className="py-3 px-5 text-right">Opening</th>
                            <th className="py-3 px-5 text-right text-emerald-600">+IN</th>
                            <th className="py-3 px-5 text-right text-rose-500">-OUT</th>
                            <th className="py-3 px-5 text-right text-blue-600 bg-blue-50/20 w-1/6 border-l border-slate-100">=Closing</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50 font-medium">
                          {groupItems.map((item, idx) => (
                            <tr key={idx} className="hover:bg-slate-50/40 transition-colors">
                              <td className="py-3 px-5 text-[13px] text-slate-800 font-bold">
                                {item.sub_product_name}
                              </td>
                              <td className="py-3 px-5 text-center text-[11px] font-extrabold text-slate-400 uppercase">
                                {item.unit}
                              </td>
                              <td 
                                onClick={() => handleDrilldown(item, 'OPENING')}
                                className="py-3 px-5 text-right text-[13px] font-semibold text-slate-600 hover:text-blue-600 hover:underline cursor-pointer"
                              >
                                {item.opening_stock.toLocaleString('en-IN')}
                              </td>
                              <td 
                                onClick={() => handleDrilldown(item, 'IN')}
                                className="py-3 px-5 text-right text-[13px] font-semibold hover:text-blue-600 hover:underline cursor-pointer"
                              >
                                {item.stock_in === 0 ? (
                                  <span className="text-emerald-500 font-bold">—</span>
                                ) : (
                                  <span className="text-emerald-600">+{item.stock_in.toLocaleString('en-IN')}</span>
                                )}
                              </td>
                              <td 
                                onClick={() => handleDrilldown(item, 'OUT')}
                                className="py-3 px-5 text-right text-[13px] font-semibold hover:text-blue-600 hover:underline cursor-pointer"
                              >
                                {item.stock_out === 0 ? (
                                  <span className="text-rose-500 font-bold">—</span>
                                ) : (
                                  <span className="text-rose-500">-{item.stock_out.toLocaleString('en-IN')}</span>
                                )}
                              </td>
                              <td 
                                onClick={() => handleDrilldown(item, 'CLOSING')}
                                className="py-3 px-5 text-right text-[13px] font-extrabold text-slate-800 bg-blue-50/20 border-l border-slate-100 hover:text-blue-600 hover:underline cursor-pointer"
                              >
                                {item.closing_stock.toLocaleString('en-IN')}
                              </td>
                            </tr>
                          ))}
                        </tbody>

                        {/* Group Totals Row */}
                        <tfoot>
                          <tr className="bg-[#f8fafc] border-t border-slate-200/80 text-slate-700 font-extrabold text-xs">
                            <td className="py-3.5 px-5">Category Total</td>
                            <td className="py-3.5 px-5"></td>
                            <td className="py-3.5 px-5 text-right font-black">
                              {groupTotals.opening.toLocaleString('en-IN')}
                            </td>
                            <td className="py-3.5 px-5 text-right text-emerald-700 font-black">
                              {groupTotals.stockIn === 0 ? '—' : `+${groupTotals.stockIn.toLocaleString('en-IN')}`}
                            </td>
                            <td className="py-3.5 px-5 text-right text-rose-700 font-black">
                              {groupTotals.stockOut === 0 ? '—' : `-${groupTotals.stockOut.toLocaleString('en-IN')}`}
                            </td>
                            <td className="py-3.5 px-5 text-right text-slate-800 bg-blue-55/20 border-l border-slate-200/80 font-black">
                              {groupTotals.closing.toLocaleString('en-IN')}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* GRAND TOTAL ROW BANNER */}
          {!loading && ledgerData.items?.length > 0 && (
            <div className="bg-[#0b1329] text-white py-4 px-6 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg animate-fade-in">
              <div className="font-heading font-black text-sm tracking-wider uppercase">
                GRAND TOTAL
              </div>
              <div className="flex flex-wrap gap-8 text-right justify-end text-xs md:text-sm">
                <div>
                  <p className="text-[9px] font-black text-slate-440 uppercase tracking-widest">Opening</p>
                  <h4 className="font-black mt-0.5">{grandTotals.opening.toLocaleString('en-IN')}</h4>
                </div>
                <div>
                  <p className="text-[9px] font-black text-slate-440 uppercase tracking-widest">Stock IN</p>
                  <h4 className="font-black text-emerald-400 mt-0.5">+{grandTotals.stockIn.toLocaleString('en-IN')}</h4>
                </div>
                <div>
                  <p className="text-[9px] font-black text-slate-440 uppercase tracking-widest">Stock OUT</p>
                  <h4 className="font-black text-rose-450 mt-0.5">-{grandTotals.stockOut.toLocaleString('en-IN')}</h4>
                </div>
                <div>
                  <p className="text-[9px] font-black text-slate-440 uppercase tracking-widest">Closing</p>
                  <h4 className="font-black text-emerald-400 mt-0.5">{grandTotals.closing.toLocaleString('en-IN')}</h4>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* DRILL DOWN AUDIT TRAIL MODAL */}
      {isDrillOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm pointer-events-auto">
          <div className="bg-white rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.2)] border border-slate-200 w-[750px] h-[520px] p-8 flex flex-col overflow-hidden animate-fade-in pointer-events-auto relative animate-fade-in">
            <button
              onClick={() => setIsDrillOpen(false)}
              className="absolute right-6 top-6 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center font-bold text-sm text-slate-500 transition-colors"
            >
              ✕
            </button>
            <h3 className="text-xl font-heading font-black text-slate-800 mb-1 uppercase tracking-tight">
              🔍 Stock Movement Audit Trail
            </h3>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-6">
              {drillData.categoryName} — {drillData.productName} ({drillData.unit}) | Type: {drillData.type} on {formatDateDDMMYYYY(ledgerDate)}
            </p>

            <div className="flex-1 overflow-y-auto border border-slate-100 rounded-2xl">
              {loadingDrill ? (
                <div className="py-20 text-center text-slate-400">
                  <span className="loading loading-spinner text-primary block mx-auto mb-2"></span>
                  Loading contributing transactions...
                </div>
              ) : drillData.transactions.length === 0 ? (
                <div className="py-20 text-center text-slate-400 font-semibold italic">
                  No transactions recorded on this day.
                </div>
              ) : (
                <table className="table table-zebra table-compact w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-100 sticky top-0 z-10">
                    <tr className="text-slate-555 font-black uppercase tracking-wider text-[10px]">
                      <th className="py-3 px-4 text-left">Date</th>
                      <th className="py-3 px-4 text-left">Ref Number</th>
                      <th className="py-3 px-4 text-left">Type</th>
                      <th className="py-3 px-4 text-left">Module Source</th>
                      <th className="py-3 px-4 text-right">Quantity</th>
                      <th className="py-3 px-4 text-center">User</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drillData.transactions.map((tx, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/30 transition-colors">
                        <td className="py-3 px-4 font-semibold text-slate-550">
                          {formatDateDDMMYYYY(tx.date.toString().split('T')[0])}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-primary">
                          {tx.reference}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase ${
                            tx.type === 'Stock IN' || tx.type === 'Opening Baseline'
                              ? 'bg-emerald-50 text-emerald-600'
                              : 'bg-rose-50 text-rose-500'
                          }`}>
                            {tx.type}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-600 font-semibold">
                          {tx.source}
                        </td>
                        <td className="py-3 px-4 text-right font-black text-slate-800">
                          {tx.type === 'Stock OUT' ? '-' : ''}
                          {parseFloat(tx.quantity).toLocaleString('en-IN')} {drillData.unit}
                        </td>
                        <td className="py-3 px-4 text-center text-slate-500 font-semibold">
                          {tx.user}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Total Footer inside modal */}
            {!loadingDrill && drillData.transactions.length > 0 && (
              <div className="bg-[#f8fafc] border border-slate-100 rounded-2xl p-4 mt-6 flex justify-between items-center text-xs font-bold shrink-0">
                <span className="text-slate-550 uppercase tracking-wider">Summary Balance:</span>
                <span className="font-black text-sm text-slate-800">
                  {drillData.transactions.reduce((sum, tx) => {
                    const q = parseFloat(tx.quantity) || 0;
                    return tx.type === 'Stock OUT' ? sum - q : sum + q;
                  }, 0).toLocaleString('en-IN')} {drillData.unit}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default RawMaterialLedger;
