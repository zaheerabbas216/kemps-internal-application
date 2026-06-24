import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';

const CanSupply = () => {
  const navigate = useNavigate();
  // Tabs: 'active-balances' | 'workspace' | 'billing-workspace' | 'outstanding-payments' | 'reports'
  const [activeTab, setActiveTab] = useState('active-balances');

  // Master / State variables
  const [activeBalances, setActiveBalances] = useState([]);
  const [loadingActive, setLoadingActive] = useState(false);
  const [searchBalancesQuery, setSearchBalancesQuery] = useState('');

  // Dashboard stats
  const [stats, setStats] = useState({
    companyCansOut: 0,
    distributorCansOut: 0,
    functionCansOut: 0,
    dispensersOut: 0,
    totalPendingReturns: 0
  });
  const [billingStats, setBillingStats] = useState({
    todayRevenue: 0,
    weeklyRevenue: 0,
    monthlyRevenue: 0,
    yearlyRevenue: 0,
    todayCans: 0,
    weeklyCans: 0,
    monthlyCans: 0,
    yearlyCans: 0,
    pendingPayments: 0,
    outstandingCans: 0
  });
  const [overdueList, setOverdueList] = useState([]);
  const [loadingDashboard, setLoadingDashboard] = useState(false);

  // Search Customer state (Workspace autocomplete)
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Selected Customer detail workspace
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [customerDetails, setCustomerDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Workspace views: 'supply' | 'return' | 'ledger'
  const [workspaceSubTab, setWorkspaceSubTab] = useState('supply');

  const [availableProducts, setAvailableProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);

  // Form states (Supply Workspace)
  const [supplyForm, setSupplyForm] = useState({
    supplyType: 'Company Can',
    product: '',
    quantity: '',
    rate: '0',
    notes: '',
    functionName: '',
    eventDate: '',
    expectedReturnDate: '',
    dispenserRent: '0',
    deliveryCharge: '0',
    otherCharge: '0',
    gstPercentage: '0'
  });
  const [isSavingSupply, setIsSavingSupply] = useState(false);
  const [supplyError, setSupplyError] = useState('');
  const [supplySuccess, setSupplySuccess] = useState('');

  // Return Form states
  const [selectedSupplyForReturn, setSelectedSupplyForReturn] = useState(null);
  const [returnForm, setReturnForm] = useState({
    returnedQty: '',
    notes: ''
  });
  const [isSavingReturn, setIsSavingReturn] = useState(false);
  const [returnError, setReturnError] = useState('');
  const [returnSuccess, setReturnSuccess] = useState('');

  // Billing Workspace states
  const [bills, setBills] = useState([]);
  const [loadingBills, setLoadingBills] = useState(false);
  const [billsSearch, setBillsSearch] = useState('');
  const [billsPaymentStatus, setBillsPaymentStatus] = useState('');
  const [billsStartDate, setBillsStartDate] = useState('');
  const [billsEndDate, setBillsEndDate] = useState('');

  // Edit Bill states
  const [editingBill, setEditingBill] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    date: '',
    qtySupplied: '',
    ratePerCan: '',
    dispenserRent: '',
    deliveryCharge: '',
    otherCharge: '',
    gstPercentage: '',
    remarks: ''
  });
  const [editError, setEditError] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Pay Modal states
  const [payingBill, setPayingBill] = useState(null);
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [payForm, setPayForm] = useState({
    paymentDate: new Date().toISOString().split('T')[0],
    amountPaid: '',
    paymentMethod: 'Cash',
    remarks: ''
  });
  const [payError, setPayError] = useState('');
  const [isSavingPay, setIsSavingPay] = useState(false);

  // Payment history states
  const [historyBill, setHistoryBill] = useState(null);
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [isPaymentHistoryModalOpen, setIsPaymentHistoryModalOpen] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Reports state
  const [reportType, setReportType] = useState('CustomerCanBalance');
  const [reportStartDate, setReportStartDate] = useState('');
  const [reportEndDate, setReportEndDate] = useState('');
  const [reportData, setReportData] = useState([]);
  const [reportSummary, setReportSummary] = useState(null);
  const [loadingReports, setLoadingReports] = useState(false);

  // Modal states for New Can Supply Entry
  const [isNewSupplyModalOpen, setIsNewSupplyModalOpen] = useState(false);
  const [modalSearchQuery, setModalSearchQuery] = useState('');
  const [modalSearchResults, setModalSearchResults] = useState([]);
  const [showModalSuggestions, setShowModalSuggestions] = useState(false);
  const [modalSelectedCustomerId, setModalSelectedCustomerId] = useState(null);
  const [modalSelectedCustomer, setModalSelectedCustomer] = useState(null);
  const [modalSupplyForm, setModalSupplyForm] = useState({
    supplyType: 'Company Can',
    product: '',
    quantity: '',
    rate: '0',
    notes: '',
    functionName: '',
    eventDate: '',
    expectedReturnDate: '',
    dispenserRent: '0',
    deliveryCharge: '0',
    otherCharge: '0',
    gstPercentage: '0'
  });
  const [modalSupplyError, setModalSupplyError] = useState('');
  const [modalSupplySuccess, setModalSupplySuccess] = useState('');
  const [isSavingModalSupply, setIsSavingModalSupply] = useState(false);

  // Company details for printing invoices
  const [companyDetails, setCompanyDetails] = useState(null);

  const suggestionsRef = useRef(null);
  const modalSuggestionsRef = useRef(null);

  // Initial loads
  useEffect(() => {
    fetchDashboardStats();
    fetchActiveBalances();
    fetchActiveProducts();
    fetchCompanyDetails();
  }, []);

  const fetchCompanyDetails = async () => {
    try {
      const res = await api.get('/company-details', { params: { limit: 1 } });
      if (res.data.ok && res.data.companies && res.data.companies.length > 0) {
        setCompanyDetails(res.data.companies[0]);
      }
    } catch (err) {
      console.error('Failed to fetch company details:', err);
    }
  };

  const fetchActiveProducts = async () => {
    try {
      setLoadingProducts(true);
      const res = await api.get('/finished-products', { params: { limit: 100 } });
      if (res.data.ok) {
        const products = (res.data.products || []).filter(
          p => p.name === '20 Ltr Can' || p.name === 'Dispenser'
        );
        setAvailableProducts(products);
        if (products.length > 0) {
          const firstProduct = products[0].name;
          setSupplyForm(prev => ({ ...prev, product: firstProduct }));
          setModalSupplyForm(prev => ({ ...prev, product: firstProduct }));
        }
      }
    } catch (err) {
      console.error('Failed to fetch finished products:', err);
    } finally {
      setLoadingProducts(false);
    }
  };

  // Suggestions click outside listener
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
      if (modalSuggestionsRef.current && !modalSuggestionsRef.current.contains(event.target)) {
        setShowModalSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch Dashboard items
  const fetchDashboardStats = async () => {
    try {
      setLoadingDashboard(true);
      const res = await api.get('/can-supply/dashboard');
      if (res.data.ok) {
        setStats(res.data.summary);
        if (res.data.billingStats) {
          setBillingStats(res.data.billingStats);
        }
        setOverdueList(res.data.overdue || []);
      }
    } catch (err) {
      console.error('Failed to load dashboard statistics:', err);
    } finally {
      setLoadingDashboard(false);
    }
  };

  // Fetch Active Balances list
  const fetchActiveBalances = async () => {
    try {
      setLoadingActive(true);
      const res = await api.get('/can-supply/active-balances', {
        params: { search: searchBalancesQuery }
      });
      if (res.data.ok) {
        setActiveBalances(res.data.activeBalances || []);
      }
    } catch (err) {
      console.error('Failed to load active balances:', err);
    } finally {
      setLoadingActive(false);
    }
  };

  // Re-trigger balance list on search change
  useEffect(() => {
    const timer = setTimeout(() => {
      if (activeTab === 'active-balances') {
        fetchActiveBalances();
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [searchBalancesQuery, activeTab]);

  // Fetch Bills list (Billing Workspace & Outstanding Payments share this data source)
  const fetchBills = async () => {
    try {
      setLoadingBills(true);
      const res = await api.get('/can-supply/bills', {
        params: {
          search: billsSearch,
          paymentStatus: billsPaymentStatus,
          startDate: billsStartDate,
          endDate: billsEndDate
        }
      });
      if (res.data.ok) {
        setBills(res.data.bills || []);
      }
    } catch (err) {
      console.error('Failed to load bills:', err);
    } finally {
      setLoadingBills(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'billing-workspace' || activeTab === 'outstanding-payments') {
      fetchBills();
    }
  }, [activeTab, billsPaymentStatus, billsStartDate, billsEndDate]);

  // Debounced search for bills
  useEffect(() => {
    const timer = setTimeout(() => {
      if (activeTab === 'billing-workspace' || activeTab === 'outstanding-payments') {
        fetchBills();
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [billsSearch]);

  // Customer Autocomplete Search handler
  const handleSearchChange = async (e) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (val.trim().length > 0) {
      try {
        const res = await api.get(`/can-supply/search-customer`, { params: { query: val } });
        if (res.data.ok) {
          setSearchResults(res.data.customers || []);
          setShowSuggestions(true);
        }
      } catch (err) {
        console.error('Customer search failed:', err);
      }
    } else {
      setSearchResults([]);
      setShowSuggestions(false);
    }
  };

  // Select Customer & load detailed workspace
  const handleSelectCustomer = async (customerId) => {
    setSelectedCustomerId(customerId);
    setShowSuggestions(false);
    setSearchQuery('');
    setSupplyError('');
    setSupplySuccess('');
    setReturnError('');
    setReturnSuccess('');
    setSelectedSupplyForReturn(null);
    setReturnForm({ returnedQty: '', notes: '' });

    try {
      setLoadingDetails(true);
      const res = await api.get(`/can-supply/customer/${customerId}/details`);
      if (res.data.ok) {
        setCustomerDetails(res.data);
        // Switch to workspace tab
        setActiveTab('workspace');
      }
    } catch (err) {
      console.error('Failed to fetch customer ledger details:', err);
      alert('Failed to load customer details.');
    } finally {
      setLoadingDetails(false);
    }
  };

  // Calculations for billing fields
  const calculateBilling = (form) => {
    const qty = parseInt(form.quantity, 10) || 0;
    const rate = parseFloat(form.rate) || 0;
    const waterAmount = form.product === '20 Ltr Can' ? qty * rate : 0;
    const rent = parseFloat(form.dispenserRent) || 0;
    const delivery = parseFloat(form.deliveryCharge) || 0;
    const other = parseFloat(form.otherCharge) || 0;
    const gstPct = parseFloat(form.gstPercentage) || 0;

    const subTotal = waterAmount + rent + delivery + other;
    const gstAmount = subTotal * (gstPct / 100);
    const grandTotal = subTotal + gstAmount;

    return {
      waterAmount,
      subTotal,
      gstAmount,
      grandTotal
    };
  };

  // Supply Submission handler
  const handleSupplySubmit = async (e) => {
    e.preventDefault();
    setSupplyError('');
    setSupplySuccess('');

    const qty = parseInt(supplyForm.quantity, 10);
    const rate = parseFloat(supplyForm.rate || 0);
    const dispenserRent = parseFloat(supplyForm.dispenserRent || 0);
    const deliveryCharge = parseFloat(supplyForm.deliveryCharge || 0);
    const otherCharge = parseFloat(supplyForm.otherCharge || 0);
    const gstPercentage = parseFloat(supplyForm.gstPercentage || 0);

    if (isNaN(qty) || qty <= 0) {
      setSupplyError('Quantity supplied must be a valid number greater than 0.');
      return;
    }
    if (isNaN(rate) || rate < 0) {
      setSupplyError('Rate cannot be negative.');
      return;
    }
    if (isNaN(dispenserRent) || dispenserRent < 0) {
      setSupplyError('Dispenser Rent cannot be negative.');
      return;
    }
    if (isNaN(deliveryCharge) || deliveryCharge < 0) {
      setSupplyError('Delivery Charge cannot be negative.');
      return;
    }
    if (isNaN(otherCharge) || otherCharge < 0) {
      setSupplyError('Other Charges cannot be negative.');
      return;
    }
    if (isNaN(gstPercentage) || gstPercentage < 0 || gstPercentage > 100) {
      setSupplyError('GST percentage must be between 0 and 100.');
      return;
    }

    if (supplyForm.supplyType === 'Function Can') {
      if (!supplyForm.functionName.trim()) {
        setSupplyError('Function Name is required for Function Can supply.');
        return;
      }
      if (!supplyForm.eventDate) {
        setSupplyError('Event Date is required for Function Can supply.');
        return;
      }
      if (!supplyForm.expectedReturnDate) {
        setSupplyError('Expected Return Date is required for Function Can supply.');
        return;
      }
    }

    try {
      setIsSavingSupply(true);
      const payload = {
        customerId: selectedCustomerId,
        transactionDate: new Date().toISOString().split('T')[0],
        supplyType: supplyForm.supplyType,
        product: supplyForm.product,
        quantity: qty,
        rate: rate,
        notes: supplyForm.notes,
        functionName: supplyForm.functionName,
        eventDate: supplyForm.eventDate,
        expectedReturnDate: supplyForm.expectedReturnDate,
        dispenserRent,
        deliveryCharge,
        otherCharge,
        gstPercentage
      };

      const res = await api.post('/can-supply', payload);
      if (res.data.ok) {
        setSupplySuccess('Supply logged and Bill generated successfully!');
        setSupplyForm({
          supplyType: 'Company Can',
          product: availableProducts.length > 0 ? availableProducts[0].name : '',
          quantity: '',
          rate: '0',
          notes: '',
          functionName: '',
          eventDate: '',
          expectedReturnDate: '',
          dispenserRent: '0',
          deliveryCharge: '0',
          otherCharge: '0',
          gstPercentage: '0'
        });
        // Refresh details & dashboard & active list
        handleSelectCustomer(selectedCustomerId);
        fetchDashboardStats();
        fetchActiveBalances();
      }
    } catch (err) {
      setSupplyError(err.response?.data?.error || err.message || 'Error logging supply entry.');
    } finally {
      setIsSavingSupply(false);
    }
  };

  // Open Return input field block
  const handleInitiateReturn = (supply) => {
    setSelectedSupplyForReturn(supply);
    setReturnForm({ returnedQty: '', notes: '' });
    setReturnError('');
    setReturnSuccess('');
    setWorkspaceSubTab('return');
  };

  // Return Submission handler
  const handleReturnSubmit = async (e) => {
    e.preventDefault();
    setReturnError('');
    setReturnSuccess('');

    const retQty = parseInt(returnForm.returnedQty, 10);
    if (isNaN(retQty) || retQty <= 0) {
      setReturnError('Returned quantity must be greater than 0.');
      return;
    }

    if (retQty > selectedSupplyForReturn.pendingQty) {
      setReturnError(`Validation Error: Returned quantity (${retQty}) cannot exceed pending quantity (${selectedSupplyForReturn.pendingQty}).`);
      return;
    }

    try {
      setIsSavingReturn(true);
      const payload = {
        customerId: selectedCustomerId,
        transactionDate: new Date().toISOString().split('T')[0],
        parentTransactionId: selectedSupplyForReturn.id,
        quantity: retQty,
        notes: returnForm.notes
      };

      const res = await api.post('/can-supply/return', payload);
      if (res.data.ok) {
        setReturnSuccess('Return logged successfully!');
        setReturnForm({ returnedQty: '', notes: '' });
        setSelectedSupplyForReturn(null);
        // Refresh details & dashboard & active list
        handleSelectCustomer(selectedCustomerId);
        fetchDashboardStats();
        fetchActiveBalances();
      }
    } catch (err) {
      setReturnError(err.response?.data?.error || err.message || 'Error logging return entry.');
    } finally {
      setIsSavingReturn(false);
    }
  };

  // Edit Bill handler
  const handleOpenEditBill = (bill) => {
    setEditingBill(bill);
    setEditForm({
      date: bill.date,
      qtySupplied: String(bill.qtySupplied),
      ratePerCan: String(bill.ratePerCan),
      dispenserRent: String(bill.dispenserRent),
      deliveryCharge: String(bill.deliveryCharge),
      otherCharge: String(bill.otherCharge),
      gstPercentage: String(bill.gstPercentage),
      remarks: bill.remarks || ''
    });
    setEditError('');
    setIsEditModalOpen(true);
  };

  const handleEditBillSubmit = async (e) => {
    e.preventDefault();
    setEditError('');
    const qty = parseInt(editForm.qtySupplied, 10);
    const rate = parseFloat(editForm.ratePerCan || 0);
    const dispenserRent = parseFloat(editForm.dispenserRent || 0);
    const deliveryCharge = parseFloat(editForm.deliveryCharge || 0);
    const otherCharge = parseFloat(editForm.otherCharge || 0);
    const gstPercentage = parseFloat(editForm.gstPercentage || 0);

    if (isNaN(qty) || qty <= 0) {
      setEditError('Quantity must be greater than 0.');
      return;
    }
    if (isNaN(rate) || rate < 0) {
      setEditError('Rate cannot be negative.');
      return;
    }
    if (isNaN(dispenserRent) || dispenserRent < 0) {
      setEditError('Dispenser Rent cannot be negative.');
      return;
    }
    if (isNaN(deliveryCharge) || deliveryCharge < 0) {
      setEditError('Delivery Charge cannot be negative.');
      return;
    }
    if (isNaN(otherCharge) || otherCharge < 0) {
      setEditError('Other Charge cannot be negative.');
      return;
    }
    if (isNaN(gstPercentage) || gstPercentage < 0 || gstPercentage > 100) {
      setEditError('GST Percentage must be between 0 and 100.');
      return;
    }

    try {
      setIsSavingEdit(true);
      const res = await api.put(`/can-supply/bill/${editingBill.id}`, {
        date: editForm.date,
        qtySupplied: qty,
        ratePerCan: rate,
        dispenserRent,
        deliveryCharge,
        otherCharge,
        gstPercentage,
        remarks: editForm.remarks
      });
      if (res.data.ok) {
        setIsEditModalOpen(false);
        fetchBills();
        fetchDashboardStats();
        if (selectedCustomerId) {
          handleSelectCustomer(selectedCustomerId);
        }
      }
    } catch (err) {
      setEditError(err.response?.data?.error || err.message || 'Error updating bill.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Delete Bill handler
  const handleDeleteBill = async (billId) => {
    if (!window.confirm('Are you sure you want to delete this bill? This will reverse all can supply transactions and customer ledger records linked to this bill.')) {
      return;
    }
    try {
      const res = await api.delete(`/can-supply/bill/${billId}`);
      if (res.data.ok) {
        fetchBills();
        fetchDashboardStats();
        if (selectedCustomerId) {
          handleSelectCustomer(selectedCustomerId);
        }
      }
    } catch (err) {
      alert(err.response?.data?.error || err.message || 'Failed to delete bill.');
    }
  };

  // Record Payment handlers
  const handleOpenPay = (bill) => {
    setPayingBill(bill);
    setPayForm({
      paymentDate: new Date().toISOString().split('T')[0],
      amountPaid: '',
      paymentMethod: 'Cash',
      remarks: ''
    });
    setPayError('');
    setIsPayModalOpen(true);
  };

  const handleRecordPaymentSubmit = async (e) => {
    e.preventDefault();
    setPayError('');
    const amt = parseFloat(payForm.amountPaid);
    const balance = payingBill.grandTotal - payingBill.amountPaid;

    if (isNaN(amt) || amt <= 0) {
      setPayError('Please enter a valid amount greater than 0.');
      return;
    }
    if (amt > balance) {
      setPayError(`Payment amount (₹${amt}) cannot exceed outstanding balance (₹${balance.toFixed(2)}).`);
      return;
    }

    try {
      setIsSavingPay(true);
      const res = await api.post(`/can-supply/bill/${payingBill.id}/pay`, {
        paymentDate: payForm.paymentDate,
        amountPaid: amt,
        paymentMethod: payForm.paymentMethod,
        remarks: payForm.remarks
      });
      if (res.data.ok) {
        setIsPayModalOpen(false);
        fetchBills();
        fetchDashboardStats();
        if (selectedCustomerId) {
          handleSelectCustomer(selectedCustomerId);
        }
      }
    } catch (err) {
      setPayError(err.response?.data?.error || err.message || 'Error recording payment.');
    } finally {
      setIsSavingPay(false);
    }
  };

  // View Payment History handlers
  const handleOpenPaymentHistory = async (bill) => {
    setHistoryBill(bill);
    setPaymentHistory([]);
    setIsPaymentHistoryModalOpen(true);
    setLoadingHistory(true);
    try {
      const res = await api.get(`/can-supply/bill/${bill.id}/payments`);
      if (res.data.ok) {
        setPaymentHistory(res.data.payments || []);
      }
    } catch (err) {
      console.error('Failed to load payment history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Printing can bill invoice
  const handlePrintCanBill = (bill) => {
    const comp = companyDetails || {
      company_name: "KEMP'S BEVERAGES",
      phone_number: "+91 98765 43210",
      gst_number: "27AAAAA0000A1Z5",
      address: "12, Industrial Area, Phase II, Mumbai, Maharashtra",
      bank_name: "State Bank of India",
      account_number: "1234567890",
      ifsc_code: "SBIN0001234"
    };

    api.get(`/can-supply/customer/${bill.customerId}/details`)
      .then(res => {
        const cust = res.data.ok ? res.data.customer : { name: bill.customerName, phone: '', address: '', gst: '' };
        openPrintWindow(bill, comp, cust);
      })
      .catch(() => {
        openPrintWindow(bill, comp, { name: bill.customerName, phone: '', address: '', gst: '' });
      });
  };

  const openPrintWindow = (bill, comp, cust) => {
    const printWindow = window.open('', '_blank');
    const totalQty = bill.qtySupplied;
    const rate = bill.ratePerCan;
    const waterAmount = bill.waterAmount;
    const subTotal = parseFloat(bill.waterAmount) + parseFloat(bill.dispenserRent) + parseFloat(bill.deliveryCharge) + parseFloat(bill.otherCharge);

    const html = `
      <html>
        <head>
          <title>Invoice - ${bill.billNo}</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; color: #1e293b; background-color: #fff; line-height: 1.5; }
            .invoice-card { max-width: 800px; margin: 0 auto; }
            .header-invoice { border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 25px; display: flex; justify-content: space-between; align-items: start; }
            .company-info h1 { font-size: 24px; font-weight: 800; color: #0f172a; margin: 0; text-transform: uppercase; letter-spacing: -0.025em; }
            .company-info p { font-size: 12px; color: #64748b; margin: 4px 0 0 0; }
            .invoice-title { text-align: right; }
            .invoice-title h2 { font-size: 20px; font-weight: 800; color: #059669; margin: 0; }
            .invoice-title p { font-size: 12px; color: #64748b; margin: 4px 0 0 0; }
            .meta-section { display: flex; justify-content: space-between; gap: 40px; margin-bottom: 30px; font-size: 12px; }
            .bill-party { flex: 1; border: 1px solid #f1f5f9; background-color: #fafbfd; padding: 15px; border-radius: 12px; }
            .bill-party h3 { font-size: 10px; font-weight: 800; text-transform: uppercase; color: #64748b; margin: 0 0 8px 0; letter-spacing: 0.05em; }
            .bill-party p { margin: 2px 0; color: #334155; }
            .bill-party strong { color: #0f172a; font-size: 13px; }
            .meta-details { text-align: right; font-size: 12px; line-height: 1.8; }
            .meta-details span { color: #64748b; }
            .meta-details strong { color: #0f172a; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
            th { background-color: #f8fafc; border-bottom: 2px solid #cbd5e1; color: #475569; font-weight: 700; text-transform: uppercase; padding: 12px; text-align: left; }
            td { border-bottom: 1px solid #e2e8f0; padding: 12px; color: #334155; }
            .text-right { text-align: right; }
            .amount { font-weight: 600; color: #0f172a; }
            .summary-container { display: flex; justify-content: space-between; margin-top: 30px; gap: 40px; }
            .bank-details { font-size: 11px; color: #64748b; border: 1px solid #e2e8f0; padding: 12px; border-radius: 8px; flex: 1; max-width: 350px; }
            .bank-details strong { color: #334155; display: block; margin-bottom: 4px; text-transform: uppercase; font-size: 10px; }
            .summary-box { width: 280px; font-size: 12px; line-height: 1.8; }
            .summary-row { display: flex; justify-content: space-between; padding: 3px 0; }
            .summary-row.grand { font-size: 14px; font-weight: 800; color: #0f172a; border-top: 2px solid #0f172a; border-bottom: 2px solid #0f172a; padding: 8px 0; margin-top: 8px; }
            .footer-note { text-align: center; margin-top: 50px; border-top: 1px solid #e2e8f0; padding-top: 15px; font-size: 11px; color: #94a3b8; }
            @media print {
              body { padding: 20px; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="invoice-card">
            <div class="header-invoice">
              <div class="company-info">
                <h1>${comp.company_name}</h1>
                <p>📍 ${comp.address || '—'}</p>
                <p>📞 Phone: ${comp.phone_number || '—'} ${comp.gst_number ? `| GSTIN: ${comp.gst_number}` : ''}</p>
              </div>
              <div class="invoice-title">
                <h2>TAX INVOICE</h2>
                <p>No: <strong>${bill.billNo}</strong></p>
                <p>Date: <strong>${formatDateDDMMYYYY(bill.date)}</strong></p>
              </div>
            </div>

            <div class="meta-section">
              <div class="bill-party">
                <h3>Billed To</h3>
                <p><strong>${cust.name}</strong></p>
                ${cust.phone ? `<p>📞 Phone: ${cust.phone}</p>` : ''}
                ${cust.gst ? `<p>📄 GSTIN: ${cust.gst}</p>` : ''}
                ${cust.address ? `<p>📍 Address: ${cust.address}</p>` : ''}
              </div>
              <div class="meta-details">
                <div style="background-color: #f1f5f9; padding: 8px 12px; border-radius: 6px; display: inline-block; font-weight: 800; font-size: 11px; text-transform: uppercase; color: ${bill.paymentStatus === 'Paid' ? '#047857' : bill.paymentStatus === 'Partially Paid' ? '#b45309' : '#b91c1c'}">
                  Payment Status: ${bill.paymentStatus}
                </div>
                <p style="margin-top: 10px;">Outstanding Balance: <strong>₹${(bill.grandTotal - bill.amountPaid).toFixed(2)}</strong></p>
              </div>
            </div>

            <table>
              <thead>
                <tr>
                  <th>Description</th>
                  <th class="text-right">Qty</th>
                  <th class="text-right">Rate</th>
                  <th class="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Water Supply (20 Ltr Can)</td>
                  <td class="text-right">${totalQty}</td>
                  <td class="text-right">₹${rate.toFixed(2)}</td>
                  <td class="text-right amount">₹${waterAmount.toFixed(2)}</td>
                </tr>
                ${parseFloat(bill.dispenserRent) > 0 ? `
                <tr>
                  <td>Dispenser Rent</td>
                  <td class="text-right">1</td>
                  <td class="text-right">₹${parseFloat(bill.dispenserRent).toFixed(2)}</td>
                  <td class="text-right amount">₹${parseFloat(bill.dispenserRent).toFixed(2)}</td>
                </tr>` : ''}
                ${parseFloat(bill.deliveryCharge) > 0 ? `
                <tr>
                  <td>Delivery Charges</td>
                  <td class="text-right">1</td>
                  <td class="text-right">₹${parseFloat(bill.deliveryCharge).toFixed(2)}</td>
                  <td class="text-right amount">₹${parseFloat(bill.deliveryCharge).toFixed(2)}</td>
                </tr>` : ''}
                ${parseFloat(bill.otherCharge) > 0 ? `
                <tr>
                  <td>Other Charges</td>
                  <td class="text-right">1</td>
                  <td class="text-right">₹${parseFloat(bill.otherCharge).toFixed(2)}</td>
                  <td class="text-right amount">₹${parseFloat(bill.otherCharge).toFixed(2)}</td>
                </tr>` : ''}
              </tbody>
            </table>

            <div class="summary-container">
              <div class="bank-details">
                <strong>Bank details for payment</strong>
                <p>Bank Name: ${comp.bank_name || '—'}</p>
                <p>A/c Number: ${comp.account_number || '—'}</p>
                <p>IFSC Code: ${comp.ifsc_code || '—'}</p>
              </div>
              <div class="summary-box">
                <div class="summary-row"><span>Sub Total:</span> <span class="amount">₹${subTotal.toFixed(2)}</span></div>
                <div class="summary-row"><span>GST (${bill.gstPercentage}%):</span> <span class="amount">₹${parseFloat(bill.gstAmount).toFixed(2)}</span></div>
                <div class="summary-row grand"><span>Grand Total:</span> <span class="amount">₹${parseFloat(bill.grandTotal).toFixed(2)}</span></div>
                <div class="summary-row" style="color: #047857;"><span>Amount Paid:</span> <span class="amount">₹${parseFloat(bill.amountPaid).toFixed(2)}</span></div>
                <div class="summary-row" style="border-top: 1px dashed #cbd5e1; font-weight: bold; margin-top: 4px; padding-top: 4px;"><span>Balance Due:</span> <span class="amount">₹${(bill.grandTotal - bill.amountPaid).toFixed(2)}</span></div>
              </div>
            </div>

            ${bill.remarks ? `
            <div style="margin-top: 30px; font-size: 11px; color: #64748b; border-left: 2px solid #cbd5e1; padding-left: 10px;">
              <strong>Remarks:</strong> ${bill.remarks}
            </div>` : ''}

            <div class="footer-note">
              <p>Thank you for your business!</p>
              <p style="font-size: 9px; margin-top: 5px;">This is a computer-generated invoice and does not require a signature.</p>
            </div>
          </div>
          <script>
            window.onload = function() {
              window.print();
              window.onafterprint = function() { window.close(); };
            }
          </script>
        </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const formatDateDDMMYYYY = (dateStr) => {
    if (!dateStr) return '—';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  // Run Report query
  const fetchReport = async () => {
    try {
      setLoadingReports(true);
      setReportSummary(null);
      const res = await api.get('/can-supply/reports', {
        params: {
          reportType,
          startDate: reportStartDate,
          endDate: reportEndDate
        }
      });
      if (res.data.ok) {
        setReportData(res.data.data || []);
        if (res.data.summary) {
          setReportSummary(res.data.summary);
        }
      }
    } catch (err) {
      console.error('Failed to generate report:', err);
      alert('Error fetching report data.');
    } finally {
      setLoadingReports(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'reports') {
      fetchReport();
    }
  }, [reportType, reportStartDate, reportEndDate, activeTab]);

  const downloadCSV = (data, filename) => {
    if (!data || data.length === 0) return;
    const headers = Object.keys(data[0]);
    const csvRows = [];
    csvRows.push(headers.join(','));
    for (const row of data) {
      const values = headers.map(header => {
        const val = row[header];
        const escaped = String(val === null || val === undefined ? '' : val).replace(/"/g, '""');
        return `"${escaped}"`;
      });
      csvRows.push(values.join(','));
    }
    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadReportCSV = () => {
    if (!reportData || reportData.length === 0) {
      alert('No data available to download. Please compile the report first.');
      return;
    }
    const filename = `${reportType}_Report_${new Date().toISOString().split('T')[0]}.csv`;
    downloadCSV(reportData, filename);
  };

  const handleDownloadLedgerCSV = () => {
    if (!customerDetails || !customerDetails.ledger || customerDetails.ledger.length === 0) {
      alert('No ledger history available to download.');
      return;
    }
    const filename = `${customerDetails.customer.name}_Ledger_${new Date().toISOString().split('T')[0]}.csv`;
    const formattedData = customerDetails.ledger.map(row => {
      const q = parseInt(row.quantity, 10);
      const isCan = row.product === '20 Ltr Can';
      let cansQtyStr = '';
      if (isCan) {
        if (row.type === 'SUPPLY') cansQtyStr = `+${q}`;
        else if (row.type === 'RETURN') cansQtyStr = `-${q}`;
      }
      return {
        Date: row.date,
        Type: row.type,
        'Reference No': row.referenceNo || '',
        'Cans Qty': cansQtyStr,
        'Debit (INR)': row.debit || 0,
        'Credit (INR)': row.credit || 0,
        'Running Can Balance': row.runningCanBalance,
        'Running Financial Balance (INR)': row.runningFinancialBalance,
        User: row.user
      };
    });
    downloadCSV(formattedData, filename);
  };

  // Actions routing helpers
  const handleQuickAction = (customerId, targetSubTab) => {
    handleSelectCustomer(customerId).then(() => {
      setWorkspaceSubTab(targetSubTab);
    });
  };

  const handleCanBilling = (item) => {
    const preloadItems = [];
    const pendingCans = (parseInt(item.cansOutCompany) || 0) + 
                        (parseInt(item.cansOutDistributor) || 0) + 
                        (parseInt(item.cansOutFunction) || 0);
    const pendingDispensers = parseInt(item.dispensersOut) || 0;

    if (pendingCans > 0) {
      preloadItems.push({
        product: '20 Ltr Can',
        quantity: pendingCans
      });
    }
    if (pendingDispensers > 0) {
      preloadItems.push({
        product: 'Dispenser',
        quantity: pendingDispensers
      });
    }

    navigate('/billing-form', {
      state: {
        preloadCanSupply: {
          customer: {
            id: item.id,
            name: item.name,
            phone: item.phone,
            gst: item.gst || '',
            address: item.address || '',
            customerType: item.customerType || 'General Customer'
          },
          items: preloadItems
        }
      }
    });
  };

  const handleCanBillingFromWorkspace = () => {
    if (!customerDetails) return;
    const item = {
      id: customerDetails.customer.id,
      name: customerDetails.customer.name,
      phone: customerDetails.customer.phone,
      gst: customerDetails.customer.gst || '',
      address: customerDetails.customer.address || '',
      customerType: customerDetails.customer.customerType || 'General Customer',
      cansOutCompany: customerDetails.balances.cansOutCompany,
      cansOutDistributor: customerDetails.balances.cansOutDistributor,
      cansOutFunction: customerDetails.balances.cansOutFunction,
      dispensersOut: customerDetails.balances.dispensersOut
    };
    handleCanBilling(item);
  };

  const handleOpenNewSupplyModal = () => {
    setModalSearchQuery('');
    setModalSearchResults([]);
    setShowModalSuggestions(false);
    setModalSelectedCustomerId(null);
    setModalSelectedCustomer(null);
    setModalSupplyForm({
      supplyType: 'Company Can',
      product: availableProducts.length > 0 ? availableProducts[0].name : '',
      quantity: '',
      rate: '0',
      notes: '',
      functionName: '',
      eventDate: '',
      expectedReturnDate: '',
      dispenserRent: '0',
      deliveryCharge: '0',
      otherCharge: '0',
      gstPercentage: '0'
    });
    setModalSupplyError('');
    setModalSupplySuccess('');
    setIsNewSupplyModalOpen(true);
  };

  const handleModalSearchChange = async (e) => {
    const val = e.target.value;
    setModalSearchQuery(val);
    if (val.trim().length > 0) {
      try {
        const res = await api.get(`/can-supply/search-customer`, { params: { query: val } });
        if (res.data.ok) {
          setModalSearchResults(res.data.customers || []);
          setShowModalSuggestions(true);
        }
      } catch (err) {
        console.error('Modal customer search failed:', err);
      }
    } else {
      setModalSearchResults([]);
      setShowModalSuggestions(false);
    }
  };

  const handleSelectModalCustomer = (cust) => {
    setModalSelectedCustomerId(cust.id);
    setModalSelectedCustomer(cust);
    setShowModalSuggestions(false);
    setModalSearchQuery('');
  };

  const handleModalSupplySubmit = async (e) => {
    e.preventDefault();
    setModalSupplyError('');
    setModalSupplySuccess('');

    if (!modalSelectedCustomerId) {
      setModalSupplyError('Please select a customer first.');
      return;
    }

    const qty = parseInt(modalSupplyForm.quantity, 10);
    const rate = parseFloat(modalSupplyForm.rate || 0);
    const dispenserRent = parseFloat(modalSupplyForm.dispenserRent || 0);
    const deliveryCharge = parseFloat(modalSupplyForm.deliveryCharge || 0);
    const otherCharge = parseFloat(modalSupplyForm.otherCharge || 0);
    const gstPercentage = parseFloat(modalSupplyForm.gstPercentage || 0);

    if (isNaN(qty) || qty <= 0) {
      setModalSupplyError('Quantity supplied must be a valid number greater than 0.');
      return;
    }
    if (isNaN(rate) || rate < 0) {
      setModalSupplyError('Rate cannot be negative.');
      return;
    }
    if (isNaN(dispenserRent) || dispenserRent < 0) {
      setModalSupplyError('Dispenser Rent cannot be negative.');
      return;
    }
    if (isNaN(deliveryCharge) || deliveryCharge < 0) {
      setModalSupplyError('Delivery Charge cannot be negative.');
      return;
    }
    if (isNaN(otherCharge) || otherCharge < 0) {
      setModalSupplyError('Other Charge cannot be negative.');
      return;
    }
    if (isNaN(gstPercentage) || gstPercentage < 0 || gstPercentage > 100) {
      setModalSupplyError('GST percentage must be between 0 and 100.');
      return;
    }

    if (modalSupplyForm.supplyType === 'Function Can') {
      if (!modalSupplyForm.functionName.trim()) {
        setModalSupplyError('Function Name is required for Function Can supply.');
        return;
      }
      if (!modalSupplyForm.eventDate) {
        setModalSupplyError('Event Date is required for Function Can supply.');
        return;
      }
      if (!modalSupplyForm.expectedReturnDate) {
        setModalSupplyError('Expected Return Date is required for Function Can supply.');
        return;
      }
    }

    try {
      setIsSavingModalSupply(true);
      const payload = {
        customerId: modalSelectedCustomerId,
        transactionDate: new Date().toISOString().split('T')[0],
        supplyType: modalSupplyForm.supplyType,
        product: modalSupplyForm.product,
        quantity: qty,
        rate: rate,
        notes: modalSupplyForm.notes,
        functionName: modalSupplyForm.functionName,
        eventDate: modalSupplyForm.eventDate,
        expectedReturnDate: modalSupplyForm.expectedReturnDate,
        dispenserRent,
        deliveryCharge,
        otherCharge,
        gstPercentage
      };

      const res = await api.post('/can-supply', payload);
      if (res.data.ok) {
        setModalSupplySuccess('Supply logged and Bill generated successfully!');
        setModalSupplyForm({
          supplyType: 'Company Can',
          product: availableProducts.length > 0 ? availableProducts[0].name : '',
          quantity: '',
          rate: '0',
          notes: '',
          functionName: '',
          eventDate: '',
          expectedReturnDate: '',
          dispenserRent: '0',
          deliveryCharge: '0',
          otherCharge: '0',
          gstPercentage: '0'
        });
        setModalSelectedCustomerId(null);
        setModalSelectedCustomer(null);
        
        // Refresh details, active balances & dashboard
        fetchDashboardStats();
        fetchActiveBalances();
        if (selectedCustomerId === modalSelectedCustomerId) {
          handleSelectCustomer(selectedCustomerId);
        }
        
        // Close modal after brief delay
        setTimeout(() => {
          setIsNewSupplyModalOpen(false);
          setModalSupplySuccess('');
        }, 1000);
      }
    } catch (err) {
      setModalSupplyError(err.response?.data?.error || err.message || 'Error logging supply entry.');
    } finally {
      setIsSavingModalSupply(false);
    }
  };

  const calculatedSupply = calculateBilling(supplyForm);
  const calculatedModalSupply = calculateBilling(modalSupplyForm);
  const calculatedEditSupply = editingBill ? calculateBilling({
    quantity: editForm.qtySupplied,
    rate: editForm.ratePerCan,
    product: editingBill.qtySupplied > 0 ? '20 Ltr Can' : 'Dispenser', // check if rate exists
    dispenserRent: editForm.dispenserRent,
    deliveryCharge: editForm.deliveryCharge,
    otherCharge: editForm.otherCharge,
    gstPercentage: editForm.gstPercentage
  }) : { waterAmount: 0, subTotal: 0, gstAmount: 0, grandTotal: 0 };

  return (
    <div className="space-y-6 animate-fade-in max-w-6xl mx-auto pb-12">

      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase">Can Management System</h1>
          <p className="text-slate-500 text-sm font-medium mt-1">Manage, supply, bill, and track return cycles for water cans and dispensers</p>
        </div>

        <div className="flex flex-wrap items-center gap-3 self-end md:self-center">
          <button 
            type="button"
            onClick={handleOpenNewSupplyModal}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md shadow-emerald-100 flex items-center gap-1.5 h-10"
          >
            <span>+</span> Can Supply & Billing Entry
          </button>

          {/* Tab Selection */}
          <div className="flex bg-slate-100 p-1 rounded-xl w-fit border border-slate-200/40">
            <button
              type="button"
              onClick={() => setActiveTab('active-balances')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black tracking-wider transition-all uppercase ${activeTab === 'active-balances'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
                }`}
            >
              📋 Balances
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('workspace')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black tracking-wider transition-all uppercase ${activeTab === 'workspace'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
                }`}
            >
              🚚 Workspace
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('billing-workspace')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black tracking-wider transition-all uppercase ${activeTab === 'billing-workspace'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
                }`}
            >
              💵 Bills
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('outstanding-payments')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black tracking-wider transition-all uppercase ${activeTab === 'outstanding-payments'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
                }`}
            >
              💳 Payments
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('reports')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black tracking-wider transition-all uppercase ${activeTab === 'reports'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
                }`}
            >
              📈 Reports
            </button>
          </div>
        </div>
      </div>

      {/* DASHBOARD STATISTICS CARDS - ROW 1: INVENTORY & RETURNS */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="card-premium flex items-center justify-between p-4 bg-white">
          <div>
            <p className="text-[10px] font-black text-slate-450 uppercase tracking-widest">Company Cans Out</p>
            <h3 className="text-xl font-extrabold text-indigo-600 mt-1">
              {loadingDashboard ? '...' : stats.companyCansOut}
            </h3>
          </div>
          <div className="text-xl">🥤</div>
        </div>

        <div className="card-premium flex items-center justify-between p-4 bg-white">
          <div>
            <p className="text-[10px] font-black text-slate-450 uppercase tracking-widest">Distributor Cans Out</p>
            <h3 className="text-xl font-extrabold text-amber-600 mt-1">
              {loadingDashboard ? '...' : stats.distributorCansOut}
            </h3>
          </div>
          <div className="text-xl">🏬</div>
        </div>

        <div className="card-premium flex items-center justify-between p-4 bg-white">
          <div>
            <p className="text-[10px] font-black text-slate-450 uppercase tracking-widest">Function Cans Out</p>
            <h3 className="text-xl font-extrabold text-emerald-600 mt-1">
              {loadingDashboard ? '...' : stats.functionCansOut}
            </h3>
          </div>
          <div className="text-xl">🎪</div>
        </div>

        <div className="card-premium flex items-center justify-between p-4 bg-white">
          <div>
            <p className="text-[10px] font-black text-slate-450 uppercase tracking-widest">Dispensers Out</p>
            <h3 className="text-xl font-extrabold text-rose-500 mt-1">
              {loadingDashboard ? '...' : stats.dispensersOut}
            </h3>
          </div>
          <div className="text-xl">💧</div>
        </div>

        <div className="card-premium flex items-center justify-between p-4 bg-slate-900 text-white">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pending Returns</p>
            <h3 className="text-xl font-black text-primary mt-1">
              {loadingDashboard ? '...' : stats.totalPendingReturns}
            </h3>
          </div>
          <div className="text-xl">⏰</div>
        </div>
      </div>

      {/* DASHBOARD STATISTICS CARDS - ROW 2: REVENUE & BILLING */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="card-premium flex items-center justify-between p-4 bg-white">
          <div>
            <p className="text-[10px] font-black text-slate-450 uppercase tracking-widest">Today's Revenue</p>
            <h3 className="text-lg font-extrabold text-emerald-605 mt-1 text-emerald-600">
              {loadingDashboard ? '...' : `₹${billingStats.todayRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
            </h3>
            <p className="text-[9px] text-slate-400 mt-0.5">{billingStats.todayCans} Cans Supplied</p>
          </div>
          <div className="text-xl">💰</div>
        </div>

        <div className="card-premium flex items-center justify-between p-4 bg-white">
          <div>
            <p className="text-[10px] font-black text-slate-450 uppercase tracking-widest">Weekly Revenue</p>
            <h3 className="text-lg font-extrabold text-indigo-600 mt-1">
              {loadingDashboard ? '...' : `₹${billingStats.weeklyRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
            </h3>
            <p className="text-[9px] text-slate-400 mt-0.5">{billingStats.weeklyCans} Cans Supplied</p>
          </div>
          <div className="text-xl">📅</div>
        </div>

        <div className="card-premium flex items-center justify-between p-4 bg-white">
          <div>
            <p className="text-[10px] font-black text-slate-450 uppercase tracking-widest">Monthly Revenue</p>
            <h3 className="text-lg font-extrabold text-purple-600 mt-1">
              {loadingDashboard ? '...' : `₹${billingStats.monthlyRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
            </h3>
            <p className="text-[9px] text-slate-400 mt-0.5">{billingStats.monthlyCans} Cans Supplied</p>
          </div>
          <div className="text-xl">📊</div>
        </div>

        <div className="card-premium flex items-center justify-between p-4 bg-white">
          <div>
            <p className="text-[10px] font-black text-slate-450 uppercase tracking-widest">Yearly Revenue</p>
            <h3 className="text-lg font-extrabold text-amber-600 mt-1">
              {loadingDashboard ? '...' : `₹${billingStats.yearlyRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
            </h3>
            <p className="text-[9px] text-slate-400 mt-0.5">{billingStats.yearlyCans} Cans Supplied</p>
          </div>
          <div className="text-xl">📈</div>
        </div>

        <div className="card-premium flex items-center justify-between p-4 bg-rose-900 text-white">
          <div>
            <p className="text-[10px] font-black text-rose-200 uppercase tracking-widest">Pending Payments</p>
            <h3 className="text-lg font-black text-white mt-1">
              {loadingDashboard ? '...' : `₹${billingStats.pendingPayments.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
            </h3>
            <p className="text-[9px] text-rose-200 mt-0.5">{billingStats.outstandingCans} Cans Out</p>
          </div>
          <div className="text-xl">💳</div>
        </div>
      </div>

      {/* OVERDUE RETURNS ALERT AREA */}
      {overdueList.length > 0 && (
        <div className="bg-rose-50 border border-rose-200/60 p-4 rounded-2xl">
          <div className="flex items-center gap-2 text-rose-800 font-black text-sm uppercase tracking-wider mb-2">
            <span>⚠️ Overdue Function Returns ({overdueList.length})</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {overdueList.map((item) => (
              <div key={item.id} className="bg-white border border-rose-100 p-3 rounded-xl shadow-sm space-y-1 text-xs">
                <div className="flex justify-between font-bold text-slate-800">
                  <span className="truncate">{item.customerName}</span>
                  <span className="text-rose-600">{item.pendingQty} Cans</span>
                </div>
                <div className="text-[10px] text-slate-500">Event: <b>{item.functionName}</b></div>
                <div className="flex justify-between items-center pt-1.5 border-t border-slate-50 mt-1 text-[10px]">
                  <span className="text-slate-400">Due: {item.expectedReturnDate}</span>
                  <button
                    onClick={() => handleQuickAction(item.customerName, 'return')}
                    className="text-rose-600 hover:text-rose-800 font-extrabold"
                  >
                    Return Goods ➔
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* VIEW 1: ACTIVE OUTSTANDING BALANCES LISTING */}
      {activeTab === 'active-balances' && (
        <div className="card-premium bg-white space-y-6">
          
          {/* Quick Search Helper for 0-balance customers */}
          <div className="pb-6 border-b border-slate-100">
            <h4 className="text-[11px] font-black text-slate-450 uppercase tracking-wider mb-2">Search Registry for customer (including 0 balances)</h4>
            <div className="relative max-w-md" ref={suggestionsRef}>
              <input
                type="text"
                placeholder="Type name or phone to start new supply..."
                value={searchQuery}
                onChange={handleSearchChange}
                className="input-premium h-11 w-full border-2 border-blue-500 focus:border-blue-600 focus:ring-4 focus:ring-blue-100 text-blue-900 placeholder:text-blue-300 font-bold outline-none"
                style={{ borderColor: '#3b82f6' }}
              />
              {showSuggestions && searchResults.length > 0 && (
                <ul className="absolute z-50 w-full bg-white border border-slate-200 rounded-xl mt-1.5 shadow-lg max-h-48 overflow-y-auto divide-y divide-slate-100">
                  {searchResults.map((cust) => (
                    <li
                      key={cust.id}
                      onClick={() => handleSelectCustomer(cust.id)}
                      className="px-4 py-2.5 hover:bg-slate-50 cursor-pointer flex justify-between items-center text-xs font-bold text-slate-750"
                    >
                      <div>
                        <div>{cust.name}</div>
                        <div className="text-[10px] text-slate-400 font-medium">{cust.phone}</div>
                      </div>
                      <span className="text-[10px] uppercase bg-slate-100 text-slate-500 rounded px-1.5 py-0.5">{cust.customerType}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
              <input
                type="text"
                placeholder="Search outstanding accounts..."
                value={searchBalancesQuery}
                onChange={(e) => setSearchBalancesQuery(e.target.value)}
                className="input-premium pl-11 h-10 w-full"
              />
            </div>
            <div className="text-[11px] font-black text-slate-440 uppercase tracking-widest bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
              {activeBalances.length} Active Accounts
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-100">
            <table className="table table-zebra w-full text-xs font-semibold text-slate-700">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr className="text-slate-500 text-[10px] font-black uppercase tracking-wider">
                  <th className="py-4 px-6 text-left">Customer</th>
                  <th className="py-4 px-6 text-left">Type</th>
                  <th className="py-4 px-6 text-center">Company Cans</th>
                  <th className="py-4 px-6 text-center">Distributor Cans</th>
                  <th className="py-4 px-6 text-center">Function Cans</th>
                  <th className="py-4 px-6 text-center">Dispensers</th>
                  <th className="py-4 px-6 text-left">Last Transaction</th>
                  <th className="py-4 px-6 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-55">
                {loadingActive ? (
                  <tr>
                    <td colSpan="8" className="py-20 text-center">
                      <span className="loading loading-spinner text-primary block mx-auto mb-2"></span>
                      Fetching active balances...
                    </td>
                  </tr>
                ) : activeBalances.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="py-16 text-center text-slate-400 italic font-medium">
                      No active balances found. Enter a customer name in the search bar above to start new supply.
                    </td>
                  </tr>
                ) : (
                  activeBalances.map((item) => {
                    return (
                      <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-4 px-6">
                          <div className="font-extrabold text-slate-800">{item.name}</div>
                          <div className="text-[10px] font-bold text-slate-400 mt-0.5">{item.phone}</div>
                        </td>
                        <td className="py-4 px-6">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold border ${item.customerType === 'Distributor'
                            ? 'bg-amber-50 border-amber-100 text-amber-600'
                            : item.customerType === 'Function Customer'
                              ? 'bg-indigo-50 border-indigo-100 text-indigo-600'
                              : 'bg-slate-50 border-slate-200 text-slate-650'
                            }`}>
                            {item.customerType || 'General Customer'}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-center font-extrabold text-indigo-600">
                          {item.cansOutCompany > 0 ? item.cansOutCompany : '—'}
                        </td>
                        <td className="py-4 px-6 text-center font-extrabold text-amber-600">
                          {item.cansOutDistributor > 0 ? item.cansOutDistributor : '—'}
                        </td>
                        <td className="py-4 px-6 text-center font-extrabold text-emerald-600">
                          {item.cansOutFunction > 0 ? item.cansOutFunction : '—'}
                        </td>
                        <td className="py-4 px-6 text-center font-extrabold text-rose-500">
                          {item.dispensersOut > 0 ? item.dispensersOut : '—'}
                        </td>
                        <td className="py-4 px-6 text-slate-450">{item.lastTransaction || '—'}</td>
                        <td className="py-4 px-6">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleQuickAction(item.id, 'supply')}
                              className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 font-bold transition-all text-[11px]"
                            >
                              🚚 Supply
                            </button>
                            <button
                              onClick={() => handleQuickAction(item.id, 'return')}
                              className="px-2 py-1 rounded bg-rose-50 text-rose-600 hover:bg-rose-100 font-bold transition-all text-[11px]"
                            >
                              ↩ Return
                            </button>
                            <button
                              onClick={() => handleQuickAction(item.id, 'ledger')}
                              className="px-2 py-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 font-bold transition-all text-[11px]"
                            >
                              📜 History
                            </button>
                            <button
                              onClick={() => handleCanBilling(item)}
                              className="px-2 py-1 rounded bg-emerald-50 text-emerald-600 hover:bg-emerald-100 font-bold transition-all text-[11px]"
                            >
                              💵 Can Billing
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
        </div>
      )}

      {/* VIEW 2: SUPPLY / RETURN WORKSPACE */}
      {activeTab === 'workspace' && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">

          {/* LEFT COLUMN: Customer Selection & General Profile */}
          <div className="md:col-span-4 space-y-6">
            <div className="card-premium bg-white p-5 space-y-4">
              <div className="text-[11px] font-black text-slate-450 uppercase tracking-widest border-b border-slate-100 pb-2.5">
                👤 Selected Customer
              </div>

              {/* Customer Selector autocomplete */}
              <div className="relative" ref={suggestionsRef}>
                <input
                  type="text"
                  placeholder="Change customer..."
                  value={searchQuery}
                  onChange={handleSearchChange}
                  className="input-premium h-10 w-full"
                />
                {showSuggestions && searchResults.length > 0 && (
                  <ul className="absolute z-50 w-full bg-white border border-slate-200 rounded-xl mt-1.5 shadow-lg max-h-48 overflow-y-auto divide-y divide-slate-100">
                    {searchResults.map((cust) => (
                      <li
                        key={cust.id}
                        onClick={() => handleSelectCustomer(cust.id)}
                        className="px-4 py-2 hover:bg-slate-50 cursor-pointer flex justify-between items-center text-xs font-bold text-slate-700"
                      >
                        <div>
                          <div>{cust.name}</div>
                          <div className="text-[10px] text-slate-400 font-medium">{cust.phone}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Selected profile display */}
              {loadingDetails ? (
                <div className="py-8 text-center text-slate-400 text-xs">
                  <span className="loading loading-spinner text-primary"></span>
                  <p className="mt-1">Loading customer profile...</p>
                </div>
              ) : customerDetails ? (
                <div className="space-y-3.5 text-xs text-slate-600 font-semibold font-mono">
                  <div>
                    <h4 className="text-[13px] font-extrabold text-slate-800">{customerDetails.customer.name}</h4>
                    <p className="text-[10px] text-slate-400">{customerDetails.customer.id} | {customerDetails.customer.customerType}</p>
                  </div>
                  <div className="space-y-1">
                    <div>📞 {customerDetails.customer.phone}</div>
                    {customerDetails.customer.alternatePhone && <div>📱 Alt: {customerDetails.customer.alternatePhone}</div>}
                    {customerDetails.customer.gst && <div>📄 GST: {customerDetails.customer.gst}</div>}
                    {customerDetails.customer.address && <div className="text-slate-400 font-normal leading-relaxed mt-1">📍 {customerDetails.customer.address}</div>}
                  </div>

                  {/* Customer current balances */}
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100/50 space-y-2 mt-4">
                    <div className="text-[10px] font-black text-slate-455 uppercase tracking-wider">Live Inventory Balance</div>
                    <div className="flex justify-between items-center text-slate-850 font-bold">
                      <span>Company Cans:</span>
                      <span className="text-indigo-600 font-black">{customerDetails.balances.cansOutCompany} Cans</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-850 font-bold">
                      <span>Distributor Cans:</span>
                      <span className="text-amber-600 font-black">{customerDetails.balances.cansOutDistributor} Cans</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-850 font-bold">
                      <span>Function Cans:</span>
                      <span className="text-emerald-600 font-black">{customerDetails.balances.cansOutFunction} Cans</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-850 font-bold pt-1.5 border-t border-slate-200/40">
                      <span>Water Dispensers:</span>
                      <span className="text-rose-500 font-black">{customerDetails.balances.dispensersOut} Qty</span>
                    </div>
                    {((parseInt(customerDetails.balances.cansOutCompany) || 0) + 
                      (parseInt(customerDetails.balances.cansOutDistributor) || 0) + 
                      (parseInt(customerDetails.balances.cansOutFunction) || 0) + 
                      (parseInt(customerDetails.balances.dispensersOut) || 0)) > 0 && (
                      <div className="pt-3 border-t border-slate-200/40 mt-1">
                        <button
                          type="button"
                          onClick={handleCanBillingFromWorkspace}
                          className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 shadow-md shadow-emerald-150"
                        >
                          💵 Generate Can Bill
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Financial customer ledger details */}
                  {customerDetails.customerSummary && (
                    <div className="bg-blue-50/40 p-4 rounded-xl border border-blue-100/40 space-y-2 mt-3 text-xs">
                      <div className="text-[10px] font-black text-blue-500 uppercase tracking-wider">Ledger Financial Summary</div>
                      <div className="flex justify-between items-center text-slate-805 font-bold">
                        <span>Total Revenue:</span>
                        <span className="text-slate-800 font-extrabold">₹{customerDetails.customerSummary.totalRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between items-center text-slate-805 font-bold">
                        <span>Total Bills:</span>
                        <span className="text-slate-800 font-extrabold">{customerDetails.customerSummary.totalBills} Bills</span>
                      </div>
                      <div className="flex justify-between items-center text-slate-805 font-bold pt-1.5 border-t border-slate-200/40">
                        <span>Outstanding Bal:</span>
                        <span className="text-rose-600 font-black">₹{customerDetails.customerSummary.outstandingAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1 font-medium font-sans">Last Supply Date: {customerDetails.customerSummary.lastSupplyDate}</div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-slate-50 border border-dashed border-slate-200 text-slate-400 py-12 rounded-2xl text-center text-xs">
                  Please search and select a customer to start work.
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN: Supply Details, Return Details, and Ledger Ledger */}
          <div className="md:col-span-8 space-y-6">
            {customerDetails && (
              <div className="card-premium bg-white p-6">

                {/* Sub Tab Navigation */}
                <div className="flex border-b border-slate-100 pb-4 mb-6 gap-2">
                  <button
                    onClick={() => setWorkspaceSubTab('supply')}
                    className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${workspaceSubTab === 'supply'
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                      }`}
                  >
                    📦 Issue & Supply
                  </button>
                  <button
                    onClick={() => setWorkspaceSubTab('return')}
                    className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${workspaceSubTab === 'return'
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                      }`}
                  >
                    ↩ Return Goods
                  </button>
                  <button
                    onClick={() => setWorkspaceSubTab('ledger')}
                    className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${workspaceSubTab === 'ledger'
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                      }`}
                  >
                    📜 Customer Ledger
                  </button>
                </div>

                {/* Sub Tab 1: Supply Entry Section */}
                {workspaceSubTab === 'supply' && (
                  <form onSubmit={handleSupplySubmit} className="space-y-6 animate-fade-in">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="label-premium">Supply Category *</label>
                        <select
                          value={supplyForm.supplyType}
                          onChange={(e) => setSupplyForm(prev => ({ ...prev, supplyType: e.target.value }))}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3.5 h-11 text-sm font-semibold outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all"
                        >
                          <option value="Company Can">Company Can</option>
                          <option value="Distributor Can">Distributor Can</option>
                          <option value="Function Can">Function Can</option>
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="label-premium">Product *</label>
                        <select
                          value={supplyForm.product}
                          onChange={(e) => setSupplyForm(prev => ({ ...prev, product: e.target.value }))}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3.5 h-11 text-sm font-semibold outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all"
                          disabled={availableProducts.length === 0}
                        >
                          {availableProducts.length === 0 ? (
                            <option value="">No Active Cans/Dispensers</option>
                          ) : (
                            availableProducts.map(p => (
                              <option key={p.id} value={p.name}>{p.name}</option>
                            ))
                          )}
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="label-premium">Quantity supplied *</label>
                        <input
                          type="number"
                          placeholder="e.g. 50"
                          value={supplyForm.quantity}
                          onChange={(e) => setSupplyForm(prev => ({ ...prev, quantity: e.target.value }))}
                          className="input-premium w-full h-11"
                          required
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="label-premium">Rate per can (Water Only)</label>
                        <input
                          type="number"
                          step="any"
                          placeholder="0"
                          value={supplyForm.rate}
                          onChange={(e) => setSupplyForm(prev => ({ ...prev, rate: e.target.value }))}
                          className="input-premium w-full h-11"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="label-premium">Dispenser Rent (₹)</label>
                        <input
                          type="number"
                          step="any"
                          placeholder="0"
                          value={supplyForm.dispenserRent}
                          onChange={(e) => setSupplyForm(prev => ({ ...prev, dispenserRent: e.target.value }))}
                          className="input-premium w-full h-11"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="label-premium">Delivery Charge (₹)</label>
                        <input
                          type="number"
                          step="any"
                          placeholder="0"
                          value={supplyForm.deliveryCharge}
                          onChange={(e) => setSupplyForm(prev => ({ ...prev, deliveryCharge: e.target.value }))}
                          className="input-premium w-full h-11"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="label-premium">Other Charges (₹)</label>
                        <input
                          type="number"
                          step="any"
                          placeholder="0"
                          value={supplyForm.otherCharge}
                          onChange={(e) => setSupplyForm(prev => ({ ...prev, otherCharge: e.target.value }))}
                          className="input-premium w-full h-11"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="label-premium">GST (%)</label>
                        <input
                          type="number"
                          step="any"
                          placeholder="0"
                          value={supplyForm.gstPercentage}
                          onChange={(e) => setSupplyForm(prev => ({ ...prev, gstPercentage: e.target.value }))}
                          className="input-premium w-full h-11"
                        />
                      </div>
                    </div>

                    {/* Function Can Special Fields */}
                    {supplyForm.supplyType === 'Function Can' && (
                      <div className="bg-emerald-50/50 p-4 border border-emerald-100 rounded-2xl grid grid-cols-1 sm:grid-cols-3 gap-4 animate-fade-in">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">Function Name *</label>
                          <input
                            type="text"
                            placeholder="e.g. Wedding Event"
                            value={supplyForm.functionName}
                            onChange={(e) => setSupplyForm(prev => ({ ...prev, functionName: e.target.value }))}
                            className="input-premium w-full h-10 bg-white"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">Event Date *</label>
                          <input
                            type="date"
                            value={supplyForm.eventDate}
                            onChange={(e) => setSupplyForm(prev => ({ ...prev, eventDate: e.target.value }))}
                            className="input-premium w-full h-10 bg-white text-xs"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">Expected Return Date *</label>
                          <input
                            type="date"
                            value={supplyForm.expectedReturnDate}
                            onChange={(e) => setSupplyForm(prev => ({ ...prev, expectedReturnDate: e.target.value }))}
                            className="input-premium w-full h-10 bg-white text-xs"
                          />
                        </div>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <label className="label-premium">Notes / Remarks</label>
                      <input
                        type="text"
                        placeholder="Any reference details..."
                        value={supplyForm.notes}
                        onChange={(e) => setSupplyForm(prev => ({ ...prev, notes: e.target.value }))}
                        className="input-premium w-full h-11"
                      />
                    </div>

                    {/* Total Calculator */}
                    <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl space-y-2 text-xs font-bold text-slate-800">
                      <div className="flex justify-between items-center text-slate-500 font-semibold">
                        <span>Water Amount:</span>
                        <span>₹{calculatedSupply.waterAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between items-center text-slate-500 font-semibold">
                        <span>Sub Total:</span>
                        <span>₹{calculatedSupply.subTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between items-center text-slate-500 font-semibold">
                        <span>GST Amount ({supplyForm.gstPercentage}%):</span>
                        <span>₹{calculatedSupply.gstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between items-center pt-2 border-t border-slate-200">
                        <span>GRAND TOTAL RECEIVABLE:</span>
                        <span className="text-sm font-black text-indigo-650 text-indigo-600">
                          ₹{calculatedSupply.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>

                    {supplyError && (
                      <div className="bg-rose-50 text-rose-600 px-4 py-3 rounded-xl text-xs font-semibold border border-rose-100">
                        ⚠️ {supplyError}
                      </div>
                    )}
                    {supplySuccess && (
                      <div className="bg-emerald-50 text-emerald-600 px-4 py-3 rounded-xl text-xs font-semibold border border-emerald-100">
                        ✅ {supplySuccess}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={isSavingSupply}
                      className="w-full h-12 bg-slate-900 text-white rounded-xl font-black text-sm hover:bg-slate-850 active:scale-98 transition-all flex items-center justify-center shadow-md shadow-slate-100"
                    >
                      {isSavingSupply ? 'Logging Transaction...' : '💾 Submit Supply & Bill'}
                    </button>
                  </form>
                )}

                {/* Sub Tab 2: Return Entry Section */}
                {workspaceSubTab === 'return' && (
                  <div className="space-y-6 animate-fade-in">

                    {/* Render active supplies list */}
                    {!selectedSupplyForReturn ? (
                      <div className="space-y-4">
                        <h4 className="text-xs font-black text-slate-450 uppercase tracking-widest border-b border-slate-100 pb-1.5">
                          Select Outstanding Supply to Return Against
                        </h4>

                        {customerDetails.outstanding.length === 0 ? (
                          <div className="bg-slate-50 border border-slate-100 rounded-xl p-8 text-center text-slate-400 italic text-xs font-semibold">
                            No pending supplies out for this customer.
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 gap-3">
                            {customerDetails.outstanding.map((supply) => (
                              <div key={supply.id} className="border border-slate-200/80 rounded-2xl p-4 bg-slate-50/20 hover:bg-slate-50/70 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div className="space-y-1.5 text-xs text-slate-600 font-semibold">
                                  <div className="flex items-center gap-2">
                                    <span className="font-extrabold text-slate-800">{supply.product}</span>
                                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${supply.supplyType === 'Distributor Can'
                                      ? 'bg-amber-50 border-amber-100 text-amber-600'
                                      : supply.supplyType === 'Function Can'
                                        ? 'bg-emerald-50 border-emerald-100 text-emerald-600'
                                        : 'bg-indigo-50 border-indigo-100 text-indigo-600'
                                      }`}>
                                      {supply.supplyType}
                                    </span>
                                    {supply.functionName && (
                                      <span className="text-[10px] text-slate-400 bg-slate-100/60 border border-slate-200/30 px-1.5 py-0.5 rounded">
                                        Event: {supply.functionName}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex gap-4 text-slate-450">
                                    <span>Date: {supply.transactionDate}</span>
                                    <span>Supplied: {supply.suppliedQty}</span>
                                    <span>Returned: {supply.returnedQty}</span>
                                  </div>
                                  {supply.expectedReturnDate && (
                                    <div className="text-[10px] font-bold text-rose-500">
                                      Expected Return Date: {supply.expectedReturnDate}
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center gap-4 justify-between sm:justify-end shrink-0">
                                  <div className="text-right">
                                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Pending</div>
                                    <div className="text-lg font-black text-rose-600">{supply.pendingQty}</div>
                                  </div>
                                  <button
                                    onClick={() => handleInitiateReturn(supply)}
                                    className="px-3.5 py-2 rounded-xl bg-slate-900 text-white font-black text-xs hover:bg-slate-800 transition-all active:scale-95"
                                  >
                                    ↩ Log Return
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Return Form for selected transaction */
                      <form onSubmit={handleReturnSubmit} className="space-y-6 animate-fade-in border border-slate-200 p-5 rounded-2xl bg-[#fffdfa]">
                        <div className="flex justify-between items-center border-b border-slate-150 pb-3 mb-4">
                          <h4 className="text-xs font-black text-slate-700 uppercase tracking-widest">
                            Return Entry against Supply ID: #{selectedSupplyForReturn.id}
                          </h4>
                          <button
                            type="button"
                            onClick={() => setSelectedSupplyForReturn(null)}
                            className="text-xs text-slate-455 hover:text-slate-700 font-extrabold"
                          >
                            ✕ Cancel Selection
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                          <div className="space-y-1">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Product</span>
                            <div className="font-extrabold text-slate-800 text-sm h-9 flex items-center">{selectedSupplyForReturn.product}</div>
                          </div>
                          <div className="space-y-1">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Previously Supplied Qty</span>
                            <div className="font-extrabold text-slate-800 text-sm h-9 flex items-center">{selectedSupplyForReturn.suppliedQty}</div>
                          </div>
                          <div className="space-y-1">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Pending Balance</span>
                            <div className="font-black text-rose-600 text-sm h-9 flex items-center">{selectedSupplyForReturn.pendingQty}</div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <label className="label-premium">Returned Quantity *</label>
                            <input
                              type="number"
                              placeholder={`max ${selectedSupplyForReturn.pendingQty}`}
                              value={returnForm.returnedQty}
                              onChange={(e) => setReturnForm(prev => ({ ...prev, returnedQty: e.target.value }))}
                              className="input-premium w-full h-11 bg-white font-black"
                              required
                            />
                          </div>

                          <div className="space-y-1.5">
                            <label className="label-premium">Return Notes / Comments</label>
                            <input
                              type="text"
                              placeholder="Optional description..."
                              value={returnForm.notes}
                              onChange={(e) => setReturnForm(prev => ({ ...prev, notes: e.target.value }))}
                              className="input-premium w-full h-11 bg-white"
                            />
                          </div>
                        </div>

                        {returnForm.returnedQty && (
                          <div className="bg-slate-100/50 p-4 rounded-xl flex justify-between items-center text-xs font-bold text-slate-700">
                            <span>REMAINING PENDING BALANCE AFTER RETURN:</span>
                            <span className={`text-sm font-black ${(selectedSupplyForReturn.pendingQty - (parseInt(returnForm.returnedQty, 10) || 0)) < 0
                              ? 'text-rose-600'
                              : 'text-slate-800'
                              }`}>
                              {selectedSupplyForReturn.pendingQty - (parseInt(returnForm.returnedQty, 10) || 0)}
                            </span>
                          </div>
                        )}

                        {returnError && (
                          <div className="bg-rose-50 text-rose-600 px-4 py-3 rounded-xl text-xs font-semibold border border-rose-100">
                            ⚠️ {returnError}
                          </div>
                        )}
                        {returnSuccess && (
                          <div className="bg-emerald-50 text-emerald-600 px-4 py-3 rounded-xl text-xs font-semibold border border-emerald-100">
                            ✅ {returnSuccess}
                          </div>
                        )}

                        <div className="flex gap-3 pt-2">
                          <button
                            type="submit"
                            disabled={isSavingReturn}
                            className="flex-1 h-12 bg-rose-500 text-white font-black rounded-xl text-sm hover:bg-rose-600 active:scale-98 transition-all flex items-center justify-center"
                          >
                            {isSavingReturn ? 'Saving Return...' : '💾 Submit Return'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedSupplyForReturn(null)}
                            className="w-24 h-12 bg-slate-100 text-slate-500 rounded-xl font-bold text-xs hover:bg-slate-200 transition-all"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                )}

                {/* Sub Tab 3: Customer Ledger History */}
                {workspaceSubTab === 'ledger' && (
                  <div className="space-y-4 animate-fade-in">
                    <div className="flex justify-between items-center border-b border-slate-100 pb-1.5">
                      <h4 className="text-xs font-black text-slate-450 uppercase tracking-widest">
                        📜 Unified Customer Financial & Can Ledger
                      </h4>
                      <button
                        type="button"
                        onClick={handleDownloadLedgerCSV}
                        className="px-2.5 py-1 rounded border border-emerald-600/35 text-emerald-600 bg-emerald-50/20 hover:bg-emerald-600 hover:text-white transition-all text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5"
                      >
                        📥 Export Ledger CSV
                      </button>
                    </div>

                    {customerDetails.ledger.length === 0 ? (
                      <div className="bg-slate-50 border border-slate-100 rounded-xl p-8 text-center text-slate-400 italic text-xs font-semibold">
                        No transactions found in this customer's ledger history.
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-slate-100">
                        <table className="table table-compact table-zebra w-full text-[11px] font-semibold text-slate-700">
                          <thead className="bg-slate-50 border-b border-slate-100">
                            <tr className="text-slate-500 font-black uppercase tracking-wider text-[9px]">
                              <th className="py-3 px-4 text-left">Date</th>
                              <th className="py-3 px-4 text-left">Type</th>
                              <th className="py-3 px-4 text-left">Reference No</th>
                              <th className="py-3 px-4 text-right">Cans Qty</th>
                              <th className="py-3 px-4 text-right">Debit (INR)</th>
                              <th className="py-3 px-4 text-right">Credit (INR)</th>
                              <th className="py-3 px-4 text-right bg-indigo-50/30">Running Cans</th>
                              <th className="py-3 px-4 text-right bg-blue-50/25">Running Cash Balance</th>
                            </tr>
                          </thead>
                          <tbody>
                            {customerDetails.ledger.map((row) => {
                              const q = parseInt(row.quantity, 10);
                              const isCan = row.product === '20 Ltr Can';
                              let cansQtyStr = '—';
                              if (isCan) {
                                if (row.type === 'SUPPLY') cansQtyStr = `+${q}`;
                                else if (row.type === 'RETURN') cansQtyStr = `-${q}`;
                              }

                              return (
                                <tr key={`${row.type}-${row.id}`} className="hover:bg-slate-50/50">
                                  <td className="py-2.5 px-4 font-mono font-bold text-slate-550">{row.date}</td>
                                  <td className="py-2.5 px-4 text-xs">
                                    <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border ${
                                      row.type === 'SUPPLY' 
                                        ? 'bg-indigo-55/10 border-indigo-100 text-indigo-700 bg-indigo-50' 
                                        : row.type === 'RETURN' 
                                          ? 'bg-amber-50 border-amber-100 text-amber-700' 
                                          : 'bg-emerald-50 border-emerald-100 text-emerald-700'
                                    }`}>
                                      {row.type === 'SUPPLY' ? 'Supply' : row.type === 'RETURN' ? 'Return' : 'Payment'}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-4 font-mono font-medium text-slate-600">{row.referenceNo || '—'}</td>
                                  <td className={`py-2.5 px-4 text-right font-black ${
                                    row.type === 'SUPPLY' ? 'text-indigo-650' : row.type === 'RETURN' ? 'text-amber-600' : 'text-slate-400'
                                  }`}>
                                    {cansQtyStr}
                                  </td>
                                  <td className="py-2.5 px-4 text-right font-bold text-rose-600">
                                    {parseFloat(row.debit) > 0 ? `₹${parseFloat(row.debit).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
                                  </td>
                                  <td className="py-2.5 px-4 text-right font-bold text-emerald-600">
                                    {parseFloat(row.credit) > 0 ? `₹${parseFloat(row.credit).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
                                  </td>
                                  <td className="py-2.5 px-4 text-right font-black text-slate-800 bg-indigo-50/20">
                                    {row.runningCanBalance} Cans
                                  </td>
                                  <td className="py-2.5 px-4 text-right font-black text-slate-800 bg-blue-50/10">
                                    ₹{parseFloat(row.runningFinancialBalance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW 3: BILLS WORKSPACE LISTING */}
      {activeTab === 'billing-workspace' && (
        <div className="card-premium bg-white space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h3 className="text-base font-black text-slate-850 uppercase tracking-tight">💵 Can Bills Ledger & Archive</h3>
            <p className="text-slate-500 text-xs font-semibold mt-0.5">Search, review, print invoices, edit, or delete logged water bill records.</p>
          </div>

          {/* Filters console */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end bg-slate-50/50 p-4 border border-slate-100 rounded-2xl text-xs font-bold text-slate-700">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">Search Invoice / Customer</label>
              <input
                type="text"
                placeholder="e.g. CAN-2026 or John Doe"
                value={billsSearch}
                onChange={(e) => setBillsSearch(e.target.value)}
                className="input-premium h-10 w-full bg-white text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">Payment Status</label>
              <select
                value={billsPaymentStatus}
                onChange={(e) => setBillsPaymentStatus(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 h-10 text-xs outline-none focus:border-primary transition-all font-semibold"
              >
                <option value="">All Payments</option>
                <option value="Paid">Paid</option>
                <option value="Partially Paid">Partially Paid</option>
                <option value="Unpaid">Unpaid</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">Start Date</label>
              <input
                type="date"
                value={billsStartDate}
                onChange={(e) => setBillsStartDate(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 h-10 text-xs outline-none focus:border-primary transition-all text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">End Date</label>
              <input
                type="date"
                value={billsEndDate}
                onChange={(e) => setBillsEndDate(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 h-10 text-xs outline-none focus:border-primary transition-all text-xs"
              />
            </div>

            <button
              onClick={() => {
                setBillsSearch('');
                setBillsPaymentStatus('');
                setBillsStartDate('');
                setBillsEndDate('');
              }}
              className="h-10 bg-slate-200 hover:bg-slate-300 text-slate-700 font-black rounded-xl text-xs transition-all uppercase tracking-wider block w-full"
            >
              Reset Filters
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-100">
            <table className="table table-zebra w-full text-xs font-semibold text-slate-700">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr className="text-slate-500 text-[10px] font-black uppercase tracking-wider">
                  <th className="py-3 px-4">Invoice No</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4 text-right">Qty</th>
                  <th className="py-3 px-4 text-right">Rate</th>
                  <th className="py-3 px-4 text-right">Water Amt</th>
                  <th className="py-3 px-4 text-right">Rent</th>
                  <th className="py-3 px-4 text-right">Del. Charge</th>
                  <th className="py-3 px-4 text-right">Other Charge</th>
                  <th className="py-3 px-4 text-right">GST %</th>
                  <th className="py-3 px-4 text-right">Grand Total</th>
                  <th className="py-3 px-4 text-right">Paid</th>
                  <th className="py-3 px-4 text-right">Balance</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-[11px]">
                {loadingBills ? (
                  <tr>
                    <td colSpan="15" className="py-20 text-center">
                      <span className="loading loading-spinner text-primary block mx-auto mb-2"></span>
                      Loading bills registry...
                    </td>
                  </tr>
                ) : bills.length === 0 ? (
                  <tr>
                    <td colSpan="15" className="py-16 text-center text-slate-400 italic">
                      No bills found matching selected filters.
                    </td>
                  </tr>
                ) : (
                  bills.map((bill) => {
                    const bal = bill.grandTotal - bill.amountPaid;
                    return (
                      <tr key={bill.id} className="hover:bg-slate-50/50">
                        <td className="py-3 px-4 font-mono font-black text-indigo-650 text-indigo-600">{bill.billNo}</td>
                        <td className="py-3 px-4 font-mono font-medium">{bill.date}</td>
                        <td className="py-3 px-4">
                          <div className="font-extrabold text-slate-800">{bill.customerName}</div>
                        </td>
                        <td className="py-3 px-4 text-right font-bold">{bill.qtySupplied}</td>
                        <td className="py-3 px-4 text-right">₹{parseFloat(bill.ratePerCan).toFixed(2)}</td>
                        <td className="py-3 px-4 text-right font-medium">₹{parseFloat(bill.waterAmount).toFixed(2)}</td>
                        <td className="py-3 px-4 text-right text-slate-450">₹{parseFloat(bill.dispenserRent).toFixed(2)}</td>
                        <td className="py-3 px-4 text-right text-slate-450">₹{parseFloat(bill.deliveryCharge).toFixed(2)}</td>
                        <td className="py-3 px-4 text-right text-slate-450">₹{parseFloat(bill.otherCharge).toFixed(2)}</td>
                        <td className="py-3 px-4 text-right text-slate-450">{parseFloat(bill.gstPercentage)}%</td>
                        <td className="py-3 px-4 text-right font-black text-indigo-600">₹{parseFloat(bill.grandTotal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td className="py-3 px-4 text-right font-bold text-emerald-600">₹{parseFloat(bill.amountPaid).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td className={`py-3 px-4 text-right font-black ${bal > 0 ? 'text-rose-600' : 'text-slate-500'}`}>
                          ₹{bal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase border ${
                            bill.paymentStatus === 'Paid'
                              ? 'bg-emerald-50 border-emerald-100 text-emerald-600'
                              : bill.paymentStatus === 'Partially Paid'
                                ? 'bg-amber-50 border-amber-100 text-amber-600'
                                : 'bg-rose-50 border-rose-105 text-rose-600 border-rose-100'
                          }`}>
                            {bill.paymentStatus}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center justify-center gap-1 shrink-0">
                            <button
                              onClick={() => handlePrintCanBill(bill)}
                              className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold transition-all"
                              title="Print Invoice"
                            >
                              🖨
                            </button>
                            <button
                              onClick={() => handleOpenEditBill(bill)}
                              className="p-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 font-bold transition-all"
                              title="Edit Bill Details"
                            >
                              ✏
                            </button>
                            <button
                              onClick={() => handleOpenPaymentHistory(bill)}
                              className="p-1 rounded bg-emerald-50 text-emerald-600 hover:bg-emerald-100 font-bold transition-all"
                              title="Payments Ledger"
                            >
                              💬
                            </button>
                            <button
                              onClick={() => handleDeleteBill(bill.id)}
                              className="p-1 rounded bg-rose-50 text-rose-600 hover:bg-rose-100 font-bold transition-all"
                              title="Delete Record"
                            >
                              🗑
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
        </div>
      )}

      {/* VIEW 4: OUTSTANDING PAYMENTS TAB */}
      {activeTab === 'outstanding-payments' && (
        <div className="card-premium bg-white space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h3 className="text-base font-black text-slate-850 uppercase tracking-tight">💳 Outstanding Accounts Receivable</h3>
            <p className="text-slate-500 text-xs font-semibold mt-0.5">View pending invoices and record customer cash/bank payments.</p>
          </div>

          {/* Quick search input */}
          <div className="relative max-w-md">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
            <input
              type="text"
              placeholder="Search outstanding bills by customer..."
              value={billsSearch}
              onChange={(e) => setBillsSearch(e.target.value)}
              className="input-premium pl-11 h-10 w-full"
            />
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-100">
            <table className="table table-zebra w-full text-xs font-semibold text-slate-700">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr className="text-slate-500 text-[10px] font-black uppercase tracking-wider">
                  <th className="py-4 px-6 text-left">Invoice No</th>
                  <th className="py-4 px-6 text-left">Date</th>
                  <th className="py-4 px-6 text-left">Customer</th>
                  <th className="py-4 px-6 text-right">Grand Total</th>
                  <th className="py-4 px-6 text-right">Amount Paid</th>
                  <th className="py-4 px-6 text-right text-rose-600">Pending Balance</th>
                  <th className="py-4 px-6">Status</th>
                  <th className="py-4 px-6 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loadingBills ? (
                  <tr>
                    <td colSpan="8" className="py-20 text-center">
                      <span className="loading loading-spinner text-primary block mx-auto mb-2"></span>
                      Loading pending balances...
                    </td>
                  </tr>
                ) : bills.filter(b => b.paymentStatus !== 'Paid').length === 0 ? (
                  <tr>
                    <td colSpan="8" className="py-16 text-center text-slate-400 italic">
                      No outstanding balances found! All bills are fully paid.
                    </td>
                  </tr>
                ) : (
                  bills
                    .filter((bill) => bill.paymentStatus !== 'Paid')
                    .map((bill) => {
                      const bal = bill.grandTotal - bill.amountPaid;
                      return (
                        <tr key={bill.id} className="hover:bg-slate-50/50">
                          <td className="py-4 px-6 font-mono font-black text-indigo-600">{bill.billNo}</td>
                          <td className="py-4 px-6 font-mono font-medium">{bill.date}</td>
                          <td className="py-4 px-6">
                            <div className="font-extrabold text-slate-800">{bill.customerName}</div>
                          </td>
                          <td className="py-4 px-6 text-right font-bold">₹{parseFloat(bill.grandTotal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td className="py-4 px-6 text-right font-bold text-emerald-600">₹{parseFloat(bill.amountPaid).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td className="py-4 px-6 text-right font-black text-rose-600 bg-rose-50/10">₹{bal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td className="py-4 px-6">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold border ${
                              bill.paymentStatus === 'Partially Paid'
                                ? 'bg-amber-50 border-amber-100 text-amber-600'
                                : 'bg-rose-50 border-rose-100 text-rose-600'
                            }`}>
                              {bill.paymentStatus}
                            </span>
                          </td>
                          <td className="py-4 px-6 text-center">
                            <div className="flex justify-center items-center gap-2">
                              <button
                                onClick={() => handleOpenPay(bill)}
                                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[11px] uppercase tracking-wider transition-all"
                              >
                                💳 Pay
                              </button>
                              <button
                                onClick={() => handleOpenPaymentHistory(bill)}
                                className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-[11px] uppercase tracking-wider transition-all"
                              >
                                History
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
        </div>
      )}

      {/* VIEW 5: REPORTS TAB */}
      {activeTab === 'reports' && (
        <div className="card-premium bg-white space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h3 className="text-base font-black text-slate-800 uppercase tracking-tight">📈 Can Supply Reporting Terminal</h3>
            <p className="text-slate-500 text-xs font-semibold mt-1">Select a reporting metrics category, set dates, and compile tables.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end bg-slate-50/50 p-4 border border-slate-100 rounded-2xl">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">Report Type</label>
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl px-3.5 h-10 text-xs font-semibold outline-none focus:border-primary transition-all"
              >
                <option value="CustomerCanBalance">Customer Can Balance Report</option>
                <option value="DistributorCanReport">Distributor Can Report</option>
                <option value="FunctionCanReport">Function Can Report</option>
                <option value="PendingReturnReport">Pending Return Report</option>
                <option value="DispenserBalanceReport">Dispenser Balance Report</option>
                <option value="CanSupplyHistoryReport">Can Supply History Report</option>
                <option value="CanBillingReport">Can Billing & Revenue Report</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">Start Date</label>
              <input
                type="date"
                value={reportStartDate}
                onChange={(e) => setReportStartDate(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl px-3.5 h-10 text-xs font-semibold outline-none focus:border-primary transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">End Date</label>
              <input
                type="date"
                value={reportEndDate}
                onChange={(e) => setReportEndDate(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl px-3.5 h-10 text-xs font-semibold outline-none focus:border-primary transition-all"
              />
            </div>

            <button
              type="button"
              onClick={fetchReport}
              disabled={loadingReports}
              className="h-10 bg-slate-900 hover:bg-slate-850 text-white rounded-xl text-xs font-black shadow-sm transition-all"
            >
              {loadingReports ? 'Compiling...' : '⚙️ Compile Report'}
            </button>

            <button
              type="button"
              onClick={handleDownloadReportCSV}
              disabled={loadingReports || reportData.length === 0}
              className="h-10 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-sm transition-all disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
            >
              📥 Export CSV
            </button>
          </div>

          {/* CanBillingReport Summary Panel */}
          {reportSummary && reportType === 'CanBillingReport' && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-emerald-50/30 p-4 border border-emerald-100/50 rounded-2xl animate-fade-in">
              <div className="p-3 bg-white border border-emerald-100 rounded-xl text-center">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Total Cans Supplied</p>
                <h4 className="text-lg font-black text-indigo-600 mt-1">{reportSummary.totalCansSupplied} Cans</h4>
              </div>
              <div className="p-3 bg-white border border-emerald-100 rounded-xl text-center">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Total Revenue</p>
                <h4 className="text-lg font-black text-emerald-600 mt-1">₹{reportSummary.totalRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</h4>
              </div>
              <div className="p-3 bg-white border border-emerald-100 rounded-xl text-center">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Avg Rev / Day</p>
                <h4 className="text-lg font-black text-amber-600 mt-1">₹{reportSummary.averageRevenuePerDay.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</h4>
              </div>
              <div className="p-3 bg-white border border-emerald-100 rounded-xl text-center">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider font-sans">Avg Rev / Cust</p>
                <h4 className="text-lg font-black text-purple-600 mt-1">₹{reportSummary.averageRevenuePerCustomer.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</h4>
              </div>
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-slate-100">
            {loadingReports ? (
              <div className="py-20 text-center text-slate-400 text-xs">
                <span className="loading loading-spinner text-primary block mx-auto mb-2"></span>
                Compiling report data...
              </div>
            ) : reportData.length === 0 ? (
              <div className="py-20 text-center text-slate-400 italic text-xs font-semibold bg-slate-50/20">
                No data matched selected report filters.
              </div>
            ) : (
              <table className="table table-compact table-zebra w-full text-xs font-semibold text-slate-700">

                {/* Dynamically render tables based on Report Type */}
                {reportType === 'CustomerCanBalance' && (
                  <>
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr className="text-slate-500 text-[10px] font-black uppercase tracking-wider">
                        <th className="py-3 px-5">Customer ID</th>
                        <th className="py-3 px-5">Customer Name</th>
                        <th className="py-3 px-5">Mobile Number</th>
                        <th className="py-3 px-5">Customer Type</th>
                        <th className="py-3 px-5 text-right">Cans Outstanding</th>
                        <th className="py-3 px-5 text-right">Dispensers Outstanding</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.map((row) => (
                        <tr key={row.id}>
                          <td className="py-3 px-5 font-mono font-bold text-primary">{row.id}</td>
                          <td className="py-3 px-5 font-extrabold text-slate-800">{row.name}</td>
                          <td className="py-3 px-5">{row.phone}</td>
                          <td className="py-3 px-5">
                            <span className="px-2 py-0.5 border border-slate-200 text-slate-600 rounded text-[10px]">
                              {row.customerType}
                            </span>
                          </td>
                          <td className="py-3 px-5 text-right font-black text-indigo-600">{row.cansOut}</td>
                          <td className="py-3 px-5 text-right font-black text-rose-500">{row.dispensersOut}</td>
                        </tr>
                      ))}
                    </tbody>
                  </>
                )}

                {reportType === 'DistributorCanReport' && (
                  <>
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr className="text-slate-500 text-[10px] font-black uppercase tracking-wider">
                        <th className="py-3 px-5">Customer ID</th>
                        <th className="py-3 px-5">Distributor Name</th>
                        <th className="py-3 px-5">Mobile Number</th>
                        <th className="py-3 px-5 text-right">Distributor Cans Outstanding</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.map((row) => (
                        <tr key={row.id}>
                          <td className="py-3 px-5 font-mono font-bold text-primary">{row.id}</td>
                          <td className="py-3 px-5 font-extrabold text-slate-800">{row.name}</td>
                          <td className="py-3 px-5">{row.phone}</td>
                          <td className="py-3 px-5 text-right font-black text-amber-600">{row.cansOut}</td>
                        </tr>
                      ))}
                    </tbody>
                  </>
                )}

                {reportType === 'FunctionCanReport' && (
                  <>
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr className="text-slate-500 text-[10px] font-black uppercase tracking-wider">
                        <th className="py-3 px-5">Supply ID</th>
                        <th className="py-3 px-5">Customer Name</th>
                        <th className="py-3 px-5">Mobile</th>
                        <th className="py-3 px-5">Function Name</th>
                        <th className="py-3 px-5">Event Date</th>
                        <th className="py-3 px-5">Expected Return Date</th>
                        <th className="py-3 px-5 text-right">Supplied Qty</th>
                        <th className="py-3 px-5 text-right">Pending Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.map((row) => (
                        <tr key={row.supplyId}>
                          <td className="py-3 px-5 font-mono font-bold text-slate-500">#{row.supplyId}</td>
                          <td className="py-3 px-5 font-extrabold text-slate-800">{row.customerName}</td>
                          <td className="py-3 px-5">{row.customerPhone}</td>
                          <td className="py-3 px-5 font-bold text-emerald-600">{row.functionName}</td>
                          <td className="py-3 px-5">{row.eventDate}</td>
                          <td className="py-3 px-5 text-rose-500">{row.expectedReturnDate}</td>
                          <td className="py-3 px-5 text-right font-bold">{row.suppliedQty}</td>
                          <td className="py-3 px-5 text-right font-black text-rose-600">{row.pendingQty}</td>
                        </tr>
                      ))}
                    </tbody>
                  </>
                )}

                {reportType === 'PendingReturnReport' && (
                  <>
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr className="text-slate-500 text-[10px] font-black uppercase tracking-wider">
                        <th className="py-3 px-5">Supply ID</th>
                        <th className="py-3 px-5">Customer Name</th>
                        <th className="py-3 px-5">Mobile</th>
                        <th className="py-3 px-5">Supply Type</th>
                        <th className="py-3 px-5">Product</th>
                        <th className="py-3 px-5">Supply Date</th>
                        <th className="py-3 px-5 text-right">Supplied Qty</th>
                        <th className="py-3 px-5 text-right">Pending Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.map((row) => (
                        <tr key={row.supplyId}>
                          <td className="py-3 px-5 font-mono font-bold text-slate-500">#{row.supplyId}</td>
                          <td className="py-3 px-5 font-extrabold text-slate-800">{row.customerName}</td>
                          <td className="py-3 px-5">{row.customerPhone}</td>
                          <td className="py-3 px-5">
                            <span className="px-2 py-0.5 border border-slate-200 text-slate-600 rounded text-[10px]">
                              {row.supplyType}
                            </span>
                          </td>
                          <td className="py-3 px-5 font-bold">{row.product}</td>
                          <td className="py-3 px-5">{row.supplyDate}</td>
                          <td className="py-3 px-5 text-right font-bold">{row.suppliedQty}</td>
                          <td className="py-3 px-5 text-right font-black text-rose-600">{row.pendingQty}</td>
                        </tr>
                      ))}
                    </tbody>
                  </>
                )}

                {reportType === 'DispenserBalanceReport' && (
                  <>
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr className="text-slate-500 text-[10px] font-black uppercase tracking-wider">
                        <th className="py-3 px-5">Customer ID</th>
                        <th className="py-3 px-5">Customer Name</th>
                        <th className="py-3 px-5">Mobile Number</th>
                        <th className="py-3 px-5 text-right">Dispensers Outstanding</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.map((row) => (
                        <tr key={row.id}>
                          <td className="py-3 px-5 font-mono font-bold text-primary">{row.id}</td>
                          <td className="py-3 px-5 font-extrabold text-slate-800">{row.name}</td>
                          <td className="py-3 px-5">{row.phone}</td>
                          <td className="py-3 px-5 text-right font-black text-rose-500">{row.dispensersOut}</td>
                        </tr>
                      ))}
                    </tbody>
                  </>
                )}

                {reportType === 'CanSupplyHistoryReport' && (
                  <>
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr className="text-slate-500 text-[10px] font-black uppercase tracking-wider">
                        <th className="py-3 px-5">Transaction ID</th>
                        <th className="py-3 px-5">Date</th>
                        <th className="py-3 px-5">Customer Name</th>
                        <th className="py-3 px-5">Type</th>
                        <th className="py-3 px-5">Supply Type</th>
                        <th className="py-3 px-5">Product</th>
                        <th className="py-3 px-5 text-right">Qty</th>
                        <th className="py-3 px-5 text-right">Rate</th>
                        <th className="py-3 px-5 text-right">Amount</th>
                        <th className="py-3 px-5">User</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.map((row) => (
                        <tr key={row.id}>
                          <td className="py-3 px-5 font-mono font-bold text-slate-500">#{row.id}</td>
                          <td className="py-3 px-5 font-mono font-bold">{row.date}</td>
                          <td className="py-3 px-5 font-extrabold text-slate-800">{row.customerName}</td>
                          <td className="py-3 px-5">
                            <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${row.type === 'SUPPLY' ? 'bg-indigo-50 text-indigo-600' : 'bg-rose-50 text-rose-500'
                              }`}>
                              {row.type}
                            </span>
                          </td>
                          <td className="py-3 px-5 text-slate-500">{row.supplyType}</td>
                          <td className="py-3 px-5 font-bold">{row.product}</td>
                          <td className="py-3 px-5 text-right font-black">{row.quantity}</td>
                          <td className="py-3 px-5 text-right">₹{parseFloat(row.rate).toFixed(2)}</td>
                          <td className="py-3 px-5 text-right font-bold text-indigo-600">₹{parseFloat(row.amount).toFixed(2)}</td>
                          <td className="py-3 px-5 text-slate-450">{row.user}</td>
                        </tr>
                      ))}
                    </tbody>
                  </>
                )}

                {reportType === 'CanBillingReport' && (
                  <>
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr className="text-slate-500 text-[10px] font-black uppercase tracking-wider">
                        <th className="py-3 px-5">Invoice No</th>
                        <th className="py-3 px-5">Date</th>
                        <th className="py-3 px-5">Customer</th>
                        <th className="py-3 px-5 text-right">Qty</th>
                        <th className="py-3 px-5 text-right">Rate</th>
                        <th className="py-3 px-5 text-right">Total Amount</th>
                        <th className="py-3 px-5 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.map((row) => (
                        <tr key={row.invoiceNo}>
                          <td className="py-3 px-5 font-mono font-bold text-primary">{row.invoiceNo}</td>
                          <td className="py-3 px-5 font-mono font-bold">{row.date}</td>
                          <td className="py-3 px-5 font-extrabold text-slate-800">{row.customer}</td>
                          <td className="py-3 px-5 text-right font-bold">{row.qtySupplied}</td>
                          <td className="py-3 px-5 text-right">₹{parseFloat(row.rate).toFixed(2)}</td>
                          <td className="py-3 px-5 text-right font-bold text-indigo-600">₹{parseFloat(row.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td className="py-3 px-5 text-center">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold border ${row.status === 'Paid'
                              ? 'bg-emerald-50 border-emerald-100 text-emerald-600'
                              : row.status === 'Partially Paid'
                                ? 'bg-amber-50 border-amber-100 text-amber-600'
                                : 'bg-rose-50 border-rose-100 text-rose-600'
                              }`}>
                              {row.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </>
                )}

              </table>
            )}
          </div>
        </div>
      )}

      {/* EDIT BILL MODAL */}
      {isEditModalOpen && (
        <div className="modal modal-open">
          <div className="modal-box rounded-3xl max-w-xl p-0 border border-slate-200 shadow-2xl bg-white overflow-hidden flex flex-col max-h-[90vh] h-[550px] pointer-events-auto">
            <div className="bg-blue-600 p-6 text-white shrink-0">
              <h3 className="text-lg font-black uppercase tracking-tight">✏ Edit Bill details - {editingBill?.billNo}</h3>
              <p className="text-blue-100 text-xs mt-1">Modify invoice parameters and recalculate balances.</p>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="absolute right-6 top-6 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-all font-bold"
              >
                ✕
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs font-semibold text-slate-700">
              <form id="editBillForm" onSubmit={handleEditBillSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Invoice Date *</label>
                    <input
                      type="date"
                      value={editForm.date}
                      onChange={(e) => setEditForm(prev => ({ ...prev, date: e.target.value }))}
                      className="input-premium w-full h-10 bg-white"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Qty Supplied *</label>
                    <input
                      type="number"
                      value={editForm.qtySupplied}
                      onChange={(e) => setEditForm(prev => ({ ...prev, qtySupplied: e.target.value }))}
                      className="input-premium w-full h-10 bg-white"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Rate per Can (INR) *</label>
                    <input
                      type="number"
                      step="any"
                      value={editForm.ratePerCan}
                      onChange={(e) => setEditForm(prev => ({ ...prev, ratePerCan: e.target.value }))}
                      className="input-premium w-full h-10 bg-white"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Dispenser Rent (INR)</label>
                    <input
                      type="number"
                      step="any"
                      value={editForm.dispenserRent}
                      onChange={(e) => setEditForm(prev => ({ ...prev, dispenserRent: e.target.value }))}
                      className="input-premium w-full h-10 bg-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Delivery Charge (INR)</label>
                    <input
                      type="number"
                      step="any"
                      value={editForm.deliveryCharge}
                      onChange={(e) => setEditForm(prev => ({ ...prev, deliveryCharge: e.target.value }))}
                      className="input-premium w-full h-10 bg-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Other Charge (INR)</label>
                    <input
                      type="number"
                      step="any"
                      value={editForm.otherCharge}
                      onChange={(e) => setEditForm(prev => ({ ...prev, otherCharge: e.target.value }))}
                      className="input-premium w-full h-10 bg-white"
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">GST Percentage (%)</label>
                    <input
                      type="number"
                      step="any"
                      value={editForm.gstPercentage}
                      onChange={(e) => setEditForm(prev => ({ ...prev, gstPercentage: e.target.value }))}
                      className="input-premium w-full h-10 bg-white"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Remarks / Description</label>
                  <input
                    type="text"
                    value={editForm.remarks}
                    onChange={(e) => setEditForm(prev => ({ ...prev, remarks: e.target.value }))}
                    className="input-premium w-full h-10 bg-white"
                  />
                </div>

                <div className="bg-slate-50 border border-slate-200/50 p-4 rounded-xl space-y-2 text-xs font-bold text-slate-800">
                  <div className="flex justify-between items-center text-slate-500 font-semibold">
                    <span>Water Amount:</span>
                    <span>₹{calculatedEditSupply.waterAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-500 font-semibold">
                    <span>Sub Total:</span>
                    <span>₹{calculatedEditSupply.subTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-500 font-semibold">
                    <span>GST Amount ({editForm.gstPercentage}%):</span>
                    <span>₹{calculatedEditSupply.gstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-slate-200">
                    <span>RECALCULATED GRAND TOTAL:</span>
                    <span className="text-sm font-black text-blue-650 text-blue-600">
                      ₹{calculatedEditSupply.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </form>

              {editError && (
                <div className="bg-rose-50 text-rose-600 px-4 py-3 rounded-xl text-xs font-semibold border border-rose-100">
                  ⚠️ {editError}
                </div>
              )}
            </div>

            <div className="p-5 border-t border-slate-100 bg-white flex gap-3 shrink-0">
              <button
                type="submit"
                form="editBillForm"
                disabled={isSavingEdit}
                className="btn-premium bg-blue-600 hover:bg-blue-700 text-white flex-[2] h-11 text-xs font-black uppercase tracking-wider"
              >
                {isSavingEdit ? 'Saving...' : '💾 Save Changes'}
              </button>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="btn-premium bg-slate-100 text-slate-500 hover:bg-slate-200 flex-1 h-11 text-xs font-bold uppercase tracking-wider"
              >
                Cancel
              </button>
            </div>
          </div>
          <div className="modal-backdrop bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsEditModalOpen(false)}></div>
        </div>
      )}

      {/* RECORD PAYMENT MODAL */}
      {isPayModalOpen && (
        <div className="modal modal-open">
          <div className="modal-box rounded-3xl max-w-md p-0 border border-slate-200 shadow-2xl bg-white overflow-hidden flex flex-col pointer-events-auto">
            <div className="bg-emerald-600 p-6 text-white relative">
              <h3 className="text-lg font-black uppercase tracking-tight">💳 Record Payment - {payingBill?.billNo}</h3>
              <p className="text-emerald-100 text-xs mt-1">Post a credit entry to customer ledger balance.</p>
              <button
                onClick={() => setIsPayModalOpen(false)}
                className="absolute right-6 top-6 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-all font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs font-semibold text-slate-700">
              <div className="bg-slate-50 border border-slate-200/50 p-4 rounded-2xl space-y-2 text-[11px] text-slate-600">
                <div className="flex justify-between items-center">
                  <span>Customer:</span>
                  <span className="font-extrabold text-slate-800">{payingBill?.customerName}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>Bill Total:</span>
                  <span className="font-bold">₹{parseFloat(payingBill?.grandTotal || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>Paid Balance:</span>
                  <span className="font-bold text-emerald-600">₹{parseFloat(payingBill?.amountPaid || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center pt-1.5 border-t border-slate-200/50 text-xs">
                  <span>Outstanding Receivables:</span>
                  <span className="font-black text-rose-600">₹{(payingBill?.grandTotal - payingBill?.amountPaid).toFixed(2)}</span>
                </div>
              </div>

              <form id="recordPaymentForm" onSubmit={handleRecordPaymentSubmit} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Payment Date *</label>
                  <input
                    type="date"
                    value={payForm.paymentDate}
                    onChange={(e) => setPayForm(prev => ({ ...prev, paymentDate: e.target.value }))}
                    className="input-premium w-full h-10 bg-white"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Amount Paid (INR) *</label>
                  <input
                    type="number"
                    step="any"
                    placeholder={`max ${(payingBill?.grandTotal - payingBill?.amountPaid).toFixed(2)}`}
                    value={payForm.amountPaid}
                    onChange={(e) => setPayForm(prev => ({ ...prev, amountPaid: e.target.value }))}
                    className="input-premium w-full h-10 bg-white font-bold text-slate-800"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Payment Method *</label>
                  <select
                    value={payForm.paymentMethod}
                    onChange={(e) => setPayForm(prev => ({ ...prev, paymentMethod: e.target.value }))}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 h-10 text-xs outline-none focus:border-primary transition-all font-semibold"
                  >
                    <option value="Cash">Cash</option>
                    <option value="Bank">Bank Deposit</option>
                    <option value="GPay">GPay / UPI</option>
                    <option value="Cheque">Cheque</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Remarks / Reference No</label>
                  <input
                    type="text"
                    placeholder="e.g. Transaction ID or check details..."
                    value={payForm.remarks}
                    onChange={(e) => setPayForm(prev => ({ ...prev, remarks: e.target.value }))}
                    className="input-premium w-full h-10 bg-white"
                  />
                </div>
              </form>

              {payError && (
                <div className="bg-rose-50 text-rose-600 px-4 py-3 rounded-xl text-xs font-semibold border border-rose-100">
                  ⚠️ {payError}
                </div>
              )}
            </div>

            <div className="p-5 border-t border-slate-100 bg-white flex gap-3 shrink-0 text-xs">
              <button
                type="submit"
                form="recordPaymentForm"
                disabled={isSavingPay}
                className="btn-premium bg-emerald-600 hover:bg-emerald-700 text-white flex-[2] h-11 font-black uppercase tracking-wider"
              >
                {isSavingPay ? 'Saving Payment...' : '💾 Save Payment'}
              </button>
              <button
                type="button"
                onClick={() => setIsPayModalOpen(false)}
                className="btn-premium bg-slate-100 text-slate-500 hover:bg-slate-200 flex-1 h-11 font-bold uppercase tracking-wider"
              >
                Cancel
              </button>
            </div>
          </div>
          <div className="modal-backdrop bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsPayModalOpen(false)}></div>
        </div>
      )}

      {/* VIEW PAYMENT HISTORY MODAL */}
      {isPaymentHistoryModalOpen && (
        <div className="modal modal-open">
          <div className="modal-box rounded-3xl max-w-lg p-0 border border-slate-200 shadow-2xl bg-white overflow-hidden flex flex-col pointer-events-auto h-[400px]">
            <div className="bg-slate-900 p-6 text-white relative shrink-0">
              <h3 className="text-lg font-black uppercase tracking-tight">💬 Payment History - {historyBill?.billNo}</h3>
              <p className="text-slate-400 text-xs mt-1">Review list of payments recorded for this invoice.</p>
              <button
                onClick={() => setIsPaymentHistoryModalOpen(false)}
                className="absolute right-6 top-6 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-all font-bold"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 text-xs font-semibold text-slate-700">
              {loadingHistory ? (
                <div className="py-20 text-center text-slate-450">
                  <span className="loading loading-spinner text-primary block mx-auto mb-2"></span>
                  Fetching payments history...
                </div>
              ) : paymentHistory.length === 0 ? (
                <div className="py-16 text-center text-slate-400 italic">
                  No payments have been recorded for this invoice yet.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-100">
                  <table className="table table-compact table-zebra w-full text-[11px] font-semibold text-slate-700">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr className="text-slate-500 font-black uppercase tracking-wider text-[9px]">
                        <th className="py-2 px-3">Date</th>
                        <th className="py-2 px-3">Payment No</th>
                        <th className="py-2 px-3 text-right">Amount</th>
                        <th className="py-2 px-3">Method</th>
                        <th className="py-2 px-3">Remarks</th>
                        <th className="py-2 px-3">User</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paymentHistory.map((p) => (
                        <tr key={p.id}>
                          <td className="py-2 px-3 font-mono text-slate-500">{p.paymentDate}</td>
                          <td className="py-2 px-3 font-mono font-bold text-slate-700">{p.paymentNo}</td>
                          <td className="py-2 px-3 text-right font-black text-emerald-600">₹{parseFloat(p.amountPaid).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td className="py-2 px-3">{p.paymentMethod}</td>
                          <td className="py-2 px-3 text-slate-450 font-normal">{p.remarks || '—'}</td>
                          <td className="py-2 px-3 text-slate-450 font-normal">{p.createdBy}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="p-5 border-t border-slate-100 bg-white shrink-0 flex justify-end">
              <button
                type="button"
                onClick={() => setIsPaymentHistoryModalOpen(false)}
                className="px-6 py-2 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-slate-800 transition-all"
              >
                Close View
              </button>
            </div>
          </div>
          <div className="modal-backdrop bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsPaymentHistoryModalOpen(false)}></div>
        </div>
      )}

      {/* NEW CAN SUPPLY / BILLING ENTRY MODAL */}
      {isNewSupplyModalOpen && (
        <div className="modal modal-open">
          <div className="modal-box rounded-3xl max-w-xl p-0 border border-slate-200 shadow-2xl bg-white overflow-hidden flex flex-col max-h-[90vh] h-[650px] pointer-events-auto">
            {/* Modal Header */}
            <div className="bg-emerald-600 p-6 text-white relative shrink-0">
              <h3 className="text-xl font-black italic tracking-tight">CAN SUPPLY / BILLING ENTRY</h3>
              <p className="text-emerald-100 text-xs mt-1 font-medium italic opacity-90">
                Log a fresh water can or dispenser supply transaction and auto-generate invoice
              </p>
              <button 
                type="button"
                onClick={() => setIsNewSupplyModalOpen(false)}
                className="absolute right-6 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-all font-bold"
              >
                ✕
              </button>
            </div>

            {/* Modal Body (Scrollable) */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar text-xs font-semibold text-slate-700">
              
              {/* Search Customer */}
              <div className="space-y-1.5 relative" ref={modalSuggestionsRef}>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">
                  Search & Select Customer *
                </label>
                <input
                  type="text"
                  placeholder="Type customer name or mobile..."
                  value={modalSearchQuery}
                  onChange={handleModalSearchChange}
                  className="input-premium h-11 w-full"
                />
                {showModalSuggestions && modalSearchResults.length > 0 && (
                  <ul className="absolute z-[9999] w-full bg-white border border-slate-200 rounded-xl mt-1.5 shadow-lg max-h-48 overflow-y-auto divide-y divide-slate-100">
                    {modalSearchResults.map((cust) => (
                      <li
                        key={cust.id}
                        onClick={() => handleSelectModalCustomer(cust)}
                        className="px-4 py-2.5 hover:bg-slate-50 cursor-pointer flex justify-between items-center text-xs font-bold text-slate-700"
                      >
                        <div>
                          <div>{cust.name}</div>
                          <div className="text-[10px] text-slate-400 font-medium">{cust.phone}</div>
                        </div>
                        <span className="text-[9px] uppercase bg-slate-100 text-slate-500 rounded px-1.5 py-0.5">{cust.customerType}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Selected Customer Info Banner */}
              {modalSelectedCustomer ? (
                <div className="bg-slate-50 border border-slate-200/60 p-4 rounded-xl space-y-2.5 text-xs text-slate-650 font-mono">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-extrabold text-slate-805 text-slate-800 text-sm">{modalSelectedCustomer.name}</h4>
                      <p className="text-[10px] text-slate-400 font-bold">{modalSelectedCustomer.id} | {modalSelectedCustomer.customerType}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setModalSelectedCustomerId(null); setModalSelectedCustomer(null); }}
                      className="text-red-500 hover:text-red-700 font-extrabold text-[10px] uppercase font-sans"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px] pt-1.5 border-t border-slate-200/50">
                    <div>📞 {modalSelectedCustomer.phone}</div>
                    <div>Cans Out (Company): <b>{modalSelectedCustomer.cansOutCompany || 0}</b></div>
                    <div>Cans Out (Function): <b>{modalSelectedCustomer.cansOutFunction || 0}</b></div>
                    <div>Dispensers Out: <b>{modalSelectedCustomer.dispensersOut || 0}</b></div>
                  </div>
                </div>
              ) : (
                <div className="bg-amber-50/50 border border-dashed border-amber-200 text-amber-700 p-4 rounded-xl text-center text-xs font-semibold">
                  ⚠️ Please search and select a customer above to display input form fields.
                </div>
              )}

              {/* Input Form Fields */}
              {modalSelectedCustomer && (
                <form id="modalSupplyForm" onSubmit={handleModalSupplySubmit} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">Supply Category *</label>
                      <select
                        value={modalSupplyForm.supplyType}
                        onChange={(e) => setModalSupplyForm(prev => ({ ...prev, supplyType: e.target.value }))}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3.5 h-11 text-xs font-semibold outline-none focus:border-primary transition-all"
                      >
                        <option value="Company Can">Company Can</option>
                        <option value="Distributor Can">Distributor Can</option>
                        <option value="Function Can">Function Can</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">Product *</label>
                      <select
                        value={modalSupplyForm.product}
                        onChange={(e) => setModalSupplyForm(prev => ({ ...prev, product: e.target.value }))}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3.5 h-11 text-xs font-semibold outline-none focus:border-primary transition-all"
                        disabled={availableProducts.length === 0}
                      >
                        {availableProducts.length === 0 ? (
                          <option value="">No Active Cans/Dispensers</option>
                        ) : (
                          availableProducts.map(p => (
                            <option key={p.id} value={p.name}>{p.name}</option>
                          ))
                        )}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">Quantity Supplied *</label>
                      <input
                        type="number"
                        placeholder="e.g. 50"
                        value={modalSupplyForm.quantity}
                        onChange={(e) => setModalSupplyForm(prev => ({ ...prev, quantity: e.target.value }))}
                        className="input-premium w-full h-11 text-sm bg-white"
                        required
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">Rate per can (Water Only)</label>
                      <input
                        type="number"
                        step="any"
                        placeholder="0"
                        value={modalSupplyForm.rate}
                        onChange={(e) => setModalSupplyForm(prev => ({ ...prev, rate: e.target.value }))}
                        className="input-premium w-full h-11 text-sm bg-white"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">Dispenser Rent (₹)</label>
                      <input
                        type="number"
                        step="any"
                        placeholder="0"
                        value={modalSupplyForm.dispenserRent}
                        onChange={(e) => setModalSupplyForm(prev => ({ ...prev, dispenserRent: e.target.value }))}
                        className="input-premium w-full h-11 text-sm bg-white"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">Delivery Charge (₹)</label>
                      <input
                        type="number"
                        step="any"
                        placeholder="0"
                        value={modalSupplyForm.deliveryCharge}
                        onChange={(e) => setModalSupplyForm(prev => ({ ...prev, deliveryCharge: e.target.value }))}
                        className="input-premium w-full h-11 text-sm bg-white"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">Other Charge (₹)</label>
                      <input
                        type="number"
                        step="any"
                        placeholder="0"
                        value={modalSupplyForm.otherCharge}
                        onChange={(e) => setModalSupplyForm(prev => ({ ...prev, otherCharge: e.target.value }))}
                        className="input-premium w-full h-11 text-sm bg-white"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">GST Percentage (%)</label>
                      <input
                        type="number"
                        step="any"
                        placeholder="0"
                        value={modalSupplyForm.gstPercentage}
                        onChange={(e) => setModalSupplyForm(prev => ({ ...prev, gstPercentage: e.target.value }))}
                        className="input-premium w-full h-11 text-sm bg-white"
                      />
                    </div>
                  </div>

                  {/* Function Can Special Fields */}
                  {modalSupplyForm.supplyType === 'Function Can' && (
                    <div className="bg-emerald-50/50 p-4 border border-emerald-100 rounded-xl grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-550 uppercase tracking-wider block">Function Name *</label>
                        <input
                          type="text"
                          placeholder="Event Name..."
                          value={modalSupplyForm.functionName}
                          onChange={(e) => setModalSupplyForm(prev => ({ ...prev, functionName: e.target.value }))}
                          className="input-premium w-full h-9 bg-white text-xs"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-550 uppercase tracking-wider block">Event Date *</label>
                        <input
                          type="date"
                          value={modalSupplyForm.eventDate}
                          onChange={(e) => setModalSupplyForm(prev => ({ ...prev, eventDate: e.target.value }))}
                          className="input-premium w-full h-9 bg-white text-[10px]"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-550 uppercase tracking-wider block">Expected Return *</label>
                        <input
                          type="date"
                          value={modalSupplyForm.expectedReturnDate}
                          onChange={(e) => setModalSupplyForm(prev => ({ ...prev, expectedReturnDate: e.target.value }))}
                          className="input-premium w-full h-9 bg-white text-[10px]"
                        />
                      </div>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">Notes / Remarks</label>
                    <input
                      type="text"
                      placeholder="Any reference details..."
                      value={modalSupplyForm.notes}
                      onChange={(e) => setModalSupplyForm(prev => ({ ...prev, notes: e.target.value }))}
                      className="input-premium w-full h-11 text-sm bg-white"
                    />
                  </div>

                  {/* Calculations summary */}
                  <div className="bg-slate-50 border border-slate-200/50 p-4 rounded-xl space-y-2 text-xs font-bold text-slate-800">
                    <div className="flex justify-between items-center text-slate-500 font-semibold">
                      <span>Water Amount:</span>
                      <span>₹{calculatedModalSupply.waterAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-500 font-semibold">
                      <span>Sub Total:</span>
                      <span>₹{calculatedModalSupply.subTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-500 font-semibold">
                      <span>GST Amount ({modalSupplyForm.gstPercentage}%):</span>
                      <span>₹{calculatedModalSupply.gstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-slate-200">
                      <span>GRAND TOTAL RECEIVABLE:</span>
                      <span className="text-xs font-black text-emerald-600 text-sm">
                        ₹{calculatedModalSupply.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </form>
              )}

              {modalSupplyError && (
                <div className="bg-rose-50 text-rose-600 px-4 py-3 rounded-xl text-xs font-semibold border border-rose-100">
                  ⚠️ {modalSupplyError}
                </div>
              )}
              {modalSupplySuccess && (
                <div className="bg-emerald-50 text-emerald-600 px-4 py-3 rounded-xl text-xs font-semibold border border-emerald-100">
                  ✅ {modalSupplySuccess}
                </div>
              )}

            </div>

            {/* Modal Footer */}
            <div className="p-5 border-t border-slate-100 bg-white flex gap-3 shrink-0">
              <button
                type="submit"
                form="modalSupplyForm"
                disabled={isSavingModalSupply || !modalSelectedCustomerId}
                className="btn-premium bg-emerald-600 hover:bg-emerald-700 text-white flex-[2] h-12 text-xs font-black uppercase tracking-wider disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed"
              >
                {isSavingModalSupply ? 'Logging supply...' : '💾 Save Supply & Generate Bill'}
              </button>
              <button
                type="button"
                onClick={() => setIsNewSupplyModalOpen(false)}
                className="btn-premium bg-slate-100 text-slate-500 hover:bg-slate-200 flex-1 h-12 text-xs font-bold uppercase tracking-wider"
              >
                Cancel
              </button>
            </div>
          </div>
          <div className="modal-backdrop bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsNewSupplyModalOpen(false)}></div>
        </div>
      )}

    </div>
  );
};

export default CanSupply;