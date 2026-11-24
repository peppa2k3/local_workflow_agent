const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { topicsFrom, youtubeId, evaluate } = require('./checks');
const media = require('./media');
const defaults = { minutes: 30, requestsPerDay: 80, minViews: null, minDays: null, maxDays: null, minResolution: 720,
  subtitleLanguages: ['vi'], subtitleKinds: ['subtitles', 'automatic_captions'] };
const sample = '[gia-dinh]\ngia đình\nbé con\nđược giúp đỡ\n\n[xuyen-khong]\nxuyên không\n';
function settings(raw) {
  const cfg = { ...defaults, ...raw };
  for (const [key, min, max] of [['minutes',1,1440], ['requestsPerDay',1,100], ['minViews',0,Number.MAX_SAFE_INTEGER],
    ['minDays',0,36500], ['maxDays',0,36500], ['minResolution',1,8192]]) {
    if (cfg[key] === null && ['minViews','minDays','maxDays'].includes(key)) continue;
    if (!Number.isSafeInteger(cfg[key]) || cfg[key] < min || cfg[key] > max) throw Error('Giá trị không hợp lệ: ' + key);
  }
  if (cfg.minDays != null && cfg.maxDays != null && cfg.minDays > cfg.maxDays) throw Error('Khoảng tuổi không hợp lệ');
  if (!Array.isArray(cfg.subtitleKinds) || !cfg.subtitleKinds.length || !cfg.subtitleKinds.every(k => ['subtitles','automatic_captions'].includes(k)) ||
      !Array.isArray(cfg.subtitleLanguages) || !cfg.subtitleLanguages.length || !cfg.subtitleLanguages.every(l => /^[a-z]{2,3}(-[A-Za-z0-9]+)*$/.test(l))) throw Error('Cấu hình phụ đề không hợp lệ');
  return cfg;
}
function createScanner({ directory, submit, onChange = () => {}, inspect = media.inspect, request = fetch, extraChecks = {}, key = process.env.YOUTUBE_API_KEY }) {
  fs.mkdirSync(directory, { recursive: true });
  const configFile = path.join(directory, 'config.json'), keywordFile = path.join(directory, 'keywords.txt');
  for (const [file, content] of [[configFile, JSON.stringify(defaults,null,2)], [keywordFile,sample]]) {
    try { fs.writeFileSync(file, content, { flag: 'wx' }); } catch (e) { if (e.code !== 'EEXIST') throw e; }
  }
  const db = new DatabaseSync(path.join(directory, 'scanner.sqlite'));
  db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS state(k TEXT PRIMARY KEY,v TEXT); CREATE TABLE IF NOT EXISTS clips(id TEXT PRIMARY KEY,status TEXT NOT NULL,data TEXT,attempt INTEGER DEFAULT 0,due INTEGER DEFAULT 0);");
  const get = k => JSON.parse(db.prepare('SELECT v FROM state WHERE k=?').get(k)?.v || 'null');
  const set = (k,v) => db.prepare('INSERT OR REPLACE INTO state VALUES(?,?)').run(k,JSON.stringify(v));
  const config = () => settings(JSON.parse(fs.readFileSync(configFile,'utf8').replace(/^\uFEFF/,'')));
  const topics = () => topicsFrom(fs.readFileSync(keywordFile,'utf8'));
  let scanning = false, syncing = false, timer, error = '', syncError = '';
  const abort = new AbortController();
  function transaction(fn) {
    db.exec('BEGIN IMMEDIATE');
    try { const value = fn(); db.exec('COMMIT'); return value; }
    catch (e) { db.exec('ROLLBACK'); throw e; }
  }
  async function api(method, params, cfg) {
    if (!key) throw Error('Thiếu YOUTUBE_API_KEY');
    const day = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
    transaction(() => {
      const quota = get('quota');
      const used = quota?.day === day ? quota.used : 0;
      if (used >= cfg.requestsPerDay) throw Error('Đã hết ngân sách request trong ngày');
      set('quota', { day, used: used + 1 });
    });
    const url = new URL('https://www.googleapis.com/youtube/v3/' + method);
    url.search = new URLSearchParams(params);
    const r = await request(url, { headers: { 'X-Goog-Api-Key': key }, redirect: 'error', signal: AbortSignal.any([abort.signal,AbortSignal.timeout(20000)]) });
    if (!r.ok) throw Error('YouTube Data API HTTP ' + r.status);
    const result = await r.json();
    if (!Array.isArray(result.items)) throw Error('YouTube thiếu danh sách items');
    return result.items;
  }
  async function measure(id, item, groups, cfg, failure) {
    const input = { id, title: item?.snippet?.localized?.title || item?.snippet?.title, published: item?.snippet?.publishedAt,
      views: /^\d+$/.test(item?.statistics?.viewCount) ? Number(item.statistics.viewCount) : null, error: failure };
    const measured = new Date();
    const initial = evaluate(input, groups, cfg);
    if (!initial.preflight) return initial;
    try { return evaluate(input, groups, cfg, await inspect(id, abort.signal), measured, extraChecks); }
    catch { return evaluate({ ...input, error: 'yt-dlp không đọc được metadata' }, groups, cfg); }
  }
  async function audit(urls) {
    const cfg = config(), groups = topics(), ids = [...new Set(urls.map(youtubeId).filter(Boolean))];
    if (ids.length > 50) throw Error('Tối đa 50 ID mỗi lần audit.');
    let items = [], failure;
    try { if (ids.length) items = await api('videos', { hl:'vi', part:'snippet,statistics', id:ids.join(',') }, cfg); }
    catch (e) { failure = e.message; }
    const results = [];
    for (const url of urls) {
      const id = youtubeId(url);
      const item = items.find(i => i.id === id);
      if (id && !item) {
        // Auditing explicit URLs can collect independent observations even without a Data API key.
        try {
          const info = await inspect(id, abort.signal);
          const published = Number.isFinite(info.timestamp) ? new Date(info.timestamp * 1000).toISOString() : null;
          results.push({ url, source: 'yt-dlp', error: failure, ...evaluate({ id, title: info.title, views: info.view_count, published }, groups, cfg, info, new Date(), extraChecks) });
          continue;
        } catch {
          const reason = [failure, 'yt-dlp không đọc được URL'].filter(Boolean).join(' · ');
          results.push({ url, error: reason, ...await measure(id, item, groups, cfg, reason) });
          continue;
        }
      }
      results.push({ url, error: failure, ...await measure(id, item, groups, cfg, failure) });
    }
    return results;
  }
  async function scan() {
    if (scanning || !get('enabled') || abort.signal.aborted) return;
    scanning = true; onChange();
    try {
      const cfg = config(), groups = topics();
      if (!groups.length || [cfg.minViews,cfg.minDays,cfg.maxDays].includes(null)) throw Error('Thiếu nhóm từ khóa hoặc ngưỡng minViews/minDays/maxDays');
      if (!key) throw Error('Thiếu YOUTUBE_API_KEY');
      const filter = JSON.stringify([groups, cfg.minViews, cfg.minDays, cfg.maxDays, cfg.minResolution, cfg.subtitleLanguages, cfg.subtitleKinds]);
      if (filter !== get('filter')) transaction(() => {
        db.prepare("UPDATE clips SET status='candidate',due=0 WHERE status IN ('unknown','reject')").run();
        set('filter',filter);
      });
      let pending = db.prepare("SELECT id FROM clips WHERE status='candidate' OR (status='unknown' AND due<=?) ORDER BY due LIMIT 25").all(Date.now());
      if (!pending.length) {
        const queries = [...new Set(groups.flatMap(t => t.phrases))], cursor = get('cursor') || 0;
        const items = await api('search',{ part:'id', type:'video', order:'date', maxResults:'25', q:queries[cursor % queries.length] },cfg);
        transaction(() => {
          const enqueue = db.prepare("INSERT OR IGNORE INTO clips(id,status) VALUES(?,'candidate')");
          for (const item of items) {
            const id = youtubeId(item.id?.videoId);
            if (id) enqueue.run(id);
          }
          set('cursor',cursor + 1);
        });
        pending = db.prepare("SELECT id FROM clips WHERE status='candidate' LIMIT 25").all();
      }
      if (pending.length && get('enabled')) {
        const items = await api('videos',{ hl:'vi', part:'snippet,statistics', id:pending.map(p=>p.id).join(',') },cfg);
        for (const {id} of pending) {
          if (!get('enabled') || abort.signal.aborted) break;
          const result = await measure(id,items.find(i=>i.id===id),groups,cfg);
          if (abort.signal.aborted) break;
          const data = result.payload;
          if (result.verdict === 'pass') data.submission_id = randomUUID();
          // Metadata and outbox status share a single atomic SQLite row update.
          db.prepare('UPDATE clips SET data=?,status=?,due=? WHERE id=?').run(JSON.stringify(data),
            result.verdict === 'pass' ? 'pending' : result.verdict,result.verdict === 'unknown' ? Date.now() + 86400000 : 0,id);
        }
      }
      error = '';
    } catch (e) { error = e.message; }
    finally {
      let minutes = 5;
      try { minutes = config().minutes; } catch {}
      set('next',Date.now()+minutes*60000);
      scanning = false; onChange();
    }
  }
  async function flush() {
    if (syncing || abort.signal.aborted) return;
    syncing = true;
    try {
      const row = db.prepare("SELECT * FROM clips WHERE status='pending' AND due<=? ORDER BY due LIMIT 1").get(Date.now());
      if (!row) return;
      try {
        const reply = await submit(JSON.parse(row.data));
        if (!['accepted','replayed','duplicate'].includes(reply?.status)) throw Error('Control Server chưa xác nhận.');
        const duplicate = reply.status === 'duplicate';
        db.prepare('UPDATE clips SET status=?,data=?,attempt=0,due=0 WHERE id=?').run(duplicate ? 'duplicate' : 'synced',duplicate ? null : row.data,row.id);
        syncError = '';
      } catch (e) {
        syncError = e.message;
        db.prepare('UPDATE clips SET attempt=attempt+1,due=? WHERE id=?').run(Date.now()+Math.min(3600000,5000*2**Math.min(10,row.attempt)),row.id);
      }
    } finally { syncing = false; }
  }
  const rows = () => db.prepare("SELECT status,data FROM clips WHERE data IS NOT NULL ORDER BY json_extract(data,'$.measured_at') DESC, rowid DESC LIMIT 100").all().map(r=>({status:r.status,...JSON.parse(r.data)}));
  function status() {
    let cfg, groups = [], configurationError;
    try { cfg = config(); groups = topics(); } catch (e) { configurationError = e.message; }
    return { enabled: Boolean(get('enabled')), scanning, error: configurationError || error, syncError,
      quota:get('quota'), next:get('next'), directory, config:cfg || null, topics:groups, rows:rows() };
  }
  function editor() {
    let cfg;
    try { cfg = config(); } catch { cfg = { ...defaults }; }
    return { config: cfg, keywords: fs.readFileSync(keywordFile, 'utf8') };
  }
  function saveSettings(part, value) {
    let file, content;
    if (part === 'config') {
      if (!value || !Object.keys(defaults).every(k => Object.hasOwn(value, k))) throw Error('Thiếu tham số cấu hình');
      file = configFile;
      content = JSON.stringify(settings(value), null, 2) + '\n';
    } else if (part === 'keywords') {
      if (typeof value !== 'string' || !topicsFrom(value).length) throw Error('Cần ít nhất một nhóm có từ khóa');
      file = keywordFile;
      content = value;
    } else throw Error('Mục cấu hình không hợp lệ');
    const temp = file + '.' + randomUUID() + '.tmp';
    try {
      fs.writeFileSync(temp, content, { flag: 'wx' });
      fs.renameSync(temp, file);
    } finally { fs.rmSync(temp, { force: true }); }
  }
  function exportVideos() {
    return db.prepare("SELECT data FROM clips WHERE status IN ('pending','synced') ORDER BY rowid").all().map(row => JSON.parse(row.data));
  }
  return { activity: () => ({enabled:Boolean(get('enabled')), scanning}), status, editor, saveSettings, exportVideos, scan, flush, audit, toggle(enabled) {
    if (typeof enabled !== 'boolean') throw Error('enabled phải là boolean');
    set('enabled',enabled); if (enabled) set('next',0); onChange();
  }, start() {
    timer = setInterval(() => {
      if (get('enabled') && Date.now() >= (get('next') || 0)) void scan();
      void flush();
    }, 3000); timer.unref();
  }, async download(id) {
    const row = db.prepare("SELECT data FROM clips WHERE id=? AND status='synced'").get(id);
    if (!row) throw Error('Clip chưa được xác nhận đồng bộ.');
    return media.download(JSON.parse(row.data),path.join(directory,'videos'),AbortSignal.any([abort.signal,AbortSignal.timeout(1800000)]));
  }, async close() {
    clearInterval(timer); abort.abort();
    while (scanning || syncing) await new Promise(resolve=>setTimeout(resolve,25));
    db.close();
  } };
}
module.exports = { createScanner, settings };
