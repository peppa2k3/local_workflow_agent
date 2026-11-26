import { el } from './forms.js';

export function createConfirmations({ api, refresh, message }) {
  const noticeQueue = [];
  let notice;
  let downloadPrompt, submittedDownload;
  function closeDownloadPrompt() {
    if (!downloadPrompt) return;
    clearInterval(downloadPrompt.timer);
    downloadPrompt.dialog.close();
    downloadPrompt.dialog.remove();
    downloadPrompt = null;
    showNotice();
  }
  function showDownloadConfirmation(commands, deviceId) {
    const scheduled = commands.find(
      (cmd) => cmd.state === 'confirming' && cmd.confirmBy > Date.now() && cmd.id !== submittedDownload,
    );
    const run =
      scheduled ||
      commands
        .filter(
          (cmd) =>
            cmd.state === 'running' &&
            cmd.result?.confirmation?.expiresAt > Date.now() &&
            cmd.downloadDecision?.id !== cmd.result.confirmation.id &&
            cmd.result.confirmation.id !== submittedDownload,
        )
        .sort((a, b) => a.result.confirmation.expiresAt - b.result.confirmation.expiresAt)[0];
    const confirmation = scheduled
      ? { id: scheduled.id, expiresAt: scheduled.confirmBy }
      : run?.result.confirmation;
    if (downloadPrompt?.id === confirmation?.id) return;
    closeDownloadPrompt();
    if (!confirmation) return;
    const dialog = el('dialog', undefined, 'clip-picker');
    const title = el(
      'h2',
      scheduled
        ? 'Chạy kịch bản theo lịch?'
        : confirmation.reused
          ? 'Xác nhận dùng video đã lưu'
          : 'Xác nhận tải video',
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
          await api(scheduled ? '/api/schedule-decision' : '/api/download-confirmation', {
            deviceId,
            runId: run.id,
            id: confirmation.id,
            proceed,
          });
          submittedDownload = confirmation.id;
          if (downloadPrompt?.id === confirmation.id) closeDownloadPrompt();
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
      const seconds = Math.ceil((confirmation.expiresAt - Date.now()) / 1000);
      if (seconds <= 0) return closeDownloadPrompt();
      remaining.textContent = `Tự tiếp tục sau ${seconds} giây. No sẽ dừng lượt chạy.`;
    };
    if (scheduled) dialog.append(title, el('p', `${run.payload.scenario} · ${run.payload.profile}`));
    else
      dialog.append(
        title,
        el('p', `${run.payload.scenario} · ${run.payload.profile} · Bước ${confirmation.step}`),
        file,
        destination,
      );
    if (confirmation.duplicate) dialog.append(el('p', 'URL đã có trong lịch sử tải.'));
    dialog.append(remaining, error, actions);
    downloadPrompt = { id: confirmation.id, dialog, timer: setInterval(update, 250) };
    document.body.append(dialog);
    dialog.showModal();
    update();
  }
  function popup(text) {
    noticeQueue.push(text);
    showNotice();
  }
  function showNotice() {
    if (downloadPrompt || notice || !noticeQueue.length) return;
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
    closeDownloadPrompt();
    submittedDownload = null;
  }
  return { popup, closeDownloadPrompt, showDownloadConfirmation, reset };
}
