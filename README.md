# Local Workflow Automation

Ba ứng dụng có thể triển khai độc lập:

| Thư mục | Công dụng | Hướng dẫn |
| --- | --- | --- |
| `local-workflow-agent/` | Chạy trên Windows local: scenario engine, dashboard, API, media/storage và nhận lệnh server qua outbound HTTP | [Local README](local-workflow-agent/README.md) |
| `chrome-reels-extension/` | Thực hiện click/type/upload trong Chrome profile, gói MV3 riêng | [Extension README](chrome-reels-extension/README.md) |
| `control-server/` | Server điều khiển: web, auth/pairing, queue, SQLite và Docker/Traefik | [Server README](control-server/README.md) |

## Máy local mới

Chỉ copy `local-workflow-agent/` sang máy, rồi chạy tại thư mục đó:

```powershell
npm ci --omit=dev
if (!(Test-Path .env)) { Copy-Item .env.example .env }
npm run setup:video
npm start
```

Dashboard: `http://127.0.0.1:34719`. Cài extension riêng vào từng Chrome profile nếu cần thao tác website. Tải video thuần local không cần extension; mặc định audio tiếng Việt và Full HD 1080p, fallback nguồn khi không có.

## Server

Chỉ cần thư mục `control-server/`, Node.js 24, `.env` cấu hình riêng và `node index.js`. Hoặc build/deploy theo [Docker/Traefik](control-server/deploy/README.md). Server dùng HTTP polling; máy local kết nối outbound, không public cổng 34719.

## Installation hiện có

`node local-agent.js`, `node remote-control.js`, npm scripts ở gốc và cổng dashboard giữ tương thích. Config/scenarios/tools/data cũ ở gốc vẫn được nhận diện. Để chuyển cả dữ liệu local vào app, dừng agent rồi chạy `npm run migrate:legacy` trong `local-workflow-agent/`; script không ghi đè dữ liệu đích. Không copy credential/machine ID giữa các máy.

Bridge Socket.IO `local-agent/`/`local-agent-corebase/` đã không còn trong workspace; bản này tập trung remote HTTP của control server trong repo. Khi tích hợp lại Corebase, dùng adapter tùy chọn gọi automation API, giữ engine local duy nhất.

## Phát triển

Tại gốc repo: `npm ci`, `npm test`, `npm run test:extension`. Playwright chỉ dùng để test trên Chrome riêng. `npm run package:extension` đóng ZIP về `dist/`; extension cũng có script đóng gói riêng. Hai bản protocol trong hai app phải đồng nhất; test layout kiểm tra điều này.

Tài liệu: [lệnh vận hành và cấu trúc source](docs/README.md), [setup chi tiết](local-workflow-agent/docs/SETUP.md), [API](local-workflow-agent/docs/AUTOMATION_API.md).
