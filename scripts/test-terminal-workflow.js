const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const root = path.resolve(__dirname, '..');
// Support the original checkout and the user's renamed runner directory.
const agentDirectory = ['local-agent', 'local-agent-corebase'].map(name => path.join(root, name))
  .find(directory => fs.existsSync(path.join(directory, 'src/workflow.js')) && fs.existsSync(path.join(directory, 'test/workflow.test.js')));

if (require.main === module) {
  if (!agentDirectory) {
    console.error('Workflow bridge tests require local-agent/ or local-agent-corebase/ source.');
    process.exitCode = 1;
  } else {
    for (const args of [['--test', path.join(agentDirectory, 'test/workflow.test.js')], [path.join(root, 'tests/terminal-workflow.js')]]) {
      const result = spawnSync(process.execPath, args, {cwd: root, stdio: 'inherit'});
      if (result.error || result.status !== 0) { if (result.error) console.error(result.error.message); process.exitCode = result.status || 1; break; }
    }
  }
}

module.exports = {agentDirectory};
