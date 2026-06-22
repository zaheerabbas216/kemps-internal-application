import express from 'express';
import pool from '../config/db.js';

const router = express.Router();

// GET /api/accounts-ledger/customers - Get all customers for dropdown list
router.get('/customers', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, phone FROM customers ORDER BY name ASC'
    );
    res.json({ ok: true, customers: rows });
  } catch (error) {
    console.error('Fetch ledger customers error:', error);
    res.status(400).json({ ok: false, error: error.message });
  }
});

// GET /api/accounts-ledger/summary/:customerId - Get KPI summary metrics & ageing report
router.get('/summary/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;

    // Get current date details in IST
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const ist = new Date(now.getTime() + (330 + offset) * 60000);
    const currentYear = ist.getFullYear();
    const currentMonth = ist.getMonth() + 1;
    const currentYearMonth = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

    // 1. Total Sales This Month (Debits of entry_type = 'SALE' this month)
    const [salesMonthRows] = await pool.query(
      `SELECT COALESCE(SUM(debit), 0.00) AS total 
       FROM customer_ledger 
       WHERE customer_id = ? AND entry_type = 'SALE' AND DATE_FORMAT(date, '%Y-%m') = ?`,
      [customerId, currentYearMonth]
    );

    // 2. Total Sales This Year (Debits of entry_type = 'SALE' this year)
    const [salesYearRows] = await pool.query(
      `SELECT COALESCE(SUM(debit), 0.00) AS total 
       FROM customer_ledger 
       WHERE customer_id = ? AND entry_type = 'SALE' AND DATE_FORMAT(date, '%Y') = ?`,
      [customerId, String(currentYear)]
    );

    // 3. Total Payments Received (Credits historically)
    const [paymentsRows] = await pool.query(
      `SELECT COALESCE(SUM(credit), 0.00) AS total 
       FROM customer_ledger 
       WHERE customer_id = ?`,
      [customerId]
    );

    // 4. Net Outstanding Due (Total Debit - Total Credit)
    const [ledgerTotals] = await pool.query(
      `SELECT COALESCE(SUM(debit), 0.00) AS total_debit, COALESCE(SUM(credit), 0.00) AS total_credit 
       FROM customer_ledger 
       WHERE customer_id = ?`,
      [customerId]
    );

    const totalDebit = parseFloat(ledgerTotals[0].total_debit);
    const totalCredit = parseFloat(ledgerTotals[0].total_credit);
    const outstandingDue = totalDebit - totalCredit;

    // 5. Customer Metadata (for credit limit/info)
    const [custRows] = await pool.query(
      `SELECT name, phone, gstin, address FROM customers WHERE id = ?`,
      [customerId]
    );

    if (custRows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Customer not found.' });
    }

    const customer = custRows[0];

    // 6. Ageing Report Calculation (FIFO)
    const [sales] = await pool.query(
      `SELECT date, debit, reference_no 
       FROM customer_ledger 
       WHERE customer_id = ? AND entry_type = 'SALE' 
       ORDER BY date ASC, id ASC`,
      [customerId]
    );

    let tempCredit = totalCredit;
    let aging = {
      bucket0_30: 0,
      bucket31_60: 0,
      bucket61_90: 0,
      bucket91_plus: 0
    };

    const today = new Date();
    for (const sale of sales) {
      const debit = parseFloat(sale.debit);
      if (tempCredit >= debit) {
        tempCredit -= debit;
      } else {
        const unpaid = debit - tempCredit;
        tempCredit = 0;

        const saleDate = new Date(sale.date);
        const diffTime = Math.abs(today - saleDate);
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
        customerName: customer.name,
        customerPhone: customer.phone,
        customerGstin: customer.gstin || 'N/A',
        customerAddress: customer.address || 'N/A',
        salesMonth: parseFloat(salesMonthRows[0].total),
        salesYear: parseFloat(salesYearRows[0].total),
        paymentsReceived: parseFloat(paymentsRows[0].total),
        outstandingDue: outstandingDue,
        creditLimit: 'No Limit Set',
        aging
      }
    });
  } catch (error) {
    console.error('Fetch ledger summary error:', error);
    res.status(400).json({ ok: false, error: error.message });
  }
});

// GET /api/accounts-ledger/transactions/:customerId - Get chronological transactions list
router.get('/transactions/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;
    const { startDate = '', endDate = '' } = req.query;

    // 1. Calculate Opening Balance before startDate
    let openingBalance = 0.00;
    if (startDate) {
      const [opRows] = await pool.query(
        `SELECT COALESCE(SUM(debit), 0.00) AS total_debit, COALESCE(SUM(credit), 0.00) AS total_credit 
         FROM customer_ledger 
         WHERE customer_id = ? AND date < ?`,
        [customerId, startDate]
      );
      openingBalance = parseFloat(opRows[0].total_debit) - parseFloat(opRows[0].total_credit);
    }

    // 2. Fetch filtered ledger entries
    let query = `
      SELECT id, DATE_FORMAT(date, '%Y-%m-%d') as date, entry_type, reference_no, particular, debit, credit, balance 
      FROM customer_ledger 
      WHERE customer_id = ?`;
    const params = [customerId];

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
      currentBalance = currentBalance + parseFloat(row.debit) - parseFloat(row.credit);
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
    console.error('Fetch ledger transactions error:', error);
    res.status(400).json({ ok: false, error: error.message });
  }
});

// GET /api/accounts-ledger/analytics/:customerId - Get analytics details
router.get('/analytics/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;

    // 1. Monthly Purchase Velocity (last 6 months)
    const [velocityRows] = await pool.query(
      `SELECT DATE_FORMAT(date, '%Y-%m') AS month, COALESCE(SUM(debit), 0.00) AS total_sales
       FROM customer_ledger
       WHERE customer_id = ? AND entry_type = 'SALE'
       GROUP BY DATE_FORMAT(date, '%Y-%m')
       ORDER BY month ASC
       LIMIT 6`,
      [customerId]
    );

    // 2. Invoice Statistics
    const [statsRows] = await pool.query(
      `SELECT 
         COUNT(*) AS total_invoices, 
         COALESCE(AVG(debit), 0.00) AS avg_value, 
         COALESCE(MAX(debit), 0.00) AS max_value 
       FROM customer_ledger 
       WHERE customer_id = ? AND entry_type = 'SALE'`,
      [customerId]
    );

    // 3. Payment Behavior (Avg collection lag in days)
    const [behaviorRows] = await pool.query(
      `SELECT cp.payment_date, cb.billing_date
       FROM customer_payments cp
       JOIN customer_bills cb ON cp.bill_id = cb.id
       WHERE cb.customer_id = ? AND cp.payment_status = 'Approved'`,
      [customerId]
    );

    let totalDays = 0;
    let count = 0;
    for (const row of behaviorRows) {
      const pDate = new Date(row.payment_date);
      const bDate = new Date(row.billing_date);
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
    console.error('Fetch ledger analytics error:', error);
    res.status(400).json({ ok: false, error: error.message });
  }
});

export default router;
