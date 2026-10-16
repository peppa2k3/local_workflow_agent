const base = 'http://127.0.0.1:34719';
const select = document.getElementById('profile');
const message = document.getElementById('message');
async function load() {
  const response = await fetch(base + '/api/profiles');
  if (!response.ok) throw new Error('Agent chưa sẵn sàng');
  const data = await response.json();
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
      const state = await fetch(base + '/state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile: config.profile, clientId }) }).then(response => response.json());
      if (state.running) throw new Error('Dừng kịch bản trước khi đổi profile');
    }
    const response = await fetch(base + '/state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile: select.value, clientId }) });
    const state = await response.json();
    if (!response.ok) throw new Error(state.error || 'Không thể kết nối profile');
    await chrome.storage.local.set({ profile: select.value, clientId });
    message.textContent = 'Đã lưu. Extension sẽ kết nối agent trong vài giây.';
  } catch (error) { message.textContent = error.message; }
};
load().catch(error => { message.textContent = `${error.message}. Chạy node local-agent.js rồi mở lại trang này.`; });
