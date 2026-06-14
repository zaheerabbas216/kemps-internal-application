import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
dotenv.config();

function quoteIdentifier(identifier) {
  return `\`${String(identifier).replaceAll('`', '``')}\``;
}

async function ensureCoreTables(connection) {
  console.log('Creating core tables if not exists...');

  await connection.query(`
    CREATE TABLE IF NOT EXISTS admins (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      name VARCHAR(100),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS customers (
      id VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      phone VARCHAR(15) UNIQUE NOT NULL,
      gstin VARCHAR(20),
      address TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS company_details (
      id VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci PRIMARY KEY,
      company_name VARCHAR(200) NOT NULL,
      phone_number VARCHAR(15),
      gst_number VARCHAR(20),
      bank_name VARCHAR(200),
      account_number VARCHAR(50),
      ifsc_code VARCHAR(20),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS raw_material_categories (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS raw_materials (
      id INT AUTO_INCREMENT PRIMARY KEY,
      category_id INT NOT NULL,
      sub_product_name VARCHAR(255) NOT NULL,
      unit VARCHAR(20) NOT NULL,
      status INT DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES raw_material_categories(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS finished_product_categories (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS finished_products (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      category_id INT,
      status INT DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES finished_product_categories(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS expenses (
      id VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci PRIMARY KEY,
      expense_date DATE NOT NULL,
      particulars VARCHAR(255) NOT NULL,
      amount DECIMAL(10, 2) NOT NULL,
      entered_by VARCHAR(100) NOT NULL,
      remarks TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS inventory_bills (
      id VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci PRIMARY KEY,
      bill_date DATE NOT NULL,
      supplier_id VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
      billed_to VARCHAR(100) NOT NULL,
      bill_number VARCHAR(50),
      payment_method VARCHAR(20) NOT NULL,
      sub_total DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
      total_tax DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
      additional_expenses DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
      grand_total DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
      remarks TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (supplier_id) REFERENCES company_details(id) ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS inventory_bill_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      bill_id VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
      raw_material_id INT NOT NULL,
      unit VARCHAR(20) NOT NULL,
      bags_box DECIMAL(10, 2) DEFAULT 0.00,
      total_quantity DECIMAL(12, 2) NOT NULL,
      rate_per_unit DECIMAL(12, 2) NOT NULL,
      qty_in_pcs DECIMAL(12, 2) DEFAULT 0.00,
      per_pc_rate DECIMAL(12, 2) DEFAULT 0.00,
      amount DECIMAL(12, 2) NOT NULL,
      tax_percent DECIMAL(5, 2) DEFAULT 0.00,
      tax_amount DECIMAL(12, 2) DEFAULT 0.00,
      expenses DECIMAL(12, 2) DEFAULT 0.00,
      final_total DECIMAL(12, 2) NOT NULL,
      remarks TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (bill_id) REFERENCES inventory_bills(id) ON DELETE CASCADE,
      FOREIGN KEY (raw_material_id) REFERENCES raw_materials(id) ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS stock_register (
      id INT AUTO_INCREMENT PRIMARY KEY,
      item_type VARCHAR(20) NOT NULL,
      item_id INT NOT NULL,
      transaction_type VARCHAR(20) NOT NULL,
      reference_id VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
      quantity DECIMAL(12, 2) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  console.log('Core tables verified.');
}

export async function runMigration(shouldExit = false) {
  let connection;
  try {
    const dbName = process.env.DB_NAME || 'kemps_inventory';

    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || ''
    });

    await connection.query(
      `CREATE DATABASE IF NOT EXISTS ${quoteIdentifier(dbName)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    await connection.query(`USE ${quoteIdentifier(dbName)}`);

    console.log('Running schema migrations...');
    await ensureCoreTables(connection);

    // 1. Verify inventory_bills table exists before altering it
    const [tableExists] = await connection.query(
      `SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = ?
      AND TABLE_NAME = 'inventory_bills'`,
      [dbName]
    );

    if (tableExists.length === 0) {
      console.warn(
        'inventory_bills table does not exist. Skipping inventory_bills migration.'
      );
    } else {
      const [cols] = await connection.query(
        `SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME = 'inventory_bills'
        AND COLUMN_NAME = 'is_manual'`,
        [dbName]
      );

      if (cols.length === 0) {
        console.log(
          'Adding is_manual, advance_paid, credit_note, status columns to inventory_bills...'
        );

        await connection.query(`
          ALTER TABLE inventory_bills
          ADD COLUMN is_manual BOOLEAN DEFAULT FALSE,
          ADD COLUMN advance_paid DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
          ADD COLUMN credit_note DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
          ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        `);

        console.log('Columns added successfully.');

        await connection.query(`
          UPDATE inventory_bills
          SET status = 'SETTLED'
          WHERE payment_method != 'Credit'
        `);

        await connection.query(`
          UPDATE inventory_bills
          SET status = 'PENDING'
          WHERE payment_method = 'Credit'
        `);

        console.log('Existing statuses initialized.');
      } else {
        console.log('inventory_bills table columns already up-to-date.');
      }
    }

    // 2. Create supplier_payments table if not exists
    console.log('Creating supplier_payments table if not exists...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS supplier_payments (
        id VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci PRIMARY KEY,
        bill_id VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
        payment_date DATE NOT NULL,
        amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        payment_mode VARCHAR(50) NOT NULL,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (bill_id) REFERENCES inventory_bills(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('supplier_payments table verified.');

    // 3. Create pet_bottle_batches table if not exists
    console.log('Creating pet_bottle_batches table if not exists...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS pet_bottle_batches (
        id VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci PRIMARY KEY,
        batch_date DATE NOT NULL,
        finished_product_id INT NOT NULL,
        raw_material_id INT NOT NULL,
        bags_used DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        actual_reading DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        expected_reading DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        difference_val DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        bottle_bags INT DEFAULT 0,
        wastage DECIMAL(12, 2) DEFAULT 0.00,
        start_time VARCHAR(50) NULL,
        stop_time VARCHAR(50) NULL,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (finished_product_id) REFERENCES finished_products(id) ON DELETE RESTRICT,
        FOREIGN KEY (raw_material_id) REFERENCES raw_materials(id) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('pet_bottle_batches table verified.');

    // Check if start_time exists in pet_bottle_batches
    const [pbCols] = await connection.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'pet_bottle_batches' AND COLUMN_NAME = 'start_time'`,
      [dbName]
    );

    if (pbCols.length === 0) {
      console.log('Adding start_time and stop_time columns to pet_bottle_batches...');
      await connection.query(`
        ALTER TABLE pet_bottle_batches
        ADD COLUMN start_time VARCHAR(50) NULL,
        ADD COLUMN stop_time VARCHAR(50) NULL
      `);
      console.log('Columns added successfully.');
    } else {
      console.log('pet_bottle_batches table columns already up-to-date.');
    }

    // 4. Create production_batches table if not exists
    console.log('Creating production_batches table if not exists...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS production_batches (
        id VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci PRIMARY KEY,
        production_date DATE NOT NULL,
        finished_product_id INT NOT NULL,
        production_boxes INT NOT NULL,
        bottles_per_box INT NOT NULL,
        batch_no VARCHAR(50) NULL,
        mfg_date DATE NOT NULL,
        expiry_date DATE NOT NULL,
        start_time VARCHAR(50) NULL,
        end_time VARCHAR(50) NULL,
        ink_qty DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        solvent_qty DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (finished_product_id) REFERENCES finished_products(id) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('production_batches table verified.');

    // Check if end_time column exists, and rename stop_time if it does not
    const [prodEndCols] = await connection.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'production_batches' AND COLUMN_NAME = 'end_time'`,
      [dbName]
    );
    if (prodEndCols.length === 0) {
      const [prodStopCols] = await connection.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'production_batches' AND COLUMN_NAME = 'stop_time'`,
        [dbName]
      );
      if (prodStopCols.length > 0) {
        console.log('Changing stop_time column to end_time in production_batches...');
        await connection.query(`
          ALTER TABLE production_batches 
          CHANGE COLUMN stop_time end_time VARCHAR(50) NULL
        `);
        console.log('Column stop_time successfully changed to end_time.');
      } else {
        console.log('Adding end_time column to production_batches...');
        await connection.query(`
          ALTER TABLE production_batches 
          ADD COLUMN end_time VARCHAR(50) NULL
        `);
        console.log('Column end_time successfully added.');
      }
    } else {
      console.log('production_batches table columns already up-to-date.');
    }

    // 5. Create production_material_usages table if not exists
    console.log('Creating production_material_usages table if not exists...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS production_material_usages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        production_batch_id VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
        raw_material_id INT NOT NULL,
        quantity DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        wastage DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        FOREIGN KEY (production_batch_id) REFERENCES production_batches(id) ON DELETE CASCADE,
        FOREIGN KEY (raw_material_id) REFERENCES raw_materials(id) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('production_material_usages table verified.');

    // 6. Create customer_bills table if not exists
    console.log('Creating customer_bills table if not exists...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS customer_bills (
        id VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci PRIMARY KEY,
        billing_date DATE NOT NULL,
        company VARCHAR(100) NOT NULL,
        customer_type VARCHAR(50) NOT NULL,
        customer_id VARCHAR(20) NULL,
        customer_name VARCHAR(200) NOT NULL,
        customer_phone VARCHAR(15) NOT NULL,
        customer_gstin VARCHAR(20) NULL,
        customer_address TEXT NULL,
        grand_total DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        payment_mode VARCHAR(50) NOT NULL,
        amount_paid DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        due_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        cash_paid DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        upi_paid DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        bank_paid DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('customer_bills table verified.');

    // 7. Create customer_bill_items table if not exists
    console.log('Creating customer_bill_items table if not exists...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS customer_bill_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        bill_id VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
        finished_product_id INT NOT NULL,
        quantity INT NOT NULL,
        rate_with_tax DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        tax_percent DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
        basic_rate DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        total_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        FOREIGN KEY (bill_id) REFERENCES customer_bills(id) ON DELETE CASCADE,
        FOREIGN KEY (finished_product_id) REFERENCES finished_products(id) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('customer_bill_items table verified.');

    // 8. Create customer_payments table if not exists
    console.log('Creating customer_payments table if not exists...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS customer_payments (
        id VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci PRIMARY KEY,
        bill_id VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
        payment_date DATE NOT NULL,
        payment_method VARCHAR(50) NOT NULL,
        amount_received DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        remarks TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (bill_id) REFERENCES customer_bills(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('customer_payments table verified.');

    // 9. Create loading_sessions table if not exists
    console.log('Verifying loading tables schema...');

    console.log('Creating loading_sessions table...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS loading_sessions (
        id VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci PRIMARY KEY,
        customer_id VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
        loading_date DATE NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
        remarks TEXT NULL,
        bill_id VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
        FOREIGN KEY (bill_id) REFERENCES customer_bills(id) ON DELETE SET NULL,
        INDEX idx_customer_id (customer_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('loading_sessions table verified.');

    // 10. Create loading_trips table if not exists
    console.log('Creating loading_trips table...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS loading_trips (
        id VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci PRIMARY KEY,
        session_id VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
        trip_number INT NOT NULL,
        godown VARCHAR(20) NOT NULL,
        remarks TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES loading_sessions(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('loading_trips table verified.');

    // 11. Create loading_trip_items table if not exists
    console.log('Creating loading_trip_items table...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS loading_trip_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        trip_id VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
        finished_product_id INT NOT NULL,
        quantity INT NOT NULL DEFAULT 0,
        return_qty INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (trip_id) REFERENCES loading_trips(id) ON DELETE CASCADE,
        FOREIGN KEY (finished_product_id) REFERENCES finished_products(id) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('loading_trip_items table verified.');

    // 11b. Create loading_returns table if not exists
    console.log('Creating loading_returns table...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS loading_returns (
        id INT AUTO_INCREMENT PRIMARY KEY,
        session_id VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
        finished_product_id INT NOT NULL,
        quantity INT NOT NULL DEFAULT 0,
        reason VARCHAR(255) NOT NULL,
        user_name VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES loading_sessions(id) ON DELETE CASCADE,
        FOREIGN KEY (finished_product_id) REFERENCES finished_products(id) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('loading_returns table verified.');

    // 12. Add credit_balance column to customers if not exists
    const [custCols] = await connection.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'customers' AND COLUMN_NAME = 'credit_balance'`,
      [dbName]
    );
    if (custCols.length === 0) {
      console.log('Adding credit_balance column to customers...');
      await connection.query(`ALTER TABLE customers ADD COLUMN credit_balance DECIMAL(12, 2) NOT NULL DEFAULT 0.00`);
    } else {
      console.log('customers.credit_balance column verified.');
    }

    // 13. Create sales_returns table if not exists
    console.log('Creating sales_returns table if not exists...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sales_returns (
        id VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci PRIMARY KEY,
        return_date DATE NOT NULL,
        customer_id VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
        bill_id VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
        total_return_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        reason VARCHAR(100) NOT NULL,
        created_by VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
        FOREIGN KEY (bill_id) REFERENCES customer_bills(id) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('sales_returns table verified.');

    // 14. Create sales_return_items table if not exists
    console.log('Creating sales_return_items table if not exists...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sales_return_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        sales_return_id VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
        finished_product_id INT NOT NULL,
        quantity INT NOT NULL,
        rate_with_tax DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        tax_percent DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
        total_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        FOREIGN KEY (sales_return_id) REFERENCES sales_returns(id) ON DELETE CASCADE,
        FOREIGN KEY (finished_product_id) REFERENCES finished_products(id) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('sales_return_items table verified.');

    // 15. Create customer_orders table if not exists
    console.log('Creating customer_orders table if not exists...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS customer_orders (
        id VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci PRIMARY KEY,
        customer_id VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
        customer_name VARCHAR(100) NOT NULL,
        customer_phone VARCHAR(15) NOT NULL,
        customer_gstin VARCHAR(20) NULL,
        customer_address TEXT NULL,
        customer_type VARCHAR(50) NOT NULL DEFAULT 'General Customer',
        alternate_phone VARCHAR(15) NULL,
        supply_date DATE NOT NULL,
        supply_time TIME NOT NULL,
        delivery_address TEXT NULL,
        delivery_instructions TEXT NULL,
        sub_total DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        discount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        tax DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        grand_total DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        payment_mode VARCHAR(50) NOT NULL DEFAULT 'Cash',
        advance_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        pending_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        notes TEXT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        created_by VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        edited_by VARCHAR(100) NULL,
        edited_at TIMESTAMP NULL,
        supplied_by VARCHAR(100) NULL,
        supplied_at TIMESTAMP NULL,
        cancelled_by VARCHAR(100) NULL,
        cancelled_at TIMESTAMP NULL,
        cancellation_reason VARCHAR(255) NULL,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('customer_orders table verified.');

    // 16. Create customer_order_items table if not exists
    console.log('Creating customer_order_items table if not exists...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS customer_order_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
        finished_product_id INT NOT NULL,
        quantity INT NOT NULL,
        rate DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        FOREIGN KEY (order_id) REFERENCES customer_orders(id) ON DELETE CASCADE,
        FOREIGN KEY (finished_product_id) REFERENCES finished_products(id) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('customer_order_items table verified.');

    // 17. Create raw_material_ledger_manual_opening table if not exists
    console.log('Creating raw_material_ledger_manual_opening table if not exists...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS raw_material_ledger_manual_opening (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ledger_date DATE NOT NULL,
        raw_material_id INT NOT NULL,
        unit VARCHAR(20) NOT NULL,
        quantity DECIMAL(12, 2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (raw_material_id) REFERENCES raw_materials(id) ON DELETE CASCADE,
        UNIQUE KEY uq_rm_unit_date (raw_material_id, unit, ledger_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('raw_material_ledger_manual_opening table verified.');

    // 18. Create raw_material_ledger_closings table if not exists
    console.log('Creating raw_material_ledger_closings table if not exists...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS raw_material_ledger_closings (
        ledger_date DATE PRIMARY KEY,
        closed_by VARCHAR(100) NOT NULL,
        closed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('raw_material_ledger_closings table verified.');

    // 19. Create raw_material_ledger_snapshots table if not exists
    console.log('Creating raw_material_ledger_snapshots table if not exists...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS raw_material_ledger_snapshots (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ledger_date DATE NOT NULL,
        raw_material_id INT NOT NULL,
        unit VARCHAR(20) NOT NULL,
        opening_stock DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        stock_in DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        stock_out DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        closing_stock DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (raw_material_id) REFERENCES raw_materials(id) ON DELETE CASCADE,
        FOREIGN KEY (ledger_date) REFERENCES raw_material_ledger_closings(ledger_date) ON DELETE CASCADE,
        UNIQUE KEY uq_rm_unit_snap_date (raw_material_id, unit, ledger_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('raw_material_ledger_snapshots table verified.');

    // 20. Create finished_goods_ledger_manual_opening table if not exists
    console.log('Creating finished_goods_ledger_manual_opening table if not exists...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS finished_goods_ledger_manual_opening (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ledger_date DATE NOT NULL,
        finished_product_id INT NOT NULL,
        quantity DECIMAL(12, 2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (finished_product_id) REFERENCES finished_products(id) ON DELETE CASCADE,
        UNIQUE KEY uq_fg_date (finished_product_id, ledger_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('finished_goods_ledger_manual_opening table verified.');

    // 21. Create finished_goods_ledger_closings table if not exists
    console.log('Creating finished_goods_ledger_closings table if not exists...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS finished_goods_ledger_closings (
        ledger_date DATE PRIMARY KEY,
        closed_by VARCHAR(100) NOT NULL,
        closed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('finished_goods_ledger_closings table verified.');

    // 22. Create finished_goods_ledger_snapshots table if not exists
    console.log('Creating finished_goods_ledger_snapshots table if not exists...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS finished_goods_ledger_snapshots (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ledger_date DATE NOT NULL,
        finished_product_id INT NOT NULL,
        opening_stock DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        stock_in DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        stock_out DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        closing_stock DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (finished_product_id) REFERENCES finished_products(id) ON DELETE CASCADE,
        FOREIGN KEY (ledger_date) REFERENCES finished_goods_ledger_closings(ledger_date) ON DELETE CASCADE,
        UNIQUE KEY uq_fg_snap_date (finished_product_id, ledger_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('finished_goods_ledger_snapshots table verified.');

    // 23. Alter customers table and create can_supply_transactions table
    console.log('Verifying customers table alterations and can_supply_transactions table...');
    
    // Check if alternate_phone column exists in customers
    const [custAltCols] = await connection.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'customers' AND COLUMN_NAME = 'alternate_phone'`,
      [dbName]
    );
    
    if (custAltCols.length === 0) {
      console.log('Adding alternate_phone and customer_type columns to customers...');
      await connection.query(`
        ALTER TABLE customers 
        ADD COLUMN alternate_phone VARCHAR(15) NULL,
        ADD COLUMN customer_type VARCHAR(50) NOT NULL DEFAULT 'General Customer'
      `);
      console.log('customer table columns added successfully.');
    } else {
      console.log('customers table columns verified.');
    }

    console.log('Creating can_supply_transactions table...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS can_supply_transactions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        customer_id VARCHAR(20) NOT NULL,
        transaction_date DATE NOT NULL,
        type ENUM('SUPPLY', 'RETURN') NOT NULL,
        supply_type ENUM('Company Can', 'Distributor Can', 'Function Can') NOT NULL,
        product ENUM('20 Ltr Can', 'Dispenser') NOT NULL,
        quantity INT NOT NULL,
        rate DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        notes TEXT NULL,
        function_name VARCHAR(200) NULL,
        event_date DATE NULL,
        expected_return_date DATE NULL,
        parent_transaction_id INT NULL,
        created_by VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
        FOREIGN KEY (parent_transaction_id) REFERENCES can_supply_transactions(id) ON DELETE SET NULL,
        INDEX idx_customer_id (customer_id),
        INDEX idx_parent_trans_id (parent_transaction_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('can_supply_transactions table verified.');

    // 24. Alter customers table for deposit_balance and create can_deposit_ledger table
    console.log('Verifying customers table alterations for deposit_balance and can_deposit_ledger table...');
    
    // Check if deposit_balance column exists in customers
    const [custDepCols] = await connection.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'customers' AND COLUMN_NAME = 'deposit_balance'`,
      [dbName]
    );
    
    if (custDepCols.length === 0) {
      console.log('Adding deposit_balance column to customers...');
      await connection.query(`
        ALTER TABLE customers 
        ADD COLUMN deposit_balance DECIMAL(12, 2) NOT NULL DEFAULT 0.00
      `);
      console.log('customers.deposit_balance column added successfully.');
    } else {
      console.log('customers.deposit_balance column verified.');
    }

    console.log('Creating can_deposit_ledger table...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS can_deposit_ledger (
        id INT AUTO_INCREMENT PRIMARY KEY,
        transaction_id VARCHAR(30) UNIQUE NOT NULL,
        transaction_type ENUM('Deposit Received', 'Deposit Returned') NOT NULL,
        customer_id VARCHAR(20) NOT NULL,
        customer_name VARCHAR(200) NOT NULL,
        mobile_number VARCHAR(15) NOT NULL,
        qty INT NOT NULL DEFAULT 0,
        rate DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        payment_mode VARCHAR(50) NOT NULL,
        remarks TEXT NULL,
        balance_after_transaction DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        created_by VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
        INDEX idx_dep_customer_id (customer_id),
        INDEX idx_dep_trans_type (transaction_type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('can_deposit_ledger table verified.');

    // 25. Create bank_accounts table if not exists
    console.log('Creating bank_accounts table if not exists...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS bank_accounts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        bank_name VARCHAR(255) NOT NULL,
        account_number VARCHAR(100) UNIQUE NOT NULL,
        ifsc_code VARCHAR(50) NULL,
        branch VARCHAR(255) NULL,
        status TINYINT DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    
    // Check if column branch and status exist in bank_accounts (in case it pre-existed)
    const [bankAccCols] = await connection.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'bank_accounts' AND COLUMN_NAME = 'branch'`,
      [dbName]
    );
    if (bankAccCols.length === 0) {
      console.log('Adding branch and status columns to bank_accounts...');
      await connection.query(`
        ALTER TABLE bank_accounts
        ADD COLUMN branch VARCHAR(255) NULL,
        ADD COLUMN status TINYINT DEFAULT 1
      `);
      console.log('bank_accounts altered successfully.');
    }
    console.log('bank_accounts table verified.');

    // Check if column bank_account_id exists in bank_deposits (in case it pre-existed)
    const [depCols] = await connection.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'bank_deposits' AND COLUMN_NAME = 'bank_account_id'`,
      [dbName]
    );
    if (depCols.length === 0) {
      console.log('bank_deposits table does not have bank_account_id column. Re-creating table...');
      await connection.query(`DROP TABLE IF EXISTS bank_deposits`);
    }

    // 26. Create bank_deposits table if not exists
    console.log('Creating bank_deposits table if not exists...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS bank_deposits (
        id VARCHAR(20) PRIMARY KEY,
        deposit_date DATE NOT NULL,
        bank_account_id INT NOT NULL,
        amount DECIMAL(12, 2) NOT NULL,
        notes TEXT NULL,
        entered_by VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('bank_deposits table verified.');

    // 27. Create maintenance_records table if not exists
    console.log('Creating maintenance_records table if not exists...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS maintenance_records (
        id VARCHAR(20) PRIMARY KEY,
        particular VARCHAR(100) NOT NULL,
        sub_detail VARCHAR(255) NULL,
        company VARCHAR(255) NULL,
        service_date DATE NOT NULL,
        next_due_date DATE NULL,
        note TEXT NULL,
        entered_by VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('maintenance_records table verified.');

    // 28. Create task_items table if not exists
    console.log('Creating task_items table if not exists...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS task_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        task_text TEXT NOT NULL,
        assigned_to VARCHAR(100) NOT NULL,
        created_by VARCHAR(100) NOT NULL,
        status ENUM('PENDING','COMPLETED') NOT NULL DEFAULT 'PENDING',
        priority ENUM('Low','Normal','High','Urgent') NOT NULL DEFAULT 'Normal',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP NULL,
        completed_by VARCHAR(100) NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('task_items table verified.');

    // Seed finished product category 'Others' and finished product 'Can Deposit' if not exists
    let catId = null;
    const [othersCat] = await connection.query(
      `SELECT id FROM finished_product_categories WHERE name = 'Others'`
    );
    if (othersCat.length > 0) {
      catId = othersCat[0].id;
    } else {
      const [insertCatRes] = await connection.query(
        `INSERT INTO finished_product_categories (name) VALUES ('Others')`
      );
      catId = insertCatRes.insertId;
    }

    const [existingProd] = await connection.query(
      `SELECT id FROM finished_products WHERE name = 'Can Deposit'`
    );
    if (existingProd.length === 0) {
      await connection.query(
        `INSERT INTO finished_products (name, category_id, status) VALUES ('Can Deposit', ?, 1)`,
        [catId]
      );
    } else {
      console.log('Can Deposit finished product verified.');
    }

    // 29. Rename '20ltr Can' to '20 Ltr Can' and seed 'Dispenser' if not exists
    console.log('Renaming 20ltr Can and verifying Dispenser product...');
    await connection.query(
      `UPDATE finished_products SET name = '20 Ltr Can' WHERE name = '20ltr Can'`
    );
    const [dispenserProd] = await connection.query(
      `SELECT id FROM finished_products WHERE name = 'Dispenser'`
    );
    if (dispenserProd.length === 0) {
      await connection.query(
        `INSERT INTO finished_products (name, category_id, status) VALUES ('Dispenser', ?, 1)`,
        [catId]
      );
      console.log('Seeded Dispenser finished product.');
    } else {
      console.log('Dispenser finished product verified.');
    }

    // 30. Create payment_approvals table if not exists
    console.log('Creating payment_approvals table if not exists...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS payment_approvals (
        id INT AUTO_INCREMENT PRIMARY KEY,
        approval_id VARCHAR(25) UNIQUE NOT NULL,
        transaction_id VARCHAR(50) NOT NULL,
        source_module ENUM('Billing', 'Expense', 'CanDeposit', 'CreditBalance', 'SupplierPayment') NOT NULL,
        transaction_type ENUM('Cash In', 'Cash Out') NOT NULL,
        reference_no VARCHAR(100) NOT NULL DEFAULT '',
        party_name VARCHAR(200) NOT NULL DEFAULT '',
        description TEXT,
        payment_method VARCHAR(100) NOT NULL DEFAULT 'Cash',
        cash_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
        upi_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
        bank_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
        amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
        transaction_date DATE NOT NULL,
        entered_by VARCHAR(100) NOT NULL DEFAULT '',
        remarks TEXT,
        status ENUM('Pending', 'Approved', 'Rejected') NOT NULL DEFAULT 'Pending',
        approved_by VARCHAR(100) NULL,
        approved_at TIMESTAMP NULL,
        rejected_by VARCHAR(100) NULL,
        rejected_at TIMESTAMP NULL,
        rejection_reason TEXT NULL,
        cash_ledger_updated TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_pa_status (status),
        INDEX idx_pa_source (source_module),
        INDEX idx_pa_type (transaction_type),
        INDEX idx_pa_date (transaction_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('payment_approvals table verified.');

    // 31. Create cash_ledger table if not exists
    console.log('Creating cash_ledger table if not exists...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS cash_ledger (
        id INT AUTO_INCREMENT PRIMARY KEY,
        approval_id VARCHAR(25) NOT NULL,
        transaction_id VARCHAR(50) NOT NULL,
        reference_no VARCHAR(100) NOT NULL DEFAULT '',
        type ENUM('Cash In', 'Cash Out') NOT NULL,
        source_module VARCHAR(100) NOT NULL DEFAULT '',
        description TEXT,
        amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
        opening_balance DECIMAL(12,2) NOT NULL DEFAULT 0.00,
        closing_balance DECIMAL(12,2) NOT NULL DEFAULT 0.00,
        approved_by VARCHAR(100) NOT NULL DEFAULT '',
        approved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_cl_approval_id (approval_id),
        INDEX idx_cl_date (approved_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('cash_ledger table verified.');

    // 32. Add payment approval and reversal holding fields to financial tables
    console.log('Checking and adding holding/reversal columns to financial tables...');
    const [billStatusCols] = await connection.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'customer_bills' AND COLUMN_NAME = 'payment_status'`,
      [dbName]
    );

    if (billStatusCols.length === 0) {
      console.log('Adding holding/reversal columns to customer_bills...');
      await connection.query(`
        ALTER TABLE customer_bills
        ADD COLUMN payment_status ENUM('Pending Approval', 'Approved', 'Rejected', 'Unpaid') DEFAULT 'Unpaid',
        ADD COLUMN pending_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        ADD COLUMN approved_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        ADD COLUMN rejected_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        ADD COLUMN approval_id VARCHAR(25) NULL,
        ADD COLUMN last_status_update TIMESTAMP NULL
      `);
      await connection.query(`
        UPDATE customer_bills
        SET payment_status = 'Approved', approved_amount = amount_paid
        WHERE amount_paid > 0
      `);
      await connection.query(`
        UPDATE customer_bills
        SET payment_status = 'Unpaid'
        WHERE amount_paid = 0
      `);
      console.log('customer_bills holding/reversal columns added and initialized.');
    }

    const [custPayCols] = await connection.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'customer_payments' AND COLUMN_NAME = 'payment_status'`,
      [dbName]
    );
    if (custPayCols.length === 0) {
      console.log('Adding holding/reversal columns to customer_payments...');
      await connection.query(`
        ALTER TABLE customer_payments
        ADD COLUMN payment_status ENUM('Pending Approval', 'Approved', 'Rejected', 'Unpaid') DEFAULT 'Pending Approval',
        ADD COLUMN pending_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        ADD COLUMN approved_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        ADD COLUMN rejected_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        ADD COLUMN approval_id VARCHAR(25) NULL,
        ADD COLUMN last_status_update TIMESTAMP NULL
      `);
      await connection.query(`
        UPDATE customer_payments
        SET payment_status = 'Approved', approved_amount = amount_received
      `);
      console.log('customer_payments holding/reversal columns added and initialized.');
    }

    const [expCols] = await connection.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'expenses' AND COLUMN_NAME = 'payment_status'`,
      [dbName]
    );
    if (expCols.length === 0) {
      console.log('Adding holding/reversal columns to expenses...');
      await connection.query(`
        ALTER TABLE expenses
        ADD COLUMN payment_status ENUM('Pending Approval', 'Approved', 'Rejected', 'Unpaid') DEFAULT 'Pending Approval',
        ADD COLUMN pending_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        ADD COLUMN approved_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        ADD COLUMN rejected_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        ADD COLUMN approval_id VARCHAR(25) NULL,
        ADD COLUMN last_status_update TIMESTAMP NULL
      `);
      await connection.query(`
        UPDATE expenses
        SET payment_status = 'Approved', approved_amount = amount
      `);
      console.log('expenses holding/reversal columns added and initialized.');
    }

    const [supPayCols] = await connection.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'supplier_payments' AND COLUMN_NAME = 'payment_status'`,
      [dbName]
    );
    if (supPayCols.length === 0) {
      console.log('Adding holding/reversal columns to supplier_payments...');
      await connection.query(`
        ALTER TABLE supplier_payments
        ADD COLUMN payment_status ENUM('Pending Approval', 'Approved', 'Rejected', 'Unpaid') DEFAULT 'Pending Approval',
        ADD COLUMN pending_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        ADD COLUMN approved_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        ADD COLUMN rejected_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        ADD COLUMN approval_id VARCHAR(25) NULL,
        ADD COLUMN last_status_update TIMESTAMP NULL
      `);
      await connection.query(`
        UPDATE supplier_payments
        SET payment_status = 'Approved', approved_amount = amount
      `);
      console.log('supplier_payments holding/reversal columns added and initialized.');
    }

    const [canDepCols] = await connection.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'can_deposit_ledger' AND COLUMN_NAME = 'payment_status'`,
      [dbName]
    );
    if (canDepCols.length === 0) {
      console.log('Adding holding/reversal columns to can_deposit_ledger...');
      await connection.query(`
        ALTER TABLE can_deposit_ledger
        ADD COLUMN payment_status ENUM('Pending Approval', 'Approved', 'Rejected', 'Unpaid') DEFAULT 'Pending Approval',
        ADD COLUMN pending_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        ADD COLUMN approved_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        ADD COLUMN rejected_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        ADD COLUMN approval_id VARCHAR(25) NULL,
        ADD COLUMN last_status_update TIMESTAMP NULL
      `);
      await connection.query(`
        UPDATE can_deposit_ledger
        SET payment_status = 'Approved', approved_amount = amount
      `);
      console.log('can_deposit_ledger holding/reversal columns added and initialized.');
    }

    console.log('Migration complete!');
    await connection.end();
    if (shouldExit) {
      process.exit(0);
    }
  } catch (err) {
    console.error('Migration failed:', err);
    if (connection) {
      await connection.end();
    }
    if (shouldExit) {
      process.exit(1);
    } else {
      throw err;
    }
  }
}

// Run directly from command line
const isMain = process.argv[1] && (
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
);

if (isMain) {
  runMigration(true);
}
