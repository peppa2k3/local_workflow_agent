# Đối chiếu tải IDM với URL YouTube mẫu

URL người dùng cung cấp: https://www.youtube.com/watch?v=9qq_Fqp2rnM

2026-10-18, phản hồi mới: ảnh người dùng cho thấy panel nổi "Tải video này" trên UI Chrome; mở trang được nhưng helper chưa click tải. Tìm nguyên nhân trong code: chỉ xét UI Automation control thuộc PID IDMan, bỏ sót HWND do DLL IDM inject vào Chrome. Gói `idmbrbtn64.dll` đang cài chứa class `IDM Download Button class`. Đã thêm dò/click Win32 theo class này (không cần Name/HelpText/DOM), kiểm tra PID/bounds/visibility/hit-test, click vùng trái tránh nút trợ giúp/đóng; hỗ trợ menu native Chrome sau khi panel đã được xác minh. Thêm `tests/idm-native.ps1` tạo HWND thật trong tiến trình test riêng, không dùng Chrome/profile người dùng. Bridge 4.1.2.

Lượt thử sau bản sửa: `test-results/idm-live/2026-10-18T13-30-52-785Z/report.json`, Chrome profile mới, module IDM kết nối. Không lấy được foreground trong desktop thử nên helper dừng đúng timeout focus; player YouTube báo lỗi, `download: null`. Fixture native bắt đúng panel không nhãn/Chrome PID, loại sai PID/ngoài bounds/ẩn; desktop cũng từ chối foreground nên nhánh click fixture xác nhận từ chối input, chưa kiểm chứng click thực trong lượt này. Không dùng kết quả này để kết luận tải video thành công.

Mục tiêu: kiểm tra trình phát, panel/menu chất lượng và Save As bằng môi trường Chrome tách biệt; thư mục tải thử riêng dưới test-results, không dùng profile đăng nhập. Không thay đổi các kịch bản sẵn có hoặc tải vào thư mục chưa được người dùng chỉ định.

Đã thử: Chrome for Testing 155 và Chrome 155 với profile mới, extension IDM 6.43.1 từ Program Files giữ nguyên public key/native-host ID, bridge tạm dùng port riêng và agent riêng. Không dùng dữ liệu đăng nhập hoặc port agent chính; các browser/agent thử được đóng sau mỗi lần.

Bằng chứng: video phát được ban đầu (frame quan sát 480x640, không suy ra danh sách chất lượng tối đa), module IDM kết nối và có tooltip bình thường sau giai đoạn khởi động. Chưa thấy panel native hoặc file hoàn tất. Một số lượt sau đó player báo "Something went wrong. Refresh or try again later." Lượt cuối `test-results/idm-live/2026-10-18T13-16-31-082Z/report.json` kết thúc bằng lỗi không thấy panel, `download: null`; không báo thành công giả.

Đã sửa: marker title được giữ bằng MutationObserver; native helper bind HWND/PID, chờ tối đa 3 giây cho UIA cập nhật title. Tìm cả IDMan-owned child panel trong cửa sổ Chrome. Pha chờ panel/menu/dialog tạm dừng khi mất focus thay vì hủy ngay; kiểm tra từng click vẫn giữ nguyên. Native pause/resume được xác nhận bằng cửa sổ test thứ hai (`focus-check.json`). Thêm runner opt-in `npm run test:idm-live` và scenario `idm-youtube-sample` sẵn URL/thư mục tải thử.

Kiểm chứng hồi quy: npm test pass, gồm regression đổi title trong khi job IDM đang chạy; adapter ValidateOnly compile và kiểm tra UTF-8 pass; node --check cho JS thay đổi và script inline dashboard, JSON và git diff --check pass. Bridge 4.1.1 cần Reload để áp dụng thay đổi content script.

Người dùng xác nhận nút IDM xuất hiện khi mở URL thủ công trong Chrome đang dùng. Đối chiếu chỉ manifest phần mềm (không đọc cookies/storage): Default, Profile 1 và Profile 2 đều có module ngpampappnmepgilojfohadhhmbhlaek phiên bản 6.43.1, cùng phiên bản gói Program Files dùng để thử. Chưa có bằng chứng lỗi do khác phiên bản extension.

Trạng thái: code sửa đã hoàn thành; kiểm chứng tải thực còn chưa hoàn tất. Bước tiếp theo là chạy `idm-youtube-sample` từ dashboard với profile đã cài bridge/IDM và thư mục người dùng chọn, quan sát trạng thái panel/menu/file. Không tự động kiểm thử trên profile đăng nhập theo AGENTS.md; không tự chỉnh cấu hình integration toàn máy, đăng nhập YouTube hoặc bỏ các kiểm tra focus/profile để ép tải.
