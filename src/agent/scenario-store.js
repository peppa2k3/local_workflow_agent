const fs = require('fs');
const path = require('path');
const { resolveVariables } = require('./variables');

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
    clone: (source, destination) => {
      const scenario = JSON.parse(fs.readFileSync(file(source), 'utf8'));
      scenario.name = `${scenario.name || source} (bản sao)`;
      fs.writeFileSync(file(destination), JSON.stringify(scenario, null, 2) + '\n', { flag: 'wx' });
      return scenario;
    },
    prepare: (scenario, uploadPath = '') => {
      if (!Array.isArray(scenario.steps) || !scenario.steps.length) {
        throw new Error('Scenario needs a nonempty steps array');
      }
      const prepared = resolveVariables(scenario);
      for (const step of prepared.steps) {
        if (!['openUrl', 'openFolder', 'wait', 'waitFor', 'click', 'type', 'setDate', 'setTime', 'scroll', 'upload', 'idmDownload'].includes(step.action)) throw new Error(`Unsupported action: ${step.action}`);
        for (const key of ['url', 'path', 'text', 'locator', 'selector', 'role', 'filePath', 'folder', 'filename', 'value', 'format', 'directory', 'playSelector']) {
          if (step[key] !== undefined) step[key] = String(step[key]);
        }
        for (const key of ['timeoutMs', 'navigationTimeoutMs', 'settleMs', 'waitAfterMs', 'ms', 'times', 'intervalMs', 'index', 'pixels']) {
          if (typeof step[key] === 'string' && step[key].trim() !== '') step[key] = Number(step[key]);
          if (key === 'pixels') {
            if (step[key] !== undefined && !Number.isFinite(step[key])) throw new Error(`Invalid ${key}`);
            continue;
          }
          if (step[key] !== undefined && (!Number.isFinite(step[key]) || step[key] < 0 || step[key] > 300000)) throw new Error(`Invalid ${key}`);
        }
        if (step.clear === 'true' || step.clear === 'false') step.clear = step.clear === 'true';
        if (step.action === 'setDate') {
          const value = String(step.value ?? '');
          const date = new Date(`${value}T00:00:00Z`);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('setDate requires a valid YYYY-MM-DD value');
        }
        if (step.action === 'setTime' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(step.value ?? ''))) throw new Error('setTime requires HH:mm (00:00–23:59)');
        if (['openUrl', 'idmDownload'].includes(step.action)) {
          const url = new URL(step.url);
          if (!['http:', 'https:'].includes(url.protocol)) throw new Error('openUrl requires http or https');
        }
        if (step.action === 'idmDownload') {
          if (!step.directory?.trim() || !path.isAbsolute(step.directory)) throw new Error('IDM cần thư mục lưu tuyệt đối, ví dụ D:\\Videos');
          step.directory = path.resolve(step.directory);
          if (step.filename && (/[<>:"/\\|?*\x00-\x1f]/.test(step.filename) || /[. ]$/.test(step.filename) || /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(step.filename) || step.filename.length > 255)) throw new Error('Invalid IDM filename');
          step.quality = Number(step.quality ?? 1080);
          if (![1080, 720].includes(step.quality)) throw new Error('IDM quality must be 1080 or 720');
          step.timeoutMs ??= 120000;
          step.downloadTimeoutMs = Number(step.downloadTimeoutMs ?? 1800000);
          if (step.timeoutMs < 1000 || !Number.isFinite(step.downloadTimeoutMs) || step.downloadTimeoutMs < 1000 || step.downloadTimeoutMs > 86400000) throw new Error('Invalid IDM timeout');
          if (step.playVideo === 'true' || step.playVideo === 'false') step.playVideo = step.playVideo === 'true';
          if (step.playVideo !== undefined && typeof step.playVideo !== 'boolean') throw new Error('Invalid IDM playVideo');
        }
        if (step.completion?.state && !['visible', 'hidden', 'enabled'].includes(step.completion.state)) throw new Error('Invalid completion state');
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
