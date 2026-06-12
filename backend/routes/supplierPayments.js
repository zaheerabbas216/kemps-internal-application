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

// GET /api/supplier-payments/bills - Get credit bills with aggregates
router.get('/bills', async (req, res) => {
  try {
    const { status = 'ALL', billedTo = 'ALL', search = '' } = req.query;

    let queryParams = [];
    let whereClauses = ["b.payment_method = 'Credit'"];

    if (status !== 'ALL') {
      whereClauses.push("b.status = ?");
      queryParams.push(status);
    }

    if (billedTo !== 'ALL') {
      whereClauses.push("b.billed_to = ?");
      queryParams.push(billedTo);
    }

    if (search.trim()) {
      whereClauses.push("(c.company_name LIKE ? OR b.bill_number LIKE ?)");
      const wild = `%${search.trim()}%`;
      queryParams.push(wild, wild);
    }

    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const query = `
      SELECT 
        b.id,
        DATE_FORMAT(b.bill_date, '%Y-%m-%d') as bill_date,
        b.supplier_id,
        c.company_name AS supplier_name,
        b.billed_to,
        b.bill_number,
        b.payment_method,
        b.grand_total,
        b.advance_paid,
        b.credit_note,
        b.status,
        b.is_manual,
        b.remarks,
        COALESCE(p_sum.total_paid, 0) AS total_paid,
        (b.grand_total - b.advance_paid - b.credit_note - COALESCE(p_sum.total_paid, 0)) AS balance_due,
        (SELECT COUNT(*) FROM supplier_payments sp WHERE sp.bill_id = b.id AND sp.payment_status = 'Pending Approval') > 0 AS has_pending_payment
      FROM inventory_bills b
      JOIN company_details c ON b.supplier_id = c.id
      LEFT JOIN (
        SELECT bill_id, SUM(amount) AS total_paid 
        FROM supplier_payments 
        WHERE payment_status = 'Approved'
        GROUP BY bill_id
      ) p_sum ON b.id = p_sum.bill_id
      ${whereStr}
      ORDER BY b.bill_date DESC, b.created_at DESC
    `;

    const [bills] = await pool.query(query, queryParams);

    // Calculate overall aggregates for pending bills matching the billedTo company filter
    let pendingCount = 0;
    let totalCredit = 0;
    let totalAdvance = 0;
    let totalPaid = 0;
    let totalBalance = 0;

    bills.forEach(b => {
      if (b.status === 'PENDING') {
        pendingCount++;
        totalCredit += parseFloat(b.grand_total) || 0;
        totalAdvance += parseFloat(b.advance_paid) || 0;
        totalPaid += parseFloat(b.total_paid) || 0;
        totalBalance += parseFloat(b.balance_due) || 0;
      }
    });

    res.json({
      ok: true,
      bills,
      summary: {
        pendingCount,
        totalCredit,
        totalAdvance,
        totalPaid,
        totalBalance
      }
    });
  } catch (error) {
    console.error('Fetch supplier bills error:', error);
    res.status(400).json({ ok: false, error: error.message });
  }
});

// POST /api/supplier-payments/manual-bill - Add manual credit bill
router.post('/manual-bill', async (req, res) => {
  try {
    const { billDate, supplierId, billedTo, billNumber, grandTotal, advancePaid = 0, creditNote = 0, remarks } = req.body;

    if (!billDate) throw new Error('Billing Date is required.');
    if (!supplierId) throw new Error('Supplier / Company Name is required.');
    if (!billedTo) throw new Error('Billed To Company is required.');
    if (parseFloat(grandTotal) <= 0 || isNaN(parseFloat(grandTotal))) {
      throw new Error('Total Bill Amount must be greater than 0.');
    }

    const billId = await generateId('BILL-M', 'inventory_bills', 'id');
    const balance = parseFloat(grandTotal) - parseFloat(advancePaid) - parseFloat(creditNote);
    const status = balance <= 0 ? 'SETTLED' : 'PENDING';

    await pool.query(
      `INSERT INTO inventory_bills 
       (id, bill_date, supplier_id, billed_to, bill_number, payment_method, sub_total, total_tax, additional_expenses, grand_total, remarks, is_manual, advance_paid, credit_note, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'Credit', ?, 0, 0, ?, ?, TRUE, ?, ?, ?, NOW())`,
      [
        billId,
        billDate,
        supplierId,
        billedTo,
        billNumber || '',
        parseFloat(grandTotal), // sub_total is same as grand_total for manual
        parseFloat(grandTotal),
        remarks || '',
        parseFloat(advancePaid),
        parseFloat(creditNote),
        status
      ]
    );

    res.json({ ok: true, id: billId, message: 'Manual credit bill saved successfully!' });
  } catch (error) {
    console.error('Save manual bill error:', error);
    res.status(400).json({ ok: false, error: error.message });
  }
});

// PUT /api/supplier-payments/bill/:id - Edit credit bill details
router.put('/bill/:id', async (req, res) => {
  const { id } = req.params;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { grandTotal, advancePaid = 0, creditNote = 0, remarks } = req.body;

    if (parseFloat(grandTotal) <= 0 || isNaN(parseFloat(grandTotal))) {
      throw new Error('Total Bill Amount must be greater than 0.');
    }

    // 1. Fetch current payments
    const [payRows] = await connection.query(
      `SELECT COALESCE(SUM(amount), 0) AS paid FROM supplier_payments WHERE bill_id = ?`,
      [id]
    );
    const totalPaid = parseFloat(payRows[0].paid) || 0;

    const balance = parseFloat(grandTotal) - parseFloat(advancePaid) - parseFloat(creditNote) - totalPaid;
    const status = balance <= 0 ? 'SETTLED' : 'PENDING';

    // 2. Update bill details
    await connection.query(
      `UPDATE inventory_bills 
       SET grand_total = ?, sub_total = ?, advance_paid = ?, credit_note = ?, remarks = ?, status = ?
       WHERE id = ?`,
      [
        parseFloat(grandTotal),
        parseFloat(grandTotal),
        parseFloat(advancePaid),
        parseFloat(creditNote),
        remarks || '',
        status,
        id
      ]
    );

    await connection.commit();
    res.json({ ok: true, message: 'Bill updated successfully!' });
  } catch (error) {
    await connection.rollback();
    console.error('Update bill error:', error);
    res.status(400).json({ ok: false, error: error.message });
  } finally {
    connection.release();
  }
});

// PUT /api/supplier-payments/bill/:id/cancel - Cancel credit bill
router.put('/bill/:id/cancel', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query(
      `UPDATE inventory_bills SET status = 'CANCELLED' WHERE id = ?`,
      [id]
    );
    res.json({ ok: true, message: 'Bill cancelled successfully.' });
  } catch (error) {
    console.error('Cancel bill error:', error);
    res.status(400).json({ ok: false, error: error.message });
  }
});

// POST /api/supplier-payments/pay - Make payment instalment against bill
router.post('/pay', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { billId, paymentDate, amount, paymentMode, notes } = req.body;

    if (!billId) throw new Error('Bill Reference is required.');
    if (!paymentDate) throw new Error('Payment Date is required.');
    if (parseFloat(amount) <= 0 || isNaN(parseFloat(amount))) {
      throw new Error('Payment Amount must be greater than 0.');
    }
    if (!paymentMode) throw new Error('Payment Mode is required.');

    // 1. Fetch current bill values
    const [billRows] = await connection.query(
      `SELECT b.grand_total, b.advance_paid, b.credit_note, b.status, b.supplier_id, c.company_name AS supplier_name 
       FROM inventory_bills b
       JOIN company_details c ON b.supplier_id = c.id
       WHERE b.id = ? FOR UPDATE`,
      [billId]
    );

    if (billRows.length === 0) throw new Error('Bill not found.');
    const bill = billRows[0];

    if (bill.status === 'CANCELLED') throw new Error('Cannot pay against a cancelled bill.');

    // 2. Fetch sum of already approved/pending instalments
    const [payRows] = await connection.query(
      `SELECT 
         COALESCE(SUM(CASE WHEN payment_status = 'Approved' THEN amount ELSE 0 END), 0) AS approved_paid,
         COALESCE(SUM(CASE WHEN payment_status = 'Pending Approval' THEN pending_amount ELSE 0 END), 0) AS pending_paid
       FROM supplier_payments 
       WHERE bill_id = ?`,
      [billId]
    );
    const approvedPaid = parseFloat(payRows[0].approved_paid) || 0;
    const pendingPaid = parseFloat(payRows[0].pending_paid) || 0;
    const totalPaid = approvedPaid; // only approved affects outstanding dues

    const remainingBalance = parseFloat(bill.grand_total) - parseFloat(bill.advance_paid) - parseFloat(bill.credit_note) - totalPaid;
    const allowedPayment = remainingBalance - pendingPaid;

    if (parseFloat(amount) > allowedPayment) {
      throw new Error(`Payment amount (₹${amount}) exceeds the remaining balance due (₹${allowedPayment.toFixed(2)}) considering pending approvals.`);
    }

    // 3. Generate Payment ID
    const payId = await generateId('PAY', 'supplier_payments', 'id');

    // 4. Auto-create Payment Approval entry for supplier payment
    const approvalId = await createPaymentApprovalEntry({
      transactionId: payId,
      sourceModule: 'SupplierPayment',
      transactionType: 'Cash Out',
      referenceNo: billId,
      partyName: `[${bill.supplier_id}] ${bill.supplier_name}`,
      description: `Supplier Payment for Bill ${billId} — ${bill.supplier_name}`,
      paymentMethod: paymentMode,
      cashAmount: paymentMode === 'Cash' ? parseFloat(amount) : 0,
      upiAmount: paymentMode === 'UPI' ? parseFloat(amount) : 0,
      bankAmount: (paymentMode === 'Bank' || paymentMode === 'Bank Transfer') ? parseFloat(amount) : 0,
      amount: parseFloat(amount),
      transactionDate: paymentDate,
      enteredBy: req.admin?.name || req.admin?.username || 'Admin',
      remarks: notes || ''
    }, connection);

    // 5. Insert instalment payment record
    await connection.query(
      `INSERT INTO supplier_payments (id, bill_id, payment_date, amount, payment_mode, notes, 
        payment_status, pending_amount, approved_amount, rejected_amount, approval_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'Pending Approval', ?, 0.00, 0.00, ?, NOW())`,
      [payId, billId, paymentDate, parseFloat(amount), paymentMode, notes || '', parseFloat(amount), approvalId || null]
    );

    await connection.commit();

    res.json({ ok: true, id: payId, message: 'Payment recorded and queued for verification.' });
  } catch (error) {
    await connection.rollback();
    console.error('Make payment error:', error);
    res.status(400).json({ ok: false, error: error.message });
  } finally {
    connection.release();
  }
});

// GET /api/supplier-payments/payments - Retrieve payment history list
router.get('/payments', async (req, res) => {
  try {
    const { billedTo = 'ALL', search = '' } = req.query;

    let queryParams = [];
    let whereClauses = [];

    if (billedTo !== 'ALL') {
      whereClauses.push("b.billed_to = ?");
      queryParams.push(billedTo);
    }

    if (search.trim()) {
      whereClauses.push("(c.company_name LIKE ? OR b.bill_number LIKE ? OR p.notes LIKE ?)");
      const wild = `%${search.trim()}%`;
      queryParams.push(wild, wild, wild);
    }

    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const query = `
      SELECT 
        p.id,
        DATE_FORMAT(p.payment_date, '%Y-%m-%d') as payment_date,
        p.bill_id,
        p.amount,
        p.payment_mode,
        p.notes,
        b.bill_number,
        b.billed_to,
        c.company_name AS supplier_name,
        p.payment_status
      FROM supplier_payments p
      JOIN inventory_bills b ON p.bill_id = b.id
      JOIN company_details c ON b.supplier_id = c.id
      ${whereStr}
      ORDER BY p.payment_date DESC, p.created_at DESC
    `;

    const [payments] = await pool.query(query, queryParams);

    // Calculate sum of payments for display
    const totalPaymentsCount = payments.length;
    const totalPaidSum = payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);

    res.json({
      ok: true,
      payments,
      summary: {
        totalPaymentsCount,
        totalPaidSum
      }
    });
  } catch (error) {
    console.error('Fetch payment history error:', error);
    res.status(400).json({ ok: false, error: error.message });
  }
});

export default router;
