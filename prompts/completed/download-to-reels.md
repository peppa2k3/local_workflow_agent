# Download → upload Reels

Nối kết quả download vào upload/type, chặn tới khi file cuối hoàn tất và FFprobe xác nhận video. Thêm xóa kịch bản, tên bước có fallback Bước N, mẫu Reels. Giữ thay đổi người dùng trong video-download.json và idm-video-2.json. Kiểm thử local, không dùng profile đăng nhập.


Đã hoàn thành: runtime references và alias; gate exit/after_move/stat/FFprobe, status verified; mẫu Reels 7 bước dừng trước Đăng; tên bước và xóa scenario qua UI/API. API từ chối xóa scenario đang chạy. Giữ thay đổi người dùng ở video-download.json ngoài commit.

Kiểm chứng: npm test pass; node --check JavaScript thay đổi và script inline dashboard; fixture thật yt-dlp/FFmpeg/FFprobe gồm file hỏng bị từ chối, ghép DASH; Chrome riêng kiểm tra extension/CDP upload sau gate, điền title; UI lưu tên/fallback và xóa/hủy. Chưa xác nhận luồng Facebook thực trên profile đăng nhập.
