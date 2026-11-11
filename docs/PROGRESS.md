# Trạng thái hiện tại

| Mục | Trạng thái |
| --- | --- |
| Ba app triển khai độc lập | Hoàn tất; launcher/path legacy giữ tương thích. |
| Remote | HTTP polling local ↔ control server. |
| Migration | Có port guard và kiểm tra xung đột; chạy sau khi dừng agent. |
| Kiểm chứng refactor gần nhất | npm test, standalone app, migration, cú pháp JS/PowerShell và Compose config pass. |
| Docker image | Chưa build trong đợt refactor: Docker daemon không chạy. |
| Tài liệu | Gộp kiến trúc/module/remote vào [README](README.md); bỏ bản trùng và lịch sử dài. |

Lệnh vận hành: [README](README.md). Hợp đồng bảo trì: [PROJECT_CONTEXT](PROJECT_CONTEXT.md). Công việc chi tiết: `prompts/processing/`, `prompts/completed/` tại gốc repo.
