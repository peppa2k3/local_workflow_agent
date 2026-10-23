# 06 — Docker Hub và Traefik

Yêu cầu: hoàn thiện bộ build/push image lên Docker Hub; VPS chỉ pull image và
chạy docker-compose.yml qua Traefik đang có. Cung cấp .env mẫu, lệnh bootstrap
tài khoản, cập nhật/rollback/backup và kiểm tra lỗi thường gặp bằng tiếng Việt.

Triển khai: network Docker external, TLS do Traefik, không publish port agent;
volume SQLite bền vững; trust proxy giới hạn đúng IP Traefik và kiểm chứng chống
giả X-Forwarded-For. Healthcheck dùng đúng Host của CONTROL_PUBLIC_URL.

Kiểm chứng: compose config, test proxy/healthcheck và các kiểm tra repo; build
image local nếu Docker Engine sẵn sàng. Chưa có Docker Hub namespace/domain/network
thật nên dùng biến cấu hình, không tự đẩy image vào tài khoản suy đoán.

Hoàn tất 2026-10-23: bộ deploy/control/docker-compose.yml + .env.example và hướng
dẫn tiếng Việt; script build/push, image chỉ đóng gói control. npm test, node
--check, PowerShell AST và compose config đạt. Build local
localbuild/local-agent-control:traefik-dev (linux/amd64) thành công. Container
fixture xác nhận healthcheck đúng Host, UID 1000, account SQLite qua restart và
không có dữ liệu local trong image. Container/volume fixture đã dọn; không push
Docker Hub hoặc thao tác VPS thật. Proxy trust chỉ chấp nhận exact IP.
