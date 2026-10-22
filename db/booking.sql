USE movie_booking;

CREATE TABLE IF NOT EXISTS seats (
  id SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  label VARCHAR(3) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS bookings (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  showtime_id INT UNSIGNED NOT NULL,
  customer_name VARCHAR(100) NOT NULL,
  customer_email VARCHAR(190) NOT NULL,
  status ENUM('pending', 'paid') NOT NULL DEFAULT 'pending',
  total_amount DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (showtime_id) REFERENCES showtimes(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tickets (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  booking_id BIGINT UNSIGNED NOT NULL,
  showtime_id INT UNSIGNED NOT NULL,
  seat_id SMALLINT UNSIGNED NOT NULL,
  UNIQUE KEY unique_showtime_seat (showtime_id, seat_id),
  FOREIGN KEY (booking_id) REFERENCES bookings(id),
  FOREIGN KEY (showtime_id) REFERENCES showtimes(id),
  FOREIGN KEY (seat_id) REFERENCES seats(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO seats (id, label) VALUES
  (1, 'A1'), (2, 'A2'), (3, 'A3'),
  (4, 'A4'), (5, 'A5'), (6, 'A6'),
  (7, 'B1'), (8, 'B2'), (9, 'B3'),
  (10, 'B4'), (11, 'B5'), (12, 'B6');