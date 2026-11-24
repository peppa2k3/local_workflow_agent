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

Chỉ `control-server/` chạy trên VPS: GitHub Actions chuyển source vào `/opt/agent-local`, build container ngay trên VPS và giữ `.env` ở cùng thư mục. Container bind loopback `127.0.0.1:34800`; Nginx trên VPS proxy HTTPS vào cổng này. Luồng source deploy không cần Docker network Traefik. Xem [hướng dẫn](control-server/deploy/GITHUB_ACTIONS.md). `local-workflow-agent/` và `chrome-reels-extension/` chỉ cài/chạy trên máy local; không deploy chúng lên VPS.
```
source_dir="$(readlink -f /opt/agent-local/current)"
release_tag="$(basename "$source_dir")"

read -r -s -p 'Mật khẩu mới (ít nhất 12 ký tự): ' CONTROL_PASSWORD
printf '\n'

APP_SOURCE_ROOT="$source_dir" RELEASE_TAG="$release_tag" \
  docker compose --project-directory /opt/agent-local \
  --env-file /opt/agent-local/.env \
  -f "$source_dir/deploy/docker-compose.source.yml" \
  exec -T control node index.js user admin@gmail.com <<< "$CONTROL_PASSWORD"

unset CONTROL_PASSWORD
```
## 4. Ghép máy local với server

Mở `/remote` trên dashboard local, nhập URL server, tạo mã ghép. Đăng nhập web control server để nhận máy, quay lại local xác nhận tài khoản và cấp allowlist profile/scenario/biến. Khi máy kết nối, chạy/dừng scenario từ server. Agent chủ động lấy lệnh outbound, engine local thực thi và báo kết quả.

Lệnh thử remote local và triển khai VPS: [tài liệu tổng hợp](docs/README.md). Các launcher gốc vẫn tương thích; source/deploy nằm trong ba app.

## 5. Chuyển installation cũ

Không move dữ liệu khi agent còn chạy. Dừng agent rồi chạy `npm run migrate:legacy` trong local app để chuyển `.env`, scenarios, tools và data/agent cũ vào app. Nếu đích đã tồn tại, script dừng để bạn đối chiếu thay vì ghi đè. Cổng mặc định/configured còn mở cũng chặn migration.

## Scanner YouTube trên máy local

Xem [cấu hình từ khóa, quota, lịch quét, đồng bộ và tải clip](local-workflow-agent/docs/SCANNER.md).

## Theo dõi local và mở Kho video

Khởi chạy Control Server rồi agent local, ghép thiết bị và cấp quyền scenario trong trang Remote. Bật Scan YouTube ở dashboard local. Trên Control Server, chọn thiết bị để xem trạng thái quét, lượt chạy song song và khả năng nhận task. Mở **Kho video** để lọc clip đã đồng bộ, chọn máy/kịch bản đích và sao chép JSON biến. [Hướng dẫn cấu hình, kiểm tra và xử lý lỗi](control-server/README.md#kho-video).

## Tự giao video cho kịch bản

1. Trên dashboard local, mở kịch bản tải và đăng video. Trong **Topic tự nhận**, nhập mã nhóm đã khai báo cho scanner, ví dụ `gia-dinh` nếu nhóm từ khóa là `[gia-dinh]`. Chọn profile nếu cần, đặt ưu tiên rồi lưu kịch bản.
2. Khai báo đủ năm biến trong kịch bản. Điền thư mục tải tuyệt đối vào `thu_muc_tai` và URL trang đăng vào `reels_url`. Trong **Remote Control**, cấp quyền cho profile, kịch bản và cả năm biến. [Cấu hình biến và bước tải](local-workflow-agent/docs/SCENARIOS.md#topic-tự-nhận-video).
3. Trên Control Server, mở **Kho video**, bật **Tự tạo và giao job từ kho video**, nhập số giờ chờ khi hết slot rồi bấm **Lưu cài đặt**. Bấm **Làm mới** để xem ID job, trạng thái hoặc giờ xét lại của clip.
4. Theo dõi một clip có topic phù hợp. Khi local báo kịch bản thành công, clip chuyển sang **Đã dùng**. Để tạm ngừng giao mới, bỏ chọn công tắc rồi lưu. [Quy tắc chọn máy và xử lý job mất kết nối](control-server/README.md#tự-giao-job).
