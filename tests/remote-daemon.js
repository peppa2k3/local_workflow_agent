const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-daemon-')); let child;
  try {
    const probe = http.createServer(); await new Promise(r => probe.listen(0, '127.0.0.1', r)); const port = probe.address().port; await new Promise(r => probe.close(r));
    fs.writeFileSync(path.join(dir, 'Local State'), JSON.stringify({ profile: { info_cache: { Default: { name: 'Fixture' } } } }));
    fs.writeFileSync(path.join(dir, 'fixture.json'), JSON.stringify({ steps: [{ action: 'wait', ms: 10 }] }));
    child = spawn(process.execPath, ['local-agent.js', '--daemon'], { cwd: path.join(__dirname, '..'), stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, LOCAL_AGENT_ENV_FILE: path.join(dir, 'missing.env'), MONGODB_URI: '', LOCAL_AGENT_DATA_DIR: path.join(dir, 'data'),
        CHROME_PROFILE: 'Default', CHROME_USER_DATA_DIR: dir, LOCAL_AGENT_PORT: String(port), LOCAL_AGENT_SCENARIOS_DIR: dir } });
    let log = ''; child.stdout.on('data', b => { log += b; }); child.stderr.on('data', b => { log += b; });
    child.stdin.end(); // EOF must not terminate daemon mode.
    let ready = false; for (let i = 0; i < 80; i++) {
      try { const r = await fetch(`http://127.0.0.1:${port}/api/profiles`); if (r.ok) { ready = true; break; } } catch {}
      await new Promise(r => setTimeout(r, 50));
    }
    assert(ready, log); assert.equal(child.exitCode, null);
    const r = await fetch(`http://127.0.0.1:${port}/api/remote/status`); assert.equal(r.status, 403);
    assert.match(log, /Local agent ready/);
    console.log('remote daemon: isolated process survives stdin EOF, keeps loopback API and local approval guard');
  } finally {
    if (child && child.exitCode === null) { const closed = new Promise(r => child.once('exit', r)); child.kill(); await closed; }
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
