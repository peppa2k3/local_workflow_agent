import {execFile as execFileCallback} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {cpus, freemem, totalmem, uptime} from 'node:os';
import {promisify} from 'node:util';

const execFile = promisify(execFileCallback);
const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

function safeCounter(value) {
  const counter = BigInt(value);
  if (counter < 0n || counter > MAX_SAFE_BIGINT) throw new Error('Invalid network counter');
  return Number(counter);
}

export function parseLinuxNetworkCounters(text) {
  let received = 0n;
  let sent = 0n;

  for (const line of text.split(/\r?\n/)) {
    const separator = line.indexOf(':');
    if (separator < 0) continue;

    const name = line.slice(0, separator).trim();
    if (!name || name === 'lo') continue;
    const fields = line.slice(separator + 1).trim().split(/\s+/);
    if (fields.length < 9 || !/^\d+$/.test(fields[0]) || !/^\d+$/.test(fields[8])) {
      throw new Error('Invalid /proc/net/dev data');
    }
    received += BigInt(fields[0]);
    sent += BigInt(fields[8]);
  }

  return {receivedBytes: safeCounter(received), sentBytes: safeCounter(sent)};
}

export function parseWindowsNetworkCounters(text) {
  const result = JSON.parse(text);
  if (!result || !Number.isSafeInteger(result.receivedBytes) || result.receivedBytes < 0 ||
      !Number.isSafeInteger(result.sentBytes) || result.sentBytes < 0) {
    throw new Error('Invalid Windows network counter data');
  }
  return result;
}

async function readNetworkCounters(platform) {
  if (platform === 'linux') {
    return parseLinuxNetworkCounters(await readFile('/proc/net/dev', 'utf8'));
  }
  if (platform === 'win32') {
    const command = '$ErrorActionPreference = "Stop"; $s = @(Get-NetAdapterStatistics -ErrorAction Stop); $r = ($s | Measure-Object -Property ReceivedBytes -Sum).Sum; $t = ($s | Measure-Object -Property SentBytes -Sum).Sum; [pscustomobject]@{receivedBytes=[long]$r;sentBytes=[long]$t} | ConvertTo-Json -Compress';
    const {stdout} = await execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
      windowsHide: true,
      timeout: 10000,
      maxBuffer: 8192,
    });
    return parseWindowsNetworkCounters(stdout.trim());
  }
  throw new Error('Network counters are supported on Windows and Linux');
}

export function parseStatusIntervalSeconds(value = process.env.STATUS_INTERVAL_SECONDS) {
  if (value === undefined || value === '') return 10;
  if (!/^\d+$/.test(String(value))) throw new Error('STATUS_INTERVAL_SECONDS must be an integer from 5 to 60');
  const seconds = Number(value);
  if (!Number.isInteger(seconds) || seconds < 5 || seconds > 60) {
    throw new Error('STATUS_INTERVAL_SECONDS must be an integer from 5 to 60');
  }
  return seconds;
}

function cpuPercent(before, after) {
  const cores = Math.min(before.length, after.length);
  let totalDelta = 0;
  let idleDelta = 0;

  for (let i = 0; i < cores; i++) {
    const oldTimes = before[i].times;
    const newTimes = after[i].times;
    const oldTotal = Object.values(oldTimes).reduce((sum, value) => sum + value, 0);
    const newTotal = Object.values(newTimes).reduce((sum, value) => sum + value, 0);
    const delta = newTotal - oldTotal;
    const idle = newTimes.idle - oldTimes.idle;
    if (delta > 0 && idle >= 0) {
      totalDelta += delta;
      idleDelta += idle;
    }
  }

  if (totalDelta <= 0) return null;
  return Math.round(Math.max(0, Math.min(100, (1 - idleDelta / totalDelta) * 100)) * 10) / 10;
}

function snapshotCpus() {
  return cpus().map(({times}) => ({times: {...times}}));
}

export function createStatusSampler({
  platform = process.platform,
  readCounters = () => readNetworkCounters(platform),
  readCpus = snapshotCpus,
  readTotalMemory = totalmem,
  readFreeMemory = freemem,
  readUptime = uptime,
  now = Date.now,
  maxSampleGapMs = 120000,
} = {}) {
  let previous = null;

  return {
    reset() {
      previous = null;
    },
    async sample() {
      const [network, cpu, totalBytes, freeBytes] = await Promise.all([
        readCounters(),
        Promise.resolve(readCpus()),
        Promise.resolve(readTotalMemory()),
        Promise.resolve(readFreeMemory()),
      ]);
      const current = {network, cpu, totalBytes, freeBytes, uptimeSeconds: Math.floor(readUptime()), at: now()};
      if (!Number.isSafeInteger(totalBytes) || totalBytes <= 0 || !Number.isSafeInteger(freeBytes) ||
          freeBytes < 0 || freeBytes > totalBytes || !Number.isSafeInteger(current.uptimeSeconds) ||
          current.uptimeSeconds < 0) {
        throw new Error('Invalid system memory or uptime data');
      }

      const old = previous;
      previous = current;
      const elapsedMs = old ? current.at - old.at : 0;
      if (!old || elapsedMs <= 0 || elapsedMs > maxSampleGapMs) return null;

      const usage = cpuPercent(old.cpu, current.cpu);
      if (usage === null) return null;
      const seconds = elapsedMs / 1000;
      const receivedDelta = Math.max(0, current.network.receivedBytes - old.network.receivedBytes);
      const sentDelta = Math.max(0, current.network.sentBytes - old.network.sentBytes);

      return {
        cpuPercent: usage,
        ramUsedBytes: totalBytes - freeBytes,
        ramTotalBytes: totalBytes,
        networkRxBytesPerSecond: Math.round(receivedDelta / seconds),
        networkTxBytesPerSecond: Math.round(sentDelta / seconds),
        uptimeSeconds: current.uptimeSeconds,
      };
    },
  };
}
