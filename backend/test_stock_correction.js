import jwt from 'jsonwebtoken';
import pool from './config/db.js';
import app from './app.js';

async function runTests() {
  console.log('--- STARTING STOCK CORRECTION INTEGRATION TEST ---');
  let server;
  let testDate = '2026-06-12';
  let rawMaterialId = null;

  try {
    // 1. Get or create a raw material for testing (category "Others", unit "KG")
    console.log('Step 1: Setting up test raw material...');
    const [cats] = await pool.query('SELECT id FROM raw_material_categories WHERE name = "Others" LIMIT 1');
    const catId = cats.length > 0 ? cats[0].id : 1;
    
    const [insertMat] = await pool.query(
      `INSERT INTO raw_materials (category_id, sub_product_name, unit, status) 
       VALUES (?, 'Test Raw Mat Correction', 'KG', 1)`,
      [catId]
    );
    rawMaterialId = insertMat.insertId;
    console.log(`Created temporary raw material ID: ${rawMaterialId}`);

    // 2. Generate Auth Token
    console.log('Step 2: Generating signed test JWT...');
    const JWT_SECRET = process.env.JWT_SECRET || 'kemps_secret_key_123';
    const token = jwt.sign({ username: 'test_admin', name: 'Test Admin' }, JWT_SECRET, { expiresIn: '1h' });

    // 3. Start Test Express Server
    console.log('Step 3: Starting test Express server...');
    server = app.listen(0);
    const port = server.address().port;
    const baseUrl = `http://localhost:${port}/api/stock-corrections`;
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

    // Clean up any existing test data for this date and raw material
    await pool.query('DELETE FROM stock_corrections WHERE raw_material_id = ?', [rawMaterialId]);
    await pool.query('DELETE FROM stock_register WHERE item_type = "RAW_MATERIAL" AND item_id = ?', [rawMaterialId]);

    // 4. Test Get Available Stock (Should be 0 initially)
    console.log('Step 4: Fetching available stock before correction...');
    const availRes1 = await authFetch(`${baseUrl}/available-stock?date=${testDate}&rawMaterialId=${rawMaterialId}`);
    if (!availRes1.data.ok) {
      throw new Error(`Failed to fetch available stock: ${availRes1.data.error}`);
    }
    console.log(`Initial opening stock: ${availRes1.data.openingStock} ${availRes1.data.unit}`);
    if (availRes1.data.openingStock !== 0) {
      throw new Error(`Expected initial opening stock 0, got ${availRes1.data.openingStock}`);
    }

    // 5. Save Stock Correction: EXCESS (+500 KG)
    console.log('Step 5: Saving positive stock correction (EXCESS)...');
    const payload1 = {
      correctionDate: testDate,
      rawMaterialId,
      openingStock: 0,
      openingBagsBox: 0,
      physicalStock: 500,
      physicalBagsBox: 10,
      differenceQty: 500,
      remarks: 'Test excess correction'
    };
    
    const postRes1 = await authFetch(baseUrl, {
      method: 'POST',
      body: JSON.stringify(payload1)
    });
    if (!postRes1.data.ok) {
      throw new Error(`Failed to save correction 1: ${postRes1.data.error}`);
    }
    console.log(`Saved correction 1: ${postRes1.data.id}`);

    // Check available stock (should be 500 now)
    console.log('Fetching available stock after correction 1...');
    const availRes2 = await authFetch(`${baseUrl}/available-stock?date=${testDate}&rawMaterialId=${rawMaterialId}`);
    console.log(`Available stock after correction 1: ${availRes2.data.openingStock}`);
    if (availRes2.data.openingStock !== 500) {
      throw new Error(`Expected opening stock 500, got ${availRes2.data.openingStock}`);
    }

    // 6. Save Stock Correction: WASTAGE (-200 KG, so physical is 300 KG)
    console.log('Step 6: Saving negative stock correction (WASTAGE)...');
    const payload2 = {
      correctionDate: testDate,
      rawMaterialId,
      openingStock: 500,
      openingBagsBox: 10,
      physicalStock: 300,
      physicalBagsBox: 6,
      differenceQty: -200,
      remarks: 'Test wastage correction'
    };
    
    const postRes2 = await authFetch(baseUrl, {
      method: 'POST',
      body: JSON.stringify(payload2)
    });
    if (!postRes2.data.ok) {
      throw new Error(`Failed to save correction 2: ${postRes2.data.error}`);
    }
    console.log(`Saved correction 2: ${postRes2.data.id}`);

    // Check available stock (should be 300 now)
    console.log('Fetching available stock after correction 2...');
    const availRes3 = await authFetch(`${baseUrl}/available-stock?date=${testDate}&rawMaterialId=${rawMaterialId}`);
    console.log(`Available stock after correction 2: ${availRes3.data.openingStock}`);
    if (availRes3.data.openingStock !== 300) {
      throw new Error(`Expected opening stock 300, got ${availRes3.data.openingStock}`);
    }

    // 7. Verify History Endpoint
    console.log('Step 7: Querying stock corrections history...');
    const historyRes = await authFetch(`${baseUrl}/history?rawMaterialId=${rawMaterialId}`);
    if (!historyRes.data.ok) {
      throw new Error(`Failed to fetch history: ${historyRes.data.error}`);
    }
    console.log(`History records fetched: ${historyRes.data.corrections.length}`);
    if (historyRes.data.corrections.length !== 2) {
      throw new Error(`Expected 2 history records, got ${historyRes.data.corrections.length}`);
    }

    const firstItem = historyRes.data.corrections[0]; // newest first
    console.log(`Newest correction: Diff=${firstItem.difference_qty}, Type=${firstItem.adjustment_type}, User=${firstItem.created_by}`);
    if (firstItem.difference_qty !== -200 || firstItem.adjustment_type !== 'WASTAGE') {
      throw new Error(`Newest correction data mismatch. Expected Diff -200, Type WASTAGE.`);
    }

    console.log('--- ALL STOCK CORRECTION INTEGRATION TESTS PASSED SUCCESSFULLY! ---');

    // Clean up test records
    console.log('Cleaning up database test records...');
    await pool.query('DELETE FROM stock_corrections WHERE raw_material_id = ?', [rawMaterialId]);
    await pool.query('DELETE FROM stock_register WHERE item_type = "RAW_MATERIAL" AND item_id = ?', [rawMaterialId]);
    await pool.query('DELETE FROM raw_materials WHERE id = ?', [rawMaterialId]);
    console.log('Database cleaned.');

  } catch (error) {
    console.error('Test run failed with error:', error);
    // Cleanup anyway if we have ID
    if (rawMaterialId) {
      await pool.query('DELETE FROM stock_corrections WHERE raw_material_id = ?', [rawMaterialId]);
      await pool.query('DELETE FROM stock_register WHERE item_type = "RAW_MATERIAL" AND item_id = ?', [rawMaterialId]);
      await pool.query('DELETE FROM raw_materials WHERE id = ?', [rawMaterialId]);
    }
    process.exit(1);
  } finally {
    if (server) server.close();
    await pool.end();
  }
}

runTests();
