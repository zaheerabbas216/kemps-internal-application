import express from 'express';
import pool from '../config/db.js';

const router = express.Router();

// ── GET /api/maintenance-master/all ──────────────────────────────────────────
// Returns all active particulars with nested sub-products for form dropdowns
router.get('/all', async (req, res) => {
  try {
    const [particulars] = await pool.query(
      `SELECT id, name, description, status 
       FROM maintenance_particulars 
       WHERE status = 1 
       ORDER BY name ASC`
    );

    const [subProducts] = await pool.query(
      `SELECT id, particular_id, name, description, status 
       FROM maintenance_sub_products 
       WHERE status = 1 
       ORDER BY name ASC`
    );

    const tree = particulars.map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      subProducts: subProducts
        .filter(s => s.particular_id === p.id)
        .map(s => ({
          id: s.id,
          name: s.name,
          description: s.description
        }))
    }));

    res.json({ ok: true, tree, particulars, subProducts });
  } catch (error) {
    console.error('Fetch all maintenance master error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ── GET /api/maintenance-master/particulars ──────────────────────────────────
// Returns particulars list with sub-product counts and search support
router.get('/particulars', async (req, res) => {
  try {
    const { search = '' } = req.query;
    let query = `
      SELECT p.id, p.name, p.description, p.status, p.created_at, p.updated_at,
             COUNT(s.id) AS sub_product_count
      FROM maintenance_particulars p
      LEFT JOIN maintenance_sub_products s ON p.id = s.particular_id
    `;
    const params = [];

    if (search.trim()) {
      query += ` WHERE p.name LIKE ? OR p.description LIKE ?`;
      params.push(`%${search.trim()}%`, `%${search.trim()}%`);
    }

    query += ` GROUP BY p.id ORDER BY p.name ASC`;

    const [rows] = await pool.query(query, params);
    res.json({ ok: true, particulars: rows });
  } catch (error) {
    console.error('Fetch particulars error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ── POST /api/maintenance-master/particulars ─────────────────────────────────
// Creates a new particular
router.post('/particulars', async (req, res) => {
  try {
    const { name, description = '' } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ ok: false, error: 'Particular name is required.' });
    }

    const trimmedName = name.trim();
    // Check duplicate
    const [existing] = await pool.query(
      'SELECT id FROM maintenance_particulars WHERE LOWER(name) = LOWER(?)',
      [trimmedName]
    );
    if (existing.length > 0) {
      return res.status(400).json({ ok: false, error: `Particular "${trimmedName}" already exists.` });
    }

    const [result] = await pool.query(
      'INSERT INTO maintenance_particulars (name, description, status) VALUES (?, ?, 1)',
      [trimmedName, description ? description.trim() : null]
    );

    res.json({
      ok: true,
      id: result.insertId,
      message: `Particular "${trimmedName}" created successfully!`
    });
  } catch (error) {
    console.error('Create particular error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ── PUT /api/maintenance-master/particulars/:id ──────────────────────────────
// Updates a particular
router.put('/particulars/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, status } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ ok: false, error: 'Particular name is required.' });
    }

    const trimmedName = name.trim();
    // Check duplicate name on other rows
    const [existing] = await pool.query(
      'SELECT id FROM maintenance_particulars WHERE LOWER(name) = LOWER(?) AND id != ?',
      [trimmedName, id]
    );
    if (existing.length > 0) {
      return res.status(400).json({ ok: false, error: `Another particular named "${trimmedName}" already exists.` });
    }

    const [oldRow] = await pool.query('SELECT name FROM maintenance_particulars WHERE id = ?', [id]);
    if (oldRow.length === 0) {
      return res.status(404).json({ ok: false, error: 'Particular not found.' });
    }

    const oldName = oldRow[0].name;

    await pool.query(
      'UPDATE maintenance_particulars SET name = ?, description = ?, status = ? WHERE id = ?',
      [
        trimmedName,
        description !== undefined ? (description ? description.trim() : null) : null,
        status !== undefined ? (status ? 1 : 0) : 1,
        id
      ]
    );

    // If name changed, update historical maintenance_records with this particular name
    if (oldName !== trimmedName) {
      await pool.query(
        'UPDATE maintenance_records SET particular = ? WHERE particular = ?',
        [trimmedName, oldName]
      );
    }

    res.json({ ok: true, message: 'Particular updated successfully!' });
  } catch (error) {
    console.error('Update particular error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ── DELETE /api/maintenance-master/particulars/:id ───────────────────────────
// Deletes a particular and its sub-products
router.delete('/particulars/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await pool.query('DELETE FROM maintenance_particulars WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ ok: false, error: 'Particular not found.' });
    }
    res.json({ ok: true, message: 'Particular and its sub-products deleted successfully!' });
  } catch (error) {
    console.error('Delete particular error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ── GET /api/maintenance-master/sub-products ─────────────────────────────────
// Returns sub-products with optional particular filter and search
router.get('/sub-products', async (req, res) => {
  try {
    const { particularId, search = '' } = req.query;
    let query = `
      SELECT s.id, s.particular_id, p.name AS particular_name, s.name, s.description, s.status, s.created_at, s.updated_at
      FROM maintenance_sub_products s
      JOIN maintenance_particulars p ON s.particular_id = p.id
    `;
    const params = [];
    const where = [];

    if (particularId) {
      where.push('s.particular_id = ?');
      params.push(particularId);
    }

    if (search.trim()) {
      where.push('(s.name LIKE ? OR s.description LIKE ? OR p.name LIKE ?)');
      params.push(`%${search.trim()}%`, `%${search.trim()}%`, `%${search.trim()}%`);
    }

    if (where.length > 0) {
      query += ` WHERE ${where.join(' AND ')}`;
    }

    query += ` ORDER BY p.name ASC, s.name ASC`;

    const [rows] = await pool.query(query, params);
    res.json({ ok: true, subProducts: rows });
  } catch (error) {
    console.error('Fetch sub-products error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ── POST /api/maintenance-master/sub-products ────────────────────────────────
// Creates a new sub product under a particular
router.post('/sub-products', async (req, res) => {
  try {
    const { particularId, name, description = '' } = req.body;
    if (!particularId) {
      return res.status(400).json({ ok: false, error: 'Particular is required.' });
    }
    if (!name || !name.trim()) {
      return res.status(400).json({ ok: false, error: 'Sub product name is required.' });
    }

    const trimmedName = name.trim();

    // Check duplicate under the same particular
    const [existing] = await pool.query(
      'SELECT id FROM maintenance_sub_products WHERE particular_id = ? AND LOWER(name) = LOWER(?)',
      [particularId, trimmedName]
    );
    if (existing.length > 0) {
      return res.status(400).json({ ok: false, error: `Sub product "${trimmedName}" already exists under this particular.` });
    }

    const [result] = await pool.query(
      'INSERT INTO maintenance_sub_products (particular_id, name, description, status) VALUES (?, ?, ?, 1)',
      [particularId, trimmedName, description ? description.trim() : null]
    );

    res.json({
      ok: true,
      id: result.insertId,
      message: `Sub product "${trimmedName}" added successfully!`
    });
  } catch (error) {
    console.error('Create sub-product error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ── PUT /api/maintenance-master/sub-products/:id ─────────────────────────────
// Updates a sub product
router.put('/sub-products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { particularId, name, description, status } = req.body;

    if (!particularId) {
      return res.status(400).json({ ok: false, error: 'Particular is required.' });
    }
    if (!name || !name.trim()) {
      return res.status(400).json({ ok: false, error: 'Sub product name is required.' });
    }

    const trimmedName = name.trim();

    // Check duplicate
    const [existing] = await pool.query(
      'SELECT id FROM maintenance_sub_products WHERE particular_id = ? AND LOWER(name) = LOWER(?) AND id != ?',
      [particularId, trimmedName, id]
    );
    if (existing.length > 0) {
      return res.status(400).json({ ok: false, error: `Another sub product named "${trimmedName}" exists under this particular.` });
    }

    const [oldRow] = await pool.query('SELECT name FROM maintenance_sub_products WHERE id = ?', [id]);
    if (oldRow.length === 0) {
      return res.status(404).json({ ok: false, error: 'Sub product not found.' });
    }

    const oldName = oldRow[0].name;

    await pool.query(
      'UPDATE maintenance_sub_products SET particular_id = ?, name = ?, description = ?, status = ? WHERE id = ?',
      [
        particularId,
        trimmedName,
        description !== undefined ? (description ? description.trim() : null) : null,
        status !== undefined ? (status ? 1 : 0) : 1,
        id
      ]
    );

    // If name changed, update historical maintenance_records with this sub_detail
    if (oldName !== trimmedName) {
      await pool.query(
        'UPDATE maintenance_records SET sub_detail = ? WHERE sub_detail = ?',
        [trimmedName, oldName]
      );
    }

    res.json({ ok: true, message: 'Sub product updated successfully!' });
  } catch (error) {
    console.error('Update sub-product error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ── DELETE /api/maintenance-master/sub-products/:id ──────────────────────────
// Deletes a sub product
router.delete('/sub-products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await pool.query('DELETE FROM maintenance_sub_products WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ ok: false, error: 'Sub product not found.' });
    }
    res.json({ ok: true, message: 'Sub product deleted successfully!' });
  } catch (error) {
    console.error('Delete sub-product error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
