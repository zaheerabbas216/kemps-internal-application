import express from 'express';
import pool from '../config/db.js';

const router = express.Router();

async function generateId(prefix, table, idColumn) {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  // Adjust to IST timezone
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

// GET /api/company-details
// Fetch company details with pagination and search
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
      baseWhere = ' WHERE company_name LIKE ? OR phone_number LIKE ? OR gst_number LIKE ? OR id LIKE ?';
      const wildSearch = `%${search.trim()}%`;
      queryParams = [wildSearch, wildSearch, wildSearch, wildSearch];
      countParams = [wildSearch, wildSearch, wildSearch, wildSearch];
    }
    
    // Get total count
    const [countRows] = await pool.query(
      `SELECT COUNT(*) as count FROM company_details${baseWhere}`,
      countParams
    );
    const total = countRows[0].count;
    
    // Get paginated rows
    queryParams.push(limit, offset);
    const [rows] = await pool.query(
      `SELECT id, company_name, phone_number, gst_number, address, bank_name, account_number, ifsc_code, created_at 
       FROM company_details${baseWhere} 
       ORDER BY created_at DESC 
       LIMIT ? OFFSET ?`,
      queryParams
    );
    
    res.json({
      ok: true,
      companies: rows,
      total,
      page,
      limit
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// GET /api/company-details/:id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      `SELECT id, company_name, phone_number, gst_number, address, bank_name, account_number, ifsc_code, created_at 
       FROM company_details WHERE id = ?`,
      [id]
    );
    if (rows && rows.length > 0) {
      res.json({ ok: true, company: rows[0] });
    } else {
      res.status(404).json({ ok: false, error: 'Company not found' });
    }
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// DELETE /api/company-details/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await pool.query('DELETE FROM company_details WHERE id = ?', [id]);
    if (result.affectedRows > 0) {
      res.json({ ok: true, message: 'Company details deleted successfully!' });
    } else {
      res.status(404).json({ ok: false, error: 'Company not found' });
    }
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// POST /api/company-details
// Save a new company
router.post('/', async (req, res) => {
  try {
    const { companyName, phoneNumber, gstNumber, address, bankName, accountNumber, ifscCode } = req.body;
    
    const companyNameTrimmed = String(companyName || '').trim();
    if (!companyNameTrimmed) {
      throw new Error("Company Name is required.");
    }
    
    const id = await generateId('COMP', 'company_details', 'id');
    
    await pool.query(
      `INSERT INTO company_details (id, company_name, phone_number, gst_number, address, bank_name, account_number, ifsc_code, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        id, 
        companyNameTrimmed, 
        String(phoneNumber || '').trim(), 
        String(gstNumber || '').trim(), 
        String(address || '').trim(),
        String(bankName || '').trim(), 
        String(accountNumber || '').trim(), 
        String(ifscCode || '').trim()
      ]
    );
    
    res.json({ ok: true, id, message: 'Company details saved successfully!' });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// PUT /api/company-details/:id
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { companyName, phoneNumber, gstNumber, address, bankName, accountNumber, ifscCode } = req.body;
    
    const companyNameTrimmed = String(companyName || '').trim();
    if (!companyNameTrimmed) {
      throw new Error("Company Name is required.");
    }
    
    const [existing] = await pool.query('SELECT * FROM company_details WHERE id = ?', [id]);
    if (!existing || existing.length === 0) {
      throw new Error("Company not found.");
    }
    
    await pool.query(
      `UPDATE company_details SET 
        company_name = ?, 
        phone_number = ?, 
        gst_number = ?, 
        address = ?,
        bank_name = ?, 
        account_number = ?, 
        ifsc_code = ? 
       WHERE id = ?`,
      [
        companyNameTrimmed, 
        String(phoneNumber || '').trim(), 
        String(gstNumber || '').trim(), 
        String(address || '').trim(),
        String(bankName || '').trim(), 
        String(accountNumber || '').trim(), 
        String(ifscCode || '').trim(),
        id
      ]
    );
    
    res.json({ ok: true, message: 'Company details updated successfully!' });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

export default router;
