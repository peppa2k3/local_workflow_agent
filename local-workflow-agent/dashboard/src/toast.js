(() => {
  const key = 'local-dashboard.toasts.v1';
  const stack = document.createElement('div');
  stack.className = 'toast-stack';
  stack.setAttribute('aria-live', 'polite');
  stack.setAttribute('aria-relevant', 'additions');
  document.body.append(stack);
  const active = new Map();

  function save() {
    try {
      sessionStorage.setItem(key, JSON.stringify([...active.keys()]));
    } catch {
      /* Toasts still work when session storage is unavailable. */
    }
  }

  function mount(item) {
    const remaining = item.expires - Date.now();
    if (remaining <= 0) return;
    const element = document.createElement('div');
    element.className = 'toast toast-' + item.type;
    element.textContent = item.message;
    stack.append(element);
    const timer = setTimeout(() => {
      const positions = [...stack.children].map((el) => [el, el.getBoundingClientRect().top]);
      element.remove();
      active.delete(item);
      save();
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      for (const [el, top] of positions) {
        if (!el.isConnected) continue;
        el.getAnimations().forEach((animation) => animation.cancel());
        const offset = top - el.getBoundingClientRect().top;
        if (offset)
          el.animate([{ transform: 'translateY(' + offset + 'px)' }, { transform: 'none' }], {
            duration: 180,
            easing: 'ease-out',
          });
      }
    }, remaining);
    active.set(item, timer);
  }

  function restore() {
    for (const timer of active.values()) clearTimeout(timer);
    active.clear();
    stack.replaceChildren();
    try {
      for (const item of JSON.parse(sessionStorage.getItem(key) || '[]')) {
        if (
          item &&
          ['success', 'error'].includes(item.type) &&
          typeof item.message === 'string' &&
          Number.isFinite(item.expires)
        )
          mount(item);
      }
    } catch {
      /* Ignore invalid saved state. */
    }
    save();
  }
  function show(type, message) {
    if (!message) return;
    mount({ type, message: String(message), expires: Date.now() + 5000 });
    save();
  }
  window.toast = Object.freeze({
    success: (message) => show('success', message),
    error: (message) => show('error', message),
  });
  restore();
  addEventListener('pageshow', (event) => {
    if (event.persisted) restore();
  });
})();
