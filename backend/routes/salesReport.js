import express from 'express';
import pool from '../config/db.js';

const router = express.Router();

// Helper: IST date string
function getISTDateStr() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const ist = new Date(now.getTime() + (330 + offset) * 60000);
  const yyyy = ist.getFullYear();
  const mm = String(ist.getMonth() + 1).padStart(2, '0');
  const dd = String(ist.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Helper: build date + company where clause
function buildWhereClause(startDate, endDate, company, tableAlias = 'cb') {
  const clauses = [];
  const params = [];
  if (startDate) { clauses.push(`${tableAlias}.billing_date >= ?`); params.push(startDate); }
  if (endDate)   { clauses.push(`${tableAlias}.billing_date <= ?`); params.push(endDate); }
  if (company && company !== 'All') { clauses.push(`${tableAlias}.company = ?`); params.push(company); }
  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

// ─────────────────────────────────────────────────────────────────
// GET /api/sales-report/kpi
// Returns top-level KPI cards for a date range + company filter
// ─────────────────────────────────────────────────────────────────
router.get('/kpi', async (req, res) => {
  try {
    const { startDate, endDate, company } = req.query;
    const { where, params } = buildWhereClause(startDate, endDate, company);

    const [rows] = await pool.query(
      `SELECT
         COALESCE(SUM(grand_total), 0)   AS totalSales,
         COALESCE(SUM(amount_paid), 0)   AS totalCollection,
         COALESCE(SUM(due_amount), 0)    AS totalCredit,
         COALESCE(SUM(CASE WHEN payment_status = 'Approved' THEN cash_paid ELSE 0 END), 0)     AS cashCollection,
         COALESCE(SUM(CASE WHEN payment_status = 'Approved' THEN upi_paid ELSE 0 END), 0)      AS upiCollection,
         COALESCE(SUM(CASE WHEN payment_status = 'Approved' THEN bank_paid ELSE 0 END), 0)     AS bankCollection,
         COUNT(*)                         AS totalInvoices,
         COUNT(DISTINCT customer_phone)  AS uniqueCustomers
       FROM customer_bills cb
       ${where}`,
      params
    );

    // Company breakdown
    const [companyRows] = await pool.query(
      `SELECT company,
         COALESCE(SUM(grand_total), 0) AS sales,
         COALESCE(SUM(amount_paid), 0) AS collected,
         COALESCE(SUM(due_amount), 0)  AS credit,
         COUNT(*) AS invoices
       FROM customer_bills cb
       ${where}
       GROUP BY company
       ORDER BY sales DESC`,
      params
    );

    res.json({ ok: true, kpi: rows[0], companies: companyRows });
  } catch (err) {
    console.error('Sales KPI error:', err);
    res.status(400).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/sales-report/monthly-trend
// Returns monthly sales for a given year + company filter
// ─────────────────────────────────────────────────────────────────
router.get('/monthly-trend', async (req, res) => {
  try {
    const { year, company } = req.query;
    const targetYear = year || new Date().getFullYear();

    const clauses = [`YEAR(cb.billing_date) = ?`];
    const params = [targetYear];
    if (company && company !== 'All') { clauses.push(`cb.company = ?`); params.push(company); }

    const [rows] = await pool.query(
      `SELECT
         MONTH(billing_date) AS month,
         MONTHNAME(billing_date) AS month_name,
         COALESCE(SUM(grand_total), 0)  AS totalSales,
         COALESCE(SUM(amount_paid), 0)  AS totalCollection,
         COALESCE(SUM(due_amount), 0)   AS totalCredit,
         COUNT(*) AS invoices
       FROM customer_bills cb
       WHERE ${clauses.join(' AND ')}
       GROUP BY MONTH(billing_date), MONTHNAME(billing_date)
       ORDER BY month ASC`,
      params
    );

    // Fill in all 12 months
    const allMonths = [
      'January','February','March','April','May','June',
      'July','August','September','October','November','December'
    ];
    const monthMap = {};
    rows.forEach(r => { monthMap[r.month] = r; });
    const trend = allMonths.map((name, idx) => {
      const m = idx + 1;
      return monthMap[m] || { month: m, month_name: name, totalSales: 0, totalCollection: 0, totalCredit: 0, invoices: 0 };
    });

    res.json({ ok: true, trend, year: targetYear });
  } catch (err) {
    console.error('Monthly trend error:', err);
    res.status(400).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/sales-report/product-wise
// Top products by quantity sold and revenue (Finished Products only)
// ─────────────────────────────────────────────────────────────────
router.get('/product-wise', async (req, res) => {
  try {
    const { startDate, endDate, company, limit = 10 } = req.query;

    const clauses = [];
    const params = [];
    if (startDate) { clauses.push(`cb.billing_date >= ?`); params.push(startDate); }
    if (endDate)   { clauses.push(`cb.billing_date <= ?`); params.push(endDate); }
    if (company && company !== 'All') { clauses.push(`cb.company = ?`); params.push(company); }

    const where = clauses.length ? `AND ${clauses.join(' AND ')}` : '';

    const [rows] = await pool.query(
      `SELECT
         fp.name AS product_name,
         COALESCE(SUM(cbi.quantity), 0)      AS totalQty,
         COALESCE(SUM(cbi.total_amount), 0)  AS totalRevenue,
         COUNT(DISTINCT cbi.bill_id)          AS invoiceCount,
         ROUND(AVG(cbi.rate_with_tax), 2)    AS avgRate
       FROM customer_bill_items cbi
       JOIN finished_products fp ON cbi.finished_product_id = fp.id
       JOIN customer_bills cb ON cbi.bill_id = cb.id
       WHERE 1=1 ${where}
       GROUP BY fp.id, fp.name
       ORDER BY totalRevenue DESC
       LIMIT ?`,
      [...params, parseInt(limit, 10)]
    );

    res.json({ ok: true, products: rows });
  } catch (err) {
    console.error('Product-wise error:', err);
    res.status(400).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/sales-report/customer-wise
// Customer-wise sales summary with drill-down capability
// ─────────────────────────────────────────────────────────────────
router.get('/customer-wise', async (req, res) => {
  try {
    let { startDate, endDate, company, page = 1, limit = 20, search = '' } = req.query;
    page = parseInt(page, 10);
    limit = parseInt(limit, 10);
    const offset = (page - 1) * limit;

    const clauses = [];
    const params = [];
    if (startDate) { clauses.push(`cb.billing_date >= ?`); params.push(startDate); }
    if (endDate)   { clauses.push(`cb.billing_date <= ?`); params.push(endDate); }
    if (company && company !== 'All') { clauses.push(`cb.company = ?`); params.push(company); }
    if (search.trim()) {
      clauses.push(`(cb.customer_name LIKE ? OR cb.customer_phone LIKE ?)`);
      const w = `%${search.trim()}%`;
      params.push(w, w);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    const [countRows] = await pool.query(
      `SELECT COUNT(DISTINCT customer_phone) AS cnt FROM customer_bills cb ${where}`,
      params
    );

    const [rows] = await pool.query(
      `SELECT
         cb.customer_name,
         cb.customer_phone,
         COALESCE(SUM(cb.grand_total), 0)  AS totalSales,
         COALESCE(SUM(cb.amount_paid), 0)  AS totalPaid,
         COALESCE(SUM(cb.due_amount), 0)   AS totalDue,
         COUNT(cb.id)                       AS invoiceCount,
         MAX(cb.billing_date)              AS lastPurchase
       FROM customer_bills cb
       ${where}
       GROUP BY cb.customer_phone, cb.customer_name
       ORDER BY totalSales DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({ ok: true, customers: rows, total: countRows[0].cnt, page, limit });
  } catch (err) {
    console.error('Customer-wise error:', err);
    res.status(400).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/sales-report/customer-invoices/:phone
// All invoices for a specific customer (drill-down)
// ─────────────────────────────────────────────────────────────────
router.get('/customer-invoices/:phone', async (req, res) => {
  try {
    const { phone } = req.params;
    const { startDate, endDate, company } = req.query;

    const clauses = [`cb.customer_phone = ?`];
    const params = [phone];
    if (startDate) { clauses.push(`cb.billing_date >= ?`); params.push(startDate); }
    if (endDate)   { clauses.push(`cb.billing_date <= ?`); params.push(endDate); }
    if (company && company !== 'All') { clauses.push(`cb.company = ?`); params.push(company); }

    const [rows] = await pool.query(
      `SELECT
         cb.id,
         DATE_FORMAT(cb.billing_date, '%Y-%m-%d') AS billing_date,
         cb.company,
         cb.grand_total,
         cb.amount_paid,
         cb.due_amount,
         cb.payment_mode,
         cb.customer_name
       FROM customer_bills cb
       WHERE ${clauses.join(' AND ')}
       ORDER BY cb.billing_date DESC, cb.created_at DESC`,
      params
    );

    res.json({ ok: true, invoices: rows });
  } catch (err) {
    console.error('Customer invoices error:', err);
    res.status(400).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/sales-report/collection
// Payment mode breakdown (Cash / UPI / Bank / Credit)
// ─────────────────────────────────────────────────────────────────
router.get('/collection', async (req, res) => {
  try {
    const { startDate, endDate, company } = req.query;
    const { where, params } = buildWhereClause(startDate, endDate, company);

    const [rows] = await pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN payment_status = 'Approved' THEN cash_paid ELSE 0 END), 0)   AS cashTotal,
         COALESCE(SUM(CASE WHEN payment_status = 'Approved' THEN upi_paid ELSE 0 END), 0)    AS upiTotal,
         COALESCE(SUM(CASE WHEN payment_status = 'Approved' THEN bank_paid ELSE 0 END), 0)   AS bankTotal,
         COALESCE(SUM(due_amount), 0)  AS creditTotal,
         COALESCE(SUM(amount_paid), 0) AS totalCollected,
         COALESCE(SUM(grand_total), 0) AS grandTotal
       FROM customer_bills cb
       ${where}`,
      params
    );

    // Daily collection trend (for sparkline)
    const [dailyRows] = await pool.query(
      `SELECT
         DATE_FORMAT(billing_date, '%Y-%m-%d') AS date,
         COALESCE(SUM(grand_total), 0)  AS sales,
         COALESCE(SUM(amount_paid), 0)  AS collected,
         COALESCE(SUM(CASE WHEN payment_status = 'Approved' THEN cash_paid ELSE 0 END), 0)    AS cash,
         COALESCE(SUM(CASE WHEN payment_status = 'Approved' THEN upi_paid ELSE 0 END), 0)     AS upi,
         COALESCE(SUM(CASE WHEN payment_status = 'Approved' THEN bank_paid ELSE 0 END), 0)    AS bank
       FROM customer_bills cb
       ${where}
       GROUP BY DATE_FORMAT(billing_date, '%Y-%m-%d')
       ORDER BY date ASC`,
      params
    );

    res.json({ ok: true, collection: rows[0], daily: dailyRows });
  } catch (err) {
    console.error('Collection error:', err);
    res.status(400).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/sales-report/company-comparison
// Side-by-side company comparison for a date range
// ─────────────────────────────────────────────────────────────────
router.get('/company-comparison', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const clauses = [];
    const params = [];
    if (startDate) { clauses.push(`billing_date >= ?`); params.push(startDate); }
    if (endDate)   { clauses.push(`billing_date <= ?`); params.push(endDate); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    const [rows] = await pool.query(
      `SELECT
         company,
         COALESCE(SUM(grand_total), 0)  AS sales,
         COALESCE(SUM(amount_paid), 0)  AS collected,
         COALESCE(SUM(due_amount), 0)   AS credit,
         COALESCE(SUM(cash_paid), 0)    AS cash,
         COALESCE(SUM(upi_paid), 0)     AS upi,
         COALESCE(SUM(bank_paid), 0)    AS bank,
         COUNT(*)                        AS invoices,
         COUNT(DISTINCT customer_phone) AS customers
       FROM customer_bills
       ${where}
       GROUP BY company
       ORDER BY sales DESC`,
      params
    );

    // Monthly comparison per company for the current year
    const yr = startDate ? startDate.substring(0, 4) : new Date().getFullYear();
    const [monthly] = await pool.query(
      `SELECT
         company,
         MONTH(billing_date) AS month,
         COALESCE(SUM(grand_total), 0) AS sales
       FROM customer_bills
       WHERE YEAR(billing_date) = ?
       GROUP BY company, MONTH(billing_date)
       ORDER BY company, month`,
      [yr]
    );

    res.json({ ok: true, companies: rows, monthly });
  } catch (err) {
    console.error('Company comparison error:', err);
    res.status(400).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/sales-report/top-customers
// Top N customers by total sales
// ─────────────────────────────────────────────────────────────────
router.get('/top-customers', async (req, res) => {
  try {
    const { startDate, endDate, company, limit = 10 } = req.query;
    const { where, params } = buildWhereClause(startDate, endDate, company);

    const [rows] = await pool.query(
      `SELECT
         cb.customer_name,
         cb.customer_phone,
         COALESCE(SUM(cb.grand_total), 0) AS totalSales,
         COALESCE(SUM(cb.amount_paid), 0) AS totalPaid,
         COALESCE(SUM(cb.due_amount), 0)  AS totalDue,
         COUNT(cb.id) AS invoiceCount
       FROM customer_bills cb
       ${where}
       GROUP BY cb.customer_phone, cb.customer_name
       ORDER BY totalSales DESC
       LIMIT ?`,
      [...params, parseInt(limit, 10)]
    );

    res.json({ ok: true, customers: rows });
  } catch (err) {
    console.error('Top customers error:', err);
    res.status(400).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/sales-report/daily-sales
// Day-by-day sales for a date range (for sparklines/bar charts)
// ─────────────────────────────────────────────────────────────────
router.get('/daily-sales', async (req, res) => {
  try {
    const { startDate, endDate, company } = req.query;
    const { where, params } = buildWhereClause(startDate, endDate, company);

    const [rows] = await pool.query(
      `SELECT
         DATE_FORMAT(billing_date, '%Y-%m-%d') AS date,
         COALESCE(SUM(grand_total), 0)  AS sales,
         COALESCE(SUM(amount_paid), 0)  AS collected,
         COALESCE(SUM(due_amount), 0)   AS credit,
         COUNT(*) AS invoices
       FROM customer_bills cb
       ${where}
       GROUP BY DATE_FORMAT(billing_date, '%Y-%m-%d')
       ORDER BY date ASC`,
      params
    );

    res.json({ ok: true, daily: rows });
  } catch (err) {
    console.error('Daily sales error:', err);
    res.status(400).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/sales-report/available-companies
// Distinct companies from billing
// ─────────────────────────────────────────────────────────────────
router.get('/available-companies', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT DISTINCT company FROM customer_bills WHERE company IS NOT NULL AND company != '' ORDER BY company`
    );
    res.json({ ok: true, companies: rows.map(r => r.company) });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

export default router;
