# Chạy kịch bản bằng CLI

## 1. Khởi động agent

Mở PowerShell tại thư mục dự án:

```powershell
node .\index.js
```

Agent chạy tại `http://127.0.0.1:34719`. CLI cần một terminal khác và cần
`LOCAL_AGENT_API_TOKEN` giống với token của agent:

```powershell
$env:LOCAL_AGENT_API_TOKEN = 'token-32-ky-tu-tro-len'
```

`node .\index.js` tự nạp biến từ file `.env` ở thư mục dự án. Vì vậy,
nếu token đã được lưu trong `.env`, không cần chạy lại lệnh `$env:` ở terminal
CLI; chỉ cần khởi động lại agent sau khi thêm hoặc đổi token.

Nếu agent cũng dùng API token, đặt biến trước khi khởi động agent:

```powershell
$env:LOCAL_AGENT_API_TOKEN = 'token-32-ky-tu-tro-len'
node .\index.js --daemon
```

Nếu chưa có token, tạo một token mới trong `.env` bằng PowerShell:

```powershell
$token = node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
Add-Content .\.env "`nLOCAL_AGENT_API_TOKEN=$token"
node .\index.js --daemon
```

## 2. Xem profile và kịch bản

```powershell
node .\index.js profiles
node .\index.js scenarios
node .\index.js describe --scenario download-upload-reels-liliphim
```

`--profile` là tên thư mục Chrome, ví dụ `Default` hoặc `Profile 1`, không
phải tên hiển thị. `--scenario` là tên file trong `scenarios\` nhưng bỏ phần
`.json`.

## 3. Chạy một kịch bản

```powershell
node .\index.js run `
  --scenario download-upload-reels-liliphim `
  --profile "Profile 1" `
  --wait
```

Profile phải có Chrome đang mở và extension đã được cài/kết nối đúng profile.
Kịch bản chỉ gồm `wait`, `openFolder` hoặc `downloadVideo` không cần extension.

## 4. Truyền hoặc ghi đè biến

Truyền từng biến bằng `--var name=value`:

```powershell
node .\index.js run `
  --scenario video-download `
  --profile "Profile 1" `
  --var "video_url=https://www.youtube.com/watch?v=VIDEO_ID" `
  --var "thu_muc_tai=D:\Videos" `
  --wait
```

Có thể truyền nhiều biến qua file JSON:

```json
{
  "video_url": "https://www.youtube.com/watch?v=VIDEO_ID",
  "thu_muc_tai": "D:\\Videos",
  "cho_ms": 1000,
  "xoa_noi_dung_cu": true
}
```

```powershell
node .\index.js run `
  --scenario video-download `
  --profile "Profile 1" `
  --variables-file .\run-values.json `
  --wait
```

Nếu trùng tên, thứ tự ưu tiên là:

1. Biến mặc định trong scenario.
2. Biến từ `--variables-file`.
3. Biến truyền bằng `--var` (ưu tiên cao nhất).

`--var` luôn nhận giá trị dạng chuỗi; file JSON giữ được kiểu số và boolean.
Giá trị có dấu `=` được giữ nguyên phần sau dấu `=`:

```powershell
--var "caption=Tiêu đề = bản thử nghiệm"
```

Biến trong scenario được tham chiếu bằng `{{ten_bien}}`. Giá trị chỉ áp dụng
cho lượt chạy hiện tại, không sửa file scenario.

## 5. Upload file ghi đè theo lượt chạy

```powershell
node .\index.js run `
  --scenario facebook-reels-liliphim `
  --profile "Profile 1" `
  --upload "D:\Videos\clip.mp4" `
  --var "tenphim=Tên phim mới" `
  --wait
```

`--upload` có ưu tiên hơn đường dẫn upload lưu trong scenario. Không dùng
`--upload` nếu scenario cần dùng biến runtime như `{{download_file_path}}` để
upload chính file vừa tải.

## 6. Theo dõi hoặc dừng lượt chạy

Không có `--wait`, CLI trả về `runId` ngay:

```powershell
node .\index.js run --scenario video-download --profile "Profile 1"
node .\index.js status --run-id RUN_ID
node .\index.js stop --run-id RUN_ID
```

Nên dùng `--wait` để nhận kết quả cuối. Ví dụ giới hạn thời gian chờ của CLI
và tự dừng workflow khi hết thời gian:

```powershell
node .\index.js run `
  --scenario video-download `
  --profile "Profile 1" `
  --wait `
  --timeout-ms 300000 `
  --stop-on-timeout `
  --run-timeout-ms 1800000
```

- `--timeout-ms`: thời gian CLI chờ kết quả.
- `--stop-on-timeout`: dừng lượt nếu CLI hết thời gian chờ.
- `--run-timeout-ms`: ngân sách thực thi của workflow trong agent.

Xem toàn bộ tùy chọn:

```powershell
node .\index.js --help
```
