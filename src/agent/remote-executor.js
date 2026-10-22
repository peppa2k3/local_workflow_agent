const path = require('node:path');
const c = require('../remote/common');
function createRemoteExecutor({ dataDir, workflows, scenarios, getPolicy }) {
  const file = path.join(dataDir, 'remote-journal.json');
  const journal = c.readJson(file, {});
  const save = () => c.atomicJson(file, journal);
  function result(run) {
    return { runId: run.runId, state: run.state, index: run.index, total: run.total, stoppedAtStep: run.stoppedAtStep,
      steps: (run.steps || []).slice(0, 100).map(s => ({ number: s.number, state: s.state, action: s.action, label: String(s.label || '').slice(0, 120) })),
      startedAt: run.startedAt, endedAt: run.endedAt,
      message: ['failed', 'interrupted'].includes(run.state) ? 'Workflow failed/interrupted. See local history for details.' : '' };
  }
  function update(record, value) {
    if (JSON.stringify(record.result) !== JSON.stringify(value)) { record.result = value; record.seq++; save(); }
  }
  function execute(command, deviceId) {
    c.uuid(command.id);
    const existing = journal[command.id];
    if (existing) {
      if (existing.deviceId !== deviceId) c.fail('Command belongs to a different pairing');
      return; // Already received, including an ambiguous crash: never replay side effects.
    }
    const record = { id: command.id, deviceId, type: command.type, payload: command.payload, seq: 0, ack: 0, phase: 'starting', result: null };
    journal[record.id] = record; save(); // Must reach durable storage before calling the engine.
    try {
      if (!Number.isFinite(command.expires) || Date.now() > command.expires) c.fail('Command expired before execution');
      if (command.type === 'run') {
        const p = command.payload, policy = getPolicy();
        if (!policy.profiles.includes(p.profile) || !policy.scenarios.includes(p.scenario)) c.fail('Local policy no longer permits this command');
        if (!c.object(p.variables) || Object.entries(p.variables).some(([k, v]) => !policy.variables[p.scenario]?.includes(k)
          || !Object.hasOwn(scenarios.load(p.scenario).variables || {}, k) || !['string', 'number', 'boolean'].includes(typeof v))) c.fail('Variable override not allowed');
        const run = workflows.start(p.profile, scenarios.load(p.scenario), '', p.scenario, p.variables, 3600000, record.id);
        record.phase = 'started'; update(record, result(run));
      } else if (command.type === 'stop') {
        const targetId = c.uuid(command.payload.runId), target = journal[targetId];
        if (target && target.deviceId !== deviceId) c.fail('Cannot stop a run from a different pairing');
        if (target?.type === 'run') {
          const run = workflows.stopRun(targetId); if (run) update(target, result(run));
        } else if (!target) {
          // Stop can arrive ahead of a lost run delivery. Record a cancellation tombstone.
          journal[targetId] = { id: targetId, deviceId, type: 'run', phase: 'cancelled', payload: {}, seq: 1, ack: 0, result: { state: 'cancelled', message: 'Cancelled before local delivery' } };
        }
        record.phase = 'done'; update(record, { state: 'succeeded' });
      } else c.fail('Unsupported command');
    } catch {
      const run = command.type === 'run' && workflows.getRun(record.id);
      record.phase = 'done'; update(record, run ? result(run) : { state: 'rejected', message: 'Local validation failed; inspect the local dashboard and policy.' });
    }
    save();
  }
  function reports(deviceId) {
    for (const record of Object.values(journal)) {
      if (record.deviceId !== deviceId) continue;
      if (['starting', 'started'].includes(record.phase)) {
        const run = record.type === 'run' && workflows.getRun(record.id);
        if (run) update(record, result(run));
        else { record.phase = 'done'; update(record, { state: 'unknown', message: 'Agent restarted during acceptance; this command will not be replayed.' }); }
      }
    }
    const batch = []; let bytes = 0;
    for (const r of Object.values(journal)) if (r.deviceId === deviceId && r.seq > r.ack) {
      const item = { id: r.id, seq: r.seq, result: r.result }, length = Buffer.byteLength(JSON.stringify(item));
      if (batch.length === 20 || bytes + length > 60000) break;
      batch.push(item); bytes += length;
    }
    return batch;
  }
  function acknowledge(ack) {
    let changed = false;
    for (const item of ack || []) { const r = journal[item.id]; if (r && item.seq <= r.seq && item.seq > r.ack) { r.ack = item.seq; changed = true; } }
    if (changed) save();
  }
  function stopOwned(deviceId, policy) {
    for (const r of Object.values(journal)) if (r.deviceId === deviceId && r.type === 'run' && r.phase === 'started'
      && (!policy || !policy.profiles.includes(r.payload.profile) || !policy.scenarios.includes(r.payload.scenario))) {
      const run = workflows.stopRun(r.id); if (run) update(r, result(run));
    }
  }
  return { execute, reports, acknowledge, stopOwned };
}
module.exports = { createRemoteExecutor };
