# Ngôn ngữ và độ phân giải tải video

Yêu cầu: dropdown ngôn ngữ audio và độ phân giải, mặc định vi/1080.
Thay selection cố định bằng lựa chọn theo bước; ưu tiên ngôn ngữ có sẵn,
fallback nguồn khi thiếu, độ phân giải theo cạnh ngắn, không upscale.
Cache chỉ tái sử dụng khi tùy chọn khớp. Kiểm thử yt-dlp thật bằng metadata
fixture và video HTTP local; không dùng Chrome đăng nhập.

Hoàn tất: toàn bộ npm test pass, gồm yt-dlp/FFmpeg thật và dashboard trên Chrome riêng. Kiểm tra cú pháp JavaScript, script dashboard và git diff --check pass. Không thay đổi JSON riêng của người dùng hoặc cài đặt Chrome.
