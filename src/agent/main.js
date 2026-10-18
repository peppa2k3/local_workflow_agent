const http = require('http');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawn } = require('child_process');
const { monitorEventLoopDelay } = require('perf_hooks');
const { port, scenariosDir, dashboardPath, chromePath, profile, userDataDir } = require('./config');
const { createScenarioStore } = require('./scenario-store');
const { chooseFile } = require('./file-picker');
const { listProfiles } = require('./profiles');
const { createWorkflows } = require('./workflows');

const scenarios = createScenarioStore(scenariosDir);
const eventLoop = monitorEventLoopDelay({ resolution: 20 });
eventLoop.enable();
let previousCpu = process.cpuUsage(), previousCpuAt = process.hrtime.bigint();
let performance = { cpuPercent: 0, eventLoopP95Ms: 0, memoryMb: 0 };
let filePickerPending = false;
let profileCache, profileCacheAt = 0;
const profiles = () => {
  if (!profileCache || Date.now() - profileCacheAt > 2000) {
    profileCache = listProfiles(userDataDir, profile); profileCacheAt = Date.now();
  }
  return profileCache;
};
const workflows = createWorkflows({ scenarios, defaultProfile: profile, profiles, openFolder(folderPath) {
  const folder = path.resolve(folderPath);
  if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) throw new Error(`Folder does not exist: ${folder}`);
  return launch('explorer.exe', [folder]);
} });
function launch(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' });
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolve(); });
  });
}
function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', chunk => {
      body += chunk;
      if (body.length > 100000) reject(new Error('Request too large'));
    });
    request.on('end', () => {
      try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
    });
    request.on('error', reject);
  });
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${port}`);
  const route = url.pathname;
  const json = (code, data) => {
    response.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify(data));
  };
  if (request.method === 'GET' && route === '/') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    fs.createReadStream(dashboardPath).pipe(response);
    return;
  }
  try {
    if (route.startsWith('/api/')) {
      const origin = request.headers.origin;
      const extensionRead = request.method === 'GET' && route === '/api/profiles' && /^chrome-extension:\/\/[a-z]+$/.test(origin || '');
      if (origin && origin !== `http://127.0.0.1:${port}` && !extensionRead) throw new Error('Origin not allowed');
      const selected = url.searchParams.get('profile') || profile;
      if (request.method === 'GET' && route === '/api/status') return json(200, workflows.status(selected));
      if (request.method === 'GET' && route === '/api/profiles') {
        return json(200, { defaultProfile: profile, capabilities: ['variables-v1'], performance, profiles: profiles().map(item => ({ ...item, ...workflows.status(item.directory) })) });
      }
      if (request.method === 'POST' && route === '/api/profiles/open') {
        const body = await readBody(request);
        workflows.session(body.profile);
        await launch(chromePath, [`--user-data-dir=${userDataDir}`, `--profile-directory=${body.profile}`, `http://127.0.0.1:${port}`]);
        return json(200, { ok: true });
      }
      if (request.method === 'GET' && route === '/api/pick/status') return json(200, workflows.session(selected).picker);
      if (request.method === 'POST' && route === '/api/choose-file') {
        if (filePickerPending) throw new Error('Hộp chọn file đang mở. Chọn file hoặc Hủy trong cửa sổ đó.');
        const body = await readBody(request);
        if (filePickerPending) throw new Error('Hộp chọn file đang mở');
        filePickerPending = true;
        try { return json(200, { filePath: await chooseFile(body.initialDirectory || '') }); }
        finally { filePickerPending = false; }
      }
      if (request.method === 'POST' && route === '/api/pick/start') {
        const body = await readBody(request);
        const s = workflows.session(body.profile);
        if (s.running) throw new Error('Stop this profile before picking an element');
        if (!workflows.status(s.profile).extensionConnected) throw new Error('Extension chưa kết nối profile này');
        s.picker = { id: s.picker.id + 1, active: true, result: null };
        return json(200, s.picker);
      }
      if (request.method === 'GET' && route === '/api/scenarios') return json(200, { names: scenarios.list() });
      const cloneMatch = route.match(/^\/api\/scenarios\/([^/]+)\/clone$/);
      if (cloneMatch && request.method === 'POST') {
        const body = await readBody(request);
        return json(200, { name: body.name, scenario: scenarios.clone(cloneMatch[1], body.name) });
      }
      const match = route.match(/^\/api\/scenarios\/([^/]+)$/);
      if (match && request.method === 'GET') return json(200, scenarios.load(match[1]));
      if (match && request.method === 'PUT') {
        scenarios.save(match[1], await readBody(request));
        return json(200, { ok: true });
      }
      if (request.method === 'POST' && route === '/api/run') {
        const body = await readBody(request);
        workflows.start(body.profile || profile, scenarios.load(body.name), body.uploadPath || '');
        return json(200, { ok: true });
      }
      if (request.method === 'POST' && route === '/api/stop') {
        const body = await readBody(request);
        workflows.stop(body.profile || profile);
        return json(200, { ok: true });
      }
      return json(404, { error: 'Not found' });
    }
    if (request.method !== 'POST' || !['/next', '/result', '/state', '/pick/next', '/pick/result'].includes(route)) {
      return json(404, { error: 'Not found' });
    }
    const body = await readBody(request);
    const s = workflows.connect(body);
    if (route === '/next') return json(200, workflows.next(s));
    if (route === '/result') workflows.result(s, body);
    if (route === '/pick/next') return json(200, s.picker);
    if (route === '/pick/result' && s.picker.active && body.id === s.picker.id) {
      s.picker.active = false; s.picker.result = body.locator || null;
    }
    return json(200, { running: s.running, runId: s.runId, ok: true });
  } catch (error) {
    return json(400, { error: String(error.message || error) });
  }
});
const expiry = setInterval(workflows.expire, 1000);
expiry.unref();
const performanceTimer = setInterval(() => {
  const now = process.hrtime.bigint(), cpu = process.cpuUsage();
  performance = {
    cpuPercent: Math.round(((cpu.user - previousCpu.user) + (cpu.system - previousCpu.system)) / (Number(now - previousCpuAt) / 1000) * 1000) / 10,
    eventLoopP95Ms: Math.round(eventLoop.percentile(95) / 1e5) / 10,
    memoryMb: Math.round(process.memoryUsage().rss / 1048576 * 10) / 10
  };
  previousCpu = cpu; previousCpuAt = now; eventLoop.reset();
}, 2000);
performanceTimer.unref();
server.listen(port, '127.0.0.1', () => {
  console.log(`Local agent ready. Default Chrome profile: ${profile}.`);
  console.log(`Dashboard: http://127.0.0.1:${port}`);
  console.log('Commands: run <scenario.json> [--profile "Profile 1"] [--upload "path"] | stop [profile] | status | exit');
  terminal.prompt();
});
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? `Port ${port} is already in use. Exit the previous local agent, then run this version again.` : error);
  process.exitCode = 1; terminal.close();
});
const terminal = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'agent> ' });
terminal.on('line', line => {
  const command = line.trim();
  try {
    if (command.startsWith('run ')) {
      const tokens = command.slice(4).match(/"[^"]*"|\S+/g)?.map(value => value.replace(/^"|"$/g, '')) || [];
      const [file, ...flags] = tokens;
      let selected = profile, uploadPath = '';
      for (let i = 0; i < flags.length; i += 2) {
        if (!flags[i + 1] || !['--profile', '--upload'].includes(flags[i])) throw new Error('Use --profile "Profile 1" or --upload "path"');
        if (flags[i] === '--profile') selected = flags[i + 1]; else uploadPath = flags[i + 1];
      }
      workflows.start(selected, JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')), uploadPath);
    } else if (command === 'stop' || command.startsWith('stop ')) workflows.stop(command.slice(5).trim().replace(/^"|"$/g, '') || profile);
    else if (command === 'status') console.log(JSON.stringify(profiles().map(item => workflows.status(item.directory)), null, 2));
    else if (command === 'exit') { terminal.close(); return; }
    else console.log('Commands: run <scenario.json> [--profile "Profile 1"] [--upload "path"] | stop [profile] | status | exit');
  } catch (error) { console.error(error.message); }
  terminal.prompt();
});
terminal.on('close', () => { profiles().forEach(item => workflows.stop(item.directory)); server.close(); });
