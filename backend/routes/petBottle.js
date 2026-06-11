import express from 'express';
import pool from '../config/db.js';

const router = express.Router();

// Helper to generate custom sequence ID
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

// GET /api/pet-bottle/today - Retrieve today's production batches and aggregates
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
         COALESCE(SUM(bags_used), 0) as totalBagsUsed,
         COALESCE(SUM(actual_reading), 0) as totalActualReading,
         COALESCE(SUM(wastage), 0) as totalWastage,
         COUNT(*) as totalCount 
       FROM pet_bottle_batches 
       WHERE batch_date = ?`,
      [todayStr]
    );

    const summary = {
      totalBagsUsed: parseFloat(summaryRows[0].totalBagsUsed),
      totalActualReading: parseFloat(summaryRows[0].totalActualReading),
      totalWastage: parseFloat(summaryRows[0].totalWastage),
      totalCount: parseInt(summaryRows[0].totalCount, 10)
    };

    let queryParams = [todayStr];
    let whereClause = 'WHERE pb.batch_date = ?';

    if (search.trim()) {
      whereClause += ' AND (fp.name LIKE ? OR rm.sub_product_name LIKE ? OR pb.notes LIKE ?)';
      const wildSearch = `%${search.trim()}%`;
      queryParams.push(wildSearch, wildSearch, wildSearch);
    }

    const [rows] = await pool.query(
      `SELECT 
         pb.id,
         DATE_FORMAT(pb.batch_date, '%Y-%m-%d') as batch_date,
         pb.finished_product_id,
         fp.name AS product_name,
         pb.raw_material_id,
         rm.sub_product_name AS preform_name,
         pb.bags_used,
         pb.actual_reading,
         pb.expected_reading,
         pb.difference_val,
         pb.bottle_bags,
         pb.wastage,
         pb.start_time,
         pb.stop_time,
         pb.notes,
         pb.created_at
       FROM pet_bottle_batches pb
       JOIN finished_products fp ON pb.finished_product_id = fp.id
       JOIN raw_materials rm ON pb.raw_material_id = rm.id
       ${whereClause} 
       ORDER BY pb.created_at DESC`,
      queryParams
    );

    res.json({
      ok: true,
      batches: rows,
      todayStr,
      summary
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// POST /api/pet-bottle - Record production batch (Transaction Safe)
router.post('/', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const {
      batchDate,
      productId,
      rawMaterialId,
      bagsUsed,
      actualReading,
      bottleBags = 0,
      wastage = 0,
      startTime = '',
      stopTime = '',
      notes = ''
    } = req.body;

    // Validation
    if (!batchDate) throw new Error('Batch Date is required.');
    if (!productId) throw new Error('Product is required.');
    if (!rawMaterialId) throw new Error('Preform is required.');
    
    const parsedBagsUsed = parseFloat(bagsUsed);
    if (isNaN(parsedBagsUsed) || parsedBagsUsed <= 0) {
      throw new Error('Bags Used must be greater than 0.');
    }

    const parsedActual = parseFloat(actualReading);
    if (isNaN(parsedActual) || parsedActual < 0) {
      throw new Error('Actual Reading cannot be negative.');
    }

    // Retrieve preform weight to calculate expected reading on backend
    const [materialRows] = await connection.query(
      `SELECT sub_product_name FROM raw_materials WHERE id = ?`,
      [rawMaterialId]
    );
    if (materialRows.length === 0) throw new Error('Selected Preform raw material not found.');
    const weight = parseFloat(materialRows[0].sub_product_name) || 0;
    if (weight <= 0) throw new Error('Invalid Preform weight in product master.');

    const expectedReading = Math.round((1000 / weight) * 25 * parsedBagsUsed);
    const difference = expectedReading - parsedActual;

    if (difference < 0) {
      throw new Error(`Actual Reading (${parsedActual}) cannot exceed Expected Reading (${expectedReading}). Difference cannot be negative.`);
    }

    // Generate Batch ID
    const batchId = await generateId('BATCH', 'pet_bottle_batches', 'id');

    // 1. Insert into pet_bottle_batches
    await connection.query(
      `INSERT INTO pet_bottle_batches 
       (id, batch_date, finished_product_id, raw_material_id, bags_used, actual_reading, expected_reading, difference_val, bottle_bags, wastage, start_time, stop_time, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        batchId,
        batchDate,
        productId,
        rawMaterialId,
        parsedBagsUsed,
        parsedActual,
        expectedReading,
        difference,
        parseInt(bottleBags, 10) || 0,
        parseFloat(wastage) || 0,
        startTime || '',
        stopTime || '',
        notes
      ]
    );

    // 2. Log consumed preforms to stock register (Negative addition)
    const consumedWeightKg = parsedBagsUsed * 25;
    await connection.query(
      `INSERT INTO stock_register (item_type, item_id, transaction_type, reference_id, quantity, created_at)
       VALUES ('RAW_MATERIAL', ?, 'PRODUCTION', ?, ?, NOW())`,
      [rawMaterialId, batchId, -consumedWeightKg]
    );

    // 3. Log produced finished bottles to stock register (Positive addition)
    await connection.query(
      `INSERT INTO stock_register (item_type, item_id, transaction_type, reference_id, quantity, created_at)
       VALUES ('FINISHED_PRODUCT', ?, 'PRODUCTION', ?, ?, NOW())`,
      [productId, batchId, parsedActual]
    );

    await connection.commit();
    res.json({ ok: true, id: batchId, message: 'Production batch logged successfully!' });
  } catch (error) {
    await connection.rollback();
    console.error('Save production batch error:', error);
    res.status(400).json({ ok: false, error: error.message });
  } finally {
    connection.release();
  }
});

// GET /api/pet-bottle - Retrieve production batch list (History)
router.get('/', async (req, res) => {
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
      whereClauses.push('pb.batch_date >= ?');
      queryParams.push(startDate);
    }
    if (endDate) {
      whereClauses.push('pb.batch_date <= ?');
      queryParams.push(endDate);
    }

    if (search.trim()) {
      whereClauses.push('(fp.name LIKE ? OR rm.sub_product_name LIKE ? OR pb.notes LIKE ?)');
      const wild = `%${search.trim()}%`;
      queryParams.push(wild, wild, wild);
    }

    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Get total count
    const [countRows] = await pool.query(
      `SELECT COUNT(*) as count 
       FROM pet_bottle_batches pb
       JOIN finished_products fp ON pb.finished_product_id = fp.id
       JOIN raw_materials rm ON pb.raw_material_id = rm.id
       ${whereStr}`,
      queryParams
    );
    const total = countRows[0].count;

    // Get paginated batches
    let selectParams = [...queryParams, limit, offset];
    const [rows] = await pool.query(
      `SELECT 
        pb.id,
        DATE_FORMAT(pb.batch_date, '%Y-%m-%d') as batch_date,
        pb.finished_product_id,
        fp.name AS product_name,
        pb.raw_material_id,
        rm.sub_product_name AS preform_name,
        pb.bags_used,
        pb.actual_reading,
        pb.expected_reading,
        pb.difference_val,
        pb.bottle_bags,
        pb.wastage,
        pb.start_time,
        pb.stop_time,
        pb.notes,
        pb.created_at
       FROM pet_bottle_batches pb
       JOIN finished_products fp ON pb.finished_product_id = fp.id
       JOIN raw_materials rm ON pb.raw_material_id = rm.id
       ${whereStr}
       ORDER BY pb.batch_date DESC, pb.created_at DESC
       LIMIT ? OFFSET ?`,
      selectParams
    );

    res.json({
      ok: true,
      batches: rows,
      total,
      page,
      limit
    });
  } catch (error) {
    console.error('Fetch production history error:', error);
    res.status(400).json({ ok: false, error: error.message });
  }
});

// DELETE /api/pet-bottle/:id - Cancel production batch (Only allowed for today's batches)
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

    // Fetch the existing batch to check its date
    const [existingRows] = await connection.query(
      `SELECT DATE_FORMAT(batch_date, '%Y-%m-%d') as batch_date FROM pet_bottle_batches WHERE id = ?`,
      [id]
    );

    if (existingRows.length === 0) {
      throw new Error('Production batch not found.');
    }

    const existingDateStr = existingRows[0].batch_date;
    if (existingDateStr !== todayStr) {
      throw new Error('Altering past production batches is not allowed after the day changes.');
    }

    // 1. Delete stock register entries for this batch
    await connection.query(
      `DELETE FROM stock_register WHERE reference_id = ? AND transaction_type = 'PRODUCTION'`,
      [id]
    );

    // 2. Delete the batch entry itself
    const [result] = await connection.query(
      `DELETE FROM pet_bottle_batches WHERE id = ?`,
      [id]
    );

    if (result.affectedRows === 0) throw new Error('Production batch not found.');

    await connection.commit();
    res.json({ ok: true, message: 'Production batch and related stock register logs deleted successfully.' });
  } catch (error) {
    await connection.rollback();
    console.error('Delete production batch error:', error);
    res.status(400).json({ ok: false, error: error.message });
  } finally {
    connection.release();
  }
});

// PUT /api/pet-bottle/:id - Update production batch (Only allowed for today's batches)
router.put('/:id', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const {
      batchDate,
      productId,
      rawMaterialId,
      bagsUsed,
      actualReading,
      bottleBags = 0,
      wastage = 0,
      startTime = '',
      stopTime = '',
      notes = ''
    } = req.body;

    // Get today's date string in IST
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const istDate = new Date(now.getTime() + (330 + offset) * 60000);
    const yyyy = istDate.getFullYear();
    const mm = String(istDate.getMonth() + 1).padStart(2, '0');
    const dd = String(istDate.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;

    // 1. Fetch the existing batch to check its date
    const [existingRows] = await connection.query(
      `SELECT DATE_FORMAT(batch_date, '%Y-%m-%d') as batch_date FROM pet_bottle_batches WHERE id = ?`,
      [id]
    );

    if (existingRows.length === 0) {
      throw new Error('Production batch not found.');
    }

    const existingDateStr = existingRows[0].batch_date;
    if (existingDateStr !== todayStr) {
      throw new Error('Altering past production batches is not allowed after the day changes.');
    }

    // Validation
    if (!batchDate) throw new Error('Batch Date is required.');
    if (batchDate !== todayStr) {
      throw new Error('Batch Date must be set to today.');
    }
    if (!productId) throw new Error('Product is required.');
    if (!rawMaterialId) throw new Error('Preform is required.');
    
    const parsedBagsUsed = parseFloat(bagsUsed);
    if (isNaN(parsedBagsUsed) || parsedBagsUsed <= 0) {
      throw new Error('Bags Used must be greater than 0.');
    }

    const parsedActual = parseFloat(actualReading);
    if (isNaN(parsedActual) || parsedActual < 0) {
      throw new Error('Actual Reading cannot be negative.');
    }

    // Retrieve preform weight to calculate expected reading on backend
    const [materialRows] = await connection.query(
      `SELECT sub_product_name FROM raw_materials WHERE id = ?`,
      [rawMaterialId]
    );
    if (materialRows.length === 0) throw new Error('Selected Preform raw material not found.');
    const weight = parseFloat(materialRows[0].sub_product_name) || 0;
    if (weight <= 0) throw new Error('Invalid Preform weight in product master.');

    const expectedReading = Math.round((1000 / weight) * 25 * parsedBagsUsed);
    const difference = expectedReading - parsedActual;

    if (difference < 0) {
      throw new Error(`Actual Reading (${parsedActual}) cannot exceed Expected Reading (${expectedReading}). Difference cannot be negative.`);
    }

    // 2. Update pet_bottle_batches
    await connection.query(
      `UPDATE pet_bottle_batches SET 
         batch_date = ?, 
         finished_product_id = ?, 
         raw_material_id = ?, 
         bags_used = ?, 
         actual_reading = ?, 
         expected_reading = ?, 
         difference_val = ?, 
         bottle_bags = ?, 
         wastage = ?, 
         start_time = ?, 
         stop_time = ?, 
         notes = ? 
       WHERE id = ?`,
      [
        batchDate,
        productId,
        rawMaterialId,
        parsedBagsUsed,
        parsedActual,
        expectedReading,
        difference,
        parseInt(bottleBags, 10) || 0,
        parseFloat(wastage) || 0,
        startTime || '',
        stopTime || '',
        notes,
        id
      ]
    );

    // 3. Update stock register entries (Delete old ones and insert new ones)
    await connection.query(
      `DELETE FROM stock_register WHERE reference_id = ? AND transaction_type = 'PRODUCTION'`,
      [id]
    );

    const consumedWeightKg = parsedBagsUsed * 25;
    await connection.query(
      `INSERT INTO stock_register (item_type, item_id, transaction_type, reference_id, quantity, created_at)
       VALUES ('RAW_MATERIAL', ?, 'PRODUCTION', ?, ?, NOW())`,
      [rawMaterialId, id, -consumedWeightKg]
    );

    await connection.query(
      `INSERT INTO stock_register (item_type, item_id, transaction_type, reference_id, quantity, created_at)
       VALUES ('FINISHED_PRODUCT', ?, 'PRODUCTION', ?, ?, NOW())`,
      [productId, id, parsedActual]
    );

    await connection.commit();
    res.json({ ok: true, message: 'Production batch updated successfully!' });
  } catch (error) {
    await connection.rollback();
    console.error('Update production batch error:', error);
    res.status(400).json({ ok: false, error: error.message });
  } finally {
    connection.release();
  }
});

export default router;
