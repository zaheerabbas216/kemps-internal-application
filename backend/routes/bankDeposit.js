import express from 'express';
import pool from '../config/db.js';

const router = express.Router();

// Helper to generate custom sequence ID (e.g. DEP-2026-00001)
// Generate custom business IDs: e.g. DEP-2026-00001
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

// GET /api/bank-deposits/accounts
// Returns all active bank accounts
router.get('/accounts', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, bank_name, account_number, ifsc_code, branch, status, created_at 
       FROM bank_accounts 
       WHERE status = 1 
       ORDER BY bank_name ASC`
    );
    res.json({ ok: true, accounts: rows });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// POST /api/bank-deposits/accounts
// Create new bank account
router.post('/accounts', async (req, res) => {
  try {
    const { bankName, accountNumber, ifscCode, branch } = req.body;
    
    const bankNameTrimmed = String(bankName || '').trim();
    const accountNumberTrimmed = String(accountNumber || '').trim();
    const ifscCodeTrimmed = String(ifscCode || '').trim();
    const branchTrimmed = String(branch || '').trim();

    if (!bankNameTrimmed) throw new Error('Bank name is required.');
    if (!accountNumberTrimmed) throw new Error('Account number is required.');

    // Check if account number already exists
    const [existing] = await pool.query(
      'SELECT id FROM bank_accounts WHERE account_number = ?',
      [accountNumberTrimmed]
    );
    if (existing.length > 0) {
      throw new Error('Bank account number already exists.');
    }

    const [result] = await pool.query(
      `INSERT INTO bank_accounts (bank_name, account_number, ifsc_code, branch, status) 
       VALUES (?, ?, ?, ?, 1)`,
      [bankNameTrimmed, accountNumberTrimmed, ifscCodeTrimmed, branchTrimmed]
    );

    res.json({ ok: true, id: result.insertId, message: 'Bank account added successfully!' });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// GET /api/bank-deposits/today
// Returns today's deposits, aggregates, and filters if search is provided
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
      `SELECT COALESCE(SUM(amount), 0) as totalAmount, COUNT(*) as totalCount FROM bank_deposits WHERE deposit_date = ?`,
      [todayStr]
    );
    const todayTotal = parseFloat(summaryRows[0].totalAmount);
    const todayCount = parseInt(summaryRows[0].totalCount, 10);

    let queryParams = [todayStr];
    let whereClause = 'WHERE d.deposit_date = ?';

    if (search.trim()) {
      whereClause += ' AND (a.bank_name LIKE ? OR a.account_number LIKE ? OR d.entered_by LIKE ? OR d.id LIKE ? OR d.notes LIKE ?)';
      const wildSearch = `%${search.trim()}%`;
      queryParams.push(wildSearch, wildSearch, wildSearch, wildSearch, wildSearch);
    }

    const [rows] = await pool.query(
      `SELECT d.id, DATE_FORMAT(d.deposit_date, '%Y-%m-%d') as deposit_date, d.bank_account_id, 
              a.bank_name, a.account_number, d.amount, d.entered_by, d.notes, d.created_at 
       FROM bank_deposits d
       INNER JOIN bank_accounts a ON d.bank_account_id = a.id
       ${whereClause} 
       ORDER BY d.created_at DESC`,
      queryParams
    );

    res.json({
      ok: true,
      deposits: rows,
      todayStr,
      summary: {
        totalAmount: todayTotal,
        totalCount: todayCount
      }
// GET /api/bank-deposits - Get all deposits with search filter
router.get('/', async (req, res) => {
  try {
    const { search = '' } = req.query;
    
    let baseQuery = 'SELECT id, deposit_date, bank_name, account_number, amount, notes, created_at FROM bank_deposits';
    let queryParams = [];
    
    if (search.trim()) {
      baseQuery += ' WHERE id LIKE ? OR bank_name LIKE ? OR account_number LIKE ? OR notes LIKE ?';
      const searchWild = `%${search.trim()}%`;
      queryParams = [searchWild, searchWild, searchWild, searchWild];
    }
    
    baseQuery += ' ORDER BY deposit_date DESC, created_at DESC';
    
    const [rows] = await pool.query(baseQuery, queryParams);
    
    res.json({
      ok: true,
      deposits: rows
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// GET /api/bank-deposits/history
// Returns paginated deposits with filters
router.get('/history', async (req, res) => {
  try {
    let { page = 1, limit = 10, search = '', startDate = '', endDate = '', bankAccountId = '' } = req.query;
    page = parseInt(page, 10);
    limit = parseInt(limit, 10);
    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1) limit = 10;

    const offset = (page - 1) * limit;
    let queryParams = [];
    let whereClauses = [];

    if (startDate) {
      whereClauses.push('d.deposit_date >= ?');
      queryParams.push(startDate);
    }
    if (endDate) {
      whereClauses.push('d.deposit_date <= ?');
      queryParams.push(endDate);
    }
    if (bankAccountId) {
      whereClauses.push('d.bank_account_id = ?');
      queryParams.push(parseInt(bankAccountId, 10));
    }
    if (search.trim()) {
      whereClauses.push('(a.bank_name LIKE ? OR a.account_number LIKE ? OR d.entered_by LIKE ? OR d.id LIKE ? OR d.notes LIKE ?)');
      const wildSearch = `%${search.trim()}%`;
      queryParams.push(wildSearch, wildSearch, wildSearch, wildSearch, wildSearch);
    }

    const whereClauseStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Get count
    const [countRows] = await pool.query(
      `SELECT COUNT(*) as count 
       FROM bank_deposits d
       INNER JOIN bank_accounts a ON d.bank_account_id = a.id 
       ${whereClauseStr}`,
      queryParams
    );
    const total = countRows[0].count;

    // Get rows
    let listParams = [...queryParams, limit, offset];
    const [rows] = await pool.query(
      `SELECT d.id, DATE_FORMAT(d.deposit_date, '%Y-%m-%d') as deposit_date, d.bank_account_id, 
              a.bank_name, a.account_number, d.amount, d.entered_by, d.notes, d.created_at 
       FROM bank_deposits d
       INNER JOIN bank_accounts a ON d.bank_account_id = a.id
       ${whereClauseStr} 
       ORDER BY d.deposit_date DESC, d.created_at DESC 
       LIMIT ? OFFSET ?`,
      listParams
    );

    res.json({
      ok: true,
      deposits: rows,
      total,
      page,
      limit
// POST /api/bank-deposits - Record a new deposit
router.post('/', async (req, res) => {
  try {
    const { depositDate, bankName, accountNumber, amount, notes } = req.body;
    
    const bankNameTrimmed = String(bankName || '').trim();
    const accountNumberTrimmed = String(accountNumber || '').trim();
    const dateTrimmed = String(depositDate || '').trim();
    const parsedAmount = parseFloat(amount);
    
    if (!dateTrimmed) {
      throw new Error('Deposit Date is required.');
    }
    if (!bankNameTrimmed) {
      throw new Error('Bank Name is required.');
    }
    if (!accountNumberTrimmed) {
      throw new Error('Account Number is required.');
    }
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      throw new Error('Valid deposit amount greater than 0 is required.');
    }
    
    const id = await generateId('DEP', 'bank_deposits', 'id');
    
    await pool.query(
      `INSERT INTO bank_deposits (id, deposit_date, bank_name, account_number, amount, notes, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [
        id,
        dateTrimmed,
        bankNameTrimmed,
        accountNumberTrimmed,
        parsedAmount,
        String(notes || '').trim()
      ]
    );
    
    res.json({
      ok: true,
      id,
      message: 'Bank deposit recorded successfully!'
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// POST /api/bank-deposits
// Create new deposit record
router.post('/', async (req, res) => {
  try {
    const { depositDate, bankAccountId, amount, enteredBy, notes } = req.body;
    
    const enteredByTrimmed = String(enteredBy || '').trim();
    const amountVal = parseFloat(amount);
    const bankAccountIdInt = parseInt(bankAccountId, 10);

    if (!depositDate) throw new Error('Date is required.');
    if (isNaN(bankAccountIdInt)) throw new Error('Bank account selection is required.');
    if (isNaN(amountVal) || amountVal <= 0) throw new Error('Amount must be a positive number.');
    if (!enteredByTrimmed) throw new Error('Entered By name is required.');

    // Check if bank account exists
    const [accCheck] = await pool.query('SELECT id FROM bank_accounts WHERE id = ? AND status = 1', [bankAccountIdInt]);
    if (accCheck.length === 0) throw new Error('Selected bank account does not exist or is inactive.');

    const id = await generateId('DEP', 'bank_deposits', 'id');

    await pool.query(
      `INSERT INTO bank_deposits (id, deposit_date, bank_account_id, amount, entered_by, notes, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [id, depositDate, bankAccountIdInt, amountVal, enteredByTrimmed, String(notes || '').trim()]
    );

    res.json({ ok: true, id, message: 'Bank deposit recorded successfully!' });
// GET /api/bank-deposits/accounts - Get all bank accounts mapping
router.get('/accounts', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, bank_name, account_number, ifsc_code, created_at FROM bank_accounts ORDER BY bank_name ASC'
    );
    res.json({
      ok: true,
      accounts: rows
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// PUT /api/bank-deposits/:id
// Update deposit record
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { depositDate, bankAccountId, amount, enteredBy, notes } = req.body;

    const [existing] = await pool.query('SELECT * FROM bank_deposits WHERE id = ?', [id]);
    if (existing.length === 0) throw new Error('Deposit record not found.');

    const updates = [];
    const values = [];

    if (depositDate !== undefined) {
      updates.push('deposit_date = ?');
      values.push(depositDate);
    }
    if (bankAccountId !== undefined) {
      const bankAccountIdInt = parseInt(bankAccountId, 10);
      if (isNaN(bankAccountIdInt)) throw new Error('Invalid bank account selected.');
      const [accCheck] = await pool.query('SELECT id FROM bank_accounts WHERE id = ?', [bankAccountIdInt]);
      if (accCheck.length === 0) throw new Error('Selected bank account does not exist.');
      updates.push('bank_account_id = ?');
      values.push(bankAccountIdInt);
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
    if (notes !== undefined) {
      updates.push('notes = ?');
      values.push(String(notes || '').trim());
    }

    if (updates.length > 0) {
      values.push(id);
      await pool.query(`UPDATE bank_deposits SET ${updates.join(', ')} WHERE id = ?`, values);
    }

    res.json({ ok: true, message: 'Deposit record updated successfully!' });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// DELETE /api/bank-deposits/:id
// Delete deposit record
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await pool.query('DELETE FROM bank_deposits WHERE id = ?', [id]);
    if (result.affectedRows === 0) throw new Error('Deposit record not found.');
    
    res.json({ ok: true, message: 'Deposit record deleted successfully!' });
// POST /api/bank-deposits/accounts - Create a new bank account mapping
router.post('/accounts', async (req, res) => {
  try {
    const { bankName, accountNumber, ifscCode } = req.body;
    
    const bankNameTrimmed = String(bankName || '').trim();
    const accountNumberTrimmed = String(accountNumber || '').trim();
    const ifscTrimmed = String(ifscCode || '').trim();
    
    if (!bankNameTrimmed) {
      throw new Error('Bank Name is required.');
    }
    if (!accountNumberTrimmed) {
      throw new Error('Account Number is required.');
    }
    
    // Check if account already exists
    const [existing] = await pool.query(
      'SELECT id FROM bank_accounts WHERE account_number = ?',
      [accountNumberTrimmed]
    );
    
    if (existing && existing.length > 0) {
      throw new Error(`Bank Account Number ${accountNumberTrimmed} is already registered.`);
    }
    
    const [result] = await pool.query(
      'INSERT INTO bank_accounts (bank_name, account_number, ifsc_code) VALUES (?, ?, ?)',
      [bankNameTrimmed, accountNumberTrimmed, ifscTrimmed]
    );
    
    res.json({
      ok: true,
      id: result.insertId,
      message: 'Bank account added successfully!'
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

export default router;
