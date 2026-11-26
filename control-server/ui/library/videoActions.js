export function applyVideoAction(api, recordId, operation) {
  if (operation === 'delete') {
    return api('/api/scanner/videos/delete', { record_id: recordId });
  }
  return api('/api/scanner/videos/status', { record_id: recordId, used: operation === 'used' });
}
