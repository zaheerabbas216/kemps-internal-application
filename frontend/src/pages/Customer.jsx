import React, { useState, useEffect } from 'react';
import api from '../api/axios';

const Customer = () => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modal states
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null); // null means "Create" mode
  const [deletingCustomer, setDeletingCustomer] = useState(null);
  
  // Form state
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    phone: '',
    gst: '',
    address: '',
    alternatePhone: '',
    customerType: 'General Customer'
  });
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Deposit Ledger states
  const [isLedgerModalOpen, setIsLedgerModalOpen] = useState(false);
  const [ledgerData, setLedgerData] = useState(null);
  const [loadingLedger, setLoadingLedger] = useState(false);

  const handleOpenCustomerDepositLedger = async (customer) => {
    try {
      setLoadingLedger(true);
      setIsLedgerModalOpen(true);
      const res = await api.get(`/can-deposit/customer/${customer.id}/ledger`);
      if (res.data.ok) {
        setLedgerData(res.data);
      } else {
        alert(res.data.error || 'Failed to load customer deposit ledger.');
        setIsLedgerModalOpen(false);
      }
    } catch (err) {
      console.error(err);
      alert('Failed to fetch customer deposit ledger.');
      setIsLedgerModalOpen(false);
    } finally {
      setLoadingLedger(false);
    }
  };

  const handleCloseLedgerModal = () => {
    setIsLedgerModalOpen(false);
    setLedgerData(null);
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const res = await api.get('/customers');
      setCustomers(res.data.customers || []);
    } catch (err) {
      console.error('Failed to fetch customers:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenForm = (customer = null) => {
    if (customer) {
      setEditingCustomer(customer);
      setFormData({
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        gst: customer.gst || '',
        address: customer.address || '',
        alternatePhone: customer.alternatePhone || '',
        customerType: customer.customerType || 'General Customer'
      });
    } else {
      setEditingCustomer(null);
      setFormData({ id: '', name: '', phone: '', gst: '', address: '', alternatePhone: '', customerType: 'General Customer' });
    }
    setFormError('');
    setIsFormModalOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormModalOpen(false);
    setFormData({ id: '', name: '', phone: '', gst: '', address: '', alternatePhone: '', customerType: 'General Customer' });
    setEditingCustomer(null);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name === 'phone') {
      const val = value.replace(/\D+/g, '').slice(0, 10);
      setFormData(prev => ({ ...prev, phone: val }));
    } else if (name === 'alternatePhone') {
      const val = value.replace(/\D+/g, '').slice(0, 15);
      setFormData(prev => ({ ...prev, alternatePhone: val }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) return setFormError('Name is required.');
    if (!/^\d{10}$/.test(formData.phone)) return setFormError('Phone must be 10 digits.');

    setIsSaving(true);
    setFormError('');

    try {
      if (editingCustomer) {
        // Update
        await api.put(`/customers/${editingCustomer.id}`, formData);
      } else {
        // Create
        await api.post('/customers', formData);
      }
      handleCloseForm();
      fetchCustomers();
    } catch (err) {
      setFormError(err.response?.data?.error || err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = (customer) => {
    setDeletingCustomer(customer);
    setIsDeleteModalOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingCustomer) return;
    try {
      await api.delete(`/customers/${deletingCustomer.id}`);
      setIsDeleteModalOpen(false);
      setDeletingCustomer(null);
      fetchCustomers();
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  const filteredCustomers = customers.filter(c => {
    const query = searchQuery.toLowerCase();
    const name = String(c.name || '').toLowerCase();
    const phone = String(c.phone || '');
    const id = String(c.id || '').toLowerCase();
    
    return name.includes(query) || phone.includes(query) || id.includes(query);
  });

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* HEADER & TOP ACTIONS */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">CUSTOMER REGISTRY</h1>
          <p className="text-slate-500 text-sm font-medium mt-1">Manage all your client information in one place.</p>
        </div>
        <button 
          onClick={() => handleOpenForm()}
          className="btn-premium btn-primary-premium h-12"
        >
          <span className="text-xl">+</span> Register New Customer
        </button>
      </div>

      {/* SEARCH AND TABLE CONTAINER */}
      <div className="card-premium">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="relative flex-1 max-w-md">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
            <input 
              type="text" 
              placeholder="Search by name, phone or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-premium pl-11 h-10 w-full"
            />
          </div>
          <div className="text-[12px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
            {filteredCustomers.length} Records Found
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="table table-zebra w-full overflow-hidden">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr className="text-slate-500 text-[11px] font-black uppercase tracking-wider">
                <th className="py-4 px-6 text-left">ID</th>
                <th className="py-4 px-6 text-left">Customer Name</th>
                <th className="py-4 px-6 text-left">Phone Number</th>
                <th className="py-4 px-6 text-left">Customer Type</th>
                <th className="py-4 px-6 text-left">GSTIN</th>
                <th className="py-4 px-6 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr>
                  <td colSpan="5" className="py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                       <span className="loading loading-spinner text-primary"></span>
                       <span className="text-slate-400 text-sm font-medium">Fetching customers...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan="5" className="py-20 text-center text-slate-400 font-medium italic">
                    {searchQuery ? 'No customers found matching your search.' : 'No customers registered yet.'}
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((c) => (
                  <tr key={c.id} className="hover:bg-blue-50/30 transition-colors group">
                    <td className="py-4 px-6 text-[13px] font-mono font-bold text-primary">{c.id}</td>
                    <td className="py-4 px-6 text-[14px] font-bold text-slate-700">
                      <button
                        onClick={() => handleOpenCustomerDepositLedger(c)}
                        className="font-bold text-slate-700 hover:text-primary hover:underline text-left outline-none"
                        title="Click to view Deposit Summary & Ledger"
                      >
                        {c.name}
                      </button>
                    </td>
                    <td className="py-4 px-6 text-[14px] font-medium text-slate-600">
                      <div>{c.phone}</div>
                      {c.alternatePhone && <div className="text-[10px] text-slate-400 mt-0.5">Alt: {c.alternatePhone}</div>}
                    </td>
                    <td className="py-4 px-6 text-[13px] text-slate-600">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold border ${
                        c.customerType === 'Distributor' 
                          ? 'bg-amber-50 border-amber-100 text-amber-600' 
                          : c.customerType === 'Function Customer' 
                          ? 'bg-indigo-50 border-indigo-100 text-indigo-600' 
                          : 'bg-slate-100 border-slate-200 text-slate-650'
                      }`}>
                        {c.customerType || 'General Customer'}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-[13px] text-slate-400">{c.gst || '—'}</td>
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
      </div>

      {/* FORM MODAL */}
      {isFormModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-start justify-center pt-0 bg-transparent pointer-events-none">
          <div className="bg-white rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.2)] border border-slate-200 w-[650px] max-h-[90vh] h-[550px] flex flex-col overflow-hidden animate-fade-in pointer-events-auto">
            {/* Header - Fixed at top */}
            <div className="bg-primary p-7 text-white shrink-0 relative">
              <h3 className="text-2xl font-black italic tracking-tight">
                {editingCustomer ? 'EDIT CUSTOMER' : 'REGISTER NEW CUSTOMER'}
              </h3>
              <p className="text-blue-100 text-xs mt-1 font-medium italic opacity-80">
                {editingCustomer ? `Editing record for ${editingCustomer.id}` : 'Create a fresh customer profile'}
              </p>
              <button 
                onClick={handleCloseForm}
                className="absolute right-7 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-all font-bold"
              >
                ✕
              </button>
            </div>

            {/* Scrollable Form Content */}
            <div className="flex-1 overflow-y-auto p-10 custom-scrollbar">
              <form id="customerForm" onSubmit={handleSave} className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-2 opacity-60">
                    <label className="label-premium block">Internal System ID</label>
                    <input readOnly value={formData.id || 'CUST-AUTO-GEN'} className="input-premium bg-slate-50 font-mono text-xs border-dashed border-slate-300" />
                  </div>
                  <div className="space-y-2">
                    <label className="label-premium block">Customer Full Name *</label>
                    <input name="name" value={formData.name} onChange={handleInputChange} placeholder="e.g. Rahul Sharma" className="input-premium" />
                  </div>
                  <div className="space-y-2">
                    <label className="label-premium block">Primary Mobile (10-digit) *</label>
                    <input name="phone" value={formData.phone} onChange={handleInputChange} placeholder="9876543210" className="input-premium" />
                  </div>
                  <div className="space-y-2">
                    <label className="label-premium block">Alternate Mobile (Optional)</label>
                    <input name="alternatePhone" value={formData.alternatePhone} onChange={handleInputChange} placeholder="Alternate number..." className="input-premium" />
                  </div>
                  <div className="space-y-2">
                    <label className="label-premium block">Customer Type *</label>
                    <select name="customerType" value={formData.customerType} onChange={handleInputChange} className="w-full bg-white border border-slate-200 rounded-xl px-3.5 h-11 outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 text-sm font-semibold transition-all">
                      <option value="General Customer">General Customer</option>
                      <option value="Distributor">Distributor</option>
                      <option value="Function Customer">Function Customer</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="label-premium block">GSTIN Number (Optional)</label>
                    <input name="gst" value={formData.gst} onChange={handleInputChange} placeholder="27XXXXX..." className="input-premium" />
                  </div>
                  <div className="md:col-span-2 space-y-2">
                    <label className="label-premium block">Physical Address</label>
                    <textarea name="address" value={formData.address} onChange={handleInputChange} placeholder="Building, Street, Area, City..." className="w-full bg-white border border-slate-200 rounded-xl p-4 outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 h-28 resize-none text-sm transition-all" />
                  </div>
                </div>

                {formError && (
                  <div className="status-msg status-err flex items-center gap-3 py-3 px-4 rounded-xl">
                    <span>⚠️</span> {formError}
                  </div>
                )}
              </form>
            </div>

            {/* Sticky Footer - Fixed at bottom */}
            <div className="p-8 border-t border-slate-100 bg-white flex gap-4 shrink-0 shadow-[0_-10px_30px_rgba(0,0,0,0.02)]">
              <button 
                type="submit" 
                form="customerForm"
                disabled={isSaving}
                className="btn-premium btn-primary-premium flex-[2] h-14 text-sm uppercase tracking-wider"
              >
                {isSaving ? <span className="loading loading-spinner"></span> : (editingCustomer ? 'Update System Record' : 'Save Customer Profile')}
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
          <div className="modal-box rounded-2xl p-8 max-w-sm border border-slate-200 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="w-14 h-14 bg-red-50 text-red-500 rounded-full flex items-center justify-center text-2xl mx-auto mb-4">
              ⚠️
            </div>
            <h3 className="text-xl font-black text-center text-slate-800">Confirm Deletion</h3>
            <p className="text-center text-slate-500 mt-2 text-sm">
              Are you sure you want to delete <b>{deletingCustomer?.name}</b>?
              <br/>This action cannot be undone.
            </p>
            <div className="flex flex-col gap-2 mt-8">
              <button 
                onClick={handleDelete}
                className="btn-premium bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-200"
              >
                Yes, Delete Customer
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

      {/* CUSTOMER DEPOSIT LEDGER MODAL */}
      {isLedgerModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm pointer-events-auto animate-fade-in">
          <div className="bg-white rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.2)] border border-slate-200 w-[750px] max-h-[85vh] flex flex-col overflow-hidden pointer-events-auto">
            {/* Header */}
            <div className="bg-primary p-6 text-white shrink-0 relative">
              <h3 className="text-xl font-black italic tracking-tight uppercase">
                Customer Deposit Profile & Ledger
              </h3>
              <p className="text-blue-100 text-xs mt-1 font-medium italic opacity-85">
                Audit refundable can deposit balances and timeline history
              </p>
              <button 
                onClick={handleCloseLedgerModal}
                className="absolute right-6 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-all font-bold"
              >
                ✕
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
              {loadingLedger ? (
                <div className="py-20 text-center">
                  <span className="loading loading-spinner text-primary block mx-auto mb-2"></span>
                  <span className="text-slate-400 text-xs font-semibold">Loading deposit ledger history...</span>
                </div>
              ) : ledgerData ? (
                <>
                  {/* Customer General & Summary Section */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-fade-in">
                    {/* General Profile Card */}
                    <div className="md:col-span-1 border border-slate-200 rounded-2xl p-4 bg-slate-50 text-xs space-y-1.5 font-semibold text-slate-650">
                      <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-1">Client Profile</div>
                      <div className="text-slate-800 font-extrabold text-sm mt-1">{ledgerData.customer.name}</div>
                      <div>ID: <span className="font-mono text-primary font-bold">{ledgerData.customer.id}</span></div>
                      <div>Type: {ledgerData.customer.customerType}</div>
                      <div>Phone: {ledgerData.customer.phone}</div>
                      {ledgerData.customer.gst && <div>GST: {ledgerData.customer.gst}</div>}
                      {ledgerData.customer.address && <div className="text-slate-400 font-normal leading-relaxed mt-1">📍 {ledgerData.customer.address}</div>}
                    </div>

                    {/* Can Deposit Summary Panel */}
                    <div className="md:col-span-2 grid grid-cols-3 gap-3">
                      {/* Total Received */}
                      <div className="border border-slate-200 rounded-2xl p-4 bg-white text-center flex flex-col justify-center shadow-sm">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Total Deposits</span>
                        <span className="text-base font-black text-slate-850 mt-1">₹ {ledgerData.summary.totalReceived.toFixed(2)}</span>
                      </div>
                      
                      {/* Total Returned */}
                      <div className="border border-slate-200 rounded-2xl p-4 bg-white text-center flex flex-col justify-center shadow-sm">
                        <span className="text-[9px] font-black text-slate-450 uppercase tracking-wider block">Total Returned</span>
                        <span className="text-base font-black text-rose-500 mt-1">₹ {ledgerData.summary.totalReturned.toFixed(2)}</span>
                      </div>

                      {/* Current Deposit Balance */}
                      <div className="border border-slate-200 rounded-2xl p-4 bg-indigo-50/50 border-indigo-100 text-center flex flex-col justify-center shadow-sm">
                        <span className="text-[9px] font-black text-indigo-500 uppercase tracking-wider block">Current Balance</span>
                        <span className="text-base font-black text-indigo-600 mt-1">₹ {ledgerData.summary.currentBalance.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Ledger Table */}
                  <div className="space-y-2">
                    <div className="text-[10px] font-black text-slate-450 uppercase tracking-widest border-b border-slate-100 pb-1.5 flex justify-between items-center">
                      <span>📜 TRANSACTION CHRONOLOGY</span>
                      <span className="text-slate-400 font-bold">{ledgerData.ledger.length} entries</span>
                    </div>

                    {ledgerData.ledger.length === 0 ? (
                      <div className="bg-slate-50 border border-slate-100 rounded-xl p-8 text-center text-slate-400 italic text-xs font-semibold">
                        No can deposit transactions registered for this client.
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-slate-100">
                        <table className="table table-compact table-zebra w-full text-[11px] font-semibold text-slate-700">
                          <thead className="bg-slate-50 border-b border-slate-100">
                            <tr className="text-slate-500 font-black uppercase tracking-wider text-[8px]">
                              <th className="py-2.5 px-4 text-left">Date</th>
                              <th className="py-2.5 px-4 text-left">Particulars</th>
                              <th className="py-2.5 px-4 text-right">Credit (Received)</th>
                              <th className="py-2.5 px-4 text-right">Debit (Returned)</th>
                              <th className="py-2.5 px-4 text-right">Running Balance</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ledgerData.ledger.map((row) => {
                              const isReceived = row.transaction_type === 'Deposit Received';
                              return (
                                <tr key={row.id} className="hover:bg-slate-50/50">
                                  <td className="py-2.5 px-4 font-mono font-bold text-slate-500">
                                    {row.created_at.split(' ')[0]}
                                  </td>
                                  <td className="py-2.5 px-4 font-bold text-slate-800">
                                    {row.transaction_type}
                                    {row.remarks && <span className="text-[10px] text-slate-400 font-normal block italic mt-0.5">{row.remarks}</span>}
                                  </td>
                                  <td className="py-2.5 px-4 text-right font-black text-emerald-600">
                                    {isReceived ? `₹ ${parseFloat(row.amount).toFixed(2)}` : '—'}
                                  </td>
                                  <td className="py-2.5 px-4 text-right font-black text-rose-500">
                                    {!isReceived ? `₹ ${parseFloat(row.amount).toFixed(2)}` : '—'}
                                  </td>
                                  <td className="py-2.5 px-4 text-right font-black text-slate-800 bg-blue-50/10">
                                    ₹ {parseFloat(row.balance_after_transaction).toFixed(2)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="py-20 text-center text-slate-400 italic text-xs font-semibold">
                  Failed to load data.
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-5 border-t border-slate-100 bg-white flex justify-end shrink-0 shadow-[0_-10px_30px_rgba(0,0,0,0.02)]">
              <button 
                type="button" 
                onClick={handleCloseLedgerModal}
                className="btn-premium bg-slate-900 hover:bg-slate-800 text-white px-5 h-11 text-xs uppercase animate-fade-in"
              >
                Close Profile
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};

export default Customer;
