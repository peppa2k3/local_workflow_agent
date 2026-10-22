const { loadProjectEnv, mongoSettings } = require('../src/agent/env');
const { MongoClient } = require('mongodb');
const { safeMongoError } = require('../src/agent/mongo-sync');
const { configureMongoDns } = require('../src/agent/mongo-dns');

(async () => {
  loadProjectEnv();
  const { uri, database, dnsServers } = mongoSettings();
  if (!/^[a-zA-Z0-9_-]{1,63}$/.test(database)) {
    console.log(JSON.stringify({ connected: false, error: 'Invalid MONGODB_DATABASE' })); process.exitCode = 1; return;
  }
  if (!uri) {
    console.log(JSON.stringify({ connected: false, database, error: 'Điền MONGODB_URI Atlas trong .env rồi chạy lại npm run check:mongo.' }));
    process.exitCode = 2; return;
  }
  let client;
  try {
    const dnsStatus = configureMongoDns(dnsServers);
    client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000, socketTimeoutMS: 10000 });
    await client.db(database).command({ ping: 1 });
    console.log(JSON.stringify({ connected: true, database, ...dnsStatus }));
  } catch (error) {
    console.log(JSON.stringify({ connected: false, database, error: safeMongoError(error) })); process.exitCode = 1;
  } finally { await client?.close(); }
})().catch(() => { console.error('Cannot read .env MongoDB configuration'); process.exitCode = 1; });
