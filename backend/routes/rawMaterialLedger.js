import express from 'express';
import pool from '../config/db.js';
import authMiddleware from '../middleware/auth.js';
import { getSecondUnit, getConversionFactor } from '../helpers/conversion.js';
import { 
  autoClosePendingDays, 
  calculateDynamicRow, 
  getTransactions, 
  aggregateTxs, 
  getTodayISTStr, 
  addDays 
} from '../services/rawMaterialAutoCloseService.js';

const router = express.Router();

// Helper to normalize product names for comparison
function normalizeName(name) {
  return String(name || '').toLowerCase().replace(/[\s\-_]/g, '').replace('ltr', 'l');
}

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
      startQueryDate = addDays(dClosed, 1);
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
    startQueryDate = addDays(checkpointDate, 1);
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

  const yesterdayStr = addDays(date, -1);
  const factor = await getConversionFactor(connection, rm);

  if (!startQueryDate || startQueryDate <= yesterdayStr) {
    const priorTxs = await getTransactions(connection, rawMaterialId, startQueryDate, yesterdayStr);
    for (const t of priorTxs) {
      let qty = parseFloat(t.quantity) || 0;
      if (isPreform) {
        if (unit === 'BAGS' && t.bags_used !== undefined && t.bags_used !== null && parseFloat(t.bags_used) > 0 && String(t.reference_id).startsWith('BATCH-')) {
          qty = -parseFloat(t.bags_used);
        } else {
          const scale = unit === 'BAGS' ? (1 / 25) : (1000 / weight);
          qty = qty * scale;
        }
      } else {
        const secondUnit = getSecondUnit(rm.category_name);
        if (secondUnit && unit === secondUnit) {
          if (isBottle && t.bottle_bags !== undefined && t.bottle_bags !== null && parseFloat(t.bottle_bags) > 0 && String(t.reference_id).startsWith('BATCH-')) {
            qty = parseFloat(t.bottle_bags);
          } else if (t.bags_box !== undefined && t.bags_box !== null && parseFloat(t.bags_box) > 0 && String(t.reference_id).startsWith('BILL-')) {
            qty = parseFloat(t.bags_box);
          } else {
            qty = factor > 0 ? (qty / factor) : 0;
          }
        }
      }

      list.push({
        date: t.tx_date,
        reference: t.reference_id,
        product: rm.sub_product_name,
        quantity: Math.abs(qty),
        user: t.user_name || 'Admin',
        source: qty > 0 
          ? (t.transaction_type === 'PURCHASE' ? 'Purchase Entry' : t.transaction_type === 'PRODUCTION' ? 'PET Production' : t.transaction_type === 'CORRECTION' ? 'Stock Correction' : 'System') 
          : (isPreform ? 'PET Production' : 'Finished Goods Production'),
        type: qty > 0 ? 'Stock IN' : 'Stock OUT'
      });
    }
  }

  return list;
}

// Helper to fetch latest per-piece rate for all raw materials
export async function getPerPcRates(connection) {
  const [ratesRows] = await connection.query(`
    SELECT rm.id, rm.sub_product_name, rm.unit AS rm_unit, rmc.name AS category_name,
      bi.per_pc_rate, bi.rate_per_unit, bi.qty_in_pcs, bi.bags_box, bi.total_quantity, bi.amount, bi.unit AS bill_unit,
      bi.bill_number, bi.bill_date,
      cs.total_cost AS cs_cost,
      pbb.unit_cost AS pbb_cost,
      pbb.raw_material_id AS pbb_rm_id
    FROM raw_materials rm
    JOIN raw_material_categories rmc ON rm.category_id = rmc.id
    LEFT JOIN (
      SELECT bi1.*, b1.bill_number, DATE_FORMAT(b1.bill_date, '%Y-%m-%d') as bill_date
      FROM inventory_bill_items bi1
      JOIN inventory_bills b1 ON bi1.bill_id = b1.id
      WHERE bi1.id = (
        SELECT bi2.id
        FROM inventory_bill_items bi2
        JOIN inventory_bills b2 ON bi2.bill_id = b2.id
        WHERE bi2.raw_material_id = bi1.raw_material_id
        ORDER BY b2.bill_date DESC, bi2.created_at DESC, bi2.id DESC
        LIMIT 1
      )
    ) bi ON rm.id = bi.raw_material_id
    LEFT JOIN cost_sheets cs ON rm.id = cs.finished_product_id
    LEFT JOIN (
      SELECT pbb1.finished_product_id, pbb1.unit_cost, pbb1.raw_material_id
      FROM pet_bottle_batches pbb1
      WHERE pbb1.id = (
        SELECT pbb2.id
        FROM pet_bottle_batches pbb2
        WHERE pbb2.finished_product_id = pbb1.finished_product_id
        ORDER BY pbb2.batch_date DESC, pbb2.created_at DESC, pbb2.id DESC
        LIMIT 1
      )
    ) pbb ON rm.id = pbb.finished_product_id
    WHERE rm.status = 1
  `);

  const perPcRateMap = {};

  // First pass: direct purchase bills or cost sheet / pet bottle batches
  for (const row of ratesRows) {
    let rate = 0;
    let source = 'Default (Not billed)';
    let ratePerUnit = parseFloat(row.rate_per_unit) || 0;
    const isPreforms = row.category_name.toLowerCase() === 'preforms';
    const isBottles = row.category_name.toLowerCase() === 'bottles';

    if (row.per_pc_rate !== null && row.per_pc_rate !== undefined && parseFloat(row.per_pc_rate) > 0) {
      rate = parseFloat(row.per_pc_rate);
      source = `Bill ${row.bill_number || ''} (${row.bill_date || ''})`;
    } else if (row.rate_per_unit !== null && parseFloat(row.rate_per_unit) > 0) {
      const qtyInPcs = parseFloat(row.qty_in_pcs) || 0;
      const bagsBox = parseFloat(row.bags_box) || 0;

      if (qtyInPcs > 0 && bagsBox > 0) {
        rate = ratePerUnit / (qtyInPcs / bagsBox);
        source = `Bill ${row.bill_number || ''} (₹${ratePerUnit}/${row.bill_unit} ÷ ${(qtyInPcs/bagsBox).toFixed(0)} pcs)`;
      } else if (qtyInPcs > 0 && parseFloat(row.amount) > 0) {
        rate = parseFloat(row.amount) / qtyInPcs;
        source = `Bill ${row.bill_number || ''} (₹${parseFloat(row.amount)} ÷ ${qtyInPcs} pcs)`;
      } else if (isPreforms) {
        const weight = parseFloat(row.sub_product_name) || 0;
        if (weight > 0) {
          rate = ratePerUnit / (1000 / weight);
          source = `Bill ${row.bill_number || ''} (₹${ratePerUnit}/KG preform)`;
        } else {
          rate = ratePerUnit;
          source = `Bill ${row.bill_number || ''}`;
        }
      } else if (row.rm_unit === 'PCS') {
        rate = ratePerUnit;
        source = `Bill ${row.bill_number || ''}`;
      } else {
        rate = ratePerUnit;
        source = `Bill ${row.bill_number || ''}`;
      }
    } else if (isBottles) {
      if (row.cs_cost !== null && parseFloat(row.cs_cost) > 0) {
        rate = parseFloat(row.cs_cost);
        source = 'Cost Sheet Standard';
      } else if (row.pbb_cost !== null && parseFloat(row.pbb_cost) > 0) {
        rate = parseFloat(row.pbb_cost);
        source = 'PET Bottle Batch Production Cost';
      }
    }

    perPcRateMap[row.id] = {
      rate,
      source,
      bill_number: row.bill_number || null,
      bill_date: row.bill_date || null,
      rate_per_unit: ratePerUnit,
      unit: row.bill_unit || row.rm_unit
    };
  }

  // Second pass: for bottles without direct rate, check preform rate used
  for (const row of ratesRows) {
    if ((!perPcRateMap[row.id] || perPcRateMap[row.id].rate === 0) && row.pbb_rm_id) {
      const preformRateObj = perPcRateMap[row.pbb_rm_id];
      if (preformRateObj && preformRateObj.rate > 0) {
        perPcRateMap[row.id] = {
          rate: preformRateObj.rate,
          source: `Preform Rate (${preformRateObj.source})`,
          bill_number: preformRateObj.bill_number,
          bill_date: preformRateObj.bill_date,
          rate_per_unit: preformRateObj.rate_per_unit,
          unit: 'PCS'
        };
      }
    }
  }

  return perPcRateMap;
}

// Helper to calculate summary metrics for raw material ledger items
export function calculateLedgerSummary(items, perPcRateMap) {
  let totalStockValue = 0;
  let totalClosingValue = 0;
  let totalStockInToday = 0;
  let totalStockOutToday = 0;

  const processedValuations = new Set();
  const breakdown = [];

  for (const item of items) {
    const isPreforms = item.category_name.toLowerCase() === 'preforms';
    const secondUnit = getSecondUnit(item.category_name);
    const rateInfo = perPcRateMap[item.raw_material_id] || { rate: 0, source: 'Default / Not billed' };
    const perPcRate = typeof rateInfo === 'object' ? rateInfo.rate : (rateInfo || 0);

    let isPieceRow = false;
    if (isPreforms) {
      isPieceRow = item.unit === 'PCS';
    } else if (secondUnit) {
      isPieceRow = item.unit !== secondUnit;
    } else {
      isPieceRow = true;
    }

    if (isPieceRow && !processedValuations.has(item.raw_material_id)) {
      const openingVal = (item.opening_stock || 0) * perPcRate;
      const closingVal = (item.closing_stock || 0) * perPcRate;
      totalStockValue += openingVal;
      totalClosingValue += closingVal;
      processedValuations.add(item.raw_material_id);

      breakdown.push({
        raw_material_id: item.raw_material_id,
        sub_product_name: item.sub_product_name,
        category_name: item.category_name,
        unit: item.unit,
        opening_stock: item.opening_stock || 0,
        stock_in: item.stock_in || 0,
        stock_out: item.stock_out || 0,
        closing_stock: item.closing_stock || 0,
        per_pc_rate: perPcRate,
        opening_value: parseFloat(openingVal.toFixed(2)),
        closing_value: parseFloat(closingVal.toFixed(2)),
        source: rateInfo.source || 'Latest Purchase Rate',
        bill_number: rateInfo.bill_number || null,
        bill_date: rateInfo.bill_date || null
      });
    }

    if (isPieceRow) {
      totalStockInToday += item.stock_in || 0;
      totalStockOutToday += item.stock_out || 0;
    }
  }

  // Sort breakdown: items with closing_value > 0 first, then closing_stock > 0, then by category and name
  breakdown.sort((a, b) => {
    if (b.closing_value !== a.closing_value) {
      return b.closing_value - a.closing_value;
    }
    if (b.closing_stock !== a.closing_stock) {
      return b.closing_stock - a.closing_stock;
    }
    return a.category_name.localeCompare(b.category_name);
  });

  return {
    totalCategories: new Set(items.map(i => i.category_name)).size,
    totalRawMaterialValue: parseFloat(totalStockValue.toFixed(2)),
    totalStockInToday: parseFloat(totalStockInToday.toFixed(2)),
    totalStockOutToday: parseFloat(totalStockOutToday.toFixed(2)),
    closingStockValue: parseFloat(totalClosingValue.toFixed(2)),
    breakdown
  };
}

// GET /api/raw-material-ledger/day
// Fetches opening, IN, OUT, closing for selected date
router.get('/day', authMiddleware, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { date } = req.query;
    if (!date) throw new Error('Date parameter is required.');

    // Ensure all prior unclosed days are automatically caught up and closed
    await autoClosePendingDays(connection);

    // 1. Check if the day is closed
    const [closedRows] = await connection.query(
      `SELECT closed_by, DATE_FORMAT(closed_at, '%Y-%m-%d %h:%i %p') as closed_at 
       FROM raw_material_ledger_closings WHERE ledger_date = ?`,
      [date]
    );

    const isClosed = closedRows.length > 0;
    let ledgerItems = [];

    // 2. Fetch latest per-pc rates for valuation
    const perPcRateMap = await getPerPcRates(connection);

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
        const secondUnit = getSecondUnit(rm.category_name);
        if (rm.category_name.toLowerCase() === 'preforms') {
          // Preforms splits into BAGS and PCS
          const bagsRow = await calculateDynamicRow(connection, rm, 'BAGS', date);
          const pcsRow = await calculateDynamicRow(connection, rm, 'PCS', date);
          ledgerItems.push(bagsRow);
          ledgerItems.push(pcsRow);
        } else if (secondUnit && secondUnit !== rm.unit) {
          // Categories with a separate second unit (e.g. Caps, Labels, etc.)
          const secondRow = await calculateDynamicRow(connection, rm, secondUnit, date);
          const mainRow = await calculateDynamicRow(connection, rm, rm.unit, date);
          ledgerItems.push(secondRow);
          ledgerItems.push(mainRow);
        } else {
          // General raw material
          const row = await calculateDynamicRow(connection, rm, rm.unit, date);
          ledgerItems.push(row);
        }
      }
    }

    // 3. Compute Dashboard Summary values (Closing Value = Qty in PCS * Per PC Rate)
    const summary = calculateLedgerSummary(ledgerItems, perPcRateMap);

    res.json({
      ok: true,
      date,
      isClosed,
      closedBy: isClosed ? closedRows[0].closed_by : null,
      closedAt: isClosed ? closedRows[0].closed_at : null,
      items: ledgerItems,
      summary
    });

  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  } finally {
    connection.release();
  }
});

// GET /api/raw-material-ledger/history
// Returns all closed days with their stock snapshots and summary statistics
router.get('/history', authMiddleware, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    // Ensure all pending prior days are caught up and closed
    await autoClosePendingDays(connection);

    const { startDate, endDate, date, search } = req.query;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = (page - 1) * limit;

    let whereConditions = [];
    let params = [];

    if (date) {
      whereConditions.push('c.ledger_date = ?');
      params.push(date);
    } else {
      if (startDate) {
        whereConditions.push('c.ledger_date >= ?');
        params.push(startDate);
      }
      if (endDate) {
        whereConditions.push('c.ledger_date <= ?');
        params.push(endDate);
      }
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Count total closed days
    const [countRows] = await connection.query(
      `SELECT COUNT(*) as totalCount FROM raw_material_ledger_closings c ${whereClause}`,
      params
    );
    const total = countRows[0]?.totalCount || 0;
    const totalPages = Math.ceil(total / limit) || 1;

    // Fetch closed days ordered newest to oldest
    const [closedDays] = await connection.query(
      `SELECT 
         DATE_FORMAT(c.ledger_date, '%Y-%m-%d') AS ledger_date, 
         c.closed_by, 
         DATE_FORMAT(c.closed_at, '%Y-%m-%d %h:%i %p') AS closed_at
       FROM raw_material_ledger_closings c
       ${whereClause}
       ORDER BY c.ledger_date DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    // Fetch per-piece valuation rates
    const perPcRateMap = await getPerPcRates(connection);

    const history = [];

    for (const day of closedDays) {
      let itemQuery = `
        SELECT 
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
        WHERE rms.ledger_date = ?
      `;
      const itemParams = [day.ledger_date];

      if (search) {
        itemQuery += ' AND (rm.sub_product_name LIKE ? OR rmc.name LIKE ?)';
        itemParams.push(`%${search}%`, `%${search}%`);
      }

      const [snapRows] = await connection.query(itemQuery, itemParams);

      const items = snapRows.map(row => ({
        raw_material_id: row.raw_material_id,
        sub_product_name: row.sub_product_name,
        category_name: row.category_name,
        unit: row.unit,
        opening_stock: parseFloat(row.opening_stock),
        stock_in: parseFloat(row.stock_in),
        stock_out: parseFloat(row.stock_out),
        closing_stock: parseFloat(row.closing_stock)
      }));

      // Calculate summary for this closed day
      const summary = calculateLedgerSummary(items, perPcRateMap);
      summary.totalItems = items.length;

      history.push({
        ledger_date: day.ledger_date,
        closed_by: day.closed_by,
        closed_at: day.closed_at,
        items,
        summary
      });
    }

    res.json({
      ok: true,
      history,
      total,
      page,
      limit,
      totalPages
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
        `SELECT rm.id, rm.sub_product_name, rm.unit, rmc.name AS category_name 
         FROM raw_materials rm 
         JOIN raw_material_categories rmc ON rm.category_id = rmc.id 
         WHERE rm.id = ?`,
        [rId]
      );
      if (rmRows.length === 0) {
        throw new Error(`Raw material with ID ${rId} not found.`);
      }
      const rm = rmRows[0];
      const secondUnit = getSecondUnit(rm.category_name);

      if (secondUnit && secondUnit !== rm.unit) {
        const factor = await getConversionFactor(connection, rm);
        let qtySecond = 0;
        let qtyMain = 0;

        if (u === secondUnit) {
          qtySecond = parsedQty;
          qtyMain = qtySecond * factor;
        } else {
          qtyMain = parsedQty;
          qtySecond = factor > 0 ? qtyMain / factor : 0;
        }

        // Insert/Update both units
        await connection.query(
          `INSERT INTO raw_material_ledger_manual_opening (ledger_date, raw_material_id, unit, quantity)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE quantity = ?, updated_at = NOW()`,
          [date, rId, secondUnit, qtySecond, qtySecond]
        );

        await connection.query(
          `INSERT INTO raw_material_ledger_manual_opening (ledger_date, raw_material_id, unit, quantity)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE quantity = ?, updated_at = NOW()`,
          [date, rId, rm.unit, qtyMain, qtyMain]
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
      const secondUnit = getSecondUnit(rm.category_name);
      const unitsToSave = isPreforms 
        ? ['BAGS', 'PCS'] 
        : (secondUnit ? [...new Set([secondUnit, rm.unit])] : [rm.unit]);

      for (const unit of unitsToSave) {
        const calc = await calculateDynamicRow(connection, rm, unit, date);
        await connection.query(
          `INSERT INTO raw_material_ledger_snapshots 
           (ledger_date, raw_material_id, unit, opening_stock, stock_in, stock_out, closing_stock)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             opening_stock = VALUES(opening_stock),
             stock_in = VALUES(stock_in),
             stock_out = VALUES(stock_out),
             closing_stock = VALUES(closing_stock)`,
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
      `SELECT rm.id, rm.sub_product_name, rm.unit, rmc.name AS category_name 
       FROM raw_materials rm 
       JOIN raw_material_categories rmc ON rm.category_id = rmc.id 
       WHERE rm.id = ?`,
      [rawMaterialId]
    );
    if (rmRows.length === 0) throw new Error('Raw material not found.');
    const rm = rmRows[0];
    const factor = await getConversionFactor(connection, rm);

    const isBottle = rm.category_name.toLowerCase() === 'bottles';
    const weight = parseFloat(rm.sub_product_name) || 0;
    const isPreform = rm.category_name.toLowerCase() === 'preforms';

    let transactions = [];

    if (type === 'IN') {
      // Find Stock IN transactions on targetDate
      const txs = await getTransactions(connection, rawMaterialId, date, date);
      
      for (const t of txs) {
        let qty = parseFloat(t.quantity) || 0;
        if (qty <= 0 && !isBottle) continue; // Deductions are not stock IN

        // Format source details
        let details = {
          date: t.tx_date,
          reference: t.reference_id,
          product: rm.sub_product_name,
          quantity: qty,
          user: t.user_name || 'Admin',
          source: t.transaction_type === 'PURCHASE' ? 'Purchase Entry' :
                  t.transaction_type === 'PRODUCTION' ? 'PET Production' :
                  t.transaction_type === 'CORRECTION' ? 'Stock Correction' : 'System',
          type: 'Stock IN'
        };

        if (isPreform) {
          if (unit === 'BAGS' && t.bags_used !== undefined && t.bags_used !== null && parseFloat(t.bags_used) > 0 && String(t.reference_id).startsWith('BATCH-')) {
            details.quantity = parseFloat(t.bags_used);
          } else {
            const scale = unit === 'BAGS' ? (1 / 25) : (1000 / weight);
            details.quantity = qty * scale;
          }
        } else {
          const secondUnit = getSecondUnit(rm.category_name);
          if (secondUnit && unit === secondUnit) {
            if (isBottle && t.bottle_bags !== undefined && t.bottle_bags !== null && parseFloat(t.bottle_bags) > 0 && String(t.reference_id).startsWith('BATCH-')) {
              details.quantity = parseFloat(t.bottle_bags);
            } else if (t.bags_box !== undefined && t.bags_box !== null && parseFloat(t.bags_box) > 0 && String(t.reference_id).startsWith('BILL-')) {
              details.quantity = parseFloat(t.bags_box);
            } else {
              details.quantity = factor > 0 ? (qty / factor) : 0;
            }
          }
        }

        transactions.push(details);
      }
    } else if (type === 'OUT') {
      // Find Stock OUT transactions on targetDate
      const txs = await getTransactions(connection, rawMaterialId, date, date);

      for (const t of txs) {
        let qty = parseFloat(t.quantity) || 0;
        if (qty >= 0) continue; // Additions are not stock OUT

        let details = {
          date: t.tx_date,
          reference: t.reference_id,
          product: rm.sub_product_name,
          quantity: Math.abs(qty),
          user: t.user_name || 'Admin',
          source: t.transaction_type === 'PRODUCTION' ? (isPreform ? 'PET Production' : 'Finished Goods Production') :
                  t.transaction_type === 'CORRECTION' ? 'Stock Correction' : 'System',
          type: 'Stock OUT'
        };

        if (isPreform) {
          if (unit === 'BAGS' && t.bags_used !== undefined && t.bags_used !== null && parseFloat(t.bags_used) > 0 && String(t.reference_id).startsWith('BATCH-')) {
            details.quantity = parseFloat(t.bags_used);
          } else {
            const scale = unit === 'BAGS' ? (1 / 25) : (1000 / weight);
            details.quantity = Math.abs(qty) * scale;
          }
        } else {
          const secondUnit = getSecondUnit(rm.category_name);
          if (secondUnit && unit === secondUnit) {
            if (isBottle && t.bottle_bags !== undefined && t.bottle_bags !== null && parseFloat(t.bottle_bags) > 0 && String(t.reference_id).startsWith('BATCH-')) {
              details.quantity = parseFloat(t.bottle_bags);
            } else if (t.bags_box !== undefined && t.bags_box !== null && parseFloat(t.bags_box) > 0 && String(t.reference_id).startsWith('BILL-')) {
              details.quantity = parseFloat(t.bags_box);
            } else {
              details.quantity = factor > 0 ? (Math.abs(qty) / factor) : 0;
            }
          }
        }

        transactions.push(details);
      }
    } else if (type === 'OPENING') {
      transactions = await getTransactionsForOpening(connection, rawMaterialId, unit, date, rm, isBottle, isPreform, weight);
    } else if (type === 'CLOSING') {
      const openingTxs = await getTransactionsForOpening(connection, rawMaterialId, unit, date, rm, isBottle, isPreform, weight);
      transactions = [...openingTxs];

      // Add today's transactions
      const todayTxs = await getTransactions(connection, rawMaterialId, date, date);
      for (const t of todayTxs) {
        let qty = parseFloat(t.quantity) || 0;
        if (isPreform) {
          const scale = unit === 'BAGS' ? (1 / 25) : (1000 / weight);
          qty = qty * scale;
        } else {
          const secondUnit = getSecondUnit(rm.category_name);
          if (secondUnit && unit === secondUnit) {
            qty = qty / factor;
          }
        }

        transactions.push({
          date: t.tx_date,
          reference: t.reference_id,
          product: rm.sub_product_name,
          quantity: Math.abs(qty),
          user: t.user_name || 'Admin',
          source: qty > 0 
            ? (t.transaction_type === 'PURCHASE' ? 'Purchase Entry' : t.transaction_type === 'PRODUCTION' ? 'PET Production' : t.transaction_type === 'CORRECTION' ? 'Stock Correction' : 'System') 
            : (t.transaction_type === 'PRODUCTION' ? (isPreform ? 'PET Production' : 'Finished Goods Production') : t.transaction_type === 'CORRECTION' ? 'Stock Correction' : 'System'),
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

export default router;
