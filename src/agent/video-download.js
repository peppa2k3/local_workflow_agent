const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const toolsDir = path.resolve(__dirname, '../../tools');
function binary(name, variable) {
  const local = path.join(toolsDir, `${name}.exe`);
  return process.env[variable] || (fs.existsSync(local) ? local : name);
}
function validateVideo(step) {
  const url = new URL(step.url);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Video URL requires http/https without credentials');
  if (step.directory !== undefined && (typeof step.directory !== 'string' || !step.directory.trim() || !path.isAbsolute(step.directory))) throw new Error('Video directory must be an absolute path');
  if (step.quality !== undefined && ![360, 480, 720, 1080, 1440, 2160].includes(Number(step.quality))) throw new Error('Invalid video quality');
  if (step.downloadTimeoutMs !== undefined && (!Number.isInteger(Number(step.downloadTimeoutMs)) || Number(step.downloadTimeoutMs) < 1000 || Number(step.downloadTimeoutMs) > 7200000)) throw new Error('Invalid downloadTimeoutMs (1000-7200000)');
}
function run(command, args, { signal, limit = 4 * 1024 * 1024, cwd } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Video operation cancelled or timed out'));
    const child = spawn(command, args, { windowsHide: true, shell: false, cwd });
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    let stdout = '', stderr = '', failure;
    const kill = () => {
      if (process.platform === 'win32' && child.pid) {
        const killer = spawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
        killer.on('error', () => child.kill());
      } else child.kill('SIGKILL');
    };
    const abort = () => { failure = new Error('Video operation cancelled or timed out'); kill(); };
    signal?.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', chunk => { stdout += chunk; if (stdout.length > limit && !failure) { failure = new Error('Video tool output too large'); kill(); } });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-8000); });
    child.on('error', error => { failure = new Error(`Cannot run ${path.basename(command)}: ${error.message}. Run npm run setup:video or set YTDLP_PATH / FFMPEG_PATH.`); });
    child.on('close', code => {
      signal?.removeEventListener('abort', abort);
      if (failure) reject(failure);
      else if (code !== 0) reject(new Error(`${path.basename(command)} failed (${code}): ${stderr}`));
      else resolve(stdout.trim());
    });
  });
}
const baseArgs = ['--js-runtimes', `node:${process.execPath}`, '--encoding', 'utf-8', '--ignore-config', '--no-playlist', '--no-progress', '--no-warnings', '--windows-filenames'];
async function metadata(url, signal) {
  const raw = await run(binary('yt-dlp', 'YTDLP_PATH'), [...baseArgs, '--skip-download', '--dump-single-json', '--', url], { signal });
  const info = JSON.parse(raw);
  if (!info.id || !info.title || info.entries || info.is_live) throw new Error('URL must resolve to one non-live video with a title and ID');
  return { id: String(info.id), title: String(info.title), url: info.webpage_url || url, duration: info.duration ?? null };
}
async function inspectVideo(url, signal) {
  validateVideo({ url });
  return metadata(url, AbortSignal.any([AbortSignal.timeout(60000), ...(signal ? [signal] : [])]));
}
async function downloadVideo(step, signal) {
  validateVideo(step);
  if (!step.directory) throw new Error('Video download requires directory');
  const combined = AbortSignal.any([AbortSignal.timeout(Number(step.downloadTimeoutMs || 1800000)), ...(signal ? [signal] : [])]);
  const ffmpeg = binary('ffmpeg', 'FFMPEG_PATH');
  await run(ffmpeg, ['-version'], { signal: combined });
  const info = await metadata(step.url, combined);
  const directory = path.resolve(step.directory);
  await fs.promises.mkdir(directory, { recursive: true });
  const height = Number(step.quality || 1080);
  const output = await run(binary('yt-dlp', 'YTDLP_PATH'), [...baseArgs,
    '--no-simulate', '--no-overwrites', ...(fs.existsSync(ffmpeg) ? ['--ffmpeg-location', ffmpeg] : []),
    '--format', `bv*[height<=?${height}]+ba/b[height<=?${height}]`,
    '--merge-output-format', 'mp4', '--paths', directory,
    '--output', '%(title).150B [%(id)s].%(ext)s',
    '--print', 'after_move:%(filepath)j', '--', step.url], { signal: combined });
  const filePath = path.resolve(JSON.parse(output));
  const relative = path.relative(directory, filePath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Downloaded path is outside selected directory');
  const stat = await fs.promises.stat(filePath);
  if (!stat.isFile() || !stat.size) throw new Error('Downloaded file is missing or empty');
  return { ...info, filePath, name: path.basename(filePath), bytes: stat.size };
}
module.exports = { validateVideo, inspectVideo, downloadVideo, run };
