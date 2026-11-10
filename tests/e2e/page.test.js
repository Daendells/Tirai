const { test } = require('node:test');
const assert = require('node:assert/strict');
const { launch, copyExtension, openFixture, loadModules, waitForState, curtainInfo, shot } = require('./harness');
const { PAGE_JS } = require('../../extension/shared/files.js');
const fs = require('node:fs');

const until = async (fn, timeout = 3000) => {
  const deadline = Date.now() + timeout;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() >= deadline) throw new Error('until timed out');
    await new Promise((r) => setTimeout(r, 50));
  }
};
const marks = (page) => page.evaluate(() => (CSS.highlights.get('tirai-mask') || { size: 0 }).size);

test('page.js covers the viewport, masks the OTP and cleans up', async () => {
  const { browser } = await launch({ install: false });
  try {
    const page = await openFixture(browser, 'https://example.com/', 'blank.html');
    await page.evaluate(() => { globalThis.__tiraiSettings = {}; globalThis.__tiraiShortcut = 'Alt+Shift+Z'; });
    await loadModules(page, PAGE_JS);
    const info = await waitForState(page, (i) => i.present && i.tiles.length > 0);
    const area = info.tiles.reduce((a, t) => a + t.w * t.h, 0);
    assert.equal(area, 1280 * 800);
    assert.ok(info.pill.includes('Alt+Shift+Z'), info.pill);
    await until(async () => (await marks(page)) >= 1);

    // loading it again does not stack a second curtain
    await loadModules(page, ['content/page.js']);
    assert.equal(await page.evaluate(() => document.querySelectorAll('tirai-curtain').length), 1);

    await page.evaluate(() => globalThis.__tiraiPage.destroy());
    assert.equal((await curtainInfo(page)).present, false);
    assert.equal(await marks(page), 0);
    assert.equal(await page.evaluate(() => globalThis.__tiraiPage), undefined);
    await page.close();
  } finally { await browser.close(); }
});

test('togglePageCurtain covers, uncovers and refuses chrome pages', async () => {
  const dir = copyExtension({ hostPermissions: ['https://example.com/*'] });
  const { browser, worker } = await launch({ extensionDir: dir });
  try {
    const page = await openFixture(browser, 'https://example.com/', 'blank.html');
    const tabId = await worker.evaluate(async () => (await chrome.tabs.query({ url: 'https://example.com/*' }))[0].id);
    assert.deepEqual(await worker.evaluate((id) => togglePageCurtain(id), tabId), { ok: true, active: true });
    await waitForState(page, (i) => i.present && i.tiles.length > 0);
    await until(async () => (await marks(page)) >= 1);
    await page.mouse.move(100, 60);
    await page.bringToFront();
    await new Promise((r) => setTimeout(r, 400));
    await shot(page, 'page-curtain');

    assert.deepEqual(await worker.evaluate((id) => togglePageCurtain(id), tabId), { ok: true, active: false });
    assert.equal((await curtainInfo(page)).present, false);

    const known = await worker.evaluate(async () => (await chrome.tabs.query({})).map((t) => t.id));
    const chromePage = await browser.newPage();
    await chromePage.goto('chrome://version');
    const cid = await worker.evaluate(async (known) => (await chrome.tabs.query({})).find((t) => !known.includes(t.id)).id, known);
    const res = await worker.evaluate((id) => togglePageCurtain(id), cid);
    assert.equal(res.ok, false);
    assert.equal(typeof res.reason, 'string');
  } finally { await browser.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
