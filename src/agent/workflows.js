const { randomUUID } = require('crypto');
const { setTimeout: delay } = require('timers/promises');

function createWorkflows({ scenarios, defaultProfile, profiles, openFolder, downloadVideo }) {
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
      stepLabel: s.currentStep?.label?.trim() || s.workflow?.steps[s.index]?.label?.trim() || `Bước ${s.index + 1}`,
      extensionConnected: Date.now() - s.lastContact < 10000, error: s.error,
      tabId: s.tabId, waiting: s.inFlight || s.localPending,
      elapsedMs: s.startedAt ? (s.endedAt || Date.now()) - s.startedAt : 0,
      stepElapsedMs: s.running && s.stepStartedAt ? Date.now() - s.stepStartedAt : 0,
      lastStepMs: s.lastStepMs ?? null, download: s.download || null
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
        const step = scenarios.prepareStep(s.workflow.steps[s.index], s.uploadPath, s.runtime);
        s.currentStep = step;
        s.stepStartedAt = Date.now();
        if (step.action === 'wait') await delay(step.ms, undefined, { signal: s.controller.signal });
        else if (step.action === 'downloadVideo') {
          const download = await downloadVideo(step, s.controller.signal);
          if (s.runId !== runId || !s.running) return;
          if (download.verified !== true || !download.filePath) throw new Error('Download must finish final-file verification before continuing');
          if (s.runId === runId && s.running) {
            s.download = download;
            s.runtime = { download_title: download.title, download_file_name: download.name, download_file_path: download.filePath, download_id: download.id };
          }
        }
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
  function start(profile, scenario, uploadPath = '', scenarioName = null) {
    const s = session(profile);
    if (s.running) throw new Error('Stop this profile before starting another scenario');
    const workflow = scenarios.prepare(scenario, uploadPath);
    if (!status(profile).extensionConnected && workflow.steps.some(step => !['wait', 'openFolder', 'downloadVideo'].includes(step.action))) {
      throw new Error('Extension chưa kết nối profile này. Mở profile, cài/reload extension và chọn đúng profile trong Extension options.');
    }
    stop(profile);
    Object.assign(s, { workflow, scenarioName, uploadPath, currentStep: null, runtime: {}, index: 0, download: null, error: '', tabId: null, running: true, startedAt: Date.now(), endedAt: null, lastStepMs: null });
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
    return s;
  }
  function next(s) {
    const answer = { running: s.running, runId: s.runId, step: null, tabId: s.tabId };
    if (s.running && !s.localPending && !s.inFlight) {
      s.inFlight = true;
      s.stepStartedAt = Date.now();
      const step = s.currentStep;
      const budget = (step.timeoutMs || 10000) + (step.navigationTimeoutMs || 30000) +
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
  function usesScenario(name) {
    return [...sessions.values()].some(s => s.running && s.scenarioName === name);
  }
  return { usesScenario, session, status, start, stop, connect, next, result, expire };
}

module.exports = { createWorkflows };
