const path = require('node:path');

const agentRoot = path.resolve(__dirname, '..');
const projectRoot = path.resolve(agentRoot, '..');
module.exports = {
  agentRoot, projectRoot,
  envFile: path.join(projectRoot, '.env'),
  dataDir: path.join(projectRoot, 'data', 'agent'),
  scenariosDir: path.join(projectRoot, 'scenarios'),
  dashboardDir: path.join(agentRoot, 'dashboard'),
  toolsDir: path.join(projectRoot, 'tools')
};
