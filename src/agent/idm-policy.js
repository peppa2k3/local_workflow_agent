function selectQuality(options, preferred = 1080) {
  const allowed = preferred === 720 ? [720] : [1080, 720];
  const candidates = options.map(option => {
    const text = String(option.label || '');
    const height = text.match(/\b(1080|720)\s*(?:p|px|[iI])?\b/i)?.[1] || text.match(/\b\d{3,4}\s*[x×]\s*(1080|720)\b/i)?.[1];
    return { ...option, height: Number(height), video: !/\baudio\s+only\b|\b(?:mp3|m4a|aac)\b/i.test(text) && !(/\baudio\b/i.test(text) && !/\bvideo\b/i.test(text)) };
  }).filter(option => option.video && allowed.includes(option.height));
  candidates.sort((a, b) => allowed.indexOf(a.height) - allowed.indexOf(b.height) || Number(/\bmp4\b/i.test(b.label)) - Number(/\bmp4\b/i.test(a.label)));
  if (!candidates.length) throw new Error(`IDM không có ${allowed.map(value => `${value}p`).join(' hoặc ')}. Chọn chất lượng trong player rồi chạy lại.`);
  return candidates[0];
}

module.exports = { selectQuality };
