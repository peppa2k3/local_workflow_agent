function createLocalTasks({ schedules, workflows }) {
  const allowed = (policy, profile, scenario) => policy.profiles.includes(profile) && policy.scenarios.includes(scenario);
  function snapshot(policy) {
    const tasks = policy.profiles.flatMap(profile => {
      const state = workflows.status(profile);
      if (!state.running || !allowed(policy, profile, state.scenario) || state.remote) return [];
      return [{ id: state.executionId, profile, scenario: state.scenario, state: 'running',
        index: state.index, total: state.total, startedAt: workflows.session(profile).startedAt }];
    });
    for (const task of schedules.list()) {
      if (allowed(policy, task.profile, task.scenario) && ['scheduled', 'confirming'].includes(task.state)) {
        const { id, profile, scenario, state, scheduledAt, confirmBy } = task;
        tasks.push({ id, profile, scenario, state, scheduledAt, confirmBy });
      }
    }
    return tasks;
  }
  function manage({ taskId, profile, scenario, action, scheduledAt, expectedTime }, policy) {
    if (!allowed(policy, profile, scenario)) throw Error('Local policy changed');
    if (action === 'stop') {
      const state = workflows.status(profile);
      if (!state.running || state.remote || state.executionId !== taskId || state.scenario !== scenario) throw Error('Run changed');
      workflows.stopRun(taskId);
      return;
    }
    const task = schedules.list().find(task => task.id === taskId);
    if (!task || task.profile !== profile || task.scenario !== scenario || task.scheduledAt !== expectedTime) throw Error('Schedule changed');
    if (action === 'reschedule') schedules.reschedule(taskId, scheduledAt);
    else if (action === 'cancel' || action === 'confirm') schedules.decide(taskId, action === 'confirm');
    else throw Error('Invalid action');
  }
  return { snapshot, manage };
}
module.exports = { createLocalTasks };
