# Hướng dẫn chạy ba ứng dụng

## 1. Máy local

Copy `local-workflow-agent/`, cài Node.js 22+ và chạy trong thư mục đó:

```powershell
npm ci --omit=dev
if (!(Test-Path .env)) { Copy-Item .env.example .env }
npm run setup:video
npm start
```

Điền `.env` nếu cần API/MongoDB. Mở `http://127.0.0.1:34719`, sửa URL/thư mục mẫu `starter-video-download`, chọn profile để theo dõi và chạy. Chi tiết cài/kiểm tra yt-dlp, FFmpeg, FFprobe: [SETUP](local-workflow-agent/docs/SETUP.md).

## 2. Extension

Mở đúng Chrome profile → `chrome://extensions` → Developer mode → Load unpacked → chọn thư mục `chrome-reels-extension/`. Vào Options, chọn đúng thư mục profile và lưu kết nối. Reload extension/refresh tab sau khi cập nhật.

Đóng gói từ thư mục extension: `powershell -NoProfile -ExecutionPolicy Bypass -File package.ps1`. ZIP nằm trong `chrome-reels-extension/dist/`, chỉ chứa năm file runtime. Script không tự publish; tải ZIP lên quy trình phát hành Chrome Web Store của bạn. Không đưa khóa/token/runtime local vào extension.

## 3. Control server

Copy `control-server/` sang server Node.js 24. Tạo `.env` từ `.env.example`, điền URL/cổng/bind, chạy `node index.js`. Với VPS Traefik/Docker dùng [deploy](control-server/deploy/README.md). Không chạy công cụ video hoặc Chrome trên VPS.

## 4. Ghép máy local với server

Mở `/remote` trên dashboard local, nhập URL server, tạo mã ghép. Đăng nhập web control server để nhận máy, quay lại local xác nhận tài khoản và cấp allowlist profile/scenario/biến. Khi máy kết nối, chạy/dừng scenario từ server. Agent chủ động lấy lệnh outbound, engine local thực thi và báo kết quả.

Thử loopback trước và cấu hình HTTPS khi lên VPS: [REMOTE_CONTROL_LOCAL](docs/REMOTE_CONTROL_LOCAL.md), [REMOTE_CONTROL](docs/REMOTE_CONTROL.md). Các lệnh launcher ở gốc trong tài liệu cũ còn được hỗ trợ; source/deploy chuẩn nằm trong ba app.

## 5. Chuyển installation cũ

Không move dữ liệu khi agent còn chạy. Dừng agent rồi chạy `npm run migrate:legacy` trong local app để chuyển `.env`, scenarios, tools và data/agent cũ vào app. Nếu đích đã tồn tại, script dừng để bạn đối chiếu thay vì ghi đè. Cổng mặc định/configured còn mở cũng chặn migration.
