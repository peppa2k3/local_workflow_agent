# Tạm dừng khi download/upload trùng

Yêu cầu: kiểm tra URL download và filepath/filename upload trong local cùng database quản lý nội dung; tạm dừng và hiển thị popup xác nhận, hiển thị lỗi trên UI.

Triển khai: guard trước thao tác, kiểm tra thêm SHA-256, khóa thao tác media trong một agent đến khi có kết quả; database đã cấu hình nhưng lỗi thì dừng. Download được xác nhận dùng cache đã kiểm tra hash; cache không hợp lệ được tải lại. Upload chỉ gửi sau đồng ý rõ ràng. Ghi pending trước dispatch, cập nhật uploaded sau acknowledgement; pending chưa rõ kết quả vẫn cảnh báo trùng ở lần sau. Popup cho ba trang local và lỗi/thông báo trên VPS; quyền xác nhận nằm ở dashboard local.

Hoàn thành: fixture local/DB, URL chuẩn hóa, filename, lỗi DB, xác nhận cũ, hủy/tiếp tục, tuần tự hóa và Chrome popup với dữ liệu giả đạt. Npm test đầy đủ, node --check các JavaScript thay đổi và git diff --check đạt. Kiểm tra bổ sung Mongo upload pending → uploaded và content UI đạt. Không upload website hoặc ghi thử MongoDB thật.
