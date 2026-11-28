# Local workflow agent

Extension 4.2.1 uses read-only POST `/api/profiles` for profile discovery so
Chrome includes the extension Origin when the engine has an API token enabled.
Restart the updated engine and reload the extension after upgrading. Workflow
actions and legacy CSS selectors are unchanged.

Source layout: runtime, dashboard, docs and scenario templates live inside
the standalone local app. Saved JSON uses app-local `scenarios/`, with legacy
repository-root scenarios supported until migration. Keep using
`node index.js` and the same actions, variables and legacy CSS `selector`
steps. See the [local app guide](../README.md).

In the dashboard, saved steps initially show a compact header with step name,
action, ↑ ↓ and delete. Use **▾ Mở** to edit all fields or **▴ Thu** to hide them.
New steps open for editing automatically. Moving a step keeps its expanded state;
expand/collapse does not change the scenario JSON or action behavior.

Remote control: use `node index.js --daemon` for an always-on local agent,
and `/remote` to grant saved scenario/profile/variable permissions and approve a
VPS account. The VPS web UI runs/stops only those granted saved scenarios through
the existing workflow engine, with durable command IDs and per-step history. See
[remote setup and deployment](../../guides-server.md). Remote run defaults to a
one-hour timeout; queue start deadlines are five minutes. Browser actions still
need the corresponding Chrome profile and extension online.

For scripted integrations, see [CLI and authenticated API v1](AUTOMATION_API.md). Run `node index.js run --scenario NAME --profile "Profile 1" --var "caption=value" --wait` against a running agent configured with `LOCAL_AGENT_API_TOKEN`. API v1 requires an explicit profile and only accepts saved scenario names. Overrides merge with saved variables for this run without modifying the scenario; runtime download variables remain reserved. `GET /api/v1/runs/:runId` reports a stable execution ID and terminal outcome. Legacy `POST /api/run` also accepts `variables` and returns the run object. The dashboard and extension use the same action engine, including legacy CSS `selector` steps. Workflows now have a default one-hour execution budget, checked each second; API v1 can set `timeoutMs` up to 24 hours.

Run `node index.js`, then open **http://127.0.0.1:34719** in your browser. The dashboard lets you create, reorder, edit, save, run, and stop scenarios. You can still enter `run scenarios/facebook-reels.json` in the terminal.
Choose **Chrome profile** in the dashboard, then Run or Stop for that profile. Each profile has its own workflow, target tab, progress, and error state; different profiles can run concurrently. **Mở profile** opens the selected Chrome profile. The list reads profile names/directories from Chrome's `Local State` metadata; it does not read cookies or login data. `Profile 2` remains the default for CLI and API requests that omit a profile. To change that default in PowerShell:

```powershell
$env:CHROME_PROFILE = 'Profile 1'
node .\index.js
```

Load `chrome-reels-extension` with **Load unpacked** in **each** Chrome profile you want to control. Open the extension's **Options**, select the directory of that actual profile, and save. Find the directory at the end of **Profile Path** on `chrome://version` (for example `Default` or `Profile 1`). Chrome does not expose this directory automatically to the extension, so this one-time mapping is required. Duplicate connections using the same directory are rejected. Reload the extension and any open target tabs after changing its files. The extension runs in the existing Chrome profile; no Playwright connection is used. If you use a custom Chrome user-data directory, set `CHROME_USER_DATA_DIR` before starting the agent.

Edit a JSON file in `scenarios` and run it again. Steps run in order:

| Action | Fields | Effect |
| --- | --- | --- |
| `openUrl` | `url`, optional `navigationTimeoutMs`, `settleMs`, `completion` | Opens a new tab in the selected connected profile and waits for loading to finish. |
| `closeTab` | None | Closes the most recent unmatched tab created by an `openUrl` step in the same run. |
| `openFolder` | `path` | Opens a local directory in Windows Explorer. |
| `wait` | `ms` | Waits for a duration. |
| `waitFor` | `locatorType`, `locator`, optional `role`, `index`, `timeoutMs` | Waits for a visible matching element (default 10 seconds). |
| `click` | `locatorType`, `locator`, optional `role`, `index`, `timeoutMs`, `navigationTimeoutMs`, `settleMs`, `completion` | Clicks an actionable element, waits for navigation and an optional result condition. DOM quiet waiting defaults to 0. |
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

For semantic `type` locators (role/label/placeholder/text), a valid explicit
`index` still selects that visible match. If the index is no longer available
because a duplicate disappeared or dialog scoping narrowed the results, the
action may recover only when all matching candidates identify exactly one
editable field. Multiple distinct editors remain an error; CSS/XPath indices
stay strict. Indices must be nonnegative integers. `role: textbox` also supports
contenteditable editors without an explicit role attribute.

If the clicked placeholder is replaced, `type` resolves the new matching field
or the editor carrying the same accessible label, keeping active-dialog scope,
then sets focus/caret even if the page did not focus it. It does not repeat the
activation click. Missing indexed targets now report the requested index and
visible match count to make stale locator/index settings easier to diagnose.

## Waiting for actions to finish

Only one step is issued at a time **per profile**. The next step, including local `wait`/`openFolder`, starts after the extension acknowledges completion. `openUrl` and `click` wait for Chrome's tab load status and `document.readyState === 'complete'`. `openUrl` then waits for a quiet DOM/URL interval (`settleMs`, default 350 ms); `click` defaults to `settleMs: 0` so video/progress updates cannot block an already delivered click. The background worker owns navigation, so replacing the old document or redirecting does not lose the completion acknowledgement. A click observes navigation/new-tab creation for at least 500 ms; if it opens a new tab during that interval, later steps use that tab. The selected target tab remains bound even if you switch to another tab. Add **Đóng tab đã mở** (`{ "action": "closeTab" }`) after the steps that use a tab opened by **Mở URL**. With several open steps, close steps work from newest to oldest. The action closes the recorded tab even if a click switched the workflow to another tab. It reports a step error if the recorded tab has already been closed. Reload the Chrome extension after updating the agent to use this action.

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

The condition should identify the **new** result of this action. For a spinner, `hidden` succeeds as soon as no matching visible spinner exists, including when it has not appeared yet; prefer a result element that appears after success. With a result condition, the default DOM quiet interval is 0 because the explicit condition determines readiness. Set `settleMs` explicitly to override it. A clicked button may remain visible and be clicked again in the following step: its disappearance is never required implicitly. An unfinished `completion` object with only type/state and no locator/selector is ignored on the prepared copy; saved JSON is not rewritten. Use a completion locator or a separate `waitFor` for the actual next UI control. Explicit DOM quiet timeouts report `Page DOM did not settle...`; increasing page-load timeout alone does not fix an endlessly changing DOM.

`navigationTimeoutMs` defaults to 30000 ms for page readiness and separately for the completion condition; `timeoutMs` continues to control finding the action target (default 10000 ms). A timeout/error stops that profile without issuing later steps. Stop cancels pending waits and rejects stale results; it cannot undo an input already delivered to the website. The agent also times out a browser action if its extension disappears. At the first browser step, the agent launches the selected profile if its extension is offline and waits up to 60 seconds for it to poll.

For point-and-click selection, press **Chọn trên trang** on a step in the dashboard, switch to the Chrome tab, and click the target element. The picked locator is filled into the step. Press Esc to cancel. Save the scenario afterward.

For upload, add an **Upload file** step and pick the button that opens file selection. The action clicks that button, intercepts Chrome's file chooser, selects the file, and waits briefly for the page to receive it. It also works with a direct `input[type=file]` locator. Supply either a full `filePath`, or both `folder` and `filename`. In the dashboard, press **Chọn file…** beside **Đường dẫn file đầy đủ** to browse folders in the Windows file picker and fill `filePath`; save the scenario to keep that choice. To choose a different file for each run, leave the step's path fields empty and enter a path in **File upload cho lần chạy**, or press its **Chọn file…** button, before pressing Run. Canceling the picker leaves the current path unchanged. The run-time path takes precedence over paths saved in upload steps. The picker opens on the machine running `node index.js`, so use the dashboard on that same machine to browse its files. From the terminal, use `run scenarios/my-workflow.json --upload "C:\\Users\\Administrator\\Downloads\\photo.jpg"`. The agent checks that the file exists and passes its absolute path to the extension. `waitAfterMs` controls the pause after selection; use a later `waitFor` step for a preview or completed-upload indicator. Add a later click if the site also requires a Submit button.

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

For example, keep `"text": "{{tenphimn}}"` in the step and set `variables.tenphimn` to the desired film name in the navbar. Run saves current values and the agent resolves the reference in memory before dispatching browser actions. Changing the variable changes the next run without editing the step. Seeing `{{tenphimn}}` in the editor/JSON is expected; the website receives its value. The dashboard checks agent capabilities and disables Run with an explicit restart message if an older Node process is still running. The extension also rejects unresolved variable tokens before clearing/inserting text. After updating, stop the old terminal agent (Ctrl+C or `exit`), run `node index.js` again, Reload the extension, and reload the target tab/dashboard.

## Selecting and cloning scenarios

Changing **Kịch bản đã lưu** loads that scenario immediately; save edits before switching. Select a profile, select a scenario, then press Run. Run saves the editor and dispatches it to the profile captured when Run was pressed. Each profile still needs the one-time extension Options mapping described above. The dashboard locks editor operations while loading/saving/cloning to prevent overlapping requests from mixing scenarios.

**Clone kịch bản** saves the editor and creates an independent file with all steps and variables, using `-copy`, `-copy-2`, etc. It opens the copy for editing. The source is preserved; a destination that already exists is never overwritten. HTTP clients can use `POST /api/scenarios/<source>/clone` with `{ "name": "destination" }`.

## Performance and upload feedback

The dashboard shows agent CPU percentage (one core = 100%), process RSS memory, event loop p95 in milliseconds over two-second windows, and the selected profile's total/current/previous step times. These describe the Node agent, not Chrome's CPU or website/server processing. A long upload step can include locating the control, waiting for a chooser, assigning a file, `waitAfterMs`, and any explicit completion condition. Use a result element in `completion` to determine when the website has processed the upload.

The Windows file picker runs asynchronously with its console hidden and a foreground owner. Its buttons disable until selection/cancel, and the agent rejects duplicate picker requests. Other dashboard requests have a 10-second timeout and status polling does not overlap. The extension reuses its debugger connection, handles detach, and checks chooser readiness without a fixed extra 200 ms pause. `waitAfterMs` still defaults to 500 ms for compatibility; set `0` and use a meaningful completion condition if the page supports it.

## Tải video bằng yt-dlp + FFmpeg

Action `downloadVideo` chạy trong agent, không cần mở Chrome. Dashboard có nút **Phân tích URL / lấy tên** để đọc title/ID trước khi tải, hỗ trợ biến. Chọn profile để theo dõi tác vụ; workflow có bước trình duyệt vẫn cần extension.

Khi bước chạy từ URL HTTP/HTTPS, agent kiểm tra nguồn, tên file và đường dẫn đích rồi hiện popup trên dashboard local. Lượt chạy từ control-server cũng hiện popup trên trang thiết bị đang chạy. **Yes** cho phép tải hoặc dùng file cache đã xác minh. **No** dừng lượt chạy tại bước này. Sau 30 giây, agent mặc định chọn **Yes**. Lượt chạy remote dành thêm tối đa 4 giây để nhận quyết định đã gửi đúng hạn qua polling. Bước sau chỉ chạy khi file sẵn sàng và đã được xác minh. Bước dùng `clip:` mở video đã lưu trực tiếp.

Ví dụ: `{"action":"downloadVideo","url":"https://www.youtube.com/watch?v=9qq_Fqp2rnM","directory":"D:\\Videos","quality":1080,"language":"vi","downloadTimeoutMs":1800000}`.

- `url`: HTTP/HTTPS của một video; không playlist/live, không credentials trong URL.
- `directory`: đường dẫn tuyệt đối, được tạo nếu chưa có.
- `quality`: mặc định `1080` (Full HD); chọn 360/480/720/1080/1440/2160 hoặc `"best"`. Ưu tiên độ phân giải cạnh ngắn lớn nhất không vượt mức, sau đó FPS/bitrate/codec. Nếu chỉ có bản vượt mức, chọn bản nhỏ nhất có sẵn; không upscale hoặc ép nén. `"best"` chọn độ phân giải cao nhất. Giá trị số trong JSON cũ nay được áp dụng thật.
- `language`: mặc định `"vi"` (audio tiếng Việt); có thể dùng `en`, `zh`, `ja`, `ko`, mã ngôn ngữ như `pt-BR`, hoặc `"auto"` theo nguồn. Ưu tiên audio khớp mã; nếu thiếu dùng audio nguồn. Không tự dịch/lồng tiếng hoặc tải phụ đề. Cache cũ không có tùy chọn sẽ được tải lại; thay ngôn ngữ/độ phân giải không tái sử dụng file của tùy chọn khác.
- Tên cuối: `tiêu đề.ext`, không tự gắn `[ID]`. Lấy metadata thật, xử lý ký tự Windows, giới hạn phần tiêu đề theo template 150B của yt-dlp. URL đã tải và còn đúng file/hash thì dùng lại file; trường hợp cần tải mới, trùng tên tạo `tiêu đề (2).ext`, `(3)`… và không ghi đè. ID vẫn có trong metadata và `{{download_id}}`.
- Timeout phân tích và tải: mỗi giai đoạn mặc định 30 phút, 1000–7200000 ms. Thời gian xác nhận tính riêng. Nút Dừng hủy cây tiến trình yt-dlp/FFmpeg.

Status trả `download` gồm title, id, name, filePath, bytes, width, height, fps, videoCodec, audioCodec, bitrate; chỉ báo thành công sau hậu xử lý và xác nhận file tồn tại, khác rỗng. API phân tích: POST `/api/video/inspect` với `{"url":"https://..."}`, trả title/id/url/duration, timeout 60 giây.

Với DASH hoặc HLS do yt-dlp tải trực tiếp, agent mặc định tải 4 đoạn song song cho mỗi lượt. Có thể chỉnh `YTDLP_CONCURRENT_FRAGMENTS` từ 1 đến 8 trong `.env` của agent rồi khởi động lại. Nếu yt-dlp vẫn báo thiếu đoạn sau khi thử lại, bước tải thất bại và không xuất file. Tùy chọn tốc độ không đổi cache, độ phân giải hoặc ngôn ngữ.

Dùng mẫu `scenarios/video-download.json`, sửa `video_url` và `thu_muc_tai`. Cài bằng `npm run setup:video`, xem [SETUP](../../guides-local.md). Không đọc cookies/profile Chrome. Website yêu cầu đăng nhập/chống bot có thể từ chối và lỗi được hiển thị.

Tùy chọn metadata, output template và after_move: https://github.com/yt-dlp/yt-dlp#readme

## Chọn clip từ thư mục lưu trữ

- Trong bước **Tải video**, đặt **Thư mục lưu** thành đường dẫn tuyệt đối hoặc tham chiếu như `{{thu_muc_tai}}`. Nhập URL để tải clip mới, hoặc bấm **Chọn clip đã lưu…** để dùng một video có sẵn trong thư mục đó. Agent kiểm tra video bằng FFprobe, dùng file tại chỗ và điền đủ bốn biến `download_*`. Tên clip bỏ phần mở rộng được dùng làm `download_title`, còn tên đầy đủ được dùng làm `download_id`.
- Trong bước **Upload file**, đặt ô **Thư mục lưu trữ** thành đường dẫn hoặc biến thư mục. Nếu để trống, bộ chọn dùng thư mục của bước **Tải video** gần nhất phía trước. Bấm **Chọn clip đã lưu…** để điền file cho bước này. Lựa chọn này áp dụng riêng cho bước và được ưu tiên trước ô **File upload cho lần chạy**. Nút **Chọn file…** vẫn mở hộp thoại Windows để chọn đường dẫn.
- Khi ô nguồn hoặc đường dẫn tham chiếu trực tiếp một biến (ví dụ `{{video_url}}`), dùng **Chọn clip đã lưu…** ở dòng biến để giữ nguyên tham chiếu. Các bước dùng chung biến cần cùng một thư mục lưu trữ để chọn theo biến. Tìm theo tên để thu hẹp danh sách nếu có hơn 60 kết quả.

JSON dùng `clip:tên-file.mp4` trong `downloadVideo.url`, `upload.filePath` hoặc giá trị của biến mà các ô này sử dụng. Ví dụ:

```json
{
  "variables": { "video_url": "clip:Clip đã lưu.mp4", "thu_muc_tai": "D:\\Videos" },
  "steps": [
    { "action": "downloadVideo", "url": "{{video_url}}", "directory": "{{thu_muc_tai}}" },
    { "action": "upload", "selector": "input[type=file]", "filePath": "{{download_file_path}}" }
  ]
}
```

Để chọn từ control-server, trên trang **Remote Control** của máy agent, cấp quyền chạy scenario và bật **Cho phép xem tên và chọn clip đã lưu từ control-server** cho scenario đó. Nếu cần chọn ở dòng biến, cấp thêm quyền thay giá trị biến tương ứng. Trên control-server, chọn thiết bị đang online, rồi chọn clip theo bước hoặc theo biến. Lựa chọn trên control-server áp dụng cho lượt chạy. Agent chỉ gửi tên clip trong thư mục đã cấu hình của scenario. Clip vẫn nằm trên máy agent và Chrome trên máy đó thực hiện upload.

## Nối download → mở URL → upload Reels

Mẫu hoàn chỉnh: `scenarios/download-upload-reels.json`. Chọn mẫu trong dashboard, sửa `video_url`, `thu_muc_tai`, `reels_url`, chọn Chrome profile và chạy. Mẫu tải clip, xác nhận file, mở Reels, tạo thước phim, upload chính clip đó, bấm Tiếp và điền mô tả bằng tiêu đề. Mẫu dừng ở màn hình soạn/xem lại, không tự bấm Đăng. Có thể thêm bước click Đăng và điều kiện hoàn tất phù hợp nếu muốn tự xuất bản.

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

Với nguồn URL, agent nhận đường dẫn file ở after_move sau khi yt-dlp hoàn thành ghép/hậu xử lý. Với cả URL và clip đã lưu, file phải tồn tại, khác rỗng, có video stream và thời lượng dương theo FFprobe trước khi agent điền các tham chiếu và chuyển sang openUrl/upload. Status có `download.verified: true`. FFprobe kiểm tra cấu trúc/metadata media.

Tham chiếu kết quả phải xuất hiện sau một downloadVideo trong kịch bản. Giá trị được giải quyết và validate ngay trước từng bước; upload kiểm tra lại file tồn tại/khác rỗng. Với filePath tham chiếu kết quả, ô “File upload cho lần chạy” không thay thế clip đã tải. Các upload tĩnh vẫn hỗ trợ đường dẫn override như trước. Mỗi lần chạy/profile có kết quả runtime riêng; downloadVideo có thể tạo kết quả từ cache URL đã xác minh. Download thất bại, kiểm tra lỗi hoặc Dừng sẽ chặn các bước tiếp theo. Nhiều downloadVideo: tham chiếu dùng kết quả gần nhất đã thành công.

## Tên bước và xóa kịch bản

Mỗi bước có trường `label` tùy chọn. Dashboard cho nhập “Tên bước (tùy chọn)”, giữ tên khi lưu/clone/đổi vị trí, hiển thị tên trong trạng thái chạy. Để trống thì hiển thị “Bước 1”, “Bước 2”… theo vị trí hiện tại. Kịch bản cũ không cần sửa.

Nút “Xóa kịch bản” xóa file JSON đã lưu sau hộp xác nhận, cập nhật danh sách và mở kịch bản còn lại; nếu hết thì tạo editor mới chưa lưu. Không xóa video tải về. API: DELETE `/api/scenarios/<name>`, kiểm tra tên như GET/PUT. Agent từ chối xóa kịch bản đang được workflow từ dashboard/API sử dụng ở bất kỳ profile nào; dừng các workflow đó trước. CLI chạy bản sao kịch bản trong bộ nhớ, không khóa file theo tên dashboard.

Khởi động lại `node index.js`, tải lại dashboard và Reload extension sau cập nhật. Agent công bố capability `download-references-v1` và `scenario-management-v1`.


## Chất lượng và công bố file cuối (2026-10-20)

yt-dlp dùng video tốt nhất kết hợp audio ưu tiên theo `language`, rồi fallback audio nguồn/video có sẵn. Sort mặc định `res:1080,fps,vbr,abr,tbr,vcodec,acodec`, với `--format-sort-force`. `res` là cạnh ngắn cho video dọc. URL trực tiếp chỉ có một định dạng thì giữ nguyên. Không thể tạo thêm chi tiết hoặc FPS thật ngoài nguồn. Bitrate giữa các codec khác nhau không là thước đo chất lượng tuyệt đối. Quy tắc: [yt-dlp format selection/sorting](https://github.com/yt-dlp/yt-dlp#format-selection).

Tải/ghép/FFprobe trong thư mục riêng `.video-download-…` dưới thư mục đã chọn. Chỉ sau khi xác nhận file cuối, agent mới công bố tên sạch bằng hard link độc quyền trên cùng filesystem (cần filesystem hỗ trợ hard link, ví dụ NTFS); trùng tên tăng số, kể cả hai profile chạy đồng thời. Thư mục làm việc riêng được dọn sau khi hoàn thành/lỗi/dừng. File hoàn chỉnh đã công bố có thể còn lại nếu dừng ngay sau công bố. Không tự đổi tên/xóa các clip cũ.

Các tham chiếu download_file_path/download_file_name trỏ tới file đã công bố với tên sạch, sau đó mới mở URL/upload. Dashboard hiển thị độ phân giải, FPS và codec từ FFprobe khi hoàn tất. Nếu đổi bộ công cụ, FFprobe vẫn phải có sẵn. Khởi động lại agent để dùng capability `video-quality-best-v1`; Reload bridge 4.0.2 và dashboard.

Tài liệu tùy chọn chính thức: https://github.com/yt-dlp/yt-dlp#sorting-formats


## Cập nhật trạng thái dashboard và hiệu suất (2026-10-21)

Dashboard dùng một timer nối tiếp sau khi request hoàn tất, không dùng interval gọi liên tục. Khi không chạy workflow: thăm dò mỗi 10 giây (khoảng 6 lần/phút, trước đây 40); có workflow đang chạy: 1,5 giây; đang chọn phần tử: 1 giây. Tab nền dừng timer; trở lại tab cập nhật ngay. Chuyển profile, Chạy/Dừng hoặc mở profile yêu cầu cập nhật ngay. Các tab dashboard khác không hiển thị sẽ không tiếp tục thăm dò.

Request profiles đang chờ được dùng chung cho thăm dò và kiểm tra trước Chạy. Mỗi tab chỉ có một request profiles đang chờ. Agent lỗi: thử lại sau 5, 10, 20, 40 rồi tối đa 60 giây; thành công trở về nhịp bình thường. Request đã bắt đầu trước khi tab bị ẩn có thể hoàn tất; không tạo chuỗi mới khi còn ẩn.

Chỉ cập nhật text/thuộc tính DOM khi giá trị đổi. Không dựng lại editor trong vòng thăm dò. Profile options được tái sử dụng và không sửa dropdown profile đang focus. CPU/RAM/event loop vẫn hiển thị theo lần cập nhật, không cần request riêng.

Agent nạp metadata Chrome Local State bất đồng bộ trước khi lắng nghe; sau đó handler dùng cache RAM, làm mới bất đồng bộ khi cache hết hạn 30 giây. Các yêu cầu đồng thời dùng chung một lượt đọc. Lỗi đọc tạm trong lúc Chrome ghi metadata giữ snapshot hợp lệ trước đó. Profile mới/đổi tên có thể xuất hiện sau lượt làm mới tiếp theo. Không đọc cookie hoặc sử dụng profile đăng nhập để kiểm thử.

Áp dụng: khởi động lại `node index.js` và tải lại dashboard. Endpoint `/api/profiles`, schema và extension vẫn tương thích.

## Lịch sử, cache URL và metadata upload (2026-10-22)

Agent lưu bền vững lịch sử từng step tại `data/agent/`, gồm thành công/thất bại/Dừng, thời gian, file/URL và vị trí dừng. Restart sau khi tiến trình bị ngắt đánh dấu lượt còn chạy là `interrupted`; không tự thực hiện lại các thao tác. Dashboard có nút **Xem / làm mới lịch sử profile**. URL đã tải được tra trước khi truy cập nguồn: file còn đúng size/SHA-256 thì báo đã tải và dùng đúng path đó cho các bước tiếp theo; file mất/đổi thì tải mới. Các yêu cầu cùng URL được xếp hàng trong agent để tránh tải trùng.

Upload có các trường tùy chọn `pageId`, `pageName`, `pageUrl`, `platform`, `publicationDesc`, `folderTag`, hỗ trợ biến thông thường/runtime. Nên dùng `pageName: "{{page_name}}"`, `pageUrl: "{{reels_url}}"` và UUID page từ Content Manager nếu đã tồn tại; UUID khác ID số Facebook. Agent lưu SHA-256 asset, file instance, page, publication và sự kiện upload theo hợp đồng Team Content Manager. `uploaded_at` ghi thời gian hoàn tất thao tác; `published_at: null` khi chưa biết bài có được đăng hay chưa. Upload legacy/CSS selector vẫn chạy khi chưa thêm metadata.

Xem cấu hình `MONGODB_URI`/`MONGODB_DATABASE`, ví dụ JSON, mô hình dữ liệu và giới hạn tại [ACTIVITY_STORAGE.md](ACTIVITY_STORAGE.md). Không cấu hình MongoDB vẫn dùng đầy đủ lịch sử/cache local. Reload extension 4.1.0, restart agent và tải lại dashboard để nhận URL tab thực tế và giao diện mới. Không ghi đè các kịch bản người dùng đang chỉnh.

## MongoDB Atlas, .env và chọn page từ kho chung

Agent đọc `.env` ở thư mục dự án, gồm `MONGODB_URI` và `MONGODB_DATABASE=team_content`. Mở `/content` để kiểm tra/kết nối lại, xem/tìm download, upload và lịch sử từ database, tạo/sửa page, cập nhật mô tả/ngày đăng/permalink publication. Trong bước upload, nút **Chọn page từ MongoDB** điền UUID/tên/URL/nền tảng từ page active dùng chung. Trước khi chọn file, agent kiểm tra lại page trong database; page inactive hoặc lỗi kết nối dừng bước có metadata page. Biến và CSS selector legacy vẫn được giữ. Reload extension 4.2.0, restart agent và dashboard sau nâng cấp; xem [MONGODB_ATLAS.md](MONGODB_ATLAS.md).

# Kiểm tra trùng download/upload

Trước `downloadVideo`, agent kiểm tra URL chuẩn hóa trong lịch sử local và collection `downloads` của MongoDB nếu đã cấu hình. Trước `upload`, agent đối chiếu đường dẫn, tên file (không phân biệt hoa/thường) và SHA-256 với `file_instances`, `upload_events`, `publications`, trên mọi page. File đã nhập kho nhưng chưa có upload/publication không tự coi là upload trùng.

Popup tải video báo khi URL đã có trong lịch sử và hiển thị đường dẫn thực tế của file cache hoặc file sẽ tải mới. Khi phát hiện upload trùng, workflow trả `paused: true`, `confirmation` trong status và giữ bước upload để chờ **Dừng tác vụ** hoặc **Xác nhận tiếp tục** trên dashboard local. Quyết định được lưu cùng bước. ID xác nhận chỉ áp dụng cho lượt chạy và bước đang chờ.

Agent ghi sự kiện upload `pending` trước dispatch và đổi thành `uploaded` sau acknowledgement. Nếu lỗi hoặc mất phản hồi, bản ghi pending vẫn cảnh báo nguy cơ trùng ở lần chạy sau. MongoDB đã cấu hình nhưng không truy vấn được sẽ làm tác vụ thất bại và hiển thị popup; không tự bỏ kiểm tra DB. Trong một process agent, các thao tác media được tuần tự hóa đến kết quả; các service độc lập vẫn cần phối hợp khóa riêng nếu yêu cầu chống chạy đồng thời giữa nhiều máy.

Popup lỗi có nút **Đã hiểu** trên các trang local. Control-server hướng dẫn mở dashboard local khi bước upload đang chờ xác nhận trùng. Các bước click xuất bản riêng của website vẫn cần điều kiện xác nhận tương ứng.

## Lên lịch chạy một lần

Trên dashboard local, chọn profile và kịch bản, chọn ngày giờ rồi bấm **Đặt lịch**. Agent lưu các chỉnh sửa kịch bản hiện tại và đường dẫn upload của lượt chạy. Trên control server, chọn thiết bị và cấu hình lượt chạy trong mục **Chạy kịch bản** rồi bấm **Đặt lịch**. Lịch dùng múi giờ của trình duyệt, mặc định là phút hiện tại. Có thể đổi giờ hoặc hủy lịch đang chờ ngay trong danh sách.

Agent lưu lịch local trong `data/schedules.json`. Control server lưu lịch từ xa trong SQLite. Khi đến giờ, agent phải hoạt động và profile phải rảnh. Lịch chờ qua thời gian máy tắt và được xét lại khi agent hoạt động. Kịch bản dùng bản đã lưu tại thời điểm chạy. Khi tới bước trình duyệt đầu tiên, agent tự mở Chrome profile đã chọn nếu extension chưa kết nối và chờ tối đa 60 giây. Cần cài extension và chọn đúng profile trong Extension options một lần trước khi chạy. Có thể đặt bước `closeTab` sau `openUrl` để đóng tab mà scenario đã mở.

Popup hiển thị trên dashboard đã đặt lịch và trên màn hình Windows nếu agent chạy trong phiên desktop. Chọn **Yes** để chạy, **No** để hủy. Sau 30 giây hệ thống mặc định chạy dù dashboard đã đóng. Lượt remote giữ nguyên quyền profile/kịch bản và biến đã cấu hình trên máy local.

Control Server nhận tiến độ của lượt chạy local và các lịch local đang chờ hoặc chờ xác nhận, theo quyền profile và kịch bản đã cấp trong trang Remote. Tài khoản ghép nối có thể dừng lượt chạy, đổi giờ, hủy hoặc xác nhận lịch từ xa khi thiết bị online. Các thao tác áp dụng tại agent sau lần polling tiếp theo. Control Server hiển thị số tác vụ vượt giới hạn dữ liệu của mỗi lần đồng bộ nếu có.

## Chrome profile của kịch bản

Chọn **Chrome profile của kịch bản** trong trình chỉnh sửa rồi bấm **Lưu**. File JSON lưu tên thư mục Chrome ở trường `"profile"`, ví dụ `"profile": "Profile 2"`. Khi chạy hoặc tạo lịch từ dashboard local, agent ưu tiên profile đã lưu. Chọn **Dùng profile đang chọn trên dashboard** để bỏ thiết lập riêng. Nếu profile đã lưu không có trên máy, dashboard báo lỗi và chờ bạn chọn lại. Mỗi lịch giữ profile tại thời điểm tạo. Các lệnh CLI, API v1 và lượt chạy từ Control Server tiếp tục dùng profile chỉ định cho lượt chạy.

## Topic tự nhận video

Điền **Topic tự nhận** và **Ưu tiên giao job** trên dashboard local, hoặc thêm hai trường dưới đây vào JSON kịch bản. Topic cách nhau bằng dấu phẩy trên dashboard. Trong JSON, dùng danh sách mã nhóm. Agent bỏ khoảng trắng ở hai đầu và chuyển mã sang chữ thường khi ghép. Danh sách trống dành cho kịch bản chạy thủ công.

```json
{
  "accepted_topics": ["gia-dinh", "am-thuc"],
  "assignment_priority": 10
}
```

Khai báo `video_url`, `thu_muc_tai`, `reels_url`, `ten_phim` và `ten_file` trong `variables`. Cấp quyền sửa các biến cần nhận từ server cho kịch bản trong **Remote Control**. Bước `downloadVideo` dùng `{{video_url}}` và `{{thu_muc_tai}}`. Sau khi bước tải hoàn tất, bước đăng dùng `{{reels_url}}`, `{{ten_phim}}` và `{{ten_file}}`. Agent lấy tiêu đề và tên file từ kết quả tải thực tế. Nếu kịch bản đã gắn Chrome profile, cấp quyền cho đúng profile đó và cấu hình extension trong profile đó khi có bước trình duyệt.

## Đổi tên file kịch bản


Mở kịch bản đã lưu, nhập tên mới vào ô **Tên file mới** rồi bấm **Đổi tên file**. Nhập tên không có đuôi `.json`, chỉ dùng chữ thường, số, dấu gạch ngang hoặc gạch dưới. Tên hiển thị chỉnh riêng trong ô **Tên hiển thị**. Agent chuyển các lịch local đang chờ sang tên mới và yêu cầu dừng lượt chạy đang dùng file trước khi đổi tên. Nếu kịch bản được dùng qua Control Server, cập nhật quyền và lịch từ xa theo tên mới.

### Quét và đồng bộ video YouTube

Mở `/scanner` trên dashboard local để lưu các ngưỡng lọc vào `config.json` và các nhóm từ khóa vào `keywords.txt`. Mỗi nhóm có một dòng `[ma-nhom]` theo sau bởi các cụm từ. Thay đổi có hiệu lực từ lượt quét tiếp theo. Bật quét sau khi đặt ngưỡng và cấu hình `YOUTUBE_API_KEY`.

Kết quả đạt điều kiện chờ trong hàng đợi local và tự gửi đến control server đã ghép nối. Xem trạng thái gửi và từng điều kiện ngay dưới biểu mẫu. Trong **Kho video** (`/library`) trên control server, nhấn tag máy gửi như `#Máy_01` để lọc kết quả. Khi nhiều máy gửi cùng video, kho giữ một bản ghi với tag của các máy gửi.

Danh sách local hiển thị tối đa 100 kết quả gần nhất theo thời điểm đo, từ mới đến cũ. Tìm theo tiêu đề, chủ đề hoặc ID, lọc theo trạng thái và chọn 5 hoặc 10 kết quả mỗi trang. Mở từng dòng để xem điều kiện và thao tác với video.

Mở **Lọc theo từng điều kiện** để kết hợp trạng thái của tuổi video, âm thanh, thời lượng, ID, từ khóa, độ phân giải, phụ đề và lượt xem. Kết quả phải khớp tất cả điều kiện đang chọn.

Trong **Điều kiện lọc**, đặt khoảng thời lượng theo giây và nhập cả chiều rộng lẫn chiều cao tối thiểu nếu cần. Hai ô kích thước để trống thì scanner dùng ngưỡng cạnh ngắn.

Trong **Chi tiết và chỉnh sửa**, chọn đánh giá thủ công hoặc quay về kết quả tự động. Dùng ô chọn từng dòng hoặc **Chọn cả trang** để áp dụng thao tác hàng loạt. Các mục đã chọn được giữ khi chuyển trang.

Đánh giá thủ công dùng để phân loại kết quả local. Đánh dấu không đạt tạm giữ video đang chờ gửi. Chỉ video đạt đầy đủ kiểm tra tự động mới đủ điều kiện gửi. Xóa kết quả dọn bản ghi local và giữ ID chống quét lại. Bản ghi đã nhận vẫn xem được trong kho của Control Server.

### Giao job từ thẻ video

Trong Kho video, mỗi dòng hiển thị ảnh đại diện, thời lượng, tuổi tính từ ngày đăng và lượt xem. Chọn từng video hoặc chọn toàn bộ trang hiện tại để đánh dấu đã dùng, đánh dấu chưa dùng hoặc xóa hàng loạt. Mỗi video được cập nhật qua API hiện có. Khi một yêu cầu lỗi, giao diện báo số video đã cập nhật và tải lại danh sách.

Chọn máy và kịch bản trong Kho video, sau đó bấm **Giao job cho máy đã chọn**. Máy phải online và có profile rảnh phù hợp. Server lấy URL từ video và đích tải/đăng từ kịch bản. Server chỉ gửi các biến trùng key được local cho phép. Ví dụ, chỉ cấp quyền video_url để giữ các giá trị còn lại của kịch bản trên máy. Giao thủ công dùng được khi tắt chế độ tự động và không tính vào hạn mức.

Đặt `scenario_id` (ví dụ `downup-giangloi`) giống nhau trên các máy đồng bộ. Nếu bỏ trống, hệ thống dùng tên file bỏ đuôi JSON. Trong Kho video, chọn kịch bản và lưu hạn mức hằng ngày. Hạn mức dùng chung theo tài khoản và ID, số 0 dừng giao tự động, ô trống cho phép không giới hạn. Server tính một lượt khi tạo job tự động, kể cả job sau đó chạy lỗi. Giao lại cùng job không tăng số lượt. Ngày mới bắt đầu lúc 00:00 UTC+7.

### Retry, timeout và xác nhận upload (extension 4.3)

Khởi động lại agent, Reload extension và tải lại trang đích. Các trường nâng cao là tùy chọn. Kịch bản cũ vẫn nhận CSS `selector`. Agent cấp ngân sách thời gian cho từng step và dùng token để nhận đúng kết quả. Hết hạn step hoặc lượt chạy khi chưa rõ kết quả click/upload sẽ dừng ở `unverified`. Kiểm tra trang trước khi chạy lại.

- `retry.attempts` là số lần thử thêm (0–5, mặc định 0). `retry.delayMs` là khoảng chờ (0–60000 ms). Click/upload đã gửi không được tự động lặp lại.
- `onError: "continue"` chỉ bỏ qua khi thiếu phần tử và extension xác định chưa gửi input. Step lưu lý do trong lịch sử.
- `completion.timeoutMs` nhận 1000–3600000 ms, mặc định theo thời gian chờ điều hướng. `hidden` vẫn đạt khi phần tử vắng mặt. Riêng upload có thể dùng `appearedThenHidden` để đợi thanh tiến trình xuất hiện rồi biến mất trong cùng tài liệu. Nên dùng thông báo thành công cụ thể nếu trang cũng ẩn thanh tiến trình khi upload lỗi.
- Upload chỉ ghi `file_selected` cho tới khi có điều kiện xác nhận với `stage` là `uploaded`, `processed` hoặc `published`. Publication được tạo khi xác nhận đăng và có trang đích. Thời điểm xác nhận nằm ở `confirmed_at`. `published_at` là thời điểm đăng do website cung cấp.
- Bước xác nhận đăng sau một upload sẽ liên kết với lần upload đó. Nếu có nhiều lần upload, đặt `uploadStep` bằng số thứ tự bước upload, tính từ 1.

```json
{
  "action": "click",
  "selector": "#publish",
  "uploadStep": 2,
  "completion": { "selector": ".post-success", "state": "visible", "stage": "published", "timeoutMs": 90000 }
}
```

## Xác nhận từ local và Control Server

Trên Control Server, chọn thiết bị đã ghép nối để trả lời Yes/No cho workflow đang chờ. Cả lượt chạy từ local và lượt chạy từ server đều dùng quyền chia sẻ theo profile và kịch bản. Local áp dụng câu trả lời cho đúng lượt chạy và đúng bước đang chờ. Tải video giữ thời hạn 30 giây. Cảnh báo upload trùng chờ quyết định hoặc đến khi lượt chạy kết thúc.

Dashboard local dùng chung hộp thoại xác nhận cho xóa kịch bản, xóa kết quả Scanner và ngắt kết nối. Khi đã ghép nối, chủ thiết bị có thể trả lời từ server qua kỳ polling. Đóng trang hoặc để hộp thoại này hết hạn sau hai phút sẽ hủy thao tác.
