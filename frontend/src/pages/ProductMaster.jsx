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

  const [isRmCategoryModalOpen, setIsRmCategoryModalOpen] = useState(false);
  const [newRmCategoryName, setNewRmCategoryName] = useState('');
  const [rmCategoryModalError, setRmCategoryModalError] = useState('');
  const [isSavingRmCategory, setIsSavingRmCategory] = useState(false);

  const [isRmDeleteModalOpen, setIsRmDeleteModalOpen] = useState(false);
  const [deletingRmMaterial, setDeletingRmMaterial] = useState(null);

  const rmUnitsList = ['PCS', 'BAGS', 'ROLLS', 'QTY', 'KG'];

  const [rmFormData, setRmFormData] = useState({
    categoryId: '',
    subProductName: '',
    unit: 'KG'
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
          page: currentRmPage,
          limit: rmPageLimit,
          search: searchRmQuery
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
          search: searchFpQuery
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
      const res = await api.post('/raw-materials', {
        categoryId: rmFormData.categoryId,
        subProductName: rmFormData.subProductName,
        unit: rmFormData.unit
      });

      if (res.data.ok) {
        setRmFormSuccess('Raw material added successfully!');
        setRmFormData(prev => ({ ...prev, subProductName: '' }));
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
      alert(`Delete failed: ${err.message}`);
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
      alert(`Delete failed: ${err.message}`);
    }
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
                          <div className="flex items-center justify-center gap-3">
                            <button 
                              onClick={() => handleToggleFpStatus(item)}
                              className={`btn btn-xs rounded-lg px-3 py-1 font-bold text-[12px] h-auto min-h-0 text-white shadow-sm transition-all duration-200 ${
                                item.status === 1 
                                  ? 'bg-[#10b981] hover:bg-emerald-600 shadow-emerald-100' 
                                  : 'bg-slate-500 hover:bg-slate-600 shadow-slate-150'
                              }`}
                            >
                              {item.status === 1 ? 'Disable' : 'Enable'}
                            </button>
                            <button 
                              onClick={() => confirmFpDelete(item)}
                              className="bg-red-50 hover:bg-red-100 text-red-500 rounded-lg px-3 py-1 font-bold text-[12px] flex items-center gap-1 transition-all duration-200"
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

            {/* Table listing */}
            <div className="overflow-x-auto rounded-xl border border-slate-100">
              <table className="table table-zebra w-full overflow-hidden">
                <thead className="bg-[#0b1324] text-white border-b border-slate-100">
                  <tr className="text-slate-300 text-[11px] font-black uppercase tracking-wider">
                    <th className="py-4 px-6 text-left">Category</th>
                    <th className="py-4 px-6 text-left">Sub Product</th>
                    <th className="py-4 px-6 text-left">Unit</th>
                    <th className="py-4 px-6 text-left">Status</th>
                    <th className="py-4 px-6 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {loadingRm ? (
                    <tr>
                      <td colSpan="5" className="py-20 text-center">
                        <div className="flex flex-col items-center gap-3">
                           <span className="loading loading-spinner text-primary"></span>
                           <span className="text-slate-400 text-sm font-medium">Fetching raw materials...</span>
                        </div>
                      </td>
                    </tr>
                  ) : rawMaterials.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="py-20 text-center text-slate-400 font-medium italic">
                        {searchRmQuery ? 'No raw materials found matching your search.' : 'No raw materials added yet.'}
                      </td>
                    </tr>
                  ) : (
                    rawMaterials.map((item) => (
                      <tr key={item.id} className="hover:bg-blue-50/30 transition-colors group">
                        <td className="py-4 px-6">
                          <span className="bg-blue-50 text-blue-600 rounded-lg px-2.5 py-1 text-xs font-bold border border-blue-100/50">
                            {item.category_name}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-[14px] font-bold text-slate-700">{item.sub_product_name}</td>
                        <td className="py-4 px-6 text-[13px] font-bold text-slate-500 uppercase">{item.unit}</td>
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
                          <div className="flex items-center justify-center gap-3">
                            <button 
                              onClick={() => handleToggleRmStatus(item)}
                              className={`btn btn-xs rounded-lg px-3 py-1 font-bold text-[12px] h-auto min-h-0 text-white shadow-sm transition-all duration-200 ${
                                item.status === 1 
                                  ? 'bg-[#10b981] hover:bg-emerald-600 shadow-emerald-100' 
                                  : 'bg-slate-500 hover:bg-slate-600 shadow-slate-150'
                              }`}
                            >
                              {item.status === 1 ? 'Disable' : 'Enable'}
                            </button>
                            <button 
                              onClick={() => confirmRmDelete(item)}
                              className="bg-red-50 hover:bg-red-100 text-red-500 rounded-lg px-3 py-1 font-bold text-[12px] flex items-center gap-1 transition-all duration-200"
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
            {!loadingRm && totalRmCount > 0 && (
              <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-100">
                <div className="text-[12px] font-bold text-slate-400 uppercase">
                  Page {currentRmPage} of {totalRmPages}
                </div>
                <div className="flex gap-2">
                  <button
                    disabled={currentRmPage === 1}
                    onClick={() => setCurrentRmPage(prev => Math.max(1, prev - 1))}
                    className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-50 text-[12px] font-bold shadow-sm transition-all duration-200"
                  >
                    Previous
                  </button>
                  <button
                    disabled={currentRmPage === totalRmPages}
                    onClick={() => setCurrentRmPage(prev => Math.min(totalRmPages, prev + 1))}
                    className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-50 text-[12px] font-bold shadow-sm transition-all duration-200"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =======================================================
         MODALS SECTIONS
         ======================================================= */}

      {/* CREATE RM CATEGORY MODAL */}
      {isRmCategoryModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm pointer-events-auto">
          <div className="bg-white rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.2)] border border-slate-200 w-[420px] p-8 flex flex-col gap-6 animate-fade-in pointer-events-auto">
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
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm pointer-events-auto">
          <div className="bg-white rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.2)] border border-slate-200 w-[420px] p-8 flex flex-col gap-6 animate-fade-in pointer-events-auto">
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
        <div className="modal modal-open">
          <div className="modal-box rounded-2xl p-8 max-w-sm border border-slate-200 shadow-2xl">
            <div className="w-14 h-14 bg-red-50 text-red-500 rounded-full flex items-center justify-center text-2xl mx-auto mb-4">
              ⚠️
            </div>
            <h3 className="text-xl font-black text-center text-slate-800">Confirm Deletion</h3>
            <p className="text-center text-slate-500 mt-2 text-sm">
              Are you sure you want to delete raw material <b>{deletingRmMaterial?.sub_product_name}</b>?
              <br/>This action cannot be undone.
            </p>
            <div className="flex flex-col gap-2 mt-8">
              <button 
                onClick={handleRmDelete}
                className="btn-premium bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-200"
              >
                Yes, Delete Material
              </button>
              <button 
                onClick={() => setIsRmDeleteModalOpen(false)}
                className="btn-premium bg-slate-100 text-slate-600 hover:bg-slate-200"
              >
                No, Keep Record
              </button>
            </div>
          </div>
          <div className="modal-backdrop bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsRmDeleteModalOpen(false)}></div>
        </div>
      )}

      {/* FP DELETE CONFIRMATION MODAL */}
      {isFpDeleteModalOpen && (
        <div className="modal modal-open">
          <div className="modal-box rounded-2xl p-8 max-w-sm border border-slate-200 shadow-2xl">
            <div className="w-14 h-14 bg-red-50 text-red-500 rounded-full flex items-center justify-center text-2xl mx-auto mb-4">
              ⚠️
            </div>
            <h3 className="text-xl font-black text-center text-slate-800">Confirm Deletion</h3>
            <p className="text-center text-slate-500 mt-2 text-sm">
              Are you sure you want to delete finished product <b>{deletingFpProduct?.name}</b>?
              <br/>This action cannot be undone.
            </p>
            <div className="flex flex-col gap-2 mt-8">
              <button 
                onClick={handleFpDelete}
                className="btn-premium bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-200"
              >
                Yes, Delete Product
              </button>
              <button 
                onClick={() => setIsFpDeleteModalOpen(false)}
                className="btn-premium bg-slate-100 text-slate-600 hover:bg-slate-200"
              >
                No, Keep Record
              </button>
            </div>
          </div>
          <div className="modal-backdrop bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsFpDeleteModalOpen(false)}></div>
        </div>
      )}

    </div>
  );
};

export default ProductMaster;
