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
| `type` | `locatorType`, `locator`, `text`, optional `clear` | Clicks a field and enters text. |
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

## Waiting for actions to finish

Only one step is issued at a time **per profile**. The next step, including local `wait`/`openFolder`, starts after the extension acknowledges completion. `openUrl` and `click` wait for Chrome's tab load status and `document.readyState === 'complete'`, then a quiet DOM/URL interval (`settleMs`, default 350 ms). The background worker owns navigation, so replacing the old document or redirecting does not lose the completion acknowledgement. A click observes navigation/new-tab creation for at least 500 ms; if it opens a new tab during that interval, later steps use that tab. The selected target tab remains bound even if you switch to another tab.

Page load does not tell an agent when a website's business operation is finished. For AJAX, delayed navigation, upload processing, or pages with continuously changing content, set **Chờ phần tử kết quả** in the dashboard or add `completion` to the action. It works on `openUrl`, `click`, `type`, and `upload` and accepts normal locator fields plus `state`: `visible` (default), `hidden`, or `enabled` (can receive a pointer click). For example:

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
