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

// Helper: Calculate ledger row for a specific finished product dynamically on targetDate
export async function calculateDynamicRow(connection, product, targetDate) {
  // 1. Find the latest manual opening stock set by admin
  const [manualRows] = await connection.query(
    `SELECT DATE_FORMAT(ledger_date, '%Y-%m-%d') as ledger_date, quantity 
     FROM finished_goods_ledger_manual_opening 
     WHERE finished_product_id = ? AND ledger_date <= ? 
     ORDER BY ledger_date DESC LIMIT 1`,
    [product.id, targetDate]
  );

  // 2. Find the latest closed date before targetDate
  const [closedRows] = await connection.query(
    `SELECT DATE_FORMAT(ledger_date, '%Y-%m-%d') as ledger_date 
     FROM finished_goods_ledger_closings 
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
      `SELECT closing_stock FROM finished_goods_ledger_snapshots 
       WHERE finished_product_id = ? AND ledger_date = ?`,
      [product.id, dClosed]
    );
    openingStock = snapRows.length > 0 ? parseFloat(snapRows[0].closing_stock) : 0;
    startQueryDate = addDays(dClosed, 1);
  } else if (hasManual) {
    openingStock = parseFloat(manualRows[0].quantity) || 0;
    startQueryDate = manualRows[0].ledger_date;
  }

  // 3. Get transactions up to targetDate (Production IN, Loading OUT, Sales Return)
  let prodIn = 0;
  let loadOut = 0;
  let returnsTotal = 0;

  let pWhere = ['finished_product_id = ?', 'production_date <= ?'];
  let pParams = [product.id, targetDate];
  let lWhere = ['lti.finished_product_id = ?', 'ls.loading_date <= ?'];
  let lParams = [product.id, targetDate];
  let rWhere = ['sri.finished_product_id = ?', "sr.status != 'Rejected'", 'sr.return_date <= ?'];
  let rParams = [product.id, targetDate];

  if (startQueryDate) {
    pWhere.push('production_date >= ?');
    pParams.push(startQueryDate);

    lWhere.push('ls.loading_date >= ?');
    lParams.push(startQueryDate);

    rWhere.push('sr.return_date >= ?');
    rParams.push(startQueryDate);
  }

  const [pRow] = await connection.query(
    `SELECT COALESCE(SUM(production_boxes), 0) AS count FROM production_batches 
     WHERE ${pWhere.join(' AND ')}`,
    pParams
  );
  prodIn = parseFloat(pRow[0].count) || 0;

  const [lRow] = await connection.query(
    `SELECT COALESCE(SUM(lti.quantity), 0) AS count FROM loading_trip_items lti
     JOIN loading_trips lt ON lti.trip_id = lt.id
     JOIN loading_sessions ls ON lt.session_id = ls.id
     WHERE ${lWhere.join(' AND ')}`,
    lParams
  );
  loadOut = parseFloat(lRow[0].count) || 0;

  const [rRow] = await connection.query(
    `SELECT COALESCE(SUM(sri.quantity), 0) AS count FROM sales_return_items sri
     JOIN sales_returns sr ON sri.sales_return_id = sr.id
     WHERE ${rWhere.join(' AND ')}`,
    rParams
  );
  returnsTotal = parseFloat(rRow[0].count) || 0;

  const closingStock = openingStock + prodIn - loadOut + returnsTotal;

  return {
    finished_product_id: product.id,
    product_name: product.name,
    category_name: product.category_name || 'Others',
    opening_stock: parseFloat(openingStock.toFixed(2)),
    stock_in: parseFloat(prodIn.toFixed(2)),
    stock_out: parseFloat(loadOut.toFixed(2)),
    stock_return: parseFloat(returnsTotal.toFixed(2)),
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
       FROM finished_goods_ledger_closings`
    );
    const maxClosedDate = latestClosedRows[0]?.max_closed_date;

    let startDateToClose = null;

    if (maxClosedDate) {
      startDateToClose = addDays(maxClosedDate, 1);
    } else {
      // Find the earliest date with any manual opening or transaction
      const [earliestManual] = await connection.query(
        `SELECT DATE_FORMAT(MIN(ledger_date), '%Y-%m-%d') AS min_date 
         FROM finished_goods_ledger_manual_opening`
      );
      const [earliestProd] = await connection.query(
        `SELECT DATE_FORMAT(MIN(production_date), '%Y-%m-%d') AS min_date 
         FROM production_batches`
      );
      const [earliestLoad] = await connection.query(
        `SELECT DATE_FORMAT(MIN(loading_date), '%Y-%m-%d') AS min_date 
         FROM loading_sessions`
      );
      const [earliestReturn] = await connection.query(
        `SELECT DATE_FORMAT(MIN(return_date), '%Y-%m-%d') AS min_date 
         FROM sales_returns`
      );

      const candidates = [
        earliestManual[0]?.min_date,
        earliestProd[0]?.min_date,
        earliestLoad[0]?.min_date,
        earliestReturn[0]?.min_date
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
        'SELECT 1 FROM finished_goods_ledger_closings WHERE ledger_date = ?',
        [currentDate]
      );

      if (alreadyClosed.length === 0) {
        // Fetch active finished products
        const [products] = await connection.query(`
          SELECT fp.id, fp.name, fpc.name AS category_name
          FROM finished_products fp 
          LEFT JOIN finished_product_categories fpc ON fp.category_id = fpc.id 
          WHERE fp.status = 1
        `);

        await connection.beginTransaction();
        try {
          // Insert closing record
          await connection.query(
            'INSERT INTO finished_goods_ledger_closings (ledger_date, closed_by) VALUES (?, ?)',
            [currentDate, 'System (Auto)']
          );

          // Calculate snapshots and save
          for (const prod of products) {
            const calc = await calculateDynamicRow(connection, prod, currentDate);
            await connection.query(
              `INSERT INTO finished_goods_ledger_snapshots 
               (ledger_date, finished_product_id, opening_stock, stock_in, stock_out, stock_return, closing_stock)
               VALUES (?, ?, ?, ?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE
                 opening_stock = VALUES(opening_stock),
                 stock_in = VALUES(stock_in),
                 stock_out = VALUES(stock_out),
                 stock_return = VALUES(stock_return),
                 closing_stock = VALUES(closing_stock)`,
              [
                currentDate, 
                prod.id, 
                calc.opening_stock, 
                calc.stock_in, 
                calc.stock_out, 
                calc.stock_return, 
                calc.closing_stock
              ]
            );
          }

          await connection.commit();
          closedDays.push(currentDate);
          console.log(`[GoodsLedgerAutoClose] Successfully closed day: ${currentDate}`);
        } catch (dayError) {
          await connection.rollback();
          console.error(`[GoodsLedgerAutoClose] Error closing day ${currentDate}:`, dayError);
          break; // Stop loop on failure to prevent cascading errors
        }
      }

      currentDate = addDays(currentDate, 1);
    }

    return { ok: true, closedDays };
  } catch (error) {
    console.error('[GoodsLedgerAutoClose] Error in autoClosePendingDays:', error);
    return { ok: false, error: error.message };
  } finally {
    isAutoClosing = false;
    if (!externalConn) {
      connection.release();
    }
  }
}

/**
 * Starts the server-side auto-close scheduler for Finished Goods Ledger.
 * Runs immediately on startup and checks every 60 seconds for midnight date changes.
 */
export function startGoodsLedgerAutoCloseScheduler() {
  console.log('[GoodsLedgerAutoClose] Initializing background auto-closing scheduler...');

  // Catchup on startup
  autoClosePendingDays().catch(err => {
    console.error('[GoodsLedgerAutoClose] Startup catchup error:', err);
  });

  // Check periodically (every 60s)
  setInterval(() => {
    autoClosePendingDays().catch(err => {
      console.error('[GoodsLedgerAutoClose] Periodic check error:', err);
    });
  }, 60 * 1000);
}
