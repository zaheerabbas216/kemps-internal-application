import express from 'express';
import pool from '../config/db.js';

const router = express.Router();

// GET /api/can-supply/search-customer?query=...
// Search customer with their active balances
router.get('/search-customer', async (req, res) => {
  try {
    const { query } = req.query;
    if (!query || !query.trim()) {
      return res.json({ customers: [] });
    }
    const searchWild = `%${query.trim()}%`;
    const [rows] = await pool.query(`
      SELECT 
        c.id, 
        c.name, 
        c.phone, 
        c.alternate_phone AS alternatePhone,
        c.gstin AS gst, 
        c.address,
        c.customer_type AS customerType,
        COALESCE(SUM(CASE WHEN t.product = '20 Ltr Can' AND t.supply_type = 'Company Can' THEN (CASE WHEN t.type = 'SUPPLY' THEN t.quantity ELSE -t.quantity END) ELSE 0 END), 0) AS cansOutCompany,
        COALESCE(SUM(CASE WHEN t.product = '20 Ltr Can' AND t.supply_type = 'Distributor Can' THEN (CASE WHEN t.type = 'SUPPLY' THEN t.quantity ELSE -t.quantity END) ELSE 0 END), 0) AS cansOutDistributor,
        COALESCE(SUM(CASE WHEN t.product = '20 Ltr Can' AND t.supply_type = 'Function Can' THEN (CASE WHEN t.type = 'SUPPLY' THEN t.quantity ELSE -t.quantity END) ELSE 0 END), 0) AS cansOutFunction,
        COALESCE(SUM(CASE WHEN t.product = 'Dispenser' THEN (CASE WHEN t.type = 'SUPPLY' THEN t.quantity ELSE -t.quantity END) ELSE 0 END), 0) AS dispensersOut
      FROM customers c
      LEFT JOIN can_supply_transactions t ON c.id = t.customer_id
      WHERE c.name LIKE ? OR c.phone LIKE ? OR c.alternate_phone LIKE ?
      GROUP BY c.id
      LIMIT 20
    `, [searchWild, searchWild, searchWild]);

    res.json({ ok: true, customers: rows });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// GET /api/can-supply/active-balances
// Main page listing: customers with pending items
router.get('/active-balances', async (req, res) => {
  try {
    const { search = '' } = req.query;
    let queryParams = [];
    let searchFilter = '';

    if (search.trim()) {
      searchFilter = 'AND (c.name LIKE ? OR c.phone LIKE ?)';
      const wild = `%${search.trim()}%`;
      queryParams.push(wild, wild);
    }

    const [rows] = await pool.query(`
      SELECT 
        c.id, 
        c.name, 
        c.phone, 
        c.customer_type AS customerType,
        COALESCE(SUM(CASE WHEN t.product = '20 Ltr Can' AND t.supply_type = 'Company Can' THEN (CASE WHEN t.type = 'SUPPLY' THEN t.quantity ELSE -t.quantity END) ELSE 0 END), 0) AS cansOutCompany,
        COALESCE(SUM(CASE WHEN t.product = '20 Ltr Can' AND t.supply_type = 'Distributor Can' THEN (CASE WHEN t.type = 'SUPPLY' THEN t.quantity ELSE -t.quantity END) ELSE 0 END), 0) AS cansOutDistributor,
        COALESCE(SUM(CASE WHEN t.product = '20 Ltr Can' AND t.supply_type = 'Function Can' THEN (CASE WHEN t.type = 'SUPPLY' THEN t.quantity ELSE -t.quantity END) ELSE 0 END), 0) AS cansOutFunction,
        COALESCE(SUM(CASE WHEN t.product = 'Dispenser' THEN (CASE WHEN t.type = 'SUPPLY' THEN t.quantity ELSE -t.quantity END) ELSE 0 END), 0) AS dispensersOut,
        MAX(t.transaction_date) AS lastTransaction
      FROM customers c
      JOIN can_supply_transactions t ON c.id = t.customer_id
      WHERE 1=1 ${searchFilter}
      GROUP BY c.id
      HAVING (cansOutCompany > 0 OR cansOutDistributor > 0 OR cansOutFunction > 0 OR dispensersOut > 0)
      ORDER BY lastTransaction DESC
    `, queryParams);

    res.json({ ok: true, activeBalances: rows });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// GET /api/can-supply/customer/:customerId/details
// Retrieves running balances, outstanding supplies, and ledger history
router.get('/customer/:customerId/details', async (req, res) => {
  try {
    const { customerId } = req.params;

    // 1. Fetch Customer info
    const [custRows] = await pool.query(
      `SELECT id, name, phone, alternate_phone AS alternatePhone, gstin AS gst, address, customer_type AS customerType 
       FROM customers WHERE id = ?`,
      [customerId]
    );
    if (custRows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Customer not found.' });
    }
    const customer = custRows[0];

    // 2. Fetch Running balances
    const [balanceRows] = await pool.query(`
      SELECT 
        COALESCE(SUM(CASE WHEN product = '20 Ltr Can' AND supply_type = 'Company Can' THEN (CASE WHEN type = 'SUPPLY' THEN quantity ELSE -quantity END) ELSE 0 END), 0) AS cansOutCompany,
        COALESCE(SUM(CASE WHEN product = '20 Ltr Can' AND supply_type = 'Distributor Can' THEN (CASE WHEN type = 'SUPPLY' THEN quantity ELSE -quantity END) ELSE 0 END), 0) AS cansOutDistributor,
        COALESCE(SUM(CASE WHEN product = '20 Ltr Can' AND supply_type = 'Function Can' THEN (CASE WHEN type = 'SUPPLY' THEN quantity ELSE -quantity END) ELSE 0 END), 0) AS cansOutFunction,
        COALESCE(SUM(CASE WHEN product = 'Dispenser' THEN (CASE WHEN type = 'SUPPLY' THEN quantity ELSE -quantity END) ELSE 0 END), 0) AS dispensersOut
      FROM can_supply_transactions
      WHERE customer_id = ?
    `, [customerId]);
    const balances = balanceRows[0];

    // 3. Fetch Outstanding supplies (supplies with pending_qty > 0)
    const [outstanding] = await pool.query(`
      SELECT 
        t.id, 
        DATE_FORMAT(t.transaction_date, '%Y-%m-%d') as transactionDate, 
        t.supply_type AS supplyType, 
        t.product, 
        t.quantity AS suppliedQty, 
        t.rate, 
        t.amount,
        t.notes,
        t.function_name AS functionName,
        DATE_FORMAT(t.event_date, '%Y-%m-%d') as eventDate,
        DATE_FORMAT(t.expected_return_date, '%Y-%m-%d') as expectedReturnDate,
        COALESCE(SUM(r.quantity), 0) AS returnedQty,
        (t.quantity - COALESCE(SUM(r.quantity), 0)) AS pendingQty
      FROM can_supply_transactions t
      LEFT JOIN can_supply_transactions r ON t.id = r.parent_transaction_id AND r.type = 'RETURN'
      WHERE t.customer_id = ? AND t.type = 'SUPPLY'
      GROUP BY t.id
      HAVING pendingQty > 0
      ORDER BY t.transaction_date ASC, t.id ASC
    `, [customerId]);

    // 4. Fetch full transaction history to build ledger
    const [txRows] = await pool.query(`
      SELECT 
        id, 
        DATE_FORMAT(transaction_date, '%Y-%m-%d') as date, 
        type, 
        supply_type AS supplyType, 
        product, 
        quantity, 
        rate, 
        amount, 
        notes,
        function_name AS functionName,
        parent_transaction_id AS parentTransactionId,
        created_by AS user
      FROM can_supply_transactions
      WHERE customer_id = ?
      ORDER BY transaction_date ASC, id ASC
    `, [customerId]);

    // Compute running balances per product dynamically
    let canBalance = 0;
    let dispenserBalance = 0;
    const ledger = txRows.map(row => {
      const q = parseInt(row.quantity, 10);
      if (row.product === '20 Ltr Can') {
        canBalance = row.type === 'SUPPLY' ? (canBalance + q) : (canBalance - q);
        return { ...row, runningBalance: canBalance };
      } else {
        dispenserBalance = row.type === 'SUPPLY' ? (dispenserBalance + q) : (dispenserBalance - q);
        return { ...row, runningBalance: dispenserBalance };
      }
    });

    res.json({
      ok: true,
      customer,
      balances,
      outstanding,
      ledger: ledger.reverse() // Display latest first in ledger
    });

  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// POST /api/can-supply
// Create a new supply entry
router.post('/', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const {
      customerId,
      transactionDate,
      supplyType,
      product,
      quantity,
      rate,
      notes,
      functionName,
      eventDate,
      expectedReturnDate
    } = req.body;

    const qty = parseInt(quantity, 10);
    const parsedRate = parseFloat(rate || 0);
    if (!customerId) throw new Error('Customer ID is required.');
    if (!transactionDate) throw new Error('Transaction date is required.');
    if (!supplyType || !['Company Can', 'Distributor Can', 'Function Can'].includes(supplyType)) {
      throw new Error('Invalid Supply Type.');
    }
    if (!product || !['20 Ltr Can', 'Dispenser'].includes(product)) {
      throw new Error('Invalid Product.');
    }
    if (isNaN(qty) || qty <= 0) throw new Error('Quantity must be greater than 0.');
    if (isNaN(parsedRate) || parsedRate < 0) throw new Error('Rate cannot be negative.');

    const amount = qty * parsedRate;
    const user = req.admin?.name || req.admin?.username || 'Admin';

    await connection.beginTransaction();

    // Verify customer exists
    const [custExists] = await connection.query('SELECT 1 FROM customers WHERE id = ?', [customerId]);
    if (custExists.length === 0) throw new Error('Customer not found.');

    const insertQuery = `
      INSERT INTO can_supply_transactions (
        customer_id, transaction_date, type, supply_type, product, quantity, rate, amount, notes,
        function_name, event_date, expected_return_date, created_by
      ) VALUES (?, ?, 'SUPPLY', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await connection.query(insertQuery, [
      customerId,
      transactionDate,
      supplyType,
      product,
      qty,
      parsedRate,
      amount,
      notes || null,
      supplyType === 'Function Can' ? (functionName || null) : null,
      supplyType === 'Function Can' ? (eventDate || null) : null,
      supplyType === 'Function Can' ? (expectedReturnDate || null) : null,
      user
    ]);

    await connection.commit();
    res.json({ ok: true, message: 'Supply transaction logged successfully!' });

  } catch (error) {
    await connection.rollback();
    res.status(400).json({ ok: false, error: error.message });
  } finally {
    connection.release();
  }
});

// POST /api/can-supply/return
// Create a return entry against an active supply
router.post('/return', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const {
      customerId,
      transactionDate,
      parentTransactionId,
      quantity,
      notes
    } = req.body;

    const qty = parseInt(quantity, 10);
    if (!customerId) throw new Error('Customer ID is required.');
    if (!transactionDate) throw new Error('Transaction date is required.');
    if (!parentTransactionId) throw new Error('Parent supply transaction is required.');
    if (isNaN(qty) || qty <= 0) throw new Error('Returned quantity must be greater than 0.');

    const user = req.admin?.name || req.admin?.username || 'Admin';

    await connection.beginTransaction();

    // 1. Fetch parent supply transaction
    const [parentRows] = await connection.query(
      `SELECT id, customer_id, product, supply_type, quantity 
       FROM can_supply_transactions WHERE id = ? AND type = 'SUPPLY'`,
      [parentTransactionId]
    );
    if (parentRows.length === 0) {
      throw new Error('Associated supply transaction not found.');
    }
    const parentTx = parentRows[0];

    if (parentTx.customer_id !== customerId) {
      throw new Error('Supply transaction does not belong to selected customer.');
    }

    // 2. Fetch already returned quantities for this supply transaction
    const [retRows] = await connection.query(
      `SELECT COALESCE(SUM(quantity), 0) AS totalReturned 
       FROM can_supply_transactions WHERE parent_transaction_id = ? AND type = 'RETURN'`,
      [parentTransactionId]
    );
    const totalReturned = parseInt(retRows[0].totalReturned, 10) || 0;
    const pendingQty = parentTx.quantity - totalReturned;

    // 3. Validate returned qty <= pending qty
    if (qty > pendingQty) {
      throw new Error(`Cannot return more than available pending quantity. Pending: ${pendingQty}, Attempted: ${qty}`);
    }

    // 4. Log the Return Transaction
    const insertQuery = `
      INSERT INTO can_supply_transactions (
        customer_id, transaction_date, type, supply_type, product, quantity, rate, amount, notes,
        parent_transaction_id, created_by
      ) VALUES (?, ?, 'RETURN', ?, ?, ?, 0.00, 0.00, ?, ?, ?)
    `;

    await connection.query(insertQuery, [
      customerId,
      transactionDate,
      parentTx.supply_type,
      parentTx.product,
      qty,
      notes || null,
      parentTransactionId,
      user
    ]);

    await connection.commit();
    res.json({ ok: true, message: 'Return logged successfully!' });

  } catch (error) {
    await connection.rollback();
    res.status(400).json({ ok: false, error: error.message });
  } finally {
    connection.release();
  }
});

// GET /api/can-supply/dashboard
// Summary statistics and overdue listings
router.get('/dashboard', async (req, res) => {
  try {
    // Queries to calculate balances dynamically
    const [[{ companyCans }]] = await pool.query(`
      SELECT COALESCE(SUM(CASE WHEN type = 'SUPPLY' THEN quantity ELSE -quantity END), 0) AS companyCans 
      FROM can_supply_transactions 
      WHERE product = '20 Ltr Can' AND supply_type = 'Company Can'
    `);

    const [[{ distributorCans }]] = await pool.query(`
      SELECT COALESCE(SUM(CASE WHEN type = 'SUPPLY' THEN quantity ELSE -quantity END), 0) AS distributorCans 
      FROM can_supply_transactions 
      WHERE product = '20 Ltr Can' AND supply_type = 'Distributor Can'
    `);

    const [[{ functionCans }]] = await pool.query(`
      SELECT COALESCE(SUM(CASE WHEN type = 'SUPPLY' THEN quantity ELSE -quantity END), 0) AS functionCans 
      FROM can_supply_transactions 
      WHERE product = '20 Ltr Can' AND supply_type = 'Function Can'
    `);

    const [[{ dispensers }]] = await pool.query(`
      SELECT COALESCE(SUM(CASE WHEN type = 'SUPPLY' THEN quantity ELSE -quantity END), 0) AS dispensers 
      FROM can_supply_transactions 
      WHERE product = 'Dispenser'
    `);

    // Overdue Function Can list
    const [overdue] = await pool.query(`
      SELECT 
        t.id,
        c.name AS customerName,
        c.phone AS customerPhone,
        DATE_FORMAT(t.transaction_date, '%Y-%m-%d') as supplyDate,
        t.function_name AS functionName,
        DATE_FORMAT(t.event_date, '%Y-%m-%d') as eventDate,
        DATE_FORMAT(t.expected_return_date, '%Y-%m-%d') as expectedReturnDate,
        t.quantity AS suppliedQty,
        (t.quantity - COALESCE(SUM(r.quantity), 0)) AS pendingQty
      FROM can_supply_transactions t
      JOIN customers c ON t.customer_id = c.id
      LEFT JOIN can_supply_transactions r ON t.id = r.parent_transaction_id AND r.type = 'RETURN'
      WHERE t.type = 'SUPPLY' AND t.supply_type = 'Function Can' AND t.expected_return_date < CURRENT_DATE()
      GROUP BY t.id
      HAVING pendingQty > 0
      ORDER BY t.expected_return_date ASC
    `);

    const cCans = parseInt(companyCans, 10) || 0;
    const dCans = parseInt(distributorCans, 10) || 0;
    const fCans = parseInt(functionCans, 10) || 0;
    const disp = parseInt(dispensers, 10) || 0;

    const totalCansOut = cCans + dCans + fCans;
    const totalPendingReturns = totalCansOut + disp;

    res.json({
      ok: true,
      summary: {
        companyCansOut: cCans,
        distributorCansOut: dCans,
        functionCansOut: fCans,
        dispensersOut: disp,
        totalPendingReturns: totalPendingReturns
      },
      overdue
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// GET /api/can-supply/reports
// Generates data for reports
router.get('/reports', async (req, res) => {
  try {
    const { reportType, startDate, endDate } = req.query;

    let dateFilter = '';
    let dateParams = [];
    if (startDate && endDate) {
      dateFilter = 'AND t.transaction_date BETWEEN ? AND ?';
      dateParams.push(startDate, endDate);
    } else if (startDate) {
      dateFilter = 'AND t.transaction_date >= ?';
      dateParams.push(startDate);
    } else if (endDate) {
      dateFilter = 'AND t.transaction_date <= ?';
      dateParams.push(endDate);
    }

    let reportData = [];

    switch (reportType) {
      case 'CustomerCanBalance':
        const [custBalance] = await pool.query(`
          SELECT 
            c.id,
            c.name,
            c.phone,
            c.customer_type AS customerType,
            COALESCE(SUM(CASE WHEN t.product = '20 Ltr Can' THEN (CASE WHEN t.type = 'SUPPLY' THEN t.quantity ELSE -t.quantity END) ELSE 0 END), 0) AS cansOut,
            COALESCE(SUM(CASE WHEN t.product = 'Dispenser' THEN (CASE WHEN t.type = 'SUPPLY' THEN t.quantity ELSE -t.quantity END) ELSE 0 END), 0) AS dispensersOut
          FROM customers c
          LEFT JOIN can_supply_transactions t ON c.id = t.customer_id
          GROUP BY c.id
          HAVING cansOut > 0 OR dispensersOut > 0
          ORDER BY c.name ASC
        `);
        reportData = custBalance;
        break;

      case 'DistributorCanReport':
        const [distBalance] = await pool.query(`
          SELECT 
            c.id,
            c.name,
            c.phone,
            COALESCE(SUM(CASE WHEN t.product = '20 Ltr Can' AND t.supply_type = 'Distributor Can' THEN (CASE WHEN t.type = 'SUPPLY' THEN t.quantity ELSE -t.quantity END) ELSE 0 END), 0) AS cansOut
          FROM customers c
          LEFT JOIN can_supply_transactions t ON c.id = t.customer_id
          WHERE c.customer_type = 'Distributor'
          GROUP BY c.id
          HAVING cansOut > 0
          ORDER BY c.name ASC
        `);
        reportData = distBalance;
        break;

      case 'FunctionCanReport':
        const [funcReport] = await pool.query(`
          SELECT 
            t.id AS supplyId,
            c.name AS customerName,
            c.phone AS customerPhone,
            t.function_name AS functionName,
            DATE_FORMAT(t.event_date, '%Y-%m-%d') as eventDate,
            DATE_FORMAT(t.expected_return_date, '%Y-%m-%d') as expectedReturnDate,
            t.quantity AS suppliedQty,
            (t.quantity - COALESCE(SUM(r.quantity), 0)) AS pendingQty
          FROM can_supply_transactions t
          JOIN customers c ON t.customer_id = c.id
          LEFT JOIN can_supply_transactions r ON t.id = r.parent_transaction_id AND r.type = 'RETURN'
          WHERE t.type = 'SUPPLY' AND t.supply_type = 'Function Can' ${dateFilter}
          GROUP BY t.id
          HAVING pendingQty > 0
          ORDER BY t.expected_return_date ASC
        `, dateParams);
        reportData = funcReport;
        break;

      case 'PendingReturnReport':
        const [pendingReport] = await pool.query(`
          SELECT 
            t.id AS supplyId,
            c.name AS customerName,
            c.phone AS customerPhone,
            t.supply_type AS supplyType,
            t.product,
            DATE_FORMAT(t.transaction_date, '%Y-%m-%d') as supplyDate,
            t.quantity AS suppliedQty,
            (t.quantity - COALESCE(SUM(r.quantity), 0)) AS pendingQty
          FROM can_supply_transactions t
          JOIN customers c ON t.customer_id = c.id
          LEFT JOIN can_supply_transactions r ON t.id = r.parent_transaction_id AND r.type = 'RETURN'
          WHERE t.type = 'SUPPLY' ${dateFilter}
          GROUP BY t.id
          HAVING pendingQty > 0
          ORDER BY t.transaction_date ASC
        `, dateParams);
        reportData = pendingReport;
        break;

      case 'DispenserBalanceReport':
        const [dispBalance] = await pool.query(`
          SELECT 
            c.id,
            c.name,
            c.phone,
            COALESCE(SUM(CASE WHEN t.product = 'Dispenser' THEN (CASE WHEN t.type = 'SUPPLY' THEN t.quantity ELSE -t.quantity END) ELSE 0 END), 0) AS dispensersOut
          FROM customers c
          LEFT JOIN can_supply_transactions t ON c.id = t.customer_id
          GROUP BY c.id
          HAVING dispensersOut > 0
          ORDER BY c.name ASC
        `);
        reportData = dispBalance;
        break;

      case 'CanSupplyHistoryReport':
        const [historyReport] = await pool.query(`
          SELECT 
            t.id,
            DATE_FORMAT(t.transaction_date, '%Y-%m-%d') as date,
            c.name AS customerName,
            t.type,
            t.supply_type AS supplyType,
            t.product,
            t.quantity,
            t.rate,
            t.amount,
            t.notes,
            t.created_by AS user
          FROM can_supply_transactions t
          JOIN customers c ON t.customer_id = c.id
          WHERE 1=1 ${dateFilter}
          ORDER BY t.transaction_date DESC, t.created_at DESC
        `, dateParams);
        reportData = historyReport;
        break;

      default:
        throw new Error('Invalid report type specified.');
    }

    res.json({ ok: true, data: reportData });

  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

export default router;