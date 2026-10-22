const { randomUUID } = require('node:crypto');
const { canonicalUrl } = require('./activity-store');
const { casefold } = require('./casefold');
const error = (status, message) => Object.assign(new Error(message), { status });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const catalogs = {
  pages: { fields: ['name', 'platform', 'url', 'active', 'updated_at'], search: ['name', 'platform', 'url'], sort: { name_key: 1, _id: 1 } },
  downloads: { fields: ['source_url', 'title', 'asset_id', 'file_instance_id', 'file_path', 'file_name', 'machine_id', 'video_id', 'size', 'duration', 'verified', 'downloaded_at'], search: ['title', 'source_url', 'asset_id', 'file_name'], sort: { downloaded_at: -1, _id: 1 } },
  upload_events: { fields: ['run_id', 'step_index', 'asset_id', 'file_instance_id', 'page_id', 'page_url', 'actual_url', 'publication_id', 'uploaded_at', 'state'], search: ['page_url', 'actual_url', 'asset_id', 'run_id'], sort: { uploaded_at: -1, _id: 1 } },
  publications: { fields: ['asset_id', 'page_id', 'published_at', 'post_url', 'desc', 'created_at', 'updated_at'], search: ['desc', 'post_url', 'asset_id'], sort: { created_at: -1, _id: 1 } },
  assets: { fields: ['size', 'duration', 'created_at', 'storage.provider', 'storage.bucket', 'storage.key', 'storage.content_type', 'storage.status', 'storage.uploaded_at'], search: ['_id'], sort: { created_at: -1, _id: 1 } },
  file_instances: { fields: ['name', 'size', 'type', 'duration', 'sha256', 'folder_id', 'folder_name', 'folder_tag', 'relative_path', 'path', 'machine_id', 'file_created_at', 'file_modified_at', 'last_seen_at', 'imported_at'], search: ['name', 'sha256', 'folder_tag', 'path'], sort: { imported_at: -1, _id: 1 } },
  workflow_runs: { fields: ['runId', 'profile', 'scenario', 'state', 'index', 'total', 'startedAt', 'endedAt', 'error', 'stoppedAtStep', 'steps', 'download'], search: ['scenario', 'profile', 'runId', 'error'], sort: { startedAt: -1, _id: 1 } }
};
function objectBody(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !allowed.includes(key))) throw error(400, 'Invalid fields');
  return body;
}
function text(value, name, max, required = false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw error(400, `Invalid ${name}`);
  return value.trim();
}
function httpUrl(value) {
  const raw = text(value, 'URL', 2048);
  if (!raw) return '';
  try { return canonicalUrl(raw); } catch { throw error(400, 'URL must be HTTP/HTTPS without credentials'); }
}
function pageFields(body, previous = {}) {
  const name = text(body.name ?? previous.name, 'page name', 256, true);
  const platform = text(body.platform ?? previous.platform, 'platform', 64, true);
  const active = body.active ?? previous.active ?? true;
  if (typeof active !== 'boolean') throw error(400, 'active must be boolean');
  return { name, platform, name_key: casefold(name), platform_key: casefold(platform),
    url: httpUrl(body.url ?? previous.url ?? ''), active, updated_at: new Date() };
}
function versionFilter(id, current, expected) {
  const date = current.updated_at ? new Date(current.updated_at).toISOString() : null;
  if (expected !== undefined && expected !== date) throw error(409, 'Bản ghi đã được service khác sửa. Làm mới trước khi lưu.');
  return { _id: id, updated_at: Object.hasOwn(current, 'updated_at') ? current.updated_at : { $exists: false } };
}
function pageResponse(page) {
  return Object.fromEntries(['_id', 'name', 'name_key', 'platform', 'platform_key', 'url', 'active', 'updated_at']
    .filter(key => Object.hasOwn(page, key)).map(key => [key, page[key]]));
}
function createContentApi({ mongo, activity, readBody }) {
  async function createPage(db, body, allowExisting = false) {
    const fields = pageFields(body), pages = db.collection('pages');
    await pages.createIndex({ platform_key: 1, name_key: 1 }, { unique: true });
    const key = { platform_key: fields.platform_key, name_key: fields.name_key };
    const existing = await pages.findOne(key);
    if (existing) {
      if (allowExisting) return existing;
      throw error(409, 'Page đã tồn tại. Chọn page có sẵn hoặc chỉnh sửa nó.');
    }
    const doc = { _id: randomUUID(), ...fields };
    try { await pages.updateOne(key, { $setOnInsert: doc }, { upsert: true }); }
    catch (failure) { if (failure.code !== 11000) throw failure; }
    const saved = await pages.findOne(key);
    if (saved?._id !== doc._id && !allowExisting) throw error(409, 'Page đã được service khác tạo. Làm mới dữ liệu.');
    return saved;
  }
  async function prepareUpload(step, currentUrl = '') {
    if (!mongo.status().enabled || !(step.pageId || step.pageName || step.pageUrl)) return;
    const url = step.pageUrl || currentUrl;
    const host = url ? new URL(httpUrl(url)).hostname : '';
    const platform = step.platform?.trim() || (/(^|\.)facebook\.com$/i.test(host) || !host ? 'Facebook' : host);
    const page = await mongo.request(async db => {
      const pages = db.collection('pages');
      let found;
      if (step.pageId) found = await pages.findOne({ _id: step.pageId.toLowerCase() });
      else if (step.pageName) found = await pages.findOne({ name_key: casefold(step.pageName.trim()), platform_key: casefold(platform) });
      else if (step.pageUrl) found = await pages.findOne({ url: httpUrl(step.pageUrl) });
      if (!found && step.pageId) throw error(404, 'Page UUID không tồn tại trong database dùng chung');
      if (!found) found = await createPage(db, { name: step.pageName || step.pageUrl, platform, url: step.pageUrl || currentUrl }, true);
      if (!found?.active) throw error(409, 'Page đã ngừng hoạt động trong database dùng chung');
      return found;
    });
    activity.cachePage(page);
    Object.assign(step, { pageId: page._id, pageName: page.name, platform: page.platform, pageUrl: page.url || step.pageUrl || '' });
  }
  async function catalog(name, params) {
    const spec = catalogs[name];
    if (!spec) throw error(404, 'Unknown catalog');
    const q = params.get('q') || '', offset = Number(params.get('offset') || 0), limit = Number(params.get('limit') || 25);
    if (q.length > 256 || !Number.isSafeInteger(offset) || offset < 0 || offset > 100000 || !Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw error(400, 'Invalid search/pagination');
    const filter = {};
    if (q) filter.$or = spec.search.map(field => ({ [field]: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }));
    const pageId = params.get('pageId'), assetId = params.get('assetId');
    if (pageId) {
      if (!uuid.test(pageId) || !['publications', 'upload_events'].includes(name)) throw error(400, 'Invalid page filter');
      filter.page_id = pageId.toLowerCase();
    }
    if (assetId) {
      if (!/^[a-f0-9]{64}$/.test(assetId) || !['publications', 'upload_events', 'downloads', 'file_instances'].includes(name)) throw error(400, 'Invalid asset filter');
      filter[name === 'file_instances' ? 'sha256' : 'asset_id'] = assetId;
    }
    if (params.has('active')) {
      if (name !== 'pages' || !['true', 'false'].includes(params.get('active'))) throw error(400, 'Invalid active filter');
      filter.active = params.get('active') === 'true';
    }
    return mongo.request(async db => {
      const collection = db.collection(name), projection = Object.fromEntries(spec.fields.map(field => [field, 1]));
      const [rows, total] = await Promise.all([
        collection.find(filter, { projection, maxTimeMS: 5000 }).sort(spec.sort).skip(offset).limit(limit).toArray(),
        collection.countDocuments(filter, { maxTimeMS: 5000 })
      ]);
      const pageIds = [...new Set(rows.map(row => row.page_id).filter(Boolean))];
      if (pageIds.length) {
        const pages = await db.collection('pages').find({ _id: { $in: pageIds } }, { projection: { name: 1, platform: 1, url: 1, active: 1 }, maxTimeMS: 5000 }).toArray();
        for (const row of rows) row.page = pages.find(page => page._id === row.page_id) || null;
      }
      return { rows, total, offset, limit, source: 'mongodb', database: mongo.status().database };
    });
  }
  async function handle(request, url, json) {
    const route = url.pathname.slice('/api/content'.length);
    if (request.method === 'GET' && route === '/status') return json(200, mongo.status());
    if (request.method === 'POST' && route === '/ping') return json(200, await mongo.ping());
    if (request.method === 'POST' && route === '/reconnect') return json(200, await mongo.reconnect());
    if (request.method === 'POST' && route === '/sync') { await mongo.flush(); return json(200, mongo.status()); }
    if (request.method === 'GET' && route === '/summary') {
      const counts = await mongo.request(async db => Object.fromEntries(await Promise.all(Object.keys(catalogs).map(async name => [name, await db.collection(name).countDocuments({}, { maxTimeMS: 5000 })]))));
      return json(200, { counts, storage: mongo.status() });
    }
    const list = route.match(/^\/catalog\/([a-z_]+)$/);
    if (request.method === 'GET' && list) return json(200, await catalog(list[1], url.searchParams));
    if (request.method === 'POST' && route === '/pages') {
      const body = objectBody(await readBody(request), ['name', 'platform', 'url', 'active']);
      const page = await mongo.request(db => createPage(db, body));
      activity.cachePage(page); return json(201, pageResponse(page));
    }
    const pageMatch = route.match(/^\/pages\/([0-9a-f-]{36})$/);
    if (request.method === 'PATCH' && pageMatch && uuid.test(pageMatch[1])) {
      const body = objectBody(await readBody(request), ['name', 'platform', 'url', 'active', 'expectedUpdatedAt']);
      const page = await mongo.request(async db => {
        const pages = db.collection('pages'), current = await pages.findOne({ _id: pageMatch[1] });
        if (!current) throw error(404, 'Page not found');
        const fields = pageFields(body, current);
        await pages.createIndex({ platform_key: 1, name_key: 1 }, { unique: true });
        const updated = await pages.updateOne(versionFilter(current._id, current, body.expectedUpdatedAt), { $set: fields });
        if (!updated.matchedCount) throw error(409, 'Page changed. Refresh before saving.');
        return { ...current, ...fields };
      });
      activity.cachePage(page); return json(200, pageResponse(page));
    }
    const publicationMatch = route.match(/^\/publications\/([0-9a-f-]{36})$/);
    if (request.method === 'PATCH' && publicationMatch && uuid.test(publicationMatch[1])) {
      const body = objectBody(await readBody(request), ['desc', 'post_url', 'published_at', 'expectedUpdatedAt']);
      const fields = { updated_at: new Date() };
      if (body.desc !== undefined) fields.desc = text(body.desc, 'description', 20000);
      if (body.post_url !== undefined) fields.post_url = httpUrl(body.post_url);
      if (body.published_at !== undefined) {
        if (body.published_at !== null && (typeof body.published_at !== 'string' || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(body.published_at) || !Number.isFinite(Date.parse(body.published_at)))) throw error(400, 'published_at must be an ISO date with timezone or null');
        fields.published_at = body.published_at === null ? null : new Date(body.published_at);
      }
      const doc = await mongo.request(async db => {
        const collection = db.collection('publications'), current = await collection.findOne({ _id: publicationMatch[1] });
        if (!current) throw error(404, 'Publication not found');
        const updated = await collection.updateOne(versionFilter(current._id, current, body.expectedUpdatedAt), { $set: fields });
        if (!updated.matchedCount) throw error(409, 'Publication changed. Refresh before saving.');
        return { ...current, ...fields };
      });
      return json(200, Object.fromEntries(['_id', ...catalogs.publications.fields].filter(key => Object.hasOwn(doc, key)).map(key => [key, doc[key]])));
    }
    throw error(404, 'Content endpoint not found');
  }
  return { handle, prepareUpload, catalog };
}
module.exports = { createContentApi, catalogs };
