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

const dayMs = 86400000;
const numberFormat = new Intl.NumberFormat('vi-VN');
const dateParts = { day: '2-digit', month: '2-digit', year: 'numeric' };
const dateFormat = new Intl.DateTimeFormat('vi-VN', dateParts);
const dateTimeFormat = new Intl.DateTimeFormat('vi-VN', { ...dateParts, hour: '2-digit', minute: '2-digit' });

function timestamp(value) {
  if (typeof value !== 'string') return NaN;
  const zone = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.\d+)?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!zone) return NaN;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return NaN;
  const offset = zone[2] === 'Z' ? 0 : (Number(zone[4]) * 60 + Number(zone[5])) * (zone[3] === '+' ? 1 : -1);
  const localTime = new Date(time + offset * 60000);
  return Number.isFinite(localTime.getTime()) && localTime.toISOString().slice(0, 19) === zone[1] ? time : NaN;
}

function elapsedLabel(milliseconds) {
  if (milliseconds < 1000) return 'dưới 1 giây';
  const seconds = Math.floor(milliseconds / 1000);
  if (seconds < 60) return seconds + ' giây';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes + ' phút' + (seconds % 60 ? ' ' + seconds % 60 + ' giây' : '');
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + ' giờ' + (minutes % 60 ? ' ' + minutes % 60 + ' phút' : '') + (seconds % 60 ? ' ' + seconds % 60 + ' giây' : '');
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(milliseconds / dayMs) + ' ngày';
}

function videoFacts(row) {
  const published = timestamp(row.published_at), measured = timestamp(row.measured_at);
  const elapsed = measured - published;
  const validElapsed = Number.isFinite(elapsed) && elapsed > 0;
  const views = Number.isSafeInteger(row.view_count) && row.view_count >= 0 ? row.view_count : null;
  const rate = views !== null && validElapsed ? views * dayMs / elapsed : NaN;
  let rateText = '—';
  if (Number.isFinite(rate)) {
    rateText = rate > 0 && rate < 0.01 ? '< 0,01' : rate < 1
      ? new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(rate)
      : numberFormat.format(Math.round(rate));
  }
  const duration = row.duration_seconds;
  let durationText = '—';
  if (Number.isFinite(duration) && duration >= 0) {
    const seconds = Math.floor(duration), hours = Math.floor(seconds / 3600);
    const minutes = Math.floor(seconds / 60) % 60, remaining = seconds % 60;
    durationText = (hours ? hours + ':' + String(minutes).padStart(2, '0') : String(minutes)) + ':' + String(remaining).padStart(2, '0');
  }
  return {
    duration: durationText,
    views: views === null ? '—' : numberFormat.format(views),
    age: validElapsed ? elapsedLabel(elapsed) : '—',
    published: Number.isFinite(published) ? dateFormat.format(published) : '—',
    measured: Number.isFinite(measured) ? dateTimeFormat.format(measured) : '—',
    rate: rateText,
    rateBasis: validElapsed && elapsed < dayMs ? ' (theo ' + elapsedLabel(elapsed) + ' thực tế)' : '',
  };
}

function sourceUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

function textElement(tag, text, className) {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  return element;
}

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
    .filter(r => activeChecks.every(({ key, select }) => r.checks?.[key]?.status === select.value));
  const pages = Math.max(1, Math.ceil(matching.length / size));
  page = Math.min(page, pages);
  $('pageInfo').textContent = 'Trang ' + page + '/' + pages + ' · ' + matching.length + ' kết quả';
  $('prevPage').disabled = page === 1;
  $('nextPage').disabled = page === pages;
  const rows = matching.slice((page - 1) * size, page * size);
  visibleIds = rows.map(row => row.video_id);
  $('rows').replaceChildren(...rows.map(row => {
    const article = document.createElement('article'), detail = document.createElement('details');
    const title = textElement('h3', row.title || row.video_id || '—');
    const summary = textElement('summary', 'Chi tiết và chỉnh sửa');
    const facts = videoFacts(row), url = sourceUrl(row.video_url);
    article.className = 'run scanner-video-card';
    detail.dataset.video = row.video_id;
    detail.open = openDetails.has(row.video_id);
    detail.append(summary);
    const checks = document.createElement('div');
    checks.className = 'scanner-card-checks';
    checks.append(textElement('h4', 'Kết quả theo từng điều kiện'));
    for (const [key, check] of Object.entries(row.checks || {})) {
      const line = document.createElement('p');
      line.textContent = (checkNames[key] || key) + ' · ' + (labels[check?.status] || check?.status || '—') + ' · ' + (check?.reason || '—');
      checks.append(line);
    }
    if (!Object.keys(row.checks || {}).length) checks.append(textElement('p', 'Chưa có chi tiết điều kiện.'));
    detail.append(checks);
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
    const thumbnail = document.createElement(url ? 'a' : 'div');
    thumbnail.className = 'scanner-thumbnail';
    if (url) {
      thumbnail.href = url;
      thumbnail.target = '_blank';
      thumbnail.rel = 'noopener noreferrer';
      thumbnail.setAttribute('aria-label', 'Mở video ' + title.textContent + ' trong tab mới');
    }
    const placeholder = textElement('span', 'Không có ảnh thu nhỏ', 'scanner-thumbnail-placeholder');
    thumbnail.append(placeholder);
    if (typeof row.video_id === 'string' && /^[\w-]{11}$/.test(row.video_id)) {
      const image = document.createElement('img');
      image.alt = '';
      image.loading = 'lazy';
      image.referrerPolicy = 'no-referrer';
      image.onload = () => { placeholder.hidden = true; };
      image.onerror = () => { image.hidden = true; placeholder.hidden = false; };
      image.src = 'https://i.ytimg.com/vi/' + encodeURIComponent(row.video_id) + '/mqdefault.jpg';
      thumbnail.append(image);
    }
    thumbnail.append(textElement('span', facts.duration, 'scanner-duration'));
    content.className = 'scanner-card-body';
    const heading = document.createElement('div'), badges = document.createElement('div');
    heading.className = 'scanner-card-heading';
    badges.className = 'scanner-card-badges';
    heading.append(title);
    if (url) {
      const open = textElement('a', 'Mở video', 'scanner-open-video');
      open.href = url;
      open.target = '_blank';
      open.rel = 'noopener noreferrer';
      heading.append(open);
    } else heading.append(textElement('span', 'Không có URL video', 'scanner-missing-url'));
    const evaluation = ['pending', 'synced'].includes(row.status) ? 'pass' : row.status;
    badges.append(textElement('span', labels[evaluation] || evaluation || '—', 'badge scanner-status-' + evaluation));
    if (['pending', 'synced'].includes(row.status)) {
      const state = row.status === 'pending' && row.review === 'reject' ? 'Tạm giữ gửi' : labels[row.status];
      badges.append(textElement('span', state, 'badge scanner-status-' + row.status));
    }
    if (row.review) {
      const review = document.createElement('span');
      review.className = 'badge scanner-review scanner-status-' + (row.review === 'pass' ? 'synced' : 'reject');
      review.textContent = 'Thủ công · ' + labels[row.review];
      badges.append(review);
    }
    const metadata = document.createElement('div');
    metadata.className = 'scanner-card-metadata';
    for (const text of [
      'Thời lượng: ' + facts.duration,
      'Lượt xem: ' + facts.views,
      'Tuổi khi quét: ' + facts.age,
      'Ngày đăng: ' + facts.published,
      'Lượt xem/ngày ước tính tại lần quét: ' + facts.rate + (facts.rate !== '—' ? facts.rateBasis : ''),
      'Thời điểm quét: ' + facts.measured,
    ]) metadata.append(textElement('span', text));
    content.append(heading, textElement('p', 'Chủ đề: ' + (row.type_topic || '—'), 'scanner-card-topic'), badges, metadata, detail);
    article.append(select, thumbnail, content);
    const actions = document.createElement('div');
    actions.className = 'row scanner-actions';
    detail.append(actions);
    function button(label, fn) {
      const b = document.createElement('button'); b.textContent = label;
      b.onclick = () => action(async () => { b.disabled = true; try { await fn(); } finally { b.disabled = false; } }); actions.append(b);
      return b;
    }
    button('Copy URL', () => navigator.clipboard.writeText(row.video_url)).disabled = !url;
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
