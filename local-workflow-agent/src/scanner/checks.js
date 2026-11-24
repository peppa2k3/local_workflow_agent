const normalize = text => text.normalize('NFC').toLocaleLowerCase('vi').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const stop = new Set('và của một là thì mà các những này đó trong với cho khi tập phần full phim'.split(' '));
function topicsFrom(text) {
  const topics = new Map();
  let phrases;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^\uFEFF/, '').trim();
    if (!line || line.startsWith('#')) continue;
    const header = /^\[([a-z0-9_-]{1,64})\]$/.exec(line);
    if (header) {
      if (!topics.has(header[1])) topics.set(header[1], new Set());
      phrases = topics.get(header[1]);
      continue;
    }
    if (!phrases || line.startsWith('[')) throw Error('Cần mã nhóm dạng [gia-dinh].');
    const words = normalize(line).split(' ');
    if (words.length <= 5) {
      if (words.some(word => word && !stop.has(word))) phrases.add(words.join(' '));
    } else {
      for (let i = 1; i < words.length; i++) {
        if (!stop.has(words[i - 1]) && !stop.has(words[i])) phrases.add(words.slice(i - 1, i + 1).join(' '));
      }
    }
  }
  return [...topics].map(([code, terms]) => ({ code, phrases: [...terms].filter(Boolean) })).filter(t => t.phrases.length);
}
function youtubeId(value) {
  if (typeof value !== 'string') return null;
  if (/^[\w-]{11}$/.test(value)) return value;
  try {
    const u = new URL(value);
    if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) return null;
    let id;
    if (u.hostname === 'youtu.be') id = u.pathname.slice(1);
    if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(u.hostname)) {
      id = u.pathname === '/watch' ? u.searchParams.get('v') : /^\/(?:shorts|embed)\/([\w-]{11})$/.exec(u.pathname)?.[1];
    }
    return typeof id === 'string' && /^[\w-]{11}$/.test(id) ? id : null;
  } catch { return null; }
}
function check(value, reason) {
  return { status: value == null ? 'unknown' : value ? 'pass' : 'reject', reason };
}
function evaluate(input, topics, cfg, info, measured = new Date(), extraChecks = {}) {
  const { id, title, views, published } = input;
  const matches = topics.map(t => ({ code: t.code, phrases: t.phrases.filter(p => (' ' + normalize(title || '') + ' ').includes(' ' + p + ' ')) }))
    .filter(t => t.phrases.length).sort((a, b) => b.phrases.length - a.phrases.length || a.code.localeCompare(b.code));
  const age = (measured - Date.parse(published)) / 86400000;
  const checks = {
    id: check(Boolean(youtubeId(id)) && id === youtubeId(id), String(id)),
    keyword: check(title && topics.length ? matches.length > 0 : null, matches.length ? JSON.stringify(matches) : title && topics.length ? 'Không khớp cụm từ' : 'Thiếu tiêu đề hoặc từ khóa'),
    views: check(Number.isSafeInteger(views) && cfg.minViews != null ? views >= cfg.minViews : null, String(views ?? 'Thiếu view') + ' / min ' + cfg.minViews),
    age: check(Number.isFinite(age) && cfg.minDays != null && cfg.maxDays != null ? age >= cfg.minDays && age <= cfg.maxDays : null,
      (Number.isFinite(age) ? age.toFixed(2) : '?') + ' ngày / ' + cfg.minDays + '–' + cfg.maxDays)
  };
  const preflight = Object.values(checks).every(c => c.status === 'pass');
  const formats = info?.formats?.filter(f => !f.has_drm && f.url && f.protocol !== 'mhtml');
  const vietnamese = formats?.filter(f => /^vi(?:-|$)/i.test(f.language || '') && f.acodec && f.acodec !== 'none');
  const audioOnly = vietnamese?.some(f => f.vcodec === 'none');
  const videos = formats?.filter(f => f.vcodec && f.vcodec !== 'none' && (vietnamese.includes(f) || audioOnly && f.acodec === 'none'));
  const ranked = videos?.filter(f => [f.width, f.height].every(n => Number.isSafeInteger(n) && n > 0))
    .sort((a,b) => Math.min(b.width,b.height) - Math.min(a.width,a.height)) || [];
  const minimum = cfg.resolution;
  const qualified = ranked.find(({ width, height }) =>
    Math.min(width, height) >= cfg.minResolution && (!minimum || width >= minimum.width && height >= minimum.height));
  const best = qualified || ranked[0];
  const resolution = best ? { width: best.width, height: best.height } : null;
  const duration = info?.duration;
  const langs = new Set();
  for (const kind of cfg.subtitleKinds) {
    for (const [lang, tracks] of Object.entries(info?.[kind] || {})) {
      if (tracks.some(t => t.url && !/[?&]tlang=/.test(t.url))) langs.add(lang);
    }
  }
  const skipped = input.error || (preflight ? 'Thiếu metadata yt-dlp' : 'Chưa qua bộ lọc ban đầu');
  const { minDurationSeconds = 0, maxDurationSeconds = 14400 } = cfg;
  checks.duration = check(Number.isFinite(duration)
    ? duration > 0 && duration >= minDurationSeconds && duration < maxDurationSeconds : null,
    Number.isFinite(duration) ? duration + ' giây / từ ' + minDurationSeconds + ' đến dưới ' + maxDurationSeconds + ' giây' : skipped);
  checks.audio = check(vietnamese?.length ? true : formats?.some(f => f.acodec !== 'none' && !f.language) || !formats?.length ? null : false,
    vietnamese?.length ? 'Có track tiếng Việt' : info ? 'Không xác minh được track tiếng Việt' : skipped);
  const minimumLabel = (minimum ? minimum.width + ' × ' + minimum.height + ' px, ' : '') + 'cạnh ngắn ' + cfg.minResolution + ' px';
  checks.resolution = check(resolution ? Boolean(qualified) : null,
    resolution ? resolution.width + ' × ' + resolution.height + ' px / tối thiểu ' + minimumLabel : skipped);
  const subtitleMatch = cfg.subtitleLanguages.some(l => [...langs].some(k => k === l || k.startsWith(l + '-')));
  const subtitleData = cfg.subtitleKinds.every(kind => info?.[kind] && typeof info[kind] === 'object');
  checks.subtitles = check(subtitleMatch ? true : subtitleData ? false : null,
    info ? [...langs].join(', ') || (subtitleData ? 'Không có phụ đề phù hợp' : 'Thiếu danh sách phụ đề') : skipped);
  for (const [name, fn] of Object.entries(extraChecks)) checks[name] = fn(input, info);
  const statuses = Object.values(checks).map(c => c.status);
  return { verdict: statuses.includes('reject') ? 'reject' : statuses.every(s => s === 'pass') ? 'pass' : 'unknown', preflight,
    payload: { platform: 'youtube', video_id: id, video_url: 'https://www.youtube.com/watch?v=' + id, title: title || null,
      type_topic: matches[0]?.code || null, matched_phrases: matches[0]?.phrases || [], view_count: views ?? null, published_at: published || null, measured_at: measured.toISOString(),
      duration_seconds: duration ?? null, resolution, subtitle_languages: [...langs], checks } };
}
module.exports = { topicsFrom, youtubeId, evaluate };
