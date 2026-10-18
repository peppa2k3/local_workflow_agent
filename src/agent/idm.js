const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { selectQuality } = require('./idm-policy');

function createIdm({ launch = spawn, platform = process.platform, idmPath = '' } = {}) {
  let busy = false;
  async function download({ marker, directory, filename, quality = 1080, timeoutMs = 120000, downloadTimeoutMs = 1800000 }, signal, onProgress = () => {}) {
    if (platform !== 'win32') throw new Error('IDM cần Windows desktop đang mở khóa');
    if (busy) throw new Error('IDM đang phục vụ kịch bản khác');
    if (signal?.aborted) throw new Error('Stopped');
    if (!/^Workflow-IDM-[a-f0-9-]{36}$/.test(marker)) throw new Error('Invalid IDM window marker');
    const folder = path.resolve(directory);
    fs.mkdirSync(folder, { recursive: true });
    if (!fs.statSync(folder).isDirectory()) throw new Error('IDM download directory must be a folder');
    if (filename && fs.existsSync(path.join(folder, filename))) throw new Error('File đích đã tồn tại. Đổi filename; agent không ghi đè.');
    busy = true;
    try {
      return await new Promise((resolve, reject) => {
        let child, settled = false, buffer = '', errors = '', selected = null;
        const finish = (error, result) => {
          if (settled) return;
          settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
          child?.stdin.end(); child?.kill();
          if (error) reject(error); else resolve(result);
        };
        const abort = () => finish(new Error('Stopped; IDM có thể tiếp tục tải nếu đã bấm Start Download'));
        const timer = setTimeout(() => finish(new Error('IDM download timed out')), timeoutMs + downloadTimeoutMs + 10000);
        try {
          child = launch('powershell.exe', ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'idm-ui.ps1')], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
          signal?.addEventListener('abort', abort, { once: true });
          if (signal?.aborted) { abort(); return; }
          child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
          child.stderr.on('data', chunk => { errors = (errors + chunk).slice(-4000); });
          child.on('error', error => finish(error));
          child.stdin.on('error', error => { if (!settled) finish(error); });
          child.on('close', code => { if (!settled) finish(new Error(errors.trim() || `IDM helper exited before completion (${code})`)); });
          child.stdout.on('data', chunk => {
            buffer += chunk;
            if (buffer.length > 1000000) return finish(new Error('IDM helper output too large'));
            while (buffer.includes('\n') && !settled) {
              const index = buffer.indexOf('\n'); const line = buffer.slice(0, index).trim(); buffer = buffer.slice(index + 1);
              if (!line) continue;
              try {
                const event = JSON.parse(line);
                if (event.event === 'progress') onProgress(String(event.message || ''));
                else if (event.event === 'qualities') {
                  selected = selectQuality(event.options, Number(quality));
                  child.stdin.write(JSON.stringify({ choice: selected.id }) + '\n');
                } else if (event.event === 'error') finish(new Error(event.message || 'IDM UI failed'));
                else if (event.event === 'complete') {
                  const resolved = path.resolve(event.filePath || '');
                  if (!selected || path.dirname(resolved).toLowerCase() !== folder.toLowerCase() || (filename && path.basename(resolved).toLowerCase() !== filename.toLowerCase()) || !fs.existsSync(resolved) || !fs.statSync(resolved).isFile() || fs.statSync(resolved).size === 0) throw new Error('IDM did not produce a completed file in the requested directory');
                  finish(null, { filePath: resolved, quality: selected.height });
                }
              } catch (error) { finish(error); }
            }
          });
          child.stdin.write(JSON.stringify({ marker, directory: folder, filename: filename || '', timeoutMs, downloadTimeoutMs, idmPath }) + '\n');
        } catch (error) { finish(error); }
      });
    } finally { busy = false; }
  }
  return { download, isBusy: () => busy };
}

module.exports = { createIdm };
