# Refactor cấu trúc source

Yêu cầu: tách extension có thể đóng gói, mã agent local và server/tích hợp/lưu trữ.

- Giữ `node local-agent.js`, cổng 34719, `chrome-reels-extension/`, `scenarios/` và selector CSS cũ.
- Gom runtime, dashboard và công cụ local vào `local-workflow-agent/`; phân lớp workflow, HTTP, storage và integrations.
- Tách server VPS thành `control-server/`, giao thức chung vào `shared/`.
- Thêm cài dependency riêng cho máy chạy agent và ZIP extension theo danh sách file cho phép.
- Kiểm chứng bằng fixture tách biệt, `npm test`, `node --check`, kiểm tra package/deploy và Git diff.
- Không sửa/commit các kịch bản đang có thay đổi của người dùng.

Trạng thái: hoàn thành (2026-11-10).

Bằng chứng: `npm test` đầy đủ; test layout agent/server tách biệt; cài runtime
production trong thư mục sạch; `node --check` 60 JavaScript, PowerShell AST và
`git diff --check` đạt. ZIP 4.2.0 được tạo và kiểm tra nội dung. Docker Engine
không chạy nên chưa build image; không publish extension hoặc deploy VPS.
