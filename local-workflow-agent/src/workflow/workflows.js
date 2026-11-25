const { randomUUID } = require('crypto');
const { setTimeout: delay } = require('timers/promises');
const { overrideVariables } = require('./variables');

function createWorkflows({ scenarios, defaultProfile, profiles, onChange = () => {}, openProfile, openFolder, downloadVideo, activity, prepareUpload, mediaGuard }) {
  const sessions = new Map();
  const completed = new Map();
  activity?.onPageRemap?.(remap => {
    for (const s of sessions.values()) remap(s);
    for (const run of completed.values()) remap(run);
  });
  function persist(s) { if (activity && s.executionId) activity.saveRun(runStatus(s)); }
  function endStep(s, state, error = '') {
    const record = s.steps?.[s.index];
    if (!record || !['running', 'pending'].includes(record.state)) return;
    Object.assign(record, { state, ended_at: new Date().toISOString(), error });
    record.elapsed_ms = record.started_at ? Date.now() - Date.parse(record.started_at) : 0;
  }
  function runStatus(s) {
    return { ...status(s.profile), runId: s.executionId, scenario: s.scenarioName, state: s.running ? 'running' : s.outcome,
      waiting: s.running && (s.inFlight || s.localPending), startedAt: s.startedAt, endedAt: s.endedAt || null };
  }
  function finish(s, outcome) {
    if (outcome !== 'succeeded') endStep(s, outcome === 'failed' ? 'failed' : 'cancelled', s.error);
    s.running = false; s.endedAt = Date.now(); s.outcome = outcome;
    try { persist(s); } catch (error) { s.error = `Cannot persist workflow history: ${error.message}`; s.outcome = 'failed'; }
    if (s.executionId) completed.set(s.executionId, runStatus(s));
    onChange();
    while (completed.size > 200) completed.delete(completed.keys().next().value);
  }
  function getRun(id) {
    for (const s of sessions.values()) if (s.running && s.executionId === id) return runStatus(s);
    return completed.has(id) ? structuredClone(completed.get(id)) : activity?.readRun(id) || null;
  }
  function stopRun(id) {
    for (const s of sessions.values()) if (s.running && s.executionId === id) { stop(s.profile); return getRun(id); }
    return getRun(id);
  }
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
      profile: s.profile, remote: s.remote === true, running: s.running, runId: s.runId, index: s.index,
      executionId: s.executionId || null, state: s.running ? 'running' : s.outcome || 'idle', scenario: s.scenarioName || null,
      total: s.workflow?.steps.length || 0, action: s.workflow?.steps[s.index]?.action || null,
      stepLabel: s.currentStep?.label?.trim() || s.workflow?.steps[s.index]?.label?.trim() || `Bước ${s.index + 1}`,
      extensionConnected: Date.now() - s.lastContact < 10000, waitingForProfile: s.running && Boolean(s.connectionDeadline), error: s.error,
      paused: Boolean(s.confirmation), confirmation: s.confirmation ? structuredClone(s.confirmation) : null,
      tabId: s.tabId, waiting: s.inFlight || s.localPending,
      elapsedMs: s.startedAt ? (s.endedAt || Date.now()) - s.startedAt : 0,
      stepElapsedMs: s.running && s.stepStartedAt ? Date.now() - s.stepStartedAt : 0,
      lastStepMs: s.lastStepMs ?? null, download: s.download || null,
      steps: structuredClone(s.steps || []), stoppedAtStep: !s.running && s.outcome !== 'succeeded' && s.workflow ? s.index + 1 : null
    };
  }
  function stop(profile) {
    const s = session(profile);
    s.controller.abort(); s.controller = new AbortController();
    s.releaseMedia?.(); s.releaseMedia = null; s.confirmation = null; s.decide = null;
    if (s.running) finish(s, s.error ? 'failed' : 'cancelled');
    s.running = false; s.inFlight = false; s.localPending = false;
    s.picker.active = false; s.runId = randomUUID();
  }
  function fail(s, error) {
    s.error = String(error.message || error); stop(s.profile);
  }
  function confirm(s, issue) {
    const signal = s.controller.signal;
    const timed = issue.kind === 'download';
    return new Promise((resolve, reject) => {
      signal.throwIfAborted();
      let timer;
      const clean = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); s.confirmation = null; s.decide = null; };
      const abort = () => { clean(); reject(new Error('Đã dừng tác vụ đang chờ xác nhận')); };
      s.confirmation = { ...issue, id: randomUUID(), executionId: s.executionId, step: s.index + 1 };
      if (timed) s.confirmation.expiresAt = Date.now() + 30000;
      s.decide = () => { clean(); resolve(); };
      signal.addEventListener('abort', abort, { once: true });
      try {
        persist(s);
        if (timed) {
          const { id, expiresAt } = s.confirmation;
          // A remote decision recorded before the deadline can arrive on the next device poll.
          timer = setTimeout(() => {
            try { resolveConfirmation(s.profile, s.executionId, id, true, 'timeout'); }
            catch (error) { clean(); reject(error); }
          }, Math.max(0, expiresAt - Date.now()) + (s.remote ? 4000 : 0));
        }
      } catch (error) { clean(); reject(error); }
    });
  }
  function resolveConfirmation(profile, executionId, id, proceed, source = 'local') {
    const s = session(profile);
    if (!s.running || s.executionId !== executionId || s.confirmation?.id !== id || typeof proceed !== 'boolean') throw new Error('Xác nhận đã hết hiệu lực. Làm mới trạng thái.');
    if (source === 'local' && s.confirmation.expiresAt <= Date.now()) throw new Error('Đã hết thời gian xác nhận tải video.');
    s.steps[s.index].decisions ||= [];
    s.steps[s.index].decisions.push({ ...structuredClone(s.confirmation), proceed, source, at: new Date().toISOString() });
    persist(s);
    if (proceed) s.decide(); else stop(profile);
    return status(profile);
  }
  async function advance(s, runId) {
    s.localPending = true;
    try {
      while (s.running && s.runId === runId && s.index < s.workflow.steps.length) {
        s.currentStep = null;
        const record = s.steps[s.index];
        Object.assign(record, { state: 'running', started_at: new Date().toISOString() });
        s.stepStartedAt = Date.now(); persist(s);
        const step = scenarios.prepareStep(s.workflow.steps[s.index], s.uploadPath, s.runtime);
        s.currentStep = step;
        if (step.url) record.url = step.url;
        if (step.action === 'upload') {
          if (prepareUpload) {
            await prepareUpload(step, s.currentUrl);
            if (s.runId !== runId || !s.running) return;
          }
          record.file_path = step.filePath;
          record.page_url = step.pageUrl || s.currentUrl || '';
          record.page_name = step.pageName || '';
          if (activity) {
            const file = await activity.registerFile(step.filePath, { duration: s.download?.filePath === step.filePath ? s.download.duration : null,
              tag: step.folderTag || 'automation', signal: s.controller.signal });
            if (s.runId !== runId || !s.running) return;
            if (s.download?.filePath === step.filePath && s.download.asset_id && file.asset_id !== s.download.asset_id) throw new Error('Downloaded file changed before upload');
            s.uploadFile = file; record.asset_id = file.asset_id;
            if (mediaGuard) {
              const release = await mediaGuard.check(step, file, { signal: s.controller.signal, confirm: issue => confirm(s, issue) });
              if (s.runId !== runId || !s.running) { release(); return; }
              s.releaseMedia = release;
              activity.recordUploadAttempt?.(step, file, s.executionId, s.index);
            }
          }
        }
        persist(s);
        if (step.action === 'wait') await delay(step.ms, undefined, { signal: s.controller.signal });
        else if (step.action === 'downloadVideo') {
          const download = await downloadVideo(step, s.controller.signal, { confirm: issue => confirm(s, issue) });
          if (s.runId !== runId || !s.running) return;
          if (download.verified !== true || !download.filePath) throw new Error('Download must finish final-file verification before continuing');
          if (s.runId === runId && s.running) {
            s.download = download;
            Object.assign(record, { file_path: download.filePath, asset_id: download.asset_id || null, reused: download.reused === true });
            s.runtime = { download_title: download.title, download_file_name: download.name, download_file_path: download.filePath, download_id: download.id };
          }
        }
        else if (step.action === 'openFolder') await openFolder(step.path);
        else {
          if (s.awaitingFirstBrowserStep) ensureProfile(s);
          break;
        }
        if (!s.running || s.runId !== runId) return;
        s.lastStepMs = Date.now() - s.stepStartedAt;
        endStep(s, 'succeeded'); persist(s);
        s.index++;
      }
      if (s.runId === runId && s.index === s.workflow.steps.length) finish(s, 'succeeded');
    } catch (error) {
      if (s.runId === runId) fail(s, error);
    } finally {
      if (s.runId === runId) s.localPending = false;
    }
  }
  function ensureProfile(s) {
    if (s.connectionDeadline || Date.now() - s.lastContact < 10000) return;
    const runId = s.runId;
    s.connectionDeadline = Date.now() + 60000;
    openProfile(s.profile).catch(error => {
      if (s.running && s.runId === runId && s.connectionDeadline) fail(s, error);
    });
  }
  function start(profile, scenario, uploadPath = '', scenarioName = null, variables = {}, timeoutMs = 3600000, executionId = null, remote = false) {
    if (executionId) {
      if (!/^[0-9a-f-]{36}$/.test(executionId)) throw new Error('Invalid execution ID');
      if (getRun(executionId)) throw new Error('Execution ID already exists');
    }
    const s = session(profile);
    if (s.running) throw new Error('Stop this profile before starting another scenario');
    const workflow = scenarios.prepare(overrideVariables(scenario, variables), uploadPath);
    stop(profile);
    Object.assign(s, { workflow, remote, scenarioName: scenarioName || scenario.name || null, uploadPath, currentStep: null, currentUrl: '', uploadFile: null,
      steps: workflow.steps.map((step, index) => ({ index, number: index + 1, action: step.action, label: step.label?.trim() || `Bước ${index + 1}`,
        state: 'pending', started_at: null, ended_at: null, error: '' })),
      awaitingFirstBrowserStep: true, connectionDeadline: 0, runtime: {}, index: 0, download: null, error: '', tabId: null, openedTabIds: [], running: true, startedAt: Date.now(), endedAt: null, lastStepMs: null });
    s.executionId = executionId || s.runId; s.outcome = 'running';
    s.runDeadline = Date.now() + timeoutMs;
    try { persist(s); } catch (error) { s.running = false; s.outcome = 'failed'; throw error; }
    onChange();
    void advance(s, s.runId);
    return getRun(s.executionId);
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
    const answer = { running: s.running, paused: Boolean(s.confirmation), runId: s.runId, step: null, tabId: s.tabId };
    if (s.running && !s.confirmation && !s.localPending && !s.inFlight) {
      s.awaitingFirstBrowserStep = false;
      s.connectionDeadline = 0;
      s.inFlight = true;
      s.stepStartedAt = Date.now();
      s.steps[s.index].started_at = new Date(s.stepStartedAt).toISOString(); persist(s);
      const step = s.currentStep;
      const budget = (step.timeoutMs || 10000) + (step.navigationTimeoutMs || 30000) +
        (step.waitAfterMs || 0) + (step.times || 1) * (step.intervalMs || 2500) + 30000;
      s.deadline = Date.now() + budget;
      answer.step = { ...step, id: s.index };
      if (step.action === 'closeTab') answer.step.closeTabId = s.openedTabIds.at(-1) ?? null;
    }
    return answer;
  }
  function result(s, body) {
    if (!s.running || !s.inFlight || body.runId !== s.runId || body.id !== s.index) return;
    s.inFlight = false;
    if (typeof body.actionUrl === 'string') s.steps[s.index].action_url = body.actionUrl;
    if (!body.ok) return fail(s, `Step ${s.index + 1}: ${body.error || 'Action failed'}`);
    s.lastStepMs = Date.now() - s.stepStartedAt;
    if (s.currentStep.action === 'closeTab') {
      const closedTabId = s.openedTabIds.pop();
      if (s.tabId === closedTabId) {
        s.tabId = null;
        s.currentUrl = '';
      }
    } else if (Number.isInteger(body.tabId)) {
      s.tabId = body.tabId;
      if (s.currentStep.action === 'openUrl') s.openedTabIds.push(body.tabId);
    }
    if (typeof body.pageUrl === 'string' && /^https?:\/\//.test(body.pageUrl)) s.currentUrl = body.pageUrl;
    else if (s.currentStep.action === 'openUrl') s.currentUrl = s.currentStep.url;
    try {
      if (s.currentStep.action === 'upload' && activity) {
        s.steps[s.index].upload = activity.recordUpload(s.currentStep, s.uploadFile, { runId: s.executionId, index: s.index,
          actualUrl: typeof body.actionUrl === 'string' ? body.actionUrl : s.currentUrl });
      }
      if (s.currentUrl) s.steps[s.index].result_url = s.currentUrl;
      endStep(s, 'succeeded'); persist(s);
      s.releaseMedia?.(); s.releaseMedia = null;
    } catch (error) { return fail(s, error); }
    s.index++;
    void advance(s, s.runId);
  }
  function expire() {
    for (const s of sessions.values()) {
      if (s.running && Date.now() > s.runDeadline) { fail(s, 'Workflow execution timed out'); continue; }
      if (s.running && s.awaitingFirstBrowserStep && !s.localPending) {
        if (s.connectionDeadline && Date.now() >= s.connectionDeadline) {
          fail(s, `Extension chưa kết nối với ${s.profile} sau 60 giây. Kiểm tra extension và profile trong Extension options.`);
          continue;
        }
        ensureProfile(s);
      }
      if (s.running && s.inFlight && Date.now() > s.deadline) fail(s, `Step ${s.index + 1}: extension action timed out`);
    }
  }
  function usesScenario(name) {
    return [...sessions.values()].some(s => s.running && s.scenarioName === name);
  }
  return { resolveConfirmation, usesScenario, session, status, start, stop, connect, next, result, expire, getRun, stopRun,
    listRuns: profile => activity ? activity.listRuns(profile) : [...completed.values()].filter(run => !profile || run.profile === profile).reverse() };
}

module.exports = { createWorkflows };
