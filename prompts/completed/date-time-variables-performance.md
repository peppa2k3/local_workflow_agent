# Ngày giờ, biến, profile và clone kịch bản

Yêu cầu ngày 2026-10-18: thêm click/nhập ngày tháng năm và giờ phút; quản lý biến ở navbar và tham chiếu trong input; kiểm tra hiệu suất/upload chậm; chọn profile + kịch bản để chạy đúng lựa chọn; clone kịch bản.

Bằng chứng ban đầu: scenarioSelect không có change handler, Run lưu/chạy fileName của editor cũ. Picker không khóa thao tác khi chờ, có thể mở nhiều hộp thoại. Mỗi input debugger đều gọi getTargets và kiểm tra state qua HTTP; upload có vòng chờ và độ trễ cố định.

Trạng thái: hoàn thành. Đã triển khai setDate/setTime; navbar biến và tham chiếu dynamic; dropdown tự load đúng kịch bản; clone giữ steps/variables, chống ghi đè; telemetry agent/thời gian bước; chống picker trùng, foreground dialog, timeout/poll không chồng và tái sử dụng debugger.

Kiểm chứng: `npm test` thành công, bao gồm Chrome tách biệt với native/text date, time, sự kiện input/change, min/readonly, CDP file chooser và direct file input thật; dashboard chọn Profile 2 + kịch bản khác, sửa biến, clone, trạng thái picker. `node --check` thành công cho JavaScript thay đổi và script inline dashboard; `git diff --check` sạch. Đã xem ảnh dashboard tại desktop. Test picker kiểm tra lựa chọn/hủy và cờ ẩn console qua process giả; hộp thoại Windows foreground chưa được thao tác thủ công. Không dùng Chrome profile đã đăng nhập và không sửa/commit hai file scenario người dùng đang làm.
