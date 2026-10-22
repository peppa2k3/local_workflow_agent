const { MongoClient } = require('mongodb');
const { configureMongoDns } = require('./mongo-dns');

function bsonDates(value, key = '') {
  if (value === null) return null;
  if (typeof value === 'string' && /_at$/.test(key) && Number.isFinite(Date.parse(value))) return new Date(value);
  if (['startedAt', 'endedAt'].includes(key) && typeof value === 'number') return new Date(value);
  if (Array.isArray(value)) return value.map(item => bsonDates(item));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, bsonDates(v, k)]));
  return value;
}
function safeMongoError(error) {
  const code = String(error.code || error.name || 'unavailable').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 64);
  const help = /query(?:Srv|Txt)/i.test(error.syscall || '') ? 'Lỗi DNS SRV/TXT. Kiểm tra MONGODB_DNS_SERVERS trong .env; agent chưa tới bước xác thực Atlas.'
    : code === 'INVALID_DNS_SERVERS' ? 'MONGODB_DNS_SERVERS phải là các IP DNS, phân cách bằng dấu phẩy.'
    : code === '18' || (code === '8000' && /auth|password|credentials/i.test(error.message || '')) ? 'Kiểm tra database user và mật khẩu Atlas.'
    : /ServerSelection|ENOTFOUND|ETIME|ECONN|EAI_/.test(code) ? 'Kiểm tra URI, mạng và IP Access List trên Atlas.'
    : code === '11000' ? 'Tên/nền tảng page đã tồn tại. Làm mới và chọn page có sẵn.' : 'Dữ liệu local được giữ để đồng bộ lại.';
  return `MongoDB: ${code}. ${help}`;
}
function createMongoSync(store, options = {}) {
  const settings = options.settings || (() => ({ uri: options.uri ?? process.env.MONGODB_URI, database: options.database || process.env.MONGODB_DATABASE || 'team_content', dnsServers: options.dnsServers ?? process.env.MONGODB_DNS_SERVERS ?? '' }));
  let config, client = options.client, pending, indexed = false, resetting = false, closed = false;
  let state = { enabled: false, connected: false, database: 'team_content', error: '', lastCheckedAt: null, lastSyncedAt: null };
  const runVersions = new Map();
  function update(fields) { state = { ...state, ...fields }; store.setSyncStatus(state); }
  function configure() {
    try {
      config = settings();
      if (!/^[a-zA-Z0-9_-]{1,63}$/.test(config.database)) throw Object.assign(new Error(), { code: 'INVALID_DATABASE' });
      update({ enabled: Boolean(config.uri || options.client), connected: false, database: config.database, error: '' });
    } catch (error) { config = null; update({ enabled: true, connected: false, error: safeMongoError(error) }); }
  }
  configure();
  function database() {
    if (resetting || closed) throw Object.assign(new Error('MongoDB connection is restarting'), { status: 503 });
    if (!config || !state.enabled) throw Object.assign(new Error(state.error || 'Chưa có MONGODB_URI. Điền .env rồi bấm Kết nối lại.'), { status: 503 });
    if (!client) {
      update(configureMongoDns(config.dnsServers || ''));
      client = new MongoClient(config.uri, { appName: 'local-workflow-agent', serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 5000, socketTimeoutMS: 10000, maxPoolSize: 10 });
    }
    return client.db(config.database);
  }
  async function request(operation) {
    try { const result = await operation(database()); update({ connected: true, lastCheckedAt: new Date().toISOString() }); return result; }
    catch (error) {
      if (error.status && error.status !== 503) throw error;
      const message = error.status === 503 ? error.message : safeMongoError(error);
      update({ connected: false, error: message, lastCheckedAt: new Date().toISOString() });
      throw Object.assign(new Error(message), { status: 503 });
    }
  }
  async function ping() {
    await request(db => db.command({ ping: 1 }));
    update({ error: '' }); return store.syncStatus();
  }
  async function sync() {
    if (!state.enabled || !config || closed) return;
    try {
      await request(async db => {
        await db.command({ ping: 1 });
        if (!indexed) {
          await db.collection('pages').createIndex({ platform_key: 1, name_key: 1 }, { unique: true });
          await db.collection('file_instances').createIndex({ sha256: 1 });
          await db.collection('file_instances').createIndex({ name_key: 1, size: 1, type: 1 });
          await db.collection('file_instances').createIndex({ imported_at: -1, _id: 1 });
          await db.collection('publications').createIndex({ asset_id: 1 });
          await db.collection('publications').createIndex({ page_id: 1 });
          await db.collection('downloads').createIndex({ source_url: 1, machine_id: 1 }, { unique: true });
          await db.collection('upload_events').createIndex({ uploaded_at: -1, _id: 1 });
          indexed = true;
        }
        // Resolve shared page UUIDs before syncing publications or upload events.
        for (const item of store.pending().filter(item => item.collection === 'pages')) {
          const pages = db.collection('pages'), doc = bsonDates(item.doc);
          const byId = await pages.findOne({ _id: doc._id });
          const byName = await pages.findOne({ platform_key: doc.platform_key, name_key: doc.name_key });
          const existing = byId || byName;
          if (existing?.active === false) throw Object.assign(new Error(), { code: 'PAGE_INACTIVE' });
          if (byId && byName && byId._id !== byName._id) throw Object.assign(new Error(), { code: 'PAGE_ID_CONFLICT' });
          if (existing && existing._id !== doc._id && store.adoptPage) store.adoptPage(doc._id, existing);
          else {
            await pages.updateOne({ _id: doc._id }, { $setOnInsert: doc }, { upsert: true });
            store.acknowledge(item);
          }
        }
        for (const item of store.pending()) {
          if (item.collection === 'pages') continue;
          const collection = db.collection(item.collection), doc = bsonDates(item.doc);
          const insertOnly = ['assets', 'publications', 'upload_events'].includes(item.collection);
          if (insertOnly) await collection.updateOne({ _id: doc._id }, { $setOnInsert: doc }, { upsert: true });
          else {
            const { _id, imported_at, ...fields } = doc;
            await collection.updateOne({ _id }, { $set: fields, ...(imported_at ? { $setOnInsert: { imported_at } } : {}) }, { upsert: true });
          }
          store.acknowledge(item);
        }
        for (const run of store.listRuns(null, Infinity)) {
          const version = JSON.stringify(run);
          if (runVersions.get(run.runId) === version) continue;
          await db.collection('workflow_runs').updateOne({ _id: run.runId }, { $set: bsonDates(run) }, { upsert: true });
          runVersions.set(run.runId, version);
        }
      });
      update({ error: '', lastSyncedAt: new Date().toISOString() });
    } catch { /* request() records a safe error; durable outbox is retried. */ }
  }
  function flush() {
    if (resetting || closed) return pending || Promise.resolve();
    return pending ||= sync().finally(() => { pending = null; });
  }
  async function reconnect() {
    if (resetting) throw Object.assign(new Error('Đang kết nối lại MongoDB'), { status: 409 });
    resetting = true;
    try {
      await pending;
      await client?.close(); client = options.client;
      indexed = false; runVersions.clear(); configure();
    } finally { resetting = false; }
    await ping(); await flush(); return store.syncStatus();
  }
  const timer = setInterval(() => { void flush(); }, 5000); timer.unref();
  void flush();
  return { request, ping, flush, reconnect, status: store.syncStatus,
    close: async () => { clearInterval(timer); await flush(); closed = true; await client?.close(); } };
}
module.exports = { createMongoSync, bsonDates, safeMongoError };
