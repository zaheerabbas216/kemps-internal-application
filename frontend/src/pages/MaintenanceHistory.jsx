import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';

const particularOptions = ['filters', 'CLEANING', 'Others'];

const MaintenanceHistory = () => {
  const navigate = useNavigate();

  // Data states
  const [records, setRecords] = useState([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const limit = 10;

  // Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [filterParticular, setFilterParticular] = useState('');

  // Modals state
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [deletingRecord, setDeletingRecord] = useState(null);
  const [viewingRecord, setViewingRecord] = useState(null);

  // Form fields state
  const [formData, setFormData] = useState({
    particular: '',
    subDetail: '',
    company: '',
    serviceDate: '',
    nextDueDate: '',
    note: '',
    enteredBy: ''
  });

  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Raw materials master list for dropdown linking
  const [rawMaterials, setRawMaterials] = useState([]);

  useEffect(() => {
    fetchRawMaterials();
  }, []);

  const fetchRawMaterials = async () => {
    try {
      const res = await api.get('/raw-materials', {
        params: { page: 1, limit: 1000, activeOnly: true }
      });
      if (res.data.ok) {
        setRawMaterials(res.data.materials || []);
      }
    } catch (err) {
      console.error('Failed to fetch raw materials:', err);
    }
  };

  const getSubProducts = (selectedCategory) => {
    if (!selectedCategory) return [];
    const list = rawMaterials
      .filter(item => (item.category_name || '').toLowerCase() === selectedCategory.toLowerCase())
      .map(item => item.sub_product_name);
    
    // Add existing editing value if not in list
    if (formData.subDetail && !list.includes(formData.subDetail)) {
      list.push(formData.subDetail);
    }
    
    return Array.from(new Set(list)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  };

  useEffect(() => {
    fetchHistory();
  }, [currentPage, searchQuery, startDate, endDate, filterParticular]);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const res = await api.get('/maintenance/history', {
        params: {
          page: currentPage,
          limit,
          search: searchQuery,
          startDate,
          endDate,
          particular: filterParticular
        }
      });
      if (res.data.ok) {
        setRecords(res.data.records || []);
        setTotalRecords(res.data.total || 0);
      }
    } catch (err) {
      console.error('Failed to fetch maintenance history:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1);
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    if (name === 'startDate') setStartDate(value);
    if (name === 'endDate') setEndDate(value);
    if (name === 'filterParticular') setFilterParticular(value);
    setCurrentPage(1);
  };

  const handleOpenForm = (record) => {
    setFormError('');
    setFormSuccess('');
    setEditingRecord(record);
    setFormData({
      particular: record.particular,
      subDetail: record.sub_detail || '',
      company: record.company || '',
      serviceDate: record.service_date,
      nextDueDate: record.next_due_date || '',
      note: record.note || '',
      enteredBy: record.entered_by
    });
    setIsFormModalOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormModalOpen(false);
    setEditingRecord(null);
    setFormData({
      particular: '',
      subDetail: '',
      company: '',
      serviceDate: '',
      nextDueDate: '',
      note: '',
      enteredBy: ''
    });
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleResetForm = () => {
    setFormData({
      particular: editingRecord.particular,
      subDetail: editingRecord.sub_detail || '',
      company: editingRecord.company || '',
      serviceDate: editingRecord.service_date,
      nextDueDate: editingRecord.next_due_date || '',
      note: editingRecord.note || '',
      enteredBy: editingRecord.entered_by
    });
    setFormError('');
    setFormSuccess('');
  };

  const handleSaveRecord = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    const { particular, subDetail, company, serviceDate, nextDueDate, note, enteredBy } = formData;

    if (!particular) return setFormError('Particular service is required.');
    if (!serviceDate) return setFormError('Service Date is required.');
    if (!enteredBy.trim()) return setFormError('Name is required.');

    setIsSaving(true);
    try {
      const res = await api.put(`/maintenance/${editingRecord.id}`, {
        particular,
        subDetail: subDetail.trim(),
        company: company.trim(),
        serviceDate,
        nextDueDate: nextDueDate || null,
        note: note.trim(),
        enteredBy: enteredBy.trim()
      });

      if (res.data.ok) {
        setFormSuccess('Maintenance record updated successfully!');
        setTimeout(() => {
          handleCloseForm();
          fetchHistory();
        }, 1000);
      } else {
        setFormError(res.data.error || 'Failed to update record.');
      }
    } catch (err) {
      setFormError(err.response?.data?.error || err.message || 'An error occurred.');
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = (record) => {
    setDeletingRecord(record);
    setIsDeleteModalOpen(true);
  };

  const handleDeleteRecord = async () => {
    if (!deletingRecord) return;
    try {
      const res = await api.delete(`/maintenance/${deletingRecord.id}`);
      if (res.data.ok) {
        setIsDeleteModalOpen(false);
        setDeletingRecord(null);
        fetchHistory();
      } else {
        alert(res.data.error || 'Failed to delete record.');
      }
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  const handleOpenView = (record) => {
    setViewingRecord(record);
    setIsViewModalOpen(true);
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

  // PDF Export
  const handleExportPDF = () => {
    if (records.length === 0) {
      alert('No data available to print.');
      return;
    }

    const printWindow = window.open('', '_blank');
    const html = `
      <html>
        <head>
          <title>Maintenance Registry History</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; color: #334155; }
            .header-container { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 30px; }
            h1 { font-size: 22px; font-weight: 800; color: #0f172a; margin: 0; }
            p { font-size: 13px; color: #64748b; margin: 5px 0 0 0; }
            .date-badge { font-size: 11px; font-weight: 700; color: #475569; background: #f1f5f9; padding: 6px 12px; border-radius: 8px; border: 1px solid #e2e8f0; text-transform: uppercase; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th { background-color: #f8fafc; border-bottom: 2px solid #cbd5e1; color: #475569; font-size: 10px; font-weight: 800; text-transform: uppercase; padding: 12px 14px; text-align: left; }
            td { border-bottom: 1px solid #e2e8f0; padding: 12px 14px; font-size: 12px; color: #334155; }
            .mono { font-family: monospace; font-weight: bold; color: #1a56db; }
            .due-date { font-weight: bold; color: #ef4444; }
          </style>
        </head>
        <body>
          <div class="header-container">
            <div>
              <h1>KEMP'S INVENTORY SYSTEM</h1>
              <p>Maintenance & Services Registry History</p>
            </div>
            <div class="date-badge">Generated: ${new Date().toLocaleDateString('en-GB')}</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Record ID</th>
                <th>Service Date</th>
                <th>Particular</th>
                <th>Sub Detail</th>
                <th>Company</th>
                <th>Next Due Date</th>
                <th>Note</th>
                <th>Entered By</th>
              </tr>
            </thead>
            <tbody>
              ${records.map(r => `
                <tr>
                  <td class="mono">${r.id}</td>
                  <td>${formatDateDDMMYYYY(r.service_date)}</td>
                  <td style="font-weight: 600;">${r.particular}</td>
                  <td>${r.sub_detail || '—'}</td>
                  <td>${r.company || '—'}</td>
                  <td class="${r.next_due_date ? 'due-date' : ''}">${r.next_due_date ? formatDateDDMMYYYY(r.next_due_date) : '—'}</td>
                  <td style="color: #64748b; font-style: italic;">${r.note || '—'}</td>
                  <td>${r.entered_by}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
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

  const totalPages = Math.ceil(totalRecords / limit) || 1;

  return (
    <div className="space-y-6 animate-fade-in">

      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <button 
            onClick={() => navigate('/maintenance-form')}
            className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-650 hover:bg-slate-50 transition-all font-bold text-sm shadow-sm flex items-center gap-1.5 mb-2"
          >
            ← Back
          </button>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase">Maintenance History</h1>
          <p className="text-slate-500 text-sm font-medium mt-1">View and audit all maintenance log entries</p>
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

      {/* FILTER CONTROLS & TABLE CARD */}
      <div className="card-premium">
        
        {/* Filters Grid */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          {/* Search Box */}
          <div className="relative md:col-span-2">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
            <input 
              type="text" 
              placeholder="Search by ID, Creator, Note, Sub Detail..."
              value={searchQuery}
              onChange={handleSearchChange}
              className="input-premium pl-11 h-11 w-full"
            />
          </div>

          {/* Particular Filter */}
          <div>
            <select
              name="filterParticular"
              value={filterParticular}
              onChange={handleFilterChange}
              className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
            >
              <option value="">All Particulars</option>
              {particularOptions.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
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
        </div>

        {/* Records Count Badge */}
        <div className="flex justify-end mb-4">
          <div className="text-[12px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
            {totalRecords} Total Records
          </div>
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="table table-zebra w-full overflow-hidden">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr className="text-slate-500 text-[11px] font-black uppercase tracking-wider">
                <th className="py-4 px-6 text-left">Record ID</th>
                <th className="py-4 px-6 text-left">Service Date</th>
                <th className="py-4 px-6 text-left">Particular Type</th>
                <th className="py-4 px-6 text-left">Sub Detail / Company</th>
                <th className="py-4 px-6 text-left">Next Due Date</th>
                <th className="py-4 px-6 text-left">Note</th>
                <th className="py-4 px-6 text-left">Entered By</th>
                <th className="py-4 px-6 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr>
                  <td colSpan="8" className="py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                       <span className="loading loading-spinner text-primary"></span>
                       <span className="text-slate-400 text-sm font-medium">Fetching history logs...</span>
                    </div>
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan="8" className="py-20 text-center text-slate-400 font-medium italic">
                    No service logs matching the filter criteria.
                  </td>
                </tr>
              ) : (
                records.map((rec) => (
                  <tr key={rec.id} className="hover:bg-blue-50/30 transition-colors group">
                    <td className="py-4 px-6 text-[13px] font-mono font-bold text-primary">{rec.id}</td>
                    <td className="py-4 px-6 text-[13px] font-medium text-slate-550">{formatDateDDMMYYYY(rec.service_date)}</td>
                    <td className="py-4 px-6 text-[14px] font-bold text-slate-700">{rec.particular}</td>
                    <td className="py-4 px-6 text-[14px] text-slate-650">
                      <div>{rec.sub_detail || '—'}</div>
                      {rec.company && <div className="text-[11px] text-slate-400">{rec.company}</div>}
                    </td>
                    <td className="py-4 px-6 text-[13px] font-semibold text-slate-550">
                      {rec.next_due_date ? (
                        <span className="text-red-500">{formatDateDDMMYYYY(rec.next_due_date)}</span>
                      ) : (
                        <span className="text-slate-400">Not Scheduled</span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-[13px] text-slate-500 italic max-w-[160px]">
                      <span className="block truncate" title={rec.note || ''}>{rec.note || '—'}</span>
                    </td>
                    <td className="py-4 px-6 text-[14px] font-semibold text-slate-600">{rec.entered_by}</td>
                    <td className="py-4 px-6">
                      <div className="flex items-center justify-center gap-2">
                        <button 
                          onClick={() => handleOpenView(rec)}
                          className="btn btn-ghost btn-xs text-slate-505 hover:bg-slate-100 rounded-lg px-2"
                        >
                          View
                        </button>
                        <button 
                          onClick={() => handleOpenForm(rec)}
                          className="btn btn-ghost btn-xs text-primary hover:bg-primary/10 rounded-lg px-2"
                        >
                          Edit
                        </button>
                        <button 
                          onClick={() => confirmDelete(rec)}
                          className="btn btn-ghost btn-xs text-red-500 hover:bg-red-50 rounded-lg px-2"
                        >
                          Delete
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
        {!loading && totalRecords > 0 && (
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
          <div className="bg-white rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.2)] border border-slate-200 w-[600px] max-h-[90vh] h-[660px] flex flex-col overflow-hidden animate-fade-in pointer-events-auto">
            {/* Header — blue like Expense */}
            <div className="bg-primary p-7 text-white shrink-0 relative">
              <h3 className="text-2xl font-black italic tracking-tight uppercase">
                Edit Maintenance Record
              </h3>
              <p className="text-blue-100 text-xs mt-1 font-medium italic opacity-85">
                Modifying history record: {editingRecord.id}
              </p>
              <button 
                onClick={handleCloseForm}
                className="absolute right-7 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-all font-bold"
              >
                ✕
              </button>
            </div>

            {/* Scrollable Form Content */}
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
              <form id="maintenanceFormHistory" onSubmit={handleSaveRecord} className="space-y-6">

                {/* Single unified box — matches Expense layout */}
                <div className="border border-slate-200/80 rounded-2xl bg-white p-6 space-y-4">
                  <div className="text-[11px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 pb-2 flex items-center gap-1.5">
                    <span>🔧</span> SERVICE DETAILS
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

                    {/* Particular */}
                    <div className="space-y-1.5">
                      <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                        Particular *
                      </label>
                      <select 
                        name="particular"
                        value={formData.particular}
                        onChange={(e) => {
                          handleInputChange(e);
                          setFormData(prev => ({ ...prev, subDetail: '' }));
                        }}
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                        required
                      >
                        <option value="">Select Particular</option>
                        <option value="filters">Filters</option>
                        <option value="CLEANING">Cleaning</option>
                        <option value="Others">Others</option>
                        {formData.particular && !['filters', 'cleaning', 'others'].includes(formData.particular.toLowerCase()) && (
                          <option value={formData.particular}>{formData.particular}</option>
                        )}
                      </select>
                    </div>

                    {/* Sub */}
                    <div className="space-y-1.5">
                      <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                        Sub
                      </label>
                      <select 
                        name="subDetail"
                        value={formData.subDetail}
                        onChange={handleInputChange}
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                        disabled={!formData.particular}
                      >
                        <option value="">Select Sub Product</option>
                        {getSubProducts(formData.particular).map(sub => (
                          <option key={sub} value={sub}>{sub}</option>
                        ))}
                      </select>
                    </div>

                    {/* Company */}
                    <div className="md:col-span-2 space-y-1.5">
                      <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                        Company
                      </label>
                      <input 
                        type="text" 
                        name="company"
                        value={formData.company}
                        onChange={handleInputChange}
                        placeholder="Enter company name" 
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                      />
                    </div>

                    {/* Service Date */}
                    <div className="space-y-1.5">
                      <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                        Service Date *
                      </label>
                      <input 
                        type="date" 
                        name="serviceDate"
                        value={formData.serviceDate}
                        onChange={handleInputChange}
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                        required
                      />
                    </div>

                    {/* Next Due Date */}
                    <div className="space-y-1.5">
                      <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                        Next Due Date
                      </label>
                      <input 
                        type="date" 
                        name="nextDueDate"
                        value={formData.nextDueDate}
                        onChange={handleInputChange}
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                      />
                      <span className="text-[10px] text-slate-400 font-medium block pl-1">Leave blank if not applicable</span>
                    </div>

                    {/* Entered By */}
                    <div className="space-y-1.5">
                      <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                        Name (Entered By) *
                      </label>
                      <input 
                        type="text" 
                        name="enteredBy"
                        value={formData.enteredBy}
                        onChange={handleInputChange}
                        placeholder="Who logged this activity?" 
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                        required
                      />
                    </div>

                    {/* Note */}
                    <div className="space-y-1.5">
                      <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                        Note
                      </label>
                      <input 
                        type="text" 
                        name="note"
                        value={formData.note}
                        onChange={handleInputChange}
                        placeholder="Optional remarks or observations..."
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                      />
                    </div>

                  </div>
                </div>

                {/* Feedback */}
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
              </form>
            </div>

            {/* Modal Footer */}
            <div className="p-8 border-t border-slate-100 bg-white flex gap-4 shrink-0 shadow-[0_-10px_30px_rgba(0,0,0,0.02)]">
              <button 
                type="submit" 
                form="maintenanceFormHistory"
                disabled={isSaving}
                className="btn-premium btn-primary-premium flex-[2] h-14 text-sm uppercase tracking-wider"
              >
                {isSaving ? <span className="loading loading-spinner"></span> : 'Update Record'}
              </button>
              <button 
                type="button" 
                onClick={handleResetForm}
                className="btn-premium bg-slate-50 text-slate-550 hover:bg-slate-100 border border-slate-200 flex-1 h-14 text-sm font-bold uppercase tracking-wider"
              >
                Reset
              </button>
              <button 
                type="button" 
                onClick={handleCloseForm}
                className="btn-premium bg-white text-slate-550 hover:bg-slate-50 border border-slate-200 flex-1 h-14 text-sm font-bold uppercase tracking-wider"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VIEW SERVICE DETAILS MODAL */}
      {isViewModalOpen && viewingRecord && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm pointer-events-auto">
          <div className="bg-white rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.2)] border border-slate-200 w-[500px] p-8 flex flex-col gap-6 max-h-[90vh] overflow-y-auto animate-fade-in pointer-events-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-150">
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-1.5">
                <span>📋</span> Service Details
              </h3>
              <button 
                onClick={() => setIsViewModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-55 flex items-center justify-center text-slate-505 hover:bg-slate-100 transition-all font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-sm font-medium">
              <div className="grid grid-cols-3 gap-2 py-2 border-b border-slate-50">
                <span className="text-slate-400 font-bold text-xs uppercase tracking-wider">Record ID</span>
                <span className="col-span-2 font-mono font-bold text-primary text-xs">{viewingRecord.id}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-2 border-b border-slate-50">
                <span className="text-slate-400 font-bold text-xs uppercase tracking-wider">Service Date</span>
                <span className="col-span-2 text-slate-800">{formatDateDDMMYYYY(viewingRecord.service_date)}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-2 border-b border-slate-50">
                <span className="text-slate-400 font-bold text-xs uppercase tracking-wider">Particular</span>
                <span className="col-span-2 text-slate-800 font-bold">{viewingRecord.particular}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-2 border-b border-slate-50">
                <span className="text-slate-400 font-bold text-xs uppercase tracking-wider">Sub Detail</span>
                <span className="col-span-2 text-slate-700">{viewingRecord.sub_detail || '—'}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-2 border-b border-slate-50">
                <span className="text-slate-400 font-bold text-xs uppercase tracking-wider">Company</span>
                <span className="col-span-2 text-slate-700">{viewingRecord.company || '—'}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-2 border-b border-slate-50">
                <span className="text-slate-400 font-bold text-xs uppercase tracking-wider">Next Due Date</span>
                <span className="col-span-2 font-bold text-red-500">
                  {viewingRecord.next_due_date ? formatDateDDMMYYYY(viewingRecord.next_due_date) : 'Not Scheduled'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-2 border-b border-slate-50">
                <span className="text-slate-400 font-bold text-xs uppercase tracking-wider">Entered By</span>
                <span className="col-span-2 text-slate-700">{viewingRecord.entered_by}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-2">
                <span className="text-slate-400 font-bold text-xs uppercase tracking-wider">Note</span>
                <span className="col-span-2 text-slate-500 italic whitespace-pre-wrap">{viewingRecord.note || '—'}</span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex gap-2">
              <button 
                onClick={() => {
                  setIsViewModalOpen(false);
                  handleOpenForm(viewingRecord);
                }}
                className="btn-premium btn-primary-premium flex-1 h-11 text-xs uppercase"
              >
                Edit Record
              </button>
              <button 
                onClick={() => setIsViewModalOpen(false)}
                className="btn-premium bg-slate-50 hover:bg-slate-100 text-slate-655 border border-slate-200 flex-1 h-11 text-xs uppercase"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {isDeleteModalOpen && (
        <div className="modal modal-open">
          <div className="modal-box rounded-2xl p-8 max-w-sm border border-slate-200 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="w-14 h-14 bg-red-50 text-red-500 rounded-full flex items-center justify-center text-2xl mx-auto mb-4">
              ⚠️
            </div>
            <h3 className="text-xl font-black text-center text-slate-800">Confirm Deletion</h3>
            <p className="text-center text-slate-505 mt-2 text-sm">
              Are you sure you want to delete maintenance record <b>{deletingRecord?.id}</b>?
              <br/>This action cannot be undone.
            </p>
            <div className="flex flex-col gap-2 mt-8">
              <button 
                onClick={handleDeleteRecord}
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

export default MaintenanceHistory;
