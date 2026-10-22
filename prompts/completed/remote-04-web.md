# 04 — Remote and local web UI

Web VPS có đăng nhập/logout, nhận code, thiết bị online/offline/last seen, profile,
scenario, chạy/dừng, tiến độ step và lịch sử. Local /remote cấu hình allowlist,
tạo code, xem tài khoản yêu cầu, xác nhận/revoke. Link từ dashboard và extension.
Tránh innerHTML với dữ liệu user; CSRF/session không nằm trong localStorage.
Phụ thuộc 03. Kiểm tra bằng HTTP fixture/static syntax; không điều khiển máy thật.

Hoàn tất: UI VPS và /remote, link dashboard/extension. tests/remote-web.js chạy browser cô lập với HTTP mock cho login, XSS, overrides, lịch sử step, mobile và xác nhận local; tests/agent-api.js kiểm tra guard session và assets. Không dùng Chrome profile người dùng.
