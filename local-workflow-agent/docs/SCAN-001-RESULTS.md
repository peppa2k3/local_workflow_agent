# Nghiệm thu SCAN-001 ngày 26/11/2026 (Asia/Bangkok)

Audit đã dùng yt-dlp cho cả bốn URL vì scanner đã hết ngân sách request Data API trong ngày. Ngưỡng local tại thời điểm đo là từ 200.000 lượt xem, tuổi 0–4 ngày, thời lượng từ 1.800 đến dưới 10.000 giây, cạnh ngắn từ 720 px. Cả bốn ID đều hợp lệ, có track tiếng Việt và đạt ngưỡng độ phân giải.

| URL | Chủ đề | Lượt xem | Tuổi (ngày) | Giây | Độ phân giải | Sub vi | Kết luận và lý do |
| --- | --- | ---: | ---: | ---: | --- | --- | --- |
| [JXfrtQlJGHM](https://www.youtube.com/watch?v=JXfrtQlJGHM&pp=ugUEEgJ2aQ%3D%3D) | Trượt | 1.873.603 đạt | 17,54 trượt | 5.097 đạt | 1080×1440 | Trượt | Loại do chủ đề, tuổi và phụ đề |
| [SBmmznojJ_s](https://www.youtube.com/watch?v=SBmmznojJ_s) | Trượt | 513.902 đạt | 14,41 trượt | 10.446 trượt | 1080×1440 | Đạt | Loại do chủ đề, tuổi và thời lượng |
| [zBEVoz3lKqI](https://www.youtube.com/watch?v=zBEVoz3lKqI) | Khớp “xuống núi” trong nhóm bi-coi-thuong | 642.918 đạt | 15,32 trượt | 9.528 đạt | 1080×1920 | Đạt | Loại do tuổi |
| [B1fAkGWQ8KE](https://youtu.be/B1fAkGWQ8KE?si=q2hpBBh3PkJbIM7y) | Trượt | 631.262 đạt | 3,62 đạt | 2.421 đạt | 1080×1920 | Trượt | Loại do chủ đề và phụ đề |

## Ca kiểm soát

`node tests/scanner.js` dùng API tìm kiếm giả lập và endpoint nhận qua HTTP loopback. Ca đạt với 1.000 view, tuổi một ngày, track và sub tiếng Việt được lưu rồi gửi. Sau mất ACK và mở lại SQLite, agent gửi cùng submission và nhận replayed. Bản duplicate bị loại khỏi danh sách sử dụng. Ca tiêu đề sai có lý do loại ở check keyword. Biên 239:59 đạt, 240:00 và 0 giây bị loại. URL watch và youtu.be trả cùng ID.

Kiểm thử tải riêng dùng video fixture một giây, phục vụ qua HTTP, chạy yt-dlp và FFmpeg/FFprobe thật. Tên file sau hậu xử lý là `Video tiếng Việt - Bé con và gia đình [abcdefghij0].mp4`. Bốn video thật đều bị loại trước bước tải.

[JSON UTF-8 của lượt đo](SCAN-001-results.json) gồm tiêu đề, ngày công khai, thời điểm đo và lý do từng phép kiểm tra.
