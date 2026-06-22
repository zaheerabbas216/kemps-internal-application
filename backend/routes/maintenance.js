import express from 'express';
import pool from '../config/db.js';

const router = express.Router();

// Helper to generate custom sequence ID (e.g. MNT-2026-00001)
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

// GET /api/maintenance/today
// Returns today's logged service records, aggregates, and filters if search is provided
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

    // Get today's count (overall, ignore search filters for the absolute aggregate summary)
    const [summaryRows] = await pool.query(
      `SELECT COUNT(*) as totalCount FROM maintenance_records WHERE service_date = ?`,
      [todayStr]
    );
    const todayCount = parseInt(summaryRows[0].totalCount, 10);

    let queryParams = [todayStr];
    let whereClause = 'WHERE service_date = ?';

    if (search.trim()) {
      whereClause += ' AND (particular LIKE ? OR sub_detail LIKE ? OR company LIKE ? OR entered_by LIKE ? OR id LIKE ? OR note LIKE ?)';
      const wildSearch = `%${search.trim()}%`;
      queryParams.push(wildSearch, wildSearch, wildSearch, wildSearch, wildSearch, wildSearch);
    }

    const [rows] = await pool.query(
      `SELECT id, particular, sub_detail, company, 
              DATE_FORMAT(service_date, '%Y-%m-%d') as service_date, 
              DATE_FORMAT(next_due_date, '%Y-%m-%d') as next_due_date, 
              note, entered_by, created_at 
       FROM maintenance_records 
       ${whereClause} 
       ORDER BY created_at DESC`,
      queryParams
    );

    res.json({
      ok: true,
      records: rows,
      todayStr,
      summary: {
        totalCount: todayCount
      }
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// GET /api/maintenance/history
// Returns paginated service records with filters
router.get('/history', async (req, res) => {
  try {
    let { page = 1, limit = 10, search = '', startDate = '', endDate = '', particular = '' } = req.query;
    page = parseInt(page, 10);
    limit = parseInt(limit, 10);
    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1) limit = 10;

    const offset = (page - 1) * limit;
    let queryParams = [];
    let whereClauses = [];

    if (startDate) {
      whereClauses.push('service_date >= ?');
      queryParams.push(startDate);
    }
    if (endDate) {
      whereClauses.push('service_date <= ?');
      queryParams.push(endDate);
    }
    if (particular) {
      whereClauses.push('particular = ?');
      queryParams.push(particular);
    }
    if (search.trim()) {
      whereClauses.push('(particular LIKE ? OR sub_detail LIKE ? OR company LIKE ? OR entered_by LIKE ? OR id LIKE ? OR note LIKE ?)');
      const wildSearch = `%${search.trim()}%`;
      queryParams.push(wildSearch, wildSearch, wildSearch, wildSearch, wildSearch, wildSearch);
    }

    const whereClauseStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Get count
    const [countRows] = await pool.query(
      `SELECT COUNT(*) as count FROM maintenance_records ${whereClauseStr}`,
      queryParams
    );
    const total = countRows[0].count;

    // Get rows
    let listParams = [...queryParams, limit, offset];
    const [rows] = await pool.query(
      `SELECT id, particular, sub_detail, company, 
              DATE_FORMAT(service_date, '%Y-%m-%d') as service_date, 
              DATE_FORMAT(next_due_date, '%Y-%m-%d') as next_due_date, 
              note, entered_by, created_at 
       FROM maintenance_records 
       ${whereClauseStr} 
       ORDER BY service_date DESC, created_at DESC 
       LIMIT ? OFFSET ?`,
      listParams
    );

    res.json({
      ok: true,
      records: rows,
      total,
      page,
      limit
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// POST /api/maintenance
// Create new service record
router.post('/', async (req, res) => {
  try {
    const { particular, subDetail, company, serviceDate, nextDueDate, note, enteredBy } = req.body;
    
    const particularTrimmed = String(particular || '').trim();
    const subDetailTrimmed = String(subDetail || '').trim();
    const companyTrimmed = String(company || '').trim();
    const enteredByTrimmed = String(enteredBy || '').trim();

    if (!particularTrimmed) throw new Error('Particular service type is required.');
    if (!serviceDate) throw new Error('Service date is required.');
    if (!enteredByTrimmed) throw new Error('Name (Entered By) is required.');

    const id = await generateId('MNT', 'maintenance_records', 'id');

    await pool.query(
      `INSERT INTO maintenance_records (id, particular, sub_detail, company, service_date, next_due_date, note, entered_by, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        id, 
        particularTrimmed, 
        subDetailTrimmed || null, 
        companyTrimmed || null, 
        serviceDate, 
        nextDueDate || null, 
        String(note || '').trim() || null, 
        enteredByTrimmed
      ]
    );

    res.json({ ok: true, id, message: 'Maintenance record saved successfully!' });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// PUT /api/maintenance/:id
// Update service record
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { particular, subDetail, company, serviceDate, nextDueDate, note, enteredBy } = req.body;

    const [existing] = await pool.query('SELECT * FROM maintenance_records WHERE id = ?', [id]);
    if (existing.length === 0) throw new Error('Maintenance record not found.');

    const updates = [];
    const values = [];

    if (particular !== undefined) {
      const particularTrimmed = String(particular || '').trim();
      if (!particularTrimmed) throw new Error('Particular type cannot be empty.');
      updates.push('particular = ?');
      values.push(particularTrimmed);
    }
    if (subDetail !== undefined) {
      updates.push('sub_detail = ?');
      values.push(String(subDetail || '').trim() || null);
    }
    if (company !== undefined) {
      updates.push('company = ?');
      values.push(String(company || '').trim() || null);
    }
    if (serviceDate !== undefined) {
      if (!serviceDate) throw new Error('Service date cannot be empty.');
      updates.push('service_date = ?');
      values.push(serviceDate);
    }
    if (nextDueDate !== undefined) {
      updates.push('next_due_date = ?');
      values.push(nextDueDate || null);
    }
    if (note !== undefined) {
      updates.push('note = ?');
      values.push(String(note || '').trim() || null);
    }
    if (enteredBy !== undefined) {
      const enteredByTrimmed = String(enteredBy || '').trim();
      if (!enteredByTrimmed) throw new Error('Entered By name cannot be empty.');
      updates.push('entered_by = ?');
      values.push(enteredByTrimmed);
    }

    if (updates.length > 0) {
      values.push(id);
      await pool.query(`UPDATE maintenance_records SET ${updates.join(', ')} WHERE id = ?`, values);
    }

    res.json({ ok: true, message: 'Maintenance record updated successfully!' });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// DELETE /api/maintenance/:id
// Delete service record
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await pool.query('DELETE FROM maintenance_records WHERE id = ?', [id]);
    if (result.affectedRows === 0) throw new Error('Maintenance record not found.');
    
    res.json({ ok: true, message: 'Maintenance record deleted successfully!' });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

export default router;
