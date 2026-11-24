const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const dashboard = path.join(__dirname, '../local-workflow-agent/dashboard');
    const pages = { '/': 'index.html', '/remote': 'remote.html', '/scanner': 'scanner.html', '/content': 'content.html' };
    let settings = { config: { minutes:30, requestsPerDay:80, minViews:500, minDays:0, maxDays:7,
      minResolution:720, minDurationSeconds:0, maxDurationSeconds:14400, subtitleKinds:['subtitles'], subtitleLanguages:['vi'] }, keywords:'[family]\ngia đình' };
    let submissions = 0;
    await page.route('http://workspace.test/**', async route => {
      const url = new URL(route.request().url()).pathname;
      if (url === '/api/scanner/settings') {
        if (route.request().method() === 'POST') {
          const { part, value } = route.request().postDataJSON();
          settings = { ...settings, [part]:value };
          submissions++;
        }
        return route.fulfill({ json:settings });
      }
      if (url === '/api/scanner/status') return route.fulfill({ json:{ rows:[], config:settings.config } });
      const file = pages[url] || ({ '/scanner.js':'scanner.js', '/remote.css':'remote.css' })[url];
      if (!file) return route.fulfill({ status:404 });
      // Other screens have dedicated behavior tests. Inspect their rendered layout here.
      if (pages[url] && url !== '/scanner') {
        const html = require('node:fs').readFileSync(path.join(dashboard,file),'utf8');
        return route.fulfill({ contentType:'text/html; charset=utf-8', body:html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'') });
      }
      return route.fulfill({ path:path.join(dashboard,file) });
    });
    for (const width of [320, 768, 1280]) {
      await page.setViewportSize({ width, height:844 });
      for (const url of Object.keys(pages)) {
        await page.goto('http://workspace.test' + url);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        assert(overflow <= 1, url + ' overflows by ' + overflow + 'px at ' + width);
        assert.equal(await page.locator('h1').count(),1);
        assert.equal(await page.locator('.site-links a[aria-current=page]').getAttribute('href'),url);
      }
    }
    await page.goto('http://workspace.test/scanner');
    await page.locator('#config button:enabled').waitFor();
    assert.equal(await page.locator('#config .editor-fields').evaluate(el => getComputedStyle(el).display),'grid');
    const columnCount = await page.locator('.scanner-thresholds').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
    assert(columnCount >= 2, 'desktop thresholds must use the available columns');
    await page.locator('#minViews').fill('1250');
    await page.locator('#config button').click();
    await page.locator('#configNote').getByText(/Đã lưu/).waitFor();
    await page.locator('#keywords').fill('[test]\nâm nhạc');
    await page.locator('#keywordForm button').click();
    await page.locator('#keywordNote').getByText(/Đã lưu/).waitFor();
    await page.reload();
    await page.locator('#config button:enabled').waitFor();
    assert.equal(await page.locator('#minViews').inputValue(),'1250');
    assert.equal(await page.locator('#keywords').inputValue(),'[test]\nâm nhạc');
    assert.equal(submissions,2);
    assert.deepEqual(errors,[]);
    console.log('Dashboard layout, navigation and hydrated scanner forms passed');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
