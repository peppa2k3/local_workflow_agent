importScripts('step-policy.js');
const { stepError, retryConfig, completionTimeout, classify, stageFor } = StepPolicy;
const base = 'http://127.0.0.1:34719';
const fileChoosers = new Map();
const debuggerTabs = new Set();
chrome.debugger.onDetach?.addListener(source => { debuggerTabs.delete(source.tabId); fileChoosers.delete(source.tabId); });
let polling = false;
let activeJob = null;
let lastPick = null;
const newTabs = new Map();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

chrome.tabs.onCreated.addListener(tab => {
  for (const [id, opened] of newTabs) if (Date.now() - opened.at > 30000) newTabs.delete(id);
  if (tab.openerTabId !== undefined) newTabs.set(tab.openerTabId, { id: tab.id, at: Date.now() });
});

async function identity() {
  const config = await chrome.storage.local.get(['profile', 'clientId']);
  if (!config.profile) throw new Error('Chọn Chrome profile trong Extension options trước khi chạy.');
  if (!config.clientId) {
    config.clientId = crypto.randomUUID();
    await chrome.storage.local.set({ clientId: config.clientId });
  }
  return config;
}

chrome.debugger.onEvent.addListener((source, method, params) => {
  if (method === 'Page.fileChooserOpened' && source.tabId) {
    fileChoosers.set(source.tabId, params);
  }
});

async function call(path, payload = {}, client, timeoutMs = 5000) {
  client ||= activeJob?.client || await identity();
  const response = await fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, ...client }),
    signal: AbortSignal.timeout(timeoutMs)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Agent HTTP ${response.status}`);
  return data;
}

// Cancellation: one AbortController per job. Everything that waits (sleeps, polling loops, retries)
// observes it, so Stop/timeout ends the step at every layer instead of waiting for the next poll.
const abortError = job => job.abortReason || stepError('Stopped', 'stopped');
function abortJob(job, reason) {
  if (job.abort.signal.aborted || job.finished) return;
  job.abortReason = reason;
  job.abort.abort();
  if (Number.isInteger(job.tabId)) chrome.tabs.sendMessage(job.tabId, { type: 'cancel', runId: job.runId, token: job.token }, { frameId: 0 }).catch(() => {});
}
const sleepJob = (job, ms) => new Promise((resolve, reject) => {
  if (job.abort.signal.aborted) return reject(abortError(job));
  const onAbort = () => { clearTimeout(timer); reject(abortError(job)); };
  const timer = setTimeout(() => { job.abort.signal.removeEventListener('abort', onAbort); resolve(); }, ms);
  job.abort.signal.addEventListener('abort', onAbort, { once: true });
});

// Local checks are free; the agent is asked at most every 500 ms (or when forced). A brief agent hiccup
// (slow machine, busy event loop) must not fail a step: only an explicit stop or 5 consecutive misses do.
async function checkRunning(job, force = false) {
  if (job.abort.signal.aborted) throw abortError(job);
  if (job.deadline && Date.now() > job.deadline) {
    const error = stepError(`Step vượt quá ngân sách thời gian (${job.budgetMs} ms) do agent cấp`, 'step_timeout');
    abortJob(job, error); throw error;
  }
  if (!force && Date.now() - (job.lastCheck || 0) < 500) return;
  job.lastCheck = Date.now();
  let state;
  try { state = await call('/state', {}, job.client); job.stateFailures = 0; }
  catch (error) {
    const transient = error.name === 'TimeoutError' || error instanceof TypeError;
    if (!transient) throw error;
    if (++job.stateFailures >= 5) { const failure = stepError('Mất kết nối tới local agent', 'agent_unreachable'); abortJob(job, failure); throw failure; }
    return;
  }
  if (!state.running || state.runId !== job.runId) { const stopped = stepError('Stopped', 'stopped'); abortJob(job, stopped); throw stopped; }
}

async function pageMessage(tabId, message, timeoutMs = 15000) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(stepError('Page did not respond', 'page_unresponsive')), Math.max(1, timeoutMs)); });
  try {
    const response = await Promise.race([chrome.tabs.sendMessage(tabId, message, { frameId: 0 }), timeout]);
    if (!response?.ok) throw stepError(response?.error || 'Page did not respond', response?.errorType, { dispatched: response?.dispatched });
    return response;
  } finally { clearTimeout(timer); }
}

async function waitForPage(job, step, notBefore = 0) {
  const timeoutMs = step.navigationTimeoutMs ?? 30000;
  const settleMs = step.settleMs ?? (step.action === 'click' || step.completion?.locator || step.completion?.selector ? 0 : 350);
  const deadline = Date.now() + timeoutMs;
  let lastUrl = '', stableSince = Date.now(), pageReady = false;
  while (Date.now() < deadline) {
    await checkRunning(job);
    const tab = await chrome.tabs.get(job.tabId);
    pageReady = false;
    if (tab.url !== lastUrl || tab.status !== 'complete') { lastUrl = tab.url; stableSince = Date.now(); }
    if (tab.status === 'complete') {
      let ready;
      try { ready = await pageMessage(job.tabId, { type: 'ready' }); }
      catch {
        // Existing tabs may predate extension installation/reload.
        try { await chrome.scripting.executeScript({ target: { tabId: job.tabId }, files: ['content.js'] }); } catch { /* Retry until timeout. */ }
      }
      pageReady = ready?.readyState === 'complete';
      if (pageReady && Date.now() >= notBefore &&
          Date.now() - stableSince >= settleMs && ready.quietForMs >= settleMs) return;
    }
    await sleepJob(job, 100);
  }
  if (pageReady && settleMs > 0) throw stepError(`Page DOM did not settle for ${settleMs} ms within ${timeoutMs} ms. Set settleMs to 0 or use a completion locator.`, 'navigation_timeout');
  throw stepError(`Page did not finish loading within ${timeoutMs} ms`, 'navigation_timeout');
}

// One probe of the completion condition; never throws for transient page replacement.
const TRANSIENT_PAGE = /context|closed|Receiving end|message port|Could not establish|did not respond/i;
async function probeCompletion(job, step) {
  try { return await pageMessage(job.tabId, { type: 'conditionStatus', condition: step.completion, token: step.token }); }
  catch (error) { if (!TRANSIENT_PAGE.test(error.message)) throw error; return { satisfied: false, reason: 'trang đang tải lại' }; }
}

async function waitForCompletion(job, step) {
  const timeoutMs = completionTimeout(step);
  const deadline = Date.now() + timeoutMs;
  let reason = '';
  while (Date.now() < deadline) {
    await waitForPage(job, { navigationTimeoutMs: Math.max(1, deadline - Date.now()), settleMs: 0 });
    const result = await probeCompletion(job, step);
    if (result.satisfied) return;
    reason = result.reason || '';
    await sleepJob(job, 150);
  }
  throw stepError(`Completion condition timed out after ${timeoutMs} ms: ${step.completion.locator || step.completion.selector}${reason ? ` (${reason})` : ''}`, 'completion_timeout');
}

function preflight(step) {
  const bad = message => { throw stepError(message, 'config'); };
  // The agent supplies the verified final title-only path after download publication.
  if (step.action === 'upload' && (!step.filePath || step.filePath.startsWith('clip:') || /\.(part|ytdl|tmp)$/i.test(step.filePath) || /\{\{\s*download_[a-z_]+\s*\}\}/.test(step.filePath))) bad('Upload requires a resolved final video path from the agent');
  if (step.action === 'upload' && [step.pageId, step.pageName, step.pageUrl, step.platform].some(value => typeof value === 'string' && /\{\{\s*[a-zA-Z_][a-zA-Z0-9_]*\s*\}\}/.test(value))) bad('Upload page metadata must be resolved by the agent before selecting the file');
  if (step.action === 'downloadVideo') bad('downloadVideo runs in the local agent. Restart node local-agent.js.');
  if (step.action === 'closeTab' && !Number.isInteger(step.closeTabId)) bad('Không tìm thấy tab do bước Mở URL tạo trong lượt chạy này.');
  if (step.action === 'openUrl') {
    const url = new URL(step.url);
    if (!['http:', 'https:'].includes(url.protocol)) bad('openUrl requires http or https');
  }
}

// One attempt. Sets job.dispatched as soon as an input that could have a side effect may have reached the page.
async function attempt(job, step) {
  job.dispatched = false;
  if (step.action === 'closeTab') {
    await checkRunning(job, true);
    job.dispatched = true;
    await chrome.tabs.remove(step.closeTabId);
    if (job.tabId === step.closeTabId) job.tabId = null;
    return false;
  }
  if (step.action === 'openUrl') {
    const url = new URL(step.url);
    job.dispatched = true;
    job.tabId = (await chrome.tabs.create({ url: url.href, active: true })).id;
    await waitForPage(job, step);
  } else {
    if (job.tabId === null || job.tabId === undefined) {
      const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      const tab = tabs.find(tab => /^https?:/.test(tab.url || '') && !tab.url.startsWith(base));
      if (!tab) throw stepError('Open a target tab in this profile, or start the scenario with openUrl', 'config');
      job.tabId = tab.id;
    }
    await waitForPage(job, { navigationTimeoutMs: step.navigationTimeoutMs, settleMs: 0 });
    await checkRunning(job, true);
    job.actionUrl = (await chrome.tabs.get(job.tabId)).url || '';
    // Content-script actions can run up to the step budget; ready/probe messages keep the short default.
    const remaining = job.deadline ? Math.max(1000, job.deadline - Date.now()) : 600000;
    if (step.action === 'click') {
      const point = await pageMessage(job.tabId, { type: 'clickPoint', step, runId: job.runId }, remaining);
      await checkRunning(job, true);
      const started = Date.now();
      job.dispatched = true;
      await input(job.tabId, { kind: 'click', x: point.x, y: point.y });
      // Observe delayed navigation and tabs opened by the click in the worker,
      // which survives destruction of the old document.
      await sleepJob(job, 500);
      const opened = newTabs.get(job.tabId);
      if (opened && opened.at >= started) job.tabId = opened.id;
      await waitForPage(job, step, started + 500);
    } else {
      try { await pageMessage(job.tabId, { type: 'execute', step, runId: job.runId }, remaining); }
      catch (error) {
        // A missing reply leaves dispatch unknown and must not trigger another upload.
        job.dispatched = error.dispatched ?? null;
        throw error;
      }
      job.dispatched = true;
    }
  }
  if (step.completion?.locator || step.completion?.selector) {
    await waitForCompletion(job, step);
    await checkRunning(job, true);
    return true;
  }
  await checkRunning(job, true);
  return false;
}

// Retry only when it cannot cause a duplicate effect:
//  - nothing was dispatched (element not found yet, page busy), or
//  - the action is idempotent (waitFor, setDate/Time, type with clear) .
// After possible dispatch, check completion before retrying an idempotent action.
async function execute(job, step) {
  job.token = step.token;
  preflight(step);
  const { attempts: extra, delayMs } = retryConfig(step);
  for (let attempts = 1; ; attempts++) {
    try {
      await checkRunning(job, true);
      const confirmed = await attempt(job, step);
      return { attempts, confirmed, stage: stageFor(step, confirmed) };
    } catch (error) {
      error = job.abortReason || error;
      const failure = classify(error, step, job.dispatched);
      Object.assign(failure, { attempts });
      if (attempts > extra || !failure.retryable) throw Object.assign(error, { details: failure });
      if (job.dispatched !== false && (step.completion?.locator || step.completion?.selector)) {
        try {
          if ((await probeCompletion(job, step)).satisfied) return { attempts, confirmed: true, stage: stageFor(step, true) };
        } catch { /* Fall through to another attempt. */ }
      }
      try { await sleepJob(job, delayMs); }
      catch (stopped) { throw Object.assign(stopped, { details: { ...classify(stopped, step, job.dispatched), attempts } }); }
    }
  }
}

async function poll() {
  if (polling || activeJob) return;
  polling = true;
  try {
    const client = await identity();
    const pick = await call('/pick/next', {}, client);
    if (pick.active) {
      const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      const tab = tabs.find(tab => /^https?:/.test(tab.url || '') && !tab.url.startsWith(base));
      if (tab && (lastPick?.id !== pick.id || lastPick?.tabId !== tab.id || lastPick?.profile !== client.profile)) {
        await pageMessage(tab.id, { type: 'startPicker', id: pick.id });
        lastPick = { id: pick.id, tabId: tab.id, profile: client.profile, client };
      }
      return;
    }
    if (lastPick) {
      try { await pageMessage(lastPick.tabId, { type: 'cancelPicker', id: lastPick.id }); } catch { /* The picked tab may have navigated. */ }
      lastPick = null;
    }
    const next = await call('/next', { stepProtocol: 1 }, client);
    if (next.paused || !next.step) return; // The agent waits for confirmation from a dashboard.
    if (!next.step.token || !Number.isFinite(next.step.budgetMs)) {
      await call('/result', { ok: false, id: next.step.id, runId: next.runId, error: 'Khởi động lại agent phiên bản hỗ trợ extension 4.3.' }, client);
      return;
    }
    const budgetMs = next.step.budgetMs;
    // The agent owns the step budget. The extension stops 10 s earlier, so its descriptive error
    // (and the result) reaches the agent before the agent's own deadline fires.
    const job = { client, runId: next.runId, tabId: next.tabId, abort: new AbortController(), budgetMs, stateFailures: 0, dispatched: false,
      deadline: budgetMs ? Date.now() + Math.max(5000, budgetMs - 10000) : 0 };
    activeJob = job;
    const keepAlive = setInterval(() => { checkRunning(job, true).catch(error => abortJob(job, error)); }, 1000);
    let result;
    try {
      const outcome = await execute(job, next.step);
      let pageUrl = '';
      if (next.step.action !== 'closeTab') { try { pageUrl = (await chrome.tabs.get(job.tabId)).url || ''; } catch { /* Tab may be gone; the step itself succeeded. */ } }
      result = { ok: true, actionUrl: job.actionUrl || '', pageUrl, attempts: outcome.attempts, confirmed: outcome.confirmed, stage: outcome.stage };
    } catch (error) {
      const details = error.details || classify(error, next.step, job.dispatched);
      result = { ok: false, status: details.unverified ? 'unverified' : 'failed', errorType: details.type, attempts: details.attempts || 1,
        dispatched: details.dispatched, actionUrl: job.actionUrl || '', error: String(error.message || error) };
    }
    finally {
      job.finished = true;
      clearInterval(keepAlive);
      if (next.step.completion?.state === 'appearedThenHidden' && job.tabId != null) {
        chrome.tabs.sendMessage(job.tabId, { type: 'endWatch', token: next.step.token }, { frameId: 0 }).catch(() => {});
      }
    }
    // Retry acknowledgement without repeating a potentially destructive action.
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        await call('/result', { ...result, runId: job.runId, id: next.step.id, token: next.step.token, tabId: job.tabId }, client, 10000);
        break;
      } catch (error) { if (attempt === 5) throw error; await sleep(500 * (attempt + 1)); }
    }
  } catch (error) { console.warn('Local agent:', error.message); }
  finally { activeJob = null; polling = false; }
}

async function input(tabId, message) {
  const target = { tabId };
  if (!debuggerTabs.has(tabId)) {
    const targets = await chrome.debugger.getTargets();
    let ours = false;
    if (targets.some(item => item.tabId === tabId && item.attached)) {
      // The attached flag may describe another CDP client, including DevTools.
      try { await chrome.debugger.sendCommand(target, 'Runtime.getIsolateId'); ours = true; }
      catch { /* Attach our own session below. */ }
    }
    if (!ours) await chrome.debugger.attach(target, '1.3');
    debuggerTabs.add(tabId);
  }
  const command = (method, params) => chrome.debugger.sendCommand(target, method, params);
  if (message.kind === 'prepareUpload') {
    fileChoosers.delete(tabId);
    await command('Page.enable', {});
    await command('Page.setInterceptFileChooserDialog', { enabled: true });
  } else if (message.kind === 'chooserStatus') {
    return { ok: true, opened: fileChoosers.has(tabId) };
  } else if (message.kind === 'cancelUpload') {
    await command('Page.setInterceptFileChooserDialog', { enabled: false });
    fileChoosers.delete(tabId);
  } else if (message.kind === 'wheel') {
    await command('Input.dispatchMouseEvent', {
      type: 'mouseWheel', x: message.x, y: message.y,
      deltaX: 0, deltaY: message.pixels
    });
  } else if (message.kind === 'click') {
    for (const type of ['mousePressed', 'mouseReleased']) {
      await command('Input.dispatchMouseEvent', {
        type, x: message.x, y: message.y,
        button: 'left', clickCount: 1
      });
    }
  } else if (message.kind === 'text') {
    if (/\{\{\s*[a-zA-Z_][a-zA-Z0-9_]*\s*\}\}/.test(message.text)) throw new Error('Biến chưa được truy xuất. Khởi động lại node local-agent.js và kiểm tra giá trị biến trước khi chạy.');
    if (message.clear) {
      // Browser editing preserves input/beforeinput events for rich text editors.
      await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 2, windowsVirtualKeyCode: 65 });
      await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 0, windowsVirtualKeyCode: 65 });
      await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
      await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
    }
    await command('Input.insertText', { text: message.text });
  } else if (message.kind === 'upload') {
    try {
      const chooser = fileChoosers.get(tabId);
      if (chooser && !chooser.backendNodeId) throw new Error('Chrome file chooser did not identify its file input');
      if (chooser?.backendNodeId) {
        await command('DOM.setFileInputFiles', {
          backendNodeId: chooser.backendNodeId,
          files: [message.filePath]
        });
      } else {
        const document = await command('DOM.getDocument', { depth: 1 });
        const result = await command('DOM.querySelector', {
          nodeId: document.root.nodeId,
          selector: message.selector
        });
        if (!result.nodeId) throw new Error('File input disappeared before upload');
        await command('DOM.setFileInputFiles', {
          nodeId: result.nodeId,
          files: [message.filePath]
        });
      }
    } finally {
      await command('Page.setInterceptFileChooserDialog', { enabled: false });
      fileChoosers.delete(tabId);
    }
  }
  return { ok: true };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!sender.tab) return;
  (async () => {
    try {
      if (message.type === 'wake') { void poll(); return { ok: true }; }
      if (message.type === 'pickResult') {
        if (!lastPick || lastPick.tabId !== sender.tab.id || lastPick.id !== message.payload.id) throw new Error('Stale picker result');
        return await call('/pick/result', message.payload, lastPick.client);
      }
      if (message.type === 'state') return await call('/state', {});
      if (message.type === 'input') {
        if (!activeJob || activeJob.finished || activeJob.token !== message.token || activeJob.runId !== message.runId || activeJob.tabId !== sender.tab.id) throw new Error('Stale or stopped action');
        if (message.kind !== 'cancelUpload') await checkRunning(activeJob);
        return await input(sender.tab.id, message);
      }
      return { ok: false, error: 'Unknown message' };
    } catch (error) {
      return { ok: false, error: String(error.message || error) };
    }
  })().then(sendResponse);
  return true;
});

chrome.runtime.onInstalled.addListener(() => { void chrome.runtime.openOptionsPage(); void poll(); });
chrome.runtime.onStartup.addListener(() => { void poll(); });
chrome.storage.onChanged.addListener(() => { void poll(); });
chrome.alarms.create('agent-poll', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener(() => { void poll(); });
setInterval(() => { void poll(); }, 700);
void poll();
