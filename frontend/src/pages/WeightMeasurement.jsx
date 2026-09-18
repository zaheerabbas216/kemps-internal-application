import React, { useState, useEffect, useMemo } from 'react';
import api from '../api/axios';

const WeightMeasurement = () => {
  // Filters & Pagination state
  const [dateFilterType, setDateFilterType] = useState('ALL'); // 'TODAY', 'YESTERDAY', 'WEEK', 'MONTH', 'CUSTOM', 'ALL'
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(15);

  // Data states
  const [records, setRecords] = useState([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [summary, setSummary] = useState({
    totalCount: 0,
    totalWeightIn: 0,
    totalWeightOut: 0,
    totalDifference: 0
  });
  const [kpiStats, setKpiStats] = useState(null);
  const [productSuggestions, setProductSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);

  // Form states (Add New)
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

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

  const initialFormData = {
    measurementDate: getTodayISTStr(),
    measurementTime: getCurrentISTTimeStr(),
    productName: '',
    weightIn: '',
    weightOut: '',
    reading: '',
    unit: 'kg',
    notes: ''
  };

  const [formData, setFormData] = useState(initialFormData);

  // Edit Modal states
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [editFormData, setEditFormData] = useState(initialFormData);
  const [isUpdating, setIsUpdating] = useState(false);
  const [editError, setEditError] = useState('');

  // Delete Confirmation state
  const [deletingId, setDeletingId] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Real-time live difference for Add Form
  const liveDifference = useMemo(() => {
    const wIn = parseFloat(formData.weightIn) || 0;
    const wOut = parseFloat(formData.weightOut) || 0;
    return wIn - wOut;
  }, [formData.weightIn, formData.weightOut]);

  // Real-time live per kg reading for Add Form (Reading / Difference)
  const livePerKgReading = useMemo(() => {
    const diff = liveDifference;
    const r = parseFloat(formData.reading);
    if (!isNaN(r) && Math.abs(diff) > 0.0001) {
      return r / diff;
    }
    return null;
  }, [liveDifference, formData.reading]);

  // Real-time live difference for Edit Form
  const liveEditDifference = useMemo(() => {
    const wIn = parseFloat(editFormData.weightIn) || 0;
    const wOut = parseFloat(editFormData.weightOut) || 0;
    return wIn - wOut;
  }, [editFormData.weightIn, editFormData.weightOut]);

  // Real-time live per kg reading for Edit Form (Reading / Difference)
  const liveEditPerKgReading = useMemo(() => {
    const diff = liveEditDifference;
    const r = parseFloat(editFormData.reading);
    if (!isNaN(r) && Math.abs(diff) > 0.0001) {
      return r / diff;
    }
    return null;
  }, [liveEditDifference, editFormData.reading]);

  // Handle Preset Dates
  const applyDatePreset = (preset) => {
    setDateFilterType(preset);
    setCurrentPage(1);
    const today = getTodayISTStr();

    if (preset === 'TODAY') {
      setStartDate(today);
      setEndDate(today);
    } else if (preset === 'YESTERDAY') {
      const now = new Date();
      now.setDate(now.getDate() - 1);
      const yDate = now.toISOString().split('T')[0];
      setStartDate(yDate);
      setEndDate(yDate);
    } else if (preset === 'WEEK') {
      const now = new Date();
      now.setDate(now.getDate() - 7);
      const wDate = now.toISOString().split('T')[0];
      setStartDate(wDate);
      setEndDate(today);
    } else if (preset === 'MONTH') {
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      setStartDate(firstDay);
      setEndDate(today);
    } else if (preset === 'ALL') {
      setStartDate('');
      setEndDate('');
    }
  };

  useEffect(() => {
    fetchProductSuggestions();
    fetchSummaryKPIs();
  }, []);

  useEffect(() => {
    fetchRecords();
  }, [startDate, endDate, searchQuery, currentPage, itemsPerPage]);

  const fetchProductSuggestions = async () => {
    try {
      const res = await api.get('/weight-measurement/product-suggestions');
      if (res.data.ok) {
        setProductSuggestions(res.data.products || []);
      }
    } catch (err) {
      console.error('Failed to load product suggestions:', err);
    }
  };

  const fetchSummaryKPIs = async () => {
    try {
      const res = await api.get('/weight-measurement/summary');
      if (res.data.ok) {
        setKpiStats(res.data);
      }
    } catch (err) {
      console.error('Failed to load summary KPIs:', err);
    }
  };

  const fetchRecords = async () => {
    try {
      setLoading(true);
      const params = {
        page: currentPage,
        limit: itemsPerPage,
        search: searchQuery
      };
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;

      const res = await api.get('/weight-measurement', { params });
      if (res.data.ok) {
        setRecords(res.data.records || []);
        setTotalRecords(res.data.total || 0);
        setTotalPages(res.data.totalPages || 1);
        setSummary(res.data.summary || {});
      }
    } catch (err) {
      console.error('Failed to fetch weight measurements:', err);
    } finally {
      setLoading(false);
    }
  };

  // Create Record
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSaveRecord = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    if (!formData.productName.trim()) {
      setFormError('Product Name is required.');
      return;
    }

    try {
      setIsSaving(true);
      const payload = {
        productName: formData.productName.trim(),
        measurementDate: formData.measurementDate || getTodayISTStr(),
        measurementTime: formData.measurementTime || getCurrentISTTimeStr(),
        weightIn: parseFloat(formData.weightIn) || 0,
        weightOut: parseFloat(formData.weightOut) || 0,
        reading: formData.reading.trim(),
        unit: formData.unit || 'kg',
        notes: formData.notes.trim()
      };

      const res = await api.post('/weight-measurement', payload);
      if (res.data.ok) {
        setFormSuccess('Weight measurement saved successfully!');
        setFormData({
          ...initialFormData,
          measurementDate: getTodayISTStr(),
          measurementTime: getCurrentISTTimeStr()
        });
        fetchRecords();
        fetchSummaryKPIs();
        fetchProductSuggestions();
        setTimeout(() => {
          setFormSuccess('');
          setIsFormOpen(false);
        }, 1200);
      }
    } catch (err) {
      console.error('Error saving measurement:', err);
      setFormError(err.response?.data?.error || 'Failed to save measurement.');
    } finally {
      setIsSaving(false);
    }
  };

  // Edit Record
  const handleOpenEdit = (rec) => {
    setEditingRecord(rec);
    setEditFormData({
      measurementDate: rec.measurement_date,
      measurementTime: rec.measurement_time ? rec.measurement_time.substring(0, 5) : getCurrentISTTimeStr(),
      productName: rec.product_name,
      weightIn: String(rec.weight_in),
      weightOut: String(rec.weight_out),
      reading: rec.reading_val || '',
      unit: rec.unit || 'kg',
      notes: rec.notes || ''
    });
    setEditError('');
    setIsEditModalOpen(true);
  };

  const handleUpdateRecord = async (e) => {
    e.preventDefault();
    setEditError('');

    if (!editFormData.productName.trim()) {
      setEditError('Product Name is required.');
      return;
    }

    try {
      setIsUpdating(true);
      const payload = {
        productName: editFormData.productName.trim(),
        measurementDate: editFormData.measurementDate,
        measurementTime: editFormData.measurementTime,
        weightIn: parseFloat(editFormData.weightIn) || 0,
        weightOut: parseFloat(editFormData.weightOut) || 0,
        reading: editFormData.reading.trim(),
        unit: editFormData.unit || 'kg',
        notes: editFormData.notes.trim()
      };

      const res = await api.put(`/weight-measurement/${editingRecord.id}`, payload);
      if (res.data.ok) {
        setIsEditModalOpen(false);
        setEditingRecord(null);
        fetchRecords();
        fetchSummaryKPIs();
      }
    } catch (err) {
      console.error('Error updating record:', err);
      setEditError(err.response?.data?.error || 'Failed to update measurement.');
    } finally {
      setIsUpdating(false);
    }
  };

  // Delete Record
  const handleDeleteRecord = async (id) => {
    if (!window.confirm('Are you sure you want to delete this weight measurement entry?')) {
      return;
    }

    try {
      setDeletingId(id);
      setIsDeleting(true);
      const res = await api.delete(`/weight-measurement/${id}`);
      if (res.data.ok) {
        fetchRecords();
        fetchSummaryKPIs();
      }
    } catch (err) {
      console.error('Error deleting record:', err);
      alert(err.response?.data?.error || 'Failed to delete record.');
    } finally {
      setIsDeleting(false);
      setDeletingId(null);
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    if (!records.length) {
      alert('No records available to export.');
      return;
    }

    const headers = ['ID', 'Date', 'Time', 'Product Name', 'Weight (IN)', 'Weight (OUT)', 'Difference', 'Unit', 'Reading', 'Per KG Reading (Reading / Diff)', 'Notes', 'Created By'];
    const csvRows = [
      headers.join(','),
      ...records.map(r => [
        `"${r.id}"`,
        `"${r.measurement_date}"`,
        `"${r.measurement_time || ''}"`,
        `"${(r.product_name || '').replace(/"/g, '""')}"`,
        r.weight_in.toFixed(3),
        r.weight_out.toFixed(3),
        r.difference_val.toFixed(3),
        `"${r.unit}"`,
        `"${(r.reading_val || '').replace(/"/g, '""')}"`,
        (r.per_kg_reading || 0).toFixed(4),
        `"${(r.notes || '').replace(/"/g, '""')}"`,
        `"${r.created_by || ''}"`
      ].join(','))
    ];

    const csvBlob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(csvBlob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Weight_Measurements_${getTodayISTStr()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatDateDisplay = (dateStr) => {
    if (!dateStr) return '—';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  return (
    <div className="space-y-6 animate-fade-in p-2 md:p-6 pb-20 max-w-[1600px] mx-auto">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2.5 bg-blue-50 text-blue-600 rounded-xl text-xl shadow-inner">⚖️</span>
            <div>
              <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase">
                Weight Measurement
              </h1>
              <p className="text-xs text-slate-500 font-semibold mt-0.5">
                Independent reading logs for product weights (IN / OUT), difference & per kg readings
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2.5">
          <button
            onClick={() => setIsFormOpen(!isFormOpen)}
            className={`btn-premium text-xs px-5 h-11 flex items-center gap-2 font-bold shadow-sm transition-all ${
              isFormOpen
                ? 'bg-slate-800 hover:bg-slate-900 text-white'
                : 'bg-primary hover:bg-blue-700 text-white'
            }`}
          >
            <span>{isFormOpen ? '✖ Close Form' : '➕ New Entry'}</span>
          </button>

          <button
            onClick={fetchRecords}
            className="btn-premium bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs px-4 h-11 flex items-center gap-1.5"
            title="Refresh Data"
          >
            <span>🔄</span> Refresh
          </button>

          <button
            onClick={handleExportCSV}
            className="btn-premium bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs px-4 h-11 flex items-center gap-1.5"
            title="Export CSV"
          >
            <span>📥</span> Export CSV
          </button>
        </div>
      </div>

      {/* KPI STATS CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Records */}
        <div className="card-premium p-5 border-l-4 border-blue-500 bg-white shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">TOTAL ENTRIES</span>
            <span className="p-1.5 bg-blue-50 text-blue-600 rounded-lg text-xs">📋</span>
          </div>
          <div className="mt-3">
            <span className="text-2xl md:text-3xl font-black text-slate-800 tracking-tight">
              {summary.totalCount.toLocaleString('en-IN')}
            </span>
            <p className="text-[11px] text-slate-400 font-semibold mt-1">
              Matching selected filters
            </p>
          </div>
        </div>

        {/* Card 2: Total Weight In */}
        <div className="card-premium p-5 border-l-4 border-indigo-500 bg-white shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">TOTAL WEIGHT (IN)</span>
            <span className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-xs">📥</span>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl md:text-3xl font-black text-indigo-600 tracking-tight">
                {summary.totalWeightIn.toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
              </span>
              <span className="text-xs font-bold text-slate-400">kg</span>
            </div>
            <p className="text-[11px] text-slate-400 font-semibold mt-1">
              Gross in-weight tally
            </p>
          </div>
        </div>

        {/* Card 3: Total Weight Out */}
        <div className="card-premium p-5 border-l-4 border-cyan-500 bg-white shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">TOTAL WEIGHT (OUT)</span>
            <span className="p-1.5 bg-cyan-50 text-cyan-600 rounded-lg text-xs">📤</span>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl md:text-3xl font-black text-cyan-600 tracking-tight">
                {summary.totalWeightOut.toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
              </span>
              <span className="text-xs font-bold text-slate-400">kg</span>
            </div>
            <p className="text-[11px] text-slate-400 font-semibold mt-1">
              Net out-weight tally
            </p>
          </div>
        </div>

        {/* Card 4: Net Difference */}
        <div className={`card-premium p-5 border-l-4 ${
          summary.totalDifference >= 0 ? 'border-emerald-500' : 'border-rose-500'
        } bg-white shadow-sm flex flex-col justify-between`}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">NET DIFFERENCE</span>
            <span className={`p-1.5 rounded-lg text-xs ${
              summary.totalDifference >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
            }`}>📊</span>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-1.5">
              <span className={`text-2xl md:text-3xl font-black tracking-tight ${
                summary.totalDifference >= 0 ? 'text-emerald-600' : 'text-rose-600'
              }`}>
                {summary.totalDifference > 0 ? '+' : ''}
                {summary.totalDifference.toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
              </span>
              <span className="text-xs font-bold text-slate-400">kg</span>
            </div>
            <p className="text-[11px] text-slate-400 font-semibold mt-1">
              (Total In — Total Out)
            </p>
          </div>
        </div>
      </div>

      {/* COLLAPSIBLE ENTRY FORM */}
      {isFormOpen && (
        <div className="card-premium bg-gradient-to-br from-white to-blue-50/20 border-2 border-blue-200/70 p-6 space-y-6 shadow-md animate-fade-in rounded-2xl">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">⚖️</span>
              <h3 className="text-base font-black text-slate-800 uppercase tracking-wider">
                Log New Weight Measurement
              </h3>
            </div>
            <button
              onClick={() => setIsFormOpen(false)}
              className="text-slate-400 hover:text-slate-600 text-sm font-bold"
            >
              ✕
            </button>
          </div>

          <form onSubmit={handleSaveRecord} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {/* Date */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  Date *
                </label>
                <input
                  type="date"
                  name="measurementDate"
                  value={formData.measurementDate}
                  onChange={handleInputChange}
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
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
                  name="measurementTime"
                  value={formData.measurementTime}
                  onChange={handleInputChange}
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                />
              </div>

              {/* Product Name */}
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  Product Name *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    name="productName"
                    list="productSuggestionsList"
                    value={formData.productName}
                    onChange={handleInputChange}
                    placeholder="e.g. Preforms 19.8g, 20L Water Jar, Sugar Bag..."
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-bold"
                    required
                  />
                  <datalist id="productSuggestionsList">
                    {productSuggestions.map((prod, i) => (
                      <option key={i} value={prod} />
                    ))}
                  </datalist>
                </div>
              </div>

              {/* Weight In */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  Weight (IN) *
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.001"
                    name="weightIn"
                    value={formData.weightIn}
                    onChange={handleInputChange}
                    placeholder="0.000"
                    className="w-full h-11 px-3.5 pr-12 rounded-xl border border-slate-200 bg-white text-slate-800 font-bold focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm"
                    required
                  />
                  <span className="absolute right-3.5 top-3 text-xs font-bold text-slate-400 pointer-events-none">
                    {formData.unit}
                  </span>
                </div>
              </div>

              {/* Weight Out */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  Weight (OUT) *
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.001"
                    name="weightOut"
                    value={formData.weightOut}
                    onChange={handleInputChange}
                    placeholder="0.000"
                    className="w-full h-11 px-3.5 pr-12 rounded-xl border border-slate-200 bg-white text-slate-800 font-bold focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm"
                    required
                  />
                  <span className="absolute right-3.5 top-3 text-xs font-bold text-slate-400 pointer-events-none">
                    {formData.unit}
                  </span>
                </div>
              </div>

              {/* Reading */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  Reading Value (Numeric / Meter)
                </label>
                <input
                  type="number"
                  step="0.0001"
                  name="reading"
                  value={formData.reading}
                  onChange={handleInputChange}
                  placeholder="e.g. 500, 1250.5..."
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-bold"
                />
              </div>

              {/* Unit */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  Unit
                </label>
                <select
                  name="unit"
                  value={formData.unit}
                  onChange={handleInputChange}
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-slate-700 font-bold focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm"
                >
                  <option value="kg">kg (Kilograms)</option>
                  <option value="g">g (Grams)</option>
                  <option value="tons">tons (Metric Ton)</option>
                  <option value="lbs">lbs (Pounds)</option>
                  <option value="pcs">pcs (Pieces)</option>
                </select>
              </div>

              {/* Notes */}
              <div className="space-y-1.5 md:col-span-3 lg:col-span-4">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  Notes / Observations
                </label>
                <input
                  type="text"
                  name="notes"
                  value={formData.notes}
                  onChange={handleInputChange}
                  placeholder="Optional remarks, shift details, operator notes..."
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                />
              </div>
            </div>

            {/* Live Real-Time Calculation Banner */}
            <div className="bg-[#0b1324] rounded-2xl p-4 md:p-5 text-white grid grid-cols-1 sm:grid-cols-2 gap-4 shadow-inner">
              {/* Difference Box */}
              <div className="flex items-center justify-between sm:justify-start gap-3 bg-slate-800/60 p-3 rounded-xl border border-slate-700/50">
                <div>
                  <span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold block">
                    1. DIFFERENCE (IN — OUT)
                  </span>
                  <span className="text-xs text-slate-400 font-medium block mt-0.5">
                    {formData.weightIn || '0'} — {formData.weightOut || '0'}
                  </span>
                </div>
                <span className={`text-lg font-black px-3 py-1 rounded-lg ml-auto ${
                  liveDifference >= 0 ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                }`}>
                  {liveDifference > 0 ? '+' : ''}
                  {liveDifference.toFixed(3)} {formData.unit}
                </span>
              </div>

              {/* Per KG Reading Box */}
              <div className="flex items-center justify-between sm:justify-start gap-3 bg-slate-800/60 p-3 rounded-xl border border-slate-700/50">
                <div>
                  <span className="text-[10px] uppercase tracking-widest text-amber-400 font-bold block">
                    2. PER KG READING (READING ÷ DIFF)
                  </span>
                  <span className="text-xs text-slate-400 font-medium block mt-0.5">
                    {formData.reading || '0'} ÷ {liveDifference.toFixed(3)}
                  </span>
                </div>
                <span className="text-lg font-black px-3 py-1 rounded-lg ml-auto bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {livePerKgReading !== null ? livePerKgReading.toFixed(4) : '0.0000'}
                </span>
              </div>
            </div>

            {/* Error / Success feedback */}
            {formError && (
              <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-xs font-semibold border border-red-100 flex items-center gap-2">
                <span>⚠️</span> {formError}
              </div>
            )}
            {formSuccess && (
              <div className="bg-emerald-50 text-emerald-600 px-4 py-3 rounded-xl text-xs font-semibold border border-emerald-100 flex items-center gap-2">
                <span>✅</span> {formSuccess}
              </div>
            )}

            {/* Form Submit buttons */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={isSaving}
                className="btn-premium bg-emerald-600 hover:bg-emerald-700 text-white px-8 h-12 flex items-center justify-center gap-2 uppercase font-bold text-xs tracking-wider shadow-sm disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <span className="loading loading-spinner loading-xs"></span>
                    Saving...
                  </>
                ) : (
                  <>
                    <span>💾</span> Save Measurement
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="btn-premium bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 px-6 h-12 uppercase font-bold text-xs tracking-wider"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* FILTER & SEARCH TOOLBAR */}
      <div className="card-premium p-4 space-y-4 bg-white border border-slate-100 shadow-sm rounded-2xl">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
          {/* Preset Buttons */}
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'ALL', label: 'All Time' },
              { id: 'TODAY', label: 'Today' },
              { id: 'YESTERDAY', label: 'Yesterday' },
              { id: 'WEEK', label: 'Last 7 Days' },
              { id: 'MONTH', label: 'This Month' },
              { id: 'CUSTOM', label: 'Custom Range' }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => applyDatePreset(tab.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                  dateFilterType === tab.id
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-150'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Bar */}
          <div className="flex items-center gap-3 flex-1 max-w-md">
            <div className="relative w-full">
              <span className="absolute left-3.5 top-3 text-slate-400 text-sm">🔍</span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search product, reading, ID..."
                className="w-full h-11 pl-9 pr-4 rounded-xl border border-slate-200 bg-white text-slate-700 placeholder-slate-400 text-sm focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none font-medium"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 text-xs font-bold"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Custom Date Range Selector (shown if CUSTOM is active) */}
        {dateFilterType === 'CUSTOM' && (
          <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-100 animate-fade-in">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Date Range:</span>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-medium outline-none"
              />
              <span className="text-xs font-bold text-slate-400">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-medium outline-none"
              />
            </div>
            {(startDate || endDate) && (
              <button
                type="button"
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
                }}
                className="text-xs text-rose-500 hover:underline font-bold"
              >
                Clear Range
              </button>
            )}
          </div>
        )}
      </div>

      {/* MEASUREMENTS TABLE */}
      <div className="card-premium overflow-hidden bg-white border border-slate-100 shadow-sm rounded-2xl">
        <div className="overflow-x-auto">
          <table className="table table-zebra w-full">
            <thead className="bg-slate-50/80 border-b border-slate-100">
              <tr className="text-slate-500 text-[11px] font-black uppercase tracking-wider">
                <th className="py-4 px-5 text-left">Date & Time</th>
                <th className="py-4 px-5 text-left">ID</th>
                <th className="py-4 px-5 text-left">Product Name</th>
                <th className="py-4 px-5 text-right">Weight (IN)</th>
                <th className="py-4 px-5 text-right">Weight (OUT)</th>
                <th className="py-4 px-5 text-right">Difference</th>
                <th className="py-4 px-5 text-right">Reading</th>
                <th className="py-4 px-5 text-right">Per KG Reading</th>
                <th className="py-4 px-5 text-left">Notes</th>
                <th className="py-4 px-5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr>
                  <td colSpan="10" className="py-20 text-center text-slate-400">
                    <span className="loading loading-spinner text-primary block mx-auto mb-2"></span>
                    Loading weight measurements...
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan="10" className="py-20 text-center text-slate-400 font-medium italic">
                    No weight measurement records found matching your criteria.
                  </td>
                </tr>
              ) : (
                records.map((r) => (
                  <tr key={r.id} className="hover:bg-blue-50/20 transition-colors">
                    {/* Date & Time */}
                    <td className="py-3.5 px-5">
                      <div className="font-bold text-slate-700 text-xs">
                        {formatDateDisplay(r.measurement_date)}
                      </div>
                      {r.measurement_time && (
                        <div className="text-[10px] text-slate-400 font-medium font-mono">
                          {r.measurement_time}
                        </div>
                      )}
                    </td>

                    {/* ID */}
                    <td className="py-3.5 px-5">
                      <span className="text-[11px] font-mono font-black text-primary bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
                        {r.id}
                      </span>
                    </td>

                    {/* Product Name */}
                    <td className="py-3.5 px-5">
                      <span className="text-sm font-black text-slate-800 uppercase tracking-tight block">
                        {r.product_name}
                      </span>
                    </td>

                    {/* Weight IN */}
                    <td className="py-3.5 px-5 text-right">
                      <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-100">
                        {r.weight_in.toFixed(3)} {r.unit}
                      </span>
                    </td>

                    {/* Weight OUT */}
                    <td className="py-3.5 px-5 text-right">
                      <span className="text-xs font-bold text-cyan-700 bg-cyan-50 px-2.5 py-1 rounded-lg border border-cyan-100">
                        {r.weight_out.toFixed(3)} {r.unit}
                      </span>
                    </td>

                    {/* Difference */}
                    <td className="py-3.5 px-5 text-right">
                      <span className={`text-xs font-black px-2.5 py-1 rounded-lg border ${
                        r.difference_val >= 0
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                          : 'bg-rose-50 text-rose-700 border-rose-100'
                      }`}>
                        {r.difference_val > 0 ? '+' : ''}
                        {r.difference_val.toFixed(3)} {r.unit}
                      </span>
                    </td>

                    {/* Reading */}
                    <td className="py-3.5 px-5 text-right">
                      {r.reading_val ? (
                        <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg font-mono">
                          {r.reading_val}
                        </span>
                      ) : (
                        <span className="text-slate-300 text-xs italic">—</span>
                      )}
                    </td>

                    {/* Per KG Reading (Reading / Difference) */}
                    <td className="py-3.5 px-5 text-right">
                      <span className="text-xs font-black text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200 font-mono">
                        {(parseFloat(r.per_kg_reading) || 0).toFixed(4)}
                      </span>
                    </td>

                    {/* Notes */}
                    <td className="py-3.5 px-5">
                      {r.notes ? (
                        <span className="text-xs text-slate-600 max-w-[180px] truncate block" title={r.notes}>
                          {r.notes}
                        </span>
                      ) : (
                        <span className="text-slate-300 text-xs italic">—</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-5 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(r)}
                          className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-bold border border-slate-200 transition-all cursor-pointer"
                          title="Edit Entry"
                        >
                          ✏️ Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteRecord(r.id)}
                          disabled={isDeleting && deletingId === r.id}
                          className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-xs font-bold border border-red-100 transition-all cursor-pointer disabled:opacity-50"
                          title="Delete Entry"
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

        {/* PAGINATION BAR */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-slate-50/50 border-t border-slate-100">
          <div className="text-xs font-semibold text-slate-500">
            Showing <span className="font-bold text-slate-700">{records.length}</span> of{' '}
            <span className="font-bold text-slate-700">{totalRecords}</span> entries
          </div>

          <div className="flex items-center gap-2">
            <button
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-40"
            >
              ◀ Previous
            </button>
            <span className="text-xs font-black text-slate-700 px-2">
              Page {currentPage} of {totalPages}
            </span>
            <button
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-40"
            >
              Next ▶
            </button>
          </div>
        </div>
      </div>

      {/* EDIT MEASUREMENT MODAL */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm pointer-events-auto p-4">
          <div className="bg-white rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.2)] border border-slate-200 w-full max-w-[620px] max-h-[90vh] overflow-y-auto flex flex-col overflow-hidden animate-fade-in">
            {/* Modal Header */}
            <div className="bg-primary p-6 text-white shrink-0 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-black uppercase tracking-tight">
                  Edit Weight Measurement
                </h3>
                <p className="text-xs text-blue-100 font-mono mt-0.5">
                  Reference: {editingRecord?.id}
                </p>
              </div>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="text-white hover:text-red-200 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleUpdateRecord} className="p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Date */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                    Date *
                  </label>
                  <input
                    type="date"
                    value={editFormData.measurementDate}
                    onChange={(e) => setEditFormData({ ...editFormData, measurementDate: e.target.value })}
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
                    value={editFormData.measurementTime}
                    onChange={(e) => setEditFormData({ ...editFormData, measurementTime: e.target.value })}
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-medium outline-none"
                  />
                </div>

                {/* Product Name */}
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                    Product Name *
                  </label>
                  <input
                    type="text"
                    value={editFormData.productName}
                    onChange={(e) => setEditFormData({ ...editFormData, productName: e.target.value })}
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm font-bold outline-none"
                    required
                  />
                </div>

                {/* Weight IN */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                    Weight (IN) *
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.001"
                      value={editFormData.weightIn}
                      onChange={(e) => setEditFormData({ ...editFormData, weightIn: e.target.value })}
                      className="w-full h-11 px-3.5 pr-12 rounded-xl border border-slate-200 bg-white text-slate-800 font-bold text-sm outline-none"
                      required
                    />
                    <span className="absolute right-3.5 top-3 text-xs font-bold text-slate-400 pointer-events-none">
                      {editFormData.unit}
                    </span>
                  </div>
                </div>

                {/* Weight OUT */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                    Weight (OUT) *
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.001"
                      value={editFormData.weightOut}
                      onChange={(e) => setEditFormData({ ...editFormData, weightOut: e.target.value })}
                      className="w-full h-11 px-3.5 pr-12 rounded-xl border border-slate-200 bg-white text-slate-800 font-bold text-sm outline-none"
                      required
                    />
                    <span className="absolute right-3.5 top-3 text-xs font-bold text-slate-400 pointer-events-none">
                      {editFormData.unit}
                    </span>
                  </div>
                </div>

                {/* Reading */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                    Reading Value (Numeric / Meter)
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    value={editFormData.reading}
                    onChange={(e) => setEditFormData({ ...editFormData, reading: e.target.value })}
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-bold outline-none"
                  />
                </div>

                {/* Unit */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                    Unit
                  </label>
                  <select
                    value={editFormData.unit}
                    onChange={(e) => setEditFormData({ ...editFormData, unit: e.target.value })}
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-slate-700 font-bold text-sm outline-none"
                  >
                    <option value="kg">kg (Kilograms)</option>
                    <option value="g">g (Grams)</option>
                    <option value="tons">tons (Metric Ton)</option>
                    <option value="lbs">lbs (Pounds)</option>
                    <option value="pcs">pcs (Pieces)</option>
                  </select>
                </div>

                {/* Notes */}
                <div className="space-y-1.5 sm:col-span-2">
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
              </div>

              {/* Live Edit Calculations Banner */}
              <div className="bg-slate-900 rounded-2xl p-4 text-white grid grid-cols-1 sm:grid-cols-2 gap-3 shadow-inner">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-300 font-bold">Difference:</span>
                  <span className={`text-sm font-black px-2.5 py-1 rounded-md ${
                    liveEditDifference >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                  }`}>
                    {liveEditDifference > 0 ? '+' : ''}
                    {liveEditDifference.toFixed(3)} {editFormData.unit}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-amber-300 font-bold">Per KG Reading:</span>
                  <span className="text-sm font-black px-2.5 py-1 rounded-md bg-amber-500/20 text-amber-300 font-mono">
                    {liveEditPerKgReading !== null ? liveEditPerKgReading.toFixed(4) : '0.0000'}
                  </span>
                </div>
              </div>

              {editError && (
                <div className="bg-red-50 text-red-600 px-4 py-2.5 rounded-xl text-xs font-semibold border border-red-100">
                  ⚠️ {editError}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isUpdating}
                  className="btn-premium bg-blue-600 hover:bg-blue-700 text-white flex-1 h-11 uppercase font-bold text-xs tracking-wider shadow-sm disabled:opacity-50"
                >
                  {isUpdating ? 'Updating...' : '💾 Update Measurement'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="btn-premium bg-slate-100 text-slate-600 hover:bg-slate-200 px-5 h-11 uppercase font-bold text-xs tracking-wider"
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

export default WeightMeasurement;
