# Local workflow agent

Run `node local-agent.js`, then open **http://127.0.0.1:34719** in your browser. The dashboard lets you create, reorder, edit, save, run, and stop scenarios. You can still enter `run scenarios/facebook-reels.json` in the terminal.
The agent controls the Chrome profile named `Profile 2` by default. To use another profile in PowerShell:

```powershell
$env:CHROME_PROFILE = 'Profile 1'
node .\local-agent.js
```

Load `chrome-reels-extension` with **Load unpacked** in that Chrome profile. Reload the extension and any open target tabs after changing its files. The extension runs in the existing Chrome profile; no Playwright connection is used.

Edit a JSON file in `scenarios` and run it again. Steps run in order:

| Action | Fields | Effect |
| --- | --- | --- |
| `openUrl` | `url` | Opens URL in a new tab of the chosen Chrome profile. |
| `openFolder` | `path` | Opens a local directory in Windows Explorer. |
| `wait` | `ms` | Waits for a duration. |
| `waitFor` | `locatorType`, `locator`, optional `role`, `index`, `timeoutMs` | Waits for a visible matching element (default 10 seconds). |
| `click` | `locatorType`, `locator`, optional `role`, `index`, `timeoutMs` | Finds an element and clicks its center. |
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

For point-and-click selection, press **Chọn trên trang** on a step in the dashboard, switch to the Chrome tab, and click the target element. The picked locator is filled into the step. Press Esc to cancel. Save the scenario afterward.

For upload, add an **Upload file** step and pick the button that opens file selection. The action clicks that button, intercepts Chrome's file chooser, selects the file, and waits briefly for the page to receive it. It also works with a direct `input[type=file]` locator. Supply either a full `filePath`, or both `folder` and `filename`. To choose a different file for each run, leave these fields empty and enter the file in **File upload cho lần chạy** before pressing Run. From the terminal, use `run scenarios/my-workflow.json --upload "C:\\Users\\Administrator\\Downloads\\photo.jpg"`. The agent checks that the file exists and passes its absolute path to the extension. `waitAfterMs` controls the pause after selection; use a later `waitFor` step for a preview or completed-upload indicator. Add a later click if the site also requires a Submit button.

When a click opens a dialog or full-page overlay, put a `waitFor` step for a button in that dialog before the next `click` or `upload`. The agent waits until that button can receive a pointer click and prefers matching elements inside the visible dialog. Use **Chọn trên trang** after opening the dialog manually to capture its new button. If the button opens the Windows file chooser, use an `upload` step targeting that button instead of a separate `click` step.

`status` reports progress and errors. `stop` interrupts the workflow; `exit` ends the agent. A `click` that navigates in the same tab is supported; a click that opens a new tab needs a later `openUrl` step to select that new URL.
