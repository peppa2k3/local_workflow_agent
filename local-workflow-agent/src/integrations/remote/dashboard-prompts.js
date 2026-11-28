function createDashboardPrompts() {
  const pending = new Map();
  function decide(id, proceed) {
    const entry = pending.get(id);
    if (!entry || typeof proceed !== 'boolean') return false;
    pending.delete(id);
    clearTimeout(entry.timer);
    entry.resolve({ proceed: proceed && Date.now() < entry.prompt.expiresAt });
    return true;
  }
  function open(id, message, deviceId, response) {
    if (pending.has(id) || pending.size >= 16) throw Error('Too many pending confirmations');
    return new Promise(resolve => {
      const prompt = { id, runId: id, kind: 'dashboard', message, expiresAt: Date.now() + 120000 };
      const timer = setTimeout(() => decide(id, false), 120000);
      pending.set(id, { prompt, resolve, timer, deviceId });
      response.once('close', () => decide(id, false));
    });
  }
  function snapshot(deviceId) {
    return [...pending.values()].filter(entry => entry.deviceId === deviceId).map(entry => entry.prompt);
  }
  return { open, decide, snapshot };
}
module.exports = { createDashboardPrompts };
