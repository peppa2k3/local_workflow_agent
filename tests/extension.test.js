const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
const StepPolicy = require('../chrome-reels-extension/step-policy.js');

// Loads the real background.js with scripted Chrome/agent behaviour.
function load({ page, agent = {} } = {}) {
  const log = { messages: [], debugger: [] };
  const state = { running: true, runId: 'r1', failState: false, ...agent };
  const listeners = () => ({ addListener() {} });
  const chrome = {
    storage: { local: { get: async () => ({}), set: async () => {} }, onChanged: listeners() },
    alarms: { create() {}, onAlarm: listeners() },
    runtime: { onMessage: listeners(), onInstalled: listeners(), onStartup: listeners(), openOptionsPage() {} },
    tabs: { onCreated: listeners(), get: async id => ({ id, url: 'https://site.test/', status: 'complete' }),
      query: async () => [], create: async () => ({ id: 9 }), remove: async () => {},
      sendMessage: async (id, message) => {
        log.messages.push(message.type);
        if (message.type === 'ready') return { ok: true, readyState: 'complete', quietForMs: 1000 };
        if (message.type === 'cancel') return { ok: true };
        return page(message, log);
      } },
    scripting: { executeScript: async () => {} },
    debugger: { onDetach: listeners(), onEvent: listeners(), getTargets: async () => [{ tabId: 1, attached: true }], attach: async () => {},
      sendCommand: async (t, method, params) => { log.debugger.push(`${method}:${params?.type || ''}`); return {}; } }
  };
  const context = { chrome, console, URL, AbortSignal, setTimeout, clearTimeout, setInterval: () => 0, clearInterval, Promise, Date, Error, TypeError, Math, Number, String, Object,
    crypto: { randomUUID: () => 'id' },
    importScripts: file => vm.runInContext(fs.readFileSync(path.join(__dirname, '../chrome-reels-extension', file), 'utf8'), context),
    fetch: async url => {
      if (state.failState) throw new TypeError('fetch failed');
      return { ok: true, json: async () => ({ running: state.running, runId: state.runId }) };
    } };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../chrome-reels-extension/background.js'), 'utf8'), context);
  const job = (extra = {}) => ({ client: { profile: 'Default', clientId: 'c' }, runId: 'r1', tabId: 1, abort: new AbortController(), budgetMs: 0, deadline: 0, stateFailures: 0, dispatched: false, ...extra });
  return { run: (j, step) => context.execute(j, step), job, log, state, clicks: () => log.debugger.filter(x => x === 'Input.dispatchMouseEvent:mousePressed').length };
}
const click = (extra = {}) => ({ action: 'click', locator: 'Next', ...extra });
const point = { ok: true, x: 5, y: 5 };
const notFound = { ok: false, errorType: 'element_not_found', error: 'Element not actionable or not found: Next', dispatched: false };

test('policy: retry is off by default and bounded', () => {
  assert.equal(StepPolicy.retryConfig({}).attempts, 0);
  assert.equal(StepPolicy.retryConfig({ retry: { attempts: 99 } }).attempts, 5);
  assert.equal(StepPolicy.completionTimeout({}), 30000);                         // legacy default
  assert.equal(StepPolicy.completionTimeout({ navigationTimeoutMs: 45000, completion: {} }), 45000); // legacy: navigation timeout
  assert.equal(StepPolicy.completionTimeout({ completion: { timeoutMs: 900000 } }), 900000);
});
test('policy: click after dispatch is never retryable and becomes unverified', () => {
  const c = StepPolicy.classify(new Error('Completion condition timed out'), click(), true);
  assert.deepEqual([c.retryable, c.unverified, c.type], [false, true, 'completion_timeout']);
  const before = StepPolicy.classify(new Error('Element not actionable or not found: x'), click(), false);
  assert.deepEqual([before.retryable, before.unverified], [true, false]);
  const unknown = StepPolicy.classify(new Error('Page did not respond'), { action: 'upload' }, null);
  assert.deepEqual([unknown.retryable, unknown.unverified, unknown.dispatched], [false, true, null]);
  assert.equal(StepPolicy.classify(new Error('boom'), { action: 'type', text: 'a' }, true).retryable, true);
  assert.equal(StepPolicy.classify(new Error('boom'), { action: 'type', text: 'a', clear: false }, true).retryable, false);
});

test('a button that appears late is clicked once after retry; attempts reported', async () => {
  let calls = 0;
  const h = load({ page: m => m.type === 'clickPoint' ? (++calls < 3 ? notFound : point) : { ok: true } });
  const out = await h.run(h.job(), click({ retry: { attempts: 2, delayMs: 0 } }));
  assert.equal(out.attempts, 3); assert.equal(h.clicks(), 1);
});
test('without retry config a missing element fails once (legacy behaviour)', async () => {
  const h = load({ page: m => m.type === 'clickPoint' ? notFound : { ok: true } });
  await assert.rejects(h.run(h.job(), click()), e => e.details.type === 'element_not_found' && e.details.attempts === 1 && !e.details.unverified);
  assert.equal(h.clicks(), 0);
});
test('completion waits by state, beyond the old fixed timeout, and reports confirmation + stage', async () => {
  const t0 = Date.now();
  const h = load({ page: m => m.type === 'clickPoint' ? point : m.type === 'conditionStatus' ? { ok: true, satisfied: Date.now() - t0 > 700 } : { ok: true } });
  const out = await h.run(h.job(), click({ completion: { locator: 'Done', state: 'visible', timeoutMs: 5000, stage: 'published' } }));
  assert.deepEqual([out.confirmed, out.stage], [true, 'published']);
});
test('click then unmet completion: unverified, and NO second click even with retry configured', async () => {
  const h = load({ page: m => m.type === 'clickPoint' ? point : m.type === 'conditionStatus' ? { ok: true, satisfied: false, reason: 'chưa thấy phần tử' } : { ok: true } });
  await assert.rejects(h.run(h.job(), click({ retry: { attempts: 3, delayMs: 0 }, completion: { locator: 'Done', timeoutMs: 1000 } })),
    e => { assert.equal(e.details.unverified, true); assert.equal(e.details.type, 'completion_timeout'); assert.match(e.message, /chưa thấy phần tử/); return true; });
  assert.equal(h.clicks(), 1);
});
test('retry checks the success condition first and accepts it instead of repeating', async () => {
  let executes = 0;
  const h = load({ page: m => m.type === 'execute' ? (++executes === 1 ? { ok: false, error: 'Typing failed', dispatched: true } : { ok: true })
    : m.type === 'conditionStatus' ? { ok: true, satisfied: true } : { ok: true } });
  const out = await h.run(h.job(), { action: 'type', locator: 'Title', text: 'hi', retry: { attempts: 2, delayMs: 0 }, completion: { locator: 'Title ok' } });
  assert.deepEqual([out.attempts, out.confirmed, executes], [1, true, 1]);
});
test('upload without completion reports only file_selected', async () => {
  const h = load({ page: () => ({ ok: true }) });
  const out = await h.run(h.job(), { action: 'upload', locator: 'x', filePath: 'C:\\v\\a.mp4' });
  assert.deepEqual([out.confirmed, out.stage], [false, 'file_selected']);
});
test('upload dispatched then page silent: unverified, not retried', async () => {
  let executes = 0;
  const h = load({ page: m => { if (m.type === 'execute') { executes++; return { ok: false, error: 'File was not selected by the page', dispatched: true }; } return { ok: true }; } });
  await assert.rejects(h.run(h.job(), { action: 'upload', locator: 'x', filePath: 'C:\\v\\a.mp4', retry: { attempts: 3, delayMs: 0 } }), e => e.details.unverified === true);
  assert.equal(executes, 1);
});
test('Stop during a long completion wait cancels promptly and stops probing the page', async () => {
  const h = load({ page: m => m.type === 'clickPoint' ? point : m.type === 'conditionStatus' ? { ok: true, satisfied: false } : { ok: true } });
  const job = h.job();
  setTimeout(() => { h.state.running = false; }, 300);
  const started = Date.now();
  await assert.rejects(h.run(job, click({ completion: { locator: 'Done', timeoutMs: 600000 } })), e => e.details.type === 'stopped');
  assert.ok(Date.now() - started < 3000, 'cancelled quickly');
  const probes = h.log.messages.filter(x => x === 'conditionStatus').length;
  await new Promise(r => setTimeout(r, 500));
  assert.equal(h.log.messages.filter(x => x === 'conditionStatus').length, probes, 'no page activity after stop');
});
test('Stop during retry delay prevents the retry', async () => {
  let located = 0;
  const h = load({ page: m => m.type === 'clickPoint' ? (located++, notFound) : { ok: true } });
  const job = h.job();
  setTimeout(() => { h.state.running = false; }, 200);
  await assert.rejects(h.run(job, click({ retry: { attempts: 3, delayMs: 350 } })), e => e.details.type === 'stopped');
  assert.equal(located, 1);
});
test('agent budget is enforced by the extension: step_timeout, click after dispatch = unverified', async () => {
  const h = load({ page: m => m.type === 'clickPoint' ? point : m.type === 'conditionStatus' ? { ok: true, satisfied: false } : { ok: true } });
  const job = h.job({ budgetMs: 15000, deadline: Date.now() + 800 });
  await assert.rejects(h.run(job, click({ completion: { locator: 'Done', timeoutMs: 600000 } })), e => e.details.type === 'step_timeout' && e.details.unverified === true);
});
test('a brief agent outage does not fail the step', async () => {
  const t0 = Date.now();
  const h = load({ page: m => m.type === 'clickPoint' ? point : m.type === 'conditionStatus' ? { ok: true, satisfied: Date.now() - t0 > 1500 } : { ok: true } });
  h.state.failState = true; setTimeout(() => { h.state.failState = false; }, 700);
  const out = await h.run(h.job(), click({ completion: { locator: 'Done', timeoutMs: 8000 } }));
  assert.equal(out.confirmed, true);
});
test('closeTab/openUrl are never retried', () => {
  for (const action of ['openUrl', 'closeTab', 'scroll']) assert.equal(StepPolicy.classify(new Error('x'), { action }, false).retryable, false);
});
