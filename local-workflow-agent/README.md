# Local Workflow Agent

Agent Windows chạy từng bước của scenario JSON theo profile, đợi kết quả của bước hiện tại trước khi chuyển tiếp. Các profile có thể chạy song song. Dashboard và API lắng nghe tại `127.0.0.1:34719`. [Cài đặt và chạy thử](../guides-local.md)

| Màn hình | Dùng để |
| --- | --- |
| [Dashboard](http://127.0.0.1:34719) | Tạo, sửa, nhân bản và chạy scenario, chọn phần tử trên trang, theo dõi bước đang chạy hoặc dừng theo profile. |
| [Content](http://127.0.0.1:34719/content) | Tra lịch sử tải/upload, quản lý page và publication, kiểm tra kết nối Atlas. |
| [Scan YouTube](http://127.0.0.1:34719/scanner) | Chọn điều kiện lọc trong `config.json`, nhóm từ khóa trong `keywords.txt`, bật quét và xem kết quả. Trang hiển thị thư mục cấu hình thực tế. Clip đạt được xếp hàng gửi tới server đã ghép. |
| [Remote](http://127.0.0.1:34719/remote) | Ghép thiết bị và cấp quyền theo profile, scenario và biến. Agent chủ động polling HTTPS. |

## Cấu trúc và dữ liệu

`index.js` khởi động app độc lập. `scenarios/` chứa kịch bản, `dashboard/` chứa UI, `src/` chứa engine, API, storage và tích hợp Chrome/video/remote. Công cụ video nằm trong `tools/`. Dữ liệu, nhật ký và danh tính máy nằm trong thư mục runtime. Extension MV3 ở `chrome-reels-extension/` tại gốc repo thực hiện các bước web trong profile đã kết nối.

Checkout cũ tiếp tục nhận launcher `node local-agent.js`, scenario, công cụ và dữ liệu ở gốc. Để gom installation cũ vào app, dừng agent rồi chạy `npm run migrate:legacy` trong thư mục này. Giữ identity và credential riêng cho từng máy.

## Tra cứu kỹ thuật

- Cú pháp bước, biến, locator, lịch chạy và tương thích CSS selector. [Scenario JSON](docs/SCENARIOS.md)
- Chạy từ terminal, truyền biến/file, theo dõi và hủy theo run ID. [CLI và HTTP API](docs/AUTOMATION_API.md)
- Điều kiện nhận video, quota, retry và định dạng nhóm từ khóa. [Scanner](docs/SCANNER.md)
- Lịch sử, cache và schema nội dung dùng chung. [Storage](docs/ACTIVITY_STORAGE.md) · [MongoDB Atlas](docs/MONGODB_ATLAS.md)

### Phát triển giao diện dashboard

Bốn màn hình dùng chung điều hướng, tiêu đề, trường nhập và bộ style trong `dashboard/src`. Sửa component từng màn hình tại `dashboard/src/pages`. Vite build giao diện React thành HTML phục vụ trực tiếp bởi local agent. Biểu mẫu Scanner dùng React trong trình duyệt. Các bộ điều khiển hiện có xử lý workflow, nội dung, remote và danh sách kết quả.

Từ thư mục `local-workflow-agent`, chạy `npm --prefix dashboard ci` để cài công cụ build, sau đó chạy `npm run build:dashboard` khi sửa nguồn. Commit cả nguồn và tài nguyên đã build trong `dashboard/`. Chạy agent như bình thường để xem thay đổi.
