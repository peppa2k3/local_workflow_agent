const { createHash, timingSafeEqual } = require('node:crypto');

function apiError(status, message) { return Object.assign(new Error(message), { status }); }
function createAutomationApi({ workflows, scenarios, profiles, readBody, token = process.env.LOCAL_AGENT_API_TOKEN }) {
  if (token && (!/^[\x21-\x7e]{32,256}$/.test(token))) throw new Error('LOCAL_AGENT_API_TOKEN must contain 32–256 printable ASCII characters without spaces');
  const digest = value => createHash('sha256').update(value).digest();
  const secret = token ? digest(token) : null;
  const requests = new Map();
  function authorized(request) {
    return !!secret && timingSafeEqual(secret, digest((request.headers.authorization || '').replace(/^Bearer /, '')))
      && request.headers.authorization?.startsWith('Bearer ');
  }
  async function handle(request, url, json) {
    if (!secret) throw apiError(503, 'Automation API disabled. Set LOCAL_AGENT_API_TOKEN and restart the agent.');
    if (!authorized(request)) throw apiError(401, 'Valid Bearer token required');
    if (request.headers.origin) throw apiError(403, 'Automation API accepts CLI/server clients only');
    const route = url.pathname.slice('/api/v1'.length);
    if (request.method === 'GET' && route === '/profiles') return json(200, { profiles: profiles().map(p => ({ ...p, ...workflows.status(p.directory) })) });
    if (request.method === 'GET' && route === '/scenarios') return json(200, { names: scenarios.list() });
    const scenarioMatch = route.match(/^\/scenarios\/([a-z0-9][a-z0-9_-]{0,63})$/);
    if (request.method === 'GET' && scenarioMatch) {
      if (!scenarios.list().includes(scenarioMatch[1])) throw apiError(404, 'Scenario not found');
      const scenario = scenarios.load(scenarioMatch[1]);
      return json(200, { name: scenarioMatch[1], variables: scenario.variables || {}, steps: scenario.steps.length });
    }
    if (request.method === 'POST' && route === '/runs') {
      if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] || '')) throw apiError(415, 'Content-Type must be application/json');
      const body = await readBody(request);
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw apiError(400, 'Request must be an object');
      if (Object.keys(body).some(key => !['scenario', 'profile', 'variables', 'uploadPath', 'timeoutMs'].includes(key))) throw apiError(400, 'Unknown run parameter');
      if (typeof body.scenario !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(body.scenario)) throw apiError(400, 'Invalid scenario name (use saved name without .json)');
      if (typeof body.profile !== 'string' || !body.profile) throw apiError(400, 'profile is required (Chrome directory, e.g. Profile 1)');
      if (body.uploadPath !== undefined && (typeof body.uploadPath !== 'string' || body.uploadPath.includes('\0'))) throw apiError(400, 'Invalid uploadPath');
      if (body.timeoutMs !== undefined && (!Number.isSafeInteger(body.timeoutMs) || body.timeoutMs < 1 || body.timeoutMs > 86400000)) throw apiError(400, 'timeoutMs must be an integer from 1 to 86400000');
      const key = request.headers['idempotency-key'];
      if (key !== undefined && !/^[a-zA-Z0-9_-]{1,128}$/.test(key)) throw apiError(400, 'Invalid Idempotency-Key');
      const fingerprint = digest(JSON.stringify(body, (_, value) => value && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value)).toString('hex');
      if (key && requests.has(key)) {
        const prior = requests.get(key);
        if (prior.fingerprint !== fingerprint) throw apiError(409, 'Idempotency-Key already used with different parameters');
        const run = workflows.getRun(prior.runId);
        if (!run) throw apiError(410, 'Run expired; use a new Idempotency-Key for a new run');
        return json(200, run);
      }
      if (!scenarios.list().includes(body.scenario)) throw apiError(404, 'Scenario not found');
      if (workflows.status(body.profile).running) throw apiError(409, 'Profile already running a scenario');
      const run = workflows.start(body.profile, scenarios.load(body.scenario), body.uploadPath || '', body.scenario, body.variables, body.timeoutMs);
      if (key) {
        requests.set(key, { fingerprint, runId: run.runId });
        while (requests.size > 200) requests.delete(requests.keys().next().value);
      }
      return json(202, run);
    }
    const match = route.match(/^\/runs\/([0-9a-f-]{36})(\/stop)?$/);
    if (match && ((!match[2] && request.method === 'GET') || (match[2] && request.method === 'POST'))) {
      const run = match[2] ? workflows.stopRun(match[1]) : workflows.getRun(match[1]);
      if (!run) throw apiError(404, 'Run not found (history is in memory)');
      return json(200, run);
    }
    throw apiError(404, 'Not found');
  }
  return { handle, authorized, enabled: !!secret };
}
module.exports = { createAutomationApi };
