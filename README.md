# CineVé — website đặt vé xem phim (Đề 11)

CineVé là dự án học tập về đặt vé xem phim. Người dùng có thể xem danh sách phim, chọn suất chiếu và ghế, đặt vé, tạo tài khoản và xem lại vé trong mục **Vé của tôi**. Hệ thống còn có dashboard giám sát bằng Prometheus/Grafana và log tập trung bằng Loki.

> **Lưu ý:** CineVé không phải website chính thức của CGV và không liên kết với CGV. Danh sách phim là dữ liệu tham khảo lưu ngày **22/10/2026**, không cập nhật trực tiếp. Suất chiếu, giá vé, ưu đãi và trạng thái thanh toán trên website đều là **mô phỏng**; không có giao dịch thật.

## Công nghệ

| Thành phần | Vai trò |
| --- | --- |
| Node.js, Express, EJS | Website và xử lý đặt vé |
| MySQL 8.4 | Phim, suất chiếu, ghế, vé, tài khoản và phiên đăng nhập |
| Nginx | Chuyển tiếp yêu cầu đến ứng dụng |
| Prometheus, Grafana | Thu thập và hiển thị số liệu |
| Nginx exporter, MySQL exporter, cAdvisor | Cung cấp số liệu giám sát |
| Loki, Promtail | Tập trung log ứng dụng và Nginx |
| phpMyAdmin | Xem và quản lý database khi phát triển |

Toàn bộ dịch vụ chạy bằng Docker Compose. Các cổng trong `compose.yaml` chỉ mở trên `127.0.0.1` để dùng ở máy cục bộ.

## Chạy dự án từ đầu

### 1. Chuẩn bị

Cài và mở Docker Desktop. Trong PowerShell, vào thư mục dự án rồi tạo file cấu hình:

```powershell
Copy-Item .env.example .env
```

Mở `.env` và thay ba mật khẩu mẫu: `MYSQL_ROOT_PASSWORD`, `MYSQL_PASSWORD`, `GRAFANA_ADMIN_PASSWORD`. File `.env` đã được Git bỏ qua; không đưa mật khẩu lên GitHub.

### 2. Tạo database

Khởi động MySQL và phpMyAdmin trước:

```powershell
docker compose up -d db phpmyadmin
docker compose ps
```

Mở [phpMyAdmin](http://localhost:8080), đăng nhập với tên `movie_app` và mật khẩu `MYSQL_PASSWORD` trong `.env`. Chọn database `movie_booking`, vào tab **Import** và nhập lần lượt:

1. `db/schema.sql` — tạo bảng phim/suất chiếu và hai phim mẫu.
2. `db/booking.sql` — tạo bảng ghế/vé và 12 ghế mẫu.

Nếu MySQL vừa khởi động, đợi vài giây rồi tải lại phpMyAdmin. Chỉ cần nhập hai file SQL này khi tạo database lần đầu; **không xóa volume MySQL** nếu muốn giữ dữ liệu đã đặt.

### 3. Khởi động website và dịch vụ giám sát

```powershell
docker compose up -d --build
docker compose ps
```

Khi app khởi động, nó tự tạo bảng `users`, `auth_sessions` và thêm `bookings.user_id` nếu chưa có. Dữ liệu vé cũ được giữ nguyên. Có thể kiểm tra bằng:

```powershell
curl.exe http://localhost:8081/health/db
```

Kết quả cần có `"status":"ok"`.

### 4. Nạp danh sách phim cho giao diện

```powershell
docker compose exec -T app node src/seed-cgv-catalog.js
```

Script nạp 27 phim tham khảo và tạo suất chiếu **mô phỏng**. Chạy lại không tạo trùng phim và không xóa vé đã đặt. Dữ liệu phim được lưu ở `src/data/cgv-catalog.json`, tham khảo [danh sách CGV trên MoMo](https://www.momo.vn/cinema/rap/cgv) ngày 22/10/2026, gồm cả phim sắp chiếu. Poster lấy từ URL trong dữ liệu nên cần Internet để hiển thị.

Cuối cùng mở **[http://localhost:8081](http://localhost:8081)** để dùng website.

## Các địa chỉ cục bộ

| Dịch vụ | Địa chỉ |
| --- | --- |
| Website qua Nginx | [http://localhost:8081](http://localhost:8081) |
| Website trực tiếp | [http://localhost:3001](http://localhost:3001) |
| phpMyAdmin | [http://localhost:8080](http://localhost:8080) |
| Prometheus | [http://localhost:9090](http://localhost:9090) |
| Grafana | [http://localhost:3002](http://localhost:3002) |
| Loki | [http://localhost:3100](http://localhost:3100) |

MySQL có thể được truy cập cục bộ ở `127.0.0.1:3307`.

## Dùng thử đặt vé

1. Chọn **Đăng ký** ở đầu trang, tạo tài khoản rồi đăng nhập. Bạn cũng có thể đặt vé với tư cách khách.
2. Chọn phim, suất chiếu và ghế còn trống; mỗi lần đặt tối đa 12 ghế.
3. Xác nhận để mở trang vé. Trạng thái “đã thanh toán” chỉ là giả lập.
4. Khi đã đăng nhập, mở **Vé của tôi** để xem lại các vé đặt bằng tài khoản đó.

Vé đặt trước khi đăng nhập không tự chuyển vào tài khoản. Vé khách vẫn xem được bằng đường dẫn trang xác nhận. MySQL có ràng buộc `unique_showtime_seat`, nên một ghế không thể được đặt hai lần cho cùng suất chiếu.

## Giám sát và log

Prometheus lấy số liệu mỗi 15 giây từ chính Prometheus, Nginx exporter, MySQL exporter và cAdvisor. Kiểm tra trạng thái tại [Prometheus Targets](http://localhost:9090/targets). Trên [Grafana](http://localhost:3002), đăng nhập bằng `admin` và mật khẩu `GRAFANA_ADMIN_PASSWORD` trong `.env`.

Dashboard **Movie Booking - Giám sát hệ thống** được nạp tự động vào thư mục **Movie Booking**. Các panel hiển thị trạng thái MySQL, trạng thái Nginx, lượt truy cập Nginx mỗi giây và RAM theo dịch vụ. Nguồn nằm trong `grafana/dashboards/movie-booking.json`; file `grafana/dashboard.json` là bản tạo thủ công để tham khảo.

Trong **Grafana → Explore**, chọn nguồn dữ liệu **Loki** để xem log ứng dụng và Nginx. Xem các truy vấn mẫu trong [docs/logql.md](docs/logql.md).

## Kiểm tra và lệnh thường dùng

```powershell
# Xem trạng thái container
docker compose ps

# Xem log ứng dụng khi trang không mở được
docker compose logs --tail 100 app nginx db

# Kiểm tra website và database
curl.exe http://localhost:8081/health
curl.exe http://localhost:8081/health/db

# Dựng lại ứng dụng sau khi sửa code
docker compose up -d --build app

# Dừng dịch vụ nhưng giữ dữ liệu trong volume
docker compose down
```

Có thể chạy `npm ci` rồi `node scripts/smoke-auth.js` trên máy cục bộ để kiểm tra đăng ký, đăng nhập, đặt vé theo tài khoản và đăng xuất. Script tạo tài khoản/vé tạm trong database đang chạy và xóa chúng sau khi kiểm tra. Không dùng `docker compose down -v` nếu muốn giữ phim, vé và dashboard đã lưu.

## Cấu trúc chính

- `src/server.js`: các trang, API sức khỏe và xử lý đặt vé.
- `src/auth.js`, `src/migrate-auth.js`: đăng nhập, phiên và cập nhật bảng tài khoản.
- `src/views/`, `src/public/`: giao diện EJS, CSS và tài nguyên.
- `db/`: cấu trúc MySQL và dữ liệu mẫu ban đầu.
- `src/data/cgv-catalog.json`, `src/seed-cgv-catalog.js`: danh sách phim tham khảo và script nạp dữ liệu.
- `nginx/`, `prometheus/`, `grafana/`, `loki/`, `promtail/`: cấu hình chuyển tiếp, giám sát và log.

Mật khẩu tài khoản được băm bằng scrypt. Cookie phiên dùng token ngẫu nhiên với `HttpOnly` và `SameSite=Lax`; vé của thành viên chỉ xem được bằng đúng tài khoản đã đặt.
