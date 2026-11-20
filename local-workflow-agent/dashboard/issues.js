(() => {
  const originalFetch = window.fetch.bind(window), queue = [], seen = new Set();
  const dialog = document.createElement('dialog');
  dialog.setAttribute('aria-labelledby', 'issue-title');
  dialog.style.cssText = 'background:#142136;color:#edf2ff;border:1px solid #607897;border-radius:14px;padding:24px;width:calc(100% - 32px);max-width:600px;max-height:85vh;overflow:auto';
  const title = document.createElement('h2'); title.id = 'issue-title';
  const detail = document.createElement('p'); detail.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;margin:18px 0';
  const actions = document.createElement('div'); actions.style.cssText = 'display:flex;gap:12px;flex-wrap:wrap';
  dialog.append(title, detail, actions); document.body.append(dialog);
  let current, countdown;
  const token = document.querySelector('meta[name=local-agent-session]')?.content;
  const isDownload = issue => issue?.run?.confirmation.kind === 'download';
  function close() {
    clearInterval(countdown);
    current = null; dialog.close(); render();
  }
  function enqueue(issue) {
    if (!issue.key || seen.has(issue.key)) return;
    seen.add(issue.key); if (seen.size > 200) seen.delete(seen.values().next().value);
    if (isDownload(issue)) {
      if (current && !isDownload(current)) {
        queue.unshift(current);
        current = null; dialog.close();
      }
      queue.unshift(issue);
    } else queue.push(issue);
    render();
  }
  function render() {
    if (current || !queue.length) return;
    const issue = current = queue.shift(), download = isDownload(issue);
    title.textContent = download ? issue.run.confirmation.message : issue.run ? 'Tạm dừng: phát hiện trùng lặp' : 'Lỗi / sự cố';
    actions.replaceChildren();
    let errorText = '';
    const update = () => {
      const seconds = Math.ceil((issue.run.confirmation.expiresAt - Date.now()) / 1000);
      if (seconds <= 0) return close();
      detail.textContent = `${issue.text}\n\nTự tiếp tục sau ${seconds} giây. No sẽ dừng lượt chạy.${errorText}`;
    };
    detail.textContent = issue.text;
    if (download) {
      update();
      if (current !== issue) return;
      countdown = setInterval(update, 250);
    }
    const choices = download ? [['Yes', true], ['No', false]] : issue.run ? [['Dừng tác vụ', false], ['Xác nhận tiếp tục', true]] : [['Đã hiểu', null]];
    for (const [label, proceed] of choices) {
      const button = document.createElement('button'); button.textContent = label;
      button.addEventListener('click', async () => {
        for (const item of actions.children) item.disabled = true;
        try {
          if (issue.run) {
            const run = issue.run;
            const response = await originalFetch('/api/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Local-Agent-Session': token },
              body: JSON.stringify({ profile: run.profile, executionId: run.executionId, id: run.confirmation.id, proceed }), signal: AbortSignal.timeout(10000) });
            if (!response.ok) throw new Error((await response.json()).error || 'Không xác nhận được tác vụ');
          }
          if (current === issue) close();
        } catch (error) {
          if (current !== issue) return;
          errorText = '\n' + error.message;
          detail.textContent += errorText;
          for (const item of actions.children) item.disabled = false;
        }
      }); actions.append(button);
    }
    dialog.showModal();
  }
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    if (current && !current.run) close();
  });
  function inspect(data) {
    for (const run of data.profiles || (data.executionId ? [data] : [])) {
      for (let i = queue.length - 1; i >= 0; i--) if (queue[i].run?.profile === run.profile && queue[i].run.confirmation.id !== run.confirmation?.id) queue.splice(i, 1);
      if (current?.run?.profile === run.profile && current.run.confirmation.id !== run.confirmation?.id) close();
      if (run.confirmation) {
        const { id, kind, step, message, name, filePath, matches } = run.confirmation;
        const location = kind === 'download' ? `Tên file: ${name}\nĐường dẫn: ${filePath}${matches?.length ? '\nURL đã có trong lịch sử tải.' : ''}`
          : `${message}\n${JSON.stringify(matches || [], null, 2)}`;
        enqueue({ key: id, run, text: `${run.profile} · Bước ${step}\n${location}` });
      }
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
