const path = require('node:path');
const fs = require('node:fs');
const { parseEnv } = require('node:util');
const inherited = new Set(Object.keys(process.env).map(key => process.platform === 'win32' ? key.toUpperCase() : key));
let envFile = process.env.LOCAL_AGENT_ENV_FILE || path.resolve(__dirname, '../../.env');

function loadProjectEnv(file = envFile) {
  envFile = file;
  try { process.loadEnvFile(file); return true; }
  catch (error) {
    if (error.code === 'ENOENT') return false;
    throw new Error('Cannot read the agent .env file. Check its path and permissions.');
  }
}
function mongoSettings() {
  let values = {};
  try { values = parseEnv(fs.readFileSync(envFile, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw new Error('Cannot read .env MongoDB settings'); }
  // Re-read only Mongo settings; values inherited from the shell retain priority.
  for (const key of ['MONGODB_URI', 'MONGODB_DATABASE', 'MONGODB_DNS_SERVERS']) if (!inherited.has(key)) {
    if (Object.hasOwn(values, key)) process.env[key] = values[key]; else delete process.env[key];
  }
  return { uri: process.env.MONGODB_URI || '', database: process.env.MONGODB_DATABASE || 'team_content', dnsServers: process.env.MONGODB_DNS_SERVERS || '' };
}
module.exports = { loadProjectEnv, mongoSettings };
