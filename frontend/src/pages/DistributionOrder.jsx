import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import api from '../api/axios';

const getTodayIST = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const istDate = new Date(now.getTime() + (330 + offset) * 60000);
  const yyyy = istDate.getFullYear();
  const mm = String(istDate.getMonth() + 1).padStart(2, '0');
  const dd = String(istDate.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const DistributionOrder = () => {
  const navigate = useNavigate();

  // Active view tabs: 'active' | 'new' | 'history'
  const [activeTab, setActiveTab] = useState('active');

  // Master lists
  const [finishedProducts, setFinishedProducts] = useState([]);
  const [customers, setCustomers] = useState([]);

  // Metrics Widgets State
  const [widgets, setWidgets] = useState({
    activeCount: 0,
    completedCount: 0,
    totalDues: 0
  });

  // Filters State
  const [filterSearch, setFilterSearch] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [limit] = useState(10);

  // Orders lists
  const [orders, setOrders] = useState([]);
  const [loadingList, setLoadingList] = useState(false);

  // Form State (Create / Edit)
  const [isEditing, setIsEditing] = useState(false);
  const [editOrderId, setEditOrderId] = useState(null);

  const [orderInfo, setOrderInfo] = useState({
    customerId: '',
    customerName: '',
    customerPhone: '',
    customerGstin: '',
    customerAddress: '',
    customerType: 'Distributor', // Locked to Distributor for this module
    alternatePhone: '',
    supplyDate: getTodayIST(),
    supplyTime: '00:00:00',
    deliveryAddress: '',
    deliveryInstructions: '',
    notes: '',
    paymentMode: 'Credit',
    advanceAmount: '0',
    discount: '0',
    tax: '18'
  });

  const [formItems, setFormItems] = useState([
    { id: Math.random().toString(36).substring(2, 9), finishedProductId: '', quantity: '', rate: '', amount: 0 }
  ]);

  // Autocomplete search states
  const [nameSearchText, setNameSearchText] = useState('');
  const [phoneSearchText, setPhoneSearchText] = useState('');
  const [filteredCustomers, setFilteredCustomers] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  // Modals & Detail Views
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [orderDetail, setOrderDetail] = useState(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Cancel order modal
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [isSavingCancel, setIsSavingCancel] = useState(false);
  const [cancelError, setCancelError] = useState('');

  useEffect(() => {
    fetchDropdownMasters();
    fetchWidgets();
    fetchOrdersList();
  }, []);

  useEffect(() => {
    fetchOrdersList();
  }, [activeTab, currentPage, filterSearch, filterStartDate, filterEndDate]);

  const fetchDropdownMasters = async () => {
    try {
      const [fpRes, custRes] = await Promise.all([
        api.get('/finished-products', { params: { limit: 200 } }),
        api.get('/customers')
      ]);
      if (fpRes.data.ok) {
        setFinishedProducts(fpRes.data.products || []);
      }
      if (custRes.data.customers) {
        setCustomers(custRes.data.customers || []);
      }
    } catch (err) {
      console.error('Failed to load masters:', err);
    }
  };

  const fetchWidgets = async () => {
    try {
      // Fetch stats specific to Distributor
      const [activeRes, completedRes] = await Promise.all([
        api.get('/orders', { params: { limit: 1, customerType: 'Distributor', status: 'PENDING' } }),
        api.get('/orders', { params: { limit: 1, customerType: 'Distributor', status: 'SUPPLIED' } })
      ]);
      
      let activeCount = activeRes.data.total || 0;
      let completedCount = completedRes.data.total || 0;

      // Calculate sum of pending amounts for active distributor orders
      const allActiveRes = await api.get('/orders', { params: { limit: 200, customerType: 'Distributor', status: 'PENDING' } });
      const activeOrders = allActiveRes.data.orders || [];
      const totalDues = activeOrders.reduce((sum, o) => sum + (parseFloat(o.pending_amount) || 0), 0);

      setWidgets({
        activeCount,
        completedCount,
        totalDues
      });
    } catch (err) {
      console.error(err);
    }
  };

  const fetchOrdersList = async () => {
    try {
      setLoadingList(true);
      const params = {
        page: currentPage,
        limit,
        search: filterSearch,
        startDate: filterStartDate,
        endDate: filterEndDate,
        customerType: 'Distributor' // locked to Distributor
      };

      if (activeTab === 'active') {
        params.status = 'PENDING';
      } else if (activeTab === 'history') {
        params.status = 'SUPPLIED';
      }

      const res = await api.get('/orders', { params });
      if (res.data.ok) {
        setOrders(res.data.orders);
        setTotalCount(res.data.total);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingList(false);
    }
  };

  // Autocomplete Lookups
  const handleNameSearchChange = (e) => {
    const val = e.target.value;
    setNameSearchText(val);
    setOrderInfo(prev => ({ ...prev, customerName: val }));

    if (val.trim().length > 0) {
      const filtered = customers.filter(c => 
        c.name.toLowerCase().includes(val.toLowerCase())
      );
      setFilteredCustomers(filtered);
      setShowSuggestions(true);
    } else {
      setFilteredCustomers([]);
      setShowSuggestions(false);
    }
  };

  const handleSelectSuggestion = (cust) => {
    setOrderInfo(prev => ({
      ...prev,
      customerId: cust.id,
      customerName: cust.name,
      customerPhone: cust.phone,
      customerGstin: cust.gst || '',
      customerAddress: cust.address || '',
      deliveryAddress: prev.deliveryAddress || cust.address || ''
    }));
    setNameSearchText(cust.name);
    setPhoneSearchText(cust.phone);
    setShowSuggestions(false);
  };

  const handlePhoneSearchSubmit = () => {
    if (!phoneSearchText.trim()) return;
    const clean = phoneSearchText.trim();
    const cust = customers.find(c => c.phone.endsWith(clean) || clean.endsWith(c.phone));
    if (cust) {
      handleSelectSuggestion(cust);
    } else {
      alert("No matching customer profile found with phone " + clean + ". Creating new profile details.");
      setOrderInfo(prev => ({
        ...prev,
        customerId: '',
        customerPhone: clean
      }));
    }
  };

  const handleClearCustomer = () => {
    setOrderInfo(prev => ({
      ...prev,
      customerId: '',
      customerName: '',
      customerPhone: '',
      customerGstin: '',
      customerAddress: '',
      deliveryAddress: ''
    }));
    setNameSearchText('');
    setPhoneSearchText('');
    setShowSuggestions(false);
  };

  // Form Math Calculations
  const handleItemRowChange = (rowId, field, value) => {
    const updated = formItems.map(item => {
      if (item.id === rowId) {
        const copy = { ...item, [field]: value };
        
        if (field === 'finishedProductId' && value) {
          const prod = finishedProducts.find(p => String(p.id) === String(value));
          if (prod) {
            copy.rate = String(prod.rate_with_tax || prod.rate || 0);
          }
        }

        const qty = parseInt(copy.quantity, 10) || 0;
        const rate = parseFloat(copy.rate) || 0.00;
        copy.amount = qty * rate;
        return copy;
      }
      return item;
    });
    setFormItems(updated);
  };

  const handleAddProductRow = () => {
    setFormItems(prev => [
      ...prev,
      { id: Math.random().toString(36).substring(2, 9), finishedProductId: '', quantity: '', rate: '', amount: 0 }
    ]);
  };

  const handleRemoveProductRow = (rowId) => {
    setFormItems(prev => prev.filter(item => item.id !== rowId));
  };

  const subTotal = formItems.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
  const discountVal = parseFloat(orderInfo.discount) || 0;
  const taxPercent = parseFloat(orderInfo.tax) || 0;
  
  const totalAfterDiscount = Math.max(0, subTotal - discountVal);
  const taxVal = totalAfterDiscount * (taxPercent / 100);
  const grandTotal = totalAfterDiscount + taxVal;
  
  const advanceVal = parseFloat(orderInfo.advanceAmount) || 0;
  const pendingAmount = Math.max(0, grandTotal - advanceVal);

  const handleResetForm = () => {
    setOrderInfo({
      customerId: '',
      customerName: '',
      customerPhone: '',
      customerGstin: '',
      customerAddress: '',
      customerType: 'Distributor',
      alternatePhone: '',
      supplyDate: getTodayIST(),
      supplyTime: '00:00:00',
      deliveryAddress: '',
      deliveryInstructions: '',
      notes: '',
      paymentMode: 'Credit',
      advanceAmount: '0',
      discount: '0',
      tax: '18'
    });
    setFormItems([{ id: Math.random().toString(36).substring(2, 9), finishedProductId: '', quantity: '', rate: '', amount: 0 }]);
    setNameSearchText('');
    setPhoneSearchText('');
    setFormError('');
    setFormSuccess('');
    setIsEditing(false);
    setEditOrderId(null);
  };

  const handleSubmitOrder = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    if (formItems.filter(i => i.finishedProductId && i.quantity).length === 0) {
      setFormError('At least one valid product line with positive quantity is required.');
      return;
    }

    try {
      setIsSaving(true);
      const payload = {
        customerId: orderInfo.customerId,
        customerName: orderInfo.customerName,
        customerPhone: orderInfo.customerPhone,
        customerGstin: orderInfo.customerGstin,
        customerAddress: orderInfo.customerAddress,
        customerType: 'Distributor', // Hardcoded to Distributor for this module
        alternatePhone: '',
        supplyDate: orderInfo.supplyDate || getTodayIST(),
        supplyTime: orderInfo.supplyTime || '00:00:00',
        deliveryAddress: orderInfo.customerAddress || '',
        deliveryInstructions: '',
        subTotal,
        discount: discountVal,
        tax: taxPercent,
        grandTotal,
        paymentMode: orderInfo.paymentMode,
        advanceAmount: advanceVal,
        notes: orderInfo.notes,
        items: formItems
          .filter(i => i.finishedProductId && i.quantity)
          .map(i => ({
            finishedProductId: i.finishedProductId,
            quantity: i.quantity,
            rate: i.rate
          }))
      };

      let res;
      if (isEditing && editOrderId) {
        res = await api.put(`/orders/${editOrderId}`, payload);
      } else {
        res = await api.post('/orders', payload);
      }

      if (res.data.ok) {
        setFormSuccess(isEditing ? 'Distribution order updated successfully!' : 'Distribution order saved successfully!');
        alert(isEditing ? 'Distribution order updated!' : 'Distribution order logged!');
        handleResetForm();
        fetchWidgets();
        setActiveTab('active');
      } else {
        setFormError(res.data.error || 'Failed to save order.');
      }
    } catch (err) {
      console.error(err);
      setFormError(err.response?.data?.error || 'Error saving distribution order.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenOrderDetail = async (orderId) => {
    try {
      setSelectedOrderId(orderId);
      setIsDetailModalOpen(true);
      setLoadingDetail(true);

      const res = await api.get(`/orders/${orderId}`);
      if (res.data.ok) {
        setOrderDetail(res.data);
      } else {
        alert(res.data.error || 'Failed to fetch details.');
        setIsDetailModalOpen(false);
      }
    } catch (err) {
      console.error(err);
      alert('Error fetching details.');
      setIsDetailModalOpen(false);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleGenerateBill = () => {
    if (!orderDetail) return;
    navigate('/billing-form', { state: { preloadOrder: orderDetail } });
  };

  const handleMarkAsSupplied = async () => {
    if (!confirm('Are you sure you want to mark this distribution order as Supplied?')) return;
    try {
      const res = await api.post(`/orders/${selectedOrderId}/supply`);
      if (res.data.ok) {
        alert('Order marked as Supplied successfully.');
        setIsDetailModalOpen(false);
        setOrderDetail(null);
        fetchWidgets();
        fetchOrdersList();
      } else {
        alert(res.data.error || 'Failed to complete order.');
      }
    } catch (err) {
      console.error(err);
      alert('Error completing order.');
    }
  };

  const handleTriggerCancelModal = () => {
    setCancelReason('');
    setCancelError('');
    setIsCancelModalOpen(true);
  };

  const handleCancelSubmit = async (e) => {
    e.preventDefault();
    setCancelError('');
    if (!cancelReason.trim()) {
      setCancelError('Please specify reason.');
      return;
    }

    try {
      setIsSavingCancel(true);
      const res = await api.post(`/orders/${selectedOrderId}/cancel`, { reason: cancelReason });
      if (res.data.ok) {
        alert('Order cancelled.');
        setIsCancelModalOpen(false);
        setIsDetailModalOpen(false);
        setOrderDetail(null);
        fetchWidgets();
        fetchOrdersList();
      } else {
        setCancelError(res.data.error || 'Failed to cancel order.');
      }
    } catch (err) {
      console.error(err);
      setCancelError(err.response?.data?.error || 'Error cancelling order.');
    } finally {
      setIsSavingCancel(false);
    }
  };

  const handleTriggerEdit = () => {
    if (!orderDetail) return;
    const o = orderDetail.order;

    setOrderInfo({
      customerId: o.customer_id || '',
      customerName: o.customer_name,
      customerPhone: o.customer_phone,
      customerGstin: o.customer_gstin || '',
      customerAddress: o.customer_address || '',
      customerType: o.customer_type,
      alternatePhone: o.alternate_phone || '',
      supplyDate: o.supply_date,
      supplyTime: o.supply_time,
      deliveryAddress: o.delivery_address || '',
      deliveryInstructions: o.delivery_instructions || '',
      notes: o.notes || '',
      paymentMode: o.payment_mode,
      advanceAmount: String(o.advance_amount),
      discount: String(o.discount),
      tax: String(o.tax)
    });

    const mappedItems = orderDetail.items.map(item => ({
      id: Math.random().toString(36).substring(2, 9),
      finishedProductId: String(item.finishedProductId),
      quantity: String(item.quantity),
      rate: String(item.rate),
      amount: item.amount
    }));

    setFormItems(mappedItems);
    setNameSearchText(o.customer_name);
    setPhoneSearchText(o.customer_phone);
    setIsEditing(true);
    setEditOrderId(o.id);
    setIsDetailModalOpen(false);
    setActiveTab('new');
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
    <div className="space-y-6 animate-fade-in max-w-6xl mx-auto pb-12">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase">Distribution Orders</h1>
          <p className="text-slate-500 text-sm font-medium mt-1">Book and manage wholesale distributor shipments</p>
        </div>
        <div className="flex bg-slate-100 p-1 rounded-xl w-fit border border-slate-200/40 shrink-0">
          <button
            onClick={() => { setActiveTab('active'); handleResetForm(); }}
            className={`px-4 py-2 rounded-lg text-[10px] font-black tracking-wider transition-all uppercase ${
              activeTab === 'active' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            📋 Active Orders
          </button>
          <button
            onClick={() => setActiveTab('new')}
            className={`px-4 py-2 rounded-lg text-[10px] font-black tracking-wider transition-all uppercase ${
              activeTab === 'new' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {isEditing ? '✏️ Edit Order' : '🚚 New Order'}
          </button>
          <button
            onClick={() => { setActiveTab('history'); handleResetForm(); }}
            className={`px-4 py-2 rounded-lg text-[10px] font-black tracking-wider transition-all uppercase ${
              activeTab === 'history' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            ⏳ History
          </button>
        </div>
      </div>

      {/* METRICS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="border border-slate-200/60 bg-white rounded-2xl p-4 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-500 flex items-center justify-center text-xl font-bold shrink-0">⏳</div>
          <div>
            <div className="text-[10px] font-black text-slate-450 uppercase tracking-widest">Active Orders</div>
            <div className="text-2xl font-black text-slate-800 mt-0.5">{widgets.activeCount}</div>
          </div>
        </div>
        <div className="border border-slate-200/60 bg-white rounded-2xl p-4 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-500 flex items-center justify-center text-xl font-bold shrink-0">✅</div>
          <div>
            <div className="text-[10px] font-black text-slate-450 uppercase tracking-widest">Billed / Completed</div>
            <div className="text-2xl font-black text-slate-800 mt-0.5">{widgets.completedCount}</div>
          </div>
        </div>
        <div className="border border-slate-200/60 bg-white rounded-2xl p-4 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center text-xl font-bold shrink-0">⚖️</div>
          <div>
            <div className="text-[10px] font-black text-slate-450 uppercase tracking-widest">Total Active Dues</div>
            <div className="text-2xl font-black text-slate-800 mt-0.5">₹ {widgets.totalDues.toFixed(2)}</div>
          </div>
        </div>
      </div>

      {/* NEW ORDER FORM */}
      {activeTab === 'new' && (
        <form onSubmit={handleSubmitOrder} className="space-y-6 animate-fade-in">
          {isEditing && (
            <div className="flex justify-start">
              <button 
                type="button" 
                onClick={handleResetForm}
                className="px-4 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-all font-bold text-xs rounded-xl shadow-sm flex items-center gap-1"
              >
                ← Cancel & Return
              </button>
            </div>
          )}

          {/* CUSTOMER SEARCH & SELECT SECTION */}
          <div className="border border-slate-200/80 rounded-2xl bg-white p-5 space-y-4 shadow-sm">
            <div className="text-[11px] font-black text-slate-450 uppercase tracking-widest border-b border-slate-100 pb-2.5 flex justify-between items-center">
              <span>👤 DISTRIBUTOR SELECTION</span>
              {orderInfo.customerId && (
                <span className="bg-indigo-50 border border-indigo-100 text-indigo-600 rounded-lg px-2.5 py-0.5 text-[10px] font-extrabold uppercase font-mono">
                  resolved ID: {orderInfo.customerId}
                </span>
              )}
            </div>

            {!isEditing && (
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end bg-slate-50/50 p-4 rounded-xl border border-slate-100 relative">
                <div className="md:col-span-5 space-y-1.5 relative">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">Search Distributor *</label>
                  <input 
                    type="text"
                    placeholder="Type distributor name to lookup..."
                    value={nameSearchText}
                    onChange={handleNameSearchChange}
                    onFocus={() => { if (nameSearchText.trim()) setShowSuggestions(true); }}
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                    required
                  />
                  {showSuggestions && filteredCustomers.length > 0 && (
                    <ul className="absolute z-20 w-full left-0 mt-1.5 bg-white border border-slate-200 rounded-xl max-h-48 overflow-y-auto shadow-lg divide-y divide-slate-100">
                      {filteredCustomers.map(c => (
                        <li 
                          key={c.id} 
                          onClick={() => handleSelectSuggestion(c)}
                          className="px-4 py-2.5 text-xs text-slate-750 hover:bg-slate-55 cursor-pointer flex justify-between font-bold"
                        >
                          <span>{c.name}</span>
                          <span className="text-[10px] text-slate-400 font-mono">{c.phone}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="md:col-span-1 text-center text-[10px] font-black text-slate-450 py-2">OR</div>

                <div className="md:col-span-6 flex gap-2 items-end">
                  <div className="space-y-1.5 flex-1">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">Lookup Phone</label>
                    <input 
                      type="text"
                      placeholder="e.g. 9876543210"
                      value={phoneSearchText}
                      onChange={(e) => setPhoneSearchText(e.target.value)}
                      className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handlePhoneSearchSubmit}
                    className="px-4 h-11 bg-primary hover:bg-blue-600 text-white font-bold text-xs rounded-xl shadow transition-all shrink-0"
                  >
                    🔍 Search
                  </button>
                  <button
                    type="button"
                    onClick={handleClearCustomer}
                    className="px-3 py-11 h-11 bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 rounded-xl shrink-0 text-xs font-bold"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-slate-100 pt-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-black text-slate-555 uppercase tracking-wider block">Distributor Name *</label>
                <input 
                  type="text"
                  value={orderInfo.customerName}
                  onChange={(e) => {
                    setOrderInfo(prev => ({ ...prev, customerName: e.target.value }));
                    setNameSearchText(e.target.value);
                  }}
                  placeholder="Enter distributor name"
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-750 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                  required
                  disabled={isEditing}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-black text-slate-555 uppercase tracking-wider block">Mobile Number *</label>
                <input 
                  type="text"
                  value={orderInfo.customerPhone}
                  onChange={(e) => {
                    setOrderInfo(prev => ({ ...prev, customerPhone: e.target.value }));
                    setPhoneSearchText(e.target.value);
                  }}
                  placeholder="10 digit number"
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-750 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                  required
                  disabled={isEditing}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-black text-slate-555 uppercase tracking-wider block">GSTIN (Optional)</label>
                <input 
                  type="text"
                  value={orderInfo.customerGstin}
                  onChange={(e) => setOrderInfo(prev => ({ ...prev, customerGstin: e.target.value }))}
                  placeholder="GST Number"
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-750 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                  disabled={isEditing}
                />
              </div>

            </div>
          </div>

          {/* PRODUCT ENTRY */}
          <div className="border border-slate-200/80 rounded-2xl bg-white p-5 space-y-4 shadow-sm">
            <div className="flex justify-between items-center border-b border-slate-100 pb-2.5">
              <div className="text-[11px] font-black text-slate-450 uppercase tracking-widest flex items-center gap-1.5">
                <span>🛒</span> PRODUCTS AND QUANTITY
              </div>
              <button
                type="button"
                onClick={handleAddProductRow}
                className="px-3.5 py-1.5 rounded-lg border border-primary/20 text-primary bg-primary/5 hover:bg-primary hover:text-white transition-all text-xs font-bold"
              >
                + Add Product Row
              </button>
            </div>

            <div className="space-y-3">
              {formItems.map((row, index) => (
                <div key={row.id} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end bg-slate-50/40 border border-slate-100 p-4 rounded-2xl relative group">
                  <div className="md:col-span-5 space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Product *</label>
                    <select
                      value={row.finishedProductId}
                      onChange={(e) => handleItemRowChange(row.id, 'finishedProductId', e.target.value)}
                      className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-slate-750 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-semibold"
                      required
                    >
                      <option value="">-- Choose finished product --</option>
                      {finishedProducts.map(fp => (
                        <option key={fp.id} value={fp.id}>{fp.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Qty (Boxes/Units) *</label>
                    <input 
                      type="number"
                      min="1"
                      placeholder="0"
                      value={row.quantity}
                      onChange={(e) => handleItemRowChange(row.id, 'quantity', e.target.value)}
                      className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                      required
                    />
                  </div>

                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Rate (with tax) *</label>
                    <input 
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={row.rate}
                      onChange={(e) => handleItemRowChange(row.id, 'rate', e.target.value)}
                      className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                      required
                    />
                  </div>

                  <div className="md:col-span-3 flex gap-2 items-end justify-between">
                    <div className="flex-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Total Amount</label>
                      <div className="w-full h-11 rounded-xl border border-slate-200 bg-slate-100 flex items-center justify-end px-3.5 font-bold text-slate-700 text-sm">
                        ₹{(row.amount || 0).toFixed(2)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveProductRow(row.id)}
                      className="w-11 h-11 rounded-xl bg-white border border-slate-200 hover:border-red-200 hover:bg-red-50 hover:text-red-500 text-slate-450 transition-all flex items-center justify-center font-bold text-xs shrink-0"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* FINANCIALS & SAVE */}
          <div className="flex flex-col md:flex-row gap-6 items-start w-full">
            <div className="w-full md:flex-1 space-y-6">
              <div className="border border-slate-200/80 rounded-2xl bg-white p-5 space-y-4 shadow-sm">
                <div className="text-[11px] font-black text-slate-450 uppercase tracking-widest border-b border-slate-100 pb-2.5">
                  💵 PAYMENTS RECORD
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider block">Payment Mode *</label>
                    <select
                      value={orderInfo.paymentMode}
                      onChange={(e) => setOrderInfo(prev => ({ ...prev, paymentMode: e.target.value }))}
                      className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-750 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-semibold"
                      required
                    >
                      <option value="Credit">Credit (Pay Later)</option>
                      <option value="Cash">Cash</option>
                      <option value="UPI">UPI</option>
                      <option value="Bank Transfer">Bank Transfer</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider block">Advance Paid (₹)</label>
                    <input 
                      type="number"
                      step="0.01"
                      min="0"
                      value={orderInfo.advanceAmount}
                      onChange={(e) => setOrderInfo(prev => ({ ...prev, advanceAmount: e.target.value }))}
                      placeholder="0.00"
                      className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-750 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-semibold"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3 bg-slate-50 border border-slate-200/60 p-4 rounded-2xl">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Pending Dues:</span>
                  <span className="font-extrabold text-sm text-slate-800">₹ {pendingAmount.toFixed(2)}</span>
                  {pendingAmount === 0 ? (
                    <span className="ml-auto bg-emerald-50 border border-emerald-100 text-emerald-600 rounded-lg px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide">
                      ✅ fully settled
                    </span>
                  ) : (
                    <span className="ml-auto bg-amber-50 border border-amber-100 text-amber-600 rounded-lg px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide animate-pulse">
                      ⏳ outstanding due
                    </span>
                  )}
                </div>
              </div>

              <div className="border border-slate-200/80 rounded-2xl bg-white p-5 space-y-1.5 shadow-sm">
                <label className="text-[11px] font-black text-slate-450 uppercase tracking-wider block">Order Remarks / Internal Notes</label>
                <textarea 
                  placeholder="Enter remarks..."
                  value={orderInfo.notes}
                  onChange={(e) => setOrderInfo(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full p-4 rounded-xl border border-slate-200 bg-white text-slate-750 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium h-20 resize-none"
                />
              </div>
            </div>

            <div className="w-full md:w-[380px] shrink-0 border border-slate-200/80 rounded-2xl bg-white p-5 space-y-4 shadow-sm">
              <div className="text-[11px] font-black text-slate-450 uppercase tracking-widest border-b border-slate-100 pb-2.5">
                📊 GRAND TOTAL BREAKDOWN
              </div>
              <div className="space-y-3 font-semibold text-xs text-slate-650">
                <div className="flex justify-between">
                  <span>Sub Total:</span>
                  <span className="text-slate-800 font-bold">₹ {subTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center gap-2">
                  <span>Discount Value (₹):</span>
                  <input 
                    type="number"
                    min="0"
                    placeholder="0"
                    value={orderInfo.discount}
                    onChange={(e) => setOrderInfo(prev => ({ ...prev, discount: e.target.value }))}
                    className="w-24 h-8 px-2 border border-slate-200 rounded text-right text-slate-700 font-bold"
                  />
                </div>
                <div className="flex justify-between items-center gap-2">
                  <span>Tax Percent (%):</span>
                  <input 
                    type="number"
                    min="0"
                    placeholder="18"
                    value={orderInfo.tax}
                    onChange={(e) => setOrderInfo(prev => ({ ...prev, tax: e.target.value }))}
                    className="w-24 h-8 px-2 border border-slate-200 rounded text-right text-slate-700 font-bold"
                  />
                </div>
                <div className="border-t border-slate-100 pt-3 flex justify-between text-sm font-black text-slate-800">
                  <span>Grand Total:</span>
                  <span className="text-primary font-black">₹ {grandTotal.toFixed(2)}</span>
                </div>
              </div>

              {formError && (
                <div className="bg-rose-50 text-rose-600 px-4 py-3 rounded-xl text-xs font-semibold border border-rose-100">
                  ⚠️ {formError}
                </div>
              )}
              {formSuccess && (
                <div className="bg-emerald-50 text-emerald-600 px-4 py-3 rounded-xl text-xs font-semibold border border-emerald-100">
                  ✅ {formSuccess}
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 h-12 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs shadow-md flex items-center justify-center gap-1.5 transition-all"
                >
                  {isSaving ? 'Saving...' : '💾 Save Order'}
                </button>
                <button
                  type="button"
                  onClick={handleResetForm}
                  className="w-24 h-12 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-650 font-bold text-xs transition-all"
                >
                  Reset
                </button>
              </div>
            </div>
          </div>
        </form>
      )}

      {/* LIST VIEWS */}
      {activeTab !== 'new' && (
        <div className="space-y-6">
          {/* SEARCH & FILTERS */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end bg-white border border-slate-200/60 p-4 rounded-2xl shadow-sm">
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-[10px] font-black text-slate-450 uppercase tracking-wider block">Distributor Lookup Search</label>
              <input 
                type="text"
                placeholder="Name, phone, or order number..."
                value={filterSearch}
                onChange={(e) => { setFilterSearch(e.target.value); setCurrentPage(1); }}
                className="input-premium h-10 text-xs w-full"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-450 uppercase tracking-wider block">Supply From Date</label>
              <input 
                type="date"
                value={filterStartDate}
                onChange={(e) => { setFilterStartDate(e.target.value); setCurrentPage(1); }}
                className="input-premium h-10 text-xs w-full"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-450 uppercase tracking-wider block">Supply To Date</label>
              <input 
                type="date"
                value={filterEndDate}
                onChange={(e) => { setFilterEndDate(e.target.value); setCurrentPage(1); }}
                className="input-premium h-10 text-xs w-full"
              />
            </div>
          </div>

          {/* TABLE */}
          <div className="border border-slate-200/60 bg-white rounded-2xl shadow-sm overflow-hidden animate-fade-in">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/75 border-b border-slate-200/80 text-[10px] font-black text-slate-450 uppercase tracking-wider">
                    <th className="py-4 px-5">Order No</th>
                    <th className="py-4 px-5">Distributor Details</th>
                    <th className="py-4 px-5">Order Date</th>
                    <th className="py-4 px-5 text-right">Order Amount</th>
                    <th className="py-4 px-5 text-right">Advance Paid</th>
                    <th className="py-4 px-5 text-right">Balance Due</th>
                    <th className="py-4 px-5 text-center">Status</th>
                    <th className="py-4 px-5 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-705 text-xs font-semibold">
                  {loadingList ? (
                    <tr>
                      <td colSpan="8" className="py-24 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <span className="loading loading-spinner text-primary"></span>
                          <span className="text-slate-400 text-sm font-medium">Fetching distribution orders...</span>
                        </div>
                      </td>
                    </tr>
                  ) : orders.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="py-16 text-center text-slate-400 font-semibold bg-slate-50/10">
                        No distribution orders found. Click "New Order" to record a wholesale shipment.
                      </td>
                    </tr>
                  ) : (
                    orders.map(order => {
                      const due = parseFloat(order.pending_amount) || 0;
                      return (
                        <tr key={order.id} className="hover:bg-slate-50/30 transition-colors">
                          <td className="py-4 px-5 font-bold text-slate-600">{order.id}</td>
                          <td className="py-4 px-5">
                            <div className="font-extrabold text-slate-800">{order.customer_name}</div>
                            <div className="text-[10px] font-bold text-slate-400 mt-0.5">{order.customer_phone}</div>
                          </td>
                          <td className="py-4 px-5">
                            <div className="text-slate-850 font-bold">{formatDateDDMMYYYY(order.supply_date)}</div>
                          </td>
                          <td className="py-4 px-5 text-right font-black text-slate-800">
                            ₹ {(parseFloat(order.grand_total) || 0).toFixed(2)}
                          </td>
                          <td className="py-4 px-5 text-right text-emerald-600">
                            ₹ {(parseFloat(order.advance_amount) || 0).toFixed(2)}
                          </td>
                          <td className="py-4 px-5 text-right font-bold text-rose-500">
                            ₹ {due.toFixed(2)}
                          </td>
                          <td className="py-4 px-5 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold border ${
                              order.status === 'PENDING' ? 'bg-amber-50 border-amber-100 text-amber-600' :
                              order.status === 'SUPPLIED' ? 'bg-emerald-50 border-emerald-100 text-emerald-600' :
                              'bg-rose-50 border-rose-100 text-rose-600'
                            }`}>
                              {order.status === 'PENDING' ? 'ACTIVE' : order.status}
                            </span>
                          </td>
                          <td className="py-4 px-5">
                            <div className="flex justify-center">
                              <button 
                                onClick={() => handleOpenOrderDetail(order.id)}
                                className="px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold transition-all text-xs flex items-center gap-1"
                              >
                                👁 View Details
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {!loadingList && totalCount > 0 && (
              <div className="flex items-center justify-between p-4 border-t border-slate-100 bg-white">
                <div className="text-xs font-bold text-slate-400 uppercase">
                  Page {currentPage} of {Math.ceil(totalCount / limit) || 1} ({totalCount} records)
                </div>
                <div className="flex gap-2">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-slate-650 bg-white hover:bg-slate-50 disabled:opacity-50 text-xs font-bold transition-all"
                  >
                    Previous
                  </button>
                  <button
                    disabled={currentPage === Math.ceil(totalCount / limit)}
                    onClick={() => setCurrentPage(prev => Math.min(Math.ceil(totalCount / limit), prev + 1))}
                    className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-slate-650 bg-white hover:bg-slate-50 disabled:opacity-50 text-xs font-bold transition-all"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ORDER DETAILS MODAL */}
      {isDetailModalOpen && createPortal(
        <div className="modal modal-open animate-fade-in z-50">
          <div className="modal-box max-w-4xl bg-white border border-slate-200/80 rounded-3xl p-8 relative shadow-2xl z-10 max-h-[90vh] overflow-y-auto">
            <button 
              onClick={() => { setIsDetailModalOpen(false); setOrderDetail(null); }}
              className="absolute top-4 right-4 w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 text-slate-550 hover:bg-slate-100 flex items-center justify-center font-bold transition-all"
            >
              ✕
            </button>

            {loadingDetail ? (
              <div className="py-24 text-center">
                <span className="loading loading-spinner text-primary"></span>
                <p className="text-slate-450 mt-2 text-xs font-bold uppercase tracking-wider">Loading details...</p>
              </div>
            ) : orderDetail ? (
              <div className="space-y-6">
                
                <div className="flex justify-between items-start border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Distribution Order: {orderDetail.order.id}</h3>
                    <p className="text-slate-500 text-xs font-bold mt-0.5">
                      Order Date: <span className="font-extrabold text-slate-750">{formatDateDDMMYYYY(orderDetail.order.supply_date)}</span>
                    </p>
                  </div>
                  <span className={`px-3 py-1 rounded text-xs font-extrabold uppercase border ${
                    orderDetail.order.status === 'PENDING' ? 'bg-amber-50 border-amber-100 text-amber-600' :
                    orderDetail.order.status === 'SUPPLIED' ? 'bg-emerald-50 border-emerald-100 text-emerald-600' :
                    'bg-rose-50 border-rose-100 text-rose-600'
                  }`}>
                    {orderDetail.order.status}
                  </span>
                </div>

                <div className="bg-slate-50 border border-slate-150 p-5 rounded-2xl text-xs font-semibold text-slate-600">
                  <div className="space-y-1.5">
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider">👤 Distributor Profile</div>
                    <div className="text-slate-800 font-black text-sm">{orderDetail.order.customer_name}</div>
                    <div>Phone: {orderDetail.order.customer_phone}</div>
                    {orderDetail.order.customer_gstin && <div>GSTIN: {orderDetail.order.customer_gstin}</div>}
                    {orderDetail.order.customer_address && <div className="mt-1">Billing / Office: {orderDetail.order.customer_address}</div>}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                  {/* Products table */}
                  <div className="md:col-span-7 space-y-3">
                    <h4 className="text-xs font-black text-slate-450 uppercase tracking-widest border-b border-slate-100 pb-1.5">📦 Products List</h4>
                    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-100 border-b border-slate-200 text-[9px] font-black text-slate-500 uppercase tracking-wider">
                            <th className="py-2.5 px-3">Product</th>
                            <th className="py-2.5 px-3 text-center">Qty</th>
                            <th className="py-2.5 px-3 text-right">Rate</th>
                            <th className="py-2.5 px-3 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-150 font-bold text-slate-750">
                          {orderDetail.items.map((item, idx) => (
                            <tr key={idx}>
                              <td className="py-2.5 px-3 text-slate-800 font-extrabold">{item.productName}</td>
                              <td className="py-2.5 px-3 text-center">{item.quantity}</td>
                              <td className="py-2.5 px-3 text-right">₹{(parseFloat(item.rate) || 0).toFixed(2)}</td>
                              <td className="py-2.5 px-3 text-right text-slate-800">₹{(parseFloat(item.amount) || 0).toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Payment Breakdown totals */}
                  <div className="md:col-span-5 space-y-3">
                    <h4 className="text-xs font-black text-slate-455 uppercase tracking-widest border-b border-slate-100 pb-1.5">💵 Financial breakdown</h4>
                    <div className="bg-slate-50/50 border border-slate-200 p-4 rounded-xl space-y-3 text-xs font-semibold text-slate-600">
                      <div className="flex justify-between">
                        <span>Sub Total:</span>
                        <span className="text-slate-800 font-bold">₹{(parseFloat(orderDetail.order.sub_total) || 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Discount:</span>
                        <span className="text-rose-500 font-bold">- ₹{(parseFloat(orderDetail.order.discount) || 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Tax Percent:</span>
                        <span className="text-slate-800 font-bold">{orderDetail.order.tax}%</span>
                      </div>
                      <div className="border-t border-slate-200 pt-2 flex justify-between text-xs font-black text-slate-800">
                        <span>Grand Total:</span>
                        <span className="text-primary font-black">₹{(parseFloat(orderDetail.order.grand_total) || 0).toFixed(2)}</span>
                      </div>
                      <div className="border-t border-slate-200/60 pt-2 flex justify-between">
                        <span>Payment Mode:</span>
                        <span className="text-slate-800 font-extrabold">{orderDetail.order.payment_mode}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Advance Paid:</span>
                        <span className="text-emerald-600 font-extrabold">₹{(parseFloat(orderDetail.order.advance_amount) || 0).toFixed(2)}</span>
                      </div>
                      <div className="border-t border-slate-200 pt-2 flex justify-between items-center text-rose-500 font-black text-sm">
                        <span>Balance Due:</span>
                        <span>₹{(parseFloat(orderDetail.order.pending_amount) || 0).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-semibold text-slate-500">
                  {orderDetail.order.notes && (
                    <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl">
                      <span className="font-black text-slate-400 block text-[9px] uppercase tracking-wide">Remarks</span>
                      <p className="mt-1 text-slate-700 italic break-words">{orderDetail.order.notes}</p>
                    </div>
                  )}
                  <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl space-y-1 font-mono text-[10px]">
                    <span className="font-black text-slate-400 block text-[9px] uppercase tracking-wide font-sans">AUDIT</span>
                    <div>Created By: {orderDetail.order.created_by} at {new Date(orderDetail.order.created_at).toLocaleString()}</div>
                    {orderDetail.order.edited_by && (
                      <div>Edited By: {orderDetail.order.edited_by} at {new Date(orderDetail.order.edited_at).toLocaleString()}</div>
                    )}
                    {orderDetail.order.status === 'SUPPLIED' && (
                      <div className="text-emerald-600">Billed/Supplied By: {orderDetail.order.supplied_by} at {new Date(orderDetail.order.supplied_at).toLocaleString()}</div>
                    )}
                    {orderDetail.order.status === 'CANCELLED' && (
                      <div className="text-rose-600">
                        <div>Cancelled By: {orderDetail.order.cancelled_by} at {new Date(orderDetail.order.cancelled_at).toLocaleString()}</div>
                        <div>Reason: "{orderDetail.order.cancellation_reason}"</div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
                  {orderDetail.order.status === 'PENDING' && (
                    <>
                      <button 
                        onClick={handleTriggerEdit}
                        className="px-4 py-2 bg-indigo-50 border border-indigo-150 hover:bg-indigo-100 text-indigo-600 font-bold text-xs rounded-xl shadow-sm transition-all"
                      >
                        ✏️ Edit Order
                      </button>
                      <button 
                        onClick={handleTriggerCancelModal}
                        className="px-4 py-2 bg-rose-50 border border-rose-150 hover:bg-rose-100 text-rose-600 font-bold text-xs rounded-xl shadow-sm transition-all"
                      >
                        ❌ Cancel Order
                      </button>
                      <button 
                        onClick={handleMarkAsSupplied}
                        className="px-4 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-250 text-slate-750 font-bold text-xs rounded-xl transition-all"
                      >
                        ✅ supplied
                      </button>
                      <button 
                        onClick={handleGenerateBill}
                        className="px-5 py-2.5 bg-primary hover:bg-blue-600 text-white font-black text-xs rounded-xl shadow transition-all duration-200"
                      >
                        💵 Generate Bill
                      </button>
                    </>
                  )}
                  <button 
                    onClick={() => { setIsDetailModalOpen(false); setOrderDetail(null); }}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-650 font-bold text-xs rounded-xl transition-all"
                  >
                    Close View
                  </button>
                </div>

              </div>
            ) : null}
          </div>
          <div 
            className="modal-backdrop bg-slate-900/40 backdrop-blur-sm" 
            onClick={() => { setIsDetailModalOpen(false); setOrderDetail(null); }}
          ></div>
        </div>,
        document.body
      )}

      {/* CANCELLATION DIALOG */}
      {isCancelModalOpen && createPortal(
        <div className="modal modal-open animate-fade-in z-[60]">
          <div className="modal-box max-w-sm bg-white border border-slate-200/80 rounded-2xl p-6 relative shadow-2xl z-10 max-h-[90vh] overflow-y-auto">
            <button 
              onClick={() => setIsCancelModalOpen(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-lg bg-slate-50 border border-slate-200 text-slate-450 hover:bg-slate-100 flex items-center justify-center font-bold transition-all"
            >
              ✕
            </button>

            <h3 className="text-md font-black text-slate-800 uppercase tracking-tight mb-2">Cancel Order</h3>
            <p className="text-slate-500 text-xs font-semibold mb-4">Provide reason for cancellation:</p>

            <form onSubmit={handleCancelSubmit} className="space-y-4">
              <textarea 
                placeholder="Reason..."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full p-3 rounded-xl border border-slate-200 bg-white text-slate-750 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-xs font-medium h-20 resize-none"
                required
              />

              {cancelError && (
                <div className="bg-rose-50 text-rose-600 px-3 py-2 rounded-lg text-[10px] font-semibold border border-rose-100">
                  ⚠️ {cancelError}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={isSavingCancel}
                  className="flex-1 h-10 bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs rounded-xl shadow transition-all"
                >
                  {isSavingCancel ? 'Saving...' : 'Confirm'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsCancelModalOpen(false)}
                  className="w-20 h-10 bg-slate-100 hover:bg-slate-200 text-slate-650 font-bold text-xs rounded-xl transition-all"
                >
                  Back
                </button>
              </div>
            </form>
          </div>
          <div 
            className="modal-backdrop bg-slate-900/40 backdrop-blur-sm" 
            onClick={() => setIsCancelModalOpen(false)}
          ></div>
        </div>,
        document.body
      )}

    </div>
  );
};

export default DistributionOrder;
