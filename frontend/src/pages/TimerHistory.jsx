import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';

function getTodayDateStr() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const ist = new Date(now.getTime() + (330 + offset) * 60000);
  const yyyy = ist.getFullYear();
  const mm = String(ist.getMonth() + 1).padStart(2, '0');
  const dd = String(ist.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

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

const TimerHistory = () => {
  const navigate = useNavigate();

  const [selectedDate, setSelectedDate] = useState(getTodayDateStr());
  const [loading, setLoading] = useState(true);
  const [historyData, setHistoryData] = useState({ machines: [], summary: null });
  const [expandedMachineId, setExpandedMachineId] = useState(null);
  const [activeTab, setActiveTab] = useState('ALL'); // 'ALL', 'Production', 'PET Bottle'

  useEffect(() => {
    fetchHistory(selectedDate);
  }, [selectedDate]);

  const fetchHistory = async (date) => {
    setLoading(true);
    try {
      const res = await api.get(`/timer/history?date=${date}`);
      if (res.data.ok) {
        setHistoryData({
          machines: res.data.machines || [],
          summary: res.data.summary || null
        });
      }
    } catch (err) {
      console.error('Failed to fetch timer history:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredMachines = historyData.machines.filter((m) => {
    if (activeTab === 'Production') return m.machine_type === 'Production';
    if (activeTab === 'PET Bottle') return m.machine_type === 'PET Bottle';
    return true;
  });

  const toggleExpand = (machineId) => {
    setExpandedMachineId((prev) => (prev === machineId ? null : machineId));
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-base-100 p-5 rounded-2xl shadow-sm border border-base-300">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/timer')}
            className="btn btn-sm btn-ghost btn-circle border border-base-300"
            title="Back to Timer Dashboard"
          >
            ←
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">📜</span>
              <h1 className="text-2xl font-bold tracking-tight text-base-content">Machine Timer History</h1>
            </div>
            <p className="text-xs text-base-content/70">
              Review daily machine running sessions, durations, and downtime stop reasons
            </p>
          </div>
        </div>

        {/* Date Selector & Controls */}
        <div className="flex items-center flex-wrap gap-2.5">
          <div className="flex items-center gap-2 bg-base-200/80 px-3 py-1.5 rounded-xl border border-base-300">
            <span className="text-xs font-bold text-base-content/70 uppercase">Select Date:</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="input input-sm input-ghost font-semibold text-sm focus:outline-none"
            />
          </div>

          <button
            onClick={() => setSelectedDate(getTodayDateStr())}
            className="btn btn-sm btn-outline border-base-300 text-xs"
          >
            Today
          </button>

          <button
            onClick={() => fetchHistory(selectedDate)}
            disabled={loading}
            className="btn btn-sm btn-primary text-xs gap-1"
          >
            <span>🔄</span>
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Banner */}
      {historyData.summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-base-100 border border-base-300 rounded-2xl p-4 shadow-sm flex items-center justify-between">
            <div>
              <div className="text-xs font-medium text-base-content/70">Total Running Hours</div>
              <div className="text-2xl font-black text-primary mt-0.5">
                {historyData.summary.total_running_formatted || '0h 0m'}
              </div>
              <div className="text-[11px] text-base-content/60 mt-0.5">On {selectedDate}</div>
            </div>
            <span className="text-3xl p-3 bg-primary/10 text-primary rounded-2xl">⏳</span>
          </div>

          <div className="bg-base-100 border border-base-300 rounded-2xl p-4 shadow-sm flex items-center justify-between">
            <div>
              <div className="text-xs font-medium text-base-content/70">Overall Plant Utilization</div>
              <div className="text-2xl font-black text-info mt-0.5">
                {historyData.summary.overall_utilization}%
              </div>
              <div className="text-[11px] text-base-content/60 mt-0.5">Across {historyData.summary.total_machines} machines</div>
            </div>
            <span className="text-3xl p-3 bg-info/10 text-info rounded-2xl">📊</span>
          </div>

          <div className="bg-base-100 border border-base-300 rounded-2xl p-4 shadow-sm flex items-center justify-between">
            <div>
              <div className="text-xs font-medium text-base-content/70">Total Sessions Recorded</div>
              <div className="text-2xl font-black text-success mt-0.5">
                {historyData.machines.reduce((acc, m) => acc + (m.sessions_count || 0), 0)}
              </div>
              <div className="text-[11px] text-base-content/60 mt-0.5">Start / Stop cycles</div>
            </div>
            <span className="text-3xl p-3 bg-success/10 text-success rounded-2xl">⚡</span>
          </div>
        </div>
      )}

      {/* Category Tabs */}
      <div className="flex gap-2 border-b border-base-300 pb-2">
        <button
          onClick={() => setActiveTab('ALL')}
          className={`btn btn-sm ${
            activeTab === 'ALL' ? 'btn-neutral' : 'btn-ghost'
          } rounded-xl text-xs font-bold`}
        >
          All Machines ({historyData.machines.length})
        </button>
        <button
          onClick={() => setActiveTab('Production')}
          className={`btn btn-sm ${
            activeTab === 'Production' ? 'btn-neutral' : 'btn-ghost'
          } rounded-xl text-xs font-bold`}
        >
          🏭 Production
        </button>
        <button
          onClick={() => setActiveTab('PET Bottle')}
          className={`btn btn-sm ${
            activeTab === 'PET Bottle' ? 'btn-neutral' : 'btn-ghost'
          } rounded-xl text-xs font-bold`}
        >
          🍾 PET Bottle
        </button>
      </div>

      {/* Machine Breakdown & Detailed Sessions */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-12 bg-base-100 rounded-2xl border border-base-300">
          <span className="loading loading-spinner loading-lg text-primary"></span>
          <p className="text-sm text-base-content/60 mt-3 font-medium">Loading history records...</p>
        </div>
      ) : filteredMachines.length === 0 ? (
        <div className="bg-base-100 border border-base-300 rounded-2xl p-8 text-center text-base-content/60">
          No machine records found for the selected date.
        </div>
      ) : (
        <div className="space-y-4">
          {filteredMachines.map((m) => {
            const isExpanded = expandedMachineId === m.id;
            const hasSessions = m.sessions && m.sessions.length > 0;

            return (
              <div
                key={m.id}
                className="bg-base-100 border border-base-300 rounded-2xl shadow-sm overflow-hidden transition-all duration-150"
              >
                {/* Machine Summary Row */}
                <div
                  onClick={() => toggleExpand(m.id)}
                  className="p-4 md:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:bg-base-200/50 select-none"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">
                      {m.machine_type === 'Production' ? '🏭' : '🍾'}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-base text-base-content">{m.machine_name}</h3>
                        <span className="badge badge-xs badge-outline font-mono text-[10px] opacity-70">
                          {m.id}
                        </span>
                        <span className="badge badge-sm badge-ghost text-xs">
                          {m.machine_type}
                        </span>
                      </div>
                      <p className="text-xs text-base-content/60 mt-0.5">
                        Shift: {formatTimeOnly(m.working_start_time)} - {formatTimeOnly(m.working_end_time)} ({m.available_hours} Available)
                      </p>
                    </div>
                  </div>

                  {/* Machine Metrics Pill */}
                  <div className="flex items-center flex-wrap gap-4 md:gap-6 text-sm">
                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-base-content/60 font-medium">
                        Running Hours
                      </div>
                      <div className="font-bold text-primary font-mono text-base">
                        {m.total_running_formatted || '0h 0m'}
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-base-content/60 font-medium">
                        Stopped Hours
                      </div>
                      <div className="font-semibold text-base-content/80 font-mono text-sm">
                        {m.stopped_formatted || '0h 0m'}
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-base-content/60 font-medium">
                        Utilization
                      </div>
                      <div className="font-bold text-base-content font-mono text-sm">
                        {m.utilization_percentage}%
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="badge badge-sm badge-neutral font-mono">
                        {m.sessions_count || 0} session(s)
                      </span>
                      <span className="text-xs text-base-content/60">
                        {isExpanded ? '▲ Hide' : '▼ Details'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Expanded Session Logs */}
                {isExpanded && (
                  <div className="border-t border-base-200 bg-base-200/30 p-4 md:p-5 space-y-3">
                    <div className="flex items-center justify-between pb-1">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-base-content/80">
                        Detailed Running Sessions ({m.machine_name} - {selectedDate})
                      </h4>
                      <span className="text-xs text-base-content/60 font-medium">
                        Total Running Time: <strong className="text-primary">{m.total_running_formatted}</strong>
                      </span>
                    </div>

                    {!hasSessions ? (
                      <div className="text-xs text-base-content/50 italic py-3 text-center bg-base-100 rounded-xl border border-dashed border-base-300">
                        No running sessions recorded for this machine on {selectedDate}.
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-base-300 bg-base-100 shadow-sm">
                        <table className="table table-xs md:table-sm w-full">
                          <thead className="bg-base-200/80 text-base-content/70">
                            <tr>
                              <th className="w-12">#</th>
                              <th>Start Time</th>
                              <th>Stop Time</th>
                              <th>Duration</th>
                              <th>Status</th>
                              <th>Stop Reason</th>
                              <th>Notes</th>
                              <th>Operator</th>
                            </tr>
                          </thead>
                          <tbody>
                            {m.sessions.map((s, idx) => (
                              <tr key={s.id || idx} className="hover:bg-base-200/40">
                                <td className="font-mono text-xs opacity-70">{idx + 1}</td>
                                <td className="font-semibold text-base-content">
                                  {s.start_formatted}
                                </td>
                                <td className="font-semibold text-base-content">
                                  {s.stop_formatted}
                                </td>
                                <td className="font-mono font-bold text-primary">
                                  {s.duration_formatted}
                                </td>
                                <td>
                                  {s.status === 'RUNNING' ? (
                                    <span className="badge badge-xs badge-success text-[10px] font-bold">
                                      RUNNING
                                    </span>
                                  ) : (
                                    <span className="badge badge-xs badge-ghost text-[10px] font-medium">
                                      COMPLETED
                                    </span>
                                  )}
                                </td>
                                <td>
                                  {s.stop_reason !== '-' ? (
                                    <span className="badge badge-sm badge-outline text-xs">
                                      {s.stop_reason}
                                    </span>
                                  ) : (
                                    <span className="text-base-content/40">-</span>
                                  )}
                                </td>
                                <td className="text-xs text-base-content/70 max-w-xs truncate">
                                  {s.notes}
                                </td>
                                <td className="text-xs text-base-content/70">
                                  {s.created_by}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TimerHistory;
