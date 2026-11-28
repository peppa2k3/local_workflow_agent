const c = require('../shared/remote-protocol');

function reconcilePrompts(incoming, meta, previousPrompts) {
  const prompts = incoming ?? [];
  if (!Array.isArray(prompts) || prompts.length > meta.profiles.length + 16) c.fail('Invalid confirmation list');
  return prompts.map(p => {
    if (!c.object(p) || typeof p.message !== 'string' || p.message.length > 2048) c.fail('Invalid confirmation');
    const prompt = { id: c.uuid(p.id), runId: c.uuid(p.runId), message: p.message,
      kind: p.kind === 'dashboard' ? 'dashboard' : 'workflow' };
    if (p.expiresAt !== undefined) {
      if (!Number.isSafeInteger(p.expiresAt)) c.fail('Invalid confirmation deadline');
      prompt.expiresAt = p.expiresAt;
    }
    if (prompt.kind === 'workflow') {
      if (!meta.profiles.some(row => row.directory === p.profile && row.running) ||
          !meta.scenarios.some(row => row.name === p.scenario) || !Number.isInteger(p.step) || p.step < 1)
        c.fail('Invalid workflow confirmation');
      Object.assign(prompt, { profile: p.profile, scenario: p.scenario, step: p.step, duplicate: p.duplicate === true });
      if (p.name) prompt.name = c.text(p.name, 255);
      if (p.filePath) prompt.filePath = c.text(p.filePath, 1024);
    }
    const previous = previousPrompts.find(row => row.id === p.id && row.runId === p.runId);
    if (typeof previous?.proceed === 'boolean') prompt.proceed = previous.proceed;
    return prompt;
  });
}
module.exports = { reconcilePrompts };
