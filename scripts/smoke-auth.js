require('dotenv').config();
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const pool = require('../src/db');

const base = process.env.SMOKE_BASE_URL || 'http://localhost:8081';
const email = `smoke-${crypto.randomBytes(6).toString('hex')}@example.test`;
const password = `Test-${crypto.randomBytes(12).toString('hex')}`;
let userId;
let bookingId;

async function request(path, options = {}, cookie) {
  const response = await fetch(`${base}${path}`, {
    redirect: 'manual',
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(options.method === 'POST' ? { Origin: base } : {}),
      ...(cookie ? { Cookie: cookie } : {})
    }
  });
  return { response, body: await response.text() };
}

async function main() {
  const form = new URLSearchParams({ name: 'Khách kiểm thử', email, password, confirm_password: password });
  const registered = await request('/register', { method: 'POST', body: form });
  assert.equal(registered.response.status, 302);
  assert.equal(registered.response.headers.get('location'), '/account');
  const cookie = registered.response.headers.get('set-cookie').split(';')[0];
  const [[user]] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
  userId = user.id;

  const account = await request('/account', {}, cookie);
  assert.equal(account.response.status, 200);
  assert.match(account.body, /VÉ CỦA TÔI/);
  const guest = await request('/account');
  assert.equal(guest.response.status, 302);
  assert.equal(guest.response.headers.get('location'), '/login');

  const [[seat]] = await pool.query(`
    SELECT st.id AS showtime_id, s.id AS seat_id FROM showtimes st CROSS JOIN seats s
    LEFT JOIN tickets t ON t.showtime_id = st.id AND t.seat_id = s.id
    WHERE st.starts_at > (UTC_TIMESTAMP() + INTERVAL 7 HOUR) AND t.id IS NULL
    LIMIT 1
  `);
  assert.ok(seat, 'Cần một suất chiếu tương lai và một ghế trống để thử đặt vé');
  const bookingForm = new URLSearchParams({ showtime_id: seat.showtime_id, seat_ids: seat.seat_id,
    customer_name: 'Tên khác', customer_email: 'other@example.test' });
  const booked = await request('/bookings', { method: 'POST', body: bookingForm }, cookie);
  assert.equal(booked.response.status, 302);
  bookingId = Number(booked.response.headers.get('location').split('/').at(-1));
  const [[booking]] = await pool.query('SELECT user_id, customer_email FROM bookings WHERE id = ?', [bookingId]);
  assert.equal(Number(booking.user_id), Number(userId));
  assert.equal(booking.customer_email, email);
  assert.equal((await request(`/bookings/${bookingId}`, {}, cookie)).response.status, 200);
  assert.equal((await request(`/bookings/${bookingId}`)).response.status, 404);
  const filledAccount = await request('/account', {}, cookie);
  assert.match(filledAccount.body, new RegExp(`MÃ VÉ #${bookingId}`));

  assert.equal((await request('/logout', { method: 'POST' }, cookie)).response.status, 302);
  assert.equal((await request('/account', {}, cookie)).response.status, 302);
  const wrong = await request('/login', { method: 'POST', body: new URLSearchParams({ email, password: 'wrong-password' }) });
  assert.equal(wrong.response.status, 401);
  const login = await request('/login', { method: 'POST', body: new URLSearchParams({ email, password }) });
  assert.equal(login.response.status, 302);
  assert.equal(login.response.headers.get('location'), '/account');
  console.log('Đăng ký, đăng nhập, đăng xuất và vé theo tài khoản: OK');
}

main()
  .catch(error => { console.error(error); process.exitCode = 1; })
  .finally(async () => {
    if (bookingId) {
      await pool.query('DELETE FROM tickets WHERE booking_id = ?', [bookingId]);
      await pool.query('DELETE FROM bookings WHERE id = ?', [bookingId]);
    }
    if (userId) await pool.query('DELETE FROM users WHERE id = ?', [userId]);
    await pool.end();
  });
