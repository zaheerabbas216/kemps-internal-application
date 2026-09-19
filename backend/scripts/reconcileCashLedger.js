import crypto from 'crypto';
import pool from '../config/db.js';

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const confirmed = args.has('--yes');
const runId = `CLR-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}-${crypto.randomBytes(3).toString('hex')}`;

if (apply && !confirmed) {
  console.error('Refusing to modify production data without both --apply and --yes.');
  console.error('Run a dry-run first: npm run reconcile:cash-ledger');
  process.exit(1);
}

const json = (value) => JSON.stringify(value, (_, item) => {
  if (item instanceof Date) return item.toISOString();
  return item;
});

async function getCandidates(connection) {
  const [bills] = await connection.query(`
    SELECT id, billing_date, payment_mode, amount_paid, due_amount,
           cash_paid, upi_paid, bank_paid, payment_status,
           pending_amount, approved_amount, rejected_amount, approval_id
    FROM customer_bills
    WHERE (COALESCE(cash_paid, 0) + COALESCE(upi_paid, 0) + COALESCE(bank_paid, 0)) > 0
      AND COALESCE(payment_status, '') NOT IN
        ('Approved', 'Paid', 'Partial', 'Partially Paid', 'Pending Approval', 'Rejected')
    ORDER BY billing_date, id
  `);

  const [payments] = await connection.query(`
    SELECT id, bill_id, payment_date, payment_method, amount_received,
           cash_paid, upi_paid, bank_paid, payment_status,
           pending_amount, approved_amount, rejected_amount, approval_id
    FROM customer_payments
    WHERE COALESCE(amount_received, 0) > 0
      AND COALESCE(payment_status, '') NOT IN ('Approved', 'Pending Approval', 'Rejected')
    ORDER BY payment_date, id
  `);

  const [billSplits] = await connection.query(`
    SELECT id, billing_date, payment_mode, amount_paid,
           cash_paid, upi_paid, bank_paid, payment_status
    FROM customer_bills
    WHERE COALESCE(amount_paid, 0) > 0
      AND COALESCE(cash_paid, 0) = 0
      AND COALESCE(upi_paid, 0) = 0
      AND COALESCE(bank_paid, 0) = 0
      AND LOWER(TRIM(payment_mode)) IN ('cash', 'upi', 'bank', 'bank transfer')
      AND payment_status IN ('Approved', 'Paid', 'Partial', 'Partially Paid')
    ORDER BY billing_date, id
  `);

  const [paymentSplits] = await connection.query(`
    SELECT id, bill_id, payment_date, payment_method, amount_received,
           cash_paid, upi_paid, bank_paid, payment_status
    FROM customer_payments
    WHERE COALESCE(amount_received, 0) > 0
      AND COALESCE(cash_paid, 0) = 0
      AND COALESCE(upi_paid, 0) = 0
      AND COALESCE(bank_paid, 0) = 0
      AND LOWER(TRIM(payment_method)) IN ('cash', 'upi', 'bank', 'bank transfer')
      AND payment_status = 'Approved'
    ORDER BY payment_date, id
  `);

  const [missingApprovalLedger] = await connection.query(`
    SELECT pa.*
    FROM payment_approvals pa
    LEFT JOIN cash_ledger cl ON cl.approval_id = pa.approval_id
    WHERE pa.status = 'Approved'
      AND pa.cash_ledger_updated = 1
      AND cl.id IS NULL
    ORDER BY pa.transaction_date, pa.approved_at, pa.id
  `);

  const [pendingPaymentReview] = await connection.query(`
    SELECT id, bill_id, payment_date, payment_method, amount_received,
           cash_paid, upi_paid, bank_paid, pending_amount, approval_id
    FROM customer_payments
    WHERE payment_status = 'Pending Approval'
      AND COALESCE(amount_received, 0) > 0
      AND (
        COALESCE(cash_paid, 0) + COALESCE(upi_paid, 0) + COALESCE(bank_paid, 0) = 0
        OR COALESCE(pending_amount, 0) <= 0
        OR approval_id IS NULL
      )
    ORDER BY payment_date, id
  `);

  // Some legacy imports created a second, zero-split payment row for the
  // exact receipt already stored on the invoice. The strict predicates below
  // distinguish those shadow rows from genuine later collections.
  const [duplicatePendingPayments] = await connection.query(`
    SELECT cp.id, cp.bill_id, cp.payment_date, cp.payment_method,
           cp.amount_received, cp.cash_paid, cp.upi_paid, cp.bank_paid,
           cp.payment_status, cp.pending_amount, cp.approved_amount,
           cp.rejected_amount, cp.approval_id, cp.remarks
    FROM customer_payments cp
    JOIN customer_bills cb ON cb.id = cp.bill_id
    WHERE cp.payment_status = 'Pending Approval'
      AND COALESCE(cp.amount_received, 0) > 0
      AND COALESCE(cp.cash_paid, 0) = 0
      AND COALESCE(cp.upi_paid, 0) = 0
      AND COALESCE(cp.bank_paid, 0) = 0
      AND COALESCE(cp.pending_amount, 0) = 0
      AND cp.approval_id IS NULL
      AND cp.payment_date = cb.billing_date
      AND ABS(COALESCE(cp.amount_received, 0) - COALESCE(cb.amount_paid, 0)) <= 0.01
      AND LOWER(TRIM(cp.payment_method)) = LOWER(TRIM(cb.payment_mode))
    ORDER BY cp.payment_date, cp.id
  `);

  const duplicatePendingIds = new Set(duplicatePendingPayments.map(row => row.id));
  const unresolvedPendingPayments = pendingPaymentReview.filter(
    row => !duplicatePendingIds.has(row.id)
  );

  const [ambiguousSplits] = await connection.query(`
    SELECT 'customer_bills' AS source, id, payment_mode AS method, amount_paid AS amount
    FROM customer_bills
    WHERE COALESCE(amount_paid, 0) > 0
      AND COALESCE(cash_paid, 0) = 0
      AND COALESCE(upi_paid, 0) = 0
      AND COALESCE(bank_paid, 0) = 0
      AND LOWER(TRIM(payment_mode)) NOT IN ('cash', 'upi', 'bank', 'bank transfer', 'credit', 'credit balance')
    UNION ALL
    SELECT 'customer_payments' AS source, id, payment_method AS method, amount_received AS amount
    FROM customer_payments
    WHERE COALESCE(amount_received, 0) > 0
      AND COALESCE(cash_paid, 0) = 0
      AND COALESCE(upi_paid, 0) = 0
      AND COALESCE(bank_paid, 0) = 0
      AND LOWER(TRIM(payment_method)) NOT IN ('cash', 'upi', 'bank', 'bank transfer', 'credit', 'credit balance')
    ORDER BY source, id
  `);

  return {
    bills,
    payments,
    billSplits,
    paymentSplits,
    missingApprovalLedger,
    duplicatePendingPayments,
    pendingPaymentReview: unresolvedPendingPayments,
    ambiguousSplits
  };
}

function printReport(candidates) {
  console.log(`\nCash Ledger reconciliation ${apply ? 'APPLY' : 'DRY-RUN'} — ${runId}`);
  console.table([
    { category: 'Billing statuses safe to normalize', count: candidates.bills.length },
    { category: 'Payment statuses safe to normalize', count: candidates.payments.length },
    { category: 'Billing mode splits safe to infer', count: candidates.billSplits.length },
    { category: 'Payment mode splits safe to infer', count: candidates.paymentSplits.length },
    { category: 'Approved requests missing cash_ledger row', count: candidates.missingApprovalLedger.length },
    { category: 'Duplicate pending rows safe to quarantine', count: candidates.duplicatePendingPayments.length },
    { category: 'Inconsistent pending payments (manual review)', count: candidates.pendingPaymentReview.length },
    { category: 'Ambiguous splits requiring manual review', count: candidates.ambiguousSplits.length }
  ]);

  for (const [name, rows] of Object.entries(candidates)) {
    if (rows.length > 0) {
      console.log(`\n${name} (showing up to 20):`);
      console.table(rows.slice(0, 20));
    }
  }
}

async function audit(connection, entityType, entityId, action, before, after) {
  await connection.query(
    `INSERT INTO cash_ledger_reconciliation_audit
       (run_id, entity_type, entity_id, action_name, before_data, after_data)
     VALUES (?, ?, ?, ?, CAST(? AS JSON), CAST(? AS JSON))`,
    [runId, entityType, String(entityId), action, json(before), json(after)]
  );
}

function inferredSplit(method, amount) {
  const normalized = String(method || '').trim().toLowerCase();
  const value = Number(amount) || 0;
  return {
    cash: normalized === 'cash' ? value : 0,
    upi: normalized === 'upi' ? value : 0,
    bank: normalized === 'bank' || normalized === 'bank transfer' ? value : 0
  };
}

async function ensureAuditTable(connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS cash_ledger_reconciliation_audit (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      run_id VARCHAR(64) NOT NULL,
      entity_type VARCHAR(64) NOT NULL,
      entity_id VARCHAR(64) NOT NULL,
      action_name VARCHAR(100) NOT NULL,
      before_data JSON NOT NULL,
      after_data JSON NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_clra_run (run_id),
      INDEX idx_clra_entity (entity_type, entity_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function applyRepairs(connection, candidates) {
  for (const row of candidates.bills) {
    const normalizedStatus = Number(row.due_amount) <= 0
      ? 'Paid'
      : Number(row.amount_paid) > 0
        ? 'Partial'
        : 'Unpaid';
    const after = { ...row, payment_status: normalizedStatus, pending_amount: 0, approved_amount: row.amount_paid };
    await audit(connection, 'customer_bills', row.id, 'NORMALIZE_STATUS', row, after);
    await connection.query(
      `UPDATE customer_bills
       SET payment_status = ?, pending_amount = 0.00,
           approved_amount = GREATEST(COALESCE(approved_amount, 0), COALESCE(amount_paid, 0)),
           last_status_update = NOW()
       WHERE id = ?
         AND COALESCE(payment_status, '') NOT IN
           ('Approved', 'Paid', 'Partial', 'Partially Paid', 'Pending Approval', 'Rejected')`,
      [normalizedStatus, row.id]
    );
  }

  for (const row of candidates.payments) {
    const after = { ...row, payment_status: 'Approved', pending_amount: 0, approved_amount: row.amount_received };
    await audit(connection, 'customer_payments', row.id, 'NORMALIZE_STATUS', row, after);
    await connection.query(
      `UPDATE customer_payments
       SET payment_status = 'Approved', pending_amount = 0.00,
           approved_amount = GREATEST(COALESCE(approved_amount, 0), COALESCE(amount_received, 0)),
           last_status_update = NOW()
       WHERE id = ?
         AND COALESCE(payment_status, '') NOT IN ('Approved', 'Pending Approval', 'Rejected')`,
      [row.id]
    );
  }

  for (const row of candidates.billSplits) {
    const split = inferredSplit(row.payment_mode, row.amount_paid);
    const after = { ...row, cash_paid: split.cash, upi_paid: split.upi, bank_paid: split.bank };
    await audit(connection, 'customer_bills', row.id, 'INFER_PAYMENT_SPLIT', row, after);
    await connection.query(
      `UPDATE customer_bills SET cash_paid = ?, upi_paid = ?, bank_paid = ?
       WHERE id = ? AND COALESCE(cash_paid, 0) = 0
         AND COALESCE(upi_paid, 0) = 0 AND COALESCE(bank_paid, 0) = 0`,
      [split.cash, split.upi, split.bank, row.id]
    );
  }

  for (const row of candidates.paymentSplits) {
    const split = inferredSplit(row.payment_method, row.amount_received);
    const after = { ...row, cash_paid: split.cash, upi_paid: split.upi, bank_paid: split.bank };
    await audit(connection, 'customer_payments', row.id, 'INFER_PAYMENT_SPLIT', row, after);
    await connection.query(
      `UPDATE customer_payments SET cash_paid = ?, upi_paid = ?, bank_paid = ?
       WHERE id = ? AND COALESCE(cash_paid, 0) = 0
         AND COALESCE(upi_paid, 0) = 0 AND COALESCE(bank_paid, 0) = 0`,
      [split.cash, split.upi, split.bank, row.id]
    );
  }

  for (const row of candidates.duplicatePendingPayments) {
    const after = {
      ...row,
      amount_received: 0,
      payment_status: 'Rejected',
      pending_amount: 0,
      approved_amount: 0,
      rejected_amount: row.amount_received,
      remarks: [row.remarks, 'Quarantined duplicate of payment recorded on invoice'].filter(Boolean).join(' | ')
    };
    await audit(connection, 'customer_payments', row.id, 'QUARANTINE_DUPLICATE_PENDING_PAYMENT', row, after);
    await connection.query(
      `UPDATE customer_payments
       SET amount_received = 0.00,
           payment_status = 'Rejected',
           pending_amount = 0.00,
           approved_amount = 0.00,
           rejected_amount = ?,
           remarks = ?,
           last_status_update = NOW()
       WHERE id = ?
         AND payment_status = 'Pending Approval'
         AND approval_id IS NULL
         AND COALESCE(pending_amount, 0) = 0`,
      [row.amount_received, after.remarks, row.id]
    );
  }

  const [balanceRows] = await connection.query(
    `SELECT closing_balance FROM cash_ledger ORDER BY id DESC LIMIT 1 FOR UPDATE`
  );
  let closingBalance = balanceRows.length ? Number(balanceRows[0].closing_balance) || 0 : 0;

  for (const row of candidates.missingApprovalLedger) {
    const amount = Number(row.amount) || 0;
    const openingBalance = closingBalance;
    closingBalance = row.transaction_type === 'Cash In'
      ? openingBalance + amount
      : openingBalance - amount;
    const after = { approval_id: row.approval_id, opening_balance: openingBalance, closing_balance: closingBalance };
    await audit(connection, 'cash_ledger', row.approval_id, 'INSERT_MISSING_APPROVAL_ENTRY', row, after);
    await connection.query(
      `INSERT INTO cash_ledger
       (approval_id, transaction_id, reference_no, type, source_module, description,
        amount, opening_balance, closing_balance, approved_by, approved_at, created_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW()), NOW()
       WHERE NOT EXISTS (SELECT 1 FROM cash_ledger WHERE approval_id = ?)`,
      [
        row.approval_id, row.transaction_id, row.reference_no, row.transaction_type,
        row.source_module, row.description, amount, openingBalance, closingBalance,
        row.approved_by || 'Reconciliation', row.approved_at, row.approval_id
      ]
    );
  }

  // Historical inserts may belong between existing entries. Rebuild all
  // running balances chronologically so a repaired row cannot corrupt later
  // opening/closing balances.
  const [ledgerRows] = await connection.query(
    `SELECT id, type, amount
     FROM cash_ledger
     ORDER BY COALESCE(approved_at, created_at) ASC, id ASC
     FOR UPDATE`
  );
  let runningBalance = 0;
  for (const row of ledgerRows) {
    const openingBalance = runningBalance;
    const amount = Number(row.amount) || 0;
    runningBalance = row.type === 'Cash In'
      ? openingBalance + amount
      : openingBalance - amount;
    await connection.query(
      `UPDATE cash_ledger SET opening_balance = ?, closing_balance = ? WHERE id = ?`,
      [openingBalance, runningBalance, row.id]
    );
  }
}

async function main() {
  const connection = await pool.getConnection();
  let lockAcquired = false;
  try {
    const [lockRows] = await connection.query(`SELECT GET_LOCK('kemps_cash_ledger_reconcile', 5) AS acquired`);
    lockAcquired = Number(lockRows[0]?.acquired) === 1;
    if (!lockAcquired) throw new Error('Another cash-ledger reconciliation is already running.');

    const candidates = await getCandidates(connection);
    printReport(candidates);

    if (!apply) {
      console.log('\nDry-run only. No database records were changed.');
      console.log('After reviewing ambiguous records, apply with: npm run reconcile:cash-ledger:apply');
      return;
    }

    // DDL can implicitly commit in MySQL, so create the audit table before
    // beginning the all-or-nothing repair transaction.
    await ensureAuditTable(connection);
    await connection.beginTransaction();
    await applyRepairs(connection, candidates);
    await connection.commit();

    const remaining = await getCandidates(connection);
    console.log(`\nApplied successfully. Audit run ID: ${runId}`);
    console.log(`Remaining ambiguous records requiring manual review: ${remaining.ambiguousSplits.length}`);
  } catch (error) {
    if (apply) await connection.rollback();
    console.error('\nCash Ledger reconciliation failed:', error.message);
    process.exitCode = 1;
  } finally {
    if (lockAcquired) await connection.query(`SELECT RELEASE_LOCK('kemps_cash_ledger_reconcile')`);
    connection.release();
    await pool.end();
  }
}

main();
