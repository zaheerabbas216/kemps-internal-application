import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../api/axios';
import SearchableSelect from '../components/SearchableSelect';
import ProductSelectWithCode from '../components/ProductSelectWithCode';


const BillingForm = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const editBillId = location.state?.editBillId || null;
  const preloadLoading = location.state?.preloadLoading || null;
  const preloadOrder = location.state?.preloadOrder || null;
  const preloadCanSupply = location.state?.preloadCanSupply || null;

  // Static options
  const TAX_OPTIONS = [0, 5, 12, 18, 28, 40];
  const PAYMENT_MODES = ['Cash', 'Credit', 'UPI(KI)', 'UPI(KP)', 'BANK (KI)', 'BANK (KP)'];

  // Master lists
  const [finishedProducts, setFinishedProducts] = useState([]);
  const [customers, setCustomers] = useState([]); // In-memory list for name autocomplete
  const [goodsLedgerStock, setGoodsLedgerStock] = useState({}); // { [productId]: closing_stock }

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

  // Customer mode: 'new' | 'existing'
  const [customerMode, setCustomerMode] = useState('new');

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
          taxPercent: '',
          basicRate: 0,
          totalAmount: 0
        };
      });
      setItems(loadedItems);
    }
  }, [finishedProducts, preloadCanSupply]);

  // Hook to ensure preloadLoading product IDs are cleanly linked once finishedProducts master loads
  useEffect(() => {
    if (preloadLoading && finishedProducts.length > 0 && items.length > 0) {
      setItems(prevItems =>
        prevItems.map(item => {
          if (!item.finishedProductId || item.finishedProductId === 'undefined') {
            const match = finishedProducts.find(fp =>
              fp.name.toLowerCase().trim() === String(item.productName || '').toLowerCase().trim()
            );
            if (match) {
              return { ...item, finishedProductId: String(match.id) };
            }
          }
          return item;
        })
      );
    }
  }, [finishedProducts, preloadLoading]);

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
    setCustomerMode('existing');
  };

  const loadBillFromLoadingSession = () => {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const istDate = new Date(now.getTime() + (330 + offset) * 60000);
    const yyyy = istDate.getFullYear();
    const mm = String(istDate.getMonth() + 1).padStart(2, '0');
    const dd = String(istDate.getDate()).padStart(2, '0');
    const todayFormatted = `${yyyy}-${mm}-${dd}`;

    const cust = preloadLoading.customer || {};
    setBillingInfo({
      billingDate: todayFormatted,
      company: 'Kempannavar Industries',
      customerType: 'General Customer',
      customerId: cust.id || '',
      customerName: cust.name || '',
      customerPhone: cust.phone || '',
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

    const loadedItems = (preloadLoading.items || []).map(i => {
      let resolvedId = (i.finishedProductId && String(i.finishedProductId) !== 'undefined')
        ? String(i.finishedProductId)
        : '';

      if (!resolvedId && i.productName && finishedProducts.length > 0) {
        const match = finishedProducts.find(fp =>
          fp.name.toLowerCase().trim() === String(i.productName).toLowerCase().trim()
        );
        if (match) resolvedId = String(match.id);
      }

      return {
        id: Math.random().toString(36).substring(2, 9),
        finishedProductId: resolvedId,
        productName: i.productName || '',
        quantity: String(i.quantity || '0'),
        rateWithTax: '',
        taxPercent: 18,
        basicRate: 0,
        totalAmount: 0
      };
    });

    setItems(loadedItems);
    setNameSearchText(cust.name || '');
    setPhoneSearchText(cust.phone || '');
    setCustomerMode('existing');
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
    setCustomerMode('existing');
  };

  const fetchGoodsLedgerStock = async (targetDate) => {
    try {
      const now = new Date();
      const offset = now.getTimezoneOffset();
      const istDate = new Date(now.getTime() + (330 + offset) * 60000);
      const yyyy = istDate.getFullYear();
      const mm = String(istDate.getMonth() + 1).padStart(2, '0');
      const dd = String(istDate.getDate()).padStart(2, '0');
      const todayFormatted = `${yyyy}-${mm}-${dd}`;

      const d = targetDate || billingInfo.billingDate || todayFormatted;
      const res = await api.get('/goods-ledger/day', { params: { date: d } });
      if (res.data.ok && res.data.items) {
        const stockMap = {};
        res.data.items.forEach(item => {
          stockMap[item.finished_product_id] = parseFloat(item.closing_stock) || 0;
        });
        setGoodsLedgerStock(stockMap);
      }
    } catch (err) {
      console.error('Failed to load goods ledger stock:', err);
    }
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
      await fetchGoodsLedgerStock(billingInfo.billingDate);
    } catch (err) {
      console.error('Failed to load masters:', err);
    }
  };

  // Re-fetch goods ledger stock whenever billing date changes
  useEffect(() => {
    if (billingInfo.billingDate) {
      fetchGoodsLedgerStock(billingInfo.billingDate);
    }
  }, [billingInfo.billingDate]);

  const initializeNewForm = () => {
    // Set default billing date to today in IST
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const istDate = new Date(now.getTime() + (330 + offset) * 60000);
    const yyyy = istDate.getFullYear();
    const mm = String(istDate.getMonth() + 1).padStart(2, '0');
    const dd = String(istDate.getDate()).padStart(2, '0');
    const todayFormatted = `${yyyy}-${mm}-${dd}`;

    setCustomerMode('new');
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
      bankPaid: '0',
      remarks: ''
    });
    setItems([{
      id: Math.random().toString(36).substring(2, 9),
      finishedProductId: '',
      quantity: '1',
      rateWithTax: '',
      taxPercent: '',
      basicRate: 0,
      totalAmount: 0
    }]);
    setPhoneSearchText('');
    setNameSearchText('');
  };

  const loadBillForEdit = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/billing/${editBillId}`);
      if (res.data.ok) {
        const b = res.data.bill;
        setCustomerMode('existing');
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

  const handleSwitchToNewCustomer = () => {
    setCustomerMode('new');
    handleClearCustomerSearch();
  };

  const handleSwitchToExistingCustomer = () => {
    setCustomerMode('existing');
  };

  // Line item modifiers
  const handleAddProductRow = () => {
    const newRow = {
      id: Math.random().toString(36).substring(2, 9),
      finishedProductId: '',
      quantity: '1',
      rateWithTax: '',
      taxPercent: '',
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
          const taxPct = updated.taxPercent !== '' && updated.taxPercent !== null && !isNaN(parseFloat(updated.taxPercent))
            ? parseFloat(updated.taxPercent)
            : null;

          updated.basicRate = taxPct !== null ? rTax / (1 + taxPct / 100) : 0;
          updated.totalAmount = qty * rTax;

          return updated;
        }
        return item;
      })
    );
  };

  // Computations
  const computedGrandTotal = items.reduce((acc, item) => acc + (parseFloat(item.totalAmount) || 0), 0);
  const computedSubtotalBeforeTax = items.reduce((acc, item) => {
    const qty = parseInt(item.quantity, 10) || 0;
    const bRate = parseFloat(item.basicRate) || 0;
    return acc + (qty * bRate);
  }, 0);
  const computedTotalTax = Math.max(0, computedGrandTotal - computedSubtotalBeforeTax);

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

      if (item.taxPercent === '' || item.taxPercent === null || item.taxPercent === undefined) {
        return setFormError('Tax (%) is a required field. Please select Tax (%) for all product rows.');
      }

      itemsPayload.push({
        finishedProductId: parseInt(item.finishedProductId, 10),
        quantity: qty,
        rateWithTax: rate,
        taxPercent: parseFloat(item.taxPercent)
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
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto px-4 sm:px-6 pb-16">
      {/* Back button */}
      <div className="flex justify-start">
        <button 
          type="button"
          onClick={() => navigate('/billing')}
          className="px-3.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
        >
          <span>←</span> Back to billing
        </button>
      </div>

      {/* Heading matching Image 1 */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          {editBillId ? 'Edit bill' : 'New bill'}
        </h1>
        <p className="text-slate-500 text-xs mt-1">
          Add the customer, pick products, then record payment.
        </p>
      </div>

      <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT COLUMN: Customer, Products, Payments, Remarks */}
        <div className="lg:col-span-8 space-y-6">

          {/* 1. CUSTOMER CARD */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-sm space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-900">
                Customer
              </h2>
              {preloadLoading && (
                <span className="text-[10px] text-primary font-black uppercase bg-primary/5 border border-primary/20 px-2 py-0.5 rounded-lg">
                  Preloaded from Loading
                </span>
              )}
            </div>

            {/* Toggle buttons: New customer vs Existing customer */}
            {!preloadLoading && (
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={handleSwitchToNewCustomer}
                  className={`py-2.5 px-4 rounded-xl text-xs font-bold transition-all text-center ${
                    customerMode === 'new'
                      ? 'border-2 border-emerald-700 bg-emerald-50/70 text-emerald-900 font-extrabold shadow-sm'
                      : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  New customer
                </button>
                <button
                  type="button"
                  onClick={handleSwitchToExistingCustomer}
                  className={`py-2.5 px-4 rounded-xl text-xs font-bold transition-all text-center ${
                    customerMode === 'existing'
                      ? 'border-2 border-emerald-700 bg-emerald-50/70 text-emerald-900 font-extrabold shadow-sm'
                      : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Existing customer
                </button>
              </div>
            )}

            {/* Existing Customer Search box (active when customerMode === 'existing') */}
            {customerMode === 'existing' && !preloadLoading && (
              <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200 space-y-3 animate-fade-in">
                <div className="text-xs font-bold text-slate-700 flex items-center justify-between">
                  <span>🔍 Search Existing Customer</span>
                  {billingInfo.customerId && (
                    <button
                      type="button"
                      onClick={handleClearCustomerSearch}
                      className="text-[11px] text-rose-600 hover:underline font-bold"
                    >
                      Clear selection
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                  {/* Name search */}
                  <div className="md:col-span-6 relative">
                    <label className="text-[11px] font-semibold text-slate-500 mb-1 block">Search by Name</label>
                    <input
                      type="text"
                      placeholder="Type customer name..."
                      value={nameSearchText}
                      onChange={handleNameSearchChange}
                      onFocus={() => { if (nameSearchText.trim()) setShowNameSuggestions(true); }}
                      className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/10 font-medium"
                    />
                    {showNameSuggestions && filteredNameCustomers.length > 0 && (
                      <ul className="absolute z-30 w-full left-0 mt-1 bg-white border border-slate-200 rounded-xl max-h-48 overflow-y-auto shadow-lg divide-y divide-slate-100">
                        {filteredNameCustomers.map(c => (
                          <li
                            key={c.id}
                            onClick={() => handleSelectNameSuggestion(c)}
                            className="px-3.5 py-2 text-xs text-slate-800 hover:bg-emerald-50 hover:text-emerald-900 cursor-pointer flex justify-between font-semibold"
                          >
                            <span>{c.name}</span>
                            <span className="text-[10px] text-slate-400 font-bold">{c.phone}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Phone search */}
                  <div className="md:col-span-6 flex items-end gap-2">
                    <div className="flex-1">
                      <label className="text-[11px] font-semibold text-slate-500 mb-1 block">Search by Phone</label>
                      <input
                        type="text"
                        placeholder="e.g. 9876543210"
                        value={phoneSearchText}
                        onChange={(e) => setPhoneSearchText(e.target.value)}
                        className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/10 font-medium"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handlePhoneSearchSubmit}
                      className="h-10 px-4 bg-[#0F5A47] hover:bg-[#0c4839] text-white font-bold text-xs rounded-xl shadow-sm transition-all"
                    >
                      Search
                    </button>
                  </div>
                </div>

                {billingInfo.customerId && (
                  <div className="text-xs bg-emerald-50 border border-emerald-200 text-emerald-800 px-3 py-1.5 rounded-lg font-semibold flex items-center justify-between">
                    <span>✓ Linked: <b>{billingInfo.customerName}</b> ({billingInfo.customerPhone})</span>
                  </div>
                )}
              </div>
            )}

            {/* Company & Customer Type selection */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1 border-t border-slate-100">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 block">
                  Company <span className="text-rose-500">*</span>
                </label>
                <select
                  value={billingInfo.company}
                  onChange={(e) => setBillingInfo(prev => ({ ...prev, company: e.target.value }))}
                  className={`w-full h-10 px-3 rounded-xl border bg-white text-slate-800 text-sm font-semibold outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/10 transition-all ${
                    !billingInfo.company ? 'border-amber-300' : 'border-slate-200'
                  }`}
                  required
                >
                  <option value="" disabled>-- Select Company --</option>
                  <option value="Kempannavar Industries">Kempannavar Industries</option>
                  <option value="Kemps Pet Industries">Kemps Pet Industries</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 block">
                  Customer Type <span className="text-rose-500">*</span>
                </label>
                <select
                  value={billingInfo.customerType}
                  onChange={(e) => setBillingInfo(prev => ({ ...prev, customerType: e.target.value }))}
                  className={`w-full h-10 px-3 rounded-xl border bg-white text-slate-800 text-sm font-semibold outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/10 transition-all ${
                    !billingInfo.customerType ? 'border-amber-300' : 'border-slate-200'
                  }`}
                  required
                >
                  <option value="" disabled>-- Select Customer Type --</option>
                  <option value="General Customer">General Customer</option>
                  <option value="Distributor">Distributor</option>
                  <option value="Function Order">Function Order</option>
                  <option value="Corporate Customer">Corporate Customer</option>
                  <option value="Wholesale Customer">Wholesale Customer</option>
                </select>
              </div>
            </div>

            {/* Customer Info Form fields matching Image 1 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Customer ID */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 block">
                  Customer ID
                </label>
                <input
                  type="text"
                  value={billingInfo.customerId ? `#${billingInfo.customerId}` : 'Auto-generated'}
                  readOnly
                  className="w-full h-10 px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-500 font-medium outline-none text-sm cursor-not-allowed"
                />
              </div>

              {/* Customer Name */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 block">
                  Customer name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={billingInfo.customerName}
                  onChange={(e) => setBillingInfo(prev => ({ ...prev, customerName: e.target.value }))}
                  placeholder="Enter customer name"
                  readOnly={!!preloadLoading}
                  className={`w-full h-10 px-3.5 rounded-xl border outline-none text-sm font-medium ${
                    preloadLoading
                      ? 'bg-slate-50 text-slate-500 font-bold border-slate-200 cursor-not-allowed'
                      : 'bg-white text-slate-800 border-slate-200 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/10 transition-all'
                  }`}
                  required
                />
              </div>

              {/* Phone number */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 block">
                  Phone number <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={billingInfo.customerPhone}
                  onChange={(e) => setBillingInfo(prev => ({ ...prev, customerPhone: e.target.value }))}
                  placeholder="10-digit phone number"
                  readOnly={!!preloadLoading}
                  className={`w-full h-10 px-3.5 rounded-xl border outline-none text-sm font-medium ${
                    preloadLoading
                      ? 'bg-slate-50 text-slate-500 font-bold border-slate-200 cursor-not-allowed'
                      : 'bg-white text-slate-800 border-slate-200 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/10 transition-all'
                  }`}
                  required
                />
              </div>

              {/* GSTIN (optional) */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 block">
                  GSTIN (optional)
                </label>
                <input
                  type="text"
                  value={billingInfo.customerGstin}
                  onChange={(e) => setBillingInfo(prev => ({ ...prev, customerGstin: e.target.value }))}
                  placeholder="GST number"
                  readOnly={!!preloadLoading}
                  className={`w-full h-10 px-3.5 rounded-xl border outline-none text-sm font-medium ${
                    preloadLoading
                      ? 'bg-slate-50 text-slate-500 font-bold border-slate-200 cursor-not-allowed'
                      : 'bg-white text-slate-800 border-slate-200 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/10 transition-all'
                  }`}
                />
              </div>

              {/* Address */}
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-semibold text-slate-700 block">
                  Address
                </label>
                <textarea
                  value={billingInfo.customerAddress}
                  onChange={(e) => setBillingInfo(prev => ({ ...prev, customerAddress: e.target.value }))}
                  placeholder="Customer address details"
                  rows={2}
                  readOnly={!!preloadLoading}
                  className={`w-full p-3 rounded-xl border outline-none text-sm font-medium resize-none ${
                    preloadLoading
                      ? 'bg-slate-50 text-slate-500 font-bold border-slate-200 cursor-not-allowed'
                      : 'bg-white text-slate-800 border-slate-200 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/10 transition-all'
                  }`}
                />
              </div>

              {/* Billing date */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 block">
                  Billing date <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={billingInfo.billingDate}
                  onChange={(e) => setBillingInfo(prev => ({ ...prev, billingDate: e.target.value }))}
                  readOnly={!!preloadLoading}
                  className={`w-full h-10 px-3.5 rounded-xl border outline-none text-sm font-medium ${
                    preloadLoading
                      ? 'bg-slate-50 text-slate-500 font-bold border-slate-200 cursor-not-allowed'
                      : 'bg-white text-slate-800 border-slate-200 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/10 transition-all'
                  }`}
                  required
                />
              </div>
            </div>
          </div>

          {/* 2. PRODUCTS CARD */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-sm space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-900">
                Products
              </h2>
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-slate-500">
                  {items.length} {items.length === 1 ? 'product' : 'products'}
                </span>
                {!preloadLoading && (
                  <button
                    type="button"
                    onClick={handleAddProductRow}
                    className="border border-emerald-600/70 text-emerald-800 bg-emerald-50/70 hover:bg-emerald-100 font-bold px-3 py-1.5 rounded-xl text-xs transition-all flex items-center gap-1 shadow-sm"
                  >
                    <span>+</span> Add product
                  </button>
                )}
              </div>
            </div>

            {/* Product items list */}
            <div className="space-y-3">
              {items.map((row, index) => (
                <div
                  key={row.id}
                  className="border border-slate-200/90 rounded-2xl p-4 sm:p-5 bg-white space-y-3 relative hover:border-slate-300 transition-colors shadow-sm"
                >
                  {/* Top row: Number circle badge + Product Code + Product Name + Remove button */}
                  <div className="flex items-start gap-3">
                    {/* Number badge */}
                    <div className="w-7 h-7 rounded-full bg-[#0F5A47] text-white text-xs font-bold flex items-center justify-center shrink-0 shadow-sm mt-7">
                      {index + 1}
                    </div>

                    {/* Wide Product selector with Code and Name */}
                    <div className="flex-1 min-w-0">
                      {preloadLoading ? (
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-slate-600 block">
                            Product
                          </label>
                          <input 
                            type="text"
                            value={finishedProducts.find(fp => String(fp.id) === String(row.finishedProductId))?.name || row.productName || 'Product'}
                            readOnly
                            className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-slate-50 text-slate-750 font-bold outline-none text-xs cursor-not-allowed"
                          />
                        </div>
                      ) : (
                        <ProductSelectWithCode
                          products={finishedProducts}
                          value={row.finishedProductId}
                          stockMap={goodsLedgerStock}
                          showCodeInput={true}
                          codeLabel="Product Code"
                          dropdownLabel="Product Name"
                          onChange={(val) => handleItemRowChange(row.id, 'finishedProductId', val)}
                          onNextFocus={() => {
                            const nextEl = document.getElementById(`billing-qty-${row.id}`);
                            if (nextEl) {
                              nextEl.focus();
                              nextEl.select();
                            }
                          }}
                          placeholder="Search or pick a product"
                          searchPlaceholder="Search product or code..."
                        />
                      )}
                    </div>

                    {/* Remove button */}
                    {!preloadLoading && (
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-transparent block select-none">
                          ✕
                        </label>
                        <button
                          type="button"
                          onClick={() => handleRemoveProductRow(row.id)}
                          className="w-10 h-11 rounded-xl border border-red-200/80 text-red-500 hover:bg-red-50 hover:border-red-300 flex items-center justify-center text-xs font-bold transition-all shrink-0"
                          title="Remove item"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Bottom row: Quantity stepper, Rate, Tax, Basic rate, Line total */}
                  <div className="flex flex-wrap sm:flex-nowrap items-start gap-3 sm:gap-4 pt-1">
                    {/* Quantity with stepper */}
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-600 block">
                        Quantity
                      </label>
                      <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden bg-white h-10 w-28 sm:w-32 shadow-sm">
                        <button
                          type="button"
                          disabled={preloadLoading}
                          onClick={() => {
                            const curr = parseInt(row.quantity, 10) || 1;
                            handleItemRowChange(row.id, 'quantity', String(Math.max(1, curr - 1)));
                          }}
                          className="w-8 sm:w-9 h-full flex items-center justify-center text-slate-500 hover:bg-slate-50 active:bg-slate-100 font-bold text-base border-r border-slate-200 transition-colors disabled:opacity-50 select-none"
                        >
                          −
                        </button>
                        <input
                          id={`billing-qty-${row.id}`}
                          type="number"
                          min="1"
                          value={row.quantity}
                          onChange={(e) => handleItemRowChange(row.id, 'quantity', e.target.value)}
                          placeholder="1"
                          readOnly={!!preloadLoading}
                          className="w-12 sm:w-14 h-full text-center text-sm font-semibold text-slate-800 outline-none bg-transparent"
                          required
                        />
                        <button
                          type="button"
                          disabled={preloadLoading}
                          onClick={() => {
                            const curr = parseInt(row.quantity, 10) || 0;
                            handleItemRowChange(row.id, 'quantity', String(curr + 1));
                          }}
                          className="w-8 sm:w-9 h-full flex items-center justify-center text-slate-500 hover:bg-slate-50 active:bg-slate-100 font-bold text-base border-l border-slate-200 transition-colors disabled:opacity-50 select-none"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* Rate (with tax) */}
                    <div className="flex-1 min-w-[110px] space-y-1">
                      <label className="text-xs font-semibold text-slate-600 block">
                        Rate (with tax)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={row.rateWithTax}
                        onChange={(e) => handleItemRowChange(row.id, 'rateWithTax', e.target.value)}
                        placeholder="0.00"
                        className="h-10 w-full px-3 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm font-semibold outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/10 transition-all shadow-sm"
                        required
                      />
                    </div>

                    {/* Tax select */}
                    <div className="w-28 shrink-0 space-y-1">
                      <label className="text-xs font-semibold text-slate-600 block">
                        Tax
                      </label>
                      <select
                        value={row.taxPercent ?? ''}
                        onChange={(e) => handleItemRowChange(row.id, 'taxPercent', e.target.value)}
                        className="h-10 w-full px-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm font-semibold outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/10 transition-all shadow-sm"
                        required
                      >
                        <option value="" disabled>Select</option>
                        {TAX_OPTIONS.map(tax => (
                          <option key={tax} value={tax}>{tax}%</option>
                        ))}
                      </select>
                      <div className="text-[10px] text-slate-400 font-semibold text-center mt-0.5">
                        {row.taxPercent !== '' && row.taxPercent !== null && parseFloat(row.taxPercent) > 0
                          ? `${parseFloat(row.taxPercent) / 2}% + ${parseFloat(row.taxPercent) / 2}%`
                          : row.taxPercent !== '' && row.taxPercent !== null ? '0%' : 'Required'}
                      </div>
                    </div>

                    {/* Basic rate (calculated) */}
                    <div className="flex-1 min-w-[100px] space-y-1">
                      <label className="text-xs font-semibold text-slate-600 block">
                        Basic rate
                      </label>
                      <div className="h-10 px-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-600 text-sm font-semibold flex items-center shadow-sm">
                        {(row.basicRate || 0).toFixed(2)}
                      </div>
                    </div>

                    {/* Line total */}
                    <div className="w-28 shrink-0 space-y-1">
                      <label className="text-xs font-semibold text-slate-600 block">
                        Line total
                      </label>
                      <div className="h-10 flex items-center text-base font-black text-[#0F5A47]">
                        ₹{(row.totalAmount || 0).toFixed(2)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {items.length === 0 && (
                <div className="py-12 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50 text-center space-y-2">
                  <p className="text-slate-500 text-sm font-medium">No products added yet.</p>
                  <button
                    type="button"
                    onClick={handleAddProductRow}
                    className="inline-flex items-center gap-1 px-4 py-2 bg-[#0F5A47] text-white text-xs font-bold rounded-xl shadow-sm hover:bg-[#0c4839] transition-all"
                  >
                    + Add first product
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 3. PAYMENT BREAKDOWN (COLLECTION & SETTLEMENTS) */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-sm space-y-4">
            <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">
              Payment breakdown
            </h2>

            {/* Customer credit balance banner */}
            {availableCredit > 0 && (
              <div className="border border-indigo-200 bg-indigo-50/50 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-indigo-100 text-indigo-700 rounded-xl flex items-center justify-center font-bold text-sm shrink-0">
                    💳
                  </div>
                  <div>
                    <span className="text-xs text-indigo-700 font-bold block">Available customer credit balance</span>
                    <span className="text-sm font-black text-indigo-900">
                      ₹{availableCredit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3 bg-white border border-slate-200 px-3.5 py-2 rounded-xl">
                  <span className="text-xs font-semibold text-slate-700">Apply credit on dues?</span>
                  <div className="flex gap-3">
                    <label className="flex items-center gap-1 text-xs font-bold text-indigo-700 cursor-pointer">
                      <input
                        type="radio"
                        name="applyCreditOption"
                        checked={applyCredit === true}
                        onChange={() => setApplyCredit(true)}
                      />
                      Yes
                    </label>
                    <label className="flex items-center gap-1 text-xs font-bold text-slate-700 cursor-pointer">
                      <input
                        type="radio"
                        name="applyCreditOption"
                        checked={applyCredit === false}
                        onChange={() => setApplyCredit(false)}
                      />
                      No
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* Payment methods: Cash, UPI, Bank */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Cash */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-1.5 shadow-sm">
                <label className="text-xs font-bold text-slate-600 block flex items-center gap-1.5">
                  💵 Cash received
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={billingInfo.cashPaid}
                  onChange={(e) => setBillingInfo(prev => ({ ...prev, cashPaid: e.target.value }))}
                  placeholder="0.00"
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-slate-800 font-bold text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/10 shadow-sm"
                />
              </div>

              {/* UPI */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-1.5 shadow-sm">
                <label className="text-xs font-bold text-slate-600 block flex items-center gap-1.5">
                  📱 UPI received
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={billingInfo.upiPaid}
                  onChange={(e) => setBillingInfo(prev => ({ ...prev, upiPaid: e.target.value }))}
                  placeholder="0.00"
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-slate-800 font-bold text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/10 shadow-sm"
                />
              </div>

              {/* Bank */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-1.5 shadow-sm">
                <label className="text-xs font-bold text-slate-600 block flex items-center gap-1.5">
                  🏦 Bank received
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={billingInfo.bankPaid}
                  onChange={(e) => setBillingInfo(prev => ({ ...prev, bankPaid: e.target.value }))}
                  placeholder="0.00"
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-slate-800 font-bold text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/10 shadow-sm"
                />
              </div>
            </div>
          </div>

          {/* 4. INVOICE NOTE / REMARKS (OPTIONAL) */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-sm space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 block">
                Invoice note / remarks (optional)
              </label>
              <span className="text-[10px] text-slate-400 font-bold uppercase bg-slate-100 px-2 py-0.5 rounded">
                Optional
              </span>
            </div>
            <textarea
              rows={2}
              value={billingInfo.remarks || ''}
              onChange={(e) => setBillingInfo(prev => ({ ...prev, remarks: e.target.value }))}
              placeholder="Enter any optional notes, delivery instructions, or bill remarks..."
              className="w-full p-3 rounded-xl border border-slate-200 bg-white text-slate-800 text-xs font-medium focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/10 outline-none transition-all resize-none placeholder:text-slate-400"
            />
          </div>

          {/* NOTIFICATIONS */}
          {formError && (
            <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-xs font-semibold border border-red-200 animate-fade-in">
              ⚠️ {formError}
            </div>
          )}
          {formSuccess && (
            <div className="bg-emerald-50 text-emerald-700 px-4 py-3 rounded-xl text-xs font-semibold border border-emerald-200 animate-fade-in">
              ✅ {formSuccess}
            </div>
          )}

          {/* BOTTOM SUBMIT ACTIONS */}
          <div className="flex gap-4 pt-2">
            <button
              type="submit"
              disabled={isSaving}
              className="flex-[2] h-12 bg-[#0F5A47] hover:bg-[#0c4839] text-white font-bold rounded-xl text-sm transition-all shadow-sm flex items-center justify-center gap-2"
            >
              {isSaving ? <span className="loading loading-spinner loading-sm"></span> : (editBillId ? 'Update invoice' : 'Save invoice')}
            </button>
            <button
              type="button"
              onClick={() => navigate('/billing')}
              className="flex-1 h-12 bg-white text-slate-600 hover:bg-slate-50 border border-slate-200 font-bold rounded-xl text-sm transition-all"
            >
              Cancel
            </button>
          </div>

        </div>

        {/* RIGHT COLUMN: STICKY BILL SUMMARY CARD (MATCHING IMAGE 1) */}
        <div className="lg:col-span-4 sticky top-6 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-sm space-y-4">
            <h2 className="text-base font-bold text-slate-900">
              Bill summary
            </h2>

            <div className="space-y-3 pt-1 text-sm">
              <div className="flex justify-between items-center text-slate-600">
                <span>Subtotal (before tax)</span>
                <span className="font-semibold text-slate-800">
                  ₹{computedSubtotalBeforeTax.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>

              <div className="flex justify-between items-center text-slate-600">
                <span>CGST + SGST</span>
                <span className="font-semibold text-slate-800">
                  ₹{computedTotalTax.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>

              <div className="border-t border-dashed border-slate-200 pt-3">
                <span className="text-xs font-medium text-slate-500 block">Grand total</span>
                <div className="text-3xl font-extrabold text-slate-900 tracking-tight mt-0.5">
                  ₹{computedGrandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>

              <div className="flex justify-between items-center text-slate-600 pt-1">
                <span>Paid</span>
                <span className="font-semibold text-slate-800">
                  ₹{(parseFloat(billingInfo.amountPaid) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>

              {/* Balance due card in soft yellow/amber */}
              <div className="bg-[#FEF6E7] border border-[#FEE3B3] rounded-xl p-3.5 flex justify-between items-center mt-2">
                <span className="text-xs font-bold text-[#8A5100]">Balance due</span>
                <span className="text-lg font-black text-[#8A5100]">
                  ₹{billingInfo.dueAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Save bill button */}
            <button
              type="submit"
              disabled={isSaving}
              className="w-full h-12 bg-[#0F5A47] hover:bg-[#0c4839] text-white font-bold rounded-xl text-sm transition-all shadow-sm flex items-center justify-center gap-2 mt-4"
            >
              {isSaving ? <span className="loading loading-spinner loading-sm"></span> : (editBillId ? 'Update bill' : 'Save bill')}
            </button>
          </div>
        </div>

      </form>
    </div>
  );
};

export default BillingForm;
