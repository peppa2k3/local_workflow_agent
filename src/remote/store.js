const fs = require('node:fs');
const path = require('node:path');
// Loaded by the VPS only. Local automation does not require SQLite support.
const { DatabaseSync } = require('node:sqlite');
function createStore(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL, id TEXT NOT NULL, owner TEXT NOT NULL,
      value TEXT NOT NULL, PRIMARY KEY(kind,id));
    CREATE INDEX IF NOT EXISTS records_owner ON records(kind,owner);`);
  const get = db.prepare('SELECT value FROM records WHERE kind=? AND id=?');
  const list = db.prepare('SELECT value FROM records WHERE kind=? AND owner=? ORDER BY rowid');
  const all = db.prepare('SELECT value FROM records WHERE kind=? ORDER BY rowid');
  const put = db.prepare('INSERT INTO records(kind,id,owner,value) VALUES(?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET owner=excluded.owner,value=excluded.value');
  const remove = db.prepare('DELETE FROM records WHERE kind=? AND id=?');
  return {
    get: (kind, id) => { const row = get.get(kind, id); return row ? JSON.parse(row.value) : null; },
    list: (kind, owner) => (owner === undefined ? all.all(kind) : list.all(kind, owner)).map(row => JSON.parse(row.value)),
    put: (kind, value, owner = '') => { put.run(kind, value.id, owner, JSON.stringify(value)); return value; },
    remove: (kind, id) => remove.run(kind, id),
    transaction(fn) { db.exec('BEGIN IMMEDIATE'); try { const value = fn(); db.exec('COMMIT'); return value; } catch (e) { db.exec('ROLLBACK'); throw e; } },
    close: () => db.close()
  };
}
module.exports = { createStore };
