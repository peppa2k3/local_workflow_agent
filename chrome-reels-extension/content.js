(() => {
  if (globalThis.__localWorkflowBridge) return;
  globalThis.__localWorkflowBridge = true;
  let busy = false;
  let picking = false;
  let cancelPicker = null;
  let currentRunId = null;
  let cancelled = false;
  let actionAbort = new AbortController();
  const checkCancelled = () => { if (cancelled) throw new Error('Stopped'); };
  let lastMutation = Date.now();
  new MutationObserver(() => { lastMutation = Date.now(); }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
  const sleep = ms => new Promise((resolve, reject) => {
    checkCancelled();
    const signal = actionAbort.signal;
    const abort = () => { clearTimeout(timer); reject(new Error('Stopped')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
  const send = message => new Promise(resolve => {
    chrome.runtime.sendMessage({ ...message, runId: currentRunId }, response => {
      resolve(chrome.runtime.lastError ? { ok: false, error: chrome.runtime.lastError.message } : response);
    });
  });

  const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
  const visible = element => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  };
  const activeDialog = () => {
    const dialogs = [...document.querySelectorAll('[role="dialog"], [aria-modal="true"]')].filter(visible);
    return dialogs.at(-1) || null;
  };
  const receivesPointer = element => {
    if (element.closest(':disabled, [aria-disabled="true"]') || getComputedStyle(element).pointerEvents === 'none') return false;
    const rect = element.getBoundingClientRect();
    const x = Math.floor(rect.left + rect.width / 2);
    const y = Math.floor(rect.top + rect.height / 2);
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return false;
    const top = document.elementFromPoint(x, y);
    return Boolean(top && (element === top || element.contains(top)));
  };
  const nameOf = element => normalize(element.getAttribute('aria-label') ||
    (element.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ') ||
    element.innerText || element.getAttribute('title'));

  function matches(step, includeHidden = false) {
    const type = step.locatorType || 'css';
    const value = step.locator ?? step.selector;
    if (!value) throw new Error('Locator is empty');
    let elements = [];
    if (type === 'css') elements = [...document.querySelectorAll(value)];
    else if (type === 'xpath') {
      const result = document.evaluate(value, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      for (let i = 0; i < result.snapshotLength; i++) elements.push(result.snapshotItem(i));
    } else if (type === 'role') {
      if (!step.role) throw new Error('Role is empty');
      const tags = { button: 'button', link: 'a', textbox: 'input,textarea' };
      elements = [...document.querySelectorAll(`[role="${CSS.escape(step.role)}"],${tags[step.role] || 'nosuchtag'}`)]
        .filter(element => nameOf(element) === normalize(value));
    } else if (type === 'text') {
      elements = [...document.querySelectorAll('button,a,[role="button"],[role="link"],label,span,p,div')]
        .filter(element => normalize(element.innerText) === normalize(value));
      elements = elements.filter(element => ![...element.children].some(child => normalize(child.innerText) === normalize(value)));
    } else if (type === 'label') {
      elements = [...document.querySelectorAll('label')]
        .filter(label => normalize(label.innerText) === normalize(value))
        .map(label => label.control || label.querySelector('input,textarea,select') || label);
      elements.push(...[...document.querySelectorAll('input[aria-label],textarea[aria-label],[contenteditable][aria-label]')]
        .filter(element => normalize(element.getAttribute('aria-label')) === normalize(value)));
    } else if (type === 'placeholder') {
      elements = [...document.querySelectorAll('input[placeholder],textarea[placeholder]')]
        .filter(element => normalize(element.getAttribute('placeholder')) === normalize(value));
    } else if (type === 'testid') {
      elements = [...document.querySelectorAll('[data-testid]')]
        .filter(element => element.getAttribute('data-testid') === value);
    } else throw new Error(`Unknown locator type: ${type}`);
    const candidates = [...new Set(elements)].filter(element => element instanceof Element && (includeHidden || visible(element)));
    const dialog = activeDialog();
    const insideDialog = dialog ? candidates.filter(element => dialog.contains(element)) : [];
    return insideDialog.length ? insideDialog : candidates;
  }

  async function find(step, includeHidden = false, actionable = false) {
    const deadline = Date.now() + (step.timeoutMs || 10000);
    while (Date.now() < deadline) {
      checkCancelled();
      const found = matches(step, includeHidden).filter(element => !actionable || receivesPointer(element));
      if (found.length) {
        if (step.index !== undefined) {
          if (found[step.index]) return found[step.index];
        } else if (found.length === 1) return found[0];
        else throw new Error(`Locator matches ${found.length} elements. Set index (0-based) or use a more specific locator.`);
      }
      await sleep(200);
    }
    throw new Error(`Element not actionable or not found: ${step.locator || step.selector}`);
  }

  function describe(element) {
    const role = element.getAttribute('role') || ({ BUTTON: 'button', A: 'link' })[element.tagName];
    const name = nameOf(element);
    if (role && name) return { locatorType: 'role', role, locator: name };
    if (element.getAttribute('placeholder')) return { locatorType: 'placeholder', locator: element.getAttribute('placeholder') };
    if (element.getAttribute('data-testid')) return { locatorType: 'testid', locator: element.getAttribute('data-testid') };
    if (element.id && !/\d{4,}/.test(element.id)) return { locatorType: 'css', locator: `#${CSS.escape(element.id)}` };
    const text = normalize(element.innerText);
    if (text && text.length < 100) return { locatorType: 'text', locator: text };
    const parts = [];
    for (let node = element; node && node !== document.body; node = node.parentElement) {
      const siblings = [...node.parentElement.children].filter(item => item.tagName === node.tagName);
      parts.unshift(`${node.tagName.toLowerCase()}:nth-of-type(${siblings.indexOf(node) + 1})`);
    }
    return { locatorType: 'css', locator: `body > ${parts.join(' > ')}` };
  }

  function startPicker(id) {
    picking = true;
    const outline = document.createElement('div');
    Object.assign(outline.style, { position: 'fixed', pointerEvents: 'none', border: '2px solid #587cff',
      background: '#587cff33', zIndex: '2147483647', left: '0', top: '0' });
    document.documentElement.append(outline);
    let selected = null;
    const move = event => {
      selected = event.target.closest('input,textarea,[contenteditable="true"],[contenteditable="plaintext-only"],button,[role="button"],a,select,label') || event.target;
      const rect = selected.getBoundingClientRect();
      Object.assign(outline.style, { left: `${rect.left}px`, top: `${rect.top}px`,
        width: `${rect.width}px`, height: `${rect.height}px` });
    };
    const finish = locator => {
      document.removeEventListener('mousemove', move, true);
      document.removeEventListener('click', click, true);
      document.removeEventListener('keydown', keydown, true);
      outline.remove(); picking = false; cancelPicker = null;
      send({ type: 'pickResult', payload: { id, locator } });
    };
    const click = event => {
      event.preventDefault(); event.stopImmediatePropagation();
      const element = selected || event.target;
      const locator = describe(element);
      const found = matches(locator);
      if (found.length > 1) {
        const index = found.findIndex(item => item === element || element.contains(item));
        if (index >= 0) locator.index = index;
      }
      finish(locator);
    };
    const keydown = event => { if (event.key === 'Escape') finish(null); };
    cancelPicker = () => finish(null);
    document.addEventListener('mousemove', move, true);
    document.addEventListener('click', click, true);
    document.addEventListener('keydown', keydown, true);
  }

  async function clickElement(step) {
    const point = await clickPoint(step);
    const response = await send({ type: 'input', kind: 'click', ...point, runId: currentRunId });
    if (!response?.ok) throw new Error(response?.error || 'Click failed');
  }

  async function clickPoint(step) {
    let element = await find(step);
    element.scrollIntoView({ block: 'center', inline: 'center' });
    await sleep(200);
    element = await find(step, false, true);
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) throw new Error('Element is not visible');
    return {
      x: Math.floor(rect.left + rect.width / 2),
      y: Math.floor(rect.top + rect.height / 2)
    };
  }

  function fileInputFor(element) {
    if (element instanceof HTMLInputElement && element.type === 'file') return element;
    if (element?.control instanceof HTMLInputElement && element.control.type === 'file') return element.control;
    const dialog = activeDialog();
    const modalInputs = dialog ? [...dialog.querySelectorAll('input[type="file"]')] : [];
    if (dialog && !dialog.contains(element) && modalInputs.length === 1) return modalInputs[0];
    const referenced = element?.getAttribute('for');
    if (referenced) {
      const input = document.getElementById(referenced);
      if (input instanceof HTMLInputElement && input.type === 'file') return input;
    }
    for (let parent = element, depth = 0; parent && depth < 4; parent = parent.parentElement, depth++) {
      const input = parent.querySelector('input[type="file"]');
      if (input) return input;
    }
    if (modalInputs.length === 1) return modalInputs[0];
    const inputs = [...document.querySelectorAll('input[type="file"]')];
    if (inputs.length === 1) return inputs[0];
    throw new Error(`Cannot identify file input (${inputs.length} found). Pick the upload button in the open dialog, or select its input[type=file].`);
  }

  async function fillDateTime(step) {
    await clickElement(step);
    const element = await find(step, false, true);
    if (!(element instanceof HTMLInputElement)) throw new Error('Ngày/giờ cần một input');
    const date = step.action === 'setDate';
    const value = String(step.value ?? '');
    if (date) {
      const parsed = new Date(`${value}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error('Ngày phải có định dạng YYYY-MM-DD hợp lệ');
    } else if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error('Giờ phải có định dạng HH:mm');
    let formatted = value;
    const nativeType = date ? 'date' : 'time';
    if (element.type !== nativeType) {
      if (!['text', 'search', 'tel'].includes(element.type)) throw new Error(`Input phải là ${nativeType} hoặc text`);
      if (date) {
        const [year, month, day] = value.split('-');
        const formats = { 'DD/MM/YYYY': `${day}/${month}/${year}`, 'MM/DD/YYYY': `${month}/${day}/${year}`, 'YYYY-MM-DD': value };
        formatted = formats[step.format || 'DD/MM/YYYY'];
        if (!formatted) throw new Error('Định dạng ngày không hỗ trợ');
      }
    }
    if (element.readOnly || element.disabled) throw new Error('Input ngày/giờ không cho phép nhập');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, formatted);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.blur();
    if (element.value !== formatted || !element.validity.valid) throw new Error('Trang từ chối giá trị ngày/giờ (kiểm tra min/max/step và định dạng)');
  }

  const isTextInput = element => element instanceof HTMLTextAreaElement ||
    (element instanceof HTMLInputElement && ['text', 'search', 'email', 'url', 'tel', 'password', 'number'].includes(element.type));
  function editableRoot(element) {
    if (!element) return null;
    if (isTextInput(element)) return element;
    if (element.isContentEditable) {
      while (element.parentElement?.isContentEditable) element = element.parentElement;
      return element;
    }
    return null;
  }
  function editableFor(target) {
    const direct = editableRoot(target) || editableRoot(target?.control);
    if (direct) return direct;
    const candidates = [...new Set([...target.querySelectorAll('input,textarea,[contenteditable]')].map(editableRoot).filter(Boolean))].filter(visible);
    if (candidates.length > 1) throw new Error('Vùng được chọn có nhiều ô nhập. Chọn chính xác input hoặc contenteditable.');
    return candidates[0] || null;
  }
  function positionCaret(element, clear) {
    if (element.readOnly || element.closest(':disabled,[aria-disabled="true"]')) throw new Error('Ô nhập bị khóa hoặc chỉ đọc');
    element.focus({ preventScroll: true });
    if (document.activeElement !== element && !element.contains(document.activeElement)) return false;
    if (isTextInput(element)) {
      if (clear) element.select();
      else if (typeof element.selectionStart === 'number') element.setSelectionRange(element.value.length, element.value.length);
      return true;
    }
    const selection = window.getSelection();
    const range = document.createRange(); range.selectNodeContents(element);
    if (!clear) range.collapse(false);
    selection.removeAllRanges(); selection.addRange(range);
    return element.contains(selection.anchorNode) && element.contains(selection.focusNode);
  }
  async function typeText(step) {
    const target = await find(step);
    const previousFocus = document.activeElement;
    let element = editableFor(target);
    const clickTarget = element || target;
    clickTarget.scrollIntoView({ block: 'center', inline: 'center' });
    await sleep(200);
    if (!receivesPointer(clickTarget)) throw new Error('Vùng nhập đang bị che hoặc không thể click');
    const rect = clickTarget.getBoundingClientRect();
    const clicked = await send({ type: 'input', kind: 'click', x: Math.floor(rect.left + rect.width / 2), y: Math.floor(rect.top + rect.height / 2) });
    if (!clicked?.ok) throw new Error(clicked?.error || 'Click input failed');
    const deadline = Date.now() + (step.timeoutMs ?? 10000);
    while (Date.now() < deadline) {
      checkCancelled();
      const active = editableRoot(document.activeElement);
      // Clicking a placeholder can replace it or open a separate editor.
      if (active && (active !== previousFocus || target.contains(active) || active.contains(target))) element = active;
      else if (target.isConnected) element = editableFor(target);
      if (element?.isConnected && visible(element) && positionCaret(element, step.clear !== false)) {
        const response = await send({ type: 'input', kind: 'text', text: String(step.text ?? ''), clear: step.clear !== false });
        if (!response?.ok) throw new Error(response?.error || 'Typing failed');
        return;
      }
      await sleep(100);
    }
    throw new Error('Không tìm thấy ô nhập có focus/con trỏ. Chọn input, textarea hoặc contenteditable.');
  }

  async function upload(step) {
    const hasLocator = Boolean(step.locator || step.selector);
    const target = hasLocator ? await find(step, ['css', 'xpath'].includes(step.locatorType || 'css')) : null;
    const isFileInput = target instanceof HTMLInputElement && target.type === 'file';
    let input = null;
    let prepared = false;
    let marker = '';
    const existingInputs = new Set(document.querySelectorAll('input[type="file"]'));
    try {
      if (target && !isFileInput) {
        const ready = await send({ type: 'input', kind: 'prepareUpload' });
        if (!ready?.ok) throw new Error(ready?.error || 'Cannot prepare file chooser');
        prepared = true;
        await clickElement(step);
      }

      const deadline = Date.now() + (step.timeoutMs || 10000);
      let chooserOpened = false;
      while (Date.now() < deadline) {
        checkCancelled();
        if (prepared) {
          const status = await send({ type: 'input', kind: 'chooserStatus' });
          if (!status?.ok) throw new Error(status?.error || 'Cannot check file chooser');
          if (status?.opened) { chooserOpened = true; break; }
        }
        try { input = fileInputFor(target); } catch { /* The dialog may still be rendering. */ }
        if (input) {
          const dialog = activeDialog();
          const isNewOrRelated = !existingInputs.has(input) || dialog?.contains(input) ||
            target?.contains(input) || target?.control === input;
          if (!prepared || isNewOrRelated) break;
        }
        await sleep(100);
      }
      if (prepared && !chooserOpened && input && existingInputs.has(input) &&
          !activeDialog()?.contains(input) && !target?.contains(input) && target?.control !== input) {
        throw new Error('Upload click did not open a file chooser or reveal a related file input');
      }
      if (!chooserOpened && !input) throw new Error('No file chooser or input[type=file] appeared after the upload click');
      if (input) {
        marker = `upload-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        input.setAttribute('data-local-agent-upload-id', marker);
      }
      const response = await send({
        type: 'input', kind: 'upload', filePath: step.filePath,
        selector: marker ? `[data-local-agent-upload-id="${marker}"]` : undefined
      });
      if (!response?.ok) throw new Error(response?.error || 'Upload failed');
      if (input) {
        const expected = step.filePath.split(/[\\/]/).pop();
        const verifyUntil = Date.now() + 2000;
        while (Date.now() < verifyUntil && input.files?.[0]?.name !== expected) await sleep(100);
        if (input.files?.[0]?.name !== expected) throw new Error('File was not selected by the page');
      }
      await sleep(step.waitAfterMs ?? 500);
    } finally {
      if (marker) input?.removeAttribute('data-local-agent-upload-id');
      if (prepared) await send({ type: 'input', kind: 'cancelUpload' });
    }
  }

  async function execute(step, runId) {
    switch (step.action) {
      case 'waitFor':
        await find(step, false, true);
        break;
      case 'click':
        await clickElement(step);
        break;
      case 'type': {
        await typeText(step);
        break;
      }
      case 'setDate':
      case 'setTime':
        await fillDateTime(step);
        break;
      case 'upload':
        await upload(step);
        break;
      case 'scroll':
        for (let i = 0; i < (step.times || 1); i++) {
          const state = await send({ type: 'state' });
          if (!state?.running || state.runId !== runId) throw new Error('Stopped');
          const response = await send({
            type: 'input', kind: 'wheel',
            x: Math.floor(innerWidth / 2), y: Math.floor(innerHeight / 2),
            pixels: step.pixels || 650
          });
          if (!response?.ok) throw new Error(response?.error || 'Scroll failed');
          if (i + 1 < (step.times || 1)) await sleep(step.intervalMs || 2500);
        }
        break;
      default:
        throw new Error(`Unsupported browser action: ${step.action}`);
    }
  }

  function conditionSatisfied(condition) {
    const elements = matches(condition);
    if (condition.state === 'hidden') return condition.index === undefined ? elements.length === 0 : !elements[condition.index];
    const element = condition.index === undefined ? (elements.length === 1 ? elements[0] : null) : elements[condition.index];
    return Boolean(element && (condition.state !== 'enabled' || receivesPointer(element)));
  }

  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message.type === 'cancelPicker') { cancelPicker?.(); respond({ ok: true }); return; }
    if (message.type === 'conditionStatus') {
      try { respond({ ok: true, satisfied: conditionSatisfied(message.condition) }); }
      catch (error) { respond({ ok: false, error: error.message }); }
      return;
    }
    if (message.type === 'cancel') {
      if (message.runId === currentRunId) { cancelled = true; actionAbort.abort(); }
      respond({ ok: true }); return;
    }
    if (message.type === 'ready') {
      respond({ ok: true, readyState: document.readyState, href: location.href, quietForMs: Date.now() - lastMutation });
      return;
    }
    if (message.type === 'startPicker') {
      if (!picking && !busy) startPicker(message.id);
      respond({ ok: true }); return;
    }
    if (!['execute', 'clickPoint'].includes(message.type)) return;
    if (busy || picking) { respond({ ok: false, error: 'Page is busy' }); return; }
    busy = true; currentRunId = message.runId; cancelled = false; actionAbort = new AbortController();
    (async () => {
      if (message.type === 'clickPoint') return { ok: true, ...await clickPoint(message.step) };
      await execute(message.step, message.runId);
      return { ok: true };
    })().catch(error => ({ ok: false, error: String(error.message || error) }))
      .then(respond).finally(() => { busy = false; currentRunId = null; });
    return true;
  });
  send({ type: 'wake' });
})();
