const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const {spawn} = require('node:child_process');
const {once} = require('node:events');
const {chromium} = require('playwright');

(async () => {
  if (!fs.existsSync(chromium.executablePath())) throw Error('Install the isolated extension test browser with: npx playwright install chromium');
  const root = path.resolve(__dirname, '..');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'extension-profiles-'));
  let agent, context;
  try {
    const probe = http.createServer(); await new Promise(r => probe.listen(0, '127.0.0.1', r));
    const port = probe.address().port; await new Promise(r => probe.close(r));
    const base = `http://127.0.0.1:${port}`, token = 'extension-profile-fixture-token-123456';
    const metadata = path.join(temp, 'metadata'), scenarios = path.join(temp, 'scenarios');
    fs.mkdirSync(metadata); fs.mkdirSync(scenarios);
    fs.writeFileSync(path.join(metadata, 'Local State'), JSON.stringify({profile: {info_cache: {'Profile 1': {name: 'First fixture'}, 'Profile 2': {name: 'Second fixture'}}}}));
    fs.writeFileSync(path.join(scenarios, 'wait.json'), JSON.stringify({steps: [{action: 'wait', ms: 60000}]}));
    agent = spawn(process.execPath, [path.join(root, 'local-agent.js'), '--daemon'], {
      cwd: temp, stdio: ['ignore', 'pipe', 'pipe'],
      env: {...process.env, LOCAL_AGENT_ENV_FILE: path.join(temp, 'missing.env'), MONGODB_URI: '', LOCAL_AGENT_API_TOKEN: token,
        LOCAL_AGENT_PORT: String(port), LOCAL_AGENT_DATA_DIR: path.join(temp, 'data'), LOCAL_AGENT_SCENARIOS_DIR: scenarios,
        CHROME_USER_DATA_DIR: metadata, CHROME_PROFILE: 'Profile 1'}
    });
    let logs = ''; agent.stdout.on('data', b => { logs += b; }); agent.stderr.on('data', b => { logs += b; });
    let ready = false;
    for (let n = 0; n < 80; n++) { try { if ((await fetch(base)).ok) { ready = true; break; } } catch {} await new Promise(r => setTimeout(r, 50)); }
    assert(ready, logs);
    async function api(route, body) {
      const response = await fetch(base + route, {method: body ? 'POST' : 'GET', headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'}, body: body ? JSON.stringify(body) : undefined});
      assert(response.ok); return response.json();
    }
    async function waitForConnected(profile) {
      for (let n = 0; n < 40; n++) {
        if ((await api('/api/v1/profiles')).profiles.find(p => p.directory === profile)?.extensionConnected) return;
        await new Promise(r => setTimeout(r, 250));
      }
      assert.fail(`Extension did not connect to ${profile}`);
    }
    const extension = path.join(temp, 'extension');
    fs.cpSync(path.join(root, 'chrome-reels-extension'), extension, {recursive: true});
    for (const name of ['options.js', 'background.js']) {
      const file = path.join(extension, name); fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replaceAll('http://127.0.0.1:34719', base));
    }
    context = await chromium.launchPersistentContext(path.join(temp, 'test-browser'), {
      channel: 'chromium', headless: true,
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const extensionId = new URL(worker.url()).host;
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);
    await page.waitForFunction(() => document.querySelectorAll('#profile option').length === 3);
    const discovery = await page.evaluate(async base => {
      const get = await fetch(base + '/api/profiles');
      const post = await fetch(base + '/api/profiles', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}'});
      return {get: get.status, post: post.status};
    }, base);
    assert.deepEqual(discovery, {get: 401, post: 200}, 'real extension GET omits Origin; POST discovers profiles with API token enabled');
    await page.locator('#profile').selectOption('Profile 1'); await page.locator('#save').click();
    await page.waitForFunction(async () => (await chrome.storage.local.get('profile')).profile === 'Profile 1');
    await waitForConnected('Profile 1');
    await page.locator('#profile').selectOption('Profile 2'); await page.locator('#save').click();
    await page.waitForFunction(async () => (await chrome.storage.local.get('profile')).profile === 'Profile 2');
    await waitForConnected('Profile 2');
    const stored = await page.evaluate(() => chrome.storage.local.get(null));
    assert.deepEqual(Object.keys(stored).sort(), ['clientId', 'profile']); assert(!JSON.stringify(stored).includes(token));
    const run = await api('/api/v1/runs', {scenario: 'wait', profile: 'Profile 2'});
    await page.locator('#profile').selectOption('Profile 1'); await page.locator('#save').click();
    await page.waitForFunction(() => document.getElementById('message').textContent.includes('Dừng kịch bản'));
    assert.equal((await page.evaluate(() => chrome.storage.local.get('profile'))).profile, 'Profile 2', 'cannot switch a running profile');
    await api(`/api/v1/runs/${run.runId}/stop`, {});
    fs.mkdirSync(path.join(root, 'test-results'), {recursive: true});
    await page.screenshot({path: path.join(root, 'test-results/extension-profile-options.png')});
    for (const status of [400, 401, 404]) {
      await page.unroute(base + '/api/profiles');
      await page.route(base + '/api/profiles', route => route.fulfill({status, contentType: 'application/json', body: JSON.stringify({error: 'Old agent error'})}));
      await page.reload();
      await page.waitForFunction(() => document.getElementById('message').textContent.includes('Khởi động lại node local-agent.js'));
    }
    console.log('Real extension Options: reproduced GET/Origin 401, POST discovery, connect/switch, active-run guard, no token storage and old-agent guidance passed');
  } finally {
    await context?.close();
    if (agent && agent.exitCode === null) { const closed = once(agent, 'close'); agent.kill(); await closed; }
    fs.rmSync(temp, {recursive: true, force: true});
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
