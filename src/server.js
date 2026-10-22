require('dotenv').config();
const express = require('express');
const path = require('path');
const pool = require('./db');

const app = express();
const port = Number(process.env.PORT) || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: false }));

app.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        m.id, m.title, m.genre, m.duration_minutes,
        s.id AS showtime_id,
        DATE_FORMAT(s.starts_at, '%d/%m/%Y %H:%i') AS showtime,
        s.ticket_price
      FROM movies m
      LEFT JOIN showtimes s ON s.movie_id = m.id
      ORDER BY m.id, s.starts_at
    `);

    const movieMap = new Map();

    for (const row of rows) {
      if (!movieMap.has(row.id)) {
        movieMap.set(row.id, {
          title: row.title,
          genre: row.genre,
          duration: row.duration_minutes,
          showtimes: []
        });
      }

      if (row.showtime_id !== null) {
        movieMap.get(row.id).showtimes.push({
          id: row.showtime_id,
          time: row.showtime,
          price: row.ticket_price
        });
      }
    }

    res.render('index', { movies: [...movieMap.values()] });
  } catch (error) {
    console.error('Không tải được phim:', error);
    res.status(500).send('Không tải được danh sách phim');
  }
});

app.get('/showtimes/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    return res.status(404).send('Không tìm thấy suất chiếu');
  }

  try {
    const [[showtime]] = await pool.query(`
      SELECT s.id, m.title,
        DATE_FORMAT(s.starts_at, '%d/%m/%Y %H:%i') AS time,
        s.ticket_price
      FROM showtimes s
      JOIN movies m ON m.id = s.movie_id
      WHERE s.id = ?
    `, [id]);

    if (!showtime) {
      return res.status(404).send('Không tìm thấy suất chiếu');
    }

    const [seats] = await pool.query(`
      SELECT s.id, s.label,
        EXISTS (
          SELECT 1 FROM tickets t
          WHERE t.showtime_id = ? AND t.seat_id = s.id
        ) AS booked
      FROM seats s
      ORDER BY s.id
    `, [id]);

    res.render('seats', { showtime, seats });
  } catch (error) {
    console.error('Không tải được sơ đồ ghế:', error);
    res.status(500).send('Không tải được sơ đồ ghế');
  }
});

app.post('/bookings', async (req, res) => {
  const showtimeId = Number(req.body.showtime_id);
  const rawSeatIds = Array.isArray(req.body.seat_ids)
    ? req.body.seat_ids
    : req.body.seat_ids ? [req.body.seat_ids] : [];
  const seatIds = [...new Set(rawSeatIds.map(Number))];
  const name = String(req.body.customer_name || '').trim();
  const email = String(req.body.customer_email || '').trim();

  const invalidSeats = seatIds.some(id => !Number.isSafeInteger(id) || id < 1);
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  if (
    !Number.isSafeInteger(showtimeId) || showtimeId < 1 ||
    seatIds.length < 1 || seatIds.length > 12 || invalidSeats ||
    !name || name.length > 100 || email.length > 190 || !validEmail
  ) {
    return res.status(400).send('Thông tin đặt vé không hợp lệ');
  }

  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [[showtime]] = await connection.query(
      'SELECT ticket_price FROM showtimes WHERE id = ?',
      [showtimeId]
    );

    if (!showtime) {
      await connection.rollback();
      return res.status(404).send('Không tìm thấy suất chiếu');
    }

    const placeholders = seatIds.map(() => '?').join(', ');
    const [validSeats] = await connection.query(
      `SELECT id FROM seats WHERE id IN (${placeholders})`,
      seatIds
    );

    if (validSeats.length !== seatIds.length) {
      await connection.rollback();
      return res.status(400).send('Có ghế không hợp lệ');
    }

    const totalAmount = Number(showtime.ticket_price) * seatIds.length;

    const [result] = await connection.query(`
      INSERT INTO bookings
        (showtime_id, customer_name, customer_email, status, total_amount)
      VALUES (?, ?, ?, 'pending', ?)
    `, [showtimeId, name, email, totalAmount]);

    for (const seatId of seatIds) {
      await connection.query(`
        INSERT INTO tickets (booking_id, showtime_id, seat_id)
        VALUES (?, ?, ?)
      `, [result.insertId, showtimeId, seatId]);
    }

    // Thanh toán giả lập: đánh dấu đơn đã thanh toán.
    await connection.query(
      "UPDATE bookings SET status = 'paid' WHERE id = ?",
      [result.insertId]
    );

    await connection.commit();
    res.redirect(`/bookings/${result.insertId}`);
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).send(
        `Ghế vừa được người khác đặt. <a href="/showtimes/${showtimeId}">Xem lại sơ đồ ghế</a>`
      );
    }

    console.error('Không thể đặt vé:', error);
    res.status(500).send('Không thể đặt vé');
  } finally {
    if (connection) connection.release();
  }
});

app.get('/bookings/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    return res.status(404).send('Không tìm thấy vé');
  }

  try {
    const [[booking]] = await pool.query(`
      SELECT b.id, b.status, b.total_amount, m.title,
        DATE_FORMAT(st.starts_at, '%d/%m/%Y %H:%i') AS time,
        (
          SELECT GROUP_CONCAT(s.label ORDER BY s.id SEPARATOR ', ')
          FROM tickets t
          JOIN seats s ON s.id = t.seat_id
          WHERE t.booking_id = b.id
        ) AS seat_labels
      FROM bookings b
      JOIN showtimes st ON st.id = b.showtime_id
      JOIN movies m ON m.id = st.movie_id
      WHERE b.id = ?
    `, [id]);

    if (!booking) {
      return res.status(404).send('Không tìm thấy vé');
    }

    res.render('confirmation', { booking });
  } catch (error) {
    console.error('Không tải được vé:', error);
    res.status(500).send('Không tải được vé');
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/health/db', async (req, res) => {
  try {
    const [[row]] = await pool.query(
      'SELECT COUNT(*) AS movies FROM movies'
    );
    res.json({ status: 'ok', movies: row.movies });
  } catch (error) {
    console.error('Lỗi kết nối MySQL:', error);
    res.status(500).json({ status: 'error' });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Website đang chạy tại http://localhost:${port}`);
});