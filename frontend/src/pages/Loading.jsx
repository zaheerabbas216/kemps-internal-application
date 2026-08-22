import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { createPortal } from 'react-dom';
import api from '../api/axios';
import SearchableSelect from '../components/SearchableSelect';

const Loading = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // Active workspace tabs: 'new-loading' | 'active-profiles' | 'history'
  const [activeTab, setActiveTab] = useState('active-profiles');
  const [isFormOpen, setIsFormOpen] = useState(false);

  // Master lists
  const [finishedProducts, setFinishedProducts] = useState([]);
  const [customers, setCustomers] = useState([]);

  // ==========================================
  // NEW LOADING FORM STATE
  // ==========================================
  const [loadingInfo, setLoadingInfo] = useState({
    customerId: '',
    customerName: '',
    customerPhone: '',
    customerGstin: '',
    customerAddress: '',
    godown: 'KI', // Default to KI
    remarks: ''
  });

  const [formItems, setFormItems] = useState([
    { id: Math.random().toString(36).substring(2, 9), finishedProductId: '', quantity: '', returnQty: '' }
  ]);

  // Autocomplete search states
  const [nameSearchText, setNameSearchText] = useState('');
  const [phoneSearchText, setPhoneSearchText] = useState('');
  const [filteredCustomers, setFilteredCustomers] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Status/saving states
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  // ==========================================
  // ACTIVE PROFILES STATE
  // ==========================================
  const [activeProfiles, setActiveProfiles] = useState([]);
  const [loadingActive, setLoadingActive] = useState(false);
  const [activePage, setActivePage] = useState(1);
  const activeLimit = 10;

  // ==========================================
  // TODAY'S HISTORY STATE (COMPLETED/BILLED TODAY)
  // ==========================================
  const [todayHistorySessions, setTodayHistorySessions] = useState([]);
  const [loadingTodayHistory, setLoadingTodayHistory] = useState(false);
  const [todayHistoryCount, setTodayHistoryCount] = useState(0);
  const [todayHistoryPage, setTodayHistoryPage] = useState(1);
  const todayHistoryLimit = 10;

  // ==========================================
  // HISTORY STATE
  // ==========================================
  const [historySessions, setHistorySessions] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyCount, setHistoryCount] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const historyLimit = 10;

  // History Filters
  const [filterSearch, setFilterSearch] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterGodown, setFilterGodown] = useState('');

  // ==========================================
  // MODALS & ACTIONS
  // ==========================================
  // View Session Modal
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [sessionDetail, setSessionDetail] = useState(null);
  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
  const [loadingSessionDetail, setLoadingSessionDetail] = useState(false);
  const [sessionRemarks, setSessionRemarks] = useState('');
  const [isUpdatingRemarks, setIsUpdatingRemarks] = useState(false);

  // POS Slip Print Modal
  const [printTripId, setPrintTripId] = useState(null);
  const [printData, setPrintData] = useState(null);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [loadingPrint, setLoadingPrint] = useState(false);

  // Reference for print element
  const printContainerRef = useRef(null);

  // ==========================================
  // RETURN GOODS MODAL STATE
  // ==========================================
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [returnSession, setReturnSession] = useState(null);
  const [returnFormItems, setReturnFormItems] = useState([
    { id: Math.random().toString(36).substring(2, 9), finishedProductId: '', quantity: '' }
  ]);
  const [isSavingReturn, setIsSavingReturn] = useState(false);
  const [returnError, setReturnError] = useState('');

  const handleOpenReturnModal = (session) => {
    setReturnSession(session);
    setReturnError('');
    setReturnFormItems([
      { id: Math.random().toString(36).substring(2, 9), finishedProductId: '', quantity: '' }
    ]);
    setIsReturnModalOpen(true);
  };

  const handleAddReturnProductRow = () => {
    setReturnFormItems(prev => [
      ...prev,
      { id: Math.random().toString(36).substring(2, 9), finishedProductId: '', quantity: '' }
    ]);
  };

  const handleRemoveReturnProductRow = (rowId) => {
    setReturnFormItems(prev => prev.filter(item => item.id !== rowId));
  };

  const handleReturnItemRowChange = (rowId, fieldName, val) => {
    setReturnFormItems(prev =>
      prev.map(item => (item.id === rowId ? { ...item, [fieldName]: val } : item))
    );
  };

  const handleSaveReturn = async (e) => {
    e.preventDefault();
    setReturnError('');
    
    if (returnFormItems.length === 0) {
      setReturnError('Please add at least one product row to return.');
      return;
    }

    const loadedItemsList = returnSession?.items || returnSession?.consolidatedItems || [];
    const loadedItems = loadedItemsList.filter(item => item.quantity > 0);

    const itemsPayload = [];
    const seenProductIds = new Set();

    for (const item of returnFormItems) {
      if (!item.finishedProductId) {
        setReturnError('Please select a finished product for all rows.');
        return;
      }

      if (seenProductIds.has(item.finishedProductId)) {
        setReturnError('Duplicate products are not allowed in the return list. Please adjust the quantities on a single row.');
        return;
      }
      seenProductIds.add(item.finishedProductId);

      const selectedItem = loadedItems.find(i => String(i.finishedProductId) === String(item.finishedProductId));
      if (!selectedItem) {
        setReturnError('Please select a valid product loaded in this session.');
        return;
      }

      const maxAvailable = selectedItem.netLoadingQty;
      const qtyNum = parseInt(item.quantity, 10);
      if (isNaN(qtyNum) || qtyNum <= 0) {
        setReturnError('Quantity must be greater than 0 for all rows.');
        return;
      }
      if (qtyNum > maxAvailable) {
        setReturnError(`Cannot return more than available quantity (${maxAvailable}) for product "${selectedItem.productName}".`);
        return;
      }

      itemsPayload.push({
        finishedProductId: parseInt(item.finishedProductId, 10),
        quantity: qtyNum,
        reason: 'Loading Return'
      });
    }

    try {
      setIsSavingReturn(true);
      const res = await api.post(`/loading/session/${returnSession.id}/return`, {
        items: itemsPayload
      });

      if (res.data.ok) {
        alert('Return recorded successfully!');
        setIsReturnModalOpen(false);
        setReturnSession(null);
        // Refresh session details if details modal is open
        if (isSessionModalOpen && selectedSessionId) {
          handleOpenSessionDetail(selectedSessionId);
        }
        // Refresh lists
        fetchActiveProfiles();
        fetchHistory();
      } else {
        setReturnError(res.data.error || 'Failed to record return.');
      }
    } catch (err) {
      console.error(err);
      setReturnError(err.response?.data?.error || 'Error saving return.');
    } finally {
      setIsSavingReturn(false);
    }
  };

  // ==========================================
  // INITIAL LOAD
  // ==========================================
  useEffect(() => {
    fetchDropdownMasters();
    fetchActiveProfiles();
    fetchTodayHistory();
  }, []);

  useEffect(() => {
    const preloadOrder = location.state?.preloadOrder;
    if (preloadOrder) {
      const order = preloadOrder.order || preloadOrder;
      const items = preloadOrder.items || order.items || [];

      // Open new loading session modal form
      setIsFormOpen(true);

      const companyVal = String(order.company || '').toUpperCase();
      const resolvedGodown = companyVal.includes('PET') || companyVal.includes('KP') ? 'KP' : 'KI';

      setLoadingInfo({
        customerId: order.customer_id || '',
        customerName: order.customer_name || '',
        customerPhone: order.customer_phone || '',
        customerGstin: order.customer_gstin || '',
        customerAddress: order.customer_address || '',
        godown: resolvedGodown,
        remarks: `Transferred from Order #${order.id || ''}`
      });

      setNameSearchText(order.customer_name || '');
      setPhoneSearchText(order.customer_phone || '');

      if (items.length > 0) {
        const prefilledFormItems = items.map(item => {
          const pId = item.finishedProductId || item.finished_product_id || item.product_id || item.productId;
          let finalId = pId ? String(pId) : '';

          if (!finalId && (item.productName || item.product_name)) {
            const pName = String(item.productName || item.product_name).toLowerCase().trim();
            const matchedFp = finishedProducts.find(fp => String(fp.name).toLowerCase().trim() === pName);
            if (matchedFp) {
              finalId = String(matchedFp.id);
            }
          }

          return {
            id: Math.random().toString(36).substring(2, 9),
            finishedProductId: finalId,
            quantity: String(item.quantity || item.qty || '0'),
            returnQty: '0'
          };
        });
        setFormItems(prefilledFormItems);
      }

      setFormSuccess(`Pre-filled loading session from Order #${order.id || ''}`);

      // Clear location state
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  useEffect(() => {
    if (activeTab === 'active-profiles') {
      fetchActiveProfiles();
      fetchTodayHistory();
    } else if (activeTab === 'history') {
      fetchHistory();
    }
  }, [activeTab, historyPage, todayHistoryPage, filterSearch, filterStartDate, filterEndDate, filterGodown]);

  const fetchDropdownMasters = async () => {
    try {
      const [fpRes, custRes] = await Promise.all([
        api.get('/finished-products', { params: { limit: 250 } }),
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

  const fetchActiveProfiles = async () => {
    try {
      setLoadingActive(true);
      const res = await api.get('/loading/active');
      if (res.data.ok) {
        setActiveProfiles(res.data.sessions || []);
      }
    } catch (err) {
      console.error('Failed to load active profiles:', err);
    } finally {
      setLoadingActive(false);
    }
  };

  const fetchTodayHistory = async () => {
    try {
      setLoadingTodayHistory(true);
      const todayStr = new Date().toLocaleDateString('sv-SE');
      const res = await api.get('/loading/history', {
        params: {
          page: todayHistoryPage,
          limit: todayHistoryLimit,
          startDate: todayStr,
          endDate: todayStr,
          statusNot: 'ACTIVE'
        }
      });
      if (res.data.ok) {
        setTodayHistorySessions(res.data.sessions || []);
        setTodayHistoryCount(res.data.total || 0);
      }
    } catch (err) {
      console.error('Failed to load today history:', err);
    } finally {
      setLoadingTodayHistory(false);
    }
  };

  const fetchHistory = async () => {
    try {
      setLoadingHistory(true);
      const res = await api.get('/loading/history', {
        params: {
          page: historyPage,
          limit: historyLimit,
          search: filterSearch,
          startDate: filterStartDate,
          endDate: filterEndDate,
          godown: filterGodown
        }
      });
      if (res.data.ok) {
        setHistorySessions(res.data.sessions || []);
        setHistoryCount(res.data.total || 0);
      }
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  // ==========================================
  // CUSTOMER AUTOCOMPLETE ACTIONS
  // ==========================================
  const handleNameSearchChange = (e) => {
    const txt = e.target.value;
    setNameSearchText(txt);
    setLoadingInfo(prev => ({ ...prev, customerName: txt }));

    if (txt.trim().length > 0) {
      const filtered = customers.filter(c => 
        c.name.toLowerCase().includes(txt.toLowerCase()) || 
        c.phone.includes(txt)
      );
      setFilteredCustomers(filtered);
      setShowSuggestions(true);
    } else {
      setFilteredCustomers([]);
      setShowSuggestions(false);
    }
  };

  const handleSelectSuggestion = (cust) => {
    setLoadingInfo(prev => ({
      ...prev,
      customerId: cust.id,
      customerName: cust.name,
      customerPhone: cust.phone,
      customerGstin: cust.gst || '',
      customerAddress: cust.address || ''
    }));
    setNameSearchText(cust.name);
    setPhoneSearchText(cust.phone);
    setShowSuggestions(false);
    setFormError('');
  };

  const handlePhoneSearchSubmit = async () => {
    if (!phoneSearchText.trim()) return;
    try {
      const res = await api.get('/customers', { params: { phone: phoneSearchText } });
      if (res.data.exists) {
        const c = res.data.customer;
        setLoadingInfo(prev => ({
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
        setFormError('Customer not found. You can enter details manually to create a new customer record.');
      }
    } catch (err) {
      setFormError(err.response?.data?.error || err.message);
    }
  };

  const handleClearCustomer = () => {
    setLoadingInfo(prev => ({
      ...prev,
      customerId: '',
      customerName: '',
      customerPhone: '',
      customerGstin: '',
      customerAddress: ''
    }));
    setNameSearchText('');
    setPhoneSearchText('');
    setShowSuggestions(false);
    setFormError('');
  };

  // ==========================================
  // TRIP ITEMS ACTIONS
  // ==========================================
  const handleAddProductRow = () => {
    setFormItems(prev => [
      ...prev,
      { id: Math.random().toString(36).substring(2, 9), finishedProductId: '', quantity: '', returnQty: '' }
    ]);
  };

  const handleRemoveProductRow = (rowId) => {
    setFormItems(prev => prev.filter(item => item.id !== rowId));
  };

  const handleItemRowChange = (rowId, fieldName, val) => {
    setFormItems(prev =>
      prev.map(item => (item.id === rowId ? { ...item, [fieldName]: val } : item))
    );
  };

  const handleResetForm = () => {
    handleClearCustomer();
    setLoadingInfo(prev => ({ ...prev, godown: 'KI', remarks: '' }));
    setFormItems([{ id: Math.random().toString(36).substring(2, 9), finishedProductId: '', quantity: '', returnQty: '' }]);
    setFormError('');
    setFormSuccess('');
  };

  // ==========================================
  // SUBMIT TRIP LOG
  // ==========================================
  const handleSubmitLoading = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    const { customerName, customerPhone, customerGstin, customerAddress, godown, remarks } = loadingInfo;

    if (!customerName || !customerName.trim()) return setFormError('Customer Name is required.');
    if (!customerPhone || customerPhone.length < 10) return setFormError('Customer Phone is required (at least 10 digits).');
    if (!godown) return setFormError('Godown selection is required.');
    if (formItems.length === 0) return setFormError('Please add at least one product line.');

    const itemsPayload = [];
    for (const item of formItems) {
      if (!item.finishedProductId) {
        return setFormError('Please select a finished product for all rows.');
      }
      const qty = parseInt(item.quantity, 10) || 0;
      const ret = parseInt(item.returnQty, 10) || 0;
      if (qty < 0 || ret < 0) {
        return setFormError('Quantities cannot be negative.');
      }
      if (qty === 0 && ret === 0) {
        continue; // skip completely empty entries
      }
      itemsPayload.push({
        finishedProductId: parseInt(item.finishedProductId, 10),
        quantity: qty,
        returnQty: ret
      });
    }

    if (itemsPayload.length === 0) {
      return setFormError('Please add quantities to at least one product row.');
    }

    setIsSaving(true);
    try {
      const payload = {
        customerPhone,
        customerName,
        customerGstin,
        customerAddress,
        godown,
        remarks,
        items: itemsPayload
      };

      const res = await api.post('/loading', payload);
      if (res.data.ok) {
        setFormSuccess(`Trip #${res.data.tripNumber} saved successfully for ${customerName}!`);
        const savedTripId = res.data.tripId;
        
        // Trigger POS Print details view
        handleTriggerPrint(savedTripId);

        // Reset inputs
        handleResetForm();
        fetchActiveProfiles();
        setTimeout(() => {
          setIsFormOpen(false);
        }, 1000);
      } else {
        setFormError(res.data.error || 'Failed to submit loading.');
      }
    } catch (err) {
      setFormError(err.response?.data?.error || err.message || 'An error occurred.');
    } finally {
      setIsSaving(false);
    }
  };

  // ==========================================
  // POS PRINT ACTIONS
  // ==========================================
  const handleTriggerPrint = async (tripId) => {
    try {
      setLoadingPrint(true);
      setPrintTripId(tripId);
      setIsPrintModalOpen(true);
      
      const res = await api.get(`/loading/trip/${tripId}`);
      if (res.data.ok) {
        setPrintData(res.data);
      } else {
        alert(res.data.error || 'Failed to fetch trip print details.');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to load slip print details.');
    } finally {
      setLoadingPrint(false);
    }
  };

  const executePOSPrint = () => {
    if (!printData) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Pop-up blocker is preventing print dialog. Please allow popups for this site.');
      return;
    }
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Loading Trip - Trip #${printData.trip.trip_number}</title>
          <style>
            * {
              box-sizing: border-box;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
              color: #000000 !important;
              font-weight: 800 !important;
            }
            body { 
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; 
              font-weight: 800;
              padding: 10px 6px; 
              color: #000000 !important; 
              width: 280px; 
              font-size: 13px; 
              line-height: 1.35; 
              margin: 0 auto;
              -webkit-font-smoothing: antialiased;
            }
            .center { text-align: center; }
            .bold { font-weight: 900 !important; }
            .divider { border-bottom: 2px dashed #000000; margin: 8px 0; }
            .header h3 { margin: 0; text-transform: uppercase; font-size: 16px; font-weight: 900 !important; letter-spacing: 0.5px; }
            .header p { margin: 2px 0; font-size: 11px; font-weight: 800 !important; }
            .meta-table, .items-table { width: 100%; border-collapse: collapse; font-size: 12px; font-weight: 800 !important; }
            .meta-table td { padding: 2px 0; color: #000000 !important; font-weight: 800 !important; }
            .items-table th { border-bottom: 2px dashed #000000; padding: 4px 0; text-align: left; font-size: 11px; font-weight: 900 !important; }
            .items-table td { padding: 4px 0; vertical-align: top; font-weight: 800 !important; color: #000000 !important; }
            .right { text-align: right; }
            .remarks-box { margin-top: 6px; font-size: 11px; font-weight: 800 !important; border: 1.5px dashed #000000; padding: 5px; color: #000000 !important; }
            .sig-section { margin-top: 35px; display: flex; justify-content: space-between; font-size: 11px; font-weight: 800 !important; }
            .sig-box { width: 90px; text-align: center; font-weight: 800 !important; }
            .sig-line { border-top: 1.5px solid #000000; margin-bottom: 3px; }
            .footer-msg { margin-top: 18px; text-align: center; font-size: 11px; font-weight: 800 !important; }
            @media print {
              body { 
                padding: 0; 
                margin: 0; 
                width: 100%; 
                color: #000000 !important; 
                font-weight: 800 !important; 
              }
              * { 
                color: #000000 !important; 
                font-weight: 800 !important; 
              }
              .bold, h3, th, .header h3 { 
                font-weight: 900 !important; 
              }
              @page {
                margin: 2mm;
                size: auto;
              }
            }
          </style>
        </head>
        <body>
          <div class="header center">
            <h3 class="bold">KEMP'S INDUSTRIES</h3>
            <p class="bold">QUALITY WATER & JUICE SUPPLIERS</p>
            <p class="bold">Godown: ${printData.trip.godown === 'KI' ? "Kempannavar (KI)" : "Kemps Pet (KP)"}</p>
          </div>
          
          <div class="divider"></div>
          
          <table class="meta-table">
            <tr>
              <td class="bold">Trip No:</td>
              <td class="right bold">Trip #${printData.trip.trip_number}</td>
            </tr>
            <tr>
              <td class="bold">Date:</td>
              <td class="right bold">${formatDateDDMMYYYY(printData.trip.loading_date)}</td>
            </tr>
            <tr>
              <td class="bold">Time:</td>
              <td class="right bold">${new Date(printData.trip.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
            </tr>
            <tr>
              <td class="bold">Customer:</td>
              <td class="right bold">${printData.trip.customer_name}</td>
            </tr>
            <tr>
              <td class="bold">Phone:</td>
              <td class="right bold">${printData.trip.customer_phone}</td>
            </tr>
          </table>

          <div class="divider"></div>

          <table class="items-table">
            <thead>
              <tr>
                <th style="width: 50%;" class="bold">PRODUCT</th>
                <th class="right bold" style="width: 16%;">QTY</th>
                <th class="right bold" style="width: 16%;">RET</th>
                <th class="right bold" style="width: 18%;">NET</th>
              </tr>
            </thead>
            <tbody>
              ${printData.items.map(item => `
                <tr>
                  <td class="bold">${item.productName}</td>
                  <td class="right bold">${item.quantity}</td>
                  <td class="right bold">${item.returnQty}</td>
                  <td class="right bold">${item.netLoadingQty}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="divider"></div>

          ${printData.trip.remarks ? `
            <div class="remarks-box">
              <span class="bold">Remarks:</span> <span class="bold">${printData.trip.remarks}</span>
            </div>
            <div class="divider"></div>
          ` : ''}

          <div class="sig-section">
            <div class="sig-box">
              <div class="sig-line"></div>
              <span class="bold">Staff Sign</span>
            </div>
            <div class="sig-box">
              <div class="sig-line"></div>
              <span class="bold">Driver/Cust</span>
            </div>
          </div>

          <div class="footer-msg">
            <p class="bold">*** Thank You ***</p>
            <p class="bold">Powered by Kemp's Inventory System</p>
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

  // ==========================================
  // DETAIL MODAL ACTIONS
  // ==========================================
  const handleOpenSessionDetail = async (sessionId) => {
    try {
      setSelectedSessionId(sessionId);
      setIsSessionModalOpen(true);
      setLoadingSessionDetail(true);

      const res = await api.get(`/loading/session/${sessionId}`);
      if (res.data.ok) {
        setSessionDetail(res.data);
        setSessionRemarks(res.data.session.remarks || '');
      } else {
        alert(res.data.error || 'Failed to fetch profile details.');
        setIsSessionModalOpen(false);
      }
    } catch (err) {
      console.error(err);
      alert('Failed to load profile details.');
      setIsSessionModalOpen(false);
    } finally {
      setLoadingSessionDetail(false);
    }
  };

  const handleUpdateRemarks = async () => {
    try {
      setIsUpdatingRemarks(true);
      const res = await api.post(`/loading/session/${selectedSessionId}/remarks`, { remarks: sessionRemarks });
      if (res.data.ok) {
        alert('Remarks updated successfully!');
        // Reload detail
        const updated = await api.get(`/loading/session/${selectedSessionId}`);
        if (updated.data.ok) {
          setSessionDetail(updated.data);
        }
        fetchActiveProfiles();
      } else {
        alert(res.data.error || 'Failed to update remarks.');
      }
    } catch (err) {
      console.error(err);
      alert('Error updating remarks.');
    } finally {
      setIsUpdatingRemarks(false);
    }
  };

  // ==========================================
  // BILLING INTEGRATION
  // ==========================================
  const handleGenerateBill = (session) => {
    // Collect aggregated items
    const preloadItems = session.items.map(item => ({
      finishedProductId: item.finishedProductId,
      productName: item.productName,
      quantity: item.quantity
    })).filter(i => i.quantity > 0);

    if (preloadItems.length === 0) {
      alert("This customer's loading session has no loaded quantities. Cannot generate bill.");
      return;
    }

    // Redirect to billing workspace passing state
    navigate('/billing-form', {
      state: {
        preloadLoading: {
          loadingSessionId: session.id,
          customer: {
            id: session.customer_id,
            name: session.customer_name,
            phone: session.customer_phone,
            gstin: session.customer_gstin,
            address: session.customer_address
          },
          items: preloadItems
        }
      }
    });
  };

  const handleMarkCompleted = async (session) => {
    if (!window.confirm(`Are you sure you want to mark the loading sheet for ${session.customer_name} as completed? This will close the loading session.`)) {
      return;
    }
    try {
      const res = await api.post(`/loading/session/${session.id}/complete`);
      if (res.data.ok) {
        alert('Loading session marked as completed.');
        setIsSessionModalOpen(false);
        setSessionDetail(null);
        fetchActiveProfiles();
        fetchTodayHistory();
        fetchHistory();
      } else {
        alert(res.data.error || 'Failed to complete session.');
      }
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || 'Error completing loading session.');
    }
  };

  // Helper date formatter
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
      
      {!isFormOpen ? (
        <>
          {/* HEADER SECTION */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase">Loading Workspace</h1>
              <p className="text-slate-500 text-sm font-medium mt-1">Manage daily loading sheets and log trips for customers</p>
            </div>
            <div className="flex gap-2">
              <button 
                type="button"
                onClick={() => {
                  setFormError('');
                  setFormSuccess('');
                  setIsFormOpen(true);
                }}
                className="btn-premium btn-primary-premium h-12 text-xs flex items-center gap-1.5"
              >
                🚚 New Loading
              </button>
            </div>
          </div>

          {/* TABS FOR ACTIVE TODAY VS HISTORY */}
          <div className="border border-slate-200/60 bg-white rounded-2xl p-4 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="text-[11px] font-black text-slate-450 uppercase tracking-widest flex items-center gap-1.5">
                <span>📋</span> View Loading Sheets
              </div>
              <div className="flex bg-slate-100 p-1 rounded-xl w-fit border border-slate-200/40">
                <button
                  type="button"
                  onClick={() => setActiveTab('active-profiles')}
                  className={`px-4 py-1.5 rounded-lg text-[10px] font-black tracking-wider transition-all uppercase ${
                    activeTab === 'active-profiles'
                      ? 'bg-white text-slate-800 shadow-sm font-extrabold'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  ⚡ Active Today ({activeProfiles.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('history')}
                  className={`px-4 py-1.5 rounded-lg text-[10px] font-black tracking-wider transition-all uppercase ${
                    activeTab === 'history'
                      ? 'bg-white text-slate-800 shadow-sm font-extrabold'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  ⏳ Completed / History
                </button>
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Back button */}
          <div className="flex justify-start">
            <button 
              type="button"
              onClick={() => {
                setIsFormOpen(false);
                handleResetForm();
              }}
              className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
            >
              <span>←</span> Back to Workspace
            </button>
          </div>

          {/* Heading */}
          <div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase">New Loading</h1>
            <p className="text-slate-500 text-xs font-semibold mt-1">Record a new loading trip for a customer</p>
          </div>
        </>
      )}

      {isFormOpen && (
        <form onSubmit={handleSubmitLoading} className="space-y-6">
          
          {/* CUSTOMER SEARCH CARD */}
          <div className="border border-slate-200/80 rounded-2xl bg-white p-5 space-y-4 shadow-sm">
            <div className="text-[11px] font-black text-slate-450 uppercase tracking-widest border-b border-slate-100 pb-2.5 flex justify-between items-center">
              <span>👤 CUSTOMER & GODOWN DETAILS</span>
              {loadingInfo.customerId && (
                <span className="bg-emerald-50 border border-emerald-100 text-emerald-600 rounded-lg px-2.5 py-0.5 text-[10px] font-extrabold">
                  RESOLVED: {loadingInfo.customerId}
                </span>
              )}
            </div>

            {/* Auto suggestions rows */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end bg-slate-50/50 p-4 rounded-xl border border-slate-100 relative">
              
              {/* Search by Name */}
              <div className="md:col-span-5 space-y-1.5 relative">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">
                  Search Name *
                </label>
                <input 
                  type="text"
                  placeholder="Type customer name..."
                  value={nameSearchText}
                  onChange={handleNameSearchChange}
                  onFocus={() => { if (nameSearchText.trim()) setShowSuggestions(true); }}
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                  required
                />
                
                {/* Suggestions Dropdown */}
                {showSuggestions && filteredCustomers.length > 0 && (
                  <ul className="absolute z-20 w-full left-0 mt-1.5 bg-white border border-slate-200 rounded-xl max-h-48 overflow-y-auto shadow-lg divide-y divide-slate-100">
                    {filteredCustomers.map(c => (
                      <li 
                        key={c.id}
                        onClick={() => handleSelectSuggestion(c)}
                        className="px-4 py-2.5 text-xs text-slate-750 hover:bg-slate-50 cursor-pointer flex justify-between font-bold"
                      >
                        <span>{c.name}</span>
                        <span className="text-[10px] text-slate-400 font-bold">{c.phone}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Separator */}
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
                  className="px-4 h-11 bg-primary hover:bg-blue-600 text-white font-bold text-xs rounded-xl shadow-md transition-all duration-200 flex items-center gap-1 shrink-0"
                >
                  🔍 Search
                </button>
                <button
                  type="button"
                  onClick={handleClearCustomer}
                  className="px-3.5 h-11 bg-white border border-slate-200 text-slate-550 hover:bg-slate-50 font-bold text-xs rounded-xl shrink-0"
                >
                  Clear
                </button>
              </div>

              {/* Action for clean input */}
              <div className="md:col-span-12">
                <button
                  type="button"
                  onClick={handleClearCustomer}
                  className="w-full py-2 border border-dashed border-primary/30 text-primary bg-primary/5 hover:bg-primary/10 transition-all text-xs font-bold rounded-xl block text-center"
                >
                  + Create New Customer Record (Fill manually below)
                </button>
              </div>
            </div>

            {/* Inputs grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-slate-100 pt-4">
              
              {/* Customer Name */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-black text-slate-550 uppercase tracking-wider block">
                  Customer Name *
                </label>
                <input 
                  type="text"
                  value={loadingInfo.customerName}
                  onChange={(e) => {
                    setLoadingInfo(prev => ({ ...prev, customerName: e.target.value }));
                    setNameSearchText(e.target.value);
                  }}
                  placeholder="Enter name"
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-750 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                  required
                />
              </div>

              {/* Phone */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider block">
                  Phone Number *
                </label>
                <input 
                  type="text"
                  value={loadingInfo.customerPhone}
                  onChange={(e) => {
                    setLoadingInfo(prev => ({ ...prev, customerPhone: e.target.value }));
                    setPhoneSearchText(e.target.value);
                  }}
                  placeholder="10 digit number"
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                  required
                />
              </div>

              {/* Godown Selection */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-black text-slate-550 uppercase tracking-wider block">
                  Select Godown *
                </label>
                <select
                  value={loadingInfo.godown}
                  onChange={(e) => setLoadingInfo(prev => ({ ...prev, godown: e.target.value }))}
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-semibold"
                  required
                >
                  <option value="KI">KI (Kempannavar Industries)</option>
                  <option value="KP">KP (Kemps Pet Industries)</option>
                </select>
              </div>

              {/* Optional Fields */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-black text-slate-450 uppercase tracking-wider block">
                  GSTIN (Optional)
                </label>
                <input 
                  type="text"
                  value={loadingInfo.customerGstin}
                  onChange={(e) => setLoadingInfo(prev => ({ ...prev, customerGstin: e.target.value }))}
                  placeholder="GST Number"
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                />
              </div>

              {/* Address */}
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-[11px] font-black text-slate-450 uppercase tracking-wider block">
                  Address (Optional)
                </label>
                <input 
                  type="text"
                  value={loadingInfo.customerAddress}
                  onChange={(e) => setLoadingInfo(prev => ({ ...prev, customerAddress: e.target.value }))}
                  placeholder="Customer address"
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                />
              </div>

            </div>
          </div>

          {/* LOADING ENTRY FORM ITEMS */}
          <div className="border border-slate-200/80 rounded-2xl bg-white p-5 space-y-4 shadow-sm">
            <div className="flex justify-between items-center border-b border-slate-100 pb-2.5">
              <div className="text-[11px] font-black text-slate-450 uppercase tracking-widest flex items-center gap-1.5">
                <span>🛒 PRODUCTS TO LOAD</span>
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
              {formItems.map((row, index) => {
                const qty = parseInt(row.quantity, 10) || 0;
                const ret = parseInt(row.returnQty, 10) || 0;
                const net = qty - ret;

                return (
                  <div 
                    key={row.id} 
                    className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end bg-slate-50/40 border border-slate-100 p-4 rounded-2xl relative group"
                  >
                    
                    {/* Finished Product Dropdown */}
                    <div className="md:col-span-5 space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
                        Product #{index + 1}
                      </label>
                      <SearchableSelect
                        options={finishedProducts.map(fp => ({ value: fp.id, label: fp.name }))}
                        value={row.finishedProductId}
                        onChange={(val) => handleItemRowChange(row.id, 'finishedProductId', val)}
                        placeholder="-- Select Product --"
                        searchPlaceholder="Type product name or number (e.g. 1, 500ml)..."
                        className="!h-11 font-semibold text-slate-750"
                      />
                    </div>

                    {/* Qty (Boxes) */}
                    <div className="md:col-span-2 space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
                        Qty (Boxes)
                      </label>
                      <input 
                        type="number"
                        min="0"
                        value={row.quantity}
                        onChange={(e) => handleItemRowChange(row.id, 'quantity', e.target.value)}
                        placeholder="0"
                        className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </div>

                    {/* Return Qty */}
                    <div className="md:col-span-2 space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
                        Return
                      </label>
                      <input 
                        type="number"
                        min="0"
                        value={row.returnQty}
                        onChange={(e) => handleItemRowChange(row.id, 'returnQty', e.target.value)}
                        placeholder="0"
                        className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </div>

                    {/* Net loading (calculated) */}
                    <div className="md:col-span-3 space-y-1.5 flex gap-2 items-end">
                      <div className="flex-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
                          Loading Qty
                        </label>
                        <div className={`w-full h-11 rounded-xl border flex items-center justify-center font-black text-sm select-none ${net < 0 ? 'bg-rose-50 border-rose-200 text-rose-600' : 'bg-slate-100 border-slate-200 text-slate-700'}`}>
                          {net}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveProductRow(row.id)}
                        className="w-11 h-11 rounded-xl bg-white border border-slate-200 hover:border-red-200 hover:bg-red-50 hover:text-red-500 text-slate-450 transition-all flex items-center justify-center font-bold text-xs shrink-0"
                        title="Remove Row"
                      >
                        ✕
                      </button>
                    </div>

                  </div>
                );
              })}

              {formItems.length === 0 && (
                <div className="py-12 border border-dashed border-slate-200 rounded-2xl bg-slate-50/20 text-center text-slate-450 font-bold text-xs">
                  No items in this slip. Click "+ Add Product Row" to begin.
                </div>
              )}
            </div>
          </div>

          {/* NOTES & SUBMIT */}
          <div className="border border-slate-200/80 rounded-2xl bg-white p-5 space-y-4 shadow-sm">
            <div className="space-y-1.5">
              <label className="text-[11px] font-black text-slate-450 uppercase tracking-wider block">
                Remarks / Notes (Optional)
              </label>
              <textarea 
                value={loadingInfo.remarks}
                onChange={(e) => setLoadingInfo(prev => ({ ...prev, remarks: e.target.value }))}
                placeholder="Enter trip description or special loading notes..."
                className="w-full p-4 rounded-xl border border-slate-200 bg-white text-slate-750 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium h-24 resize-none"
              />
            </div>

            {formError && (
              <div className="bg-rose-50 text-rose-600 px-4 py-3 rounded-xl text-xs font-semibold border border-rose-100">
                ⚠️ {formError}
              </div>
            )}
            {formSuccess && (
              <div className="bg-emerald-50 text-emerald-600 px-4 py-3 rounded-xl text-xs font-semibold border border-emerald-100 animate-fade-in">
                ✅ {formSuccess}
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={isSaving}
                className="flex-1 h-12 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-black text-sm shadow-md shadow-emerald-100 flex items-center justify-center gap-1.5 transition-all duration-200 active:scale-98"
              >
                {isSaving ? <span className="loading loading-spinner text-white"></span> : '💾 Submit Loading'}
              </button>
              <button
                type="button"
                onClick={handleResetForm}
                className="w-32 h-12 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-650 font-bold text-xs transition-all duration-200"
              >
                🔄 Reset
              </button>
            </div>
          </div>

        </form>
      )}

      {activeTab === 'active-profiles' && !isFormOpen && (
        <div className="space-y-6">
          {/* Table 1: Active Loading Sheets */}
          <div className="border border-slate-200/60 bg-white rounded-2xl shadow-sm overflow-hidden animate-fade-in">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">Active Loading Sheets Today</h3>
              <span className="bg-amber-50 text-amber-600 text-[10px] font-extrabold px-2.5 py-0.5 rounded-lg border border-amber-100 uppercase">
                {activeProfiles.length} Active
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/75 border-b border-slate-200/80 text-[10px] font-black text-slate-450 uppercase tracking-wider">
                    <th className="py-4 px-5">Session Date</th>
                    <th className="py-4 px-5">Customer details</th>
                    <th className="py-4 px-5">Godowns</th>
                    <th className="py-4 px-5">Consolidated Loadings</th>
                    <th className="py-4 px-5">Billing Status</th>
                    <th className="py-4 px-5 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700 text-xs font-semibold">
                  {loadingActive ? (
                    <tr>
                      <td colSpan="6" className="py-24 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <span className="loading loading-spinner text-primary"></span>
                          <span className="text-slate-400 text-sm font-medium">Fetching active profiles...</span>
                        </div>
                      </td>
                    </tr>
                  ) : activeProfiles.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="py-16 text-center text-slate-400 font-semibold text-xs bg-slate-50/20">
                        No active loading sheets found for today.
                      </td>
                    </tr>
                  ) : (
                    activeProfiles.slice((activePage - 1) * activeLimit, activePage * activeLimit).map(profile => (
                      <tr key={profile.id} className="hover:bg-slate-50/30 transition-colors">
                        <td className="py-4 px-5 text-slate-500 font-bold">
                          {formatDateDDMMYYYY(profile.loading_date)}
                        </td>
                        <td className="py-4 px-5">
                          <div className="font-extrabold text-slate-800">{profile.customer_name}</div>
                          <div className="text-[10px] font-bold text-slate-400 mt-0.5">{profile.customer_phone}</div>
                        </td>
                        <td className="py-4 px-5">
                          <div className="flex flex-wrap gap-1">
                            {profile.godowns && profile.godowns.map((gd, gdIdx) => (
                              <span 
                                key={gdIdx} 
                                className={`px-2 py-0.5 rounded text-[10px] font-extrabold border ${gd === 'KI' ? 'bg-indigo-50 border-indigo-100 text-indigo-600' : 'bg-amber-50 border-amber-100 text-amber-600'}`}
                              >
                                {gd}
                              </span>
                            ))}
                            {(!profile.godowns || profile.godowns.length === 0) && (
                              <span className="text-slate-400 italic">—</span>
                            )}
                          </div>
                        </td>
                        <td className="py-4 px-5 max-w-xs">
                          <div className="flex flex-wrap gap-1.5">
                            {profile.items && profile.items.map((item, idx) => (
                              <span 
                                key={idx} 
                                className="inline-flex items-center gap-1 bg-slate-100 border border-slate-200/60 rounded px-2 py-0.5 text-[10px] font-extrabold text-slate-700"
                                title={`Qty: ${item.quantity}, Return: ${item.returnQty}`}
                              >
                                {item.productName}: <span className="text-primary font-black">{item.quantity}</span>
                              </span>
                            ))}
                            {(!profile.items || profile.items.length === 0) && (
                              <span className="text-slate-400 italic">No products</span>
                            )}
                          </div>
                        </td>
                        <td className="py-4 px-5">
                          <span className="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-600 text-[10px] font-extrabold uppercase">
                            {profile.status}
                          </span>
                        </td>
                        <td className="py-4 px-5">
                          <div className="flex justify-center gap-2">
                            <button 
                              onClick={() => handleOpenSessionDetail(profile.id)}
                              className="px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold transition-all text-xs flex items-center gap-1.5"
                            >
                              👁 View Details
                            </button>
                            <button 
                              onClick={() => handleOpenReturnModal(profile)}
                              className="px-3 py-1.5 rounded-lg bg-rose-55 hover:bg-rose-100 border border-rose-200 text-rose-600 font-bold transition-all text-xs flex items-center gap-1.5"
                            >
                              🔄 Return Goods
                            </button>
                            <button 
                              onClick={() => handleGenerateBill(profile)}
                              className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-600 font-bold transition-all text-xs flex items-center gap-1.5"
                            >
                              🧾 Generate Bill
                            </button>
                            <button 
                              onClick={() => handleMarkCompleted(profile)}
                              className="px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-600 font-bold transition-all text-xs flex items-center gap-1.5"
                            >
                              ✅ Completed
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {/* Active Profiles Pagination */}
            {!loadingActive && activeProfiles.length > activeLimit && (
              <div className="flex items-center justify-between p-4 border-t border-slate-100 bg-white">
                <div className="text-xs font-bold text-slate-400 uppercase">
                  Page {activePage} of {Math.ceil(activeProfiles.length / activeLimit)} ({activeProfiles.length} records)
                </div>
                <div className="flex gap-2">
                  <button
                    disabled={activePage === 1}
                    onClick={() => setActivePage(prev => Math.max(1, prev - 1))}
                    className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-slate-650 bg-white hover:bg-slate-50 disabled:opacity-50 text-xs font-bold shadow-sm transition-all duration-200"
                  >
                    Previous
                  </button>
                  <button
                    disabled={activePage === Math.ceil(activeProfiles.length / activeLimit)}
                    onClick={() => setActivePage(prev => Math.min(Math.ceil(activeProfiles.length / activeLimit), prev + 1))}
                    className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-slate-650 bg-white hover:bg-slate-50 disabled:opacity-50 text-xs font-bold shadow-sm transition-all duration-200"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Table 2: Today's Completed Loading History */}
          <div className="border border-slate-200/60 bg-white rounded-2xl shadow-sm overflow-hidden animate-fade-in">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">Today's Completed Loading History</h3>
              <span className="bg-emerald-50 text-emerald-600 text-[10px] font-extrabold px-2.5 py-0.5 rounded-lg border border-emerald-100 uppercase">
                {todayHistoryCount} Completed
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/75 border-b border-slate-200/80 text-[10px] font-black text-slate-450 uppercase tracking-wider">
                    <th className="py-4 px-5">Loading ID</th>
                    <th className="py-4 px-5">Date</th>
                    <th className="py-4 px-5">Customer details</th>
                    <th className="py-4 px-5">Godowns</th>
                    <th className="py-4 px-5">Trips</th>
                    <th className="py-4 px-5">Consolidated Loadings</th>
                    <th className="py-4 px-5">Billing Status</th>
                    <th className="py-4 px-5 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700 text-xs font-semibold">
                  {loadingTodayHistory ? (
                    <tr>
                      <td colSpan="8" className="py-24 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <span className="loading loading-spinner text-primary"></span>
                          <span className="text-slate-400 text-sm font-medium">Fetching completed today...</span>
                        </div>
                      </td>
                    </tr>
                  ) : todayHistorySessions.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="py-16 text-center text-slate-400 font-semibold text-xs bg-slate-50/20">
                        No loading history completed today yet.
                      </td>
                    </tr>
                  ) : (
                    todayHistorySessions.map(session => (
                      <tr key={session.id} className="hover:bg-slate-50/30 transition-colors">
                        <td className="py-4 px-5 font-bold text-slate-650">{session.id}</td>
                        <td className="py-4 px-5 text-slate-500 font-bold">
                          {formatDateDDMMYYYY(session.loading_date)}
                        </td>
                        <td className="py-4 px-5">
                          <div className="font-extrabold text-slate-800">{session.customer_name}</div>
                          <div className="text-[10px] font-bold text-slate-400 mt-0.5">{session.customer_phone}</div>
                        </td>
                        <td className="py-4 px-5">
                          <div className="flex flex-wrap gap-1">
                            {session.godowns && session.godowns.map((gd, gdIdx) => (
                              <span 
                                key={gdIdx} 
                                className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${gd === 'KI' ? 'bg-indigo-50 border-indigo-100 text-indigo-600' : 'bg-amber-50 border-amber-100 text-amber-600'}`}
                              >
                                {gd}
                              </span>
                            ))}
                            {(!session.godowns || session.godowns.length === 0) && (
                              <span className="text-slate-400 italic">—</span>
                            )}
                          </div>
                        </td>
                        <td className="py-4 px-5">
                          <span className="bg-slate-100 border border-slate-200 text-slate-700 px-2 py-0.5 rounded text-[10px] font-extrabold">
                            {session.tripCount} trips
                          </span>
                        </td>
                        <td className="py-4 px-5 max-w-xs">
                          <div className="flex flex-wrap gap-1.5">
                            {session.items && session.items.map((item, idx) => (
                              <span key={idx} className="bg-slate-50 border border-slate-150 rounded px-1.5 py-0.5 text-[9px] font-bold text-slate-600">
                                {item.productName}: {item.quantity}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-4 px-5">
                          {session.status === 'BILLED' ? (
                            <div className="space-y-1">
                              <span className="px-2 py-0.5 rounded-full bg-blue-50 border border-blue-100 text-blue-600 text-[10px] font-extrabold uppercase">
                                Billed
                              </span>
                              <div className="text-[10px] font-bold text-primary font-mono">{session.bill_id}</div>
                            </div>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-650 text-[10px] font-extrabold uppercase">
                              Completed
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-5">
                          <div className="flex justify-center gap-1.5">
                            <button 
                              onClick={() => handleOpenSessionDetail(session.id)}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold transition-all text-xs"
                            >
                              👁 View Details
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {/* Today's History Pagination */}
            {!loadingTodayHistory && todayHistoryCount > 0 && (
              <div className="flex items-center justify-between p-4 border-t border-slate-100 bg-white">
                <div className="text-xs font-bold text-slate-400 uppercase">
                  Page {todayHistoryPage} of {Math.ceil(todayHistoryCount / todayHistoryLimit) || 1} ({todayHistoryCount} records)
                </div>
                <div className="flex gap-2">
                  <button
                    disabled={todayHistoryPage === 1}
                    onClick={() => setTodayHistoryPage(prev => Math.max(1, prev - 1))}
                    className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-slate-650 bg-white hover:bg-slate-50 disabled:opacity-50 text-xs font-bold shadow-sm transition-all duration-200"
                  >
                    Previous
                  </button>
                  <button
                    disabled={todayHistoryPage === Math.ceil(todayHistoryCount / todayHistoryLimit)}
                    onClick={() => setTodayHistoryPage(prev => Math.min(Math.ceil(todayHistoryCount / todayHistoryLimit), prev + 1))}
                    className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-slate-650 bg-white hover:bg-slate-50 disabled:opacity-50 text-xs font-bold shadow-sm transition-all duration-200"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'history' && !isFormOpen && (
        <div className="space-y-6 animate-fade-in">
          
          {/* HISTORY FILTERS CARD */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end bg-white border border-slate-200/60 p-4 rounded-2xl shadow-sm">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-450 uppercase tracking-wider block">Search Customer / ID</label>
              <input 
                type="text"
                placeholder="Name, Phone or loading ID..."
                value={filterSearch}
                onChange={(e) => { setFilterSearch(e.target.value); setHistoryPage(1); }}
                className="input-premium h-10 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-450 uppercase tracking-wider block">Start Date</label>
              <input 
                type="date"
                value={filterStartDate}
                onChange={(e) => { setFilterStartDate(e.target.value); setHistoryPage(1); }}
                className="input-premium h-10 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-450 uppercase tracking-wider block">End Date</label>
              <input 
                type="date"
                value={filterEndDate}
                onChange={(e) => { setFilterEndDate(e.target.value); setHistoryPage(1); }}
                className="input-premium h-10 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-450 uppercase tracking-wider block">Godown</label>
              <select
                value={filterGodown}
                onChange={(e) => { setFilterGodown(e.target.value); setHistoryPage(1); }}
                className="input-premium h-10 text-xs font-semibold"
              >
                <option value="">All Godowns</option>
                <option value="KI">KI (Kempannavar)</option>
                <option value="KP">KP (Kemps Pet)</option>
              </select>
            </div>
          </div>

          {/* HISTORY TABLE */}
          <div className="border border-slate-200/60 bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/75 border-b border-slate-200/80 text-[10px] font-black text-slate-450 uppercase tracking-wider">
                    <th className="py-4 px-5">Loading ID</th>
                    <th className="py-4 px-5">Date</th>
                    <th className="py-4 px-5">Customer Details</th>
                    <th className="py-4 px-5">Godown(s)</th>
                    <th className="py-4 px-5">Trips</th>
                    <th className="py-4 px-5">Consolidated Loading</th>
                    <th className="py-4 px-5">Billing Status</th>
                    <th className="py-4 px-5 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700 text-xs font-semibold">
                  {loadingHistory ? (
                    <tr>
                      <td colSpan="8" className="py-24 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <span className="loading loading-spinner text-primary"></span>
                          <span className="text-slate-400 text-sm font-medium">Fetching history...</span>
                        </div>
                      </td>
                    </tr>
                  ) : historySessions.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="py-16 text-center text-slate-400 font-semibold text-xs bg-slate-50/20">
                        No loading history matching your search.
                      </td>
                    </tr>
                  ) : (
                    historySessions.map(session => (
                      <tr key={session.id} className="hover:bg-slate-50/30 transition-colors">
                        <td className="py-4 px-5 font-bold text-slate-600">{session.id}</td>
                        <td className="py-4 px-5 text-slate-500 font-bold">
                          {formatDateDDMMYYYY(session.loading_date)}
                        </td>
                        <td className="py-4 px-5">
                          <div className="font-extrabold text-slate-800">{session.customer_name}</div>
                          <div className="text-[10px] font-bold text-slate-400 mt-0.5">{session.customer_phone}</div>
                        </td>
                        <td className="py-4 px-5">
                          <div className="flex flex-wrap gap-1">
                            {session.godowns && session.godowns.map((gd, gdIdx) => (
                              <span 
                                key={gdIdx} 
                                className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${gd === 'KI' ? 'bg-indigo-50 border-indigo-100 text-indigo-600' : 'bg-amber-50 border-amber-100 text-amber-600'}`}
                              >
                                {gd}
                              </span>
                            ))}
                            {(!session.godowns || session.godowns.length === 0) && (
                              <span className="text-slate-400 italic">—</span>
                            )}
                          </div>
                        </td>
                        <td className="py-4 px-5">
                          <span className="bg-slate-100 border border-slate-200 text-slate-700 px-2 py-0.5 rounded text-[10px] font-extrabold">
                            {session.tripCount} trips
                          </span>
                        </td>
                        <td className="py-4 px-5 max-w-xs">
                          <div className="flex flex-wrap gap-1">
                            {session.items && session.items.map((item, idx) => (
                              <span key={idx} className="bg-slate-50 border border-slate-150 rounded px-1.5 py-0.5 text-[9px] font-bold text-slate-600">
                                {item.productName}: {item.quantity}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-4 px-5">
                          {session.status === 'BILLED' ? (
                            <div className="space-y-1">
                              <span className="px-2 py-0.5 rounded-full bg-blue-50 border border-blue-100 text-blue-600 text-[10px] font-extrabold uppercase">
                                Billed
                              </span>
                              <div className="text-[10px] font-bold text-primary font-mono">{session.bill_id}</div>
                            </div>
                          ) : session.status === 'COMPLETED' ? (
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-600 text-[10px] font-extrabold uppercase">
                              Completed
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-600 text-[10px] font-extrabold uppercase">
                              Active
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-5">
                          <div className="flex justify-center gap-1.5">
                            <button 
                              onClick={() => handleOpenSessionDetail(session.id)}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold transition-all text-xs"
                            >
                              👁 View
                            </button>
                            {session.status === 'ACTIVE' && (
                              <>
                                <button 
                                  onClick={() => handleOpenReturnModal(session)}
                                  className="px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-600 font-bold transition-all text-xs"
                                >
                                  🔄 Return
                                </button>
                                <button 
                                  onClick={() => handleGenerateBill(session)}
                                  className="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-600 font-bold transition-all text-xs"
                                >
                                  🧾 Bill
                                </button>
                                <button 
                                  onClick={() => handleMarkCompleted(session)}
                                  className="px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-600 font-bold transition-all text-xs"
                                >
                                  ✅ Completed
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {!loadingHistory && historyCount > 0 && (
              <div className="flex items-center justify-between p-4 border-t border-slate-100 bg-white">
                <div className="text-xs font-bold text-slate-400 uppercase">
                  Page {historyPage} of {Math.ceil(historyCount / historyLimit) || 1} ({historyCount} records)
                </div>
                <div className="flex gap-2">
                  <button
                    disabled={historyPage === 1}
                    onClick={() => setHistoryPage(prev => Math.max(1, prev - 1))}
                    className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-slate-650 bg-white hover:bg-slate-50 disabled:opacity-50 text-xs font-bold shadow-sm transition-all duration-200"
                  >
                    Previous
                  </button>
                  <button
                    disabled={historyPage === Math.ceil(historyCount / historyLimit)}
                    onClick={() => setHistoryPage(prev => Math.min(Math.ceil(historyCount / historyLimit), prev + 1))}
                    className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-slate-650 bg-white hover:bg-slate-50 disabled:opacity-50 text-xs font-bold shadow-sm transition-all duration-200"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* RENDER MODALS USING PORTALS */}
      {isSessionModalOpen && createPortal(
        <div className="modal modal-open animate-fade-in z-50">
          <div className="modal-box max-w-4xl bg-white border border-slate-200/80 rounded-3xl p-8 relative shadow-2xl z-10 max-h-[90vh] overflow-y-auto">
            <button 
              onClick={() => { setIsSessionModalOpen(false); setSessionDetail(null); }}
              className="absolute top-4 right-4 w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 text-slate-550 hover:bg-slate-100 hover:text-slate-850 flex items-center justify-center font-bold transition-all"
            >
              ✕
            </button>

            {loadingSessionDetail ? (
              <div className="py-24 text-center">
                <span className="loading loading-spinner text-primary"></span>
                <p className="text-slate-400 mt-2 text-xs font-bold uppercase tracking-wider">Loading detailed sheet...</p>
              </div>
            ) : sessionDetail ? (
              <div className="space-y-6">
                
                {/* Modal Header */}
                <div className="flex justify-between items-start border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">
                      Loading Sheet: {sessionDetail.session.id}
                    </h3>
                    <p className="text-slate-500 text-xs font-bold mt-0.5">
                      Session Date: {formatDateDDMMYYYY(sessionDetail.session.loading_date)} | Godown(s): <span className="font-extrabold text-primary">{[...new Set(sessionDetail.trips.map(t => t.godown))].join(', ')}</span>
                    </p>
                  </div>
                  <div className="text-right">
                    {sessionDetail.session.status === 'BILLED' ? (
                      <div className="space-y-1">
                        <span className="px-3 py-1 rounded bg-blue-50 border border-blue-100 text-blue-600 text-xs font-extrabold uppercase">
                          BILLED
                        </span>
                        <div className="text-[11px] font-bold text-slate-450 mt-1">Invoice: <span className="font-mono text-primary font-black">{sessionDetail.session.bill_id}</span></div>
                      </div>
                    ) : sessionDetail.session.status === 'COMPLETED' ? (
                      <span className="px-3 py-1 rounded bg-slate-100 border border-slate-200 text-slate-600 text-xs font-extrabold uppercase">
                        COMPLETED
                      </span>
                    ) : (
                      <span className="px-3 py-1 rounded bg-emerald-50 border border-emerald-100 text-emerald-600 text-xs font-extrabold uppercase">
                        ACTIVE
                      </span>
                    )}
                  </div>
                </div>

                {/* Customer Details info box */}
                <div className="bg-slate-50 border border-slate-150/60 p-4 rounded-2xl grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-semibold text-slate-655">
                  <div>
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Customer Info</div>
                    <div className="text-slate-800 font-extrabold text-sm mt-1">{sessionDetail.session.customer_name}</div>
                    <div className="mt-0.5">Phone: {sessionDetail.session.customer_phone}</div>
                    {sessionDetail.session.customer_address && <div className="mt-1">Address: {sessionDetail.session.customer_address}</div>}
                  </div>
                  <div>
                    <div className="text-[10px] font-black text-slate-450 uppercase tracking-wider">Session Details</div>
                    <div className="mt-1">Created At: {new Date(sessionDetail.session.created_at).toLocaleString()}</div>
                    {sessionDetail.session.customer_gstin && <div className="mt-0.5">GSTIN: {sessionDetail.session.customer_gstin}</div>}
                  </div>
                </div>

                {/* Grid: Consolidated Left, Trips Right */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  {/* Consolidated quantities */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-black text-slate-450 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-100 pb-1.5">
                      📊 Consolidated Loading Total
                    </h4>
                    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-100 border-b border-slate-200 text-[9px] font-black text-slate-500 uppercase tracking-wider">
                            <th className="py-2.5 px-3">Product Name</th>
                            <th className="py-2.5 px-3 text-center">Total Qty</th>
                            <th className="py-2.5 px-3 text-center">Return</th>
                            <th className="py-2.5 px-3 text-right">Net Loading</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-150 font-bold text-slate-700">
                          {sessionDetail.consolidatedItems.map((item, idx) => (
                            <tr key={idx} className="hover:bg-slate-50/20">
                              <td className="py-2.5 px-3 text-slate-800 font-extrabold">{item.productName}</td>
                              <td className="py-2.5 px-3 text-center text-slate-500">{item.quantity}</td>
                              <td className="py-2.5 px-3 text-center text-rose-500">{item.returnQty}</td>
                              <td className="py-2.5 px-3 text-right text-primary font-black">{item.netLoadingQty}</td>
                            </tr>
                          ))}
                          {sessionDetail.consolidatedItems.length === 0 && (
                            <tr>
                              <td colSpan="4" className="py-6 text-center text-slate-400 italic">No products loaded</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Individual Trips */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-black text-slate-450 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-100 pb-1.5">
                      ⏱ Individual Trip Logs
                    </h4>
                    <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                      {sessionDetail.trips.map((trip, idx) => (
                        <div key={trip.id} className="border border-slate-200/80 rounded-xl p-3.5 space-y-2 bg-slate-50/20 hover:bg-slate-50/50 transition-colors">
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                              <span className="bg-indigo-50 border border-indigo-100 text-indigo-600 rounded px-2 py-0.5 text-[10px] font-black uppercase">
                                Trip #{trip.tripNumber}
                              </span>
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${trip.godown === 'KI' ? 'bg-indigo-50 border-indigo-100 text-indigo-600' : 'bg-amber-50 border-amber-100 text-amber-600'}`}>
                                {trip.godown}
                              </span>
                            </div>
                            <span className="text-[10px] font-semibold text-slate-400">
                              {new Date(trip.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>

                          <div className="text-[11px] text-slate-605 space-y-1">
                            {trip.items && trip.items.map((ti, tiIdx) => (
                              <div key={tiIdx} className="flex justify-between font-bold">
                                <span>{ti.productName}</span>
                                <span className="font-extrabold text-slate-700">
                                  {ti.quantity < 0 ? (
                                    <span className="text-rose-500">{Math.abs(ti.quantity)} returned</span>
                                  ) : (
                                    <>{ti.quantity} loaded {ti.returnQty > 0 && <span className="text-rose-500">(-{ti.returnQty} ret)</span>}</>
                                  )}
                                </span>
                              </div>
                            ))}
                          </div>

                          {trip.remarks && (
                            <div className="text-[10px] bg-white border border-slate-100 rounded px-2 py-1.5 italic text-slate-500 font-medium">
                              Note: {trip.remarks}
                            </div>
                          )}

                          {!trip.remarks?.startsWith('Active Return') && (
                            <div className="flex justify-end pt-1">
                              <button
                                onClick={() => handleTriggerPrint(trip.id)}
                                className="px-2 py-1 rounded bg-white hover:bg-indigo-50 border border-indigo-150 text-indigo-600 font-extrabold text-[10px] transition-all flex items-center gap-1"
                              >
                                🖨 Print POS Slip
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                </div>

                {/* Active Loading Returns History (Audit Trail) */}
                {sessionDetail.returns && sessionDetail.returns.length > 0 && (
                  <div className="space-y-3 mt-6 border-t border-slate-100 pt-6">
                    <h4 className="text-xs font-black text-rose-500 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-100 pb-1.5">
                      🔄 Active Loading Returns (Audit Trail)
                    </h4>
                    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white max-h-48 overflow-y-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-[9px] font-black text-slate-500 uppercase tracking-wider">
                            <th className="py-2.5 px-3">Date & Time</th>
                            <th className="py-2.5 px-3">Product Name</th>
                            <th className="py-2.5 px-3 text-center">Returned Qty</th>
                            <th className="py-2.5 px-3">Reason</th>
                            <th className="py-2.5 px-3 text-right">User Name</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-150 font-bold text-slate-700">
                          {sessionDetail.returns.map((ret, idx) => (
                            <tr key={idx} className="hover:bg-slate-50/30 transition-colors">
                              <td className="py-2.5 px-3 text-slate-500">
                                {new Date(ret.createdAt).toLocaleString()}
                              </td>
                              <td className="py-2.5 px-3 text-slate-800 font-extrabold">{ret.productName}</td>
                              <td className="py-2.5 px-3 text-center text-rose-600 font-black">{ret.quantity}</td>
                              <td className="py-2.5 px-3 text-slate-650 font-semibold">{ret.reason}</td>
                              <td className="py-2.5 px-3 text-right text-slate-500">{ret.userName}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

              {/* Remarks updater text box */}
              <div className="border-t border-slate-100 pt-4 space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase block">Update Session Notes/Remarks</label>
                <div className="flex gap-2">
                  <input 
                    type="text"
                    value={sessionRemarks}
                    onChange={(e) => setSessionRemarks(e.target.value)}
                    placeholder="Enter session notes here..."
                    className="input-premium flex-1 h-10 text-xs"
                  />
                  <button
                    onClick={handleUpdateRemarks}
                    disabled={isUpdatingRemarks}
                    className="px-4 h-10 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow transition-all duration-200 shrink-0"
                  >
                    {isUpdatingRemarks ? 'Saving...' : 'Update Remarks'}
                  </button>
                </div>
              </div>

              {/* Footer buttons */}
              <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                {sessionDetail.session.status === 'ACTIVE' && (
                  <>
                    <button 
                      onClick={() => {
                        handleOpenReturnModal(sessionDetail.session);
                      }}
                      className="px-5 py-2.5 bg-rose-500 hover:bg-rose-600 text-white font-extrabold text-xs rounded-xl shadow-md transition-all duration-200"
                    >
                      🔄 Return Goods
                    </button>
                    <button 
                      onClick={() => {
                        setIsSessionModalOpen(false);
                        handleGenerateBill(sessionDetail.session);
                      }}
                      className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-xs rounded-xl shadow-md transition-all duration-200"
                    >
                      🧾 Generate Consolidated Bill
                    </button>
                    <button 
                      onClick={() => {
                        handleMarkCompleted(sessionDetail.session);
                      }}
                      className="px-5 py-2.5 bg-blue-500 hover:bg-blue-600 text-white font-extrabold text-xs rounded-xl shadow-md transition-all duration-200"
                    >
                      ✅ Completed
                    </button>
                  </>
                )}
                <button 
                  onClick={() => { setIsSessionModalOpen(false); setSessionDetail(null); }}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-655 font-bold text-xs rounded-xl transition-all"
                >
                  Close Sheet
                </button>
              </div>
            </div>
            ) : null}

          </div>
          <div 
            className="modal-backdrop bg-slate-900/40 backdrop-blur-sm" 
            onClick={() => { setIsSessionModalOpen(false); setSessionDetail(null); }}
          ></div>
        </div>,
        document.body
      )}

      {/* POS RECEIPT PRINT MODAL USING PORTAL */}
      {isPrintModalOpen && createPortal(
        <div className="modal modal-open animate-fade-in z-[60]">
          <div className="modal-box bg-white p-6 flex flex-col items-center justify-center max-w-sm rounded-3xl shadow-2xl relative z-10 max-h-[90vh] overflow-y-auto">
            
            {/* Visual POS Receipt Wrapper Container */}
            <div 
              ref={printContainerRef} 
              className="bg-white text-black font-sans p-5 rounded-2xl border-2 border-slate-300 w-80 text-xs flex flex-col pos-slip-container shadow-sm font-bold"
            >
              {loadingPrint ? (
                <div className="py-20 flex flex-col items-center justify-center text-slate-800">
                  <span className="loading loading-spinner text-slate-800"></span>
                  <span className="text-[11px] font-black mt-2 uppercase tracking-widest text-black">Generating Slip...</span>
                </div>
              ) : printData ? (
                <>
                  {/* Shop header info */}
                  <div className="text-center space-y-1 pb-3 border-b-2 border-dashed border-black">
                    <h2 className="text-base font-black tracking-tight uppercase font-sans text-black">KEMP'S INDUSTRIES</h2>
                    <p className="text-[11px] font-sans text-black font-extrabold">QUALITY WATER & JUICE SUPPLIERS</p>
                    <p className="text-[11px] font-black text-black">Godown: {printData.trip.godown === 'KI' ? "Kempannavar (KI)" : "Kemps Pet (KP)"}</p>
                  </div>

                  {/* Trip / Loading details header */}
                  <div className="py-3 border-b-2 border-dashed border-black space-y-1 w-full text-black">
                    <div className="flex justify-between">
                      <span className="font-extrabold text-black">Trip:</span>
                      <span className="font-black text-black">Trip #{printData.trip.trip_number}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-extrabold text-black">Date:</span>
                      <span className="font-black text-black">{formatDateDDMMYYYY(printData.trip.loading_date)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-extrabold text-black">Time:</span>
                      <span className="font-black text-black">{new Date(printData.trip.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div className="flex justify-between mt-1 pt-1 border-t border-slate-300">
                      <span className="font-extrabold text-black">Cust Name:</span>
                      <span className="font-black text-black">{printData.trip.customer_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-extrabold text-black">Phone:</span>
                      <span className="font-black text-black">{printData.trip.customer_phone}</span>
                    </div>
                  </div>

                  {/* Loading Table Products list */}
                  <div className="py-3 border-b-2 border-dashed border-black w-full text-black">
                    <div className="grid grid-cols-12 font-black mb-1.5 border-b border-black pb-1 text-[11px] text-black">
                      <span className="col-span-6">PRODUCT</span>
                      <span className="col-span-2 text-center">QTY</span>
                      <span className="col-span-2 text-center">RET</span>
                      <span className="col-span-2 text-right">NET</span>
                    </div>
                    <div className="space-y-1.5">
                      {printData.items.map(item => (
                        <div key={item.id} className="grid grid-cols-12 text-[11px] font-bold text-black">
                          <span className="col-span-6 truncate font-black text-black">{item.productName}</span>
                          <span className="col-span-2 text-center font-black text-black">{item.quantity}</span>
                          <span className="col-span-2 text-center font-black text-black">{item.returnQty}</span>
                          <span className="col-span-2 text-right font-black text-black">{item.netLoadingQty}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Remarks details */}
                  {printData.trip.remarks && (
                    <div className="py-2.5 border-b-2 border-dashed border-black text-[11px] w-full text-black">
                      <span className="font-black block text-black">Remarks/Notes:</span>
                      <p className="font-bold text-black break-words">{printData.trip.remarks}</p>
                    </div>
                  )}

                  {/* Signatures footer */}
                  <div className="mt-8 pt-4 flex justify-between text-[11px] text-center border-t border-slate-300 w-full text-black">
                    <div className="w-24">
                      <div className="border-b-2 border-black h-4 mb-1"></div>
                      <span className="font-black text-black">Staff Sign</span>
                    </div>
                    <div className="w-24">
                      <div className="border-b-2 border-black h-4 mb-1"></div>
                      <span className="font-black text-black">Driver/Cust</span>
                    </div>
                  </div>

                  <div className="text-center text-[10px] mt-6 font-black text-black font-sans tracking-wide uppercase">
                    *** Thank you ***
                  </div>
                </>
              ) : null}
            </div>

            {/* Print control actions */}
            <div className="flex gap-2 w-80 mt-4 no-print">
              <button
                onClick={executePOSPrint}
                disabled={loadingPrint || !printData}
                className="flex-1 h-11 bg-primary text-white font-extrabold text-xs rounded-xl shadow-md flex items-center justify-center gap-1"
              >
                🖨 Print Slip
              </button>
              <button
                onClick={() => { setIsPrintModalOpen(false); setPrintData(null); setPrintTripId(null); }}
                className="w-24 h-11 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl shadow-sm border border-slate-200"
              >
                Close
              </button>
            </div>

          </div>
          <div 
            className="modal-backdrop bg-slate-900/40 backdrop-blur-sm" 
            onClick={() => { setIsPrintModalOpen(false); setPrintData(null); setPrintTripId(null); }}
          ></div>
        </div>,
        document.body
      )}

      {/* RETURN GOODS MODAL USING PORTAL */}
      {isReturnModalOpen && createPortal(
        <div className="modal modal-open animate-fade-in z-[60]">
          <div className="modal-box max-w-2xl bg-white border border-slate-200/80 rounded-3xl p-6 relative shadow-2xl z-10 max-h-[90vh] overflow-y-auto">
            <button 
              onClick={() => { setIsReturnModalOpen(false); setReturnSession(null); }}
              className="absolute top-4 right-4 w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 text-slate-550 hover:bg-slate-100 hover:text-slate-850 flex items-center justify-center font-bold transition-all"
            >
              ✕
            </button>

            <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight mb-2 flex items-center gap-2">
              <span>🔄</span> Return Goods
            </h3>
            <p className="text-slate-500 text-[11px] font-semibold mb-4">
              Log immediate returns for active loading session of <span className="text-slate-800 font-extrabold">{returnSession?.customer_name}</span>
            </p>

            <form onSubmit={handleSaveReturn} className="space-y-4">
              <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Products to Return</span>
                <button
                  type="button"
                  onClick={handleAddReturnProductRow}
                  className="px-3.5 py-1.5 rounded-lg border border-primary/20 text-primary bg-primary/5 hover:bg-primary hover:text-white transition-all text-xs font-bold"
                >
                  + Add Product Row
                </button>
              </div>

              <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
                {returnFormItems.map((item, index) => {
                  const itemsList = returnSession?.items || returnSession?.consolidatedItems || [];
                  const selectedItem = itemsList.find(i => String(i.finishedProductId) === String(item.finishedProductId));

                  return (
                    <div key={item.id} className="space-y-3 bg-slate-50/50 border border-slate-150/70 p-4 rounded-2xl relative group">
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                        {/* Select Product */}
                        <div className="md:col-span-6 space-y-1.5">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
                            Product #{index + 1}
                          </label>
                          <SearchableSelect
                            options={(returnSession?.items || returnSession?.consolidatedItems || [])
                              .filter(loadedItem => loadedItem.quantity > 0)
                              .map(loadedItem => ({
                                value: loadedItem.finishedProductId,
                                label: loadedItem.productName
                              }))}
                            value={item.finishedProductId}
                            onChange={(val) => handleReturnItemRowChange(item.id, 'finishedProductId', val)}
                            placeholder="-- Choose Product --"
                            searchPlaceholder="Type product name or number..."
                            className="!h-11 font-semibold text-slate-755"
                          />
                        </div>

                        {/* Return Qty */}
                        <div className="md:col-span-3 space-y-1.5">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
                            Return Qty
                          </label>
                          <input
                            type="number"
                            min="1"
                            placeholder="Qty"
                            value={item.quantity}
                            onChange={(e) => handleReturnItemRowChange(item.id, 'quantity', e.target.value)}
                            className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-semibold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            required
                          />
                        </div>

                        {/* Action buttons (Delete row) */}
                        <div className="md:col-span-3 flex justify-end">
                          <button
                            type="button"
                            onClick={() => handleRemoveReturnProductRow(item.id)}
                            className="w-11 h-11 rounded-xl bg-white border border-slate-200 hover:border-red-200 hover:bg-red-50 hover:text-red-500 text-slate-450 transition-all flex items-center justify-center font-bold text-xs shrink-0"
                            title="Remove Row"
                            disabled={returnFormItems.length <= 1}
                          >
                            ✕
                          </button>
                        </div>
                      </div>

                      {/* Stock details */}
                      {selectedItem && (
                        <div className="bg-white border border-slate-200 p-2.5 rounded-xl grid grid-cols-3 gap-2 text-center text-[11px] font-bold text-slate-500 animate-fade-in">
                          <div>
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Loaded</span>
                            <span className="text-slate-800 font-extrabold">{selectedItem.quantity}</span>
                          </div>
                          <div>
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Returned</span>
                            <span className="text-rose-500 font-extrabold">{selectedItem.returnQty}</span>
                          </div>
                          <div>
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Available</span>
                            <span className="text-primary font-black">{selectedItem.netLoadingQty}</span>
                          </div>
                        </div>
                      )}
                      {/* Empty wrapper to end layout cleanly */}
                    </div>
                  );
                })}

                {returnFormItems.length === 0 && (
                  <div className="py-8 border border-dashed border-slate-200 rounded-2xl bg-slate-50/20 text-center text-slate-450 font-bold text-xs">
                    No items in this return slip. Click "+ Add Product Row" to begin.
                  </div>
                )}
              </div>

              {returnError && (
                <div className="bg-rose-50 text-rose-600 px-4 py-2.5 rounded-xl text-[11px] font-semibold border border-rose-100 animate-fade-in">
                  ⚠️ {returnError}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isSavingReturn}
                  className="flex-1 h-11 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-black text-xs shadow-md shadow-rose-100 flex items-center justify-center gap-1.5 transition-all"
                >
                  {isSavingReturn ? 'Saving...' : '💾 Submit Return'}
                </button>
                <button
                  type="button"
                  onClick={() => { setIsReturnModalOpen(false); setReturnSession(null); }}
                  className="w-24 h-11 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-655 font-bold text-xs transition-all"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
          <div 
            className="modal-backdrop bg-slate-900/40 backdrop-blur-sm" 
            onClick={() => { setIsReturnModalOpen(false); setReturnSession(null); }}
          ></div>
        </div>,
        document.body
      )}

    </div>
  );
};

export default Loading;
