import express from 'express';
import pool from '../config/db.js';

const router = express.Router();

// GET /api/finished-products/categories
// Fetch all finished product categories
router.get('/categories', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, created_at FROM finished_product_categories ORDER BY name ASC`
    );
    res.json({ ok: true, categories: rows });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// POST /api/finished-products/categories
// Add a new finished product category
router.post('/categories', async (req, res) => {
  try {
    const { name } = req.body;
    const nameTrimmed = String(name || '').trim();
    if (!nameTrimmed) {
      throw new Error('Category name is required.');
    }
    
    // Check if category already exists
    const [existing] = await pool.query(
      'SELECT id, name FROM finished_product_categories WHERE name = ?',
      [nameTrimmed]
    );
    
    if (existing && existing.length > 0) {
      return res.json({ ok: true, id: existing[0].id, name: existing[0].name, isExisting: true });
    }
    
    const [result] = await pool.query(
      'INSERT INTO finished_product_categories (name) VALUES (?)',
      [nameTrimmed]
    );
    
    res.json({ ok: true, id: result.insertId, name: nameTrimmed, isExisting: false });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// GET /api/finished-products
// Fetch all finished products with pagination and search
router.get('/', async (req, res) => {
  try {
    let { page = 1, limit = 10, search = '' } = req.query;
    page = parseInt(page, 10);
    limit = parseInt(limit, 10);
    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1) limit = 10;
    
    const offset = (page - 1) * limit;
    let queryParams = [];
    let countParams = [];
    
    let baseWhere = '';
    if (search.trim()) {
      baseWhere = ' WHERE fp.name LIKE ? OR fpc.name LIKE ?';
      const wildSearch = `%${search.trim()}%`;
      queryParams = [wildSearch, wildSearch];
      countParams = [wildSearch, wildSearch];
    }
    
    // Get total count
    const [countRows] = await pool.query(
      `SELECT COUNT(*) as count 
       FROM finished_products fp
       LEFT JOIN finished_product_categories fpc ON fp.category_id = fpc.id
       ${baseWhere}`,
      countParams
    );
    const total = countRows[0].count;
    
    // Get paginated products
    queryParams.push(limit, offset);
    const [rows] = await pool.query(
      `SELECT fp.id, fp.name, fp.category_id, fpc.name AS category_name, fp.status, fp.created_at
       FROM finished_products fp
       LEFT JOIN finished_product_categories fpc ON fp.category_id = fpc.id
       ${baseWhere}
       ORDER BY fp.created_at DESC 
       LIMIT ? OFFSET ?`,
      queryParams
    );
    
    res.json({
      ok: true,
      products: rows,
      total,
      page,
      limit
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// POST /api/finished-products
// Create a new finished product
router.post('/', async (req, res) => {
  try {
    const { name, categoryId } = req.body;
    const nameTrimmed = String(name || '').trim();
    
    if (!nameTrimmed) {
      throw new Error('Product name is required.');
    }
    
    let catId = categoryId ? parseInt(categoryId, 10) : null;
    if (catId) {
      // Verify category exists
      const [categoryExists] = await pool.query(
        'SELECT id FROM finished_product_categories WHERE id = ?',
        [catId]
      );
      if (!categoryExists || categoryExists.length === 0) {
        throw new Error('Selected category does not exist.');
      }
    }
    
    const [result] = await pool.query(
      'INSERT INTO finished_products (name, category_id, status) VALUES (?, ?, 1)',
      [nameTrimmed, catId]
    );
    
    res.json({
      ok: true,
      id: result.insertId,
      message: 'Finished product added successfully!'
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// PUT /api/finished-products/:id
// Update finished product (status toggle or field edits)
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, categoryId, status } = req.body;
    
    // Check if finished product exists
    const [existing] = await pool.query('SELECT * FROM finished_products WHERE id = ?', [id]);
    if (!existing || existing.length === 0) {
      throw new Error('Finished product not found.');
    }
    
    const updates = [];
    const values = [];
    
    if (name !== undefined) {
      const nameTrimmed = String(name || '').trim();
      if (!nameTrimmed) {
        throw new Error('Product name cannot be empty.');
      }
      updates.push('name = ?');
      values.push(nameTrimmed);
    }
    
    if (categoryId !== undefined) {
      let catId = categoryId ? parseInt(categoryId, 10) : null;
      if (catId) {
        // Verify category exists
        const [categoryExists] = await pool.query(
          'SELECT id FROM finished_product_categories WHERE id = ?',
          [catId]
        );
        if (!categoryExists || categoryExists.length === 0) {
          throw new Error('Selected category does not exist.');
        }
      }
      updates.push('category_id = ?');
      values.push(catId);
    }
    
    if (status !== undefined) {
      const parsedStatus = parseInt(status, 10);
      if (parsedStatus !== 0 && parsedStatus !== 1) {
        throw new Error('Status must be 0 (Inactive) or 1 (Active).');
      }
      updates.push('status = ?');
      values.push(parsedStatus);
    }
    
    if (updates.length > 0) {
      values.push(id);
      await pool.query(`UPDATE finished_products SET ${updates.join(', ')} WHERE id = ?`, values);
    }
    
    res.json({ ok: true, message: 'Finished product updated successfully!' });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// DELETE /api/finished-products/:id
// Delete a finished product
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await pool.query('DELETE FROM finished_products WHERE id = ?', [id]);
    if (result.affectedRows > 0) {
      res.json({ ok: true, message: 'Finished product deleted successfully!' });
    } else {
      res.status(404).json({ ok: false, error: 'Finished product not found.' });
    }
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

export default router;
