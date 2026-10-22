const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createActivityStore, uuid5, URL_NAMESPACE, pythonArray, canonicalUrl } = require('../src/agent/activity-store');
const { createCachedDownloader } = require('../src/agent/download-cache');
const { createMongoSync, bsonDates } = require('../src/agent/mongo-sync');
const { casefold } = require('../src/agent/casefold');
const { createWorkflows } = require('../src/agent/workflows');
const { createScenarioStore } = require('../src/agent/scenario-store');
const tick = () => new Promise(resolve => setTimeout(resolve, 10));
async function until(test) { for (let i = 0; i < 100 && !test(); i++) await tick(); assert(test(), 'operation did not settle'); }

(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'activity-history-'));
  let sync;
  try {
    assert.equal(casefold('Straße Σςσ Ꭰꭰ'), 'strasse σσσ ᎠᎠ');
    const folder = uuid5(URL_NAMESPACE, pythonArray(['8d7956a8-cb45-457f-a7f0-094ae1a9362e', 'd:\\videos', 'automation']));
    assert.equal(folder, '874a5342-2569-50d4-83b1-68c7eee93971', 'UUID agrees with Python default JSON separators');
    assert.equal(uuid5(URL_NAMESPACE, pythonArray(['a'.repeat(64), 'ef777e44-d9b4-4dde-acf0-d57778eb71ae', '', ''])), 'f922f428-7e05-586e-a29f-a0013266a6d5');
    assert.equal(canonicalUrl('HTTPS://EXAMPLE.test:443/clip?a=1#player'), 'https://example.test/clip?a=1');
    assert.notEqual(canonicalUrl('https://example.test/clip?a=1'), canonicalUrl('https://example.test/clip?a=2'), 'preserve resource query parameters');
    const activityDir = path.join(temp, 'activity');
    let activity = createActivityStore(activityDir);
    let calls = 0;
    const rawDownload = async (step, signal) => {
      calls++; await tick(); signal?.throwIfAborted();
      const filePath = path.join(temp, `clip-${calls}.mp4`);
      fs.writeFileSync(filePath, 'verified fixture video bytes');
      return { filePath, name: path.basename(filePath), title: 'Tên phim', id: 'clip', verified: true, duration: 3 };
    };
    const source = { action: 'downloadVideo', url: 'https://example.test/clip', directory: temp };
    let download = createCachedDownloader(activity, rawDownload);
    const [a, b] = await Promise.all([download(source), download(source)]);
    assert.equal(calls, 1, 'concurrent profiles must download same URL only once');
    assert.equal(a.filePath, b.filePath); assert.equal(b.reused, true);
    const firstHash = a.asset_id;
    activity = createActivityStore(activityDir); // restart and request same URL into a different output folder
    download = createCachedDownloader(activity, rawDownload);
    const cached = await download({ ...source, url: source.url + '#player', directory: path.join(temp, 'other') });
    assert.equal(cached.filePath, a.filePath); assert.equal(calls, 1);
    fs.writeFileSync(a.filePath, 'changed fixture video bytes!');
    const replaced = await download(source);
    assert.equal(calls, 2); assert.equal(replaced.reused, false);
    assert.equal(replaced.asset_id, firstHash, 'identical downloaded bytes share asset');
    fs.unlinkSync(replaced.filePath);
    await download(source); assert.equal(calls, 3, 'missing cached file downloads again');
    let finishSlow;
    let slowCalls = 0;
    const slow = createCachedDownloader(activity, async () => {
      slowCalls++;
      await new Promise(resolve => { finishSlow = resolve; });
      return { ...cached, verified: true, filePath: activity.data.downloads[source.url].filePath };
    });
    const slowSource = { ...source, url: 'https://example.test/slow' };
    const leader = slow(slowSource);
    await until(() => Boolean(finishSlow));
    const controller = new AbortController();
    const waiting = slow(slowSource, controller.signal);
    controller.abort();
    await assert.rejects(waiting, /cancelled|abort/i);
    const follower = slow(slowSource);
    finishSlow();
    await leader; assert.equal((await follower).reused, true);
    assert.equal(slowCalls, 1, 'cancelled waiter cannot break the URL lock for later profiles');
    const brokenDownloader = createCachedDownloader(activity, async () => ({ filePath: a.filePath, verified: false }));
    await assert.rejects(brokenDownloader({ ...source, url: 'https://example.test/broken' }), /verification/);
    assert.equal(activity.data.downloads['https://example.test/broken'], undefined);

    const store = createScenarioStore(temp), pageId = randomUUID();
    const scenario = { name: 'download-upload-reels-lili', variables: { page_id: pageId, page_name: 'Lili', page_url: 'https://example.test/pages/lili' }, steps: [
      source,
      { action: 'openUrl', url: '{{page_url}}' },
      { action: 'upload', selector: '#upload', filePath: '{{download_file_path}}', pageId: '{{page_id}}', pageName: '{{page_name}}', pageUrl: '{{page_url}}', platform: 'Facebook', publicationDesc: '{{download_title}}' },
      { action: 'type', selector: '#caption', text: '{{download_title}}' },
      { action: 'click', selector: '#next' },
      { action: 'click', selector: '#missing', label: 'Bước bị lỗi' }
    ] };
    assert.throws(() => store.prepare({ steps: [{ action: 'upload', filePath: a.filePath, pageId: '6151234' }] }), /UUID/);
    const workflows = createWorkflows({ scenarios: store, defaultProfile: 'A', profiles: () => [{ directory: 'A' }], activity, downloadVideo: download });
    const session = workflows.connect({ profile: 'A', clientId: 'fixture' });
    const run = workflows.start('A', scenario);
    await until(() => !session.localPending);
    for (let index = 1; index < 6; index++) {
      const job = workflows.next(session); assert.equal(job.step.id, index);
      if (index === 2) assert.equal(job.step.filePath, activity.data.downloads[source.url].filePath);
      workflows.result(session, { runId: run.runId, id: index, ok: index !== 5, error: 'Target not found', actionUrl: 'https://example.test/composer', pageUrl: 'https://example.test/composer' });
      await until(() => !session.localPending);
    }
    const failed = workflows.getRun(run.runId);
    assert.equal(failed.state, 'failed'); assert.equal(failed.stoppedAtStep, 6);
    assert.deepEqual(failed.steps.map(step => step.state), ['succeeded', 'succeeded', 'succeeded', 'succeeded', 'succeeded', 'failed']);
    assert(failed.steps.every(step => step.started_at && step.ended_at));
    assert.equal(failed.steps[0].reused, true);
    const event = failed.steps[2].upload;
    assert.equal(event.page_id, pageId); assert.equal(event.asset_id, firstHash);
    assert.equal(event.page_url, scenario.variables.page_url); assert.equal(event.actual_url, 'https://example.test/composer');
    assert(Number.isFinite(Date.parse(event.uploaded_at)));
    const publication = activity.data.publications[event.publication_id];
    assert.equal(publication.published_at, null, 'selecting upload file does not prove publication');
    assert.equal(publication.desc, 'Tên phim');
    workflows.result(session, { runId: run.runId, id: 2, ok: true });
    assert.equal(Object.keys(activity.data.upload_events).length, 1, 'stale result cannot duplicate uploads');
    activity.recordUpload({ pageId, pageName: 'Lili', pageUrl: scenario.variables.page_url, platform: 'Facebook', publicationDesc: 'Retry cannot overwrite' },
      { asset_id: firstHash, file_instance_id: event.file_instance_id }, { runId: randomUUID(), index: 0 });
    assert.equal(activity.data.publications[event.publication_id].desc, 'Tên phim');

    const interrupted = workflows.start('A', { steps: [{ action: 'openUrl', url: 'https://example.test/' }] });
    workflows.next(session);
    const restarted = createActivityStore(activityDir);
    assert.equal(restarted.readRun(run.runId).state, 'failed');
    assert.equal(restarted.readRun(interrupted.runId).state, 'interrupted');
    assert.equal(restarted.readRun(interrupted.runId).steps[0].state, 'interrupted');
    assert.equal(restarted.readRun(interrupted.runId).stoppedAtStep, 1);
    assert.equal(restarted.listRuns('B').length, 0);
    const newWorkflows = createWorkflows({ scenarios: store, defaultProfile: 'A', profiles: () => [{ directory: 'A' }], activity: restarted });
    assert.equal(newWorkflows.getRun(run.runId).stoppedAtStep, 6);
    assert.equal(newWorkflows.stopRun(run.runId).state, 'failed');
    const newSession = newWorkflows.connect({ profile: 'A', clientId: 'fixture2' });
    const failedUpload = newWorkflows.start('A', { steps: [{ action: 'upload', selector: '#upload', filePath: activity.data.downloads[source.url].filePath }] });
    await until(() => !newSession.localPending);
    const uploadJob = newWorkflows.next(newSession);
    const eventsBefore = Object.keys(restarted.data.upload_events).length;
    newWorkflows.result(newSession, { runId: failedUpload.runId, id: uploadJob.step.id, ok: false, error: 'Upload rejected' });
    assert.equal(Object.keys(restarted.data.upload_events).length, eventsBefore, 'failed uploads do not create successful publication events');
    assert.equal(newWorkflows.getRun(failedUpload.runId).steps[0].state, 'failed');

    // Offline outbox retains writes, retries with BSON Dates and insert-only content fields.
    let offline = true;
    const writes = [];
    const client = { db: () => ({ collection: name => ({
      createIndex: async () => { if (offline) throw Object.assign(new Error('private URI'), { code: 'OFFLINE' }); },
      findOne: async () => null,
      updateOne: async (filter, update) => { writes.push({ name, filter, update }); }
    }) }), close: async () => {} };
    sync = createMongoSync(restarted, { client });
    await sync.flush();
    assert.match(restarted.syncStatus().error, /OFFLINE/);
    assert(restarted.pending().length > 0); assert(!restarted.syncStatus().error.includes('private URI'));
    offline = false; await sync.flush();
    assert.equal(restarted.pending().length, 0); assert.equal(restarted.syncStatus().error, '');
    assert(writes.find(write => write.name === 'assets').update.$setOnInsert.created_at instanceof Date);
    assert.equal(writes.find(write => write.name === 'publications').update.$setOnInsert.published_at, null);
    assert(writes.find(write => write.name === 'upload_events').update.$setOnInsert.uploaded_at instanceof Date);
    assert(writes.find(write => write.name === 'workflow_runs').update.$set.startedAt instanceof Date);
    assert(bsonDates({ imported_at: '2026-10-22T03:00:00Z' }).imported_at instanceof Date);
    console.log('Durable per-step history, restart recovery, URL/hash reuse, concurrent downloads, blueprint IDs and Mongo retry: OK');
  } finally {
    await sync?.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
