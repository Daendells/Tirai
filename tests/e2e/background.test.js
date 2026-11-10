const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { EXT_DIR, launch, openFixture, curtainInfo, waitForState } = require('./harness');

const URL = 'https://web.whatsapp.com/';
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

async function reset(worker, patch = {}) {
  await worker.evaluate(async (patch) => {
    await chrome.storage.local.set({ settings: Tirai.settings.normalize(patch) });
    await chrome.storage.session.set({ live: { sharing: false, idle: 'active', sharingTabs: {} } });
  }, patch);
}

async function tabIdOf(worker) {
  return worker.evaluate(async () => (await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' }))[0].id);
}

const badge = (worker) => worker.evaluate(async () => ({
  text: await chrome.action.getBadgeText({}),
  title: await chrome.action.getTitle({}),
}));

test.describe('commands, badge, idle', () => {
  let browser, worker, page, tabId;

  before(async () => {
    ({ browser, worker } = await launch());
    await until(() => worker.evaluate(async () => !!(await chrome.storage.local.get('settings')).settings), 5000);
    await reset(worker);
    page = await openFixture(browser, URL, 'whatsapp.html');
    await waitForState(page, (i) => i.state && i.state.mode === 'normal');
    tabId = await tabIdOf(worker);
  });
  after(async () => { if (browser) await browser.close(); });

  const command = (name) => worker.evaluate((c, id) => handleCommand(c, { id, url: 'https://web.whatsapp.com/' }), name, tabId);

  test('toggle-full switches between full and normal and the badge follows', async () => {
    await reset(worker);
    await waitForState(page, (i) => i.state.mode === 'normal');
    await command('toggle-full');
    assert.equal((await getSettings(worker)).mode, 'full');
    await waitForState(page, (i) => i.state.mode === 'full');
    await until(async () => (await badge(worker)).text === '●');
    assert.equal((await badge(worker)).title, 'Tirai: Full');
    await command('toggle-full');
    assert.equal((await getSettings(worker)).mode, 'normal');
    await waitForState(page, (i) => i.state.mode === 'normal');
    await until(async () => (await badge(worker)).text === '');
    assert.equal((await badge(worker)).title, 'Tirai: Normal');
  });

  test('toggle-off turns off, then back to the last on mode', async () => {
    await reset(worker);
    await command('toggle-off');
    assert.equal((await getSettings(worker)).mode, 'off');
    await waitForState(page, (i) => i.state.mode === 'off');
    await until(async () => (await badge(worker)).text === 'off');
    assert.equal((await badge(worker)).title, 'Tirai: off');
    await command('toggle-off');
    assert.equal((await getSettings(worker)).mode, 'normal');
    await waitForState(page, (i) => i.state.mode === 'normal');
  });

  test('publishes the shortcuts as strings', async () => {
    await worker.evaluate(() => publishShortcuts());
    const shortcuts = await worker.evaluate(async () => (await chrome.storage.session.get('shortcuts')).shortcuts);
    assert.equal(typeof shortcuts.toggleFull, 'string');
    assert.equal(typeof shortcuts.toggleOff, 'string');
  });

  test('a locked screen covers the chats when auto idle is on, and keeps the other live fields', async () => {
    await reset(worker, { auto: { idle: true } });
    await worker.evaluate(() => onIdleState('locked'));
    const info = await waitForState(page, (i) => i.state.reason === 'idle');
    assert.equal(info.state.mode, 'full');
    const live = await worker.evaluate(async () => (await chrome.storage.session.get('live')).live);
    assert.equal(live.idle, 'locked');
    assert.equal(live.sharing, false);
    await worker.evaluate(() => onIdleState('active'));
    await waitForState(page, (i) => i.state.reason !== 'idle');
  });
});

test('injects into an already open tab on install', async () => {
  const { browser } = await launch({ install: false });
  try {
    const page = await openFixture(browser, URL, 'whatsapp.html');
    assert.equal((await curtainInfo(page)).present, false);
    await browser.installExtension(EXT_DIR);
    const info = await waitForState(page, (i) => i.state && i.state.mode === 'normal', 3000);
    assert.ok(info.tiles.length > 0);
  } finally {
    await browser.close();
  }
});

// chrome.runtime.reload() unloads an extension launched through puppeteer and never loads it again, so a reload
// is stood in for by uninstalling and installing the same folder.
test('after a reinstall there is exactly one curtain', async () => {
  const { browser, extensionId } = await launch();
  try {
    const page = await openFixture(browser, URL, 'whatsapp.html');
    const first = await waitForState(page, (i) => i.state && i.state.mode === 'normal');
    assert.ok(first.tiles.length > 0);
    await browser.uninstallExtension(extensionId);
    await browser.installExtension(EXT_DIR);
    const info = await until(async () => {
      const i = await curtainInfo(page);
      return i.present && i.state && i.tiles.length > 0 ? i : null;
    }, 5000);
    await sleep(500);
    assert.equal(await page.evaluate(() => document.querySelectorAll('tirai-curtain').length), 1);
    assert.ok(info.tiles.length > 0);
  } finally {
    await browser.close();
  }
});

test('injecting again while a live instance exists leaves exactly one curtain', async () => {
  const { browser, worker } = await launch();
  try {
    await until(() => worker.evaluate(async () => !!(await chrome.storage.local.get('settings')).settings), 5000);
    const page = await openFixture(browser, URL, 'whatsapp.html');
    await waitForState(page, (i) => i.state && i.state.mode === 'normal');
    await worker.evaluate(() => injectIntoOpenWhatsAppTabs());
    await sleep(500);
    assert.equal(await page.evaluate(() => document.querySelectorAll('tirai-curtain').length), 1);
    assert.ok((await curtainInfo(page)).tiles.length > 0);
  } finally {
    await browser.close();
  }
});
