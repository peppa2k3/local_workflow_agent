# Local Workflow Agent

Ứng dụng Windows chạy scenario, dashboard/API loopback, tải video, lưu lịch sử và kết nối outbound tới control server. Chỉ cần copy **thư mục này** sang máy local; không cần source server, shared bên ngoài hoặc Playwright.

```powershell
cd local-workflow-agent
npm ci --omit=dev
if (!(Test-Path .env)) { Copy-Item .env.example .env }
npm run setup:video
npm start
```

Dashboard: `http://127.0.0.1:34719`. Sửa URL/thư mục scenario mẫu trước khi chạy. Cài extension riêng vào từng Chrome profile nếu có bước website; tải thuần local không cần extension.

| Thư mục | Công dụng |
| --- | --- |
| `src/workflow/` | Validate, biến, điều phối theo profile, media guard. |
| `src/http/` | API automation và quản lý nội dung. |
| `src/storage/` | Lịch sử, catalog, cache, outbox. |
| `src/integrations/` | Chrome, video, MongoDB và remote HTTP. |
| `dashboard/` | UI scenario, content và cấp quyền remote. |
| `shared/` | Protocol HTTP đi kèm app, không import app khác. |
| `scenarios/` | JSON, có mẫu tải video và mở trang. |
| `scripts/` | Setup/check/startup/migrate layout cũ. |
| `docs/` | Setup, API, scenario, storage. |
| `.env`, `tools/`, `data/` | Cấu hình máy, executable, runtime; không commit. |

Remote: mở `/remote`, kết nối URL control server, ghép cặp và cấp allowlist profile/scenario/biến. Agent chủ động polling outbound; không public cổng 34719. Đây là HTTP của repo, không phải Socket.IO Corebase.

CLI: `node index.js --help`. Chạy nền: `npm run start:daemon`. Kiểm tra Atlas: `npm run check:mongo`. Scheduled Task tùy chọn: `npm run install:startup`; không tự cài khi setup app.

## Dữ liệu installation cũ

Launcher `node local-agent.js` ở gốc vẫn hoạt động. Checkout cũ tiếp tục đọc `.env`, `scenarios/`, `tools/`, `data/agent/` ở gốc nếu có, để giữ machine ID/lịch sử. `.env` trong app được ưu tiên. Environment/override đường dẫn vẫn có hiệu lực.

Muốn gom dữ liệu cũ vào app: dừng agent rồi chạy `npm run migrate:legacy`. Script kiểm tra xung đột trước khi move và từ chối khi cổng agent còn hoạt động. Không copy machine ID/credential sang máy mới.

Hướng dẫn: [SETUP](docs/SETUP.md), [SCENARIOS](docs/SCENARIOS.md), [API](docs/AUTOMATION_API.md), [STORAGE](docs/ACTIVITY_STORAGE.md), [MONGODB](docs/MONGODB_ATLAS.md).
