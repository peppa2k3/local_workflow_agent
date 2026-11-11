const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');

(async () => {
  if (process.platform !== 'win32') return;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'layout-migration-'));
  const app = path.join(root, 'local-workflow-agent');
  let server;
  try {
    fs.mkdirSync(path.join(app, 'scripts'), { recursive: true });
    fs.copyFileSync(path.resolve(__dirname, '../local-workflow-agent/scripts/migrate-legacy.ps1'), path.join(app, 'scripts/migrate-legacy.ps1'));
    fs.writeFileSync(path.join(root, 'local-agent.js'), '// fixture');
    fs.writeFileSync(path.join(root, '.env'), 'FIXTURE_SECRET=must-survive\n');
    fs.mkdirSync(path.join(root, 'scenarios'));
    fs.writeFileSync(path.join(root, 'scenarios/user.json'), '{"steps":[{"action":"wait","ms":10}]}');
    fs.mkdirSync(path.join(root, 'data/agent'), { recursive: true });
    fs.writeFileSync(path.join(root, 'data/agent/machine_id.txt'), 'original-machine');
    fs.mkdirSync(path.join(root, 'tools'));
    fs.writeFileSync(path.join(root, 'tools/fixture.bin'), 'original-tools');
    const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(app, 'scripts/migrate-legacy.ps1')];
    server = http.createServer();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const env = { ...process.env, LOCAL_AGENT_PORT: String(server.address().port) };
    const busy = spawn('powershell', args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let logs = ''; busy.stderr.on('data', data => { logs += data; });
    const [code] = await once(busy, 'close');
    assert.notEqual(code, 0); assert.match(logs, /Stop the local agent/);
    await new Promise(resolve => server.close(resolve)); server = null;
    fs.writeFileSync(path.join(app, '.env'), 'existing config');
    let result = spawnSync('powershell', args, { env, encoding: 'utf8' });
    assert.notEqual(result.status, 0); assert.match(result.stderr, /destination exists/);
    assert(fs.existsSync(path.join(root, 'data/agent/machine_id.txt')), 'collision fails before moving any path');
    assert(fs.existsSync(path.join(root, '.env')));
    fs.unlinkSync(path.join(app, '.env'));
    result = spawnSync('powershell', args, { env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(path.join(app, '.env'), 'utf8'), 'FIXTURE_SECRET=must-survive\n');
    assert.equal(fs.readFileSync(path.join(app, 'data/machine_id.txt'), 'utf8'), 'original-machine');
    assert.equal(fs.readFileSync(path.join(app, 'tools/fixture.bin'), 'utf8'), 'original-tools');
    assert(fs.existsSync(path.join(app, 'scenarios/user.json')));
    assert(!fs.existsSync(path.join(root, 'scenarios')));
    console.log('Layout migration: busy agent guard, collision preflight, exact config/identity/tools/scenarios preservation passed');
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
