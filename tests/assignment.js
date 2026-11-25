const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { fixture } = require('./helpers/remote');
const { createCommandApi } = require('../control-server/src/commands');
const { createStore } = require('../control-server/src/store');
const assignment = require('../control-server/src/assignment');
const { createRemoteClient } = require('../local-workflow-agent/src/integrations/remote/remote-client');
const { createScenarioStore } = require('../local-workflow-agent/src/workflow/scenario-store');
const { createWorkflows } = require('../local-workflow-agent/src/workflow/workflows');
const { evaluate, topicsFrom } = require('../local-workflow-agent/src/scanner/checks');
const { settings } = require('../local-workflow-agent/src/scanner/scanner');
const c = require('../control-server/shared/remote-protocol');

(async () => {
  const f = await fixture(createCommandApi), clients = [];
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'assign-job-'));
  const received = [], completed = [];
  let finishUpload;
  const upload = new Promise(resolve => { finishUpload = resolve; });
  try {
    const account = f.browser();
    await account('/api/login', { email: 'alice@example.test', password: 'long-password-alice' });
    const configure = enabled => account('/api/scanner/assignment', { enabled, retryHours: 2 });
    assert.equal((await account('/api/scanner/assignment')).enabled, false);
    function machine() {
      const id = randomUUID(), token = c.token(), dir = path.join(root, id);
      fs.mkdirSync(dir);
      f.store.put('device', { id, owner: f.alice.id, tokenHash: c.hash(token), name: 'Fixture', metadata: {}, lastSeen: 0 }, f.alice.id);
      const profiles = () => [{ directory: 'Default', name: 'Fixture' }];
      const scenarios = createScenarioStore(dir);
      const vars = { video_url: '', thu_muc_tai: dir, reels_url: 'https://example.test/reels', ten_phim: '', ten_file: '' };
      const template = { accepted_topics: [' NEWS '], variables: vars, steps: [
        { action: 'downloadVideo', url: '{{video_url}}', directory: '{{thu_muc_tai}}' },
        { action: 'openFolder', path: '{{ten_file}}' }
      ] };
      const names = ['low','z-high','a-high'];
      for (const name of names) scenarios.save(name, { ...template, assignment_priority: name === 'low' ? 0 : 4 });
      c.atomicJson(path.join(dir,'remote.json'), { url: f.origin, device: { id }, token,
        policy: { profiles: ['Default'], scenarios: names, variables: Object.fromEntries(names.map(n => [n, Object.keys(vars)])) } });
      const workflows = createWorkflows({ profiles, scenarios, defaultProfile: 'Default', downloadVideo: async step => {
        received.push(step);
        if (step.url.endsWith('2')) throw Error('fixture failure');
        return { verified: true, filePath: path.join(dir,'fixture.mp4'), name: 'fixture.mp4', title: 'Fixture' };
      }, openFolder: async file => { completed.push(file); await upload; } });
      const client = createRemoteClient({ dataDir: dir, profiles, scenarios, workflows, allowHttp: true,
        scanActivity: () => ({ enabled: true, scanning: false }) });
      clients.push(client);
      return client;
    }
    const a = machine(), b = machine();
    const poll = () => Promise.all([a.tick(), b.tick()]);
    await poll();
    async function submit(id, topic) {
      const checked = evaluate({ id, title: 'Fixture video', published: new Date(Date.now()-3600000).toISOString(), views: 20 },
        topicsFrom('[' + topic + ']\nfixture'), settings({ minViews: 10, minDays: 0, maxDays: 40, minDurationSeconds: 60 }),
        { duration: 60, formats: [{ language: 'vi', width: 1920, height: 1080, acodec: 'aac', vcodec: 'h264', url: 'fixture' }],
          subtitles: { vi: [{ url: 'fixture' }] } });
      assert.equal(checked.verdict, 'pass');
      return (await a.submitScanner({ ...checked.payload, submission_id: randomUUID() })).record_id;
    }
    const other = await submit('fixture0000', 'sport'), clip = await submit('fixture0001', 'news');
    await poll();
    const video = id => f.store.get('video', id);
    assert.deepEqual(video(clip).job_ids, []);
    await configure(true);
    await poll();
    const job = f.store.get('command',video(clip).assignment_job);
    assert.equal(job.payload.scenario, 'a-high');
    assert.equal(video(clip).used, false);
    assert.equal(job.payload.variables.video_url, video(clip).video_url);
    assert.equal(job.payload.variables.ten_phim, '{{download_title}}');
    assert.equal(job.payload.variables.ten_file, '{{download_file_name}}');
    assert.equal(received[0].directory, job.payload.variables.thu_muc_tai);
    assert.deepEqual(completed, ['fixture.mp4']);
    await configure(false);
    await poll();
    assert.equal(f.store.get('command',job.id).state, 'running');
    assert.equal(video(clip).used, false);
    finishUpload();
    await new Promise(resolve => setImmediate(resolve));
    await poll();
    assert.equal(video(clip).used_job, job.id);
    assert.equal(video(clip).used_device, job.deviceId);
    const original = video(clip);
    const d = f.store.get('device', job.deviceId);
    const receipt = f.store.get('command',job.id);
    const exchange = createCommandApi(f.store);
    exchange.device('/device/exchange', d, { instanceId: d.instanceId, metadata: d.metadata,
      reports: [{ id: job.id, seq: receipt.seq+1, result: receipt.result }] });
    assert.deepEqual(video(clip), original);
    const failed = await submit('fixture0002', 'news');
    await poll(); assert.deepEqual(video(failed).job_ids, []);
    await configure(true); await poll(); await poll(); await poll();
    assert.deepEqual(video(other).job_ids, []);
    assert.equal(video(failed).used, false);
    assert.equal(video(failed).job_ids.length, 1);
    assert.equal(f.store.get('command',video(failed).assignment_job).state, 'failed');

    // Reopen the same SQLite file between attempts; simulate a busy profile and
    // an offline profile independently without changing the machine clock.
    const file = path.join(root,'wait.sqlite'), now = Date.now(), owner = f.alice.id;
    let db = createStore(file);
    try {
      assignment.configure(db, owner, { enabled:true, retryHours:2 });
      d.metadata.profiles[0].running = true;
      db.put('device',d,owner);
      db.put('video',{ ...video(other), type_topic:'news' },owner);
      const attempt = time => db.transaction(() => assignment.allocate(db,owner,time,d.id));
      attempt(now);
      const deadline = now+7200000;
      assert.equal(db.get('video', other).next_attempt_at,deadline);
      db.close(); db=createStore(file);
      assert.equal(assignment.settings(db,owner).retryHours,2);
      d.metadata.profiles[0].running=false; db.put('device',d,owner);
      assert.equal(attempt(deadline-1),undefined);
      assert.equal(attempt(deadline),undefined);
      assert.equal(db.get('video',other).next_attempt_at,deadline+7200000);
      const due = deadline+7200000;
      d.lastSeen=due; d.leaseUntil=due+35000; db.put('device',d,owner);
      assignment.configure(db,owner,{enabled:false,retryHours:2});
      assert.equal(attempt(due),undefined);
      assignment.configure(db,owner,{enabled:true,retryHours:2});
      const waitingJob = attempt(due);
      assert.equal(waitingJob.payload.scenario,'a-high');
      assert.equal(attempt(due),undefined);

      const api = createCommandApi(db);
      function exchange(reports = []) {
        return api.device('/device/exchange',db.get('device',d.id),{ metadata:d.metadata, instanceId:d.instanceId, reports });
      }
      assert.equal(exchange().command.id,waitingJob.id);
      const lost = db.get('command',waitingJob.id);
      lost.deliveryUntil = 0; db.put('command',lost,owner);
      assignment.configure(db,owner,{enabled:false,retryHours:2});
      assert.equal(exchange().command,null);
      assignment.configure(db,owner,{enabled:true,retryHours:2});
      assert.equal(exchange().command.id,waitingJob.id);
      lost.expires = Date.now()-1; db.put('command',lost,owner);
      assert.equal(exchange().command,null);
      assert.equal(db.get('command',lost.id).state,'unknown');
      assert.equal(db.get('video',other).used,false);
      exchange([{id:lost.id,seq:1,result:{state:'succeeded'}}]);
      assert.equal(db.get('video',other).used_job,lost.id);
      assert.deepEqual(db.get('video',other).job_ids,[lost.id]);
      require('../control-server/src/video-library').editRecord(db,owner,{record_id:other,used:false},false);
      exchange([{id:lost.id,seq:2,result:{state:'succeeded'}}]);
      assert.equal(db.get('video',other).used,false);
    } finally { db.close(); }
    console.log('Automatic assignments: scanner → library → engine, priority, concurrency, pause, receipts, failure and durable retries passed');
  } finally {
    for (const client of clients) client.close();
    await f.close();
    fs.rmSync(root,{ recursive:true,force:true });
  }
})().catch(error => { console.error(error); process.exitCode=1; });
