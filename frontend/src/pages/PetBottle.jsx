import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';

const PetBottle = () => {
  const navigate = useNavigate();

  // Data states
  const [batches, setBatches] = useState([]);
  const [summary, setSummary] = useState({
    totalBagsUsed: 0,
    totalActualReading: 0,
    totalWastage: 0,
    totalCount: 0
  });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [todayDateStr, setTodayDateStr] = useState('');

  // Dropdowns
  const [finishedProducts, setFinishedProducts] = useState([]);
  const [preformMaterials, setPreformMaterials] = useState([]);

  // Modal states
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingBatchId, setDeletingBatchId] = useState(null);
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
    fetchTodayBatches();
    fetchDropdowns();
  }, [searchQuery]);

  const fetchTodayBatches = async () => {
    try {
      setLoading(true);
      const res = await api.get('/pet-bottle/today', {
        params: { search: searchQuery }
      });
      if (res.data.ok) {
        setBatches(res.data.batches || []);
        setSummary(res.data.summary || { totalBagsUsed: 0, totalActualReading: 0, totalWastage: 0, totalCount: 0 });
        if (res.data.todayStr) {
          setTodayDateStr(res.data.todayStr);
        }
      }
    } catch (err) {
      console.error('Failed to fetch today\'s production batches:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchDropdowns = async () => {
    try {
      // 1. Fetch finished products
      const fpRes = await api.get('/finished-products', { params: { limit: 100, activeOnly: true } });
      if (fpRes.data.ok) {
        setFinishedProducts(fpRes.data.products || []);
      }

      // 2. Fetch raw materials and filter by "Preforms" category
      const categoriesRes = await api.get('/raw-materials/categories');
      const materialsRes = await api.get('/raw-materials', { params: { limit: 200, activeOnly: true } });

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

  const handleOpenForm = (batch = null) => {
    setFormError('');
    setFormSuccess('');

    if (batch) {
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
    } else {
      setEditingBatchId(null);
      // Default Date to today
      const now = new Date();
      const offset = now.getTimezoneOffset();
      const istDate = new Date(now.getTime() + (330 + offset) * 60000);
      const yyyy = istDate.getFullYear();
      const mm = String(istDate.getMonth() + 1).padStart(2, '0');
      const dd = String(istDate.getDate()).padStart(2, '0');
      const todayFormatted = `${yyyy}-${mm}-${dd}`;

      setFormData({
        batchDate: todayFormatted,
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
    }
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

  // Live Calculations for modal
  const selectedPreform = preformMaterials.find(
    m => m.id === parseInt(formData.rawMaterialId, 10)
  );
  const preformWeight = selectedPreform ? parseFloat(selectedPreform.sub_product_name) : 0;
  const bagsUsedNum = parseFloat(formData.bagsUsed) || 0;
  const actualReadingNum = parseFloat(formData.actualReading) || 0;

  // Expected = 1000 / weight * 25 * bags
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

      let res;
      if (editingBatchId) {
        res = await api.put(`/pet-bottle/${editingBatchId}`, payload);
      } else {
        res = await api.post('/pet-bottle', payload);
      }

      if (res.data.ok) {
        setFormSuccess(editingBatchId ? 'Production batch updated successfully!' : 'Production batch recorded successfully!');
        setTimeout(() => {
          handleCloseForm();
          fetchTodayBatches();
        }, 1000);
      } else {
        setFormError(res.data.error || 'Failed to save batch.');
      }
    } catch (err) {
      setFormError(err.response?.data?.error || err.message || 'An error occurred.');
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = (batchId) => {
    setDeletingBatchId(batchId);
    setIsDeleteModalOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingBatchId) return;
    try {
      const res = await api.delete(`/pet-bottle/${deletingBatchId}`);
      if (res.data.ok) {
        setIsDeleteModalOpen(false);
        setDeletingBatchId(null);
        fetchTodayBatches();
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
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto pb-12">

      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase">PET BOTTLE</h1>
          <p className="text-slate-500 text-sm font-medium mt-1">Log preform usage and bottle production dashboard</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleOpenForm}
            className="btn-premium btn-primary-premium h-12"
          >
            <span className="text-xl">+</span> Add Production
          </button>
          <button 
            onClick={() => navigate('/pet-bottle-history')}
            className="btn-premium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs px-4 h-12"
          >
            Production History
          </button>
        </div>
      </div>

      {/* SUMMARY CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Blown Bottles */}
        <div className="card-premium flex items-center justify-between p-5">
          <div>
            <p className="text-[10px] font-black text-slate-450 uppercase tracking-widest">Bottles Produced</p>
            <h3 className="text-xl font-extrabold text-slate-800 mt-1.5">
              {summary.totalActualReading.toLocaleString('en-IN')} pcs
            </h3>
          </div>
          <div className="w-10 h-10 bg-blue-50 text-primary rounded-xl flex items-center justify-center text-lg font-bold border border-blue-100 shrink-0">
            🍼
          </div>
        </div>

        {/* Preforms Bags Used */}
        <div className="card-premium flex items-center justify-between p-5">
          <div>
            <p className="text-[10px] font-black text-slate-450 uppercase tracking-widest">Bags Consumed</p>
            <h3 className="text-xl font-extrabold text-slate-800 mt-1.5">
              {summary.totalBagsUsed} bags
            </h3>
          </div>
          <div className="w-10 h-10 bg-amber-50 text-amber-500 rounded-xl flex items-center justify-center text-lg border border-amber-100 shrink-0">
            📦
          </div>
        </div>

        {/* Wastage */}
        <div className="card-premium flex items-center justify-between p-5">
          <div>
            <p className="text-[10px] font-black text-slate-450 uppercase tracking-widest">Total Wastage</p>
            <h3 className="text-xl font-extrabold text-slate-800 mt-1.5">
              {summary.totalWastage.toLocaleString('en-IN')} pcs
            </h3>
          </div>
          <div className="w-10 h-10 bg-red-50 text-red-500 rounded-xl flex items-center justify-center text-lg border border-red-100 shrink-0">
            🗑️
          </div>
        </div>

        {/* Batch Count */}
        <div className="card-premium flex items-center justify-between p-5">
          <div>
            <p className="text-[10px] font-black text-slate-450 uppercase tracking-widest">Total Batches</p>
            <h3 className="text-xl font-extrabold text-slate-800 mt-1.5">
              {summary.totalCount} {summary.totalCount === 1 ? 'Batch' : 'Batches'}
            </h3>
          </div>
          <div className="w-10 h-10 bg-emerald-50 text-emerald-500 rounded-xl flex items-center justify-center text-lg border border-emerald-100 shrink-0">
            📊
          </div>
        </div>
      </div>

      {/* TODAY'S TABLE DATA */}
      <div className="card-premium">
        
        {/* Search header container */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="relative flex-1 max-w-md">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
            <input 
              type="text" 
              placeholder="Search today's production batches..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-premium pl-11 h-10 w-full"
            />
          </div>
          <div className="text-[12px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-3.5 py-1.5 rounded-lg border border-slate-100">
            Today's Batches — {todayDateStr ? formatDateDDMMYYYY(todayDateStr) : formatDateDDMMYYYY(new Date().toISOString().split('T')[0])}
          </div>
        </div>

        {/* Table Listing */}
        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="table table-zebra w-full overflow-hidden">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr className="text-slate-555 text-[11px] font-black uppercase tracking-wider">
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
                  <td colSpan="11" className="py-20 text-center text-slate-400">
                    <span className="loading loading-spinner text-primary block mx-auto mb-2"></span>
                    Loading today's production...
                  </td>
                </tr>
              ) : batches.length === 0 ? (
                <tr>
                  <td colSpan="11" className="py-20 text-center text-slate-400 font-medium italic">
                    {searchQuery ? "No matching batches found for today." : "No production batches logged today."}
                  </td>
                </tr>
              ) : (
                batches.map((b) => (
                  <tr key={b.id} className="hover:bg-blue-50/30 transition-colors">
                    <td className="py-4 px-6 text-[12px] font-mono font-bold text-primary">{b.id}</td>
                    <td className="py-4 px-6 text-[13px] font-medium text-slate-550">{formatDateDDMMYYYY(b.batch_date)}</td>
                    <td className="py-4 px-6 text-[13px] font-bold text-slate-700">{b.product_name}</td>
                    <td className="py-4 px-6 text-[13px] font-semibold text-slate-605">{b.preform_name}g</td>
                    <td className="py-4 px-6 text-[13px] font-semibold text-slate-650">{b.bags_used}</td>
                    <td className="py-4 px-6 text-[13px] text-slate-600">
                      {b.start_time || '—'} to {b.stop_time || '—'}
                    </td>
                    <td className="py-4 px-6 text-[13px] font-black text-slate-800">{parseFloat(b.actual_reading).toLocaleString('en-IN')}</td>
                    <td className="py-4 px-6 text-[13px] text-slate-500">{parseFloat(b.expected_reading).toLocaleString('en-IN')}</td>
                    <td className="py-4 px-6 text-[13px] font-bold text-slate-600">{parseFloat(b.difference_val).toLocaleString('en-IN')}</td>
                    <td className="py-4 px-6 text-[13px] text-slate-500">{b.wastage || '—'}</td>
                    <td className="py-4 px-6">
                      <div className="flex justify-center gap-2">
                        <button
                          onClick={() => handleOpenForm(b)}
                          className="btn btn-ghost btn-xs text-primary hover:bg-primary/10 rounded-lg px-2"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => confirmDelete(b.id)}
                          className="btn btn-ghost btn-xs text-red-500 hover:bg-red-50 rounded-lg px-2"
                        >
                          Delete
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

      {/* ADD PRODUCTION MODAL */}
      {isFormModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm pointer-events-auto">
          <div className="bg-white rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.2)] border border-slate-200 w-[650px] max-h-[90vh] h-[640px] flex flex-col overflow-hidden animate-fade-in pointer-events-auto">
            {/* Modal Header */}
            <div className="bg-primary p-7 text-white shrink-0 relative">
              <h3 className="text-2xl font-black italic tracking-tight uppercase">
                {editingBatchId ? 'Edit Production Entry' : 'Add Production Entry'}
              </h3>
              <p className="text-blue-100 text-xs mt-1 font-medium italic opacity-85">
                {editingBatchId ? `Modifying history record: ${editingBatchId}` : 'Log preform consumption and bottle blowing readings'}
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
              <form id="petBottleForm" onSubmit={handleSaveBatch} className="space-y-6">
                
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
                form="petBottleForm"
                disabled={isSaving || isDifferenceNegative}
                className={`btn-premium flex-[2] h-14 text-sm uppercase tracking-wider ${
                  isSaving || isDifferenceNegative
                    ? 'bg-slate-200 text-slate-450 cursor-not-allowed'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-100/30'
                }`}
              >
                {isSaving ? <span className="loading loading-spinner"></span> : (editingBatchId ? 'Update Production' : 'Save Production')}
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

      {/* DELETE CONFIRMATION MODAL */}
      {isDeleteModalOpen && (
        <div className="modal modal-open">
          <div className="modal-box rounded-2xl p-8 max-w-sm border border-slate-200 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="w-14 h-14 bg-red-50 text-red-500 rounded-full flex items-center justify-center text-2xl mx-auto mb-4">
              ⚠️
            </div>
            <h3 className="text-xl font-black text-center text-slate-800">Confirm Deletion</h3>
            <p className="text-center text-slate-505 mt-2 text-sm">
              Are you sure you want to delete production batch record <b>{deletingBatchId}</b>?
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
                className="btn-premium bg-slate-100 text-slate-600 hover:bg-slate-200"
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

export default PetBottle;
