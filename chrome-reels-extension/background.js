const base = 'http://127.0.0.1:34719';
const fileChoosers = new Map();

chrome.debugger.onEvent.addListener((source, method, params) => {
  if (method === 'Page.fileChooserOpened' && source.tabId) {
    fileChoosers.set(source.tabId, params);
  }
});

async function call(path, payload) {
  const response = await fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(`Agent HTTP ${response.status}`);
  return response.json();
}

async function input(tabId, message) {
  const target = { tabId };
  const targets = await chrome.debugger.getTargets();
  if (!targets.some(item => item.tabId === tabId && item.attached)) {
    await chrome.debugger.attach(target, '1.3');
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
      if (message.type === 'next') {
        if (!sender.tab.active) return { step: null };
        if (sender.tab.url?.startsWith(base)) return { step: null };
        return await call('/next', { url: sender.tab.url, tabId: sender.tab.id });
      }
      if (message.type === 'pickNext') {
        if (!sender.tab.active || sender.tab.url?.startsWith(base)) return { active: false };
        return await call('/pick/next', {});
      }
      if (message.type === 'pickResult') return await call('/pick/result', message.payload);
      if (message.type === 'result') return await call('/result', message.payload);
      if (message.type === 'state') return await call('/state', {});
      if (message.type === 'input') return await input(sender.tab.id, message);
      return { ok: false, error: 'Unknown message' };
    } catch (error) {
      return { ok: false, error: String(error.message || error) };
    }
  })().then(sendResponse);
  return true;
});
