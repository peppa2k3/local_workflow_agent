const fs = require('fs');
const path = require('path');

function createScenarioStore(scenariosDir) {
  function file(name) {
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(name)) throw new Error('Invalid scenario filename');
    return path.join(scenariosDir, `${name}.json`);
  }

  return {
    file,
    list: () => fs.readdirSync(scenariosDir).filter(name => name.endsWith('.json')).map(name => name.slice(0, -5)),
    load: name => JSON.parse(fs.readFileSync(file(name), 'utf8')),
    save: (name, scenario) => {
      if (!Array.isArray(scenario.steps) || !scenario.steps.length) throw new Error('Add at least one step');
      fs.writeFileSync(file(name), JSON.stringify(scenario, null, 2) + '\n');
    },
    prepare: (scenario, uploadPath = '') => {
      if (!Array.isArray(scenario.steps) || !scenario.steps.length) {
        throw new Error('Scenario needs a nonempty steps array');
      }
      const prepared = structuredClone(scenario);
      for (const step of prepared.steps) {
        if (step.action !== 'upload') continue;
        const inputPath = uploadPath || step.filePath ||
          (step.folder && step.filename ? path.join(step.folder, step.filename) : '');
        if (!inputPath) throw new Error('Upload step needs a file path, folder + filename, or a run-time upload path');
        const resolved = path.resolve(inputPath);
        if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) throw new Error(`Upload file does not exist: ${resolved}`);
        step.filePath = resolved;
      }
      return prepared;
    }
  };
}

module.exports = { createScenarioStore };
