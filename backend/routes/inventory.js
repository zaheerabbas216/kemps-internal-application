import express from 'express';
import pool from '../config/db.js';
import { addSupplierLedgerEntry, deleteSupplierLedgerEntriesForReference } from '../helpers/ledgerHelper.js';

const router = express.Router();

// Helper to generate custom sequence ID (e.g. BILL-2026-00001)
async function generateId(prefix, table, idColumn) {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  // Adjust to IST timezone (UTC+5:30)
  const istDate = new Date(now.getTime() + (330 + offset) * 60000);
  const yyyy = istDate.getFullYear();
  
  if (prefix === 'EXP') {
    const mm = String(istDate.getMonth() + 1).padStart(2, '0');
    const dd = String(istDate.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}${mm}${dd}`;
    
    const [rows] = await pool.query(
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
  
  const [rows] = await pool.query(
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

// POST /api/inventory - Save Inventory Bill (Transaction Safe)
router.post('/', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const {
      billDate,
      supplierId,
      billedTo,
      billNumber,
      paymentMethod,
      subTotal,
      totalTax,
      additionalExpenses,
      grandTotal,
      remarks,
      items
    } = req.body;

    // Validate inputs
    if (!billDate) throw new Error('Bill date is required.');
    if (!supplierId) throw new Error('Supplier is required.');
    if (!billedTo) throw new Error('Billed To Company is required.');
    if (!paymentMethod) throw new Error('Payment method is required.');
    if (!items || items.length === 0) throw new Error('At least one product line item is required.');

    // Validate raw materials are active
    const rmIds = items.map(it => parseInt(it.rawMaterialId, 10)).filter(id => !isNaN(id));
    if (rmIds.length > 0) {
      const [inactiveRms] = await connection.query(
        `SELECT sub_product_name FROM raw_materials WHERE id IN (?) AND status = 0`,
        [rmIds]
      );
      if (inactiveRms.length > 0) {
        const names = inactiveRms.map(r => r.sub_product_name).join(', ');
        throw new Error(`The following raw materials are disabled in Product Master: ${names}. You cannot purchase them.`);
      }
    }

    // Generate Bill ID
    const billId = await generateId('BILL', 'inventory_bills', 'id');

    const isCredit = String(paymentMethod).trim().toLowerCase() === 'credit';
    const status = isCredit ? 'PENDING' : 'SETTLED';
    const advancePaid = parseFloat(req.body.advancePaid) || 0.00;
    const creditNote = parseFloat(req.body.creditNote) || 0.00;

    // 1. Insert into inventory_bills (Bill Header)
    await connection.query(
      `INSERT INTO inventory_bills 
       (id, bill_date, supplier_id, billed_to, bill_number, payment_method, sub_total, total_tax, additional_expenses, grand_total, remarks, status, advance_paid, credit_note, is_manual, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NOW())`,
      [
        billId,
        billDate,
        supplierId,
        billedTo,
        billNumber || '',
        paymentMethod,
        subTotal || 0,
        totalTax || 0,
        additionalExpenses || 0,
        grandTotal || 0,
        remarks || '',
        status,
        advancePaid,
        creditNote
      ]
    );

    // 2. Insert items and update stock register
    for (const item of items) {
      const {
        rawMaterialId,
        unit,
        bagsBox,
        totalQuantity,
        ratePerUnit,
        qtyInPcs,
        perPcRate,
        amount,
        taxPercent,
        taxAmount,
        expenses,
        finalTotal,
        remarks: itemRemarks
      } = item;

      if (!rawMaterialId) throw new Error('Product is required for all item rows.');
      if (!unit) throw new Error('Unit is required for all item rows.');
      if (parseFloat(totalQuantity) <= 0) throw new Error('Quantity must be greater than 0.');
      if (parseFloat(ratePerUnit) < 0) throw new Error('Rate per unit cannot be negative.');

      // Insert Bill Item
      const cleanQtyInPcs = isNaN(parseFloat(qtyInPcs)) ? 0 : parseFloat(qtyInPcs);
      const cleanPerPcRate = isNaN(parseFloat(perPcRate)) ? 0 : parseFloat(perPcRate);

      await connection.query(
        `INSERT INTO inventory_bill_items 
         (bill_id, raw_material_id, unit, bags_box, total_quantity, rate_per_unit, qty_in_pcs, per_pc_rate, amount, tax_percent, tax_amount, expenses, final_total, remarks, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          billId,
          rawMaterialId,
          unit,
          bagsBox || 0,
          totalQuantity,
          ratePerUnit,
          cleanQtyInPcs,
          cleanPerPcRate,
          amount,
          taxPercent || 0,
          taxAmount || 0,
          expenses || 0,
          finalTotal,
          itemRemarks || ''
        ]
      );

      // Check category to see if it's preform
      const [matRows] = await connection.query(
        `SELECT rm.unit, rmc.name as category_name 
         FROM raw_materials rm 
         JOIN raw_material_categories rmc ON rm.category_id = rmc.id 
         WHERE rm.id = ?`,
        [rawMaterialId]
      );
      const isPreform = matRows.length > 0 && matRows[0].category_name.toLowerCase() === 'preforms';

      // For non-preforms: if qty_in_pcs is provided and > 0, log qty_in_pcs to stock register
      let stockQty = parseFloat(totalQuantity) || 0;
      if (!isPreform && cleanQtyInPcs > 0) {
        stockQty = cleanQtyInPcs;
      }

      // Log to Stock Register (positive addition for purchases)
      await connection.query(
        `INSERT INTO stock_register (item_type, item_id, transaction_type, reference_id, quantity, created_at)
         VALUES ('RAW_MATERIAL', ?, 'PURCHASE', ?, ?, NOW())`,
        [rawMaterialId, billId, stockQty]
      );
    }

    // 3. Accounting: Create Expense entry if additional expenses were logged (always treated as Cash expense)
    if (parseFloat(additionalExpenses) > 0) {
      const expenseId = await generateId('EXP', 'expenses', 'id');
      const createdBy = req.admin?.name || req.admin?.username || 'Admin';
      await connection.query(
        `INSERT INTO expenses (id, expense_date, particulars, amount, entered_by, remarks, 
          payment_status, approved_amount, pending_amount, rejected_amount, category, payment_method, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'Approved', ?, 0.00, 0.00, 'Raw Material', 'Cash', NOW())`,
        [
          expenseId,
          billDate,
          `Inventory Purchase Expense: ${billId}`,
          parseFloat(additionalExpenses),
          createdBy,
          `Additional expenses for inventory bill: ${billId}`,
          parseFloat(additionalExpenses)
        ]
      );
    }

    // Supplier Ledger Hook: PURCHASE credit
    await addSupplierLedgerEntry(connection, {
      date: billDate,
      supplierId: supplierId,
      entryType: 'PURCHASE',
      referenceNo: billId,
      particular: `Purchase Invoice ${billId}`,
      debit: 0.00,
      credit: parseFloat(grandTotal) || 0.00
    });

    // Supplier Ledger Hook: PAYMENT debit if paid immediately (non-Credit)
    if (!isCredit) {
      await addSupplierLedgerEntry(connection, {
        date: billDate,
        supplierId: supplierId,
        entryType: 'PAYMENT',
        referenceNo: billId,
        particular: `Payment Made (At Purchase Creation)`,
        debit: parseFloat(grandTotal) || 0.00,
        credit: 0.00
      });
    } else {
      if (advancePaid > 0) {
        await addSupplierLedgerEntry(connection, {
          date: billDate,
          supplierId: supplierId,
          entryType: 'PAYMENT',
          referenceNo: billId,
          particular: `Payment Made (At Purchase Creation)`,
          debit: advancePaid,
          credit: 0.00
        });
      }
      if (creditNote > 0) {
        await addSupplierLedgerEntry(connection, {
          date: billDate,
          supplierId: supplierId,
          entryType: 'PAYMENT',
          referenceNo: billId,
          particular: `Credit Note Applied`,
          debit: creditNote,
          credit: 0.00
        });
      }
    }

    await connection.commit();
    res.json({ ok: true, id: billId, message: 'Inventory bill saved and stock updated successfully!' });
  } catch (error) {
    await connection.rollback();
    console.error('Save inventory bill error:', error);
    res.status(400).json({ ok: false, error: error.message });
  } finally {
    connection.release();
  }
});

// GET /api/inventory/today
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
      `SELECT COALESCE(SUM(grand_total), 0) as totalValue, COUNT(*) as totalCount 
       FROM inventory_bills 
       WHERE bill_date = ?`,
      [todayStr]
    );

    let queryParams = [todayStr];
    let whereClauses = ['b.bill_date = ?'];

    if (search.trim()) {
      whereClauses.push(`(
        b.bill_number LIKE ? 
        OR c.company_name LIKE ? 
        OR b.billed_to LIKE ? 
        OR b.payment_method LIKE ?
        OR rm.sub_product_name LIKE ?
      )`);
      const wild = `%${search.trim()}%`;
      queryParams.push(wild, wild, wild, wild, wild);
    }

    const whereClauseStr = `WHERE ${whereClauses.join(' AND ')}`;

    // Select distinct bills with product summary
    const [rows] = await pool.query(
      `SELECT 
        b.id,
        DATE_FORMAT(b.bill_date, '%Y-%m-%d') as bill_date,
        b.bill_number,
        b.billed_to,
        b.payment_method,
        b.grand_total,
        c.company_name AS supplier_name,
        GROUP_CONCAT(DISTINCT rm.sub_product_name SEPARATOR ', ') AS products_summary
       FROM inventory_bills b
       JOIN company_details c ON b.supplier_id = c.id
       LEFT JOIN inventory_bill_items bi ON b.id = bi.bill_id
       LEFT JOIN raw_materials rm ON bi.raw_material_id = rm.id
       ${whereClauseStr}
       GROUP BY b.id
       ORDER BY b.created_at DESC`,
      queryParams
    );

    res.json({
      ok: true,
      bills: rows,
      todayStr,
      summary: {
        totalValue: parseFloat(summaryRows[0].totalValue),
        totalCount: parseInt(summaryRows[0].totalCount, 10)
      }
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// GET /api/inventory/history
router.get('/history', async (req, res) => {
  try {
    let { page = 1, limit = 10, search = '', startDate = '', endDate = '', billedTo = '', supplierId = '', paymentMethod = '' } = req.query;
    page = parseInt(page, 10);
    limit = parseInt(limit, 15);
    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1) limit = 10;

    const offset = (page - 1) * limit;
    let queryParams = [];
    let whereClauses = [];

    if (startDate) {
      whereClauses.push('b.bill_date >= ?');
      queryParams.push(startDate);
    }
    if (endDate) {
      whereClauses.push('b.bill_date <= ?');
      queryParams.push(endDate);
    }
    if (billedTo && billedTo !== 'All') {
      whereClauses.push('b.billed_to = ?');
      queryParams.push(billedTo);
    }
    if (supplierId) {
      whereClauses.push('b.supplier_id = ?');
      queryParams.push(supplierId);
    }
    if (paymentMethod && paymentMethod !== 'All') {
      whereClauses.push('b.payment_method = ?');
      queryParams.push(paymentMethod);
    }
    if (search.trim()) {
      whereClauses.push(`(
        b.bill_number LIKE ? 
        OR c.company_name LIKE ? 
        OR b.id LIKE ? 
        OR rm.sub_product_name LIKE ?
      )`);
      const wild = `%${search.trim()}%`;
      queryParams.push(wild, wild, wild, wild);
    }

    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Total Count of distinct bills
    const [countRows] = await pool.query(
      `SELECT COUNT(DISTINCT b.id) as count 
       FROM inventory_bills b
       JOIN company_details c ON b.supplier_id = c.id
       LEFT JOIN inventory_bill_items bi ON b.id = bi.bill_id
       LEFT JOIN raw_materials rm ON bi.raw_material_id = rm.id
       ${whereStr}`,
      queryParams
    );
    const total = countRows[0].count;

    // Retrieve rows
    let selectParams = [...queryParams, limit, offset];
    const [rows] = await pool.query(
      `SELECT 
        b.id,
        DATE_FORMAT(b.bill_date, '%Y-%m-%d') as bill_date,
        b.bill_number,
        b.billed_to,
        b.payment_method,
        b.grand_total,
        c.company_name AS supplier_name,
        GROUP_CONCAT(DISTINCT rm.sub_product_name SEPARATOR ', ') AS products_summary
       FROM inventory_bills b
       JOIN company_details c ON b.supplier_id = c.id
       LEFT JOIN inventory_bill_items bi ON b.id = bi.bill_id
       LEFT JOIN raw_materials rm ON bi.raw_material_id = rm.id
       ${whereStr}
       GROUP BY b.id
       ORDER BY b.bill_date DESC, b.created_at DESC
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
    res.status(400).json({ ok: false, error: error.message });
  }
});

// GET /api/inventory/analytics
router.get('/analytics', async (req, res) => {
  try {
    const { billedTo = 'All', startDate = '', endDate = '' } = req.query;
    
    let queryParams = [];
    let whereClauses = [];

    if (billedTo && billedTo !== 'All') {
      whereClauses.push('b.billed_to = ?');
      queryParams.push(billedTo);
    }
    if (startDate) {
      whereClauses.push('b.bill_date >= ?');
      queryParams.push(startDate);
    }
    if (endDate) {
      whereClauses.push('b.bill_date <= ?');
      queryParams.push(endDate);
    }

    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Overall Summary
    const [summaryRows] = await pool.query(
      `SELECT 
        COUNT(*) as totalBills,
        COALESCE(SUM(grand_total), 0) as totalValue,
        COUNT(DISTINCT supplier_id) as supplierCount
       FROM inventory_bills b
       ${whereStr}`,
      queryParams
    );

    // Supplier Breakdown
    const [breakdownRows] = await pool.query(
      `SELECT 
        c.company_name,
        COALESCE(SUM(b.grand_total), 0) as totalPurchase,
        COUNT(*) as billCount
       FROM inventory_bills b
       JOIN company_details c ON b.supplier_id = c.id
       ${whereStr}
       GROUP BY b.supplier_id
       ORDER BY totalPurchase DESC`,
      queryParams
    );

    res.json({
      ok: true,
      analytics: {
        totalBills: parseInt(summaryRows[0].totalBills, 10),
        totalValue: parseFloat(summaryRows[0].totalValue),
        supplierCount: parseInt(summaryRows[0].supplierCount, 10),
        supplierBreakdown: breakdownRows
      }
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// GET /api/inventory/:id - Fetch Single Bill Details (Joined with Products)
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Header Details
    const [headerRows] = await pool.query(
      `SELECT 
        b.id,
        DATE_FORMAT(b.bill_date, '%Y-%m-%d') as bill_date,
        b.supplier_id,
        c.company_name AS supplier_name,
        b.billed_to,
        b.bill_number,
        b.payment_method,
        b.sub_total,
        b.total_tax,
        b.additional_expenses,
        b.grand_total,
        b.remarks,
        b.description,
        b.is_manual,
        b.advance_paid,
        b.credit_note,
        b.status
       FROM inventory_bills b
       JOIN company_details c ON b.supplier_id = c.id
       WHERE b.id = ?`,
      [id]
    );

    if (headerRows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Inventory bill not found.' });
    }

    // Item Details
    const [itemRows] = await pool.query(
      `SELECT 
        bi.id,
        bi.raw_material_id,
        rm.sub_product_name,
        rmc.name AS category_name,
        bi.unit,
        bi.bags_box,
        bi.total_quantity,
        bi.rate_per_unit,
        bi.qty_in_pcs,
        bi.per_pc_rate,
        bi.amount,
        bi.tax_percent,
        bi.tax_amount,
        bi.expenses,
        bi.final_total,
        bi.remarks
       FROM inventory_bill_items bi
       JOIN raw_materials rm ON bi.raw_material_id = rm.id
       JOIN raw_material_categories rmc ON rm.category_id = rmc.id
       WHERE bi.bill_id = ?`,
      [id]
    );

    res.json({
      ok: true,
      bill: headerRows[0],
      items: itemRows
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// PUT /api/inventory/:id - Update Inventory Bill (Transaction Safe)
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const {
      billDate,
      supplierId,
      billedTo,
      billNumber,
      paymentMethod,
      subTotal,
      totalTax,
      additionalExpenses,
      grandTotal,
      remarks,
      items
    } = req.body;

    // Validate inputs
    if (!billDate) throw new Error('Bill date is required.');
    if (!supplierId) throw new Error('Supplier is required.');
    if (!billedTo) throw new Error('Billed To Company is required.');
    if (!paymentMethod) throw new Error('Payment method is required.');
    if (!items || items.length === 0) throw new Error('At least one product line item is required.');

    // Validate raw materials are active
    const rmIds = items.map(it => parseInt(it.rawMaterialId, 10)).filter(id => !isNaN(id));
    if (rmIds.length > 0) {
      const [inactiveRms] = await connection.query(
        `SELECT sub_product_name FROM raw_materials WHERE id IN (?) AND status = 0`,
        [rmIds]
      );
      if (inactiveRms.length > 0) {
        const names = inactiveRms.map(r => r.sub_product_name).join(', ');
        throw new Error(`The following raw materials are disabled in Product Master: ${names}. You cannot purchase them.`);
      }
    }

    const isCredit = String(paymentMethod).trim().toLowerCase() === 'credit';
    const advancePaid = parseFloat(req.body.advancePaid) || 0.00;
    const creditNote = parseFloat(req.body.creditNote) || 0.00;

    // Fetch existing approved payments for this bill if any
    const [payRows] = await connection.query(
      `SELECT COALESCE(SUM(amount), 0) AS paid FROM supplier_payments WHERE bill_id = ? AND payment_status = 'Approved'`,
      [id]
    );
    const totalPaid = parseFloat(payRows[0].paid) || 0;
    const remainingBalance = parseFloat(grandTotal) - advancePaid - creditNote - totalPaid;
    const status = isCredit ? (remainingBalance <= 0 ? 'SETTLED' : 'PENDING') : 'SETTLED';

    // 1. Update bill header
    await connection.query(
      `UPDATE inventory_bills 
       SET bill_date = ?, supplier_id = ?, billed_to = ?, bill_number = ?, payment_method = ?, 
           sub_total = ?, total_tax = ?, additional_expenses = ?, grand_total = ?, remarks = ?, status = ?,
           advance_paid = ?, credit_note = ?
       WHERE id = ?`,
      [
        billDate,
        supplierId,
        billedTo,
        billNumber || '',
        paymentMethod,
        subTotal || 0,
        totalTax || 0,
        additionalExpenses || 0,
        grandTotal || 0,
        remarks || '',
        status,
        advancePaid,
        creditNote,
        id
      ]
    );

    // 2. Delete existing items and stock register logs for this bill
    await connection.query('DELETE FROM inventory_bill_items WHERE bill_id = ?', [id]);
    await connection.query('DELETE FROM stock_register WHERE reference_id = ? AND transaction_type = "PURCHASE"', [id]);

    // 3. Re-insert items and update stock register
    for (const item of items) {
      const {
        rawMaterialId,
        unit,
        bagsBox,
        totalQuantity,
        ratePerUnit,
        qtyInPcs,
        perPcRate,
        amount,
        taxPercent,
        taxAmount,
        expenses,
        finalTotal,
        remarks: itemRemarks
      } = item;

      if (!rawMaterialId) throw new Error('Product is required for all item rows.');
      if (!unit) throw new Error('Unit is required for all item rows.');
      if (parseFloat(totalQuantity) <= 0) throw new Error('Quantity must be greater than 0.');
      if (parseFloat(ratePerUnit) < 0) throw new Error('Rate per unit cannot be negative.');

      // Insert Bill Item
      const cleanQtyInPcs = isNaN(parseFloat(qtyInPcs)) ? 0 : parseFloat(qtyInPcs);
      const cleanPerPcRate = isNaN(parseFloat(perPcRate)) ? 0 : parseFloat(perPcRate);

      await connection.query(
        `INSERT INTO inventory_bill_items 
         (bill_id, raw_material_id, unit, bags_box, total_quantity, rate_per_unit, qty_in_pcs, per_pc_rate, amount, tax_percent, tax_amount, expenses, final_total, remarks, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          id,
          rawMaterialId,
          unit,
          bagsBox || 0,
          totalQuantity,
          ratePerUnit,
          cleanQtyInPcs,
          cleanPerPcRate,
          amount,
          taxPercent || 0,
          taxAmount || 0,
          expenses || 0,
          finalTotal,
          itemRemarks || ''
        ]
      );

      // Check category to see if it's preform
      const [matRows] = await connection.query(
        `SELECT rm.unit, rmc.name as category_name 
         FROM raw_materials rm 
         JOIN raw_material_categories rmc ON rm.category_id = rmc.id 
         WHERE rm.id = ?`,
        [rawMaterialId]
      );
      const isPreform = matRows.length > 0 && matRows[0].category_name.toLowerCase() === 'preforms';

      // For non-preforms: if qty_in_pcs is provided and > 0, log qty_in_pcs to stock register
      let stockQty = parseFloat(totalQuantity) || 0;
      if (!isPreform && cleanQtyInPcs > 0) {
        stockQty = cleanQtyInPcs;
      }

      // Log to Stock Register (positive addition for purchases)
      await connection.query(
        `INSERT INTO stock_register (item_type, item_id, transaction_type, reference_id, quantity, created_at)
         VALUES ('RAW_MATERIAL', ?, 'PURCHASE', ?, ?, NOW())`,
        [rawMaterialId, id, stockQty]
      );
    }

    // 4. Update corresponding expense record
    await connection.query(
      `DELETE FROM expenses WHERE particulars = ?`,
      [`Inventory Purchase Expense: ${id}`]
    );

    if (parseFloat(additionalExpenses) > 0) {
      const expenseId = await generateId('EXP', 'expenses', 'id');
      const createdBy = req.admin?.name || req.admin?.username || 'Admin';
      await connection.query(
        `INSERT INTO expenses (id, expense_date, particulars, amount, entered_by, remarks, 
          payment_status, approved_amount, pending_amount, rejected_amount, category, payment_method, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'Approved', ?, 0.00, 0.00, 'Raw Material', 'Cash', NOW())`,
        [
          expenseId,
          billDate,
          `Inventory Purchase Expense: ${id}`,
          parseFloat(additionalExpenses),
          createdBy,
          `Additional expenses for inventory bill: ${id}`,
          parseFloat(additionalExpenses)
        ]
      );
    }

    // 5. Sync Supplier Ledger
    await deleteSupplierLedgerEntriesForReference(connection, id);

    await addSupplierLedgerEntry(connection, {
      date: billDate,
      supplierId: supplierId,
      entryType: 'PURCHASE',
      referenceNo: id,
      particular: `Purchase Invoice ${id}`,
      debit: 0.00,
      credit: parseFloat(grandTotal) || 0.00
    });

    if (!isCredit) {
      await addSupplierLedgerEntry(connection, {
        date: billDate,
        supplierId: supplierId,
        entryType: 'PAYMENT',
        referenceNo: id,
        particular: `Payment Made (At Purchase Creation)`,
        debit: parseFloat(grandTotal) || 0.00,
        credit: 0.00
      });
    } else {
      if (advancePaid > 0) {
        await addSupplierLedgerEntry(connection, {
          date: billDate,
          supplierId: supplierId,
          entryType: 'PAYMENT',
          referenceNo: id,
          particular: `Payment Made (At Purchase Creation)`,
          debit: advancePaid,
          credit: 0.00
        });
      }
      if (creditNote > 0) {
        await addSupplierLedgerEntry(connection, {
          date: billDate,
          supplierId: supplierId,
          entryType: 'PAYMENT',
          referenceNo: id,
          particular: `Credit Note Applied`,
          debit: creditNote,
          credit: 0.00
        });
      }
    }

    await connection.commit();
    res.json({ ok: true, message: 'Inventory bill updated successfully!' });
  } catch (error) {
    await connection.rollback();
    console.error('Update inventory bill error:', error);
    res.status(400).json({ ok: false, error: error.message });
  } finally {
    connection.release();
  }
});

// DELETE /api/inventory/:id
router.delete('/:id', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;

    // Remove from stock register first
    await connection.query('DELETE FROM stock_register WHERE reference_id = ? AND transaction_type = "PURCHASE"', [id]);

    // Delete bill (items will be deleted automatically due to CASCADE constraint)
    const [result] = await connection.query('DELETE FROM inventory_bills WHERE id = ?', [id]);
    if (result.affectedRows === 0) throw new Error('Bill record not found.');

    // Delete corresponding expense record
    await connection.query(
      `DELETE FROM expenses WHERE particulars = ?`,
      [`Inventory Purchase Expense: ${id}`]
    );

    // Supplier Ledger Hook: delete bill ledger records
    await deleteSupplierLedgerEntriesForReference(connection, id);

    await connection.commit();
    res.json({ ok: true, message: 'Inventory bill and stock registry adjustments deleted successfully.' });
  } catch (error) {
    await connection.rollback();
    res.status(400).json({ ok: false, error: error.message });
  } finally {
    connection.release();
  }
});

export default router;
