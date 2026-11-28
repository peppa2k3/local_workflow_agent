const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ timezoneId: 'Asia/Bangkok' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const dashboard = path.join(__dirname, '../local-workflow-agent/dashboard');
    const ids = Array.from({ length: 7 }, (_, index) => 'abcdefghij' + index);
    const checks = {
      id: { status: 'pass', reason: 'Hợp lệ' },
      views: { status: 'reject', reason: '120 / min 200' },
      age: { status: 'pass', reason: '0.50 ngày / 0–7' }
    };
    let rows = ids.map((id, index) => ({
      video_id: id, title: 'Video ' + index, video_url: 'https://www.youtube.com/watch?v=' + id,
      platform: 'youtube', status: index === 0 ? 'pending' : index === 1 ? 'reject' : 'synced',
      review: null, type_topic: 'gia-dinh', view_count: 120, duration_seconds: 185,
      published_at: '2026-11-26T00:00:00.000Z', measured_at: '2026-11-26T12:00:00.000Z', checks
    }));
    Object.assign(rows[1], { video_url: null, duration_seconds: null, view_count: -1, published_at: '2026-02-30T00:00:00.000Z', measured_at: null });
    Object.assign(rows[2], { published_at: '2026-11-27T00:00:00.000Z' });
    Object.assign(rows[3], { published_at: '2026-11-26T12:00:00.000Z' });
    rows[2].checks = { ...checks, views: { status: 'pass', reason: 'Đạt' } };
    Object.assign(rows[4], { published_at: '2026-11-24T12:00:00.000Z', view_count: 0 });
    Object.assign(rows[5], { published_at: '2026-11-19T12:00:00.000Z', view_count: 1 });
    rows[4].title = 'Tiêu đề rất dài ' + 'không có khoảng trắng'.repeat(12);
    const requests = [];
    const settings = { config: { minutes: 30, requestsPerDay: 80, minViews: 100, minDays: 0, maxDays: 7,
      minResolution: 720, minDurationSeconds: 0, maxDurationSeconds: 14400, subtitleKinds: ['subtitles'], subtitleLanguages: ['vi'] },
      keywords: '[family]\ngia đình' };
    await page.route('https://i.ytimg.com/**', route => {
      if (route.request().url().includes(ids[1])) return route.abort();
      return route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aZkAAAAASUVORK5CYII=', 'base64') });
    });
    await page.route('https://www.youtube.com/**', route => route.fulfill({ contentType: 'text/html', body: 'Video nguồn' }));
    await page.route('https://scanner.test/**', async route => {
      const request = route.request();
      const url = new URL(request.url()).pathname;
      if (url === '/api/scanner/settings') return route.fulfill({ json: settings });
      if (url === '/api/scanner/status') return route.fulfill({ json: { rows, config: settings.config } });
      if (url === '/api/scanner/export') return route.fulfill({ json: rows.filter(row => row.status === 'synced') });
      if (url === '/api/scanner/results') {
        const data = request.postDataJSON();
        requests.push(data);
        if (data.operation === 'delete') rows = rows.filter(row => !data.ids.includes(row.video_id));
        else rows = rows.map(row => data.ids.includes(row.video_id) ? { ...row, review: data.operation === 'auto' ? null : data.operation } : row);
        return route.fulfill({ json: { rows, changed: data.ids.length } });
      }
      const file = { '/scanner': 'scanner.html', '/scanner.js': 'scanner.js', '/remote.css': 'remote.css' }[url];
      if (file) return route.fulfill({ path: path.join(dashboard, file) });
      return route.fulfill({ status: 404 });
    });
    await require('./helpers/dashboard-prompts').routeDashboardPrompts(page);
    await page.goto('https://scanner.test/scanner');
    const cards = page.locator('.scanner-video-card');
    await cards.first().waitFor();
    assert.equal(await cards.count(), 5);
    const first = cards.nth(0);
    assert.equal(await first.locator('.scanner-open-video').getAttribute('href'), rows[0].video_url);
    assert.equal(await first.locator('.scanner-thumbnail').getAttribute('target'), '_blank');
    assert.equal(await first.locator('.scanner-open-video').getAttribute('target'), '_blank');
    for (const selector of ['.scanner-thumbnail', '.scanner-open-video']) {
      const popupPromise = page.waitForEvent('popup');
      await first.locator(selector).click();
      const popup = await popupPromise;
      await popup.waitForLoadState();
      assert.equal(popup.url(), rows[0].video_url);
      await popup.close();
    }
    assert.match(await first.textContent(), /Thời lượng: 3:05/);
    assert.match(await first.textContent(), /Lượt xem: 120/);
    assert.match(await first.textContent(), /Tuổi khi quét: 12 giờ/);
    assert.match(await first.textContent(), /Ngày đăng: 26\/11\/2026/);
    assert.match(await first.textContent(), /Lượt xem\/ngày ước tính tại lần quét: 240 \(theo 12 giờ thực tế\)/);
    assert.match(await first.textContent(), /Thời điểm quét: .*26\/11\/2026/);
    assert.equal(await first.locator('.scanner-card-badges').textContent(), 'ĐạtĐang chờ gửi');
    const missing = cards.nth(1);
    await missing.getByText('Không có ảnh thu nhỏ').waitFor();
    assert.equal(await missing.locator('.scanner-open-video').count(), 0);
    assert.match(await missing.textContent(), /Không có URL video/);
    for (const label of ['Thời lượng', 'Lượt xem', 'Tuổi khi quét', 'Ngày đăng', 'Lượt xem/ngày ước tính tại lần quét', 'Thời điểm quét'])
      assert((await missing.locator('.scanner-card-metadata').textContent()).includes(label + ': —'));
    assert.match(await cards.nth(2).textContent(), /Tuổi khi quét: —/);
    assert.match(await cards.nth(3).textContent(), /Lượt xem\/ngày ước tính tại lần quét: —/);
    assert.match(await cards.nth(4).textContent(), /Tuổi khi quét: 2 ngày/);
    assert.match(await cards.nth(4).textContent(), /Lượt xem\/ngày ước tính tại lần quét: 0/);

    await first.locator('summary').click();
    assert.match(await first.textContent(), /Lượt xem · Không đạt · 120 \/ min 200/);
    assert(await first.getByRole('button', { name: 'Copy JSON' }).isVisible());
    assert(await missing.locator('details').isHidden() === false);
    await missing.locator('summary').click();
    assert(await missing.getByRole('button', { name: 'Copy URL' }).isDisabled());
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'horizontal overflow at ' + width);
      if (width === 390 && process.env.SCANNER_CARD_MOBILE_SCREENSHOT)
        await page.locator('.scanner-results').screenshot({ path: process.env.SCANNER_CARD_MOBILE_SCREENSHOT });
    }
    if (process.env.SCANNER_CARD_SCREENSHOT) {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.locator('.scanner-results').screenshot({ path: process.env.SCANNER_CARD_SCREENSHOT });
    }

    await page.locator('#resultQuery').fill('Video 1');
    assert.equal(await cards.count(), 1);
    await page.locator('#resultQuery').fill('');
    await page.locator('#filter').selectOption('reject');
    assert.equal(await cards.count(), 1);
    await page.locator('#filter').selectOption('all');
    await page.locator('.scanner-check-filters summary').click();
    await page.locator('#checkFilters label').filter({ hasText: 'Lượt xem' }).locator('select').selectOption('reject');
    assert.equal(await page.locator('#activeChecks').textContent(), '1');
    assert.match(await page.locator('#pageInfo').textContent(), /6 kết quả/);
    await page.locator('#clearChecks').click();
    await page.locator('#selectPage').check();
    assert.equal(await page.locator('#selectionCount').textContent(), 'Đã chọn 5');
    await page.locator('#nextPage').click();
    assert.equal(await cards.count(), 2);
    assert.match(await cards.first().textContent(), /Lượt xem\/ngày ước tính tại lần quét: 0,14/);
    await cards.first().locator('.scanner-row-select').check();
    assert.equal(await page.locator('#selectionCount').textContent(), 'Đã chọn 6');
    await page.locator('#bulkOperation').selectOption('reject');
    await page.locator('#applyBulk').click();
    await page.getByText('Đã cập nhật 6 kết quả.', { exact: true }).first().waitFor();
    assert.deepEqual(requests[0], { ids: ids.slice(0, 6), operation: 'reject' });
    await page.locator('#prevPage').click();
    const reviewed = cards.first();
    assert.match(await reviewed.textContent(), /Thủ công · Không đạt/);
    await reviewed.locator('summary').click();
    await reviewed.locator('.scanner-review-editor select').selectOption('auto');
    await reviewed.getByRole('button', { name: 'Lưu đánh giá' }).click();
    await page.waitForFunction(() => !document.querySelector('.scanner-video-card')?.querySelector('.scanner-review'));
    assert.deepEqual(requests[1], { ids: [ids[0]], operation: 'auto' });
    await cards.first().getByRole('button', { name: 'Xóa kết quả' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Yes', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.scanner-video-card h3')?.textContent === 'Video 1');
    assert.deepEqual(requests[2], { ids: [ids[0]], operation: 'delete' });
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#export').click();
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), 'scanner-videos.json');
    const chunks = [];
    for await (const chunk of await download.createReadStream()) chunks.push(chunk);
    assert.deepEqual(JSON.parse(Buffer.concat(chunks).toString()), rows.filter(row => row.status === 'synced'));
    assert.deepEqual(errors, []);
    console.log('Scanner cards: metadata, empty values, filters, pagination, selection, review, deletion and JSON export passed');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
