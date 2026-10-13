(() => {
  let busy = false;
  let picking = false;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const send = message => new Promise(resolve => {
    chrome.runtime.sendMessage(message, response => {
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
      elements.push(...[...document.querySelectorAll('input[aria-label],textarea[aria-label]')]
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
      selected = event.target.closest('button,[role="button"],a,input,textarea,select,label') || event.target;
      const rect = selected.getBoundingClientRect();
      Object.assign(outline.style, { left: `${rect.left}px`, top: `${rect.top}px`,
        width: `${rect.width}px`, height: `${rect.height}px` });
    };
    const finish = locator => {
      document.removeEventListener('mousemove', move, true);
      document.removeEventListener('click', click, true);
      document.removeEventListener('keydown', keydown, true);
      outline.remove(); picking = false;
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
    document.addEventListener('mousemove', move, true);
    document.addEventListener('click', click, true);
    document.addEventListener('keydown', keydown, true);
  }

  async function clickElement(step) {
    let element = await find(step);
    element.scrollIntoView({ block: 'center', inline: 'center' });
    await sleep(200);
    element = await find(step, false, true);
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) throw new Error('Element is not visible');
    const response = await send({
      type: 'input', kind: 'click',
      x: Math.floor(rect.left + rect.width / 2),
      y: Math.floor(rect.top + rect.height / 2)
    });
    if (!response?.ok) throw new Error(response?.error || 'Click failed');
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
        await sleep(200);
      }

      const deadline = Date.now() + (step.timeoutMs || 10000);
      let chooserOpened = false;
      while (Date.now() < deadline) {
        if (prepared) {
          const status = await send({ type: 'input', kind: 'chooserStatus' });
          if (status?.opened) { chooserOpened = true; break; }
        }
        try { input = fileInputFor(target); } catch { /* The dialog may still be rendering. */ }
        if (input) {
          const dialog = activeDialog();
          const isNewOrRelated = !existingInputs.has(input) || dialog?.contains(input) ||
            target?.contains(input) || target?.control === input;
          if (!prepared || isNewOrRelated) break;
        }
        await sleep(200);
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
      case 'openUrl':
        await send({ type: 'result', payload: { runId, id: step.id, ok: true } });
        location.assign(step.url);
        return;
      case 'waitFor':
        await find(step, false, true);
        break;
      case 'click':
        await clickElement(step);
        await sleep(400);
        break;
      case 'type': {
        await clickElement(step);
        const element = await find(step);
        if (step.clear !== false && 'value' in element) {
          const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
          if (setter) setter.call(element, '');
          else element.value = '';
          element.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const response = await send({ type: 'input', kind: 'text', text: step.text });
        if (!response?.ok) throw new Error(response?.error || 'Typing failed');
        break;
      }
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
    await send({ type: 'result', payload: { runId, id: step.id, ok: true } });
  }

  setInterval(async () => {
    if (busy || picking) return;
    busy = true;
    try {
      const pick = await send({ type: 'pickNext' });
      if (pick?.active) { startPicker(pick.id); return; }
      const next = await send({ type: 'next' });
      if (next?.step) {
        try {
          await execute(next.step, next.runId);
        } catch (error) {
          await send({ type: 'result', payload: {
            runId: next.runId, id: next.step.id,
            ok: false, error: String(error.message || error)
          } });
        }
      }
    } finally {
      busy = false;
    }
  }, 700);
})();
