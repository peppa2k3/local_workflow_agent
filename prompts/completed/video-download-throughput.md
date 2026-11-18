# Tốc độ tải video

- Tái hiện: chạy bước `downloadVideo`; người dùng báo tốc độ khoảng 30 Mb/s trên đường truyền 200 Mb/s.
- Mục tiêu: tải nhiều đoạn đồng thời với giới hạn cấu hình được, giữ kiểm tra file và xử lý lỗi thiếu đoạn.
- Bằng chứng ban đầu: agent không truyền `--concurrent-fragments` cho yt-dlp.
- Kết quả: mặc định 4 đoạn đồng thời, cấu hình từ 1 đến 8; dừng nếu yt-dlp vẫn báo thiếu đoạn sau khi thử lại.
- Kiểm tra: `node --check` pass; `node tests/video-download.js` pass với tải DASH song song trên HTTP loopback, ghép và kiểm tra video/audio. `npm test` dừng ở bước đợi agent khởi động trong `tests/project-layout.js:36`.
- Trạng thái: hoàn tất; chưa đo tốc độ trên nguồn của người dùng.
