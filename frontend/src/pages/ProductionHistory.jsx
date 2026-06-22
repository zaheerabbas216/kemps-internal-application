import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';

const ProductionHistory = () => {
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

  // Dropdown options
  const [finishedProducts, setFinishedProducts] = useState([]);
  const [rawMaterials, setRawMaterials] = useState([]);

  // Modal states
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [deletingBatch, setDeletingBatch] = useState(null);
  const [viewingBatch, setViewingBatch] = useState(null);
  const [viewingBatchMaterials, setViewingBatchMaterials] = useState([]);
  const [editingBatchId, setEditingBatchId] = useState(null);

  // Edit form states
  const [batchInfo, setBatchInfo] = useState({
    productionDate: '',
    productId: '',
    productionBoxes: '',
    bottlesPerBox: '',
    batchNo: '',
    mfgDate: '',
    expiryDate: '',
    startTime: '',
    endTime: '',
    inkQty: '0',
    solventQty: '0'
  });
  const [materialsUsed, setMaterialsUsed] = useState([]);

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
      const fpRes = await api.get('/finished-products', { params: { limit: 100 } });
      const rmRes = await api.get('/raw-materials', { params: { limit: 200 } });
      if (fpRes.data.ok) setFinishedProducts(fpRes.data.products || []);
      if (rmRes.data.ok) setRawMaterials(rmRes.data.materials || []);
    } catch (err) {
      console.error('Failed to load dropdowns:', err);
    }
  };

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const res = await api.get('/production', {
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

  const calculateExpiryDate = (mfgDateStr) => {
    if (!mfgDateStr) return '';
    const date = new Date(mfgDateStr);
    date.setMonth(date.getMonth() + 6);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const handleOpenEdit = async (batch) => {
    setFormError('');
    setFormSuccess('');
    setEditingBatchId(batch.id);

    try {
      const res = await api.get(`/production/${batch.id}`);
      if (res.data.ok) {
        const b = res.data.batch;
        setBatchInfo({
          productionDate: b.production_date,
          productId: b.finished_product_id,
          productionBoxes: b.production_boxes,
          bottlesPerBox: b.bottles_per_box,
          batchNo: b.batch_no || '',
          mfgDate: b.mfg_date,
          expiryDate: b.expiry_date,
          startTime: b.start_time || '',
          endTime: b.end_time || '',
          inkQty: b.ink_qty,
          solventQty: b.solvent_qty
        });

        // Load materials
        const items = res.data.materials.map(m => ({
          id: Math.random().toString(36).substr(2, 9),
          rawMaterialId: m.raw_material_id,
          quantity: m.quantity,
          wastage: m.wastage,
          category_name: m.category_name,
          unit: m.unit
        }));
        setMaterialsUsed(items);
        setIsFormModalOpen(true);
      } else {
        alert(res.data.error || 'Failed to fetch batch data.');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to load batch.');
    }
  };

  const handleCloseForm = () => {
    setIsFormModalOpen(false);
    setEditingBatchId(null);
  };

  const handleInfoChange = (e) => {
    const { name, value } = e.target;
    setBatchInfo(prev => {
      const updated = { ...prev, [name]: value };
      if (name === 'mfgDate') {
        updated.expiryDate = calculateExpiryDate(value);
      }
      return updated;
    });
  };

  const handleAddMaterialRow = () => {
    const newRow = {
      id: Math.random().toString(36).substr(2, 9),
      rawMaterialId: '',
      quantity: '0',
      wastage: '0',
      category_name: '',
      unit: ''
    };
    setMaterialsUsed(prev => [...prev, newRow]);
  };

  const handleRemoveMaterialRow = (rowId) => {
    setMaterialsUsed(prev => prev.filter(m => m.id !== rowId));
  };

  const handleMaterialRowChange = (rowId, e) => {
    const { name, value } = e.target;
    setMaterialsUsed(prev =>
      prev.map(row => {
        if (row.id === rowId) {
          const updatedRow = { ...row, [name]: value };
          if (name === 'rawMaterialId') {
            const selected = rawMaterials.find(m => m.id === parseInt(value, 10));
            if (selected) {
              updatedRow.category_name = selected.category_name || '';
              updatedRow.unit = selected.unit || '';
            } else {
              updatedRow.category_name = '';
              updatedRow.unit = '';
            }
          }
          return updatedRow;
        }
        return row;
      })
    );
  };

  const isAutoCalculatedCategory = (catName) => {
    if (!catName) return false;
    const cat = catName.toLowerCase().trim();
    return cat === 'caps' || cat === 'labels' || cat === 'bottles' || cat === 'handles';
  };

  const getRowQuantity = (row) => {
    if (isAutoCalculatedCategory(row.category_name)) {
      const boxes = parseInt(batchInfo.productionBoxes, 10) || 0;
      const perBox = parseInt(batchInfo.bottlesPerBox, 10) || 0;
      return boxes * perBox;
    }
    return parseFloat(row.quantity) || 0;
  };

  const handleSaveBatch = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    const { productionDate, productId, productionBoxes, bottlesPerBox, mfgDate, expiryDate } = batchInfo;

    if (!productionDate) return setFormError('Production Date is required.');
    if (!productId) return setFormError('Product is required.');
    if (parseInt(productionBoxes, 10) <= 0) return setFormError('Boxes must be greater than 0.');
    if (parseInt(bottlesPerBox, 10) <= 0) return setFormError('Bottles per box must be greater than 0.');
    if (!mfgDate) return setFormError('MFG Date is required.');
    if (!expiryDate) return setFormError('Expiry Date is required.');

    const materialsPayload = [];
    for (const row of materialsUsed) {
      if (!row.rawMaterialId) {
        return setFormError('Please select a raw material for all rows or remove empty rows.');
      }
      const qty = getRowQuantity(row);
      const wastageVal = parseFloat(row.wastage) || 0;

      materialsPayload.push({
        rawMaterialId: parseInt(row.rawMaterialId, 10),
        quantity: qty,
        wastage: wastageVal
      });
    }

    setIsSaving(true);
    try {
      const payload = {
        productionDate,
        productId: parseInt(productId, 10),
        productionBoxes: parseInt(productionBoxes, 10),
        bottlesPerBox: parseInt(bottlesPerBox, 10),
        batchNo: batchInfo.batchNo,
        mfgDate,
        expiryDate,
        startTime: batchInfo.startTime,
        endTime: batchInfo.endTime,
        inkQty: parseFloat(batchInfo.inkQty) || 0,
        solventQty: parseFloat(batchInfo.solventQty) || 0,
        materialsUsed: materialsPayload
      };

      const res = await api.put(`/production/${editingBatchId}`, payload);

      if (res.data.ok) {
        setFormSuccess('Production run updated successfully!');
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

  const confirmDelete = (batch) => {
    setDeletingBatch(batch);
    setIsDeleteModalOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingBatch) return;
    try {
      const res = await api.delete(`/production/${deletingBatch.id}`);
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

  const handleOpenView = async (batch) => {
    try {
      const res = await api.get(`/production/${batch.id}`);
      if (res.data.ok) {
        setViewingBatch(res.data.batch);
        setViewingBatchMaterials(res.data.materials || []);
        setIsViewModalOpen(true);
      } else {
        alert(res.data.error || 'Failed to fetch batch details.');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to load details.');
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

  // PDF EXPORT
  const handleExportPDF = () => {
    if (batches.length === 0) {
      alert('No data available to print.');
      return;
    }

    const printWindow = window.open('', '_blank');
    const html = `
      <html>
        <head>
          <title>Production Registry Report</title>
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
              <p>Finished Goods Production History Ledger</p>
            </div>
            <div class="date-badge">Generated: ${new Date().toLocaleDateString('en-GB')}</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Batch ID</th>
                <th>Date</th>
                <th>Product</th>
                <th>Boxes</th>
                <th>Bottles/Box</th>
                <th>Total Bottles (pcs)</th>
                <th>Batch No</th>
                <th>MFG Date</th>
                <th>Expiry Date</th>
              </tr>
            </thead>
            <tbody>
              ${batches.map(b => `
                <tr>
                  <td class="mono">${b.id}</td>
                  <td>${formatDateDDMMYYYY(b.production_date)}</td>
                  <td style="font-weight: 600;">${b.product_name}</td>
                  <td>${b.production_boxes}</td>
                  <td>${b.bottles_per_box}</td>
                  <td class="amount">${(b.production_boxes * b.bottles_per_box).toLocaleString('en-IN')}</td>
                  <td>${b.batch_no || '—'}</td>
                  <td>${formatDateDDMMYYYY(b.mfg_date)}</td>
                  <td>${formatDateDDMMYYYY(b.expiry_date)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="summary-box">
            <span>Total Records Printed: ${batches.length}</span>
            <span>Total Production: ${batches.reduce((sum, b) => sum + (b.production_boxes * b.bottles_per_box), 0).toLocaleString('en-IN')} bottles</span>
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
            onClick={() => navigate('/production-form')}
            className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-650 hover:bg-slate-50 transition-all font-bold text-sm shadow-sm flex items-center gap-1.5 mb-2"
          >
            ← Back
          </button>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase">PRODUCTION HISTORY</h1>
          <p className="text-slate-500 text-sm font-medium mt-1">View and audit all historical Production runs</p>
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
              placeholder="Search by ID, product name, batch no..."
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
                <th className="py-4 px-6 text-left">Boxes</th>
                <th className="py-4 px-6 text-left">Bottles/Box</th>
                <th className="py-4 px-6 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr>
                  <td colSpan="6" className="py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                       <span className="loading loading-spinner text-primary"></span>
                       <span className="text-slate-400 text-sm font-medium">Fetching history ledger...</span>
                    </div>
                  </td>
                </tr>
              ) : batches.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-20 text-center text-slate-400 font-medium italic">
                    No production batch records matching the criteria.
                  </td>
                </tr>
              ) : (
                batches.map((b) => (
                  <tr key={b.id} className="hover:bg-blue-50/30 transition-colors group">
                    <td className="py-4 px-6 text-[13px] font-mono font-bold text-primary">{b.id}</td>
                    <td className="py-4 px-6 text-[13px] font-medium text-slate-550">{formatDateDDMMYYYY(b.production_date)}</td>
                    <td className="py-4 px-6 text-[13px] font-bold text-slate-700 truncate max-w-[180px]" title={b.product_name}>{b.product_name}</td>
                    <td className="py-4 px-6 text-[13px] font-semibold text-slate-650">{b.production_boxes}</td>
                    <td className="py-4 px-6 text-[13px] font-semibold text-slate-650">{b.bottles_per_box}</td>
                    <td className="py-4 px-6">
                      <div className="flex items-center justify-center gap-2">
                        <button 
                          onClick={() => handleOpenView(b)}
                          className="btn btn-ghost btn-xs text-slate-505 hover:bg-slate-100 rounded-lg px-2"
                        >
                          View
                        </button>
                        {isTodayBatch(b.production_date) && (
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
          <div className="bg-white rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.2)] border border-slate-200 w-[650px] h-[90vh] flex flex-col overflow-hidden animate-fade-in pointer-events-auto">
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
              <form id="prodHistoryForm" onSubmit={handleSaveBatch} className="space-y-6">
                
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
                        name="productionDate"
                        value={batchInfo.productionDate}
                        onChange={handleInfoChange}
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
                        value={batchInfo.productId}
                        onChange={handleInfoChange}
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                        required
                      >
                        <option value="">Select Product</option>
                        {finishedProducts.map(fp => (
                          <option key={fp.id} value={fp.id}>{fp.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Boxes */}
                    <div className="space-y-1.5">
                      <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                        Production Boxes *
                      </label>
                      <input 
                        type="number"
                        name="productionBoxes"
                        value={batchInfo.productionBoxes}
                        onChange={handleInfoChange}
                        placeholder="0"
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                        required
                      />
                    </div>

                    {/* Bottles / Box */}
                    <div className="space-y-1.5">
                      <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                        Bottles per Box *
                      </label>
                      <input 
                        type="number"
                        name="bottlesPerBox"
                        value={batchInfo.bottlesPerBox}
                        onChange={handleInfoChange}
                        placeholder="0"
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                        required
                      />
                    </div>

                    {/* Batch No */}
                    <div className="space-y-1.5">
                      <label className="text-[12px] font-bold text-slate-550 block uppercase tracking-wider">
                        Batch No
                      </label>
                      <input 
                        type="text"
                        name="batchNo"
                        value={batchInfo.batchNo}
                        onChange={handleInfoChange}
                        placeholder="e.g. B-2026-001"
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                      />
                    </div>

                    {/* MFG Date */}
                    <div className="space-y-1.5">
                      <label className="text-[12px] font-bold text-slate-550 block uppercase tracking-wider">
                        MFG Date
                      </label>
                      <input 
                        type="date"
                        name="mfgDate"
                        value={batchInfo.mfgDate}
                        onChange={handleInfoChange}
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                      />
                    </div>

                    {/* Expiry Date */}
                    <div className="space-y-1.5">
                      <label className="text-[12px] font-bold text-slate-550 block uppercase tracking-wider">
                        Expiry Date
                      </label>
                      <input 
                        type="date"
                        name="expiryDate"
                        value={batchInfo.expiryDate}
                        readOnly
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-slate-50 text-slate-500 outline-none text-sm font-semibold cursor-not-allowed"
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
                        value={batchInfo.startTime}
                        onChange={handleInfoChange}
                        placeholder="e.g. 10:00 AM"
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                      />
                    </div>

                    {/* End Time */}
                    <div className="space-y-1.5 col-span-1 md:col-span-2">
                      <label className="text-[12px] font-bold text-slate-555 block uppercase tracking-wider">
                        End Time
                      </label>
                      <input 
                        type="text"
                        name="endTime"
                        value={batchInfo.endTime}
                        onChange={handleInfoChange}
                        placeholder="e.g. 06:00 PM"
                        className="w-full h-11 md:w-[calc(50%-8px)] px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                      />
                    </div>
                  </div>
                </div>

                {/* 2. MATERIAL USAGE */}
                <div className="border border-slate-200/80 rounded-2xl bg-white p-5 space-y-4">
                  <div className="flex justify-between items-center border-b border-slate-100 pb-2.5">
                    <div className="text-[11px] font-black text-slate-450 uppercase tracking-widest flex items-center gap-1.5">
                      <span>📦</span> MATERIAL USAGE
                    </div>
                    <button
                      type="button"
                      onClick={handleAddMaterialRow}
                      className="px-3 py-1 rounded-lg border border-primary/20 text-primary bg-primary/5 hover:bg-primary hover:text-white transition-all text-xs font-bold"
                    >
                      + Add Raw Material Used
                    </button>
                  </div>

                  <div className="space-y-3">
                    {materialsUsed.map((row, index) => {
                      const isAuto = isAutoCalculatedCategory(row.category_name);
                      const computedQty = getRowQuantity(row);

                      return (
                        <div key={row.id} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end bg-slate-50/45 border border-slate-100 p-4 rounded-2xl">
                          <div className="md:col-span-5 space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase block">
                              Material #{index + 1}
                            </label>
                            <select
                              name="rawMaterialId"
                              value={row.rawMaterialId}
                              onChange={(e) => handleMaterialRowChange(row.id, e)}
                              className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                            >
                              <option value="">Select Material</option>
                              {rawMaterials.map(rm => (
                                <option key={rm.id} value={rm.id}>
                                  {rm.sub_product_name} ({rm.category_name})
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="md:col-span-3 space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase block">
                              Qty {row.unit ? `(${row.unit})` : ''}
                            </label>
                            {isAuto ? (
                              <input 
                                type="text"
                                value={`${computedQty} (Auto)`}
                                readOnly
                                className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-slate-100 text-slate-500 font-bold outline-none text-sm cursor-not-allowed"
                              />
                            ) : (
                              <input 
                                type="number"
                                name="quantity"
                                value={row.quantity}
                                onChange={(e) => handleMaterialRowChange(row.id, e)}
                                placeholder="Qty"
                                className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                              />
                            )}
                          </div>

                          <div className="md:col-span-3 space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase block">
                              Wastage
                            </label>
                            <input 
                              type="number"
                              name="wastage"
                              value={row.wastage}
                              onChange={(e) => handleMaterialRowChange(row.id, e)}
                              placeholder="Wastage"
                              className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                            />
                          </div>

                          <div className="md:col-span-1 flex justify-center pb-1">
                            <button
                              type="button"
                              onClick={() => handleRemoveMaterialRow(row.id)}
                              className="w-9 h-9 rounded-xl bg-white border border-slate-200 hover:border-red-200 hover:bg-red-50 hover:text-red-500 text-slate-450 transition-all flex items-center justify-center font-bold"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {materialsUsed.length === 0 && (
                      <div className="py-8 border border-dashed border-slate-200 rounded-2xl bg-slate-50/20 text-center text-slate-400 font-semibold text-xs">
                        No materials added.
                      </div>
                    )}
                  </div>

                  {/* Ink & Solvent */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-slate-100 pt-6 mt-4">
                    <div className="space-y-1.5">
                      <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                        Ink Qty
                      </label>
                      <input 
                        type="number"
                        step="0.01"
                        name="inkQty"
                        value={batchInfo.inkQty}
                        onChange={handleInfoChange}
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                        Solvent Qty
                      </label>
                      <input 
                        type="number"
                        step="0.01"
                        name="solventQty"
                        value={batchInfo.solventQty}
                        onChange={handleInfoChange}
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                      />
                    </div>
                  </div>
                </div>

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

            {/* Modal Footer */}
            <div className="p-8 border-t border-slate-100 bg-white flex gap-4 shrink-0 shadow-[0_-10px_30px_rgba(0,0,0,0.02)]">
              <button 
                type="submit" 
                form="prodHistoryForm"
                disabled={isSaving}
                className="btn-premium btn-primary-premium flex-[2] h-14 text-sm font-bold uppercase tracking-wider"
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
          <div className="bg-white rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.2)] border border-slate-200 w-[600px] max-h-[90vh] flex flex-col overflow-hidden animate-fade-in pointer-events-auto">
            <div className="bg-[#0b1324] p-7 text-white shrink-0 relative">
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-1.5">
                <span>📋</span> Production Details
              </h3>
              <p className="text-slate-450 text-xs font-mono">{viewingBatch.id}</p>
              <button 
                onClick={() => setIsViewModalOpen(false)}
                className="absolute right-7 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-slate-55 flex items-center justify-center text-slate-505 hover:bg-slate-100 transition-all font-bold"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-6">
              <div className="space-y-3">
                <div className="text-[10px] font-black text-slate-450 uppercase tracking-widest border-b border-slate-100 pb-1.5">
                  Batch Information
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm font-medium">
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-400 text-xs uppercase tracking-wider">Date</span>
                    <span className="text-slate-800">{formatDateDDMMYYYY(viewingBatch.production_date)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-400 text-xs uppercase tracking-wider">Product</span>
                    <span className="text-slate-800 font-bold">{viewingBatch.product_name}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-400 text-xs uppercase tracking-wider">Boxes</span>
                    <span className="text-slate-805">{viewingBatch.production_boxes} boxes</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-400 text-xs uppercase tracking-wider">Bottles / Box</span>
                    <span className="text-slate-805">{viewingBatch.bottles_per_box} pcs</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-400 text-xs uppercase tracking-wider">Batch No</span>
                    <span className="text-slate-805">{viewingBatch.batch_no || '—'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-400 text-xs uppercase tracking-wider">MFG Date</span>
                    <span className="text-slate-805">{formatDateDDMMYYYY(viewingBatch.mfg_date)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-400 text-xs uppercase tracking-wider">Expiry Date</span>
                    <span className="text-slate-850">{formatDateDDMMYYYY(viewingBatch.expiry_date)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-400 text-xs uppercase tracking-wider">Timing</span>
                    <span className="text-slate-805">
                      {viewingBatch.start_time || '—'} to {viewingBatch.end_time || '—'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="text-[10px] font-black text-slate-450 uppercase tracking-widest border-b border-slate-100 pb-1.5">
                  Raw Materials Consumed
                </div>
                <div className="overflow-hidden border border-slate-100 rounded-xl">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-100">
                        <th className="py-2.5 px-4">Material</th>
                        <th className="py-2.5 px-4 text-right">Quantity</th>
                        <th className="py-2.5 px-4 text-right">Wastage</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 text-xs font-medium text-slate-705">
                      {viewingBatchMaterials.map(m => (
                        <tr key={m.id}>
                          <td className="py-2 px-4">
                            <div>{m.sub_product_name}</div>
                            <div className="text-[9px] text-slate-400">{m.category_name}</div>
                          </td>
                          <td className="py-2 px-4 text-right font-bold">{m.quantity} {m.unit}</td>
                          <td className="py-2 px-4 text-right text-slate-500">{m.wastage || 0} {m.unit}</td>
                        </tr>
                      ))}
                      {viewingBatchMaterials.length === 0 && (
                        <tr>
                          <td colSpan="3" className="py-4 text-center text-slate-400 italic">
                            No materials recorded.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-3">
                <div className="text-[10px] font-black text-slate-450 uppercase tracking-widest border-b border-slate-100 pb-1.5">
                  Consumables
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm font-medium">
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-400 text-xs uppercase tracking-wider">Ink Qty</span>
                    <span className="text-slate-805 font-bold">{viewingBatch.ink_qty}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-400 text-xs uppercase tracking-wider">Solvent Qty</span>
                    <span className="text-slate-805 font-bold">{viewingBatch.solvent_qty}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex p-7 gap-2">
              <button 
                onClick={() => setIsViewModalOpen(false)}
                className="btn-premium bg-slate-50 hover:bg-slate-100 text-slate-650 border border-slate-200 w-full h-12 text-xs uppercase font-bold"
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
          <div className="modal-box rounded-2xl p-8 max-w-sm border border-slate-200 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="w-14 h-14 bg-red-50 text-red-500 rounded-full flex items-center justify-center text-2xl mx-auto mb-4">
              ⚠️
            </div>
            <h3 className="text-xl font-black text-center text-slate-800">Confirm Deletion</h3>
            <p className="text-center text-slate-505 mt-2 text-sm">
              Are you sure you want to delete production batch record <b>{deletingBatch?.id}</b>?
              <br/>This will reverse all product additions and raw materials consumption transactions in the stock register.
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

export default ProductionHistory;
