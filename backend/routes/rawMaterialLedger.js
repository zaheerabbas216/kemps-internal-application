import express from 'express';
import pool from '../config/db.js';
import authMiddleware from '../middleware/auth.js';

const router = express.Router();

// Helper to normalize product names for comparison
function normalizeName(name) {
  return String(name || '').toLowerCase().replace(/[\s\-_]/g, '').replace('ltr', 'l');
}

// Helper: Fetch transactions for raw materials
async function getTransactions(connection, rawMaterialId, startDate, endDate, isBottle, bottleName) {
  let params = [rawMaterialId];
  let dateFilter = '';
  
  if (startDate) {
    dateFilter = 'AND tx.tx_date BETWEEN ? AND ?';
    params.push(startDate, endDate);
  } else {
    dateFilter = 'AND tx.tx_date <= ?';
    params.push(endDate);
  }

  const txQuery = `
    SELECT tx.quantity, tx.transaction_type, tx.reference_id, tx.tx_date
    FROM (
      SELECT 
        sr.quantity,
        sr.transaction_type,
        sr.reference_id,
        CASE 
          WHEN sr.transaction_type = 'PURCHASE' THEN ib.bill_date
          WHEN sr.transaction_type = 'PRODUCTION' AND sr.reference_id LIKE 'BATCH-%' THEN pbb.batch_date
          WHEN sr.transaction_type = 'PRODUCTION' AND sr.reference_id LIKE 'PROD-%' THEN pb.production_date
          ELSE DATE(sr.created_at)
        END AS tx_date
      FROM stock_register sr
      LEFT JOIN inventory_bills ib ON sr.transaction_type = 'PURCHASE' AND sr.reference_id = ib.id
      LEFT JOIN pet_bottle_batches pbb ON sr.transaction_type = 'PRODUCTION' AND sr.reference_id = pbb.id
      LEFT JOIN production_batches pb ON sr.transaction_type = 'PRODUCTION' AND sr.reference_id = pb.id
      WHERE sr.item_type = 'RAW_MATERIAL' AND sr.item_id = ?
    ) tx
    WHERE 1=1 ${dateFilter}
  `;

  const [txRows] = await connection.query(txQuery, params);
  let allTxs = [...txRows];

  // If category is BOTTLES, also fetch production output from pet_bottle_batches
  if (isBottle && bottleName) {
    let bottleParams = [bottleName];
    let bottleDateFilter = '';
    if (startDate) {
      bottleDateFilter = 'AND pb.batch_date BETWEEN ? AND ?';
      bottleParams.push(startDate, endDate);
    } else {
      bottleDateFilter = 'AND pb.batch_date <= ?';
      bottleParams.push(endDate);
    }

    const bottleQuery = `
      SELECT 
        pb.actual_reading AS quantity,
        'PRODUCTION' AS transaction_type,
        pb.id AS reference_id,
        pb.batch_date AS tx_date
      FROM pet_bottle_batches pb
      JOIN finished_products fp ON pb.finished_product_id = fp.id
      WHERE LOWER(REPLACE(REPLACE(fp.name, ' ', ''), 'ltr', 'l')) = LOWER(REPLACE(REPLACE(?, ' ', ''), 'ltr', 'l'))
        ${bottleDateFilter}
    `;
    const [bottleRows] = await connection.query(bottleQuery, bottleParams);
    allTxs = allTxs.concat(bottleRows);
  }

  return allTxs;
}

// Helper: Aggregate transactions into stock_in and stock_out
function aggregateTxs(txs, categoryName, subProductName, unit) {
  let stock_in = 0;
  let stock_out = 0;
  const isPreform = categoryName.toLowerCase() === 'preforms';
  const isBottle = categoryName.toLowerCase() === 'bottles';
  const weight = parseFloat(subProductName) || 0;

  for (const t of txs) {
    let qty = parseFloat(t.quantity) || 0;
    if (isPreform) {
      const scale = unit === 'BAGS' ? (1 / 25) : (1000 / weight);
      qty = qty * scale;
      if (qty > 0) {
        stock_in += qty;
      } else if (qty < 0) {
        stock_out += Math.abs(qty);
      }
    } else if (isBottle) {
      // Bottles Stock IN comes from pet_bottle_batches (which will be positive production)
      // and Stock OUT comes from stock_register deductions (which will be negative production)
      if (qty > 0) {
        stock_in += qty;
      } else if (qty < 0) {
        stock_out += Math.abs(qty);
      }
    } else {
      // General case
      if (qty > 0) {
        stock_in += qty;
      } else if (qty < 0) {
        stock_out += Math.abs(qty);
      }
    }
  }

  return { stock_in, stock_out };
}

// Helper: Calculate ledger row for a specific item dynamically
async function calculateDynamicRow(connection, rawMaterial, unit, targetDate) {
  const isBottle = rawMaterial.category_name.toLowerCase() === 'bottles';
  
  // 1. Find the latest manual opening stock
  const [manualRows] = await connection.query(
    `SELECT DATE_FORMAT(ledger_date, '%Y-%m-%d') as ledger_date, quantity 
     FROM raw_material_ledger_manual_opening 
     WHERE raw_material_id = ? AND unit = ? AND ledger_date <= ? 
     ORDER BY ledger_date DESC LIMIT 1`,
    [rawMaterial.id, unit, targetDate]
  );

  // 2. Find the latest closed date before targetDate
  const [closedRows] = await connection.query(
    `SELECT DATE_FORMAT(ledger_date, '%Y-%m-%d') as ledger_date 
     FROM raw_material_ledger_closings 
     WHERE ledger_date < ? 
     ORDER BY ledger_date DESC LIMIT 1`,
    [targetDate]
  );

  let checkpointDate = null;
  let checkpointStock = 0;
  let startQueryDate = null;

  const hasManual = manualRows.length > 0;
  const hasClosed = closedRows.length > 0;

  if (hasManual && hasClosed) {
    const dManual = manualRows[0].ledger_date;
    const dClosed = closedRows[0].ledger_date;
    
    if (dManual > dClosed) {
      checkpointDate = dManual;
      checkpointStock = parseFloat(manualRows[0].quantity) || 0;
      startQueryDate = dManual; // include manual date transactions in sum
    } else {
      checkpointDate = dClosed;
      // Get snapshot closing stock
      const [snapRows] = await connection.query(
        `SELECT closing_stock FROM raw_material_ledger_snapshots 
         WHERE raw_material_id = ? AND unit = ? AND ledger_date = ?`,
        [rawMaterial.id, unit, dClosed]
      );
      checkpointStock = snapRows.length > 0 ? parseFloat(snapRows[0].closing_stock) : 0;
      
      // Since it is closed, start querying transactions from D_closed + 1
      const nextDay = new Date(dClosed);
      nextDay.setDate(nextDay.getDate() + 1);
      startQueryDate = nextDay.toISOString().split('T')[0];
    }
  } else if (hasManual) {
    checkpointDate = manualRows[0].ledger_date;
    checkpointStock = parseFloat(manualRows[0].quantity) || 0;
    startQueryDate = manualRows[0].ledger_date;
  } else if (hasClosed) {
    checkpointDate = closedRows[0].ledger_date;
    const [snapRows] = await connection.query(
      `SELECT closing_stock FROM raw_material_ledger_snapshots 
       WHERE raw_material_id = ? AND unit = ? AND ledger_date = ?`,
      [rawMaterial.id, unit, checkpointDate]
    );
    checkpointStock = snapRows.length > 0 ? parseFloat(snapRows[0].closing_stock) : 0;
    
    const nextDay = new Date(checkpointDate);
    nextDay.setDate(nextDay.getDate() + 1);
    startQueryDate = nextDay.toISOString().split('T')[0];
  }

  // 3. Get transactions up to targetDate - 1 to calculate opening stock
  let openingStock = checkpointStock;
  const yesterday = new Date(targetDate);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  if (!startQueryDate || startQueryDate <= yesterdayStr) {
    const priorTxs = await getTransactions(
      connection, 
      rawMaterial.id, 
      startQueryDate, 
      yesterdayStr, 
      isBottle, 
      rawMaterial.sub_product_name
    );
    const aggregates = aggregateTxs(priorTxs, rawMaterial.category_name, rawMaterial.sub_product_name, unit);
    openingStock = checkpointStock + aggregates.stock_in - aggregates.stock_out;
  }

  // 4. Get transactions on the targetDate itself
  const todayTxs = await getTransactions(
    connection, 
    rawMaterial.id, 
    targetDate, 
    targetDate, 
    isBottle, 
    rawMaterial.sub_product_name
  );
  const todayAgg = aggregateTxs(todayTxs, rawMaterial.category_name, rawMaterial.sub_product_name, unit);

  const closingStock = openingStock + todayAgg.stock_in - todayAgg.stock_out;

  return {
    raw_material_id: rawMaterial.id,
    sub_product_name: rawMaterial.sub_product_name,
    category_name: rawMaterial.category_name,
    unit,
    opening_stock: parseFloat(openingStock.toFixed(2)),
    stock_in: parseFloat(todayAgg.stock_in.toFixed(2)),
    stock_out: parseFloat(todayAgg.stock_out.toFixed(2)),
    closing_stock: parseFloat(closingStock.toFixed(2))
  };
}

// GET /api/raw-material-ledger/day
// Fetches opening, IN, OUT, closing for selected date
router.get('/day', authMiddleware, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { date } = req.query;
    if (!date) throw new Error('Date parameter is required.');

    // 1. Check if the day is closed
    const [closedRows] = await connection.query(
      `SELECT closed_by, DATE_FORMAT(closed_at, '%Y-%m-%d %h:%i %p') as closed_at 
       FROM raw_material_ledger_closings WHERE ledger_date = ?`,
      [date]
    );

    const isClosed = closedRows.length > 0;
    let ledgerItems = [];

    // 2. Fetch latest purchase rates for valuation
    const [ratesRows] = await connection.query(`
      SELECT rm.id, 
        COALESCE(
          (SELECT bi.rate_per_unit 
           FROM inventory_bill_items bi 
           JOIN inventory_bills b ON bi.bill_id = b.id 
           WHERE bi.raw_material_id = rm.id 
           ORDER BY b.bill_date DESC, bi.created_at DESC LIMIT 1), 
          0
        ) AS latest_rate
      FROM raw_materials rm
    `);
    const ratesMap = {};
    ratesRows.forEach(row => {
      ratesMap[row.id] = parseFloat(row.latest_rate);
    });

    if (isClosed) {
      // Read directly from snapshots
      const [snapRows] = await connection.query(
        `SELECT 
           rms.raw_material_id, 
           rms.unit, 
           rms.opening_stock, 
           rms.stock_in, 
           rms.stock_out, 
           rms.closing_stock,
           rm.sub_product_name, 
           rmc.name AS category_name
         FROM raw_material_ledger_snapshots rms 
         JOIN raw_materials rm ON rms.raw_material_id = rm.id 
         JOIN raw_material_categories rmc ON rm.category_id = rmc.id 
         WHERE rms.ledger_date = ?`,
        [date]
      );
      ledgerItems = snapRows.map(row => ({
        raw_material_id: row.raw_material_id,
        sub_product_name: row.sub_product_name,
        category_name: row.category_name,
        unit: row.unit,
        opening_stock: parseFloat(row.opening_stock),
        stock_in: parseFloat(row.stock_in),
        stock_out: parseFloat(row.stock_out),
        closing_stock: parseFloat(row.closing_stock)
      }));
    } else {
      // Calculate dynamically
      const [materials] = await connection.query(`
        SELECT rm.id, rm.sub_product_name, rm.unit, rmc.name AS category_name
        FROM raw_materials rm 
        JOIN raw_material_categories rmc ON rm.category_id = rmc.id 
        WHERE rm.status = 1
      `);

      for (const rm of materials) {
        if (rm.category_name.toLowerCase() === 'preforms') {
          // Preforms splits into BAGS and PCS
          const bagsRow = await calculateDynamicRow(connection, rm, 'BAGS', date);
          const pcsRow = await calculateDynamicRow(connection, rm, 'PCS', date);
          ledgerItems.push(bagsRow);
          ledgerItems.push(pcsRow);
        } else {
          // General raw material
          const row = await calculateDynamicRow(connection, rm, rm.unit, date);
          ledgerItems.push(row);
        }
      }
    }

    // 3. Compute Dashboard Summary values (avoiding double counting preforms)
    let totalStockValue = 0;
    let totalStockInToday = 0;
    let totalStockOutToday = 0;
    let totalClosingValue = 0;

    // Track valuation uniquely per raw_material_id
    const processedValuations = new Set();

    ledgerItems.forEach(item => {
      const rate = ratesMap[item.raw_material_id] || 0;
      const isPreforms = item.category_name.toLowerCase() === 'preforms';

      if (isPreforms) {
        if (!processedValuations.has(item.raw_material_id)) {
          // Valuation is calculated on underlying KG quantity
          // Let's use the PCS row divided by (1000 / weight) to get KG
          const weight = parseFloat(item.sub_product_name) || 0;
          if (item.unit === 'PCS' && weight > 0) {
            const kgOpening = item.opening_stock / (1000 / weight);
            const kgClosing = item.closing_stock / (1000 / weight);
            totalStockValue += kgOpening * rate;
            totalClosingValue += kgClosing * rate;
            processedValuations.add(item.raw_material_id);
          }
        }
      } else {
        totalStockValue += item.opening_stock * rate;
        totalClosingValue += item.closing_stock * rate;
      }

      totalStockInToday += item.stock_in;
      totalStockOutToday += item.stock_out;
    });

    res.json({
      ok: true,
      date,
      isClosed,
      closedBy: isClosed ? closedRows[0].closed_by : null,
      closedAt: isClosed ? closedRows[0].closed_at : null,
      items: ledgerItems,
      summary: {
        totalCategories: new Set(ledgerItems.map(i => i.category_name)).size,
        totalRawMaterialValue: parseFloat(totalStockValue.toFixed(2)),
        totalStockInToday: parseFloat(totalStockInToday.toFixed(2)),
        totalStockOutToday: parseFloat(totalStockOutToday.toFixed(2)),
        closingStockValue: parseFloat(totalClosingValue.toFixed(2))
      }
    });

  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  } finally {
    connection.release();
  }
});

// POST /api/raw-material-ledger/set-opening
// Sets manual opening stock override
router.post('/set-opening', authMiddleware, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { date, rawMaterialId, unit, quantity, items } = req.body;
    if (!date) {
      throw new Error('Date is required.');
    }

    // Verify day is not closed
    const [closed] = await connection.query(
      'SELECT 1 FROM raw_material_ledger_closings WHERE ledger_date = ?',
      [date]
    );
    if (closed.length > 0) {
      throw new Error('Cannot set opening stock for a closed day.');
    }

    await connection.beginTransaction();

    const itemsToProcess = items || [];
    if (rawMaterialId !== undefined && unit !== undefined && quantity !== undefined) {
      itemsToProcess.push({ rawMaterialId, unit, quantity });
    }

    for (const item of itemsToProcess) {
      const { rawMaterialId: rId, unit: u, quantity: q } = item;
      if (rId === undefined || u === undefined || q === undefined || q === null || q === '') {
        continue;
      }

      const parsedQty = parseFloat(q);
      if (isNaN(parsedQty)) continue;

      // Get raw material category & sub_product_name to check if it's a preform
      const [rmRows] = await connection.query(
        `SELECT rm.id, rm.sub_product_name, rmc.name AS category_name 
         FROM raw_materials rm 
         JOIN raw_material_categories rmc ON rm.category_id = rmc.id 
         WHERE rm.id = ?`,
        [rId]
      );
      if (rmRows.length === 0) {
        throw new Error(`Raw material with ID ${rId} not found.`);
      }
      const rm = rmRows[0];
      const isPreforms = rm.category_name.toLowerCase() === 'preforms';

      if (isPreforms) {
        const weight = parseFloat(rm.sub_product_name) || 0;
        let qtyBags = 0;
        let qtyPcs = 0;

        if (u === 'BAGS') {
          qtyBags = parsedQty;
          qtyPcs = weight > 0 ? (qtyBags * 25000) / weight : 0;
        } else {
          qtyPcs = parsedQty;
          qtyBags = weight > 0 ? (qtyPcs * weight) / 25000 : 0;
        }

        // Insert/Update both units
        await connection.query(
          `INSERT INTO raw_material_ledger_manual_opening (ledger_date, raw_material_id, unit, quantity)
           VALUES (?, ?, 'BAGS', ?)
           ON DUPLICATE KEY UPDATE quantity = ?, updated_at = NOW()`,
          [date, rId, qtyBags, qtyBags]
        );

        await connection.query(
          `INSERT INTO raw_material_ledger_manual_opening (ledger_date, raw_material_id, unit, quantity)
           VALUES (?, ?, 'PCS', ?)
           ON DUPLICATE KEY UPDATE quantity = ?, updated_at = NOW()`,
          [date, rId, qtyPcs, qtyPcs]
        );
      } else {
        // General raw material
        await connection.query(
          `INSERT INTO raw_material_ledger_manual_opening (ledger_date, raw_material_id, unit, quantity)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE quantity = ?, updated_at = NOW()`,
          [date, rId, u, parsedQty, parsedQty]
        );
      }
    }

    await connection.commit();
    res.json({ ok: true, message: 'Opening stock saved successfully!' });
  } catch (error) {
    await connection.rollback();
    res.status(400).json({ ok: false, error: error.message });
  } finally {
    connection.release();
  }
});

// POST /api/raw-material-ledger/close
// Closes the ledger for the day and saves snapshot
router.post('/close', authMiddleware, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { date } = req.body;
    if (!date) throw new Error('Date is required.');

    // Verify day is not closed
    const [closed] = await connection.query(
      'SELECT 1 FROM raw_material_ledger_closings WHERE ledger_date = ?',
      [date]
    );
    if (closed.length > 0) {
      throw new Error('This day is already closed.');
    }

    // Fetch active raw materials
    const [materials] = await connection.query(`
      SELECT rm.id, rm.sub_product_name, rm.unit, rmc.name AS category_name
      FROM raw_materials rm 
      JOIN raw_material_categories rmc ON rm.category_id = rmc.id 
      WHERE rm.status = 1
    `);

    const closedBy = req.admin?.name || req.admin?.username || 'Admin';

    // Insert closing record
    await connection.query(
      'INSERT INTO raw_material_ledger_closings (ledger_date, closed_by) VALUES (?, ?)',
      [date, closedBy]
    );

    // Calculate dynamic state and save snapshots
    for (const rm of materials) {
      const isPreforms = rm.category_name.toLowerCase() === 'preforms';
      const unitsToSave = isPreforms ? ['BAGS', 'PCS'] : [rm.unit];

      for (const unit of unitsToSave) {
        const calc = await calculateDynamicRow(connection, rm, unit, date);
        await connection.query(
          `INSERT INTO raw_material_ledger_snapshots 
           (ledger_date, raw_material_id, unit, opening_stock, stock_in, stock_out, closing_stock)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            date, 
            rm.id, 
            unit, 
            calc.opening_stock, 
            calc.stock_in, 
            calc.stock_out, 
            calc.closing_stock
          ]
        );
      }
    }

    await connection.commit();
    res.json({ ok: true, message: `Day ${date} has been successfully closed and locked.` });
  } catch (error) {
    await connection.rollback();
    res.status(400).json({ ok: false, error: error.message });
  } finally {
    connection.release();
  }
});

// GET /api/raw-material-ledger/drilldown
// Returns itemized transactions contributing to a number
router.get('/drilldown', authMiddleware, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { date, rawMaterialId, unit, type } = req.query;
    if (!date || !rawMaterialId || !unit || !type) {
      throw new Error('date, rawMaterialId, unit, and type are required.');
    }

    const [rmRows] = await connection.query(
      `SELECT rm.id, rm.sub_product_name, rmc.name AS category_name 
       FROM raw_materials rm 
       JOIN raw_material_categories rmc ON rm.category_id = rmc.id 
       WHERE rm.id = ?`,
      [rawMaterialId]
    );
    if (rmRows.length === 0) throw new Error('Raw material not found.');
    const rm = rmRows[0];

    const isBottle = rm.category_name.toLowerCase() === 'bottles';
    const weight = parseFloat(rm.sub_product_name) || 0;
    const isPreform = rm.category_name.toLowerCase() === 'preforms';

    let transactions = [];

    if (type === 'IN') {
      // Find Stock IN transactions on targetDate
      const txs = await getTransactions(connection, rawMaterialId, date, date, isBottle, rm.sub_product_name);
      
      for (const t of txs) {
        let qty = parseFloat(t.quantity) || 0;
        if (qty <= 0 && !isBottle) continue; // Deductions are not stock IN

        // Format source details
        let details = {
          date: t.tx_date,
          reference: t.reference_id,
          product: isBottle ? t.product || rm.sub_product_name : rm.sub_product_name,
          quantity: qty,
          user: 'Admin',
          source: t.transaction_type === 'PURCHASE' ? 'Purchase Entry' : 'PET Production',
          type: 'Stock IN'
        };

        if (isPreform) {
          const scale = unit === 'BAGS' ? (1 / 25) : (1000 / weight);
          details.quantity = qty * scale;
        }

        transactions.push(details);
      }
    } else if (type === 'OUT') {
      // Find Stock OUT transactions on targetDate
      const txs = await getTransactions(connection, rawMaterialId, date, date, isBottle, rm.sub_product_name);

      for (const t of txs) {
        let qty = parseFloat(t.quantity) || 0;
        if (qty >= 0) continue; // Additions are not stock OUT

        let details = {
          date: t.tx_date,
          reference: t.reference_id,
          product: rm.sub_product_name,
          quantity: Math.abs(qty),
          user: 'Admin',
          source: isPreform ? 'PET Production' : 'Finished Goods Production',
          type: 'Stock OUT'
        };

        if (isPreform) {
          const scale = unit === 'BAGS' ? (1 / 25) : (1000 / weight);
          details.quantity = Math.abs(qty) * scale;
        }

        transactions.push(details);
      }
    } else if (type === 'OPENING') {
      // Get manual opening or nearest closed day and list all transactions up to yesterday
      const [manualRows] = await connection.query(
        `SELECT DATE_FORMAT(ledger_date, '%Y-%m-%d') as ledger_date, quantity 
         FROM raw_material_ledger_manual_opening 
         WHERE raw_material_id = ? AND unit = ? AND ledger_date <= ? 
         ORDER BY ledger_date DESC LIMIT 1`,
        [rawMaterialId, unit, date]
      );

      const [closedRows] = await connection.query(
        `SELECT DATE_FORMAT(ledger_date, '%Y-%m-%d') as ledger_date 
         FROM raw_material_ledger_closings 
         WHERE ledger_date < ? 
         ORDER BY ledger_date DESC LIMIT 1`,
        [date]
      );

      let checkpointDate = null;
      let checkpointStock = 0;
      let startQueryDate = null;
      let checkpointDesc = '';

      const hasManual = manualRows.length > 0;
      const hasClosed = closedRows.length > 0;

      if (hasManual && hasClosed) {
        const dManual = manualRows[0].ledger_date;
        const dClosed = closedRows[0].ledger_date;
        
        if (dManual > dClosed) {
          checkpointDate = dManual;
          checkpointStock = parseFloat(manualRows[0].quantity) || 0;
          startQueryDate = dManual;
          checkpointDesc = `Manual opening stock override on ${dManual}`;
        } else {
          checkpointDate = dClosed;
          const [snapRows] = await connection.query(
            `SELECT closing_stock FROM raw_material_ledger_snapshots 
             WHERE raw_material_id = ? AND unit = ? AND ledger_date = ?`,
            [rawMaterialId, unit, dClosed]
          );
          checkpointStock = snapRows.length > 0 ? parseFloat(snapRows[0].closing_stock) : 0;
          
          const nextDay = new Date(dClosed);
          nextDay.setDate(nextDay.getDate() + 1);
          startQueryDate = nextDay.toISOString().split('T')[0];
          checkpointDesc = `Closed day closing stock snapshot on ${dClosed}`;
        }
      } else if (hasManual) {
        checkpointDate = manualRows[0].ledger_date;
        checkpointStock = parseFloat(manualRows[0].quantity) || 0;
        startQueryDate = manualRows[0].ledger_date;
        checkpointDesc = `Manual opening stock override on ${checkpointDate}`;
      } else if (hasClosed) {
        checkpointDate = closedRows[0].ledger_date;
        const [snapRows] = await connection.query(
          `SELECT closing_stock FROM raw_material_ledger_snapshots 
           WHERE raw_material_id = ? AND unit = ? AND ledger_date = ?`,
          [rawMaterialId, unit, checkpointDate]
        );
        checkpointStock = snapRows.length > 0 ? parseFloat(snapRows[0].closing_stock) : 0;
        
        const nextDay = new Date(checkpointDate);
        nextDay.setDate(nextDay.getDate() + 1);
        startQueryDate = nextDay.toISOString().split('T')[0];
        checkpointDesc = `Closed day closing stock snapshot on ${checkpointDate}`;
      } else {
        checkpointDesc = 'Initial opening stock';
      }

      // Add checkpoint as the first record
      transactions.push({
        date: checkpointDate || 'Beginning',
        reference: '-',
        product: rm.sub_product_name,
        quantity: checkpointStock,
        user: 'System',
        source: checkpointDesc,
        type: 'Opening Baseline'
      });

      // Sum and list transactions between startQueryDate and yesterday
      const yesterday = new Date(date);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      if (!startQueryDate || startQueryDate <= yesterdayStr) {
        const priorTxs = await getTransactions(connection, rawMaterialId, startQueryDate, yesterdayStr, isBottle, rm.sub_product_name);
        
        for (const t of priorTxs) {
          let qty = parseFloat(t.quantity) || 0;
          if (isPreform) {
            const scale = unit === 'BAGS' ? (1 / 25) : (1000 / weight);
            qty = qty * scale;
          }

          transactions.push({
            date: t.tx_date,
            reference: t.reference_id,
            product: rm.sub_product_name,
            quantity: Math.abs(qty),
            user: 'Admin',
            source: qty > 0 
              ? (t.transaction_type === 'PURCHASE' ? 'Purchase Entry' : 'PET Production') 
              : (isPreform ? 'PET Production' : 'Finished Goods Production'),
            type: qty > 0 ? 'Stock IN' : 'Stock OUT'
          });
        }
      }
    } else if (type === 'CLOSING') {
      // Return closing details - which is opening details + today's movements
      // Let's call the opening builder
      const reqMock = { query: { date, rawMaterialId, unit, type: 'OPENING' } };
      // Call manually:
      const openingTxs = await getTransactionsForOpening(connection, rawMaterialId, unit, date, rm, isBottle, isPreform, weight);
      transactions = [...openingTxs];

      // Add today's transactions
      const todayTxs = await getTransactions(connection, rawMaterialId, date, date, isBottle, rm.sub_product_name);
      for (const t of todayTxs) {
        let qty = parseFloat(t.quantity) || 0;
        if (isPreform) {
          const scale = unit === 'BAGS' ? (1 / 25) : (1000 / weight);
          qty = qty * scale;
        }

        transactions.push({
          date: t.tx_date,
          reference: t.reference_id,
          product: rm.sub_product_name,
          quantity: Math.abs(qty),
          user: 'Admin',
          source: qty > 0 
            ? (t.transaction_type === 'PURCHASE' ? 'Purchase Entry' : 'PET Production') 
            : (isPreform ? 'PET Production' : 'Finished Goods Production'),
          type: qty > 0 ? 'Stock IN' : 'Stock OUT'
        });
      }
    }

    res.json({
      ok: true,
      date,
      type,
      rawMaterialId,
      unit,
      productName: rm.sub_product_name,
      categoryName: rm.category_name,
      transactions
    });

  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  } finally {
    connection.release();
  }
});

// Helper for closing audit trail to reuse opening stock calculations
async function getTransactionsForOpening(connection, rawMaterialId, unit, date, rm, isBottle, isPreform, weight) {
  const [manualRows] = await connection.query(
    `SELECT DATE_FORMAT(ledger_date, '%Y-%m-%d') as ledger_date, quantity 
     FROM raw_material_ledger_manual_opening 
     WHERE raw_material_id = ? AND unit = ? AND ledger_date <= ? 
     ORDER BY ledger_date DESC LIMIT 1`,
    [rawMaterialId, unit, date]
  );

  const [closedRows] = await connection.query(
    `SELECT DATE_FORMAT(ledger_date, '%Y-%m-%d') as ledger_date 
     FROM raw_material_ledger_closings 
     WHERE ledger_date < ? 
     ORDER BY ledger_date DESC LIMIT 1`,
    [date]
  );

  let checkpointDate = null;
  let checkpointStock = 0;
  let startQueryDate = null;
  let checkpointDesc = '';

  const hasManual = manualRows.length > 0;
  const hasClosed = closedRows.length > 0;

  if (hasManual && hasClosed) {
    const dManual = manualRows[0].ledger_date;
    const dClosed = closedRows[0].ledger_date;
    
    if (dManual > dClosed) {
      checkpointDate = dManual;
      checkpointStock = parseFloat(manualRows[0].quantity) || 0;
      startQueryDate = dManual;
      checkpointDesc = `Manual opening stock override on ${dManual}`;
    } else {
      checkpointDate = dClosed;
      const [snapRows] = await connection.query(
        `SELECT closing_stock FROM raw_material_ledger_snapshots 
         WHERE raw_material_id = ? AND unit = ? AND ledger_date = ?`,
        [rawMaterialId, unit, dClosed]
      );
      checkpointStock = snapRows.length > 0 ? parseFloat(snapRows[0].closing_stock) : 0;
      
      const nextDay = new Date(dClosed);
      nextDay.setDate(nextDay.getDate() + 1);
      startQueryDate = nextDay.toISOString().split('T')[0];
      checkpointDesc = `Closed day closing stock snapshot on ${dClosed}`;
    }
  } else if (hasManual) {
    checkpointDate = manualRows[0].ledger_date;
    checkpointStock = parseFloat(manualRows[0].quantity) || 0;
    startQueryDate = manualRows[0].ledger_date;
    checkpointDesc = `Manual opening stock override on ${checkpointDate}`;
  } else if (hasClosed) {
    checkpointDate = closedRows[0].ledger_date;
    const [snapRows] = await connection.query(
      `SELECT closing_stock FROM raw_material_ledger_snapshots 
       WHERE raw_material_id = ? AND unit = ? AND ledger_date = ?`,
      [rawMaterialId, unit, checkpointDate]
    );
    checkpointStock = snapRows.length > 0 ? parseFloat(snapRows[0].closing_stock) : 0;
    
    const nextDay = new Date(checkpointDate);
    nextDay.setDate(nextDay.getDate() + 1);
    startQueryDate = nextDay.toISOString().split('T')[0];
    checkpointDesc = `Closed day closing stock snapshot on ${checkpointDate}`;
  } else {
    checkpointDesc = 'Initial opening stock';
  }

  const list = [{
    date: checkpointDate || 'Beginning',
    reference: '-',
    product: rm.sub_product_name,
    quantity: checkpointStock,
    user: 'System',
    source: checkpointDesc,
    type: 'Opening Baseline'
  }];

  const yesterday = new Date(date);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  if (!startQueryDate || startQueryDate <= yesterdayStr) {
    const priorTxs = await getTransactions(connection, rawMaterialId, startQueryDate, yesterdayStr, isBottle, rm.sub_product_name);
    for (const t of priorTxs) {
      let qty = parseFloat(t.quantity) || 0;
      if (isPreform) {
        const scale = unit === 'BAGS' ? (1 / 25) : (1000 / weight);
        qty = qty * scale;
      }

      list.push({
        date: t.tx_date,
        reference: t.reference_id,
        product: rm.sub_product_name,
        quantity: Math.abs(qty),
        user: 'Admin',
        source: qty > 0 
          ? (t.transaction_type === 'PURCHASE' ? 'Purchase Entry' : 'PET Production') 
          : (isPreform ? 'PET Production' : 'Finished Goods Production'),
        type: qty > 0 ? 'Stock IN' : 'Stock OUT'
      });
    }
  }

  return list;
}

export default router;
