import express from 'express';
import pool from '../config/db.js';

const router = express.Router();

// GET /api/raw-materials/categories
// Fetch all raw material categories
router.get('/categories', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, created_at FROM raw_material_categories ORDER BY name ASC`
    );
    res.json({ ok: true, categories: rows });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// POST /api/raw-materials/categories
// Add a new raw material category
router.post('/categories', async (req, res) => {
  try {
    const { name } = req.body;
    const nameTrimmed = String(name || '').trim();
    if (!nameTrimmed) {
      throw new Error('Category name is required.');
    }
    
    // Check if category already exists
    const [existing] = await pool.query(
      'SELECT id, name FROM raw_material_categories WHERE name = ?',
      [nameTrimmed]
    );
    
    if (existing && existing.length > 0) {
      // Return existing category ID if it already exists
      return res.json({ ok: true, id: existing[0].id, name: existing[0].name, isExisting: true });
    }
    
    const [result] = await pool.query(
      'INSERT INTO raw_material_categories (name) VALUES (?)',
      [nameTrimmed]
    );
    
    res.json({ ok: true, id: result.insertId, name: nameTrimmed, isExisting: false });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// GET /api/raw-materials
// Fetch raw materials with pagination and search.
// Pass ?activeOnly=true to return only active (status=1) materials (used by all operational modules).
// Without activeOnly, all materials are returned (used by Product Master admin view).
router.get('/', async (req, res) => {
  try {
    let { page = 1, limit = 10, search = '', activeOnly = '' } = req.query;
    page = parseInt(page, 10);
    limit = parseInt(limit, 10);
    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1) limit = 10;

    // Default to activeOnly = true, unless activeOnly is explicitly 'false' or '0'
    const filterActive = activeOnly !== 'false' && activeOnly !== '0';
    
    const offset = (page - 1) * limit;
    let queryParams = [];
    let countParams = [];
    
    // Build WHERE clauses
    const whereParts = [];
    if (filterActive) {
      whereParts.push('rm.status = 1');
    }
    if (search.trim()) {
      whereParts.push('(rm.sub_product_name LIKE ? OR rmc.name LIKE ?)');
      const wildSearch = `%${search.trim()}%`;
      queryParams.push(wildSearch, wildSearch);
      countParams.push(wildSearch, wildSearch);
    }
    const baseWhere = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';
    
    // Get total count
    const [countRows] = await pool.query(
      `SELECT COUNT(*) as count 
       FROM raw_materials rm
       JOIN raw_material_categories rmc ON rm.category_id = rmc.id
       ${baseWhere}`,
      countParams
    );
    const total = countRows[0].count;
    
    // Get paginated materials
    queryParams.push(limit, offset);
    const [rows] = await pool.query(
      `SELECT rm.id, rm.category_id, rmc.name AS category_name, rm.sub_product_name, rm.unit, rm.qty_in_pc_per_kg, rm.status, rm.created_at
       FROM raw_materials rm
       JOIN raw_material_categories rmc ON rm.category_id = rmc.id
       ${baseWhere}
       ORDER BY rm.created_at DESC 
       LIMIT ? OFFSET ?`,
      queryParams
    );
    
    res.json({
      ok: true,
      materials: rows,
      total,
      page,
      limit
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// POST /api/raw-materials
// Create a new raw material
router.post('/', async (req, res) => {
  try {
    const { categoryId, subProductName, unit, qtyInPcPerKg } = req.body;
    
    const subProductNameTrimmed = String(subProductName || '').trim();
    const unitTrimmed = String(unit || '').trim();
    const qtyInPcPerKgParsed = (qtyInPcPerKg !== undefined && qtyInPcPerKg !== null && qtyInPcPerKg !== '') ? parseFloat(qtyInPcPerKg) : null;
    
    if (!categoryId) {
      throw new Error('Category is required.');
    }
    if (!subProductNameTrimmed) {
      throw new Error('Sub product name is required.');
    }
    if (!unitTrimmed) {
      throw new Error('Unit is required.');
    }
    
    // Verify category exists
    const [categoryExists] = await pool.query(
      'SELECT id FROM raw_material_categories WHERE id = ?',
      [categoryId]
    );
    if (!categoryExists || categoryExists.length === 0) {
      throw new Error('Selected category does not exist.');
    }
    
    const [result] = await pool.query(
      'INSERT INTO raw_materials (category_id, sub_product_name, unit, qty_in_pc_per_kg, status) VALUES (?, ?, ?, ?, 1)',
      [categoryId, subProductNameTrimmed, unitTrimmed, qtyInPcPerKgParsed]
    );
    
    res.json({
      ok: true,
      id: result.insertId,
      message: 'Raw material added successfully!'
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// PUT /api/raw-materials/:id
// Update raw material (status toggle or field edits)
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { categoryId, subProductName, unit, qtyInPcPerKg, status } = req.body;
    
    // Check if raw material exists
    const [existing] = await pool.query('SELECT * FROM raw_materials WHERE id = ?', [id]);
    if (!existing || existing.length === 0) {
      throw new Error('Raw material not found.');
    }
    
    const updates = [];
    const values = [];
    
    if (categoryId !== undefined) {
      // Verify category exists
      const [categoryExists] = await pool.query(
        'SELECT id FROM raw_material_categories WHERE id = ?',
        [categoryId]
      );
      if (!categoryExists || categoryExists.length === 0) {
        throw new Error('Selected category does not exist.');
      }
      updates.push('category_id = ?');
      values.push(categoryId);
    }
    
    if (subProductName !== undefined) {
      const subProductNameTrimmed = String(subProductName || '').trim();
      if (!subProductNameTrimmed) {
        throw new Error('Sub product name cannot be empty.');
      }
      updates.push('sub_product_name = ?');
      values.push(subProductNameTrimmed);
    }
    
    if (unit !== undefined) {
      const unitTrimmed = String(unit || '').trim();
      if (!unitTrimmed) {
        throw new Error('Unit cannot be empty.');
      }
      updates.push('unit = ?');
      values.push(unitTrimmed);
    }

    if (qtyInPcPerKg !== undefined) {
      const qtyInPcPerKgParsed = (qtyInPcPerKg !== null && qtyInPcPerKg !== '') ? parseFloat(qtyInPcPerKg) : null;
      updates.push('qty_in_pc_per_kg = ?');
      values.push(qtyInPcPerKgParsed);
    }
    
    if (status !== undefined) {
      const parsedStatus = parseInt(status, 10);
      if (parsedStatus !== 0 && parsedStatus !== 1) {
        throw new Error('Status must be 0 (Disabled) or 1 (Enabled).');
      }
      updates.push('status = ?');
      values.push(parsedStatus);
    }
    
    if (updates.length > 0) {
      values.push(id);
      await pool.query(`UPDATE raw_materials SET ${updates.join(', ')} WHERE id = ?`, values);
    }
    
    res.json({ ok: true, message: 'Raw material updated successfully!' });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// DELETE /api/raw-materials/:id
// Delete a raw material
router.delete('/:id', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { id } = req.params;

    // Check if raw material exists
    const [rmRows] = await connection.query('SELECT id, sub_product_name FROM raw_materials WHERE id = ?', [id]);
    if (rmRows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Raw material not found.' });
    }
    const rm = rmRows[0];

    // Check for operational business transactions
    const [invBills] = await connection.query('SELECT COUNT(*) as c FROM inventory_bill_items WHERE raw_material_id = ?', [id]);
    const [petBatches] = await connection.query('SELECT COUNT(*) as c FROM pet_bottle_batches WHERE raw_material_id = ? OR finished_product_id = ?', [id, id]);
    const [prodUsages] = await connection.query('SELECT COUNT(*) as c FROM production_material_usages WHERE raw_material_id = ?', [id]);
    const [corrections] = await connection.query('SELECT COUNT(*) as c FROM stock_corrections WHERE raw_material_id = ?', [id]);
    const [regRows] = await connection.query("SELECT COUNT(*) as c FROM stock_register WHERE item_type = 'RAW_MATERIAL' AND item_id = ?", [id]);

    const txCount = invBills[0].c + petBatches[0].c + prodUsages[0].c + corrections[0].c + regRows[0].c;

    if (txCount > 0) {
      const reasons = [];
      if (invBills[0].c > 0) reasons.push(`${invBills[0].c} inventory purchase bill(s)`);
      if (petBatches[0].c > 0) reasons.push(`${petBatches[0].c} PET bottle batch(es)`);
      if (prodUsages[0].c > 0) reasons.push(`${prodUsages[0].c} production usage(s)`);
      if (corrections[0].c > 0) reasons.push(`${corrections[0].c} stock correction(s)`);

      return res.status(400).json({
        ok: false,
        hasTransactions: true,
        error: `Cannot permanently delete raw material "${rm.sub_product_name}" because it is linked to existing transactions (${reasons.join(', ')}). Please toggle its status to "Disabled" instead to hide it without breaking historical records.`
      });
    }

    // No operational transactions: clean up snapshots, manual opening, costs and delete raw material
    await connection.beginTransaction();

    await connection.query('DELETE FROM raw_material_ledger_snapshots WHERE raw_material_id = ?', [id]);
    await connection.query('DELETE FROM raw_material_ledger_manual_opening WHERE raw_material_id = ?', [id]);
    await connection.query('DELETE FROM raw_material_costs WHERE raw_material_id = ?', [id]);
    await connection.query('DELETE FROM cost_sheet_items WHERE raw_material_id = ?', [id]);
    await connection.query('DELETE FROM raw_materials WHERE id = ?', [id]);

    await connection.commit();
    res.json({ ok: true, message: `Raw material "${rm.sub_product_name}" deleted successfully!` });
  } catch (error) {
    await connection.rollback();
    res.status(400).json({ ok: false, error: error.message });
  } finally {
    connection.release();
  }
});

export default router;
