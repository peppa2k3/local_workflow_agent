# Chất lượng cao nhất và tên file sạch

Yêu cầu: FPS cao trước, rồi độ phân giải/bitrate; bỏ ID trong tên cuối. Dùng yt-dlp sort không giới hạn chiều cao, giữ JSON người dùng. Tải vào staging riêng và publish file đã FFprobe xác nhận, trùng tên tăng số thay vì ghi đè. Kiểm chứng chọn format bằng executable thật với metadata giả lập và fixture download/merge cục bộ.

Hoàn thành 2026-10-20: npm test pass, gồm CLI/API hồi quy, yt-dlp sorting thật với metadata offline FPS/res/bitrate/fallback; download trực tiếp, merge DASH, FFprobe, file hỏng, publish tên Unicode/trùng đồng thời. node --check JavaScript thay đổi và script inline dashboard pass. URL BwV2BJ_yKVU chọn 1440×1920 30fps ở chế độ simulate, không tải toàn bộ. Giữ các JSON người dùng đã sửa ngoài commit.
