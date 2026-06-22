import express from 'express';
import pool from '../config/db.js';

const router = express.Router();

// GET /api/supplier-ledger/suppliers - Get all suppliers for dropdown list
router.get('/suppliers', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, company_name AS name, phone_number AS phone FROM company_details ORDER BY name ASC'
    );
    res.json({ ok: true, suppliers: rows });
  } catch (error) {
    console.error('Fetch ledger suppliers error:', error);
    res.status(400).json({ ok: false, error: error.message });
  }
});

// GET /api/supplier-ledger/summary/:supplierId - Get KPI summary metrics & ageing report
router.get('/summary/:supplierId', async (req, res) => {
  try {
    const { supplierId } = req.params;

    // Get current date details in IST
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const ist = new Date(now.getTime() + (330 + offset) * 60000);
    const currentYear = ist.getFullYear();
    const currentMonth = ist.getMonth() + 1;
    const currentYearMonth = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

    // 1. Total Purchases This Month (Credits of entry_type = 'PURCHASE' this month)
    const [purchaseMonthRows] = await pool.query(
      `SELECT COALESCE(SUM(credit), 0.00) AS total 
       FROM supplier_ledger 
       WHERE supplier_id = ? AND entry_type = 'PURCHASE' AND DATE_FORMAT(date, '%Y-%m') = ?`,
      [supplierId, currentYearMonth]
    );

    // 2. Total Purchases This Year (Credits of entry_type = 'PURCHASE' this year)
    const [purchaseYearRows] = await pool.query(
      `SELECT COALESCE(SUM(credit), 0.00) AS total 
       FROM supplier_ledger 
       WHERE supplier_id = ? AND entry_type = 'PURCHASE' AND DATE_FORMAT(date, '%Y') = ?`,
      [supplierId, String(currentYear)]
    );

    // 3. Total Payments Made (Debits historically)
    const [paymentsRows] = await pool.query(
      `SELECT COALESCE(SUM(debit), 0.00) AS total 
       FROM supplier_ledger 
       WHERE supplier_id = ?`,
      [supplierId]
    );

    // 4. Net Outstanding Due (Total Credit - Total Debit)
    const [ledgerTotals] = await pool.query(
      `SELECT COALESCE(SUM(debit), 0.00) AS total_debit, COALESCE(SUM(credit), 0.00) AS total_credit 
       FROM supplier_ledger 
       WHERE supplier_id = ?`,
      [supplierId]
    );

    const totalDebit = parseFloat(ledgerTotals[0].total_debit);
    const totalCredit = parseFloat(ledgerTotals[0].total_credit);
    const outstandingDue = totalCredit - totalDebit;

    // 5. Supplier Metadata
    const [supRows] = await pool.query(
      `SELECT company_name, phone_number, gst_number, address FROM company_details WHERE id = ?`,
      [supplierId]
    );

    if (supRows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Supplier not found.' });
    }

    const supplier = supRows[0];

    // 6. Ageing Report Calculation (FIFO)
    const [purchases] = await pool.query(
      `SELECT date, credit, reference_no 
       FROM supplier_ledger 
       WHERE supplier_id = ? AND entry_type = 'PURCHASE' 
       ORDER BY date ASC, id ASC`,
      [supplierId]
    );

    let tempDebit = totalDebit;
    let aging = {
      bucket0_30: 0,
      bucket31_60: 0,
      bucket61_90: 0,
      bucket91_plus: 0
    };

    const today = new Date();
    for (const purchase of purchases) {
      const credit = parseFloat(purchase.credit);
      if (tempDebit >= credit) {
        tempDebit -= credit;
      } else {
        const unpaid = credit - tempDebit;
        tempDebit = 0;

        const purchaseDate = new Date(purchase.date);
        const diffTime = Math.abs(today - purchaseDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays <= 30) {
          aging.bucket0_30 += unpaid;
        } else if (diffDays <= 60) {
          aging.bucket31_60 += unpaid;
        } else if (diffDays <= 90) {
          aging.bucket61_90 += unpaid;
        } else {
          aging.bucket91_plus += unpaid;
        }
      }
    }

    res.json({
      ok: true,
      summary: {
        supplierName: supplier.company_name,
        supplierPhone: supplier.phone_number || 'N/A',
        supplierGstin: supplier.gst_number || 'N/A',
        supplierAddress: supplier.address || 'N/A',
        purchaseMonth: parseFloat(purchaseMonthRows[0].total),
        purchaseYear: parseFloat(purchaseYearRows[0].total),
        paymentsMade: parseFloat(paymentsRows[0].total),
        outstandingDue: outstandingDue,
        aging
      }
    });
  } catch (error) {
    console.error('Fetch supplier summary error:', error);
    res.status(400).json({ ok: false, error: error.message });
  }
});

// GET /api/supplier-ledger/transactions/:supplierId - Get chronological transactions list
router.get('/transactions/:supplierId', async (req, res) => {
  try {
    const { supplierId } = req.params;
    const { startDate = '', endDate = '' } = req.query;

    // 1. Calculate Opening Balance before startDate (Total Credit - Total Debit)
    let openingBalance = 0.00;
    if (startDate) {
      const [opRows] = await pool.query(
        `SELECT COALESCE(SUM(debit), 0.00) AS total_debit, COALESCE(SUM(credit), 0.00) AS total_credit 
         FROM supplier_ledger 
         WHERE supplier_id = ? AND date < ?`,
        [supplierId, startDate]
      );
      openingBalance = parseFloat(opRows[0].total_credit) - parseFloat(opRows[0].total_debit);
    }

    // 2. Fetch filtered ledger entries
    let query = `
      SELECT id, DATE_FORMAT(date, '%Y-%m-%d') as date, entry_type, reference_no, particular, debit, credit, balance 
      FROM supplier_ledger 
      WHERE supplier_id = ?`;
    const params = [supplierId];

    if (startDate) {
      query += ` AND date >= ?`;
      params.push(startDate);
    }
    if (endDate) {
      query += ` AND date <= ?`;
      params.push(endDate);
    }
    query += ` ORDER BY date ASC, id ASC`;

    const [rows] = await pool.query(query, params);

    // 3. Re-calculate running balances chronologically starting from opening balance
    let currentBalance = openingBalance;
    const transactions = rows.map(row => {
      currentBalance = currentBalance + parseFloat(row.credit) - parseFloat(row.debit);
      return {
        id: row.id,
        date: row.date,
        entryType: row.entry_type,
        referenceNo: row.reference_no,
        particular: row.particular,
        debit: parseFloat(row.debit),
        credit: parseFloat(row.credit),
        runningBalance: currentBalance
      };
    });

    res.json({
      ok: true,
      openingBalance,
      transactions
    });
  } catch (error) {
    console.error('Fetch supplier ledger transactions error:', error);
    res.status(400).json({ ok: false, error: error.message });
  }
});

// GET /api/supplier-ledger/analytics/:supplierId - Get analytics details
router.get('/analytics/:supplierId', async (req, res) => {
  try {
    const { supplierId } = req.params;

    // 1. Monthly Purchase Velocity (last 6 months)
    const [velocityRows] = await pool.query(
      `SELECT DATE_FORMAT(date, '%Y-%m') AS month, COALESCE(SUM(credit), 0.00) AS total_purchases
       FROM supplier_ledger
       WHERE supplier_id = ? AND entry_type = 'PURCHASE'
       GROUP BY DATE_FORMAT(date, '%Y-%m')
       ORDER BY month ASC
       LIMIT 6`,
      [supplierId]
    );

    // 2. Invoice Statistics
    const [statsRows] = await pool.query(
      `SELECT 
         COUNT(*) AS total_invoices, 
         COALESCE(AVG(credit), 0.00) AS avg_value, 
         COALESCE(MAX(credit), 0.00) AS max_value 
       FROM supplier_ledger 
       WHERE supplier_id = ? AND entry_type = 'PURCHASE'`,
      [supplierId]
    );

    // 3. Payment Behavior (Avg collection lag in days)
    const [behaviorRows] = await pool.query(
      `SELECT p.payment_date, b.bill_date
       FROM supplier_payments p
       JOIN inventory_bills b ON p.bill_id = b.id
       WHERE b.supplier_id = ? AND p.payment_status = 'Approved'`,
      [supplierId]
    );

    let totalDays = 0;
    let count = 0;
    for (const row of behaviorRows) {
      const pDate = new Date(row.payment_date);
      const bDate = new Date(row.bill_date);
      const diff = Math.ceil((pDate - bDate) / (1000 * 60 * 60 * 24));
      if (diff >= 0) {
        totalDays += diff;
        count++;
      }
    }
    const avgPaymentDays = count > 0 ? Math.round(totalDays / count) : 0;

    res.json({
      ok: true,
      velocity: velocityRows,
      invoiceStats: {
        totalInvoices: statsRows[0].total_invoices,
        avgValue: parseFloat(statsRows[0].avg_value),
        maxValue: parseFloat(statsRows[0].max_value)
      },
      avgPaymentDays
    });
  } catch (error) {
    console.error('Fetch supplier ledger analytics error:', error);
    res.status(400).json({ ok: false, error: error.message });
  }
});

export default router;
