require('./src/agent/env').loadProjectEnv();
if (process.argv.length === 3 && process.argv[2] === '--daemon') require('./src/agent/main');
else if (process.argv.length > 2) require('./src/agent/cli').run();
else require('./src/agent/main');
