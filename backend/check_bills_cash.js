import pool from './config/db.js';

async function checkBills() {
  try {
    const [rows] = await pool.query(`
      SELECT id, billing_date, customer_name, grand_total, payment_mode, amount_paid, due_amount, cash_paid, upi_paid, bank_paid, payment_status
      FROM customer_bills
      ORDER BY id DESC
      LIMIT 10
    `);
    console.log('Recent customer_bills:', rows);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

checkBills();
