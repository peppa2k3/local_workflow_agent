const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createScenarioStore } = require('../src/agent/scenario-store');
const { createWorkflows } = require('../src/agent/workflows');
(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'download-pipeline-'));
  try {
    const store = createScenarioStore(temp);
    const clip = path.join(temp, 'Film [id].mp4');
    const source = { action: 'downloadVideo', url: 'https://example.test/video', directory: temp };
    const scenario = { variables: { ten_phim: '{{download_title}}', caption: 'Phim: {{ten_phim}}' }, steps: [
      { ...source, label: 'T\u1ea3i v\u00e0 ki\u1ec3m tra clip' },
      { action: 'openUrl', url: 'https://example.test/reels' },
      { action: 'upload', selector: '#upload', filePath: '{{download_file_path}}', label: 'Upload clip m\u1edbi' },
      { action: 'type', selector: '#caption', text: '{{caption}} / {{download_file_name}}' }
    ] };
    assert.throws(() => store.prepare({ steps: [scenario.steps[2], source] }), /earlier downloadVideo/);
    assert.throws(() => store.prepare({ variables: { download_title: 'fake' }, steps: [source] }), /Reserved/);
    assert.throws(() => store.prepare({ steps: [{ ...source, label: 4 }] }), /label/);
    let finish, rejectDownload, signal;
    const workflows = createWorkflows({ scenarios: store, defaultProfile: 'A', profiles: () => [{ directory: 'A' }, { directory: 'B' }], openFolder: async () => {}, downloadVideo: (_, suppliedSignal) => {
      signal = suppliedSignal; return new Promise((resolve, reject) => { finish = resolve; rejectDownload = reject; });
    } });
    const a = workflows.connect({ profile: 'A', clientId: 'a' });
    workflows.connect({ profile: 'B', clientId: 'b' });
    workflows.start('A', scenario, path.join(temp, 'wrong.mp4'), 'pipeline');
    assert(workflows.usesScenario('pipeline'));
    assert.equal(workflows.status('A').stepLabel, 'T\u1ea3i v\u00e0 ki\u1ec3m tra clip');
    assert.equal(workflows.next(a).step, null, 'must not open URL while download/verification is pending');
    assert.equal(workflows.status('B').download, null);
    fs.writeFileSync(clip, 'finished fixture');
    finish({ title: 'T\u00ean phim Vi\u1ec7t', id: 'id', filePath: clip, name: path.basename(clip), verified: true });
    await new Promise(resolve => setImmediate(resolve));
    let job = workflows.next(a);
    assert.equal(job.step.action, 'openUrl');
    assert.equal(workflows.status('A').stepLabel, 'B\u01b0\u1edbc 2');
    workflows.result(a, { runId: job.runId, id: job.step.id, ok: true, tabId: 10 });
    job = workflows.next(a);
    assert.equal(job.step.filePath, clip, 'legacy run override must not replace the downloaded file');
    assert.equal(job.step.label, 'Upload clip m\u1edbi');
    workflows.result(a, { runId: job.runId, id: job.step.id, ok: true });
    job = workflows.next(a);
    assert.equal(job.step.text, 'Phim: T\u00ean phim Vi\u1ec7t / Film [id].mp4');
    assert.equal(scenario.steps[2].filePath, '{{download_file_path}}');
    assert.equal(scenario.variables.ten_phim, '{{download_title}}');
    workflows.result(a, { runId: job.runId, id: job.step.id, ok: true });
    assert.equal(workflows.status('A').running, false);
    assert(!workflows.usesScenario('pipeline'));
    workflows.start('A', scenario);
    assert.equal(a.runtime.download_file_path, undefined, 'new run must not reuse old result');
    rejectDownload(new Error('FFprobe rejected final file'));
    await new Promise(resolve => setImmediate(resolve));
    assert.match(workflows.status('A').error, /FFprobe/);
    assert.equal(workflows.next(a).step, null, 'failed verification must not upload');
    workflows.start('A', scenario);
    finish({ filePath: clip, title: 'Not verified', verified: false });
    await new Promise(resolve => setImmediate(resolve));
    assert.match(workflows.status('A').error, /final-file verification/);
    assert.equal(workflows.next(a).step, null);
    workflows.start('A', scenario);
    workflows.stop('A'); assert(signal.aborted);
    finish({ title: 'Stale', filePath: clip });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(a.download, null);
    assert.equal(workflows.next(a).step, null);
    assert.throws(() => store.prepareStep(scenario.steps[2], '', {}), /unavailable/);
    assert.throws(() => store.prepareStep(scenario.steps[2], '', { download_file_path: clip + '.missing' }), /does not exist/);
    const rawTitle = '{{download_id}} literal';
    assert.equal(store.prepareStep({ action: 'type', text: '{{download_title}}' }, '', { download_title: rawTitle }).text, rawTitle, 'metadata must not be recursively interpolated');
    fs.writeFileSync(clip, '');
    assert.throws(() => store.prepareStep(scenario.steps[2], '', { download_file_path: clip }), /final and nonempty/);
    store.save('delete-me', scenario);
    store.clone('delete-me', 'keep-me');
    assert.equal(store.load('keep-me').steps[0].label, scenario.steps[0].label);
    store.remove('delete-me');
    assert(!store.list().includes('delete-me'));
    assert(store.list().includes('keep-me'));
    assert.throws(() => store.remove('../keep-me'), /Invalid/);
    assert.throws(() => store.remove('delete-me'), /ENOENT/);
    console.log('Download completion gate, runtime references, exact upload path, Stop/failure, labels and deletion: OK');
  } finally {
    if (path.dirname(temp) !== os.tmpdir()) throw new Error('Unexpected fixture path');
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
