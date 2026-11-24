# Chạy project trên máy local

## 1. Chuẩn bị Windows

Cài Node.js 24, Git và Chrome 120 trở lên. Mở PowerShell và chạy các lệnh sau cho lần cài đầu. Nếu đã có checkout, mở thư mục `local-workflow-agent` hiện có rồi bắt đầu từ `npm ci`.

```powershell
git clone https://github.com/peppa2k3/local_workflow_agent.git
cd local_workflow_agent/local-workflow-agent
npm ci --omit=dev
if (!(Test-Path .env)) { Copy-Item .env.example .env }
```

## 2. Cấu hình tính năng cần dùng

Mặc định trong `.env` đủ để chạy thử qua dashboard. Chọn `CHROME_PROFILE` theo tên thư mục cuối của **Profile Path** ở `chrome://version` (ví dụ `Default`).

| Tính năng | Giá trị trong `local-workflow-agent/.env` |
| --- | --- |
| Điều khiển từ CLI/API | Tạo token bằng `node -p "require('node:crypto').randomBytes(32).toString('hex')"`. Đặt vào `LOCAL_AGENT_API_TOKEN` của agent và client. |
| Đồng bộ nội dung bằng Atlas | Trong Atlas, tạo database user, cho phép IP máy local, lấy URI tại **Connect → Drivers**, điền `MONGODB_URI` và `MONGODB_DATABASE=team_content`. Kiểm tra bằng `npm run check:mongo`. [Atlas](https://cloud.mongodb.com/) |
| Scanner YouTube | Bật API cho dự án Google Cloud, tạo API key, giới hạn key cho YouTube Data API v3 và đặt vào `YOUTUBE_API_KEY`. [Bật API](https://console.cloud.google.com/apis/library/youtube.googleapis.com) · [Tạo key](https://console.cloud.google.com/apis/credentials) |

## 3. Cài công cụ video và chạy agent

```powershell
npm run setup:video
npm start
```

Giữ terminal mở và truy cập [dashboard local](http://127.0.0.1:34719). Script cài yt-dlp, FFmpeg và FFprobe vào `tools/`. Máy dùng executable riêng có thể đặt `YTDLP_PATH`, `FFMPEG_PATH`, `FFPROBE_PATH` trong `.env`. Khởi động lại agent sau khi sửa cấu hình. Có thể chạy từ gốc repo bằng `node local-agent.js`.

## 4. Kết nối Chrome cho các bước thao tác web

Trong từng profile cần điều khiển, mở `chrome://extensions` → **Developer mode → Load unpacked** và chọn thư mục `chrome-reels-extension/` ngang cấp với `local-workflow-agent/`. Mở **Extension options**, chọn đúng thư mục profile, bấm **Lưu kết nối**. Trở lại dashboard và kiểm tra profile báo **đã kết nối**. Khi cập nhật extension, bấm **Reload** rồi tải lại tab đích.

## 5. Chạy thử và xác nhận kết quả

Chọn `starter-video-download` (checkout cũ có thể dùng `video-download`), đặt `video_url` và đường dẫn tuyệt đối `thu_muc_tai`, ví dụ `D:\Videos`. Bấm **Lưu**, chọn profile và **Chạy kịch bản**. Khi thành công, mở file tại đường dẫn kết quả. Kịch bản chỉ tải video có thể chạy ngay từ bước 3.

## 6. Ghép VPS nếu cần điều khiển từ xa

Sau khi có tài khoản server, mở [Remote Control local](http://127.0.0.1:34719/remote), nhập URL HTTPS của VPS, chọn profile, scenario và biến được phép, rồi tạo mã. Đăng nhập web VPS, nhập mã ghép, quay lại local xác nhận tài khoản. Chọn thiết bị trên VPS và kiểm tra trạng thái **Online**.

Để agent tiếp tục nhận lệnh, chạy `npm run start:daemon` thay cho `npm start`. Nếu cần khởi động cùng Windows, chạy `npm run install:startup` trong thư mục app. [Tra cứu vận hành local](local-workflow-agent/README.md)
