import express from 'express';
import pool from '../config/db.js';

const router = express.Router();

// Auto-initialize weight_measurements table if not exists
const initTable = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS weight_measurements (
        id VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci PRIMARY KEY,
        measurement_date DATE NOT NULL,
        measurement_time TIME NULL,
        product_name VARCHAR(255) NOT NULL,
        weight_in DECIMAL(12, 3) NOT NULL DEFAULT 0.000,
        weight_out DECIMAL(12, 3) NOT NULL DEFAULT 0.000,
        difference_val DECIMAL(12, 3) NOT NULL DEFAULT 0.000,
        reading_val VARCHAR(255) NULL,
        per_kg_reading DECIMAL(12, 4) NOT NULL DEFAULT 0.0000,
        unit VARCHAR(20) NOT NULL DEFAULT 'kg',
        notes TEXT NULL,
        created_by VARCHAR(100) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_wm_date (measurement_date),
        INDEX idx_wm_product (product_name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Ensure per_kg_reading column exists
    try {
      await pool.query(`ALTER TABLE weight_measurements ADD COLUMN per_kg_reading DECIMAL(12, 4) NOT NULL DEFAULT 0.0000 AFTER reading_val`);
    } catch (e) {
      // column already exists
    }
  } catch (err) {
    console.error('Failed to initialize weight_measurements table:', err);
  }
};
initTable();

// Helper to get current IST date and time strings
function getISTDateAndTime() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const istDate = new Date(now.getTime() + (330 + offset) * 60000);
  
  const yyyy = istDate.getFullYear();
  const mm = String(istDate.getMonth() + 1).padStart(2, '0');
  const dd = String(istDate.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}-${mm}-${dd}`;

  const hh = String(istDate.getHours()).padStart(2, '0');
  const mi = String(istDate.getMinutes()).padStart(2, '0');
  const ss = String(istDate.getSeconds()).padStart(2, '0');
  const timeStr = `${hh}:${mi}:${ss}`;

  return { dateStr, timeStr, yyyy };
}

// Helper to generate sequential ID: WM-YYYY-00001
async function generateId(prefix, table, idColumn) {
  const { yyyy } = getISTDateAndTime();
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

// GET /api/weight-measurement - List records with filtering, search, and pagination
router.get('/', async (req, res) => {
  try {
    const {
      startDate = '',
      endDate = '',
      date = '',
      search = '',
      page = 1,
      limit = 20
    } = req.query;

    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.max(1, parseInt(limit, 10) || 20);
    const offset = (parsedPage - 1) * parsedLimit;

    const whereClauses = [];
    const queryParams = [];

    if (date) {
      whereClauses.push('measurement_date = ?');
      queryParams.push(date);
    } else {
      if (startDate) {
        whereClauses.push('measurement_date >= ?');
        queryParams.push(startDate);
      }
      if (endDate) {
        whereClauses.push('measurement_date <= ?');
        queryParams.push(endDate);
      }
    }

    if (search.trim()) {
      whereClauses.push('(product_name LIKE ? OR reading_val LIKE ? OR id LIKE ? OR notes LIKE ?)');
      const wild = `%${search.trim()}%`;
      queryParams.push(wild, wild, wild, wild);
    }

    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Summary calculation for matching records
    const [summaryRows] = await pool.query(
      `SELECT 
         COUNT(*) AS totalCount,
         COALESCE(SUM(weight_in), 0.000) AS totalWeightIn,
         COALESCE(SUM(weight_out), 0.000) AS totalWeightOut,
         COALESCE(SUM(difference_val), 0.000) AS totalDifference
       FROM weight_measurements
       ${whereStr}`,
      queryParams
    );

    const summary = summaryRows[0] || {
      totalCount: 0,
      totalWeightIn: 0,
      totalWeightOut: 0,
      totalDifference: 0
    };

    const totalCount = parseInt(summary.totalCount || 0, 10);

    // Fetch paged rows
    const [rows] = await pool.query(
      `SELECT 
         id,
         DATE_FORMAT(measurement_date, '%Y-%m-%d') AS measurement_date,
         TIME_FORMAT(measurement_time, '%H:%i:%s') AS measurement_time,
         product_name,
         weight_in,
         weight_out,
         difference_val,
         reading_val,
         per_kg_reading,
         unit,
         notes,
         created_by,
         created_at,
         updated_at
       FROM weight_measurements
       ${whereStr}
       ORDER BY measurement_date DESC, measurement_time DESC, id DESC
       LIMIT ? OFFSET ?`,
      [...queryParams, parsedLimit, offset]
    );

    res.json({
      ok: true,
      records: rows.map(r => ({
        ...r,
        weight_in: parseFloat(r.weight_in || 0),
        weight_out: parseFloat(r.weight_out || 0),
        difference_val: parseFloat(r.difference_val || 0),
        per_kg_reading: parseFloat(r.per_kg_reading || 0)
      })),
      total: totalCount,
      totalPages: Math.ceil(totalCount / parsedLimit) || 1,
      page: parsedPage,
      limit: parsedLimit,
      summary: {
        totalCount,
        totalWeightIn: parseFloat(summary.totalWeightIn || 0),
        totalWeightOut: parseFloat(summary.totalWeightOut || 0),
        totalDifference: parseFloat(summary.totalDifference || 0)
      }
    });
  } catch (error) {
    console.error('Fetch weight measurements error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// GET /api/weight-measurement/summary - Overall and today KPI metrics
router.get('/summary', async (req, res) => {
  try {
    const { dateStr } = getISTDateAndTime();

    // Today metrics
    const [todayRows] = await pool.query(
      `SELECT 
         COUNT(*) AS count,
         COALESCE(SUM(weight_in), 0.000) AS totalIn,
         COALESCE(SUM(weight_out), 0.000) AS totalOut,
         COALESCE(SUM(difference_val), 0.000) AS totalDiff
       FROM weight_measurements
       WHERE measurement_date = ?`,
      [dateStr]
    );

    // All-time metrics
    const [allTimeRows] = await pool.query(
      `SELECT 
         COUNT(*) AS count,
         COALESCE(SUM(weight_in), 0.000) AS totalIn,
         COALESCE(SUM(weight_out), 0.000) AS totalOut,
         COALESCE(SUM(difference_val), 0.000) AS totalDiff,
         COUNT(DISTINCT product_name) AS uniqueProducts
       FROM weight_measurements`
    );

    res.json({
      ok: true,
      today: {
        date: dateStr,
        count: parseInt(todayRows[0]?.count || 0, 10),
        totalIn: parseFloat(todayRows[0]?.totalIn || 0),
        totalOut: parseFloat(todayRows[0]?.totalOut || 0),
        totalDiff: parseFloat(todayRows[0]?.totalDiff || 0)
      },
      allTime: {
        count: parseInt(allTimeRows[0]?.count || 0, 10),
        totalIn: parseFloat(allTimeRows[0]?.totalIn || 0),
        totalOut: parseFloat(allTimeRows[0]?.totalOut || 0),
        totalDiff: parseFloat(allTimeRows[0]?.totalDiff || 0),
        uniqueProducts: parseInt(allTimeRows[0]?.uniqueProducts || 0, 10)
      }
    });
  } catch (error) {
    console.error('Fetch weight measurements summary error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// GET /api/weight-measurement/product-suggestions - Recent distinct product names for autocomplete
router.get('/product-suggestions', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT product_name, COUNT(*) as usage_count 
       FROM weight_measurements 
       GROUP BY product_name 
       ORDER BY usage_count DESC, product_name ASC 
       LIMIT 50`
    );
    res.json({
      ok: true,
      products: rows.map(r => r.product_name)
    });
  } catch (error) {
    console.error('Fetch product suggestions error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// GET /api/weight-measurement/:id - Get single record
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      `SELECT 
         id,
         DATE_FORMAT(measurement_date, '%Y-%m-%d') AS measurement_date,
         TIME_FORMAT(measurement_time, '%H:%i:%s') AS measurement_time,
         product_name,
         weight_in,
         weight_out,
         difference_val,
         reading_val,
         per_kg_reading,
         unit,
         notes,
         created_by,
         created_at,
         updated_at
       FROM weight_measurements
       WHERE id = ? LIMIT 1`,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ ok: false, error: 'Weight measurement record not found.' });
    }

    const r = rows[0];
    res.json({
      ok: true,
      record: {
        ...r,
        weight_in: parseFloat(r.weight_in || 0),
        weight_out: parseFloat(r.weight_out || 0),
        difference_val: parseFloat(r.difference_val || 0),
        per_kg_reading: parseFloat(r.per_kg_reading || 0)
      }
    });
  } catch (error) {
    console.error('Fetch single record error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// POST /api/weight-measurement - Create new measurement record
router.post('/', async (req, res) => {
  try {
    const {
      productName,
      measurementDate,
      measurementTime,
      weightIn = 0,
      weightOut = 0,
      reading,
      unit = 'kg',
      notes
    } = req.body;

    if (!productName || !productName.trim()) {
      return res.status(400).json({ ok: false, error: 'Product Name is required.' });
    }

    const parsedWeightIn = parseFloat(weightIn) || 0;
    const parsedWeightOut = parseFloat(weightOut) || 0;
    const difference = parsedWeightIn - parsedWeightOut;

    // Calculate per_kg_reading = reading / difference
    const parsedReading = parseFloat(reading);
    let perKgReading = 0;
    if (!isNaN(parsedReading) && Math.abs(difference) > 0.0001) {
      perKgReading = parsedReading / difference;
    }

    const { dateStr, timeStr } = getISTDateAndTime();
    const finalDate = measurementDate || dateStr;
    const finalTime = measurementTime || timeStr;
    const createdBy = req.admin?.name || req.admin?.username || 'Admin';

    const recordId = await generateId('WM', 'weight_measurements', 'id');

    await pool.query(
      `INSERT INTO weight_measurements 
       (id, measurement_date, measurement_time, product_name, weight_in, weight_out, difference_val, reading_val, per_kg_reading, unit, notes, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        recordId,
        finalDate,
        finalTime,
        productName.trim(),
        parsedWeightIn,
        parsedWeightOut,
        difference,
        reading !== undefined && reading !== null ? String(reading).trim() : null,
        perKgReading,
        unit || 'kg',
        notes ? String(notes).trim() : null,
        createdBy
      ]
    );

    res.json({
      ok: true,
      id: recordId,
      message: 'Weight measurement recorded successfully!'
    });
  } catch (error) {
    console.error('Create weight measurement error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// PUT /api/weight-measurement/:id - Update measurement record
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      productName,
      measurementDate,
      measurementTime,
      weightIn = 0,
      weightOut = 0,
      reading,
      unit = 'kg',
      notes
    } = req.body;

    if (!productName || !productName.trim()) {
      return res.status(400).json({ ok: false, error: 'Product Name is required.' });
    }

    const parsedWeightIn = parseFloat(weightIn) || 0;
    const parsedWeightOut = parseFloat(weightOut) || 0;
    const difference = parsedWeightIn - parsedWeightOut;

    // Calculate per_kg_reading = reading / difference
    const parsedReading = parseFloat(reading);
    let perKgReading = 0;
    if (!isNaN(parsedReading) && Math.abs(difference) > 0.0001) {
      perKgReading = parsedReading / difference;
    }

    const [existing] = await pool.query('SELECT id FROM weight_measurements WHERE id = ?', [id]);
    if (!existing.length) {
      return res.status(404).json({ ok: false, error: 'Record not found.' });
    }

    await pool.query(
      `UPDATE weight_measurements 
       SET measurement_date = ?,
           measurement_time = ?,
           product_name = ?,
           weight_in = ?,
           weight_out = ?,
           difference_val = ?,
           reading_val = ?,
           per_kg_reading = ?,
           unit = ?,
           notes = ?
       WHERE id = ?`,
      [
        measurementDate,
        measurementTime,
        productName.trim(),
        parsedWeightIn,
        parsedWeightOut,
        difference,
        reading !== undefined && reading !== null ? String(reading).trim() : null,
        perKgReading,
        unit || 'kg',
        notes ? String(notes).trim() : null,
        id
      ]
    );

    res.json({
      ok: true,
      message: 'Weight measurement updated successfully!'
    });
  } catch (error) {
    console.error('Update weight measurement error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// DELETE /api/weight-measurement/:id - Delete measurement record
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await pool.query('DELETE FROM weight_measurements WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ ok: false, error: 'Record not found.' });
    }

    res.json({
      ok: true,
      message: 'Weight measurement deleted successfully!'
    });
  } catch (error) {
    console.error('Delete weight measurement error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
