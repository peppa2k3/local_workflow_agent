import {parseArgs} from 'node:util';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {createWorkflowClient} from './workflow.js';

const help = `Usage: node workflow.js <command> [options]
  profiles | scenarios
  describe --scenario NAME
  runs [--profile "Profile 1"]
  run --scenario NAME --profile "Profile 1" [--var name=value ...]
      [--variables-file values.json] [--upload PATH] [--request-id KEY]
      [--run-timeout-ms 3600000] [--wait --timeout-ms 300000 --stop-on-timeout]
  status --run-id UUID
  stop --run-id UUID
Reads local-agent/.env and WORKFLOW_AGENT_ENV_FILE (default ../.env).
Requires the workflow engine to be running. Output: JSON.
Exit: 0 success/accepted, 1 error/failed, 2 cancelled, 124 wait timeout.`;

export async function runWorkflowCli(args = process.argv.slice(2), {client = createWorkflowClient(), output = data => console.log(JSON.stringify(data))} = {}) {
  const {values, positionals} = parseArgs({args, allowPositionals: true, options: {
    help: {type: 'boolean'}, scenario: {type: 'string'}, profile: {type: 'string'},
    'run-id': {type: 'string'}, 'request-id': {type: 'string'}, var: {type: 'string', multiple: true},
    'variables-file': {type: 'string'}, upload: {type: 'string'}, wait: {type: 'boolean'},
    'timeout-ms': {type: 'string'}, 'run-timeout-ms': {type: 'string'}, 'stop-on-timeout': {type: 'boolean'},
  }});
  if (values.help) { console.log(help); return; }
  const command = positionals[0];
  const allowed = {profiles: [], scenarios: [], describe: ['scenario'], runs: ['profile'], status: ['run-id'], stop: ['run-id'], run: ['scenario', 'profile', 'var', 'variables-file', 'upload', 'wait', 'timeout-ms', 'run-timeout-ms', 'stop-on-timeout', 'request-id']};
  if (positionals.length !== 1 || !Object.hasOwn(allowed, command)) throw Error('Unknown command; use --help');
  for (const key of Object.keys(values)) if (!allowed[command].includes(key)) throw Error(`Unsupported option --${key}`);
  if (['profiles', 'scenarios'].includes(command)) { output(await client.request(command)); return; }
  if (command === 'describe') { output(await client.request(command, {scenario: values.scenario})); return; }
  if (command === 'runs') { output(await client.request(command, values.profile ? {profile: values.profile} : {})); return; }
  if (command === 'status' || command === 'stop') { output(await client.request(command, {runId: values['run-id']})); return; }
  if ((values['timeout-ms'] || values['stop-on-timeout']) && !values.wait) throw Error('Wait timeout options require --wait');
  const waitMs = Number(values['timeout-ms'] ?? 300000), timeoutMs = Number(values['run-timeout-ms'] ?? 3600000);
  if (![waitMs, timeoutMs].every(value => Number.isSafeInteger(value) && value >= 1 && value <= 86400000)) throw Error('Timeout must be 1–86400000 ms');
  let variables = {};
  if (values['variables-file']) {
    const raw = readFileSync(values['variables-file']);
    if (raw.length > 100000) throw Error('Variables file too large');
    variables = JSON.parse(raw.toString('utf8'));
    if (!variables || typeof variables !== 'object' || Array.isArray(variables)) throw Error('Variables file must contain an object');
  }
  variables = {...variables};
  for (const item of values.var || []) {
    const index = item.indexOf('='); if (index < 1) throw Error('--var must be name=value');
    Object.defineProperty(variables, item.slice(0, index), {value: item.slice(index + 1), enumerable: true, configurable: true, writable: true});
  }
  const requestId = values['request-id'] || randomUUID();
  let run = await client.request('run', {scenario: values.scenario, profile: values.profile, variables, timeoutMs, ...(values.upload ? {uploadPath: values.upload} : {})}, {requestId});
  if (!values.wait) { output(run); return; }
  console.error(JSON.stringify({runId: run.runId, requestId}));
  const deadline = Date.now() + waitMs;
  while (run.state === 'running') {
    if (Date.now() >= deadline) {
      if (values['stop-on-timeout']) run = await client.request('stop', {runId: run.runId});
      output({...run, waitTimedOut: true}); process.exitCode = 124; return;
    }
    await delay(Math.min(500, Math.max(1, deadline - Date.now())));
    run = await client.request('status', {runId: run.runId});
  }
  output(run); process.exitCode = run.state === 'succeeded' ? 0 : run.state === 'cancelled' ? 2 : 1;
}
