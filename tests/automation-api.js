const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { resolveVariables } = require('../src/agent/variables');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');

(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'automation-api-'));
  let agent;
  let browser;
  try {
    const probe = http.createServer();
    await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
    const port = probe.address().port;
    await new Promise(resolve => probe.close(resolve));
    const base = `http://127.0.0.1:${port}`;
    const token = randomBytes(32).toString('hex');
    const env = { ...process.env, LOCAL_AGENT_PORT: String(port), CHROME_PROFILE: 'Profile 1', CHROME_USER_DATA_DIR: temp, LOCAL_AGENT_SCENARIOS_DIR: temp, LOCAL_AGENT_API_TOKEN: token };
    fs.writeFileSync(path.join(temp, 'Local State'), JSON.stringify({ profile: { info_cache: { 'Profile 1': { name: 'Fixture' }, 'Profile 2': { name: 'Other' } } } }));
    const browserScenario = { variables: { caption: 'Saved', delay: 10 }, steps: [{ action: 'wait', ms: '{{delay}}' }, { action: 'type', selector: '#caption', text: '{{caption}}' }] };
    fs.writeFileSync(path.join(temp, 'browser.json'), JSON.stringify(browserScenario));
    fs.writeFileSync(path.join(temp, 'local.json'), JSON.stringify({ variables: { delay: 10 }, steps: [{ action: 'wait', ms: '{{delay}}' }] }));
    async function start(secret) {
      agent = spawn(process.execPath, ['local-agent.js'], { cwd: root, env: { ...env, LOCAL_AGENT_API_TOKEN: secret }, stdio: ['pipe', 'pipe', 'pipe'] });
      let logs = ''; agent.stdout.on('data', d => { logs += d; }); agent.stderr.on('data', d => { logs += d; });
      for (let n = 0; n < 60; n++) {
        try { await fetch(base); return; } catch { await new Promise(resolve => setTimeout(resolve, 50)); }
      }
      throw new Error('Agent not ready: ' + logs);
    }
    async function close() {
      if (agent && agent.exitCode === null) {
        const done = new Promise(resolve => agent.once('close', resolve));
        agent.stdin.end('exit\n'); const timer = setTimeout(() => agent.kill(), 3000);
        await done; clearTimeout(timer);
      }
    }
    async function api(route, { body, method = body ? 'POST' : 'GET', headers = {}, code = 200, raw } = {}) {
      const response = await fetch(base + route, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...headers }, body: raw ?? (body ? JSON.stringify(body) : undefined) });
      const data = await response.json(); assert.equal(response.status, code, JSON.stringify(data)); return data;
    }
    const cli = args => new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['local-agent.js', ...args, ...(args.includes('--base-url') ? [] : ['--base-url', base])], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '', stderr = ''; child.stdout.on('data', d => { stdout += d; }); child.stderr.on('data', d => { stderr += d; });
      child.on('error', reject); child.on('close', code => resolve({ code, stdout, stderr }));
    });
    await start('');
    await api('/api/v1/profiles', { code: 503 });
    await close(); await start(token);
    await api('/api/v1/profiles', { headers: { Authorization: '' }, code: 401 });
    await api('/api/v1/profiles', { headers: { Authorization: 'Bearer wrong' }, code: 401 });
    await api('/api/v1/profiles', { headers: { Origin: base }, code: 403 });
    await api('/api/v1/profiles', { headers: { Origin: 'https://evil.test' }, code: 403 });
    await new Promise((resolve, reject) => {
      const req = http.get(base + '/api/v1/profiles', { headers: { Host: `evil.test:${port}` } }, response => {
        response.resume();
        try { assert.equal(response.statusCode, 403); resolve(); } catch (error) { reject(error); }
      });
      req.on('error', reject);
    });
    await api('/state', { body: {}, headers: { Origin: 'https://evil.test' }, code: 403 });
    await api('/api/run', { body: { name: 'local' }, headers: { Authorization: '' }, code: 401 });
    await api('/api/profiles', { headers: { Origin: base, Authorization: '' }, code: 401 });
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage();
    await page.goto(base);
    await page.waitForFunction(() => document.getElementById('automationStatus').textContent.includes('CLI/API đã bật'));
    assert.equal((await page.evaluate(() => api('/api/profiles'))).automationEnabled, true, 'dashboard GET works without browser Origin header');
    const dashboardRun = await page.evaluate(() => api('/api/run', 'POST', { name: 'local', profile: 'Profile 1' }));
    assert(dashboardRun.runId, 'dashboard POST remains authenticated');
    await browser.close(); browser = null;
    assert.equal((await api('/api/profiles', { headers: { Origin: 'chrome-extension://abc', Authorization: '' } })).profiles.length, 2, 'extension discovery still works');
    const client = { profile: 'Profile 1', clientId: 'fixture' };
    const payload = { scenario: 'browser', profile: 'Profile 1', variables: { caption: 'Tiếng Việt = value', delay: 0 } };
    await api('/api/v1/runs', { body: payload, code: 400 }); // browser steps require extension
    await api('/state', { body: client });
    const run = await api('/api/v1/runs', { body: payload, headers: { 'Idempotency-Key': 'one' }, code: 202 });
    assert.equal((await api('/api/v1/runs', { body: payload, headers: { 'Idempotency-Key': 'one' } })).runId, run.runId);
    assert.equal((await api('/api/v1/runs', { body: { variables: { delay: 0, caption: payload.variables.caption }, profile: payload.profile, scenario: payload.scenario }, headers: { 'Idempotency-Key': 'one' } })).runId, run.runId, 'JSON key order must not change retry identity');
    await api('/api/v1/runs', { body: { ...payload, variables: {} }, headers: { 'Idempotency-Key': 'one' }, code: 409 });
    await api('/api/v1/runs', { body: payload, code: 409 });
    const step = await api('/next', { body: client });
    assert.equal(step.step.text, 'Tiếng Việt = value');
    assert.equal(step.runId, run.runId);
    await api('/result', { body: { ...client, runId: step.runId, id: step.step.id, ok: true } });
    const ended = await api('/api/v1/runs/' + run.runId);
    assert.equal(ended.state, 'succeeded'); assert.equal(ended.waiting, false); assert(ended.endedAt);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(temp, 'browser.json'))), browserScenario, 'overrides never modify JSON');
    for (const variables of [null, [], { delay: {} }, { delay: '{{missing}}' }, { delay: '{{delay}}' }, { download_title: 'fake' }, JSON.parse('{"__proto__":"bad"}'), { constructor: 'bad' }]) {
      await api('/api/v1/runs', { body: { ...payload, variables }, code: 400 });
    }
    for (const patch of [{ profile: '../escape' }, { scenario: '../escape' }, { scenario: 'missing' }, { scenario: 'browser.json' }, { timeoutMs: -1 }, { timeoutMs: '10' }, { uploadPath: 5 }, { shell: 'whoami' }]) {
      await api('/api/v1/runs', { body: { ...payload, ...patch }, code: patch.scenario === 'missing' ? 404 : 400 });
    }
    await api('/api/v1/runs', { method: 'POST', raw: '{bad', code: 400 });
    await api('/api/v1/runs', { method: 'POST', raw: 'null', code: 400 });
    await api('/api/v1/runs', { body: payload, headers: { 'Content-Type': 'text/plain' }, code: 415 });
    await api('/api/v1/runs', { body: { ...payload, variables: { caption: 'é'.repeat(60000) } }, code: 413 });
    const failed = await api('/api/v1/runs', { body: payload, code: 202 });
    await new Promise(resolve => setTimeout(resolve, 10));
    const failedStep = await api('/next', { body: client });
    await api('/result', { body: { ...client, runId: failed.runId, id: failedStep.step.id, ok: false, error: 'fixture failure' } });
    assert.equal((await api('/api/v1/runs/' + failed.runId)).state, 'failed');
    const longBody = { scenario: 'local', profile: 'Profile 1', variables: { delay: 5000 } };
    const old = await api('/api/v1/runs', { body: longBody, code: 202 });
    assert.equal((await api('/api/v1/runs/' + old.runId + '/stop', { method: 'POST' })).state, 'cancelled');
    const newer = await api('/api/v1/runs', { body: longBody, code: 202 });
    await api('/api/v1/runs/' + old.runId + '/stop', { method: 'POST' });
    assert.equal((await api('/api/v1/runs/' + newer.runId)).state, 'running', 'stopping old ID cannot stop a newer run');
    const other = await api('/api/v1/runs', { body: { ...longBody, profile: 'Profile 2' }, code: 202 });
    await api('/api/v1/runs/' + newer.runId + '/stop', { method: 'POST' });
    assert.equal((await api('/api/v1/runs/' + other.runId)).state, 'running');
    await api('/api/v1/runs/' + other.runId + '/stop', { method: 'POST' });
    assert.equal((await api('/api/v1/runs/' + run.runId)).state, 'succeeded', 'completed run survives later runs');
    const timeout = await api('/api/v1/runs', { body: { ...longBody, timeoutMs: 1 }, code: 202 });
    await new Promise(resolve => setTimeout(resolve, 1100));
    assert.equal((await api('/api/v1/runs/' + timeout.runId)).state, 'failed');
    assert.equal((await cli(['profiles'])).code, 0);
    assert.equal((await cli(['scenarios'])).code, 0);
    assert.equal(JSON.parse((await cli(['describe', '--scenario', 'browser'])).stdout).variables.caption, 'Saved');
    const valuesFile = path.join(temp, 'values.json'); fs.writeFileSync(valuesFile, '{"delay":40}');
    const success = await cli(['run', '--scenario', 'local', '--profile', 'Profile 1', '--variables-file', valuesFile, '--var', 'delay=1', '--wait']);
    assert.equal(success.code, 0, success.stderr); assert.equal(JSON.parse(success.stdout).state, 'succeeded');
    const waiting = await cli(['run', '--scenario', 'local', '--profile', 'Profile 1', '--var', 'delay=5000', '--wait', '--timeout-ms', '1', '--stop-on-timeout']);
    assert.equal(waiting.code, 124, waiting.stderr); assert.equal(JSON.parse(waiting.stdout).state, 'cancelled');
    const waitingAgain = await cli(['run', '--scenario', 'local', '--profile', 'Profile 1', '--var', 'delay=5000', '--wait', '--timeout-ms', '1']);
    assert.equal(waitingAgain.code, 124); const running = JSON.parse(waitingAgain.stdout); assert.equal(running.state, 'running');
    assert.equal(JSON.parse((await cli(['status', '--run-id', running.runId])).stdout).runId, running.runId);
    assert.equal(JSON.parse((await cli(['stop', '--run-id', running.runId])).stdout).state, 'cancelled');
    const failure = await cli(['run', '--scenario', 'local', '--profile', 'Profile 1', '--var', 'delay=5000', '--run-timeout-ms', '1', '--wait']);
    assert.equal(failure.code, 1, failure.stderr); assert.equal(JSON.parse(failure.stdout).state, 'failed');
    const cancelledPromise = cli(['run', '--scenario', 'local', '--profile', 'Profile 1', '--var', 'delay=5000', '--wait', '--request-id', 'cancel-cli']);
    let cancelling;
    for (let n = 0; n < 50; n++) {
      cancelling = (await api('/api/v1/profiles')).profiles.find(p => p.directory === 'Profile 1');
      if (cancelling.running) break;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert(cancelling.running);
    await api('/api/v1/runs/' + cancelling.executionId + '/stop', { method: 'POST' });
    assert.equal((await cancelledPromise).code, 2);
    assert.equal((await cli(['run', '--scenario', 'local', '--profile', 'Profile 1', '--var', 'oops'])).code, 1);
    assert.equal((await cli(['profiles', '--base-url', 'http://example.test'])).code, 1);
    // Expansion must reject exponential growth before it exhausts agent memory.
    const vars = { a: 'x'.repeat(10000) };
    for (let n = 0; n < 10; n++) vars['v' + n] = ('{{' + (n ? 'v' + (n - 1) : 'a') + '}}').repeat(2);
    assert.throws(() => resolveVariables({ variables: vars, steps: [] }), /1 MB/);
    await close();
    console.log('Authenticated automation API, per-run variables, idempotency, history, cancellation, timeout and CLI: OK');
  } finally {
    if (browser) await browser.close();
    if (agent && agent.exitCode === null) { agent.kill(); await new Promise(resolve => agent.once('close', resolve)); }
    if (path.dirname(path.resolve(temp)) !== path.resolve(os.tmpdir())) throw new Error('Unexpected test fixture path');
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
