const { MongoClient } = require('mongodb');

function bsonDates(value, key = '') {
  if (value === null) return null;
  if (typeof value === 'string' && /_at$/.test(key) && Number.isFinite(Date.parse(value))) return new Date(value);
  if (['startedAt', 'endedAt'].includes(key) && typeof value === 'number') return new Date(value);
  if (Array.isArray(value)) return value.map(item => bsonDates(item));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, bsonDates(v, k)]));
  return value;
}
function createMongoSync(store, { uri = process.env.MONGODB_URI, database = process.env.MONGODB_DATABASE || 'team_content', client } = {}) {
  if (!uri && !client) return { flush: async () => {}, close: async () => {} };
  client ||= new MongoClient(uri, { serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000, socketTimeoutMS: 10000 });
  let pending, indexed = false;
  const runVersions = new Map();
  store.setSyncStatus({ enabled: true, error: '' });
  async function sync() {
    try {
      const db = client.db(database);
      if (!indexed) {
        await db.collection('pages').createIndex({ platform_key: 1, name_key: 1 }, { unique: true });
        await db.collection('file_instances').createIndex({ sha256: 1 });
        await db.collection('file_instances').createIndex({ name_key: 1, size: 1, type: 1 });
        await db.collection('file_instances').createIndex({ imported_at: -1, _id: 1 });
        await db.collection('publications').createIndex({ asset_id: 1 });
        await db.collection('publications').createIndex({ page_id: 1 });
        indexed = true;
      }
      for (const item of store.pending()) {
        const collection = db.collection(item.collection), doc = bsonDates(item.doc);
        if (item.collection === 'pages') {
          const existing = await collection.findOne({ platform_key: doc.platform_key, name_key: doc.name_key });
          const byId = await collection.findOne({ _id: doc._id });
          if (existing && existing._id !== doc._id) throw Object.assign(new Error(), { code: 'PAGE_ID_CONFLICT' });
          if (existing?.active === false || byId?.active === false) throw Object.assign(new Error(), { code: 'PAGE_INACTIVE' });
        }
        const insertOnly = ['assets', 'publications', 'pages', 'upload_events'].includes(item.collection);
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
      store.setSyncStatus({ enabled: true, error: '' });
    } catch (error) {
      // Driver messages may contain server addresses/credentials. Expose only safe codes.
      const code = String(error.code || error.name || 'unavailable').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 64);
      store.setSyncStatus({ enabled: true, error: `MongoDB sync failed: ${code}. Local records retained for retry.` });
    }
  }
  function flush() { return pending ||= sync().finally(() => { pending = null; }); }
  const timer = setInterval(() => { void flush(); }, 5000); timer.unref();
  void flush();
  return { flush, close: async () => { clearInterval(timer); await flush(); await client.close(); } };
}
module.exports = { createMongoSync, bsonDates };
