const path = require('node:path');
require('../src/env').loadProjectEnv();
const { dataDir } = require('../src/config');
const { createScanner } = require('../src/scanner/scanner');
async function main() {
  const urls = process.argv.slice(2);
  if (!urls.length) throw Error('Truyền một hoặc nhiều URL YouTube.');
  const scanner = createScanner({ directory: path.join(dataDir,'scanner') });
  try { console.log(JSON.stringify(await scanner.audit(urls),null,2)); }
  finally { await scanner.close(); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
