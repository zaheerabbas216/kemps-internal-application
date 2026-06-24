import express from 'express';
import pool from '../config/db.js';
import { addLedgerEntry, deleteLedgerEntriesForReference, recalculateLedgerBalances } from '../helpers/ledgerHelper.js';

const router = express.Router();

// Helper to generate custom sequence ID
async function generateId(prefix, table, idColumn, connection = pool) {
  const now = new Date();
  const offset = now.getTimezoneOffset();
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

// GET /api/can-supply/bills
// List all can supply invoices
router.get('/bills', async (req, res) => {
  try {
    const { search = '', paymentStatus = '', startDate = '', endDate = '' } = req.query;
    let queryParams = [];
    let whereClauses = [];

    if (search.trim()) {
      whereClauses.push('(bill_no LIKE ? OR customer_name LIKE ?)');
      const wild = `%${search.trim()}%`;
      queryParams.push(wild, wild);
    }
    if (paymentStatus) {
      whereClauses.push('payment_status = ?');
      queryParams.push(paymentStatus);
    }
    if (startDate) {
      whereClauses.push('date >= ?');
      queryParams.push(startDate);
    }
    if (endDate) {
      whereClauses.push('date <= ?');
      queryParams.push(endDate);
    }

    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const [rows] = await pool.query(`
      SELECT 
        id, 
        bill_no AS billNo, 
        DATE_FORMAT(date, '%Y-%m-%d') as date, 
        customer_id AS customerId, 
        customer_name AS customerName,
        qty_supplied AS qtySupplied, 
        rate_per_can AS ratePerCan, 
        water_amount AS waterAmount,
        dispenser_rent AS dispenserRent, 
        delivery_charge AS deliveryCharge, 
        other_charge AS otherCharge,
        gst_percentage AS gstPercentage, 
        gst_amount AS gstAmount, 
        grand_total AS grandTotal,
        amount_paid AS amountPaid, 
        (grand_total - amount_paid) AS balance,
        payment_status AS paymentStatus, 
        remarks, 
        created_by AS createdBy
      FROM can_billing
      ${whereStr}
      ORDER BY date DESC, id DESC
    `, queryParams);

    res.json({ ok: true, bills: rows });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// GET /api/can-supply/customer/:customerId/details
// Retrieves running balances, outstanding supplies, ledger history and customer summary metrics
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

    // 4. Fetch unified transaction history to build ledger (combining SUPPLY/RETURN and can_payments)
    const [supplyRows] = await pool.query(`
      SELECT 
        t.id,
        DATE_FORMAT(t.transaction_date, '%Y-%m-%d') as date,
        t.type,
        t.supply_type AS supplyType,
        t.product,
        t.quantity,
        COALESCE(b.bill_no, '') AS referenceNo,
        COALESCE(b.grand_total, 0.00) AS debit,
        0.00 AS credit,
        t.created_by AS user
      FROM can_supply_transactions t
      LEFT JOIN can_billing b ON t.billing_id = b.id
      WHERE t.customer_id = ?
    `, [customerId]);

    const [paymentRows] = await pool.query(`
      SELECT 
        p.id,
        DATE_FORMAT(p.payment_date, '%Y-%m-%d') as date,
        'PAYMENT' AS type,
        'Payment Received' AS supplyType,
        p.payment_method AS product,
        0 AS quantity,
        p.payment_no AS referenceNo,
        0.00 AS debit,
        p.amount_paid AS credit,
        p.created_by AS user
      FROM can_payments p
      JOIN can_billing b ON p.bill_id = b.id
      WHERE b.customer_id = ?
    `, [customerId]);

    const combined = [...supplyRows, ...paymentRows];
    // Sort chronologically
    combined.sort((a, b) => new Date(a.date) - new Date(b.date) || a.id - b.id);

    let canBalance = 0;
    let financialBalance = 0;
    const ledger = combined.map(row => {
      const q = parseInt(row.quantity, 10);
      if (row.type === 'SUPPLY') {
        if (row.product === '20 Ltr Can') canBalance += q;
        financialBalance += parseFloat(row.debit);
      } else if (row.type === 'RETURN') {
        if (row.product === '20 Ltr Can') canBalance -= q;
      } else if (row.type === 'PAYMENT') {
        financialBalance -= parseFloat(row.credit);
      }
      return {
        ...row,
        runningCanBalance: canBalance,
        runningFinancialBalance: financialBalance
      };
    });

    ledger.reverse(); // latest first

    // 5. Compute Customer Summary Statistics
    const [[summaryStats]] = await pool.query(`
      SELECT 
        COALESCE(SUM(qty_supplied), 0) AS totalCansSupplied,
        COALESCE(SUM(grand_total), 0) AS totalRevenue,
        COUNT(id) AS totalBills,
        COALESCE(SUM(grand_total - amount_paid), 0) AS outstandingAmount
      FROM can_billing
      WHERE customer_id = ?
    `, [customerId]);

    const [[lastSupplyRow]] = await pool.query(`
      SELECT DATE_FORMAT(MAX(transaction_date), '%Y-%m-%d') AS lastSupplyDate
      FROM can_supply_transactions
      WHERE customer_id = ? AND type = 'SUPPLY'
    `, [customerId]);

    const [[currentMonthStats]] = await pool.query(`
      SELECT 
        COALESCE(SUM(qty_supplied), 0) AS monthCans,
        COALESCE(SUM(grand_total), 0) AS monthRevenue
      FROM can_billing
      WHERE customer_id = ? AND DATE_FORMAT(date, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')
    `, [customerId]);

    const totalCansOut = (parseInt(balances.cansOutCompany) || 0) + 
                         (parseInt(balances.cansOutDistributor) || 0) + 
                         (parseInt(balances.cansOutFunction) || 0);

    const customerSummary = {
      totalCansSupplied: parseInt(summaryStats.totalCansSupplied, 10),
      totalRevenue: parseFloat(summaryStats.totalRevenue),
      totalBills: parseInt(summaryStats.totalBills, 10),
      outstandingCans: totalCansOut,
      outstandingAmount: parseFloat(summaryStats.outstandingAmount),
      lastSupplyDate: lastSupplyRow.lastSupplyDate || 'N/A',
      currentMonthCans: parseInt(currentMonthStats.monthCans, 10) || 0,
      currentMonthRevenue: parseFloat(currentMonthStats.monthRevenue) || 0.00
    };

    res.json({
      ok: true,
      customer,
      balances,
      outstanding,
      ledger,
      customerSummary
    });

  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// POST /api/can-supply
// Create a new supply entry and generate a corresponding invoice
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
      expectedReturnDate,
      dispenserRent = 0,
      deliveryCharge = 0,
      otherCharge = 0,
      gstPercentage = 0
    } = req.body;

    const qty = parseInt(quantity, 10);
    const parsedRate = parseFloat(rate || 0);
    const dispRent = parseFloat(dispenserRent || 0);
    const delCharge = parseFloat(deliveryCharge || 0);
    const othCharge = parseFloat(otherCharge || 0);
    const gstPct = parseFloat(gstPercentage || 0);

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

    const user = req.admin?.name || req.admin?.username || 'Admin';

    await connection.beginTransaction();

    // Verify customer exists
    const [custRows] = await connection.query('SELECT name FROM customers WHERE id = ?', [customerId]);
    if (custRows.length === 0) throw new Error('Customer not found.');
    const customerName = custRows[0].name;

    // Verify product is active in Product Master
    const [prodCheck] = await connection.query(
      'SELECT status FROM finished_products WHERE name = ?',
      [product]
    );
    if (prodCheck.length > 0 && prodCheck[0].status === 0) {
      throw new Error(`The product '${product}' is disabled in Product Master.`);
    }

    // 1. Calculations
    const waterAmount = product === '20 Ltr Can' ? (qty * parsedRate) : 0;
    const subTotal = waterAmount + dispRent + delCharge + othCharge;
    const gstAmount = subTotal * (gstPct / 100);
    const grandTotal = subTotal + gstAmount;

    // 2. Generate bill_no and insert into can_billing
    const billNo = await generateId('CAN', 'can_billing', 'bill_no', connection);

    const [billResult] = await connection.query(`
      INSERT INTO can_billing (
        bill_no, date, customer_id, customer_name, qty_supplied, rate_per_can, water_amount,
        dispenser_rent, delivery_charge, other_charge, gst_percentage, gst_amount, grand_total,
        amount_paid, payment_status, remarks, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0.00, 'Unpaid', ?, ?)
    `, [
      billNo, transactionDate, customerId, customerName, qty, parsedRate, waterAmount,
      dispRent, delCharge, othCharge, gstPct, gstAmount, grandTotal,
      notes || null, user
    ]);
    const billingId = billResult.insertId;

    // 3. Insert into can_supply_transactions
    const insertQuery = `
      INSERT INTO can_supply_transactions (
        customer_id, transaction_date, type, supply_type, product, quantity, rate, amount, notes,
        function_name, event_date, expected_return_date, billing_id, created_by
      ) VALUES (?, ?, 'SUPPLY', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await connection.query(insertQuery, [
      customerId,
      transactionDate,
      supplyType,
      product,
      qty,
      parsedRate,
      waterAmount,
      notes || null,
      supplyType === 'Function Can' ? (functionName || null) : null,
      supplyType === 'Function Can' ? (eventDate || null) : null,
      supplyType === 'Function Can' ? (expectedReturnDate || null) : null,
      billingId,
      user
    ]);

    // 4. Post Debit Entry to customer ledger
    await addLedgerEntry(connection, {
      date: transactionDate,
      customerId: customerId,
      entryType: 'BILL GENERATED',
      referenceNo: billNo,
      particular: `Can Supply Bill generated - ${billNo} (${qty} ${product === 'Dispenser' ? 'Dispensers' : 'Cans'})`,
      debit: grandTotal,
      credit: 0.00
    });

    await connection.commit();
    res.json({ ok: true, message: 'Supply logged and Bill generated successfully!', billNo });

  } catch (error) {
    await connection.rollback();
    res.status(400).json({ ok: false, error: error.message });
  } finally {
    connection.release();
  }
});

// PUT /api/can-supply/bill/:billId
// Edit an existing can supply invoice and linked transactions
router.put('/bill/:billId', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { billId } = req.params;
    const {
      date,
      qtySupplied,
      ratePerCan,
      dispenserRent,
      deliveryCharge,
      otherCharge,
      gstPercentage,
      remarks
    } = req.body;

    const qty = parseInt(qtySupplied, 10);
    const rate = parseFloat(ratePerCan || 0);
    const dispRent = parseFloat(dispenserRent || 0);
    const delCharge = parseFloat(deliveryCharge || 0);
    const othCharge = parseFloat(otherCharge || 0);
    const gstPct = parseFloat(gstPercentage || 0);

    if (isNaN(qty) || qty <= 0) throw new Error('Quantity must be greater than 0.');
    if (isNaN(rate) || rate < 0) throw new Error('Rate cannot be negative.');

    await connection.beginTransaction();

    // 1. Fetch current bill
    const [billRows] = await connection.query(`
      SELECT bill_no, customer_id, grand_total, amount_paid FROM can_billing WHERE id = ? FOR UPDATE
    `, [billId]);
    if (billRows.length === 0) throw new Error('Bill not found.');
    const bill = billRows[0];

    // Fetch product type from linked transaction
    const [txRows] = await connection.query(`
      SELECT product FROM can_supply_transactions WHERE billing_id = ? AND type = 'SUPPLY'
    `, [billId]);
    const product = txRows.length > 0 ? txRows[0].product : '20 Ltr Can';

    // 2. Recalculate
    const waterAmount = product === '20 Ltr Can' ? (qty * rate) : 0;
    const subTotal = waterAmount + dispRent + delCharge + othCharge;
    const gstAmount = subTotal * (gstPct / 100);
    const grandTotal = subTotal + gstAmount;

    // Check payment status logic
    let paymentStatus = 'Unpaid';
    const paid = parseFloat(bill.amount_paid);
    if (paid >= grandTotal) {
      paymentStatus = 'Paid';
    } else if (paid > 0) {
      paymentStatus = 'Partially Paid';
    }

    // 3. Update can_billing
    await connection.query(`
      UPDATE can_billing SET
        date = ?, qty_supplied = ?, rate_per_can = ?, water_amount = ?,
        dispenser_rent = ?, delivery_charge = ?, other_charge = ?,
        gst_percentage = ?, gst_amount = ?, grand_total = ?, payment_status = ?, remarks = ?
      WHERE id = ?
    `, [
      date, qty, rate, waterAmount, dispRent, delCharge, othCharge,
      gstPct, gstAmount, grandTotal, paymentStatus, remarks || null, billId
    ]);

    // 4. Update can_supply_transactions linked to this bill
    await connection.query(`
      UPDATE can_supply_transactions SET
        transaction_date = ?, quantity = ?, rate = ?, amount = ?, notes = ?
      WHERE billing_id = ? AND type = 'SUPPLY'
    `, [date, qty, rate, waterAmount, remarks || null, billId]);

    // 5. Update customer_ledger entry for this bill
    await connection.query(`
      UPDATE customer_ledger SET
        date = ?, debit = ?, particular = ?
      WHERE reference_no = ? AND entry_type = 'BILL GENERATED'
    `, [date, grandTotal, `Can Supply Bill generated - ${bill.bill_no} (${qty} ${product === 'Dispenser' ? 'Dispensers' : 'Cans'})`, bill.bill_no]);

    // Recalculate ledger balances for this customer
    await recalculateLedgerBalances(connection, bill.customer_id);

    await connection.commit();
    res.json({ ok: true, message: 'Bill and transaction updated successfully!' });
  } catch (error) {
    await connection.rollback();
    res.status(400).json({ ok: false, error: error.message });
  } finally {
    connection.release();
  }
});

// DELETE /api/can-supply/bill/:billId
// Delete bill and reverse ledger & can inventory movements
router.delete('/bill/:billId', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { billId } = req.params;

    await connection.beginTransaction();

    // 1. Fetch current bill
    const [billRows] = await connection.query(`
      SELECT bill_no, customer_id FROM can_billing WHERE id = ? FOR UPDATE
    `, [billId]);
    if (billRows.length === 0) throw new Error('Bill not found.');
    const bill = billRows[0];

    // 2. Fetch linked supply transactions to verify returns or delete
    const [txRows] = await connection.query(`
      SELECT id FROM can_supply_transactions WHERE billing_id = ?
    `, [billId]);
    
    for (const tx of txRows) {
      // Check if there are returns linked to this transaction
      const [retRows] = await connection.query(`
        SELECT COUNT(*) as count FROM can_supply_transactions WHERE parent_transaction_id = ? AND type = 'RETURN'
      `, [tx.id]);
      if (retRows[0].count > 0) {
        throw new Error('Cannot delete this supply entry because it has returns recorded against it. Delete the returns first.');
      }
    }

    // 3. Delete linked transactions (this reverses can movement out)
    await connection.query(`
      DELETE FROM can_supply_transactions WHERE billing_id = ?
    `, [billId]);

    // 4. Delete ledger entries for this bill and payments associated with it
    // First find any payments and delete them from customer_ledger
    const [payRows] = await connection.query(`
      SELECT payment_no FROM can_payments WHERE bill_id = ?
    `, [billId]);
    for (const pay of payRows) {
      await connection.query(`
        DELETE FROM customer_ledger WHERE reference_no = ? AND entry_type = 'PAYMENT RECEIVED'
      `, [pay.payment_no]);
    }

    await connection.query(`
      DELETE FROM customer_ledger WHERE reference_no = ? AND entry_type = 'BILL GENERATED'
    `, [bill.bill_no]);

    // 5. Delete can_billing (cascades to can_payments due to foreign key)
    await connection.query(`
      DELETE FROM can_billing WHERE id = ?
    `, [billId]);

    // 6. Recalculate customer ledger balance
    await recalculateLedgerBalances(connection, bill.customer_id);

    await connection.commit();
    res.json({ ok: true, message: 'Bill and supply transactions deleted successfully!' });
  } catch (error) {
    await connection.rollback();
    res.status(400).json({ ok: false, error: error.message });
  } finally {
    connection.release();
  }
});

// POST /api/can-supply/bill/:billId/pay
// Record full/part payment on a can bill
router.post('/bill/:billId/pay', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { billId } = req.params;
    const { paymentDate, amountPaid, paymentMethod, remarks } = req.body;
    const user = req.admin?.name || req.admin?.username || 'Admin';

    const amt = parseFloat(amountPaid);
    if (isNaN(amt) || amt <= 0) throw new Error('Payment amount must be greater than 0.');

    await connection.beginTransaction();

    // 1. Fetch bill details
    const [billRows] = await connection.query(`
      SELECT bill_no, customer_id, grand_total, amount_paid FROM can_billing WHERE id = ? FOR UPDATE
    `, [billId]);
    if (billRows.length === 0) throw new Error('Bill not found.');
    const bill = billRows[0];

    const currentPaid = parseFloat(bill.amount_paid);
    const grandTotal = parseFloat(bill.grand_total);
    const balance = grandTotal - currentPaid;

    if (amt > balance) {
      throw new Error(`Payment amount (₹${amt.toFixed(2)}) cannot exceed outstanding balance (₹${balance.toFixed(2)}).`);
    }

    const newPaid = currentPaid + amt;
    let paymentStatus = 'Partially Paid';
    if (newPaid >= grandTotal) {
      paymentStatus = 'Paid';
    }

    // 2. Generate Payment number
    const paymentNo = await generateId('CPY', 'can_payments', 'payment_no', connection);

    // 3. Insert into can_payments
    await connection.query(`
      INSERT INTO can_payments (payment_no, bill_id, payment_date, amount_paid, payment_method, remarks, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [paymentNo, billId, paymentDate, amt, paymentMethod, remarks || null, user]);

    // 4. Update can_billing
    await connection.query(`
      UPDATE can_billing SET amount_paid = ?, payment_status = ? WHERE id = ?
    `, [newPaid, paymentStatus, billId]);

    // 5. Post credit entry to customer_ledger
    await addLedgerEntry(connection, {
      date: paymentDate,
      customerId: bill.customer_id,
      entryType: 'PAYMENT RECEIVED',
      referenceNo: paymentNo,
      particular: `Payment received for Can Bill ${bill.bill_no} via ${paymentMethod}`,
      debit: 0.00,
      credit: amt
    });

    await connection.commit();
    res.json({ ok: true, message: 'Payment successfully recorded!' });
  } catch (error) {
    await connection.rollback();
    res.status(400).json({ ok: false, error: error.message });
  } finally {
    connection.release();
  }
});

// GET /api/can-supply/bill/:billId/payments
// List payments for a bill
router.get('/bill/:billId/payments', async (req, res) => {
  try {
    const { billId } = req.params;
    const [rows] = await pool.query(`
      SELECT 
        id, 
        payment_no AS paymentNo, 
        DATE_FORMAT(payment_date, '%Y-%m-%d') as paymentDate,
        amount_paid AS amountPaid, 
        payment_method AS paymentMethod, 
        remarks, 
        created_by AS createdBy
      FROM can_payments
      WHERE bill_id = ?
      ORDER BY payment_date DESC, id DESC
    `, [billId]);
    res.json({ ok: true, payments: rows });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
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

    // Billing metrics
    const [[billingStats]] = await pool.query(`
      SELECT 
        COALESCE(SUM(CASE WHEN date = CURDATE() THEN grand_total ELSE 0 END), 0) AS todayRevenue,
        COALESCE(SUM(CASE WHEN YEARWEEK(date, 1) = YEARWEEK(CURDATE(), 1) THEN grand_total ELSE 0 END), 0) AS weeklyRevenue,
        COALESCE(SUM(CASE WHEN DATE_FORMAT(date, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m') THEN grand_total ELSE 0 END), 0) AS monthlyRevenue,
        COALESCE(SUM(CASE WHEN YEAR(date) = YEAR(CURDATE()) THEN grand_total ELSE 0 END), 0) AS yearlyRevenue,
        COALESCE(SUM(CASE WHEN date = CURDATE() THEN qty_supplied ELSE 0 END), 0) AS todayCans,
        COALESCE(SUM(CASE WHEN YEARWEEK(date, 1) = YEARWEEK(CURDATE(), 1) THEN qty_supplied ELSE 0 END), 0) AS weeklyCans,
        COALESCE(SUM(CASE WHEN DATE_FORMAT(date, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m') THEN qty_supplied ELSE 0 END), 0) AS monthlyCans,
        COALESCE(SUM(CASE WHEN YEAR(date) = YEAR(CURDATE()) THEN qty_supplied ELSE 0 END), 0) AS yearlyCans,
        COALESCE(SUM(grand_total - amount_paid), 0) AS pendingPayments
      FROM can_billing
    `);

    res.json({
      ok: true,
      summary: {
        companyCansOut: cCans,
        distributorCansOut: dCans,
        functionCansOut: fCans,
        dispensersOut: disp,
        totalPendingReturns: totalPendingReturns
      },
      overdue,
      billingStats: {
        todayRevenue: parseFloat(billingStats.todayRevenue),
        weeklyRevenue: parseFloat(billingStats.weeklyRevenue),
        monthlyRevenue: parseFloat(billingStats.monthlyRevenue),
        yearlyRevenue: parseFloat(billingStats.yearlyRevenue),
        todayCans: parseInt(billingStats.todayCans, 10),
        weeklyCans: parseInt(billingStats.weeklyCans, 10),
        monthlyCans: parseInt(billingStats.monthlyCans, 10),
        yearlyCans: parseInt(billingStats.yearlyCans, 10),
        pendingPayments: parseFloat(billingStats.pendingPayments),
        outstandingCans: totalCansOut
      }
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

    // Different date filter logic for Billing report (references `date` instead of `transaction_date`)
    let billingDateFilter = '';
    let billingDateParams = [];
    if (startDate && endDate) {
      billingDateFilter = 'AND date BETWEEN ? AND ?';
      billingDateParams.push(startDate, endDate);
    } else if (startDate) {
      billingDateFilter = 'AND date >= ?';
      billingDateParams.push(startDate);
    } else if (endDate) {
      billingDateFilter = 'AND date <= ?';
      billingDateParams.push(endDate);
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

      case 'CanBillingReport':
        const [billingReportRows] = await pool.query(`
          SELECT 
            DATE_FORMAT(date, '%Y-%m-%d') as date,
            bill_no AS invoiceNo,
            customer_name AS customer,
            qty_supplied AS qtySupplied,
            rate_per_can AS rate,
            grand_total AS amount,
            payment_status AS status
          FROM can_billing
          WHERE 1=1 ${billingDateFilter}
          ORDER BY date DESC, id DESC
        `, billingDateParams);

        // Calculate summary
        const totalCans = billingReportRows.reduce((sum, r) => sum + parseInt(r.qtySupplied, 10), 0);
        const totalRev = billingReportRows.reduce((sum, r) => sum + parseFloat(r.amount), 0);
        const uniqueDates = new Set(billingReportRows.map(r => r.date));
        const avgRevPerDay = uniqueDates.size > 0 ? (totalRev / uniqueDates.size) : 0;
        const uniqueCustomers = new Set(billingReportRows.map(r => r.customer));
        const avgRevPerCustomer = uniqueCustomers.size > 0 ? (totalRev / uniqueCustomers.size) : 0;

        return res.json({
          ok: true,
          data: billingReportRows,
          summary: {
            totalCansSupplied: totalCans,
            totalRevenue: totalRev,
            averageRevenuePerDay: avgRevPerDay,
            averageRevenuePerCustomer: avgRevPerCustomer
          }
        });

      default:
        throw new Error('Invalid report type specified.');
    }

    res.json({ ok: true, data: reportData });

  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

export default router;