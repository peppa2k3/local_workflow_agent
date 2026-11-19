const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { resolveVariables, hasRuntime } = require('./variables');

const prefix = 'clip:';
const isClip = value => typeof value === 'string' && value.startsWith(prefix);
const isVideoName = name => typeof name === 'string' && name.length <= 255 &&
  !/[\\/:\u0000-\u001f]/.test(name) && /\.(mp4|m4v|mov|webm|mkv|avi|mpeg|mpg|ts|wmv|3gp|flv)$/i.test(name);

function clipFile(directory, name) {
  if (!path.isAbsolute(directory || '') || !isVideoName(name)) throw new Error('Chọn clip trong thư mục lưu trữ có đường dẫn tuyệt đối.');
  const root = fs.realpathSync(directory);
  const file = path.join(root, name);
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || !stat.size) throw new Error('Clip phải là file video đã lưu và có dữ liệu.');
  return file;
}

function uploadFolders(steps) {
  let directory;
  return steps.map(step => {
    if (step.action === 'downloadVideo') directory = step.directory;
    return step.action === 'upload' ? step.folder || directory : undefined;
  });
}

function clipTargets(scenario) {
  const { steps, variables } = resolveVariables(scenario);
  const folders = uploadFolders(steps);
  return steps.flatMap((step, index) => {
    if (!['downloadVideo', 'upload'].includes(step.action)) return [];
    const directory = step.action === 'downloadVideo' ? step.directory : folders[index];
    if (typeof directory !== 'string' || !path.isAbsolute(directory) || hasRuntime(directory)) return [];
    const field = step.action === 'downloadVideo' ? 'url' : 'filePath';
    const variable = String(scenario.steps[index][field] || '').match(/^\{\{\s*([a-zA-Z_]\w*)\s*\}\}$/)?.[1];
    const id = createHash('sha256').update(JSON.stringify([index, step.action, directory, variable])).digest('hex');
    return [{ id, index, action: step.action, directory, variable: Object.hasOwn(variables, variable) ? variable : undefined }];
  });
}

async function listClips(directory, query = '') {
  if (!path.isAbsolute(directory || '')) throw new Error('Hãy cấu hình thư mục lưu trữ có đường dẫn tuyệt đối.');
  const root = await fs.promises.realpath(directory);
  const filter = query.normalize('NFC').toLowerCase();
  const candidates = (await fs.promises.readdir(root, { withFileTypes: true }))
    .filter(entry => entry.isFile() && isVideoName(entry.name) && entry.name.normalize('NFC').toLowerCase().includes(filter))
    .map(entry => entry.name).sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }));
  const names = [];
  for (const name of candidates) {
    const stat = await fs.promises.lstat(path.join(root, name)).catch(() => null);
    if (!stat?.isFile() || !stat.size) continue;
    if (names.length === 60) return { names, more: true };
    names.push(name);
  }
  return { names, more: false };
}

module.exports = { clipFile, clipTargets, isClip, isVideoName, listClips, prefix, uploadFolders };
