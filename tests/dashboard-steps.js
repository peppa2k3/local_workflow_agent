const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
    const scenario = { name: 'Compact fixture', steps: [
      { action: 'openUrl', label: 'Mở trang', url: 'https://example.test' },
      { action: 'click', label: 'Chọn video', selector: '#video' },
      { action: 'wait', label: 'Đợi tải', ms: 1000 }
    ] };
    let saved;
    await page.route('http://dashboard.test/**', route => {
      const request = route.request(), endpoint = new URL(request.url()).pathname;
      if (endpoint === '/') return route.fulfill({ contentType: 'text/html', body: fs.readFileSync(path.join(__dirname, '../local-workflow-agent/dashboard/index.html'), 'utf8') });
      if (endpoint === '/api/profiles') return route.fulfill({ json: { defaultProfile: 'Default', capabilities: ['variables-v1', 'scenario-management-v1'], profiles: [{ directory: 'Default', name: 'Fixture', extensionConnected: true, running: false }] } });
      if (endpoint === '/api/scenarios') return route.fulfill({ json: { names: ['compact'] } });
      if (endpoint === '/api/scenarios/compact') {
        if (request.method() === 'PUT') { saved = request.postDataJSON(); return route.fulfill({ json: { ok: true } }); }
        return route.fulfill({ json: scenario });
      }
      return route.fulfill({ json: {} });
    });
    await page.goto('http://dashboard.test/');
    await page.locator('.step').nth(2).waitFor();
    const cards = page.locator('.step');
    assert.equal(await cards.count(), 3);
    assert.deepEqual(await cards.locator('.step-title').allTextContents(), ['Mở trang', 'Chọn video', 'Đợi tải']);
    for (let i = 0; i < 3; i++) {
      assert.equal(await cards.nth(i).locator('.step-body').isVisible(), false);
      assert.equal(await cards.nth(i).locator('.step-toggle').getAttribute('aria-expanded'), 'false');
      assert((await cards.nth(i).boundingBox()).height < 70, 'collapsed step should occupy a single row on desktop');
    }
    assert.equal(await cards.nth(1).locator('.step-head select').inputValue(), 'click');
    assert.equal(await cards.nth(1).getByRole('button', { name: 'Lên bước 2' }).isVisible(), true);
    assert.equal(await cards.nth(1).getByRole('button', { name: 'Xuống bước 2' }).isVisible(), true);
    assert.equal(await cards.nth(1).getByRole('button', { name: 'Xóa bước 2' }).isVisible(), true);
    const screenshotDir = path.join(__dirname, '../test-results'); fs.mkdirSync(screenshotDir, { recursive: true });
    await page.screenshot({ path: path.join(screenshotDir, 'dashboard-steps-desktop.png'), fullPage: true });

    await cards.nth(1).getByRole('button', { name: 'Mở chi tiết bước 2' }).click();
    assert.equal(await cards.nth(1).locator('.step-body').isVisible(), true);
    assert.equal(await cards.nth(1).getByLabel('DOM ổn định sau click (ms, mặc định 0)', {exact: true}).inputValue(), '');
    assert(await cards.nth(1).getByText('Nút có thể vẫn hiển thị sau khi click.', {exact: false}).isVisible());
    await cards.nth(1).getByRole('textbox', { name: 'Tên bước (tùy chọn)' }).fill('Chọn clip');
    assert.equal(await cards.nth(1).locator('.step-title').textContent(), 'Chọn clip');
    await cards.nth(1).getByRole('button', { name: 'Lên bước 2' }).click();
    assert.equal(await cards.nth(0).locator('.step-title').textContent(), 'Chọn clip');
    assert.equal(await cards.nth(0).locator('.step-body').isVisible(), true, 'expanded state follows the step when moved');
    await cards.nth(0).locator('.step-head select').selectOption('type');
    assert.equal(await cards.nth(0).locator('.step-body').isVisible(), true, 'changing action keeps the editor open');
    await cards.nth(0).getByRole('button', { name: 'Thu chi tiết bước 1' }).click();
    assert.equal(await cards.nth(0).locator('.step-body').isVisible(), false);
    await page.locator('#saveBtn').click();
    assert.equal(saved.steps.length, 3);
    assert.equal(saved.steps[0].action, 'type');
    assert.equal(saved.steps[1].action, 'openUrl');
    assert.equal(saved.steps[2].action, 'wait');
    assert.equal(Object.hasOwn(saved.steps[0], 'expanded'), false, 'view state must stay outside scenario JSON');

    await page.locator('#addBtn').click();
    assert.equal(await cards.count(), 4);
    assert.equal(await cards.nth(3).locator('.step-body').isVisible(), true, 'new step opens for editing');
    await cards.nth(1).getByRole('button', { name: 'Xóa bước 2' }).click();
    assert.equal(await cards.count(), 3);
    assert.equal(await cards.nth(2).locator('.step-body').isVisible(), true, 'other step state survives delete');

    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 800 });
      for (const card of await cards.all()) {
        const box = await card.boundingBox();
        assert(box.x >= 0 && box.x + box.width <= width, 'step card fits mobile viewport');
        assert.equal(await card.locator('.step-controls').isVisible(), true);
      }
    }
    await page.setViewportSize({ width: 390, height: 800 });
    await cards.nth(2).getByRole('button', { name: 'Thu chi tiết bước 3' }).click();
    await page.screenshot({ path: path.join(screenshotDir, 'dashboard-steps-mobile.png'), fullPage: true });
    console.log('Dashboard steps: compact rows, accessible expand/collapse, move/edit/delete, JSON isolation and mobile layout passed');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
