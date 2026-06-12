import express from 'express';
import pool from '../config/db.js';

const router = express.Router();

// Helper to generate approval_id  e.g. PAY-2026-00001
async function generateApprovalId(connection = pool) {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const istDate = new Date(now.getTime() + (330 + offset) * 60000);
  const yyyy = istDate.getFullYear();

  const [rows] = await connection.query(
    `SELECT approval_id FROM payment_approvals WHERE approval_id LIKE ? ORDER BY approval_id DESC LIMIT 1`,
    [`PAY-${yyyy}-%`]
  );

  let seq = 1;
  if (rows.length) {
    const match = rows[0].approval_id.match(/^PAY-\d{4}-(\d+)$/);
    if (match && match[1]) seq = parseInt(match[1]) + 1;
  }
  return `PAY-${yyyy}-${String(seq).padStart(5, '0')}`;
}

// IST today string
function istToday() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const ist = new Date(now.getTime() + (330 + offset) * 60000);
  const yyyy = ist.getFullYear();
  const mm = String(ist.getMonth() + 1).padStart(2, '0');
  const dd = String(ist.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// ─────────────────────────────────────────────
//  POST /api/payment-approval
//  Internal: Create a new pending entry (called by other modules)
// ─────────────────────────────────────────────
router.post('/', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const {
      transactionId,
      sourceModule,
      transactionType,
      referenceNo = '',
      partyName = '',
      description = '',
      paymentMethod = 'Cash',
      cashAmount = 0,
      upiAmount = 0,
      bankAmount = 0,
      amount,
      transactionDate,
      enteredBy = '',
      remarks = ''
    } = req.body;

    if (!transactionId) throw new Error('transactionId is required.');
    if (!sourceModule) throw new Error('sourceModule is required.');
    if (!transactionType) throw new Error('transactionType is required.');
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) throw new Error('Valid amount is required.');
    if (!transactionDate) throw new Error('transactionDate is required.');

    // Prevent duplicates
    const [existing] = await connection.query(
      `SELECT approval_id FROM payment_approvals WHERE transaction_id = ? AND source_module = ?`,
      [transactionId, sourceModule]
    );
    if (existing.length > 0) {
      await connection.rollback();
      connection.release();
      return res.json({ ok: true, approvalId: existing[0].approval_id, message: 'Approval entry already exists.' });
    }

    const approvalId = await generateApprovalId(connection);

    await connection.query(
      `INSERT INTO payment_approvals 
       (approval_id, transaction_id, source_module, transaction_type, reference_no, party_name, description,
        payment_method, cash_amount, upi_amount, bank_amount, amount, transaction_date, entered_by, remarks, 
        status, cash_ledger_updated, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', 0, NOW(), NOW())`,
      [
        approvalId,
        transactionId,
        sourceModule,
        transactionType,
        referenceNo,
        partyName,
        description,
        paymentMethod,
        parseFloat(cashAmount) || 0,
        parseFloat(upiAmount) || 0,
        parseFloat(bankAmount) || 0,
        parseFloat(amount),
        transactionDate,
        enteredBy,
        remarks
      ]
    );

    await connection.commit();
    res.json({ ok: true, approvalId, message: 'Payment approval entry created.' });
  } catch (error) {
    await connection.rollback();
    console.error('Create payment approval error:', error);
    res.status(400).json({ ok: false, error: error.message });
  } finally {
    connection.release();
  }
});

// ─────────────────────────────────────────────
//  GET /api/payment-approval/summary
//  Dashboard summary cards
// ─────────────────────────────────────────────
router.get('/summary', async (req, res) => {
  try {
    const today = istToday();

    // Pending counts & amounts
    const [pendingRows] = await pool.query(`
      SELECT 
        COUNT(*) AS totalPending,
        COALESCE(SUM(CASE WHEN transaction_type = 'Cash In' THEN amount ELSE 0 END), 0) AS pendingCashIn,
        COALESCE(SUM(CASE WHEN transaction_type = 'Cash Out' THEN amount ELSE 0 END), 0) AS pendingCashOut
      FROM payment_approvals WHERE status = 'Pending'
    `);

    // Today's approved
    const [approvedTodayRows] = await pool.query(`
      SELECT 
        COALESCE(SUM(CASE WHEN transaction_type = 'Cash In' THEN amount ELSE 0 END), 0) AS approvedCashIn,
        COALESCE(SUM(CASE WHEN transaction_type = 'Cash Out' THEN amount ELSE 0 END), 0) AS approvedCashOut
      FROM payment_approvals 
      WHERE status = 'Approved' AND DATE(approved_at) = ?
    `, [today]);

    // Total rejected
    const [rejectedRows] = await pool.query(`
      SELECT COUNT(*) AS totalRejected FROM payment_approvals WHERE status = 'Rejected'
    `);

    // Current cash balance — last entry in cash_ledger
    const [balanceRows] = await pool.query(`
      SELECT closing_balance FROM cash_ledger ORDER BY id DESC LIMIT 1
    `);
    const currentBalance = balanceRows.length > 0 ? parseFloat(balanceRows[0].closing_balance) : 0;

    res.json({
      ok: true,
      summary: {
        totalPending: parseInt(pendingRows[0].totalPending, 10),
        pendingCashIn: parseFloat(pendingRows[0].pendingCashIn),
        pendingCashOut: parseFloat(pendingRows[0].pendingCashOut),
        approvedCashIn: parseFloat(approvedTodayRows[0].approvedCashIn),
        approvedCashOut: parseFloat(approvedTodayRows[0].approvedCashOut),
        currentBalance,
        totalRejected: parseInt(rejectedRows[0].totalRejected, 10)
      }
    });
  } catch (error) {
    console.error('Summary error:', error);
    res.status(400).json({ ok: false, error: error.message });
  }
});

// ─────────────────────────────────────────────
//  GET /api/payment-approval
//  List with filters
// ─────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    let {
      status = 'All',
      transactionType = 'All',
      sourceModule = 'All',
      startDate = '',
      endDate = '',
      search = '',
      page = 1,
      limit = 50
    } = req.query;

    page = parseInt(page, 10) || 1;
    limit = parseInt(limit, 10) || 50;
    const offset = (page - 1) * limit;

    let whereClauses = [];
    let queryParams = [];

    if (status !== 'All') {
      whereClauses.push('status = ?');
      queryParams.push(status);
    }
    if (transactionType !== 'All') {
      whereClauses.push('transaction_type = ?');
      queryParams.push(transactionType);
    }
    if (sourceModule !== 'All') {
      whereClauses.push('source_module = ?');
      queryParams.push(sourceModule);
    }
    if (startDate) {
      whereClauses.push('transaction_date >= ?');
      queryParams.push(startDate);
    }
    if (endDate) {
      whereClauses.push('transaction_date <= ?');
      queryParams.push(endDate);
    }
    if (search.trim()) {
      whereClauses.push('(approval_id LIKE ? OR reference_no LIKE ? OR party_name LIKE ? OR transaction_id LIKE ?)');
      const wild = `%${search.trim()}%`;
      queryParams.push(wild, wild, wild, wild);
    }

    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS count FROM payment_approvals ${whereStr}`,
      queryParams
    );
    const total = countRows[0].count;

    const [rows] = await pool.query(
      `SELECT * FROM payment_approvals ${whereStr} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...queryParams, limit, offset]
    );

    res.json({ ok: true, approvals: rows, total, page, limit });
  } catch (error) {
    console.error('List approvals error:', error);
    res.status(400).json({ ok: false, error: error.message });
  }
});

// ─────────────────────────────────────────────
//  PUT /api/payment-approval/:approvalId/approve
// ─────────────────────────────────────────────
router.put('/:approvalId/approve', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { approvalId } = req.params;
    const approvedBy = req.admin?.name || req.admin?.username || 'Admin';

    // 1. Fetch the approval entry — lock it
    const [rows] = await connection.query(
      `SELECT * FROM payment_approvals WHERE approval_id = ? FOR UPDATE`,
      [approvalId]
    );
    if (rows.length === 0) throw new Error('Approval entry not found.');
    const entry = rows[0];

    if (entry.status !== 'Pending') {
      throw new Error(`Transaction is already ${entry.status}. Cannot approve again.`);
    }

    // 2. Get latest cash balance
    const [balRows] = await connection.query(
      `SELECT closing_balance FROM cash_ledger ORDER BY id DESC LIMIT 1 FOR UPDATE`
    );
    const openingBalance = balRows.length > 0 ? parseFloat(balRows[0].closing_balance) : 0;
    const amount = parseFloat(entry.amount);
    const closingBalance = entry.transaction_type === 'Cash In'
      ? openingBalance + amount
      : openingBalance - amount;

    // 3. Insert into cash_ledger
    await connection.query(
      `INSERT INTO cash_ledger 
       (approval_id, transaction_id, reference_no, type, source_module, description, amount, 
        opening_balance, closing_balance, approved_by, approved_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        approvalId,
        entry.transaction_id,
        entry.reference_no,
        entry.transaction_type,
        entry.source_module,
        entry.description,
        amount,
        openingBalance,
        closingBalance,
        approvedBy
      ]
    );

    // 4. Dispatch status updates to corresponding source modules
    if (entry.source_module === 'Billing') {
      await connection.query(
        `UPDATE customer_bills 
         SET payment_status = 'Approved', 
             approved_amount = pending_amount, 
             amount_paid = pending_amount, 
             due_amount = grand_total - pending_amount, 
             pending_amount = 0.00,
             last_status_update = NOW()
         WHERE approval_id = ?`,
        [approvalId]
      );
    } else if (entry.source_module === 'CreditBalance') {
      // Fetch details from customer_payments
      const [cpRows] = await connection.query(
        `SELECT bill_id, pending_amount FROM customer_payments WHERE approval_id = ? FOR UPDATE`,
        [approvalId]
      );
      if (cpRows.length > 0) {
        const { bill_id, pending_amount } = cpRows[0];
        
        await connection.query(
          `UPDATE customer_payments 
           SET payment_status = 'Approved', 
               approved_amount = pending_amount, 
               amount_received = pending_amount, 
               pending_amount = 0.00,
               last_status_update = NOW()
           WHERE approval_id = ?`,
          [approvalId]
        );

        // Update parent bill dues
        await connection.query(
          `UPDATE customer_bills 
           SET amount_paid = amount_paid + ?, 
               due_amount = due_amount - ?
           WHERE id = ?`,
          [pending_amount, pending_amount, bill_id]
        );

        // If due_amount becomes <= 0, mark the parent bill's payment_status as Approved
        await connection.query(
          `UPDATE customer_bills
           SET payment_status = CASE WHEN due_amount <= 0 THEN 'Approved' ELSE payment_status END
           WHERE id = ?`,
          [bill_id]
        );
      }
    } else if (entry.source_module === 'Expense') {
      await connection.query(
        `UPDATE expenses 
         SET payment_status = 'Approved', 
             approved_amount = pending_amount, 
             pending_amount = 0.00,
             last_status_update = NOW()
         WHERE approval_id = ?`,
        [approvalId]
      );
    } else if (entry.source_module === 'SupplierPayment') {
      const [spRows] = await connection.query(
        `SELECT bill_id, pending_amount FROM supplier_payments WHERE approval_id = ? FOR UPDATE`,
        [approvalId]
      );
      if (spRows.length > 0) {
        const { bill_id, pending_amount } = spRows[0];

        await connection.query(
          `UPDATE supplier_payments 
           SET payment_status = 'Approved', 
               approved_amount = pending_amount, 
               amount = pending_amount, 
               pending_amount = 0.00,
               last_status_update = NOW()
           WHERE approval_id = ?`,
          [approvalId]
        );

        // Recalculate bill status
        const [billRows] = await connection.query(
          `SELECT grand_total, advance_paid, credit_note FROM inventory_bills WHERE id = ? FOR UPDATE`,
          [bill_id]
        );
        if (billRows.length > 0) {
          const bill = billRows[0];
          const [sumRows] = await connection.query(
            `SELECT COALESCE(SUM(amount), 0) AS total_paid 
             FROM supplier_payments 
             WHERE bill_id = ? AND payment_status = 'Approved'`,
            [bill_id]
          );
          const totalPaid = parseFloat(sumRows[0].total_paid) || 0;
          const remainingBalance = parseFloat(bill.grand_total) - parseFloat(bill.advance_paid) - parseFloat(bill.credit_note) - totalPaid;
          const newStatus = remainingBalance <= 0 ? 'SETTLED' : 'PENDING';

          await connection.query(
            `UPDATE inventory_bills SET status = ? WHERE id = ?`,
            [newStatus, bill_id]
          );
        }
      }
    } else if (entry.source_module === 'CanDeposit') {
      const [cdRows] = await connection.query(
        `SELECT transaction_type, customer_id, pending_amount, transaction_id FROM can_deposit_ledger WHERE approval_id = ? FOR UPDATE`,
        [approvalId]
      );
      if (cdRows.length > 0) {
        const { transaction_type, customer_id, pending_amount, transaction_id } = cdRows[0];

        // Retrieve customer latest deposit balance
        const [custRows] = await connection.query(
          `SELECT deposit_balance FROM customers WHERE id = ? FOR UPDATE`,
          [customer_id]
        );
        const currentDepBalance = custRows.length > 0 ? parseFloat(custRows[0].deposit_balance) : 0;
        const newDepBalance = transaction_type === 'Deposit Received'
          ? currentDepBalance + parseFloat(pending_amount)
          : currentDepBalance - parseFloat(pending_amount);

        // Update customer deposit balance
        await connection.query(
          `UPDATE customers SET deposit_balance = ? WHERE id = ?`,
          [newDepBalance, customer_id]
        );

        // Update can_deposit_ledger
        await connection.query(
          `UPDATE can_deposit_ledger 
           SET payment_status = 'Approved', 
               approved_amount = pending_amount, 
               amount = pending_amount, 
               pending_amount = 0.00,
               balance_after_transaction = ?,
               last_status_update = NOW()
           WHERE approval_id = ?`,
          [newDepBalance, approvalId]
        );

        if (transaction_type === 'Deposit Received') {
          // Update linked generated bill
          await connection.query(
            `UPDATE customer_bills 
             SET payment_status = 'Approved', 
                 approved_amount = pending_amount, 
                 amount_paid = pending_amount, 
                 due_amount = 0.00, 
                 pending_amount = 0.00,
                 last_status_update = NOW()
             WHERE approval_id = ?`,
            [approvalId]
          );
        } else if (transaction_type === 'Deposit Returned') {
          // Update linked generated expense
          await connection.query(
            `UPDATE expenses 
             SET payment_status = 'Approved', 
                 approved_amount = pending_amount, 
                 pending_amount = 0.00,
                 last_status_update = NOW()
             WHERE approval_id = ?`,
            [approvalId]
          );
        }
      }
    }

    // 5. Update approval status
    await connection.query(
      `UPDATE payment_approvals 
       SET status = 'Approved', approved_by = ?, approved_at = NOW(), cash_ledger_updated = 1, updated_at = NOW()
       WHERE approval_id = ?`,
      [approvedBy, approvalId]
    );

    await connection.commit();
    res.json({
      ok: true,
      message: 'Transaction approved and cash ledger updated.',
      closingBalance
    });
  } catch (error) {
    await connection.rollback();
    console.error('Approve error:', error);
    res.status(400).json({ ok: false, error: error.message });
  } finally {
    connection.release();
  }
});

// ─────────────────────────────────────────────
//  PUT /api/payment-approval/:approvalId/reject
// ─────────────────────────────────────────────
router.put('/:approvalId/reject', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { approvalId } = req.params;
    const { rejectionReason = '' } = req.body;
    const rejectedBy = req.admin?.name || req.admin?.username || 'Admin';

    if (!rejectionReason.trim()) throw new Error('Rejection reason is required.');

    const [entryRows] = await connection.query(
      `SELECT * FROM payment_approvals WHERE approval_id = ? FOR UPDATE`,
      [approvalId]
    );
    if (entryRows.length === 0) throw new Error('Approval entry not found.');
    const entry = entryRows[0];

    if (entry.status !== 'Pending') {
      throw new Error(`Transaction is already ${entry.status}. Cannot reject.`);
    }

    // Dispatch rejection status updates to source modules
    if (entry.source_module === 'Billing') {
      await connection.query(
        `UPDATE customer_bills 
         SET payment_status = 'Rejected', 
             rejected_amount = pending_amount, 
             amount_paid = 0.00, 
             due_amount = grand_total, 
             pending_amount = 0.00,
             last_status_update = NOW()
         WHERE approval_id = ?`,
        [approvalId]
      );
    } else if (entry.source_module === 'CreditBalance') {
      await connection.query(
        `UPDATE customer_payments 
         SET payment_status = 'Rejected', 
             rejected_amount = pending_amount, 
             amount_received = 0.00, 
             pending_amount = 0.00,
             last_status_update = NOW()
         WHERE approval_id = ?`,
        [approvalId]
      );
    } else if (entry.source_module === 'Expense') {
      await connection.query(
        `UPDATE expenses 
         SET payment_status = 'Rejected', 
             rejected_amount = pending_amount, 
             pending_amount = 0.00,
             last_status_update = NOW()
         WHERE approval_id = ?`,
        [approvalId]
      );
    } else if (entry.source_module === 'SupplierPayment') {
      const [spRows] = await connection.query(
        `SELECT bill_id FROM supplier_payments WHERE approval_id = ? FOR UPDATE`,
        [approvalId]
      );
      
      await connection.query(
        `UPDATE supplier_payments 
         SET payment_status = 'Rejected', 
             rejected_amount = pending_amount, 
             amount = 0.00, 
             pending_amount = 0.00,
             last_status_update = NOW()
         WHERE approval_id = ?`,
        [approvalId]
      );

      // Recalculate bill status if needed (though it was pending, remains pending)
      if (spRows.length > 0) {
        const { bill_id } = spRows[0];
        const [billRows] = await connection.query(
          `SELECT grand_total, advance_paid, credit_note FROM inventory_bills WHERE id = ? FOR UPDATE`,
          [bill_id]
        );
        if (billRows.length > 0) {
          const bill = billRows[0];
          const [sumRows] = await connection.query(
            `SELECT COALESCE(SUM(amount), 0) AS total_paid 
             FROM supplier_payments 
             WHERE bill_id = ? AND payment_status = 'Approved'`,
            [bill_id]
          );
          const totalPaid = parseFloat(sumRows[0].total_paid) || 0;
          const remainingBalance = parseFloat(bill.grand_total) - parseFloat(bill.advance_paid) - parseFloat(bill.credit_note) - totalPaid;
          const newStatus = remainingBalance <= 0 ? 'SETTLED' : 'PENDING';

          await connection.query(
            `UPDATE inventory_bills SET status = ? WHERE id = ?`,
            [newStatus, bill_id]
          );
        }
      }
    } else if (entry.source_module === 'CanDeposit') {
      const [cdRows] = await connection.query(
        `SELECT transaction_type FROM can_deposit_ledger WHERE approval_id = ? FOR UPDATE`,
        [approvalId]
      );

      await connection.query(
        `UPDATE can_deposit_ledger 
         SET payment_status = 'Rejected', 
             rejected_amount = pending_amount, 
             amount = 0.00, 
             pending_amount = 0.00,
             last_status_update = NOW()
         WHERE approval_id = ?`,
        [approvalId]
      );

      if (cdRows.length > 0) {
        const { transaction_type } = cdRows[0];
        if (transaction_type === 'Deposit Received') {
          await connection.query(
            `UPDATE customer_bills 
             SET payment_status = 'Rejected', 
                 rejected_amount = pending_amount, 
                 amount_paid = 0.00, 
                 due_amount = grand_total, 
                 pending_amount = 0.00,
                 last_status_update = NOW()
             WHERE approval_id = ?`,
            [approvalId]
          );
        } else if (transaction_type === 'Deposit Returned') {
          await connection.query(
            `UPDATE expenses 
             SET payment_status = 'Rejected', 
                 rejected_amount = pending_amount, 
                 pending_amount = 0.00,
                 last_status_update = NOW()
             WHERE approval_id = ?`,
            [approvalId]
          );
        }
      }
    }

    // Update approval status
    await connection.query(
      `UPDATE payment_approvals 
       SET status = 'Rejected', rejected_by = ?, rejected_at = NOW(), rejection_reason = ?, updated_at = NOW()
       WHERE approval_id = ?`,
      [rejectedBy, rejectionReason.trim(), approvalId]
    );

    await connection.commit();
    res.json({ ok: true, message: 'Transaction rejected.' });
  } catch (error) {
    await connection.rollback();
    console.error('Reject error:', error);
    res.status(400).json({ ok: false, error: error.message });
  } finally {
    connection.release();
  }
});

// ─────────────────────────────────────────────
//  GET /api/payment-approval/cash-ledger
//  Paginated cash ledger
// ─────────────────────────────────────────────
router.get('/cash-ledger', async (req, res) => {
  try {
    let { page = 1, limit = 50, startDate = '', endDate = '' } = req.query;
    page = parseInt(page, 10) || 1;
    limit = parseInt(limit, 10) || 50;
    const offset = (page - 1) * limit;

    let whereClauses = [];
    let queryParams = [];

    if (startDate) {
      whereClauses.push('DATE(cl.approved_at) >= ?');
      queryParams.push(startDate);
    }
    if (endDate) {
      whereClauses.push('DATE(cl.approved_at) <= ?');
      queryParams.push(endDate);
    }

    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS count FROM cash_ledger cl ${whereStr}`,
      queryParams
    );

    const [rows] = await pool.query(
      `SELECT cl.*, DATE_FORMAT(cl.approved_at, '%Y-%m-%d %H:%i:%s') AS approved_at_fmt
       FROM cash_ledger cl ${whereStr}
       ORDER BY cl.id DESC LIMIT ? OFFSET ?`,
      [...queryParams, limit, offset]
    );

    res.json({ ok: true, ledger: rows, total: countRows[0].count, page, limit });
  } catch (error) {
    console.error('Cash ledger error:', error);
    res.status(400).json({ ok: false, error: error.message });
  }
});

// ─────────────────────────────────────────────
//  GET /api/payment-approval/daily-summary?date=YYYY-MM-DD
//  Day-level cash summary
// ─────────────────────────────────────────────
router.get('/daily-summary', async (req, res) => {
  try {
    const { date = istToday() } = req.query;

    // Opening = last closing_balance from the day before
    const [openRows] = await pool.query(
      `SELECT closing_balance FROM cash_ledger WHERE DATE(approved_at) < ? ORDER BY id DESC LIMIT 1`,
      [date]
    );
    const openingBalance = openRows.length > 0 ? parseFloat(openRows[0].closing_balance) : 0;

    // Today's approved cash in & out
    const [dayRows] = await pool.query(
      `SELECT 
         COALESCE(SUM(CASE WHEN type = 'Cash In' THEN amount ELSE 0 END), 0) AS cashIn,
         COALESCE(SUM(CASE WHEN type = 'Cash Out' THEN amount ELSE 0 END), 0) AS cashOut
       FROM cash_ledger
       WHERE DATE(approved_at) = ?`,
      [date]
    );

    const cashIn = parseFloat(dayRows[0].cashIn);
    const cashOut = parseFloat(dayRows[0].cashOut);
    const closingBalance = openingBalance + cashIn - cashOut;

    // Ledger entries for that day
    const [entries] = await pool.query(
      `SELECT cl.*, DATE_FORMAT(cl.approved_at, '%Y-%m-%d %H:%i:%s') AS approved_at_fmt
       FROM cash_ledger cl
       WHERE DATE(cl.approved_at) = ?
       ORDER BY cl.id ASC`,
      [date]
    );

    res.json({
      ok: true,
      date,
      openingBalance,
      cashIn,
      cashOut,
      closingBalance,
      entries
    });
  } catch (error) {
    console.error('Daily summary error:', error);
    res.status(400).json({ ok: false, error: error.message });
  }
});

export default router;
