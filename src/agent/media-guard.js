const path = require('node:path');
const { canonicalUrl } = require('./activity-store');
const { casefold } = require('./casefold');

// Serialize media checks through acknowledgement so two local profiles cannot pass
// the same preflight before the first operation is recorded.
function createMediaGuard({ activity, mongo }) {
  let tail = Promise.resolve();
  async function acquire(signal) {
    const previous = tail;
    let release;
    const held = new Promise(resolve => { release = resolve; });
    tail = previous.then(() => held);
    let abort;
    try {
      signal.throwIfAborted();
      await Promise.race([previous, new Promise((_, reject) => {
        abort = () => reject(new Error('Đã hủy thao tác media đang chờ'));
        signal.addEventListener('abort', abort, { once: true });
      })]);
      signal.throwIfAborted(); return release;
    } catch (error) { release(); throw error; }
    finally { if (abort) signal.removeEventListener('abort', abort); }
  }
  const fold = value => casefold(String(value || '').replaceAll('\\', '/').normalize('NFC'));
  const exact = value => ({ $regex: `^${String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' });
  async function duplicates(step, file) {
    const download = step.action === 'downloadVideo';
    const key = download ? canonicalUrl(step.url) : fold(step.filePath);
    const name = download ? '' : fold(path.basename(step.filePath));
    const matches = [];
    if (download) {
      if (activity.data.downloads[key]) matches.push({ source: 'local', url: key });
    } else {
      const files = Object.values(activity.data.file_instances).filter(row => fold(row.path) === key || fold(row.name) === name || row.sha256 === file.asset_id);
      const ids = new Set([file.asset_id, ...files.map(row => row.sha256)]);
      for (const row of Object.values(activity.data.upload_events)) if (ids.has(row.asset_id) || fold(row.file_path) === key || fold(row.file_name) === name) matches.push({ source: 'local', page: row.page_url, time: row.uploaded_at || row.attempted_at, state: row.state });
      for (const row of Object.values(activity.data.publications)) if (ids.has(row.asset_id)) matches.push({ source: 'local', pageId: row.page_id });
    }
    if (mongo.status().enabled) await mongo.request(async db => {
      if (download) {
        const row = await db.collection('downloads').findOne({ source_url: key }, { projection: { _id: 1 }, maxTimeMS: 5000 });
        if (row) matches.push({ source: 'mongodb', url: key });
      } else {
        const rows = await db.collection('file_instances').find({ $or: [{ path: exact(step.filePath) }, { name: exact(path.basename(step.filePath)) }, { sha256: file.asset_id }] }, { projection: { sha256: 1 }, maxTimeMS: 5000 }).toArray();
        const ids = [...new Set([file.asset_id, ...rows.map(row => row.sha256).filter(Boolean)])];
        for (const collection of ['upload_events', 'publications']) {
          const row = await db.collection(collection).findOne({ $or: [{ asset_id: { $in: ids } }, { file_path: exact(step.filePath) }, { file_name: exact(path.basename(step.filePath)) }] }, { projection: { page_id: 1, page_url: 1, uploaded_at: 1, state: 1 }, maxTimeMS: 5000 });
          if (row) matches.push({ source: 'mongodb', page: row.page_url, pageId: row.page_id, time: row.uploaded_at });
        }
      }
    });
    return matches.slice(0, 10);
  }
  async function check(step, file, context) {
    const release = await acquire(context.signal);
    try {
      const matches = await duplicates(step, file);
      context.signal.throwIfAborted();
      if (matches.length) await context.confirm({ kind: 'duplicate', message: step.action === 'downloadVideo'
        ? `URL đã được tải: ${step.url}\nTiếp tục để dùng file cache đã xác minh; nếu file không còn hợp lệ, tác vụ sẽ tải lại.`
        : `File đã được upload hoặc đã có lần thử chưa rõ kết quả (trùng đường dẫn, tên hoặc SHA-256): ${step.filePath}\nBạn có chắc muốn upload thêm lần nữa?`, matches });
      context.signal.throwIfAborted();
      return release;
    } catch (error) { release(); throw error; }
  }
  return { check };
}
module.exports = { createMediaGuard };
