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
      const file = { '/': 'index.html', '/content': 'content.html', '/remote': 'remote.html' }[pathname];
      if (file) return route.fulfill({ contentType: 'text/html', body: fs.readFileSync(path.join(__dirname, '../dashboard', file), 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '') });
      if (pathname === '/remote.css') return route.fulfill({ contentType: 'text/css', body: fs.readFileSync(path.join(__dirname, '../control-web/style.css'), 'utf8') });
      return route.fulfill({ status: 404, body: '' });
    });
    for (const width of [1280, 390]) {
      await navigation.setViewportSize({ width, height: 844 });
      await navigation.goto('https://navigation.test/');
      for (const route of ['/content', '/remote', '/']) {
        await navigation.locator('.site-nav .site-links a[href="' + route + '"]').click();
        await navigation.waitForURL('https://navigation.test' + route);
        const nav = navigation.getByRole('navigation', { name: 'Điều hướng chính', exact: true });
        assert.equal(await nav.locator('[aria-current=page]').getAttribute('href'), route);
        assert.equal(await nav.locator('.site-links a').count(), 3);
        assert(await nav.evaluate(el => el.scrollWidth <= el.clientWidth));
      }
    }
    await navigation.close();
    page.on('pageerror', e => errors.push(e.message));
    const id = 'e43c8711-3731-4daa-9725-6721f78f1039';
    let loggedIn = false, online = true;
    await page.route('https://control.test/**', async route => {
      const req = route.request(), url = new URL(req.url());
      if (['/', '/app.js', '/style.css'].includes(url.pathname)) return route.fulfill({ contentType: url.pathname === '/' ? 'text/html' : url.pathname.endsWith('.js') ? 'text/javascript' : 'text/css',
        body: fs.readFileSync(path.join(__dirname, '../control-web', url.pathname === '/' ? 'index.html' : url.pathname.slice(1)), 'utf8') });
      if (req.method() === 'POST') { assert.equal(req.headers()['x-csrf-token'], url.pathname === '/api/login' ? '' : 'fixture-csrf'); posted.push({ path: url.pathname, data: req.postDataJSON() }); }
      if (url.pathname === '/api/login') { loggedIn = true; return route.fulfill({ json: { email: 'user@example.test', csrf: 'fixture-csrf' } }); }
      if (url.pathname === '/api/me') return route.fulfill({ status: loggedIn ? 200 : 401, json: loggedIn ? { email: 'user@example.test', csrf: 'fixture-csrf' } : { error: 'Login required' } });
      if (url.pathname === '/api/devices') return route.fulfill({ json: { devices: [{ id, name: '<img src=x onerror=alert(1)>', online, revoked: false, lastSeen: Date.now(), metadata: {
        profiles: [{ directory: 'Default', name: 'Test', extensionConnected: true }], scenarios: [{ name: 'sample', variables: ['caption'], steps: 2 }] } }] } });
      if (url.pathname === '/api/commands') return route.fulfill({ json: req.method() === 'POST' ? { command: { id } } : { commands: [{ id, type: 'run', state: 'failed', payload: { scenario: 'sample', profile: 'Default' }, created: Date.now(), result: { total: 2, index: 1, stoppedAtStep: 2,
        steps: [{ number: 1, label: 'Tải clip', state: 'succeeded', action: 'downloadVideo' }, { number: 2, label: 'Upload', state: 'failed', action: 'upload' }] } }] } });
      return route.fulfill({ json: {} });
    });
    await page.goto('https://control.test/'); await page.locator('#login').waitFor({ state: 'visible' });
    await page.locator('[name=email]').fill('user@example.test'); await page.locator('[name=password]').fill('fixture-password'); await page.locator('#login-form button').click();
    await page.locator('.device').click(); await page.locator('#detail').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#device-name').textContent(), '<img src=x onerror=alert(1)>'); assert.equal(await page.locator('#device-name img').count(), 0);
    await page.locator('#variables input[type=checkbox]').check(); await page.locator('#variables input:not([type=checkbox])').fill('Tiếng Việt');
    await page.locator('#run').click(); await page.waitForFunction(() => document.getElementById('message').textContent.includes('Đã gửi lệnh chạy'));
    const request = posted.find(p => p.path === '/api/commands').data;
    assert.equal(request.variables.caption, 'Tiếng Việt'); assert.match(request.requestId, /^[0-9a-f-]{36}$/);
    assert.match(await page.locator('#history').textContent(), /Dừng tại bước 2\/2/);
    await page.locator('#history summary').click(); assert.match(await page.locator('#history ol').textContent(), /Tải clip — Thành công/);
    await page.setViewportSize({ width: 390, height: 844 }); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    // Local approval UI uses its session header and explicit claim, with fake state only.
    const state = { configured: false, url: 'https://control.test', policy: { profiles: [], scenarios: [], variables: {} }, pending: { id, code: 'FIXTURECODE1', expires: Date.now() + 60000, email: 'user@example.test', claim: 'fixture-claim' },
      available: { profiles: [{ directory: 'Default', name: 'Fixture' }], scenarios: [{ name: 'sample', variables: ['caption'] }] } };
    await page.route('https://local.test/**', async route => {
      const req = route.request(), endpoint = new URL(req.url()).pathname;
      if (endpoint === '/remote') return route.fulfill({ contentType: 'text/html', body: fs.readFileSync(path.join(__dirname, '../dashboard/remote.html'), 'utf8').replaceAll('__LOCAL_AGENT_DASHBOARD_TOKEN__', 'local-fixture') });
      if (endpoint === '/remote.js' || endpoint === '/remote.css') return route.fulfill({ contentType: endpoint.endsWith('js') ? 'text/javascript' : 'text/css', body: fs.readFileSync(path.join(__dirname, endpoint.endsWith('js') ? '../dashboard/remote.js' : '../control-web/style.css'), 'utf8') });
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
    await page.locator('#policy-form button').click(); await page.waitForFunction(() => document.getElementById('message').textContent === 'Đã lưu quyền điều khiển.');
    assert.deepEqual(posted.find(p => p.path.endsWith('/policy')).data.variables, { sample: ['caption'] });
    await page.locator('#approve').click(); await page.waitForFunction(() => document.getElementById('pending').hidden);
    assert.equal(posted.find(p => p.path.endsWith('/pair-approve')).data.claim, 'fixture-claim');
    assert.deepEqual(errors, []);
    console.log('remote web: isolated fixture login, XSS-safe rendering, run variables, step history, mobile layout and local consent passed');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
