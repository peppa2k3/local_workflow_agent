# Project context

## Mục tiêu

Người dùng xây dựng kịch bản tự động local và chạy chúng trên **Chrome profile đã đăng nhập sẵn**. Dashboard chỉnh sửa kịch bản; agent Node.js điều phối; extension trong profile hiện có gửi thao tác vào tab. Trường hợp khởi đầu là tab Reels của Facebook `https://www.facebook.com/profile.php?id=61560176683071&sk=reels_tab`, nhưng engine hỗ trợ URL khác.

## Quyết định kỹ thuật

- Playwright không điều khiển profile Chrome mặc định đang chạy. Chrome khóa thư mục profile và các phiên bản Chrome mới hạn chế remote debugging trên `User Data` mặc định. Vì vậy Playwright chỉ còn ở thử nghiệm cũ và bài test tách biệt.
- Agent lắng nghe tại `127.0.0.1:34719`; extension gửi yêu cầu HTTP qua service worker. Dashboard cũng dùng server này.
- `openFolder`, `wait` chạy trong agent. `openUrl` chạy trong background extension và chờ trang tải xong; `waitFor`, `click`, `type`, `setDate`, `setTime`, `scroll`, `upload` thao tác trên tab Chrome đã kết nối. Background giữ trách nhiệm xác nhận hoàn tất khi click thay thế document.
- Mỗi Chrome profile có workflow và tab riêng. Dashboard chọn profile; extension lưu ánh xạ thư mục profile + ID kết nối trong storage riêng của profile. Agent đọc danh sách tên/thư mục từ metadata `Local State`, không đọc phiên đăng nhập.
- Extension dùng `chrome.debugger` để gửi input và chọn file; content script tìm phần tử bằng locator semantic/CSS/XPath và ưu tiên dialog đang mở.
- Kịch bản là JSON trong `scenarios/`. Agent chấp nhận file upload cố định trong bước hoặc đường dẫn truyền lúc chạy.
- `variables` là object theo kịch bản; agent resolve `{{name}}` trên bản sao trước khi chạy, kiểm tra biến thiếu/vòng lặp, rồi validate ngày/giờ và đường dẫn file. Dashboard tự tải kịch bản được chọn; clone tạo file mới không ghi đè.
- Dashboard theo dõi CPU/RSS/event loop của Node agent và thời gian workflow/bước theo profile. File picker là một hộp thoại Windows tại một thời điểm; debugger được tái sử dụng tới khi detach.
- `local-agent.js`, đường dẫn thư mục extension, dashboard URL và cổng 34719 là các điểm vào ổn định để không làm hỏng cách chạy hiện tại.

## Quy ước làm việc

1. Giữ tương thích với bước `selector` cũ (CSS) và các file kịch bản đã lưu.
2. Trước khi thêm action, cập nhật cùng lúc: agent (nếu cần đường dẫn/file), extension, form dashboard, docs và bài test có liên quan.
3. Không commit Chrome profile, `node_modules`, khóa `.pem`, hoặc gói `.crx`. Những file này từng được Git theo dõi; commit hiện tại chỉ ngừng theo dõi, không xóa chúng khỏi lịch sử cũ.
4. Bài test Playwright tạo Chrome riêng và trang HTML mẫu, không dùng profile Facebook của người dùng.
5. Sau khi sửa extension, người dùng phải Reload extension và tải lại tab mục tiêu.

## Giới hạn hiện tại

- `upload` chọn file và có thể kích hoạt upload của website; nếu website cần nút xác nhận hoặc chờ server xử lý, thêm các bước `waitFor`/`click` tương ứng.
- Locator hiện tìm trong document chính; iframe khác origin và Shadow DOM đóng chưa được hỗ trợ.
- Click theo tab mới mở trong khoảng quan sát 500 ms; nếu website mở tab trễ hơn, dùng `openUrl` để chọn URL rõ ràng. Tác vụ AJAX/upload cần `completion` hoặc `waitFor` theo dấu hiệu kết quả của website.
- Extension dùng cổng cố định 34719. Biến `LOCAL_AGENT_PORT` chỉ hữu ích để kiểm tra agent riêng; extension sẽ không tự đổi cổng.
