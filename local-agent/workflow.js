import {runWorkflowCli} from './src/workflow-cli.js';
try {
  await runWorkflowCli();
} catch (error) {
  console.error(JSON.stringify({error: error.message}));
  process.exitCode = 1;
}
