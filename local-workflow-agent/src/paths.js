const path = require('node:path');
const fs = require('node:fs');

const agentRoot = path.resolve(__dirname, '..');
const projectRoot = path.resolve(agentRoot, '..');
// New installations are self-contained. Existing checkouts keep using their
// original data/config until explicitly migrated, rather than creating a new
// machine identity or hiding user scenarios. No dependency on the parent app.
const legacyCheckout = fs.existsSync(path.join(projectRoot, 'local-agent.js'));
function location(local, legacy) {
  const localPath = path.join(agentRoot, local);
  const legacyPath = path.join(projectRoot, legacy);
  return legacyCheckout && fs.existsSync(legacyPath) ? legacyPath : localPath;
}
module.exports = {
  agentRoot, projectRoot,
  envFile: fs.existsSync(path.join(agentRoot, '.env')) ? path.join(agentRoot, '.env') : location('.env', '.env'),
  dataDir: location('data', 'data/agent'),
  scenariosDir: location('scenarios', 'scenarios'),
  dashboardDir: path.join(agentRoot, 'dashboard'),
  toolsDir: location('tools', 'tools')
};
