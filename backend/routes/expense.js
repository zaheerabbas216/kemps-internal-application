import express from 'express';
import pool from '../config/db.js';
import { createPaymentApprovalEntry } from '../helpers/paymentApprovalHelper.js';

const router = express.Router();

// Helper to generate custom sequence ID
async function generateId(prefix, table, idColumn) {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  // Adjust to IST timezone (UTC+5:30)
  const istDate = new Date(now.getTime() + (330 + offset) * 60000);
  const yyyy = istDate.getFullYear();
  
  if (prefix === 'EXP') {
    const mm = String(istDate.getMonth() + 1).padStart(2, '0');
    const dd = String(istDate.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}${mm}${dd}`;
    
    const [rows] = await pool.query(
      `SELECT ${idColumn} FROM ${table} WHERE ${idColumn} LIKE ? ORDER BY ${idColumn} DESC LIMIT 1`,
      [`EXP-${dateStr}-%`]
    );
    
    let seq = 1;
    if (rows.length) {
      const lastId = rows[0][idColumn];
      const match = lastId.match(/^EXP-\d{8}-(\d+)$/);
      if (match && match[1]) {
        seq = parseInt(match[1]) + 1;
      }
    }
    return `EXP-${dateStr}-${String(seq).padStart(4, '0')}`;
  }
  
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
      `SELECT 
         COALESCE(SUM(CASE WHEN payment_status = 'Approved' THEN amount ELSE 0 END), 0) as totalAmount, 
         COUNT(*) as totalCount 
       FROM expenses 
       WHERE expense_date = ?`,
      [todayStr]
    );
    const todayTotal = parseFloat(summaryRows[0].totalAmount);
    const todayCount = parseInt(summaryRows[0].totalCount, 10);

    let queryParams = [todayStr];
    let whereClause = 'WHERE e.expense_date = ?';

    if (search.trim()) {
      whereClause += ' AND (e.particulars LIKE ? OR e.entered_by LIKE ? OR e.id LIKE ? OR e.remarks LIKE ?)';
      const wildSearch = `%${search.trim()}%`;
      queryParams.push(wildSearch, wildSearch, wildSearch, wildSearch);
    }

    const [rows] = await pool.query(
      `SELECT e.id, DATE_FORMAT(e.expense_date, '%Y-%m-%d') as expense_date, e.particulars, e.amount, e.entered_by, e.remarks, 
              e.payment_status, e.category, e.payment_method, e.created_at,
              pa.rejected_by, DATE_FORMAT(pa.rejected_at, '%d-%m-%Y %h:%i %p') as rejected_date, pa.rejection_reason
       FROM expenses e 
       LEFT JOIN payment_approvals pa ON e.approval_id = pa.approval_id
       ${whereClause} 
       ORDER BY e.created_at DESC`,
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
      whereClauses.push('e.expense_date >= ?');
      queryParams.push(startDate);
    }
    if (endDate) {
      whereClauses.push('e.expense_date <= ?');
      queryParams.push(endDate);
    }
    if (search.trim()) {
      whereClauses.push('(e.particulars LIKE ? OR e.entered_by LIKE ? OR e.id LIKE ? OR e.remarks LIKE ?)');
      const wildSearch = `%${search.trim()}%`;
      queryParams.push(wildSearch, wildSearch, wildSearch, wildSearch);
    }

    const whereClauseStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Get count
    const [countRows] = await pool.query(
      `SELECT COUNT(*) as count FROM expenses e ${whereClauseStr}`,
      queryParams
    );
    const total = countRows[0].count;

    // Get rows
    let listParams = [...queryParams, limit, offset];
    const [rows] = await pool.query(
      `SELECT e.id, DATE_FORMAT(e.expense_date, '%Y-%m-%d') as expense_date, e.particulars, e.amount, e.entered_by, e.remarks, 
              e.payment_status, e.category, e.payment_method, e.created_at,
              pa.rejected_by, DATE_FORMAT(pa.rejected_at, '%d-%m-%Y %h:%i %p') as rejected_date, pa.rejection_reason
       FROM expenses e 
       LEFT JOIN payment_approvals pa ON e.approval_id = pa.approval_id
       ${whereClauseStr} 
       ORDER BY e.expense_date DESC, e.created_at DESC 
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
    const { expenseDate, particulars, amount, enteredBy, remarks, category, paymentMethod } = req.body;
    
    const particularsTrimmed = String(particulars || '').trim();
    const enteredByTrimmed = String(enteredBy || '').trim();
    const amountVal = parseFloat(amount);
    const categoryVal = String(category || 'General').trim();
    const paymentMethodVal = String(paymentMethod || 'Cash').trim();

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
      paymentMethod: paymentMethodVal,
      cashAmount: paymentMethodVal === 'Cash' ? amountVal : 0,
      upiAmount: paymentMethodVal === 'UPI' ? amountVal : 0,
      bankAmount: paymentMethodVal === 'Bank' ? amountVal : 0,
      amount: amountVal,
      transactionDate: expenseDate,
      enteredBy: enteredByTrimmed,
      remarks: String(remarks || '').trim(),
      category: categoryVal
    });

    await pool.query(
      `INSERT INTO expenses (id, expense_date, particulars, amount, entered_by, remarks, 
        payment_status, pending_amount, approved_amount, rejected_amount, approval_id, category, payment_method, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, 'Pending Approval', ?, 0.00, 0.00, ?, ?, ?, NOW())`,
      [id, expenseDate, particularsTrimmed, amountVal, enteredByTrimmed, String(remarks || '').trim(), amountVal, approvalId || null, categoryVal, paymentMethodVal]
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
    const { expenseDate, particulars, amount, enteredBy, remarks, category, paymentMethod } = req.body;

    const [existing] = await pool.query('SELECT * FROM expenses WHERE id = ?', [id]);
    if (existing.length === 0) throw new Error('Expense record not found.');
    const expense = existing[0];

    // Lock check
    if (expense.approval_id) {
      const [appRows] = await pool.query('SELECT status FROM payment_approvals WHERE approval_id = ?', [expense.approval_id]);
      if (appRows.length > 0 && appRows[0].status !== 'Pending') {
        throw new Error('This expense has already been approved and posted to accounts. Please create an adjustment or reversal entry.');
      }
    } else if (expense.payment_status !== 'Pending Approval') {
      throw new Error('This expense has already been approved or rejected and cannot be modified.');
    }

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
      updates.push('pending_amount = ?');
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
    if (category !== undefined) {
      updates.push('category = ?');
      values.push(String(category || 'General').trim());
    }
    if (paymentMethod !== undefined) {
      updates.push('payment_method = ?');
      values.push(String(paymentMethod || 'Cash').trim());
    }

    if (updates.length > 0) {
      values.push(id);
      await pool.query(`UPDATE expenses SET ${updates.join(', ')} WHERE id = ?`, values);
    }

    // Sync update to payment approval
    if (expense.approval_id) {
      const newParticulars = particulars !== undefined ? particulars : expense.particulars;
      const newAmount = amount !== undefined ? parseFloat(amount) : parseFloat(expense.amount);
      const newEnteredBy = enteredBy !== undefined ? enteredBy : expense.entered_by;
      const newRemarks = remarks !== undefined ? remarks : expense.remarks;
      const newCategory = category !== undefined ? category : expense.category;
      const newPaymentMethod = paymentMethod !== undefined ? paymentMethod : expense.payment_method;
      const newDate = expenseDate !== undefined ? expenseDate : expense.expense_date;

      await pool.query(
        `UPDATE payment_approvals SET
          party_name = ?,
          description = ?,
          payment_method = ?,
          amount = ?,
          cash_amount = ?,
          upi_amount = ?,
          bank_amount = ?,
          transaction_date = ?,
          remarks = ?,
          category = ?,
          updated_at = NOW()
         WHERE approval_id = ? AND status = 'Pending'`,
        [
          newEnteredBy,
          `Expense: ${newParticulars}`,
          newPaymentMethod,
          newAmount,
          newPaymentMethod === 'Cash' ? newAmount : 0,
          newPaymentMethod === 'UPI' ? newAmount : 0,
          newPaymentMethod === 'Bank' ? newAmount : 0,
          newDate,
          newRemarks,
          newCategory,
          expense.approval_id
        ]
      );
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

    const [existing] = await pool.query('SELECT * FROM expenses WHERE id = ?', [id]);
    if (existing.length === 0) throw new Error('Expense record not found.');
    const expense = existing[0];

    // Lock check
    if (expense.approval_id) {
      const [appRows] = await pool.query('SELECT status FROM payment_approvals WHERE approval_id = ?', [expense.approval_id]);
      if (appRows.length > 0 && appRows[0].status !== 'Pending') {
        throw new Error('This expense has already been approved or rejected and cannot be deleted.');
      }
    } else if (expense.payment_status !== 'Pending Approval') {
      throw new Error('This expense has already been approved or rejected and cannot be deleted.');
    }
    
    // Clean up associated payment approval if pending
    await pool.query(
      `DELETE FROM payment_approvals WHERE transaction_id = ? AND source_module = 'Expense' AND status = 'Pending'`,
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
