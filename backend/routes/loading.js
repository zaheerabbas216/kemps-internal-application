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

function getTodayISTDateStr() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const istDate = new Date(now.getTime() + (330 + offset) * 60000);
  const yyyy = istDate.getFullYear();
  const mm = String(istDate.getMonth() + 1).padStart(2, '0');
  const dd = String(istDate.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// POST /api/loading - Record a new loading trip for a customer
router.post('/', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const {
      customerPhone,
      customerName,
      customerGstin = '',
      customerAddress = '',
      godown, // 'KI' or 'KP'
      remarks = '',
      items = [] // Array of { finishedProductId, quantity, returnQty }
    } = req.body;

    if (!godown) throw new Error('Godown is required.');
    if (!['KI', 'KP'].includes(godown)) throw new Error('Invalid godown selected.');
    if (!customerPhone) throw new Error('Customer Phone is required.');
    if (!customerName || !String(customerName).trim()) throw new Error('Customer Name is required.');
    if (items.length === 0) throw new Error('At least one product line is required.');

    const cleanPhone = normalizePhone10(customerPhone);
    const cleanName = String(customerName).trim();
    const cleanGst = String(customerGstin).trim();
    const cleanAddress = String(customerAddress).trim();
    const todayStr = getTodayISTDateStr();

    // 1. Resolve or Create Customer
    let customerId = null;
    const [existingCust] = await connection.query(
      `SELECT id FROM customers WHERE phone = ?`,
      [cleanPhone]
    );

    if (existingCust.length > 0) {
      customerId = existingCust[0].id;
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

    // 2. Find or Create Active Loading Session for this customer + date (irrespective of godown)
    let sessionId = null;
    const [existingSession] = await connection.query(
      `SELECT id, status FROM loading_sessions 
       WHERE customer_id = ? AND loading_date = ? AND status = 'ACTIVE'`,
      [customerId, todayStr]
    );

    if (existingSession.length > 0) {
      sessionId = existingSession[0].id;
      // Update remarks if provided
      if (remarks) {
        await connection.query(
          `UPDATE loading_sessions SET remarks = ? WHERE id = ?`,
          [remarks, sessionId]
        );
      }
    } else {
      sessionId = await generateId('LOAD', 'loading_sessions', 'id', connection);
      await connection.query(
        `INSERT INTO loading_sessions (id, customer_id, loading_date, status, remarks, created_at)
         VALUES (?, ?, ?, 'ACTIVE', ?, NOW())`,
        [sessionId, customerId, todayStr, remarks]
      );
    }

    // 3. Create a Trip with the specific godown
    const tripId = await generateId('TRIP', 'loading_trips', 'id', connection);
    
    // Find next trip number
    const [tripCount] = await connection.query(
      `SELECT COUNT(*) as count FROM loading_trips WHERE session_id = ?`,
      [sessionId]
    );
    const tripNumber = tripCount[0].count + 1;

    await connection.query(
      `INSERT INTO loading_trips (id, session_id, trip_number, godown, remarks, created_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [tripId, sessionId, tripNumber, godown, remarks]
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
        throw new Error(`The following products are disabled in Product Master: ${names}. You cannot load them.`);
      }
    }

    // 4. Insert Trip Items
    for (const item of items) {
      const { finishedProductId, quantity, returnQty } = item;
      const q = parseInt(quantity, 10) || 0;
      const r = parseInt(returnQty, 10) || 0;

      if (!finishedProductId) throw new Error('Product is invalid.');
      if (q < 0 || r < 0) throw new Error('Quantity cannot be negative.');
      if (q === 0 && r === 0) continue; // Skip empty rows

      await connection.query(
        `INSERT INTO loading_trip_items (trip_id, finished_product_id, quantity, return_qty, created_at)
         VALUES (?, ?, ?, ?, NOW())`,
        [tripId, parseInt(finishedProductId, 10), q, r]
      );
    }

    await connection.commit();
    res.json({
      ok: true,
      message: 'Loading logged successfully!',
      sessionId,
      tripId,
      tripNumber
    });
  } catch (error) {
    await connection.rollback();
    console.error('Create loading error:', error);
    res.status(400).json({ ok: false, error: error.message });
  } finally {
    connection.release();
  }
});

// GET /api/loading/active - Get all active/pending loading profiles for today
router.get('/active', async (req, res) => {
  try {
    const todayStr = getTodayISTDateStr();

    // Query active sessions for today
    const [sessions] = await pool.query(
      `SELECT 
         ls.id,
         ls.customer_id,
         c.name AS customer_name,
         c.phone AS customer_phone,
         c.gstin AS customer_gstin,
         c.address AS customer_address,
         DATE_FORMAT(ls.loading_date, '%Y-%m-%d') as loading_date,
         ls.status,
         ls.remarks,
         ls.created_at
       FROM loading_sessions ls
       JOIN customers c ON ls.customer_id = c.id
       WHERE ls.loading_date = ? AND ls.status = 'ACTIVE'
       ORDER BY ls.created_at DESC`,
      [todayStr]
    );

    // Get aggregated items and godowns for each active session
    const sessionsWithItems = [];
    for (const session of sessions) {
      const [items] = await pool.query(
        `SELECT 
           lti.finished_product_id AS finishedProductId,
           fp.name AS productName,
           COALESCE(SUM(lti.quantity), 0) AS quantity,
           COALESCE(SUM(lti.return_qty), 0) AS returnQty,
           (COALESCE(SUM(lti.quantity), 0) - COALESCE(SUM(lti.return_qty), 0)) AS netLoadingQty
         FROM loading_trips lt
         JOIN loading_trip_items lti ON lt.id = lti.trip_id
         JOIN finished_products fp ON lti.finished_product_id = fp.id
         WHERE lt.session_id = ?
         GROUP BY lti.finished_product_id, fp.name`,
        [session.id]
      );

      const [godownsRows] = await pool.query(
        `SELECT DISTINCT godown FROM loading_trips WHERE session_id = ?`,
        [session.id]
      );
      const godowns = godownsRows.map(r => r.godown);

      sessionsWithItems.push({
        ...session,
        items,
        godowns
      });
    }

    res.json({
      ok: true,
      sessions: sessionsWithItems
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// GET /api/loading/history - Retrieve list of past loading sessions with pagination/filters
router.get('/history', async (req, res) => {
  try {
    let { page = 1, limit = 10, search = '', startDate = '', endDate = '', godown = '' } = req.query;
    page = parseInt(page, 10);
    limit = parseInt(limit, 10);
    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1) limit = 10;

    const offset = (page - 1) * limit;
    let queryParams = [];
    let whereClauses = [];

    if (startDate) {
      whereClauses.push('ls.loading_date >= ?');
      queryParams.push(startDate);
    }
    if (endDate) {
      whereClauses.push('ls.loading_date <= ?');
      queryParams.push(endDate);
    }
    if (godown) {
      whereClauses.push('EXISTS (SELECT 1 FROM loading_trips lt WHERE lt.session_id = ls.id AND lt.godown = ?)');
      queryParams.push(godown);
    }
    if (search.trim()) {
      whereClauses.push('(c.name LIKE ? OR c.phone LIKE ? OR ls.id LIKE ?)');
      const wild = `%${search.trim()}%`;
      queryParams.push(wild, wild, wild);
    }

    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Get total count
    const [countRows] = await pool.query(
      `SELECT COUNT(*) as count 
       FROM loading_sessions ls 
       JOIN customers c ON ls.customer_id = c.id
       ${whereStr}`,
      queryParams
    );
    const total = countRows[0].count;

    // Get sessions
    let selectParams = [...queryParams, limit, offset];
    const [rows] = await pool.query(
      `SELECT 
         ls.id,
         ls.customer_id,
         c.name AS customer_name,
         c.phone AS customer_phone,
         DATE_FORMAT(ls.loading_date, '%Y-%m-%d') as loading_date,
         ls.status,
         ls.remarks,
         ls.bill_id,
         ls.created_at
       FROM loading_sessions ls
       JOIN customers c ON ls.customer_id = c.id
       ${whereStr}
       ORDER BY ls.loading_date DESC, ls.created_at DESC
       LIMIT ? OFFSET ?`,
      selectParams
    );

    // Get consolidated products summary and trip count/godowns for each session
    const sessionsWithStats = [];
    for (const session of rows) {
      const [tripCountRows] = await pool.query(
        `SELECT COUNT(*) as count FROM loading_trips WHERE session_id = ?`,
        [session.id]
      );
      const tripCount = tripCountRows[0].count;

      const [items] = await pool.query(
        `SELECT 
           fp.name AS productName,
           COALESCE(SUM(lti.quantity), 0) AS quantity,
           COALESCE(SUM(lti.return_qty), 0) AS returnQty,
           (COALESCE(SUM(lti.quantity), 0) - COALESCE(SUM(lti.return_qty), 0)) AS netLoadingQty
         FROM loading_trips lt
         JOIN loading_trip_items lti ON lt.id = lti.trip_id
         JOIN finished_products fp ON lti.finished_product_id = fp.id
         WHERE lt.session_id = ?
         GROUP BY lti.finished_product_id, fp.name`,
        [session.id]
      );

      const [godownsRows] = await pool.query(
        `SELECT DISTINCT godown FROM loading_trips WHERE session_id = ?`,
        [session.id]
      );
      const godowns = godownsRows.map(r => r.godown);

      sessionsWithStats.push({
        ...session,
        tripCount,
        items,
        godowns
      });
    }

    res.json({
      ok: true,
      sessions: sessionsWithStats,
      total,
      page,
      limit
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// GET /api/loading/session/:id - Get detailed profile of a single loading session
router.get('/session/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch session details
    const [sessionRows] = await pool.query(
      `SELECT 
         ls.id,
         ls.customer_id,
         c.name AS customer_name,
         c.phone AS customer_phone,
         c.gstin AS customer_gstin,
         c.address AS customer_address,
         DATE_FORMAT(ls.loading_date, '%Y-%m-%d') as loading_date,
         ls.status,
         ls.remarks,
         ls.bill_id,
         ls.created_at
       FROM loading_sessions ls
       JOIN customers c ON ls.customer_id = c.id
       WHERE ls.id = ?`,
      [id]
    );

    if (sessionRows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Loading session not found.' });
    }

    const session = sessionRows[0];

    // Fetch consolidated items
    const [consolidatedItems] = await pool.query(
      `SELECT 
         lti.finished_product_id AS finishedProductId,
         fp.name AS productName,
         COALESCE(SUM(lti.quantity), 0) AS quantity,
         COALESCE(SUM(lti.return_qty), 0) AS returnQty,
         (COALESCE(SUM(lti.quantity), 0) - COALESCE(SUM(lti.return_qty), 0)) AS netLoadingQty
       FROM loading_trips lt
       JOIN loading_trip_items lti ON lt.id = lti.trip_id
       JOIN finished_products fp ON lti.finished_product_id = fp.id
       WHERE lt.session_id = ?
       GROUP BY lti.finished_product_id, fp.name`,
      [id]
    );

    // Fetch individual trips
    const [trips] = await pool.query(
      `SELECT 
         id,
         trip_number as tripNumber,
         godown,
         remarks,
         created_at
       FROM loading_trips
       WHERE session_id = ?
       ORDER BY trip_number ASC`,
      [id]
    );

    // Fetch details for each trip
    const tripsWithItems = [];
    for (const trip of trips) {
      const [tripItems] = await pool.query(
        `SELECT 
           lti.id,
           lti.finished_product_id AS finishedProductId,
           fp.name AS productName,
           lti.quantity,
           lti.return_qty AS returnQty,
           (lti.quantity - lti.return_qty) AS netLoadingQty
         FROM loading_trip_items lti
         JOIN finished_products fp ON lti.finished_product_id = fp.id
         WHERE lti.trip_id = ?`,
        [trip.id]
      );
      tripsWithItems.push({
        ...trip,
        items: tripItems
      });
    }

    // Fetch active returns history for this session (Audit Trail)
    const [returns] = await pool.query(
      `SELECT 
         lr.id,
         lr.finished_product_id AS finishedProductId,
         fp.name AS productName,
         lr.quantity,
         lr.reason,
         lr.user_name AS userName,
         lr.created_at AS createdAt
       FROM loading_returns lr
       JOIN finished_products fp ON lr.finished_product_id = fp.id
       WHERE lr.session_id = ?
       ORDER BY lr.created_at DESC`,
      [id]
    );

    res.json({
      ok: true,
      session,
      consolidatedItems,
      trips: tripsWithItems,
      returns
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// GET /api/loading/trip/:tripId - Get single trip detail (specifically for print layout)
router.get('/trip/:tripId', async (req, res) => {
  try {
    const { tripId } = req.params;

    // Fetch trip details
    const [tripRows] = await pool.query(
      `SELECT 
         lt.id,
         lt.session_id,
         lt.trip_number,
         lt.godown,
         lt.remarks,
         lt.created_at,
         DATE_FORMAT(ls.loading_date, '%Y-%m-%d') as loading_date,
         c.name AS customer_name,
         c.phone AS customer_phone
       FROM loading_trips lt
       JOIN loading_sessions ls ON lt.session_id = ls.id
       JOIN customers c ON ls.customer_id = c.id
       WHERE lt.id = ?`,
      [tripId]
    );

    if (tripRows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Loading trip not found.' });
    }

    const trip = tripRows[0];

    // Fetch trip items
    const [items] = await pool.query(
      `SELECT 
         lti.id,
         lti.finished_product_id AS finishedProductId,
         fp.name AS productName,
         lti.quantity,
         lti.return_qty AS returnQty,
         (lti.quantity - lti.return_qty) AS netLoadingQty
       FROM loading_trip_items lti
       JOIN finished_products fp ON lti.finished_product_id = fp.id
       WHERE lti.trip_id = ?`,
      [tripId]
    );

    res.json({
      ok: true,
      trip,
      items
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// POST /api/loading/session/:id/remarks - Update remarks of a loading session
router.post('/session/:id/remarks', async (req, res) => {
  try {
    const { id } = req.params;
    const { remarks } = req.body;

    await pool.query(
      'UPDATE loading_sessions SET remarks = ? WHERE id = ?',
      [remarks || '', id]
    );

    res.json({ ok: true, message: 'Remarks updated successfully.' });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// POST /api/loading/session/:id/return - Record an active loading return
router.post('/session/:id/return', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { finishedProductId, quantity, reason } = req.body;
    const userName = req.admin?.name || req.admin?.username || 'Admin';

    if (!finishedProductId) throw new Error('Product is required.');
    const q = parseInt(quantity, 10);
    if (isNaN(q) || q <= 0) throw new Error('Return quantity must be greater than 0.');
    if (!reason || !reason.trim()) throw new Error('Reason is required.');

    // 1. Fetch the loading session and verify it is ACTIVE
    const [sessionRows] = await connection.query(
      `SELECT status FROM loading_sessions WHERE id = ?`,
      [id]
    );
    if (sessionRows.length === 0) {
      throw new Error('Loading session not found.');
    }
    if (sessionRows[0].status !== 'ACTIVE') {
      throw new Error('Cannot log return for a session that is already billed or completed.');
    }

    // 2. Fetch the product details and verify it's loaded in this session
    const [loadedStats] = await connection.query(
      `SELECT 
         COALESCE(SUM(lti.quantity), 0) AS total_loaded,
         COALESCE(SUM(lti.return_qty), 0) AS total_returned
       FROM loading_trips lt
       JOIN loading_trip_items lti ON lt.id = lti.trip_id
       WHERE lt.session_id = ? AND lti.finished_product_id = ?`,
      [id, parseInt(finishedProductId, 10)]
    );

    const totalLoaded = parseInt(loadedStats[0]?.total_loaded, 10) || 0;
    const totalReturned = parseInt(loadedStats[0]?.total_returned, 10) || 0;
    const availableToReturn = totalLoaded - totalReturned;

    if (totalLoaded === 0) {
      throw new Error('This product is not loaded in this session.');
    }
    if (q > availableToReturn) {
      throw new Error(`Return quantity (${q}) exceeds the available loaded quantity (${availableToReturn}).`);
    }

    // 3. Find the last trip in the session to copy godown information
    const [lastTripRows] = await connection.query(
      `SELECT godown FROM loading_trips WHERE session_id = ? ORDER BY trip_number DESC LIMIT 1`,
      [id]
    );
    const godown = lastTripRows.length > 0 ? lastTripRows[0].godown : 'KI';

    // 4. Record return transaction in loading_returns for audit trail
    await connection.query(
      `INSERT INTO loading_returns (session_id, finished_product_id, quantity, reason, user_name, created_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [id, parseInt(finishedProductId, 10), q, reason.trim(), userName]
    );

    // 5. Create a return trip in loading_trips
    const tripId = await generateId('TRIP', 'loading_trips', 'id', connection);
    const [tripCount] = await connection.query(
      `SELECT COUNT(*) as count FROM loading_trips WHERE session_id = ?`,
      [id]
    );
    const tripNumber = tripCount[0].count + 1;

    await connection.query(
      `INSERT INTO loading_trips (id, session_id, trip_number, godown, remarks, created_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [tripId, id, tripNumber, godown, `Active Return: ${reason.trim()}`]
    );

    // 6. Insert trip item in loading_trip_items with quantity = -q and return_qty = 0
    await connection.query(
      `INSERT INTO loading_trip_items (trip_id, finished_product_id, quantity, return_qty, created_at)
       VALUES (?, ?, ?, 0, NOW())`,
      [tripId, parseInt(finishedProductId, 10), -q]
    );

    await connection.commit();
    res.json({
      ok: true,
      message: 'Active return recorded successfully.',
      tripId,
      tripNumber
    });
  } catch (error) {
    await connection.rollback();
    console.error('Active return logging error:', error);
    res.status(400).json({ ok: false, error: error.message });
  } finally {
    connection.release();
  }
});

// GET /api/loading/session/:id/returns - Fetch returns history audit trail for a session
router.get('/session/:id/returns', async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      `SELECT 
         lr.id,
         lr.finished_product_id AS finishedProductId,
         fp.name AS productName,
         lr.quantity,
         lr.reason,
         lr.user_name AS userName,
         lr.created_at AS createdAt
       FROM loading_returns lr
       JOIN finished_products fp ON lr.finished_product_id = fp.id
       WHERE lr.session_id = ?
       ORDER BY lr.created_at DESC`,
      [id]
    );
    res.json({ ok: true, returns: rows });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

export default router;
