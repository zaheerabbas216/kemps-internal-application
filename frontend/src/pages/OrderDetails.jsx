import React, { useState, useEffect, useMemo, useRef } from 'react';
import api from '../api/axios';

const formatCurrency = (val) => {
  const num = parseFloat(val) || 0;
  return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
};

const formatTime12Hour = (timeStr) => {
  if (!timeStr) return '-';
  const parts = String(timeStr).trim().split(':');
  if (parts.length >= 2) {
    let hours = parseInt(parts[0], 10);
    const minutes = parts[1].padStart(2, '0');
    if (isNaN(hours)) return timeStr;
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `${hours}:${minutes} ${ampm}`;
  }
  return timeStr;
};

const formatDateTime = (dateStr) => {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  } catch {
    return dateStr;
  }
};

const hasValidDeliverySchedule = (order) => {
  if (!order) return false;
  const supplyDate = order.supply_date;
  const supplyTime = order.supply_time;

  if (!supplyDate || !supplyTime) return false;

  const rawDate = String(supplyDate).trim();
  const rawTime = String(supplyTime).trim();

  if (!rawDate || rawDate === '-' || rawDate === 'null' || rawDate === 'undefined' || rawDate === '0000-00-00') return false;
  if (!rawTime || rawTime === '-' || rawTime === 'null' || rawTime === 'undefined') return false;

  // Check for auto-generated or default 12:00 AM / 00:00:00 placeholder times
  const isDefaultMidnight = (
    rawTime === '00:00:00' ||
    rawTime === '00:00' ||
    rawTime === '0:00' ||
    rawTime === '12:00 AM' ||
    rawTime === '12:00:00 AM'
  );

  const isDistributor = order.customer_type === 'Distributor' || order.source_module === 'DISTRIBUTION_ORDER';

  // For distributor orders, unscheduled orders store 00:00:00 default
  if (isDistributor && isDefaultMidnight) {
    return false;
  }

  return true;
};

const getTodayIST = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const istDate = new Date(now.getTime() + (330 + offset) * 60000);
  return istDate.toISOString().split('T')[0];
};

const getYesterdayIST = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const istDate = new Date(now.getTime() + (330 + offset) * 60000);
  istDate.setDate(istDate.getDate() - 1);
  return istDate.toISOString().split('T')[0];
};

const getThisWeekRange = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const istDate = new Date(now.getTime() + (330 + offset) * 60000);
  const day = istDate.getDay() || 7;
  const start = new Date(istDate);
  start.setDate(istDate.getDate() - (day - 1));
  return {
    start: start.toISOString().split('T')[0],
    end: istDate.toISOString().split('T')[0]
  };
};

const getThisMonthRange = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const istDate = new Date(now.getTime() + (330 + offset) * 60000);
  const yyyy = istDate.getFullYear();
  const mm = String(istDate.getMonth() + 1).padStart(2, '0');
  const lastDay = new Date(yyyy, istDate.getMonth() + 1, 0).getDate();
  return {
    start: `${yyyy}-${mm}-01`,
    end: `${yyyy}-${mm}-${String(lastDay).padStart(2, '0')}`
  };
};

const OrderDetails = () => {
  // Primary Module / Source Filter: 'ALL' | 'ORDER_MANAGEMENT' | 'DISTRIBUTION_ORDER'
  const [moduleFilter, setModuleFilter] = useState('ALL');

  // Status Tabs: 'PENDING' | 'SUPPLIED' | 'CANCELLED' | 'ALL'
  const [activeTab, setActiveTab] = useState('PENDING');

  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [customerTypeFilter, setCustomerTypeFilter] = useState('');
  const [productFilter, setProductFilter] = useState('');

  // Date Filtering: From Date, To Date & Date Type
  const [dateType, setDateType] = useState('supply_date'); // 'supply_date' | 'created_at'
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [limit] = useState(15);
  const [totalCount, setTotalCount] = useState(0);

  // Data States
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState([]);
  const [productRequirements, setProductRequirements] = useState([]);
  const [isRequirementCollapsed, setIsRequirementCollapsed] = useState(false);
  const [widgets, setWidgets] = useState({
    todayDeliveries: 0,
    pendingCount: 0,
    suppliedToday: 0,
    cancelledToday: 0
  });

  // Selected Order for Detail Modal
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [orderDetail, setOrderDetail] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Print Invoice / Order Slip Modal
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const printRef = useRef(null);

  // Initial Data
  useEffect(() => {
    fetchProducts();
  }, []);

  // Fetch Orders & Widgets whenever filters change
  useEffect(() => {
    fetchOrders();
    fetchWidgets();
  }, [moduleFilter, activeTab, searchQuery, customerTypeFilter, productFilter, dateType, startDate, endDate, currentPage]);

  const fetchProducts = async () => {
    try {
      const res = await api.get('/finished-products');
      if (res.data?.ok && Array.isArray(res.data.products)) {
        setProducts(res.data.products);
      }
    } catch (err) {
      console.error('Error fetching products:', err);
    }
  };

  const fetchWidgets = async () => {
    try {
      const params = {};
      if (moduleFilter === 'DISTRIBUTION_ORDER') {
        params.customerType = 'Distributor';
      } else if (moduleFilter === 'ORDER_MANAGEMENT') {
        params.excludeCustomerType = 'Distributor';
      } else if (customerTypeFilter) {
        params.customerType = customerTypeFilter;
      }

      const res = await api.get('/orders/dashboard-widgets', { params });
      if (res.data?.ok && res.data.widgets) {
        setWidgets(res.data.widgets);
      }
    } catch (err) {
      console.error('Error fetching widgets:', err);
    }
  };

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const params = {
        page: currentPage,
        limit,
        search: searchQuery.trim(),
        status: activeTab === 'ALL' ? '' : activeTab,
        productId: productFilter,
        dateType,
        startDate,
        endDate
      };

      if (moduleFilter === 'DISTRIBUTION_ORDER') {
        params.customerType = 'Distributor';
      } else if (moduleFilter === 'ORDER_MANAGEMENT') {
        params.excludeCustomerType = 'Distributor';
        if (customerTypeFilter && customerTypeFilter !== 'Distributor') {
          params.customerType = customerTypeFilter;
        }
      } else {
        if (customerTypeFilter) {
          params.customerType = customerTypeFilter;
        }
      }

      const res = await api.get('/orders', { params });
      if (res.data?.ok) {
        setOrders(res.data.orders || []);
        setTotalCount(res.data.total || 0);
        setProductRequirements(res.data.productRequirements || []);
      }
    } catch (err) {
      console.error('Error fetching orders:', err);
    } finally {
      setLoading(false);
    }
  };

  const openOrderDetail = async (orderId) => {
    setSelectedOrderId(orderId);
    setIsDetailOpen(true);
    setLoadingDetail(true);
    try {
      const res = await api.get(`/orders/${orderId}`);
      if (res.data?.ok) {
        setOrderDetail({
          ...res.data.order,
          items: res.data.items || []
        });
      }
    } catch (err) {
      console.error('Error fetching order details:', err);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handlePrintSlip = (order) => {
    setOrderDetail(order);
    setIsPrintModalOpen(true);
  };

  const handleTriggerPrint = () => {
    window.print();
  };

  const handlePresetDate = (type) => {
    setCurrentPage(1);
    if (type === 'today') {
      const today = getTodayIST();
      setStartDate(today);
      setEndDate(today);
    } else if (type === 'yesterday') {
      const yest = getYesterdayIST();
      setStartDate(yest);
      setEndDate(yest);
    } else if (type === 'week') {
      const { start, end } = getThisWeekRange();
      setStartDate(start);
      setEndDate(end);
    } else if (type === 'month') {
      const { start, end } = getThisMonthRange();
      setStartDate(start);
      setEndDate(end);
    } else if (type === 'clear') {
      setStartDate('');
      setEndDate('');
    }
  };

  const handleExportCSV = () => {
    if (!orders || orders.length === 0) {
      alert('No order data to export.');
      return;
    }

    const headers = [
      'Order ID',
      'Module / Source',
      'Order Date',
      'Customer Name',
      'Phone',
      'Customer Type',
      'Supply Date',
      'Supply Time',
      'Delivery Address',
      'Products Summary',
      'Subtotal',
      'Discount',
      'Tax',
      'Grand Total',
      'Payment Mode',
      'Advance Amount',
      'Pending Amount',
      'Status',
      'Created By'
    ];

    const rows = orders.map((o) => {
      const itemsSummary = (o.items || []).map(it => `${it.productName || 'Product'} (x${it.quantity})`).join('; ');
      const source = o.customer_type === 'Distributor' ? 'Distribution Order' : 'Order Management';
      const isScheduled = hasValidDeliverySchedule(o);
      return [
        o.id,
        `"${source}"`,
        formatDate(o.created_at),
        `"${(o.customer_name || '').replace(/"/g, '""')}"`,
        o.customer_phone || '',
        o.customer_type || '',
        isScheduled ? (o.supply_date || '') : 'Not Scheduled',
        isScheduled ? (o.supply_time || '') : 'Not Scheduled',
        isScheduled ? `"${(o.delivery_address || o.customer_address || '').replace(/"/g, '""')}"` : '""',
        `"${itemsSummary.replace(/"/g, '""')}"`,
        parseFloat(o.sub_total || 0).toFixed(2),
        parseFloat(o.discount || 0).toFixed(2),
        parseFloat(o.tax || 0).toFixed(2),
        parseFloat(o.grand_total || 0).toFixed(2),
        o.payment_mode || '',
        parseFloat(o.advance_amount || 0).toFixed(2),
        parseFloat(o.pending_amount || 0).toFixed(2),
        o.status || '',
        o.created_by || ''
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `order_details_${moduleFilter}_${getTodayIST()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const totalPages = Math.ceil(totalCount / limit) || 1;

  // Calculate total required product quantity across all filtered orders
  const totalRequiredQuantity = useMemo(() => {
    return productRequirements.reduce((sum, item) => sum + (parseInt(item.totalQuantity, 10) || 0), 0);
  }, [productRequirements]);

  const getStatusBadge = (status) => {
    switch (status) {
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
            Pending
          </span>
        );
      case 'SUPPLIED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            Supplied
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-rose-500"></span>
            Cancelled
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
            {status || 'Unknown'}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header - Pure Read-Only View */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary text-2xl font-bold">
            📋
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              Order Details
            </h1>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Read-only overview for Distribution Orders and Order Management logs
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => {
              fetchOrders();
              fetchWidgets();
            }}
            title="Refresh Orders Data"
            className="px-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-100 active:scale-95 transition-all flex items-center gap-2 shadow-2xs"
          >
            <span className="text-sm">🔄</span>
            Refresh
          </button>
          <button
            onClick={handleExportCSV}
            title="Export to CSV"
            className="px-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-100 active:scale-95 transition-all flex items-center gap-2 shadow-2xs"
          >
            <span className="text-sm">📥</span>
            Export CSV
          </button>
        </div>
      </div>

      {/* KPI Metric Cards - Order Counts Only */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200/70 rounded-2xl p-5 shadow-sm flex items-center gap-4 hover:border-slate-300 transition-all">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-200/60 flex items-center justify-center text-indigo-600 text-xl font-bold shrink-0">
            📋
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Filtered</p>
            <h3 className="text-2xl font-black text-slate-900 mt-0.5">{totalCount}</h3>
            <p className="text-[10px] text-indigo-600 font-semibold mt-0.5">Total matching orders</p>
          </div>
        </div>

        <div className="bg-white border border-slate-200/70 rounded-2xl p-5 shadow-sm flex items-center gap-4 hover:border-slate-300 transition-all">
          <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200/60 flex items-center justify-center text-amber-600 text-xl font-bold shrink-0">
            ⏳
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Scheduled Today</p>
            <h3 className="text-2xl font-black text-slate-900 mt-0.5">{widgets.todayDeliveries}</h3>
            <p className="text-[10px] text-amber-600 font-semibold mt-0.5">Pending deliveries today</p>
          </div>
        </div>

        <div className="bg-white border border-slate-200/70 rounded-2xl p-5 shadow-sm flex items-center gap-4 hover:border-slate-300 transition-all">
          <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-200/60 flex items-center justify-center text-blue-600 text-xl font-bold shrink-0">
            📦
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">All Pending</p>
            <h3 className="text-2xl font-black text-slate-900 mt-0.5">{widgets.pendingCount}</h3>
            <p className="text-[10px] text-blue-600 font-semibold mt-0.5">Awaiting fulfillment</p>
          </div>
        </div>

        <div className="bg-white border border-slate-200/70 rounded-2xl p-5 shadow-sm flex items-center gap-4 hover:border-slate-300 transition-all">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200/60 flex items-center justify-center text-emerald-600 text-xl font-bold shrink-0">
            🚚
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Supplied Today</p>
            <h3 className="text-2xl font-black text-emerald-700 mt-0.5">{widgets.suppliedToday}</h3>
            <p className="text-[10px] text-emerald-600 font-semibold mt-0.5">Completed deliveries</p>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* REQUIRED PRODUCT QUANTITY DEMAND SUMMARY TABLE */}
      {/* ========================================================================= */}
      <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-slate-50 via-white to-blue-50/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/10 text-blue-700 flex items-center justify-center text-lg font-bold">
              📦
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold text-slate-900 tracking-tight">
                  Total Product Quantities Required
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                  {productRequirements.length} Product Types
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Calculated demand across all matching orders for <span className="font-semibold text-slate-700">{activeTab === 'ALL' ? 'All Orders' : activeTab}</span> ({moduleFilter === 'DISTRIBUTION_ORDER' ? 'Distribution Order' : moduleFilter === 'ORDER_MANAGEMENT' ? 'Order Management' : 'All Entries'})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-[#1e3a8a] text-white px-4 py-1.5 rounded-xl shadow-sm text-right">
              <span className="text-[10px] uppercase font-bold text-blue-200 tracking-wider block">Total Required Qty</span>
              <span className="text-base font-black tracking-tight">{totalRequiredQuantity.toLocaleString('en-IN')} Units</span>
            </div>
            <button
              onClick={() => setIsRequirementCollapsed(!isRequirementCollapsed)}
              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-all flex items-center gap-1.5"
            >
              <span>{isRequirementCollapsed ? '▼ Show Table' : '▲ Hide'}</span>
            </button>
          </div>
        </div>

        {!isRequirementCollapsed && (
          <div>
            {productRequirements.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs font-medium">
                No product demand found for the currently selected filters.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      <th className="py-3 px-4 w-12">#</th>
                      <th className="py-3 px-4">Product Name</th>
                      <th className="py-3 px-4 text-center">Orders Count</th>
                      <th className="py-3 px-4 text-center">Packaging / Unit</th>
                      <th className="py-3 px-4 text-right">Required Quantity</th>
                      <th className="py-3 px-4 text-right">Demand Share</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {productRequirements.map((prod, idx) => {
                      const qty = parseInt(prod.totalQuantity, 10) || 0;
                      const percentage = totalRequiredQuantity > 0 ? ((qty / totalRequiredQuantity) * 100).toFixed(1) : '0';
                      return (
                        <tr key={prod.productId || idx} className="hover:bg-blue-50/30 transition-colors">
                          <td className="py-3 px-4 text-slate-400 font-bold">{idx + 1}</td>
                          <td className="py-3 px-4 font-bold text-slate-900 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0"></span>
                            <span>{prod.productName}</span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="inline-block px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-700">
                              {prod.orderCount} {prod.orderCount === 1 ? 'Order' : 'Orders'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center text-slate-500 font-medium">
                            {prod.productUnit || 'Qty'}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <span className="inline-block px-3.5 py-1 rounded-lg text-xs font-black bg-blue-50 text-[#1e3a8a] border border-blue-200 shadow-2xs">
                              {qty.toLocaleString('en-IN')} {prod.productUnit || 'Qty'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-20 bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200">
                                <div
                                  className="bg-[#1e3a8a] h-full rounded-full"
                                  style={{ width: `${Math.min(100, parseFloat(percentage))}%` }}
                                ></div>
                              </div>
                              <span className="font-extrabold text-slate-700 w-10 text-right">{percentage}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50/90 font-extrabold text-slate-900 border-t border-slate-200">
                      <td colSpan="4" className="py-3.5 px-4 uppercase text-[11px] tracking-wider text-slate-500 text-right">
                        Total Combined Required Quantity:
                      </td>
                      <td className="py-3.5 px-4 text-right text-sm text-[#1e3a8a] font-black">
                        {totalRequiredQuantity.toLocaleString('en-IN')} Qty
                      </td>
                      <td className="py-3.5 px-4 text-right text-xs text-slate-600">
                        100%
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Filter & Table Card */}
      <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
        {/* Top Filter Bar: Status Tabs + Module Filter Buttons */}
        <div className="px-6 py-4 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-50/40">
          {/* Status Tab Navigation: Pending/Active -> Supplied -> Cancelled -> All Orders */}
          <div className="flex items-center gap-1.5 bg-slate-200/70 p-1 rounded-xl border border-slate-300/60 overflow-x-auto">
            {[
              { id: 'PENDING', label: 'Pending / Active' },
              { id: 'SUPPLIED', label: 'Supplied' },
              { id: 'CANCELLED', label: 'Cancelled' },
              { id: 'ALL', label: 'All Orders' }
            ].map((tab) => {
              const isActive = activeTab === tab.id;
              let activeClass = 'bg-slate-900 text-white shadow-sm';
              if (tab.id === 'PENDING') {
                activeClass = 'bg-[#1e3a8a] text-white shadow-md shadow-blue-900/30 ring-2 ring-[#172554] font-black';
              } else if (tab.id === 'SUPPLIED') {
                activeClass = 'bg-emerald-700 text-white shadow-md font-bold';
              } else if (tab.id === 'CANCELLED') {
                activeClass = 'bg-rose-700 text-white shadow-md font-bold';
              }

              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setCurrentPage(1);
                  }}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                    isActive
                      ? activeClass
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* 2 Primary Filter Buttons: Distribution Order vs Order Management */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Filter By Entry:
            </span>

            <button
              onClick={() => {
                setModuleFilter('ALL');
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                moduleFilter === 'ALL'
                  ? 'bg-slate-900 text-white shadow-md shadow-slate-900/20 ring-2 ring-slate-900'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <span>🌐</span>
              All Entries
            </button>

            {/* BUTTON 1: DISTRIBUTION ORDER */}
            <button
              onClick={() => {
                setModuleFilter('DISTRIBUTION_ORDER');
                setCurrentPage(1);
              }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 shadow-xs ${
                moduleFilter === 'DISTRIBUTION_ORDER'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30 ring-2 ring-blue-600'
                  : 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100'
              }`}
            >
              <span>🚚</span>
              Distribution Order
            </button>

            {/* BUTTON 2: ORDER MANAGEMENT */}
            <button
              onClick={() => {
                setModuleFilter('ORDER_MANAGEMENT');
                setCurrentPage(1);
              }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 shadow-xs ${
                moduleFilter === 'ORDER_MANAGEMENT'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/30 ring-2 ring-emerald-600'
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
              }`}
            >
              <span>🛒</span>
              Order Management
            </button>
          </div>
        </div>

        {/* Extended Filter Controls Bar with From Date & To Date */}
        <div className="p-6 bg-slate-50/70 border-b border-slate-200/80 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3.5">
            {/* Search Box */}
            <div className="lg:col-span-3">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Search Keyword
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 text-sm">
                  🔍
                </span>
                <input
                  type="text"
                  placeholder="Order ID, Customer Name, Phone..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-slate-400 shadow-sm"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-xs text-slate-400 hover:text-slate-600"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Date Type Selector (Supply Date vs Order Date) */}
            <div className="lg:col-span-2">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Date Filter Basis
              </label>
              <select
                value={dateType}
                onChange={(e) => {
                  setDateType(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-slate-700 shadow-sm"
              >
                <option value="supply_date">📅 Supply / Delivery Date</option>
                <option value="created_at">📝 Order Log / Entry Date</option>
              </select>
            </div>

            {/* FROM DATE Input */}
            <div className="lg:col-span-2">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1 flex items-center gap-1">
                <span>📅</span> From Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-slate-800 shadow-sm"
              />
            </div>

            {/* TO DATE Input */}
            <div className="lg:col-span-2">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1 flex items-center gap-1">
                <span>📅</span> To Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-slate-800 shadow-sm"
              />
            </div>

            {/* Customer Type Filter */}
            <div className="lg:col-span-3">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Customer Type
              </label>
              <select
                value={customerTypeFilter}
                disabled={moduleFilter === 'DISTRIBUTION_ORDER'}
                onChange={(e) => {
                  setCustomerTypeFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-slate-700 shadow-sm disabled:bg-slate-100 disabled:opacity-60"
              >
                <option value="">All Customer Types</option>
                <option value="General Customer">General Customer</option>
                <option value="Distributor">Distributor</option>
                <option value="Retailer">Retailer</option>
                <option value="Wholesale">Wholesale</option>
              </select>
            </div>
          </div>

          {/* Quick Date Presets Row */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-200/50">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">
                Quick Presets:
              </span>
              <button
                onClick={() => handlePresetDate('today')}
                className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 text-[11px] font-semibold hover:bg-slate-100 hover:text-slate-900 transition-all shadow-2xs"
              >
                Today
              </button>
              <button
                onClick={() => handlePresetDate('yesterday')}
                className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 text-[11px] font-semibold hover:bg-slate-100 hover:text-slate-900 transition-all shadow-2xs"
              >
                Yesterday
              </button>
              <button
                onClick={() => handlePresetDate('week')}
                className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 text-[11px] font-semibold hover:bg-slate-100 hover:text-slate-900 transition-all shadow-2xs"
              >
                This Week
              </button>
              <button
                onClick={() => handlePresetDate('month')}
                className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 text-[11px] font-semibold hover:bg-slate-100 hover:text-slate-900 transition-all shadow-2xs"
              >
                This Month
              </button>
              {(startDate || endDate) && (
                <button
                  onClick={() => handlePresetDate('clear')}
                  className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-bold hover:bg-rose-100 transition-all"
                >
                  ✕ Clear Date Filter
                </button>
              )}
            </div>

            <div className="text-xs text-slate-500 font-medium">
              Showing <span className="font-bold text-slate-900">{orders.length}</span> of <span className="font-bold text-slate-900">{totalCount}</span> filtered records
            </div>
          </div>
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-3.5 px-4">Order ID & Date</th>
                <th className="py-3.5 px-4">Module Source</th>
                <th className="py-3.5 px-4">Customer Details</th>
                <th className="py-3.5 px-4 font-bold text-slate-500 uppercase tracking-wider">
                  <span className="text-blue-700 font-extrabold">Delivery Schedule</span>
                </th>
                <th className="py-3.5 px-4">Items Summary</th>
                <th className="py-3.5 px-4 text-right">Financials (₹)</th>
                <th className="py-3.5 px-4 text-center">Status</th>
                <th className="py-3.5 px-4 text-center">View</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan="8" className="py-16 text-center text-slate-400">
                    <div className="inline-flex items-center gap-3">
                      <span className="loading loading-spinner text-primary"></span>
                      <span className="font-semibold">Loading orders...</span>
                    </div>
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan="8" className="py-16 text-center">
                    <div className="max-w-xs mx-auto text-slate-400 space-y-2">
                      <span className="text-4xl">📭</span>
                      <p className="font-bold text-slate-600">No orders match the selected filters</p>
                      <p className="text-[11px] text-slate-400">
                        Try clearing From/To dates or switching between Distribution Order and Order Management.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                orders.map((order) => {
                  const pendingBal = parseFloat(order.pending_amount || 0);
                  const isDistributor = order.customer_type === 'Distributor';
                  return (
                    <tr
                      key={order.id}
                      className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                      onClick={() => openOrderDetail(order.id)}
                    >
                      {/* Order ID & Date */}
                      <td className="py-4 px-4 align-top">
                        <div className="font-bold text-slate-900 group-hover:text-primary transition-colors flex items-center gap-1.5">
                          <span>{order.id}</span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Logged: {formatDate(order.created_at)}
                        </p>
                        <p className="text-[10px] text-slate-400 font-medium">
                          By: {order.created_by || 'Admin'}
                        </p>
                      </td>

                      {/* Module Source Badge */}
                      <td className="py-4 px-4 align-top">
                        {isDistributor ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-extrabold bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs">
                            <span>🚚</span> Distribution
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
                            <span>🛒</span> Order Mgmt
                          </span>
                        )}
                      </td>

                      {/* Customer Details */}
                      <td className="py-4 px-4 align-top">
                        <div className="font-bold text-slate-800">{order.customer_name}</div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <span>📞</span> {order.customer_phone}
                        </div>
                        <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                          {order.customer_type || 'General Customer'}
                        </span>
                      </td>

                      {/* Delivery Schedule (Bold & Highlighted Blue) */}
                      <td className="py-4 px-4 align-top">
                        {hasValidDeliverySchedule(order) ? (
                          <div className="space-y-0.5">
                            <div className="font-black text-blue-600 flex items-center gap-1 text-xs">
                              <span>📅</span> {formatDate(order.supply_date)}
                            </div>
                            <div className="text-xs font-bold text-blue-600 flex items-center gap-1">
                              <span>⏱</span> Time: <span className="font-black text-blue-700">{formatTime12Hour(order.supply_time)}</span>
                            </div>
                            {(order.delivery_address || order.customer_address) && (
                              <div className="text-[11px] font-medium text-slate-500 truncate max-w-[170px] pt-0.5" title={order.delivery_address || order.customer_address}>
                                📍 {order.delivery_address || order.customer_address}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="py-1">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-500 border border-slate-200/80">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                              Not Scheduled
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Items Summary */}
                      <td className="py-4 px-4 align-top">
                        <div className="space-y-1 max-w-[190px]">
                          {(order.items || []).slice(0, 2).map((it, idx) => (
                            <div key={idx} className="flex items-center justify-between text-[11px] bg-slate-50 px-2 py-1 rounded border border-slate-100">
                              <span className="font-medium text-slate-700 truncate">{it.productName || 'Product'}</span>
                              <span className="font-bold text-slate-900 ml-2">x{it.quantity}</span>
                            </div>
                          ))}
                          {(order.items || []).length > 2 && (
                            <span className="text-[10px] font-bold text-primary block">
                              +{(order.items || []).length - 2} more item(s)...
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Financials */}
                      <td className="py-4 px-4 align-top text-right">
                        <div className="font-extrabold text-slate-900">
                          {formatCurrency(order.grand_total)}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          Adv: <span className="font-semibold text-emerald-600">{formatCurrency(order.advance_amount)}</span>
                        </div>
                        <div className={`text-[10px] font-bold mt-0.5 ${pendingBal > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                          Bal: {formatCurrency(pendingBal)}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-4 px-4 align-top text-center" onClick={(e) => e.stopPropagation()}>
                        {getStatusBadge(order.status)}
                      </td>

                      {/* Read-Only Inspection Buttons */}
                      <td className="py-4 px-4 align-top text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center">
                          <button
                            onClick={() => openOrderDetail(order.id)}
                            title="View Full Order Details"
                            className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-primary/10 text-slate-700 hover:text-primary border border-slate-200 hover:border-primary/30 transition-all text-xs font-bold flex items-center gap-1.5 shadow-2xs active:scale-95"
                          >
                            <span className="text-sm">👁️</span>
                            <span>View</span>
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

        {/* Pagination Bar */}
        <div className="p-4 bg-slate-50 border-t border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
          <div>
            Showing Page <span className="font-bold text-slate-900">{currentPage}</span> of <span className="font-bold text-slate-900">{totalPages}</span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1 || loading}
              className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 font-semibold hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              Previous
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const p = i + 1;
              return (
                <button
                  key={p}
                  onClick={() => setCurrentPage(p)}
                  className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                    currentPage === p
                      ? 'bg-primary text-white shadow-sm'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {p}
                </button>
              );
            })}
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages || loading}
              className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 font-semibold hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* FULL ORDER DETAIL INSPECTION MODAL (READ-ONLY) */}
      {/* ========================================================================= */}
      {isDetailOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-6 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center text-primary text-xl font-bold">
                  📋
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-extrabold tracking-tight">
                      Order #{selectedOrderId}
                    </h2>
                    {orderDetail && getStatusBadge(orderDetail.status)}
                    {orderDetail?.customer_type === 'Distributor' ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                        🚚 Distribution Order
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        🛒 Order Management
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Logged on {formatDateTime(orderDetail?.created_at)} by {orderDetail?.created_by || 'Admin'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {orderDetail && (
                  <button
                    onClick={() => handlePrintSlip(orderDetail)}
                    className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-all flex items-center gap-1.5"
                  >
                    <span>🖨️</span> Print Slip
                  </button>
                )}
                <button
                  onClick={() => setIsDetailOpen(false)}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition-all text-sm font-bold"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6">
              {loadingDetail ? (
                <div className="py-20 text-center text-slate-400 space-y-3">
                  <span className="loading loading-spinner loading-lg text-primary"></span>
                  <p className="font-semibold text-sm">Fetching complete order details...</p>
                </div>
              ) : orderDetail ? (
                <>
                  {/* Two Column Summary */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Customer Info Card */}
                    <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-5 space-y-3">
                      <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                        <span>👤</span> Customer Information
                      </h3>
                      <div className="space-y-1.5 text-xs text-slate-700">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Name:</span>
                          <span className="font-bold text-slate-900">{orderDetail.customer_name}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Phone:</span>
                          <span className="font-semibold">{orderDetail.customer_phone}</span>
                        </div>
                        {orderDetail.alternate_phone && (
                          <div className="flex justify-between">
                            <span className="text-slate-400">Alt Phone:</span>
                            <span>{orderDetail.alternate_phone}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-slate-400">Type:</span>
                          <span className="font-semibold text-primary">{orderDetail.customer_type || 'General'}</span>
                        </div>
                        {orderDetail.customer_gstin && (
                          <div className="flex justify-between">
                            <span className="text-slate-400">GSTIN:</span>
                            <span className="font-mono">{orderDetail.customer_gstin}</span>
                          </div>
                        )}
                        <div className="pt-1 border-t border-slate-200/60 flex justify-between gap-4">
                          <span className="text-slate-400 shrink-0">Address:</span>
                          <span className="text-right text-slate-600">{orderDetail.customer_address || '-'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Delivery Logistics Card */}
                    <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-5 space-y-3">
                      <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                        <span>🚚</span> Delivery & Logistics
                      </h3>
                      {hasValidDeliverySchedule(orderDetail) ? (
                        <div className="space-y-1.5 text-xs text-slate-700">
                          <div className="flex justify-between">
                            <span className="text-slate-400">Supply Date:</span>
                            <span className="font-bold text-slate-900">{formatDate(orderDetail.supply_date)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Supply Time:</span>
                            <span className="font-semibold">{formatTime12Hour(orderDetail.supply_time)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Payment Mode:</span>
                            <span className="font-bold text-slate-800">{orderDetail.payment_mode || 'Cash'}</span>
                          </div>
                          {(orderDetail.delivery_address || orderDetail.customer_address) && (
                            <div className="pt-1 border-t border-slate-200/60 flex justify-between gap-4">
                              <span className="text-slate-400 shrink-0">Delivery At:</span>
                              <span className="text-right text-slate-600">
                                {orderDetail.delivery_address || orderDetail.customer_address}
                              </span>
                            </div>
                          )}
                          {orderDetail.delivery_instructions && (
                            <div className="p-2 bg-amber-50/60 border border-amber-200/60 rounded-xl text-[11px] text-amber-800 mt-2">
                              <span className="font-bold">Instructions:</span> {orderDetail.delivery_instructions}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-2 text-xs text-slate-700">
                          <div className="p-3 bg-slate-100/90 rounded-xl border border-slate-200/90 text-slate-600 font-medium flex items-center gap-2">
                            <span className="text-base">📅</span>
                            <span>Delivery Schedule: <strong className="text-slate-800 font-bold">Not Scheduled</strong></span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Payment Mode:</span>
                            <span className="font-bold text-slate-800">{orderDetail.payment_mode || 'Cash'}</span>
                          </div>
                          {orderDetail.delivery_instructions && (
                            <div className="p-2 bg-amber-50/60 border border-amber-200/60 rounded-xl text-[11px] text-amber-800 mt-2">
                              <span className="font-bold">Instructions:</span> {orderDetail.delivery_instructions}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Line Items Table */}
                  <div className="border border-slate-200 rounded-2xl overflow-hidden">
                    <div className="px-5 py-3 bg-slate-100/80 border-b border-slate-200 flex items-center justify-between">
                      <h3 className="text-xs font-black uppercase tracking-wider text-slate-600">
                        Ordered Items ({(orderDetail.items || []).length})
                      </h3>
                    </div>
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-4">#</th>
                          <th className="py-2.5 px-4">Product Name</th>
                          <th className="py-2.5 px-4 text-center">Quantity</th>
                          <th className="py-2.5 px-4 text-right">Unit Rate (₹)</th>
                          <th className="py-2.5 px-4 text-right">Amount (₹)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {(orderDetail.items || []).map((it, idx) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="py-2.5 px-4 text-slate-400 font-bold">{idx + 1}</td>
                            <td className="py-2.5 px-4 font-bold text-slate-800">{it.productName}</td>
                            <td className="py-2.5 px-4 text-center font-extrabold text-slate-900">{it.quantity}</td>
                            <td className="py-2.5 px-4 text-right text-slate-600">{parseFloat(it.rate || 0).toFixed(2)}</td>
                            <td className="py-2.5 px-4 text-right font-bold text-slate-900">
                              {parseFloat(it.amount || it.quantity * it.rate || 0).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Financial Breakdown Card (Read-Only) */}
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 flex flex-col md:flex-row justify-between gap-6">
                    <div className="space-y-2 text-xs text-slate-600 max-w-sm">
                      {orderDetail.notes && (
                        <div>
                          <span className="font-bold text-slate-700">Order Notes:</span>
                          <p className="mt-0.5 text-slate-600 bg-white p-2.5 rounded-xl border border-slate-200">
                            {orderDetail.notes}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="w-full md:w-72 space-y-2 text-xs">
                      <div className="flex justify-between text-slate-500">
                        <span>Sub Total:</span>
                        <span className="font-medium text-slate-800">{formatCurrency(orderDetail.sub_total)}</span>
                      </div>
                      {parseFloat(orderDetail.discount || 0) > 0 && (
                        <div className="flex justify-between text-emerald-600">
                          <span>Discount:</span>
                          <span>- {formatCurrency(orderDetail.discount)}</span>
                        </div>
                      )}
                      {parseFloat(orderDetail.tax || 0) > 0 && (
                        <div className="flex justify-between text-slate-500">
                          <span>Tax / GST:</span>
                          <span>+ {formatCurrency(orderDetail.tax)}</span>
                        </div>
                      )}
                      <div className="pt-2 border-t border-slate-200 flex justify-between font-extrabold text-base text-slate-900">
                        <span>Grand Total:</span>
                        <span className="text-primary">{formatCurrency(orderDetail.grand_total)}</span>
                      </div>
                      <div className="flex justify-between text-emerald-700 font-bold">
                        <span>Advance Paid:</span>
                        <span>{formatCurrency(orderDetail.advance_amount)}</span>
                      </div>
                      <div className="flex justify-between text-amber-700 font-bold pt-1 border-t border-dashed border-slate-200">
                        <span>Pending Balance:</span>
                        <span>{formatCurrency(orderDetail.pending_amount)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Audit Trail Details */}
                  <div className="bg-white border border-slate-100 rounded-xl p-4 text-[11px] text-slate-500 grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <span className="text-slate-400 block">Created By:</span>
                      <span className="font-bold text-slate-700">{orderDetail.created_by || 'Admin'}</span>
                    </div>
                    {orderDetail.edited_by && (
                      <div>
                        <span className="text-slate-400 block">Last Edited By:</span>
                        <span className="font-bold text-slate-700">
                          {orderDetail.edited_by} ({formatDate(orderDetail.edited_at)})
                        </span>
                      </div>
                    )}
                    {orderDetail.supplied_by && (
                      <div>
                        <span className="text-slate-400 block">Supplied By:</span>
                        <span className="font-bold text-emerald-700">
                          {orderDetail.supplied_by} ({formatDate(orderDetail.supplied_at)})
                        </span>
                      </div>
                    )}
                    {orderDetail.cancelled_by && (
                      <div className="col-span-2">
                        <span className="text-rose-600 font-bold block">
                          Cancelled by {orderDetail.cancelled_by} ({formatDate(orderDetail.cancelled_at)})
                        </span>
                        <span className="text-slate-600 italic">Reason: {orderDetail.cancellation_reason}</span>
                      </div>
                    )}
                  </div>
                </>
              ) : null}
            </div>

            {/* Modal Footer - Close Only */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2 shrink-0">
              <button
                onClick={() => setIsDetailOpen(false)}
                className="px-5 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-all shadow-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* PRINT SLIP / INVOICE MODAL */}
      {/* ========================================================================= */}
      {isPrintModalOpen && orderDetail && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between shrink-0 print:hidden">
              <h3 className="font-bold text-sm">Order Receipt Preview</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleTriggerPrint}
                  className="px-4 py-1.5 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary/90"
                >
                  🖨️ Print Now
                </button>
                <button
                  onClick={() => setIsPrintModalOpen(false)}
                  className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 text-xs font-bold"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Printable Content */}
            <div ref={printRef} className="p-8 text-slate-900 space-y-6 print:p-0">
              <div className="border-b border-slate-200 pb-4 flex justify-between items-start">
                <div>
                  <h1 className="text-2xl font-black text-slate-900 tracking-tight">KEMP'S</h1>
                  <p className="text-xs text-slate-500">Premium Bottled Water & Beverage Supplies</p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block">ORDER SLIP</span>
                  <span className="text-lg font-black text-primary">#{orderDetail.id}</span>
                  <p className="text-xs text-slate-500 mt-0.5">{formatDate(orderDetail.created_at)}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="font-bold text-slate-400 uppercase text-[10px] tracking-wider block mb-1">CUSTOMER</span>
                  <p className="font-bold text-slate-900 text-sm">{orderDetail.customer_name}</p>
                  <p className="text-slate-600">Phone: {orderDetail.customer_phone}</p>
                  {orderDetail.customer_gstin && <p className="text-slate-600">GSTIN: {orderDetail.customer_gstin}</p>}
                  <p className="text-slate-600">{orderDetail.customer_address}</p>
                </div>
                <div>
                  <span className="font-bold text-slate-400 uppercase text-[10px] tracking-wider block mb-1">DELIVERY SCHEDULE</span>
                  {hasValidDeliverySchedule(orderDetail) ? (
                    <>
                      <p className="font-bold text-slate-900 text-sm">📅 {formatDate(orderDetail.supply_date)}</p>
                      <p className="text-slate-600">Time: {formatTime12Hour(orderDetail.supply_time)}</p>
                      {(orderDetail.delivery_address || orderDetail.customer_address) && (
                        <p className="text-slate-600">Address: {orderDetail.delivery_address || orderDetail.customer_address}</p>
                      )}
                    </>
                  ) : (
                    <p className="font-bold text-slate-600 text-sm">Not Scheduled</p>
                  )}
                </div>
              </div>

              <table className="w-full text-left text-xs border border-slate-200">
                <thead className="bg-slate-100 text-[11px] font-bold text-slate-600 uppercase border-b border-slate-200">
                  <tr>
                    <th className="p-2">Item</th>
                    <th className="p-2 text-center">Qty</th>
                    <th className="p-2 text-right">Rate (₹)</th>
                    <th className="p-2 text-right">Amount (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {(orderDetail.items || []).map((it, idx) => (
                    <tr key={idx}>
                      <td className="p-2 font-semibold">{it.productName}</td>
                      <td className="p-2 text-center font-bold">{it.quantity}</td>
                      <td className="p-2 text-right">{parseFloat(it.rate || 0).toFixed(2)}</td>
                      <td className="p-2 text-right font-bold">{parseFloat(it.amount || it.quantity * it.rate || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex justify-end text-xs">
                <div className="w-56 space-y-1 text-right">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Sub Total:</span>
                    <span>{formatCurrency(orderDetail.sub_total)}</span>
                  </div>
                  {parseFloat(orderDetail.discount || 0) > 0 && (
                    <div className="flex justify-between text-emerald-600">
                      <span>Discount:</span>
                      <span>- {formatCurrency(orderDetail.discount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-extrabold text-sm border-t border-slate-200 pt-1">
                    <span>Grand Total:</span>
                    <span className="text-primary">{formatCurrency(orderDetail.grand_total)}</span>
                  </div>
                  <div className="flex justify-between text-emerald-700 font-bold">
                    <span>Advance Paid:</span>
                    <span>{formatCurrency(orderDetail.advance_amount)}</span>
                  </div>
                  <div className="flex justify-between text-amber-700 font-bold">
                    <span>Balance Due:</span>
                    <span>{formatCurrency(orderDetail.pending_amount)}</span>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-6 text-[10px] text-slate-400 text-center">
                <p>Thank you for your business!</p>
                <p className="mt-0.5">This is a computer-generated order receipt from Kemp's Internal Application.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderDetails;
