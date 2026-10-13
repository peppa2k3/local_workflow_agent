# Tiến độ phát triển

Cập nhật: 2026-10-13 (Asia/Bangkok).

## Completed

- Local Agent chạy trong Node.js, điều phối các bước kịch bản JSON và cung cấp dashboard HTTP local.
- Extension thao tác trên Chrome profile đang dùng: cuộn, click, nhập chữ, chọn phần tử trực tiếp, locator semantic/CSS/XPath.
- Hỗ trợ dialog/lớp phủ: chờ phần tử nhận click, ưu tiên dialog đang hiển thị.
- Hỗ trợ upload: đường dẫn cố định hoặc truyền khi chạy, click nút mở file chooser, chọn file qua Chrome Debugger.
- Giao diện tạo/sửa/sắp xếp/lưu/chạy/dừng kịch bản; tài liệu thiết lập và bài kiểm tra dialog/upload mẫu.
- Refactor agent vào `src/agent/`, giữ `local-agent.js` làm điểm vào; tách thử nghiệm Playwright cũ vào `legacy/`.
- Loại dữ liệu Chrome profile, dependency cài sẵn và khóa đóng gói khỏi phần Git theo dõi.

## Processing

- Chưa có mục đang triển khai tại thời điểm commit này. Lỗi thực tế mới sẽ được ghi trong `prompts/processing/` trước khi sửa.

## Planed

- Kiểm thử end-to-end trên website mục tiêu với các locator và phản hồi upload thực tế.
- Hỗ trợ tab mới, iframe và Shadow DOM khi có kịch bản cần chúng.
- Thêm dấu hiệu hoàn tất upload theo từng website, thay cho chờ thời gian cố định.
- Cân nhắc cấu hình cổng agent và extension đồng bộ nếu cần chạy nhiều phiên.
