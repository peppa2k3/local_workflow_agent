const { chromium } = require('playwright');
const path = require('path');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const page = await browser.newPage();
    await page.setContent(`
      <button id="open">Open</button>
      <button id="covered">Choose</button>
      <input type="file" hidden>
      <div id="overlay" role="dialog" style="display:none;position:fixed;inset:0;background:#0008;align-items:center;justify-content:center">
        <div style="background:white;padding:40px">
          <button id="choose">Choose</button>
          <button id="select-file">Select file</button>
          <input id="modal-file" type="file" hidden>
        </div>
      </div>
      <script>
        document.querySelector('#open').onclick = () => document.querySelector('#overlay').style.display = 'flex';
        document.querySelector('#choose').onclick = () => window.chosen = true;
        document.querySelector('#select-file').onclick = () => window.uploadTriggerClicked = true;
      </script>
    `);
    await page.evaluate(() => {
      window.chrome = { runtime: { onMessage: { addListener(handler) { window.bridgeMessage = handler; } }, sendMessage(message, callback) {
        if (message.type === 'state') callback({ running: true, runId: 1 });
        else if (message.type === 'input' && message.kind === 'prepareUpload') callback({ ok: true });
        else if (message.type === 'input' && message.kind === 'chooserStatus') callback({ ok: true, opened: Boolean(window.uploadTriggerClicked) });
        else if (message.type === 'input' && message.kind === 'click') {
          document.elementFromPoint(message.x, message.y).click(); callback({ ok: true });
        } else if (message.type === 'input' && message.kind === 'upload') {
          const input = document.querySelector('#modal-file');
          const files = new DataTransfer();
          files.items.add(new File(['test'], 'photo.jpg', { type: 'image/jpeg' }));
          input.files = files.files;
          window.uploadTargetIsModal = input.id === 'modal-file' && window.uploadTriggerClicked;
          callback({ ok: true });
        } else callback({ ok: true });
      } } };
    });
    await page.addScriptTag({ path: path.join(__dirname, '..', 'chrome-reels-extension', 'content.js') });
    for (const step of [
      { action: 'click', locatorType: 'role', role: 'button', locator: 'Open' },
      { action: 'waitFor', locatorType: 'role', role: 'button', locator: 'Choose' },
      { action: 'click', locatorType: 'role', role: 'button', locator: 'Choose' },
      { action: 'upload', locatorType: 'role', role: 'button', locator: 'Select file', filePath: 'C:\\test\\photo.jpg' }
    ]) {
      const result = await page.evaluate(step => new Promise(resolve => window.bridgeMessage({ type: 'execute', step, runId: 1 }, {}, resolve)), step);
      assert.equal(result.ok, true, result.error);
    }
    assert(await page.evaluate(() => window.chosen && window.uploadTargetIsModal));
    const stopped = await page.evaluate(async () => {
      const started = Date.now();
      const result = new Promise(resolve => window.bridgeMessage({ type: 'execute', runId: 1, step: { action: 'scroll', times: 2, intervalMs: 10000 } }, {}, resolve));
      setTimeout(() => window.bridgeMessage({ type: 'cancel', runId: 1 }, {}, () => {}), 200);
      return { result: await result, elapsed: Date.now() - started };
    });
    assert.equal(stopped.result.ok, false);
    assert.match(stopped.result.error, /Stopped/);
    assert(stopped.elapsed < 2000, 'Stop must interrupt long action delays');
    console.log('Overlay click and modal upload target: OK');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
