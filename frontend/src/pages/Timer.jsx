import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';

const STOP_REASONS = [
  'Lunch Break',
  'Tea Break',
  'Maintenance',
  'Machine Problem',
  'No Raw Material',
  'No Order',
  'Power Failure',
  'Changeover',
  'Other'
];

function formatTimeOnly(timeStr) {
  if (!timeStr) return '-';
  const parts = timeStr.split(':');
  if (parts.length < 2) return timeStr;
  let h = parseInt(parts[0], 10);
  const m = parts[1];
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${String(h).padStart(2, '0')}:${m} ${ampm}`;
}

function formatDuration(totalSecs, includeSeconds = false) {
  const secs = Math.max(0, Math.floor(totalSecs || 0));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;

  if (includeSeconds) {
    return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  }
  return `${h}h ${m}m`;
}

function calculateShiftDurationText(startTime, endTime) {
  if (!startTime || !endTime) return '0 hrs';
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  let startSec = (sh || 0) * 3600 + (sm || 0) * 60;
  let endSec = (eh || 0) * 3600 + (em || 0) * 60;
  let diffSec = endSec >= startSec ? endSec - startSec : (24 * 3600 - startSec) + endSec;
  const hours = Math.floor(diffSec / 3600);
  const mins = Math.floor((diffSec % 3600) / 60);
  return `${hours} hr${hours !== 1 ? 's' : ''} ${mins > 0 ? `${mins} min${mins !== 1 ? 's' : ''}` : ''}`;
}

const Timer = () => {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [machines, setMachines] = useState([]);
  const [summary, setSummary] = useState(null);
  const [currentDate, setCurrentDate] = useState('');
  const [serverTime, setServerTime] = useState('');
  const [actionLoading, setActionLoading] = useState({});
  const [feedback, setFeedback] = useState({ type: '', message: '' });

  // Stop Modal state
  const [isStopModalOpen, setIsStopModalOpen] = useState(false);
  const [selectedMachine, setSelectedMachine] = useState(null);
  const [stopReason, setStopReason] = useState('');
  const [stopNotes, setStopNotes] = useState('');
  const [modalError, setModalError] = useState('');
  const [isStopping, setIsStopping] = useState(false);

  // Edit / Settings Modal state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [editingMachine, setEditingMachine] = useState(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [editFormData, setEditFormData] = useState({
    id: '',
    machine_name: '',
    machine_type: 'Production',
    working_start_time: '08:00',
    working_end_time: '18:00'
  });
  const [editError, setEditError] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Interval ref for ticking timer
  const tickIntervalRef = useRef(null);

  useEffect(() => {
    fetchTimerStatus();

    // Setup 1-second interval for smooth live timer ticking
    tickIntervalRef.current = setInterval(() => {
      setMachines((prevMachines) =>
        prevMachines.map((m) => {
          if (m.status === 'RUNNING' && m.active_session) {
            const nextCurrentSec = (m.active_session.current_run_seconds || 0) + 1;
            const nextTodaySec = (m.today_completed_seconds || 0) + nextCurrentSec;
            const nextUtil = m.available_seconds > 0
              ? Math.min(100, (nextTodaySec / m.available_seconds) * 100).toFixed(1)
              : 0;

            return {
              ...m,
              active_session: {
                ...m.active_session,
                current_run_seconds: nextCurrentSec,
                current_run_formatted: formatDuration(nextCurrentSec, true)
              },
              today_total_running_seconds: nextTodaySec,
              today_running_formatted: formatDuration(nextTodaySec, false),
              today_running_precise_formatted: formatDuration(nextTodaySec, true),
              utilization_percentage: parseFloat(nextUtil)
            };
          }
          return m;
        })
      );
    }, 1000);

    // Sync from server every 30 seconds
    const syncInterval = setInterval(() => {
      fetchTimerStatus(false);
    }, 30000);

    return () => {
      if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
      clearInterval(syncInterval);
    };
  }, []);

  const fetchTimerStatus = async (showMainLoading = true) => {
    if (showMainLoading) setLoading(true);
    else setRefreshing(true);

    try {
      const res = await api.get('/timer/status');
      if (res.data.ok) {
        setMachines(res.data.machines || []);
        setSummary(res.data.summary || null);
        setCurrentDate(res.data.current_date || '');
        setServerTime(res.data.server_time || '');
      }
    } catch (err) {
      console.error('Failed to fetch timer status:', err);
      setFeedback({
        type: 'error',
        message: err.response?.data?.error || 'Failed to load timer status.'
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleStartMachine = async (machine) => {
    setActionLoading((prev) => ({ ...prev, [machine.id]: true }));
    setFeedback({ type: '', message: '' });

    try {
      const res = await api.post(`/timer/${machine.id}/start`);
      if (res.data.ok) {
        setFeedback({
          type: 'success',
          message: `${machine.machine_name} started successfully!`
        });
        await fetchTimerStatus(false);
      }
    } catch (err) {
      console.error('Failed to start machine:', err);
      setFeedback({
        type: 'error',
        message: err.response?.data?.error || `Failed to start ${machine.machine_name}.`
      });
    } finally {
      setActionLoading((prev) => ({ ...prev, [machine.id]: false }));
    }
  };

  const openStopModal = (machine) => {
    setSelectedMachine(machine);
    setStopReason('');
    setStopNotes('');
    setModalError('');
    setIsStopModalOpen(true);
  };

  const closeStopModal = () => {
    setIsStopModalOpen(false);
    setSelectedMachine(null);
    setStopReason('');
    setStopNotes('');
    setModalError('');
  };

  const handleConfirmStop = async () => {
    if (!stopReason) {
      setModalError('Please select a reason for stopping the machine.');
      return;
    }

    setIsStopping(true);
    setModalError('');

    try {
      const res = await api.post(`/timer/${selectedMachine.id}/stop`, {
        stop_reason: stopReason,
        notes: stopNotes
      });

      if (res.data.ok) {
        setFeedback({
          type: 'success',
          message: `${selectedMachine.machine_name} stopped. Recorded Duration: ${res.data.session.duration_formatted}`
        });
        closeStopModal();
        await fetchTimerStatus(false);
      }
    } catch (err) {
      console.error('Failed to stop machine:', err);
      setModalError(err.response?.data?.error || 'Failed to stop machine.');
    } finally {
      setIsStopping(false);
    }
  };

  // Open Edit Machine modal
  const openEditModal = (machine) => {
    setIsAddingNew(false);
    setEditingMachine(machine);
    setEditFormData({
      id: machine.id,
      machine_name: machine.machine_name,
      machine_type: machine.machine_type,
      working_start_time: machine.working_start_time ? machine.working_start_time.slice(0, 5) : '08:00',
      working_end_time: machine.working_end_time ? machine.working_end_time.slice(0, 5) : '18:00'
    });
    setEditError('');
    setIsEditModalOpen(true);
  };

  // Open Add Machine modal
  const openAddNewModal = () => {
    setIsAddingNew(true);
    setEditingMachine(null);
    setEditFormData({
      id: '',
      machine_name: '',
      machine_type: 'Production',
      working_start_time: '08:00',
      working_end_time: '18:00'
    });
    setEditError('');
    setIsEditModalOpen(true);
  };

  const closeEditModal = () => {
    setIsEditModalOpen(false);
    setEditingMachine(null);
    setIsAddingNew(false);
    setEditError('');
  };

  const handleSaveMachineConfig = async (e) => {
    e.preventDefault();
    if (!editFormData.machine_name.trim()) {
      setEditError('Machine name is required.');
      return;
    }

    setIsSavingEdit(true);
    setEditError('');

    try {
      if (isAddingNew) {
        const res = await api.post('/timer/machines', editFormData);
        if (res.data.ok) {
          setFeedback({
            type: 'success',
            message: `New machine "${editFormData.machine_name}" created successfully!`
          });
          closeEditModal();
          await fetchTimerStatus(false);
        }
      } else {
        const res = await api.put(`/timer/machine/${editingMachine.id}`, editFormData);
        if (res.data.ok) {
          setFeedback({
            type: 'success',
            message: `Machine "${editFormData.machine_name}" updated successfully!`
          });
          closeEditModal();
          await fetchTimerStatus(false);
        }
      }
    } catch (err) {
      console.error('Failed to save machine settings:', err);
      setEditError(err.response?.data?.error || 'Failed to save machine settings.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Separate machines into groups
  const productionMachines = machines.filter((m) => m.machine_type === 'Production');
  const petBottleMachines = machines.filter((m) => m.machine_type === 'PET Bottle');

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-base-100 p-5 rounded-2xl shadow-sm border border-base-300">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-3xl">⏱️</span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-base-content">Machine Timer</h1>
              <p className="text-xs text-base-content/70">
                Track running hours, stopped duration, and live status of production machines
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2.5">
          {currentDate && (
            <div className="badge badge-lg bg-base-200 border-base-300 text-xs font-semibold px-3 py-3 gap-1.5">
              <span>📅</span>
              <span>{currentDate}</span>
            </div>
          )}

          <button
            onClick={() => fetchTimerStatus(false)}
            disabled={loading || refreshing}
            className="btn btn-sm btn-outline border-base-300 gap-2"
          >
            <span className={refreshing ? 'animate-spin' : ''}>🔄</span>
            {refreshing ? 'Syncing...' : 'Refresh'}
          </button>

          {/* Button to Set Machine Names & Shift Timings */}
          <button
            onClick={() => setIsSettingsModalOpen(true)}
            className="btn btn-sm btn-outline btn-neutral gap-1.5 shadow-sm"
          >
            <span>⚙️</span>
            <span>Set Machine & Timings</span>
          </button>

          <button
            onClick={() => navigate('/timer-history')}
            className="btn btn-sm btn-primary gap-1.5 shadow-sm"
          >
            <span>📜</span>
            <span>Daily History</span>
          </button>
        </div>
      </div>

      {/* Alert / Feedback message */}
      {feedback.message && (
        <div
          className={`alert ${
            feedback.type === 'error' ? 'alert-error text-white' : 'alert-success text-white'
          } shadow-md transition-all`}
        >
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <span>{feedback.type === 'error' ? '⚠️' : '✅'}</span>
              <span className="text-sm font-medium">{feedback.message}</span>
            </div>
            <button
              onClick={() => setFeedback({ type: '', message: '' })}
              className="btn btn-xs btn-ghost btn-circle"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Summary KPI Cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="stat bg-base-100 border border-base-300 rounded-2xl shadow-sm p-4">
            <div className="stat-figure text-success">
              <span className="text-2xl">⚡</span>
            </div>
            <div className="stat-title text-xs font-medium text-base-content/70">Running Machines</div>
            <div className="stat-value text-2xl font-black text-success mt-1">
              {summary.running_machines}
              <span className="text-xs font-medium text-base-content/60 ml-1">/ {summary.total_machines}</span>
            </div>
            <div className="stat-desc text-[11px] text-base-content/60 mt-1">
              {summary.stopped_machines} machines stopped
            </div>
          </div>

          <div className="stat bg-base-100 border border-base-300 rounded-2xl shadow-sm p-4">
            <div className="stat-figure text-primary">
              <span className="text-2xl">⏳</span>
            </div>
            <div className="stat-title text-xs font-medium text-base-content/70">Total Running Today</div>
            <div className="stat-value text-2xl font-black text-primary mt-1">
              {summary.total_running_formatted || '0h 0m'}
            </div>
            <div className="stat-desc text-[11px] text-base-content/60 mt-1">
              Across all plant machines
            </div>
          </div>

          <div className="stat bg-base-100 border border-base-300 rounded-2xl shadow-sm p-4">
            <div className="stat-figure text-info">
              <span className="text-2xl">📊</span>
            </div>
            <div className="stat-title text-xs font-medium text-base-content/70">Plant Utilization</div>
            <div className="stat-value text-2xl font-black text-info mt-1">
              {summary.overall_utilization}%
            </div>
            <div className="stat-desc text-[11px] text-base-content/60 mt-1">
              Based on scheduled hours
            </div>
          </div>

          <div className="stat bg-base-100 border border-base-300 rounded-2xl shadow-sm p-4">
            <div className="stat-figure text-warning">
              <span className="text-2xl">🕒</span>
            </div>
            <div className="stat-title text-xs font-medium text-base-content/70">Server Timestamp</div>
            <div className="stat-value text-lg font-bold text-base-content mt-1">
              {serverTime ? serverTime.split(' ')[1] : '--:--:--'}
            </div>
            <div className="stat-desc text-[11px] text-base-content/60 mt-1">
              Indian Standard Time (IST)
            </div>
          </div>
        </div>
      )}

      {/* Main Machine Groups */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-12 bg-base-100 rounded-2xl border border-base-300">
          <span className="loading loading-spinner loading-lg text-primary"></span>
          <p className="text-sm text-base-content/60 mt-3 font-medium">Loading machine status...</p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* SECTION 1: Production Machines */}
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-base-300">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">🏭</span>
                <h2 className="text-lg font-bold text-base-content">Production</h2>
                <span className="badge badge-sm badge-ghost font-medium">
                  {productionMachines.length} Machines
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {productionMachines.map((machine) => (
                <MachineCard
                  key={machine.id}
                  machine={machine}
                  onStart={handleStartMachine}
                  onStop={openStopModal}
                  onEdit={openEditModal}
                  actionLoading={actionLoading[machine.id]}
                />
              ))}
            </div>
          </div>

          {/* SECTION 2: PET Bottle Production Machines */}
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-base-300">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">🍾</span>
                <h2 className="text-lg font-bold text-base-content">PET Bottle Production</h2>
                <span className="badge badge-sm badge-ghost font-medium">
                  {petBottleMachines.length} Machines
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {petBottleMachines.map((machine) => (
                <MachineCard
                  key={machine.id}
                  machine={machine}
                  onStart={handleStartMachine}
                  onStop={openStopModal}
                  onEdit={openEditModal}
                  actionLoading={actionLoading[machine.id]}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* STOP MACHINE CONFIRMATION MODAL */}
      {isStopModalOpen && selectedMachine && (
        <div className="modal modal-open">
          <div className="modal-box max-w-lg border border-base-300 shadow-2xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-base-200">
              <div className="flex items-center gap-2">
                <span className="p-2 bg-error/10 text-error rounded-xl text-lg font-bold">⏹</span>
                <div>
                  <h3 className="text-lg font-bold text-base-content">Stop Machine?</h3>
                  <p className="text-xs text-base-content/60">Confirm machine session termination</p>
                </div>
              </div>
              <button
                onClick={closeStopModal}
                disabled={isStopping}
                className="btn btn-sm btn-ghost btn-circle"
              >
                ✕
              </button>
            </div>

            {modalError && (
              <div className="alert alert-error text-white text-xs mt-4 py-2">
                <span>⚠️ {modalError}</span>
              </div>
            )}

            <div className="py-4 space-y-4">
              {/* Machine Details summary */}
              <div className="bg-base-200/60 p-4 rounded-xl space-y-2.5 border border-base-300/50">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-base-content/70 font-medium">Machine:</span>
                  <span className="font-bold text-base-content">{selectedMachine.machine_name}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-base-content/70 font-medium">Category:</span>
                  <span className="badge badge-sm badge-ghost">{selectedMachine.machine_type}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-base-content/70 font-medium">Started At:</span>
                  <span className="font-semibold text-base-content">
                    {selectedMachine.active_session?.started_at_formatted || '-'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm pt-2 border-t border-base-300/50">
                  <span className="text-base-content/70 font-medium">Current Running Time:</span>
                  <span className="font-mono font-bold text-error text-base">
                    {selectedMachine.active_session?.current_run_formatted || '0h 00m 00s'}
                  </span>
                </div>
              </div>

              {/* Stop Reason Selection */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-base-content/80 flex items-center gap-1">
                  <span>Stop Reason</span>
                  <span className="text-error">*</span>
                </label>
                <select
                  value={stopReason}
                  onChange={(e) => {
                    setStopReason(e.target.value);
                    if (modalError) setModalError('');
                  }}
                  className="select select-bordered w-full text-sm font-medium focus:outline-none focus:border-error"
                >
                  <option value="" disabled>
                    -- Select Reason --
                  </option>
                  {STOP_REASONS.map((reason) => (
                    <option key={reason} value={reason}>
                      {reason}
                    </option>
                  ))}
                </select>
              </div>

              {/* Optional Notes */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-base-content/80">
                  Notes <span className="text-[11px] font-normal lowercase text-base-content/60">(optional)</span>
                </label>
                <textarea
                  value={stopNotes}
                  onChange={(e) => setStopNotes(e.target.value)}
                  placeholder="Add any additional remarks, operator notes, or issues..."
                  rows={2}
                  className="textarea textarea-bordered w-full text-sm focus:outline-none focus:border-error"
                ></textarea>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="modal-action border-t border-base-200 pt-3">
              <button
                onClick={closeStopModal}
                disabled={isStopping}
                className="btn btn-sm btn-ghost"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmStop}
                disabled={isStopping || !stopReason}
                className="btn btn-sm btn-error text-white gap-2 font-bold px-5"
              >
                {isStopping ? (
                  <>
                    <span className="loading loading-spinner loading-xs"></span>
                    <span>Stopping...</span>
                  </>
                ) : (
                  <>
                    <span>⏹</span>
                    <span>Confirm Stop</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT / CONFIGURE MACHINE NAME & SHIFT TIMINGS MODAL */}
      {isEditModalOpen && (
        <div className="modal modal-open">
          <div className="modal-box max-w-md border border-base-300 shadow-2xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-base-200">
              <div className="flex items-center gap-2">
                <span className="p-2 bg-primary/10 text-primary rounded-xl text-lg font-bold">⚙️</span>
                <div>
                  <h3 className="text-lg font-bold text-base-content">
                    {isAddingNew ? 'Add New Machine' : 'Edit Machine & Shift'}
                  </h3>
                  <p className="text-xs text-base-content/60">
                    {isAddingNew ? 'Configure a new machine in plant' : `ID: ${editFormData.id}`}
                  </p>
                </div>
              </div>
              <button
                onClick={closeEditModal}
                disabled={isSavingEdit}
                className="btn btn-sm btn-ghost btn-circle"
              >
                ✕
              </button>
            </div>

            {editError && (
              <div className="alert alert-error text-white text-xs mt-4 py-2">
                <span>⚠️ {editError}</span>
              </div>
            )}

            <form onSubmit={handleSaveMachineConfig} className="py-4 space-y-4">
              {/* Machine ID (if adding new) */}
              {isAddingNew && (
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-base-content/80">
                    Machine ID <span className="text-[10px] font-normal text-base-content/50">(e.g. PROD-03, PET-04)</span>
                  </label>
                  <input
                    type="text"
                    value={editFormData.id}
                    onChange={(e) => setEditFormData({ ...editFormData, id: e.target.value })}
                    placeholder="Auto-generated if left blank"
                    className="input input-bordered w-full text-sm font-mono"
                  />
                </div>
              )}

              {/* Machine Name */}
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider text-base-content/80 flex items-center gap-1">
                  <span>Machine Name</span>
                  <span className="text-error">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editFormData.machine_name}
                  onChange={(e) => setEditFormData({ ...editFormData, machine_name: e.target.value })}
                  placeholder="e.g. Production Machine 1"
                  className="input input-bordered w-full text-sm font-semibold"
                />
              </div>

              {/* Category */}
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider text-base-content/80">
                  Category / Machine Type
                </label>
                <select
                  value={editFormData.machine_type}
                  onChange={(e) => setEditFormData({ ...editFormData, machine_type: e.target.value })}
                  className="select select-bordered w-full text-sm"
                >
                  <option value="Production">🏭 Production</option>
                  <option value="PET Bottle">🍾 PET Bottle</option>
                </select>
              </div>

              {/* Shift Timing Inputs */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-base-content/80 flex items-center gap-1">
                    <span>Shift Start Time</span>
                    <span className="text-error">*</span>
                  </label>
                  <input
                    type="time"
                    required
                    value={editFormData.working_start_time}
                    onChange={(e) => setEditFormData({ ...editFormData, working_start_time: e.target.value })}
                    className="input input-bordered w-full text-sm font-mono font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-base-content/80 flex items-center gap-1">
                    <span>Shift End Time</span>
                    <span className="text-error">*</span>
                  </label>
                  <input
                    type="time"
                    required
                    value={editFormData.working_end_time}
                    onChange={(e) => setEditFormData({ ...editFormData, working_end_time: e.target.value })}
                    className="input input-bordered w-full text-sm font-mono font-bold"
                  />
                </div>
              </div>

              {/* Live Calculated Shift Hours Preview */}
              <div className="bg-base-200/70 p-3 rounded-xl flex items-center justify-between border border-base-300">
                <span className="text-xs text-base-content/70 font-medium">Calculated Shift Duration:</span>
                <span className="badge badge-neutral font-mono font-bold text-xs py-2">
                  {calculateShiftDurationText(editFormData.working_start_time, editFormData.working_end_time)}
                </span>
              </div>

              {/* Modal Actions */}
              <div className="modal-action border-t border-base-200 pt-3">
                <button
                  type="button"
                  onClick={closeEditModal}
                  disabled={isSavingEdit}
                  className="btn btn-sm btn-ghost"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="btn btn-sm btn-primary gap-2 font-bold px-5"
                >
                  {isSavingEdit ? (
                    <>
                      <span className="loading loading-spinner loading-xs"></span>
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <span>💾</span>
                      <span>Save Changes</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ALL MACHINES MANAGEMENT MODAL */}
      {isSettingsModalOpen && (
        <div className="modal modal-open">
          <div className="modal-box max-w-3xl border border-base-300 shadow-2xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-base-200">
              <div className="flex items-center gap-2">
                <span className="p-2 bg-neutral/10 text-neutral rounded-xl text-lg font-bold">⚙️</span>
                <div>
                  <h3 className="text-lg font-bold text-base-content">Machine & Shift Settings</h3>
                  <p className="text-xs text-base-content/60">Configure machine names, shift hours, and plant equipment</p>
                </div>
              </div>
              <button
                onClick={() => setIsSettingsModalOpen(false)}
                className="btn btn-sm btn-ghost btn-circle"
              >
                ✕
              </button>
            </div>

            <div className="py-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-base-content/70">
                  Total Machines ({machines.length})
                </span>
                <button
                  onClick={() => {
                    setIsSettingsModalOpen(false);
                    openAddNewModal();
                  }}
                  className="btn btn-xs btn-primary gap-1 font-bold"
                >
                  <span>+</span>
                  <span>Add Machine</span>
                </button>
              </div>

              <div className="overflow-x-auto rounded-xl border border-base-300 bg-base-100 shadow-sm">
                <table className="table table-sm w-full">
                  <thead className="bg-base-200/80 text-base-content/70">
                    <tr>
                      <th>ID</th>
                      <th>Machine Name</th>
                      <th>Category</th>
                      <th>Shift Timings</th>
                      <th>Available Hours</th>
                      <th className="text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {machines.map((m) => (
                      <tr key={m.id} className="hover:bg-base-200/40">
                        <td className="font-mono font-bold text-xs">{m.id}</td>
                        <td className="font-semibold text-base-content">{m.machine_name}</td>
                        <td>
                          <span className="badge badge-sm badge-ghost text-xs font-medium">
                            {m.machine_type}
                          </span>
                        </td>
                        <td className="font-mono text-xs">
                          {formatTimeOnly(m.working_start_time)} - {formatTimeOnly(m.working_end_time)}
                        </td>
                        <td>
                          <span className="badge badge-sm badge-outline font-mono text-xs">
                            {m.available_hours}
                          </span>
                        </td>
                        <td className="text-right">
                          <button
                            onClick={() => {
                              setIsSettingsModalOpen(false);
                              openEditModal(m);
                            }}
                            className="btn btn-xs btn-outline btn-primary gap-1 font-semibold"
                          >
                            <span>✏️</span>
                            <span>Edit</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="modal-action border-t border-base-200 pt-3">
              <button
                onClick={() => setIsSettingsModalOpen(false)}
                className="btn btn-sm btn-neutral"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Subcomponent: Individual Machine Card
const MachineCard = ({ machine, onStart, onStop, onEdit, actionLoading }) => {
  const isRunning = machine.status === 'RUNNING';

  return (
    <div
      className={`card bg-base-100 border transition-all duration-200 shadow-sm rounded-2xl overflow-hidden ${
        isRunning
          ? 'border-success/60 ring-2 ring-success/15 shadow-success/5'
          : 'border-base-300 hover:border-base-content/20'
      }`}
    >
      <div className="card-body p-5 space-y-4">
        {/* Card Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-base text-base-content">{machine.machine_name}</h3>
              <span className="badge badge-xs badge-outline font-mono text-[10px] opacity-70">
                {machine.id}
              </span>
              {/* Quick Edit Button */}
              <button
                onClick={() => onEdit(machine)}
                title="Edit Machine Name & Shift Timings"
                className="btn btn-ghost btn-xs btn-circle text-base-content/60 hover:text-primary hover:bg-primary/10 transition-colors"
              >
                ✏️
              </button>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <p className="text-xs text-base-content/60">
                Shift: <strong className="text-base-content/80 font-mono">{formatTimeOnly(machine.working_start_time)} - {formatTimeOnly(machine.working_end_time)}</strong> ({machine.available_hours})
              </p>
              <button
                onClick={() => onEdit(machine)}
                className="text-[11px] text-primary hover:underline font-medium cursor-pointer"
              >
                (Change)
              </button>
            </div>
          </div>

          {/* Status Badge */}
          <div>
            {isRunning ? (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-success/15 text-success rounded-full text-xs font-bold animate-pulse">
                <span className="w-2 h-2 rounded-full bg-success"></span>
                <span>RUNNING</span>
              </div>
            ) : (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-base-200 text-base-content/60 rounded-full text-xs font-bold">
                <span className="w-2 h-2 rounded-full bg-base-content/40"></span>
                <span>STOPPED</span>
              </div>
            )}
          </div>
        </div>

        {/* Dynamic Running / Stopped Stats Grid */}
        <div className="grid grid-cols-2 gap-3 p-3.5 bg-base-200/50 rounded-xl border border-base-300/40">
          <div>
            <div className="text-[11px] font-medium text-base-content/60 uppercase tracking-wider">
              {isRunning ? 'Current Run' : 'Started At'}
            </div>
            <div className="mt-0.5">
              {isRunning ? (
                <span className="font-mono text-base font-black text-success">
                  {machine.active_session?.current_run_formatted || '0h 00m 00s'}
                </span>
              ) : (
                <span className="text-sm font-semibold text-base-content/60">-</span>
              )}
            </div>
            {isRunning && machine.active_session?.started_at_formatted && (
              <div className="text-[10px] text-base-content/50 mt-0.5">
                Since {machine.active_session.started_at_formatted}
              </div>
            )}
          </div>

          <div>
            <div className="text-[11px] font-medium text-base-content/60 uppercase tracking-wider">
              Today's Run
            </div>
            <div className="mt-0.5">
              <span className="font-mono text-base font-black text-base-content">
                {machine.today_running_formatted || '0h 0m'}
              </span>
            </div>
            <div className="text-[10px] text-base-content/50 mt-0.5">
              {machine.sessions_count || 0} session(s) today
            </div>
          </div>
        </div>

        {/* Utilization Bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-base-content/70">
            <span>Utilization</span>
            <span className="font-bold text-base-content">{machine.utilization_percentage}%</span>
          </div>
          <div className="w-full bg-base-300/60 rounded-full h-2 overflow-hidden">
            <div
              className={`h-2 rounded-full transition-all duration-300 ${
                machine.utilization_percentage > 85
                  ? 'bg-success'
                  : machine.utilization_percentage > 50
                  ? 'bg-primary'
                  : 'bg-warning'
              }`}
              style={{ width: `${Math.min(100, machine.utilization_percentage)}%` }}
            ></div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="pt-1">
          {isRunning ? (
            <button
              onClick={() => onStop(machine)}
              disabled={actionLoading}
              className="btn btn-error btn-block text-white font-bold gap-2 shadow-sm hover:shadow-error/20"
            >
              <span>⏹</span>
              <span>STOP MACHINE</span>
            </button>
          ) : (
            <button
              onClick={() => onStart(machine)}
              disabled={actionLoading}
              className="btn btn-success btn-block text-white font-bold gap-2 shadow-sm hover:shadow-success/20"
            >
              {actionLoading ? (
                <>
                  <span className="loading loading-spinner loading-xs"></span>
                  <span>Starting...</span>
                </>
              ) : (
                <>
                  <span>▶</span>
                  <span>START MACHINE</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Timer;
