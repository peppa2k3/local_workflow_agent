function collectPrompts(dashboardRequests, profiles, workflows, policy, exchange) {
  const candidates = [...dashboardRequests];
  for (const { directory: profile } of profiles) {
    const run = workflows.status(profile), issue = run.confirmation;
    if (!run.running || !issue || !policy.scenarios.includes(run.scenario)) continue;
    candidates.push({ runId: run.executionId, profile, scenario: run.scenario, id: issue.id,
      step: issue.step, message: String(issue.message || 'Xác nhận tiếp tục?').slice(0, 2048),
      name: issue.name?.slice(0, 255), filePath: issue.filePath?.slice(0, 1024),
      duplicate: Boolean(issue.matches?.length), expiresAt: issue.expiresAt });
  }
  const prompts = [];
  let available = 126000 - Buffer.byteLength(JSON.stringify(exchange));
  for (const prompt of candidates) {
    const bytes = Buffer.byteLength(JSON.stringify(prompt)) + 1;
    if (bytes > available) continue;
    prompts.push(prompt);
    available -= bytes;
  }
  return prompts;
}

function applyDecisions(decisions, prompts, workflows, policy, dashboardPrompts) {
  for (const decision of decisions || []) {
    const prompt = prompts.find(p => p.id === decision.id && p.runId === decision.runId);
    if (!prompt || typeof decision.proceed !== 'boolean') continue;
    if (prompt.kind === 'dashboard') {
      dashboardPrompts.decide(prompt.id, decision.proceed);
      continue;
    }
    const run = workflows.status(prompt.profile);
    if (run.executionId === prompt.runId && run.confirmation?.id === prompt.id &&
        policy.profiles.includes(prompt.profile) && policy.scenarios.includes(prompt.scenario))
      workflows.resolveConfirmation(prompt.profile, prompt.runId, prompt.id, decision.proceed, 'remote');
  }
}
module.exports = { collectPrompts, applyDecisions };
