import express from 'express';
import pool from '../config/db.js';
import { createPaymentApprovalEntry } from '../helpers/paymentApprovalHelper.js';

const router = express.Router();

// Helper to generate custom sequence ID (e.g. EXP-2026-00001)
async function generateId(prefix, table, idColumn) {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  // Adjust to IST timezone (UTC+5:30)
  const istDate = new Date(now.getTime() + (330 + offset) * 60000);
  const yyyy = istDate.getFullYear();
  
  const [rows] = await pool.query(
    `SELECT ${idColumn} FROM ${table} WHERE ${idColumn} LIKE ? ORDER BY ${idColumn} DESC LIMIT 1`,
    [`${prefix}-${yyyy}-%`]
  );
  
  let seq = 1;
  if (rows.length) {
    const lastId = rows[0][idColumn];
    const match = lastId.match(new RegExp(`^${prefix}-${yyyy}-(\\d+)$`));
    if (match && match[1]) {
      seq = parseInt(match[1]) + 1;
    }
  }
  
  return `${prefix}-${yyyy}-${String(seq).padStart(5, '0')}`;
}

// GET /api/expenses/today
// Returns today's expenses, aggregates, and filters if search is provided
router.get('/today', async (req, res) => {
  try {
    const { search = '' } = req.query;

    const now = new Date();
    const offset = now.getTimezoneOffset();
    const istDate = new Date(now.getTime() + (330 + offset) * 60000);
    const yyyy = istDate.getFullYear();
    const mm = String(istDate.getMonth() + 1).padStart(2, '0');
    const dd = String(istDate.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;

    // Get today's total sum and count (overall, ignore search filters for the absolute aggregate summary)
    const [summaryRows] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as totalAmount, COUNT(*) as totalCount FROM expenses WHERE expense_date = ?`,
      [todayStr]
    );
    const todayTotal = parseFloat(summaryRows[0].totalAmount);
    const todayCount = parseInt(summaryRows[0].totalCount, 10);

    let queryParams = [todayStr];
    let whereClause = 'WHERE expense_date = ?';

    if (search.trim()) {
      whereClause += ' AND (particulars LIKE ? OR entered_by LIKE ? OR id LIKE ? OR remarks LIKE ?)';
      const wildSearch = `%${search.trim()}%`;
      queryParams.push(wildSearch, wildSearch, wildSearch, wildSearch);
    }

    const [rows] = await pool.query(
      `SELECT id, DATE_FORMAT(expense_date, '%Y-%m-%d') as expense_date, particulars, amount, entered_by, remarks, created_at 
       FROM expenses 
       ${whereClause} 
       ORDER BY created_at DESC`,
      queryParams
    );

    res.json({
      ok: true,
      expenses: rows,
      todayStr,
      summary: {
        totalAmount: todayTotal,
        totalCount: todayCount
      }
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// GET /api/expenses/history
// Returns paginated expenses with filters
router.get('/history', async (req, res) => {
  try {
    let { page = 1, limit = 10, search = '', startDate = '', endDate = '' } = req.query;
    page = parseInt(page, 10);
    limit = parseInt(limit, 10);
    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1) limit = 10;

    const offset = (page - 1) * limit;
    let queryParams = [];
    let whereClauses = [];

    if (startDate) {
      whereClauses.push('expense_date >= ?');
      queryParams.push(startDate);
    }
    if (endDate) {
      whereClauses.push('expense_date <= ?');
      queryParams.push(endDate);
    }
    if (search.trim()) {
      whereClauses.push('(particulars LIKE ? OR entered_by LIKE ? OR id LIKE ? OR remarks LIKE ?)');
      const wildSearch = `%${search.trim()}%`;
      queryParams.push(wildSearch, wildSearch, wildSearch, wildSearch);
    }

    const whereClauseStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Get count
    const [countRows] = await pool.query(
      `SELECT COUNT(*) as count FROM expenses ${whereClauseStr}`,
      queryParams
    );
    const total = countRows[0].count;

    // Get rows
    let listParams = [...queryParams, limit, offset];
    const [rows] = await pool.query(
      `SELECT id, DATE_FORMAT(expense_date, '%Y-%m-%d') as expense_date, particulars, amount, entered_by, remarks, created_at 
       FROM expenses 
       ${whereClauseStr} 
       ORDER BY expense_date DESC, created_at DESC 
       LIMIT ? OFFSET ?`,
      listParams
    );

    res.json({
      ok: true,
      expenses: rows,
      total,
      page,
      limit
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// POST /api/expenses
// Create new expense
router.post('/', async (req, res) => {
  try {
    const { expenseDate, particulars, amount, enteredBy, remarks } = req.body;
    
    const particularsTrimmed = String(particulars || '').trim();
    const enteredByTrimmed = String(enteredBy || '').trim();
    const amountVal = parseFloat(amount);

    if (!expenseDate) throw new Error('Date is required.');
    if (!particularsTrimmed) throw new Error('Particulars is required.');
    if (isNaN(amountVal) || amountVal <= 0) throw new Error('Amount must be a positive number.');
    if (!enteredByTrimmed) throw new Error('Entered By name is required.');

    const id = await generateId('EXP', 'expenses', 'id');

    // Auto-create Payment Approval entry
    const approvalId = await createPaymentApprovalEntry({
      transactionId: id,
      sourceModule: 'Expense',
      transactionType: 'Cash Out',
      referenceNo: id,
      partyName: enteredByTrimmed,
      description: `Expense: ${particularsTrimmed}`,
      paymentMethod: 'Cash',
      cashAmount: amountVal,
      upiAmount: 0,
      bankAmount: 0,
      amount: amountVal,
      transactionDate: expenseDate,
      enteredBy: enteredByTrimmed,
      remarks: String(remarks || '').trim()
    });

    await pool.query(
      `INSERT INTO expenses (id, expense_date, particulars, amount, entered_by, remarks, 
        payment_status, pending_amount, approved_amount, rejected_amount, approval_id, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, 'Pending Approval', ?, 0.00, 0.00, ?, NOW())`,
      [id, expenseDate, particularsTrimmed, amountVal, enteredByTrimmed, String(remarks || '').trim(), amountVal, approvalId || null]
    );

    res.json({ ok: true, id, message: 'Expense saved successfully!' });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// PUT /api/expenses/:id
// Update expense
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { expenseDate, particulars, amount, enteredBy, remarks } = req.body;

    const [existing] = await pool.query('SELECT * FROM expenses WHERE id = ?', [id]);
    if (existing.length === 0) throw new Error('Expense record not found.');

    const updates = [];
    const values = [];

    if (expenseDate !== undefined) {
      updates.push('expense_date = ?');
      values.push(expenseDate);
    }
    if (particulars !== undefined) {
      const particularsTrimmed = String(particulars || '').trim();
      if (!particularsTrimmed) throw new Error('Particulars cannot be empty.');
      updates.push('particulars = ?');
      values.push(particularsTrimmed);
    }
    if (amount !== undefined) {
      const amountVal = parseFloat(amount);
      if (isNaN(amountVal) || amountVal <= 0) throw new Error('Amount must be a positive number.');
      updates.push('amount = ?');
      values.push(amountVal);
    }
    if (enteredBy !== undefined) {
      const enteredByTrimmed = String(enteredBy || '').trim();
      if (!enteredByTrimmed) throw new Error('Entered By name cannot be empty.');
      updates.push('entered_by = ?');
      values.push(enteredByTrimmed);
    }
    if (remarks !== undefined) {
      updates.push('remarks = ?');
      values.push(String(remarks || '').trim());
    }

    if (updates.length > 0) {
      values.push(id);
      await pool.query(`UPDATE expenses SET ${updates.join(', ')} WHERE id = ?`, values);
    }

    res.json({ ok: true, message: 'Expense updated successfully!' });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// DELETE /api/expenses/:id
// Delete expense
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Clean up associated payment approval if pending
    await pool.query(
      `DELETE FROM payment_approvals WHERE transaction_id = ? AND source_module = 'Expense'`,
      [id]
    );

    const [result] = await pool.query('DELETE FROM expenses WHERE id = ?', [id]);
    if (result.affectedRows === 0) throw new Error('Expense record not found.');
    
    res.json({ ok: true, message: 'Expense deleted successfully!' });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

export default router;
