const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { validateVideo, inspectVideo, downloadVideo, run } = require('../src/agent/video-download');
const { createScenarioStore } = require('../src/agent/scenario-store');
const { createWorkflows } = require('../src/agent/workflows');
(async () => {
  for (const url of ['file:///C:/a.mp4', 'ftp://example.test/a', 'https://user:secret@example.test/']) assert.throws(() => validateVideo({ url }));
  const url = 'https://example.test/video';
  for (const extra of [{ directory: '../escape' }, { quality: 0 }, { downloadTimeoutMs: -1 }]) assert.throws(() => validateVideo({ url, ...extra }));
  const store = createScenarioStore('.');
  assert.throws(() => store.prepare({ steps: [{ action: 'downloadVideo', url }] }), /directory/);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'video-test-'));
  let server;
  try {
    const scenario = { variables: { url, dir: directory }, steps: [{ action: 'downloadVideo', url: '{{url}}', directory: '{{dir}}', quality: '720' }] };
    assert.equal(store.prepare(scenario).steps[0].url, url);
    assert.equal(scenario.steps[0].url, '{{url}}');
    let finish, receivedSignal;
    const workflows = createWorkflows({ scenarios: store, defaultProfile: 'Default', profiles: () => [{ directory: 'Default' }], openFolder: async () => {}, downloadVideo: (step, signal) => { receivedSignal = signal; return new Promise(resolve => { finish = resolve; }); } });
    workflows.start('Default', scenario);
    assert.equal(workflows.next(workflows.session()).step, null, 'local download must not leak to extension');
    assert.equal(workflows.status().running, true);
    finish({ title: 'Sample', filePath: 'sample.mp4', verified: true });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(workflows.status().download.title, 'Sample');
    assert.equal(workflows.status().running, false);
    workflows.start('Default', scenario);
    workflows.stop('Default');
    assert(receivedSignal.aborted);
    finish({ title: 'Stale' });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(workflows.status().download, null, 'stale result after Stop must be ignored');
    await assert.rejects(run(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { signal: AbortSignal.timeout(100) }), /cancelled|timed out/);
    await assert.rejects(run(process.execPath, ['-e', 'console.error("fixture failure");process.exit(3)']), /fixture failure/);
    await assert.rejects(run(process.execPath, ['-e', 'console.log("x".repeat(1000))'], { limit: 10 }), /too large/);

    const { chromium } = require('playwright');
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    try {
      const page = await browser.newPage();
      let inspected = false, deleted = false;
      let saved = structuredClone(scenario);
      const title = 'Video ti\u1ebfng Vi\u1ec7t';
      await page.route('http://127.0.0.1:34719/**', async route => {
        const request = route.request(), pathname = new URL(request.url()).pathname;
        let data = {};
        if (pathname === '/') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: fs.readFileSync(path.resolve(__dirname, '../dashboard/index.html'), 'utf8') });
        if (pathname === '/api/profiles') data = { defaultProfile: 'Default', capabilities: ['variables-v1', 'video-download-v1', 'download-references-v1', 'scenario-management-v1'], profiles: [{ directory: 'Default', name: 'Test', extensionConnected: false, running: false, download: { title, filePath: 'D:/Videos/sample.mp4' } }] };
        else if (pathname === '/api/scenarios') data = { names: deleted ? [] : ['video-download'] };
        else if (pathname === '/api/scenarios/video-download') {
          if (request.method() === 'DELETE') { deleted = true; data = { ok: true }; }
          else if (request.method() === 'PUT') { saved = request.postDataJSON(); data = { ok: true }; }
          else data = saved;
        }
        else if (pathname === '/api/video/inspect') { assert.equal(request.postDataJSON().url, url); inspected = true; data = { title, id: 'sample' }; }
        return route.fulfill({ json: data });
      });
      await page.goto('http://127.0.0.1:34719');
      const button = page.getByRole('button', { name: 'Ph\u00e2n t\u00edch URL / l\u1ea5y t\u00ean', exact: true });
      await button.waitFor();
      await page.waitForFunction(() => !document.getElementById('runBtn').disabled);
      await button.click();
      await page.waitForFunction(() => document.getElementById('message').textContent.includes('Video ti\u1ebfng Vi\u1ec7t'));
      assert(inspected);
      assert.match(await page.locator('#progress').textContent(), /sample.mp4/);
      assert.equal(await page.locator('#runBtn').isEnabled(), true, 'download-only workflow runs without extension');
      await page.locator('.step-head select').selectOption('openUrl');
      assert.equal(await page.locator('#runBtn').isEnabled(), false, 'browser action still requires extension');
      const stepName = page.getByRole('textbox', { name: 'Tên bước (tùy chọn)', exact: true });
      assert.equal(await page.locator('.step-title').textContent(), 'Bước 1');
      await stepName.fill('Mở trang Reels');
      await page.locator('#saveBtn').click();
      await page.waitForFunction(() => document.getElementById('message').textContent.includes('Đã lưu'));
      assert.equal(saved.steps[0].label, 'Mở trang Reels');
      await page.locator('#loadBtn').click();
      await page.waitForFunction(() => document.getElementById('message').textContent.includes('Đã mở'));
      assert.equal(await page.locator('.step-title').textContent(), 'Mở trang Reels');
      await stepName.fill('');
      assert.equal(await page.locator('.step-title').textContent(), 'Bước 1');
      const reference = page.getByLabel('Chèn biến: URL', { exact: true });
      assert(await reference.locator('option[value="download_title"]').count());
      page.once('dialog', dialog => dialog.dismiss());
      await page.locator('#deleteBtn').click();
      await page.waitForFunction(() => !document.getElementById('deleteBtn').disabled);
      assert(!deleted);
      page.once('dialog', dialog => dialog.accept());
      await page.locator('#deleteBtn').click();
      await page.waitForFunction(() => document.getElementById('message').textContent.includes('Đã xóa'));
      assert(deleted);
      assert.equal(await page.locator('#scenarioSelect option').count(), 0);
      assert.equal(await page.locator('#fileName').inputValue(), 'my-workflow');
      console.log('Dashboard preview, runtime reference picker, step label persistence/default and deletion/cancel: OK');
    } finally { await browser.close(); }

    const tools = path.resolve(__dirname, '../tools');
    if (fs.existsSync(path.join(tools, 'yt-dlp.exe')) && fs.existsSync(path.join(tools, 'ffmpeg.exe'))) {
      const fixture = path.join(directory, 'fixture.mp4');
      await run(path.join(tools, 'ffmpeg.exe'), ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=128x128:d=1', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', fixture]);
      await run(path.join(tools, 'ffmpeg.exe'), ['-v', 'error', '-i', fixture, '-map', '0:v', '-map', '0:a', '-c', 'copy', '-f', 'dash', '-adaptation_sets', 'id=0,streams=v id=1,streams=a', 'fixture.mpd'], { cwd: directory });
      server = http.createServer((req, res) => {
        const file = path.join(directory, path.basename(new URL(req.url, 'http://localhost').pathname));
        if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, { 'Content-Type': file.endsWith('.mpd') ? 'application/dash+xml' : 'video/mp4', 'Content-Length': fs.statSync(file).size });
        fs.createReadStream(file).pipe(res);
      });
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      const localUrl = `http://127.0.0.1:${server.address().port}/fixture.mp4`;
      const info = await inspectVideo(localUrl);
      assert(info.title && info.id);
      const result = await downloadVideo({ url: localUrl, directory: path.join(directory, 'saved'), quality: 720 });
      assert.equal(result.title, info.title);
      assert(result.bytes > 0);
      assert.equal(result.verified, true, 'download completion must include FFprobe verification');
      assert(result.name.includes(info.id));
      const probe = JSON.parse(await run(path.join(tools, 'ffprobe.exe'), ['-v', 'quiet', '-show_streams', '-of', 'json', result.filePath]));
      assert(probe.streams.some(item => item.codec_type === 'video'));
      assert(probe.streams.some(item => item.codec_type === 'audio'));
      const again = await downloadVideo({ url: localUrl, directory: path.join(directory, 'saved'), quality: 720 });
      assert.equal(again.filePath, result.filePath);
      fs.writeFileSync(result.filePath, 'not a video');
      await assert.rejects(downloadVideo({ url: localUrl, directory: path.join(directory, 'saved'), quality: 720 }), /ffprobe|readable video/i);

      const merged = await downloadVideo({ url: localUrl.replace('.mp4', '.mpd'), directory: path.join(directory, 'merged'), quality: 720 });
      const streams = JSON.parse(await run(path.join(tools, 'ffprobe.exe'), ['-v', 'quiet', '-show_streams', '-of', 'json', merged.filePath])).streams;
      assert(streams.some(item => item.codec_type === 'video') && streams.some(item => item.codec_type === 'audio'), 'FFmpeg must merge separate DASH video/audio streams');
      console.log('Real yt-dlp + FFmpeg local video download, title, no-overwrite and audio/video verification: OK');
    } else console.log('Portable tools absent: real download check skipped (npm run setup:video to enable)');
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  }
  console.log('Video validation, workflow isolation, Stop, process failure and timeout: OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
