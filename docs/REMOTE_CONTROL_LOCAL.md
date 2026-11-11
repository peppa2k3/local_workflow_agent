# Chạy thử Remote Control hoàn toàn trên máy local

Guide này dùng `remote-control.js` và `local-agent.js` trong **repo workflow**.
Server điều khiển vốn sẽ đặt trên VPS được chạy thử ngay trên máy Windows.
Luồng này không cần runner Socket.IO `local-agent/` hoặc `local-agent-corebase/`.

| Tiến trình | Địa chỉ | File cấu hình |
| --- | --- | --- |
| Workflow engine: `node local-agent.js --daemon` | `http://127.0.0.1:34719` | `.env` ở gốc repo |
| Control server: `node remote-control.js` | `http://127.0.0.1:34800` | `.env.control` ở gốc repo |

Agent chủ động poll control server. Khi thử local, cả hai chạy trên cùng máy;
về sau chuyển control server lên VPS và dùng HTTPS.

## Bước 1. Chuẩn bị Node và dependency

Mở PowerShell:

```powershell
cd D:\CODE_DND\local-agent-work-flow
node --version
npm ci --prefix local-workflow-agent --omit=dev
```

Dùng Node.js **24.x** để control server có SQLite tích hợp. Control server chỉ
dùng Node builtins nên không cần cài MongoDB, Chrome hoặc dependency riêng cho
server đó. Máy chạy workflow vẫn cần Chrome/extension cho các action trình duyệt.

## Bước 2. Cấu hình `.env.control`

1. Tạo file từ mẫu nếu chưa có:

```powershell
if (!(Test-Path -LiteralPath .env.control)) {
  Copy-Item .env.control.example .env.control
}
notepad .env.control
```

2. Dùng cấu hình chạy thử sau:

```dotenv
CONTROL_PUBLIC_URL=http://127.0.0.1:34800
CONTROL_BIND=127.0.0.1
CONTROL_PORT=34800
CONTROL_DATABASE=./data/control/control.sqlite
CONTROL_TRUST_PROXY=0
CONTROL_TRUSTED_PROXY_IPS=
CONTROL_ALLOW_HTTP_LOOPBACK=1
```

3. Lưu file đúng tên **`.env.control`**, nằm cạnh `remote-control.js`.
   `.env.control.example` hoặc `.env.control copy.example` không được nạp tự động.

Giải thích các giá trị:

| Biến | Cấu hình local và ý nghĩa |
| --- | --- |
| `CONTROL_PUBLIC_URL` | Origin mà browser và agent sẽ dùng; không thêm `/remote`, `/api` hoặc đường dẫn khác. |
| `CONTROL_BIND` | `127.0.0.1` để chỉ lắng nghe trên máy này. |
| `CONTROL_PORT` | `34800`, khác cổng `34719` của engine. |
| `CONTROL_DATABASE` | SQLite lưu tài khoản, thiết bị và lệnh. Đường dẫn mẫu tính từ thư mục terminal, nên chạy tại gốc repo. |
| `CONTROL_TRUST_PROXY` | `0` vì thử trực tiếp không có reverse proxy. |
| `CONTROL_TRUSTED_PROXY_IPS` | Để trống khi không có proxy. |
| `CONTROL_ALLOW_HTTP_LOOPBACK` | `1` cho phép server dùng HTTP ở loopback khi phát triển. |

Dùng nhất quán `http://127.0.0.1:34800`. Không đổi sang `localhost:34800` trong
browser nếu `CONTROL_PUBLIC_URL` đang là `127.0.0.1`: server kiểm tra Host/Origin.

## Bước 3. Cho phép workflow engine kết nối HTTP loopback

Mở **`.env` ở gốc repo**, không phải `.env.control`:

```powershell
if (!(Test-Path -LiteralPath .env)) { Copy-Item .env.example .env }
notepad .env
```

Thêm hoặc cập nhật đúng một dòng:

```dotenv
LOCAL_AGENT_REMOTE_ALLOW_HTTP_LOOPBACK=1
```

Giữ các cấu hình API token/MongoDB/profile hiện có. Biến này cho phép client
remote trong engine gọi control server bằng HTTP loopback. Chỉ bật
`CONTROL_ALLOW_HTTP_LOOPBACK=1` ở server là chưa đủ.

Nếu engine đang chạy, restart sau khi lưu để nạp biến mới. Đừng restart khi có
workflow cần tiếp tục; chờ lượt đó hoàn tất hoặc dừng đúng lượt trước.

## Bước 4. Tạo tài khoản đăng nhập control server

Không có chức năng tự đăng ký trên web. Tạo tài khoản bằng CLI tại gốc repo.
Thay email ví dụ bằng email muốn dùng:

```powershell
$controlPassword = Read-Host 'Mat khau tai khoan local (12-256 ky tu)' -AsSecureString
$controlPasswordPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($controlPassword)
try {
  [Runtime.InteropServices.Marshal]::PtrToStringBSTR($controlPasswordPtr) |
    node .\remote-control.js user admin@example.com
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($controlPasswordPtr)
  Remove-Variable controlPassword, controlPasswordPtr
}
```

Để thử dễ trên Windows PowerShell, dùng mật khẩu gồm ký tự ASCII, dài ít nhất
12 ký tự. Mật khẩu đi qua stdin, không nằm trong tham số lệnh. Lệnh tạo user
chạy xong sẽ thoát; đây chưa phải tiến trình server.

**Kết quả:** log `Created account: admin@example.com`. Nếu báo `Account already
exists`, tài khoản đó đã có trong SQLite hiện tại; dùng tài khoản đã biết mật
khẩu hoặc tạo email thử khác. Không xóa database đang dùng chỉ để tạo lại user.

## Bước 5. Khởi động control server — terminal A

```powershell
cd D:\CODE_DND\local-agent-work-flow
node remote-control.js
```

1. Chờ log `Remote control server ready`.
2. Giữ terminal A mở.
3. Kiểm tra ở một PowerShell khác:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:34800/health'
```

Kết quả cần có `ok: True`. Mở `http://127.0.0.1:34800` và đăng nhập bằng tài
khoản vừa tạo. Tài khoản ở đây độc lập với tài khoản của project Socket.IO khác.

## Bước 6. Khởi động workflow engine — terminal B

Nếu đã có engine cũ trên cổng 34719, dừng/restart đúng tiến trình đó sau khi
kiểm tra các lượt đang chạy. Không mở thêm một engine cùng cổng.

```powershell
cd D:\CODE_DND\local-agent-work-flow
node local-agent.js --daemon
```

1. Chờ log `Local agent ready`.
2. Mở `http://127.0.0.1:34719` để kiểm tra dashboard.
3. Mở thêm `http://127.0.0.1:34719/remote` để cấu hình remote cho máy này.
4. Giữ terminal B mở. Hai terminal A/B phải cùng hoạt động.

## Bước 7. Chuẩn bị một scenario thử

Trên dashboard `http://127.0.0.1:34719`:

1. Tạo scenario `kiem-tra-remote`.
2. Chọn action **Chờ thời gian**, đặt `10000` ms.
3. Bấm **Lưu**. Tên file là `scenarios/kiem-tra-remote.json`.
4. Chọn một Chrome profile có trong danh sách, ví dụ `Profile 1`.

Scenario chỉ có `wait` không cần extension, nên thích hợp để thử kết nối trước.
Muốn thử thao tác Chrome sau đó, cài extension 4.2.1 trở lên, cấu hình đúng
profile trong Extension options và giữ Chrome mở. Xem [SETUP](SETUP.md).

## Bước 8. Cấp quyền từ dashboard local

Tại `http://127.0.0.1:34719/remote`, phần **Quyền điều khiển trên máy này**:

1. Tick profile sẽ dùng, ví dụ `Profile 1`.
2. Tick scenario `kiem-tra-remote`.
3. Lần thử đầu không cần cấp quyền ghi đè biến. Khi cần, chỉ tick những biến
   remote được phép thay đổi.
4. Bấm **Lưu quyền điều khiển** và kiểm tra thông báo đã lưu.

Quyền này quyết định profile/scenario xuất hiện trên control server. Chưa cấp
quyền thì thiết bị có thể kết nối nhưng không có mục tương ứng để chạy.

## Bước 9. Ghép máy — tạo mã tại local, nhập mã tại control

### 9.1. Tạo mã tại dashboard local

Ở `http://127.0.0.1:34719/remote`, mục **Kết nối VPS**:

1. Nhập **Địa chỉ web điều khiển**: `http://127.0.0.1:34800`.
2. Nhập **Tên máy hiển thị**, ví dụ `May local test`.
3. Bấm **Tạo mã ghép nối**.
4. Sao chép mã đang hiển thị; mã hết hạn sau 10 phút.

Dù giao diện ghi “VPS”, địa chỉ lúc thử vẫn là control server trên cùng máy.
Nếu đã có kết nối/pairing cũ, kiểm tra nó trước. Muốn thay kết nối phải dùng nút
**Ngắt kết nối / hủy ghép nối**; thao tác này dừng các lượt remote thuộc kết nối đó.

### 9.2. Nhập mã tại control server

Ở `http://127.0.0.1:34800`, sau khi đăng nhập:

1. Trong **Ghép thiết bị mới**, dán mã vừa tạo.
2. Bấm **Gửi yêu cầu kết nối**.
3. Giữ tab mở và quay lại dashboard local.

### 9.3. Xác nhận tài khoản tại máy local

Ở `http://127.0.0.1:34719/remote`:

1. Chờ vài giây để thấy email tài khoản đang yêu cầu.
2. Kiểm tra email và địa chỉ server đúng là tài khoản/server thử của bạn.
3. Bấm **Đồng ý cho tài khoản này kết nối**.
4. Chờ trạng thái **Đã kết nối**. Quay lại control server, thiết bị sẽ xuất hiện.

Nhập mã ở control server chưa hoàn tất pairing; cần xác nhận tại local. Agent
poll khoảng mỗi 3 giây nên giao diện có thể cập nhật sau vài giây.

## Bước 10. Chạy và dừng từ control server

Tại `http://127.0.0.1:34800`:

1. Chọn thiết bị vừa ghép ở **Thiết bị của bạn**.
2. Kiểm tra thiết bị online và profile/scenario đã cấp quyền xuất hiện.
3. Chọn profile và `kiem-tra-remote`.
4. Bấm **Chạy trên thiết bị**.
5. Xem **Lịch sử điều khiển** và tiến độ trên dashboard local. Sau khoảng
   10 giây chờ, lượt cần kết thúc thành công.
6. Chạy lại; khi lượt đang hoạt động, dùng nút dừng của lượt đó trong lịch sử
   để thử dừng đúng UUID. Kiểm tra trạng thái đã dừng/hủy.

Khi lượt thử đạt, cấp thêm quyền cho scenario thực tế và chạy theo cùng cách.
Action trình duyệt vẫn cần extension/profile đang kết nối. Popup xác nhận
download/upload trùng cần được xử lý trên dashboard local.

## Bước 11. Xử lý lỗi thường gặp

| Lỗi/hiện tượng | Cách kiểm tra |
| --- | --- |
| `HTTPS required...` khi chạy control server | `.env.control` cần `CONTROL_ALLOW_HTTP_LOOPBACK=1` và PUBLIC_URL là `http://127.0.0.1:34800`. Restart server sau khi sửa. |
| `HTTPS required...` khi tạo mã ở dashboard local | Root `.env` cần `LOCAL_AGENT_REMOTE_ALLOW_HTTP_LOOPBACK=1`; restart workflow engine sau khi sửa. |
| `Host not allowed`/`Origin not allowed` | Browser, URL ghép nối và `CONTROL_PUBLIC_URL` phải cùng `http://127.0.0.1:34800`; không trộn `localhost`/`127.0.0.1`. |
| Không thấy thay đổi cấu hình | Kiểm tra file đúng tên `.env.control` ở gốc, restart đúng process; biến môi trường shell có ưu tiên hơn giá trị trong file. |
| Không tạo được user/CLI hiện Usage | Lệnh `user` cần mật khẩu qua stdin; dùng block PowerShell ở bước 4, không nhập lệnh với tham số mật khẩu. |
| Lỗi `node:sqlite` | Chạy bằng Node 24.x. |
| Control server không listen được | Kiểm tra có tiến trình khác dùng cổng 34800 không và giá trị CONTROL_BIND/PORT. |
| Local dashboard `Valid Bearer token or dashboard session required` | Mở trang dashboard thật tại `:34719`, refresh sau khi engine restart; không mở trực tiếp endpoint `/api/...` thay giao diện. |
| Không thấy email xin ghép | Đăng nhập control server đúng địa chỉ, nhập mã chưa hết hạn rồi chờ cập nhật vài giây. |
| Thiết bị online nhưng profile/scenario trống | Vào `/remote` local, tick profile/scenario, bấm Lưu quyền rồi chờ lần poll kế tiếp. |
| Thiết bị offline sau restart engine | Chờ kết nối lại; instance lease cũ có thể cần khoảng 35 giây để hết hạn. Khi lỗi mạng, backoff có thể tới khoảng một phút. |
| Scenario thao tác web không chạy | Kiểm tra Chrome/profile/extension, khác với trạng thái engine online. |

Nếu mất phản hồi sau khi bấm Chạy, kiểm tra lịch sử trước khi tạo lượt mới.
Mất mạng không tự dừng một lượt đã bắt đầu; khi có mạng, kết quả được gửi tiếp.

## Bước 12. Dừng thử nghiệm và chuyển sang VPS sau này

1. Dừng lượt thử đang chạy trước.
2. Ctrl+C ở terminal A dừng control server, terminal B dừng workflow engine.
3. Tài khoản/thiết bị/lệnh nằm trong `data/control/`; cấu hình ghép máy nằm
   trong `data/agent/`. Giữ dữ liệu này nếu muốn dùng lại khi chạy tiếp.
4. Khi chuyển control server lên VPS thật, dùng HTTPS, PUBLIC_URL là domain
   thật và tắt hai cờ cho HTTP thử local. Cấu hình proxy theo cách deploy đã chọn.
5. Ghép máy với địa chỉ VPS mới và xác nhận đúng tài khoản. File `.env` local
   và thông tin Atlas vẫn ở máy local.

Xem bước deploy thực tế tại [REMOTE_CONTROL](REMOTE_CONTROL.md) và
[Docker Hub/Traefik](../control-server/deploy/README.md).
