/*
 * Copyright (c) 2026 Hassan Saed Mohamed. All Rights Reserved.
 * SPDX-License-Identifier: LicenseRef-Proprietary
 * No licence is granted. See LICENSE for permitted and prohibited uses.
 */
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const { configurationError } = require('./utils/crypto');

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'angz',
  waitForConnections: true,
  connectionLimit: 10,
  multipleStatements: true
});

async function initDatabase() {
  const keyError = configurationError();
  if (keyError) {
    console.error('❌ ' + keyError);
    console.error('   Generate a valid key with:');
    console.error('   node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    console.error('   then set ENCRYPTION_KEY=<that value> in backend/.env');
  }

  try {
    const connection = await pool.getConnection();
    const schemaPath = path.join(__dirname, '..', 'database', 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      const sql = fs.readFileSync(schemaPath, 'utf8');
      await connection.query(sql);
      console.log('✅ Database schema verified & updated successfully.');
    }
    connection.release();
  } catch (err) {
    if (err.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('❌ MySQL rejected the credentials in backend/.env (DB_USER / DB_PASSWORD).');
      console.error('   Check DB_USER, DB_PASSWORD and DB_NAME, then restart the API.');
    } else if (err.code === 'ER_BAD_DB_ERROR') {
      console.error(`❌ Database "${process.env.DB_NAME}" does not exist.`);
      console.error('   Create it, or import database/schema.sql once.');
    } else {
      console.warn('⚠️ Note: Database connection auto-init skipped or waiting for MySQL server:', err.message);
    }
  }
}

// Run schema verification on pool startup
initDatabase();

module.exports = pool;
