const path = require('path');

const projectRoot = path.resolve(__dirname, '..', '..');

module.exports = {
  port: Number(process.env.LOCAL_AGENT_PORT || 34719),
  projectRoot,
  scenariosDir: path.join(projectRoot, 'scenarios'),
  dashboardPath: path.join(projectRoot, 'dashboard', 'index.html'),
  chromePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  profile: process.env.CHROME_PROFILE || 'Profile 2'
};
