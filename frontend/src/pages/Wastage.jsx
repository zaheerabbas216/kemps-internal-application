import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';

const Wastage = () => {
  const navigate = useNavigate();

  // Helper: Get today's date in IST format (YYYY-MM-DD)
  const getTodayISTStr = () => {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const istDate = new Date(now.getTime() + (330 + offset) * 60000);
    const yyyy = istDate.getFullYear();
    const mm = String(istDate.getMonth() + 1).padStart(2, '0');
    const dd = String(istDate.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  // Helper: Add days to date string
  const addDays = (dateStr, days) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + days));
    return dt.toISOString().split('T')[0];
  };

  // Helper: Format date DD/MM/YYYY
  const formatDateDDMMYYYY = (dateStr) => {
    if (!dateStr) return '—';
    const parts = dateStr.split('T')[0].split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  // Filter States
  const [datePreset, setDatePreset] = useState('ALL'); // TODAY, YESTERDAY, THIS_WEEK, THIS_MONTH, ALL, CUSTOM
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedSource, setSelectedSource] = useState('ALL'); // ALL, PET_BOTTLE, PRODUCTION, CORRECTION
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Pagination State
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(15);

  // Data & Loading State
  const [wastageData, setWastageData] = useState({
    items: [],
    pagination: { total: 0, totalPages: 1 },
    summary: {
      totalWastageRecords: 0,
      totalWastageQty: 0,
      totalWastageValue: 0,
      sourceBreakdown: {
        PET_BOTTLE: { qty: 0, value: 0, count: 0 },
        PRODUCTION: { qty: 0, value: 0, count: 0 },
        CORRECTION: { qty: 0, value: 0, count: 0 }
      },
      categoryBreakdown: []
    }
  });
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState('');

  // Detail Modal State
  const [selectedItem, setSelectedItem] = useState(null);

  // Fetch Categories for dropdown
  useEffect(() => {
    const fetchCats = async () => {
      try {
        const res = await api.get('/raw-materials/categories');
        if (res.data.ok) {
          setCategories(res.data.categories || []);
        }
      } catch (err) {
        console.error('Failed to load categories:', err);
      }
    };
    fetchCats();
  }, []);

  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search query to prevent lag
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Main fetch function
  const fetchWastage = async () => {
    try {
      setLoading(true);
      const params = {
        page,
        limit
      };

      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      if (selectedSource !== 'ALL') params.source = selectedSource;
      if (selectedCategory !== 'ALL') params.categoryId = selectedCategory;
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();

      const res = await api.get('/wastage', { params });
      if (res.data.ok) {
        setWastageData(res.data);

        // Update last refreshed timestamp
        const now = new Date();
        setLastRefreshed(now.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true
        }));
      }
    } catch (err) {
      console.error('Failed to fetch wastage data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWastage();
  }, [startDate, endDate, selectedSource, selectedCategory, debouncedSearch, page, limit]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchWastage();
    setRefreshing(false);
  };

  // Date Presets Handler
  const handlePresetChange = (preset) => {
    setDatePreset(preset);
    setPage(1);
    const today = getTodayISTStr();

    if (preset === 'TODAY') {
      setStartDate(today);
      setEndDate(today);
    } else if (preset === 'YESTERDAY') {
      const yest = addDays(today, -1);
      setStartDate(yest);
      setEndDate(yest);
    } else if (preset === 'THIS_WEEK') {
      const now = new Date();
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday
      const monday = new Date(now.setDate(diff)).toISOString().split('T')[0];
      setStartDate(monday);
      setEndDate(today);
    } else if (preset === 'THIS_MONTH') {
      const [yyyy, mm] = today.split('-');
      setStartDate(`${yyyy}-${mm}-01`);
      setEndDate(today);
    } else if (preset === 'ALL') {
      setStartDate('');
      setEndDate('');
    }
  };

  const handleResetFilters = () => {
    setDatePreset('ALL');
    setStartDate('');
    setEndDate('');
    setSelectedSource('ALL');
    setSelectedCategory('ALL');
    setSearchQuery('');
    setPage(1);
  };

  // Print Summary Report
  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    const items = wastageData.items || [];
    const summary = wastageData.summary || {};

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Material Wastage Report</title>
          <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; padding: 25px; color: #1e293b; }
            .header { text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 15px; margin-bottom: 20px; }
            .header h1 { margin: 0; font-size: 22px; text-transform: uppercase; color: #0f172a; }
            .header p { margin: 4px 0 0 0; font-size: 12px; color: #64748b; }
            .summary-box { display: flex; gap: 15px; margin-bottom: 20px; }
            .summary-card { flex: 1; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; background: #f8fafc; }
            .summary-card span { font-size: 10px; text-transform: uppercase; font-weight: 700; color: #64748b; display: block; }
            .summary-card strong { font-size: 16px; color: #0f172a; display: block; margin-top: 4px; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 15px; }
            th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; }
            th { background: #f1f5f9; font-weight: 700; text-transform: uppercase; color: #475569; }
            .text-right { text-align: right; }
            .text-center { text-align: center; }
            .badge { padding: 3px 6px; border-radius: 4px; font-weight: 700; font-size: 9px; text-transform: uppercase; }
            .badge-pet { background: #e0f2fe; color: #0369a1; }
            .badge-prod { background: #ecfdf5; color: #047857; }
            .badge-corr { background: #fff1f2; color: #be123c; }
            .grand-row { font-weight: 800; background: #f8fafc; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Material Wastage & Loss Report</h1>
            <p>Generated on ${new Date().toLocaleString('en-IN')} &bull; Period: ${startDate ? formatDateDDMMYYYY(startDate) : 'Beginning'} to ${endDate ? formatDateDDMMYYYY(endDate) : 'Present'}</p>
          </div>

          <div class="summary-box">
            <div class="summary-card">
              <span>Total Wastage Records</span>
              <strong>${summary.totalWastageRecords || 0}</strong>
            </div>
            <div class="summary-card">
              <span>Total Quantity Lost</span>
              <strong>${(summary.totalWastageQty || 0).toLocaleString('en-IN')} Units</strong>
            </div>
            <div class="summary-card">
              <span>Total Monetary Loss</span>
              <strong style="color: #e11d48;">₹ ${(summary.totalWastageValue || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
            </div>
            <div class="summary-card">
              <span>PET Bottle Wastage</span>
              <strong>₹ ${(summary.sourceBreakdown?.PET_BOTTLE?.value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
            </div>
            <div class="summary-card">
              <span>Production Wastage</span>
              <strong>₹ ${(summary.sourceBreakdown?.PRODUCTION?.value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Ref ID</th>
                <th>Source Module</th>
                <th>Category</th>
                <th>Raw Material</th>
                <th>Batch Context</th>
                <th class="text-right">Wastage Qty</th>
                <th class="text-right">Rate (₹)</th>
                <th class="text-right">Monetary Loss (₹)</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(item => `
                <tr>
                  <td>${formatDateDDMMYYYY(item.record_date)}</td>
                  <td style="font-family: monospace; font-weight: 700;">${item.reference_id}</td>
                  <td><span class="badge ${item.source_type === 'PET_BOTTLE' ? 'badge-pet' : item.source_type === 'PRODUCTION' ? 'badge-prod' : 'badge-corr'}">${item.source_name}</span></td>
                  <td>${item.category_name}</td>
                  <td style="font-weight: 700;">${item.raw_material_name}</td>
                  <td>${item.target_product_name || '—'}</td>
                  <td class="text-right" style="font-weight: 700;">${parseFloat(item.wastage_qty).toLocaleString('en-IN')} ${item.wastage_unit}</td>
                  <td class="text-right">₹${parseFloat(item.per_pc_rate).toFixed(4)}</td>
                  <td class="text-right" style="font-weight: 800; color: #e11d48;">₹${parseFloat(item.wastage_value).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  <td>${item.remarks || '—'}</td>
                </tr>
              `).join('')}
            </tbody>
            <tfoot>
              <tr class="grand-row">
                <td colspan="6">TOTAL LOSS</td>
                <td class="text-right">${(summary.totalWastageQty || 0).toLocaleString('en-IN')}</td>
                <td></td>
                <td class="text-right" style="color: #e11d48;">₹ ${(summary.totalWastageValue || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>

          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
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

  const getSourceBadge = (sourceType) => {
    if (sourceType === 'PET_BOTTLE') {
      return (
        <span className="px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase bg-cyan-50 text-cyan-700 border border-cyan-200/60 flex items-center gap-1">
          <span>🍼</span> PET Bottle
        </span>
      );
    }
    if (sourceType === 'PRODUCTION') {
      return (
        <span className="px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200/60 flex items-center gap-1">
          <span>🏭</span> Production
        </span>
      );
    }
    return (
      <span className="px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase bg-rose-50 text-rose-700 border border-rose-200/60 flex items-center gap-1">
        <span>⚠️</span> Correction
      </span>
    );
  };

  const hasActiveFilters = datePreset !== 'ALL' || selectedSource !== 'ALL' || selectedCategory !== 'ALL' || Boolean(searchQuery.trim());
  const summary = wastageData.summary || {};

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto pb-16">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/dashboard')}
            className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all shadow-sm"
          >
            ← Back
          </button>
          <div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase flex items-center gap-2">
              <span>🗑️</span> WASTAGE &amp; LOSS DASHBOARD
            </h1>
            <p className="text-slate-500 text-xs font-semibold mt-0.5">
              Comprehensive material loss tracking across PET Bottle Production, Finished Goods Production &amp; Stock Corrections
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handlePrint}
            disabled={wastageData.items?.length === 0}
            className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50"
          >
            🖨️ Print Report
          </button>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
          >
            {refreshing ? <span className="loading loading-spinner loading-xs"></span> : '🔄'} Refresh
          </button>
        </div>
      </div>

      {/* SUMMARY KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Total Monetary Loss */}
        <div className="card-premium p-5 flex flex-col justify-between border-rose-200 bg-gradient-to-br from-white to-rose-50/30">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest">
                Total Monetary Loss
              </p>
              <h3 className="text-2xl font-black text-rose-600 mt-1">
                ₹{(summary.totalWastageValue || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </h3>
            </div>
            <span className="text-2xl">💸</span>
          </div>
          <div className="mt-3 text-[10px] font-bold text-slate-400">
            {summary.totalWastageRecords || 0} Recorded wastage incidents
          </div>
        </div>

        {/* Total Quantity Wasted */}
        <div className="card-premium p-5 flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-black text-slate-450 uppercase tracking-widest">
                Total Quantity Lost
              </p>
              <h3 className="text-2xl font-black text-slate-800 mt-1">
                {(summary.totalWastageQty || 0).toLocaleString('en-IN')} <span className="text-xs text-slate-400 font-bold">Units</span>
              </h3>
            </div>
            <span className="text-2xl">📉</span>
          </div>
          <div className="mt-3 text-[10px] font-bold text-slate-400">
            Pcs / Rolls / Boxes combined
          </div>
        </div>

        {/* PET Bottle Production Wastage */}
        <div className="card-premium p-5 flex flex-col justify-between hover:border-cyan-200 transition-all">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-black text-cyan-700 uppercase tracking-widest">
                🍼 PET Bottle Wastage
              </p>
              <h3 className="text-xl font-extrabold text-cyan-800 mt-1">
                ₹{(summary.sourceBreakdown?.PET_BOTTLE?.value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </h3>
            </div>
            <span className="text-lg">🍼</span>
          </div>
          <div className="mt-2 text-[10px] font-bold text-cyan-600">
            {(summary.sourceBreakdown?.PET_BOTTLE?.qty || 0).toLocaleString('en-IN')} pcs ({summary.sourceBreakdown?.PET_BOTTLE?.count || 0} batches)
          </div>
        </div>

        {/* Finished Goods Production Wastage */}
        <div className="card-premium p-5 flex flex-col justify-between hover:border-emerald-200 transition-all">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">
                🏭 Production Wastage
              </p>
              <h3 className="text-xl font-extrabold text-emerald-800 mt-1">
                ₹{(summary.sourceBreakdown?.PRODUCTION?.value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </h3>
            </div>
            <span className="text-lg">🏭</span>
          </div>
          <div className="mt-2 text-[10px] font-bold text-emerald-600">
            {(summary.sourceBreakdown?.PRODUCTION?.qty || 0).toLocaleString('en-IN')} units ({summary.sourceBreakdown?.PRODUCTION?.count || 0} batches)
          </div>
        </div>

        {/* Stock Correction Wastage */}
        <div className="card-premium p-5 flex flex-col justify-between hover:border-rose-200 transition-all">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-black text-rose-700 uppercase tracking-widest">
                ⚠️ Correction Shortages
              </p>
              <h3 className="text-xl font-extrabold text-rose-800 mt-1">
                ₹{(summary.sourceBreakdown?.CORRECTION?.value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </h3>
            </div>
            <span className="text-lg">⚠️</span>
          </div>
          <div className="mt-2 text-[10px] font-bold text-rose-600">
            {(summary.sourceBreakdown?.CORRECTION?.qty || 0).toLocaleString('en-IN')} units ({summary.sourceBreakdown?.CORRECTION?.count || 0} entries)
          </div>
        </div>
      </div>

      {/* CATEGORY LOSS BREAKDOWN PILLS */}
      {summary.categoryBreakdown?.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-2.5">
          <div className="text-[11px] font-black text-slate-500 uppercase tracking-wider flex items-center justify-between">
            <span>📊 Wastage Loss by Category</span>
            <span className="text-[10px] text-slate-400 font-semibold">{summary.categoryBreakdown.length} Categories Affected</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {summary.categoryBreakdown.map((cat, idx) => (
              <div
                key={idx}
                onClick={() => {
                  setSelectedCategory(cat.categoryName);
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  selectedCategory === cat.categoryName
                    ? 'bg-primary text-white border-primary shadow-xs'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200/80'
                }`}
              >
                <span>{getCategoryEmoji(cat.categoryName)}</span>
                <span>{cat.categoryName}:</span>
                <span className="font-mono text-rose-600 font-black">
                  ₹{cat.value.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
                <span className="text-[10px] text-slate-400 font-semibold">({cat.qty.toLocaleString('en-IN')} units)</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* FILTER & SEARCH CONTROL CARD */}
      <div className="card-premium p-5 space-y-4">
        {/* Row 1: Date Presets & Custom Date Range */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          {/* Preset Buttons */}
          <div className="flex flex-wrap gap-1.5">
            {[
              { label: 'All Time', value: 'ALL' },
              { label: 'Today', value: 'TODAY' },
              { label: 'Yesterday', value: 'YESTERDAY' },
              { label: 'This Week', value: 'THIS_WEEK' },
              { label: 'This Month', value: 'THIS_MONTH' }
            ].map(p => (
              <button
                key={p.value}
                type="button"
                onClick={() => handlePresetChange(p.value)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  datePreset === p.value
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Custom Date Inputs */}
          <div className="flex items-center gap-2 text-xs">
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1">
              <span className="text-slate-400 font-bold uppercase text-[10px]">From:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setDatePreset('CUSTOM');
                  setPage(1);
                }}
                className="bg-transparent border-none outline-none font-bold text-slate-700 text-xs cursor-pointer"
              />
            </div>
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1">
              <span className="text-slate-400 font-bold uppercase text-[10px]">To:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setDatePreset('CUSTOM');
                  setPage(1);
                }}
                className="bg-transparent border-none outline-none font-bold text-slate-700 text-xs cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Row 2: Source Filter Tabs, Category Dropdown & Search */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          {/* Source Tabs */}
          <div className="md:col-span-4 flex flex-wrap gap-1">
            {[
              { label: 'All Sources', value: 'ALL' },
              { label: '🍼 PET', value: 'PET_BOTTLE' },
              { label: '🏭 Prod', value: 'PRODUCTION' },
              { label: '⚠️ Corr', value: 'CORRECTION' }
            ].map(s => (
              <button
                key={s.value}
                onClick={() => {
                  setSelectedSource(s.value);
                  setPage(1);
                }}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all border ${
                  selectedSource === s.value
                    ? 'bg-primary text-white border-primary shadow-xs'
                    : 'bg-white hover:bg-slate-50 text-slate-600 border-slate-200'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Category Dropdown */}
          <div className="md:col-span-3">
            <select
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value);
                setPage(1);
              }}
              className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-bold outline-none cursor-pointer focus:border-primary shadow-xs"
            >
              <option value="ALL">All Categories</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>

          {/* Search Box */}
          <div className="md:col-span-5 relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
            <input
              type="text"
              placeholder="Search reference #, raw material, finished product, remarks..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="w-full h-10 pl-9 pr-8 rounded-xl border border-slate-200 bg-white text-slate-800 text-xs font-medium outline-none focus:border-primary shadow-xs"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setPage(1);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 font-bold text-xs"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Filter Reset Banner */}
        {hasActiveFilters && (
          <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
            <span className="text-slate-500 font-semibold flex items-center gap-1.5">
              <span>🎯</span> Active Filter: Showing {wastageData.pagination?.total || 0} matching record(s)
            </span>
            <button
              onClick={handleResetFilters}
              className="text-xs text-rose-600 hover:text-rose-700 font-bold px-2.5 py-1 rounded-lg hover:bg-rose-50 transition-all flex items-center gap-1 cursor-pointer"
            >
              <span>✕</span> Reset All Filters
            </button>
          </div>
        )}
      </div>

      {/* WASTAGE RECORDS TABLE */}
      <div className="card-premium overflow-hidden shadow-sm">
        {loading ? (
          <div className="py-24 text-center text-slate-400">
            <span className="loading loading-spinner text-primary block mx-auto mb-2"></span>
            Loading wastage data &amp; calculations...
          </div>
        ) : wastageData.items?.length === 0 ? (
          <div className="py-20 text-center text-slate-400 space-y-2">
            <div className="text-4xl">🎉</div>
            <p className="text-sm font-bold text-slate-600">No wastage records found.</p>
            <p className="text-xs text-slate-400">
              {hasActiveFilters
                ? 'Try adjusting your filters or date range.'
                : 'No wastage has been recorded in PET bottle production, finished goods, or stock corrections.'}
            </p>
            {hasActiveFilters && (
              <button
                onClick={handleResetFilters}
                className="mt-3 px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all"
              >
                Reset Filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table w-full text-xs">
              <thead>
                <tr className="bg-slate-50/80 text-slate-500 text-[11px] font-extrabold uppercase tracking-wider border-b border-slate-200/80">
                  <th className="py-3 px-4 text-left">Date</th>
                  <th className="py-3 px-4 text-left">Ref Number</th>
                  <th className="py-3 px-4 text-left">Source Module</th>
                  <th className="py-3 px-4 text-left">Category</th>
                  <th className="py-3 px-4 text-left">Raw Material</th>
                  <th className="py-3 px-4 text-left">Batch Context</th>
                  <th className="py-3 px-4 text-right">Wastage Qty</th>
                  <th className="py-3 px-4 text-right">Rate (₹)</th>
                  <th className="py-3 px-4 text-right text-rose-600 bg-rose-50/30">Total Loss (₹)</th>
                  <th className="py-3 px-4 text-left">Remarks / Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {wastageData.items.map((row, idx) => (
                  <tr
                    key={idx}
                    onClick={() => setSelectedItem(row)}
                    className="hover:bg-slate-50/60 transition-colors cursor-pointer"
                  >
                    {/* Date */}
                    <td className="py-3 px-4 font-semibold text-slate-600 whitespace-nowrap">
                      {formatDateDDMMYYYY(row.record_date)}
                    </td>

                    {/* Reference # */}
                    <td className="py-3 px-4 font-mono font-bold text-primary whitespace-nowrap">
                      {row.reference_id}
                    </td>

                    {/* Source Module */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      {getSourceBadge(row.source_type)}
                    </td>

                    {/* Category */}
                    <td className="py-3 px-4 font-bold text-slate-500 whitespace-nowrap">
                      <span>{getCategoryEmoji(row.category_name)}</span> {row.category_name}
                    </td>

                    {/* Raw Material */}
                    <td className="py-3 px-4 font-extrabold text-slate-800">
                      {row.raw_material_name}
                    </td>

                    {/* Batch Context (Target Product) */}
                    <td className="py-3 px-4 text-slate-600 font-semibold">
                      {row.target_product_name ? (
                        <span className="bg-slate-100 px-2 py-0.5 rounded text-[11px] font-bold text-slate-700">
                          {row.target_product_name}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>

                    {/* Wastage Qty */}
                    <td className="py-3 px-4 text-right font-black text-slate-800 whitespace-nowrap">
                      {parseFloat(row.wastage_qty).toLocaleString('en-IN')}{' '}
                      <span className="text-[10px] font-bold text-slate-400 uppercase">{row.wastage_unit}</span>
                    </td>

                    {/* Rate per pc */}
                    <td className="py-3 px-4 text-right font-mono font-bold text-amber-700 whitespace-nowrap">
                      ₹{parseFloat(row.per_pc_rate).toFixed(4)}
                    </td>

                    {/* Total Loss */}
                    <td className="py-3 px-4 text-right font-mono font-black text-rose-600 bg-rose-50/30 whitespace-nowrap">
                      ₹{parseFloat(row.wastage_value).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>

                    {/* Remarks */}
                    <td className="py-3 px-4 text-slate-500 max-w-[200px] truncate" title={row.remarks}>
                      {row.remarks || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* PAGINATION CONTROLS */}
        {!loading && wastageData.pagination?.totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border-t border-slate-100 text-xs">
            <div className="text-slate-500 font-semibold">
              Showing {(page - 1) * limit + 1} to {Math.min(page * limit, wastageData.pagination.total)} of {wastageData.pagination.total} records
            </div>

            <div className="flex items-center gap-1.5">
              <button
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 font-bold disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
              >
                ← Prev
              </button>

              {Array.from({ length: wastageData.pagination.totalPages }, (_, i) => i + 1).map(p => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`px-3 py-1.5 rounded-lg font-bold border transition-all ${
                    page === p
                      ? 'bg-primary text-white border-primary shadow-xs'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {p}
                </button>
              ))}

              <button
                disabled={page === wastageData.pagination.totalPages}
                onClick={() => setPage(p => p + 1)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 font-bold disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* DETAIL MODAL */}
      {selectedItem && (
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/50 backdrop-blur-xs pointer-events-auto p-4"
          onClick={() => setSelectedItem(null)}
        >
          <div 
            className="bg-white rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.25)] border border-slate-200 w-full max-w-lg p-6 flex flex-col overflow-hidden pointer-events-auto relative animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSelectedItem(null)}
              className="absolute right-6 top-6 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center font-bold text-sm text-slate-500 transition-colors"
            >
              ✕
            </button>

            <div className="pr-8 mb-4">
              <span className="text-[10px] font-black text-rose-500 uppercase tracking-widest block">
                Wastage Incident Details
              </span>
              <h3 className="text-xl font-black text-slate-800 mt-1 flex items-center gap-2">
                <span>{getCategoryEmoji(selectedItem.category_name)}</span> {selectedItem.raw_material_name}
              </h3>
            </div>

            <div className="space-y-3 text-xs bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <div className="flex justify-between border-b border-slate-200/60 pb-2">
                <span className="text-slate-450 font-bold uppercase">Date</span>
                <span className="font-extrabold text-slate-700">{formatDateDDMMYYYY(selectedItem.record_date)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-200/60 pb-2">
                <span className="text-slate-450 font-bold uppercase">Reference ID</span>
                <span className="font-mono font-extrabold text-primary">{selectedItem.reference_id}</span>
              </div>
              <div className="flex justify-between border-b border-slate-200/60 pb-2">
                <span className="text-slate-450 font-bold uppercase">Source Module</span>
                <span>{getSourceBadge(selectedItem.source_type)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-200/60 pb-2">
                <span className="text-slate-450 font-bold uppercase">Category</span>
                <span className="font-extrabold text-slate-700">{selectedItem.category_name}</span>
              </div>
              {selectedItem.target_product_name && (
                <div className="flex justify-between border-b border-slate-200/60 pb-2">
                  <span className="text-slate-450 font-bold uppercase">Target Product</span>
                  <span className="font-extrabold text-slate-700">{selectedItem.target_product_name}</span>
                </div>
              )}
              <div className="flex justify-between border-b border-slate-200/60 pb-2">
                <span className="text-slate-450 font-bold uppercase">Wastage Quantity</span>
                <span className="font-black text-slate-800 text-sm">
                  {parseFloat(selectedItem.wastage_qty).toLocaleString('en-IN')} {selectedItem.wastage_unit}
                </span>
              </div>
              <div className="flex justify-between border-b border-slate-200/60 pb-2">
                <span className="text-slate-450 font-bold uppercase">Rate per Unit</span>
                <span className="font-mono font-bold text-amber-700">₹{parseFloat(selectedItem.per_pc_rate).toFixed(4)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-200/60 pb-2">
                <span className="text-slate-450 font-bold uppercase">Rate Source</span>
                <span className="text-slate-600 font-semibold">{selectedItem.rate_source}</span>
              </div>
              <div className="flex justify-between border-b border-slate-200/60 pb-2 bg-rose-50/50 p-2 rounded-xl">
                <span className="text-rose-700 font-black uppercase">Total Loss (₹)</span>
                <span className="font-mono font-black text-rose-700 text-base">
                  ₹{parseFloat(selectedItem.wastage_value).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div>
                <span className="text-slate-450 font-bold uppercase block mb-1">Remarks / Reason</span>
                <p className="text-slate-700 bg-white p-2.5 rounded-xl border border-slate-200/80 font-medium">
                  {selectedItem.remarks || 'No remarks provided.'}
                </p>
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setSelectedItem(null)}
                className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Wastage;
