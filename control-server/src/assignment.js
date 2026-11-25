const { randomUUID } = require('node:crypto');
const { variables } = require('./video-library');
const c = require('../shared/remote-protocol');

const { RESERVED, PENDING_RUN, createCommand } = require('./command-record');
const variableNames = ['video_url', 'thu_muc_tai', 'reels_url', 'ten_phim', 'ten_file'];

function overrides(clip,scenario) {
  const candidates = variables(clip,scenario.libraryTarget || {}).variables;
  return {variables:Object.fromEntries(Object.entries(candidates).filter(([key,value]) =>
    value !== undefined && scenario.variables.includes(key)))};
}
function settings(store, owner) {
  return store.get('assignmentSettings', owner) || { id: owner, enabled: false, retryHours: 1 };
}

function configure(store, owner, data) {
  if (typeof data.enabled !== 'boolean' || !Number.isFinite(data.retryHours) ||
      data.retryHours < 1 / 60 || data.retryHours > 720) c.fail('Khoảng chờ phải từ 1 phút đến 720 giờ.');
  return store.put('assignmentSettings', { id: owner, enabled: data.enabled, retryHours: data.retryHours }, owner);
}

// Quotas use the account and synchronized scenario ID, independent of device or filename.
function quotaKey(owner,id) { return JSON.stringify([owner,id]); }
function quotaDay(now) { return new Date(now + 7 * 3600000).toISOString().slice(0,10); }
function setLimit(store,owner,id,limit) {
  if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(id) ||
      !(limit === null || Number.isSafeInteger(limit) && limit >= 0)) c.fail('ID hoặc hạn mức không hợp lệ.');
  const key = quotaKey(owner,id);
  const quota = store.get('scenarioQuota',key) || {id:key,scenarioId:id};
  return store.put('scenarioQuota',{...quota,limit},owner);
}
function freeProfile(device, scenario, commands, now) {
  if (device.revoked || now - device.lastSeen >= 45000 || !(device.leaseUntil > now) || !device.activity?.canAccept) return;
  const jobs = commands.filter(job => job.deviceId === device.id);
  if (jobs.filter(job => RESERVED.includes(job.state) || job.state === 'scheduled').length >= 100) return;
  const {profile: bound,browser} = scenario.assignment;
  return device.metadata.profiles.filter(p => (!bound || bound === p.directory) && !p.running &&
    (!browser || p.extensionConnected) && !device.activity.active.some(run => run.profile === p.directory) &&
    !jobs.some(job => job.type === 'run' && RESERVED.includes(job.state) && job.payload.profile === p.directory))
    .sort((a,b)=>a.directory < b.directory ? -1 : Number(a.directory > b.directory))[0];
}
function assignManual(store,owner,data,now) {
  const clip = store.get('video',c.uuid(data.record_id));
  const device = store.get('device',c.uuid(data.device_id));
  if (!clip || clip.owner !== owner || !device || device.owner !== owner) c.fail('Không tìm thấy video hoặc máy.',404);
  const scenario = device.metadata.scenarios?.find(s=>s.name === data.scenario);
  if (!scenario?.assignment || !Object.keys(overrides(clip,scenario).variables).length)
    c.fail('Máy chưa cho phép giao kịch bản với biến phù hợp.',409);
  if (clip.used || clip.job_ids.some(id=>PENDING_RUN.has(store.get('command',id)?.state)))
    c.fail('Video đã dùng hoặc đang có job.',409);
  const profile = freeProfile(device,scenario,store.list('command',owner),now);
  if (!profile) c.fail('Máy đang offline, bận hoặc profile chưa sẵn sàng.',409);
  const payload = {profile:profile.directory,scenario:scenario.name,...overrides(clip,scenario)};
  const job = createCommand(randomUUID(),owner,device.id,'run',payload,now);
  job.videoRecord = clip.id;
  job.scenarioId = scenario.assignment.id ?? scenario.name;
  store.put('command',job,owner);
  clip.job_ids.push(job.id);
  store.put('video',clip,owner);
  return {id:job.id};
}

// Caller owns a BEGIN IMMEDIATE transaction. Only the polling device can take a
// job, so eligibility is checked against its current heartbeat at handoff.
function allocate(store, owner, now, pollingDevice) {
  const rule = settings(store, owner);
  if (!rule.enabled) return;
  const devices = store.list('device', owner).filter(d => !d.revoked);
  const commands = new Map(store.list('command', owner).map(job => [job.id, job]));
  const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
  const routes = devices.flatMap(device => (device.metadata?.scenarios || [])
    .filter(s => s.assignment && variableNames.some(key => s.variables.includes(key) && (s.libraryTarget?.[key] || !['thu_muc_tai','reels_url'].includes(key))))
    .map(scenario => ({ device, scenario })))
    .sort((a, b) => b.scenario.assignment.priority - a.scenario.assignment.priority ||
      compare(a.scenario.name, b.scenario.name) || compare(a.device.id, b.device.id));
  if (!routes.length) return;
  const day = quotaDay(now);
  const jobs = [...commands.values()];
  const quotas = new Map(store.list('scenarioQuota',owner).map(q=>[q.scenarioId,q]));
  for (const clip of store.list('video', owner)) {
    if (clip.used || clip.assignment_job || clip.next_attempt_at > now) continue;
    const linked = clip.job_ids.map(id => commands.get(id)).filter(Boolean);
    const success = linked.find(job => job.state === 'succeeded' && !clip.ignored_successes?.includes(job.id));
    if (success) {
      // Older library entries linked manual runs before commands carried a videoRecord.
      recordResult(store, { ...success, videoRecord: clip.id }, success.updated || success.created);
      continue;
    }
    if (linked.some(job => PENDING_RUN.has(job.state))) continue;
    const matches = routes.filter(r => r.scenario.assignment.topics.includes(clip.type_topic));
    if (!matches.length) continue;
    let available = false;
    let hasCapacity = false;
    for (const { device, scenario } of matches) {
      const scenarioId = scenario.assignment.id ?? scenario.name;
      const quota = quotas.get(scenarioId);
      const count = quota?.day === day ? quota.count : 0;
      if (quota?.limit != null && count >= quota.limit) continue;
      hasCapacity = true;
      const profile = freeProfile(device,scenario,jobs,now);
      if (!profile) continue;
      available = true;
      if (device.id !== pollingDevice) break;
      const payload = { profile: profile.directory, scenario: scenario.name, ...overrides(clip,scenario) };
      const job = { ...createCommand(randomUUID(), owner, device.id, 'run', payload, now),
        videoRecord: clip.id, automatic: true, scenarioId, topic: clip.type_topic };
      store.put('scenarioQuota',{...quota,id:quotaKey(owner,scenarioId),scenarioId,day,count:count+1},owner);
      store.put('command', job, owner);
      clip.assignment_job = job.id;
      clip.job_ids.push(job.id);
      delete clip.next_attempt_at;
      store.put('video', clip, owner);
      return job;
    }
    if (!available && hasCapacity) {
      clip.next_attempt_at = now + Math.round(rule.retryHours * 3600000);
      store.put('video', clip, owner);
    }
  }
}

function canRedeliver(store, job, device) {
  const clip = store.get('video', job.videoRecord);
  if (!clip || clip.used || (job.automatic && clip.assignment_job !== job.id) || !device.activity?.canAccept) return false;
  const { profile, scenario, variables: vars } = job.payload;
  const s = device.metadata.scenarios.find(s => s.name === scenario);
  const p = device.metadata.profiles.find(p => p.directory === profile);
  return s?.assignment && (!job.scenarioId || job.scenarioId === (s.assignment.id ?? s.name)) &&
    (!job.automatic || s.assignment.topics.includes(clip.type_topic)) && p && !p.running &&
    (!s.assignment.profile || s.assignment.profile === profile) && (!s.assignment.browser || p.extensionConnected) &&
    !device.activity.active.some(run => run.profile === profile) && Object.keys(vars).every(key => s.variables.includes(key)) &&
    (vars.thu_muc_tai === undefined || s.libraryTarget?.thu_muc_tai === vars.thu_muc_tai) && (vars.reels_url === undefined || s.libraryTarget?.reels_url === vars.reels_url);
}

function recordResult(store, job, now) {
  if (!job.videoRecord || job.state !== 'succeeded') return;
  const clip = store.get('video', job.videoRecord);
  if (!clip || clip.used || clip.owner !== job.owner || clip.ignored_successes?.includes(job.id)) return;
  clip.used = true;
  clip.used_job = job.id;
  clip.used_device = job.deviceId;
  clip.used_at = now;
  delete clip.next_attempt_at;
  store.put('video', clip, job.owner);
}

module.exports = { setLimit, quotaDay, assignManual, settings, configure, allocate, canRedeliver, recordResult };
