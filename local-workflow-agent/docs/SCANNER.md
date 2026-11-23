# Chạy Scanner YouTube trên Windows

1. Dùng Node 22.13+ hoặc Node 24. Trong thư mục repo chạy `npm ci` rồi `npm run setup:video` để cài yt-dlp, FFmpeg và FFprobe.
2. Bật YouTube Data API v3 trong Google Cloud và đặt `YOUTUBE_API_KEY=...` trong file `.env` của local agent (hoặc biến môi trường của tiến trình). Giới hạn key cho YouTube Data API v3.
3. Chạy `node local-agent.js --daemon`. Mở [Scan YouTube](http://127.0.0.1:34719/scanner). Trang hiển thị đường dẫn thư mục scanner thực tế bên dưới data của agent. Scanner mặc định tắt. Agent phải tiếp tục hoạt động để quét; xem phần khởi động cùng Windows trong [hướng dẫn thiết lập](SETUP.md).
4. Trong thư mục đó, sửa `config.json` và `keywords.txt` bằng UTF-8. Mỗi lượt đọc lại hai file. Cấu hình ban đầu để trống ba ngưỡng cần người vận hành chọn. Ví dụ dưới đây dùng 10.000 view, từ 0 đến 30 ngày tuổi và cạnh ngắn tối thiểu 720 px.

```json
{
  "minutes": 30,
  "requestsPerDay": 80,
  "minViews": 10000,
  "minDays": 0,
  "maxDays": 30,
  "minResolution": 720,
  "subtitleLanguages": ["vi"],
  "subtitleKinds": ["subtitles", "automatic_captions"]
}
```

`subtitles` là phụ đề thủ công, `automatic_captions` là phụ đề tự động. Chỉ cần khớp một ngôn ngữ và một loại đã chọn. Scanner bỏ track dịch máy qua tham số `tlang`. Điều kiện âm thanh độc lập và yêu cầu có format tiếng Việt tải được. Tuổi dựa trên thời điểm công khai, hai đầu khoảng được tính. Thời lượng phải lớn hơn 0 và nhỏ hơn 4 giờ.

Ví dụ file từ khóa:

```text
[gia-dinh]
bé con
được giúp đỡ
gia đình

[xuyen-khong]
xuyên không
```

Mã nhóm ổn định được lưu trong `type_topic`. Mỗi dòng ngắn là một cụm gợi ý. Với tiêu đề dài hơn năm từ, scanner rút các cặp từ liền nhau và bỏ cặp chứa từ phổ biến. Trang Scan hiển thị danh sách hiệu lực. Muốn kiểm soát chính xác, thay dòng tiêu đề bằng các cụm muốn giữ. Khớp tiêu đề theo ranh giới từ sau chuẩn hóa Unicode. Nhóm khớp nhiều cụm nhất được chọn; nếu bằng nhau, chọn theo mã nhóm. Tất cả cụm khớp được lưu trong kết quả kiểm tra.

5. Bấm **Bật quét**. Mỗi chu kỳ xử lý tối đa 25 ID. Khi hết ứng viên chờ, scanner tìm bằng cụm kế tiếp. Request được trừ vào ngân sách trước khi gửi, cả khi lỗi. Bộ đếm lưu trên máy và đổi ngày theo giờ Thái Bình Dương. Tổng ngân sách scanner giới hạn 100 request/ngày/máy. Nếu dùng chung một dự án Google Cloud cho nhiều máy hoặc ứng dụng, chia ngân sách theo quota thực tế. [Quota chính thức của YouTube](https://developers.google.com/youtube/v3/determine_quota_cost).
6. Bấm **Tắt quét** để dừng nhận lượt mới. Máy lưu ID đang chờ, vị trí trong danh sách cụm từ, kết quả kiểm tra và trạng thái bật/tắt trong `scanner.sqlite`. Lượt chưa đủ dữ liệu được xét lại sau 24 giờ. Hàng đợi gửi tiếp tục thử ngay cả khi tắt quét.
7. Ghép máy với Control Server trong mục **Remote Control**. Agent POST đến `/api/scanner/videos` bằng device Bearer token và trường `id` của máy ghép nối. Bản ghi đạt và hàng đợi nằm trong cùng lần ghi SQLite. Lỗi mạng giữ trạng thái `pending` và thử lại với cùng `submission_id` sau 5 giây, tăng dần tới 1 giờ. Server trả `{"status":"accepted"}` hoặc `replayed` sẽ mở nút **Tải clip**. Với `duplicate`, local chỉ giữ ID chống quét lại. SCAN-001 đã kiểm thử với server giả lập; endpoint triển khai thật thuộc LISTEN-LOCAL-001.
8. Trong danh sách kết quả, **Xuất kho JSON** tải file UTF-8 chứa toàn bộ clip đạt đang chờ gửi hoặc đã đồng bộ. **Copy URL** và **Copy JSON** áp dụng cho từng clip. **Tải clip** lưu vào thư mục `videos` của scanner và hiển thị đường dẫn sau hậu xử lý. Tên gồm tiền tố tiếng Việt, tiêu đề đã kiểm tra và video ID. Bộ tải chỉ chọn track tiếng Việt, kiểm tra file qua FFprobe trước khi xuất bản.

## Kiểm tra URL và lưu báo cáo

Từ PowerShell ở thư mục repo:

```powershell
node local-workflow-agent/scripts/scanner-audit.js 'https://youtu.be/SBmmznojJ_s' | Out-File -Encoding utf8 scanner-report.json
node tests/scanner.js
```

Audit dùng cùng bộ kiểm tra và cấu hình local. Nếu Data API thiếu key hoặc thiếu bản ghi, audit thử đo trực tiếp URL bằng yt-dlp. Lệnh chỉ xuất báo cáo; nó không thêm clip vào kho. Đọc [kết quả nghiệm thu bốn URL](SCAN-001-RESULTS.md).
