const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { launch, openFixture, waitForState, shot } = require('./harness');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, timeout = 3000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() >= deadline) throw new Error('until timed out');
    await sleep(50);
  }
}
const getSettings = (worker) => worker.evaluate(async () => (await chrome.storage.local.get('settings')).settings);
const reset = (worker, patch = {}) => worker.evaluate(async (patch) => {
  await chrome.storage.local.set({ settings: Tirai.settings.normalize(patch) });
}, patch);
const tabIdOf = (worker, url) => worker.evaluate(async (url) => (await chrome.tabs.query({ url }))[0].id, url);

async function openPopup(browser, extensionId, tabId) {
  const page = await browser.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup/popup.html?tabId=${tabId}`);
  await page.waitForSelector('#status:not(:empty)');
  return page;
}

async function suite(lang, shotName) {
  const { browser, extensionId, worker } = await launch({ args: lang ? ['--lang=' + lang] : [] });
  try {
    await until(() => worker.evaluate(async () => !!(await chrome.storage.local.get('settings')).settings), 5000);
    await reset(worker);
    const wa = await openFixture(browser, 'https://web.whatsapp.com/', 'whatsapp.html');
    await waitForState(wa, (i) => i.state && i.state.mode === 'normal');
    const waId = await tabIdOf(worker, 'https://web.whatsapp.com/*');
    const popup = await openPopup(browser, extensionId, waId);
    await sleep(300); // let the 150 ms transitions finish
    await shot(popup, shotName);
    return { browser, extensionId, worker, wa, waId, popup };
  } catch (e) { await browser.close(); throw e; }
}

test.describe('popup', () => {
  let ctx;
  before(async () => { ctx = await suite('', 'popup-en'); });
  after(async () => { if (ctx) await ctx.browser.close(); });
  beforeEach(() => ctx.popup.bringToFront()); // a hidden tab does not respond

  test('mode radio reflects settings and drives the fixture', async () => {
    const { popup, wa, worker } = ctx;
    assert.equal(await popup.$eval('input[name=mode][value=normal]', (e) => e.checked), true);
    assert.equal(await popup.$eval('#status', (e) => e.textContent), 'Active on WhatsApp Web');
    await popup.click('label[for=mode-full]');
    await until(async () => (await getSettings(worker)).mode === 'full');
    await wa.bringToFront(); // a hidden tab does not paint
    await waitForState(wa, (i) => i.state.mode === 'full');
    await popup.bringToFront();
    await reset(worker);
  });

  test('chat rule section shows the open chat and saves the rule', async () => {
    const { popup, worker } = ctx;
    assert.match(await popup.$eval('#chat', (e) => e.textContent), /Budi Santoso/);
    await popup.click('label[for=rule-hide]');
    await until(async () => (await getSettings(worker)).chats['Budi Santoso'] === 'hide');
    await popup.click('label[for=rule-auto]');
    await until(async () => !('Budi Santoso' in (await getSettings(worker)).chats));
  });

  test('unfocus switch persists after reopening', async () => {
    const { browser, extensionId, popup, worker, waId } = ctx;
    await popup.click('#unfocus');
    await until(async () => (await getSettings(worker)).auto.unfocus === true);
    const again = await openPopup(browser, extensionId, waId);
    assert.equal(await again.$eval('#unfocus', (e) => e.checked), true);
    assert.equal(await again.$eval('#unfocus', (e) => e.getAttribute('role')), 'switch');
    await again.close();
  });

  test('every input has a label and every button has a name', async () => {
    const { popup } = ctx;
    const bad = await popup.evaluate(() => [
      ...[...document.querySelectorAll('input')].filter((i) => !i.labels.length).map((i) => i.id || i.name),
      ...[...document.querySelectorAll('button')].filter((b) => !(b.textContent.trim() || b.getAttribute('aria-label'))).map((b) => b.id),
    ]);
    assert.deepEqual(bad, []);
  });

  test('layout fits 360px wide with no horizontal scroll', async () => {
    const { popup } = ctx;
    const m = await popup.evaluate(() => ({ w: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    assert.ok(m.w <= Math.max(m.cw, 360), JSON.stringify(m));
  });

  test('a non-WhatsApp tab shows the other-tab status and no chat section', async () => {
    const { browser, extensionId, worker } = ctx;
    await openFixture(browser, 'https://example.com/', 'blank.html');
    // Without host permission the tab's url is hidden, so find it as the tab with no url.
    const id = await worker.evaluate(async () => (await chrome.tabs.query({})).find((t) => !t.url).id);
    const p = await openPopup(browser, extensionId, id);
    assert.match(await p.$eval('#status', (e) => e.textContent), /^Tirai works automatically on WhatsApp Web/);
    assert.equal(await p.$eval('#chat', (e) => e.offsetParent === null), true);
    await p.close();
  });

  test('dark screenshot', async () => {
    const { popup } = ctx;
    await popup.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
    await sleep(300);
    await shot(popup, 'popup-dark');
    await popup.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  });
});

test('popup in Indonesian', async () => {
  const c = await suite('id', 'popup-id');
  try {
    const status = await c.popup.$eval('#status', (e) => e.textContent);
    assert.equal(status, 'Aktif di WhatsApp Web');
    assert.equal(await c.popup.$eval('html', (e) => e.lang.slice(0, 2)), 'id');
  } finally { await c.browser.close(); }
});
