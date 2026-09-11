import express from 'express';
import pool from '../config/db.js';

const router = express.Router();

// Valid stop reasons
export const STOP_REASONS = [
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

// Helper: Get current IST Date and DateTime
function getISTDateAndDateTime() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const ist = new Date(now.getTime() + (330 + offset) * 60000);
  
  const yyyy = ist.getFullYear();
  const mm = String(ist.getMonth() + 1).padStart(2, '0');
  const dd = String(ist.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}-${mm}-${dd}`;

  const hh = String(ist.getHours()).padStart(2, '0');
  const mi = String(ist.getMinutes()).padStart(2, '0');
  const ss = String(ist.getSeconds()).padStart(2, '0');
  const dateTimeStr = `${dateStr} ${hh}:${mi}:${ss}`;

  return { dateStr, dateTimeStr, istDate: ist };
}

// Helper: format seconds to "Xh Ym" or "Xh Ym Zs"
function formatDuration(seconds, includeSeconds = false) {
  const totalSecs = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;

  if (includeSeconds) {
    return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  }
  return `${h}h ${m}m`;
}

// Helper: calculate available working seconds from TIME strings (e.g. '08:00:00', '18:00:00')
function calculateAvailableSeconds(startTimeStr, endTimeStr) {
  if (!startTimeStr || !endTimeStr) return 8 * 3600; // default 8 hours

  const [sh, sm, ss] = startTimeStr.split(':').map(Number);
  const [eh, em, es] = endTimeStr.split(':').map(Number);

  let startSec = (sh || 0) * 3600 + (sm || 0) * 60 + (ss || 0);
  let endSec = (eh || 0) * 3600 + (em || 0) * 60 + (es || 0);

  if (endSec >= startSec) {
    return endSec - startSec;
  }
  // Overnight shift
  return (24 * 3600 - startSec) + endSec;
}

// ─────────────────────────────────────────────────────────────────
// GET /api/timer/machines
// List all active machines
// ─────────────────────────────────────────────────────────────────
router.get('/machines', async (req, res) => {
  try {
    const [machines] = await pool.query(
      'SELECT id, machine_name, machine_type, working_start_time, working_end_time, active, created_at, updated_at FROM machines WHERE active = 1 ORDER BY machine_type ASC, id ASC'
    );
    res.json({ ok: true, data: machines });
  } catch (error) {
    console.error('Error fetching machines:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch machines.' });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/timer/status
// Real-time status of all machines for today
// ─────────────────────────────────────────────────────────────────
router.get('/status', async (req, res) => {
  try {
    const { dateStr, dateTimeStr, istDate } = getISTDateAndDateTime();
    const nowTimestamp = istDate.getTime();

    // 1. Fetch active machines
    const [machines] = await pool.query(
      'SELECT id, machine_name, machine_type, working_start_time, working_end_time, active FROM machines WHERE active = 1 ORDER BY machine_type ASC, id ASC'
    );

    // 2. Fetch today's sessions for all machines
    const [sessions] = await pool.query(
      'SELECT * FROM machine_sessions WHERE session_date = ? ORDER BY start_time ASC',
      [dateStr]
    );

    // Also check if any machine has an open RUNNING session from earlier dates (in case of cross-midnight session)
    const [openSessions] = await pool.query(
      'SELECT * FROM machine_sessions WHERE status = "RUNNING" AND session_date != ?',
      [dateStr]
    );

    const openSessionMap = new Map();
    for (const s of openSessions) {
      openSessionMap.set(s.machine_id, s);
    }

    const machineStatusList = machines.map((m) => {
      // Find sessions for this machine today
      const machSessions = sessions.filter((s) => s.machine_id === m.id);
      
      // Check if machine is currently running (either in today's sessions or open previous session)
      let activeSession = machSessions.find((s) => s.status === 'RUNNING') || openSessionMap.get(m.id) || null;

      let currentRunSeconds = 0;
      let startedAtFormatted = null;

      if (activeSession) {
        const sessionStartTime = new Date(activeSession.start_time).getTime();
        currentRunSeconds = Math.max(0, Math.floor((nowTimestamp - sessionStartTime) / 1000));
        
        // Format start time in HH:MM AM/PM
        const st = new Date(activeSession.start_time);
        startedAtFormatted = st.toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
          timeZone: 'Asia/Kolkata'
        });
      }

      // Sum completed sessions duration for today
      let todayCompletedSeconds = machSessions.reduce((acc, s) => {
        if (s.status === 'STOPPED') {
          return acc + (Number(s.duration_seconds) || 0);
        }
        return acc;
      }, 0);

      // Total running seconds = completed + current running session
      let todayTotalRunningSeconds = todayCompletedSeconds + currentRunSeconds;

      // Available working seconds
      const availableSeconds = calculateAvailableSeconds(m.working_start_time, m.working_end_time);
      const availableHours = (availableSeconds / 3600).toFixed(1);

      // Stopped seconds = available minus running
      const stoppedSeconds = Math.max(0, availableSeconds - todayTotalRunningSeconds);

      // Utilization percentage
      const utilization = availableSeconds > 0
        ? Math.min(100, (todayTotalRunningSeconds / availableSeconds) * 100).toFixed(1)
        : '0.0';

      return {
        id: m.id,
        machine_name: m.machine_name,
        machine_type: m.machine_type,
        working_start_time: m.working_start_time,
        working_end_time: m.working_end_time,
        status: activeSession ? 'RUNNING' : 'STOPPED',
        active_session: activeSession
          ? {
              id: activeSession.id,
              start_time: activeSession.start_time,
              started_at_formatted: startedAtFormatted,
              current_run_seconds: currentRunSeconds,
              current_run_formatted: formatDuration(currentRunSeconds, true),
              created_by: activeSession.created_by
            }
          : null,
        today_completed_seconds: todayCompletedSeconds,
        today_total_running_seconds: todayTotalRunningSeconds,
        today_running_formatted: formatDuration(todayTotalRunningSeconds, false),
        today_running_precise_formatted: formatDuration(todayTotalRunningSeconds, true),
        available_seconds: availableSeconds,
        available_hours: `${availableHours}h`,
        stopped_seconds: stoppedSeconds,
        stopped_formatted: formatDuration(stoppedSeconds, false),
        utilization_percentage: parseFloat(utilization),
        sessions_count: machSessions.length
      };
    });

    // Summary calculation across all machines
    const totalRunningMachines = machineStatusList.filter((m) => m.status === 'RUNNING').length;
    const totalTodayRunningSeconds = machineStatusList.reduce((acc, m) => acc + m.today_total_running_seconds, 0);
    const totalAvailableSeconds = machineStatusList.reduce((acc, m) => acc + m.available_seconds, 0);
    const overallUtilization = totalAvailableSeconds > 0
      ? ((totalTodayRunningSeconds / totalAvailableSeconds) * 100).toFixed(1)
      : '0.0';

    res.json({
      ok: true,
      current_date: dateStr,
      server_time: dateTimeStr,
      summary: {
        total_machines: machines.length,
        running_machines: totalRunningMachines,
        stopped_machines: machines.length - totalRunningMachines,
        total_running_formatted: formatDuration(totalTodayRunningSeconds, false),
        total_running_seconds: totalTodayRunningSeconds,
        overall_utilization: parseFloat(overallUtilization)
      },
      machines: machineStatusList
    });
  } catch (error) {
    console.error('Error fetching timer status:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch timer status.' });
  }
});

// ─────────────────────────────────────────────────────────────────
// POST /api/timer/:machineId/start
// Start running session for a machine
// ─────────────────────────────────────────────────────────────────
router.post('/:machineId/start', async (req, res) => {
  const { machineId } = req.params;

  try {
    // 1. Verify machine exists and is active
    const [machineRows] = await pool.query(
      'SELECT id, machine_name, active FROM machines WHERE id = ?',
      [machineId]
    );

    if (machineRows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Machine not found.' });
    }

    if (!machineRows[0].active) {
      return res.status(400).json({ ok: false, error: 'Machine is inactive.' });
    }

    // 2. Check if already RUNNING (prevent duplicate start)
    const [activeRows] = await pool.query(
      'SELECT id, start_time FROM machine_sessions WHERE machine_id = ? AND status = "RUNNING"',
      [machineId]
    );

    if (activeRows.length > 0) {
      return res.status(400).json({
        ok: false,
        error: `Machine is already running (Session ID: ${activeRows[0].id}).`
      });
    }

    // 3. Insert new session with server timestamp
    const { dateStr, dateTimeStr } = getISTDateAndDateTime();
    const createdBy = req.admin?.name || req.admin?.username || 'Operator';

    const [result] = await pool.query(
      `INSERT INTO machine_sessions (machine_id, session_date, start_time, status, created_by)
       VALUES (?, ?, ?, 'RUNNING', ?)`,
      [machineId, dateStr, dateTimeStr, createdBy]
    );

    res.status(201).json({
      ok: true,
      message: `${machineRows[0].machine_name} started successfully.`,
      session: {
        id: result.insertId,
        machine_id: machineId,
        machine_name: machineRows[0].machine_name,
        session_date: dateStr,
        start_time: dateTimeStr,
        status: 'RUNNING',
        created_by: createdBy
      }
    });
  } catch (error) {
    console.error('Error starting machine session:', error);
    res.status(500).json({ ok: false, error: 'Failed to start machine session.' });
  }
});

// ─────────────────────────────────────────────────────────────────
// POST /api/timer/:machineId/stop
// Stop running session for a machine with reason
// ─────────────────────────────────────────────────────────────────
router.post('/:machineId/stop', async (req, res) => {
  const { machineId } = req.params;
  const { stop_reason, notes } = req.body;

  if (!stop_reason || typeof stop_reason !== 'string' || !stop_reason.trim()) {
    return res.status(400).json({
      ok: false,
      error: 'Stop reason is required.'
    });
  }

  try {
    // 1. Verify machine exists
    const [machineRows] = await pool.query(
      'SELECT id, machine_name FROM machines WHERE id = ?',
      [machineId]
    );

    if (machineRows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Machine not found.' });
    }

    // 2. Find active session
    const [activeRows] = await pool.query(
      'SELECT id, start_time, session_date FROM machine_sessions WHERE machine_id = ? AND status = "RUNNING" ORDER BY id DESC LIMIT 1',
      [machineId]
    );

    if (activeRows.length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'Machine is not running or has no active session.'
      });
    }

    const session = activeRows[0];
    const { dateTimeStr, istDate } = getISTDateAndDateTime();
    const stopTimestamp = istDate.getTime();
    const startTimestamp = new Date(session.start_time).getTime();

    // Duration in seconds (guarantee >= 0)
    const durationSeconds = Math.max(0, Math.floor((stopTimestamp - startTimestamp) / 1000));

    // 3. Update session to STOPPED
    await pool.query(
      `UPDATE machine_sessions 
       SET stop_time = ?, duration_seconds = ?, status = 'STOPPED', stop_reason = ?, notes = ?
       WHERE id = ?`,
      [dateTimeStr, durationSeconds, stop_reason.trim(), notes?.trim() || null, session.id]
    );

    res.json({
      ok: true,
      message: `${machineRows[0].machine_name} stopped successfully.`,
      session: {
        id: session.id,
        machine_id: machineId,
        machine_name: machineRows[0].machine_name,
        start_time: session.start_time,
        stop_time: dateTimeStr,
        duration_seconds: durationSeconds,
        duration_formatted: formatDuration(durationSeconds, true),
        stop_reason: stop_reason.trim(),
        notes: notes?.trim() || null,
        status: 'STOPPED'
      }
    });
  } catch (error) {
    console.error('Error stopping machine session:', error);
    res.status(500).json({ ok: false, error: 'Failed to stop machine session.' });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/timer/history
// Daily history with date selector and session details
// ─────────────────────────────────────────────────────────────────
router.get('/history', async (req, res) => {
  try {
    const { dateStr } = getISTDateAndDateTime();
    const queryDate = req.query.date || dateStr;

    // 1. Fetch all machines
    const [machines] = await pool.query(
      'SELECT id, machine_name, machine_type, working_start_time, working_end_time FROM machines ORDER BY machine_type ASC, id ASC'
    );

    // 2. Fetch all sessions for selected date
    const [sessions] = await pool.query(
      `SELECT ms.*, m.machine_name, m.machine_type
       FROM machine_sessions ms
       JOIN machines m ON ms.machine_id = m.id
       WHERE ms.session_date = ?
       ORDER BY ms.machine_id ASC, ms.start_time ASC`,
      [queryDate]
    );

    // Group sessions by machine
    const machineReports = machines.map((m) => {
      const machSessions = sessions.filter((s) => s.machine_id === m.id);

      const totalRunningSeconds = machSessions.reduce((acc, s) => {
        return acc + (Number(s.duration_seconds) || 0);
      }, 0);

      const availableSeconds = calculateAvailableSeconds(m.working_start_time, m.working_end_time);
      const stoppedSeconds = Math.max(0, availableSeconds - totalRunningSeconds);
      const utilization = availableSeconds > 0
        ? Math.min(100, (totalRunningSeconds / availableSeconds) * 100).toFixed(1)
        : '0.0';

      const formattedSessions = machSessions.map((s) => {
        const st = new Date(s.start_time);
        const et = s.stop_time ? new Date(s.stop_time) : null;

        const startFormatted = st.toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
          timeZone: 'Asia/Kolkata'
        });

        const stopFormatted = et
          ? et.toLocaleTimeString('en-IN', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: true,
              timeZone: 'Asia/Kolkata'
            })
          : 'In Progress';

        return {
          id: s.id,
          machine_id: s.machine_id,
          start_time: s.start_time,
          start_formatted: startFormatted,
          stop_time: s.stop_time,
          stop_formatted: stopFormatted,
          duration_seconds: s.duration_seconds,
          duration_formatted: formatDuration(s.duration_seconds, false),
          duration_detailed: formatDuration(s.duration_seconds, true),
          status: s.status,
          stop_reason: s.stop_reason || '-',
          notes: s.notes || '-',
          created_by: s.created_by || '-'
        };
      });

      return {
        id: m.id,
        machine_name: m.machine_name,
        machine_type: m.machine_type,
        working_start_time: m.working_start_time,
        working_end_time: m.working_end_time,
        total_running_seconds: totalRunningSeconds,
        total_running_formatted: formatDuration(totalRunningSeconds, false),
        available_seconds: availableSeconds,
        available_hours: `${(availableSeconds / 3600).toFixed(1)}h`,
        stopped_seconds: stoppedSeconds,
        stopped_formatted: formatDuration(stoppedSeconds, false),
        utilization_percentage: parseFloat(utilization),
        sessions_count: machSessions.length,
        sessions: formattedSessions
      };
    });

    const grandTotalRunningSecs = machineReports.reduce((acc, m) => acc + m.total_running_seconds, 0);
    const grandAvailableSecs = machineReports.reduce((acc, m) => acc + m.available_seconds, 0);
    const grandAvgUtilization = grandAvailableSecs > 0
      ? ((grandTotalRunningSecs / grandAvailableSecs) * 100).toFixed(1)
      : '0.0';

    res.json({
      ok: true,
      query_date: queryDate,
      summary: {
        total_machines: machines.length,
        total_running_seconds: grandTotalRunningSecs,
        total_running_formatted: formatDuration(grandTotalRunningSecs, false),
        overall_utilization: parseFloat(grandAvgUtilization)
      },
      machines: machineReports,
      all_sessions: sessions
    });
  } catch (error) {
    console.error('Error fetching timer history:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch timer history.' });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/timer/machine/:machineId
// Single machine details and today's session summary
// ─────────────────────────────────────────────────────────────────
router.get('/machine/:machineId', async (req, res) => {
  const { machineId } = req.params;
  try {
    const [machineRows] = await pool.query(
      'SELECT * FROM machines WHERE id = ?',
      [machineId]
    );

    if (machineRows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Machine not found.' });
    }

    const { dateStr } = getISTDateAndDateTime();
    const [sessions] = await pool.query(
      'SELECT * FROM machine_sessions WHERE machine_id = ? AND session_date = ? ORDER BY start_time DESC',
      [machineId, dateStr]
    );

    res.json({
      ok: true,
      machine: machineRows[0],
      today_sessions: sessions
    });
  } catch (error) {
    console.error('Error fetching machine details:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch machine details.' });
  }
});

// ─────────────────────────────────────────────────────────────────
// PUT /api/timer/machine/:machineId
// Update machine name, shift timing, and configuration
// ─────────────────────────────────────────────────────────────────
router.put('/machine/:machineId', async (req, res) => {
  const { machineId } = req.params;
  let { machine_name, machine_type, working_start_time, working_end_time, active } = req.body;

  if (!machine_name || typeof machine_name !== 'string' || !machine_name.trim()) {
    return res.status(400).json({ ok: false, error: 'Machine name is required.' });
  }

  // Format times to HH:MM:SS if needed
  if (working_start_time && working_start_time.length === 5) {
    working_start_time = `${working_start_time}:00`;
  }
  if (working_end_time && working_end_time.length === 5) {
    working_end_time = `${working_end_time}:00`;
  }

  try {
    const [existing] = await pool.query('SELECT * FROM machines WHERE id = ?', [machineId]);
    if (existing.length === 0) {
      return res.status(404).json({ ok: false, error: 'Machine not found.' });
    }

    const current = existing[0];
    const newName = machine_name.trim();
    const newType = machine_type || current.machine_type;
    const newStartTime = working_start_time || current.working_start_time;
    const newEndTime = working_end_time || current.working_end_time;
    const newActive = active !== undefined ? (active ? 1 : 0) : current.active;

    await pool.query(
      `UPDATE machines 
       SET machine_name = ?, machine_type = ?, working_start_time = ?, working_end_time = ?, active = ?
       WHERE id = ?`,
      [newName, newType, newStartTime, newEndTime, newActive, machineId]
    );

    res.json({
      ok: true,
      message: 'Machine configuration updated successfully.',
      machine: {
        id: machineId,
        machine_name: newName,
        machine_type: newType,
        working_start_time: newStartTime,
        working_end_time: newEndTime,
        active: newActive
      }
    });
  } catch (error) {
    console.error('Error updating machine configuration:', error);
    res.status(500).json({ ok: false, error: 'Failed to update machine configuration.' });
  }
});

// ─────────────────────────────────────────────────────────────────
// POST /api/timer/machines
// Add a new machine (Master Configuration)
// ─────────────────────────────────────────────────────────────────
router.post('/machines', async (req, res) => {
  let { id, machine_name, machine_type, working_start_time, working_end_time } = req.body;

  if (!machine_name || typeof machine_name !== 'string' || !machine_name.trim()) {
    return res.status(400).json({ ok: false, error: 'Machine name is required.' });
  }

  if (!id || typeof id !== 'string' || !id.trim()) {
    // Generate an ID if not provided
    const prefix = machine_type === 'Production' ? 'PROD' : 'PET';
    id = `${prefix}-${Date.now().toString().slice(-4)}`;
  } else {
    id = id.trim().toUpperCase();
  }

  if (working_start_time && working_start_time.length === 5) {
    working_start_time = `${working_start_time}:00`;
  }
  if (working_end_time && working_end_time.length === 5) {
    working_end_time = `${working_end_time}:00`;
  }

  try {
    const [existing] = await pool.query('SELECT id FROM machines WHERE id = ?', [id]);
    if (existing.length > 0) {
      return res.status(400).json({ ok: false, error: `Machine ID '${id}' already exists.` });
    }

    await pool.query(
      `INSERT INTO machines (id, machine_name, machine_type, working_start_time, working_end_time, active)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [
        id,
        machine_name.trim(),
        machine_type || 'Production',
        working_start_time || '08:00:00',
        working_end_time || '18:00:00'
      ]
    );

    res.status(201).json({
      ok: true,
      message: 'New machine created successfully.',
      machine: {
        id,
        machine_name: machine_name.trim(),
        machine_type: machine_type || 'Production',
        working_start_time: working_start_time || '08:00:00',
        working_end_time: working_end_time || '18:00:00',
        active: 1
      }
    });
  } catch (error) {
    console.error('Error creating machine:', error);
    res.status(500).json({ ok: false, error: 'Failed to create machine.' });
  }
});

export default router;
