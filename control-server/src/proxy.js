const { BlockList, isIP } = require('node:net');
function normalize(ip) { return typeof ip === 'string' && ip.startsWith('::ffff:') && isIP(ip.slice(7)) === 4 ? ip.slice(7) : ip; }
function createClientIp({ trustedProxyIps = '', trustLoopback = false } = {}) {
  const trusted = new BlockList();
  const entries = trustedProxyIps.split(',').map(s => s.trim()).filter(Boolean);
  if (trustLoopback) entries.push('127.0.0.1', '::1');
  for (let ip of entries) {
    ip = normalize(ip); const family = isIP(ip);
    if (!family) throw Error('CONTROL_TRUSTED_PROXY_IPS requires comma-separated exact IP addresses');
    trusted.addAddress(ip, family === 4 ? 'ipv4' : 'ipv6');
  }
  function isTrusted(ip) { const family = isIP(ip); return !!family && trusted.check(ip, family === 4 ? 'ipv4' : 'ipv6'); }
  return request => {
    const peer = normalize(request.socket.remoteAddress);
    if (!isTrusted(peer)) return peer;
    const header = request.headers['x-forwarded-for'];
    if (typeof header !== 'string' || header.length > 2048) return peer;
    const chain = header.split(',').map(s => normalize(s.trim()));
    if (!chain.length || chain.length > 20 || chain.some(ip => !isIP(ip))) return peer;
    // Walk toward the client from the trusted peer, never trust the leftmost
    // value blindly: it may have been supplied by the original HTTP client.
    for (let i = chain.length - 1; i >= 0; i--) if (!isTrusted(chain[i])) return chain[i];
    return peer;
  };
}
module.exports = { createClientIp };
