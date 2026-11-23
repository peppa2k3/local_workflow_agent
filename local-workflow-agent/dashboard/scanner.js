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
async function refresh() {
  if (refreshing || document.hidden) return;
  refreshing = true;
  try {
    const s = await api('status');
    enabled = s.enabled;
    $('toggle').disabled = false;
    $('toggle').textContent = enabled ? 'Tắt quét' : 'Bật quét';
    $('state').textContent = [s.scanning ? 'Đang quét' : enabled ? 'Đang chờ quét' : 'Đã tắt', s.error, s.syncError,
      'Request đã dùng: ' + (s.quota?.used || 0) + '/' + (s.config?.requestsPerDay ?? '?')].filter(Boolean).join(' · ');
    $('settings').textContent = 'Sửa config.json và keywords.txt trong ' + s.directory;
    $('topics').textContent = s.topics.map(t => t.code + ': ' + t.phrases.join(', ')).join(' | ');
    const next = JSON.stringify(s.rows);
    if (signature === next) return;
    signature = next;
    $('rows').replaceChildren(...s.rows.map(row => {
      const article = document.createElement('article'), title = document.createElement('h3'), detail = document.createElement('p');
      title.textContent = row.title || row.video_id;
      detail.textContent = row.status + ' · ' + Object.entries(row.checks).map(([k,c]) => k + ': ' + c.status + ' (' + c.reason + ')').join(' · ');
      article.append(title, detail);
      function button(label, fn) {
        const b = document.createElement('button'); b.textContent = label;
        b.onclick = () => action(async () => { b.disabled = true; try { await fn(); } finally { b.disabled = false; } }); article.append(b);
      }
      button('Copy URL', () => navigator.clipboard.writeText(row.video_url));
      button('Copy JSON', () => navigator.clipboard.writeText(JSON.stringify(row,null,2)));
      if (row.status === 'synced') button('Tải clip', async () => { $('feedback').textContent = (await api('download',{video_id:row.video_id})).file; });
      return article;
    }));
  } finally { refreshing = false; }
}
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
