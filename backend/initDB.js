import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { repairCorruptedTables } from './helpers/dbRepair.js';
dotenv.config();

async function initDB() {
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306', 10),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || ''
    });
    console.log('Connected to MySQL. Creating kemps_inventory database if not exists...');
    await connection.query('CREATE DATABASE IF NOT EXISTS kemps_inventory CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    await connection.query('USE kemps_inventory');

    // Automatically check and repair any corrupted InnoDB tables / orphan tablespaces
    await repairCorruptedTables(connection, 'kemps_inventory');

    console.log('Creating admins table...');
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

    // Seed default admin if none exists
    const [existingAdmins] = await connection.query('SELECT COUNT(*) as count FROM admins');
    if (existingAdmins[0].count === 0) {
      console.log('Seeding default admin...');
      const hashedPassword = await bcrypt.hash('username', 10);
      await connection.query(
        'INSERT INTO admins (username, password, name) VALUES (?, ?, ?)',
        ['admin', hashedPassword, 'Zaheer Abbas']
      );
    }
    
    console.log('Creating customers table...');
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

    console.log('Creating company_details table...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS company_details (
        id VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci PRIMARY KEY,
        company_name VARCHAR(200) NOT NULL,
        phone_number VARCHAR(15),
        gst_number VARCHAR(20),
        address TEXT,
        bank_name VARCHAR(200),
        account_number VARCHAR(50),
        ifsc_code VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    console.log('Creating raw_material_categories table...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS raw_material_categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    console.log('Creating raw_materials table...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS raw_materials (
        id INT AUTO_INCREMENT PRIMARY KEY,
        category_id INT NOT NULL,
        sub_product_name VARCHAR(255) NOT NULL,
        unit VARCHAR(20) NOT NULL,
        qty_in_pc_per_kg DECIMAL(10, 2) DEFAULT NULL,
        status INT DEFAULT 1, -- 1 = Active, 0 = Disabled
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES raw_material_categories(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    console.log('Creating finished_product_categories table...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS finished_product_categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    console.log('Creating finished_products table...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS finished_products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        category_id INT,
        status INT DEFAULT 1, -- 1 = Active, 0 = Inactive
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES finished_product_categories(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('Creating expenses table...');
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

    console.log('Creating inventory_bills table...');
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

    console.log('Creating inventory_bill_items table...');
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

    console.log('Creating stock_register table...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS stock_register (
        id INT AUTO_INCREMENT PRIMARY KEY,
        item_type VARCHAR(20) NOT NULL, -- 'RAW_MATERIAL' or 'FINISHED_PRODUCT'
        item_id INT NOT NULL,
        transaction_type VARCHAR(20) NOT NULL, -- 'PURCHASE', 'PRODUCTION', 'CORRECTION', 'SALE'
        reference_id VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
        quantity DECIMAL(12, 2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    console.log('Creating sunday_loading table...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sunday_loading (
        id INT AUTO_INCREMENT PRIMARY KEY,
        transaction_number VARCHAR(50) UNIQUE NOT NULL,
        loading_date DATE NOT NULL,
        customer_id VARCHAR(50) NULL,
        customer_name VARCHAR(200) NOT NULL,
        customer_phone VARCHAR(50) NULL,
        customer_address TEXT NULL,
        customer_type VARCHAR(100) NULL,
        product_id INT NULL,
        product_name VARCHAR(255) NOT NULL,
        quantity DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        rate DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        total_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        cash_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        upi_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        bank_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        total_paid DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        due_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        notes TEXT NULL,
        created_by VARCHAR(100) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_sl_date (loading_date),
        INDEX idx_sl_customer (customer_name),
        INDEX idx_sl_txn (transaction_number)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);



    console.log('Creating bank_accounts table...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS bank_accounts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        bank_name VARCHAR(200) NOT NULL,
        account_number VARCHAR(50) UNIQUE NOT NULL,
        ifsc_code VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    console.log('Creating bank_deposits table...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS bank_deposits (
        id VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci PRIMARY KEY,
        deposit_date DATE NOT NULL,
        bank_name VARCHAR(200) NOT NULL,
        account_number VARCHAR(50) NOT NULL,
        amount DECIMAL(15, 2) NOT NULL,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Seed default categories if they do not exist
    const [existingCategories] = await connection.query('SELECT COUNT(*) as count FROM raw_material_categories');
    if (existingCategories[0].count === 0) {
      console.log('Seeding default categories...');
      const defaultCategories = ['Preforms', 'Labels', 'Box', 'Shrink Rolls', 'Handles', 'Caps', 'Others'];
      for (const cat of defaultCategories) {
        await connection.query('INSERT IGNORE INTO raw_material_categories (name) VALUES (?)', [cat]);
      }
    }

    const [existingFPcategories] = await connection.query('SELECT COUNT(*) as count FROM finished_product_categories');
    if (existingFPcategories[0].count === 0) {
      console.log('Seeding default finished product categories...');
      const defaultFPCategories = ['Water Bottles', 'Mango Juice', 'Soft Drinks', 'Others'];
      for (const cat of defaultFPCategories) {
        await connection.query('INSERT IGNORE INTO finished_product_categories (name) VALUES (?)', [cat]);
      }
    }

    // Seed default finished products if they do not exist
    const [existingProducts] = await connection.query('SELECT COUNT(*) as count FROM finished_products');
    if (existingProducts[0].count === 0) {
      console.log('Seeding default finished products...');
      const [waterCat] = await connection.query('SELECT id FROM finished_product_categories WHERE name = ?', ['Water Bottles']);
      const categoryId = waterCat.length > 0 ? waterCat[0].id : null;
      if (categoryId) {
        const defaultProducts = [
          '2L Kemps Shrink',
          '2L BOPP Kemps',
          '2L BOPP Signature',
          '1L Kemps Shrink',
          '1L BOPP Kemps',
          '1L BOPP Signature',
          '1L Pink',
          '1L Malligi (Sqr)',
          '1L Malligi Premium',
          '1L Goan Corner (Sqr)',
          '1L Kemps Transparent',
          '1L Naivedyam Premium',
          '1L Maitri Premium',
          '500ml Kemps Shrink',
          '500ml BOPP Kemps',
          '500ml BOPP Signature',
          '500ml Pink',
          '500ml Priyadarshini',
          '500ml Mallige',
          '500ml Kemps Transparent',
          '300ml Pink',
          '300ml Designer (TY)',
          '250ml Pink',
          '500ml 8+ Transparent',
          '1L 8+ Transparent',
          'Jeera 200ml',
          'Jeera 300ml',
          'Jeera 600ml',
          'Club Soda 300ml',
          'Club Soda 600ml',
          'Lemon 200ml',
          'Lemon 300ml',
          '1L Savji',
          '1ltr Distilled Water',
          '2ltr Distilled Water',
          'Battery Acid',
          'Cleaning Acid',
          '20ltr Can',
          '2L BOPP Kemps (9pcs)',
          'Jeera Green 200ml',
          '2L BOPP Signature 9PC',
          '500ML Maitri',
          '500ML THANK U DESIGNER',
          '1L Premium (Pink)'
        ];
        for (const prod of defaultProducts) {
          await connection.query(
            'INSERT INTO finished_products (name, category_id, status) VALUES (?, ?, 1)',
            [prod.trim(), categoryId]
          );
        }
        console.log(`Seeded ${defaultProducts.length} default finished products.`);
      }
    }

    // Seed default raw materials if none exist
    const [existingRawMaterials] = await connection.query('SELECT COUNT(*) as count FROM raw_materials');
    if (existingRawMaterials[0].count === 0) {
      console.log('Seeding default raw materials...');
      const defaultRawMaterials = [
        // Preforms - Unit: BAGS
        { category: 'Preforms', subProduct: '19.8', unit: 'BAGS' },
        { category: 'Preforms', subProduct: '32', unit: 'BAGS' },
        { category: 'Preforms', subProduct: '10', unit: 'BAGS' },
        { category: 'Preforms', subProduct: '12.8', unit: 'BAGS' },
        { category: 'Preforms', subProduct: '25.5', unit: 'BAGS' },
        { category: 'Preforms', subProduct: '13', unit: 'BAGS' },
        { category: 'Preforms', subProduct: '16.5', unit: 'BAGS' },
        { category: 'Preforms', subProduct: '24.7', unit: 'BAGS' },
        { category: 'Preforms', subProduct: '52.7', unit: 'BAGS' },

        // Labels - Unit: PCS
        { category: 'Labels', subProduct: '2L Kemps Shrink', unit: 'PCS' },
        { category: 'Labels', subProduct: '2L BOPP Kemps', unit: 'PCS' },
        { category: 'Labels', subProduct: '2L BOPP Signature', unit: 'PCS' },
        { category: 'Labels', subProduct: '1L Kemps Shrink', unit: 'PCS' },
        { category: 'Labels', subProduct: '1L BOPP Kemps', unit: 'PCS' },
        { category: 'Labels', subProduct: '1L BOPP Signature', unit: 'PCS' },
        { category: 'Labels', subProduct: '1L Pink', unit: 'PCS' },
        { category: 'Labels', subProduct: '1L Malligi (Sqr)', unit: 'PCS' },
        { category: 'Labels', subProduct: '1L Malligi Premium', unit: 'PCS' },
        { category: 'Labels', subProduct: '1L Goan Corner (Sqr)', unit: 'PCS' },
        { category: 'Labels', subProduct: '1L Kemps Transparent', unit: 'PCS' },
        { category: 'Labels', subProduct: '1L Naivedyam Premium', unit: 'PCS' },
        { category: 'Labels', subProduct: '1L Maitri Premium', unit: 'PCS' },
        { category: 'Labels', subProduct: '500ml Kemps Shrink', unit: 'PCS' },
        { category: 'Labels', subProduct: '500ml BOPP Kemps', unit: 'PCS' },
        { category: 'Labels', subProduct: '500ml BOPP Signature', unit: 'PCS' },
        { category: 'Labels', subProduct: '500ml Pink', unit: 'PCS' },
        { category: 'Labels', subProduct: '500ml Priyadarshini', unit: 'PCS' },
        { category: 'Labels', subProduct: '500ml Mallige', unit: 'PCS' },
        { category: 'Labels', subProduct: '500ml Kemps Transparent', unit: 'PCS' },
        { category: 'Labels', subProduct: '300ml Pink', unit: 'PCS' },
        { category: 'Labels', subProduct: '300ml Designer (TY)', unit: 'PCS' },
        { category: 'Labels', subProduct: '250ml Pink', unit: 'PCS' },
        { category: 'Labels', subProduct: '20L Can Label', unit: 'PCS' },
        { category: 'Labels', subProduct: '500ml 8+ Transparent', unit: 'PCS' },
        { category: 'Labels', subProduct: '1L 8+ Transparent', unit: 'PCS' },
        { category: 'Labels', subProduct: 'Jeera 200ml', unit: 'PCS' },
        { category: 'Labels', subProduct: 'Jeera 300ml', unit: 'PCS' },
        { category: 'Labels', subProduct: 'Jeera 600ml', unit: 'PCS' },
        { category: 'Labels', subProduct: 'Jeera 2L', unit: 'PCS' },
        { category: 'Labels', subProduct: 'Club Soda 300ml', unit: 'PCS' },
        { category: 'Labels', subProduct: 'Club Soda 600ml', unit: 'PCS' },
        { category: 'Labels', subProduct: 'Lemon 200ml', unit: 'PCS' },
        { category: 'Labels', subProduct: 'Lemon 300ml', unit: 'PCS' },
        { category: 'Labels', subProduct: 'Orange 200ml', unit: 'PCS' },
        { category: 'Labels', subProduct: 'CUSTOMISE 1', unit: 'PCS' },
        { category: 'Labels', subProduct: 'CUSTOMISE 2', unit: 'PCS' },
        { category: 'Labels', subProduct: '1L savji', unit: 'PCS' },

        // Box - Unit: PCS
        { category: 'Box', subProduct: '1L Kemps', unit: 'PCS' },
        { category: 'Box', subProduct: '2L Kemps', unit: 'PCS' },
        { category: 'Box', subProduct: '500ml Kemps', unit: 'PCS' },
        { category: 'Box', subProduct: '300ml Pink', unit: 'PCS' },
        { category: 'Box', subProduct: '1L Pink', unit: 'PCS' },
        { category: 'Box', subProduct: '500ml Pink', unit: 'PCS' },
        { category: 'Box', subProduct: '250ml Pink', unit: 'PCS' },
        { category: 'Box', subProduct: '1L Blu', unit: 'PCS' },
        { category: 'Box', subProduct: '2L Blu', unit: 'PCS' },
        { category: 'Box', subProduct: '500ml Blu', unit: 'PCS' },
        { category: 'Box', subProduct: 'Jeera 200ml', unit: 'PCS' },
        { category: 'Box', subProduct: 'Jeera 300ml', unit: 'PCS' },
        { category: 'Box', subProduct: 'Jeera 600ml', unit: 'PCS' },
        { category: 'Box', subProduct: 'Jeera 2L', unit: 'PCS' },
        { category: 'Box', subProduct: 'Club Soda 300ml', unit: 'PCS' },
        { category: 'Box', subProduct: 'Club Soda 600ml', unit: 'PCS' },
        { category: 'Box', subProduct: '1L Plain', unit: 'PCS' },

        // Shrink Rolls - Unit: ROLLS
        { category: 'Shrink Rolls', subProduct: '500mm', unit: 'ROLLS' },
        { category: 'Shrink Rolls', subProduct: '550mm', unit: 'ROLLS' },
        { category: 'Shrink Rolls', subProduct: '600mm', unit: 'ROLLS' },
        { category: 'Shrink Rolls', subProduct: '530mm', unit: 'ROLLS' },
        { category: 'Shrink Rolls', subProduct: '490mm', unit: 'ROLLS' },

        // Handles - Unit: PCS
        { category: 'Handles', subProduct: 'White', unit: 'PCS' },
        { category: 'Handles', subProduct: 'Blue', unit: 'PCS' },
        { category: 'Handles', subProduct: 'Red', unit: 'PCS' },
        { category: 'Handles', subProduct: 'Green', unit: 'PCS' },

        // Caps - Unit: PCS
        { category: 'Caps', subProduct: 'kemps white Cap', unit: 'PCS' },
        { category: 'Caps', subProduct: 'plain white Cap', unit: 'PCS' },
        { category: 'Caps', subProduct: 'Green Cap', unit: 'PCS' },
        { category: 'Caps', subProduct: 'Pink Cap', unit: 'PCS' },
        { category: 'Caps', subProduct: 'Red Cap', unit: 'PCS' },
        { category: 'Caps', subProduct: 'Black Cap', unit: 'PCS' },
        { category: 'Caps', subProduct: 'Light Green', unit: 'PCS' },
        { category: 'Caps', subProduct: 'Yellow', unit: 'PCS' },
        { category: 'Caps', subProduct: 'Mango White', unit: 'PCS' },
        { category: 'Caps', subProduct: 'Green (Omkar)', unit: 'PCS' },
        { category: 'Caps', subProduct: 'Blue (Omkar)', unit: 'PCS' },
        { category: 'Caps', subProduct: 'Sky Blue', unit: 'PCS' },
        { category: 'Caps', subProduct: 'Orange', unit: 'PCS' },

        // Others - Unit: KG
        { category: 'Others', subProduct: 'Sugar', unit: 'KG' },
        { category: 'Others', subProduct: 'Ink', unit: 'KG' },
        { category: 'Others', subProduct: 'Solvent', unit: 'KG' },
        { category: 'Others', subProduct: 'Jeera Masala Maharaja', unit: 'KG' },
        { category: 'Others', subProduct: 'Jeera Masala Apollo', unit: 'KG' }
      ];

      // Get all categories to map names to IDs
      const [categories] = await connection.query('SELECT id, name FROM raw_material_categories');
      const categoryMap = {};
      categories.forEach(cat => {
        categoryMap[cat.name.toLowerCase()] = cat.id;
      });

      for (const item of defaultRawMaterials) {
        const categoryNameLower = item.category.toLowerCase();
        let categoryId = categoryMap[categoryNameLower];

        // If category doesn't exist, insert it
        if (!categoryId) {
          const [catResult] = await connection.query(
            'INSERT INTO raw_material_categories (name) VALUES (?)',
            [item.category]
          );
          categoryId = catResult.insertId;
          categoryMap[categoryNameLower] = categoryId;
        }

        await connection.query(
          'INSERT INTO raw_materials (category_id, sub_product_name, unit, status) VALUES (?, ?, ?, 1)',
          [categoryId, item.subProduct.trim(), item.unit]
        );
      }
      console.log(`Seeded ${defaultRawMaterials.length} default raw materials.`);
    }
    const [existingBankAccounts] = await connection.query('SELECT COUNT(*) as count FROM bank_accounts');
    if (existingBankAccounts[0].count === 0) {
      console.log('Seeding default bank accounts...');
      const defaultBankAccounts = [
        { bankName: 'State Bank of India', accountNumber: '30948576123', ifscCode: 'SBIN0000301' },
        { bankName: 'State Bank of India', accountNumber: '39847512093', ifscCode: 'SBIN0000301' },
        { bankName: 'HDFC Bank', accountNumber: '50100239485712', ifscCode: 'HDFC0000104' },
        { bankName: 'HDFC Bank', accountNumber: '50200039485723', ifscCode: 'HDFC0000104' },
        { bankName: 'ICICI Bank', accountNumber: '000405001234', ifscCode: 'ICIC0000004' },
        { bankName: 'ICICI Bank', accountNumber: '000405005678', ifscCode: 'ICIC0000004' },
        { bankName: 'Axis Bank', accountNumber: '918020038475621', ifscCode: 'UTIB0000010' },
        { bankName: 'Axis Bank', accountNumber: '919010048375920', ifscCode: 'UTIB0000010' }
      ];
      for (const acc of defaultBankAccounts) {
        await connection.query(
          'INSERT IGNORE INTO bank_accounts (bank_name, account_number, ifsc_code) VALUES (?, ?, ?)',
          [acc.bankName, acc.accountNumber, acc.ifscCode]
        );
      }
    }
    
    console.log('Database initialization complete!');
    await connection.end();
    process.exit(0);
  } catch (error) {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  }
}

initDB();
