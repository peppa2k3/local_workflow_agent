# Project guidance for coding agents

Read [docs/PROJECT_CONTEXT.md](docs/PROJECT_CONTEXT.md) and [docs/PROGRESS.md](docs/PROGRESS.md) before changing automation behavior. Check [prompts/processing](prompts/processing) for active work.

Preserve these user-facing entry points: `node local-agent.js`, `http://127.0.0.1:34719`, `chrome-reels-extension/`, and JSON files in `scenarios/`. Keep legacy CSS `selector` steps working.

Commmit change to git

For new or changed actions, update the agent, extension, dashboard, [docs/SCENARIOS.md](docs/SCENARIOS.md), and a meaningful test when behavior can be verified locally. Run `npm test` and `node --check` on changed JavaScript.

Do not add Chrome profile data, `node_modules`, `.pem` keys, or `.crx` packages to Git. Do not use the user's logged-in Chrome profile for automated tests.
