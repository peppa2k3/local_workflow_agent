# Local workflow agent

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

Ví dụ: `{"action":"downloadVideo","url":"https://www.youtube.com/watch?v=9qq_Fqp2rnM","directory":"D:\\Videos","quality":1080,"downloadTimeoutMs":1800000}`.

- `url`: HTTP/HTTPS của một video; không playlist/live, không credentials trong URL.
- `directory`: đường dẫn tuyệt đối, được tạo nếu chưa có.
- `quality`: độ cao tối đa 360/480/720/1080/1440/2160; mặc định 1080. Chọn luồng tốt nhất trong giới hạn, FFmpeg ghép hình/tiếng khi cần. Container ghép ưu tiên MP4; video một luồng giữ định dạng nguồn, không ép chuyển mã. URL trực tiếp không cung cấp độ cao trong metadata vẫn tải định dạng có sẵn; giới hạn độ cao chỉ áp dụng khi nguồn có thông tin này. Thiếu định dạng phù hợp sẽ báo lỗi.
- Tên file: `tiêu đề [ID].ext`, lấy metadata thật, xử lý ký tự Windows, giới hạn tiêu đề 150 byte. Không ghi đè file đã có cùng tên.
- Timeout tổng phân tích + tải: mặc định 30 phút, 1000–7200000 ms. Nút Dừng hủy cây tiến trình yt-dlp/FFmpeg; file .part hoặc file đã xong trước lúc dừng có thể còn lại.

Status trả `download` gồm title, id, name, filePath, bytes; chỉ báo thành công sau hậu xử lý và xác nhận file tồn tại, khác rỗng. API phân tích: POST `/api/video/inspect` với `{"url":"https://..."}`, trả title/id/url/duration, timeout 60 giây.

Dùng mẫu `scenarios/video-download.json`, sửa `video_url` và `thu_muc_tai`. Cài bằng `npm run setup:video`, xem [SETUP](SETUP.md). Không đọc cookies/profile Chrome. Website yêu cầu đăng nhập/chống bot có thể từ chối và lỗi được hiển thị.

Tùy chọn metadata, output template và after_move: https://github.com/yt-dlp/yt-dlp#readme
