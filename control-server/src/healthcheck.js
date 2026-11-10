const http = require('node:http');
function check({ publicUrl = process.env.CONTROL_PUBLIC_URL, port = process.env.CONTROL_PORT || 34800 } = {}) {
  return new Promise((resolve, reject) => {
    let host;
    try { host = new URL(publicUrl).host; } catch { return reject(Error('Invalid CONTROL_PUBLIC_URL')); }
    const req = http.get({ hostname: '127.0.0.1', port, path: '/health', headers: { host }, timeout: 3000 }, res => {
      res.resume(); res.on('end', () => res.statusCode === 200 ? resolve() : reject(Error('Unhealthy control server')));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(Error('Healthcheck timeout'))); req.on('error', reject);
  });
}
if (require.main === module) check().catch(() => { process.exitCode = 1; });
module.exports = { check };
