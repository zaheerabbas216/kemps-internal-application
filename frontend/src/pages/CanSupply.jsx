import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';

const CanSupply = () => {
  const navigate = useNavigate();
  // Tabs: 'active-balances' | 'workspace' | 'reports'
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

  // Form states
  const [supplyForm, setSupplyForm] = useState({
    supplyType: 'Company Can',
    product: '20 Ltr Can',
    quantity: '',
    rate: '0',
    notes: '',
    functionName: '',
    eventDate: '',
    expectedReturnDate: ''
  });
  const [isSavingSupply, setIsSavingSupply] = useState(false);
  const [supplyError, setSupplyError] = useState('');
  const [supplySuccess, setSupplySuccess] = useState('');

  const [selectedSupplyForReturn, setSelectedSupplyForReturn] = useState(null);
  const [returnForm, setReturnForm] = useState({
    returnedQty: '',
    notes: ''
  });
  const [isSavingReturn, setIsSavingReturn] = useState(false);
  const [returnError, setReturnError] = useState('');
  const [returnSuccess, setReturnSuccess] = useState('');

  // Reports state
  const [reportType, setReportType] = useState('CustomerCanBalance');
  const [reportStartDate, setReportStartDate] = useState('');
  const [reportEndDate, setReportEndDate] = useState('');
  const [reportData, setReportData] = useState([]);
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
    product: '20 Ltr Can',
    quantity: '',
    rate: '0',
    notes: '',
    functionName: '',
    eventDate: '',
    expectedReturnDate: ''
  });
  const [modalSupplyError, setModalSupplyError] = useState('');
  const [modalSupplySuccess, setModalSupplySuccess] = useState('');
  const [isSavingModalSupply, setIsSavingModalSupply] = useState(false);

  const suggestionsRef = useRef(null);
  const modalSuggestionsRef = useRef(null);

  // Initial loads
  useEffect(() => {
    fetchDashboardStats();
    fetchActiveBalances();
  }, []);

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

  // Supply Submission handler
  const handleSupplySubmit = async (e) => {
    e.preventDefault();
    setSupplyError('');
    setSupplySuccess('');

    const qty = parseInt(supplyForm.quantity, 10);
    const rate = parseFloat(supplyForm.rate || 0);

    if (isNaN(qty) || qty <= 0) {
      setSupplyError('Quantity supplied must be a valid number greater than 0.');
      return;
    }
    if (isNaN(rate) || rate < 0) {
      setSupplyError('Rate cannot be negative.');
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
        expectedReturnDate: supplyForm.expectedReturnDate
      };

      const res = await api.post('/can-supply', payload);
      if (res.data.ok) {
        setSupplySuccess('Supply logged successfully!');
        setSupplyForm({
          supplyType: 'Company Can',
          product: '20 Ltr Can',
          quantity: '',
          rate: '0',
          notes: '',
          functionName: '',
          eventDate: '',
          expectedReturnDate: ''
        });
        // Refresh details & dashboard
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
        // Refresh details & dashboard
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

  // Run Report query
  const fetchReport = async () => {
    try {
      setLoadingReports(true);
      const res = await api.get('/can-supply/reports', {
        params: {
          reportType,
          startDate: reportStartDate,
          endDate: reportEndDate
        }
      });
      if (res.data.ok) {
        setReportData(res.data.data || []);
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
    downloadCSV(customerDetails.ledger, filename);
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
      product: '20 Ltr Can',
      quantity: '',
      rate: '0',
      notes: '',
      functionName: '',
      eventDate: '',
      expectedReturnDate: ''
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

    if (isNaN(qty) || qty <= 0) {
      setModalSupplyError('Quantity supplied must be a valid number greater than 0.');
      return;
    }
    if (isNaN(rate) || rate < 0) {
      setModalSupplyError('Rate cannot be negative.');
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
        expectedReturnDate: modalSupplyForm.expectedReturnDate
      };

      const res = await api.post('/can-supply', payload);
      if (res.data.ok) {
        setModalSupplySuccess('Supply logged successfully!');
        setModalSupplyForm({
          supplyType: 'Company Can',
          product: '20 Ltr Can',
          quantity: '',
          rate: '0',
          notes: '',
          functionName: '',
          eventDate: '',
          expectedReturnDate: ''
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

  return (
    <div className="space-y-6 animate-fade-in max-w-6xl mx-auto pb-12">

      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase">Can Management System</h1>
          <p className="text-slate-500 text-sm font-medium mt-1">Manage, supply, and track return cycles for water cans and dispensers</p>
        </div>

        <div className="flex items-center gap-3 self-end md:self-center">
          <button 
            type="button"
            onClick={handleOpenNewSupplyModal}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md shadow-emerald-100 flex items-center gap-1.5 h-10"
          >
            <span>+</span> Can Supply / Billing Entry
          </button>

          {/* Tab Selection */}
          <div className="flex bg-slate-100 p-1 rounded-xl w-fit border border-slate-200/40">
          <button
            type="button"
            onClick={() => setActiveTab('active-balances')}
            className={`px-4 py-2 rounded-lg text-xs font-black tracking-wider transition-all uppercase ${activeTab === 'active-balances'
              ? 'bg-white text-slate-800 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
              }`}
          >
            📋 Outstanding Balances
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('workspace')}
            className={`px-4 py-2 rounded-lg text-xs font-black tracking-wider transition-all uppercase ${activeTab === 'workspace'
              ? 'bg-white text-slate-800 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
              }`}
          >
            🚚 Supply / Return Workspace
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('reports')}
            className={`px-4 py-2 rounded-lg text-xs font-black tracking-wider transition-all uppercase ${activeTab === 'reports'
              ? 'bg-white text-slate-800 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
              }`}
          >
            📈 Reports
          </button>
        </div>
      </div>
      </div>

      {/* DASHBOARD STATISTICS CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="card-premium flex items-center justify-between p-5 bg-white">
          <div>
            <p className="text-[10px] font-black text-slate-450 uppercase tracking-widest">Company Cans Out</p>
            <h3 className="text-2xl font-extrabold text-indigo-600 mt-1">
              {loadingDashboard ? '...' : stats.companyCansOut}
            </h3>
          </div>
          <div className="text-2xl">🥤</div>
        </div>

        <div className="card-premium flex items-center justify-between p-5 bg-white">
          <div>
            <p className="text-[10px] font-black text-slate-450 uppercase tracking-widest">Distributor Cans Out</p>
            <h3 className="text-2xl font-extrabold text-amber-600 mt-1">
              {loadingDashboard ? '...' : stats.distributorCansOut}
            </h3>
          </div>
          <div className="text-2xl">🏬</div>
        </div>

        <div className="card-premium flex items-center justify-between p-5 bg-white">
          <div>
            <p className="text-[10px] font-black text-slate-450 uppercase tracking-widest">Function Cans Out</p>
            <h3 className="text-2xl font-extrabold text-emerald-600 mt-1">
              {loadingDashboard ? '...' : stats.functionCansOut}
            </h3>
          </div>
          <div className="text-2xl">🎪</div>
        </div>

        <div className="card-premium flex items-center justify-between p-5 bg-white">
          <div>
            <p className="text-[10px] font-black text-slate-450 uppercase tracking-widest">Dispensers Out</p>
            <h3 className="text-2xl font-extrabold text-rose-500 mt-1">
              {loadingDashboard ? '...' : stats.dispensersOut}
            </h3>
          </div>
          <div className="text-2xl">💧</div>
        </div>

        <div className="card-premium flex items-center justify-between p-5 bg-slate-900 text-white">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pending Returns</p>
            <h3 className="text-2xl font-black text-primary mt-1">
              {loadingDashboard ? '...' : stats.totalPendingReturns}
            </h3>
          </div>
          <div className="text-2xl">⏰</div>
        </div>
      </div>

      {/* OVERDUE RETURNS ALERT AREA */}
      {overdueList.length > 0 && (
        <div className="bg-rose-50 border-2 border-rose-200/60 p-4 rounded-2xl animate-pulse-slow">
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
            <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-wider mb-2">Search Registry for customer (including 0 balances)</h4>
            <div className="relative max-w-md" ref={suggestionsRef}>
              <input
                type="text"
                placeholder="Type name or phone to start new supply..."
                value={searchQuery}
                onChange={handleSearchChange}
                className="input-premium h-11 w-full border-2 border-blue-500 focus:border-blue-600 focus:ring-4 focus:ring-blue-100 text-blue-900 placeholder:text-blue-300 font-bold"
                style={{ borderColor: '#3b82f6', outline: 'none' }}
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
            <div className="text-[11px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
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
                      No active balances found. Enter a customer name in the search bar below or use the "Workspace" tab to issue new supply.
                    </td>
                  </tr>
                ) : (
                  activeBalances.map((item) => {
                    const totalCans = item.cansOutCompany + item.cansOutDistributor + item.cansOutFunction;
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
                <div className="space-y-3.5 text-xs text-slate-600 font-semibold">
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
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Live Inventory Balance</div>
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
                        >
                          <option value="20 Ltr Can">20 Ltr Can</option>
                          <option value="Dispenser">Dispenser</option>
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="label-premium">Quantity (Full Supplied) *</label>
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
                        <label className="label-premium">Rate (Optional, Can be Zero)</label>
                        <input
                          type="number"
                          step="any"
                          placeholder="0"
                          value={supplyForm.rate}
                          onChange={(e) => setSupplyForm(prev => ({ ...prev, rate: e.target.value }))}
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
                    {supplyForm.quantity && (
                      <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl flex justify-between items-center text-xs font-bold text-slate-800">
                        <span>CALCULATED AMOUNT:</span>
                        <span className="text-sm font-black text-indigo-600">
                          ₹{(parseInt(supplyForm.quantity, 10) * parseFloat(supplyForm.rate || 0)).toLocaleString('en-IN')}
                        </span>
                      </div>
                    )}

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
                      {isSavingSupply ? 'Logging Transaction...' : '💾 Submit Supply'}
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
                            className="text-xs text-slate-450 hover:text-slate-700 font-extrabold"
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
                        📜 Customer Inventory Ledger Timeline
                      </h4>
                      <button
                        type="button"
                        onClick={handleDownloadLedgerCSV}
                        className="px-2.5 py-1 rounded border border-emerald-600/35 text-emerald-600 bg-emerald-50/20 hover:bg-emerald-600 hover:text-white transition-all text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5"
                      >
                        📥 Export CSV
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
                              <th className="py-2.5 px-4 text-left">Date</th>
                              <th className="py-2.5 px-4 text-left">Type</th>
                              <th className="py-2.5 px-4 text-left">Category</th>
                              <th className="py-2.5 px-4 text-left">Product</th>
                              <th className="py-2.5 px-4 text-right">Qty (+/-)</th>
                              <th className="py-2.5 px-4 text-right">Balance</th>
                              <th className="py-2.5 px-4 text-center">User</th>
                            </tr>
                          </thead>
                          <tbody>
                            {customerDetails.ledger.map((row) => (
                              <tr key={row.id} className="hover:bg-slate-50/50">
                                <td className="py-2.5 px-4 font-mono font-bold text-slate-500">{row.date}</td>
                                <td className="py-2.5 px-4">
                                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${row.type === 'SUPPLY' ? 'bg-indigo-50 text-indigo-600' : 'bg-rose-50 text-rose-500'
                                    }`}>
                                    {row.type}
                                  </span>
                                </td>
                                <td className="py-2.5 px-4 text-slate-500">{row.supplyType}</td>
                                <td className="py-2.5 px-4 text-slate-800 font-extrabold">{row.product}</td>
                                <td className={`py-2.5 px-4 text-right font-black ${row.type === 'SUPPLY' ? 'text-indigo-600' : 'text-rose-500'
                                  }`}>
                                  {row.type === 'SUPPLY' ? '+' : '-'}{row.quantity}
                                </td>
                                <td className="py-2.5 px-4 text-right font-black text-slate-800 bg-blue-50/10">
                                  {row.runningBalance}
                                </td>
                                <td className="py-2.5 px-4 text-center text-slate-450">{row.user}</td>
                              </tr>
                            ))}
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

      {/* VIEW 3: REPORTS TAB */}
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

              </table>
            )}
          </div>
        </div>
      )}

      {/* NEW CAN SUPPLY / BILLING ENTRY MODAL */}
      {isNewSupplyModalOpen && (
        <div className="modal modal-open">
          <div className="modal-box rounded-3xl max-w-xl p-0 border border-slate-200 shadow-2xl bg-white overflow-hidden flex flex-col h-[600px] pointer-events-auto">
            {/* Modal Header */}
            <div className="bg-emerald-600 p-6 text-white relative shrink-0">
              <h3 className="text-xl font-black italic tracking-tight">CAN SUPPLY / BILLING ENTRY</h3>
              <p className="text-emerald-100 text-xs mt-1 font-medium italic opacity-90">
                Log a fresh can or dispenser supply transaction
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
            <div className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar">
              
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
                <div className="bg-slate-50 border border-slate-200/60 p-4 rounded-xl space-y-2.5 text-xs text-slate-600">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-extrabold text-slate-800 text-sm">{modalSelectedCustomer.name}</h4>
                      <p className="text-[10px] text-slate-400 font-bold">{modalSelectedCustomer.id} | {modalSelectedCustomer.customerType}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setModalSelectedCustomerId(null); setModalSelectedCustomer(null); }}
                      className="text-red-500 hover:text-red-700 font-extrabold text-[10px] uppercase"
                    >
                      Clear Selection
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
                      >
                        <option value="20 Ltr Can">20 Ltr Can</option>
                        <option value="Dispenser">Dispenser</option>
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
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">Rate (Zero if default)</label>
                      <input
                        type="number"
                        step="any"
                        placeholder="0"
                        value={modalSupplyForm.rate}
                        onChange={(e) => setModalSupplyForm(prev => ({ ...prev, rate: e.target.value }))}
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

                  {modalSupplyForm.quantity && (
                    <div className="bg-slate-50 border border-slate-200/50 p-3 rounded-lg flex justify-between items-center text-[10px] font-bold text-slate-650">
                      <span>ESTIMATED AMOUNT:</span>
                      <span className="text-xs font-black text-emerald-600">
                        ₹{(parseInt(modalSupplyForm.quantity, 10) * parseFloat(modalSupplyForm.rate || 0)).toLocaleString('en-IN')}
                      </span>
                    </div>
                  )}
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
                {isSavingModalSupply ? 'Logging supply...' : '💾 Save Supply Entry'}
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