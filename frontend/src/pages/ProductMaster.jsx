import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';

const ProductMaster = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('finished-products'); // 'finished-products' or 'raw-materials'

  // ==========================================
  // RAW MATERIALS STATE
  // ==========================================
  const [rmCategories, setRmCategories] = useState([]);
  const [rawMaterials, setRawMaterials] = useState([]);
  const [totalRmCount, setTotalRmCount] = useState(0);
  const [loadingRm, setLoadingRm] = useState(true);
  const [searchRmQuery, setSearchRmQuery] = useState('');
  const [currentRmPage, setCurrentRmPage] = useState(1);
  const rmPageLimit = 10;
  
  // Custom pages tracker for grouped categories
  const [rmCurrentPages, setRmCurrentPages] = useState({});

  const [isRmCategoryModalOpen, setIsRmCategoryModalOpen] = useState(false);
  const [newRmCategoryName, setNewRmCategoryName] = useState('');
  const [rmCategoryModalError, setRmCategoryModalError] = useState('');
  const [isSavingRmCategory, setIsSavingRmCategory] = useState(false);

  const [isRmDeleteModalOpen, setIsRmDeleteModalOpen] = useState(false);
  const [deletingRmMaterial, setDeletingRmMaterial] = useState(null);

  // RM Edit Modal State
  const [isRmEditModalOpen, setIsRmEditModalOpen] = useState(false);
  const [editingRmMaterial, setEditingRmMaterial] = useState(null);
  const [rmEditFormData, setRmEditFormData] = useState({
    categoryId: '',
    subProductName: '',
    unit: 'KG',
    qtyInPcPerKg: ''
  });
  const [rmEditModalError, setRmEditModalError] = useState('');
  const [isSavingRmEdit, setIsSavingRmEdit] = useState(false);

  const rmUnitsList = ['PCS', 'BAGS', 'ROLLS', 'QTY', 'KG'];

  const [rmFormData, setRmFormData] = useState({
    categoryId: '',
    subProductName: '',
    unit: 'KG',
    qtyInPcPerKg: ''
  });
  const [rmFormError, setRmFormError] = useState('');
  const [rmFormSuccess, setRmFormSuccess] = useState('');
  const [isAddingRm, setIsAddingRm] = useState(false);

  // ==========================================
  // FINISHED PRODUCTS STATE
  // ==========================================
  const [fpCategories, setFpCategories] = useState([]);
  const [finishedProducts, setFinishedProducts] = useState([]);
  const [totalFpCount, setTotalFpCount] = useState(0);
  const [loadingFp, setLoadingFp] = useState(true);
  const [searchFpQuery, setSearchFpQuery] = useState('');
  const [currentFpPage, setCurrentFpPage] = useState(1);
  const fpPageLimit = 10;

  const [isFpCategoryModalOpen, setIsFpCategoryModalOpen] = useState(false);
  const [newFpCategoryName, setNewFpCategoryName] = useState('');
  const [fpCategoryModalError, setFpCategoryModalError] = useState('');
  const [isSavingFpCategory, setIsSavingFpCategory] = useState(false);

  const [isFpDeleteModalOpen, setIsFpDeleteModalOpen] = useState(false);
  const [deletingFpProduct, setDeletingFpProduct] = useState(null);

  // FP Edit Modal State
  const [isFpEditModalOpen, setIsFpEditModalOpen] = useState(false);
  const [editingFpProduct, setEditingFpProduct] = useState(null);
  const [fpEditFormData, setFpEditFormData] = useState({
    name: '',
    categoryId: ''
  });
  const [fpEditModalError, setFpEditModalError] = useState('');
  const [isSavingFpEdit, setIsSavingFpEdit] = useState(false);

  const [fpFormData, setFpFormData] = useState({
    name: '',
    categoryId: ''
  });
  const [fpFormError, setFpFormError] = useState('');
  const [fpFormSuccess, setFpFormSuccess] = useState('');
  const [isAddingFp, setIsAddingFp] = useState(false);

  // ==========================================
  // EFFECTS / FETCH DATA
  // ==========================================
  useEffect(() => {
    fetchRmCategories();
    fetchFpCategories();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsRmCategoryModalOpen(false);
        setIsFpCategoryModalOpen(false);
        setIsRmDeleteModalOpen(false);
        setDeletingRmMaterial(null);
        setIsRmEditModalOpen(false);
        setEditingRmMaterial(null);
        setIsFpDeleteModalOpen(false);
        setDeletingFpProduct(null);
        setIsFpEditModalOpen(false);
        setEditingFpProduct(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (activeTab === 'raw-materials') {
      fetchRawMaterials();
    } else {
      fetchFinishedProducts();
    }
  }, [activeTab, currentRmPage, searchRmQuery, currentFpPage, searchFpQuery]);

  // --- RM Fetching ---
  const fetchRmCategories = async () => {
    try {
      const res = await api.get('/raw-materials/categories');
      if (res.data.ok) {
        setRmCategories(res.data.categories || []);
      }
    } catch (err) {
      console.error('Failed to fetch RM categories:', err);
    }
  };

  const fetchRawMaterials = async () => {
    try {
      setLoadingRm(true);
      const res = await api.get('/raw-materials', {
        params: {
          page: 1,
          limit: 1000, // Fetch all materials to support frontend grouping
          search: searchRmQuery,
          activeOnly: false
        }
      });
      if (res.data.ok) {
        setRawMaterials(res.data.materials || []);
        setTotalRmCount(res.data.total || 0);
      }
    } catch (err) {
      console.error('Failed to fetch raw materials:', err);
    } finally {
      setLoadingRm(false);
    }
  };

  // --- FP Fetching ---
  const fetchFpCategories = async () => {
    try {
      const res = await api.get('/finished-products/categories');
      if (res.data.ok) {
        setFpCategories(res.data.categories || []);
      }
    } catch (err) {
      console.error('Failed to fetch FP categories:', err);
    }
  };

  const fetchFinishedProducts = async () => {
    try {
      setLoadingFp(true);
      const res = await api.get('/finished-products', {
        params: {
          page: currentFpPage,
          limit: fpPageLimit,
          search: searchFpQuery,
          activeOnly: false
        }
      });
      if (res.data.ok) {
        setFinishedProducts(res.data.products || []);
        setTotalFpCount(res.data.total || 0);
      }
    } catch (err) {
      console.error('Failed to fetch finished products:', err);
    } finally {
      setLoadingFp(false);
    }
  };

  // ==========================================
  // RM HANDLERS
  // ==========================================
  const handleRmSearchChange = (e) => {
    setSearchRmQuery(e.target.value);
    setCurrentRmPage(1);
    setRmCurrentPages({});
  };

  const handleRmInputChange = (e) => {
    const { name, value } = e.target;
    setRmFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleRmCategorySelectChange = (e) => {
    const val = e.target.value;
    if (val === 'new_category') {
      setRmFormData(prev => ({ ...prev, categoryId: '' }));
      setNewRmCategoryName('');
      setRmCategoryModalError('');
      setIsRmCategoryModalOpen(true);
    } else {
      setRmFormData(prev => ({ ...prev, categoryId: val }));
    }
  };

  const handleCreateRmCategory = async (e) => {
    e.preventDefault();
    setRmCategoryModalError('');
    const nameTrimmed = newRmCategoryName.trim();
    if (!nameTrimmed) {
      setRmCategoryModalError('Category name is required.');
      return;
    }

    setIsSavingRmCategory(true);
    try {
      const res = await api.post('/raw-materials/categories', { name: nameTrimmed });
      if (res.data.ok) {
        await fetchRmCategories();
        setRmFormData(prev => ({ ...prev, categoryId: String(res.data.id) }));
        setIsRmCategoryModalOpen(false);
        setNewRmCategoryName('');
      } else {
        setRmCategoryModalError(res.data.error || 'Failed to save category.');
      }
    } catch (err) {
      setRmCategoryModalError(err.response?.data?.error || err.message || 'An error occurred.');
    } finally {
      setIsSavingRmCategory(false);
    }
  };

  const handleAddRmMaterial = async (e) => {
    e.preventDefault();
    setRmFormError('');
    setRmFormSuccess('');

    if (!rmFormData.categoryId) {
      setRmFormError('Please select a category.');
      return;
    }
    if (!rmFormData.subProductName.trim()) {
      setRmFormError('Please enter a sub product name.');
      return;
    }
    if (!rmFormData.unit) {
      setRmFormError('Please select a unit.');
      return;
    }

    setIsAddingRm(true);
    try {
      const selectedCategory = rmCategories.find(c => String(c.id) === String(rmFormData.categoryId));
      const selectedCategoryName = selectedCategory ? selectedCategory.name : '';
      const showQtyPerKg = selectedCategoryName.toLowerCase() !== 'preforms' && rmFormData.unit === 'KG';

      const res = await api.post('/raw-materials', {
        categoryId: rmFormData.categoryId,
        subProductName: rmFormData.subProductName,
        unit: rmFormData.unit,
        qtyInPcPerKg: showQtyPerKg ? rmFormData.qtyInPcPerKg : null
      });

      if (res.data.ok) {
        setRmFormSuccess('Raw material added successfully!');
        setRmFormData(prev => ({ ...prev, subProductName: '', qtyInPcPerKg: '' }));
        fetchRawMaterials();
        setTimeout(() => setRmFormSuccess(''), 2000);
      } else {
        setRmFormError(res.data.error || 'Failed to add raw material.');
      }
    } catch (err) {
      setRmFormError(err.response?.data?.error || err.message || 'An error occurred.');
    } finally {
      setIsAddingRm(false);
    }
  };

  const handleToggleRmStatus = async (item) => {
    const nextStatus = item.status === 1 ? 0 : 1;
    try {
      const res = await api.put(`/raw-materials/${item.id}`, { status: nextStatus });
      if (res.data.ok) {
        fetchRawMaterials();
      } else {
        alert(res.data.error || 'Failed to toggle status.');
      }
    } catch (err) {
      alert(`Error toggling status: ${err.message}`);
    }
  };

  const confirmRmDelete = (item) => {
    setDeletingRmMaterial(item);
    setIsRmDeleteModalOpen(true);
  };

  const handleRmDelete = async () => {
    if (!deletingRmMaterial) return;
    try {
      const res = await api.delete(`/raw-materials/${deletingRmMaterial.id}`);
      if (res.data.ok) {
        setIsRmDeleteModalOpen(false);
        setDeletingRmMaterial(null);
        fetchRawMaterials();
      } else {
        alert(res.data.error || 'Failed to delete raw material.');
      }
    } catch (err) {
      alert(err.response?.data?.error || `Delete failed: ${err.message}`);
    }
  };

  const openRmEditModal = (item) => {
    setEditingRmMaterial(item);
    setRmEditFormData({
      categoryId: String(item.category_id || ''),
      subProductName: item.sub_product_name || '',
      unit: item.unit || 'KG',
      qtyInPcPerKg: item.qty_in_pc_per_kg !== null && item.qty_in_pc_per_kg !== undefined ? String(item.qty_in_pc_per_kg) : ''
    });
    setRmEditModalError('');
    setIsRmEditModalOpen(true);
  };

  const handleSaveRmEdit = async (e) => {
    e.preventDefault();
    setRmEditModalError('');

    if (!rmEditFormData.categoryId) {
      setRmEditModalError('Please select a category.');
      return;
    }
    if (!rmEditFormData.subProductName.trim()) {
      setRmEditModalError('Please enter a sub product name.');
      return;
    }
    if (!rmEditFormData.unit) {
      setRmEditModalError('Please select a unit.');
      return;
    }

    setIsSavingRmEdit(true);
    try {
      const selectedCategory = rmCategories.find(c => String(c.id) === String(rmEditFormData.categoryId));
      const selectedCategoryName = selectedCategory ? selectedCategory.name : '';
      const showQtyPerKg = selectedCategoryName.toLowerCase() !== 'preforms' && rmEditFormData.unit === 'KG';

      const res = await api.put(`/raw-materials/${editingRmMaterial.id}`, {
        categoryId: rmEditFormData.categoryId,
        subProductName: rmEditFormData.subProductName.trim(),
        unit: rmEditFormData.unit,
        qtyInPcPerKg: showQtyPerKg && rmEditFormData.qtyInPcPerKg !== '' ? parseFloat(rmEditFormData.qtyInPcPerKg) : null
      });

      if (res.data.ok) {
        setIsRmEditModalOpen(false);
        setEditingRmMaterial(null);
        fetchRawMaterials();
      } else {
        setRmEditModalError(res.data.error || 'Failed to update raw material.');
      }
    } catch (err) {
      setRmEditModalError(err.response?.data?.error || err.message || 'An error occurred.');
    } finally {
      setIsSavingRmEdit(false);
    }
  };

  // ==========================================
  // FP HANDLERS
  // ==========================================
  const handleFpSearchChange = (e) => {
    setSearchFpQuery(e.target.value);
    setCurrentFpPage(1);
  };

  const handleFpInputChange = (e) => {
    const { name, value } = e.target;
    setFpFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFpCategorySelectChange = (e) => {
    const val = e.target.value;
    if (val === 'new_category') {
      setFpFormData(prev => ({ ...prev, categoryId: '' }));
      setNewFpCategoryName('');
      setFpCategoryModalError('');
      setIsFpCategoryModalOpen(true);
    } else {
      setFpFormData(prev => ({ ...prev, categoryId: val }));
    }
  };

  const handleCreateFpCategory = async (e) => {
    e.preventDefault();
    setFpCategoryModalError('');
    const nameTrimmed = newFpCategoryName.trim();
    if (!nameTrimmed) {
      setFpCategoryModalError('Category name is required.');
      return;
    }

    setIsSavingFpCategory(true);
    try {
      const res = await api.post('/finished-products/categories', { name: nameTrimmed });
      if (res.data.ok) {
        await fetchFpCategories();
        setFpFormData(prev => ({ ...prev, categoryId: String(res.data.id) }));
        setIsFpCategoryModalOpen(false);
        setNewFpCategoryName('');
      } else {
        setFpCategoryModalError(res.data.error || 'Failed to save category.');
      }
    } catch (err) {
      setFpCategoryModalError(err.response?.data?.error || err.message || 'An error occurred.');
    } finally {
      setIsSavingFpCategory(false);
    }
  };

  const handleAddFpProduct = async (e) => {
    e.preventDefault();
    setFpFormError('');
    setFpFormSuccess('');

    if (!fpFormData.name.trim()) {
      setFpFormError('Please enter a product name.');
      return;
    }

    setIsAddingFp(true);
    try {
      const res = await api.post('/finished-products', {
        name: fpFormData.name,
        categoryId: fpFormData.categoryId || null
      });

      if (res.data.ok) {
        setFpFormSuccess('Finished product added successfully!');
        setFpFormData(prev => ({ ...prev, name: '' }));
        fetchFinishedProducts();
        setTimeout(() => setFpFormSuccess(''), 2000);
      } else {
        setFpFormError(res.data.error || 'Failed to add finished product.');
      }
    } catch (err) {
      setFpFormError(err.response?.data?.error || err.message || 'An error occurred.');
    } finally {
      setIsAddingFp(false);
    }
  };

  const handleToggleFpStatus = async (item) => {
    const nextStatus = item.status === 1 ? 0 : 1;
    try {
      const res = await api.put(`/finished-products/${item.id}`, { status: nextStatus });
      if (res.data.ok) {
        fetchFinishedProducts();
      } else {
        alert(res.data.error || 'Failed to toggle status.');
      }
    } catch (err) {
      alert(`Error toggling status: ${err.message}`);
    }
  };

  const confirmFpDelete = (item) => {
    setDeletingFpProduct(item);
    setIsFpDeleteModalOpen(true);
  };

  const handleFpDelete = async () => {
    if (!deletingFpProduct) return;
    try {
      const res = await api.delete(`/finished-products/${deletingFpProduct.id}`);
      if (res.data.ok) {
        setIsFpDeleteModalOpen(false);
        setDeletingFpProduct(null);
        fetchFinishedProducts();
      } else {
        alert(res.data.error || 'Failed to delete finished product.');
      }
    } catch (err) {
      alert(err.response?.data?.error || `Delete failed: ${err.message}`);
    }
  };

  const openFpEditModal = (item) => {
    setEditingFpProduct(item);
    setFpEditFormData({
      name: item.name || '',
      categoryId: item.category_id ? String(item.category_id) : ''
    });
    setFpEditModalError('');
    setIsFpEditModalOpen(true);
  };

  const handleSaveFpEdit = async (e) => {
    e.preventDefault();
    setFpEditModalError('');

    if (!fpEditFormData.name.trim()) {
      setFpEditModalError('Please enter a product name.');
      return;
    }

    setIsSavingFpEdit(true);
    try {
      const res = await api.put(`/finished-products/${editingFpProduct.id}`, {
        name: fpEditFormData.name.trim(),
        categoryId: fpEditFormData.categoryId || null
      });

      if (res.data.ok) {
        setIsFpEditModalOpen(false);
        setEditingFpProduct(null);
        fetchFinishedProducts();
      } else {
        setFpEditModalError(res.data.error || 'Failed to update finished product.');
      }
    } catch (err) {
      setFpEditModalError(err.response?.data?.error || err.message || 'An error occurred.');
    } finally {
      setIsSavingFpEdit(false);
    }
  };

  const getGroupedRawMaterials = () => {
    const grouped = {};
    rawMaterials.forEach(item => {
      const catName = item.category_name || 'Uncategorized';
      if (!grouped[catName]) {
        grouped[catName] = [];
      }
      grouped[catName].push(item);
    });

    // Sort subproducts inside each category alphabetically (natural sort)
    Object.keys(grouped).forEach(cat => {
      grouped[cat].sort((a, b) => 
        a.sub_product_name.localeCompare(b.sub_product_name, undefined, { numeric: true, sensitivity: 'base' })
      );
    });

    // Custom order for main categories:
    // Preforms, Labels, Box, Caps, then others alphabetically
    const categoryOrder = {
      'preforms': 1,
      'labels': 2,
      'box': 3,
      'caps': 4
    };

    const sortedCategories = Object.keys(grouped).sort((a, b) => {
      const aLower = a.toLowerCase();
      const bLower = b.toLowerCase();
      const aOrder = categoryOrder[aLower] || 999;
      const bOrder = categoryOrder[bLower] || 999;
      if (aOrder !== bOrder) {
        return aOrder - bOrder;
      }
      return a.localeCompare(b);
    });

    return { grouped, sortedCategories };
  };

  const totalRmPages = Math.ceil(totalRmCount / rmPageLimit) || 1;
  const totalFpPages = Math.ceil(totalFpCount / fpPageLimit) || 1;

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* BACK BUTTON */}
      <div>
        <button 
          onClick={() => navigate('/dashboard')}
          className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-all font-bold text-sm shadow-sm flex items-center gap-1.5"
        >
          ← Back
        </button>
      </div>

      {/* HEADER SECTION */}
      <div>
        <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase">PRODUCT MASTER</h1>
        <p className="text-slate-500 text-sm font-medium mt-1">
          Manage all product lists — changes apply across all forms automatically
        </p>
      </div>

      {/* TABS SELECTOR */}
      <div className="flex border-b border-slate-200/80">
        <button
          onClick={() => setActiveTab('finished-products')}
          className={`flex items-center gap-2 py-4 px-6 font-bold text-[14px] transition-all relative ${
            activeTab === 'finished-products' 
              ? 'text-primary' 
              : 'text-slate-400 hover:text-slate-650'
          }`}
        >
          <span>🛒</span> Finished Products
          {activeTab === 'finished-products' && (
            <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-primary rounded-t-full"></div>
          )}
        </button>
        <button
          onClick={() => setActiveTab('raw-materials')}
          className={`flex items-center gap-2 py-4 px-6 font-bold text-[14px] transition-all relative ${
            activeTab === 'raw-materials' 
              ? 'text-primary' 
              : 'text-slate-400 hover:text-slate-650'
          }`}
        >
          <span>🪨</span> Raw Materials
          {activeTab === 'raw-materials' && (
            <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-primary rounded-t-full"></div>
          )}
        </button>
      </div>

      {activeTab === 'finished-products' ? (
        /* =======================================================
           FINISHED PRODUCTS TAB CONTENT
           ======================================================= */
        <div className="space-y-6">
          
          {/* ADD NEW FINISHED PRODUCT CARD */}
          <div className="card-premium">
            <h3 className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-1.5">
              <span>➕</span> ADD NEW FINISHED PRODUCT
            </h3>
            
            <form onSubmit={handleAddFpProduct} className="flex flex-wrap items-center gap-4">
              
              {/* Product Name Input */}
              <div className="flex-1 min-w-[250px]">
                <input
                  type="text"
                  name="name"
                  value={fpFormData.name}
                  onChange={handleFpInputChange}
                  placeholder="Product name e.g. 1L Mango Kemps"
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 placeholder-slate-400/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all duration-200 outline-none text-sm font-medium"
                />
              </div>

              {/* Category Dropdown with modal trigger */}
              <div className="flex-1 min-w-[250px]">
                <select
                  name="categoryId"
                  value={fpFormData.categoryId}
                  onChange={handleFpCategorySelectChange}
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all duration-200 outline-none text-sm font-medium"
                >
                  <option value="">Category e.g. Water Bottles (optional)</option>
                  {fpCategories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                  <option value="new_category">+ New Category...</option>
                </select>
              </div>

              {/* Add Product Button */}
              <div>
                <button
                  type="submit"
                  disabled={isAddingFp}
                  className="h-11 px-6 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm shadow-md shadow-emerald-100 flex items-center justify-center gap-1.5 transition-all duration-200"
                >
                  {isAddingFp ? <span className="loading loading-spinner text-white"></span> : '+ Add Product'}
                </button>
              </div>
            </form>

            {fpFormError && (
              <div className="mt-4 bg-red-50 text-red-600 px-4 py-2.5 rounded-xl text-xs font-semibold border border-red-100">
                ⚠️ {fpFormError}
              </div>
            )}
            {fpFormSuccess && (
              <div className="mt-4 bg-emerald-50 text-emerald-600 px-4 py-2.5 rounded-xl text-xs font-semibold border border-emerald-100 animate-fade-in">
                ✅ {fpFormSuccess}
              </div>
            )}
          </div>

          {/* ALL FINISHED PRODUCTS CARD */}
          <div className="card-premium">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">
                📋 ALL FINISHED PRODUCTS
              </span>
            </div>

            {/* Search and records count */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div className="relative flex-1 max-w-md">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
                <input 
                  type="text" 
                  placeholder="Search products..."
                  value={searchFpQuery}
                  onChange={handleFpSearchChange}
                  className="input-premium pl-11 h-10 w-full"
                />
              </div>
              <div className="text-[12px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
                {totalFpCount} products
              </div>
            </div>

            {/* Table Listing */}
            <div className="overflow-x-auto rounded-xl border border-slate-100">
              <table className="table table-zebra w-full overflow-hidden">
                <thead className="bg-[#0b1324] text-white border-b border-slate-100">
                  <tr className="text-slate-300 text-[11px] font-black uppercase tracking-wider">
                    <th className="py-4 px-6 text-left">Product Name</th>
                    <th className="py-4 px-6 text-left">Category</th>
                    <th className="py-4 px-6 text-left">Status</th>
                    <th className="py-4 px-6 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {loadingFp ? (
                    <tr>
                      <td colSpan="4" className="py-20 text-center">
                        <div className="flex flex-col items-center gap-3">
                           <span className="loading loading-spinner text-primary"></span>
                           <span className="text-slate-400 text-sm font-medium">Fetching products...</span>
                        </div>
                      </td>
                    </tr>
                  ) : finishedProducts.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="py-20 text-center text-slate-400 font-medium italic">
                        {searchFpQuery ? 'No products found matching your search.' : 'No products added yet.'}
                      </td>
                    </tr>
                  ) : (
                    finishedProducts.map((item) => (
                      <tr key={item.id} className="hover:bg-blue-50/30 transition-colors group">
                        <td className="py-4 px-6 text-[14px] font-bold text-slate-700">{item.name}</td>
                        <td className="py-4 px-6">
                          {item.category_name ? (
                            <span className="bg-blue-50 text-blue-600 rounded-lg px-2.5 py-1 text-xs font-bold border border-blue-100/50">
                              {item.category_name}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-xs italic">—</span>
                          )}
                        </td>
                        <td className="py-4 px-6">
                          {item.status === 1 ? (
                            <span className="bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded text-[11px] font-bold border border-emerald-100">
                              Active
                            </span>
                          ) : (
                            <span className="bg-red-50 text-red-500 px-2 py-0.5 rounded text-[11px] font-bold border border-red-100">
                              Inactive
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-6">
                          <div className="flex items-center justify-center gap-2">
                            <button 
                              onClick={() => handleToggleFpStatus(item)}
                              className={`btn btn-xs rounded-lg px-2.5 py-1 font-bold text-[11px] h-auto min-h-0 text-white shadow-sm transition-all duration-200 ${
                                item.status === 1 
                                  ? 'bg-[#10b981] hover:bg-emerald-600 shadow-emerald-100' 
                                  : 'bg-slate-500 hover:bg-slate-600 shadow-slate-150'
                              }`}
                            >
                              {item.status === 1 ? 'Disable' : 'Enable'}
                            </button>
                            <button 
                              type="button"
                              onClick={() => openFpEditModal(item)}
                              className="bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200/70 rounded-lg px-2.5 py-1 font-bold text-[11px] flex items-center gap-1 transition-all duration-200 shadow-sm"
                              title="Edit Product Details"
                            >
                              <span>✏️</span> Edit
                            </button>
                            <button 
                              onClick={() => confirmFpDelete(item)}
                              className="bg-red-50 hover:bg-red-100 text-red-500 border border-red-100 rounded-lg px-2.5 py-1 font-bold text-[11px] flex items-center gap-1 transition-all duration-200"
                            >
                              <span>🗑️</span> Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* PAGINATION CONTROLS */}
            {!loadingFp && totalFpCount > 0 && (
              <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-100">
                <div className="text-[12px] font-bold text-slate-400 uppercase">
                  Page {currentFpPage} of {totalFpPages}
                </div>
                <div className="flex gap-2">
                  <button
                    disabled={currentFpPage === 1}
                    onClick={() => setCurrentFpPage(prev => Math.max(1, prev - 1))}
                    className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-50 text-[12px] font-bold shadow-sm transition-all duration-200"
                  >
                    Previous
                  </button>
                  <button
                    disabled={currentFpPage === totalFpPages}
                    onClick={() => setCurrentFpPage(prev => Math.min(totalFpPages, prev + 1))}
                    className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-50 text-[12px] font-bold shadow-sm transition-all duration-200"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* =======================================================
           RAW MATERIALS TAB CONTENT
           ======================================================= */
        <div className="space-y-6">
          
          {/* ADD NEW RAW MATERIAL CARD */}
          <div className="card-premium">
            <h3 className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-1.5">
              <span>➕</span> ADD NEW RAW MATERIAL
            </h3>
            
            <form onSubmit={handleAddRmMaterial} className="flex flex-wrap items-center gap-4">
              
              {/* Category Select */}
              <div className="flex-1 min-w-[200px]">
                <select
                  name="categoryId"
                  value={rmFormData.categoryId}
                  onChange={handleRmCategorySelectChange}
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all duration-200 outline-none text-sm font-medium"
                >
                  <option value="">-- Select Category --</option>
                  {rmCategories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                  <option value="new_category">+ New Category...</option>
                </select>
              </div>

              {/* Sub product name */}
              <div className="flex-1 min-w-[200px]">
                <input
                  type="text"
                  name="subProductName"
                  value={rmFormData.subProductName}
                  onChange={handleRmInputChange}
                  placeholder="Sub product name"
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 placeholder-slate-400/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all duration-200 outline-none text-sm font-medium"
                />
              </div>

              {/* Unit Select (Hardcoded) */}
              <div className="w-[120px]">
                <select
                  name="unit"
                  value={rmFormData.unit}
                  onChange={handleRmInputChange}
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all duration-200 outline-none text-sm font-medium"
                >
                  {rmUnitsList.map(unit => (
                    <option key={unit} value={unit}>{unit}</option>
                  ))}
                </select>
              </div>

              {/* Qty in PC (per KG) Input (conditional) */}
              {(() => {
                const selectedCategory = rmCategories.find(c => String(c.id) === String(rmFormData.categoryId));
                const selectedCategoryName = selectedCategory ? selectedCategory.name : '';
                const showQtyPerKg = selectedCategoryName.toLowerCase() !== 'preforms' && rmFormData.unit === 'KG';
                if (!showQtyPerKg) return null;
                return (
                  <div className="flex-1 min-w-[200px]">
                    <input
                      type="number"
                      name="qtyInPcPerKg"
                      value={rmFormData.qtyInPcPerKg}
                      onChange={handleRmInputChange}
                      placeholder="Qty in pc (per kg) e.g. 100"
                      className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 placeholder-slate-400/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all duration-200 outline-none text-sm font-medium"
                    />
                  </div>
                );
              })()}

              {/* Add Button */}
              <div>
                <button
                  type="submit"
                  disabled={isAddingRm}
                  className="h-11 px-6 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm shadow-md shadow-emerald-100 flex items-center justify-center gap-1.5 transition-all duration-200"
                >
                  {isAddingRm ? <span className="loading loading-spinner text-white"></span> : '+ Add'}
                </button>
              </div>
            </form>

            {rmFormError && (
              <div className="mt-4 bg-red-50 text-red-600 px-4 py-2.5 rounded-xl text-xs font-semibold border border-red-100">
                ⚠️ {rmFormError}
              </div>
            )}
            {rmFormSuccess && (
              <div className="mt-4 bg-emerald-50 text-emerald-600 px-4 py-2.5 rounded-xl text-xs font-semibold border border-emerald-100 animate-fade-in">
                ✅ {rmFormSuccess}
              </div>
            )}
          </div>

          {/* ALL RAW MATERIALS CARD */}
          <div className="card-premium">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">
                📋 ALL RAW MATERIALS
              </span>
            </div>

            {/* Search and records count */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div className="relative flex-1 max-w-md">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
                <input 
                  type="text" 
                  placeholder="Search category or subproduct..."
                  value={searchRmQuery}
                  onChange={handleRmSearchChange}
                  className="input-premium pl-11 h-10 w-full"
                />
              </div>
              <div className="text-[12px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
                {totalRmCount} Items
              </div>
            </div>

            {/* Accordion Layout with Pagination */}
            <div className="space-y-4">
              {loadingRm ? (
                <div className="py-20 text-center">
                  <span className="loading loading-spinner text-primary"></span>
                  <span className="text-slate-400 text-sm font-medium block mt-2">Fetching raw materials...</span>
                </div>
              ) : rawMaterials.length === 0 ? (
                <div className="py-20 text-center text-slate-400 font-medium italic border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                  {searchRmQuery ? 'No raw materials found matching your search.' : 'No raw materials added yet.'}
                </div>
              ) : (() => {
                const { grouped, sortedCategories } = getGroupedRawMaterials();
                
                return sortedCategories.map((categoryName, idx) => {
                  const items = grouped[categoryName] || [];
                  const catPage = rmCurrentPages[categoryName] || 1;
                  const itemsPerPage = 5;
                  const totalCatPages = Math.ceil(items.length / itemsPerPage) || 1;
                  const activeCatPage = Math.min(catPage, totalCatPages);
                  
                  const indexOfLastItem = activeCatPage * itemsPerPage;
                  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
                  const currentCatItems = items.slice(indexOfFirstItem, indexOfLastItem);
                  
                  return (
                    <details 
                      key={categoryName}
                      className="collapse collapse-arrow bg-white border border-slate-200 rounded-2xl shadow-sm pointer-events-auto"
                      name="raw-materials-accordion"
                      defaultOpen={idx === 0}
                    >
                      <summary className="collapse-title text-sm font-black text-slate-800 uppercase tracking-wide py-4 px-6 cursor-pointer flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          📁 {categoryName} <span className="text-xs text-slate-400 font-bold">({items.length} {items.length === 1 ? 'item' : 'items'})</span>
                        </span>
                      </summary>
                      
                      <div className="collapse-content px-6 pb-6 overflow-x-auto text-sm">
                        <div className="overflow-x-auto rounded-xl border border-slate-100 mt-2 bg-white">
                          <table className="table table-zebra w-full overflow-hidden">
                            <thead className="bg-[#0b1324] text-white border-b border-slate-100">
                              <tr className="text-slate-300 text-[11px] font-black uppercase tracking-wider">
                                <th className="py-4 px-6 text-left">Sub Product</th>
                                <th className="py-4 px-6 text-left">Unit</th>
                                <th className="py-4 px-6 text-left">Qty in PC (per KG)</th>
                                <th className="py-4 px-6 text-left">Status</th>
                                <th className="py-4 px-6 text-center">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                              {currentCatItems.map((item) => (
                                <tr key={item.id} className="hover:bg-slate-50/40 transition-colors group">
                                  <td className="py-4 px-6 text-[14px] font-bold text-slate-700">{item.sub_product_name}</td>
                                  <td className="py-4 px-6 text-[13px] font-bold text-slate-500 uppercase">{item.unit}</td>
                                  <td className="py-4 px-6 text-[13px] font-bold text-slate-500">
                                    {item.qty_in_pc_per_kg !== null && item.qty_in_pc_per_kg !== undefined ? `${item.qty_in_pc_per_kg} pcs` : '—'}
                                  </td>
                                  <td className="py-4 px-6">
                                    {item.status === 1 ? (
                                      <span className="bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded text-[11px] font-bold border border-emerald-100">
                                        Active
                                      </span>
                                    ) : (
                                      <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded text-[11px] font-bold border border-slate-200">
                                        Disabled
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-4 px-6">
                                    <div className="flex items-center justify-center gap-2">
                                      <button 
                                        type="button"
                                        onClick={() => handleToggleRmStatus(item)}
                                        className={`btn btn-xs rounded-lg px-2.5 py-1 font-bold text-[11px] h-auto min-h-0 text-white shadow-sm transition-all duration-200 ${
                                          item.status === 1 
                                            ? 'bg-[#10b981] hover:bg-emerald-600 shadow-emerald-100' 
                                            : 'bg-slate-500 hover:bg-slate-600 shadow-slate-150'
                                        }`}
                                      >
                                        {item.status === 1 ? 'Disable' : 'Enable'}
                                      </button>
                                      <button 
                                        type="button"
                                        onClick={() => openRmEditModal(item)}
                                        className="bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200/70 rounded-lg px-2.5 py-1 font-bold text-[11px] flex items-center gap-1 transition-all duration-200 shadow-sm"
                                        title="Edit Product Details"
                                      >
                                        <span>✏️</span> Edit
                                      </button>
                                      <button 
                                        type="button"
                                        onClick={() => confirmRmDelete(item)}
                                        className="bg-red-50 hover:bg-red-100 text-red-500 border border-red-100 rounded-lg px-2.5 py-1 font-bold text-[11px] flex items-center gap-1 transition-all duration-200"
                                      >
                                        <span>🗑️</span> Delete
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        
                        {/* Pagination within Category */}
                        {totalCatPages > 1 && (
                          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4 pt-3 border-t border-slate-100">
                            <span className="text-xs text-slate-500 font-semibold">
                              Showing {indexOfFirstItem + 1} to {Math.min(indexOfLastItem, items.length)} of {items.length} records
                            </span>
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                disabled={activeCatPage === 1}
                                onClick={() => setRmCurrentPages(prev => ({ ...prev, [categoryName]: activeCatPage - 1 }))}
                                className="px-3.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                              >
                                ← Prev
                              </button>
                              
                              {Array.from({ length: totalCatPages }, (_, i) => i + 1).map(pageNum => (
                                <button
                                  key={pageNum}
                                  type="button"
                                  onClick={() => setRmCurrentPages(prev => ({ ...prev, [categoryName]: pageNum }))}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                                    activeCatPage === pageNum
                                      ? 'bg-primary border-primary text-white'
                                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                  }`}
                                >
                                  {pageNum}
                                </button>
                              ))}
                              
                              <button
                                type="button"
                                disabled={activeCatPage === totalCatPages}
                                onClick={() => setRmCurrentPages(prev => ({ ...prev, [categoryName]: activeCatPage + 1 }))}
                                className="px-3.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                              >
                                Next →
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </details>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}

      {/* =======================================================
         MODALS SECTIONS
         ======================================================= */}

      {/* CREATE RM CATEGORY MODAL */}
      {isRmCategoryModalOpen && (
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm pointer-events-auto"
          onClick={() => setIsRmCategoryModalOpen(false)}
        >
          <div 
            className="bg-white rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.2)] border border-slate-200 w-[420px] p-8 flex flex-col gap-6 max-h-[90vh] overflow-y-auto animate-fade-in pointer-events-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-1.5">
                <span>➕</span> Add New RM Category
              </h3>
              <button 
                onClick={() => setIsRmCategoryModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-all font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateRmCategory} className="space-y-4">
              <div className="space-y-2">
                <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                  Category Name
                </label>
                <input 
                  type="text" 
                  value={newRmCategoryName}
                  onChange={(e) => setNewRmCategoryName(e.target.value)}
                  placeholder="e.g. Shrink Rolls" 
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 placeholder-slate-400/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all duration-200 outline-none text-sm font-medium"
                  required
                />
              </div>

              {rmCategoryModalError && (
                <div className="bg-red-50 text-red-600 px-4 py-2 rounded-lg text-xs font-semibold border border-red-100">
                  ⚠️ {rmCategoryModalError}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button 
                  type="submit" 
                  disabled={isSavingRmCategory}
                  className="btn-premium btn-primary-premium flex-[2] h-12 text-xs uppercase tracking-wider"
                >
                  {isSavingRmCategory ? <span className="loading loading-spinner text-white"></span> : 'Save Category'}
                </button>
                <button 
                  type="button" 
                  onClick={() => setIsRmCategoryModalOpen(false)}
                  className="btn-premium bg-slate-50 text-slate-500 hover:bg-slate-100 border border-slate-200 flex-1 h-12 text-xs font-bold uppercase tracking-wider"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE FP CATEGORY MODAL */}
      {isFpCategoryModalOpen && (
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm pointer-events-auto"
          onClick={() => setIsFpCategoryModalOpen(false)}
        >
          <div 
            className="bg-white rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.2)] border border-slate-200 w-[420px] p-8 flex flex-col gap-6 max-h-[90vh] overflow-y-auto animate-fade-in pointer-events-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-1.5">
                <span>➕</span> Add New FP Category
              </h3>
              <button 
                onClick={() => setIsFpCategoryModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-all font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateFpCategory} className="space-y-4">
              <div className="space-y-2">
                <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                  Category Name
                </label>
                <input 
                  type="text" 
                  value={newFpCategoryName}
                  onChange={(e) => setNewFpCategoryName(e.target.value)}
                  placeholder="e.g. Water Bottles" 
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 placeholder-slate-400/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all duration-200 outline-none text-sm font-medium"
                  required
                />
              </div>

              {fpCategoryModalError && (
                <div className="bg-red-50 text-red-600 px-4 py-2 rounded-lg text-xs font-semibold border border-red-100">
                  ⚠️ {fpCategoryModalError}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button 
                  type="submit" 
                  disabled={isSavingFpCategory}
                  className="btn-premium btn-primary-premium flex-[2] h-12 text-xs uppercase tracking-wider"
                >
                  {isSavingFpCategory ? <span className="loading loading-spinner text-white"></span> : 'Save Category'}
                </button>
                <button 
                  type="button" 
                  onClick={() => setIsFpCategoryModalOpen(false)}
                  className="btn-premium bg-slate-50 text-slate-500 hover:bg-slate-100 border border-slate-200 flex-1 h-12 text-xs font-bold uppercase tracking-wider"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RM DELETE CONFIRMATION MODAL */}
      {isRmDeleteModalOpen && (
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm pointer-events-auto"
          onClick={() => { setIsRmDeleteModalOpen(false); setDeletingRmMaterial(null); }}
        >
          <div 
            className="bg-white rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.2)] border border-slate-200 w-[480px] p-8 flex flex-col gap-6 max-h-[90vh] overflow-y-auto animate-fade-in pointer-events-auto relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              onClick={() => { setIsRmDeleteModalOpen(false); setDeletingRmMaterial(null); }}
              className="absolute top-4 right-4 w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-800 flex items-center justify-center font-bold transition-all"
            >
              ✕
            </button>

            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight flex items-center gap-1.5">
                🗑️ Delete Raw Material
              </h3>
            </div>

            {/* Material details preview card */}
            <div className="border border-slate-200 p-5 rounded-2xl space-y-3 bg-slate-50/50 text-xs font-semibold text-slate-700">
              <div className="flex justify-between">
                <span className="text-slate-400 block text-[10px] uppercase">Category</span>
                <span className="font-extrabold text-blue-600 bg-blue-50/50 px-2 py-0.5 rounded border border-blue-100/30">
                  {deletingRmMaterial?.category_name}
                </span>
              </div>
              <div className="flex justify-between border-t border-slate-100 pt-2">
                <span className="text-slate-400 block text-[10px] uppercase">Sub Product</span>
                <span className="font-black text-slate-800">{deletingRmMaterial?.sub_product_name}</span>
              </div>
              <div className="flex justify-between border-t border-slate-100 pt-2">
                <span className="text-slate-400 block text-[10px] uppercase">Unit</span>
                <span className="font-extrabold text-slate-800 uppercase">{deletingRmMaterial?.unit}</span>
              </div>
              {deletingRmMaterial?.qty_in_pc_per_kg !== null && deletingRmMaterial?.qty_in_pc_per_kg !== undefined && (
                <div className="flex justify-between border-t border-slate-100 pt-2">
                  <span className="text-slate-400 block text-[10px] uppercase">Qty in PC (per KG)</span>
                  <span className="font-extrabold text-slate-800">{deletingRmMaterial?.qty_in_pc_per_kg} pcs</span>
                </div>
              )}
              <div className="flex justify-between border-t border-slate-100 pt-2">
                <span className="text-slate-400 block text-[10px] uppercase">Status</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${deletingRmMaterial?.status === 1 ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
                  {deletingRmMaterial?.status === 1 ? 'ACTIVE' : 'DISABLED'}
                </span>
              </div>
            </div>

            <p className="text-slate-500 text-xs font-semibold leading-relaxed">
              ⚠️ Warning: Are you sure you want to delete this raw material? This action will permanently remove the record from all database ledgers.
            </p>

            <div className="flex justify-between gap-3 mt-2">
              <button 
                onClick={handleRmDelete}
                className="px-5 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black transition-all uppercase tracking-wider shadow-md shadow-rose-100 flex-1"
              >
                Yes, Delete
              </button>
              <button 
                onClick={() => { setIsRmDeleteModalOpen(false); setDeletingRmMaterial(null); }}
                className="px-5 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black transition-all uppercase tracking-wider flex-1"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FP DELETE CONFIRMATION MODAL */}
      {isFpDeleteModalOpen && (
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm pointer-events-auto"
          onClick={() => { setIsFpDeleteModalOpen(false); setDeletingFpProduct(null); }}
        >
          <div 
            className="bg-white rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.2)] border border-slate-200 w-[480px] p-8 flex flex-col gap-6 max-h-[90vh] overflow-y-auto animate-fade-in pointer-events-auto relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              onClick={() => { setIsFpDeleteModalOpen(false); setDeletingFpProduct(null); }}
              className="absolute top-4 right-4 w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-800 flex items-center justify-center font-bold transition-all"
            >
              ✕
            </button>

            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight flex items-center gap-1.5">
                🗑️ Delete Finished Product
              </h3>
            </div>

            {/* Product details preview card */}
            <div className="border border-slate-200 p-5 rounded-2xl space-y-3 bg-slate-50/50 text-xs font-semibold text-slate-700">
              <div className="flex justify-between">
                <span className="text-slate-400 block text-[10px] uppercase">Category</span>
                <span className="font-extrabold text-blue-600 bg-blue-50/50 px-2 py-0.5 rounded border border-blue-100/50">
                  {deletingFpProduct?.category_name || 'Uncategorized'}
                </span>
              </div>
              <div className="flex justify-between border-t border-slate-100 pt-2">
                <span className="text-slate-400 block text-[10px] uppercase">Product Name</span>
                <span className="font-black text-slate-800">{deletingFpProduct?.name}</span>
              </div>
              <div className="flex justify-between border-t border-slate-100 pt-2">
                <span className="text-slate-400 block text-[10px] uppercase">Status</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${deletingFpProduct?.status === 1 ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
                  {deletingFpProduct?.status === 1 ? 'ACTIVE' : 'INACTIVE'}
                </span>
              </div>
            </div>

            <p className="text-slate-500 text-xs font-semibold leading-relaxed">
              ⚠️ Warning: Are you sure you want to delete this finished product? This action will permanently remove the record from all database ledgers.
            </p>

            <div className="flex justify-between gap-3 mt-2">
              <button 
                onClick={handleFpDelete}
                className="px-5 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black transition-all uppercase tracking-wider shadow-md shadow-rose-100 flex-1"
              >
                Yes, Delete
              </button>
              <button 
                onClick={() => { setIsFpDeleteModalOpen(false); setDeletingFpProduct(null); }}
                className="px-5 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black transition-all uppercase tracking-wider flex-1"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RM EDIT MODAL */}
      {isRmEditModalOpen && (
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm pointer-events-auto"
          onClick={() => { setIsRmEditModalOpen(false); setEditingRmMaterial(null); }}
        >
          <div 
            className="bg-white rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.2)] border border-slate-200 w-[500px] p-8 flex flex-col gap-5 max-h-[90vh] overflow-y-auto animate-fade-in pointer-events-auto relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              onClick={() => { setIsRmEditModalOpen(false); setEditingRmMaterial(null); }}
              className="absolute top-5 right-5 w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-800 flex items-center justify-center font-bold transition-all"
            >
              ✕
            </button>

            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                <span>✏️</span> Edit Raw Material
              </h3>
              <p className="text-xs text-slate-400 font-semibold mt-0.5">
                Update category, product name, unit, or piece conversion
              </p>
            </div>

            <form onSubmit={handleSaveRmEdit} className="space-y-4">
              {/* Category */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 block uppercase tracking-wider">
                  Category
                </label>
                <select
                  value={rmEditFormData.categoryId}
                  onChange={(e) => setRmEditFormData(prev => ({ ...prev, categoryId: e.target.value }))}
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-750 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all duration-200 outline-none text-sm font-semibold cursor-pointer"
                  required
                >
                  <option value="">Select Category</option>
                  {rmCategories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>

              {/* Sub Product Name */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 block uppercase tracking-wider">
                  Sub Product Name / Specification
                </label>
                <input
                  type="text"
                  value={rmEditFormData.subProductName}
                  onChange={(e) => setRmEditFormData(prev => ({ ...prev, subProductName: e.target.value }))}
                  placeholder="e.g. 1L BOPP Kemps or 19.8"
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-800 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all duration-200 outline-none text-sm font-semibold"
                  required
                />
              </div>

              {/* Unit */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 block uppercase tracking-wider">
                  Unit
                </label>
                <select
                  value={rmEditFormData.unit}
                  onChange={(e) => setRmEditFormData(prev => ({ ...prev, unit: e.target.value }))}
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-750 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all duration-200 outline-none text-sm font-semibold cursor-pointer"
                  required
                >
                  {rmUnitsList.map(unit => (
                    <option key={unit} value={unit}>{unit}</option>
                  ))}
                </select>
              </div>

              {/* Qty in PC per KG (if unit is KG and category is not Preforms) */}
              {(() => {
                const selectedCat = rmCategories.find(c => String(c.id) === String(rmEditFormData.categoryId));
                const catName = selectedCat ? selectedCat.name.toLowerCase() : '';
                if (catName !== 'preforms' && rmEditFormData.unit === 'KG') {
                  return (
                    <div className="space-y-1.5 animate-fade-in">
                      <label className="text-[11px] font-bold text-slate-500 block uppercase tracking-wider">
                        Qty in PC (per 1 KG)
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={rmEditFormData.qtyInPcPerKg}
                        onChange={(e) => setRmEditFormData(prev => ({ ...prev, qtyInPcPerKg: e.target.value }))}
                        placeholder="e.g. 1000"
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-800 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all duration-200 outline-none text-sm font-semibold"
                      />
                      <span className="text-[10px] text-slate-400 font-semibold block">
                        Used to convert inventory bill KG into pieces for production ledger
                      </span>
                    </div>
                  );
                }
                return null;
              })()}

              {rmEditModalError && (
                <div className="bg-red-50 text-red-600 px-4 py-2.5 rounded-xl text-xs font-semibold border border-red-100">
                  ⚠️ {rmEditModalError}
                </div>
              )}

              <div className="flex gap-3 pt-3 border-t border-slate-100">
                <button
                  type="submit"
                  disabled={isSavingRmEdit}
                  className="btn-premium btn-primary-premium flex-[2] h-11 text-xs uppercase tracking-wider"
                >
                  {isSavingRmEdit ? <span className="loading loading-spinner text-white"></span> : 'Save Changes'}
                </button>
                <button
                  type="button"
                  onClick={() => { setIsRmEditModalOpen(false); setEditingRmMaterial(null); }}
                  className="btn-premium bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200 flex-1 h-11 text-xs font-bold uppercase tracking-wider"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FP EDIT MODAL */}
      {isFpEditModalOpen && (
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm pointer-events-auto"
          onClick={() => { setIsFpEditModalOpen(false); setEditingFpProduct(null); }}
        >
          <div 
            className="bg-white rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.2)] border border-slate-200 w-[480px] p-8 flex flex-col gap-5 max-h-[90vh] overflow-y-auto animate-fade-in pointer-events-auto relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              onClick={() => { setIsFpEditModalOpen(false); setEditingFpProduct(null); }}
              className="absolute top-5 right-5 w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-800 flex items-center justify-center font-bold transition-all"
            >
              ✕
            </button>

            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                <span>✏️</span> Edit Finished Product
              </h3>
              <p className="text-xs text-slate-400 font-semibold mt-0.5">
                Update finished product name and category
              </p>
            </div>

            <form onSubmit={handleSaveFpEdit} className="space-y-4">
              {/* Product Name */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 block uppercase tracking-wider">
                  Product Name
                </label>
                <input
                  type="text"
                  value={fpEditFormData.name}
                  onChange={(e) => setFpEditFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. 1L Mango Kemps"
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-800 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all duration-200 outline-none text-sm font-semibold"
                  required
                />
              </div>

              {/* Category */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 block uppercase tracking-wider">
                  Category
                </label>
                <select
                  value={fpEditFormData.categoryId}
                  onChange={(e) => setFpEditFormData(prev => ({ ...prev, categoryId: e.target.value }))}
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-750 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all duration-200 outline-none text-sm font-semibold cursor-pointer"
                >
                  <option value="">No Category (Uncategorized)</option>
                  {fpCategories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>

              {fpEditModalError && (
                <div className="bg-red-50 text-red-600 px-4 py-2.5 rounded-xl text-xs font-semibold border border-red-100">
                  ⚠️ {fpEditModalError}
                </div>
              )}

              <div className="flex gap-3 pt-3 border-t border-slate-100">
                <button
                  type="submit"
                  disabled={isSavingFpEdit}
                  className="btn-premium btn-primary-premium flex-[2] h-11 text-xs uppercase tracking-wider"
                >
                  {isSavingFpEdit ? <span className="loading loading-spinner text-white"></span> : 'Save Changes'}
                </button>
                <button
                  type="button"
                  onClick={() => { setIsFpEditModalOpen(false); setEditingFpProduct(null); }}
                  className="btn-premium bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200 flex-1 h-11 text-xs font-bold uppercase tracking-wider"
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

export default ProductMaster;
