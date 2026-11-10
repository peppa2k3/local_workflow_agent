# Extension Options không tải được Chrome profile khi API token bật

Lỗi báo: `Valid Bearer token or dashboard session required` khi mở kết nối
profile. Options dùng GET /api/profiles nhưng server chỉ miễn token nếu có
Origin extension; GET có thể không gửi Origin.

Sửa: Options discovery bằng POST JSON để Chrome gửi Origin; server chấp nhận
POST chỉ đọc profile trong cùng phạm vi xác thực hiện có. Không đưa API token
vào extension hoặc bỏ xác thực API/dashboard. Báo lỗi/restart rõ ràng.

Kiểm chứng: API với token bật, request thiếu Origin bị chặn, website không được
discovery, Options tải/lưu/switch profile trên trình duyệt extension tách biệt;
npm test, node --check. Tăng version và đóng ZIP mới để người dùng cài lại.

Trạng thái: hoàn thành (2026-11-10). Extension thật tái hiện GET 401/POST 200,
test tải/lưu/switch và khóa profile đang chạy đạt; npm test và node --check đạt.
Đã đóng ZIP 4.2.1, kiểm tra khớp source. Chưa restart engine thật/publish store.
