# Local Workflow Agent

Phần chạy trên máy Windows có Chrome. Thư mục này chứa runtime, dashboard và công cụ tải video/MongoDB; không cần cài Playwright hoặc chạy server VPS để sử dụng agent.

Pull **toàn bộ repository**, rồi chạy từ thư mục gốc:

```powershell
npm ci --prefix local-workflow-agent --omit=dev
# Chỉ tạo .env khi chưa có; sau đó điền cấu hình riêng của máy nếu cần.
if (!(Test-Path .env)) { Copy-Item .env.example .env }
node local-agent.js
```

Hoặc `cd local-workflow-agent` rồi `npm ci --omit=dev` và `npm start`. Chế độ nền: `npm run start:daemon`. CLI: `node index.js --help`. Dashboard: http://127.0.0.1:34719.

Để tải video, chạy `npm run setup:video` tại đây. Để kiểm tra Atlas đã cấu hình, chạy `npm run check:mongo`.

## Mã nguồn

| Đường dẫn | Trách nhiệm |
| --- | --- |
| `index.js` | Nạp môi trường, chọn CLI/server/daemon. |
| `src/main.js` | Ghép các service, HTTP server, session dashboard và vòng đời process. |
| `src/config.js`, `src/env.js`, `src/paths.js` | Cấu hình và đường dẫn thống nhất, không phụ thuộc thư mục terminal. |
| `src/workflow/` | Điều phối, biến, validate kịch bản, xác nhận media trùng. |
| `src/http/` | Automation API và API quản lý nội dung. |
| `src/storage/` | Lịch sử/catalog/outbox, cache download và chuẩn hóa tên. |
| `src/integrations/chrome/` | Metadata profile và hộp chọn file Windows. |
| `src/integrations/video/` | yt-dlp, FFmpeg, FFprobe. |
| `src/integrations/mongo/` | Đồng bộ Atlas và DNS riêng cho process. |
| `src/integrations/remote/` | Ghép máy, poll VPS, thực thi lệnh được cấp quyền. |
| `dashboard/` | Giao diện local cho kịch bản, kho nội dung, remote. |
| `scripts/` | Cài công cụ video và kiểm tra kết nối MongoDB. |

`../shared/remote-protocol.js` là giao thức dùng chung với server VPS, nên cần giữ thư mục `shared/` khi triển khai. File `.env`, `scenarios/`, `tools/` và `data/agent/` vẫn ở gốc repository, kể cả khi chạy từ thư mục này. Không sao chép `data/agent/` giữa các máy: mỗi máy cần machine ID riêng. Các đường dẫn upload/download trong kịch bản phải có thật trên máy chạy.

Cài extension từ `../chrome-reels-extension/` trong từng Chrome profile muốn điều khiển; xem [hướng dẫn cài đặt](../docs/SETUP.md). Lưu trữ local và MongoDB được mô tả tại [ACTIVITY_STORAGE](../docs/ACTIVITY_STORAGE.md) và [MONGODB_ATLAS](../docs/MONGODB_ATLAS.md).
