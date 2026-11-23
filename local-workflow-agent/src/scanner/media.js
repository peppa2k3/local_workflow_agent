const fs = require('node:fs/promises');
const path = require('node:path');
const { run, baseArgs, binary, probeVideo, publishVideo } = require('../integrations/video/video-download');

async function inspect(id, signal) {
  const raw = await run(binary('yt-dlp', 'YTDLP_PATH'), [...baseArgs, '--extractor-args', 'youtube:lang=vi', '--skip-download', '-J', '--', 'https://www.youtube.com/watch?v=' + id],
    { signal: AbortSignal.any([signal, AbortSignal.timeout(60000)]), limit: 24 * 1024 * 1024 });
  const info = JSON.parse(raw);
  if (info.id !== id || info.is_live || info.entries) throw Error('Không xác định được clip đơn đã công khai.');
  return info;
}

async function download(record, directory, signal, sourceArgs = ['--', record.video_url]) {
  const height = Math.min(record.resolution.width, record.resolution.height);
  const videoFilter = '[width>=' + height + '][height>=' + height + ']';
  const audioFilter = "[language~='(?i)^vi(?:-|$)']";
  const format = 'bv' + videoFilter + '+ba' + audioFilter + '/b' + videoFilter + audioFilter;
  // Use the checked Vietnamese topic/title, even if the extractor later localizes its title differently.
  const title = record.title || record.matched_phrases?.[0] || 'nội dung chọn lọc';
  const stem = Array.from(title.normalize('NFC').replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim())
    .slice(0, 100).join('').replace(/%/g, '%%');
  const ffmpeg = binary('ffmpeg', 'FFMPEG_PATH');
  await fs.mkdir(directory, { recursive: true });
  const staging = await fs.mkdtemp(path.join(directory, '.scan-'));
  try {
    const output = await run(binary('yt-dlp', 'YTDLP_PATH'), [...baseArgs, '-f', format, '--ffmpeg-location', ffmpeg,
      '--match-filter', 'id = ' + record.video_id + ' & duration > 0 & duration < 14400', '--merge-output-format', 'mp4',
      '-P', staging, '-o', 'Video tiếng Việt - ' + stem + ' [%(id)s].%(ext)s', '--print', 'after_move:%(filepath)j',
      '--no-simulate', ...sourceArgs], { signal });
    const actual = path.resolve(JSON.parse(output));
    if (path.dirname(actual) !== staging || !path.basename(actual).includes('[' + record.video_id + ']')) throw Error('Sai tên file sau hậu xử lý.');
    const media = await probeVideo(actual, ffmpeg, signal);
    if (!media.audioCodec || media.duration >= 14400 || Math.min(media.width, media.height) < height ||
        media.audioLanguage && !/^(vi|vie|und)(-|$)/i.test(media.audioLanguage)) throw Error('File tải về không đạt bộ lọc.');
    return await publishVideo(actual, directory);
  } finally { await fs.rm(staging, { recursive: true, force: true }); }
}
module.exports = { inspect, download };
