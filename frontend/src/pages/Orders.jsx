import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import api from '../api/axios';

const Orders = () => {
  const navigate = useNavigate();
  // Tabs: 'upcoming' | 'new-order' | 'history'
  const [activeTab, setActiveTab] = useState('upcoming');
  // History Sub-tabs: 'supplied' | 'cancelled' | 'all'
  const [historyTab, setHistoryTab] = useState('all');

  // Master lists
  const [finishedProducts, setFinishedProducts] = useState([]);
  const [customers, setCustomers] = useState([]);

  // Metrics Widgets State
  const [widgets, setWidgets] = useState({
    todayDeliveries: 0,
    pendingCount: 0,
    suppliedToday: 0,
    cancelledToday: 0
  });

  // ==========================================
  // FILTERS STATE
  // ==========================================
  const [filterSearch, setFilterSearch] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterProductId, setFilterProductId] = useState('');
  const [filterDeliveryArea, setFilterDeliveryArea] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [limit] = useState(10);

  // Orders lists
  const [orders, setOrders] = useState([]);
  const [loadingList, setLoadingList] = useState(false);

  // ==========================================
  // FORM STATE (Create / Edit)
  // ==========================================
  const [isEditing, setIsEditing] = useState(false);
  const [editOrderId, setEditOrderId] = useState(null);
  
  const [orderInfo, setOrderInfo] = useState({
    customerId: '',
    customerName: '',
    customerPhone: '',
    customerGstin: '',
    customerAddress: '',
    customerType: 'General Customer',
    alternatePhone: '',
    supplyDate: '',
    supplyTime: '',
    deliveryAddress: '',
    deliveryInstructions: '',
    notes: '',
    paymentMode: 'Cash',
    advanceAmount: '0',
    discount: '0',
    tax: '0'
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

  // ==========================================
  // MODALS & DETAIL VIEWS
  // ==========================================
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [orderDetail, setOrderDetail] = useState(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Cancel order modal
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [isSavingCancel, setIsSavingCancel] = useState(false);
  const [cancelError, setCancelError] = useState('');

  // ==========================================
  // INITIAL LOAD & STATE WATCHES
  // ==========================================
  useEffect(() => {
    fetchDropdownMasters();
    fetchWidgets();
    fetchOrdersList();
  }, []);

  useEffect(() => {
    fetchOrdersList();
  }, [activeTab, historyTab, currentPage, filterSearch, filterStartDate, filterEndDate, filterStatus, filterProductId, filterDeliveryArea]);

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
      const res = await api.get('/orders/dashboard-widgets');
      if (res.data.ok) {
        setWidgets(res.data.widgets);
      }
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
        productId: filterProductId,
        deliveryArea: filterDeliveryArea
      };

      if (activeTab === 'upcoming') {
        params.upcoming = 'true';
      } else if (activeTab === 'history') {
        if (historyTab === 'supplied') {
          params.status = 'SUPPLIED';
        } else if (historyTab === 'cancelled') {
          params.status = 'CANCELLED';
        } else {
          params.status = filterStatus; // Allow status filtering in All tab
        }
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

  // ==========================================
  // AUTOCOMPLETE LOOKUPS
  // ==========================================
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
      alert("No matching customer profile found with phone " + clean + ". Creating new profile.");
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

  // ==========================================
  // FORM MATH CALCULATIONS
  // ==========================================
  const handleItemRowChange = (rowId, field, value) => {
    const updated = formItems.map(item => {
      if (item.id === rowId) {
        const copy = { ...item, [field]: value };
        
        // Auto-fetch rate from finished product if product changes
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

  // Calculate totals
  const subTotal = formItems.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
  const discountVal = parseFloat(orderInfo.discount) || 0;
  const taxPercent = parseFloat(orderInfo.tax) || 0;
  
  const totalAfterDiscount = Math.max(0, subTotal - discountVal);
  const taxVal = totalAfterDiscount * (taxPercent / 100);
  const grandTotal = totalAfterDiscount + taxVal;
  
  const advanceVal = parseFloat(orderInfo.advanceAmount) || 0;
  const pendingAmount = Math.max(0, grandTotal - advanceVal);

  // ==========================================
  // CREATE / UPDATE ACTION SUBMITS
  // ==========================================
  const handleResetForm = () => {
    setOrderInfo({
      customerId: '',
      customerName: '',
      customerPhone: '',
      customerGstin: '',
      customerAddress: '',
      customerType: 'General Customer',
      alternatePhone: '',
      supplyDate: '',
      supplyTime: '',
      deliveryAddress: '',
      deliveryInstructions: '',
      notes: '',
      paymentMode: 'Cash',
      advanceAmount: '0',
      discount: '0',
      tax: '0'
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
        customerType: orderInfo.customerType,
        alternatePhone: orderInfo.alternatePhone,
        supplyDate: orderInfo.supplyDate,
        supplyTime: orderInfo.supplyTime,
        deliveryAddress: orderInfo.deliveryAddress,
        deliveryInstructions: orderInfo.deliveryInstructions,
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
        setFormSuccess(isEditing ? 'Order updated successfully!' : 'Order recorded successfully!');
        alert(isEditing ? 'Order updated successfully!' : 'Order recorded successfully!');
        handleResetForm();
        fetchWidgets();
        setActiveTab('upcoming');
      } else {
        setFormError(res.data.error || 'Failed to submit order.');
      }
    } catch (err) {
      console.error(err);
      setFormError(err.response?.data?.error || 'Error saving order.');
    } finally {
      setIsSaving(false);
    }
  };

  // ==========================================
  // DETAIL MODAL LOGIC
  // ==========================================
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

  // Supply flow
  const handleMarkAsSupplied = async () => {
    if (!confirm('Are you sure you want to mark this order as Supplied/Delivered? This will lock the order from editing.')) return;
    try {
      const res = await api.post(`/orders/${selectedOrderId}/supply`);
      if (res.data.ok) {
        alert('Order completed and marked as Supplied.');
        setIsDetailModalOpen(false);
        setOrderDetail(null);
        fetchWidgets();
        fetchOrdersList();
      } else {
        alert(res.data.error || 'Failed to mark supplied.');
      }
    } catch (err) {
      console.error(err);
      alert('Error marking supplied.');
    }
  };

  // Cancellation flow
  const handleTriggerCancelModal = () => {
    setCancelReason('');
    setCancelError('');
    setIsCancelModalOpen(true);
  };

  const handleCancelSubmit = async (e) => {
    e.preventDefault();
    setCancelError('');
    if (!cancelReason.trim()) {
      setCancelError('Please specify cancellation reason.');
      return;
    }

    try {
      setIsSavingCancel(true);
      const res = await api.post(`/orders/${selectedOrderId}/cancel`, { reason: cancelReason });
      if (res.data.ok) {
        alert('Order cancelled successfully.');
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

  // Edit triggers from details modal
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
    setActiveTab('new-order');
  };

  const handleGenerateBill = () => {
    if (!orderDetail) return;
    navigate('/billing-form', { state: { preloadOrder: orderDetail } });
  };

  // Helpers
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
      
      {/* HEADER BAR */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase">Order Management</h1>
          <p className="text-slate-500 text-sm font-medium mt-1">Book advanced customer orders and track delivery schedules</p>
        </div>
        <div className="flex bg-slate-100 p-1 rounded-xl w-fit border border-slate-200/40 shrink-0">
          <button
            onClick={() => { setActiveTab('upcoming'); handleResetForm(); }}
            className={`px-4 py-2 rounded-lg text-[10px] font-black tracking-wider transition-all uppercase ${
              activeTab === 'upcoming' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            📋 Upcoming Orders
          </button>
          <button
            onClick={() => setActiveTab('new-order')}
            className={`px-4 py-2 rounded-lg text-[10px] font-black tracking-wider transition-all uppercase ${
              activeTab === 'new-order' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {isEditing ? '✏️ Edit Order' : '🛍️ New Order'}
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

      {/* METRICS WIDGETS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="border border-slate-200/60 bg-white rounded-2xl p-4 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-500 flex items-center justify-center text-xl font-bold shrink-0">📅</div>
          <div>
            <div className="text-[10px] font-black text-slate-450 uppercase tracking-widest">Today's Schedule</div>
            <div className="text-2xl font-black text-slate-800 mt-0.5">{widgets.todayDeliveries}</div>
          </div>
        </div>
        <div className="border border-slate-200/60 bg-white rounded-2xl p-4 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-500 flex items-center justify-center text-xl font-bold shrink-0">⏳</div>
          <div>
            <div className="text-[10px] font-black text-slate-450 uppercase tracking-widest">Pending Supply</div>
            <div className="text-2xl font-black text-slate-800 mt-0.5">{widgets.pendingCount}</div>
          </div>
        </div>
        <div className="border border-slate-200/60 bg-white rounded-2xl p-4 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-500 flex items-center justify-center text-xl font-bold shrink-0">✅</div>
          <div>
            <div className="text-[10px] font-black text-slate-450 uppercase tracking-widest">Supplied Today</div>
            <div className="text-2xl font-black text-slate-800 mt-0.5">{widgets.suppliedToday}</div>
          </div>
        </div>
        <div className="border border-slate-200/60 bg-white rounded-2xl p-4 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center text-xl font-bold shrink-0">❌</div>
          <div>
            <div className="text-[10px] font-black text-slate-450 uppercase tracking-widest">Cancelled Today</div>
            <div className="text-2xl font-black text-slate-800 mt-0.5">{widgets.cancelledToday}</div>
          </div>
        </div>
      </div>

      {/* TABS VIEW CONTROLLERS */}
      {activeTab === 'new-order' && (
        <form onSubmit={handleSubmitOrder} className="space-y-6 animate-fade-in">
          {/* Form back warning if editing */}
          {isEditing && (
            <div className="flex justify-start">
              <button 
                type="button" 
                onClick={handleResetForm}
                className="px-4 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-all font-bold text-xs rounded-xl shadow-sm flex items-center gap-1"
              >
                ← Cancel Editing & Back
              </button>
            </div>
          )}

          {/* CUSTOMER SEARCH & SELECT SECTION */}
          <div className="border border-slate-200/80 rounded-2xl bg-white p-5 space-y-4 shadow-sm">
            <div className="text-[11px] font-black text-slate-450 uppercase tracking-widest border-b border-slate-100 pb-2.5 flex justify-between items-center">
              <span>👤 CUSTOMER SELECTION</span>
              {orderInfo.customerId && (
                <span className="bg-indigo-50 border border-indigo-100 text-indigo-600 rounded-lg px-2.5 py-0.5 text-[10px] font-extrabold uppercase font-mono">
                  resolved ID: {orderInfo.customerId}
                </span>
              )}
            </div>

            {/* Selection Lookup row */}
            {!isEditing && (
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end bg-slate-50/50 p-4 rounded-xl border border-slate-100 relative">
                <div className="md:col-span-5 space-y-1.5 relative">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">Search Customer *</label>
                  <input 
                    type="text"
                    placeholder="Type name to lookup..."
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
                          className="px-4 py-2.5 text-xs text-slate-750 hover:bg-slate-50 cursor-pointer flex justify-between font-bold"
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
                    className="px-3 py-11 h-11 bg-white border border-slate-200 text-slate-500 hover:bg-slate-55 rounded-xl shrink-0 text-xs font-bold"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}

            {/* Profile fields grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-slate-100 pt-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-black text-slate-550 uppercase tracking-wider block">Customer Name *</label>
                <input 
                  type="text"
                  value={orderInfo.customerName}
                  onChange={(e) => {
                    setOrderInfo(prev => ({ ...prev, customerName: e.target.value }));
                    setNameSearchText(e.target.value);
                  }}
                  placeholder="Enter customer name"
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                  required
                  disabled={isEditing}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-black text-slate-550 uppercase tracking-wider block">Mobile Number *</label>
                <input 
                  type="text"
                  value={orderInfo.customerPhone}
                  onChange={(e) => {
                    setOrderInfo(prev => ({ ...prev, customerPhone: e.target.value }));
                    setPhoneSearchText(e.target.value);
                  }}
                  placeholder="10 digit number"
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                  required
                  disabled={isEditing}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-black text-slate-550 uppercase tracking-wider block">Customer Type *</label>
                <select
                  value={orderInfo.customerType}
                  onChange={(e) => setOrderInfo(prev => ({ ...prev, customerType: e.target.value }))}
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-semibold"
                  required
                  disabled={isEditing}
                >
                  <option value="General Customer">General Customer</option>
                  <option value="Distributor">Distributor</option>
                  <option value="Wholesaler">Wholesaler</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-black text-slate-450 uppercase tracking-wider block">GSTIN (Optional)</label>
                <input 
                  type="text"
                  value={orderInfo.customerGstin}
                  onChange={(e) => setOrderInfo(prev => ({ ...prev, customerGstin: e.target.value }))}
                  placeholder="GST Number"
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                  disabled={isEditing}
                />
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <label className="text-[11px] font-black text-slate-450 uppercase tracking-wider block">Billing Address (Optional)</label>
                <input 
                  type="text"
                  value={orderInfo.customerAddress}
                  onChange={(e) => setOrderInfo(prev => ({ ...prev, customerAddress: e.target.value }))}
                  placeholder="Customer billing address"
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                  disabled={isEditing}
                />
              </div>
            </div>
          </div>

          {/* DELIVERY DETAILS SECTION */}
          <div className="border border-slate-200/80 rounded-2xl bg-white p-5 space-y-4 shadow-sm">
            <div className="text-[11px] font-black text-slate-450 uppercase tracking-widest border-b border-slate-100 pb-2.5">
              🚚 DELIVERY DETAILS
            </div>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              <div className="md:col-span-4 space-y-1.5">
                <label className="text-[11px] font-black text-slate-550 uppercase tracking-wider block">Date of Supply *</label>
                <input 
                  type="date"
                  value={orderInfo.supplyDate}
                  onChange={(e) => setOrderInfo(prev => ({ ...prev, supplyDate: e.target.value }))}
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-semibold"
                  required
                />
              </div>

              <div className="md:col-span-4 space-y-1.5">
                <label className="text-[11px] font-black text-slate-550 uppercase tracking-wider block">Time of Supply *</label>
                <input 
                  type="time"
                  value={orderInfo.supplyTime}
                  onChange={(e) => setOrderInfo(prev => ({ ...prev, supplyTime: e.target.value }))}
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-semibold"
                  required
                />
              </div>

              <div className="md:col-span-4 space-y-1.5">
                <label className="text-[11px] font-black text-slate-450 uppercase tracking-wider block">Alternate Phone (Optional)</label>
                <input 
                  type="text"
                  placeholder="e.g. 9876543211"
                  value={orderInfo.alternatePhone}
                  onChange={(e) => setOrderInfo(prev => ({ ...prev, alternatePhone: e.target.value }))}
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                />
              </div>

              <div className="md:col-span-6 space-y-1.5">
                <label className="text-[11px] font-black text-slate-550 uppercase tracking-wider block">Delivery Address *</label>
                <textarea 
                  placeholder="Enter full delivery/shipping address..."
                  value={orderInfo.deliveryAddress}
                  onChange={(e) => setOrderInfo(prev => ({ ...prev, deliveryAddress: e.target.value }))}
                  className="w-full p-4 rounded-xl border border-slate-200 bg-white text-slate-750 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium h-20 resize-none"
                  required
                />
              </div>

              <div className="md:col-span-6 space-y-1.5">
                <label className="text-[11px] font-black text-slate-450 uppercase tracking-wider block">Delivery Instructions / Notes (Optional)</label>
                <textarea 
                  placeholder="E.g. Call before dispatch, deliver in morning..."
                  value={orderInfo.deliveryInstructions}
                  onChange={(e) => setOrderInfo(prev => ({ ...prev, deliveryInstructions: e.target.value }))}
                  className="w-full p-4 rounded-xl border border-slate-200 bg-white text-slate-750 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium h-20 resize-none"
                />
              </div>
            </div>
          </div>

          {/* PRODUCT ENTRY SECTION */}
          <div className="border border-slate-200/80 rounded-2xl bg-white p-5 space-y-4 shadow-sm">
            <div className="flex justify-between items-center border-b border-slate-100 pb-2.5">
              <div className="text-[11px] font-black text-slate-450 uppercase tracking-widest flex items-center gap-1.5">
                <span>🛒 ORDER ITEMS list</span>
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
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Product Name *</label>
                    <select
                      value={row.finishedProductId}
                      onChange={(e) => handleItemRowChange(row.id, 'finishedProductId', e.target.value)}
                      className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-slate-750 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-semibold"
                      required
                    >
                      <option value="">-- Choose Product --</option>
                      {finishedProducts.map(fp => (
                        <option key={fp.id} value={fp.id}>{fp.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Quantity (Boxes) *</label>
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
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Total Amt</label>
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

              {formItems.length === 0 && (
                <div className="py-12 border border-dashed border-slate-200 rounded-2xl bg-slate-50/20 text-center text-slate-400 font-bold text-xs">
                  No items listed. Click "+ Add Product Row" to begin.
                </div>
              )}
            </div>
          </div>

          {/* SUMMARY & PAYMENTS */}
          <div className="flex flex-col md:flex-row gap-6 items-start w-full">
            
            {/* Left side: Notes & Payments */}
            <div className="w-full md:flex-1 space-y-6">
              <div className="border border-slate-200/80 rounded-2xl bg-white p-5 space-y-4 shadow-sm">
                <div className="text-[11px] font-black text-slate-450 uppercase tracking-widest border-b border-slate-100 pb-2.5">
                  💵 PAYMENT INFORMATION
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
                      <option value="Cash">Cash</option>
                      <option value="UPI">UPI</option>
                      <option value="Bank Transfer">Bank Transfer</option>
                      <option value="Credit">Credit</option>
                      <option value="Advance Payment">Advance Payment</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider block">Advance Amount Received</label>
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

                {/* Display balance left badge */}
                <div className="flex items-center gap-3 bg-slate-50 border border-slate-200/60 p-4 rounded-2xl">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Pending Balance:</span>
                  <span className="font-extrabold text-sm text-slate-800">₹{pendingAmount.toFixed(2)}</span>
                  {pendingAmount === 0 ? (
                    <span className="ml-auto bg-emerald-50 border border-emerald-100 text-emerald-600 rounded-lg px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide">
                      ✅ Payment Cleared
                    </span>
                  ) : (
                    <span className="ml-auto bg-amber-50 border border-amber-100 text-amber-600 rounded-lg px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide animate-pulse">
                      ⏳ Balance Left
                    </span>
                  )}
                </div>
              </div>

              {/* Notes */}
              <div className="border border-slate-200/80 rounded-2xl bg-white p-5 space-y-1.5 shadow-sm">
                <label className="text-[11px] font-black text-slate-450 uppercase tracking-wider block">Internal Order Notes / Instructions (Optional)</label>
                <textarea 
                  placeholder="Enter any additional office notes or custom remarks..."
                  value={orderInfo.notes}
                  onChange={(e) => setOrderInfo(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full p-4 rounded-xl border border-slate-200 bg-white text-slate-750 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium h-24 resize-none"
                />
              </div>
            </div>

            {/* Right side: Receipt Totals Summary */}
            <div className="w-full md:w-[380px] shrink-0 border border-slate-200/80 rounded-2xl bg-white p-5 space-y-4 shadow-sm">
              <div className="text-[11px] font-black text-slate-450 uppercase tracking-widest border-b border-slate-100 pb-2.5">
                📊 ORDER VALUE BREAKDOWN
              </div>
              <div className="space-y-3 font-semibold text-xs text-slate-600">
                <div className="flex justify-between">
                  <span>Sub Total:</span>
                  <span className="text-slate-800 font-bold">₹{subTotal.toFixed(2)}</span>
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
                    placeholder="0"
                    value={orderInfo.tax}
                    onChange={(e) => setOrderInfo(prev => ({ ...prev, tax: e.target.value }))}
                    className="w-24 h-8 px-2 border border-slate-200 rounded text-right text-slate-700 font-bold"
                  />
                </div>
                <div className="border-t border-slate-100 pt-3 flex justify-between text-sm font-black text-slate-800">
                  <span>Grand Total:</span>
                  <span className="text-primary font-black">₹{grandTotal.toFixed(2)}</span>
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
                  className="flex-1 h-12 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs shadow-md shadow-emerald-100 flex items-center justify-center gap-1.5 transition-all duration-200"
                >
                  {isSaving ? 'Saving...' : (isEditing ? '💾 Update Order' : '💾 Save Order')}
                </button>
                <button
                  type="button"
                  onClick={handleResetForm}
                  className="w-24 h-12 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-650 font-bold text-xs transition-all duration-200"
                >
                  Reset
                </button>
              </div>
            </div>

          </div>
        </form>
      )}

      {activeTab !== 'new-order' && (
        <div className="space-y-6">
          
          {/* SEARCH & FILTERS CONTAINER */}
          <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-3 items-end bg-white border border-slate-200/60 p-4 rounded-2xl shadow-sm">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-450 uppercase tracking-wider block">Customer Search</label>
              <input 
                type="text"
                placeholder="Name, phone, order ID..."
                value={filterSearch}
                onChange={(e) => { setFilterSearch(e.target.value); setCurrentPage(1); }}
                className="input-premium h-10 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-450 uppercase tracking-wider block">Supply From Date</label>
              <input 
                type="date"
                value={filterStartDate}
                onChange={(e) => { setFilterStartDate(e.target.value); setCurrentPage(1); }}
                className="input-premium h-10 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-450 uppercase tracking-wider block">Supply To Date</label>
              <input 
                type="date"
                value={filterEndDate}
                onChange={(e) => { setFilterEndDate(e.target.value); setCurrentPage(1); }}
                className="input-premium h-10 text-xs"
              />
            </div>
            {activeTab === 'history' && (
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-450 uppercase tracking-wider block">Status</label>
                <select
                  value={filterStatus}
                  onChange={(e) => { setFilterStatus(e.target.value); setCurrentPage(1); }}
                  className="input-premium h-10 text-xs font-semibold"
                  disabled={historyTab !== 'all'}
                >
                  <option value="">All Statuses</option>
                  <option value="PENDING">Pending</option>
                  <option value="SUPPLIED">Supplied</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-450 uppercase tracking-wider block">Filter Product</label>
              <select
                value={filterProductId}
                onChange={(e) => { setFilterProductId(e.target.value); setCurrentPage(1); }}
                className="input-premium h-10 text-xs font-semibold"
              >
                <option value="">All Products</option>
                {finishedProducts.map(fp => (
                  <option key={fp.id} value={fp.id}>{fp.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5 lg:col-span-1">
              <label className="text-[10px] font-black text-slate-450 uppercase tracking-wider block">Delivery Area</label>
              <input 
                type="text"
                placeholder="E.g. Jayanagar, Block 4..."
                value={filterDeliveryArea}
                onChange={(e) => { setFilterDeliveryArea(e.target.value); setCurrentPage(1); }}
                className="input-premium h-10 text-xs"
              />
            </div>
          </div>

          {/* HISTORY MODULE SUB-TABS IF IN HISTORY TAB */}
          {activeTab === 'history' && (
            <div className="flex bg-slate-100 p-1 rounded-xl w-fit border border-slate-200/40">
              <button
                onClick={() => { setHistoryTab('all'); setFilterStatus(''); }}
                className={`px-4 py-1.5 rounded-lg text-[10px] font-black tracking-wider transition-all uppercase ${
                  historyTab === 'all' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                All Orders
              </button>
              <button
                onClick={() => { setHistoryTab('supplied'); }}
                className={`px-4 py-1.5 rounded-lg text-[10px] font-black tracking-wider transition-all uppercase ${
                  historyTab === 'supplied' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Supplied Orders
              </button>
              <button
                onClick={() => { setHistoryTab('cancelled'); }}
                className={`px-4 py-1.5 rounded-lg text-[10px] font-black tracking-wider transition-all uppercase ${
                  historyTab === 'cancelled' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Cancelled Orders
              </button>
            </div>
          )}

          {/* TABLE LISTING */}
          <div className="border border-slate-200/60 bg-white rounded-2xl shadow-sm overflow-hidden animate-fade-in">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/75 border-b border-slate-200/80 text-[10px] font-black text-slate-450 uppercase tracking-wider">
                    <th className="py-4 px-5">Order No</th>
                    <th className="py-4 px-5">Customer details</th>
                    <th className="py-4 px-5">Supply Date & Time</th>
                    <th className="py-4 px-5">Delivery Area</th>
                    <th className="py-4 px-5 text-right">Order Amount</th>
                    <th className="py-4 px-5 text-center">Payment Status</th>
                    <th className="py-4 px-5 text-center">Order Status</th>
                    <th className="py-4 px-5 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700 text-xs font-semibold">
                  {loadingList ? (
                    <tr>
                      <td colSpan="8" className="py-24 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <span className="loading loading-spinner text-primary"></span>
                          <span className="text-slate-400 text-sm font-medium">Fetching orders list...</span>
                        </div>
                      </td>
                    </tr>
                  ) : orders.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="py-16 text-center text-slate-400 font-semibold text-xs bg-slate-50/20">
                        No customer orders scheduled or logged.
                      </td>
                    </tr>
                  ) : (
                    orders.map(order => {
                      const bal = parseFloat(order.pending_amount) || 0;
                      return (
                        <tr key={order.id} className="hover:bg-slate-50/30 transition-colors">
                          <td className="py-4 px-5 font-bold text-slate-600">{order.id}</td>
                          <td className="py-4 px-5">
                            <div className="font-extrabold text-slate-800">{order.customer_name}</div>
                            <div className="text-[10px] font-bold text-slate-400 mt-0.5">{order.customer_phone}</div>
                          </td>
                          <td className="py-4 px-5">
                            <div className="text-slate-850 font-bold">{formatDateDDMMYYYY(order.supply_date)}</div>
                            <div className="text-[10px] font-bold text-slate-450 mt-0.5">⏱ {order.supply_time}</div>
                          </td>
                          <td className="py-4 px-5 max-w-[150px] truncate" title={order.delivery_address}>
                            {order.delivery_address || '—'}
                          </td>
                          <td className="py-4 px-5 text-right font-black text-slate-800">
                            ₹{(parseFloat(order.grand_total) || 0).toFixed(2)}
                          </td>
                          <td className="py-4 px-5 text-center">
                            {bal === 0 ? (
                              <span className="px-2 py-0.5 rounded text-[9px] font-extrabold uppercase bg-emerald-50 border border-emerald-100 text-emerald-600">Cleared</span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[9px] font-extrabold uppercase bg-amber-50 border border-amber-100 text-amber-600" title={`Pending: ₹${bal.toFixed(2)}`}>Due: ₹{bal.toFixed(0)}</span>
                            )}
                          </td>
                          <td className="py-4 px-5 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${
                              order.status === 'PENDING' ? 'bg-amber-50 border-amber-100 text-amber-600' :
                              order.status === 'SUPPLIED' ? 'bg-emerald-50 border-emerald-100 text-emerald-600' :
                              'bg-rose-50 border-rose-100 text-rose-600'
                            }`}>
                              {order.status}
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

            {/* Pagination footer */}
            {!loadingList && totalCount > 0 && (
              <div className="flex items-center justify-between p-4 border-t border-slate-100 bg-white">
                <div className="text-xs font-bold text-slate-400 uppercase">
                  Page {currentPage} of {Math.ceil(totalCount / limit) || 1} ({totalCount} records)
                </div>
                <div className="flex gap-2">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-slate-650 bg-white hover:bg-slate-55 disabled:opacity-50 text-xs font-bold shadow-sm transition-all"
                  >
                    Previous
                  </button>
                  <button
                    disabled={currentPage === Math.ceil(totalCount / limit)}
                    onClick={() => setCurrentPage(prev => Math.min(Math.ceil(totalCount / limit), prev + 1))}
                    className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-slate-650 bg-white hover:bg-slate-55 disabled:opacity-50 text-xs font-bold shadow-sm transition-all"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ORDER DETAILS MODAL USING PORTAL */}
      {isDetailModalOpen && createPortal(
        <div className="modal modal-open animate-fade-in z-50">
          <div className="modal-box max-w-4xl bg-white border border-slate-200/80 rounded-3xl p-8 relative shadow-2xl z-10 max-h-[90vh] overflow-y-auto">
            <button 
              onClick={() => { setIsDetailModalOpen(false); setOrderDetail(null); }}
              className="absolute top-4 right-4 w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 text-slate-550 hover:bg-slate-100 hover:text-slate-850 flex items-center justify-center font-bold transition-all"
            >
              ✕
            </button>

            {loadingDetail ? (
              <div className="py-24 text-center">
                <span className="loading loading-spinner text-primary"></span>
                <p className="text-slate-400 mt-2 text-xs font-bold uppercase tracking-wider">Loading order details...</p>
              </div>
            ) : orderDetail ? (
              <div className="space-y-6">
                
                {/* Modal Header */}
                <div className="flex justify-between items-start border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Order Details: {orderDetail.order.id}</h3>
                    <p className="text-slate-500 text-xs font-bold mt-0.5">
                      Supply Schedule: <span className="font-extrabold text-slate-750">{formatDateDDMMYYYY(orderDetail.order.supply_date)}</span> at <span className="font-extrabold text-slate-750">{orderDetail.order.supply_time}</span>
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

                {/* Info grids: Customer details, delivery details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 border border-slate-150/60 p-5 rounded-2xl text-xs font-semibold text-slate-655">
                  <div className="space-y-1.5">
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider">👤 Customer details</div>
                    <div className="text-slate-800 font-black text-sm">{orderDetail.order.customer_name}</div>
                    <div>Phone: {orderDetail.order.customer_phone}</div>
                    {orderDetail.order.customer_type && <div>Type: {orderDetail.order.customer_type}</div>}
                    {orderDetail.order.customer_gstin && <div>GSTIN: {orderDetail.order.customer_gstin}</div>}
                    {orderDetail.order.customer_address && <div className="mt-1">Billing: {orderDetail.order.customer_address}</div>}
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-[10px] font-black text-slate-450 uppercase tracking-wider">🚚 Delivery Details</div>
                    <div className="mt-1"><span className="text-slate-400">Alternate Phone:</span> {orderDetail.order.alternate_phone || '—'}</div>
                    <div><span className="text-slate-400">Delivery Address:</span> <span className="text-slate-800 font-bold">{orderDetail.order.delivery_address || '—'}</span></div>
                    {orderDetail.order.delivery_instructions && <div className="mt-1 bg-white border border-slate-150 rounded p-2 text-[11px] italic text-slate-500">Instructions: {orderDetail.order.delivery_instructions}</div>}
                  </div>
                </div>

                {/* Items & Payment values */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                  {/* Products table */}
                  <div className="md:col-span-7 space-y-3">
                    <h4 className="text-xs font-black text-slate-450 uppercase tracking-widest border-b border-slate-100 pb-1.5">📦 Order Products List</h4>
                    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-100 border-b border-slate-200 text-[9px] font-black text-slate-500 uppercase tracking-wider">
                            <th className="py-2.5 px-3">Product</th>
                            <th className="py-2.5 px-3 text-center">Quantity</th>
                            <th className="py-2.5 px-3 text-right">Rate</th>
                            <th className="py-2.5 px-3 text-right">Total Amt</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-150 font-bold text-slate-700">
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
                    <h4 className="text-xs font-black text-slate-450 uppercase tracking-widest border-b border-slate-100 pb-1.5">💵 Pricing & Payment</h4>
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
                      <div className="border-t border-slate-200 pt-2 flex justify-between items-center">
                        <span className="font-bold">Pending Amount:</span>
                        <div className="flex flex-col items-end">
                          <span className="text-slate-800 font-black">₹{(parseFloat(orderDetail.order.pending_amount) || 0).toFixed(2)}</span>
                          {(parseFloat(orderDetail.order.pending_amount) || 0) === 0 ? (
                            <span className="bg-emerald-50 text-emerald-600 text-[8px] font-black uppercase px-1 py-0.5 rounded mt-0.5">Cleared</span>
                          ) : (
                            <span className="bg-amber-50 text-amber-600 text-[8px] font-black uppercase px-1 py-0.5 rounded mt-0.5">Due Balance</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Notes & Audit logs */}
                <div className="border-t border-slate-100 pt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-semibold text-slate-550">
                  {orderDetail.order.notes && (
                    <div className="bg-slate-50 border border-slate-200/50 p-3.5 rounded-xl">
                      <span className="font-black text-slate-400 block text-[9px] uppercase tracking-wide">Internal Notes</span>
                      <p className="mt-1 text-slate-700 italic break-words">{orderDetail.order.notes}</p>
                    </div>
                  )}
                  <div className="bg-slate-50 border border-slate-200/50 p-3.5 rounded-xl space-y-1">
                    <span className="font-black text-slate-450 block text-[9px] uppercase tracking-wide">📝 AUDIT LOGS</span>
                    <div>Created By: <span className="text-slate-800 font-bold">{orderDetail.order.created_by}</span> at {new Date(orderDetail.order.created_at).toLocaleString()}</div>
                    {orderDetail.order.edited_by && (
                      <div>Edited By: <span className="text-slate-800 font-bold">{orderDetail.order.edited_by}</span> at {new Date(orderDetail.order.edited_at).toLocaleString()}</div>
                    )}
                    {orderDetail.order.status === 'SUPPLIED' && (
                      <div>Supplied By: <span className="text-emerald-600 font-bold">{orderDetail.order.supplied_by}</span> at {new Date(orderDetail.order.supplied_at).toLocaleString()}</div>
                    )}
                    {orderDetail.order.status === 'CANCELLED' && (
                      <div className="text-rose-600">
                        <div>Cancelled By: <span className="font-bold">{orderDetail.order.cancelled_by}</span> at {new Date(orderDetail.order.cancelled_at).toLocaleString()}</div>
                        <div className="italic mt-0.5">Reason: "{orderDetail.order.cancellation_reason}"</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer buttons / actions */}
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
                        className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs rounded-xl shadow transition-all duration-200"
                      >
                        ✅ Mark as Supplied
                      </button>
                      <button 
                        onClick={handleGenerateBill}
                        className="px-4 py-2 bg-primary hover:bg-blue-600 text-white font-bold text-xs rounded-xl shadow-sm transition-all"
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

      {/* CANCELLATION DIALOG REASON */}
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
            <p className="text-slate-500 text-xs font-semibold mb-4">Please specify why this order is being cancelled:</p>

            <form onSubmit={handleCancelSubmit} className="space-y-4">
              <textarea 
                placeholder="Enter cancellation reason..."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full p-3 rounded-xl border border-slate-200 bg-white text-slate-750 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-xs font-medium h-24 resize-none"
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
                  {isSavingCancel ? 'Saving...' : 'Confirm Cancellation'}
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

export default Orders;
