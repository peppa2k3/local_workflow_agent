const path = require('path');
const { spawn } = require('child_process');

function chooseFile(initialDirectory = '', launch = spawn) {
  if (process.platform !== 'win32') return Promise.reject(new Error('File picker requires Windows'));
  const script = path.join(__dirname, 'file-picker.ps1');
  return new Promise((resolve, reject) => {
    const child = launch('powershell.exe', [
      '-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', script,
      '-InitialDirectory', initialDirectory
    ], { windowsHide: false });
    let output = '';
    let errors = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { errors += chunk; });
    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0) reject(new Error(errors.trim() || 'Could not open file picker'));
      else resolve(output.trim() || null);
    });
  });
}

module.exports = { chooseFile };
