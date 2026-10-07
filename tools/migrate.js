/*
 * Idempotent migrations for databases created before these features existed.
 *
 * `database/schema.sql` runs on every boot, but `CREATE TABLE IF NOT EXISTS`
 * silently skips a table that already exists, so column-level changes (such as
 * widening `tasks.title` to fit ciphertext) never reach an existing database.
 * This script applies those changes safely and can be re-run.
 *
 * Usage: node tools/migrate.js
 */

const path = require('node:path');

// This script lives outside backend/, so resolve its dependencies from there
// rather than relying on node_modules lookup walking up from tools/.
const BACKEND_MODULES = path.join(__dirname, '..', 'backend', 'node_modules');
const mysql = require(require.resolve('mysql2/promise', { paths: [BACKEND_MODULES] }));

require(require.resolve('dotenv', { paths: [BACKEND_MODULES] })).config({
  path: path.join(__dirname, '..', 'backend', '.env'),
});

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'angz',
  multipleStatements: false,
});

async function main() {
  const connection = await pool.getConnection();
  try {
    // Widen `tasks.title` so AES-256-GCM ciphertext fits. At VARCHAR(255) any
    // title over 94 characters overflowed and became undecryptable.
    const [cols] = await connection.query(
      "SELECT CHARACTER_MAXIMUM_LENGTH AS len FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND COLUMN_NAME = 'title'",
    );
    const currentLen = cols[0]?.len;
    if (!currentLen) {
      console.log('- tasks.title not found (schema.sql has not been applied yet)');
    } else if (currentLen < 1000) {
      await connection.query('ALTER TABLE `tasks` MODIFY COLUMN `title` VARCHAR(1000) NOT NULL');
      console.log(`✓ widened tasks.title ${currentLen} -> 1000`);
    } else {
      console.log(`✓ tasks.title already ${currentLen}`);
    }

    // `ADD COLUMN IF NOT EXISTS` is MariaDB syntax and MySQL 8 rejects it, so
    // check information_schema first and only issue the ALTER when the column
    // is genuinely absent.
    const [userCols] = await connection.query(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'email_changed_at'",
    );
    if (userCols.length === 0) {
      await connection.query('ALTER TABLE `users` ADD COLUMN `email_changed_at` DATETIME NULL');
      console.log('✓ added users.email_changed_at');
    } else {
      console.log('✓ users.email_changed_at already present');
    }

    // Create the new tables on existing databases.
    for (const file of ['media', 'password_resets']) {
      const sql = require('node:fs').readFileSync(
        path.join(__dirname, '..', 'database', 'schema.sql'),
        'utf8',
      );
      const match = sql.match(
        new RegExp(`CREATE TABLE IF NOT EXISTS \`${file}\`[\\s\\S]*?ENGINE=InnoDB[^;]*;`),
      );
      if (match) {
        await connection.query(match[0]);
        console.log(`✓ table ${file} ready`);
      }
    }
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('migration failed:', err.message);
  process.exit(1);
});