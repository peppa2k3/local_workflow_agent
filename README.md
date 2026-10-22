# Local Chrome Workflow Agent

Công cụ tạo và chạy kịch bản tự động trên Chrome profile đang dùng. Agent Node.js nhận lệnh trên máy; Chrome Extension thực hiện click, nhập chữ, cuộn và chọn file trong tab. Dashboard local giúp chỉnh sửa kịch bản JSON bằng giao diện.

Dashboard hỗ trợ chọn/mở nhiều Chrome profile và chạy kịch bản độc lập trên từng profile. Cài extension trong mỗi profile, vào **Extension options** để chọn đúng thư mục profile, rồi chọn profile trên dashboard. `openUrl`/`click` chờ trang tải xong; dùng điều kiện hoàn tất để chờ kết quả AJAX hoặc upload.

Chọn **Chrome profile** và **Kịch bản đã lưu** rồi bấm **Chạy kịch bản**; dropdown tự mở kịch bản vừa chọn. **Clone kịch bản** lưu nội dung đang sửa và tạo bản sao độc lập với tên `-copy`. Thanh **Danh sách biến** quản lý biến theo kịch bản; dùng **Chèn tham chiếu biến…** dưới mỗi input hoặc nhập `{{ten_bien}}`. Có thêm **Click và nhập ngày** (`YYYY-MM-DD`) và **Click và nhập giờ** (`HH:mm`), hỗ trợ cả input native và input text. Chọn định dạng ngày/tháng/năm cho input text nếu cần.

Dashboard hiển thị CPU/RAM/event loop của agent cùng thời gian chạy theo profile để tìm bước chậm. Nút chọn file báo đang mở hộp thoại và chặn bấm lặp. Sau khi cập nhật, khởi động lại agent, Reload extension trong từng profile và tải lại dashboard/tab mục tiêu.

Lịch sử từng bước được lưu qua restart tại `data/agent/`. URL đã tải dùng lại file nếu kích thước/SHA-256 còn đúng, rồi tiếp tục các bước upload. Bước upload có tên/URL/UUID page và thời gian upload; metadata có thể đồng bộ MongoDB qua `MONGODB_URI`. Xem [cấu hình lưu trữ và ví dụ biến page](docs/ACTIVITY_STORAGE.md).

Để dùng MongoDB Atlas chung với các service khác, điền `MONGODB_URI` và `MONGODB_DATABASE=team_content` trong `.env` (mẫu `.env.example`), chạy `npm run check:mongo`, rồi khởi động agent. Giao diện [Kho nội dung](http://127.0.0.1:34719/content) quản lý download/upload, page, publication và lịch sử trong database. Hỗ trợ đọc lại `.env`, kiểm tra kết nối, đồng bộ ngay và chọn page chung trong bước upload. Xem [hướng dẫn Atlas](docs/MONGODB_ATLAS.md).

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

## Tải video qua URL

Chạy `npm run setup:video`, rồi `node local-agent.js`. Mở http://127.0.0.1:34719, chọn `video-download`, sửa URL/thư mục và chạy. Action **Tải video (yt-dlp + FFmpeg)** có nút phân tích URL lấy tên; file lưu theo tiêu đề, không gắn ID. Xem [SCENARIOS](docs/SCENARIOS.md).

Mẫu nối toàn bộ luồng: chọn `download-upload-reels` để tải clip → upload Reels → điền tên phim từ URL. Sửa URL/thư mục/trang Reels và locator theo giao diện của bạn. Dùng `{{download_file_path}}` cho upload, `{{download_title}}` cho mô tả; agent chờ file hoàn tất và FFprobe xác nhận trước khi chạy bước sau. Mẫu dừng trước Đăng. Dashboard có tên riêng cho từng bước và nút xóa kịch bản.


Tải video hiện ưu tiên FPS → độ phân giải → bitrate, không giới hạn 1080p. Tên file hoàn tất là `tiêu đề.mp4` (hoặc định dạng nguồn), trùng tên thêm `(2)`, `(3)`…; không ghi đè clip cũ. JSON có quality số vẫn chạy theo chính sách cao nhất mới.
