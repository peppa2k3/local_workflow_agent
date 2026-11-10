# Dọn source sau refactor

Vấn đề: `control-web/`, `dashboard/` và `src/` ở gốc còn thư mục rỗng.
`legacy/facebook-feed.js` là thử nghiệm Playwright cũ, không được runtime/test
sử dụng. `SCENARIOS.md` ở gốc chỉ chuyển hướng; `guildes.md` là hướng dẫn CLI
còn hữu ích nhưng đặt sai vị trí.

Kết quả mong muốn: xóa thư mục rỗng, mã thử nghiệm và trang chuyển hướng;
chuyển hướng dẫn CLI sang `docs/CLI.md`, cập nhật link và cấu trúc tài liệu.
Giữ entry runtime, extension, JSON kịch bản và dữ liệu máy người dùng.

Kiểm chứng: rà tham chiếu, `npm test`, diff check, Git status.
Trạng thái: hoàn thành (2026-11-10). `npm test`, kiểm tra tham chiếu còn lại,
`node --check` hai entry JS và diff check đạt. Các kịch bản đang sửa được giữ
ngoài commit.
