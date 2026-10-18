# Tải video bằng IDM theo profile

Yêu cầu 2026-10-18: nhận URL chứa video, mở trong Chrome profile đã chọn, chờ panel IDM Download this video/Tải video này, chọn 1080p rồi 720p và lưu thư mục chỉ định qua kịch bản riêng.

Thiết kế: action idmDownload mở tab trong extension; helper Windows native độc lập do agent quản lý, gắn với marker duy nhất trên cửa sổ Chrome; đọc menu chất lượng, chọn theo policy, điền Save As và chờ file cuối cùng. Một workflow IDM tại một thời điểm để tránh dùng nhầm cửa sổ. Có timeout/cancel, trạng thái và chặn ghi đè.

Bằng chứng: IDMan.exe 6.43 đang chạy. Tài liệu chính thức https://project.internetdownloadmanager.com/register/new_faq/functions20.html giải thích panel chỉ xuất hiện khi player phát yêu cầu video. https://www.internetdownloadmanager.com/support/using_idm/starting.html cho thấy /d cần URL tải trực tiếp, không thay thế chọn luồng từ URL trang.

Trạng thái: đã triển khai và kiểm thử cục bộ. Có nút tạo kịch bản riêng trên dashboard, mẫu scenarios/idm-video.json, chọn thư mục native, biến URL/thư mục, progress/file đích, capability bridge 4.1.0, helper tự khởi động IDM đã cài và hỗ trợ DPI/UTF-8 tiếng Việt.

Kiểm chứng: npm test pass toàn bộ; node --check các JavaScript thay đổi và script inline dashboard pass; parse PowerShell và compile idm-ui.ps1 -ValidateOnly thành công, kiểm tra UTF-8 literal tiếng Việt. Test policy 1080/720/audio-only, validation, IPC chia chunk, helper error, chống file ngoài thư mục/ghi đè, cancel, lock/profile/idempotency/completion; Chrome tách biệt kiểm tra native dispatch giả, title cleanup cả khi lỗi, dashboard mẫu/chọn thư mục/profile/bridge cũ. Đã xem ảnh dashboard IDM. Không dùng profile đăng nhập để test, không tải video thực và không thay đổi file scenario có sẵn.

Giới hạn kiểm chứng: chưa có URL mẫu, nên thao tác panel/menu/Save As của IDM 6.43 trên trang video thực chưa được xác nhận end-to-end. UI native tùy biến/không expose accessibility sẽ báo lỗi rõ; không có fallback click mù hoặc hạ xuống 360p. Chỉ báo hoàn tất khi helper xác nhận file cuối và agent kiểm tra file/thư mục.
