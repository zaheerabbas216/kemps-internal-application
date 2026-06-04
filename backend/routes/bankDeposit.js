import express from 'express';
import pool from '../config/db.js';

const router = express.Router();

// Generate custom business IDs: e.g. DEP-2026-00001
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

// GET /api/bank-deposits - Get all deposits with search filter
router.get('/', async (req, res) => {
  try {
    const { search = '' } = req.query;
    
    let baseQuery = 'SELECT id, deposit_date, bank_name, account_number, amount, notes, created_at FROM bank_deposits';
    let queryParams = [];
    
    if (search.trim()) {
      baseQuery += ' WHERE id LIKE ? OR bank_name LIKE ? OR account_number LIKE ? OR notes LIKE ?';
      const searchWild = `%${search.trim()}%`;
      queryParams = [searchWild, searchWild, searchWild, searchWild];
    }
    
    baseQuery += ' ORDER BY deposit_date DESC, created_at DESC';
    
    const [rows] = await pool.query(baseQuery, queryParams);
    
    res.json({
      ok: true,
      deposits: rows
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// POST /api/bank-deposits - Record a new deposit
router.post('/', async (req, res) => {
  try {
    const { depositDate, bankName, accountNumber, amount, notes } = req.body;
    
    const bankNameTrimmed = String(bankName || '').trim();
    const accountNumberTrimmed = String(accountNumber || '').trim();
    const dateTrimmed = String(depositDate || '').trim();
    const parsedAmount = parseFloat(amount);
    
    if (!dateTrimmed) {
      throw new Error('Deposit Date is required.');
    }
    if (!bankNameTrimmed) {
      throw new Error('Bank Name is required.');
    }
    if (!accountNumberTrimmed) {
      throw new Error('Account Number is required.');
    }
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      throw new Error('Valid deposit amount greater than 0 is required.');
    }
    
    const id = await generateId('DEP', 'bank_deposits', 'id');
    
    await pool.query(
      `INSERT INTO bank_deposits (id, deposit_date, bank_name, account_number, amount, notes, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [
        id,
        dateTrimmed,
        bankNameTrimmed,
        accountNumberTrimmed,
        parsedAmount,
        String(notes || '').trim()
      ]
    );
    
    res.json({
      ok: true,
      id,
      message: 'Bank deposit recorded successfully!'
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// GET /api/bank-deposits/accounts - Get all bank accounts mapping
router.get('/accounts', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, bank_name, account_number, ifsc_code, created_at FROM bank_accounts ORDER BY bank_name ASC'
    );
    res.json({
      ok: true,
      accounts: rows
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// POST /api/bank-deposits/accounts - Create a new bank account mapping
router.post('/accounts', async (req, res) => {
  try {
    const { bankName, accountNumber, ifscCode } = req.body;
    
    const bankNameTrimmed = String(bankName || '').trim();
    const accountNumberTrimmed = String(accountNumber || '').trim();
    const ifscTrimmed = String(ifscCode || '').trim();
    
    if (!bankNameTrimmed) {
      throw new Error('Bank Name is required.');
    }
    if (!accountNumberTrimmed) {
      throw new Error('Account Number is required.');
    }
    
    // Check if account already exists
    const [existing] = await pool.query(
      'SELECT id FROM bank_accounts WHERE account_number = ?',
      [accountNumberTrimmed]
    );
    
    if (existing && existing.length > 0) {
      throw new Error(`Bank Account Number ${accountNumberTrimmed} is already registered.`);
    }
    
    const [result] = await pool.query(
      'INSERT INTO bank_accounts (bank_name, account_number, ifsc_code) VALUES (?, ?, ?)',
      [bankNameTrimmed, accountNumberTrimmed, ifscTrimmed]
    );
    
    res.json({
      ok: true,
      id: result.insertId,
      message: 'Bank account added successfully!'
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

export default router;
