# Thu gọn bước trên dashboard

Yêu cầu: các phần tử giao diện gọn hơn; mỗi step mặc định chỉ hiện tên, action
và các nút di chuyển/xóa, có nút mở toàn bộ nội dung.

Triển khai: thay bố cục step, tách phần đầu và phần chi tiết; trạng thái mở/thu
chỉ lưu trong giao diện và đi theo step khi đổi thứ tự. Step mới mở sẵn.
Giữ tương thích JSON/action/selector cũ.

Kiểm chứng: fixture Chrome tách biệt trên desktop/mobile, thao tác mở/thu,
đổi action, đổi thứ tự, xóa, lưu JSON; `npm test`, `node --check`, diff check.

Trạng thái: hoàn thành (2026-11-10). `npm test` đầy đủ đạt; kiểm tra bố cục
1100/390/320px và nội dung JSON qua fixture Chrome tách biệt.
