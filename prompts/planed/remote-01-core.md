# 01 — Connection core

Tạo module giao thức có giới hạn payload, xác thực token và yêu cầu HTTPS (HTTP chỉ
loopback khi bật dev). Kho VPS SQLite bền vững, kho cấu hình local ghi atomic.
Kết nối outbound timeout, không redirect, không log credential. Test fixture local.
Phụ thuộc: không. Thành công khi dữ liệu tồn tại sau reopen và transport fail closed.
