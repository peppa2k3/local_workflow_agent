const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawnSync, spawn } = require('node:child_process');
const envModule = path.resolve(__dirname, '../src/agent/env.js');

(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-env-'));
  let agent;
  try {
    const file = path.join(temp, '.env'), env = { ...process.env };
    for (const key of Object.keys(env)) if (/^(MONGODB_|LOCAL_AGENT_|CHROME_)/i.test(key)) delete env[key];
    fs.writeFileSync(file, 'MONGODB_URI="mongodb+srv://fixture:encoded%23password@cluster.example/?retryWrites=true&w=majority"\nMONGODB_DATABASE=team_content\nMONGODB_DNS_SERVERS=192.0.2.53\nENV_FIXTURE="Tiếng Việt # quoted"\n');
    const parseScript = `const assert=require('node:assert/strict'),fs=require('node:fs');
      const {loadProjectEnv,mongoSettings}=require(process.argv[2]);
      assert.equal(loadProjectEnv(process.argv[1]),true);
      assert.equal(process.env.ENV_FIXTURE,'Tiếng Việt # quoted');
      let config=mongoSettings(); assert.equal(config.database,'team_content'); assert(config.uri.includes('encoded%23password')); assert.equal(config.dnsServers,'192.0.2.53');
      fs.writeFileSync(process.argv[1],'MONGODB_URI="mongodb://fixture.example:27017"\\nMONGODB_DATABASE=changed_database\\n');
      config=mongoSettings(); assert.equal(config.database,'changed_database'); assert.equal(config.uri,'mongodb://fixture.example:27017'); assert.equal(config.dnsServers,'');
      console.log('Environment file load and reread OK');`;
    let result = spawnSync(process.execPath, ['-e', parseScript, file, envModule], { env, cwd: os.tmpdir(), encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const priorityScript = `const assert=require('node:assert/strict');const {loadProjectEnv,mongoSettings}=require(process.argv[2]);loadProjectEnv(process.argv[1]);const config=mongoSettings();assert.equal(config.uri,'');assert.equal(config.database,'shell_database');console.log('Shell priority OK');`;
    result = spawnSync(process.execPath, ['-e', priorityScript, file, envModule], { env: { ...env, MONGODB_URI: '', MONGODB_DATABASE: 'shell_database' }, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const missingScript = `const assert=require('node:assert/strict');const {loadProjectEnv,mongoSettings}=require(process.argv[2]);assert.equal(loadProjectEnv(process.argv[1]),false);assert.equal(mongoSettings().uri,'');assert.equal(mongoSettings().database,'team_content');`;
    result = spawnSync(process.execPath, ['-e', missingScript, path.join(temp, 'missing.env'), envModule], { env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);

    const probe = http.createServer(); await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
    const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
    const token = 'env-fixture-token-with-at-least-32-characters';
    fs.writeFileSync(file, [
      'MONGODB_URI=', 'MONGODB_DATABASE=team_content', 'LOCAL_AGENT_PORT=' + port,
      'LOCAL_AGENT_API_TOKEN=' + token, 'LOCAL_AGENT_DATA_DIR=' + JSON.stringify(path.join(temp, 'activity')),
      'LOCAL_AGENT_SCENARIOS_DIR=' + JSON.stringify(temp), 'CHROME_USER_DATA_DIR=' + JSON.stringify(temp), 'CHROME_PROFILE=Fixture'
    ].join('\n'));
    // Native dotenv reads Windows paths literally; use forward slashes in this fixture.
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replaceAll('\\\\', '/'));
    agent = spawn(process.execPath, [path.resolve(__dirname, '../local-agent.js')], { cwd: os.tmpdir(), env: { ...env, LOCAL_AGENT_ENV_FILE: file }, stdio: ['pipe', 'pipe', 'pipe'] });
    let logs = ''; agent.stdout.on('data', data => { logs += data; }); agent.stderr.on('data', data => { logs += data; });
    const base = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let i = 0; i < 60; i++) {
      try { await fetch(base + '/content'); ready = true; break; } catch { await new Promise(resolve => setTimeout(resolve, 50)); }
    }
    assert(ready, logs);
    assert.equal((await fetch(base + '/api/content/status')).status, 401, 'token is loaded from env before API is initialized');
    const response = await fetch(base + '/api/content/status', { headers: { Authorization: 'Bearer ' + token } });
    const status = await response.json(); assert.equal(status.database, 'team_content'); assert.equal(status.enabled, false);
    const html = await (await fetch(base + '/content')).text();
    assert(!html.includes('__LOCAL_AGENT_DASHBOARD_TOKEN__')); assert(!html.includes(token));
    console.log('Project .env parsing, shell precedence, live Mongo settings reload and server bootstrap from another cwd: OK');
  } finally {
    if (agent && agent.exitCode === null) {
      const closed = new Promise(resolve => agent.once('close', resolve)); agent.stdin.end('exit\n');
      const timer = setTimeout(() => agent.kill(), 3000); await closed; clearTimeout(timer);
    }
    if (path.dirname(path.resolve(temp)) !== path.resolve(os.tmpdir())) throw new Error('Unexpected fixture directory');
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch(failure => { console.error(failure); process.exitCode = 1; });
