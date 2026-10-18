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

async function call(path, payload = {}, client) {
  client ||= activeJob?.client || await identity();
  const response = await fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, ...client }),
    signal: AbortSignal.timeout(5000)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Agent HTTP ${response.status}`);
  return data;
}

async function checkRunning(job) {
  const state = await call('/state', {}, job.client);
  if (!state.running || state.runId !== job.runId) throw new Error('Stopped');
}

async function pageMessage(tabId, message) {
  const response = await chrome.tabs.sendMessage(tabId, message, { frameId: 0 });
  if (!response?.ok) throw new Error(response?.error || 'Page did not respond');
  return response;
}

async function waitForPage(job, step, notBefore = 0) {
  const timeoutMs = step.navigationTimeoutMs ?? 30000;
  const settleMs = step.settleMs ?? (step.completion?.locator ? 0 : 350);
  const deadline = Date.now() + timeoutMs;
  let lastUrl = '', stableSince = Date.now();
  while (Date.now() < deadline) {
    await checkRunning(job);
    const tab = await chrome.tabs.get(job.tabId);
    if (tab.url !== lastUrl || tab.status !== 'complete') { lastUrl = tab.url; stableSince = Date.now(); }
    if (tab.status === 'complete') {
      let ready;
      try { ready = await pageMessage(job.tabId, { type: 'ready' }); }
      catch {
        // Existing tabs may predate extension installation/reload.
        try { await chrome.scripting.executeScript({ target: { tabId: job.tabId }, files: ['content.js'] }); } catch { /* Retry until timeout. */ }
      }
      if (ready?.readyState === 'complete' && Date.now() >= notBefore &&
          Date.now() - stableSince >= settleMs && ready.quietForMs >= settleMs) return;
    }
    await sleep(100);
  }
  throw new Error(`Page did not finish loading within ${timeoutMs} ms`);
}

async function waitForCompletion(job, step) {
  const timeoutMs = step.navigationTimeoutMs ?? 30000;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await waitForPage(job, { navigationTimeoutMs: Math.max(1, deadline - Date.now()), settleMs: 0 });
    try {
      const result = await pageMessage(job.tabId, { type: 'conditionStatus', condition: step.completion });
      if (result.satisfied) return;
    } catch (error) {
      if (!/context|closed|Receiving end|message port|Could not establish/i.test(error.message)) throw error;
      // A delayed navigation may replace the document while probing readiness.
    }
    await sleep(100);
  }
  throw new Error(`Completion condition timed out: ${step.completion.locator || step.completion.selector}`);
}

async function execute(job, step) {
  if (step.action === 'openUrl') {
    const url = new URL(step.url);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('openUrl requires http or https');
    job.tabId = (await chrome.tabs.create({ url: url.href, active: true })).id;
    await waitForPage(job, step);
  } else {
    if (job.tabId === null || job.tabId === undefined) {
      const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      const tab = tabs.find(tab => /^https?:/.test(tab.url || '') && !tab.url.startsWith(base));
      if (!tab) throw new Error('Open a target tab in this profile, or start the scenario with openUrl');
      job.tabId = tab.id;
    }
    await waitForPage(job, { navigationTimeoutMs: step.navigationTimeoutMs, settleMs: 0 });
    await checkRunning(job);
    if (step.action === 'click') {
      const point = await pageMessage(job.tabId, { type: 'clickPoint', step, runId: job.runId });
      await checkRunning(job);
      const started = Date.now();
      await input(job.tabId, { kind: 'click', x: point.x, y: point.y });
      // Observe delayed navigation and tabs opened by the click in the worker,
      // which survives destruction of the old document.
      await sleep(500);
      const opened = newTabs.get(job.tabId);
      if (opened && opened.at >= started) job.tabId = opened.id;
      await waitForPage(job, step, started + 500);
    } else {
      await pageMessage(job.tabId, { type: 'execute', step, runId: job.runId });
    }
  }
  if (step.completion?.locator || step.completion?.selector) {
    await waitForCompletion(job, step);
  }
  await checkRunning(job);
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
    const next = await call('/next', {}, client);
    if (!next.step) return;
    const job = { client, runId: next.runId, tabId: next.tabId };
    activeJob = job;
    const keepAlive = setInterval(() => {
      checkRunning(job).catch(() => {
        if (Number.isInteger(job.tabId)) chrome.tabs.sendMessage(job.tabId, { type: 'cancel', runId: job.runId }, { frameId: 0 }).catch(() => {});
      });
    }, 1000);
    let result;
    try {
      await execute(job, next.step);
      result = { ok: true };
    } catch (error) { result = { ok: false, error: String(error.message || error) }; }
    finally { clearInterval(keepAlive); }
    // Retry acknowledgement without repeating a potentially destructive action.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await call('/result', { ...result, runId: job.runId, id: next.step.id, tabId: job.tabId }, client);
        break;
      } catch (error) { if (attempt === 2) throw error; await sleep(500); }
    }
  } catch (error) { console.warn('Local agent:', error.message); }
  finally { activeJob = null; polling = false; }
}

async function input(tabId, message) {
  const target = { tabId };
  if (!debuggerTabs.has(tabId)) {
    const targets = await chrome.debugger.getTargets();
    if (!targets.some(item => item.tabId === tabId && item.attached)) await chrome.debugger.attach(target, '1.3');
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
        if (!activeJob || activeJob.runId !== message.runId || activeJob.tabId !== sender.tab.id) throw new Error('Stale or stopped action');
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
