const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createIdm } = require('../src/agent/idm');
const { selectQuality } = require('../src/agent/idm-policy');
const { createScenarioStore } = require('../src/agent/scenario-store');
const { createWorkflows } = require('../src/agent/workflows');
const { spawnSync } = require('node:child_process');

(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'idm-test-'));
  try {
    const options = [{ id: 0, label: 'MP4 720p' }, { id: 1, label: 'MP4 1080p video + audio' }, { id: 2, label: 'Audio only 1080p' }, { id: 3, label: 'MP4 2160p' }];
    assert.equal(selectQuality(options).id, 1);
    assert.equal(selectQuality(options, 720).id, 0);
    assert.equal(selectQuality(options.slice(0, 1)).height, 720);
    assert.equal(selectQuality([{ id: 0, label: 'Video 1920×1080' }]).height, 1080);
    assert.throws(() => selectQuality([{ label: 'MP4 480p' }]), /không có/);
    assert.throws(() => selectQuality([{ label: 'Audio only 1080p' }]), /không có/);
    let starts = 0, selected, helper, configuration;
    function fakeLaunch(command, args, spawnOptions) {
      assert.equal(command, 'powershell.exe'); assert(args.includes('-STA')); assert.equal(spawnOptions.windowsHide, true);
      const child = new EventEmitter(); helper = child;
      child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.stdin = new EventEmitter();
      child.stdout.setEncoding = child.stderr.setEncoding = () => {};
      child.kill = () => { child.killed = true; }; child.stdin.end = () => {};
      child.stdin.write = data => {
        const message = JSON.parse(data);
        if (message.marker) {
          starts++; configuration = message;
          queueMicrotask(() => child.stdout.emit('data', JSON.stringify({ event: 'qualities', options }) + '\n'));
        } else {
          selected = message.choice;
          queueMicrotask(() => {
            const filePath = path.join(temp, 'video.mp4'); fs.writeFileSync(filePath, 'local video fixture');
            const line = JSON.stringify({ event: 'complete', filePath }) + '\n';
            // Child stdout can split JSON arbitrarily, including UTF-8 labels.
            child.stdout.emit('data', line.slice(0, 10)); child.stdout.emit('data', line.slice(10));
          });
        }
      };
      return child;
    }
    const request = { marker: 'Workflow-IDM-00000000-0000-4000-8000-000000000000', directory: temp, quality: 1080 };
    const idm = createIdm({ launch: fakeLaunch, platform: 'win32' });
    const result = await idm.download(request);
    assert.equal(selected, 1); assert.equal(starts, 1); assert.equal(result.quality, 1080); assert.equal(result.filePath, path.join(temp, 'video.mp4'));
    assert.equal(configuration.directory, temp); assert.equal(idm.isBusy(), false); assert(helper.killed);
    await assert.rejects(idm.download({ ...request, filename: 'video.mp4' }), /đã tồn tại/);
    await assert.rejects(idm.download({ ...request, marker: 'wrong' }), /marker/);
    const blocked = createIdm({ launch: () => { throw new Error('must not launch'); }, platform: 'linux' });
    await assert.rejects(blocked.download(request), /Windows/);

    function hangingLaunch() {
      const child = new EventEmitter(); helper = child;
      child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.stdin = new EventEmitter();
      child.stdout.setEncoding = child.stderr.setEncoding = () => {}; child.stdin.write = child.stdin.end = () => {};
      child.kill = () => { child.killed = true; }; return child;
    }
    const failed = createIdm({ platform: 'win32', launch: () => {
      const child = hangingLaunch();
      child.stdin.write = () => queueMicrotask(() => child.stdout.emit('data', JSON.stringify({ event: 'error', message: 'Không thấy panel IDM' }) + '\n'));
      return child;
    } });
    await assert.rejects(failed.download(request), /Không thấy panel/); assert(!failed.isBusy());
    const escaped = createIdm({ platform: 'win32', launch: () => {
      const child = hangingLaunch();
      child.stdin.write = data => {
        const message = JSON.parse(data);
        queueMicrotask(() => child.stdout.emit('data', JSON.stringify(message.marker ? { event: 'qualities', options } : { event: 'complete', filePath: path.join(temp, 'nested', 'elsewhere.mp4') }) + '\n'));
      };
      return child;
    } });
    await assert.rejects(escaped.download(request), /requested directory/);
    const cancellation = createIdm({ launch: hangingLaunch, platform: 'win32' }), controller = new AbortController();
    const pending = cancellation.download(request, controller.signal);
    assert(cancellation.isBusy());
    await assert.rejects(cancellation.download(request), /kịch bản khác/);
    controller.abort(); await assert.rejects(pending, /Stopped/); assert(helper.killed); assert(!cancellation.isBusy());

    const store = createScenarioStore(temp);
    const scenario = { variables: { url: 'https://video.example/watch/1', folder: temp }, steps: [{ action: 'idmDownload', url: '{{url}}', directory: '{{folder}}', quality: '1080' }] };
    const prepared = store.prepare(scenario);
    assert.equal(prepared.steps[0].url, scenario.variables.url); assert.equal(prepared.steps[0].directory, temp); assert.equal(prepared.steps[0].downloadTimeoutMs, 1800000);
    for (const change of [{ url: 'file:///C:/test' }, { quality: 480 }, { directory: 'relative' }, { filename: '../file.mp4' }, { filename: 'CON.mp4' }, { downloadTimeoutMs: -1 }]) {
      assert.throws(() => store.prepare({ steps: [{ ...prepared.steps[0], ...change }] }));
    }
    let completeNative, nativeCalls = 0;
    const workflows = createWorkflows({ scenarios: store, defaultProfile: 'Profile 1', profiles: () => ['Profile 1', 'Profile 2'].map(directory => ({ directory })), openFolder() {}, idm: { download: async () => { nativeCalls++; return await new Promise(resolve => { completeNative = resolve; }); } } });
    const client = { profile: 'Profile 1', clientId: 'one', capabilities: ['idm-download-v1'] };
    const s = workflows.connect(client);
    workflows.connect({ profile: 'Profile 2', clientId: 'two', capabilities: ['idm-download-v1'] });
    workflows.start('Profile 1', scenario);
    assert.throws(() => workflows.start('Profile 2', scenario), /một kịch bản IDM/);
    const step = workflows.next(s);
    const payload = { runId: step.runId, id: 0, marker: request.marker };
    assert.throws(() => workflows.idmJob(s, { ...payload, runId: 'stale' }, true), /Stale/);
    workflows.idmJob(s, payload, true); workflows.idmJob(s, payload, true);
    assert.equal(nativeCalls, 1, 'a retried start must never launch duplicate native downloads');
    completeNative(result); await new Promise(resolve => setImmediate(resolve));
    assert.equal(workflows.idmJob(s, payload).state, 'complete');
    workflows.result(s, { runId: step.runId, id: 0, ok: true, tabId: 45 });
    assert.equal(workflows.status('Profile 1').download.filePath, result.filePath);
    assert.equal(s.running, false);
    workflows.start('Profile 1', scenario);
    const unsafe = workflows.next(s);
    workflows.result(s, { runId: unsafe.runId, id: 0, ok: true });
    assert.match(s.error, /chưa xác nhận/);
    if (process.platform === 'win32') {
      const compiled = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, '../src/agent/idm-ui.ps1'), '-ValidateOnly'], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
      assert.equal(compiled.status, 0, compiled.stderr);
      assert.equal(JSON.parse(compiled.stdout.trim()).event, 'validated', 'compile native adapter without inspecting or touching live windows');
      assert.equal(JSON.parse(compiled.stdout.trim()).panelLabel, 'Tải video này', 'Windows PowerShell must read Vietnamese UI selectors as UTF-8');
    }
    console.log('IDM quality policy, validation, helper protocol, cancellation, profile isolation and idempotent completion: OK');
  } finally {
    if (path.dirname(path.resolve(temp)) !== path.resolve(os.tmpdir())) throw new Error('Unexpected IDM fixture path');
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
