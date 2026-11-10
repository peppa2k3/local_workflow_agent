# Click thành công nhưng chờ DOM gây timeout

Ví dụ step 7 trong downl-up-khoahocgia: click Tiếp, nút vẫn còn và completion
chỉ có state/locatorType, chưa có locator. Worker vẫn chờ DOM toàn trang yên
350ms nên video/progress cập nhật có thể làm timeout dù click đã thực hiện.

Sửa default click settleMs=0 trong prepare và worker, giữ chờ page navigation
và completion thực. Bỏ completion trống trên bản chuẩn bị, không ghi đè JSON.
Cập nhật dashboard/docs, thông báo timeout DOM chính xác, test nút còn nguyên
với DOM biến động liên tục, hai click liên tiếp, completion và navigation.

Yêu cầu bổ sung: step 10 type mô tả lỗi not-found. Index 1 có thể không còn
sau khi duplicate bị ẩn hoặc dialog ưu tiên chỉ còn một wrapper/editor. Cho
type phục hồi index chỉ khi kết quả ngữ nghĩa có đúng một editor, tìm lại editor
thay thế sau click và hỗ trợ textbox contenteditable không có role tường minh.
Test trường hợp nhiều editor phải từ chối, không nhập nhầm ô focus trước đó.

Trạng thái: hoàn tất. `npm test`, `npm run test:extension` và `node --check` cho JavaScript thay đổi đều pass. Đã đóng gói extension 4.2.2 và đối chiếu nội dung ZIP với source. Không chạy scenario Facebook/profile đăng nhập.
