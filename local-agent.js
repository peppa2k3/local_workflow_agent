// Run: node local-agent.js
// Commands: run <scenario.json>, stop, status, exit
const http = require('http');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawn } = require('child_process');

const port = Number(process.env.LOCAL_AGENT_PORT || 34719);
const scenariosDir = path.join(__dirname, 'scenarios');
const dashboardPath = path.join(__dirname, 'dashboard', 'index.html');
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profile = process.env.CHROME_PROFILE || 'Profile 2';
let workflow = null;
let index = 0;
let runId = 0;
let running = false;
let inFlight = false;
let requiredUrl = null;
let boundTabId = null;
let lastContact = 0;
let lastError = '';
let picker = { id: 0, active: false, result: null };

function stop() {
  running = false;
  inFlight = false;
  runId++;
}

function status() {
  return {
    running, profile, index, total: workflow?.steps.length || 0,
    action: workflow?.steps[index]?.action || null,
    extensionConnected: Date.now() - lastContact < 5000,
    requiredUrl, error: lastError
  };
}

function startScenario(scenario, uploadPath = '') {
  if (!Array.isArray(scenario.steps) || !scenario.steps.length) {
    throw new Error('Scenario needs a nonempty steps array');
  }
  const prepared = structuredClone(scenario);
  for (const step of prepared.steps) {
    if (step.action !== 'upload') continue;
    const inputPath = uploadPath || step.filePath ||
      (step.folder && step.filename ? path.join(step.folder, step.filename) : '');
    if (!inputPath) throw new Error('Upload step needs a file path, folder + filename, or a run-time upload path');
    const file = path.resolve(inputPath);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`Upload file does not exist: ${file}`);
    step.filePath = file;
  }
  stop();
  picker.active = false;
  workflow = prepared;
  index = 0;
  lastError = '';
  requiredUrl = null;
  boundTabId = null;
  running = true;
  console.log(`Started: ${workflow.name || 'Untitled scenario'}`);
  advanceLocalSteps(runId).catch(error => { lastError = error.message; stop(); });
}

function scenarioFile(name) {
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(name)) throw new Error('Invalid scenario filename');
  return path.join(scenariosDir, `${name}.json`);
}

async function advanceLocalSteps(id) {
  while (running && runId === id && index < workflow.steps.length) {
    const step = workflow.steps[index];
    if (step.action === 'wait') {
      await new Promise(resolve => setTimeout(resolve, step.ms));
      if (!running || runId !== id) return;
    } else if (step.action === 'openFolder') {
      const folder = path.resolve(step.path);
      if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
        lastError = `Folder does not exist: ${folder}`;
        stop();
        return;
      }
      const explorer = spawn('explorer.exe', [folder], { detached: true, stdio: 'ignore' });
      explorer.on('error', error => console.error(error.message));
      explorer.unref();
    } else if (step.action === 'openUrl') {
      const url = new URL(step.url);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('openUrl requires http or https');
      const chrome = spawn(chromePath, [`--profile-directory=${profile}`, url.href], {
        detached: true, stdio: 'ignore'
      });
      chrome.on('error', error => { lastError = error.message; stop(); });
      chrome.unref();
      requiredUrl = url.href;
      boundTabId = null;
    } else {
      return; // A Chrome tab will execute this step.
    }
    console.log(`Done ${index + 1}/${workflow.steps.length}: ${step.action}`);
    index++;
  }
  if (running && runId === id && index === workflow.steps.length) {
    running = false;
    console.log('Scenario completed.');
  }
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
  });
}

const server = http.createServer(async (request, response) => {
  const route = new URL(request.url, `http://127.0.0.1:${port}`).pathname;
  const json = (code, data) => {
    response.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify(data));
  };
  if (request.method === 'GET' && route === '/') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    fs.createReadStream(dashboardPath).pipe(response);
    return;
  }
  if (route.startsWith('/api/')) {
    try {
      const origin = request.headers.origin;
      if (origin && origin !== `http://127.0.0.1:${port}`) throw new Error('Origin not allowed');
      if (request.method === 'GET' && route === '/api/status') return json(200, status());
      if (request.method === 'GET' && route === '/api/pick/status') return json(200, picker);
      if (request.method === 'POST' && route === '/api/pick/start') {
        if (running) throw new Error('Stop the scenario before picking an element');
        picker = { id: picker.id + 1, active: true, result: null };
        return json(200, picker);
      }
      if (request.method === 'GET' && route === '/api/scenarios') {
        const names = fs.readdirSync(scenariosDir).filter(name => name.endsWith('.json')).map(name => name.slice(0, -5));
        return json(200, { names });
      }
      const match = route.match(/^\/api\/scenarios\/([^/]+)$/);
      if (match && request.method === 'GET') {
        return json(200, JSON.parse(fs.readFileSync(scenarioFile(match[1]), 'utf8')));
      }
      if (match && request.method === 'PUT') {
        const scenario = await readBody(request);
        if (!Array.isArray(scenario.steps) || !scenario.steps.length) throw new Error('Add at least one step');
        fs.writeFileSync(scenarioFile(match[1]), JSON.stringify(scenario, null, 2) + '\n');
        return json(200, { ok: true });
      }
      if (request.method === 'POST' && route === '/api/run') {
        const body = await readBody(request);
        startScenario(JSON.parse(fs.readFileSync(scenarioFile(body.name), 'utf8')), body.uploadPath || '');
        return json(200, { ok: true });
      }
      if (request.method === 'POST' && route === '/api/stop') {
        stop();
        return json(200, { ok: true });
      }
      return json(404, { error: 'Not found' });
    } catch (error) {
      return json(400, { error: String(error.message || error) });
    }
  }
  if (request.method !== 'POST' || !['/next', '/result', '/state', '/pick/next', '/pick/result'].includes(request.url)) {
    response.writeHead(404).end();
    return;
  }
  try {
    const body = await readBody(request);
    lastContact = Date.now();
    let answer = { running, runId };
    if (request.url === '/pick/next') {
      answer = { active: picker.active, id: picker.id };
    } else if (request.url === '/pick/result') {
      if (picker.active && body.id === picker.id) {
        picker.active = false;
        picker.result = body.locator || null;
      }
      answer = { ok: true };
    } else if (request.url === '/next') {
      answer.step = null;
      if (running && !inFlight && index < workflow.steps.length) {
        if ((!requiredUrl || body.url?.startsWith(requiredUrl)) &&
            (boundTabId === null || body.tabId === boundTabId)) {
          boundTabId = body.tabId;
          requiredUrl = null;
          inFlight = true;
          answer.step = { ...workflow.steps[index], id: index };
          console.log(`Running ${index + 1}/${workflow.steps.length}: ${answer.step.action}`);
        }
      }
    } else if (request.url === '/result') {
      if (running && body.runId === runId && body.id === index && inFlight) {
        inFlight = false;
        if (!body.ok) {
          lastError = `Step ${index + 1}: ${body.error}`;
          console.error(lastError);
          stop();
        } else {
          const step = workflow.steps[index];
          console.log(`Done ${index + 1}/${workflow.steps.length}: ${step.action}`);
          index++;
          advanceLocalSteps(runId).catch(error => { lastError = error.message; stop(); });
        }
      }
    }
    response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify(answer));
  } catch (error) {
    response.writeHead(400).end(String(error.message || error));
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Local agent ready. Chrome profile: ${profile}. Load/reload the extension there.`);
  console.log(`Dashboard: http://127.0.0.1:${port}`);
  console.log('Commands: run <scenario.json> | stop | status | exit');
  terminal.prompt();
});
server.on('error', error => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Exit the previous local agent, then run this version again.`);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
  terminal.close();
});

const terminal = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'agent> ' });
terminal.on('line', line => {
  const command = line.trim();
  if (command.startsWith('run ')) {
    try {
      const raw = command.slice(4).trim();
      const marker = ' --upload ';
      const position = raw.indexOf(marker);
      const file = path.resolve((position < 0 ? raw : raw.slice(0, position)).trim().replace(/^"|"$/g, ''));
      const uploadPath = position < 0 ? '' : raw.slice(position + marker.length).trim().replace(/^"|"$/g, '');
      const scenario = JSON.parse(fs.readFileSync(file, 'utf8'));
      startScenario(scenario, uploadPath);
    } catch (error) { console.error(error.message); }
  } else if (command === 'stop') {
    stop();
    console.log('Stopped.');
  } else if (command === 'status') {
    console.log(`State: ${running ? 'running' : 'idle'}; step: ${workflow ? `${index + 1}/${workflow.steps.length}` : 'none'}; extension: ${Date.now() - lastContact < 5000 ? 'connected' : 'not connected'}`);
    if (requiredUrl) console.log(`Waiting for URL: ${requiredUrl}`);
    if (lastError) console.log(`Error: ${lastError}`);
  } else if (command === 'exit') {
    stop();
    terminal.close();
    return;
  } else {
    console.log('Commands: run <scenario.json> | stop | status | exit');
  }
  terminal.prompt();
});
terminal.on('close', () => server.close());
