import pool from './config/db.js';

async function seedAllTables() {
  console.log('🚀 Starting comprehensive database seeding across ALL module tables...');

  try {
    // 1. Seed Company Details
    console.log('1. Seeding company_details...');
    await pool.query(`
      INSERT INTO company_details (id, company_name, phone_number, gst_number, address, bank_name, account_number, ifsc_code)
      VALUES 
      ('COMP-001', 'Kempannavar Industries', '9845012345', '29ABCDE1234F1Z5', 'Plot No 45, Industrial Area, Hospet, Karnataka - 583201', 'State Bank of India', '30948576123', 'SBIN0000301'),
      ('COMP-002', 'Kemps Pet Industries', '9845067890', '29XYZAB5678G2Z9', 'Plot No 46, Industrial Area, Hospet, Karnataka - 583201', 'HDFC Bank', '50100239485712', 'HDFC0000104')
      ON DUPLICATE KEY UPDATE company_name = VALUES(company_name), phone_number = VALUES(phone_number)
    `);

    // 2. Seed Customers
    console.log('2. Seeding customers...');
    const mockCustomers = [
      ['CUST-2026-00001', 'Hari Om Caterings', '9035558246', '29ABCDE1234F1Z5', 'Hospet Caterings, Hospet'],
      ['CUST-2026-00002', 'H A Caterings (Manjunath)', '9946558774', '29BCDEF2345G2Z6', 'Main Road, Hospet'],
      ['CUST-2026-00003', 'K N Caterings (Naveen Kumar)', '9071290011', '', 'Near Bus Stand, Hospet'],
      ['CUST-2026-00004', 'Appu Caterings (Lohith)', '9535841371', '29CDEFG3456H3Z7', 'Station Road, Hospet'],
      ['CUST-2026-00005', 'Seema Caterings (Seema P)', '8050352246', '', 'Gandhi Nagar, Hospet'],
      ['CUST-2026-00006', 'C.P. Caterings (Manjunath)', '9480000892', '29DEFGH4567I4Z8', 'Market Yard, Hospet'],
      ['CUST-2026-00007', 'Rajanna Caterings', '9035584708', '', 'College Road, Hospet'],
      ['CUST-2026-00008', 'Venkatesh Caterings', '8431009875', '29EFGHI5678J5Z9', 'Nehru Colony, Hospet'],
      ['CUST-2026-00009', 'M.S. Caterings (Nagaraj)', '9980717578', '', 'Bellary Road, Hospet'],
      ['CUST-2026-00010', 'Gururaj Caterings', '9880447423', '29FGHIJ6789K6Z0', 'Gangavathi Road, Hospet']
    ];
    for (const c of mockCustomers) {
      await pool.query(
        `INSERT INTO customers (id, name, phone, gstin, address) VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name), address = VALUES(address)`,
        c
      );
    }

    const [customerRows] = await pool.query('SELECT * FROM customers');
    const [productRows] = await pool.query('SELECT * FROM finished_products');
    const [rawMatRows] = await pool.query('SELECT * FROM raw_materials');

    // 3. Prepare dates (Today + 3 Past Days)
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const istDate = new Date(now.getTime() + (330 + offset) * 60000);
    const yyyy = istDate.getFullYear();
    const mm = String(istDate.getMonth() + 1).padStart(2, '0');
    const dd = String(istDate.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;

    const pastDate1 = new Date(istDate.getTime() - 86400000 * 1).toISOString().split('T')[0];
    const pastDate2 = new Date(istDate.getTime() - 86400000 * 2).toISOString().split('T')[0];
    const pastDate3 = new Date(istDate.getTime() - 86400000 * 3).toISOString().split('T')[0];

    // 4. Seed Expenses
    console.log('4. Seeding expenses...');
    const expenseData = [
      ['EXP-2026-00001', todayStr, 'Diesel for Delivery Vehicles', 3500.00, 'Admin', 'Regular fuel refill'],
      ['EXP-2026-00002', todayStr, 'Factory Staff Refreshments', 650.00, 'Admin', 'Tea and snacks'],
      ['EXP-2026-00003', todayStr, 'Electrical Maintenance Spare Parts', 1200.00, 'Manager', 'Switch replacement'],
      ['EXP-2026-00004', pastDate1, 'Packaging Tape & Strapping Roll', 2400.00, 'Admin', 'Material purchase'],
      ['EXP-2026-00005', pastDate1, 'Office Stationary & Printing', 450.00, 'Staff', 'Paper rolls for POS'],
      ['EXP-2026-00006', pastDate2, 'Water Plant Filter Media Cleaning', 4800.00, 'Technician', 'Routine servicing'],
      ['EXP-2026-00007', pastDate3, 'Vehicle Tyre Patch & Maintenance', 1100.00, 'Driver', 'Pickup truck tyre fix']
    ];
    for (const exp of expenseData) {
      await pool.query(
        `INSERT INTO expenses (id, expense_date, particulars, amount, entered_by, remarks)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE amount = VALUES(amount), particulars = VALUES(particulars)`,
        exp
      );
    }

    // 5. Seed Customer Bills & Bill Items
    console.log('5. Seeding customer_bills & customer_bill_items...');
    const mockBillConfigs = [
      { date: todayStr, comp: 'Kempannavar Industries', custIdx: 0, mode: 'Cash', paidPct: 1.0, tax: 18 },
      { date: todayStr, comp: 'Kemps Pet Industries', custIdx: 1, mode: 'UPI', paidPct: 1.0, tax: 18 },
      { date: todayStr, comp: 'Kempannavar Industries', custIdx: 2, mode: 'Credit', paidPct: 0.0, tax: 18 },
      { date: todayStr, comp: 'Kemps Pet Industries', custIdx: 3, mode: 'Cash', paidPct: 1.0, tax: 12 },
      { date: todayStr, comp: 'Kempannavar Industries', custIdx: 4, mode: 'UPI', paidPct: 1.0, tax: 18 },
      { date: todayStr, comp: 'Kemps Pet Industries', custIdx: 5, mode: 'Credit', paidPct: 0.5, tax: 18 },
      { date: todayStr, comp: 'Kempannavar Industries', custIdx: 6, mode: 'Cash', paidPct: 1.0, tax: 18 },
      { date: todayStr, comp: 'Kemps Pet Industries', custIdx: 7, mode: 'Bank', paidPct: 1.0, tax: 12 },
      { date: todayStr, comp: 'Kempannavar Industries', custIdx: 8, mode: 'Credit', paidPct: 0.0, tax: 18 },
      { date: todayStr, comp: 'Kemps Pet Industries', custIdx: 9, mode: 'UPI', paidPct: 1.0, tax: 18 },
      { date: todayStr, comp: 'Kempannavar Industries', custIdx: 0, mode: 'Cash', paidPct: 1.0, tax: 18 },
      { date: todayStr, comp: 'Kemps Pet Industries', custIdx: 1, mode: 'Credit', paidPct: 0.2, tax: 18 },
      { date: todayStr, comp: 'Kempannavar Industries', custIdx: 2, mode: 'Cash', paidPct: 1.0, tax: 12 },
      { date: todayStr, comp: 'Kemps Pet Industries', custIdx: 3, mode: 'UPI', paidPct: 1.0, tax: 18 },
      { date: todayStr, comp: 'Kempannavar Industries', custIdx: 4, mode: 'Credit', paidPct: 0.0, tax: 18 },

      { date: pastDate1, comp: 'Kempannavar Industries', custIdx: 5, mode: 'Cash', paidPct: 1.0, tax: 18 },
      { date: pastDate1, comp: 'Kemps Pet Industries', custIdx: 6, mode: 'Credit', paidPct: 0.0, tax: 18 },
      { date: pastDate1, comp: 'Kempannavar Industries', custIdx: 7, mode: 'UPI', paidPct: 1.0, tax: 12 },
      { date: pastDate2, comp: 'Kemps Pet Industries', custIdx: 8, mode: 'Cash', paidPct: 1.0, tax: 18 },
      { date: pastDate2, comp: 'Kempannavar Industries', custIdx: 9, mode: 'Bank', paidPct: 1.0, tax: 18 },
      { date: pastDate2, comp: 'Kemps Pet Industries', custIdx: 0, mode: 'Credit', paidPct: 0.4, tax: 18 },
      { date: pastDate3, comp: 'Kempannavar Industries', custIdx: 1, mode: 'Cash', paidPct: 1.0, tax: 12 },
      { date: pastDate3, comp: 'Kemps Pet Industries', custIdx: 2, mode: 'UPI', paidPct: 1.0, tax: 18 },
      { date: pastDate3, comp: 'Kempannavar Industries', custIdx: 3, mode: 'Credit', paidPct: 0.0, tax: 18 },
      { date: pastDate3, comp: 'Kemps Pet Industries', custIdx: 4, mode: 'Cash', paidPct: 1.0, tax: 18 }
    ];

    let seqCounter = 1;
    for (const cfg of mockBillConfigs) {
      const billId = `BILL-${yyyy}-${String(seqCounter).padStart(5, '0')}`;
      seqCounter++;

      const customer = customerRows[cfg.custIdx % customerRows.length];
      const prod1 = productRows[(seqCounter * 2) % productRows.length];
      const prod2 = productRows[(seqCounter * 3 + 1) % productRows.length];

      const qty1 = (seqCounter % 5) + 2;
      const rate1 = 120 + (seqCounter % 4) * 30;
      const total1 = qty1 * rate1;
      const basicRate1 = Math.round((rate1 / (1 + cfg.tax / 100)) * 100) / 100;

      const qty2 = (seqCounter % 3) + 5;
      const rate2 = 80 + (seqCounter % 3) * 20;
      const total2 = qty2 * rate2;
      const basicRate2 = Math.round((rate2 / (1 + cfg.tax / 100)) * 100) / 100;

      const grandTotal = Math.round((total1 + total2) * 100) / 100;
      const amountPaid = Math.round((grandTotal * cfg.paidPct) * 100) / 100;
      const dueAmount = Math.round((grandTotal - amountPaid) * 100) / 100;

      let cashPaid = 0, upiPaid = 0, bankPaid = 0;
      if (cfg.mode === 'Cash') cashPaid = amountPaid;
      else if (cfg.mode === 'UPI') upiPaid = amountPaid;
      else if (cfg.mode === 'Bank') bankPaid = amountPaid;
      else if (cfg.mode === 'Credit') cashPaid = amountPaid;

      await pool.query(
        `INSERT INTO customer_bills 
         (id, billing_date, company, customer_type, customer_id, customer_name, customer_phone, customer_gstin, customer_address, grand_total, payment_mode, amount_paid, due_amount, cash_paid, upi_paid, bank_paid, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE grand_total = VALUES(grand_total), amount_paid = VALUES(amount_paid), due_amount = VALUES(due_amount)`,
        [
          billId, cfg.date, cfg.comp, 'Distributor', customer.id, customer.name,
          customer.phone, customer.gstin, customer.address, grandTotal, cfg.mode,
          amountPaid, dueAmount, cashPaid, upiPaid, bankPaid
        ]
      );

      await pool.query(`DELETE FROM customer_bill_items WHERE bill_id = ?`, [billId]);
      await pool.query(
        `INSERT INTO customer_bill_items 
         (bill_id, finished_product_id, quantity, rate_with_tax, tax_percent, basic_rate, total_amount)
         VALUES 
         (?, ?, ?, ?, ?, ?, ?),
         (?, ?, ?, ?, ?, ?, ?)`,
        [
          billId, prod1.id, qty1, rate1, cfg.tax, basicRate1, total1,
          billId, prod2.id, qty2, rate2, cfg.tax, basicRate2, total2
        ]
      );

      // Seed Customer Payments for partially/fully paid bills
      if (amountPaid > 0) {
        const payId = `PAY-${yyyy}-${String(seqCounter).padStart(5, '0')}`;
        await pool.query(
          `INSERT INTO customer_payments (id, bill_id, payment_date, payment_method, amount_received, remarks)
           VALUES (?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE amount_received = VALUES(amount_received)`,
          [payId, billId, cfg.date, cfg.mode, amountPaid, `Payment for ${billId}`]
        );
      }

      // Seed Customer Ledger
      await pool.query(
        `INSERT INTO customer_ledger (date, customer_id, entry_type, reference_no, particular, debit, credit, balance, created_at)
         VALUES (?, ?, 'SALE', ?, ?, ?, 0.00, ?, NOW())`,
        [cfg.date, customer.id, billId, `Sale Invoice ${billId}`, grandTotal, dueAmount]
      );
    }

    // 6. Seed Customer Orders
    console.log('6. Seeding customer_orders...');
    const orderData = [
      ['ORD-2026-00001', customerRows[0].id, customerRows[0].name, customerRows[0].phone, customerRows[0].address, todayStr, '10:00:00', 'Cash', 1500.00, 1500.00, 0.00, 'DELIVERED', 'Admin'],
      ['ORD-2026-00002', customerRows[1].id, customerRows[1].name, customerRows[1].phone, customerRows[1].address, todayStr, '11:30:00', 'UPI', 2400.00, 2400.00, 0.00, 'DELIVERED', 'Admin'],
      ['ORD-2026-00003', customerRows[2].id, customerRows[2].name, customerRows[2].phone, customerRows[2].address, todayStr, '14:00:00', 'Credit', 1800.00, 0.00, 1800.00, 'PENDING', 'Staff'],
      ['ORD-2026-00004', customerRows[3].id, customerRows[3].name, customerRows[3].phone, customerRows[3].address, pastDate1, '16:00:00', 'Cash', 3200.00, 3200.00, 0.00, 'DELIVERED', 'Admin']
    ];
    for (const ord of orderData) {
      await pool.query(
        `INSERT INTO customer_orders (id, customer_id, customer_name, customer_phone, customer_address, supply_date, supply_time, payment_mode, grand_total, advance_amount, pending_amount, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE grand_total = VALUES(grand_total)`,
        ord
      );

      await pool.query(`DELETE FROM customer_order_items WHERE order_id = ?`, [ord[0]]);
      await pool.query(
        `INSERT INTO customer_order_items (order_id, finished_product_id, quantity, rate, amount)
         VALUES (?, ?, 10, 150.00, 1500.00)`,
        [ord[0], productRows[0].id]
      );
    }

    // 7. Seed Inventory Bills (Raw Material Purchases)
    console.log('7. Seeding inventory_bills...');
    const invBillData = [
      ['INV-2026-00001', pastDate2, 'COMP-001', 'Kempannavar', 'BILL-RM-101', 'Bank', 15000.00, 2700.00, 500.00, 18200.00, 'SETTLED', 'Preform purchase'],
      ['INV-2026-00002', pastDate1, 'COMP-002', 'Kemps Pet', 'BILL-RM-102', 'Credit', 22000.00, 3960.00, 800.00, 26760.00, 'PENDING', 'Caps and Labels batch purchase']
    ];
    for (const inv of invBillData) {
      await pool.query(
        `INSERT INTO inventory_bills (id, bill_date, supplier_id, billed_to, bill_number, payment_method, sub_total, total_tax, additional_expenses, grand_total, status, remarks)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE grand_total = VALUES(grand_total)`,
        inv
      );

      if (rawMatRows.length > 0) {
        await pool.query(`DELETE FROM inventory_bill_items WHERE bill_id = ?`, [inv[0]]);
        await pool.query(
          `INSERT INTO inventory_bill_items (bill_id, raw_material_id, unit, bags_box, total_quantity, rate_per_unit, amount, tax_percent, tax_amount, final_total)
           VALUES (?, ?, ?, 10, 100, 150.00, 15000.00, 18.00, 2700.00, 17700.00)`,
          [inv[0], rawMatRows[0].id, rawMatRows[0].unit || 'BAGS']
        );
      }
    }

    // 8. Seed Bank Deposits
    console.log('8. Seeding bank_deposits...');
    const depositData = [
      ['DEP-2026-00001', todayStr, 1, 25000.00, 'Daily cash collection deposit', 'Admin'],
      ['DEP-2026-00002', pastDate1, 3, 18500.00, 'Counter sales cash deposit', 'Admin'],
      ['DEP-2026-00003', pastDate2, 1, 30000.00, 'Distributor cheque deposit', 'Admin']
    ];
    for (const dep of depositData) {
      await pool.query(
        `INSERT INTO bank_deposits (id, deposit_date, bank_account_id, amount, notes, entered_by)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE amount = VALUES(amount)`,
        dep
      );
    }

    // 9. Seed Sunday Loading
    console.log('9. Seeding sunday_loading...');
    const sundayData = [
      ['TXN-SL-001', pastDate3, customerRows[0].id, customerRows[0].name, customerRows[0].phone, customerRows[0].address, 'Distributor', productRows[0].id, productRows[0].name, 50, 120.00, 6000.00, 6000.00, 0, 0, 6000.00, 0, 'Sunday morning load'],
      ['TXN-SL-002', pastDate3, customerRows[1].id, customerRows[1].name, customerRows[1].phone, customerRows[1].address, 'Distributor', productRows[1].id, productRows[1].name, 30, 150.00, 4500.00, 2000.00, 2500.00, 0, 4500.00, 0, 'Sunday second trip load']
    ];
    for (const sl of sundayData) {
      await pool.query(
        `INSERT INTO sunday_loading (transaction_number, loading_date, customer_id, customer_name, customer_phone, customer_address, customer_type, product_id, product_name, quantity, rate, total_amount, cash_amount, upi_amount, bank_amount, total_paid, due_amount, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE total_amount = VALUES(total_amount)`,
        sl
      );
    }

    // 10. Seed 20L Can Supply Transactions
    console.log('10. Seeding can_supply_transactions...');
    await pool.query(`
      INSERT INTO can_supply_transactions (customer_id, transaction_date, type, supply_type, product, quantity, rate, amount, notes, created_by)
      VALUES 
      ('${customerRows[0].id}', '${todayStr}', 'SUPPLY', 'VK Can', '20 Ltr Can', 20, 35.00, 700.00, 'Regular 20L Can Delivery', 'Admin'),
      ('${customerRows[1].id}', '${pastDate1}', 'SUPPLY', 'VK Can', '20 Ltr Can', 15, 35.00, 525.00, 'Regular 20L Can Delivery', 'Admin')
    `);

    // 11. Seed Pet Bottle Blowing Batches
    console.log('11. Seeding pet_bottle_batches...');
    if (rawMatRows.length >= 2) {
      await pool.query(`
        INSERT INTO pet_bottle_batches (id, batch_date, finished_product_id, raw_material_id, bags_used, actual_reading, expected_reading, difference_val, bottle_bags, wastage, notes)
        VALUES 
        ('PBB-2026-00001', '${todayStr}', ${rawMatRows[0].id}, ${rawMatRows[1].id}, 5.00, 4850.00, 5000.00, -150.00, 48, 150.00, 'Blowing line 1 run'),
        ('PBB-2026-00002', '${pastDate1}', ${rawMatRows[0].id}, ${rawMatRows[1].id}, 8.00, 7920.00, 8000.00, -80.00, 79, 80.00, 'Blowing line 2 run')
        ON DUPLICATE KEY UPDATE bags_used = VALUES(bags_used)
      `);
    }

    // 12. Seed Machine Maintenance Records
    console.log('12. Seeding maintenance_records...');
    await pool.query(`
      INSERT INTO maintenance_records (id, particular, sub_detail, company, service_date, next_due_date, note, entered_by)
      VALUES 
      ('MAINT-2026-00001', 'Blowing Machine 1', 'Nozzle cleaning & O-ring replacement', 'Kempannavar Industries', '${todayStr}', '${todayStr}', 'Scheduled maintenance', 'Admin'),
      ('MAINT-2026-00002', 'RO Filtration Plant', 'High pressure pump pressure gauge fix', 'Kemps Pet Industries', '${pastDate2}', '${pastDate2}', 'Urgent servicing', 'Manager')
      ON DUPLICATE KEY UPDATE particular = VALUES(particular)
    `);

    // 13. Seed Sales Returns
    console.log('13. Seeding sales_returns...');
    const firstBillId = `BILL-${yyyy}-00001`;
    await pool.query(`
      INSERT INTO sales_returns (id, return_date, customer_id, bill_id, total_return_amount, reason, created_by)
      VALUES 
      ('SR-2026-00001', '${todayStr}', '${customerRows[0].id}', '${firstBillId}', 240.00, 'Cap Leakage', 'Admin')
      ON DUPLICATE KEY UPDATE total_return_amount = VALUES(total_return_amount)
    `);

    console.log('✨ All DB tables populated successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error seeding DB tables:', err);
    process.exit(1);
  }
}

seedAllTables();
