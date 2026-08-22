import dotenv from 'dotenv';
dotenv.config();

import app from './app.js';
import pool from './config/db.js';
import { runMigration } from './migrate.js';

import { execSync } from 'child_process';

const PORT = process.env.PORT || 8000;

async function startServer() {
  try {
    // Run database initialization and seeding
    console.log('Initializing database and seeding default data...');
    execSync('node initDB.js', { stdio: 'inherit' });
    console.log('Database initialization completed successfully.');

    // Run migrations automatically at startup (updates schemas to latest)
    console.log('Running automatic database migrations...');
    await runMigration(false);
    console.log('Database migrations completed successfully.');

    // Run customer database seeding (requires latest schema columns)
    // console.log('Seeding customer database...');
    // execSync('node seedCustomers.js', { stdio: 'inherit' });
    // console.log('Customer database seeding completed successfully.');

    // Test DB connection after migrations have created the database/schema.
    const connection = await pool.getConnection();
    console.log('Database connected successfully!');
    connection.release();

    const server = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

    // Graceful shutdown handling (closes Express server and MySQL connection pool)
    const shutdown = async (signal) => {
      console.log(`\nReceived ${signal}. Starting graceful shutdown...`);
      server.close(async () => {
        console.log('HTTP server closed.');
        try {
          await pool.end();
          console.log('Database pool connection closed.');
          process.exit(0);
        } catch (err) {
          console.error('Error closing database pool:', err);
          process.exit(1);
        }
      });

      // Force terminate after 10s if graceful shutdown hangs
      setTimeout(() => {
        console.error('Force terminating due to graceful shutdown timeout.');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
