import jwt from 'jsonwebtoken';
import pool from './config/db.js';
import app from './app.js';

async function runTests() {
  console.log('--- STARTING BILLING CREDIT INTEGRATION TEST ---');
  let server;

  try {
    // 1. Generate Auth Token
    const JWT_SECRET = process.env.JWT_SECRET || 'kemps_secret_key_123';
    const token = jwt.sign({ username: 'test_admin', name: 'Test Admin' }, JWT_SECRET, { expiresIn: '1h' });

    // 2. Start Test Express Server
    server = app.listen(0);
    const port = server.address().port;
    console.log(`Test server listening on port: ${port}`);

    // Resolve a test customer
    const [custRows] = await pool.query("SELECT id, name, phone FROM customers LIMIT 1");
    if (custRows.length === 0) {
      console.log('No customers found. Skipping.');
      process.exit(0);
    }
    const testCust = custRows[0];
    console.log(`Using customer: ${testCust.name} (${testCust.phone})`);

    // Reset customer ledger and credit balance first to have clean slate for test
    console.log('Resetting customer ledger...');
    await pool.query("DELETE FROM customer_ledger WHERE customer_id = ?", [testCust.id]);
    await pool.query("DELETE FROM customer_payments WHERE remarks LIKE 'Advance Payment (KI). Test%'");
    await pool.query("UPDATE customers SET credit_balance = 0.00 WHERE id = ?", [testCust.id]);

    // 3. Post an Advance Payment of ₹1000
    console.log('Step 3: Recording ₹1000 Advance Payment...');
    const advRes = await fetch(`http://localhost:${port}/api/accounts-ledger/advance-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        customerId: testCust.id,
        company: 'Kempannavar Industries',
        paymentDate: new Date().toISOString().split('T')[0],
        cashAmount: 1000,
        remarks: 'Test Advance Payment'
      })
    });
    const advData = await advRes.json();
    console.log('Advance Payment Response:', advData);
    if (!advRes.ok || !advData.ok) {
      throw new Error(`Failed to record advance payment: ${advData.error}`);
    }

    // Verify credit_balance is updated to ₹1000
    const [custCheck1] = await pool.query("SELECT credit_balance FROM customers WHERE id = ?", [testCust.id]);
    const cb1 = parseFloat(custCheck1[0].credit_balance);
    console.log(`Customer Credit Balance after advance: ₹${cb1}`);
    if (cb1 !== 1000.00) {
      throw new Error(`Expected credit balance to be 1000, got ${cb1}`);
    }

    // Fetch finished product for billing
    const [prodRows] = await pool.query("SELECT id, rate_distributor FROM finished_products WHERE status = 1 LIMIT 1");
    if (prodRows.length === 0) {
      console.log('No active finished products. Skipping billing test.');
      process.exit(0);
    }
    const product = prodRows[0];

    // 4. Generate a bill of ₹1200: applying credit + ₹200 cash
    // We will supply 10 units at ₹120 rate = ₹1200 total
    console.log('Step 4: Creating ₹1200 invoice (applying ₹1000 credit + ₹200 cash)...');
    const billRes = await fetch(`http://localhost:${port}/api/billing`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        billingDate: new Date().toISOString().split('T')[0],
        company: 'Kempannavar Industries',
        customerType: 'Distributor',
        customerName: testCust.name,
        customerPhone: testCust.phone,
        grandTotal: 1200.00,
        amountPaid: 1200.00,
        dueAmount: 0.00,
        cashPaid: 200.00,
        upiPaid: 0.00,
        bankPaid: 0.00,
        applyCredit: true,
        items: [{
          finishedProductId: product.id,
          quantity: 10,
          rateWithTax: 120.00,
          taxPercent: 18
        }]
      })
    });
    const billData = await billRes.json();
    console.log('Billing Response:', billData);
    if (!billRes.ok || !billData.ok) {
      throw new Error(`Failed to save invoice: ${billData.error}`);
    }
    const billId = billData.id;

    // 5. Verify customer credit_balance becomes ₹0
    const [custCheck2] = await pool.query("SELECT credit_balance FROM customers WHERE id = ?", [testCust.id]);
    const cb2 = parseFloat(custCheck2[0].credit_balance);
    console.log(`Customer Credit Balance after invoice: ₹${cb2}`);
    if (cb2 !== 0.00) {
      throw new Error(`Expected credit balance to be 0, got ${cb2}`);
    }

    // 6. Verify ledger entries:
    // Debit = 1200
    // Payment credit = 200
    // Pre-existing Payment credit = 1000
    // Net balance should be 0!
    const [ledgerRows] = await pool.query(
      "SELECT entry_type, reference_no, debit, credit, balance FROM customer_ledger WHERE customer_id = ? ORDER BY date ASC, id ASC",
      [testCust.id]
    );
    console.log('Customer Ledger entries:', ledgerRows);

    const netBalance = parseFloat(ledgerRows[ledgerRows.length - 1].balance);
    console.log(`Ledger Net Balance: ₹${netBalance}`);
    if (netBalance !== 0.00) {
      throw new Error(`Expected ledger balance to be 0, got ${netBalance}`);
    }

    // Clean up
    console.log('Step 7: Cleaning up test data...');
    await pool.query("DELETE FROM customer_ledger WHERE customer_id = ?", [testCust.id]);
    await pool.query("DELETE FROM customer_bills WHERE id = ?", [billId]);
    await pool.query("DELETE FROM customer_payments WHERE remarks LIKE 'Advance Payment (KI). Test%'");
    await pool.query("UPDATE customers SET credit_balance = 0.00 WHERE id = ?", [testCust.id]);

    console.log('--- ALL BILLING CREDIT TESTS PASSED ---');
    process.exit(0);

  } catch (err) {
    console.error('--- TEST FAILED ---');
    console.error(err);
    process.exit(1);
  } finally {
    if (server) {
      server.close();
    }
  }
}

runTests();
