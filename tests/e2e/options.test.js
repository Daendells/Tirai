const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { launch, EXT_DIR, shot } = require('./harness');

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

// Headless leaves the shortcut keys unset, so `keys` stands in for chrome.commands.getAll before the page runs.
async function openOptions(browser, extensionId, hash = '', keys = null) {
  const page = await browser.newPage();
  if (keys) await page.evaluateOnNewDocument((k) => { chrome.commands.getAll = async () => k; }, keys);
  await page.setViewport({ width: 900, height: 1000 });
  await page.goto(`chrome-extension://${extensionId}/options/options.html${hash}`);
  await page.waitForSelector('#blur');
  return page;
}

const KEYS = [{ name: 'toggle-full', shortcut: 'Alt+Shift+Z' }, { name: 'toggle-off', shortcut: 'Alt+Shift+X' }];

test.describe('options', () => {
  let browser, extensionId, worker, page;
  before(async () => {
    ({ browser, extensionId, worker } = await launch());
    await until(() => worker.evaluate(async () => !!(await chrome.storage.local.get('settings')).settings), 5000);
    await reset(worker);
    page = await openOptions(browser, extensionId);
  });
  after(async () => { await browser.close(); });

  test('one h1, sections with an h2, and every control is labelled', async () => {
    assert.equal(await page.$$eval('h1', (l) => l.length), 1);
    assert.equal(await page.$eval('h1', (e) => e.textContent), 'Tirai settings');
    assert.deepEqual(await page.$$eval('section:not([hidden]) > h2', (l) => l.map((e) => e.textContent)),
      ['Look', 'Sensitive data', 'Automatic', 'Chat rules', 'Shortcuts', 'Privacy']);
    const unlabelled = await page.$$eval('input', (l) => l.filter((i) => !(i.labels && i.labels.length) && !i.getAttribute('aria-label')).map((i) => i.id));
    assert.deepEqual(unlabelled, []);
    assert.equal(await page.$eval('#welcome', (e) => e.hidden), true);
    for (const id of ['lamp', 'sensitive', 'share', 'idle', 'idleSeconds']) {
      assert.ok(await page.$eval('#' + id, (e) => Boolean(e.getAttribute('aria-describedby'))), id);
    }
    assert.equal(await page.$eval('#share', (e) => e.getAttribute('role')), 'switch');
  });

  test('blur range saves and shows its value', async () => {
    await page.$eval('#blur', (e) => { e.value = 20; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); });
    await until(async () => (await getSettings(worker)).blurPx === 20);
    assert.equal(await page.$eval('#blurValue', (e) => e.textContent), '20 px');
    assert.match(await page.$eval('#frost', (e) => getComputedStyle(e).backdropFilter), /blur\(20px\)/);
  });

  test('lamp range saves and the preview follows the mouse', async () => {
    await page.$eval('#lamp', (e) => { e.value = 100; e.dispatchEvent(new Event('change', { bubbles: true })); });
    await until(async () => (await getSettings(worker)).lampPx === 100);
    assert.equal(await page.$eval('#lampValue', (e) => e.textContent), '100 px');
    const box = await (await page.$('#preview')).boundingBox();
    assert.equal(Math.round(box.width), 320);
    assert.equal(Math.round(box.height), 140);
    await page.mouse.move(box.x + 100, box.y + 70);
    assert.match(await page.$eval('#frost', (e) => e.style.maskImage || e.style.webkitMaskImage), /linear-gradient/);
    await page.mouse.move(box.x + 500, box.y + 400);
    // Away from the box the lamp rests in the centre, so the clear band is always visible.
    const band = async () => {
      const m = await page.$eval('#frost', (e) => e.style.maskImage);
      const px = [...m.matchAll(/transparent ([\d.]+)px, transparent ([\d.]+)px/g)][0];
      return px ? Number(px[2]) - Number(px[1]) : 0;
    };
    await until(async () => (await band()) === 70 + 30); // lamp is 100 px, centred at y 70, clamped to the box
    await page.$eval('#lamp', (e) => { e.value = 60; e.dispatchEvent(new Event('input', { bubbles: true })); });
    assert.equal(await band(), 60);
    assert.match(await page.$eval('#frost', (e) => e.style.maskImage), /transparent/);
  });

  test('sensitive switch and type checkboxes save', async () => {
    await page.click('#type-email');
    await until(async () => (await getSettings(worker)).sensitive.types.email === true);
    await page.click('#sensitive');
    await until(async () => (await getSettings(worker)).sensitive.enabled === false);
    assert.equal(await page.$eval('label[for=type-nik]', (e) => e.textContent), 'ID numbers (NIK, NPWP)');
    assert.equal(await page.$$eval('.types input', (l) => l.length), 6);
    await page.click('#sensitive');
    await until(async () => (await getSettings(worker)).sensitive.enabled === true);
  });

  test('idle seconds are normalised on change and shown', async () => {
    await page.click('#idleSeconds', { clickCount: 3 });
    await page.keyboard.type('5');
    await page.keyboard.press('Tab');
    await until(async () => (await getSettings(worker)).auto.idleSeconds === 15);
    assert.equal(await page.$eval('#idleSeconds', (e) => e.value), '15');
    await page.click('#idleSeconds', { clickCount: 3 });
    await page.keyboard.type('900');
    await page.keyboard.press('Tab');
    await until(async () => (await getSettings(worker)).auto.idleSeconds === 600);
    assert.equal(await page.$eval('#idleSeconds', (e) => e.value), '600');
  });

  test('unfocus and idle switches save', async () => {
    await page.click('#unfocus');
    await until(async () => (await getSettings(worker)).auto.unfocus === true);
    await page.click('#idle');
    await until(async () => (await getSettings(worker)).auto.idle === true);
  });

  test('share switch: refusal puts it back and says why', async () => {
    await page.evaluate(() => { chrome.permissions.request = async () => false; });
    await page.click('#share');
    await page.waitForFunction(() => !document.getElementById('shareDenied').hidden);
    assert.equal(await page.$eval('#share', (e) => e.checked), false);
    assert.equal(await page.$eval('#share', (e) => e.disabled), false);
    assert.equal(await page.$eval('#share', (e) => e.hasAttribute('aria-busy')), false);
    assert.equal((await getSettings(worker)).auto.share, false);
  });

  test('share switch: a granted permission turns it on', async () => {
    await page.evaluate(() => { chrome.permissions.request = async () => true; });
    await page.click('#share');
    await until(async () => (await getSettings(worker)).auto.share === true);
    assert.equal(await page.$eval('#shareDenied', (e) => e.hidden), true);
    await page.click('#share');
    await until(async () => (await getSettings(worker)).auto.share === false);
  });

  test('chat rules list renders, deletes, and follows outside changes', async () => {
    assert.equal(await page.$eval('#rulesEmpty', (e) => e.hidden), false);
    await reset(worker, { chats: { Mama: 'hide', Kantor: 'show', '<b>x</b>': 'hide' } });
    await until(() => page.$$eval('#rules li', (l) => l.length === 3));
    const rows = await page.$$eval('#rules li', (l) => l.map((e) => e.textContent));
    assert.ok(rows.some((r) => r.includes('Mama · Always hide')), rows.join());
    assert.ok(rows.some((r) => r.includes('Kantor · Always show')), rows.join());
    assert.equal(await page.$$eval('#rules b', (l) => l.length), 0);
    assert.equal(await page.$eval('#rulesEmpty', (e) => e.hidden), true);
    await page.click('#rules button[aria-label="Remove Mama"]');
    await until(async () => !('Mama' in (await getSettings(worker)).chats));
    await page.click('#rules button[aria-label="Remove <b>x</b>"]');
    await until(async () => Object.keys((await getSettings(worker)).chats).join() === 'Kantor');
    await until(() => page.$$eval('#rules li', (l) => l.length === 1));
    await page.click('#rules button');
    await until(() => page.$eval('#rulesEmpty', (e) => !e.hidden));
  });

  test('shortcuts show the real keys', async () => {
    const p = await openOptions(browser, extensionId, '', KEYS);
    await p.waitForFunction(() => document.getElementById('keyFull').textContent === 'Alt+Shift+Z');
    assert.equal(await p.$eval('#keyOff', (e) => e.textContent), 'Alt+Shift+X');
    await p.close();
    assert.equal(await page.$eval('#keyFull', (e) => e.textContent), 'not set');
    assert.equal(await page.$eval('#editShortcuts', (e) => e.textContent), 'Change shortcuts');
  });

  test('privacy notes are present', async () => {
    const t = await page.$eval('#privacy', (e) => e.textContent);
    assert.match(t, /sends nothing over the internet/);
    assert.match(t, /App Lock/);
  });

  test('#welcome shows the welcome section with the real shortcut and opens WhatsApp', async () => {
    const w = await openOptions(browser, extensionId, '#welcome', KEYS);
    assert.equal(await w.$eval('#welcome', (e) => e.hidden), false);
    assert.equal(await w.$eval('#welcome h2', (e) => e.textContent), 'Tirai is ready');
    await w.waitForFunction(() => /Press Alt\+Shift\+Z to cover/.test(document.getElementById('welcomeBody2').textContent));
    await shot(w, 'options-welcome');
    const opened = new Promise((r) => browser.once('targetcreated', r));
    await w.click('#openWhatsApp');
    const target = await opened;
    await until(() => target.url().startsWith('https://web.whatsapp.com/'), 5000);
    await w.close();
  });

  test('welcome without a shortcut points to Shortcuts instead of naming a key', async () => {
    const w = await openOptions(browser, extensionId, '#welcome');
    await w.waitForFunction(() => /set a shortcut under Shortcuts below/.test(document.getElementById('welcomeBody2').textContent));
    assert.doesNotMatch(await w.$eval('#welcomeBody2', (e) => e.textContent), /not set/);
    await w.close();
  });

  test('a range being dragged is not rewritten by its own save', async () => {
    await page.focus('#lamp');
    await page.$eval('#lamp', (e) => { e.value = 90; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.$eval('#lamp', (e) => { e.value = 95; e.dispatchEvent(new Event('input', { bubbles: true })); });
    await until(async () => (await getSettings(worker)).lampPx === 90);
    await sleep(200);
    assert.equal(await page.$eval('#lamp', (e) => e.value), '95');
    await page.$eval('#lamp', (e) => e.blur());
  });

  test('screenshots', async () => {
    await reset(worker, { chats: { Mama: 'hide', Kantor: 'show' } });
    await page.bringToFront();
    await page.setViewport({ width: 900, height: 1800 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(400);
    await shot(page, 'options-en');
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
    await sleep(300);
    await shot(page, 'options-dark');
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  });
});

test('Indonesian labels and screenshot', async () => {
  const { browser, extensionId, worker } = await launch({ args: ['--lang=id'] });
  try {
    await until(() => worker.evaluate(async () => !!(await chrome.storage.local.get('settings')).settings), 5000);
    await reset(worker, { chats: { Mama: 'hide', Kantor: 'show' } });
    const page = await openOptions(browser, extensionId);
    await page.setViewport({ width: 900, height: 1800 });
    await page.waitForSelector('#rules li');
    assert.equal(await page.$eval('h1', (e) => e.textContent), 'Pengaturan Tirai');
    assert.deepEqual(await page.$$eval('#rules button', (l) => l.map((e) => e.getAttribute('aria-label')).sort()), ['Hapus Kantor', 'Hapus Mama']);
    await sleep(400);
    await shot(page, 'options-id');
  } finally { await browser.close(); }
});

test('first install opens the welcome page in a new tab', async () => {
  const { browser } = await launch({ install: false });
  try {
    const seen = new Promise((resolve) => browser.on('targetcreated', (t) => {
      if (t.url().includes('/options/options.html#welcome')) resolve(t.url());
    }));
    await browser.installExtension(EXT_DIR);
    const url = await Promise.race([seen, sleep(8000).then(() => null)]);
    assert.ok(url, 'welcome tab was not opened');
    assert.match(url, /^chrome-extension:\/\/[a-p]{32}\/options\/options\.html#welcome$/);
  } finally { await browser.close(); }
});
