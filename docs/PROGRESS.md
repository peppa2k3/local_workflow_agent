# Tiến độ phát triển

Cập nhật: 2026-10-18 (Asia/Bangkok).

## Completed

- Thêm tính năng riêng `idmDownload` và mẫu `idm-video`: URL + thư mục + chất lượng, chọn profile từ dashboard, chọn thư mục Windows, chờ panel/menu IDM, chọn 1080p rồi 720p, điền Save As và xác nhận file cuối. Native helper định danh cửa sổ bằng marker, chống workflow IDM đồng thời, không ghi đè, timeout/cancel và start idempotent.
- Test cục bộ policy/helper IPC/cancel/isolation, Chrome tách biệt cho dispatch IDM và cleanup marker, dashboard mẫu IDM/chọn thư mục/profile. Đã thử URL YouTube `9qq_Fqp2rnM` bằng profile tách biệt: phát được ban đầu, module IDM kết nối, chưa thấy panel/file tải hoàn tất; một số lượt player báo lỗi sau đó. Không ghi nhận thành công giả.
- Sửa marker khi trang đổi title: MutationObserver khôi phục marker, helper bind HWND/PID và chờ cập nhật UIA ngắn hạn. Tìm cả panel IDMan là child của Chrome; chờ focus rồi tiếp tục thay vì hủy ngay khi cửa sổ khác được đưa lên trước. Kiểm chứng native pause/resume bằng cửa sổ thử tách biệt; thêm lệnh opt-in `test:idm-live` và kịch bản `idm-youtube-sample`.

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

- Đối chiếu IDM với URL YouTube mẫu: đã sửa/kiểm thử marker và focus; chưa xác nhận tải file thực vì profile tách biệt không thấy panel, player sau đó báo lỗi. Người dùng xác nhận Chrome mở thủ công có panel; module cài trong Chrome và gói thử đều 6.43.1. Cần đối chiếu lần chạy từ dashboard với profile/thư mục người dùng chọn; xem `prompts/processing/idm-youtube-live.md`.

## Planed

- Kiểm thử end-to-end trên website mục tiêu với các locator và phản hồi upload thực tế.
- Hỗ trợ tab mới, iframe và Shadow DOM khi có kịch bản cần chúng.
- Thêm dấu hiệu hoàn tất upload theo từng website, thay cho chờ thời gian cố định.
- Cân nhắc cấu hình cổng agent và extension đồng bộ nếu cần chạy nhiều phiên.
