const dns = require('node:dns');
const { isIP } = require('node:net');

function createDnsConfig(resolver = dns) {
  const defaults = resolver.getServers();
  let current = JSON.stringify(defaults);
  return function configureMongoDns(value = '') {
    if (typeof value !== 'string') throw Object.assign(new Error('Invalid MONGODB_DNS_SERVERS'), { code: 'INVALID_DNS_SERVERS' });
    const servers = value.split(',').map(server => server.trim()).filter(Boolean);
    if (servers.length > 8 || servers.some(server => !isIP(server))) throw Object.assign(new Error('MONGODB_DNS_SERVERS requires comma-separated IP addresses'), { code: 'INVALID_DNS_SERVERS' });
    const selected = servers.length ? servers : defaults, signature = JSON.stringify(selected);
    // dns.setServers affects this Node process only; it never changes Windows network settings.
    if (signature !== current) { resolver.setServers(selected); current = signature; }
    return { dnsMode: servers.length ? 'custom' : 'system' };
  };
}
const configureMongoDns = createDnsConfig();
module.exports = { configureMongoDns, createDnsConfig };
