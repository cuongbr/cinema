require('dotenv').config();
const pool = require('./db');

async function migrateAuth() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(190) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_sessions (
      token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_auth_sessions_user (user_id),
      INDEX idx_auth_sessions_expiry (expires_at),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  const [[column]] = await pool.query(`
    SELECT 1 AS found FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings' AND COLUMN_NAME = 'user_id'
  `);
  if (!column) {
    await pool.query(`
      ALTER TABLE bookings
      ADD COLUMN user_id BIGINT UNSIGNED NULL,
      ADD INDEX idx_bookings_user (user_id),
      ADD CONSTRAINT fk_bookings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    `);
  }
}

if (require.main === module) {
  migrateAuth()
    .then(() => console.log('Đã cập nhật bảng tài khoản.'))
    .catch(error => { console.error('Không thể cập nhật bảng tài khoản:', error); process.exitCode = 1; })
    .finally(() => pool.end());
}

module.exports = migrateAuth;
