(() => {
  const $ = id => document.getElementById(id);
  let csrf = '', selected = '', devices = [], busy = false, timer, formSignature = '', historySignature = '', runIntent = null;
  let clipSelections = {}, closeClipPicker;
  const historyPageSize = 8, historyPages = new Map();
  let historyCommands = [];
  const stateName = { scheduled: 'Đã lên lịch', confirming: 'Chờ xác nhận', approved: 'Đã xác nhận', pending: 'Chờ thực hiện', queued: 'Đang đợi', dispatched: 'Đã gửi tới máy', running: 'Đang chạy', succeeded: 'Thành công', failed: 'Thất bại', cancelled: 'Đã dừng',
    interrupted: 'Bị gián đoạn', unknown: 'Chưa rõ kết quả — kiểm tra máy local', expired: 'Hết hạn', rejected: 'Máy local từ chối' };
  const historyTone = { succeeded: 'success', failed: 'failure', rejected: 'failure', running: 'active', dispatched: 'active',
    queued: 'pending', pending: 'pending', scheduled: 'pending', confirming: 'pending', approved: 'pending',
    interrupted: 'pending', expired: 'pending', unknown: 'pending' };
  const when = n => n ? new Date(n).toLocaleString('vi-VN') : 'Chưa nhận heartbeat';
  function el(tag, text, className) { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (className) n.className = className; return n; }
  function editScheduleTime(timestamp, save) {
    const details = document.createElement('details'), summary = document.createElement('summary');
    summary.textContent = 'Đổi giờ';
    const input = document.createElement('input'), button = document.createElement('button');
    input.type = 'datetime-local';
    input.setAttribute('aria-label', 'Giờ chạy mới');
    const date = new Date(timestamp);
    input.value = new Date(timestamp - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    button.textContent = 'Lưu giờ mới';
    button.onclick = () => save(new Date(input.value).getTime(), button);
    details.append(summary, input, button);
    return details;
  }
  const scheduleTime = $('schedule-at');
  let followClock = true;
  function setScheduleTime(offset = 0) {
    const date = new Date(Date.now() + offset * 60000);
    scheduleTime.value = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }
  scheduleTime.oninput = () => { followClock = false; };
  $('schedule-now').onclick = () => { runIntent = null; followClock = true; setScheduleTime(); };
  $('schedule-later').onclick = () => { runIntent = null; followClock = false; setScheduleTime(15); };
  setScheduleTime();
  function selectedTime() {
    if (followClock) setScheduleTime();
    const time = new Date(scheduleTime.value).getTime();
    if (!Number.isFinite(time) || time < Math.floor(Date.now() / 60000) * 60000) throw Error('Chọn phút hiện tại hoặc tương lai.');
    return time;
  }
  const notices = new Set(), noticeQueue = [];
  const reportedResults = new Map();
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
    const scheduled = commands.find(cmd => cmd.state === 'confirming' && cmd.confirmBy > Date.now() && cmd.id !== submittedDownload);
    const run = scheduled || commands.filter(cmd => cmd.state === 'running' && cmd.result?.confirmation?.expiresAt > Date.now()
      && cmd.downloadDecision?.id !== cmd.result.confirmation.id && cmd.result.confirmation.id !== submittedDownload)
      .sort((a, b) => a.result.confirmation.expiresAt - b.result.confirmation.expiresAt)[0];
    const confirmation = scheduled ? { id: scheduled.id, expiresAt: scheduled.confirmBy } : run?.result.confirmation;
    if (downloadPrompt?.id === confirmation?.id) return;
    closeDownloadPrompt();
    if (!confirmation) return;
    const dialog = el('dialog', undefined, 'clip-picker');
    const title = el('h2', scheduled ? 'Chạy kịch bản theo lịch?' : confirmation.reused ? 'Xác nhận dùng video đã lưu' : 'Xác nhận tải video');
    title.id = 'download-confirmation-title';
    dialog.setAttribute('aria-labelledby', title.id);
    dialog.addEventListener('cancel', event => event.preventDefault());
    const file = el('p', `Tên file: ${confirmation.name}`);
    const destination = el('p', `Đường dẫn trên máy local: ${confirmation.filePath}`);
    const remaining = el('p'), error = el('p', '', 'error'), actions = el('div', undefined, 'row');
    error.setAttribute('role', 'status');
    for (const [label, proceed] of [['Yes', true], ['No', false]]) {
      const button = el('button', label);
      button.addEventListener('click', async () => {
        for (const item of actions.children) item.disabled = true;
        error.textContent = '';
        try {
          await api(scheduled ? '/api/schedule-decision' : '/api/download-confirmation', { deviceId, runId: run.id, id: confirmation.id, proceed });
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
    else dialog.append(title, el('p', `${run.payload.scenario} · ${run.payload.profile} · Bước ${confirmation.step}`), file, destination);
    if (confirmation.duplicate) dialog.append(el('p', 'URL đã có trong lịch sử tải.'));
    dialog.append(remaining, error, actions);
    downloadPrompt = { id: confirmation.id, dialog, timer: setInterval(update, 250) };
    document.body.append(dialog); dialog.showModal(); update();
  }
  function popup(text, fromHistory = false) {
    if (!text || (!fromHistory && notices.has(text))) return;
    if (!fromHistory) {
      notices.add(text);
      if (notices.size > 200) notices.delete(notices.values().next().value);
    }
    noticeQueue.push(text); showNotice();
  }
  function showNotice() {
    if (downloadPrompt || notice || !noticeQueue.length) return;
    notice = el('dialog'); notice.style.cssText = 'max-width:560px;width:calc(100% - 32px);background:#142136;color:#edf2ff;border:1px solid #607897;border-radius:14px;padding:24px;overflow-wrap:anywhere';
    const close = el('button', 'Đã hiểu'); close.addEventListener('click', () => notice.close());
    notice.append(el('h2', 'Thông báo tác vụ'), el('p', noticeQueue.shift()), close);
    notice.addEventListener('close', () => { notice.remove(); notice = null; showNotice(); });
    document.body.append(notice); notice.showModal();
  }
  function message(text, error = false) { $('message').textContent = text; $('message').className = error ? 'notice error' : 'notice'; $('message').hidden = !text; if (error) popup(text); }
  async function api(route, data) {
    const r = await fetch(route, { method: data === undefined ? 'GET' : 'POST', credentials: 'same-origin', redirect: 'error',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrf }, body: data === undefined ? undefined : JSON.stringify(data), signal: AbortSignal.timeout(18000) });
    const value = await r.json();
    if (!r.ok) { if (r.status === 401) loginView(); throw Error(value.error || 'Yêu cầu thất bại'); } return value;
  }
  function loginView() {
    closeClipPicker?.(); closeDownloadPrompt(); submittedDownload = null; csrf = ''; selected = ''; devices = []; formSignature = ''; runIntent = null;
    historyPages.clear(); reportedResults.clear(); resetHistory();
    clearTimeout(timer); $('workspace').hidden = true; $('account').hidden = true; $('login').hidden = false;
  }
  function accountView(value) { csrf = value.csrf; $('email').textContent = value.email; $('account').hidden = false; $('login').hidden = true; $('workspace').hidden = false; }
  function options(target, items, valueKey, labelKey) { const old = target.value; target.replaceChildren(...items.map(item => { const n = el('option', item[labelKey]); n.value = item[valueKey]; return n; })); if (items.some(i => i[valueKey] === old)) target.value = old; }
  function clipPicker(scenario, target, choose) {
    const deviceId = selected, dialog = el('dialog', undefined, 'clip-picker'), form = el('form');
    const title = el('h2', 'Chọn clip đã lưu trên thiết bị'), searchLabel = el('label', 'Tìm theo tên'), query = el('input'), search = el('button', 'Tìm clip');
    const status = el('p'), listLabel = el('label', 'File trong thư mục lưu trữ'), list = el('select'), use = el('button', 'Dùng clip'), cancel = el('button', 'Hủy');
    let pending;
    query.maxLength = 255; use.type = cancel.type = 'button'; use.disabled = true; status.setAttribute('role', 'status');
    title.id = 'clip-picker-title'; dialog.setAttribute('aria-labelledby', title.id);
    searchLabel.append(query); listLabel.append(list); form.append(searchLabel, search);
    dialog.append(title, form, status, listLabel, use, cancel);
    async function load() {
      pending?.abort();
      const controller = new AbortController(), signal = controller.signal;
      pending = controller;
      const requestId = crypto.randomUUID();
      list.replaceChildren(); use.disabled = true; status.textContent = 'Đang đợi thiết bị đọc thư mục…';
      try {
        await api('/api/commands', { requestId, deviceId, type: 'browseClips', scenario, target, query: query.value });
        const deadline = Date.now() + 30000;
        while (!signal.aborted && Date.now() < deadline) {
          const { commands } = await api(`/api/commands?device=${encodeURIComponent(deviceId)}&request=${requestId}`);
          if (signal.aborted) return;
          const command = commands[0];
          if (command?.state === 'succeeded') {
            const { names, more } = command.result.clips;
            list.replaceChildren(...names.map(name => new Option(name, name)));
            use.disabled = !names.length;
            status.textContent = more ? 'Hiện 60 clip đầu tiên. Nhập tên để tìm tiếp.' : names.length ? '' : 'Không tìm thấy clip.';
            return;
          }
          if (command && !['queued', 'dispatched'].includes(command.state)) throw Error(command.result?.message || 'Thiết bị không trả về danh sách clip.');
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
        if (!signal.aborted) throw Error('Thiết bị chưa trả lời. Thử tìm lại khi thiết bị online.');
      } catch (error) { if (!signal.aborted) status.textContent = error.message; }
    }
    form.onsubmit = event => { event.preventDefault(); void load(); };
    closeClipPicker = () => { pending?.abort(); dialog.close(); };
    dialog.onclose = () => { pending?.abort(); closeClipPicker = null; dialog.remove(); };
    cancel.onclick = closeClipPicker;
    use.onclick = () => { choose(list.value); closeClipPicker(); };
    document.body.append(dialog); dialog.showModal(); void load();
  }
  function renderVariables() {
    closeClipPicker?.();
    runIntent = null;
    clipSelections = {};
    const d = devices.find(d => d.id === selected), s = d?.metadata.scenarios?.find(s => s.name === $('run-scenario').value);
    $('variables').replaceChildren();
    for (const name of s?.variables || []) {
      const row = el('div', undefined, 'two'), label = el('label', `Thay giá trị ${name}`), check = el('input'), input = el('input');
      check.type = 'checkbox'; check.dataset.variable = name; label.prepend(check); input.disabled = true; input.maxLength = 4000;
      input.setAttribute('aria-label', `Giá trị ${name}`); check.addEventListener('change', () => { input.disabled = !check.checked; });
      row.append(label, input);
      const target = s.clipTargets?.find(target => target.variable === name);
      if (target) {
        const choose = el('button', `Chọn clip cho ${name}…`); choose.type = 'button';
        choose.onclick = () => clipPicker(s.name, target.id, file => {
          input.value = 'clip:' + file; check.checked = true; input.disabled = false; runIntent = null;
        });
        row.append(choose);
      }
      $('variables').append(row);
    }
    for (const target of s?.clipTargets || []) {
      const row = el('div', undefined, 'row'), name = el('small');
      const choose = el('button', `Chọn clip · Bước ${target.index + 1} (${target.action === 'upload' ? 'Upload' : 'Nguồn video'})`);
      const clear = el('button', 'Bỏ chọn'); choose.type = clear.type = 'button'; clear.hidden = true;
      choose.onclick = () => clipPicker(s.name, target.id, file => {
        clipSelections[target.id] = file; name.textContent = file; clear.hidden = false; runIntent = null;
      });
      clear.onclick = () => { delete clipSelections[target.id]; name.textContent = ''; clear.hidden = true; runIntent = null; };
      row.append(choose, name, clear); $('variables').append(row);
    }
  }
  function renderDevices() {
    $('devices').replaceChildren(...devices.map(d => {
      const n = el('button', undefined, 'device' + (d.id === selected ? ' selected' : ''));
      n.append(el('strong', d.name), el('span', d.revoked ? 'Đã thu hồi' : d.online ? 'Online' : 'Offline', 'badge ' + (d.online ? 'online' : 'offline')));
      n.addEventListener('click', () => {
        if (selected !== d.id) {
          closeDownloadPrompt(); selected = d.id; formSignature = ''; runIntent = null;
          resetHistory('Đang tải lịch sử…'); renderDevices(); renderDetail();
        }
        void refresh();
      });
      return n;
    }));
    if (!devices.length) $('devices').append(el('p', 'Chưa ghép thiết bị nào.', 'muted'));
  }
  function renderDetail() {
    const d = devices.find(d => d.id === selected); $('detail').hidden = !d; $('empty').hidden = !!d; if (!d) return;
    $('device-name').textContent = d.name; $('device-status').textContent = d.revoked ? 'Đã thu hồi' : d.online ? 'Online' : 'Offline';
    $('device-status').className = 'badge ' + (d.online ? 'online' : 'offline'); $('device-seen').textContent = `Lần cuối kết nối: ${when(d.lastSeen)}`;
    const activity = d.activity;
    $('activity').textContent = activity ? [
      activity.enabled ? 'Scan bật' : 'Scan tắt', activity.scanning ? 'Đang quét' : 'Chờ quét',
      activity.runningCount + ' scenario đang chạy', ...activity.active.map(run => run.scenario + ' (' + run.profile + ', ' + (run.remote ? 'remote' : 'local') + ', ' + run.id + ')'),
      d.online && activity.canAccept ? 'Có thể nhận task' : 'Chưa thể nhận task', when(activity.updatedAt)
    ].join(' · ') : 'Chưa có trạng thái scanner.';
    const p = d.metadata.performance || {};
    const rate = key => d.online && Number.isFinite(d.metadata.network?.[key]) ? `${d.metadata.network[key].toFixed(2)} Mbps` : '—';
    $('metrics').replaceChildren(...[[`${p.cpuPercent || 0}%`, 'CPU agent'], [`${p.memoryMb || 0} MB`, 'RAM agent'], [`${Math.floor((d.metadata.uptime || 0) / 60)} phút`, 'Uptime agent'],
      [rate('downloadMbps'), 'Tải xuống'], [rate('uploadMbps'), 'Tải lên']].map(([v, k]) => {
      const n = el('div', undefined, 'metric'); n.append(el('strong', v), el('small', k)); return n;
    }));
    $('profiles').textContent = (d.metadata.profiles || []).map(p => `${p.name}: ${p.extensionConnected ? 'extension đã kết nối' : 'extension offline'}${p.running ? ' · đang có tác vụ' : ''}`).join(' | ') || 'Máy chưa cấp quyền profile/kịch bản. Thiết lập tại trang Remote của máy local.';
    renderLocalTasks(d);
    $('revoke').disabled = d.revoked;
    $('remove-device').hidden = d.online;
    const signature = JSON.stringify([d.id, d.metadata.profiles?.map(p => [p.directory, p.name]), d.metadata.scenarios]);
    if (signature !== formSignature) { options($('run-profile'), d.metadata.profiles || [], 'directory', 'name'); options($('run-scenario'), d.metadata.scenarios || [], 'name', 'name'); renderVariables(); formSignature = signature; }
    if (followClock && document.activeElement !== scheduleTime) setScheduleTime();
    $('schedule-create').disabled = d.revoked || !$('run-profile').value || !$('run-scenario').value;
    $('run').disabled = !d.online || d.revoked || !$('run-profile').value || !$('run-scenario').value;
  }
  function renderLocalTasks(device) {
    $('local-tasks').hidden = !device.localTasks;
    if (!device.localTasks) return;
    const { tasks, omitted } = device.localTasks;
    $('local-tasks-notice').textContent = [
      !device.online && 'Thiết bị offline · hiển thị dữ liệu từ lần kết nối cuối.',
      omitted > 0 && `Còn ${omitted} tác vụ vượt giới hạn đồng bộ.`
    ].filter(Boolean).join(' ');
    function renderList(id, list, empty) {
      const target = $(id);
      const signature = JSON.stringify([device.id, device.online, list]);
      if (target.dataset.signature === signature) return;
      target.dataset.signature = signature;
      const rows = list.map(task => {
        const row = el('article', undefined, 'run');
        row.append(el('strong', `${task.scenario} · ${task.profile}`));
        row.append(el('p', task.state === 'running' ? `Tiến độ ${Math.min(task.index + 1, task.total)}/${task.total}`
          : `${when(task.scheduledAt)} · ${stateName[task.state]}`));
        async function manage(action, scheduledAt) {
          await api('/api/commands', { requestId: crypto.randomUUID(), deviceId: device.id, type: 'manageLocalTask',
            taskId: task.id, profile: task.profile, scenario: task.scenario, action, expectedTime: task.scheduledAt, scheduledAt });
          message('Đã gửi yêu cầu đến máy local.');
          await refresh();
        }
        function actionButton(label, action) {
          const button = el('button', label);
          button.onclick = () => submit(button, () => manage(action));
          row.append(button);
        }
        if (!device.online) return row;
        if (task.state === 'running') actionButton('Dừng lượt local', 'stop');
        if (task.state === 'confirming' && task.confirmBy > Date.now()) actionButton('Chạy ngay', 'confirm');
        if (task.state === 'scheduled' || task.state === 'confirming' && task.confirmBy > Date.now()) actionButton('Hủy lịch', 'cancel');
        if (task.state === 'scheduled') row.append(editScheduleTime(task.scheduledAt,
          (scheduledAt, button) => submit(button, () => manage('reschedule', scheduledAt))));
        return row;
      });
      target.replaceChildren(...(rows.length ? rows : [el('p', empty, 'muted')]));
    }
    renderList('local-running', tasks.filter(task => task.state === 'running'), 'Chưa có lượt chạy local.');
    renderList('local-schedules', tasks.filter(task => task.state !== 'running'), 'Chưa có lịch local đang chờ.');
  }
  function resetHistory(message) {
    historyCommands = []; historySignature = '';
    $('history').replaceChildren(...(message ? [el('p', message, 'history-empty')] : []));
    $('history-pagination').hidden = true;
  }
  function updateHistory(commands, deviceId) {
    const previousResults = reportedResults.get(deviceId);
    const withResults = commands.filter(cmd => cmd.result?.message);
    reportedResults.set(deviceId, new Set(withResults.map(cmd => cmd.id)));
    if (previousResults) for (const cmd of withResults) {
      if (!previousResults.has(cmd.id)) popup(`${cmd.payload.scenario || cmd.type}: ${cmd.result.message}`, true);
    }
    historyCommands = [...commands].sort((a, b) => b.created - a.created);
    renderHistory(deviceId);
  }
  function renderHistory(deviceId) {
    const total = historyCommands.length;
    const pages = Math.ceil(total / historyPageSize);
    const page = Math.max(0, Math.min(historyPages.get(deviceId) ?? 0, pages - 1));
    historyPages.set(deviceId, page);
    const start = page * historyPageSize;
    const visible = historyCommands.slice(start, start + historyPageSize);
    const pageLabel = total ? `Trang ${page + 1}/${pages} · ${start + 1}–${start + visible.length}/${total} lệnh` : '';
    if ($('history-page').textContent !== pageLabel) $('history-page').textContent = pageLabel;
    $('history-pagination').hidden = pages <= 1;
    $('history-prev').disabled = page === 0;
    $('history-next').disabled = page >= pages - 1;

    const signature = JSON.stringify(visible);
    if (historySignature === signature) return;
    historySignature = signature;
    const open = new Set([...$('history').querySelectorAll('details[data-id][open]')].map(n => n.dataset.id));
    $('history').replaceChildren(...visible.map(cmd => {
      const tone = historyTone[cmd.state] || 'neutral';
      const n = el('article', undefined, `run history-task history-task--${tone}`);
      const heading = el('div', undefined, 'history-task-heading');
      const title = el('div');
      const action = cmd.type === 'manageLocalTask' ? 'Yêu cầu quản lý tác vụ local' : 'Yêu cầu dừng tác vụ';
      title.append(el('h3', cmd.payload.scenario || action));
      if (cmd.payload.profile) title.append(el('p', `Profile · ${cmd.payload.profile}`, 'history-profile'));
      if (cmd.type !== 'run' && cmd.payload.scenario) title.append(el('small', action));
      heading.append(title, el('span', stateName[cmd.state] || cmd.state, 'badge history-status'));
      n.append(heading);

      const result = cmd.result;
      const times = el('dl', undefined, 'history-times');
      for (const [label, timestamp] of [['Tạo lệnh', cmd.created], ['Giờ đã đặt', cmd.payload.scheduledAt],
        ['Bắt đầu', result?.startedAt], ['Kết thúc', result?.endedAt]]) {
        const date = new Date(timestamp);
        if (!Number.isFinite(timestamp) || !Number.isFinite(date.getTime())) continue;
        const field = el('div'), time = el('time', date.toLocaleString('vi-VN'));
        time.dateTime = date.toISOString();
        const value = el('dd'); value.append(time);
        field.append(el('dt', label), value); times.append(field);
      }
      n.append(times);
      if (cmd.state === 'scheduled') {
        const cancel = el('button', 'Hủy lịch');
        cancel.onclick = () => submit(cancel, async () => {
          await api('/api/schedule-decision', { deviceId, runId: cmd.id, proceed: false });
          await refresh();
        });
        n.append(cancel, editScheduleTime(cmd.payload.scheduledAt, (scheduledAt, button) => submit(button, async () => {
          await api('/api/schedule-decision', { deviceId, runId: cmd.id, scheduledAt });
          await refresh();
        })));
      }
      if (result?.total) {
        const step = cmd.state === 'succeeded' ? result.total : Math.min(result.index + 1, result.total);
        const label = result.stoppedAtStep ? `Dừng tại bước ${result.stoppedAtStep}/${result.total}` : `Tiến độ ${step}/${result.total}`;
        const progress = el('progress'); progress.max = result.total; progress.value = cmd.state === 'succeeded' ? result.total : result.index;
        progress.setAttribute('aria-label', label);
        n.append(el('p', label, 'history-progress'), progress);
      }
      if (result?.message) n.append(el('p', result.message, 'history-result'));
      const details = el('details', undefined, 'history-details');
      details.dataset.id = cmd.id; details.open = open.has(cmd.id);
      details.append(el('summary', result?.steps?.length ? 'Chi tiết từng bước' : 'Chi tiết lệnh'), el('small', `ID · ${cmd.id}`));
      if (result?.steps?.length) {
        const list = el('ol');
        list.append(...result.steps.map(s => el('li', `${s.label || s.action} — ${stateName[s.state] || s.state}`)));
        details.append(list);
      }
      n.append(details);
      if (cmd.type === 'run' && ['queued', 'dispatched', 'running', 'unknown'].includes(cmd.state)) {
        const stop = el('button', 'Dừng lượt này', 'danger'); stop.addEventListener('click', () => submit(stop, async () => {
          await api('/api/commands', { requestId: crypto.randomUUID(), deviceId, type: 'stop', runId: cmd.id }); message('Đã gửi lệnh dừng.'); await refresh();
        })); n.append(stop);
      }
      return n;
    }));
    if (!total) $('history').append(el('p', 'Chưa có lệnh điều khiển.', 'history-empty'));
  }
  async function refresh() {
    if (busy || !csrf || document.hidden) return; busy = true; clearTimeout(timer);
    let deviceId = selected;
    try {
      devices = (await api('/api/devices')).devices;
      if (selected && !devices.some(d => d.id === selected)) {
        closeDownloadPrompt(); closeClipPicker?.();
        selected = ''; formSignature = ''; runIntent = null; resetHistory();
      }
      renderDevices(); renderDetail();
      deviceId = selected;
      if (deviceId) {
        const { commands } = await api(`/api/commands?device=${encodeURIComponent(deviceId)}`);
        if (selected === deviceId) {
          showDownloadConfirmation(commands, deviceId);
          updateHistory(commands, deviceId);
        }
      }
    } catch (e) { message(e.message, true); }
    finally { busy = false; if (csrf) timer = setTimeout(refresh, deviceId === selected ? 5000 : 0); }
  }
  async function submit(button, fn) { button.disabled = true; try { await fn(); } catch (e) { message(e.message, true); } finally { button.disabled = false; if (csrf && ['run', 'schedule-create', 'revoke'].includes(button.id)) renderDetail(); } }
  $('login-form').addEventListener('submit', event => { event.preventDefault(); void submit(event.submitter, async () => {
    const form = new FormData(event.target); accountView(await api('/api/login', Object.fromEntries(form))); event.target.reset(); message(''); await refresh();
  }); });
  $('logout').addEventListener('click', () => submit($('logout'), async () => { await api('/api/logout', {}); loginView(); message('Đã đăng xuất.'); }));
  for (const [id, offset] of [['history-prev', -1], ['history-next', 1]]) {
    $(id).addEventListener('click', () => {
      historyPages.set(selected, historyPages.get(selected) + offset);
      renderHistory(selected);
    });
  }
  $('pair-form').addEventListener('submit', event => { event.preventDefault(); void submit(event.submitter, async () => {
    const value = await api('/api/pair-claim', { code: new FormData(event.target).get('code') }); event.target.reset(); message(`Đã nhận mã của ${value.name}. Hãy xác nhận tài khoản trên máy local trước ${when(value.expires)}.`); await refresh();
  }); });
  $('run-scenario').addEventListener('change', renderVariables);
  $('run-form').addEventListener('input', () => { runIntent = null; });
  $('run-form').addEventListener('change', () => { runIntent = null; });
  $('run-form').addEventListener('submit', event => { event.preventDefault(); void submit(event.submitter, async () => {
    const variables = Object.fromEntries([...$('variables').querySelectorAll('input[type=checkbox]:checked')].map(check => [check.dataset.variable, check.closest('.two').querySelector('input:not([type=checkbox])').value]));
    const scheduled = event.submitter?.id === 'schedule-create';
    const payload = { ...(scheduled && { scheduledAt: selectedTime() }), deviceId: selected, type: 'run', profile: $('run-profile').value, scenario: $('run-scenario').value, variables,
      ...(Object.keys(clipSelections).length ? { clips: { ...clipSelections } } : {}) };
    // Preserve the key after a lost HTTP response so retry does not create a second run.
    if (runIntent && Boolean(runIntent.scheduledAt) !== scheduled) runIntent = null;
    runIntent ||= { requestId: crypto.randomUUID(), ...payload };
    await api('/api/commands', runIntent); runIntent = null; message(scheduled ? 'Đã lưu lịch chạy.' : 'Đã gửi lệnh chạy. Máy local sẽ xác nhận và cập nhật tiến độ.'); await refresh();
  }); });
  $('remove-device').addEventListener('click', () => submit($('remove-device'), async () => {
    const device = devices.find(d => d.id === selected);
    if (!device || device.online || !confirm(`Gỡ “${device.name}” khỏi danh sách? Máy sẽ cần ghép nối lại để kết nối.`)) return;
    try {
      await api('/api/device-remove', { id: device.id });
      message('Đã gỡ thiết bị khỏi danh sách.');
    } finally { await refresh(); }
  }));
  $('revoke').addEventListener('click', () => submit($('revoke'), async () => {
    if (!confirm('Thu hồi quyền điều khiển máy này? Máy local sẽ dừng tác vụ remote khi nhận thông báo.')) return;
    await api('/api/device-revoke', { id: selected }); message('Đã thu hồi kết nối.'); await refresh();
  }));
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearTimeout(timer); else void refresh(); });
  void api('/api/me').then(async value => { accountView(value); await refresh(); }).catch(() => loginView());
})();
