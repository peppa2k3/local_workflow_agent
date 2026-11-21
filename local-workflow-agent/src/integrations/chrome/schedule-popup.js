const { spawn } = require('node:child_process');

// WScript opens a desktop dialog even when no dashboard tab is open.
function createSchedulePopups(decide) {
  const opened = new Map();
  function sync(tasks) {
    const ids = new Set(tasks.map(task => task.id));
    for (const [id, child] of opened) if (!ids.has(id)) {
      child?.kill();
      opened.delete(id);
    }
    if (process.platform !== 'win32') return;
    for (const task of tasks) {
      if (opened.has(task.id) || task.confirmBy <= Date.now()) continue;
      const script = '$w = New-Object -ComObject WScript.Shell; exit $w.Popup($env:SCHEDULE_MESSAGE, [int]$env:SCHEDULE_SECONDS, "Local Agent", 4132)';
      const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
        windowsHide: true, stdio: 'ignore', env: { ...process.env,
          SCHEDULE_MESSAGE: `Chạy ${task.scenario} trên ${task.profile}? Tự chạy sau 30 giây.`,
          SCHEDULE_SECONDS: String(Math.max(1, Math.ceil((task.confirmBy - Date.now()) / 1000))) }
      });
      opened.set(task.id, child);
      child.on('error', error => console.error('Schedule popup:', error.message));
      child.on('exit', code => {
        if (opened.get(task.id) !== child) return;
        opened.set(task.id, null);
        if (code === 6 || code === 7) Promise.resolve().then(() => decide(task, code === 6)).catch(error => console.error('Schedule decision:', error.message));
      });
    }
  }
  return { sync };
}
module.exports = { createSchedulePopups };
