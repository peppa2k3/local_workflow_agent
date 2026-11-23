const { randomUUID } = require('node:crypto');
const c = require('../shared/remote-protocol');
const requiredChecks = ['id','keyword','views','age','duration','audio','resolution','subtitles'];

function canonicalVideo(raw) {
  let url;
  try { url = new URL(raw); } catch { c.fail('Invalid video URL'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) c.fail('Invalid video URL');
  let id;
  if (url.hostname === 'youtu.be') id = url.pathname.slice(1);
  if (['youtube.com','www.youtube.com','m.youtube.com'].includes(url.hostname)) {
    id = url.pathname === '/watch' ? url.searchParams.get('v') : /^\/(?:shorts|embed)\/([\w-]{11})$/.exec(url.pathname)?.[1];
  }
  if (typeof id !== 'string' || !/^[\w-]{11}$/.test(id)) c.fail('Invalid YouTube ID');
  return id;
}
function validate(data) {
  const id = canonicalVideo(data.video_url);
  if (data.platform !== 'youtube' || data.video_id !== id) c.fail('Video ID mismatch');
  if (!Number.isSafeInteger(data.view_count) || data.view_count < 0 || !Number.isFinite(data.duration_seconds) ||
      data.duration_seconds <= 0 || data.duration_seconds >= 14400) c.fail('Invalid video measurements');
  if (!c.object(data.resolution) || !['width','height'].every(k => Number.isSafeInteger(data.resolution[k]) && data.resolution[k] > 0)) c.fail('Invalid resolution');
  function list(value, max) {
    if (!Array.isArray(value) || value.length > max) c.fail('Invalid metadata list');
    return value.map(s => c.text(s, 256));
  }
  function date(value) {
    if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) c.fail('Invalid measurement date');
    return new Date(value).toISOString();
  }
  if (!c.object(data.checks) || Object.keys(data.checks).length > 64 || !requiredChecks.every(k => Object.hasOwn(data.checks,k))) c.fail('Missing mandatory checks');
  const checks = Object.fromEntries(Object.entries(data.checks).sort(([a],[b]) => a.localeCompare(b)).map(([key,v]) => {
    if (!/^[a-zA-Z][\w-]{0,63}$/.test(key) || !c.object(v) || v.status !== 'pass') c.fail('Failed or incomplete check');
    return [key,{status:'pass',reason:c.text(v.reason,32000)}];
  }));
  const subtitle_languages = list(data.subtitle_languages,512);
  if (!subtitle_languages.length || typeof data.type_topic !== 'string' || !/^[a-z0-9_-]{1,64}$/.test(data.type_topic)) c.fail('Invalid topic or subtitles');
  const record = { submission_id:c.uuid(data.submission_id), platform:'youtube', video_id:id, video_url:'https://www.youtube.com/watch?v='+id,
    title:c.text(data.title,1024), type_topic:data.type_topic, matched_phrases:list(data.matched_phrases || [],512),
    view_count:data.view_count, published_at:date(data.published_at), measured_at:date(data.measured_at), duration_seconds:data.duration_seconds,
    resolution:{width:data.resolution.width,height:data.resolution.height}, subtitle_languages, checks };
  if (record.published_at > record.measured_at) c.fail('Publication after measurement');
  if (data.content_hash !== undefined) {
    const h = data.content_hash;
    if (!c.object(h) || h.algorithm !== 'sha256' || h.verified !== true || typeof h.value !== 'string' || !/^[a-f0-9]{64}$/i.test(h.value)) c.fail('Expected verified SHA-256 of media bytes');
    record.content_hash = {algorithm:'sha256',verified:true,value:h.value.toLowerCase()};
  }
  return record;
}
function receive(store, device, data) {
  const clip = validate(data), owner = device.owner;
  const key = (...parts) => JSON.stringify([owner,...parts]);
  const receiptId = key(device.id,clip.submission_id), fingerprint = c.hash(JSON.stringify(clip));
  return store.transaction(() => {
    const prior = store.get('videoReceipt',receiptId);
    if (prior) {
      if (prior.fingerprint !== fingerprint) c.fail('Submission ID reused with different metadata',409);
      return { ...prior.reply, status:prior.reply.status === 'accepted' ? 'replayed' : prior.reply.status };
    }
    const videoKey = key('youtube',clip.video_id), hashKey = clip.content_hash && key('sha256',clip.content_hash.value);
    const byId = store.get('videoIdentity',videoKey), byHash = hashKey && store.get('videoIdentity',hashKey);
    if (byId && byHash && byId.record_id !== byHash.record_id) c.fail('Conflicting video identities',409);
    const existing = byId || byHash;
    const record_id = existing?.record_id || randomUUID();
    const reply = { status:existing ? 'duplicate' : 'accepted', record_id, reason:byId ? 'same_video_id' : byHash ? 'same_sha256' : 'new_video' };
    if (!existing) {
      const titleKey = key('title',clip.title.normalize('NFKC').toLocaleLowerCase('vi').replace(/\s+/g,' ').trim());
      const same = store.get('videoTitle',titleKey);
      if (same) {
        const first = store.get('video',same.record_id);
        if (!first.similar_title) store.put('video',{...first,similar_title:true},owner);
      } else store.put('videoTitle',{id:titleKey,record_id},owner);
      store.put('video',{...clip,id:record_id,owner,source_device_id:device.id,source_name:device.name,received_at:new Date().toISOString(),
        similar_title:Boolean(same),used:false,job_ids:[]},owner);
    }
    store.put('videoIdentity',{id:videoKey,record_id},owner);
    if (hashKey) store.put('videoIdentity',{id:hashKey,record_id},owner);
    store.put('videoReceipt',{id:receiptId,fingerprint,reply},owner);
    return reply;
  });
}
function linkRun(store, command) {
  const url = command.payload.variables?.video_url;
  if (command.type !== 'run' || typeof url !== 'string') return;
  let videoId;
  try { videoId = canonicalVideo(url); } catch { return; }
  const identity = store.get('videoIdentity', JSON.stringify([command.owner, 'youtube', videoId]));
  if (!identity) return;
  const record = store.get('video', identity.record_id);
  record.job_ids.push(command.id);
  store.put('video', record, command.owner);
}
function variables(record, target) {
  if (!target) c.fail('Scenario lacks download directory or Reels destination',409);
  return { variables: { video_url:record.video_url,thu_muc_tai:target.thu_muc_tai,reels_url:target.reels_url,
    ten_phim:'{{download_title}}',ten_file:'{{download_file_name}}' } };
}
module.exports = { receive, variables, linkRun };
