# Remote control — dev/remote

Mục tiêu: VPS phục vụ tài khoản/web; agent local chủ động kết nối HTTPS ra ngoài,
ghép nối có sự đồng ý của cả tài khoản và người đang sử dụng máy local. Giữ nguyên
dashboard 34719, extension, JSON scenario và các action hiện tại.

Thực hiện tuần tự, mỗi task một commit; chuyển prompt sang processing rồi completed.

1. `remote-01-core.md`: giao thức, lưu trữ bền vững, kết nối outbound.
2. `remote-02-pairing.md`: đăng nhập, session, xác nhận ghép nối hai phía.
3. `remote-03-execution.md`: hàng đợi, chạy/dừng, chống thực hiện lại sau reconnect.
4. `remote-04-web.md`: UI tài khoản, thiết bị, kịch bản, tiến độ và lịch sử.
5. `remote-05-operations.md`: daemon 24/24, triển khai VPS, tự khởi động Windows.

Ranh giới: chỉ chạy scenario đã lưu và profile được local cấp quyền; không shell,
không sửa file từ xa, không public cổng 34719, không đưa URI Mongo/đường dẫn file
lên VPS. VPS dùng SQLite riêng cho tài khoản và điều khiển, không thay content DB.
Mất mạng tự reconnect; job đã chạy không tự chạy lại. Thu hồi quyền dừng job remote.

Kiểm chứng: test logic/HTTP bằng fixture riêng; bỏ qua triển khai VPS, đăng nhập
Chrome/Facebook, ghép thiết bị thật và cài task Windows theo yêu cầu người dùng.
