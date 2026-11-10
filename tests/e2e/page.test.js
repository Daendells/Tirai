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

test('destroy() finishes the teardown even when a step throws', async () => {
  const { browser } = await launch({ install: false });
  try {
    const page = await openFixture(browser, 'https://example.com/', 'blank.html');
    await page.evaluate(() => { globalThis.__tiraiSettings = {}; });
    await loadModules(page, PAGE_JS.slice(0, -1));
    await page.evaluate(() => {
      const real = Tirai.masker.createMasker;
      Tirai.masker.createMasker = (o) => ({ ...real(o), stop() { throw new Error('boom'); } });
    });
    await loadModules(page, ['content/page.js']);
    await waitForState(page, (i) => i.present && i.tiles.length > 0);
    const threw = await page.evaluate(() => { try { globalThis.__tiraiPage.destroy(); return false; } catch { return true; } });
    assert.equal(threw, false);
    assert.equal((await curtainInfo(page)).present, false);
    assert.equal(await page.evaluate(() => globalThis.__tiraiPage), undefined);
    await page.close();
  } finally { await browser.close(); }
});

test('page.js does nothing, and leaves no curtain, in a document without a body', async () => {
  const { browser } = await launch({ install: false });
  try {
    const page = await openFixture(browser, 'https://example.com/', 'blank.html');
    await page.evaluate(() => { globalThis.__tiraiSettings = {}; document.body.remove(); });
    assert.equal(await page.evaluate(() => document.body), null);
    await loadModules(page, PAGE_JS);
    assert.equal((await curtainInfo(page)).present, false);
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

test('another site gets the settings without the contact names, and a page that cannot be covered says so', async () => {
  const dir = copyExtension({ hostPermissions: ['https://example.com/*'] });
  const { browser, worker } = await launch({ extensionDir: dir });
  try {
    await until(() => worker.evaluate(async () => !!(await chrome.storage.local.get('settings')).settings), 5000);
    await worker.evaluate(async () => {
      const s = Tirai.settings.normalize({ blurPx: 20, chats: { 'Budi Santoso': 'hide' } });
      await chrome.storage.local.set({ settings: s });
    });
    const page = await openFixture(browser, 'https://example.com/', 'blank.html');
    const tabId = await worker.evaluate(async () => (await chrome.tabs.query({ url: 'https://example.com/*' }))[0].id);
    const sent = await worker.evaluate(async (id) => {
      const real = chrome.scripting.executeScript;
      const args = [];
      chrome.scripting.executeScript = (o) => { if (o.args) args.push(o.args); return real.call(chrome.scripting, o); };
      try { await togglePageCurtain(id); } finally { chrome.scripting.executeScript = real; }
      return args;
    }, tabId);
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0][0].chats, {});
    assert.equal(sent[0][0].blurPx, 20);
    assert.equal(JSON.stringify(sent).includes('Budi'), false);
    await worker.evaluate((id) => togglePageCurtain(id), tabId); // off again

    await page.evaluate(() => document.body.remove());
    const res = await worker.evaluate((id) => togglePageCurtain(id), tabId);
    assert.equal(res.ok, false);
    assert.equal((await curtainInfo(page)).present, false);
  } finally { await browser.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
