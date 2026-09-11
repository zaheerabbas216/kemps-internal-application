import jwt from 'jsonwebtoken';
import pool from './config/db.js';
import app from './app.js';
import { autoClosePendingDays, addDays } from './services/rawMaterialAutoCloseService.js';

async function runTests() {
  console.log('=================================================================');
  console.log('--- STARTING RAW MATERIAL AUTOMATIC CLOSING INTEGRATION TEST ---');
  console.log('=================================================================');
  let server;
  let rawMaterialId = null;

  // 3 test dates: day1, day2, day3
  const day1 = '2026-06-01';
  const day2 = '2026-06-02';
  const day3 = '2026-06-03';

  try {
    // 1. Get or create a raw material for testing
    console.log('\n[Step 1] Finding or creating test raw material...');
    const [cats] = await pool.query('SELECT id FROM raw_material_categories LIMIT 1');
    const catId = cats.length > 0 ? cats[0].id : 1;

    const [insertMat] = await pool.query(
      `INSERT INTO raw_materials (category_id, sub_product_name, unit, status) 
       VALUES (?, 'Test Auto Close Material', 'BAGS', 1)`,
      [catId]
    );
    rawMaterialId = insertMat.insertId;
    console.log(`Created test raw material ID: ${rawMaterialId}`);

    // 2. Generate Auth Token
    console.log('\n[Step 2] Generating test JWT token...');
    const JWT_SECRET = process.env.JWT_SECRET || 'kemps_secret_key_123';
    const token = jwt.sign({ username: 'test_admin', name: 'Test Admin' }, JWT_SECRET, { expiresIn: '1h' });

    // 3. Start Test Express Server
    console.log('\n[Step 3] Starting test Express server...');
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

    // Clean up any test records for these dates
    const testDates = [day1, day2, day3];
    for (const d of testDates) {
      await pool.query('DELETE FROM raw_material_ledger_snapshots WHERE ledger_date = ?', [d]);
      await pool.query('DELETE FROM raw_material_ledger_closings WHERE ledger_date = ?', [d]);
      await pool.query('DELETE FROM raw_material_ledger_manual_opening WHERE ledger_date = ?', [d]);
    }
    await pool.query('DELETE FROM stock_register WHERE item_id = ?', [rawMaterialId]);

    // 4. Set Initial Opening Stock on Day 1 = 100
    console.log(`\n[Step 4] Setting opening stock on Day 1 (${day1}) = 100 BAGS...`);
    const setRes = await authFetch(`${baseUrl}/set-opening`, {
      method: 'POST',
      body: JSON.stringify({
        date: day1,
        rawMaterialId,
        unit: 'BAGS',
        quantity: 100
      })
    });
    if (!setRes.data.ok) {
      throw new Error(`Failed to set opening: ${setRes.data.error}`);
    }

    // 5. Add Stock In (50) and Stock Out (-30) on Day 1
    console.log(`\n[Step 5] Adding Stock In (50) and Stock Out (30) on Day 1 (${day1})...`);
    await pool.query(
      `INSERT INTO stock_register (item_type, item_id, transaction_type, reference_id, quantity, created_at)
       VALUES ('RAW_MATERIAL', ?, 'CORRECTION', 'TEST-IN-1', 50, '${day1} 10:00:00')`,
      [rawMaterialId]
    );

    await pool.query(
      `INSERT INTO stock_register (item_type, item_id, transaction_type, reference_id, quantity, created_at)
       VALUES ('RAW_MATERIAL', ?, 'CORRECTION', 'TEST-OUT-1', -30, '${day1} 14:00:00')`,
      [rawMaterialId]
    );

    // Verify Day 1 calculations dynamically:
    // Opening = 100, In = 50, Out = 30, Closing = 120
    console.log(`\n[Step 6] Querying Day 1 (${day1}) before closing...`);
    const day1Res = await authFetch(`${baseUrl}/day?date=${day1}`);
    const itemDay1 = day1Res.data.items.find(i => i.raw_material_id === rawMaterialId && i.unit === 'BAGS');
    console.log('Day 1 calculated item:', itemDay1);
    if (itemDay1.opening_stock !== 100 || itemDay1.stock_in !== 50 || itemDay1.stock_out !== 30 || itemDay1.closing_stock !== 120) {
      throw new Error(`Day 1 calculation mismatch: expected Opening=100, In=50, Out=30, Closing=120. Got ${JSON.stringify(itemDay1)}`);
    }
    console.log('-> Day 1 dynamic calculation verified: 100 + 50 - 30 = 120 Closing');

    // 7. Close Day 1 (simulating auto-close at midnight)
    console.log(`\n[Step 7] Closing Day 1 (${day1}) to create History snapshot...`);
    const closeRes = await authFetch(`${baseUrl}/close`, {
      method: 'POST',
      body: JSON.stringify({ date: day1 })
    });
    if (!closeRes.data.ok) {
      throw new Error(`Failed to close Day 1: ${closeRes.data.error}`);
    }
    console.log('-> Day 1 closed and snapshot saved into History.');

    // 8. Test Day 2 (Day after Day 1):
    // Opening should be Day 1 closing = 120
    // Stock In = 0, Stock Out = 0
    // Closing = 120
    console.log(`\n[Step 8] Checking Day 2 (${day2}) initial stock state...`);
    const day2Res = await authFetch(`${baseUrl}/day?date=${day2}`);
    const itemDay2 = day2Res.data.items.find(i => i.raw_material_id === rawMaterialId && i.unit === 'BAGS');
    console.log('Day 2 calculated item:', itemDay2);
    if (itemDay2.opening_stock !== 120 || itemDay2.stock_in !== 0 || itemDay2.stock_out !== 0 || itemDay2.closing_stock !== 120) {
      throw new Error(`Day 2 initial state mismatch: expected Opening=120, In=0, Out=0, Closing=120. Got ${JSON.stringify(itemDay2)}`);
    }
    console.log('-> Verified: Day 2 opening stock is carried forward as 120, In=0, Out=0, Closing=120!');

    // 9. Perform Day 2 transactions: Stock In = 20, Stock Out = 10
    console.log(`\n[Step 9] Adding Stock In (20) and Stock Out (10) on Day 2 (${day2})...`);
    await pool.query(
      `INSERT INTO stock_register (item_type, item_id, transaction_type, reference_id, quantity, created_at)
       VALUES ('RAW_MATERIAL', ?, 'CORRECTION', 'TEST-IN-2', 20, '${day2} 09:00:00')`,
      [rawMaterialId]
    );

    await pool.query(
      `INSERT INTO stock_register (item_type, item_id, transaction_type, reference_id, quantity, created_at)
       VALUES ('RAW_MATERIAL', ?, 'CORRECTION', 'TEST-OUT-2', -10, '${day2} 16:00:00')`,
      [rawMaterialId]
    );

    // Verify Day 2: Opening=120, In=20, Out=10, Closing = 130
    console.log(`\n[Step 10] Querying Day 2 with movements...`);
    const day2UpdatedRes = await authFetch(`${baseUrl}/day?date=${day2}`);
    const itemDay2Updated = day2UpdatedRes.data.items.find(i => i.raw_material_id === rawMaterialId && i.unit === 'BAGS');
    console.log('Day 2 updated item:', itemDay2Updated);
    if (itemDay2Updated.opening_stock !== 120 || itemDay2Updated.stock_in !== 20 || itemDay2Updated.stock_out !== 10 || itemDay2Updated.closing_stock !== 130) {
      throw new Error(`Day 2 calculation mismatch: expected Opening=120, In=20, Out=10, Closing=130. Got ${JSON.stringify(itemDay2Updated)}`);
    }
    console.log('-> Verified Day 2: 120 + 20 - 10 = 130 Closing');

    // 11. Close Day 2
    console.log(`\n[Step 11] Closing Day 2 (${day2})...`);
    const close2Res = await authFetch(`${baseUrl}/close`, {
      method: 'POST',
      body: JSON.stringify({ date: day2 })
    });
    if (!close2Res.data.ok) {
      throw new Error(`Failed to close Day 2: ${close2Res.data.error}`);
    }

    // 12. Check Day 3: Opening should be Day 2 closing = 130
    console.log(`\n[Step 12] Checking Day 3 (${day3}) initial stock state...`);
    const day3Res = await authFetch(`${baseUrl}/day?date=${day3}`);
    const itemDay3 = day3Res.data.items.find(i => i.raw_material_id === rawMaterialId && i.unit === 'BAGS');
    console.log('Day 3 calculated item:', itemDay3);
    if (itemDay3.opening_stock !== 130 || itemDay3.stock_in !== 0 || itemDay3.stock_out !== 0 || itemDay3.closing_stock !== 130) {
      throw new Error(`Day 3 initial state mismatch: expected Opening=130, In=0, Out=0, Closing=130. Got ${JSON.stringify(itemDay3)}`);
    }
    console.log('-> Verified: Day 3 opening stock is carried forward as 130!');

    // 13. Test History API
    console.log('\n[Step 13] Testing GET /api/raw-material-ledger/history...');
    const histRes = await authFetch(`${baseUrl}/history?startDate=${day1}&endDate=${day3}`);
    if (!histRes.data.ok) {
      throw new Error(`Failed to fetch history: ${histRes.data.error}`);
    }
    console.log(`History returned ${histRes.data.history.length} closed days.`);
    const histDay1 = histRes.data.history.find(h => h.ledger_date === day1);
    const histDay2 = histRes.data.history.find(h => h.ledger_date === day2);

    if (!histDay1 || !histDay2) {
      throw new Error('Historical closed days not found in history API response.');
    }
    const snapItem1 = histDay1.items.find(i => i.raw_material_id === rawMaterialId && i.unit === 'BAGS');
    const snapItem2 = histDay2.items.find(i => i.raw_material_id === rawMaterialId && i.unit === 'BAGS');

    console.log('Day 1 history item:', snapItem1);
    console.log('Day 2 history item:', snapItem2);

    if (snapItem1.closing_stock !== 120 || snapItem2.closing_stock !== 130) {
      throw new Error('History snapshot values mismatch.');
    }
    console.log('-> Verified: History API correctly archives and returns complete daily snapshots.');

    // 14. Test autoClosePendingDays service idempotency
    console.log('\n[Step 14] Testing autoClosePendingDays service idempotency...');
    const autoCloseRes = await autoClosePendingDays();
    console.log('autoClosePendingDays result:', autoCloseRes);
    if (!autoCloseRes.ok) {
      throw new Error('autoClosePendingDays failed.');
    }
    console.log('-> Verified: autoClosePendingDays completed without duplicate errors.');

    console.log('\n=================================================================');
    console.log('--- ALL AUTOMATIC CLOSING INTEGRATION TESTS PASSED 100%! ---');
    console.log('=================================================================');

    // Clean up test data
    console.log('\nCleaning up test records...');
    for (const d of testDates) {
      await pool.query('DELETE FROM raw_material_ledger_snapshots WHERE ledger_date = ?', [d]);
      await pool.query('DELETE FROM raw_material_ledger_closings WHERE ledger_date = ?', [d]);
      await pool.query('DELETE FROM raw_material_ledger_manual_opening WHERE ledger_date = ?', [d]);
    }
    await pool.query('DELETE FROM stock_register WHERE item_id = ?', [rawMaterialId]);
    await pool.query('DELETE FROM raw_materials WHERE id = ?', [rawMaterialId]);
    console.log('Test cleanup complete.');

  } catch (error) {
    console.error('Test failed with error:', error);
    process.exit(1);
  } finally {
    if (server) server.close();
    await pool.end();
  }
}

runTests();
