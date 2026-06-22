import jwt from 'jsonwebtoken';
import pool from './config/db.js';
import app from './app.js';
import { addSupplierLedgerEntry, deleteSupplierLedgerEntriesForReference, recalculateSupplierLedgerBalances } from './helpers/ledgerHelper.js';

async function runTests() {
  console.log('--- STARTING SUPPLIER LEDGER INTEGRATION TEST ---');
  let server;
  const testSupplierId = 'SUP-TEST-99999';
  const testDate = '2026-06-17';

  try {
    // 1. Setup a test supplier inside company_details
    console.log('Step 1: Setting up test supplier...');
    await pool.query('DELETE FROM company_details WHERE id = ?', [testSupplierId]);
    await pool.query(
      `INSERT INTO company_details (id, company_name, phone_number, gst_number, address, bank_name, account_number, ifsc_code, created_at)
       VALUES (?, 'Test Supplier Ledger', '8888888888', '29VENDGST', '456 Vendor Rd', 'Test Bank', '123456', 'IFSC001', NOW())`,
      [testSupplierId]
    );
    console.log(`Test supplier set up: ${testSupplierId}`);

    // 2. Test direct ledger helpers
    console.log('Step 2: Testing direct supplier ledger helpers...');
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Test inserting a PURCHASE (credit - increases outstanding payables)
      await addSupplierLedgerEntry(connection, {
        date: testDate,
        supplierId: testSupplierId,
        entryType: 'PURCHASE',
        referenceNo: 'BILL-TEST-999',
        particular: 'Test Purchase',
        debit: 0.00,
        credit: 2000.00
      });

      // Test inserting a PAYMENT (debit - reduces outstanding payables)
      await addSupplierLedgerEntry(connection, {
        date: testDate,
        supplierId: testSupplierId,
        entryType: 'PAYMENT',
        referenceNo: 'PAY-TEST-999',
        particular: 'Test Payment',
        debit: 800.00,
        credit: 0.00
      });

      await connection.commit();
      console.log('Supplier ledger entries added directly.');
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }

    // Verify running balance recalculations (Balance = credit - debit)
    const [rows] = await pool.query(
      'SELECT debit, credit, balance FROM supplier_ledger WHERE supplier_id = ? ORDER BY date ASC, id ASC',
      [testSupplierId]
    );

    if (rows.length !== 2) {
      throw new Error(`Expected 2 ledger entries, found ${rows.length}`);
    }
    if (parseFloat(rows[0].balance) !== 2000.00) {
      throw new Error(`Expected first balance 2000.00 (Cr), got ${rows[0].balance}`);
    }
    if (parseFloat(rows[1].balance) !== 1200.00) {
      throw new Error(`Expected second balance 1200.00 (Cr), got ${rows[1].balance}`);
    }
    console.log('Verified running balances are correct (2000.00 Cr, then 1200.00 Cr).');

    // 3. Generate JWT Token
    console.log('Step 3: Generating JWT Token for API authentication...');
    const JWT_SECRET = process.env.JWT_SECRET || 'kemps_secret_key_123';
    const token = jwt.sign({ username: 'admin', name: 'Zaheer Abbas' }, JWT_SECRET, { expiresIn: '1h' });

    // 4. Start Test Server
    console.log('Step 4: Starting temporary server...');
    server = app.listen(0);
    const port = server.address().port;
    const baseUrl = `http://localhost:${port}/api/supplier-ledger`;
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

    // 5. Test GET suppliers route
    console.log('Step 5: Testing GET /suppliers endpoint...');
    const supRes = await authFetch(`${baseUrl}/suppliers`);
    if (!supRes.data.ok) {
      throw new Error(`GET /suppliers failed: ${supRes.data.error}`);
    }
    const hasTestSup = supRes.data.suppliers.some(s => s.id === testSupplierId);
    if (!hasTestSup) {
      throw new Error('Test supplier not returned in dropdown list.');
    }
    console.log('Verified suppliers list successfully.');

    // 6. Test GET summary route
    console.log('Step 6: Testing GET /summary/:supplierId endpoint...');
    const sumRes = await authFetch(`${baseUrl}/summary/${testSupplierId}`);
    if (!sumRes.data.ok) {
      throw new Error(`GET /summary/:id failed: ${sumRes.data.error}`);
    }
    const summary = sumRes.data.summary;
    if (parseFloat(summary.outstandingDue) !== 1200.00) {
      throw new Error(`Expected outstanding payables of 1200.00, got ${summary.outstandingDue}`);
    }
    console.log(`Verified KPIs: Name=${summary.supplierName}, Outstanding Payables=${summary.outstandingDue}`);

    // 7. Test GET transactions route
    console.log('Step 7: Testing GET /transactions/:supplierId endpoint...');
    const txRes = await authFetch(`${baseUrl}/transactions/${testSupplierId}`);
    if (!txRes.data.ok) {
      throw new Error(`GET /transactions/:id failed: ${txRes.data.error}`);
    }
    const txs = txRes.data.transactions;
    if (txs.length !== 2) {
      throw new Error(`Expected 2 transactions from API, got ${txs.length}`);
    }
    console.log(`Verified transactions: Tx1=${txs[0].particular}, Tx2=${txs[1].particular}`);

    // 8. Test GET analytics route
    console.log('Step 8: Testing GET /analytics/:supplierId endpoint...');
    const analRes = await authFetch(`${baseUrl}/analytics/${testSupplierId}`);
    if (!analRes.data.ok) {
      throw new Error(`GET /analytics/:id failed: ${analRes.data.error}`);
    }
    console.log('Verified analytics endpoints.');

    // 9. Test Delete Helper
    console.log('Step 9: Testing delete helper...');
    const connection2 = await pool.getConnection();
    try {
      await connection2.beginTransaction();
      await deleteSupplierLedgerEntriesForReference(connection2, 'BILL-TEST-999');
      await connection2.commit();
    } catch (err) {
      await connection2.rollback();
      throw err;
    } finally {
      connection2.release();
    }

    // Verify after deletion
    const [rowsAfterDelete] = await pool.query(
      'SELECT debit, credit, balance FROM supplier_ledger WHERE supplier_id = ? ORDER BY date ASC, id ASC',
      [testSupplierId]
    );
    if (rowsAfterDelete.length !== 1) {
      throw new Error(`Expected 1 transaction remaining after delete, got ${rowsAfterDelete.length}`);
    }
    if (parseFloat(rowsAfterDelete[0].balance) !== -800.00) {
      throw new Error(`Expected running balance -800.00 (Dr), got ${rowsAfterDelete[0].balance}`);
    }
    console.log('Verified balance recalculated correctly to 800.00 Dr (overpaid) after deleting purchase.');

    console.log('--- ALL INTEGRATION TESTS PASSED SUCCESSFULLY! ---');

  } catch (err) {
    console.error('Test run failed with error:', err);
    process.exit(1);
  } finally {
    console.log('Cleaning up test data...');
    await pool.query('DELETE FROM supplier_ledger WHERE supplier_id = ?', [testSupplierId]);
    await pool.query('DELETE FROM company_details WHERE id = ?', [testSupplierId]);
    console.log('Cleanup completed.');

    if (server) server.close();
    await pool.end();
  }
}

runTests();
