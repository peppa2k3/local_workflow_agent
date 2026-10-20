const fs = require('node:fs');
const { parseArgs } = require('node:util');
const { randomUUID } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');

const help = `Usage: node local-agent.js <command> [options]
  profiles                         List Chrome directories and connection status
  scenarios                        List saved scenario names
  describe --scenario NAME         Show scenario variables and step count
  run --scenario NAME --profile "Profile 1" [--var name=value ...]
      [--variables-file values.json] [--upload PATH] [--wait]
      [--timeout-ms 300000] [--stop-on-timeout] [--request-id KEY] [--run-timeout-ms 3600000]
  status --run-id UUID              Inspect one run
  stop --run-id UUID                Stop only that run
Options: --base-url http://127.0.0.1:34719 (loopback only), --help
Set LOCAL_AGENT_API_TOKEN in both the server and client environments.
Run node local-agent.js without arguments to start the agent.
Output: JSON. Exit: 0 success/accepted, 1 error/failure, 2 cancelled, 124 wait timeout.
Timeout does not stop the run unless --stop-on-timeout is supplied.`;

async function main(args = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    scenario: { type: 'string' }, profile: { type: 'string' }, var: { type: 'string', multiple: true },
    'variables-file': { type: 'string' }, upload: { type: 'string' }, wait: { type: 'boolean' },
    'timeout-ms': { type: 'string' }, 'stop-on-timeout': { type: 'boolean' },
    'run-timeout-ms': { type: 'string' },
    'request-id': { type: 'string' }, 'run-id': { type: 'string' }, 'base-url': { type: 'string' }, help: { type: 'boolean' }
  } });
  if (values.help) { console.log(help); return; }
  const [command] = positionals;
  const allowed = {
    profiles: [], scenarios: [], describe: ['scenario'], status: ['run-id'], stop: ['run-id'],
    run: ['scenario', 'profile', 'var', 'variables-file', 'upload', 'wait', 'timeout-ms', 'stop-on-timeout', 'request-id', 'run-timeout-ms']
  };
  if (positionals.length !== 1 || !Object.hasOwn(allowed, command)) throw new Error('Unknown command. Use --help');
  for (const key of Object.keys(values)) if (!['base-url', 'help', ...allowed[command]].includes(key)) throw new Error(`Option --${key} is not supported for ${command}`);
  const base = new URL(values['base-url'] || 'http://127.0.0.1:34719');
  if (base.protocol !== 'http:' || base.hostname !== '127.0.0.1' || base.username || base.password || base.pathname !== '/' || base.search || base.hash) throw new Error('base-url must be http://127.0.0.1:PORT');
  const token = process.env.LOCAL_AGENT_API_TOKEN;
  if (!token) throw new Error('Set LOCAL_AGENT_API_TOKEN before using the CLI');
  async function request(route, method = 'GET', body, requestId) {
    const response = await fetch(new URL('/api/v1' + route, base), { method, redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}), ...(requestId ? { 'Idempotency-Key': requestId } : {}) },
      body: body ? JSON.stringify(body) : undefined });
    const data = await response.json();
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${data.error || 'Request failed'}`);
    return data;
  }
  const output = data => console.log(JSON.stringify(data));
  if (['profiles', 'scenarios'].includes(command)) { output(await request('/' + command)); return; }
  if (command === 'describe') {
    if (!values.scenario) throw new Error('--scenario is required');
    output(await request('/scenarios/' + encodeURIComponent(values.scenario))); return;
  }
  if (command === 'status' || command === 'stop') {
    if (!/^[0-9a-f-]{36}$/.test(values['run-id'] || '')) throw new Error('Valid --run-id is required');
    output(await request('/runs/' + values['run-id'] + (command === 'stop' ? '/stop' : ''), command === 'stop' ? 'POST' : 'GET')); return;
  }
  if (!values.scenario || !values.profile) throw new Error('--scenario and --profile are required');
  const timeout = Number(values['timeout-ms'] ?? 300000);
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 86400000) throw new Error('--timeout-ms must be 1–86400000');
  if ((values['stop-on-timeout'] || values['timeout-ms']) && !values.wait) throw new Error('Timeout options require --wait');
  let variables = {};
  if (values['variables-file']) {
    const data = fs.readFileSync(values['variables-file']);
    if (data.length > 100000) throw new Error('Variables file too large');
    variables = JSON.parse(data.toString('utf8'));
    if (!variables || typeof variables !== 'object' || Array.isArray(variables)) throw new Error('Variables file must contain a JSON object');
  }
  variables = { ...variables };
  for (const item of values.var || []) {
    const equals = item.indexOf('=');
    if (equals < 1) throw new Error('--var must be name=value');
    Object.defineProperty(variables, item.slice(0, equals), { value: item.slice(equals + 1), enumerable: true, configurable: true, writable: true });
  }
  const runTimeout = Number(values['run-timeout-ms'] ?? 3600000);
  if (!Number.isSafeInteger(runTimeout) || runTimeout < 1 || runTimeout > 86400000) throw new Error('--run-timeout-ms must be 1–86400000');
  const body = { scenario: values.scenario, profile: values.profile, variables, timeoutMs: runTimeout, ...(values.upload ? { uploadPath: values.upload } : {}) };
  let run = await request('/runs', 'POST', body, values['request-id'] || randomUUID());
  if (!values.wait) { output(run); return; }
  console.error(JSON.stringify({ runId: run.runId, profile: run.profile, scenario: run.scenario }));
  const deadline = Date.now() + timeout;
  while (run.state === 'running') {
    if (Date.now() >= deadline) {
      if (values['stop-on-timeout']) run = await request('/runs/' + run.runId + '/stop', 'POST');
      output({ ...run, waitTimedOut: true }); process.exitCode = 124; return;
    }
    await delay(Math.min(250, Math.max(1, deadline - Date.now())));
    run = await request('/runs/' + run.runId);
  }
  output(run);
  process.exitCode = run.state === 'succeeded' ? 0 : run.state === 'cancelled' ? 2 : 1;
}
function run() { main().catch(error => { console.error(JSON.stringify({ error: error.message })); process.exitCode = 1; }); }
module.exports = { main, run };
