const c = require('./common');
const ACTIVE = ['queued', 'dispatched', 'running'];
const TERMINAL = ['succeeded', 'failed', 'cancelled', 'interrupted', 'rejected', 'unknown', 'expired'];
function metadata(value) {
  if (!c.object(value) || !Array.isArray(value.profiles) || !Array.isArray(value.scenarios) || value.profiles.length > 100 || value.scenarios.length > 200) c.fail('Invalid device metadata');
  return { version: 'remote-v1', uptime: Number.isFinite(value.uptime) ? value.uptime : 0,
    performance: Object.fromEntries(['cpuPercent', 'memoryMb', 'eventLoopP95Ms'].map(k => [k, Number.isFinite(value.performance?.[k]) ? value.performance[k] : 0])),
    profiles: value.profiles.map(p => ({ directory: c.text(p.directory, 100), name: c.text(p.name || p.directory, 100),
      extensionConnected: p.extensionConnected === true, running: p.running === true })),
    scenarios: value.scenarios.map(s => {
      if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(s.name) || !Number.isInteger(s.steps) || s.steps < 1 || s.steps > 10000 || !Array.isArray(s.variables) || s.variables.length > 100) c.fail('Invalid scenario metadata');
      return { name: s.name, steps: s.steps, variables: s.variables.map(v => c.text(v, 100)) };
    }) };
}
function snapshot(value, command) {
  if (!c.object(value) || !['running', ...TERMINAL].includes(value.state)) c.fail('Invalid command result');
  return { runId: command.type === 'run' ? command.id : command.payload.runId, state: value.state,
    index: Number.isInteger(value.index) && value.index >= 0 ? value.index : 0,
    total: Number.isInteger(value.total) && value.total >= 0 ? value.total : 0,
    stoppedAtStep: Number.isInteger(value.stoppedAtStep) ? value.stoppedAtStep : null,
    message: typeof value.message === 'string' ? value.message.slice(0, 240) : '',
    steps: Array.isArray(value.steps) ? value.steps.slice(0, 1000).map(s => ({ number: s.number, state: String(s.state).slice(0, 24),
      action: String(s.action).slice(0, 30), label: String(s.label || '').slice(0, 200) })) : [],
    startedAt: Number.isFinite(value.startedAt) ? value.startedAt : null,
    endedAt: Number.isFinite(value.endedAt) ? value.endedAt : null };
}
function createCommandApi(store) {
  function owned(user, id) { const d = store.get('device', c.uuid(id)); if (!d || d.owner !== user.id) c.fail('Device not found', 404); return d; }
  function account(route, method, user, data, url) {
    if (route === '/api/commands' && method === 'GET') {
      const id = url.searchParams.get('device'); owned(user, id);
      return { commands: store.list('command', user.id).filter(v => v.deviceId === id).slice(-200).reverse().map(({ fingerprint, ...v }) => v) };
    }
    if (route !== '/api/commands' || method !== 'POST') c.fail('Not found', 404);
    const d = owned(user, data.deviceId), id = c.uuid(data.requestId), type = data.type;
    if (!['run', 'stop'].includes(type)) c.fail('Unsupported remote command');
    const payload = type === 'run' ? { profile: c.text(data.profile, 100), scenario: c.text(data.scenario, 64), variables: data.variables || {} } : { runId: c.uuid(data.runId) };
    if (!c.object(payload.variables || {})) c.fail('Invalid variables');
    if (type === 'run') {
      payload.variables = Object.fromEntries(Object.keys(payload.variables).sort().map(k => [k, payload.variables[k]]));
      if (JSON.stringify(payload.variables).length > 16000) c.fail('Variables too large');
    }
    const fingerprint = c.hash(JSON.stringify({ deviceId: d.id, type, payload }));
    const previous = store.get('command', id);
    if (previous) {
      if (previous.owner !== user.id || previous.fingerprint !== fingerprint) c.fail('Request ID already used for a different command', 409);
      return { command: previous, duplicate: true };
    }
    if (d.revoked || Date.now() - d.lastSeen >= 45000) c.fail('Device offline or revoked', 409);
    const commands = store.list('command', user.id).filter(v => v.deviceId === d.id);
    if (commands.filter(v => ACTIVE.includes(v.state)).length >= 100) c.fail('Device queue full', 409);
    if (type === 'run') {
      const scenario = d.metadata.scenarios?.find(s => s.name === payload.scenario);
      if (!d.metadata.profiles?.some(p => p.directory === payload.profile) || !scenario) c.fail('Not allowed by local policy', 403);
      if (Object.entries(payload.variables).some(([k, v]) => !scenario.variables.includes(k) || !['string', 'number', 'boolean'].includes(typeof v) || (typeof v === 'number' && !Number.isFinite(v)))) c.fail('Variable is not allowed by local policy', 403);
      if (commands.some(v => v.type === 'run' && v.payload.profile === payload.profile && ACTIVE.includes(v.state))) c.fail('A remote run is already pending on this profile', 409);
    } else {
      const run = store.get('command', payload.runId);
      if (!run || run.owner !== user.id || run.deviceId !== d.id || run.type !== 'run') c.fail('Remote run not found', 404);
    }
    const command = { id, owner: user.id, deviceId: d.id, type, payload, fingerprint, state: 'queued', created: Date.now(),
      expires: Date.now() + 300000, deliveryUntil: 0, seq: 0, result: null };
    store.transaction(() => {
      if (type === 'stop') {
        const run = store.get('command', payload.runId);
        if (run.state === 'queued') { run.state = 'cancelled'; run.updated = Date.now(); store.put('command', run, user.id); command.state = 'succeeded'; }
      }
      store.put('command', command, user.id);
    });
    return { command };
  }
  function device(route, d, data) {
    if (route !== '/device/exchange') c.fail('Not found', 404);
    c.uuid(data.instanceId);
    const now = Date.now();
    if (d.instanceId && d.instanceId !== data.instanceId && d.leaseUntil > now) c.fail('Another agent instance holds this device lease', 409);
    if (!Array.isArray(data.reports) || data.reports.length > 20) c.fail('Invalid reports');
    const meta = metadata(data.metadata), ack = [];
    return store.transaction(() => {
      for (const report of data.reports) {
        const cmd = store.get('command', c.uuid(report.id));
        if (!cmd || cmd.deviceId !== d.id || cmd.owner !== d.owner || !Number.isSafeInteger(report.seq) || report.seq < 1) c.fail('Invalid command receipt');
        if (report.seq > cmd.seq) {
          const result = snapshot(report.result, cmd);
          // Terminal receipts cannot regress on a late/replayed progress update.
          if (!TERMINAL.includes(cmd.state) || cmd.state === 'unknown') { cmd.result = result; cmd.state = result.state; cmd.updated = now; }
          cmd.seq = report.seq; store.put('command', cmd, d.owner);
        }
        ack.push({ id: cmd.id, seq: report.seq });
      }
      Object.assign(d, { metadata: meta, lastSeen: now, instanceId: data.instanceId, leaseUntil: now + 35000 }); store.put('device', d, d.owner);
      const commands = store.list('command', d.owner).filter(v => v.deviceId === d.id);
      for (const cmd of commands) if (['queued', 'dispatched'].includes(cmd.state) && cmd.expires < now) {
        cmd.state = cmd.state === 'queued' ? 'expired' : 'unknown'; cmd.updated = now; store.put('command', cmd, d.owner);
      }
      const next = commands.filter(cmd => ['queued', 'dispatched'].includes(cmd.state) && cmd.expires >= now && cmd.deliveryUntil <= now)
        .sort((a, b) => (a.type === 'stop' ? 0 : 1) - (b.type === 'stop' ? 0 : 1) || a.created - b.created)[0];
      if (next) { next.state = 'dispatched'; next.deliveryUntil = now + 10000; store.put('command', next, d.owner); }
      return { ack, command: next ? { id: next.id, type: next.type, payload: next.payload, expires: next.expires } : null, serverTime: now };
    });
  }
  return { account, device };
}
module.exports = { createCommandApi, metadata, snapshot };
