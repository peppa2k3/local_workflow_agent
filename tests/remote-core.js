const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createStore } = require('../src/remote/store');
const c = require('../src/remote/common');
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-core-'));
  try {
    assert.throws(() => c.baseUrl('http://vps.example', true), /HTTPS/);
    assert.throws(() => c.baseUrl('https://user:pass@example.com'), /credentials/);
    assert.equal(c.baseUrl('http://127.0.0.1:34800', true), 'http://127.0.0.1:34800');
    const secret = c.token(); assert.equal(c.equal(secret, secret), true); assert.equal(c.equal(secret, secret + 'x'), false);
    const pw = await c.passwordHash('example-password-123');
    assert.equal(await c.passwordValid('example-password-123', pw), true);
    assert.equal(await c.passwordValid('different-password', pw), false);
    const file = path.join(dir, 'state.json'); c.atomicJson(file, { counter: 1 }); c.atomicJson(file, { counter: 2 });
    assert.deepEqual(c.readJson(file), { counter: 2 });
    let store = createStore(path.join(dir, 'control.sqlite'));
    store.put('device', { id: 'a', name: 'PC Việt' }, 'owner1');
    assert.throws(() => store.transaction(() => { store.put('device', { id: 'b' }); throw Error('rollback'); }));
    assert.equal(store.get('device', 'b'), null); store.close();
    store = createStore(path.join(dir, 'control.sqlite'));
    assert.equal(store.get('device', 'a').name, 'PC Việt'); assert.equal(store.list('device', 'owner2').length, 0); store.close();
    console.log('remote core: persistence, isolation, rollback, credentials and URL policy passed');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
})().catch(e => { console.error(e); process.exitCode = 1; });
