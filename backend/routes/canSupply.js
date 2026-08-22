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
        COALESCE(SUM(CASE WHEN t.product = '20 Ltr Can' AND t.supply_type = 'VK Can' THEN (CASE WHEN t.type = 'SUPPLY' THEN t.quantity ELSE -t.quantity END) ELSE 0 END), 0) AS cansOutVK,
        COALESCE(SUM(CASE WHEN t.product = '20 Ltr Can' AND t.supply_type = 'RK Can' THEN (CASE WHEN t.type = 'SUPPLY' THEN t.quantity ELSE -t.quantity END) ELSE 0 END), 0) AS cansOutRK,
        COALESCE(SUM(CASE WHEN t.product = '20 Ltr Can' AND t.supply_type = 'Function Can' THEN (CASE WHEN t.type = 'SUPPLY' THEN t.quantity ELSE -t.quantity END) ELSE 0 END), 0) AS cansOutFunction,
        COALESCE(SUM(CASE WHEN t.product = '20 Ltr Can' AND t.supply_type = 'Others' THEN (CASE WHEN t.type = 'SUPPLY' THEN t.quantity ELSE -t.quantity END) ELSE 0 END), 0) AS cansOutOthers,
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
        COALESCE(SUM(CASE WHEN t.product = '20 Ltr Can' AND t.supply_type = 'VK Can' THEN (CASE WHEN t.type = 'SUPPLY' THEN t.quantity ELSE -t.quantity END) ELSE 0 END), 0) AS cansOutVK,
        COALESCE(SUM(CASE WHEN t.product = '20 Ltr Can' AND t.supply_type = 'RK Can' THEN (CASE WHEN t.type = 'SUPPLY' THEN t.quantity ELSE -t.quantity END) ELSE 0 END), 0) AS cansOutRK,
        COALESCE(SUM(CASE WHEN t.product = '20 Ltr Can' AND t.supply_type = 'Function Can' THEN (CASE WHEN t.type = 'SUPPLY' THEN t.quantity ELSE -t.quantity END) ELSE 0 END), 0) AS cansOutFunction,
        COALESCE(SUM(CASE WHEN t.product = '20 Ltr Can' AND t.supply_type = 'Others' THEN (CASE WHEN t.type = 'SUPPLY' THEN t.quantity ELSE -t.quantity END) ELSE 0 END), 0) AS cansOutOthers,
        COALESCE(SUM(CASE WHEN t.product = 'Dispenser' THEN (CASE WHEN t.type = 'SUPPLY' THEN t.quantity ELSE -t.quantity END) ELSE 0 END), 0) AS dispensersOut,
        MAX(t.transaction_date) AS lastTransaction
      FROM customers c
      JOIN can_supply_transactions t ON c.id = t.customer_id
      WHERE 1=1 ${searchFilter}
      GROUP BY c.id
      HAVING (cansOutVK > 0 OR cansOutRK > 0 OR cansOutFunction > 0 OR cansOutOthers > 0 OR dispensersOut > 0)
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
        COALESCE(SUM(CASE WHEN product = '20 Ltr Can' AND supply_type = 'VK Can' THEN (CASE WHEN type = 'SUPPLY' THEN quantity ELSE -quantity END) ELSE 0 END), 0) AS cansOutVK,
        COALESCE(SUM(CASE WHEN product = '20 Ltr Can' AND supply_type = 'RK Can' THEN (CASE WHEN type = 'SUPPLY' THEN quantity ELSE -quantity END) ELSE 0 END), 0) AS cansOutRK,
        COALESCE(SUM(CASE WHEN product = '20 Ltr Can' AND supply_type = 'Function Can' THEN (CASE WHEN type = 'SUPPLY' THEN quantity ELSE -quantity END) ELSE 0 END), 0) AS cansOutFunction,
        COALESCE(SUM(CASE WHEN product = '20 Ltr Can' AND supply_type = 'Others' THEN (CASE WHEN type = 'SUPPLY' THEN quantity ELSE -quantity END) ELSE 0 END), 0) AS cansOutOthers,
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

    // 4. Fetch physical movement history to build ledger
    const [supplyRows] = await pool.query(`
      SELECT 
        t.id,
        DATE_FORMAT(t.transaction_date, '%Y-%m-%d') as date,
        t.type,
        t.supply_type AS supplyType,
        t.product,
        t.quantity,
        t.notes AS referenceNo,
        t.created_by AS user
      FROM can_supply_transactions t
      WHERE t.customer_id = ?
    `, [customerId]);

    // Sort chronologically
    supplyRows.sort((a, b) => new Date(a.date) - new Date(b.date) || a.id - b.id);

    let canBalance = 0;
    let dispenserBalance = 0;
    const ledger = supplyRows.map(row => {
      const q = parseInt(row.quantity, 10);
      if (row.type === 'SUPPLY') {
        if (row.product === '20 Ltr Can') canBalance += q;
        else if (row.product === 'Dispenser') dispenserBalance += q;
      } else if (row.type === 'RETURN') {
        if (row.product === '20 Ltr Can') canBalance -= q;
        else if (row.product === 'Dispenser') dispenserBalance -= q;
      }
      return {
        ...row,
        runningCanBalance: canBalance,
        runningDispenserBalance: dispenserBalance
      };
    });

    ledger.reverse(); // latest first

    // 5. Compute Customer Summary Statistics
    const [[summaryStats]] = await pool.query(`
      SELECT 
        COALESCE(SUM(CASE WHEN product = '20 Ltr Can' THEN quantity ELSE 0 END), 0) AS totalCansSupplied,
        COALESCE(SUM(CASE WHEN product = 'Dispenser' THEN quantity ELSE 0 END), 0) AS totalDispensersSupplied
      FROM can_supply_transactions
      WHERE customer_id = ? AND type = 'SUPPLY'
    `, [customerId]);

    const [[lastSupplyRow]] = await pool.query(`
      SELECT DATE_FORMAT(MAX(transaction_date), '%Y-%m-%d') AS lastSupplyDate
      FROM can_supply_transactions
      WHERE customer_id = ? AND type = 'SUPPLY'
    `, [customerId]);

    const totalCansOut = (parseInt(balances.cansOutCompany) || 0) + 
                         (parseInt(balances.cansOutDistributor) || 0) + 
                         (parseInt(balances.cansOutFunction) || 0);

    const customerSummary = {
      totalCansSupplied: parseInt(summaryStats.totalCansSupplied, 10),
      totalDispensersSupplied: parseInt(summaryStats.totalDispensersSupplied, 10),
      totalRevenue: 0.00,
      totalBills: 0,
      outstandingCans: totalCansOut,
      outstandingAmount: 0.00,
      lastSupplyDate: lastSupplyRow.lastSupplyDate || 'N/A',
      currentMonthCans: 0,
      currentMonthRevenue: 0.00
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
// Create a new supply entry without billing
router.post('/', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const {
      customerId,
      transactionDate,
      supplyType,
      items, // array of { product, quantity }
      notes,
      functionName,
      eventDate,
      expectedReturnDate
    } = req.body;

    if (!customerId) throw new Error('Customer ID is required.');
    if (!transactionDate) throw new Error('Transaction date is required.');
    if (!supplyType || !['VK Can', 'RK Can', 'Function Can', 'Others'].includes(supplyType)) {
      throw new Error('Invalid Supply Type.');
    }

    const user = req.admin?.name || req.admin?.username || 'Admin';

    // Parse items list
    let parsedItems = [];
    if (Array.isArray(items) && items.length > 0) {
      for (const item of items) {
        const qty = parseInt(item.quantity, 10);
        if (!item.product) throw new Error('Product name is required for all items.');
        if (isNaN(qty) || qty <= 0) throw new Error('Quantity must be greater than 0.');
        parsedItems.push({
          product: item.product,
          quantity: qty
        });
      }
    } else {
      throw new Error('Supply items list is required.');
    }

    // Verify enough filled cans are available for '20 Ltr Can' supply
    const totalCanQty = parsedItems
      .filter(item => item.product === '20 Ltr Can')
      .reduce((sum, item) => sum + item.quantity, 0);

    if (totalCanQty > 0) {
      const [[{ production }]] = await connection.query(
        `SELECT COALESCE(SUM(empty_cans), 0) AS production FROM can_factory_stock WHERE entry_type = 'PRODUCTION' AND can_type = ?`,
        [supplyType]
      );
      const [[{ supplies }]] = await connection.query(
        `SELECT COALESCE(SUM(quantity), 0) AS supplies FROM can_supply_transactions WHERE type = 'SUPPLY' AND product = '20 Ltr Can' AND supply_type = ?`,
        [supplyType]
      );
      const currentFullQty = Math.max(0, parseInt(production, 10) - parseInt(supplies, 10));
      if (totalCanQty > currentFullQty) {
        throw new Error(`Not enough filled cans available. Available full cans: ${currentFullQty}`);
      }
    }

    await connection.beginTransaction();

    // Verify customer exists
    const [custRows] = await connection.query('SELECT name FROM customers WHERE id = ?', [customerId]);
    if (custRows.length === 0) throw new Error('Customer not found.');

    // Verify products are active in Product Master
    for (const item of parsedItems) {
      const [prodCheck] = await connection.query(
        'SELECT status FROM finished_products WHERE name = ?',
        [item.product]
      );
      if (prodCheck.length > 0 && prodCheck[0].status === 0) {
        throw new Error(`The product '${item.product}' is disabled in Product Master.`);
      }
    }

    // Insert into can_supply_transactions
    const insertQuery = `
      INSERT INTO can_supply_transactions (
        customer_id, transaction_date, type, supply_type, product, quantity, rate, amount, notes,
        function_name, event_date, expected_return_date, billing_id, created_by
      ) VALUES (?, ?, 'SUPPLY', ?, ?, ?, 0.00, 0.00, ?, ?, ?, ?, NULL, ?)
    `;

    for (const item of parsedItems) {
      await connection.query(insertQuery, [
        customerId,
        transactionDate,
        supplyType,
        item.product,
        item.quantity,
        notes || null,
        supplyType === 'Function Can' ? (functionName || null) : null,
        supplyType === 'Function Can' ? (eventDate || null) : null,
        supplyType === 'Function Can' ? (expectedReturnDate || null) : null,
        user
      ]);
    }

    await connection.commit();
    res.json({ ok: true, message: 'Supply logged successfully!' });

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
      SELECT bill_no, customer_id, customer_name, grand_total, amount_paid FROM can_billing WHERE id = ? FOR UPDATE
    `, [billId]);
    if (billRows.length === 0) throw new Error('Bill not found.');
    const bill = billRows[0];

    const currentPaid = parseFloat(bill.amount_paid);
    const grandTotal = parseFloat(bill.grand_total);
    const balance = grandTotal - currentPaid;

    if (amt > balance) {
      throw new Error(`Payment amount (₹${amt.toFixed(2)}) cannot exceed outstanding balance (₹${balance.toFixed(2)}).`);
    }

    // 2. Generate Payment number
    const paymentNo = await generateId('CPY', 'can_payments', 'payment_no', connection);

    // 2. All payments are approved immediately
    const newPaid = currentPaid + amt;
    let paymentStatus = 'Partially Paid';
    if (newPaid >= grandTotal) {
      paymentStatus = 'Paid';
    }

    await connection.query(`
      INSERT INTO can_payments (
        payment_no, bill_id, payment_date, amount_paid, payment_method, remarks, created_by,
        payment_status, pending_amount, approval_id, last_status_update
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Approved', 0.00, NULL, NOW())
    `, [paymentNo, billId, paymentDate, amt, paymentMethod, remarks || null, user]);

    await connection.query(`
      UPDATE can_billing SET amount_paid = ?, payment_status = ? WHERE id = ?
    `, [newPaid, paymentStatus, billId]);

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
        pending_amount AS pendingAmount,
        payment_method AS paymentMethod, 
        payment_status AS paymentStatus,
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
      emptyQty,
      fullQty = 0,
      damagedQty = 0,
      notes
    } = req.body;

    const resolvedEmptyQty = parseInt(emptyQty !== undefined ? emptyQty : 0, 10);
    const resolvedFullQty = parseInt(fullQty, 10) || 0;
    const resolvedDamagedQty = parseInt(damagedQty, 10) || 0;

    if (!customerId) throw new Error('Customer ID is required.');
    if (!transactionDate) throw new Error('Transaction date is required.');
    if (!parentTransactionId) throw new Error('Parent supply transaction is required.');

    if (resolvedEmptyQty < 0 || resolvedFullQty < 0 || resolvedDamagedQty < 0) {
      throw new Error('Quantities cannot be negative.');
    }

    const totalQtyThisTime = resolvedEmptyQty + resolvedFullQty + resolvedDamagedQty;
    if (totalQtyThisTime <= 0) {
      throw new Error('At least one return quantity (empty, full, or damaged) must be greater than 0.');
    }

    const user = req.admin?.name || req.admin?.username || 'Admin';

    await connection.beginTransaction();

    // 1. Fetch parent supply transaction
    const [parentRows] = await connection.query(
      `SELECT id, customer_id, product, supply_type, quantity, billing_id 
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
    if (totalQtyThisTime > pendingQty) {
      throw new Error(`Cannot return more than available pending quantity. Pending: ${pendingQty}, Attempted: ${totalQtyThisTime}`);
    }

    // 4. Log the Return Transactions
    // Empty Cans / Dispenser Returned
    if (resolvedEmptyQty > 0) {
      const itemNote = parentTx.product === 'Dispenser'
        ? (notes ? `${notes} (Dispenser Returned)` : 'Dispenser Return')
        : (notes ? `${notes} (Empty Cans)` : 'Empty Can Return');

      await connection.query(`
        INSERT INTO can_supply_transactions (
          customer_id, transaction_date, type, supply_type, product, quantity, rate, amount, notes,
          parent_transaction_id, created_by
        ) VALUES (?, ?, 'RETURN', ?, ?, ?, 0.00, 0.00, ?, ?, ?)
      `, [
        customerId,
        transactionDate,
        parentTx.supply_type,
        parentTx.product,
        resolvedEmptyQty,
        itemNote,
        parentTransactionId,
        user
      ]);
    }

    // Full Cans (Only for Cans)
    if (resolvedFullQty > 0 && parentTx.product !== 'Dispenser') {
      await connection.query(`
        INSERT INTO can_supply_transactions (
          customer_id, transaction_date, type, supply_type, product, quantity, rate, amount, notes,
          parent_transaction_id, created_by
        ) VALUES (?, ?, 'RETURN', ?, ?, ?, 0.00, 0.00, ?, ?, ?)
      `, [
        customerId,
        transactionDate,
        parentTx.supply_type,
        parentTx.product,
        resolvedFullQty,
        notes ? `${notes} (Full Cans)` : 'Full Cans Return',
        parentTransactionId,
        user
      ]);
    }

    // Damaged Cans / Dispenser Damaged
    if (resolvedDamagedQty > 0) {
      const itemNote = parentTx.product === 'Dispenser'
        ? (notes ? `${notes} (Dispenser Damaged)` : 'Dispenser Damaged')
        : (notes ? `${notes} (Damaged Cans)` : 'Damaged Can Penalty');

      await connection.query(`
        INSERT INTO can_supply_transactions (
          customer_id, transaction_date, type, supply_type, product, quantity, rate, amount, notes,
          parent_transaction_id, created_by
        ) VALUES (?, ?, 'RETURN', ?, ?, ?, 0.00, 0.00, ?, ?, ?)
      `, [
        customerId,
        transactionDate,
        parentTx.supply_type,
        parentTx.product,
        resolvedDamagedQty,
        itemNote,
        parentTransactionId,
        user
      ]);
    }

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
    const [[{ vkCans }]] = await pool.query(`
      SELECT COALESCE(SUM(CASE WHEN type = 'SUPPLY' THEN quantity ELSE -quantity END), 0) AS vkCans 
      FROM can_supply_transactions 
      WHERE product = '20 Ltr Can' AND supply_type = 'VK Can'
    `);

    const [[{ rkCans }]] = await pool.query(`
      SELECT COALESCE(SUM(CASE WHEN type = 'SUPPLY' THEN quantity ELSE -quantity END), 0) AS rkCans 
      FROM can_supply_transactions 
      WHERE product = '20 Ltr Can' AND supply_type = 'RK Can'
    `);

    const [[{ functionCans }]] = await pool.query(`
      SELECT COALESCE(SUM(CASE WHEN type = 'SUPPLY' THEN quantity ELSE -quantity END), 0) AS functionCans 
      FROM can_supply_transactions 
      WHERE product = '20 Ltr Can' AND supply_type = 'Function Can'
    `);

    const [[{ othersCans }]] = await pool.query(`
      SELECT COALESCE(SUM(CASE WHEN type = 'SUPPLY' THEN quantity ELSE -quantity END), 0) AS othersCans 
      FROM can_supply_transactions 
      WHERE product = '20 Ltr Can' AND supply_type = 'Others'
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

    const vkC = parseInt(vkCans, 10) || 0;
    const rkC = parseInt(rkCans, 10) || 0;
    const fCans = parseInt(functionCans, 10) || 0;
    const oCans = parseInt(othersCans, 10) || 0;
    const disp = parseInt(dispensers, 10) || 0;

    const totalCansOut = vkC + rkC + fCans + oCans;
    const totalPendingReturns = totalCansOut + disp;

    // Cans supplied today/weekly/monthly/yearly
    const [[cansStats]] = await pool.query(`
      SELECT
        COALESCE(SUM(CASE WHEN transaction_date = CURDATE() THEN quantity ELSE 0 END), 0) AS todayCans,
        COALESCE(SUM(CASE WHEN YEARWEEK(transaction_date, 1) = YEARWEEK(CURDATE(), 1) THEN quantity ELSE 0 END), 0) AS weeklyCans,
        COALESCE(SUM(CASE WHEN DATE_FORMAT(transaction_date, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m') THEN quantity ELSE 0 END), 0) AS monthlyCans,
        COALESCE(SUM(CASE WHEN YEAR(transaction_date) = YEAR(CURDATE()) THEN quantity ELSE 0 END), 0) AS yearlyCans
      FROM can_supply_transactions
      WHERE type = 'SUPPLY' AND product = '20 Ltr Can'
    `);

    res.json({
      ok: true,
      summary: {
        vkCansOut: vkC,
        rkCansOut: rkC,
        functionCansOut: fCans,
        othersCansOut: oCans,
        dispensersOut: disp,
        totalPendingReturns: totalPendingReturns
      },
      overdue,
      billingStats: {
        todayRevenue: 0.00,
        weeklyRevenue: 0.00,
        monthlyRevenue: 0.00,
        yearlyRevenue: 0.00,
        todayCans: parseInt(cansStats.todayCans, 10),
        weeklyCans: parseInt(cansStats.weeklyCans, 10),
        monthlyCans: parseInt(cansStats.monthlyCans, 10),
        yearlyCans: parseInt(cansStats.yearlyCans, 10),
        pendingPayments: 0.00,
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
            COALESCE(SUM(CASE WHEN t.product = '20 Ltr Can' AND t.supply_type = 'RK Can' THEN (CASE WHEN t.type = 'SUPPLY' THEN t.quantity ELSE -t.quantity END) ELSE 0 END), 0) AS cansOut
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

// GET /api/can-supply/factory-stock
// Returns aggregated factory stock summary based on the Can Supply Flow formulas
router.get('/factory-stock', async (req, res) => {
  try {
    const canTypes = ['VK Can', 'RK Can', 'Function Can', 'Others', 'Dispenser'];

    // 1. Sum of all opening entries per can type
    const [openingRows] = await pool.query(`
      SELECT can_type, COALESCE(SUM(empty_cans), 0) AS qty
      FROM can_factory_stock
      WHERE entry_type = 'OPENING'
      GROUP BY can_type
    `);

    // 2. Sum of all production entries per can type
    const [productionRows] = await pool.query(`
      SELECT can_type, COALESCE(SUM(empty_cans), 0) AS qty
      FROM can_factory_stock
      WHERE entry_type = 'PRODUCTION'
      GROUP BY can_type
    `);

    // 3. Supply and Return transactions per product type
    const [transRows] = await pool.query(`
      SELECT supply_type, product,
             COALESCE(SUM(CASE WHEN type = 'SUPPLY' THEN quantity ELSE 0 END), 0) AS supply_qty,
             COALESCE(SUM(CASE WHEN type = 'RETURN' AND (LOWER(notes) NOT LIKE '%full%' AND LOWER(notes) NOT LIKE '%damage%') THEN quantity ELSE 0 END), 0) AS empty_return_qty,
             COALESCE(SUM(CASE WHEN type = 'RETURN' AND (LOWER(notes) LIKE '%full%') THEN quantity ELSE 0 END), 0) AS full_return_qty,
             COALESCE(SUM(CASE WHEN type = 'RETURN' AND (LOWER(notes) LIKE '%damage%') THEN quantity ELSE 0 END), 0) AS damaged_qty
      FROM can_supply_transactions
      GROUP BY supply_type, product
    `);

    // Build maps
    const openingMap = {};
    const productionMap = {};
    const supplyMap = {};
    const returnMap = {};
    const fullReturnMap = {};
    const damagedMap = {};

    openingRows.forEach(r => { openingMap[r.can_type] = parseInt(r.qty, 10) || 0; });
    productionRows.forEach(r => { productionMap[r.can_type] = parseInt(r.qty, 10) || 0; });
    
    transRows.forEach(r => {
      if (r.product === 'Dispenser') {
        supplyMap['Dispenser'] = (supplyMap['Dispenser'] || 0) + (parseInt(r.supply_qty, 10) || 0);
        returnMap['Dispenser'] = (returnMap['Dispenser'] || 0) + (parseInt(r.empty_return_qty, 10) || 0);
        damagedMap['Dispenser'] = (damagedMap['Dispenser'] || 0) + (parseInt(r.damaged_qty, 10) || 0);
      } else {
        supplyMap[r.supply_type] = parseInt(r.supply_qty, 10) || 0;
        returnMap[r.supply_type] = parseInt(r.empty_return_qty, 10) || 0;
        fullReturnMap[r.supply_type] = parseInt(r.full_return_qty, 10) || 0;
        damagedMap[r.supply_type] = parseInt(r.damaged_qty, 10) || 0;
      }
    });

    const summary = canTypes.map(ct => {
      const opening = openingMap[ct] || 0;
      const production = productionMap[ct] || 0;
      const supply = supplyMap[ct] || 0;
      const ret = returnMap[ct] || 0;
      const fullRet = fullReturnMap[ct] || 0;
      const damaged = damagedMap[ct] || 0;

      let supplied, fullCans, totalEmpty, total;

      if (ct === 'Dispenser') {
        supplied = Math.max(0, supply - ret - damaged);
        fullCans = Math.max(0, opening - supply + ret);
        totalEmpty = 0;
        total = fullCans + supplied;
      } else {
        supplied = Math.max(0, supply - ret - fullRet - damaged);
        fullCans = Math.max(0, production - supply + fullRet);
        totalEmpty = Math.max(0, opening - production + ret);
        total = fullCans + totalEmpty + supplied;
      }

      return {
        canType: ct,
        openingEmpty: opening,
        productionEmpty: production,
        totalEmpty,
        supplied,
        fullCans,
        damaged,
        total
      };
    });

    const totals = {
      totalFull: summary.reduce((s, c) => s + c.fullCans, 0),
      totalEmpty: summary.reduce((s, c) => s + c.totalEmpty, 0),
      totalSupplied: summary.reduce((s, c) => s + c.supplied, 0),
      totalDamaged: summary.reduce((s, c) => s + c.damaged, 0),
      grandTotal: summary.reduce((s, c) => s + c.total, 0)
    };

    res.json({ ok: true, summary, totals });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// GET /api/can-supply/factory-stock/entries
// Returns recent entries list
router.get('/factory-stock/entries', async (req, res) => {
  try {
    const { entryType, canType, limit = 50 } = req.query;
    let whereClauses = [];
    let params = [];

    if (entryType) {
      whereClauses.push('entry_type = ?');
      params.push(entryType);
    }
    if (canType) {
      whereClauses.push('can_type = ?');
      params.push(canType);
    }

    const whereStr = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const [rows] = await pool.query(`
      SELECT id, DATE_FORMAT(entry_date, '%Y-%m-%d') AS entry_date, entry_type, can_type,
             empty_cans, notes, created_by, created_at
      FROM can_factory_stock
      ${whereStr}
      ORDER BY entry_date DESC, created_at DESC
      LIMIT ?
    `, [...params, parseInt(limit, 10)]);

    res.json({ ok: true, entries: rows });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// POST /api/can-supply/factory-stock
// Record a new opening or production entry with validation
router.post('/factory-stock', async (req, res) => {
  try {
    const { entryDate, entryType, canType, emptyCans, notes, createdBy } = req.body;

    if (!entryDate) return res.status(400).json({ ok: false, error: 'Entry date is required.' });
    if (!['OPENING', 'PRODUCTION'].includes(entryType)) {
      return res.status(400).json({ ok: false, error: 'Invalid entry type. Must be OPENING or PRODUCTION.' });
    }
    if (!['VK Can', 'RK Can', 'Function Can', 'Others', 'Dispenser'].includes(canType)) {
      return res.status(400).json({ ok: false, error: 'Invalid can type.' });
    }
    const qty = parseInt(emptyCans, 10);
    if (isNaN(qty) || qty <= 0) {
      return res.status(400).json({ ok: false, error: 'Quantity must be greater than 0.' });
    }

    if (entryType === 'PRODUCTION' && canType === 'Dispenser') {
      return res.status(400).json({ ok: false, error: 'Dispensers are not linked to production.' });
    }

    // If PRODUCTION, validate Filled Qty <= Empty Qty
    if (entryType === 'PRODUCTION') {
      const [[{ opening }]] = await pool.query(
        `SELECT COALESCE(SUM(empty_cans), 0) AS opening FROM can_factory_stock WHERE entry_type = 'OPENING' AND can_type = ?`,
        [canType]
      );
      const [[{ production }]] = await pool.query(
        `SELECT COALESCE(SUM(empty_cans), 0) AS production FROM can_factory_stock WHERE entry_type = 'PRODUCTION' AND can_type = ?`,
        [canType]
      );
      const [[{ returns }]] = await pool.query(
        `SELECT COALESCE(SUM(quantity), 0) AS returns FROM can_supply_transactions WHERE type = 'RETURN' AND product = '20 Ltr Can' AND supply_type = ?`,
        [canType]
      );

      const currentEmptyQty = Math.max(0, parseInt(opening, 10) - parseInt(production, 10) + parseInt(returns, 10));
      if (qty > currentEmptyQty) {
        return res.status(400).json({ ok: false, error: `Not enough empty cans available. Available empty cans: ${currentEmptyQty}` });
      }
    }

    const [result] = await pool.query(`
      INSERT INTO can_factory_stock (entry_date, entry_type, can_type, empty_cans, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [entryDate, entryType, canType, qty, notes || null, createdBy || 'system']);

    res.json({ ok: true, id: result.insertId, message: `${entryType} entry recorded successfully.` });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

export default router;