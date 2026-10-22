# Truy vấn log tập trung bằng Loki

Mở Grafana tại `http://localhost:3002`, chọn **Explore** và nguồn dữ liệu
**Loki**. Chọn khoảng thời gian **Last 1 hour**, sau đó chạy từng truy vấn.

## 1. Xem log truy cập qua Nginx

```logql
{job="nginx"}
```

Mỗi dòng cho biết phương thức HTTP, đường dẫn, mã phản hồi và thời điểm
truy cập. Có thể tạo log mẫu bằng `curl.exe http://localhost:8081/health`.

## 2. Tìm yêu cầu lỗi của ứng dụng

```logql
{job="app"} | json | status >= 400
```

Ứng dụng ghi log JSON gồm `time`, `method`, `path`, `status` và
`duration_ms`. Để thử bộ lọc, gọi
`curl.exe http://localhost:8081/khong-co`; kết quả sẽ có `status: 404`.

## 3. Đếm số dòng log theo dịch vụ trong một giờ gần nhất

```logql
sum by (job) (count_over_time({job=~"app|nginx"}[1h]))
```

Kết quả cho biết số log của `app` và `nginx` trong cửa sổ một giờ, dùng
để so sánh mức hoạt động của hai dịch vụ.
