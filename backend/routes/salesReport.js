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

    let canSales = 0;
    let canCollection = 0;
    let canCredit = 0;
    let canInvoices = 0;
    let canCashCollection = 0;
    let canUpiCollection = 0;
    let canBankCollection = 0;
    let canCustomerPhones = [];

    const isKempannavar = !company || company === 'All' || company === 'Kempannavar Industries';

    if (isKempannavar) {
      const billingClauses = [];
      const billingParams = [];
      if (startDate) { billingClauses.push(`cab.date >= ?`); billingParams.push(startDate); }
      if (endDate)   { billingClauses.push(`cab.date <= ?`); billingParams.push(endDate); }
      const billingWhere = billingClauses.length ? `WHERE ${billingClauses.join(' AND ')}` : '';

      const [canBillRows] = await pool.query(
        `SELECT 
           COALESCE(SUM(cab.grand_total), 0) AS sales,
           COALESCE(SUM(cab.grand_total - cab.amount_paid), 0) AS credit,
           COUNT(*) AS invoices
         FROM can_billing cab
         ${billingWhere}`,
        billingParams
      );
      
      const [canBillPhones] = await pool.query(
        `SELECT DISTINCT c.phone 
         FROM can_billing cab
         JOIN customers c ON cab.customer_id = c.id
         ${billingWhere}`,
        billingParams
      );
      canCustomerPhones = canBillPhones.map(r => r.phone);

      const penaltyClauses = [];
      const penaltyParams = [];
      if (startDate) { penaltyClauses.push(`transaction_date >= ?`); penaltyParams.push(startDate); }
      if (endDate)   { penaltyClauses.push(`transaction_date <= ?`); penaltyParams.push(endDate); }
      penaltyClauses.push(`type = 'RETURN' AND notes LIKE '%Damaged%'`);
      const penaltyWhere = `WHERE ${penaltyClauses.join(' AND ')}`;
      const [canPenaltyRows] = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS penaltySales
         FROM can_supply_transactions
         ${penaltyWhere}`,
        penaltyParams
      );

      canSales = parseFloat(canBillRows[0].sales) + parseFloat(canPenaltyRows[0].penaltySales);
      canCredit = parseFloat(canBillRows[0].credit);
      canInvoices = parseInt(canBillRows[0].invoices, 10);

      const paymentClauses = [`cp.payment_status = 'Approved'`];
      const paymentParams = [];
      if (startDate) { paymentClauses.push(`cp.payment_date >= ?`); paymentParams.push(startDate); }
      if (endDate)   { paymentClauses.push(`cp.payment_date <= ?`); paymentParams.push(endDate); }
      const paymentWhere = `WHERE ${paymentClauses.join(' AND ')}`;
      
      const [canPaymentRows] = await pool.query(
        `SELECT 
           COALESCE(SUM(CASE WHEN cp.payment_method = 'Cash' THEN cp.amount_paid ELSE 0 END), 0) AS cashColl,
           COALESCE(SUM(CASE WHEN cp.payment_method = 'UPI' THEN cp.amount_paid ELSE 0 END), 0) AS upiColl,
           COALESCE(SUM(CASE WHEN cp.payment_method = 'Bank' THEN cp.amount_paid ELSE 0 END), 0) AS bankColl,
           COALESCE(SUM(cp.amount_paid), 0) AS totalColl
         FROM can_payments cp
         ${paymentWhere}`,
        paymentParams
      );

      canCashCollection = parseFloat(canPaymentRows[0].cashColl);
      canUpiCollection = parseFloat(canPaymentRows[0].upiColl);
      canBankCollection = parseFloat(canPaymentRows[0].bankColl);
      canCollection = parseFloat(canPaymentRows[0].totalColl);
    }

    const [cbPhones] = await pool.query(
      `SELECT DISTINCT customer_phone FROM customer_bills cb ${where}`,
      params
    );
    const cbPhoneList = cbPhones.map(r => r.customer_phone);
    const allPhones = new Set([...cbPhoneList, ...canCustomerPhones]);

    const kpi = {
      totalSales: parseFloat(rows[0].totalSales) + canSales,
      totalCollection: parseFloat(rows[0].totalCollection) + canCollection,
      totalCredit: parseFloat(rows[0].totalCredit) + canCredit,
      cashCollection: parseFloat(rows[0].cashCollection) + canCashCollection,
      upiCollection: parseFloat(rows[0].upiCollection) + canUpiCollection,
      bankCollection: parseFloat(rows[0].bankCollection) + canBankCollection,
      totalInvoices: parseInt(rows[0].totalInvoices, 10) + canInvoices,
      uniqueCustomers: allPhones.size
    };

    // Approved expenses for the selected date range
    const expClauses = [`payment_status = 'Approved'`];
    const expParams = [];
    if (startDate) { expClauses.push(`expense_date >= ?`); expParams.push(startDate); }
    if (endDate)   { expClauses.push(`expense_date <= ?`); expParams.push(endDate); }
    const [expRows] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS totalExpenses FROM expenses WHERE ${expClauses.join(' AND ')}`,
      expParams
    );
    kpi.totalExpenses = parseFloat(expRows[0].totalExpenses) || 0;

    // Supplier Payments for selected date range & company filter (from supplier_payments and inventory_bills)
    let totalSpInstalments = 0;
    try {
      const spClauses = [`(sp.payment_status = 'Approved' OR sp.payment_status IS NULL)`];
      const spParams = [];
      if (startDate) { spClauses.push(`sp.payment_date >= ?`); spParams.push(startDate); }
      if (endDate)   { spClauses.push(`sp.payment_date <= ?`); spParams.push(endDate); }
      if (company && company !== 'All') {
        spClauses.push(`ib.billed_to = ?`);
        spParams.push(company);
      }

      const [spRows] = await pool.query(
        `SELECT COALESCE(SUM(sp.amount), 0) AS supplierPayments
         FROM supplier_payments sp
         JOIN inventory_bills ib ON sp.bill_id = ib.id
         WHERE ${spClauses.join(' AND ')}`,
        spParams
      );
      totalSpInstalments = parseFloat(spRows[0]?.supplierPayments || 0);
    } catch (err) {
      console.warn('Supplier payments query notice:', err.message);
    }

    let totalInvDirect = 0;
    try {
      const invClauses = [`payment_method != 'Credit'`];
      const invParams = [];
      if (startDate) { invClauses.push(`bill_date >= ?`); invParams.push(startDate); }
      if (endDate)   { invClauses.push(`bill_date <= ?`); invParams.push(endDate); }
      if (company && company !== 'All') {
        invClauses.push(`billed_to = ?`);
        invParams.push(company);
      }

      const [invRows] = await pool.query(
        `SELECT COALESCE(SUM(grand_total), 0) AS paidInventoryBills
         FROM inventory_bills
         WHERE ${invClauses.join(' AND ')}`,
        invParams
      );
      totalInvDirect = parseFloat(invRows[0]?.paidInventoryBills || 0);
    } catch (err) {
      console.warn('Paid inventory bills query notice:', err.message);
    }

    kpi.supplierPayments = totalSpInstalments + totalInvDirect;

    let companyRowsUpdated = companyRows.map(r => ({
      company: r.company,
      sales: parseFloat(r.sales) || 0,
      collected: parseFloat(r.collected) || 0,
      credit: parseFloat(r.credit) || 0,
      invoices: parseInt(r.invoices, 10) || 0
    }));

    if (isKempannavar && (canSales > 0 || canCollection > 0 || canCredit > 0 || canInvoices > 0)) {
      const idx = companyRowsUpdated.findIndex(r => r.company === 'Kempannavar Industries');
      if (idx !== -1) {
        companyRowsUpdated[idx] = {
          ...companyRowsUpdated[idx],
          sales: companyRowsUpdated[idx].sales + canSales,
          collected: companyRowsUpdated[idx].collected + canCollection,
          credit: companyRowsUpdated[idx].credit + canCredit,
          invoices: companyRowsUpdated[idx].invoices + canInvoices
        };
      } else {
        companyRowsUpdated.push({
          company: 'Kempannavar Industries',
          sales: canSales,
          collected: canCollection,
          credit: canCredit,
          invoices: canInvoices
        });
      }
      companyRowsUpdated.sort((a, b) => b.sales - a.sales);
    }

    res.json({ ok: true, kpi, companies: companyRowsUpdated });
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
      const r = monthMap[m];
      return {
        month: m,
        month_name: name,
        totalSales: r ? parseFloat(r.totalSales) : 0,
        totalCollection: r ? parseFloat(r.totalCollection) : 0,
        totalCredit: r ? parseFloat(r.totalCredit) : 0,
        totalExpenses: 0,
        invoices: r ? parseInt(r.invoices, 10) : 0
      };
    });

    const isKempannavar = !company || company === 'All' || company === 'Kempannavar Industries';

    if (isKempannavar) {
      // 1. Monthly Can Supply billing sales
      const [canMonthlyBills] = await pool.query(
        `SELECT 
           MONTH(date) AS month,
           COALESCE(SUM(grand_total), 0) AS sales,
           COALESCE(SUM(grand_total - amount_paid), 0) AS credit,
           COUNT(*) AS invoices
         FROM can_billing
         WHERE YEAR(date) = ?
         GROUP BY MONTH(date)`,
        [targetYear]
      );

      // 2. Monthly Can Supply penalties
      const [canMonthlyPenalties] = await pool.query(
        `SELECT 
           MONTH(transaction_date) AS month,
           COALESCE(SUM(amount), 0) AS sales
         FROM can_supply_transactions
         WHERE YEAR(transaction_date) = ? AND type = 'RETURN' AND notes LIKE '%Damaged%'
         GROUP BY MONTH(transaction_date)`,
        [targetYear]
      );

      // 3. Monthly Can Supply payments
      const [canMonthlyPayments] = await pool.query(
        `SELECT 
           MONTH(payment_date) AS month,
           COALESCE(SUM(amount_paid), 0) AS collected
         FROM can_payments
         WHERE YEAR(payment_date) = ? AND payment_status = 'Approved'
         GROUP BY MONTH(payment_date)`,
        [targetYear]
      );

      canMonthlyBills.forEach(r => {
        const m = parseInt(r.month, 10);
        const idx = m - 1;
        if (trend[idx]) {
          trend[idx].totalSales += parseFloat(r.sales);
          trend[idx].totalCredit += parseFloat(r.credit);
          trend[idx].invoices += parseInt(r.invoices, 10);
        }
      });

      canMonthlyPenalties.forEach(r => {
        const m = parseInt(r.month, 10);
        const idx = m - 1;
        if (trend[idx]) {
          trend[idx].totalSales += parseFloat(r.sales);
        }
      });

      canMonthlyPayments.forEach(r => {
        const m = parseInt(r.month, 10);
        const idx = m - 1;
        if (trend[idx]) {
          trend[idx].totalCollection += parseFloat(r.collected);
        }
      });
    }

    // 4. Monthly approved expenses (all companies)
    const [expenseRows] = await pool.query(
      `SELECT 
         MONTH(expense_date) AS month,
         COALESCE(SUM(amount), 0) AS totalExpenses
       FROM expenses
       WHERE YEAR(expense_date) = ? AND payment_status = 'Approved'
       GROUP BY MONTH(expense_date)`,
      [targetYear]
    );

    expenseRows.forEach(r => {
      const m = parseInt(r.month, 10);
      const idx = m - 1;
      if (trend[idx]) {
        trend[idx].totalExpenses = parseFloat(r.totalExpenses);
      }
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
    page = parseInt(page, 10) || 1;
    limit = parseInt(limit, 10) || 20;
    const offset = (page - 1) * limit;

    const clauses = [];
    const params = [];
    if (startDate) { clauses.push(`billing_date >= ?`); params.push(startDate); }
    if (endDate)   { clauses.push(`billing_date <= ?`); params.push(endDate); }
    if (company && company !== 'All') { clauses.push(`company = ?`); params.push(company); }
    if (search.trim()) {
      clauses.push(`(customer_name LIKE ? OR customer_phone LIKE ?)`);
      const w = `%${search.trim()}%`;
      params.push(w, w);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    const countQuery = `
      SELECT COUNT(DISTINCT customer_phone) AS cnt 
      FROM (
        SELECT 
          cb.customer_name,
          cb.customer_phone,
          cb.grand_total,
          cb.amount_paid,
          cb.due_amount,
          cb.billing_date,
          cb.company
        FROM customer_bills cb
        UNION ALL
        SELECT
          cab.customer_name,
          c.phone AS customer_phone,
          cab.grand_total,
          cab.amount_paid,
          (cab.grand_total - cab.amount_paid) AS due_amount,
          cab.date AS billing_date,
          'Kempannavar Industries' AS company
        FROM can_billing cab
        JOIN customers c ON cab.customer_id = c.id
        UNION ALL
        SELECT
          cust.name AS customer_name,
          cust.phone AS customer_phone,
          t.amount AS grand_total,
          0.00 AS amount_paid,
          t.amount AS due_amount,
          t.transaction_date AS billing_date,
          'Kempannavar Industries' AS company
        FROM can_supply_transactions t
        JOIN customers cust ON t.customer_id = cust.id
        WHERE t.type = 'RETURN' AND t.notes LIKE '%Damaged%'
      ) combined
      ${where}
    `;

    const [countRows] = await pool.query(countQuery, params);

    const rowsQuery = `
      SELECT
        customer_name,
        customer_phone,
        COALESCE(SUM(grand_total), 0) AS totalSales,
        COALESCE(SUM(amount_paid), 0) AS totalPaid,
        COALESCE(SUM(due_amount), 0)  AS totalDue,
        COUNT(customer_phone)         AS invoiceCount,
        MAX(billing_date)             AS lastPurchase
      FROM (
        SELECT 
          cb.customer_name,
          cb.customer_phone,
          cb.grand_total,
          cb.amount_paid,
          cb.due_amount,
          cb.billing_date,
          cb.company
        FROM customer_bills cb
        UNION ALL
        SELECT
          cab.customer_name,
          c.phone AS customer_phone,
          cab.grand_total,
          cab.amount_paid,
          (cab.grand_total - cab.amount_paid) AS due_amount,
          cab.date AS billing_date,
          'Kempannavar Industries' AS company
        FROM can_billing cab
        JOIN customers c ON cab.customer_id = c.id
        UNION ALL
        SELECT
          cust.name AS customer_name,
          cust.phone AS customer_phone,
          t.amount AS grand_total,
          0.00 AS amount_paid,
          t.amount AS due_amount,
          t.transaction_date AS billing_date,
          'Kempannavar Industries' AS company
        FROM can_supply_transactions t
        JOIN customers cust ON t.customer_id = cust.id
        WHERE t.type = 'RETURN' AND t.notes LIKE '%Damaged%'
      ) combined
      ${where}
      GROUP BY customer_phone, customer_name
      ORDER BY totalSales DESC
      LIMIT ? OFFSET ?
    `;

    const [rows] = await pool.query(rowsQuery, [...params, limit, offset]);

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

    const clauses = [`customer_phone = ?`];
    const params = [phone];
    if (startDate) { clauses.push(`billing_date >= ?`); params.push(startDate); }
    if (endDate)   { clauses.push(`billing_date <= ?`); params.push(endDate); }
    if (company && company !== 'All') { clauses.push(`company = ?`); params.push(company); }
    const where = `WHERE ${clauses.join(' AND ')}`;

    const [rows] = await pool.query(
      `SELECT
         id,
         DATE_FORMAT(billing_date, '%Y-%m-%d') AS billing_date,
         company,
         grand_total,
         amount_paid,
         due_amount,
         payment_mode,
         customer_name
       FROM (
         SELECT 
           cb.id,
           cb.billing_date,
           cb.company,
           cb.grand_total,
           cb.amount_paid,
           cb.due_amount,
           cb.payment_mode,
           cb.customer_name,
           cb.customer_phone
         FROM customer_bills cb
         
         UNION ALL
         
         SELECT
           cab.bill_no AS id,
           cab.date AS billing_date,
           'Kempannavar Industries' AS company,
           cab.grand_total,
           cab.amount_paid,
           (cab.grand_total - cab.amount_paid) AS due_amount,
           'Can Supply' AS payment_mode,
           cab.customer_name,
           c.phone AS customer_phone
         FROM can_billing cab
         JOIN customers c ON cab.customer_id = c.id
         
         UNION ALL
         
         SELECT
           CONCAT('DMG-', t.id) AS id,
           t.transaction_date AS billing_date,
           'Kempannavar Industries' AS company,
           t.amount AS grand_total,
           0.00 AS amount_paid,
           t.amount AS due_amount,
           'Penalty' AS payment_mode,
           cust.name AS customer_name,
           cust.phone AS customer_phone
         FROM can_supply_transactions t
         JOIN customers cust ON t.customer_id = cust.id
         WHERE t.type = 'RETURN' AND t.notes LIKE '%Damaged%'
       ) combined
       ${where}
       ORDER BY billing_date DESC`,
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

    const isKempannavar = !company || company === 'All' || company === 'Kempannavar Industries';

    let canCash = 0, canUpi = 0, canBank = 0, canCollected = 0, canCredit = 0, canGrandTotal = 0;
    let canDailyBills = [];
    let canDailyPenalties = [];
    let canDailyPayments = [];

    if (isKempannavar) {
      // Build conditions for can_billing
      const billingClauses = [];
      const billingParams = [];
      if (startDate) { billingClauses.push(`cab.date >= ?`); billingParams.push(startDate); }
      if (endDate)   { billingClauses.push(`cab.date <= ?`); billingParams.push(endDate); }
      const billingWhere = billingClauses.length ? `WHERE ${billingClauses.join(' AND ')}` : '';

      const [canBillRows] = await pool.query(
        `SELECT 
           COALESCE(SUM(cab.grand_total), 0) AS sales,
           COALESCE(SUM(cab.grand_total - cab.amount_paid), 0) AS credit
         FROM can_billing cab
         ${billingWhere}`,
        billingParams
      );

      const penaltyClauses = [];
      const penaltyParams = [];
      if (startDate) { penaltyClauses.push(`transaction_date >= ?`); penaltyParams.push(startDate); }
      if (endDate)   { penaltyClauses.push(`transaction_date <= ?`); penaltyParams.push(endDate); }
      penaltyClauses.push(`type = 'RETURN' AND notes LIKE '%Damaged%'`);
      const penaltyWhere = `WHERE ${penaltyClauses.join(' AND ')}`;
      const [canPenaltyRows] = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS penaltySales
         FROM can_supply_transactions
         ${penaltyWhere}`,
        penaltyParams
      );

      canGrandTotal = parseFloat(canBillRows[0].sales) + parseFloat(canPenaltyRows[0].penaltySales);
      canCredit = parseFloat(canBillRows[0].credit);

      const paymentClauses = [`cp.payment_status = 'Approved'`];
      const paymentParams = [];
      if (startDate) { paymentClauses.push(`cp.payment_date >= ?`); paymentParams.push(startDate); }
      if (endDate)   { paymentClauses.push(`cp.payment_date <= ?`); paymentParams.push(endDate); }
      const paymentWhere = `WHERE ${paymentClauses.join(' AND ')}`;
      
      const [canPaymentRows] = await pool.query(
        `SELECT 
           COALESCE(SUM(CASE WHEN cp.payment_method = 'Cash' THEN cp.amount_paid ELSE 0 END), 0) AS cashColl,
           COALESCE(SUM(CASE WHEN cp.payment_method = 'UPI' THEN cp.amount_paid ELSE 0 END), 0) AS upiColl,
           COALESCE(SUM(CASE WHEN cp.payment_method = 'Bank' THEN cp.amount_paid ELSE 0 END), 0) AS bankColl,
           COALESCE(SUM(cp.amount_paid), 0) AS totalColl
         FROM can_payments cp
         ${paymentWhere}`,
        paymentParams
      );

      canCash = parseFloat(canPaymentRows[0].cashColl);
      canUpi = parseFloat(canPaymentRows[0].upiColl);
      canBank = parseFloat(canPaymentRows[0].bankColl);
      canCollected = parseFloat(canPaymentRows[0].totalColl);

      // Fetch daily bills
      [canDailyBills] = await pool.query(
        `SELECT 
           DATE_FORMAT(date, '%Y-%m-%d') AS date,
           COALESCE(SUM(grand_total), 0) AS sales
         FROM can_billing
         WHERE date >= ? AND date <= ?
         GROUP BY DATE_FORMAT(date, '%Y-%m-%d')`,
        [startDate || '1970-01-01', endDate || '9999-12-31']
      );

      // Fetch daily penalties
      [canDailyPenalties] = await pool.query(
        `SELECT 
           DATE_FORMAT(transaction_date, '%Y-%m-%d') AS date,
           COALESCE(SUM(amount), 0) AS sales
         FROM can_supply_transactions
         WHERE transaction_date >= ? AND transaction_date <= ? AND type = 'RETURN' AND notes LIKE '%Damaged%'
         GROUP BY DATE_FORMAT(transaction_date, '%Y-%m-%d')`,
        [startDate || '1970-01-01', endDate || '9999-12-31']
      );

      // Fetch daily payments
      [canDailyPayments] = await pool.query(
        `SELECT 
           DATE_FORMAT(payment_date, '%Y-%m-%d') AS date,
           COALESCE(SUM(amount_paid), 0) AS collected,
           COALESCE(SUM(CASE WHEN payment_method = 'Cash' THEN amount_paid ELSE 0 END), 0) AS cash,
           COALESCE(SUM(CASE WHEN payment_method = 'UPI' THEN amount_paid ELSE 0 END), 0) AS upi,
           COALESCE(SUM(CASE WHEN payment_method = 'Bank' THEN amount_paid ELSE 0 END), 0) AS bank
         FROM can_payments
         WHERE payment_date >= ? AND payment_date <= ? AND payment_status = 'Approved'
         GROUP BY DATE_FORMAT(payment_date, '%Y-%m-%d')`,
        [startDate || '1970-01-01', endDate || '9999-12-31']
      );
    }

    const collection = {
      cashTotal: parseFloat(rows[0].cashTotal) + canCash,
      upiTotal: parseFloat(rows[0].upiTotal) + canUpi,
      bankTotal: parseFloat(rows[0].bankTotal) + canBank,
      creditTotal: parseFloat(rows[0].creditTotal) + canCredit,
      totalCollected: parseFloat(rows[0].totalCollected) + canCollected,
      grandTotal: parseFloat(rows[0].grandTotal) + canGrandTotal
    };

    const dailyMap = {};
    dailyRows.forEach(r => {
      dailyMap[r.date] = {
        date: r.date,
        sales: parseFloat(r.sales) || 0,
        collected: parseFloat(r.collected) || 0,
        cash: parseFloat(r.cash) || 0,
        upi: parseFloat(r.upi) || 0,
        bank: parseFloat(r.bank) || 0
      };
    });

    canDailyBills.forEach(r => {
      if (!dailyMap[r.date]) dailyMap[r.date] = { date: r.date, sales: 0, collected: 0, cash: 0, upi: 0, bank: 0 };
      dailyMap[r.date].sales += parseFloat(r.sales) || 0;
    });

    canDailyPenalties.forEach(r => {
      if (!dailyMap[r.date]) dailyMap[r.date] = { date: r.date, sales: 0, collected: 0, cash: 0, upi: 0, bank: 0 };
      dailyMap[r.date].sales += parseFloat(r.sales) || 0;
    });

    canDailyPayments.forEach(r => {
      if (!dailyMap[r.date]) dailyMap[r.date] = { date: r.date, sales: 0, collected: 0, cash: 0, upi: 0, bank: 0 };
      dailyMap[r.date].collected += parseFloat(r.collected) || 0;
      dailyMap[r.date].cash += parseFloat(r.cash) || 0;
      dailyMap[r.date].upi += parseFloat(r.upi) || 0;
      dailyMap[r.date].bank += parseFloat(r.bank) || 0;
    });

    const dailyTrend = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

    res.json({ ok: true, collection, daily: dailyTrend });
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
         COALESCE(SUM(CASE WHEN payment_status = 'Approved' THEN cash_paid ELSE 0 END), 0)    AS cash,
         COALESCE(SUM(CASE WHEN payment_status = 'Approved' THEN upi_paid ELSE 0 END), 0)     AS upi,
         COALESCE(SUM(CASE WHEN payment_status = 'Approved' THEN bank_paid ELSE 0 END), 0)    AS bank,
         COUNT(*)                        AS invoices,
         COUNT(DISTINCT customer_phone) AS customers
       FROM customer_bills
       ${where}
       GROUP BY company
       ORDER BY sales DESC`,
      params
    );

    // Fetch Can Supply data for the company comparison
    let canSales = 0, canCollected = 0, canCredit = 0;
    let canCash = 0, canUpi = 0, canBank = 0;
    let canInvoices = 0;
    let canCustomersList = [];

    const billingClauses = [];
    const billingParams = [];
    if (startDate) { billingClauses.push(`cab.date >= ?`); billingParams.push(startDate); }
    if (endDate)   { billingClauses.push(`cab.date <= ?`); billingParams.push(endDate); }
    const billingWhere = billingClauses.length ? `WHERE ${billingClauses.join(' AND ')}` : '';

    const [canBillRows] = await pool.query(
      `SELECT 
         COALESCE(SUM(cab.grand_total), 0) AS sales,
         COALESCE(SUM(cab.grand_total - cab.amount_paid), 0) AS credit,
         COUNT(*) AS invoices
       FROM can_billing cab
       ${billingWhere}`,
      billingParams
    );
    canSales = parseFloat(canBillRows[0].sales);
    canCredit = parseFloat(canBillRows[0].credit);
    canInvoices = parseInt(canBillRows[0].invoices, 10);

    const [canBillPhones] = await pool.query(
      `SELECT DISTINCT c.phone 
       FROM can_billing cab
       JOIN customers c ON cab.customer_id = c.id
       ${billingWhere}`,
      billingParams
    );
    canCustomersList = canBillPhones.map(r => r.phone);

    const penaltyClauses = [];
    const penaltyParams = [];
    if (startDate) { penaltyClauses.push(`transaction_date >= ?`); penaltyParams.push(startDate); }
    if (endDate)   { penaltyClauses.push(`transaction_date <= ?`); penaltyParams.push(endDate); }
    penaltyClauses.push(`type = 'RETURN' AND notes LIKE '%Damaged%'`);
    const penaltyWhere = `WHERE ${penaltyClauses.join(' AND ')}`;
    const [canPenaltyRows] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS penaltySales
       FROM can_supply_transactions
       ${penaltyWhere}`,
      penaltyParams
    );
    canSales += parseFloat(canPenaltyRows[0].penaltySales);

    const paymentClauses = [`cp.payment_status = 'Approved'`];
    const paymentParams = [];
    if (startDate) { paymentClauses.push(`cp.payment_date >= ?`); paymentParams.push(startDate); }
    if (endDate)   { paymentClauses.push(`cp.payment_date <= ?`); paymentParams.push(endDate); }
    const paymentWhere = `WHERE ${paymentClauses.join(' AND ')}`;
    
    const [canPaymentRows] = await pool.query(
      `SELECT 
         COALESCE(SUM(CASE WHEN cp.payment_method = 'Cash' THEN cp.amount_paid ELSE 0 END), 0) AS cashColl,
         COALESCE(SUM(CASE WHEN cp.payment_method = 'UPI' THEN cp.amount_paid ELSE 0 END), 0) AS upiColl,
         COALESCE(SUM(CASE WHEN cp.payment_method = 'Bank' THEN cp.amount_paid ELSE 0 END), 0) AS bankColl,
         COALESCE(SUM(cp.amount_paid), 0) AS totalColl
       FROM can_payments cp
       ${paymentWhere}`,
      paymentParams
    );
    canCash = parseFloat(canPaymentRows[0].cashColl);
    canUpi = parseFloat(canPaymentRows[0].upiColl);
    canBank = parseFloat(canPaymentRows[0].bankColl);
    canCollected = parseFloat(canPaymentRows[0].totalColl);

    const [kempPhonesRows] = await pool.query(
      `SELECT DISTINCT customer_phone 
       FROM customer_bills 
       WHERE company = 'Kempannavar Industries' ${startDate ? 'AND billing_date >= ?' : ''} ${endDate ? 'AND billing_date <= ?' : ''}`,
      [...(startDate ? [startDate] : []), ...(endDate ? [endDate] : [])]
    );
    const kempStandardPhones = kempPhonesRows.map(r => r.customer_phone);
    const mergedKempPhones = new Set([...kempStandardPhones, ...canCustomersList]);

    let finalCompanies = rows.map(r => ({
      company: r.company,
      sales: parseFloat(r.sales) || 0,
      collected: parseFloat(r.collected) || 0,
      credit: parseFloat(r.credit) || 0,
      cash: parseFloat(r.cash) || 0,
      upi: parseFloat(r.upi) || 0,
      bank: parseFloat(r.bank) || 0,
      invoices: parseInt(r.invoices, 10) || 0,
      customers: parseInt(r.customers, 10) || 0
    }));

    let foundKemp = false;
    finalCompanies = finalCompanies.map(c => {
      if (c.company === 'Kempannavar Industries') {
        foundKemp = true;
        return {
          company: c.company,
          sales: c.sales + canSales,
          collected: c.collected + canCollected,
          credit: c.credit + canCredit,
          cash: c.cash + canCash,
          upi: c.upi + canUpi,
          bank: c.bank + canBank,
          invoices: c.invoices + canInvoices,
          customers: mergedKempPhones.size
        };
      }
      return c;
    });

    if (!foundKemp && (canSales > 0 || canCollected > 0 || canCredit > 0 || canInvoices > 0)) {
      finalCompanies.push({
        company: 'Kempannavar Industries',
        sales: canSales,
        collected: canCollected,
        credit: canCredit,
        cash: canCash,
        upi: canUpi,
        bank: canBank,
        invoices: canInvoices,
        customers: mergedKempPhones.size
      });
    }

    finalCompanies.sort((a, b) => b.sales - a.sales);

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

    const [canMonthlyBillsComp] = await pool.query(
      `SELECT 
         MONTH(date) AS month,
         COALESCE(SUM(grand_total), 0) AS sales
       FROM can_billing
       WHERE YEAR(date) = ?
       GROUP BY MONTH(date)`,
      [yr]
    );

    const [canMonthlyPenaltiesComp] = await pool.query(
      `SELECT 
         MONTH(transaction_date) AS month,
         COALESCE(SUM(amount), 0) AS sales
       FROM can_supply_transactions
       WHERE YEAR(transaction_date) = ? AND type = 'RETURN' AND notes LIKE '%Damaged%'
       GROUP BY MONTH(transaction_date)`,
      [yr]
    );

    let finalMonthly = monthly.map(m => ({
      company: m.company,
      month: parseInt(m.month, 10),
      sales: parseFloat(m.sales) || 0
    }));

    const mergeMonthlySales = (monthNum, amt) => {
      const idx = finalMonthly.findIndex(m => m.company === 'Kempannavar Industries' && m.month === monthNum);
      if (idx !== -1) {
        finalMonthly[idx].sales += amt;
      } else {
        finalMonthly.push({
          company: 'Kempannavar Industries',
          month: monthNum,
          sales: amt
        });
      }
    };

    canMonthlyBillsComp.forEach(r => {
      mergeMonthlySales(parseInt(r.month, 10), parseFloat(r.sales));
    });

    canMonthlyPenaltiesComp.forEach(r => {
      mergeMonthlySales(parseInt(r.month, 10), parseFloat(r.sales));
    });

    finalMonthly.sort((a, b) => a.company.localeCompare(b.company) || a.month - b.month);

    res.json({ ok: true, companies: finalCompanies, monthly: finalMonthly });
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
    
    const clauses = [];
    const params = [];
    if (startDate) { clauses.push(`billing_date >= ?`); params.push(startDate); }
    if (endDate)   { clauses.push(`billing_date <= ?`); params.push(endDate); }
    if (company && company !== 'All') { clauses.push(`company = ?`); params.push(company); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    const [rows] = await pool.query(
      `SELECT
         customer_name,
         customer_phone,
         COALESCE(SUM(grand_total), 0) AS totalSales,
         COALESCE(SUM(amount_paid), 0) AS totalPaid,
         COALESCE(SUM(due_amount), 0)  AS totalDue,
         COUNT(customer_phone)         AS invoiceCount
       FROM (
         SELECT 
           cb.customer_name,
           cb.customer_phone,
           cb.grand_total,
           cb.amount_paid,
           cb.due_amount,
           cb.billing_date,
           cb.company
         FROM customer_bills cb
         UNION ALL
         SELECT
           cab.customer_name,
           c.phone AS customer_phone,
           cab.grand_total,
           cab.amount_paid,
           (cab.grand_total - cab.amount_paid) AS due_amount,
           cab.date AS billing_date,
           'Kempannavar Industries' AS company
         FROM can_billing cab
         JOIN customers c ON cab.customer_id = c.id
         UNION ALL
         SELECT
           cust.name AS customer_name,
           cust.phone AS customer_phone,
           t.amount AS grand_total,
           0.00 AS amount_paid,
           t.amount AS due_amount,
           t.transaction_date AS billing_date,
           'Kempannavar Industries' AS company
         FROM can_supply_transactions t
         JOIN customers cust ON t.customer_id = cust.id
         WHERE t.type = 'RETURN' AND t.notes LIKE '%Damaged%'
       ) combined
       ${where}
       GROUP BY customer_phone, customer_name
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

    let finalDaily = rows.map(r => ({
      date: r.date,
      sales: parseFloat(r.sales) || 0,
      collected: parseFloat(r.collected) || 0,
      credit: parseFloat(r.credit) || 0,
      invoices: parseInt(r.invoices, 10) || 0
    }));

    const isKempannavar = !company || company === 'All' || company === 'Kempannavar Industries';

    if (isKempannavar) {
      const [canDailyBills] = await pool.query(
        `SELECT 
           DATE_FORMAT(date, '%Y-%m-%d') AS date,
           COALESCE(SUM(grand_total), 0) AS sales,
           COALESCE(SUM(grand_total - amount_paid), 0) AS credit,
           COUNT(*) AS invoices
         FROM can_billing
         WHERE date >= ? AND date <= ?
         GROUP BY DATE_FORMAT(date, '%Y-%m-%d')`,
        [startDate || '1970-01-01', endDate || '9999-12-31']
      );

      const [canDailyPenalties] = await pool.query(
        `SELECT 
           DATE_FORMAT(transaction_date, '%Y-%m-%d') AS date,
           COALESCE(SUM(amount), 0) AS sales
         FROM can_supply_transactions
         WHERE transaction_date >= ? AND transaction_date <= ? AND type = 'RETURN' AND notes LIKE '%Damaged%'
         GROUP BY DATE_FORMAT(transaction_date, '%Y-%m-%d')`,
        [startDate || '1970-01-01', endDate || '9999-12-31']
      );

      const [canDailyPayments] = await pool.query(
        `SELECT 
           DATE_FORMAT(payment_date, '%Y-%m-%d') AS date,
           COALESCE(SUM(amount_paid), 0) AS collected
         FROM can_payments
         WHERE payment_date >= ? AND payment_date <= ? AND payment_status = 'Approved'
         GROUP BY DATE_FORMAT(payment_date, '%Y-%m-%d')`,
        [startDate || '1970-01-01', endDate || '9999-12-31']
      );

      const dailyMap = {};
      finalDaily.forEach(item => {
        dailyMap[item.date] = item;
      });

      canDailyBills.forEach(r => {
        if (!dailyMap[r.date]) dailyMap[r.date] = { date: r.date, sales: 0, collected: 0, credit: 0, invoices: 0 };
        dailyMap[r.date].sales += parseFloat(r.sales) || 0;
        dailyMap[r.date].credit += parseFloat(r.credit) || 0;
        dailyMap[r.date].invoices += parseInt(r.invoices, 10) || 0;
      });

      canDailyPenalties.forEach(r => {
        if (!dailyMap[r.date]) dailyMap[r.date] = { date: r.date, sales: 0, collected: 0, credit: 0, invoices: 0 };
        dailyMap[r.date].sales += parseFloat(r.sales) || 0;
      });

      canDailyPayments.forEach(r => {
        if (!dailyMap[r.date]) dailyMap[r.date] = { date: r.date, sales: 0, collected: 0, credit: 0, invoices: 0 };
        dailyMap[r.date].collected += parseFloat(r.collected) || 0;
      });

      finalDaily = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));
    }

    res.json({ ok: true, daily: finalDaily });
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
    let list = rows.map(r => r.company);
    if (!list.includes('Kempannavar Industries')) {
      list.push('Kempannavar Industries');
      list.sort();
    }
    res.json({ ok: true, companies: list });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

export default router;
