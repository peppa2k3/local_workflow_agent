const assert = require('node:assert/strict');
const { createDnsConfig } = require('../src/agent/mongo-dns');
const { safeMongoError } = require('../src/agent/mongo-sync');
const calls = [];
const configure = createDnsConfig({ getServers: () => ['127.0.0.1'], setServers: servers => calls.push([...servers]) });
assert.deepEqual(configure(), { dnsMode: 'system' }); assert.equal(calls.length, 0);
assert.deepEqual(configure(' 192.0.2.53, 2001:db8::53 '), { dnsMode: 'custom' });
assert.deepEqual(calls, [['192.0.2.53', '2001:db8::53']]);
configure('192.0.2.53,2001:db8::53'); assert.equal(calls.length, 1, 'reusing settings does not reconfigure the resolver during queries');
for (const value of ['host.example', 'mongodb+srv://private:secret@cluster.example/', '1.2.3.999', Array(9).fill('192.0.2.53').join(','), {}]) {
  assert.throws(() => configure(value), failure => failure.code === 'INVALID_DNS_SERVERS');
}
assert.equal(calls.length, 1, 'invalid config must not mutate DNS');
assert.deepEqual(configure(''), { dnsMode: 'system' }); assert.deepEqual(calls.at(-1), ['127.0.0.1'], 'clearing config restores original process DNS');
assert.match(safeMongoError({ code: 'ECONNREFUSED', syscall: 'querySrv' }), /DNS SRV\/TXT.*MONGODB_DNS_SERVERS/);
assert(!safeMongoError({ code: 8000, message: 'command not allowed' }).includes('mật khẩu'), 'non-auth Atlas 8000 errors must not be classified as bad credentials');
assert.match(safeMongoError({ code: 8000, message: 'bad auth' }), /mật khẩu/);
console.log('Mongo process-only DNS configuration, idempotence, restore, validation and safe error classification: OK');
