import { createHistory } from './history.jsx';
import { openClipPicker } from './clipPicker.js';
import { el } from './forms.js';
import { renderLocalTasks } from './localTasks.js';
import { createConfirmations } from './confirmations.js';
import { createRoot } from 'react-dom/client';
import { DeviceList } from './DeviceList.jsx';
import { createApi } from '../shared/api.js';

export function start() {
  const $ = (id) => document.getElementById(id);
  let csrf = '',
    selected = '',
    devices = [],
    busy = false,
    timer,
    formSignature = '',
    runIntent = null;
  let clipSelections = {},
    closeClipPicker;
  const when = (n) => (n ? new Date(n).toLocaleString('vi-VN') : 'Chưa nhận heartbeat');
  const scheduleTime = $('schedule-at');
  let followClock = true;
  function setScheduleTime(offset = 0) {
    const date = new Date(Date.now() + offset * 60000);
    scheduleTime.value = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  }
  scheduleTime.oninput = () => {
    followClock = false;
  };
  $('schedule-now').onclick = () => {
    runIntent = null;
    followClock = true;
    setScheduleTime();
  };
  $('schedule-later').onclick = () => {
    runIntent = null;
    followClock = false;
    setScheduleTime(15);
  };
  setScheduleTime();
  function selectedTime() {
    if (followClock) setScheduleTime();
    const time = new Date(scheduleTime.value).getTime();
    if (!Number.isFinite(time) || time < Math.floor(Date.now() / 60000) * 60000)
      throw Error('Chọn phút hiện tại hoặc tương lai.');
    return time;
  }
  function message(text, error = false) {
    if (text) toast[error ? 'error' : 'success'](text);
  }
  const api = createApi(() => csrf, loginView);
  const { popup, closeDownloadPrompt, showDownloadConfirmation, reset } = createConfirmations({
    api,
    refresh,
    message,
  });
  const { resetHistory, updateHistory, clearHistory } = createHistory({
    $,
    api,
    submit,
    popup,
    message,
    refresh,
    getDevice: () => selected,
  });
  function loginView() {
    closeClipPicker?.();
    reset();
    csrf = '';
    selected = '';
    devices = [];
    formSignature = '';
    runIntent = null;
    clearHistory();
    clearTimeout(timer);
    $('workspace').hidden = true;
    $('account').hidden = true;
    $('login').hidden = false;
  }
  function accountView(value) {
    csrf = value.csrf;
    $('email').textContent = value.email;
    $('account').hidden = false;
    $('login').hidden = true;
    $('workspace').hidden = false;
  }
  function options(target, items, valueKey, labelKey) {
    const old = target.value;
    target.replaceChildren(
      ...items.map((item) => {
        const n = el('option', item[labelKey]);
        n.value = item[valueKey];
        return n;
      }),
    );
    if (items.some((i) => i[valueKey] === old)) target.value = old;
  }
  function clipPicker(scenario, target, choose) {
    closeClipPicker = openClipPicker({ api, deviceId: selected }, scenario, target, choose);
  }
  function renderVariables() {
    closeClipPicker?.();
    runIntent = null;
    clipSelections = {};
    const d = devices.find((d) => d.id === selected),
      s = d?.metadata.scenarios?.find((s) => s.name === $('run-scenario').value);
    $('variables').replaceChildren();
    for (const name of s?.variables || []) {
      const row = el('div', undefined, 'two'),
        label = el('label', `Thay giá trị ${name}`),
        check = el('input'),
        input = el('input');
      check.type = 'checkbox';
      check.dataset.variable = name;
      label.prepend(check);
      const field = el('fieldset', undefined, 'variable-field');
      field.disabled = true;
      field.append(input);
      if (name === 'video_url') {
        const paste = el('button');
        paste.type = 'button';
        const icon = el('span', '📋');
        icon.setAttribute('aria-hidden', 'true');
        paste.append(icon, ' Dán');
        paste.onclick = async () => {
          try {
            const value = await navigator.clipboard.readText();
            if (!field.isConnected || field.disabled) return;
            input.value = value.slice(0, input.maxLength);
            input.dispatchEvent(new Event('input', { bubbles: true }));
          } catch {
            if (!field.isConnected || field.disabled) return;
            message('Không đọc được clipboard. Hãy dán thủ công vào ô video_url.', true);
            input.focus();
          }
        };
        field.append(paste);
      }
      input.maxLength = 4000;
      input.setAttribute('aria-label', `Giá trị ${name}`);
      check.addEventListener('change', () => {
        field.disabled = !check.checked;
      });
      row.append(label, field);
      const target = s.clipTargets?.find((target) => target.variable === name);
      if (target) {
        const choose = el('button', `Chọn clip cho ${name}…`);
        choose.type = 'button';
        choose.onclick = () =>
          clipPicker(s.name, target.id, (file) => {
            input.value = 'clip:' + file;
            check.checked = true;
            field.disabled = false;
            runIntent = null;
          });
        row.append(choose);
      }
      $('variables').append(row);
    }
    for (const target of s?.clipTargets || []) {
      const row = el('div', undefined, 'row'),
        name = el('small');
      const choose = el(
        'button',
        `Chọn clip · Bước ${target.index + 1} (${target.action === 'upload' ? 'Upload' : 'Nguồn video'})`,
      );
      const clear = el('button', 'Bỏ chọn');
      choose.type = clear.type = 'button';
      clear.hidden = true;
      choose.onclick = () =>
        clipPicker(s.name, target.id, (file) => {
          clipSelections[target.id] = file;
          name.textContent = file;
          clear.hidden = false;
          runIntent = null;
        });
      clear.onclick = () => {
        delete clipSelections[target.id];
        name.textContent = '';
        clear.hidden = true;
        runIntent = null;
      };
      row.append(choose, name, clear);
      $('variables').append(row);
    }
  }
  const deviceList = createRoot($('devices'));
  function renderDevices() {
    deviceList.render(
      <DeviceList
        devices={devices}
        selected={selected}
        onSelect={(id) => {
          if (selected !== id) {
            closeDownloadPrompt();
            selected = id;
            formSignature = '';
            runIntent = null;
            resetHistory('Đang tải lịch sử…');
            renderDevices();
            renderDetail();
          }
          void refresh();
        }}
      />,
    );
  }
  function renderDetail() {
    const d = devices.find((d) => d.id === selected);
    $('detail').hidden = !d;
    $('empty').hidden = !!d;
    if (!d) return;
    $('device-name').textContent = d.name;
    $('device-status').textContent = d.revoked ? 'Đã thu hồi' : d.online ? 'Online' : 'Offline';
    $('device-status').className = 'badge ' + (d.online ? 'online' : 'offline');
    $('device-seen').textContent = `Lần cuối kết nối: ${when(d.lastSeen)}`;
    const activity = d.activity;
    $('activity').textContent = activity
      ? [
          activity.enabled ? 'Scan bật' : 'Scan tắt',
          activity.scanning ? 'Đang quét' : 'Chờ quét',
          activity.runningCount + ' scenario đang chạy',
          ...activity.active.map(
            (run) =>
              run.scenario +
              ' (' +
              run.profile +
              ', ' +
              (run.remote ? 'remote' : 'local') +
              ', ' +
              run.id +
              ')',
          ),
          d.online && activity.canAccept ? 'Có thể nhận task' : 'Chưa thể nhận task',
          when(activity.updatedAt),
        ].join(' · ')
      : 'Chưa có trạng thái scanner.';
    const p = d.metadata.performance || {};
    const rate = (key) =>
      d.online && Number.isFinite(d.metadata.network?.[key])
        ? `${d.metadata.network[key].toFixed(2)} Mbps`
        : '—';
    $('metrics').replaceChildren(
      ...[
        [`${p.cpuPercent || 0}%`, 'CPU agent'],
        [`${p.memoryMb || 0} MB`, 'RAM agent'],
        [`${Math.floor((d.metadata.uptime || 0) / 60)} phút`, 'Uptime agent'],
        [rate('downloadMbps'), 'Tải xuống'],
        [rate('uploadMbps'), 'Tải lên'],
      ].map(([v, k]) => {
        const n = el('div', undefined, 'metric');
        n.append(el('strong', v), el('small', k));
        return n;
      }),
    );
    $('profiles').textContent =
      (d.metadata.profiles || [])
        .map(
          (p) =>
            `${p.name}: ${p.extensionConnected ? 'extension đã kết nối' : 'extension offline'}${p.running ? ' · đang có tác vụ' : ''}`,
        )
        .join(' | ') || 'Máy chưa cấp quyền profile/kịch bản. Thiết lập tại trang Remote của máy local.';
    renderLocalTasks(d, { $, when, submit, message, api, refresh });
    $('revoke').disabled = d.revoked;
    $('remove-device').hidden = d.online;
    const signature = JSON.stringify([
      d.id,
      d.metadata.profiles?.map((p) => [p.directory, p.name]),
      d.metadata.scenarios,
    ]);
    if (signature !== formSignature) {
      options($('run-profile'), d.metadata.profiles || [], 'directory', 'name');
      options($('run-scenario'), d.metadata.scenarios || [], 'name', 'name');
      renderVariables();
      formSignature = signature;
    }
    if (followClock && document.activeElement !== scheduleTime) setScheduleTime();
    $('schedule-create').disabled = d.revoked || !$('run-profile').value || !$('run-scenario').value;
    $('run').disabled = !d.online || d.revoked || !$('run-profile').value || !$('run-scenario').value;
  }
  async function refresh() {
    if (busy || !csrf || document.hidden) return;
    busy = true;
    clearTimeout(timer);
    let deviceId = selected;
    const taskStatus = $('local-task-operation');
    taskStatus.textContent = 'Đang cập nhật tác vụ…';
    try {
      devices = (await api('/api/devices')).devices;
      if (selected && !devices.some((d) => d.id === selected)) {
        closeDownloadPrompt();
        closeClipPicker?.();
        selected = '';
        formSignature = '';
        runIntent = null;
        resetHistory();
      }
      taskStatus.textContent = '';
      renderDevices();
      renderDetail();
      deviceId = selected;
      if (deviceId) {
        const { commands } = await api(`/api/commands?device=${encodeURIComponent(deviceId)}`);
        if (selected === deviceId) {
          showDownloadConfirmation(commands, deviceId);
          updateHistory(commands, deviceId);
        }
      }
    } catch (e) {
      if (taskStatus.textContent && selected === deviceId)
        taskStatus.textContent = 'Không cập nhật được tác vụ: ' + e.message;
      message(e.message, true);
    } finally {
      busy = false;
      if (csrf) timer = setTimeout(refresh, deviceId === selected ? 5000 : 0);
    }
  }
  async function submit(button, fn) {
    button.disabled = true;
    try {
      await fn();
    } catch (e) {
      message(e.message, true);
    } finally {
      button.disabled = false;
      if (csrf && ['run', 'schedule-create', 'revoke'].includes(button.id)) renderDetail();
    }
  }
  $('login-form').addEventListener('submit', (event) => {
    event.preventDefault();
    void submit(event.submitter, async () => {
      const form = new FormData(event.target);
      accountView(await api('/api/login', Object.fromEntries(form)));
      event.target.reset();
      message('');
      await refresh();
    });
  });
  $('logout').addEventListener('click', () =>
    submit($('logout'), async () => {
      await api('/api/logout', {});
      loginView();
      message('Đã đăng xuất.');
    }),
  );
  $('pair-form').addEventListener('submit', (event) => {
    event.preventDefault();
    void submit(event.submitter, async () => {
      const value = await api('/api/pair-claim', { code: new FormData(event.target).get('code') });
      event.target.reset();
      message(
        `Đã nhận mã của ${value.name}. Hãy xác nhận tài khoản trên máy local trước ${when(value.expires)}.`,
      );
      await refresh();
    });
  });
  $('run-scenario').addEventListener('change', renderVariables);
  $('run-form').addEventListener('input', () => {
    runIntent = null;
  });
  $('run-form').addEventListener('change', () => {
    runIntent = null;
  });
  $('run-form').addEventListener('submit', (event) => {
    event.preventDefault();
    void submit(event.submitter, async () => {
      const variables = Object.fromEntries(
        [...$('variables').querySelectorAll('input[type=checkbox]:checked')].map((check) => [
          check.dataset.variable,
          check.closest('.two').querySelector('input:not([type=checkbox])').value,
        ]),
      );
      const scheduled = event.submitter?.id === 'schedule-create';
      const payload = {
        ...(scheduled && { scheduledAt: selectedTime() }),
        deviceId: selected,
        type: 'run',
        profile: $('run-profile').value,
        scenario: $('run-scenario').value,
        variables,
        ...(Object.keys(clipSelections).length ? { clips: { ...clipSelections } } : {}),
      };
      // Preserve the key after a lost HTTP response so retry does not create a second run.
      if (runIntent && Boolean(runIntent.scheduledAt) !== scheduled) runIntent = null;
      runIntent ||= { requestId: crypto.randomUUID(), ...payload };
      await api('/api/commands', runIntent);
      runIntent = null;
      message(
        scheduled ? 'Đã lưu lịch chạy.' : 'Đã gửi lệnh chạy. Máy local sẽ xác nhận và cập nhật tiến độ.',
      );
      await refresh();
    });
  });
  $('remove-device').addEventListener('click', () =>
    submit($('remove-device'), async () => {
      const device = devices.find((d) => d.id === selected);
      if (
        !device ||
        device.online ||
        !confirm(`Gỡ “${device.name}” khỏi danh sách? Máy sẽ cần ghép nối lại để kết nối.`)
      )
        return;
      try {
        await api('/api/device-remove', { id: device.id });
        message('Đã gỡ thiết bị khỏi danh sách.');
      } finally {
        await refresh();
      }
    }),
  );
  $('revoke').addEventListener('click', () =>
    submit($('revoke'), async () => {
      if (!confirm('Thu hồi quyền điều khiển máy này? Máy local sẽ dừng tác vụ remote khi nhận thông báo.'))
        return;
      await api('/api/device-revoke', { id: selected });
      message('Đã thu hồi kết nối.');
      await refresh();
    }),
  );
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearTimeout(timer);
    else void refresh();
  });
  void api('/api/me')
    .then(async (value) => {
      accountView(value);
      await refresh();
    })
    .catch(() => loginView());
}
