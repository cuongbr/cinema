# Hệ thống đặt vé xem phim - Đề 11

Website cho phép xem phim, chọn suất chiếu, chọn ghế và thanh toán giả lập.
Hệ thống chạy bằng Docker Compose với Express, MySQL, phpMyAdmin, Nginx,
Prometheus và Grafana.

## Chuẩn bị

Cài Docker Desktop và bảo đảm Docker Engine đang chạy.

Sao chép `.env.example` thành `.env`, sau đó thay các giá trị mẫu bằng
những mật khẩu mạnh, khác nhau. Không đưa `.env` lên GitHub.

## Khởi chạy

```powershell
docker compose up -d --build
docker compose ps
```

Lần chạy đầu, mở phpMyAdmin tại http://localhost:8080, đăng nhập bằng
`movie_app` và mật khẩu `MYSQL_PASSWORD` trong `.env`. Chọn database
`movie_booking`, nhập lần lượt `db/schema.sql` rồi `db/booking.sql`.

Để nạp danh sách phim cho giao diện mới, chạy thêm:

```powershell
docker compose exec -T app node src/seed-cgv-catalog.js
```

Lệnh này chỉ bổ sung phim và suất chiếu mô phỏng, không xóa dữ liệu đặt vé
đã có. Danh sách 27 phim là ảnh chụp dữ liệu ngày 22/10/2026 từ
[trang CGV trên MoMo](https://www.momo.vn/cinema/rap/cgv), được lưu ở
`src/data/cgv-catalog.json` (gồm cả phim sắp chiếu). Poster tải từ URL của nguồn khi mở trang;
vì thế poster cần kết nối Internet. Giao diện CineVé là dự án học tập,
không phải website của CGV. Lịch chiếu, giá vé và thanh toán đều là mô phỏng.

Ứng dụng tự tạo bảng `users`, `auth_sessions` và bổ sung `bookings.user_id`
khi khởi động. Dữ liệu đặt vé cũ được giữ nguyên. Có thể chạy thủ công lệnh
`docker compose exec -T app node src/migrate-auth.js` để kiểm tra migration.

## Địa chỉ truy cập

- Website qua Nginx: http://localhost:8081
- phpMyAdmin: http://localhost:8080
- Website trực tiếp để kiểm tra: http://localhost:3001
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3002

MySQL chỉ mở trên máy cục bộ ở cổng 3307.

## Giám sát

Prometheus lấy số liệu từ Nginx exporter, MySQL exporter và cAdvisor mỗi
15 giây. Mở `http://localhost:9090/targets` để kiểm tra các target ở trạng
thái `UP`. Trong Grafana, đăng nhập bằng tài khoản `admin` và mật khẩu
`GRAFANA_ADMIN_PASSWORD` trong `.env`.

Dashboard `Movie Booking - Giám sát hệ thống` có bốn panel: trạng thái
MySQL (`mysql_up`), trạng thái Nginx (`nginx_up`), số yêu cầu Nginx mỗi
giây (`rate(nginx_http_requests_total[5m])`) và RAM theo dịch vụ Docker
Compose. Grafana tự nạp dashboard trong thư mục **Movie Booking** từ
`grafana/dashboards/movie-booking.json`. Bản dashboard đã tạo thủ công cũng
được lưu ở `grafana/dashboard.json` để tham khảo.

## Log tập trung

Loki nhận log từ Promtail. Promtail đọc access log của ứng dụng và Nginx
trong các Docker volume `app_logs` và `nginx_logs`. Mở Grafana Explore,
chọn nguồn dữ liệu **Loki** để tìm log. Ba truy vấn LogQL và cách tạo dữ
liệu mẫu được ghi trong `docs/logql.md`.

## Demo chức năng

1. Mở website qua Nginx và chọn một suất chiếu.
2. Có thể đăng ký và đăng nhập ở góc trên trang để lưu vé vào tài khoản.
3. Chọn ghế còn trống, nhập tên và email.
4. Bấm “Xác nhận đặt vé”.
5. Xem trang xác nhận; thành viên có thể mở “Vé của tôi” để xem lại vé.
6. Quay lại suất chiếu để thấy ghế đã đặt chuyển màu xám, hoặc mở phpMyAdmin
   để kiểm tra bảng `bookings` và `tickets`.

Một ghế trong một suất chiếu chỉ được đặt một lần nhờ ràng buộc
`unique_showtime_seat` trong MySQL.

## Bảo mật hiện có

- Ứng dụng chạy trong container bằng tài khoản `node`, không chạy root.
- Mật khẩu nằm trong `.env`, file này được Git bỏ qua.
- MySQL và phpMyAdmin chỉ mở cổng trên `127.0.0.1`.
- Nginx có các security headers cơ bản.
- Ứng dụng tắt header `X-Powered-By`; Nginx không công bố số phiên bản.
- Mật khẩu tài khoản được băm bằng scrypt; cookie đăng nhập chỉ chứa token ngẫu
  nhiên, có `HttpOnly` và `SameSite=Lax`. Vé của thành viên chỉ mở bằng tài
  khoản đã đặt. Vé đặt với tư cách khách vẫn xem được qua đường dẫn xác nhận.
