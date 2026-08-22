import express from 'express';
import pool from '../config/db.js';

const router = express.Router();

function normalizePhone10(phone) {
  let s = String(phone || '').trim();
  const digits = s.replace(/\D+/g, '');
  const ph = digits.length >= 10 ? digits.slice(-10) : digits;
  if (!/^\d{10}$/.test(ph)) throw new Error("Phone must be exactly 10 digits.");
  return ph;
}

// Helper to generate custom sequence ID
async function generateId(prefix, table, idColumn, connection = pool) {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  // Adjust to IST timezone (UTC+5:30)
  const istDate = new Date(now.getTime() + (330 + offset) * 60000);
  const yyyy = istDate.getFullYear();
  
  if (prefix === 'EXP') {
    const mm = String(istDate.getMonth() + 1).padStart(2, '0');
    const dd = String(istDate.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}${mm}${dd}`;
    
    const [rows] = await connection.query(
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
  
  const [rows] = await connection.query(
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

// GET /api/can-deposit/search-customer?query=...
router.get('/search-customer', async (req, res) => {
  try {
    const { query } = req.query;
    if (!query || !query.trim()) {
      return res.json({ customers: [] });
    }
    const searchWild = `%${query.trim()}%`;
    const [rows] = await pool.query(`
      SELECT 
        id, 
        name, 
        phone, 
        alternate_phone AS alternatePhone,
        gstin AS gst, 
        address,
        customer_type AS customerType,
        deposit_balance AS depositBalance
      FROM customers
      WHERE name LIKE ? OR phone LIKE ? OR alternate_phone LIKE ?
      LIMIT 20
    `, [searchWild, searchWild, searchWild]);

    res.json({ ok: true, customers: rows });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// GET /api/can-deposit/history
router.get('/history', async (req, res) => {
  try {
    let { page = 1, limit = 10, search = '', startDate = '', endDate = '', type = 'All', paymentMode = 'All' } = req.query;
    page = parseInt(page, 10);
    limit = parseInt(limit, 10);
    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1) limit = 10;

    const offset = (page - 1) * limit;
    let queryParams = [];
    let whereClauses = [];

    if (startDate) {
      whereClauses.push('created_at >= ?');
      queryParams.push(`${startDate} 00:00:00`);
    }
    if (endDate) {
      whereClauses.push('created_at <= ?');
      queryParams.push(`${endDate} 23:59:59`);
    }

    if (type && type !== 'All') {
      whereClauses.push('transaction_type = ?');
      queryParams.push(type);
    }

    if (paymentMode && paymentMode !== 'All') {
      whereClauses.push('payment_mode = ?');
      queryParams.push(paymentMode);
    }

    if (search.trim()) {
      whereClauses.push('(customer_name LIKE ? OR mobile_number LIKE ? OR transaction_id LIKE ?)');
      const wild = `%${search.trim()}%`;
      queryParams.push(wild, wild, wild);
    }

    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Get count
    const [countRows] = await pool.query(
      `SELECT COUNT(*) as count FROM can_deposit_ledger ${whereStr}`,
      queryParams
    );
    const total = countRows[0].count;

    // Get rows
    let selectParams = [...queryParams, limit, offset];
    const [rows] = await pool.query(
      `SELECT 
        id,
        transaction_id,
        transaction_type,
        customer_id,
        customer_name,
        mobile_number,
        qty,
        rate,
        amount,
        payment_mode,
        remarks,
        balance_after_transaction,
        payment_status,
        created_by,
        DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') as created_at
       FROM can_deposit_ledger
       ${whereStr}
       ORDER BY created_at DESC, id DESC
       LIMIT ? OFFSET ?`,
      selectParams
    );

    res.json({
      ok: true,
      transactions: rows,
      total,
      page,
      limit
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// GET /api/can-deposit/customer/:customerId/ledger
router.get('/customer/:customerId/ledger', async (req, res) => {
  try {
    const { customerId } = req.params;

    const [customerRows] = await pool.query(
      `SELECT id, name, phone, alternate_phone AS alternatePhone, gstin AS gst, address, customer_type AS customerType, deposit_balance AS depositBalance FROM customers WHERE id = ?`,
      [customerId]
    );

    if (customerRows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Customer not found.' });
    }

    const customer = customerRows[0];

    // Fetch chronological ledger
    const [ledgerRows] = await pool.query(
      `SELECT 
        id,
        transaction_id,
        transaction_type,
        qty,
        rate,
        amount,
        payment_mode,
        remarks,
        balance_after_transaction,
        payment_status,
        created_by,
        DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') as created_at
       FROM can_deposit_ledger
       WHERE customer_id = ?
       ORDER BY created_at ASC, id ASC`,
      [customerId]
    );

    // Calculate sum of credits/debits
    const [statsRows] = await pool.query(
      `SELECT 
        COALESCE(SUM(CASE WHEN transaction_type = 'Deposit Received' THEN amount ELSE 0 END), 0) AS totalReceived,
        COALESCE(SUM(CASE WHEN transaction_type = 'Deposit Returned' THEN amount ELSE 0 END), 0) AS totalReturned
       FROM can_deposit_ledger
       WHERE customer_id = ?`,
      [customerId]
    );

    res.json({
      ok: true,
      customer,
      ledger: ledgerRows,
      summary: {
        totalReceived: parseFloat(statsRows[0].totalReceived),
        totalReturned: parseFloat(statsRows[0].totalReturned),
        currentBalance: parseFloat(customer.depositBalance)
      }
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// POST /api/can-deposit
// Creates a new deposit received (treated as SALES/INCOME)
router.post('/', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { customerId, qty, rate, paymentMode, remarks, createdBy } = req.body;

    const qtyVal = parseInt(qty, 10);
    const rateVal = parseFloat(rate);
    const amountVal = qtyVal * rateVal;

    if (!customerId) throw new Error('Customer ID is required.');
    if (isNaN(qtyVal) || qtyVal <= 0) throw new Error('Quantity must be greater than 0.');
    if (isNaN(rateVal) || rateVal < 0) throw new Error('Rate cannot be negative.');
    if (!paymentMode) throw new Error('Payment Mode is required.');
    if (!createdBy) throw new Error('Created By username is required.');

    // 1. Get customer info
    const [custRows] = await connection.query(
      `SELECT id, name, phone, customer_type, gstin, address, deposit_balance FROM customers WHERE id = ? FOR UPDATE`,
      [customerId]
    );
    if (custRows.length === 0) throw new Error('Customer not found.');
    const customer = custRows[0];

    const currentBalance = parseFloat(customer.deposit_balance || 0.00);
    const newBalance = currentBalance + amountVal;

    // Update customer deposit balance immediately
    await connection.query(
      `UPDATE customers SET deposit_balance = ? WHERE id = ?`,
      [newBalance, customerId]
    );

    // 2. Generate transaction ID (DEP-YYYY-XXXXX)
    const transactionId = await generateId('DEP', 'can_deposit_ledger', 'transaction_id', connection);

    // 3. Generate billing date
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const istDate = new Date(now.getTime() + (330 + offset) * 60000);
    const billingDate = istDate.toISOString().split('T')[0];

    // 4. Insert transaction into can_deposit_ledger as Approved immediately
    await connection.query(
      `INSERT INTO can_deposit_ledger 
        (transaction_id, transaction_type, customer_id, customer_name, mobile_number, qty, rate, amount, payment_mode, remarks, 
         balance_after_transaction, payment_status, pending_amount, approved_amount, rejected_amount, approval_id, created_by, created_at)
       VALUES (?, 'Deposit Received', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Approved', 0.00, ?, 0.00, NULL, ?, NOW())`,
      [
        transactionId,
        customerId,
        customer.name,
        customer.phone,
        qtyVal,
        rateVal,
        amountVal,
        paymentMode,
        remarks || '',
        newBalance,
        amountVal,
        createdBy
      ]
    );

    await connection.commit();

    res.json({ ok: true, transactionId, message: 'Can deposit saved successfully!' });
  } catch (error) {
    await connection.rollback();
    res.status(400).json({ ok: false, error: error.message });
  } finally {
    connection.release();
  }
});

// POST /api/can-deposit/return
// Creates a new deposit returned/refunded (treated as EXPENSE)
router.post('/return', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { customerId, qty, rate, returnAmount, paymentMode, remarks, createdBy } = req.body;

    const qtyVal = parseInt(qty, 10) || 0;
    const rateVal = parseFloat(rate) || 0.00;
    const amountVal = parseFloat(returnAmount);

    if (!customerId) throw new Error('Customer ID is required.');
    if (isNaN(amountVal) || amountVal <= 0) throw new Error('Refund amount must be greater than 0.');
    if (!paymentMode) throw new Error('Payment Mode is required.');
    if (!createdBy) throw new Error('Created By username is required.');

    // 1. Get customer info
    const [custRows] = await connection.query(
      `SELECT id, name, phone, deposit_balance FROM customers WHERE id = ? FOR UPDATE`,
      [customerId]
    );
    if (custRows.length === 0) throw new Error('Customer not found.');
    const customer = custRows[0];

    const currentBalance = parseFloat(customer.deposit_balance || 0.00);
    const newBalance = currentBalance - amountVal;
    
    if (amountVal > currentBalance) {
      throw new Error(`Return amount exceeds available deposit balance (₹${currentBalance.toFixed(2)}).`);
    }

    // Update customer deposit balance immediately
    await connection.query(
      `UPDATE customers SET deposit_balance = ? WHERE id = ?`,
      [newBalance, customerId]
    );

    // 2. Generate refund transaction ID (REF-YYYY-XXXXX)
    const transactionId = await generateId('REF', 'can_deposit_ledger', 'transaction_id', connection);

    // 3. Generate date
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const istDate = new Date(now.getTime() + (330 + offset) * 60000);
    const expenseDate = istDate.toISOString().split('T')[0];

    // 4. Insert transaction into can_deposit_ledger as Approved immediately
    await connection.query(
      `INSERT INTO can_deposit_ledger 
        (transaction_id, transaction_type, customer_id, customer_name, mobile_number, qty, rate, amount, payment_mode, remarks, 
         balance_after_transaction, payment_status, pending_amount, approved_amount, rejected_amount, approval_id, created_by, created_at)
       VALUES (?, 'Deposit Returned', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Approved', 0.00, ?, 0.00, NULL, ?, NOW())`,
      [
        transactionId,
        customerId,
        customer.name,
        customer.phone,
        qtyVal,
        rateVal,
        amountVal,
        paymentMode,
        remarks || '',
        newBalance,
        amountVal,
        createdBy
      ]
    );

    // 5. Programmatically create expense record in Approved state
    const expenseId = await generateId('EXP', 'expenses', 'id', connection);

    await connection.query(
      `INSERT INTO expenses (id, expense_date, particulars, amount, entered_by, remarks, 
        payment_status, pending_amount, approved_amount, rejected_amount, approval_id, category, payment_method, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, 'Approved', 0.00, ?, 0.00, NULL, ?, ?, NOW())`,
      [
        expenseId,
        expenseDate,
        `Deposit Returned: ${transactionId}`,
        amountVal,
        createdBy,
        remarks || '',
        amountVal,
        'Deposit Return',
        paymentMode
      ]
    );

    await connection.commit();

    res.json({ ok: true, transactionId, message: 'Can deposit returned successfully!' });
  } catch (error) {
    await connection.rollback();
    res.status(400).json({ ok: false, error: error.message });
  } finally {
    connection.release();
  }
});

// DELETE /api/can-deposit/:id
// Admin Only: Deletes a ledger transaction, deletes the associated invoice/expense, and recalculates customer balance
router.delete('/:id', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;

    // Check if user is admin
    if (!req.admin || req.admin.username !== 'admin') {
      throw new Error('Access denied. Only system administrator can delete transactions.');
    }

    // 1. Fetch transaction record
    const [txRows] = await connection.query(
      `SELECT * FROM can_deposit_ledger WHERE id = ? FOR UPDATE`,
      [id]
    );
    if (txRows.length === 0) throw new Error('Transaction record not found.');
    const transaction = txRows[0];
    const customerId = transaction.customer_id;

    // 2. Remove associated accounting entry (Deposit Returned creates an expense record)
    if (transaction.transaction_type === 'Deposit Returned') {
      // Find corresponding expense record
      await connection.query(
        `DELETE FROM expenses WHERE particulars = ?`,
        [`Deposit Returned: ${transaction.transaction_id}`]
      );
    }

    // 3. Delete from can_deposit_ledger
    await connection.query(
      `DELETE FROM can_deposit_ledger WHERE id = ?`,
      [id]
    );

    // 4. Recalculate customer deposit balance
    const [recalcRows] = await connection.query(
      `SELECT 
        COALESCE(SUM(CASE WHEN transaction_type = 'Deposit Received' THEN amount ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN transaction_type = 'Deposit Returned' THEN amount ELSE 0 END), 0) AS balance
       FROM can_deposit_ledger
       WHERE customer_id = ?`,
      [customerId]
    );
    const updatedBalance = parseFloat(recalcRows[0].balance);

    await connection.query(
      `UPDATE customers SET deposit_balance = ? WHERE id = ?`,
      [updatedBalance, customerId]
    );

    await connection.commit();
    res.json({ ok: true, message: 'Transaction deleted and customer balance recalculated successfully!' });
  } catch (error) {
    await connection.rollback();
    res.status(400).json({ ok: false, error: error.message });
  } finally {
    connection.release();
  }
});

export default router;
