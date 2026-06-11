import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';

const InventoryHistory = () => {
  const navigate = useNavigate();

  // Data states
  const [bills, setBills] = useState([]);
  const [totalBills, setTotalBills] = useState(0);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const limit = 10;

  // Analytics states
  const [analytics, setAnalytics] = useState({
    totalBills: 0,
    totalValue: 0,
    supplierCount: 0,
    supplierBreakdown: []
  });

  // Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [billedTo, setBilledTo] = useState('All');
  const [supplierId, setSupplierId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('All');

  // Dropdown lists
  const [suppliers, setSuppliers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [allMaterials, setAllMaterials] = useState([]);

  // Modal states
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [editingBill, setEditingBill] = useState(null);
  const [deletingBill, setDeletingBill] = useState(null);
  const [viewingBill, setViewingBill] = useState(null);

  // Bill Header Form State (for editing)
  const [billHeader, setBillHeader] = useState({
    billDate: '',
    supplierId: '',
    billedTo: '',
    billNumber: '',
    paymentMethod: '',
    remarks: ''
  });
  const [billItems, setBillItems] = useState([]);

  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Available Companies Billed To
  const billedToCompanies = [
    'KEMPANNAVAR INDUSTRIES',
    'KEMPS PET INDUSTRIES'
  ];

  // Available Units
  const unitsList = ['KG', 'TON', 'PCS', 'BOX', 'BAG', 'LTR'];

  useEffect(() => {
    fetchSuppliersList();
    fetchProductsAndCategories();
  }, []);

  useEffect(() => {
    fetchInventoryHistory();
    fetchAnalyticsData();
  }, [currentPage, searchQuery, startDate, endDate, billedTo, supplierId, paymentMethod]);

  const fetchInventoryHistory = async () => {
    try {
      setLoading(true);
      const res = await api.get('/inventory/history', {
        params: {
          page: currentPage,
          limit,
          search: searchQuery,
          startDate,
          endDate,
          billedTo,
          supplierId,
          paymentMethod
        }
      });
      if (res.data.ok) {
        setBills(res.data.bills || []);
        setTotalBills(res.data.total || 0);
      }
    } catch (err) {
      console.error('Failed to fetch inventory history:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAnalyticsData = async () => {
    try {
      const res = await api.get('/inventory/analytics', {
        params: {
          billedTo,
          startDate,
          endDate
        }
      });
      if (res.data.ok) {
        setAnalytics(res.data.analytics);
      }
    } catch (err) {
      console.error('Failed to fetch analytics:', err);
    }
  };

  const fetchSuppliersList = async () => {
    try {
      const res = await api.get('/company-details', { params: { limit: 100 } });
      if (res.data.ok) {
        setSuppliers(res.data.companies || []);
      }
    } catch (err) {
      console.error('Failed to fetch suppliers:', err);
    }
  };

  const fetchProductsAndCategories = async () => {
    try {
      const catRes = await api.get('/raw-materials/categories');
      const matRes = await api.get('/raw-materials', { params: { limit: 200 } });
      
      if (catRes.data.ok) setCategories(catRes.data.categories || []);
      if (matRes.data.ok) setAllMaterials(matRes.data.materials || []);
    } catch (err) {
      console.error('Failed to fetch product list:', err);
    }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    if (name === 'searchQuery') setSearchQuery(value);
    if (name === 'startDate') setStartDate(value);
    if (name === 'endDate') setEndDate(value);
    if (name === 'billedTo') setBilledTo(value);
    if (name === 'supplierId') setSupplierId(value);
    if (name === 'paymentMethod') setPaymentMethod(value);
    setCurrentPage(1);
  };

  // Editing logic
  const handleOpenForm = async (bill) => {
    setFormError('');
    setFormSuccess('');
    
    try {
      setLoading(true);
      const res = await api.get(`/inventory/${bill.id}`);
      if (res.data.ok) {
        setEditingBill(res.data.bill);
        setBillHeader({
          billDate: res.data.bill.bill_date,
          supplierId: res.data.bill.supplier_id,
          billedTo: res.data.bill.billed_to,
          billNumber: res.data.bill.bill_number,
          paymentMethod: res.data.bill.payment_method,
          remarks: res.data.bill.remarks || ''
        });

        // Format items
        const formattedItems = res.data.items.map(item => ({
          id: item.id,
          rawMaterialId: item.raw_material_id,
          categoryId: allMaterials.find(m => m.id === item.raw_material_id)?.category_id || '',
          unit: item.unit,
          bagsBox: item.bags_box,
          totalQuantity: item.total_quantity,
          ratePerUnit: item.rate_per_unit,
          qtyInPcs: item.qty_in_pcs,
          perPcRate: item.per_pc_rate,
          amount: item.amount,
          taxPercent: item.tax_percent,
          taxAmount: item.tax_amount,
          expenses: item.expenses,
          finalTotal: item.final_total,
          remarks: item.remarks || ''
        }));
        setBillItems(formattedItems);
        setIsFormModalOpen(true);
      }
    } catch (err) {
      alert('Failed to load bill details for editing.');
    } finally {
      setLoading(false);
    }
  };

  const handleCloseForm = () => {
    setIsFormModalOpen(false);
    setEditingBill(null);
    setBillHeader({
      billDate: '',
      supplierId: '',
      billedTo: '',
      billNumber: '',
      paymentMethod: '',
      remarks: ''
    });
    setBillItems([]);
  };

  const handleAddProductRow = () => {
    setBillItems(prev => [...prev, {
      rawMaterialId: '',
      categoryId: '',
      unit: 'KG',
      bagsBox: '',
      totalQuantity: '',
      ratePerUnit: '',
      qtyInPcs: '',
      perPcRate: '',
      amount: '',
      taxPercent: '0',
      taxAmount: '0',
      expenses: '',
      finalTotal: '0',
      remarks: ''
    }]);
  };

  const handleRemoveProductRow = (index) => {
    if (billItems.length === 1) return;
    setBillItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleHeaderChange = (e) => {
    const { name, value } = e.target;
    setBillHeader(prev => ({ ...prev, [name]: value }));
  };

  const handleItemChange = (index, name, value) => {
    setBillItems(prev => {
      const updated = [...prev];
      const row = { ...updated[index], [name]: value };

      // If category changes, reset the sub-product
      if (name === 'categoryId') {
        row.rawMaterialId = '';
      }

      // If raw material changes, auto-load its default unit
      if (name === 'rawMaterialId') {
        const material = allMaterials.find(m => m.id === parseInt(value, 10));
        if (material) {
          row.unit = material.unit || 'KG';
        }
      }

      // Find if selected category is Preforms
      const category = categories.find(c => c.id === parseInt(row.categoryId, 10));
      const isPreforms = category && category.name.toLowerCase() === 'preforms';

      const bags = parseFloat(row.bagsBox) || 0;
      const rate = parseFloat(row.ratePerUnit) || 0;
      const taxPct = parseFloat(row.taxPercent) || 0;
      const exp = parseFloat(row.expenses) || 0;

      // Preforms specific calculations
      if (isPreforms) {
        const material = allMaterials.find(m => m.id === parseInt(row.rawMaterialId, 10));
        const weight = material ? parseFloat(material.sub_product_name) : 0;

        // Auto-calculate Total Quantity for preforms: bagsBox * 25
        if (name === 'bagsBox' || name === 'rawMaterialId' || name === 'categoryId') {
          if (row.bagsBox !== '') {
            row.totalQuantity = (bags * 25).toString();
          } else {
            row.totalQuantity = '';
          }
        }

        const qty = parseFloat(row.totalQuantity) || 0;

        // Auto-calculate qtyInPcs: (1000 / weight) * 25 * bagsBox
        if (weight > 0 && bags > 0) {
          row.qtyInPcs = Math.round((1000 / weight) * 25 * bags).toString();
        } else {
          row.qtyInPcs = '0';
        }

        // Auto-calculate perPcRate: ratePerUnit / (1000 / weight)
        if (weight > 0 && rate > 0) {
          row.perPcRate = (rate / (1000 / weight)).toFixed(2);
        } else {
          row.perPcRate = '0.00';
        }

        // Auto-calculate amount: totalQuantity * ratePerUnit
        row.amount = (qty * rate).toFixed(2);
      } else {
        // Non-preforms: perPcRate is disabled (N/A)
        row.perPcRate = 'N/A';
        // Note: For non-preforms, totalQuantity, ratePerUnit, qtyInPcs, amount, etc. are entered manually.
      }

      const amt = parseFloat(row.amount) || 0;

      // Tax Amount
      row.taxAmount = (amt * taxPct / 100).toFixed(2);

      // Final Product Total (Exclude expenses as per instructions)
      row.finalTotal = (amt + parseFloat(row.taxAmount)).toFixed(2);

      updated[index] = row;
      return updated;
    });
  };


  const getBillSummary = () => {
    const productsCount = billItems.length;
    let subTotal = 0;
    let totalTax = 0;
    let totalExpenses = 0;
    let grandTotal = 0;

    billItems.forEach(item => {
      subTotal += parseFloat(item.amount) || 0;
      totalTax += parseFloat(item.taxAmount) || 0;
      totalExpenses += parseFloat(item.expenses) || 0;
      grandTotal += parseFloat(item.finalTotal) || 0;
    });

    return { productsCount, subTotal, totalTax, totalExpenses, grandTotal };
  };

  const handleSaveBill = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    const { billDate, supplierId, billedTo, paymentMethod } = billHeader;
    if (!billDate) return setFormError('Bill Date is required.');
    if (!supplierId) return setFormError('Supplier is required.');
    if (!billedTo) return setFormError('Billed To is required.');
    if (!paymentMethod) return setFormError('Payment Method is required.');

    for (let i = 0; i < billItems.length; i++) {
      const item = billItems[i];
      if (!item.rawMaterialId) return setFormError(`Product missing in Row #${i + 1}.`);
      if (parseFloat(item.totalQuantity) <= 0) return setFormError(`Quantity must be > 0 in Row #${i + 1}.`);
    }

    const { subTotal, totalTax, totalExpenses, grandTotal } = getBillSummary();
    const payload = {
      ...billHeader,
      subTotal,
      totalTax,
      additionalExpenses: totalExpenses,
      grandTotal,
      items: billItems
    };

    setIsSaving(true);
    try {
      const res = await api.put(`/inventory/${editingBill.id}`, payload);
      if (res.data.ok) {
        setFormSuccess('Inventory purchase bill updated successfully!');
        setTimeout(() => {
          setIsFormModalOpen(false);
          fetchInventoryHistory();
        }, 1000);
      } else {
        setFormError(res.data.error || 'Failed to update bill.');
      }
    } catch (err) {
      setFormError(err.response?.data?.error || err.message || 'An error occurred.');
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = (bill) => {
    setDeletingBill(bill);
    setIsDeleteModalOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingBill) return;
    try {
      const res = await api.delete(`/inventory/${deletingBill.id}`);
      if (res.data.ok) {
        setIsDeleteModalOpen(false);
        setDeletingBill(null);
        fetchInventoryHistory();
        fetchAnalyticsData();
      } else {
        alert(res.data.error || 'Failed to delete record.');
      }
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  const handleOpenView = async (bill) => {
    try {
      setLoading(true);
      const res = await api.get(`/inventory/${bill.id}`);
      if (res.data.ok) {
        setViewingBill({
          bill: res.data.bill,
          items: res.data.items
        });
        setIsViewModalOpen(true);
      }
    } catch (err) {
      alert('Failed to load bill details.');
    } finally {
      setLoading(false);
    }
  };

  const formatDateDDMMYYYY = (dateStr) => {
    if (!dateStr) return '—';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    const date = new Date(dateStr);
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  const handlePrintBill = (billData) => {
    const printWindow = window.open('', '_blank');
    const html = `
      <html>
        <head>
          <title>Inventory Purchase Bill Details - ${billData.bill.id}</title>
          <style>
            body { font-family: 'Segoe UI', sans-serif; padding: 40px; color: #334155; }
            .header-invoice { border-bottom: 2px solid #cbd5e1; padding-bottom: 20px; margin-bottom: 25px; display: flex; justify-content: space-between; align-items: start; }
            .header-invoice h1 { font-size: 22px; font-weight: 900; color: #0f172a; margin: 0; }
            .header-invoice p { font-size: 13px; color: #64748b; margin: 4px 0 0 0; }
            .meta-item { border-left: 3px solid #1a56db; padding-left: 10px; }
            .meta-item strong { color: #475569; display: block; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th { background-color: #f8fafc; border-bottom: 2px solid #94a3b8; color: #475569; font-size: 10px; font-weight: 800; text-transform: uppercase; padding: 12px 14px; text-align: left; }
            td { border-bottom: 1px solid #e2e8f0; padding: 12px 14px; font-size: 12px; color: #334155; }
            .amount { font-weight: bold; }
            .summary-box { float: right; width: 300px; margin-top: 35px; border-top: 2px solid #e2e8f0; padding-top: 15px; font-size: 13px; line-height: 1.8; }
            .summary-row { display: flex; justify-content: space-between; }
            .summary-row.grand { font-size: 15px; font-weight: 800; color: #0f172a; border-top: 1px dashed #cbd5e1; padding-top: 8px; margin-top: 8px; }
          </style>
        </head>
        <body>
          <div class="header-invoice">
            <div>
              <h1>INVENTORY PURCHASE ENTRY</h1>
              <p>Entry System Reference: <strong>${billData.bill.id}</strong></p>
            </div>
            <div>
              <div style="background: #f1f5f9; border: 1px solid #cbd5e1; padding: 8px 12px; font-size: 12px; font-weight: 700; border-radius: 6px;">
                DATE: ${formatDateDDMMYYYY(billData.bill.bill_date)}
              </div>
            </div>
          </div>
          
          <div style="display: flex; gap: 40px; margin-bottom: 35px; justify-content: space-between;">
            <div class="meta-item">
              <strong>Supplier Profile</strong>
              <span style="font-size: 14px; font-weight: 700; color: #1e293b;">${billData.bill.supplier_name}</span>
            </div>
            <div class="meta-item">
              <strong>Billed To Company</strong>
              <span style="font-size: 14px; font-weight: 700; color: #1e293b;">${billData.bill.billed_to}</span>
            </div>
            <div class="meta-item">
              <strong>Invoice Details</strong>
              <span>Bill No: ${billData.bill.bill_number || '—'}</span><br/>
              <span>Payment Mode: ${billData.bill.payment_method}</span>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>Sub Product</th>
                <th>Qty</th>
                <th>Unit</th>
                <th>Bags/Box</th>
                <th>Rate (₹)</th>
                <th>Amount (₹)</th>
                <th>Tax (%)</th>
                <th>Tax (₹)</th>
                <th>Expenses (₹)</th>
                <th>Final Total (₹)</th>
              </tr>
            </thead>
            <tbody>
              ${billData.items.map(item => `
                <tr>
                  <td>${item.category_name}</td>
                  <td style="font-weight: 700;">${item.sub_product_name}</td>
                  <td>${item.total_quantity}</td>
                  <td style="text-transform: uppercase;">${item.unit}</td>
                  <td>${item.bags_box || '—'}</td>
                  <td>₹${item.rate_per_unit}</td>
                  <td class="amount">₹${item.amount}</td>
                  <td>${item.tax_percent}%</td>
                  <td>₹${item.tax_amount}</td>
                  <td>₹${item.expenses}</td>
                  <td class="amount" style="color:#0f172a;">₹${item.final_total}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div style="clear: both;"></div>
          <div class="summary-box">
            <div class="summary-row"><span>Sub Total:</span> <span>₹ ${parseFloat(billData.bill.sub_total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
            <div class="summary-row"><span>Total Tax:</span> <span>₹ ${parseFloat(billData.bill.total_tax).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
            <div class="summary-row"><span>Additional Expenses:</span> <span>₹ ${parseFloat(billData.bill.additional_expenses).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
            <div class="summary-row grand"><span>Grand Total:</span> <span>₹ ${parseFloat(billData.bill.grand_total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
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



  // Export filtered bills list to PDF
  const handleExportPDF = () => {
    if (bills.length === 0) {
      alert('No data available to print.');
      return;
    }

    const printWindow = window.open('', '_blank');
    const html = `
      <html>
        <head>
          <title>Inventory Purchase Ledger</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; color: #334155; }
            .header-container { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #cbd5e1; padding-bottom: 20px; margin-bottom: 30px; }
            h1 { font-size: 22px; font-weight: 900; color: #0f172a; margin: 0; }
            p { font-size: 13px; color: #64748b; margin: 4px 0 0 0; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th { background-color: #f8fafc; border-bottom: 2px solid #cbd5e1; color: #475569; font-size: 10px; font-weight: 800; text-transform: uppercase; padding: 12px 14px; text-align: left; }
            td { border-bottom: 1px solid #e2e8f0; padding: 12px 14px; font-size: 12px; color: #334155; }
            .mono { font-family: monospace; font-weight: bold; color: #1a56db; }
            .amount { font-weight: bold; }
            .total-box { margin-top: 40px; text-align: right; font-size: 15px; font-weight: 800; color: #0f172a; }
          </style>
        </head>
        <body>
          <div class="header-container">
            <div>
              <h1>KEMP'S INVENTORY SYSTEM</h1>
              <p>Inventory Purchase Registry ledger</p>
            </div>
            <div style="background: #f1f5f9; border: 1px solid #cbd5e1; padding: 6px 12px; font-size: 11px; font-weight: 700; border-radius: 6px;">
              Date range: ${startDate ? formatDateDDMMYYYY(startDate) : 'Beginning'} to ${endDate ? formatDateDDMMYYYY(endDate) : 'Today'}
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Entry ID</th>
                <th>Date</th>
                <th>Bill No</th>
                <th>Supplier</th>
                <th>Billed To</th>
                <th>Products Summary</th>
                <th>Grand Total (₹)</th>
                <th>Payment Mode</th>
              </tr>
            </thead>
            <tbody>
              ${bills.map(b => `
                <tr>
                  <td class="mono">${b.id}</td>
                  <td>${formatDateDDMMYYYY(b.bill_date)}</td>
                  <td>${b.bill_number || '—'}</td>
                  <td style="font-weight: 600;">${b.supplier_name}</td>
                  <td>${b.billed_to}</td>
                  <td>${b.products_summary}</td>
                  <td class="amount">₹ ${parseFloat(b.grand_total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  <td style="text-transform: uppercase;">${b.payment_method}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="total-box">
            Summary Value: ₹ ${bills.reduce((sum, b) => sum + parseFloat(b.grand_total), 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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

  const summaryData = getBillSummary();
  const totalPages = Math.ceil(totalBills / limit) || 1;

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <button 
            onClick={() => navigate('/inventory')}
            className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-650 hover:bg-slate-50 transition-all font-bold text-sm shadow-sm flex items-center gap-1.5 mb-2"
          >
            ← Back
          </button>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase">INVENTORY HISTORY</h1>
          <p className="text-slate-500 text-sm font-medium mt-1 font-heading">View all inventory purchase bills.</p>
        </div>
        
        <div className="flex gap-3">

          <button 
            onClick={handleExportPDF}
            className="btn-premium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs px-4 h-12"
          >
            🖨️ Export to PDF
          </button>
        </div>
      </div>

      {/* FILTER PANEL */}
      <div className="card-premium">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
          {/* Search Box */}
          <div className="relative md:col-span-2">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
            <input 
              type="text" 
              name="searchQuery"
              placeholder="Search by ID, supplier, invoice, product..."
              value={searchQuery}
              onChange={handleFilterChange}
              className="input-premium pl-11 h-11 w-full"
            />
          </div>

          {/* Start Date */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400 uppercase shrink-0">From</span>
            <input 
              type="date"
              name="startDate"
              value={startDate}
              onChange={handleFilterChange}
              className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
            />
          </div>

          {/* End Date */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400 uppercase shrink-0">To</span>
            <input 
              type="date"
              name="endDate"
              value={endDate}
              onChange={handleFilterChange}
              className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
            />
          </div>

          {/* Billed To Company */}
          <div className="space-y-1.5">
            <select
              name="billedTo"
              value={billedTo}
              onChange={handleFilterChange}
              className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
            >
              <option value="All">All Billed To Companies</option>
              {billedToCompanies.map(co => (
                <option key={co} value={co}>{co}</option>
              ))}
            </select>
          </div>

          {/* Supplier Dropdown */}
          <div className="space-y-1.5">
            <select
              name="supplierId"
              value={supplierId}
              onChange={handleFilterChange}
              className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
            >
              <option value="">All Suppliers</option>
              {suppliers.map(sup => (
                <option key={sup.id} value={sup.id}>{sup.company_name}</option>
              ))}
            </select>
          </div>

          {/* Payment Method */}
          <div className="space-y-1.5">
            <select
              name="paymentMethod"
              value={paymentMethod}
              onChange={handleFilterChange}
              className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
            >
              <option value="All">All Payment Modes</option>
              <option value="Cash">Cash</option>
              <option value="Bank">Bank</option>
              <option value="Credit">Credit</option>
            </select>
          </div>
        </div>
      </div>

      {/* ANALYTICS SECTION */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Total Bills Card */}
        <div className="card-premium bg-slate-50/50">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Bills Analyzed</p>
          <h3 className="text-2xl font-black text-slate-800 mt-2">{analytics.totalBills} Bills</h3>
        </div>

        {/* Total Value Card */}
        <div className="card-premium bg-slate-50/50">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Purchase Value</p>
          <h3 className="text-2xl font-black text-slate-800 mt-2">
            ₹ {analytics.totalValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </h3>
        </div>

        {/* Supplier Count Card */}
        <div className="card-premium bg-slate-50/50">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Supplier Count</p>
          <h3 className="text-2xl font-black text-slate-800 mt-2">{analytics.supplierCount} Suppliers</h3>
        </div>
      </div>

      {/* Supplier wise breakdown analytics table */}
      {analytics.supplierBreakdown && analytics.supplierBreakdown.length > 0 && (
        <div className="card-premium">
          <h3 className="text-[11px] font-black text-slate-450 uppercase tracking-widest mb-4 flex items-center gap-1.5">
            <span>📊</span> Supplier-wise Purchase Breakdown
          </h3>
          <div className="overflow-x-auto rounded-xl border border-slate-100">
            <table className="table table-zebra w-full">
              <thead className="bg-slate-50">
                <tr className="text-slate-550 text-[10px] font-black uppercase tracking-wider">
                  <th className="py-3 px-6 text-left">Supplier Company Name</th>
                  <th className="py-3 px-6 text-left">Total Purchase Value</th>
                  <th className="py-3 px-6 text-left">Bill Entries</th>
                </tr>
              </thead>
              <tbody>
                {analytics.supplierBreakdown.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/40">
                    <td className="py-3 px-6 font-bold text-slate-700">{row.company_name}</td>
                    <td className="py-3 px-6 font-black text-slate-800">
                      ₹ {parseFloat(row.totalPurchase).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-6 font-medium text-slate-500">{row.billCount} bills</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* HISTORY RECORDS GRID TABLE */}
      <div className="card-premium">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-[11px] font-black text-slate-450 uppercase tracking-widest">
            📂 Historical Ledgers
          </h3>
          <div className="text-[12px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
            {totalBills} purchase bills
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="table table-zebra w-full overflow-hidden">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr className="text-slate-505 text-[11px] font-black uppercase tracking-wider">
                <th className="py-4 px-6 text-left">Entry ID</th>
                <th className="py-4 px-6 text-left">Date</th>
                <th className="py-4 px-6 text-left">Bill No</th>
                <th className="py-4 px-6 text-left">Supplier</th>
                <th className="py-4 px-6 text-left">Billed To</th>
                <th className="py-4 px-6 text-left">Products</th>
                <th className="py-4 px-6 text-left">Total Amount</th>
                <th className="py-4 px-6 text-left">Payment Mode</th>
                <th className="py-4 px-6 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr>
                  <td colSpan="9" className="py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                       <span className="loading loading-spinner text-primary"></span>
                       <span className="text-slate-400 text-sm font-medium">Fetching historical purchase registry...</span>
                    </div>
                  </td>
                </tr>
              ) : bills.length === 0 ? (
                <tr>
                  <td colSpan="9" className="py-20 text-center text-slate-400 font-medium italic">
                    No purchase bills found matching the filters.
                  </td>
                </tr>
              ) : (
                bills.map((bill) => (
                  <tr key={bill.id} className="hover:bg-blue-50/30 transition-colors group">
                    <td className="py-4 px-6 text-[13px] font-mono font-bold text-primary">{bill.id}</td>
                    <td className="py-4 px-6 text-[13px] font-medium text-slate-550">{formatDateDDMMYYYY(bill.bill_date)}</td>
                    <td className="py-4 px-6 text-[14px] font-bold text-slate-700">{bill.bill_number || '—'}</td>
                    <td className="py-4 px-6 text-[14px] font-bold text-slate-700">{bill.supplier_name}</td>
                    <td className="py-4 px-6 text-[13px] font-medium text-slate-500">{bill.billed_to}</td>
                    <td className="py-4 px-6 text-[13px] text-slate-500 max-w-[150px] truncate" title={bill.products_summary}>
                      {bill.products_summary || '—'}
                    </td>
                    <td className="py-4 px-6 text-[14px] font-black text-slate-800">
                      ₹ {parseFloat(bill.grand_total).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-4 px-6 text-[13px] font-semibold text-slate-600 uppercase">{bill.payment_method}</td>
                    <td className="py-4 px-6">
                      <div className="flex items-center justify-center gap-2">
                        <button 
                          onClick={() => handleOpenView(bill)}
                          className="btn btn-ghost btn-xs text-slate-500 hover:bg-slate-100 rounded-lg px-2"
                        >
                          View
                        </button>
                        <button 
                          onClick={() => handleOpenForm(bill)}
                          className="btn btn-ghost btn-xs text-primary hover:bg-primary/10 rounded-lg px-2"
                        >
                          Edit
                        </button>
                        <button 
                          onClick={() => confirmDelete(bill)}
                          className="btn btn-ghost btn-xs text-red-500 hover:bg-red-50 rounded-lg px-2"
                        >
                          Delete
                        </button>
                        <button 
                          onClick={async () => {
                            try {
                              const res = await api.get(`/inventory/${bill.id}`);
                              if (res.data.ok) handlePrintBill(res.data);
                            } catch (err) {
                              alert('Failed to print bill.');
                            }
                          }}
                          className="btn btn-ghost btn-xs text-slate-650 hover:bg-slate-100 rounded-lg px-2"
                        >
                          Print
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* PAGINATION CONTROLS */}
        {!loading && totalBills > 0 && (
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-100">
            <div className="text-[12px] font-bold text-slate-400 uppercase">
              Page {currentPage} of {totalPages}
            </div>
            <div className="flex gap-2">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-50 text-[12px] font-bold shadow-sm transition-all duration-200"
              >
                Previous
              </button>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-50 text-[12px] font-bold shadow-sm transition-all duration-200"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* EDIT MODAL DIALOG */}
      {isFormModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm pointer-events-auto">
          <div className="bg-white rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.2)] border border-slate-200 w-[780px] h-[90vh] flex flex-col overflow-hidden animate-fade-in pointer-events-auto">
            {/* Header */}
            <div className="bg-[#0b1324] p-6 text-white shrink-0 relative flex justify-between items-center">
              <div>
                <h3 className="text-xl font-black italic uppercase tracking-tight">
                  Edit Purchase Bill Registry: {editingBill?.id}
                </h3>
              </div>
              <button 
                onClick={handleCloseForm}
                className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-all font-bold"
              >
                ✕
              </button>
            </div>

            {/* Scrollable Form Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-[#f8fbff]">
              
              {/* STEP 1: BILL HEADER */}
              <div className="border border-slate-200/80 rounded-2xl bg-white p-5 space-y-4 shadow-sm">
                <div className="text-[11px] font-black text-slate-450 uppercase tracking-widest border-b border-slate-100 pb-2 flex items-center gap-1.5">
                  <span>📄</span> STEP 1 — BILL HEADER (FILL THIS FIRST)
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Date */}
                  <div className="space-y-1.5">
                    <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                      Date *
                    </label>
                    <input 
                      type="date"
                      name="billDate"
                      value={billHeader.billDate}
                      onChange={handleHeaderChange}
                      className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                      required
                    />
                  </div>

                  {/* Supplier */}
                  <div className="space-y-1.5">
                    <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                      Company / Supplier *
                    </label>
                    <select
                      name="supplierId"
                      value={billHeader.supplierId}
                      onChange={handleHeaderChange}
                      className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                      required
                    >
                      <option value="">Type to search company...</option>
                      {suppliers.map(sup => (
                        <option key={sup.id} value={sup.id}>{sup.company_name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Billed To Company */}
                  <div className="space-y-1.5">
                    <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                      Billed To Company *
                    </label>
                    <select
                      name="billedTo"
                      value={billHeader.billedTo}
                      onChange={handleHeaderChange}
                      className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                      required
                    >
                      <option value="">-- Select Billed To --</option>
                      {billedToCompanies.map(co => (
                        <option key={co} value={co}>{co}</option>
                      ))}
                    </select>
                  </div>

                  {/* Bill Number */}
                  <div className="space-y-1.5">
                    <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                      Bill Number
                    </label>
                    <input 
                      type="text"
                      name="billNumber"
                      value={billHeader.billNumber}
                      onChange={handleHeaderChange}
                      placeholder="e.g. INV-001"
                      className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                    />
                  </div>

                  {/* Payment Method */}
                  <div className="space-y-1.5">
                    <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                      Payment Method *
                    </label>
                    <select
                      name="paymentMethod"
                      value={billHeader.paymentMethod}
                      onChange={handleHeaderChange}
                      className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                      required
                    >
                      <option value="">-- Select --</option>
                      <option value="Cash">Cash</option>
                      <option value="Bank">Bank</option>
                      <option value="Credit">Credit</option>
                    </select>
                  </div>

                  {/* Remarks */}
                  <div className="space-y-1.5">
                    <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                      Remarks
                    </label>
                    <input 
                      type="text"
                      name="remarks"
                      value={billHeader.remarks}
                      onChange={handleHeaderChange}
                      placeholder="Optional remarks..."
                      className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                    />
                  </div>
                </div>
              </div>

              {/* STEP 2: ADD PRODUCTS */}
              <div className="border border-slate-200/80 rounded-2xl bg-white p-5 space-y-5 shadow-sm">
                <div className="text-[11px] font-black text-slate-450 uppercase tracking-widest border-b border-slate-100 pb-2 flex items-center gap-1.5">
                  <span>📦</span> STEP 2 — ADD PRODUCTS (ONE OR MORE)
                </div>

                {billItems.map((item, index) => {
                  const category = categories.find(c => c.id === parseInt(item.categoryId, 10));
                  const isPreforms = category && category.name.toLowerCase() === 'preforms';
                  return (
                    <div key={index} className="border border-blue-200 rounded-2xl p-5 bg-blue-50/15 relative space-y-4 animate-fade-in">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <span className="text-[11px] font-extrabold text-primary uppercase tracking-wide">
                        PRODUCT #{index + 1}
                      </span>
                      {billItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveProductRow(index)}
                          className="w-6 h-6 rounded-full bg-red-50 border border-red-200 text-red-500 flex items-center justify-center text-xs hover:bg-red-100 transition-colors"
                        >
                          —
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Product category */}
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-slate-500 block uppercase tracking-wider">
                          Product *
                        </label>
                        <select
                          value={item.categoryId}
                          onChange={(e) => handleItemChange(index, 'categoryId', e.target.value)}
                          className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                          required
                        >
                          <option value="">Select product category</option>
                          {categories.map(cat => (
                            <option key={cat.id} value={cat.id}>{cat.name}</option>
                          ))}
                        </select>
                      </div>

                      {/* Sub Product */}
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-slate-500 block uppercase tracking-wider">
                          Sub Product *
                        </label>
                        <select
                          value={item.rawMaterialId}
                          onChange={(e) => handleItemChange(index, 'rawMaterialId', e.target.value)}
                          className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                          disabled={!item.categoryId}
                          required
                        >
                          <option value="">Select sub product</option>
                          {allMaterials
                            .filter(m => m.category_id === parseInt(item.categoryId, 10))
                            .map(m => (
                              <option key={m.id} value={m.id}>{m.sub_product_name}</option>
                            ))
                          }
                        </select>
                      </div>

                      {/* Unit */}
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-slate-500 block uppercase tracking-wider">
                          Unit *
                        </label>
                        <select
                          value={item.unit}
                          onChange={(e) => handleItemChange(index, 'unit', e.target.value)}
                          className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                          required
                        >
                          {unitsList.map(u => (
                            <option key={u} value={u}>{u}</option>
                          ))}
                        </select>
                      </div>

                      {/* Bags/Box */}
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-slate-500 block uppercase tracking-wider">
                          Bags / Box
                        </label>
                        <input
                          type="number"
                          value={item.bagsBox}
                          onChange={(e) => handleItemChange(index, 'bagsBox', e.target.value)}
                          className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                        />
                      </div>

                      {/* Total Qty */}
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-slate-500 block uppercase tracking-wider">
                          Total Quantity *
                        </label>
                        <input
                          type="number"
                          step="any"
                          value={item.totalQuantity}
                          readOnly={isPreforms}
                          onChange={(e) => handleItemChange(index, 'totalQuantity', e.target.value)}
                          className={`w-full h-11 px-3 rounded-xl border border-slate-200 outline-none text-sm font-medium transition-all ${
                            isPreforms ? 'bg-slate-50 text-slate-500 cursor-not-allowed font-bold' : 'bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10'
                          }`}
                          placeholder="0.00"
                          required
                        />
                        {isPreforms && (
                          <span className="text-[10px] font-bold text-slate-450 mt-1 block">
                            Calculated automatically (Bags/Box * 25).
                          </span>
                        )}
                      </div>

                      {/* Rate */}
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-slate-500 block uppercase tracking-wider">
                          Rate per Unit
                        </label>
                        <input
                          type="number"
                          step="any"
                          value={item.ratePerUnit}
                          onChange={(e) => handleItemChange(index, 'ratePerUnit', e.target.value)}
                          className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                          placeholder="0.00"
                        />
                      </div>

                      {/* Qty in Pcs */}
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-slate-500 block uppercase tracking-wider">
                          Qty in Pcs
                        </label>
                        <input
                          type={isPreforms ? "text" : "number"}
                          value={item.qtyInPcs}
                          readOnly={isPreforms}
                          onChange={(e) => handleItemChange(index, 'qtyInPcs', e.target.value)}
                          className={`w-full h-11 px-3 rounded-xl border border-slate-200 outline-none text-sm font-medium ${
                            isPreforms ? 'bg-slate-50 text-slate-500 cursor-not-allowed font-bold' : 'bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10'
                          }`}
                          placeholder={isPreforms ? "0" : "0.00"}
                        />
                        <span className="text-[10px] font-bold text-slate-400 mt-1 block">
                          {isPreforms ? 'Calculated automatically from Preform weight.' : 'Enter manually.'}
                        </span>
                      </div>

                      {/* Per PC Rate */}
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-slate-500 block uppercase tracking-wider">
                          Per PC Rate
                        </label>
                        <input
                          type="text"
                          value={isPreforms ? (item.perPcRate && !isNaN(parseFloat(item.perPcRate)) ? `₹ ${item.perPcRate}` : '₹ 0.00') : 'Disabled'}
                          readOnly
                          className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-500 outline-none text-sm font-bold cursor-not-allowed"
                        />
                        <span className="text-[10px] font-bold text-slate-400 mt-1 block">
                          {isPreforms ? 'Calculated automatically from Preform weight.' : 'Applicable only for Preforms.'}
                        </span>
                      </div>

                      {/* Amount Manual */}
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-slate-500 block uppercase tracking-wider">
                          {isPreforms ? "Amount (Auto) *" : "Amount (Manual) *"}
                        </label>
                        <input
                          type="number"
                          step="any"
                          value={item.amount}
                          readOnly={isPreforms}
                          onChange={(e) => handleItemChange(index, 'amount', e.target.value)}
                          className={`w-full h-11 px-3 rounded-xl border border-slate-200 outline-none text-sm font-medium ${
                            isPreforms ? 'bg-slate-50 text-slate-550 cursor-not-allowed font-bold' : 'bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10'
                          }`}
                          required
                        />
                        {isPreforms && (
                          <span className="text-[10px] font-bold text-slate-450 mt-1 block">
                            Calculated automatically (Qty * Rate).
                          </span>
                        )}
                      </div>

                      {/* Tax (%) */}
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-slate-500 block uppercase tracking-wider">
                          Tax (%)
                        </label>
                        <input
                          type="number"
                          value={item.taxPercent}
                          onChange={(e) => handleItemChange(index, 'taxPercent', e.target.value)}
                          className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                        />
                      </div>

                      {/* Total Amount Auto */}
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-slate-400 block uppercase tracking-wider">
                          Total Amount (Auto)
                        </label>
                        <input
                          type="text"
                          value={item.finalTotal ? `₹ ${item.finalTotal}` : '0.00'}
                          readOnly
                          className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-blue-50/25 text-slate-750 outline-none text-sm font-bold"
                        />
                      </div>

                      {/* Expenses */}
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-slate-500 block uppercase tracking-wider">
                          Expenses
                        </label>
                        <input
                          type="number"
                          step="any"
                          value={item.expenses}
                          onChange={(e) => handleItemChange(index, 'expenses', e.target.value)}
                          className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                          placeholder="0.00"
                        />
                      </div>

                      {/* Remarks */}
                      <div className="md:col-span-2 space-y-1.5">
                        <label className="text-[11px] font-bold text-slate-500 block uppercase tracking-wider">
                          Remarks
                        </label>
                        <input
                          type="text"
                          value={item.remarks}
                          onChange={(e) => handleItemChange(index, 'remarks', e.target.value)}
                          className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                          placeholder="Notes for this product..."
                        />
                      </div>
                    </div>
                  </div>
                );
              })}

                {/* Add Another Product Row */}
                <button
                  type="button"
                  onClick={handleAddProductRow}
                  className="w-full py-3.5 border-2 border-dashed border-primary/30 rounded-xl text-primary hover:bg-primary/5 font-bold text-xs uppercase tracking-wider transition-all duration-200 flex items-center justify-center gap-1.5"
                >
                  + Add Another Product
                </button>
              </div>

              {/* Feedback messages */}
              {formError && (
                <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-xs font-semibold flex items-center gap-2 border border-red-100">
                  <span>⚠️</span>
                  <span>{formError}</span>
                </div>
              )}
              {formSuccess && (
                <div className="bg-emerald-50 text-emerald-600 px-4 py-3 rounded-xl text-xs font-semibold flex items-center gap-2 border border-emerald-100">
                  <span>✅</span>
                  <span>{formSuccess}</span>
                </div>
              )}
            </div>

            {/* BILL SUMMARY BOX */}
            <div className="bg-[#0b1324] px-6 py-4 text-slate-100 flex flex-wrap items-center justify-around text-center border-t border-slate-800">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">PRODUCTS</span>
                <span className="text-lg font-black text-slate-100">{summaryData.productsCount}</span>
              </div>
              <div className="h-8 w-[1px] bg-slate-800"></div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">SUB TOTAL</span>
                <span className="text-lg font-black text-slate-100">₹{summaryData.subTotal.toFixed(2)}</span>
              </div>
              <div className="h-8 w-[1px] bg-slate-800"></div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">TOTAL TAX</span>
                <span className="text-lg font-black text-slate-100">₹{summaryData.totalTax.toFixed(2)}</span>
              </div>
              <div className="h-8 w-[1px] bg-slate-800"></div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">GRAND TOTAL</span>
                <span className="text-lg font-black text-sky-400">₹{summaryData.grandTotal.toFixed(2)}</span>
              </div>
            </div>

            {/* Modal Actions Footer */}
            <div className="p-6 border-t border-slate-100 bg-white flex gap-4 shrink-0 shadow-[0_-10px_30px_rgba(0,0,0,0.02)]">
              <button 
                type="button" 
                onClick={handleSaveBill}
                disabled={isSaving}
                className="btn-premium bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-100 flex-[2] h-14 text-sm uppercase tracking-wider flex items-center justify-center gap-2"
              >
                {isSaving ? <span className="loading loading-spinner text-white"></span> : <>💾 Save Inventory Bill</>}
              </button>
              <button 
                type="button" 
                onClick={handleCloseForm}
                className="btn-premium bg-slate-50 text-slate-500 hover:bg-slate-100 border border-slate-200 flex-1 h-14 text-sm font-bold uppercase tracking-wider"
              >
                Cancel
              </button>
            </div>

          </div>
        </div>
      )}

      {/* VIEW DETAILS MODAL */}
      {isViewModalOpen && viewingBill && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm pointer-events-auto">
          <div className="bg-white rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.2)] border border-slate-200 w-[720px] h-[80vh] flex flex-col overflow-hidden animate-fade-in pointer-events-auto">
            <div className="flex items-center justify-between p-6 border-b border-slate-150">
              <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight flex items-center gap-1.5">
                <span>📋</span> Purchase Bill Details — {viewingBill.bill.id}
              </h3>
              <button 
                onClick={() => setIsViewModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-55 flex items-center justify-center text-slate-505 hover:bg-slate-100 transition-all font-bold"
              >
                ✕
              </button>
            </div>

            {/* Content Details */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-slate-50/50">
              {/* Header Box */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-5 bg-white border border-slate-200/80 rounded-2xl">
                <div>
                  <span className="text-[10px] font-black text-slate-400 block uppercase">Supplier</span>
                  <span className="text-sm font-bold text-slate-800">{viewingBill.bill.supplier_name}</span>
                </div>
                <div>
                  <span className="text-[10px] font-black text-slate-400 block uppercase">Billed To</span>
                  <span className="text-sm font-bold text-slate-800">{viewingBill.bill.billed_to}</span>
                </div>
                <div>
                  <span className="text-[10px] font-black text-slate-400 block uppercase">Bill Number</span>
                  <span className="text-sm font-bold text-slate-800">{viewingBill.bill.bill_number || '—'}</span>
                </div>
                <div>
                  <span className="text-[10px] font-black text-slate-400 block uppercase">Payment Mode</span>
                  <span className="text-sm font-bold text-slate-800 uppercase">{viewingBill.bill.payment_method}</span>
                </div>
                <div className="mt-2">
                  <span className="text-[10px] font-black text-slate-400 block uppercase">Bill Date</span>
                  <span className="text-sm font-bold text-slate-800">{formatDateDDMMYYYY(viewingBill.bill.bill_date)}</span>
                </div>
                <div className="mt-2 col-span-3">
                  <span className="text-[10px] font-black text-slate-400 block uppercase">Remarks</span>
                  <span className="text-sm text-slate-500 italic">{viewingBill.bill.remarks || '—'}</span>
                </div>
              </div>

              {/* Items List */}
              <div className="border border-slate-200/80 rounded-2xl bg-white overflow-hidden shadow-sm">
                <div className="bg-slate-50/50 px-5 py-3 border-b border-slate-100 text-[10px] font-black text-slate-505 uppercase tracking-widest">
                  Purchased Products Line Items
                </div>
                <div className="p-4 space-y-4">
                  {viewingBill.items.map((item, idx) => (
                    <div key={item.id} className="border border-slate-100 rounded-xl p-4 text-xs font-semibold text-slate-655 bg-[#fafcff]/50 space-y-2">
                      <div className="flex justify-between border-b border-slate-100 pb-1 mb-2">
                        <span className="font-bold text-[11px] text-primary">ITEM #{idx + 1}: {item.category_name} &gt; {item.sub_product_name}</span>
                        <span className="text-[10px] text-slate-400">Unit: {item.unit} | Bags/Box: {item.bags_box || 0}</span>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        <div><span className="text-slate-400 block text-[9px] uppercase">Qty</span> {item.total_quantity}</div>
                        <div><span className="text-slate-400 block text-[9px] uppercase">Rate</span> ₹ {item.rate_per_unit}</div>
                        {item.qty_in_pcs > 0 && (
                          <>
                            <div><span className="text-slate-400 block text-[9px] uppercase">Qty Pcs</span> {item.qty_in_pcs}</div>
                            <div><span className="text-slate-400 block text-[9px] uppercase">Rate/Pc</span> ₹ {item.per_pc_rate}</div>
                          </>
                        )}
                        <div><span className="text-slate-400 block text-[9px] uppercase">Base Amount</span> ₹ {item.amount}</div>
                        <div><span className="text-slate-400 block text-[9px] uppercase">Tax ({item.tax_percent}%)</span> ₹ {item.tax_amount}</div>
                        <div><span className="text-slate-400 block text-[9px] uppercase">Expenses</span> ₹ {item.expenses}</div>
                        <div><span className="text-slate-400 block text-[9px] uppercase">Line Total</span> <strong>₹ {item.final_total}</strong></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Total Footer Summary */}
            <div className="bg-[#0b1324] px-6 py-4 text-slate-100 flex items-center justify-around text-center text-xs">
              <div>
                <span className="text-[9px] text-slate-400 uppercase tracking-widest block">SUB TOTAL</span>
                <span className="text-sm font-bold">₹{parseFloat(viewingBill.bill.sub_total).toFixed(2)}</span>
              </div>
              <div>
                <span className="text-[9px] text-slate-400 uppercase tracking-widest block">TOTAL TAX</span>
                <span className="text-sm font-bold">₹{parseFloat(viewingBill.bill.total_tax).toFixed(2)}</span>
              </div>
              <div>
                <span className="text-[9px] text-slate-400 uppercase tracking-widest block">EXPENSES</span>
                <span className="text-sm font-bold">₹{parseFloat(viewingBill.bill.additional_expenses).toFixed(2)}</span>
              </div>
              <div>
                <span className="text-[9px] text-slate-400 uppercase tracking-widest block">GRAND TOTAL</span>
                <span className="text-sm font-bold text-sky-400">₹{parseFloat(viewingBill.bill.grand_total).toFixed(2)}</span>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-white flex gap-2">
              <button
                onClick={() => {
                  setIsViewModalOpen(false);
                  handleOpenForm(viewingBill.bill);
                }}
                className="btn-premium btn-primary-premium flex-1 h-11 text-xs"
              >
                Edit Bill
              </button>
              <button
                onClick={() => handlePrintBill(viewingBill)}
                className="btn-premium bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 flex-1 h-11 text-xs"
              >
                Print Invoice
              </button>
              <button
                onClick={() => setIsViewModalOpen(false)}
                className="btn-premium bg-slate-50 hover:bg-slate-100 text-slate-650 border border-slate-200 flex-1 h-11 text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE DIALOG MODAL */}
      {isDeleteModalOpen && (
        <div className="modal modal-open">
          <div className="modal-box rounded-2xl p-8 max-w-sm border border-slate-200 shadow-2xl">
            <div className="w-14 h-14 bg-red-50 text-red-500 rounded-full flex items-center justify-center text-2xl mx-auto mb-4">
              ⚠️
            </div>
            <h3 className="text-xl font-black text-center text-slate-800">Confirm Deletion</h3>
            <p className="text-center text-slate-505 mt-2 text-sm">
              Are you sure you want to delete purchase bill <b>{deletingBill?.id}</b>?
              <br/>This will also remove all associated stock adjustments.
            </p>
            <div className="flex flex-col gap-2 mt-8">
              <button 
                onClick={handleDelete}
                className="btn-premium bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-200"
              >
                Yes, Delete Record
              </button>
              <button 
                onClick={() => setIsDeleteModalOpen(false)}
                className="btn-premium bg-slate-100 text-slate-600 hover:bg-slate-200"
              >
                No, Keep Record
              </button>
            </div>
          </div>
          <div className="modal-backdrop bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsDeleteModalOpen(false)}></div>
        </div>
      )}

    </div>
  );
};

export default InventoryHistory;
