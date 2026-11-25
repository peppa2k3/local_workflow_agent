const c = require('../shared/remote-protocol');

const ACTIVE = ['queued', 'dispatched', 'running'];
const SCHEDULE_STATES = ['scheduled', 'confirming', 'approved'];
const RESERVED = [...ACTIVE, 'confirming', 'approved'];

const PENDING_RUN = new Set([...RESERVED, 'scheduled', 'unknown', 'interrupted']);

function createCommand(id, owner, deviceId, type, payload, now = Date.now()) {
  return { id, owner, deviceId, type, payload, fingerprint: c.hash(JSON.stringify({ deviceId, type, payload })),
    state: type === 'run' && payload.scheduledAt ? 'scheduled' : 'queued', created: now,
    expires: now + 300000, deliveryUntil: 0, seq: 0, result: null };
}

module.exports = { PENDING_RUN, ACTIVE, SCHEDULE_STATES, RESERVED, createCommand };
