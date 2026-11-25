const fs = require('fs');
const path = require('path');
const { validProfile } = require('../integrations/chrome/profiles');
const { validateVideo } = require('../integrations/video/video-download');
const { resolveVariables, hasRuntime, resolveRuntime } = require('./variables');
const { validateUploadMetadata } = require('../storage/activity-store');
const { clipFile, isClip, prefix, uploadFolders } = require('./clip-library');

const supportedActions = ['downloadVideo', 'openUrl', 'openFolder', 'wait', 'waitFor', 'click', 'type', 'setDate', 'setTime', 'scroll', 'upload', 'closeTab'];

function validateStep(step, uploadPath = '') {
  if (!supportedActions.includes(step.action)) throw new Error(`Unsupported action: ${step.action}`);
  for (const key of ['url', 'path', 'text', 'locator', 'selector', 'role', 'filePath', 'folder', 'filename', 'value', 'format']) {
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
  if (step.index !== undefined && !Number.isInteger(step.index)) throw new Error('index must be a nonnegative integer (0-based)');
  if (step.action === 'setDate') {
    const value = String(step.value ?? '');
    const date = new Date(`${value}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('setDate requires a valid YYYY-MM-DD value');
  }
  if (step.action === 'setTime' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(step.value ?? ''))) throw new Error('setTime requires HH:mm (00:00–23:59)');
  if (step.action === 'downloadVideo') {
    validateVideo(step);
    if (!step.directory) throw new Error('Video download requires directory');
    if (isClip(step.url)) clipFile(step.directory, step.url.slice(prefix.length));
  }
  if (step.action === 'openUrl') {
    const url = new URL(step.url);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('openUrl requires http or https');
  }
  if (step.completion?.state && !['visible', 'hidden', 'enabled'].includes(step.completion.state)) throw new Error('Invalid completion state');
  // The dashboard may leave an unfinished condition with only type/state.
  // It is not a result condition until a locator is provided.
  if (step.completion && !String(step.completion.locator || '').trim() && !String(step.completion.selector || '').trim()) delete step.completion;
  // A click can succeed while its button remains and video/progress keeps the
  // page mutating. Navigation and explicit result conditions still wait below.
  if (step.action === 'click' && step.settleMs === undefined) step.settleMs = 0;
  if (step.action !== 'upload') return step;
  validateUploadMetadata(step);
  const inputPath = isClip(step.filePath) ? clipFile(step.folder, step.filePath.slice(prefix.length)) : uploadPath || step.filePath ||
    (step.folder && step.filename ? path.join(step.folder, step.filename) : '');
  if (!inputPath) throw new Error('Upload step needs a file path, folder + filename, or a run-time upload path');
  const resolved = path.resolve(inputPath);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) throw new Error(`Upload file does not exist: ${resolved}`);
  step.filePath = resolved;
  return step;
}

function scenarioProfile(scenario, fallback) {
  const profile = scenario.profile;
  if (profile === undefined || profile === '') return fallback;
  if (!validProfile(profile)) throw new Error('Profile của kịch bản phải là tên thư mục Chrome hợp lệ.');
  return profile;
}

function assignmentConfig(scenario) {
  if (scenario.scenario_id !== undefined && (typeof scenario.scenario_id !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(scenario.scenario_id)))
    throw Error('ID kịch bản phải gồm 1–64 ký tự a-z, 0-9, dấu gạch ngang hoặc gạch dưới.');
  const topics = scenario.accepted_topics ?? [];
  const priority = scenario.assignment_priority ?? 0;
  if (!Array.isArray(topics) || topics.length > 64 || !Number.isSafeInteger(priority))
    throw Error('Cấu hình topic hoặc ưu tiên giao job không hợp lệ.');
  const normalized = topics.map(t => typeof t === 'string' ? t.trim().toLowerCase() : '');
  if (normalized.some(t => !/^[a-z0-9_-]{1,64}$/.test(t))) throw Error('Mã topic chỉ gồm a-z, 0-9, _ và -.');
  return { topics: [...new Set(normalized)], priority };
}

function createScenarioStore(scenariosDir) {
  function file(name) {
    if (typeof name !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(name)) throw new Error('Invalid scenario filename');
    return path.join(scenariosDir, `${name}.json`);
  }

  return {
    file,
    rename(source, destination, updateReferences) {
      const oldFile = file(source), newFile = file(destination);
      if (source === destination) throw new Error('Nhập tên file khác tên hiện tại.');
      try {
        fs.linkSync(oldFile, newFile);
      } catch (error) {
        if (error.code === 'EEXIST') throw Object.assign(new Error('Tên file kịch bản đã tồn tại.'), { status: 409 });
        throw error;
      }
      // Keep both names available until the schedules have been saved.
      try {
        updateReferences(source, destination);
      } catch (error) {
        fs.unlinkSync(newFile);
        throw error;
      }
      fs.unlinkSync(oldFile);
    },
    remove: name => fs.unlinkSync(file(name)),
    prepareStep: (step, uploadPath = '', runtime = {}) => {
      // Runtime file references must keep the downloaded clip even if a legacy run upload override is present.
      const dynamicFile = hasRuntime({ filePath: step.filePath, folder: step.folder, filename: step.filename });
      const resolved = validateStep(resolveRuntime(structuredClone(step), runtime), dynamicFile ? '' : uploadPath);
      if (dynamicFile && step.action === 'upload' && (/\.(part|ytdl|tmp)$/i.test(resolved.filePath) || !fs.statSync(resolved.filePath).size)) throw new Error('Downloaded upload file must be final and nonempty');
      return resolved;
    },
    list: () => fs.readdirSync(scenariosDir).filter(name => name.endsWith('.json')).map(name => name.slice(0, -5)),
    load: name => JSON.parse(fs.readFileSync(file(name), 'utf8')),
    save: (name, scenario) => {
      scenarioProfile(scenario);
      assignmentConfig(scenario);
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
      const folders = uploadFolders(prepared.steps);
      let downloaded = false, openTabs = 0;
      for (const [index, step] of prepared.steps.entries()) {
        if (step.action === 'upload' && isClip(step.filePath) && !step.folder && folders[index]) step.folder = folders[index];
        if (hasRuntime(step)) {
          if (!downloaded) throw new Error('Runtime download references require an earlier downloadVideo step');
          if (!supportedActions.includes(step.action)) throw new Error(`Unsupported action: ${step.action}`);
        } else validateStep(step.action === 'upload' && isClip(step.filePath) ? { ...step } : step, uploadPath);
        if (step.label !== undefined && typeof step.label !== 'string') throw new Error('Step label must be text');
        if (step.action === 'downloadVideo') downloaded = true;
        if (step.action === 'openUrl') openTabs++;
        if (step.action === 'closeTab') {
          if (openTabs === 0) throw new Error(`Bước ${index + 1}: Đóng tab cần một bước Mở URL chưa được đóng trước đó.`);
          openTabs--;
        }
      }
      return prepared;
    }
  };
}

module.exports = { scenarioProfile, assignmentConfig, createScenarioStore };
