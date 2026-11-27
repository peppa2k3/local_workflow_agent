const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { createScenarioStore, stepBudget } = require('../local-workflow-agent/src/workflow/scenario-store');
const { createWorkflows } = require('../local-workflow-agent/src/workflow/workflows');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-'));
const video = path.join(dir, 'a.mp4'); fs.writeFileSync(video, 'x');
const store = createScenarioStore(dir);
const prep = step => store.prepareStep(step);

function harness(steps) {
  const recorded = [];
  const wf = createWorkflows({ scenarios: store, defaultProfile: 'Default', profiles: () => [{ directory: 'Default' }],
    openProfile: async () => {}, openFolder: async () => {}, downloadVideo: async () => { throw new Error('n/a'); },
    activity: { saveRun() {}, readRun: () => null, onPageRemap() {}, recordUpload: (...a) => { recorded.push(a); return {}; },
      registerFile: async () => ({ asset_id: 'x' }), recordUploadAttempt() {} } });
  wf.start('Default', { name: 't', steps });
  const s = wf.session('Default');
  wf.connect({ profile: 'Default', clientId: 'c' });
  return { wf, s, recorded };
}
const click = (extra = {}) => ({ action: 'click', locator: 'Next', ...extra });
const tick = () => new Promise(r => setImmediate(r));

test('validateStep: legacy partial completion is dropped WITH a warning', () => {
  const step = prep({ action: 'click', locator: 'a', completion: { state: 'visible' } });
  assert.equal(step.completion, undefined);
  assert.match(step.warnings[0], /completion chưa có locator/);
});
test('validateStep: legacy full completion untouched, no warnings', () => {
  const step = prep({ action: 'click', locator: 'a', completion: { locator: 'b', state: 'visible' } });
  assert.deepEqual(step.completion, { locator: 'b', state: 'visible' });
  assert.equal(step.warnings, undefined);
});
test('validateStep: new completion fields need a locator, are range-checked', () => {
  assert.throws(() => prep({ action: 'click', locator: 'a', completion: { timeoutMs: 5000 } }), /thiếu locator/);
  assert.throws(() => prep({ action: 'click', locator: 'a', completion: { locator: 'b', timeoutMs: 3600001 } }), /timeoutMs/);
  assert.throws(() => prep({ action: 'click', locator: 'a', completion: { locator: 'b', stage: 'nope' } }), /stage/);
  assert.equal(prep({ action: 'click', locator: 'a', completion: { locator: 'b', timeoutMs: '900000', stage: 'published' } }).completion.timeoutMs, 900000);
  assert.throws(() => prep({ action: 'click', locator: 'a', timeoutMs: 400000 }), /Invalid timeoutMs/);
  assert.throws(() => prep({ action: 'click', locator: 'a', retry: { attempts: 6 } }), /retry.attempts/);
  assert.throws(() => prep({ action: 'click', locator: 'a', onError: 'ignore' }), /onError/);
});
test('upload without completion warns that only file selection is confirmed', () => {
  const step = prep({ action: 'upload', locator: 'x', filePath: video });
  assert.match(step.warnings.join(' '), /chỉ xác nhận đã chọn file/);
  assert.equal(prep({ action: 'upload', locator: 'x', filePath: video, completion: { locator: 'y', stage: 'uploaded' } }).warnings, undefined);
});
test('budget: covers legacy worst case, completion timeout and retries', () => {
  const legacy = s => (s.timeoutMs || 10000) + (s.navigationTimeoutMs || 30000) + (s.waitAfterMs || 0) + (s.times || 1) * (s.intervalMs || 2500) + 30000;
  assert.ok(stepBudget(click()) >= legacy(click()));
  const big = click({ completion: { locator: 'ok', timeoutMs: 900000 } });
  assert.ok(stepBudget(big) > 900000);
  const retried = click({ retry: { attempts: 2, delayMs: 5000 } });
  assert.ok(stepBudget(retried) > 3 * (stepBudget(click()) - 30000));
});

test('next() hands out a budget and token; extension deadline is derived from it', () => {
  const { wf, s } = harness([click({ completion: { locator: 'ok', timeoutMs: 600000 } })]);
  const answer = wf.next(s, 1);
  assert.ok(answer.step.token && answer.step.budgetMs > 600000);
  assert.equal(s.steps[0].timeouts.completionMs, 600000);
});
test('result with a stale token or stale runId is ignored', () => {
  const { wf, s } = harness([click(), click()]);
  const a = wf.next(s, 1);
  wf.result(s, { ok: true, runId: a.runId, id: 0 });
  assert.equal(s.inFlight, true);
  wf.result(s, { ok: true, runId: a.runId, id: 0, token: 'old' });
  assert.equal(s.index, 0); assert.equal(s.inFlight, true);
  wf.result(s, { ok: true, runId: 'other', id: 0, token: a.step.token });
  assert.equal(s.index, 0);
});
test('a late result after Stop cannot advance a new run', () => {
  const { wf, s } = harness([click(), click()]);
  const a = wf.next(s, 1);
  wf.stop('Default');
  wf.start('Default', { name: 't2', steps: [click(), click()] });
  wf.result(s, { ok: true, runId: a.runId, id: 0, token: a.step.token });
  assert.equal(s.index, 0);
});
test('definite failure stops the run with error type and attempts recorded', () => {
  const { wf, s } = harness([click(), click()]);
  const a = wf.next(s, 1);
  wf.result(s, { ok: false, status: 'failed', errorType: 'element_not_found', attempts: 3, runId: a.runId, id: 0, token: a.step.token, error: 'Element not found' });
  const st = wf.status('Default');
  assert.equal(st.state, 'failed'); assert.equal(st.errorType, 'element_not_found');
  assert.equal(st.steps[0].attempts, 3); assert.equal(st.steps[0].verification, 'failed'); assert.equal(st.steps[0].state, 'failed');
});
test('onError:continue skips a definite failure and runs the next step', async () => {
  const { wf, s } = harness([click({ onError: 'continue' }), click()]);
  const a = wf.next(s, 1);
  wf.result(s, { ok: false, errorType: 'element_not_found', dispatched: false, runId: a.runId, id: 0, token: a.step.token, error: 'x' });
  await tick();
  assert.equal(s.running, true); assert.equal(s.index, 1);
  assert.equal(s.steps[0].continued, true); assert.equal(s.steps[0].state, 'failed');
});
test('unverified is never skipped, even with onError:continue; run needs a human check', () => {
  const { wf, s } = harness([click({ onError: 'continue' }), click()]);
  const a = wf.next(s, 1);
  wf.result(s, { ok: false, status: 'unverified', errorType: 'completion_timeout', dispatched: true, runId: a.runId, id: 0, token: a.step.token, error: 'Completion timed out' });
  const st = wf.status('Default');
  assert.equal(st.running, false); assert.equal(st.errorType, 'unverified');
  assert.equal(st.steps[0].state, 'unverified'); assert.equal(st.steps[0].dispatched, true);
  assert.match(st.error, /Kết quả chưa xác định/);
});
test('agent-side timeout of a click is unverified; of a waitFor is a plain failure', () => {
  for (const [step, expected] of [[click(), 'unverified'], [{ action: 'waitFor', locator: 'x' }, 'failed']]) {
    const { wf, s } = harness([step]);
    wf.next(s, 1); s.deadline = Date.now() - 1; wf.expire();
    assert.equal(wf.status('Default').steps[0].verification, expected);
    assert.equal(wf.status('Default').errorType, expected === 'unverified' ? 'unverified' : 'agent_timeout');
  }
});
test('success records stage/verification and passes them to upload history', async () => {
  const { wf, s, recorded } = harness([{ action: 'upload', locator: 'x', filePath: video }]);
  await tick(); await tick();
  const a = wf.next(s, 1);
  wf.result(s, { ok: true, stage: 'file_selected', confirmed: false, attempts: 1, runId: a.runId, id: 0, token: a.step.token });
  const st = wf.status('Default');
  assert.equal(st.steps[0].stage, 'file_selected'); assert.equal(st.steps[0].verification, 'not_verified');
  assert.match(st.steps[0].warnings[0], /chỉ xác nhận đã chọn file/);
  assert.equal(recorded[0][2].confirmed, false);
});
test('old scenario JSON (no new fields) still prepares and dispatches unchanged', () => {
  const { wf, s } = harness([{ action: 'click', locator: 'Next', timeoutMs: 5000 }]);
  const a = wf.next(s, 1);
  assert.equal(a.step.locator, 'Next'); assert.equal(a.step.retry, undefined); assert.equal(a.step.onError, undefined);
});

test('overall deadline after handing off a click records an unknown dispatch', () => {
  const { wf, s } = harness([click()]);
  wf.next(s, 1); s.runDeadline = Date.now() - 1; wf.expire();
  assert.equal(s.steps[0].state, 'unverified');
  assert.equal(s.steps[0].dispatched, null);
  assert.equal(s.steps[0].error_type, 'run_timeout');
});
test('optional step stops on configuration errors and unknown dispatch', () => {
  for (const details of [{ errorType: 'config', dispatched: false }, { errorType: 'element_not_found' }]) {
    const { wf, s } = harness([click({ onError: 'continue' }), click()]);
    const a = wf.next(s, 1);
    wf.result(s, { ...details, ok: false, token: a.step.token, id: 0, runId: a.runId });
    assert.equal(s.running, false);
    assert.equal(s.index, 0);
  }
});
test('legacy bridge cannot claim a step requiring the new protocol', () => {
  const { wf, s } = harness([click({ retry: { attempts: 1 } })]);
  assert.equal(wf.next(s).step, null);
  assert.equal(s.running, false);
});
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
