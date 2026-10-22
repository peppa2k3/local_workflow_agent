const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const c = require('./common');
async function addUser(store, email, password) {
  email = c.text(email, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) c.fail('Invalid email');
  const digest = await c.passwordHash(password);
  return store.transaction(() => {
    if (store.list('user').some(u => u.email === email)) c.fail('Account already exists');
    return store.put('user', { id: randomUUID(), email, password: digest });
  });
}
function createControlServer({ store, publicUrl, allowHttp = false, trustProxy = false, commandApi }) {
  publicUrl = c.baseUrl(publicUrl, allowHttp);
  const secure = publicUrl.startsWith('https:');
  const cookieName = secure ? '__Host-control' : 'control-dev';
  const rates = new Map();
  function rate(key, limit, period = 600000) {
    const now = Date.now();
    for (const [k, v] of rates) if (v.until < now) rates.delete(k);
    if (!rates.has(key)) { if (rates.size >= 10000) c.fail('Too many requests', 429); rates.set(key, { count: 0, until: now + period }); }
    if (++rates.get(key).count > limit) c.fail('Too many requests; retry later', 429);
  }
  function bearer(req) { return /^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.authorization || '')?.[1] || ''; }
  function pending(req, data) {
    const pair = store.get('pair', c.uuid(data.id));
    if (!pair || pair.expires < Date.now() || !c.equal(pair.pollHash, c.hash(bearer(req)))) c.fail('Pairing expired or invalid', 401);
    return pair;
  }
  function device(req, data) {
    const d = store.get('device', c.uuid(data.id));
    if (!d || !c.equal(d.tokenHash, c.hash(bearer(req)))) c.fail('Device credential invalid', 401);
    if (d.revoked) c.fail('Device revoked', 410);
    return d;
  }
  const server = http.createServer(async (req, res) => {
    const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      'referrer-policy': 'no-referrer', ...(secure ? { 'strict-transport-security': 'max-age=31536000' } : {}) };
    function json(status, value, extra = {}) { res.writeHead(status, { ...headers, 'content-type': 'application/json; charset=utf-8', ...extra }); res.end(JSON.stringify(value)); }
    try {
      if (req.headers.host !== new URL(publicUrl).host) c.fail('Host not allowed', 403);
      const url = new URL(req.url, publicUrl), route = url.pathname;
      if (route === '/health' && req.method === 'GET') return json(200, { ok: true });
      if (req.method === 'GET' && ['/', '/app.js', '/style.css'].includes(route)) {
        const file = path.resolve(__dirname, '../../control-web', route === '/' ? 'index.html' : route.slice(1));
        if (!fs.existsSync(file)) { res.writeHead(200, { ...headers, 'content-type': 'text/plain; charset=utf-8' }); return res.end('Control core ready. Web UI follows in feature 04.'); }
        res.writeHead(200, { ...headers, 'content-type': route === '/' ? 'text/html; charset=utf-8' : route.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8' });
        return res.end(fs.readFileSync(file));
      }
      if (req.method !== 'GET' && req.method !== 'POST') c.fail('Method not allowed', 405);
      const isDevice = route.startsWith('/device/');
      if (isDevice && (req.headers.origin || req.method !== 'POST')) c.fail('Device API requires a native client', 403);
      if (!isDevice && req.method === 'POST' && req.headers.origin !== publicUrl) c.fail('Origin not allowed', 403);
      let ip = req.socket.remoteAddress;
      if (trustProxy && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip)) ip = String(req.headers['x-forwarded-for'] || ip).split(',')[0].trim();
      const data = req.method === 'POST' ? await c.body(req) : {};
      if (route === '/api/login' && req.method === 'POST') {
        rate(`login-ip:${ip}`, 15); const email = c.text(data.email, 254).toLowerCase(); rate(`login:${email}`, 10);
        const user = store.list('user').find(u => u.email === email);
        // A fixed dummy hash keeps unknown-account attempts on the scrypt path.
        const valid = await c.passwordValid(data.password, user?.password || 'dummy-salt:' + '0'.repeat(128));
        if (!user || !valid) c.fail('Invalid email or password', 401);
        const secret = c.token(), session = { id: c.hash(secret), userId: user.id, csrf: c.token(), expires: Date.now() + 43200000 };
        store.put('session', session, user.id);
        return json(200, { email: user.email, csrf: session.csrf }, { 'set-cookie': `${cookieName}=${secret}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200${secure ? '; Secure' : ''}` });
      }
      if (route === '/device/pair-start') {
        rate(`pair:${ip}`, 10);
        const pair = { id: randomUUID(), name: c.text(data.name, 80), pollHash: c.hash(c.text(data.pollToken, 64)),
          tokenHash: c.hash(c.text(data.deviceToken, 64)), codeHash: '', created: Date.now(), expires: Date.now() + 600000, state: 'waiting' };
        if (!/^[A-Za-z0-9_-]{43}$/.test(data.pollToken) || !/^[A-Za-z0-9_-]{43}$/.test(data.deviceToken)) c.fail('Invalid pairing secret');
        const code = c.token().slice(0, 12).toUpperCase(); pair.codeHash = c.hash(code);
        store.put('pair', pair); return json(200, { id: pair.id, code, expires: pair.expires });
      }
      if (route === '/device/pair-status') {
        const pair = pending(req, data);
        return json(200, { id: pair.id, state: pair.state, email: pair.email || null, claim: pair.claim || null, expires: pair.expires });
      }
      if (route === '/device/pair-approve') {
        const pair = pending(req, data);
        if (!pair.owner || !c.equal(pair.claim, data.claim) || !['claimed', 'active'].includes(pair.state)) c.fail('Account has not approved this pairing', 409);
        const existing = store.get('device', pair.id);
        if (existing?.revoked) c.fail('Device revoked', 410);
        store.transaction(() => {
          if (!existing) store.put('device', { id: pair.id, owner: pair.owner, email: pair.email, name: pair.name, tokenHash: pair.tokenHash,
            created: Date.now(), lastSeen: 0, revoked: false, metadata: {} }, pair.owner);
          pair.state = 'active'; store.put('pair', pair);
        });
        return json(200, { id: pair.id, email: pair.email });
      }
      if (route === '/device/revoke') {
        const d = device(req, data); d.revoked = true; store.put('device', d, d.owner); return json(200, { ok: true });
      }
      if (route.startsWith('/device/')) {
        const d = device(req, data);
        if (commandApi) return json(200, commandApi.device(route, d, data));
        c.fail('Not found', 404);
      }
      if (!route.startsWith('/api/')) c.fail('Not found', 404);
      const cookie = String(req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
      const session = cookie && store.get('session', c.hash(cookie));
      if (!session || session.expires < Date.now()) c.fail('Login required', 401);
      const user = store.get('user', session.userId);
      if (!user) c.fail('Login required', 401);
      if (req.method === 'POST' && !c.equal(req.headers['x-csrf-token'], session.csrf)) c.fail('CSRF token required', 403);
      rate(`api:${user.id}`, 180, 60000);
      if (route === '/api/me' && req.method === 'GET') return json(200, { email: user.email, csrf: session.csrf });
      if (route === '/api/logout' && req.method === 'POST') {
        store.remove('session', session.id); return json(200, { ok: true }, { 'set-cookie': `${cookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? '; Secure' : ''}` });
      }
      if (route === '/api/pair-claim' && req.method === 'POST') {
        rate(`claim:${user.id}`, 10);
        const codeHash = c.hash(c.text(data.code, 32).toUpperCase());
        const pair = store.list('pair').find(p => p.codeHash === codeHash && p.expires > Date.now());
        if (!pair || !['waiting', 'claimed'].includes(pair.state) || (pair.owner && pair.owner !== user.id)) c.fail('Pairing code invalid or unavailable', 404);
        Object.assign(pair, { owner: user.id, email: user.email, claim: pair.claim || c.token(), state: 'claimed' }); store.put('pair', pair);
        return json(200, { name: pair.name, state: 'Awaiting approval on the local device', expires: pair.expires });
      }
      if (route === '/api/devices' && req.method === 'GET') return json(200, { devices: store.list('device', user.id).map(({ tokenHash, ...d }) => ({ ...d, online: !d.revoked && Date.now() - d.lastSeen < 45000 })) });
      if (route === '/api/device-revoke' && req.method === 'POST') {
        const d = store.get('device', c.uuid(data.id));
        if (!d || d.owner !== user.id) c.fail('Device not found', 404);
        d.revoked = true; store.put('device', d, user.id); return json(200, { ok: true });
      }
      if (commandApi) return json(200, commandApi.account(route, req.method, user, data, url));
      c.fail('Not found', 404);
    } catch (e) { json(e.status || 500, { error: e.status ? e.message : 'Control server error' }); }
  });
  server.requestTimeout = 20000; server.headersTimeout = 10000;
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const kind of ['session', 'pair']) for (const record of store.list(kind)) if (record.expires < now) store.remove(kind, record.id);
  }, 60000); cleanup.unref(); server.on('close', () => clearInterval(cleanup));
  return server;
}
module.exports = { createControlServer, addUser };
