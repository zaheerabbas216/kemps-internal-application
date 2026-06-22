import jwt from 'jsonwebtoken';
import pool from './config/db.js';
import app from './app.js';
import { addLedgerEntry, deleteLedgerEntriesForReference, recalculateLedgerBalances } from './helpers/ledgerHelper.js';

async function runTests() {
  console.log('--- STARTING CUSTOMER LEDGER INTEGRATION TEST ---');
  let server;
  const testCustomerId = 'CUST-TEST-99999';
  const testDate = '2026-06-17';

  try {
    // 1. Setup a test customer
    console.log('Step 1: Setting up test customer...');
    await pool.query('DELETE FROM customers WHERE id = ? OR phone = ?', [testCustomerId, '9999999999']);
    await pool.query(
      `INSERT INTO customers (id, name, phone, gstin, address, credit_balance, created_at)
       VALUES (?, 'Test Customer Ledger', '9999999999', '29TESTGST', '123 Test St', 100.00, NOW())`,
      [testCustomerId]
    );
    console.log(`Test customer set up: ${testCustomerId}`);

    // 2. Test direct ledger helpers
    console.log('Step 2: Testing direct ledger helpers...');
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Test inserting a SALE (debit)
      await addLedgerEntry(connection, {
        date: testDate,
        customerId: testCustomerId,
        entryType: 'SALE',
        referenceNo: 'BILL-TEST-999',
        particular: 'Test Sale',
        debit: 1500.00,
        credit: 0.00
      });

      // Test inserting a PAYMENT (credit)
      await addLedgerEntry(connection, {
        date: testDate,
        customerId: testCustomerId,
        entryType: 'PAYMENT',
        referenceNo: 'PAY-TEST-999',
        particular: 'Test Payment',
        debit: 0.00,
        credit: 500.00
      });

      await connection.commit();
      console.log('Ledger entries added directly.');
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }

    // Verify running balance recalculations
    const [rows] = await pool.query(
      'SELECT debit, credit, balance FROM customer_ledger WHERE customer_id = ? ORDER BY date ASC, id ASC',
      [testCustomerId]
    );

    if (rows.length !== 2) {
      throw new Error(`Expected 2 ledger entries, found ${rows.length}`);
    }
    if (parseFloat(rows[0].balance) !== 1500.00) {
      throw new Error(`Expected first balance 1500.00, got ${rows[0].balance}`);
    }
    if (parseFloat(rows[1].balance) !== 1000.00) {
      throw new Error(`Expected second balance 1000.00, got ${rows[1].balance}`);
    }
    console.log('Verified running balances are correct (1500.00 Dr, then 1000.00 Dr).');

    // 3. Generate JWT Token
    console.log('Step 3: Generating JWT Token for API authentication...');
    const JWT_SECRET = process.env.JWT_SECRET || 'kemps_secret_key_123';
    const token = jwt.sign({ username: 'admin', name: 'Zaheer Abbas' }, JWT_SECRET, { expiresIn: '1h' });

    // 4. Start Test Server
    console.log('Step 4: Starting temporary server...');
    server = app.listen(0);
    const port = server.address().port;
    const baseUrl = `http://localhost:${port}/api/accounts-ledger`;
    console.log(`Temporary server running on port: ${port}`);

    // Helper for auth fetch
    const authFetch = async (url, options = {}) => {
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers
      };
      const response = await fetch(url, { ...options, headers });
      const data = await response.json();
      return { status: response.status, data };
    };

    // 5. Test GET customers route
    console.log('Step 5: Testing GET /customers endpoint...');
    const custRes = await authFetch(`${baseUrl}/customers`);
    if (!custRes.data.ok) {
      throw new Error(`GET /customers failed: ${custRes.data.error}`);
    }
    const hasTestCust = custRes.data.customers.some(c => c.id === testCustomerId);
    if (!hasTestCust) {
      throw new Error('Test customer not returned in dropdown list.');
    }
    console.log('Verified customer lists successfully.');

    // 6. Test GET summary route
    console.log('Step 6: Testing GET /summary/:customerId endpoint...');
    const sumRes = await authFetch(`${baseUrl}/summary/${testCustomerId}`);
    if (!sumRes.data.ok) {
      throw new Error(`GET /summary/:id failed: ${sumRes.data.error}`);
    }
    const summary = sumRes.data.summary;
    if (parseFloat(summary.outstandingDue) !== 1000.00) {
      throw new Error(`Expected outstanding balance of 1000.00, got ${summary.outstandingDue}`);
    }
    console.log(`Verified KPIs: Name=${summary.customerName}, Outstanding=${summary.outstandingDue}`);

    // 7. Test GET transactions route
    console.log('Step 7: Testing GET /transactions/:customerId endpoint...');
    const txRes = await authFetch(`${baseUrl}/transactions/${testCustomerId}`);
    if (!txRes.data.ok) {
      throw new Error(`GET /transactions/:id failed: ${txRes.data.error}`);
    }
    const txs = txRes.data.transactions;
    if (txs.length !== 2) {
      throw new Error(`Expected 2 transactions from API, got ${txs.length}`);
    }
    console.log(`Verified transactions: Tx1=${txs[0].particular}, Tx2=${txs[1].particular}`);

    // 8. Test GET analytics route
    console.log('Step 8: Testing GET /analytics/:customerId endpoint...');
    const analRes = await authFetch(`${baseUrl}/analytics/${testCustomerId}`);
    if (!analRes.data.ok) {
      throw new Error(`GET /analytics/:id failed: ${analRes.data.error}`);
    }
    console.log('Verified analytics endpoints.');

    // 9. Test Delete Helper
    console.log('Step 9: Testing delete helper...');
    const connection2 = await pool.getConnection();
    try {
      await connection2.beginTransaction();
      await deleteLedgerEntriesForReference(connection2, 'BILL-TEST-999');
      await connection2.commit();
    } catch (err) {
      await connection2.rollback();
      throw err;
    } finally {
      connection2.release();
    }

    // Verify after deletion
    const [rowsAfterDelete] = await pool.query(
      'SELECT debit, credit, balance FROM customer_ledger WHERE customer_id = ? ORDER BY date ASC, id ASC',
      [testCustomerId]
    );
    if (rowsAfterDelete.length !== 1) {
      throw new Error(`Expected 1 transaction remaining after delete, got ${rowsAfterDelete.length}`);
    }
    if (parseFloat(rowsAfterDelete[0].balance) !== -500.00) {
      throw new Error(`Expected running balance -500.00 (Cr), got ${rowsAfterDelete[0].balance}`);
    }
    console.log('Verified balance recalculated correctly to 500.00 Cr after deleting sale.');

    console.log('--- ALL INTEGRATION TESTS PASSED SUCCESSFULLY! ---');

  } catch (err) {
    console.error('Test run failed with error:', err);
    process.exit(1);
  } finally {
    console.log('Cleaning up test data...');
    await pool.query('DELETE FROM customer_ledger WHERE customer_id = ?', [testCustomerId]);
    await pool.query('DELETE FROM customers WHERE id = ?', [testCustomerId]);
    console.log('Cleanup completed.');

    if (server) server.close();
    await pool.end();
  }
}

runTests();
