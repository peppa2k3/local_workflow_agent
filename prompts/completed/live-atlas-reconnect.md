# Khôi phục kết nối MongoDB trong agent đang chạy

Ngày: 2026-10-22. Trạng thái: hoàn thành.

- Hiện trạng: check:mongo dùng code/config hiện tại kết nối thành công nhưng dashboard vẫn báo ECONNREFUSED, 13 bản ghi chờ. Tiến trình agent đang chạy là bản cũ; một workflow download đang hoạt động.
- Xử lý: xác minh PID/cwd/entry point của agent trên cổng 34719, áp dụng DNS từ .env vào resolver của chính process và gọi API reconnect. Debugger loopback tạm thời đã đóng sau thao tác; không restart/cancel workflow và không thay URI/mật khẩu.
- Kiểm chứng trực tiếp: /api/content/status trả HTTP 200, connected=true, database=team_content, pending=0, error rỗng; /api/content/summary trả HTTP 200 và counts từ Atlas; workflow download vẫn running và elapsed tăng trên cùng process.
- Không sửa JavaScript hoặc giao thức action; bản sửa DNS bền vững đã có trong commit 17b9161 và .env local. Không tạo dữ liệu thử; outbox công việc thật được agent đồng bộ bình thường.
