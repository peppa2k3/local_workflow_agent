const path = require('path');

const projectRoot = path.resolve(__dirname, '..', '..');

module.exports = {
  port: Number(process.env.LOCAL_AGENT_PORT || 34719),
  projectRoot,
  scenariosDir: process.env.LOCAL_AGENT_SCENARIOS_DIR || path.join(projectRoot, 'scenarios'),
  dashboardPath: path.join(projectRoot, 'dashboard', 'index.html'),
  chromePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  profile: process.env.CHROME_PROFILE || 'Profile 2',
  userDataDir: process.env.CHROME_USER_DATA_DIR || path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'User Data')
};
