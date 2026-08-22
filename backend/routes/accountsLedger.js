import express from 'express';
import pool from '../config/db.js';
import { addLedgerEntry, recalculateLedgerBalances } from '../helpers/ledgerHelper.js';

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

// GET /api/accounts-ledger/summary/:customerId - Get KPI summary metrics & dashboard statistics
router.get('/summary/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;
    const { 
      startDate = '', 
      endDate = '', 
      branch = '', 
      transactionType = '' 
    } = req.query;

    // Get current date details in IST
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const ist = new Date(now.getTime() + (330 + offset) * 60000);
    const currentYear = ist.getFullYear();
    const currentMonth = ist.getMonth() + 1;
    const currentYearMonth = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
    const currentYearStr = String(currentYear);

    // 1. Fetch ALL ledger rows for this customer chronologically, resolving branch
    const [allRows] = await pool.query(
      `SELECT 
         DATE_FORMAT(cl.date, '%Y-%m-%d') as date, 
         cl.entry_type, 
         cl.particular, 
         cl.debit, 
         cl.credit,
         COALESCE(
           (SELECT cb_b.company FROM customer_bills cb_b WHERE cb_b.id = cl.reference_no),
           (SELECT cb_b2.company FROM customer_payments cp_b JOIN customer_bills cb_b2 ON cp_b.bill_id = cb_b2.id WHERE cp_b.id = cl.reference_no),
           'Main Branch'
         ) AS branch
       FROM customer_ledger cl 
       WHERE cl.customer_id = ? 
       ORDER BY cl.date ASC, cl.id ASC`,
      [customerId]
    );

    // 2. Fetch customer metadata (including credit_limit)
    const [custRows] = await pool.query(
      `SELECT name, phone, gstin, address, COALESCE(credit_limit, 50000.00) as credit_limit FROM customers WHERE id = ?`,
      [customerId]
    );

    if (custRows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Customer not found.' });
    }

    const customer = custRows[0];
    const creditLimit = parseFloat(customer.credit_limit || 50000.00);

    // 3. Separate ledger scanning:
    // A. Cumulative calculations (running balance up to endDate)
    let totalDebitCumulative = 0.00;
    let totalCreditCumulative = 0.00;

    // B. Filtered calculations (inside date range & branch filter)
    let grossSales = 0.00;
    let salesReturn = 0.00;
    let paymentsReceived = 0.00;
    let refundsPaidVal = 0.00;
    
    let totalInvoicesCount = 0;
    let totalPaymentsCount = 0;
    let totalReturnsCount = 0;
    
    let lastInvoiceDate = null;
    let lastPaymentDate = null;
    let lastReturnDate = null;

    const filteredRowsForAging = [];
    const filteredRowsForTimeline = [];

    allRows.forEach(row => {
      const debit = parseFloat(row.debit) || 0.00;
      const credit = parseFloat(row.credit) || 0.00;
      const entryType = String(row.entry_type || '').toUpperCase();
      const particular = String(row.particular || '');
      const dateStr = row.date;
      
      const yearMonth = dateStr.slice(0, 7);
      const year = dateStr.slice(0, 4);

      // Check branch match
      const branchMatch = !branch || branch === 'All' || branch === 'All Branches' || row.branch === branch;

      // Cumulative checks: all transactions up to endDate (or indefinitely if no endDate)
      const dateBeforeEnd = !endDate || dateStr <= endDate;
      if (branchMatch && dateBeforeEnd) {
        totalDebitCumulative += debit;
        totalCreditCumulative += credit;
        filteredRowsForAging.push(row);
      }

      // Filtered checks: inside selected date range
      const dateInPeriod = (!startDate || dateStr >= startDate) && (!endDate || dateStr <= endDate);
      if (branchMatch && dateInPeriod) {
        filteredRowsForTimeline.push(row);

        const isInvoice = ['SALE', 'BILL GENERATED'].includes(entryType);
        const isSalesReturn = ['SALES_RETURN', 'CREDIT_NOTE', 'SALES RETURN'].includes(entryType) || 
                              (entryType === 'PAYMENT' && particular.toLowerCase().startsWith('sales return'));
        const isPayment = ['PAYMENT', 'PAYMENT RECEIVED', 'ADVANCE_PAYMENT', 'ADVANCE PAYMENT'].includes(entryType) && !isSalesReturn;
        const isRefund = ['REFUND', 'CAN RETURN (FULL)'].includes(entryType);

        if (isInvoice) {
          grossSales += debit;
          totalInvoicesCount++;
          lastInvoiceDate = dateStr;
        } else if (isSalesReturn) {
          salesReturn += credit;
          totalReturnsCount++;
          lastReturnDate = dateStr;
        } else if (isPayment) {
          paymentsReceived += credit;
          totalPaymentsCount++;
          lastPaymentDate = dateStr;
        } else if (isRefund) {
          refundsPaidVal += debit;
        }
      }
    });

    const netSales = grossSales - salesReturn;
    const netBalanceCumulative = totalDebitCumulative - totalCreditCumulative;

    let outstandingDue = 0.00;
    let creditBalance = 0.00;

    if (netBalanceCumulative > 0.004) {
      outstandingDue = netBalanceCumulative;
      creditBalance = 0.00;
    } else if (netBalanceCumulative < -0.004) {
      outstandingDue = 0.00;
      creditBalance = Math.abs(netBalanceCumulative);
    }

    // 4. Dynamic Average Collection Days Calculation (respects filters)
    let collWhere = ['cb.customer_id = ?', "cp.payment_status = 'Approved'"];
    let collParams = [customerId];
    if (branch && branch !== 'All' && branch !== 'All Branches') {
      collWhere.push('cb.company = ?');
      collParams.push(branch);
    }
    if (startDate) {
      collWhere.push('cp.payment_date >= ?');
      collParams.push(startDate);
    }
    if (endDate) {
      collWhere.push('cp.payment_date <= ?');
      collParams.push(endDate);
    }

    const [collRows] = await pool.query(
      `SELECT cp.payment_date, cb.billing_date
       FROM customer_payments cp
       JOIN customer_bills cb ON cp.bill_id = cb.id
       WHERE ${collWhere.join(' AND ')}`,
      collParams
    );

    let totalDays = 0;
    let count = 0;
    for (const row of collRows) {
      const pDate = new Date(row.payment_date);
      const bDate = new Date(row.billing_date);
      const diff = Math.ceil((pDate - bDate) / (1000 * 60 * 60 * 24));
      if (diff >= 0) {
        totalDays += diff;
        count++;
      }
    }
    const avgCollectionDays = count > 0 ? Math.round(totalDays / count) : 12;

    // 5. Payment Breakdown Details
    let billWhere = ['customer_id = ?', "payment_status = 'Approved'"];
    let billParams = [customerId];
    if (branch && branch !== 'All' && branch !== 'All Branches') {
      billWhere.push('company = ?');
      billParams.push(branch);
    }
    if (startDate) {
      billWhere.push('billing_date >= ?');
      billParams.push(startDate);
    }
    if (endDate) {
      billWhere.push('billing_date <= ?');
      billParams.push(endDate);
    }
    const [billPayRows] = await pool.query(
      `SELECT COALESCE(SUM(cash_paid), 0.00) as cash, COALESCE(SUM(upi_paid), 0.00) as upi, COALESCE(SUM(bank_paid), 0.00) as bank 
       FROM customer_bills 
       WHERE ${billWhere.join(' AND ')}`,
      billParams
    );
    const billDownpayments = billPayRows[0] || { cash: 0, upi: 0, bank: 0 };

    let cpWhere = ['cb.customer_id = ?', "cp.payment_status = 'Approved'"];
    let cpParams = [customerId];
    if (branch && branch !== 'All' && branch !== 'All Branches') {
      cpWhere.push('cb.company = ?');
      cpParams.push(branch);
    }
    if (startDate) {
      cpWhere.push('cp.payment_date >= ?');
      cpParams.push(startDate);
    }
    if (endDate) {
      cpWhere.push('cp.payment_date <= ?');
      cpParams.push(endDate);
    }
    const [manualPayRows] = await pool.query(
      `SELECT cp.payment_method, COALESCE(SUM(cp.amount_received), 0.00) as total 
       FROM customer_payments cp
       JOIN customer_bills cb ON cp.bill_id = cb.id
       WHERE ${cpWhere.join(' AND ')}
       GROUP BY cp.payment_method`,
      cpParams
    );

    let canWhere = ['cb.customer_id = ?', "cp.payment_status = 'Approved'"];
    let canParams = [customerId];
    if (startDate) {
      canWhere.push('cp.payment_date >= ?');
      canParams.push(startDate);
    }
    if (endDate) {
      canWhere.push('cp.payment_date <= ?');
      canParams.push(endDate);
    }
    const [canPayRows] = await pool.query(
      `SELECT cp.payment_method, COALESCE(SUM(cp.amount_paid), 0.00) as total 
       FROM can_payments cp
       JOIN can_billing cb ON cp.bill_id = cb.id
       WHERE ${canWhere.join(' AND ')}
       GROUP BY cp.payment_method`,
      canParams
    );

    let payCash = parseFloat(billDownpayments.cash);
    let payUpi = parseFloat(billDownpayments.upi);
    let payBank = parseFloat(billDownpayments.bank);
    let payCheque = 0.00;
    let payOnline = 0.00;

    const addBreakdown = (method, amount) => {
      const m = String(method || '').toLowerCase();
      if (m.includes('cash')) {
        payCash += amount;
      } else if (m.includes('upi')) {
        payUpi += amount;
      } else if (m.includes('cheque')) {
        payCheque += amount;
      } else if (m.includes('online')) {
        payOnline += amount;
      } else {
        payBank += amount;
      }
    };

    manualPayRows.forEach(r => addBreakdown(r.payment_method, parseFloat(r.total)));
    canPayRows.forEach(r => addBreakdown(r.payment_method, parseFloat(r.total)));

    // 6. Last 12 Months Analytics
    const monthsList = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(ist.getFullYear(), ist.getMonth() - i, 1);
      monthsList.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }

    let trendQuery = `
      SELECT 
        DATE_FORMAT(cl.date, '%Y-%m') AS month,
        cl.entry_type,
        cl.particular,
        cl.debit,
        cl.credit,
        COALESCE(
          (SELECT cb_b.company FROM customer_bills cb_b WHERE cb_b.id = cl.reference_no),
          (SELECT cb_b2.company FROM customer_payments cp_b JOIN customer_bills cb_b2 ON cp_b.bill_id = cb_b2.id WHERE cp_b.id = cl.reference_no),
          'Main Branch'
        ) AS branch
      FROM customer_ledger cl
      WHERE cl.customer_id = ? AND cl.date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
    `;
    const [trendRows] = await pool.query(trendQuery, [customerId]);

    const monthlyDataMap = {};
    monthsList.forEach(m => {
      monthlyDataMap[m] = { month: m, sales: 0, payments: 0, returns: 0 };
    });

    trendRows.forEach(row => {
      const m = row.month;
      if (!monthlyDataMap[m]) return;
      
      if (branch && branch !== 'All' && branch !== 'All Branches' && row.branch !== branch) {
        return;
      }

      const debit = parseFloat(row.debit) || 0;
      const credit = parseFloat(row.credit) || 0;
      const entryType = String(row.entry_type).toUpperCase();
      const particular = String(row.particular);

      const isInvoice = ['SALE', 'BILL GENERATED'].includes(entryType);
      const isSalesReturn = ['SALES_RETURN', 'CREDIT_NOTE', 'SALES RETURN'].includes(entryType) || 
                            (entryType === 'PAYMENT' && particular.toLowerCase().startsWith('sales return'));
      const isPayment = ['PAYMENT', 'PAYMENT RECEIVED', 'ADVANCE_PAYMENT', 'ADVANCE PAYMENT'].includes(entryType) && !isSalesReturn;

      if (isInvoice) {
        monthlyDataMap[m].sales += debit;
      } else if (isSalesReturn) {
        monthlyDataMap[m].returns += credit;
      } else if (isPayment) {
        monthlyDataMap[m].payments += credit;
      }
    });
    const monthlyAnalytics = monthsList.map(m => monthlyDataMap[m]);

    // 7. Aging Buckets (FIFO)
    let tempCredit = totalCreditCumulative;
    let aging = {
      bucket0_30: 0.00,
      bucket31_60: 0.00,
      bucket61_90: 0.00,
      bucket91_plus: 0.00
    };

    const invoicesForAging = filteredRowsForAging.filter(r => ['SALE', 'BILL GENERATED'].includes(r.entry_type.toUpperCase()));
    for (const inv of invoicesForAging) {
      const debit = parseFloat(inv.debit);
      if (tempCredit >= debit) {
        tempCredit -= debit;
      } else {
        const unpaid = debit - tempCredit;
        tempCredit = 0;

        const saleDate = new Date(inv.date);
        const diffTime = Math.abs(ist - saleDate);
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

    // 8. Recent Activity Timeline
    const recentActivity = filteredRowsForTimeline.slice(-5).reverse().map(row => {
      let typeLabel = 'Transaction Logged';
      let value = 0;
      const entryType = String(row.entry_type).toUpperCase();
      const particular = String(row.particular);
      const debit = parseFloat(row.debit) || 0;
      const credit = parseFloat(row.credit) || 0;

      const isInvoice = ['SALE', 'BILL GENERATED'].includes(entryType);
      const isSalesReturn = ['SALES_RETURN', 'CREDIT_NOTE', 'SALES RETURN'].includes(entryType) || 
                            (entryType === 'PAYMENT' && particular.toLowerCase().startsWith('sales return'));
      const isPayment = ['PAYMENT', 'PAYMENT RECEIVED', 'ADVANCE_PAYMENT', 'ADVANCE PAYMENT'].includes(entryType) && !isSalesReturn;
      const isRefund = ['REFUND', 'CAN RETURN (FULL)'].includes(entryType);

      if (isInvoice) {
        typeLabel = 'Invoice Created';
        value = debit;
      } else if (isSalesReturn) {
        typeLabel = 'Sales Return';
        value = credit;
      } else if (isPayment) {
        typeLabel = 'Payment Received';
        value = credit;
      } else if (isRefund) {
        typeLabel = 'Refund Paid';
        value = debit;
      } else {
        if (credit > 0) {
          typeLabel = 'Credit Adjusted';
          value = credit;
        } else {
          typeLabel = 'Debit Note';
          value = debit;
        }
      }

      return {
        type: typeLabel,
        amount: value,
        date: row.date,
        particular: particular
      };
    });

    const customerSince = allRows.length > 0 ? allRows[0].date : 'N/A';

    res.json({
      ok: true,
      summary: {
        customerName: customer.name,
        customerPhone: customer.phone,
        customerGstin: customer.gstin || 'N/A',
        customerAddress: customer.address || 'N/A',
        grossSales,
        salesReturn,
        returnAmount: salesReturn, 
        netSales,
        netRevenue: netSales,      
        paymentsReceived,
        outstandingDue,
        creditBalance,
        refundsPaid: {
          total: refundsPaidVal,
          cash: refundsPaidVal, // simplify/fallback inside ledger, details from DB are loaded below
          bank: 0.00,
          upi: 0.00,
          cheque: 0.00
        },
        businessInsights: {
          totalInvoices: totalInvoicesCount,
          totalPayments: totalPaymentsCount,
          totalReturns: totalReturnsCount,
          lastInvoiceDate,
          lastPaymentDate,
          lastReturnDate,
          avgCollectionDays,
          customerSince
        },
        paymentBreakdown: {
          cash: payCash,
          bank: payBank,
          upi: payUpi,
          cheque: payCheque,
          online: payOnline
        },
        monthlyAnalytics,
        aging,
        customerHealth: {
          creditLimit,
          currentExposure: outstandingDue,
          availableCredit: Math.max(0, creditLimit - outstandingDue),
          creditUtilization: creditLimit > 0 ? Math.round((outstandingDue / creditLimit) * 100) : 0
        },
        recentActivity
      }
    });
  } catch (error) {
    console.error('Fetch ledger summary error:', error);
    res.status(400).json({ ok: false, error: error.message });
  }
});

// GET /api/accounts-ledger/transactions/:customerId - Get chronological transactions list with filtering
router.get('/transactions/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;
    const { 
      startDate = '', 
      endDate = '', 
      branch = '', 
      transactionType = '', 
      referenceNo = '' 
    } = req.query;

    // 1. Calculate Opening Balance before startDate (respects branch filter)
    let openingBalance = 0.00;
    if (startDate) {
      let opWhereClauses = ['cl.customer_id = ?', 'cl.date < ?'];
      let opQueryParams = [customerId, startDate];

      let opOuterWhereClauses = [];
      let opOuterQueryParams = [];
      if (branch && branch !== 'All' && branch !== 'All Branches') {
        opOuterWhereClauses.push('t.branch = ?');
        opOuterQueryParams.push(branch);
      }

      let opQuery = `
        SELECT COALESCE(SUM(debit), 0.00) AS total_debit, COALESCE(SUM(credit), 0.00) AS total_credit
        FROM (
          SELECT 
            cl.date,
            cl.debit,
            cl.credit,
            COALESCE(
              (SELECT cb_b.company FROM customer_bills cb_b WHERE cb_b.id = cl.reference_no),
              (SELECT cb_b2.company FROM customer_payments cp_b JOIN customer_bills cb_b2 ON cp_b.bill_id = cb_b2.id WHERE cp_b.id = cl.reference_no),
              'Main Branch'
            ) AS branch
          FROM customer_ledger cl
          WHERE ${opWhereClauses.join(' AND ')}
        ) AS t
        ${opOuterWhereClauses.length > 0 ? 'WHERE ' + opOuterWhereClauses.join(' AND ') : ''}
      `;

      const [opRows] = await pool.query(opQuery, [...opQueryParams, ...opOuterQueryParams]);
      openingBalance = parseFloat(opRows[0].total_debit) - parseFloat(opRows[0].total_credit);
    }

    // 2. Build Query with metadata resolving (branch, created_by, remarks)
    let whereClauses = ['cl.customer_id = ?'];
    let queryParams = [customerId];

    let outerWhereClauses = [];
    let outerQueryParams = [];

    if (startDate) {
      outerWhereClauses.push('t.date >= ?');
      outerQueryParams.push(startDate);
    }
    if (endDate) {
      outerWhereClauses.push('t.date <= ?');
      outerQueryParams.push(endDate);
    }
    if (branch && branch !== 'All' && branch !== 'All Branches') {
      outerWhereClauses.push('t.branch = ?');
      outerQueryParams.push(branch);
    }
    if (transactionType && transactionType !== 'All') {
      if (transactionType === 'Sale Invoice') {
        outerWhereClauses.push('t.entry_type IN (\'SALE\', \'BILL GENERATED\')');
      } else if (transactionType === 'Sales Return') {
        outerWhereClauses.push('(t.entry_type IN (\'SALES_RETURN\', \'CREDIT_NOTE\', \'SALES RETURN\') OR (t.entry_type = \'PAYMENT\' AND t.particular LIKE \'Sales Return%\'))');
      } else if (transactionType === 'Payment') {
        outerWhereClauses.push('(t.entry_type IN (\'PAYMENT\', \'PAYMENT RECEIVED\', \'ADVANCE_PAYMENT\', \'ADVANCE PAYMENT\') AND NOT (t.entry_type = \'PAYMENT\' AND t.particular LIKE \'Sales Return%\'))');
      } else if (transactionType === 'Debit Note') {
        outerWhereClauses.push('t.entry_type IN (\'DEBIT_NOTE\', \'CAN DAMAGE CHARGE\')');
      } else if (transactionType === 'Credit Note') {
        outerWhereClauses.push('t.entry_type IN (\'CREDIT_NOTE\')');
      } else if (transactionType === 'Advance Payment') {
        outerWhereClauses.push('t.entry_type IN (\'ADVANCE_PAYMENT\', \'ADVANCE PAYMENT\')');
      } else if (transactionType === 'Refund') {
        outerWhereClauses.push('t.entry_type IN (\'REFUND\', \'CAN RETURN (FULL)\')');
      } else {
        outerWhereClauses.push('t.entry_type = ?');
        outerQueryParams.push(transactionType);
      }
    }
    if (referenceNo.trim()) {
      outerWhereClauses.push('(t.reference_no LIKE ? OR t.particular LIKE ?)');
      outerQueryParams.push(`%${referenceNo.trim()}%`, `%${referenceNo.trim()}%`);
    }

    let mainQuery = `
      SELECT * FROM (
        SELECT 
          cl.id, 
          DATE_FORMAT(cl.date, '%Y-%m-%d') as date, 
          cl.entry_type, 
          cl.reference_no, 
          cl.particular, 
          cl.debit, 
          cl.credit, 
          cl.balance,
          COALESCE(
            (SELECT cb_b.company FROM customer_bills cb_b WHERE cb_b.id = cl.reference_no),
            (SELECT cp_b.company FROM customer_payments cp_b WHERE cp_b.id = cl.reference_no AND cp_b.company IS NOT NULL AND cp_b.company != ''),
            (SELECT cb_b2.company FROM customer_payments cp_b JOIN customer_bills cb_b2 ON cp_b.bill_id = cb_b2.id WHERE cp_b.id = cl.reference_no),
            'Main Branch'
          ) AS branch,
          COALESCE(
            (SELECT pa_c.entered_by FROM payment_approvals pa_c WHERE pa_c.transaction_id = cl.reference_no OR pa_c.reference_no = cl.reference_no LIMIT 1),
            'Admin'
          ) AS created_by,
          COALESCE(
            (SELECT cp_r.remarks FROM customer_payments cp_r WHERE cp_r.id = cl.reference_no),
            (SELECT pa_r.remarks FROM payment_approvals pa_r WHERE pa_r.transaction_id = cl.reference_no OR pa_r.reference_no = cl.reference_no LIMIT 1),
            ''
          ) AS remarks
        FROM customer_ledger cl
        WHERE ${whereClauses.join(' AND ')}
      ) AS t
      ${outerWhereClauses.length > 0 ? 'WHERE ' + outerWhereClauses.join(' AND ') : ''}
      ORDER BY t.date ASC, t.id ASC
    `;

    const [rows] = await pool.query(mainQuery, [...queryParams, ...outerQueryParams]);

    // 3. Re-calculate running balances chronologically starting from opening balance
    let currentBalance = openingBalance;
    const transactions = rows.map(row => {
      currentBalance = currentBalance + parseFloat(row.debit) - parseFloat(row.credit);
      
      // Determine friendly transaction type label for rendering
      let displayType = row.entry_type;
      const upperEntry = row.entry_type.toUpperCase();
      const lowerPart = row.particular.toLowerCase();

      if (['SALE', 'BILL GENERATED'].includes(upperEntry)) {
        displayType = 'Sale Invoice';
      } else if (['SALES_RETURN', 'CREDIT_NOTE', 'SALES RETURN'].includes(upperEntry) || 
                 (upperEntry === 'PAYMENT' && lowerPart.startsWith('sales return'))) {
        displayType = 'Sales Return';
      } else if (upperEntry === 'PAYMENT' && lowerPart.includes('credit balance applied')) {
        displayType = 'Credit Note';
      } else if (['PAYMENT', 'PAYMENT RECEIVED'].includes(upperEntry)) {
        displayType = 'Payment';
      } else if (['ADVANCE_PAYMENT', 'ADVANCE PAYMENT'].includes(upperEntry)) {
        displayType = 'Advance Payment';
      } else if (upperEntry === 'CAN DAMAGE CHARGE') {
        displayType = 'Debit Note';
      } else if (['CAN RETURN (FULL)', 'REFUND'].includes(upperEntry)) {
        displayType = 'Refund';
      }

      return {
        id: row.id,
        date: row.date,
        entryType: displayType,
        dbEntryType: row.entry_type,
        referenceNo: row.reference_no,
        particular: row.particular,
        debit: parseFloat(row.debit),
        credit: parseFloat(row.credit),
        runningBalance: currentBalance,
        branch: row.branch,
        createdBy: row.created_by,
        remarks: row.remarks
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

// PUT /api/accounts-ledger/transactions/:id - Update an individual journal entry
router.put('/transactions/:id', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const entryId = Number.parseInt(req.params.id, 10);
    const { customerId, date, particular, debit, credit } = req.body;
    const debitAmount = Number(debit);
    const creditAmount = Number(credit);

    if (!Number.isInteger(entryId) || entryId <= 0) {
      return res.status(400).json({ ok: false, error: 'Invalid ledger entry id.' });
    }
    if (!customerId || !/^\d{4}-\d{2}-\d{2}$/.test(String(date)) || !String(particular || '').trim()) {
      return res.status(400).json({ ok: false, error: 'Customer, date and particulars are required.' });
    }
    if (!Number.isFinite(debitAmount) || !Number.isFinite(creditAmount) || debitAmount < 0 || creditAmount < 0) {
      return res.status(400).json({ ok: false, error: 'Debit and credit must be valid non-negative amounts.' });
    }
    if ((debitAmount === 0 && creditAmount === 0) || (debitAmount > 0 && creditAmount > 0)) {
      return res.status(400).json({ ok: false, error: 'Enter an amount in either debit or credit, but not both.' });
    }

    await connection.beginTransaction();
    const [rows] = await connection.query(
      'SELECT id FROM customer_ledger WHERE id = ? AND customer_id = ? FOR UPDATE',
      [entryId, customerId]
    );
    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ ok: false, error: 'Ledger entry not found for this customer.' });
    }

    await connection.query(
      `UPDATE customer_ledger SET date = ?, particular = ?, debit = ?, credit = ?
       WHERE id = ? AND customer_id = ?`,
      [date, String(particular).trim(), debitAmount, creditAmount, entryId, customerId]
    );
    await recalculateLedgerBalances(connection, customerId);
    await connection.commit();
    res.json({ ok: true, message: 'Journal entry updated successfully.' });
  } catch (error) {
    try { await connection.rollback(); } catch { /* transaction may not have started */ }
    console.error('Update ledger transaction error:', error);
    res.status(400).json({ ok: false, error: error.message });
  } finally {
    connection.release();
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

// POST /api/accounts-ledger/advance-payment - Record customer advance payment directly (Transaction Safe)
router.post('/advance-payment', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    let {
      customerId,
      company,
      paymentDate,
      cashAmount = 0,
      bankAmount = 0,
      upiAmount = 0,
      remarks = ''
    } = req.body;

    if (!customerId) throw new Error('Customer selection is required.');
    if (!company) throw new Error('Company selection is mandatory. Please select a company from the dropdown.');
    if (!paymentDate) throw new Error('Payment Date is required.');

    const cashVal = parseFloat(cashAmount) || 0;
    const bankVal = parseFloat(bankAmount) || 0;
    const upiVal = parseFloat(upiAmount) || 0;
    const totalAdvance = cashVal + bankVal + upiVal;

    if (isNaN(totalAdvance) || totalAdvance <= 0) {
      throw new Error('Total advance payment amount must be greater than 0.');
    }

    // Resolve payment method string
    const modes = [];
    if (cashVal > 0) modes.push('Cash');
    if (bankVal > 0) modes.push('Bank');
    if (upiVal > 0) modes.push('UPI');
    const resolvedPaymentMethod = modes.join(' + ') || 'Cash';

    // Verify customer exists
    const [custCheck] = await connection.query(
      `SELECT name FROM customers WHERE id = ?`,
      [customerId]
    );
    if (custCheck.length === 0) throw new Error('Customer not found.');

    const cleanCustName = custCheck[0].name;

    // Generate Sequence Payment ID for Customer Payments
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const istDate = new Date(now.getTime() + (330 + offset) * 60000);
    const yyyy = istDate.getFullYear();
    const [payRows] = await connection.query(
      `SELECT id FROM customer_payments WHERE id LIKE ? ORDER BY id DESC LIMIT 1`,
      [`PAY-${yyyy}-%`]
    );
    let seq = 1;
    if (payRows.length) {
      const lastId = payRows[0].id;
      const match = lastId.match(new RegExp(`^PAY-${yyyy}-(\\d+)$`));
      if (match && match[1]) {
        seq = parseInt(match[1]) + 1;
      }
    }
    const paymentId = `PAY-${yyyy}-${String(seq).padStart(5, '0')}`;

    const cleanRemarks = `Advance Payment (${company}). ${String(remarks || '').trim()}`.trim();

    // 1. Insert approved payment record into customer_payments
    await connection.query(
      `INSERT INTO customer_payments 
       (id, bill_id, company, payment_date, payment_method, amount_received, cash_paid, upi_paid, bank_paid, remarks, 
        payment_status, pending_amount, approved_amount, rejected_amount, approval_id, created_at)
       VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, 'Approved', 0.00, ?, 0.00, NULL, NOW())`,
      [
        paymentId,
        company,
        paymentDate,
        resolvedPaymentMethod,
        totalAdvance,
        cashVal,
        upiVal,
        bankVal,
        cleanRemarks,
        totalAdvance
      ]
    );

    // 2. Direct PAYMENT credit entry into customer_ledger
    await addLedgerEntry(connection, {
      date: paymentDate,
      customerId: customerId,
      entryType: 'PAYMENT',
      referenceNo: paymentId,
      particular: `Advance Payment Received (${company} — ${resolvedPaymentMethod})`,
      debit: 0.00,
      credit: totalAdvance
    });

    await connection.commit();

    res.json({
      ok: true,
      paymentId,
      message: `Advance payment of ₹${totalAdvance.toLocaleString('en-IN', { minimumFractionDigits: 2 })} recorded successfully for ${cleanCustName}!`
    });
  } catch (error) {
    await connection.rollback();
    console.error('Advance payment error:', error);
    res.status(400).json({ ok: false, error: error.message });
  } finally {
    connection.release();
  }
});

export default router;
