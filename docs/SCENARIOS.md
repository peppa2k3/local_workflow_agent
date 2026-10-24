# Local workflow agent

Remote control: use `node local-agent.js --daemon` for an always-on local agent,
and `/remote` to grant saved scenario/profile/variable permissions and approve a
VPS account. The VPS web UI runs/stops only those granted saved scenarios through
the existing workflow engine, with durable command IDs and per-step history. See
[remote setup and deployment](REMOTE_CONTROL.md). Remote run defaults to a
one-hour timeout; queue start deadlines are five minutes. Browser actions still
need the corresponding Chrome profile and extension online.

For scripted integrations, see [CLI and authenticated API v1](AUTOMATION_API.md). Run `node local-agent.js run --scenario NAME --profile "Profile 1" --var "caption=value" --wait` against a running agent configured with `LOCAL_AGENT_API_TOKEN`. API v1 requires an explicit profile and only accepts saved scenario names. Overrides merge with saved variables for this run without modifying the scenario; runtime download variables remain reserved. `GET /api/v1/runs/:runId` reports a stable execution ID and terminal outcome. Legacy `POST /api/run` also accepts `variables` and returns the run object. The dashboard and extension use the same action engine, including legacy CSS `selector` steps. Workflows now have a default one-hour execution budget, checked each second; API v1 can set `timeoutMs` up to 24 hours.

Run `node local-agent.js`, then open **http://127.0.0.1:34719** in your browser. The dashboard lets you create, reorder, edit, save, run, and stop scenarios. You can still enter `run scenarios/facebook-reels.json` in the terminal.
Choose **Chrome profile** in the dashboard, then Run or Stop for that profile. Each profile has its own workflow, target tab, progress, and error state; different profiles can run concurrently. **Mở profile** opens the selected Chrome profile. The list reads profile names/directories from Chrome's `Local State` metadata; it does not read cookies or login data. `Profile 2` remains the default for CLI and API requests that omit a profile. To change that default in PowerShell:

```powershell
$env:CHROME_PROFILE = 'Profile 1'
node .\local-agent.js
```

Load `chrome-reels-extension` with **Load unpacked** in **each** Chrome profile you want to control. Open the extension's **Options**, select the directory of that actual profile, and save. Find the directory at the end of **Profile Path** on `chrome://version` (for example `Default` or `Profile 1`). Chrome does not expose this directory automatically to the extension, so this one-time mapping is required. Duplicate connections using the same directory are rejected. Reload the extension and any open target tabs after changing its files. The extension runs in the existing Chrome profile; no Playwright connection is used. If you use a custom Chrome user-data directory, set `CHROME_USER_DATA_DIR` before starting the agent.

Edit a JSON file in `scenarios` and run it again. Steps run in order:

| Action | Fields | Effect |
| --- | --- | --- |
| `openUrl` | `url`, optional `navigationTimeoutMs`, `settleMs`, `completion` | Opens a new tab in the selected connected profile and waits for loading to finish. |
| `openFolder` | `path` | Opens a local directory in Windows Explorer. |
| `wait` | `ms` | Waits for a duration. |
| `waitFor` | `locatorType`, `locator`, optional `role`, `index`, `timeoutMs` | Waits for a visible matching element (default 10 seconds). |
| `click` | `locatorType`, `locator`, optional `role`, `index`, `timeoutMs`, `navigationTimeoutMs`, `settleMs`, `completion` | Clicks an actionable element and waits for navigation/DOM stability and the optional result condition. |
| `type` | `locatorType`, `locator`, `text`, optional `clear`, `timeoutMs` | Clicks an editable input/textarea/rich text area, confirms focus and caret, then enters text. |
| `setDate` | locator fields, `value` (`YYYY-MM-DD`), optional `format`, `timeoutMs`, `completion` | Clicks an input and fills a valid calendar date, then fires input/change and blurs. |
| `setTime` | locator fields, `value` (`HH:mm`), optional `timeoutMs`, `completion` | Clicks an input and fills a 24-hour time, then fires input/change and blurs. |
| `upload` | optional locator fields; `filePath` or `folder` + `filename` | Sets the chosen local file on a page's `input[type=file]`. |
| `scroll` | optional `pixels`, `times`, `intervalMs` | Sends mouse wheel input (defaults: 650, 1, 2500). |

Example:

```json
{
  "name": "My workflow",
  "steps": [
    { "action": "openFolder", "path": "C:\\Users\\Administrator\\Downloads" },
    { "action": "openUrl", "url": "https://www.facebook.com/" },
    { "action": "waitFor", "locatorType": "placeholder", "locator": "Search Facebook" },
    { "action": "type", "locatorType": "placeholder", "locator": "Search Facebook", "text": "example" },
    { "action": "scroll", "pixels": 650, "times": 3, "intervalMs": 2000 }
  ]
}
```

In the dashboard, choose **Role + name**, **Visible text**, **Label**, **Placeholder**, **Test ID**, **XPath**, or **CSS** for `click`, `type`, and `waitFor`. For example, a button with visible text "Tiếp" can use `{ "action": "click", "locatorType": "role", "role": "button", "locator": "Tiếp" }`. Text matching is exact after whitespace normalization. XPath can use `//button[normalize-space(.)='Tiếp']`. If multiple elements match, use `index` starting at 0 or a more specific locator. Old `selector` steps still work as CSS.

`type` handles normal inputs, textarea, and `contenteditable` editors. It clicks the field, focuses it, and positions the caret before browser input. A locator may identify a label, a child of a rich text editor, or a container such as `role=presentation` with one editable field. If clicking a placeholder reveals an editor, the action waits for it using `timeoutMs` (default 10000). A container with multiple editable fields must use a more specific locator. Readonly/disabled fields and containers without a usable editor fail instead of typing into the previously focused field. `clear: true` (default) selects and deletes old content through browser editing, including rich text; `clear: false` appends at the end. No separate click step is needed.

## Waiting for actions to finish

Only one step is issued at a time **per profile**. The next step, including local `wait`/`openFolder`, starts after the extension acknowledges completion. `openUrl` and `click` wait for Chrome's tab load status and `document.readyState === 'complete'`, then a quiet DOM/URL interval (`settleMs`, default 350 ms). The background worker owns navigation, so replacing the old document or redirecting does not lose the completion acknowledgement. A click observes navigation/new-tab creation for at least 500 ms; if it opens a new tab during that interval, later steps use that tab. The selected target tab remains bound even if you switch to another tab.

Page load does not tell an agent when a website's business operation is finished. For AJAX, delayed navigation, upload processing, or pages with continuously changing content, set **Chờ phần tử kết quả** in the dashboard or add `completion` to the action. It works on `openUrl`, `click`, `type`, `setDate`, `setTime`, and `upload` and accepts normal locator fields plus `state`: `visible` (default), `hidden`, or `enabled` (can receive a pointer click). For example:

```json
{
  "action": "click",
  "locatorType": "role",
  "role": "button",
  "locator": "Tải dữ liệu",
  "navigationTimeoutMs": 30000,
  "completion": {
    "locatorType": "css",
    "locator": "#results-ready",
    "state": "visible"
  }
}
```

The condition should identify the **new** result of this action. For a spinner, `hidden` succeeds as soon as no matching visible spinner exists, including when it has not appeared yet; prefer a result element that appears after success. With a result condition, the default DOM quiet interval is 0 because the explicit condition determines readiness. Set `settleMs` explicitly to override it. Without a result condition, use `settleMs: 0` if persistent page mutations prevent DOM stability, then put a `waitFor` step for the next control.

`navigationTimeoutMs` defaults to 30000 ms for page readiness and separately for the completion condition; `timeoutMs` continues to control finding the action target (default 10000 ms). A timeout/error stops that profile without issuing later steps. Stop cancels pending waits and rejects stale results; it cannot undo an input already delivered to the website. The agent also times out a browser action if its extension disappears. Browser actions require the selected profile's extension to be connected before Run.

For point-and-click selection, press **Chọn trên trang** on a step in the dashboard, switch to the Chrome tab, and click the target element. The picked locator is filled into the step. Press Esc to cancel. Save the scenario afterward.

For upload, add an **Upload file** step and pick the button that opens file selection. The action clicks that button, intercepts Chrome's file chooser, selects the file, and waits briefly for the page to receive it. It also works with a direct `input[type=file]` locator. Supply either a full `filePath`, or both `folder` and `filename`. In the dashboard, press **Chọn file…** beside **Đường dẫn file đầy đủ** to browse folders in the Windows file picker and fill `filePath`; save the scenario to keep that choice. To choose a different file for each run, leave the step's path fields empty and enter a path in **File upload cho lần chạy**, or press its **Chọn file…** button, before pressing Run. Canceling the picker leaves the current path unchanged. The run-time path takes precedence over paths saved in upload steps. The picker opens on the machine running `node local-agent.js`, so use the dashboard on that same machine to browse its files. From the terminal, use `run scenarios/my-workflow.json --upload "C:\\Users\\Administrator\\Downloads\\photo.jpg"`. The agent checks that the file exists and passes its absolute path to the extension. `waitAfterMs` controls the pause after selection; use a later `waitFor` step for a preview or completed-upload indicator. Add a later click if the site also requires a Submit button.

When a click opens a dialog or full-page overlay, put a `waitFor` step for a button in that dialog before the next `click` or `upload`. The agent waits until that button can receive a pointer click and prefers matching elements inside the visible dialog. Use **Chọn trên trang** after opening the dialog manually to capture its new button. If the button opens the Windows file chooser, use an `upload` step targeting that button instead of a separate `click` step.

`status` reports progress and errors for all profiles. Use `run scenarios/my-workflow.json --profile "Profile 1" --upload "C:\\Uploads\\photo.jpg"` to select a profile from the terminal. `stop "Profile 1"` interrupts only that workflow; plain `stop` uses the default profile. `exit` stops all workflows and ends the agent. If a new tab opens long after a click, use a later `openUrl` step to explicitly select its URL.

## Dates, times and variables

In the dashboard, add **Click và nhập ngày** or **Click và nhập giờ**, then use **Chọn trên trang** to identify the input. Native `input[type=date]` always receives `YYYY-MM-DD` regardless of Chrome's display language; native time receives `HH:mm`. For text/search/tel inputs, date `format` accepts `DD/MM/YYYY` (default), `MM/DD/YYYY`, or `YYYY-MM-DD`. Time text inputs receive `HH:mm`. Impossible dates, invalid times, readonly fields, and native min/max/step violations fail the action. Custom calendar widgets with readonly inputs require ordinary click steps on their calendar controls. These actions do not combine separate day/month/year controls or `datetime-local`; use separate steps for the page's fields.

Manage **Danh sách biến** in the top bar. Add names such as `ngay_dang`, `gio_dang`, or `noi_dung` and their values. Choose **Chèn tham chiếu biến…** under an input, or type `{{name}}` directly. Date/time fields offer **Nhập tham chiếu trực tiếp** to switch from the calendar/time picker to text. Variables are saved with each scenario, shared across that scenario's steps, and resolved afresh for every run on the chosen profile.

```json
{
  "name": "Schedule a post",
  "variables": {
    "ngay_dang": "2026-10-18",
    "gio_dang": "09:35",
    "noi_dung": "Bài đăng ngày {{ngay_dang}}",
    "cho_ms": "500"
  },
  "steps": [
    { "action": "setDate", "selector": "#date", "value": "{{ngay_dang}}" },
    { "action": "setTime", "selector": "#time", "value": "{{gio_dang}}" },
    { "action": "type", "selector": "#caption", "text": "{{noi_dung}}" },
    { "action": "wait", "ms": "{{cho_ms}}" }
  ]
}
```

References work in string fields in steps, including URLs, locators, completion locators, text, date/time values, upload paths, and numeric settings. Names use ASCII letters/numbers/underscore and start with a letter or underscore. Values may be strings, numbers, or booleans. Nested references are supported; missing/circular references stop the run before any action. Numeric settings and `clear` are converted after expansion. The saved JSON retains templates. A literal run-time upload path still takes precedence over the resolved paths in upload steps.

For example, keep `"text": "{{tenphimn}}"` in the step and set `variables.tenphimn` to the desired film name in the navbar. Run saves current values and the agent resolves the reference in memory before dispatching browser actions. Changing the variable changes the next run without editing the step. Seeing `{{tenphimn}}` in the editor/JSON is expected; the website receives its value. The dashboard checks agent capabilities and disables Run with an explicit restart message if an older Node process is still running. The extension also rejects unresolved variable tokens before clearing/inserting text. After updating, stop the old terminal agent (Ctrl+C or `exit`), run `node local-agent.js` again, Reload the extension, and reload the target tab/dashboard.

## Selecting and cloning scenarios

Changing **Kịch bản đã lưu** loads that scenario immediately; save edits before switching. Select a connected profile, select a scenario, then press Run. Run saves the editor and dispatches it to the profile captured when Run was pressed. Each profile still needs the one-time extension Options mapping described above. The dashboard locks editor operations while loading/saving/cloning to prevent overlapping requests from mixing scenarios.

**Clone kịch bản** saves the editor and creates an independent file with all steps and variables, using `-copy`, `-copy-2`, etc. It opens the copy for editing. The source is preserved; a destination that already exists is never overwritten. HTTP clients can use `POST /api/scenarios/<source>/clone` with `{ "name": "destination" }`.

## Performance and upload feedback

The dashboard shows agent CPU percentage (one core = 100%), process RSS memory, event loop p95 in milliseconds over two-second windows, and the selected profile's total/current/previous step times. These describe the Node agent, not Chrome's CPU or website/server processing. A long upload step can include locating the control, waiting for a chooser, assigning a file, `waitAfterMs`, and any explicit completion condition. Use a result element in `completion` to determine when the website has processed the upload.

The Windows file picker runs asynchronously with its console hidden and a foreground owner. Its buttons disable until selection/cancel, and the agent rejects duplicate picker requests. Other dashboard requests have a 10-second timeout and status polling does not overlap. The extension reuses its debugger connection, handles detach, and checks chooser readiness without a fixed extra 200 ms pause. `waitAfterMs` still defaults to 500 ms for compatibility; set `0` and use a meaningful completion condition if the page supports it.

## Tải video bằng yt-dlp + FFmpeg

Action `downloadVideo` chạy trong agent, không cần mở Chrome. Dashboard có nút **Phân tích URL / lấy tên** để đọc title/ID trước khi tải, hỗ trợ biến. Chọn profile để theo dõi tác vụ; workflow có bước trình duyệt vẫn cần extension.

Ví dụ: `{"action":"downloadVideo","url":"https://www.youtube.com/watch?v=9qq_Fqp2rnM","directory":"D:\\Videos","quality":"best","downloadTimeoutMs":1800000}`.

- `url`: HTTP/HTTPS của một video; không playlist/live, không credentials trong URL.
- `directory`: đường dẫn tuyệt đối, được tạo nếu chưa có.
- `quality`: mặc định `"best"`. Luôn chọn từ cao xuống thấp theo FPS → độ phân giải cạnh ngắn → bitrate → codec, không giới hạn 1080p/4K. Cùng FPS mới so độ phân giải; vì vậy 1080p60 được ưu tiên trước 4K30 theo chính sách FPS trước. Giá trị số 360/480/720/1080/1440/2160 trong JSON cũ vẫn được đọc nhưng không còn giới hạn chất lượng. Không cần sửa các kịch bản cũ. FFmpeg ghép hình/tiếng, không ép nén hoặc tăng FPS. Container ghép ưu tiên MP4; một luồng giữ định dạng nguồn.
- Tên cuối: `tiêu đề.ext`, không tự gắn `[ID]`. Lấy metadata thật, xử lý ký tự Windows, giới hạn phần tiêu đề theo template 150B của yt-dlp. URL đã tải và còn đúng file/hash thì dùng lại file; trường hợp cần tải mới, trùng tên tạo `tiêu đề (2).ext`, `(3)`… và không ghi đè. ID vẫn có trong metadata và `{{download_id}}`.
- Timeout tổng phân tích + tải: mặc định 30 phút, 1000–7200000 ms. Nút Dừng hủy cây tiến trình yt-dlp/FFmpeg; file .part hoặc file đã xong trước lúc dừng có thể còn lại.

Status trả `download` gồm title, id, name, filePath, bytes, width, height, fps, videoCodec, audioCodec, bitrate; chỉ báo thành công sau hậu xử lý và xác nhận file tồn tại, khác rỗng. API phân tích: POST `/api/video/inspect` với `{"url":"https://..."}`, trả title/id/url/duration, timeout 60 giây.

Dùng mẫu `scenarios/video-download.json`, sửa `video_url` và `thu_muc_tai`. Cài bằng `npm run setup:video`, xem [SETUP](SETUP.md). Không đọc cookies/profile Chrome. Website yêu cầu đăng nhập/chống bot có thể từ chối và lỗi được hiển thị.

Tùy chọn metadata, output template và after_move: https://github.com/yt-dlp/yt-dlp#readme

## Nối download → mở URL → upload Reels

Mẫu hoàn chỉnh: `scenarios/download-upload-reels.json`. Chọn mẫu trong dashboard, sửa `video_url`, `thu_muc_tai`, `reels_url`, chọn Chrome profile đã kết nối và chạy. Mẫu tải clip, xác nhận file, mở Reels, tạo thước phim, upload chính clip đó, bấm Tiếp và điền mô tả bằng tiêu đề. Mẫu dừng ở màn hình soạn/xem lại, không tự bấm Đăng. Có thể thêm bước click Đăng và điều kiện hoàn tất phù hợp nếu muốn tự xuất bản.

Các locator tiếng Việt lấy theo luồng hiện có trong dự án; nút/ô mô tả có thể khác theo tài khoản, phiên bản hoặc ngôn ngữ Facebook. Dùng “Chọn trên trang” để chỉnh. Bước upload mẫu chờ nút Tiếp enabled tối đa 300000 ms; đây là dấu hiệu tiếp tục của giao diện, không khẳng định máy chủ Facebook đã xử lý xong video. Nếu trang có dấu hiệu xử lý riêng, đổi completion hoặc thêm waitFor cho dấu hiệu đó.

| Tham chiếu | Giá trị sau downloadVideo |
| --- | --- |
| `{{download_title}}` | Tiêu đề gốc / tên phim đọc từ metadata URL |
| `{{download_file_name}}` | Tên file thực tế đã lưu, gồm phần mở rộng |
| `{{download_file_path}}` | Đường dẫn tuyệt đối đến chính clip vừa tải |
| `{{download_id}}` | ID video |

Có thể tạo alias như `"ten_phim": "{{download_title}}"`, rồi dùng `{{ten_phim}}` trong bước type. Dropdown “Chèn tham chiếu biến” có sẵn bốn giá trị này. Không tự khai báo lại biến có tên download_title/file_name/file_path/id.

Ví dụ bước sau download:
```json
{ "action": "upload", "label": "Upload clip vừa tải", "selector": "#upload", "filePath": "{{download_file_path}}" }
```

Agent chỉ tạo các tham chiếu sau khi yt-dlp thoát thành công, in đường dẫn ở after_move (sau ghép/hậu xử lý), file cuối tồn tại và khác rỗng, không có đuôi .part/.ytdl/.tmp, FFprobe đọc được video stream và thời lượng dương. Status có `download.verified: true`. Chỉ lúc đó mới chuyển sang openUrl/upload; không suy ra xong từ phần trăm hoặc chờ số giây cố định. FFprobe kiểm tra cấu trúc/metadata media, không giải mã kiểm tra từng frame.

Tham chiếu kết quả phải xuất hiện sau một downloadVideo trong kịch bản. Giá trị được giải quyết và validate ngay trước từng bước; upload kiểm tra lại file tồn tại/khác rỗng. Với filePath tham chiếu kết quả, ô “File upload cho lần chạy” không thay thế clip đã tải. Các upload tĩnh vẫn hỗ trợ đường dẫn override như trước. Mỗi lần chạy/profile có kết quả runtime riêng; downloadVideo có thể tạo kết quả từ cache URL đã xác minh. Download thất bại, kiểm tra lỗi hoặc Dừng sẽ chặn các bước tiếp theo. Nhiều downloadVideo: tham chiếu dùng kết quả gần nhất đã thành công.

## Tên bước và xóa kịch bản

Mỗi bước có trường `label` tùy chọn. Dashboard cho nhập “Tên bước (tùy chọn)”, giữ tên khi lưu/clone/đổi vị trí, hiển thị tên trong trạng thái chạy. Để trống thì hiển thị “Bước 1”, “Bước 2”… theo vị trí hiện tại. Kịch bản cũ không cần sửa.

Nút “Xóa kịch bản” xóa file JSON đã lưu sau hộp xác nhận, cập nhật danh sách và mở kịch bản còn lại; nếu hết thì tạo editor mới chưa lưu. Không xóa video tải về. API: DELETE `/api/scenarios/<name>`, kiểm tra tên như GET/PUT. Agent từ chối xóa kịch bản đang được workflow từ dashboard/API sử dụng ở bất kỳ profile nào; dừng các workflow đó trước. CLI chạy bản sao kịch bản trong bộ nhớ, không khóa file theo tên dashboard.

Khởi động lại `node local-agent.js`, tải lại dashboard và Reload extension sau cập nhật. Agent công bố capability `download-references-v1` và `scenario-management-v1`.


## Chất lượng và công bố file cuối (2026-10-20)

yt-dlp dùng `bv*+ba/b` và `--format-sort-force --format-sort fps,res,vbr,abr,tbr,vcodec,acodec`. `res` là cạnh ngắn nên video dọc 1440×1920 không bị loại bởi bộ lọc height<=1080 cũ. Ưu tiên được áp dụng trong các định dạng nguồn trả về; URL trực tiếp chỉ có một định dạng thì giữ nguyên. Không thể tạo thêm chi tiết hoặc FPS thật ngoài nguồn. Bitrate giữa các codec khác nhau không là thước đo chất lượng tuyệt đối.

Tải/ghép/FFprobe trong thư mục riêng `.video-download-…` dưới thư mục đã chọn. Chỉ sau khi xác nhận file cuối, agent mới công bố tên sạch bằng hard link độc quyền trên cùng filesystem (cần filesystem hỗ trợ hard link, ví dụ NTFS); trùng tên tăng số, kể cả hai profile chạy đồng thời. Thư mục làm việc riêng được dọn sau khi hoàn thành/lỗi/dừng. File hoàn chỉnh đã công bố có thể còn lại nếu dừng ngay sau công bố. Không tự đổi tên/xóa các clip cũ.

Các tham chiếu download_file_path/download_file_name trỏ tới file đã công bố với tên sạch, sau đó mới mở URL/upload. Dashboard hiển thị độ phân giải, FPS và codec từ FFprobe khi hoàn tất. Nếu đổi bộ công cụ, FFprobe vẫn phải có sẵn. Khởi động lại agent để dùng capability `video-quality-best-v1`; Reload bridge 4.0.2 và dashboard.

Tài liệu tùy chọn chính thức: https://github.com/yt-dlp/yt-dlp#sorting-formats


## Cập nhật trạng thái dashboard và hiệu suất (2026-10-21)

Dashboard dùng một timer nối tiếp sau khi request hoàn tất, không dùng interval gọi liên tục. Khi không chạy workflow: thăm dò mỗi 10 giây (khoảng 6 lần/phút, trước đây 40); có workflow đang chạy: 1,5 giây; đang chọn phần tử: 1 giây. Tab nền dừng timer; trở lại tab cập nhật ngay. Chuyển profile, Chạy/Dừng hoặc mở profile yêu cầu cập nhật ngay. Các tab dashboard khác không hiển thị sẽ không tiếp tục thăm dò.

Request profiles đang chờ được dùng chung cho thăm dò và kiểm tra trước Chạy. Mỗi tab chỉ có một request profiles đang chờ. Agent lỗi: thử lại sau 5, 10, 20, 40 rồi tối đa 60 giây; thành công trở về nhịp bình thường. Request đã bắt đầu trước khi tab bị ẩn có thể hoàn tất; không tạo chuỗi mới khi còn ẩn.

Chỉ cập nhật text/thuộc tính DOM khi giá trị đổi. Không dựng lại editor trong vòng thăm dò. Profile options được tái sử dụng và không sửa dropdown profile đang focus. CPU/RAM/event loop vẫn hiển thị theo lần cập nhật, không cần request riêng.

Agent nạp metadata Chrome Local State bất đồng bộ trước khi lắng nghe; sau đó handler dùng cache RAM, làm mới bất đồng bộ khi cache hết hạn 30 giây. Các yêu cầu đồng thời dùng chung một lượt đọc. Lỗi đọc tạm trong lúc Chrome ghi metadata giữ snapshot hợp lệ trước đó. Profile mới/đổi tên có thể xuất hiện sau lượt làm mới tiếp theo. Không đọc cookie hoặc sử dụng profile đăng nhập để kiểm thử.

Áp dụng: khởi động lại `node local-agent.js` và tải lại dashboard. Endpoint `/api/profiles`, schema và extension vẫn tương thích.

## Lịch sử, cache URL và metadata upload (2026-10-22)

Agent lưu bền vững lịch sử từng step tại `data/agent/`, gồm thành công/thất bại/Dừng, thời gian, file/URL và vị trí dừng. Restart sau khi tiến trình bị ngắt đánh dấu lượt còn chạy là `interrupted`; không tự thực hiện lại các thao tác. Dashboard có nút **Xem / làm mới lịch sử profile**. URL đã tải được tra trước khi truy cập nguồn: file còn đúng size/SHA-256 thì báo đã tải và dùng đúng path đó cho các bước tiếp theo; file mất/đổi thì tải mới. Các yêu cầu cùng URL được xếp hàng trong agent để tránh tải trùng.

Upload có các trường tùy chọn `pageId`, `pageName`, `pageUrl`, `platform`, `publicationDesc`, `folderTag`, hỗ trợ biến thông thường/runtime. Nên dùng `pageName: "{{page_name}}"`, `pageUrl: "{{reels_url}}"` và UUID page từ Content Manager nếu đã tồn tại; UUID khác ID số Facebook. Agent lưu SHA-256 asset, file instance, page, publication và sự kiện upload theo hợp đồng Team Content Manager. `uploaded_at` ghi thời gian hoàn tất thao tác; `published_at: null` khi chưa biết bài có được đăng hay chưa. Upload legacy/CSS selector vẫn chạy khi chưa thêm metadata.

Xem cấu hình `MONGODB_URI`/`MONGODB_DATABASE`, ví dụ JSON, mô hình dữ liệu và giới hạn tại [ACTIVITY_STORAGE.md](ACTIVITY_STORAGE.md). Không cấu hình MongoDB vẫn dùng đầy đủ lịch sử/cache local. Reload extension 4.1.0, restart agent và tải lại dashboard để nhận URL tab thực tế và giao diện mới. Không ghi đè các kịch bản người dùng đang chỉnh.

## MongoDB Atlas, .env và chọn page từ kho chung

Agent đọc `.env` ở thư mục dự án, gồm `MONGODB_URI` và `MONGODB_DATABASE=team_content`. Mở `/content` để kiểm tra/kết nối lại, xem/tìm download, upload và lịch sử từ database, tạo/sửa page, cập nhật mô tả/ngày đăng/permalink publication. Trong bước upload, nút **Chọn page từ MongoDB** điền UUID/tên/URL/nền tảng từ page active dùng chung. Trước khi chọn file, agent kiểm tra lại page trong database; page inactive hoặc lỗi kết nối dừng bước có metadata page. Biến và CSS selector legacy vẫn được giữ. Reload extension 4.2.0, restart agent và dashboard sau nâng cấp; xem [MONGODB_ATLAS.md](MONGODB_ATLAS.md).

# Kiểm tra trùng download/upload

Trước `downloadVideo`, agent kiểm tra URL chuẩn hóa trong lịch sử local và collection `downloads` của MongoDB nếu đã cấu hình. Trước `upload`, agent đối chiếu đường dẫn, tên file (không phân biệt hoa/thường) và SHA-256 với `file_instances`, `upload_events`, `publications`, trên mọi page. File đã nhập kho nhưng chưa có upload/publication không tự coi là upload trùng.

Khi trùng, workflow giữ bước hiện tại và trả `paused: true`, `confirmation` trong status; extension chưa nhận bước upload. Popup trên dashboard local có **Dừng tác vụ** và **Xác nhận tiếp tục**. Download sau xác nhận vẫn dùng cache nếu file còn đúng size/hash; nếu không còn file hợp lệ thì tải lại. Upload sau xác nhận là chủ động cho phép upload thêm lần nữa. Quyết định được lưu cùng step; ID xác nhận cũ hoặc khác execution bị từ chối. Stop, timeout và restart không tự tiếp tục tác vụ đang chờ.

Agent ghi sự kiện upload `pending` trước dispatch và đổi thành `uploaded` sau acknowledgement. Nếu lỗi hoặc mất phản hồi, bản ghi pending vẫn cảnh báo nguy cơ trùng ở lần chạy sau. MongoDB đã cấu hình nhưng không truy vấn được sẽ làm tác vụ thất bại và hiển thị popup; không tự bỏ kiểm tra DB. Trong một process agent, các thao tác media được tuần tự hóa đến kết quả; các service độc lập vẫn cần phối hợp khóa riêng nếu yêu cầu chống chạy đồng thời giữa nhiều máy.

Popup lỗi có nút **Đã hiểu** trên các trang local. Web VPS thông báo tác vụ tạm dừng và yêu cầu mở dashboard local để xác nhận. Các bước click xuất bản riêng của website vẫn cần điều kiện xác nhận tương ứng; acknowledgement upload không chứng minh đã xuất bản.

