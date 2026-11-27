const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
(async () => {
  // Isolated browser, intercepted HTTP and fake devices only. No user's Chrome profile.
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage(), errors = [], posted = [];
    // Navigate the local workspace pages without connecting to a real agent or Chrome profile.
    const navigation = await browser.newPage();
    await navigation.route('https://navigation.test/**', async route => {
      const pathname = new URL(route.request().url()).pathname;
      const file = { '/': 'index.html', '/content': 'content.html', '/remote': 'remote.html', '/scanner': 'scanner.html' }[pathname];
      if (file) return route.fulfill({ contentType: 'text/html', body: fs.readFileSync(path.join(__dirname, '../local-workflow-agent/dashboard', file), 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '') });
      if (pathname === '/remote.css') return route.fulfill({ contentType: 'text/css', body: fs.readFileSync(path.join(__dirname, '../local-workflow-agent/dashboard/remote.css'), 'utf8') });
      return route.fulfill({ status: 404, body: '' });
    });
    for (const width of [1280, 390]) {
      await navigation.setViewportSize({ width, height: 844 });
      await navigation.goto('https://navigation.test/');
      for (const route of ['/content', '/remote', '/scanner', '/']) {
        await navigation.locator('.site-nav .site-links a[href="' + route + '"]').click();
        await navigation.waitForURL('https://navigation.test' + route);
        const nav = navigation.getByRole('navigation', { name: 'Điều hướng chính', exact: true });
        assert.equal(await nav.locator('[aria-current=page]').getAttribute('href'), route);
        assert.equal(await nav.locator('.site-links a').count(), 4);
        assert(await nav.evaluate(el => el.scrollWidth <= el.clientWidth));
      }
    }
    await navigation.close();
    page.on('pageerror', e => errors.push(e.message));
    const id = 'e43c8711-3731-4daa-9725-6721f78f1039';
    const otherId = '227ba0f3-8a00-4f33-9958-73399556cf14';
    const historyFixtures = new Map();
    const target = 'a'.repeat(64), uploadTarget = 'b'.repeat(64), clip = 'Clip tiếng Việt.mp4';
    let loggedIn = false, online = true, downloadConfirmation, scheduledRun;
    await page.route('https://control.test/**', async route => {
      const req = route.request(), url = new URL(req.url());
      if (['/', '/toast.js', '/app.js', '/runtime.js', '/style.css'].includes(url.pathname)) return route.fulfill({ contentType: url.pathname === '/' ? 'text/html' : url.pathname.endsWith('.js') ? 'text/javascript' : 'text/css',
        body: fs.readFileSync(path.join(__dirname, '../control-server/web', url.pathname === '/' ? 'index.html' : url.pathname.slice(1)), 'utf8') });
      if (req.method() === 'POST') { assert.equal(req.headers()['x-csrf-token'], url.pathname === '/api/login' ? '' : 'fixture-csrf'); posted.push({ path: url.pathname, data: req.postDataJSON() }); }
      if (url.pathname === '/api/login') { loggedIn = true; return route.fulfill({ json: { email: 'user@example.test', csrf: 'fixture-csrf' } }); }
      if (url.pathname === '/api/me') return route.fulfill({ status: loggedIn ? 200 : 401, json: loggedIn ? { email: 'user@example.test', csrf: 'fixture-csrf' } : { error: 'Login required' } });
      if (url.pathname === '/api/devices') return route.fulfill({ json: { devices: [{ id, name: '<img src=x onerror=alert(1)>', online, revoked: false, lastSeen: Date.now(), localTasks: { omitted: 0, tasks: [
          { id: uploadTarget, profile: 'Default', scenario: 'sample', state: 'running', index: 0, total: 2 },
          { id: target, profile: 'Default', scenario: 'sample', state: 'scheduled', scheduledAt: Date.now() + 600000 }
        ] }, metadata: { network: { downloadMbps: 8.25, uploadMbps: 1.75 },
        profiles: [{ directory: 'Default', name: 'Test', extensionConnected: true }], scenarios: [{ name: 'sample', variables: ['video_url'], steps: 2,
          clipTargets: [{ id: target, index: 0, action: 'downloadVideo', variable: 'video_url' }, { id: uploadTarget, index: 1, action: 'upload' }] }] } },
        ...(historyFixtures.has(otherId) ? [{ id: otherId, name: 'Máy còn lại', online, metadata: {} }] : [])] } });
      if (url.pathname === '/api/commands' && url.searchParams.has('request')) return route.fulfill({ json: { commands: [{ state: 'succeeded', result: { clips: { names: [clip], more: false } } }] } });
      if (url.pathname === '/api/schedule-decision') {
        scheduledRun = null;
        return route.fulfill({ json: { ok: true } });
      }
      if (url.pathname === '/api/commands' && req.method() === 'POST' && req.postDataJSON().scheduledAt) {
        scheduledRun = req.postDataJSON();
        return route.fulfill({ json: { command: { id: scheduledRun.requestId } } });
      }
      if (url.pathname === '/api/commands' && req.method() === 'GET' && historyFixtures.has(url.searchParams.get('device'))) {
        return route.fulfill({ json: { commands: historyFixtures.get(url.searchParams.get('device')) } });
      }
      if (url.pathname === '/api/commands' && scheduledRun) return route.fulfill({ json: { commands: [{
        id: scheduledRun.requestId, type: 'run', state: 'confirming', payload: scheduledRun,
        created: Date.now(), confirmBy: Date.now() + 30000
      }] } });
      if (url.pathname === '/api/download-confirmation') {
        downloadConfirmation = null;
        return route.fulfill({ json: { ok: true } });
      }
      if (url.pathname === '/api/commands' && downloadConfirmation) return route.fulfill({ json: { commands: [{
        id: posted.find(p => p.data.type === 'run').data.requestId, type: 'run', state: 'running', payload: { scenario: 'sample', profile: 'Default' },
        created: Date.now(), result: { total: 2, index: 0, confirmation: downloadConfirmation }
      }] } });
      if (url.pathname === '/api/commands') return route.fulfill({ json: req.method() === 'POST' ? { command: { id } } : { commands: [{ id: posted.find(p => p.data.type === 'run')?.data.requestId || id, type: 'run', state: 'failed', payload: { scenario: 'sample', profile: 'Default' }, created: Date.now(), result: { total: 2, index: 1, stoppedAtStep: 2, message: 'Upload thất bại',
        steps: [{ number: 1, label: 'Tải clip', state: 'succeeded', action: 'downloadVideo' }, { number: 2, label: 'Upload', state: 'failed', action: 'upload' }] } }] } });
      return route.fulfill({ json: {} });
    });
    await page.goto('https://control.test/'); await page.locator('#login').waitFor({ state: 'visible' });
    await page.locator('[name=email]').fill('user@example.test'); await page.locator('[name=password]').fill('fixture-password'); await page.locator('#login-form button').click();
    await page.locator('.device').click(); await page.locator('#detail').waitFor({ state: 'visible' });
    await page.locator('#history').getByText('Upload thất bại').waitFor();
    const taskNotice = page.getByRole('dialog').filter({ hasText: 'Thông báo tác vụ' });
    assert.equal(await taskNotice.count(), 0);
    assert.equal(await page.locator('#device-name').textContent(), '<img src=x onerror=alert(1)>'); assert.equal(await page.locator('#device-name img').count(), 0);
    await page.locator('#variables input[type=checkbox]').check(); await page.locator('#variables input:not([type=checkbox])').fill('Tiếng Việt');
    const paste = page.getByRole('button', { name: 'Dán', exact: true });
    const override = page.locator('#variables input[type=checkbox]');
    await override.uncheck();
    assert(await paste.isDisabled());
    await override.check();
    await page.context().grantPermissions(['clipboard-write']);
    await paste.click();
    await page.getByText('Không đọc được clipboard. Hãy dán thủ công vào ô video_url.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('textbox', { name: 'Giá trị video_url' }).inputValue(), 'Tiếng Việt');
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.evaluate(() => navigator.clipboard.writeText('https://example.test/video'));
    await paste.click();
    await page.waitForFunction(() => document.querySelector('.variable-field input').value === 'https://example.test/video');
    await page.getByRole('button', { name: 'Chọn clip cho video_url…' }).click();
    await page.getByRole('button', { name: 'Dùng clip' }).click();
    assert.equal(await page.getByRole('textbox', { name: 'Giá trị video_url' }).inputValue(), 'clip:' + clip);
    await page.getByRole('button', { name: 'Chọn clip · Bước 2 (Upload)' }).click();
    await page.getByRole('button', { name: 'Dùng clip' }).click();
    await page.locator('#run').click(); await page.locator('.toast').filter({hasText:'Đã gửi lệnh chạy'}).waitFor();
    assert.deepEqual(posted.filter(p => p.data.type === 'browseClips').map(p => p.data.target), [target, uploadTarget]);
    const request = posted.find(p => p.path === '/api/commands' && p.data.type === 'run').data;
    assert.equal(request.variables.video_url, 'clip:' + clip); assert.match(request.requestId, /^[0-9a-f-]{36}$/);
    assert.deepEqual(request.clips, { [uploadTarget]: clip });
    await taskNotice.waitFor({ state: 'visible' });
    await taskNotice.getByRole('button', { name: 'Đã hiểu' }).click();
    await taskNotice.waitFor({ state: 'hidden' });
    assert.match(await page.locator('#history').textContent(), /Dừng tại bước 2\/2/);
    await page.locator('#history summary').click(); assert.match(await page.locator('#history ol').textContent(), /Tải clip — Thành công/);
    downloadConfirmation = { id: target, name: clip, filePath: 'D:/Videos/' + clip, step: 1, expiresAt: Date.now() + 30000 };
    await page.locator('.device').click();
    const downloadDialog = page.getByRole('dialog', { name: 'Xác nhận tải video' });
    await downloadDialog.getByText('Đường dẫn trên máy local: D:/Videos/' + clip).waitFor();
    await downloadDialog.getByRole('button', { name: 'No', exact: true }).click();
    await downloadDialog.waitFor({ state: 'hidden' });
    assert.deepEqual(posted.find(p => p.path === '/api/download-confirmation').data, { deviceId: id, runId: request.requestId, id: target, proceed: false });
    await page.setViewportSize({ width: 390, height: 844 }); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.reload();
    await page.locator('.device').click();
    await page.locator('#history').getByText('Upload thất bại').waitFor();
    assert.equal(await taskNotice.count(), 0);
    assert.match(await page.locator('#metrics').textContent(), /8.25 Mbps/);
    await page.locator('#local-running').getByRole('button', { name: 'Dừng lượt local' }).click();
    await page.getByText('Đã gửi yêu cầu đến máy local.',{exact:true}).waitFor();
    assert.equal(posted.find(p => p.data.type === 'manageLocalTask').data.taskId, uploadTarget);
    assert.equal(await page.locator('#local-schedules').getByRole('button', { name: 'Hủy lịch' }).count(), 1);
    await page.locator('#schedule-later').click();
    await page.locator('#schedule-create').click();
    const scheduleDialog = page.getByRole('dialog', { name: 'Chạy kịch bản theo lịch?' });
    await scheduleDialog.getByRole('button', { name: 'No', exact: true }).click();
    await scheduleDialog.waitFor({ state: 'hidden' });
    const scheduledRequest = posted.find(p => p.data.scheduledAt).data;
    assert(scheduledRequest.scheduledAt > Date.now() + 13 * 60000);
    assert.equal(scheduledRequest.profile, 'Default');
    assert.equal(posted.find(p => p.path === '/api/schedule-decision').data.runId, scheduledRequest.requestId);

    const now = Date.now();
    const commands = Array.from({ length: 19 }, (_, i) => ({ id: `task-${i + 1}`, type: 'run',
      created: now - i * 60000, state: i % 2 ? 'failed' : 'succeeded',
      payload: { scenario: `Scenario ${i + 1}`, profile: `Profile ${i + 1}` },
      result: { startedAt: now - i * 60000 + 1000, endedAt: now - i * 60000 + 2000 } }));
    historyFixtures.set(id, [...commands].reverse());
    historyFixtures.set(otherId, []);
    await page.reload();
    await page.locator('.device').first().click();
    await page.getByText('Trang 1/3 · 1–8/19 lệnh', { exact: true }).waitFor();
    const history = page.locator('#history'), titles = history.locator('h3');
    const prev = page.locator('#history-prev'), next = page.locator('#history-next');
    assert.deepEqual(await titles.allTextContents(), commands.slice(0, 8).map(cmd => cmd.payload.scenario));
    assert(await prev.isDisabled());
    assert.equal(await history.locator('.history-task--success .history-status').first().textContent(), 'Thành công');
    assert.equal(await history.locator('.history-task--failure .history-status').first().textContent(), 'Thất bại');
    assert.equal(await history.locator('.history-profile').first().textContent(), 'Profile · Profile 1');
    assert.deepEqual(await history.locator('article').first().locator('dt').allTextContents(), ['Tạo lệnh', 'Bắt đầu', 'Kết thúc']);
    assert.equal(await history.locator('time').first().getAttribute('datetime'), new Date(now).toISOString());
    await next.click();
    assert.deepEqual(await titles.allTextContents(), commands.slice(8, 16).map(cmd => cmd.payload.scenario));
    await next.click();
    assert.deepEqual(await titles.allTextContents(), commands.slice(16).map(cmd => cmd.payload.scenario));
    assert(await next.isDisabled());
    await prev.click();

    // Keep page 2 during refresh and still notify about a result from page 1.
    commands[0].result.message = 'Kết quả mới ngoài trang';
    await page.locator('.device').first().click();
    await taskNotice.getByText('Scenario 1: Kết quả mới ngoài trang').waitFor();
    await taskNotice.getByRole('button', { name: 'Đã hiểu' }).click();
    assert.equal(await page.locator('#history-page').textContent(), 'Trang 2/3 · 9–16/19 lệnh');
    assert.equal(await history.getByText('Kết quả mới ngoài trang').count(), 0);

    await page.getByRole('button', { name: /Máy còn lại/ }).click();
    await history.getByText('Chưa có lệnh điều khiển.').waitFor();
    assert(await page.locator('#history-pagination').isHidden());
    await page.locator('.device').first().click();
    await history.getByRole('heading', { name: 'Scenario 9', exact: true }).waitFor();
    assert.equal(await page.locator('#history-page').textContent(), 'Trang 2/3 · 9–16/19 lệnh');
    for (const width of [320, 390, 768, 1024, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const field = await page.locator('.variable-field input').boundingBox();
      const button = await paste.boundingBox();
      assert(button.x >= field.x + field.width && Math.abs(button.y - field.y) < 8);
    }
    historyFixtures.set(id, commands.slice(0, 5));
    await page.locator('.device').first().click();
    await history.getByRole('heading', { name: 'Scenario 1', exact: true }).waitFor();
    assert.equal(await titles.count(), 5);
    assert(await page.locator('#history-pagination').isHidden());

    online = true;
    await page.locator('.device').first().click();
    await page.waitForFunction(() => document.getElementById('device-status').textContent === 'Online');
    assert(await page.locator('#remove-device').isHidden());
    online = false;
    await page.locator('.device').first().click();
    await page.locator('#remove-device').waitFor();
    page.once('dialog', dialog => dialog.dismiss());
    await page.locator('#remove-device').click();
    assert(!posted.some(p => p.path === '/api/device-remove'));
    await page.route('**/api/device-remove', async route => {
      assert.equal(route.request().postDataJSON().id, id);
      await page.route('**/api/devices', r => r.fulfill({ json: { devices: [] } }));
      await route.fulfill({ json: { ok: true } });
    });
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#remove-device').click();
    await page.locator('#empty').waitFor();
    assert.equal(await page.locator('.device').count(), 0);

    // Local approval UI uses its session header and explicit claim, with fake state only.
    const state = { configured: false, url: 'https://control.test', policy: { profiles: [], scenarios: [], variables: {} }, pending: { id, code: 'FIXTURECODE1', expires: Date.now() + 60000, email: 'user@example.test', claim: 'fixture-claim' },
      available: { profiles: [{ directory: 'Default', name: 'Fixture' }], scenarios: [{ name: 'sample', variables: ['caption'] }] } };
    await page.route('https://local.test/**', async route => {
      const req = route.request(), endpoint = new URL(req.url()).pathname;
      if (endpoint === '/remote') return route.fulfill({ contentType: 'text/html', body: fs.readFileSync(path.join(__dirname, '../local-workflow-agent/dashboard/remote.html'), 'utf8').replaceAll('__LOCAL_AGENT_DASHBOARD_TOKEN__', 'local-fixture') });
      if (['/remote.js', '/issues.js', '/remote.css'].includes(endpoint)) return route.fulfill({ contentType: endpoint.endsWith('js') ? 'text/javascript' : 'text/css', body: fs.readFileSync(path.join(__dirname, endpoint.endsWith('js') ? '../local-workflow-agent/dashboard' + endpoint : '../local-workflow-agent/dashboard/remote.css'), 'utf8') });
      assert.equal(req.headers()['x-local-agent-session'], 'local-fixture');
      if (req.method() === 'POST') {
        posted.push({ path: endpoint, data: req.postDataJSON() });
        if (endpoint.endsWith('policy')) state.policy = req.postDataJSON();
        if (endpoint.endsWith('pair-approve')) { state.pending = null; state.configured = true; state.device = { id, email: 'user@example.test' }; }
      }
      return route.fulfill({ json: state });
    });
    await page.goto('https://local.test/remote'); await page.locator('#approve').waitFor({ state: 'visible' });
    assert.match(await page.locator('#claim').textContent(), /user@example.test/);
    await page.locator('#profiles input').check(); await page.locator('input[data-scenario]').check(); await page.locator('input[data-variable]').check();
    await page.locator('input[data-clip-scenario]').check();
    await page.locator('#policy-form button').click(); await page.waitForFunction(() => document.getElementById('message').textContent === 'Đã lưu quyền điều khiển.');
    assert.deepEqual(posted.find(p => p.path.endsWith('/policy')).data.variables, { sample: ['caption'] });
    assert.deepEqual(posted.find(p => p.path.endsWith('/policy')).data.clipScenarios, ['sample']);
    await page.locator('#approve').click(); await page.waitForFunction(() => document.getElementById('pending').hidden);
    assert.equal(posted.find(p => p.path.endsWith('/pair-approve')).data.claim, 'fixture-claim');
    assert.deepEqual(errors, []);
    console.log('remote web: login, run variables, per-device history pagination, off-page results, mobile layout and local consent passed');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
