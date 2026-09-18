import express from 'express';
import pool from '../config/db.js';

const router = express.Router();

// Auto-initialize imp_work_tasks table if not exists
const initTable = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS imp_work_tasks (
        id VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT NULL,
        assigned_to VARCHAR(150) NOT NULL,
        assigned_by VARCHAR(150) NOT NULL,
        priority ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT') DEFAULT 'HIGH',
        category VARCHAR(100) DEFAULT 'General',
        due_date DATE NULL,
        status ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED') DEFAULT 'PENDING',
        completed_at DATETIME NULL,
        completed_by VARCHAR(150) NULL,
        completed_notes TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_iwt_status (status),
        INDEX idx_iwt_priority (priority),
        INDEX idx_iwt_due_date (due_date),
        INDEX idx_iwt_assigned_to (assigned_to)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  } catch (err) {
    console.error('Failed to initialize imp_work_tasks table:', err);
  }
};
initTable();

// Helper to get current IST date string
function getISTDateStr() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const istDate = new Date(now.getTime() + (330 + offset) * 60000);
  const yyyy = istDate.getFullYear();
  const mm = String(istDate.getMonth() + 1).padStart(2, '0');
  const dd = String(istDate.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Generate unique task ID: IMP-YYYY-XXXXX
async function generateTaskId() {
  const yyyy = new Date().getFullYear();
  const prefix = `IMP-${yyyy}-`;
  
  const [rows] = await pool.query(
    'SELECT id FROM imp_work_tasks WHERE id LIKE ? ORDER BY id DESC LIMIT 1',
    [`${prefix}%`]
  );

  if (rows.length === 0) {
    return `${prefix}0001`;
  }

  const lastId = rows[0].id;
  const numPart = parseInt(lastId.replace(prefix, ''), 10);
  const nextNum = isNaN(numPart) ? 1 : numPart + 1;
  return `${prefix}${String(nextNum).padStart(4, '0')}`;
}

// GET /api/imp-work/stats - Summary statistics
router.get('/stats', async (req, res) => {
  try {
    const today = getISTDateStr();

    const [rows] = await pool.query(`
      SELECT 
        COUNT(CASE WHEN status IN ('PENDING', 'IN_PROGRESS') THEN 1 END) AS active_count,
        COUNT(CASE WHEN status IN ('PENDING', 'IN_PROGRESS') AND priority = 'URGENT' THEN 1 END) AS urgent_count,
        COUNT(CASE WHEN status IN ('PENDING', 'IN_PROGRESS') AND priority = 'HIGH' THEN 1 END) AS high_count,
        COUNT(CASE WHEN status = 'IN_PROGRESS' THEN 1 END) AS in_progress_count,
        COUNT(CASE WHEN status IN ('PENDING', 'IN_PROGRESS') AND due_date = ? THEN 1 END) AS due_today_count,
        COUNT(CASE WHEN status IN ('PENDING', 'IN_PROGRESS') AND due_date < ? THEN 1 END) AS overdue_count,
        COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) AS completed_count
      FROM imp_work_tasks
    `, [today, today]);

    const stats = rows[0] || {
      active_count: 0,
      urgent_count: 0,
      high_count: 0,
      in_progress_count: 0,
      due_today_count: 0,
      overdue_count: 0,
      completed_count: 0
    };

    res.json({ ok: true, stats });
  } catch (error) {
    console.error('Error fetching imp work stats:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch task statistics' });
  }
});

// GET /api/imp-work/tasks - Fetch tasks list with filtering
router.get('/tasks', async (req, res) => {
  try {
    const {
      tab = 'active', // 'active' | 'history' | 'all'
      status,
      priority,
      category,
      search,
      startDate,
      endDate,
      assignedTo
    } = req.query;

    const conditions = [];
    const params = [];

    if (tab === 'active') {
      if (status) {
        conditions.push('status = ?');
        params.push(status);
      } else {
        conditions.push("status IN ('PENDING', 'IN_PROGRESS')");
      }
    } else if (tab === 'history') {
      if (status) {
        conditions.push('status = ?');
        params.push(status);
      } else {
        conditions.push("status IN ('COMPLETED', 'CANCELLED')");
      }
    } else if (status) {
      conditions.push('status = ?');
      params.push(status);
    }

    if (priority) {
      conditions.push('priority = ?');
      params.push(priority);
    }

    if (category) {
      conditions.push('category = ?');
      params.push(category);
    }

    if (assignedTo) {
      conditions.push('assigned_to LIKE ?');
      params.push(`%${assignedTo.trim()}%`);
    }

    if (startDate) {
      if (tab === 'history') {
        conditions.push('DATE(completed_at) >= ?');
      } else {
        conditions.push('DATE(created_at) >= ?');
      }
      params.push(startDate);
    }

    if (endDate) {
      if (tab === 'history') {
        conditions.push('DATE(completed_at) <= ?');
      } else {
        conditions.push('DATE(created_at) <= ?');
      }
      params.push(endDate);
    }

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      conditions.push(`(
        id LIKE ? OR 
        title LIKE ? OR 
        description LIKE ? OR 
        assigned_to LIKE ? OR 
        assigned_by LIKE ? OR 
        completed_by LIKE ? OR 
        completed_notes LIKE ?
      )`);
      params.push(q, q, q, q, q, q, q);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    let orderBy = "FIELD(priority, 'URGENT', 'HIGH', 'MEDIUM', 'LOW'), due_date ASC, created_at DESC";
    if (tab === 'history') {
      orderBy = 'completed_at DESC, updated_at DESC';
    }

    const query = `
      SELECT 
        id,
        title,
        description,
        assigned_to,
        assigned_by,
        priority,
        category,
        DATE_FORMAT(due_date, '%Y-%m-%d') AS due_date,
        status,
        DATE_FORMAT(completed_at, '%Y-%m-%d %H:%i:%s') AS completed_at,
        completed_by,
        completed_notes,
        DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
        DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
      FROM imp_work_tasks
      ${whereClause}
      ORDER BY ${orderBy}
    `;

    const [tasks] = await pool.query(query, params);
    res.json({ ok: true, tasks });
  } catch (error) {
    console.error('Error fetching imp work tasks:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch tasks' });
  }
});

// POST /api/imp-work/tasks - Create a new task
router.post('/tasks', async (req, res) => {
  try {
    const {
      title,
      description = '',
      assigned_to,
      assigned_by,
      priority = 'HIGH',
      category = 'General',
      due_date = null
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ ok: false, error: 'Task title is required' });
    }

    if (!assigned_to || !assigned_to.trim()) {
      return res.status(400).json({ ok: false, error: 'Assigned To is required' });
    }

    const validPriorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
    const safePriority = validPriorities.includes(priority?.toUpperCase()) ? priority.toUpperCase() : 'HIGH';

    const fallbackAssignedBy = req.user?.username || req.user?.name || 'Admin';
    const safeAssignedBy = (assigned_by && assigned_by.trim()) ? assigned_by.trim() : fallbackAssignedBy;

    const id = await generateTaskId();

    const insertQuery = `
      INSERT INTO imp_work_tasks (
        id, title, description, assigned_to, assigned_by, priority, category, due_date, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
    `;

    await pool.query(insertQuery, [
      id,
      title.trim(),
      description ? description.trim() : null,
      assigned_to.trim(),
      safeAssignedBy,
      safePriority,
      (category && category.trim()) ? category.trim() : 'General',
      due_date || null
    ]);

    const [createdRows] = await pool.query(
      `SELECT id, title, description, assigned_to, assigned_by, priority, category, 
              DATE_FORMAT(due_date, '%Y-%m-%d') AS due_date, status, 
              DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at 
       FROM imp_work_tasks WHERE id = ?`,
      [id]
    );

    res.status(201).json({
      ok: true,
      message: 'Task created successfully',
      task: createdRows[0]
    });
  } catch (error) {
    console.error('Error creating imp work task:', error);
    res.status(500).json({ ok: false, error: 'Failed to create task' });
  }
});

// PUT /api/imp-work/tasks/:id - Update task details
router.put('/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      assigned_to,
      assigned_by,
      priority,
      category,
      due_date
    } = req.body;

    const [existing] = await pool.query('SELECT * FROM imp_work_tasks WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(400).json({ ok: false, error: 'Task not found' });
    }

    const validPriorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
    const safePriority = priority && validPriorities.includes(priority.toUpperCase())
      ? priority.toUpperCase()
      : existing[0].priority;

    await pool.query(`
      UPDATE imp_work_tasks 
      SET 
        title = COALESCE(?, title),
        description = ?,
        assigned_to = COALESCE(?, assigned_to),
        assigned_by = COALESCE(?, assigned_by),
        priority = ?,
        category = COALESCE(?, category),
        due_date = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      title ? title.trim() : null,
      description !== undefined ? description.trim() : existing[0].description,
      assigned_to ? assigned_to.trim() : null,
      assigned_by ? assigned_by.trim() : null,
      safePriority,
      category ? category.trim() : null,
      due_date !== undefined ? (due_date || null) : existing[0].due_date,
      id
    ]);

    const [updatedRows] = await pool.query('SELECT * FROM imp_work_tasks WHERE id = ?', [id]);

    res.json({
      ok: true,
      message: 'Task updated successfully',
      task: updatedRows[0]
    });
  } catch (error) {
    console.error('Error updating imp work task:', error);
    res.status(500).json({ ok: false, error: 'Failed to update task' });
  }
});

// PATCH /api/imp-work/tasks/:id/status - Update task status / Complete task
router.patch('/tasks/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, completed_notes, completed_by } = req.body;

    const validStatuses = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
    if (!status || !validStatuses.includes(status.toUpperCase())) {
      return res.status(400).json({ ok: false, error: 'Invalid status' });
    }

    const targetStatus = status.toUpperCase();
    const fallbackUser = req.user?.username || req.user?.name || 'Operator';
    const safeCompletedBy = (completed_by && completed_by.trim()) ? completed_by.trim() : fallbackUser;

    if (targetStatus === 'COMPLETED') {
      await pool.query(`
        UPDATE imp_work_tasks
        SET 
          status = 'COMPLETED',
          completed_at = CURRENT_TIMESTAMP,
          completed_by = ?,
          completed_notes = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [safeCompletedBy, completed_notes ? completed_notes.trim() : 'Task completed', id]);
    } else if (targetStatus === 'CANCELLED') {
      await pool.query(`
        UPDATE imp_work_tasks
        SET 
          status = 'CANCELLED',
          completed_at = CURRENT_TIMESTAMP,
          completed_by = ?,
          completed_notes = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [safeCompletedBy, completed_notes ? completed_notes.trim() : 'Task cancelled', id]);
    } else {
      // Reopening task (PENDING or IN_PROGRESS)
      await pool.query(`
        UPDATE imp_work_tasks
        SET 
          status = ?,
          completed_at = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [targetStatus, id]);
    }

    const [updatedRows] = await pool.query(
      `SELECT id, title, description, assigned_to, assigned_by, priority, category,
              DATE_FORMAT(due_date, '%Y-%m-%d') AS due_date, status,
              DATE_FORMAT(completed_at, '%Y-%m-%d %H:%i:%s') AS completed_at,
              completed_by, completed_notes,
              DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
              DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
       FROM imp_work_tasks WHERE id = ?`,
      [id]
    );

    res.json({
      ok: true,
      message: `Task marked as ${targetStatus}`,
      task: updatedRows[0]
    });
  } catch (error) {
    console.error('Error updating task status:', error);
    res.status(500).json({ ok: false, error: 'Failed to update task status' });
  }
});

// DELETE /api/imp-work/tasks/:id - Delete task
router.delete('/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await pool.query('DELETE FROM imp_work_tasks WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ ok: false, error: 'Task not found' });
    }

    res.json({ ok: true, message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Error deleting imp work task:', error);
    res.status(500).json({ ok: false, error: 'Failed to delete task' });
  }
});

export default router;
