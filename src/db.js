const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3307,
  user: 'movie_app',
  password: process.env.MYSQL_PASSWORD,
  database: 'movie_booking',
  waitForConnections: true,
  connectionLimit: 5
});

module.exports = pool;