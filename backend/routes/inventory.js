import express from 'express';
import pool from '../config/db.js';

const router = express.Router();

// Helper to generate custom sequence ID (e.g. BILL-2026-00001)
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

    // Generate Bill ID
    const billId = await generateId('BILL', 'inventory_bills', 'id');

    // 1. Insert into inventory_bills (Bill Header)
    await connection.query(
      `INSERT INTO inventory_bills 
       (id, bill_date, supplier_id, billed_to, bill_number, payment_method, sub_total, total_tax, additional_expenses, grand_total, remarks, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
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
        remarks || ''
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

      // Log to Stock Register (positive addition for purchases)
      await connection.query(
        `INSERT INTO stock_register (item_type, item_id, transaction_type, reference_id, quantity, created_at)
         VALUES ('RAW_MATERIAL', ?, 'PURCHASE', ?, ?, NOW())`,
        [rawMaterialId, billId, totalQuantity]
      );
    }

    // 3. Accounting: Create Expense entry if additional expenses were logged
    if (parseFloat(additionalExpenses) > 0) {
      const expenseId = await generateId('EXP', 'expenses', 'id');
      const createdBy = req.admin?.name || req.admin?.username || 'Admin';
      await connection.query(
        `INSERT INTO expenses (id, expense_date, particulars, amount, entered_by, remarks, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [
          expenseId,
          billDate,
          `Inventory Purchase Expense: ${billId}`,
          parseFloat(additionalExpenses),
          createdBy,
          `Additional expenses for inventory bill: ${billId}`
        ]
      );
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
        b.remarks
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

    // 1. Update bill header
    await connection.query(
      `UPDATE inventory_bills 
       SET bill_date = ?, supplier_id = ?, billed_to = ?, bill_number = ?, payment_method = ?, 
           sub_total = ?, total_tax = ?, additional_expenses = ?, grand_total = ?, remarks = ?
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

      // Log to Stock Register (positive addition for purchases)
      await connection.query(
        `INSERT INTO stock_register (item_type, item_id, transaction_type, reference_id, quantity, created_at)
         VALUES ('RAW_MATERIAL', ?, 'PURCHASE', ?, ?, NOW())`,
        [rawMaterialId, id, totalQuantity]
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
        `INSERT INTO expenses (id, expense_date, particulars, amount, entered_by, remarks, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [
          expenseId,
          billDate,
          `Inventory Purchase Expense: ${id}`,
          parseFloat(additionalExpenses),
          createdBy,
          `Additional expenses for inventory bill: ${id}`
        ]
      );
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
