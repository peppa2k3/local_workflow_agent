const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { createProfileCache } = require('../src/agent/profiles');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  let clock = 0, reads = 0, finishRead, failRead = false;
  const raw = JSON.stringify({ profile: { info_cache: { 'Profile 1': { name: 'One' } } } });
  const cache = createProfileCache('fixture', 'Default', { now: () => clock, ttlMs: 30000, readFile: async () => {
    reads++; if (failRead) throw new Error('Chrome writing metadata');
    if (reads > 1) await new Promise(resolve => { finishRead = resolve; });
    return raw;
  } });
  await cache.ready;
  for (let i = 0; i < 1000; i++) assert.equal(cache.get().length, 2);
  assert.equal(reads, 1, 'requests must read cached metadata without filesystem I/O');
  clock = 30000;
  for (let i = 0; i < 1000; i++) cache.get();
  assert.equal(reads, 2, 'expired parallel accesses must share one async refresh');
  finishRead(); await cache.refresh();
  clock = 60000; failRead = true; cache.get(); await cache.refresh();
  assert.equal(cache.get().length, 2, 'temporary metadata errors must preserve profile list');
  assert.equal(reads, 3);

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    const epoch = new Date('2026-10-21T00:00:00Z');
    await page.clock.install({ time: epoch }); await page.clock.pauseAt(epoch);
    let requests = 0, inFlight = 0, maxInFlight = 0, failed = false, connected = true, running = false, hold = false, release;
    await page.route('http://dashboard.test/**', async route => {
      const request = route.request(), endpoint = new URL(request.url()).pathname;
      if (endpoint === '/') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: fs.readFileSync(path.join(__dirname, '../dashboard/index.html'), 'utf8') });
      if (endpoint === '/api/profiles') {
        requests++; inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
        try {
          if (hold) await new Promise(resolve => { release = resolve; });
          if (failed) return await route.fulfill({ status: 503, json: { error: 'offline' } });
          return await route.fulfill({ json: { defaultProfile: 'Profile 1', capabilities: ['variables-v1', 'scenario-management-v1'], performance: { cpuPercent: 0, memoryMb: 40, eventLoopP95Ms: 0 }, profiles: [{ directory: 'Profile 1', name: 'Test', extensionConnected: connected, running, index: 0, total: 1 }] } });
        } finally { inFlight--; }
      }
      let data = {};
      if (endpoint === '/api/scenarios') data = { names: ['sample'] };
      if (endpoint === '/api/scenarios/sample' && request.method() === 'GET') data = { name: 'Sample', steps: [{ action: 'openUrl', url: 'https://example.test/' }] };
      if (endpoint === '/api/run') running = true;
      if (endpoint === '/api/stop') running = false;
      return route.fulfill({ json: data });
    });
    await page.addInitScript(() => {
      const original = window.fetch;
      window.profilesActive = 0; window.maxProfilesActive = 0;
      window.fetch = (...args) => {
        if (args[0] !== '/api/profiles') return original(...args);
        profilesActive++; maxProfilesActive = Math.max(maxProfilesActive, profilesActive);
        return original(...args).finally(() => { profilesActive--; });
      };
    });
    await page.goto('http://dashboard.test');
    async function settle() {
      for (let i = 0; i < 200; i++) {
        if (await page.evaluate(() => !statusPending && !editorBusy && !profilesRequest)) return;
        await sleep(10);
      }
      throw new Error('Dashboard did not settle');
    }
    async function tick(ms) { await page.clock.runFor(ms); await settle(); }
    await settle();
    assert.equal(requests, 1, 'one startup profile request');
    await page.evaluate(() => {
      window.mutations = 0;
      const observer = new MutationObserver(records => { mutations += records.length; });
      for (const id of ['automationStatus', 'profilesSummary', 'connectionText', 'progress', 'performance', 'steps']) observer.observe(document.getElementById(id), { childList: true, characterData: true, subtree: true });
    });
    await tick(9999); assert.equal(requests, 1);
    await tick(1);
    for (let i = 0; i < 5; i++) await tick(10000);
    assert.equal(requests, 7, 'idle: six refreshes per minute instead of forty');
    assert.equal(await page.evaluate(() => mutations), 0, 'unchanged status must not rewrite DOM or editor');
    await page.locator('#scenarioName').fill('Typing without interruption');
    await page.locator('#profileSelect').focus();
    await page.evaluate(() => { window.savedOption = document.querySelector('#profileSelect option'); });
    connected = false;
    await page.evaluate(() => { void updateStatus(); }); await settle();
    assert(await page.evaluate(() => document.activeElement.id === 'profileSelect' && document.querySelector('#profileSelect option') === savedOption));
    await page.locator('#scenarioName').focus();
    await page.evaluate(() => { void updateStatus(); }); await settle();
    assert(await page.evaluate(() => document.querySelector('#profileSelect option') === savedOption), 'profile options are updated in place');
    assert.equal(await page.locator('#scenarioName').inputValue(), 'Typing without interruption');

    await page.evaluate(() => {
      window.fakeHidden = true;
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => fakeHidden });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const beforeHidden = requests; await tick(60000);
    assert.equal(requests, beforeHidden, 'hidden tabs must not poll');
    connected = true;
    await page.evaluate(() => { fakeHidden = false; document.dispatchEvent(new Event('visibilitychange')); });
    await settle(); assert.equal(requests, beforeHidden + 1, 'returning to tab refreshes immediately');

    hold = true;
    await page.evaluate(() => { void updateStatus(); void fetchProfiles(); void fetchProfiles(); document.getElementById('runBtn').click(); });
    for (let i = 0; !release && i < 100; i++) await sleep(10);
    assert(release);
    const duringSlow = requests;
    await page.clock.runFor(5000);
    assert.equal(requests, duringSlow, 'slow requests and Run preflight must share one request');
    hold = false; release(); await settle();
    assert.equal(await page.evaluate(() => maxProfilesActive), 1);
    const beforeActive = requests;
    await tick(1500); await tick(1500);
    assert.equal(requests, beforeActive + 2, 'running workflows keep responsive polling');
    await page.evaluate(() => document.getElementById('stopBtn').click()); await settle();
    await page.evaluate(() => { void updateStatus(); }); await settle();
    failed = true;
    await page.evaluate(() => { void updateStatus(); }); await settle();
    const beforeRetry = requests;
    await tick(4999); assert.equal(requests, beforeRetry);
    await tick(1); assert.equal(requests, beforeRetry + 1);
    await tick(9999); assert.equal(requests, beforeRetry + 1);
    await tick(1); assert.equal(requests, beforeRetry + 2, 'offline retries back off rather than hammering agent');
    failed = false;
    await page.evaluate(() => { void updateStatus(); }); await settle();
    assert.equal(await page.locator('#runBtn').isEnabled(), true);
    console.log('Dashboard: idle 40\u21926 polls/min, hidden 0, single in-flight, Run coalescing, backoff, focus/DOM stability; async profile cache: OK');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
