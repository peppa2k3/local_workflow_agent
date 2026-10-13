const { chromium } = require('playwright');
const path = require('path');

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
      const steps = [
        { id: 0, action: 'click', locatorType: 'role', role: 'button', locator: 'Open' },
        { id: 1, action: 'waitFor', locatorType: 'role', role: 'button', locator: 'Choose' },
        { id: 2, action: 'click', locatorType: 'role', role: 'button', locator: 'Choose' },
        { id: 3, action: 'upload', locatorType: 'role', role: 'button', locator: 'Select file', filePath: 'C:\\test\\photo.jpg' }
      ];
      let index = 0;
      window.chrome = { runtime: { sendMessage(message, callback) {
        if (message.type === 'pickNext') callback({ active: false });
        else if (message.type === 'next') callback({ runId: 1, step: steps[index] || null });
        else if (message.type === 'result') { if (message.payload.ok) index++; callback({ ok: true }); }
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
    await page.waitForFunction(() => window.chosen && window.uploadTargetIsModal, { timeout: 10000 });
    console.log('Overlay click and modal upload target: OK');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
