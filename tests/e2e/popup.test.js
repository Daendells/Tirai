const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { launch, openFixture, waitForState, setSettings, setLive, shot } = require('./harness');

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

// 360 wide, nothing scrolls sideways and no text is clipped.
async function assertFits(popup) {
  await popup.setViewport({ width: 360, height: 800 });
  const r = await popup.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    clipped: [...document.querySelectorAll('label, legend, button, dt, kbd, h1, p')]
      .filter((e) => e.scrollWidth > e.clientWidth).map((e) => e.id || e.textContent.slice(0, 30)),
  }));
  assert.ok(r.scroll <= 360, 'scrollWidth ' + r.scroll);
  assert.deepEqual(r.clipped, []);
}

const tabIds = (worker) => worker.evaluate(async () => (await chrome.tabs.query({})).map((t) => t.id));
const statusOf = async (browser, extensionId, tabId) => {
  const p = await openPopup(browser, extensionId, tabId);
  try { return await p.$eval('#status', (e) => e.textContent); } finally { await p.close(); }
};

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

  // chrome.permissions.request shows a prompt that automation cannot accept, so the page's own copy of the call is
  // replaced with a stub that answers for the user. Registering the scripts and saving the setting stay real.
  test('share switch: a refused permission puts it back and says why', async () => {
    const { popup, worker } = ctx;
    assert.equal(await popup.$eval('#share', (e) => e.checked), false);
    assert.equal(await popup.$eval('#share', (e) => e.getAttribute('role')), 'switch');
    assert.equal(await popup.$eval('label[for=share]', (e) => e.textContent), 'Cover everything while I share my screen');
    assert.match(await popup.$eval('#shareHelp', (e) => e.textContent), /^Works with Google Meet, Zoom, Teams/);
    assert.equal(await popup.$eval('#shareHelp', (e) => e.offsetParent !== null), true);
    assert.equal(await popup.$eval('#shareDenied', (e) => e.hidden), true);
    await popup.evaluate(() => { chrome.permissions.request = async () => false; });
    await popup.click('#share');
    await popup.waitForFunction(() => !document.getElementById('shareDenied').hidden);
    assert.equal(await popup.$eval('#shareDenied', (e) => e.textContent), 'Permission was not given, so this stays off.');
    assert.equal(await popup.$eval('#share', (e) => e.checked), false);
    assert.equal(await popup.$eval('#share', (e) => e.disabled), false);
    assert.equal(await popup.$eval('#share', (e) => e.hasAttribute('aria-busy')), false);
    assert.match(await popup.$eval('#share', (e) => e.getAttribute('aria-describedby')), /shareDenied/);
    assert.equal((await getSettings(worker)).auto.share, false);
    assert.deepEqual(await worker.evaluate(() => chrome.scripting.getRegisteredContentScripts()), []);
    await shot(popup, 'popup-share-denied');
  });

  test('share switch: a granted permission turns it on, and clicking again turns it off', async () => {
    const { popup, worker } = ctx;
    await popup.evaluate(() => { chrome.permissions.request = async () => true; });
    await popup.click('#share');
    await until(async () => (await getSettings(worker)).auto.share === true);
    assert.equal(await popup.$eval('#share', (e) => e.checked), true);
    assert.equal(await popup.$eval('#shareDenied', (e) => e.hidden), true);
    assert.equal(await popup.$eval('#share', (e) => e.getAttribute('aria-describedby')), 'shareHelp');
    const ids = await worker.evaluate(async () => (await chrome.scripting.getRegisteredContentScripts()).map((s) => s.id));
    assert.deepEqual(ids.sort(), ['tirai-share-hook', 'tirai-share-relay']);
    await popup.click('#share');
    await until(async () => (await getSettings(worker)).auto.share === false);
    assert.equal(await popup.$eval('#share', (e) => e.checked), false);
    assert.deepEqual(await worker.evaluate(() => chrome.scripting.getRegisteredContentScripts()), []);
  });

  test('share switch: it keeps focus while the permission prompt is open, and a second click is ignored', async () => {
    const { popup, worker } = ctx;
    await popup.evaluate(() => {
      window.release = null;
      window.requests = 0;
      chrome.permissions.request = () => { window.requests++; return new Promise((r) => { window.release = r; }); };
    });
    await popup.click('#share');
    const busy = await popup.evaluate(() => ({
      focused: document.activeElement.id, busy: document.getElementById('share').getAttribute('aria-busy'),
      disabled: document.getElementById('share').disabled,
    }));
    assert.deepEqual(busy, { focused: 'share', busy: 'true', disabled: false });
    await popup.click('#share');
    assert.equal(await popup.evaluate(() => window.requests), 1);
    await popup.evaluate(() => window.release(false));
    await popup.waitForFunction(() => !document.getElementById('shareDenied').hidden);
    assert.equal(await popup.$eval('#share', (e) => e.checked), false);
    assert.equal(await popup.$eval('#share', (e) => e.hasAttribute('aria-busy')), false);
    assert.equal((await getSettings(worker)).auto.share, false);
  });

  test('share switch: turning it off shows no refusal message even when removing the permission fails', async () => {
    const { popup, worker } = ctx;
    await popup.evaluate(() => { chrome.permissions.request = async () => true; });
    await popup.click('#share');
    await until(async () => (await getSettings(worker)).auto.share === true);
    await popup.evaluate(() => { chrome.permissions.remove = async () => { throw new Error('required permission'); }; });
    await popup.click('#share');
    await until(async () => (await getSettings(worker)).auto.share === false);
    await popup.waitForFunction(() => !document.getElementById('share').hasAttribute('aria-busy'));
    assert.equal(await popup.$eval('#share', (e) => e.checked), false);
    assert.equal(await popup.$eval('#shareDenied', (e) => e.hidden), true);
    assert.deepEqual(await worker.evaluate(() => chrome.scripting.getRegisteredContentScripts()), []);
  });

  test('share switch and another switch changed at the same moment both stick', async () => {
    const { popup, worker } = ctx;
    await popup.evaluate(() => { chrome.permissions.request = async () => true; chrome.permissions.remove = async () => true; });
    await popup.evaluate(() => { document.getElementById('idle').click(); document.getElementById('share').click(); });
    await until(async () => { const a = (await getSettings(worker)).auto; return a.idle === true && a.share === true; });
    await popup.evaluate(() => { document.getElementById('idle').click(); document.getElementById('share').click(); });
    await until(async () => { const a = (await getSettings(worker)).auto; return a.idle === false && a.share === false; });
  });

  test('every input has a label and every button has a name', async () => {
    const { popup } = ctx;
    const bad = await popup.evaluate(() => [
      ...[...document.querySelectorAll('input')].filter((i) => !i.labels.length).map((i) => i.id || i.name),
      ...[...document.querySelectorAll('button')].filter((b) => !(b.textContent.trim() || b.getAttribute('aria-label'))).map((b) => b.id),
    ]);
    assert.deepEqual(bad, []);
  });

  test('layout fits 360px wide with nothing clipped', async () => {
    await assertFits(ctx.popup);
    await ctx.popup.setViewport({ width: 1280, height: 800 });
  });

  test('shortcuts show a key or the unset text in a kbd', async () => {
    const keys = await ctx.popup.$$eval('kbd', (k) => k.map((e) => e.textContent));
    assert.equal(keys.length, 2);
    assert.ok(keys.every((k) => k.length > 0));
    // Headless leaves the keys unset, so paint sample keys for a visual check only.
    await ctx.popup.$$eval('kbd', (k) => { k[0].textContent = 'Alt+Shift+Z'; k[1].textContent = 'Alt+Shift+X'; });
    await sleep(200);
    await shot(ctx.popup, 'popup-keys');
  });

  test('a non-WhatsApp tab shows the other-tab status and no chat section', async () => {
    const { browser, extensionId, worker } = ctx;
    const before = await tabIds(worker);
    await openFixture(browser, 'https://example.com/', 'blank.html');
    // Without host permission the tab's url is hidden, so find it as the one new tab.
    const id = (await tabIds(worker)).find((i) => !before.includes(i));
    const p = await openPopup(browser, extensionId, id);
    assert.match(await p.$eval('#status', (e) => e.textContent), /^Tirai works automatically on WhatsApp Web/);
    assert.equal(await p.$eval('#chat', (e) => e.offsetParent === null), true);
    await p.close();
  });

  test('a non-WhatsApp tab offers the page curtain and says when it cannot be added', async () => {
    const { browser, extensionId, worker, popup, waId } = ctx;
    const before = await tabIds(worker);
    await openFixture(browser, 'https://example.com/', 'blank.html');
    const id = (await tabIds(worker)).find((i) => !before.includes(i));
    const p = await openPopup(browser, extensionId, id);
    assert.equal(await p.$eval('#page', (e) => e.hidden), false);
    assert.equal(await p.$eval('#coverTab', (e) => e.textContent), 'Cover this tab');
    assert.equal(await p.$eval('#coverHelp', (e) => e.textContent), 'Lasts until the page reloads.');
    assert.equal(await p.$eval('#coverFailed', (e) => e.hidden), true);
    await assertFits(p);
    await p.click('#coverTab'); // no host permission or activeTab grant in automation, so the injection is refused
    await until(() => p.$eval('#coverFailed', (e) => !e.hidden));
    assert.equal(await p.$eval('#coverFailed', (e) => e.textContent), 'Tirai cannot cover this page.');
    await p.close();
    const wp = await openPopup(browser, extensionId, waId);
    assert.equal(await wp.$eval('#page', (e) => e.hidden), true);
    await wp.close();
    await popup.bringToFront();
  });

  test('dark screenshot', async () => {
    const { popup } = ctx;
    await popup.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
    await sleep(300);
    await shot(popup, 'popup-dark');
    await popup.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  });

  test('status names the reason when auto cover is on', async () => {
    const { browser, extensionId, worker, wa, waId } = ctx;
    await wa.bringToFront();
    await setSettings(worker, { auto: { ...(await getSettings(worker)).auto, unfocus: true } });
    await wa.evaluate(() => window.dispatchEvent(new Event('blur')));
    await waitForState(wa, (i) => i.state.reason === 'unfocus');
    assert.equal(await statusOf(browser, extensionId, waId), 'WhatsApp Web is covered while its window is not active');
    await wa.bringToFront();
    await wa.evaluate(() => window.dispatchEvent(new Event('focus')));
    await waitForState(wa, (i) => i.state.reason === 'user');

    await reset(worker, { auto: { idle: true } });
    await setLive(worker, { idle: 'locked' });
    await waitForState(wa, (i) => i.state.reason === 'idle');
    assert.equal(await statusOf(browser, extensionId, waId), 'WhatsApp Web is covered while you are away');
    await wa.bringToFront();
    await setLive(worker, { idle: 'active' });
    await reset(worker);
  });

  test('status when the page has no Tirai listening', async () => {
    const { browser, extensionId, worker, wa, waId } = ctx;
    await wa.bringToFront();
    // A different instance id makes the running content script destroy itself and drop its message listener,
    // which is what a tab opened before the extension was installed looks like to the popup.
    await wa.evaluate(() => { document.documentElement.dataset.tiraiInstance = 'stale'; });
    await waitForState(wa, (i) => !i.present);
    assert.match(await statusOf(browser, extensionId, waId), /^Reload WhatsApp Web/);
  });

  test('status for an unknown layout and for a logged-out page', async () => {
    const { browser, extensionId, worker } = ctx;
    for (const [fixture, text] of [['whatsapp-unknown.html', /^WhatsApp's layout was not recognised/], ['whatsapp-qr.html', /^Log in to WhatsApp Web first/]]) {
      const before = await tabIds(worker);
      const page = await openFixture(browser, 'https://web.whatsapp.com/', fixture);
      await waitForState(page, (i) => i.state && i.state.health);
      const id = (await tabIds(worker)).find((i) => !before.includes(i));
      assert.match(await statusOf(browser, extensionId, id), text);
      await page.close();
    }
  });

});

test('popup in Indonesian', async () => {
  const c = await suite('id', 'popup-id');
  try {
    const status = await c.popup.$eval('#status', (e) => e.textContent);
    assert.equal(status, 'Aktif di WhatsApp Web');
    assert.equal(await c.popup.$eval('html', (e) => e.lang.slice(0, 2)), 'id');
    await assertFits(c.popup);
  } finally { await c.browser.close(); }
});
