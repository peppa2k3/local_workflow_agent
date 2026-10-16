const fs = require('fs');
const path = require('path');

function listProfiles(userDataDir, defaultProfile) {
  let cache = {};
  try {
    cache = JSON.parse(fs.readFileSync(path.join(userDataDir, 'Local State'), 'utf8')).profile?.info_cache || {};
  } catch { /* Chrome may not have created Local State yet. */ }
  const directories = new Set([defaultProfile, ...Object.keys(cache)]);
  return [...directories].filter(validProfile).map(directory => ({
    directory, name: cache[directory]?.name || directory
  }));
}

function validProfile(value) {
  return typeof value === 'string' && /^(Default|Profile \d+)$/.test(value);
}

module.exports = { listProfiles, validProfile };
