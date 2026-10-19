const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');
const os = require('node:os');
const { chromium } = require('playwright');
const { createWorkflows } = require('../src/agent/workflows');
const { createScenarioStore } = require('../src/agent/scenario-store');

// Real isolated Chrome pages + CDP input exercise the production worker and
// content script. The Chrome extension API adapter supplies only browser APIs.
(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-browser-'));
  const uploadFile = path.join(temp, 'upload.txt'); fs.writeFileSync(uploadFile, 'upload fixture');
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
      <div role="presentation" aria-label="Mô tả thước phim của bạn...">Outside duplicate</div>
      <div role="presentation" aria-label="Mô tả thước phim của bạn..." style="padding:12px;border:1px solid">
        <div id="rich" contenteditable="true" role="textbox" aria-label="Nội dung phim" style="min-height:35px"><p>Nội dung cũ</p></div>
      </div>
      <textarea id="textarea">Cũ</textarea><input id="readonly-text" readonly value="Giữ nguyên">
      <div id="activation" style="padding:12px" onclick="if(!this.querySelector('input'))setTimeout(()=>{this.innerHTML='<input id=activated>';},200)">Click to edit</div>
      <button id="not-editable">Cannot type here</button>
      <script>window.richEvents=[];document.getElementById('rich').addEventListener('input',e=>richEvents.push({type:e.type,trusted:e.isTrusted}));</script>
      <input id="date" type="date"><input id="time" type="time"><input id="date-text" aria-label="Date text">
      <input id="limited-date" type="date" min="2026-10-01"><input id="readonly-date" type="date" readonly>
      <input id="file" type="file" hidden><button id="upload" onclick="document.getElementById('file').click()">Upload</button>
      <script>window.dateEvents=[];document.getElementById('date').addEventListener('input',e=>dateEvents.push(e.type));document.getElementById('date').addEventListener('change',e=>dateEvents.push(e.type));</script>
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
    let debuggerListener, debuggerQueries = 0;
    let running = true;
    const event = () => ({ addListener() {} });
    async function createTab({ url }) {
      const id = nextTabId++;
      const page = await browserContext.newPage();
      const cdp = await browserContext.newCDPSession(page);
      cdp.on('Page.fileChooserOpened', params => debuggerListener?.({ tabId: id }, 'Page.fileChooserOpened', params));
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
        onEvent: { addListener(listener) { debuggerListener = listener; } }, getTargets: async () => { debuggerQueries++; return [...tabs.keys()].map(tabId => ({ tabId, attached: true })); },
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
    const typingPage = tabs.get(job.tabId).page;
    const store = createScenarioStore(temp);
    const template = { variables: { tenphimn: 'Tên phim tiếng Việt từ biến' }, steps: [{ action: 'type', locatorType: 'role', role: 'presentation', locator: 'Mô tả thước phim của bạn...', index: 1, text: '{{tenphimn}}', clear: true }] };
    await typingPage.locator('#text').focus();
    await execute(job, store.prepare(template).steps[0]);
    assert.equal(await typingPage.locator('#rich').innerText(), template.variables.tenphimn);
    assert.equal(await typingPage.locator('#text').inputValue(), 'Ready', 'typing must focus the chosen editor, not a previously active field');
    assert(await typingPage.locator('#rich').evaluate(element => document.activeElement === element && element.contains(window.getSelection().anchorNode)), 'rich editor must have focus and a caret');
    assert((await typingPage.evaluate(() => richEvents)).every(event => event.trusted), 'clear and insert must use real browser editing events');
    template.variables.tenphimn = 'Giá trị mới khi chạy lại';
    await execute(job, store.prepare(template).steps[0]);
    assert.equal(await typingPage.locator('#rich').innerText(), 'Giá trị mới khi chạy lại');
    assert.equal(template.steps[0].text, '{{tenphimn}}', 'template is never replaced with a hard-coded value');
    await execute(job, { action: 'type', selector: '#rich p', text: ' + thêm', clear: false });
    assert.equal(await typingPage.locator('#rich').innerText(), 'Giá trị mới khi chạy lại + thêm');
    await execute(job, { action: 'type', selector: '#textarea', text: 'Dòng mới\nDòng hai' });
    assert.equal(await typingPage.locator('#textarea').inputValue(), 'Dòng mới\nDòng hai');
    await execute(job, { action: 'type', selector: '#text', text: ' + nối', clear: false });
    assert.equal(await typingPage.locator('#text').inputValue(), 'Ready + nối');
    await execute(job, { action: 'type', selector: '#activation', text: 'Editor mở sau click', timeoutMs: 2000 });
    assert.equal(await typingPage.locator('#activated').inputValue(), 'Editor mở sau click');
    await assert.rejects(execute(job, { action: 'type', selector: '#readonly-text', text: 'Sai' }), /chỉ đọc/);
    await assert.rejects(execute(job, { action: 'type', selector: '#not-editable', text: 'Sai', timeoutMs: 300 }), /focus\/con trỏ/);
    await assert.rejects(execute(job, { action: 'type', selector: '#text', text: '{{tenphimn}}' }), /Biến chưa được truy xuất/);
    assert.equal(await typingPage.locator('#text').inputValue(), 'Ready + nối', 'unresolved variables must fail before clearing or inserting text');
    await execute(job, { action: 'setDate', selector: '#date', value: '2026-10-18' });
    await execute(job, { action: 'setTime', locatorType: 'css', locator: '#time', value: '09:35' });
    await execute(job, { action: 'setDate', locatorType: 'label', locator: 'Date text', value: '2026-10-18' });
    const targetPage = tabs.get(job.tabId).page;
    assert.equal(await targetPage.locator('#date').inputValue(), '2026-10-18');
    assert.equal(await targetPage.locator('#time').inputValue(), '09:35');
    assert.equal(await targetPage.locator('#date-text').inputValue(), '18/10/2026');
    assert.deepEqual(await targetPage.evaluate(() => window.dateEvents), ['input', 'change']);
    await execute(job, { action: 'setDate', selector: '#date-text', value: '2026-10-18', format: 'YYYY-MM-DD' });
    assert.equal(await targetPage.locator('#date-text').inputValue(), '2026-10-18');
    await assert.rejects(execute(job, { action: 'setDate', selector: '#date', value: '2026-02-30' }), /YYYY-MM-DD/);
    await assert.rejects(execute(job, { action: 'setDate', selector: '#limited-date', value: '2026-09-18' }), /min\/max\/step/);
    await assert.rejects(execute(job, { action: 'setDate', selector: '#readonly-date', value: '2026-10-18' }), /không cho phép/);
    started = Date.now();
    await execute(job, { action: 'upload', selector: '#upload', filePath: uploadFile, waitAfterMs: 0 });
    assert.equal(await targetPage.locator('#file').evaluate(input => input.files[0].name), 'upload.txt');
    assert(Date.now() - started < 5000, 'upload chooser should complete without waiting for its full timeout');
    assert.equal(debuggerQueries, 1, 'reuse debugger connection across repeated input commands');
    let completeDownload;
    const pipeline = createWorkflows({ scenarios: store, defaultProfile: 'Profile 1', profiles: () => [{ directory: 'Profile 1' }], openFolder: async () => {}, downloadVideo: () => new Promise(resolve => { completeDownload = resolve; }) });
    const session = pipeline.connect({ profile: 'Profile 1', clientId: 'pipeline' });
    pipeline.start('Profile 1', { steps: [
      { action: 'downloadVideo', url: base + '/video', directory: temp },
      { action: 'openUrl', url: base + '/start' },
      { action: 'upload', selector: '#upload', filePath: '{{download_file_path}}', waitAfterMs: 0 },
      { action: 'type', selector: '#text', text: '{{download_title}}', clear: true }
    ] });
    assert.equal(pipeline.next(session).step, null);
    completeDownload({ title: 'Tên clip mới tải', filePath: uploadFile, name: 'upload.txt', id: 'fixture', verified: true });
    await new Promise(resolve => setImmediate(resolve));
    while (pipeline.status('Profile 1').running) {
      const dispatched = pipeline.next(session);
      assert(dispatched.step);
      await execute(job, dispatched.step);
      pipeline.result(session, { runId: dispatched.runId, id: dispatched.step.id, ok: true, tabId: job.tabId });
    }
    assert.equal(await tabs.get(job.tabId).page.locator('#file').evaluate(input => input.files[0].name), 'upload.txt');
    assert.equal(await tabs.get(job.tabId).page.locator('#text').inputValue(), 'Tên clip mới tải');
    await assert.rejects(execute(job, { action: 'upload', selector: '#upload', filePath: '{{download_file_path}}' }), /resolved final/);
    assert.equal(debuggerQueries, 2, 'one debugger lookup per tab, reused for upload and typing');
    // Return to the original page for the remaining existing checks.
    job.tabId = [...tabs.values()].find(tab => tab.page === targetPage).id;

    await execute(job, { action: 'upload', selector: '#file', filePath: uploadFile, waitAfterMs: 0 });
    await execute(job, { action: 'click', selector: '#noop', completion: { locator: '#spinner', state: 'hidden' }, navigationTimeoutMs: 1000 });
    await assert.rejects(execute(job, { action: 'click', selector: '#noop', completion: { locator: '#missing' }, navigationTimeoutMs: 250 }), /Completion condition timed out/);
    await execute(job, { action: 'click', selector: '#delayed', completion: { locator: '#arrived' }, navigationTimeoutMs: 5000 });
    assert.equal(tabs.get(job.tabId).page.url(), base + '/delayed-result', 'completion survives delayed document replacement');
    await assert.rejects(execute(job, { action: 'openUrl', url: base + '/start', navigationTimeoutMs: 150 }), /did not finish loading/);
    running = false;
    await assert.rejects(execute(job, { action: 'click', selector: '#noop' }), /Stopped/);
    console.log('Navigation load, redirect, document replacement, SPA completion, timeout and stop: OK');

    let savedScenario, runRequest, cloneRequest, pickerCalls = 0, finishPicker;
    let legacyAgent = false;
    const fixtures = {
      'facebook-reels': { name: 'Dashboard test', steps: [{ action: 'click', selector: '#go' }] },
      typing: { name: 'Typing test', variables: { tenphimn: 'Giá trị nhập từ navbar' }, steps: [{ action: 'type', selector: '#rich', text: '', clear: true }] },
      schedule: { name: 'Schedule test', variables: { day: '2026-10-18', hour: '09:35' }, steps: [{ action: 'setDate', selector: '#date', value: '{{day}}' }, { action: 'setTime', selector: '#time', value: '{{hour}}' }] }
    };
    await browserContext.route('http://dashboard.test/**', async route => {
      const request = route.request();
      const endpoint = new URL(request.url()).pathname;
      let data = {};
      if (endpoint === '/') {
        return route.fulfill({ contentType: 'text/html', body: fs.readFileSync(path.join(__dirname, '../dashboard/index.html'), 'utf8') });
      }
      if (endpoint === '/api/profiles') data = { defaultProfile: 'Profile 1', capabilities: legacyAgent ? [] : ['variables-v1'], performance: { cpuPercent: 0.5, memoryMb: 42, eventLoopP95Ms: 20.1 }, profiles: ['Profile 1', 'Profile 2'].map(directory => ({ directory, profile: directory, name: directory, extensionConnected: true, running: false, elapsedMs: 1200, lastStepMs: 230 })) };
      if (endpoint === '/api/scenarios') data = { names: Object.keys(fixtures) };
      const clone = endpoint.match(/^\/api\/scenarios\/([^/]+)\/clone$/);
      if (clone) {
        cloneRequest = request.postDataJSON(); fixtures[cloneRequest.name] = structuredClone(fixtures[clone[1]]);
        data = { name: cloneRequest.name, scenario: fixtures[cloneRequest.name] };
      } else if (endpoint.startsWith('/api/scenarios/')) {
        const name = endpoint.split('/').at(-1);
        if (request.method() === 'PUT') { savedScenario = request.postDataJSON(); fixtures[name] = savedScenario; }
        else data = fixtures[name];
      }
      if (endpoint === '/api/run') runRequest = request.postDataJSON();
      if (endpoint === '/api/choose-file') { pickerCalls++; await new Promise(resolve => { finishPicker = resolve; }); data = { filePath: 'C:\\Uploads\\test.txt' }; }
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
    await dashboard.locator('#scenarioSelect').selectOption('typing');
    await dashboard.waitForFunction(() => document.getElementById('scenarioName').value === 'Typing test' && !document.getElementById('runBtn').disabled);
    await dashboard.getByLabel('Chèn biến: Nội dung nhập', { exact: true }).selectOption('tenphimn');
    await dashboard.getByLabel('Giá trị biến 1', { exact: true }).fill('Giá trị navbar đã sửa trước khi chạy');
    await Promise.all([
      dashboard.waitForResponse(response => new URL(response.url()).pathname === '/api/run'),
      dashboard.getByRole('button', { name: '▶ Chạy kịch bản', exact: true }).click()
    ]);
    assert.equal(savedScenario.steps[0].text, '{{tenphimn}}');
    assert.equal(store.prepare(savedScenario).steps[0].text, 'Giá trị navbar đã sửa trước khi chạy');
    running = true; job.tabId = 1;
    await execute(job, store.prepare(savedScenario).steps[0]);
    assert.equal(await typingPage.locator('#rich').innerText(), 'Giá trị navbar đã sửa trước khi chạy', 'select navbar variable -> save template -> resolve at run -> type its value');
    await dashboard.locator('#scenarioSelect').selectOption('schedule');
    await dashboard.getByLabel('Tên hiển thị', { exact: true }).waitFor();
    await dashboard.waitForFunction(() => document.getElementById('scenarioName').value === 'Schedule test' && !document.getElementById('runBtn').disabled);
    await dashboard.getByLabel('Giá trị biến 1', { exact: true }).fill('2026-11-20');
    await dashboard.getByLabel('Chèn biến: Ngày (YYYY-MM-DD hoặc biến)', { exact: true }).selectOption('day');
    await Promise.all([
      dashboard.waitForResponse(response => new URL(response.url()).pathname === '/api/run'),
      dashboard.getByRole('button', { name: '▶ Chạy kịch bản', exact: true }).click()
    ]);
    assert.equal(runRequest.name, 'schedule', 'dropdown selection must load and run that scenario without pressing Open');
    assert.equal(runRequest.profile, 'Profile 2');
    assert.equal(savedScenario.variables.day, '2026-11-20');
    assert.equal(savedScenario.steps[0].value, '{{day}}');
    await dashboard.getByRole('button', { name: 'Clone kịch bản', exact: true }).click();
    await dashboard.waitForFunction(() => document.getElementById('scenarioSelect').value === 'schedule-copy' && !document.getElementById('cloneBtn').disabled);
    assert.equal(cloneRequest.name, 'schedule-copy');
    assert.equal(fixtures['schedule-copy'].variables.day, '2026-11-20');
    await dashboard.getByRole('button', { name: 'Clone kịch bản', exact: true }).click();
    await dashboard.waitForFunction(() => document.getElementById('scenarioSelect').value === 'schedule-copy-copy' && !document.getElementById('cloneBtn').disabled);
    const pickerButton = dashboard.locator('#chooseRunFile');
    await pickerButton.click();
    await dashboard.waitForFunction(() => document.getElementById('chooseRunFile').disabled);
    assert.equal(pickerCalls, 1);
    finishPicker();
    await dashboard.waitForFunction(() => !document.getElementById('chooseRunFile').disabled);
    assert.equal(await dashboard.locator('#uploadPath').inputValue(), 'C:\\Uploads\\test.txt');
    legacyAgent = true;
    await dashboard.waitForFunction(() => document.getElementById('runBtn').disabled && document.getElementById('connectionText').textContent.includes('Agent cũ'));
    legacyAgent = false;
    await dashboard.waitForFunction(() => !document.getElementById('runBtn').disabled);
    const screenshotDir = path.join(__dirname, '../test-results'); fs.mkdirSync(screenshotDir, { recursive: true });
    await dashboard.screenshot({ path: path.join(screenshotDir, 'dashboard.png'), fullPage: true });
    console.log('Native/text dates, times, CDP upload, debugger reuse, dashboard variables, dropdown run, clone and picker busy state: OK');
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    if (path.dirname(path.resolve(temp)) !== path.resolve(os.tmpdir())) throw new Error('Unexpected browser test directory');
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
