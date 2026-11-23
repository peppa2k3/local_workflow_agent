# Nghiệm thu SCAN-001 ngày 24/11/2026 (Asia/Bangkok)

Đã chạy lệnh audit với cả bốn URL gốc. Thiếu `YOUTUBE_API_KEY`, `minViews`, `minDays` và `maxDays`. Số đo dưới đây lấy từ yt-dlp lúc 01:46 giờ Bangkok, dùng các nhóm từ mẫu `gia-dinh` và `xuyen-khong`. Ký hiệu **?** là đã đo được giá trị nhưng chưa có ngưỡng để kết luận.

| URL / kiểm tra ID | Khớp tiêu đề | View | Tuổi ngày | Thời lượng giây | Độ phân giải tải được | Audio vi | Sub vi thủ công hoặc tự động | Kết luận |
| --- | --- | ---: | ---: | --- | --- | --- | --- | --- |
| [JXfrtQlJGHM](https://www.youtube.com/watch?v=JXfrtQlJGHM&pp=ugUEEgJ2aQ%3D%3D) đạt | Loại | 1.728.990 (?) | 14,64 (?) | 5.097 đạt | 1080×1440 đạt | Đạt | Loại | Loại do tiêu đề và sub |
| [SBmmznojJ_s](https://www.youtube.com/watch?v=SBmmznojJ_s) đạt | Loại | 459.453 (?) | 11,50 (?) | 10.446 đạt | 1080×1440 đạt | Đạt | Đạt | Loại do tiêu đề |
| [zBEVoz3lKqI](https://www.youtube.com/watch?v=zBEVoz3lKqI) đạt | Loại | 429.143 (?) | 12,41 (?) | 9.528 đạt | 1080×1920 đạt | Đạt | Đạt | Loại do tiêu đề |
| [B1fAkGWQ8KE](https://youtu.be/B1fAkGWQ8KE?si=q2hpBBh3PkJbIM7y) đạt | Loại | 153.693 (?) | 0,72 (?) | 2.421 đạt | 1080×1920 đạt | Đạt | Loại | Loại do tiêu đề và sub |

Hai tiêu đề tiếng Việt có cụm “bé gái”. File mẫu dùng “bé con”, nên cả hai trượt kiểm tra khớp cụm. Hai video còn lại có tựa tiếng Anh và tiếng Thái. Âm thanh được đánh giá theo nhãn track tải được của YouTube.

## Ca kiểm soát

`node tests/scanner.js` dùng API tìm kiếm giả lập và endpoint nhận qua HTTP loopback. Ca đạt với 1.000 view, tuổi một ngày, track và sub tiếng Việt được lưu rồi gửi. Sau mất ACK và mở lại SQLite, agent gửi cùng submission và nhận replayed. Bản duplicate bị loại khỏi danh sách sử dụng. Ca tiêu đề sai có lý do loại ở check keyword. Biên 239:59 đạt, 240:00 và 0 giây bị loại. URL watch và youtu.be trả cùng ID.

Kiểm thử tải riêng dùng video fixture một giây, phục vụ qua HTTP, chạy yt-dlp và FFmpeg/FFprobe thật. Tên file sau hậu xử lý là `Video tiếng Việt - Bé con và gia đình [abcdefghij0].mp4`. Bốn video thật đều bị loại trước bước tải.

[JSON UTF-8 của lượt đo](SCAN-001-results.json) gồm tiêu đề, ngày công khai, thời điểm đo và lý do từng phép kiểm tra.
