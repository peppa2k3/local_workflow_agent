# 010-upload-choose file

Dashboard local và control-server hỗ trợ chọn clip đã lưu cho bước Upload, bước Tải video, hoặc biến được tham chiếu trực tiếp ở ô nguồn video hay đường dẫn file.

- Thư mục lấy từ kịch bản và có thể dùng biến. Bước Upload có thể dùng thư mục của bước Tải video gần nhất phía trước.
- Khi chọn clip làm nguồn cho bước Tải video, agent xác minh bằng FFprobe và điền các biến `download_*` để các bước sau dùng chính clip đó.
- Trang Remote trên máy agent có quyền cho phép xem tên và chọn clip theo từng kịch bản. Control-server áp dụng lựa chọn cho lượt chạy trên thiết bị đã ghép.

Xem [cách dùng và ví dụ JSON](../../local-workflow-agent/docs/SCENARIOS.md#chọn-clip-từ-thư-mục-lưu-trữ).
