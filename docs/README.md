# Lệnh vận hành

PowerShell trên Windows. Local cần Node.js 22+, server cần Node.js 24. Thực hiện lệnh tại thư mục ghi trong bảng; thay giá trị `NAME`, `RUN_ID`, `user/image:tag` bằng giá trị thực tế.

## Thành phần

```text
local-workflow-agent/     Engine, dashboard/API, scenario, storage, remote client
chrome-reels-extension/  Chrome MV3: click/type/upload, cấu hình profile, đóng ZIP
control-server/          Web điều khiển, auth/pairing, queue, SQLite, deploy
tests/                   Kiểm thử tích hợp tại gốc repository
```

Luồng: `control-server ← HTTP polling từ local agent → Chrome extension`. Engine local thực thi scenario; không public cổng `34719`.

| Source | Công dụng |
| --- | --- |
| Local `src/workflow/` | Validate, biến, thứ tự bước, timeout/Stop, media guard. |
| Local `src/http/`, `dashboard/` | Automation/content API và giao diện. |
| Local `src/storage/` | Catalog, history, download cache, outbox. |
| Local `src/integrations/` | Chrome, video, MongoDB, remote HTTP. |
| Extension `background.js`, `content.js` | Tab/Debugger và thao tác DOM. |
| Server `src/`, `web/`, `deploy/` | HTTP/auth/queue/SQLite, UI và triển khai. |
| Mỗi app `shared/remote-protocol.js` | Hai bản protocol HTTP cần giữ đồng nhất. |

## Máy local

| Thư mục chạy | Lệnh | Ý nghĩa |
| --- | --- | --- |
| `local-workflow-agent/` | `npm ci --omit=dev` | Cài dependency runtime. |
| `local-workflow-agent/` | `if (!(Test-Path .env)) { Copy-Item .env.example .env }` | Tạo config, giữ file đang có. |
| `local-workflow-agent/` | `npm run setup:video` | Cài/cập nhật yt-dlp, FFmpeg, FFprobe. |
| `local-workflow-agent/` | `& .\tools\yt-dlp.exe --version` | Kiểm tra yt-dlp. |
| `local-workflow-agent/` | `& .\tools\ffmpeg.exe -version` | Kiểm tra FFmpeg. |
| `local-workflow-agent/` | `& .\tools\ffprobe.exe -version` | Kiểm tra FFprobe. |
| `local-workflow-agent/` | `npm start` | Chạy agent tương tác. |
| `local-workflow-agent/` | `npm run start:daemon` | Chạy agent không phụ thuộc stdin. |
| `local-workflow-agent/` | `npm run check:mongo` | Kiểm tra MongoDB theo `.env`. |
| `local-workflow-agent/` | `npm run migrate:legacy` | Sau khi dừng agent: move config/scenarios/tools/data cũ vào app; từ chối xung đột. |
| `local-workflow-agent/` | `npm run install:startup` | Đăng ký Scheduled Task khi đăng nhập Windows. |
| Bất kỳ PowerShell | `Start-ScheduledTask -TaskName LocalAgentRemote` | Khởi động task đã đăng ký; đóng agent cũ trước. |
| `local-workflow-agent/` | `powershell -NoProfile -File scripts/install-remote-startup.ps1 -Remove` | Gỡ Scheduled Task. |

Dashboard: `http://127.0.0.1:34719`; `/content` quản lý nội dung; `/remote` ghép máy và cấp quyền. Máy mới dùng scenario `starter-video-download`, sửa URL/thư mục trước khi chạy. Video mặc định audio `vi`, chất lượng `1080`; thiếu audio thì dùng nguồn.

## CLI workflow

Chạy tại `local-workflow-agent/`, trong terminal khác với agent. Đặt cùng `LOCAL_AGENT_API_TOKEN` (32–256 ký tự không khoảng trắng) trong môi trường engine và client; restart engine sau khi đổi token.

| Lệnh | Ý nghĩa |
| --- | --- |
| `node index.js --help` | Danh sách lệnh/tham số. |
| `node index.js profiles` | Liệt kê profile và trạng thái kết nối. |
| `node index.js scenarios` | Liệt kê scenario đã lưu. |
| `node index.js describe --scenario NAME` | Xem biến và số bước. |
| `node index.js run --scenario NAME --profile "Profile 1" --wait` | Chạy và chờ kết quả. |
| `node index.js run --scenario NAME --profile "Profile 1" --var "caption=Nội dung" --wait` | Ghi đè biến cho lượt này. |
| `node index.js status --run-id RUN_ID` | Xem trạng thái lượt chạy. |
| `node index.js stop --run-id RUN_ID` | Dừng đúng lượt theo ID. |

## Extension

| Thao tác/lệnh | Ý nghĩa |
| --- | --- |
| Chrome → `chrome://extensions` → Developer mode → Load unpacked | Chọn thư mục `chrome-reels-extension/`. |
| Extension options → chọn profile → Lưu kết nối | Ánh xạ đúng thư mục `Default`/`Profile N`; kiểm tra tại `chrome://version`. |
| Reload extension, refresh tab | Nạp source extension mới. |
| Trong `chrome-reels-extension/`: `powershell -NoProfile -ExecutionPolicy Bypass -File package.ps1` | Tạo ZIP trong `dist/` của extension, không tự publish. |

## Remote: thử trên cùng máy

1. Tại `control-server/`, tạo `.env` từ `.env.example`, đặt:

   ```dotenv
   CONTROL_PUBLIC_URL=http://127.0.0.1:34800
   CONTROL_BIND=127.0.0.1
   CONTROL_PORT=34800
   CONTROL_ALLOW_HTTP_LOOPBACK=1
   CONTROL_TRUST_PROXY=0
   ```

2. Trong `.env` local app, thêm `LOCAL_AGENT_REMOTE_ALLOW_HTTP_LOOPBACK=1`, restart agent.

| Thư mục chạy | Lệnh/thao tác | Ý nghĩa |
| --- | --- | --- |
| `control-server/` | `if (!(Test-Path .env)) { Copy-Item .env.example .env }` | Tạo config server trước khi chỉnh các biến trên. |
| `control-server/` | `Get-Content -Raw .\password.txt \| node index.js user admin@example.com` | Tạo tài khoản; file mật khẩu 12–256 ký tự, truyền stdin. |
| `control-server/` | `node index.js` | Chạy server tại `http://127.0.0.1:34800`. |
| Trình duyệt local | `/remote` → URL server → tạo mã ghép | Bắt đầu ghép thiết bị. |
| Web control server | Đăng nhập → nhận mã ghép | Gắn thiết bị vào tài khoản. |
| Dashboard local `/remote` | Xác nhận tài khoản, cấp profile/scenario/biến | Cho phép server chạy/dừng workflow. |

Giữ file mật khẩu ngoài Git, xóa sau khi tạo user. Khi lên VPS dùng HTTPS; tắt hai biến cho phép HTTP loopback. SQLite lưu user/device/command, không lưu video.

## Server: Docker/Traefik

| Thư mục chạy | Lệnh | Ý nghĩa |
| --- | --- | --- |
| `control-server/` | `docker build -f deploy/Dockerfile -t user/image:tag .` | Build image chỉ từ source server. |
| `control-server/` | `powershell -NoProfile -File scripts/publish-image.ps1 -Repository user/image -Tag 1.0.0 -Push` | Build và push Docker Hub. |
| `control-server/deploy/` | `if (!(Test-Path .env)) { Copy-Item .env.example .env }` | Tạo biến Compose; điền image/domain/network/IP Traefik. |
| `control-server/deploy/` | `docker compose --env-file .env -f docker-compose.yml config --quiet` | Kiểm tra config. |
| `control-server/deploy/` | `docker compose --env-file .env -f docker-compose.yml pull` | Tải image cấu hình. |
| `control-server/deploy/` | `docker compose --env-file .env -f docker-compose.yml up -d --no-build` | Chạy/cập nhật dịch vụ, giữ volume SQLite. |
| `control-server/deploy/` | `docker compose --env-file .env -f docker-compose.yml logs --tail 100 control` | Xem log. |

`.env` trong app là config process; `.env` trong `deploy/` là config Compose. Hướng dẫn bootstrap user trong container và biến Traefik: [deploy README](../control-server/deploy/README.md).

## Kiểm thử và tài liệu chuyên biệt

| Thư mục chạy | Lệnh | Ý nghĩa |
| --- | --- | --- |
| Gốc repo | `npm ci` | Cài dependency phát triển/test. |
| Gốc repo | `npm test` | Kiểm tra layout, migration, workflow, API, remote, storage và Chrome fixture. |
| Gốc repo | `npm run test:extension` | Kiểm tra extension bằng Chromium riêng. |
| Gốc repo | `npm run package:extension` | Wrapper đóng ZIP extension vào `dist/` ở gốc. |
| Gốc repo | `node local-agent.js` / `node remote-control.js` | Launcher tương thích của local/server. |

Chi tiết duy nhất theo chủ đề: [setup/video](../local-workflow-agent/docs/SETUP.md), [scenario](../local-workflow-agent/docs/SCENARIOS.md), [API](../local-workflow-agent/docs/AUTOMATION_API.md), [CLI](../local-workflow-agent/docs/CLI.md), [storage](../local-workflow-agent/docs/ACTIVITY_STORAGE.md), [MongoDB](../local-workflow-agent/docs/MONGODB_ATLAS.md).
