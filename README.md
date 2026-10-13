# Local Chrome Workflow Agent

Công cụ tạo và chạy kịch bản tự động trên Chrome profile đang dùng. Agent Node.js nhận lệnh trên máy; Chrome Extension thực hiện click, nhập chữ, cuộn và chọn file trong tab. Dashboard local giúp chỉnh sửa kịch bản JSON bằng giao diện.

**Bắt đầu:** [Hướng dẫn cài đặt và chạy từng bước](docs/SETUP.md).

## Cấu trúc

| Đường dẫn | Vai trò |
| --- | --- |
| `local-agent.js` | Điểm chạy ổn định (`npm start` hoặc `node local-agent.js`). |
| `src/agent/` | Cấu hình, quản lý kịch bản và agent HTTP/CLI. |
| `chrome-reels-extension/` | Extension cài bằng **Load unpacked** vào Chrome profile hiện có. |
| `dashboard/index.html` | Giao diện tại `http://127.0.0.1:34719`. |
| `scenarios/` | Các kịch bản JSON do dashboard lưu. |
| `tests/` | Kiểm tra luồng dialog và upload. |
| `docs/` | Hướng dẫn, context và tiến độ. |
| `prompts/completed`, `prompts/processing`, `prompts/planed` | Yêu cầu đã làm, đang làm và dự kiến. |
| `legacy/facebook-feed.js` | Thử nghiệm Playwright ban đầu; quy trình hiện tại dùng Local Agent + Extension. |

Xem [cú pháp kịch bản](docs/SCENARIOS.md), [context dự án](docs/PROJECT_CONTEXT.md) và [tiến độ](docs/PROGRESS.md).
