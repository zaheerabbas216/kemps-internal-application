import express from 'express';
import pool from '../config/db.js';
import { createPaymentApprovalEntry } from '../helpers/paymentApprovalHelper.js';

const router = express.Router();

// Helper to generate sequence ID
async function generateId(prefix, table, idColumn, connection = pool) {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const istDate = new Date(now.getTime() + (330 + offset) * 60000);
  const yyyy = istDate.getFullYear();
  
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

// GET /api/credit-balance/stats - Computes aggregates for stats cards
router.get('/stats', async (req, res) => {
  try {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const istDate = new Date(now.getTime() + (330 + offset) * 60000);
    const yyyy = istDate.getFullYear();
    const mm = String(istDate.getMonth() + 1).padStart(2, '0');
    const dd = String(istDate.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;
    const monthStr = `${yyyy}-${mm}`;

    // 1. Total Outstanding
    const [outRows] = await pool.query(
      `SELECT COALESCE(SUM(due_amount), 0) AS totalOutstanding FROM customer_bills WHERE due_amount > 0`
    );

    // 2. Unique Due Customers
    const [custRows] = await pool.query(
      `SELECT COUNT(DISTINCT customer_phone) AS dueCustomers FROM customer_bills WHERE due_amount > 0`
    );

    // 3. Today's Collections
    const [todayRows] = await pool.query(
      `SELECT COALESCE(SUM(amount_received), 0) AS todaysCollections FROM customer_payments WHERE payment_date = ?`,
      [todayStr]
    );

    // 4. This Month's Collections
    const [monthRows] = await pool.query(
      `SELECT COALESCE(SUM(amount_received), 0) AS thisMonthsCollections FROM customer_payments WHERE DATE_FORMAT(payment_date, '%Y-%m') = ?`,
      [monthStr]
    );

    res.json({
      ok: true,
      stats: {
        totalOutstanding: parseFloat(outRows[0].totalOutstanding),
        dueCustomers: parseInt(custRows[0].dueCustomers, 10),
        todaysCollections: parseFloat(todayRows[0].todaysCollections),
        thisMonthsCollections: parseFloat(monthRows[0].thisMonthsCollections)
      }
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// GET /api/credit-balance/outstanding - Retrieves active outstanding invoices
router.get('/outstanding', async (req, res) => {
  try {
    let { page = 1, limit = 10, search = '', startDate = '', endDate = '', company = '', customerType = '' } = req.query;
    page = parseInt(page, 10);
    limit = parseInt(limit, 10);
    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1) limit = 10;

    const offset = (page - 1) * limit;
    let queryParams = [];
    let whereClauses = ['cb.due_amount > 0'];

    if (startDate) {
      whereClauses.push('cb.billing_date >= ?');
      queryParams.push(startDate);
    }
    if (endDate) {
      whereClauses.push('cb.billing_date <= ?');
      queryParams.push(endDate);
    }

    if (company && company !== 'All' && company !== 'All Companies') {
      whereClauses.push('cb.company = ?');
      queryParams.push(company);
    }

    if (customerType && customerType !== 'All' && customerType !== 'All Types') {
      whereClauses.push('cb.customer_type = ?');
      queryParams.push(customerType);
    }

    if (search.trim()) {
      whereClauses.push('(cb.customer_name LIKE ? OR cb.customer_phone LIKE ? OR cb.id LIKE ? OR cb.customer_id LIKE ?)');
      const wild = `%${search.trim()}%`;
      queryParams.push(wild, wild, wild, wild);
    }

    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Count
    const [countRows] = await pool.query(
      `SELECT COUNT(*) as count FROM customer_bills cb ${whereStr}`,
      queryParams
    );
    const total = countRows[0].count;

    // Invoices list
    let selectParams = [...queryParams, limit, offset];
    const [rows] = await pool.query(
      `SELECT 
         cb.id,
         DATE_FORMAT(cb.billing_date, '%Y-%m-%d') as billing_date,
         cb.company,
         cb.customer_type,
         cb.customer_id,
         cb.customer_name,
         cb.customer_phone,
         cb.customer_gstin,
         cb.customer_address,
         cb.grand_total,
         cb.payment_mode,
         cb.amount_paid,
         cb.due_amount,
         cb.created_at,
         (SELECT COUNT(*) FROM customer_payments cp WHERE cp.bill_id = cb.id AND cp.payment_status = 'Pending Approval') > 0 AS has_pending_payment
       FROM customer_bills cb
       ${whereStr}
       ORDER BY cb.billing_date DESC, cb.created_at DESC
       LIMIT ? OFFSET ?`,
      selectParams
    );

    res.json({
      ok: true,
      bills: rows,
      total,
      page,
      limit
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// GET /api/credit-balance/history - Retrieves cleared and completed payments log
router.get('/history', async (req, res) => {
  try {
    let { page = 1, limit = 10, search = '', startDate = '', endDate = '', company = '', customerType = '' } = req.query;
    page = parseInt(page, 10);
    limit = parseInt(limit, 10);
    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1) limit = 10;

    const offset = (page - 1) * limit;
    let queryParams = [];
    let whereClauses = []; // all recorded partial payments

    if (startDate) {
      whereClauses.push('cp.payment_date >= ?');
      queryParams.push(startDate);
    }
    if (endDate) {
      whereClauses.push('cp.payment_date <= ?');
      queryParams.push(endDate);
    }

    if (company && company !== 'All' && company !== 'All Companies') {
      whereClauses.push('cb.company = ?');
      queryParams.push(company);
    }

    if (customerType && customerType !== 'All' && customerType !== 'All Types') {
      whereClauses.push('cb.customer_type = ?');
      queryParams.push(customerType);
    }

    if (search.trim()) {
      whereClauses.push('(cb.customer_name LIKE ? OR cb.customer_phone LIKE ? OR cb.id LIKE ? OR cp.id LIKE ?)');
      const wild = `%${search.trim()}%`;
      queryParams.push(wild, wild, wild, wild);
    }

    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Count
    const [countRows] = await pool.query(
      `SELECT COUNT(*) as count 
       FROM customer_payments cp
       JOIN customer_bills cb ON cp.bill_id = cb.id
       ${whereStr}`,
      queryParams
    );
    const total = countRows[0].count;

    // Payments list
    let selectParams = [...queryParams, limit, offset];
    const [rows] = await pool.query(
      `SELECT 
         cp.id as payment_id,
         DATE_FORMAT(cp.payment_date, '%Y-%m-%d') as payment_date,
         cp.bill_id as invoice_no,
         cb.customer_name,
         cb.company,
         cb.customer_type,
         cb.grand_total as invoice_amount,
         cp.amount_received,
         cp.payment_method,
         cb.due_amount,
         cb.amount_paid as total_paid,
         cp.payment_status
       FROM customer_payments cp
       JOIN customer_bills cb ON cp.bill_id = cb.id
       ${whereStr}
       ORDER BY cp.payment_date DESC, cp.created_at DESC
       LIMIT ? OFFSET ?`,
      selectParams
    );

    res.json({
      ok: true,
      payments: rows,
      total,
      page,
      limit
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// GET /api/credit-balance/timeline/:billId - Retrieves timeline payments list
router.get('/timeline/:billId', async (req, res) => {
  try {
    const { billId } = req.params;

    // Fetch bill details
    const [billRows] = await pool.query(
      `SELECT 
         cb.id,
         DATE_FORMAT(cb.billing_date, '%Y-%m-%d') as billing_date,
         cb.customer_name,
         cb.customer_phone,
         cb.company,
         cb.customer_type,
         cb.grand_total,
         cb.amount_paid,
         cb.due_amount,
         cb.payment_mode
       FROM customer_bills cb
       WHERE cb.id = ?`,
      [billId]
    );

    if (billRows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Invoice not found.' });
    }

    // Fetch payment list
    const [paymentRows] = await pool.query(
      `SELECT 
         cp.id as payment_id,
         DATE_FORMAT(cp.payment_date, '%Y-%m-%d') as payment_date,
         cp.payment_method,
         cp.amount_received,
         cp.remarks,
         cp.created_at
       FROM customer_payments cp
       WHERE cp.bill_id = ?
       ORDER BY cp.payment_date ASC, cp.created_at ASC`,
      [billId]
    );

    // Fetch sales returns list
    const [returnRows] = await pool.query(
      `SELECT 
         sr.id as return_id,
         DATE_FORMAT(sr.return_date, '%Y-%m-%d') as return_date,
         sr.total_return_amount,
         sr.reason,
         sr.created_at
       FROM sales_returns sr
       WHERE sr.bill_id = ?
       ORDER BY sr.return_date ASC, sr.created_at ASC`,
      [billId]
    );

    res.json({
      ok: true,
      bill: billRows[0],
      payments: paymentRows,
      returns: returnRows
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// POST /api/credit-balance/receive - Records payment against outstanding balance (Transaction Safe)
router.post('/receive', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const {
      billId,
      paymentDate,
      paymentMethod,
      amountReceived,
      remarks = ''
    } = req.body;

    // Validations
    if (!billId) throw new Error('Invoice reference ID (billId) is required.');
    if (!paymentDate) throw new Error('Payment Date is required.');
    if (!paymentMethod) throw new Error('Payment Method is required.');
    
    const amt = parseFloat(amountReceived);
    if (isNaN(amt) || amt <= 0) {
      throw new Error('Amount received must be greater than 0.');
    }

    // 1. Fetch current bill outstanding
    const [billRows] = await connection.query(
      `SELECT grand_total, amount_paid, due_amount, customer_id, customer_name FROM customer_bills WHERE id = ? FOR UPDATE`,
      [billId]
    );

    if (billRows.length === 0) {
      throw new Error('Invoice not found.');
    }

    const bill = billRows[0];
    const currentDue = parseFloat(bill.due_amount);

    if (currentDue <= 0) {
      throw new Error('This invoice has already been fully paid and cleared.');
    }

    if (amt > currentDue) {
      throw new Error(`Amount received (${amt}) cannot exceed outstanding balance (${currentDue}).`);
    }

    const [pendingRows] = await connection.query(
      `SELECT COALESCE(SUM(pending_amount), 0) AS pending_total 
       FROM customer_payments 
       WHERE bill_id = ? AND payment_status = 'Pending Approval'`,
      [billId]
    );
    const pendingTotal = parseFloat(pendingRows[0].pending_total) || 0;
    const remainingDue = currentDue - pendingTotal;

    if (amt > remainingDue) {
      throw new Error(`Amount received (${amt}) cannot exceed remaining outstanding balance (₹${remainingDue.toFixed(2)}) considering pending approvals.`);
    }

    // 2. Generate Payment ID
    const paymentId = await generateId('PAY', 'customer_payments', 'id', connection);

    // 3. Auto-create Payment Approval entry for credit collection
    const approvalId = await createPaymentApprovalEntry({
      transactionId: paymentId,
      sourceModule: 'CreditBalance',
      transactionType: 'Cash In',
      referenceNo: billId,
      partyName: bill.customer_id ? `[${bill.customer_id}] ${bill.customer_name}` : (bill.customer_name || ''),
      description: `Credit collection for Invoice ${billId} — ${bill.customer_name || ''}`,
      paymentMethod: paymentMethod,
      cashAmount: paymentMethod === 'Cash' ? amt : 0,
      upiAmount: paymentMethod === 'UPI' ? amt : 0,
      bankAmount: (paymentMethod === 'Bank' || paymentMethod === 'Bank Transfer') ? amt : 0,
      amount: amt,
      transactionDate: paymentDate,
      enteredBy: req.admin?.name || req.admin?.username || 'Admin',
      remarks: remarks
    }, connection);

    // 4. Insert payment record
    await connection.query(
      `INSERT INTO customer_payments 
       (id, bill_id, payment_date, payment_method, amount_received, remarks, 
        payment_status, pending_amount, approved_amount, rejected_amount, approval_id, created_at)
       VALUES (?, ?, ?, ?, 0.00, ?, 'Pending Approval', ?, 0.00, 0.00, ?, NOW())`,
      [
        paymentId,
        billId,
        paymentDate,
        paymentMethod,
        remarks,
        amt,
        approvalId || null
      ]
    );

    await connection.commit();

    res.json({ 
      ok: true, 
      paymentId, 
      newDue: remainingDue - amt,
      message: 'Payment collection queued for verification.' 
    });
  } catch (error) {
    await connection.rollback();
    console.error('Receive payment error:', error);
    res.status(400).json({ ok: false, error: error.message });
  } finally {
    connection.release();
  }
});

export default router;
