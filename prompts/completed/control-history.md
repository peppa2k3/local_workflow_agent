# Phân trang lịch sử điều khiển

Chọn một máy local có nhiều lệnh trong Control Server. Trước khi sửa, lịch sử hiển thị toàn bộ lệnh trong một danh sách dài.

Lịch sử hiển thị tối đa 8 lệnh mỗi trang, sắp theo thời điểm tạo từ mới đến cũ. Giao diện giữ trang riêng cho từng máy trong phiên đăng nhập và dùng nhãn màu để phân biệt trạng thái. Mỗi thẻ hiển thị scenario, profile và các mốc thời gian có dữ liệu.

Đã kiểm tra bằng `node tests/remote-web.js` với 19 lệnh trên một máy, máy thứ hai có lịch sử trống, thông báo kết quả ngoài trang đang xem và chiều rộng 320, 390, 1280 px.
