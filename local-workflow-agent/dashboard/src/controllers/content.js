const $ = id => document.getElementById(id);
const token = '__LOCAL_AGENT_DASHBOARD_TOKEN__';
const dateFormat = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Bangkok', dateStyle: 'short', timeStyle: 'medium' });
const date = value => value && Number.isFinite(new Date(value).getTime()) ? dateFormat.format(new Date(value)) : '—';
const short = value => value ? String(value).slice(0, 12) + '…' : '—';
const size = value => Number.isFinite(value) ? (value / 1048576).toFixed(1) + ' MB' : '—';
const duration = value => value == null ? '—' : Number(value).toFixed(1) + ' giây';
const states = { running: 'Đang chạy', succeeded: 'Thành công', failed: 'Thất bại', cancelled: 'Đã dừng', interrupted: 'Gián đoạn', pending: 'Chưa chạy', uploaded: 'Đã upload', file_selected: 'Đã chọn file', processed: 'Đã xử lý', published: 'Đã đăng', unverified: 'Chưa xác minh' };
const types = {
  downloads: { title: 'Download', columns: [['Clip', row => row.title || row.file_name], ['URL nguồn', row => row.source_url], ['File đã lưu', row => row.file_path], ['Dung lượng', row => size(row.size)], ['Thời gian tải', row => date(row.downloaded_at)]] },
  upload_events: { title: 'Upload', columns: [['File', row => row.file_path || row.file_name || 'Chưa có đường dẫn'], ['Page đích', row => row.page?.name || row.page_url || 'Chưa rõ page'], ['Asset', row => short(row.asset_id)], ['Kết quả', row => row.state === 'pending' ? 'Đã thử / chưa rõ kết quả' : states[row.state] || row.state], ['Thời gian thử / upload', row => date(row.uploaded_at || row.selected_at || row.attempted_at)], ['Lượt chạy', row => short(row.run_id)]] },
  pages: { title: 'Pages', columns: [['Tên page', row => row.name], ['Nền tảng', row => row.platform], ['URL', row => row.url], ['Trạng thái', row => row.active ? 'Đang hoạt động' : 'Đã ngừng'], ['Cập nhật', row => date(row.updated_at)]] },
  publications: { title: 'Publications', columns: [['Page', row => row.page?.name || short(row.page_id)], ['Mô tả', row => row.desc], ['Ngày đăng', row => date(row.published_at)], ['Link bài', row => row.post_url], ['Asset', row => short(row.asset_id)]] },
  assets: { title: 'Assets', columns: [['SHA-256', row => short(row._id)], ['Dung lượng', row => size(row.size)], ['Thời lượng', row => duration(row.duration)], ['Kho file', row => row.storage?.status || 'Metadata'], ['Tạo lúc', row => date(row.created_at)]] },
  file_instances: { title: 'File trên máy', columns: [['Tên file', row => row.name], ['Thư mục', row => row.folder_name], ['Tag', row => row.folder_tag], ['Đường dẫn', row => row.path], ['Nhập lần đầu', row => date(row.imported_at)]] },
  workflow_runs: { title: 'Lượt chạy', columns: [['Kịch bản', row => row.scenario], ['Profile', row => row.profile], ['Kết quả', row => states[row.state] || row.state], ['Tiến độ', row => row.stoppedAtStep ? 'Dừng tại bước ' + row.stoppedAtStep + '/' + row.total : row.index + '/' + row.total], ['Bắt đầu', row => date(row.startedAt)]] }
};
let selected = 'downloads', offset = 0, total = 0, rows = [], requestVersion = 0, editingPage = null, editingPublication = null, originalPublishedInput = '', detailId = '';
function message(value, failed = false, notify = true) { $('message').textContent = value; $('message').classList.toggle('error', failed); if (value && notify) window.toast[failed ? 'error' : 'success'](value); }
async function api(route, method = 'GET', body) {
  const response = await fetch('/api/content' + route, { method, headers: { 'Content-Type': 'application/json', 'X-Local-Agent-Session': token },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
  return result;
}
function connection(state) {
  $('connectionBadge').textContent = !state.enabled ? 'Chưa cấu hình' : state.connected ? 'Đã kết nối' : 'Chưa kết nối';
  $('connectionBadge').classList.toggle('ok', state.connected === true);
  $('connectionInfo').textContent = `Database: ${state.database || 'team_content'} · ${state.pending || 0} bản ghi local chờ đồng bộ · Đồng bộ gần nhất: ${date(state.lastSyncedAt)}`;
  $('connectionHelp').textContent = state.error || (!state.enabled ? 'Điền MONGODB_URI Atlas trong file .env của dự án, giữ MONGODB_DATABASE=team_content, rồi bấm Đọc lại .env / kết nối.' : 'Dữ liệu bên dưới được đọc trực tiếp từ database dùng chung. Bấm Làm mới để nhận thay đổi từ service khác.');
}
async function status() { const state = await api('/status'); connection(state); return state; }
async function summary() {
  const result = await api('/summary'); connection(result.storage);
  for (const [id, field] of [['countDownloads','downloads'],['countUploads','upload_events'],['countAssets','assets'],['countPublications','publications']]) $(id).textContent = result.counts[field] ?? 0;
}
function renderRows() {
  const head = document.createElement('tr');
  for (const title of [...types[selected].columns.map(column => column[0]), 'Thao tác']) { const th = document.createElement('th'); th.textContent = title; head.append(th); }
  $('tableHead').replaceChildren(head);
  $('tableBody').replaceChildren(...rows.map(row => {
    const tr = document.createElement('tr');
    for (const [, value] of types[selected].columns) { const td = document.createElement('td'); td.textContent = String(value(row) ?? '—'); tr.append(td); }
    const td = document.createElement('td'), detail = document.createElement('button'); detail.textContent = 'Chi tiết'; detail.onclick = () => showDetail(row); td.append(detail);
    if (['pages','publications'].includes(selected)) {
      const edit = document.createElement('button'); edit.textContent = 'Sửa'; edit.style.marginLeft = '6px'; edit.onclick = () => selected === 'pages' ? editPage(row) : editPublication(row); td.append(edit);
    }
    tr.append(td); return tr;
  }));
  $('empty').hidden = rows.length !== 0;
  $('tableStatus').textContent = `${total ? offset + 1 : 0}–${Math.min(offset + rows.length, total)} / ${total} bản ghi · MongoDB`;
  $('previous').disabled = offset === 0; $('next').disabled = offset + rows.length >= total;
}
async function load() {
  const version = ++requestVersion;
  message('Đang đọc dữ liệu…', false, false);
  const params = new URLSearchParams({ offset, limit: 25, q: $('search').value.trim() });
  if (selected === 'pages' && $('activeFilter').value) params.set('active', $('activeFilter').value);
  try {
    const result = await api('/catalog/' + selected + '?' + params);
    if (version !== requestVersion) return;
    rows = result.rows; total = result.total; renderRows(); message('');
  } catch (error) {
    if (version !== requestVersion) return;
    rows = []; total = 0; renderRows(); message(error.message, true);
  }
}
async function refresh() {
  try {
    const state = await status();
    if (!state.enabled) { rows = []; total = 0; renderRows(); message('Cấu hình .env để xem và quản lý dữ liệu trên Atlas.', false, false); return; }
    const results = await Promise.allSettled([summary(), load()]);
    for (const result of results) if (result.status === 'rejected') message(result.reason.message, true);
  } catch (error) { message(error.message, true); }
}
for (const [name, spec] of Object.entries(types)) {
  const button = document.createElement('button'); button.textContent = spec.title; button.role = 'tab'; button.setAttribute('aria-selected', name === selected);
  button.onclick = () => {
    selected = name; offset = 0;
    for (const item of $('tabs').children) item.setAttribute('aria-selected', item === button);
    $('activeFilterLabel').hidden = name !== 'pages'; $('newPage').hidden = name !== 'pages';
    void load();
  }; $('tabs').append(button);
}
function showDetail(row) {
  detailId = row._id; $('detailTitle').textContent = types[selected].title + ' · Chi tiết';
  const parts = Object.entries(row).map(([key, value]) => {
    const line = document.createElement('div'), name = document.createElement('strong'), content = document.createElement('div'); line.className = 'detail-row'; name.textContent = key;
    if (key === 'steps' && Array.isArray(value)) content.textContent = value.map(step => `${step.number}. ${step.label} · ${states[step.state] || step.state}${step.error ? '\n' + step.error : ''}`).join('\n\n');
    else content.textContent = value == null ? '—' : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
    line.append(name, content); return line;
  }); $('detailBody').replaceChildren(...parts); $('detailDialog').showModal();
}
function editPage(row = null) {
  editingPage = row; $('pageTitle').textContent = row ? 'Sửa page' : 'Thêm page';
  $('pageName').value = row?.name || ''; $('pagePlatform').value = row?.platform || 'Facebook'; $('pageUrl').value = row?.url || ''; $('pageActive').value = String(row?.active ?? true); $('pageError').textContent = ''; $('pageDialog').showModal();
}
$('pageForm').onsubmit = async event => {
  event.preventDefault(); $('savePage').disabled = true; $('pageError').textContent = '';
  try {
    const body = { name: $('pageName').value, platform: $('pagePlatform').value, url: $('pageUrl').value, active: $('pageActive').value === 'true' };
    if (editingPage) body.expectedUpdatedAt = editingPage.updated_at || null;
    await api('/pages' + (editingPage ? '/' + editingPage._id : ''), editingPage ? 'PATCH' : 'POST', body);
    $('pageDialog').close(); await refresh(); message('Đã lưu page vào database dùng chung.');
  } catch (error) { $('pageError').textContent = error.message; }
  finally { $('savePage').disabled = false; }
};
function bangkokInput(value) {
  if (!value) return '';
  const shifted = new Date(new Date(value).getTime() + 7 * 3600000);
  return shifted.toISOString().slice(0, 16);
}
function editPublication(row) {
  editingPublication = row; $('publicationDesc').value = row.desc || ''; $('postUrl').value = row.post_url || ''; $('publishedAt').value = bangkokInput(row.published_at); originalPublishedInput = $('publishedAt').value; $('publicationError').textContent = ''; $('publicationDialog').showModal();
}
$('publicationForm').onsubmit = async event => {
  event.preventDefault(); $('savePublication').disabled = true; $('publicationError').textContent = '';
  try {
    const input = $('publishedAt').value;
    const published = input === originalPublishedInput ? editingPublication.published_at : input ? new Date(input + ':00+07:00').toISOString() : null;
    await api('/publications/' + editingPublication._id, 'PATCH', { desc: $('publicationDesc').value, post_url: $('postUrl').value,
      published_at: published ?? null, expectedUpdatedAt: editingPublication.updated_at || null });
    $('publicationDialog').close(); await refresh(); message('Đã lưu publication, giữ nguyên ID bản ghi.');
  } catch (error) { $('publicationError').textContent = error.message; }
  finally { $('savePublication').disabled = false; }
};
for (const button of document.querySelectorAll('[data-close]')) button.onclick = () => $(button.dataset.close).close();
$('copyId').onclick = async () => { try { await navigator.clipboard.writeText(detailId); $('copyId').textContent = 'Đã sao chép'; } catch { message('ID: ' + detailId); } };
$('newPage').onclick = () => editPage();
$('searchForm').onsubmit = event => { event.preventDefault(); offset = 0; void load(); };
$('activeFilter').onchange = () => { offset = 0; void load(); };
$('previous').onclick = () => { offset = Math.max(0, offset - 25); void load(); };
$('next').onclick = () => { offset += 25; void load(); };
$('refresh').onclick = () => { void refresh(); };
for (const [id, route] of [['ping','/ping'],['reconnect','/reconnect'],['sync','/sync']]) $(id).onclick = async () => {
  for (const key of ['ping','reconnect','sync']) $(key).disabled = true;
  message('Đang kết nối / đồng bộ…', false, false);
  try { const state = await api(route, 'POST'); connection(state); await refresh(); if (state.error) message(state.error, true); }
  catch (error) { message(error.message, true); try { await status(); } catch {} }
  finally { for (const key of ['ping','reconnect','sync']) $(key).disabled = false; }
};
void refresh();
