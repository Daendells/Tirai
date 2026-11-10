const { test } = require('node:test');
const assert = require('node:assert/strict');
const { launch, openFixture, loadModules, curtainInfo, waitForState } = require('./harness');
const { CONTENT_JS } = require('../../extension/shared/files.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const area = (tiles) => tiles.reduce((s, t) => s + t.w * t.h, 0);
const marks = (page) => page.evaluate(() => (CSS.highlights.get('tirai-mask') || { size: 0 }).size);

// whatsapp.js in a plain page, with a hand-made `chrome` whose storage read and extension id the test controls.
// That is the only way to lose the extension context on purpose: a real reload unloads the test extension for good.
async function withStubbedExtension({ read = () => Promise.resolve({}) } = {}, fn) {
  const { browser } = await launch({ install: false });
  try {
    const page = await openFixture(browser, 'https://web.whatsapp.com/', 'whatsapp.html');
    await page.evaluate((readSrc) => {
      const none = { addListener() {}, removeListener() {} };
      window.stub = {
        runtime: { id: 'test-extension', onMessage: none },
        i18n: { getMessage: (k) => k },
        storage: { onChanged: none, local: { get: () => eval('(' + readSrc + ')')() }, session: { get: () => Promise.resolve({}) } },
      };
      Object.defineProperty(window, 'chrome', { configurable: true, value: window.stub });
    }, read.toString());
    await loadModules(page, CONTENT_JS);
    await fn(page);
    await page.close();
  } finally { await browser.close(); }
}
const touch = (page) => page.evaluate(() => document.body.append(document.createElement('i')));

test('until the stored settings are read, the whole window is covered', async () => {
  const read = () => new Promise((r) => setTimeout(() => r({ settings: { mode: 'off' } }), 900));
  await withStubbedExtension({ read }, async (page) => {
    const first = await waitForState(page, (i) => i.present && i.tiles.length > 0, 600);
    assert.equal(first.state.health, 'fallback');
    assert.equal(area(first.tiles), 1280 * 800);
    // Once the read settles the stored mode applies: off covers nothing.
    await waitForState(page, (i) => i.state.mode === 'off' && i.tiles.length === 0, 2000);
  });
});

test('when the extension is lost the curtain and masks stay for 5 s, then go', async () => {
  await withStubbedExtension({}, async (page) => {
    const before = await waitForState(page, (i) => i.state && i.state.mode === 'normal' && i.state.masks === 3, 2000);
    assert.equal(await marks(page), 3);
    await page.evaluate(() => { window.stub.runtime.id = undefined; });
    await touch(page);
    await sleep(1500);
    const frozen = await curtainInfo(page);
    assert.equal(frozen.present, true);
    assert.equal(area(frozen.tiles), area(before.tiles));
    assert.equal(await marks(page), 3);
    await waitForState(page, (i) => !i.present, 4500);
    assert.equal(await marks(page), 0);
  });
});

test('a newer instance replaces a frozen one at once', async () => {
  await withStubbedExtension({}, async (page) => {
    await waitForState(page, (i) => i.state && i.state.mode === 'normal');
    await page.evaluate(() => { window.stub.runtime.id = undefined; });
    await touch(page);
    await sleep(300);
    assert.equal((await curtainInfo(page)).present, true);
    await page.evaluate(() => { document.documentElement.dataset.tiraiInstance = 'newer'; });
    await waitForState(page, (i) => !i.present, 500);
    assert.equal(await marks(page), 0);
  });
});

test('a frozen curtain no longer follows the page', async () => {
  await withStubbedExtension({}, async (page) => {
    await waitForState(page, (i) => i.state && i.state.mode === 'normal');
    await page.evaluate(() => { window.stub.runtime.id = undefined; });
    await touch(page);
    await sleep(300);
    const tilesBefore = (await curtainInfo(page)).tiles;
    await page.setViewport({ width: 1000, height: 700 });
    await sleep(600);
    assert.deepEqual((await curtainInfo(page)).tiles, tilesBefore);
  });
});
