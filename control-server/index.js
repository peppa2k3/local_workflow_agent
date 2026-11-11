const path = require('node:path');
const fs = require('node:fs');
const { createStore } = require('./src/store');
const { createControlServer, addUser } = require('./src/server');
const { createCommandApi } = require('./src/commands');
const legacyRoot = path.resolve(__dirname, '..');
const legacyCheckout = fs.existsSync(path.join(legacyRoot, 'remote-control.js'));
const appEnv = path.join(__dirname, '.env');
const envFile = fs.existsSync(appEnv) || !legacyCheckout ? appEnv : path.join(legacyRoot, '.env.control');
const legacyData = path.join(legacyRoot, 'data/control/control.sqlite');
const defaultDatabase = legacyCheckout && fs.existsSync(legacyData) ? legacyData : path.join(__dirname, 'data/control.sqlite');
try { process.loadEnvFile(process.env.CONTROL_ENV_FILE || envFile); } catch (e) { if (e.code !== 'ENOENT') throw e; }
async function main() {
  const store = createStore(process.env.CONTROL_DATABASE || defaultDatabase);
  if (process.argv[2] === 'user') {
    try {
      const email = process.argv[3];
      if (!email || process.stdin.isTTY) throw Error('Usage: node remote-control.js user email@example.com < password-file (12+ characters)');
      let password = ''; for await (const chunk of process.stdin) { password += chunk; if (password.length > 512) throw Error('Password input too large'); }
      const user = await addUser(store, email, password.replace(/\r?\n$/, '')); console.log(`Created account: ${user.email}`);
    } finally { store.close(); }
    return;
  }
  if (process.argv.length > 2) { store.close(); throw Error('Unknown control command'); }
  const server = createControlServer({ store, publicUrl: process.env.CONTROL_PUBLIC_URL,
    allowHttp: process.env.CONTROL_ALLOW_HTTP_LOOPBACK === '1', trustProxy: process.env.CONTROL_TRUST_PROXY === '1',
    trustedProxyIps: process.env.CONTROL_TRUSTED_PROXY_IPS || '', commandApi: createCommandApi(store) });
  server.listen(Number(process.env.CONTROL_PORT || 34800), process.env.CONTROL_BIND || '127.0.0.1', () => console.log('Remote control server ready'));
  let closing = false;
  function close() { if (closing) return; closing = true; server.close(() => store.close()); server.closeIdleConnections(); }
  process.on('SIGINT', close); process.on('SIGTERM', close);
  server.on('error', () => { console.error('Control server could not listen; check bind/port'); store.close(); process.exitCode = 1; });
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
