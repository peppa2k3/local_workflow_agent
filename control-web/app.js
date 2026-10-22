(() => {
  const $ = id => document.getElementById(id);
  let csrf = '', selected = '', devices = [], busy = false, timer, formSignature = '', historySignature = '', runIntent = null;
  const stateName = { pending: 'Chờ thực hiện', queued: 'Đang đợi', dispatched: 'Đã gửi tới máy', running: 'Đang chạy', succeeded: 'Thành công', failed: 'Thất bại', cancelled: 'Đã dừng',
    interrupted: 'Bị gián đoạn', unknown: 'Chưa rõ kết quả — kiểm tra máy local', expired: 'Hết hạn', rejected: 'Máy local từ chối' };
  const when = n => n ? new Date(n).toLocaleString('vi-VN') : 'Chưa nhận heartbeat';
  function el(tag, text, className) { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (className) n.className = className; return n; }
  function message(text, error = false) { $('message').textContent = text; $('message').className = error ? 'notice error' : 'notice'; $('message').hidden = !text; }
  async function api(route, data) {
    const r = await fetch(route, { method: data === undefined ? 'GET' : 'POST', credentials: 'same-origin', redirect: 'error',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrf }, body: data === undefined ? undefined : JSON.stringify(data), signal: AbortSignal.timeout(18000) });
    const value = await r.json();
    if (!r.ok) { if (r.status === 401) loginView(); throw Error(value.error || 'Yêu cầu thất bại'); } return value;
  }
  function loginView() { csrf = ''; selected = ''; devices = []; formSignature = ''; historySignature = ''; runIntent = null; $('history').replaceChildren(); clearTimeout(timer); $('workspace').hidden = true; $('account').hidden = true; $('login').hidden = false; }
  function accountView(value) { csrf = value.csrf; $('email').textContent = value.email; $('account').hidden = false; $('login').hidden = true; $('workspace').hidden = false; }
  function options(target, items, valueKey, labelKey) { const old = target.value; target.replaceChildren(...items.map(item => { const n = el('option', item[labelKey]); n.value = item[valueKey]; return n; })); if (items.some(i => i[valueKey] === old)) target.value = old; }
  function renderVariables() {
    runIntent = null;
    const d = devices.find(d => d.id === selected), s = d?.metadata.scenarios?.find(s => s.name === $('run-scenario').value);
    $('variables').replaceChildren();
    for (const name of s?.variables || []) {
      const row = el('div', undefined, 'two'), label = el('label', `Thay giá trị ${name}`), check = el('input'), input = el('input');
      check.type = 'checkbox'; check.dataset.variable = name; label.prepend(check); input.disabled = true; input.maxLength = 4000;
      input.setAttribute('aria-label', `Giá trị ${name}`); check.addEventListener('change', () => { input.disabled = !check.checked; });
      row.append(label, input); $('variables').append(row);
    }
  }
  function renderDevices() {
    $('devices').replaceChildren(...devices.map(d => {
      const n = el('button', undefined, 'device' + (d.id === selected ? ' selected' : ''));
      n.append(el('strong', d.name), el('span', d.revoked ? 'Đã thu hồi' : d.online ? 'Online' : 'Offline', 'badge ' + (d.online ? 'online' : 'offline')));
      n.addEventListener('click', () => { selected = d.id; formSignature = ''; historySignature = ''; runIntent = null; void refresh(); }); return n;
    }));
    if (!devices.length) $('devices').append(el('p', 'Chưa ghép thiết bị nào.', 'muted'));
  }
  function renderDetail() {
    const d = devices.find(d => d.id === selected); $('detail').hidden = !d; $('empty').hidden = !!d; if (!d) return;
    $('device-name').textContent = d.name; $('device-status').textContent = d.revoked ? 'Đã thu hồi' : d.online ? 'Online' : 'Offline';
    $('device-status').className = 'badge ' + (d.online ? 'online' : 'offline'); $('device-seen').textContent = `Lần cuối kết nối: ${when(d.lastSeen)}`;
    const p = d.metadata.performance || {};
    $('metrics').replaceChildren(...[[`${p.cpuPercent || 0}%`, 'CPU agent'], [`${p.memoryMb || 0} MB`, 'RAM agent'], [`${Math.floor((d.metadata.uptime || 0) / 60)} phút`, 'Uptime agent']].map(([v, k]) => {
      const n = el('div', undefined, 'metric'); n.append(el('strong', v), el('small', k)); return n;
    }));
    $('profiles').textContent = (d.metadata.profiles || []).map(p => `${p.name}: ${p.extensionConnected ? 'extension đã kết nối' : 'extension offline'}${p.running ? ' · đang có tác vụ' : ''}`).join(' | ') || 'Máy chưa cấp quyền profile/kịch bản. Thiết lập tại trang Remote của máy local.';
    $('revoke').disabled = d.revoked;
    const signature = JSON.stringify([d.id, d.metadata.profiles?.map(p => [p.directory, p.name]), d.metadata.scenarios]);
    if (signature !== formSignature) { options($('run-profile'), d.metadata.profiles || [], 'directory', 'name'); options($('run-scenario'), d.metadata.scenarios || [], 'name', 'name'); renderVariables(); formSignature = signature; }
    $('run').disabled = !d.online || d.revoked || !$('run-profile').value || !$('run-scenario').value;
  }
  function renderHistory(commands) {
    const signature = JSON.stringify(commands); if (historySignature === signature) return; historySignature = signature;
    const open = new Set([...$('history').querySelectorAll('details[open]')].map(n => n.dataset.id));
    $('history').replaceChildren(...commands.map(cmd => {
      const n = el('article', undefined, 'run'), row = el('div', undefined, 'row');
      row.append(el('span', stateName[cmd.state] || cmd.state, 'badge'), el('small', when(cmd.created))); n.append(row);
      n.append(el('h3', cmd.type === 'run' ? `${cmd.payload.scenario} · ${cmd.payload.profile}` : 'Yêu cầu dừng tác vụ'));
      n.append(el('small', `ID: ${cmd.id}`));
      const result = cmd.result;
      if (result?.startedAt) n.append(el('p', `Bắt đầu: ${when(result.startedAt)}${result.endedAt ? ' · Kết thúc: ' + when(result.endedAt) : ''}`, 'muted'));
      if (result?.total) { const progress = el('progress'); progress.max = result.total; progress.value = cmd.state === 'succeeded' ? result.total : result.index;
        n.append(el('p', result.stoppedAtStep ? `Dừng tại bước ${result.stoppedAtStep}/${result.total}` : `Tiến độ: ${Math.min(result.index + 1, result.total)}/${result.total}`), progress); }
      if (result?.message) n.append(el('p', result.message, 'muted'));
      if (result?.steps?.length) { const details = el('details'), list = el('ol'); details.dataset.id = cmd.id; details.open = open.has(cmd.id);
        details.append(el('summary', 'Chi tiết từng bước')); list.append(...result.steps.map(s => el('li', `${s.label || s.action} — ${stateName[s.state] || s.state}`))); details.append(list); n.append(details); }
      if (cmd.type === 'run' && ['queued', 'dispatched', 'running', 'unknown'].includes(cmd.state)) {
        const stop = el('button', 'Dừng lượt này', 'danger'); stop.addEventListener('click', () => submit(stop, async () => {
          await api('/api/commands', { requestId: crypto.randomUUID(), deviceId: selected, type: 'stop', runId: cmd.id }); message('Đã gửi lệnh dừng.'); await refresh();
        })); n.append(stop);
      }
      return n;
    }));
    if (!commands.length) $('history').append(el('p', 'Chưa có lệnh điều khiển.', 'muted'));
  }
  async function refresh() {
    if (busy || !csrf || document.hidden) return; busy = true; clearTimeout(timer);
    try { devices = (await api('/api/devices')).devices; renderDevices(); renderDetail();
      if (selected) renderHistory((await api(`/api/commands?device=${encodeURIComponent(selected)}`)).commands);
    } catch (e) { message(e.message, true); }
    finally { busy = false; if (csrf) timer = setTimeout(refresh, 5000); }
  }
  async function submit(button, fn) { button.disabled = true; try { await fn(); } catch (e) { message(e.message, true); } finally { button.disabled = false; if (csrf && ['run', 'revoke'].includes(button.id)) renderDetail(); } }
  $('login-form').addEventListener('submit', event => { event.preventDefault(); void submit(event.submitter, async () => {
    const form = new FormData(event.target); accountView(await api('/api/login', Object.fromEntries(form))); event.target.reset(); message(''); await refresh();
  }); });
  $('logout').addEventListener('click', () => submit($('logout'), async () => { await api('/api/logout', {}); loginView(); message('Đã đăng xuất.'); }));
  $('pair-form').addEventListener('submit', event => { event.preventDefault(); void submit(event.submitter, async () => {
    const value = await api('/api/pair-claim', { code: new FormData(event.target).get('code') }); event.target.reset(); message(`Đã nhận mã của ${value.name}. Hãy xác nhận tài khoản trên máy local trước ${when(value.expires)}.`); await refresh();
  }); });
  $('run-scenario').addEventListener('change', renderVariables);
  $('run-form').addEventListener('input', () => { runIntent = null; });
  $('run-form').addEventListener('change', () => { runIntent = null; });
  $('run-form').addEventListener('submit', event => { event.preventDefault(); void submit(event.submitter, async () => {
    const variables = Object.fromEntries([...$('variables').querySelectorAll('input[type=checkbox]:checked')].map(check => [check.dataset.variable, check.closest('.two').querySelector('input:not([type=checkbox])').value]));
    const payload = { deviceId: selected, type: 'run', profile: $('run-profile').value, scenario: $('run-scenario').value, variables };
    // Preserve the key after a lost HTTP response so retry does not create a second run.
    runIntent ||= { requestId: crypto.randomUUID(), ...payload };
    await api('/api/commands', runIntent); runIntent = null; message('Đã gửi lệnh chạy. Máy local sẽ xác nhận và cập nhật tiến độ.'); await refresh();
  }); });
  $('revoke').addEventListener('click', () => submit($('revoke'), async () => {
    if (!confirm('Thu hồi quyền điều khiển máy này? Máy local sẽ dừng tác vụ remote khi nhận thông báo.')) return;
    await api('/api/device-revoke', { id: selected }); message('Đã thu hồi kết nối.'); await refresh();
  }));
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearTimeout(timer); else void refresh(); });
  void api('/api/me').then(async value => { accountView(value); await refresh(); }).catch(() => loginView());
})();
