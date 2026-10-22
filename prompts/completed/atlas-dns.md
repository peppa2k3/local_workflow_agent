# Atlas SRV DNS từ Node.js trên Windows

Ngày: 2026-10-22. Trạng thái: hoàn thành sửa và xác minh Atlas thật.

- Tái hiện: người dùng đã điền .env thật; check:mongo lỗi querySrv ECONNREFUSED. Node 24.16 dùng DNS loopback, Windows Resolve-DnsName vẫn trả 3 SRV record.
- Bằng chứng: dùng DNS đã cấu hình trong Windows cho riêng process Node giải được SRV/TXT, kết nối Atlas, đọc pages/assets và xác nhận quyền insert/update qua connectionStatus. Không tạo dữ liệu thử.
- Giải pháp: thêm MONGODB_DNS_SERVERS tùy chọn trong .env, áp dụng ở agent/check:mongo, giữ DNS hệ điều hành và credentials nguyên vẹn. Điền giá trị DNS hoạt động đã kiểm chứng vào .env local.
- Kiểm chứng: test cấu hình/restore/validation, npm test, node --check và ping Atlas thật bằng entry point thông thường.
- Kết quả: check:mongo trả connected=true với team_content; catalog API đọc được các collection dùng chung, quyền insert/update/createIndex được server xác nhận. Không ghi dữ liệu thử. Agent dashboard đang có workflow chạy nên cần restart sau khi workflow hoàn tất để nhận code mới.
