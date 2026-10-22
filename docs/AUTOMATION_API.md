# Chạy kịch bản bằng CLI và API

Agent vẫn khởi động bằng `node local-agent.js`, dashboard ở `http://127.0.0.1:34719`. CLI là client của agent đang chạy; nó không mở thêm server. API chỉ chạy kịch bản JSON đã lưu trong `scenarios/`, cùng bộ điều phối, validation và extension như dashboard. Không có action mới.

## Bật API

Tại terminal PowerShell thứ nhất:

```powershell
# Sinh token ngẫu nhiên, lưu trong trình quản lý bí mật để dùng lại ở client.
$env:LOCAL_AGENT_API_TOKEN = node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
node local-agent.js
```

Token phải có 32–256 ký tự ASCII hiển thị, không có khoảng trắng. Thiếu token: API `/api/v1/*` trả 503; dashboard và extension vẫn hoạt động. Token sai: 401. Token sai định dạng khi khởi động: agent từ chối khởi động. Không đưa token vào Git hoặc tham số CLI. Client và agent cần cùng token; khi đổi token phải khởi động lại agent.

Trong terminal PowerShell thứ hai, đặt `LOCAL_AGENT_API_TOKEN` thành **cùng giá trị** từ secret manager/môi trường triển khai, rồi chạy các lệnh dưới đây. Không chạy lại lệnh sinh token vì sẽ tạo token khác.

## CLI

```powershell
node local-agent.js profiles
node local-agent.js scenarios
node local-agent.js describe --scenario download-upload-reels

node local-agent.js run --scenario download-upload-reels --profile "Profile 1" --var "video_url=https://example.com/video" --var "caption=Nội dung tiếng Việt" --wait
```

`--scenario` là tên file không có `.json`. `--profile` là thư mục Chrome (`Default`, `Profile 1`…), không phải tên hiển thị. Dùng `describe` để xem tên biến/giá trị mặc định thực tế của kịch bản; các tên `video_url`, `caption` trong ví dụ chỉ minh họa. Extension cần được cài, mở và kết nối đúng profile cho action trình duyệt. Kịch bản chỉ có `wait`, `openFolder`, `downloadVideo` không cần extension.

Với nhiều biến hoặc dữ liệu cần giữ kiểu number/boolean, tạo file JSON UTF-8 riêng, ví dụ `run-values.json`:

```json
{
  "caption": "Nội dung tiếng Việt có dấu = trong giá trị",
  "delay": 1000,
  "clear_caption": true
}
```

```powershell
node local-agent.js run --scenario my-workflow --profile "Profile 1" --variables-file .\run-values.json --var "caption=Ghi đè giá trị trong file" --upload "D:\Videos\clip.mp4" --wait --timeout-ms 300000 --stop-on-timeout --run-timeout-ms 600000 --request-id job-20261020-001

node local-agent.js status --run-id UUID_TRA_VE
node local-agent.js stop --run-id UUID_TRA_VE
node local-agent.js --help
```

Ưu tiên: biến trong kịch bản → file biến → `--var` (lần cuối cùng nếu trùng). `--var` luôn là chuỗi, tách tại dấu `=` đầu tiên, hỗ trợ giá trị rỗng và Unicode. Agent vẫn chuyển kiểu các trường số/boolean phù hợp như trước. Chỉ chấp nhận giá trị biến string/number/boolean hữu hạn; từ chối object, array, null, tên nguy hiểm và tên runtime dành riêng `download_title`, `download_file_name`, `download_file_path`, `download_id`. Có thể truyền biến còn thiếu trong template. Biến thiếu, vòng lặp, sai ngày/giờ hoặc file không tồn tại được báo lỗi trước khi chạy nếu không phụ thuộc kết quả runtime. Giới hạn độ sâu tham chiếu 64 và chuỗi sau mở rộng 1 triệu ký tự.

Không ghi đè giá trị vào file kịch bản. Mỗi lượt có bản sao riêng. File `--upload` chỉ thay upload tĩnh; upload tham chiếu `{{download_file_path}}` tiếp tục dùng đúng clip vừa tải và được xác minh.

CLI xuất một object JSON ra stdout. Với `--wait`, stderr có thông tin `runId` ban đầu để tra cứu nếu client bị ngắt; stdout là kết quả cuối. Mã thoát:

| Mã | Ý nghĩa |
| --- | --- |
| 0 | Đã nhận lượt chạy (không `--wait`) hoặc đã thành công (có `--wait`) |
| 1 | Lỗi tham số/API/kết nối hoặc workflow thất bại |
| 2 | Workflow bị dừng khi CLI đang chờ |
| 124 | CLI hết thời gian chờ |

`--timeout-ms` là thời gian **client chờ** (mặc định 300000 ms, tối đa 86400000). Hết chờ/ngắt CLI không tự dừng công việc; thêm `--stop-on-timeout` nếu muốn dừng khi hết chờ. `--run-timeout-ms` là ngân sách thực thi **trong agent** (mặc định 3600000 ms, tối đa 86400000), hết hạn thành `failed`, kể cả khi extension ngừng nhận bước. Agent kiểm tra hạn khoảng mỗi giây. Timeout HTTP mỗi request CLI là 10 giây; lỗi mạng có thể xảy ra sau khi server đã nhận công việc. Dùng lại cùng `--request-id` và tham số để lấy lượt cũ thay vì tạo trùng.

## HTTP API v1

Base URL: `http://127.0.0.1:34719/api/v1`. Mọi request cần header `Authorization: Bearer TOKEN`. POST tạo lượt cần `Content-Type: application/json`, body tối đa 100000 byte. Không cho phép browser Origin gọi API v1.

| Method | Endpoint | Kết quả |
| --- | --- | --- |
| GET | `/profiles` | Thư mục/tên profile, kết nối extension và trạng thái |
| GET | `/scenarios` | Tên kịch bản đã lưu |
| GET | `/scenarios/:name` | Tên, biến mặc định và số bước |
| POST | `/runs` | 202 và lượt chạy mới; 409 nếu profile đang bận |
| GET | `/runs?profile=Profile%202` | Tối đa 50 lượt gần nhất, lọc theo profile; bỏ profile để xem tất cả |
| GET | `/runs/:runId` | Trạng thái lượt, tiến độ, lỗi và kết quả tải |
| POST | `/runs/:runId/stop` | Dừng đúng lượt; gọi lại an toàn, không dừng lượt mới của profile |

Ví dụ PowerShell gọi trực tiếp:

```powershell
$headers = @{
  Authorization = "Bearer $env:LOCAL_AGENT_API_TOKEN"
  'Idempotency-Key' = 'job-20261020-002'
}
$body = @{
  scenario = 'my-workflow'
  profile = 'Profile 1'
  variables = @{ caption = 'Tiêu đề'; delay = 1000 }
  timeoutMs = 600000
  # uploadPath = 'D:\Videos\clip.mp4' # tùy chọn
} | ConvertTo-Json -Depth 5
$run = Invoke-RestMethod -Uri 'http://127.0.0.1:34719/api/v1/runs' -Method Post -Headers $headers -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body))
$run.runId
Invoke-RestMethod -Uri "http://127.0.0.1:34719/api/v1/runs/$($run.runId)" -Headers $headers
Invoke-RestMethod -Uri "http://127.0.0.1:34719/api/v1/runs/$($run.runId)/stop" -Method Post -Headers $headers
```

Body `/runs` chỉ nhận `scenario`, `profile` (bắt buộc), `variables` (object tùy chọn), `uploadPath` (chuỗi tùy chọn), `timeoutMs` (số nguyên 1–86400000, mặc định một giờ). Không nhận lệnh shell, đường dẫn file kịch bản tùy ý hoặc steps gửi trực tiếp. Profile không tồn tại/tham số sai trả 400; scenario/run không tồn tại trả 404; sai content type trả 415; body quá lớn trả 413. Mỗi profile chạy một lượt, các profile khác nhau chạy đồng thời; không có hàng đợi.

Response là object có `runId` ổn định, `scenario`, `profile`, `state` (`running`, `succeeded`, `failed`, `cancelled`, `interrupted`), `index` từ 0, `total`, `error`, `startedAt`, `endedAt` (Unix milliseconds), cùng trạng thái/kết quả workflow. `steps` lưu kết quả/thời gian từng bước; `stoppedAtStep` từ 1 chỉ vị trí dừng. `interrupted` là lượt đang chạy khi tiến trình agent bị ngắt, được khôi phục khi restart. HTTP 202 chỉ xác nhận đã nhận; phải poll `GET /runs/:runId` tới trạng thái cuối để biết thành công. Lỗi runtime sau khi nhận vẫn trả trong kết quả lượt (`state: failed`), không đổi HTTP status của GET.

`Idempotency-Key` tùy chọn, 1–128 ký tự chữ/số/`_`/`-`. Cùng khóa/cùng body trả 200 với lượt cũ; cùng khóa/body khác trả 409. Dùng lại khóa không tự chạy lại sau thất bại; lượt mới cần khóa mới. Agent giữ tối đa 200 lượt hoàn tất và 200 khóa gần nhất trong RAM. Lịch sử lượt còn trong kho local sau khi bị loại khỏi RAM hoặc restart và vẫn đọc được theo ID; khóa idempotency vẫn chỉ ở RAM, mất khi restart. Run không có trong kho trả 404; nếu khóa còn nhưng run đã mất, gửi lại trả 410. Khóa đã bị loại khỏi bộ nhớ có thể tạo lượt mới, nên đây không phải bảo đảm chống tạo job trùng bền vững qua restart. Cache download chống tải lại cùng URL khi file vẫn còn đúng hash; không tự bỏ qua bước upload vì có lần trước đã upload.

Chi tiết schema `steps`, cache URL, sự kiện upload/page và MongoDB: [ACTIVITY_STORAGE.md](ACTIVITY_STORAGE.md).

## Phạm vi bảo mật

Chỉ lắng nghe loopback; CLI từ chối URL ngoài `127.0.0.1` và redirect. Agent kiểm tra Host/Origin, giới hạn body và thời gian nhận HTTP. Bearer token được so sánh bằng digest và `timingSafeEqual`. Không trả giá trị biến trong trạng thái lượt, không ghi token vào log hoặc gửi token sang extension. Giá trị biến có thể xuất hiện trong lỗi action hoặc kết quả website/tải xuống, vì vậy không coi biến là kho bí mật.

Token có quyền chạy mọi kịch bản đã lưu với mọi profile đã biết, gồm tải/upload file theo quyền tài khoản Windows chạy agent. Chỉ cấp token cho chương trình tin cậy. Dashboard cùng origin và bridge extension tiếp tục là giao diện tin cậy của máy local; token không cô lập được chương trình độc hại chạy cùng tài khoản hoặc extension độc hại. Khi có token, API cũ `/api/*` cũng yêu cầu Bearer token hoặc mã phiên dashboard do agent chèn vào HTML, ngoại trừ discovery profile từ extension. Chỉ giả header Origin không thể thay xác thực. Mã phiên dashboard khác token tự động và đổi sau mỗi lần khởi động; tải lại trang dashboard sau khi restart agent. Không public cổng, không dùng port forwarding hoặc reverse proxy để biến API này thành dịch vụ Internet. Tích hợp từ xa cần một lớp dịch vụ riêng có TLS, xác thực và phân quyền phù hợp.

Tài liệu Node.js tham chiếu: [HTTP timeouts](https://nodejs.org/api/http.html#serverrequesttimeout), [timingSafeEqual](https://nodejs.org/api/crypto.html#cryptotimingsafeequala-b).
