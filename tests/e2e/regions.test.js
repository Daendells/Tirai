const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { launch, openFixture, loadModules } = require('./harness');

const URL = 'https://web.whatsapp.com/';
let browser;

before(async () => { ({ browser } = await launch({ install: false })); });
after(async () => { if (browser) await browser.close(); });

async function regionsOf(fixture, hideSelector) {
  const page = await openFixture(browser, URL, fixture);
  try {
    if (hideSelector) await page.addStyleTag({ content: `${hideSelector}{display:none !important}` });
    await loadModules(page, ['content/regions.js']);
    return await page.evaluate(() => {
      const r = Tirai.regions.findRegions();
      return { ...r, sideEl: !!r.sideEl, mainEl: !!r.mainEl, title: Tirai.regions.currentChatTitle() };
    });
  } finally {
    await page.close();
  }
}

const near = (rect, want) => {
  for (const k of ['x', 'y', 'w', 'h']) assert.ok(Math.abs(rect[k] - want[k]) <= 2, `${k}: ${rect[k]} vs ${want[k]}`);
};

test('whatsapp.html uses the ids', async () => {
  const r = await regionsOf('whatsapp.html');
  assert.equal(r.sideSource, 'side');
  near(r.side, { x: 64, y: 0, w: 420, h: 800 });
  assert.equal(r.mainSource, 'main');
  assert.ok(Math.abs(r.main.x - 484) <= 2);
  assert.equal(r.loggedIn, true);
  assert.equal(r.title, 'Budi Santoso');
  assert.ok(r.sideEl && r.mainEl);
});

test('whatsapp-noid.html falls back to the list and the compose box', async () => {
  const ref = await regionsOf('whatsapp.html');
  const r = await regionsOf('whatsapp-noid.html');
  assert.equal(r.sideSource, 'list');
  assert.equal(r.mainSource, 'compose');
  near(r.side, ref.side);
  near(r.main, ref.main);
  assert.equal(r.title, 'Budi Santoso');
});

test('whatsapp-nochat.html has a side but no main', async () => {
  const r = await regionsOf('whatsapp-nochat.html');
  assert.ok(r.side);
  assert.equal(r.main, null);
  assert.equal(r.title, null);
});

test('whatsapp-unknown.html finds nothing but is logged in', async () => {
  const r = await regionsOf('whatsapp-unknown.html');
  assert.equal(r.side, null);
  assert.equal(r.main, null);
  assert.equal(r.loggedIn, true);
});

test('whatsapp-qr.html finds nothing and is logged out', async () => {
  const r = await regionsOf('whatsapp-qr.html');
  assert.equal(r.side, null);
  assert.equal(r.main, null);
  assert.equal(r.loggedIn, false);
});

test('a hidden #side is treated as absent', async () => {
  const r = await regionsOf('whatsapp.html', '#side');
  assert.notEqual(r.sideSource, 'side');
  assert.ok(['list', 'left-of-main', 'pane-side'].includes(r.sideSource), r.sideSource);
  assert.ok(r.side && r.side.w > 0 && r.side.h > 0, JSON.stringify(r.side));
});

test('a hidden #main is treated as absent', async () => {
  const r = await regionsOf('whatsapp.html', '#main');
  assert.notEqual(r.mainSource, 'main');
  assert.equal(r.main, null);
  assert.equal(r.mainSource, null);
});

test('an unfamiliar layout with no QR code counts as logged in', async () => {
  const r = await regionsOf('whatsapp-chrome.html');
  assert.equal(r.side, null);
  assert.equal(r.main, null);
  assert.equal(r.loggedIn, true);
});

test('the QR screen is recognised by a data-ref container as well', async () => {
  const page = await openFixture(browser, URL, 'whatsapp-qr.html');
  try {
    await page.evaluate(() => {
      const c = document.querySelector('canvas');
      c.setAttribute('aria-label', 'code');
      c.parentElement.setAttribute('data-ref', '2@abc');
    });
    await loadModules(page, ['content/regions.js']);
    assert.equal(await page.evaluate(() => Tirai.regions.findRegions().loggedIn), false);
    await page.evaluate(() => document.querySelector('[data-ref]').removeAttribute('data-ref'));
    assert.equal(await page.evaluate(() => Tirai.regions.findRegions().loggedIn), true);
    await page.evaluate(() => document.querySelector('canvas').setAttribute('aria-label', 'Scan the qr code'));
    assert.equal(await page.evaluate(() => Tirai.regions.findRegions().loggedIn), false);
  } finally {
    await page.close();
  }
});

test('a compose box counts as logged in even next to a QR code', async () => {
  const page = await openFixture(browser, URL, 'whatsapp-qr.html');
  try {
    await loadModules(page, ['content/regions.js']);
    await page.evaluate(() => document.body.insertAdjacentHTML('beforeend', '<footer><div contenteditable="true"></div></footer>'));
    assert.equal(await page.evaluate(() => Tirai.regions.findRegions().loggedIn), true);
  } finally {
    await page.close();
  }
});
