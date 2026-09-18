import React, { useState, useEffect, useMemo } from 'react';
import api from '../api/axios';

const CATEGORIES = [
  'General',
  'Production Line',
  'Machine Maintenance',
  'Electrical & Utility',
  'Raw Material / Inventory',
  'Delivery & Dispatch',
  'Quality Control',
  'Office / Admin',
  'Urgent Repair',
  'Other'
];

const PRIORITIES = [
  { value: 'URGENT', label: 'Urgent', color: 'bg-red-50 text-red-700 border-red-200 ring-red-500/20', icon: '🚨', badge: 'bg-red-600 text-white' },
  { value: 'HIGH', label: 'High', color: 'bg-orange-50 text-orange-700 border-orange-200 ring-orange-500/20', icon: '⚡', badge: 'bg-orange-500 text-white' },
  { value: 'MEDIUM', label: 'Medium', color: 'bg-blue-50 text-blue-700 border-blue-200 ring-blue-500/20', icon: '📌', badge: 'bg-blue-500 text-white' },
  { value: 'LOW', label: 'Low', color: 'bg-slate-50 text-slate-700 border-slate-200 ring-slate-500/20', icon: '📝', badge: 'bg-slate-500 text-white' }
];

const ImpWork = () => {
  // Tabs: 'active' | 'history'
  const [activeTab, setActiveTab] = useState('active');

  // Stats & Data state
  const [stats, setStats] = useState({
    active_count: 0,
    urgent_count: 0,
    high_count: 0,
    in_progress_count: 0,
    due_today_count: 0,
    overdue_count: 0,
    completed_count: 0
  });
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPriority, setFilterPriority] = useState('ALL');
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [viewMode, setViewMode] = useState('cards'); // 'cards' | 'table'

  // Modals state
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create'); // 'create' | 'edit'
  const [isCompleteModalOpen, setIsCompleteModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State
  const loggedInUser = localStorage.getItem('kemps_name') || localStorage.getItem('kemps_username') || 'Admin';

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    assigned_to: '',
    assigned_by: loggedInUser,
    priority: 'URGENT',
    category: 'General',
    due_date: ''
  });

  // Complete Form State
  const [completeFormData, setCompleteFormData] = useState({
    completed_by: loggedInUser,
    completed_notes: ''
  });

  const getTodayISTStr = () => {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const istDate = new Date(now.getTime() + (330 + offset) * 60000);
    const yyyy = istDate.getFullYear();
    const mm = String(istDate.getMonth() + 1).padStart(2, '0');
    const dd = String(istDate.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const todayStr = getTodayISTStr();

  // Fetch stats and tasks
  const fetchData = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      // Fetch stats
      const statsRes = await api.get('/imp-work/stats');
      if (statsRes.data?.ok) {
        setStats(statsRes.data.stats);
      }

      // Fetch tasks based on activeTab
      const params = {
        tab: activeTab
      };
      if (filterPriority !== 'ALL') params.priority = filterPriority;
      if (filterCategory !== 'ALL') params.category = filterCategory;
      if (filterStatus !== 'ALL') params.status = filterStatus;
      if (searchQuery.trim()) params.search = searchQuery.trim();
      if (filterStartDate) params.startDate = filterStartDate;
      if (filterEndDate) params.endDate = filterEndDate;

      const tasksRes = await api.get('/imp-work/tasks', { params });
      if (tasksRes.data?.ok) {
        setTasks(tasksRes.data.tasks || []);
      }
    } catch (err) {
      console.error('Error loading IMP Work data:', err);
      setErrorMsg(err.response?.data?.error || 'Failed to load IMP Work tasks');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeTab, filterPriority, filterCategory, filterStatus, filterStartDate, filterEndDate]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchData();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const showNotification = (msg, isSuccess = true) => {
    if (isSuccess) {
      setSuccessMsg(msg);
      setTimeout(() => setSuccessMsg(''), 4000);
    } else {
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(''), 5000);
    }
  };

  // Open Create Modal
  const handleOpenCreateModal = () => {
    setModalMode('create');
    setFormData({
      title: '',
      description: '',
      assigned_to: '',
      assigned_by: loggedInUser,
      priority: 'URGENT',
      category: 'General',
      due_date: getTodayISTStr()
    });
    setSelectedTask(null);
    setIsTaskModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (task) => {
    setModalMode('edit');
    setSelectedTask(task);
    setFormData({
      title: task.title,
      description: task.description || '',
      assigned_to: task.assigned_to,
      assigned_by: task.assigned_by,
      priority: task.priority || 'HIGH',
      category: task.category || 'General',
      due_date: task.due_date || ''
    });
    setIsTaskModalOpen(true);
  };

  // Open Complete Modal
  const handleOpenCompleteModal = (task) => {
    setSelectedTask(task);
    setCompleteFormData({
      completed_by: loggedInUser,
      completed_notes: ''
    });
    setIsCompleteModalOpen(true);
  };

  // Submit Task (Create or Update)
  const handleSaveTask = async (e) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      showNotification('Please enter a task title', false);
      return;
    }
    if (!formData.assigned_to.trim()) {
      showNotification('Please enter assigned to person/team', false);
      return;
    }

    setIsSubmitting(true);
    try {
      if (modalMode === 'create') {
        const res = await api.post('/imp-work/tasks', formData);
        if (res.data?.ok) {
          showNotification('Task assigned successfully!');
          setIsTaskModalOpen(false);
          fetchData();
        }
      } else {
        const res = await api.put(`/imp-work/tasks/${selectedTask.id}`, formData);
        if (res.data?.ok) {
          showNotification('Task updated successfully!');
          setIsTaskModalOpen(false);
          fetchData();
        }
      }
    } catch (err) {
      console.error('Error saving task:', err);
      showNotification(err.response?.data?.error || 'Failed to save task', false);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Change Status (e.g. Start Work)
  const handleUpdateStatus = async (task, newStatus) => {
    try {
      const res = await api.patch(`/imp-work/tasks/${task.id}/status`, {
        status: newStatus
      });
      if (res.data?.ok) {
        showNotification(`Task marked as ${newStatus}`);
        fetchData();
      }
    } catch (err) {
      console.error('Error updating status:', err);
      showNotification(err.response?.data?.error || 'Failed to update status', false);
    }
  };

  // Submit Complete Task
  const handleCompleteTask = async (e) => {
    e.preventDefault();
    if (!selectedTask) return;

    setIsSubmitting(true);
    try {
      const res = await api.patch(`/imp-work/tasks/${selectedTask.id}/status`, {
        status: 'COMPLETED',
        completed_by: completeFormData.completed_by,
        completed_notes: completeFormData.completed_notes || 'Task completed successfully'
      });

      if (res.data?.ok) {
        showNotification('Task marked completed and moved to History! 🎉');
        setIsCompleteModalOpen(false);
        fetchData();
      }
    } catch (err) {
      console.error('Error completing task:', err);
      showNotification(err.response?.data?.error || 'Failed to complete task', false);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reopen Task from History
  const handleReopenTask = async (task) => {
    try {
      const res = await api.patch(`/imp-work/tasks/${task.id}/status`, {
        status: 'PENDING'
      });
      if (res.data?.ok) {
        showNotification('Task reopened and moved back to Active Tasks');
        fetchData();
      }
    } catch (err) {
      console.error('Error reopening task:', err);
      showNotification(err.response?.data?.error || 'Failed to reopen task', false);
    }
  };

  // Delete Task
  const handleDeleteTask = async () => {
    if (!selectedTask) return;
    setIsSubmitting(true);
    try {
      const res = await api.delete(`/imp-work/tasks/${selectedTask.id}`);
      if (res.data?.ok) {
        showNotification('Task deleted successfully');
        setIsDeleteModalOpen(false);
        fetchData();
      }
    } catch (err) {
      console.error('Error deleting task:', err);
      showNotification(err.response?.data?.error || 'Failed to delete task', false);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (tasks.length === 0) {
      showNotification('No records to export', false);
      return;
    }

    const headers = [
      'Task ID',
      'Title',
      'Priority',
      'Category',
      'Assigned To',
      'Assigned By',
      'Due Date',
      'Status',
      'Created At',
      'Completed At',
      'Completed By',
      'Completion Notes'
    ];

    const rows = tasks.map(t => [
      t.id,
      `"${(t.title || '').replace(/"/g, '""')}"`,
      t.priority,
      t.category,
      `"${(t.assigned_to || '').replace(/"/g, '""')}"`,
      `"${(t.assigned_by || '').replace(/"/g, '""')}"`,
      t.due_date || '',
      t.status,
      t.created_at || '',
      t.completed_at || '',
      `"${(t.completed_by || '').replace(/"/g, '""')}"`,
      `"${(t.completed_notes || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `IMP_Work_${activeTab}_${getTodayISTStr()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getPriorityInfo = (priority) => {
    return PRIORITIES.find(p => p.value === priority) || PRIORITIES[1];
  };

  return (
    <div className="min-h-screen bg-[#f8fbff] p-4 md:p-6 lg:p-8 space-y-6">
      {/* Toast Notifications */}
      {successMsg && (
        <div className="fixed top-6 right-6 z-50 flex items-center gap-3 bg-emerald-600 text-white px-5 py-3 rounded-2xl shadow-xl shadow-emerald-500/20 animate-bounce">
          <span className="text-xl">✓</span>
          <span className="text-sm font-semibold">{successMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="fixed top-6 right-6 z-50 flex items-center gap-3 bg-red-600 text-white px-5 py-3 rounded-2xl shadow-xl shadow-red-500/20">
          <span className="text-xl">⚠️</span>
          <span className="text-sm font-semibold">{errorMsg}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-gradient-to-r from-red-600 via-rose-600 to-red-700 rounded-3xl p-6 md:p-8 text-white shadow-xl shadow-red-500/15 relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-white/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-xs font-black uppercase tracking-wider text-red-100">
              <span className="w-2 h-2 rounded-full bg-red-200 animate-ping"></span>
              🚨 Critical & Urgent Tasks
            </div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight font-heading flex items-center gap-3">
              IMP WORK MANAGER
            </h1>
            <p className="text-red-100/90 text-sm max-w-2xl font-medium">
              Assign high-priority tasks, track team accountability in real-time, and preserve complete completion records in task history.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={fetchData}
              disabled={loading}
              className="px-4 py-3 bg-white/15 hover:bg-white/25 active:scale-95 text-white rounded-2xl font-bold text-sm transition-all flex items-center gap-2 border border-white/20 backdrop-blur-md"
              title="Refresh Tasks"
            >
              <span className={`text-base ${loading ? 'animate-spin' : ''}`}>↻</span>
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <button
              onClick={handleOpenCreateModal}
              className="px-6 py-3 bg-white hover:bg-red-50 active:scale-95 text-red-600 rounded-2xl font-extrabold text-sm shadow-lg shadow-black/10 transition-all flex items-center gap-2.5"
            >
              <span className="text-lg leading-none">+</span>
              <span>Assign New Task</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Metrics Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        <div className="bg-white rounded-2xl p-4 md:p-5 border border-red-100 shadow-sm shadow-red-500/5 hover:border-red-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-red-600 uppercase tracking-wider">🚨 Urgent</span>
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl md:text-3xl font-black text-red-600 font-heading">{stats.urgent_count || 0}</span>
            <span className="text-[11px] text-slate-400 font-semibold">tasks</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 md:p-5 border border-slate-200/80 shadow-sm hover:border-blue-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">📌 Active Total</span>
            <span className="text-sm">🎯</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl md:text-3xl font-black text-slate-900 font-heading">{stats.active_count || 0}</span>
            <span className="text-[11px] text-slate-400 font-semibold">open</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 md:p-5 border border-slate-200/80 shadow-sm hover:border-amber-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">⚡ In Progress</span>
            <span className="text-sm">⏳</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl md:text-3xl font-black text-amber-600 font-heading">{stats.in_progress_count || 0}</span>
            <span className="text-[11px] text-slate-400 font-semibold">underway</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 md:p-5 border border-slate-200/80 shadow-sm hover:border-rose-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-rose-600 uppercase tracking-wider">⏰ Due / Overdue</span>
            <span className="text-sm">📅</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl md:text-3xl font-black text-rose-600 font-heading">
              {(stats.due_today_count || 0) + (stats.overdue_count || 0)}
            </span>
            <span className="text-[11px] text-slate-400 font-semibold">
              ({stats.overdue_count || 0} overdue)
            </span>
          </div>
        </div>

        <div className="col-span-2 md:col-span-4 lg:col-span-1 bg-white rounded-2xl p-4 md:p-5 border border-emerald-100 shadow-sm shadow-emerald-500/5 hover:border-emerald-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">✅ Completed</span>
            <span className="text-sm">🏆</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl md:text-3xl font-black text-emerald-600 font-heading">{stats.completed_count || 0}</span>
            <span className="text-[11px] text-slate-400 font-semibold">in history</span>
          </div>
        </div>
      </div>

      {/* Main Navigation Tabs */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setActiveTab('active');
              setFilterStatus('ALL');
            }}
            className={`px-5 py-2.5 rounded-2xl font-bold text-sm transition-all flex items-center gap-2.5 ${
              activeTab === 'active'
                ? 'bg-red-600 text-white shadow-md shadow-red-500/20'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <span>📌 Active Tasks</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-black ${
              activeTab === 'active' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
            }`}>
              {stats.active_count || 0}
            </span>
          </button>

          <button
            onClick={() => {
              setActiveTab('history');
              setFilterStatus('ALL');
            }}
            className={`px-5 py-2.5 rounded-2xl font-bold text-sm transition-all flex items-center gap-2.5 ${
              activeTab === 'history'
                ? 'bg-slate-900 text-white shadow-md shadow-slate-900/20'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <span>📜 Task History</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-black ${
              activeTab === 'history' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
            }`}>
              {stats.completed_count || 0}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'active' && (
            <div className="hidden sm:flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                onClick={() => setViewMode('cards')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  viewMode === 'cards' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                Cards View
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  viewMode === 'table' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                Table View
              </button>
            </div>
          )}

          <button
            onClick={handleExportCSV}
            className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-xs"
          >
            <span>📥</span>
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          {/* Search Box */}
          <div className="md:col-span-4 relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Title, Assignee, Notes, ID..."
              className="input-premium pl-10 text-sm"
            />
          </div>

          {/* Priority Filter */}
          <div className="md:col-span-2">
            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
              className="input-premium text-sm font-medium"
            >
              <option value="ALL">All Priorities</option>
              <option value="URGENT">🚨 Urgent</option>
              <option value="HIGH">⚡ High</option>
              <option value="MEDIUM">📌 Medium</option>
              <option value="LOW">📝 Low</option>
            </select>
          </div>

          {/* Category Filter */}
          <div className="md:col-span-3">
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="input-premium text-sm font-medium"
            >
              <option value="ALL">All Categories</option>
              {CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* Date Filter (History tab or Active tab) */}
          <div className="md:col-span-3 flex items-center gap-2">
            <input
              type="date"
              value={filterStartDate}
              onChange={(e) => setFilterStartDate(e.target.value)}
              title="Start Date"
              className="input-premium text-xs"
            />
            <span className="text-slate-400 text-xs font-bold">to</span>
            <input
              type="date"
              value={filterEndDate}
              onChange={(e) => setFilterEndDate(e.target.value)}
              title="End Date"
              className="input-premium text-xs"
            />
            {(filterStartDate || filterEndDate || searchQuery || filterPriority !== 'ALL' || filterCategory !== 'ALL') && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setFilterPriority('ALL');
                  setFilterCategory('ALL');
                  setFilterStatus('ALL');
                  setFilterStartDate('');
                  setFilterEndDate('');
                }}
                className="px-2.5 py-2 text-xs font-bold text-red-600 hover:bg-red-50 rounded-xl transition-all"
                title="Reset Filters"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Task Content List / Cards */}
      {loading ? (
        <div className="bg-white rounded-3xl p-16 flex flex-col items-center justify-center border border-slate-200/80 shadow-xs">
          <span className="loading loading-spinner loading-lg text-red-600"></span>
          <p className="mt-4 text-sm font-bold text-slate-500">Loading IMP Work tasks...</p>
        </div>
      ) : tasks.length === 0 ? (
        <div className="bg-white rounded-3xl p-16 text-center border border-slate-200/80 shadow-xs space-y-4">
          <div className="w-16 h-16 bg-red-50 text-red-600 rounded-3xl flex items-center justify-center text-3xl mx-auto border border-red-100">
            {activeTab === 'active' ? '🎉' : '📜'}
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-800 font-heading">
              {activeTab === 'active' ? 'No Active IMP Tasks Found' : 'No Task History Found'}
            </h3>
            <p className="text-sm text-slate-400 max-w-md mx-auto mt-1 font-medium">
              {activeTab === 'active'
                ? 'All critical tasks are currently completed! Click "Assign New Task" to create one.'
                : 'Completed tasks will appear here automatically with full historical logs.'}
            </p>
          </div>
          {activeTab === 'active' && (
            <button
              onClick={handleOpenCreateModal}
              className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white font-extrabold text-sm rounded-xl shadow-md shadow-red-500/20 active:scale-95 transition-all"
            >
              + Assign Task Now
            </button>
          )}
        </div>
      ) : activeTab === 'active' && viewMode === 'cards' ? (
        /* Active Tasks - Cards Grid View */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {tasks.map((task) => {
            const pInfo = getPriorityInfo(task.priority);
            const isOverdue = task.due_date && task.due_date < todayStr;
            const isDueToday = task.due_date && task.due_date === todayStr;

            return (
              <div
                key={task.id}
                className={`bg-white rounded-3xl p-5 border-2 transition-all duration-300 shadow-sm hover:shadow-md flex flex-col justify-between ${
                  task.priority === 'URGENT'
                    ? 'border-red-300 shadow-red-500/5 hover:border-red-500'
                    : 'border-slate-200/80 hover:border-slate-300'
                }`}
              >
                <div className="space-y-3.5">
                  {/* Card Header: Task ID, Priority, Category */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200">
                        {task.id}
                      </span>
                      <span className="text-[11px] font-semibold text-slate-600 bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-200">
                        {task.category || 'General'}
                      </span>
                    </div>

                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-extrabold border ${pInfo.color}`}>
                      <span>{pInfo.icon}</span>
                      <span>{pInfo.label}</span>
                    </span>
                  </div>

                  {/* Title & Description */}
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900 leading-snug font-heading">
                      {task.title}
                    </h3>
                    {task.description && (
                      <p className="text-xs text-slate-600 mt-2 line-clamp-3 leading-relaxed bg-slate-50/80 p-2.5 rounded-xl border border-slate-100">
                        {task.description}
                      </p>
                    )}
                  </div>

                  {/* Assignee & Dates Details */}
                  <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-100">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Assigned To</span>
                      <span className="font-extrabold text-slate-800 flex items-center gap-1 mt-0.5">
                        👤 {task.assigned_to}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Assigned By</span>
                      <span className="font-semibold text-slate-600 block mt-0.5 truncate">
                        {task.assigned_by}
                      </span>
                    </div>
                  </div>

                  {/* Due Date Indicator */}
                  <div className="flex items-center justify-between text-xs pt-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-400 font-medium">Due Date:</span>
                      {task.due_date ? (
                        <span className={`font-bold px-2 py-0.5 rounded-lg ${
                          isOverdue
                            ? 'bg-red-100 text-red-700 font-extrabold animate-pulse'
                            : isDueToday
                            ? 'bg-amber-100 text-amber-800 font-bold'
                            : 'bg-slate-100 text-slate-700'
                        }`}>
                          {task.due_date} {isOverdue && '⚠️ OVERDUE'} {isDueToday && '⏰ TODAY'}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">No deadline</span>
                      )}
                    </div>

                    <span className={`text-[11px] font-black px-2.5 py-0.5 rounded-full uppercase ${
                      task.status === 'IN_PROGRESS'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-slate-100 text-slate-600'
                    }`}>
                      {task.status === 'IN_PROGRESS' ? '⏳ In Progress' : '⚪ Pending'}
                    </span>
                  </div>
                </div>

                {/* Card Action Buttons */}
                <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {task.status === 'PENDING' ? (
                      <button
                        onClick={() => handleUpdateStatus(task, 'IN_PROGRESS')}
                        className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-extrabold rounded-xl border border-amber-200 transition-all active:scale-95"
                      >
                        ⚡ Start Work
                      </button>
                    ) : (
                      <button
                        onClick={() => handleUpdateStatus(task, 'PENDING')}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all"
                      >
                        Pause
                      </button>
                    )}

                    <button
                      onClick={() => handleOpenCompleteModal(task)}
                      className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-extrabold rounded-xl shadow-sm shadow-emerald-500/20 transition-all flex items-center gap-1.5"
                    >
                      <span>✓</span>
                      <span>Complete</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenEditModal(task)}
                      title="Edit Task"
                      className="w-8 h-8 rounded-xl bg-slate-50 hover:bg-blue-50 text-slate-500 hover:text-blue-600 border border-slate-200 flex items-center justify-center text-xs transition-all"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => {
                        setSelectedTask(task);
                        setIsDeleteModalOpen(true);
                      }}
                      title="Delete Task"
                      className="w-8 h-8 rounded-xl bg-slate-50 hover:bg-red-50 text-slate-500 hover:text-red-600 border border-slate-200 flex items-center justify-center text-xs transition-all"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table View (for Active or History) */
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-black text-slate-500 uppercase tracking-wider">
                  <th className="py-3.5 px-4">Task ID</th>
                  <th className="py-3.5 px-4">Priority</th>
                  <th className="py-3.5 px-4">Title & Details</th>
                  <th className="py-3.5 px-4">Category</th>
                  <th className="py-3.5 px-4">Assigned To</th>
                  {activeTab === 'active' ? (
                    <>
                      <th className="py-3.5 px-4">Due Date</th>
                      <th className="py-3.5 px-4">Status</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </>
                  ) : (
                    <>
                      <th className="py-3.5 px-4">Completed On</th>
                      <th className="py-3.5 px-4">Completed By & Remarks</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                {tasks.map((task) => {
                  const pInfo = getPriorityInfo(task.priority);
                  const isOverdue = task.due_date && task.due_date < todayStr;
                  const isDueToday = task.due_date && task.due_date === todayStr;

                  return (
                    <tr key={task.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-slate-600">
                        {task.id}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black border ${pInfo.color}`}>
                          <span>{pInfo.icon}</span>
                          <span>{pInfo.label}</span>
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-extrabold text-slate-900 text-sm font-heading">{task.title}</div>
                        {task.description && (
                          <div className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">{task.description}</div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-lg text-[11px] font-semibold border border-slate-200">
                          {task.category || 'General'}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-800">
                        👤 {task.assigned_to}
                        <div className="text-[10px] text-slate-400 font-normal">by {task.assigned_by}</div>
                      </td>

                      {activeTab === 'active' ? (
                        <>
                          <td className="py-3 px-4 font-semibold">
                            {task.due_date ? (
                              <span className={`px-2 py-0.5 rounded-md ${
                                isOverdue ? 'bg-red-100 text-red-700 font-extrabold' : isDueToday ? 'bg-amber-100 text-amber-800 font-bold' : 'text-slate-700'
                              }`}>
                                {task.due_date} {isOverdue && '⚠️'}
                              </span>
                            ) : (
                              <span className="text-slate-400 italic">-</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <span className={`text-[11px] font-black px-2.5 py-1 rounded-full uppercase ${
                              task.status === 'IN_PROGRESS'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-600'
                            }`}>
                              {task.status === 'IN_PROGRESS' ? '⏳ In Progress' : '⚪ Pending'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {task.status === 'PENDING' ? (
                                <button
                                  onClick={() => handleUpdateStatus(task, 'IN_PROGRESS')}
                                  className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 text-[11px] font-bold rounded-lg border border-amber-200"
                                >
                                  Start
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleUpdateStatus(task, 'PENDING')}
                                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[11px] font-bold rounded-lg"
                                >
                                  Pause
                                </button>
                              )}

                              <button
                                onClick={() => handleOpenCompleteModal(task)}
                                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-extrabold rounded-lg shadow-xs"
                              >
                                ✓ Complete
                              </button>

                              <button
                                onClick={() => handleOpenEditModal(task)}
                                className="p-1 text-slate-400 hover:text-blue-600"
                                title="Edit"
                              >
                                ✏️
                              </button>

                              <button
                                onClick={() => {
                                  setSelectedTask(task);
                                  setIsDeleteModalOpen(true);
                                }}
                                className="p-1 text-slate-400 hover:text-red-600"
                                title="Delete"
                              >
                                🗑️
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="py-3 px-4 font-mono font-semibold text-slate-700">
                            {task.completed_at || '-'}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-bold text-emerald-700">
                              ✓ {task.completed_by || 'Completed'}
                            </div>
                            {task.completed_notes && (
                              <div className="text-[11px] text-slate-600 italic bg-emerald-50/70 px-2 py-1 rounded-lg border border-emerald-100 mt-1">
                                "{task.completed_notes}"
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleReopenTask(task)}
                                className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold rounded-lg transition-all"
                                title="Move back to Active Tasks"
                              >
                                ↺ Reopen
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedTask(task);
                                  setIsDeleteModalOpen(true);
                                }}
                                className="p-1 text-slate-400 hover:text-red-600"
                                title="Delete"
                              >
                                🗑️
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Task Creation & Edit Modal */}
      {isTaskModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 md:p-8 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto space-y-5 animate-scaleIn">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-red-600">
                  {modalMode === 'create' ? '🚨 Assign Important Work' : '✏️ Modify Task Details'}
                </span>
                <h2 className="text-xl font-black text-slate-900 font-heading">
                  {modalMode === 'create' ? 'New IMP Task' : `Edit Task: ${selectedTask?.id}`}
                </h2>
              </div>
              <button
                onClick={() => setIsTaskModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold flex items-center justify-center transition-all"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveTask} className="space-y-4">
              {/* Task Title */}
              <div>
                <label className="label-premium">Task Title / Work Summary *</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g., Fix conveyor belt motor on 1L packaging line"
                  className="input-premium font-medium"
                />
              </div>

              {/* Priority Selector */}
              <div>
                <label className="label-premium">Priority Level *</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {PRIORITIES.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, priority: p.value })}
                      className={`p-2.5 rounded-xl border-2 text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                        formData.priority === p.value
                          ? `${p.badge} border-transparent shadow-md scale-102`
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <span>{p.icon}</span>
                      <span>{p.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Category & Due Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label-premium">Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="input-premium font-medium"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="label-premium">Due Date</label>
                  <input
                    type="date"
                    value={formData.due_date}
                    onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                    className="input-premium font-medium"
                  />
                </div>
              </div>

              {/* Assigned To & Assigned By */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label-premium">Assigned To (Person / Team) *</label>
                  <input
                    type="text"
                    required
                    value={formData.assigned_to}
                    onChange={(e) => setFormData({ ...formData, assigned_to: e.target.value })}
                    placeholder="e.g., Ramesh (Maintenance) / Line 1 Operator"
                    className="input-premium font-medium"
                  />
                </div>

                <div>
                  <label className="label-premium">Assigned By</label>
                  <input
                    type="text"
                    value={formData.assigned_by}
                    onChange={(e) => setFormData({ ...formData, assigned_by: e.target.value })}
                    placeholder="e.g., Zaheer / Supervisor"
                    className="input-premium font-medium"
                  />
                </div>
              </div>

              {/* Description / Instructions */}
              <div>
                <label className="label-premium">Detailed Instructions / Description</label>
                <textarea
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Provide any critical technical details, required tools, safety precautions, or checklist..."
                  className="input-premium h-auto py-2.5 font-medium resize-none"
                />
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsTaskModalOpen(false)}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2.5 bg-red-600 hover:bg-red-700 active:scale-95 text-white font-extrabold text-sm rounded-xl shadow-lg shadow-red-500/25 transition-all flex items-center gap-2"
                >
                  {isSubmitting && <span className="loading loading-spinner loading-xs"></span>}
                  <span>{modalMode === 'create' ? 'Assign Task' : 'Update Task'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Complete Task Modal */}
      {isCompleteModalOpen && selectedTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 md:p-8 shadow-2xl border border-slate-100 space-y-5 animate-scaleIn">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600">
                  ✅ Task Completion
                </span>
                <h2 className="text-xl font-black text-slate-900 font-heading">
                  Mark Task as Completed
                </h2>
              </div>
              <button
                onClick={() => setIsCompleteModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold flex items-center justify-center transition-all"
              >
                ✕
              </button>
            </div>

            <div className="bg-emerald-50/70 p-4 rounded-2xl border border-emerald-100">
              <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">Task to Complete:</span>
              <p className="font-extrabold text-slate-900 text-sm mt-0.5">{selectedTask.title}</p>
              <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                <span>ID: {selectedTask.id}</span>
                <span>•</span>
                <span>Assigned to: {selectedTask.assigned_to}</span>
              </div>
            </div>

            <form onSubmit={handleCompleteTask} className="space-y-4">
              <div>
                <label className="label-premium">Completed By *</label>
                <input
                  type="text"
                  required
                  value={completeFormData.completed_by}
                  onChange={(e) => setCompleteFormData({ ...completeFormData, completed_by: e.target.value })}
                  className="input-premium font-medium"
                />
              </div>

              <div>
                <label className="label-premium">Completion Remarks / Work Done Notes</label>
                <textarea
                  rows={3}
                  value={completeFormData.completed_notes}
                  onChange={(e) => setCompleteFormData({ ...completeFormData, completed_notes: e.target.value })}
                  placeholder="e.g., Repaired the motor bearing, tested full line operation, everything running normally."
                  className="input-premium h-auto py-2.5 font-medium resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCompleteModalOpen(false)}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-extrabold text-sm rounded-xl shadow-lg shadow-emerald-500/25 transition-all flex items-center gap-2"
                >
                  {isSubmitting && <span className="loading loading-spinner loading-xs"></span>}
                  <span>✓ Save & Move to History</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && selectedTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4 animate-scaleIn">
            <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center text-2xl mx-auto border border-red-100">
              ⚠️
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-lg font-bold text-slate-900 font-heading">Delete Task?</h3>
              <p className="text-xs text-slate-500">
                Are you sure you want to permanently delete task <span className="font-bold text-slate-700">"{selectedTask.title}"</span> ({selectedTask.id})? This action cannot be undone.
              </p>
            </div>

            <div className="flex items-center justify-center gap-3 pt-3">
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleDeleteTask}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 active:scale-95 text-white font-extrabold text-xs rounded-xl shadow-md shadow-red-500/20 transition-all flex items-center gap-1.5"
              >
                {isSubmitting && <span className="loading loading-spinner loading-xs"></span>}
                <span>Delete Task</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImpWork;
