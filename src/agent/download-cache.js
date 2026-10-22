const { canonicalUrl } = require('./activity-store');
const { validateVideo } = require('./video-download');

function createCachedDownloader(store, downloadVideo) {
  const locks = new Map();
  return async function download(step, signal) {
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
      if (cached) return cached;
      const result = await downloadVideo(step, combined);
      combined.throwIfAborted();
      if (result.verified !== true || !result.filePath) throw new Error('Download must finish final-file verification before continuing');
      const file = await store.registerFile(result.filePath, { duration: result.duration, tag: step.folderTag || 'automation', signal: combined });
      const saved = store.rememberDownload(key, result, file);
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
