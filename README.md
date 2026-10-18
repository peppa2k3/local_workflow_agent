# Local Chrome Workflow Agent

Công cụ tạo và chạy kịch bản tự động trên Chrome profile đang dùng. Agent Node.js nhận lệnh trên máy; Chrome Extension thực hiện click, nhập chữ, cuộn và chọn file trong tab. Dashboard local giúp chỉnh sửa kịch bản JSON bằng giao diện.

Dashboard hỗ trợ chọn/mở nhiều Chrome profile và chạy kịch bản độc lập trên từng profile. Cài extension trong mỗi profile, vào **Extension options** để chọn đúng thư mục profile, rồi chọn profile trên dashboard. `openUrl`/`click` chờ trang tải xong; dùng điều kiện hoàn tất để chờ kết quả AJAX hoặc upload.

Chọn **Chrome profile** và **Kịch bản đã lưu** rồi bấm **Chạy kịch bản**; dropdown tự mở kịch bản vừa chọn. **Clone kịch bản** lưu nội dung đang sửa và tạo bản sao độc lập với tên `-copy`. Thanh **Danh sách biến** quản lý biến theo kịch bản; dùng **Chèn tham chiếu biến…** dưới mỗi input hoặc nhập `{{ten_bien}}`. Có thêm **Click và nhập ngày** (`YYYY-MM-DD`) và **Click và nhập giờ** (`HH:mm`), hỗ trợ cả input native và input text. Chọn định dạng ngày/tháng/năm cho input text nếu cần.

Dashboard hiển thị CPU/RAM/event loop của agent cùng thời gian chạy theo profile để tìm bước chậm. Nút chọn file báo đang mở hộp thoại và chặn bấm lặp. Sau khi cập nhật, khởi động lại agent, Reload extension trong từng profile và tải lại dashboard/tab mục tiêu.

**Tải video bằng IDM:** bấm **＋ Kịch bản tải video IDM** hoặc mở `idm-video`, điền URL video và thư mục lưu ở Danh sách biến, chọn profile đã cài **IDM Integration Module** rồi Chạy. Action `idmDownload` mở URL bằng profile đó, phát video HTML nếu có, chờ panel **Download this video / Tải video này**, ưu tiên 1080p rồi 720p, điền Save As và đợi file tải xong. Panel này là cửa sổ native nổi trên Chrome khi IDM phát hiện video; agent tìm và click bằng Win32 HWND, không dùng CSS/element của website. Có nút **Chọn thư mục…**, timeout riêng và thông tin file tải trong trạng thái. Chỉ chạy một kịch bản IDM cùng lúc; không chuyển tab/cửa sổ trong lúc chọn panel và thư mục. Xem [thiết lập IDM](docs/SETUP.md#tải-video-bằng-idm) và [cú pháp IDM](docs/SCENARIOS.md#idm-video-download).

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
