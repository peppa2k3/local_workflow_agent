const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { chooseFile, chooseFolder } = require('../src/agent/file-picker');

function fakeLaunch(output, code = 0) {
  return (command, args, options) => {
    assert.equal(command, 'powershell.exe');
    assert(args.includes('-STA'));
    assert.equal(options.windowsHide, true, 'hide PowerShell console while keeping the file dialog');
    assert.equal(args.at(-1), 'C:\\Uploads');
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdout.setEncoding = () => {};
    child.stderr.setEncoding = () => {};
    queueMicrotask(() => {
      child.stdout.emit('data', output);
      child.emit('close', code);
    });
    return child;
  };
}

(async () => {
  assert.equal(await chooseFile('C:\\Uploads', fakeLaunch('C:\\Uploads\\ảnh.jpg\n')), 'C:\\Uploads\\ảnh.jpg');
  assert.equal(await chooseFile('C:\\Uploads', fakeLaunch('')), null);
  assert.equal(await chooseFolder('C:\\Uploads', (command, args, options) => { assert(args.includes('-Folder')); return fakeLaunch('C:\\Videos\n')(command, args, options); }), 'C:\\Videos');
  console.log('Windows file picker selection and cancellation: OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
