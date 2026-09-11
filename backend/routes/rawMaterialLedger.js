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
        const scale = unit === 'BAGS' ? (1 / 25) : (1000 / weight);
        qty = qty * scale;
      } else {
        const secondUnit = getSecondUnit(rm.category_name);
        if (secondUnit && unit === secondUnit) {
          qty = qty / factor;
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

    // 3. Compute Dashboard Summary values (avoiding double counting preforms/split units)
    let totalStockValue = 0;
    let totalStockInToday = 0;
    let totalStockOutToday = 0;
    let totalClosingValue = 0;

    // Track valuation uniquely per raw_material_id
    const processedValuations = new Set();

    ledgerItems.forEach(item => {
      const rate = ratesMap[item.raw_material_id] || 0;
      const isPreforms = item.category_name.toLowerCase() === 'preforms';
      const secondUnit = getSecondUnit(item.category_name);

      if (isPreforms) {
        if (!processedValuations.has(item.raw_material_id)) {
          const weight = parseFloat(item.sub_product_name) || 0;
          if (item.unit === 'PCS' && weight > 0) {
            const kgOpening = item.opening_stock / (1000 / weight);
            const kgClosing = item.closing_stock / (1000 / weight);
            totalStockValue += kgOpening * rate;
            totalClosingValue += kgClosing * rate;
            processedValuations.add(item.raw_material_id);
          }
        }
        if (item.unit === 'PCS') {
          totalStockInToday += item.stock_in;
          totalStockOutToday += item.stock_out;
        }
      } else if (secondUnit && secondUnit !== item.unit) {
        if (item.unit === secondUnit) {
          // Skip second unit row for dashboard summary calculation
        } else {
          totalStockValue += item.opening_stock * rate;
          totalClosingValue += item.closing_stock * rate;
          totalStockInToday += item.stock_in;
          totalStockOutToday += item.stock_out;
        }
      } else {
        totalStockValue += item.opening_stock * rate;
        totalClosingValue += item.closing_stock * rate;
        totalStockInToday += item.stock_in;
        totalStockOutToday += item.stock_out;
      }
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

    // Fetch valuation rates
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
      let totalStockValue = 0;
      let totalStockInToday = 0;
      let totalStockOutToday = 0;
      let totalClosingValue = 0;
      const processedValuations = new Set();

      items.forEach(item => {
        const rate = ratesMap[item.raw_material_id] || 0;
        const isPreforms = item.category_name.toLowerCase() === 'preforms';
        const secondUnit = getSecondUnit(item.category_name);

        if (isPreforms) {
          if (!processedValuations.has(item.raw_material_id)) {
            const weight = parseFloat(item.sub_product_name) || 0;
            if (item.unit === 'PCS' && weight > 0) {
              const kgOpening = item.opening_stock / (1000 / weight);
              const kgClosing = item.closing_stock / (1000 / weight);
              totalStockValue += kgOpening * rate;
              totalClosingValue += kgClosing * rate;
              processedValuations.add(item.raw_material_id);
            }
          }
          if (item.unit === 'PCS') {
            totalStockInToday += item.stock_in;
            totalStockOutToday += item.stock_out;
          }
        } else if (secondUnit && secondUnit !== item.unit) {
          if (item.unit === secondUnit) {
            // skip second unit from summary totals
          } else {
            totalStockValue += item.opening_stock * rate;
            totalClosingValue += item.closing_stock * rate;
            totalStockInToday += item.stock_in;
            totalStockOutToday += item.stock_out;
          }
        } else {
          totalStockValue += item.opening_stock * rate;
          totalClosingValue += item.closing_stock * rate;
          totalStockInToday += item.stock_in;
          totalStockOutToday += item.stock_out;
        }
      });

      history.push({
        ledger_date: day.ledger_date,
        closed_by: day.closed_by,
        closed_at: day.closed_at,
        items,
        summary: {
          totalCategories: new Set(items.map(i => i.category_name)).size,
          totalItems: items.length,
          totalRawMaterialValue: parseFloat(totalStockValue.toFixed(2)),
          totalStockInToday: parseFloat(totalStockInToday.toFixed(2)),
          totalStockOutToday: parseFloat(totalStockOutToday.toFixed(2)),
          closingStockValue: parseFloat(totalClosingValue.toFixed(2))
        }
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
          const scale = unit === 'BAGS' ? (1 / 25) : (1000 / weight);
          details.quantity = qty * scale;
        } else {
          const secondUnit = getSecondUnit(rm.category_name);
          if (secondUnit && unit === secondUnit) {
            details.quantity = qty / factor;
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
          const scale = unit === 'BAGS' ? (1 / 25) : (1000 / weight);
          details.quantity = Math.abs(qty) * scale;
        } else {
          const secondUnit = getSecondUnit(rm.category_name);
          if (secondUnit && unit === secondUnit) {
            details.quantity = Math.abs(qty) / factor;
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
