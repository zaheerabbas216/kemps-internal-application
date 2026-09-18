import pool from '../config/db.js';

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

/**
 * Helper: Calculate ledger row for a specific tool/spare part dynamically on targetDate.
 */
export async function calculateDynamicRow(connection, productName, targetDate) {
  // 1. Find latest manual opening stock set before or on targetDate
  const [manualRows] = await connection.query(
    `SELECT DATE_FORMAT(ledger_date, '%Y-%m-%d') as ledger_date, quantity 
     FROM tools_inventory_manual_opening 
     WHERE product_name = ? AND ledger_date <= ? 
     ORDER BY ledger_date DESC LIMIT 1`,
    [productName, targetDate]
  );

  // 2. Find latest closed date before targetDate
  const [closedRows] = await connection.query(
    `SELECT DATE_FORMAT(ledger_date, '%Y-%m-%d') as ledger_date 
     FROM tools_inventory_ledger_closings 
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
      `SELECT closing_stock FROM tools_inventory_ledger_snapshots 
       WHERE product_name = ? AND ledger_date = ?`,
      [productName, dClosed]
    );
    openingStock = snapRows.length > 0 ? parseFloat(snapRows[0].closing_stock) : 0;
    startQueryDate = addDays(dClosed, 1);
  } else if (hasManual) {
    openingStock = parseFloat(manualRows[0].quantity) || 0;
    startQueryDate = manualRows[0].ledger_date;
  }

  // 3. Transactions between startQueryDate and targetDate
  let inWhere = ['product_name = ?', "transaction_type = 'STOCK_IN'", 'transaction_date <= ?'];
  let inParams = [productName, targetDate];

  let outWhere = ['product_name = ?', "transaction_type = 'STOCK_OUT'", 'transaction_date <= ?'];
  let outParams = [productName, targetDate];

  if (startQueryDate) {
    inWhere.push('transaction_date >= ?');
    inParams.push(startQueryDate);

    outWhere.push('transaction_date >= ?');
    outParams.push(startQueryDate);
  }

  const [inRow] = await connection.query(
    `SELECT COALESCE(SUM(quantity), 0) AS count FROM tools_inventory_transactions 
     WHERE ${inWhere.join(' AND ')}`,
    inParams
  );
  const stockIn = parseFloat(inRow[0]?.count || 0);

  const [outRow] = await connection.query(
    `SELECT COALESCE(SUM(quantity), 0) AS count FROM tools_inventory_transactions 
     WHERE ${outWhere.join(' AND ')}`,
    outParams
  );
  const stockOut = parseFloat(outRow[0]?.count || 0);

  const closingStock = openingStock + stockIn - stockOut;

  // Fetch recent machine / company info for reference
  const [metaRow] = await connection.query(
    `SELECT machine_name, company_name, unit 
     FROM tools_inventory_transactions 
     WHERE product_name = ? 
     ORDER BY transaction_date DESC, id DESC LIMIT 1`,
    [productName]
  );

  return {
    product_name: productName,
    machine_name: metaRow[0]?.machine_name || '—',
    company_name: metaRow[0]?.company_name || '—',
    unit: metaRow[0]?.unit || 'PCS',
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

    // 1. Find latest closed date
    const [latestClosedRows] = await connection.query(
      `SELECT DATE_FORMAT(MAX(ledger_date), '%Y-%m-%d') AS max_closed_date 
       FROM tools_inventory_ledger_closings`
    );
    const maxClosedDate = latestClosedRows[0]?.max_closed_date;

    let startDateToClose = null;

    if (maxClosedDate) {
      startDateToClose = addDays(maxClosedDate, 1);
    } else {
      // Earliest transaction or manual opening
      const [earliestManual] = await connection.query(
        `SELECT DATE_FORMAT(MIN(ledger_date), '%Y-%m-%d') AS min_date 
         FROM tools_inventory_manual_opening`
      );
      const [earliestTxn] = await connection.query(
        `SELECT DATE_FORMAT(MIN(transaction_date), '%Y-%m-%d') AS min_date 
         FROM tools_inventory_transactions`
      );

      const candidates = [
        earliestManual[0]?.min_date,
        earliestTxn[0]?.min_date
      ].filter(Boolean);

      if (candidates.length > 0) {
        candidates.sort();
        startDateToClose = candidates[0];
      } else {
        startDateToClose = today;
      }
    }

    const closedDays = [];

    // Iterate through all days strictly prior to today
    let currentDate = startDateToClose;
    while (currentDate < today) {
      const [alreadyClosed] = await connection.query(
        'SELECT 1 FROM tools_inventory_ledger_closings WHERE ledger_date = ?',
        [currentDate]
      );

      if (alreadyClosed.length === 0) {
        // Fetch all distinct product names known up to currentDate
        const [products] = await connection.query(`
          SELECT DISTINCT product_name FROM (
            SELECT product_name FROM tools_inventory_transactions WHERE transaction_date <= ?
            UNION
            SELECT product_name FROM tools_inventory_manual_opening WHERE ledger_date <= ?
          ) combined
        `, [currentDate, currentDate]);

        await connection.beginTransaction();
        try {
          await connection.query(
            'INSERT INTO tools_inventory_ledger_closings (ledger_date, closed_by) VALUES (?, ?)',
            [currentDate, 'System (Auto)']
          );

          for (const p of products) {
            const calc = await calculateDynamicRow(connection, p.product_name, currentDate);
            await connection.query(
              `INSERT INTO tools_inventory_ledger_snapshots 
               (ledger_date, product_name, opening_stock, stock_in, stock_out, closing_stock)
               VALUES (?, ?, ?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE
                 opening_stock = VALUES(opening_stock),
                 stock_in = VALUES(stock_in),
                 stock_out = VALUES(stock_out),
                 closing_stock = VALUES(closing_stock)`,
              [
                currentDate,
                p.product_name,
                calc.opening_stock,
                calc.stock_in,
                calc.stock_out,
                calc.closing_stock
              ]
            );
          }

          await connection.commit();
          closedDays.push(currentDate);
        } catch (dayError) {
          await connection.rollback();
          console.error(`[ToolsInventoryAutoClose] Error closing day ${currentDate}:`, dayError);
          break;
        }
      }

      currentDate = addDays(currentDate, 1);
    }

    return { ok: true, closedDays };
  } catch (error) {
    console.error('[ToolsInventoryAutoClose] Auto-close failed:', error);
    return { ok: false, error: error.message };
  } finally {
    isAutoClosing = false;
    if (!externalConn) {
      connection.release();
    }
  }
}
