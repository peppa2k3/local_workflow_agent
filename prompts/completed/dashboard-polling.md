# Dashboard gọi profiles liên tục / thao tác lag

2026-10-21: timer 1500ms chạy cả idle/tab nền; cập nhật DOM dù không đổi; metadata Local State đọc sync mỗi 2s. Sửa scheduler adaptive một request đang chờ, hidden pause/backoff, DOM diff và không thay dropdown đang focus; cache metadata async. Test bằng Chrome tách biệt với số request/delay/focus và cache fake clock/read. Giữ JSON người dùng.

Hoàn thành: adaptive polling 10s idle/1500ms running/1s picker, hidden pause và visible resume, dedupe preflight/status, backoff 5→60s, DOM diff/focus giữ nguyên; cache profile async30s. Kiểm chứng: npm test pass; node --check JS thay đổi và script dashboard; bài test hiệu suất đo 6 thay vì 40 lần/phút idle, hidden0, một fetch profiles đang chờ, input/dropdown không bị reset, đọc metadata dedupe giữ snapshot khi lỗi. Không sử dụng Chrome profile đăng nhập, không sửa JSON người dùng.
