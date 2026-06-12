import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../api/axios';

const BillingForm = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const editBillId = location.state?.editBillId || null;
  const preloadLoading = location.state?.preloadLoading || null;
  const preloadOrder = location.state?.preloadOrder || null;
  const preloadCanSupply = location.state?.preloadCanSupply || null;

  // Static options
  const TAX_OPTIONS = [0, 5, 12, 18, 28];
  const PAYMENT_MODES = ['Cash', 'Credit', 'UPI(KI)', 'UPI(KP)', 'BANK (KI)', 'BANK (KP)'];

  // Master lists
  const [finishedProducts, setFinishedProducts] = useState([]);
  const [customers, setCustomers] = useState([]); // In-memory list for name autocomplete

  // Form states
  const [billingInfo, setBillingInfo] = useState({
    billingDate: '',
    company: 'Kempannavar Industries',
    customerType: 'General Customer',
    customerId: '',
    customerName: '',
    customerPhone: '',
    customerGstin: '',
    customerAddress: '',
    paymentMode: 'Cash',
    amountPaid: '0',
    dueAmount: 0,
    grandTotal: 0,
    cashPaid: '0',
    upiPaid: '0',
    bankPaid: '0'
  });

  const [items, setItems] = useState([]); // Array of { id, finishedProductId, quantity, rateWithTax, taxPercent, basicRate, totalAmount }

  // Customer search helpers
  const [phoneSearchText, setPhoneSearchText] = useState('');
  const [nameSearchText, setNameSearchText] = useState('');
  const [filteredNameCustomers, setFilteredNameCustomers] = useState([]);
  const [showNameSuggestions, setShowNameSuggestions] = useState(false);

  // Status/saving states
  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  // Initial fetch for finished products and customers list
  useEffect(() => {
    fetchDropdownMasters();
    if (editBillId) {
      loadBillForEdit();
    } else if (preloadLoading) {
      loadBillFromLoadingSession();
    } else if (preloadOrder) {
      loadBillFromOrder(preloadOrder);
    } else if (preloadCanSupply) {
      loadBillFromCanSupply(preloadCanSupply);
    } else {
      initializeNewForm();
    }
  }, [editBillId, preloadLoading, preloadOrder, preloadCanSupply]);

  // Hook to handle dynamic mapping once finishedProducts are loaded
  useEffect(() => {
    if (preloadCanSupply && finishedProducts.length > 0 && items.length === 0) {
      const loadedItems = preloadCanSupply.items.map(i => {
        let matchedId = '';
        const lowerProd = String(i.product).toLowerCase();
        if (lowerProd.includes('20') && lowerProd.includes('can')) {
          const match = finishedProducts.find(fp => {
            const name = fp.name.toLowerCase();
            return name.includes('20') && name.includes('can');
          });
          if (match) matchedId = String(match.id);
        } else if (lowerProd.includes('dispenser')) {
          const match = finishedProducts.find(fp => {
            const name = fp.name.toLowerCase();
            return name.includes('dispenser');
          });
          if (match) matchedId = String(match.id);
        }

        return {
          id: Math.random().toString(36).substring(2, 9),
          finishedProductId: matchedId,
          quantity: String(i.quantity),
          rateWithTax: '',
          taxPercent: 18,
          basicRate: 0,
          totalAmount: 0
        };
      });
      setItems(loadedItems);
    }
  }, [finishedProducts, preloadCanSupply]);

  const loadBillFromOrder = (preload) => {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const istDate = new Date(now.getTime() + (330 + offset) * 60000);
    const yyyy = istDate.getFullYear();
    const mm = String(istDate.getMonth() + 1).padStart(2, '0');
    const dd = String(istDate.getDate()).padStart(2, '0');
    const todayFormatted = `${yyyy}-${mm}-${dd}`;

    const o = preload.order;
    const orderItems = preload.items;

    let cashPaid = '0';
    let upiPaid = '0';
    let bankPaid = '0';
    const advance = parseFloat(o.advance_amount) || 0;
    const mode = String(o.payment_mode || '').toLowerCase();
    if (mode.includes('cash')) {
      cashPaid = String(advance);
    } else if (mode.includes('upi')) {
      upiPaid = String(advance);
    } else if (mode.includes('bank')) {
      bankPaid = String(advance);
    } else {
      cashPaid = String(advance);
    }

    setBillingInfo({
      billingDate: todayFormatted,
      company: 'Kempannavar Industries',
      customerType: o.customer_type === 'Distributor' ? 'Distributor' : 'Function Order',
      customerId: o.customer_id || '',
      customerName: o.customer_name,
      customerPhone: o.customer_phone,
      customerGstin: o.customer_gstin || '',
      customerAddress: o.customer_address || '',
      paymentMode: o.payment_mode || 'Cash',
      amountPaid: String(advance),
      dueAmount: 0,
      grandTotal: 0,
      cashPaid,
      upiPaid,
      bankPaid,
      orderId: o.id
    });

    const taxPercent = parseFloat(o.tax) || 18;

    const loadedItems = orderItems.map(i => {
      const rateWithTax = parseFloat(i.rate) || 0;
      const qty = parseInt(i.quantity, 10) || 0;
      const basicRate = rateWithTax / (1 + taxPercent / 100);
      const totalAmount = qty * rateWithTax;

      return {
        id: Math.random().toString(36).substring(2, 9),
        finishedProductId: String(i.finishedProductId),
        quantity: String(qty),
        rateWithTax: String(rateWithTax),
        taxPercent: taxPercent,
        basicRate: basicRate,
        totalAmount: totalAmount
      };
    });

    setItems(loadedItems);
    setNameSearchText(o.customer_name);
    setPhoneSearchText(o.customer_phone);
  };

  const loadBillFromLoadingSession = () => {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const istDate = new Date(now.getTime() + (330 + offset) * 60000);
    const yyyy = istDate.getFullYear();
    const mm = String(istDate.getMonth() + 1).padStart(2, '0');
    const dd = String(istDate.getDate()).padStart(2, '0');
    const todayFormatted = `${yyyy}-${mm}-${dd}`;

    const cust = preloadLoading.customer;
    setBillingInfo({
      billingDate: todayFormatted,
      company: 'Kempannavar Industries',
      customerType: 'General Customer',
      customerId: cust.id || '',
      customerName: cust.name,
      customerPhone: cust.phone,
      customerGstin: cust.gstin || '',
      customerAddress: cust.address || '',
      paymentMode: 'Cash',
      amountPaid: '0',
      dueAmount: 0,
      grandTotal: 0,
      cashPaid: '0',
      upiPaid: '0',
      bankPaid: '0',
      loadingSessionId: preloadLoading.loadingSessionId
    });

    const loadedItems = preloadLoading.items.map(i => ({
      id: Math.random().toString(36).substring(2, 9),
      finishedProductId: String(i.finishedProductId),
      quantity: String(i.quantity),
      rateWithTax: '',
      taxPercent: 18,
      basicRate: 0,
      totalAmount: 0
    }));

    setItems(loadedItems);
    setNameSearchText(cust.name);
    setPhoneSearchText(cust.phone);
  };

  const loadBillFromCanSupply = (preload) => {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const istDate = new Date(now.getTime() + (330 + offset) * 60000);
    const yyyy = istDate.getFullYear();
    const mm = String(istDate.getMonth() + 1).padStart(2, '0');
    const dd = String(istDate.getDate()).padStart(2, '0');
    const todayFormatted = `${yyyy}-${mm}-${dd}`;

    const cust = preload.customer;
    setBillingInfo({
      billingDate: todayFormatted,
      company: 'Kempannavar Industries',
      customerType: cust.customerType || 'General Customer',
      customerId: cust.id || '',
      customerName: cust.name,
      customerPhone: cust.phone,
      customerGstin: cust.gst || '',
      customerAddress: cust.address || '',
      paymentMode: 'Cash',
      amountPaid: '0',
      dueAmount: 0,
      grandTotal: 0,
      cashPaid: '0',
      upiPaid: '0',
      bankPaid: '0'
    });

    setNameSearchText(cust.name);
    setPhoneSearchText(cust.phone);
  };

  const fetchDropdownMasters = async () => {
    try {
      const [fpRes, custRes] = await Promise.all([
        api.get('/finished-products', { params: { limit: 200, activeOnly: true } }),
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

  const initializeNewForm = () => {
    // Set default billing date to today in IST
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const istDate = new Date(now.getTime() + (330 + offset) * 60000);
    const yyyy = istDate.getFullYear();
    const mm = String(istDate.getMonth() + 1).padStart(2, '0');
    const dd = String(istDate.getDate()).padStart(2, '0');
    const todayFormatted = `${yyyy}-${mm}-${dd}`;

    setBillingInfo({
      billingDate: todayFormatted,
      company: 'Kempannavar Industries',
      customerType: 'General Customer',
      customerId: '',
      customerName: '',
      customerPhone: '',
      customerGstin: '',
      customerAddress: '',
      paymentMode: 'Cash',
      amountPaid: '0',
      dueAmount: 0,
      grandTotal: 0,
      cashPaid: '0',
      upiPaid: '0',
      bankPaid: '0'
    });
    setItems([]);
    setPhoneSearchText('');
    setNameSearchText('');
  };

  const loadBillForEdit = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/billing/${editBillId}`);
      if (res.data.ok) {
        const b = res.data.bill;
        setBillingInfo({
          billingDate: b.billing_date,
          company: b.company,
          customerType: b.customer_type,
          customerId: b.customer_id || '',
          customerName: b.customer_name,
          customerPhone: b.customer_phone,
          customerGstin: b.customer_gstin || '',
          customerAddress: b.customer_address || '',
          paymentMode: b.payment_mode,
          amountPaid: String(b.amount_paid),
          dueAmount: parseFloat(b.due_amount),
          grandTotal: parseFloat(b.grand_total),
          cashPaid: String(b.cash_paid || 0),
          upiPaid: String(b.upi_paid || 0),
          bankPaid: String(b.bank_paid || 0)
        });

        const loadedItems = res.data.items.map(i => ({
          id: Math.random().toString(36).substring(2, 9),
          finishedProductId: i.finished_product_id,
          quantity: String(i.quantity),
          rateWithTax: String(i.rate_with_tax),
          taxPercent: i.tax_percent,
          basicRate: parseFloat(i.basic_rate),
          totalAmount: parseFloat(i.total_amount)
        }));
        setItems(loadedItems);
        setNameSearchText(b.customer_name);
        setPhoneSearchText(b.customer_phone);
      } else {
        alert(res.data.error || 'Failed to load invoice.');
        navigate('/billing');
      }
    } catch (err) {
      console.error(err);
      alert('Error fetching invoice particulars.');
      navigate('/billing');
    } finally {
      setLoading(false);
    }
  };

  // Autocomplete search by Customer Name
  const handleNameSearchChange = (e) => {
    const txt = e.target.value;
    setNameSearchText(txt);
    
    // Also update field directly
    setBillingInfo(prev => ({ ...prev, customerName: txt }));

    if (txt.trim().length > 0) {
      const filtered = customers.filter(c => 
        c.name.toLowerCase().includes(txt.toLowerCase()) || 
        c.phone.includes(txt)
      );
      setFilteredNameCustomers(filtered);
      setShowNameSuggestions(true);
    } else {
      setFilteredNameCustomers([]);
      setShowNameSuggestions(false);
    }
  };

  const handleSelectNameSuggestion = (cust) => {
    setBillingInfo(prev => ({
      ...prev,
      customerId: cust.id,
      customerName: cust.name,
      customerPhone: cust.phone,
      customerGstin: cust.gst || '',
      customerAddress: cust.address || ''
    }));
    setNameSearchText(cust.name);
    setPhoneSearchText(cust.phone);
    setShowNameSuggestions(false);
  };

  // Search by Phone
  const handlePhoneSearchSubmit = async () => {
    if (!phoneSearchText.trim()) return;
    try {
      const res = await api.get('/customers', { params: { phone: phoneSearchText } });
      if (res.data.exists) {
        const c = res.data.customer;
        setBillingInfo(prev => ({
          ...prev,
          customerId: c.id,
          customerName: c.name,
          customerPhone: c.phone,
          customerGstin: c.gst || '',
          customerAddress: c.address || ''
        }));
        setNameSearchText(c.name);
        setPhoneSearchText(c.phone);
        setFormError('');
      } else {
        setFormError('Customer not found with this phone number. You can fill out the details manually below to create a new customer record.');
      }
    } catch (err) {
      setFormError(err.response?.data?.error || err.message);
    }
  };

  const handleClearCustomerSearch = () => {
    setBillingInfo(prev => ({
      ...prev,
      customerId: '',
      customerName: '',
      customerPhone: '',
      customerGstin: '',
      customerAddress: ''
    }));
    setNameSearchText('');
    setPhoneSearchText('');
    setShowNameSuggestions(false);
    setFormError('');
  };

  // Line item modifiers
  const handleAddProductRow = () => {
    const newRow = {
      id: Math.random().toString(36).substring(2, 9),
      finishedProductId: '',
      quantity: '',
      rateWithTax: '',
      taxPercent: 18,
      basicRate: 0,
      totalAmount: 0
    };
    setItems(prev => [...prev, newRow]);
  };

  const handleRemoveProductRow = (rowId) => {
    setItems(prev => prev.filter(item => item.id !== rowId));
  };

  const handleItemRowChange = (rowId, fieldName, val) => {
    setItems(prev =>
      prev.map(item => {
        if (item.id === rowId) {
          const updated = { ...item, [fieldName]: val };

          // Recalculate line totals
          const qty = parseInt(updated.quantity, 10) || 0;
          const rTax = parseFloat(updated.rateWithTax) || 0.00;
          const taxPct = parseFloat(updated.taxPercent) || 0.00;

          updated.basicRate = rTax / (1 + taxPct / 100);
          updated.totalAmount = qty * rTax;

          return updated;
        }
        return item;
      })
    );
  };

  // Computations
  const computedGrandTotal = items.reduce((acc, item) => acc + item.totalAmount, 0);

  // Sync payments calculations
  useEffect(() => {
    setBillingInfo(prev => {
      const gTotal = computedGrandTotal;
      const cash = parseFloat(prev.cashPaid) || 0.00;
      const upi = parseFloat(prev.upiPaid) || 0.00;
      const bank = parseFloat(prev.bankPaid) || 0.00;
      const amtPaid = cash + upi + bank;
      const due = gTotal - amtPaid;
      return {
        ...prev,
        grandTotal: gTotal,
        amountPaid: String(amtPaid),
        dueAmount: due < 0 ? 0 : due
      };
    });
  }, [items, billingInfo.cashPaid, billingInfo.upiPaid, billingInfo.bankPaid]);

  const handleSave = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    const {
      billingDate,
      company,
      customerType,
      customerName,
      customerPhone,
      customerGstin,
      customerAddress,
      paymentMode,
      amountPaid,
      dueAmount,
      loadingSessionId,
      orderId,
      cashPaid,
      upiPaid,
      bankPaid
    } = billingInfo;

    // Frontend validations
    if (!billingDate) return setFormError('Billing Date is required.');
    if (!company) return setFormError('Company is required.');
    if (!customerType) return setFormError('Customer Type is required.');
    if (!customerName || !customerName.trim()) return setFormError('Customer Name is required.');
    if (!customerPhone || customerPhone.length < 10) return setFormError('Customer Phone is required (10 digits).');
    if (items.length === 0) return setFormError('At least one product line is required.');

    const itemsPayload = [];
    for (const item of items) {
      if (!item.finishedProductId) {
        return setFormError('Please select a finished product for all rows.');
      }
      const qty = parseInt(item.quantity, 10);
      const rate = parseFloat(item.rateWithTax);
      if (isNaN(qty) || qty <= 0) {
        return setFormError('Quantity must be greater than 0 for all rows.');
      }
      if (isNaN(rate) || rate < 0) {
        return setFormError('Rate with Tax cannot be negative.');
      }

      itemsPayload.push({
        finishedProductId: parseInt(item.finishedProductId, 10),
        quantity: qty,
        rateWithTax: rate,
        taxPercent: parseFloat(item.taxPercent) || 0
      });
    }

    setIsSaving(true);
    try {
      const payload = {
        billingDate,
        company,
        customerType,
        customerName,
        customerPhone,
        customerGstin,
        customerAddress,
        grandTotal: computedGrandTotal,
        paymentMode,
        amountPaid: parseFloat(amountPaid) || 0,
        dueAmount: dueAmount,
        items: itemsPayload,
        loadingSessionId: loadingSessionId || null,
        orderId: orderId || null,
        cashPaid: parseFloat(cashPaid) || 0,
        upiPaid: parseFloat(upiPaid) || 0,
        bankPaid: parseFloat(bankPaid) || 0
      };

      let res;
      if (editBillId) {
        res = await api.put(`/billing/${editBillId}`, payload);
      } else {
        res = await api.post('/billing', payload);
      }

      if (res.data.ok) {
        setFormSuccess(editBillId ? 'Invoice updated successfully!' : 'Invoice saved successfully!');
        setTimeout(() => {
          navigate('/billing');
        }, 1000);
      } else {
        setFormError(res.data.error || 'Failed to save invoice.');
      }
    } catch (err) {
      setFormError(err.response?.data?.error || err.message || 'An error occurred.');
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="loading loading-spinner text-primary"></span>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto pb-12">
      {/* Back button */}
      <div className="flex justify-start">
        <button 
          type="button"
          onClick={() => navigate('/billing')}
          className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
        >
          <span>←</span> Back
        </button>
      </div>

      {/* Heading */}
      <div>
        <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase">
          {editBillId ? 'EDIT INVOICE' : 'BILLING WORKSPACE'}
        </h1>
        <p className="text-slate-500 text-xs font-semibold mt-1">
          Create customer receipts and adjust finished product inventory
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">

        {/* 1. CHOOSE COMPANY */}
        <div className="border border-slate-200/80 rounded-2xl bg-white p-5 space-y-3.5 shadow-sm">
          <div className="text-[11px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2.5">
            🏢 CHOOSE COMPANY
          </div>
          <div className="flex gap-4">
            {['Kempannavar Industries', 'Kemps Pet Industries'].map(comp => (
              <button
                key={comp}
                type="button"
                onClick={() => setBillingInfo(prev => ({ ...prev, company: comp }))}
                className={`flex-1 h-12 rounded-xl text-xs font-extrabold transition-all border ${
                  billingInfo.company === comp
                    ? 'bg-primary border-primary text-white shadow-md shadow-primary/20'
                    : 'bg-white border-slate-200 text-slate-650 hover:bg-slate-50'
                }`}
              >
                {comp.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* 2. CHOOSE CUSTOMER CONTEXT TYPE */}
        <div className="border border-slate-200/80 rounded-2xl bg-white p-5 space-y-3.5 shadow-sm">
          <div className="text-[11px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2.5">
            🎯 CUSTOMER TYPE
          </div>
          <div className="flex gap-3">
            {['General Customer', 'Distributor', 'Function Order'].map(type => (
              <button
                key={type}
                type="button"
                onClick={() => setBillingInfo(prev => ({ ...prev, customerType: type }))}
                className={`flex-1 h-12 rounded-xl text-xs font-extrabold transition-all border ${
                  billingInfo.customerType === type
                    ? 'bg-slate-900 border-slate-900 text-white shadow-sm'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50/80'
                }`}
              >
                {type.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* 3. CUSTOMER DETAILS SEARCH & INPUT */}
        <div className="border border-slate-200/80 rounded-2xl bg-white p-5 space-y-4 shadow-sm">
          <div className="text-[11px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2.5">
            👤 CUSTOMER DATA
          </div>

          {/* Search Inputs Row */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end bg-slate-50/50 p-4 rounded-xl border border-slate-100 relative">
            
            {/* Search by Name */}
            <div className="md:col-span-5 space-y-1.5 relative">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">
                Search by Name
              </label>
              <input 
                type="text"
                placeholder="Type customer name..."
                value={nameSearchText}
                onChange={handleNameSearchChange}
                onFocus={() => { if (nameSearchText.trim()) setShowNameSuggestions(true); }}
                className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
              />
              
              {/* Autocomplete Dropdown list */}
              {showNameSuggestions && filteredNameCustomers.length > 0 && (
                <ul className="absolute z-20 w-full left-0 mt-1.5 bg-white border border-slate-200 rounded-xl max-h-48 overflow-y-auto shadow-lg divide-y divide-slate-100">
                  {filteredNameCustomers.map(c => (
                    <li 
                      key={c.id}
                      onClick={() => handleSelectNameSuggestion(c)}
                      className="px-4 py-2.5 text-xs text-slate-750 hover:bg-slate-50 cursor-pointer flex justify-between font-bold"
                    >
                      <span>{c.name}</span>
                      <span className="text-[10px] text-slate-400 font-bold">{c.phone}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* OR separator */}
            <div className="md:col-span-1 text-center text-[10px] font-black text-slate-400 uppercase py-2">
              OR
            </div>

            {/* Search by Phone */}
            <div className="md:col-span-6 flex gap-2 items-end">
              <div className="space-y-1.5 flex-1">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">
                  Search by Phone
                </label>
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
                className="px-4 h-11 bg-primary text-white hover:bg-primary-hover font-bold text-xs rounded-xl shadow-md shadow-primary/10 flex items-center gap-1"
              >
                🔎 Search
              </button>
              <button
                type="button"
                onClick={handleClearCustomerSearch}
                className="px-3 h-11 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold text-xs rounded-xl"
              >
                Clear
              </button>
            </div>

            {/* New customer action banner */}
            <div className="md:col-span-12">
              <button
                type="button"
                onClick={handleClearCustomerSearch}
                className="w-full py-2.5 border border-dashed border-primary/30 text-primary bg-primary/5 hover:bg-primary/10 transition-all text-xs font-bold rounded-xl block text-center"
              >
                + New Customer (fill details below)
              </button>
            </div>

          </div>

          {/* Details Input Form */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-slate-100 pt-4">
            
            {/* Customer ID (Readonly) */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider block">
                Customer ID
              </label>
              <input 
                type="text"
                value={billingInfo.customerId || 'Auto generated/resolving'}
                readOnly
                className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-slate-50 text-slate-500 font-bold outline-none text-sm cursor-not-allowed"
              />
            </div>

            {/* Customer Name */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider block">
                Customer Name *
              </label>
              <input 
                type="text"
                value={billingInfo.customerName}
                onChange={(e) => setBillingInfo(prev => ({ ...prev, customerName: e.target.value }))}
                placeholder="Enter customer name"
                className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                required
              />
            </div>

            {/* Phone Number */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider block">
                Phone Number *
              </label>
              <input 
                type="text"
                value={billingInfo.customerPhone}
                onChange={(e) => setBillingInfo(prev => ({ ...prev, customerPhone: e.target.value }))}
                placeholder="10-digit phone number"
                className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                required
              />
            </div>

            {/* GSTIN (Optional) */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider block">
                GSTIN (Optional)
              </label>
              <input 
                type="text"
                value={billingInfo.customerGstin}
                onChange={(e) => setBillingInfo(prev => ({ ...prev, customerGstin: e.target.value }))}
                placeholder="GST number"
                className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
              />
            </div>

            {/* Address */}
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider block">
                Address
              </label>
              <textarea 
                value={billingInfo.customerAddress}
                onChange={(e) => setBillingInfo(prev => ({ ...prev, customerAddress: e.target.value }))}
                placeholder="Customer address details..."
                className="w-full p-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium h-20 resize-none"
              />
            </div>

            {/* Billing Date */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider block">
                Billing Date *
              </label>
              <input 
                type="date"
                value={billingInfo.billingDate}
                onChange={(e) => setBillingInfo(prev => ({ ...prev, billingDate: e.target.value }))}
                className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                required
              />
            </div>

          </div>
        </div>

        {/* 4. BILL LINE ITEMS (ADD PRODUCTS) */}
        <div className="border border-slate-200/80 rounded-2xl bg-white p-5 space-y-4 shadow-sm">
          <div className="flex justify-between items-center border-b border-slate-100 pb-2.5">
            <div className="text-[11px] font-black text-slate-450 uppercase tracking-widest flex items-center gap-1.5">
              <span>🛒</span> PRODUCTS BILLING LIST
            </div>
            <button
              type="button"
              onClick={handleAddProductRow}
              className="px-3.5 py-1.5 rounded-lg border border-primary/20 text-primary bg-primary/5 hover:bg-primary hover:text-white transition-all text-xs font-bold"
            >
              + Add Product
            </button>
          </div>

          {/* Lines Table */}
          <div className="space-y-3">
            {items.map((row, index) => (
              <div 
                key={row.id} 
                className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end bg-slate-50/40 border border-slate-100 p-4 rounded-2xl relative group"
              >
                
                {/* Finished Product Selector */}
                <div className="md:col-span-4 space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
                    Product #{index + 1}
                  </label>
                  <select
                    value={row.finishedProductId}
                    onChange={(e) => handleItemRowChange(row.id, 'finishedProductId', e.target.value)}
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                    required
                  >
                    <option value="">Select Finished Product</option>
                    {finishedProducts.map(fp => (
                      <option key={fp.id} value={fp.id}>{fp.name}</option>
                    ))}
                  </select>
                </div>

                {/* Qty */}
                <div className="md:col-span-2 space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
                    Qty (Pcs)
                  </label>
                  <input 
                    type="number"
                    value={row.quantity}
                    onChange={(e) => handleItemRowChange(row.id, 'quantity', e.target.value)}
                    placeholder="0"
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                    required
                  />
                </div>

                {/* Rate with Tax */}
                <div className="md:col-span-2 space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
                    Rate with Tax (₹)
                  </label>
                  <input 
                    type="number"
                    step="0.01"
                    value={row.rateWithTax}
                    onChange={(e) => handleItemRowChange(row.id, 'rateWithTax', e.target.value)}
                    placeholder="0.00"
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                    required
                  />
                </div>

                {/* Tax Percent */}
                <div className="md:col-span-1.5 space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
                    Tax (%)
                  </label>
                  <select
                    value={row.taxPercent}
                    onChange={(e) => handleItemRowChange(row.id, 'taxPercent', e.target.value)}
                    className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                  >
                    {TAX_OPTIONS.map(tax => (
                      <option key={tax} value={tax}>{tax}%</option>
                    ))}
                  </select>
                </div>

                {/* Basic Rate (Readonly) */}
                <div className="md:col-span-2 space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
                    Basic Rate (No Tax)
                  </label>
                  <input 
                    type="text"
                    value={`₹ ${row.basicRate.toFixed(2)}`}
                    readOnly
                    className="w-full h-11 px-3 bg-slate-50 text-slate-450 border border-slate-200 rounded-xl font-bold text-xs outline-none cursor-not-allowed"
                  />
                </div>

                {/* Row Total Amount (Readonly) */}
                <div className="md:col-span-2.5 space-y-1.5 flex gap-2 items-end">
                  <div className="flex-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
                      Total
                    </label>
                    <input 
                      type="text"
                      value={`₹ ${row.totalAmount.toFixed(2)}`}
                      readOnly
                      className="w-full h-11 px-3.5 bg-slate-50 text-slate-700 border border-slate-200 rounded-xl font-black text-sm outline-none cursor-not-allowed"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveProductRow(row.id)}
                    className="w-11 h-11 rounded-xl bg-white border border-slate-200 hover:border-red-200 hover:bg-red-50 hover:text-red-500 text-slate-450 transition-all flex items-center justify-center font-bold text-xs shrink-0"
                    title="Remove Item"
                  >
                    ✕
                  </button>
                </div>

              </div>
            ))}

            {items.length === 0 && (
              <div className="py-12 border border-dashed border-slate-250 rounded-2xl bg-slate-50/20 text-center text-slate-400 font-bold text-xs">
                No items added. Click "+ Add Product" to log item billing lines.
              </div>
            )}
          </div>
        </div>

        {/* 5. GRAND TOTALS AND PAYMENT CONTEXT */}
        <div className="border border-slate-200/80 rounded-2xl bg-white p-5 space-y-4 shadow-sm">
          <div className="text-[11px] font-black text-slate-450 uppercase tracking-widest border-b border-slate-100 pb-2.5">
            💳 COLLECTION & SETTLEMENTS
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            
            {/* Grand Total (computed) */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-black text-slate-550 uppercase tracking-wider block">
                Grand Total (Auto)
              </label>
              <input 
                type="text"
                value={`₹ ${computedGrandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                readOnly
                className="w-full h-12 px-4 rounded-xl border border-slate-250 bg-slate-100 text-slate-800 font-black text-lg outline-none cursor-not-allowed"
              />
            </div>

            {/* Total Paid (computed) */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider block">
                Total Paid (Auto)
              </label>
              <input 
                type="text"
                value={`₹ ${(parseFloat(billingInfo.amountPaid) || 0.00).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                readOnly
                className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 font-black text-lg outline-none cursor-not-allowed"
              />
            </div>

            {/* Due Amount (computed) */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-black text-slate-550 uppercase tracking-wider block">
                Due Balance (Auto)
              </label>
              <input 
                type="text"
                value={`₹ ${billingInfo.dueAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                readOnly
                className={`w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 font-black text-lg outline-none cursor-not-allowed ${
                  billingInfo.dueAmount > 0 ? 'text-rose-500' : 'text-slate-450'
                }`}
              />
            </div>

          </div>

          {/* PAYMENT METHOD DETAILED CARDS */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-slate-100">
            {/* CASH */}
            <div className="border border-slate-200/80 rounded-2xl p-5 bg-slate-50/50 space-y-2.5 shadow-sm hover:shadow-md transition-shadow">
              <span className="text-[11px] font-black text-slate-600 uppercase tracking-widest block flex items-center gap-1.5">
                💵 CASH RECEIVED
              </span>
              <input 
                type="number"
                step="0.01"
                min="0"
                value={billingInfo.cashPaid}
                onChange={(e) => setBillingInfo(prev => ({ ...prev, cashPaid: e.target.value }))}
                placeholder="0.00"
                className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-white text-slate-800 font-black text-lg focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none transition-all"
              />
            </div>

            {/* UPI */}
            <div className="border border-slate-200/80 rounded-2xl p-5 bg-slate-50/50 space-y-2.5 shadow-sm hover:shadow-md transition-shadow">
              <span className="text-[11px] font-black text-slate-600 uppercase tracking-widest block flex items-center gap-1.5">
                📱 UPI RECEIVED
              </span>
              <input 
                type="number"
                step="0.01"
                min="0"
                value={billingInfo.upiPaid}
                onChange={(e) => setBillingInfo(prev => ({ ...prev, upiPaid: e.target.value }))}
                placeholder="0.00"
                className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-white text-slate-800 font-black text-lg focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none transition-all"
              />
            </div>

            {/* BANK */}
            <div className="border border-slate-200/80 rounded-2xl p-5 bg-slate-50/50 space-y-2.5 shadow-sm hover:shadow-md transition-shadow">
              <span className="text-[11px] font-black text-slate-600 uppercase tracking-widest block flex items-center gap-1.5">
                🏦 BANK RECEIVED
              </span>
              <input 
                type="number"
                step="0.01"
                min="0"
                value={billingInfo.bankPaid}
                onChange={(e) => setBillingInfo(prev => ({ ...prev, bankPaid: e.target.value }))}
                placeholder="0.00"
                className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-white text-slate-800 font-black text-lg focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none transition-all"
              />
            </div>
          </div>
        </div>

        {/* FEEDBACK NOTIFICATION */}
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

        {/* SUBMIT ACTIONS */}
        <div className="flex gap-4 pt-4">
          <button
            type="submit"
            disabled={isSaving}
            className="btn-premium btn-primary-premium flex-[2] h-14 text-sm font-bold uppercase tracking-wider"
          >
            {isSaving ? <span className="loading loading-spinner"></span> : (editBillId ? 'Update Invoice' : 'Save Invoice')}
          </button>
          <button
            type="button"
            onClick={() => navigate('/billing')}
            className="btn-premium bg-white text-slate-500 hover:bg-slate-50 border border-slate-200 flex-1 h-14 text-sm font-bold uppercase tracking-wider"
          >
            Cancel
          </button>
        </div>

      </form>
    </div>
  );
};

export default BillingForm;
