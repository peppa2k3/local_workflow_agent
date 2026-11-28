const { EventEmitter } = require('node:events');
const { createDashboardPrompts } = require('../../local-workflow-agent/src/integrations/remote/dashboard-prompts');

async function routeDashboardPrompts(page) {
  const prompts = createDashboardPrompts();
  await page.route('**/api/remote/prompt-open', async route => {
    const { id, message } = route.request().postDataJSON();
    await route.fulfill({ json: await prompts.open(id, message, undefined, new EventEmitter()) });
  });
  await page.route('**/api/remote/prompt-answer', async route => {
    const { id, proceed } = route.request().postDataJSON();
    prompts.decide(id, proceed);
    await route.fulfill({ json: { ok: true } });
  });
}
module.exports = { routeDashboardPrompts };
