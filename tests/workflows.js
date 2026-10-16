const assert = require('node:assert/strict');
const { createWorkflows } = require('../src/agent/workflows');
const { createScenarioStore } = require('../src/agent/scenario-store');

(async () => {
  const workflows = createWorkflows({
    scenarios: createScenarioStore('.'), defaultProfile: 'Profile 1',
    profiles: () => ['Profile 1', 'Profile 2'].map(directory => ({ directory })),
    openFolder: async () => {}
  });
  const first = workflows.connect({ profile: 'Profile 1', clientId: 'first' });
  const second = workflows.connect({ profile: 'Profile 2', clientId: 'second' });
  assert.throws(() => workflows.connect({ profile: 'Profile 1', clientId: 'imposter' }), /Another extension/);
  assert.throws(() => workflows.connect({ clientId: 'legacy' }), /configure/);
  const scenario = { steps: [{ action: 'openUrl', url: 'https://example.test/' }, { action: 'click', selector: '#next' }] };
  workflows.start('Profile 1', scenario);
  workflows.start('Profile 2', scenario);
  const a = workflows.next(first), b = workflows.next(second);
  assert.equal(a.step.action, 'openUrl');
  assert.equal(workflows.status('Profile 1').index, 0, 'openUrl must wait for browser acknowledgement');
  assert.equal(workflows.next(first).step, null, 'cannot issue concurrent actions');
  assert.equal(b.step.action, 'openUrl', 'second profile can run concurrently');
  workflows.result(second, { runId: a.runId, id: 0, ok: true, tabId: 1 });
  assert.equal(second.index, 0, 'cross-profile results must not advance workflow');
  workflows.result(first, { runId: a.runId, id: 0, ok: true, tabId: 42 });
  const click = workflows.next(first);
  assert.equal(click.step.selector, '#next', 'legacy CSS selectors preserved');
  assert.equal(click.tabId, 42);
  workflows.stop('Profile 1');
  assert.equal(second.running, true, 'stopping one profile must not stop another');
  workflows.result(first, { runId: a.runId, id: 1, ok: true });
  assert.equal(first.index, 1, 'stale completion ignored');
  workflows.start('Profile 1', { steps: [{ action: 'wait', ms: 30 }, scenario.steps[0]] });
  assert.equal(workflows.status('Profile 1').running, true, 'status reads must not interrupt a local wait');
  assert.equal(workflows.next(first).step, null, 'local wait must not leak to browser');
  await new Promise(resolve => setTimeout(resolve, 50));
  const afterWait = workflows.next(first);
  assert.equal(afterWait.step.action, 'openUrl');
  workflows.result(first, { runId: afterWait.runId, id: 1, ok: true, tabId: 43 });
  assert.equal(first.running, false, 'final openUrl completes only after acknowledgement');
  second.deadline = Date.now() - 1;
  workflows.expire();
  assert.equal(second.running, false);
  assert.match(second.error, /timed out/);
  console.log('Profile isolation, sequential acknowledgement, cancellation and timeout: OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
