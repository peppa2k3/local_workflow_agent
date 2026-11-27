const fs = require('fs');
const path = require('path');
const { validProfile } = require('../integrations/chrome/profiles');
const { validateVideo } = require('../integrations/video/video-download');
const { resolveVariables, hasRuntime, resolveRuntime } = require('./variables');
const { validateUploadMetadata } = require('../storage/activity-store');
const { clipFile, isClip, prefix, uploadFolders } = require('./clip-library');

const supportedActions = ['downloadVideo', 'openUrl', 'openFolder', 'wait', 'waitFor', 'click', 'type', 'setDate', 'setTime', 'scroll', 'upload', 'closeTab'];

const completionStages = ['uploaded', 'processed', 'published'];

// Timeouts for one step. Defaults match the values the extension and content script already used.
function stepTimeouts(step) {
  const findMs = step.timeoutMs || 10000, navigationMs = step.navigationTimeoutMs ?? 30000;
  const completionMs = step.completion ? Number(step.completion.timeoutMs) || navigationMs : 0;
  return { findMs, navigationMs, completionMs };
}
function stepRetry(step) {
  const retry = step.retry && typeof step.retry === 'object' ? step.retry : {};
  return { attempts: Math.min(5, Math.max(0, Math.trunc(Number(retry.attempts)) || 0)), delayMs: Math.min(60000, Math.max(0, Number(retry.delayMs ?? 1000) || 0)) };
}
// Single source of truth for how long the agent waits for the extension. The extension receives it as
// `budgetMs` and stops itself 10 s earlier, so the two layers cannot disagree about the deadline.
function stepBudget(step) {
  const { findMs, navigationMs, completionMs } = stepTimeouts(step);
  const { attempts, delayMs } = stepRetry(step);
  const perAttempt = findMs * 3 + navigationMs * 2 + (step.waitAfterMs || 0) + 2500 +
    (step.times || 1) * (step.intervalMs || 2500) + completionMs;
  return perAttempt * (attempts + 1) + delayMs * attempts + 30000;
}

function validateStep(step, uploadPath = '') {
  const warnings = [];
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
  if (step.onError !== undefined && !['stop', 'continue'].includes(step.onError)) throw new Error('Invalid onError (stop | continue)');
  if (step.retry !== undefined) {
    if (!step.retry || typeof step.retry !== 'object' || Array.isArray(step.retry)) throw new Error('retry must be an object { attempts, delayMs }');
    for (const [key, max] of [['attempts', 5], ['delayMs', 60000]]) {
      if (typeof step.retry[key] === 'string' && step.retry[key].trim() !== '') step.retry[key] = Number(step.retry[key]);
      const value = step.retry[key];
      if (value !== undefined && (!Number.isFinite(value) || value < 0 || value > max || (key === 'attempts' && !Number.isInteger(value)))) throw new Error(`Invalid retry.${key} (0–${max})`);
    }
  }
  if (step.completion !== undefined) {
    if (!step.completion || typeof step.completion !== 'object' || Array.isArray(step.completion)) throw new Error('completion must be an object');
    const completion = step.completion;
    if (step.uploadStep !== undefined && (!Number.isInteger(step.uploadStep) || step.uploadStep < 1 || !completion.stage)) throw new Error('uploadStep requires a positive step number and completion.stage');
    if (completion.state === 'appearedThenHidden' && step.action !== 'upload') throw new Error('appearedThenHidden requires upload');
    if (completion.state && !['visible', 'hidden', 'enabled', 'appearedThenHidden'].includes(completion.state)) throw new Error('Invalid completion state');
    if (typeof completion.timeoutMs === 'string' && completion.timeoutMs.trim() !== '') completion.timeoutMs = Number(completion.timeoutMs);
    // Unlike other waits (max 5 min), a completion wait may cover a large upload: up to 1 hour.
    if (completion.timeoutMs !== undefined && (!Number.isFinite(completion.timeoutMs) || completion.timeoutMs < 1000 || completion.timeoutMs > 3600000)) throw new Error('completion.timeoutMs must be 1000–3600000');
    if (completion.stage !== undefined && !completionStages.includes(completion.stage)) throw new Error(`completion.stage must be one of: ${completionStages.join(', ')}`);
    // The dashboard may leave an unfinished condition with only type/state. Old scenarios keep running
    // without it, but the step now says so. A condition that uses the new fields must be complete.
    if (!String(completion.locator || '').trim() && !String(completion.selector || '').trim()) {
      if (completion.timeoutMs !== undefined || completion.stage !== undefined || completion.state === 'appearedThenHidden') throw new Error('completion có timeoutMs/stage nhưng thiếu locator');
      warnings.push('completion chưa có locator nên bị bỏ qua: bước chỉ hoàn tất theo hành động, không chờ điều kiện.');
      delete step.completion;
    }
  }
  // A click can succeed while its button remains and video/progress keeps the
  // page mutating. Navigation and explicit result conditions still wait below.
  if (step.action === 'click' && step.settleMs === undefined) step.settleMs = 0;
  const finish = () => { if (warnings.length) step.warnings = warnings; else delete step.warnings; return step; };
  if (step.action !== 'upload') return finish();
  if (!step.completion) warnings.push('Upload chưa có completion: chỉ xác nhận đã chọn file, chưa xác nhận tải lên/xử lý/đăng. Thêm điều kiện chờ (ví dụ nút Đăng sẵn sàng) để bước chỉ hoàn tất khi website báo xong.');
  validateUploadMetadata(step);
  const inputPath = isClip(step.filePath) ? clipFile(step.folder, step.filePath.slice(prefix.length)) : uploadPath || step.filePath ||
    (step.folder && step.filename ? path.join(step.folder, step.filename) : '');
  if (!inputPath) throw new Error('Upload step needs a file path, folder + filename, or a run-time upload path');
  const resolved = path.resolve(inputPath);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) throw new Error(`Upload file does not exist: ${resolved}`);
  step.filePath = resolved;
  return finish();
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
    stepBudget, stepTimeouts, stepRetry,
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

module.exports = { scenarioProfile, assignmentConfig, createScenarioStore, stepBudget, stepTimeouts, stepRetry, completionStages };
