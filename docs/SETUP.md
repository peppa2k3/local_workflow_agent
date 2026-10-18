# Cài đặt và chạy từng bước

## Tải video bằng IDM

1. Cài IDM và bật **IDM Integration Module** trong Chrome profile muốn dùng. Mở thử một trang video, phát video và kiểm tra có panel **Download this video / Tải video này**. Đặt chất lượng player thành 1080p/720p nếu website chỉ gửi luồng theo chất lượng đang phát.
2. Khởi động lại `node local-agent.js`. Reload **Local Workflow Agent Bridge 4.1.0** trong từng profile cần chạy rồi tải lại dashboard. Nếu IDM cài ở vị trí khác, đặt `$env:IDM_PATH = 'C:\\duong-dan\\IDMan.exe'` trước khi chạy agent.
3. Chọn Chrome profile trên dashboard. Bấm **＋ Kịch bản tải video IDM**, điền `video_url` và `thu_muc_tai` trong Danh sách biến; hoặc mở `idm-video` rồi thay URL mẫu và thư mục. Có thể nhập trực tiếp URL/thư mục trong bước và dùng **Chọn thư mục…**.
4. Giữ mặc định **1080p, nếu không có thì 720p**, hoặc chọn 720p. Tên file để trống sẽ dùng tên IDM gợi ý và thêm hậu tố nếu trùng. Tên file chỉ định đã tồn tại sẽ báo lỗi để tránh ghi đè.
5. Bấm **Chạy kịch bản**. Để Windows mở khóa và không chuyển tab/cửa sổ trong lúc agent chọn panel/menu/thư mục IDM. Player tùy chỉnh có thể điền **CSS nút Play** hoặc bấm Play thủ công khi agent đang chờ panel. Tiến độ và file đích xuất hiện trong Trạng thái.

Mặc định chờ panel/menu tối đa 2 phút, tải file tối đa 30 phút; điều chỉnh trong bước nếu cần. Agent chỉ chạy một workflow IDM tại một thời điểm. Bấm Dừng hủy chờ/điều khiển; file đã bắt đầu tải có thể tiếp tục trong IDM. Xem [chi tiết và giới hạn IDM](SCENARIOS.md#idm-video-download). Không cần đưa cookie hay dữ liệu Chrome profile vào agent.

## 1. Chuẩn bị

1. Cài Node.js và Google Chrome trên Windows.
2. Mở PowerShell tại thư mục dự án `D:\[you-path]\playwright_test`.
3. Chạy `npm ci` để cài dependency theo `package-lock.json`.
4. Dashboard cho phép chọn nhiều Chrome profile. Mặc định CLI/API dùng `Profile 2`; đổi mặc định bằng `$env:CHROME_PROFILE = 'Profile 1'` trước khi khởi động agent. Có thể đặt `$env:CHROME_PATH` nếu Chrome không ở `C:\Program Files\Google\Chrome\Application\chrome.exe`, và `$env:CHROME_USER_DATA_DIR` nếu dùng thư mục dữ liệu Chrome riêng. Cần Chrome 120 trở lên.

Không dùng `legacy/facebook-feed.js` cho quy trình này: nó là thử nghiệm Playwright cũ. Agent và extension thao tác trên profile Chrome hiện có.

## 2. Nạp extension vào đúng profile

1. Chuyển sang cửa sổ của Chrome profile đã chọn.
2. Mở `chrome://extensions`.
3. Bật **Developer mode**.
4. Chọn **Load unpacked**, chọn thư mục `D:\[you-path]\playwright_test\chrome-reels-extension` (chọn **thư mục**, không chọn `manifest.json`).
5. Chấp nhận quyền extension nếu Chrome hỏi. Extension dùng Debugger để gửi click/cuộn/chọn file; Tabs, Scripting, Storage và Alarms để quản lý tab, chờ tải trang và duy trì kết nối riêng theo profile.
6. Sau khi agent chạy, mở **Details → Extension options**. Chọn đúng thư mục của profile này rồi **Lưu kết nối**. Xem **Profile Path** tại `chrome://version` để biết phần cuối là `Default`, `Profile 1`, `Profile 2`… Lặp lại việc cài và cấu hình cho từng profile muốn điều khiển.
7. Khi mã extension thay đổi, bấm **Reload** trên thẻ extension trong từng profile rồi tải lại tab website đang mở. Bản cập nhật nhiều profile yêu cầu cấu hình Extension options một lần trước khi chạy.

## 3. Khởi động agent và dashboard

1. Trong PowerShell ở thư mục dự án, chạy `npm start` hoặc `node .\local-agent.js`.
2. Giữ terminal đó mở. Dòng `Dashboard: http://127.0.0.1:34719` cho biết agent đã sẵn sàng.
3. Mở `http://127.0.0.1:34719` trong Chrome. Địa chỉ này chỉ lắng nghe trên máy local.
4. Nếu cổng `34719` đã được dùng, nhập `exit` trong terminal agent cũ rồi chạy lại. Extension đang kết nối cố định với cổng này.
5. Chọn **Chrome profile** trên dashboard. **Mở profile** mở cửa sổ của profile đó; chỉ chạy khi trạng thái extension của profile là **đã kết nối**.

## 4. Tạo và chạy kịch bản

1. Nhập **Tên file mới** bằng chữ thường, số, `-` hoặc `_`, rồi bấm **Tạo mới**. Hoặc chọn kịch bản đã lưu và bấm **Mở**.
2. Bấm **＋ Thêm bước**, chọn action, điền trường của bước đó. Dùng nút ↑ ↓ để đổi thứ tự.
3. Thường bắt đầu bằng `openUrl`, rồi `waitFor` nút cần xuất hiện, sau đó `click`, `type`, `scroll` hoặc `upload`. `openUrl` và `click` tự chờ trang tải xong/DOM ổn định. Với AJAX, upload hoặc điều hướng trễ, điền **Chờ phần tử kết quả** và trạng thái **Xuất hiện/Biến mất/Có thể tương tác** để xác định khi thao tác hoàn tất; xem [cú pháp và ví dụ completion](SCENARIOS.md#waiting-for-actions-to-finish).
4. Với `click`, `waitFor`, `type`, `upload`, bấm **◎ Chọn trên trang**, chuyển sang tab mục tiêu, di chuột lên phần tử và click. Locator sẽ được điền vào bước. Nhấn Esc để hủy.
5. Chọn profile, bấm **Lưu**, rồi **▶ Chạy kịch bản**. Thanh **Trạng thái** hiển thị bước hiện tại hoặc lỗi. **Dừng** chỉ dừng profile đang chọn. Có thể chuyển profile và chạy kịch bản khác đồng thời.
6. Có thể chạy bằng terminal agent: `run scenarios/facebook-reels.json --profile "Profile 1"`, kiểm tra `status`, dừng bằng `stop "Profile 1"`, thoát tất cả bằng `exit`.

## 5. Upload file

1. Thêm action **Upload file** vào vị trí sau bước mở dialog upload, nếu trang cần bước đó.
2. Dùng **◎ Chọn trên trang** để chọn **nút mở hộp chọn file**. Action upload sẽ tự click nút, chặn hộp thoại chọn file của Chrome và gán file. Nếu đang có bước `click` riêng cho cùng nút này, xóa bước đó để tránh click hai lần.
3. Điền **Đường dẫn file đầy đủ** trong bước, hoặc **Thư mục** + **Tên file**. Có thể để trống và điền **File upload cho lần chạy** trên thanh công cụ để thay file mỗi lần chạy.
4. Nếu website cần xác nhận sau khi chọn file, thêm `waitFor` cho preview/trạng thái hoàn tất, rồi thêm `click` cho nút Submit/Đăng.
5. Trong terminal: `run scenarios/ten-kich-ban.json --upload "C:\Users\Administrator\Downloads\photo.jpg"`.

## 6. Khi click mở lớp phủ/dialog

Thêm `waitFor` cho nút mới trong dialog trước bước click/upload tiếp theo. Locator nên ưu tiên **Role + tên**, **Chữ hiển thị**, **Label** hoặc **XPath**, vì class CSS có thể đổi. Agent chọn phần tử trong dialog đang hiển thị và đợi đến khi nó nhận được click. Xem [hướng dẫn locator và action](SCENARIOS.md).

## 7. Kiểm tra và xử lý lỗi

- Chạy `npm test` để kiểm tra điều phối nhiều profile, navigation/SPA, dialog và upload mẫu. Kiểm tra này không truy cập Facebook hay profile đăng nhập của bạn.
- **Extension chưa kết nối:** bảo đảm agent đang chạy, extension đã Reload và Extension options đã chọn đúng thư mục profile. Đúng profile phải chứa extension.
- **Another extension is connected as this profile:** kiểm tra `chrome://version` trong từng cửa sổ và sửa ánh xạ profile ở Extension options; không chọn cùng thư mục cho hai profile khác nhau.
- **Page did not finish loading / Completion condition timed out:** kiểm tra dấu hiệu kết quả và tăng **Timeout tải trang / kết quả**. Với trang liên tục thay đổi DOM, đặt **DOM ổn định** bằng 0 và dùng điều kiện kết quả rõ ràng.
- **Element not found/actionable:** dùng **Chọn trên trang** khi dialog đã mở; kiểm tra tên nút/role và tăng `timeoutMs` nếu trang tải chậm.
- **Upload file does not exist:** kiểm tra đường dẫn tuyệt đối, tên file và quyền đọc trên máy.
- **File input không xác định:** chọn đúng nút upload hoặc dùng locator CSS/XPath cho `input[type=file]` trong dialog.
- **Port already in use:** chỉ chạy một agent trên cổng `34719`.

Agent chưa chạy website khác trong iframe hay Shadow DOM đóng; các trang đó cần bổ sung xử lý riêng.
