const c = require('../shared/remote-protocol');
const { linkRun } = require('./video-library');
const assignment = require('./assignment');
const { ACTIVE, SCHEDULE_STATES, RESERVED, createCommand } = require('./command-record');
const TERMINAL = ['succeeded', 'failed', 'cancelled', 'interrupted', 'rejected', 'unknown', 'expired'];
const clipTargetId = id => typeof id === 'string' && /^[a-f0-9]{64}$/.test(id);
const clipName = name => typeof name === 'string' && name.length <= 255 &&
  !/[\\/:\u0000-\u001f]/.test(name) && /\.(mp4|m4v|mov|webm|mkv|avi|mpeg|mpg|ts|wmv|3gp|flv)$/i.test(name);
function validateTime(time) {
  if (!Number.isSafeInteger(time) || !Number.isFinite(new Date(time).getTime())) c.fail('Invalid schedule time');
}
function metadata(value) {
  if (!c.object(value) || !Array.isArray(value.profiles) || !Array.isArray(value.scenarios) || value.profiles.length > 100 || value.scenarios.length > 200) c.fail('Invalid device metadata');
  return { version: 'remote-v1', uptime: Number.isFinite(value.uptime) ? value.uptime : 0,
    performance: Object.fromEntries(['cpuPercent', 'memoryMb', 'eventLoopP95Ms'].map(k => [k, Number.isFinite(value.performance?.[k]) ? value.performance[k] : 0])),
    network: Object.fromEntries(['downloadMbps', 'uploadMbps'].filter(k => Number.isFinite(value.performance?.[k]) && value.performance[k] >= 0)
      .map(k => [k, value.performance[k]])),
    profiles: value.profiles.map(p => ({ directory: c.text(p.directory, 100), name: c.text(p.name || p.directory, 100),
      extensionConnected: p.extensionConnected === true, running: p.running === true })),
    scenarios: value.scenarios.map(s => {
      if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(s.name) || !Number.isInteger(s.steps) || s.steps < 1 || s.steps > 10000 || !Array.isArray(s.variables) || s.variables.length > 100) c.fail('Invalid scenario metadata');
      const scenario = { name: s.name, steps: s.steps, variables: s.variables.map(v => c.text(v, 100)) };
      if (s.libraryTarget) {
        const folder = c.text(s.libraryTarget.thu_muc_tai,1024), target = c.text(s.libraryTarget.reels_url,2048);
        let url;
        try { url = new URL(target); } catch {}
        if (require('node:path').win32.isAbsolute(folder) && url && ['https:','http:'].includes(url.protocol) && !url.username && !url.password)
          scenario.libraryTarget = { thu_muc_tai:folder, reels_url:target };
      }
      const a = s.assignment;
      if (scenario.libraryTarget && a && Array.isArray(a.topics) && a.topics.length <= 64 &&
          a.topics.every(t => typeof t === 'string' && /^[a-z0-9_-]{1,64}$/.test(t)) &&
          (a.id === undefined || (typeof a.id === 'string' && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(a.id))) && Number.isSafeInteger(a.priority) && typeof a.browser === 'boolean' &&
          (a.profile === '' || value.profiles.some(p => p.directory === a.profile))) {
        scenario.assignment = { id: a.id ?? s.name, topics: [...new Set(a.topics)], priority: a.priority, browser: a.browser, profile: a.profile };
      }
      if (Array.isArray(s.clipTargets)) scenario.clipTargets = s.clipTargets.slice(0, 150)
        .filter(t => c.object(t) && clipTargetId(t.id) && Number.isInteger(t.index) && t.index >= 0 && t.index < s.steps && ['upload', 'downloadVideo'].includes(t.action))
        .map(({ id, index, action, variable }) => ({ id, index, action, variable: scenario.variables.includes(variable) ? variable : undefined }));
      return scenario;
    }) };
}
function localTaskSnapshot(value, meta) {
  if (value === undefined) return null;
  if (!c.object(value) || !Array.isArray(value.tasks) || !Number.isSafeInteger(value.omitted) || value.omitted < 0) c.fail('Invalid local tasks');
  const ids = new Set();
  const tasks = value.tasks.map(task => {
    if (!c.object(task)) c.fail('Invalid local task');
    const { profile, scenario, state } = task;
    const id = c.uuid(task.id);
    if (ids.has(id) || !meta.profiles.some(p => p.directory === profile) || !meta.scenarios.some(s => s.name === scenario)) c.fail('Invalid local task');
    ids.add(id);
    if (state === 'running') {
      const { index, total, startedAt } = task;
      if (!Number.isInteger(index) || index < 0 || !Number.isInteger(total) || total < 1 || index > total) c.fail('Invalid local progress');
      validateTime(startedAt);
      return { id, profile, scenario, state, index, total, startedAt };
    }
    if (!['scheduled', 'confirming'].includes(state)) c.fail('Invalid local task state');
    validateTime(task.scheduledAt);
    if (state === 'confirming') validateTime(task.confirmBy);
    return { id, profile, scenario, state, scheduledAt: task.scheduledAt, ...(state === 'confirming' && { confirmBy: task.confirmBy }) };
  });
  return { tasks, omitted: value.omitted };
}
function snapshot(value, command) {
  if (!c.object(value) || !['running', ...TERMINAL].includes(value.state)) c.fail('Invalid command result');
  if (command.type === 'browseClips') return { state: value.state,
    message: typeof value.message === 'string' ? value.message.slice(0, 240) : '',
    ...(value.state === 'succeeded' ? { clips: {
      names: Array.isArray(value.clips?.names) ? value.clips.names.slice(0, 60).filter(clipName) : [],
      more: value.clips?.more === true
    } } : {}) };
  const pending = command.type === 'run' && value.state === 'running' && value.confirmation;
  let confirmation;
  if (pending) {
    if (!c.object(pending) || !Number.isSafeInteger(pending.step) || pending.step < 1 ||
      !Number.isSafeInteger(pending.expiresAt)) c.fail('Invalid download confirmation');
    confirmation = { id: c.uuid(pending.id), step: pending.step, name: c.text(pending.name, 255), filePath: c.text(pending.filePath, 32767),
      expiresAt: pending.expiresAt, reused: pending.reused === true, duplicate: pending.duplicate === true };
  }
  return { runId: command.type === 'run' ? command.id : command.payload.runId, state: value.state,
    ...(confirmation && { confirmation }),
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
  function expire(owner, deviceId) {
    const commands = store.list('command', owner).filter(v => v.deviceId === deviceId), now = Date.now();
    for (const cmd of commands) if (['queued', 'dispatched'].includes(cmd.state) && cmd.expires < now) {
      cmd.state = cmd.state === 'queued' ? 'expired' : 'unknown'; cmd.updated = now; store.put('command', cmd, owner);
    }
    return commands;
  }
  function owned(user, id) { const d = store.get('device', c.uuid(id)); if (!d || d.owner !== user.id) c.fail('Device not found', 404); return d; }
  function scheduleDecision(d, data) {
    const cmd = store.get('command', c.uuid(data.runId));
    if (!cmd || cmd.owner !== d.owner || cmd.deviceId !== d.id) c.fail('Schedule not found', 404);
    if (data.scheduledAt !== undefined) {
      if (d.revoked || cmd.state !== 'scheduled') c.fail('Chỉ có thể đổi giờ của lịch đang chờ.', 409);
      validateTime(data.scheduledAt);
      if (data.scheduledAt < Math.floor(Date.now() / 60000) * 60000) c.fail('Chọn phút hiện tại hoặc tương lai.');
      cmd.payload.scheduledAt = data.scheduledAt;
      store.put('command', cmd, d.owner);
      return { ok: true };
    }
    if (d.revoked || typeof data.proceed !== 'boolean' ||
        !(cmd.state === 'scheduled' && !data.proceed || cmd.state === 'confirming' && Date.now() < cmd.confirmBy)) c.fail('Lịch đã thay đổi hoặc hết hạn xác nhận.', 409);
    cmd.state = data.proceed ? 'approved' : 'cancelled';
    store.put('command', cmd, d.owner);
    return { ok: true };
  }
  function account(route, method, user, data, url) {
    if (route === '/api/scanner/assignment') {
      if (method === 'GET') return assignment.settings(store, user.id);
      if (method === 'POST') return store.transaction(() => {
        const rule = assignment.configure(store, user.id, data);
        assignment.allocate(store, user.id, Date.now());
        return rule;
      });
    }
    if (route === '/api/schedule-decision' && method === 'POST') return scheduleDecision(owned(user, data.deviceId), data);
    if (route === '/api/download-confirmation' && method === 'POST') {
      const d = owned(user, data.deviceId), id = c.uuid(data.id);
      const run = store.get('command', c.uuid(data.runId));
      if (run?.owner !== user.id || run.deviceId !== d.id || run.type !== 'run') c.fail('Remote run not found', 404);
      if (typeof data.proceed !== 'boolean') c.fail('Invalid download decision');
      const confirmation = run.result?.confirmation;
      if (d.revoked || run.state !== 'running' || confirmation?.id !== id) c.fail('Xác nhận tải video đã hết hiệu lực.', 409);
      if (run.downloadDecision?.id === id) {
        if (run.downloadDecision.proceed !== data.proceed) c.fail('Đã gửi quyết định tải video.', 409);
        return { ok: true };
      }
      if (Date.now() >= confirmation.expiresAt) c.fail('Đã hết thời gian xác nhận tải video.', 409);
      run.downloadDecision = { id, proceed: data.proceed };
      store.put('command', run, user.id);
      return { ok: true };
    }
    if (route === '/api/commands' && method === 'GET') {
      const id = url.searchParams.get('device'); owned(user, id);
      const requestId = url.searchParams.get('request');
      const commands = expire(user.id, id);
      return { commands: commands.filter(v => requestId ? v.id === requestId : v.type !== 'browseClips')
        .filter((cmd, index, list) => SCHEDULE_STATES.includes(cmd.state) || index >= list.length - 200).reverse().map(({ fingerprint, ...v }) => v) };
    }
    if (route !== '/api/commands' || method !== 'POST') c.fail('Not found', 404);
    const d = owned(user, data.deviceId), id = c.uuid(data.requestId), type = data.type;
    if (!['run', 'stop', 'browseClips', 'manageLocalTask'].includes(type)) c.fail('Unsupported remote command');
    let payload;
    if (type === 'run') payload = { profile: c.text(data.profile, 100), scenario: c.text(data.scenario, 64), variables: data.variables || {} };
    else if (type === 'stop') payload = { runId: c.uuid(data.runId) };
    else if (type === 'manageLocalTask') {
      if (!['stop', 'reschedule', 'cancel', 'confirm'].includes(data.action)) c.fail('Invalid local task action');
      payload = { taskId: c.uuid(data.taskId), action: data.action,
        profile: c.text(data.profile, 100), scenario: c.text(data.scenario, 64) };
      if (data.action !== 'stop') {
        validateTime(data.expectedTime);
        payload.expectedTime = data.expectedTime;
      }
      if (data.action === 'reschedule') {
        validateTime(data.scheduledAt);
        payload.scheduledAt = data.scheduledAt;
      }
    } else {
      if (!clipTargetId(data.target) || typeof data.query !== 'string' || data.query.length > 255) c.fail('Invalid clip search');
      payload = { scenario: c.text(data.scenario, 64), target: data.target, query: data.query };
    }
    if (!c.object(payload.variables || {})) c.fail('Invalid variables');
    if (type === 'run') {
      if (data.scheduledAt !== undefined) {
        validateTime(data.scheduledAt);
        payload.scheduledAt = data.scheduledAt;
      }
      payload.variables = Object.fromEntries(Object.keys(payload.variables).sort().map(k => [k, payload.variables[k]]));
      if (JSON.stringify(payload.variables).length > 16000) c.fail('Variables too large');
      if (data.clips !== undefined) {
        if (!c.object(data.clips) || Object.keys(data.clips).length > 30 || Object.entries(data.clips).some(([id, name]) => !clipTargetId(id) || !clipName(name))) c.fail('Invalid clip selections');
        if (Object.keys(data.clips).length) payload.clips = Object.fromEntries(Object.entries(data.clips).sort(([a], [b]) => a.localeCompare(b)));
      }
    }
    const command = createCommand(id, user.id, d.id, type, payload);
    expire(user.id, d.id);
    const previous = store.get('command', id);
    if (previous) {
      if (previous.owner !== user.id || previous.fingerprint !== command.fingerprint) c.fail('Request ID already used for a different command', 409);
      return { command: previous, duplicate: true };
    }
    if (payload.scheduledAt !== undefined && payload.scheduledAt < Math.floor(Date.now() / 60000) * 60000) c.fail('Chọn phút hiện tại hoặc tương lai.');
    if (d.revoked || (!payload.scheduledAt && Date.now() - d.lastSeen >= 45000)) c.fail('Device offline or revoked', 409);
    const commands = store.list('command', user.id).filter(v => v.deviceId === d.id);
    if (commands.filter(v => ACTIVE.includes(v.state) || SCHEDULE_STATES.includes(v.state)).length >= 100) c.fail('Device queue full', 409);
    if (type === 'manageLocalTask') {
      const task = d.localTasks?.tasks.find(task => task.id === payload.taskId);
      if (!task || task.profile !== payload.profile || task.scenario !== payload.scenario ||
          (payload.action === 'stop' ? task.state !== 'running' : task.scheduledAt !== payload.expectedTime)) c.fail('Tác vụ local đã thay đổi.', 409);
      const confirming = task.state === 'confirming' && task.confirmBy > Date.now();
      if (payload.action === 'reschedule' && task.state !== 'scheduled' ||
          payload.action === 'confirm' && !confirming ||
          payload.action === 'cancel' && task.state !== 'scheduled' && !confirming) c.fail('Lịch local đã thay đổi.', 409);
      if (payload.action === 'reschedule' && payload.scheduledAt < Math.floor(Date.now() / 60000) * 60000) c.fail('Chọn phút hiện tại hoặc tương lai.');
    } else if (type === 'run') {
      const scenario = d.metadata.scenarios?.find(s => s.name === payload.scenario);
      if (!d.metadata.profiles?.some(p => p.directory === payload.profile) || !scenario) c.fail('Not allowed by local policy', 403);
      if (Object.entries(payload.variables).some(([k, v]) => !scenario.variables.includes(k) || !['string', 'number', 'boolean'].includes(typeof v) || (typeof v === 'number' && !Number.isFinite(v)))) c.fail('Variable is not allowed by local policy', 403);
      if (Object.keys(payload.clips || {}).some(id => !scenario.clipTargets?.some(t => t.id === id))) c.fail('Clip target is not allowed by local policy', 403);
      if (Object.entries(payload.variables).some(([name, value]) => typeof value === 'string' && value.startsWith('clip:') &&
        (!clipName(value.slice(5)) || !scenario.clipTargets?.some(t => t.variable === name)))) c.fail('Clip variable is not allowed by local policy', 403);
      if (!payload.scheduledAt && commands.some(v => v.type === 'run' && v.payload.profile === payload.profile && RESERVED.includes(v.state))) c.fail('A remote run is already pending on this profile', 409);
    } else if (type === 'browseClips') {
      if (!d.metadata.scenarios?.find(s => s.name === payload.scenario)?.clipTargets?.some(t => t.id === payload.target)) c.fail('Clip target is not allowed by local policy', 403);
    } else {
      const run = store.get('command', payload.runId);
      if (!run || run.owner !== user.id || run.deviceId !== d.id || run.type !== 'run') c.fail('Remote run not found', 404);
    }
    store.transaction(() => {
      if (type === 'stop') {
        const run = store.get('command', payload.runId);
        if (run.state === 'queued' || SCHEDULE_STATES.includes(run.state)) { run.state = 'cancelled'; run.updated = Date.now(); store.put('command', run, user.id); command.state = 'succeeded'; }
      }
      linkRun(store, command);
      store.put('command', command, user.id);
    });
    return { command };
  }
  function recordActivity(d, data) {
    const a = data.activity;
    if (a === undefined) {
      if (d.instanceId !== data.instanceId) delete d.activity;
      return;
    }
    if (!c.object(a) || !Number.isSafeInteger(a.seq) || a.seq < 1 || !Number.isSafeInteger(a.updatedAt) ||
        !Number.isSafeInteger(a.runningCount) || a.runningCount < 0 || !Array.isArray(a.active) ||
        a.active.length > 100 || a.active.length > a.runningCount ||
        !['canAccept','enabled','scanning'].every(k=>typeof a[k] === 'boolean')) c.fail('Invalid activity snapshot');
    if (d.instanceId === data.instanceId && d.activity?.seq >= a.seq) return;
    d.activity = {seq:a.seq,updatedAt:a.updatedAt, runningCount:a.runningCount,canAccept:a.canAccept,enabled:a.enabled,scanning:a.scanning,
      active:a.active.map(run=>({id:c.uuid(run.id), profile:c.text(run.profile,100), scenario:c.text(run.scenario,64), remote:run.remote === true}))};
  }
  function device(route, d, data) {
    if (route === '/device/activity') {
      if (c.uuid(data.instanceId) !== d.instanceId || d.leaseUntil <= Date.now()) c.fail('Device lease expired',409);
      recordActivity(d,data); store.put('device',d,d.owner);
      return { ok:true };
    }
    if (route === '/device/schedule-decision') {
      if (d.instanceId !== c.uuid(data.instanceId) || d.leaseUntil <= Date.now()) c.fail('Device lease expired', 409);
      return scheduleDecision(d, { runId: data.runId, proceed: data.proceed });
    }
    if (route !== '/device/exchange') c.fail('Not found', 404);
    c.uuid(data.instanceId);
    const now = Date.now();
    if (d.instanceId && d.instanceId !== data.instanceId && d.leaseUntil > now) c.fail('Another agent instance holds this device lease', 409);
    if (!Array.isArray(data.reports) || data.reports.length > 20) c.fail('Invalid reports');
    const meta = metadata(data.metadata), ack = [];
    const localTasks = localTaskSnapshot(data.localTasks, meta);
    return store.transaction(() => {
      for (const report of data.reports) {
        const cmd = store.get('command', c.uuid(report.id));
        if (!cmd || cmd.deviceId !== d.id || cmd.owner !== d.owner || !Number.isSafeInteger(report.seq) || report.seq < 1) c.fail('Invalid command receipt');
        if (report.seq > cmd.seq) {
          const result = snapshot(report.result, cmd);
          // Terminal receipts cannot regress on a late/replayed progress update.
          if (!TERMINAL.includes(cmd.state) || cmd.state === 'unknown') {
            cmd.result = result; cmd.state = result.state; cmd.updated = now;
            if (cmd.downloadDecision?.id !== result.confirmation?.id) delete cmd.downloadDecision;
          }
          assignment.recordResult(store, cmd, now);
          cmd.seq = report.seq; store.put('command', cmd, d.owner);
        }
        ack.push({ id: cmd.id, seq: report.seq });
      }
      recordActivity(d,data);
      Object.assign(d, { metadata: meta, localTasks, lastSeen: now, instanceId: data.instanceId, leaseUntil: now + 35000 }); store.put('device', d, d.owner);
      const commands = expire(d.owner, d.id);
      const reserved = new Set(commands.filter(cmd => cmd.type === 'run' && RESERVED.includes(cmd.state)).map(cmd => cmd.payload.profile));
      const schedules = commands.filter(cmd => SCHEDULE_STATES.includes(cmd.state)).sort((a, b) => a.payload.scheduledAt - b.payload.scheduledAt);
      for (const cmd of schedules) {
        if (cmd.state === 'scheduled' && cmd.payload.scheduledAt <= now && !reserved.has(cmd.payload.profile) &&
            !meta.profiles.some(p => p.directory === cmd.payload.profile && p.running)) {
          cmd.state = 'confirming';
          cmd.confirmBy = now + 30000;
          reserved.add(cmd.payload.profile);
        } else if (cmd.state === 'approved' || (cmd.state === 'confirming' && now >= cmd.confirmBy)) {
          cmd.state = 'queued';
          cmd.expires = now + 300000;
        } else continue;
        store.put('command', cmd, d.owner);
      }
      const schedulePrompts = commands.filter(cmd => cmd.state === 'confirming').map(cmd => ({
        id: cmd.id, profile: cmd.payload.profile, scenario: cmd.payload.scenario, confirmBy: cmd.confirmBy
      }));
      const downloadDecisions = commands.filter(cmd => cmd.state === 'running' && cmd.downloadDecision)
        .map(cmd => ({ runId: cmd.id, ...cmd.downloadDecision }));
      const enabled = assignment.settings(store, d.owner).enabled;
      let next = commands.filter(cmd => ['queued', 'dispatched'].includes(cmd.state) && cmd.expires >= now &&
        cmd.deliveryUntil <= now && (!cmd.automatic || enabled) && (!(cmd.automatic || cmd.scenarioId) || assignment.canRedeliver(store,cmd,d)))
        .sort((a, b) => Number(a.type === 'run' || a.type === 'browseClips') - Number(b.type === 'run' || b.type === 'browseClips') || a.created - b.created)[0];
      if (!next && enabled) next = assignment.allocate(store, d.owner, now, d.id);
      if (next) { next.state = 'dispatched'; next.deliveryUntil = now + 10000; store.put('command', next, d.owner); }
      return { ack, schedulePrompts, command: next ? { id: next.id, type: next.type, payload: next.payload, ...(next.automatic && { assignmentTopic: next.topic }), ...(next.scenarioId && {assignmentScenarioId:next.scenarioId}), expires: next.expires } : null, serverTime: now, downloadDecisions };
    });
  }
  return { account, device };
}
module.exports = { createCommandApi, metadata, snapshot };
