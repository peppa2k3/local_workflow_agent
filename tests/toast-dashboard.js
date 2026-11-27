const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.route('https://toast.test/**', route => {
      const pathname = new URL(route.request().url()).pathname;
      const file = { '/': 'index.html', '/remote': 'remote.html' }[pathname];
      if (!file) return route.fulfill({ status: 404 });
      let html = fs.readFileSync(path.join(__dirname, '../local-workflow-agent/dashboard', file), 'utf8');
      html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, script => script.includes('local-dashboard.toasts.v1') ? script : '');
      return route.fulfill({ contentType: 'text/html', body: html });
    });
    await page.goto('https://toast.test/');
    await page.evaluate(() => window.toast.success('Đầu tiên'));
    await page.waitForTimeout(1200);
    await page.evaluate(() => window.toast.error('Thứ hai'));
    assert.deepEqual(await page.locator('.toast').allTextContents(), ['Đầu tiên', 'Thứ hai']);
    const oldTop = await page.locator('.toast-error').evaluate(el => el.getBoundingClientRect().top);
    await page.getByRole('link', { name: 'Remote Control' }).click();
    assert.deepEqual(await page.locator('.toast').allTextContents(), ['Đầu tiên', 'Thứ hai']);
    await page.waitForFunction(() => document.querySelectorAll('.toast').length === 1, null, { timeout: 5000 });
    assert.deepEqual(await page.locator('.toast').allTextContents(), ['Thứ hai']);
    await page.waitForTimeout(250);
    assert((await page.locator('.toast-error').evaluate(el => el.getBoundingClientRect().top)) < oldTop);
    await page.waitForFunction(() => document.querySelectorAll('.toast').length === 0, null, { timeout: 2500 });
    console.log('Dashboard toast: ordering, independent expiry, upward movement and route persistence passed');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
