import fs from 'fs';
import path from 'path';

/**
 * Checks all existing tables in the database for InnoDB engine/tablespace corruption
 * (such as Error 1932: Table doesn't exist in engine, Error 1813: Tablespace exists, etc.)
 * and automatically purges broken table definitions and orphaned .ibd files so they can be recreated.
 */
export async function repairCorruptedTables(connection, dbName = 'kemps_inventory') {
  try {
    let datadir = null;
    try {
      const [rows] = await connection.query("SHOW VARIABLES LIKE 'datadir'");
      datadir = rows && rows[0] ? rows[0].Value : null;
    } catch (e) {
      // datadir query failed, continue without fs unlink
    }

    const [tables] = await connection.query('SHOW TABLES');
    for (const t of tables) {
      const tableName = Object.values(t)[0];
      let isCorrupt = false;
      let reason = '';

      try {
        await connection.query(`SELECT 1 FROM \`${tableName}\` LIMIT 1`);
      } catch (err) {
        const msg = String(err.message || '');
        if (
          err.errno === 1932 ||
          err.errno === 1813 ||
          err.code === 'ER_NO_SUCH_TABLE_IN_ENGINE' ||
          err.code === 'ER_TABLESPACE_EXISTS' ||
          msg.includes("doesn't exist in engine") ||
          msg.includes('Tablespace for table') ||
          msg.includes('DISCARD the tablespace')
        ) {
          isCorrupt = true;
          reason = msg;
        }
      }

      if (isCorrupt) {
        console.warn(`[DB Auto-Repair] Corrupted tablespace detected for table "${tableName}" (${reason}). Attempting recovery...`);
        try {
          await connection.query('SET FOREIGN_KEY_CHECKS = 0');
          await connection.query(`DROP TABLE IF EXISTS \`${tableName}\``);
        } catch (dropErr) {
          console.warn(`[DB Auto-Repair] Could not drop table "${tableName}":`, dropErr.message);
        }

        if (datadir) {
          try {
            const ibdPath = path.join(datadir, dbName, `${tableName}.ibd`);
            if (fs.existsSync(ibdPath)) {
              fs.unlinkSync(ibdPath);
              console.log(`[DB Auto-Repair] Removed orphaned tablespace file: ${ibdPath}`);
            }
          } catch (fsErr) {
            console.warn(`[DB Auto-Repair] Could not remove .ibd file for "${tableName}":`, fsErr.message);
          }
        }

        try {
          await connection.query('SET FOREIGN_KEY_CHECKS = 1');
        } catch (e) {}

        console.log(`[DB Auto-Repair] Cleaned up table "${tableName}". It will be recreated.`);
      }
    }
  } catch (err) {
    console.warn('[DB Auto-Repair] Table health scan warning:', err.message);
  }
}

/**
 * Executes a query with automatic retry if an InnoDB tablespace error occurs.
 */
export async function safeExecute(connection, queryStr, params = [], dbName = 'kemps_inventory') {
  try {
    return await connection.query(queryStr, params);
  } catch (err) {
    const msg = String(err.message || '');
    if (
      err.errno === 1932 ||
      err.errno === 1813 ||
      err.code === 'ER_NO_SUCH_TABLE_IN_ENGINE' ||
      err.code === 'ER_TABLESPACE_EXISTS' ||
      msg.includes("doesn't exist in engine") ||
      msg.includes('Tablespace for table') ||
      msg.includes('DISCARD the tablespace')
    ) {
      console.warn(`[DB Auto-Repair] Query encountered engine/tablespace error: ${msg}. Running database repair and retrying...`);
      await repairCorruptedTables(connection, dbName);
      return await connection.query(queryStr, params);
    }
    throw err;
  }
}
