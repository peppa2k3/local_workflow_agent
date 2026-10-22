const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fixture } = require('./helpers/remote');
const c = require('../src/remote/common');
const { createRemoteClient } = require('../src/agent/remote-client');
(async () => {
  const f = await fixture(); const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-pair-'));
  const client = createRemoteClient({ dataDir: dir, profiles: () => [], scenarios: { list: () => [] }, allowHttp: true });
  try {
    const a = f.browser(), b = f.browser();
    await a('/api/devices', undefined, 401);
    await a('/api/login', { email: 'alice@example.test', password: 'wrong' }, 401);
    await a('/api/login', { email: 'alice@example.test', password: 'long-password-alice' });
    await b('/api/login', { email: 'bob@example.test', password: 'long-password-bob' });
    await a('/api/logout', {}, 403, { headers: { 'x-csrf-token': '' } });
    await a('/api/pair-claim', { code: 'unknown' }, 403, { headers: { origin: 'https://evil.test' } });
    await client.action('pair-start', { url: f.origin, name: 'Fixture PC' });
    let pending = client.status().pending;
    await assert.rejects(client.action('pair-approve', { claim: 'unclaimed' }), /Review/);
    await a('/api/pair-claim', { code: pending.code });
    await b('/api/pair-claim', { code: pending.code }, 404);
    await client.tick(); pending = client.status().pending;
    assert.equal(pending.email, 'alice@example.test');
    assert.equal((await a('/api/devices')).devices.length, 0, 'Account claim alone cannot create device');
    const secret = c.readJson(path.join(dir, 'remote.json')).pending;
    await assert.rejects(c.post(f.origin, '/device/pair-approve', { id: pending.id, claim: pending.claim }, c.token(), { allowHttp: true }), /invalid/);
    await client.action('pair-approve', { claim: pending.claim });
    const devices = (await a('/api/devices')).devices;
    assert.equal(devices.length, 1); assert.equal(devices[0].tokenHash, undefined);
    assert.equal((await b('/api/devices')).devices.length, 0);
    await b('/api/device-revoke', { id: devices[0].id }, 404);
    // Lost approval response can be retried without generating another credential/device.
    await c.post(f.origin, '/device/pair-approve', { id: secret.id, claim: pending.claim }, secret.pollToken, { allowHttp: true });
    assert.equal((await a('/api/devices')).devices.length, 1);
    await a('/api/device-revoke', { id: devices[0].id });
    await assert.rejects(c.post(f.origin, '/device/revoke', { id: secret.id }, secret.deviceToken, { allowHttp: true }), /revoked/);
    await a('/api/logout', {}); await a('/api/me', undefined, 401);
    console.log('remote pairing: mutual approval, retry, account isolation, CSRF, login and revoke passed');
  } finally { client.close(); await f.close(); fs.rmSync(dir, { recursive: true, force: true }); }
})().catch(e => { console.error(e); process.exitCode = 1; });
