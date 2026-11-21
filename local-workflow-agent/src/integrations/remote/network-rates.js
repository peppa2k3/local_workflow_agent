const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { performance } = require('node:perf_hooks');

const exec = promisify(execFile);
const script = `
[Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces() |
  Where-Object { $_.OperationalStatus -eq 'Up' -and $_.NetworkInterfaceType -ne 'Loopback' } |
  ForEach-Object {
    $stats = $_.GetIPStatistics()
    [pscustomobject]@{ id = $_.Id; received = $stats.BytesReceived; sent = $stats.BytesSent }
  } | ConvertTo-Json -Compress
`;

async function readCounters() {
  if (process.platform !== 'win32') return [];
  const { stdout } = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    windowsHide: true, timeout: 4000
  });
  const value = JSON.parse(stdout.trim() || '[]');
  return Array.isArray(value) ? value : [value];
}

function createNetworkRates(read = readCounters, now = () => performance.now()) {
  let previous, rates = {};
  return {
    get: () => rates,
    async sample() {
      try {
        const current = new Map((await read()).map(counter => [counter.id, counter]));
        const time = now(), seconds = (time - previous?.time) / 1000;
        let received = 0, sent = 0, matched = false;
        for (const [id, counter] of current) {
          const old = previous?.counters.get(id);
          if (!old || counter.received < old.received || counter.sent < old.sent) continue;
          received += counter.received - old.received;
          sent += counter.sent - old.sent;
          matched = true;
        }
        rates = matched && seconds > 0 ? { downloadMbps: received * 8 / seconds / 1e6, uploadMbps: sent * 8 / seconds / 1e6 } : {};
        previous = { time, counters: current };
      } catch {
        previous = undefined;
        rates = {};
      }
    }
  };
}
module.exports = { createNetworkRates };
