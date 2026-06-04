import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

async function initDB() {
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || ''
    });
    console.log('Connected to MySQL. Creating kemps_inventory database if not exists...');
    await connection.query('CREATE DATABASE IF NOT EXISTS kemps_inventory CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    await connection.query('USE kemps_inventory');
    
    console.log('Creating customers table...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id VARCHAR(20) PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        phone VARCHAR(15) UNIQUE NOT NULL,
        gstin VARCHAR(20),
        address TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    console.log('Creating company_details table...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS company_details (
        id VARCHAR(20) PRIMARY KEY,
        company_name VARCHAR(200) NOT NULL,
        phone_number VARCHAR(15),
        gst_number VARCHAR(20),
        bank_name VARCHAR(200),
        account_number VARCHAR(50),
        ifsc_code VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    console.log('Creating raw_material_categories table...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS raw_material_categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Creating raw_materials table...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS raw_materials (
        id INT AUTO_INCREMENT PRIMARY KEY,
        category_id INT NOT NULL,
        sub_product_name VARCHAR(255) NOT NULL,
        unit VARCHAR(20) NOT NULL,
        status INT DEFAULT 1, -- 1 = Active, 0 = Disabled
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES raw_material_categories(id) ON DELETE CASCADE
      )
    `);

    console.log('Creating finished_product_categories table...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS finished_product_categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
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
      )
    `);

    console.log('Creating bank_accounts table...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS bank_accounts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        bank_name VARCHAR(200) NOT NULL,
        account_number VARCHAR(50) UNIQUE NOT NULL,
        ifsc_code VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Creating bank_deposits table...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS bank_deposits (
        id VARCHAR(20) PRIMARY KEY,
        deposit_date DATE NOT NULL,
        bank_name VARCHAR(200) NOT NULL,
        account_number VARCHAR(50) NOT NULL,
        amount DECIMAL(15, 2) NOT NULL,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
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
