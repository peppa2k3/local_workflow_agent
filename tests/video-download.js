const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { mock } = require('node:test');
const { validateVideo, inspectVideo, downloadVideo, run, selectionArgs, videoOptions, publishVideo, transferArgs } = require('../local-workflow-agent/src/integrations/video/video-download');
const { createScenarioStore } = require('../local-workflow-agent/src/workflow/scenario-store');
const { createWorkflows } = require('../local-workflow-agent/src/workflow/workflows');
const { createActivityStore } = require('../local-workflow-agent/src/storage/activity-store');
const { createCachedDownloader } = require('../local-workflow-agent/src/storage/download-cache');
(async () => {
  assert.deepEqual(videoOptions(), { quality: '1080', language: 'vi' });
  assert.deepEqual(transferArgs(''), ['--concurrent-fragments', '4', '--abort-on-unavailable-fragments']);
  for (const fragments of ['1', ' 6 ', '8']) {
    assert.deepEqual(transferArgs(fragments), ['--concurrent-fragments', fragments.trim(), '--abort-on-unavailable-fragments']);
  }
  for (const value of ['0', '9', '1.5', '3 --ignore-errors']) assert.throws(() => transferArgs(value), /YTDLP_CONCURRENT_FRAGMENTS/);
  for (const url of ['file:///C:/a.mp4', 'ftp://example.test/a', 'https://user:secret@example.test/']) assert.throws(() => validateVideo({ url }));
  const url = 'https://example.test/video';
  for (const extra of [{ directory: '../escape' }, { quality: 0 }, { language: 'vi]/ba' }, { language: '' }, { downloadTimeoutMs: -1 }]) assert.throws(() => validateVideo({ url, ...extra }));
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
    let transfers = 0, nextSteps = 0, completeTransfer;
    const confirmationWorkflows = createWorkflows({ scenarios: store, defaultProfile: 'Default', profiles: () => [{ directory: 'Default' }],
      openFolder: async () => { nextSteps++; },
      async downloadVideo(step, signal, { confirm }) {
        await confirm({ kind: 'download', name: 'preview.mp4', filePath: path.join(directory, 'preview.mp4') });
        transfers++;
        await new Promise(resolve => { completeTransfer = resolve; });
        return { title: 'Preview', name: 'preview.mp4', filePath: path.join(directory, 'preview.mp4'), verified: true };
      }
    });
    const confirmedScenario = { ...scenario, steps: [...scenario.steps, { action: 'openFolder', path: directory }] };
    const start = () => confirmationWorkflows.start('Default', confirmedScenario);
    const decide = (run, proceed) => confirmationWorkflows.resolveConfirmation('Default', run.executionId, run.confirmation.id, proceed);
    const flush = () => new Promise(resolve => setImmediate(resolve));
    mock.timers.enable({ apis: ['Date', 'setTimeout'] });
    try {
      const declined = start();
      assert.equal(declined.confirmation.name, 'preview.mp4');
      assert.equal(declined.confirmation.expiresAt - Date.now(), 30000);
      decide(declined, false);
      await flush();
      assert.equal(confirmationWorkflows.getRun(declined.runId).state, 'cancelled');
      assert.equal(transfers, 0);
      assert.equal(nextSteps, 0);
      const approved = start();
      assert.throws(() => decide(declined, true), /hết hiệu lực/);
      decide(approved, true);
      await flush();
      assert.equal(transfers, 1);
      assert.equal(nextSteps, 0);
      completeTransfer();
      await flush();
      assert.equal(nextSteps, 1);
      const automatic = start();
      mock.timers.tick(29999);
      await flush();
      assert.equal(transfers, 1);
      mock.timers.tick(1);
      await flush();
      assert.equal(transfers, 2);
      assert.equal(nextSteps, 1);
      completeTransfer();
      await flush();
      assert.equal(nextSteps, 2);
      assert.equal(confirmationWorkflows.getRun(automatic.runId).steps[0].decisions[0].source, 'timeout');
      start();
      confirmationWorkflows.stop('Default');
      mock.timers.tick(30000);
      await flush();
      assert.equal(transfers, 2);
      const remote = confirmationWorkflows.start('Default', confirmedScenario, '', 'fixture', {}, 60000, null, true);
      mock.timers.tick(30000);
      assert.throws(() => decide(remote, false), /hết thời gian/);
      confirmationWorkflows.resolveConfirmation('Default', remote.executionId, remote.confirmation.id, false, 'remote');
      mock.timers.tick(4000);
      await flush();
      assert.equal(transfers, 2);
      assert.equal(confirmationWorkflows.getRun(remote.runId).state, 'cancelled');
    } finally { mock.timers.reset(); }
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
      let inspected = false, deleted = false, pending, decision;
      let saved = structuredClone(scenario);
      const title = 'Video ti\u1ebfng Vi\u1ec7t';
      await page.route('http://127.0.0.1:34719/**', async route => {
        const request = route.request(), pathname = new URL(request.url()).pathname;
        let data = {};
        if (pathname === '/') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: fs.readFileSync(path.resolve(__dirname, '../local-workflow-agent/dashboard/index.html'), 'utf8') });
        if (pathname === '/issues.js') return route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.resolve(__dirname, '../local-workflow-agent/dashboard/issues.js'), 'utf8') });
        if (pathname === '/api/profiles') data = { defaultProfile: 'Default', capabilities: ['variables-v1', 'video-download-v1', 'video-quality-best-v1', 'download-references-v1', 'scenario-management-v1'], profiles: [{ directory: 'Default', profile: 'Default', name: 'Test', extensionConnected: false, running: Boolean(pending), executionId: 'fixture-confirmation-run',
          confirmation: pending, download: { title, filePath: 'D:/Videos/sample.mp4', width: 1440, height: 1920, fps: 60, videoCodec: 'vp9' } }] };
        else if (pathname === '/api/confirm') { decision = request.postDataJSON(); pending = null; }
        else if (pathname === '/api/scenarios') data = { names: deleted ? [] : ['video-download'] };
        else if (pathname === '/api/scenarios/my-workflow' && request.method() === 'PUT') { saved = request.postDataJSON(); data = { ok: true }; }
        else if (pathname === '/api/scenarios/video-download') {
          if (request.method() === 'DELETE') { deleted = true; data = { ok: true }; }
          else if (request.method() === 'PUT') { saved = request.postDataJSON(); data = { ok: true }; }
          else data = saved;
        }
        else if (pathname === '/api/video/inspect') { assert.equal(request.postDataJSON().url, url); inspected = true; data = { title, id: 'sample' }; }
        else if (pathname === '/api/clips') {
          const body = request.postDataJSON();
          assert.equal(body.scenario.variables.dir, directory);
          if (body.variable) assert.equal(body.variable, 'url'); else assert.equal(body.index, 0);
          data = { names: ['Tên phim.mp4'], more: false };
        }
        else if (pathname === '/api/content/catalog/pages') data = { rows: [{ _id: '8d7956a8-cb45-457f-a7f0-094ae1a9362e', name: 'Page dùng chung', platform: 'Facebook', url: 'https://example.test/shared' }], total: 1 };
        else if (pathname === '/api/history') data = { runs: [{ runId: 'fixture-run', scenario: 'download-upload-reels-lili', state: 'failed', startedAt: Date.now(), total: 6, stoppedAtStep: 6,
          steps: [{ number: 1, label: 'Tải clip', state: 'succeeded', reused: true, file_path: 'D:/Videos/sample.mp4' }, { number: 6, label: 'Bước cuối', state: 'failed', error: 'Target not found' }] }] };
        return route.fulfill({ json: data });
      });
      await page.goto('http://127.0.0.1:34719');
      const saveScenario = async () => {
        await page.locator('#saveBtn').click();
        await page.waitForFunction(() => !document.getElementById('saveBtn').disabled && document.getElementById('message').textContent.includes('Đã lưu'));
      };
      const button = page.getByRole('button', { name: 'Ph\u00e2n t\u00edch URL / l\u1ea5y t\u00ean', exact: true });
      await page.getByRole('button', { name: 'Mở chi tiết bước 1' }).click();
      await button.waitFor();
      await page.waitForFunction(() => !document.getElementById('runBtn').disabled);
      await button.click();
      await page.waitForFunction(() => document.getElementById('message').textContent.includes('Video ti\u1ebfng Vi\u1ec7t'));
      assert(inspected);
      assert.match(await page.locator('#progress').textContent(), /sample.mp4/);
      assert.match(await page.locator('#progress').textContent(), /1440×1920.*60 fps.*vp9/);
      assert.equal(await page.getByLabel('Ngôn ngữ âm thanh', { exact: true }).inputValue(), 'vi');
      assert.equal(await page.getByLabel('Độ phân giải', { exact: true }).inputValue(), '720');
      await page.getByLabel('Ngôn ngữ âm thanh', { exact: true }).selectOption('en');
      await page.getByLabel('Độ phân giải', { exact: true }).selectOption('1080');
      await saveScenario();
      assert.equal(saved.steps[0].language, 'en');
      assert.equal(saved.steps[0].quality, 1080);
      await page.locator('#variables').getByRole('button', { name: 'Chọn clip đã lưu…' }).click();
      await page.getByRole('button', { name: 'Dùng clip' }).click();
      await page.locator('.step').getByRole('button', { name: 'Chọn clip đã lưu…' }).click();
      await page.getByRole('button', { name: 'Hủy', exact: true }).click();
      await saveScenario();
      assert.equal(saved.variables.url, 'clip:Tên phim.mp4');
      assert.equal(saved.steps[0].url, '{{url}}', 'variable picker preserves the step template');
      await page.locator('.step').getByRole('button', { name: 'Chọn clip đã lưu…' }).click();
      await page.getByRole('button', { name: 'Dùng clip' }).click();
      await saveScenario();
      assert.equal(saved.steps[0].url, 'clip:Tên phim.mp4');
      assert.equal(await page.locator('#runBtn').isEnabled(), true, 'download-only workflow runs without extension');
      await page.locator('.step-head select').selectOption('openUrl');
      assert.equal(await page.locator('#runBtn').isEnabled(), false, 'browser action still requires extension');
      const stepName = page.getByRole('textbox', { name: 'Tên bước (tùy chọn)', exact: true });
      assert.equal(await page.locator('.step-title').textContent(), 'Bước 1');
      await stepName.fill('Mở trang Reels');
      await saveScenario();
      assert.equal(saved.steps[0].label, 'Mở trang Reels');
      await page.locator('#loadBtn').click();
      await page.waitForFunction(() => document.getElementById('message').textContent.includes('Đã mở'));
      assert.equal(await page.locator('.step-title').textContent(), 'Mở trang Reels');
      await page.getByRole('button', { name: 'Mở chi tiết bước 1' }).click();
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
      await page.getByRole('button', { name: 'Mở chi tiết bước 1' }).click();
      await page.getByRole('button', { name: 'Chọn page từ MongoDB', exact: true }).click();
      await page.getByLabel('Page dùng chung', { exact: true }).selectOption('8d7956a8-cb45-457f-a7f0-094ae1a9362e');
      assert.equal(await page.getByRole('textbox', { name: 'Tên page đích (khuyến nghị)', exact: true }).inputValue(), 'Page dùng chung');
      await page.getByRole('textbox', { name: 'Tên page đích (khuyến nghị)', exact: true }).fill('Lili');
      await page.getByRole('textbox', { name: 'URL page đích (nên dùng biến)', exact: true }).fill('https://example.test/lili');
      await saveScenario();
      assert.equal(saved.steps[0].pageName, 'Lili'); assert.equal(saved.steps[0].pageUrl, 'https://example.test/lili');
      assert.equal(saved.steps[0].pageId, '8d7956a8-cb45-457f-a7f0-094ae1a9362e');
      await page.locator('#historyBtn').click();
      await page.locator('#runHistory summary').waitFor();
      assert.match(await page.locator('#runHistory summary').textContent(), /download-upload-reels-lili.*Dừng tại bước 6/);
      await page.locator('#runHistory summary').click();
      assert.match(await page.locator('#runHistory').textContent(), /Đã tải trước đó.*sample.mp4/);
      assert.match(await page.locator('#runHistory').textContent(), /Thất bại.*Target not found/);
      pending = { id: 'fixture-confirmation', kind: 'download', message: 'Xác nhận tải video', step: 1, name: 'Tên phim.mp4', filePath: 'D:/Videos/Tên phim.mp4', expiresAt: Date.now() + 30000 };
      await page.evaluate(() => fetch('/api/profiles'));
      const dialog = page.getByRole('dialog', { name: 'Xác nhận tải video' });
      await dialog.getByText(/D:\/Videos\/Tên phim\.mp4/).waitFor();
      await dialog.getByRole('button', { name: 'Yes', exact: true }).click();
      await dialog.waitFor({ state: 'hidden' });
      assert.deepEqual(decision, { profile: 'Default', executionId: 'fixture-confirmation-run', id: 'fixture-confirmation', proceed: true });
      console.log('Dashboard preview, runtime reference picker, step label persistence/default and deletion/cancel: OK');
    } finally { await browser.close(); }

    const tools = require('../local-workflow-agent/src/paths').toolsDir;
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
      const choose = (options) => run(path.join(tools, 'yt-dlp.exe'), ['--ignore-config', '--no-warnings', ...selectionArgs(options), '--load-info-json', metadataFile, '--simulate', '--print', '%(format_id)s']);
      assert.equal(await choose(), '1080p60+audio', 'default Full HD uses portrait short edge');
      assert.equal(await choose({quality: 'best'}), '4k30+audio', 'best prioritizes resolution');
      assert.equal(await choose({quality: 1440}), '1440p60-high+audio');
      const vietnamese = { ...formats.at(-1), format_id: 'audio-vi', language: 'vi', abr: 64 };
      const english = { ...formats.at(-1), format_id: 'audio-en', language: 'en', abr: 256 };
      writeFormats([...formats.slice(0, -1), vietnamese, english]);
      assert.equal(await choose(), '1080p60+audio-vi', 'Vietnamese preferred over higher bitrate English');
      assert.equal(await choose({language: 'en', quality: 1440}), '1440p60-high+audio-en');
      assert.equal(await choose({language: 'auto'}), '1080p60+audio-en', 'auto uses source audio ranking');
      writeFormats([format('720p', 1280, 720, 30, 2000), ...formats]);
      assert.equal(await choose({quality: 720}), '720p+audio', 'explicit HD preference outranks higher FPS Full HD');
      writeFormats(formats.filter(item => !item.fps || item.fps === 30));
      assert.equal(await choose(), '4k30+audio', 'fallback to lower FPS when high FPS is absent, without a 1080 height cap');
      console.log('Real yt-dlp: language preference/fallback, Full HD, portrait, explicit resolution and best: OK');
      const fixture = path.join(directory, 'fixture.mp4');
      await run(path.join(tools, 'ffmpeg.exe'), ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=128x128:r=25:d=4', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4', '-c:v', 'libx264', '-g', '25', '-c:a', 'aac', '-shortest', fixture]);
      await run(path.join(tools, 'ffmpeg.exe'), ['-v', 'error', '-i', fixture, '-map', '0:v', '-map', '0:a', '-c', 'copy', '-f', 'dash', '-seg_duration', '1', '-adaptation_sets', 'id=0,streams=v id=1,streams=a', 'fixture.mpd'], { cwd: directory });
      let requests = 0, activeSegments = 0, peakSegments = 0;
      server = http.createServer(async (req, res) => {
        requests++;
        const file = path.join(directory, path.basename(new URL(req.url, 'http://localhost').pathname));
        if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
        if (/^chunk-stream0-\d+\.m4s$/.test(path.basename(file))) {
          activeSegments++;
          peakSegments = Math.max(peakSegments, activeSegments);
          res.once('close', () => activeSegments--);
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        res.writeHead(200, { 'Content-Type': file.endsWith('.mpd') ? 'application/dash+xml' : 'video/mp4', 'Content-Length': fs.statSync(file).size });
        fs.createReadStream(file).pipe(res);
      });
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      const localUrl = `http://127.0.0.1:${server.address().port}/fixture.mp4`;
      const selected = await downloadVideo({ url: 'clip:fixture.mp4', directory });
      assert.equal(selected.filePath, fs.realpathSync(fixture));
      assert.equal(selected.title, 'fixture');
      assert.equal(selected.reused, true);
      assert.equal(selected.verified, true);
      assert.equal(requests, 0, 'using a stored clip must skip network download');
      await assert.rejects(downloadVideo({ url: 'clip:../fixture.mp4', directory }), /thư mục lưu trữ/);
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
      const again = await downloadVideo({ url: localUrl, directory: path.join(directory, 'saved'), quality: 720 }, undefined, preview => {
        assert.equal(preview.name, 'fixture (2).mp4');
        assert.equal(preview.filePath, path.join(directory, 'saved', preview.name));
        assert(!fs.existsSync(preview.filePath));
        assert.deepEqual(fs.readdirSync(path.dirname(preview.filePath)), ['fixture.mp4']);
      });
      assert.equal(again.name, 'fixture (2).mp4');
      assert.notEqual(again.filePath, result.filePath);
      assert(fs.existsSync(result.filePath), 'must preserve previous video');
      const sourceBytes = fs.readFileSync(fixture);
      fs.writeFileSync(fixture, 'not a video');
      try {
        await assert.rejects(downloadVideo({ url: localUrl, directory: path.join(directory, 'saved'), quality: 'best' }), /ffprobe|readable video/i);
        await assert.rejects(downloadVideo({ url: 'clip:fixture.mp4', directory }), /ffprobe|readable video/i);
        assert.equal(fs.readdirSync(path.join(directory, 'saved')).length, 2, 'invalid downloads must not publish or leave staging files');
      } finally { fs.writeFileSync(fixture, sourceBytes); }

      const savedFragments = process.env.YTDLP_CONCURRENT_FRAGMENTS;
      let merged;
      try {
        process.env.YTDLP_CONCURRENT_FRAGMENTS = '4';
        merged = await downloadVideo({ url: localUrl.replace('.mp4', '.mpd'), directory: path.join(directory, 'merged'), quality: 720 }, undefined, preview => {
          assert.equal(preview.name, 'fixture.mp4');
          assert.equal(peakSegments, 0, 'DASH transfer starts after confirmation');
        });
      } finally {
        if (savedFragments === undefined) delete process.env.YTDLP_CONCURRENT_FRAGMENTS;
        else process.env.YTDLP_CONCURRENT_FRAGMENTS = savedFragments;
      }
      assert(peakSegments > 1 && peakSegments <= 4, 'download should request multiple video segments within the configured limit');
      const streams = JSON.parse(await run(path.join(tools, 'ffprobe.exe'), ['-v', 'quiet', '-show_streams', '-of', 'json', merged.filePath])).streams;
      assert(streams.some(item => item.codec_type === 'video') && streams.some(item => item.codec_type === 'audio'), 'FFmpeg must merge separate DASH video/audio streams');
      assert.equal(merged.name, 'fixture.mp4');
      assert(!fs.readdirSync(path.join(directory, 'merged')).some(name => name.startsWith('.video-download-')));
      const cachedDownloader = createCachedDownloader(createActivityStore(path.join(directory, 'activity')), downloadVideo);
      const firstCached = await cachedDownloader({ url: localUrl, directory: path.join(directory, 'cached') });
      const requestsAfterDownload = requests;
      const secondCached = await cachedDownloader({ url: localUrl, directory: path.join(directory, 'different-directory') }, undefined, {
        confirmDownload: preview => assert.deepEqual(preview, { name: firstCached.name, filePath: firstCached.filePath, reused: true })
      });
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
