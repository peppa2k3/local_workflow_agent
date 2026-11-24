const $ = id => document.getElementById(id);
let enabled = false, refreshing = false, signature;
async function api(name, data) {
  const response = await fetch('/api/scanner/' + name, { method: data ? 'POST' : 'GET',
    headers: { 'x-local-agent-session': document.querySelector('meta[name=local-agent-session]').content, 'content-type':'application/json' },
    body: data ? JSON.stringify(data) : undefined });
  const value = await response.json();
  if (!response.ok) throw Error(value.error);
  return value;
}
async function action(fn) {
  try { await fn(); } catch (e) { $('feedback').textContent = e.message; }
}
const numericFields = ['minViews','minResolution','minDays','maxDays','minutes','requestsPerDay'];
const kinds = ['subtitles','automatic_captions'];
const labels = { pass:'Đạt', pending:'Đang chờ gửi', synced:'Đã đồng bộ', reject:'Không đạt', unknown:'Chưa đủ dữ liệu', candidate:'Chờ xét lại' };
const checkNames = { id:'ID video', keyword:'Từ khóa', views:'Lượt xem', age:'Tuổi video', duration:'Thời lượng',
  audio:'Âm thanh', resolution:'Độ phân giải', subtitles:'Phụ đề' };
const checkFilters = Object.entries(checkNames).map(([key, name]) => {
  const label = document.createElement('label');
  const select = document.createElement('select');
  select.append(new Option('Tất cả', ''), ...['pass','reject','unknown'].map(status => new Option(labels[status], status)));
  select.onchange = resetPage;
  label.append(name, select);
  $('checkFilters').append(label);
  return { key, select };
});
let currentConfig, results = [], page = 1;
async function loadEditor() {
  const { config, keywords } = await api('settings');
  currentConfig = config;
  for (const key of numericFields) $(key).value = config[key] ?? '';
  $('subtitleLanguages').value = config.subtitleLanguages.join(', ');
  for (const kind of kinds) $(kind).checked = config.subtitleKinds.includes(kind);
  $('keywords').value = keywords;
  for (const id of ['config','keywordForm']) $(id).querySelector('button').disabled = false;
}
function editorForm(id, note, part, read) {
  $(id).onsubmit = async event => {
    event.preventDefault();
    const button = $(id).querySelector('button');
    button.disabled = true;
    try {
      await api('settings', { part, value: read() });
      $(note).textContent = 'Đã lưu. Áp dụng từ lượt quét tiếp theo.';
    } catch (e) { $(note).textContent = e.message; }
    finally { button.disabled = false; }
  };
}
editorForm('config','configNote','config', () => {
  const cfg = { ...currentConfig };
  for (const key of numericFields) cfg[key] = $(key).valueAsNumber;
  cfg.subtitleLanguages = $('subtitleLanguages').value.split(',').map(s => s.trim());
  cfg.subtitleKinds = kinds.filter(kind => $(kind).checked);
  return cfg;
});
editorForm('keywordForm','keywordNote','keywords', () => $('keywords').value);
async function refresh() {
  if (refreshing || document.hidden) return;
  refreshing = true;
  try {
    const s = await api('status');
    enabled = s.enabled;
    $('toggle').disabled = false;
    $('toggle').classList.toggle('danger', enabled);
    $('toggle').textContent = enabled ? 'Tắt quét' : 'Bật quét';
    $('state').textContent = [s.scanning ? 'Đang quét' : enabled ? 'Đang chờ quét' : 'Đã tắt', s.error, s.syncError,
      'Yêu cầu API đã dùng: ' + (s.quota?.used || 0) + '/' + (s.config?.requestsPerDay ?? '?')].filter(Boolean).join(' · ');
    const next = JSON.stringify(s.rows);
    if (signature !== next) {
      results = s.rows;
      signature = next;
      renderRows();
    }
  } finally { refreshing = false; }
}
function renderRows() {
  const mode = $('filter').value;
  const query = $('resultQuery').value.trim().normalize('NFC').toLocaleLowerCase('vi');
  const size = Number($('pageSize').value);
  const openDetails = new Set(Array.from(document.querySelectorAll('#rows details[open]'), node => node.dataset.video));
  const activeChecks = checkFilters.filter(({ select }) => select.value);
  $('activeChecks').textContent = activeChecks.length;
  $('activeChecks').hidden = !activeChecks.length;
  $('clearChecks').disabled = !activeChecks.length;
  const matching = results.filter(r => [r.title, r.type_topic, r.video_id].some(value =>
    value?.normalize('NFC').toLocaleLowerCase('vi').includes(query))).filter(r => mode === 'all' || r.status === mode || mode === 'pass' && ['pending','synced'].includes(r.status))
    .filter(r => activeChecks.every(({ key, select }) => r.checks[key]?.status === select.value));
  const pages = Math.max(1, Math.ceil(matching.length / size));
  page = Math.min(page, pages);
  $('pageInfo').textContent = 'Trang ' + page + '/' + pages + ' · ' + matching.length + ' kết quả';
  $('prevPage').disabled = page === 1;
  $('nextPage').disabled = page === pages;
  const rows = matching.slice((page - 1) * size, page * size);
  $('rows').replaceChildren(...rows.map(row => {
    const article = document.createElement('article'), title = document.createElement('h3'), detail = document.createElement('details');
    article.className = 'run';
    title.textContent = row.title || row.video_id;
    title.title = title.textContent;
    const summary = document.createElement('summary'), badge = document.createElement('span');
    summary.textContent = 'Xem từng điều kiện';
    detail.dataset.video = row.video_id;
    detail.open = openDetails.has(row.video_id);
    detail.append(summary);
    for (const [key, check] of Object.entries(row.checks)) {
      const line = document.createElement('p');
      line.textContent = (checkNames[key] || key) + ' · ' + (labels[check.status] || check.status) + ' · ' + check.reason;
      detail.append(line);
    }
    badge.className = 'badge scanner-status-' + row.status;
    badge.textContent = labels[row.status] || row.status;
    const metadata = document.createElement('p');
    metadata.className = 'muted';
    metadata.textContent = [row.type_topic, row.view_count != null && row.view_count.toLocaleString('vi-VN') + ' lượt xem',
      new Date(row.measured_at).toLocaleString('vi-VN')].filter(Boolean).join(' · ');
    article.append(badge, title, metadata, detail);
    const actions = document.createElement('div');
    actions.className = 'row scanner-actions';
    detail.append(actions);
    function button(label, fn) {
      const b = document.createElement('button'); b.textContent = label;
      b.onclick = () => action(async () => { b.disabled = true; try { await fn(); } finally { b.disabled = false; } }); actions.append(b);
    }
    button('Copy URL', () => navigator.clipboard.writeText(row.video_url));
    button('Copy JSON', () => navigator.clipboard.writeText(JSON.stringify(row,null,2)));
    if (row.status === 'synced') button('Tải clip', async () => { $('feedback').textContent = (await api('download',{video_id:row.video_id})).file; });
    return article;
  }));
  if (!rows.length) $('rows').textContent = 'Chưa có kết quả cho lựa chọn này.';
}
function resetPage() { page = 1; renderRows(); }
$('clearChecks').onclick = () => {
  for (const { select } of checkFilters) select.value = '';
  resetPage();
};
$('filter').onchange = resetPage;
$('pageSize').onchange = resetPage;
$('resultQuery').oninput = resetPage;
$('prevPage').onclick = () => { page--; renderRows(); };
$('nextPage').onclick = () => { page++; renderRows(); };
void action(loadEditor);
$('export').onclick = () => action(async () => {
  const json = JSON.stringify(await api('export'), null, 2);
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = 'scanner-videos.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('toggle').onclick = () => action(async () => { await api('toggle',{enabled:!enabled}); await refresh(); });
setInterval(() => action(refresh),5000);
void action(refresh);
