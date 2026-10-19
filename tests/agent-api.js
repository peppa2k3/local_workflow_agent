const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');

(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'local-agent-test-'));
  let child;
  try {
    const probe = http.createServer();
    await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
    const port = probe.address().port;
    await new Promise(resolve => probe.close(resolve));
    fs.writeFileSync(path.join(temp, 'Local State'), JSON.stringify({ profile: { info_cache: {
      'Profile 1': { name: 'First test profile' }, 'Profile 2': { name: 'Second test profile' }, '../invalid': { name: 'Ignore' }
    } } }));
    child = spawn(process.execPath, ['local-agent.js'], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, LOCAL_AGENT_PORT: String(port), CHROME_PROFILE: 'Profile 1', CHROME_USER_DATA_DIR: temp, LOCAL_AGENT_SCENARIOS_DIR: temp },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    let log = '';
    child.stdout.on('data', chunk => { log += chunk; });
    child.stderr.on('data', chunk => { log += chunk; });
    const base = `http://127.0.0.1:${port}`;
    async function api(route, body, method = body ? 'POST' : 'GET', expected = 200) {
      const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      const data = await response.json();
      assert.equal(response.status, expected, JSON.stringify(data));
      return data;
    }
    let ready = false;
    for (let i = 0; i < 50; i++) {
      try { await fetch(base + '/api/profiles'); ready = true; break; } catch { await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    assert(ready, log);
    const profiles = await api('/api/profiles');
    assert.deepEqual(profiles.profiles.map(item => item.directory), ['Profile 1', 'Profile 2']);
    assert.equal(profiles.profiles[0].name, 'First test profile');
    assert.equal(typeof profiles.performance.memoryMb, 'number');
    assert(profiles.capabilities.includes('variables-v1'));
    const clients = [{ profile: 'Profile 1', clientId: 'first' }, { profile: 'Profile 2', clientId: 'second' }];
    await api('/state', { clientId: 'legacy' }, 'POST', 400);
    for (const client of clients) await api('/state', client);
    await api('/state', { profile: 'Profile 1', clientId: 'duplicate' }, 'POST', 400);
    await api('/api/scenarios/test', { name: 'test', steps: [
      { action: 'openUrl', url: 'https://example.test/' }, { action: 'click', selector: '#next' }
    ] }, 'PUT');
    await api('/api/scenarios/test/clone', { name: 'test-copy' });
    assert.deepEqual((await api('/api/scenarios/test-copy')).steps, (await api('/api/scenarios/test')).steps);
    await api('/api/scenarios/test/clone', { name: 'test-copy' }, 'POST', 400);
    await api('/api/scenarios/test/clone', { name: '../escape' }, 'POST', 400);
    for (const client of clients) await api('/api/run', { name: 'test', profile: client.profile });
    await api('/api/scenarios/test', undefined, 'DELETE', 400);
    await api('/api/scenarios/test-copy', undefined, 'DELETE');
    assert(!(await api('/api/scenarios')).names.includes('test-copy'));
    await api('/api/scenarios/test-copy', undefined, 'DELETE', 400);
    await api('/api/scenarios/%2e%2e%2fescape', undefined, 'DELETE', 400);
    const first = await api('/next', clients[0]);
    const second = await api('/next', clients[1]);
    assert.equal(first.step.action, 'openUrl'); assert.equal(second.step.action, 'openUrl');
    assert.equal((await api('/next', clients[0])).step, null);
    await api('/result', { ...clients[0], runId: first.runId, id: first.step.id, ok: true, tabId: 11 });
    const next = await api('/next', clients[0]);
    assert.equal(next.step.action, 'click'); assert.equal(next.tabId, 11);
    await api('/api/stop', { profile: 'Profile 1' });
    assert.equal((await api('/api/status?profile=Profile%201')).running, false);
    assert.equal((await api('/api/status?profile=Profile%202')).running, true);
    await api('/api/profiles/open', { profile: '../invalid' }, 'POST', 400);
    await api('/api/scenarios/typing', { variables: { tenphimn: 'Tên phim tiếng Việt lần một' }, steps: [{ action: 'type', selector: '#editor', text: '{{tenphimn}}' }] }, 'PUT');
    await api('/api/run', { name: 'typing', profile: 'Profile 1' });
    const typing = await api('/next', clients[0]);
    assert.equal(typing.step.text, 'Tên phim tiếng Việt lần một', 'HTTP dispatch must expand the variable rather than send its token');
    assert.equal((await api('/api/scenarios/typing')).steps[0].text, '{{tenphimn}}', 'running does not hard-code the saved template');
    await api('/api/stop', { profile: 'Profile 1' });
    const updated = await api('/api/scenarios/typing'); updated.variables.tenphimn = 'Tên phim mới cho lần hai';
    await api('/api/scenarios/typing', updated, 'PUT');
    await api('/api/run', { name: 'typing', profile: 'Profile 1' });
    assert.equal((await api('/next', clients[0])).step.text, 'Tên phim mới cho lần hai', 'next run reads the latest variable value');
    await api('/api/stop', { profile: 'Profile 1' });
    delete updated.variables.tenphimn;
    await api('/api/scenarios/typing', updated, 'PUT');
    await api('/api/run', { name: 'typing', profile: 'Profile 1' }, 'POST', 400);
    await api('/api/scenarios/typing', undefined, 'DELETE');
    assert(!(await api('/api/scenarios')).names.includes('typing'));
    console.log('Agent HTTP profile discovery, registration, dispatch and scoped stop: OK');
  } finally {
    if (child && child.exitCode === null) {
      const closed = new Promise(resolve => child.once('close', resolve));
      child.stdin.end('exit\n');
      const timer = setTimeout(() => child.kill(), 3000);
      await closed; clearTimeout(timer);
    }
    if (path.dirname(path.resolve(temp)) !== path.resolve(os.tmpdir())) throw new Error('Unexpected test fixture directory');
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
