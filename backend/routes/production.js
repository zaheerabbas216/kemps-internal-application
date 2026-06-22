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

// GET /api/production/today - Retrieve today's production runs and aggregates
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
         COALESCE(SUM(production_boxes), 0) as totalBoxes,
         COALESCE(SUM(production_boxes * bottles_per_box), 0) as totalBottles,
         COUNT(*) as totalRuns 
       FROM production_batches 
       WHERE production_date = ?`,
      [todayStr]
    );

    const summary = {
      totalBoxes: parseInt(summaryRows[0].totalBoxes, 10),
      totalBottles: parseInt(summaryRows[0].totalBottles, 10),
      totalRuns: parseInt(summaryRows[0].totalRuns, 10)
    };

    let queryParams = [todayStr];
    let whereClause = 'WHERE p.production_date = ?';

    if (search.trim()) {
      whereClause += ' AND (fp.name LIKE ? OR p.batch_no LIKE ?)';
      const wildSearch = `%${search.trim()}%`;
      queryParams.push(wildSearch, wildSearch);
    }

    const [rows] = await pool.query(
      `SELECT 
         p.id,
         DATE_FORMAT(p.production_date, '%Y-%m-%d') as production_date,
         p.finished_product_id,
         fp.name AS product_name,
         p.production_boxes,
         p.bottles_per_box,
         p.batch_no,
         DATE_FORMAT(p.mfg_date, '%Y-%m-%d') as mfg_date,
         DATE_FORMAT(p.expiry_date, '%Y-%m-%d') as expiry_date,
         p.start_time,
         p.end_time,
         p.ink_qty,
         p.solvent_qty,
         p.created_at
       FROM production_batches p
       JOIN finished_products fp ON p.finished_product_id = fp.id
       ${whereClause} 
       ORDER BY p.created_at DESC`,
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

// GET /api/production - Retrieve paginated production history list
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
      whereClauses.push('p.production_date >= ?');
      queryParams.push(startDate);
    }
    if (endDate) {
      whereClauses.push('p.production_date <= ?');
      queryParams.push(endDate);
    }

    if (search.trim()) {
      whereClauses.push('(fp.name LIKE ? OR p.batch_no LIKE ? OR p.id LIKE ?)');
      const wild = `%${search.trim()}%`;
      queryParams.push(wild, wild, wild);
    }

    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Get total count
    const [countRows] = await pool.query(
      `SELECT COUNT(*) as count 
       FROM production_batches p
       JOIN finished_products fp ON p.finished_product_id = fp.id
       ${whereStr}`,
      queryParams
    );
    const total = countRows[0].count;

    // Get paginated batches
    let selectParams = [...queryParams, limit, offset];
    const [rows] = await pool.query(
      `SELECT 
         p.id,
         DATE_FORMAT(p.production_date, '%Y-%m-%d') as production_date,
         p.finished_product_id,
         fp.name AS product_name,
         p.production_boxes,
         p.bottles_per_box,
         p.batch_no,
         DATE_FORMAT(p.mfg_date, '%Y-%m-%d') as mfg_date,
         DATE_FORMAT(p.expiry_date, '%Y-%m-%d') as expiry_date,
         p.start_time,
         p.end_time,
         p.ink_qty,
         p.solvent_qty,
         p.created_at
       FROM production_batches p
       JOIN finished_products fp ON p.finished_product_id = fp.id
       ${whereStr}
       ORDER BY p.production_date DESC, p.created_at DESC
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

// GET /api/production/:id - Get single batch details and dynamic raw material usages
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch batch details
    const [batchRows] = await pool.query(
      `SELECT 
         p.id,
         DATE_FORMAT(p.production_date, '%Y-%m-%d') as production_date,
         p.finished_product_id,
         fp.name AS product_name,
         p.production_boxes,
         p.bottles_per_box,
         p.batch_no,
         DATE_FORMAT(p.mfg_date, '%Y-%m-%d') as mfg_date,
         DATE_FORMAT(p.expiry_date, '%Y-%m-%d') as expiry_date,
         p.start_time,
         p.end_time,
         p.ink_qty,
         p.solvent_qty,
         p.created_at
       FROM production_batches p
       JOIN finished_products fp ON p.finished_product_id = fp.id
       WHERE p.id = ?`,
      [id]
    );

    if (batchRows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Production batch not found.' });
    }

    // Fetch materials used
    const [materialRows] = await pool.query(
      `SELECT 
         pmu.id,
         pmu.raw_material_id,
         rm.sub_product_name,
         rmc.name AS category_name,
         rm.unit,
         pmu.quantity,
         pmu.wastage
       FROM production_material_usages pmu
       JOIN raw_materials rm ON pmu.raw_material_id = rm.id
       JOIN raw_material_categories rmc ON rm.category_id = rmc.id
       WHERE pmu.production_batch_id = ?`,
      [id]
    );

    res.json({
      ok: true,
      batch: batchRows[0],
      materials: materialRows
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// POST /api/production - Create a production run (Transaction Safe)
router.post('/', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const {
      productionDate,
      productId,
      productionBoxes,
      bottlesPerBox,
      batchNo = '',
      mfgDate,
      expiryDate,
      startTime = '',
      endTime = '',
      inkQty = 0,
      solventQty = 0,
      materialsUsed = [] // Array of { rawMaterialId, quantity, wastage }
    } = req.body;

    // Validation
    if (!productionDate) throw new Error('Production Date is required.');
    if (!productId) throw new Error('Finished Product is required.');

    // Validate finished product is active
    const [prodCheck] = await connection.query(
      `SELECT name, status FROM finished_products WHERE id = ?`,
      [parseInt(productId, 10)]
    );
    if (prodCheck.length > 0 && prodCheck[0].status === 0) {
      throw new Error(`The finished product '${prodCheck[0].name}' is disabled in Product Master. You cannot place new production entries for it.`);
    }

    // Validate raw materials are active
    const rmIds = materialsUsed.map(m => parseInt(m.rawMaterialId, 10)).filter(id => !isNaN(id));
    if (rmIds.length > 0) {
      const [inactiveRms] = await connection.query(
        `SELECT sub_product_name FROM raw_materials WHERE id IN (?) AND status = 0`,
        [rmIds]
      );
      if (inactiveRms.length > 0) {
        const names = inactiveRms.map(r => r.sub_product_name).join(', ');
        throw new Error(`The following raw materials are disabled in Product Master: ${names}. You cannot consume them.`);
      }
    }
    
    const boxes = parseInt(productionBoxes, 10);
    const perBox = parseInt(bottlesPerBox, 10);
    if (isNaN(boxes) || boxes <= 0) throw new Error('Production Boxes must be greater than 0.');
    if (isNaN(perBox) || perBox <= 0) throw new Error('Bottles per Box must be greater than 0.');
    
    if (!mfgDate) throw new Error('MFG Date is required.');
    if (!expiryDate) throw new Error('Expiry Date is required.');

    const totalBottlesBlown = boxes * perBox;

    // Fetch product unit cost from cost sheet
    const [costRows] = await connection.query(
      `SELECT total_cost FROM cost_sheets WHERE finished_product_id = ?`,
      [parseInt(productId, 10)]
    );
    const unitCost = costRows.length > 0 ? parseFloat(costRows[0].total_cost) : 0.0000;
    const productionValue = totalBottlesBlown * unitCost;

    // Generate Batch ID
    const batchId = await generateId('PROD', 'production_batches', 'id');

    // 1. Insert into production_batches
    await connection.query(
      `INSERT INTO production_batches 
       (id, production_date, finished_product_id, production_boxes, bottles_per_box, batch_no, mfg_date, expiry_date, start_time, end_time, ink_qty, solvent_qty, unit_cost, production_value, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        batchId,
        productionDate,
        parseInt(productId, 10),
        boxes,
        perBox,
        batchNo,
        mfgDate,
        expiryDate,
        startTime,
        endTime,
        parseFloat(inkQty) || 0,
        parseFloat(solventQty) || 0,
        unitCost,
        productionValue
      ]
    );

    // 2. Insert dynamic raw material usages and deduct from stock register
    for (const mat of materialsUsed) {
      const { rawMaterialId, quantity, wastage } = mat;
      if (!rawMaterialId) throw new Error('Invalid raw material selected.');
      
      const parsedQty = parseFloat(quantity) || 0;
      const parsedWastage = parseFloat(wastage) || 0;

      // Insert usage record
      await connection.query(
        `INSERT INTO production_material_usages (production_batch_id, raw_material_id, quantity, wastage)
         VALUES (?, ?, ?, ?)`,
        [batchId, parseInt(rawMaterialId, 10), parsedQty, parsedWastage]
      );

      // Deduct from stock registry (total consumed is quantity + wastage)
      const totalConsumed = parsedQty + parsedWastage;
      if (totalConsumed > 0) {
        await connection.query(
          `INSERT INTO stock_register (item_type, item_id, transaction_type, reference_id, quantity, created_at)
           VALUES ('RAW_MATERIAL', ?, 'PRODUCTION', ?, ?, NOW())`,
          [parseInt(rawMaterialId, 10), batchId, -totalConsumed]
        );
      }
    }

    // 3. Log produced finished bottles to stock register (Positive addition)
    await connection.query(
      `INSERT INTO stock_register (item_type, item_id, transaction_type, reference_id, quantity, created_at)
       VALUES ('FINISHED_PRODUCT', ?, 'PRODUCTION', ?, ?, NOW())`,
      [parseInt(productId, 10), batchId, totalBottlesBlown]
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

// PUT /api/production/:id - Update a production batch (Only allowed for today's entries)
router.put('/:id', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const {
      productionDate,
      productId,
      productionBoxes,
      bottlesPerBox,
      batchNo = '',
      mfgDate,
      expiryDate,
      startTime = '',
      endTime = '',
      inkQty = 0,
      solventQty = 0,
      materialsUsed = []
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
      `SELECT DATE_FORMAT(production_date, '%Y-%m-%d') as production_date FROM production_batches WHERE id = ?`,
      [id]
    );

    if (existingRows.length === 0) {
      throw new Error('Production batch not found.');
    }

    const existingDateStr = existingRows[0].production_date;
    if (existingDateStr !== todayStr) {
      throw new Error('Altering past production batches is not allowed after the day changes.');
    }

    // Validation
    if (!productionDate) throw new Error('Production Date is required.');
    if (productionDate !== todayStr) {
      throw new Error('Production Date must be set to today.');
    }
    if (!productId) throw new Error('Finished Product is required.');

    // Validate finished product is active
    const [prodCheck] = await connection.query(
      `SELECT name, status FROM finished_products WHERE id = ?`,
      [parseInt(productId, 10)]
    );
    if (prodCheck.length > 0 && prodCheck[0].status === 0) {
      throw new Error(`The finished product '${prodCheck[0].name}' is disabled in Product Master. You cannot place new production entries for it.`);
    }

    // Validate raw materials are active
    const rmIds = materialsUsed.map(m => parseInt(m.rawMaterialId, 10)).filter(id => !isNaN(id));
    if (rmIds.length > 0) {
      const [inactiveRms] = await connection.query(
        `SELECT sub_product_name FROM raw_materials WHERE id IN (?) AND status = 0`,
        [rmIds]
      );
      if (inactiveRms.length > 0) {
        const names = inactiveRms.map(r => r.sub_product_name).join(', ');
        throw new Error(`The following raw materials are disabled in Product Master: ${names}. You cannot consume them.`);
      }
    }
    
    const boxes = parseInt(productionBoxes, 10);
    const perBox = parseInt(bottlesPerBox, 10);
    if (isNaN(boxes) || boxes <= 0) throw new Error('Production Boxes must be greater than 0.');
    if (isNaN(perBox) || perBox <= 0) throw new Error('Bottles per Box must be greater than 0.');
    
    if (!mfgDate) throw new Error('MFG Date is required.');
    if (!expiryDate) throw new Error('Expiry Date is required.');

    const totalBottlesBlown = boxes * perBox;

    // Fetch product unit cost from cost sheet
    const [costRows] = await connection.query(
      `SELECT total_cost FROM cost_sheets WHERE finished_product_id = ?`,
      [parseInt(productId, 10)]
    );
    const unitCost = costRows.length > 0 ? parseFloat(costRows[0].total_cost) : 0.0000;
    const productionValue = totalBottlesBlown * unitCost;

    // 2. Update production_batches
    await connection.query(
      `UPDATE production_batches SET 
         production_date = ?, 
         finished_product_id = ?, 
         production_boxes = ?, 
         bottles_per_box = ?, 
         batch_no = ?, 
         mfg_date = ?, 
         expiry_date = ?, 
         start_time = ?, 
         end_time = ?, 
         ink_qty = ?, 
         solvent_qty = ?, 
         unit_cost = ?,
         production_value = ?
       WHERE id = ?`,
      [
        productionDate,
        parseInt(productId, 10),
        boxes,
        perBox,
        batchNo,
        mfgDate,
        expiryDate,
        startTime,
        endTime,
        parseFloat(inkQty) || 0,
        parseFloat(solventQty) || 0,
        unitCost,
        productionValue,
        id
      ]
    );

    // 3. Clear old usage rows and stock register logs
    await connection.query(
      `DELETE FROM production_material_usages WHERE production_batch_id = ?`,
      [id]
    );

    await connection.query(
      `DELETE FROM stock_register WHERE reference_id = ? AND transaction_type = 'PRODUCTION'`,
      [id]
    );

    // 4. Insert updated raw material usages and stock deductions
    for (const mat of materialsUsed) {
      const { rawMaterialId, quantity, wastage } = mat;
      if (!rawMaterialId) throw new Error('Invalid raw material selected.');
      
      const parsedQty = parseFloat(quantity) || 0;
      const parsedWastage = parseFloat(wastage) || 0;

      await connection.query(
        `INSERT INTO production_material_usages (production_batch_id, raw_material_id, quantity, wastage)
         VALUES (?, ?, ?, ?)`,
        [id, parseInt(rawMaterialId, 10), parsedQty, parsedWastage]
      );

      const totalConsumed = parsedQty + parsedWastage;
      if (totalConsumed > 0) {
        await connection.query(
          `INSERT INTO stock_register (item_type, item_id, transaction_type, reference_id, quantity, created_at)
           VALUES ('RAW_MATERIAL', ?, 'PRODUCTION', ?, ?, NOW())`,
          [parseInt(rawMaterialId, 10), id, -totalConsumed]
        );
      }
    }

    // 5. Log updated produced finished product
    await connection.query(
      `INSERT INTO stock_register (item_type, item_id, transaction_type, reference_id, quantity, created_at)
       VALUES ('FINISHED_PRODUCT', ?, 'PRODUCTION', ?, ?, NOW())`,
      [parseInt(productId, 10), id, totalBottlesBlown]
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

// DELETE /api/production/:id - Delete production run (Only allowed for today's entries)
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

    // 1. Fetch the existing batch to check its date
    const [existingRows] = await connection.query(
      `SELECT DATE_FORMAT(production_date, '%Y-%m-%d') as production_date FROM production_batches WHERE id = ?`,
      [id]
    );

    if (existingRows.length === 0) {
      throw new Error('Production batch not found.');
    }

    const existingDateStr = existingRows[0].production_date;
    if (existingDateStr !== todayStr) {
      throw new Error('Altering past production batches is not allowed after the day changes.');
    }

    // 2. Clear usages, stock logs, and production run
    await connection.query(
      `DELETE FROM production_material_usages WHERE production_batch_id = ?`,
      [id]
    );

    await connection.query(
      `DELETE FROM stock_register WHERE reference_id = ? AND transaction_type = 'PRODUCTION'`,
      [id]
    );

    const [result] = await connection.query(
      `DELETE FROM production_batches WHERE id = ?`,
      [id]
    );

    if (result.affectedRows === 0) throw new Error('Production batch not found.');

    await connection.commit();
    res.json({ ok: true, message: 'Production run deleted and inventory adjusted successfully.' });
  } catch (error) {
    await connection.rollback();
    console.error('Delete production batch error:', error);
    res.status(400).json({ ok: false, error: error.message });
  } finally {
    connection.release();
  }
});

export default router;
