import { el } from './forms.js';

export function openClipPicker({ api, deviceId }, scenario, target, choose) {
  const dialog = el('dialog', undefined, 'clip-picker'),
    form = el('form');
  const title = el('h2', 'Chọn clip đã lưu trên thiết bị'),
    searchLabel = el('label', 'Tìm theo tên'),
    query = el('input'),
    search = el('button', 'Tìm clip');
  const status = el('p'),
    listLabel = el('label', 'File trong thư mục lưu trữ'),
    list = el('select'),
    use = el('button', 'Dùng clip'),
    cancel = el('button', 'Hủy');
  let pending;
  query.maxLength = 255;
  use.type = cancel.type = 'button';
  use.disabled = true;
  status.setAttribute('role', 'status');
  title.id = 'clip-picker-title';
  dialog.setAttribute('aria-labelledby', title.id);
  searchLabel.append(query);
  listLabel.append(list);
  form.append(searchLabel, search);
  dialog.append(title, form, status, listLabel, use, cancel);
  async function load() {
    pending?.abort();
    const controller = new AbortController(),
      signal = controller.signal;
    pending = controller;
    const requestId = crypto.randomUUID();
    list.replaceChildren();
    use.disabled = true;
    status.textContent = 'Đang đợi thiết bị đọc thư mục…';
    try {
      await api('/api/commands', {
        requestId,
        deviceId,
        type: 'browseClips',
        scenario,
        target,
        query: query.value,
      });
      const deadline = Date.now() + 30000;
      while (!signal.aborted && Date.now() < deadline) {
        const { commands } = await api(
          `/api/commands?device=${encodeURIComponent(deviceId)}&request=${requestId}`,
        );
        if (signal.aborted) return;
        const command = commands[0];
        if (command?.state === 'succeeded') {
          const { names, more } = command.result.clips;
          list.replaceChildren(...names.map((name) => new Option(name, name)));
          use.disabled = !names.length;
          status.textContent = more
            ? 'Hiện 60 clip đầu tiên. Nhập tên để tìm tiếp.'
            : names.length
              ? ''
              : 'Không tìm thấy clip.';
          return;
        }
        if (command && !['queued', 'dispatched'].includes(command.state))
          throw Error(command.result?.message || 'Thiết bị không trả về danh sách clip.');
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      if (!signal.aborted) throw Error('Thiết bị chưa trả lời. Thử tìm lại khi thiết bị online.');
    } catch (error) {
      if (!signal.aborted) status.textContent = error.message;
    }
  }
  form.onsubmit = (event) => {
    event.preventDefault();
    void load();
  };
  const closeClipPicker = () => {
    pending?.abort();
    dialog.close();
  };
  dialog.onclose = () => {
    pending?.abort();
    dialog.remove();
  };
  cancel.onclick = closeClipPicker;
  use.onclick = () => {
    choose(list.value);
    closeClipPicker();
  };
  document.body.append(dialog);
  dialog.showModal();
  void load();
  return closeClipPicker;
}
