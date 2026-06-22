import express from 'express';
import pool from '../config/db.js';
import { createPaymentApprovalEntry } from '../helpers/paymentApprovalHelper.js';
import { addLedgerEntry, deleteLedgerEntriesForReference } from '../helpers/ledgerHelper.js';

const router = express.Router();

function normalizePhone10(phone) {
  let s = String(phone || '').trim();
  const digits = s.replace(/\D+/g, '');
  const ph = digits.length >= 10 ? digits.slice(-10) : digits;
  if (!/^\d{10}$/.test(ph)) throw new Error("Phone must be exactly 10 digits.");
  return ph;
}

// Helper to generate custom sequence ID
async function generateId(prefix, table, idColumn, connection = pool) {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  // Adjust to IST timezone (UTC+5:30)
  const istDate = new Date(now.getTime() + (330 + offset) * 60000);
  const yyyy = istDate.getFullYear();
  
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

// GET /api/billing/today - Retrieves today's invoices and calculates stats
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

    // Get today's aggregates
    const [summaryRows] = await pool.query(
      `SELECT 
         COALESCE(SUM(grand_total), 0) as totalBilled,
         COALESCE(SUM(amount_paid), 0) as cashCollected,
         COALESCE(SUM(due_amount), 0) as creditDue,
         COUNT(*) as totalInvoices 
       FROM customer_bills 
       WHERE billing_date = ?`,
      [todayStr]
    );

    const summary = {
      totalBilled: parseFloat(summaryRows[0].totalBilled),
      cashCollected: parseFloat(summaryRows[0].cashCollected),
      creditDue: parseFloat(summaryRows[0].creditDue),
      totalInvoices: parseInt(summaryRows[0].totalInvoices, 10)
    };

    let queryParams = [todayStr];
    let whereClause = 'WHERE cb.billing_date = ?';

    if (search.trim()) {
      whereClause += ' AND (cb.customer_name LIKE ? OR cb.customer_phone LIKE ? OR cb.id LIKE ?)';
      const wildSearch = `%${search.trim()}%`;
      queryParams.push(wildSearch, wildSearch, wildSearch);
    }

    const [rows] = await pool.query(
      `SELECT 
         cb.id,
         DATE_FORMAT(cb.billing_date, '%Y-%m-%d') as billing_date,
         cb.company,
         cb.customer_type,
         cb.customer_id,
         cb.customer_name,
         cb.customer_phone,
         cb.customer_gstin,
         cb.customer_address,
         cb.grand_total,
         cb.payment_mode,
         cb.amount_paid,
         cb.due_amount,
         cb.created_at
       FROM customer_bills cb
       ${whereClause} 
       ORDER BY cb.created_at DESC`,
      queryParams
    );

    res.json({
      ok: true,
      bills: rows,
      todayStr,
      summary
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// GET /api/billing - Retrieves paginated invoice history
router.get('/', async (req, res) => {
  try {
    let { page = 1, limit = 10, search = '', startDate = '', endDate = '', company = '' } = req.query;
    page = parseInt(page, 10);
    limit = parseInt(limit, 10);
    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1) limit = 10;

    const offset = (page - 1) * limit;
    let queryParams = [];
    let whereClauses = [];

    if (startDate) {
      whereClauses.push('cb.billing_date >= ?');
      queryParams.push(startDate);
    }
    if (endDate) {
      whereClauses.push('cb.billing_date <= ?');
      queryParams.push(endDate);
    }

    if (company && company !== 'All') {
      whereClauses.push('cb.company = ?');
      queryParams.push(company);
    }

    if (search.trim()) {
      whereClauses.push('(cb.customer_name LIKE ? OR cb.customer_phone LIKE ? OR cb.id LIKE ?)');
      const wild = `%${search.trim()}%`;
      queryParams.push(wild, wild, wild);
    }

    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Get total count
    const [countRows] = await pool.query(
      `SELECT COUNT(*) as count FROM customer_bills cb ${whereStr}`,
      queryParams
    );
    const total = countRows[0].count;

    // Get paginated bills
    let selectParams = [...queryParams, limit, offset];
    const [rows] = await pool.query(
      `SELECT 
         cb.id,
         DATE_FORMAT(cb.billing_date, '%Y-%m-%d') as billing_date,
         cb.company,
         cb.customer_type,
         cb.customer_id,
         cb.customer_name,
         cb.customer_phone,
         cb.customer_gstin,
         cb.customer_address,
         cb.grand_total,
         cb.payment_mode,
         cb.amount_paid,
         cb.due_amount,
         cb.created_at
       FROM customer_bills cb
       ${whereStr}
       ORDER BY cb.billing_date DESC, cb.created_at DESC
       LIMIT ? OFFSET ?`,
      selectParams
    );

    res.json({
      ok: true,
      bills: rows,
      total,
      page,
      limit
    });
  } catch (error) {
    console.error('Fetch billing history error:', error);
    res.status(400).json({ ok: false, error: error.message });
  }
});

// GET /api/billing/:id - Retrieves detailed metadata of a single invoice and item lines
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch bill header
    const [billRows] = await pool.query(
      `SELECT 
         cb.id,
         DATE_FORMAT(cb.billing_date, '%Y-%m-%d') as billing_date,
         cb.company,
         cb.customer_type,
         cb.customer_id,
         cb.customer_name,
         cb.customer_phone,
         cb.customer_gstin,
         cb.customer_address,
         cb.grand_total,
         cb.payment_mode,
         cb.amount_paid,
         cb.due_amount,
         cb.cash_paid,
         cb.upi_paid,
         cb.bank_paid,
         cb.created_at
       FROM customer_bills cb
       WHERE cb.id = ?`,
      [id]
    );

    if (billRows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Invoice not found.' });
    }

    // Fetch items
    const [itemRows] = await pool.query(
      `SELECT 
         cbi.id,
         cbi.finished_product_id,
         fp.name AS product_name,
         cbi.quantity,
         cbi.rate_with_tax,
         cbi.tax_percent,
         cbi.basic_rate,
         cbi.total_amount
       FROM customer_bill_items cbi
       JOIN finished_products fp ON cbi.finished_product_id = fp.id
       WHERE cbi.bill_id = ?`,
      [id]
    );

    res.json({
      ok: true,
      bill: billRows[0],
      items: itemRows
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// POST /api/billing - Creates a customer bill (Transaction Safe)
router.post('/', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const {
      billingDate,
      company,
      customerType,
      customerName,
      customerPhone,
      customerGstin = '',
      customerAddress = '',
      grandTotal,
      paymentMode,
      amountPaid,
      dueAmount,
      items = [], // Array of { finishedProductId, quantity, rateWithTax, taxPercent }
      loadingSessionId,
      orderId,
      cashPaid,
      upiPaid,
      bankPaid
    } = req.body;

    // Normalization and fallback for multiple payment modes
    let finalCashPaid = parseFloat(cashPaid);
    let finalUpiPaid = parseFloat(upiPaid);
    let finalBankPaid = parseFloat(bankPaid);

    if (isNaN(finalCashPaid) && isNaN(finalUpiPaid) && isNaN(finalBankPaid)) {
      const amt = parseFloat(amountPaid) || 0.00;
      const mode = String(paymentMode || '').toLowerCase();
      if (mode.includes('cash')) {
        finalCashPaid = amt;
        finalUpiPaid = 0.00;
        finalBankPaid = 0.00;
      } else if (mode.includes('upi')) {
        finalCashPaid = 0.00;
        finalUpiPaid = amt;
        finalBankPaid = 0.00;
      } else if (mode.includes('bank')) {
        finalCashPaid = 0.00;
        finalUpiPaid = 0.00;
        finalBankPaid = amt;
      } else {
        finalCashPaid = 0.00;
        finalUpiPaid = 0.00;
        finalBankPaid = 0.00;
      }
    } else {
      finalCashPaid = finalCashPaid || 0.00;
      finalUpiPaid = finalUpiPaid || 0.00;
      finalBankPaid = finalBankPaid || 0.00;
    }

    let initialAmountPaid = finalCashPaid + finalUpiPaid + finalBankPaid;
    let initialDueAmount = (parseFloat(grandTotal) || 0.00) - initialAmountPaid;
    if (initialDueAmount < 0) initialDueAmount = 0.00;

    // Validation
    if (!billingDate) throw new Error('Billing Date is required.');
    if (!company) throw new Error('Company is required.');
    if (!customerType) throw new Error('Customer Type is required.');
    if (!customerName || !String(customerName).trim()) throw new Error('Customer Name is required.');
    if (!customerPhone) throw new Error('Customer Phone is required.');
    if (items.length === 0) throw new Error('At least one product line is required.');

    const cleanPhone = normalizePhone10(customerPhone);
    const cleanName = String(customerName).trim();
    const cleanGst = String(customerGstin).trim();
    const cleanAddress = String(customerAddress).trim();

    // 1. Resolve or Create Customer
    let customerId = null;
    let customerCreditBalance = 0.00;
    const [existingCust] = await connection.query(
      `SELECT id, credit_balance FROM customers WHERE phone = ?`,
      [cleanPhone]
    );

    if (existingCust.length > 0) {
      customerId = existingCust[0].id;
      customerCreditBalance = parseFloat(existingCust[0].credit_balance || 0.00);
      // Soft update existing customer details
      await connection.query(
        `UPDATE customers SET name = ?, gstin = ?, address = ? WHERE id = ?`,
        [cleanName, cleanGst, cleanAddress, customerId]
      );
    } else {
      // Create new customer
      customerId = await generateId('CUST', 'customers', 'id', connection);
      await connection.query(
        `INSERT INTO customers (id, name, phone, gstin, address, created_at) VALUES (?, ?, ?, ?, ?, NOW())`,
        [customerId, cleanName, cleanPhone, cleanGst, cleanAddress]
      );
    }

    // Apply customer credit balance if any and if there is a due amount
    let appliedCredit = 0.00;
    let finalDueAmount = initialDueAmount;
    let finalAmountPaid = initialAmountPaid;

    if (customerCreditBalance > 0.00 && finalDueAmount > 0.00) {
      if (customerCreditBalance >= finalDueAmount) {
        appliedCredit = finalDueAmount;
        finalDueAmount = 0.00;
        await connection.query(
          `UPDATE customers SET credit_balance = credit_balance - ? WHERE id = ?`,
          [appliedCredit, customerId]
        );
      } else {
        appliedCredit = customerCreditBalance;
        finalDueAmount -= appliedCredit;
        await connection.query(
          `UPDATE customers SET credit_balance = 0.00 WHERE id = ?`,
          [customerId]
        );
      }
      finalAmountPaid += appliedCredit;
    }

    let finalPaymentMode = paymentMode;
    const activeModes = [];
    if (finalCashPaid > 0) activeModes.push('Cash');
    if (finalUpiPaid > 0) activeModes.push('UPI');
    if (finalBankPaid > 0) activeModes.push('Bank');
    if (appliedCredit > 0) activeModes.push('Credit Balance');
    if (activeModes.length > 0) {
      finalPaymentMode = activeModes.join(' + ');
    } else {
      finalPaymentMode = 'Credit';
    }

    // Validate finished products are active
    const prodIds = items.map(it => parseInt(it.finishedProductId, 10)).filter(id => !isNaN(id));
    if (prodIds.length > 0) {
      const [inactiveProds] = await connection.query(
        `SELECT name FROM finished_products WHERE id IN (?) AND status = 0`,
        [prodIds]
      );
      if (inactiveProds.length > 0) {
        const names = inactiveProds.map(p => p.name).join(', ');
        throw new Error(`The following products are disabled in Product Master: ${names}. You cannot place new transactions for them.`);
      }
    }

    // 2. Generate Bill ID
    const billId = await generateId('BILL', 'customer_bills', 'id', connection);

    // Auto-create Payment Approval entry for cash portions BEFORE inserting the bill
    const enteredByName = req.admin?.name || req.admin?.username || 'Admin';
    const payModes = [];
    if (finalCashPaid > 0) payModes.push('Cash');
    if (finalUpiPaid > 0) payModes.push('UPI');
    if (finalBankPaid > 0) payModes.push('Bank');
    const combinedMode = payModes.join(' + ') || finalPaymentMode;

    const payAmount = finalCashPaid + finalUpiPaid + finalBankPaid;
    let paymentStatus = 'Unpaid';
    let pendingAmount = 0.00;
    let approvalId = null;

    if (payAmount > 0) {
      paymentStatus = 'Pending Approval';
      pendingAmount = payAmount;

      approvalId = await createPaymentApprovalEntry({
        transactionId: billId,
        sourceModule: 'Billing',
        transactionType: 'Cash In',
        referenceNo: billId,
        partyName: `[${customerId}] ${cleanName}`,
        description: `Invoice ${billId} — [${customerId}] ${cleanName} (${customerType})`,
        paymentMethod: combinedMode,
        cashAmount: finalCashPaid,
        upiAmount: finalUpiPaid,
        bankAmount: finalBankPaid,
        amount: payAmount,
        transactionDate: billingDate,
        enteredBy: enteredByName,
        remarks: `Grand Total: ₹${parseFloat(grandTotal) || 0}`
      }, connection);
    } else {
      if (parseFloat(grandTotal) - appliedCredit <= 0) {
        paymentStatus = 'Approved';
      }
    }

    // Calculate COGS and Profit first by checking costing sheets
    let totalCogs = 0;
    const itemsWithCosts = [];
    let totalTaxAmount = 0;

    for (const item of items) {
      const { finishedProductId, quantity, rateWithTax, taxPercent } = item;
      const q = parseInt(quantity, 10);
      const r = parseFloat(rateWithTax) || 0.00;
      const t = parseFloat(taxPercent) || 0.00;

      if (!finishedProductId) throw new Error('Product is invalid.');
      if (isNaN(q) || q <= 0) throw new Error('Product quantity must be greater than 0.');

      // Query cost sheet
      const [costRows] = await connection.query(
        `SELECT total_cost FROM cost_sheets WHERE finished_product_id = ?`,
        [parseInt(finishedProductId, 10)]
      );
      const unitCost = costRows.length > 0 ? parseFloat(costRows[0].total_cost) : 0.0000;
      const itemCogs = q * unitCost;
      totalCogs += itemCogs;

      const basic = r / (1 + t / 100);
      const total = q * r;
      totalTaxAmount += (total - (q * basic));

      itemsWithCosts.push({
        finishedProductId: parseInt(finishedProductId, 10),
        q,
        r,
        t,
        basic,
        total,
        unitCost,
        itemCogs
      });
    }

    const billGrandTotal = parseFloat(grandTotal) || 0.00;
    const basicRevenue = billGrandTotal - totalTaxAmount;
    const billProfit = basicRevenue - totalCogs;

    // 3. Insert Invoice Header (using unapproved amounts & payment_status/approval_id, cogs, profit)
    await connection.query(
      `INSERT INTO customer_bills 
       (id, billing_date, company, customer_type, customer_id, customer_name, customer_phone, customer_gstin, customer_address, 
        grand_total, payment_mode, amount_paid, due_amount, cash_paid, upi_paid, bank_paid, 
        payment_status, pending_amount, approved_amount, rejected_amount, approval_id, cogs, profit, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0.00, 0.00, ?, ?, ?, NOW())`,
      [
        billId,
        billingDate,
        company,
        customerType,
        customerId,
        cleanName,
        cleanPhone,
        cleanGst,
        cleanAddress,
        billGrandTotal,
        finalPaymentMode,
        appliedCredit,
        billGrandTotal - appliedCredit,
        finalCashPaid,
        finalUpiPaid,
        finalBankPaid,
        paymentStatus,
        pendingAmount,
        approvalId || null,
        totalCogs,
        billProfit
      ]
    );

    // 4. Insert Items and Stock Register Deductions
    for (const item of itemsWithCosts) {
      // Insert line item
      await connection.query(
        `INSERT INTO customer_bill_items 
         (bill_id, finished_product_id, quantity, rate_with_tax, tax_percent, basic_rate, total_amount, unit_cost, total_cost)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [billId, item.finishedProductId, item.q, item.r, item.t, item.basic, item.total, item.unitCost, item.itemCogs]
      );

      // Stock Register Deduction (transaction_type = 'SALE', quantity is negative)
      await connection.query(
        `INSERT INTO stock_register (item_type, item_id, transaction_type, reference_id, quantity, created_at)
         VALUES ('FINISHED_PRODUCT', ?, 'SALE', ?, ?, NOW())`,
        [item.finishedProductId, billId, -item.q]
      );
    }

    if (loadingSessionId) {
      await connection.query(
        `UPDATE loading_sessions SET status = 'BILLED', bill_id = ? WHERE id = ?`,
        [billId, loadingSessionId]
      );
    }

    if (orderId) {
      const suppliedBy = req.admin?.name || req.admin?.username || 'Admin';
      await connection.query(
        `UPDATE customer_orders SET status = 'SUPPLIED', supplied_by = ?, supplied_at = NOW() WHERE id = ?`,
        [suppliedBy, orderId]
      );
    }

    // Customer Ledger Hook: SALE debit
    await addLedgerEntry(connection, {
      date: billingDate,
      customerId: customerId,
      entryType: 'SALE',
      referenceNo: billId,
      particular: `Sale Invoice ${billId}`,
      debit: billGrandTotal,
      credit: 0.00
    });

    // Customer Ledger Hook: PAYMENT credit if credit balance is applied
    if (appliedCredit > 0) {
      await addLedgerEntry(connection, {
        date: billingDate,
        customerId: customerId,
        entryType: 'PAYMENT',
        referenceNo: billId,
        particular: `Credit Balance Applied for ${billId}`,
        debit: 0.00,
        credit: appliedCredit
      });
    }

    await connection.commit();
    res.json({ ok: true, id: billId, message: 'Invoice saved successfully!' });
  } catch (error) {
    await connection.rollback();
    console.error('Create invoice error:', error);
    res.status(400).json({ ok: false, error: error.message });
  } finally {
    connection.release();
  }
});

// PUT /api/billing/:id - Updates an invoice (Only allowed for today's entries)
router.put('/:id', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const {
      billingDate,
      company,
      customerType,
      customerName,
      customerPhone,
      customerGstin = '',
      customerAddress = '',
      grandTotal,
      paymentMode,
      amountPaid,
      dueAmount,
      items = [],
      cashPaid,
      upiPaid,
      bankPaid
    } = req.body;

    // Normalization and fallback for multiple payment modes
    let finalCashPaid = parseFloat(cashPaid);
    let finalUpiPaid = parseFloat(upiPaid);
    let finalBankPaid = parseFloat(bankPaid);

    if (isNaN(finalCashPaid) && isNaN(finalUpiPaid) && isNaN(finalBankPaid)) {
      const amt = parseFloat(amountPaid) || 0.00;
      const mode = String(paymentMode || '').toLowerCase();
      if (mode.includes('cash')) {
        finalCashPaid = amt;
        finalUpiPaid = 0.00;
        finalBankPaid = 0.00;
      } else if (mode.includes('upi')) {
        finalCashPaid = 0.00;
        finalUpiPaid = amt;
        finalBankPaid = 0.00;
      } else if (mode.includes('bank')) {
        finalCashPaid = 0.00;
        finalUpiPaid = 0.00;
        finalBankPaid = amt;
      } else {
        finalCashPaid = 0.00;
        finalUpiPaid = 0.00;
        finalBankPaid = 0.00;
      }
    } else {
      finalCashPaid = finalCashPaid || 0.00;
      finalUpiPaid = finalUpiPaid || 0.00;
      finalBankPaid = finalBankPaid || 0.00;
    }

    const finalAmountPaid = finalCashPaid + finalUpiPaid + finalBankPaid;
    const finalDueAmount = (parseFloat(grandTotal) || 0.00) - finalAmountPaid;

    let finalPaymentMode = paymentMode;
    const activeModes = [];
    if (finalCashPaid > 0) activeModes.push('Cash');
    if (finalUpiPaid > 0) activeModes.push('UPI');
    if (finalBankPaid > 0) activeModes.push('Bank');
    if (activeModes.length > 0) {
      finalPaymentMode = activeModes.join(' + ');
    } else {
      finalPaymentMode = 'Credit';
    }

    // Get today's date string in IST
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const istDate = new Date(now.getTime() + (330 + offset) * 60000);
    const yyyy = istDate.getFullYear();
    const mm = String(istDate.getMonth() + 1).padStart(2, '0');
    const dd = String(istDate.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;

    // 1. Fetch the existing invoice to verify its date
    const [existingRows] = await connection.query(
      `SELECT DATE_FORMAT(billing_date, '%Y-%m-%d') as billing_date FROM customer_bills WHERE id = ?`,
      [id]
    );

    if (existingRows.length === 0) {
      throw new Error('Invoice not found.');
    }

    const existingDateStr = existingRows[0].billing_date;
    if (existingDateStr !== todayStr) {
      throw new Error('Altering past invoices is not allowed after the day changes.');
    }

    // Validation
    if (!billingDate) throw new Error('Billing Date is required.');
    if (billingDate !== todayStr) {
      throw new Error('Billing Date must be set to today.');
    }
    if (!company) throw new Error('Company is required.');
    if (!customerType) throw new Error('Customer Type is required.');
    if (!customerName || !String(customerName).trim()) throw new Error('Customer Name is required.');
    if (!customerPhone) throw new Error('Customer Phone is required.');
    if (items.length === 0) throw new Error('At least one product line is required.');

    const cleanPhone = normalizePhone10(customerPhone);
    const cleanName = String(customerName).trim();
    const cleanGst = String(customerGstin).trim();
    const cleanAddress = String(customerAddress).trim();

    // Validate finished products are active
    const prodIds = items.map(it => parseInt(it.finishedProductId, 10)).filter(id => !isNaN(id));
    if (prodIds.length > 0) {
      const [inactiveProds] = await connection.query(
        `SELECT name FROM finished_products WHERE id IN (?) AND status = 0`,
        [prodIds]
      );
      if (inactiveProds.length > 0) {
        const names = inactiveProds.map(p => p.name).join(', ');
        throw new Error(`The following products are disabled in Product Master: ${names}. You cannot place new transactions for them.`);
      }
    }

    // Resolve or Update Customer
    let customerId = null;
    const [existingCust] = await connection.query(
      `SELECT id FROM customers WHERE phone = ?`,
      [cleanPhone]
    );

    if (existingCust.length > 0) {
      customerId = existingCust[0].id;
      await connection.query(
        `UPDATE customers SET name = ?, gstin = ?, address = ? WHERE id = ?`,
        [cleanName, cleanGst, cleanAddress, customerId]
      );
    } else {
      customerId = await generateId('CUST', 'customers', 'id', connection);
      await connection.query(
        `INSERT INTO customers (id, name, phone, gstin, address, created_at) VALUES (?, ?, ?, ?, ?, NOW())`,
        [customerId, cleanName, cleanPhone, cleanGst, cleanAddress]
      );
    }

    // 2. Update Invoice Header
    await connection.query(
      `UPDATE customer_bills SET 
         billing_date = ?, 
         company = ?, 
         customer_type = ?, 
         customer_id = ?, 
         customer_name = ?, 
         customer_phone = ?, 
         customer_gstin = ?, 
         customer_address = ?, 
         grand_total = ?, 
         payment_mode = ?, 
         amount_paid = ?, 
         due_amount = ?,
         cash_paid = ?,
         upi_paid = ?,
         bank_paid = ?
       WHERE id = ?`,
      [
        billingDate,
        company,
        customerType,
        customerId,
        cleanName,
        cleanPhone,
        cleanGst,
        cleanAddress,
        parseFloat(grandTotal) || 0.00,
        finalPaymentMode,
        finalAmountPaid,
        finalDueAmount,
        finalCashPaid,
        finalUpiPaid,
        finalBankPaid,
        id
      ]
    );

    // 3. Clear old items & old stock register records
    await connection.query(
      `DELETE FROM customer_bill_items WHERE bill_id = ?`,
      [id]
    );

    await connection.query(
      `DELETE FROM stock_register WHERE reference_id = ? AND transaction_type = 'SALE'`,
      [id]
    );

    // 4. Insert updated items and re-log stock register deductions
    for (const item of items) {
      const { finishedProductId, quantity, rateWithTax, taxPercent } = item;
      const q = parseInt(quantity, 10);
      const r = parseFloat(rateWithTax) || 0.00;
      const t = parseFloat(taxPercent) || 0.00;

      if (!finishedProductId) throw new Error('Product is invalid.');
      if (isNaN(q) || q <= 0) throw new Error('Product quantity must be greater than 0.');

      const basic = r / (1 + t / 100);
      const total = q * r;

      await connection.query(
        `INSERT INTO customer_bill_items 
         (bill_id, finished_product_id, quantity, rate_with_tax, tax_percent, basic_rate, total_amount)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, parseInt(finishedProductId, 10), q, r, t, basic, total]
      );

      await connection.query(
        `INSERT INTO stock_register (item_type, item_id, transaction_type, reference_id, quantity, created_at)
         VALUES ('FINISHED_PRODUCT', ?, 'SALE', ?, ?, NOW())`,
        [parseInt(finishedProductId, 10), id, -q]
      );
    }

    // Customer Ledger Hook: Clear old entries and insert updated SALE debit
    await deleteLedgerEntriesForReference(connection, id);
    await addLedgerEntry(connection, {
      date: billingDate,
      customerId: customerId,
      entryType: 'SALE',
      referenceNo: id,
      particular: `Sale Invoice ${id}`,
      debit: parseFloat(grandTotal) || 0.00,
      credit: 0.00
    });

    await connection.commit();
    res.json({ ok: true, message: 'Invoice updated successfully!' });
  } catch (error) {
    await connection.rollback();
    console.error('Update invoice error:', error);
    res.status(400).json({ ok: false, error: error.message });
  } finally {
    connection.release();
  }
});

// DELETE /api/billing/:id - Deletes an invoice (Only allowed for today's entries)
router.delete('/:id', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;

    // Get today's date string in IST
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const istDate = new Date(now.getTime() + (330 + offset) * 60000);
    const yyyy = istDate.getFullYear();
    const mm = String(istDate.getMonth() + 1).padStart(2, '0');
    const dd = String(istDate.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;

    // 1. Fetch the existing invoice to verify its date
    const [existingRows] = await connection.query(
      `SELECT DATE_FORMAT(billing_date, '%Y-%m-%d') as billing_date FROM customer_bills WHERE id = ?`,
      [id]
    );

    if (existingRows.length === 0) {
      throw new Error('Invoice not found.');
    }

    const existingDateStr = existingRows[0].billing_date;
    if (existingDateStr !== todayStr) {
      throw new Error('Altering past invoices is not allowed after the day changes.');
    }

    // 2. Clear items, stock register, and bill record
    await connection.query(
      `DELETE FROM customer_bill_items WHERE bill_id = ?`,
      [id]
    );

    await connection.query(
      `DELETE FROM stock_register WHERE reference_id = ? AND transaction_type = 'SALE'`,
      [id]
    );

    const [result] = await connection.query(
      `DELETE FROM customer_bills WHERE id = ?`,
      [id]
    );

    if (result.affectedRows === 0) throw new Error('Invoice not found.');

    await connection.query(
      `DELETE FROM payment_approvals WHERE transaction_id = ? AND source_module = 'Billing'`,
      [id]
    );

    await connection.query(
      `UPDATE loading_sessions SET status = 'ACTIVE', bill_id = NULL WHERE bill_id = ?`,
      [id]
    );

    // Customer Ledger Hook: delete bill ledger records
    await deleteLedgerEntriesForReference(connection, id);

    await connection.commit();
    res.json({ ok: true, message: 'Invoice deleted successfully.' });
  } catch (error) {
    await connection.rollback();
    console.error('Delete invoice error:', error);
    res.status(400).json({ ok: false, error: error.message });
  } finally {
    connection.release();
  }
});

export default router;
