import pool from '../config/db.js';
import { getSecondUnit, getConversionFactor } from '../helpers/conversion.js';

// Helper: Get today's date in IST format (YYYY-MM-DD)
export function getTodayISTStr() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const istDate = new Date(now.getTime() + (330 + offset) * 60000);
  const yyyy = istDate.getFullYear();
  const mm = String(istDate.getMonth() + 1).padStart(2, '0');
  const dd = String(istDate.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Helper: Date arithmetic immune to local DST/timezone bugs
export function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().split('T')[0];
}

// Helper: Fetch transactions for raw materials
export async function getTransactions(connection, rawMaterialId, startDate, endDate) {
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
    SELECT tx.quantity, tx.transaction_type, tx.reference_id, tx.tx_date, tx.user_name
    FROM (
      SELECT 
        sr.quantity,
        sr.transaction_type,
        sr.reference_id,
        CASE 
          WHEN sr.transaction_type = 'PURCHASE' THEN COALESCE(ib.bill_date, DATE(sr.created_at))
          WHEN sr.transaction_type = 'PRODUCTION' AND sr.reference_id LIKE 'BATCH-%' THEN COALESCE(pbb.batch_date, DATE(sr.created_at))
          WHEN sr.transaction_type = 'PRODUCTION' AND sr.reference_id LIKE 'PROD-%' THEN COALESCE(pb.production_date, DATE(sr.created_at))
          WHEN sr.transaction_type = 'CORRECTION' THEN COALESCE(sc.correction_date, DATE(sr.created_at))
          ELSE DATE(sr.created_at)
        END AS tx_date,
        CASE
          WHEN sr.transaction_type = 'CORRECTION' THEN sc.created_by
          ELSE 'Admin'
        END AS user_name
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
export function aggregateTxs(txs, categoryName, subProductName, unit, factor) {
  let stock_in = 0;
  let stock_out = 0;
  const isPreform = categoryName.toLowerCase() === 'preforms';
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

// Helper: Calculate dynamic ledger row for a specific item on targetDate
export async function calculateDynamicRow(connection, rawMaterial, unit, targetDate) {
  const factor = await getConversionFactor(connection, rawMaterial);
  
  // 1. Find the latest manual opening stock set by admin
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

  let openingStock = 0;
  let startQueryDate = null;

  const hasManual = manualRows.length > 0;
  const hasClosed = closedRows.length > 0;

  if (hasClosed && (!hasManual || closedRows[0].ledger_date >= manualRows[0].ledger_date)) {
    const dClosed = closedRows[0].ledger_date;
    const [snapRows] = await connection.query(
      `SELECT closing_stock FROM raw_material_ledger_snapshots 
       WHERE raw_material_id = ? AND unit = ? AND ledger_date = ?`,
      [rawMaterial.id, unit, dClosed]
    );
    openingStock = snapRows.length > 0 ? parseFloat(snapRows[0].closing_stock) : 0;
    startQueryDate = addDays(dClosed, 1);
  } else if (hasManual) {
    openingStock = parseFloat(manualRows[0].quantity) || 0;
    startQueryDate = manualRows[0].ledger_date;
  }

  // 3. Get all transactions up to targetDate (inventory purchases & production usages)
  const txs = await getTransactions(
    connection, 
    rawMaterial.id, 
    startQueryDate, 
    targetDate
  );

  const aggregates = aggregateTxs(txs, rawMaterial.category_name, rawMaterial.sub_product_name, unit, factor);

  const stockIn = aggregates.stock_in;
  const stockOut = aggregates.stock_out;
  const closingStock = openingStock + stockIn - stockOut;

  return {
    raw_material_id: rawMaterial.id,
    sub_product_name: rawMaterial.sub_product_name,
    category_name: rawMaterial.category_name,
    unit,
    opening_stock: parseFloat(openingStock.toFixed(2)),
    stock_in: parseFloat(stockIn.toFixed(2)),
    stock_out: parseFloat(stockOut.toFixed(2)),
    closing_stock: parseFloat(closingStock.toFixed(2))
  };
}

// In-memory mutex flag to avoid parallel auto-close runs
let isAutoClosing = false;

/**
 * Automatically closes all unclosed historical days up to yesterday (IST).
 * Idempotent and thread-safe.
 */
export async function autoClosePendingDays(externalConn = null) {
  if (isAutoClosing) {
    return { ok: true, message: 'Auto-closing already in progress. Skipped.' };
  }

  isAutoClosing = true;
  const connection = externalConn || await pool.getConnection();

  try {
    const today = getTodayISTStr();

    // 1. Find the latest closed date
    const [latestClosedRows] = await connection.query(
      `SELECT DATE_FORMAT(MAX(ledger_date), '%Y-%m-%d') AS max_closed_date 
       FROM raw_material_ledger_closings`
    );
    const maxClosedDate = latestClosedRows[0]?.max_closed_date;

    let startDateToClose = null;

    if (maxClosedDate) {
      startDateToClose = addDays(maxClosedDate, 1);
    } else {
      // Find the earliest date with any manual opening or stock register transaction
      const [earliestManual] = await connection.query(
        `SELECT DATE_FORMAT(MIN(ledger_date), '%Y-%m-%d') AS min_date 
         FROM raw_material_ledger_manual_opening`
      );
      const [earliestTx] = await connection.query(
        `SELECT DATE_FORMAT(MIN(created_at), '%Y-%m-%d') AS min_date 
         FROM stock_register WHERE item_type = 'RAW_MATERIAL'`
      );

      const candidates = [
        earliestManual[0]?.min_date,
        earliestTx[0]?.min_date
      ].filter(Boolean);

      if (candidates.length > 0) {
        candidates.sort();
        startDateToClose = candidates[0];
      } else {
        // No prior transactions/openings at all; nothing before today needs closing
        startDateToClose = today;
      }
    }

    const closedDays = [];

    // Iterate through all days strictly prior to today
    let currentDate = startDateToClose;
    while (currentDate < today) {
      // Check if this day is already closed (double check)
      const [alreadyClosed] = await connection.query(
        'SELECT 1 FROM raw_material_ledger_closings WHERE ledger_date = ?',
        [currentDate]
      );

      if (alreadyClosed.length === 0) {
        // Fetch active raw materials
        const [materials] = await connection.query(`
          SELECT rm.id, rm.sub_product_name, rm.unit, rmc.name AS category_name
          FROM raw_materials rm 
          JOIN raw_material_categories rmc ON rm.category_id = rmc.id 
          WHERE rm.status = 1
        `);

        await connection.beginTransaction();
        try {
          // Insert closing record
          await connection.query(
            'INSERT INTO raw_material_ledger_closings (ledger_date, closed_by) VALUES (?, ?)',
            [currentDate, 'System (Auto)']
          );

          // Calculate snapshots and save
          for (const rm of materials) {
            const isPreforms = rm.category_name.toLowerCase() === 'preforms';
            const secondUnit = getSecondUnit(rm.category_name);
            const unitsToSave = isPreforms 
              ? ['BAGS', 'PCS'] 
              : (secondUnit ? [...new Set([secondUnit, rm.unit])] : [rm.unit]);

            for (const unit of unitsToSave) {
              const calc = await calculateDynamicRow(connection, rm, unit, currentDate);
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
                  currentDate, 
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
          closedDays.push(currentDate);
          console.log(`[RawMaterialAutoClose] Successfully closed day: ${currentDate}`);
        } catch (dayError) {
          await connection.rollback();
          console.error(`[RawMaterialAutoClose] Error closing day ${currentDate}:`, dayError);
          break; // Stop loop on failure to prevent cascading errors
        }
      }

      currentDate = addDays(currentDate, 1);
    }

    return { ok: true, closedDays };
  } catch (error) {
    console.error('[RawMaterialAutoClose] Error in autoClosePendingDays:', error);
    return { ok: false, error: error.message };
  } finally {
    isAutoClosing = false;
    if (!externalConn) {
      connection.release();
    }
  }
}

/**
 * Starts the server-side auto-close scheduler.
 * Runs immediately on startup and checks every 60 seconds for midnight date changes.
 */
export function startRawMaterialAutoCloseScheduler() {
  console.log('[RawMaterialAutoClose] Initializing background auto-closing scheduler...');

  // Catchup on startup
  autoClosePendingDays().catch(err => {
    console.error('[RawMaterialAutoClose] Startup catchup error:', err);
  });

  // Check periodically (every 60s)
  setInterval(() => {
    autoClosePendingDays().catch(err => {
      console.error('[RawMaterialAutoClose] Periodic check error:', err);
    });
  }, 60 * 1000);
}
