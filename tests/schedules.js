const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createSchedules } = require('../local-workflow-agent/src/workflow/schedules');
const { createCommandApi } = require('../control-server/src/commands');
const { createStore } = require('../control-server/src/store');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'schedule-test-'));
const realNow = Date.now;
let time = Date.UTC(2026, 9, 1);
Date.now = () => time;
const store = createStore(':memory:');
try {
  const runs = [], workflows = {
    session: () => ({ running: false }), getRun: id => runs.includes(id),
    start(profile, scenario, uploadPath, name, variables, timeout, id) { runs.push(id); }
  };
  const settings = { dataDir: dir, scenarios: { load: () => ({}), prepare() {} }, workflows };
  let local = createSchedules(settings);
  const input = { profile: 'Default', scenario: 'sample', scheduledAt: time + 60000 };
  const first = local.create(input), second = local.create(input);
  local.reschedule(second.id, time + 120000);
  local = createSchedules(settings);
  local.tick();
  assert.equal(local.list()[0].state, 'scheduled');
  time += 60000;
  local.tick();
  assert.equal(local.list()[0].confirmBy, time + 30000);
  local.decide(first.id, false);
  time += 60000;
  local.tick();
  time += 29999;
  local.tick();
  assert.equal(runs.length, 0);
  time++;
  local = createSchedules(settings);
  local.tick();
  local.tick();
  assert.deepEqual(runs, [second.id]);
  assert.throws(() => local.decide(second.id, false));
  const yes = local.create({ ...input, scheduledAt: time });
  local.tick();
  local.decide(yes.id, true);
  assert.deepEqual(runs, [second.id, yes.id]);

  const metadata = { profiles: [{ directory: 'Default', name: 'Test' }], scenarios: [{ name: 'sample', variables: [], steps: 1 }] };
  const user = { id: randomUUID() }, device = { id: randomUUID(), owner: user.id, metadata, lastSeen: 0 };
  store.put('device', device, user.id);
  const server = createCommandApi(store), instanceId = randomUUID();
  const exchange = () => server.device('/device/exchange', store.get('device', device.id), { metadata, reports: [], instanceId });
  const schedule = { type: 'run', deviceId: device.id, profile: 'Default', scenario: 'sample', requestId: randomUUID(), scheduledAt: time + 60000 };
  const post = data => server.account('/api/commands', 'POST', user, data);
  const decision = data => server.account('/api/schedule-decision', 'POST', user, { deviceId: device.id, ...data });
  assert.equal(post(schedule).command.state, 'scheduled');
  assert.equal(post(schedule).duplicate, true);
  assert.equal(exchange().command, null);
  decision({ runId: schedule.requestId, scheduledAt: time + 120000 });
  const later = { ...schedule, requestId: randomUUID(), scheduledAt: time + 180000 };
  post(later);
  time += 120000;
  assert.equal(exchange().schedulePrompts[0].id, schedule.requestId);
  assert.throws(() => server.account('/api/schedule-decision', 'POST', { id: randomUUID() }, { deviceId: device.id, runId: schedule.requestId, proceed: true }));
  decision({ runId: schedule.requestId, proceed: false });
  assert.equal(exchange().command, null);
  time += 60000;
  assert.equal(exchange().schedulePrompts[0].id, later.requestId);
  time += 29999;
  assert.equal(exchange().command, null);
  time++;
  assert.equal(exchange().command.id, later.requestId);
  assert.equal(exchange().command, null);
  console.log('Schedules: offline creation, persistence, rescheduling, confirmation, timeout and single dispatch passed.');
} finally {
  Date.now = realNow;
  store.close();
  fs.rmSync(dir, { recursive: true, force: true });
}
