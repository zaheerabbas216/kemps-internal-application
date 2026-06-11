import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../config/db.js';

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
    const passwordMatch = await bcrypt.compare(password, admin.password);
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

export default router;
