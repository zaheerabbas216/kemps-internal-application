import express from 'express';
import pool from '../config/db.js';

const router = express.Router();

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
        due_amount: parseFloat(r.due_amount || 0)
      }
    });
  } catch (error) {
    console.error('Failed to fetch sunday loading record:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// POST /api/sunday-loading - Create Sunday Loading record (Completely Isolated)
router.post('/', async (req, res) => {
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

    const [result] = await pool.query(
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
        createdBy
      ]
    );

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
        product_name: trimmedProdName,
        quantity: qty,
        rate,
        total_amount: totalAmount,
        cash_amount: cash,
        upi_amount: upi,
        bank_amount: bank,
        total_paid: totalPaid,
        due_amount: dueAmount
      }
    });
  } catch (error) {
    console.error('Failed to create sunday loading record:', error);
    res.status(500).json({ ok: false, error: error.message });
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
