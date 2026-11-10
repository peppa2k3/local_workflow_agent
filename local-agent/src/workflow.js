import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseEnv} from 'node:util';

const agentDirectory = fileURLToPath(new URL('../', import.meta.url));
export const workflowOperations = Object.freeze(['profiles', 'scenarios', 'describe', 'runs', 'status', 'run', 'stop']);
const fields = Object.freeze({
  profiles: [], scenarios: [], describe: ['scenario'], runs: ['profile'],
  status: ['runId'], stop: ['runId'], run: ['scenario', 'profile', 'variables', 'uploadPath', 'timeoutMs'],
});
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function fail(code, message, status = 400) { throw Object.assign(new Error(message), {code, status}); }
function envFile(file) {
  try { return parseEnv(readFileSync(file, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') return {};
    fail('CONFIG', 'Cannot read workflow environment configuration', 503);
  }
}

export function readWorkflowSettings({env = process.env, directory = agentDirectory} = {}) {
  // Select only workflow settings; never load VPS credentials into the workflow process.
  const config = {...envFile(resolve(directory, '.env')), ...env};
  const workflowEnv = envFile(resolve(directory, config.WORKFLOW_AGENT_ENV_FILE || '../.env'));
  if (config.WORKFLOW_AGENT_ENABLED !== undefined && !['true', 'false'].includes(config.WORKFLOW_AGENT_ENABLED)) {
    fail('CONFIG', 'WORKFLOW_AGENT_ENABLED must be true or false', 503);
  }
  return {
    enabled: config.WORKFLOW_AGENT_ENABLED !== 'false',
    baseUrl: config.WORKFLOW_AGENT_URL || `http://127.0.0.1:${workflowEnv.LOCAL_AGENT_PORT || 34719}`,
    token: config.LOCAL_AGENT_API_TOKEN ?? workflowEnv.LOCAL_AGENT_API_TOKEN ?? '',
  };
}

export function validateWorkflowSettings(settings) {
  if (!settings.enabled) fail('DISABLED', 'Workflow control is disabled on this machine', 503);
  let base;
  try { base = new URL(settings.baseUrl); } catch { fail('CONFIG', 'Invalid WORKFLOW_AGENT_URL', 503); }
  if (base.protocol !== 'http:' || base.hostname !== '127.0.0.1' || base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
    fail('CONFIG', 'WORKFLOW_AGENT_URL must be http://127.0.0.1:PORT', 503);
  }
  if (!/^[\x21-\x7e]{32,256}$/.test(settings.token || '')) {
    fail('CONFIG', 'Set LOCAL_AGENT_API_TOKEN in the workflow engine .env and restart that engine', 503);
  }
  return {...settings, baseUrl: base.origin};
}

function operationRequest(operation, params, requestId) {
  if (!Object.hasOwn(fields, operation)) fail('INVALID_REQUEST', 'Unknown workflow operation');
  if (!object(params) || Object.keys(params).some(key => !fields[operation].includes(key))) fail('INVALID_REQUEST', 'Invalid workflow parameters');
  if (requestId !== undefined && (typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(requestId))) fail('INVALID_REQUEST', 'Invalid requestId');
  if (['describe', 'run'].includes(operation) && (typeof params.scenario !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(params.scenario))) fail('INVALID_REQUEST', 'Use the saved scenario name without .json');
  if ((operation === 'run' || params.profile !== undefined) && (typeof params.profile !== 'string' || !params.profile.trim() || params.profile.length > 256 || params.profile.includes('\0'))) fail('INVALID_REQUEST', 'A Chrome profile directory is required');
  if (['status', 'stop'].includes(operation) && (typeof params.runId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(params.runId))) fail('INVALID_REQUEST', 'A valid runId is required');
  if (operation === 'run') {
    if (!requestId) fail('INVALID_REQUEST', 'run requires a stable requestId for retry protection');
    const body = JSON.stringify(params);
    if (Buffer.byteLength(body) > 100000) fail('INVALID_REQUEST', 'Workflow request too large', 413);
    return {route: '/runs', method: 'POST', body};
  }
  if (operation === 'describe') return {route: '/scenarios/' + params.scenario};
  if (operation === 'status' || operation === 'stop') return {route: '/runs/' + params.runId + (operation === 'stop' ? '/stop' : ''), method: operation === 'stop' ? 'POST' : 'GET'};
  return {route: '/' + operation + (operation === 'runs' && params.profile ? '?profile=' + encodeURIComponent(params.profile) : '')};
}

export function createWorkflowClient({settings = readWorkflowSettings, fetchImpl = fetch, timeoutMs = 10000} = {}) {
  return {
    capabilities() {
      try { validateWorkflowSettings(settings()); return {version: 1, configured: true, operations: workflowOperations}; }
      catch (error) { return {version: 1, configured: false, operations: workflowOperations, error: error.message}; }
    },
    async request(operation, params = {}, {requestId, signal} = {}) {
      const spec = operationRequest(operation, params, requestId);
      const config = validateWorkflowSettings(settings());
      const deadline = AbortSignal.timeout(timeoutMs);
      try {
        const response = await fetchImpl(config.baseUrl + '/api/v1' + spec.route, {
          method: spec.method || 'GET', redirect: 'error',
          signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
          headers: {Authorization: `Bearer ${config.token}`, ...(spec.body ? {'Content-Type': 'application/json', 'Idempotency-Key': requestId} : {})},
          body: spec.body,
        });
        const chunks = []; let length = 0;
        for await (const chunk of response.body) {
          length += chunk.length;
          if (length > 4 * 1024 * 1024) fail('RESPONSE_TOO_LARGE', 'Workflow response too large', 502);
          chunks.push(Buffer.from(chunk));
        }
        let data;
        try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
        catch { fail('INVALID_RESPONSE', 'Workflow engine returned invalid JSON', 502); }
        if (!response.ok) fail('WORKFLOW_API', String(data.error || 'Workflow request failed').replaceAll(config.token, '[redacted]'), response.status);
        return data;
      } catch (error) {
        if (error.code && error.status) throw error;
        fail('UNAVAILABLE', 'Cannot reach the workflow engine, or the request was interrupted. A submitted run may already be running; check history before starting another.', 503);
      }
    },
  };
}

export function bindWorkflowSocket({socket, getSession, client = createWorkflowClient(), now = Date.now}) {
  const pending = new Map();
  const allowed = sessionId => {
    const session = getSession();
    return socket.connected && typeof sessionId === 'string' && sessionId && session?.sessionId === sessionId && Number.isFinite(session.expires) && now() < session.expires;
  };
  const onRequest = async (payload, acknowledge) => {
    if (typeof acknowledge !== 'function') return;
    let controller;
    const requestId = typeof payload?.requestId === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(payload.requestId) ? payload.requestId : undefined;
    try {
      if (!object(payload) || Object.keys(payload).some(key => !['sessionId', 'operation', 'params', 'requestId'].includes(key))) fail('INVALID_REQUEST', 'Invalid workflow message');
      if (!allowed(payload.sessionId)) fail('LEASE_REQUIRED', 'An active control session is required', 403);
      if (payload.params?.uploadPath !== undefined) fail('INVALID_REQUEST', 'Socket requests use file paths saved in the scenario');
      if (pending.size >= 4) fail('BUSY', 'Too many workflow requests in progress', 429);
      controller = new AbortController(); pending.set(controller, payload.sessionId);
      const data = await client.request(payload.operation, payload.params, {requestId: payload.requestId, signal: controller.signal});
      if (!allowed(payload.sessionId)) fail('LEASE_REQUIRED', 'Control session expired; reconnect and inspect run history', 403);
      if (Buffer.byteLength(JSON.stringify(data)) > 500000) fail('RESPONSE_TOO_LARGE', 'Workflow response is too large for the VPS relay', 502);
      acknowledge({ok: true, requestId, data});
    } catch (error) {
      acknowledge({ok: false, requestId, code: error.code || 'INTERNAL', status: error.status || 500, error: error.status ? error.message : 'Workflow request failed'});
    } finally { if (controller) pending.delete(controller); }
  };
  const abort = sessionId => { for (const [controller, owner] of pending) if (!sessionId || owner === sessionId) controller.abort(); };
  const onDisconnect = () => abort();
  const onRevoke = payload => { if (payload?.sessionId) abort(payload.sessionId); };
  socket.on('workflow:request', onRequest);
  socket.on('disconnect', onDisconnect);
  socket.on('session:revoked', onRevoke);
  return {close() { abort(); socket.off('workflow:request', onRequest); socket.off('disconnect', onDisconnect); socket.off('session:revoked', onRevoke); }};
}
