import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import SearchableSelect from '../components/SearchableSelect';


const SearchableRawMaterialDropdown = ({ selectedId, onChange, rawMaterials, ledgerStocks = {} }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [collapsedCategories, setCollapsedCategories] = useState({});
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedMaterial = rawMaterials.find(m => m.id === parseInt(selectedId, 10));

  // Filter raw materials based on search term
  const filteredMaterials = rawMaterials.filter(m => {
    const search = searchTerm.toLowerCase().trim();
    if (!search) return true;
    return (
      m.sub_product_name.toLowerCase().includes(search) ||
      m.category_name.toLowerCase().includes(search)
    );
  });

  // Group raw materials by category
  const groups = {};
  filteredMaterials.forEach(m => {
    const cat = m.category_name || 'Others';
    if (!groups[cat]) {
      groups[cat] = [];
    }
    groups[cat].push(m);
  });

  // Sort groups alphabetically by category name
  const sortedCategories = Object.keys(groups).sort();

  // Sort materials alphabetically by sub_product_name within each category
  sortedCategories.forEach(cat => {
    groups[cat].sort((a, b) => a.sub_product_name.localeCompare(b.sub_product_name));
  });

  const toggleCategory = (cat) => {
    setCollapsedCategories(prev => ({
      ...prev,
      [cat]: !prev[cat]
    }));
  };

  const getStockString = (m) => {
    const key = `${m.id}-${m.unit}`;
    const stock = ledgerStocks[key];
    if (stock === undefined || stock === null) return 'Stock: —';
    return `Stock: ${parseFloat(stock.toFixed(2)).toLocaleString('en-IN')} ${m.unit}`;
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

  return (
    <div className="relative w-full" ref={dropdownRef}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium flex items-center justify-between shadow-sm"
      >
        <span className="truncate">
          {selectedMaterial ? (
            `${selectedMaterial.sub_product_name} (${selectedMaterial.category_name}) — ${getStockString(selectedMaterial)}`
          ) : (
            <span className="text-slate-400">Select Material</span>
          )}
        </span>
        <span className="text-slate-450 text-xs">{isOpen ? '▲' : '▼'}</span>
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div className="absolute left-0 right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-xl z-[9999] overflow-hidden flex flex-col max-h-[350px]">
          {/* Search box */}
          <div className="p-2 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
            <span className="text-slate-400 text-sm pl-2">🔍</span>
            <input
              type="text"
              placeholder="Search by material or category..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-9 bg-transparent text-sm text-slate-700 outline-none placeholder-slate-400"
              autoFocus
            />
          </div>

          {/* List area */}
          <div className="overflow-y-auto flex-1 p-2 space-y-3">
            {sortedCategories.length === 0 ? (
              <div className="py-6 text-center text-slate-400 text-xs italic">
                No materials found matching "{searchTerm}"
              </div>
            ) : (
              sortedCategories.map(cat => {
                const items = groups[cat];
                const isCollapsed = !!collapsedCategories[cat];
                return (
                  <div key={cat} className="space-y-1">
                    {/* Category Header */}
                    <button
                      type="button"
                      onClick={() => toggleCategory(cat)}
                      className="w-full flex items-center justify-between px-2.5 py-1 text-left text-xs font-black text-slate-500 uppercase tracking-wider hover:bg-slate-100 rounded-lg transition-colors"
                    >
                      <span className="flex items-center gap-1.5">
                        <span>{getCategoryEmoji(cat)}</span> {cat} ({items.length} {items.length === 1 ? 'Item' : 'Items'})
                      </span>
                      <span>{isCollapsed ? '▼' : '▲'}</span>
                    </button>

                    {/* Category Items */}
                    {!isCollapsed && (
                      <div className="space-y-0.5 pl-2">
                        {items.map(m => {
                          const isSelected = m.id === parseInt(selectedId, 10);
                          return (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => {
                                onChange(m.id);
                                setIsOpen(false);
                              }}
                              className={`w-full text-left px-3 py-2 text-sm rounded-xl transition-all flex justify-between items-center ${
                                isSelected
                                  ? 'bg-primary/10 text-primary font-bold shadow-sm'
                                  : 'text-slate-750 hover:bg-slate-50'
                              }`}
                            >
                              <span className="truncate pr-4">
                                {m.sub_product_name} ({m.unit})
                              </span>
                              <span className={`text-xs ${isSelected ? 'text-primary' : 'text-slate-450'} font-semibold shrink-0`}>
                                {getStockString(m)}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};


const Production = () => {
  const navigate = useNavigate();

  // Data states
  const [batches, setBatches] = useState([]);
  const [summary, setSummary] = useState({
    totalBoxes: 0,
    totalBottles: 0,
    totalRuns: 0
  });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [todayDateStr, setTodayDateStr] = useState('');

  // Dropdown options
  const [finishedProducts, setFinishedProducts] = useState([]);
  const [rawMaterials, setRawMaterials] = useState([]);

  // Toggled form view
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingBatchId, setEditingBatchId] = useState(null);

  // Modal states
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [deletingBatchId, setDeletingBatchId] = useState(null);
  const [viewingBatch, setViewingBatch] = useState(null);
  const [viewingBatchMaterials, setViewingBatchMaterials] = useState([]);

  // Form states
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
  const [materialsUsed, setMaterialsUsed] = useState([]); // Array of { id, rawMaterialId, quantity, wastage }

  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [ledgerStocks, setLedgerStocks] = useState({});

  useEffect(() => {
    const fetchLedgerStocks = async () => {
      if (!batchInfo.productionDate) {
        setLedgerStocks({});
        return;
      }
      try {
        const res = await api.get('/raw-material-ledger/day', {
          params: { date: batchInfo.productionDate }
        });
        if (res.data.ok) {
          const stocks = {};
          (res.data.items || []).forEach(item => {
            const key = `${item.raw_material_id}-${item.unit}`;
            stocks[key] = item.closing_stock;
          });
          setLedgerStocks(stocks);
        }
      } catch (err) {
        console.error('Failed to fetch ledger stocks for production date:', err);
      }
    };

    fetchLedgerStocks();
  }, [batchInfo.productionDate]);

  useEffect(() => {
    fetchTodayBatches();
    fetchDropdowns();
  }, [searchQuery]);

  const fetchTodayBatches = async () => {
    try {
      setLoading(true);
      const res = await api.get('/production/today', {
        params: { search: searchQuery }
      });
      if (res.data.ok) {
        setBatches(res.data.batches || []);
        setSummary(res.data.summary || { totalBoxes: 0, totalBottles: 0, totalRuns: 0 });
        if (res.data.todayStr) {
          setTodayDateStr(res.data.todayStr);
        }
      }
    } catch (err) {
      console.error('Failed to fetch today\'s production runs:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchDropdowns = async () => {
    try {
      const fpRes = await api.get('/finished-products', { params: { limit: 100 } });
      const rmRes = await api.get('/raw-materials', { params: { limit: 500 } });
      if (fpRes.data.ok) setFinishedProducts(fpRes.data.products || []);
      if (rmRes.data.ok) setRawMaterials(rmRes.data.materials || []);
    } catch (err) {
      console.error('Failed to fetch dropdown products:', err);
    }
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

  const handleOpenAdd = () => {
    setFormError('');
    setFormSuccess('');
    setEditingBatchId(null);

    // Get today formatted
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const istDate = new Date(now.getTime() + (330 + offset) * 60000);
    const yyyy = istDate.getFullYear();
    const mm = String(istDate.getMonth() + 1).padStart(2, '0');
    const dd = String(istDate.getDate()).padStart(2, '0');
    const todayFormatted = `${yyyy}-${mm}-${dd}`;

    setBatchInfo({
      productionDate: todayFormatted,
      productId: '',
      productionBoxes: '',
      bottlesPerBox: '',
      batchNo: '',
      mfgDate: todayFormatted,
      expiryDate: calculateExpiryDate(todayFormatted),
      startTime: '',
      endTime: '',
      inkQty: '0',
      solventQty: '0'
    });
    setMaterialsUsed([]);
    setIsFormOpen(true);
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
        setIsFormOpen(true);
      } else {
        alert(res.data.error || 'Failed to fetch batch data.');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to load batch detail.');
    }
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
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

  const handleSave = async (e) => {
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

    // Build payload materialsUsed
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

      let res;
      if (editingBatchId) {
        res = await api.put(`/production/${editingBatchId}`, payload);
      } else {
        res = await api.post('/production', payload);
      }

      if (res.data.ok) {
        setFormSuccess(editingBatchId ? 'Production run updated successfully!' : 'Production run recorded successfully!');
        setTimeout(() => {
          handleCloseForm();
          fetchTodayBatches();
        }, 1000);
      } else {
        setFormError(res.data.error || 'Failed to save production batch.');
      }
    } catch (err) {
      setFormError(err.response?.data?.error || err.message || 'An error occurred.');
    } finally {
      setIsSaving(false);
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
        alert(res.data.error || 'Failed to fetch batch data.');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to retrieve batch details.');
    }
  };

  const confirmDelete = (batchId) => {
    setDeletingBatchId(batchId);
    setIsDeleteModalOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingBatchId) return;
    try {
      const res = await api.delete(`/production/${deletingBatchId}`);
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
    <>
      {isFormOpen ? (
        <div className="space-y-6 animate-fade-in max-w-4xl mx-auto pb-12">
          {/* Back button */}
          <div className="flex justify-start">
            <button 
              type="button"
              onClick={handleCloseForm}
              className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
            >
              <span>←</span> Back
            </button>
          </div>

          {/* Heading */}
          <div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase">
              {editingBatchId ? 'EDIT PRODUCTION FORM' : 'PRODUCTION FORM'}
            </h1>
            <p className="text-slate-500 text-xs font-semibold mt-1">Log daily production batch details</p>
          </div>

          {/* Form Body */}
          <form onSubmit={handleSave} className="space-y-6">
            
            {/* BATCH INFORMATION */}
            <div className="border border-slate-200/80 rounded-2xl bg-white p-5 space-y-4 shadow-sm">
              <div className="text-[11px] font-black text-slate-450 uppercase tracking-widest border-b border-slate-100 pb-2.5 flex items-center gap-1.5">
                <span>🏭</span> BATCH INFORMATION
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Production Date */}
                <div className="space-y-1.5">
                  <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                    Production Date *
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

                {/* Product */}
                <div className="space-y-1.5">
                  <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                    Product *
                  </label>
                  <SearchableSelect
                    options={finishedProducts.map(fp => ({ value: fp.id, label: fp.name }))}
                    value={batchInfo.productId}
                    onChange={(val) => setBatchInfo(prev => ({ ...prev, productId: val }))}
                    placeholder="Select Product"
                    searchPlaceholder="Search product..."
                  />
                </div>

                {/* Production Boxes */}
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

                {/* Bottles per Box */}
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
                  <span className="text-[10px] font-bold text-slate-450 mt-1 block">
                    Auto calculated as 6 months from MFG Date
                  </span>
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
                  <label className="text-[12px] font-bold text-slate-550 block uppercase tracking-wider">
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

            {/* MATERIAL USAGE */}
            <div className="border border-slate-200/80 rounded-2xl bg-white p-5 space-y-4 shadow-sm">
              <div className="flex justify-between items-center border-b border-slate-100 pb-2.5">
                <div className="text-[11px] font-black text-slate-450 uppercase tracking-widest flex items-center gap-1.5">
                  <span>📦</span> MATERIAL USAGE
                </div>
                <button
                  type="button"
                  onClick={handleAddMaterialRow}
                  className="px-3.5 py-1.5 rounded-lg border border-primary/20 text-primary bg-primary/5 hover:bg-primary hover:text-white transition-all text-xs font-bold"
                >
                  + Add Raw Material Used
                </button>
              </div>

              <p className="text-[11px] font-semibold text-slate-450 italic">
                Qty is auto-calculated from Boxes × Bottles per Box (only for Caps, Labels, Bottles, and Handles)
              </p>

              {/* Dynamic Material Rows */}
              <div className="space-y-3">
                {materialsUsed.map((row, index) => {
                  const isAuto = isAutoCalculatedCategory(row.category_name);
                  const computedQty = getRowQuantity(row);

                  return (
                    <div key={row.id} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end bg-slate-50/40 border border-slate-100 p-4 rounded-2xl relative group">
                      
                      {/* Material Dropdown */}
                      <div className="md:col-span-5 space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
                          Material #{index + 1}
                        </label>
                        <SearchableRawMaterialDropdown
                          selectedId={row.rawMaterialId}
                          onChange={(val) => handleMaterialRowChange(row.id, { target: { name: 'rawMaterialId', value: val } })}
                          rawMaterials={rawMaterials}
                          ledgerStocks={ledgerStocks}
                        />
                      </div>

                      {/* Qty field */}
                      <div className="md:col-span-3 space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
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
                            placeholder="Enter qty"
                            className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                          />
                        )}
                      </div>

                      {/* Wastage field */}
                      <div className="md:col-span-3 space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
                          Wastage {row.unit ? `(${row.unit})` : ''}
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

                      {/* Remove button */}
                      <div className="md:col-span-1 flex justify-center pb-1">
                        <button
                          type="button"
                          onClick={() => handleRemoveMaterialRow(row.id)}
                          className="w-9 h-9 rounded-xl bg-white border border-slate-200 hover:border-red-200 hover:bg-red-50 hover:text-red-500 text-slate-450 transition-all flex items-center justify-center font-bold text-xs"
                          title="Remove Material"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}

                {materialsUsed.length === 0 && (
                  <div className="py-12 border border-dashed border-slate-200 rounded-2xl bg-slate-50/20 text-center text-slate-400 font-semibold text-xs">
                    No materials added. Click "+ Add Raw Material Used" to dynamically add items.
                  </div>
                )}
              </div>

              {/* Ink & Solvent Manual Quantities */}
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
                    placeholder="0.00"
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
                    placeholder="0.00"
                    className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                  />
                </div>
              </div>
            </div>

            {/* Error/Success Feedbacks */}
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

            {/* Form Action buttons */}
            <div className="flex gap-4 pt-4">
              <button
                type="submit"
                disabled={isSaving}
                className="btn-premium btn-primary-premium flex-[2] h-14 text-sm font-bold uppercase tracking-wider"
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
          </form>
        </div>
      ) : (
        <div className="space-y-6 animate-fade-in max-w-5xl mx-auto pb-12">
          
          {/* HEADER SECTION */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase">PRODUCTION</h1>
              <p className="text-slate-500 text-sm font-medium mt-1">Log final product outputs and automatically calculate material counts</p>
            </div>
            <div className="flex items-center gap-3">
              <button 
                onClick={handleOpenAdd}
                className="btn-premium btn-primary-premium h-12"
              >
                <span className="text-xl">+</span> Add Production
              </button>
              <button 
                onClick={() => navigate('/production-history')}
                className="btn-premium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs px-4 h-12"
              >
                Production History
              </button>
            </div>
          </div>

          {/* STATISTICS CARDS */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Boxes */}
            <div className="card-premium flex items-center justify-between p-5">
              <div>
                <p className="text-[10px] font-black text-slate-450 uppercase tracking-widest">Boxes Produced</p>
                <h3 className="text-xl font-extrabold text-slate-800 mt-1.5">
                  {summary.totalBoxes.toLocaleString('en-IN')} boxes
                </h3>
              </div>
              <div className="w-10 h-10 bg-blue-50 text-primary rounded-xl flex items-center justify-center text-lg border border-blue-100 shrink-0">
                📦
              </div>
            </div>

            {/* Bottles */}
            <div className="card-premium flex items-center justify-between p-5">
              <div>
                <p className="text-[10px] font-black text-slate-450 uppercase tracking-widest">Bottles Blown</p>
                <h3 className="text-xl font-extrabold text-slate-800 mt-1.5">
                  {summary.totalBottles.toLocaleString('en-IN')} pcs
                </h3>
              </div>
              <div className="w-10 h-10 bg-amber-50 text-amber-500 rounded-xl flex items-center justify-center text-lg border border-amber-100 shrink-0">
                🍼
              </div>
            </div>

            {/* Runs count */}
            <div className="card-premium flex items-center justify-between p-5">
              <div>
                <p className="text-[10px] font-black text-slate-450 uppercase tracking-widest">Total Batches</p>
                <h3 className="text-xl font-extrabold text-slate-800 mt-1.5">
                  {summary.totalRuns} {summary.totalRuns === 1 ? 'Run' : 'Runs'}
                </h3>
              </div>
              <div className="w-10 h-10 bg-emerald-50 text-emerald-500 rounded-xl flex items-center justify-center text-lg border border-emerald-100 shrink-0">
                📊
              </div>
            </div>
          </div>

          {/* TODAY'S TABLE DATA */}
          <div className="card-premium">
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
                Today's Production — {todayDateStr ? formatDateDDMMYYYY(todayDateStr) : formatDateDDMMYYYY(new Date().toISOString().split('T')[0])}
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-100">
              <table className="table table-zebra w-full overflow-hidden">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr className="text-slate-500 text-[11px] font-black uppercase tracking-wider">
                    <th className="py-4 px-6 text-left">Batch ID</th>
                    <th className="py-4 px-6 text-left">Date</th>
                    <th className="py-4 px-6 text-left">Product</th>
                    <th className="py-4 px-6 text-left">Production Boxes</th>
                    <th className="py-4 px-6 text-left">Bottles Per Box</th>
                    <th className="py-4 px-6 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {loading ? (
                    <tr>
                      <td colSpan="6" className="py-20 text-center text-slate-400">
                        <span className="loading loading-spinner text-primary block mx-auto mb-2"></span>
                        Loading today's production...
                      </td>
                    </tr>
                  ) : batches.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="py-20 text-center text-slate-400 font-medium italic">
                        {searchQuery ? "No matching batches found for today." : "No production batches logged today."}
                      </td>
                    </tr>
                  ) : (
                    batches.map((b) => (
                      <tr key={b.id} className="hover:bg-blue-50/30 transition-colors">
                        <td className="py-4 px-6 text-[12px] font-mono font-bold text-primary">{b.id}</td>
                        <td className="py-4 px-6 text-[13px] font-medium text-slate-550">{formatDateDDMMYYYY(b.production_date)}</td>
                        <td className="py-4 px-6 text-[13px] font-bold text-slate-700">{b.product_name}</td>
                        <td className="py-4 px-6 text-[13px] font-semibold text-slate-650">{b.production_boxes}</td>
                        <td className="py-4 px-6 text-[13px] font-semibold text-slate-650">{b.bottles_per_box}</td>
                        <td className="py-4 px-6">
                          <div className="flex justify-center gap-2">
                            <button
                              onClick={() => handleOpenView(b)}
                              className="btn btn-ghost btn-xs text-slate-505 hover:bg-slate-100 rounded-lg px-2"
                            >
                              View
                            </button>
                            <button
                              onClick={() => handleOpenEdit(b)}
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
        </div>
      )}

      {/* VIEW DETAILS MODAL */}
      {isViewModalOpen && viewingBatch && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm pointer-events-auto">
          <div className="bg-white rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.2)] border border-slate-200 w-[600px] max-h-[90vh] flex flex-col overflow-hidden animate-fade-in pointer-events-auto">
            {/* Header */}
            <div className="bg-[#0b1324] p-7 text-white shrink-0 relative">
              <h3 className="text-2xl font-black italic tracking-tight uppercase flex items-center gap-2">
                <span>📋</span> Production Details
              </h3>
              <p className="text-slate-400 text-xs mt-1 font-medium italic">
                Registry ID: {viewingBatch.id}
              </p>
              <button 
                onClick={() => setIsViewModalOpen(false)}
                className="absolute right-7 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-all font-bold"
              >
                ✕
              </button>
            </div>

            {/* Scrollable details */}
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-6">
              
              {/* Batch info */}
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
                    <span className="text-slate-800 font-semibold">{viewingBatch.production_boxes} boxes</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-400 text-xs uppercase tracking-wider">Bottles / Box</span>
                    <span className="text-slate-800 font-semibold">{viewingBatch.bottles_per_box} pcs</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-400 text-xs uppercase tracking-wider">Batch No</span>
                    <span className="text-slate-800">{viewingBatch.batch_no || '—'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-400 text-xs uppercase tracking-wider">MFG Date</span>
                    <span className="text-slate-800">{formatDateDDMMYYYY(viewingBatch.mfg_date)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-400 text-xs uppercase tracking-wider">Expiry Date</span>
                    <span className="text-slate-800">{formatDateDDMMYYYY(viewingBatch.expiry_date)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-400 text-xs uppercase tracking-wider">Timing</span>
                    <span className="text-slate-800">
                      {viewingBatch.start_time || '—'} to {viewingBatch.end_time || '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Raw materials */}
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
                            No materials recorded for this run.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Other details */}
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

            {/* Footer */}
            <div className="p-7 border-t border-slate-100 bg-white flex shrink-0">
              <button 
                type="button" 
                onClick={() => setIsViewModalOpen(false)}
                className="btn-premium bg-slate-50 hover:bg-slate-100 text-slate-650 border border-slate-200 w-full h-12 text-xs uppercase font-bold"
              >
                Close View
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
    </>
  );
};

export default Production;
