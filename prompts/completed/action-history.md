# Lịch sử tác vụ và tái sử dụng download

Ngày: 2026-10-22. Trạng thái: hoàn thành.

- Hiện trạng: lịch sử chỉ ở RAM; download cùng URL tạo thêm file mỗi lần.
- Yêu cầu: lưu từng step và vị trí dừng qua restart; metadata asset/file/page/publication theo blueprint; lưu thời gian upload riêng với thời gian xuất bản.
- Giải pháp: kho local bền vững, cache URL kiểm tra SHA-256, khóa download theo URL; outbox MongoDB tùy chọn; dashboard đọc lịch sử.
- Kiểm chứng: fixture local, HTTP/CLI và Chrome tách biệt; không chạy profile đăng nhập.
- Kết quả: lưu đầy đủ 6 bước/điểm dừng, giữ qua restart; URL cũ dùng file đúng hash mà không truy cập nguồn. Đã cập nhật agent, extension 4.1.0, dashboard và tài liệu. MongoDB tùy chọn kiểm tra qua adapter; chưa có URI để kiểm tra database thật.
