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
  if (step.quality !== undefined && step.quality !== 'best' && ![360, 480, 720, 1080, 1440, 2160].includes(Number(step.quality))) throw new Error('Invalid video quality');
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
// Prefer FPS first, then the short edge (portrait-safe), bitrate and codec.
// No resolution cap, including for legacy scenarios with a numeric quality field.
const selectionArgs = ['--format', 'bv*+ba/b', '--format-sort-force', '--format-sort', 'fps,res,vbr,abr,tbr,vcodec,acodec'];
async function publishVideo(source, directory) {
  const ext = path.extname(source), stem = path.basename(source, ext);
  for (let suffix = 1; suffix < 10000; suffix++) {
    const destination = path.join(directory, stem + (suffix === 1 ? '' : ' (' + suffix + ')') + ext);
    try {
      // Same filesystem: link publishes the complete file atomically and never overwrites.
      await fs.promises.link(source, destination);
      return destination;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }
  throw new Error('Too many files with the same video title');
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
  const staging = await fs.promises.mkdtemp(path.join(directory, '.video-download-'));
  try {
    const output = await run(binary('yt-dlp', 'YTDLP_PATH'), [...baseArgs,
      '--no-simulate', '--no-overwrites', ...(fs.existsSync(ffmpeg) ? ['--ffmpeg-location', ffmpeg] : []),
      ...selectionArgs,
      '--merge-output-format', 'mp4', '--paths', staging,
      '--output', '%(title).150B.%(ext)s',
      '--print', 'after_move:%(filepath)j', '--', step.url], { signal: combined });
    const stagedPath = path.resolve(JSON.parse(output));
    const relative = path.relative(staging, stagedPath);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Downloaded path is outside staging directory');
    const stat = await fs.promises.stat(stagedPath);
    if (!stat.isFile() || !stat.size) throw new Error('Downloaded file is missing or empty');
    if (/\.(part|ytdl|tmp)$/i.test(stagedPath)) throw new Error('Download did not produce a final media file');
    const siblingProbe = path.isAbsolute(ffmpeg) ? path.join(path.dirname(ffmpeg), process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe') : '';
    const probe = process.env.FFPROBE_PATH || (siblingProbe && fs.existsSync(siblingProbe) ? siblingProbe : binary('ffprobe', 'FFPROBE_PATH'));
    const media = JSON.parse(await run(probe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', stagedPath], { signal: combined }));
    const video = media.streams?.find(stream => stream.codec_type === 'video');
    const audio = media.streams?.find(stream => stream.codec_type === 'audio');
    if (!video || !(Number(media.format?.duration) > 0)) throw new Error('Downloaded file is not a complete readable video');
    if (combined.aborted) throw new Error('Video operation cancelled or timed out');
    const filePath = await publishVideo(stagedPath, directory);
    const [numerator, denominator = 1] = String(video.avg_frame_rate || '0/1').split('/').map(Number);
    return { ...info, duration: Number(media.format.duration), verified: true, filePath, name: path.basename(filePath), bytes: stat.size,
      width: video.width, height: video.height, fps: denominator ? numerator / denominator : 0,
      videoCodec: video.codec_name, audioCodec: audio?.codec_name || null, bitrate: Number(media.format?.bit_rate) || null };
  } finally {
    // Only remove the unique working directory created for this invocation.
    if (path.dirname(staging) !== directory || !path.basename(staging).startsWith('.video-download-')) throw new Error('Unexpected video staging directory');
    await fs.promises.rm(staging, { recursive: true, force: true });
  }
}
module.exports = { validateVideo, inspectVideo, downloadVideo, run, selectionArgs, publishVideo };
