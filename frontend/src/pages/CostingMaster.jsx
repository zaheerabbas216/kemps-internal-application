import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';

const CostingMaster = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('raw-materials'); // raw-materials | finished-products | bulk-assign | templates | history | analysis | pl

  // Shared loaders/errors
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // -----------------------------------------------------------------
  // 1. RAW MATERIALS COSTING STATE
  // -----------------------------------------------------------------
  const [rmMaterials, setRmMaterials] = useState([]);
  const [rmSearch, setRmSearch] = useState('');

  // -----------------------------------------------------------------
  // 2. FINISHED PRODUCTS COSTING STATE
  // -----------------------------------------------------------------
  const [fpSheets, setFpSheets] = useState([]);
  const [fpSearch, setFpSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null); // Product to edit cost sheet for
  const [costSheetItems, setCostSheetItems] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');

  // -----------------------------------------------------------------
  // 3. BULK COST ASSIGNMENT STATE
  // -----------------------------------------------------------------
  const [bulkProductIds, setBulkProductIds] = useState([]);
  const [bulkComponentName, setBulkComponentName] = useState('');
  const [bulkComponentType, setBulkComponentType] = useState('RAW_MATERIAL');
  const [bulkRawMaterialId, setBulkRawMaterialId] = useState('');
  const [bulkQuantity, setBulkQuantity] = useState('1.0000');
  const [bulkCostValue, setBulkCostValue] = useState('0.00');

  // -----------------------------------------------------------------
  // 4. COST TEMPLATES STATE
  // -----------------------------------------------------------------
  const [templates, setTemplates] = useState([]);
  const [editingTemplate, setEditingTemplate] = useState(null); // { id, name, components: [] }
  const [newTemplateName, setNewTemplateName] = useState('');
  const [templateComponents, setTemplateComponents] = useState(['']);

  // -----------------------------------------------------------------
  // 5. COST HISTORY STATE
  // -----------------------------------------------------------------
  const [historyLogs, setHistoryLogs] = useState([]);

  // -----------------------------------------------------------------
  // 6. COST ANALYSIS STATE
  // -----------------------------------------------------------------
  const [analysisData, setAnalysisData] = useState([]);

  // -----------------------------------------------------------------
  // 7. P&L STATE
  // -----------------------------------------------------------------
  const getFirstDayOfMonth = () => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
  };
  const getTodayStr = () => new Date().toISOString().split('T')[0];

  const [plStartDate, setPlStartDate] = useState(getFirstDayOfMonth());
  const [plEndDate, setPlEndDate] = useState(getTodayStr());
  const [plData, setPlData] = useState(null);

  // -----------------------------------------------------------------
  // EFFECTS / DATA FETCHING dispatcher
  // -----------------------------------------------------------------
  useEffect(() => {
    fetchTabSpecificData();
  }, [activeTab]);

  const fetchTabSpecificData = () => {
    setErrorMsg('');
    setSuccessMsg('');
    if (activeTab === 'raw-materials') {
      fetchRawMaterials();
    } else if (activeTab === 'finished-products') {
      fetchFinishedProductSheets();
    } else if (activeTab === 'bulk-assign') {
      fetchFinishedProductSheets(); // To list check-box products
      fetchRawMaterialsListOnly(); // For RM dropdown selector
    } else if (activeTab === 'templates') {
      fetchTemplates();
    } else if (activeTab === 'history') {
      fetchHistory();
    } else if (activeTab === 'analysis') {
      fetchAnalysis();
    } else if (activeTab === 'pl') {
      fetchPLReport();
    }
  };

  const showSuccess = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  // -----------------------------------------------------------------
  // API FETCH CALLS
  // -----------------------------------------------------------------
  const fetchRawMaterials = async () => {
    try {
      setLoading(true);
      const res = await api.get('/costing/raw-materials');
      if (res.data.ok) {
        setRmMaterials(res.data.materials || []);
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.error || 'Failed to fetch raw materials costing configs.');
    } finally {
      setLoading(false);
    }
  };

  const [rawMaterialsDropdown, setRawMaterialsDropdown] = useState([]);
  const fetchRawMaterialsListOnly = async () => {
    try {
      const res = await api.get('/costing/raw-materials');
      if (res.data.ok) {
        setRawMaterialsDropdown(res.data.materials || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchFinishedProductSheets = async () => {
    try {
      setLoading(true);
      const res = await api.get('/costing/sheets');
      if (res.data.ok) {
        setFpSheets(res.data.sheets || []);
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.error || 'Failed to fetch finished products cost sheets.');
    } finally {
      setLoading(false);
    }
  };

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const res = await api.get('/costing/templates');
      if (res.data.ok) {
        setTemplates(res.data.templates || []);
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.error || 'Failed to fetch templates.');
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const res = await api.get('/costing/history');
      if (res.data.ok) {
        setHistoryLogs(res.data.history || []);
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.error || 'Failed to fetch history logs.');
    } finally {
      setLoading(false);
    }
  };

  const fetchAnalysis = async () => {
    try {
      setLoading(true);
      const res = await api.get('/costing/analysis');
      if (res.data.ok) {
        setAnalysisData(res.data.analysis || []);
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.error || 'Failed to fetch margin analysis.');
    } finally {
      setLoading(false);
    }
  };

  const fetchPLReport = async () => {
    try {
      setLoading(true);
      const res = await api.get('/costing/pl', {
        params: { startDate: plStartDate, endDate: plEndDate }
      });
      if (res.data.ok) {
        setPlData(res.data.data);
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.error || 'Failed to fetch Profit & Loss report.');
    } finally {
      setLoading(false);
    }
  };

  // -----------------------------------------------------------------
  // 1. HANDLERS: RAW MATERIALS COSTING
  // -----------------------------------------------------------------
  const handleRmRuleChange = (idx, field, val) => {
    const updated = [...rmMaterials];
    updated[idx][field] = val;
    // Recalculate effective cost live
    const rate = updated[idx].latest_purchase_rate;
    const manual = parseFloat(updated[idx].manual_cost) || 0;
    updated[idx].effective_cost = updated[idx].use_purchase_cost && rate !== null ? rate : manual;
    setRmMaterials(updated);
  };

  const handleSaveRmCosting = async () => {
    try {
      setLoading(true);
      const configs = rmMaterials.map(m => ({
        rawMaterialId: m.id,
        usePurchaseCost: m.use_purchase_cost,
        manualCost: m.manual_cost
      }));

      const res = await api.post('/costing/raw-materials', { configs });
      if (res.data.ok) {
        showSuccess('Raw material costing configurations saved successfully!');
        fetchRawMaterials();
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.error || 'Failed to save raw material costing rules.');
    } finally {
      setLoading(false);
    }
  };

  // -----------------------------------------------------------------
  // 2. HANDLERS: FINISHED PRODUCT COST SHEET MODAL
  // -----------------------------------------------------------------
  const openEditCostSheetModal = async (product) => {
    setSelectedProduct(product);
    setSelectedTemplateId('');
    setErrorMsg('');
    setSuccessMsg('');
    setRawMaterialsListOnly(); // Pre-fetch dropdown raw materials

    try {
      setLoading(true);
      const res = await api.get(`/costing/sheets/${product.id}`);
      if (res.data.ok) {
        if (res.data.sheet) {
          setCostSheetItems(res.data.items || []);
        } else {
          setCostSheetItems([]);
        }
      }
      // Also fetch templates for populate dropdown
      const tempRes = await api.get('/costing/templates');
      if (tempRes.data.ok) {
        setTemplates(tempRes.data.templates || []);
      }
    } catch (err) {
      setErrorMsg('Failed to load cost sheet items.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddCostSheetRow = () => {
    setCostSheetItems([
      ...costSheetItems,
      { component_name: '', component_type: 'RAW_MATERIAL', raw_material_id: '', quantity: 1.0000, cost_value: 0.00 }
    ]);
  };

  const handleRemoveCostSheetRow = (idx) => {
    const updated = costSheetItems.filter((_, i) => i !== idx);
    setCostSheetItems(updated);
  };

  const handleCostSheetItemChange = (idx, field, val) => {
    const updated = [...costSheetItems];
    updated[idx][field] = val;

    if (field === 'component_type' && val === 'OVERHEAD') {
      updated[idx].raw_material_id = '';
      updated[idx].quantity = 1.0000;
    }

    setCostSheetItems(updated);
  };

  const handleApplyTemplate = (templateId) => {
    setSelectedTemplateId(templateId);
    if (!templateId) return;

    const t = templates.find(temp => temp.id === parseInt(templateId, 10));
    if (!t) return;

    // Build new rows from template component names
    const newRows = t.components.map(compName => {
      // Try to find if this component already exists in current items
      const existing = costSheetItems.find(item => item.component_name.toLowerCase() === compName.toLowerCase());
      if (existing) return { ...existing };
      
      // Look up if the component name matches any raw material name to auto-link
      const matchedRm = rawMaterialsDropdown.find(rm => 
        rm.sub_product_name.toLowerCase().includes(compName.toLowerCase()) || 
        compName.toLowerCase().includes(rm.sub_product_name.toLowerCase())
      );

      return {
        component_name: compName,
        component_type: matchedRm ? 'RAW_MATERIAL' : 'OVERHEAD',
        raw_material_id: matchedRm ? matchedRm.id : '',
        quantity: 1.0000,
        cost_value: 0.00
      };
    });

    setCostSheetItems(newRows);
  };

  const calculateLiveTotalCost = () => {
    return costSheetItems.reduce((sum, item) => {
      if (item.component_type === 'RAW_MATERIAL') {
        const rm = rawMaterialsDropdown.find(r => r.id === parseInt(item.raw_material_id, 10));
        const cost = rm ? (rm.effective_cost || rm.latest_purchase_rate || rm.manual_cost || 0) : 0;
        return sum + (cost * (parseFloat(item.quantity) || 0));
      } else {
        return sum + (parseFloat(item.cost_value) || 0);
      }
    }, 0);
  };

  const handleSaveCostSheet = async () => {
    if (!selectedProduct) return;
    try {
      setLoading(true);
      const res = await api.post('/costing/sheets', {
        productId: selectedProduct.id,
        items: costSheetItems.map(it => ({
          componentName: it.component_name,
          componentType: it.component_type,
          rawMaterialId: it.raw_material_id || null,
          quantity: it.quantity,
          costValue: it.cost_value
        }))
      });
      if (res.data.ok) {
        showSuccess(`Cost sheet for ${selectedProduct.name} saved successfully!`);
        setSelectedProduct(null);
        fetchFinishedProductSheets();
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.error || 'Failed to save cost sheet.');
    } finally {
      setLoading(false);
    }
  };

  // -----------------------------------------------------------------
  // 3. HANDLERS: BULK COST ASSIGNMENT
  // -----------------------------------------------------------------
  const handleToggleBulkProductSelection = (productId) => {
    if (bulkProductIds.includes(productId)) {
      setBulkProductIds(bulkProductIds.filter(id => id !== productId));
    } else {
      setBulkProductIds([...bulkProductIds, productId]);
    }
  };

  const handleSelectAllBulkProducts = () => {
    if (bulkProductIds.length === fpSheets.length) {
      setBulkProductIds([]);
    } else {
      setBulkProductIds(fpSheets.map(p => p.id));
    }
  };

  const handleApplyBulkAssignment = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (bulkProductIds.length === 0) {
      setErrorMsg('Please select at least one product.');
      return;
    }
    if (!bulkComponentName.trim()) {
      setErrorMsg('Component name is required.');
      return;
    }

    try {
      setLoading(true);
      const res = await api.post('/costing/bulk-assign', {
        productIds: bulkProductIds,
        componentName: bulkComponentName,
        componentType: bulkComponentType,
        rawMaterialId: bulkRawMaterialId || null,
        quantity: bulkQuantity,
        costValue: bulkCostValue
      });

      if (res.data.ok) {
        showSuccess('Bulk cost assignment successfully applied to selected products!');
        setBulkProductIds([]);
        setBulkComponentName('');
        setBulkRawMaterialId('');
        setBulkCostValue('0.00');
        setBulkQuantity('1.0000');
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.error || 'Failed bulk assignment.');
    } finally {
      setLoading(false);
    }
  };

  // -----------------------------------------------------------------
  // 4. HANDLERS: COST TEMPLATES
  // -----------------------------------------------------------------
  const openNewTemplate = () => {
    setEditingTemplate({ id: null });
    setNewTemplateName('');
    setTemplateComponents(['']);
  };

  const openEditTemplate = (temp) => {
    setEditingTemplate(temp);
    setNewTemplateName(temp.name);
    setTemplateComponents(temp.components.length > 0 ? temp.components : ['']);
  };

  const handleAddTemplateComponentRow = () => {
    setTemplateComponents([...templateComponents, '']);
  };

  const handleRemoveTemplateComponentRow = (idx) => {
    setTemplateComponents(templateComponents.filter((_, i) => i !== idx));
  };

  const handleTemplateComponentChange = (idx, val) => {
    const updated = [...templateComponents];
    updated[idx] = val;
    setTemplateComponents(updated);
  };

  const handleSaveTemplate = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const nameVal = newTemplateName.trim();
    if (!nameVal) {
      setErrorMsg('Template name is required.');
      return;
    }

    const comps = templateComponents.map(c => c.trim()).filter(Boolean);
    if (comps.length === 0) {
      setErrorMsg('Please specify at least one component name.');
      return;
    }

    try {
      setLoading(true);
      const res = await api.post('/costing/templates', {
        id: editingTemplate.id,
        name: nameVal,
        components: comps
      });

      if (res.data.ok) {
        showSuccess('Cost template saved successfully!');
        setEditingTemplate(null);
        fetchTemplates();
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.error || 'Failed to save template.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTemplate = async (id) => {
    if (!window.confirm('Are you sure you want to delete this template?')) return;
    try {
      setLoading(true);
      const res = await api.delete(`/costing/templates/${id}`);
      if (res.data.ok) {
        showSuccess('Template deleted.');
        fetchTemplates();
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.error || 'Failed to delete template.');
    } finally {
      setLoading(false);
    }
  };

  // -----------------------------------------------------------------
  // RENDER SECTIONS
  // -----------------------------------------------------------------

  const filteredRawMaterials = rmMaterials.filter(item => 
    item.sub_product_name.toLowerCase().includes(rmSearch.toLowerCase()) ||
    item.category_name.toLowerCase().includes(rmSearch.toLowerCase())
  );

  const filteredFinishedProducts = fpSheets.filter(item => 
    item.name.toLowerCase().includes(fpSearch.toLowerCase()) ||
    item.category_name.toLowerCase().includes(fpSearch.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fade-in text-slate-800">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <span className="text-primary text-3xl">📊</span> COSTING MASTER MODULE
          </h1>
          <p className="text-slate-500 text-sm font-medium mt-1">
            Build and manage cost sheets, overhead allocation rules, bulk pricing, templates, and view live P&L statement
          </p>
        </div>
        <button 
          onClick={() => navigate('/dashboard')}
          className="btn btn-sm btn-outline rounded-xl border-slate-200 text-slate-600 font-bold self-start md:self-center"
        >
          ← Back Dashboard
        </button>
      </div>

      {/* TABS CONTAINER */}
      <div className="flex flex-wrap border-b border-slate-200 gap-1 bg-white p-2.5 rounded-2xl shadow-sm border border-slate-100">
        {[
          { id: 'raw-materials', label: '🪨 Raw Material Costing' },
          { id: 'finished-products', label: '🥤 Finished Product Costing' },
          { id: 'bulk-assign', label: '⚡ Bulk Cost Assignment' },
          { id: 'templates', label: '📜 Cost Templates' },
          { id: 'history', label: '⏰ Cost History log' },
          { id: 'analysis', label: '📊 Cost Analysis & Margins' },
          { id: 'pl', label: '💸 Profit & Loss Statement' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === tab.id 
                ? 'bg-primary text-white shadow-md shadow-primary/20' 
                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ALERTS */}
      {errorMsg && (
        <div className="alert alert-error bg-rose-50 text-rose-700 border-rose-100 rounded-2xl text-sm font-bold p-4 shadow-sm animate-shake">
          <span>⚠️ {errorMsg}</span>
        </div>
      )}
      {successMsg && (
        <div className="alert alert-success bg-emerald-50 text-emerald-700 border-emerald-100 rounded-2xl text-sm font-bold p-4 shadow-sm animate-fade-in">
          <span>✅ {successMsg}</span>
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 1: RAW MATERIAL COSTING */}
      {/* ================================================================= */}
      {activeTab === 'raw-materials' && (
        <div className="card-premium space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-slate-800">Raw Material Standard Cost Setup</h3>
              <p className="text-slate-400 text-xs mt-0.5">Define cost sources per unit. Uncheck Auto-Cost to specify a fixed override rate.</p>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="text"
                placeholder="Search raw material..."
                value={rmSearch}
                onChange={(e) => setRmSearch(e.target.value)}
                className="input input-sm rounded-xl border-slate-200 w-64 bg-slate-50 text-xs"
              />
              <button
                onClick={handleSaveRmCosting}
                disabled={loading}
                className="btn btn-sm btn-primary rounded-xl font-bold shadow-md shadow-primary/20 px-5"
              >
                {loading ? <span className="loading loading-spinner loading-xs"></span> : 'Save Rules'}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-100">
            <table className="table table-zebra w-full text-sm">
              <thead className="bg-[#0f172a] text-slate-200">
                <tr className="text-xs uppercase font-extrabold">
                  <th className="py-4 px-6 text-left">Category</th>
                  <th className="py-4 px-6 text-left">Raw Material</th>
                  <th className="py-4 px-6 text-left">Unit</th>
                  <th className="py-4 px-6 text-center">Auto-Cost (Latest Purchase)</th>
                  <th className="py-4 px-6 text-center">Cost Override</th>
                  <th className="py-4 px-6 text-right">Effective Cost</th>
                </tr>
              </thead>
              <tbody>
                {loading && rmMaterials.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="text-center py-12 text-slate-400">Loading configurations...</td>
                  </tr>
                ) : filteredRawMaterials.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="text-center py-12 text-slate-450 italic">No materials matching search.</td>
                  </tr>
                ) : (
                  filteredRawMaterials.map((item, idx) => {
                    const originalIdx = rmMaterials.findIndex(m => m.id === item.id);
                    return (
                      <tr key={item.id} className="hover:bg-slate-50/50">
                        <td className="py-3.5 px-6 font-medium text-slate-500">{item.category_name}</td>
                        <td className="py-3.5 px-6 font-bold text-slate-800">{item.sub_product_name}</td>
                        <td className="py-3.5 px-6 text-slate-500 font-bold">{item.unit}</td>
                        <td className="py-3.5 px-6 text-center">
                          <label className="flex items-center justify-center gap-2.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={item.use_purchase_cost}
                              onChange={(e) => handleRmRuleChange(originalIdx, 'use_purchase_cost', e.target.checked)}
                              className="checkbox checkbox-primary checkbox-xs rounded"
                            />
                            <span className="text-xs font-bold text-slate-500">
                              {item.latest_purchase_rate !== null ? `₹${item.latest_purchase_rate.toFixed(2)}` : 'N/A'}
                            </span>
                          </label>
                        </td>
                        <td className="py-3.5 px-6 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <span className="text-xs text-slate-400 font-bold">₹</span>
                            <input
                              type="number"
                              disabled={item.use_purchase_cost}
                              value={item.manual_cost}
                              onChange={(e) => handleRmRuleChange(originalIdx, 'manual_cost', e.target.value)}
                              className="input input-bordered input-xs rounded-lg w-20 text-center font-bold bg-white text-slate-800 disabled:bg-slate-100 disabled:text-slate-400"
                              step="0.01"
                              min="0"
                            />
                          </div>
                        </td>
                        <td className="py-3.5 px-6 text-right font-black text-slate-900 text-[14px]">
                          ₹{item.effective_cost.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 2: FINISHED PRODUCT COSTING */}
      {/* ================================================================= */}
      {activeTab === 'finished-products' && (
        <div className="card-premium space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-slate-800">Finished Product Cost Sheets</h3>
              <p className="text-slate-400 text-xs mt-0.5">Build recipes / cost components per SKU. Integrates raw materials and dynamic overheads.</p>
            </div>
            <input
              type="text"
              placeholder="Search finished product..."
              value={fpSearch}
              onChange={(e) => setFpSearch(e.target.value)}
              className="input input-sm rounded-xl border-slate-200 w-64 bg-slate-50 text-xs"
            />
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-100">
            <table className="table table-zebra w-full text-sm">
              <thead className="bg-[#0f172a] text-slate-200">
                <tr className="text-xs uppercase font-extrabold">
                  <th className="py-4 px-6 text-left">Category</th>
                  <th className="py-4 px-6 text-left">Finished Product SKU</th>
                  <th className="py-4 px-6 text-center">Status</th>
                  <th className="py-4 px-6 text-center">Components Count</th>
                  <th className="py-4 px-6 text-right">Standard Cost Per Unit</th>
                  <th className="py-4 px-6 text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading && fpSheets.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="text-center py-12 text-slate-400">Loading cost sheets...</td>
                  </tr>
                ) : filteredFinishedProducts.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="text-center py-12 text-slate-450 italic">No products matching search.</td>
                  </tr>
                ) : (
                  filteredFinishedProducts.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/50">
                      <td className="py-3.5 px-6 font-medium text-slate-500">{item.category_name}</td>
                      <td className="py-3.5 px-6 font-bold text-slate-800">{item.name}</td>
                      <td className="py-3.5 px-6 text-center">
                        {item.cost_sheet_id ? (
                          <span className="bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded text-[11px] font-bold border border-emerald-100">
                            Setup
                          </span>
                        ) : (
                          <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded text-[11px] font-bold border border-slate-200">
                            Pending
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-6 text-center font-bold text-slate-500">{item.component_count || 0}</td>
                      <td className="py-3.5 px-6 text-right font-black text-slate-900 text-[14px]">
                        ₹{(parseFloat(item.total_cost) || 0).toFixed(2)}
                      </td>
                      <td className="py-3.5 px-6 text-center">
                        <button
                          onClick={() => openEditCostSheetModal(item)}
                          className="bg-primary/10 hover:bg-primary/20 text-primary rounded-xl px-3 py-1 font-bold text-xs transition-all"
                        >
                          ⚙️ Build Sheet
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* EDIT COST SHEET MODAL */}
          {selectedProduct && (
            <div className="modal modal-open">
              <div className="modal-box max-w-4xl rounded-2xl bg-white text-slate-800 border border-slate-100 shadow-2xl p-6">
                <div className="flex justify-between items-center border-b border-slate-100 pb-4 mb-6">
                  <div>
                    <h3 className="font-extrabold text-xl text-slate-900 uppercase">Cost Sheet Builder</h3>
                    <p className="text-slate-450 text-xs mt-0.5">Product: <span className="font-bold text-primary">{selectedProduct.name}</span></p>
                  </div>
                  <button 
                    onClick={() => setSelectedProduct(null)}
                    className="btn btn-sm btn-circle btn-ghost"
                  >✕</button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100/60 mb-6">
                  <div>
                    <label className="block text-xs font-black uppercase text-slate-400 mb-1.5">Apply Template</label>
                    <select
                      value={selectedTemplateId}
                      onChange={(e) => handleApplyTemplate(e.target.value)}
                      className="select select-sm select-bordered w-full rounded-xl text-xs bg-white text-slate-800"
                    >
                      <option value="">-- Choose Template to Populate Rows --</option>
                      {templates.map(temp => (
                        <option key={temp.id} value={temp.id}>{temp.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col justify-end text-right">
                    <span className="text-xs text-slate-400 font-bold uppercase">Estimated Unit Cost</span>
                    <span className="text-3xl font-black text-slate-900 mt-1">₹{calculateLiveTotalCost().toFixed(2)}</span>
                  </div>
                </div>

                {/* ITEMS GRID */}
                <div className="space-y-3 max-h-[350px] overflow-y-auto pr-2">
                  <div className="flex items-center gap-3 text-xs font-black uppercase text-slate-400 px-2">
                    <div className="w-[250px]">Component Name</div>
                    <div className="w-[140px]">Type</div>
                    <div className="flex-1">Cost Source / Rate</div>
                    <div className="w-[90px]">Qty</div>
                    <div className="w-[90px] text-right">Calculated Cost</div>
                    <div className="w-[40px]"></div>
                  </div>

                  {costSheetItems.map((item, idx) => {
                    const parsedQty = parseFloat(item.quantity) || 0;
                    let calculatedValue = 0;
                    if (item.component_type === 'RAW_MATERIAL') {
                      const rm = rawMaterialsDropdown.find(r => r.id === parseInt(item.raw_material_id, 10));
                      const rmCost = rm ? (rm.effective_cost || rm.latest_purchase_rate || rm.manual_cost || 0) : 0;
                      calculatedValue = rmCost * parsedQty;
                    } else {
                      calculatedValue = parseFloat(item.cost_value) || 0;
                    }

                    return (
                      <div key={idx} className="flex items-center gap-3 bg-slate-50/50 p-2 rounded-xl border border-slate-100">
                        {/* Name */}
                        <div className="w-[250px]">
                          <input
                            type="text"
                            placeholder="e.g. Cap Cost, Labor"
                            value={item.component_name}
                            onChange={(e) => handleCostSheetItemChange(idx, 'component_name', e.target.value)}
                            className="input input-sm input-bordered w-full rounded-xl text-xs bg-white text-slate-800 font-bold"
                          />
                        </div>

                        {/* Type */}
                        <div className="w-[140px]">
                          <select
                            value={item.component_type}
                            onChange={(e) => handleCostSheetItemChange(idx, 'component_type', e.target.value)}
                            className="select select-sm select-bordered w-full rounded-xl text-xs bg-white text-slate-800"
                          >
                            <option value="RAW_MATERIAL">Raw Material</option>
                            <option value="OVERHEAD">Overhead</option>
                          </select>
                        </div>

                        {/* Cost Source Details */}
                        <div className="flex-1">
                          {item.component_type === 'RAW_MATERIAL' ? (
                            <select
                              value={item.raw_material_id}
                              onChange={(e) => handleCostSheetItemChange(idx, 'raw_material_id', e.target.value)}
                              className="select select-sm select-bordered w-full rounded-xl text-xs bg-white text-slate-800 font-medium"
                            >
                              <option value="">-- Select Material --</option>
                              {rawMaterialsDropdown.map(rm => (
                                <option key={rm.id} value={rm.id}>
                                  {rm.sub_product_name} ({rm.category_name}) — ₹{(rm.effective_cost || 0).toFixed(2)}/{rm.unit}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-slate-450 font-bold">₹</span>
                              <input
                                type="number"
                                placeholder="Cost Rate"
                                value={item.cost_value}
                                onChange={(e) => handleCostSheetItemChange(idx, 'cost_value', e.target.value)}
                                className="input input-sm input-bordered w-full rounded-xl text-xs bg-white text-slate-800 text-center font-bold"
                                step="0.01"
                                min="0"
                              />
                            </div>
                          )}
                        </div>

                        {/* Qty */}
                        <div className="w-[90px]">
                          <input
                            type="number"
                            placeholder="Qty"
                            disabled={item.component_type === 'OVERHEAD'}
                            value={item.quantity}
                            onChange={(e) => handleCostSheetItemChange(idx, 'quantity', e.target.value)}
                            className="input input-sm input-bordered w-full rounded-xl text-xs bg-white text-slate-800 text-center font-bold disabled:bg-slate-100 disabled:text-slate-400"
                            step="0.0001"
                            min="0"
                          />
                        </div>

                        {/* Display Cost */}
                        <div className="w-[90px] text-right font-black text-slate-900 text-xs">
                          ₹{calculatedValue.toFixed(2)}
                        </div>

                        {/* Actions */}
                        <div className="w-[40px] text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveCostSheetRow(idx)}
                            className="text-slate-400 hover:text-red-500 text-sm"
                            title="Remove item"
                          >🗑️</button>
                        </div>
                      </div>
                    );
                  })}

                  {costSheetItems.length === 0 && (
                    <div className="text-center py-8 text-slate-450 italic text-xs">No components added. Apply a template or click "Add Line Item" below.</div>
                  )}
                </div>

                <div className="flex justify-between items-center border-t border-slate-100 pt-4 mt-6">
                  <button
                    type="button"
                    onClick={handleAddCostSheetRow}
                    className="btn btn-sm btn-outline btn-primary rounded-xl font-bold text-xs"
                  >
                    ➕ Add Line Item
                  </button>
                  <div className="flex gap-2.5">
                    <button
                      type="button"
                      onClick={() => setSelectedProduct(null)}
                      className="btn btn-sm btn-ghost rounded-xl font-bold text-xs"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveCostSheet}
                      disabled={loading}
                      className="btn btn-sm btn-primary rounded-xl font-bold text-xs px-6"
                    >
                      Save Recipe
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 3: BULK COST ASSIGNMENT */}
      {/* ================================================================= */}
      {activeTab === 'bulk-assign' && (
        <div className="card-premium space-y-6">
          <div>
            <h3 className="text-lg font-bold text-slate-800">Bulk Cost Component Assignment</h3>
            <p className="text-slate-400 text-xs mt-0.5">Apply a standard cost component (e.g. Cap Cost = ₹1.50) to multiple finished goods at once.</p>
          </div>

          <form onSubmit={handleApplyBulkAssignment} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Products Selection Box */}
            <div className="lg:col-span-2 border border-slate-100 rounded-2xl p-4 bg-slate-50/50 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <span className="text-xs font-black uppercase text-slate-400">Select Target Finished Products ({bulkProductIds.length} chosen)</span>
                <button
                  type="button"
                  onClick={handleSelectAllProducts => handleSelectAllBulkProducts()}
                  className="text-xs text-primary font-bold hover:underline"
                >
                  {bulkProductIds.length === fpSheets.length ? 'Clear All' : 'Select All'}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[350px] overflow-y-auto pr-1">
                {fpSheets.map(prod => (
                  <label 
                    key={prod.id} 
                    className="flex items-center gap-3 bg-white p-3 rounded-xl border border-slate-150 cursor-pointer hover:border-primary/50 transition-all"
                  >
                    <input
                      type="checkbox"
                      checked={bulkProductIds.includes(prod.id)}
                      onChange={() => handleToggleBulkProductSelection(prod.id)}
                      className="checkbox checkbox-primary checkbox-xs rounded"
                    />
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-slate-800">{prod.name}</span>
                      <span className="text-[10px] text-slate-400 font-bold">{prod.category_name}</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Component Values Setup Box */}
            <div className="card border border-slate-100 rounded-2xl p-5 bg-white space-y-4 shadow-sm self-start">
              <h4 className="text-xs font-black uppercase text-slate-400 border-b border-slate-100 pb-2">Apply Settings</h4>

              {/* Component name */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500">Component Name</label>
                <input
                  type="text"
                  placeholder="e.g. Cap Cost"
                  value={bulkComponentName}
                  onChange={(e) => setBulkComponentName(e.target.value)}
                  className="input input-sm input-bordered w-full rounded-xl text-xs bg-white text-slate-800 font-bold"
                  required
                />
              </div>

              {/* Type selector */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500">Component Type</label>
                <select
                  value={bulkComponentType}
                  onChange={(e) => {
                    setBulkComponentType(e.target.value);
                    if (e.target.value === 'OVERHEAD') {
                      setBulkRawMaterialId('');
                      setBulkQuantity('1.0000');
                    }
                  }}
                  className="select select-sm select-bordered w-full rounded-xl text-xs bg-white text-slate-800"
                >
                  <option value="RAW_MATERIAL">Linked Raw Material</option>
                  <option value="OVERHEAD">Overhead (Fixed Cost)</option>
                </select>
              </div>

              {/* Dynamic cost selection */}
              {bulkComponentType === 'RAW_MATERIAL' ? (
                <>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500">Select Raw Material</label>
                    <select
                      value={bulkRawMaterialId}
                      onChange={(e) => setBulkRawMaterialId(e.target.value)}
                      className="select select-sm select-bordered w-full rounded-xl text-xs bg-white text-slate-800"
                      required
                    >
                      <option value="">-- Choose Raw Material --</option>
                      {rawMaterialsDropdown.map(rm => (
                        <option key={rm.id} value={rm.id}>
                          {rm.sub_product_name} ({rm.category_name}) — ₹{(rm.effective_cost || 0).toFixed(2)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500">Quantity Used</label>
                    <input
                      type="number"
                      value={bulkQuantity}
                      onChange={(e) => setBulkQuantity(e.target.value)}
                      className="input input-sm input-bordered w-full rounded-xl text-xs bg-white text-slate-800 text-center font-bold"
                      step="0.0001"
                      min="0"
                      required
                    />
                  </div>
                </>
              ) : (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500">Overhead Rate (₹)</label>
                  <input
                    type="number"
                    value={bulkCostValue}
                    onChange={(e) => setBulkCostValue(e.target.value)}
                    className="input input-sm input-bordered w-full rounded-xl text-xs bg-white text-slate-800 text-center font-bold"
                    step="0.01"
                    min="0"
                    required
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="btn btn-sm btn-primary rounded-xl w-full font-bold shadow-md shadow-primary/20 mt-4"
              >
                {loading ? <span className="loading loading-spinner loading-xs"></span> : 'Apply to Selected Products'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 4: COST TEMPLATES */}
      {/* ================================================================= */}
      {activeTab === 'templates' && (
        <div className="card-premium space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-slate-800">Cost Templates Manager</h3>
              <p className="text-slate-400 text-xs mt-0.5">Define reusable structures (e.g. Cap, Label, Labor, Electricity) to quickly create product recipe sheets.</p>
            </div>
            {!editingTemplate && (
              <button
                onClick={openNewTemplate}
                className="btn btn-sm btn-primary rounded-xl font-bold shadow-md shadow-primary/25"
              >
                ➕ Create Template
              </button>
            )}
          </div>

          {!editingTemplate ? (
            /* LIST TEMPLATES */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {templates.map(temp => (
                <div 
                  key={temp.id} 
                  className="border border-slate-100 bg-slate-50/50 p-5 rounded-2xl shadow-sm flex flex-col justify-between hover:shadow-md transition-all border-slate-200"
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-extrabold text-slate-800 text-sm uppercase">{temp.name}</span>
                      <span className="bg-primary/5 text-primary text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded border border-primary/10">
                        {temp.components.length} components
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mb-6">
                      {temp.components.map((comp, idx) => (
                        <span 
                          key={idx} 
                          className="bg-white border border-slate-200 text-slate-600 rounded-lg px-2.5 py-1 text-[11px] font-bold"
                        >
                          {comp}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2 border-t border-slate-100 pt-3 mt-auto justify-end">
                    <button
                      onClick={() => openEditTemplate(temp)}
                      className="bg-primary/10 hover:bg-primary/20 text-primary text-[11px] font-bold rounded-lg px-2.5 py-1 transition-all"
                    >
                      ✏️ Edit
                    </button>
                    <button
                      onClick={() => handleDeleteTemplate(temp.id)}
                      className="bg-rose-50 hover:bg-rose-100 text-rose-600 text-[11px] font-bold rounded-lg px-2.5 py-1 transition-all"
                    >
                      🗑️ Delete
                    </button>
                  </div>
                </div>
              ))}

              {templates.length === 0 && (
                <div className="col-span-full py-16 text-center text-slate-450 italic text-sm">No cost templates added yet.</div>
              )}
            </div>
          ) : (
            /* EDIT / CREATE TEMPLATE FORM */
            <form onSubmit={handleSaveTemplate} className="max-w-2xl border border-slate-100 rounded-2xl p-6 bg-slate-50/50 space-y-5">
              <h4 className="font-black text-slate-800 text-sm border-b border-slate-100 pb-2">
                {editingTemplate.id ? 'Edit Template Details' : 'Create New Cost Template'}
              </h4>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Template Name</label>
                <input
                  type="text"
                  placeholder="e.g. Bottle Template, Can Template"
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  className="input input-sm input-bordered w-full rounded-xl text-xs bg-white text-slate-800 font-bold"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase flex justify-between items-center">
                  <span>Template Components</span>
                  <button
                    type="button"
                    onClick={handleAddTemplateComponentRow}
                    className="text-xs text-primary font-bold hover:underline"
                  >+ Add Row</button>
                </label>

                <div className="space-y-2">
                  {templateComponents.map((comp, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Component name e.g. Labor, Cap Cost"
                        value={comp}
                        onChange={(e) => handleTemplateComponentChange(idx, e.target.value)}
                        className="input input-sm input-bordered flex-1 rounded-xl text-xs bg-white text-slate-800 font-bold"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveTemplateComponentRow(idx)}
                        className="text-slate-400 hover:text-red-500 text-xs px-2"
                      >✕</button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 justify-end border-t border-slate-100 pt-4 mt-6">
                <button
                  type="button"
                  onClick={() => setEditingTemplate(null)}
                  className="btn btn-sm btn-ghost rounded-xl font-bold text-xs"
                >Cancel</button>
                <button
                  type="submit"
                  disabled={loading}
                  className="btn btn-sm btn-primary rounded-xl font-bold text-xs px-6"
                >
                  {loading ? <span className="loading loading-spinner loading-xs"></span> : 'Save Template'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 5: COST HISTORY TIMELINE LOG */}
      {/* ================================================================= */}
      {activeTab === 'history' && (
        <div className="card-premium space-y-6">
          <div>
            <h3 className="text-lg font-bold text-slate-800">Cost Sheet Change History Logs</h3>
            <p className="text-slate-400 text-xs mt-0.5">Chronological record of cost modifications. Ensures audit trials and historical consistency.</p>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-100">
            <table className="table table-zebra w-full text-sm">
              <thead className="bg-[#0f172a] text-slate-200">
                <tr className="text-xs uppercase font-extrabold">
                  <th className="py-4 px-6 text-left">Date Changed</th>
                  <th className="py-4 px-6 text-left">Category</th>
                  <th className="py-4 px-6 text-left">Product SKU</th>
                  <th className="py-4 px-6 text-center">Previous Cost</th>
                  <th className="py-4 px-6 text-center">New Cost</th>
                  <th className="py-4 px-6 text-right">Variance</th>
                </tr>
              </thead>
              <tbody>
                {loading && historyLogs.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="text-center py-12 text-slate-400">Loading audit history...</td>
                  </tr>
                ) : historyLogs.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="text-center py-12 text-slate-450 italic">No history logs recorded yet.</td>
                  </tr>
                ) : (
                  historyLogs.map((log) => {
                    const oldC = parseFloat(log.old_cost) || 0;
                    const newC = parseFloat(log.new_cost) || 0;
                    const diff = newC - oldC;
                    return (
                      <tr key={log.id} className="hover:bg-slate-50/50">
                        <td className="py-3.5 px-6 font-bold text-slate-500">{log.change_date}</td>
                        <td className="py-3.5 px-6 font-medium text-slate-500">{log.category_name}</td>
                        <td className="py-3.5 px-6 font-bold text-slate-800">{log.product_name}</td>
                        <td className="py-3.5 px-6 text-center font-medium text-slate-450">₹{oldC.toFixed(2)}</td>
                        <td className="py-3.5 px-6 text-center font-bold text-slate-800">₹{newC.toFixed(2)}</td>
                        <td className={`py-3.5 px-6 text-right font-black text-[13px] ${diff >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                          {diff >= 0 ? `+₹${diff.toFixed(2)}` : `-₹${Math.abs(diff).toFixed(2)}`}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 6: COST ANALYSIS & MARGINS */}
      {/* ================================================================= */}
      {activeTab === 'analysis' && (
        <div className="space-y-6">
          {/* STATS WIDGETS */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="card bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between">
              <span className="text-xs font-black uppercase text-slate-450">Total Stock Inventory Value</span>
              <span className="text-2xl font-black text-[#0f172a] mt-2">
                ₹{analysisData.reduce((sum, item) => sum + (item.stock_value || 0), 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="card bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between">
              <span className="text-xs font-black uppercase text-slate-450">Average Gross Profit Margin</span>
              <span className="text-2xl font-black text-primary mt-2">
                {(
                  analysisData.filter(item => item.latest_selling_price > 0).reduce((sum, item) => sum + (item.margin_percent || 0), 0) /
                  (analysisData.filter(item => item.latest_selling_price > 0).length || 1)
                ).toFixed(1)}%
              </span>
            </div>
            <div className="card bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between">
              <span className="text-xs font-black uppercase text-slate-450">Cumulative Profit Earned</span>
              <span className="text-2xl font-black text-emerald-600 mt-2">
                ₹{analysisData.reduce((sum, item) => sum + (item.total_profit || 0), 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          <div className="card-premium space-y-6">
            <div>
              <h3 className="text-lg font-bold text-slate-800">Margin & Profitability Analysis</h3>
              <p className="text-slate-400 text-xs mt-0.5">Compare SKU costs, latest selling prices, active gross margins, stock valuations, and total profits generated.</p>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-100">
              <table className="table table-zebra w-full text-sm">
                <thead className="bg-[#0f172a] text-slate-200">
                  <tr className="text-xs uppercase font-extrabold">
                    <th className="py-4 px-6 text-left">Product SKU</th>
                    <th className="py-4 px-6 text-center">Cost Rate</th>
                    <th className="py-4 px-6 text-center">Selling Price</th>
                    <th className="py-4 px-6 text-center">Gross Margin</th>
                    <th className="py-4 px-6 text-center">Stock Qty</th>
                    <th className="py-4 px-6 text-center">Stock Value</th>
                    <th className="py-4 px-6 text-center">Sales Qty</th>
                    <th className="py-4 px-6 text-right">Profit Earned</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && analysisData.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="text-center py-12 text-slate-400">Loading analysis reports...</td>
                    </tr>
                  ) : analysisData.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="text-center py-12 text-slate-450 italic">No products set up for analysis yet.</td>
                    </tr>
                  ) : (
                    analysisData.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/50">
                        <td className="py-3.5 px-6 font-bold text-slate-800">{item.product_name}</td>
                        <td className="py-3.5 px-6 text-center font-bold text-slate-500">₹{item.unit_cost.toFixed(2)}</td>
                        <td className="py-3.5 px-6 text-center font-bold text-slate-800">
                          {item.latest_selling_price > 0 ? `₹${item.latest_selling_price.toFixed(2)}` : 'N/A'}
                        </td>
                        <td className="py-3.5 px-6 text-center font-medium">
                          {item.latest_selling_price > 0 ? (
                            <span className={`badge border-0 font-bold ${item.margin_value >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                              ₹{item.margin_value.toFixed(2)} ({item.margin_percent.toFixed(1)}%)
                            </span>
                          ) : (
                            <span className="text-slate-400 italic text-xs">—</span>
                          )}
                        </td>
                        <td className="py-3.5 px-6 text-center font-bold text-slate-500">{item.stock_qty.toLocaleString()}</td>
                        <td className="py-3.5 px-6 text-center font-bold text-slate-700">₹{item.stock_value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                        <td className="py-3.5 px-6 text-center font-bold text-slate-500">{item.sales_qty.toLocaleString()}</td>
                        <td className="py-3.5 px-6 text-right font-black text-emerald-600">
                          ₹{item.total_profit.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
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

      {/* ================================================================= */}
      {/* TAB 7: PROFIT & LOSS STATEMENT */}
      {/* ================================================================= */}
      {activeTab === 'pl' && (
        <div className="card-premium space-y-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-lg font-bold text-slate-800">Dynamic Profit & Loss Statement</h3>
              <p className="text-slate-400 text-xs mt-0.5">Auto-calculated revenues, COGS (valued by historical cost sheets), and overhead expenses.</p>
            </div>
            <div className="flex items-center gap-3 bg-slate-50 p-2.5 rounded-2xl border border-slate-150">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase text-slate-400">From</span>
                <input
                  type="date"
                  value={plStartDate}
                  onChange={(e) => setPlStartDate(e.target.value)}
                  className="input input-xs rounded-lg border-slate-200 bg-white"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase text-slate-400">To</span>
                <input
                  type="date"
                  value={plEndDate}
                  onChange={(e) => setPlEndDate(e.target.value)}
                  className="input input-xs rounded-lg border-slate-200 bg-white"
                />
              </div>
              <button
                onClick={fetchPLReport}
                disabled={loading}
                className="btn btn-xs btn-primary rounded-lg font-bold px-4"
              >
                Generate
              </button>
            </div>
          </div>

          {loading && !plData ? (
            <div className="py-20 text-center text-slate-400">Generating P&L Statement...</div>
          ) : !plData ? (
            <div className="py-20 text-center text-slate-400 italic">Configure a date range and click generate.</div>
          ) : (
            <div className="max-w-3xl mx-auto border border-slate-200 bg-slate-50/20 p-8 rounded-3xl shadow-sm border-slate-150">
              <div className="text-center mb-8">
                <h4 className="text-xl font-black text-slate-900 tracking-tight uppercase">Kemp's Beverages</h4>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
                  Income Statement: {plStartDate} to {plEndDate}
                </p>
              </div>

              {/* STATEMENTS TABLE */}
              <div className="space-y-4">
                
                {/* Sales Revenue */}
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="text-sm font-bold text-slate-700">Gross Sales Revenue (Approved)</span>
                  <span className="text-sm font-bold text-slate-800">₹{plData.salesRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                
                {/* Sales Return Deduction */}
                <div className="flex items-center justify-between border-b border-slate-200 pb-2 text-rose-600">
                  <span className="text-sm font-bold">Less: Sales Returns (Credit Notes)</span>
                  <span className="text-sm font-bold">(₹{plData.returnedRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2 })})</span>
                </div>

                {/* Net Sales */}
                <div className="flex items-center justify-between border-b border-slate-300 pb-2 bg-slate-50 px-3 py-1 rounded-lg">
                  <span className="text-sm font-black text-slate-800">Net Sales Revenue</span>
                  <span className="text-sm font-black text-slate-900">₹{plData.netRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>

                {/* COGS */}
                <div className="flex items-center justify-between border-b border-slate-200 pb-2 pt-2">
                  <span className="text-sm font-medium text-slate-500">Cost of Goods Sold (COGS)</span>
                  <span className="text-sm font-bold text-slate-850">₹{plData.salesCogs.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>

                {/* Return COGS credit */}
                <div className="flex items-center justify-between border-b border-slate-200 pb-2 text-emerald-600">
                  <span className="text-sm font-medium">Less: Returned Goods COGS Adjustment</span>
                  <span className="text-sm font-bold">(₹{plData.returnedCogs.toLocaleString('en-IN', { minimumFractionDigits: 2 })})</span>
                </div>

                {/* Net COGS */}
                <div className="flex items-center justify-between border-b border-slate-300 pb-2 bg-slate-50 px-3 py-1 rounded-lg">
                  <span className="text-sm font-black text-slate-800">Net Cost of Goods Sold</span>
                  <span className="text-sm font-black text-slate-900">₹{plData.netCogs.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>

                {/* GROSS PROFIT */}
                <div className="flex items-center justify-between border-b-2 border-double border-slate-400 py-3 bg-slate-100/70 px-4 rounded-xl">
                  <span className="text-base font-extrabold text-[#0f172a] uppercase">Gross Profit</span>
                  <span className="text-base font-black text-[#0f172a]">₹{plData.grossProfit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>

                {/* Expenses */}
                <div className="flex items-center justify-between border-b border-slate-200 pb-2 pt-2 text-rose-600">
                  <span className="text-sm font-bold">Less: Operational Expenses (Office, Salaries, Bank etc)</span>
                  <span className="text-sm font-bold">(₹{plData.expenses.toLocaleString('en-IN', { minimumFractionDigits: 2 })})</span>
                </div>

                {/* NET PROFIT */}
                <div className={`flex items-center justify-between py-4 px-5 rounded-2xl border shadow-sm ${
                  plData.netProfit >= 0 ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-rose-50 border-rose-100 text-rose-700'
                }`}>
                  <span className="text-lg font-black uppercase">Net Operating Profit</span>
                  <span className="text-2xl font-black">
                    {plData.netProfit >= 0 ? '' : '-' }₹{Math.abs(plData.netProfit).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>

              </div>
            </div>
          )}
        </div>
      )}

    </div>
  );
};

export default CostingMaster;
