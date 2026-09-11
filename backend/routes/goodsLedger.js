import express from 'express';
import pool from '../config/db.js';
import authMiddleware from '../middleware/auth.js';
import {
  autoClosePendingDays,
  calculateDynamicRow,
  getTodayISTStr,
  addDays
} from '../services/goodsLedgerAutoCloseService.js';

const router = express.Router();

// GET /api/goods-ledger/day
// Fetches opening, IN, OUT, closing for finished products on selected date
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
       FROM finished_goods_ledger_closings WHERE ledger_date = ?`,
      [date]
    );

    const isClosed = closedRows.length > 0;
    let ledgerItems = [];

    if (isClosed) {
      // Read directly from snapshots
      const [snapRows] = await connection.query(
        `SELECT 
           fgs.finished_product_id, 
           fgs.opening_stock, 
           fgs.stock_in, 
           fgs.stock_out, 
           fgs.stock_return,
           fgs.closing_stock,
           fp.name AS product_name, 
           fpc.name AS category_name
         FROM finished_goods_ledger_snapshots fgs 
         JOIN finished_products fp ON fgs.finished_product_id = fp.id 
         LEFT JOIN finished_product_categories fpc ON fp.category_id = fpc.id 
         WHERE fgs.ledger_date = ?`,
        [date]
      );
      ledgerItems = snapRows.map(row => ({
        finished_product_id: row.finished_product_id,
        product_name: row.product_name,
        category_name: row.category_name || 'Others',
        opening_stock: parseFloat(row.opening_stock),
        stock_in: parseFloat(row.stock_in),
        stock_out: parseFloat(row.stock_out),
        stock_return: parseFloat(row.stock_return || 0),
        closing_stock: parseFloat(row.closing_stock)
      }));
    } else {
      // Calculate dynamically
      const [products] = await connection.query(`
        SELECT fp.id, fp.name, fpc.name AS category_name
        FROM finished_products fp 
        LEFT JOIN finished_product_categories fpc ON fp.category_id = fpc.id 
        WHERE fp.status = 1
      `);

      for (const prod of products) {
        const row = await calculateDynamicRow(connection, prod, date);
        ledgerItems.push(row);
      }
    }

    // Compute Dashboard Summary values
    let totalStockInToday = 0;
    let totalStockOutToday = 0;
    let totalStockReturnToday = 0;
    let totalClosingStock = 0;

    ledgerItems.forEach(item => {
      totalStockInToday += item.stock_in;
      totalStockOutToday += item.stock_out;
      totalStockReturnToday += item.stock_return || 0;
      totalClosingStock += item.closing_stock;
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
        totalProducts: ledgerItems.length,
        totalStockInToday: parseFloat(totalStockInToday.toFixed(2)),
        totalStockOutToday: parseFloat(totalStockOutToday.toFixed(2)),
        totalStockReturnToday: parseFloat(totalStockReturnToday.toFixed(2)),
        totalClosingStock: parseFloat(totalClosingStock.toFixed(2))
      }
    });

  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  } finally {
    connection.release();
  }
});

// GET /api/goods-ledger/history
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
      `SELECT COUNT(*) as totalCount FROM finished_goods_ledger_closings c ${whereClause}`,
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
       FROM finished_goods_ledger_closings c
       ${whereClause}
       ORDER BY c.ledger_date DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const history = [];

    for (const day of closedDays) {
      let itemQuery = `
        SELECT 
          fgs.finished_product_id, 
          fgs.opening_stock, 
          fgs.stock_in, 
          fgs.stock_out, 
          fgs.stock_return,
          fgs.closing_stock,
          fp.name AS product_name, 
          fpc.name AS category_name
        FROM finished_goods_ledger_snapshots fgs 
        JOIN finished_products fp ON fgs.finished_product_id = fp.id 
        LEFT JOIN finished_product_categories fpc ON fp.category_id = fpc.id 
        WHERE fgs.ledger_date = ?
      `;
      const itemParams = [day.ledger_date];

      if (search) {
        itemQuery += ' AND (fp.name LIKE ? OR fpc.name LIKE ?)';
        itemParams.push(`%${search}%`, `%${search}%`);
      }

      const [snapRows] = await connection.query(itemQuery, itemParams);

      const items = snapRows.map(row => ({
        finished_product_id: row.finished_product_id,
        product_name: row.product_name,
        category_name: row.category_name || 'Others',
        opening_stock: parseFloat(row.opening_stock),
        stock_in: parseFloat(row.stock_in),
        stock_out: parseFloat(row.stock_out),
        stock_return: parseFloat(row.stock_return || 0),
        closing_stock: parseFloat(row.closing_stock)
      }));

      // Calculate summary for this closed day
      let totalStockInToday = 0;
      let totalStockOutToday = 0;
      let totalStockReturnToday = 0;
      let totalClosingStock = 0;

      items.forEach(item => {
        totalStockInToday += item.stock_in;
        totalStockOutToday += item.stock_out;
        totalStockReturnToday += item.stock_return || 0;
        totalClosingStock += item.closing_stock;
      });

      history.push({
        ledger_date: day.ledger_date,
        closed_by: day.closed_by,
        closed_at: day.closed_at,
        items,
        summary: {
          totalCategories: new Set(items.map(i => i.category_name)).size,
          totalProducts: items.length,
          totalStockInToday: parseFloat(totalStockInToday.toFixed(2)),
          totalStockOutToday: parseFloat(totalStockOutToday.toFixed(2)),
          totalStockReturnToday: parseFloat(totalStockReturnToday.toFixed(2)),
          totalClosingStock: parseFloat(totalClosingStock.toFixed(2))
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

// POST /api/goods-ledger/set-opening
// Sets manual opening stock overrides in bulk
router.post('/set-opening', authMiddleware, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { date, items } = req.body;
    if (!date) {
      throw new Error('Date is required.');
    }

    // Verify day is not closed
    const [closed] = await connection.query(
      'SELECT 1 FROM finished_goods_ledger_closings WHERE ledger_date = ?',
      [date]
    );
    if (closed.length > 0) {
      throw new Error('Cannot set opening stock for a closed day.');
    }

    await connection.beginTransaction();

    const itemsToProcess = items || [];

    for (const item of itemsToProcess) {
      const { productId, quantity } = item;
      const parsedQty = parseFloat(quantity);
      if (isNaN(parsedQty)) continue;

      // UPSERT manual opening
      await connection.query(
        `INSERT INTO finished_goods_ledger_manual_opening (ledger_date, finished_product_id, quantity)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE quantity = VALUES(quantity)`,
        [date, parseInt(productId, 10), parsedQty]
      );
    }

    await connection.commit();
    res.json({ ok: true, message: 'Opening stocks updated successfully!' });
  } catch (error) {
    await connection.rollback();
    res.status(400).json({ ok: false, error: error.message });
  } finally {
    connection.release();
  }
});

// POST /api/goods-ledger/close
// Closes finished goods ledger for selected date and snapshots records
router.post('/close', authMiddleware, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { date } = req.body;
    if (!date) throw new Error('Date is required.');

    const closedBy = req.admin?.name || req.admin?.username || 'Admin';

    // Verify day is not already closed
    const [closed] = await connection.query(
      'SELECT 1 FROM finished_goods_ledger_closings WHERE ledger_date = ?',
      [date]
    );
    if (closed.length > 0) {
      throw new Error('This day is already closed.');
    }

    await connection.beginTransaction();

    // 1. Log day closing
    await connection.query(
      'INSERT INTO finished_goods_ledger_closings (ledger_date, closed_by) VALUES (?, ?)',
      [date, closedBy]
    );

    // 2. Fetch all products and calculate their current balances to snapshot
    const [products] = await connection.query(`
      SELECT fp.id, fp.name, fpc.name AS category_name
      FROM finished_products fp 
      LEFT JOIN finished_product_categories fpc ON fp.category_id = fpc.id 
      WHERE fp.status = 1
    `);

    for (const prod of products) {
      const calculated = await calculateDynamicRow(connection, prod, date);
      
      await connection.query(
        `INSERT INTO finished_goods_ledger_snapshots 
           (ledger_date, finished_product_id, opening_stock, stock_in, stock_out, stock_return, closing_stock)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          date,
          calculated.finished_product_id,
          calculated.opening_stock,
          calculated.stock_in,
          calculated.stock_out,
          calculated.stock_return,
          calculated.closing_stock
        ]
      );
    }

    await connection.commit();
    res.json({ ok: true, message: 'Finished goods ledger closed successfully for this date.' });
  } catch (error) {
    await connection.rollback();
    res.status(400).json({ ok: false, error: error.message });
  } finally {
    connection.release();
  }
});

// GET /api/goods-ledger/drilldown
// Fetches the transaction history contributing to a ledger cell (Opening, IN, OUT, Closing)
router.get('/drilldown', authMiddleware, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { date, finishedProductId, type } = req.query;
    if (!date) throw new Error('Date is required.');
    if (!finishedProductId) throw new Error('Finished Product ID is required.');
    if (!type) throw new Error('Movement type is required.');

    // Fetch product details
    const [pRows] = await connection.query(
      `SELECT fp.name, fpc.name AS category_name FROM finished_products fp 
       LEFT JOIN finished_product_categories fpc ON fp.category_id = fpc.id 
       WHERE fp.id = ?`,
      [parseInt(finishedProductId, 10)]
    );
    if (pRows.length === 0) throw new Error('Product not found.');
    const product = { id: parseInt(finishedProductId, 10), name: pRows[0].name, category_name: pRows[0].category_name };

    let transactions = [];

    // Helper: Query production transactions
    const getProductionTxs = async (start, end) => {
      const [rows] = await connection.query(
        `SELECT id, production_date, production_boxes FROM production_batches 
         WHERE finished_product_id = ? AND production_date BETWEEN ? AND ?`,
        [product.id, start, end]
      );
      return rows.map(r => ({
        date: r.production_date,
        reference: r.id,
        product: product.name,
        quantity: parseFloat(r.production_boxes) || 0,
        user: 'Admin',
        source: 'Finished Goods Production',
        type: 'Stock IN'
      }));
    };

    const getProductionTxsBefore = async (yesterdayStr) => {
      const [rows] = await connection.query(
        `SELECT id, production_date, production_boxes FROM production_batches 
         WHERE finished_product_id = ? AND production_date <= ?`,
        [product.id, yesterdayStr]
      );
      return rows.map(r => ({
        date: r.production_date,
        reference: r.id,
        product: product.name,
        quantity: parseFloat(r.production_boxes) || 0,
        user: 'Admin',
        source: 'Finished Goods Production',
        type: 'Stock IN'
      }));
    };

    // Helper: Query loading transactions
    const getLoadingTxs = async (start, end) => {
      const [rows] = await connection.query(
        `SELECT lt.id, ls.loading_date, lti.quantity AS count 
         FROM loading_trip_items lti
         JOIN loading_trips lt ON lti.trip_id = lt.id
         JOIN loading_sessions ls ON lt.session_id = ls.id
         WHERE lti.finished_product_id = ? AND ls.loading_date BETWEEN ? AND ?`,
        [product.id, start, end]
      );
      return rows.filter(r => (parseFloat(r.count) || 0) !== 0).map(r => ({
        date: r.loading_date,
        reference: r.id,
        product: product.name,
        quantity: Math.abs(parseFloat(r.count) || 0),
        user: 'Admin',
        source: 'Loading Entry',
        type: 'Stock OUT'
      }));
    };

    const getLoadingTxsBefore = async (yesterdayStr) => {
      const [rows] = await connection.query(
        `SELECT lt.id, ls.loading_date, lti.quantity AS count 
         FROM loading_trip_items lti
         JOIN loading_trips lt ON lti.trip_id = lt.id
         JOIN loading_sessions ls ON lt.session_id = ls.id
         WHERE lti.finished_product_id = ? AND ls.loading_date <= ?`,
        [product.id, yesterdayStr]
      );
      return rows.filter(r => (parseFloat(r.count) || 0) !== 0).map(r => ({
        date: r.loading_date,
        reference: r.id,
        product: product.name,
        quantity: Math.abs(parseFloat(r.count) || 0),
        user: 'Admin',
        source: 'Loading Entry',
        type: 'Stock OUT'
      }));
    };

    // Helper: Query return transactions
    const getReturnTxs = async (start, end) => {
      const [rows] = await connection.query(
        `SELECT sr.id, sr.return_date, sri.quantity AS count, sr.created_by
         FROM sales_return_items sri
         JOIN sales_returns sr ON sri.sales_return_id = sr.id
         WHERE sri.finished_product_id = ? AND sr.status != 'Rejected' AND sr.return_date BETWEEN ? AND ?`,
        [product.id, start, end]
      );
      return rows.filter(r => (parseFloat(r.count) || 0) !== 0).map(r => ({
        date: r.return_date,
        reference: r.id,
        product: product.name,
        quantity: parseFloat(r.count) || 0,
        user: r.created_by || 'Admin',
        source: 'Sales Return',
        type: 'Stock RETURN'
      }));
    };

    const getReturnTxsBefore = async (yesterdayStr) => {
      const [rows] = await connection.query(
        `SELECT sr.id, sr.return_date, sri.quantity AS count, sr.created_by
         FROM sales_return_items sri
         JOIN sales_returns sr ON sri.sales_return_id = sr.id
         WHERE sri.finished_product_id = ? AND sr.status != 'Rejected' AND sr.return_date <= ?`,
        [product.id, yesterdayStr]
      );
      return rows.filter(r => (parseFloat(r.count) || 0) !== 0).map(r => ({
        date: r.return_date,
        reference: r.id,
        product: product.name,
        quantity: parseFloat(r.count) || 0,
        user: r.created_by || 'Admin',
        source: 'Sales Return',
        type: 'Stock RETURN'
      }));
    };

    if (type === 'IN') {
      transactions = await getProductionTxs(date, date);
    } else if (type === 'OUT') {
      transactions = await getLoadingTxs(date, date);
    } else if (type === 'RETURN') {
      transactions = await getReturnTxs(date, date);
    } else if (type === 'OPENING') {
      // Find manual opening or nearest closed day and list all transactions up to yesterday
      const [manualRows] = await connection.query(
        `SELECT DATE_FORMAT(ledger_date, '%Y-%m-%d') as ledger_date, quantity 
         FROM finished_goods_ledger_manual_opening 
         WHERE finished_product_id = ? AND ledger_date <= ? 
         ORDER BY ledger_date DESC LIMIT 1`,
        [product.id, date]
      );

      const [closedRows] = await connection.query(
        `SELECT DATE_FORMAT(ledger_date, '%Y-%m-%d') as ledger_date 
         FROM finished_goods_ledger_closings 
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
            `SELECT closing_stock FROM finished_goods_ledger_snapshots 
             WHERE finished_product_id = ? AND ledger_date = ?`,
            [product.id, dClosed]
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
          `SELECT closing_stock FROM finished_goods_ledger_snapshots 
           WHERE finished_product_id = ? AND ledger_date = ?`,
          [product.id, checkpointDate]
        );
        checkpointStock = snapRows.length > 0 ? parseFloat(snapRows[0].closing_stock) : 0;
        startQueryDate = addDays(checkpointDate, 1);
        checkpointDesc = `Closed day closing stock snapshot on ${checkpointDate}`;
      } else {
        checkpointDesc = 'Initial opening stock';
      }

      transactions.push({
        date: checkpointDate || 'Beginning',
        reference: '-',
        product: product.name,
        quantity: checkpointStock,
        user: 'System',
        source: checkpointDesc,
        type: 'Opening Baseline'
      });

      const yesterdayStr = addDays(date, -1);

      if (!startQueryDate || startQueryDate <= yesterdayStr) {
        const priorProd = startQueryDate 
          ? await getProductionTxs(startQueryDate, yesterdayStr)
          : await getProductionTxsBefore(yesterdayStr);
        
        const priorLoad = startQueryDate
          ? await getLoadingTxs(startQueryDate, yesterdayStr)
          : await getLoadingTxsBefore(yesterdayStr);

        const priorReturn = startQueryDate
          ? await getReturnTxs(startQueryDate, yesterdayStr)
          : await getReturnTxsBefore(yesterdayStr);

        transactions = transactions.concat(priorProd).concat(priorLoad).concat(priorReturn);
      }
    } else if (type === 'CLOSING') {
      // Closing = Opening + IN + OUT + RETURN
      // Get opening list
      const [manualRows] = await connection.query(
        `SELECT DATE_FORMAT(ledger_date, '%Y-%m-%d') as ledger_date, quantity 
         FROM finished_goods_ledger_manual_opening 
         WHERE finished_product_id = ? AND ledger_date <= ? 
         ORDER BY ledger_date DESC LIMIT 1`,
        [product.id, date]
      );

      const [closedRows] = await connection.query(
        `SELECT DATE_FORMAT(ledger_date, '%Y-%m-%d') as ledger_date 
         FROM finished_goods_ledger_closings 
         WHERE ledger_date < ? 
         ORDER BY ledger_date DESC LIMIT 1`,
        [product.id, date]
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
            `SELECT closing_stock FROM finished_goods_ledger_snapshots 
             WHERE finished_product_id = ? AND ledger_date = ?`,
            [product.id, dClosed]
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
          `SELECT closing_stock FROM finished_goods_ledger_snapshots 
           WHERE finished_product_id = ? AND ledger_date = ?`,
          [product.id, checkpointDate]
        );
        checkpointStock = snapRows.length > 0 ? parseFloat(snapRows[0].closing_stock) : 0;
        startQueryDate = addDays(checkpointDate, 1);
        checkpointDesc = `Closed day closing stock snapshot on ${checkpointDate}`;
      } else {
        checkpointDesc = 'Initial opening stock';
      }

      transactions.push({
        date: checkpointDate || 'Beginning',
        reference: '-',
        product: product.name,
        quantity: checkpointStock,
        user: 'System',
        source: checkpointDesc,
        type: 'Opening Baseline'
      });

      // Sum transactions from startQueryDate to today
      const priorProd = startQueryDate 
        ? await getProductionTxs(startQueryDate, date)
        : await getProductionTxsBefore(date);
      
      const priorLoad = startQueryDate
        ? await getLoadingTxs(startQueryDate, date)
        : await getLoadingTxsBefore(date);

      const priorReturn = startQueryDate
        ? await getReturnTxs(startQueryDate, date)
        : await getReturnTxsBefore(date);

      transactions = transactions.concat(priorProd).concat(priorLoad).concat(priorReturn);
    }

    res.json({
      ok: true,
      date,
      type,
      finishedProductId,
      productName: product.name,
      categoryName: product.category_name,
      transactions: transactions.sort((a, b) => new Date(a.date) - new Date(b.date))
    });

  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  } finally {
    connection.release();
  }
});

export default router;
