# Công cụ phát triển

[Hướng dẫn vận hành dự án](../README.md)

## CodeGraph

CLI toàn máy **1.6.2**, MCP project trong `.codex/config.toml`, telemetry tắt. Mở lại phiên Codex trong workspace tin cậy để nạp tool `codegraph_explore`. `codegraph.json` loại ref, config riêng, runtime/tools và artifact; SQLite `.codegraph/` không commit. Chạy các lệnh tại gốc repo.

| Lệnh | Ý nghĩa |
| --- | --- |
| `npm install -g @colbymchenry/codegraph@1.6.2` | Cài đúng phiên bản đã kiểm tra. |
| `codegraph telemetry off` | Tắt thống kê sử dụng. |
| `codegraph init . --yes` | Tạo chỉ mục lần đầu; không cần chạy lại sau mỗi sửa file. |
| `codegraph status --json` | Thống kê và trạng thái đồng bộ. |
| `codegraph query createCachedDownloader --json` | Tìm symbol. |
| `codegraph explore createCachedDownloader --max-files 2` | Lấy source cùng ngữ cảnh/quan hệ. |
| `codegraph callers downloadVideo --file local-workflow-agent/src/integrations/video/video-download.js --json` | Tìm nơi gọi một định nghĩa cụ thể. |
| `codegraph sync` | Đồng bộ thủ công khi MCP/watcher không chạy. |
| `codex mcp get codegraph --json` | Xác nhận Codex đã đọc MCP project. |

Đo trên repo này ngày 2026-11-11:

| Kiểm tra | Kết quả |
| --- | --- |
| Index đầu | 69 file, 577 node, 1.981 edge; engine 1,3 giây, cả lệnh khoảng 4,8 giây; DB khoảng 4,1 MiB. |
| Phủ source | 67/67 JS, 2/2 YAML; 0/5 HTML, 0/12 PowerShell. |
| Tìm hàm mẫu | 6/6 JS đúng file; `render` trong dashboard HTML không tìm được. |
| CLI, 5 lần đo | Trung vị query symbol 574 ms, `rg` text 36 ms; có chi phí khởi động, đầu ra khác nhau. |
| MCP | Handshake và explore pass; một lượt nóng 52 ms. Source trả về khoảng 13.930 ký tự, chưa đo mức tiết kiệm token. |
| Auto-sync | Thêm file thử → thấy source sau 3,5 giây; xóa file → chỉ mục về 69 file, không pending. |
| Giới hạn call graph | Chưa nhận ra caller được inject trong `download-cache.js` khi hỏi `downloadVideo`; cần kiểm tra source. |

Đánh giá: hữu ích cho tra cấu trúc/refactor backend JS. Dùng thêm `rg` cho text, UI inline, PowerShell và kiểm chứng call graph. Không có bằng chứng để khẳng định giảm token cho toàn bộ workflow. Báo cáo máy: `.codegraph/evaluation.json` (local, không commit).

Nguồn cấu hình: [CodeGraph](https://github.com/colbymchenry/codegraph), [Codex MCP — OpenAI Docs](https://developers.openai.com/codex/mcp).
