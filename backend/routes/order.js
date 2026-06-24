import express from 'express';
import pool from '../config/db.js';

const router = express.Router();

function normalizePhone10(phone) {
  let s = String(phone || '').trim();
  const digits = s.replace(/\D+/g, '');
  const ph = digits.length >= 10 ? digits.slice(-10) : digits;
  if (!/^\d{10}$/.test(ph)) throw new Error("Phone must be exactly 10 digits.");
  return ph;
}

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

// POST /api/orders - Record a new customer order
router.post('/', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const {
      customerId,
      customerName,
      customerPhone,
      customerGstin = '',
      customerAddress = '',
      customerType = 'General Customer',
      alternatePhone = '',
      supplyDate,
      supplyTime,
      deliveryAddress = '',
      deliveryInstructions = '',
      subTotal = 0.00,
      discount = 0.00,
      tax = 0.00,
      grandTotal = 0.00,
      paymentMode = 'Cash',
      advanceAmount = 0.00,
      notes = '',
      items = []
    } = req.body;

    const createdBy = req.admin?.name || req.admin?.username || 'Admin';

    if (!customerPhone) throw new Error('Customer Phone is required.');
    if (!customerName || !String(customerName).trim()) throw new Error('Customer Name is required.');
    if (!supplyDate) throw new Error('Supply Date is required.');
    if (!supplyTime) throw new Error('Supply Time is required.');
    if (items.length === 0) throw new Error('At least one product line is required.');

    const cleanPhone = normalizePhone10(customerPhone);
    const cleanName = String(customerName).trim();
    const cleanGst = String(customerGstin).trim();
    const cleanAddress = String(customerAddress).trim();

    // 1. Resolve or Create Customer
    let customerDbId = customerId || null;
    const [existingCust] = await connection.query(
      `SELECT id FROM customers WHERE phone = ?`,
      [cleanPhone]
    );

    if (existingCust.length > 0) {
      customerDbId = existingCust[0].id;
      await connection.query(
        `UPDATE customers SET name = ?, gstin = ?, address = ? WHERE id = ?`,
        [cleanName, cleanGst, cleanAddress, customerDbId]
      );
    } else {
      customerDbId = await generateId('CUST', 'customers', 'id', connection);
      await connection.query(
        `INSERT INTO customers (id, name, phone, gstin, address) VALUES (?, ?, ?, ?, ?)`,
        [customerDbId, cleanName, cleanPhone, cleanGst, cleanAddress]
      );
    }

    // 2. Generate Order ID
    const orderId = await generateId('ORD', 'customer_orders', 'id', connection);
    const pendingAmount = Math.max(0, parseFloat(grandTotal) - parseFloat(advanceAmount || 0));

    // 3. Insert Order Metadata
    await connection.query(
      `INSERT INTO customer_orders (
        id, customer_id, customer_name, customer_phone, customer_gstin, customer_address, 
        customer_type, alternate_phone, supply_date, supply_time, delivery_address, 
        delivery_instructions, sub_total, discount, tax, grand_total, payment_mode, 
        advance_amount, pending_amount, notes, status, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, NOW())`,
      [
        orderId, customerDbId, cleanName, cleanPhone, cleanGst, cleanAddress,
        customerType, alternatePhone, supplyDate, supplyTime, deliveryAddress || cleanAddress,
        deliveryInstructions, subTotal, discount, tax, grandTotal, paymentMode,
        advanceAmount, pendingAmount, notes, createdBy
      ]
    );

    // Validate finished products are active
    const prodIds = items.map(it => parseInt(it.finishedProductId, 10)).filter(id => !isNaN(id));
    if (prodIds.length > 0) {
      const [inactiveProds] = await connection.query(
        `SELECT name FROM finished_products WHERE id IN (?) AND status = 0`,
        [prodIds]
      );
      if (inactiveProds.length > 0) {
        const names = inactiveProds.map(p => p.name).join(', ');
        throw new Error(`The following products are disabled in Product Master: ${names}. You cannot place an order for them.`);
      }
    }

    // 4. Insert Order Items
    for (const item of items) {
      const { finishedProductId, quantity, rate } = item;
      const q = parseInt(quantity, 10);
      const r = parseFloat(rate) || 0.00;
      
      if (!finishedProductId) throw new Error('Product is invalid.');
      if (isNaN(q) || q <= 0) throw new Error('Product quantity must be greater than 0.');

      const amt = q * r;

      await connection.query(
        `INSERT INTO customer_order_items (order_id, finished_product_id, quantity, rate, amount)
         VALUES (?, ?, ?, ?, ?)`,
        [orderId, parseInt(finishedProductId, 10), q, r, amt]
      );
    }

    await connection.commit();
    res.json({
      ok: true,
      id: orderId,
      message: 'Order logged successfully!'
    });
  } catch (error) {
    await connection.rollback();
    console.error('Create order error:', error);
    res.status(400).json({ ok: false, error: error.message });
  } finally {
    connection.release();
  }
});

// GET /api/orders/dashboard-widgets - Dashboard metric counts
router.get('/dashboard-widgets', async (req, res) => {
  try {
    const { customerType = '', excludeCustomerType = '' } = req.query;
    
    let whereClauses = [];
    let queryParams = [];
    
    if (customerType) {
      whereClauses.push('customer_type = ?');
      queryParams.push(customerType);
    }
    if (excludeCustomerType) {
      whereClauses.push('customer_type != ?');
      queryParams.push(excludeCustomerType);
    }
    
    const extraFilter = whereClauses.length > 0 ? ` AND ${whereClauses.join(' AND ')}` : '';

    // Today's scheduled deliveries (Pending status, supply_date = today)
    const [todayDeliveries] = await pool.query(
      `SELECT COUNT(*) as count FROM customer_orders 
       WHERE status = 'PENDING' AND supply_date = CURDATE()${extraFilter}`,
      queryParams
    );

    // Pending orders (all pending)
    const [pendingCount] = await pool.query(
      `SELECT COUNT(*) as count FROM customer_orders WHERE status = 'PENDING'${extraFilter}`,
      queryParams
    );

    // Supplied today
    const [suppliedToday] = await pool.query(
      `SELECT COUNT(*) as count FROM customer_orders 
       WHERE status = 'SUPPLIED' AND DATE(supplied_at) = CURDATE()${extraFilter}`,
      queryParams
    );

    // Cancelled today
    const [cancelledToday] = await pool.query(
      `SELECT COUNT(*) as count FROM customer_orders 
       WHERE status = 'CANCELLED' AND DATE(cancelled_at) = CURDATE()${extraFilter}`,
      queryParams
    );

    res.json({
      ok: true,
      widgets: {
        todayDeliveries: todayDeliveries[0].count,
        pendingCount: pendingCount[0].count,
        suppliedToday: suppliedToday[0].count,
        cancelledToday: cancelledToday[0].count
      }
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// GET /api/orders - Get list of orders with pagination & filters
router.get('/', async (req, res) => {
  try {
    let { 
      page = 1, 
      limit = 10, 
      search = '', 
      startDate = '', 
      endDate = '', 
      status = '', 
      productId = '', 
      deliveryArea = '',
      upcoming = '',
      customerType = '',
      excludeCustomerType = ''
    } = req.query;

    page = parseInt(page, 10);
    limit = parseInt(limit, 10);
    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1) limit = 10;
    const offset = (page - 1) * limit;

    let queryParams = [];
    let whereClauses = [];

    if (search.trim()) {
      whereClauses.push('(co.customer_name LIKE ? OR co.customer_phone LIKE ? OR co.id LIKE ?)');
      const wild = `%${search.trim()}%`;
      queryParams.push(wild, wild, wild);
    }

    if (startDate) {
      whereClauses.push('co.supply_date >= ?');
      queryParams.push(startDate);
    }
    if (endDate) {
      whereClauses.push('co.supply_date <= ?');
      queryParams.push(endDate);
    }

    if (status) {
      whereClauses.push('co.status = ?');
      queryParams.push(status);
    }

    if (customerType) {
      whereClauses.push('co.customer_type = ?');
      queryParams.push(customerType);
    }

    if (excludeCustomerType) {
      whereClauses.push('co.customer_type != ?');
      queryParams.push(excludeCustomerType);
    }

    if (productId) {
      whereClauses.push('EXISTS (SELECT 1 FROM customer_order_items coi WHERE coi.order_id = co.id AND coi.finished_product_id = ?)');
      queryParams.push(parseInt(productId, 10));
    }

    if (deliveryArea.trim()) {
      whereClauses.push('(co.delivery_address LIKE ? OR co.customer_address LIKE ?)');
      const wild = `%${deliveryArea.trim()}%`;
      queryParams.push(wild, wild);
    }

    let sortStr = 'co.created_at DESC';
    if (upcoming === 'true') {
      whereClauses.push("co.status = 'PENDING'");
      sortStr = 'co.supply_date ASC, co.supply_time ASC';
    }

    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const [countRows] = await pool.query(
      `SELECT COUNT(DISTINCT co.id) as count 
       FROM customer_orders co
       ${whereStr}`,
      queryParams
    );
    const total = countRows[0].count;

    const [rows] = await pool.query(
      `SELECT 
         co.id,
         co.customer_id,
         co.customer_name,
         co.customer_phone,
         co.customer_gstin,
         co.customer_address,
         co.customer_type,
         co.alternate_phone,
         DATE_FORMAT(co.supply_date, '%Y-%m-%d') as supply_date,
         TIME_FORMAT(co.supply_time, '%H:%i') as supply_time,
         co.delivery_address,
         co.delivery_instructions,
         co.sub_total,
         co.discount,
         co.tax,
         co.grand_total,
         co.payment_mode,
         co.advance_amount,
         co.pending_amount,
         co.notes,
         co.status,
         co.created_by,
         co.created_at,
         co.edited_by,
         co.edited_at,
         co.supplied_by,
         co.supplied_at,
         co.cancelled_by,
         co.cancelled_at,
         co.cancellation_reason
       FROM customer_orders co
       ${whereStr}
       ORDER BY ${sortStr}
       LIMIT ? OFFSET ?`,
      [...queryParams, limit, offset]
    );

    const ordersWithItems = [];
    for (const order of rows) {
      const [items] = await pool.query(
        `SELECT 
           coi.id,
           coi.finished_product_id AS finishedProductId,
           fp.name AS productName,
           coi.quantity,
           coi.rate,
           coi.amount
         FROM customer_order_items coi
         JOIN finished_products fp ON coi.finished_product_id = fp.id
         WHERE coi.order_id = ?`,
        [order.id]
      );
      ordersWithItems.push({
        ...order,
        items
      });
    }

    res.json({
      ok: true,
      orders: ordersWithItems,
      total,
      page,
      limit
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// GET /api/orders/:id - Retrieve details for a single order
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      `SELECT 
         co.id,
         co.customer_id,
         co.customer_name,
         co.customer_phone,
         co.customer_gstin,
         co.customer_address,
         co.customer_type,
         co.alternate_phone,
         DATE_FORMAT(co.supply_date, '%Y-%m-%d') as supply_date,
         TIME_FORMAT(co.supply_time, '%H:%i') as supply_time,
         co.delivery_address,
         co.delivery_instructions,
         co.sub_total,
         co.discount,
         co.tax,
         co.grand_total,
         co.payment_mode,
         co.advance_amount,
         co.pending_amount,
         co.notes,
         co.status,
         co.created_by,
         co.created_at,
         co.edited_by,
         co.edited_at,
         co.supplied_by,
         co.supplied_at,
         co.cancelled_by,
         co.cancelled_at,
         co.cancellation_reason
       FROM customer_orders co
       WHERE co.id = ?`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Order not found.' });
    }

    const order = rows[0];

    const [items] = await pool.query(
      `SELECT 
         coi.id,
         coi.finished_product_id AS finishedProductId,
         fp.name AS productName,
         coi.quantity,
         coi.rate,
         coi.amount
       FROM customer_order_items coi
       JOIN finished_products fp ON coi.finished_product_id = fp.id
       WHERE coi.order_id = ?`,
      [id]
    );

    res.json({
      ok: true,
      order,
      items
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// PUT /api/orders/:id - Edit order details (Allowed only if status is PENDING)
router.put('/:id', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const {
      supplyDate,
      supplyTime,
      deliveryAddress,
      deliveryInstructions = '',
      alternatePhone = '',
      subTotal = 0.00,
      discount = 0.00,
      tax = 0.00,
      grandTotal = 0.00,
      paymentMode = 'Cash',
      advanceAmount = 0.00,
      notes = '',
      items = []
    } = req.body;

    const editedBy = req.admin?.name || req.admin?.username || 'Admin';

    // Verify current status
    const [existing] = await connection.query(
      `SELECT status FROM customer_orders WHERE id = ?`,
      [id]
    );

    if (existing.length === 0) {
      throw new Error('Order not found.');
    }
    if (existing[0].status !== 'PENDING') {
      throw new Error('Cannot edit an order that has already been supplied or cancelled.');
    }

    if (!supplyDate) throw new Error('Supply Date is required.');
    if (!supplyTime) throw new Error('Supply Time is required.');
    if (items.length === 0) throw new Error('At least one product line is required.');

    const pendingAmount = Math.max(0, parseFloat(grandTotal) - parseFloat(advanceAmount || 0));

    // 1. Update Order Metadata
    await connection.query(
      `UPDATE customer_orders SET 
        supply_date = ?, supply_time = ?, delivery_address = ?, delivery_instructions = ?, 
        alternate_phone = ?, sub_total = ?, discount = ?, tax = ?, grand_total = ?, 
        payment_mode = ?, advance_amount = ?, pending_amount = ?, notes = ?, 
        edited_by = ?, edited_at = NOW()
       WHERE id = ?`,
      [
        supplyDate, supplyTime, deliveryAddress, deliveryInstructions,
        alternatePhone, subTotal, discount, tax, grandTotal,
        paymentMode, advanceAmount, pendingAmount, notes,
        editedBy, id
      ]
    );

    // 2. Clear existing items
    await connection.query(`DELETE FROM customer_order_items WHERE order_id = ?`, [id]);

    // Validate finished products are active
    const prodIds = items.map(it => parseInt(it.finishedProductId, 10)).filter(id => !isNaN(id));
    if (prodIds.length > 0) {
      const [inactiveProds] = await connection.query(
        `SELECT name FROM finished_products WHERE id IN (?) AND status = 0`,
        [prodIds]
      );
      if (inactiveProds.length > 0) {
        const names = inactiveProds.map(p => p.name).join(', ');
        throw new Error(`The following products are disabled in Product Master: ${names}. You cannot place an order for them.`);
      }
    }

    // 3. Re-insert items
    for (const item of items) {
      const { finishedProductId, quantity, rate } = item;
      const q = parseInt(quantity, 10);
      const r = parseFloat(rate) || 0.00;
      
      if (!finishedProductId) throw new Error('Product is invalid.');
      if (isNaN(q) || q <= 0) throw new Error('Product quantity must be greater than 0.');

      const amt = q * r;

      await connection.query(
        `INSERT INTO customer_order_items (order_id, finished_product_id, quantity, rate, amount)
         VALUES (?, ?, ?, ?, ?)`,
        [id, parseInt(finishedProductId, 10), q, r, amt]
      );
    }

    await connection.commit();
    res.json({
      ok: true,
      message: 'Order updated successfully!'
    });
  } catch (error) {
    await connection.rollback();
    console.error('Update order error:', error);
    res.status(400).json({ ok: false, error: error.message });
  } finally {
    connection.release();
  }
});

// POST /api/orders/:id/supply - Mark order as supplied (delivered)
router.post('/:id/supply', async (req, res) => {
  try {
    const { id } = req.params;
    const suppliedBy = req.admin?.name || req.admin?.username || 'Admin';

    // Verify current status
    const [existing] = await pool.query(
      `SELECT status FROM customer_orders WHERE id = ?`,
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ ok: false, error: 'Order not found.' });
    }
    if (existing[0].status !== 'PENDING') {
      return res.status(400).json({ ok: false, error: 'Order is not in PENDING state.' });
    }

    await pool.query(
      `UPDATE customer_orders SET 
        status = 'SUPPLIED', supplied_by = ?, supplied_at = NOW() 
       WHERE id = ?`,
      [suppliedBy, id]
    );

    res.json({
      ok: true,
      message: 'Order marked as Supplied successfully.'
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// POST /api/orders/:id/cancel - Mark order as cancelled
router.post('/:id/cancel', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const cancelledBy = req.admin?.name || req.admin?.username || 'Admin';

    if (!reason || !reason.trim()) {
      return res.status(400).json({ ok: false, error: 'Cancellation reason is required.' });
    }

    // Verify current status
    const [existing] = await pool.query(
      `SELECT status FROM customer_orders WHERE id = ?`,
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ ok: false, error: 'Order not found.' });
    }
    if (existing[0].status !== 'PENDING') {
      return res.status(400).json({ ok: false, error: 'Only pending orders can be cancelled.' });
    }

    await pool.query(
      `UPDATE customer_orders SET 
        status = 'CANCELLED', cancelled_by = ?, cancelled_at = NOW(), cancellation_reason = ? 
       WHERE id = ?`,
      [cancelledBy, reason.trim(), id]
    );

    res.json({
      ok: true,
      message: 'Order cancelled successfully.'
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

export default router;
