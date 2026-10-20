if (process.argv.length > 2) require('./src/agent/cli').run();
else require('./src/agent/main');
