(() => {
  const originalFetch = window.fetch.bind(window), queue = [], seen = new Set();
  const dialog = document.createElement('dialog');
  dialog.setAttribute('aria-labelledby', 'issue-title');
  dialog.style.cssText = 'background:#142136;color:#edf2ff;border:1px solid #607897;border-radius:14px;padding:24px;width:calc(100% - 32px);max-width:600px;max-height:85vh;overflow:auto';
  const title = document.createElement('h2'); title.id = 'issue-title';
  const detail = document.createElement('p'); detail.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;margin:18px 0';
  const actions = document.createElement('div'); actions.style.cssText = 'display:flex;gap:12px;flex-wrap:wrap';
  dialog.append(title, detail, actions); document.body.append(dialog);
  let current;
  const token = document.querySelector('meta[name=local-agent-session]')?.content;
  function enqueue(issue) {
    if (!issue.key || seen.has(issue.key)) return;
    seen.add(issue.key); if (seen.size > 200) seen.delete(seen.values().next().value);
    queue.push(issue); render();
  }
  function render() {
    if (current || !queue.length) return;
    current = queue.shift(); title.textContent = current.run ? 'Tạm dừng: phát hiện trùng lặp' : 'Lỗi / sự cố';
    detail.textContent = current.text; actions.replaceChildren();
    for (const [label, proceed] of current.run ? [['Dừng tác vụ', false], ['Xác nhận tiếp tục', true]] : [['Đã hiểu', null]]) {
      const button = document.createElement('button'); button.textContent = label;
      button.addEventListener('click', async () => {
        for (const item of actions.children) item.disabled = true;
        try {
          if (current.run) {
            const run = current.run;
            const response = await originalFetch('/api/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Local-Agent-Session': token },
              body: JSON.stringify({ profile: run.profile, executionId: run.executionId, id: run.confirmation.id, proceed }), signal: AbortSignal.timeout(10000) });
            if (!response.ok) throw new Error((await response.json()).error || 'Không xác nhận được tác vụ');
          }
          current = null; dialog.close(); render();
        } catch (error) {
          detail.textContent += '\n' + error.message;
          for (const item of actions.children) item.disabled = false;
        }
      }); actions.append(button);
    }
    dialog.showModal();
  }
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    if (current && !current.run) { current = null; dialog.close(); render(); }
  });
  function inspect(data) {
    for (const run of data.profiles || (data.executionId ? [data] : [])) {
      for (let i = queue.length - 1; i >= 0; i--) if (queue[i].run?.profile === run.profile && queue[i].run.confirmation.id !== run.confirmation?.id) queue.splice(i, 1);
      if (current?.run?.profile === run.profile && current.run.confirmation.id !== run.confirmation?.id) { current = null; dialog.close(); render(); }
      if (run.confirmation) enqueue({ key: run.confirmation.id, run, text: `${run.profile} · Bước ${run.confirmation.step}\n${run.confirmation.message}\n${JSON.stringify(run.confirmation.matches || [], null, 2)}` });
      if (run.error) enqueue({ key: `${run.executionId}:${run.error}`, text: `${run.profile}: ${run.error}` });
    }
    if (data.storage?.error) enqueue({ key: data.storage.error, text: data.storage.error });
  }
  window.fetch = async (...args) => {
    try {
      const response = await originalFetch(...args);
      response.clone().json().then(data => {
        if (!response.ok && data.error) enqueue({ key: data.error, text: data.error });
        inspect(data);
      }).catch(() => {});
      return response;
    } catch (error) {
      enqueue({ key: error.message, text: `Không thực hiện được yêu cầu: ${error.message}` }); throw error;
    }
  };
  window.addEventListener('error', event => enqueue({ key: event.message, text: event.message }));
  window.addEventListener('unhandledrejection', event => enqueue({ key: String(event.reason?.message || event.reason), text: String(event.reason?.message || event.reason) }));
  for (const element of document.querySelectorAll('#message, #progress')) new MutationObserver(() => {
    if (element.classList.contains('error') && element.textContent) enqueue({ key: element.textContent, text: element.textContent });
  }).observe(element, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  // The scenario dashboard already polls all profiles; reuse those responses.
  if (location.pathname !== '/') {
    let pending = false;
    const poll = async () => {
      if (pending || document.hidden) return;
      pending = true;
      try { inspect(await (await window.fetch('/api/issues', { headers: { 'X-Local-Agent-Session': token }, signal: AbortSignal.timeout(10000) })).json()); }
      catch {} finally { pending = false; }
    };
    void poll(); setInterval(poll, 5000);
  }
})();
