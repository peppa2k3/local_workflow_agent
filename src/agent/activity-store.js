const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { casefold } = require('./casefold');

const URL_NAMESPACE = '6ba7b811-9dad-11d1-80b4-00c04fd430c8';
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function uuid5(namespace, text) {
  const bytes = createHash('sha1').update(Buffer.from(namespace.replaceAll('-', ''), 'hex')).update(text, 'utf8').digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 80; bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
// Python json.dumps(..., ensure_ascii=False) default separators, for blueprint UUIDs.
const pythonArray = values => '[' + values.map(value => JSON.stringify(value)).join(', ') + ']';
function canonicalUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Expected HTTP/HTTPS URL without credentials');
  url.hash = ''; return url.href;
}
function atomicJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = file + '.tmp';
  const fd = fs.openSync(temp, 'w');
  try { fs.writeFileSync(fd, JSON.stringify(data, null, 2) + '\n'); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
  fs.renameSync(temp, file);
}
async function fileHash(file, signal) {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(file, { signal })) hash.update(chunk);
  return hash.digest('hex');
}
function validateUploadMetadata(step) {
  for (const key of ['pageId', 'pageName', 'pageUrl', 'platform', 'publicationDesc', 'folderTag']) {
    if (step[key] !== undefined && typeof step[key] !== 'string') throw new Error(`${key} must be text`);
  }
  if (step.pageId && !uuidPattern.test(step.pageId)) throw new Error('pageId must be the UUID from Team Content Manager (not the Facebook numeric ID)');
  if (step.pageUrl) canonicalUrl(step.pageUrl);
  if (step.platform !== undefined && !step.platform.trim()) throw new Error('platform must not be empty');
}
function createActivityStore(directory) {
  fs.mkdirSync(directory, { recursive: true });
  const machineFile = path.join(directory, 'machine_id.txt');
  if (!fs.existsSync(machineFile)) fs.writeFileSync(machineFile, randomUUID() + '\n', { flag: 'wx' });
  const machineId = fs.readFileSync(machineFile, 'utf8').trim();
  if (!uuidPattern.test(machineId)) throw new Error('Invalid machine_id.txt');
  const catalogFile = path.join(directory, 'catalog.json'), runsDir = path.join(directory, 'runs');
  fs.mkdirSync(runsDir, { recursive: true });
  const data = fs.existsSync(catalogFile) ? JSON.parse(fs.readFileSync(catalogFile, 'utf8')) : {
    version: 1, pages: {}, folders: {}, assets: {}, file_instances: {}, publications: {}, downloads: {}, upload_events: {}, outbox: {}
  };
  let syncState = { enabled: false, error: '' };
  const pageListeners = new Set();
  function save() { atomicJson(catalogFile, data); }
  function put(collection, doc) {
    data[collection][doc._id] = doc;
    data.outbox[`${collection}/${doc._id}`] = { collection, doc: structuredClone(doc) };
  }
  function readRun(id) {
    if (!uuidPattern.test(id)) return null;
    const file = path.join(runsDir, id + '.json');
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  }
  function saveRun(run) {
    atomicJson(path.join(runsDir, run.runId + '.json'), run);
    // Run documents live in their own durable files; sync them without bloating catalog.json.
  }
  function listRuns(profile, limit = 50) {
    return fs.readdirSync(runsDir).filter(file => uuidPattern.test(file.slice(0, -5)) && file.endsWith('.json'))
      .map(file => readRun(file.slice(0, -5))).filter(run => !profile || run.profile === profile)
      .sort((a, b) => b.startedAt - a.startedAt).slice(0, limit);
  }
  for (const run of listRuns(null, Infinity)) {
    if (run.state !== 'running') continue;
    run.running = false; run.waiting = false; run.state = 'interrupted'; run.endedAt = Date.now();
    run.paused = false; run.confirmation = null;
    run.stoppedAtStep = run.index + 1; run.elapsedMs = run.endedAt - run.startedAt; run.stepElapsedMs = 0;
    run.error = 'Agent restarted before the workflow completed';
    for (const step of run.steps || []) if (step.state === 'running') {
      step.state = 'interrupted'; step.ended_at = new Date(run.endedAt).toISOString(); step.error = run.error;
      step.elapsed_ms = step.started_at ? run.endedAt - Date.parse(step.started_at) : 0;
    }
    saveRun(run);
  }
  async function registerFile(file, { duration = null, tag = 'automation', signal } = {}) {
    const fullPath = path.resolve(file), before = await fs.promises.stat(fullPath);
    if (!before.isFile() || !before.size || /\.(part|ytdl|tmp)$/i.test(file)) throw new Error('Cannot register an empty or unfinished file');
    const sha256 = await fileHash(fullPath, signal), stat = await fs.promises.stat(fullPath);
    if (before.size !== stat.size || before.mtimeMs !== stat.mtimeMs || before.ctimeMs !== stat.ctimeMs) throw new Error('File changed while hashing');
    const now = new Date().toISOString(), root = path.dirname(fullPath), relative = path.basename(fullPath);
    const normalized = process.platform === 'win32' ? root.toLowerCase() : root;
    const folderId = uuid5(URL_NAMESPACE, pythonArray([machineId, normalized, tag.trim()]));
    const instanceId = uuid5(folderId, relative + ':' + sha256);
    put('folders', { _id: folderId, name: path.basename(root), tag: tag.trim(), path: root, machine_id: machineId, last_scanned_at: now });
    if (!data.assets[sha256]) put('assets', { _id: sha256, size: stat.size, duration, created_at: now });
    put('file_instances', { _id: instanceId, name: relative, name_key: casefold(relative), size: stat.size,
      type: path.extname(relative).slice(1).toLowerCase(), duration, sha256, folder_id: folderId,
      folder_tag: tag.trim(), folder_name: path.basename(root), relative_path: relative, path: fullPath,
      machine_id: machineId, file_created_at: stat.birthtimeMs > 0 ? stat.birthtime.toISOString() : null,
      file_modified_at: stat.mtime.toISOString(), last_seen_at: now, imported_at: data.file_instances[instanceId]?.imported_at || now });
    save(); return { asset_id: sha256, file_instance_id: instanceId, filePath: fullPath, bytes: stat.size };
  }
  function rememberDownload(url, download, file) {
    const key = canonicalUrl(url);
    data.downloads[key] = { ...download, ...file, source_url: key, machine_id: machineId,
      _id: uuid5(URL_NAMESPACE, pythonArray([machineId, key])), downloaded_at: new Date().toISOString() };
    queueDownload(data.downloads[key]);
    save(); return structuredClone(data.downloads[key]);
  }
  function queueDownload(row) {
    const doc = { _id: row._id, machine_id: machineId, source_url: row.source_url, asset_id: row.asset_id,
      file_instance_id: row.file_instance_id, file_path: row.filePath, file_name: row.name, title: row.title,
      video_id: row.id, size: row.bytes, duration: row.duration ?? null, downloaded_at: row.downloaded_at, verified: row.verified === true };
    data.outbox[`downloads/${doc._id}`] = { collection: 'downloads', doc };
  }
  // Upgrade existing local URL mappings without changing their original download time.
  for (const [url, row] of Object.entries(data.downloads)) if (!row._id) {
    Object.assign(row, { _id: uuid5(URL_NAMESPACE, pythonArray([machineId, url])), machine_id: machineId, source_url: url });
    queueDownload(row); save();
  }
  function cachePage(page) {
    if (!page || !uuidPattern.test(page._id)) throw new Error('Shared page must have a string UUID');
    data.pages[page._id] = cleanPage(page); save();
  }
  function cleanPage(page) {
    return JSON.parse(JSON.stringify(Object.fromEntries(['_id', 'name', 'name_key', 'platform', 'platform_key', 'url', 'active', 'updated_at']
      .filter(key => Object.hasOwn(page, key)).map(key => [key, page[key]]))));
  }
  function adoptPage(oldId, page) {
    if (oldId === page._id) return cachePage(page);
    if (!uuidPattern.test(page._id)) throw new Error('Shared page must have a string UUID');
    if (Object.values(data.publications).some(doc => doc.page_id === oldId && doc.published_at !== null)) throw new Error('Cannot re-key a dated publication automatically');
    const publications = {};
    delete data.pages[oldId]; delete data.outbox[`pages/${oldId}`];
    data.pages[page._id] = cleanPage(page);
    for (const doc of Object.values(data.publications)) if (doc.page_id === oldId) {
      // Locally produced publications have no confirmed publication date.
      const id = uuid5(URL_NAMESPACE, pythonArray([doc.asset_id, page._id, '', doc.post_url.trim()]));
      publications[doc._id] = id;
      delete data.publications[doc._id]; delete data.outbox[`publications/${doc._id}`];
      if (!data.publications[id]) put('publications', { ...doc, _id: id, page_id: page._id });
    }
    for (const doc of Object.values(data.upload_events)) if (doc.page_id === oldId) {
      put('upload_events', { ...doc, page_id: page._id, publication_id: publications[doc.publication_id] || doc.publication_id });
    }
    const remap = run => {
      for (const step of run.steps || []) if (step.upload?.page_id === oldId) {
        step.upload.page_id = page._id;
        step.upload.publication_id = publications[step.upload.publication_id] || step.upload.publication_id;
      }
    };
    for (const run of listRuns(null, Infinity)) { remap(run); saveRun(run); }
    for (const listener of pageListeners) listener(remap);
    save();
  }
  async function cachedDownload(url, signal) {
    const cached = data.downloads[canonicalUrl(url)];
    if (!cached) return null;
    try {
      const stat = await fs.promises.stat(cached.filePath);
      if (!stat.isFile() || stat.size !== cached.bytes || await fileHash(cached.filePath, signal) !== cached.asset_id) return null;
      return { ...cached, verified: true, reused: true, message: 'Đã tải URL này; sử dụng file đã lưu' };
    } catch (error) {
      if (signal?.aborted) throw error;
      if (['ENOENT', 'ENOTDIR'].includes(error.code)) return null;
      throw error;
    }
  }
  function recordUpload(step, file, { runId, index, actualUrl = '' }) {
    const now = new Date().toISOString(), url = step.pageUrl || actualUrl;
    const target = url ? canonicalUrl(url) : '';
    const platform = step.platform?.trim() || (/(^|\.)facebook\.com$/i.test(target ? new URL(target).hostname : '') ? 'Facebook' : target ? new URL(target).hostname : 'Unknown');
    const name = step.pageName?.trim() || target || step.pageId || '';
    let page = Object.values(data.pages).find(page => step.pageId ? page._id === step.pageId.toLowerCase() : page.platform_key === casefold(platform) && page.name_key === casefold(name));
    if (name && !page) {
      const conflict = Object.values(data.pages).find(page => page.platform_key === casefold(platform) && page.name_key === casefold(name));
      if (conflict) throw new Error('pageId conflicts with an existing page name/platform');
      page = { _id: step.pageId?.toLowerCase() || randomUUID(), name, name_key: casefold(name), platform, platform_key: casefold(platform), url: target, active: true, updated_at: now };
      put('pages', page);
    }
    let publicationId = null;
    if (page) {
      if (!page.active) throw new Error('Cannot record upload to an inactive page');
      publicationId = uuid5(URL_NAMESPACE, pythonArray([file.asset_id, page._id, '', '']));
      if (!data.publications[publicationId]) put('publications', { _id: publicationId, asset_id: file.asset_id,
        page_id: page._id, published_at: null, post_url: '', desc: step.publicationDesc || '', created_at: now });
    }
    const event = { _id: uuid5(runId, String(index)), run_id: runId, step_index: index,
      file_path: step.filePath || file.filePath || '', file_name: path.basename(step.filePath || file.filePath || ''),
      asset_id: file.asset_id, file_instance_id: file.file_instance_id, page_id: page?._id || null,
      page_url: target, actual_url: actualUrl, publication_id: publicationId, uploaded_at: now, state: 'uploaded' };
    put('upload_events', event); save(); return structuredClone(event);
  }
  function recordUploadAttempt(step, file, runId, index) {
    const event = { _id: uuid5(runId, String(index)), run_id: runId, step_index: index,
      asset_id: file.asset_id, file_instance_id: file.file_instance_id, file_path: step.filePath,
      file_name: path.basename(step.filePath), page_url: step.pageUrl || '', state: 'pending', attempted_at: new Date().toISOString() };
    put('upload_events', event); save();
  }
  return { directory, data, registerFile, rememberDownload, cachedDownload, recordUpload, recordUploadAttempt, saveRun, readRun, listRuns, cachePage, adoptPage,
    onPageRemap: listener => pageListeners.add(listener),
    pending: () => Object.values(data.outbox).map(item => structuredClone(item)),
    acknowledge(item) {
      const key = `${item.collection}/${item.doc._id}`;
      if (JSON.stringify(data.outbox[key]) === JSON.stringify(item)) { delete data.outbox[key]; save(); }
    },
    syncStatus: () => ({ ...syncState, pending: Object.keys(data.outbox).length }),
    setSyncStatus: state => { syncState = state; } };
}
module.exports = { createActivityStore, canonicalUrl, fileHash, uuid5, pythonArray, URL_NAMESPACE, validateUploadMetadata };
