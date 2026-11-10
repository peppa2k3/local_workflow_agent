require('./src/env').loadProjectEnv();
if (process.argv.length === 3 && process.argv[2] === '--daemon') require('./src/main');
else if (process.argv.length > 2) require('./src/cli').run();
else require('./src/main');
