# 05 — Always-on operation and deployment

Daemon không thoát vì stdin EOF, graceful shutdown, reconnect backoff, Windows
Scheduled Task đăng nhập interactive, VPS Node 24/container + reverse proxy TLS,
volume SQLite, cấu hình mẫu, bootstrap tài khoản và hướng dẫn backup/revoke.
Cập nhật context/progress/scenario docs. npm test, node --check JavaScript thay đổi.
Không deploy VPS, không cài task hay tự chạy Facebook. Nêu rõ các bước vận hành còn
cần thực hiện ở môi trường thật. Phụ thuộc 04; commit hoàn tất.

Hoàn tất: daemon EOF fixture, graceful shutdown handlers, reconnect/lease/expiry/recovery, Windows startup scripts, Node24 compose/nginx/systemd, env mẫu và hướng dẫn. npm test đạt đầy đủ; thay đổi expiry/UI cuối được kiểm lại npm run test:remote. node --check JavaScript và PowerShell AST parse đạt. Không deploy VPS, không ghép thiết bị thật, không cài task Windows, không chạy Facebook.
