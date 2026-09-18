import express from 'express';
import pool from '../config/db.js';
import {
  getTodayISTStr,
  calculateDynamicRow,
  autoClosePendingDays
} from '../services/toolsInventoryAutoCloseService.js';

const router = express.Router();

// Auto-initialize tables on startup
const initTables = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tools_inventory_transactions (
        id VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci PRIMARY KEY,
        transaction_type ENUM('STOCK_IN', 'STOCK_OUT') NOT NULL,
        transaction_date DATE NOT NULL,
        transaction_time TIME NULL,
        product_name VARCHAR(255) NOT NULL,
        machine_name VARCHAR(255) NULL,
        company_name VARCHAR(255) NULL,
        bill_no VARCHAR(100) NULL,
        quantity DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        unit VARCHAR(20) NOT NULL DEFAULT 'PCS',
        notes TEXT NULL,
        created_by VARCHAR(100) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_ti_date (transaction_date),
        INDEX idx_ti_type (transaction_type),
        INDEX idx_ti_product (product_name),
        INDEX idx_ti_machine (machine_name),
        INDEX idx_ti_company (company_name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS tools_inventory_manual_opening (
        id INT AUTO_INCREMENT PRIMARY KEY,
        product_name VARCHAR(255) NOT NULL,
        ledger_date DATE NOT NULL,
        quantity DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_timo_date_product (ledger_date, product_name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS tools_inventory_ledger_closings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ledger_date DATE NOT NULL UNIQUE,
        closed_by VARCHAR(100) DEFAULT 'System (Auto)',
        closed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS tools_inventory_ledger_snapshots (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ledger_date DATE NOT NULL,
        product_name VARCHAR(255) NOT NULL,
        opening_stock DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        stock_in DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        stock_out DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        closing_stock DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_tils_date_product (ledger_date, product_name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  } catch (err) {
    console.error('Failed to init tools inventory tables:', err);
  }
};
initTables();

// Helper to get current IST date and time
function getISTDateAndTime() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const istDate = new Date(now.getTime() + (330 + offset) * 60000);

  const yyyy = istDate.getFullYear();
  const mm = String(istDate.getMonth() + 1).padStart(2, '0');
  const dd = String(istDate.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}-${mm}-${dd}`;

  const hh = String(istDate.getHours()).padStart(2, '0');
  const mi = String(istDate.getMinutes()).padStart(2, '0');
  const ss = String(istDate.getSeconds()).padStart(2, '0');
  const timeStr = `${hh}:${mi}:${ss}`;

  return { dateStr, timeStr, yyyy };
}

// Helper to generate custom sequence ID (TIN-YYYY-00001 or TOUT-YYYY-00001)
async function generateId(prefix, table, idColumn) {
  const { yyyy } = getISTDateAndTime();
  const [rows] = await pool.query(
    `SELECT ${idColumn} FROM ${table} WHERE ${idColumn} LIKE ? ORDER BY ${idColumn} DESC LIMIT 1`,
    [`${prefix}-${yyyy}-%`]
  );
  let seq = 1;
  if (rows.length) {
    const lastId = rows[0][idColumn];
    const match = lastId.match(new RegExp(`^${prefix}-${yyyy}-(\\d+)$`));
    if (match && match[1]) {
      seq = parseInt(match[1], 10) + 1;
    }
  }
  return `${prefix}-${yyyy}-${String(seq).padStart(5, '0')}`;
}

// GET /api/tools-inventory/dropdowns - Dropdowns populated from Stock IN with live stock
router.get('/dropdowns', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const today = getTodayISTStr();

    // 1. Distinct product names with current stock
    const [prodRows] = await connection.query(`
      SELECT DISTINCT product_name 
      FROM tools_inventory_transactions 
      WHERE transaction_type = 'STOCK_IN' 
      ORDER BY product_name ASC
    `);

    const productsWithStock = [];
    for (const r of prodRows) {
      const calc = await calculateDynamicRow(connection, r.product_name, today);
      productsWithStock.push({
        product_name: r.product_name,
        machine_name: calc.machine_name,
        company_name: calc.company_name,
        unit: calc.unit,
        current_stock: calc.closing_stock
      });
    }

    // 2. Distinct machine names
    const [machRows] = await connection.query(`
      SELECT DISTINCT machine_name 
      FROM tools_inventory_transactions 
      WHERE machine_name IS NOT NULL AND machine_name != ''
      ORDER BY machine_name ASC
    `);

    // 3. Distinct company names
    const [compRows] = await connection.query(`
      SELECT DISTINCT company_name 
      FROM tools_inventory_transactions 
      WHERE company_name IS NOT NULL AND company_name != ''
      ORDER BY company_name ASC
    `);

    res.json({
      ok: true,
      products: productsWithStock,
      machines: machRows.map(r => r.machine_name),
      companies: compRows.map(r => r.company_name)
    });
  } catch (error) {
    console.error('Fetch tools dropdowns error:', error);
    res.status(500).json({ ok: false, error: error.message });
  } finally {
    connection.release();
  }
});

// POST /api/tools-inventory/stock-in - Record Stock IN
router.post('/stock-in', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const {
      productName,
      machineName,
      companyName,
      billNo,
      quantity,
      unit = 'PCS',
      date,
      time,
      notes
    } = req.body;

    if (!productName || !productName.trim()) {
      throw new Error('Product Name is required.');
    }
    const parsedQty = parseFloat(quantity);
    if (isNaN(parsedQty) || parsedQty <= 0) {
      throw new Error('Quantity must be greater than 0.');
    }

    const { dateStr, timeStr } = getISTDateAndTime();
    const finalDate = date || dateStr;
    const finalTime = time || timeStr;
    const createdBy = req.admin?.name || req.admin?.username || 'Admin';

    const recordId = await generateId('TIN', 'tools_inventory_transactions', 'id');

    await connection.query(
      `INSERT INTO tools_inventory_transactions 
       (id, transaction_type, transaction_date, transaction_time, product_name, machine_name, company_name, bill_no, quantity, unit, notes, created_by, created_at)
       VALUES (?, 'STOCK_IN', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        recordId,
        finalDate,
        finalTime,
        productName.trim(),
        machineName ? machineName.trim() : null,
        companyName ? companyName.trim() : null,
        billNo ? billNo.trim() : null,
        parsedQty,
        unit ? unit.trim() : 'PCS',
        notes ? notes.trim() : null,
        createdBy
      ]
    );

    await connection.commit();
    res.json({
      ok: true,
      id: recordId,
      message: 'Stock IN recorded successfully!'
    });
  } catch (error) {
    await connection.rollback();
    console.error('Stock In error:', error);
    res.status(400).json({ ok: false, error: error.message });
  } finally {
    connection.release();
  }
});

// POST /api/tools-inventory/stock-out - Record Stock OUT
router.post('/stock-out', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const {
      productName,
      machineName,
      companyName,
      quantity,
      unit = 'PCS',
      date,
      time,
      notes
    } = req.body;

    if (!productName || !productName.trim()) {
      throw new Error('Product Name is required.');
    }
    const parsedQty = parseFloat(quantity);
    if (isNaN(parsedQty) || parsedQty <= 0) {
      throw new Error('Quantity must be greater than 0.');
    }

    const { dateStr, timeStr } = getISTDateAndTime();
    const finalDate = date || dateStr;
    const finalTime = time || timeStr;
    const createdBy = req.admin?.name || req.admin?.username || 'Admin';

    // Check available stock
    const calc = await calculateDynamicRow(connection, productName.trim(), finalDate);
    if (parsedQty > calc.closing_stock) {
      throw new Error(
        `Insufficient stock for "${productName.trim()}". Available: ${calc.closing_stock} ${calc.unit}, requested: ${parsedQty} ${unit}.`
      );
    }

    const recordId = await generateId('TOUT', 'tools_inventory_transactions', 'id');

    await connection.query(
      `INSERT INTO tools_inventory_transactions 
       (id, transaction_type, transaction_date, transaction_time, product_name, machine_name, company_name, bill_no, quantity, unit, notes, created_by, created_at)
       VALUES (?, 'STOCK_OUT', ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, NOW())`,
      [
        recordId,
        finalDate,
        finalTime,
        productName.trim(),
        machineName ? machineName.trim() : null,
        companyName ? companyName.trim() : null,
        parsedQty,
        unit ? unit.trim() : 'PCS',
        notes ? notes.trim() : null,
        createdBy
      ]
    );

    await connection.commit();
    res.json({
      ok: true,
      id: recordId,
      message: 'Stock OUT recorded successfully!'
    });
  } catch (error) {
    await connection.rollback();
    console.error('Stock Out error:', error);
    res.status(400).json({ ok: false, error: error.message });
  } finally {
    connection.release();
  }
});

// GET /api/tools-inventory/ledger - Get dynamic daily inventory ledger
router.get('/ledger', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    // 1. Trigger automatic close of historical days
    await autoClosePendingDays(connection);

    const { date, search = '' } = req.query;
    const targetDate = date || getTodayISTStr();

    // Check if targetDate is a closed day
    const [closedRows] = await connection.query(
      `SELECT DATE_FORMAT(ledger_date, '%Y-%m-%d') as ledger_date 
       FROM tools_inventory_ledger_closings 
       WHERE ledger_date = ?`,
      [targetDate]
    );
    const isClosed = closedRows.length > 0;

    let rows = [];

    if (isClosed) {
      // Read frozen snapshots
      const [snapRows] = await connection.query(`
        SELECT 
          s.product_name,
          s.opening_stock,
          s.stock_in,
          s.stock_out,
          s.closing_stock
        FROM tools_inventory_ledger_snapshots s
        WHERE s.ledger_date = ?
        ORDER BY s.product_name ASC
      `, [targetDate]);

      for (const r of snapRows) {
        const [meta] = await connection.query(`
          SELECT machine_name, company_name, unit 
          FROM tools_inventory_transactions 
          WHERE product_name = ? AND transaction_date <= ?
          ORDER BY transaction_date DESC, id DESC LIMIT 1
        `, [r.product_name, targetDate]);

        rows.push({
          product_name: r.product_name,
          machine_name: meta[0]?.machine_name || '—',
          company_name: meta[0]?.company_name || '—',
          unit: meta[0]?.unit || 'PCS',
          opening_stock: parseFloat(r.opening_stock || 0),
          stock_in: parseFloat(r.stock_in || 0),
          stock_out: parseFloat(r.stock_out || 0),
          closing_stock: parseFloat(r.closing_stock || 0)
        });
      }
    } else {
      // Calculate live dynamic rows for all tools known up to targetDate
      const [products] = await connection.query(`
        SELECT DISTINCT product_name FROM (
          SELECT product_name FROM tools_inventory_transactions WHERE transaction_date <= ?
          UNION
          SELECT product_name FROM tools_inventory_manual_opening WHERE ledger_date <= ?
        ) combined
        ORDER BY product_name ASC
      `, [targetDate, targetDate]);

      for (const p of products) {
        const calc = await calculateDynamicRow(connection, p.product_name, targetDate);
        rows.push(calc);
      }
    }

    // Filter by search if provided
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      rows = rows.filter(r =>
        r.product_name.toLowerCase().includes(s) ||
        r.machine_name.toLowerCase().includes(s) ||
        r.company_name.toLowerCase().includes(s)
      );
    }

    // Calculate totals
    const summary = rows.reduce((acc, r) => ({
      totalOpening: acc.totalOpening + r.opening_stock,
      totalIn: acc.totalIn + r.stock_in,
      totalOut: acc.totalOut + r.stock_out,
      totalClosing: acc.totalClosing + r.closing_stock,
      itemCount: acc.itemCount + 1
    }), {
      totalOpening: 0,
      totalIn: 0,
      totalOut: 0,
      totalClosing: 0,
      itemCount: 0
    });

    res.json({
      ok: true,
      date: targetDate,
      isClosed,
      ledger: rows,
      summary
    });
  } catch (error) {
    console.error('Fetch tools ledger error:', error);
    res.status(500).json({ ok: false, error: error.message });
  } finally {
    connection.release();
  }
});

// GET /api/tools-inventory/history - Unified history log
router.get('/history', async (req, res) => {
  try {
    const {
      startDate = '',
      endDate = '',
      type = 'ALL', // 'ALL', 'STOCK_IN', 'STOCK_OUT'
      search = '',
      page = 1,
      limit = 20
    } = req.query;

    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.max(1, parseInt(limit, 10) || 20);
    const offset = (parsedPage - 1) * parsedLimit;

    const whereClauses = [];
    const queryParams = [];

    if (type && type !== 'ALL') {
      whereClauses.push('transaction_type = ?');
      queryParams.push(type);
    }

    if (startDate) {
      whereClauses.push('transaction_date >= ?');
      queryParams.push(startDate);
    }
    if (endDate) {
      whereClauses.push('transaction_date <= ?');
      queryParams.push(endDate);
    }

    if (search.trim()) {
      whereClauses.push('(product_name LIKE ? OR machine_name LIKE ? OR company_name LIKE ? OR bill_no LIKE ? OR id LIKE ? OR notes LIKE ?)');
      const wild = `%${search.trim()}%`;
      queryParams.push(wild, wild, wild, wild, wild, wild);
    }

    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Count
    const [countRows] = await pool.query(
      `SELECT COUNT(*) as total, 
              COALESCE(SUM(CASE WHEN transaction_type = 'STOCK_IN' THEN quantity ELSE 0 END), 0) AS totalIn,
              COALESCE(SUM(CASE WHEN transaction_type = 'STOCK_OUT' THEN quantity ELSE 0 END), 0) AS totalOut
       FROM tools_inventory_transactions 
       ${whereStr}`,
      queryParams
    );

    const totalCount = parseInt(countRows[0]?.total || 0, 10);
    const totalIn = parseFloat(countRows[0]?.totalIn || 0);
    const totalOut = parseFloat(countRows[0]?.totalOut || 0);

    // Rows
    const [rows] = await pool.query(
      `SELECT 
         id,
         transaction_type,
         DATE_FORMAT(transaction_date, '%Y-%m-%d') AS transaction_date,
         TIME_FORMAT(transaction_time, '%H:%i:%s') AS transaction_time,
         product_name,
         machine_name,
         company_name,
         bill_no,
         quantity,
         unit,
         notes,
         created_by,
         created_at
       FROM tools_inventory_transactions
       ${whereStr}
       ORDER BY transaction_date DESC, transaction_time DESC, id DESC
       LIMIT ? OFFSET ?`,
      [...queryParams, parsedLimit, offset]
    );

    res.json({
      ok: true,
      transactions: rows.map(r => ({
        ...r,
        quantity: parseFloat(r.quantity || 0)
      })),
      total: totalCount,
      totalPages: Math.ceil(totalCount / parsedLimit) || 1,
      page: parsedPage,
      limit: parsedLimit,
      summary: {
        totalCount,
        totalIn,
        totalOut
      }
    });
  } catch (error) {
    console.error('Fetch tools history error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// GET /api/tools-inventory/summary - KPI summary metrics
router.get('/summary', async (req, res) => {
  try {
    const today = getTodayISTStr();

    // Today metrics
    const [todayIn] = await pool.query(
      `SELECT COUNT(*) as count, COALESCE(SUM(quantity), 0) as total 
       FROM tools_inventory_transactions 
       WHERE transaction_type = 'STOCK_IN' AND transaction_date = ?`,
      [today]
    );

    const [todayOut] = await pool.query(
      `SELECT COUNT(*) as count, COALESCE(SUM(quantity), 0) as total 
       FROM tools_inventory_transactions 
       WHERE transaction_type = 'STOCK_OUT' AND transaction_date = ?`,
      [today]
    );

    // Overall metrics
    const [totalTools] = await pool.query(`
      SELECT COUNT(DISTINCT product_name) as count 
      FROM tools_inventory_transactions
    `);

    const [overallStock] = await pool.query(`
      SELECT 
        COALESCE(SUM(CASE WHEN transaction_type = 'STOCK_IN' THEN quantity ELSE -quantity END), 0) as netStock
      FROM tools_inventory_transactions
    `);

    res.json({
      ok: true,
      today: {
        date: today,
        stockInCount: parseInt(todayIn[0]?.count || 0, 10),
        stockInQty: parseFloat(todayIn[0]?.total || 0),
        stockOutCount: parseInt(todayOut[0]?.count || 0, 10),
        stockOutQty: parseFloat(todayOut[0]?.total || 0)
      },
      overall: {
        totalTools: parseInt(totalTools[0]?.count || 0, 10),
        netStock: parseFloat(overallStock[0]?.netStock || 0)
      }
    });
  } catch (error) {
    console.error('Fetch tools summary error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// PUT /api/tools-inventory/transaction/:id - Edit transaction
router.put('/transaction/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      productName,
      machineName,
      companyName,
      billNo,
      quantity,
      unit = 'PCS',
      date,
      time,
      notes
    } = req.body;

    if (!productName || !productName.trim()) {
      return res.status(400).json({ ok: false, error: 'Product Name is required.' });
    }
    const parsedQty = parseFloat(quantity);
    if (isNaN(parsedQty) || parsedQty <= 0) {
      return res.status(400).json({ ok: false, error: 'Quantity must be greater than 0.' });
    }

    await pool.query(
      `UPDATE tools_inventory_transactions 
       SET product_name = ?,
           machine_name = ?,
           company_name = ?,
           bill_no = ?,
           quantity = ?,
           unit = ?,
           transaction_date = ?,
           transaction_time = ?,
           notes = ?
       WHERE id = ?`,
      [
        productName.trim(),
        machineName ? machineName.trim() : null,
        companyName ? companyName.trim() : null,
        billNo ? billNo.trim() : null,
        parsedQty,
        unit || 'PCS',
        date,
        time,
        notes ? notes.trim() : null,
        id
      ]
    );

    res.json({ ok: true, message: 'Transaction updated successfully.' });
  } catch (error) {
    console.error('Update tools transaction error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// DELETE /api/tools-inventory/transaction/:id - Delete transaction
router.delete('/transaction/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await pool.query('DELETE FROM tools_inventory_transactions WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ ok: false, error: 'Transaction not found.' });
    }

    res.json({ ok: true, message: 'Transaction deleted successfully.' });
  } catch (error) {
    console.error('Delete tools transaction error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
