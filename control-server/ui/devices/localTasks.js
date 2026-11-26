import { el, editScheduleTime } from './forms.js';
import { stateName } from './states.js';

export function renderLocalTasks(device, { $, when, submit, message, api, refresh }) {
  $('local-tasks').hidden = !device.localTasks;
  if (!device.localTasks) return;
  const { tasks, omitted } = device.localTasks;
  $('local-tasks-notice').textContent = [
    !device.online && 'Thiết bị offline · hiển thị dữ liệu từ lần kết nối cuối.',
    omitted > 0 && `Còn ${omitted} tác vụ vượt giới hạn đồng bộ.`,
  ]
    .filter(Boolean)
    .join(' ');
  function renderList(id, list, empty) {
    const target = $(id);
    const signature = JSON.stringify([device.id, device.online, list]);
    if (target.dataset.signature === signature) return;
    target.dataset.signature = signature;
    const rows = list.map((task) => {
      const row = el('article', undefined, 'run');
      row.append(el('strong', `${task.scenario} · ${task.profile}`));
      row.append(
        el(
          'p',
          task.state === 'running'
            ? `Tiến độ ${Math.min(task.index + 1, task.total)}/${task.total}`
            : `${when(task.scheduledAt)} · ${stateName[task.state]}`,
        ),
      );
      async function manage(action, scheduledAt) {
        await api('/api/commands', {
          requestId: crypto.randomUUID(),
          deviceId: device.id,
          type: 'manageLocalTask',
          taskId: task.id,
          profile: task.profile,
          scenario: task.scenario,
          action,
          expectedTime: task.scheduledAt,
          scheduledAt,
        });
        message('Đã gửi yêu cầu đến máy local.');
        await refresh();
      }
      function actionButton(label, action) {
        const button = el('button', label);
        button.onclick = () => submit(button, () => manage(action));
        row.append(button);
      }
      if (!device.online) return row;
      if (task.state === 'running') actionButton('Dừng lượt local', 'stop');
      if (task.state === 'confirming' && task.confirmBy > Date.now()) actionButton('Chạy ngay', 'confirm');
      if (task.state === 'scheduled' || (task.state === 'confirming' && task.confirmBy > Date.now()))
        actionButton('Hủy lịch', 'cancel');
      if (task.state === 'scheduled')
        row.append(
          editScheduleTime(task.scheduledAt, (scheduledAt, button) =>
            submit(button, () => manage('reschedule', scheduledAt)),
          ),
        );
      return row;
    });
    target.replaceChildren(...(rows.length ? rows : [el('p', empty, 'muted')]));
  }
  renderList(
    'local-running',
    tasks.filter((task) => task.state === 'running'),
    'Chưa có lượt chạy local.',
  );
  renderList(
    'local-schedules',
    tasks.filter((task) => task.state !== 'running'),
    'Chưa có lịch local đang chờ.',
  );
}
