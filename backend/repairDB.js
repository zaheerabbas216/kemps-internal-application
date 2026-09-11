import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { repairCorruptedTables } from './helpers/dbRepair.js';

dotenv.config();

async function runRepair() {
  const dbName = process.env.DB_NAME || 'kemps_inventory';
  console.log(`Checking and repairing tables in database: ${dbName}...`);

  let connection;
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306', 10),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || ''
    });

    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await connection.query(`USE \`${dbName}\``);

    await repairCorruptedTables(connection, dbName);
    console.log('Database check and repair completed successfully.');
  } catch (err) {
    console.error('Database repair failed:', err);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

runRepair();
