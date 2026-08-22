import express from 'express';
import pool from '../config/db.js';
import { getSecondUnit, getConversionFactor } from '../helpers/conversion.js';

const router = express.Router();

// Helper to normalize product names for comparison
function normalizeName(name) {
  return String(name || '').toLowerCase().replace(/[\s\-_]/g, '').replace('ltr', 'l');
}

// Helper: Fetch transactions for raw materials
async function getTransactions(connection, rawMaterialId, startDate, endDate) {
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
          WHEN sr.transaction_type = 'CORRECTION' THEN sc.correction_date
          ELSE DATE(sr.created_at)
        END AS tx_date
      FROM stock_register sr
      LEFT JOIN inventory_bills ib ON sr.transaction_type = 'PURCHASE' AND sr.reference_id = ib.id
      LEFT JOIN pet_bottle_batches pbb ON sr.transaction_type = 'PRODUCTION' AND sr.reference_id = pbb.id
      LEFT JOIN production_batches pb ON sr.transaction_type = 'PRODUCTION' AND sr.reference_id = pb.id
      LEFT JOIN stock_corrections sc ON sr.transaction_type = 'CORRECTION' AND sr.reference_id = sc.id
      WHERE sr.item_type = 'RAW_MATERIAL' AND sr.item_id = ?
    ) tx
    WHERE 1=1 ${dateFilter}
  `;

  const [txRows] = await connection.query(txQuery, params);
  return [...txRows];
}

// Helper: Aggregate transactions into stock_in and stock_out
function aggregateTxs(txs, categoryName, subProductName, unit, factor) {
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
    } else {
      // General case for split categories
      const secondUnit = getSecondUnit(categoryName);
      if (secondUnit && unit === secondUnit) {
        qty = qty / factor;
      }
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
  const factor = await getConversionFactor(connection, rawMaterial);
  
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
      startQueryDate = dManual;
    } else {
      checkpointDate = dClosed;
      const [snapRows] = await connection.query(
        `SELECT closing_stock FROM raw_material_ledger_snapshots 
         WHERE raw_material_id = ? AND unit = ? AND ledger_date = ?`,
        [rawMaterial.id, unit, dClosed]
      );
      checkpointStock = snapRows.length > 0 ? parseFloat(snapRows[0].closing_stock) : 0;
      
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

  let openingStock = checkpointStock;
  const yesterday = new Date(targetDate);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  if (!startQueryDate || startQueryDate <= yesterdayStr) {
    const priorTxs = await getTransactions(
      connection, 
      rawMaterial.id, 
      startQueryDate, 
      yesterdayStr
    );
    const aggregates = aggregateTxs(priorTxs, rawMaterial.category_name, rawMaterial.sub_product_name, unit, factor);
    openingStock = checkpointStock + aggregates.stock_in - aggregates.stock_out;
  }

  const todayTxs = await getTransactions(
    connection, 
    rawMaterial.id, 
    targetDate, 
    targetDate
  );
  const todayAgg = aggregateTxs(todayTxs, rawMaterial.category_name, rawMaterial.sub_product_name, unit, factor);

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

// Helper to generate custom sequence ID
async function generateId(prefix, table, idColumn) {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const istDate = new Date(now.getTime() + (330 + offset) * 60000);
  const yyyy = istDate.getFullYear();
  
  const [rows] = await pool.query(
    `SELECT ${idColumn} FROM ${table} WHERE ${idColumn} LIKE ? ORDER BY ${idColumn} DESC LIMIT 1`,
    [`${prefix}-${yyyy}-%`]
  );
  
  let seq = 1;
  if (rows.length) {
    const lastId = rows[0][idColumn];
    const match = lastId.match(new RegExp(`^${prefix}-${yyyy}-(\\d+)$`));
    if (match && match[1]) {
      seq = parseInt(match[1]) + 1;
    }
  }
  
  return `${prefix}-${yyyy}-${String(seq).padStart(5, '0')}`;
}

// GET /api/stock-corrections/available-stock
// Fetch the current available ledger stock on a date for a raw material
router.get('/available-stock', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { date, rawMaterialId } = req.query;
    if (!date) throw new Error('Date is required.');
    if (!rawMaterialId) throw new Error('Raw material ID is required.');

    // Fetch raw material details
    const [rmRows] = await connection.query(
      `SELECT rm.id, rm.sub_product_name, rm.unit, rmc.name AS category_name
       FROM raw_materials rm
       JOIN raw_material_categories rmc ON rm.category_id = rmc.id
       WHERE rm.id = ?`,
      [rawMaterialId]
    );

    if (rmRows.length === 0) {
      throw new Error('Raw material not found.');
    }
    const rm = rmRows[0];
    const secondUnit = getSecondUnit(rm.category_name);

    let openingStock = 0;
    let openingBagsBox = 0;
    let unit = rm.unit;

    if (rm.category_name.toLowerCase() === 'preforms') {
      // Fetch PCS and BAGS ledger closing stock
      const bagsRow = await calculateDynamicRow(connection, rm, 'BAGS', date);
      const pcsRow = await calculateDynamicRow(connection, rm, 'PCS', date);
      openingStock = pcsRow.closing_stock;
      openingBagsBox = bagsRow.closing_stock;
      unit = 'PCS';
    } else if (secondUnit && secondUnit !== rm.unit) {
      // Fetch main unit and second unit closing stock
      const mainRow = await calculateDynamicRow(connection, rm, rm.unit, date);
      const secondRow = await calculateDynamicRow(connection, rm, secondUnit, date);
      openingStock = mainRow.closing_stock;
      openingBagsBox = secondRow.closing_stock;
      unit = rm.unit;
    } else {
      // General raw material
      const row = await calculateDynamicRow(connection, rm, rm.unit, date);
      openingStock = row.closing_stock;
      openingBagsBox = 0;
      unit = rm.unit;
    }

    const conversionFactor = await getConversionFactor(connection, rm);

    res.json({
      ok: true,
      openingStock,
      openingBagsBox,
      conversionFactor,
      unit
    });

  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  } finally {
    connection.release();
  }
});

// POST /api/stock-corrections
// Save a stock correction
router.post('/', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const {
      correctionDate,
      rawMaterialId,
      openingStock,
      openingBagsBox,
      physicalStock,
      physicalBagsBox,
      differenceQty,
      remarks
    } = req.body;

    if (!correctionDate) throw new Error('Correction Date is required.');
    if (!rawMaterialId) throw new Error('Product is required.');
    if (physicalStock === undefined || physicalStock === null || physicalStock === '') {
      throw new Error('Physical stock is required.');
    }
    if (!remarks || !remarks.trim()) throw new Error('Remarks are required.');

    // Check if the day is closed in raw_material_ledger_closings
    const [closed] = await connection.query(
      'SELECT 1 FROM raw_material_ledger_closings WHERE ledger_date = ?',
      [correctionDate]
    );
    if (closed.length > 0) {
      throw new Error('Cannot save stock correction for a closed day.');
    }

    await connection.beginTransaction();

    // Fetch raw material details
    const [rmRows] = await connection.query(
      `SELECT rm.id, rm.sub_product_name, rm.unit, rmc.name AS category_name
       FROM raw_materials rm
       JOIN raw_material_categories rmc ON rm.category_id = rmc.id
       WHERE rm.id = ?`,
      [rawMaterialId]
    );
    if (rmRows.length === 0) throw new Error('Raw material not found.');
    const rm = rmRows[0];
    const isPreforms = rm.category_name.toLowerCase() === 'preforms';

    // Generate Correction ID
    const correctionId = await generateId('CORR', 'stock_corrections', 'id');
    const createdBy = req.admin?.name || req.admin?.username || 'Admin';

    const parsedDiff = parseFloat(differenceQty);
    const adjustmentType = parsedDiff < 0 ? 'WASTAGE' : 'EXCESS';

    // 1. Insert into stock_corrections table
    await connection.query(
      `INSERT INTO stock_corrections 
       (id, correction_date, raw_material_id, opening_stock, opening_bags_box, physical_stock, physical_bags_box, difference_qty, adjustment_type, remarks, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        correctionId,
        correctionDate,
        rawMaterialId,
        parseFloat(openingStock) || 0,
        parseFloat(openingBagsBox) || 0,
        parseFloat(physicalStock) || 0,
        parseFloat(physicalBagsBox) || 0,
        parsedDiff,
        adjustmentType,
        remarks.trim(),
        createdBy
      ]
    );

    // 2. Insert into stock_register
    let registerQty = parsedDiff;
    if (isPreforms) {
      const weight = parseFloat(rm.sub_product_name) || 0;
      if (weight <= 0) throw new Error('Invalid Preform weight in product master.');
      // Converted to KG: pieces * weight / 1000
      registerQty = (parsedDiff * weight) / 1000;
    }

    await connection.query(
      `INSERT INTO stock_register (item_type, item_id, transaction_type, reference_id, quantity, created_at)
       VALUES ('RAW_MATERIAL', ?, 'CORRECTION', ?, ?, NOW())`,
      [rawMaterialId, correctionId, registerQty]
    );

    await connection.commit();
    res.json({ ok: true, id: correctionId, message: 'Stock correction transaction saved successfully!' });

  } catch (error) {
    await connection.rollback();
    res.status(400).json({ ok: false, error: error.message });
  } finally {
    connection.release();
  }
});

// GET /api/stock-corrections/history
// Get all stock corrections with filters
router.get('/history', async (req, res) => {
  try {
    const { date, categoryId, rawMaterialId } = req.query;

    let queryParams = [];
    let whereClauses = [];

    if (date) {
      whereClauses.push('sc.correction_date = ?');
      queryParams.push(date);
    }
    if (categoryId) {
      whereClauses.push('rm.category_id = ?');
      queryParams.push(categoryId);
    }
    if (rawMaterialId) {
      whereClauses.push('sc.raw_material_id = ?');
      queryParams.push(rawMaterialId);
    }

    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const [rows] = await pool.query(
      `SELECT 
        sc.id,
        DATE_FORMAT(sc.correction_date, '%Y-%m-%d') as correction_date,
        sc.raw_material_id,
        rm.sub_product_name,
        rmc.name AS category_name,
        sc.opening_stock,
        sc.opening_bags_box,
        sc.physical_stock,
        sc.physical_bags_box,
        sc.difference_qty,
        sc.adjustment_type,
        sc.remarks,
        sc.created_by,
        DATE_FORMAT(sc.created_at, '%Y-%m-%d %H:%i:%S') as formatted_created_at
      FROM stock_corrections sc
      JOIN raw_materials rm ON sc.raw_material_id = rm.id
      JOIN raw_material_categories rmc ON rm.category_id = rmc.id
      ${whereStr}
      ORDER BY sc.correction_date DESC, sc.created_at DESC, sc.id DESC`,
      queryParams
    );

    const parsedRows = rows.map(row => ({
      ...row,
      opening_stock: parseFloat(row.opening_stock),
      opening_bags_box: parseFloat(row.opening_bags_box),
      physical_stock: parseFloat(row.physical_stock),
      physical_bags_box: parseFloat(row.physical_bags_box),
      difference_qty: parseFloat(row.difference_qty)
    }));

    res.json({ ok: true, corrections: parsedRows });

  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

export default router;
