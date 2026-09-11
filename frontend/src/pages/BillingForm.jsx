import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../api/axios';
import SearchableSelect from '../components/SearchableSelect';


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
    company: '',
    customerType: '',
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
    bankPaid: '0',
    remarks: ''
  });

  const [items, setItems] = useState([]); // Array of { id, finishedProductId, quantity, rateWithTax, taxPercent, basicRate, totalAmount }

  // Customer search helpers
  const [phoneSearchText, setPhoneSearchText] = useState('');
  const [nameSearchText, setNameSearchText] = useState('');
  const [filteredNameCustomers, setFilteredNameCustomers] = useState([]);
  const [showNameSuggestions, setShowNameSuggestions] = useState(false);

  // Status/saving states
  const [availableCredit, setAvailableCredit] = useState(0);
  const [applyCredit, setApplyCredit] = useState(false);
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

  const fetchCustomerCreditBalance = async (phone, custId) => {
    try {
      if (phone) {
        const res = await api.get('/customers', { params: { phone } });
        if (res.data.exists && res.data.customer) {
          setAvailableCredit(parseFloat(res.data.customer.creditBalance) || 0);
          return;
        }
      }
      if (custId) {
        const res = await api.get(`/customers/${custId}`);
        if (res.data.ok && res.data.customer) {
          setAvailableCredit(parseFloat(res.data.customer.credit_balance || res.data.customer.creditBalance) || 0);
          return;
        }
      }
    } catch (err) {
      console.error('Failed to load customer credit balance:', err);
    }
  };

  useEffect(() => {
    if (billingInfo.customerPhone || billingInfo.customerId) {
      fetchCustomerCreditBalance(billingInfo.customerPhone, billingInfo.customerId);
    }
  }, [billingInfo.customerPhone, billingInfo.customerId]);

  const loadBillFromOrder = (preload) => {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const istDate = new Date(now.getTime() + (330 + offset) * 60000);
    const yyyy = istDate.getFullYear();
    const mm = String(istDate.getMonth() + 1).padStart(2, '0');
    const dd = String(istDate.getDate()).padStart(2, '0');
    const todayFormatted = `${yyyy}-${mm}-${dd}`;

    const o = preload.order;
    const orderItems = preload.items || [];
    const advance = parseFloat(o.advance_amount) || 0;

    // Advance received for this order is already recorded in Accounts Ledger as customer advance / credit.
    // In Billing, we apply this advance as Credit Balance rather than collecting cash at billing.
    if (advance > 0) {
      setApplyCredit(true);
      setAvailableCredit(prev => Math.max(prev, advance));
    } else {
      setApplyCredit(false);
    }

    setBillingInfo({
      billingDate: todayFormatted,
      company: 'Kempannavar Industries',
      customerType: o.customer_type === 'Distributor' ? 'Distributor' : (o.customer_type || 'General Customer'),
      customerId: o.customer_id || '',
      customerName: o.customer_name,
      customerPhone: o.customer_phone,
      customerGstin: o.customer_gstin || '',
      customerAddress: o.customer_address || '',
      paymentMode: advance > 0 ? 'Credit Balance' : (o.payment_mode || 'Cash'),
      amountPaid: '0',
      dueAmount: 0,
      grandTotal: 0,
      cashPaid: '0',
      upiPaid: '0',
      bankPaid: '0',
      remarks: o.notes ? `Order #${o.id} - ${o.notes}` : `Order #${o.id}`,
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
      remarks: '',
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
      bankPaid: '0',
      remarks: ''
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
      company: '',
      customerType: '',
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
      bankPaid: '0',
      remarks: ''
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
          bankPaid: String(b.bank_paid || 0),
          remarks: b.remarks || ''
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

  const handleSelectNameSuggestion = async (cust) => {
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
    setApplyCredit(false);
    // Fetch fresh credit balance from backend
    try {
      const res = await api.get('/customers', { params: { phone: cust.phone } });
      if (res.data.exists) {
        setAvailableCredit(parseFloat(res.data.customer.creditBalance) || 0);
      } else {
        setAvailableCredit(0);
      }
    } catch {
      setAvailableCredit(parseFloat(cust.creditBalance) || 0);
    }
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
        setAvailableCredit(parseFloat(c.creditBalance) || 0);
        setApplyCredit(false);
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
    setAvailableCredit(0);
    setApplyCredit(false);
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
      
      let creditApplied = 0.00;
      const dueBeforeCredit = gTotal - (cash + upi + bank);
      if (applyCredit === true && availableCredit > 0 && dueBeforeCredit > 0) {
        creditApplied = Math.min(availableCredit, dueBeforeCredit);
      }

      const amtPaid = cash + upi + bank + creditApplied;
      const due = gTotal - amtPaid;
      return {
        ...prev,
        grandTotal: gTotal,
        amountPaid: String(amtPaid),
        dueAmount: due < 0 ? 0 : due
      };
    });
  }, [items, billingInfo.cashPaid, billingInfo.upiPaid, billingInfo.bankPaid, applyCredit, availableCredit]);

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
    if (!company) return setFormError('Company selection is mandatory. Please select a company from the dropdown.');
    if (!customerType) return setFormError('Customer Type selection is mandatory. Please select a customer type from the dropdown.');
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
        bankPaid: parseFloat(bankPaid) || 0,
        applyCredit,
        remarks: billingInfo.remarks || ''
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
        <div className="border border-slate-200/80 rounded-2xl bg-white p-5 space-y-2.5 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest block">
              🏢 CHOOSE COMPANY *
            </label>
            {!billingInfo.company ? (
              <span className="text-[10px] text-rose-500 font-extrabold uppercase bg-rose-50 px-2 py-0.5 rounded border border-rose-100">
                Required
              </span>
            ) : (
              <span className="text-[10px] text-emerald-600 font-extrabold uppercase bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                ✓ Selected
              </span>
            )}
          </div>
          <select
            value={billingInfo.company}
            onChange={(e) => setBillingInfo(prev => ({ ...prev, company: e.target.value }))}
            className={`w-full h-12 px-4 rounded-xl border bg-white text-slate-800 text-sm font-extrabold focus:ring-4 focus:ring-primary/10 transition-all outline-none ${
              !billingInfo.company ? 'border-rose-300 bg-rose-50/20 text-slate-400' : 'border-slate-200 focus:border-primary'
            }`}
            required
          >
            <option value="" disabled className="text-slate-400">-- Select Company --</option>
            <option value="Kempannavar Industries">KEMPANNAVAR INDUSTRIES</option>
            <option value="Kemps Pet Industries">KEMPS PET INDUSTRIES</option>
          </select>
        </div>

        {/* 2. CHOOSE CUSTOMER CONTEXT TYPE */}
        <div className="border border-slate-200/80 rounded-2xl bg-white p-5 space-y-2.5 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest block">
              🎯 CUSTOMER TYPE *
            </label>
            {!billingInfo.customerType ? (
              <span className="text-[10px] text-rose-500 font-extrabold uppercase bg-rose-50 px-2 py-0.5 rounded border border-rose-100">
                Required
              </span>
            ) : (
              <span className="text-[10px] text-emerald-600 font-extrabold uppercase bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                ✓ Selected
              </span>
            )}
          </div>
          <select
            value={billingInfo.customerType}
            onChange={(e) => setBillingInfo(prev => ({ ...prev, customerType: e.target.value }))}
            className={`w-full h-12 px-4 rounded-xl border bg-white text-slate-800 text-sm font-extrabold focus:ring-4 focus:ring-primary/10 transition-all outline-none ${
              !billingInfo.customerType ? 'border-rose-300 bg-rose-50/20 text-slate-400' : 'border-slate-200 focus:border-primary'
            }`}
            required
          >
            <option value="" disabled className="text-slate-400">-- Select Customer Type --</option>
            <option value="General Customer">GENERAL CUSTOMER</option>
            <option value="Distributor">DISTRIBUTOR</option>
            <option value="Function Order">FUNCTION ORDER</option>
            <option value="Corporate Customer">CORPORATE CUSTOMER</option>
            <option value="Wholesale Customer">WHOLESALE CUSTOMER</option>
          </select>
        </div>

        {/* 3. CUSTOMER DETAILS SEARCH & INPUT */}
        <div className="border border-slate-200/80 rounded-2xl bg-white p-5 space-y-4 shadow-sm">
          <div className="text-[11px] font-black text-slate-450 uppercase tracking-widest border-b border-slate-100 pb-2.5 flex justify-between items-center">
            <span>👤 CUSTOMER DATA</span>
            {preloadLoading && (
              <span className="text-[9px] text-primary font-black uppercase bg-primary/5 border border-primary/20 px-2 py-0.5 rounded-lg">
                Preloaded from Loading
              </span>
            )}
          </div>

          {preloadLoading && (
            <div className="bg-primary/5 border border-primary/20 p-3.5 rounded-2xl text-primary font-bold text-xs flex items-center gap-2 animate-fade-in">
              <span>ℹ️</span> Preloaded and locked from Loading Session: <span className="font-extrabold">{preloadLoading.loadingSessionId}</span>
            </div>
          )}

          {/* Search Inputs Row */}
          {!preloadLoading && (
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
                        className="px-4 py-2.5 text-xs text-slate-755 hover:bg-slate-50 cursor-pointer flex justify-between font-bold"
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
                  className="px-3 h-11 bg-white border border-slate-200 text-slate-660 hover:bg-slate-50 font-bold text-xs rounded-xl"
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
          )}

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
                readOnly={!!preloadLoading}
                className={`w-full h-11 px-4 rounded-xl border outline-none text-sm font-medium ${
                  preloadLoading 
                    ? 'bg-slate-50 text-slate-500 font-bold border-slate-200 cursor-not-allowed' 
                    : 'bg-white text-slate-700 border-slate-200 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all'
                }`}
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
                readOnly={!!preloadLoading}
                className={`w-full h-11 px-4 rounded-xl border outline-none text-sm font-medium ${
                  preloadLoading 
                    ? 'bg-slate-50 text-slate-500 font-bold border-slate-200 cursor-not-allowed' 
                    : 'bg-white text-slate-700 border-slate-200 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all'
                }`}
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
                readOnly={!!preloadLoading}
                className={`w-full h-11 px-4 rounded-xl border outline-none text-sm font-medium ${
                  preloadLoading 
                    ? 'bg-slate-50 text-slate-500 font-bold border-slate-200 cursor-not-allowed' 
                    : 'bg-white text-slate-700 border-slate-200 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all'
                }`}
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
                readOnly={!!preloadLoading}
                className={`w-full p-4 rounded-xl border outline-none text-sm font-medium h-20 resize-none ${
                  preloadLoading 
                    ? 'bg-slate-50 text-slate-500 font-bold border-slate-200 cursor-not-allowed' 
                    : 'bg-white text-slate-700 border-slate-200 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all'
                }`}
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
                readOnly={!!preloadLoading}
                className={`w-full h-11 px-4 rounded-xl border outline-none text-sm font-medium ${
                  preloadLoading 
                    ? 'bg-slate-50 text-slate-500 font-bold border-slate-200 cursor-not-allowed' 
                    : 'bg-white text-slate-700 border-slate-200 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all'
                }`}
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
            {!preloadLoading && (
              <button
                type="button"
                onClick={handleAddProductRow}
                className="px-3.5 py-1.5 rounded-lg border border-primary/20 text-primary bg-primary/5 hover:bg-primary hover:text-white transition-all text-xs font-bold"
              >
                + Add Product
              </button>
            )}
          </div>

          {/* Lines Table */}
          <div className="space-y-3">
            {items.map((row, index) => (
              <div 
                key={row.id} 
                className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end bg-slate-50/40 border border-slate-100 p-4 rounded-2xl relative group"
              >
                
                {/* Finished Product Selector */}
                <div className="md:col-span-3 space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
                    Product #{index + 1}
                  </label>
                  {preloadLoading ? (
                    <input 
                      type="text"
                      value={finishedProducts.find(fp => String(fp.id) === String(row.finishedProductId))?.name || 'Loading product...'}
                      readOnly
                      className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-slate-50 text-slate-550 font-bold outline-none text-xs cursor-not-allowed"
                    />
                  ) : (
                    <SearchableSelect
                      options={finishedProducts.map(fp => ({ value: fp.id, label: fp.name }))}
                      value={row.finishedProductId}
                      onChange={(val) => handleItemRowChange(row.id, 'finishedProductId', val)}
                      placeholder="Select Finished Product"
                      searchPlaceholder="Search product..."
                    />
                  )}
                </div>

                {/* Qty */}
                <div className="md:col-span-1 space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
                    Qty (Pcs)
                  </label>
                  <input 
                    type="number"
                    value={row.quantity}
                    onChange={(e) => handleItemRowChange(row.id, 'quantity', e.target.value)}
                    placeholder="0"
                    readOnly={!!preloadLoading}
                    className={`w-full h-11 px-3.5 rounded-xl border outline-none text-sm font-medium ${
                      preloadLoading 
                        ? 'bg-slate-50 text-slate-500 font-bold border-slate-200 cursor-not-allowed' 
                        : 'bg-white text-slate-700 border-slate-200 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all'
                    }`}
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
                <div className="md:col-span-1 space-y-1.5">
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
                <div className={`${preloadLoading ? 'md:col-span-3' : 'md:col-span-3 flex gap-2 items-end'}`}>
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
                  {!preloadLoading && (
                    <button
                      type="button"
                      onClick={() => handleRemoveProductRow(row.id)}
                      className="w-11 h-11 rounded-xl bg-white border border-slate-200 hover:border-red-200 hover:bg-red-50 hover:text-red-500 text-slate-450 transition-all flex items-center justify-center font-bold text-xs shrink-0"
                      title="Remove Item"
                    >
                      ✕
                    </button>
                  )}
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

          {/* AVAILABLE CUSTOMER CREDIT BLOCK */}
          {availableCredit > 0 && (
            <div className="border border-indigo-200 bg-indigo-50/30 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center text-lg border border-indigo-200 shrink-0">
                  💳
                </div>
                <div>
                  <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest block">Available Customer Credit Balance</span>
                  <span className="text-base font-black text-indigo-700 mt-0.5 block">
                    ₹ {availableCredit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3 bg-white border border-slate-200 px-4 py-2.5 rounded-xl">
                <span className="text-xs font-bold text-slate-700">Apply Credit on Dues?</span>
                <div className="flex gap-3">
                  <label className="flex items-center gap-1.5 cursor-pointer text-xs font-bold text-indigo-700">
                    <input
                      type="radio"
                      name="applyCreditOption"
                      checked={applyCredit === true}
                      onChange={() => setApplyCredit(true)}
                    />
                    YES
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer text-xs font-bold text-slate-800">
                    <input
                      type="radio"
                      name="applyCreditOption"
                      checked={applyCredit === false}
                      onChange={() => setApplyCredit(false)}
                    />
                    NO
                  </label>
                </div>
              </div>
            </div>
          )}

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

        {/* 6. INVOICE NOTE / REMARKS (OPTIONAL) */}
        <div className="border border-slate-200/80 rounded-2xl bg-white p-5 space-y-2.5 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest block flex items-center gap-1.5">
              <span>📝</span> INVOICE NOTE / REMARKS (OPTIONAL)
            </label>
            <span className="text-[10px] text-slate-400 font-extrabold uppercase bg-slate-100 px-2.5 py-0.5 rounded-md">
              Optional
            </span>
          </div>
          <textarea
            rows="2"
            value={billingInfo.remarks || ''}
            onChange={(e) => setBillingInfo(prev => ({ ...prev, remarks: e.target.value }))}
            placeholder="Enter any optional notes, delivery instructions, or bill remarks..."
            className="w-full p-3.5 rounded-xl border border-slate-200 bg-white text-slate-800 text-xs font-semibold focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none transition-all resize-none placeholder:text-slate-400 placeholder:font-medium"
          />
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
