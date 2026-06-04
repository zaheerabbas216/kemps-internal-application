import React, { useState, useEffect } from 'react';
import api from '../api/axios';

const CompanyDetails = () => {
  const [companies, setCompanies] = useState([]);
  const [totalCompanies, setTotalCompanies] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const limit = 10;

  // Modal states
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState(null); // null means Create mode
  const [deletingCompany, setDeletingCompany] = useState(null);

  // Form states
  const [formData, setFormData] = useState({
    companyName: '',
    phoneNumber: '',
    gstNumber: '',
    bankName: '',
    accountNumber: '',
    ifscCode: ''
  });
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Fetch companies on mount or search/page change
  useEffect(() => {
    fetchCompanies();
  }, [currentPage, searchQuery]);

  const fetchCompanies = async () => {
    try {
      setLoading(true);
      const res = await api.get('/company-details', {
        params: {
          page: currentPage,
          limit,
          search: searchQuery
        }
      });
      if (res.data.ok) {
        setCompanies(res.data.companies || []);
        setTotalCompanies(res.data.total || 0);
      }
    } catch (err) {
      console.error('Failed to fetch companies:', err);
    } finally {
      setLoading(false);
    }
  };

  // Reset page number on search input change
  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1);
  };

  const handleOpenForm = (company = null) => {
    setFormError('');
    setFormSuccess('');
    if (company) {
      setEditingCompany(company);
      setFormData({
        companyName: company.company_name || '',
        phoneNumber: company.phone_number || '',
        gstNumber: company.gst_number || '',
        bankName: company.bank_name || '',
        accountNumber: company.account_number || '',
        ifscCode: company.ifsc_code || ''
      });
    } else {
      setEditingCompany(null);
      setFormData({
        companyName: '',
        phoneNumber: '',
        gstNumber: '',
        bankName: '',
        accountNumber: '',
        ifscCode: ''
      });
    }
    setIsFormModalOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormModalOpen(false);
    setEditingCompany(null);
    setFormData({
      companyName: '',
      phoneNumber: '',
      gstNumber: '',
      bankName: '',
      accountNumber: '',
      ifscCode: ''
    });
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name === 'phoneNumber') {
      const digitsOnly = value.replace(/\D/g, '').slice(0, 10);
      setFormData(prev => ({ ...prev, phoneNumber: digitsOnly }));
    } else if (name === 'gstNumber' || name === 'ifscCode') {
      setFormData(prev => ({ ...prev, [name]: value.toUpperCase() }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    if (!formData.companyName.trim()) {
      setFormError('Company Name is required.');
      return;
    }
    if (formData.phoneNumber && formData.phoneNumber.length < 10) {
      setFormError('Phone number must be exactly 10 digits.');
      return;
    }
    if (formData.gstNumber && formData.gstNumber.length !== 15) {
      setFormError('GST Number must be exactly 15 characters.');
      return;
    }

    setIsSaving(true);

    try {
      let response;
      if (editingCompany) {
        // Edit Mode
        response = await api.put(`/company-details/${editingCompany.id}`, formData);
      } else {
        // Create Mode
        response = await api.post('/company-details', formData);
      }

      if (response.data.ok) {
        setFormSuccess(editingCompany ? 'Company details updated successfully!' : 'Company details saved successfully!');
        setTimeout(() => {
          handleCloseForm();
          fetchCompanies();
        }, 1000);
      } else {
        setFormError(response.data.error || 'Failed to save company details.');
      }
    } catch (err) {
      setFormError(err.response?.data?.error || err.message || 'An error occurred while saving.');
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = (company) => {
    setDeletingCompany(company);
    setIsDeleteModalOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingCompany) return;
    try {
      const response = await api.delete(`/company-details/${deletingCompany.id}`);
      if (response.data.ok) {
        setIsDeleteModalOpen(false);
        setDeletingCompany(null);
        fetchCompanies();
      } else {
        alert(response.data.error || 'Failed to delete company.');
      }
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  const totalPages = Math.ceil(totalCompanies / limit) || 1;

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* HEADER & TOP ACTIONS */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">COMPANY REGISTRY</h1>
          <p className="text-slate-500 text-sm font-medium mt-1">Manage and register billing profiles or suppliers.</p>
        </div>
        <button 
          onClick={() => handleOpenForm()}
          className="btn-premium btn-primary-premium h-12"
        >
          <span className="text-xl">+</span> Add New Company
        </button>
      </div>

      {/* SEARCH AND TABLE CONTAINER */}
      <div className="card-premium">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="relative flex-1 max-w-md">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
            <input 
              type="text" 
              placeholder="Search by company name, phone, GST, or ID..."
              value={searchQuery}
              onChange={handleSearchChange}
              className="input-premium pl-11 h-10 w-full"
            />
          </div>
          <div className="text-[12px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
            {totalCompanies} Records Found
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="table table-zebra w-full overflow-hidden">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr className="text-slate-500 text-[11px] font-black uppercase tracking-wider">
                <th className="py-4 px-6 text-left">ID</th>
                <th className="py-4 px-6 text-left">Company Name</th>
                <th className="py-4 px-6 text-left">Phone Number</th>
                <th className="py-4 px-6 text-left">GSTIN</th>
                <th className="py-4 px-6 text-left">Bank Name</th>
                <th className="py-4 px-6 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr>
                  <td colSpan="6" className="py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                       <span className="loading loading-spinner text-primary"></span>
                       <span className="text-slate-400 text-sm font-medium">Fetching companies...</span>
                    </div>
                  </td>
                </tr>
              ) : companies.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-20 text-center text-slate-400 font-medium italic">
                    {searchQuery ? 'No companies found matching your search.' : 'No companies registered yet.'}
                  </td>
                </tr>
              ) : (
                companies.map((c) => (
                  <tr key={c.id} className="hover:bg-blue-50/30 transition-colors group">
                    <td className="py-4 px-6 text-[13px] font-mono font-bold text-primary">{c.id}</td>
                    <td className="py-4 px-6 text-[14px] font-bold text-slate-700">{c.company_name}</td>
                    <td className="py-4 px-6 text-[14px] font-medium text-slate-600">{c.phone_number || '—'}</td>
                    <td className="py-4 px-6 text-[13px] text-slate-400">{c.gst_number || '—'}</td>
                    <td className="py-4 px-6 text-[14px] text-slate-650 font-medium text-slate-500">{c.bank_name || '—'}</td>
                    <td className="py-4 px-6">
                      <div className="flex items-center justify-center gap-2">
                        <button 
                          onClick={() => handleOpenForm(c)}
                          className="btn btn-ghost btn-xs text-primary hover:bg-primary/10 rounded-lg px-2"
                        >
                          Edit
                        </button>
                        <button 
                          onClick={() => confirmDelete(c)}
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
        {!loading && totalCompanies > 0 && (
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

      {/* FORM MODAL */}
      {isFormModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center pt-0 bg-slate-900/40 backdrop-blur-sm pointer-events-auto">
          <div className="bg-white rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.2)] border border-slate-200 w-[650px] h-[650px] flex flex-col overflow-hidden animate-fade-in pointer-events-auto">
            
            {/* Header - Fixed at top */}
            <div className="bg-[#0b1324] p-7 text-white shrink-0 relative">
              <h3 className="text-2xl font-black italic tracking-tight uppercase">
                {editingCompany ? 'Edit Company Details' : 'Add New Company'}
              </h3>
              <p className="text-slate-400 text-xs mt-1 font-medium italic">
                {editingCompany ? `Editing profile for ${editingCompany.id}` : 'Create a fresh company profile'}
              </p>
              <button 
                onClick={handleCloseForm}
                className="absolute right-7 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-all font-bold"
              >
                ✕
              </button>
            </div>

            {/* Scrollable Form Content */}
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-6">
              <form id="companyForm" onSubmit={handleSave} className="space-y-6">
                
                {/* Company Information Area */}
                <div className="border border-slate-200/80 rounded-2xl bg-white overflow-hidden">
                  <div className="bg-slate-50/40 px-5 py-3 border-b border-slate-200/80 flex items-center justify-between">
                    <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                      <span>🏢</span> COMPANY INFORMATION
                    </span>
                    {editingCompany && (
                      <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2.5 py-0.5 rounded-full">
                        ID: {editingCompany.id}
                      </span>
                    )}
                  </div>
                  
                  <div className="p-6 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      
                      {/* Company Name */}
                      <div className="space-y-1.5">
                        <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                          Company Name <span className="text-red-500">*</span>
                        </label>
                        <input 
                          type="text" 
                          name="companyName"
                          value={formData.companyName}
                          onChange={handleInputChange}
                          placeholder="Enter company name" 
                          className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 placeholder-slate-400/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all duration-200 outline-none text-sm font-medium"
                          required
                        />
                      </div>

                      {/* Phone Number */}
                      <div className="space-y-1.5">
                        <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                          Phone Number
                        </label>
                        <input 
                          type="text" 
                          name="phoneNumber"
                          value={formData.phoneNumber}
                          onChange={handleInputChange}
                          placeholder="Enter phone number" 
                          className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 placeholder-slate-400/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all duration-200 outline-none text-sm font-medium"
                        />
                      </div>
                    </div>

                    {/* GST Number */}
                    <div className="space-y-1.5">
                      <label className="text-[12px] font-bold text-slate-500 block uppercase tracking-wider">
                        GST Number
                      </label>
                      <input 
                        type="text" 
                        name="gstNumber"
                        value={formData.gstNumber}
                        onChange={handleInputChange}
                        placeholder="Enter GST number" 
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 placeholder-slate-400/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all duration-200 outline-none text-sm font-medium"
                      />
                    </div>
                  </div>
                </div>

                {/* Bank Details Area (Dark Navy Background) */}
                <div className="bg-[#0b1324] rounded-2xl p-6 text-slate-100 space-y-4 shadow-xl border border-[#1e293b]/30">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-800/80">
                    <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                      <span>🏦</span> BANK DETAILS
                    </span>
                  </div>

                  <div className="space-y-4 pt-1">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      
                      {/* Bank Name */}
                      <div className="space-y-1.5">
                        <label className="text-[12px] font-bold text-slate-450 block uppercase tracking-wider text-slate-400">
                          Bank Name
                        </label>
                        <input 
                          type="text" 
                          name="bankName"
                          value={formData.bankName}
                          onChange={handleInputChange}
                          placeholder="Enter bank name" 
                          className="w-full h-11 px-4 rounded-xl border border-slate-800/80 bg-[#162032]/60 text-slate-100 placeholder-slate-650 focus:bg-[#162032]/90 focus:border-primary/80 focus:ring-4 focus:ring-primary/10 transition-all duration-200 outline-none text-sm font-medium"
                        />
                      </div>

                      {/* Account Number */}
                      <div className="space-y-1.5">
                        <label className="text-[12px] font-bold text-slate-450 block uppercase tracking-wider text-slate-400">
                          Account Number
                        </label>
                        <input 
                          type="text" 
                          name="accountNumber"
                          value={formData.accountNumber}
                          onChange={handleInputChange}
                          placeholder="Enter account number" 
                          className="w-full h-11 px-4 rounded-xl border border-slate-800/80 bg-[#162032]/60 text-slate-100 placeholder-slate-650 focus:bg-[#162032]/90 focus:border-primary/80 focus:ring-4 focus:ring-primary/10 transition-all duration-200 outline-none text-sm font-medium"
                        />
                      </div>
                    </div>

                    {/* IFSC Code */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div className="space-y-1.5">
                        <label className="text-[12px] font-bold text-slate-450 block uppercase tracking-wider text-slate-400">
                          IFSC Code
                        </label>
                        <input 
                          type="text" 
                          name="ifscCode"
                          value={formData.ifscCode}
                          onChange={handleInputChange}
                          placeholder="Enter IFSC code" 
                          className="w-full h-11 px-4 rounded-xl border border-slate-800/80 bg-[#162032]/60 text-slate-100 placeholder-slate-650 focus:bg-[#162032]/90 focus:border-primary/80 focus:ring-4 focus:ring-primary/10 transition-all duration-200 outline-none text-sm font-medium"
                        />
                      </div>
                      
                      <div className="hidden md:block"></div>
                    </div>
                  </div>
                </div>

                {/* Feedback Messages inside Scroll */}
                {formError && (
                  <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-xs font-semibold flex items-center gap-2 border border-red-100">
                    <span>⚠️</span>
                    <span>{formError}</span>
                  </div>
                )}
                {formSuccess && (
                  <div className="bg-emerald-50 text-emerald-600 px-4 py-3 rounded-xl text-xs font-semibold flex items-center gap-2 border border-emerald-100 animate-fade-in">
                    <span>✅</span>
                    <span>{formSuccess}</span>
                  </div>
                )}
              </form>
            </div>

            {/* Sticky Footer - Fixed at bottom */}
            <div className="p-8 border-t border-slate-100 bg-white flex gap-4 shrink-0 shadow-[0_-10px_30px_rgba(0,0,0,0.02)]">
              <button 
                type="submit" 
                form="companyForm"
                disabled={isSaving}
                className="btn-premium btn-primary-premium flex-[2] h-14 text-sm uppercase tracking-wider"
              >
                {isSaving ? <span className="loading loading-spinner"></span> : (editingCompany ? 'Update Company Details' : 'Save Company Details')}
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

      {/* DELETE CONFIRMATION MODAL */}
      {isDeleteModalOpen && (
        <div className="modal modal-open">
          <div className="modal-box rounded-2xl p-8 max-w-sm border border-slate-200 shadow-2xl">
            <div className="w-14 h-14 bg-red-50 text-red-500 rounded-full flex items-center justify-center text-2xl mx-auto mb-4">
              ⚠️
            </div>
            <h3 className="text-xl font-black text-center text-slate-800">Confirm Deletion</h3>
            <p className="text-center text-slate-500 mt-2 text-sm">
              Are you sure you want to delete <b>{deletingCompany?.company_name}</b>?
              <br/>This action cannot be undone.
            </p>
            <div className="flex flex-col gap-2 mt-8">
              <button 
                onClick={handleDelete}
                className="btn-premium bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-200"
              >
                Yes, Delete Company
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

export default CompanyDetails;
