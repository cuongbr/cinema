require('dotenv').config();
const pool = require('./db');
const catalog = require('./data/cgv-catalog.json');

async function main() {
  let addedMovies = 0;
  let addedShowtimes = 0;
  const today = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
  const tomorrow = new Date(`${today}T00:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const tomorrowDate = tomorrow.toISOString().slice(0, 10);

  for (const movie of catalog.movies) {
    let [[row]] = await pool.query('SELECT id FROM movies WHERE title = ? LIMIT 1', [movie.title]);
    if (!row) {
      const [result] = await pool.query(
        'INSERT INTO movies (title, genre, duration_minutes) VALUES (?, ?, ?)',
        [movie.title, movie.genre.slice(0, 80), movie.duration]
      );
      row = { id: result.insertId };
      addedMovies++;
    }

    const [[existing]] = await pool.query(
      'SELECT COUNT(*) AS total FROM showtimes WHERE movie_id = ? AND starts_at > (UTC_TIMESTAMP() + INTERVAL 7 HOUR)',
      [row.id]
    );
    if (existing.total >= 2) continue;

    // Lịch và giá dưới đây chỉ là dữ liệu mô phỏng cho dự án học tập.
    const startDay = movie.openingDate > tomorrowDate ? movie.openingDate : tomorrowDate;
    const day = new Date(`${startDay}T00:00:00Z`);
    let futureCount = existing.total;
    for (let offset = 0; futureCount < 2 && offset < 7; offset++) {
      const date = day.toISOString().slice(0, 10);
      const startsAt = `${date} ${offset % 2 === 0 ? '19:00:00' : '20:00:00'}`;
      const [[duplicate]] = await pool.query(
        'SELECT COUNT(*) AS total FROM showtimes WHERE movie_id = ? AND starts_at = ?',
        [row.id, startsAt]
      );
      if (duplicate.total === 0) {
        await pool.query(
          'INSERT INTO showtimes (movie_id, starts_at, ticket_price) VALUES (?, ?, 85000)',
          [row.id, startsAt]
        );
        addedShowtimes++;
        futureCount++;
      }
      day.setUTCDate(day.getUTCDate() + 1);
    }
  }

  console.log(`Đã thêm ${addedMovies} phim, ${addedShowtimes} suất chiếu mô phỏng từ danh sách ngày ${catalog.snapshotDate}.`);
}

main().catch(error => {
  console.error('Không cập nhật được danh sách phim:', error);
  process.exitCode = 1;
}).finally(() => pool.end());
