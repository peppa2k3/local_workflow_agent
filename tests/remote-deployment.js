const assert = require('node:assert/strict');
const http = require('node:http');
const { createClientIp } = require('../src/remote/proxy');
const { check } = require('../src/remote/healthcheck');
(async () => {
  const request = (peer, forwarded) => ({ socket: { remoteAddress: peer }, headers: { 'x-forwarded-for': forwarded } });
  const ip = createClientIp({ trustedProxyIps: '172.20.0.2,2001:db8::2' });
  assert.equal(ip(request('172.20.0.3', '198.51.100.1')), '172.20.0.3', 'Untrusted peers cannot spoof forwarded IP');
  assert.equal(ip(request('::ffff:172.20.0.2', '198.51.100.10')), '198.51.100.10');
  assert.equal(ip(request('172.20.0.2', '203.0.113.99, 198.51.100.10')), '198.51.100.10', 'Forged leftmost address must not control rate-limit identity');
  assert.equal(ip(request('172.20.0.2', '198.51.100.10, 2001:db8::2')), '198.51.100.10');
  assert.equal(ip(request('2001:db8::2', '2001:db8::10')), '2001:db8::10');
  assert.equal(ip(request('172.20.0.2', 'invalid, 198.51.100.10')), '172.20.0.2');
  assert.equal(ip(request('172.20.0.2', 'x'.repeat(2049))), '172.20.0.2');
  assert.equal(createClientIp()(request('127.0.0.1', '198.51.100.10')), '127.0.0.1');
  assert.equal(createClientIp({ trustLoopback: true })(request('127.0.0.1', '198.51.100.10')), '198.51.100.10');
  assert.throws(() => createClientIp({ trustedProxyIps: '0.0.0.0/0' }), /exact IP/);
  const server = http.createServer((req, res) => { res.writeHead(req.headers.host === 'control.example.test' && req.url === '/health' ? 200 : 403); res.end(); });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  try {
    await check({ publicUrl: 'https://control.example.test', port });
    await assert.rejects(check({ publicUrl: 'https://wrong.example.test', port }), /Unhealthy/);
    await assert.rejects(check({ publicUrl: 'invalid', port }), /Invalid/);
  } finally { await new Promise(r => { server.close(r); server.closeAllConnections(); }); }
  console.log('Remote deployment: exact proxy trust, spoof-resistant forwarding, IPv6 and Host-aware healthcheck passed');
})().catch(e => { console.error(e); process.exitCode = 1; });
