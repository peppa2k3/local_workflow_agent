const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { validateVideo, inspectVideo, downloadVideo, run, selectionArgs, publishVideo } = require('../src/agent/video-download');
const { createScenarioStore } = require('../src/agent/scenario-store');
const { createWorkflows } = require('../src/agent/workflows');
const { createActivityStore } = require('../src/agent/activity-store');
const { createCachedDownloader } = require('../src/agent/download-cache');
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

    const staging = path.join(directory, 'publish-source.mp4'); fs.writeFileSync(staging, 'complete');
    const target = path.join(directory, 'names'); fs.mkdirSync(target);
    const titledSource = path.join(directory, 'Tên phim.mp4'); fs.copyFileSync(staging, titledSource);
    const published = await Promise.all([publishVideo(titledSource, target), publishVideo(titledSource, target)]);
    assert.equal(new Set(published).size, 2);
    assert.deepEqual(published.map(file => path.basename(file)).sort(), ['Tên phim (2).mp4', 'Tên phim.mp4'].sort());
    assert.equal(fs.readFileSync(published[0], 'utf8'), 'complete');
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
        if (pathname === '/api/profiles') data = { defaultProfile: 'Default', capabilities: ['variables-v1', 'video-download-v1', 'video-quality-best-v1', 'download-references-v1', 'scenario-management-v1'], profiles: [{ directory: 'Default', name: 'Test', extensionConnected: false, running: false, download: { title, filePath: 'D:/Videos/sample.mp4', width: 1440, height: 1920, fps: 60, videoCodec: 'vp9' } }] };
        else if (pathname === '/api/scenarios') data = { names: deleted ? [] : ['video-download'] };
        else if (pathname === '/api/scenarios/my-workflow' && request.method() === 'PUT') { saved = request.postDataJSON(); data = { ok: true }; }
        else if (pathname === '/api/scenarios/video-download') {
          if (request.method() === 'DELETE') { deleted = true; data = { ok: true }; }
          else if (request.method() === 'PUT') { saved = request.postDataJSON(); data = { ok: true }; }
          else data = saved;
        }
        else if (pathname === '/api/video/inspect') { assert.equal(request.postDataJSON().url, url); inspected = true; data = { title, id: 'sample' }; }
        else if (pathname === '/api/history') data = { runs: [{ runId: 'fixture-run', scenario: 'download-upload-reels-lili', state: 'failed', startedAt: Date.now(), total: 6, stoppedAtStep: 6,
          steps: [{ number: 1, label: 'Tải clip', state: 'succeeded', reused: true, file_path: 'D:/Videos/sample.mp4' }, { number: 6, label: 'Bước cuối', state: 'failed', error: 'Target not found' }] }] };
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
      assert.match(await page.locator('#progress').textContent(), /1440×1920.*60 fps.*vp9/);
      assert(await page.getByText('Chất lượng cao nhất:', { exact: false }).isVisible());
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
      await page.locator('.step-head select').selectOption('upload');
      await page.getByRole('textbox', { name: 'Tên page đích (khuyến nghị)', exact: true }).fill('Lili');
      await page.getByRole('textbox', { name: 'URL page đích (nên dùng biến)', exact: true }).fill('https://example.test/lili');
      await page.locator('#saveBtn').click();
      await page.waitForFunction(() => document.getElementById('message').textContent.includes('Đã lưu'));
      assert.equal(saved.steps[0].pageName, 'Lili'); assert.equal(saved.steps[0].pageUrl, 'https://example.test/lili');
      await page.locator('#historyBtn').click();
      await page.locator('#runHistory summary').waitFor();
      assert.match(await page.locator('#runHistory summary').textContent(), /download-upload-reels-lili.*Dừng tại bước 6/);
      await page.locator('#runHistory summary').click();
      assert.match(await page.locator('#runHistory').textContent(), /Đã tải trước đó.*sample.mp4/);
      assert.match(await page.locator('#runHistory').textContent(), /Thất bại.*Target not found/);
      console.log('Dashboard preview, runtime reference picker, step label persistence/default and deletion/cancel: OK');
    } finally { await browser.close(); }

    const tools = path.resolve(__dirname, '../tools');
    if (fs.existsSync(path.join(tools, 'yt-dlp.exe')) && fs.existsSync(path.join(tools, 'ffmpeg.exe'))) {

      const format = (id, width, height, fps, bitrate) => ({ format_id: id, url: 'http://127.0.0.1/unused-' + id + '.mp4', ext: 'mp4', vcodec: 'avc1.640028', acodec: 'none', width, height, fps, vbr: bitrate, tbr: bitrate });
      const formats = [
        format('4k30', 2160, 3840, 30, 9000),
        format('1080p60', 1080, 1920, 60, 4000),
        format('1440p60', 1440, 1920, 60, 5000),
        format('1440p60-high', 1440, 1920, 60, 6000),
        { format_id: 'audio', url: 'http://127.0.0.1/unused.m4a', ext: 'm4a', vcodec: 'none', acodec: 'mp4a.40.2', abr: 128, tbr: 128 }
      ];
      const metadataFile = path.join(directory, 'formats.json');
      const writeFormats = list => fs.writeFileSync(metadataFile, JSON.stringify({ id: 'test', title: 'Fixture', extractor: 'generic', webpage_url: url, formats: list }));
      writeFormats(formats);
      const choose = () => run(path.join(tools, 'yt-dlp.exe'), ['--ignore-config', '--no-warnings', ...selectionArgs, '--load-info-json', metadataFile, '--simulate', '--print', '%(format_id)s']);
      assert.equal(await choose(), '1440p60-high+audio', 'FPS must outrank 4K30, then portrait resolution and bitrate');
      writeFormats(formats.filter(item => !item.fps || item.fps === 30));
      assert.equal(await choose(), '4k30+audio', 'fallback to lower FPS when high FPS is absent, without a 1080 height cap');
      console.log('Real yt-dlp sorting: FPS, portrait resolution, bitrate and fallback: OK');
      const fixture = path.join(directory, 'fixture.mp4');
      await run(path.join(tools, 'ffmpeg.exe'), ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=128x128:d=1', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', fixture]);
      await run(path.join(tools, 'ffmpeg.exe'), ['-v', 'error', '-i', fixture, '-map', '0:v', '-map', '0:a', '-c', 'copy', '-f', 'dash', '-adaptation_sets', 'id=0,streams=v id=1,streams=a', 'fixture.mpd'], { cwd: directory });
      let requests = 0;
      server = http.createServer((req, res) => {
        requests++;
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
      assert.equal(result.name, 'fixture.mp4');
      assert.equal(result.width, 128); assert.equal(result.height, 128);
      const probe = JSON.parse(await run(path.join(tools, 'ffprobe.exe'), ['-v', 'quiet', '-show_streams', '-of', 'json', result.filePath]));
      assert(probe.streams.some(item => item.codec_type === 'video'));
      assert(probe.streams.some(item => item.codec_type === 'audio'));
      const again = await downloadVideo({ url: localUrl, directory: path.join(directory, 'saved'), quality: 720 });
      assert.equal(again.name, 'fixture (2).mp4');
      assert.notEqual(again.filePath, result.filePath);
      assert(fs.existsSync(result.filePath), 'must preserve previous video');
      const sourceBytes = fs.readFileSync(fixture);
      fs.writeFileSync(fixture, 'not a video');
      try {
        await assert.rejects(downloadVideo({ url: localUrl, directory: path.join(directory, 'saved'), quality: 'best' }), /ffprobe|readable video/i);
        assert.equal(fs.readdirSync(path.join(directory, 'saved')).length, 2, 'invalid downloads must not publish or leave staging files');
      } finally { fs.writeFileSync(fixture, sourceBytes); }

      const merged = await downloadVideo({ url: localUrl.replace('.mp4', '.mpd'), directory: path.join(directory, 'merged'), quality: 720 });
      const streams = JSON.parse(await run(path.join(tools, 'ffprobe.exe'), ['-v', 'quiet', '-show_streams', '-of', 'json', merged.filePath])).streams;
      assert(streams.some(item => item.codec_type === 'video') && streams.some(item => item.codec_type === 'audio'), 'FFmpeg must merge separate DASH video/audio streams');
      assert.equal(merged.name, 'fixture.mp4');
      assert(!fs.readdirSync(path.join(directory, 'merged')).some(name => name.startsWith('.video-download-')));
      const cachedDownloader = createCachedDownloader(createActivityStore(path.join(directory, 'activity')), downloadVideo);
      const firstCached = await cachedDownloader({ url: localUrl, directory: path.join(directory, 'cached') });
      const requestsAfterDownload = requests;
      const secondCached = await cachedDownloader({ url: localUrl, directory: path.join(directory, 'different-directory') });
      assert.equal(secondCached.reused, true); assert.equal(secondCached.filePath, firstCached.filePath);
      assert.equal(requests, requestsAfterDownload, 'verified URL reuse must not contact source or redownload');
      console.log('Real yt-dlp + FFmpeg local video download, title, no-overwrite and audio/video verification: OK');
    } else console.log('Portable tools absent: real download check skipped (npm run setup:video to enable)');
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  }
  console.log('Video validation, workflow isolation, Stop, process failure and timeout: OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
