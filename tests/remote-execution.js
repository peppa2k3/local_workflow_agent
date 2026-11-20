const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { fixture } = require('./helpers/remote');
const { createCommandApi } = require('../control-server/src/commands');
const { createRemoteClient } = require('../local-workflow-agent/src/integrations/remote/remote-client');
const { createRemoteExecutor } = require('../local-workflow-agent/src/integrations/remote/remote-executor');
const { createWorkflows } = require('../local-workflow-agent/src/workflow/workflows');
const { createScenarioStore } = require('../local-workflow-agent/src/workflow/scenario-store');
const c = require('../control-server/shared/remote-protocol');
const { overrideVariables } = require('../local-workflow-agent/src/workflow/variables');
(async () => {
  const f = await fixture(createCommandApi), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-execution-'));
  const runs = new Map(); let started = 0, stopped = 0, downloadChoice;
  const profiles = () => [{ directory: 'Default', name: 'Fixture' }];
  const clip = 'Clip tiếng Việt.mp4';
  fs.writeFileSync(path.join(dir, clip), 'fixture');
  fs.writeFileSync(path.join(dir, 'partial.mp4.part'), 'fixture');
  fs.writeFileSync(path.join(dir, 'empty.mp4'), '');
  const library = { variables: { source: 'https://example.test/video', storage: dir }, steps: [
    { action: 'downloadVideo', url: '{{ source }}', directory: '{{storage}}' },
    { action: 'upload', selector: '#upload', filePath: '{{download_file_path}}' }
  ] };
  const realScenarios = createScenarioStore(dir);
  const scenarios = { list: () => ['sample', 'library'], load: name => name === 'library' ? structuredClone(library) :
    { variables: { caption: 'PRIVATE DEFAULT' }, steps: [{ action: 'wait', ms: 50 }] } };
  const workflows = {
    status: () => ({ running: false, extensionConnected: true }),
    start(profile, scenario, upload, name, variables, timeout, id) { started++; assert.equal(upload, '');
      if (name === 'library') {
        const prepared = realScenarios.prepare(overrideVariables(scenario, variables));
        assert.equal(prepared.steps[0].url, 'clip:' + clip);
        assert.equal(realScenarios.prepareStep(prepared.steps[1]).filePath, fs.realpathSync(path.join(dir, clip)));
      }
      const run = { runId: id, state: 'running', index: 0, total: 1, steps: [{ number: 1, state: 'running', action: 'wait', label: 'Bước 1' }], startedAt: Date.now(), endedAt: null };
      runs.set(id, run); return run; },
    getRun: id => runs.get(id), stopRun(id) { stopped++; const r = runs.get(id); if (r) { r.state = 'cancelled'; r.endedAt = Date.now(); } return r; },
    resolveConfirmation(profile, runId, id, proceed, source) {
      const run = runs.get(runId);
      assert.equal(run.confirmation.id, id);
      downloadChoice = { profile, runId, id, proceed, source };
      delete run.confirmation;
    }
  };
  const policy = { profiles: ['Default'], scenarios: ['sample', 'library'], variables: { sample: ['caption'], library: ['source', 'storage'] }, clipScenarios: ['library'] };
  const client = createRemoteClient({ dataDir: dir, profiles, scenarios, workflows, allowHttp: true });
  try {
    const api = f.browser(), other = f.browser();
    await api('/api/login', { email: 'alice@example.test', password: 'long-password-alice' });
    await other('/api/login', { email: 'bob@example.test', password: 'long-password-bob' });
    await client.action('policy', policy);
    await client.action('pair-start', { url: f.origin, name: 'Fixture PC' });
    await api('/api/pair-claim', { code: client.status().pending.code }); await client.tick();
    await client.action('pair-approve', { claim: client.status().pending.claim }); await client.tick();
    const deviceId = client.status().device.id;
    const devices = await api('/api/devices'); assert.equal(devices.devices[0].online, true);
    assert(!JSON.stringify(devices).includes('PRIVATE DEFAULT'));
    const targets = devices.devices[0].metadata.scenarios.find(s => s.name === 'library').clipTargets;
    assert.deepEqual(targets.map(t => [t.index, t.action, t.variable]), [[0, 'downloadVideo', 'source'], [1, 'upload', undefined]]);
    assert(!JSON.stringify(devices).includes(clip));
    assert(!targets.some(t => Object.hasOwn(t, 'directory')));
    const browse = { deviceId, requestId: randomUUID(), type: 'browseClips', scenario: 'library', target: targets[0].id, query: '' };
    await other('/api/commands', browse, 404);
    await api('/api/commands', { ...browse, scenario: 'sample' }, 403);
    await api('/api/commands', { ...browse, target: 'a'.repeat(64) }, 403);
    await api('/api/commands', browse);
    await client.tick(); await client.tick();
    assert.deepEqual((await api(`/api/commands?device=${deviceId}&request=${browse.requestId}`)).commands[0].result.clips, { names: [clip], more: false });
    assert.deepEqual((await api(`/api/commands?device=${deviceId}`)).commands, []);
    const command = { deviceId, requestId: randomUUID(), type: 'run', profile: 'Default', scenario: 'sample', variables: { caption: 'hello' } };
    await other('/api/commands', command, 404);
    await api('/api/commands', { ...command, variables: { filePath: 'C:/secret' } }, 403);
    await api('/api/commands', { ...command, profile: 'Profile 99' }, 403);
    const first = await api('/api/commands', command); assert.equal(first.command.state, 'queued');
    assert.equal((await api('/api/commands', command)).duplicate, true);
    await api('/api/commands', { ...command, scenario: 'different' }, 409);
    await client.tick(); assert.equal(started, 1);
    const replay = createRemoteExecutor({ dataDir: dir, workflows, scenarios, getPolicy: () => policy });
    replay.execute(first.command, deviceId); assert.equal(started, 1, 'Durable journal blocks a duplicate accepted delivery');
    // Simulate receipt loss: VPS retries exact command ID.
    const queued = f.store.get('command', command.requestId); queued.deliveryUntil = 0; f.store.put('command', queued, f.alice.id);
    await client.tick(); assert.equal(started, 1);
    let commands = await api(`/api/commands?device=${deviceId}`); assert.equal(commands.commands[0].state, 'running');
    const run = runs.get(command.requestId), confirmationId = randomUUID();
    run.confirmation = { kind: 'download', id: confirmationId, step: 1, name: clip, filePath: path.join(dir, clip), expiresAt: Date.now() + 30000 };
    await client.tick();
    const pending = (await api(`/api/commands?device=${deviceId}`)).commands[0].result.confirmation;
    assert.equal(pending.name, clip);
    assert.equal(pending.filePath, path.join(dir, clip));
    const decision = { deviceId, runId: command.requestId, id: confirmationId, proceed: false };
    await other('/api/download-confirmation', decision, 404);
    await api('/api/download-confirmation', { ...decision, id: randomUUID() }, 409);
    await api('/api/download-confirmation', decision);
    await api('/api/download-confirmation', decision);
    await api('/api/download-confirmation', { ...decision, proceed: true }, 409);
    await client.tick(); await client.tick();
    assert.deepEqual(downloadChoice, { profile: 'Default', runId: command.requestId, id: confirmationId, proceed: false, source: 'remote' });
    const reported = (await api(`/api/commands?device=${deviceId}`)).commands[0];
    assert.equal(reported.result.confirmation, undefined);
    assert.equal(reported.downloadDecision, undefined);
    await api('/api/download-confirmation', decision, 409);
    run.confirmation = { ...pending, kind: 'download', id: randomUUID(), expiresAt: Date.now() - 1 };
    await client.tick();
    await api('/api/download-confirmation', { ...decision, id: run.confirmation.id }, 409);
    await api('/api/commands', { deviceId, requestId: randomUUID(), type: 'stop', runId: randomUUID() }, 404);
    await api('/api/commands', { deviceId, requestId: randomUUID(), type: 'stop', runId: command.requestId });
    await client.tick(); await client.tick(); assert.equal(stopped, 1);
    commands = await api(`/api/commands?device=${deviceId}`);
    assert.equal(commands.commands.find(v => v.id === command.requestId).state, 'cancelled');
    const second = { ...command, requestId: randomUUID(), scenario: 'library', variables: { source: 'clip:' + clip }, clips: { [targets[1].id]: clip } };
    await api('/api/commands', { ...second, clips: { [targets[1].id]: '../' + clip } }, 400);
    const withChangedFolder = { ...second, requestId: randomUUID(), variables: { ...second.variables, storage: path.dirname(dir) } };
    await api('/api/commands', withChangedFolder); await client.tick(); await client.tick();
    const rejected = (await api(`/api/commands?device=${deviceId}&request=${withChangedFolder.requestId}`)).commands[0];
    assert.equal(rejected.state, 'rejected');
    await api('/api/commands', second); await client.tick(); assert.equal(started, 2);
    assert.equal(runs.get(second.requestId).state, 'running');
    const config = c.readJson(path.join(dir, 'remote.json'));
    await assert.rejects(c.post(f.origin, '/device/exchange', { id: deviceId, instanceId: randomUUID(), metadata: {}, reports: [] }, config.token, { allowHttp: true }), /instance/);
    await api('/api/device-revoke', { id: deviceId }); await client.tick();
    assert.equal(client.status().configured, false); assert.equal(runs.get(second.requestId).state, 'cancelled');
    // A crash after journal acceptance must not run the same command again.
    const crashDir = path.join(dir, 'crash'), crashId = randomUUID();
    c.atomicJson(path.join(crashDir, 'remote-journal.json'), { [crashId]: { id: crashId, deviceId, type: 'run', phase: 'starting', payload: {}, result: null, seq: 0, ack: 0 } });
    const recovery = createRemoteExecutor({ dataDir: crashDir, workflows, scenarios, getPolicy: () => policy });
    assert.equal(recovery.reports(deviceId)[0].result.state, 'unknown');
    recovery.execute({ ...first.command, id: crashId }, deviceId); assert.equal(started, 2);
    // Expiry, cancellation before delivery and late receipts without wall-clock sleeps.
    const protocol = createCommandApi(f.store), another = { id: randomUUID(), owner: f.alice.id, lastSeen: Date.now(), revoked: false,
      metadata: { profiles: [{ directory: 'Default' }], scenarios: [{ name: 'sample', variables: [], steps: 1 }] } };
    f.store.put('device', another, f.alice.id);
    const account = data => protocol.account('/api/commands', 'POST', f.alice, data, new URL(f.origin));
    const input = { deviceId: another.id, requestId: randomUUID(), type: 'run', scenario: 'sample', profile: 'Default' };
    const queuedForCancel = account(input).command;
    assert.equal(account({ deviceId: another.id, requestId: randomUUID(), type: 'stop', runId: queuedForCancel.id }).command.state, 'succeeded');
    assert.equal(f.store.get('command', queuedForCancel.id).state, 'cancelled');
    const expired = account({ ...input, requestId: randomUUID() }).command; expired.expires = Date.now() - 1; f.store.put('command', expired, f.alice.id);
    const instance = randomUUID(), meta = { profiles: [], scenarios: [] };
    function exchange(reports = []) { return protocol.device('/device/exchange', f.store.get('device', another.id), { instanceId: instance, metadata: meta, reports }); }
    exchange(); assert.equal(f.store.get('command', expired.id).state, 'expired');
    another.lastSeen = 0; f.store.put('device', another, f.alice.id);
    assert.throws(() => account({ ...input, requestId: randomUUID() }), /offline/);
    another.lastSeen = Date.now(); f.store.put('device', another, f.alice.id);
    const ambiguous = account({ ...input, requestId: randomUUID() }).command;
    const delivered = exchange().command; assert.equal(delivered.id, ambiguous.id);
    const deliveredRecord = f.store.get('command', ambiguous.id); deliveredRecord.expires = Date.now() - 1; f.store.put('command', deliveredRecord, f.alice.id);
    exchange(); assert.equal(f.store.get('command', ambiguous.id).state, 'unknown');
    exchange([{ id: ambiguous.id, seq: 2, result: { state: 'succeeded' } }]); assert.equal(f.store.get('command', ambiguous.id).state, 'succeeded');
    exchange([{ id: ambiguous.id, seq: 1, result: { state: 'running' } }]); assert.equal(f.store.get('command', ambiguous.id).state, 'succeeded');
    // Stable execution UUID is independent of the extension protocol runId.
    const real = createWorkflows({ scenarios: realScenarios, profiles, defaultProfile: 'Default' });
    const stableId = randomUUID(); real.start('Default', { steps: [{ action: 'wait', ms: 5 }] }, '', 'fixture', {}, 1000, stableId);
    assert.notEqual(real.status('Default').runId, stableId);
    await new Promise(r => setTimeout(r, 20)); assert.equal(real.getRun(stableId).state, 'succeeded');
    assert.throws(() => real.start('Default', { steps: [{ action: 'wait', ms: 5 }] }, '', 'fixture', {}, 1000, stableId), /already exists/);
    console.log('remote execution: allowlist, UUID dedupe, lease, run/stop, revoke and crash recovery passed');
  } finally { client.close(); await f.close(); fs.rmSync(dir, { recursive: true, force: true }); }
})().catch(e => { console.error(e); process.exitCode = 1; });
