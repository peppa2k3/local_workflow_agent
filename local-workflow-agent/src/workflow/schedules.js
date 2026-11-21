const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { atomicJson, readJson } = require('../../shared/remote-protocol');

function createSchedules({ dataDir, workflows, scenarios, now = Date.now }) {
  const file = path.join(dataDir, 'schedules.json');
  let tasks = readJson(file, []);
  function persist(next) {
    atomicJson(file, next);
    tasks = next;
  }
  function change(task, fields) {
    persist(tasks.map(item => item.id === task.id ? { ...item, ...fields } : item));
  }
  function validateTime(scheduledAt) {
    if (!Number.isSafeInteger(scheduledAt) || !Number.isFinite(new Date(scheduledAt).getTime()) ||
        scheduledAt < Math.floor(now() / 60000) * 60000) throw Error('Chọn phút hiện tại hoặc tương lai.');
  }
  function create({ profile, scenario, scheduledAt, uploadPath = '' }) {
    if (!profile || typeof uploadPath !== 'string') throw Error('Chọn profile và đường dẫn hợp lệ.');
    workflows.session(profile);
    scenarios.prepare(scenarios.load(scenario), uploadPath);
    validateTime(scheduledAt);
    const task = { id: randomUUID(), profile, scenario, uploadPath, scheduledAt, state: 'scheduled' };
    persist([...tasks, task]);
    return task;
  }
  function reschedule(id, scheduledAt) {
    validateTime(scheduledAt);
    const task = tasks.find(item => item.id === id);
    if (task?.state !== 'scheduled') throw Error('Chỉ có thể đổi giờ của lịch đang chờ.');
    change(task, { scheduledAt });
  }
  function start(task) {
    change(task, { state: 'starting' });
    try {
      workflows.start(task.profile, scenarios.load(task.scenario), task.uploadPath, task.scenario, {}, 3600000, task.id);
    } catch (error) {
      change(task, { state: 'failed', error: error.message });
      return;
    }
    change(task, { state: 'started' });
  }
  function decide(id, proceed) {
    const task = tasks.find(item => item.id === id);
    if (typeof proceed !== 'boolean' || !task || !(task.state === 'scheduled' && !proceed ||
        task.state === 'confirming' && now() < task.confirmBy)) throw Error('Lịch đã thay đổi hoặc hết hạn xác nhận.');
    if (proceed) start(task);
    else change(task, { state: 'cancelled' });
  }
  function tick() {
    for (const task of tasks) {
      if (task.state === 'starting') change(task, { state: workflows.getRun(task.id) ? 'started' : 'interrupted' });
      else if (task.state === 'confirming' && now() >= task.confirmBy) start(task);
    }
    const reserved = new Set(tasks.filter(task => task.state === 'confirming').map(task => task.profile));
    for (const task of tasks.filter(item => item.state === 'scheduled' && item.scheduledAt <= now()).sort((a,b) => a.scheduledAt - b.scheduledAt)) {
      if (reserved.has(task.profile)) continue;
      try { if (workflows.session(task.profile).running) continue; }
      catch (error) { change(task, { state: 'failed', error: error.message }); continue; }
      change(task, { state: 'confirming', confirmBy: now() + 30000 });
      reserved.add(task.profile);
    }
  }
  return { create, reschedule, decide, tick, list: () => tasks };
}
module.exports = { createSchedules };
