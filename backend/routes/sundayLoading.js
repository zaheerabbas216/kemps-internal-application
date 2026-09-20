import express from 'express';
import pool from '../config/db.js';

const router = express.Router();
const TAX_OPTIONS = [0, 5, 12, 18, 28, 40];

// Helper to generate custom sequence ID: e.g. SL-2026-00001
async function generateId(prefix, table, idColumn) {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  // Adjust to IST timezone (UTC+5:30)
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
      seq = parseInt(match[1], 10) + 1;
    }
  }

  return `${prefix}-${yyyy}-${String(seq).padStart(5, '0')}`;
}

// GET /api/sunday-loading/today - Get today's recent Sunday loading records & summary
router.get('/today', async (req, res) => {
  try {
    const { search = '' } = req.query;

    const now = new Date();
    const offset = now.getTimezoneOffset();
    const istDate = new Date(now.getTime() + (330 + offset) * 60000);
    const yyyy = istDate.getFullYear();
    const mm = String(istDate.getMonth() + 1).padStart(2, '0');
    const dd = String(istDate.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;

    // Summary for today
    const [summaryRows] = await pool.query(
      `SELECT 
         COALESCE(SUM(total_amount), 0) AS totalAmount,
         COALESCE(SUM(total_paid), 0) AS totalPaid,
         COALESCE(SUM(due_amount), 0) AS totalDue,
         COALESCE(SUM(quantity), 0) AS totalQuantity,
         COALESCE(SUM(cash_amount), 0) AS totalCash,
         COALESCE(SUM(upi_amount), 0) AS totalUpi,
         COALESCE(SUM(bank_amount), 0) AS totalBank,
         COUNT(*) AS totalCount
       FROM sunday_loading 
       WHERE loading_date = ?`,
      [todayStr]
    );

    const summary = summaryRows[0] || {
      totalAmount: 0,
      totalPaid: 0,
      totalDue: 0,
      totalQuantity: 0,
      totalCash: 0,
      totalUpi: 0,
      totalBank: 0,
      totalCount: 0
    };

    let query = `
      SELECT 
        id,
        transaction_number,
        DATE_FORMAT(loading_date, '%Y-%m-%d') AS loading_date,
        customer_id,
        customer_name,
        customer_phone,
        customer_address,
        customer_type,
        product_id,
        product_name,
        quantity,
        rate,
        total_amount,
        cash_amount,
        upi_amount,
        bank_amount,
        total_paid,
        due_amount,
        notes,
        created_by,
        created_at,
        updated_at
      FROM sunday_loading
      WHERE loading_date = ?
    `;
    const params = [todayStr];

    if (search.trim()) {
      query += ` AND (customer_name LIKE ? OR customer_phone LIKE ? OR transaction_number LIKE ? OR product_name LIKE ?)`;
      const s = `%${search.trim()}%`;
      params.push(s, s, s, s);
    }

    query += ` ORDER BY id DESC LIMIT 50`;

    const [rows] = await pool.query(query, params);

    res.json({
      ok: true,
      today: todayStr,
      summary: {
        totalAmount: parseFloat(summary.totalAmount || 0),
        totalPaid: parseFloat(summary.totalPaid || 0),
        totalDue: parseFloat(summary.totalDue || 0),
        totalQuantity: parseFloat(summary.totalQuantity || 0),
        totalCash: parseFloat(summary.totalCash || 0),
        totalUpi: parseFloat(summary.totalUpi || 0),
        totalBank: parseFloat(summary.totalBank || 0),
        totalCount: parseInt(summary.totalCount || 0, 10)
      },
      records: rows.map(r => ({
        ...r,
        quantity: parseFloat(r.quantity || 0),
        rate: parseFloat(r.rate || 0),
        total_amount: parseFloat(r.total_amount || 0),
        cash_amount: parseFloat(r.cash_amount || 0),
        upi_amount: parseFloat(r.upi_amount || 0),
        bank_amount: parseFloat(r.bank_amount || 0),
        total_paid: parseFloat(r.total_paid || 0),
        due_amount: parseFloat(r.due_amount || 0)
      }))
    });
  } catch (error) {
    console.error('Failed to fetch today sunday loading:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// GET /api/sunday-loading - List all Sunday loading history with filters & pagination
router.get('/', async (req, res) => {
  try {
    let { page = 1, limit = 10, search = '', productId = '', startDate = '', endDate = '' } = req.query;
    page = parseInt(page, 10);
    limit = parseInt(limit, 10);
    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1) limit = 10;
    const offset = (page - 1) * limit;

    const whereClauses = [];
    const queryParams = [];

    if (search.trim()) {
      whereClauses.push('(customer_name LIKE ? OR customer_phone LIKE ? OR transaction_number LIKE ? OR product_name LIKE ?)');
      const s = `%${search.trim()}%`;
      queryParams.push(s, s, s, s);
    }

    if (productId && productId !== 'All') {
      whereClauses.push('product_id = ?');
      queryParams.push(productId);
    }

    if (startDate) {
      whereClauses.push('loading_date >= ?');
      queryParams.push(startDate);
    }

    if (endDate) {
      whereClauses.push('loading_date <= ?');
      queryParams.push(endDate);
    }

    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Summary counts and totals
    const [summaryRows] = await pool.query(
      `SELECT 
         COUNT(*) AS totalCount,
         COALESCE(SUM(total_amount), 0) AS totalAmount,
         COALESCE(SUM(total_paid), 0) AS totalPaid,
         COALESCE(SUM(due_amount), 0) AS totalDue,
         COALESCE(SUM(quantity), 0) AS totalQuantity,
         COALESCE(SUM(cash_amount), 0) AS totalCash,
         COALESCE(SUM(upi_amount), 0) AS totalUpi,
         COALESCE(SUM(bank_amount), 0) AS totalBank
       FROM sunday_loading
       ${whereStr}`,
      queryParams
    );

    const totalCount = parseInt(summaryRows[0]?.totalCount || 0, 10);
    const summary = summaryRows[0] || {};

    // Paged records
    const [rows] = await pool.query(
      `SELECT 
         id,
         transaction_number,
         DATE_FORMAT(loading_date, '%Y-%m-%d') AS loading_date,
         customer_id,
         customer_name,
         customer_phone,
         customer_address,
         customer_type,
         product_id,
         product_name,
         quantity,
         rate,
         total_amount,
         cash_amount,
         upi_amount,
         bank_amount,
         total_paid,
         due_amount,
         notes,
         created_by,
         created_at,
         updated_at
       FROM sunday_loading
       ${whereStr}
       ORDER BY loading_date DESC, id DESC
       LIMIT ? OFFSET ?`,
      [...queryParams, limit, offset]
    );

    res.json({
      ok: true,
      records: rows.map(r => ({
        ...r,
        quantity: parseFloat(r.quantity || 0),
        rate: parseFloat(r.rate || 0),
        total_amount: parseFloat(r.total_amount || 0),
        cash_amount: parseFloat(r.cash_amount || 0),
        upi_amount: parseFloat(r.upi_amount || 0),
        bank_amount: parseFloat(r.bank_amount || 0),
        total_paid: parseFloat(r.total_paid || 0),
        due_amount: parseFloat(r.due_amount || 0)
      })),
      total: totalCount,
      totalPages: Math.ceil(totalCount / limit) || 1,
      page,
      limit,
      summary: {
        totalAmount: parseFloat(summary.totalAmount || 0),
        totalPaid: parseFloat(summary.totalPaid || 0),
        totalDue: parseFloat(summary.totalDue || 0),
        totalQuantity: parseFloat(summary.totalQuantity || 0),
        totalCash: parseFloat(summary.totalCash || 0),
        totalUpi: parseFloat(summary.totalUpi || 0),
        totalBank: parseFloat(summary.totalBank || 0),
        recordCount: totalCount
      }
    });
  } catch (error) {
    console.error('Failed to fetch sunday loading history:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// GET /api/sunday-loading/loading - Independent Sunday loading sheets.
router.get('/loading', async (req, res) => {
  try {
    let { page = 1, limit = 10, search = '', status = 'ACTIVE' } = req.query;
    page = Math.max(1, parseInt(page, 10) || 1);
    limit = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
    status = String(status).toUpperCase();
    if (!['ACTIVE', 'COMPLETED'].includes(status)) {
      return res.status(400).json({ ok: false, error: 'Status must be ACTIVE or COMPLETED.' });
    }
    const offset = (page - 1) * limit;
    const searchValue = `%${String(search).trim()}%`;
    const conditions = ['d.status = ?'];
    const params = [status];
    if (String(search).trim()) {
      conditions.push('(d.dispatch_number LIKE ? OR d.customer_name LIKE ? OR d.company LIKE ? OR EXISTS (SELECT 1 FROM sunday_loading_dispatch_items si WHERE si.dispatch_id = d.id AND si.product_name LIKE ?))');
      params.push(searchValue, searchValue, searchValue, searchValue);
    }
    const where = `WHERE ${conditions.join(' AND ')}`;

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM sunday_loading_dispatches d ${where}`,
      params
    );
    const [rows] = await pool.query(
      `SELECT d.id, d.dispatch_number,
              DATE_FORMAT(d.loading_date, '%Y-%m-%d') AS loading_date,
              d.company, d.customer_id, d.customer_name, d.customer_phone,
              d.customer_address, d.notes, d.status, d.completed_by,
              d.completed_at, d.created_by, d.created_at,
              COUNT(i.id) AS product_count,
              COALESCE(SUM(i.quantity), 0) AS total_quantity,
              GROUP_CONCAT(CONCAT(i.product_name, ' × ', FORMAT(i.quantity, 2)) ORDER BY i.id SEPARATOR ', ') AS products
       FROM sunday_loading_dispatches d
       LEFT JOIN sunday_loading_dispatch_items i ON i.dispatch_id = d.id
       ${where}
       GROUP BY d.id
       ORDER BY d.loading_date DESC, d.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const [summaryRows] = await pool.query(
      `SELECT COUNT(DISTINCT d.id) AS total_loadings,
              COUNT(DISTINCT CASE WHEN d.status = 'ACTIVE' THEN d.id END) AS active_loadings,
              COUNT(DISTINCT CASE WHEN d.status = 'COMPLETED' THEN d.id END) AS completed_loadings,
              COUNT(i.id) AS total_product_lines,
              COALESCE(SUM(i.quantity), 0) AS total_quantity
       FROM sunday_loading_dispatches d
       LEFT JOIN sunday_loading_dispatch_items i ON i.dispatch_id = d.id`
    );

    res.json({
      ok: true,
      records: rows.map(row => ({
        ...row,
        product_count: Number(row.product_count || 0),
        total_quantity: Number(row.total_quantity || 0)
      })),
      total: Number(countRows[0]?.total || 0),
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(Number(countRows[0]?.total || 0) / limit)),
      summary: {
        totalLoadings: Number(summaryRows[0]?.total_loadings || 0),
        activeLoadings: Number(summaryRows[0]?.active_loadings || 0),
        completedLoadings: Number(summaryRows[0]?.completed_loadings || 0),
        totalProductLines: Number(summaryRows[0]?.total_product_lines || 0),
        totalQuantity: Number(summaryRows[0]?.total_quantity || 0)
      }
    });
  } catch (error) {
    console.error('Failed to fetch Sunday loading sheets:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// PUT /api/sunday-loading/loading/:id/complete - Complete an active loading sheet.
router.put('/loading/:id/complete', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: 'Invalid loading sheet id.' });
    }
    const [result] = await pool.query(
      `UPDATE sunday_loading_dispatches
       SET status = 'COMPLETED', completed_by = ?, completed_at = NOW()
       WHERE id = ? AND status = 'ACTIVE'`,
      [req.admin?.username || 'admin', id]
    );
    if (!result.affectedRows) {
      return res.status(404).json({ ok: false, error: 'Active loading sheet not found.' });
    }
    res.json({ ok: true, message: 'Loading sheet completed successfully.' });
  } catch (error) {
    console.error('Failed to complete Sunday loading sheet:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// GET /api/sunday-loading/sales - Independent Sunday sales history.
router.get('/sales', async (req, res) => {
  try {
    let { page = 1, limit = 10, search = '' } = req.query;
    page = Math.max(1, parseInt(page, 10) || 1);
    limit = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
    const offset = (page - 1) * limit;
    const searchText = String(search).trim();
    const searchValue = `%${searchText}%`;
    const where = searchText
      ? 'WHERE s.sale_number LIKE ? OR s.customer_name LIKE ? OR s.company LIKE ? OR EXISTS (SELECT 1 FROM sunday_sale_items si WHERE si.sale_id = s.id AND si.product_name LIKE ?)'
      : '';
    const params = searchText ? [searchValue, searchValue, searchValue, searchValue] : [];
    const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM sunday_sales s ${where}`, params);
    const [rows] = await pool.query(
      `SELECT s.id, s.sale_number, DATE_FORMAT(s.sale_date, '%Y-%m-%d') AS sale_date,
              s.company, s.customer_id, s.customer_name, s.customer_phone,
              s.customer_address, s.total_amount, s.notes, s.created_by, s.created_at,
              COUNT(i.id) AS product_count,
              COALESCE(SUM(i.quantity), 0) AS total_quantity,
              GROUP_CONCAT(CONCAT(i.product_name, ' × ', FORMAT(i.quantity, 2)) ORDER BY i.id SEPARATOR ', ') AS products
       FROM sunday_sales s
       LEFT JOIN sunday_sale_items i ON i.sale_id = s.id
       ${where}
       GROUP BY s.id
       ORDER BY s.sale_date DESC, s.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const [summaryRows] = await pool.query(
      `SELECT COUNT(DISTINCT s.id) AS total_sales,
              COUNT(i.id) AS total_product_lines,
              COALESCE(SUM(i.quantity), 0) AS total_quantity,
              COALESCE(SUM(i.total_amount), 0) AS total_amount
       FROM sunday_sales s LEFT JOIN sunday_sale_items i ON i.sale_id = s.id`
    );
    const total = Number(countRows[0]?.total || 0);
    res.json({
      ok: true,
      records: rows.map(row => ({
        ...row,
        product_count: Number(row.product_count || 0),
        total_quantity: Number(row.total_quantity || 0),
        total_amount: Number(row.total_amount || 0)
      })),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      summary: {
        totalSales: Number(summaryRows[0]?.total_sales || 0),
        totalProductLines: Number(summaryRows[0]?.total_product_lines || 0),
        totalQuantity: Number(summaryRows[0]?.total_quantity || 0),
        totalAmount: Number(summaryRows[0]?.total_amount || 0)
      }
    });
  } catch (error) {
    console.error('Failed to fetch Sunday sales:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// POST /api/sunday-loading/sales - Create an independent Sunday sale.
router.post('/sales', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { saleDate, company, customerId, customerName, customerPhone, customerAddress, items: requestedItems, notes = '' } = req.body;
    const items = (Array.isArray(requestedItems) ? requestedItems : []).map(item => {
      const quantity = parseFloat(item.quantity);
      const rateWithTax = parseFloat(item.rateWithTax);
      const taxPercent = item.taxPercent === '' || item.taxPercent === null || item.taxPercent === undefined
        ? null
        : parseFloat(item.taxPercent);
      return {
        productId: item.productId ? parseInt(item.productId, 10) : null,
        productName: String(item.productName || '').trim(),
        quantity,
        rateWithTax,
        taxPercent,
        basicRate: Number.isFinite(rateWithTax) && Number.isFinite(taxPercent) ? rateWithTax / (1 + taxPercent / 100) : 0,
        totalAmount: Math.round(quantity * rateWithTax * 100) / 100
      };
    });
    if (!saleDate || !String(company || '').trim()) {
      return res.status(400).json({ ok: false, error: 'Sale date and company are required.' });
    }
    if (!customerId || !String(customerName || '').trim()) {
      return res.status(400).json({ ok: false, error: 'Please select a customer from Customer Master.' });
    }
    if (!items.length || items.some(item => !item.productId || !item.productName || !Number.isFinite(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.rateWithTax) || item.rateWithTax < 0 || !Number.isFinite(item.taxPercent) || !TAX_OPTIONS.includes(item.taxPercent))) {
      return res.status(400).json({ ok: false, error: 'Every product requires a Product Master selection, positive quantity, valid rate with tax, and supported Tax %.' });
    }
    const productIds = items.map(item => item.productId);
    if (new Set(productIds).size !== productIds.length) {
      return res.status(400).json({ ok: false, error: 'The same product cannot be added twice.' });
    }
    const [customerRows] = await connection.query('SELECT id FROM customers WHERE id = ? LIMIT 1', [customerId]);
    const [productRows] = await connection.query('SELECT id, name FROM finished_products WHERE id IN (?) AND status = 1', [productIds]);
    if (!customerRows.length || productRows.length !== items.length) {
      return res.status(400).json({ ok: false, error: 'Customer or product selection is no longer active in its master.' });
    }
    const productNames = new Map(productRows.map(row => [Number(row.id), row.name]));
    const totalAmount = Math.round(items.reduce((sum, item) => sum + item.totalAmount, 0) * 100) / 100;
    const saleNumber = await generateId('SLS', 'sunday_sales', 'sale_number');
    await connection.beginTransaction();
    const [result] = await connection.query(
      `INSERT INTO sunday_sales
        (sale_number, sale_date, company, customer_id, customer_name, customer_phone,
         customer_address, total_amount, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [saleNumber, saleDate, String(company).trim(), customerId, String(customerName).trim(),
        customerPhone ? String(customerPhone).trim() : null,
        customerAddress ? String(customerAddress).trim() : null,
        totalAmount, notes ? String(notes).trim() : null, req.admin?.username || 'admin']
    );
    for (const item of items) {
      await connection.query(
        `INSERT INTO sunday_sale_items
          (sale_id, product_id, product_name, quantity, rate_with_tax, tax_percent, basic_rate, total_amount)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [result.insertId, item.productId, productNames.get(item.productId), item.quantity,
          item.rateWithTax, item.taxPercent, item.basicRate, item.totalAmount]
      );
    }
    await connection.commit();
    res.json({ ok: true, id: result.insertId, saleNumber, totalAmount, message: 'Sunday sale saved successfully.' });
  } catch (error) {
    await connection.rollback();
    console.error('Failed to create Sunday sale:', error);
    res.status(500).json({ ok: false, error: error.message });
  } finally {
    connection.release();
  }
});

// GET /api/sunday-loading/:id - Single record details
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      `SELECT 
         id,
         transaction_number,
         DATE_FORMAT(loading_date, '%Y-%m-%d') AS loading_date,
         customer_id,
         customer_name,
         customer_phone,
         customer_address,
         customer_type,
         product_id,
         product_name,
         quantity,
         rate,
         total_amount,
         cash_amount,
         upi_amount,
         bank_amount,
         total_paid,
         due_amount,
         notes,
         created_by,
         created_at,
         updated_at
       FROM sunday_loading
       WHERE id = ? OR transaction_number = ?
       LIMIT 1`,
      [id, id]
    );

    if (!rows.length) {
      return res.status(404).json({ ok: false, error: 'Sunday loading record not found.' });
    }

    const r = rows[0];
    const [itemRows] = await pool.query(
      `SELECT id, product_id, product_name, quantity, rate, total_amount
       FROM sunday_loading_items
       WHERE sunday_loading_id = ?
       ORDER BY id`,
      [r.id]
    );
    res.json({
      ok: true,
      record: {
        ...r,
        quantity: parseFloat(r.quantity || 0),
        rate: parseFloat(r.rate || 0),
        total_amount: parseFloat(r.total_amount || 0),
        cash_amount: parseFloat(r.cash_amount || 0),
        upi_amount: parseFloat(r.upi_amount || 0),
        bank_amount: parseFloat(r.bank_amount || 0),
        total_paid: parseFloat(r.total_paid || 0),
        due_amount: parseFloat(r.due_amount || 0),
        items: itemRows.map(item => ({
          ...item,
          quantity: parseFloat(item.quantity || 0),
          rate: parseFloat(item.rate || 0),
          total_amount: parseFloat(item.total_amount || 0)
        }))
      }
    });
  } catch (error) {
    console.error('Failed to fetch sunday loading record:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// POST /api/sunday-loading/loading - Create an independent Sunday loading sheet.
router.post('/loading', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const {
      loadingDate,
      company,
      customerId,
      customerName,
      customerPhone,
      customerAddress,
      items: requestedItems,
      notes = ''
    } = req.body;

    const items = (Array.isArray(requestedItems) ? requestedItems : []).map(item => ({
      productId: item.productId ? parseInt(item.productId, 10) : null,
      productName: String(item.productName || '').trim(),
      quantity: parseFloat(item.quantity)
    }));

    if (!loadingDate || !String(company || '').trim()) {
      return res.status(400).json({ ok: false, error: 'Loading date and company are required.' });
    }
    if (!customerId || !String(customerName || '').trim()) {
      return res.status(400).json({ ok: false, error: 'Please select a customer from Customer Master.' });
    }
    if (!items.length || items.some(item => !item.productId || !item.productName || !Number.isFinite(item.quantity) || item.quantity <= 0)) {
      return res.status(400).json({ ok: false, error: 'Every product requires a Product Master selection and valid quantity.' });
    }

    const productIds = items.map(item => item.productId);
    if (new Set(productIds).size !== productIds.length) {
      return res.status(400).json({ ok: false, error: 'The same product cannot be added twice.' });
    }

    const [customerRows] = await connection.query('SELECT id FROM customers WHERE id = ? LIMIT 1', [customerId]);
    const [productRows] = await connection.query('SELECT id, name FROM finished_products WHERE id IN (?) AND status = 1', [productIds]);
    if (!customerRows.length || productRows.length !== items.length) {
      return res.status(400).json({ ok: false, error: 'Customer or product selection is no longer active in its master.' });
    }
    const productNames = new Map(productRows.map(row => [Number(row.id), row.name]));

    const dispatchNumber = await generateId('SLD', 'sunday_loading_dispatches', 'dispatch_number');
    await connection.beginTransaction();
    const [result] = await connection.query(
      `INSERT INTO sunday_loading_dispatches
        (dispatch_number, loading_date, company, customer_id, customer_name,
         customer_phone, customer_address, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        dispatchNumber,
        loadingDate,
        String(company).trim(),
        customerId,
        String(customerName).trim(),
        customerPhone ? String(customerPhone).trim() : null,
        customerAddress ? String(customerAddress).trim() : null,
        notes ? String(notes).trim() : null,
        req.admin?.username || 'admin'
      ]
    );

    for (const item of items) {
      await connection.query(
        `INSERT INTO sunday_loading_dispatch_items
          (dispatch_id, product_id, product_name, quantity)
         VALUES (?, ?, ?, ?)`,
        [result.insertId, item.productId, productNames.get(item.productId), item.quantity]
      );
    }
    await connection.commit();
    res.json({ ok: true, id: result.insertId, dispatchNumber, message: 'Sunday loading sheet saved successfully.' });
  } catch (error) {
    await connection.rollback();
    console.error('Failed to create Sunday loading sheet:', error);
    res.status(500).json({ ok: false, error: error.message });
  } finally {
    connection.release();
  }
});

// POST /api/sunday-loading - Create Sunday Loading record (Completely Isolated)
router.post('/', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const {
      loadingDate,
      customerId,
      customerName,
      customerPhone,
      customerAddress,
      customerType,
      productId,
      productName,
      quantity: rawQty,
      rate: rawRate,
      cashAmount: rawCash = 0,
      upiAmount: rawUpi = 0,
      bankAmount: rawBank = 0,
      notes = '',
      items: requestedItems
    } = req.body;

    const trimmedCustName = String(customerName || '').trim();
    const items = (Array.isArray(requestedItems) && requestedItems.length
      ? requestedItems
      : [{ productId, productName, quantity: rawQty, rate: rawRate }]
    ).map(item => {
      const quantity = parseFloat(item.quantity);
      const rate = parseFloat(item.rate);
      return {
        productId: item.productId ? parseInt(item.productId, 10) : null,
        productName: String(item.productName || '').trim(),
        quantity,
        rate,
        totalAmount: Math.round(quantity * rate * 100) / 100
      };
    });

    if (!trimmedCustName) {
      return res.status(400).json({ ok: false, error: 'Customer Name is required.' });
    }
    if (!items.length || items.some(item =>
      !item.productName || !Number.isFinite(item.quantity) || item.quantity <= 0 ||
      !Number.isFinite(item.rate) || item.rate < 0
    )) {
      return res.status(400).json({ ok: false, error: 'Every product requires a valid product, quantity, and rate.' });
    }

    const cash = Math.max(0, parseFloat(rawCash) || 0);
    const upi = Math.max(0, parseFloat(rawUpi) || 0);
    const bank = Math.max(0, parseFloat(rawBank) || 0);

    const totalAmount = Math.round(items.reduce((sum, item) => sum + item.totalAmount, 0) * 100) / 100;
    const totalPaid = Math.round((cash + upi + bank) * 100) / 100;

    if (totalPaid > totalAmount) {
      return res.status(400).json({
        ok: false,
        error: `Total payment (₹${totalPaid.toFixed(2)}) cannot exceed Total Amount (₹${totalAmount.toFixed(2)}).`
      });
    }

    const dueAmount = Math.round((totalAmount - totalPaid) * 100) / 100;

    let targetDate = loadingDate;
    if (!targetDate) {
      const now = new Date();
      const offset = now.getTimezoneOffset();
      const istDate = new Date(now.getTime() + (330 + offset) * 60000);
      const yyyy = istDate.getFullYear();
      const mm = String(istDate.getMonth() + 1).padStart(2, '0');
      const dd = String(istDate.getDate()).padStart(2, '0');
      targetDate = `${yyyy}-${mm}-${dd}`;
    }

    const transactionNumber = await generateId('SL', 'sunday_loading', 'transaction_number');
    const createdBy = req.admin?.username || 'admin';
    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    const productSummary = items.length === 1
      ? items[0].productName
      : `${items[0].productName} + ${items.length - 1} more`;

    await connection.beginTransaction();

    const [result] = await connection.query(
      `INSERT INTO sunday_loading (
         transaction_number,
         loading_date,
         customer_id,
         customer_name,
         customer_phone,
         customer_address,
         customer_type,
         product_id,
         product_name,
         quantity,
         rate,
         total_amount,
         cash_amount,
         upi_amount,
         bank_amount,
         total_paid,
         due_amount,
         notes,
         created_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        transactionNumber,
        targetDate,
        customerId || null,
        trimmedCustName,
        customerPhone ? String(customerPhone).trim() : null,
        customerAddress ? String(customerAddress).trim() : null,
        customerType ? String(customerType).trim() : 'General Customer',
        items.length === 1 ? items[0].productId : null,
        productSummary,
        totalQuantity,
        items.length === 1 ? items[0].rate : 0,
        totalAmount,
        cash,
        upi,
        bank,
        totalPaid,
        dueAmount,
        notes ? String(notes).trim() : null,
        createdBy
      ]
    );

    for (const item of items) {
      await connection.query(
        `INSERT INTO sunday_loading_items
          (sunday_loading_id, product_id, product_name, quantity, rate, total_amount)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [result.insertId, item.productId, item.productName, item.quantity, item.rate, item.totalAmount]
      );
    }

    await connection.commit();

    res.json({
      ok: true,
      message: 'Sunday loading transaction recorded successfully!',
      transactionNumber,
      id: result.insertId,
      record: {
        id: result.insertId,
        transaction_number: transactionNumber,
        loading_date: targetDate,
        customer_name: trimmedCustName,
        product_name: productSummary,
        quantity: totalQuantity,
        rate: items.length === 1 ? items[0].rate : 0,
        items,
        total_amount: totalAmount,
        cash_amount: cash,
        upi_amount: upi,
        bank_amount: bank,
        total_paid: totalPaid,
        due_amount: dueAmount
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Failed to create sunday loading record:', error);
    res.status(500).json({ ok: false, error: error.message });
  } finally {
    connection.release();
  }
});

// PUT /api/sunday-loading/:id - Update Sunday Loading record
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      loadingDate,
      customerId,
      customerName,
      customerPhone,
      customerAddress,
      customerType,
      productId,
      productName,
      quantity: rawQty,
      rate: rawRate,
      cashAmount: rawCash = 0,
      upiAmount: rawUpi = 0,
      bankAmount: rawBank = 0,
      notes = ''
    } = req.body;

    const trimmedCustName = String(customerName || '').trim();
    const trimmedProdName = String(productName || '').trim();

    if (!trimmedCustName) {
      return res.status(400).json({ ok: false, error: 'Customer Name is required.' });
    }
    if (!trimmedProdName) {
      return res.status(400).json({ ok: false, error: 'Product is required.' });
    }

    const qty = parseFloat(rawQty);
    if (isNaN(qty) || qty <= 0) {
      return res.status(400).json({ ok: false, error: 'Quantity must be greater than 0.' });
    }

    const rate = parseFloat(rawRate);
    if (isNaN(rate) || rate < 0) {
      return res.status(400).json({ ok: false, error: 'Rate must be a valid non-negative number.' });
    }

    const cash = Math.max(0, parseFloat(rawCash) || 0);
    const upi = Math.max(0, parseFloat(rawUpi) || 0);
    const bank = Math.max(0, parseFloat(rawBank) || 0);

    const totalAmount = Math.round((qty * rate) * 100) / 100;
    const totalPaid = Math.round((cash + upi + bank) * 100) / 100;

    if (totalPaid > totalAmount) {
      return res.status(400).json({
        ok: false,
        error: `Total payment (₹${totalPaid.toFixed(2)}) cannot exceed Total Amount (₹${totalAmount.toFixed(2)}).`
      });
    }

    const dueAmount = Math.round((totalAmount - totalPaid) * 100) / 100;

    const [updateResult] = await pool.query(
      `UPDATE sunday_loading SET
         loading_date = COALESCE(?, loading_date),
         customer_id = ?,
         customer_name = ?,
         customer_phone = ?,
         customer_address = ?,
         customer_type = ?,
         product_id = ?,
         product_name = ?,
         quantity = ?,
         rate = ?,
         total_amount = ?,
         cash_amount = ?,
         upi_amount = ?,
         bank_amount = ?,
         total_paid = ?,
         due_amount = ?,
         notes = ?
       WHERE id = ?`,
      [
        loadingDate || null,
        customerId || null,
        trimmedCustName,
        customerPhone ? String(customerPhone).trim() : null,
        customerAddress ? String(customerAddress).trim() : null,
        customerType ? String(customerType).trim() : 'General Customer',
        productId ? parseInt(productId, 10) : null,
        trimmedProdName,
        qty,
        rate,
        totalAmount,
        cash,
        upi,
        bank,
        totalPaid,
        dueAmount,
        notes ? String(notes).trim() : null,
        id
      ]
    );

    if (updateResult.affectedRows === 0) {
      return res.status(404).json({ ok: false, error: 'Sunday loading record not found.' });
    }

    res.json({
      ok: true,
      message: 'Sunday loading record updated successfully!'
    });
  } catch (error) {
    console.error('Failed to update sunday loading record:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// DELETE /api/sunday-loading/:id - Delete Sunday Loading record (Isolated)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await pool.query(
      'DELETE FROM sunday_loading WHERE id = ? OR transaction_number = ?',
      [id, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ ok: false, error: 'Sunday loading record not found.' });
    }

    res.json({
      ok: true,
      message: 'Sunday loading record deleted successfully.'
    });
  } catch (error) {
    console.error('Failed to delete sunday loading record:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
