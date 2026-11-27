const actions = {
  downloadVideo: { label: 'Tải video (yt-dlp + FFmpeg)', fields: [['url', 'URL video (tự lấy tiêu đề làm tên file)', 'text'], ['directory', 'Thư mục lưu (đường dẫn tuyệt đối)', 'text'], ['downloadTimeoutMs', 'Timeout tải (ms)', 'number']] },
  closeTab: { label: 'Đóng tab đã mở', fields: [] },
  openUrl: { label: 'Mở URL', fields: [['url', 'URL', 'text']] },
  openFolder: { label: 'Mở thư mục', fields: [['path', 'Đường dẫn thư mục', 'text']] },
  wait: { label: 'Chờ thời gian', fields: [['ms', 'Mili giây', 'number']] },
  waitFor: { label: 'Chờ phần tử', fields: [['locatorType', 'Cách tìm', 'locatorType'], ['locator', 'Chữ / tên / XPath / selector', 'text'], ['role', 'Role (khi tìm theo role)', 'text'], ['index', 'Vị trí từ 0 (nếu trùng)', 'number'], ['timeoutMs', 'Timeout (ms)', 'number']] },
  click: { label: 'Click phần tử', fields: [['locatorType', 'Cách tìm', 'locatorType'], ['locator', 'Chữ / tên / XPath / selector', 'text'], ['role', 'Role (khi tìm theo role)', 'text'], ['index', 'Vị trí từ 0 (nếu trùng)', 'number'], ['timeoutMs', 'Timeout (ms)', 'number']] },
  type: { label: 'Nhập chữ', fields: [['locatorType', 'Cách tìm', 'locatorType'], ['locator', 'Chữ / tên / XPath / selector', 'text'], ['role', 'Role (khi tìm theo role)', 'text'], ['index', 'Vị trí từ 0 (nếu trùng)', 'number'], ['text', 'Nội dung nhập', 'text'], ['clear', 'Xóa nội dung cũ (true/false)', 'boolean'], ['timeoutMs', 'Timeout chờ ô nhập / con trỏ (ms)', 'number']] },
  setDate: { label: 'Click và nhập ngày', fields: [['locatorType', 'Cách tìm', 'locatorType'], ['locator', 'Ô ngày tháng năm', 'text'], ['role', 'Role (khi tìm theo role)', 'text'], ['index', 'Vị trí từ 0 (nếu trùng)', 'number'], ['value', 'Ngày (YYYY-MM-DD hoặc biến)', 'date'], ['format', 'Định dạng cho input text', 'dateFormat'], ['timeoutMs', 'Timeout (ms)', 'number']] },
  setTime: { label: 'Click và nhập giờ', fields: [['locatorType', 'Cách tìm', 'locatorType'], ['locator', 'Ô giờ phút', 'text'], ['role', 'Role (khi tìm theo role)', 'text'], ['index', 'Vị trí từ 0 (nếu trùng)', 'number'], ['value', 'Giờ (HH:mm hoặc biến)', 'time'], ['timeoutMs', 'Timeout (ms)', 'number']] },
  upload: { label: 'Upload file', fields: [['locatorType', 'Cách tìm nút / input file', 'locatorType'], ['locator', 'Nút mở chọn file (click trước), hoặc input[type=file]', 'text'], ['role', 'Role (khi tìm theo role)', 'text'], ['index', 'Vị trí từ 0 (nếu trùng)', 'number'], ['filePath', 'Đường dẫn file đầy đủ', 'text'], ['folder', 'Thư mục lưu trữ (có thể dùng biến)', 'text'], ['filename', 'Tên file trong thư mục', 'text'], ['timeoutMs', 'Timeout chờ ô file (ms)', 'number'], ['waitAfterMs', 'Chờ sau khi chọn file (ms)', 'number']] },
  scroll: { label: 'Cuộn trang', fields: [['pixels', 'Số pixel', 'number'], ['times', 'Số lần', 'number'], ['intervalMs', 'Khoảng cách (ms)', 'number']] }
};
for (const action of ['openUrl', 'click', 'type', 'setDate', 'setTime', 'upload']) {
  actions[action].fields.push(
    ['navigationTimeoutMs', 'Timeout tải trang / kết quả (ms, mặc định 30000)', 'number'],
    ['completion.locatorType', 'Điều kiện hoàn tất: cách tìm', 'locatorType'],
    ['completion.locator', 'Chờ phần tử kết quả (tùy chọn)', 'text'],
    ['completion.role', 'Role của phần tử kết quả', 'text'],
    ['completion.state', 'Trạng thái cần chờ', 'conditionState']
  );
}
actions.openUrl.fields.push(['settleMs', 'DOM ổn định (ms, mặc định 350; 0 để bỏ qua)', 'number']);
actions.click.fields.push(['settleMs', 'DOM ổn định sau click (ms, mặc định 0)', 'number']);
actions.upload.fields.push(
  ['pageId', 'UUID page trong Content Manager (nếu có)', 'text'],
  ['pageName', 'Tên page đích (khuyến nghị)', 'text'],
  ['pageUrl', 'URL page đích (nên dùng biến)', 'text'],
  ['platform', 'Nền tảng (ví dụ Facebook)', 'text'],
  ['publicationDesc', 'Mô tả lưu trong kho nội dung', 'text'],
  ['folderTag', 'Tag thư mục (mặc định automation)', 'text']
);
const defaults = {
  downloadVideo: { url: '', directory: 'D:\\Videos', quality: 1080, language: 'vi', downloadTimeoutMs: 1800000 },
  closeTab: {},
  openUrl: { url: 'https://www.facebook.com/' }, openFolder: { path: 'C:\\Users\\Administrator\\Downloads' },
  wait: { ms: 1000 }, waitFor: { locatorType: 'text', locator: 'Tiếp', timeoutMs: 5000 },
  click: { locatorType: 'role', role: 'button', locator: 'Tiếp', timeoutMs: 5000 },
  type: { locatorType: 'placeholder', locator: 'Tìm kiếm', text: '', clear: true },
  setDate: { locatorType: 'css', locator: 'input[type=date]', value: '', format: 'DD/MM/YYYY' },
  setTime: { locatorType: 'css', locator: 'input[type=time]', value: '' },
  upload: { locatorType: 'css', locator: '', filePath: '' },
  scroll: { pixels: 650, times: 3, intervalMs: 2500 }
};
const $ = id => document.getElementById(id);
function setProperty(node, key, value) { if (node[key] !== value) node[key] = value; }
function setText(id, value) { setProperty($(id), 'textContent', value); }
const stepStates = { pending: 'Chưa chạy', running: 'Đang chạy', succeeded: 'Thành công', failed: 'Thất bại', cancelled: 'Đã dừng', interrupted: 'Gián đoạn' };
function stepSummary(step) {
  const upload = step.upload;
  return `${step.number}. ${step.label} · ${stepStates[step.state] || step.state}${step.reused ? ' · Đã tải trước đó, dùng file đã lưu' : ''}${step.file_path ? ' · ' + step.file_path : ''}${upload ? ' · Upload: ' + (upload.page_url || 'chưa rõ page') + ' · ' + new Date(upload.uploaded_at).toLocaleString('vi-VN') : ''}${step.error ? ' · ' + step.error : ''}`;
}
$('historyBtn').onclick = () => handle(async () => {
  const profile = executionProfile();
  const data = await api('/api/history?profile=' + encodeURIComponent(profile));
  if (profile !== executionProfile()) return;
  const rows = (data.runs || []).map(run => {
    const details = document.createElement('details'), summary = document.createElement('summary'), body = document.createElement('div');
    summary.textContent = `${run.scenario || 'Kịch bản'} · ${run.state} · ${new Date(run.startedAt).toLocaleString('vi-VN')} · ${run.total} bước${run.stoppedAtStep ? ' · Dừng tại bước ' + run.stoppedAtStep : ''} · ${run.runId}`;
    body.style.whiteSpace = 'pre-wrap'; body.textContent = (run.steps || []).map(stepSummary).join('\n') + (run.error ? '\n' + run.error : '');
    details.append(summary, body); return details;
  });
  $('runHistory').replaceChildren(...rows);
  if (!rows.length) $('runHistory').textContent = 'Chưa có lịch sử cho profile này.';
});
let statusTimer, profilesRequest, statusFailures = 0, anyWorkflowRunning = false, statusClosed = false;
function fetchProfiles() {
  if (!profilesRequest) profilesRequest = api('/api/profiles').finally(() => { profilesRequest = null; });
  return profilesRequest;
}
function scheduleStatus(delay) {
  clearTimeout(statusTimer);
  if (document.hidden || statusClosed) return;
  const next = delay ?? (statusFailures ? Math.min(60000, 5000 * 2 ** (statusFailures - 1)) : pickId !== null ? 1000 : anyWorkflowRunning ? 1500 : 10000);
  statusTimer = setTimeout(() => { void updateStatus(); }, next);
}
function refreshStatus() {
  clearTimeout(statusTimer);
  if (!document.hidden && !statusClosed) void updateStatus();
}
let fileName = 'facebook-reels';
let scenario = { name: 'Mở và cuộn Facebook Reels', steps: [] };
let pickTargetIndex = null;
let pickId = null;
let selectedProfile = localStorage.getItem('workflowProfile') || '';
let variableDrafts = [];
let filePicking = false, statusPending = false, editorBusy = false;
let knownProfiles = [];
const executionProfile = () => scenario.profile || selectedProfile;
let agentCompatible = false, videoCompatible = false, referencesCompatible = false, managementCompatible = false, renameCompatible = false;
const runtimeVariables = ['download_title', 'download_file_name', 'download_file_path', 'download_id'];
const usesDownloadReferences = () => /\{\{\s*download_(title|file_name|file_path|id)\s*\}\}/.test(JSON.stringify(scenario));

function updateButtons() {
  const profileState = knownProfiles.find(item => item.directory === executionProfile());
  for (const id of ['scenarioProfile','scenarioId','acceptedTopics','assignmentPriority']) setProperty($(id), 'disabled', editorBusy);
  setProperty($('stopBtn'), 'disabled', !profileState?.running);
  setProperty($('openProfileBtn'), 'disabled', !profileState);
  for (const id of ['loadBtn', 'newBtn', 'saveBtn', 'cloneBtn', 'addBtn', 'addVariableBtn', 'scenarioSelect']) setProperty($(id), 'disabled', editorBusy);
  setProperty($('schedule-create'), 'disabled', editorBusy || !profileState);
  setProperty($('runBtn'), 'disabled', editorBusy || !agentCompatible || !profileState || profileState.running || (scenario.steps.some(step => step.action === 'downloadVideo') && !videoCompatible) || (usesDownloadReferences() && !referencesCompatible));
  const saved = Array.from($('scenarioSelect').options).some(option => option.value === fileName);
  setProperty($('deleteBtn'), 'disabled', editorBusy || !managementCompatible || !saved);
  setProperty($('renameBtn'), 'disabled', editorBusy || !renameCompatible || !saved || $('fileName').value.trim() === fileName);
  setProperty($('steps'), 'inert', editorBusy);
  setProperty($('variables'), 'inert', editorBusy);
  setProperty($('scenarioName'), 'disabled', editorBusy);
}
async function editTask(task) {
  if (editorBusy) return;
  editorBusy = true; updateButtons();
  try { await task(); } finally { editorBusy = false; updateButtons(); }
}
function collectVariables() {
  const entries = variableDrafts.map(item => [item.name.trim(), item.value]);
  const names = entries.map(([name]) => name);
  if (names.some(name => !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name))) throw new Error('Tên biến dùng chữ không dấu, số, _; bắt đầu bằng chữ hoặc _');
  if (names.some(name => runtimeVariables.includes(name))) throw new Error('Tên biến download_* dành cho kết quả tải.');
  if (new Set(names).size !== names.length) throw new Error('Tên biến bị trùng');
  return Object.fromEntries(entries);
}
function clipStepIndex(name) {
  return scenario.steps.findIndex(step => {
    const source = step.action === 'downloadVideo' ? step.url : step.action === 'upload' ? step.filePath : '';
    return String(source || '').match(/^\{\{\s*([a-zA-Z_]\w*)\s*\}\}$/)?.[1] === name;
  });
}
function syncVariableClipButtons() {
  $('variables').querySelectorAll('[data-clip-variable]').forEach((button, index) => {
    button.hidden = clipStepIndex(variableDrafts[index].name.trim()) < 0;
  });
}
function renderVariables() {
  $('variables').replaceChildren(...variableDrafts.map((item, index) => {
    const row = document.createElement('div'); row.className = 'variable-row';
    let valueInput;
    for (const [key, title] of [['name', 'Tên biến'], ['value', 'Giá trị biến']]) {
      const label = document.createElement('label'); label.textContent = title;
      const input = document.createElement('input'); input.value = item[key]; input.setAttribute('aria-label', `${title} ${index + 1}`);
      if (key === 'value') valueInput = input;
      input.oninput = () => { item[key] = input.value; if (key === 'name') syncVariableClipButtons(); }; label.append(input); row.append(label);
    }
    const pick = document.createElement('button'); pick.type = 'button'; pick.className = 'btn ghost'; pick.textContent = 'Chọn clip đã lưu…'; pick.dataset.clipVariable = '';
    pick.onclick = () => handle(() => openClipPicker({ variable: item.name.trim() }, name => { item.value = valueInput.value = 'clip:' + name; }));
    row.append(pick);
    const remove = document.createElement('button'); remove.className = 'btn ghost'; remove.textContent = 'Xóa biến';
    remove.onclick = () => { variableDrafts.splice(index, 1); renderVariables(); }; row.append(remove); return row;
  }));
  syncVariableClipButtons();
}

async function api(route, method = 'GET', body) {
  const response = await fetch(route, { method, headers: { 'Content-Type': 'application/json', 'X-Local-Agent-Session': '__LOCAL_AGENT_DASHBOARD_TOKEN__' }, body: body ? JSON.stringify(body) : undefined, ...(route === '/api/choose-file' ? {} : { signal: AbortSignal.timeout(route === '/api/video/inspect' ? 70000 : 10000) }) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}
function notice(text, error = false) { $('message').textContent = text; $('message').classList.toggle('error', error); if (text) window.toast[error ? 'error' : 'success'](text); }
let clipPicker;
async function loadClips() {
  const picker = clipPicker, search = $('clipSearch'), list = $('clipNames');
  const request = ++picker.request;
  list.replaceChildren();
  $('useClip').disabled = true;
  $('clipStatus').textContent = 'Đang đọc thư mục…';
  try {
    const { names, more } = await api('/api/clips', 'POST', { scenario: picker.scenario, ...picker.target, query: search.elements.query.value });
    if (clipPicker !== picker || request !== picker.request) return;
    list.replaceChildren(...names.map(name => new Option(name, name)));
    $('useClip').disabled = !names.length;
    $('clipStatus').textContent = more ? 'Hiện 60 clip đầu tiên. Nhập tên để tìm tiếp.' : names.length ? '' : 'Không tìm thấy clip.';
  } catch (error) {
    if (clipPicker === picker && request === picker.request) $('clipStatus').textContent = error.message;
  }
}
function openClipPicker(target, choose) {
  clipPicker = { target, choose, scenario: { steps: structuredClone(scenario.steps), variables: collectVariables() }, request: 0 };
  $('clipSearch').reset();
  $('clipPicker').showModal();
  return loadClips();
}
$('clipSearch').onsubmit = event => { event.preventDefault(); void loadClips(); };
$('cancelClip').onclick = () => $('clipPicker').close();
$('clipPicker').onclose = () => { clipPicker = null; };
$('useClip').onclick = () => {
  clipPicker.choose($('clipNames').value);
  $('clipPicker').close();
};
async function chooseFile(input) {
  if (filePicking) return;
  filePicking = true;
  const buttons = [...document.querySelectorAll('[data-file-picker], #chooseRunFile')];
  buttons.forEach(button => { button.disabled = true; });
  notice('Đang mở hộp chọn file Windows… Chọn file hoặc bấm Hủy trong hộp thoại.');
  try {
  const current = input.value.trim();
  const initialDirectory = current.replace(/[\\/][^\\/]*$/, '');
  const result = await api('/api/choose-file', 'POST', { initialDirectory });
  if (result.filePath) {
    if (!input.isConnected) return;
    input.value = result.filePath;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    notice(`Đã chọn file: ${result.filePath}`);
  } else notice('Đã hủy chọn file.');
  } finally { filePicking = false; document.querySelectorAll('[data-file-picker], #chooseRunFile').forEach(button => { button.disabled = false; }); }
}
function field(labelText, value, type, update) {
  const label = document.createElement('label');
  label.textContent = labelText;
  const isSelect = ['locatorType', 'conditionState', 'dateFormat', 'videoQuality', 'audioLanguage'].includes(type);
  const input = document.createElement(isSelect ? 'select' : 'input');
  input.setAttribute('aria-label', labelText);
  if (isSelect) {
    const options = type === 'videoQuality' ? { 360: '360p', 480: '480p', 720: 'HD (720p)', 1080: 'Full HD (1080p)', 1440: '2K (1440p)', 2160: '4K (2160p)', best: 'Cao nhất' } : type === 'audioLanguage' ? { vi: 'Tiếng Việt', en: 'Tiếng Anh', zh: 'Tiếng Trung', ja: 'Tiếng Nhật', ko: 'Tiếng Hàn', auto: 'Theo nguồn' } : type === 'dateFormat' ? { 'DD/MM/YYYY': 'Ngày/tháng/năm', 'MM/DD/YYYY': 'Tháng/ngày/năm', 'YYYY-MM-DD': 'Năm-tháng-ngày' } : type === 'conditionState' ? { visible: 'Xuất hiện', hidden: 'Biến mất', enabled: 'Có thể tương tác' } : { role: 'Role + tên', text: 'Chữ hiển thị', label: 'Label', placeholder: 'Placeholder', testid: 'Test ID', xpath: 'XPath', css: 'CSS' };
    if (['videoQuality', 'audioLanguage'].includes(type) && value != null && !(value in options)) options[value] = String(value);
    for (const [key, text] of Object.entries(options)) {
      const option = document.createElement('option'); option.value = key; option.textContent = text; input.append(option);
    }
  } else input.type = ['date', 'time'].includes(type) && !String(value).includes('{{') ? type : 'text';
  if (type === 'number') input.inputMode = 'decimal';
  input.value = value ?? '';
  const commit = () => update(type === 'number' ? (input.value === '' ? undefined : input.value.includes('{{') ? input.value : Number(input.value)) : type === 'boolean' && !input.value.includes('{{') ? input.value === 'true' : input.value);
  input.addEventListener(isSelect ? 'change' : 'input', commit);
  if (labelText === 'Đường dẫn file đầy đủ') {
    const control = document.createElement('span'); control.className = 'file-path-control';
    const button = document.createElement('button'); button.type = 'button'; button.className = 'btn ghost'; button.textContent = 'Chọn file…';
    button.dataset.filePicker = 'true'; button.disabled = filePicking;
    button.addEventListener('click', () => handle(() => chooseFile(input)));
    control.append(input, button); label.append(control);
  } else label.append(input);
  if (!isSelect) {
    const reference = document.createElement('select'); reference.className = 'variable-ref'; reference.setAttribute('aria-label', `Chèn biến: ${labelText}`);
    const fillOptions = () => {
      reference.replaceChildren(new Option('Chèn tham chiếu biến…', ''));
      if (['date', 'time'].includes(type)) reference.append(new Option('Nhập tham chiếu trực tiếp', '@manual'));
      for (const name of runtimeVariables) reference.append(new Option('{{' + name + '}} · kết quả tải', name));
      for (const item of variableDrafts) if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(item.name.trim())) reference.append(new Option(`{{${item.name.trim()}}}`, item.name.trim()));
    };
    fillOptions(); reference.addEventListener('focus', fillOptions);
    reference.onchange = () => {
      if (!reference.value) return;
      input.type = 'text';
      if (reference.value !== '@manual') {
        const token = `{{${reference.value}}}`;
        input.value = ['number', 'boolean', 'date', 'time'].includes(type) ? token : input.value + token;
        commit();
      }
      input.focus(); reference.value = '';
    };
    label.append(reference);
  }
  return label;
}
const expandedSteps = new WeakSet();
function render() {
  $('scenarioName').value = scenario.name || '';
  $('scenarioId').value = scenario.scenario_id ?? '';
  $('acceptedTopics').value = (scenario.accepted_topics || []).join(', ');
  $('assignmentPriority').value = scenario.assignment_priority ?? 0;
  renderScenarioProfiles();
  $('stepCount').textContent = `${scenario.steps.length} bước`;
  updateButtons();
  const list = $('steps'); list.replaceChildren();
  scenario.steps.forEach((step, index) => {
    const card = document.createElement('article'); card.className = 'step';
    const head = document.createElement('div'); head.className = 'step-head';
    const number = document.createElement('span'); number.className = 'number'; number.textContent = index + 1;
    const stepTitle = document.createElement('strong'); stepTitle.className = 'step-title'; stepTitle.textContent = step.label?.trim() || `Bước ${index + 1}`;
    const select = document.createElement('select');
    for (const [key, value] of Object.entries(actions)) {
      const option = document.createElement('option'); option.value = key; option.textContent = value.label; select.append(option);
    }
    select.value = step.action;
    select.addEventListener('change', () => { const replacement = { action: select.value, ...defaults[select.value] }; if (expandedSteps.has(step)) expandedSteps.add(replacement); scenario.steps[index] = replacement; render(); });
    head.append(number, stepTitle, select);
    const controls = document.createElement('div'); controls.className = 'step-controls';
    const body = document.createElement('div'); body.className = 'step-body'; body.id = `step-body-${index}`;
    const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'btn ghost step-toggle';
    toggle.setAttribute('aria-controls', body.id);
    function setExpanded(expanded) {
      if (expanded) expandedSteps.add(step); else expandedSteps.delete(step);
      body.hidden = !expanded;
      toggle.setAttribute('aria-expanded', String(expanded));
      toggle.textContent = expanded ? '▴ Thu' : '▾ Mở';
      toggle.setAttribute('aria-label', `${expanded ? 'Thu' : 'Mở'} chi tiết bước ${index + 1}`);
    }
    setExpanded(expandedSteps.has(step));
    toggle.addEventListener('click', () => setExpanded(body.hidden));
    controls.append(toggle);
    for (const [label, offset] of [['↑', -1], ['↓', 1]]) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'icon ' + (offset < 0 ? 'move-up' : 'move-down'); button.textContent = label;
      button.title = offset < 0 ? 'Lên' : 'Xuống'; button.setAttribute('aria-label', `${button.title} bước ${index + 1}`); button.disabled = index + offset < 0 || index + offset >= scenario.steps.length;
      button.addEventListener('click', () => { [scenario.steps[index], scenario.steps[index + offset]] = [scenario.steps[index + offset], scenario.steps[index]]; render(); });
      controls.append(button);
    }
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'icon'; remove.classList.add('remove'); remove.textContent = '×'; remove.title = 'Xóa bước'; remove.setAttribute('aria-label', `Xóa bước ${index + 1}`);
    remove.addEventListener('click', () => { scenario.steps.splice(index, 1); render(); }); controls.append(remove);
    head.append(controls);
    if (['click', 'waitFor', 'type', 'setDate', 'setTime', 'upload'].includes(step.action)) {
      const pick = document.createElement('button'); pick.className = 'btn ghost'; pick.textContent = '◎ Chọn trên trang';
      pick.addEventListener('click', () => handle(async () => {
        const profile = executionProfile(), currentScenario = scenario;
        const result = await api('/api/pick/start', 'POST', { profile });
        if (profile !== executionProfile() || currentScenario !== scenario) return;
        pickTargetIndex = index; pickId = result.id; scheduleStatus(0);
        notice('Chuyển sang tab cần thao tác, đưa chuột lên phần tử và click. Nhấn Esc để hủy.');
      }));
      body.append(pick);
    }
    if (step.action === 'downloadVideo') {
      const inspect = document.createElement('button'); inspect.className = 'btn ghost'; inspect.textContent = 'Phân tích URL / lấy tên';
      inspect.addEventListener('click', () => handle(() => editTask(async () => {
        const variables = collectVariables();
        const expand = (text, seen = []) => String(text).replace(/{{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*}}/g, (_, key) => {
          if (!(key in variables) || seen.includes(key)) throw new Error(`Biến thiếu hoặc vòng lặp: ${key}`);
          return expand(variables[key], [...seen, key]);
        });
        const url = expand(step.url);
        if (url.startsWith('clip:')) { notice(`Clip đã lưu: ${url.slice(5)}`); return; }
        const info = await api('/api/video/inspect', 'POST', { url });
        notice(`Tên video: ${info.title} · ID: ${info.id} · File: tiêu đề.ext`);
      })));
      body.append(inspect);
    }
    if (['upload', 'downloadVideo'].includes(step.action)) {
      const pick = document.createElement('button'); pick.type = 'button'; pick.className = 'btn ghost'; pick.textContent = 'Chọn clip đã lưu…';
      pick.addEventListener('click', () => handle(() => openClipPicker({ index }, name => {
        step[step.action === 'downloadVideo' ? 'url' : 'filePath'] = 'clip:' + name;
        render();
      })));
      body.append(pick);
    }
    const fields = document.createElement('div'); fields.className = 'fields';
    if (step.action === 'click') {
      const hint = document.createElement('p'); hint.style.gridColumn = '1 / -1';
      hint.textContent = 'Nút có thể vẫn hiển thị sau khi click. Nếu cần chờ chuyển bước hoặc dữ liệu tải xong, điền Chờ phần tử kết quả hoặc thêm bước Chờ phần tử.';
      fields.append(hint);
    }
    if (step.action === 'type') {
      const hint = document.createElement('p'); hint.style.gridColumn = '1 / -1';
      hint.textContent = 'Chọn input, textarea hoặc vùng soạn thảo. Vị trí tính từ 0; nên để trống khi chỉ có một ô nhập khớp. Nếu trang thay editor sau click, tác vụ sẽ tìm lại ô cùng tên và đặt focus/con trỏ trước khi nhập.';
      fields.append(hint);
    }
    if (step.action === 'downloadVideo') {
      const hint = document.createElement('p');
      hint.style.gridColumn = '1 / -1';
      hint.textContent = 'Mặc định tiếng Việt và Full HD (1080p). Ưu tiên audio ngôn ngữ đã chọn; nếu nguồn không có thì dùng audio có sẵn. Chọn độ phân giải gần nhất không vượt mức; nếu chỉ có bản cao hơn thì dùng bản thấp nhất có sẵn. Không tự dịch hoặc nâng độ phân giải. Tên file trùng thêm (2), (3)…';
      fields.append(field('Ngôn ngữ âm thanh', step.language ?? 'vi', 'audioLanguage', value => { step.language = value; }));
      fields.append(field('Độ phân giải', step.quality ?? 1080, 'videoQuality', value => { step.quality = value === 'best' ? value : Number(value); }));
      fields.append(hint);
    }
    if (step.action === 'upload') {
      const hint = document.createElement('p'); hint.style.gridColumn = '1 / -1';
      hint.textContent = 'Điền tên/URL page đích để lưu đúng page khi website mở màn hình soạn bài. UUID là ID trong Content Manager. Thời gian upload được lưu riêng; chọn file xong chưa xác nhận đã Đăng.';
      fields.append(hint);
      const loadPages = document.createElement('button'); loadPages.className = 'btn ghost'; loadPages.type = 'button'; loadPages.textContent = 'Chọn page từ MongoDB';
      loadPages.onclick = () => handle(async () => {
        const data = await api('/api/content/catalog/pages?active=true&limit=50');
        const select = document.createElement('select'); select.setAttribute('aria-label', 'Page dùng chung');
        select.append(new Option('Chọn page đích…', ''));
        for (const page of data.rows) select.append(new Option(`${page.name} · ${page.platform}`, page._id));
        select.onchange = () => {
          const page = data.rows.find(page => page._id === select.value);
          if (page) { Object.assign(step, { pageId: page._id, pageName: page.name, pageUrl: page.url, platform: page.platform }); render(); }
        };
        if (!data.rows.length) notice('Chưa có page active. Mở Quản lý nội dung để tạo page.');
        if (data.total > data.rows.length) notice('Đang hiện 50 page đầu. Dùng Quản lý nội dung để tìm page và sao chép UUID.');
        loadPages.replaceWith(select);
      });
      fields.append(loadPages);
    }
    const nameField = field('Tên bước (tùy chọn)', step.label || '', 'text', value => {
      if (value.trim()) step.label = value; else delete step.label;
      stepTitle.textContent = value.trim() || `Bước ${index + 1}`;
    });
    nameField.style.margin = '10px 0';

    if (step.action === 'closeTab') {
      const help = document.createElement('p');
      help.textContent = 'Đóng tab gần nhất được tạo bởi bước Mở URL trong lượt chạy này.';
      body.append(help);
    }
    for (const [key, label, type] of actions[step.action].fields) {
      const [parent, child] = key.split('.');
      const value = child ? step[parent]?.[child] : step[parent];
      fields.append(field(label, value ?? (type === 'locatorType' ? 'css' : type === 'conditionState' ? 'visible' : type === 'dateFormat' ? 'DD/MM/YYYY' : ''), type, value => {
        const target = child ? (step[parent] ||= {}) : step;
        if (value === undefined) delete target[child || parent]; else target[child || parent] = value;
        if (['url', 'filePath'].includes(key)) syncVariableClipButtons();
      }));
    }
    body.append(nameField, fields); card.append(head, body); list.append(card);
  });
  syncVariableClipButtons();
}
async function refreshNames() {
  const { names } = await api('/api/scenarios');
  const select = $('scenarioSelect'); select.replaceChildren();
  for (const name of names) { const option = document.createElement('option'); option.value = name; option.textContent = name; select.append(option); }
  select.value = fileName;
}
async function load(name) {
  let loaded;
  try { loaded = await api(`/api/scenarios/${encodeURIComponent(name)}`); }
  catch (error) { $('scenarioSelect').value = fileName; throw error; }
  if ((loaded.profile || selectedProfile) !== executionProfile()) $('runHistory').replaceChildren();
  scenario = loaded; fileName = name; $('fileName').value = name;
  $('scenarioSelect').value = name;
  variableDrafts = Object.entries(scenario.variables || {}).map(([name, value]) => ({ name, value: String(value) })); renderVariables();
  pickId = null; pickTargetIndex = null;
  for (const step of scenario.steps) {
    if (step.selector && !step.locator) { step.locatorType = 'css'; step.locator = step.selector; delete step.selector; }
  }
  render(); notice(`Đã mở ${name}.json`);
}
async function save() {
  scenario.name = $('scenarioName').value.trim();
  scenario.variables = collectVariables();
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(fileName)) throw new Error('Tên file chỉ dùng chữ thường, số, dấu - hoặc _');
  await api(`/api/scenarios/${fileName}`, 'PUT', scenario);
  await refreshNames(); notice(`Đã lưu ${fileName}.json`);
}
function handle(task) { Promise.resolve().then(task).catch(error => notice(error.message, true)); }
$('loadBtn').onclick = () => handle(() => editTask(() => load($('scenarioSelect').value)));
$('scenarioSelect').onchange = () => handle(() => editTask(() => load($('scenarioSelect').value)));
$('cloneBtn').onclick = () => handle(() => editTask(async () => {
  await save();
  const { names } = await api('/api/scenarios');
  const stem = fileName.slice(0, 54); let name = `${stem}-copy`, suffix = 2;
  while (names.includes(name)) name = `${stem}-copy-${suffix++}`;
  await api(`/api/scenarios/${fileName}/clone`, 'POST', { name });
  await refreshNames(); await load(name); notice(`Đã clone thành ${name}.json`);
}));
$('newBtn').onclick = () => handle(() => editTask(() => {
  const name = $('fileName').value.trim();
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(name)) throw new Error('Nhập tên file hợp lệ trước khi tạo');
  fileName = name; $('scenarioSelect').value = ''; scenario = { name, steps: [{ action: 'openUrl', ...defaults.openUrl }] }; variableDrafts = []; renderVariables(); render(); notice('Kịch bản mới chưa lưu.');
}));
$('fileName').addEventListener('input', updateButtons);
$('renameBtn').onclick = () => handle(() => editTask(async () => {
  const name = $('fileName').value.trim();
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(name)) throw new Error('Tên file chỉ dùng chữ thường, số, dấu - hoặc _');
  await api(`/api/scenarios/${encodeURIComponent(fileName)}/rename`, 'POST', { name });
  fileName = name; $('fileName').value = name;
  await refreshNames();
  notice(`Đã đổi tên file thành ${name}.json`);
  refreshStatus();
}));
$('deleteBtn').onclick = () => handle(() => editTask(async () => {
  const target = fileName;
  if (!window.confirm(`Xóa kịch bản "${target}"? File JSON này sẽ bị xóa.`)) return;
  await api(`/api/scenarios/${encodeURIComponent(target)}`, 'DELETE');
  await refreshNames();
  const next = $('scenarioSelect').options[0]?.value;
  if (next) await load(next);
  else {
    fileName = 'my-workflow'; $('fileName').value = fileName;
    scenario = { name: 'Kịch bản mới', steps: [{ action: 'openUrl', ...defaults.openUrl }] };
    variableDrafts = []; renderVariables(); render();
  }
  notice(`Đã xóa ${target}.json`);
}));
$('saveBtn').onclick = () => handle(() => editTask(save));
$('runBtn').onclick = () => handle(() => editTask(async () => {
  const targetProfile = executionProfile();
  const agent = await fetchProfiles();
  if (!agent.capabilities?.includes('variables-v1')) throw new Error('Agent đang chạy bản cũ. Dừng và chạy lại node local-agent.js, rồi tải lại dashboard.');
  if (scenario.steps.some(step => step.action === 'downloadVideo') && !agent.capabilities?.includes('video-quality-best-v1')) throw new Error('Khởi động lại agent để tải video.');
  if (usesDownloadReferences() && !agent.capabilities?.includes('download-references-v1')) throw new Error('Khởi động lại agent để nối download với upload.');
  await save(); await api('/api/run', 'POST', { name: fileName, profile: targetProfile, uploadPath: $('uploadPath').value.trim() });
  notice(`Đã bắt đầu chạy trên ${targetProfile}.`); refreshStatus();
}));
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
$('schedule-now').onclick = () => { followClock = true; setScheduleTime(); };
$('schedule-later').onclick = () => { followClock = false; setScheduleTime(15); };
setScheduleTime();
function selectedTime() {
  if (followClock) setScheduleTime();
  const time = new Date(scheduleTime.value).getTime();
  if (!Number.isFinite(time) || time < Math.floor(Date.now() / 60000) * 60000) throw Error('Chọn phút hiện tại hoặc tương lai.');
  return time;
}
let scheduleSignature, dueTask;
const scheduleStates = { scheduled: 'Đang chờ', confirming: 'Chờ xác nhận', starting: 'Đang khởi chạy',
  started: 'Đã khởi chạy', cancelled: 'Đã hủy', failed: 'Lỗi', interrupted: 'Bị gián đoạn' };
async function scheduleDecision(id, proceed) {
  await api('/api/schedules/decision', 'POST', { id, proceed });
  refreshStatus();
}
$('schedule-dialog').oncancel = event => event.preventDefault();
$('schedule-yes').onclick = () => handle(() => scheduleDecision(dueTask.id, true));
$('schedule-no').onclick = () => handle(() => scheduleDecision(dueTask.id, false));
function renderSchedules(tasks) {
  if (followClock && document.activeElement !== scheduleTime) setScheduleTime();
  const signature = JSON.stringify(tasks);
  if (signature === scheduleSignature) return;
  scheduleSignature = signature;
  const rows = tasks.slice().sort((a,b) => a.scheduledAt - b.scheduledAt).map(task => {
    const row = document.createElement('p');
    row.textContent = `${new Date(task.scheduledAt).toLocaleString('vi-VN')} · ${task.profile} · ${task.scenario} · ${scheduleStates[task.state]}${task.error ? ' · ' + task.error : ''} `;
    if (task.state === 'scheduled') {
      const cancel = document.createElement('button');
      cancel.textContent = 'Hủy lịch';
      cancel.onclick = () => handle(() => scheduleDecision(task.id, false));
      row.append(cancel, editScheduleTime(task.scheduledAt, scheduledAt => handle(async () => {
        await api('/api/schedules/time', 'POST', { id: task.id, scheduledAt });
        refreshStatus();
      })));
    }
    return row;
  });
  $('schedule-list').replaceChildren(...rows);
  dueTask = tasks.find(task => task.state === 'confirming' && task.confirmBy > Date.now());
  const dialog = $('schedule-dialog');
  if (dueTask) {
    $('schedule-question').textContent = `${dueTask.scenario} · ${dueTask.profile}. Tự chạy lúc ${new Date(dueTask.confirmBy).toLocaleTimeString('vi-VN')}.`;
    if (!dialog.open) dialog.showModal();
  } else if (dialog.open) dialog.close();
}
$('schedule-create').onclick = () => handle(() => editTask(async () => {
  const scheduledAt = selectedTime(), profile = executionProfile();
  await save();
  await api('/api/schedules', 'POST', { scenario: fileName, profile, scheduledAt, uploadPath: $('uploadPath').value.trim() });
  notice('Đã lưu lịch chạy.'); refreshStatus();
}));
$('chooseRunFile').onclick = () => handle(() => chooseFile($('uploadPath')));
$('stopBtn').onclick = () => handle(async () => { await api('/api/stop', 'POST', { profile: executionProfile() }); notice(`Đã dừng ${executionProfile()}.`); refreshStatus(); });
$('openProfileBtn').onclick = () => handle(async () => { await api('/api/profiles/open', 'POST', { profile: executionProfile() }); notice(`Đã mở ${executionProfile()}.`); refreshStatus(); });
function renderScenarioProfiles() {
  const select = $('scenarioProfile'), saved = scenario.profile || '';
  const profiles = knownProfiles.map(item => [item.directory, `${item.name} (${item.directory})`]);
  if (saved && !profiles.some(([directory]) => directory === saved)) profiles.push([saved, `${saved} (không có trên máy local)`]);
  const signature = JSON.stringify(profiles);
  if (select.dataset.signature !== signature) {
    select.replaceChildren(new Option('Dùng profile đang chọn trên dashboard', ''),
      ...profiles.map(([directory, label]) => new Option(label, directory)));
    select.dataset.signature = signature;
  }
  setProperty(select, 'value', saved);
}
$('acceptedTopics').oninput = e => {
  scenario.accepted_topics = e.target.value.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
};
$('scenarioId').oninput = e => {
  const id = e.target.value.trim();
  if (id) scenario.scenario_id = id;
  else delete scenario.scenario_id;
};
$('assignmentPriority').oninput = e => { scenario.assignment_priority = Number(e.target.value); };
$('scenarioProfile').onchange = event => {
  if (event.target.value) scenario.profile = event.target.value;
  else delete scenario.profile;
  $('runHistory').replaceChildren();
  pickId = null; pickTargetIndex = null;
  updateButtons(); refreshStatus();
};
$('profileSelect').onchange = () => {
  selectedProfile = $('profileSelect').value; localStorage.setItem('workflowProfile', selectedProfile);
  $('runHistory').replaceChildren();
  updateButtons();
  pickId = null; pickTargetIndex = null; refreshStatus();
};
$('addBtn').onclick = () => { const step = { action: 'click', ...defaults.click }; scenario.steps.push(step); expandedSteps.add(step); render(); };
$('addVariableBtn').onclick = () => { variableDrafts.push({ name: '', value: '' }); renderVariables(); };
$('scenarioName').oninput = event => { scenario.name = event.target.value; };
async function updateStatus() {
  if (statusPending || document.hidden || statusClosed) return;
  clearTimeout(statusTimer); statusPending = true;
  try {
    const data = await fetchProfiles();
    renderSchedules(data.schedules || []);
    statusFailures = 0;
    anyWorkflowRunning = data.profiles.some(item => item.running);
    setText('automationStatus', `CLI/API ${data.automationEnabled ? 'đã bật' : 'chưa bật (đặt LOCAL_AGENT_API_TOKEN rồi khởi động lại agent)'}. Chạy node local-agent.js --help; xem guides-local.md ở gốc repo. Biến truyền qua API chỉ áp dụng cho lượt chạy đó.`);
    referencesCompatible = data.capabilities?.includes('download-references-v1') === true;
    renameCompatible = data.capabilities?.includes('scenario-rename-v1') === true;
    managementCompatible = data.capabilities?.includes('scenario-management-v1') === true;
    videoCompatible = data.capabilities?.includes('video-quality-best-v1') === true;
    agentCompatible = data.capabilities?.includes('variables-v1') === true;
    if (!data.profiles.some(item => item.directory === selectedProfile)) selectedProfile = data.defaultProfile;
    const select = $('profileSelect');
    const profileMenuEmpty = !select.options.length;
    const signature = JSON.stringify(data.profiles.map(item => [item.directory, item.name, item.extensionConnected]));
    if (select.dataset.signature !== signature && (document.activeElement !== select || profileMenuEmpty)) {
      const existing = new Map(Array.from(select.options, option => [option.value, option]));
      const options = data.profiles.map(item => {
        const option = existing.get(item.directory) || document.createElement('option');
        setProperty(option, 'value', item.directory);
        setProperty(option, 'textContent', `${item.name} (${item.directory}) · ${item.extensionConnected ? 'đã kết nối' : 'offline'}`);
        return option;
      });
      if (options.length !== select.options.length || options.some((option, index) => select.options[index] !== option)) select.replaceChildren(...options);
      select.dataset.signature = signature;
    }
    if (document.activeElement !== select || profileMenuEmpty) setProperty(select, 'value', selectedProfile);
    setText('profilesSummary', data.profiles.map(item => `${item.name} (${item.directory}): ${item.error || (item.running ? `bước ${item.index + 1}/${item.total} · ${item.stepLabel || item.action}` : item.extensionConnected ? 'sẵn sàng' : 'chưa kết nối')}`).join(' | '));
    knownProfiles = data.profiles;
    renderScenarioProfiles();
    updateButtons();
    const activeProfile = executionProfile();
    const state = knownProfiles.find(item => item.directory === activeProfile) || { profile: activeProfile };
    if ($('connectionDot').classList.contains('ok') !== !!state.extensionConnected) $('connectionDot').classList.toggle('ok', !!state.extensionConnected);
    setText('connectionText', agentCompatible ? `${state.profile} · ${knownProfiles.includes(state) ? (state.extensionConnected ? 'Extension đã kết nối' : 'Agent sẽ mở profile khi cần trình duyệt') : 'Profile không có trên máy local'}` : 'Agent cũ: dừng và chạy lại node local-agent.js');
    let progress = state.confirmation?.message || state.error || (state.waitingForProfile ? `Đang chờ extension của ${activeProfile} kết nối…` : state.running ? `Đang chạy bước ${state.index + 1}/${state.total}: ${state.stepLabel || state.action || 'đang chờ'}` : state.download ? `Đã lưu: ${state.download.filePath} · ${state.download.width || '?'}×${state.download.height || '?'} · ${Math.round(state.download.fps || 0)} fps · ${state.download.videoCodec || ''}` : 'Đang chờ lệnh');
    if (state.executionId) progress += ` · ${state.state} · runId: ${state.executionId}`;
    if (state.download?.reused) progress += ' · Đã tải URL này, dùng file đã lưu';
    setText('progress', progress);
    setText('runSteps', (state.steps || []).map(stepSummary).join('\n'));
    setText('storageStatus', data.storage ? `Lịch sử lưu trên máy. ${data.storage.enabled ? `MongoDB ${data.storage.database || ''}: ${data.storage.error || (data.storage.connected ? 'đã kết nối' : 'đang kết nối')} · ${data.storage.pending} bản ghi chờ` : 'Điền MONGODB_URI trong .env để kết nối MongoDB Atlas.'} ` : '');
    const perf = data.performance;
    setText('performance', `${perf ? `Agent: CPU ${perf.cpuPercent}% · RAM ${perf.memoryMb} MB · Event loop p95 ${perf.eventLoopP95Ms} ms · ` : ''}Profile ${activeProfile}: tổng ${((state.elapsedMs || 0) / 1000).toFixed(1)}s · bước hiện tại ${((state.stepElapsedMs || 0) / 1000).toFixed(1)}s${state.lastStepMs == null ? '' : ` · bước trước ${(state.lastStepMs / 1000).toFixed(1)}s`}`);
    if (pickId !== null) {
      const picked = await api(`/api/pick/status?profile=${encodeURIComponent(activeProfile)}`);
      if (activeProfile === executionProfile() && picked.id === pickId && !picked.active) {
        if (picked.result && scenario.steps[pickTargetIndex]) {
          Object.assign(scenario.steps[pickTargetIndex], picked.result);
          render(); notice('Đã chọn phần tử. Bấm Lưu để lưu locator.');
        } else notice('Đã hủy chọn phần tử.');
        pickId = null; pickTargetIndex = null;
      }
    }
  } catch {
    statusFailures++; setText('connectionText', 'Agent chưa chạy'); knownProfiles = []; updateButtons();
  }
  finally { statusPending = false; scheduleStatus(); }
}
handle(() => editTask(async () => {
  await refreshNames();
  const names = [...$('scenarioSelect').options].map(option => option.value);
  if (names.length) await load(names.includes(fileName) ? fileName : names[0]);
  else { fileName = 'my-workflow'; scenario = { name: 'Kịch bản mới', steps: [{ action: 'openUrl', ...defaults.openUrl }] }; $('fileName').value = fileName; render(); }
}));
document.addEventListener('visibilitychange', () => {
  clearTimeout(statusTimer);
  if (!document.hidden) refreshStatus();
});
window.addEventListener('pagehide', () => { statusClosed = true; clearTimeout(statusTimer); });
window.addEventListener('pageshow', event => { if (event.persisted) { statusClosed = false; refreshStatus(); } });
refreshStatus();
