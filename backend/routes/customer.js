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

async function generateId(prefix, table, idColumn) {
  // Pattern: CUST-YYYY-XXXXX
  const now = new Date();
  const offset = now.getTimezoneOffset();
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

// Check if phone exists (internal)
async function checkPhoneExists(phone, excludeId = null) {
  const [rows] = await pool.query(`SELECT id, phone FROM customers WHERE phone = ?`, [phone]);
  if (!rows || rows.length === 0) return false;
  if (excludeId && rows[0].id === excludeId) return false;
  return true;
}

// GET /api/customers?phone=9876543210
router.get('/', async (req, res) => {
  try {
    const { phone } = req.query;
    if (phone) {
      const ph = normalizePhone10(phone);
      const [rows] = await pool.query(`SELECT * FROM customers WHERE phone = ?`, [ph]);
      if (rows && rows.length > 0) {
        // Return exactly what frontend expects
        const r = rows[0];
        return res.json({
          exists: true,
          customer: {
            id: r.id,
            name: r.name,
            phone: r.phone,
            gst: r.gstin || '',
            address: r.address || ''
          }
        });
      } else {
        return res.json({ exists: false });
      }
    }
    
    // Get all customers (if needed)
    const [rows] = await pool.query(`SELECT id, name, phone, gstin as gst, address, created_at FROM customers ORDER BY created_at DESC`);
    res.json({ customers: rows });
  } catch (error) {
    res.status(400).json({ ok: false, exists: false, error: error.message });
  }
});

// POST /api/customers
router.post('/', async (req, res) => {
  try {
    const { name, phone: rawPhone, gst, address } = req.body;
    const nameTrimmed = String(name || '').trim();
    if (!nameTrimmed) throw new Error("Name is required.");
    
    const phone = normalizePhone10(rawPhone);
    const exists = await checkPhoneExists(phone);
    if (exists) throw new Error("Phone number exists!");
    
    const id = await generateId('CUST', 'customers', 'id');
    
    await pool.query(
      `INSERT INTO customers (id, name, phone, gstin, address, created_at) VALUES (?, ?, ?, ?, ?, NOW())`,
      [id, nameTrimmed, phone, String(gst || '').trim(), String(address || '').trim()]
    );
    
    res.json({ ok: true, id });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// PUT /api/customers/:id
router.put('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) throw new Error("Missing customer ID.");
    
    const { name, phone: rawPhone, gst, address } = req.body;
    
    // Check if customer exists
    const [existing] = await pool.query('SELECT * FROM customers WHERE id = ?', [id]);
    if (!existing || existing.length === 0) throw new Error("Customer not found.");
    
    const updates = [];
    const values = [];
    
    if (name !== undefined) {
      updates.push('name = ?');
      values.push(String(name).trim());
    }
    
    if (rawPhone !== undefined) {
      const phone = normalizePhone10(rawPhone);
      const exists = await checkPhoneExists(phone, id);
      if (exists) throw new Error("Phone number exists!");
      updates.push('phone = ?');
      values.push(phone);
    }
    
    if (gst !== undefined) {
      updates.push('gstin = ?');
      values.push(String(gst).trim());
    }
    
    if (address !== undefined) {
      updates.push('address = ?');
      values.push(String(address).trim());
    }
    
    if (updates.length > 0) {
      values.push(id);
      await pool.query(`UPDATE customers SET ${updates.join(', ')} WHERE id = ?`, values);
    }
    
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// DELETE /api/customers/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await pool.query('DELETE FROM customers WHERE id = ?', [id]);
    if (result.affectedRows === 0) throw new Error("Customer not found.");
    res.json({ ok: true, message: 'Customer deleted successfully' });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

export default router;
