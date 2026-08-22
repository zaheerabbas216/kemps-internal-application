import pool from './config/db.js';

async function seed() {
  console.log('Starting demo ledger seeding for CUST-2026-00008 (Hari Om Caterings)...');
  try {
    const customerId = 'CUST-2026-00008';
    
    // 1. Clean up existing demo records
    console.log('Cleaning up existing records for customer...');
    await pool.query('DELETE FROM customer_ledger WHERE customer_id = ?', [customerId]);
    await pool.query("DELETE FROM customer_payments WHERE bill_id LIKE 'BILL-DEMO-%'");
    await pool.query('DELETE FROM sales_returns WHERE customer_id = ?', [customerId]);
    await pool.query('DELETE FROM customer_bills WHERE customer_id = ?', [customerId]);

    // 2. Seed Customer Bills
    console.log('Inserting mock bills...');
    const billId1 = 'BILL-DEMO-001';
    const billId2 = 'BILL-DEMO-002';
    
    await pool.query(
      `INSERT INTO customer_bills 
       (id, billing_date, company, customer_type, customer_id, customer_name, customer_phone, grand_total, payment_mode, amount_paid, due_amount, payment_status, created_at)
       VALUES 
       (?, '2026-07-01', 'Kempannavar Industries', 'Distributor', ?, 'Hari Om Caterings', '9035558246', 1500.00, 'Credit', 0.00, 1500.00, 'Approved', NOW()),
       (?, '2026-07-04', 'Kemps Pet Industries', 'Distributor', ?, 'Hari Om Caterings', '9035558246', 2500.00, 'Cash', 2500.00, 0.00, 'Approved', NOW())`,
      [billId1, customerId, billId2, customerId]
    );

    // 3. Seed Customer Payments
    console.log('Inserting mock payments...');
    const payId1 = 'PAY-DEMO-001';
    await pool.query(
      `INSERT INTO customer_payments 
       (id, bill_id, payment_date, amount_received, payment_status, payment_method, created_at)
       VALUES 
       (?, ?, '2026-07-02', 1000.00, 'Approved', 'Cash', NOW())`,
      [payId1, billId1]
    );

    // 4. Seed Sales Return
    console.log('Inserting mock sales returns...');
    const returnId1 = 'SR-DEMO-001';
    await pool.query(
      `INSERT INTO sales_returns 
       (id, return_date, bill_id, customer_id, total_return_amount, reason, created_by, settlement_method, refund_amount, status, created_at)
       VALUES 
       (?, '2026-07-03', ?, ?, 200.00, 'Leakage', 'Admin', 'CREDIT', 0.00, 'Approved', NOW())`,
      [returnId1, billId1, customerId]
    );

    // 5. Seed Customer Ledger Entries
    console.log('Inserting mock customer ledger entries...');
    // A. Invoice 1 (Debit ₹ 1,500.00)
    await pool.query(
      `INSERT INTO customer_ledger (date, customer_id, entry_type, reference_no, particular, debit, credit, balance, created_at)
       VALUES ('2026-07-01', ?, 'SALE', ?, 'Sale Invoice BILL-DEMO-001', 1500.00, 0.00, 1500.00, NOW())`,
      [customerId, billId1]
    );

    // B. Payment 1 (Credit ₹ 1,000.00)
    await pool.query(
      `INSERT INTO customer_ledger (date, customer_id, entry_type, reference_no, particular, debit, credit, balance, created_at)
       VALUES ('2026-07-02', ?, 'PAYMENT', ?, 'Payment Received (Cash)', 0.00, 1000.00, 500.00, NOW())`,
      [customerId, payId1]
    );

    // C. Sales Return 1 (Credit ₹ 200.00)
    await pool.query(
      `INSERT INTO customer_ledger (date, customer_id, entry_type, reference_no, particular, debit, credit, balance, created_at)
       VALUES ('2026-07-03', ?, 'SALES_RETURN', ?, 'Sales Return SR-DEMO-001 (Leakage)', 0.00, 200.00, 300.00, NOW())`,
      [customerId, returnId1]
    );

    // D. Invoice 2 (Debit ₹ 2,500.00) and Cash Payment at Creation (Credit ₹ 2,500.00)
    await pool.query(
      `INSERT INTO customer_ledger (date, customer_id, entry_type, reference_no, particular, debit, credit, balance, created_at)
       VALUES 
       ('2026-07-04', ?, 'SALE', ?, 'Sale Invoice BILL-DEMO-002', 2500.00, 0.00, 2800.00, NOW()),
       ('2026-07-04', ?, 'PAYMENT', ?, 'Payment Received (At Invoice Creation)', 0.00, 2500.00, 300.00, NOW())`,
      [customerId, billId2, customerId, billId2]
    );

    // 6. Recalculate customer credit balance and summary
    console.log('Recalculating customer credit balance...');
    await pool.query(
      `UPDATE customers 
       SET credit_balance = 0.00
       WHERE id = ?`,
      [customerId]
    );

    console.log('✔ Seeding demo ledger data completed successfully!');
  } catch (err) {
    console.error('Error seeding demo ledger:', err);
  } finally {
    await pool.end();
  }
}

seed();
