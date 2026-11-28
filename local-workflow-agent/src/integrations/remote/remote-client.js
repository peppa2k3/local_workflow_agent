const { collectPrompts, applyDecisions } = require('./confirmations');
const path = require('node:path');
const c = require('../../../shared/remote-protocol');
const { randomUUID } = require('node:crypto');
const { createRemoteExecutor } = require('./remote-executor');
const { assignmentConfig } = require('../../workflow/scenario-store');
const { clipTargets } = require('../../workflow/clip-library');
function createRemoteClient({ dataDir, profiles, scenarios, workflows, localTasks, network, scanActivity, performance = () => ({}) , allowHttp = false }) {
  const file = path.join(dataDir, 'remote.json');
  let config = c.readJson(file, { policy: { profiles: [], scenarios: [], variables: {} } });
  let pendingBusy = false, actionBusy = false, closed = false, timer, error = '', lastContact = 0;
  const abort = new AbortController();
  const instanceId = randomUUID();
  const dashboardPrompts = require('./dashboard-prompts').createDashboardPrompts();
  const executor = createRemoteExecutor({ dataDir, workflows, scenarios, getPolicy: () => config.policy, localTasks });
  let failures = 0, nextAttempt = 0;
  const save = () => c.atomicJson(file, config);
  const request = (route, data, secret) => c.post(config.url, route, data, secret, { allowHttp, signal: abort.signal });
  const { createSchedulePopups } = require('../chrome/schedule-popup');
  const schedulePopups = createSchedulePopups((task, proceed) =>
    request('/device/schedule-decision', { id: config.device.id, instanceId, runId: task.id, proceed }, config.token));
  let activitySeq = 0;
  function activitySnapshot() {
    const policy = config.policy, active = [];
    let free = false, browserReady = false, runningCount = 0;
    for (const p of profiles()) {
      const state = workflows.status(p.directory);
      if (state.running) runningCount++;
      if (!policy.profiles.includes(p.directory)) continue;
      if (!state.running) {
        free = true;
        if (state.extensionConnected) browserReady = true;
      }
      if (state.running && state.executionId && policy.scenarios.includes(state.scenario)) {
        active.push({ id:state.executionId, profile:p.directory, scenario:state.scenario, remote:state.remote === true });
      }
    }
    const canAccept = free && policy.scenarios.some(name => {
      try {
        const { steps } = scenarios.load(name);
        return steps.length > 0 && (browserReady || steps.every(step => ['downloadVideo','wait','openFolder'].includes(step.action)));
      } catch { return false; }
    });
    return { seq:++activitySeq, updatedAt:Date.now(), ...scanActivity(), runningCount, active, canAccept };
  }
  function activityChanged() {
    if (!config.device || closed || !scanActivity) return;
    // Sequence numbers order concurrent event notifications against the periodic snapshot.
    try {
      const data = { id:config.device.id, instanceId, activity:activitySnapshot() };
      void request('/device/activity',data,config.token).catch(() => {});
    } catch { /* A transient local read failure is retried by the next heartbeat. */ }
  }
  function status() {
    return { configured: !!config.device, url: config.url || '', device: config.device || null, policy: config.policy, error, lastContact,
      connected: !!config.device && Date.now() - lastContact < 45000 && !error,
      pending: config.pending ? { id: config.pending.id, code: config.pending.code, expires: config.pending.expires,
        email: config.pending.email || null, claim: config.pending.claim || null, state: config.pending.state || 'waiting' } : null,
      available: { profiles: profiles().map(p => ({ directory: p.directory, name: p.name })), scenarios: scenarios.list().flatMap(name => {
        try { return [{ name, variables: Object.keys(scenarios.load(name).variables || {}) }]; } catch { return []; }
      }) } };
  }
  async function tick() {
    if (closed || pendingBusy || actionBusy || Date.now() < nextAttempt) return;
    if (!config.device) schedulePopups.sync([]);
    pendingBusy = true;
    try {
      if (config.pending) {
        if (config.pending.expires < Date.now()) { delete config.pending; save(); }
        else { const p = config.pending; const state = await request('/device/pair-status', { id: p.id }, p.pollToken);
          Object.assign(p, { email: state.email, claim: state.claim, state: state.state }); save(); }
      }
      if (config.device) {
        const policy = config.policy;
        let clipBudget = 12000, targetBudget = 12000;
        executor.stopOwned(config.device.id, policy);
        if (network) await network.sample();
        if (closed) return;
        const knownProfiles = profiles().filter(p => policy.profiles.includes(p.directory));
        const metadata = { uptime: Math.floor(process.uptime()), performance: { ...performance(), ...network?.get() },
          profiles: knownProfiles.map(p => ({ directory: p.directory, name: p.name, ...Object.fromEntries(
            ['running', 'extensionConnected'].map(k => [k, workflows.status(p.directory)[k]])) })),
          scenarios: policy.scenarios.flatMap(name => {
            try {
              const s = scenarios.load(name), variables = (policy.variables[name] || []).filter(v => Object.hasOwn(s.variables || {}, v));
              const entry = { name, steps: s.steps.length, variables };
              const { thu_muc_tai, reels_url } = s.variables || {};
              const target = {};
              if (typeof thu_muc_tai === 'string' && thu_muc_tai.length <= 1024 && path.win32.isAbsolute(thu_muc_tai))
                target.thu_muc_tai = thu_muc_tai;
              if (typeof reels_url === 'string' && /^https?:\/\//.test(reels_url) && reels_url.length <= 2048)
                target.reels_url = reels_url;
              if (Object.keys(target).length) {
                const bytes = Buffer.byteLength(JSON.stringify(target)) + 20;
                if (bytes <= targetBudget) { entry.libraryTarget = target; targetBudget -= bytes; }
              }
              if (entry.libraryTarget || variables.some(key=>['video_url','ten_phim','ten_file'].includes(key))) {
                const a = { ...assignmentConfig(s), id: s.scenario_id ?? name, profile: s.profile || '',
                  browser: s.steps.some(step => !['downloadVideo','wait','openFolder'].includes(step.action)) };
                const bytes = Buffer.byteLength(JSON.stringify(a)) + 20;
                if (bytes <= targetBudget) { entry.assignment = a; targetBudget -= bytes; }
              }
              if (policy.clipScenarios?.includes(name)) {
                try {
                  const targets = clipTargets(s), foldersByVariable = new Map();
                  for (const { variable, directory } of targets) {
                    if (!variables.includes(variable)) continue;
                    if (!foldersByVariable.has(variable)) foldersByVariable.set(variable, new Set());
                    foldersByVariable.get(variable).add(directory);
                  }
                  entry.clipTargets = targets.flatMap(({ id, index, action, variable }) => {
                    const target = { id, index, action, variable: foldersByVariable.get(variable)?.size === 1 ? variable : undefined };
                    clipBudget -= Buffer.byteLength(JSON.stringify(target)) + 1;
                    return clipBudget >= 0 ? [target] : [];
                  });
                } catch { /* An unfinished scenario remains visible without clip targets. */ }
              }
              return [entry];
            } catch { return []; }
          }) };
        const reports = executor.reports(config.device.id);
        const exchange = { id: config.device.id, instanceId, metadata, reports, ...(scanActivity && {activity:activitySnapshot()}) };
        const pairedId = config.device.id;
        const prompts = collectPrompts(dashboardPrompts.snapshot(pairedId), knownProfiles, workflows, policy, exchange);
        exchange.prompts = prompts;
        if (localTasks) {
          const tasks = localTasks.snapshot({ profiles: knownProfiles.map(p => p.directory), scenarios: metadata.scenarios.map(s => s.name) });
          let budget = 127000 - Buffer.byteLength(JSON.stringify(exchange));
          const visible = [];
          for (const task of tasks) {
            budget -= Buffer.byteLength(JSON.stringify(task)) + 1;
            if (budget < 0) break;
            visible.push(task);
          }
          exchange.localTasks = { tasks: visible, omitted: tasks.length - visible.length };
        }
        const response = await request('/device/exchange', exchange, config.token);
        if (closed) return;
        schedulePopups.sync((response.schedulePrompts || []).map(task => ({
          ...task, confirmBy: Date.now() + task.confirmBy - response.serverTime
        })));
        executor.acknowledge(response.ack);
        if (response.command) await executor.execute(response.command, config.device.id);
        applyDecisions(response.promptDecisions, prompts, workflows, config.policy, dashboardPrompts);
        executor.confirmDownloads(response.downloadDecisions, config.device.id);
        lastContact = Date.now();
      }
      error = ''; failures = 0; nextAttempt = 0;
    } catch (e) {
      error = e.status ? e.message : 'Không kết nối được VPS; sẽ thử lại';
      if (config.device && [401, 410].includes(e.status)) { executor.stopOwned(config.device.id); delete config.device; delete config.token; save(); }
      nextAttempt = Date.now() + Math.min(60000, 3000 * 2 ** Math.min(++failures, 5)) + Math.random() * 500;
    }
    finally { pendingBusy = false; }
  }
  function setPolicy(value) {
    if (!c.object(value) || !Array.isArray(value.profiles) || !Array.isArray(value.scenarios) || !c.object(value.variables || {})
      || value.profiles.length > 100 || value.scenarios.length > 200 || Buffer.byteLength(JSON.stringify(value)) > 30000) c.fail('Invalid or oversized local policy');
    const knownProfiles = profiles().map(p => p.directory), knownScenarios = scenarios.list();
    if (value.profiles.some(p => !knownProfiles.includes(p)) || value.scenarios.some(s => !knownScenarios.includes(s))) c.fail('Unknown profile or scenario');
    const clipScenarios = value.clipScenarios ?? [];
    if (!Array.isArray(clipScenarios) || clipScenarios.some(name => !value.scenarios.includes(name))) c.fail('Unknown clip scenario in local policy');
    const variables = {};
    for (const name of value.scenarios) {
      const names = value.variables?.[name] || [];
      if (!Array.isArray(names) || names.length > 100 || names.some(v => typeof v !== 'string' || v.length > 100 || !Object.hasOwn(scenarios.load(name).variables || {}, v))) c.fail('Unknown variable in local policy');
      variables[name] = [...new Set(names)];
    }
    config.policy = { profiles: [...new Set(value.profiles)], scenarios: [...new Set(value.scenarios)], variables,
      clipScenarios: [...new Set(clipScenarios)] }; save();
    if (config.device) executor.stopOwned(config.device.id, config.policy);
  }
  async function action(route, data, response) {
    if (route === 'prompt-open') return dashboardPrompts.open(c.uuid(data.id), c.text(data.message, 2048), config.device?.id, response);
    if (route === 'prompt-answer') {
      if (!dashboardPrompts.decide(c.uuid(data.id), data.proceed)) c.fail('Confirmation unavailable', 409);
      return { ok: true };
    }
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
      if (previous.device) executor.stopOwned(previous.device.id);
      config = { policy: previous.policy }; save();
      if (previous.device) {
        try { await c.post(previous.url, '/device/revoke', { id: previous.device.id }, previous.token, { allowHttp, signal: abort.signal }); }
        catch { error = 'Đã ngắt local. VPS chưa nhận revoke; có thể thu hồi thêm trên web VPS.'; }
      }
    } else c.fail('Not found', 404);
    return status();
  }
  timer = setInterval(() => { void tick(); }, 3000); timer.unref();
  return { status, activityChanged, sharesConfirmations(profile, scenario) {
    return Boolean(config.device && config.policy.profiles.includes(profile) && config.policy.scenarios.includes(scenario));
  }, submitScanner(payload) {
    if (!config.device) throw Error('Chưa ghép nối Control Server.');
    return request('/api/scanner/videos', { ...payload, id: config.device.id }, config.token);
  }, async action(route, data, response) {
    if (route === 'prompt-open' || route === 'prompt-answer') return action(route, data, response);
    if (closed || pendingBusy || actionBusy) c.fail('Connection update in progress; retry shortly', 409);
    actionBusy = true;
    try { return await action(route, data); } finally { actionBusy = false; }
  }, tick, close() { closed = true; schedulePopups.sync([]); clearInterval(timer); abort.abort(); } };
}
module.exports = { createRemoteClient };
