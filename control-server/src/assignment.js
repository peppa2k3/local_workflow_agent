const { randomUUID } = require('node:crypto');
const { variables } = require('./video-library');
const c = require('../shared/remote-protocol');

const { RESERVED, PENDING_RUN, createCommand } = require('./command-record');
const variableNames = ['video_url', 'thu_muc_tai', 'reels_url', 'ten_phim', 'ten_file'];

function settings(store, owner) {
  return store.get('assignmentSettings', owner) || { id: owner, enabled: false, retryHours: 1 };
}

function configure(store, owner, data) {
  if (typeof data.enabled !== 'boolean' || !Number.isFinite(data.retryHours) ||
      data.retryHours < 1 / 60 || data.retryHours > 720) c.fail('Khoảng chờ phải từ 1 phút đến 720 giờ.');
  return store.put('assignmentSettings', { id: owner, enabled: data.enabled, retryHours: data.retryHours }, owner);
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
    .filter(s => s.assignment && s.libraryTarget && variableNames.every(key => s.variables.includes(key)))
    .map(scenario => ({ device, scenario })))
    .sort((a, b) => b.scenario.assignment.priority - a.scenario.assignment.priority ||
      compare(a.scenario.name, b.scenario.name) || compare(a.device.id, b.device.id));
  if (!routes.length) return;
  const full = new Map();
  for (const job of commands.values()) {
    if (RESERVED.includes(job.state) || job.state === 'scheduled')
      full.set(job.deviceId, (full.get(job.deviceId) || 0) + 1);
  }
  const busy = new Set([...commands.values()].filter(j => j.type === 'run' && RESERVED.includes(j.state))
    .map(j => JSON.stringify([j.deviceId, j.payload.profile])));
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
    for (const { device, scenario } of matches) {
      if (full.get(device.id) >= 100 || now - device.lastSeen >= 45000 || device.leaseUntil <= now || !device.activity?.canAccept) continue;
      const { profile: bound, browser } = scenario.assignment;
      const profile = device.metadata.profiles.filter(p => (!bound || p.directory === bound) && !p.running &&
        (!browser || p.extensionConnected) && !busy.has(JSON.stringify([device.id, p.directory])) &&
        !device.activity.active.some(run => run.profile === p.directory))
        .sort((a, b) => compare(a.directory, b.directory))[0];
      if (!profile) continue;
      available = true;
      if (device.id !== pollingDevice) break;
      const payload = { profile: profile.directory, scenario: scenario.name, ...variables(clip, scenario.libraryTarget) };
      const job = { ...createCommand(randomUUID(), owner, device.id, 'run', payload, now),
        videoRecord: clip.id, automatic: true, topic: clip.type_topic };
      store.put('command', job, owner);
      clip.assignment_job = job.id;
      clip.job_ids.push(job.id);
      delete clip.next_attempt_at;
      store.put('video', clip, owner);
      return job;
    }
    if (!available) {
      clip.next_attempt_at = now + Math.round(rule.retryHours * 3600000);
      store.put('video', clip, owner);
    }
  }
}

function canRedeliver(store, job, device) {
  const clip = store.get('video', job.videoRecord);
  if (!clip || clip.used || clip.assignment_job !== job.id || !device.activity?.canAccept) return false;
  const { profile, scenario, variables: vars } = job.payload;
  const s = device.metadata.scenarios.find(s => s.name === scenario);
  const p = device.metadata.profiles.find(p => p.directory === profile);
  return s?.assignment?.topics.includes(clip.type_topic) && p && !p.running &&
    (!s.assignment.profile || s.assignment.profile === profile) && (!s.assignment.browser || p.extensionConnected) &&
    !device.activity.active.some(run => run.profile === profile) && variableNames.every(key => s.variables.includes(key)) &&
    s.libraryTarget?.thu_muc_tai === vars.thu_muc_tai && s.libraryTarget?.reels_url === vars.reels_url;
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

module.exports = { settings, configure, allocate, canRedeliver, recordResult };
