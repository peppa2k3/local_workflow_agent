# Remote control — dev/remote

Mục tiêu: VPS phục vụ tài khoản/web; agent local chủ động kết nối HTTPS ra ngoài,
ghép nối có sự đồng ý của cả tài khoản và người đang sử dụng máy local. Giữ nguyên
dashboard 34719, extension, JSON scenario và các action hiện tại.

Thực hiện tuần tự, mỗi task một commit; chuyển prompt sang processing rồi completed.

1. [Core — hoàn tất](../completed/remote-01-core.md): giao thức, lưu trữ bền vững, outbound.
2. [Pairing — hoàn tất](../completed/remote-02-pairing.md): đăng nhập và ghép nối hai phía.
3. [Execution — hoàn tất](../completed/remote-03-execution.md): queue, chạy/dừng, chống replay.
4. [Web — hoàn tất](../completed/remote-04-web.md): UI, trạng thái và lịch sử.
5. [Operations — hoàn tất](../completed/remote-05-operations.md): daemon, deploy, startup.

Ranh giới: chỉ chạy scenario đã lưu và profile được local cấp quyền; không shell,
không sửa file từ xa, không public cổng 34719, không đưa URI Mongo/đường dẫn file
lên VPS. VPS dùng SQLite riêng cho tài khoản và điều khiển, không thay content DB.
Mất mạng tự reconnect; job đã chạy không tự chạy lại. Thu hồi quyền dừng job remote.

Kiểm chứng: test logic/HTTP bằng fixture riêng; bỏ qua triển khai VPS, đăng nhập
Chrome/Facebook, ghép thiết bị thật và cài task Windows theo yêu cầu người dùng.
