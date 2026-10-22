(() => {
  const $ = id => document.getElementById(id), session = document.querySelector('meta[name=local-agent-session]').content;
  let state, signature = '', claim = '', busy = false, mutation = false, timer;
  function el(tag, text) { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; return n; }
  function message(text, error = false) { $('message').textContent = text; $('message').className = error ? 'notice error' : 'notice'; $('message').hidden = !text; }
  async function api(route, data) {
    const response = await fetch('/api/remote/' + route, { method: data === undefined ? 'GET' : 'POST', redirect: 'error',
      headers: { 'content-type': 'application/json', 'x-local-agent-session': session }, body: data === undefined ? undefined : JSON.stringify(data), signal: AbortSignal.timeout(20000) });
    const value = await response.json(); if (!response.ok) throw Error(value.error || 'Yêu cầu thất bại'); return value;
  }
  function checkbox(name, checked, text) { const row = el('label'); row.className = 'check'; const input = el('input'); input.type = 'checkbox'; input.value = name; input.checked = checked; row.append(input, el('span', text)); return row; }
  function render(value) {
    state = value; claim = state.pending?.claim || '';
    $('connection').textContent = state.configured ? `${state.device.email} · ${state.url} · ${state.connected ? 'Đã kết nối' : state.error || 'Đang kết nối…'}` : state.error || 'Chưa ghép nối tài khoản.';
    $('pair-form').hidden = state.configured || !!state.pending; $('disconnect').hidden = !state.configured && !state.pending;
    $('pending').hidden = !state.pending;
    if (state.pending) { $('code').textContent = state.pending.code; $('expires').textContent = `Hết hạn: ${new Date(state.pending.expires).toLocaleString('vi-VN')}`;
      $('claim').textContent = state.pending.email ? `Tài khoản yêu cầu: ${state.pending.email}\nVPS: ${state.url}. Kiểm tra đúng tài khoản trước khi đồng ý.` : 'Đang chờ tài khoản nhập mã trên web VPS…';
      $('approve').hidden = !claim;
    }
    const next = JSON.stringify([state.available, state.policy]);
    if (signature !== next) {
      signature = next;
      $('profiles').replaceChildren(...state.available.profiles.map(p => checkbox(p.directory, state.policy.profiles.includes(p.directory), `${p.name} (${p.directory})`)));
      $('scenarios').replaceChildren(...state.available.scenarios.map(s => {
        const box = el('div'); box.className = 'choice'; const check = checkbox(s.name, state.policy.scenarios.includes(s.name), s.name); check.querySelector('input').dataset.scenario = s.name; box.append(check);
        const variables = el('div'); variables.className = 'variables';
        if (s.variables.length) variables.append(el('small', 'Cho phép thay giá trị biến (tùy chọn):'));
        for (const name of s.variables) { const row = checkbox(name, !!state.policy.variables[s.name]?.includes(name), name); row.querySelector('input').dataset.variable = name; variables.append(row); }
        box.append(variables); return box;
      }));
    }
  }
  async function refresh() {
    if (busy || mutation || document.hidden) return; busy = true; clearTimeout(timer);
    try { render(await api('status')); } catch (e) { message(e.message, true); }
    finally { busy = false; timer = setTimeout(refresh, 3000); }
  }
  async function change(button, route, data, success) {
    if (mutation) return; mutation = true; button.disabled = true;
    try { render(await api(route, data)); message(success); } catch (e) { message(e.message, true); }
    finally { mutation = false; button.disabled = false; }
  }
  $('pair-form').addEventListener('submit', event => { event.preventDefault(); void change(event.submitter, 'pair-start', Object.fromEntries(new FormData(event.target)), 'Nhập mã tại web VPS rồi xác nhận tài khoản tại đây.'); });
  $('approve').addEventListener('click', () => change($('approve'), 'pair-approve', { claim }, 'Đã xác nhận tài khoản. Thiết bị sẽ chủ động kết nối VPS.'));
  $('disconnect').addEventListener('click', () => { if (confirm('Ngắt kết nối và dừng các lượt chạy remote trên máy này?')) void change($('disconnect'), 'disconnect', {}, 'Đã ngắt kết nối local.'); });
  $('policy-form').addEventListener('submit', event => {
    event.preventDefault(); const profiles = [...$('profiles').querySelectorAll('input:checked')].map(n => n.value), scenarios = [], variables = {};
    for (const box of $('scenarios').children) { const input = box.querySelector('input[data-scenario]'); if (input.checked) { scenarios.push(input.value); variables[input.value] = [...box.querySelectorAll('input[data-variable]:checked')].map(n => n.value); } }
    void change(event.submitter, 'policy', { profiles, scenarios, variables }, 'Đã lưu quyền điều khiển.');
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearTimeout(timer); else void refresh(); });
  void refresh();
})();
