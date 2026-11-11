# Bản đồ source sau refactor

Cây triển khai: [ARCHITECTURE](ARCHITECTURE.md).

| Thành phần | Công dụng | Điểm vào |
| --- | --- | --- |
| `local-workflow-agent/` | Runtime máy local: engine, dashboard, API, media, storage, remote client | `npm start` / `node index.js` trong app |
| `chrome-reels-extension/` | Executor Chrome/profile, đóng gói MV3 | Load unpacked / `package.ps1` |
| `control-server/` | Auth/pairing, web, queue, SQLite, deploy VPS | `node index.js` trong app |

## Local app

| Module | Trách nhiệm |
| --- | --- |
| `index.js` | Env, chọn server/daemon/CLI. |
| `src/main.js` | Composition root: services, HTTP routing, dashboard session, terminal, lifecycle. |
| `src/cli.js` | Client gọi automation API. |
| `src/env.js`, `config.js`, `paths.js` | Cấu hình và app/legacy path. |
| `workflow/scenario-store.js` | Đọc/lưu/validate/prepare scenario. |
| `workflow/variables.js` | Biến thường và runtime references. |
| `workflow/workflows.js` | State theo profile, thứ tự, ack, timeout, Stop/history. |
| `workflow/media-guard.js` | Chống trùng, media lock, pause/xác nhận local. |
| `http/automation-api.js` | Bearer API `/api/v1/*` cho CLI/adapter. |
| `http/content-api.js` | Catalog/page và metadata. |
| `storage/activity-store.js` | Machine identity, catalog, history, outbox local. |
| `storage/download-cache.js` | Hash verification, khóa URL, reuse theo tùy chọn tải. |
| `integrations/chrome/` | Metadata profile, Windows picker. |
| `integrations/video/` | Executable yt-dlp/FFmpeg/FFprobe và gate verified. |
| `integrations/mongo/` | Catalog/sync metadata, DNS process. |
| `integrations/remote/` | Pairing, polling outbound, policy, journal, executor. |
| `dashboard/` | Editor, content manager, remote permission, popup sự cố/trùng. |

Các module workflow/http/storage/integrations ở bảng trên thuộc `src/`.

## Extension và server

Extension: `background.js` poll engine, quản lý tab/navigation và input/file bằng Debugger. `content.js` tìm locator và thao tác DOM/editor. `options.js` cấu hình profile identity. `package.ps1` chỉ đóng năm file runtime whitelist; không tự publish Chrome Web Store.

Server: `src/server.js` HTTP/auth/pairing; `commands.js` quyền/queue; `store.js` SQLite; `proxy.js` trusted proxy; `healthcheck.js` deployment. `web/` là UI, `deploy/` là cấu hình vận hành.

## Điểm tích hợp dự án lớn

Gửi lệnh qua adapter outbound hoặc automation API loopback, không import `main.js` vì file khởi động server/timer. API có profiles/scenarios và tạo/theo dõi/dừng runs. Giữ run/execution/command ID đúng vòng đời. Engine local thực thi duy nhất, không nhân đôi nghiệp vụ trong VPS/extension.

Remote hiện tại là HTTP polling. Bridge Socket.IO Corebase đã không còn trong workspace trước refactor; `control-server/` không phục vụ giao thức đó. Nếu cần lại Corebase, thêm adapter tùy chọn trong local app và gọi API engine.

Refactor tiếp theo có thể tách HTTP router/lifecycle khỏi `main.js`, JS/CSS inline dashboard, version schema/DTO và inject repository/executor. Lần này tách deployment thực tế, chưa biến workflow thành SDK thuần domain.

Không chuyển `.env`, data, profile, node_modules hoặc binary vào source dự án lớn. MongoDB chỉ lưu metadata, media ở đường dẫn local. Giữ CSS selector cũ, Stop/navigation/completion và gate file verified trước upload.
