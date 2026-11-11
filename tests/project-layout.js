const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const root = path.resolve(__dirname, '..');

async function checkAgent(tree, entry, standalone = false) {
  const probe = http.createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/^(MONGODB_|LOCAL_AGENT_|CHROME_)/i.test(key)) delete env[key];
  // Exercise default root-relative .env, scenarios and data paths from another cwd.
  const profileDir = path.join(tree, 'fixture-profile');
  fs.mkdirSync(profileDir, { recursive: true });
  fs.writeFileSync(path.join(profileDir, 'Local State'), JSON.stringify({ profile: { info_cache: { Default: { name: 'Fixture' } } } }));
  fs.writeFileSync(path.join(tree, '.env'), [
    'MONGODB_URI=', `LOCAL_AGENT_PORT=${port}`, 'CHROME_PROFILE=Default',
    `CHROME_USER_DATA_DIR=${profileDir.replaceAll('\\', '/')}`
  ].join('\n'));
  const child = spawn(process.execPath, [path.join(tree, entry)], { cwd: os.tmpdir(), env, stdio: ['pipe', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', b => { log += b; }); child.stderr.on('data', b => { log += b; });
  const base = `http://127.0.0.1:${port}`;
  try {
    let ready = false;
    for (let i = 0; i < 80; i++) {
      try { if ((await fetch(base + '/api/profiles')).ok) { ready = true; break; } } catch {}
      if (child.exitCode !== null) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert(ready, log);
    for (const route of ['/', '/content', '/remote', '/remote.js', '/issues.js', '/remote.css']) {
      const response = await fetch(base + route);
      assert.equal(response.status, 200, route);
      assert((await response.text()).length > 0, route);
    }
    assert((await (await fetch(base + '/api/scenarios')).json()).names.includes('fixture'));
    const response = await fetch(base + '/api/run', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ profile: 'Default', name: 'fixture' })
    });
    assert.equal(response.status, 200, await response.text());
    assert(fs.existsSync(path.join(tree, standalone ? 'data/machine_id.txt' : 'data/agent/machine_id.txt')), 'storage uses app defaults or existing legacy installation');
  } finally {
    if (child.exitCode === null) {
      const closed = once(child, 'close');
      child.stdin.end('exit\n');
      const timer = setTimeout(() => child.kill(), 5000);
      await closed; clearTimeout(timer);
    }
  }
}

async function checkControl(standalone = false) {
  const tree = fs.mkdtempSync(path.join(os.tmpdir(), 'control-layout-'));
  let child;
  try {
    // Mirrors the Docker COPY set; deliberately no local runtime or node_modules.
    fs.cpSync(path.join(root, 'control-server'), path.join(tree, 'control-server'), { recursive: true });
    if (!standalone) fs.copyFileSync(path.join(root, 'remote-control.js'), path.join(tree, 'remote-control.js'));
    const probe = http.createServer();
    await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
    const port = probe.address().port;
    await new Promise(resolve => probe.close(resolve));
    fs.writeFileSync(path.join(tree, standalone ? 'control-server/.env' : '.env.control'), `CONTROL_PUBLIC_URL=http://127.0.0.1:${port}\nCONTROL_PORT=${port}\nCONTROL_BIND=127.0.0.1\nCONTROL_ALLOW_HTTP_LOOPBACK=1\n`);
    const env = { ...process.env };
    for (const key of Object.keys(env)) if (/^CONTROL_/i.test(key)) delete env[key];
    child = spawn(process.execPath, [path.join(tree, standalone ? 'control-server/index.js' : 'remote-control.js')], { cwd: os.tmpdir(), env, stdio: ['ignore', 'pipe', 'pipe'] });
    let logs = '';
    child.stdout.on('data', b => { logs += b; }); child.stderr.on('data', b => { logs += b; });
    const base = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let i = 0; i < 80; i++) {
      try { if ((await fetch(base + '/health')).ok) { ready = true; break; } } catch {}
      if (child.exitCode !== null) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert(ready, logs);
    for (const [route, file] of [['/', 'index.html'], ['/app.js', 'app.js'], ['/style.css', 'style.css']]) {
      const response = await fetch(base + route);
      assert.equal(response.status, 200);
      assert.equal(await response.text(), fs.readFileSync(path.join(tree, 'control-server/web', file), 'utf8'));
    }
    assert(fs.existsSync(path.join(tree, 'control-server/data/control.sqlite')));
  } finally {
    if (child && child.exitCode === null) { const closed = once(child, 'close'); child.kill(); await closed; }
    fs.rmSync(tree, { recursive: true, force: true });
  }
}

(async () => {
  const tree = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-layout-'));
  const standalone = fs.mkdtempSync(path.join(os.tmpdir(), 'standalone-agent-'));
  try {
    // No control-server, browser extension or root development source is needed to run.
    fs.cpSync(path.join(root, 'local-workflow-agent'), path.join(tree, 'local-workflow-agent'), {
      recursive: true, filter: source => !source.split(path.sep).includes('node_modules')
    });
    fs.copyFileSync(path.join(root, 'local-agent.js'), path.join(tree, 'local-agent.js'));
    fs.symlinkSync(path.join(root, 'node_modules'), path.join(tree, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    fs.mkdirSync(path.join(tree, 'scenarios'));
    fs.mkdirSync(path.join(tree, 'data/agent'), { recursive: true });
    fs.writeFileSync(path.join(tree, 'scenarios/fixture.json'), JSON.stringify({ steps: [{ action: 'wait', ms: 10 }] }));
    await checkAgent(tree, 'local-agent.js');
    await checkAgent(tree, 'local-workflow-agent/index.js');
    await checkControl();
    await checkControl(true);
    fs.cpSync(path.join(root, 'local-workflow-agent'), standalone, {
      recursive: true, filter: source => !source.split(path.sep).some(part => ['node_modules', 'data', 'tools'].includes(part)) && path.basename(source) !== '.env'
    });
    fs.symlinkSync(path.join(root, 'node_modules'), path.join(standalone, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    fs.writeFileSync(path.join(standalone, 'scenarios/fixture.json'), JSON.stringify({ steps: [{ action: 'wait', ms: 10 }] }));
    await checkAgent(standalone, 'index.js', true);
    assert.deepEqual(fs.readFileSync(path.join(root, 'local-workflow-agent/shared/remote-protocol.js')), fs.readFileSync(path.join(root, 'control-server/shared/remote-protocol.js')), 'both standalone apps must ship the same remote protocol');
    const localLock = JSON.parse(fs.readFileSync(path.join(root, 'local-workflow-agent/package-lock.json')));
    const rootLock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json')));
    for (const [name, pkg] of Object.entries(localLock.packages)) if (name) {
      assert.equal(pkg.version, rootLock.packages[name]?.version, `runtime lockfile mismatch: ${name}`);
      assert(!name.includes('playwright'), 'local runtime must not install browser test tools');
    }

    if (process.platform === 'win32') {
      fs.cpSync(path.join(root, 'chrome-reels-extension'), path.join(tree, 'chrome-reels-extension'), { recursive: true });
      fs.writeFileSync(path.join(tree, 'chrome-reels-extension/secret.pem'), 'must never ship');
      fs.mkdirSync(path.join(tree, 'scripts'));
      fs.copyFileSync(path.join(root, 'scripts/package-extension.ps1'), path.join(tree, 'scripts/package-extension.ps1'));
      const result = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(tree, 'scripts/package-extension.ps1')], { encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      const version = JSON.parse(fs.readFileSync(path.join(tree, 'chrome-reels-extension/manifest.json'))).version;
      const archive = path.join(tree, `dist/chrome-reels-extension-${version}.zip`);
      const inspection = spawnSync('powershell', ['-NoProfile', '-Command', `
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        $zip = [IO.Compression.ZipFile]::OpenRead($env:PACKAGE_ARCHIVE)
        try { @($zip.Entries | ForEach-Object {
          $stream = $_.Open(); $memory = New-Object IO.MemoryStream
          try { $stream.CopyTo($memory); @{name=$_.FullName; bytes=[Convert]::ToBase64String($memory.ToArray())} }
          finally { $stream.Dispose(); $memory.Dispose() }
        }) | ConvertTo-Json -Compress } finally { $zip.Dispose() }
      `], { encoding: 'utf8', env: { ...process.env, PACKAGE_ARCHIVE: archive } });
      assert.equal(inspection.status, 0, inspection.stderr);
      const entries = JSON.parse(inspection.stdout);
      assert.deepEqual(entries.map(e => e.name).sort(), ['background.js', 'content.js', 'manifest.json', 'options.html', 'options.js']);
      for (const entry of entries) assert.deepEqual(Buffer.from(entry.bytes, 'base64'), fs.readFileSync(path.join(tree, 'chrome-reels-extension', entry.name)));
      assert.equal(spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(tree, 'scripts/package-extension.ps1')]).status, 1, 'existing release must not be overwritten');
    }
    console.log('Project layout: standalone local/server apps, legacy entries/data, protocol parity, dashboard assets, runtime locks and isolated extension ZIP passed');
  } finally {
    // Remove the test junction first; cleanup must never traverse the repository dependencies.
    const link = path.join(tree, 'node_modules');
    if (fs.existsSync(link)) fs.unlinkSync(link);
    const standaloneLink = path.join(standalone, 'node_modules');
    if (fs.existsSync(standaloneLink)) fs.unlinkSync(standaloneLink);
    fs.rmSync(tree, { recursive: true, force: true });
    fs.rmSync(standalone, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
