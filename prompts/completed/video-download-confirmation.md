# Xác nhận tải video theo URL

Chạy kịch bản có bước `downloadVideo` từ dashboard local hoặc control-server. Agent hiện chạy bước tải ngay sau kiểm tra lịch sử, nên người vận hành chưa thấy tên file và đường dẫn trước khi tải.

Hiển thị tên và đường dẫn trước khi tải. Yes tiếp tục, No dừng lượt chạy, hết 30 giây mặc định Yes. Các bước sau chờ agent xác minh file. Kiểm tra bằng video fixture và control-server cục bộ.

Dashboard local và control-server hiển thị cùng tên file, đường dẫn và hạn xác nhận. Control-server gửi quyết định theo ID của lượt chạy và hộp thoại. Agent cho phép thêm tối đa 4 giây để nhận quyết định remote đã gửi đúng hạn.

Kiểm thử với Chrome riêng, control-server cục bộ và nguồn video HTTP loopback. Agent thật dừng trước khi tạo file khi chọn No, xác minh video rồi chạy bước sau khi chọn Yes. Bộ test cũng kiểm tra tự động tải sau 30 giây, cache đã xác minh, tên trùng, tải DASH và quyết định remote cũ hoặc quá hạn.

`npm test` và `node --check` cho JavaScript đã sửa đều đạt.
