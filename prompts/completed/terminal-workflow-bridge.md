# Kết nối terminal agent với workflow engine

Yêu cầu: `local-agent/` đã ghép VPS qua Socket.IO/terminal, cần điều khiển
scenario của `node local-agent.js` trên cùng máy.

Giải pháp: client HTTP loopback có token, CLI dùng ngay qua terminal hiện có,
handler Socket.IO theo lease cho VPS tích hợp; không tạo engine hoặc action mới.
Token đọc tại local, không gửi lên VPS. Giữ dữ liệu ghép nối và backup ngoài Git.

Kiểm chứng: cấu hình, lease, HTTP auth/validation, chạy/theo dõi/dừng và retry
trên scenario wait fixture; test toàn bộ repo và terminal agent, node --check.
Source VPS ở `D:/CODE_DND/remote-control-agent/remote-control-agent-core-base`.
Đã cập nhật backend relay, frontend panel, runner canonical và bản copy đang dùng.

Trạng thái: hoàn thành source (2026-11-10). Tests cả hai repo/runner và build
VPS đạt; UI fixture desktop/mobile chạy toàn luồng. Chưa deploy/restart process
người dùng. Cần đặt WORKFLOW_AGENT_ENV_FILE cho runner ngoài repo workflow.
