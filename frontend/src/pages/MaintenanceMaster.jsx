import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';

const MaintenanceMaster = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('particulars'); // 'particulars' or 'sub-products'

  // ==========================================
  // PARTICULARS STATE
  // ==========================================
  const [particulars, setParticulars] = useState([]);
  const [loadingParticulars, setLoadingParticulars] = useState(true);
  const [searchParticularQuery, setSearchParticularQuery] = useState('');

  const [isParticularModalOpen, setIsParticularModalOpen] = useState(false);
  const [editingParticular, setEditingParticular] = useState(null);
  const [particularForm, setParticularForm] = useState({ name: '', description: '' });
  const [particularModalError, setParticularModalError] = useState('');
  const [isSavingParticular, setIsSavingParticular] = useState(false);

  const [isParticularDeleteModalOpen, setIsParticularDeleteModalOpen] = useState(false);
  const [deletingParticular, setDeletingParticular] = useState(null);

  // ==========================================
  // SUB PRODUCTS STATE
  // ==========================================
  const [subProducts, setSubProducts] = useState([]);
  const [loadingSubProducts, setLoadingSubProducts] = useState(true);
  const [searchSubQuery, setSearchSubQuery] = useState('');
  const [selectedParticularFilter, setSelectedParticularFilter] = useState('All');

  const [isSubModalOpen, setIsSubModalOpen] = useState(false);
  const [editingSub, setEditingSub] = useState(null);
  const [subForm, setSubForm] = useState({ particularId: '', name: '', description: '' });
  const [subModalError, setSubModalError] = useState('');
  const [isSavingSub, setIsSavingSub] = useState(false);

  const [isSubDeleteModalOpen, setIsSubDeleteModalOpen] = useState(false);
  const [deletingSub, setDeletingSub] = useState(null);

  // ==========================================
  // EFFECTS
  // ==========================================
  useEffect(() => {
    fetchParticulars();
    fetchSubProducts();
  }, []);

  const fetchParticulars = async () => {
    try {
      setLoadingParticulars(true);
      const res = await api.get('/maintenance-master/particulars', {
        params: { search: searchParticularQuery }
      });
      if (res.data.ok) {
        setParticulars(res.data.particulars || []);
      }
    } catch (err) {
      console.error('Failed to fetch particulars:', err);
    } finally {
      setLoadingParticulars(false);
    }
  };

  const fetchSubProducts = async () => {
    try {
      setLoadingSubProducts(true);
      const params = { search: searchSubQuery };
      if (selectedParticularFilter !== 'All') {
        params.particularId = selectedParticularFilter;
      }
      const res = await api.get('/maintenance-master/sub-products', { params });
      if (res.data.ok) {
        setSubProducts(res.data.subProducts || []);
      }
    } catch (err) {
      console.error('Failed to fetch sub-products:', err);
    } finally {
      setLoadingSubProducts(false);
    }
  };

  // Re-fetch on filter change
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchParticulars();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchParticularQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSubProducts();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchSubQuery, selectedParticularFilter]);

  // ==========================================
  // PARTICULARS HANDLERS
  // ==========================================
  const handleOpenParticularModal = (item = null) => {
    setParticularModalError('');
    if (item) {
      setEditingParticular(item);
      setParticularForm({ name: item.name, description: item.description || '' });
    } else {
      setEditingParticular(null);
      setParticularForm({ name: '', description: '' });
    }
    setIsParticularModalOpen(true);
  };

  const handleCloseParticularModal = () => {
    setIsParticularModalOpen(false);
    setEditingParticular(null);
    setParticularForm({ name: '', description: '' });
    setParticularModalError('');
  };

  const handleSaveParticular = async (e) => {
    e.preventDefault();
    setParticularModalError('');
    if (!particularForm.name.trim()) {
      setParticularModalError('Particular name is required.');
      return;
    }

    try {
      setIsSavingParticular(true);
      let res;
      if (editingParticular) {
        res = await api.put(`/maintenance-master/particulars/${editingParticular.id}`, particularForm);
      } else {
        res = await api.post('/maintenance-master/particulars', particularForm);
      }

      if (res.data.ok) {
        handleCloseParticularModal();
        fetchParticulars();
        fetchSubProducts();
      } else {
        setParticularModalError(res.data.error || 'Failed to save particular.');
      }
    } catch (err) {
      setParticularModalError(err.response?.data?.error || err.message || 'An error occurred.');
    } finally {
      setIsSavingParticular(false);
    }
  };

  const confirmDeleteParticular = (item) => {
    setDeletingParticular(item);
    setIsParticularDeleteModalOpen(true);
  };

  const handleDeleteParticular = async () => {
    if (!deletingParticular) return;
    try {
      const res = await api.delete(`/maintenance-master/particulars/${deletingParticular.id}`);
      if (res.data.ok) {
        setIsParticularDeleteModalOpen(false);
        setDeletingParticular(null);
        fetchParticulars();
        fetchSubProducts();
      } else {
        alert(res.data.error || 'Failed to delete particular.');
      }
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  // ==========================================
  // SUB PRODUCTS HANDLERS
  // ==========================================
  const handleOpenSubModal = (item = null, preselectedParticularId = '') => {
    setSubModalError('');
    if (item) {
      setEditingSub(item);
      setSubForm({
        particularId: item.particular_id,
        name: item.name,
        description: item.description || ''
      });
    } else {
      setEditingSub(null);
      setSubForm({
        particularId: preselectedParticularId || (particulars.length > 0 ? particulars[0].id : ''),
        name: '',
        description: ''
      });
    }
    setIsSubModalOpen(true);
  };

  const handleCloseSubModal = () => {
    setIsSubModalOpen(false);
    setEditingSub(null);
    setSubForm({ particularId: '', name: '', description: '' });
    setSubModalError('');
  };

  const handleSaveSub = async (e) => {
    e.preventDefault();
    setSubModalError('');
    if (!subForm.particularId) {
      setSubModalError('Please select a Particular.');
      return;
    }
    if (!subForm.name.trim()) {
      setSubModalError('Sub product name is required.');
      return;
    }

    try {
      setIsSavingSub(true);
      let res;
      if (editingSub) {
        res = await api.put(`/maintenance-master/sub-products/${editingSub.id}`, subForm);
      } else {
        res = await api.post('/maintenance-master/sub-products', subForm);
      }

      if (res.data.ok) {
        handleCloseSubModal();
        fetchSubProducts();
        fetchParticulars();
      } else {
        setSubModalError(res.data.error || 'Failed to save sub product.');
      }
    } catch (err) {
      setSubModalError(err.response?.data?.error || err.message || 'An error occurred.');
    } finally {
      setIsSavingSub(false);
    }
  };

  const confirmDeleteSub = (item) => {
    setDeletingSub(item);
    setIsSubDeleteModalOpen(true);
  };

  const handleDeleteSub = async () => {
    if (!deletingSub) return;
    try {
      const res = await api.delete(`/maintenance-master/sub-products/${deletingSub.id}`);
      if (res.data.ok) {
        setIsSubDeleteModalOpen(false);
        setDeletingSub(null);
        fetchSubProducts();
        fetchParticulars();
      } else {
        alert(res.data.error || 'Failed to delete sub product.');
      }
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  const totalParticularsCount = particulars.length;
  const totalSubProductsCount = subProducts.length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16 animate-fadeIn">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-primary uppercase tracking-wider mb-1">
            <button 
              onClick={() => navigate('/maintenance-form')}
              className="hover:underline flex items-center gap-1"
            >
              <span>←</span> Back to Maintenance Form
            </button>
          </div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            <span>⚙️</span> MAINTENANCE PRODUCT MASTER
          </h1>
          <p className="text-slate-500 text-sm font-medium mt-1">
            Configure standalone maintenance Particulars and Sub Products for machine service logs
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/maintenance-form')}
            className="btn btn-outline btn-sm rounded-xl font-bold border-slate-200 hover:bg-slate-50 text-slate-700"
          >
            🔧 Maintenance Form
          </button>
          <button
            onClick={() => navigate('/maintenance-history')}
            className="btn btn-outline btn-sm rounded-xl font-bold border-slate-200 hover:bg-slate-50 text-slate-700"
          >
            📜 Service History
          </button>
          {activeTab === 'particulars' ? (
            <button
              onClick={() => handleOpenParticularModal()}
              className="btn btn-primary btn-sm rounded-xl font-bold shadow-md shadow-primary/20 gap-2"
            >
              <span>+</span> Add Particular
            </button>
          ) : (
            <button
              onClick={() => handleOpenSubModal()}
              className="btn btn-primary btn-sm rounded-xl font-bold shadow-md shadow-primary/20 gap-2"
            >
              <span>+</span> Add Sub Product
            </button>
          )}
        </div>
      </div>

      {/* KPI METRICS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card-premium bg-gradient-to-br from-indigo-50/50 via-white to-white">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Particulars</p>
          <div className="flex items-center justify-between mt-2">
            <h3 className="text-3xl font-black text-slate-800">{totalParticularsCount}</h3>
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-lg">
              📂
            </div>
          </div>
        </div>

        <div className="card-premium bg-gradient-to-br from-purple-50/50 via-white to-white">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Configured Sub Products</p>
          <div className="flex items-center justify-between mt-2">
            <h3 className="text-3xl font-black text-slate-800">{totalSubProductsCount}</h3>
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold text-lg">
              🔩
            </div>
          </div>
        </div>

        <div className="card-premium bg-gradient-to-br from-emerald-50/50 via-white to-white">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</p>
          <div className="flex items-center justify-between mt-2">
            <h3 className="text-xl font-black text-emerald-600">Standalone Master</h3>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-lg">
              ✅
            </div>
          </div>
        </div>
      </div>

      {/* TABS SELECTOR */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('particulars')}
          className={`px-6 py-3 font-bold text-sm border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'particulars'
              ? 'border-primary text-primary'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <span>📁</span> Maintenance Particulars ({totalParticularsCount})
        </button>
        <button
          onClick={() => setActiveTab('sub-products')}
          className={`px-6 py-3 font-bold text-sm border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'sub-products'
              ? 'border-primary text-primary'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <span>🔩</span> Sub Products ({totalSubProductsCount})
        </button>
      </div>

      {/* TAB 1: PARTICULARS */}
      {activeTab === 'particulars' && (
        <div className="card-premium space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="relative w-full sm:w-80">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">🔍</span>
              <input
                type="text"
                placeholder="Search particulars..."
                value={searchParticularQuery}
                onChange={(e) => setSearchParticularQuery(e.target.value)}
                className="w-full h-10 pl-9 pr-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-sm"
              />
            </div>
            <button
              onClick={() => handleOpenParticularModal()}
              className="btn btn-primary btn-sm rounded-xl font-bold gap-1.5 w-full sm:w-auto"
            >
              <span>+</span> New Particular
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-100">
            <table className="table table-zebra w-full">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr className="text-slate-500 text-[11px] font-black uppercase tracking-wider">
                  <th className="py-3 px-6 text-left">#</th>
                  <th className="py-3 px-6 text-left">Particular Name</th>
                  <th className="py-3 px-6 text-left">Description</th>
                  <th className="py-3 px-6 text-center">Sub Products Count</th>
                  <th className="py-3 px-6 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loadingParticulars ? (
                  <tr>
                    <td colSpan="5" className="py-12 text-center">
                      <span className="loading loading-spinner text-primary"></span>
                    </td>
                  </tr>
                ) : particulars.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="py-12 text-center text-slate-400 italic">
                      No particulars found. Click "+ New Particular" to create one.
                    </td>
                  </tr>
                ) : (
                  particulars.map((item, index) => (
                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-4 px-6 text-xs font-mono font-bold text-slate-400">{index + 1}</td>
                      <td className="py-4 px-6 text-sm font-bold text-slate-800 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-primary inline-block"></span>
                        {item.name}
                      </td>
                      <td className="py-4 px-6 text-xs text-slate-500 max-w-[250px] truncate">
                        {item.description || '—'}
                      </td>
                      <td className="py-4 px-6 text-center">
                        <button
                          onClick={() => {
                            setSelectedParticularFilter(String(item.id));
                            setActiveTab('sub-products');
                          }}
                          className="badge badge-primary badge-outline font-bold text-xs hover:bg-primary hover:text-white transition-all cursor-pointer"
                        >
                          {item.sub_product_count || 0} Sub Items ↗
                        </button>
                      </td>
                      <td className="py-4 px-6 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleOpenSubModal(null, item.id)}
                            className="btn btn-ghost btn-xs text-emerald-600 hover:bg-emerald-50 rounded-lg"
                            title="Add sub item"
                          >
                            + Add Sub
                          </button>
                          <button
                            onClick={() => handleOpenParticularModal(item)}
                            className="btn btn-ghost btn-xs text-primary hover:bg-primary/10 rounded-lg"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => confirmDeleteParticular(item)}
                            className="btn btn-ghost btn-xs text-red-500 hover:bg-red-50 rounded-lg"
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
      )}

      {/* TAB 2: SUB PRODUCTS */}
      {activeTab === 'sub-products' && (
        <div className="card-premium space-y-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
              <div className="relative w-full sm:w-64">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">🔍</span>
                <input
                  type="text"
                  placeholder="Search sub products..."
                  value={searchSubQuery}
                  onChange={(e) => setSearchSubQuery(e.target.value)}
                  className="w-full h-10 pl-9 pr-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-sm"
                />
              </div>

              <select
                value={selectedParticularFilter}
                onChange={(e) => setSelectedParticularFilter(e.target.value)}
                className="w-full sm:w-56 h-10 px-3 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-sm font-medium"
              >
                <option value="All">All Particulars</option>
                {particulars.map(p => (
                  <option key={p.id} value={String(p.id)}>{p.name}</option>
                ))}
              </select>
            </div>

            <button
              onClick={() => handleOpenSubModal(null, selectedParticularFilter !== 'All' ? selectedParticularFilter : '')}
              className="btn btn-primary btn-sm rounded-xl font-bold gap-1.5 w-full md:w-auto"
            >
              <span>+</span> New Sub Product
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-100">
            <table className="table table-zebra w-full">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr className="text-slate-500 text-[11px] font-black uppercase tracking-wider">
                  <th className="py-3 px-6 text-left">#</th>
                  <th className="py-3 px-6 text-left">Sub Product Name</th>
                  <th className="py-3 px-6 text-left">Linked Particular</th>
                  <th className="py-3 px-6 text-left">Description</th>
                  <th className="py-3 px-6 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loadingSubProducts ? (
                  <tr>
                    <td colSpan="5" className="py-12 text-center">
                      <span className="loading loading-spinner text-primary"></span>
                    </td>
                  </tr>
                ) : subProducts.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="py-12 text-center text-slate-400 italic">
                      No sub products found matching the criteria.
                    </td>
                  </tr>
                ) : (
                  subProducts.map((item, index) => (
                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-4 px-6 text-xs font-mono font-bold text-slate-400">{index + 1}</td>
                      <td className="py-4 px-6 text-sm font-bold text-slate-800">
                        {item.name}
                      </td>
                      <td className="py-4 px-6 text-xs font-semibold">
                        <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg border border-slate-200">
                          {item.particular_name}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-xs text-slate-500 max-w-[250px] truncate">
                        {item.description || '—'}
                      </td>
                      <td className="py-4 px-6 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleOpenSubModal(item)}
                            className="btn btn-ghost btn-xs text-primary hover:bg-primary/10 rounded-lg"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => confirmDeleteSub(item)}
                            className="btn btn-ghost btn-xs text-red-500 hover:bg-red-50 rounded-lg"
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
      )}

      {/* MODAL: ADD / EDIT PARTICULAR */}
      {isParticularModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-scaleUp">
            <div className="bg-primary px-6 py-4 flex items-center justify-between text-white">
              <h3 className="font-black text-lg">
                {editingParticular ? 'Edit Particular' : 'Add Maintenance Particular'}
              </h3>
              <button onClick={handleCloseParticularModal} className="text-white/80 hover:text-white text-xl">✕</button>
            </div>

            <form onSubmit={handleSaveParticular} className="p-6 space-y-4">
              {particularModalError && (
                <div className="alert alert-error text-xs p-3 rounded-xl">
                  {particularModalError}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 uppercase">Particular Name *</label>
                <input
                  type="text"
                  value={particularForm.name}
                  onChange={(e) => setParticularForm({ ...particularForm, name: e.target.value })}
                  placeholder="e.g. Filters, Cleaning, Compressor..."
                  className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-slate-800 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-sm font-medium"
                  required
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 uppercase">Description (Optional)</label>
                <textarea
                  value={particularForm.description}
                  onChange={(e) => setParticularForm({ ...particularForm, description: e.target.value })}
                  placeholder="Details or usage instructions..."
                  rows={3}
                  className="w-full p-3 rounded-xl border border-slate-200 bg-white text-slate-800 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-sm font-medium resize-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleCloseParticularModal}
                  className="btn btn-ghost btn-sm rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingParticular}
                  className="btn btn-primary btn-sm rounded-xl font-bold px-5"
                >
                  {isSavingParticular ? 'Saving...' : editingParticular ? 'Update Particular' : 'Save Particular'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT SUB PRODUCT */}
      {isSubModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-scaleUp">
            <div className="bg-primary px-6 py-4 flex items-center justify-between text-white">
              <h3 className="font-black text-lg">
                {editingSub ? 'Edit Sub Product' : 'Add Maintenance Sub Product'}
              </h3>
              <button onClick={handleCloseSubModal} className="text-white/80 hover:text-white text-xl">✕</button>
            </div>

            <form onSubmit={handleSaveSub} className="p-6 space-y-4">
              {subModalError && (
                <div className="alert alert-error text-xs p-3 rounded-xl">
                  {subModalError}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 uppercase">Linked Particular *</label>
                <select
                  value={subForm.particularId}
                  onChange={(e) => setSubForm({ ...subForm, particularId: e.target.value })}
                  className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-slate-800 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-sm font-medium"
                  required
                >
                  <option value="">Select Particular</option>
                  {particulars.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 uppercase">Sub Product Name *</label>
                <input
                  type="text"
                  value={subForm.name}
                  onChange={(e) => setSubForm({ ...subForm, name: e.target.value })}
                  placeholder="e.g. 20 Micron, Oil Replacement, Greasing..."
                  className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-slate-800 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-sm font-medium"
                  required
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 uppercase">Description (Optional)</label>
                <textarea
                  value={subForm.description}
                  onChange={(e) => setSubForm({ ...subForm, description: e.target.value })}
                  placeholder="Notes or model specifications..."
                  rows={3}
                  className="w-full p-3 rounded-xl border border-slate-200 bg-white text-slate-800 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-sm font-medium resize-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleCloseSubModal}
                  className="btn btn-ghost btn-sm rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingSub}
                  className="btn btn-primary btn-sm rounded-xl font-bold px-5"
                >
                  {isSavingSub ? 'Saving...' : editingSub ? 'Update Sub Product' : 'Save Sub Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DELETE CONFIRMATION PARTICULAR */}
      {isParticularDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-500 flex items-center justify-center mx-auto text-2xl font-bold">
              ⚠️
            </div>
            <h3 className="font-bold text-lg text-slate-800">Delete Particular?</h3>
            <p className="text-sm text-slate-500">
              Are you sure you want to delete <b className="text-slate-800">"{deletingParticular?.name}"</b>? All linked sub products will also be removed.
            </p>
            <div className="flex justify-center gap-3 pt-2">
              <button
                onClick={() => setIsParticularDeleteModalOpen(false)}
                className="btn btn-ghost btn-sm rounded-xl font-bold"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteParticular}
                className="btn btn-error btn-sm rounded-xl font-bold text-white px-5"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: DELETE CONFIRMATION SUB PRODUCT */}
      {isSubDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-500 flex items-center justify-center mx-auto text-2xl font-bold">
              ⚠️
            </div>
            <h3 className="font-bold text-lg text-slate-800">Delete Sub Product?</h3>
            <p className="text-sm text-slate-500">
              Are you sure you want to delete <b className="text-slate-800">"{deletingSub?.name}"</b>?
            </p>
            <div className="flex justify-center gap-3 pt-2">
              <button
                onClick={() => setIsSubDeleteModalOpen(false)}
                className="btn btn-ghost btn-sm rounded-xl font-bold"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteSub}
                className="btn btn-error btn-sm rounded-xl font-bold text-white px-5"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MaintenanceMaster;
