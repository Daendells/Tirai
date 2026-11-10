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

  test('20 toggle-full commands fired together end where 20 toggles would', async () => {
    await reset(worker);
    await worker.evaluate((id) => Promise.all(Array.from({ length: 20 },
      () => handleCommand('toggle-full', { id, url: 'https://web.whatsapp.com/' }))), tabId);
    const s = await getSettings(worker);
    assert.equal(s.mode, 'normal');
    assert.equal(s.lastOnMode, 'normal');
    await worker.evaluate((id) => Promise.all(Array.from({ length: 7 },
      () => handleCommand('toggle-full', { id, url: 'https://web.whatsapp.com/' }))), tabId);
    assert.equal((await getSettings(worker)).mode, 'full');
    await reset(worker);
  });

  test('share messages from two tabs and an idle change all survive in live', async () => {
    await reset(worker);
    await worker.evaluate(() => Promise.all([
      onShareMessage({ type: 'share', active: true, id: 'a' }, { tab: { id: 101 } }),
      onShareMessage({ type: 'share', active: true, id: 'b' }, { tab: { id: 102 } }),
      onIdleState('locked'),
      onShareMessage({ type: 'share', active: true, id: 'c' }, { tab: { id: 101 } }),
    ]));
    const live = () => worker.evaluate(async () => (await chrome.storage.session.get('live')).live);
    assert.deepEqual(await live(), { sharing: true, idle: 'locked', sharingTabs: { 101: ['a', 'c'], 102: ['b'] } });
    await worker.evaluate(() => Promise.all([
      onShareMessage({ type: 'share', active: false, id: 'a' }, { tab: { id: 101 } }),
      onShareMessage({ type: 'share', active: false, id: 'c' }, { tab: { id: 101 } }),
      clearShareTab(102),
    ]));
    assert.deepEqual(await live(), { sharing: false, idle: 'locked', sharingTabs: {} });
    await reset(worker);
  });

  test('share messages that are malformed or have no tab are ignored', async () => {
    await reset(worker);
    await worker.evaluate(() => Promise.all([
      onShareMessage({ type: 'share', active: 'yes', id: 'a' }, { tab: { id: 1 } }),
      onShareMessage({ type: 'share', active: true, id: 5 }, { tab: { id: 1 } }),
      onShareMessage({ type: 'share', active: true, id: 'a' }, {}),
      onShareMessage(null, { tab: { id: 1 } }),
    ]));
    const live = await worker.evaluate(async () => (await chrome.storage.session.get('live')).live);
    assert.deepEqual(live, { sharing: false, idle: 'active', sharingTabs: {} });
  });

  // publishShortcuts is a function declaration that start() calls, so replacing it on the global really makes
  // the startup path throw. (initSettings is a const, which a global assignment cannot replace.)
  test('install still injects into open WhatsApp tabs when an earlier startup step throws', async () => {
    const result = await worker.evaluate(async () => {
      const real = { publishShortcuts, injectIntoOpenWhatsAppTabs };
      let injected = 0;
      let startupFailed = false;
      globalThis.publishShortcuts = async () => { throw new Error('boom'); };
      globalThis.injectIntoOpenWhatsAppTabs = async () => { injected++; };
      try { await onInstalled({ reason: 'update' }); } catch { startupFailed = true; } finally { Object.assign(globalThis, real); }
      return { injected, startupFailed };
    });
    assert.deepEqual(result, { injected: 1, startupFailed: true });
  });

  test('on update and install the open WhatsApp tabs are injected before the startup steps run', async () => {
    const result = await worker.evaluate(async () => {
      const real = { publishShortcuts, injectIntoOpenWhatsAppTabs };
      const order = [];
      globalThis.publishShortcuts = async () => { order.push('start'); };
      globalThis.injectIntoOpenWhatsAppTabs = async () => { order.push('inject'); };
      try {
        await onInstalled({ reason: 'update' });
        const update = order.splice(0);
        await onInstalled({ reason: 'install' }).catch(() => {});
        return { update, install: order.slice(0, 2) };
      } finally { Object.assign(globalThis, real); }
    });
    assert.deepEqual(result, { update: ['inject', 'start'], install: ['inject', 'start'] });
  });

  // The popup is an extension page. A content script runs inside a web page, so the sender it carries is that page.
  test('togglePage and pageStatus are answered for extension pages and ignored for content scripts', async () => {
    const result = await worker.evaluate(async (tabId) => {
      const base = chrome.runtime.getURL('');
      const ask = (msg, sender) => new Promise((resolve) => {
        const answer = onPageMessage(msg, sender, resolve);
        if (answer !== true) resolve('ignored');
      });
      return {
        script: await ask({ type: 'pageStatus', tabId }, { id: chrome.runtime.id, tab: { id: tabId }, url: 'https://web.whatsapp.com/' }),
        scriptToggle: await ask({ type: 'togglePage', tabId }, { id: chrome.runtime.id, tab: { id: tabId }, url: 'https://web.whatsapp.com/' }),
        noSender: await ask({ type: 'pageStatus', tabId }, undefined),
        popup: (await ask({ type: 'pageStatus', tabId }, { id: chrome.runtime.id, url: base + 'popup/popup.html' })).ok,
      };
    }, tabId);
    assert.deepEqual(result, { script: 'ignored', scriptToggle: 'ignored', noSender: 'ignored', popup: true });
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
