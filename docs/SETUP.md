# Cài đặt và chạy từng bước

## 1. Chuẩn bị

1. Cài Node.js và Google Chrome trên Windows.
2. Mở PowerShell tại thư mục dự án `D:\CODE_DND\playwright_test`.
3. Chạy `npm ci` để cài dependency theo `package-lock.json`.
4. Chọn đúng Chrome profile đang có phiên đăng nhập Facebook. Mặc định agent dùng `Profile 2`. Để đổi sang `Profile 1`, chạy `$env:CHROME_PROFILE = 'Profile 1'` trong **cùng terminal** trước khi khởi động agent. Có thể đặt `$env:CHROME_PATH` nếu Chrome không ở `C:\Program Files\Google\Chrome\Application\chrome.exe`.

Không dùng `legacy/facebook-feed.js` cho quy trình này: nó là thử nghiệm Playwright cũ. Agent và extension thao tác trên profile Chrome hiện có.

## 2. Nạp extension vào đúng profile

1. Chuyển sang cửa sổ của Chrome profile đã chọn.
2. Mở `chrome://extensions`.
3. Bật **Developer mode**.
4. Chọn **Load unpacked**, chọn thư mục `D:\CODE_DND\playwright_test\chrome-reels-extension` (chọn **thư mục**, không chọn `manifest.json`).
5. Chấp nhận quyền Debugger nếu Chrome hỏi. Extension dùng quyền này để gửi click, cuộn và chọn file vào tab.
6. Khi mã extension thay đổi, bấm **Reload** trên thẻ extension rồi tải lại tab website đang mở.

## 3. Khởi động agent và dashboard

1. Trong PowerShell ở thư mục dự án, chạy `npm start` hoặc `node .\local-agent.js`.
2. Giữ terminal đó mở. Dòng `Dashboard: http://127.0.0.1:34719` cho biết agent đã sẵn sàng.
3. Mở `http://127.0.0.1:34719` trong Chrome. Địa chỉ này chỉ lắng nghe trên máy local.
4. Nếu cổng `34719` đã được dùng, nhập `exit` trong terminal agent cũ rồi chạy lại. Extension đang kết nối cố định với cổng này.

## 4. Tạo và chạy kịch bản

1. Nhập **Tên file mới** bằng chữ thường, số, `-` hoặc `_`, rồi bấm **Tạo mới**. Hoặc chọn kịch bản đã lưu và bấm **Mở**.
2. Bấm **＋ Thêm bước**, chọn action, điền trường của bước đó. Dùng nút ↑ ↓ để đổi thứ tự.
3. Thường bắt đầu bằng `openUrl`, rồi `waitFor` nút cần xuất hiện, sau đó `click`, `type`, `scroll` hoặc `upload`.
4. Với `click`, `waitFor`, `type`, `upload`, bấm **◎ Chọn trên trang**, chuyển sang tab mục tiêu, di chuột lên phần tử và click. Locator sẽ được điền vào bước. Nhấn Esc để hủy.
5. Bấm **Lưu**, rồi **▶ Chạy kịch bản**. Thanh **Trạng thái** hiển thị bước hiện tại hoặc lỗi. Bấm **Dừng** nếu cần.
6. Có thể chạy bằng terminal agent: `run scenarios/facebook-reels.json`, kiểm tra `status`, dừng bằng `stop`, thoát bằng `exit`.

## 5. Upload file

1. Thêm action **Upload file** vào vị trí sau bước mở dialog upload, nếu trang cần bước đó.
2. Dùng **◎ Chọn trên trang** để chọn **nút mở hộp chọn file**. Action upload sẽ tự click nút, chặn hộp thoại chọn file của Chrome và gán file. Nếu đang có bước `click` riêng cho cùng nút này, xóa bước đó để tránh click hai lần.
3. Điền **Đường dẫn file đầy đủ** trong bước, hoặc **Thư mục** + **Tên file**. Có thể để trống và điền **File upload cho lần chạy** trên thanh công cụ để thay file mỗi lần chạy.
4. Nếu website cần xác nhận sau khi chọn file, thêm `waitFor` cho preview/trạng thái hoàn tất, rồi thêm `click` cho nút Submit/Đăng.
5. Trong terminal: `run scenarios/ten-kich-ban.json --upload "C:\Users\Administrator\Downloads\photo.jpg"`.

## 6. Khi click mở lớp phủ/dialog

Thêm `waitFor` cho nút mới trong dialog trước bước click/upload tiếp theo. Locator nên ưu tiên **Role + tên**, **Chữ hiển thị**, **Label** hoặc **XPath**, vì class CSS có thể đổi. Agent chọn phần tử trong dialog đang hiển thị và đợi đến khi nó nhận được click. Xem [hướng dẫn locator và action](SCENARIOS.md).

## 7. Kiểm tra và xử lý lỗi

- Chạy `npm test` để kiểm tra luồng click dialog và upload mẫu. Kiểm tra này không truy cập Facebook.
- **Extension chưa kết nối:** bảo đảm agent đang chạy, extension đã Reload và tab mục tiêu đã tải lại. Đúng profile phải chứa extension.
- **Element not found/actionable:** dùng **Chọn trên trang** khi dialog đã mở; kiểm tra tên nút/role và tăng `timeoutMs` nếu trang tải chậm.
- **Upload file does not exist:** kiểm tra đường dẫn tuyệt đối, tên file và quyền đọc trên máy.
- **File input không xác định:** chọn đúng nút upload hoặc dùng locator CSS/XPath cho `input[type=file]` trong dialog.
- **Port already in use:** chỉ chạy một agent trên cổng `34719`.

Agent chưa chạy website khác trong iframe hay Shadow DOM đóng; các trang đó cần bổ sung xử lý riêng.
