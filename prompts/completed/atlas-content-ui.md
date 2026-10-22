# MongoDB Atlas, .env và giao diện dữ liệu dùng chung

Ngày: 2026-10-22. Trạng thái: mã và giao diện đã triển khai, kiểm chứng local; Atlas thật chờ URI của người dùng.

- Hiện trạng: agent chỉ nhận biến môi trường của process; chưa tự đọc .env. Dashboard chỉ có lịch sử local, chưa truy vấn catalog dùng chung hoặc quản lý page/publication.
- Mong muốn: đọc MONGODB_URI từ .env, database team_content, kết nối Atlas; quản lý dữ liệu download/upload và các page chung với Content Manager bằng giao diện web local.
- Phạm vi: nạp cấu hình trước server/CLI, bảo vệ URI; trạng thái/ping/sync, API dữ liệu phân trang/tìm kiếm, quản lý page/publication, chọn page có sẵn trong bước upload. Giữ cache file, selector cũ và các điểm vào.
- Kiểm chứng: adapter database + HTTP/UI fixture; kiểm tra Atlas thật khi người dùng đã điền URI local. Không dùng Chrome profile đăng nhập.
- Kết quả: .env được nạp trước CLI/server, trang /content quản lý catalog và metadata, picker page chung, remap UUID/quan hệ, downloads đồng bộ. Test desktop/mobile và preflight đã đạt. File .env local đã tạo với database team_content, URI còn rỗng; chưa thể xác nhận cluster thật.
