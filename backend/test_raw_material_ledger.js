import jwt from 'jsonwebtoken';
import pool from './config/db.js';
import app from './app.js';

async function runTests() {
  console.log('--- STARTING RAW MATERIAL LEDGER INTEGRATION TEST ---');
  let server;
  let testDate = '2026-06-09';
  let rawMaterialId = null;

  try {
    // 1. Get or create a raw material for testing
    console.log('Step 1: Setting up test raw material...');
    const [mats] = await pool.query('SELECT id FROM raw_materials LIMIT 1');
    if (mats.length > 0) {
      rawMaterialId = mats[0].id;
      console.log(`Using existing raw material ID: ${rawMaterialId}`);
    } else {
      // Find category first
      const [cats] = await pool.query('SELECT id FROM raw_material_categories LIMIT 1');
      const catId = cats.length > 0 ? cats[0].id : 1;
      const [insertMat] = await pool.query(
        `INSERT INTO raw_materials (category_id, sub_product_name, unit, status) 
         VALUES (?, 'Test Raw Mat Ledger', 'BAGS', 1)`,
        [catId]
      );
      rawMaterialId = insertMat.insertId;
      console.log(`Created temporary raw material ID: ${rawMaterialId}`);
    }

    // 2. Generate Auth Token
    console.log('Step 2: Generating signed test JWT...');
    const JWT_SECRET = process.env.JWT_SECRET || 'kemps_secret_key_123';
    const token = jwt.sign({ username: 'test_admin', name: 'Test Admin' }, JWT_SECRET, { expiresIn: '1h' });

    // 3. Start Test Express Server
    console.log('Step 3: Starting test Express server...');
    server = app.listen(0);
    const port = server.address().port;
    const baseUrl = `http://localhost:${port}/api/raw-material-ledger`;
    console.log(`Test server listening on port: ${port}`);

    // Helper for authenticated fetch
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

    // Clean up any existing test data for this date
    await pool.query('DELETE FROM raw_material_ledger_snapshots WHERE ledger_date = ?', [testDate]);
    await pool.query('DELETE FROM raw_material_ledger_closings WHERE ledger_date = ?', [testDate]);
    await pool.query('DELETE FROM raw_material_ledger_manual_opening WHERE ledger_date = ?', [testDate]);

    // 4. Test Get Ledger Day (Dynamically Calculated)
    console.log('Step 4: Fetching dynamic ledger day...');
    const getRes = await authFetch(`${baseUrl}/day?date=${testDate}`);
    if (!getRes.data.ok) {
      throw new Error(`Failed to fetch ledger day: ${getRes.data.error}`);
    }
    console.log('Ledger day fetched successfully! Lock status: ' + getRes.data.isClosed);

    // 5. Test Set Manual Opening Stock
    console.log('Step 5: Overriding opening stock manually...');
    const setOpeningPayload = {
      date: testDate,
      rawMaterialId,
      unit: 'BAGS',
      quantity: 120.00
    };
    const setRes = await authFetch(`${baseUrl}/set-opening`, {
      method: 'POST',
      body: JSON.stringify(setOpeningPayload)
    });
    if (!setRes.data.ok) {
      throw new Error(`Failed to set manual opening: ${setRes.data.error}`);
    }
    console.log('Opening stock override saved successfully.');

    // Verify opening stock is reflected
    const verifyRes = await authFetch(`${baseUrl}/day?date=${testDate}`);
    const matchedItem = verifyRes.data.items.find(i => i.raw_material_id === rawMaterialId && i.unit === 'BAGS');
    if (!matchedItem) {
      throw new Error('Test item not returned in ledger list.');
    }
    if (parseFloat(matchedItem.opening_stock) !== 120.00) {
      throw new Error(`Opening stock did not override. Expected 120.00, got ${matchedItem.opening_stock}`);
    }
    console.log('Verified: Opening stock was successfully overridden to ' + matchedItem.opening_stock);

    // 6. Test Drilldown API
    console.log('Step 6: Querying drilldown audit trail...');
    const drillRes = await authFetch(`${baseUrl}/drilldown?date=${testDate}&rawMaterialId=${rawMaterialId}&unit=BAGS&type=OPENING`);
    if (!drillRes.data.ok) {
      throw new Error(`Failed to query drilldown: ${drillRes.data.error}`);
    }
    console.log(`Verified: Drilldown audit trail has ${drillRes.data.transactions.length} records.`);

    // 7. Test Close Day (Lock ledger)
    console.log('Step 7: Locking ledger (Close Day)...');
    const closeRes = await authFetch(`${baseUrl}/close`, {
      method: 'POST',
      body: JSON.stringify({ date: testDate })
    });
    if (!closeRes.data.ok) {
      throw new Error(`Failed to close day: ${closeRes.data.error}`);
    }
    console.log('Day closed and snapshot saved successfully.');

    // Verify day is locked
    const checkLockedRes = await authFetch(`${baseUrl}/day?date=${testDate}`);
    if (!checkLockedRes.data.isClosed) {
      throw new Error('Ledger is still reported as open after Close Day call.');
    }
    console.log('Verified: Day reports as CLOSED.');

    // 8. Verify editing locked day is blocked
    console.log('Step 8: Verifying manual override is blocked on closed day...');
    const setBlockedRes = await authFetch(`${baseUrl}/set-opening`, {
      method: 'POST',
      body: JSON.stringify(setOpeningPayload)
    });
    if (setBlockedRes.data.ok) {
      throw new Error('Allowed manual override on closed day! Lock check failed.');
    }
    console.log('Verified: Manual override block check works. Error returned: ' + setBlockedRes.data.error);

    console.log('--- ALL INTEGRATION TESTS PASSED SUCCESSFULLY! ---');

    // Clean up test records
    console.log('Cleaning up database test records...');
    await pool.query('DELETE FROM raw_material_ledger_snapshots WHERE ledger_date = ?', [testDate]);
    await pool.query('DELETE FROM raw_material_ledger_closings WHERE ledger_date = ?', [testDate]);
    await pool.query('DELETE FROM raw_material_ledger_manual_opening WHERE ledger_date = ?', [testDate]);
    console.log('Database cleaned.');

  } catch (error) {
    console.error('Test run failed with error:', error);
    process.exit(1);
  } finally {
    if (server) server.close();
    await pool.end();
  }
}

runTests();
