const path = require('path');

const { projectRoot, scenariosDir, dashboardDir, dataDir } = require('./paths');

module.exports = {
  port: Number(process.env.LOCAL_AGENT_PORT || 34719),
  projectRoot,
  dataDir: process.env.LOCAL_AGENT_DATA_DIR || dataDir,
  scenariosDir: process.env.LOCAL_AGENT_SCENARIOS_DIR || scenariosDir,
  dashboardPath: path.join(dashboardDir, 'index.html'),
  chromePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  profile: process.env.CHROME_PROFILE || 'Profile 2',
  userDataDir: process.env.CHROME_USER_DATA_DIR || path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'User Data')
};
