const fs = require('fs');
const path = require('path');

function parseProfiles(raw, defaultProfile) {
  const cache = raw ? JSON.parse(raw).profile?.info_cache || {} : {};
  const directories = new Set([defaultProfile, ...Object.keys(cache)]);
  return [...directories].filter(validProfile).map(directory => ({
    directory, name: cache[directory]?.name || directory
  }));
}

function listProfiles(userDataDir, defaultProfile) {
  try { return parseProfiles(fs.readFileSync(path.join(userDataDir, 'Local State'), 'utf8'), defaultProfile); }
  catch { return parseProfiles('', defaultProfile); }
}

function createProfileCache(userDataDir, defaultProfile, { ttlMs = 30000, readFile = (...args) => fs.promises.readFile(...args), now = Date.now } = {}) {
  let cached = parseProfiles('', defaultProfile), refreshedAt = -Infinity, pending;
  function refresh() {
    if (pending) return pending;
    pending = (async () => {
      try {
        const raw = await readFile(path.join(userDataDir, 'Local State'), 'utf8');
        cached = parseProfiles(raw, defaultProfile);
      } catch { /* Keep the last valid snapshot while Chrome rewrites its metadata. */ }
      finally { refreshedAt = now(); pending = null; }
      return cached;
    })();
    return pending;
  }
  function get() {
    if (now() - refreshedAt >= ttlMs) void refresh();
    return cached;
  }
  return { get, refresh, ready: refresh() };
}

function validProfile(value) {
  return typeof value === 'string' && /^(Default|Profile \d+)$/.test(value);
}

module.exports = { listProfiles, validProfile, createProfileCache };
