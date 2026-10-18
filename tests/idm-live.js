// Opt-in real IDM test. Uses only a fresh Chrome-for-Testing profile and a
// separate agent/port. Never point this script at an existing Chrome profile.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');
const { spawn, execFileSync } = require('node:child_process');
const { chromium } = require('playwright');

function fields(buffer) {
  let offset = 0;
  const read = () => {
    let value = 0, shift = 0, byte;
    do { byte = buffer[offset++]; if (byte === undefined || shift > 49) throw new Error('Invalid CRX header'); value += (byte & 127) * 2 ** shift; shift += 7; } while (byte & 128);
    return value;
  };
  const result = [];
  while (offset < buffer.length) {
    const tag = read(), wire = tag & 7;
    if (wire === 2) { const length = read(); result.push({ tag: tag >> 3, data: buffer.subarray(offset, offset + length) }); offset += length; }
    else if (wire === 0) read(); else if (wire === 1) offset += 8; else if (wire === 5) offset += 4;
    else throw new Error('Unsupported CRX header wire type');
  }
  return result;
}

function prepareIdm(crxPath, root) {
  const crx = fs.readFileSync(crxPath);
  if (crx.toString('ascii', 0, 4) !== 'Cr24' || crx.readUInt32LE(4) !== 3) throw new Error('Expected the installed CRX3 IDM package');
  const length = crx.readUInt32LE(8), header = fields(crx.subarray(12, 12 + length));
  const signed = header.find(field => field.tag === 10000);
  const expected = signed && fields(signed.data).find(field => field.tag === 1)?.data;
  const key = header.filter(field => [2, 3].includes(field.tag)).map(field => fields(field.data).find(item => item.tag === 1)?.data).find(item => item && expected?.equals(crypto.createHash('sha256').update(item).digest().subarray(0, 16)));
  if (!key) throw new Error('Cannot preserve the installed IDM extension identity');
  const id = [...crypto.createHash('sha256').update(key).digest().subarray(0, 16)].map(byte => String.fromCharCode(97 + (byte >> 4), 97 + (byte & 15))).join('');
  const host = JSON.parse(fs.readFileSync(path.join(path.dirname(crxPath), 'IDMMsgHost.json'), 'utf8'));
  if (!host.allowed_origins.includes(`chrome-extension://${id}/`)) throw new Error('IDM package does not match the installed native host');
  const zip = path.join(root, 'idm.zip'), destination = path.join(root, 'idm-extension');
  fs.writeFileSync(zip, crx.subarray(12 + length));
  const extractScript = path.join(root, 'extract.ps1');
  fs.writeFileSync(extractScript, `param([string]$ArchivePath,[string]$DestinationPath)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead($ArchivePath)
try {
  $targetRoot = [IO.Path]::GetFullPath($DestinationPath).TrimEnd('\\') + '\\'
  foreach ($entry in $archive.Entries) {
    $targetEntry = [IO.Path]::GetFullPath([IO.Path]::Combine($DestinationPath,$entry.FullName))
    if (-not $targetEntry.StartsWith($targetRoot,[StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe archive entry' }
  }
} finally { $archive.Dispose() }
[IO.Compression.ZipFile]::ExtractToDirectory($ArchivePath,$DestinationPath)
`);
  execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', extractScript, '-ArchivePath', zip, '-DestinationPath', destination], { windowsHide: true });
  const manifestPath = path.join(destination, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); manifest.key = key.toString('base64');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return { destination, id, version: manifest.version };
}

(async () => {
  if (process.platform !== 'win32') throw new Error('Real IDM test requires Windows');
  const args = process.argv.slice(2), value = name => args[args.indexOf(name) + 1];
  const url = args.includes('--url') ? value('--url') : '';
  const chromePath = process.env.IDM_TEST_CHROME;
  if (!chromePath || !fs.existsSync(chromePath)) throw new Error('Set IDM_TEST_CHROME to chrome.exe (a fresh test profile is always created)');
  if (!/^https?:/.test(url)) throw new Error('Pass --url with the video page URL');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-idm-profile-'));
  const output = path.resolve('test-results/idm-live', new Date().toISOString().replace(/[:.]/g, '-')); fs.mkdirSync(output, { recursive: true });
  const downloads = path.join(output, 'downloads'); fs.mkdirSync(downloads);
  const crxPath = process.env.IDM_TEST_CRX || 'C:\\Program Files (x86)\\Internet Download Manager\\IDMGCExt.crx';
  const idm = prepareIdm(crxPath, root);
  const probe = http.createServer(); await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  const base = `http://127.0.0.1:${port}`, bridge = path.join(root, 'bridge'), profile = path.join(root, 'profile'), scenarios = path.join(root, 'scenarios');
  fs.cpSync(path.join(__dirname, '../chrome-reels-extension'), bridge, { recursive: true });
  for (const name of ['background.js', 'options.js']) {
    const file = path.join(bridge, name); fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replaceAll('http://127.0.0.1:34719', base));
  }
  fs.mkdirSync(scenarios);
  fs.writeFileSync(path.join(output, 'test-context.json'), JSON.stringify({ root, port, isolated: true, extensionId: idm.id }, null, 2));
  fs.writeFileSync(path.join(scenarios, 'live.json'), JSON.stringify({ name: 'Isolated IDM live test', steps: [{ action: 'idmDownload', url, directory: downloads, quality: 1080, playVideo: true, timeoutMs: 90000, downloadTimeoutMs: 600000 }] }));
  const agent = spawn(process.execPath, ['local-agent.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, LOCAL_AGENT_PORT: String(port), LOCAL_AGENT_SCENARIOS_DIR: scenarios, CHROME_USER_DATA_DIR: profile, CHROME_PROFILE: 'Default' }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let log = '', context, state, worker;
  agent.stdout.on('data', chunk => { log += chunk; }); agent.stderr.on('data', chunk => { log += chunk; });
  const api = async (route, body) => {
    const response = await fetch(base + route, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10000) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`); return result;
  };
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  try {
    for (let attempt = 0; attempt < 30; attempt++) { try { await api('/api/profiles'); break; } catch { await pause(100); } }
    const viaCdp = args.includes('--cdp-extensions');
    const extensions = viaCdp ? ['--enable-unsafe-extension-debugging'] : [`--disable-extensions-except=${bridge},${idm.destination}`, `--load-extension=${bridge},${idm.destination}`];
    context = await chromium.launchPersistentContext(profile, { executablePath: chromePath, headless: false, viewport: null, ignoreDefaultArgs: ['--disable-extensions'], args: [...extensions, '--autoplay-policy=no-user-gesture-required', '--window-size=1280,900'] });
    if (viaCdp) {
      const devtools = await context.browser().newBrowserCDPSession();
      await devtools.send('Extensions.loadUnpacked', { path: bridge });
      await devtools.send('Extensions.loadUnpacked', { path: idm.destination });
      await devtools.detach();
    }
    context.on('serviceworker', candidate => candidate.on('console', message => { log += `[extension] ${message.type()}: ${message.text()}\n`; }));
    for (let attempt = 0; attempt < 60; attempt++) {
      for (const candidate of context.serviceWorkers()) {
        const name = await candidate.evaluate(() => chrome.runtime.getManifest().name).catch(() => '');
        if (name === 'Local Workflow Agent Bridge') worker = candidate;
      }
      if (worker) break; await pause(250);
    }
    if (!worker) throw new Error('Test bridge failed to load in isolated Chrome');
    await worker.evaluate(async () => { await chrome.storage.local.set({ profile: 'Default', clientId: crypto.randomUUID() }); });
    let connected = false;
    for (let attempt = 0; attempt < 30; attempt++) { const profiles = await api('/api/profiles'); if (profiles.profiles[0].extensionConnected) { connected = true; break; } await pause(250); }
    if (!connected) throw new Error('Isolated extension failed to register with isolated agent');
    // The native module initially displays [ERROR] while its host connects.
    // Wait for the normal tooltip before assessing playback/panel behavior.
    const idmWorker = context.serviceWorkers().find(candidate => candidate.url().includes(idm.id));
    for (let attempt = 0; attempt < 40; attempt++) {
      const title = await idmWorker?.evaluate(() => chrome.action.getTitle({})).catch(() => '');
      if (title && !/\[ERROR\]/i.test(title)) break;
      await pause(250);
    }
    console.log(JSON.stringify({ stage: 'ready', idmVersion: idm.version, idmExtensionId: idm.id, isolated: true, output }));
    if (args.includes('--diagnose-integration')) {
      const page = await context.newPage(); await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
      await pause(10000);
      const tooltip = await idmWorker?.evaluate(async () => { const tabs = await chrome.tabs.query({ url: '*://www.youtube.com/*' }); return chrome.action.getTitle(tabs[0] ? { tabId: tabs[0].id } : {}); });
      if (/\[ERROR\]/i.test(tooltip)) {
        const devtools = await context.browser().newBrowserCDPSession();
        const targets = await devtools.send('Target.getTargets', { filter: [{ type: 'tab', exclude: false }] });
        const matches = targets.targetInfos.filter(target => target.type === 'tab' && target.url === page.url());
        if (matches.length !== 1) throw new Error('Cannot identify the isolated tab target for IDM diagnostics');
        await devtools.send('Extensions.triggerAction', { id: idm.id, targetId: matches[0].targetId }); await devtools.detach();
      }
      await pause(3000);
      const diagnostics = [];
      for (const candidate of context.pages()) if (/internetdownloadmanager|tonec\.com/.test(candidate.url())) diagnostics.push({ url: candidate.url(), text: await candidate.locator('body').innerText({ timeout: 5000 }).catch(() => '') });
      const report = { tooltip, diagnostics };
      fs.writeFileSync(path.join(output, 'integration.json'), JSON.stringify(report, null, 2));
      console.log(JSON.stringify({ stage: 'integration-diagnosis', ...report }));
      return;
    }
    await api('/api/run', { name: 'live', profile: 'Default' });
    let previous = '', captured = false, inspected = false, focusExercised = false, lastDiagnostic = 0, integration;
    const deadline = Date.now() + 720000;
    while (Date.now() < deadline) {
      state = await api('/api/status?profile=Default');
      const progress = state.error || state.detail || state.action;
      if (progress !== previous) { console.log(JSON.stringify({ stage: 'progress', detail: progress })); previous = progress; }
      const page = context.pages().find(page => page.url().includes('youtube.com/watch'));
      if (Date.now() - lastDiagnostic > 20000) {
        const idmWorker = context.serviceWorkers().find(candidate => candidate.url().includes(idm.id));
        integration = await idmWorker?.evaluate(async () => {
          const tabs = await chrome.tabs.query({ url: '*://www.youtube.com/*' });
          return { title: await chrome.action.getTitle(tabs[0] ? { tabId: tabs[0].id } : {}), enabled: await chrome.action.isEnabled(tabs[0]?.id) };
        }).catch(error => ({ error: error.message }));
        if (integration) console.log(JSON.stringify({ stage: 'idm-integration', ...integration }));
        lastDiagnostic = Date.now();
      }
      if (page && !captured && state.detail) { await page.screenshot({ path: path.join(output, 'video-page.png') }).catch(() => {}); captured = true; }
      if (page && state.detail && !focusExercised && args.includes('--exercise-focus')) {
        focusExercised = true;
        const testWindow = await worker.evaluate(async () => {
          const original = await chrome.windows.getLastFocused();
          const temporary = await chrome.windows.create({ url: 'about:blank', focused: true, type: 'normal' });
          return { original: original.id, temporary: temporary.id };
        });
        await pause(2000);
        const paused = await api('/api/status?profile=Default');
        fs.writeFileSync(path.join(output, 'focus-check.json'), JSON.stringify(paused, null, 2));
        if (!paused.running || !paused.detail.includes('chờ focus')) throw new Error('Native wait must pause rather than fail when another test window gets focus');
        await worker.evaluate(async windows => { await chrome.windows.update(windows.original, { focused: true }); await chrome.windows.remove(windows.temporary); }, testWindow);
        console.log(JSON.stringify({ stage: 'focus-guard', paused: true, resumed: true }));
      }
      if (page && state.detail && !inspected && args.includes('--inspect-native')) {
        inspected = true;
        const marker = (await page.title()).match(/^Workflow-IDM-[a-f0-9-]{36}/)?.[0];
        if (marker) {
          try {
            const snapshot = execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, '../src/agent/idm-ui.ps1'), '-InspectMarker', marker], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
            fs.writeFileSync(path.join(output, 'native-inspection.json'), snapshot);
          } catch (error) { fs.writeFileSync(path.join(output, 'native-inspection-error.txt'), String(error.stdout || error.message)); }
        }
      }
      if (!state.running) break; await pause(1000);
    }
    const page = context.pages().find(page => page.url().includes('youtube.com/watch'));
    const playback = page ? await page.evaluate(() => ({ title: document.title, videos: [...document.querySelectorAll('video')].map(video => ({ paused: video.paused, width: video.videoWidth, height: video.videoHeight, readyState: video.readyState, error: video.error?.message || null })), notice: document.querySelector('.ytp-error-content-wrap')?.innerText || '' })).catch(() => null) : null;
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ url, isolated: true, idmVersion: idm.version, state, playback, integration }, null, 2));
    console.log(JSON.stringify({ stage: 'result', state, playback, report: path.join(output, 'report.json') }));
    if (state?.error || state?.running || !state?.download) throw new Error(state?.error || 'No confirmed IDM download');
  } finally {
    await api('/api/stop', { profile: 'Default' }).catch(() => {});
    await context?.close().catch(() => {});
    fs.writeFileSync(path.join(output, 'agent.log'), log);
    if (agent.exitCode === null) {
      const closed = new Promise(resolve => agent.once('close', resolve)); agent.stdin.end('exit\n');
      const timer = setTimeout(() => agent.kill(), 3000); await closed; clearTimeout(timer);
    }
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
