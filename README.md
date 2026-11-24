# Local Workflow Automation

Dự án chạy kịch bản theo từng Chrome profile trên Windows. Máy local thực thi các bước và lưu file video. Control Server trên VPS nhận metadata, quản lý hàng đợi và trả lệnh khi local kết nối ra ngoài qua HTTPS. Dashboard local dùng cổng loopback 34719.

| Bạn muốn làm gì? | Mở tài liệu |
| --- | --- |
| Cài agent, nạp extension và chạy kịch bản đầu tiên | [Hướng dẫn local](guides-local.md) |
| Chuẩn bị VPS, cấu hình HTTPS, chạy server và tạo tài khoản | [Hướng dẫn server](guides-server.md) |
| Tạo SSH key, khai báo GitHub Actions và phát hành | [Hướng dẫn deploy](guides-deploy.md) |
| Tra cứu profile, scanner, CLI/API và dữ liệu local | [Local Workflow Agent](local-workflow-agent/README.md) |
| Tra cứu lịch sử lệnh, quyền thiết bị và kho video | [Control Server](control-server/README.md) |

**Phát triển.** Tại gốc repo, chạy `npm ci` rồi `npm test`. Kiểm tra extension bằng `npm run test:extension` và đóng ZIP bằng `npm run package:extension`. Dùng profile trình duyệt riêng cho kiểm thử. Các launcher gốc là `node local-agent.js` và `node remote-control.js`.
