USE movie_booking;

CREATE TABLE IF NOT EXISTS movies (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(120) NOT NULL,
  genre VARCHAR(80) NOT NULL,
  duration_minutes SMALLINT UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS showtimes (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  movie_id INT UNSIGNED NOT NULL,
  starts_at DATETIME NOT NULL,
  ticket_price DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (movie_id) REFERENCES movies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO movies (id, title, genre, duration_minutes) VALUES
  (1, 'Chuyến Tàu Đêm', 'Hành động', 110),
  (2, 'Mùa Hè Rực Rỡ', 'Tình cảm', 95);

INSERT IGNORE INTO showtimes (id, movie_id, starts_at, ticket_price) VALUES
  (1, 1, DATE_ADD(NOW(), INTERVAL 1 DAY), 80000),
  (2, 1, DATE_ADD(NOW(), INTERVAL 2 DAY), 80000),
  (3, 2, DATE_ADD(NOW(), INTERVAL 1 DAY), 70000),
  (4, 2, DATE_ADD(NOW(), INTERVAL 2 DAY), 70000);