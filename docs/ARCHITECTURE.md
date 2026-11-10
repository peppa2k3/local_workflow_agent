# Cấu trúc source và triển khai

```text
chrome-reels-extension/       Extension, gói ZIP riêng
local-workflow-agent/
  index.js                   Bootstrap local
  src/
    workflow/                Kịch bản, biến, điều phối
    http/                    Automation/content API
    storage/                 Catalog, lịch sử, cache, outbox
    integrations/
      chrome/                Profile metadata, file picker
      video/                 yt-dlp + FFmpeg
      mongo/                 Atlas + DNS
      remote/                Outbound VPS client
  dashboard/                 UI tại 127.0.0.1:34719
  scripts/                   Setup video, check MongoDB
control-server/              VPS HTTP/SQLite + web UI
shared/                      Giao thức agent ↔ VPS, Node builtins
scenarios/                   JSON người dùng, giữ đường dẫn cũ
data/                        Runtime local/control, Git ignore
tools/                       Binary local, Git ignore
deploy/                      Docker, Traefik, systemd, nginx
scripts/                     Đóng gói, publish image, startup, wrapper cũ
tests/                       Fixture và Chrome tách biệt
docs/, prompts/             Tài liệu và kế hoạch
```

## Ranh giới

`local-agent.js` chuyển tiếp tới `local-workflow-agent/index.js`; `remote-control.js` chuyển tiếp tới `control-server/index.js`. Hai điểm vào cũ tiếp tục hoạt động. Server VPS không import runtime local. Agent không đọc source hoặc asset của server VPS; dashboard có CSS riêng. Hai phía dùng `shared/remote-protocol.js`.

Agent ghép service tại `src/main.js`; các module workflow/storage/integrations giữ API và hành vi cũ. Giao thức extension, action, API dashboard, cổng 34719 và các locator/selector cũ không thay đổi. Không tự chuyển đổi hoặc ghi lại kịch bản.

## Cài trên máy khác

Clone/pull toàn bộ repository, cài Node.js và Chrome trên Windows, rồi chạy:

```powershell
npm ci --prefix local-workflow-agent --omit=dev
node local-agent.js
```

Các dependency runtime chỉ gồm MongoDB driver; Playwright là devDependency của package gốc để chạy test. Package local có lockfile riêng dùng cùng phiên bản runtime với lockfile gốc; khi nâng dependency cần cập nhật cả hai. Cài `.env` riêng nếu cần Atlas/API và cài extension cho profile của máy đó. Không cần server VPS cho workflow chạy local. Chi tiết tại [README agent](../local-workflow-agent/README.md).

## Source và dữ liệu

`src/paths.js` xác định gốc repository từ vị trí source, không dùng thư mục terminal. `.env`, `scenarios/`, `tools/` và `data/agent/` giữ vị trí trước refactor. `LOCAL_AGENT_ENV_FILE`, `LOCAL_AGENT_SCENARIOS_DIR`, `LOCAL_AGENT_DATA_DIR` và đường dẫn công cụ từ môi trường vẫn có hiệu lực. Mỗi máy tự tạo machine ID và lịch sử; media gốc vẫn ở đường dẫn được chọn, không được sao chép vào Git hoặc MongoDB.

MongoDB là tích hợp metadata dùng chung hiện có; tài liệu trong `prompts/processing/DATA_STRUCTURE_BLUEPRINT.md` là blueprint tham khảo, không phải triển khai kho object/S3. Xem [lưu trữ](ACTIVITY_STORAGE.md) và [Atlas](MONGODB_ATLAS.md).

## Build và kiểm tra

- Agent production: `npm ci --prefix local-workflow-agent --omit=dev`.
- Môi trường phát triển: `npm ci` ở gốc, rồi `npm test`.
- Extension: `npm run package:extension`; xem [README extension](../chrome-reels-extension/README.md).
- VPS: Dockerfile chỉ lấy `remote-control.js`, `control-server/`, `shared/`; xem [deploy](../deploy/control/README.md).

`tests/project-layout.js` dựng cây runtime tạm không có server VPS, chạy cả entry cũ và mới từ thư mục terminal khác, kiểm tra `.env`/data/scenarios mặc định, asset dashboard và ZIP trên Windows. Các test còn lại kiểm tra workflow, API, trình duyệt và tích hợp như trước.
