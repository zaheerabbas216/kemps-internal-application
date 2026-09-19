import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../config/db.js';
import authMiddleware, { requireSuperAdmin } from '../middleware/auth.js';

const router = express.Router();

// ─────────────────────────────────────────────
// Helper: fetch permissions object for a role
// ─────────────────────────────────────────────
async function getRolePermissions(roleId) {
  if (!roleId) return {}; // superadmin — no restrictions needed
  const [rows] = await pool.query(
    'SELECT module, can_read, can_create, can_update, can_delete FROM role_permissions WHERE role_id = ?',
    [roleId]
  );
  const permissions = {};
  for (const row of rows) {
    permissions[row.module] = {
      read:   !!row.can_read,
      create: !!row.can_create,
      update: !!row.can_update,
      delete: !!row.can_delete,
    };
  }
  return permissions;
}

// ─────────────────────────────────────────────
// POST /api/auth/login
// ─────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const usernameTrimmed = String(username || '').trim();

    if (!usernameTrimmed || !password) {
      return res.status(400).json({ ok: false, error: 'Username and password are required.' });
    }

    const [rows] = await pool.query(
      'SELECT id, username, password, name, role_id FROM admins WHERE username = ?',
      [usernameTrimmed]
    );

    if (rows.length === 0) {
      return res.status(401).json({ ok: false, error: 'Invalid username or password.' });
    }

    const admin = rows[0];

    let passwordMatch = false;
    if (admin.password && (admin.password.startsWith('$2a$') || admin.password.startsWith('$2b$'))) {
      passwordMatch = await bcrypt.compare(password, admin.password);
    } else {
      passwordMatch = (password === admin.password);
    }
    if (!passwordMatch) {
      return res.status(401).json({ ok: false, error: 'Invalid username or password.' });
    }

    const isSuperAdmin = admin.role_id === null;

    // Fetch role name if not superadmin
    let roleName = null;
    if (!isSuperAdmin && admin.role_id) {
      const [roleRows] = await pool.query('SELECT name FROM roles WHERE id = ?', [admin.role_id]);
      if (roleRows.length > 0) roleName = roleRows[0].name;
    }

    // Fetch permissions
    const permissions = await getRolePermissions(admin.role_id);

    const JWT_SECRET = process.env.JWT_SECRET || 'kemps_secret_key_123';
    const token = jwt.sign(
      {
        adminId:      admin.id,
        username:     admin.username,
        role_id:      admin.role_id,
        isSuperAdmin,
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      ok: true,
      token,
      user: {
        id:          admin.id,
        username:    admin.username,
        name:        admin.name || admin.username,
        role_id:     admin.role_id,
        role_name:   isSuperAdmin ? 'Superadmin' : (roleName || 'Unknown'),
        isSuperAdmin,
      },
      permissions,
      message: 'Login successful!',
    });
  } catch (error) {
    console.error('Error in database login:', error);
    res.status(500).json({ ok: false, error: 'Internal server error.' });
  }
});

// ─────────────────────────────────────────────
// GET /api/auth/users
// ─────────────────────────────────────────────
router.get('/users', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT a.id, a.username, a.name, a.role_id, r.name AS role_name, a.created_at
      FROM admins a
      LEFT JOIN roles r ON a.role_id = r.id
      ORDER BY a.username ASC
    `);
    // Password intentionally excluded from response
    res.json({ ok: true, users: rows });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch users.' });
  }
});

// ─────────────────────────────────────────────
// POST /api/auth/users
// ─────────────────────────────────────────────
router.post('/users', authMiddleware, requireSuperAdmin, async (req, res) => {
  try {
    const { username, password, name, role_id } = req.body;
    const usernameTrimmed = String(username || '').trim();
    const nameTrimmed    = String(name || '').trim();

    if (!usernameTrimmed || !password) {
      return res.status(400).json({ ok: false, error: 'Username and password are required.' });
    }

    const [existing] = await pool.query('SELECT id FROM admins WHERE username = ?', [usernameTrimmed]);
    if (existing.length > 0) {
      return res.status(400).json({ ok: false, error: 'Username already exists.' });
    }

    // Validate role_id (required for non-superadmin users created via this endpoint)
    if (role_id) {
      const [roleCheck] = await pool.query('SELECT id FROM roles WHERE id = ?', [role_id]);
      if (roleCheck.length === 0) {
        return res.status(400).json({ ok: false, error: 'Invalid role selected.' });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO admins (username, password, name, role_id) VALUES (?, ?, ?, ?)',
      [usernameTrimmed, hashedPassword, nameTrimmed, role_id || null]
    );

    res.json({ ok: true, message: 'User created successfully!', userId: result.insertId });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ ok: false, error: 'Failed to create user.' });
  }
});

// ─────────────────────────────────────────────
// PUT /api/auth/users/:id
// ─────────────────────────────────────────────
router.put('/users/:id', authMiddleware, requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { username, password, name, role_id } = req.body;
    const usernameTrimmed = String(username || '').trim();
    const nameTrimmed    = String(name || '').trim();

    if (!usernameTrimmed) {
      return res.status(400).json({ ok: false, error: 'Username is required.' });
    }

    const [existing] = await pool.query('SELECT id FROM admins WHERE username = ? AND id != ?', [usernameTrimmed, id]);
    if (existing.length > 0) {
      return res.status(400).json({ ok: false, error: 'Username already exists.' });
    }

    if (role_id) {
      const [roleCheck] = await pool.query('SELECT id FROM roles WHERE id = ?', [role_id]);
      if (roleCheck.length === 0) {
        return res.status(400).json({ ok: false, error: 'Invalid role selected.' });
      }
    }

    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      await pool.query(
        'UPDATE admins SET username = ?, password = ?, name = ?, role_id = ? WHERE id = ?',
        [usernameTrimmed, hashedPassword, nameTrimmed, role_id || null, id]
      );
    } else {
      await pool.query(
        'UPDATE admins SET username = ?, name = ?, role_id = ? WHERE id = ?',
        [usernameTrimmed, nameTrimmed, role_id || null, id]
      );
    }

    res.json({ ok: true, message: 'User updated successfully!' });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ ok: false, error: 'Failed to update user.' });
  }
});

// ─────────────────────────────────────────────
// DELETE /api/auth/users/:id
// ─────────────────────────────────────────────
router.delete('/users/:id', authMiddleware, requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;

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

// ─────────────────────────────────────────────
// POST /api/auth/users/:id/reset-password  (admin only)
// ─────────────────────────────────────────────
router.post('/users/:id/reset-password', authMiddleware, requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 1) {
      return res.status(400).json({ ok: false, error: 'New password is required.' });
    }

    const [userRows] = await pool.query('SELECT id FROM admins WHERE id = ?', [id]);
    if (userRows.length === 0) {
      return res.status(404).json({ ok: false, error: 'User not found.' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE admins SET password = ? WHERE id = ?', [hashedPassword, id]);

    res.json({ ok: true, message: 'Password reset successfully.' });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ ok: false, error: 'Failed to reset password.' });
  }
});

// ─────────────────────────────────────────────
// POST /api/auth/change-password  (any logged-in user)
// ─────────────────────────────────────────────
router.post('/change-password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ ok: false, error: 'Current password and new password are required.' });
    }
    if (newPassword.length < 4) {
      return res.status(400).json({ ok: false, error: 'New password must be at least 4 characters.' });
    }

    const [rows] = await pool.query('SELECT id, password FROM admins WHERE id = ?', [req.admin.adminId]);
    if (rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'User not found.' });
    }

    const user = rows[0];
    let passwordMatch = false;
    if (user.password && (user.password.startsWith('$2a$') || user.password.startsWith('$2b$'))) {
      passwordMatch = await bcrypt.compare(currentPassword, user.password);
    } else {
      passwordMatch = (currentPassword === user.password);
    }

    if (!passwordMatch) {
      return res.status(401).json({ ok: false, error: 'Current password is incorrect.' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE admins SET password = ? WHERE id = ?', [hashedPassword, user.id]);

    res.json({ ok: true, message: 'Password changed successfully. Please log in again.' });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ ok: false, error: 'Failed to change password.' });
  }
});

// ─────────────────────────────────────────────
// GET /api/auth/roles
// ─────────────────────────────────────────────
router.get('/roles', authMiddleware, async (req, res) => {
  try {
    const [roles] = await pool.query(`
      SELECT r.id, r.name, r.description, r.created_at,
             COUNT(DISTINCT rp.id)  AS permission_count,
             COUNT(DISTINCT a.id)   AS user_count
      FROM roles r
      LEFT JOIN role_permissions rp ON rp.role_id = r.id
      LEFT JOIN admins a ON a.role_id = r.id
      GROUP BY r.id
      ORDER BY r.name ASC
    `);
    res.json({ ok: true, roles });
  } catch (error) {
    console.error('Error fetching roles:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch roles.' });
  }
});

// ─────────────────────────────────────────────
// POST /api/auth/roles
// ─────────────────────────────────────────────
router.post('/roles', authMiddleware, requireSuperAdmin, async (req, res) => {
  try {
    const { name, description, permissions } = req.body;
    const nameTrimmed = String(name || '').trim();

    if (!nameTrimmed) {
      return res.status(400).json({ ok: false, error: 'Role name is required.' });
    }

    const [existing] = await pool.query('SELECT id FROM roles WHERE name = ?', [nameTrimmed]);
    if (existing.length > 0) {
      return res.status(400).json({ ok: false, error: 'A role with this name already exists.' });
    }

    const [result] = await pool.query(
      'INSERT INTO roles (name, description) VALUES (?, ?)',
      [nameTrimmed, description || null]
    );
    const roleId = result.insertId;

    // Insert permissions if provided
    if (Array.isArray(permissions) && permissions.length > 0) {
      const values = permissions.map(p => [
        roleId,
        p.module,
        p.can_read   ? 1 : 0,
        p.can_create ? 1 : 0,
        p.can_update ? 1 : 0,
        p.can_delete ? 1 : 0,
      ]);
      await pool.query(
        'INSERT INTO role_permissions (role_id, module, can_read, can_create, can_update, can_delete) VALUES ?',
        [values]
      );
    }

    res.json({ ok: true, message: 'Role created successfully!', roleId });
  } catch (error) {
    console.error('Error creating role:', error);
    res.status(500).json({ ok: false, error: 'Failed to create role.' });
  }
});

// ─────────────────────────────────────────────
// PUT /api/auth/roles/:id
// ─────────────────────────────────────────────
router.put('/roles/:id', authMiddleware, requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, permissions } = req.body;
    const nameTrimmed = String(name || '').trim();

    if (!nameTrimmed) {
      return res.status(400).json({ ok: false, error: 'Role name is required.' });
    }

    const [existing] = await pool.query('SELECT id FROM roles WHERE name = ? AND id != ?', [nameTrimmed, id]);
    if (existing.length > 0) {
      return res.status(400).json({ ok: false, error: 'A role with this name already exists.' });
    }

    await pool.query('UPDATE roles SET name = ?, description = ? WHERE id = ?', [nameTrimmed, description || null, id]);

    // Replace full permission matrix
    if (Array.isArray(permissions)) {
      await pool.query('DELETE FROM role_permissions WHERE role_id = ?', [id]);
      if (permissions.length > 0) {
        const values = permissions.map(p => [
          id,
          p.module,
          p.can_read   ? 1 : 0,
          p.can_create ? 1 : 0,
          p.can_update ? 1 : 0,
          p.can_delete ? 1 : 0,
        ]);
        await pool.query(
          'INSERT INTO role_permissions (role_id, module, can_read, can_create, can_update, can_delete) VALUES ?',
          [values]
        );
      }
    }

    res.json({ ok: true, message: 'Role updated successfully!' });
  } catch (error) {
    console.error('Error updating role:', error);
    res.status(500).json({ ok: false, error: 'Failed to update role.' });
  }
});

// ─────────────────────────────────────────────
// DELETE /api/auth/roles/:id
// ─────────────────────────────────────────────
router.delete('/roles/:id', authMiddleware, requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const [usersOnRole] = await pool.query('SELECT COUNT(*) AS count FROM admins WHERE role_id = ?', [id]);
    if (usersOnRole[0].count > 0) {
      return res.status(400).json({
        ok: false,
        error: `Cannot delete this role. ${usersOnRole[0].count} user(s) are currently assigned to it. Reassign them first.`,
      });
    }

    await pool.query('DELETE FROM roles WHERE id = ?', [id]);
    res.json({ ok: true, message: 'Role deleted successfully!' });
  } catch (error) {
    console.error('Error deleting role:', error);
    res.status(500).json({ ok: false, error: 'Failed to delete role.' });
  }
});

// ─────────────────────────────────────────────
// GET /api/auth/roles/:id/permissions
// ─────────────────────────────────────────────
router.get('/roles/:id/permissions', authMiddleware, requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      'SELECT module, can_read, can_create, can_update, can_delete FROM role_permissions WHERE role_id = ? ORDER BY module ASC',
      [id]
    );
    const permissions = {};
    for (const row of rows) {
      permissions[row.module] = {
        read:   !!row.can_read,
        create: !!row.can_create,
        update: !!row.can_update,
        delete: !!row.can_delete,
      };
    }
    res.json({ ok: true, permissions });
  } catch (error) {
    console.error('Error fetching role permissions:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch role permissions.' });
  }
});

export default router;
