const { canonicalUrl } = require('./activity-store');
const { validateVideo, videoOptions } = require('../integrations/video/video-download');

function createCachedDownloader(store, downloadVideo) {
  const locks = new Map();
  return async function download(step, signal, { confirmDownload } = {}) {
    validateVideo(step);
    if (!step.directory) throw new Error('Video download requires directory');
    const combined = AbortSignal.any([AbortSignal.timeout(Number(step.downloadTimeoutMs || 1800000)), ...(signal ? [signal] : [])]);
    const key = canonicalUrl(step.url), previous = locks.get(key);
    let release;
    const lock = new Promise(resolve => { release = resolve; });
    locks.set(key, lock);
    try {
      if (previous) await new Promise((resolve, reject) => {
        const abort = () => reject(new Error('Video operation cancelled or timed out'));
        combined.addEventListener('abort', abort, { once: true });
        previous.then(() => { combined.removeEventListener('abort', abort); resolve(); });
        if (combined.aborted) abort();
      });
      combined.throwIfAborted();
      const cached = await store.cachedDownload(key, combined);
      const options = videoOptions(step);
      if (cached && cached.downloadOptions?.quality === options.quality && cached.downloadOptions?.language === options.language) {
        if (confirmDownload) {
          await confirmDownload({ name: cached.name, filePath: cached.filePath, reused: true });
          const verified = await store.cachedDownload(key, signal);
          if (verified?.filePath !== cached.filePath || verified.asset_id !== cached.asset_id) throw new Error('Cached video changed after confirmation');
        }
        return cached;
      }
      const operationSignal = confirmDownload ? signal : combined;
      const result = await downloadVideo(step, operationSignal, confirmDownload);
      operationSignal?.throwIfAborted();
      if (result.verified !== true || !result.filePath) throw new Error('Download must finish final-file verification before continuing');
      const file = await store.registerFile(result.filePath, { duration: result.duration, tag: step.folderTag || 'automation', signal: operationSignal });
      const saved = store.rememberDownload(key, { ...result, downloadOptions: options }, file);
      return { ...saved, reused: false };
    } finally {
      // Keep the chain intact if a queued waiter is cancelled before its predecessor.
      const unlock = () => {
        release();
        if (locks.get(key) === lock) locks.delete(key);
      };
      if (previous) void previous.then(unlock); else unlock();
    }
  };
}
module.exports = { createCachedDownloader };
