import express from 'express';
import pool from '../config/db.js';

const router = express.Router();

// GET /api/tasks - All pending tasks (most recent first)
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, task_text, assigned_to, created_by, status, priority,
              DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') as created_at,
              DATE_FORMAT(completed_at, '%Y-%m-%d %H:%i:%s') as completed_at,
              completed_by
       FROM task_items
       WHERE status = 'PENDING'
       ORDER BY FIELD(priority,'Urgent','High','Normal','Low'), created_at ASC`
    );
    res.json({ ok: true, tasks: rows });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// GET /api/tasks/history - Completed tasks paginated (most recent first)
router.get('/history', async (req, res) => {
  try {
    let { page = 1, limit = 20 } = req.query;
    page  = parseInt(page,  10);
    limit = parseInt(limit, 10);
    if (isNaN(page)  || page  < 1) page  = 1;
    if (isNaN(limit) || limit < 1) limit = 20;
    const offset = (page - 1) * limit;

    const [countRows] = await pool.query(
      `SELECT COUNT(*) as count FROM task_items WHERE status = 'COMPLETED'`
    );
    const total = countRows[0].count;

    const [rows] = await pool.query(
      `SELECT id, task_text, assigned_to, created_by, status, priority,
              DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') as created_at,
              DATE_FORMAT(completed_at, '%Y-%m-%d %H:%i:%s') as completed_at,
              completed_by
       FROM task_items
       WHERE status = 'COMPLETED'
       ORDER BY completed_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    res.json({ ok: true, tasks: rows, total, page, limit });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// POST /api/tasks - Create a new task
router.post('/', async (req, res) => {
  try {
    const { taskText, assignedTo, createdBy, priority = 'Normal' } = req.body;

    if (!String(taskText || '').trim())   throw new Error('Task description is required.');
    if (!String(assignedTo || '').trim()) throw new Error('Assigned to is required.');
    if (!String(createdBy  || '').trim()) throw new Error('Created by is required.');

    const validPriorities = ['Low', 'Normal', 'High', 'Urgent'];
    if (!validPriorities.includes(priority)) throw new Error('Invalid priority.');

    const [result] = await pool.query(
      `INSERT INTO task_items (task_text, assigned_to, created_by, priority, status, created_at)
       VALUES (?, ?, ?, ?, 'PENDING', NOW())`,
      [taskText.trim(), assignedTo.trim(), createdBy.trim(), priority]
    );
    res.json({ ok: true, id: result.insertId, message: 'Task created successfully!' });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// PATCH /api/tasks/:id/complete - Mark task as completed
router.patch('/:id/complete', async (req, res) => {
  try {
    const { id } = req.params;
    const { completedBy } = req.body;
    if (!String(completedBy || '').trim()) throw new Error('Completed by is required.');

    const [existing] = await pool.query(
      `SELECT status FROM task_items WHERE id = ?`, [id]
    );
    if (existing.length === 0) throw new Error('Task not found.');
    if (existing[0].status === 'COMPLETED') throw new Error('Task is already completed.');

    await pool.query(
      `UPDATE task_items SET status = 'COMPLETED', completed_by = ?, completed_at = NOW() WHERE id = ?`,
      [completedBy.trim(), id]
    );
    res.json({ ok: true, message: 'Task marked as completed!' });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// DELETE /api/tasks/:id - Delete a task (pending only)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await pool.query(
      `DELETE FROM task_items WHERE id = ?`, [id]
    );
    if (result.affectedRows === 0) throw new Error('Task not found.');
    res.json({ ok: true, message: 'Task deleted.' });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

export default router;
