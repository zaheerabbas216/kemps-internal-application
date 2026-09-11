import express from 'express';
import pool from '../config/db.js';

const router = express.Router();

// Auto-initialize cash_ledger_opening, daily_cash_ledger_history, and cash_submitted_records tables
const initTable = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cash_ledger_opening (
        id INT AUTO_INCREMENT PRIMARY KEY,
        entry_date DATE NOT NULL,
        cash_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        upi_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        bank_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        remarks VARCHAR(255) NULL,
        created_by VARCHAR(100) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY idx_entry_date (entry_date)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS daily_cash_ledger_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ledger_date DATE NOT NULL UNIQUE,
        opening_cash DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        opening_upi DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        opening_bank DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        total_opening DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        cash_in DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        upi_in DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        bank_in DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        total_in DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        cash_out DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        upi_out DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        bank_out DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        total_out DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        closing_cash DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        closing_upi DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        closing_bank DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        net_closing DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        cash_submitted DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        counter_cash DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        total_transactions INT NOT NULL DEFAULT 0,
        status VARCHAR(20) NOT NULL DEFAULT 'Closed',
        closed_by VARCHAR(100) NULL,
        closed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS cash_submitted_records (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ledger_date DATE NOT NULL,
        cash_submitted DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        status VARCHAR(20) NOT NULL DEFAULT 'Approved',
        submitted_by VARCHAR(100) NULL,
        remarks VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Drop unique index on ledger_date if exists so multiple submissions per day can be recorded individually
    try {
      await pool.query(`ALTER TABLE cash_submitted_records DROP INDEX ledger_date`);
    } catch (e) { /* ignore if index doesn't exist */ }
    try {
      await pool.query(`ALTER TABLE cash_submitted_records DROP INDEX idx_ledger_date`);
    } catch (e) { /* ignore if index doesn't exist */ }

    // Ensure columns exist on daily_cash_ledger_history
    try {
      await pool.query(`ALTER TABLE daily_cash_ledger_history ADD COLUMN cash_submitted DECIMAL(12, 2) NOT NULL DEFAULT 0.00`);
    } catch (e) { /* ignore if column exists */ }
    try {
      await pool.query(`ALTER TABLE daily_cash_ledger_history ADD COLUMN counter_cash DECIMAL(12, 2) NOT NULL DEFAULT 0.00`);
    } catch (e) { /* ignore if column exists */ }
    try {
      await pool.query(`ALTER TABLE daily_cash_ledger_history ADD COLUMN credit_adjusted DECIMAL(12, 2) NOT NULL DEFAULT 0.00`);
    } catch (e) { /* ignore if column exists */ }

    // Ensure customer_id column exists on customer_payments
    try {
      await pool.query(`ALTER TABLE customer_payments ADD COLUMN customer_id VARCHAR(20) NULL AFTER bill_id`);
    } catch (e) { /* ignore if column exists */ }
    try {
      await pool.query(`
        UPDATE customer_payments cp
        JOIN customer_ledger cl ON (cl.reference_no = cp.id AND cl.entry_type = 'PAYMENT')
        SET cp.customer_id = cl.customer_id
        WHERE cp.customer_id IS NULL
      `);
      await pool.query(`
        UPDATE customer_payments cp
        JOIN customer_bills cb ON cp.bill_id = cb.id
        SET cp.customer_id = cb.customer_id
        WHERE cp.customer_id IS NULL
      `);
      // Safe historical reconciliation: ensure customer_bills.cash_paid only contains initial counter cash
      await pool.query(`
        UPDATE customer_bills cb
        JOIN (
          SELECT bill_id,
                 SUM(COALESCE(cash_paid, 0)) AS sub_cash,
                 SUM(COALESCE(upi_paid, 0)) AS sub_upi,
                 SUM(COALESCE(bank_paid, 0)) AS sub_bank
          FROM customer_payments
          WHERE payment_status = 'Approved' AND bill_id IS NOT NULL AND bill_id != ''
          GROUP BY bill_id
        ) sub ON cb.id = sub.bill_id
        SET cb.cash_paid = GREATEST(0, cb.cash_paid - sub.sub_cash),
            cb.upi_paid = GREATEST(0, cb.upi_paid - sub.sub_upi),
            cb.bank_paid = GREATEST(0, cb.bank_paid - sub.sub_bank)
        WHERE (cb.cash_paid >= sub.sub_cash AND sub.sub_cash > 0)
           OR (cb.upi_paid >= sub.sub_upi AND sub.sub_upi > 0)
           OR (cb.bank_paid >= sub.sub_bank AND sub.sub_bank > 0)
      `);
    } catch (e) { /* ignore */ }
  } catch (err) {
    console.error('Failed to init cash ledger tables:', err);
  }
};
initTable();

// Helper to compute itemized daily ledger summary for any target date
export const computeDailyLedger = async (targetDate) => {
  // 1. Opening balance
  const [opRows] = await pool.query(
    `SELECT cash_amount, upi_amount, bank_amount, remarks FROM cash_ledger_opening WHERE entry_date = ?`,
    [targetDate]
  );
  let openingCash  = opRows.length ? parseFloat(opRows[0].cash_amount || 0) : 0;
  let openingUpi   = opRows.length ? parseFloat(opRows[0].upi_amount  || 0) : 0;
  let openingBank  = opRows.length ? parseFloat(opRows[0].bank_amount || 0) : 0;
  let totalOpening = openingCash + openingUpi + openingBank;

  // Total Credit Balance Adjusted on targetDate across all bills on targetDate
  const [creditAdjRows] = await pool.query(
    `SELECT
       COALESCE(SUM(
         GREATEST(0, (cb.amount_paid - COALESCE(sub.sub_total, 0)) - (
           GREATEST(0, cb.cash_paid - COALESCE(sub.sub_cash, 0)) +
           GREATEST(0, cb.upi_paid - COALESCE(sub.sub_upi, 0)) +
           GREATEST(0, cb.bank_paid - COALESCE(sub.sub_bank, 0))
         ))
       ), 0) AS total_credit_adjusted
     FROM customer_bills cb
     LEFT JOIN (
       SELECT bill_id,
              SUM(COALESCE(cash_paid, 0)) AS sub_cash,
              SUM(COALESCE(upi_paid, 0)) AS sub_upi,
              SUM(COALESCE(bank_paid, 0)) AS sub_bank,
              SUM(COALESCE(amount_received, 0)) AS sub_total
       FROM customer_payments
       WHERE payment_status = 'Approved' AND bill_id IS NOT NULL AND bill_id != ''
       GROUP BY bill_id
     ) sub ON cb.id = sub.bill_id
     WHERE cb.billing_date = ?
       AND cb.id NOT IN (SELECT DISTINCT bill_id FROM customer_bill_items WHERE finished_product_id IN (SELECT id FROM finished_products WHERE name = 'Can Deposit'))`,
    [targetDate]
  );
  const totalCreditAdjusted = parseFloat(creditAdjRows[0]?.total_credit_adjusted || 0);

  // 2. Billing — ONLY actual cash/UPI/Bank collected at billing counter at invoice creation time
  const [bRows] = await pool.query(
    `SELECT
       cb.id AS ref_id,
       DATE_FORMAT(cb.billing_date,'%Y-%m-%d') AS txn_date,
       cb.customer_name AS party,
       cb.company AS branch,
       CASE
         WHEN GREATEST(0, cb.cash_paid - COALESCE(sub.sub_cash, 0)) > 0 AND GREATEST(0, cb.upi_paid - COALESCE(sub.sub_upi, 0)) > 0 THEN 'Cash + UPI'
         WHEN GREATEST(0, cb.cash_paid - COALESCE(sub.sub_cash, 0)) > 0 AND GREATEST(0, cb.bank_paid - COALESCE(sub.sub_bank, 0)) > 0 THEN 'Cash + Bank'
         WHEN GREATEST(0, cb.upi_paid - COALESCE(sub.sub_upi, 0)) > 0 AND GREATEST(0, cb.bank_paid - COALESCE(sub.sub_bank, 0)) > 0 THEN 'UPI + Bank'
         WHEN GREATEST(0, cb.cash_paid - COALESCE(sub.sub_cash, 0)) > 0 THEN 'Cash'
         WHEN GREATEST(0, cb.upi_paid - COALESCE(sub.sub_upi, 0)) > 0 THEN 'UPI'
         WHEN GREATEST(0, cb.bank_paid - COALESCE(sub.sub_bank, 0)) > 0 THEN 'Bank'
         ELSE cb.payment_mode
       END AS method,
       GREATEST(0, cb.cash_paid - COALESCE(sub.sub_cash, 0)) AS cash_amt,
       GREATEST(0, cb.upi_paid - COALESCE(sub.sub_upi, 0)) AS upi_amt,
       GREATEST(0, cb.bank_paid - COALESCE(sub.sub_bank, 0)) AS bank_amt,
       GREATEST(0, (cb.amount_paid - COALESCE(sub.sub_total, 0)) - (
         GREATEST(0, cb.cash_paid - COALESCE(sub.sub_cash, 0)) +
         GREATEST(0, cb.upi_paid - COALESCE(sub.sub_upi, 0)) +
         GREATEST(0, cb.bank_paid - COALESCE(sub.sub_bank, 0))
       )) AS credit_adjusted_amt,
       (GREATEST(0, cb.cash_paid - COALESCE(sub.sub_cash, 0)) +
        GREATEST(0, cb.upi_paid - COALESCE(sub.sub_upi, 0)) +
        GREATEST(0, cb.bank_paid - COALESCE(sub.sub_bank, 0))) AS amount,
       'in' AS flow,
       'Billing' AS source_module,
       CONCAT('Sales Invoice — ', cb.customer_name, 
         CASE 
           WHEN ((cb.amount_paid - COALESCE(sub.sub_total, 0)) - (
             GREATEST(0, cb.cash_paid - COALESCE(sub.sub_cash, 0)) +
             GREATEST(0, cb.upi_paid - COALESCE(sub.sub_upi, 0)) +
             GREATEST(0, cb.bank_paid - COALESCE(sub.sub_bank, 0))
           )) > 0 
           THEN ' (Credit Balance Adjusted)' 
           ELSE '' 
         END) AS description
     FROM customer_bills cb
     LEFT JOIN (
       SELECT bill_id,
              SUM(COALESCE(cash_paid, 0)) AS sub_cash,
              SUM(COALESCE(upi_paid, 0)) AS sub_upi,
              SUM(COALESCE(bank_paid, 0)) AS sub_bank,
              SUM(COALESCE(amount_received, 0)) AS sub_total
       FROM customer_payments
       WHERE payment_status = 'Approved' AND bill_id IS NOT NULL AND bill_id != ''
       GROUP BY bill_id
     ) sub ON cb.id = sub.bill_id
     WHERE cb.billing_date = ?
       AND (
         GREATEST(0, cb.cash_paid - COALESCE(sub.sub_cash, 0)) > 0 OR
         GREATEST(0, cb.upi_paid - COALESCE(sub.sub_upi, 0)) > 0 OR
         GREATEST(0, cb.bank_paid - COALESCE(sub.sub_bank, 0)) > 0
       )
       AND cb.payment_mode != 'Credit'
       AND cb.id NOT IN (SELECT DISTINCT bill_id FROM customer_bill_items WHERE finished_product_id IN (SELECT id FROM finished_products WHERE name = 'Can Deposit'))
     ORDER BY cb.created_at DESC`,
    [targetDate]
  );

  // 3. Credit payments
  const [cpRows] = await pool.query(
    `SELECT
       cp.id AS ref_id,
       DATE_FORMAT(cp.payment_date,'%Y-%m-%d') AS txn_date,
       COALESCE(NULLIF(TRIM(cb.customer_name), ''), cust.name, cust2.name, 'Credit Customer') AS party,
       COALESCE(cb.company, cp.company, '') AS branch,
       cp.payment_method AS method,
       COALESCE(cp.cash_paid, 0) AS cash_amt,
       COALESCE(cp.upi_paid, 0) AS upi_amt,
       COALESCE(cp.bank_paid, 0) AS bank_amt,
       0 AS credit_adjusted_amt,
       cp.amount_received AS amount,
       'in' AS flow,
       'Credit Payment' AS source_module,
       CASE 
         WHEN cp.bill_id IS NULL OR cp.bill_id = '' THEN CONCAT('Advance credit payment received — ', COALESCE(NULLIF(TRIM(cb.customer_name), ''), cust.name, 'Customer'))
         ELSE CONCAT('Credit collected for ', cp.bill_id)
       END AS description,
       cp.bill_id AS invoice_no,
       cp.remarks AS notes
     FROM customer_payments cp
     LEFT JOIN customer_bills cb ON cp.bill_id = cb.id
     LEFT JOIN customer_ledger cl ON (cl.reference_no = cp.id AND cl.entry_type = 'PAYMENT')
     LEFT JOIN customers cust ON cust.id = COALESCE(cp.customer_id, cl.customer_id)
     LEFT JOIN customers cust2 ON cust2.id = cb.customer_id
     WHERE cp.payment_status = 'Approved' 
       AND (COALESCE(cp.cash_paid, 0) > 0 OR COALESCE(cp.upi_paid, 0) > 0 OR COALESCE(cp.bank_paid, 0) > 0 OR cp.amount_received > 0)
       AND cp.payment_method NOT LIKE '%Credit Balance%'
       AND cp.payment_date = ?
     ORDER BY cp.created_at DESC`,
    [targetDate]
  );

  // 4. Can Supply payments
  const [canPayRows] = await pool.query(
    `SELECT
       cp.payment_no AS ref_id,
       DATE_FORMAT(cp.payment_date,'%Y-%m-%d') AS txn_date,
       cb.customer_name AS party,
       cp.payment_method AS method,
       0 AS cash_amt, 0 AS upi_amt, 0 AS bank_amt,
       0 AS credit_adjusted_amt,
       cp.amount_paid AS amount,
       'in' AS flow,
       'Can Supply' AS source_module,
       CONCAT('Can payment for bill ', cp.bill_id) AS description
     FROM can_payments cp
     LEFT JOIN can_billing cb ON cp.bill_id = cb.id
     WHERE cp.payment_status = 'Approved' AND cp.payment_date = ?`,
    [targetDate]
  );

  // 5. Can Deposit IN
  const [canDepInRows] = await pool.query(
    `SELECT
       transaction_id AS ref_id,
       DATE_FORMAT(CONVERT_TZ(created_at, '+00:00', '+05:30'), '%Y-%m-%d') AS txn_date,
       customer_name AS party,
       payment_mode AS method,
       CASE WHEN payment_mode LIKE '%Cash%' THEN amount ELSE 0 END AS cash_amt,
       CASE WHEN payment_mode LIKE '%UPI%' THEN amount ELSE 0 END AS upi_amt,
       CASE WHEN payment_mode NOT LIKE '%Cash%' AND payment_mode NOT LIKE '%UPI%' THEN amount ELSE 0 END AS bank_amt,
       0 AS credit_adjusted_amt,
       amount AS amount,
       'in' AS flow,
       'Can Deposit' AS source_module,
       CONCAT('Can deposit received — ', customer_name) AS description
     FROM can_deposit_ledger
     WHERE (transaction_type LIKE '%Deposit%' AND transaction_type NOT LIKE '%Return%')
       AND (payment_status IS NULL OR payment_status != 'Rejected')
       AND DATE_FORMAT(CONVERT_TZ(created_at, '+00:00', '+05:30'), '%Y-%m-%d') = ?`,
    [targetDate]
  );

  // 6. Expenses OUT
  const [expenseRows] = await pool.query(
    `SELECT
       id AS ref_id,
       DATE_FORMAT(expense_date,'%Y-%m-%d') AS txn_date,
       entered_by AS party,
       CASE WHEN particulars LIKE '%Inventory Purchase Expense%' THEN 'Cash' ELSE payment_method END AS method,
       CASE WHEN payment_method LIKE '%Cash%' OR particulars LIKE '%Inventory Purchase Expense%' THEN amount ELSE 0 END AS cash_amt,
       CASE WHEN payment_method LIKE '%UPI%' AND particulars NOT LIKE '%Inventory Purchase Expense%' THEN amount ELSE 0 END AS upi_amt,
       CASE WHEN payment_method NOT LIKE '%Cash%' AND payment_method NOT LIKE '%UPI%' AND particulars NOT LIKE '%Inventory Purchase Expense%' THEN amount ELSE 0 END AS bank_amt,
       0 AS credit_adjusted_amt,
       amount AS amount,
       'out' AS flow,
       'Expense' AS source_module,
       CONCAT(COALESCE(category,'General'), ' — ', particulars) AS description
     FROM expenses
     WHERE payment_status = 'Approved' AND expense_date = ?`,
    [targetDate]
  );

  // 7. Can Deposit Return OUT
  const [canDepOutRows] = await pool.query(
    `SELECT
       transaction_id AS ref_id,
       DATE_FORMAT(CONVERT_TZ(created_at, '+00:00', '+05:30'), '%Y-%m-%d') AS txn_date,
       customer_name AS party,
       payment_mode AS method,
       CASE WHEN payment_mode LIKE '%Cash%' THEN amount ELSE 0 END AS cash_amt,
       CASE WHEN payment_mode LIKE '%UPI%' THEN amount ELSE 0 END AS upi_amt,
       CASE WHEN payment_mode NOT LIKE '%Cash%' AND payment_mode NOT LIKE '%UPI%' THEN amount ELSE 0 END AS bank_amt,
       0 AS credit_adjusted_amt,
       amount AS amount,
       'out' AS flow,
       'Can Deposit Return' AS source_module,
       CONCAT('Deposit returned to — ', customer_name) AS description
     FROM can_deposit_ledger
     WHERE transaction_type LIKE '%Return%'
       AND (payment_status IS NULL OR payment_status != 'Rejected')
       AND DATE_FORMAT(CONVERT_TZ(created_at, '+00:00', '+05:30'), '%Y-%m-%d') = ?`,
    [targetDate]
  );

  // 8. Individual Cash Submitted records for targetDate
  const [csRows] = await pool.query(
    `SELECT
       id,
       CONCAT('SUB-', LPAD(id, 5, '0')) AS ref_id,
       DATE_FORMAT(ledger_date, '%Y-%m-%d') AS txn_date,
       'Cash Submitted' AS party,
       'Cash' AS method,
       cash_submitted AS cash_amt,
       0 AS upi_amt,
       0 AS bank_amt,
       0 AS credit_adjusted_amt,
       cash_submitted AS amount,
       'out' AS flow,
       'Cash Submitted' AS source_module,
       CONCAT('Cash submitted by ', COALESCE(submitted_by, 'Admin')) AS description,
       COALESCE(status, 'Approved') AS status
     FROM cash_submitted_records
     WHERE ledger_date = ?
     ORDER BY id ASC`,
    [targetDate]
  );

  const txns = [
    ...bRows,
    ...cpRows,
    ...canPayRows,
    ...canDepInRows,
    ...expenseRows,
    ...canDepOutRows
  ].map(r => ({
    ...r,
    amount: parseFloat(r.amount || 0),
    cash_amt: parseFloat(r.cash_amt || 0),
    upi_amt: parseFloat(r.upi_amt || 0),
    bank_amt: parseFloat(r.bank_amt || 0),
    credit_adjusted_amt: parseFloat(r.credit_adjusted_amt || 0)
  }));

  let cashIn = 0, upiIn = 0, bankIn = 0;
  let cashOut = 0, upiOut = 0, bankOut = 0;

  for (const r of txns) {
    const amt = r.amount;
    const meth = String(r.method || '').toLowerCase();
    const rCash = parseFloat(r.cash_amt || 0);
    const rUpi  = parseFloat(r.upi_amt  || 0);
    const rBank = parseFloat(r.bank_amt || 0);

    let cash = 0, upi = 0, bank = 0;

    if (rCash > 0 || rUpi > 0 || rBank > 0) {
      cash = rCash;
      upi  = rUpi;
      bank = rBank;
    } else if (meth !== 'credit balance' && meth !== 'credit adjust' && amt > 0) {
      if (meth.includes('cash')) {
        cash = amt;
      } else if (meth.includes('upi')) {
        upi = amt;
      } else {
        bank = amt;
      }
    }

    if (r.flow === 'in') {
      cashIn += cash;
      upiIn += upi;
      bankIn += bank;
    } else {
      cashOut += cash;
      upiOut += upi;
      bankOut += bank;
    }
  }

  const totalIn = cashIn + upiIn + bankIn;
  const totalOut = cashOut + upiOut + bankOut;
  const closingCash = openingCash + cashIn - cashOut;
  const closingUpi = openingUpi + upiIn - upiOut;
  const closingBank = openingBank + bankIn - bankOut;
  const netClosing = totalOpening + totalIn - totalOut;

  // Calculate sum of approved cash_submitted for targetDate
  let cashSubmitted = 0;
  const formattedCsRows = csRows.map(r => {
    const amt = parseFloat(r.amount || 0);
    if (r.status === 'Approved') {
      cashSubmitted += amt;
    }
    return {
      ...r,
      amount: amt,
      cash_amt: amt,
      upi_amt: 0,
      bank_amt: 0,
      credit_adjusted_amt: 0,
      status: r.status || 'Approved'
    };
  });

  const counterCash = Math.max(0, closingCash - cashSubmitted);

  // All transactions list with Cash Submitted rows placed after opening balance
  const allReportTxns = [...formattedCsRows, ...txns];

  return {
    ledgerDate: targetDate,
    openingCash,
    openingUpi,
    openingBank,
    totalOpening,
    cashIn,
    upiIn,
    bankIn,
    totalIn,
    cashOut,
    upiOut,
    bankOut,
    totalOut,
    closingCash,
    closingUpi,
    closingBank,
    netClosing,
    netCash: closingCash,
    netUpi: closingUpi,
    netBank: closingBank,
    netTotal: netClosing,
    cashSubmitted,
    counterCash,
    creditAdjusted: totalCreditAdjusted,
    totalTransactions: allReportTxns.length,
    transactions: allReportTxns
  };
};

// POST /api/cash-ledger/cash-submitted
// Insert an individual cash submitted record for a specific date
router.post('/cash-submitted', async (req, res) => {
  try {
    const { ledgerDate, cashSubmitted } = req.body;
    const loggedInUser = (req.admin?.username || req.body.submittedBy || 'admin').trim();
    const isAdminUser = loggedInUser.toLowerCase() === 'admin';

    if (!ledgerDate) {
      return res.status(400).json({ ok: false, error: 'Ledger Date is required.' });
    }

    const val = parseFloat(cashSubmitted);
    if (isNaN(val) || val <= 0) {
      return res.status(400).json({ ok: false, error: 'Cash Submitted must be greater than 0.' });
    }

    // Compute Net Cash & existing submitted for this ledgerDate to validate
    const dailyData = await computeDailyLedger(ledgerDate);
    const availableNetCash = dailyData.netCash;
    const currentTotalSubmitted = dailyData.cashSubmitted;

    if ((currentTotalSubmitted + val) > availableNetCash) {
      return res.status(400).json({
        ok: false,
        error: `Total Cash Submitted (₹${(currentTotalSubmitted + val).toLocaleString('en-IN')}) cannot be greater than available Net Cash (₹${availableNetCash.toLocaleString('en-IN')}).`
      });
    }

    // Direct approval ONLY if the logged in user is strictly Admin
    const initialStatus = isAdminUser ? 'Approved' : 'Pending';

    // Insert new individual record into cash_submitted_records
    const [result] = await pool.query(
      `INSERT INTO cash_submitted_records (ledger_date, cash_submitted, status, submitted_by)
       VALUES (?, ?, ?, ?)`,
      [ledgerDate, val, initialStatus, loggedInUser]
    );

    res.json({
      ok: true,
      insertedId: result.insertId,
      status: initialStatus,
      message: initialStatus === 'Approved'
        ? 'Cash submitted and approved successfully.'
        : 'Cash deposit submitted for Admin approval.'
    });
  } catch (error) {
    console.error('Error saving cash submitted:', error);
    res.status(400).json({ ok: false, error: error.message });
  }
});

// PUT /api/cash-ledger/cash-submitted/:id/approve
// Approve a pending cash submission (Admin action ONLY)
router.put('/cash-submitted/:id/approve', async (req, res) => {
  try {
    const loggedInUser = (req.admin?.username || req.body.approvedBy || '').trim();
    if (loggedInUser.toLowerCase() !== 'admin') {
      return res.status(403).json({ ok: false, error: 'Access denied. Only Admin can approve cash deposits.' });
    }

    const { id } = req.params;

    const [rows] = await pool.query(`SELECT * FROM cash_submitted_records WHERE id = ?`, [id]);
    if (rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Cash submission record not found.' });
    }

    const rec = rows[0];
    const targetDate = rec.ledger_date;
    const val = parseFloat(rec.cash_submitted || 0);

    // Validate that approving this will not exceed available Net Cash
    const dailyData = await computeDailyLedger(targetDate);
    if ((dailyData.cashSubmitted + val) > dailyData.netCash) {
      return res.status(400).json({
        ok: false,
        error: `Cannot approve: total submitted (₹${(dailyData.cashSubmitted + val).toLocaleString('en-IN')}) exceeds available Net Cash (₹${dailyData.netCash.toLocaleString('en-IN')}).`
      });
    }

    await pool.query(
      `UPDATE cash_submitted_records SET status = 'Approved', submitted_by = ? WHERE id = ?`,
      ['admin', id]
    );

    res.json({ ok: true, message: 'Cash deposit approved successfully!' });
  } catch (error) {
    console.error('Error approving cash submission:', error);
    res.status(400).json({ ok: false, error: error.message });
  }
});

// DELETE /api/cash-ledger/cash-submitted/:id
// Delete an individual cash submitted entry (Admin action ONLY)
router.delete('/cash-submitted/:id', async (req, res) => {
  try {
    const loggedInUser = (req.admin?.username || '').trim();
    if (loggedInUser.toLowerCase() !== 'admin') {
      return res.status(403).json({ ok: false, error: 'Access denied. Only Admin can delete cash submission entries.' });
    }

    const { id } = req.params;
    await pool.query(`DELETE FROM cash_submitted_records WHERE id = ?`, [id]);
    res.json({ ok: true, message: 'Cash submission entry deleted.' });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// POST /api/cash-ledger/opening
// Save or update manual opening cash/UPI/Bank balance for a specific date
router.post('/opening', async (req, res) => {
  try {
    const { entryDate, cashAmount = 0, upiAmount = 0, bankAmount = 0, remarks = '', createdBy = 'admin' } = req.body;

    if (!entryDate) {
      return res.status(400).json({ ok: false, error: 'Entry Date is required.' });
    }

    const cashVal = Math.max(0, parseFloat(cashAmount) || 0);
    const upiVal  = Math.max(0, parseFloat(upiAmount)  || 0);
    const bankVal = Math.max(0, parseFloat(bankAmount) || 0);

    await pool.query(
      `INSERT INTO cash_ledger_opening (entry_date, cash_amount, upi_amount, bank_amount, remarks, created_by)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         cash_amount = VALUES(cash_amount),
         upi_amount  = VALUES(upi_amount),
         bank_amount = VALUES(bank_amount),
         remarks     = VALUES(remarks),
         created_by  = VALUES(created_by)`,
      [entryDate, cashVal, upiVal, bankVal, String(remarks || '').trim(), String(createdBy || 'admin').trim()]
    );

    res.json({ ok: true, message: 'Opening balance saved successfully!' });
  } catch (error) {
    console.error('Error saving opening balance:', error);
    res.status(400).json({ ok: false, error: error.message });
  }
});

// GET /api/cash-ledger/opening
router.get('/opening', async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ ok: false, error: 'Date is required.' });
    }

    const [rows] = await pool.query(
      `SELECT entry_date, cash_amount, upi_amount, bank_amount, remarks, created_by, created_at
       FROM cash_ledger_opening
       WHERE entry_date = ?`,
      [date]
    );

    if (rows.length === 0) {
      return res.json({ ok: true, opening: null });
    }

    res.json({
      ok: true,
      opening: {
        entryDate: rows[0].entry_date,
        cashAmount: parseFloat(rows[0].cash_amount),
        upiAmount: parseFloat(rows[0].upi_amount),
        bankAmount: parseFloat(rows[0].bank_amount),
        totalOpening: parseFloat(rows[0].cash_amount) + parseFloat(rows[0].upi_amount) + parseFloat(rows[0].bank_amount),
        remarks: rows[0].remarks,
        createdBy: rows[0].created_by
      }
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// Helper to automatically save a day's report snapshot into history table & carry forward closing balance
const autoCloseDay = async (ledgerDate, closedBy = 'System (Auto-Close)') => {
  try {
    if (!ledgerDate) return null;
    const report = await computeDailyLedger(ledgerDate);

    await pool.query(
      `INSERT INTO daily_cash_ledger_history
         (ledger_date, opening_cash, opening_upi, opening_bank, total_opening,
          cash_in, upi_in, bank_in, total_in,
          cash_out, upi_out, bank_out, total_out,
          closing_cash, closing_upi, closing_bank, net_closing,
          cash_submitted, counter_cash, credit_adjusted,
          total_transactions, status, closed_by, closed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Closed', ?, NOW())
       ON DUPLICATE KEY UPDATE
         opening_cash = VALUES(opening_cash),
         opening_upi  = VALUES(opening_upi),
         opening_bank = VALUES(opening_bank),
         total_opening= VALUES(total_opening),
         cash_in      = VALUES(cash_in),
         upi_in       = VALUES(upi_in),
         bank_in      = VALUES(bank_in),
         total_in     = VALUES(total_in),
         cash_out     = VALUES(cash_out),
         upi_out      = VALUES(upi_out),
         bank_out     = VALUES(bank_out),
         total_out    = VALUES(total_out),
         closing_cash = VALUES(closing_cash),
         closing_upi  = VALUES(closing_upi),
         closing_bank = VALUES(closing_bank),
         net_closing  = VALUES(net_closing),
         cash_submitted = VALUES(cash_submitted),
         counter_cash   = VALUES(counter_cash),
         credit_adjusted= VALUES(credit_adjusted),
         total_transactions = VALUES(total_transactions),
         status       = 'Closed',
         closed_by    = VALUES(closed_by),
         closed_at    = NOW()`,
      [
        report.ledgerDate,
        report.openingCash, report.openingUpi, report.openingBank, report.totalOpening,
        report.cashIn, report.upiIn, report.bankIn, report.totalIn,
        report.cashOut, report.upiOut, report.bankOut, report.totalOut,
        report.closingCash, report.closingUpi, report.closingBank, report.netClosing,
        report.cashSubmitted, report.counterCash, report.creditAdjusted || 0,
        report.totalTransactions,
        String(closedBy || 'System (Auto-Close)').trim()
      ]
    );

    return report;
  } catch (err) {
    console.error(`Auto-close failed for ${ledgerDate}:`, err);
    return null;
  }
};

// Automatic Day-Reset & History Auto-Save Runner
const checkAndAutoClosePastDays = async () => {
  try {
    const todayStr = new Date().toISOString().split('T')[0];

    // Auto-save yesterday
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    await autoCloseDay(yesterdayStr, 'System (Auto-Close)');

    // Also auto-close any past unclosed dates
    const [pastDates] = await pool.query(`
      SELECT DISTINCT d FROM (
        SELECT DATE_FORMAT(payment_date, '%Y-%m-%d') AS d FROM customer_payments WHERE payment_status = 'Approved' AND payment_date < ?
        UNION
        SELECT DATE_FORMAT(billing_date, '%Y-%m-%d') AS d FROM customer_bills WHERE (payment_status IS NULL OR payment_status != 'Cancelled') AND billing_date < ?
        UNION
        SELECT DATE_FORMAT(expense_date, '%Y-%m-%d') AS d FROM expenses WHERE payment_status = 'Approved' AND expense_date < ?
        UNION
        SELECT DATE_FORMAT(entry_date, '%Y-%m-%d') AS d FROM cash_ledger_opening WHERE entry_date < ?
      ) t
      WHERE t.d IS NOT NULL AND t.d NOT IN (SELECT DATE_FORMAT(ledger_date, '%Y-%m-%d') FROM daily_cash_ledger_history)
      ORDER BY t.d ASC
    `, [todayStr, todayStr, todayStr, todayStr]);

    for (const row of pastDates) {
      if (row.d) {
        await autoCloseDay(row.d, 'System (Auto-Close)');
      }
    }
  } catch (e) {
    console.error('Error in checkAndAutoClosePastDays:', e);
  }
};

// Run automatically on backend startup and every 5 minutes (day reset)
setTimeout(checkAndAutoClosePastDays, 2000);
setInterval(checkAndAutoClosePastDays, 5 * 60 * 1000);

// POST /api/cash-ledger/close-day
router.post('/close-day', async (req, res) => {
  try {
    const { ledgerDate, closedBy = 'System (Auto-Close)' } = req.body;
    if (!ledgerDate) {
      return res.status(400).json({ ok: false, error: 'Ledger Date is required.' });
    }
    const report = await autoCloseDay(ledgerDate, closedBy);
    res.json({ ok: true, report, message: `Daily report for ${ledgerDate} saved automatically.` });
  } catch (error) {
    console.error('Error closing day:', error);
    res.status(400).json({ ok: false, error: error.message });
  }
});

// GET /api/cash-ledger/daily-history
// Fetch paginated history of saved daily reports
router.get('/daily-history', async (req, res) => {
  try {
    await checkAndAutoClosePastDays();
    let { page = 1, limit = 10, search = '', startDate = '', endDate = '' } = req.query;
    page = Math.max(1, parseInt(page, 10) || 1);
    limit = Math.max(1, parseInt(limit, 10) || 10);
    const offset = (page - 1) * limit;

    let w = [];
    let p = [];

    if (startDate) { w.push('ledger_date >= ?'); p.push(startDate); }
    if (endDate)   { w.push('ledger_date <= ?'); p.push(endDate); }
    if (search.trim()) {
      const s = `%${search.trim()}%`;
      w.push('(ledger_date LIKE ? OR closed_by LIKE ? OR status LIKE ?)');
      p.push(s, s, s);
    }

    const whereStr = w.length ? `WHERE ${w.join(' AND ')}` : '';

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS count FROM daily_cash_ledger_history ${whereStr}`,
      p
    );
    const total = countRows[0].count;

    const [rows] = await pool.query(
      `SELECT
         id,
         DATE_FORMAT(ledger_date, '%Y-%m-%d') AS ledgerDate,
         opening_cash AS openingCash,
         opening_upi AS openingUpi,
         opening_bank AS openingBank,
         total_opening AS totalOpening,
         cash_in AS cashIn,
         upi_in AS upiIn,
         bank_in AS bankIn,
         total_in AS totalIn,
         cash_out AS cashOut,
         upi_out AS upiOut,
         bank_out AS bankOut,
         total_out AS totalOut,
         closing_cash AS closingCash,
         closing_upi AS closingUpi,
         closing_bank AS closingBank,
         net_closing AS netClosing,
         cash_submitted AS cashSubmitted,
         counter_cash AS counterCash,
         COALESCE(credit_adjusted, 0) AS creditAdjusted,
         total_transactions AS totalTransactions,
         status,
         closed_by AS closedBy,
         DATE_FORMAT(closed_at, '%d/%m/%Y %h:%i %p') AS closedAt
       FROM daily_cash_ledger_history
       ${whereStr}
       ORDER BY ledger_date DESC
       LIMIT ? OFFSET ?`,
      [...p, limit, offset]
    );

    res.json({
      ok: true,
      history: rows,
      total,
      page,
      limit
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// GET /api/cash-ledger/daily-report/:date
// Retrieve itemized report for a specific date
router.get('/daily-report/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const report = await computeDailyLedger(date);
    res.json({ ok: true, report });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// GET /api/cash-ledger
// Unified cash ledger aggregating Cash/UPI/Bank flows across all modules
// Supports: startDate, endDate, search, method (Cash|UPI|Bank|All), type (in|out|all), page, limit
router.get('/', async (req, res) => {
  try {
    let {
      page = 1,
      limit = 20,
      startDate = '',
      endDate = '',
      search = '',
      method = 'All',   // Cash | UPI | Bank | All
      type = 'all'      // in | out | all
    } = req.query;

    page  = Math.max(1, parseInt(page, 10)  || 1);
    limit = Math.max(1, parseInt(limit, 10) || 20);

    const methodFilter = (col) => {
      if (!method || method === 'All') return null;
      if (method === 'Bank') {
        return { clause: `(${col} LIKE ? OR ${col} LIKE ? OR ${col} LIKE ?)`, params: ['%Bank%', '%Online%', '%Cheque%'] };
      }
      return { clause: `${col} LIKE ?`, params: [`%${method}%`] };
    };

    // ── 0. Fetch Opening Balance & Approved Cash Submitted for the startDate ──
    let openingRow = null;
    let openingCash = 0, openingUpi = 0, openingBank = 0, totalOpening = 0;

    if (startDate) {
      const [opRows] = await pool.query(
        `SELECT entry_date, cash_amount, upi_amount, bank_amount, remarks, created_by
         FROM cash_ledger_opening
         WHERE entry_date = ?`,
        [startDate]
      );
      if (opRows.length > 0) {
        openingRow = opRows[0];
        openingCash = parseFloat(opRows[0].cash_amount || 0);
        openingUpi  = parseFloat(opRows[0].upi_amount  || 0);
        openingBank = parseFloat(opRows[0].bank_amount || 0);
        totalOpening = openingCash + openingUpi + openingBank;
      }
    }

    // Individual Cash Submitted entries
    const csRows = [];
    let totalSubmitted = 0;
    {
      let w = [];
      let p = [];
      if (startDate) { w.push('ledger_date >= ?'); p.push(startDate); }
      if (endDate)   { w.push('ledger_date <= ?'); p.push(endDate); }
      if (search.trim()) {
        const s = `%${search.trim()}%`;
        w.push('(submitted_by LIKE ? OR remarks LIKE ? OR id LIKE ?)');
        p.push(s, s, s);
      }
      if (method && method !== 'All' && method !== 'Cash') {
        w.push('1 = 0');
      }
      if (type === 'in') {
        w.push('1 = 0');
      }

      const whereStr = w.length ? `WHERE ${w.join(' AND ')}` : '';
      const [rows] = await pool.query(
        `SELECT
           id,
           CONCAT('SUB-', LPAD(id, 5, '0')) AS ref_id,
           DATE_FORMAT(ledger_date, '%Y-%m-%d') AS txn_date,
           'Cash Submitted' AS party,
           '' AS branch,
           'Cash' AS method,
           cash_submitted AS cash_amt,
           0 AS upi_amt,
           0 AS bank_amt,
           cash_submitted AS amount,
           'out' AS flow,
           'Cash Submitted' AS source_module,
           CONCAT('Cash submitted by ', COALESCE(submitted_by, 'Admin')) AS description,
           COALESCE(status, 'Approved') AS status
         FROM cash_submitted_records
         ${whereStr}
         ORDER BY id ASC`,
        p
      );

      for (const r of rows) {
        const amt = parseFloat(r.amount || 0);
        if (r.status === 'Approved') {
          totalSubmitted += amt;
        }
        csRows.push({
          ...r,
          id: r.id,
          amount: amt,
          cash_amt: amt,
          upi_amt: 0,
          bank_amt: 0,
          status: r.status || 'Approved'
        });
      }
    }

    // ── Total Credit Adjusted across all bills in date range ──
    let totalCreditAdjusted = 0;
    {
      let w = [`cb.id NOT IN (SELECT DISTINCT bill_id FROM customer_bill_items WHERE finished_product_id IN (SELECT id FROM finished_products WHERE name = 'Can Deposit'))`];
      let p = [];
      if (startDate) { w.push('cb.billing_date >= ?'); p.push(startDate); }
      if (endDate)   { w.push('cb.billing_date <= ?'); p.push(endDate); }
      const whereStr = w.length ? `WHERE ${w.join(' AND ')}` : '';
      const [creditAdjRows] = await pool.query(
        `SELECT
           COALESCE(SUM(
             GREATEST(0, (cb.amount_paid - COALESCE(sub.sub_total, 0)) - (
               GREATEST(0, cb.cash_paid - COALESCE(sub.sub_cash, 0)) +
               GREATEST(0, cb.upi_paid - COALESCE(sub.sub_upi, 0)) +
               GREATEST(0, cb.bank_paid - COALESCE(sub.sub_bank, 0))
             ))
           ), 0) AS total_credit_adjusted
         FROM customer_bills cb
         LEFT JOIN (
           SELECT bill_id,
                  SUM(COALESCE(cash_paid, 0)) AS sub_cash,
                  SUM(COALESCE(upi_paid, 0)) AS sub_upi,
                  SUM(COALESCE(bank_paid, 0)) AS sub_bank,
                  SUM(COALESCE(amount_received, 0)) AS sub_total
           FROM customer_payments
           WHERE payment_status = 'Approved' AND bill_id IS NOT NULL AND bill_id != ''
           GROUP BY bill_id
         ) sub ON cb.id = sub.bill_id
         ${whereStr}`,
        p
      );
      totalCreditAdjusted = parseFloat(creditAdjRows[0]?.total_credit_adjusted || 0);
    }

    // ── 1. Billing — direct counter cash/UPI/Bank on billing_date
    const billingRows = [];
    if (type !== 'out') {
      let w = [
        `(GREATEST(0, cb.cash_paid - COALESCE(sub.sub_cash, 0)) > 0 OR
          GREATEST(0, cb.upi_paid - COALESCE(sub.sub_upi, 0)) > 0 OR
          GREATEST(0, cb.bank_paid - COALESCE(sub.sub_bank, 0)) > 0)`,
        `cb.payment_mode != 'Credit'`,
        `cb.id NOT IN (SELECT DISTINCT bill_id FROM customer_bill_items WHERE finished_product_id IN (SELECT id FROM finished_products WHERE name = 'Can Deposit'))`
      ];
      let p = [];
      if (startDate) { w.push('cb.billing_date >= ?'); p.push(startDate); }
      if (endDate)   { w.push('cb.billing_date <= ?'); p.push(endDate); }
      if (search.trim()) {
        const s = `%${search.trim()}%`;
        w.push('(cb.customer_name LIKE ? OR cb.id LIKE ? OR cb.company LIKE ?)');
        p.push(s, s, s);
      }
      
      if (method && method !== 'All') {
        if (method === 'Cash') {
          w.push('GREATEST(0, cb.cash_paid - COALESCE(sub.sub_cash, 0)) > 0');
        } else if (method === 'UPI') {
          w.push('GREATEST(0, cb.upi_paid - COALESCE(sub.sub_upi, 0)) > 0');
        } else if (method === 'Bank') {
          w.push('GREATEST(0, cb.bank_paid - COALESCE(sub.sub_bank, 0)) > 0');
        } else if (method === 'Credit Balance') {
          w.push(`GREATEST(0, (cb.amount_paid - COALESCE(sub.sub_total, 0)) - (
            GREATEST(0, cb.cash_paid - COALESCE(sub.sub_cash, 0)) +
            GREATEST(0, cb.upi_paid - COALESCE(sub.sub_upi, 0)) +
            GREATEST(0, cb.bank_paid - COALESCE(sub.sub_bank, 0))
          )) > 0`);
        }
      }

      const [rows] = await pool.query(
        `SELECT
           cb.id            AS ref_id,
           DATE_FORMAT(cb.billing_date,'%Y-%m-%d') AS txn_date,
           cb.customer_name AS party,
           cb.company       AS branch,
           CASE
             WHEN GREATEST(0, cb.cash_paid - COALESCE(sub.sub_cash, 0)) > 0 AND GREATEST(0, cb.upi_paid - COALESCE(sub.sub_upi, 0)) > 0 THEN 'Cash + UPI'
             WHEN GREATEST(0, cb.cash_paid - COALESCE(sub.sub_cash, 0)) > 0 AND GREATEST(0, cb.bank_paid - COALESCE(sub.sub_bank, 0)) > 0 THEN 'Cash + Bank'
             WHEN GREATEST(0, cb.upi_paid - COALESCE(sub.sub_upi, 0)) > 0 AND GREATEST(0, cb.bank_paid - COALESCE(sub.sub_bank, 0)) > 0 THEN 'UPI + Bank'
             WHEN GREATEST(0, cb.cash_paid - COALESCE(sub.sub_cash, 0)) > 0 THEN 'Cash'
             WHEN GREATEST(0, cb.upi_paid - COALESCE(sub.sub_upi, 0)) > 0 THEN 'UPI'
             WHEN GREATEST(0, cb.bank_paid - COALESCE(sub.sub_bank, 0)) > 0 THEN 'Bank'
             ELSE cb.payment_mode
           END AS method,
           GREATEST(0, cb.cash_paid - COALESCE(sub.sub_cash, 0)) AS cash_amt,
           GREATEST(0, cb.upi_paid - COALESCE(sub.sub_upi, 0)) AS upi_amt,
           GREATEST(0, cb.bank_paid - COALESCE(sub.sub_bank, 0)) AS bank_amt,
           GREATEST(0, (cb.amount_paid - COALESCE(sub.sub_total, 0)) - (
             GREATEST(0, cb.cash_paid - COALESCE(sub.sub_cash, 0)) +
             GREATEST(0, cb.upi_paid - COALESCE(sub.sub_upi, 0)) +
             GREATEST(0, cb.bank_paid - COALESCE(sub.sub_bank, 0))
           )) AS credit_adjusted_amt,
           (GREATEST(0, cb.cash_paid - COALESCE(sub.sub_cash, 0)) +
            GREATEST(0, cb.upi_paid - COALESCE(sub.sub_upi, 0)) +
            GREATEST(0, cb.bank_paid - COALESCE(sub.sub_bank, 0))) AS amount,
           'in'             AS flow,
           'Billing'        AS source_module,
           CONCAT('Sales Invoice — ', cb.customer_name,
             CASE 
               WHEN ((cb.amount_paid - COALESCE(sub.sub_total, 0)) - (
                 GREATEST(0, cb.cash_paid - COALESCE(sub.sub_cash, 0)) +
                 GREATEST(0, cb.upi_paid - COALESCE(sub.sub_upi, 0)) +
                 GREATEST(0, cb.bank_paid - COALESCE(sub.sub_bank, 0))
               )) > 0 
               THEN ' (Credit Balance Adjusted)' 
               ELSE '' 
             END) AS description
         FROM customer_bills cb
         LEFT JOIN (
           SELECT bill_id,
                  SUM(COALESCE(cash_paid, 0)) AS sub_cash,
                  SUM(COALESCE(upi_paid, 0)) AS sub_upi,
                  SUM(COALESCE(bank_paid, 0)) AS sub_bank,
                  SUM(COALESCE(amount_received, 0)) AS sub_total
           FROM customer_payments
           WHERE payment_status = 'Approved' AND bill_id IS NOT NULL AND bill_id != ''
           GROUP BY bill_id
         ) sub ON cb.id = sub.bill_id
         WHERE ${w.join(' AND ')}
         ORDER BY cb.billing_date DESC, cb.created_at DESC`,
        p
      );
      billingRows.push(...rows);
    }

    // ── 2. Credit payments
    const cpRows = [];
    if (type !== 'out') {
      let w = [
        "cp.payment_status = 'Approved'",
        "(COALESCE(cp.cash_paid, 0) > 0 OR COALESCE(cp.upi_paid, 0) > 0 OR COALESCE(cp.bank_paid, 0) > 0 OR cp.amount_received > 0)",
        "cp.payment_method NOT LIKE '%Credit Balance%'"
      ];
      let p = [];
      if (startDate) { w.push('cp.payment_date >= ?'); p.push(startDate); }
      if (endDate)   { w.push('cp.payment_date <= ?'); p.push(endDate); }
      if (search.trim()) {
        const s = `%${search.trim()}%`;
        w.push('(cb.customer_name LIKE ? OR cust.name LIKE ? OR cp.bill_id LIKE ? OR cp.id LIKE ?)');
        p.push(s, s, s, s);
      }
      if (method && method !== 'All') {
        if (method === 'Cash') {
          w.push('(cp.cash_paid > 0 OR cp.payment_method LIKE ?)');
          p.push('%Cash%');
        } else if (method === 'UPI') {
          w.push('(cp.upi_paid > 0 OR cp.payment_method LIKE ?)');
          p.push('%UPI%');
        } else if (method === 'Bank') {
          w.push('(cp.bank_paid > 0 OR cp.payment_method LIKE ? OR cp.payment_method LIKE ? OR cp.payment_method LIKE ?)');
          p.push('%Bank%', '%Online%', '%Cheque%');
        }
      }
      const [rows] = await pool.query(
        `SELECT
           cp.id              AS ref_id,
           DATE_FORMAT(cp.payment_date,'%Y-%m-%d') AS txn_date,
           COALESCE(NULLIF(TRIM(cb.customer_name), ''), cust.name, cust2.name, 'Credit Customer') AS party,
           COALESCE(cb.company, cp.company, '')  AS branch,
           cp.payment_method  AS method,
           COALESCE(cp.cash_paid, 0)  AS cash_amt,
           COALESCE(cp.upi_paid, 0)   AS upi_amt,
           COALESCE(cp.bank_paid, 0)  AS bank_amt,
           0                  AS credit_adjusted_amt,
           cp.amount_received AS amount,
           'in'               AS flow,
           'Credit Payment'   AS source_module,
           CASE 
             WHEN cp.bill_id IS NULL OR cp.bill_id = '' THEN CONCAT('Advance credit payment received — ', COALESCE(NULLIF(TRIM(cb.customer_name), ''), cust.name, 'Customer'))
             ELSE CONCAT('Credit collected for ', cp.bill_id)
           END AS description,
           cp.bill_id         AS invoice_no,
           cp.remarks         AS notes
         FROM customer_payments cp
         LEFT JOIN customer_bills cb ON cp.bill_id = cb.id
         LEFT JOIN customer_ledger cl ON (cl.reference_no = cp.id AND cl.entry_type = 'PAYMENT')
         LEFT JOIN customers cust ON cust.id = COALESCE(cp.customer_id, cl.customer_id)
         LEFT JOIN customers cust2 ON cust2.id = cb.customer_id
         WHERE ${w.join(' AND ')}
         ORDER BY cp.payment_date DESC, cp.created_at DESC`,
        p
      );
      cpRows.push(...rows);
    }

    // ── 3. Can Supply payments
    const canPayRows = [];
    if (type !== 'out') {
      let w = ["cp.payment_status = 'Approved'"];
      let p = [];
      if (startDate) { w.push('cp.payment_date >= ?'); p.push(startDate); }
      if (endDate)   { w.push('cp.payment_date <= ?'); p.push(endDate); }
      if (search.trim()) {
        const s = `%${search.trim()}%`;
        w.push('(cb.customer_name LIKE ? OR cp.payment_no LIKE ? OR cp.bill_id LIKE ?)');
        p.push(s, s, s);
      }
      const mf = methodFilter('cp.payment_method');
      if (mf) { w.push(mf.clause); p.push(...mf.params); }
      const [rows] = await pool.query(
        `SELECT
           cp.payment_no     AS ref_id,
           DATE_FORMAT(cp.payment_date,'%Y-%m-%d') AS txn_date,
           cb.customer_name  AS party,
           ''                AS branch,
           cp.payment_method AS method,
           0                 AS cash_amt,
           0                 AS upi_amt,
           0                 AS bank_amt,
           cp.amount_paid    AS amount,
           'in'              AS flow,
           'Can Supply'      AS source_module,
           CONCAT('Can payment for bill ', cp.bill_id) AS description
         FROM can_payments cp
         LEFT JOIN can_billing cb ON cp.bill_id = cb.id
         WHERE ${w.join(' AND ')}
         ORDER BY cp.payment_date DESC, cp.created_at DESC`,
        p
      );
      canPayRows.push(...rows);
    }

    // ── 4. Can Deposit IN
    const canDepInRows = [];
    if (type !== 'out') {
      let w = ["(transaction_type LIKE '%Deposit%' AND transaction_type NOT LIKE '%Return%')",
               "(payment_status IS NULL OR payment_status != 'Rejected')"];
      let p = [];
      if (startDate) {
        w.push("DATE_FORMAT(CONVERT_TZ(created_at, '+00:00', '+05:30'), '%Y-%m-%d') >= ?");
        p.push(startDate);
      }
      if (endDate) {
        w.push("DATE_FORMAT(CONVERT_TZ(created_at, '+00:00', '+05:30'), '%Y-%m-%d') <= ?");
        p.push(endDate);
      }
      if (search.trim()) {
        const s = `%${search.trim()}%`;
        w.push('(customer_name LIKE ? OR transaction_id LIKE ? OR mobile_number LIKE ? OR remarks LIKE ?)');
        p.push(s, s, s, s);
      }
      const mf = methodFilter('payment_mode');
      if (mf) { w.push(mf.clause); p.push(...mf.params); }
      const [rows] = await pool.query(
        `SELECT
           transaction_id                                                  AS ref_id,
           DATE_FORMAT(CONVERT_TZ(created_at, '+00:00', '+05:30'), '%Y-%m-%d') AS txn_date,
           customer_name                                                   AS party,
           ''                                                              AS branch,
           payment_mode                                                    AS method,
           CASE WHEN payment_mode LIKE '%Cash%' THEN amount ELSE 0 END     AS cash_amt,
           CASE WHEN payment_mode LIKE '%UPI%' THEN amount ELSE 0 END      AS upi_amt,
           CASE WHEN payment_mode NOT LIKE '%Cash%' AND payment_mode NOT LIKE '%UPI%' THEN amount ELSE 0 END AS bank_amt,
           amount                                                          AS amount,
           'in'                                                            AS flow,
           'Can Deposit'                                                   AS source_module,
           CONCAT('Can deposit received — ', customer_name)                 AS description
         FROM can_deposit_ledger
         WHERE ${w.join(' AND ')}
         ORDER BY created_at DESC`,
        p
      );
      canDepInRows.push(...rows);
    }

    // ── 5. Expenses OUT
    const expenseRows = [];
    if (type !== 'in') {
      let w = ["payment_status = 'Approved'"];
      let p = [];
      if (startDate) { w.push('expense_date >= ?'); p.push(startDate); }
      if (endDate)   { w.push('expense_date <= ?'); p.push(endDate); }
      if (search.trim()) {
        const s = `%${search.trim()}%`;
        w.push('(particulars LIKE ? OR id LIKE ? OR entered_by LIKE ?)');
        p.push(s, s, s);
      }
      const mf = methodFilter('payment_method');
      if (mf) { w.push(mf.clause); p.push(...mf.params); }
      const [rows] = await pool.query(
        `SELECT
           id                                       AS ref_id,
           DATE_FORMAT(expense_date,'%Y-%m-%d')     AS txn_date,
           entered_by                               AS party,
           ''                                       AS branch,
           CASE WHEN particulars LIKE '%Inventory Purchase Expense%' THEN 'Cash' ELSE payment_method END AS method,
           CASE WHEN payment_method LIKE '%Cash%' OR particulars LIKE '%Inventory Purchase Expense%' THEN amount ELSE 0 END AS cash_amt,
           CASE WHEN payment_method LIKE '%UPI%' AND particulars NOT LIKE '%Inventory Purchase Expense%' THEN amount ELSE 0 END AS upi_amt,
           CASE WHEN payment_method NOT LIKE '%Cash%' AND payment_method NOT LIKE '%UPI%' AND particulars NOT LIKE '%Inventory Purchase Expense%' THEN amount ELSE 0 END AS bank_amt,
           amount                                   AS amount,
           'out'                                    AS flow,
           'Expense'                                AS source_module,
           CONCAT(COALESCE(category,'General'), ' — ', particulars) AS description
         FROM expenses
         WHERE ${w.join(' AND ')}
         ORDER BY expense_date DESC, created_at DESC`,
        p
      );
      expenseRows.push(...rows);
    }

    // ── 6. Can Deposit Return OUT
    const canDepOutRows = [];
    if (type !== 'in') {
      let w = ["transaction_type LIKE '%Return%'",
               "(payment_status IS NULL OR payment_status != 'Rejected')"];
      let p = [];
      if (startDate) {
        w.push("DATE_FORMAT(CONVERT_TZ(created_at, '+00:00', '+05:30'), '%Y-%m-%d') >= ?");
        p.push(startDate);
      }
      if (endDate) {
        w.push("DATE_FORMAT(CONVERT_TZ(created_at, '+00:00', '+05:30'), '%Y-%m-%d') <= ?");
        p.push(endDate);
      }
      if (search.trim()) {
        const s = `%${search.trim()}%`;
        w.push('(customer_name LIKE ? OR transaction_id LIKE ? OR mobile_number LIKE ? OR remarks LIKE ?)');
        p.push(s, s, s, s);
      }
      const mf = methodFilter('payment_mode');
      if (mf) { w.push(mf.clause); p.push(...mf.params); }
      const [rows] = await pool.query(
        `SELECT
           transaction_id                                                  AS ref_id,
           DATE_FORMAT(CONVERT_TZ(created_at, '+00:00', '+05:30'), '%Y-%m-%d') AS txn_date,
           customer_name                                                   AS party,
           ''                                                              AS branch,
           payment_mode                                                    AS method,
           CASE WHEN payment_mode LIKE '%Cash%' THEN amount ELSE 0 END     AS cash_amt,
           CASE WHEN payment_mode LIKE '%UPI%' THEN amount ELSE 0 END      AS upi_amt,
           CASE WHEN payment_mode NOT LIKE '%Cash%' AND payment_mode NOT LIKE '%UPI%' THEN amount ELSE 0 END AS bank_amt,
           amount                                                          AS amount,
           'out'                                                           AS flow,
           'Can Deposit Return'                                            AS source_module,
           CONCAT('Deposit returned to — ', customer_name)                 AS description
         FROM can_deposit_ledger
         WHERE ${w.join(' AND ')}
         ORDER BY created_at DESC`,
        p
      );
      canDepOutRows.push(...rows);
    }

    // ── Merge & sort other rows by date DESC ─────────────────────────────────
    const all = [
      ...billingRows,
      ...cpRows,
      ...canPayRows,
      ...canDepInRows,
      ...expenseRows,
      ...canDepOutRows
    ].map(r => ({
      ...r,
      amount:   parseFloat(r.amount   || 0),
      cash_amt: parseFloat(r.cash_amt || 0),
      upi_amt:  parseFloat(r.upi_amt  || 0),
      bank_amt: parseFloat(r.bank_amt || 0),
    }));

    all.sort((a, b) => {
      if (b.txn_date !== a.txn_date) return b.txn_date.localeCompare(a.txn_date);
      return 0;
    });

    // ── Build Opening Balance row if present and matches filters ─────────────
    let openingEntry = null;
    if (openingRow && totalOpening > 0 && type !== 'out') {
      let isMatched = true;
      if (search.trim()) {
        const s = search.trim().toLowerCase();
        isMatched = 'opening balance'.includes(s) || (openingRow.remarks && openingRow.remarks.toLowerCase().includes(s));
      }
      if (method && method !== 'All') {
        if (method === 'Cash' && openingCash === 0) isMatched = false;
        if (method === 'UPI' && openingUpi === 0) isMatched = false;
        if (method === 'Bank' && openingBank === 0) isMatched = false;
      }
      if (isMatched) {
        openingEntry = {
          ref_id: `OPN-${openingRow.entry_date}`,
          txn_date: startDate || openingRow.entry_date,
          party: 'Opening Balance',
          branch: '',
          method: [
            openingCash > 0 ? 'Cash' : null,
            openingUpi > 0 ? 'UPI' : null,
            openingBank > 0 ? 'Bank' : null
          ].filter(Boolean).join(' + ') || 'Cash',
          cash_amt: openingCash,
          upi_amt: openingUpi,
          bank_amt: openingBank,
          amount: totalOpening,
          flow: 'in',
          source_module: 'Opening Balance',
          description: openingRow.remarks ? `Opening Cash — ${openingRow.remarks}` : 'Initial Opening Balance'
        };
      }
    }

    // ── ASSEMBLE FINAL ALL ENTRIES: Opening -> Cash Submitted -> Other Txns ──
    const finalAll = [];
    if (openingEntry) finalAll.push(openingEntry);
    if (csRows.length > 0) finalAll.push(...csRows);
    finalAll.push(...all);

    // ── Summary totals ─────────────────────────────────────────────────────────
    let totalCashIn  = 0, totalUpiIn  = 0, totalBankIn  = 0;
    let totalCashOut = 0, totalUpiOut = 0, totalBankOut = 0;

    for (const r of all) {
      const amt   = r.amount;
      const meth  = String(r.method || '').toLowerCase();
      const rCash = parseFloat(r.cash_amt || 0);
      const rUpi  = parseFloat(r.upi_amt  || 0);
      const rBank = parseFloat(r.bank_amt || 0);

      let cash = 0, upi = 0, bank = 0;

      if (rCash > 0 || rUpi > 0 || rBank > 0) {
        cash = rCash;
        upi  = rUpi;
        bank = rBank;
      } else if (meth !== 'credit balance' && meth !== 'credit adjust' && amt > 0) {
        if (meth.includes('cash')) {
          cash = amt;
        } else if (meth.includes('upi')) {
          upi = amt;
        } else {
          bank = amt;
        }
      }

      if (r.flow === 'in') {
        totalCashIn  += cash;
        totalUpiIn   += upi;
        totalBankIn  += bank;
      } else {
        totalCashOut += cash;
        totalUpiOut  += upi;
        totalBankOut += bank;
      }
    }

    const netCash  = (openingCash + totalCashIn) - totalCashOut;
    const netUpi   = (openingUpi + totalUpiIn) - totalUpiOut;
    const netBank  = (openingBank + totalBankIn) - totalBankOut;
    const netTotal = (totalOpening + totalCashIn + totalUpiIn + totalBankIn) - (totalCashOut + totalUpiOut + totalBankOut);

    const counterCash = Math.max(0, netCash - totalSubmitted);

    const total  = finalAll.length;
    const offset = (page - 1) * limit;
    const paged  = finalAll.slice(offset, offset + limit);

    res.json({
      ok: true,
      entries: paged,
      total,
      page,
      limit,
      summary: {
        openingCash,
        openingUpi,
        openingBank,
        totalOpening,
        cashIn:  totalCashIn,
        upiIn:   totalUpiIn,
        bankIn:  totalBankIn,
        cashOut: totalCashOut,
        upiOut:  totalUpiOut,
        bankOut: totalBankOut,
        netCash,
        netUpi,
        netBank,
        netTotal,
        cashSubmitted: totalSubmitted,
        counterCash,
        creditAdjusted: totalCreditAdjusted
      }
    });
  } catch (error) {
    console.error('Cash ledger error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
