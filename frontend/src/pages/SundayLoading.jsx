import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import SearchableSelect from '../components/SearchableSelect';
import TablePagination, { getDensityClass } from '../components/common/TablePagination';
import { useAuth } from '../context/AuthContext';

// Currency formatting helper
const formatINR = (val) =>
  `₹ ${parseFloat(val || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const fmtDate = (dateStr) => {
  if (!dateStr) return '—';
  const [y, m, d] = String(dateStr).split('T')[0].split('-');
  return `${d}/${m}/${y}`;
};

const getTodayIST = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const ist = new Date(now.getTime() + (330 + offset) * 60000);
  return `${ist.getFullYear()}-${String(ist.getMonth() + 1).padStart(2, '0')}-${String(ist.getDate()).padStart(2, '0')}`;
};

const newProductRow = () => ({ productId: '', productName: '', quantity: '', rate: '' });
const newSaleProductRow = () => ({ productId: '', productName: '', quantity: '', rateWithTax: '', taxPercent: '', basicRate: 0 });
const TAX_OPTIONS = [0, 5, 12, 18, 28, 40];

const SundayLoading = () => {
  const navigate = useNavigate();
  const { canCreate } = useAuth();
  const today = getTodayIST();

  // Dropdown lists
  const [customers, setCustomers] = useState([]);
  const [finishedProducts, setFinishedProducts] = useState([]);
  const [goodsLedgerStock, setGoodsLedgerStock] = useState({});
  const [loadingDropdowns, setLoadingDropdowns] = useState(true);

  // Selected customer details preview
  // Form State
  const [formData, setFormData] = useState({
    loadingDate: today,
    customerId: '',
    customerName: '',
    customerPhone: '',
    customerAddress: '',
    customerType: '',
    productId: '',
    productName: '',
    quantity: '',
    rate: '',
    cashAmount: '',
    upiAmount: '',
    bankAmount: '',
    notes: ''
  });
  const [productItems, setProductItems] = useState([newProductRow()]);

  // Today's recent records & summary
  const [todayRecords, setTodayRecords] = useState([]);
  const [todaySummary, setTodaySummary] = useState(null);
  const [loadingToday, setLoadingToday] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [density, setDensity] = useState('medium');
  const [activeTab, setActiveTab] = useState('transaction');
  const [loadingForm, setLoadingForm] = useState({
    loadingDate: today,
    company: '',
    customerId: '',
    customerName: '',
    customerPhone: '',
    customerAddress: '',
    notes: ''
  });
  const [loadingItems, setLoadingItems] = useState([newProductRow()]);
  const [loadingFeedback, setLoadingFeedback] = useState({ type: '', message: '' });
  const [isSavingLoading, setIsSavingLoading] = useState(false);
  const [isLoadingFormOpen, setIsLoadingFormOpen] = useState(false);
  const [loadingActiveToday, setLoadingActiveToday] = useState([]);
  const [loadingCompletedToday, setLoadingCompletedToday] = useState([]);
  const [loadingPastPending, setLoadingPastPending] = useState([]);
  const [loadingHistoryRecords, setLoadingHistoryRecords] = useState([]);
  const [isLoadingRecords, setIsLoadingRecords] = useState(false);
  const [loadingWorkspaceView, setLoadingWorkspaceView] = useState('ACTIVE');
  const [loadingActivePage, setLoadingActivePage] = useState(1);
  const [loadingCompletedPage, setLoadingCompletedPage] = useState(1);
  const [loadingPastPage, setLoadingPastPage] = useState(1);
  const [loadingHistoryPage, setLoadingHistoryPage] = useState(1);
  const [loadingLimit, setLoadingLimit] = useState(10);
  const [loadingTotals, setLoadingTotals] = useState({ activeToday: 0, completedToday: 0, pastPending: 0, history: 0 });
  const [loadingDensity, setLoadingDensity] = useState('medium');
  const [selectedLoadingRecord, setSelectedLoadingRecord] = useState(null);
  const [saleForm, setSaleForm] = useState({ saleDate: today, company: '', customerId: '', customerName: '', customerPhone: '', customerAddress: '', notes: '' });
  const [saleItems, setSaleItems] = useState([newSaleProductRow()]);
  const [saleFeedback, setSaleFeedback] = useState({ type: '', message: '' });
  const [isSaleFormOpen, setIsSaleFormOpen] = useState(false);
  const [isSavingSale, setIsSavingSale] = useState(false);
  const [saleRecords, setSaleRecords] = useState([]);
  const [saleSummary, setSaleSummary] = useState({ totalSales: 0, totalProductLines: 0, totalQuantity: 0, totalAmount: 0 });
  const [isLoadingSales, setIsLoadingSales] = useState(false);
  const [salePage, setSalePage] = useState(1);
  const [saleLimit, setSaleLimit] = useState(10);
  const [saleTotal, setSaleTotal] = useState(0);
  const [saleDensity, setSaleDensity] = useState('medium');

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', message: '' });
  const [selectedRecordForModal, setSelectedRecordForModal] = useState(null);

  // Computed Values
  const totalAmount = Math.round(productItems.reduce((sum, item) => (
    sum + ((parseFloat(item.quantity) || 0) * (parseFloat(item.rate) || 0))
  ), 0) * 100) / 100;

  const cashNum = Math.max(0, parseFloat(formData.cashAmount) || 0);
  const upiNum = Math.max(0, parseFloat(formData.upiAmount) || 0);
  const bankNum = Math.max(0, parseFloat(formData.bankAmount) || 0);
  const totalPaid = Math.round((cashNum + upiNum + bankNum) * 100) / 100;
  const dueAmount = Math.max(0, Math.round((totalAmount - totalPaid) * 100) / 100);

  const isOverpaid = totalPaid > totalAmount && totalAmount > 0;

  // 1. Fetch Customers and Finished Products from Master
  useEffect(() => {
    const fetchMasterData = async () => {
      setLoadingDropdowns(true);
      try {
        const [custRes, prodRes] = await Promise.all([
          api.get('/customers'),
          api.get('/finished-products?limit=1000&activeOnly=true')
        ]);

        if (custRes.data.customers) {
          setCustomers(custRes.data.customers);
        }

        if (prodRes.data.products) {
          setFinishedProducts(prodRes.data.products);
        }
      } catch (err) {
        console.error('Failed to load master dropdown data:', err);
      } finally {
        setLoadingDropdowns(false);
      }
    };

    fetchMasterData();
  }, []);

  // 2. Fetch Today's Sunday Loading Records
  const fetchTodayRecords = useCallback(async () => {
    setLoadingToday(true);
    try {
      const res = await api.get('/sunday-loading/today');
      if (res.data.ok) {
        setTodayRecords(res.data.records || []);
        setTodaySummary(res.data.summary || null);
      }
    } catch (err) {
      console.error("Failed to fetch today's records:", err);
    } finally {
      setLoadingToday(false);
    }
  }, []);

  useEffect(() => {
    fetchTodayRecords();
  }, [fetchTodayRecords]);

  const stockDate = activeTab === 'sales'
    ? saleForm.saleDate
    : activeTab === 'loading'
      ? loadingForm.loadingDate
      : formData.loadingDate;

  useEffect(() => {
    const fetchProductStock = async () => {
      if (!stockDate) return;
      try {
        const response = await api.get('/goods-ledger/day', { params: { date: stockDate } });
        const stockMap = {};
        (response.data.items || []).forEach(item => {
          stockMap[String(item.finished_product_id)] = Number(item.closing_stock || 0);
        });
        setGoodsLedgerStock(stockMap);
      } catch (error) {
        console.error('Failed to load finished-product stock:', error);
        setGoodsLedgerStock({});
      }
    };
    fetchProductStock();
  }, [stockDate]);

  // Customer selection handler
  const handleCustomerSelect = (val) => {
    if (!val) {
      setFormData(prev => ({
        ...prev,
        customerId: '',
        customerName: '',
        customerPhone: '',
        customerAddress: '',
        customerType: ''
      }));
      return;
    }

    const cust = customers.find(c => String(c.id) === String(val) || c.name === val);
    if (cust) {
      setFormData(prev => ({
        ...prev,
        customerId: cust.id || '',
        customerName: cust.name || '',
        customerPhone: cust.phone || '',
        customerAddress: cust.address || '',
        customerType: cust.customerType || cust.customer_type || 'General Customer'
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        customerId: '',
        customerName: val,
        customerPhone: '',
        customerAddress: '',
        customerType: 'General Customer'
      }));
    }
  };

  // Product selection handler
  const handleProductSelect = (index, val, opt) => {
    setProductItems(prev => prev.map((item, rowIndex) => {
      if (rowIndex !== index) return item;
      if (!val) return newProductRow();
      const prod = finishedProducts.find(p => String(p.id) === String(val));
      return { ...item, productId: prod?.id || val, productName: prod?.name || opt?.label || val };
    }));
  };

  const updateProductItem = (index, field, value) => setProductItems(prev =>
    prev.map((item, rowIndex) => rowIndex === index ? { ...item, [field]: value } : item)
  );
  const addProductItem = () => setProductItems(prev => [...prev, newProductRow()]);
  const removeProductItem = (index) => setProductItems(prev =>
    prev.length === 1 ? prev : prev.filter((_, rowIndex) => rowIndex !== index)
  );

  const handleLoadingCustomer = (val) => {
    const customer = customers.find(item => String(item.id) === String(val));
    setLoadingForm(prev => ({
      ...prev,
      customerId: customer?.id || '',
      customerName: customer?.name || '',
      customerPhone: customer?.phone || '',
      customerAddress: customer?.address || ''
    }));
  };

  const handleLoadingProduct = (index, val, opt) => {
    const product = finishedProducts.find(item => String(item.id) === String(val));
    setLoadingItems(prev => prev.map((item, rowIndex) => rowIndex === index ? {
      ...item,
      productId: product?.id || val || '',
      productName: product?.name || opt?.label || ''
    } : item));
  };

  const submitLoadingSheet = async (event) => {
    event.preventDefault();
    setLoadingFeedback({ type: '', message: '' });
    const items = loadingItems.map(item => ({
      productId: item.productId ? parseInt(item.productId, 10) : null,
      productName: item.productName,
      quantity: parseFloat(item.quantity)
    }));
    if (!loadingForm.customerId) {
      setLoadingFeedback({ type: 'error', message: 'Please select a customer from Customer Master.' });
      return;
    }
    if (items.some(item => !item.productId || !item.productName || !Number.isFinite(item.quantity) || item.quantity <= 0)) {
      setLoadingFeedback({ type: 'error', message: 'Complete every product row with product and quantity.' });
      return;
    }
    if (new Set(items.map(item => item.productId)).size !== items.length) {
      setLoadingFeedback({ type: 'error', message: 'The same product cannot be added twice.' });
      return;
    }
    setIsSavingLoading(true);
    try {
      const response = await api.post('/sunday-loading/loading', { ...loadingForm, items });
      setLoadingFeedback({ type: 'success', message: `Loading saved successfully! (Ref: ${response.data.dispatchNumber})` });
      setLoadingForm(prev => ({ ...prev, company: '', customerId: '', customerName: '', customerPhone: '', customerAddress: '', notes: '' }));
      setLoadingItems([newProductRow()]);
      setLoadingWorkspaceView('ACTIVE');
      setLoadingActivePage(1);
      await fetchLoadingRecords();
      setIsLoadingFormOpen(false);
    } catch (error) {
      setLoadingFeedback({ type: 'error', message: error.response?.data?.error || 'Failed to save loading.' });
    } finally {
      setIsSavingLoading(false);
    }
  };

  const fetchLoadingRecords = useCallback(async () => {
    setIsLoadingRecords(true);
    try {
      const [activeResponse, completedResponse, pastResponse, historyResponse] = await Promise.all([
        api.get('/sunday-loading/loading', { params: { page: loadingActivePage, limit: loadingLimit, status: 'ACTIVE', scope: 'today', date: today } }),
        api.get('/sunday-loading/loading', { params: { page: loadingCompletedPage, limit: loadingLimit, status: 'COMPLETED', scope: 'today', date: today } }),
        api.get('/sunday-loading/loading', { params: { page: loadingPastPage, limit: loadingLimit, status: 'ACTIVE', scope: 'past', date: today } }),
        api.get('/sunday-loading/loading', { params: { page: loadingHistoryPage, limit: loadingLimit, status: 'COMPLETED', scope: 'all' } })
      ]);
      setLoadingActiveToday(activeResponse.data.records || []);
      setLoadingCompletedToday(completedResponse.data.records || []);
      setLoadingPastPending(pastResponse.data.records || []);
      setLoadingHistoryRecords(historyResponse.data.records || []);
      setLoadingTotals({
        activeToday: Number(activeResponse.data.total || 0),
        completedToday: Number(completedResponse.data.total || 0),
        pastPending: Number(pastResponse.data.total || 0),
        history: Number(historyResponse.data.total || 0)
      });
    } catch (error) {
      console.error('Failed to load Sunday loading sheets:', error);
    } finally {
      setIsLoadingRecords(false);
    }
  }, [loadingActivePage, loadingCompletedPage, loadingPastPage, loadingHistoryPage, loadingLimit, today]);

  const completeLoadingSheet = async (record) => {
    if (!window.confirm(`Mark ${record.dispatch_number} as completed?`)) return;
    try {
      await api.put(`/sunday-loading/loading/${record.id}/complete`);
      setLoadingFeedback({ type: 'success', message: `${record.dispatch_number} completed successfully.` });
      await fetchLoadingRecords();
    } catch (error) {
      setLoadingFeedback({ type: 'error', message: error.response?.data?.error || 'Failed to complete loading sheet.' });
    }
  };

  useEffect(() => {
    if (activeTab === 'loading') fetchLoadingRecords();
  }, [activeTab, fetchLoadingRecords]);

  const handleSaleCustomer = (val) => {
    const customer = customers.find(item => String(item.id) === String(val));
    setSaleForm(prev => ({ ...prev, customerId: customer?.id || '', customerName: customer?.name || '', customerPhone: customer?.phone || '', customerAddress: customer?.address || '' }));
  };

  const handleSaleProduct = (index, val, opt) => {
    const product = finishedProducts.find(item => String(item.id) === String(val));
    setSaleItems(prev => prev.map((item, rowIndex) => rowIndex === index ? { ...item, productId: product?.id || val || '', productName: product?.name || opt?.label || '' } : item));
  };

  const saleGrandTotal = Math.round(saleItems.reduce((sum, item) => sum + ((parseFloat(item.quantity) || 0) * (parseFloat(item.rateWithTax) || 0)), 0) * 100) / 100;

  const fetchSales = useCallback(async () => {
    setIsLoadingSales(true);
    try {
      const response = await api.get('/sunday-loading/sales', { params: { page: salePage, limit: saleLimit } });
      setSaleRecords(response.data.records || []);
      setSaleTotal(Number(response.data.total || 0));
      setSaleSummary(response.data.summary || { totalSales: 0, totalProductLines: 0, totalQuantity: 0, totalAmount: 0 });
    } catch (error) {
      console.error('Failed to load Sunday sales:', error);
    } finally {
      setIsLoadingSales(false);
    }
  }, [salePage, saleLimit]);

  useEffect(() => {
    if (activeTab === 'sales') fetchSales();
  }, [activeTab, fetchSales]);

  const submitSale = async (event) => {
    event.preventDefault();
    setSaleFeedback({ type: '', message: '' });
    const items = saleItems.map(item => ({ productId: item.productId ? parseInt(item.productId, 10) : null, productName: item.productName, quantity: parseFloat(item.quantity), rateWithTax: parseFloat(item.rateWithTax), taxPercent: item.taxPercent === '' ? null : parseFloat(item.taxPercent) }));
    if (!saleForm.company) return setSaleFeedback({ type: 'error', message: 'Please select a company.' });
    if (!saleForm.customerId) return setSaleFeedback({ type: 'error', message: 'Please select a customer from Customer Master.' });
    if (items.some(item => !item.productId || !item.productName || !Number.isFinite(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.rateWithTax) || item.rateWithTax < 0 || item.taxPercent === null || !Number.isFinite(item.taxPercent))) {
      return setSaleFeedback({ type: 'error', message: 'Complete every product row with product, positive quantity, rate with tax, and Tax %.' });
    }
    if (new Set(items.map(item => item.productId)).size !== items.length) return setSaleFeedback({ type: 'error', message: 'The same product cannot be added twice.' });
    setIsSavingSale(true);
    try {
      const response = await api.post('/sunday-loading/sales', { ...saleForm, items });
      setSaleFeedback({ type: 'success', message: `Sunday sale saved successfully! (Ref: ${response.data.saleNumber})` });
      setSaleForm(prev => ({ ...prev, company: '', customerId: '', customerName: '', customerPhone: '', customerAddress: '', notes: '' }));
      setSaleItems([newSaleProductRow()]);
      setSalePage(1);
      if (salePage === 1) await fetchSales();
      setIsSaleFormOpen(false);
    } catch (error) {
      setSaleFeedback({ type: 'error', message: error.response?.data?.error || 'Failed to save Sunday sale.' });
    } finally {
      setIsSavingSale(false);
    }
  };

  // Reset form
  const handleResetForm = () => {
    setFormData({
      loadingDate: today,
      customerId: '',
      customerName: '',
      customerPhone: '',
      customerAddress: '',
      customerType: '',
      productId: '',
      productName: '',
      quantity: '',
      rate: '',
      cashAmount: '',
      upiAmount: '',
      bankAmount: '',
      notes: ''
    });
    setProductItems([newProductRow()]);
    setFeedback({ type: '', message: '' });
  };

  // Submit Handler
  const handleSubmit = async (e) => {
    e.preventDefault();
    setFeedback({ type: '', message: '' });

    if (!formData.customerName.trim()) {
      setFeedback({ type: 'error', message: 'Please select or enter a customer name.' });
      return;
    }

    const normalizedItems = productItems.map(item => ({
      productId: item.productId ? parseInt(item.productId, 10) : null,
      productName: item.productName.trim(),
      quantity: parseFloat(item.quantity),
      rate: parseFloat(item.rate)
    }));
    if (normalizedItems.some(item => !item.productName || !Number.isFinite(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.rate) || item.rate < 0)) {
      setFeedback({ type: 'error', message: 'Complete every product row with product, quantity, and rate.' });
      return;
    }

    if (totalPaid > totalAmount) {
      setFeedback({
        type: 'error',
        message: `Total payment (${formatINR(totalPaid)}) cannot exceed Total Amount (${formatINR(totalAmount)}).`
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        loadingDate: formData.loadingDate || today,
        customerId: formData.customerId || null,
        customerName: formData.customerName.trim(),
        customerPhone: formData.customerPhone || null,
        customerAddress: formData.customerAddress || null,
        customerType: formData.customerType || 'General Customer',
        items: normalizedItems,
        cashAmount: cashNum,
        upiAmount: upiNum,
        bankAmount: bankNum,
        notes: formData.notes ? formData.notes.trim() : null
      };

      const res = await api.post('/sunday-loading', payload);
      if (res.data.ok) {
        setFeedback({
          type: 'success',
          message: `Sunday Loading recorded successfully! (Ref: ${res.data.transactionNumber})`
        });
        handleResetForm();
        fetchTodayRecords();
      }
    } catch (err) {
      console.error('Failed to submit Sunday Loading:', err);
      setFeedback({
        type: 'error',
        message: err.response?.data?.error || err.message || 'Failed to submit Sunday Loading.'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Prepare searchable select options
  const customerOptions = customers.map(c => ({
    value: String(c.id),
    label: `${c.name} ${c.phone ? `(${c.phone})` : ''}`,
    rawName: c.name,
    badge: c.customerType || c.customer_type || 'General'
  }));

  const productOptions = finishedProducts.map(p => ({
    value: String(p.id),
    label: `${p.name} (${goodsLedgerStock[String(p.id)] ?? 0} in stock)`,
    rawName: p.name,
    stock: goodsLedgerStock[String(p.id)] ?? 0,
    badge: `${goodsLedgerStock[String(p.id)] ?? 0} in stock`,
    badgeClassName: (goodsLedgerStock[String(p.id)] ?? 0) > 0
      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
      : (goodsLedgerStock[String(p.id)] ?? 0) === 0
        ? 'bg-amber-50 text-amber-700 border border-amber-200'
        : 'bg-red-50 text-red-600 border border-red-200'
  }));

  const renderLoadingWorkspaceTable = ({ title, records, total, pageValue, setPageValue, statusType = 'ACTIVE', tone = 'default', emptyText, allowComplete = false }) => (
    <section className={`rounded-2xl border bg-white shadow-sm overflow-hidden ${tone === 'warning' ? 'border-amber-300' : 'border-slate-200'}`}>
      <div className={`px-5 py-4 border-b flex items-center justify-between ${tone === 'warning' ? 'bg-amber-50/60 border-amber-200' : 'border-slate-100'}`}>
        <h3 className={`text-sm font-black uppercase tracking-tight ${tone === 'warning' ? 'text-amber-900' : 'text-slate-800'}`}>{title}</h3>
        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase border ${tone === 'warning' ? 'bg-amber-50 text-amber-700 border-amber-200' : statusType === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>{total} {statusType === 'COMPLETED' ? 'Completed' : 'Active'}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead><tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 uppercase"><th className={getDensityClass(loadingDensity, true)}>Loading ID</th><th className={getDensityClass(loadingDensity, true)}>Date</th><th className={getDensityClass(loadingDensity, true)}>Customer Details</th><th className={getDensityClass(loadingDensity, true)}>Company / Godown</th><th className={getDensityClass(loadingDensity, true)}>Consolidated Loadings</th><th className={getDensityClass(loadingDensity, true)}>Status</th><th className={`${getDensityClass(loadingDensity, true)} text-center`}>Actions</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {isLoadingRecords ? <tr><td colSpan="7" className="px-5 py-10 text-center text-slate-400 font-semibold">Loading sheets...</td></tr> : records.length === 0 ? <tr><td colSpan="7" className="px-5 py-10 text-center text-slate-400 font-semibold">{emptyText}</td></tr> : records.map(record => (
              <tr key={record.id} className="hover:bg-slate-50/70">
                <td className={`${getDensityClass(loadingDensity)} font-black text-slate-700`}>{record.dispatch_number}</td>
                <td className={`${getDensityClass(loadingDensity)} font-bold ${tone === 'warning' ? 'text-amber-700' : 'text-slate-600'}`}>{fmtDate(record.loading_date)}</td>
                <td className={getDensityClass(loadingDensity)}><div className="font-black text-slate-800">{record.customer_name}</div><div className="text-[10px] text-slate-400 mt-0.5">{record.customer_phone || '—'}</div></td>
                <td className={getDensityClass(loadingDensity)}><span className="inline-flex px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-100 text-[10px] font-black">{record.company}</span></td>
                <td className={`${getDensityClass(loadingDensity)} text-slate-700 font-semibold max-w-md`}>{record.products || '—'}</td>
                <td className={getDensityClass(loadingDensity)}><span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-black uppercase border ${record.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>{record.status === 'COMPLETED' ? 'Completed' : 'Active (Unbilled)'}</span></td>
                <td className={`${getDensityClass(loadingDensity)} text-center whitespace-nowrap`}><div className="flex justify-center gap-2"><button type="button" onClick={() => setSelectedLoadingRecord(record)} className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 text-[10px] font-black hover:bg-slate-50">👁 View Details</button>{allowComplete && <button type="button" onClick={() => completeLoadingSheet(record)} className="px-3 py-2 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 text-[10px] font-black hover:bg-blue-100">✅ Completed</button>}</div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > 0 && <TablePagination page={pageValue} setPage={setPageValue} limit={loadingLimit} setLimit={(value) => { setLoadingLimit(value); setLoadingActivePage(1); setLoadingCompletedPage(1); setLoadingPastPage(1); setLoadingHistoryPage(1); }} total={total} density={loadingDensity} setDensity={setLoadingDensity} />}
    </section>
  );

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* ── HEADER CARD ─────────────────────────────────────────────────────────── */}
      <div className="card-premium p-6 sm:p-8 relative overflow-hidden bg-gradient-to-r from-slate-900 via-[#1e1b4b] to-[#0f172a] text-white">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-amber-500/10 to-transparent pointer-events-none"></div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-amber-500/20 text-amber-300 text-[10px] font-black tracking-widest uppercase px-3 py-1 rounded-full border border-amber-500/30">
                INDEPENDENT MODULE
              </span>
              <span className="text-slate-400 text-xs font-semibold">Separate Sunday Ledger &amp; Rates</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-3">
              <span>☀️</span> Sunday Loading
            </h1>
            <p className="text-slate-300 text-xs sm:text-sm font-medium mt-1.5 max-w-2xl leading-relaxed">
              Record isolated Sunday vehicle and customer loading dispatches. This module operates completely independently from regular sales, stock ledgers, and billing.
            </p>
          </div>

          <div className="flex items-center gap-3 self-start sm:self-center flex-wrap">
            <button
              type="button"
              onClick={() => navigate('/sunday-loading-history')}
              className="h-11 px-5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs transition-all shadow-md flex items-center gap-2 active:scale-95"
            >
              <span>📜</span> View History
            </button>
            <button
              type="button"
              onClick={() => navigate('/sunday-dashboard')}
              className="h-11 px-4 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition-all border border-white/10 flex items-center gap-1.5 active:scale-95"
            >
              <span>☀️</span> Sunday Hub
            </button>
          </div>
        </div>
      </div>

      {/* Workspace navigation tabs — matches Orders, Loading and Sales Return */}
      <div className="flex justify-start">
        <div className="flex bg-slate-100 p-1 rounded-xl w-fit border border-slate-200/40 shrink-0">
          {[
            { key: 'transaction', label: 'Transaction', icon: '🧾' },
            { key: 'loading', label: 'Loading', icon: '🚚' },
            { key: 'sales', label: 'Sales', icon: '💰' }
          ].map(tab => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 rounded-lg text-[10px] font-black tracking-wider transition-all uppercase whitespace-nowrap ${
                activeTab === tab.key
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'transaction' && (
        <>

      {/* ── TODAY SUMMARY METRICS (OPTIONAL BANNER) ─────────────────────────── */}
      {todaySummary && todaySummary.totalCount > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="card-premium p-4 border-amber-200 bg-amber-50/30">
            <p className="text-[10px] font-black text-amber-800 uppercase tracking-widest">Today's Loaded Qty</p>
            <p className="text-2xl font-black text-amber-900 mt-1">
              {todaySummary.totalQuantity.toLocaleString('en-IN')} <span className="text-xs font-semibold text-amber-700">Units</span>
            </p>
          </div>
          <div className="card-premium p-4 border-blue-200 bg-blue-50/30">
            <p className="text-[10px] font-black text-blue-800 uppercase tracking-widest">Today's Total Amount</p>
            <p className="text-2xl font-black text-blue-900 mt-1">
              {formatINR(todaySummary.totalAmount)}
            </p>
          </div>
          <div className="card-premium p-4 border-emerald-200 bg-emerald-50/30">
            <p className="text-[10px] font-black text-emerald-800 uppercase tracking-widest">Today's Paid Amount</p>
            <p className="text-2xl font-black text-emerald-900 mt-1">
              {formatINR(todaySummary.totalPaid)}
            </p>
          </div>
          <div className="card-premium p-4 border-red-200 bg-red-50/30">
            <p className="text-[10px] font-black text-red-800 uppercase tracking-widest">Today's Due Amount</p>
            <p className="text-2xl font-black text-red-900 mt-1">
              {formatINR(todaySummary.totalDue)}
            </p>
          </div>
        </div>
      )}

      {/* ── MAIN ENTRY FORM CARD ────────────────────────────────────────────── */}
      <div className="card-premium bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-lg font-black text-slate-800 tracking-tight flex items-center gap-2">
              <span>📝</span> New Sunday Loading Transaction
            </h2>
            <p className="text-xs font-medium text-slate-400 mt-0.5">
              Select customer, choose product, specify quantity and rate, then record payment breakdown.
            </p>
          </div>
          <button
            type="button"
            onClick={handleResetForm}
            className="text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50"
          >
            Clear Form
          </button>
        </div>

        {/* Feedback Alert */}
        {feedback.message && (
          <div
            className={`p-4 rounded-2xl border text-sm font-semibold flex items-center justify-between animate-fade-in ${
              feedback.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-red-50 text-red-800 border-red-200'
            }`}
          >
            <div className="flex items-center gap-2">
              <span>{feedback.type === 'success' ? '✅' : '⚠️'}</span>
              <span>{feedback.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setFeedback({ type: '', message: '' })}
              className="text-slate-400 hover:text-slate-700 text-xs font-bold ml-4"
            >
              ✕
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Row 1: Date & Customer Selection */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Loading Date */}
            <div>
              <label className="block text-xs font-black text-slate-600 uppercase tracking-wider mb-2">
                Loading Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                required
                value={formData.loadingDate}
                onChange={(e) => setFormData(prev => ({ ...prev, loadingDate: e.target.value }))}
                className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-slate-800 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-bold"
              />
            </div>

            {/* Customer Search / Select */}
            <div className="md:col-span-2">
              <label className="block text-xs font-black text-slate-600 uppercase tracking-wider mb-2">
                Customer Name <span className="text-red-500">*</span>
              </label>
              <SearchableSelect
                options={customerOptions}
                value={formData.customerId || formData.customerName}
                onChange={handleCustomerSelect}
                placeholder={loadingDropdowns ? "Loading customers..." : "Search / Select Customer from Master..."}
                searchPlaceholder="Type customer name or phone..."
                className="w-full h-11"
              />
            </div>
          </div>

          {/* Customer Details Preview Card (if selected) */}
          {formData.customerName && (
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <span className="text-[10px] font-black uppercase text-slate-400 block">Customer Name</span>
                <span className="font-bold text-slate-800 text-sm">{formData.customerName}</span>
              </div>
              <div>
                <span className="text-[10px] font-black uppercase text-slate-400 block">Phone Number</span>
                <span className="font-semibold text-slate-700">{formData.customerPhone || '—'}</span>
              </div>
              <div>
                <span className="text-[10px] font-black uppercase text-slate-400 block">Customer Type / Address</span>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-blue-100 text-blue-800 border border-blue-200">
                    {formData.customerType || 'General Customer'}
                  </span>
                  <span className="text-slate-500 truncate max-w-[180px]" title={formData.customerAddress}>
                    {formData.customerAddress || '—'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Product rows */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black text-slate-600 uppercase tracking-wider">Finished Products</h3>
              <button type="button" onClick={addProductItem} className="px-4 h-10 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 text-xs font-black hover:bg-blue-100">
                + Add Product
              </button>
            </div>
            {productItems.map((item, index) => {
              const lineTotal = (parseFloat(item.quantity) || 0) * (parseFloat(item.rate) || 0);
              return (
                <div key={index} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto] gap-3 p-4 rounded-2xl border border-slate-200 bg-slate-50/60 items-end">
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase mb-1.5">Product #{index + 1}</label>
                    <SearchableSelect options={productOptions} value={item.productId || item.productName} onChange={(val, opt) => handleProductSelect(index, val, opt)} placeholder={loadingDropdowns ? 'Loading products...' : 'Select Finished Product...'} searchPlaceholder="Search product or stock..." />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase mb-1.5">Quantity</label>
                    <input type="number" step="any" min="0.01" required value={item.quantity} onWheel={(e) => e.target.blur()} onChange={(e) => updateProductItem(index, 'quantity', e.target.value)} className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-sm font-bold" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase mb-1.5">Rate (₹)</label>
                    <input type="number" step="0.01" min="0" required value={item.rate} onWheel={(e) => e.target.blur()} onChange={(e) => updateProductItem(index, 'rate', e.target.value)} className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-sm font-bold" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase mb-1.5">Total</label>
                    <div className="h-11 px-3 rounded-xl bg-white border border-slate-200 flex items-center font-black">{formatINR(lineTotal)}</div>
                  </div>
                  <button type="button" disabled={productItems.length === 1} onClick={() => removeProductItem(index)} className="h-11 w-11 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-30" title="Remove product">✕</button>
                </div>
              );
            })}
            <div className="flex justify-end items-center gap-6 p-3 rounded-xl bg-slate-900 text-white">
              <span className="text-xs font-black uppercase tracking-wider">Total Amount</span>
              <span className="text-lg font-black">{formatINR(totalAmount)}</span>
            </div>
          </div>

          {/* ── PAYMENT DETAILS SECTION ────────────────────────────────────────── */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-50 to-indigo-50/30 border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200/60 pb-3">
              <h3 className="text-xs font-black uppercase text-slate-700 tracking-wider flex items-center gap-1.5">
                <span>💳</span> Payment Details Breakdown
              </h3>
              <span className="text-[11px] font-semibold text-slate-400">
                Record receipts for Cash, UPI, and Bank separately
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Cash Amount */}
              <div>
                <label className="block text-xs font-bold text-emerald-800 uppercase tracking-wider mb-1.5">
                  💵 Cash Amount
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-emerald-600 text-sm font-bold">₹</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={formData.cashAmount}
                    onWheel={(e) => e.target.blur()}
                    onChange={(e) => setFormData(prev => ({ ...prev, cashAmount: e.target.value }))}
                    className="w-full h-11 pl-8 pr-3 rounded-xl border border-emerald-200 bg-white text-slate-900 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all outline-none text-sm font-bold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
              </div>

              {/* UPI Amount */}
              <div>
                <label className="block text-xs font-bold text-indigo-800 uppercase tracking-wider mb-1.5">
                  📱 UPI Amount
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-indigo-600 text-sm font-bold">₹</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={formData.upiAmount}
                    onWheel={(e) => e.target.blur()}
                    onChange={(e) => setFormData(prev => ({ ...prev, upiAmount: e.target.value }))}
                    className="w-full h-11 pl-8 pr-3 rounded-xl border border-indigo-200 bg-white text-slate-900 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none text-sm font-bold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
              </div>

              {/* Bank Amount */}
              <div>
                <label className="block text-xs font-bold text-sky-800 uppercase tracking-wider mb-1.5">
                  🏦 Bank Transfer
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sky-600 text-sm font-bold">₹</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={formData.bankAmount}
                    onWheel={(e) => e.target.blur()}
                    onChange={(e) => setFormData(prev => ({ ...prev, bankAmount: e.target.value }))}
                    className="w-full h-11 pl-8 pr-3 rounded-xl border border-sky-200 bg-white text-slate-900 focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10 transition-all outline-none text-sm font-bold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
              </div>
            </div>

            {/* Payment Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="p-3.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between shadow-xs">
                <div>
                  <span className="text-[10px] font-black uppercase text-slate-400 block tracking-wider">Total Paid</span>
                  <span className="text-xs text-slate-500 font-semibold">Cash + UPI + Bank</span>
                </div>
                <span className="text-lg font-black text-emerald-600">
                  {formatINR(totalPaid)}
                </span>
              </div>

              <div className={`p-3.5 rounded-xl bg-white border flex items-center justify-between shadow-xs ${
                dueAmount > 0 ? 'border-amber-300' : 'border-slate-200'
              }`}>
                <div>
                  <span className="text-[10px] font-black uppercase text-slate-400 block tracking-wider">Due Amount</span>
                  <span className="text-xs text-slate-500 font-semibold">Total Amount − Total Paid</span>
                </div>
                <span className={`text-lg font-black ${dueAmount > 0 ? 'text-amber-700' : 'text-slate-400'}`}>
                  {formatINR(dueAmount)}
                </span>
              </div>
            </div>

            {/* Overpayment Warning */}
            {isOverpaid && (
              <div className="p-3 rounded-xl bg-red-100 border border-red-300 text-red-800 text-xs font-bold flex items-center gap-2">
                <span>⚠️</span>
                <span>Payment amount ({formatINR(totalPaid)}) cannot exceed the Total Amount ({formatINR(totalAmount)}). Please adjust the payment values.</span>
              </div>
            )}
          </div>

          {/* Notes / Remarks */}
          <div>
            <label className="block text-xs font-black text-slate-600 uppercase tracking-wider mb-2">
              Remarks / Notes (Optional)
            </label>
            <textarea
              rows="2"
              placeholder="Enter any driver, vehicle number, or Sunday loading dispatch notes..."
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              className="w-full p-3.5 rounded-xl border border-slate-200 bg-white text-slate-800 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-xs font-medium"
            />
          </div>

          {/* Submit Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={handleResetForm}
              className="px-5 h-12 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold transition-all"
            >
              Reset
            </button>
            {canCreate('sunday-loading') && (
              <button
                type="submit"
                disabled={isSubmitting || isOverpaid}
                className="px-8 h-12 rounded-xl bg-primary hover:bg-primary-focus text-white text-xs font-black shadow-lg shadow-primary/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 active:scale-95"
              >
                {isSubmitting ? (
                  <>
                    <span className="loading loading-spinner loading-xs"></span>
                    <span>Saving Record...</span>
                  </>
                ) : (
                  <>
                    <span>☀️</span>
                    <span>Record Sunday Loading</span>
                  </>
                )}
              </button>
            )}
          </div>
        </form>
      </div>

      {/* ── TODAY'S RECENT RECORDS TABLE ────────────────────────────────────────── */}
      <div className="card-premium bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-base font-black text-slate-800 tracking-tight flex items-center gap-2">
              <span>📋</span> Today's Sunday Loading Transactions
            </h3>
            <p className="text-xs font-semibold text-slate-400 mt-0.5">
              Entries recorded for today ({fmtDate(today)})
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchTodayRecords}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold transition-colors flex items-center gap-1"
            >
              🔄 Refresh
            </button>
            <button
              type="button"
              onClick={() => navigate('/sunday-loading-history')}
              className="px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-xs"
            >
              Full History →
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-[10px] font-black uppercase text-slate-500 tracking-wider">
                <th className={`${getDensityClass(density, true)}`}>Transaction No</th>
                <th className={`${getDensityClass(density, true)}`}>Customer</th>
                <th className={`${getDensityClass(density, true)}`}>Product</th>
                <th className={`${getDensityClass(density, true)} text-center`}>Qty</th>
                <th className={`${getDensityClass(density, true)} text-right`}>Rate</th>
                <th className={`${getDensityClass(density, true)} text-right`}>Total Amount</th>
                <th className={`${getDensityClass(density, true)} text-right`}>Total Paid</th>
                <th className={`${getDensityClass(density, true)} text-right`}>Due</th>
                <th className={`${getDensityClass(density, true)} text-center`}>Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {loadingToday ? (
                <tr>
                  <td colSpan="9" className="py-10 text-center text-slate-400">
                    <span className="loading loading-spinner text-primary"></span>
                    <p className="mt-2 text-xs font-semibold">Loading records...</p>
                  </td>
                </tr>
              ) : todayRecords.length === 0 ? (
                <tr>
                  <td colSpan="9" className="py-10 text-center text-slate-400 italic">
                    No Sunday Loading transactions recorded for today yet. Use the form above to add an entry.
                  </td>
                </tr>
              ) : (
                todayRecords.slice((page - 1) * limit, page * limit).map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className={`${getDensityClass(density)} font-mono font-bold text-primary whitespace-nowrap`}>
                      {r.transaction_number}
                    </td>
                    <td className={`${getDensityClass(density)}`}>
                      <p className="font-bold text-slate-800">{r.customer_name}</p>
                      {r.customer_phone && <p className="text-[11px] text-slate-400">{r.customer_phone}</p>}
                    </td>
                    <td className={`${getDensityClass(density)} font-semibold text-slate-800`}>
                      {r.product_name}
                    </td>
                    <td className={`${getDensityClass(density)} text-center font-bold`}>
                      {r.quantity}
                    </td>
                    <td className={`${getDensityClass(density)} text-right font-medium`}>
                      {formatINR(r.rate)}
                    </td>
                    <td className={`${getDensityClass(density)} text-right font-black text-slate-900`}>
                      {formatINR(r.total_amount)}
                    </td>
                    <td className={`${getDensityClass(density)} text-right font-bold text-emerald-600`}>
                      {formatINR(r.total_paid)}
                    </td>
                    <td className={`${getDensityClass(density)} text-right font-bold ${r.due_amount > 0 ? 'text-amber-700' : 'text-slate-400'}`}>
                      {formatINR(r.due_amount)}
                    </td>
                    <td className={`${getDensityClass(density)} text-center whitespace-nowrap`}>
                      <button
                        type="button"
                        onClick={() => setSelectedRecordForModal(r)}
                        className="px-2.5 py-1 rounded-lg bg-primary/10 text-primary hover:bg-primary hover:text-white transition-all font-bold text-xs shadow-xs"
                      >
                        👁️ View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <TablePagination
          page={page}
          setPage={setPage}
          limit={limit}
          setLimit={setLimit}
          totalItems={todayRecords.length}
          density={density}
          setDensity={setDensity}
        />
      </div>

      {/* ── TRANSACTION DETAILS MODAL ─────────────────────────────────────── */}
      {selectedRecordForModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm pointer-events-auto p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-fade-in pointer-events-auto">
            {/* Modal Header */}
            <div className="bg-[#0b1324] p-5 text-white flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  SUNDAY LOADING RECORD
                </span>
                <h3 className="text-lg font-black tracking-tight mt-1 text-white">
                  {selectedRecordForModal.transaction_number}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRecordForModal(null)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center font-bold text-sm transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 text-xs font-semibold text-slate-700 max-h-[75vh] overflow-y-auto">
              {/* Date & Ref */}
              <div className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-100">
                <div>
                  <span className="text-[10px] font-black text-slate-400 uppercase block">Transaction Date</span>
                  <span className="font-bold text-slate-800">{fmtDate(selectedRecordForModal.loading_date)}</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-black text-slate-400 uppercase block">Created By</span>
                  <span className="font-bold text-slate-600">{selectedRecordForModal.created_by || 'Admin'}</span>
                </div>
              </div>

              {/* Customer Box */}
              <div className="border border-slate-200 rounded-2xl p-4 space-y-2">
                <span className="text-[10px] font-black text-primary uppercase tracking-wider block">
                  CUSTOMER DETAILS
                </span>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-black text-slate-800">{selectedRecordForModal.customer_name}</span>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                    {selectedRecordForModal.customer_type || 'General'}
                  </span>
                </div>
                {selectedRecordForModal.customer_phone && (
                  <p className="text-slate-500 text-xs">📞 {selectedRecordForModal.customer_phone}</p>
                )}
                {selectedRecordForModal.customer_address && (
                  <p className="text-slate-500 text-xs">📍 {selectedRecordForModal.customer_address}</p>
                )}
              </div>

              {/* Product Box */}
              <div className="border border-slate-200 rounded-2xl p-4 space-y-3">
                <span className="text-[10px] font-black text-indigo-700 uppercase tracking-wider block">
                  PRODUCT &amp; LOAD QUANTITY
                </span>
                <div className="flex justify-between items-center">
                  <span className="font-bold text-slate-800 text-sm">{selectedRecordForModal.product_name}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-center">
                  <div className="p-2 rounded-lg bg-slate-50">
                    <span className="text-[10px] font-black text-slate-400 uppercase block">Quantity</span>
                    <span className="font-black text-slate-800">{selectedRecordForModal.quantity}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-50">
                    <span className="text-[10px] font-black text-slate-400 uppercase block">Rate</span>
                    <span className="font-black text-slate-800">{formatINR(selectedRecordForModal.rate)}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-blue-50 text-blue-900">
                    <span className="text-[10px] font-black text-blue-600 uppercase block">Total</span>
                    <span className="font-black">{formatINR(selectedRecordForModal.total_amount)}</span>
                  </div>
                </div>
              </div>

              {/* Payment Details Box */}
              <div className="border border-slate-200 rounded-2xl p-4 space-y-3 bg-gradient-to-br from-white to-slate-50">
                <span className="text-[10px] font-black text-emerald-800 uppercase tracking-wider block">
                  PAYMENT BREAKDOWN
                </span>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="p-2 rounded-lg bg-emerald-50 text-emerald-900">
                    <span className="text-[10px] font-black text-emerald-700 uppercase block">Cash</span>
                    <span className="font-bold">{formatINR(selectedRecordForModal.cash_amount)}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-indigo-50 text-indigo-900">
                    <span className="text-[10px] font-black text-indigo-700 uppercase block">UPI</span>
                    <span className="font-bold">{formatINR(selectedRecordForModal.upi_amount)}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-sky-50 text-sky-900">
                    <span className="text-[10px] font-black text-sky-700 uppercase block">Bank</span>
                    <span className="font-bold">{formatINR(selectedRecordForModal.bank_amount)}</span>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-slate-200 text-xs font-bold">
                  <span>Total Paid:</span>
                  <span className="text-emerald-700 font-black">{formatINR(selectedRecordForModal.total_paid)}</span>
                </div>
                <div className="flex justify-between items-center text-xs font-bold">
                  <span>Due Balance:</span>
                  <span className={`font-black ${selectedRecordForModal.due_amount > 0 ? 'text-amber-700' : 'text-slate-500'}`}>
                    {formatINR(selectedRecordForModal.due_amount)}
                  </span>
                </div>
              </div>

              {selectedRecordForModal.notes && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-[10px] font-black uppercase text-slate-400 block mb-1">Remarks</span>
                  <p className="text-slate-600 font-medium">{selectedRecordForModal.notes}</p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedRecordForModal(null)}
                className="btn-premium bg-slate-900 text-white hover:bg-slate-800 text-xs px-6 h-10 font-bold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
        </>
      )}

      {activeTab === 'loading' && (isLoadingFormOpen ? (
        <form onSubmit={submitLoadingSheet} className="card-premium bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
          <div className="flex items-center border-b border-slate-100 pb-4 gap-3">
            <button type="button" onClick={() => setIsLoadingFormOpen(false)} className="px-4 h-10 rounded-xl border border-slate-200 text-slate-600 text-xs font-black hover:bg-slate-50">← Back</button>
            <div>
              <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">🚚 New Sunday Loading</h2>
              <p className="text-xs font-medium text-slate-400 mt-1">Select company, customer, and products for the loading sheet.</p>
            </div>
          </div>

          {loadingFeedback.message && (
            <div className={`p-4 rounded-2xl border text-sm font-semibold ${loadingFeedback.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-red-50 text-red-800 border-red-200'}`}>
              {loadingFeedback.message}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
            <div>
              <label className="block text-xs font-black text-slate-600 uppercase tracking-wider mb-2">Loading Date *</label>
              <input type="date" required value={loadingForm.loadingDate} onChange={(e) => setLoadingForm(prev => ({ ...prev, loadingDate: e.target.value }))} className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-sm font-bold" />
            </div>
            <div>
              <label className="block text-xs font-black text-slate-600 uppercase tracking-wider mb-2">Company *</label>
              <select required value={loadingForm.company} onChange={(e) => setLoadingForm(prev => ({ ...prev, company: e.target.value }))} className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-sm font-bold">
                <option value="">Select Company</option>
                <option value="Kempannavar Industries">KEMPANNAVAR INDUSTRIES</option>
                <option value="Kemps Pet Industries">KEMPS PET INDUSTRIES</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-black text-slate-600 uppercase tracking-wider mb-2">Customer *</label>
              <SearchableSelect options={customerOptions} value={loadingForm.customerId} onChange={handleLoadingCustomer} placeholder="Select Customer from Master..." searchPlaceholder="Search customer..." />
            </div>
          </div>

          {loadingForm.customerName && (
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div><span className="text-[10px] font-black uppercase text-slate-400 block">Customer</span><span className="font-bold text-slate-800">{loadingForm.customerName}</span></div>
              <div><span className="text-[10px] font-black uppercase text-slate-400 block">Phone</span><span className="font-semibold text-slate-700">{loadingForm.customerPhone || '—'}</span></div>
              <div><span className="text-[10px] font-black uppercase text-slate-400 block">Address</span><span className="font-semibold text-slate-700">{loadingForm.customerAddress || '—'}</span></div>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black text-slate-600 uppercase tracking-wider">Products</h3>
              <button type="button" onClick={() => setLoadingItems(prev => [...prev, newProductRow()])} className="px-4 h-10 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 text-xs font-black">+ Add Product</button>
            </div>
            {loadingItems.map((item, index) => (
              <div key={index} className="grid grid-cols-1 md:grid-cols-[2fr_1fr_auto] gap-3 p-4 rounded-2xl border border-slate-200 bg-slate-50/60 items-end">
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-1.5">Product #{index + 1}</label>
                  <SearchableSelect options={productOptions} value={item.productId} onChange={(val, opt) => handleLoadingProduct(index, val, opt)} placeholder="Select Product from Master..." searchPlaceholder="Search product or stock..." />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-1.5">Quantity</label>
                  <input type="number" step="any" min="0.01" required value={item.quantity} onChange={(e) => setLoadingItems(prev => prev.map((row, rowIndex) => rowIndex === index ? { ...row, quantity: e.target.value } : row))} className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-sm font-bold" />
                </div>
                <button type="button" disabled={loadingItems.length === 1} onClick={() => setLoadingItems(prev => prev.length === 1 ? prev : prev.filter((_, rowIndex) => rowIndex !== index))} className="h-11 w-11 rounded-xl border border-red-200 text-red-600 disabled:opacity-30">✕</button>
              </div>
            ))}
          </div>

          <div>
            <label className="block text-xs font-black text-slate-600 uppercase tracking-wider mb-2">Notes (Optional)</label>
            <textarea rows="2" value={loadingForm.notes} onChange={(e) => setLoadingForm(prev => ({ ...prev, notes: e.target.value }))} className="w-full p-3.5 rounded-xl border border-slate-200 bg-white text-sm" placeholder="Vehicle, driver, or loading notes..." />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <button type="button" onClick={() => setIsLoadingFormOpen(false)} className="px-5 h-12 rounded-xl border border-slate-200 text-slate-600 text-xs font-black">Cancel</button>
            <button type="submit" disabled={isSavingLoading} className="px-8 h-12 rounded-xl bg-primary text-white text-xs font-black disabled:opacity-50">
              {isSavingLoading ? 'Saving Loading...' : 'Save Loading'}
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-6">
          {loadingFeedback.message && (
            <div className={`p-4 rounded-2xl border text-sm font-semibold ${loadingFeedback.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-red-50 text-red-800 border-red-200'}`}>
              {loadingFeedback.message}
            </div>
          )}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 py-2">
            <div>
              <h2 className="text-3xl font-black text-slate-800 tracking-tight uppercase">Sunday Loading Workspace</h2>
              <p className="text-slate-500 text-sm font-medium mt-1">Manage Sunday loading sheets and log independent customer trips</p>
            </div>
            {canCreate('sunday-loading') && <button type="button" onClick={() => { setLoadingFeedback({ type: '', message: '' }); setIsLoadingFormOpen(true); }} className="h-14 px-7 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-black shadow-lg shadow-blue-200 flex items-center gap-2">
              🚚 New Sunday Loading
            </button>}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="px-4 py-3 text-xs font-black text-slate-700 uppercase tracking-widest">📋 View Loading Sheets</div>
            <div className="flex bg-slate-100 p-1.5 rounded-2xl">
              <button type="button" onClick={() => setLoadingWorkspaceView('ACTIVE')} className={`px-5 py-3 rounded-xl text-[11px] font-black uppercase transition-all ${loadingWorkspaceView === 'ACTIVE' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>⚡ Active Today ({loadingTotals.activeToday}) {loadingTotals.pastPending > 0 && <span className="ml-2 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">{loadingTotals.pastPending} Past Pending</span>}</button>
              <button type="button" onClick={() => setLoadingWorkspaceView('HISTORY')} className={`px-5 py-3 rounded-xl text-[11px] font-black uppercase transition-all ${loadingWorkspaceView === 'HISTORY' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>⌛ Completed / History</button>
            </div>
          </div>

          {loadingWorkspaceView === 'ACTIVE' ? <>
            {renderLoadingWorkspaceTable({ title: 'Active Loading Sheets Today', records: loadingActiveToday, total: loadingTotals.activeToday, pageValue: loadingActivePage, setPageValue: setLoadingActivePage, emptyText: 'No active loading sheets found for today.', allowComplete: true })}
            {renderLoadingWorkspaceTable({ title: "Today’s Completed Loading History", records: loadingCompletedToday, total: loadingTotals.completedToday, pageValue: loadingCompletedPage, setPageValue: setLoadingCompletedPage, statusType: 'COMPLETED', emptyText: 'No loading history completed today yet.' })}
            {renderLoadingWorkspaceTable({ title: '⌛ Uncompleted / Pending Past Loading Entries', records: loadingPastPending, total: loadingTotals.pastPending, pageValue: loadingPastPage, setPageValue: setLoadingPastPage, tone: 'warning', emptyText: 'No uncompleted past loading entries.', allowComplete: true })}
          </> : renderLoadingWorkspaceTable({ title: 'Completed Loading History', records: loadingHistoryRecords, total: loadingTotals.history, pageValue: loadingHistoryPage, setPageValue: setLoadingHistoryPage, statusType: 'COMPLETED', emptyText: 'No completed loading history found.' })}
        </div>
      ))}

      {selectedLoadingRecord && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl rounded-3xl bg-white shadow-2xl overflow-hidden">
            <div className="bg-slate-900 text-white px-6 py-5 flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-widest text-blue-300">Sunday Loading Details</p><h3 className="text-xl font-black mt-1">{selectedLoadingRecord.dispatch_number}</h3></div><button type="button" onClick={() => setSelectedLoadingRecord(null)} className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20">✕</button></div>
            <div className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4"><div className="rounded-2xl border border-slate-200 p-4"><span className="text-[10px] font-black uppercase text-slate-400">Loading Date</span><p className="font-black text-slate-800 mt-1">{fmtDate(selectedLoadingRecord.loading_date)}</p></div><div className="rounded-2xl border border-slate-200 p-4"><span className="text-[10px] font-black uppercase text-slate-400">Company / Godown</span><p className="font-black text-slate-800 mt-1">{selectedLoadingRecord.company}</p></div></div>
              <div className="rounded-2xl border border-slate-200 p-4"><span className="text-[10px] font-black uppercase text-slate-400">Customer Details</span><p className="font-black text-slate-800 mt-1">{selectedLoadingRecord.customer_name}</p><p className="text-xs text-slate-500 mt-1">{selectedLoadingRecord.customer_phone || '—'} · {selectedLoadingRecord.customer_address || 'No address'}</p></div>
              <div className="rounded-2xl border border-slate-200 p-4"><span className="text-[10px] font-black uppercase text-slate-400">Consolidated Loadings</span><p className="font-bold text-slate-700 mt-2">{selectedLoadingRecord.products || '—'}</p><p className="text-xs font-black text-blue-700 mt-2">Total quantity: {selectedLoadingRecord.total_quantity.toLocaleString('en-IN')}</p></div>
              {selectedLoadingRecord.notes && <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">{selectedLoadingRecord.notes}</div>}
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end"><button type="button" onClick={() => setSelectedLoadingRecord(null)} className="px-6 h-10 rounded-xl bg-slate-900 text-white text-xs font-black">Close</button></div>
          </div>
        </div>
      )}

      {activeTab === 'sales' && (isSaleFormOpen ? (
        <form onSubmit={submitSale} className="card-premium bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
          <div className="flex items-center border-b border-slate-100 pb-4 gap-3">
            <button type="button" onClick={() => setIsSaleFormOpen(false)} className="px-4 h-10 rounded-xl border border-slate-200 text-slate-600 text-xs font-black hover:bg-slate-50">← Back</button>
            <div><h2 className="text-lg font-black text-slate-800">💰 New Sunday Sale</h2><p className="text-xs font-medium text-slate-400 mt-1">Select company, customer, and one or more products.</p></div>
          </div>
          {saleFeedback.message && <div className={`p-4 rounded-2xl border text-sm font-semibold ${saleFeedback.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-red-50 text-red-800 border-red-200'}`}>{saleFeedback.message}</div>}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
            <div><label className="block text-xs font-black text-slate-600 uppercase tracking-wider mb-2">Sale Date *</label><input type="date" required value={saleForm.saleDate} onChange={(e) => setSaleForm(prev => ({ ...prev, saleDate: e.target.value }))} className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-sm font-bold" /></div>
            <div><label className="block text-xs font-black text-slate-600 uppercase tracking-wider mb-2">Company *</label><select required value={saleForm.company} onChange={(e) => setSaleForm(prev => ({ ...prev, company: e.target.value }))} className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-sm font-bold"><option value="">Select Company</option><option value="Kempannavar Industries">KEMPANNAVAR INDUSTRIES</option><option value="Kemps Pet Industries">KEMPS PET INDUSTRIES</option></select></div>
            <div className="md:col-span-2"><label className="block text-xs font-black text-slate-600 uppercase tracking-wider mb-2">Customer *</label><SearchableSelect options={customerOptions} value={saleForm.customerId} onChange={handleSaleCustomer} placeholder="Select Customer from Master..." searchPlaceholder="Search customer..." /></div>
          </div>
          {saleForm.customerName && <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs"><div><span className="text-[10px] font-black uppercase text-slate-400 block">Customer</span><span className="font-bold text-slate-800">{saleForm.customerName}</span></div><div><span className="text-[10px] font-black uppercase text-slate-400 block">Phone</span><span className="font-semibold text-slate-700">{saleForm.customerPhone || '—'}</span></div><div><span className="text-[10px] font-black uppercase text-slate-400 block">Address</span><span className="font-semibold text-slate-700">{saleForm.customerAddress || '—'}</span></div></div>}
          <div className="space-y-3">
            <div className="flex items-center justify-between"><h3 className="text-xs font-black text-slate-600 uppercase tracking-wider">Products</h3><button type="button" onClick={() => setSaleItems(prev => [...prev, newSaleProductRow()])} className="px-4 h-10 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 text-xs font-black">+ Add Product</button></div>
            {saleItems.map((item, index) => {
              const rateWithTax = parseFloat(item.rateWithTax) || 0;
              const taxPercent = item.taxPercent === '' ? null : parseFloat(item.taxPercent);
              const basicRate = taxPercent === null || !Number.isFinite(taxPercent) ? 0 : rateWithTax / (1 + taxPercent / 100);
              const lineTotal = (parseFloat(item.quantity) || 0) * rateWithTax;
              return <div key={index} className="grid grid-cols-1 md:grid-cols-[2fr_0.7fr_1fr_0.75fr_1fr_1fr_auto] gap-3 p-4 rounded-2xl border border-slate-200 bg-slate-50/60 items-end">
                <div><label className="block text-[10px] font-black text-slate-500 uppercase mb-1.5">Product #{index + 1}</label><SearchableSelect options={productOptions} value={item.productId} onChange={(val, opt) => handleSaleProduct(index, val, opt)} placeholder="Select Product from Master..." searchPlaceholder="Search product or stock..." /></div>
                <div><label className="block text-[10px] font-black text-slate-500 uppercase mb-1.5">Quantity</label><input type="number" step="any" min="0.01" required value={item.quantity} onChange={(e) => setSaleItems(prev => prev.map((row, rowIndex) => rowIndex === index ? { ...row, quantity: e.target.value } : row))} className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-sm font-bold" /></div>
                <div><label className="block text-[10px] font-black text-slate-500 uppercase mb-1.5">Rate With Tax (₹)</label><input type="number" step="0.01" min="0" required value={item.rateWithTax} onChange={(e) => setSaleItems(prev => prev.map((row, rowIndex) => rowIndex === index ? { ...row, rateWithTax: e.target.value } : row))} className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-sm font-bold" /></div>
                <div><label className="block text-[10px] font-black text-slate-500 uppercase mb-1.5">Tax (%) *</label><select required value={item.taxPercent} onChange={(e) => setSaleItems(prev => prev.map((row, rowIndex) => rowIndex === index ? { ...row, taxPercent: e.target.value } : row))} className="w-full h-11 px-2 rounded-xl border border-slate-200 bg-white text-sm font-bold"><option value="">-- Tax % --</option>{TAX_OPTIONS.map(tax => <option key={tax} value={tax}>{tax}%</option>)}</select><div className="text-[9px] text-center font-bold text-slate-400 mt-1">{taxPercent !== null && taxPercent > 0 ? `${taxPercent / 2}% + ${taxPercent / 2}%` : taxPercent === 0 ? '0%' : 'Required'}</div></div>
                <div><label className="block text-[10px] font-black text-slate-500 uppercase mb-1.5">Basic Rate (No Tax)</label><div className="h-11 px-3 rounded-xl border border-slate-200 bg-slate-100 flex items-center font-black text-slate-600">{formatINR(basicRate)}</div></div>
                <div><label className="block text-[10px] font-black text-slate-500 uppercase mb-1.5">Total</label><div className="h-11 px-3 rounded-xl border border-slate-200 bg-white flex items-center font-black text-slate-800">{formatINR(lineTotal)}</div></div>
                <button type="button" disabled={saleItems.length === 1} onClick={() => setSaleItems(prev => prev.length === 1 ? prev : prev.filter((_, rowIndex) => rowIndex !== index))} className="h-11 w-11 rounded-xl border border-red-200 text-red-600 disabled:opacity-30">✕</button>
              </div>;
            })}
          </div>
          <div className="flex justify-end"><div className="w-full sm:w-80 rounded-2xl bg-slate-900 text-white p-5 flex items-center justify-between"><span className="text-xs font-black uppercase tracking-widest text-slate-300">Grand Total</span><span className="text-2xl font-black">{formatINR(saleGrandTotal)}</span></div></div>
          <div><label className="block text-xs font-black text-slate-600 uppercase tracking-wider mb-2">Notes (Optional)</label><textarea rows="2" value={saleForm.notes} onChange={(e) => setSaleForm(prev => ({ ...prev, notes: e.target.value }))} className="w-full p-3.5 rounded-xl border border-slate-200 bg-white text-sm" /></div>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100"><button type="button" onClick={() => setIsSaleFormOpen(false)} className="px-5 h-12 rounded-xl border border-slate-200 text-slate-600 text-xs font-black">Cancel</button><button type="submit" disabled={isSavingSale} className="px-8 h-12 rounded-xl bg-primary text-white text-xs font-black disabled:opacity-50">{isSavingSale ? 'Saving Sale...' : 'Save Sale'}</button></div>
        </form>
      ) : (
        <div className="space-y-6">
          {saleFeedback.message && <div className={`p-4 rounded-2xl border text-sm font-semibold ${saleFeedback.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-red-50 text-red-800 border-red-200'}`}>{saleFeedback.message}</div>}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4"><div><h2 className="text-2xl font-black text-slate-800 tracking-tight uppercase">Sunday Sales</h2><p className="text-slate-500 text-sm font-medium mt-1">Independent Sunday sales linked only to Customer and Product Masters</p></div>{canCreate('sunday-loading') && <button type="button" onClick={() => { setSaleFeedback({ type: '', message: '' }); setIsSaleFormOpen(true); }} className="btn-premium btn-primary-premium h-12 text-xs">💰 New Sunday Sale</button>}</div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4"><div className="border border-slate-200/60 bg-white rounded-2xl p-4 shadow-sm"><p className="text-[10px] font-black uppercase text-slate-400">Total Sales</p><p className="text-2xl font-black text-slate-800 mt-1">{saleSummary.totalSales}</p></div><div className="border border-slate-200/60 bg-white rounded-2xl p-4 shadow-sm"><p className="text-[10px] font-black uppercase text-slate-400">Product Lines</p><p className="text-2xl font-black text-blue-700 mt-1">{saleSummary.totalProductLines}</p></div><div className="border border-slate-200/60 bg-white rounded-2xl p-4 shadow-sm"><p className="text-[10px] font-black uppercase text-slate-400">Quantity</p><p className="text-2xl font-black text-amber-700 mt-1">{saleSummary.totalQuantity.toLocaleString('en-IN')}</p></div><div className="border border-slate-200/60 bg-white rounded-2xl p-4 shadow-sm"><p className="text-[10px] font-black uppercase text-slate-400">Sales Amount</p><p className="text-2xl font-black text-emerald-700 mt-1">{formatINR(saleSummary.totalAmount)}</p></div></div>
          <div className="border border-slate-200/60 bg-white rounded-2xl shadow-sm overflow-hidden"><div className="p-4 border-b border-slate-100 flex items-center justify-between"><div className="text-[11px] font-black text-slate-500 uppercase tracking-widest">📋 Sales Records</div><button type="button" onClick={fetchSales} className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-600">Refresh</button></div><div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr className="bg-slate-50 border-b border-slate-200 text-slate-500"><th className={getDensityClass(saleDensity, true)}>Reference</th><th className={getDensityClass(saleDensity, true)}>Date</th><th className={getDensityClass(saleDensity, true)}>Company</th><th className={getDensityClass(saleDensity, true)}>Customer</th><th className={getDensityClass(saleDensity, true)}>Products</th><th className={`${getDensityClass(saleDensity, true)} text-right`}>Quantity</th><th className={`${getDensityClass(saleDensity, true)} text-right`}>Total</th></tr></thead><tbody className="divide-y divide-slate-100">{isLoadingSales ? <tr><td colSpan="7" className="px-4 py-10 text-center text-slate-400">Loading sales...</td></tr> : saleRecords.length === 0 ? <tr><td colSpan="7" className="px-4 py-10 text-center text-slate-400">No Sunday sales recorded.</td></tr> : saleRecords.map(record => <tr key={record.id} className="hover:bg-slate-50"><td className={`${getDensityClass(saleDensity)} font-black text-blue-700`}>{record.sale_number}</td><td className={getDensityClass(saleDensity)}>{fmtDate(record.sale_date)}</td><td className={`${getDensityClass(saleDensity)} font-bold`}>{record.company}</td><td className={getDensityClass(saleDensity)}><div className="font-bold">{record.customer_name}</div><div className="text-[10px] text-slate-400">{record.customer_phone || '—'}</div></td><td className={`${getDensityClass(saleDensity)} text-slate-600`}>{record.products || '—'}</td><td className={`${getDensityClass(saleDensity)} text-right font-black`}>{record.total_quantity.toLocaleString('en-IN')}</td><td className={`${getDensityClass(saleDensity)} text-right font-black text-emerald-700`}>{formatINR(record.total_amount)}</td></tr>)}</tbody></table></div><TablePagination page={salePage} setPage={setSalePage} limit={saleLimit} setLimit={setSaleLimit} total={saleTotal} density={saleDensity} setDensity={setSaleDensity} /></div>
        </div>
      ))}
    </div>
  );
};

export default SundayLoading;
