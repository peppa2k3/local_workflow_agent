import { el } from './forms.js';

export function createConfirmations({ api, refresh, message }) {
  const noticeQueue = [];
  let notice;
  let activePrompt, submittedId;
  function closePrompt() {
    if (!activePrompt) return;
    clearInterval(activePrompt.timer);
    activePrompt.dialog.close();
    activePrompt.dialog.remove();
    activePrompt = null;
    showNotice();
  }
  function showPendingConfirmation(commands, deviceId, prompts = []) {
    const scheduled = commands.find(
      (cmd) => cmd.state === 'confirming' && cmd.confirmBy > Date.now() && cmd.id !== submittedId,
    );
    const pending = prompts.find(p => p.proceed === undefined && p.id !== submittedId &&
      (!p.expiresAt || p.expiresAt > Date.now()));
    const run =
      scheduled || (pending && { id: pending.runId, payload: pending, result: { confirmation: pending } }) ||
      commands
        .filter(
          (cmd) =>
            cmd.state === 'running' && !prompts.some(p => p.id === cmd.result?.confirmation?.id) &&
            cmd.result?.confirmation?.expiresAt > Date.now() &&
            cmd.downloadDecision?.id !== cmd.result.confirmation.id &&
            cmd.result.confirmation.id !== submittedId,
        )
        .sort((a, b) => a.result.confirmation.expiresAt - b.result.confirmation.expiresAt)[0];
    const confirmation = scheduled
      ? { id: scheduled.id, expiresAt: scheduled.confirmBy }
      : run?.result.confirmation;
    if (activePrompt?.id === confirmation?.id) return;
    closePrompt();
    if (!confirmation) return;
    const dialog = el('dialog', undefined, 'clip-picker');
    const title = el(
      'h2',
      scheduled
        ? 'Chạy kịch bản theo lịch?'
        : confirmation.message || (confirmation.reused
          ? 'Xác nhận dùng video đã lưu'
          : 'Xác nhận tải video'),
    );
    title.id = 'download-confirmation-title';
    dialog.setAttribute('aria-labelledby', title.id);
    dialog.addEventListener('cancel', (event) => event.preventDefault());
    const file = el('p', `Tên file: ${confirmation.name}`);
    const destination = el('p', `Đường dẫn trên máy local: ${confirmation.filePath}`);
    const remaining = el('p'),
      error = el('p', '', 'error'),
      actions = el('div', undefined, 'row');
    error.setAttribute('role', 'status');
    for (const [label, proceed] of [
      ['Yes', true],
      ['No', false],
    ]) {
      const button = el('button', label);
      button.addEventListener('click', async () => {
        for (const item of actions.children) item.disabled = true;
        error.textContent = '';
        try {
          await api(scheduled ? '/api/schedule-decision' : pending ? '/api/confirmation' : '/api/download-confirmation', {
            deviceId,
            runId: run.id,
            id: confirmation.id,
            proceed,
          });
          submittedId = confirmation.id;
          if (activePrompt?.id === confirmation.id) closePrompt();
          message('Đã gửi quyết định.');
          await refresh();
        } catch (e) {
          error.textContent = e.message;
          for (const item of actions.children) item.disabled = false;
        }
      });
      actions.append(button);
    }
    const update = () => {
      if (!confirmation.expiresAt) return;
      const seconds = Math.ceil((confirmation.expiresAt - Date.now()) / 1000);
      if (seconds <= 0) return closePrompt();
      if (confirmation.kind === 'dashboard') { remaining.textContent = 'Hết hạn sau ' + seconds + ' giây.'; return; }
      remaining.textContent = `Tự tiếp tục sau ${seconds} giây. No sẽ dừng lượt chạy.`;
    };
    if (scheduled) dialog.append(title, el('p', `${run.payload.scenario} · ${run.payload.profile}`));
    else
      dialog.append(
        title,
        confirmation.kind === 'dashboard' ? el('p', 'Yêu cầu từ dashboard local') :
          el('p', `${run.payload.scenario} · ${run.payload.profile} · Bước ${confirmation.step}`),
        ...(confirmation.name ? [file] : []),
        ...(confirmation.filePath ? [destination] : []),
      );
    if (confirmation.duplicate) dialog.append(el('p', 'URL đã có trong lịch sử tải.'));
    dialog.append(remaining, error, actions);
    activePrompt = { id: confirmation.id, dialog, timer: setInterval(update, 250) };
    document.body.append(dialog);
    dialog.showModal();
    update();
  }
  function popup(text) {
    noticeQueue.push(text);
    showNotice();
  }
  function showNotice() {
    if (activePrompt || notice || !noticeQueue.length) return;
    notice = el('dialog', undefined, 'task-notice');
    const close = el('button', 'Đã hiểu');
    close.addEventListener('click', () => notice.close());
    notice.append(el('h2', 'Thông báo tác vụ'), el('p', noticeQueue.shift()), close);
    notice.addEventListener('close', () => {
      notice.remove();
      notice = null;
      showNotice();
    });
    document.body.append(notice);
    notice.showModal();
  }
  function reset() {
    closePrompt();
    submittedId = null;
  }
  return { popup, closePrompt, showPendingConfirmation, reset };
}
