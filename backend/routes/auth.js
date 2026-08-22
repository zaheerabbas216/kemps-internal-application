import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../config/db.js';
import authMiddleware from '../middleware/auth.js';

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const usernameTrimmed = String(username || '').trim();

    if (!usernameTrimmed || !password) {
      return res.status(400).json({ ok: false, error: 'Username and password are required.' });
    }

    // Lookup user in the database
    const [rows] = await pool.query(
      'SELECT id, username, password, name FROM admins WHERE username = ?',
      [usernameTrimmed]
    );

    if (rows.length === 0) {
      return res.status(401).json({ ok: false, error: 'Invalid username or password.' });
    }

    const admin = rows[0];

    // Check password hashing match
    let passwordMatch = false;
    if (admin.password && (admin.password.startsWith('$2a$') || admin.password.startsWith('$2b$'))) {
      passwordMatch = await bcrypt.compare(password, admin.password);
    } else {
      passwordMatch = (password === admin.password);
    }
    if (!passwordMatch) {
      return res.status(401).json({ ok: false, error: 'Invalid username or password.' });
    }

    // Generate JWT
    const JWT_SECRET = process.env.JWT_SECRET || 'kemps_secret_key_123';
    const token = jwt.sign(
      { adminId: admin.id, username: admin.username },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      ok: true,
      token,
      user: {
        username: admin.username,
        name: admin.name || admin.username
      },
      message: 'Login successful!'
    });
  } catch (error) {
    console.error('Error in database login:', error);
    res.status(500).json({ ok: false, error: 'Internal server error.' });
  }
});

// GET /api/auth/users
router.get('/users', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, username, name, created_at FROM admins ORDER BY username ASC');
    res.json({ ok: true, users: rows });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch users.' });
  }
});

// POST /api/auth/users
router.post('/users', authMiddleware, async (req, res) => {
  try {
    const { username, password, name } = req.body;
    const usernameTrimmed = String(username || '').trim();
    const nameTrimmed = String(name || '').trim();

    if (!usernameTrimmed || !password) {
      return res.status(400).json({ ok: false, error: 'Username and password are required.' });
    }

    // Check if username already exists
    const [existing] = await pool.query('SELECT id FROM admins WHERE username = ?', [usernameTrimmed]);
    if (existing.length > 0) {
      return res.status(400).json({ ok: false, error: 'Username already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO admins (username, password, name) VALUES (?, ?, ?)',
      [usernameTrimmed, hashedPassword, nameTrimmed]
    );

    res.json({ ok: true, message: 'User created successfully!', userId: result.insertId });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ ok: false, error: 'Failed to create user.' });
  }
});

// PUT /api/auth/users/:id
router.put('/users/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { username, password, name } = req.body;
    const usernameTrimmed = String(username || '').trim();
    const nameTrimmed = String(name || '').trim();

    if (!usernameTrimmed) {
      return res.status(400).json({ ok: false, error: 'Username is required.' });
    }

    // Check username uniqueness (excluding current user)
    const [existing] = await pool.query('SELECT id FROM admins WHERE username = ? AND id != ?', [usernameTrimmed, id]);
    if (existing.length > 0) {
      return res.status(400).json({ ok: false, error: 'Username already exists.' });
    }

    if (password) {
      // Update with password change (bcrypt-hashed)
      const hashedPassword = await bcrypt.hash(password, 10);
      await pool.query(
        'UPDATE admins SET username = ?, password = ?, name = ? WHERE id = ?',
        [usernameTrimmed, hashedPassword, nameTrimmed, id]
      );
    } else {
      // Update without password change
      await pool.query(
        'UPDATE admins SET username = ?, name = ? WHERE id = ?',
        [usernameTrimmed, nameTrimmed, id]
      );
    }

    res.json({ ok: true, message: 'User updated successfully!' });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ ok: false, error: 'Failed to update user.' });
  }
});

// DELETE /api/auth/users/:id
router.delete('/users/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if the admin is trying to delete themselves
    if (parseInt(id, 10) === req.admin.adminId) {
      return res.status(400).json({ ok: false, error: 'You cannot delete your own logged-in user account.' });
    }

    await pool.query('DELETE FROM admins WHERE id = ?', [id]);
    res.json({ ok: true, message: 'User deleted successfully!' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ ok: false, error: 'Failed to delete user.' });
  }
});

export default router;
