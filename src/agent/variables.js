const reference = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

function resolveVariables(scenario) {
  const variables = scenario.variables ?? {};
  if (!variables || typeof variables !== 'object' || Array.isArray(variables)) throw new Error('variables must be an object');
  for (const [name, value] of Object.entries(variables)) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) throw new Error(`Invalid variable name: ${name}`);
    if (!['string', 'number', 'boolean'].includes(typeof value) || (typeof value === 'number' && !Number.isFinite(value))) throw new Error(`Invalid variable value: ${name}`);
  }
  const resolved = new Map();
  function variable(name, stack) {
    if (!Object.hasOwn(variables, name)) throw new Error(`Unknown variable: ${name}`);
    if (stack.includes(name)) throw new Error(`Circular variable: ${[...stack, name].join(' -> ')}`);
    if (!resolved.has(name)) resolved.set(name, expand(variables[name], [...stack, name]));
    return resolved.get(name);
  }
  function expand(value, stack = []) {
    if (typeof value === 'string') {
      const exact = value.match(/^\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}$/);
      if (exact) return variable(exact[1], stack);
      return value.replace(reference, (_, name) => String(variable(name, stack)));
    }
    if (Array.isArray(value)) return value.map(item => expand(item, stack));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, expand(item, stack)]));
    return value;
  }
  for (const name of Object.keys(variables)) variable(name, []);
  return { ...structuredClone(scenario), steps: expand(scenario.steps), variables: Object.fromEntries(resolved) };
}

module.exports = { resolveVariables };
