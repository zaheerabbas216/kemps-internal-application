import express from 'express';
import pool from '../config/db.js';
import { addLedgerEntry } from '../helpers/ledgerHelper.js';

const router = express.Router();

// Helper to generate custom sequence ID
async function generateId(prefix, table, idColumn, connection = pool) {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  // Adjust to IST timezone (UTC+5:30)
  const istDate = new Date(now.getTime() + (330 + offset) * 60000);
  const yyyy = istDate.getFullYear();
  
  if (prefix === 'EXP') {
    const mm = String(istDate.getMonth() + 1).padStart(2, '0');
    const dd = String(istDate.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}${mm}${dd}`;
    
    const [rows] = await connection.query(
      `SELECT ${idColumn} FROM ${table} WHERE ${idColumn} LIKE ? ORDER BY ${idColumn} DESC LIMIT 1`,
      [`EXP-${dateStr}-%`]
    );
    
    let seq = 1;
    if (rows.length) {
      const lastId = rows[0][idColumn];
      const match = lastId.match(/^EXP-\d{8}-(\d+)$/);
      if (match && match[1]) {
        seq = parseInt(match[1]) + 1;
      }
    }
    return `EXP-${dateStr}-${String(seq).padStart(4, '0')}`;
  }
  
  const [rows] = await connection.query(
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

// GET /api/sales-return/invoices
// Fetch all invoices for a customer with optional date range filters
router.get('/invoices', async (req, res) => {
  try {
    const { customerId, startDate, endDate } = req.query;
    if (!customerId) {
      return res.status(400).json({ ok: false, error: 'Customer ID is required.' });
    }

    let queryParams = [customerId];
    let whereClauses = ['cb.customer_id = ?'];

    if (startDate) {
      whereClauses.push('cb.billing_date >= ?');
      queryParams.push(startDate);
    }
    if (endDate) {
      whereClauses.push('cb.billing_date <= ?');
      queryParams.push(endDate);
    }

    const whereStr = `WHERE ${whereClauses.join(' AND ')}`;

    const [rows] = await pool.query(
      `SELECT 
         cb.id,
         DATE_FORMAT(cb.billing_date, '%Y-%m-%d') as billing_date,
         cb.grand_total,
         cb.amount_paid,
         cb.due_amount,
         CASE 
           WHEN cb.due_amount = 0 THEN 'Paid'
           WHEN cb.due_amount = cb.grand_total THEN 'Unpaid'
           ELSE 'Partially Paid'
         END as payment_status
       FROM customer_bills cb
       ${whereStr}
       ORDER BY cb.billing_date DESC, cb.created_at DESC`,
      queryParams
    );

    res.json({ ok: true, invoices: rows });
  } catch (error) {
    console.error('Fetch invoices error:', error);
    res.status(400).json({ ok: false, error: error.message });
  }
});

// GET /api/sales-return/invoice/:billId
// Fetch invoice products with billed, previously returned, and available return quantities
router.get('/invoice/:billId', async (req, res) => {
  try {
    const { billId } = req.params;

    // First check if invoice exists
    const [billExists] = await pool.query('SELECT id, customer_id FROM customer_bills WHERE id = ?', [billId]);
    if (billExists.length === 0) {
      return res.status(404).json({ ok: false, error: 'Invoice not found.' });
    }

    const [items] = await pool.query(
      `SELECT 
         cbi.finished_product_id AS finishedProductId,
         fp.name AS productName,
         cbi.quantity AS billedQty,
         cbi.rate_with_tax AS rateWithTax,
         cbi.tax_percent AS taxPercent,
         COALESCE(
           (SELECT SUM(sri.quantity) 
            FROM sales_return_items sri 
            JOIN sales_returns sr ON sri.sales_return_id = sr.id 
            WHERE sr.bill_id = cbi.bill_id AND sri.finished_product_id = cbi.finished_product_id), 
           0
         ) AS previouslyReturnedQty
       FROM customer_bill_items cbi
       JOIN finished_products fp ON cbi.finished_product_id = fp.id
       WHERE cbi.bill_id = ?`,
      [billId]
    );

    // Calculate available return quantity for each item
    const formattedItems = items.map(item => {
      const billed = parseInt(item.billedQty, 10);
      const returned = parseInt(item.previouslyReturnedQty, 10);
      const available = billed - returned;
      return {
        ...item,
        billedQty: billed,
        previouslyReturnedQty: returned,
        availableReturnQty: available < 0 ? 0 : available
      };
    });

    res.json({ ok: true, items: formattedItems, bill: billExists[0] });
  } catch (error) {
    console.error('Fetch invoice items error:', error);
    res.status(400).json({ ok: false, error: error.message });
  }
});

// POST /api/sales-return
// Create a Sales Return/Credit Note (Transaction Safe)
router.post('/', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { billId, returnDate, reason, items = [] } = req.body;
    const createdBy = req.admin?.name || req.admin?.username || 'System';

    if (!billId) throw new Error('Invoice Number (billId) is required.');
    if (!returnDate) throw new Error('Return Date is required.');
    if (!reason) throw new Error('Return Reason is required.');
    if (items.length === 0) throw new Error('At least one returned item is required.');

    // 1. Fetch parent invoice details
    const [billRows] = await connection.query(
      `SELECT customer_id, due_amount, grand_total, amount_paid FROM customer_bills WHERE id = ? FOR UPDATE`,
      [billId]
    );
    if (billRows.length === 0) {
      throw new Error('Invoice not found.');
    }
    const bill = billRows[0];
    const customerId = bill.customer_id;

    let totalReturnAmount = 0;
    const validatedItems = [];

    // 2. Validate available return quantities and calculate values
    for (const item of items) {
      const { finishedProductId, quantity } = item;
      const q = parseInt(quantity, 10);
      if (isNaN(q) || q <= 0) {
        throw new Error('Return quantity must be greater than 0.');
      }

      // Get billed product details and previously returned quantities
      const [cbiRows] = await connection.query(
        `SELECT cbi.quantity AS billedQty, cbi.rate_with_tax, cbi.tax_percent, fp.name AS productName
         FROM customer_bill_items cbi
         JOIN finished_products fp ON cbi.finished_product_id = fp.id
         WHERE cbi.bill_id = ? AND cbi.finished_product_id = ?`,
        [billId, parseInt(finishedProductId, 10)]
      );

      if (cbiRows.length === 0) {
        throw new Error(`Product ID ${finishedProductId} does not exist in invoice ${billId}.`);
      }

      const cbi = cbiRows[0];
      const billedQty = parseInt(cbi.billedQty, 10);

      const [retSum] = await connection.query(
        `SELECT COALESCE(SUM(sri.quantity), 0) AS returnedQty
         FROM sales_return_items sri
         JOIN sales_returns sr ON sri.sales_return_id = sr.id
         WHERE sr.bill_id = ? AND sri.finished_product_id = ?`,
        [billId, parseInt(finishedProductId, 10)]
      );

      const previouslyReturned = parseInt(retSum[0].returnedQty, 10);
      const availableReturn = billedQty - previouslyReturned;

      if (q > availableReturn) {
        throw new Error(`Returned quantity for product '${cbi.productName}' (${q}) cannot exceed available return quantity (${availableReturn}).`);
      }

      const rate = parseFloat(cbi.rate_with_tax);
      const taxPct = parseFloat(cbi.tax_percent);
      const rowTotal = q * rate;
      totalReturnAmount += rowTotal;

      // Retrieve unit cost of this finished product
      const [costRows] = await connection.query(
        `SELECT total_cost FROM cost_sheets WHERE finished_product_id = ?`,
        [parseInt(finishedProductId, 10)]
      );
      const unitCost = costRows.length > 0 ? parseFloat(costRows[0].total_cost) : 0.0000;
      const itemCogs = q * unitCost;

      validatedItems.push({
        finishedProductId: parseInt(finishedProductId, 10),
        quantity: q,
        rateWithTax: rate,
        taxPercent: taxPct,
        totalAmount: rowTotal,
        unitCost,
        itemCogs
      });
    }

    const totalReturnedCogs = validatedItems.reduce((acc, curr) => acc + curr.itemCogs, 0);

    // 3. Generate Return ID
    const returnId = await generateId('SR', 'sales_returns', 'id', connection);

    // 4. Create Sales Return entry
    await connection.query(
      `INSERT INTO sales_returns (id, return_date, customer_id, bill_id, total_return_amount, reason, created_by, cogs, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [returnId, returnDate, customerId, billId, totalReturnAmount, reason, createdBy, totalReturnedCogs]
    );

    // 5. Create Sales Return items & update inventory via Stock Register
    for (const vItem of validatedItems) {
      await connection.query(
        `INSERT INTO sales_return_items (sales_return_id, finished_product_id, quantity, rate_with_tax, tax_percent, total_amount, unit_cost, total_cost)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [returnId, vItem.finishedProductId, vItem.quantity, vItem.rateWithTax, vItem.taxPercent, vItem.totalAmount, vItem.unitCost, vItem.itemCogs]
      );

      // Inventory: Add stock back to finished products inventory (positive value)
      await connection.query(
        `INSERT INTO stock_register (item_type, item_id, transaction_type, reference_id, quantity, created_at)
         VALUES ('FINISHED_PRODUCT', ?, 'RETURN', ?, ?, NOW())`,
        [vItem.finishedProductId, returnId, vItem.quantity]
      );
    }

    // 6. Accounting: Create Expense entry
    const expenseId = await generateId('EXP', 'expenses', 'id', connection);
    await connection.query(
      `INSERT INTO expenses (id, expense_date, particulars, amount, entered_by, remarks, 
        payment_status, approved_amount, pending_amount, rejected_amount, category, payment_method, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'Approved', ?, 0.00, 0.00, 'Sales Return', 'Cash', NOW())`,
      [
        expenseId,
        returnDate,
        `Sales Return: ${returnId}`,
        totalReturnAmount,
        createdBy,
        `Returned goods against invoice: ${billId}`,
        totalReturnAmount
      ]
    );

    // 7. Customer Ledger / Ledger update
    const currentDue = parseFloat(bill.due_amount);
    let newDue = 0;
    let creditBalanceAddition = 0;

    if (totalReturnAmount <= currentDue) {
      newDue = currentDue - totalReturnAmount;
      creditBalanceAddition = 0;
    } else {
      newDue = 0;
      creditBalanceAddition = totalReturnAmount - currentDue;
    }

    // Update due amount on parent invoice
    await connection.query(
      `UPDATE customer_bills SET due_amount = ? WHERE id = ?`,
      [newDue, billId]
    );

    // Add remaining excess credit balance to the customer
    if (creditBalanceAddition > 0) {
      await connection.query(
        `UPDATE customers SET credit_balance = credit_balance + ? WHERE id = ?`,
        [creditBalanceAddition, customerId]
      );
    }

    // Customer Ledger Hook: PAYMENT credit representing Sales Return / Credit Note
    await addLedgerEntry(connection, {
      date: returnDate,
      customerId: customerId,
      entryType: 'PAYMENT',
      referenceNo: returnId,
      particular: `Sales Return (Credit Note) — Bill ${billId}`,
      debit: 0.00,
      credit: totalReturnAmount
    });

    await connection.commit();
    res.json({
      ok: true,
      id: returnId,
      totalReturnAmount,
      adjustedDue: newDue,
      creditBalanceCreated: creditBalanceAddition,
      message: 'Sales return completed and inventory/ledgers updated successfully!'
    });
  } catch (error) {
    await connection.rollback();
    console.error('Create sales return error:', error);
    res.status(400).json({ ok: false, error: error.message });
  } finally {
    connection.release();
  }
});

// GET /api/sales-return/history
// List returns history with optional filters and pagination
router.get('/history', async (req, res) => {
  try {
    let { page = 1, limit = 10, search = '', startDate = '', endDate = '' } = req.query;
    page = parseInt(page, 10);
    limit = parseInt(limit, 10);
    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1) limit = 10;

    const offset = (page - 1) * limit;
    let queryParams = [];
    let whereClauses = [];

    if (startDate) {
      whereClauses.push('sr.return_date >= ?');
      queryParams.push(startDate);
    }
    if (endDate) {
      whereClauses.push('sr.return_date <= ?');
      queryParams.push(endDate);
    }

    if (search.trim()) {
      whereClauses.push('(c.name LIKE ? OR c.phone LIKE ? OR sr.id LIKE ? OR sr.bill_id LIKE ?)');
      const wild = `%${search.trim()}%`;
      queryParams.push(wild, wild, wild, wild);
    }

    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Count query
    const [countRows] = await pool.query(
      `SELECT COUNT(*) as count 
       FROM sales_returns sr
       JOIN customers c ON sr.customer_id = c.id
       ${whereStr}`,
      queryParams
    );
    const total = countRows[0].count;

    // Details query
    let selectParams = [...queryParams, limit, offset];
    const [rows] = await pool.query(
      `SELECT 
         sr.id as returnNumber,
         DATE_FORMAT(sr.return_date, '%Y-%m-%d') as returnDate,
         sr.bill_id as invoiceNumber,
         sr.total_return_amount as returnAmount,
         sr.reason,
         sr.created_by as createdBy,
         sr.created_at as timestamp,
         c.name as customerName,
         c.phone as customerPhone,
         (SELECT GROUP_CONCAT(CONCAT(fp.name, ' (x', sri.quantity, ')') SEPARATOR ', ')
          FROM sales_return_items sri
          JOIN finished_products fp ON sri.finished_product_id = fp.id
          WHERE sri.sales_return_id = sr.id) as productsReturned
       FROM sales_returns sr
       JOIN customers c ON sr.customer_id = c.id
       ${whereStr}
       ORDER BY sr.return_date DESC, sr.created_at DESC
       LIMIT ? OFFSET ?`,
      selectParams
    );

    res.json({
      ok: true,
      returns: rows,
      total,
      page,
      limit
    });
  } catch (error) {
    console.error('Fetch sales return history error:', error);
    res.status(400).json({ ok: false, error: error.message });
  }
});

// GET /api/sales-return/reports
// Fetch analytics summaries for reports tabs
router.get('/reports', async (req, res) => {
  try {
    // 1. Customer Return Report
    const [customerReports] = await pool.query(
      `SELECT 
         c.id as customerId,
         c.name as customerName,
         c.phone as customerPhone,
         COUNT(sr.id) as returnCount,
         SUM(sr.total_return_amount) as totalReturned
       FROM sales_returns sr
       JOIN customers c ON sr.customer_id = c.id
       GROUP BY c.id, c.name, c.phone
       ORDER BY totalReturned DESC`
    );

    // 2. Product Return Report
    const [productReports] = await pool.query(
      `SELECT 
         sri.finished_product_id as productId,
         fp.name as productName,
         SUM(sri.quantity) as totalQtyReturned,
         SUM(sri.total_amount) as totalReturnedVal
       FROM sales_return_items sri
       JOIN finished_products fp ON sri.finished_product_id = fp.id
       GROUP BY sri.finished_product_id, fp.name
       ORDER BY totalReturnedVal DESC`
    );

    // 3. Sales Return Register (all credit notes)
    const [registerReport] = await pool.query(
      `SELECT 
         sr.id as returnNumber,
         DATE_FORMAT(sr.return_date, '%Y-%m-%d') as returnDate,
         c.name as customerName,
         sr.bill_id as invoiceNumber,
         sr.total_return_amount as returnAmount,
         sr.reason,
         sr.created_by as createdBy
       FROM sales_returns sr
       JOIN customers c ON sr.customer_id = c.id
       ORDER BY sr.return_date DESC`
    );

    // 4. Return Expense Report
    const [expenseReport] = await pool.query(
      `SELECT 
         e.id as expenseId,
         DATE_FORMAT(e.expense_date, '%Y-%m-%d') as expenseDate,
         e.particulars,
         e.amount,
         e.entered_by as enteredBy,
         e.remarks
       FROM expenses e
       WHERE e.particulars LIKE 'Sales Return: SR-%'
       ORDER BY e.expense_date DESC`
    );

    res.json({
      ok: true,
      customerReturnReport: customerReports,
      productReturnReport: productReports,
      salesReturnRegister: registerReport,
      returnExpenseReport: expenseReport
    });
  } catch (error) {
    console.error('Fetch reports error:', error);
    res.status(400).json({ ok: false, error: error.message });
  }
});

export default router;
