const path = require('node:path');
const c = require('../remote/common');
function createRemoteClient({ dataDir, profiles, scenarios, workflows, performance = () => ({}) , allowHttp = false }) {
  const file = path.join(dataDir, 'remote.json');
  let config = c.readJson(file, { policy: { profiles: [], scenarios: [], variables: {} } });
  let pendingBusy = false, actionBusy = false, closed = false, timer, error = '', lastContact = 0;
  const abort = new AbortController();
  const save = () => c.atomicJson(file, config);
  const request = (route, data, secret) => c.post(config.url, route, data, secret, { allowHttp, signal: abort.signal });
  function status() {
    return { configured: !!config.device, url: config.url || '', device: config.device || null, policy: config.policy, error, lastContact,
      pending: config.pending ? { id: config.pending.id, code: config.pending.code, expires: config.pending.expires,
        email: config.pending.email || null, claim: config.pending.claim || null, state: config.pending.state || 'waiting' } : null,
      available: { profiles: profiles().map(p => ({ directory: p.directory, name: p.name })), scenarios: scenarios.list().map(name => ({ name, variables: Object.keys(scenarios.load(name).variables || {}) })) } };
  }
  async function tick() {
    if (closed || pendingBusy || actionBusy) return;
    pendingBusy = true;
    try {
      if (config.pending) {
        if (config.pending.expires < Date.now()) { delete config.pending; save(); }
        else { const p = config.pending; const state = await request('/device/pair-status', { id: p.id }, p.pollToken);
          Object.assign(p, { email: state.email, claim: state.claim, state: state.state }); save(); }
      }
      error = '';
    } catch (e) { error = e.status ? e.message : 'Không kết nối được VPS; sẽ thử lại'; }
    finally { pendingBusy = false; }
  }
  function setPolicy(value) {
    if (!c.object(value) || !Array.isArray(value.profiles) || !Array.isArray(value.scenarios) || !c.object(value.variables || {})) c.fail('Invalid local policy');
    const knownProfiles = profiles().map(p => p.directory), knownScenarios = scenarios.list();
    if (value.profiles.some(p => !knownProfiles.includes(p)) || value.scenarios.some(s => !knownScenarios.includes(s))) c.fail('Unknown profile or scenario');
    const variables = {};
    for (const name of value.scenarios) {
      const names = value.variables?.[name] || [];
      if (!Array.isArray(names) || names.some(v => !Object.hasOwn(scenarios.load(name).variables || {}, v))) c.fail('Unknown variable in local policy');
      variables[name] = [...new Set(names)];
    }
    config.policy = { profiles: [...new Set(value.profiles)], scenarios: [...new Set(value.scenarios)], variables }; save();
  }
  async function action(route, data) {
    if (route === 'policy') setPolicy(data);
    else if (route === 'pair-start') {
      if (config.device || config.pending) c.fail('Disconnect/cancel the existing connection first', 409);
      const url = c.baseUrl(data.url, allowHttp), pollToken = c.token(), deviceToken = c.token();
      const pair = await c.post(url, '/device/pair-start', { name: c.text(data.name, 80), pollToken, deviceToken }, null, { allowHttp, signal: abort.signal });
      c.uuid(pair.id); config.url = url; config.pending = { ...pair, pollToken, deviceToken }; save();
    } else if (route === 'pair-approve') {
      if (!config.pending?.claim || !c.equal(config.pending.claim, data.claim)) c.fail('Review the current account before approving', 409);
      const p = config.pending;
      const device = await request('/device/pair-approve', { id: p.id, claim: data.claim }, p.pollToken);
      config.device = { id: c.uuid(device.id), email: device.email }; config.token = p.deviceToken; delete config.pending; save();
    } else if (route === 'disconnect') {
      const previous = config;
      config = { policy: previous.policy }; save();
      if (previous.device) {
        try { await c.post(previous.url, '/device/revoke', { id: previous.device.id }, previous.token, { allowHttp, signal: abort.signal }); }
        catch { error = 'Đã ngắt local. VPS chưa nhận revoke; có thể thu hồi thêm trên web VPS.'; }
      }
    } else c.fail('Not found', 404);
    return status();
  }
  timer = setInterval(() => { void tick(); }, 3000); timer.unref();
  return { status, async action(route, data) {
    if (closed || pendingBusy || actionBusy) c.fail('Connection update in progress; retry shortly', 409);
    actionBusy = true;
    try { return await action(route, data); } finally { actionBusy = false; }
  }, tick, close() { closed = true; clearInterval(timer); abort.abort(); } };
}
module.exports = { createRemoteClient };
