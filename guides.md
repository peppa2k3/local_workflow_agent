# Hướng dẫn từ cài Chrome Extension đến chạy workflow và remote control

Hướng dẫn cho máy Windows chạy Chrome và VPS **Remote Control Agent** đang dùng
Socket.IO/Remote Terminal. Các lệnh Windows bên dưới chạy trong **PowerShell**.
Thay đường dẫn và domain mẫu cho phù hợp với máy của bạn.

## 0. Phân biệt các thành phần trước khi chạy

| Thành phần | Chạy ở đâu | Vai trò |
| --- | --- | --- |
| `chrome-reels-extension/` | Từng Chrome profile trên máy local | Click, nhập chữ, upload và thao tác tab. |
| `node local-agent.js --daemon` | Gốc repo workflow trên máy local | Chạy scenario, API và dashboard `http://127.0.0.1:34719`. |
| `npm start` trong `local-agent/` hoặc `local-agent copy/` | Máy local, terminal riêng | Giữ kết nối Socket.IO ra VPS, nhận lệnh remote rồi gọi API workflow. |
| Backend/frontend Remote Control Agent | VPS | Đăng nhập, ghép máy, cấp phiên điều khiển, hiển thị panel workflow. |

```text
Web VPS → Socket.IO → terminal agent trên máy local
                            ↓ HTTP loopback + API token
                     workflow engine :34719 → Chrome Extension → tab
```

Remote cần **hai tiến trình Node trên máy local**: workflow engine và terminal
agent. Chạy riêng từng terminal; cài extension vào từng Chrome profile cần dùng.

Các đường dẫn đang dùng trong ví dụ:

```text
Repo workflow: D:\CODE_DND\local-agent-work-flow
Repo VPS:      D:\CODE_DND\remote-control-agent\remote-control-agent-core-base
Runner cũ:     D:\CODE_DND\remote-control-agent\remote-control-agent-core-base\local-agent copy
```

Repo còn có `remote-control.js`, `control-server/` và trang local `/remote` dùng
một cơ chế remote polling khác. Luồng Socket.IO trong guide này ghép máy trên
**web Remote Control Agent**, không qua trang `/remote` của dashboard local.

## 1. Chuẩn bị máy local

1. Cài **Node.js 24.x**, npm, Git và Google Chrome. Manifest hiện yêu cầu Chrome
   từ phiên bản 120.
2. Clone toàn bộ repo workflow; nếu đã có checkout, cập nhật code trong repo đó.
3. Mở PowerShell tại gốc repo và kiểm tra môi trường:

```powershell
cd D:\CODE_DND\local-agent-work-flow
node --version
npm --version
git status --short
```

4. Cài dependency của engine:

```powershell
npm ci --prefix local-workflow-agent --omit=dev
```

5. Nếu scenario có tải video, cài yt-dlp, FFmpeg và FFprobe:

```powershell
npm run setup:video
```

**Kết quả:** có dependency runtime trong `local-workflow-agent/node_modules/`;
binary tải video nằm ở `tools/` khi chạy bước cài video.

## 2. Nạp extension vào Chrome

### 2.1. Cài trực tiếp bằng Load unpacked

Cách này dùng ngay trên máy local, không cần chờ phát hành trên Web Store.

1. Mở đúng cửa sổ Chrome profile sẽ chạy workflow.
2. Vào `chrome://extensions`.
3. Bật **Developer mode**.
4. Bấm **Load unpacked** và chọn thư mục:

   ```text
   D:\CODE_DND\local-agent-work-flow\chrome-reels-extension
   ```

5. Chọn **thư mục**, không chọn riêng `manifest.json` hoặc file ZIP.
6. Kiểm tra thẻ **Local Workflow Agent Bridge** đã bật. Bản manifest hiện tại
   là `4.2.1`.
7. Lặp lại trên từng profile muốn điều khiển. Việc ánh xạ profile thực hiện ở bước 5.

### 2.2. Đóng ZIP và upload Chrome Web Store — nếu muốn phát hành

1. Tại gốc repo workflow, đóng gói:

   ```powershell
   npm run package:extension
   ```

   Kết quả hiện tại: `dist/chrome-reels-extension-4.2.1.zip`. Script lấy version
   từ manifest và không ghi đè ZIP đã có. Nếu cần đóng lại cùng version, chọn
   thư mục kết quả mới:

   ```powershell
   npm run package:extension -- -OutputDirectory D:\releases\bridge-test
   ```

2. Mở ZIP kiểm tra `manifest.json` ở ngay gốc cùng các file runtime. Script hiện
   chỉ đóng năm file; nếu bổ sung icon/asset vào extension, phải cập nhật danh
   sách `$files` trong `scripts/package-extension.ps1` để asset được đóng kèm.
   Bản source hiện chưa khai báo `icons`; chuẩn bị icon và nội dung listing
   trước khi phát hành. Xem [chuẩn bị extension của Chrome](https://developer.chrome.com/docs/webstore/prepare).
3. Đăng ký tài khoản developer nếu chưa có theo [hướng dẫn đăng ký](https://developer.chrome.com/docs/webstore/register).
4. Mở [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole),
   chọn **Add new item**, chọn ZIP và upload.
5. Điền các mục **Store Listing**, **Privacy**, **Distribution**, **Test instructions**.
   Xem [quy trình publish chính thức](https://developer.chrome.com/docs/webstore/publish).
6. Khai báo đúng mục đích, dữ liệu và lý do dùng quyền. Manifest hiện có
   `debugger`, `storage`, `tabs`, `alarms`, `scripting` và quyền truy cập HTTP/HTTPS.
   Xem [hướng dẫn Privacy](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy).
7. Trong hướng dẫn cho reviewer, mô tả cách chạy local engine, cấu hình profile
   và thử scenario mẫu. Khi thông tin hoàn tất, chọn **Submit for Review**.
8. Sau khi bản phát hành được duyệt và khả dụng, cài bằng link store vào từng
   Chrome profile. Khi cập nhật package, tăng version rồi upload bản mới theo
   [hướng dẫn update](https://developer.chrome.com/docs/webstore/update).

`npm run package:extension` chỉ tạo ZIP; upload và xuất bản là các thao tác riêng
trên tài khoản Chrome Web Store. Các bước local còn lại có thể làm bằng bản
Load unpacked trong lúc chuẩn bị phát hành.

## 3. Cấu hình workflow engine bằng `.env` ở gốc repo

1. Tạo `.env` từ mẫu **chỉ khi chưa có file**:

```powershell
cd D:\CODE_DND\local-agent-work-flow
if (!(Test-Path -LiteralPath .env)) { Copy-Item .env.example .env }
notepad .env
```

2. Giữ token đã có. Nếu chưa có `LOCAL_AGENT_API_TOKEN`, sinh một token:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

3. Chép kết quả vào `.env`, thay placeholder bên dưới bằng token vừa sinh:

```dotenv
LOCAL_AGENT_API_TOKEN=THAY_BANG_TOKEN_VUA_SINH
CHROME_PROFILE="Profile 1"
```

Token phải có 32–256 ký tự ASCII hiển thị, không có khoảng trắng. Mỗi key chỉ
khai báo một lần. Token này dùng cho API workflow và được terminal agent đọc
tại local; không chép token lên VPS hoặc extension.

4. `CHROME_PROFILE` là **tên thư mục** profile mặc định. Nếu không đặt, engine
   dùng `Profile 2`. Cách tìm thư mục đúng ở bước 5.
5. Nếu dùng kho nội dung chung, điền `MONGODB_URI` và `MONGODB_DATABASE` theo
   [hướng dẫn Atlas](docs/MONGODB_ATLAS.md). Có thể để URI trống khi thử workflow
   không cần MongoDB. Upload dùng page chung cần cấu hình kho nội dung phù hợp.

**Kết quả:** `.env` của engine nằm ở gốc repo; không phải file `.env` của
terminal agent hoặc backend VPS. Đổi token sau khi engine chạy cần restart engine.

## 4. Khởi động workflow engine

Mở **terminal A**:

```powershell
cd D:\CODE_DND\local-agent-work-flow
node local-agent.js --daemon
```

1. Chờ log có `Local agent ready` và `Dashboard: http://127.0.0.1:34719`.
2. Mở `http://127.0.0.1:34719` trên Chrome local.
3. Giữ terminal A chạy. `--daemon` không tự cài Windows service hoặc tự khởi
   động sau reboot; nó vẫn cần tiến trình Node đang sống.
4. Nếu báo cổng đang dùng, kiểm tra engine cũ trước khi chạy thêm. Một máy chỉ
   chạy một engine trên cổng 34719. Ctrl+C dừng engine trong terminal đó.

**Kết quả:** dashboard mở được. Không mở cổng 34719 ra Internet; VPS đi qua
terminal agent đã kết nối outbound.

## 5. Ánh xạ extension với đúng Chrome profile

1. Trong cửa sổ Chrome đang có extension, mở `chrome://version`.
2. Tìm **Profile Path**. Ví dụ đường dẫn kết thúc bằng `Profile 1` thì tên cần
   chọn là `Profile 1`; không dùng tên tài khoản hoặc tên hiển thị Chrome.
3. Vào `chrome://extensions` → **Details** của extension → **Extension options**.
4. Trong **Chrome profile**, chọn đúng thư mục vừa tìm rồi bấm **Lưu kết nối**.
5. Quay lại dashboard local, chọn cùng profile. Trạng thái cần hiển thị extension
   đã kết nối. Mỗi cửa sổ/profile phải có ánh xạ riêng.
6. Mở tab website sẽ thao tác trong profile đó. Sau khi đổi source extension,
   bấm **Reload** extension và tải lại tab website.

## 6. Tạo scenario thử trước khi chạy workflow thật

1. Trên dashboard local, nhập tên file mới `kiem-tra-ket-noi`, bấm **Tạo mới**.
2. Chọn action **Chờ thời gian**, điền `1000` ms.
3. Bấm **Lưu**, sau đó **Chạy kịch bản**. Kiểm tra lượt kết thúc thành công.
4. Step đã lưu mặc định thu gọn. Bấm **▾ Mở** để sửa toàn bộ nội dung;
   **▴ Thu**, ↑, ↓ và × để thu gọn, đổi thứ tự hoặc xóa bước.
5. Để thử bridge Chrome, tạo scenario khác chỉ có **Mở URL** với
   `https://example.com/`, lưu rồi chạy trên profile đã kết nối.
6. Khi hai thử nghiệm đạt, mở scenario thực tế, kiểm tra URL, thư mục, biến,
   locator và page đích trước khi chạy.

JSON đã lưu ở `scenarios/`. Tên CLI/API bỏ đuôi `.json`.
Scenario `wait` chỉ kiểm tra engine; scenario `openUrl` kiểm tra thêm extension.

## 7. Chuẩn bị web VPS Remote Control Agent

VPS cần chạy **backend và frontend đã có workflow bridge**. Chỉ cập nhật code
máy local sẽ chưa làm xuất hiện panel mới trên web VPS.

### VPS đã được triển khai

1. Cập nhật repo Remote Control Agent trên VPS theo quy trình deploy đang dùng.
2. Nếu dùng build tại VPS với `infrastructure/compose.yml`, ví dụ:

```bash
cd /opt/remote-control-agent
git pull
cd infrastructure
docker compose -f compose.yml config --quiet
docker compose -f compose.yml build app
docker compose -f compose.yml up -d app
```

Nếu hệ thống dùng `compose.prod.yml`/image GHCR và CI/CD, dùng đúng quy trình đó;
không chuyển sang build-local Compose chỉ để cập nhật tính năng.

3. Giữ cấu hình và volume SQLite hiện tại. Mở
   `https://remote.example.com/api/health` để kiểm tra app sau deploy.
4. Đăng nhập web VPS và refresh trang. Panel workflow nằm trong thẻ thiết bị
   khi runner đã quảng bá cấu hình hợp lệ.

### Nếu đang dựng VPS mới

1. Dùng repo `remote-control-agent-core-base`, làm theo `docs/DEPLOY.md` hoặc
   `docs/CICD_DEPLOY.md` **trong repo đó**.
2. Chuẩn bị domain HTTPS và network Traefik. `infrastructure/.env` cấu hình
   `APP_DOMAIN`, `TRAEFIK_NETWORK`, `TRAEFIK_CERTRESOLVER`.
3. `infrastructure/backend.env` đặt `PUBLIC_ORIGIN=https://DOMAIN_CUA_BAN`,
   `COOKIE_SECURE=true`, `TRUST_PROXY=true`, `HOST=0.0.0.0`, `PORT=4000`,
   `DB_PATH=/data/rca.sqlite` theo mẫu triển khai Traefik hiện có.
4. Tạo tài khoản bằng quy trình seed trong repo VPS, rồi deploy app. Sau đó
   tiếp tục ghép máy ở bước 8. Không cấu hình token workflow trên backend VPS.

## 8. Cấu hình terminal agent kết nối VPS

Chọn **một** thư mục runner. Máy đã ghép bằng `local-agent copy` nên tiếp tục
dùng thư mục đó và credentials đang có, không khởi động thêm runner thứ hai
cho cùng credential.

### 8.1. Dùng `local-agent/` trong repo workflow

Mở **terminal B**, khác terminal A:

```powershell
cd D:\CODE_DND\local-agent-work-flow\local-agent
npm ci --omit=dev
if (!(Test-Path -LiteralPath .env)) { Copy-Item .env.example .env }
notepad .env
```

Cấu hình `.env` của runner, thay domain mẫu bằng domain VPS thật:

```dotenv
SERVER_URL=https://remote.example.com
PAIR_CODE=
CREDENTIALS_PATH=./data/credentials.json
AUTO_APPROVE_SESSIONS=false
ALLOW_INSECURE_REMOTE=false
STATUS_INTERVAL_SECONDS=10
TERMINAL_MAX_SECONDS=1800
TERMINAL_IDLE_SECONDS=600
WORKFLOW_AGENT_ENABLED=true
WORKFLOW_AGENT_URL=http://127.0.0.1:34719
WORKFLOW_AGENT_ENV_FILE=../.env
```

`../.env` tính từ thư mục runner, nên trỏ tới `.env` engine ở gốc repo.
`SERVER_URL` là HTTPS của VPS; `WORKFLOW_AGENT_URL` là HTTP loopback của engine
**trên chính máy local**.

### 8.2. Dùng bản `local-agent copy` hiện tại của bạn

1. Mở `.env` trong thư mục runner hiện tại, giữ thông tin VPS/credential đã ghép.
2. Bổ sung hoặc cập nhật ba dòng:

```dotenv
WORKFLOW_AGENT_ENABLED=true
WORKFLOW_AGENT_URL=http://127.0.0.1:34719
WORKFLOW_AGENT_ENV_FILE=D:/CODE_DND/local-agent-work-flow/.env
```

3. Sau khi runner cũ đã dừng, mở terminal tại thư mục đó:

```powershell
cd 'D:\CODE_DND\remote-control-agent\remote-control-agent-core-base\local-agent copy'
npm start
```

Nếu chỉ muốn đặt đường dẫn cho phiên terminal hiện tại, có thể dùng
`$env:WORKFLOW_AGENT_ENV_FILE = 'D:/CODE_DND/local-agent-work-flow/.env'` trước
`npm start`; muốn giữ qua lần mở terminal mới thì lưu trong `.env` của runner.

## 9. Ghép máy với VPS lần đầu và khởi động runner

**Máy đã ghép:** giữ credentials và `SERVER_URL` hiện tại, bỏ qua thao tác tạo
pairing mới; chỉ chạy lại runner sau khi cập nhật cấu hình/source.

**Máy chưa ghép:**

1. Đăng nhập web VPS bằng tài khoản quản lý.
2. Trong **Ghép cặp máy nhà**, nhập tên máy và bấm **Tạo mã ghép cặp**.
3. Chép mã mới vào `PAIR_CODE` trong `.env` của terminal agent. Mã dùng một lần,
   hết hạn sau 5 phút.
4. Trong terminal B tại thư mục runner đã chọn, chạy:

   ```powershell
   npm start
   ```

5. Khi console hỏi cho phép ghép với VPS, kiểm tra địa chỉ rồi gõ `YES`.
6. Chờ **Ghép cặp thành công** và **Đã kết nối VPS**; web hiển thị máy `online`.
7. Xóa giá trị `PAIR_CODE` khỏi `.env` sau khi ghép. Credentials được lưu trong
   `data/credentials.json`, runner dùng file này cho các lần chạy sau.

**Kết quả:** terminal A chạy workflow engine, terminal B giữ kết nối VPS.
Chỉ trạng thái `online` chưa chứng minh workflow API đã được cấu hình đúng;
kiểm tra thêm panel và bước 10.

## 10. Cấp phiên và chạy scenario từ web VPS

1. Giữ Chrome/profile, engine và terminal agent chạy trên máy local.
2. Trên web VPS, tìm máy `online`, bấm **Yêu cầu điều khiển**.
3. Với `AUTO_APPROVE_SESSIONS=false`, terminal B hỏi xác nhận; gõ `YES` trong
   thời hạn yêu cầu. Phiên trên web chuyển sang `active`.
4. Nếu cần chế độ tự chấp nhận phiên cho máy unattended, đặt
   `AUTO_APPROVE_SESSIONS=true` trong `.env` runner rồi restart runner. Quyền
   owner/operator và kiểm tra phiên vẫn áp dụng.
5. Trong **Kịch bản tự động**, bấm **Tải danh sách kịch bản**.
6. Chọn **Chrome profile**, chọn scenario `kiem-tra-ket-noi` đã lưu ở bước 6.
7. Bấm **Xem biến mặc định** nếu cần, hoặc để **Biến ghi đè (JSON)** là `{}`.
8. Bấm **Chạy kịch bản**. Kiểm tra trạng thái cuối `succeeded`; panel poll tiến
   độ mỗi 2 giây khi đang chạy.
9. Với lượt chạy dài, bấm **Dừng lượt chạy** để dừng đúng `runId` đang theo dõi.
10. Tải lại danh sách để cập nhật **Lượt gần đây**, chọn một lượt để xem trạng thái.
11. Khi thử nghiệm đạt, chọn scenario thực tế, xem biến/profile và chạy tương tự.

Viewer không được chạy workflow. Mỗi request cần phiên đang active trên đúng
browser đang giữ quyền điều khiển máy.

## 11. Chạy scenario qua Remote Terminal

Sau khi có phiên active, mở cửa sổ Terminal CMD/PowerShell trên web VPS. Lệnh
trong cửa sổ này chạy **trên máy local**, nên dùng đường dẫn Windows local:

```powershell
cd D:\CODE_DND\local-agent-work-flow
node local-agent/workflow.js profiles
node local-agent/workflow.js scenarios
node local-agent/workflow.js describe --scenario kiem-tra-ket-noi
node local-agent/workflow.js run --scenario kiem-tra-ket-noi --profile "Profile 1" --wait
```

Thay `Profile 1` bằng thư mục trả về từ `profiles`. Chạy scenario thực tế, nếu
file đó tồn tại và đã kiểm tra:

```powershell
node local-agent/workflow.js describe --scenario downl-up-khoahocgia
node local-agent/workflow.js run --scenario downl-up-khoahocgia --profile "Profile 1" --wait
```

Theo dõi/dừng lượt bằng ID trả về:

```powershell
node local-agent/workflow.js runs
node local-agent/workflow.js status --run-id UUID_TRA_VE
node local-agent/workflow.js stop --run-id UUID_TRA_VE
node local-agent/workflow.js --help
```

Không có `--wait`, lệnh `run` trả ngay sau khi engine nhận lượt. Để ghi đè biến,
thêm `--var "ten_bien=gia_tri"` hoặc `--variables-file file.json`. Dùng `describe`
để lấy đúng tên biến của scenario, không đoán theo tên ví dụ.

## 12. Khi ngắt kết nối, cập nhật hoặc khởi động lại máy

- Đóng terminal A/Ctrl+C sẽ dừng engine; đóng terminal B sẽ ngắt kết nối runner
  với VPS. `--daemon` không thay thế cấu hình startup Windows.
- Mất phiên remote hoặc đóng Remote Terminal **không bảo đảm workflow đã dừng**.
  Workflow engine là tiến trình riêng; lấy phiên mới, tải lịch sử và dừng đúng
  `runId` nếu cần.
- Timeout sau khi gửi run có thể xảy ra khi engine đã nhận việc. Kiểm tra lịch
  sử trước khi tạo lượt mới. Nếu retry qua CLI, dùng lại cùng `--request-id` và
  tham số; idempotency của engine không tồn tại qua restart.
- Khi download/upload cần xác nhận media trùng, mở dashboard local để xác nhận
  hoặc dừng. Web VPS không tự bỏ qua bước xác nhận này.
- Sau cập nhật source: restart engine/runner có thay đổi; nếu đổi extension,
  Reload extension và refresh tab. Nếu đổi backend/frontend VPS, deploy và
  refresh web VPS. Giữ dữ liệu/cấu hình của từng máy.
- Tự chạy sau đăng nhập Windows: xem các mẫu startup và [hướng dẫn remote](docs/REMOTE_CONTROL.md).
  Script `scripts/install-remote-startup.ps1` chỉ cài startup cho workflow engine;
  terminal agent Socket.IO cần task riêng trỏ tới runner đang dùng.

## 13. Tra lỗi nhanh

| Hiện tượng | Kiểm tra và xử lý |
| --- | --- |
| Dashboard `:34719` không mở | Terminal A có `Local agent ready` chưa; kiểm tra lỗi cổng hoặc `.env`. |
| Extension chưa kết nối | Engine đã chạy; extension bật trong đúng profile; Extension options khớp Profile Path; Reload extension/refresh tab. |
| `Port 34719 is already in use` | Có engine cũ; xác định và dừng đúng terminal cũ trước khi chạy phiên mới. |
| API `503`/chưa cấu hình workflow | Root `.env` có token hợp lệ; engine đã restart; `WORKFLOW_AGENT_ENV_FILE` trỏ đúng file. |
| API `401` | Token client khác token engine đang dùng; đọc cùng file và restart engine nếu vừa đổi token. |
| Options báo `Valid Bearer token or dashboard session required` | Dùng extension 4.2.1 trở lên, restart workflow engine đã cập nhật, Reload extension và mở lại Options. Bản sửa dùng POST discovery; không cần đưa token vào extension. |
| Không enroll/ghép được máy | Kiểm tra domain `SERVER_URL`, HTTPS, mã mới còn hạn; mã đã dùng cần tạo lại. |
| Credential thuộc server khác | Kiểm tra lại SERVER_URL của máy đã ghép; không ghi đè/xóa credential đang dùng chỉ để thử domain. |
| Runner online nhưng không có panel workflow | Backend/frontend VPS và runner đều phải là bản có bridge; cấu hình file env engine rồi restart runner/refresh web. |
| Không bấm được Chạy trên VPS | Cần owner/operator, đúng browser đang giữ active lease, profile/scenario đã chọn. |
| Không có scenario trong danh sách | Lưu JSON trên dashboard local; tên CLI không có `.json`; tải lại danh sách. |
| Profile bận/API `409` | Xem lượt đang chạy của profile đó, chờ hoàn tất hoặc dừng đúng runId. |
| Scenario lỗi tải video | Kiểm tra `tools/`, FFmpeg/FFprobe, URL và thư mục ghi file trên máy local. |
| Scenario dừng chờ xác nhận | Mở dashboard local kiểm tra popup download/upload trùng. |
| File/path không tồn tại | Đường dẫn phải có thật trên máy local đang chạy engine; sửa biến/scenario theo máy đó. |

## Tài liệu liên quan

- [Cài đặt dashboard/extension](docs/SETUP.md)
- [CLI và API workflow](docs/AUTOMATION_API.md)
- [Bridge terminal/VPS](local-agent/README.md)
- [Cú pháp scenario](docs/SCENARIOS.md)
- [Cấu trúc source và triển khai](docs/ARCHITECTURE.md)
- [Đóng gói extension](chrome-reels-extension/README.md)
