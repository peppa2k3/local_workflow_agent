# Tiến độ phát triển

Cập nhật: 2026-10-18 (Asia/Bangkok).

## Completed

- Sửa `type` cho input/textarea/contenteditable và wrapper presentation: click, chờ editor, xác nhận focus/caret rồi mới nhập; xóa rich text bằng browser editing, append khi clear=false, lỗi rõ với readonly/vùng không nhập được.
- Xác nhận nguyên nhân nhập nguyên token biến ở phiên chạy cũ: agent cũ vẫn đang chạy. Thêm kiểm tra capability trên dashboard và chặn token chưa resolve trong extension; test HTTP chứng minh lấy giá trị mới mỗi lần chạy và JSON luôn giữ tham chiếu.

- Thao tác `setDate`/`setTime`: click input, nhập ngày/giờ native hoặc text, phát input/change, kiểm tra giá trị; giữ CSS selector cũ.
- Biến theo kịch bản ở navbar, chèn `{{name}}` vào input, resolve trước khi chạy và báo lỗi biến thiếu/vòng lặp.
- Chọn kịch bản tự mở đúng editor, chạy trên profile đã chọn; clone độc lập giữ steps/variables và không ghi đè bản sao cũ.
- Hiển thị CPU/RAM/event loop agent và thời gian bước theo profile; tránh poll chồng; khóa picker khi chờ, đưa hộp thoại lên trước và tái sử dụng debugger để giảm lượt dò lặp.
- Kiểm thử cục bộ bằng Chrome tách biệt cho ngày/giờ, file chooser CDP thực, biến, clone và lựa chọn profile/kịch bản trên dashboard.

- Điều phối tuần tự theo xác nhận hoàn tất: chờ navigation/DOM ổn định sau openUrl/click; hỗ trợ điều kiện kết quả visible/hidden/enabled cho tác vụ bất đồng bộ, timeout và dừng riêng.
- Dashboard chọn/mở nhiều Chrome profile và chạy đồng thời các workflow độc lập; extension cấu hình profile một lần trong Options, từ chối kết nối trùng và kết quả cũ.
- Kiểm thử Chrome tách biệt cho redirect, tải tài nguyên chậm, click thay document, kết quả SPA; kiểm thử cách ly workflow/profile.

- Local Agent chạy trong Node.js, điều phối các bước kịch bản JSON và cung cấp dashboard HTTP local.
- Extension thao tác trên Chrome profile đang dùng: cuộn, click, nhập chữ, chọn phần tử trực tiếp, locator semantic/CSS/XPath.
- Hỗ trợ dialog/lớp phủ: chờ phần tử nhận click, ưu tiên dialog đang hiển thị.
- Hỗ trợ upload: đường dẫn cố định hoặc truyền khi chạy, click nút mở file chooser, chọn file qua Chrome Debugger.
- Dashboard có nút chọn file Windows cho đường dẫn upload lưu trong bước và đường dẫn tạm cho lần chạy.
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

## 2026-10-19: chuyển IDM sang yt-dlp + FFmpeg

- Đảo ngược phần IDM về nền `44b8e0d`, giữ lịch sử Git.
- Thêm tải video URL: metadata title/ID, giới hạn chất lượng, tên file an toàn, không ghi đè, xác nhận file hoàn tất, timeout và Stop cây tiến trình.
- Cập nhật agent, extension, dashboard, scenario mẫu và hướng dẫn cài portable tools.
- Kiểm chứng: npm test và node --check cho JavaScript thay đổi, script dashboard. Test video HTTP cục bộ dùng executable thật khi có tools; không dùng profile đăng nhập.

Kiểm chứng thực tế 2026-10-19: tải video HTTP cục bộ, tải lại không ghi đè, ghép DASH hai luồng bằng FFmpeg; FFprobe xác nhận hình + tiếng. Dashboard kiểm tra phân tích URL với biến, tên Unicode và tải khi extension offline. URL YouTube 9qq_Fqp2rnM phân tích được title/ID/duration; chưa tải toàn bộ video YouTube (7768 giây).
