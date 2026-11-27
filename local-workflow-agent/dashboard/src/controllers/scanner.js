import { api } from "../scanner-api.js";
const $ = id => document.getElementById(id);
let enabled = false, refreshing = false, signature;
async function action(fn, notify = true) {
  try { await fn(); } catch (e) { $('feedback').textContent = e.message; if (notify) window.toast.error(e.message); }
}
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
let results = [], page = 1, visibleIds = [], revision = 0, editing = false;
const selected = new Set();
const reviewOptions = [['pass','Đánh dấu đạt'], ['reject','Đánh dấu không đạt'], ['auto','Dùng kết quả tự động']];
$('bulkOperation').append(...[...reviewOptions, ['delete','Xóa kết quả local']].map(([value, text]) => new Option(text, value)));

function updateSelection() {
  const count = visibleIds.filter(id => selected.has(id)).length;
  $('selectPage').checked = visibleIds.length > 0 && count === visibleIds.length;
  $('selectPage').indeterminate = count > 0 && count < visibleIds.length;
  $('selectPage').disabled = !visibleIds.length;
  $('selectionCount').textContent = 'Đã chọn ' + selected.size;
  $('applyBulk').disabled = editing || !selected.size || !$('bulkOperation').value;
  $('clearSelection').disabled = !selected.size;
}
function updateResults(rows) {
  const next = JSON.stringify(rows);
  if (signature === next) return;
  signature = next;
  results = rows;
  const ids = new Set(rows.map(row => row.video_id));
  for (const id of selected) if (!ids.has(id)) selected.delete(id);
  renderRows();
}
async function manageResults(ids, operation) {
  if (editing || !ids.length) return;
  if (operation === 'delete' && !window.confirm('Xóa ' + ids.length + ' kết quả khỏi Scanner local?')) return;
  editing = true;
  updateSelection();
  try {
    const { changed, rows } = await api('results', { ids, operation });
    revision++;
    for (const id of ids) selected.delete(id);
    updateResults(rows);
    for (const checkbox of document.querySelectorAll('#rows .scanner-row-select')) {
      checkbox.checked = selected.has(checkbox.value);
    }
    $('feedback').textContent = operation === 'delete' ? 'Đã xóa ' + changed + ' kết quả local.' : 'Đã cập nhật ' + changed + ' kết quả.';
    window.toast.success($('feedback').textContent);
  } finally { editing = false; updateSelection(); }
}
async function refresh() {
  if (refreshing || document.hidden) return;
  refreshing = true;
  try {
    const requestedRevision = revision;
    const s = await api('status');
    enabled = s.enabled;
    $('toggle').disabled = false;
    $('toggle').classList.toggle('danger', enabled);
    $('toggle').textContent = enabled ? 'Tắt quét' : 'Bật quét';
    $('state').textContent = [s.scanning ? 'Đang quét' : enabled ? 'Đang chờ quét' : 'Đã tắt', s.error, s.syncError,
      'Yêu cầu API đã dùng: ' + (s.quota?.used || 0) + '/' + (s.config?.requestsPerDay ?? '?')].filter(Boolean).join(' · ');
    if (requestedRevision === revision) updateResults(s.rows);
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
    value?.normalize('NFC').toLocaleLowerCase('vi').includes(query))).filter(r => {
      const verdict = r.review || (['pending','synced'].includes(r.status) ? 'pass' : r.status);
      if (['pending','synced'].includes(mode)) return r.status === mode && (mode === 'synced' || r.review !== 'reject');
      return mode === 'all' || verdict === mode;
    })
    .filter(r => activeChecks.every(({ key, select }) => r.checks[key]?.status === select.value));
  const pages = Math.max(1, Math.ceil(matching.length / size));
  page = Math.min(page, pages);
  $('pageInfo').textContent = 'Trang ' + page + '/' + pages + ' · ' + matching.length + ' kết quả';
  $('prevPage').disabled = page === 1;
  $('nextPage').disabled = page === pages;
  const rows = matching.slice((page - 1) * size, page * size);
  visibleIds = rows.map(row => row.video_id);
  $('rows').replaceChildren(...rows.map(row => {
    const article = document.createElement('article'), title = document.createElement('h3'), detail = document.createElement('details');
    article.className = 'run';
    title.textContent = row.title || row.video_id;
    title.title = title.textContent;
    const summary = document.createElement('summary'), badge = document.createElement('span');
    summary.textContent = 'Chi tiết và chỉnh sửa';
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
    const select = document.createElement('input'), content = document.createElement('div');
    select.type = 'checkbox';
    select.className = 'scanner-row-select';
    select.value = row.video_id;
    select.checked = selected.has(row.video_id);
    select.setAttribute('aria-label', 'Chọn ' + title.textContent);
    select.onchange = () => {
      if (select.checked) selected.add(row.video_id); else selected.delete(row.video_id);
      updateSelection();
    };
    if (row.status === 'pending' && row.review === 'reject') badge.textContent = 'Tạm giữ gửi';
    content.append(badge);
    if (row.review) {
      const review = document.createElement('span');
      review.className = 'badge scanner-review scanner-status-' + (row.review === 'pass' ? 'synced' : 'reject');
      review.textContent = 'Thủ công · ' + labels[row.review];
      content.append(review);
    }
    content.append(title, metadata, detail);
    article.append(select, content);
    const actions = document.createElement('div');
    actions.className = 'row scanner-actions';
    detail.append(actions);
    function button(label, fn) {
      const b = document.createElement('button'); b.textContent = label;
      b.onclick = () => action(async () => { b.disabled = true; try { await fn(); } finally { b.disabled = false; } }); actions.append(b);
    }
    button('Copy URL', () => navigator.clipboard.writeText(row.video_url));
    button('Copy JSON', () => navigator.clipboard.writeText(JSON.stringify(row,null,2)));
    if (row.status === 'synced' && row.review !== 'reject') button('Tải clip', async () => { $('feedback').textContent = (await api('download',{video_id:row.video_id})).file; window.toast.success($('feedback').textContent); });
    const editor = document.createElement('div'), label = document.createElement('label'), review = document.createElement('select');
    editor.className = 'row scanner-actions scanner-review-editor';
    review.append(...reviewOptions.map(([value, text]) => new Option(text, value)));
    review.value = row.review || 'auto';
    label.append('Đánh giá thủ công', review);
    editor.append(label);
    detail.append(editor);
    const hint = document.createElement('small');
    hint.textContent = 'Chỉ video đạt kiểm tra tự động mới được gửi. Đánh dấu không đạt sẽ tạm giữ video đang chờ gửi.';
    detail.append(hint);
    buttonFor('Lưu đánh giá', () => manageResults([row.video_id], review.value));
    buttonFor('Xóa kết quả', () => manageResults([row.video_id], 'delete'), 'danger');
    function buttonFor(text, fn, style = '') {
      const control = document.createElement('button');
      control.textContent = text;
      control.className = style;
      control.onclick = () => action(fn);
      editor.append(control);
    }
    return article;
  }));
  if (!rows.length) $('rows').textContent = 'Chưa có kết quả cho lựa chọn này.';
  updateSelection();
}
function resetPage() { page = 1; renderRows(); }
$('clearChecks').onclick = () => {
  for (const { select } of checkFilters) select.value = '';
  resetPage();
};
$('selectPage').onchange = () => {
  for (const id of visibleIds) {
    if ($('selectPage').checked) selected.add(id); else selected.delete(id);
  }
  renderRows();
};
$('clearSelection').onclick = () => { selected.clear(); renderRows(); };
$('bulkOperation').onchange = updateSelection;
$('applyBulk').onclick = () => action(() => manageResults([...selected], $('bulkOperation').value));
$('filter').onchange = resetPage;
$('pageSize').onchange = resetPage;
$('resultQuery').oninput = resetPage;
$('prevPage').onclick = () => { page--; renderRows(); };
$('nextPage').onclick = () => { page++; renderRows(); };

$('export').onclick = () => action(async () => {
  const json = JSON.stringify(await api('export'), null, 2);
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = 'scanner-videos.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('toggle').onclick = () => action(async () => { await api('toggle',{enabled:!enabled}); await refresh(); });
setInterval(() => action(refresh, false),5000);
void action(refresh, false);
