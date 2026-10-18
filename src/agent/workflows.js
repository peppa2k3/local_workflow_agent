const { randomUUID } = require('crypto');
const { setTimeout: delay } = require('timers/promises');

function createWorkflows({ scenarios, defaultProfile, profiles, openFolder, idm }) {
  const sessions = new Map();
  function session(profile = defaultProfile) {
    if (!profiles().some(item => item.directory === profile)) throw new Error('Unknown Chrome profile');
    if (!sessions.has(profile)) sessions.set(profile, {
      profile, running: false, runId: randomUUID(), index: 0, workflow: null,
      inFlight: false, localPending: false, clientId: null, lastContact: 0,
      error: '', tabId: null, deadline: 0, controller: new AbortController(), picker: { id: 0, active: false, result: null }
    });
    return sessions.get(profile);
  }
  function status(profile) {
    const s = session(profile);
    return {
      profile: s.profile, running: s.running, runId: s.runId, index: s.index,
      total: s.workflow?.steps.length || 0, action: s.workflow?.steps[s.index]?.action || null,
      extensionConnected: Date.now() - s.lastContact < 10000, error: s.error,
      extensionCapabilities: s.capabilities || [],
      tabId: s.tabId, waiting: s.inFlight,
      elapsedMs: s.startedAt ? (s.endedAt || Date.now()) - s.startedAt : 0,
      stepElapsedMs: s.running && s.stepStartedAt ? Date.now() - s.stepStartedAt : 0,
      lastStepMs: s.lastStepMs ?? null,
      detail: s.detail || '', download: s.download || null
    };
  }
  function stop(profile) {
    const s = session(profile);
    s.controller.abort(); s.controller = new AbortController();
    if (s.running) s.endedAt = Date.now();
    s.running = false; s.inFlight = false; s.localPending = false;
    s.picker.active = false; s.runId = randomUUID();
  }
  function fail(s, error) {
    s.error = String(error.message || error); stop(s.profile);
  }
  async function advance(s, runId) {
    s.localPending = true;
    try {
      while (s.running && s.runId === runId && s.index < s.workflow.steps.length) {
        const step = s.workflow.steps[s.index];
        s.stepStartedAt = Date.now();
        if (step.action === 'wait') await delay(step.ms, undefined, { signal: s.controller.signal });
        else if (step.action === 'openFolder') await openFolder(step.path);
        else break;
        if (!s.running || s.runId !== runId) return;
        s.lastStepMs = Date.now() - s.stepStartedAt;
        s.index++;
      }
      if (s.runId === runId && s.index === s.workflow.steps.length) { s.running = false; s.endedAt = Date.now(); }
    } catch (error) {
      if (s.runId === runId) fail(s, error);
    } finally {
      if (s.runId === runId) s.localPending = false;
    }
  }
  function start(profile, scenario, uploadPath = '') {
    const s = session(profile);
    if (s.running) throw new Error('Stop this profile before starting another scenario');
    const workflow = scenarios.prepare(scenario, uploadPath);
    if (workflow.steps.some(step => step.action === 'idmDownload') && !s.capabilities?.includes('idm-download-v1')) throw new Error('Reload Local Workflow Agent Bridge trong profile đã chọn để dùng IDM.');
    if (workflow.steps.some(step => step.action === 'idmDownload') && [...sessions.values()].some(other => other.running && other.workflow?.steps.some(step => step.action === 'idmDownload'))) throw new Error('Chỉ chạy một kịch bản IDM tại một thời điểm. Đợi hoặc dừng kịch bản IDM trước.');
    if (!status(profile).extensionConnected && workflow.steps.some(step => !['wait', 'openFolder'].includes(step.action))) {
      throw new Error('Extension chưa kết nối profile này. Mở profile, cài/reload extension và chọn đúng profile trong Extension options.');
    }
    stop(profile);
    Object.assign(s, { workflow, index: 0, error: '', tabId: null, running: true, startedAt: Date.now(), endedAt: null, lastStepMs: null, detail: '', download: null, idmJob: null });
    void advance(s, s.runId);
  }
  function connect(body) {
    if (!body.profile || typeof body.clientId !== 'string' || !body.clientId) {
      throw new Error('Reload the extension and configure its Chrome profile in Extension options');
    }
    const s = session(body.profile);
    if (s.clientId && s.clientId !== body.clientId && (s.running || Date.now() - s.lastContact < 10000)) {
      throw new Error('Another extension is connected as this profile. Check Extension options in both profiles.');
    }
    s.clientId = body.clientId; s.lastContact = Date.now();
    s.capabilities = Array.isArray(body.capabilities) ? body.capabilities.filter(value => typeof value === 'string') : [];
    return s;
  }
  function next(s) {
    const answer = { running: s.running, runId: s.runId, step: null, tabId: s.tabId };
    if (s.running && !s.localPending && !s.inFlight) {
      s.inFlight = true;
      s.stepStartedAt = Date.now();
      const step = s.workflow.steps[s.index];
      const budget = (step.timeoutMs || 10000) + (step.downloadTimeoutMs || 0) + (step.navigationTimeoutMs || 30000) +
        (step.waitAfterMs || 0) + (step.times || 1) * (step.intervalMs || 2500) + 30000;
      s.deadline = Date.now() + budget;
      answer.step = { ...step, id: s.index };
    }
    return answer;
  }
  function result(s, body) {
    if (!s.running || !s.inFlight || body.runId !== s.runId || body.id !== s.index) return;
    s.inFlight = false;
    if (!body.ok) return fail(s, `Step ${s.index + 1}: ${body.error || 'Action failed'}`);
    if (s.workflow.steps[s.index].action === 'idmDownload' && (s.idmJob?.id !== s.index || s.idmJob?.runId !== s.runId || s.idmJob?.state !== 'complete')) return fail(s, 'IDM chưa xác nhận file tải hoàn tất');
    s.lastStepMs = Date.now() - s.stepStartedAt;
    if (Number.isInteger(body.tabId)) s.tabId = body.tabId;
    s.index++;
    void advance(s, s.runId);
  }
  function expire() {
    for (const s of sessions.values()) {
      if (s.running && s.inFlight && Date.now() > s.deadline) fail(s, `Step ${s.index + 1}: extension action timed out`);
    }
  }
  function idmJob(s, body, start = false) {
    const step = s.workflow?.steps[s.index];
    if (!s.running || !s.inFlight || body.runId !== s.runId || body.id !== s.index || step?.action !== 'idmDownload') throw new Error('Stale or invalid IDM request');
    if (!s.idmJob || s.idmJob.runId !== s.runId || s.idmJob.id !== s.index) {
      if (!start) throw new Error('IDM job has not started');
      if (!idm) throw new Error('IDM adapter is unavailable');
      const runId = s.runId, job = { id: s.index, runId, state: 'running', detail: 'Đang kết nối IDM' };
      s.idmJob = job;
      void idm.download({ ...step, marker: body.marker }, s.controller.signal, detail => {
        if (s.runId === runId) { job.detail = detail; s.detail = detail; }
      }).then(result => {
        job.state = 'complete'; job.result = result;
        if (s.runId === runId) { s.download = result; s.detail = `Đã tải ${result.quality}p: ${result.filePath}`; }
      }, error => { job.state = 'error'; job.error = String(error.message || error); });
    }
    return s.idmJob;
  }
  return { session, status, start, stop, connect, next, result, expire, idmJob };
}

module.exports = { createWorkflows };
