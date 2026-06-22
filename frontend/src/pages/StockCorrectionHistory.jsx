import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';

const StockCorrectionHistory = () => {
  const navigate = useNavigate();

  // Filters
  const [filterDate, setFilterDate] = useState('');
  const [filterCategoryId, setFilterCategoryId] = useState('');
  const [filterRmId, setFilterRmId] = useState('');

  // Dropdown lists
  const [categories, setCategories] = useState([]);
  const [allMaterials, setAllMaterials] = useState([]);

  // Data states
  const [corrections, setCorrections] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch lists
  useEffect(() => {
    fetchProductsAndCategories();
  }, []);

  // Fetch history when filters change
  useEffect(() => {
    fetchHistory();
  }, [filterDate, filterCategoryId, filterRmId]);

  const fetchProductsAndCategories = async () => {
    try {
      const catRes = await api.get('/raw-materials/categories');
      const matRes = await api.get('/raw-materials', { params: { limit: 200, activeOnly: true } });
      
      if (catRes.data.ok) setCategories(catRes.data.categories || []);
      if (matRes.data.ok) setAllMaterials(matRes.data.materials || []);
    } catch (err) {
      console.error('Failed to fetch filter products:', err);
    }
  };

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const res = await api.get('/stock-corrections/history', {
        params: {
          date: filterDate,
          categoryId: filterCategoryId,
          rawMaterialId: filterRmId
        }
      });
      if (res.data.ok) {
        setCorrections(res.data.corrections || []);
      }
    } catch (err) {
      console.error('Failed to fetch corrections history:', err);
      alert('Failed to load corrections history.');
    } finally {
      setLoading(false);
    }
  };

  const handleCategoryChange = (e) => {
    setFilterCategoryId(e.target.value);
    setFilterRmId('');
  };

  const handleClearFilters = () => {
    setFilterDate('');
    setFilterCategoryId('');
    setFilterRmId('');
  };

  const formatDateDDMMYYYY = (dateStr) => {
    if (!dateStr) return '—';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto pb-12">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate('/stock-correction')}
            className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all shadow-sm"
          >
            ← Back
          </button>
          <div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase">STOCK CORRECTION HISTORY</h1>
            <p className="text-slate-500 text-xs font-semibold mt-1">Audit log of all physical count corrections and adjustments</p>
          </div>
        </div>
      </div>

      {/* FILTER CONTROLS CARD */}
      <div className="card-premium space-y-4">
        <div className="text-[11px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2 flex items-center justify-between">
          <span>🔍 FILTER HISTORICAL ENTRIES</span>
          {(filterDate || filterCategoryId || filterRmId) && (
            <button 
              onClick={handleClearFilters}
              className="text-[10px] font-bold text-red-500 hover:underline cursor-pointer uppercase"
            >
              Clear Filters
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Date Filter */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-450 block uppercase tracking-wider">
              Date Filter
            </label>
            <input 
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="input-premium"
            />
          </div>

          {/* Product Category Filter */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-450 block uppercase tracking-wider">
              Product Filter
            </label>
            <select
              value={filterCategoryId}
              onChange={handleCategoryChange}
              className="input-premium bg-white"
            >
              <option value="">All Products</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>

          {/* Sub Product Filter */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-450 block uppercase tracking-wider">
              Sub Product Filter
            </label>
            <select
              value={filterRmId}
              onChange={(e) => setFilterRmId(e.target.value)}
              className="input-premium bg-white"
              disabled={!filterCategoryId}
            >
              <option value="">All Sub Products</option>
              {allMaterials
                .filter(m => m.category_id === parseInt(filterCategoryId, 10))
                .map(m => (
                  <option key={m.id} value={m.id}>{m.sub_product_name}</option>
                ))
              }
            </select>
          </div>
        </div>
      </div>

      {/* HISTORY DATA TABLE */}
      <div className="card-premium">
        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="table table-zebra w-full overflow-hidden text-xs">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr className="text-slate-500 font-black uppercase tracking-wider text-[10px]">
                <th className="py-4 px-5 text-left">Date</th>
                <th className="py-4 px-5 text-left">Product</th>
                <th className="py-4 px-5 text-left">Sub Product</th>
                <th className="py-4 px-5 text-right">Opening Stock</th>
                <th className="py-4 px-5 text-right">Physical Stock</th>
                <th className="py-4 px-5 text-right">Difference</th>
                <th className="py-4 px-5 text-center">Type</th>
                <th className="py-4 px-5 text-left">Remark</th>
                <th className="py-4 px-5 text-center">User</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr>
                  <td colSpan="9" className="py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                       <span className="loading loading-spinner text-primary"></span>
                       <span className="text-slate-400 text-sm font-medium">Fetching corrections audit log...</span>
                    </div>
                  </td>
                </tr>
              ) : corrections.length === 0 ? (
                <tr>
                  <td colSpan="9" className="py-20 text-center text-slate-400 font-medium italic">
                    No stock corrections recorded for the selected filters.
                  </td>
                </tr>
              ) : (
                corrections.map((corr) => {
                  const isPreforms = corr.category_name.toLowerCase() === 'preforms';
                  const visualDiff = corr.physical_stock - Math.abs(corr.opening_stock);
                  return (
                    <tr key={corr.id} className="hover:bg-blue-50/20 transition-colors">
                      <td className="py-4 px-5 font-semibold text-slate-700" data-label="Date">
                        {formatDateDDMMYYYY(corr.correction_date)}
                      </td>
                      <td className="py-4 px-5 font-bold text-slate-800" data-label="Product">
                        {corr.category_name}
                      </td>
                      <td className="py-4 px-5 font-bold text-slate-800" data-label="Sub Product">
                        {corr.sub_product_name}
                      </td>
                      <td className="py-4 px-5 text-right font-semibold text-slate-600" data-label="Opening Stock">
                        <div>{corr.opening_stock.toLocaleString()}</div>
                        {isPreforms && (
                          <div className="text-[10px] text-slate-400">({corr.opening_bags_box} bags)</div>
                        )}
                      </td>
                      <td className="py-4 px-5 text-right font-black text-slate-700" data-label="Physical Stock">
                        <div>{corr.physical_stock.toLocaleString()}</div>
                        {isPreforms && (
                          <div className="text-[10px] text-slate-400">({corr.physical_bags_box} bags)</div>
                        )}
                      </td>
                      <td className={`py-4 px-5 text-right font-extrabold ${visualDiff < 0 ? 'text-red-650' : visualDiff > 0 ? 'text-emerald-600' : 'text-slate-500'}`} data-label="Difference">
                        {visualDiff > 0 ? `+${visualDiff.toLocaleString()}` : visualDiff.toLocaleString()}
                      </td>
                      <td className="py-4 px-5 text-center" data-label="Type">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                          visualDiff > 0 
                            ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' 
                            : visualDiff < 0
                              ? 'bg-red-50 text-red-650 border border-red-100'
                              : 'bg-blue-50 text-blue-600 border border-blue-100'
                        }`}>
                          {visualDiff > 0 ? 'EXCESS' : visualDiff < 0 ? 'WASTAGE' : 'MATCH'}
                        </span>
                      </td>
                      <td className="py-4 px-5 text-slate-500 max-w-[200px] truncate" title={corr.remarks} data-label="Remark">
                        {corr.remarks}
                      </td>
                      <td className="py-4 px-5 text-center text-slate-500 font-semibold" data-label="User">
                        {corr.created_by}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default StockCorrectionHistory;
