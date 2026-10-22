require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const pool = require('./db');
const migrateAuth = require('./migrate-auth');
const { hashPassword, verifyPassword, createSession, clearSession, attachUser, sameOrigin } = require('./auth');
const movieCatalog = require('./data/cgv-catalog.json').movies;
const catalogByTitle = new Map(movieCatalog.map(movie => [movie.title, movie]));

const app = express();
const port = Number(process.env.PORT) || 3000;

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));
app.use('/assets', express.static(path.join(__dirname, 'public')));

const accessLog = process.env.ACCESS_LOG_FILE
  ? fs.createWriteStream(process.env.ACCESS_LOG_FILE, { flags: 'a' })
  : null;

if (accessLog) {
  accessLog.on('error', error => console.error('Lỗi ghi access log:', error));
}

app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    const entry = JSON.stringify({
      time: new Date().toISOString(),
      service: 'app',
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration_ms: Date.now() - startedAt
    });
    if (accessLog) accessLog.write(`${entry}\n`);
  });
  next();
});

app.use(attachUser);
app.use(['/register', '/login', '/logout', '/bookings'], sameOrigin);

function authError(res, view, message, values = {}, status = 400) {
  return res.status(status).render(view, { error: message, values });
}

app.get('/register', (req, res) => {
  if (req.currentUser) return res.redirect('/account');
  res.render('register', { error: null, values: {} });
});

app.post('/register', async (req, res) => {
  if (req.currentUser) return res.redirect('/account');
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const confirm = String(req.body.confirm_password || '');
  const values = { name, email };
  if (!name || name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 190) {
    return authError(res, 'register', 'Vui lòng nhập tên và email hợp lệ.', values);
  }
  if (password.length < 8 || password.length > 128) {
    return authError(res, 'register', 'Mật khẩu cần có từ 8 đến 128 ký tự.', values);
  }
  if (password !== confirm) return authError(res, 'register', 'Mật khẩu xác nhận chưa khớp.', values);
  try {
    const passwordHash = await hashPassword(password);
    const [result] = await pool.query('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)', [name, email, passwordHash]);
    await createSession(req, res, result.insertId);
    res.redirect('/account');
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return authError(res, 'register', 'Email này đã được đăng ký.', values, 409);
    console.error('Không thể đăng ký:', error);
    res.status(500).send('Không thể đăng ký tài khoản');
  }
});

app.get('/login', (req, res) => {
  if (req.currentUser) return res.redirect('/account');
  res.render('login', { error: null, values: {} });
});

app.post('/login', async (req, res) => {
  if (req.currentUser) return res.redirect('/account');
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!email || email.length > 190 || !password || password.length > 128) {
    return authError(res, 'login', 'Email hoặc mật khẩu không đúng.', { email }, 401);
  }
  try {
    const [[user]] = await pool.query('SELECT id, password_hash FROM users WHERE email = ?', [email]);
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return authError(res, 'login', 'Email hoặc mật khẩu không đúng.', { email }, 401);
    }
    await createSession(req, res, user.id);
    res.redirect('/account');
  } catch (error) {
    console.error('Không thể đăng nhập:', error);
    res.status(500).send('Không thể đăng nhập');
  }
});

app.post('/logout', async (req, res) => {
  try {
    await clearSession(req, res);
    res.redirect('/');
  } catch (error) {
    console.error('Không thể đăng xuất:', error);
    res.status(500).send('Không thể đăng xuất');
  }
});

app.get('/account', async (req, res) => {
  if (!req.currentUser) return res.redirect('/login');
  try {
    const [bookings] = await pool.query(`
      SELECT b.id, b.status, b.total_amount, m.title,
        DATE_FORMAT(st.starts_at, '%d/%m/%Y %H:%i') AS time,
        GROUP_CONCAT(s.label ORDER BY s.id SEPARATOR ', ') AS seat_labels
      FROM bookings b
      JOIN showtimes st ON st.id = b.showtime_id
      JOIN movies m ON m.id = st.movie_id
      LEFT JOIN tickets t ON t.booking_id = b.id
      LEFT JOIN seats s ON s.id = t.seat_id
      WHERE b.user_id = ?
      GROUP BY b.id, b.status, b.total_amount, m.title, st.starts_at
      ORDER BY b.id DESC
    `, [req.currentUser.id]);
    res.render('account', { bookings });
  } catch (error) {
    console.error('Không tải được tài khoản:', error);
    res.status(500).send('Không tải được tài khoản');
  }
});

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
        AND s.starts_at > (UTC_TIMESTAMP() + INTERVAL 7 HOUR)
      ORDER BY m.id, s.starts_at
    `);

    const movieMap = new Map();

    for (const row of rows) {
      if (!movieMap.has(row.id)) {
        movieMap.set(row.id, {
          id: row.id,
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

    const allMovies = [...movieMap.values()];
    const catalogMovies = allMovies
      .filter(movie => catalogByTitle.has(movie.title))
      .map(movie => ({ ...movie, ...catalogByTitle.get(movie.title) }));
    catalogMovies.sort((a, b) => movieCatalog.findIndex(movie => movie.title === a.title) - movieCatalog.findIndex(movie => movie.title === b.title));
    res.render('index', {
      movies: catalogMovies.length ? catalogMovies : allMovies,
      catalogDate: '22/10/2026',
      todayISO: new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit'
      }).format(new Date())
    });
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
      WHERE s.id = ? AND s.starts_at > (UTC_TIMESTAMP() + INTERVAL 7 HOUR)
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
  const name = req.currentUser ? req.currentUser.name : String(req.body.customer_name || '').trim();
  const email = req.currentUser ? req.currentUser.email : String(req.body.customer_email || '').trim();

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
      'SELECT ticket_price FROM showtimes WHERE id = ? AND starts_at > (UTC_TIMESTAMP() + INTERVAL 7 HOUR)',
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
        (showtime_id, customer_name, customer_email, user_id, status, total_amount)
      VALUES (?, ?, ?, ?, 'pending', ?)
    `, [showtimeId, name, email, req.currentUser ? req.currentUser.id : null, totalAmount]);

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
      SELECT b.id, b.user_id, b.status, b.total_amount, m.title,
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
    if (booking.user_id && (!req.currentUser || Number(booking.user_id) !== Number(req.currentUser.id))) {
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

migrateAuth()
  .then(() => app.listen(port, '0.0.0.0', () => {
    console.log(`Website đang chạy tại http://localhost:${port}`);
  }))
  .catch(error => { console.error('Không thể khởi tạo tài khoản:', error); process.exit(1); });
