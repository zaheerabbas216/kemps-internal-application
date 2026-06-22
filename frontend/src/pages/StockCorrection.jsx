import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';

const StockCorrection = () => {
  const navigate = useNavigate();

  // Selected date
  const getTodayISTStr = () => {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const istDate = new Date(now.getTime() + (330 + offset) * 60000);
    return istDate.toISOString().split('T')[0];
  };

  const [date, setDate] = useState(getTodayISTStr());
  
  // Master categories (Products) & raw materials (Sub Products)
  const [categories, setCategories] = useState([]);
  const [allMaterials, setAllMaterials] = useState([]);

  // Selections
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [selectedRmId, setSelectedRmId] = useState('');

  // Available stock from ledger
  const [openingStock, setOpeningStock] = useState(0);
  const [openingBagsBox, setOpeningBagsBox] = useState(0);
  const [conversionFactor, setConversionFactor] = useState(1);
  const [ledgerUnit, setLedgerUnit] = useState('—');
  const [loadingLedger, setLoadingLedger] = useState(false);

  // Present physical counts
  const [physicalBagsBox, setPhysicalBagsBox] = useState('');
  const [physicalStock, setPhysicalStock] = useState('');
  const [remarks, setRemarks] = useState('');

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const getSecondUnitName = (catName) => {
    const name = String(catName || '').toLowerCase().trim();
    if (name === 'preforms') return 'BAGS';
    if (name === 'labels') return 'ROLLS';
    if (name === 'caps') return 'BOXES';
    if (name === 'shrink rolls') return 'ROLLS';
    if (name === 'handles') return 'BAGS';
    if (name === 'box') return 'CUTS';
    if (name === 'bottles') return 'BAGS';
    return null;
  };

  // Fetch lists on load
  useEffect(() => {
    fetchProductsAndCategories();
  }, []);

  // Fetch opening stock when Date or Sub Product selection changes
  useEffect(() => {
    if (date && selectedRmId) {
      fetchAvailableStock();
    } else {
      setOpeningStock(0);
      setOpeningBagsBox(0);
      setConversionFactor(1);
      setLedgerUnit('—');
    }
  }, [date, selectedRmId]);

  // Handle present bags change for Preforms auto-calculation
  useEffect(() => {
    const category = categories.find(c => c.id === parseInt(selectedCategoryId, 10));
    const isPreforms = category && category.name.toLowerCase() === 'preforms';

    if (isPreforms) {
      const bags = parseFloat(physicalBagsBox) || 0;
      if (bags > 0 && conversionFactor > 0) {
        const calculatedMain = Math.round(bags * conversionFactor);
        setPhysicalStock(calculatedMain.toString());
      } else {
        setPhysicalStock('0');
      }
    }
  }, [physicalBagsBox, conversionFactor, selectedRmId, selectedCategoryId, categories]);

  const fetchProductsAndCategories = async () => {
    try {
      const catRes = await api.get('/raw-materials/categories');
      const matRes = await api.get('/raw-materials', { params: { limit: 200, activeOnly: true } });
      
      if (catRes.data.ok) setCategories(catRes.data.categories || []);
      if (matRes.data.ok) setAllMaterials(matRes.data.materials || []);
    } catch (err) {
      console.error('Failed to fetch product master items:', err);
    }
  };

  const fetchAvailableStock = async () => {
    setLoadingLedger(true);
    setErrorMsg('');
    try {
      const res = await api.get('/stock-corrections/available-stock', {
        params: {
          date,
          rawMaterialId: selectedRmId
        }
      });
      if (res.data.ok) {
        setOpeningStock(res.data.openingStock);
        setOpeningBagsBox(res.data.openingBagsBox);
        setConversionFactor(res.data.conversionFactor || 1);
        setLedgerUnit(res.data.unit);
      }
    } catch (err) {
      console.error('Failed to fetch available stock:', err);
      setErrorMsg(err.response?.data?.error || 'Failed to fetch current stock levels.');
    } finally {
      setLoadingLedger(false);
    }
  };

  const handleCategoryChange = (e) => {
    setSelectedCategoryId(e.target.value);
    setSelectedRmId('');
    setPhysicalBagsBox('');
    setPhysicalStock('');
  };

  const handleRmChange = (e) => {
    setSelectedRmId(e.target.value);
    setPhysicalBagsBox('');
    setPhysicalStock('');
  };

  const handleSaveCorrection = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!date) return setErrorMsg('Date is required.');
    if (!selectedCategoryId) return setErrorMsg('Product category is required.');
    if (!selectedRmId) return setErrorMsg('Sub-product is required.');
    if (physicalBagsBox === '' || isNaN(parseFloat(physicalBagsBox))) {
      return setErrorMsg('Present BAGS/BOX/ROLLS/CUTS is required.');
    }
    if (physicalStock === '' || isNaN(parseFloat(physicalStock))) {
      return setErrorMsg('Present Stock quantity is required.');
    }
    if (!remarks || !remarks.trim()) {
      return setErrorMsg('Remark is required (Remarks box is mandatory).');
    }

    const currentDiff = parseFloat(physicalStock) - openingStock;

    const payload = {
      correctionDate: date,
      rawMaterialId: parseInt(selectedRmId, 10),
      openingStock,
      openingBagsBox,
      physicalStock: parseFloat(physicalStock),
      physicalBagsBox: parseFloat(physicalBagsBox),
      differenceQty: currentDiff,
      remarks: remarks.trim()
    };

    setSaving(true);
    try {
      const res = await api.post('/stock-corrections', payload);
      if (res.data.ok) {
        setSuccessMsg('Stock correction saved successfully!');
        setRemarks('');
        setPhysicalBagsBox('');
        setPhysicalStock('');
        // Refresh available stock
        await fetchAvailableStock();
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.error || 'Failed to save stock correction.');
    } finally {
      setSaving(false);
    }
  };

  // Difference and highlight calculations
  const parsedPhysical = parseFloat(physicalStock) || 0;
  const difference = parsedPhysical - openingStock;
  const hasInput = physicalBagsBox !== '' || (physicalStock !== '' && physicalStock !== '0');
  const uiDifference = hasInput ? (parsedPhysical - Math.abs(openingStock)) : 0;
  const showDifference = true;

  const selectedCategory = categories.find(c => c.id === parseInt(selectedCategoryId, 10));
  const secondUnitName = selectedCategory ? getSecondUnitName(selectedCategory.name) : null;
  const isPreforms = selectedCategory && selectedCategory.name.toLowerCase() === 'preforms';

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl mx-auto pb-12">
      {/* HEADER & TOP ACTIONS */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase">STOCK CORRECTION</h1>
          <p className="text-slate-500 text-sm font-medium mt-1">Correct stock levels against physical count</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            type="button"
            onClick={() => navigate('/inventory')}
            className="btn-premium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs px-4 h-12 flex items-center gap-1.5 shadow-sm"
          >
            ← Back
          </button>
          <button 
            type="button"
            onClick={() => navigate('/stock-correction-history')}
            className="btn-premium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs px-4 h-12 flex items-center gap-1.5 shadow-sm"
          >
            📜 History
          </button>
        </div>
      </div>

      {/* FORM CONTROLLER */}
      <form onSubmit={handleSaveCorrection} className="space-y-6">
        {/* PRODUCT SELECTION SECTION */}
        <div className="card-premium space-y-4">
          <div className="text-[11px] font-black text-slate-450 uppercase tracking-widest border-b border-slate-100 pb-2.5 flex items-center gap-1.5">
            <span>📦</span> PRODUCT SELECTION
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Date Input */}
            <div className="space-y-1.5">
              <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                Date *
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="input-premium"
                required
              />
            </div>

            {/* Product Category Dropdown */}
            <div className="space-y-1.5">
              <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                Product *
              </label>
              <select
                value={selectedCategoryId}
                onChange={handleCategoryChange}
                className="input-premium bg-white"
                required
              >
                <option value="">-- Select Product --</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>

            {/* Sub Product Dropdown */}
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                Sub Product *
              </label>
              <select
                value={selectedRmId}
                onChange={handleRmChange}
                className="input-premium bg-white"
                disabled={!selectedCategoryId}
                required
              >
                <option value="">-- Select Sub Product --</option>
                {allMaterials
                  .filter(m => m.category_id === parseInt(selectedCategoryId, 10))
                  .map(m => (
                    <option key={m.id} value={m.id}>{m.sub_product_name}</option>
                  ))
                }
              </select>
            </div>
          </div>
        </div>

        {/* OPENING STOCK (FROM LEDGER) SECTION */}
        <div className="card-premium space-y-4 bg-slate-50/40">
          <div className="text-[11px] font-black text-slate-450 uppercase tracking-widest border-b border-slate-100 pb-2.5 flex items-center gap-1.5">
            <span>📁</span> OPENING STOCK (FROM RAW MATERIAL LEDGER)
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Opening Stock Pieces/KG/Rolls */}
            <div className="bg-white border border-slate-150 p-4 rounded-xl flex items-center justify-between shadow-sm">
              <div>
                <span className="text-[10px] font-bold text-slate-400 block uppercase">Opening Stock</span>
                <span className="text-lg font-extrabold text-slate-700">
                  {loadingLedger ? (
                    <span className="loading loading-spinner loading-xs text-slate-400"></span>
                  ) : selectedRmId ? (
                    `${openingStock.toLocaleString()} ${ledgerUnit}`
                  ) : (
                    '—'
                  )}
                </span>
              </div>
              <div className="text-2xl">📦</div>
            </div>

            {/* Opening Stock Bags/Boxes */}
            <div className="bg-white border border-slate-150 p-4 rounded-xl flex items-center justify-between shadow-sm">
              <div>
                <span className="text-[10px] font-bold text-slate-400 block uppercase">BAGS/BOX/ROLLS/CUTS</span>
                <span className="text-lg font-extrabold text-slate-700">
                  {loadingLedger ? (
                    <span className="loading loading-spinner loading-xs text-slate-400"></span>
                  ) : selectedRmId && secondUnitName ? (
                    `${openingBagsBox.toLocaleString()} ${secondUnitName.toLowerCase()}`
                  ) : (
                    '—'
                  )}
                </span>
              </div>
              <div className="text-2xl">📁</div>
            </div>
          </div>
        </div>

        {/* PRESENT STOCK (PHYSICAL COUNT) SECTION */}
        <div className="card-premium space-y-4">
          <div className="text-[11px] font-black text-slate-450 uppercase tracking-widest border-b border-slate-100 pb-2.5 flex items-center gap-1.5">
            <span>🔢</span> PRESENT STOCK (PHYSICAL COUNT)
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* BAGS/BOX/ROLLS/CUTS input */}
            <div className="space-y-1.5">
              <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                Present BAGS/BOX/ROLLS/CUTS *
              </label>
              <input
                type="number"
                step="any"
                value={physicalBagsBox}
                onChange={(e) => setPhysicalBagsBox(e.target.value)}
                placeholder="Enter bags/box/rolls/cuts"
                className="input-premium font-medium"
                disabled={!selectedRmId}
                required
              />
            </div>

            {/* Present Stock pieces/KG input */}
            <div className="space-y-1.5">
              <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                Present Stock *
              </label>
              <input
                type="number"
                step="any"
                value={physicalStock}
                onChange={(e) => setPhysicalStock(e.target.value)}
                placeholder="Enter current count"
                className={`input-premium font-bold ${isPreforms ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : ''}`}
                readOnly={isPreforms}
                disabled={!selectedRmId}
                required
              />
              {isPreforms && (
                <span className="text-[10px] font-bold text-slate-400 mt-1 block">
                  Calculated automatically (Bags * 25 * (1000 / weight)).
                </span>
              )}
            </div>

            {/* Remark Field */}
            <div className="md:col-span-2 space-y-1.5">
              <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                Remark *
              </label>
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Reason for correction... e.g. damaged material found, physical stock correction during daily closing"
                className="w-full h-24 p-4 rounded-xl border border-slate-200 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium resize-none"
                disabled={!selectedRmId}
                required
              />
            </div>
          </div>
        </div>

        {/* DIFFERENCE CALCULATION DISPLAY */}
        {showDifference && selectedRmId && (
          <div className="animate-fade-in">
            {uiDifference < 0 ? (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-5 flex items-center justify-between text-red-700">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider block text-red-500">Difference (Wastage)</span>
                  <span className="text-2xl font-black">{uiDifference.toLocaleString()} {ledgerUnit}</span>
                </div>
                <div className="bg-red-100 text-red-700 px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider">
                  ⚠️ Shortage (Wastage Entry)
                </div>
              </div>
            ) : uiDifference > 0 ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex items-center justify-between text-emerald-800">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider block text-emerald-500">Difference (Excess)</span>
                  <span className="text-2xl font-black">+{uiDifference.toLocaleString()} {ledgerUnit}</span>
                </div>
                <div className="bg-emerald-100 text-emerald-800 px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider">
                  ✅ Excess (Stock Adjustment)
                </div>
              </div>
            ) : (
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 flex items-center justify-between text-blue-800">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider block text-blue-500">Difference</span>
                  <span className="text-2xl font-black">0 {ledgerUnit}</span>
                </div>
                <div className="bg-blue-100 text-blue-800 px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider">
                  ℹ️ Matches Perfectly
                </div>
              </div>
            )}
          </div>
        )}

        {/* FEEDBACK MSG */}
        {errorMsg && (
          <div className="bg-red-50 text-red-600 px-4 py-3.5 rounded-xl text-xs font-semibold flex items-center gap-2 border border-red-100 animate-fade-in">
            <span>⚠️</span>
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="bg-emerald-50 text-emerald-600 px-4 py-3.5 rounded-xl text-xs font-semibold flex items-center gap-2 border border-emerald-100 animate-fade-in">
            <span>✅</span>
            <span>{successMsg}</span>
          </div>
        )}

        {/* SAVE BUTTON */}
        <button
          type="submit"
          disabled={saving || !selectedRmId}
          className={`btn-premium w-full h-14 text-sm font-bold uppercase tracking-wider transition-all duration-200 flex items-center justify-center gap-2 shadow-lg ${
            saving || !selectedRmId
              ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
              : 'btn-primary-premium shadow-primary/25'
          }`}
        >
          {saving ? (
            <span className="loading loading-spinner text-white"></span>
          ) : (
            <>
              <span>💾</span>
              Save Stock Correction
            </>
          )}
        </button>
      </form>
    </div>
  );
};

export default StockCorrection;
