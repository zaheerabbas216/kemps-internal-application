import dotenv from 'dotenv';
dotenv.config();

import app from './app.js';
import pool from './config/db.js';

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    // Test DB connection
    const connection = await pool.getConnection();
    console.log('Database connected successfully!');
    connection.release();

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
