import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';

const PetBottleHistory = () => {
  const navigate = useNavigate();

  // Data states
  const [batches, setBatches] = useState([]);
  const [totalBatches, setTotalBatches] = useState(0);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const limit = 10;

  // Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Dropdowns
  const [finishedProducts, setFinishedProducts] = useState([]);
  const [preformMaterials, setPreformMaterials] = useState([]);

  // Modal states
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [deletingBatch, setDeletingBatch] = useState(null);
  const [viewingBatch, setViewingBatch] = useState(null);
  const [editingBatchId, setEditingBatchId] = useState(null);

  // Form states
  const [formData, setFormData] = useState({
    batchDate: '',
    productId: '',
    rawMaterialId: '',
    bagsUsed: '',
    actualReading: '',
    bottleBags: '0',
    wastage: '0',
    startTime: '8:00 am',
    stopTime: '5:00 pm',
    notes: ''
  });
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchHistory();
  }, [currentPage, searchQuery, startDate, endDate]);

  useEffect(() => {
    fetchDropdowns();
  }, []);

  const getTodayStr = () => {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const istDate = new Date(now.getTime() + (330 + offset) * 60000);
    const yyyy = istDate.getFullYear();
    const mm = String(istDate.getMonth() + 1).padStart(2, '0');
    const dd = String(istDate.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };
  const todayStr = getTodayStr();

  const isTodayBatch = (batchDateStr) => {
    return batchDateStr === todayStr;
  };

  const fetchDropdowns = async () => {
    try {
      // 1. Fetch finished products
      const fpRes = await api.get('/finished-products', { params: { limit: 100 } });
      if (fpRes.data.ok) {
        setFinishedProducts(fpRes.data.products || []);
      }

      // 2. Fetch raw materials and filter by "Preforms" category
      const categoriesRes = await api.get('/raw-materials/categories');
      const materialsRes = await api.get('/raw-materials', { params: { limit: 200 } });

      if (categoriesRes.data.ok && materialsRes.data.ok) {
        const preformCat = categoriesRes.data.categories.find(
          c => c.name.toLowerCase() === 'preforms'
        );
        if (preformCat) {
          const preformMats = materialsRes.data.materials.filter(
            m => m.category_id === preformCat.id
          );
          setPreformMaterials(preformMats);
        }
      }
    } catch (err) {
      console.error('Failed to load dropdowns:', err);
    }
  };

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const res = await api.get('/pet-bottle', {
        params: {
          page: currentPage,
          limit,
          search: searchQuery,
          startDate,
          endDate
        }
      });
      if (res.data.ok) {
        setBatches(res.data.batches || []);
        setTotalBatches(res.data.total || 0);
      }
    } catch (err) {
      console.error('Failed to fetch production history:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1);
  };

  const handleDateFilterChange = (e) => {
    const { name, value } = e.target;
    if (name === 'startDate') setStartDate(value);
    if (name === 'endDate') setEndDate(value);
    setCurrentPage(1);
  };

  const confirmDelete = (batch) => {
    setDeletingBatch(batch);
    setIsDeleteModalOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingBatch) return;
    try {
      const res = await api.delete(`/pet-bottle/${deletingBatch.id}`);
      if (res.data.ok) {
        setIsDeleteModalOpen(false);
        setDeletingBatch(null);
        fetchHistory();
      } else {
        alert(res.data.error || 'Failed to delete record.');
      }
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  const handleOpenView = (batch) => {
    setViewingBatch(batch);
    setIsViewModalOpen(true);
  };

  const handleOpenEdit = (batch) => {
    setFormError('');
    setFormSuccess('');
    setEditingBatchId(batch.id);
    setFormData({
      batchDate: batch.batch_date,
      productId: batch.finished_product_id,
      rawMaterialId: batch.raw_material_id,
      bagsUsed: batch.bags_used,
      actualReading: batch.actual_reading,
      bottleBags: batch.bottle_bags || 0,
      wastage: batch.wastage || 0,
      startTime: batch.start_time || '8:00 am',
      stopTime: batch.stop_time || '5:00 pm',
      notes: batch.notes || ''
    });
    setIsFormModalOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormModalOpen(false);
    setEditingBatchId(null);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Live Calculations for edit modal
  const selectedPreform = preformMaterials.find(
    m => m.id === parseInt(formData.rawMaterialId, 10)
  );
  const preformWeight = selectedPreform ? parseFloat(selectedPreform.sub_product_name) : 0;
  const bagsUsedNum = parseFloat(formData.bagsUsed) || 0;
  const actualReadingNum = parseFloat(formData.actualReading) || 0;

  const expectedReading = preformWeight > 0 && bagsUsedNum > 0
    ? Math.round((1000 / preformWeight) * 25 * bagsUsedNum)
    : 0;

  const difference = expectedReading - actualReadingNum;
  const isDifferenceNegative = difference < 0;

  const handleSaveBatch = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    const { batchDate, productId, rawMaterialId, bagsUsed, actualReading, bottleBags, wastage, startTime, stopTime, notes } = formData;

    if (!batchDate) return setFormError('Batch Date is required.');
    if (!productId) return setFormError('Product is required.');
    if (!rawMaterialId) return setFormError('Preform selection is required.');
    if (parseFloat(bagsUsed) <= 0 || isNaN(parseFloat(bagsUsed))) {
      return setFormError('Bags Used must be greater than 0.');
    }
    if (parseFloat(actualReading) < 0 || isNaN(parseFloat(actualReading))) {
      return setFormError('Actual Reading cannot be negative.');
    }

    if (isDifferenceNegative) {
      return setFormError(`Actual Reading cannot exceed Expected Reading (difference cannot be negative).`);
    }

    setIsSaving(true);
    try {
      const payload = {
        batchDate,
        productId: parseInt(productId, 10),
        rawMaterialId: parseInt(rawMaterialId, 10),
        bagsUsed: parseFloat(bagsUsed),
        actualReading: parseFloat(actualReading),
        bottleBags: parseInt(bottleBags, 10) || 0,
        wastage: parseFloat(wastage) || 0,
        startTime,
        stopTime,
        notes
      };

      const res = await api.put(`/pet-bottle/${editingBatchId}`, payload);

      if (res.data.ok) {
        setFormSuccess('Production batch updated successfully!');
        setTimeout(() => {
          handleCloseForm();
          fetchHistory();
        }, 1000);
      } else {
        setFormError(res.data.error || 'Failed to update batch.');
      }
    } catch (err) {
      setFormError(err.response?.data?.error || err.message || 'An error occurred.');
    } finally {
      setIsSaving(false);
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

  // PDF EXPORT / PRINT LEDGER
  const handleExportPDF = () => {
    if (batches.length === 0) {
      alert('No data available to print.');
      return;
    }

    const printWindow = window.open('', '_blank');
    const html = `
      <html>
        <head>
          <title>Pet Bottle Production Report</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; color: #334155; }
            .header-container { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 30px; }
            h1 { font-size: 22px; font-weight: 800; color: #0f172a; margin: 0; }
            p { font-size: 13px; color: #64748b; margin: 5px 0 0 0; }
            .date-badge { font-size: 11px; font-weight: 700; color: #475569; background: #f1f5f9; padding: 6px 12px; rounded: 8px; border: 1px solid #e2e8f0; text-transform: uppercase; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th { background-color: #f8fafc; border-bottom: 2px solid #cbd5e1; color: #475569; font-size: 10px; font-weight: 800; text-transform: uppercase; padding: 12px 14px; text-align: left; }
            td { border-bottom: 1px solid #e2e8f0; padding: 12px 14px; font-size: 12px; color: #334155; }
            .mono { font-family: monospace; font-weight: bold; color: #1a56db; }
            .amount { font-weight: bold; }
            .summary-box { margin-top: 40px; border-top: 2px solid #e2e8f0; padding-top: 20px; font-size: 14px; font-weight: 700; color: #0f172a; display: flex; justify-content: space-between; }
          </style>
        </head>
        <body>
          <div class="header-container">
            <div>
              <h1>KEMP'S INVENTORY SYSTEM</h1>
              <p>Pet Bottle Production History Ledger</p>
            </div>
            <div class="date-badge">Generated: ${new Date().toLocaleDateString('en-GB')}</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Batch ID</th>
                <th>Date</th>
                <th>Product</th>
                <th>Preform Weight</th>
                <th>Bags Used</th>
                <th>Timing</th>
                <th>Actual Blown (pcs)</th>
                <th>Expected Reading</th>
                <th>Difference</th>
                <th>Wastage (pcs)</th>
              </tr>
            </thead>
            <tbody>
              ${batches.map(b => `
                <tr>
                  <td class="mono">${b.id}</td>
                  <td>${formatDateDDMMYYYY(b.batch_date)}</td>
                  <td style="font-weight: 600;">${b.product_name}</td>
                  <td>${b.preform_name}g</td>
                  <td>${b.bags_used}</td>
                  <td>${b.start_time || '—'} to ${b.stop_time || '—'}</td>
                  <td class="amount">${parseFloat(b.actual_reading).toLocaleString('en-IN')}</td>
                  <td>${parseFloat(b.expected_reading).toLocaleString('en-IN')}</td>
                  <td>${parseFloat(b.difference_val).toLocaleString('en-IN')}</td>
                  <td>${b.wastage || 0}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="summary-box">
            <span>Total Batches Printed: ${batches.length}</span>
            <span>Total Actual Blown: ${batches.reduce((sum, b) => sum + parseFloat(b.actual_reading), 0).toLocaleString('en-IN')} pcs</span>
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

  const totalPages = Math.ceil(totalBatches / limit) || 1;

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto pb-12">

      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <button 
            onClick={() => navigate('/pet-bottle')}
            className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-650 hover:bg-slate-50 transition-all font-bold text-sm shadow-sm flex items-center gap-1.5 mb-2"
          >
            ← Back
          </button>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase">PRODUCTION HISTORY</h1>
          <p className="text-slate-500 text-sm font-medium mt-1">View and audit all historical Pet Bottle production runs</p>
        </div>
        
        {/* EXPORT OPTIONS */}
        <div className="flex gap-3">
          <button 
            onClick={handleExportPDF}
            className="btn-premium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs px-4 h-12"
          >
            🖨️ Export to PDF
          </button>
        </div>
      </div>

      {/* FILTER CONTROLS & TABLE CARD */}
      <div className="card-premium">
        
        {/* Date Range & Search Inputs */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          {/* Search Box */}
          <div className="relative md:col-span-2">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
            <input 
              type="text" 
              placeholder="Search by ID, product, preform weight, notes..."
              value={searchQuery}
              onChange={handleSearchChange}
              className="input-premium pl-11 h-11 w-full"
            />
          </div>

          {/* Start Date */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400 uppercase shrink-0">From</span>
            <input 
              type="date"
              name="startDate"
              value={startDate}
              onChange={handleDateFilterChange}
              className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
            />
          </div>

          {/* End Date */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400 uppercase shrink-0">To</span>
            <input 
              type="date"
              name="endDate"
              value={endDate}
              onChange={handleDateFilterChange}
              className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
            />
          </div>
        </div>

        {/* Records Count Badge */}
        <div className="flex justify-end mb-4">
          <div className="text-[12px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
            {totalBatches} Total Records
          </div>
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="table table-zebra w-full overflow-hidden">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr className="text-slate-500 text-[11px] font-black uppercase tracking-wider">
                <th className="py-4 px-6 text-left">Batch ID</th>
                <th className="py-4 px-6 text-left">Date</th>
                <th className="py-4 px-6 text-left">Product</th>
                <th className="py-4 px-6 text-left">Preform</th>
                <th className="py-4 px-6 text-left">Bags Used</th>
                <th className="py-4 px-6 text-left">Timing</th>
                <th className="py-4 px-6 text-left">Actual Blown</th>
                <th className="py-4 px-6 text-left">Expected</th>
                <th className="py-4 px-6 text-left">Difference</th>
                <th className="py-4 px-6 text-left">Wastage</th>
                <th className="py-4 px-6 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr>
                  <td colSpan="11" className="py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                       <span className="loading loading-spinner text-primary"></span>
                       <span className="text-slate-400 text-sm font-medium">Fetching history ledger...</span>
                    </div>
                  </td>
                </tr>
              ) : batches.length === 0 ? (
                <tr>
                  <td colSpan="11" className="py-20 text-center text-slate-400 font-medium italic">
                    No production batch records matching the criteria.
                  </td>
                </tr>
              ) : (
                batches.map((b) => (
                  <tr key={b.id} className="hover:bg-blue-50/30 transition-colors group">
                    <td className="py-4 px-6 text-[13px] font-mono font-bold text-primary">{b.id}</td>
                    <td className="py-4 px-6 text-[13px] font-medium text-slate-550">{formatDateDDMMYYYY(b.batch_date)}</td>
                    <td className="py-4 px-6 text-[13px] font-bold text-slate-700 truncate max-w-[150px]" title={b.product_name}>{b.product_name}</td>
                    <td className="py-4 px-6 text-[13px] font-semibold text-slate-605">{b.preform_name}g</td>
                    <td className="py-4 px-6 text-[13px] font-semibold text-slate-650">{b.bags_used}</td>
                    <td className="py-4 px-6 text-[13px] text-slate-600">
                      {b.start_time || '—'} to {b.stop_time || '—'}
                    </td>
                    <td className="py-4 px-6 text-[13px] font-black text-slate-800">{parseFloat(b.actual_reading).toLocaleString('en-IN')}</td>
                    <td className="py-4 px-6 text-[13px] text-slate-500">{parseFloat(b.expected_reading).toLocaleString('en-IN')}</td>
                    <td className="py-4 px-6 text-[13px] font-bold text-slate-600">{parseFloat(b.difference_val).toLocaleString('en-IN')}</td>
                    <td className="py-4 px-6 text-[13px] text-slate-500">{b.wastage || 0}</td>
                    <td className="py-4 px-6">
                      <div className="flex items-center justify-center gap-2">
                        <button 
                          onClick={() => handleOpenView(b)}
                          className="btn btn-ghost btn-xs text-slate-505 hover:bg-slate-100 rounded-lg px-2"
                        >
                          View
                        </button>
                        {isTodayBatch(b.batch_date) && (
                          <>
                            <button 
                              onClick={() => handleOpenEdit(b)}
                              className="btn btn-ghost btn-xs text-primary hover:bg-primary/10 rounded-lg px-2"
                            >
                              Edit
                            </button>
                            <button 
                              onClick={() => confirmDelete(b)}
                              className="btn btn-ghost btn-xs text-red-500 hover:bg-red-50 rounded-lg px-2"
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* PAGINATION CONTROLS */}
        {!loading && totalBatches > 0 && (
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-100">
            <div className="text-[12px] font-bold text-slate-400 uppercase">
              Page {currentPage} of {totalPages}
            </div>
            <div className="flex gap-2">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-50 text-[12px] font-bold shadow-sm transition-all duration-200"
              >
                Previous
              </button>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-50 text-[12px] font-bold shadow-sm transition-all duration-200"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* EDIT MODAL DIALOG */}
      {isFormModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm pointer-events-auto">
          <div className="bg-white rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.2)] border border-slate-200 w-[650px] h-[640px] flex flex-col overflow-hidden animate-fade-in pointer-events-auto">
            {/* Modal Header */}
            <div className="bg-primary p-7 text-white shrink-0 relative">
              <h3 className="text-2xl font-black italic tracking-tight uppercase">
                Edit Production Entry
              </h3>
              <p className="text-blue-100 text-xs mt-1 font-medium italic opacity-85">
                Modifying history record: {editingBatchId}
              </p>
              <button 
                onClick={handleCloseForm}
                className="absolute right-7 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-all font-bold"
              >
                ✕
              </button>
            </div>

            {/* Scrollable Modal Content */}
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
              <form id="petBottleHistoryForm" onSubmit={handleSaveBatch} className="space-y-6">
                
                {/* 1. BATCH DETAILS */}
                <div className="border border-slate-200/80 rounded-2xl bg-white p-5 space-y-4">
                  <div className="text-[11px] font-black text-slate-450 uppercase tracking-widest border-b border-slate-100 pb-2.5 flex items-center gap-1.5">
                    <span>🥛</span> BATCH DETAILS
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Date */}
                    <div className="space-y-1.5">
                      <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                        Date *
                      </label>
                      <input 
                        type="date"
                        name="batchDate"
                        value={formData.batchDate}
                        onChange={handleInputChange}
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                        required
                      />
                    </div>

                    {/* Finished Product */}
                    <div className="space-y-1.5">
                      <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                        Product *
                      </label>
                      <select
                        name="productId"
                        value={formData.productId}
                        onChange={handleInputChange}
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                        required
                      >
                        <option value="">Select Product</option>
                        {finishedProducts.map(fp => (
                          <option key={fp.id} value={fp.id}>{fp.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Preforms */}
                    <div className="space-y-1.5">
                      <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                        Preforms *
                      </label>
                      <select
                        name="rawMaterialId"
                        value={formData.rawMaterialId}
                        onChange={handleInputChange}
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                        required
                      >
                        <option value="">Select Preform (g)</option>
                        {preformMaterials.map(m => (
                          <option key={m.id} value={m.id}>{m.sub_product_name}g</option>
                        ))}
                      </select>
                    </div>

                    {/* Bags Used */}
                    <div className="space-y-1.5">
                      <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                        Bags Used *
                      </label>
                      <input 
                        type="number"
                        name="bagsUsed"
                        value={formData.bagsUsed}
                        onChange={handleInputChange}
                        placeholder="0"
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                        required
                      />
                    </div>

                    {/* Start Time */}
                    <div className="space-y-1.5">
                      <label className="text-[12px] font-bold text-slate-550 block uppercase tracking-wider">
                        Start Time
                      </label>
                      <input 
                        type="text"
                        name="startTime"
                        value={formData.startTime}
                        onChange={handleInputChange}
                        placeholder="e.g. 8:00 am"
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                      />
                    </div>

                    {/* Stop Time */}
                    <div className="space-y-1.5">
                      <label className="text-[12px] font-bold text-slate-555 block uppercase tracking-wider">
                        Stop Time
                      </label>
                      <input 
                        type="text"
                        name="stopTime"
                        value={formData.stopTime}
                        onChange={handleInputChange}
                        placeholder="e.g. 5:00 pm"
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                      />
                    </div>
                  </div>
                </div>

                {/* 2. READINGS & CALCULATIONS */}
                <div className="border border-slate-200/80 rounded-2xl bg-white p-5 space-y-4">
                  <div className="text-[11px] font-black text-slate-450 uppercase tracking-widest border-b border-slate-100 pb-2.5 flex items-center gap-1.5">
                    <span>📊</span> READINGS & CALCULATIONS
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Actual Reading */}
                    <div className="space-y-1.5">
                      <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                        Actual Reading *
                      </label>
                      <input 
                        type="number"
                        name="actualReading"
                        value={formData.actualReading}
                        onChange={handleInputChange}
                        placeholder="0.00"
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                        required
                      />
                    </div>

                    {/* Expected Reading */}
                    <div className="space-y-1.5">
                      <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                        Expected Reading
                      </label>
                      <input 
                        type="text"
                        value={expectedReading ? expectedReading.toString() : 'Auto-calc'}
                        readOnly
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-slate-50 text-slate-505 outline-none text-sm font-bold cursor-not-allowed"
                      />
                      <span className="text-[10px] font-bold text-slate-450 mt-1 block">
                        Formula: (1000 ÷ preform) × 25 × bags
                      </span>
                    </div>

                    {/* Difference */}
                    <div className="md:col-span-2 space-y-1.5">
                      <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                        Difference (Expected - Actual)
                      </label>
                      <input 
                        type="text"
                        value={
                          formData.rawMaterialId && formData.bagsUsed && formData.actualReading
                            ? difference.toString()
                            : 'Auto-calc'
                        }
                        readOnly
                        className={`w-full h-11 px-4 rounded-xl border outline-none text-sm font-bold cursor-not-allowed ${
                          isDifferenceNegative 
                            ? 'bg-red-50 border-red-200 text-red-600'
                            : 'bg-slate-50 border-slate-200 text-slate-500'
                        }`}
                      />
                      <span className={`text-[10px] font-bold mt-1 block ${isDifferenceNegative ? 'text-red-500' : 'text-slate-450'}`}>
                        {isDifferenceNegative 
                          ? '⚠️ Error: Actual Reading exceeds theoretical maximum Expected Reading!' 
                          : 'Positive = over expected | Negative = under expected'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 3. ADDITIONAL DETAILS */}
                <div className="border border-slate-200/80 rounded-2xl bg-white p-5 space-y-4">
                  <div className="text-[11px] font-black text-slate-450 uppercase tracking-widest border-b border-slate-100 pb-2.5 flex items-center gap-1.5">
                    <span>📦</span> ADDITIONAL DETAILS
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Bottle Bags */}
                    <div className="space-y-1.5">
                      <label className="text-[12px] font-bold text-slate-550 block uppercase tracking-wider">
                        Bottle Bags
                      </label>
                      <input 
                        type="number"
                        name="bottleBags"
                        value={formData.bottleBags}
                        onChange={handleInputChange}
                        placeholder="0"
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                      />
                    </div>

                    {/* Wastage */}
                    <div className="space-y-1.5">
                      <label className="text-[12px] font-bold text-slate-550 block uppercase tracking-wider">
                        Wastage
                      </label>
                      <input 
                        type="number"
                        name="wastage"
                        value={formData.wastage}
                        onChange={handleInputChange}
                        placeholder="0.00"
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                      />
                    </div>

                    {/* Notes */}
                    <div className="md:col-span-2 space-y-1.5">
                      <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                        Notes
                      </label>
                      <input 
                        type="text"
                        name="notes"
                        value={formData.notes}
                        onChange={handleInputChange}
                        placeholder="Notes / remarks for this production batch..."
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                      />
                    </div>
                  </div>
                </div>

                {/* Feedback messages */}
                {formError && (
                  <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-xs font-semibold border border-red-100">
                    ⚠️ {formError}
                  </div>
                )}
                {formSuccess && (
                  <div className="bg-emerald-50 text-emerald-600 px-4 py-3 rounded-xl text-xs font-semibold border border-emerald-100">
                    ✅ {formSuccess}
                  </div>
                )}
              </form>
            </div>

            {/* Modal Sticky Footer */}
            <div className="p-8 border-t border-slate-100 bg-white flex gap-4 shrink-0 shadow-[0_-10px_30px_rgba(0,0,0,0.02)]">
              <button 
                type="submit" 
                form="petBottleHistoryForm"
                disabled={isSaving || isDifferenceNegative}
                className={`btn-premium flex-[2] h-14 text-sm uppercase tracking-wider ${
                  isSaving || isDifferenceNegative
                    ? 'bg-slate-200 text-slate-450 cursor-not-allowed'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-100/30'
                }`}
              >
                {isSaving ? <span className="loading loading-spinner"></span> : 'Update Production'}
              </button>
              <button 
                type="button" 
                onClick={handleCloseForm}
                className="btn-premium bg-white text-slate-500 hover:bg-slate-50 border border-slate-200 flex-1 h-14 text-sm font-bold uppercase tracking-wider"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VIEW DETAILS MODAL */}
      {isViewModalOpen && viewingBatch && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm pointer-events-auto">
          <div className="bg-white rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.2)] border border-slate-200 w-[500px] p-8 flex flex-col gap-6 animate-fade-in pointer-events-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-150">
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-1.5">
                <span>📋</span> Production Details
              </h3>
              <button 
                onClick={() => setIsViewModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-55 flex items-center justify-center text-slate-505 hover:bg-slate-100 transition-all font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-sm font-medium">
              <div className="grid grid-cols-3 gap-2 py-2 border-b border-slate-50">
                <span className="text-slate-400 font-bold text-xs uppercase tracking-wider">Batch ID</span>
                <span className="col-span-2 font-mono font-bold text-primary text-xs">{viewingBatch.id}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-2 border-b border-slate-50">
                <span className="text-slate-400 font-bold text-xs uppercase tracking-wider">Date</span>
                <span className="col-span-2 text-slate-800">{formatDateDDMMYYYY(viewingBatch.batch_date)}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-2 border-b border-slate-50">
                <span className="text-slate-400 font-bold text-xs uppercase tracking-wider">Product</span>
                <span className="col-span-2 text-slate-800 font-bold">{viewingBatch.product_name}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-2 border-b border-slate-50">
                <span className="text-slate-400 font-bold text-xs uppercase tracking-wider">Preform</span>
                <span className="col-span-2 text-slate-700">{viewingBatch.preform_name}g</span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-2 border-b border-slate-50">
                <span className="text-slate-400 font-bold text-xs uppercase tracking-wider">Bags Used</span>
                <span className="col-span-2 text-slate-700 font-semibold">{viewingBatch.bags_used} bags</span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-2 border-b border-slate-50">
                <span className="text-slate-400 font-bold text-xs uppercase tracking-wider">Timing</span>
                <span className="col-span-2 text-slate-700">{viewingBatch.start_time || '—'} to {viewingBatch.stop_time || '—'}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-2 border-b border-slate-50">
                <span className="text-slate-400 font-bold text-xs uppercase tracking-wider">Actual Blown</span>
                <span className="col-span-2 font-black text-slate-800">{parseFloat(viewingBatch.actual_reading).toLocaleString('en-IN')} pcs</span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-2 border-b border-slate-50">
                <span className="text-slate-400 font-bold text-xs uppercase tracking-wider">Expected</span>
                <span className="col-span-2 text-slate-700">{parseFloat(viewingBatch.expected_reading).toLocaleString('en-IN')} pcs</span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-2 border-b border-slate-50">
                <span className="text-slate-400 font-bold text-xs uppercase tracking-wider">Difference</span>
                <span className="col-span-2 text-slate-705 font-bold">{parseFloat(viewingBatch.difference_val).toLocaleString('en-IN')} pcs</span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-2 border-b border-slate-50">
                <span className="text-slate-400 font-bold text-xs uppercase tracking-wider">Bottle Bags</span>
                <span className="col-span-2 text-slate-700">{viewingBatch.bottle_bags || 0} bags</span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-2 border-b border-slate-50">
                <span className="text-slate-400 font-bold text-xs uppercase tracking-wider">Wastage</span>
                <span className="col-span-2 text-slate-700">{viewingBatch.wastage || 0} pcs</span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-2">
                <span className="text-slate-400 font-bold text-xs uppercase tracking-wider">Notes</span>
                <span className="col-span-2 text-slate-550 italic whitespace-pre-wrap">{viewingBatch.notes || '—'}</span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex gap-2">
              <button 
                onClick={() => setIsViewModalOpen(false)}
                className="btn-premium bg-slate-50 hover:bg-slate-100 text-slate-650 border border-slate-200 flex-1 h-11 text-xs uppercase font-bold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {isDeleteModalOpen && (
        <div className="modal modal-open">
          <div className="modal-box rounded-2xl p-8 max-w-sm border border-slate-200 shadow-2xl">
            <div className="w-14 h-14 bg-red-50 text-red-500 rounded-full flex items-center justify-center text-2xl mx-auto mb-4">
              ⚠️
            </div>
            <h3 className="text-xl font-black text-center text-slate-800">Confirm Deletion</h3>
            <p className="text-center text-slate-505 mt-2 text-sm">
              Are you sure you want to delete production batch record <b>{deletingBatch?.id}</b>?
              <br/>This will reverse all preforms raw material and blown bottle stock registry transactions.
            </p>
            <div className="flex flex-col gap-2 mt-8">
              <button 
                onClick={handleDelete}
                className="btn-premium bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-200"
              >
                Yes, Delete Record
              </button>
              <button 
                onClick={() => setIsDeleteModalOpen(false)}
                className="btn-premium bg-slate-100 text-slate-650 hover:bg-slate-200 font-bold"
              >
                No, Keep Record
              </button>
            </div>
          </div>
          <div className="modal-backdrop bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsDeleteModalOpen(false)}></div>
        </div>
      )}

    </div>
  );
};

export default PetBottleHistory;
