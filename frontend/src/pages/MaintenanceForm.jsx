import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';

const MaintenanceForm = () => {
  const navigate = useNavigate();

  // Data states
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState({ totalCount: 0 });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [todayDateStr, setTodayDateStr] = useState('');

  // Modal states
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);

  // Editing / Deleting / Viewing state
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

  // Particulars list
  const particularOptions = [
    'Filters',
    'Formadail',
    'Chlorine',
    'PH',
    'TDS',
    'Tank Cleaning'
  ];

  useEffect(() => {
    fetchTodayRecords();
  }, [searchQuery]);

  const fetchTodayRecords = async () => {
    try {
      setLoading(true);
      const res = await api.get('/maintenance/today', {
        params: { search: searchQuery }
      });
      if (res.data.ok) {
        setRecords(res.data.records || []);
        setSummary(res.data.summary || { totalCount: 0 });
        if (res.data.todayStr) {
          setTodayDateStr(res.data.todayStr);
        }
      }
    } catch (err) {
      console.error('Failed to fetch today\'s maintenance records:', err);
    } finally {
      setLoading(false);
    }
  };

  const getFormattedToday = () => {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const istDate = new Date(now.getTime() + (330 + offset) * 60000);
    const yyyy = istDate.getFullYear();
    const mm = String(istDate.getMonth() + 1).padStart(2, '0');
    const dd = String(istDate.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const handleOpenForm = (record = null) => {
    setFormError('');
    setFormSuccess('');

    const currentAdminUser = localStorage.getItem('kemps_username') || 'admin';
    const formattedAdminName = currentAdminUser.charAt(0).toUpperCase() + currentAdminUser.slice(1);

    if (record) {
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
    } else {
      setEditingRecord(null);
      setFormData({
        particular: '',
        subDetail: '',
        company: '',
        serviceDate: getFormattedToday(),
        nextDueDate: '',
        note: '',
        enteredBy: formattedAdminName
      });
    }
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
    const currentAdminUser = localStorage.getItem('kemps_username') || 'admin';
    const formattedAdminName = currentAdminUser.charAt(0).toUpperCase() + currentAdminUser.slice(1);

    if (editingRecord) {
      setFormData({
        particular: editingRecord.particular,
        subDetail: editingRecord.sub_detail || '',
        company: editingRecord.company || '',
        serviceDate: editingRecord.service_date,
        nextDueDate: editingRecord.next_due_date || '',
        note: editingRecord.note || '',
        enteredBy: editingRecord.entered_by
      });
    } else {
      setFormData({
        particular: '',
        subDetail: '',
        company: '',
        serviceDate: getFormattedToday(),
        nextDueDate: '',
        note: '',
        enteredBy: formattedAdminName
      });
    }
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
    if (!enteredBy.trim()) return setFormError('Name (Entered By) is required.');

    setIsSaving(true);
    try {
      let res;
      const payload = {
        particular,
        subDetail: subDetail.trim(),
        company: company.trim(),
        serviceDate,
        nextDueDate: nextDueDate || null,
        note: note.trim(),
        enteredBy: enteredBy.trim()
      };

      if (editingRecord) {
        res = await api.put(`/maintenance/${editingRecord.id}`, payload);
      } else {
        res = await api.post('/maintenance', payload);
      }

      if (res.data.ok) {
        setFormSuccess(editingRecord ? 'Maintenance record updated successfully!' : 'Maintenance activity logged successfully!');
        setTimeout(() => {
          handleCloseForm();
          fetchTodayRecords();
        }, 1000);
      } else {
        setFormError(res.data.error || 'Failed to save record.');
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
        fetchTodayRecords();
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

  return (
    <div className="space-y-6 animate-fade-in">

      {/* HEADER & TOP ACTIONS */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">MAINTENANCE</h1>
          <p className="text-slate-500 text-sm font-medium mt-1">Log and track machine services & maintenance activities</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => handleOpenForm()}
            className="btn-premium btn-primary-premium h-12"
          >
            <span className="text-xl">+</span> Record Service
          </button>
          <button 
            onClick={() => navigate('/maintenance-history')}
            className="btn-premium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs px-4 h-12"
          >
            Service History
          </button>
        </div>
      </div>

      {/* SUMMARY CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Today's Service Count Card */}
        <div className="card-premium flex items-center justify-between">
          <div>
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Today's Services Logged</p>
            <h3 className="text-2xl font-extrabold text-[#0f172a] mt-1.5">
              {summary.totalCount} {summary.totalCount === 1 ? 'Activity' : 'Activities'}
            </h3>
          </div>
          <div className="w-12 h-12 bg-blue-50 text-primary rounded-xl flex items-center justify-center text-xl border border-blue-100">
            🔧
          </div>
        </div>

        {/* Date Display Card */}
        <div className="card-premium flex items-center justify-between">
          <div>
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Current System Date</p>
            <h3 className="text-2xl font-extrabold text-[#0f172a] mt-1.5">
              {todayDateStr ? formatDateDDMMYYYY(todayDateStr) : formatDateDDMMYYYY(new Date().toISOString().split('T')[0])}
            </h3>
          </div>
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center text-xl border border-emerald-100">
            📅
          </div>
        </div>
      </div>

      {/* SEARCH AND TODAY'S DATA TABLE CARD */}
      <div className="card-premium">
        
        {/* Search header container */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="relative flex-1 max-w-md">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
            <input 
              type="text" 
              placeholder="Search today's activities..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-premium pl-11 h-10 w-full"
            />
          </div>
          <div className="text-[12px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-3.5 py-1.5 rounded-lg border border-slate-100">
            Today's Log Book — {todayDateStr ? formatDateDDMMYYYY(todayDateStr) : formatDateDDMMYYYY(new Date().toISOString().split('T')[0])}
          </div>
        </div>

        {/* Table Listing */}
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
                       <span className="text-slate-400 text-sm font-medium">Loading today's log book...</span>
                    </div>
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan="8" className="py-20 text-center text-slate-400 font-medium italic">
                    {searchQuery ? 'No matching logs found for today.' : 'No maintenance recorded today.'}
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
                    <td className="py-4 px-6 text-[13px] text-slate-400 max-w-[150px] truncate" title={rec.note || ''}>
                      {rec.note || '—'}
                    </td>
                    <td className="py-4 px-6 text-[14px] font-semibold text-slate-600">{rec.entered_by}</td>
                    <td className="py-4 px-6">
                      <div className="flex items-center justify-center gap-2">
                        <button 
                          onClick={() => handleOpenView(rec)}
                          className="btn btn-ghost btn-xs text-slate-500 hover:bg-slate-100 rounded-lg px-2"
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
      </div>

      {/* RECORD SERVICE MODAL — matches Expense layout */}
      {isFormModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm pointer-events-auto">
          <div className="bg-white rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.2)] border border-slate-200 w-[600px] h-[660px] flex flex-col overflow-hidden animate-fade-in pointer-events-auto">
            
            {/* Header — blue like Expense */}
            <div className="bg-primary p-7 text-white shrink-0 relative">
              <h3 className="text-2xl font-black italic tracking-tight uppercase">
                {editingRecord ? 'Edit Maintenance Record' : 'Record Service Activity'}
              </h3>
              <p className="text-blue-100 text-xs mt-1 font-medium italic opacity-85">
                {editingRecord ? `Modifying record: ${editingRecord.id}` : 'Fill in the details to log a new maintenance activity'}
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
              <form id="maintenanceForm" onSubmit={handleSaveRecord} className="space-y-6">

                {/* Single unified box — like Expense layout */}
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
                        onChange={handleInputChange}
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                        required
                      >
                        <option value="">Select Particular</option>
                        {particularOptions.map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </div>

                    {/* Sub Detail */}
                    <div className="space-y-1.5">
                      <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                        Sub
                      </label>
                      <input 
                        type="text" 
                        name="subDetail"
                        value={formData.subDetail}
                        onChange={handleInputChange}
                        placeholder="Enter sub detail" 
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm font-medium"
                      />
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

                {/* Feedback Messages */}
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

            {/* Modal Sticky Footer — same as Expense */}
            <div className="p-8 border-t border-slate-100 bg-white flex gap-4 shrink-0 shadow-[0_-10px_30px_rgba(0,0,0,0.02)]">
              <button 
                type="submit" 
                form="maintenanceForm"
                disabled={isSaving}
                className="btn-premium btn-primary-premium flex-[2] h-14 text-sm uppercase tracking-wider"
              >
                {isSaving ? <span className="loading loading-spinner"></span> : (editingRecord ? 'Update Record' : 'Save Record')}
              </button>
              <button 
                type="button" 
                onClick={handleResetForm}
                className="btn-premium bg-slate-50 text-slate-500 hover:bg-slate-100 border border-slate-200 flex-1 h-14 text-sm font-bold uppercase tracking-wider"
              >
                Reset
              </button>
              <button 
                type="button" 
                onClick={handleCloseForm}
                className="btn-premium bg-white text-slate-500 hover:bg-slate-50 border border-slate-200 flex-1 h-14 text-sm font-bold uppercase tracking-wider"
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
          <div className="bg-white rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.2)] border border-slate-200 w-[500px] p-8 flex flex-col gap-6 animate-fade-in pointer-events-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-150">
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-1.5">
                <span>📋</span> Service Details
              </h3>
              <button 
                onClick={() => setIsViewModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-505 hover:bg-slate-100 transition-all font-bold"
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
                className="btn-premium bg-slate-50 hover:bg-slate-100 text-slate-650 border border-slate-200 flex-1 h-11 text-xs uppercase"
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
          <div className="modal-box rounded-2xl p-8 max-w-sm border border-slate-200 shadow-2xl">
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

export default MaintenanceForm;
