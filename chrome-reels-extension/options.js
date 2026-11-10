const base = 'http://127.0.0.1:34719';
const select = document.getElementById('profile');
const message = document.getElementById('message');
async function request(path, body) {
  const response = await fetch(base + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(10000)
  });
  const data = await response.json();
  if (!response.ok) {
    if (path === '/api/profiles' && [400, 401, 404].includes(response.status)) throw new Error('Agent đang chạy bản cũ. Khởi động lại node local-agent.js rồi mở lại Extension options');
    throw new Error(data.error || `Agent HTTP ${response.status}`);
  }
  return data;
}
async function load() {
  // A cross-origin GET can omit Origin and be treated as an unauthenticated API
  // client. POST remains read-only here and carries Chrome's extension origin.
  const data = await request('/api/profiles', {});
  const config = await chrome.storage.local.get(['profile']);
  for (const item of data.profiles) {
    const option = document.createElement('option');
    option.value = item.directory; option.textContent = `${item.name} (${item.directory})`;
    select.append(option);
  }
  select.value = config.profile || '';
}
document.getElementById('save').onclick = async () => {
  try {
    if (!select.value) throw new Error('Hãy chọn profile của cửa sổ Chrome này');
    const config = await chrome.storage.local.get(['profile', 'clientId']);
    const clientId = config.clientId || crypto.randomUUID();
    if (config.profile) {
      const state = await request('/state', { profile: config.profile, clientId });
      if (state.running) throw new Error('Dừng kịch bản trước khi đổi profile');
    }
    await request('/state', { profile: select.value, clientId });
    await chrome.storage.local.set({ profile: select.value, clientId });
    message.textContent = 'Đã lưu. Extension sẽ kết nối agent trong vài giây.';
  } catch (error) { message.textContent = error.message; }
};
load().catch(error => { message.textContent = `${error.message}. Chạy node local-agent.js rồi mở lại trang này.`; });
