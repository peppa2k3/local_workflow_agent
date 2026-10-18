# Nhập chữ có focus và giá trị biến lúc chạy

Yêu cầu: click vào vùng nhập, xác nhận con trỏ trước khi gõ; tham chiếu `{{tenphimn}}` phải nhập giá trị biến lúc chạy và giữ template trong JSON.

Bằng chứng: kịch bản thực tế chọn `role=presentation`, index 1 cho vùng mô tả; type hiện chỉ click giữa locator, xóa value trên input và gửi Input.insertText, chưa tìm contenteditable bên trong, xác nhận focus/caret hay xóa nội dung rich text. Agent hiện tại đã resolve biến trong prepare; cần kiểm tra đường chạy HTTP thực và ngăn phiên agent/extension cũ nhập nguyên placeholder.

Nguyên nhân phiên chạy: GET /api/profiles tại cổng 34719 chỉ trả defaultProfile/profiles, không có performance của commit trước. Node process cũ vẫn phục vụ dashboard mới đọc từ ổ đĩa, nên chưa có resolver biến mới.

Trạng thái: hoàn thành. Type tìm input/textarea/contenteditable bên trong wrapper hoặc editor mở sau click, click/focus/caret rồi nhập; clear rich text qua keyboard editing, append khi clear=false. Dashboard phát hiện agent cũ và hướng dẫn restart; extension chặn token chưa resolve trước khi xóa/nhập. Không sửa các JSON người dùng đang làm.

Kiểm chứng: npm test pass toàn bộ; node --check cho mọi JS thay đổi và script inline dashboard pass; git diff --check sạch. Test Chrome tách biệt bao phủ presentation index 1, rich text, cursor, trusted input events, xóa/append, textarea nhiều dòng, editor xuất hiện sau click, readonly/non-editable và token chưa resolve. Test HTTP xác nhận template giữ nguyên, giá trị thay đổi ở lần chạy sau, biến thiếu dừng trước dispatch. Test dashboard chọn tenphimn từ navbar -> lưu template -> resolve -> nhập giá trị thật, cùng thông báo agent cũ. Không dùng Chrome profile người dùng để chạy test.
