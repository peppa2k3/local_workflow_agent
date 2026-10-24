const assert = require('node:assert/strict');
const { createMediaGuard } = require('../src/agent/media-guard');
const { createWorkflows } = require('../src/agent/workflows');
const { chromium } = require('playwright');
const path = require('node:path');
const tick = () => new Promise(resolve => setImmediate(resolve));
(async () => {
  const data = { downloads: { 'https://example.test/video': {} }, file_instances: { old: { name: 'CLIP.mp4', path: '/old/CLIP.mp4', sha256: 'old' } }, upload_events: { a: { asset_id: 'old' } }, publications: {} };
  const activity = { data, registerFile: async () => ({ asset_id: 'new' }), saveRun() {} };
  let enabled = false, unavailable = false, dbHit = false, checks = 0;
  const mongo = { status: () => ({ enabled }), request: async fn => {
    checks++; if (unavailable) throw new Error('MongoDB unavailable');
    return fn({ collection: () => ({ findOne: async () => dbHit ? { _id: 'db-record' } : null, find: () => ({ toArray: async () => [] }) }) });
  } };
  const guard = createMediaGuard({ activity, mongo });
  let prompts = 0;
  const context = { signal: new AbortController().signal, confirm: async () => { prompts++; } };
  (await guard.check({ action: 'downloadVideo', url: 'https://example.test/video#fragment' }, null, context))();
  (await guard.check({ action: 'upload', filePath: '/new/clip.mp4' }, { asset_id: 'new' }, context))();
  assert.equal(prompts, 2, 'canonical URL and case-insensitive filename duplicates');
  enabled = true; dbHit = true;
  (await guard.check({ action: 'downloadVideo', url: 'https://other.test/v' }, null, context))();
  assert.equal(prompts, 3, 'DB-only duplicate must prompt');
  (await guard.check({ action: 'upload', filePath: '/new/database-only.mp4' }, { asset_id: 'different' }, context))();
  assert.equal(prompts, 4, 'DB-only upload/publication must prompt');
  unavailable = true;
  await assert.rejects(guard.check({ action: 'downloadVideo', url: 'https://other.test/v' }, null, context), /unavailable/);
  unavailable = false; dbHit = false; enabled = false;
  const controller = new AbortController(); controller.abort();
  await assert.rejects(guard.check({ action: 'upload', filePath: '/new/a.mp4' }, { asset_id: 'new' }, { ...context, signal: controller.signal }));
  const workflows = createWorkflows({ scenarios: { prepare: x => x, prepareStep: x => x }, defaultProfile: 'Default', profiles: () => [{ directory: 'Default' }], activity, mediaGuard: guard });
  const session = workflows.connect({ profile: 'Default', clientId: 'fixture' });
  const scenario = { steps: [{ action: 'upload', filePath: '/new/clip.mp4' }] };
  workflows.start('Default', scenario); await tick();
  const run = workflows.status('Default'); assert(run.paused); assert.equal(workflows.next(session).step, null);
  assert.throws(() => workflows.resolveConfirmation('Default', run.executionId, 'stale', true));
  workflows.resolveConfirmation('Default', run.executionId, run.confirmation.id, true); await tick();
  assert.equal(workflows.next(session).step.action, 'upload');
  workflows.result(session, { runId: session.runId, id: 0, ok: false, error: 'fixture failure' });
  workflows.start('Default', scenario); await tick();
  const cancel = workflows.status('Default'); workflows.resolveConfirmation('Default', cancel.executionId, cancel.confirmation.id, false); await tick();
  assert.equal(workflows.status('Default').state, 'cancelled'); assert.equal(workflows.next(session).step, null);
  // A second local media operation must wait for the first to finish recording.
  const release = await guard.check({ action: 'downloadVideo', url: 'https://fresh.test/v' }, null, context);
  let acquired = false;
  const second = guard.check({ action: 'downloadVideo', url: 'https://fresh.test/v' }, null, context).then(done => { acquired = true; done(); });
  await tick(); assert.equal(acquired, false); release(); await second;
  const held = await guard.check({ action: 'downloadVideo', url: 'https://fresh.test/v' }, null, context);
  const waiting = new AbortController();
  const cancelled = guard.check({ action: 'downloadVideo', url: 'https://fresh.test/v' }, null, { ...context, signal: waiting.signal });
  waiting.abort(); await assert.rejects(cancelled, /hủy/); held();
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage(); let body;
    await page.route('https://popup.test/**', async route => {
      if (new URL(route.request().url()).pathname === '/api/confirm') { body = route.request().postDataJSON(); return route.fulfill({ json: { ok: true } }); }
      return route.fulfill({ json: {} });
    });
    await page.goto('https://popup.test/');
    await page.setContent('<meta name="local-agent-session" content="fixture"><body></body>');
    await page.addScriptTag({ path: path.resolve(__dirname, '../dashboard/issues.js') });
    await page.route('https://popup.test/api/profiles', route => route.fulfill({ json: { profiles: [{ ...run, confirmation: { ...run.confirmation, message: '<img src=x> duplicate' } }] } }));
    await page.evaluate(() => fetch('/api/profiles'));
    await page.getByRole('dialog').waitFor(); assert.equal(await page.locator('dialog img').count(), 0);
    await page.getByRole('button', { name: 'Xác nhận tiếp tục' }).click();
    assert.equal(body.id, run.confirmation.id); assert.equal(body.proceed, true);
    await page.route('https://popup.test/api/failure', route => route.fulfill({ status: 503, json: { error: 'Database fixture error' } }));
    await page.evaluate(() => fetch('/api/failure'));
    await page.getByRole('button', { name: 'Đã hiểu' }).waitFor();
    assert.match(await page.getByRole('dialog').textContent(), /Database fixture error/);
  } finally { await browser.close(); }
  assert(checks >= 2);
  console.log('Media duplicate guards: local/DB URL and filename, fail-closed, pause/approve/stop, stale decisions, serialization and safe popup passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
