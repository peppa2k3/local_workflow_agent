# API và CLI chạy kịch bản — 2026-10-20

Yêu cầu: chạy kịch bản đã lưu qua API/CLI, chọn profile, ghi đè biến riêng từng lượt, theo dõi kết quả và bảo vệ API.

Bằng chứng: POST /api/run hiện chỉ nhận name/profile/uploadPath, không trả runId; stop đổi runId nên không thể theo dõi lượt cũ. Chưa có CLI độc lập hoặc xác thực cho tích hợp.

Hoàn tất: API versioned với Bearer token, validation, lịch sử lượt có giới hạn trong RAM; CLI JSON/wait/exit codes; mã phiên dashboard riêng; kiểm thử fixture độc lập và tài liệu.

Kiểm chứng: npm test đạt toàn bộ, bao gồm API/CLI, Chrome riêng khi bật token, pipeline tải/upload, yt-dlp + FFmpeg/FFprobe thật trên HTTP fixture, dashboard, navigation và file picker. node --check đạt mọi JavaScript thay đổi; script dashboard được kiểm tra bằng vm.Script; git diff --check đạt. Không chạy trên profile đăng nhập của người dùng.

Giới hạn: chỉ loopback/local trust, 200 lượt và 200 khóa idempotency trong RAM, không bền qua restart. Kịch bản trình duyệt cần profile/extension đã cấu hình và kết nối.
