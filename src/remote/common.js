const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);
const token = () => crypto.randomBytes(32).toString('base64url');
const hash = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const equal = (a, b) => typeof a === 'string' && typeof b === 'string' && crypto.timingSafeEqual(Buffer.from(hash(a)), Buffer.from(hash(b)));
function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function text(value, max = 128) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x1f]/.test(value)) fail('Invalid text');
  return value.trim();
}
function uuid(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value)) fail('Invalid ID');
  return value;
}
function baseUrl(value, allowHttp = false) {
  let url;
  try { url = new URL(value); } catch { fail('Invalid control URL'); }
  const loopback = ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(allowHttp && loopback && url.protocol === 'http:')) fail('HTTPS required (HTTP is restricted to explicit loopback development)');
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') fail('Use an origin URL without credentials or path');
  return url.origin;
}
async function passwordHash(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 256) fail('Password requires 12–256 characters');
  const salt = token();
  return `${salt}:${(await scrypt(password, salt, 64)).toString('hex')}`;
}
async function passwordValid(password, stored) {
  if (typeof password !== 'string' || password.length > 256) return false;
  const [salt, expected] = stored.split(':');
  return equal((await scrypt(password, salt, 64)).toString('hex'), expected);
}
function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${crypto.randomUUID()}.tmp`;
  try {
    const fd = fs.openSync(temp, 'wx', 0o600);
    try { fs.writeFileSync(fd, JSON.stringify(value)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(temp, file);
  } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return structuredClone(fallback); throw e; }
}
async function body(request, limit = 128000) {
  let size = 0; const chunks = [];
  for await (const chunk of request) { size += chunk.length; if (size > limit) fail('Request too large', 413); chunks.push(chunk); }
  try { const result = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (!object(result)) fail('Expected object'); return result; }
  catch (e) { if (e.status) throw e; fail('Invalid JSON'); }
}
async function post(origin, route, data, credential, { allowHttp = false, signal } = {}) {
  origin = baseUrl(origin, allowHttp);
  if (!/^\/device\/[a-z-]+$/.test(route)) fail('Invalid device route');
  const response = await fetch(origin + route, { method: 'POST', redirect: 'error',
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
    headers: { 'content-type': 'application/json', ...(credential ? { authorization: `Bearer ${credential}` } : {}) }, body: JSON.stringify(data) });
  const reader = response.body.getReader(); let size = 0; const chunks = [];
  while (true) { const item = await reader.read(); if (item.done) break; size += item.value.length;
    if (size > 128000) { await reader.cancel(); fail('Control response too large'); } chunks.push(Buffer.from(item.value)); }
  let result;
  try { result = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail('Invalid control response'); }
  if (!response.ok) fail(typeof result.error === 'string' ? result.error : 'Control request failed', response.status);
  return result;
}
module.exports = { token, hash, equal, fail, object, text, uuid, baseUrl, passwordHash, passwordValid, atomicJson, readJson, body, post };
