# Cài đặt local agent, yt-dlp, FFmpeg và Chrome extension

Hướng dẫn dành cho Windows x64. Thực hiện lần lượt: chuẩn bị source → cài công cụ video → kiểm tra công cụ → chạy agent → kết nối extension → chạy thử kịch bản. Tải video thuần local không cần extension; chỉ các bước thao tác website mới cần Chrome profile đã kết nối.

## 1. Chuẩn bị

1. Cài Node.js 22 trở lên và Google Chrome trên Windows (server VPS dùng Node.js 24).
2. Copy riêng `local-workflow-agent/` hoặc pull repository rồi mở PowerShell trong app này. Các lệnh bên dưới chạy tại nơi có `package.json` và `index.js`:

   ```powershell
   Set-Location 'D:\CODE_DND\local-agent-work-flow\local-workflow-agent'
   node --version
   npm --version
   ```

   Thay đường dẫn bằng nơi bạn lưu source. `node --version` phải từ v22 trở lên.
3. Chạy `npm ci --omit=dev` để chỉ cài runtime local. Máy phát triển chạy `npm ci` ở gốc để có thêm Playwright cho test. Nếu cần cấu hình Atlas/API, tạo `.env` từ `.env.example` khi chưa có và điền giá trị riêng của máy.
4. Dashboard cho phép chọn nhiều Chrome profile. Mặc định CLI/API dùng `Profile 2`; đổi mặc định bằng `$env:CHROME_PROFILE = 'Profile 1'` trước khi khởi động agent. Có thể đặt `$env:CHROME_PATH` nếu Chrome không ở `C:\Program Files\Google\Chrome\Application\chrome.exe`, và `$env:CHROME_USER_DATA_DIR` nếu dùng thư mục dữ liệu Chrome riêng. Cần Chrome 120 trở lên.

Agent và extension thao tác trên profile Chrome hiện có.

## 2. Cài yt-dlp, FFmpeg và FFprobe

Ba công cụ có vai trò khác nhau: **yt-dlp** lấy metadata/tải video, **FFmpeg** ghép hình và tiếng, **FFprobe** kiểm tra file cuối trước khi workflow chạy bước tiếp theo. Cần đủ cả ba file `.exe`.

### Cách A — Cài tự động bằng script của repo

1. Đảm bảo máy có Internet, mở PowerShell tại thư mục local-workflow-agent như bước 1.
2. Chạy:

   ```powershell
   npm run setup:video
   ```

   Script tải `yt-dlp.exe` từ GitHub chính thức của yt-dlp, tải FFmpeg essentials từ release GyanD/codexffmpeg, giải nén và chép executable vào `tools/` trong local-workflow-agent. Không cần cài Python hoặc thêm PATH cho cách này. Quá trình tải/giải nén có thể mất vài phút.

   Máy mới dùng `tools/` trong app. Checkout cũ còn `tools/` ở gốc sẽ tiếp tục dùng đường dẫn cũ cho tới khi migrate; xem [chuyển installation cũ](../README.md#dữ-liệu-installation-cũ).

3. Khi lệnh kết thúc thành công, kiểm tra đủ file:

   ```powershell
   Test-Path .\tools\yt-dlp.exe
   Test-Path .\tools\ffmpeg.exe
   Test-Path .\tools\ffprobe.exe
   ```

   Cả ba phải trả về `True`. Cấu trúc cần có:

   ```text
   local-workflow-agent/
     index.js
     tools/
       yt-dlp.exe
       ffmpeg.exe
       ffprobe.exe
   ```

4. Chạy trực tiếp từng công cụ để xác nhận:

   ```powershell
   & .\tools\yt-dlp.exe --version
   & .\tools\ffmpeg.exe -version
   & .\tools\ffprobe.exe -version
   ```

   Mỗi lệnh phải in phiên bản và không báo lỗi. Script cài đã kiểm tra yt-dlp/FFmpeg; bước này kiểm tra thêm FFprobe. Các file trong `tools/` không được đưa vào Git, vì vậy **mỗi máy mới pull source cần chạy lại bước cài công cụ**.

### Cách B — Tải thủ công khi script không chạy được

1. Từ [release chính thức yt-dlp](https://github.com/yt-dlp/yt-dlp/releases/latest), tải **yt-dlp.exe** dành cho Windows x64.
2. Từ [trang tải FFmpeg](https://ffmpeg.org/download.html), chọn Windows build; có thể dùng [FFmpeg essentials của Gyan](https://www.gyan.dev/ffmpeg/builds/). Tải gói essentials `.zip`, giải nén và mở thư mục `bin` bên trong.
3. Tạo thư mục `tools` nếu chưa có:

   ```powershell
   New-Item -ItemType Directory -Force .\tools
   ```

4. Chép `yt-dlp.exe`, `bin/ffmpeg.exe` và `bin/ffprobe.exe` vừa tải vào `tools/`. Chép **file thực thi**, không để chúng chỉ nằm trong ZIP hoặc thư mục `tools/ffmpeg-.../bin/`.
5. Chạy lại ba lệnh `--version` / `-version` ở cách A.

### Dùng bộ công cụ đã cài ở nơi khác

Bỏ qua phần này nếu bạn dùng `tools/` ở trên. Nếu muốn dùng executable ở đường dẫn riêng, thêm vào `.env` tại gốc repo (giữ các cấu hình đang có):

```dotenv
YTDLP_PATH=C:\VideoTools\yt-dlp.exe
FFMPEG_PATH=C:\VideoTools\ffmpeg.exe
FFPROBE_PATH=C:\VideoTools\ffprobe.exe
```

Đây phải là đường dẫn tới **file `.exe`**, không phải thư mục. Có thể thử trong terminal hiện tại trước khi chạy agent:

```powershell
$env:YTDLP_PATH = 'C:\VideoTools\yt-dlp.exe'
$env:FFMPEG_PATH = 'C:\VideoTools\ffmpeg.exe'
$env:FFPROBE_PATH = 'C:\VideoTools\ffprobe.exe'
& $env:YTDLP_PATH --version
& $env:FFMPEG_PATH -version
& $env:FFPROBE_PATH -version
```

Agent ưu tiên biến môi trường, rồi executable trong `tools/`, rồi tìm theo PATH. FFprobe cũng có thể được lấy từ cùng thư mục với FFmpeg. Biến `$env:...` chỉ áp dụng trong terminal đó và có ưu tiên hơn `.env`; mở terminal mới nếu cần bỏ override cũ. Sau khi sửa `.env` hoặc thay công cụ, khởi động lại agent.

### Cập nhật công cụ

Dừng lượt tải đang chạy, rồi chạy lại `npm run setup:video` từ local-workflow-agent. Lệnh tải lại bản phát hành mới; sau đó kiểm tra phiên bản ba công cụ và khởi động lại agent. Nếu dùng đường dẫn riêng, cập nhật các file ở chính đường dẫn đó.

## 3. Nạp extension vào đúng profile

1. Chuyển sang cửa sổ của Chrome profile đã chọn.
2. Mở `chrome://extensions`.
3. Bật **Developer mode**.
4. Chọn **Load unpacked**, chọn thư mục `chrome-reels-extension/` trong local-workflow-agent, ví dụ `D:\CODE_DND\local-agent-work-flow\chrome-reels-extension` (chọn **thư mục**, không chọn `manifest.json`).
5. Chấp nhận quyền extension nếu Chrome hỏi. Extension dùng Debugger để gửi click/cuộn/chọn file; Tabs, Scripting, Storage và Alarms để quản lý tab, chờ tải trang và duy trì kết nối riêng theo profile.
6. Sau khi agent chạy, mở **Details → Extension options**. Chọn đúng thư mục của profile này rồi **Lưu kết nối**. Xem **Profile Path** tại `chrome://version` để biết phần cuối là `Default`, `Profile 1`, `Profile 2`… Lặp lại việc cài và cấu hình cho từng profile muốn điều khiển.
7. Khi mã extension thay đổi, bấm **Reload** trên thẻ extension trong từng profile rồi tải lại tab website đang mở. Bản cập nhật nhiều profile yêu cầu cấu hình Extension options một lần trước khi chạy.

## 4. Khởi động agent và dashboard

1. Trong PowerShell ở thư mục dự án, chạy `npm start` hoặc `node .\index.js`.
2. Giữ terminal đó mở. Dòng `Dashboard: http://127.0.0.1:34719` cho biết agent đã sẵn sàng.
3. Mở `http://127.0.0.1:34719` trong Chrome. Địa chỉ này chỉ lắng nghe trên máy local.
4. Nếu cổng `34719` đã được dùng, nhập `exit` trong terminal agent cũ rồi chạy lại. Extension đang kết nối cố định với cổng này.
5. Chọn **Chrome profile** trên dashboard. **Mở profile** mở cửa sổ của profile đó; chỉ chạy khi trạng thái extension của profile là **đã kết nối**.

## 5. Chạy thử tải video trước khi thêm upload

1. Mở dashboard `http://127.0.0.1:34719`, chọn kịch bản `starter-video-download` trên máy mới hoặc `video-download` của installation cũ.
2. Trong **Biến kịch bản**, đặt `video_url` thành URL video bạn muốn tải và `thu_muc_tai` thành đường dẫn tuyệt đối trên máy local, ví dụ `D:\Videos`. Kiểm tra trường URL/thư mục trong bước đang tham chiếu đúng các biến này. Nếu kịch bản của bạn dùng tên biến khác, sửa biến tương ứng hoặc nhập trực tiếp trong bước.
3. Mở chi tiết bước **Tải video (yt-dlp + FFmpeg)**. Chọn **Ngôn ngữ âm thanh → Tiếng Việt**, **Độ phân giải → Full HD (1080p)**. Đây là mặc định cho bước mới; bước cũ đã lưu `quality: "best"` cần đổi lại rồi lưu.
4. Bấm **Lưu**, chọn một Chrome profile trong dashboard rồi bấm **Chạy kịch bản**. Với kịch bản chỉ có tải video, profile được dùng để theo dõi workflow; extension không cần kết nối.
5. Chờ trạng thái hoàn tất. Kiểm tra dashboard có đường dẫn file, độ phân giải/FPS/codec và mở file trong thư mục đích để kiểm tra hình/tiếng. Agent chỉ báo thành công sau khi tải xong và FFprobe xác nhận video đọc được.
6. Nếu nguồn không có audio tiếng Việt thì agent dùng audio có sẵn; không tự dịch. Độ phân giải ưu tiên bản gần nhất không vượt mức đã chọn; nếu chỉ có bản cao hơn thì lấy bản nhỏ nhất có sẵn. URL file trực tiếp chỉ có một định dạng sẽ giữ định dạng nguồn.

Để nối tải và upload, dùng kịch bản `download-upload-reels`, sửa URL/thư mục/trang đích và chọn profile có extension kết nối. Bước upload có thể dùng `{{download_file_path}}`, bước nhập mô tả dùng `{{download_title}}`. Xem [runtime references và tùy chọn tải](SCENARIOS.md). Việc chọn file upload không đồng nghĩa website đã đăng bài.

## 6. Tạo và chạy kịch bản khác

1. Nhập **Tên file mới** bằng chữ thường, số, `-` hoặc `_`, rồi bấm **Tạo mới**. Hoặc chọn kịch bản đã lưu và bấm **Mở**.
2. Bấm **＋ Thêm bước** để tạo bước mới với phần chi tiết mở sẵn. Các bước đã lưu mặc định thu gọn; bấm **▾ Mở** trên từng bước để sửa tên, locator và các trường khác, bấm **▴ Thu** khi xong. Tên bước, action, nút ↑ ↓ và × luôn nằm trên đầu bước để đổi thứ tự hoặc xóa nhanh. Trạng thái mở/thu chỉ thuộc giao diện, không ghi vào JSON.
3. Thường bắt đầu bằng `openUrl`, rồi `waitFor` nút cần xuất hiện, sau đó `click`, `type`, `scroll` hoặc `upload`. `openUrl` và `click` chờ trang tải xong; `click` mặc định không chờ DOM toàn trang đứng yên và không yêu cầu nút vừa click biến mất. Với AJAX, upload hoặc điều hướng trễ, điền **Chờ phần tử kết quả** và trạng thái **Xuất hiện/Biến mất/Có thể tương tác** để xác định khi thao tác hoàn tất; xem [cú pháp và ví dụ completion](SCENARIOS.md#waiting-for-actions-to-finish).
4. Với `click`, `waitFor`, `type`, `upload`, bấm **◎ Chọn trên trang**, chuyển sang tab mục tiêu, di chuột lên phần tử và click. Locator sẽ được điền vào bước. Nhấn Esc để hủy.
5. Chọn profile, bấm **Lưu**, rồi **▶ Chạy kịch bản**. Thanh **Trạng thái** hiển thị bước hiện tại hoặc lỗi. **Dừng** chỉ dừng profile đang chọn. Có thể chuyển profile và chạy kịch bản khác đồng thời.
6. Có thể chạy bằng terminal agent: `run scenarios/facebook-reels.json --profile "Profile 1"`, kiểm tra `status`, dừng bằng `stop "Profile 1"`, thoát tất cả bằng `exit`.

## Chạy tự động bằng CLI/API

Đặt `LOCAL_AGENT_API_TOKEN` (token ngẫu nhiên ít nhất 32 ký tự) trong môi trường agent và client, rồi khởi động lại `node index.js`. Trong terminal khác:

```powershell
node index.js profiles
node index.js scenarios
node index.js describe --scenario my-workflow
node index.js run --scenario my-workflow --profile "Profile 1" --variables-file .\run-values.json --wait
```

`run-values.json` là object giá trị biến, ví dụ `{"caption":"Tiêu đề mới"}`. Có thể thêm `--var "caption=Giá trị khác"`, `--upload`, `--timeout-ms`, `--request-id`. Biến chỉ áp dụng cho lượt đó; không sửa JSON đã lưu. API tương ứng: `POST /api/v1/runs`, theo dõi/dừng bằng `runId`. Xem [các lệnh CLI thường dùng](CLI.md) và [hướng dẫn CLI/API đầy đủ](AUTOMATION_API.md).

## 7. Upload file

1. Thêm action **Upload file** vào vị trí sau bước mở dialog upload, nếu trang cần bước đó.
2. Dùng **◎ Chọn trên trang** để chọn **nút mở hộp chọn file**. Action upload sẽ tự click nút, chặn hộp thoại chọn file của Chrome và gán file. Nếu đang có bước `click` riêng cho cùng nút này, xóa bước đó để tránh click hai lần.
3. Điền **Đường dẫn file đầy đủ** trong bước, hoặc **Thư mục** + **Tên file**. Có thể để trống và điền **File upload cho lần chạy** trên thanh công cụ để thay file mỗi lần chạy.
4. Nếu website cần xác nhận sau khi chọn file, thêm `waitFor` cho preview/trạng thái hoàn tất, rồi thêm `click` cho nút Submit/Đăng.
5. Trong terminal: `run scenarios/ten-kich-ban.json --upload "C:\Users\Administrator\Downloads\photo.jpg"`.

## 8. Khi click mở lớp phủ/dialog

Thêm `waitFor` cho nút mới trong dialog trước bước click/upload tiếp theo. Locator nên ưu tiên **Role + tên**, **Chữ hiển thị**, **Label** hoặc **XPath**, vì class CSS có thể đổi. Agent chọn phần tử trong dialog đang hiển thị và đợi đến khi nó nhận được click. Xem [hướng dẫn locator và action](SCENARIOS.md).

## 9. Kiểm tra và xử lý lỗi

### Lỗi cài đặt/tải video

| Hiện tượng | Cách xử lý |
| --- | --- |
| `npm` / `node` không được nhận diện | Cài Node.js 22+, mở PowerShell mới rồi kiểm tra `node --version`, `npm --version`. |
| PowerShell chặn `npm.ps1` | Dùng `npm.cmd run setup:video`; script npm đã gọi PowerShell với ExecutionPolicy Bypass cho lần chạy đó. |
| Tải công cụ báo lỗi mạng/403/timeout | Kiểm tra truy cập GitHub trên máy, thử lại hoặc dùng cách B tải thủ công. |
| `Cannot run yt-dlp` / `spawn ... ENOENT` | Kiểm tra `tools/yt-dlp.exe` và biến `YTDLP_PATH`; chạy executable trực tiếp bằng `--version`. |
| Không tìm thấy FFmpeg/FFprobe | Kiểm tra đủ hai file `.exe`, đặt cùng thư mục hoặc khai báo `FFMPEG_PATH` / `FFPROBE_PATH`, restart agent. |
| Công cụ chạy được nhưng agent vẫn lỗi | Kiểm tra override `$env:...` hoặc `.env` có trỏ đến file cũ không; chạy lại agent từ terminal đã cấu hình. |
| Không tải được vào thư mục đích | Dùng đường dẫn tuyệt đối tồn tại trên máy local, kiểm tra quyền ghi và dung lượng đĩa. |
| YouTube báo lỗi extractor/format/challenge | Cập nhật yt-dlp bằng script, kiểm tra Node.js và thử lại. Video riêng tư/giới hạn truy cập có thể cần cơ chế xác thực riêng; agent không tự lấy cookie từ Chrome. |
| File báo không đọc được/FFprobe failed | Kiểm tra FFprobe chạy được; thử URL khác và xem lỗi yt-dlp/FFprobe trong trạng thái. Không chạy tiếp bước upload với file chưa verified. |

### Lỗi extension và workflow

- Chạy `npm test` để kiểm tra điều phối nhiều profile, navigation/SPA, dialog và upload mẫu. Kiểm tra này không truy cập Facebook hay profile đăng nhập của bạn.
- **Extension chưa kết nối:** bảo đảm agent đang chạy, extension đã Reload và Extension options đã chọn đúng thư mục profile. Đúng profile phải chứa extension.
- **Nhập mô tả báo Element not actionable/not found:** kiểm tra role/label và index (index 1 là phần tử thứ hai). Extension 4.2.2 phục hồi index cũ chỉ khi các kết quả ngữ nghĩa còn đúng một editor, đồng thời focus lại editor nếu trang thay nó sau click; nếu có nhiều ô nhập thật sự, dùng picker/locator cụ thể hơn.
- **Options báo `Valid Bearer token or dashboard session required`:** cập nhật extension 4.2.1 và engine, restart `node index.js`, Reload extension rồi mở lại Options. Discovery dùng POST chỉ đọc để Chrome gửi Origin extension; token API không cần nhập vào extension.
- **Another extension is connected as this profile:** kiểm tra `chrome://version` trong từng cửa sổ và sửa ánh xạ profile ở Extension options; không chọn cùng thư mục cho hai profile khác nhau.
- **Page did not finish loading / Completion condition timed out:** kiểm tra dấu hiệu kết quả và tăng **Timeout tải trang / kết quả**. Với trang liên tục thay đổi DOM, đặt **DOM ổn định** bằng 0 và dùng điều kiện kết quả rõ ràng.
- **Element not found/actionable:** dùng **Chọn trên trang** khi dialog đã mở; kiểm tra tên nút/role và tăng `timeoutMs` nếu trang tải chậm.
- **Upload file does not exist:** kiểm tra đường dẫn tuyệt đối, tên file và quyền đọc trên máy.
- **File input không xác định:** chọn đúng nút upload hoặc dùng locator CSS/XPath cho `input[type=file]` trong dialog.
- **Port already in use:** chỉ chạy một agent trên cổng `34719`.

Agent chưa chạy website khác trong iframe hay Shadow DOM đóng; các trang đó cần bổ sung xử lý riêng.
