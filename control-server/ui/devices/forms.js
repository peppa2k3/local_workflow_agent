export function el(tag, text, className) {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (className) n.className = className;
  return n;
}
export function editScheduleTime(timestamp, save) {
  const details = document.createElement('details'),
    summary = document.createElement('summary');
  summary.textContent = 'Đổi giờ';
  const input = document.createElement('input'),
    button = document.createElement('button');
  input.type = 'datetime-local';
  input.setAttribute('aria-label', 'Giờ chạy mới');
  const date = new Date(timestamp);
  input.value = new Date(timestamp - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  button.textContent = 'Lưu giờ mới';
  button.onclick = () => save(new Date(input.value).getTime(), button);
  details.append(summary, input, button);
  return details;
}
