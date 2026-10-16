const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');
const { chromium } = require('playwright');

// Real isolated Chrome pages + CDP input exercise the production worker and
// content script. The Chrome extension API adapter supplies only browser APIs.
(async () => {
  const server = http.createServer((request, response) => {
    if (request.url === '/redirect') { response.writeHead(302, { Location: '/start' }); response.end(); return; }
    if (request.url.startsWith('/image')) {
      const timer = setTimeout(() => { response.writeHead(200, { 'Content-Type': 'image/svg+xml' }); response.end('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'); }, 900);
      response.on('close', () => clearTimeout(timer)); return;
    }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(`<a id="go" href="/next">Next</a><img src="/image${request.url}">
      <button id="spa" onclick="setTimeout(()=>{document.getElementById('done').hidden=false;document.getElementById('spinner').remove()},800)">Load data</button>
      <span id="spinner">Loading</span><span id="done" hidden>Done</span><input id="text">
      <button id="noop">No operation</button>
      <button id="delayed" onclick="setTimeout(()=>location.assign('/delayed-result'),900)">Delayed navigation</button>
      ${request.url === '/delayed-result' ? '<span id="arrived">Arrived</span>' : ''}`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome' });
    const browserContext = await browser.newContext();
    const tabs = new Map(); let nextTabId = 1;
    const content = fs.readFileSync(path.join(__dirname, '../chrome-reels-extension/content.js'), 'utf8');
    let workerListener;
    let running = true;
    const event = () => ({ addListener() {} });
    async function createTab({ url }) {
      const id = nextTabId++;
      const page = await browserContext.newPage();
      const cdp = await browserContext.newCDPSession(page);
      const tab = { id, page, cdp, status: 'loading' }; tabs.set(id, tab);
      page.on('request', request => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) tab.status = 'loading'; });
      page.on('load', () => { tab.status = 'complete'; });
      await page.exposeFunction('bridgeSend', message => new Promise(resolve => workerListener(message, { tab: { id } }, resolve)));
      await page.addInitScript(() => {
        window.chrome = { runtime: {
          onMessage: { addListener(handler) { window.bridgeListener = handler; } },
          sendMessage(message, callback) { window.bridgeSend(message).then(callback); }
        } };
      });
      void page.goto(url).catch(() => {});
      return { id };
    }
    const chrome = {
      storage: { local: { get: async () => ({}), set: async () => {} }, onChanged: event() },
      runtime: { onMessage: { addListener(handler) { workerListener = handler; } }, onInstalled: event(), onStartup: event() },
      alarms: { create() {}, onAlarm: event() },
      tabs: {
        onCreated: event(), create: createTab,
        get: async id => { const tab = tabs.get(id); if (!tab) throw new Error('Tab closed'); return { id, status: tab.status, url: tab.page.url() }; },
        query: async () => [],
        sendMessage: async (id, message) => tabs.get(id).page.evaluate(message => {
          if (!window.bridgeListener) throw new Error('No content script');
          return new Promise(resolve => window.bridgeListener(message, {}, resolve));
        }, message)
      },
      scripting: { executeScript: async ({ target }) => { await tabs.get(target.tabId).page.addScriptTag({ content }); } },
      debugger: {
        onEvent: event(), getTargets: async () => [...tabs.keys()].map(tabId => ({ tabId, attached: true })),
        sendCommand: async (target, method, params) => tabs.get(target.tabId).cdp.send(method, params)
      }
    };
    const context = vm.createContext({
      chrome, console: { warn() {} }, URL, AbortSignal, crypto: require('node:crypto').webcrypto,
      setTimeout, clearTimeout, setInterval: () => 1, clearInterval() {},
      fetch: async () => ({ ok: true, json: async () => ({ running, runId: 'test-run' }) })
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../chrome-reels-extension/background.js'), 'utf8'), context);
    await new Promise(resolve => setImmediate(resolve));
    const job = { client: { profile: 'Profile 1', clientId: 'test' }, runId: 'test-run', tabId: null };
    context.job = job;
    vm.runInContext('activeJob = job', context);
    const execute = vm.runInContext('execute', context);
    let started = Date.now();
    await execute(job, { action: 'openUrl', url: base + '/redirect', navigationTimeoutMs: 10000 });
    assert(Date.now() - started >= 900, 'openUrl must wait for load, including resources');
    assert.equal(tabs.get(job.tabId).page.url(), base + '/start', 'redirects supported');
    started = Date.now();
    await execute(job, { action: 'click', selector: '#go', navigationTimeoutMs: 10000 });
    assert(Date.now() - started >= 900, 'click must await navigation rather than sleep 400ms');
    assert.equal(tabs.get(job.tabId).page.url(), base + '/next');
    started = Date.now();
    await execute(job, { action: 'click', selector: '#spa', completion: { locatorType: 'css', locator: '#done' }, navigationTimeoutMs: 5000 });
    assert(Date.now() - started >= 800, 'wait for asynchronous SPA result');
    await execute(job, { action: 'type', selector: '#text', text: 'Ready' });
    assert.equal(await tabs.get(job.tabId).page.locator('#text').inputValue(), 'Ready');
    await execute(job, { action: 'click', selector: '#noop', completion: { locator: '#spinner', state: 'hidden' }, navigationTimeoutMs: 1000 });
    await assert.rejects(execute(job, { action: 'click', selector: '#noop', completion: { locator: '#missing' }, navigationTimeoutMs: 250 }), /Completion condition timed out/);
    await execute(job, { action: 'click', selector: '#delayed', completion: { locator: '#arrived' }, navigationTimeoutMs: 5000 });
    assert.equal(tabs.get(job.tabId).page.url(), base + '/delayed-result', 'completion survives delayed document replacement');
    await assert.rejects(execute(job, { action: 'openUrl', url: base + '/start', navigationTimeoutMs: 150 }), /did not finish loading/);
    running = false;
    await assert.rejects(execute(job, { action: 'click', selector: '#noop' }), /Stopped/);
    console.log('Navigation load, redirect, document replacement, SPA completion, timeout and stop: OK');

    let savedScenario, runRequest;
    await browserContext.route('http://dashboard.test/**', async route => {
      const request = route.request();
      const endpoint = new URL(request.url()).pathname;
      let data = {};
      if (endpoint === '/') {
        return route.fulfill({ contentType: 'text/html', body: fs.readFileSync(path.join(__dirname, '../dashboard/index.html'), 'utf8') });
      }
      if (endpoint === '/api/profiles') data = { defaultProfile: 'Profile 1', profiles: ['Profile 1', 'Profile 2'].map(directory => ({ directory, profile: directory, name: directory, extensionConnected: true, running: false })) };
      if (endpoint === '/api/scenarios') data = { names: ['facebook-reels'] };
      if (endpoint === '/api/scenarios/facebook-reels') {
        if (request.method() === 'PUT') savedScenario = request.postDataJSON();
        else data = { name: 'Dashboard test', steps: [{ action: 'click', selector: '#go' }] };
      }
      if (endpoint === '/api/run') runRequest = request.postDataJSON();
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
    });
    const dashboard = await browserContext.newPage();
    await dashboard.goto('http://dashboard.test/');
    await dashboard.getByLabel('Chrome profile', { exact: true }).selectOption('Profile 2');
    await dashboard.getByLabel('Chờ phần tử kết quả (tùy chọn)', { exact: true }).fill('#ready');
    await dashboard.getByLabel('Trạng thái cần chờ', { exact: true }).selectOption('hidden');
    await Promise.all([
      dashboard.waitForResponse(response => new URL(response.url()).pathname === '/api/run'),
      dashboard.getByRole('button', { name: '▶ Chạy kịch bản', exact: true }).click()
    ]);
    assert.equal(runRequest.profile, 'Profile 2');
    assert.equal(savedScenario.steps[0].completion.locator, '#ready');
    assert.equal(savedScenario.steps[0].completion.state, 'hidden');
    assert.equal(savedScenario.steps[0].locator, '#go');
    console.log('Dashboard profile selection and completion condition persistence: OK');
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
