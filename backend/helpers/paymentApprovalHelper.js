import pool from '../config/db.js';

/**
 * Creates a pending Payment Approval entry in the payment_approvals table.
 * This is called internally by other modules after a financial transaction is recorded.
 * Uses the provided connection if inside a transaction, or pool directly.
 *
 * @param {Object} opts
 * @param {string} opts.transactionId  - Source record ID (bill ID, expense ID, etc.)
 * @param {string} opts.sourceModule   - 'Billing' | 'Expense' | 'CanDeposit' | 'CreditBalance' | 'SupplierPayment'
 * @param {string} opts.transactionType - 'Cash In' | 'Cash Out'
 * @param {string} [opts.referenceNo]  - Human-readable reference (invoice no, expense no)
 * @param {string} [opts.partyName]    - Customer or vendor name
 * @param {string} [opts.description]  - Free-text summary
 * @param {string} [opts.paymentMethod] - e.g. 'Cash', 'UPI', 'Bank', 'Cash + UPI'
 * @param {number} [opts.cashAmount]
 * @param {number} [opts.upiAmount]
 * @param {number} [opts.bankAmount]
 * @param {number} opts.amount         - Total amount
 * @param {string} opts.transactionDate - YYYY-MM-DD
 * @param {string} [opts.enteredBy]
 * @param {string} [opts.remarks]
 * @param {Object} [connection]        - Optional MySQL connection for transactional usage
 */
export async function createPaymentApprovalEntry(opts, connection = null) {
  const db = connection || pool;
  try {
    // Generate approval_id
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const istDate = new Date(now.getTime() + (330 + offset) * 60000);
    const yyyy = istDate.getFullYear();

    const [rows] = await db.query(
      `SELECT approval_id FROM payment_approvals WHERE approval_id LIKE ? ORDER BY approval_id DESC LIMIT 1`,
      [`PAY-${yyyy}-%`]
    );

    let seq = 1;
    if (rows.length) {
      const match = rows[0].approval_id.match(/^PAY-\d{4}-(\d+)$/);
      if (match && match[1]) seq = parseInt(match[1]) + 1;
    }
    const approvalId = `PAY-${yyyy}-${String(seq).padStart(5, '0')}`;

    // Prevent duplicates
    const [existing] = await db.query(
      `SELECT approval_id FROM payment_approvals WHERE transaction_id = ? AND source_module = ?`,
      [opts.transactionId, opts.sourceModule]
    );
    if (existing.length > 0) return existing[0].approval_id;

    await db.query(
      `INSERT INTO payment_approvals 
       (approval_id, transaction_id, source_module, transaction_type, reference_no, party_name, description,
        payment_method, cash_amount, upi_amount, bank_amount, amount, transaction_date, entered_by, remarks, 
        status, cash_ledger_updated, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', 0, NOW(), NOW())`,
      [
        approvalId,
        opts.transactionId,
        opts.sourceModule,
        opts.transactionType,
        opts.referenceNo || '',
        opts.partyName || '',
        opts.description || '',
        opts.paymentMethod || 'Cash',
        parseFloat(opts.cashAmount) || 0,
        parseFloat(opts.upiAmount) || 0,
        parseFloat(opts.bankAmount) || 0,
        parseFloat(opts.amount) || 0,
        opts.transactionDate,
        opts.enteredBy || '',
        opts.remarks || ''
      ]
    );

    return approvalId;
  } catch (err) {
    // Log but don't throw — we don't want payment approval failure to break the main transaction
    console.error('createPaymentApprovalEntry error:', err.message);
    return null;
  }
}
